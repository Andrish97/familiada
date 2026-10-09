// tests/e2e/polls.spec.js
// Weryfikuje pełny cykl życia ankiety (polls.js + poll-tally.js + poll-points.js/
// poll-text.js): utworzenie, zebranie głosów od anonimowych uczestników,
// Zatrzymaj -> Wznów -> Zatrzymaj -> Podlicz głosy -> Zatwierdź (stan GOTOWA),
// dla obu typów (poll_points, poll_text). Głosy rozkładają
// się nierówno (kilka popularnych odpowiedzi + długi ogon unikalnych)
// zamiast idealnie równo — bliżej realnego głosowania.
//
// Pierwsza próba tego testu (100 głosujących w pełni przez przeglądarkę,
// klikających/wpisujących przez UI po 10 pytań każdy) padała na timeout
// 10 minut DWA razy z rzędu — 100 realnych kontekstów przeglądarki idących
// sekwencyjnie przez cały formularz jest zbyt wolne dla CI. Rozwiązanie:
// tylko REAL_UI_VOTERS głosujących faktycznie klika/wpisuje przez prawdziwe
// UI (to sprawdza, że mechanizm głosowania w ogóle działa — powtarzanie
// tego samego deterministycznego kliknięcia więcej razy nic więcej by nie
// złapało) — reszta "setki" trafia bezpośrednio tym samym RPC, którego
// woła UI po kliknięciu ostatniej odpowiedzi (poll_points_vote_batch /
// poll_text_submit_batch, patrz submitBatch() w poll-points.js/
// poll-text.js), więc nadal są to prawdziwe głosy w prawdziwym backendzie
// (w tym realne równoległe obciążenie zapisu/zliczania głosów) — tylko
// bez kosztu renderowania dodatkowych kart przeglądarki.
//
// Drugi test skupia się na trybie podliczania ankiety tekstowej (karta Wyniki):
// literówki (auto-scalane przyciskiem "Scal identyczne"), ręczna korekta
// literówki w polu tekstowym, scalanie dwóch różnie nazwanych, ale znaczących
// to samo odpowiedzi (przeciągnięcie uchwytu .tcHandle) i szkic poprawek w bazie. Tu wszystkie
// głosy idą przez bezpośrednie RPC — przedmiotem testu jest panel, nie
// mechanika głosowania (tę sprawdza już pierwszy test).
//
// Ankieta wymaga min. 10 pytań, żeby "Uruchomić ankietę" było w ogóle
// klikalne (RULES.QN_MIN w js/core/game-validate.js) — pytania/odpowiedzi
// sadzimy bezpośrednio przez API (nie testujemy tu kreatora pytań),
// dokładnie tak jak w game-deletion.spec.js dla samej gry.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, instrumentPage } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

// Strona ankiety (/polls/) i wspólny kod front-endu z brancha — nowa strona
// (E11c) testowana przed wdrożeniem; baza i reszta stron z produkcji.
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["polls"] });
});

const QN_COUNT = 10; // RULES.QN_MIN
const TOTAL_VOTERS = 100;
const REAL_UI_VOTERS = 1; // jedno prawdziwe kliknięcie na typ ankiety wystarczy — reszta (99) głosuje bezpośrednim RPC, patrz komentarz na górze pliku

// Nierówny rozkład głosów zamiast idealnie równego — realniej odwzorowuje
// prawdziwe głosowanie (kilka popularnych opcji, nie identyczny podział).
const POINTS_WEIGHTS = [45, 30, 15, 10]; // suma = TOTAL_VOTERS, po jednej wadze na 4 predefiniowane odpowiedzi
const TEXT_POOL = ["Pizza", "Kotek", "Herbata", "Rower"];
const TEXT_WEIGHTS = [40, 30, 20, 10]; // suma = TOTAL_VOTERS

function weightedBucket(i, weights) {
  let acc = 0;
  for (let idx = 0; idx < weights.length; idx++) {
    acc += weights[idx];
    if (i < acc) return idx;
  }
  return weights.length - 1;
}

function normText(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function seedPollGame(page, type) {
  return await page.evaluate(async (type) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    const { data: game, error } = await sb
      .from("games")
      .insert({ name: `E2E-${type.toUpperCase()}-${Date.now()}`, owner_id: userId, type, status: "draft" })
      .select("id")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);

    const questions = [];
    for (let ord = 1; ord <= 10; ord++) {
      const { data: q, error: qErr } = await sb
        .from("questions")
        .insert({ game_id: game.id, ord, text: `Pytanie ${ord}` })
        .select("id")
        .single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);

      const question = { id: q.id, ord, answers: [] };

      if (type === "poll_points") {
        // AN_MIN..AN_MAX = 3..6 odpowiedzi na pytanie, wymagane przed otwarciem
        for (let a = 1; a <= 4; a++) {
          const { data: ans, error: aErr } = await sb
            .from("answers")
            .insert({ question_id: q.id, ord: a, text: `Odp ${ord}.${a}` })
            .select("id")
            .single();
          if (aErr) throw new Error("insert answers failed: " + aErr.message);
          question.answers.push({ id: ans.id, ord: a });
        }
      }

      questions.push(question);
    }

    return { userId, gameId: game.id, questions };
  }, type);
}

