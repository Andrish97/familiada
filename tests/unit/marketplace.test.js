import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pl from "../../web/shared/translation/pl.js";
import en from "../../web/shared/translation/en.js";
import uk from "../../web/shared/translation/uk.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const get = (obj, key) => key.split(".").reduce((value, part) => value?.[part], obj);

test("każdy statyczny klucz marketplace użyty w HTML/JS istnieje w PL/EN/UK", () => {
  const html = fs.readFileSync(path.join(ROOT, "web/marketplace/index.html"), "utf8");
  const js = fs.readFileSync(path.join(ROOT, "web/marketplace/js/marketplace.js"), "utf8");
  const keys = new Set();
  for (const match of html.matchAll(/(data-i18n(?:-[\w-]+)?)="([^"]+)"/g)) {
    if (!match[1].includes("-icon")) keys.add(match[2]);
  }
  for (const match of js.matchAll(/\bt\("([^"]+)"/g)) keys.add(match[1]);

  const missing = [];
  for (const key of keys) {
    for (const [lang, dict] of Object.entries({ pl, en, uk })) {
      if (get(dict, key) === undefined) missing.push(`${lang}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("polski interfejs używa jednej nazwy: Strona główna", () => {
  const login = fs.readFileSync(path.join(ROOT, "web/login/index.html"), "utf8");
  assert.equal(pl.index.backHome, "Strona główna");
  assert.equal(pl.nav.page.home, "Strona główna");
  assert.equal(pl.notFound.homeBtn, "Strona główna");
  assert.doesNotMatch(login, /Strona startowa/i);
});

test("workflow E2E pozostaje wyłącznie ręczny", () => {
  const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/e2e-tests.yml"), "utf8");
  const onBlock = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("env:"));
  assert.match(onBlock, /workflow_dispatch:/);
  assert.doesNotMatch(onBlock, /^\s*push:/m);
});
