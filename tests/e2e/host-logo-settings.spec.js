const { test, expect } = require("./helpers/production-test");
const { loginAsTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const ORIGIN = "https://www.familiada.online";

test.use({ serviceWorkers: "block" });

async function createHostLogoGame(page) {
  return page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: auth, error: authError } = await sb.auth.getUser();
    if (authError || !auth?.user) throw new Error(authError?.message || "No authenticated user");
    const { data: game, error } = await sb.from("games").insert({
      name: `E2E-HOST-LOGO-SETTINGS-${Date.now()}`,
      owner_id: auth.user.id,
      type: "prepared",
      status: "ready",
      settings: {
        teams: { teamA: "Alfa", teamB: "Beta" },
        game: { hasFinal: false },
        display: { mode: "GAME", theme: "classic", colors: { A: "#c4002f", B: "#2a62ff", BACKGROUND: "#171923", DOT: "#ffcc00" }, hostLogoMode: "pixel" },
      },
    }).select("id,share_key_display,share_key_host,share_key_buzzer").single();
    if (error) throw new Error(`insert game: ${error.message}`);
    for (let ord = 1; ord <= 10; ord++) {
      const { data: question, error: qError } = await sb.from("questions")
        .insert({ game_id: game.id, ord, text: `Pytanie testowe ${ord}` }).select("id").single();
      if (qError) throw new Error(`insert question: ${qError.message}`);
      const { error: answerError } = await sb.from("answers").insert([
        { question_id: question.id, ord: 1, text: "Odpowiedz A", fixed_points: 40 },
        { question_id: question.id, ord: 2, text: "Odpowiedz B", fixed_points: 30 },
        { question_id: question.id, ord: 3, text: "Odpowiedz C", fixed_points: 20 },
      ]);
      if (answerError) throw new Error(`insert answers: ${answerError.message}`);
    }
    return game;
  });
}

async function deleteHostLogoGame(page, gameId) {
  if (!gameId) return;
  await page.evaluate(async id => {
    const { error } = await window.__sbClient.from("games").delete().eq("id", id);
    if (error) throw new Error(`delete game: ${error.message}`);
  }, gameId);
}

test("logo Hosta: zapis w Ustawieniach rozgrywki i podgląd zapisanego wariantu w Control (test9)", async ({ page, browser, context }, testInfo) => {
  test.setTimeout(150_000);
  // Konto 9 jest przeznaczone wyłącznie do tych dedykowanych testów; nie jest
  // dodawane do puli kont współdzielonej przez przebiegi Control.
  await serveBranchCode(context, { pages: ["game-settings", "control", "host", "display"] });
  await loginAsTestUser(page, context, { username: "test9@familiada.online" });
  let game;
  let displayContext;
  try {
    game = await createHostLogoGame(page);
    await page.goto(`${ORIGIN}/game-settings?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#btnSaveAll")).toBeVisible({ timeout: 20_000 });
    // The page skeleton exposes the footer before async setup finishes; wait
    // for the first rendered category so the sidebar handler is installed.
    await expect(page.locator("#gsTeamA")).toBeVisible({ timeout: 20_000 });
    await page.locator('.gs-sidebar-item[data-cat="display"]').click();
    await expect(page.locator('.gs-sidebar-item[data-cat="display"]')).toHaveClass(/\bactive\b/);
    await expect(page.locator("#gsLivePreviewWrap")).toBeVisible();

    const hostPreview = page.frameLocator("#gsHostPreview");
    await expect(page.locator("#gsHostPreview")).toBeVisible();
    await expect(page.locator("#gsDisplayPreview")).toBeVisible();
    await expect(page.locator('input[name="gsHostLogoMode"][value="pixel"]')).toBeChecked();
    // Radio inputs are visually hidden behind the designed toggle; click the
    // actual visible control, then assert the input state it drives.
    await page.locator(".gs-host-logo-mode .toggle-item").nth(1).click();
    await expect(page.locator('input[name="gsHostLogoMode"][value="source"]')).toBeChecked();
    await page.locator("#gsThemeSelect .ui-select-btn").click();
    await page.locator('#gsThemeSelect .ui-select-item[data-value="modern"]').click();
    await page.locator('.swatchBtn[data-color-key="DOT"]').click();
    await page.locator("#gsColorHex").fill("#33aaff");
    await page.locator("#gsColorHex").press("Tab");
    await page.locator("#gsColorModalDone").click();
    await expect(hostPreview.locator("#cover2Logo")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => hostPreview.locator("html").evaluate(el => getComputedStyle(el).getPropertyValue("--host-cover-accent").trim().toLowerCase())).toBe("#33aaff");
    await page.screenshot({ path: testInfo.outputPath("shot-host-logo-game-settings.png"), fullPage: true });

    const save = page.locator("#btnSaveAll");
    const [saveResponse] = await Promise.all([
      page.waitForResponse(response => response.url().includes("/rest/v1/games") && response.request().method() === "PATCH"),
      save.click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();
    const persistedMode = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("games").select("settings").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data.settings?.display;
    }, game.id);
    expect(persistedMode.hostLogoMode).toBe("source");
    expect(persistedMode.theme).toBe("modern");
    expect(persistedMode.colors.DOT.toLowerCase()).toBe("#33aaff");

    // A fresh settings load must restore the selected option, not just the
    // in-memory preview state.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('.gs-sidebar-item[data-cat="display"]').click();
    await expect(page.locator('input[name="gsHostLogoMode"][value="source"]')).toBeChecked();

    displayContext = await browser.newContext({ locale: "pl-PL" });
    await serveBranchCode(displayContext, { pages: ["display"] });
    const displayPage = await displayContext.newPage();
    await displayPage.goto(`${ORIGIN}/display?id=${game.id}&key=${game.share_key_display}`, { waitUntil: "domcontentloaded" });

    await page.goto(`${ORIGIN}/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 20_000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 20_000 });
    await page.getByLabel("Przycisk fizyczny").check();
    await page.getByLabel("Nie używaj tabletu prowadzącego").check();
    await page.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 15_000 });
    await expect(page.locator("#c2-summary-display")).toContainText("Źródło");
    await expect(page.locator("#c2-summary-display")).toContainText("Nowoczesny");
    await expect(page.locator("#c2-summary-display .summaryDisplayInfo .summaryDisplayRow:first-child > span:last-child span").nth(3)).toHaveCSS("background-color", "rgb(51, 170, 255)");
    await expect(page.locator("#c2DisplayPreview iframe")).toBeVisible();
    await expect(page.locator("#c2HostPreview iframe")).toBeVisible();
    const controlHost = page.frameLocator("#c2HostPreview iframe");
    await expect(controlHost.locator("#cover2Logo")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => controlHost.locator("html").evaluate(el => getComputedStyle(el).getPropertyValue("--host-cover-accent").trim().toLowerCase())).toBe("#33aaff");
    await page.screenshot({ path: testInfo.outputPath("shot-host-logo-control-summary.png"), fullPage: true });
  } finally {
    await displayContext?.close();
    await page.goto(`${ORIGIN}/games/`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await deleteHostLogoGame(page, game?.id).catch(() => {});
  }
});
