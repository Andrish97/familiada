import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import pl from "../../web/shared/translation/pl.js";
import en from "../../web/shared/translation/en.js";
import uk from "../../web/shared/translation/uk.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const { localFileFor } = require("../e2e/helpers/branch-code.js");
const read = (file) => fs.readFileSync(path.join(root, /^(tests|scripts|supabase|cloudflare|services|docs)\//.test(file) ? file : "web/" + file), "utf8");

function get(object, key) {
  return key.split(".").reduce((value, part) => value?.[part], object);
}

test("index: każdy użyty klucz istnieje w PL/EN/UK", () => {
  const html = read("index.html");
  const js = read("home/js/index.js");
  const keys = new Set();
  for (const match of html.matchAll(/data-i18n(?:-(?:html|placeholder|title|aria-label|value|alt|content|data-text))?="([^"]+)"/g)) {
    keys.add(match[1]);
  }
  for (const match of js.matchAll(/\bt\(["']([^"']+)["']/g)) keys.add(match[1]);
  for (const [lang, dictionary] of Object.entries({ pl, en, uk })) {
    assert.deepEqual([...keys].filter((key) => get(dictionary, key) == null), [], lang);
  }
});

test("index: sesję weryfikuje backend, a nie niezaufany localStorage", () => {
  const html = read("index.html");
  const js = read("home/js/index.js");
  assert.doesNotMatch(html, /sb-.*auth-token/);
  assert.match(js, /await getUser\(\)/);
  assert.match(js, /location\.replace\(withLangParam\("\/games\/"\)\)/);
});

test("serveBranchCode mapuje główną trasę / na index.html z brancha", () => {
  const helper = read("tests/e2e/helpers/branch-code.js");
  assert.match(helper, /!rel && pages\.includes\("index"\)/);
  assert.match(helper, /path\.join\(REPO_ROOT, "index\.html"\)/);
});

test("serveBranchCode mapuje zagnieżdżony edytor DRAW na jego własny index.html", () => {
  assert.equal(localFileFor("/logo/editor-draw/", ["logo"]), path.join(root, "web/logo/editor-draw/index.html"));
});

test("serveBranchCode serwuje moduły manuala i polityki prywatności zamiast HTML strony", () => {
  assert.equal(localFileFor("/manual/js/manual.js", ["manual"]), path.join(root, "web/manual/js/manual.js"));
  assert.equal(localFileFor("/privacy/js/privacy.js", ["privacy"]), path.join(root, "web/privacy/js/privacy.js"));
});

test("polski interfejs używa nazwy Strona główna", () => {
  const files = ["index.html", "login/index.html", "404.html", "shared/translation/pl.js"]
    .map(read).join("\n");
  assert.doesNotMatch(files, /Strona startowa/i);
  assert.equal(pl.index.backHome, "Strona główna");
  assert.equal(pl.privacy.backToHome, "Strona główna");
  assert.equal(pl.marketplace.nav.backHome, "Strona główna");
});

test("podłącz urządzenie: powrót anonima używa istniejącego klucza Strona główna", () => {
  const js = read("connect-device/js/connect-device.js");
  assert.doesNotMatch(js, /common\.backToHome/);
  assert.match(js, /btnBack\.dataset\.i18n = "index\.backHome"/);
  for (const dictionary of [pl, en, uk]) {
    assert.equal(typeof dictionary.index.backHome, "string");
    assert.notEqual(dictionary.index.backHome, "index.backHome");
  }
});

test("FAQ opisuje aktualny tryb gościa i Gry Społeczności tak samo w PL/EN/UK", () => {
  for (const dictionary of [pl, en, uk]) {
    assert.match(dictionary.home.faq.q5.a, /serwer|server|сервер/i);
    assert.match(dictionary.home.faq.q8.a, /Społeczności|Community|Спільноти/i);
  }
  assert.doesNotMatch(pl.home.faq.q4.a, /pełną funkcjonalność/i);
  assert.match(pl.home.faq.q4.a, /e-mail i hasło/);
});
