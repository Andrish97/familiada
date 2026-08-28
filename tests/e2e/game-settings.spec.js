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

async function switchTab(page, cat) {
  await page.locator(`.gs-sidebar-item[data-cat="${cat}"]`).click();
}

// #btnSaveAll przełącza się disabled -> enabled we własnym try/finally
// saveAll() niezależnie od stanu isDirty — solidniejszy sygnał zakończenia
// zapisu niż #gsUnsavedBadge (patrz komentarz przy teście B).
async function saveAndWait(page) {
  await page.locator("#btnSaveAll").click();
  await expect(page.locator("#btnSaveAll")).toBeDisabled({ timeout: 10000 });
  await expect(page.locator("#btnSaveAll")).toBeEnabled({ timeout: 10000 });
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
    // #btnSaveAll jest disabled na czas zapisu i wraca enabled dopiero w
    // finally — solidniejszy sygnał zakończenia niż #gsUnsavedBadge (który
    // bywa ukryty od początku, gdy nic wcześniej nie ustawiło isDirty).
    await expect(page.locator("#btnSaveAll")).toBeDisabled({ timeout: 10000 });
    await expect(page.locator("#btnSaveAll")).toBeEnabled({ timeout: 10000 });

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
    // Tu nic wcześniej nie ustawiło isDirty, więc #gsUnsavedBadge jest
    // ukryty od początku — toBeHidden przeszłoby natychmiast bez czekania
    // na realne zakończenie zapisu. #btnSaveAll faktycznie przełącza się
    // disabled->enabled w try/finally niezależnie od stanu isDirty.
    await expect(page.locator("#btnSaveAll")).toBeDisabled({ timeout: 10000 });
    await expect(page.locator("#btnSaveAll")).toBeEnabled({ timeout: 10000 });

    const game = await getGameRow(page, gameId);
    const finalIds = (game.settings.questions.final || []).map((q) => q.id);
    expect(finalIds, "usunięte pytanie nie powinno zostać zapisane jako wciąż wybrane do finału").not.toContain(q2Id);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= Rozszerzone pokrycie game-settings.js ================= */
// Reszta rzeczywistej logiki biznesowej modułu (nie tylko dwie warstwy
// ochrony wyżej) — po jednym teście na każdą nietrywialną gałąź kodu w
// każdej zakładce, analogicznie do głębi editor.spec.js.

test("ustawienia gry: drużyny — zapis nazw persystuje po przeładowaniu strony", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await openSettings(page, gameId);
    await page.locator("#gsTeamA").fill("Czerwoni");
    await page.locator("#gsTeamB").fill("Niebiescy");
    await saveAndWait(page);

    const game = await getGameRow(page, gameId);
    expect(game.settings.teams.teamA).toBe("Czerwoni");
    expect(game.settings.teams.teamB).toBe("Niebiescy");

    // Świeże otwarcie (nie ten sam stan JS) — potwierdza że wartość jest
    // realnie w bazie, nie tylko w pamięci strony.
    await openSettings(page, gameId);
    await expect(page.locator("#gsTeamA")).toHaveValue("Czerwoni");
    await expect(page.locator("#gsTeamB")).toHaveValue("Niebiescy");
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: wygląd — zmiana koloru przez modal zapisuje się do settings", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await openSettings(page, gameId);
    await switchTab(page, "display");
    await page.locator('.swatchBtn[data-color-key="A"]').click();
    await expect(page.locator("#gsColorModal")).toBeVisible();

    await page.locator("#gsColorHex").fill("00FF00");
    await page.locator("#gsColorHex").press("Tab"); // wymusza 'change' na polu hex
    await page.locator("#gsColorModalDone").click();
    await expect(page.locator("#gsColorModal")).toBeHidden();

    await saveAndWait(page);

    const game = await getGameRow(page, gameId);
    expect(game.settings.display.colors.A).toBe("#00FF00");
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: wygląd — reset sekcji przywraca domyślne kolory", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, {
    settings: { display: { colors: { A: "#111111", B: "#222222", BACKGROUND: "#333333", DOT: "#444444" }, theme: null, logoId: null } },
  });
  try {
    await openSettings(page, gameId);
    await switchTab(page, "display");
    await expect(page.locator('.swatchBtn[data-color-key="A"]')).toHaveCSS("background-color", "rgb(17, 17, 17)");

    await page.locator("#btnDisplayReset").click();
    await page.locator(".uni-foot .btn.gold").click(); // potwierdź reset sekcji

    // Domyślny kolor A z DEFAULT_SETTINGS to #c4002f = rgb(196,0,47)
    await expect(page.locator('.swatchBtn[data-color-key="A"]')).toHaveCSS("background-color", "rgb(196, 0, 47)");

    await saveAndWait(page);

    const game = await getGameRow(page, gameId);
    expect(game.settings.display.colors.A).toBe("#c4002f");
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: dźwięk — wybranie 'Własny' bez wgranego pliku blokuje zapis komunikatem", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await openSettings(page, gameId);
    await switchTab(page, "sound");
    await expect(page.locator(".sfx-row").first()).toBeVisible({ timeout: 10000 });

    const firstRow = page.locator(".sfx-row").first();
    await firstRow.locator(".sfx-variant-select .ui-select-btn").click();
    await firstRow.locator('.ui-select-item[data-value="__custom__"]').click();

    await page.locator("#btnSaveAll").click();
    // Walidacja odpala PRZED disable/enable #btnSaveAll (return wcześniej w
    // saveAll()) — sygnałem zakończenia jest tu sam alertModal, nie przycisk.
    await expect(page.locator(".mSub")).toContainText(
      "Wybrano własny dźwięk ale nie wgrano pliku dla:",
      { timeout: 10000 }
    );
    await page.locator(".uni-foot .btn.gold").click();

    const game = await getGameRow(page, gameId);
    expect(game.settings, "zapis zablokowany walidacją nie powinien nic zmienić w bazie").toEqual({});
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: dźwięk — zmiana głośności zapisuje się do settings", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await openSettings(page, gameId);
    await switchTab(page, "sound");
    const firstRow = page.locator(".sfx-row").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    const key = await firstRow.getAttribute("data-key");

    // input[type=range] nie wspiera .fill() w Playwright — ustaw wartość i
    // wywołaj 'input' ręcznie, tak jak robi to przeciąganie suwaka.
    await firstRow.locator(".sfx-vol").evaluate((el) => {
      el.value = "42";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await saveAndWait(page);

    const game = await getGameRow(page, gameId);
    expect(game.settings.sound.volumes[key]).toBe(42);
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: finał w trybie 'wybierz' wymaga dokładnie 5 pytań — mniej blokuje zapis", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await addQuestionApi(page, gameId, 1, "Q1");
    await addQuestionApi(page, gameId, 2, "Q2");

    await openSettings(page, gameId);
    await switchTab(page, "questions");
    await page.locator('input[name="gsHasFinal"][value="yes"]').check();
    await page.locator('input[name="gsFinalMode"][value="pick"]').check();

    await switchTab(page, "finale");
    await page.locator("#gsFinalePool .qRow").first().click(); // wybierz tylko 1 z 2

    await page.locator("#btnSaveAll").click();
    await expect(page.locator(".mSub")).toHaveText(
      "Wybierz 5 pytań finałowych (wybrano 1/5).",
      { timeout: 10000 }
    );
    await page.locator(".uni-foot .btn.gold").click();

    const game = await getGameRow(page, gameId);
    expect(game.settings, "zapis zablokowany walidacją nie powinien nic zmienić w bazie").toEqual({});
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: finał — wybranie dokładnie 5 z 6 pytań zapisuje się, wyklucza je z rund, limit 5 pilnowany w UI", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    for (let i = 1; i <= 6; i++) await addQuestionApi(page, gameId, i, `Q${i}`);

    await openSettings(page, gameId);
    await switchTab(page, "questions");
    await page.locator('input[name="gsHasFinal"][value="yes"]').check();
    await page.locator('input[name="gsFinalMode"][value="pick"]').check();

    await switchTab(page, "finale");
    for (let i = 0; i < 5; i++) {
      await page.locator("#gsFinalePool .qRow").first().click();
    }
    await expect(page.locator(".badge b")).toHaveText("5");
    await expect(page.locator("#gsFinalePool .qRow")).toHaveCount(1);

    // Próba dodania 6-go — handler odrzuca po limicie, bez re-renderu
    await page.locator("#gsFinalePool .qRow").first().click();
    await expect(page.locator(".badge b")).toHaveText("5");
    await expect(page.locator("#gsFinalePool .qRow")).toHaveCount(1);

    await saveAndWait(page);

    const game = await getGameRow(page, gameId);
    expect(game.settings.questions.final).toHaveLength(5);
    expect(game.settings.questions.rounds).toHaveLength(1);
    const finalIds = new Set(game.settings.questions.final.map((q) => q.id));
    for (const q of game.settings.questions.rounds) {
      expect(finalIds.has(q.id), "pytanie finałowe nie powinno jednocześnie zostać zapisane jako rundowe").toBe(false);
    }
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: rundy — zmiana kolejności strzałką zapisuje nową kolejność", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    const q1 = await addQuestionApi(page, gameId, 1, "Alfa");
    const q2 = await addQuestionApi(page, gameId, 2, "Beta");
    const q3 = await addQuestionApi(page, gameId, 3, "Gamma");

    await openSettings(page, gameId);
    // Zakładka "rundy" jest domyślnie zablokowana w sidebarze (roundsQuestionsMode
    // startuje jako "random", updateSubTabStates dodaje gs-sidebar-item-disabled)
    // — trzeba najpierw przełączyć na "ustalona kolejność", żeby ją odblokować.
    await switchTab(page, "questions");
    await page.locator('input[name="gsRoundsMode"][value="pick"]').check();

    await switchTab(page, "rounds");
    await expect(page.locator("#gsRoundsOrderList .roundsOrderItem")).toHaveCount(3);

    // Alfa (pozycja 1) w dół -> Beta, Alfa, Gamma
    await page.locator(`.roundsOrderItem[data-qid="${q1}"] .roundsOrderBtn[data-dir="down"]`).click();

    await saveAndWait(page);

    const game = await getGameRow(page, gameId);
    expect(game.settings.questions.rounds.map((q) => q.id)).toEqual([q2, q1, q3]);
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: multiplikatory rund — niepoprawny format nie nadpisuje zapisanej wartości", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await openSettings(page, gameId);
    await switchTab(page, "game");
    await expect(page.locator("#gsMultipliers")).toHaveValue("1, 1, 1, 2, 3");

    await page.locator("#gsMultipliers").fill("abc, xyz");
    await page.locator("#gsMultipliers").press("Tab"); // wymusza 'change'

    await saveAndWait(page);

    const game = await getGameRow(page, gameId);
    expect(
      game.settings.game.advanced.roundMultipliers,
      "parsowanie zwracające 0 poprawnych liczb nie powinno nadpisać poprzedniej wartości"
    ).toEqual([1, 1, 1, 2, 3]);
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: reset wszystkich ustawień przywraca domyślne i zapisuje natychmiast", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await openSettings(page, gameId);
    await page.locator("#gsTeamA").fill("Do skasowania");
    await saveAndWait(page);

    await page.locator("#btnResetAll").click();
    await page.locator(".uni-foot .btn.gold").click(); // potwierdź reset

    // resetAll() sam wywołuje saveAll() na końcu — ten sam sygnał zakończenia
    await expect(page.locator("#btnSaveAll")).toBeDisabled({ timeout: 10000 });
    await expect(page.locator("#btnSaveAll")).toBeEnabled({ timeout: 10000 });

    const game = await getGameRow(page, gameId);
    expect(game.settings.teams.teamA).toBe("");
  } finally {
    await deleteGame(page, gameId);
  }
});

test("ustawienia gry: przycisk Wstecz z niezapisanymi zmianami pyta o potwierdzenie", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page);
  try {
    await openSettings(page, gameId);
    await page.locator("#gsTeamA").fill("Coś nowego");
    await expect(page.locator("#gsUnsavedBadge")).toBeVisible();

    await page.locator("#btnBack").click();
    await expect(page.locator(".mSub")).toHaveText(
      "Masz niezapisane zmiany. Czy chcesz opuścić stronę?",
      { timeout: 10000 }
    );

    // Anuluj — zostajemy na stronie ustawień
    await page.locator(".uni-foot .btn:not(.gold)").click();
    await expect(page).toHaveURL(/game-settings/);

    // Ponowna próba, tym razem potwierdzamy wyjście
    await page.locator("#btnBack").click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page).toHaveURL(/\/builder/, { timeout: 10000 });
  } finally {
    await deleteGame(page, gameId);
  }
});
