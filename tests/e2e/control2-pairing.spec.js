// tests/e2e/control2-pairing.spec.js
//
// Test parowania urządzeń dla Control v2 (plan, sekcja 6): logowanie,
// otwarcie control2.html, trzy dodatkowe konteksty anonimowe na
// wygenerowanych linkach display2/host2/buzzer2, weryfikacja że renderują
// się bez błędu i że Control widzi je jako połączone (obecność).
//
// Dotyka wyłącznie nowej tabeli public.game_state (i istniejącego,
// nieruszonego device_presence) — zero wpływu na dzisiejszy
// control.html/display.html i ich dane. Gra testowa tworzona i kasowana na
// koniec, jak w istniejącym game-deletion.spec.js.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test.setTimeout(90_000);

test("control2: parowanie urządzeń — linki renderują się bez błędu, Control widzi je jako online", async ({
  page,
  browser,
}) => {
  await loginAsTestUser(page, page.context());

  const gameName = `E2E-CONTROL2-PAIRING-${Date.now()}`;
  const game = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared", status: "ready" })
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);
    return data;
  }, gameName);

  const contexts = [];
  try {
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h2")).toHaveText("Podłącz wyświetlacz", { timeout: 15000 });

    const displayUrl = `/display2?id=${game.id}&key=${game.share_key_display}`;
    const hostUrl = `/host2?id=${game.id}&key=${game.share_key_host}`;
    const buzzerUrl = `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`;

    const openAnon = async (path) => {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      const p = await ctx.newPage();
      await p.goto(path, { waitUntil: "domcontentloaded" });
      return p;
    };

    const displayPage = await openAnon(displayUrl);
    // Nowa gra: żaden wiersz game_state jeszcze nie istnieje (Control nic
    // nie zapisał), więc Display powinien zostać na czarnym ekranie bez
    // błędu w konsoli — to jest właśnie "wznowienie/pierwsze wejście bez
    // specjalnego przypadku" z planu.
    await expect(displayPage.locator("#blackScreen")).not.toHaveClass(/hidden/, { timeout: 10000 });

    const hostPage = await openAnon(hostUrl);
    await expect(hostPage.locator("#paperText1")).toBeVisible({ timeout: 10000 });

    const buzzerPage = await openAnon(buzzerUrl);
    await expect(buzzerPage.locator("#offScreen")).toBeVisible({ timeout: 10000 });

    // Control powinien w końcu zobaczyć wszystkie trzy jako online (presence
    // pinguje co ~3s z urządzeń, Control odpytuje co 1.5s).
    await expect(page.locator(".c2-dot.on")).toHaveCount(1, { timeout: 15000 });

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator("h2")).toHaveText("Podłącz prowadzącego i buzzer", { timeout: 10000 });
    await expect(page.locator(".c2-dot.on")).toHaveCount(3, { timeout: 15000 });

    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await expect(page.locator("h2")).toHaveText("Ustawienia gry", { timeout: 10000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      await sb.from("games").delete().eq("id", gid);
    }, game.id);
  }
});
