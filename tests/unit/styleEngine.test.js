// E23: silnik stylów web/shared/style/ (docs/silnik-stylow-projekt.md).
// Strona przechodzi w całości: tylko pliki silnika w stałej kolejności + własny
// plik w @layer page; nigdy razem ze starym base.css / games.css.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const ENGINE = ["tokens", "base", "components", "layout", "utilities"].map((n) => `/shared/style/${n}.css`);
const LEGACY = ["/shared/css/base.css", "/games/css/games.css"];
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "").trim();

function htmlFiles(dir = path.join(root, "web"), out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(f, out);
    else if (e.name.endsWith(".html")) out.push(path.relative(root, f));
  }
  return out;
}
const stylesheets = (html) => [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?]+)/g)].map((m) => m[1]);
const enginePages = () => htmlFiles().filter((f) => stylesheets(read(f)).some((h) => h.startsWith("/shared/style/")));

test("silnik: tokeny poza warstwami, reszta w zadeklarowanych warstwach", () => {
  assert.doesNotMatch(read("web/shared/style/tokens.css"), /@layer/);
  assert.match(stripComments(read("web/shared/style/base.css")), /^@layer reset, base, components, utilities, page;/);
  for (const [file, layer] of [["base", "base"], ["components", "components"], ["layout", "components"], ["utilities", "utilities"]]) {
    assert.match(read(`web/shared/style/${file}.css`), new RegExp(`@layer ${layer} \\{`), file);
  }
});

test("silnik: kolory tylko w tokens.css (pozostałe przez var(--…))", () => {
  for (const file of ["base", "components", "layout", "utilities"]) {
    const css = stripComments(read(`web/shared/style/${file}.css`)).replace(/url\("data:[^"]*"\)/g, "");
    assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\((?!\s*var\()/g), null, file);
  }
});

test("strony na silniku: pełny zestaw w kolejności, bez starych plików, plik strony w @layer page", () => {
  const pages = enginePages();
  assert.ok(pages.includes("web/tasks/index.html"), "pilot: Zadania");
  for (const page of pages) {
    const sheets = stylesheets(read(page));
    const engine = sheets.filter((h) => h.startsWith("/shared/style/"));
    assert.deepEqual(engine, ENGINE, `${page}: pliki silnika i ich kolejność`);
    for (const legacy of LEGACY) assert.ok(!sheets.includes(legacy), `${page}: ${legacy} razem z silnikiem`);
    const last = sheets.indexOf(ENGINE.at(-1));
    for (const own of sheets.slice(last + 1)) {
      assert.match(stripComments(read(`web${own}`)), /^@layer page \{/, `${page}: ${own} poza @layer page`);
    }
  }
});
