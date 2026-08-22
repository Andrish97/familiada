// tests/e2e/polls.spec.js
// Weryfikuje pełny cykl życia ankiety (js/pages/polls.js + poll-points.js/
// poll-text.js): utworzenie, zebranie głosów od anonimowych uczestników
// (osobne, niezalogowane konteksty przeglądarki — dokładnie tak jak w
// realnym użyciu, bez logowania) i zamknięcie, dla obu typów (poll_points,
// poll_text). Drugi test skupia się konkretnie na mechanice scalania
// odpowiedzi w panelu zamykania ankiety tekstowej (.tcMergeBtn).
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

/** Anonimowy uczestnik głosuje tekstowo we wszystkich pytaniach ankiety tekstowej. */
async function voteAllText(browser, pollLink, prefix) {
  const voterContext = await browser.newContext();
  const voterPage = await voterContext.newPage();
  await voterPage.goto(pollLink, { waitUntil: "domcontentloaded" });
  await voterPage.waitForLoadState("networkidle");
  for (let i = 1; i <= QN_COUNT; i++) {
    await expect(voterPage.locator("#answerInput")).toBeVisible({ timeout: 15000 });
    await voterPage.locator("#answerInput").fill(`${prefix} ${i}`); // limit 17 znaków — zmieść się z zapasem
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

    // ~100 głosujących, rozkładając głosy po 4 predefiniowanych odpowiedziach.
    await voteMany(POINTS_VOTERS, (i) => voteAllPoints(browser, pointsLink, i));

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

    // ~100 głosujących, każdy wpisuje własny, unikalny tekst.
    await voteMany(TEXT_VOTERS, (i) => voteAllText(browser, textLink, `V${i}`));

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

test("ankieta tekstowa: scalanie odpowiedzi w panelu zamykania", async ({ page, context, browser }) => {
  test.setTimeout(400_000); // ~100 głosujących w paczkach na jedno pytanie do scalenia

  await loginAsTestUser(page, context);

  const game = await seedPollGame(page, "poll_text");
  try {
    const pollLink = await openPoll(page, game.gameId);

    // ~100 głosujących na KAŻDE pytanie — scalimy dwóch w pierwszym pytaniu,
    // zostawiając nadal dużo więcej niż wymagane min. 3 odpowiedzi.
    await voteMany(MERGE_VOTERS, (i) => voteAllText(browser, pollLink, `V${i}`));

    await page.goto(`https://www.familiada.online/polls?id=${game.gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#btnPollAction")).toHaveText("Zamknąć ankietę", { timeout: 15000 });
    await page.locator("#btnPollAction").click();

    const firstQuestion = page.locator("#textCloseList .tcQ").first();
    const items = firstQuestion.locator(".tcList .tcItem");
    await expect(items).toHaveCount(MERGE_VOTERS, { timeout: 15000 });

    const srcText = await items.nth(0).locator(".tcTxtInp").inputValue();
    const srcCount = parseInt(await items.nth(0).locator(".tcCnt").innerText(), 10);
    const targetText = await items.nth(1).locator(".tcTxtInp").inputValue();
    const targetCount = parseInt(await items.nth(1).locator(".tcCnt").innerText(), 10);

    // Klik ⇄ na pierwszej odpowiedzi (źródło), potem na drugiej (cel) — scala źródło w cel.
    await items.nth(0).locator(".tcMergeBtn").click();
    await items.nth(1).locator(".tcMergeBtn").click();

    await expect(items).toHaveCount(MERGE_VOTERS - 1, { timeout: 5000 });

    // .tcTxtInp to <input> — jego wartość nie jest "tekstem" w sensie Playwrighta
    // (hasText/getByText nie widzą value inputa), więc szukamy ręcznie po inputValue().
    let survivorCount = null;
    let srcStillPresent = false;
    for (const item of await items.all()) {
      const val = await item.locator(".tcTxtInp").inputValue();
      if (val === targetText) survivorCount = parseInt(await item.locator(".tcCnt").innerText(), 10);
      if (val === srcText) srcStillPresent = true;
    }
    expect(survivorCount, "scalona odpowiedź powinna istnieć z sumą głosów obu scalonych").toBe(srcCount + targetCount);
    expect(srcStillPresent, "odpowiedź źródłowa powinna zniknąć po scaleniu").toBe(false);

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
