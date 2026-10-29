#!/usr/bin/env node
// E23: płaska wersja silnika stylów (bez @layer) dla ekranów otwieranych na
// telewizorach (Tizen 6 ≈ Chromium 76 nie zna @layer i pomija całą treść warstwy).
//   node scripts/build-flat-engine.mjs           zapis web/shared/style/flat.css
//   node scripts/build-flat-engine.mjs --check   kod 1, gdy plik jest nieaktualny
// Strony TV linkują tokens.css + flat.css + własny CSS bez warstw (kaskada jak
// dawniej w base.css: specyficzność i kolejność). Test: tests/unit/styleEngine.test.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const DIR = path.join(REPO, "web/shared/style");
const SOURCES = ["base.css", "components.css", "layout.css", "utilities.css"];
export const FLAT_PATH = path.join(DIR, "flat.css");

// Zdejmuje otoczki `@layer nazwa { … }` i deklarację kolejności `@layer a, b;`.
export function unlayer(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i) + 2;
      out += css.slice(i, end);
      i = end;
      continue;
    }
    const m = /^@layer\s+([\w-]+\s*(?:,\s*[\w-]+\s*)*)(;|\{)/.exec(css.slice(i));
    if (m) {
      i += m[0].length;
      if (m[2] === ";") continue;
      let depth = 1;
      let j = i;
      while (j < css.length && depth) {
        if (css.startsWith("/*", j)) { j = css.indexOf("*/", j) + 2; continue; }
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      out += unlayer(css.slice(i, j - 1));
      i = j;
      continue;
    }
    out += css[i++];
  }
  return out;
}

export function buildFlat() {
  const parts = SOURCES.map((f) => `/* ── ${f} ── */\n${unlayer(fs.readFileSync(path.join(DIR, f), "utf8")).trim()}\n`);
  return "/* WYGENEROWANE: node scripts/build-flat-engine.mjs — nie edytować ręcznie.\n"
    + "   Silnik stylów bez @layer dla ekranów TV i ekranów gry (Connect TV, QR ankiety, przerwa, 404,\n   Prowadzący, Przycisk, snake). */\n"
    + parts.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const css = buildFlat();
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(FLAT_PATH) ? fs.readFileSync(FLAT_PATH, "utf8") : "";
    if (cur !== css) { console.error("web/shared/style/flat.css nieaktualny: node scripts/build-flat-engine.mjs"); process.exit(1); }
  } else {
    fs.writeFileSync(FLAT_PATH, css);
    console.log(`zapisano ${path.relative(REPO, FLAT_PATH)}`);
  }
}
