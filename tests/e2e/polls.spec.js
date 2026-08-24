// tests/e2e/polls.spec.js
// Weryfikuje pełny cykl życia ankiety (js/pages/polls.js + poll-points.js/
// poll-text.js): utworzenie, zebranie głosów od anonimowych uczestników
// i zamknięcie, dla obu typów (poll_points, poll_text). Głosy rozkładają
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
// Drugi test skupia się na panelu zamykania ankiety tekstowej: literówki
// (różna wielkość liter — auto-scalane przyciskiem "Scal identyczne"),
// ręczna korekta literówki w polu tekstowym i ręczne scalanie dwóch różnie
// nazwanych, ale znaczących to samo odpowiedzi (.tcMergeBtn). Tu wszystkie
// głosy idą przez bezpośrednie RPC — przedmiotem testu jest panel, nie
// mechanika głosowania (tę sprawdza już pierwszy test).
//
// Ankieta wymaga min. 10 pytań, żeby "Uruchomić ankietę" było w ogóle
// klikalne (RULES.QN_MIN w js/core/game-validate.js) — pytania/odpowiedzi
// sadzimy bezpośrednio przez API (nie testujemy tu kreatora pytań),
// dokładnie tak jak w game-deletion.spec.js dla samej gry.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

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

/** Na stronie /polls?id=... — klika główny przycisk akcji i potwierdza modal, zwraca link do głosowania. */
async function openPoll(page, gameId) {
  await page.goto(`https://www.familiada.online/polls?id=${gameId}`, { waitUntil: "domcontentloaded" });
  // polls.js wiąże listenery dopiero po asynchronicznym requireAuth+initI18n+refresh
  // w handlerze DOMContentLoaded — ten sam wyścig co przy #btnPrimary na /login.
  await page.waitForLoadState("networkidle");
  await page.locator("#btnPollAction").click();
  await page.getByRole("button", { name: "Uruchom", exact: true }).click();
  await expect(page.locator("#pollLink")).not.toHaveValue("", { timeout: 15000 });
  const link = await page.inputValue("#pollLink");
  const key = new URL(link).searchParams.get("key");
  return { link, key };
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

function textItemsForVoter(questions, answerForOrd) {
  return questions.map((q) => {
    const raw = String(answerForOrd(q.ord)).slice(0, 17);
    return { question_id: q.id, answer_raw: raw, answer_norm: normText(raw) };
  });
}

test("ankieta punktowa i tekstowa: tworzenie, zbieranie głosów i zamknięcie", async ({ page, context, browser }) => {
  test.setTimeout(300_000); // pierwsza próba padła DOKŁADNIE na 180s (na sprzątaniu ostatniego kroku) — za mało zapasu

  await loginAsTestUser(page, context);

  // --- Ankieta punktowa ---
  const pointsGame = await seedPollGame(page, "poll_points");
  try {
    const { link: pointsLink, key: pointsKey } = await openPoll(page, pointsGame.gameId);

    // Jedno prawdziwe kliknięcie przez przeglądarkę — sprawdza, że
    // mechanizm głosowania (klik odpowiedzi -> RPC) faktycznie działa.
    for (let i = 0; i < REAL_UI_VOTERS; i++) {
      await voteAllPointsViaUi(browser, pointsLink, weightedBucket(i, POINTS_WEIGHTS));
    }
    // Reszta "setki" — te same RPC, bez przeglądarki, z nierównym rozkładem.
    const bulkPlans = Array.from({ length: TOTAL_VOTERS - REAL_UI_VOTERS }, (_, k) => {
      const i = REAL_UI_VOTERS + k;
      return { token: `e2e-bulk-points-${Date.now()}-${i}`, items: pointsItemsForVoter(pointsGame.questions, weightedBucket(i, POINTS_WEIGHTS)) };
    });
    await bulkVote(page, "poll_points_vote_batch", pointsGame.gameId, pointsKey, bulkPlans);

    await page.goto(`https://www.familiada.online/polls?id=${pointsGame.gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#btnPollAction")).toHaveText("Zamknąć ankietę", { timeout: 15000 });
    await page.locator("#btnPollAction").click();
    await page.getByRole("button", { name: "Zakończ", exact: true }).click();

    await expect.poll(() => getGameStatus(page, pointsGame.gameId), {
      timeout: 15000,
      message: "ankieta punktowa powinna mieć status 'ready' po zamknięciu",
    }).toBe("ready");
  } finally {
    await deleteGame(page, pointsGame.gameId);
  }

  // --- Ankieta tekstowa ---
  const textGame = await seedPollGame(page, "poll_text");
  try {
    const { link: textLink, key: textKey } = await openPoll(page, textGame.gameId);

    for (let i = 0; i < REAL_UI_VOTERS; i++) {
      const answer = TEXT_POOL[weightedBucket(i, TEXT_WEIGHTS)];
      await voteAllTextViaUi(browser, textLink, () => answer);
    }
    const bulkPlans = Array.from({ length: TOTAL_VOTERS - REAL_UI_VOTERS }, (_, k) => {
      const i = REAL_UI_VOTERS + k;
      const answer = TEXT_POOL[weightedBucket(i, TEXT_WEIGHTS)];
      return { token: `e2e-bulk-text-${Date.now()}-${i}`, items: textItemsForVoter(textGame.questions, () => answer) };
    });
    await bulkVote(page, "poll_text_submit_batch", textGame.gameId, textKey, bulkPlans);

    await page.goto(`https://www.familiada.online/polls?id=${textGame.gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#btnPollAction")).toHaveText("Zamknąć ankietę", { timeout: 15000 });
    await page.locator("#btnPollAction").click(); // dla poll_text otwiera panel scalania, jeszcze nie zamyka

    await expect(page.locator("#btnFinishTextClose")).toBeEnabled({ timeout: 15000 });
    await page.locator("#btnFinishTextClose").click();
    await page.getByRole("button", { name: "Zamknij", exact: true }).click();

    await expect.poll(() => getGameStatus(page, textGame.gameId), {
      timeout: 15000,
      message: "ankieta tekstowa powinna mieć status 'ready' po zamknięciu",
    }).toBe("ready");
  } finally {
    await deleteGame(page, textGame.gameId);
  }
});

test("ankieta tekstowa: literówki, korekta i scalanie odpowiedzi w panelu zamykania", async ({ page, context }) => {
  test.setTimeout(120_000);

  await loginAsTestUser(page, context);

  const game = await seedPollGame(page, "poll_text");
  try {
    const { key: gameKey } = await openPoll(page, game.gameId); // link do głosowania niepotrzebny (głosujemy RPC), ale klucz tak

    // Na pytaniu 1 celowo sadzimy realistyczny bałagan. WAŻNE — sprawdzone
    // bezpośrednio w kodzie (buildTextClosePanel w polls.js): panel buduje
    // model z kolumny `answer_norm` (znormalizowany tekst), NIE z surowego
    // tekstu głosującego — więc różnice samej wielkości liter ("Pizza" vs
    // "PIZZA") zlewają się w JEDEN wiersz automatycznie, zanim cokolwiek
    // klikniesz. ".tcMergeDup" ("Scal identyczne") nie służy do łapania
    // tego — służy do scalania duplikatów, które powstają PO RĘCZNEJ EDYCJI
    // tekstu w trakcie sesji (np. gdy poprawka literówki sprawi, że dwa
    // wiersze mają teraz identyczny tekst). Tekst w `.tcTxtInp` też jest
    // zawsze znormalizowany (małe litery) — nie oryginalną pisownią.
    // - 4 głosy "Pizza" (dowolna wielkość liter) — mimo to JEDEN wiersz od
    //   razu, count=4 (test tego istniejącego mechanizmu, nie coś do klikania),
    // - 1 głos z literówką "Piza" (inne znaki niż "pizza" po normalizacji,
    //   więc NIE zlewa się automatycznie) — poprawiamy ręcznie w polu tekstowym
    //   na "pizza", co tworzy surowy duplikat, i DOPIERO WTEDY "Scal identyczne"
    //   ma sens i faktycznie coś robi,
    // - "Kotek" i "Kot domowy" — różne sformułowania tej samej odpowiedzi,
    //   nigdy się nie znormalizują tak samo — do ręcznego scalenia przyciskiem
    //   ⇄ (.tcMergeBtn),
    // - reszta głosujących: unikalny długi ogon, żeby zostało dużo więcej niż
    //   wymagane min. 3 odpowiedzi po każdej operacji.
    // Pozostałe 9 pytań: sam unikalny długi ogon (nieistotne dla tego testu).
    // Wszystkie 100 głosów idą bezpośrednim RPC — przedmiotem testu jest
    // panel zamykania, nie mechanika samego głosowania (tę sprawdza test wyżej).
    function answerForVoter(voterIdx, ord) {
      if (ord !== 1) return `V${voterIdx}-${ord}`;
      if (voterIdx <= 3) return "Pizza";
      if (voterIdx === 4) return "Piza";
      if (voterIdx === 5) return "Kotek";
      if (voterIdx === 6) return "Kot domowy";
      return `V${voterIdx}`;
    }

    const voterPlans = Array.from({ length: TOTAL_VOTERS }, (_, i) => ({
      token: `e2e-bulk-merge-${Date.now()}-${i}`,
      items: textItemsForVoter(game.questions, (ord) => answerForVoter(i, ord)),
    }));
    await bulkVote(page, "poll_text_submit_batch", game.gameId, gameKey, voterPlans);

    // Diagnostyka: run #28 pokazał panel z 0 wierszy mimo że bulkVote nie
    // rzucił błędu (a poll_text_submit rzuca "No open session" gdyby sesji
    // brakło, więc cichej utraty na poziomie RPC być nie powinno) — sprawdź
    // wprost w bazie, żeby rozstrzygnąć czy głosy w ogóle tam wylądowały,
    // zanim zaczniemy podejrzewać panel/timing.
    const q1EntryCount = await countTextEntries(page, game.gameId, game.questions[0].id);
    expect(q1EntryCount, "poll_text_entries dla pytania 1 powinno mieć 100 wpisów po bulkVote").toBe(TOTAL_VOTERS);

    await page.goto(`https://www.familiada.online/polls?id=${game.gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#btnPollAction")).toHaveText("Zamknąć ankietę", { timeout: 15000 });
    await page.locator("#btnPollAction").click();

    const firstQuestion = page.locator("#textCloseList .tcQ").first();
    const items = firstQuestion.locator(".tcList .tcItem");
    // Surowych wierszy jest mniej niż głosujących, bo 4 identyczne (po
    // normalizacji) głosy "Pizza" to JEDEN wiersz z licznikiem — 4 głosy
    // dają 1 wiersz zamiast 4, czyli 3 "zaoszczędzone" wiersze.
    const initialRowCount = TOTAL_VOTERS - 3;
    await expect(items).toHaveCount(initialRowCount, { timeout: 15000 });

    async function findItemByText(text) {
      for (const item of await items.all()) {
        if ((await item.locator(".tcTxtInp").inputValue()) === text) return item;
      }
      return null;
    }
    async function itemCount(item) {
      return parseInt(await item.locator(".tcCnt").innerText(), 10);
    }

    // Panel pokazuje tekst znormalizowany (małe litery) — "Pizza" wysłane
    // przez głosujących wygląda tu jako "pizza".
    const pizzaItem = await findItemByText("pizza");
    expect(pizzaItem, "4 głosy 'Pizza' powinny być już jednym wierszem 'pizza'").not.toBeNull();
    await expect.poll(() => itemCount(pizzaItem)).toBe(4);

    // Literówka "Piza" ma inne znaki niż "pizza" po normalizacji, więc nie
    // zlała się automatycznie — nadal stoi osobno.
    const typoItem = await findItemByText("piza");
    expect(typoItem, "literówka 'piza' nie powinna zniknąć sama, dopóki jej nie poprawimy").not.toBeNull();

    // --- Poprawiamy literówkę ręcznie w polu tekstowym — dopiero to tworzy
    // surowy duplikat "pizza" x2, który "Scal identyczne" faktycznie łapie ---
    const pizzaCountBeforeTypoFix = await itemCount(pizzaItem);
    await typoItem.locator(".tcTxtInp").fill("pizza");
    await typoItem.locator(".tcTxtInp").blur(); // zmiana zapisuje się dopiero na blur

    await firstQuestion.locator(".tcMergeDup").click();

    await expect(items).toHaveCount(initialRowCount - 1, { timeout: 5000 });
    const pizzaAfterFix = await findItemByText("pizza");
    expect(pizzaAfterFix, "po poprawce i 'Scal identyczne' powinien zostać jeden wiersz 'pizza'").not.toBeNull();
    await expect.poll(() => itemCount(pizzaAfterFix)).toBe(pizzaCountBeforeTypoFix + 1);

    // --- Ręczne scalanie dwóch różnie nazwanych, ale tożsamych odpowiedzi
    // (nigdy się nie znormalizują tak samo, więc to jedyna droga) ---
    const kotekItem = await findItemByText("kotek");
    const kotDomowyItem = await findItemByText("kot domowy");
    expect(kotekItem).not.toBeNull();
    expect(kotDomowyItem).not.toBeNull();
    const kotekCount = await itemCount(kotekItem);
    const kotDomowyCount = await itemCount(kotDomowyItem);

    // Klik ⇄ na źródle, potem na celu — scala źródło w cel.
    await kotekItem.locator(".tcMergeBtn").click();
    await kotDomowyItem.locator(".tcMergeBtn").click();

    await expect(items).toHaveCount(initialRowCount - 2, { timeout: 5000 });
    const kotSurvivor = await findItemByText("kot domowy");
    expect(kotSurvivor, "scalona odpowiedź 'kot domowy' powinna zostać").not.toBeNull();
    await expect.poll(() => itemCount(kotSurvivor)).toBe(kotekCount + kotDomowyCount);
    expect(await findItemByText("kotek"), "'kotek' powinno zniknąć po scaleniu").toBeNull();

    await expect(page.locator("#btnFinishTextClose")).toBeEnabled({ timeout: 5000 });
    await page.locator("#btnFinishTextClose").click();
    await page.getByRole("button", { name: "Zamknij", exact: true }).click();

    await expect.poll(() => getGameStatus(page, game.gameId), {
      timeout: 15000,
      message: "ankieta powinna mieć status 'ready' po zamknięciu",
    }).toBe("ready");
  } finally {
    await deleteGame(page, game.gameId);
  }
});
