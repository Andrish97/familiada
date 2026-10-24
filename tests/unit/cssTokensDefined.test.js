// E23: każdy var(--x) bez wartości zapasowej ma definicję — w tokens.css, w pliku
// CSS (zmienna lokalna) albo w JS (style.setProperty("--x", …)). Token bez
// definicji po cichu daje kolor odziedziczony (tak zniknęło --muted).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
const SKIP = ["shared/vendor/", "admin/tools/", "shared/style/flat.css"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    const rel = path.relative(root, f).split(path.sep).join("/");
    if (SKIP.some((s) => rel.startsWith(s))) continue;
    if (e.isDirectory()) walk(f, out); else out.push({ f, rel });
  }
  return out;
}

test("CSS: każdy var(--x) bez wartości zapasowej ma definicję", () => {
  const files = walk(root);
  const defined = new Set();
  for (const { f } of files.filter(({ rel }) => /\.(css|js|html)$/.test(rel))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    // setProperty("--x", …) i setProperty(`--prefix-${name}`, …)
    for (const m of src.matchAll(/setProperty\(\s*["'`](--[\w-]+)["'`]/g)) defined.add(m[1]);
    for (const m of src.matchAll(/setProperty\(\s*`(--[\w-]*)\$\{/g)) defined.add(`${m[1]}*`);
    for (const m of src.matchAll(/["'`](--[\w-]+)["'`]\s*[,\]]/g)) defined.add(m[1]);
  }
  const prefixes = [...defined].filter((d) => d.endsWith("*")).map((d) => d.slice(0, -1));
  const missing = [];
  for (const { f, rel } of files.filter(({ rel }) => rel.endsWith(".css"))) {
    const css = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/var\((--[\w-]+)\s*(,)?/g)) {
      const name = m[1];
      if (m[2] || defined.has(name) || prefixes.some((p) => name.startsWith(p))) continue;
      missing.push(`${rel}: ${name}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
