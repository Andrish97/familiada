// E23: wartości liczone w JS idą do CSS przez zmienne (core/ui-metrics.js) —
// pasek bierze szerokość z --p, kolor z danych z --c. Zapadka: style.width
// pasków postępu i tła z kolorów danych nie wracają do kodu stron.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clampPct, ratioPct, setProgress, setVars, EDGE_PAD, ANCHOR_GAP, LIST_GAP } from "../../web/shared/js/core/ui-metrics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");

function fakeEl() {
  const props = new Map();
  return {
    props,
    style: {
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
    },
  };
}

test("procenty: przycięte do 0–100, nieliczba → 0", () => {
  assert.equal(clampPct(-5), 0);
  assert.equal(clampPct(140), 100);
  assert.equal(clampPct("x"), 0);
  assert.equal(ratioPct(1, 3), 33);
  assert.equal(ratioPct(5, 0), 0);
  assert.equal(ratioPct(9, 4), 100);
});

test("setProgress ustawia --p, setVars ustawia i usuwa zmienne", () => {
  const el = fakeEl();
  setProgress(el, 42.345, 1);
  assert.equal(el.props.get("--p"), "42.3%");
  setProgress(null, 10); // brak elementu — bez błędu
  setVars(el, { "--c": "#fff", "--p": null });
  assert.equal(el.props.get("--c"), "#fff");
  assert.equal(el.props.has("--p"), false);
});

test("odstępy wyskakujących elementów z jednego miejsca", () => {
  assert.deepEqual([EDGE_PAD, ANCHOR_GAP, LIST_GAP], [8, 8, 6]);
});

test("paski postępu i kolory z danych bez style.width / style.background", () => {
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = path.relative(root, p);
      if (e.isDirectory()) {
        if (!/^(shared\/vendor|admin\/tools|control\/display|shared\/js\/display)/.test(rel)) walk(p);
      } else if (p.endsWith(".js")) {
        fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
          if (/(bar|Bar|fill|Fill)\w*\.style\.width\s*=|\.style\.background\s*=|style="background:\$\{/.test(line)) bad.push(`${rel}:${i + 1}`);
        });
      }
    }
  };
  walk(root);
  assert.deepEqual(bad, [], "użyj setProgress(el, pct) / zmiennej --c");
});

test("pomiary na żywo tylko przez core/geometry.js: zero stylów wpisywanych z JS", () => {
  const bad = [];
  const re = /\.style\.(?!setProperty|removeProperty|getPropertyValue)[a-zA-Z]+\s*=(?!=)|\.style\.cssText\s*=|Object\.assign\([\w.]*\.style\b/;
  const skip = /^(shared\/vendor|admin\/tools|control\/display|shared\/js\/display)|(mail-document|marketing-mail|compose-mail)\.js$/;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = path.relative(root, p);
      if (skip.test(rel)) continue;
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".js")) fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => { if (re.test(line)) bad.push(`${rel}:${i + 1}`); });
    }
  };
  walk(root);
  assert.deepEqual(bad, [], "położenie/rozmiar: setFloat/setBox/setShift/setCell/setWidth z core/geometry.js");
});
