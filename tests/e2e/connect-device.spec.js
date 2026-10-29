// tests/e2e/connect-device.spec.js
// Podręcznik 15.2 („QR na wyświetlaczu” na telewizorze) i 17.1 (Podłącz
// urządzenie, strona dla telewizora): wpisanie kodu bez logowania, podgląd
// nazwy gry i właściciela, Anuluj, oraz błędy — zły format, nieznany kod,
// zbyt wiele prób (odpowiedź 429 Workera), brak sieci, kod innego urządzenia
// na telewizorze. Kod urządzenia: ekran QR ankiety (poll_qr), bo powstaje bez
// sesji Control. Ścieżka Prowadzący/Przycisk/Wyświetlacz z Control: control2.spec.js.

const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");
const { seedOpenPoll } = require("./helpers/game-seed");

const PAGES = ["connect", "connect/tv", "go", "polls/vote/qr"];
test.use({ serviceWorkers: "block", needs: { standard: 1 } });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: PAGES });
});

const ORIGIN = "https://www.familijna.app";
const TV_UA = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 TV Safari/537.36";

// Otwarta ankieta właściciela i kod jej ekranu QR (jak [QR na wyświetlaczu]).
async function pollQrCode(page, name) {
  const gameId = await seedOpenPoll(page, { type: "poll_text", name });
  const code = await page.evaluate(async ({ gameId, name }) => {
    const sb = window.__sbClient;
    const { data: g } = await sb.from("games").select("share_key_poll").eq("id", gameId).single();
    const { data, error } = await sb.rpc("generate_device_connect_code", { p_game_id: gameId, p_device_type: "poll_qr", p_share_key: g.share_key_poll, p_game_name: name });
    if (error || !data?.ok) throw new Error("generate_device_connect_code: " + (error?.message || JSON.stringify(data)));
    return data.code;
  }, { gameId, name });
  return { gameId, code };
}

async function anonymousContext(browser, options = {}) {
  const context = await browser.newContext({ serviceWorkers: "block", locale: "pl-PL", ...options });
  await context.addInitScript(() => { try { localStorage.setItem("uiLang", "pl"); } catch {} });
  await serveBranchCode(context, { pages: PAGES });
  return context;
}

const resolveWith = (page, response) => page.route("**/_api/device/resolve", (route) => response(route));

