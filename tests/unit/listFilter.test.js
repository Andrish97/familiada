import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterFromSearch, filterToHref, matchesFilter, gameStateKey, showEmptyResult,
} from "../../web/shared/js/core/list-filter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const ALLOWED = ["draft", "open", "stopped", "ready"];

test("filterFromSearch: tylko dozwolone wartości, reszta to „wszystko”", () => {
  assert.equal(filterFromSearch("?status=open", "status", ALLOWED), "open");
  assert.equal(filterFromSearch("?status=zly", "status", ALLOWED), "");
  assert.equal(filterFromSearch("?tab=poll_text", "status", ALLOWED), "");
  assert.equal(filterFromSearch("", "status", ALLOWED), "");
});

test("filterToHref: ustawia i usuwa parametr, zachowuje resztę adresu", () => {
  const base = "https://x.pl/games?tab=poll_text&status=open#a";
  assert.equal(filterToHref(base, "status", "ready"), "/games?tab=poll_text&status=ready#a");
  assert.equal(filterToHref(base, "status", ""), "/games?tab=poll_text#a");
  assert.equal(filterToHref("https://x.pl/bases", "role", "editor"), "/bases?role=editor");
});

test("matchesFilter: brak filtra i kafle bez atrybutu zawsze pasują", () => {
  assert.equal(matchesFilter("draft", ""), true);
  assert.equal(matchesFilter("draft", "draft"), true);
  assert.equal(matchesFilter("open", "draft"), false);
  assert.equal(matchesFilter(undefined, "draft"), true);
});

test("gameStateKey: stan jak etykieta kafla", () => {
  assert.equal(gameStateKey("draft"), "draft");
  assert.equal(gameStateKey(null), "draft");
  assert.equal(gameStateKey("draft", { isPrepared: true, playOk: true }), "ready");
  assert.equal(gameStateKey("draft", { isPrepared: true, playOk: false }), "draft");
  assert.equal(gameStateKey("draft", { isPrepared: false, playOk: true }), "draft");
  assert.equal(gameStateKey("poll_open"), "open");
  assert.equal(gameStateKey("poll_stopped"), "stopped");
  assert.equal(gameStateKey("ready"), "ready");
});

test("showEmptyResult: komunikat tylko gdy szukanie/filtr wycięły wszystkie kafle", () => {
  assert.equal(showEmptyResult({ hasQuery: true, filterValue: "", total: 3, visible: 0 }), true);
  assert.equal(showEmptyResult({ hasQuery: false, filterValue: "open", total: 3, visible: 0 }), true);
  assert.equal(showEmptyResult({ hasQuery: true, filterValue: "", total: 3, visible: 1 }), false);
  assert.equal(showEmptyResult({ hasQuery: false, filterValue: "", total: 3, visible: 0 }), false);
  assert.equal(showEmptyResult({ hasQuery: true, filterValue: "", total: 0, visible: 0 }), false);
});

test("filtr podpięty na stronach gier i baz, tłumaczenia w pl/en/uk", () => {
  assert.match(read("web/games/js/games.js"), /filter:\s*\{\s*param: "status"/);
  assert.match(read("web/bases/js/bases.js"), /filter:\s*\{\s*param: "role"/);
  for (const l of ["pl", "en", "uk"]) {
    const s = read(`web/shared/translation/${l}.js`);
    for (const k of ["filterAll:", "noResults:", "filter: {"]) assert.ok(s.includes(k), `${l}: ${k}`);
  }
});
