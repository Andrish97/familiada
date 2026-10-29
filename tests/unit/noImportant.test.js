import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Założenie silnika stylów (E23): zero !important. Warstwy (@layer) i atrybut
// hidden zamiast stylów inline — familijna-server/docs/silnik-stylow-uzycie.md §3, §7.
const WEB = new URL("../../web/", import.meta.url).pathname;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "vendor" && e.name !== "node_modules") walk(p, out); }
    else if (/\.(css|js|html)$/.test(e.name) && e.name !== "flat.css") out.push(p);
  }
  return out;
}

test("style: zero !important w CSS, JS i HTML aplikacji", () => {
  const hits = walk(WEB).filter((p) => fs.readFileSync(p, "utf8").includes("!important")).map((p) => path.relative(WEB, p));
  assert.deepEqual(hits, []);
});