async function deleteGame(page, gameId) {
  await page.evaluate(async (id) => {
    await window.__sbClient.from("games").delete().eq("id", id);
  }, gameId);
}

async function getGameStatus(page, gameId) {
  return await page.evaluate(async (id) => {
    const { data } = await window.__sbClient.from("games").select("status").eq("id", id).single();
    return data?.status;
  }, gameId);
}

/** Strona /polls?id=... (właściciel). */
async function gotoOwnerPage(page, gameId) {
  await page.goto(`https://www.familiada.online/polls?id=${gameId}`, { waitUntil: "domcontentloaded" });
  // polls.js wiąże listenery dopiero po asynchronicznym requireAuth+initI18n+refresh
  // w handlerze DOMContentLoaded — ten sam wyścig co przy #btnPrimary na /login.
  await page.waitForLoadState("networkidle");
}

/** Stan paska stanu: draft | poll_open | poll_stopped | tally | ready. */
async function expectBarState(page, state, timeout = 60000) {
  await expect(page.locator("#pollBar")).toHaveAttribute("data-state", state, { timeout });
}

/** OK w confirmModalu (celujemy w klasę, nie w tekst: OK bywa „Zamknij” jak ✕ w nagłówku). */
async function confirmOk(page) {
  const ok = page.locator(".uni-foot .btn.gold");
  await expect(ok).toBeVisible({ timeout: 10000 });
  await ok.click({ timeout: 10000 });
}

/** Na stronie /polls?id=... — „Uruchom” w pasku stanu + potwierdzenie, zwraca link do głosowania. */
async function openPoll(page, gameId) {
  await gotoOwnerPage(page, gameId);
  await page.locator("#btnOpenPoll").click();
  await confirmOk(page);
  await expect(page.locator("#pollLink")).not.toHaveValue("", { timeout: 15000 });
  const link = await page.inputValue("#pollLink");
  const key = new URL(link).searchParams.get("key");
  return { link, key };
}

/** Zatrzymaj: pasek -> ZATRZYMANA, strona sama przechodzi na kartę Wyniki. */
async function stopPoll(page, gameId) {
  await expect(page.locator("#btnStopPoll")).toBeEnabled({ timeout: 60000 });
  await page.locator("#btnStopPoll").click();
  await confirmOk(page);
  await expectBarState(page, "poll_stopped");
  await expect(page.locator("#secResults")).toHaveClass(/active/);
  await expect.poll(() => getGameStatus(page, gameId), { timeout: 15000 }).toBe("poll_stopped");
}

/** Wznów głosowanie: pasek -> OTWARTA, ten sam link. */
async function resumePoll(page, gameId) {
  await page.locator("#btnResumePoll").click();
  await confirmOk(page);
  await expectBarState(page, "poll_open");
  await expect.poll(() => getGameStatus(page, gameId), { timeout: 15000 }).toBe("poll_open");
}

/** Podlicz głosy: wejście w tryb podliczania w karcie Wyniki. */
async function startTally(page) {
  await expect(page.locator("#btnTallyPoll")).toBeEnabled({ timeout: 60000 });
  await page.locator("#btnTallyPoll").click();
  await expectBarState(page, "tally");
  await expect(page.locator("#btnApproveTally")).toBeVisible();
}

/** Zatwierdź: potwierdzenie i status „ready”. */
async function approveTally(page, gameId) {
  await expect(page.locator("#btnApproveTally")).toBeEnabled({ timeout: 60000 });
  await page.locator("#btnApproveTally").click();
  await confirmOk(page);
  await expect.poll(() => getGameStatus(page, gameId), {
    timeout: 60000,
    message: "po zatwierdzeniu podliczania ankieta powinna mieć status 'ready'",
  }).toBe("ready");
  await expectBarState(page, "ready");
}

/** Ten sam RPC głosujący co UI; po zatrzymaniu baza ma go odrzucić. */
async function tryVote(page, rpcName, gameId, key, items) {
  return await page.evaluate(async ({ rpcName, gameId, key, items }) => {
    const { error } = await window.__sbClient.rpc(rpcName, {
      p_game_id: gameId, p_key: key, p_voter_token: `e2e-late-${Date.now()}`, p_items: items,
    });
    return error ? String(error.message) : null;
  }, { rpcName, gameId, key, items });
}