test("17.1 Podłącz urządzenie: zły format, nieznany kod, 429 i brak sieci — komunikat, bez przejścia dalej", async ({ browser }) => {
  const context = await anonymousContext(browser);
  try {
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/connect/`, { waitUntil: "domcontentloaded" });
    const input = page.locator("#connectCodeInput");
    const msg = page.locator("#connectCodeMsg");
    await expect(input).toBeVisible();

    for (const bad of ["12345", "abcdef", ""]) {
      await input.fill(bad);
      await page.locator("#btnConnectCode").click();
      await expect(msg).toHaveText("Wprowadź 6-cyfrowy kod.");
    }
    // Pole przyjmuje najwyżej 6 znaków.
    await input.fill("1234567");
    expect((await input.inputValue()).length).toBeLessThanOrEqual(6);

    await resolveWith(page, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, err: "not_found" }) }));
    await input.fill("000001");
    await input.press("Enter");
    await expect(msg).toHaveText("Nie znaleziono urządzenia dla tego kodu. Sprawdź czy kod jest poprawny.");

    await page.unroute("**/_api/device/resolve");
    await resolveWith(page, (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, err: "rate_limited" }) }));
    await page.locator("#btnConnectCode").click();
    await expect(msg).toHaveText("Zbyt wiele nieudanych prób. Spróbuj ponownie za kilka minut.");
    await expect(page.locator("#btnConnectCode")).toBeEnabled();

    await page.unroute("**/_api/device/resolve");
    await resolveWith(page, (route) => route.abort("internetdisconnected"));
    await page.locator("#btnConnectCode").click();
    await expect(msg).toHaveText("Nie udało się połączyć. Sprawdź połączenie internetowe i spróbuj ponownie.");
    await expect(page.locator("#btnConnectCode")).toBeEnabled();
    expect(new URL(page.url()).pathname).toBe("/connect/");
    await expect(page.locator(".uni-foot")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("15.2/17.1 Podłącz urządzenie bez logowania: kod ekranu QR pokazuje grę i właściciela, Anuluj zostaje, Połącz otwiera ekran", async ({ page, context, browser, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const name = `E2E-connect-${Date.now()}`;
  const { gameId, code } = await pollQrCode(page, name);
  const anon = await anonymousContext(browser);
  try {
    const p = await anon.newPage();
    await p.goto(`${ORIGIN}/connect/`, { waitUntil: "domcontentloaded" });
    await p.locator("#connectCodeInput").fill(code);
    await p.locator("#btnConnectCode").click();
    const dialog = p.locator(".uni-foot").locator("..");
    await expect(p.getByText("Wyświetlacz QR")).toBeVisible({ timeout: 15000 });
    await expect(p.getByText(`Gra: ${name}`)).toBeVisible();
    await expect(p.getByText(`Właściciel: ${accounts.standard[0].username}`)).toBeVisible();
    await p.locator(".uni-foot .btn:not(.gold):visible").click();
    await expect(dialog).toBeHidden();
    expect(new URL(p.url()).pathname).toBe("/connect/");

    await p.locator("#btnConnectCode").click();
    await p.locator(".uni-foot .btn.gold:visible").click();
    await expect.poll(() => new URL(p.url()).pathname, { timeout: 15000 }).toBe("/polls/vote/qr/");
    expect(new URL(p.url()).searchParams.get("id")).toBe(gameId);
  } finally {
    await anon.close();
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

test("15.2/17.1 telewizor: kod ekranu QR ankiety otwiera ekran; zły format, nieznany kod, 429, kod Prowadzącego i brak sieci — komunikaty", async ({ page, context, browser, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const { gameId, code } = await pollQrCode(page, `E2E-tv-${Date.now()}`);
  const tv = await anonymousContext(browser, { userAgent: TV_UA, viewport: { width: 1920, height: 1080 }, screen: { width: 1920, height: 1080 } });
  try {
    const p = await tv.newPage();
    await p.goto(`${ORIGIN}/connect/tv/`, { waitUntil: "domcontentloaded" });
    const input = p.locator("#tvCode");
    const msg = p.locator("#tvMessage");
    await expect(input).toBeFocused({ timeout: 15000 });

    // Pole przyjmuje tylko cyfry, najwyżej 6.
    await input.pressSequentially("12ab34567");
    await expect(input).toHaveValue("123456");
    await input.fill("12");
    await input.press("Enter");
    await expect(msg).toHaveText("Wpisz 6-cyfrowy kod Wyświetlacza lub ekranu QR ankiety.");

    const cases = [
      [{ status: 200, body: { ok: false, err: "not_found" } }, "Kod jest nieprawidłowy lub wygasł. Sprawdź kod w panelu sterowania."],
      [{ status: 429, body: { ok: false, err: "rate_limited" } }, "Zbyt wiele nieudanych prób. Spróbuj ponownie za kilka minut."],
      [{ status: 200, body: { ok: true, device_type: "host", game_id: gameId, share_key: "x" } }, "Ten kod nie jest kodem wyświetlacza. Pasuje też kod ekranu QR z ankiety."],
      [null, "Nie udało się połączyć. Sprawdź połączenie internetowe i spróbuj ponownie."],
    ];
    for (const [response, text] of cases) {
      await p.unroute("**/_api/device/resolve");
      await resolveWith(p, (route) => response
        ? route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) })
        : route.abort("internetdisconnected"));
      await input.fill("123456");
      await p.keyboard.press("ArrowDown");
      await expect(p.locator("#tvConnect")).toBeFocused();
      await p.keyboard.press("Enter");
      await expect(msg).toHaveText(text);
      expect(new URL(p.url()).pathname).toBe("/connect/tv/");
    }

    await p.unroute("**/_api/device/resolve");
    await input.fill(code);
    await input.press("Enter");
    await expect.poll(() => new URL(p.url()).pathname, { timeout: 15000 }).toBe("/polls/vote/qr/");
  } finally {
    await tv.close();
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});
