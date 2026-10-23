// tests/e2e/zz-cutover-diag.spec.js — TYMCZASOWY (przeprowadzka P6, 2026-10-24):
// diagnostyka listy gier i edytora na nowym serwerze w czasie przerwy.
// Wypisuje treść strony, błędy konsoli i odpowiedzi >= 400. Do usunięcia po P6.
const { test } = require("./helpers/e2e-test");

test.use({ needs: { standard: 1 } });

test("diag P6: lista gier i edytor po wstawieniu gry", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  const log = (...a) => console.log("[e2e-diag:p6]", ...a);
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) log("console", m.type(), m.text().slice(0, 300)); });
  page.on("pageerror", (e) => log("pageerror", String(e).slice(0, 300)));
  page.on("response", (r) => { if (r.status() >= 400) log("http", r.status(), r.request().method(), r.url().replace(/[0-9a-f-]{36}/g, "<id>").slice(0, 160)); });
  page.on("requestfailed", (r) => log("failed", r.failure()?.errorText, r.url().replace(/[0-9a-f-]{36}/g, "<id>").slice(0, 160)));

  await loginAs(page, context, accounts.standard[0]);
  const name = `E2E-P6-DIAG-${Date.now()}`;
  const id = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb.from("games").insert({ name, owner_id: u.user.id, type: "prepared" }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, name);
  try {
    await page.goto("https://www.familiada.online/games", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(3000);
    log("games url", page.url(), "title", await page.title());
    log("games cards", await page.locator("#grid .card").count(), "ma nową grę", await page.locator("#grid .card").filter({ hasText: name }).count());
    log("games body", JSON.stringify((await page.locator("body").innerText()).slice(0, 500)));
    const rest = await page.evaluate(async (id) => {
      const sb = window.__sbClient;
      const a = await sb.from("games").select("id,name,type,status").eq("id", id).maybeSingle();
      const l = await sb.rpc("acquire_edit_locks", { p_resources: [{ type: "game", id, mode: "exclusive" }], p_tab_id: "diag-tab", p_context: "diag", p_mode: "exclusive" });
      const r = await sb.from("edit_locks").select("resource_type").eq("resource_id", id);
      await sb.rpc("release_edit_locks", { p_resources: [{ type: "game", id, mode: "exclusive" }], p_tab_id: "diag-tab" });
      return { select: a.error?.message || (a.data ? "ok" : "brak"), acquire: l.error?.message || JSON.stringify(l.data).slice(0, 200), locks: r.error?.message || (r.data || []).length };
    }, id);
    log("bezpośrednio", JSON.stringify(rest));
    await page.goto(`https://www.familiada.online/games/editor?id=${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(4000);
    log("editor url", page.url(), "title", await page.title());
    log("editor body", JSON.stringify((await page.locator("body").innerText()).slice(0, 500)));
  } finally {
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, id).catch(() => {});
  }
});
