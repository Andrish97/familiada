// Przyciski (.btn) mają kryjące tło: odcień w --btn-tint nałożony na kolor
// podłoża --under (shared/style/components.css). Półprzezroczyste tło (rgba) w Chrome na
// Androidzie nakładało się samo na siebie przy przerysowaniach — przyciski
// robiły się jaśniejsze, każdy inaczej. Ten test pilnuje, żeby żadna reguła
// z .btn nie ustawiała znowu background: rgba(...) wprost.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
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

test("silnik stylów: .btn ma kryjące tło z --btn-tint i --under", () => {
  const src = fs.readFileSync(path.join(ROOT, "shared/style/components.css"), "utf8");
  assert.match(src, /\.btn \{[^}]*background: linear-gradient\(var\(--btn-tint\), var\(--btn-tint\)\) var\(--under\)/);
  const tokens = fs.readFileSync(path.join(ROOT, "shared/style/tokens.css"), "utf8");
  assert.match(tokens, /--bg: #050914;/);
  assert.match(tokens, /--under: var\(--bg\);/);
});

test("silnik stylów: kryjące tła komponentów i tokenu --surface-sunken (Android)", () => {
  const tokens = fs.readFileSync(path.join(ROOT, "shared/style/tokens.css"), "utf8");
  assert.match(tokens, /--surface-sunken:\s*linear-gradient\(var\(--k-20\),\s*var\(--k-20\)\)\s*var\(--under,\s*var\(--surface-1\)\);/);

  const base = fs.readFileSync(path.join(ROOT, "shared/style/base.css"), "utf8");
  assert.match(base, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*\{\s*body\s*\{\s*transition:\s*none;\s*\}/);

  const comp = fs.readFileSync(path.join(ROOT, "shared/style/components.css"), "utf8");
  assert.match(comp, /\.who\s*\{[^}]*background:\s*linear-gradient\(var\(--w-8\),\s*var\(--w-8\)\)\s*var\(--under,\s*var\(--bg\)\);/);
  assert.match(comp, /\.tag\s*\{[^}]*background:\s*linear-gradient\(var\(--w-8\),\s*var\(--w-8\)\)\s*var\(--under,\s*var\(--surface-1\)\);/);
  assert.match(comp, /\.badge\s*\{[^}]*background:\s*linear-gradient\(var\(--g-10\),\s*var\(--g-10\)\)\s*var\(--under,\s*var\(--bg\)\);/);
  assert.match(comp, /\.callout\s*\{[^}]*background:\s*linear-gradient\(var\(--w-4\),\s*var\(--w-4\)\)\s*var\(--under,\s*var\(--surface-1\)\);/);
});
