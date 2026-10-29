// tests/e2e/editor-actions.spec.js
// Podręcznik 7.2–7.7 (edytor gry): czynności bez testu i warianty „źle /
// podejrzanie” -- usuwanie pytania z Anuluj, domyślne „ODP n”, Enter w nazwie,
// kafel „Dodaj odpowiedź” n/6, widok typów gry, blokada przy zatrzymanej
// ankiecie, import TXT (@Nazwa, numeracja, punkty, błędy z miejscem, Anuluj),
// „Wstecz” na węższym ekranie. Strony z kodu brancha, baza produkcyjna;
// lokalnie scripts/agent-tools/local-e2e.

const { test, expect } = require("./helpers/e2e-test");
const { seedOpenPoll } = require("./helpers/game-seed");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", needs: { standard: 1 } });

const ORIGIN = "https://www.familijna.app";

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["games/editor", "games"] });
  await context.addInitScript(() => localStorage.setItem("uiLang", "pl"));
});

/* ================= Pomocnicze ================= */

async function seedGame(page, { type = "prepared", name, questions = 1, answers = [40, 30, 20] }) {
  return await page.evaluate(async ({ type, name, questions, answers }) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const { data: g, error } = await sb.from("games").insert({ name, owner_id: u.user.id, type }).select("id").single();
    if (error) throw new Error("insert game: " + error.message);
    const { data: qs, error: qErr } = await sb.from("questions")
      .insert(Array.from({ length: questions }, (_, i) => ({ game_id: g.id, ord: i + 1, text: `Pytanie ${i + 1}` }))).select("id,ord");
    if (qErr) throw new Error("insert questions: " + qErr.message);
    if (answers.length) {
      const { error: aErr } = await sb.from("answers")
        .insert(qs.flatMap((q) => answers.map((p, i) => ({ question_id: q.id, ord: i + 1, text: `Odp ${i + 1}`, fixed_points: p }))));
      if (aErr) throw new Error("insert answers: " + aErr.message);
    }
    return { id: g.id, questionIds: qs.sort((a, b) => a.ord - b.ord).map((q) => q.id) };
  }, { type, name, questions, answers });
}

async function content(page, gameId) {
  return await page.evaluate(async (id) => {
    const sb = window.__sbClient;
    const { data: g } = await sb.from("games").select("name").eq("id", id).single();
    const { data, error } = await sb.from("questions").select("id,ord,text,answers(ord,text,fixed_points)").eq("game_id", id).order("ord");
    if (error) throw new Error(error.message);
    return { name: g?.name, questions: data.map((q) => ({ id: q.id, ord: q.ord, text: q.text, answers: q.answers.sort((a, b) => a.ord - b.ord) })) };
  }, gameId);
}

async function deleteGame(page, id) {
  await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, id);
}

async function bootstrap(page, context, loginAs, identity) {
  await loginAs(page, context, identity);
  await page.goto(`${ORIGIN}/games/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 30_000 });
}

async function openEditor(page, gameId) {
  await page.goto(`${ORIGIN}/games/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#qList .qcard:not(.addCard)").first()).toBeVisible({ timeout: 30_000 });
}

const qCard = (page, i) => page.locator("#qList .qcard:not(.addCard)").nth(i);
const aRows = (page) => page.locator("#aList .qf-row:not(.qf-add)");
const modalOk = (page) => page.locator(".uni-modal:visible .uni-foot .btn.gold");
const modalCancel = (page) => page.locator(".uni-modal:visible .uni-foot .btn:not(.gold)");

/* ================= 7.2 — lista pytań ================= */

test("usuwanie pytania: okno potwierdzenia; Anuluj zostawia pytanie, potwierdzenie usuwa je z odpowiedziami i przenumerowuje resztę", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await bootstrap(page, context, loginAs, accounts.standard[0]);
  const game = await seedGame(page, { name: `E2E-EA-DELQ-${Date.now()}`, questions: 3 });
  try {
    await openEditor(page, game.id);
    await qCard(page, 1).locator(".x").click();
    await expect(page.locator(".uni-modal:visible")).toContainText("Usunąć to pytanie i wszystkie jego odpowiedzi?");
    await modalCancel(page).click();
    await expect(page.locator("#qList .qcard:not(.addCard)")).toHaveCount(3);
    expect((await content(page, game.id)).questions).toHaveLength(3);

    await qCard(page, 1).locator(".x").click();
    await modalOk(page).click();
    await expect(page.locator("#qList .qcard:not(.addCard)")).toHaveCount(2, { timeout: 15_000 });
    const after = await content(page, game.id);
    expect(after.questions.map((q) => `${q.ord}:${q.text}`)).toEqual(["1:Pytanie 1", "2:Pytanie 3"]);
    expect(after.questions.some((q) => q.id === game.questionIds[1])).toBe(false);
    const orphans = await page.evaluate(async (qid) => (await window.__sbClient.from("answers").select("id").eq("question_id", qid)).data.length, game.questionIds[1]);
    expect(orphans, "odpowiedzi usuniętego pytania").toBe(0);
  } finally {
    await deleteGame(page, game.id);
  }
});

