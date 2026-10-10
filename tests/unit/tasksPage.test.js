// Strona /tasks/ (E19 krok 2): wpis w mapie, trasa Workera, przycisk na liście
// gier, teksty w trzech językach i wspólny komponent wierszy.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES } from "../../web/shared/js/core/nav-map.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test("tasks: wpis w PAGES, trasa Workera, przycisk na liście gier", () => {
  assert.equal(PAGES.tasks.access, "user");
  assert.equal(PAGES.tasks.parent, "games");
  assert.ok(PAGES.tasks.from.includes("games"));
  assert.deepEqual(PAGES.tasks.state, ["kind"]);
  assert.deepEqual(PAGES.games.buttons.btnTasks, { to: "tasks", roles: ["user"] });
  assert.match(read("cloudflare/maintenance-worker/src/lib/origin/origin.js"), /"subscriptions", "tasks"/);
  assert.match(read("web/games/index.html"), /id="btnTasks"/);
  assert.match(read("web/tasks/js/tasks.js"), /initPage\("tasks"/);
});

test("tasks: teksty pl/en/uk mają te same klucze", async () => {
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  const langs = await Promise.all(["pl", "en", "uk"].map((l) => import(`../../web/shared/translation/${l}.js`)));
  const [pl, en, uk] = langs.map((m) => m.default);
  for (const [name, get] of [["tasks", (x) => x.tasks], ["shareSections.channel", (x) => x.shareSections.channel]]) {
    assert.deepEqual(keys(get(en)), keys(get(pl)), `${name} en`);
    assert.deepEqual(keys(get(uk)), keys(get(pl)), `${name} uk`);
  }
  for (const x of [pl, en, uk]) assert.ok(x.games.nav.tasks);
});

test("komponent wierszy: sekcje zwijane, akcje z ikoną, usuwanie ikoną", () => {
  const src = read("web/shared/js/core/share-sections.js");
  assert.match(src, /export function renderRowSections/);
  assert.match(src, /export function rowEl/);
  assert.match(src, /aria-expanded/);
  assert.match(src, /a\.icon === "trash"/);
  assert.match(read("web/shared/css/base.css"), /\.rowsPage\{ width: 100%; max-width: 760px/);
});
