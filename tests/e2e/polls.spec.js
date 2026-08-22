// tests/e2e/polls.spec.js
// Weryfikuje pełny cykl życia ankiety (js/pages/polls.js + poll-points.js/
// poll-text.js): utworzenie, zebranie głosów od anonimowych uczestników
// (osobne, niezalogowane konteksty przeglądarki — dokładnie tak jak w
// realnym użyciu, bez logowania) i zamknięcie, dla obu typów (poll_points,
// poll_text). Głosy rozkładają się nierówno (kilka popularnych odpowiedzi +
// długi ogon unikalnych) zamiast idealnie równo — bliżej realnego głosowania.
//
// Drugi test skupia się na panelu zamykania ankiety tekstowej: literówki
// (różna wielkość liter — auto-scalane przyciskiem "Scal identyczne"),
// ręczna korekta literówki w polu tekstowym i ręczne scalanie dwóch różnie
// nazwanych, ale znaczących to samo odpowiedzi (.tcMergeBtn).
//
// Ankieta wymaga min. 10 pytań, żeby "Uruchomić ankietę" było w ogóle
// klikalne (RULES.QN_MIN w js/core/game-validate.js) — pytania/odpowiedzi
// sadzimy bezpośrednio przez API (nie testujemy tu kreatora pytań),
// dokładnie tak jak w game-deletion.spec.js dla samej gry.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

const QN_COUNT = 10; // RULES.QN_MIN
const POINTS_VOTERS = 100;
const TEXT_VOTERS = 100;
const MERGE_VOTERS = 100;
// Wszystkich 100 kontekstów przeglądarki naraz zalałoby runnera CI (RAM/CPU)
// i produkcję falą jednoczesnych requestów — głosujemy paczkami równoległymi
// zamiast jednym Promise.all na 100, żeby zostać bliżej realnego obciążenia
// (dużo ludzi skanujących QR "naraz", ale nie dosłownie w tej samej milisekundzie).
const VOTER_CONCURRENCY = 20;

// Nierówny rozkład głosów zamiast idealnie równego — realniej odwzorowuje
// prawdziwe głosowanie (kilka popularnych opcji, nie identyczny podział).
const POINTS_WEIGHTS = [45, 30, 15, 10]; // suma = POINTS_VOTERS, po jednej wadze na 4 predefiniowane odpowiedzi
const TEXT_POOL = ["Pizza", "Kotek", "Herbata", "Rower"];
const TEXT_WEIGHTS = [40, 30, 20, 10]; // suma = TEXT_VOTERS

function weightedBucket(i, weights) {
  let acc = 0;
  for (let idx = 0; idx < weights.length; idx++) {
    acc += weights[idx];
    if (i < acc) return idx;
  }
  return weights.length - 1;
}

async function voteMany(count, voteOneFn) {
  for (let start = 0; start < count; start += VOTER_CONCURRENCY) {
    const batch = Array.from({ length: Math.min(VOTER_CONCURRENCY, count - start) }, (_, i) => start + i);
    await Promise.all(batch.map(voteOneFn));
  }
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

    for (let ord = 1; ord <= 10; ord++) {
      const { data: q, error: qErr } = await sb
        .from("questions")
        .insert({ game_id: game.id, ord, text: `Pytanie ${ord}` })
        .select("id")
        .single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);

      if (type === "poll_points") {
        // AN_MIN..AN_MAX = 3..6 odpowiedzi na pytanie, wymagane przed otwarciem
        for (let a = 1; a <= 4; a++) {
          const { error: aErr } = await sb
            .from("answers")
            .insert({ question_id: q.id, ord: a, text: `Odp ${ord}.${a}` });
          if (aErr) throw new Error("insert answers failed: " + aErr.message);
        }
      }
    }

    return { userId, gameId: game.id };
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
  return await page.inputValue("#pollLink");
}