/* ================= 7.3 / 7.5 — odpowiedzi, autozapis ================= */

test("pusta odpowiedź zapisuje się jako „ODP n”; Enter w polu nazwy zapisuje nazwę gry", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await bootstrap(page, context, loginAs, accounts.standard[0]);
  const game = await seedGame(page, { name: `E2E-EA-ODP-${Date.now()}` });
  try {
    await openEditor(page, game.id);
    await qCard(page, 0).click();
    const second = aRows(page).nth(1).locator(".qf-text");
    await expect(second).toHaveValue("Odp 2", { timeout: 15_000 });
    await second.fill("");
    await second.blur();
    await expect.poll(async () => (await content(page, game.id)).questions[0].answers[1].text, { timeout: 10_000 }).toBe("ODP 2");
    await expect(second).toHaveValue("ODP 2");

    const newName = `E2E-EA-ODP-ENTER-${Date.now()}`;
    await page.locator("#gameName").fill(newName);
    await page.locator("#gameName").press("Enter");
    await expect.poll(async () => (await content(page, game.id)).name, { timeout: 10_000 }).toBe(newName);
  } finally {
    await deleteGame(page, game.id);
  }
});

test("kafel „Dodaj odpowiedź” liczy n/6 i przy 6 jest wyłączony; baza nie przyjmie 7. odpowiedzi z pominięciem edytora", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await bootstrap(page, context, loginAs, accounts.standard[0]);
  const game = await seedGame(page, { name: `E2E-EA-SIX-${Date.now()}`, answers: [20, 20, 20, 10, 10] });
  try {
    await openEditor(page, game.id);
    await qCard(page, 0).click();
    const add = page.locator("#aList .qf-add");
    await expect(add.locator(".qf-addCnt")).toHaveText("5/6", { timeout: 15_000 });
    await expect(add).toBeEnabled();
    await add.click();
    await expect(aRows(page)).toHaveCount(6, { timeout: 10_000 });
    await expect(add.locator(".qf-addCnt")).toHaveText("6/6");
    await expect(add).toBeDisabled();
    await expect(add.locator(".qf-addLbl")).toHaveText("Limit odpowiedzi osiągnięty");
    expect((await content(page, game.id)).questions[0].answers).toHaveLength(6);

    const direct = await page.evaluate(async (qid) => {
      const { error } = await window.__sbClient.from("answers").insert({ question_id: qid, ord: 7, text: "SIODMA", fixed_points: 5 });
      return error?.message || "ok";
    }, game.questionIds[0]);
    expect(direct, "7. odpowiedź zapisem z przeglądarki").not.toBe("ok");
  } finally {
    await deleteGame(page, game.id);
  }
});