/** Prawdziwy, przeglądarkowy uczestnik (świeży, niezalogowany kontekst) głosuje we wszystkich pytaniach ankiety punktowej. */
async function voteAllPointsViaUi(browser, pollLink, answerIndex) {
  const voterContext = await browser.newContext();
  const voterPage = await voterContext.newPage();
  await voterPage.goto(pollLink, { waitUntil: "domcontentloaded" });
  await voterPage.waitForLoadState("networkidle");
  for (let i = 0; i < QN_COUNT; i++) {
    const buttons = voterPage.locator("#alist .btn.full");
    await expect(buttons.first()).toBeVisible({ timeout: 15000 });
    const count = await buttons.count();
    await buttons.nth(answerIndex % count).click();
  }
  await voterContext.close();
}

/**
 * Prawdziwy, przeglądarkowy uczestnik głosuje tekstowo we wszystkich pytaniach.
 * answerForOrd(ord) zwraca tekst odpowiedzi dla danego numeru pytania (1..QN_COUNT).
 */
async function voteAllTextViaUi(browser, pollLink, answerForOrd) {
  const voterContext = await browser.newContext();
  const voterPage = await voterContext.newPage();
  await voterPage.goto(pollLink, { waitUntil: "domcontentloaded" });
  await voterPage.waitForLoadState("networkidle");
  for (let ord = 1; ord <= QN_COUNT; ord++) {
    await expect(voterPage.locator("#answerInput")).toBeVisible({ timeout: 15000 });
    await voterPage.locator("#answerInput").fill(answerForOrd(ord)); // limit 17 znaków
    await voterPage.locator("#btnSend").click();
  }
  await voterContext.close();
}

/**
 * Wielu "uczestników" naraz, ale bez przeglądarki — bezpośrednio przez to samo
 * RPC, którego woła prawdziwe UI po ostatnim pytaniu (submitBatch w
 * poll-points.js/poll-text.js). voterPlans: [{ token, items }]. Wykonywane
 * w paczkach z poziomu window.__sbClient właściciela ankiety — RPC-ki
 * głosowania są zaprojektowane pod anonimowy dostęp (poll-points.js/
 * poll-text.js nie mają requireAuth), więc działają niezależnie od tego,
 * czyim klientem Supabase są wołane.
 */
async function bulkVote(page, rpcName, gameId, key, voterPlans) {
  const CONCURRENCY = 20;
  // Run #27/#28: bez tego pojedyncze zawieszone wywołanie RPC wieszało cały
  // test na pełne 5 minut (żaden feedback, dopiero opóźniony fail na
  // deleteGame) — dokładnie ten sam problem co submitBatch() w
  // poll-points.js/poll-text.js rozwiązuje przez withTimeout(). Robimy to
  // samo: 25s na wywołanie, żeby zawieszenie stało się szybkim, czytelnym
  // błędem zamiast cichego zawisu.
  await page.evaluate(async ({ rpcName, gameId, key, voterPlans, CONCURRENCY }) => {
    const sb = window.__sbClient;
    const withTimeout = (p, ms, label) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`RPC timeout (${ms}ms): ${label}`)), ms))]);

    for (let start = 0; start < voterPlans.length; start += CONCURRENCY) {
      const batch = voterPlans.slice(start, start + CONCURRENCY);
      const results = await Promise.all(
        batch.map((v) =>
          withTimeout(
            sb.rpc(rpcName, { p_game_id: gameId, p_key: key, p_voter_token: v.token, p_items: v.items }),
            25000,
            `${rpcName} voter=${v.token}`
          )
        )
      );
      const failed = results.find((r) => r.error);
      if (failed) throw new Error("bulk vote RPC failed: " + failed.error.message);
    }
  }, { rpcName, gameId, key, voterPlans, CONCURRENCY });
}

/** Diagnostyka: ile wpisów faktycznie wylądowało w bazie dla danego pytania (poll_text). */
async function countTextEntries(page, gameId, questionId) {
  return await page.evaluate(async ({ gameId, questionId }) => {
    const { count, error } = await window.__sbClient
      .from("poll_text_entries")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("question_id", questionId);
    if (error) throw new Error("count query failed: " + error.message);
    return count;
  }, { gameId, questionId });
}

function pointsItemsForVoter(questions, answerIndex) {
  return questions.map((q) => ({ question_id: q.id, answer_id: q.answers[answerIndex % q.answers.length].id }));
}

// Run #28/#29: test 1 wisi na pełne 5 minut bez jednoznacznego sygnału gdzie
// (nowy timeout w bulkVote się nie uruchomił, więc zawieszenie jest gdzie
// indziej w przepływie) — znaczniki czasu na każdym etapie, żeby następny
// przebieg pokazał dokładnie który krok faktycznie wisi, zamiast zgadywać.
function mark(label) {
  console.log(`[timing] ${label} @ ${new Date().toISOString()}`);
}

