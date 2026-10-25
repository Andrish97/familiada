// E23 §3.3: rodzaj urządzenia na <html> (core/device-attrs.js) — każda strona
// na silniku stylów ładuje go jako pierwszy moduł, a układ telefonu/okien od
// dołu wynika z jednej reguły (deviceLayout).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function htmlFiles(dir = path.join(root, "web"), out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(f, out);
    else if (e.name.endsWith(".html")) out.push(path.relative(root, f));
  }
  return out;
}

test("strony na silniku ładują device-attrs.js przed innymi modułami", () => {
  // Wyświetlacz ładuje same tokeny (ekran gry poza silnikiem) — bez atrybutów.
  const pages = htmlFiles().filter((f) => /\/shared\/style\/(?:base|flat)\.css/.test(read(f)));
  assert.ok(pages.length > 30);
  for (const page of pages) {
    const html = read(page);
    const boot = html.match(/<script\s+src="\/shared\/js\/core\/page-boot\.js[^\"]*"\s*><\/script>/);
    assert.ok(boot, `${page}: wspólny skrypt blokujący, bez async/defer`);
    assert.ok(boot.index > html.indexOf('name="viewport"') && boot.index < html.indexOf('<link rel="stylesheet"'), `${page}: bootstrap po viewport, przed CSS`);
    const modules = [...read(page).matchAll(/<script[^>]*type="module"[^>]*src="([^"?]+)/g)].map((m) => m[1]);
    assert.equal(modules[0], "/shared/js/core/device-attrs.js", page);
  }
});

test("deviceLayout: telefon i wąskie okno = układ telefonu; dotyk = okna od dołu", async () => {
  const { deviceLayout } = new Function(`const globalThis = {}; ${read("web/shared/js/core/page-boot.js")}; return globalThis.FamiliadaDevice;`)();
  const p = (o) => ({ formFactor: "desktop", touch: false, orientation: "landscape", viewportWidth: 1400, ...o });
  assert.deepEqual(deviceLayout(p({})), { device: "desktop", input: "pointer", orientation: "landscape", compact: false, sheet: false });
  assert.equal(deviceLayout(p({ viewportWidth: 600 })).compact, true);
  assert.equal(deviceLayout(p({ viewportWidth: 601 })).compact, false);
  const phoneLandscape = deviceLayout(p({ formFactor: "phone", touch: true, viewportWidth: 844 }));
  assert.equal(phoneLandscape.compact, true);
  assert.equal(phoneLandscape.sheet, true);
  const tablet = deviceLayout(p({ formFactor: "tablet", touch: true, viewportWidth: 1180 }));
  assert.equal(tablet.compact, false);
  assert.equal(tablet.sheet, true);
  assert.equal(deviceLayout(p({ formFactor: "tv", touch: true })).sheet, false);
});