test("rodzaje gry w edytorze: Punktacja bez punktów, ankieta tekstowa bez odpowiedzi, preparowana z punktami; listy warunków z właściwym nagłówkiem", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(120_000);
  await bootstrap(page, context, loginAs, accounts.standard[0]);
  const stamp = Date.now();
  const games = [];
  try {
    games.push(await seedGame(page, { type: "poll_points", name: `E2E-EA-TYPE-PTS-${stamp}`, answers: [0, 0, 0] }));
    games.push(await seedGame(page, { type: "poll_text", name: `E2E-EA-TYPE-TXT-${stamp}`, answers: [] }));
    games.push(await seedGame(page, { type: "prepared", name: `E2E-EA-TYPE-PREP-${stamp}` }));

    await openEditor(page, games[0].id);
    await qCard(page, 0).click();
    await expect(aRows(page)).toHaveCount(3, { timeout: 15_000 });
    await expect(page.locator("#aList .qf-pts")).toHaveCount(0);
    await expect(page.locator("#hintTop")).toHaveText("Ankietę uruchomisz, gdy:");
    await expect(page.locator("#hintBottom")).toHaveText("Punktów nie wpisujesz — policzy je ankieta z głosów uczestników.");
    await expect(page.locator("#rulesList li")).toHaveText(["Co najmniej 10 pytań (jest 1)", "W każdym pytaniu 3–6 odpowiedzi"]);

    await openEditor(page, games[1].id);
    await qCard(page, 0).click();
    await expect(page.locator("#qText")).toHaveValue("Pytanie 1", { timeout: 15_000 });
    await expect(page.locator("#aList")).toBeHidden();
    await expect(page.locator("#hintBottom")).toHaveText("Odpowiedzi wpiszą uczestnicy ankiety.");
    await expect(page.locator("#rulesList li")).toHaveText(["Co najmniej 10 pytań (jest 1)"]);
    await expect(qCard(page, 0).locator(".qmeta")).toHaveText("Tylko pytania");

    await openEditor(page, games[2].id);
    await qCard(page, 0).click();
    await expect(page.locator("#aList .qf-pts")).toHaveCount(3, { timeout: 15_000 });
    await expect(page.locator("#hintTop")).toHaveText("Gra będzie gotowa, gdy:");
    await expect(page.locator("#rulesList li")).toHaveCount(4);
    await expect(qCard(page, 0).locator(".qmeta")).toHaveText("3/6 odpowiedzi • suma 90/100");
  } finally {
    for (const g of games) await deleteGame(page, g.id);
  }
});

/* ================= 7.5 — blokady ================= */