function textItemsForVoter(questions, answerForOrd) {
  return questions.map((q) => {
    const raw = String(answerForOrd(q.ord)).slice(0, 17);
    return { question_id: q.id, answer_raw: raw, answer_norm: normText(raw) };
  });
}

test("ankieta punktowa i tekstowa: głosy, Zatrzymaj, Wznów, Podlicz", async ({ page, context, browser }) => {
  test.setTimeout(300_000);

  await loginAsTestUser(page, context);

  // --- Ankieta punktowa ---
  mark("start points seed");
  const pointsGame = await seedPollGame(page, "poll_points");
  try {
    mark("points seeded, opening poll");
    const { link: pointsLink, key: pointsKey } = await openPoll(page, pointsGame.gameId);
    mark("points poll opened, real UI voter starting");
    await expectBarState(page, "poll_open");

    // Jedno prawdziwe kliknięcie przez przeglądarkę — sprawdza, że
    // mechanizm głosowania (klik odpowiedzi -> RPC) faktycznie działa.
    for (let i = 0; i < REAL_UI_VOTERS; i++) {
      await voteAllPointsViaUi(browser, pointsLink, weightedBucket(i, POINTS_WEIGHTS));
    }
    mark("points real UI voter done, bulk voting starting");
    // Reszta "setki" — te same RPC, bez przeglądarki, z nierównym rozkładem.
    const bulkPlans = Array.from({ length: TOTAL_VOTERS - REAL_UI_VOTERS }, (_, k) => {
      const i = REAL_UI_VOTERS + k;
      return { token: `e2e-bulk-points-${Date.now()}-${i}`, items: pointsItemsForVoter(pointsGame.questions, weightedBucket(i, POINTS_WEIGHTS)) };
    });
    await bulkVote(page, "poll_points_vote_batch", pointsGame.gameId, pointsKey, bulkPlans);
    mark("points bulk voting done, navigating back to owner page");

    await gotoOwnerPage(page, pointsGame.gameId);
    await expectBarState(page, "poll_open");
    await expect(page.locator("#pollStateInfo")).toContainText(/\d+/, { timeout: 30000 }); // „100 głosów”

    // Zatrzymaj -> Wznów -> Zatrzymaj: głosy zostają, ten sam link
    await stopPoll(page, pointsGame.gameId);
    // zatrzymana ankieta odrzuca nowe głosy
    const lateErr = await tryVote(page, "poll_points_vote_batch", pointsGame.gameId, pointsKey,
      pointsItemsForVoter(pointsGame.questions, 0));
    expect(lateErr, "zatrzymana ankieta punktowa powinna odrzucić głos").not.toBeNull();
    await resumePoll(page, pointsGame.gameId);
    expect(await page.inputValue("#pollLink")).toBe(pointsLink);
    await stopPoll(page, pointsGame.gameId);

    // Podlicz: te same wiersze, głosy -> punkty, suma 100 przy każdym pytaniu
    await startTally(page);
    const sums = page.locator("#resultsList .resultQ .tallySum");
    await expect(sums).toHaveCount(QN_COUNT, { timeout: 15000 });
    await expect(sums.first()).toContainText("100");
    await approveTally(page, pointsGame.gameId);
    mark("points poll tallied successfully");
  } finally {
    await deleteGame(page, pointsGame.gameId);
    mark("points game deleted");
  }

  // --- Ankieta tekstowa ---
  mark("start text seed");
  const textGame = await seedPollGame(page, "poll_text");
  try {
    mark("text seeded, opening poll");
    const { link: textLink, key: textKey } = await openPoll(page, textGame.gameId);
    mark("text poll opened, real UI voter starting");

    for (let i = 0; i < REAL_UI_VOTERS; i++) {
      const answer = TEXT_POOL[weightedBucket(i, TEXT_WEIGHTS)];
      await voteAllTextViaUi(browser, textLink, () => answer);
    }
    mark("text real UI voter done, bulk voting starting");
    const bulkPlans = Array.from({ length: TOTAL_VOTERS - REAL_UI_VOTERS }, (_, k) => {
      const i = REAL_UI_VOTERS + k;
      const answer = TEXT_POOL[weightedBucket(i, TEXT_WEIGHTS)];
      return { token: `e2e-bulk-text-${Date.now()}-${i}`, items: textItemsForVoter(textGame.questions, () => answer) };
    });
    await bulkVote(page, "poll_text_submit_batch", textGame.gameId, textKey, bulkPlans);
    mark("text bulk voting done, navigating back to owner page");

    await gotoOwnerPage(page, textGame.gameId);
    await expectBarState(page, "poll_open");

    await stopPoll(page, textGame.gameId);
    const lateErr = await tryVote(page, "poll_text_submit_batch", textGame.gameId, textKey,
      textItemsForVoter(textGame.questions, () => "Pizza"));
    expect(lateErr, "zatrzymana ankieta tekstowa powinna odrzucić głos").not.toBeNull();
    await resumePoll(page, textGame.gameId);
    await stopPoll(page, textGame.gameId);

    // Podlicz: wiersze dostają uchwyty i punkty na żywo; licznik „3–6” bez błędu
    await startTally(page);
    const firstQ = page.locator("#resultsList .resultQ").first();
    await expect(firstQ.locator(".aList.tally .aRow").first()).toBeVisible({ timeout: 60000 });
    await expect(firstQ.locator(".tallyCounter.invalid")).toHaveCount(0);
    await approveTally(page, textGame.gameId);
    mark("text poll tallied successfully");
  } finally {
    await deleteGame(page, textGame.gameId);
    mark("text game deleted");
  }
});

