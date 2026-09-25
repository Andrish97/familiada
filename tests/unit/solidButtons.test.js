// Przyciski (.btn) mają kryjące tło: odcień w --btn-tint nałożony na kolor
// podłoża --under (css/base.css). Półprzezroczyste tło (rgba) w Chrome na
// Androidzie nakładało się samo na siebie przy przerysowaniach — przyciski
// robiły się jaśniejsze, każdy inaczej. Ten test pilnuje, żeby żadna reguła
// z .btn nie ustawiała znowu background: rgba(...) wprost.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKIP = new Set([".git", "node_modules", "tests", "docs", "supabase", "cloudflare", "services", "settings-tools"]);

function cssFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) cssFiles(p, out); }
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

test("reguły .btn nie ustawiają półprzezroczystego tła (tylko --btn-tint)", () => {
  const bad = [];
  for (const f of cssFiles()) {
    const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].replace(/\s+/g, " ").trim();
      if (!/\.btn\b/.test(sel)) continue;
      if (/(^|;|\s)background(-color)?\s*:\s*rgba\(/.test(m[2])) {
        bad.push(`${path.relative(ROOT, f)}: ${sel.slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(bad, [], "użyj --btn-tint zamiast background: rgba(...)");
});

test("base.css: .btn ma kryjące tło z --btn-tint i --under", () => {
  const src = fs.readFileSync(path.join(ROOT, "css/base.css"), "utf8");
  assert.match(src, /\.btn \{[^}]*background: linear-gradient\(var\(--btn-tint\), var\(--btn-tint\)\) var\(--under\)/);
  assert.match(src, /:root \{\s*--under: #050914;/);
});