/** Anonimowy uczestnik (świeży, niezalogowany kontekst) głosuje we wszystkich pytaniach ankiety punktowej. */
async function voteAllPoints(browser, pollLink, answerIndex) {
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
 * Anonimowy uczestnik głosuje tekstowo we wszystkich pytaniach ankiety tekstowej.
 * answerForOrd(ord) zwraca tekst odpowiedzi dla danego numeru pytania (1..QN_COUNT),
 * żeby ten sam głosujący mógł np. zawsze wybierać z tej samej puli popularnych
 * odpowiedzi, albo wpisywać coś unikalnego dla danego pytania — w zależności od testu.
 */
async function voteAllText(browser, pollLink, answerForOrd) {
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

test("ankieta punktowa i tekstowa: tworzenie, zbieranie głosów i zamknięcie", async ({ page, context, browser }) => {
  test.setTimeout(600_000); // dwa pełne cykle (10 pytań x ~100 głosujących w paczkach) na jeden test

  await loginAsTestUser(page, context);

  // --- Ankieta punktowa ---
  const pointsGame = await seedPollGame(page, "poll_points");
  try {
    const pointsLink = await openPoll(page, pointsGame.gameId);

    // ~100 głosujących, nierówno rozłożonych po 4 predefiniowanych odpowiedziach
    // (POINTS_WEIGHTS) — nie idealnie po równo, jak przy prawdziwym głosowaniu.
    await voteMany(POINTS_VOTERS, (i) => voteAllPoints(browser, pointsLink, weightedBucket(i, POINTS_WEIGHTS)));

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
    const textLink = await openPoll(page, textGame.gameId);

    // ~100 głosujących z małej puli popularnych odpowiedzi (TEXT_WEIGHTS,
    // ta sama odpowiedź na każde pytanie) — kilka popularnych + realny rozkład,
    // zamiast każdy-inny-unikalny-tekst.
    await voteMany(TEXT_VOTERS, (i) => {
      const answer = TEXT_POOL[weightedBucket(i, TEXT_WEIGHTS)];
      return voteAllText(browser, textLink, () => answer);
    });

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

test("ankieta tekstowa: literówki, korekta i scalanie odpowiedzi w panelu zamykania", async ({ page, context, browser }) => {
  test.setTimeout(400_000); // ~100 głosujących w paczkach na jedno pytanie do scalenia

  await loginAsTestUser(page, context);

  const game = await seedPollGame(page, "poll_text");
  try {
    const pollLink = await openPoll(page, game.gameId);

    // Na pytaniu 1 celowo sadzimy realistyczny bałagan:
    // - 3 głosy "Pizza", 2 głosy "PIZZA" (różna wielkość liter — to samo po
    //   normalizacji, ale osobne wiersze w panelu, dopóki nie klikniesz
    //   "Scal identyczne"),
    // - 1 głos z literówką "Piza" (inne znaki, więc auto-scalanie tego NIE
    //   złapie — trzeba ręcznie poprawić tekst),
    // - "Kotek" i "Kot domowy" — różne sformułowania tej samej odpowiedzi,
    //   do ręcznego scalenia przyciskiem ⇄ (.tcMergeBtn),
    // - reszta głosujących: unikalny długi ogon, żeby zostało dużo więcej niż
    //   wymagane min. 3 odpowiedzi po każdej operacji.
    // Pozostałe 9 pytań: sam unikalny długi ogon (nieistotne dla tego testu).
    function answerForVoter(voterIdx, ord) {
      if (ord !== 1) return `V${voterIdx}-${ord}`;
      if (voterIdx <= 2) return "Pizza";
      if (voterIdx <= 4) return "PIZZA";
      if (voterIdx === 5) return "Piza";
      if (voterIdx === 6) return "Kotek";
      if (voterIdx === 7) return "Kot domowy";
      return `V${voterIdx}`;
    }

    await voteMany(MERGE_VOTERS, (i) => voteAllText(browser, pollLink, (ord) => answerForVoter(i, ord)));

    await page.goto(`https://www.familiada.online/polls?id=${game.gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#btnPollAction")).toHaveText("Zamknąć ankietę", { timeout: 15000 });
    await page.locator("#btnPollAction").click();

    const firstQuestion = page.locator("#textCloseList .tcQ").first();
    const items = firstQuestion.locator(".tcList .tcItem");
    // Surowych wierszy jest mniej niż głosujących, bo każdy identyczny tekst
    // (3x "Pizza", 2x "PIZZA") to JEDEN wiersz z licznikiem — więc 3+2 głosy
    // dają tylko 2 wiersze zamiast 5, czyli 3 "zaoszczędzone" wiersze łącznie.
    const initialRowCount = MERGE_VOTERS - 3;
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

    // --- Krok 1: "Scal identyczne" łapie różnicę w wielkości liter (Pizza + PIZZA) ---
    await firstQuestion.locator(".tcMergeDup").click();
    await expect(items).toHaveCount(initialRowCount - 1, { timeout: 5000 });

    let pizzaItem = (await findItemByText("Pizza")) || (await findItemByText("PIZZA"));
    expect(pizzaItem, "po 'Scal identyczne' powinien zostać jeden wiersz Pizza/PIZZA").not.toBeNull();
    await expect.poll(() => itemCount(pizzaItem)).toBe(5); // 3 + 2 głosy
    // Nie wiadomo z góry, który z dwóch surowych tekstów ("Pizza" czy "PIZZA")
    // przetrwa scalenie — zapamiętaj faktyczny, zamiast zakładać "Pizza".
    const pizzaSurvivorText = await pizzaItem.locator(".tcTxtInp").inputValue();

    // Literówka "Piza" ma zupełnie inne znaki niż "pizza" po normalizacji,
    // więc auto-scalanie jej nie ruszyło — nadal stoi osobno.
    const typoItem = await findItemByText("Piza");
    expect(typoItem, "literówka 'Piza' nie powinna zniknąć sama, dopóki jej nie poprawimy").not.toBeNull();

    // --- Krok 2: poprawiamy literówkę ręcznie w polu tekstowym, potem scalamy
    // ręcznie przyciskiem ⇄ (bezpieczniejsze niż zakładanie, że "Scal
    // identyczne" da się bezpiecznie kliknąć drugi raz po edycji) ---
    const pizzaCountBeforeTypoFix = await itemCount(pizzaItem);
    await typoItem.locator(".tcTxtInp").fill("Pizza");
    await typoItem.locator(".tcTxtInp").blur(); // zmiana zapisuje się dopiero na blur

    await typoItem.locator(".tcMergeBtn").click(); // źródło: poprawiona literówka
    await pizzaItem.locator(".tcMergeBtn").click(); // cel: istniejąca grupa "Pizza"

    await expect(items).toHaveCount(initialRowCount - 2, { timeout: 5000 });
    pizzaItem = await findItemByText(pizzaSurvivorText);
    expect(pizzaItem, `po poprawce i scaleniu powinien zostać jeden wiersz '${pizzaSurvivorText}'`).not.toBeNull();
    await expect.poll(() => itemCount(pizzaItem)).toBe(pizzaCountBeforeTypoFix + 1);

    // --- Krok 3: ręczne scalanie dwóch różnie nazwanych, ale tożsamych odpowiedzi ---
    const kotekItem = await findItemByText("Kotek");
    const kotDomowyItem = await findItemByText("Kot domowy");
    expect(kotekItem).not.toBeNull();
    expect(kotDomowyItem).not.toBeNull();
    const kotekCount = await itemCount(kotekItem);
    const kotDomowyCount = await itemCount(kotDomowyItem);

    // Klik ⇄ na źródle, potem na celu — scala źródło w cel.
    await kotekItem.locator(".tcMergeBtn").click();
    await kotDomowyItem.locator(".tcMergeBtn").click();

    await expect(items).toHaveCount(initialRowCount - 3, { timeout: 5000 });
    const kotSurvivor = await findItemByText("Kot domowy");
    expect(kotSurvivor, "scalona odpowiedź 'Kot domowy' powinna zostać").not.toBeNull();
    await expect.poll(() => itemCount(kotSurvivor)).toBe(kotekCount + kotDomowyCount);
    expect(await findItemByText("Kotek"), "'Kotek' powinno zniknąć po scaleniu").toBeNull();

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
