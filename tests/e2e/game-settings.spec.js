// tests/e2e/game-settings.spec.js
// Weryfikuje js/pages/game-settings.js pod kątem tego samego wzorca
// "wielu miejsc naraz" co edytor gry (docs/plan-testy-i-poprawki.md):
// Warstwa 1 (blokada wejścia, resource-lock.js) i Warstwa 2 (bezpieczny
// zapis — CAS na całym `settings` blobie zamiast ślepego nadpisania, plus
// odświeżenie żywej listy pytań przed zapisem finału/rund).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

async function createGame(page, { type = "prepared", name, settings } = {}) {
  return await page.evaluate(async ({ type, name, settings }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const payload = { name: name || `E2E-SETTINGS-${Date.now()}`, owner_id: userData.user.id, type };
    if (settings) payload.settings = settings;
    const { data: game, error } = await sb
      .from("games")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);
    return game.id;
  }, { type, name, settings });
}

async function addQuestionApi(page, gameId, ord, text) {
  return await page.evaluate(async ({ gameId, ord, text }) => {
    const { data, error } = await window.__sbClient
      .from("questions")
      .insert({ game_id: gameId, ord, text })
      .select("id")
      .single();
    if (error) throw new Error("insert question failed: " + error.message);
    return data.id;
  }, { gameId, ord, text });
}

async function getGameRow(page, gameId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient.from("games").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
  }, gameId);
}

async function deleteGame(page, gameId) {
  await page.evaluate(async (id) => {
    await window.__sbClient.from("games").delete().eq("id", id);
  }, gameId);
}

async function openSettings(page, gameId) {
  await page.goto(`https://www.familiada.online/game-settings?id=${gameId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

/* ================= A: Warstwa 1 — blokada wejścia ================= */
test("ustawienia gry: dwie karty — druga karta jest blokowana overlayem, wchodzi po zamknięciu pierwszej", async ({ page, context }) => {
  test.setTimeout(90_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    const pageA = await context.newPage(); // trzyma blokadę, zostanie zamknięta żeby ją zwolnić
    const pageB = page; // fixture page — druga karta, też służy do końcowego sprzątania

    await openSettings(pageA, gameId);
    await openSettings(pageB, gameId);

    // Karta B: overlay blokady, treść ustawień (budowana dynamicznie przez
    // renderCat) w ogóle nie została wyrenderowana pod spodem.
    await expect(pageB.locator("#resourceLockGuard")).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator("#gsTeamA")).toHaveCount(0);

    await pageA.close();

    await expect(pageB.locator("#resourceLockGuard")).toBeHidden({ timeout: 40000 });
    await expect(pageB.locator("#gsTeamA")).toHaveCount(1, { timeout: 10000 });
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= B: Warstwa 2 — CAS przy zapisie ================= */
// saveAll() nadpisywało kiedyś CAŁY blob `settings` bez żadnej kontroli
// wersji — druga karta (albo bezpośrednie wywołanie z pominięciem UI)
// mogła zapisać w międzyczasie, a ten zapis i tak by ją nadpisał w
// całości. Teraz zapis jest warunkowy (CAS na całej kolumnie `settings`)
// i w razie konfliktu pokazuje jawny komunikat zamiast cichego nadpisania.
test("ustawienia gry: Warstwa 2 — zapis po zmianie ustawień z pominięciem UI kończy się jawnym konfliktem, nie cichym nadpisaniem", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await openSettings(page, gameId);

    await expect(page.locator("#gsTeamA")).toBeVisible({ timeout: 10000 });
    await page.locator("#gsTeamA").fill("Ekipa A");
    await page.locator("#btnSaveAll").click();
    await expect(page.locator("#gsUnsavedBadge")).toBeHidden({ timeout: 10000 });

    // Symulacja ominięcia UI: zapis ustawień bezpośrednio w bazie, z
    // pominięciem tej karty — ta sama karta dalej "myśli", że zna
    // aktualny stan settings sprzed tej zmiany.
    await page.evaluate(async (id) => {
      const { data } = await window.__sbClient.from("games").select("settings").eq("id", id).single();
      const next = { ...data.settings, teams: { ...data.settings.teams, teamA: "Zmienione gdzie indziej" } };
      const { error } = await window.__sbClient.from("games").update({ settings: next }).eq("id", id);
      if (error) throw new Error(error.message);
    }, gameId);

    await page.locator("#gsTeamB").fill("Ekipa B");
    await page.locator("#btnSaveAll").click();

    await expect(page.locator(".mSub")).toHaveText(
      "Te ustawienia zostały w międzyczasie zmienione w innym miejscu. Odśwież stronę i wprowadź zmiany ponownie.",
      { timeout: 10000 }
    );
    await page.locator(".uni-foot .btn.gold").click();

    const game = await getGameRow(page, gameId);
    expect(game.settings.teams.teamA, "zmiana zapisana bezpośrednio w bazie nie powinna zostać cicho nadpisana").toBe("Zmienione gdzie indziej");
    expect(game.settings.teams.teamB, "zapis karty w konflikcie nie powinien się wykonać wcale").not.toBe("Ekipa B");
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= C: Warstwa 2 — odświeżenie żywej listy pytań ================= */
// questions.final/rounds mogły trzymać martwe odniesienie do pytania
// usuniętego w międzyczasie gdzie indziej (np. w edytorze, inna karta).
// saveAll() teraz odświeża żywą listę pytań tuż przed zapisem i filtruje
// takie martwe id, zamiast zapisać do bazy wskazanie na coś, co już nie
// istnieje.
test("ustawienia gry: Warstwa 2 — zapis filtruje pytanie finału usunięte w międzyczasie zamiast zapisać martwe id", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, {
    settings: { game: { hasFinal: true, finalQuestionsMode: "random" } },
  });
  try {
    await addQuestionApi(page, gameId, 1, "Q1");
    const q2Id = await addQuestionApi(page, gameId, 2, "Q2");

    // Ustaw martwe odniesienie w settings.questions.final (symuluje stan
    // sprzed usunięcia Q2 — mode "random" żeby nie trafić w walidację
    // "pick wymaga 5 pytań", która sprawdza coś innego).
    await page.evaluate(async ({ id, qid, ord }) => {
      const { data } = await window.__sbClient.from("games").select("settings").eq("id", id).single();
      const next = { ...data.settings, questions: { ...data.settings.questions, final: [{ id: qid, ord, text: "Q2" }] } };
      const { error } = await window.__sbClient.from("games").update({ settings: next }).eq("id", id);
      if (error) throw new Error(error.message);
    }, { id: gameId, qid: q2Id, ord: 2 });

    // Usuń Q2 — symulacja edycji w innym miejscu, PO tym jak ustawienia
    // już wskazywały na nie jako finałowe.
    await page.evaluate(async (id) => {
      await window.__sbClient.from("questions").delete().eq("id", id);
    }, q2Id);

    await openSettings(page, gameId);
    await page.locator("#btnSaveAll").click();
    await expect(page.locator("#gsUnsavedBadge")).toBeHidden({ timeout: 10000 });

    const game = await getGameRow(page, gameId);
    const finalIds = (game.settings.questions.final || []).map((q) => q.id);
    expect(finalIds, "usunięte pytanie nie powinno zostać zapisane jako wciąż wybrane do finału").not.toContain(q2Id);
  } finally {
    await deleteGame(page, gameId);
  }
});
