import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, /^(tests|scripts|supabase|cloudflare|services|docs)\//.test(file) ? file : "web/" + file), "utf8");

test("zakładki stron zapisują stan w URL i obsługują historię", () => {
  const cases = [
    ["games/js/games.js", /searchParams\.set\("tab", type\)/, /addEventListener\("popstate"/],
    ["bases/js/bases.js", /searchParams\.set\("tab", activeTab\)/, /addEventListener\("popstate"/],
    ["settings/js/settings.js", /searchParams\.set\("tab", tab\)/, /addEventListener\("popstate"/],
    ["subscriptions/js/subscriptions.js", /searchParams\.set\("tab", activeTab\)/, /history\.replaceState/],
  ];
  for (const [file, writeUrl, history] of cases) {
    const source = read(file);
    assert.match(source, writeUrl, `${file}: zapis URL`);
    assert.match(source, history, `${file}: historia przeglądarki`);
  }
});

test("manual zachowuje istniejący routing sekcji przez hash", () => {
  const source = read("manual/js/manual.js");
  assert.match(source, /location\.hash = name/);
  assert.match(source, /addEventListener\("hashchange"/);
});

test("strona główna odzwierciedla przewijaną sekcję w hash", () => {
  const source = read("home/js/index.js");
  assert.match(source, /history\.pushState\(history\.state, "", `#\$\{id\}`\)/);
  assert.match(source, /history\.replaceState\(history\.state, "", `#\$\{activeId\}`\)/);
});

test("base-explorer zapisuje konkretny folder i odtwarza go z URL", () => {
  const page = read("base-explorer/js/page.js");
  const state = read("base-explorer/js/state.js");
  assert.match(page, /searchParams|get\("folder"\)/);
  assert.match(page, /addEventListener\("popstate"/);
  assert.match(state, /searchParams\.set\("folder", state\.folderId\)/);
  assert.match(state, /searchParams\.delete\("folder"\)/);
});

test("logo ma trzy zakładki, dynamiczny hint i geometrię wypustek", () => {
  const html = read("logo/index.html");
  const js = read("logo/js/list.js");
  const css = read("logo/css/logo.css");

  for (const id of ["tabLogoText", "tabLogoDraw", "tabLogoImage"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="createOverlay"|id="pickText"|id="pickDraw"|id="pickImage"/);
  assert.match(js, /el\.hint\.textContent = t\(hintKeys\[activeListMode\]\)/);
  // Karta w ?tab= przez replaceState: przeglądarkowe „Wstecz” wraca do
  // poprzedniej strony, nie przełącza kart (docs/nawigacja-mapa-plan.md).
  assert.match(js, /history\.replaceState\(history\.state, "", url\)/);
  assert.doesNotMatch(js, /history\.pushState|addEventListener\("popstate"/);
  assert.match(css, /tabLogoText\.active[\s\S]*tab-corner-left/);
  assert.match(css, /tabLogoImage\.active[\s\S]*tab-corner-right/);
  assert.match(css, /tabLogoText\.active[\s\S]*border-top-left-radius: 0/);
  assert.match(css, /tabLogoImage\.active[\s\S]*border-top-right-radius: 0/);
});

test("edytory logo to osobne strony z id w adresie, autozapisem i bez ✕", () => {
  const list = read("logo/index.html");
  assert.doesNotMatch(list, /id="editorShell"|id="btnCloseEditor"|id="helpOverlay"|id="legalOverlay"|fabric/);
  for (const [mode, file, init] of [["TEXT", "text", "initTextEditor"], ["DRAW", "draw", "initDrawEditor"], ["IMAGE", "image", "initImageEditor"]]) {
    const html = read(`logo/editor-${file}/index.html`);
    const entry = read(`logo/js/editor-${file}.js`);
    assert.match(html, new RegExp(`src="/logo/js/editor-${file}\\.js`));
    assert.match(html, new RegExp(`id="editorShell" data-mode="${mode}"`));
    assert.match(html, /id="saveStatus"/);
    assert.doesNotMatch(html, /id="btnCreate"|id="btnCloseEditor"|id="helpOverlay"|id="legalOverlay"|modal=/);
    assert.equal(/fabric@/.test(html), file === "draw", `${file}: fabric.js tylko w edytorze rysunku`);
    assert.match(entry, new RegExp(`bootEditorPage\\(\\{ mode: "${mode}", initEditor: ${init} \\}\\)`));
  }
  const page = read("logo/js/editor-page.js");
  assert.match(page, /isInteracting/);
  assert.match(page, /visibilitychange/);
  assert.doesNotMatch(page, /beforeunload|confirmModal|pushState/);
  assert.doesNotMatch(read("shared/js/core/topbar-controller.js"), /topbar-no-menu/);
});

test("cleanup E2E usuwa limity mailowe wyłącznie pomiędzy kontami testowymi", () => {
  const sql = read("supabase/migrations/2026-09-30_285_e2e_mail_cooldown_cleanup.sql");
  assert.match(sql, /test\(\[1-9\]\|1\[0-3\]\)@familiada/);
  assert.match(sql, /delete from public\.poll_tasks/);
  assert.match(sql, /delete from public\.poll_subscriptions/);
  assert.match(sql, /delete from public\.email_cooldowns/);
  assert.match(sql, /md5\(v_caller_email\).*md5\(v_other_email\)/s);
  assert.match(sql, /revoke all on function public\.e2e_poll_subscriptions_cleanup/);
});

test("cleanup E2E usuwa też cooldowny z ujednoliconego mail_cooldowns", () => {
  const sql = read("supabase/migrations/2026-10-04_294_e2e_cleanup_mail_cooldowns.sql");
  assert.match(sql, /test\(\[1-9\]\|1\[0-3\]\)@familiada/);
  assert.match(sql, /DELETE FROM public\.mail_cooldowns/);
  assert.match(sql, /action_key IN \('poll:invite', 'poll:resend', 'poll:share'\)/);
  assert.match(sql, /action_key = 'device:share'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.e2e_poll_subscriptions_cleanup/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.e2e_shared_devices_cleanup/);
});

test("podłoga baseline:recipient pomija parę e2e->e2e, żeby CI nie fałszywie blokował mail", () => {
  const sql = read("supabase/migrations/2026-10-04_296_mail_queue_baseline_e2e_exempt.sql");
  assert.match(sql, /test\(\[1-9\]\|1\[0-3\]\)@familiada/);
  assert.match(sql, /v_both_e2e/);
  assert.match(sql, /IF NOT v_both_e2e THEN/);
  assert.match(sql, /RAISE EXCEPTION 'mail_queue: unknown cooldown_action_key/);
});

test("restore konta e2e czyści też cooldown auth:reset_password z mail_cooldowns", () => {
  const sql = read("supabase/migrations/2026-10-04_297_mail_cooldown_email_release.sql");
  assert.match(sql, /CREATE FUNCTION public\.mail_cooldown_email_release/);
  assert.match(sql, /UPDATE public\.mail_cooldowns/);
  assert.match(sql, /target_key = v_target/);

  const worker = read("cloudflare/maintenance-worker/src/lib/e2e/e2e-api.js");
  assert.match(worker, /mail_cooldown_email_release/);
  assert.match(worker, /mail_cooldown_cleanup_failed/);
});

test("oznaczenie maila ankiety obejmuje adres i zarejestrowane konto", () => {
  const sql = read("supabase/migrations/2026-09-30_286_mark_registered_poll_tasks_emailed.sql");
  assert.match(sql, /recipient_email is not null or recipient_user_id is not null/);
  assert.match(sql, /owner_id = v_uid/);
  assert.match(sql, /email_sent_at = now\(\)/);
  assert.match(sql, /email_send_count = email_send_count \+ 1/);
});
