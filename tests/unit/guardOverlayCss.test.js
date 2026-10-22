// Strona z blokadą urządzenia (page-init / device-guard) musi wczytać styl nakładki —
// inaczej komunikat „Za wąskie okno” / „Obróć urządzenie” wyświetla się bez stylu.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const web = new URL("../../web/", import.meta.url).pathname;
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
};

test("strony z page-init lub device-guard wczytują blocking-overlay.css", () => {
  const dirs = new Set();
  for (const file of walk(web)) {
    if (file.includes(`${path.sep}shared${path.sep}`)) continue;
    const src = fs.readFileSync(file, "utf8");
    if (!/core\/(page-init|device-guard)\.js/.test(src)) continue;
    const m = file.slice(web.length).match(/^(.*?)\/js\//);
    if (m) dirs.add(m[1]);
  }
  const missing = [...dirs].filter((d) => {
    const html = path.join(web, d, "index.html");
    return fs.existsSync(html) && !fs.readFileSync(html, "utf8").includes("blocking-overlay.css");
  });
  assert.deepEqual(missing, []);
});
