import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("zakładki stron zapisują stan w URL i obsługują historię", () => {
  const cases = [
    ["js/pages/games.js", /searchParams\.set\("tab", type\)/, /addEventListener\("popstate"/],
    ["js/pages/bases.js", /searchParams\.set\("tab", activeTab\)/, /addEventListener\("popstate"/],
    ["js/pages/settings.js", /searchParams\.set\("tab", tab\)/, /addEventListener\("popstate"/],
    ["js/pages/polls-hub.js", /searchParams\.set\("tab", tab\)/, /addEventListener\("popstate"/],
    ["js/pages/subscriptions.js", /searchParams\.set\("tab", "subscriptions"\)/, /addEventListener\("popstate"/],
  ];
  for (const [file, writeUrl, history] of cases) {
    const source = read(file);
    assert.match(source, writeUrl, `${file}: zapis URL`);
    assert.match(source, history, `${file}: historia przeglądarki`);
  }
});

test("manual zachowuje istniejący routing sekcji przez hash", () => {
  const source = read("js/pages/manual.js");
  assert.match(source, /location\.hash = name/);
  assert.match(source, /addEventListener\("hashchange"/);
});

test("strona główna odzwierciedla przewijaną sekcję w hash", () => {
  const source = read("js/pages/index.js");
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
  const html = read("logo-editor.html");
  const js = read("logo-editor/js/main.js");
  const css = read("logo-editor/logo-editor.css");

  for (const id of ["tabLogoText", "tabLogoDraw", "tabLogoImage"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="createOverlay"|id="pickText"|id="pickDraw"|id="pickImage"/);
  assert.match(js, /el\.hint\.textContent = t\(hintKeys\[activeListMode\]\)/);
  assert.match(js, /addEventListener\("popstate"/);
  assert.match(css, /tabLogoText\.active[\s\S]*tab-corner-left/);
  assert.match(css, /tabLogoImage\.active[\s\S]*tab-corner-right/);
  assert.match(css, /tabLogoText\.active[\s\S]*border-top-left-radius: 0/);
  assert.match(css, /tabLogoImage\.active[\s\S]*border-top-right-radius: 0/);
});

test("Polls Hub obsługuje aktualną odpowiedź kolejki send-mail", () => {
  const source = read("js/pages/polls-hub.js");
  assert.match(source, /Number\(payload\.queued\)/);
  assert.match(source, /queued !== items\.length/);
  assert.match(source, /results: items\.map\(\(item\) => \(\{ to: item\.to, ok: true, queued: true \}\)\)/);
});
