// tests/e2e/games-foreign.spec.js
// Podręcznik 6–7 i 16, wariant podejrzany: cudza gra wpisana w adres edytora
// i ustawień oraz zapis cudzej gry z pominięciem interfejsu. Strona widzi
// tylko „brak gry”, baza nie zmienia niczego właścicielowi. Strony z kodu
// brancha, baza produkcyjna; lokalnie scripts/agent-tools/local-e2e.
// Strona serwera tych samych zasad: tests/sql/cross-user-fuzz.sql.

const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", needs: { standard: 2 } });

const ORIGIN = "https://www.familijna.app";

async function signedIn(browser, loginAs, identity) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await serveBranchCode(ctx, { pages: ["games", "games/editor", "games/settings"] });
  await ctx.addInitScript(() => localStorage.setItem("uiLang", "pl"));
  const page = await ctx.newPage();
  await loginAs(page, ctx, identity);
  await page.goto(`${ORIGIN}/games/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 30_000 });
  return { ctx, page };
}

test("cudza gra: edytor i ustawienia z adresu pokazują „brak gry”, zapisy i RPC z pominięciem interfejsu niczego nie zmieniają", async ({ browser, accounts, loginAs }) => {
  test.setTimeout(150_000);
  const [ownerId, intruderId] = accounts.standard;
  const owner = await signedIn(browser, loginAs, ownerId);
  const intruder = await signedIn(browser, loginAs, intruderId);
  const name = `E2E-FOREIGN-${Date.now()}`;
  let gameId = null;
  try {
    const seeded = await owner.page.evaluate(async (name) => {
      const sb = window.__sbClient;
      const { data: u } = await sb.auth.getUser();
      const { data: g, error } = await sb.from("games").insert({ name, owner_id: u.user.id, type: "prepared" }).select("id").single();
      if (error) throw new Error(error.message);
      const { data: qs } = await sb.from("questions")
        .insert(Array.from({ length: 10 }, (_, i) => ({ game_id: g.id, ord: i + 1, text: `Pytanie ${i + 1}` }))).select("id");
      await sb.from("answers").insert(qs.flatMap((q) => [40, 30, 20].map((p, j) => ({ question_id: q.id, ord: j + 1, text: `Odp ${j + 1}`, fixed_points: p }))));
      return { id: g.id, questionId: qs[0].id };
    }, name);
    gameId = seeded.id;

    // edytor: komunikat zostaje do OK, potem lista gier
    await intruder.page.goto(`${ORIGIN}/games/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await expect(intruder.page.locator(".uni-modal:visible")).toContainText("Ta gra nie istnieje albo nie masz do niej dostępu.", { timeout: 20_000 });
    await expect(intruder.page.locator("#qList .qcard:not(.addCard)")).toHaveCount(0);
    await intruder.page.locator(".uni-modal:visible .uni-foot .btn").first().click();
    await intruder.page.waitForURL(/\/games\/?(?:\?[^/]*)?$/, { timeout: 15_000 });

    // ustawienia: blokada „Brak gry.”, bez formularza
    await intruder.page.goto(`${ORIGIN}/games/settings?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await expect(intruder.page.locator("#resourceLockGuard")).toBeVisible({ timeout: 20_000 });
    await expect(intruder.page.locator("#resourceLockGuardMsg")).toHaveText("Brak gry.");
    await expect(intruder.page.locator("#gsTeamA")).toHaveCount(0);

    // zmyślony identyfikator w adresie: ten sam komunikat, bez surowego błędu bazy
    await intruder.page.goto(`${ORIGIN}/games/settings?id=nie-ma-takiej-gry`, { waitUntil: "domcontentloaded" });
    await expect(intruder.page.locator("#resourceLockGuardMsg")).toHaveText("Brak gry.", { timeout: 20_000 });
    await expect(intruder.page.locator(".callout--bad")).toHaveCount(0);
    await intruder.page.goto(`${ORIGIN}/games/editor?id=nie-ma-takiej-gry`, { waitUntil: "domcontentloaded" });
    await expect(intruder.page.locator(".uni-modal:visible")).toContainText("Ta gra nie istnieje albo nie masz do niej dostępu.", { timeout: 20_000 });

    // zapisy i RPC z pominięciem interfejsu
    await intruder.page.goto(`${ORIGIN}/games/`, { waitUntil: "domcontentloaded" });
    await intruder.page.waitForFunction(() => !!window.__sbClient, null, { timeout: 30_000 });
    await expect(intruder.page.locator("#grid .card", { hasText: name })).toHaveCount(0);
    const attempts = await intruder.page.evaluate(async ({ gameId, questionId }) => {
      const sb = window.__sbClient;
      const out = {};
      const seen = await sb.from("games").select("id").eq("id", gameId);
      out.read = (seen.data || []).length;
      const upd = await sb.from("games").update({ name: "PRZEJĘTA", settings: { teams: { teamA: "X" } } }).eq("id", gameId).select("id");
      out.update = (upd.data || []).length;
      const q = await sb.from("questions").update({ text: "Cudza zmiana" }).eq("id", questionId).select("id");
      out.question = (q.data || []).length;
      const add = await sb.from("questions").insert({ game_id: gameId, ord: 11, text: "Dopisane" });
      out.insert = add.error ? "error" : "ok";
      const del = await sb.rpc("delete_resource_checked", { p_resource_type: "game", p_resource_id: gameId, p_tab_id: crypto.randomUUID() });
      out.delete = !del.error && del.data?.ok === true;
      const ren = await sb.rpc("rename_resource_checked", { p_resource_type: "game", p_resource_id: gameId, p_name: "PRZEJĘTA", p_tab_id: crypto.randomUUID() });
      out.rename = !ren.error && ren.data?.ok === true;
      const ct = await sb.rpc("game_change_type", { p_game_id: gameId, p_type: "poll_text", p_reset: false, p_keep: false });
      out.changeType = !ct.error && ct.data?.ok === true;
      const val = await sb.rpc("game_validate", { p_game_id: gameId });
      out.validate = !val.error && val.data?.ok === true;
      return out;
    }, { gameId, questionId: seeded.questionId });
    expect(attempts).toEqual({ read: 0, update: 0, question: 0, insert: "error", delete: false, rename: false, changeType: false, validate: false });

    const after = await owner.page.evaluate(async ({ gameId, questionId }) => {
      const sb = window.__sbClient;
      const { data: g, error: gErr } = await sb.from("games").select("name,type,settings").eq("id", gameId).single();
      if (!g) throw new Error("owner read: " + (gErr?.message || "brak"));
      const { data: q } = await sb.from("questions").select("text").eq("id", questionId).single();
      const { count } = await sb.from("questions").select("id", { count: "exact", head: true }).eq("game_id", gameId);
      return { name: g.name, type: g.type, teamA: g.settings?.teams?.teamA ?? null, text: q.text, count };
    }, { gameId, questionId: seeded.questionId });
    expect(after).toEqual({ name, type: "prepared", teamA: null, text: "Pytanie 1", count: 10 });
  } finally {
    if (gameId) await owner.page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
    await owner.ctx.close();
    await intruder.ctx.close();
  }
});