test("ankieta tekstowa: literówki, korekta i scalanie odpowiedzi w trybie podliczania", async ({ page, context }) => {
  test.setTimeout(240_000);

  await loginAsTestUser(page, context);

  mark("merge-test: start seed");
  const game = await seedPollGame(page, "poll_text");
  try {
    mark("merge-test: seeded, opening poll");
    const { key: gameKey } = await openPoll(page, game.gameId); // link do głosowania niepotrzebny (głosujemy RPC), ale klucz tak
    mark("merge-test: poll opened, bulk voting");

    // Na pytaniu 1 celowo sadzimy realistyczny bałagan. Tryb podliczania
    // buduje model z kolumny `answer_norm` (znormalizowany tekst), NIE z
    // surowego tekstu głosującego — więc różnice samej wielkości liter
    // ("Pizza" vs "PIZZA") zlewają się w JEDEN wiersz automatycznie.
    // "Scal identyczne" służy do duplikatów, które powstają PO RĘCZNEJ
    // EDYCJI tekstu (poprawka literówki daje dwa identyczne wiersze).
    // - 5 głosów "Pizza" (dowolna wielkość liter) — JEDEN wiersz, count=5,
    // - 1 głos z literówką "Piza" — poprawiamy ręcznie na "pizza", potem
    //   "Scal identyczne",
    // - "Kotek" (3 głosy) i "Kot domowy" (3 głosy) — scalenie przeciągnięciem,
    // - reszta: pula 20 odpowiedzi (każda ~4-5% głosów, powyżej progu 3 pkt;
    //   unikalny "długi ogon" zepsułby podliczenie — wszystkie odpadłyby).
    const TAIL_POOL = [
      "Burger", "Sushi", "Frytki", "Lody", "Kebab", "Naleśniki", "Pierogi",
      "Sałatka", "Makaron", "Zupa", "Kanapka", "Ciasto", "Owoce", "Ryż",
      "Kurczak", "Ryba", "Placki", "Gofry", "Sernik", "Kawa",
    ];
    function answerForVoter(voterIdx, ord) {
      if (ord !== 1) return TAIL_POOL[voterIdx % TAIL_POOL.length];
      if (voterIdx <= 4) return "Pizza";
      if (voterIdx === 5) return "Piza";
      if (voterIdx >= 6 && voterIdx <= 8) return "Kotek";
      if (voterIdx >= 9 && voterIdx <= 11) return "Kot domowy";
      return TAIL_POOL[voterIdx % TAIL_POOL.length];
    }

    const voterPlans = Array.from({ length: TOTAL_VOTERS }, (_, i) => ({
      token: `e2e-bulk-merge-${Date.now()}-${i}`,
      items: textItemsForVoter(game.questions, (ord) => answerForVoter(i, ord)),
    }));
    await bulkVote(page, "poll_text_submit_batch", game.gameId, gameKey, voterPlans);
    mark("merge-test: bulk voting done");

    const q1EntryCount = await countTextEntries(page, game.gameId, game.questions[0].id);
    expect(q1EntryCount, "poll_text_entries dla pytania 1 powinno mieć 100 wpisów po bulkVote").toBe(TOTAL_VOTERS);

    await gotoOwnerPage(page, game.gameId);
    await expectBarState(page, "poll_open");
    await stopPoll(page, game.gameId);
    await startTally(page);
    mark("merge-test: tally mode entered");

    const firstQuestion = page.locator("#resultsList .resultQ").first();
    const items = firstQuestion.locator(".aList > .aRow:not(.leaving)");
    // 24 odrębne odpowiedzi na pytanie 1: pizza (5+1 głosów po scaleniu
    // literówki), kotek, kot domowy i 20 z puli TAIL_POOL. Widok surowy
    // pokazywał tylko TOP 12 — podliczanie ma wszystkie.
    const initialRowCount = 24;
    await expect(items).toHaveCount(initialRowCount, { timeout: 60000 });
    mark("merge-test: tally rows loaded");

    async function findItemByText(text) {
      for (const item of await items.all()) {
        if ((await item.locator(".aTxtInp").inputValue()) === text) return item;
      }
      return null;
    }
    async function itemCount(item) {
      return parseInt(await item.locator(".tcCnt").innerText(), 10);
    }

    // Tekst znormalizowany (małe litery) — "Pizza" wysłane przez głosujących to "pizza".
    const pizzaItem = await findItemByText("pizza");
    expect(pizzaItem, "5 głosów 'Pizza' powinno być już jednym wierszem 'pizza'").not.toBeNull();
    await expect.poll(() => itemCount(pizzaItem)).toBe(5);

    const typoItem = await findItemByText("piza");
    expect(typoItem, "literówka 'piza' nie powinna zniknąć sama, dopóki jej nie poprawimy").not.toBeNull();

    // --- Poprawiamy literówkę w polu tekstowym, potem "Scal identyczne" ---
    const pizzaCountBeforeTypoFix = await itemCount(pizzaItem);
    await typoItem.locator(".aTxtInp").fill("pizza");
    await typoItem.locator(".aTxtInp").blur();

    await firstQuestion.locator(".tcMergeDup").click();

    await expect(items).toHaveCount(initialRowCount - 1, { timeout: 5000 });
    const pizzaAfterFix = await findItemByText("pizza");
    expect(pizzaAfterFix, "po poprawce i 'Scal identyczne' powinien zostać jeden wiersz 'pizza'").not.toBeNull();
    await expect.poll(() => itemCount(pizzaAfterFix)).toBe(pizzaCountBeforeTypoFix + 1);
    mark("merge-test: auto-merge dup done, manual merge starting");

    // --- Przeciągnięcie uchwytu jednego wiersza na drugi = połączenie ---
    const kotekItem = await findItemByText("kotek");
    const kotDomowyItem = await findItemByText("kot domowy");
    expect(kotekItem).not.toBeNull();
    expect(kotDomowyItem).not.toBeNull();
    const kotekCount = await itemCount(kotekItem);
    const kotDomowyCount = await itemCount(kotDomowyItem);

    // Na komputerze działa natywny HTML5 drag-and-drop z uchwytu (.tcHandle);
    // „Połącz z…” (.tcMergeBtn) jest tylko na dotyku.
    await kotekItem.locator(".tcHandle").dragTo(kotDomowyItem);
    mark("merge-test: kotek dragged onto kot domowy");

    await expect(items).toHaveCount(initialRowCount - 2, { timeout: 5000 });
    const kotSurvivor = await findItemByText("kot domowy");
    expect(kotSurvivor, "scalona odpowiedź 'kot domowy' powinna zostać").not.toBeNull();
    await expect.poll(() => itemCount(kotSurvivor)).toBe(kotekCount + kotDomowyCount);
    expect(await findItemByText("kotek"), "'kotek' powinno zniknąć po scaleniu").toBeNull();
    mark("merge-test: manual merge done");

    // Poprawki same zapisują się w bazie (szkic) ...
    await expect(page.locator("#tallySave")).toHaveAttribute("data-state", "saved", { timeout: 20000 });

    // ... więc po przeładowaniu strony tryb podliczania wraca z tym samym stanem.
    await gotoOwnerPage(page, game.gameId);
    await expectBarState(page, "poll_stopped");
    await startTally(page);
    await expect(items).toHaveCount(initialRowCount - 2, { timeout: 60000 });
    const restoredSurvivor = await findItemByText("kot domowy");
    expect(restoredSurvivor, "szkic powinien przywrócić scaloną odpowiedź").not.toBeNull();
    await expect.poll(() => itemCount(restoredSurvivor)).toBe(kotekCount + kotDomowyCount);
    mark("merge-test: draft restored after reload");

    await approveTally(page, game.gameId);
    mark("merge-test: poll tallied successfully");
  } finally {
    await deleteGame(page, game.gameId);
    mark("merge-test: game deleted");
  }
});

