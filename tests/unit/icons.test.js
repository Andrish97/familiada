// Testy wspólnego silnika ikon (js/core/icons.js).
// Pilnują, żeby każda ikona wskazywała na plik SVG w assets i żeby icon() było bezpieczne dla nieznanej nazwy
// i etykiety, oraz żeby każda nazwa użyta w kodzie aplikacji istniała.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICONS, ICON_NAMES, icon } from "../../web/shared/js/core/icons.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");

test("każda ikona używa właściwego, osobnego pliku SVG", () => {
  assert.ok(ICON_NAMES.length > 50);
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, /^<svg class="ico ico-[\w-]+"/, name);
    assert.ok(svg.includes(`<use href="${ICONS[name]}#icon"></use>`), name);
    assert.match(svg, /<\/svg>$/, name);
    assert.match(svg, /aria-hidden="true"/, name);
    const assetPath = path.join(ROOT, ICONS[name].split("?")[0].replace(/^\//, ""));
    assert.ok(fs.existsSync(assetPath), `${name}: brakuje ${assetPath}`);
    assert.match(fs.readFileSync(assetPath, "utf8"), /<svg[^>]*\bid="icon"[^>]*\bviewBox=/, name);
  }
});

test("nieznana nazwa daje pusty string, etykieta jest escapowana", () => {
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(icon("nie-ma-takiej"), ""); } finally { console.warn = warn; }
  const svg = icon("trash", { label: 'Usuń "grę" <x>', className: "big" });
  assert.match(svg, /class="ico ico-trash big"/);
  assert.match(svg, /role="img" aria-label="Usuń &quot;grę&quot; &lt;x&gt;"/);
  assert.doesNotMatch(svg, /aria-hidden/);
});

test("ustalone rysunki: anuluj ≠ błąd, info i „!” bez kółka, telefon z falami, buzzer i host", () => {
  const svg = (name) => fs.readFileSync(path.join(ROOT, ICONS[name].split("?")[0].slice(1)), "utf8");
  assert.notEqual(svg("cancel"), svg("error"));
  assert.doesNotMatch(svg("info"), /r="[89]/, "info bez kółka");
  assert.doesNotMatch(svg("error"), /r="[89]/, "„!” bez kółka");
  assert.match(svg("phone"), /M19\.7 7a7\.2 7\.2 0 0 1 0 10/, "telefon z falami sygnału");
  assert.match(svg("host"), /rect x="16\.8" y="3" width="4" height="7"/, "host z mikrofonem");
  assert.match(svg("buzzer"), /M5\.75 11\.25a6\.25 6.25 0 0 1 12\.5 0Z/, "buzzer — przycisk z boku");
  assert.match(svg("settings"), /<circle[^>]+r="3\.2"/, "zębatka ustawień");
});

test("każda nazwa ikony użyta w kodzie aplikacji istnieje w silniku", () => {
  const SKIP = new Set([".git", "node_modules", "tests", "docs", "supabase", "cloudflare", "services", "img", "audio", "settings-tools"]);
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); }
      else if (/\.(html|js)$/.test(e.name) && e.name !== "ikony.html" && e.name !== "icons.js") files.push(p);
    }
  })(ROOT);
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/data-(?:i18n-)?icon(?:-after)?="([\w-]+)"|\bicon\(\s*["']([\w-]+)["']/g)) {
      const n = m[1] || m[2];
      if (!ICONS[n]) missing.push(`${path.relative(ROOT, f)}: ${n}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("moduł importujący icon nie przesłania go zmienną ani parametrem o tej samej nazwie", () => {
  // Regresja: base-explorer/js/render.js miał parametr `icon = svgFolder()`
  // w rowHtml — wywołanie icon("caret-…") w środku rzucało TypeError i drzewo
  // folderów się nie renderowało.
  const SKIP = new Set([".git", "node_modules", "tests", "docs", "supabase", "cloudflare", "services", "img", "audio"]);
  const bad = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); continue; }
      if (!e.name.endsWith(".js") || e.name === "icons.js") continue;
      const src = fs.readFileSync(p, "utf8");
      if (!/import \{[^}]*\bicon\b[^}]*\} from ["'][^"']*icons\.js/.test(src)) continue;
      src.split("\n").forEach((line, i) => {
        if (/^\s*import /.test(line) || /^\s*\/\//.test(line)) return;
        const code = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "''");
        if (/\b(?:const|let|var)\s+icon\b|[(,{]\s*icon\s*(?:=[^=>]|[,)}])|\bfunction\s+icon\b/.test(code)) {
          bad.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
  })(ROOT);
  assert.deepEqual(bad, []);
});

test("pliki ikon językowych i połowy gwiazdki są osobnymi źródłami SVG", () => {
  for (const name of ["flag-pl", "flag-ua", "star-half"]) {
    const file = path.join(ROOT, ICONS[name].split("?")[0].slice(1));
    const svg = fs.readFileSync(file, "utf8");
    assert.match(svg, /<svg[^>]*\bid="icon"/, name);
    assert.ok(icon(name).includes(`${ICONS[name]}#icon`), name);
  }
});