test("zatrzymana ankieta: edytor zablokowany z powodem, powrót do listy; zapis treści z pominięciem edytora odrzucony", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await bootstrap(page, context, loginAs, accounts.standard[0]);
  const id = await seedOpenPoll(page, { type: "poll_text", name: `E2E-EA-STOP-${Date.now()}` });
  try {
    await page.evaluate(async (id) => {
      const { error } = await window.__sbClient.rpc("poll_stop", { p_game_id: id });
      if (error) throw new Error("poll_stop: " + error.message);
    }, id);
    await page.goto(`${ORIGIN}/games/editor?id=${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#resourceLockGuardMsg")).toHaveText("Ankieta jest zatrzymana — edycja zablokowana. Przerwij ankietę, żeby edytować.");

    const direct = await page.evaluate(async (id) => {
      const sb = window.__sbClient;
      const { data: q } = await sb.from("questions").select("id").eq("game_id", id).eq("ord", 1).single();
      const upd = await sb.from("questions").update({ text: "Zmiana w zatrzymanej" }).eq("id", q.id);
      const add = await sb.from("questions").insert({ game_id: id, ord: 11, text: "Nowe" });
      const { data: after } = await sb.from("questions").select("text").eq("id", q.id).single();
      return { upd: upd.error?.message || "ok", add: add.error?.message || "ok", text: after.text };
    }, id);
    expect(direct.upd).toContain("game_content_locked:poll_stopped");
    expect(direct.add).toContain("game_content_locked:poll_stopped");
    expect(direct.text).toBe("Pytanie 1");

    await page.locator("#resourceLockGuardBack").click();
    await page.waitForURL(/\/games\/?(?:\?[^/]*)?$/, { timeout: 15_000 });
  } finally {
    await deleteGame(page, id);
  }
});

/* ================= 7.7 — import z pliku tekstowego ================= */

test("import TXT: @Nazwa ustawia nazwę gry, numery „1.”, „2)”, „3 -”, „4:” pominięte, punkty po „/”; podgląd liczy pytania i odpowiedzi", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await bootstrap(page, context, loginAs, accounts.standard[0]);
  const game = await seedGame(page, { name: `E2E-EA-TXT-${Date.now()}` });
  const newName = `E2E-EA-TXT-NAZWA-${Date.now()}`;
  try {
    await openEditor(page, game.id);
    await page.locator("#btnImportTxt").click();
    await page.locator("#txtTa").fill([
      `@${newName}`,
      "# Pierwsze pytanie",
      "1. alfa / 40",
      "2) beta / 30",
      "3 - gamma / 20",
      "4: delta / 5",
      "# Drugie pytanie",
      "raz",
      "dwa",
      "trzy",
    ].join("\n"));
    await expect(page.locator("#txtPreviewBody .import-preview-summary")).toHaveText("2 pytań · 7 odpowiedzi");
    await page.locator("#btnTxtImport").click();
    await expect(page.locator(".uni-modal:visible")).toContainText("Import TXT ZASTĄPI zawartość gry");
    await modalOk(page).click();
    await expect(page.locator("#txtImportOverlay")).toBeHidden({ timeout: 20_000 });

    const after = await content(page, game.id);
    expect(after.name).toBe(newName);
    await expect(page.locator("#gameName")).toHaveValue(newName);
    expect(after.questions.map((q) => q.text)).toEqual(["Pierwsze pytanie", "Drugie pytanie"]);
    expect(after.questions[0].answers.map((a) => `${a.text}:${a.fixed_points}`)).toEqual(["alfa:40", "beta:30", "gamma:20", "delta:5"]);
    expect(after.questions[1].answers.map((a) => `${a.text}:${a.fixed_points}`)).toEqual(["raz:0", "dwa:0", "trzy:0"]);
  } finally {
    await deleteGame(page, game.id);
  }
});

test("import TXT: odpowiedź przed pierwszym pytaniem i znak spoza Wyświetlacza -- błąd z miejscem, nic się nie zmienia; Anuluj w potwierdzeniu też", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await bootstrap(page, context, loginAs, accounts.standard[0]);
  const game = await seedGame(page, { name: `E2E-EA-TXTERR-${Date.now()}` });
  try {
    const before = await content(page, game.id);
    await openEditor(page, game.id);
    await page.locator("#btnImportTxt").click();

    await page.locator("#txtTa").fill("sierota\n# Pytanie\na\nb\nc");
    await expect(page.locator("#txtPreviewBody")).toHaveClass(/is-error/);
    await page.locator("#btnTxtImport").click();
    await expect(page.locator("#txtMsg")).toHaveText("Błąd układu: odpowiedź przed pierwszym pytaniem (linia 1).", { timeout: 10_000 });
    await expect(page.locator(".uni-modal:visible")).toHaveCount(0);

    await page.locator("#txtTa").fill("# Pytanie\nkawa😀\nb\nc");
    await page.locator("#btnTxtImport").click();
    await expect(page.locator("#txtMsg")).toHaveText("Pytanie 1, odpowiedź 1: znaki, których nie ma Wyświetlacz: 😀. Usuń je, aby zaimportować.", { timeout: 10_000 });
    await expect(page.locator("#txtImportOverlay")).toBeVisible();

    await page.locator("#txtTa").fill("# Poprawne\na\nb\nc");
    await page.locator("#btnTxtImport").click();
    await expect(page.locator(".uni-modal:visible")).toContainText("Import TXT ZASTĄPI zawartość gry");
    await modalCancel(page).click();
    await page.waitForTimeout(800);

    expect(await content(page, game.id), "żaden z nieudanych / anulowanych importów nie zmienia gry").toEqual(before);
  } finally {
    await deleteGame(page, game.id);
  }
});

/* ================= 7.2 — węższy ekran ================= */

test("węższy ekran: lista pytań albo wybrane pytanie; „Wstecz” wraca do listy, a z listy do Moich gier", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await bootstrap(page, context, loginAs, accounts.standard[0]);
  const game = await seedGame(page, { name: `E2E-EA-NARROW-${Date.now()}`, questions: 2 });
  try {
    await page.setViewportSize({ width: 900, height: 1000 });
    await openEditor(page, game.id);
    await qCard(page, 1).click();
    await expect(page.locator("body")).toHaveClass(/mobile-editing/);
    await expect(page.locator("#qText")).toBeVisible();
    await expect(page.locator("#qText")).toHaveValue("Pytanie 2");
    await expect(page.locator("#qList")).toBeHidden();
    await expect(page.locator("#btnBack")).toHaveText(/Wstecz/);
    await page.locator("#btnBack").click();
    await expect(page.locator("body")).not.toHaveClass(/mobile-editing/);
    await expect(page.locator("#qList")).toBeVisible();
    await expect(page).toHaveURL(/\/games\/editor/);
    await page.locator("#btnBack").click();
    await page.waitForURL(/\/games\/?(?:\?[^/]*)?$/, { timeout: 15_000 });
    await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 30_000 });
  } finally {
    await deleteGame(page, game.id);
  }
});