// ===== 3. QR w ankietach — język dociera do już podłączonego urządzenia bez odświeżania =====
//
// Zgłoszone: poll-qr.html (ekran QR do głosowania, np. na telewizorze) był
// jedynym "urządzeniem" w całym systemie, które o zmianie stanu (tu: język
// operatora w polls.html) dowiadywało się WYŁĄCZNIE z żywej komendy
// (BroadcastChannel same-browser + Supabase Realtime broadcast
// POLL_QR_LANG) -- urządzenie, które akurat straciło łącze albo dołączyło
// PO zmianie, zostawało trwale z nieaktualnym językiem aż do kolejnej
// zmiany, bez żadnego sposobu odzyskania stanu. Migracja 269 dodaje
// games.poll_qr_lang jako jedyne źródło prawdy -- polls.js je zapisuje
// (set_poll_qr_lang), poll-qr.js samo się o nie dopytuje (pollLangOnce(),
// co POLL_LANG_INTERVAL_MS=4000ms) przez ten sam get_poll_game, którego już
// używa przy starcie -- dokładnie ten sam wzorzec "stan zamiast komend" co
// Control v2's game_state.
//
// Test celowo podłącza urządzenie QR PRZED zmianą języka (nie po) --
// gdyby poll-qr.js czytał stan tylko raz przy starcie, ten test by nie
// złapał regresji do starego, komendowego zachowania: musi minąć
// POLL_LANG_INTERVAL_MS, żeby zmiana faktycznie dotarła.
test("QR w ankietach: zmiana języka w polls.html dociera do już otwartego urządzenia przez pollowanie stanu", async ({ page, context, browser }) => {
  await loginAsTestUser(page, context);

  const pollGame = await seedPollGame(page, "poll_text");
  const qrContext = await browser.newContext();
  // "Urządzenie" QR -- świeży, anonimowy kontekst (jak fizyczny telewizor
  // podłączony kodem). WAŻNE: nie da się wymusić startowego języka przez
  // ?lang=pl w URL -- cloudflare/maintenance-worker/src/index.js's "Redirect
  // ?lang=pl -> clean URL (pl is default, no param needed)" to 301 na CZYSTY
  // URL bez tego parametru (edge-owy skrót, bo "pl" i tak jest domyślne) --
  // bez własnego localStorage.uiLang kontekst spada wtedy na
  // navigator.language (w CI: en-US), więc test widział "en" od samego
  // startu, mimo jawnego ?lang=pl w nawigacji. Ten sam wzorzec co
  // withE2EBypass() w helpers/login.js, tylko bez tokenu bypass (poll-qr,
  // jak display/host/buzzer w control2.spec.js's openAnon(), nie go
  // potrzebuje).
  await qrContext.addInitScript(() => {
    try { localStorage.setItem("uiLang", "pl"); } catch {}
  });
  try {
    // Ekran QR działa tylko dla otwartej / zamkniętej ankiety (szkic:
    // invalid_status) — uruchamiamy ją, a klucz czytamy PO uruchomieniu
    // (każde uruchomienie nadaje nowy klucz, migracja 310).
    const key = await page.evaluate(async (id) => {
      const sb = window.__sbClient;
      const { data: g0, error: e0 } = await sb.from("games").select("share_key_poll").eq("id", id).single();
      if (e0) throw new Error("select share_key_poll failed: " + e0.message);
      const { error: eo } = await sb.rpc("poll_open", { p_game_id: id, p_key: g0.share_key_poll });
      if (eo) throw new Error("poll_open failed: " + eo.message);
      const { data, error } = await sb.from("games").select("share_key_poll").eq("id", id).single();
      if (error) throw new Error("select share_key_poll failed: " + error.message);
      return data.share_key_poll;
    }, pollGame.gameId);

    await page.goto(`https://www.familiada.online/polls?id=${pollGame.gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const qrPage = await qrContext.newPage();
    instrumentPage(qrPage);
    await qrPage.goto(
      `https://www.familiada.online/polls/vote/qr/?id=${pollGame.gameId}&key=${key}`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(qrPage.locator(".qr-hint")).toHaveText("Zeskanuj QR, aby zagłosować", { timeout: 15000 });
    await expect(qrPage.locator("html")).toHaveAttribute("lang", "pl");

    // Operator zmienia język w polls.html -- broadcastLang() (js/pages/
    // polls.js) teraz TYLKO zapisuje games.poll_qr_lang, nie czeka na
    // żadnego odbiorcę.
    await page.locator(".lang-btn").click();
    await page.locator('.lang-option[data-lang="en"]').click();

    // Odczekujemy z zapasem ponad POLL_LANG_INTERVAL_MS (4000ms w
    // poll-qr.js), żeby złapać rzeczywiste, cykliczne pollowanie -- nie
    // tylko jednorazowy odczyt przy starcie strony (ten już minął wyżej).
    await expect(qrPage.locator(".qr-hint")).toHaveText("Scan the QR code to vote", { timeout: 10000 });
    await expect(qrPage.locator("html")).toHaveAttribute("lang", "en");
  } finally {
    await qrContext.close();
    await deleteGame(page, pollGame.gameId);
  }
});

// ===== 4. Cofnij / Ponów i wyjście z podliczania bez zatwierdzenia =====

test("ankieta tekstowa: cofnij/ponów dla edycji tekstu w trybie podliczania", async ({ page, context }) => {
  test.setTimeout(180_000);

  await loginAsTestUser(page, context);

  mark("undo-test: start seed");
  const game = await seedPollGame(page, "poll_text");
  try {
    mark("undo-test: seeded, opening poll");
    const { key: gameKey } = await openPoll(page, game.gameId);
    mark("undo-test: poll opened, bulk voting");

    // Głosowanie: 3 unikalne odpowiedzi + reszta z puli
    const voterPlans = Array.from({ length: TOTAL_VOTERS }, (_, i) => ({
      token: `e2e-undo-${Date.now()}-${i}`,
      items: textItemsForVoter(game.questions, (ord) => {
        if (ord !== 1) return TEXT_POOL[i % TEXT_POOL.length];
        if (i === 0) return "Pizza";
        if (i === 1) return "Kotek";
        if (i === 2) return "Rower";
        return TEXT_POOL[i % TEXT_POOL.length];
      }),
    }));
    await bulkVote(page, "poll_text_submit_batch", game.gameId, gameKey, voterPlans);
    mark("undo-test: voting done");

    await gotoOwnerPage(page, game.gameId);
    await expectBarState(page, "poll_open");
    await stopPoll(page, game.gameId);
    await startTally(page);

    const firstQuestion = page.locator("#resultsList .resultQ").first();
    const items = firstQuestion.locator(".aList > .aRow:not(.leaving)");
    const initialRowCount = 4; // Pizza, Kotek, Rower, + 1 z puli
    await expect(items).toHaveCount(initialRowCount, { timeout: 60000 });
    mark("undo-test: tally ready, testing undo/redo");

    async function findItemByText(text) {
      for (const item of await items.all()) {
        if ((await item.locator(".aTxtInp").inputValue()) === text) return item;
      }
      return null;
    }

    const pizzaItem = await findItemByText("pizza");
    expect(pizzaItem).not.toBeNull();

    // Zmień tekst: pizza → pepperoni
    await pizzaItem.locator(".aTxtInp").click();
    await pizzaItem.locator(".aTxtInp").fill("pepperoni");
    await pizzaItem.locator(".aTxtInp").blur();
    mark("undo-test: text edited pizza→pepperoni");

    // Cofnij (przycisk i Ctrl+Z)
    await expect(page.locator("#btnUndo")).toBeEnabled();
    await page.locator("#btnUndo").click();
    await expect.poll(async () => (await findItemByText("pizza")) !== null, { message: "cofnij powinno przywrócić 'pizza'" }).toBe(true);
    mark("undo-test: undo confirmed");

    // Ponów (Ctrl+Y poza polem tekstu)
    await page.keyboard.press("Control+Y");
    await expect.poll(async () => (await findItemByText("pepperoni")) !== null, { message: "ponów powinno przywrócić 'pepperoni'" }).toBe(true);
    mark("undo-test: redo confirmed");
  } finally {
    await deleteGame(page, game.gameId);
    mark("undo-test: game deleted");
  }
});

test("ankieta tekstowa: wyjście z podliczania bez zatwierdzenia zostawia ankietę zatrzymaną, poprawki wracają", async ({ page, context }) => {
  test.setTimeout(180_000);

  await loginAsTestUser(page, context);

  mark("leave-test: start seed");
  const game = await seedPollGame(page, "poll_text");
  try {
    const { key: gameKey } = await openPoll(page, game.gameId);

    const voterPlans = Array.from({ length: 20 }, (_, i) => ({
      token: `e2e-leave-${Date.now()}-${i}`,
      items: textItemsForVoter(game.questions, () => TEXT_POOL[i % TEXT_POOL.length]),
    }));
    await bulkVote(page, "poll_text_submit_batch", game.gameId, gameKey, voterPlans);
    mark("leave-test: voting done");

    await gotoOwnerPage(page, game.gameId);
    await expectBarState(page, "poll_open");
    await stopPoll(page, game.gameId);
    await startTally(page);

    const firstQuestion = page.locator("#resultsList .resultQ").first();
    const items = firstQuestion.locator(".aList > .aRow:not(.leaving)");
    await expect(items).toHaveCount(TEXT_POOL.length, { timeout: 60000 });

    // Usuń jedną odpowiedź (kosz) -> 3 wiersze, licznik nadal poprawny
    await items.last().locator(".tcDel").click();
    await expect(items).toHaveCount(TEXT_POOL.length - 1, { timeout: 5000 });

    // Wyjście bez zatwierdzenia: zwykły widok wyników, ankieta dalej ZATRZYMANA
    await page.locator("#btnLeaveTally").click();
    await expectBarState(page, "poll_stopped");
    await expect(page.locator("#resultsList .aList.tally")).toHaveCount(0);
    expect(await getGameStatus(page, game.gameId)).toBe("poll_stopped");

    // Powrót do podliczania: usunięta odpowiedź nadal usunięta (szkic w bazie)
    await startTally(page);
    await expect(items).toHaveCount(TEXT_POOL.length - 1, { timeout: 60000 });

    await approveTally(page, game.gameId);
    mark("leave-test: tallied after returning");
  } finally {
    await deleteGame(page, game.gameId);
    mark("leave-test: game deleted");
  }
});
