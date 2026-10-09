// Testy wspólnego modułu kart (js/core/tabs.js) i drzewa eksploratora w localStorage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tabFromUrl, tabHref, setTab } from "../../web/shared/js/core/tabs.js";
import {
  treeStorageKey, parseTreeOpen, loadTreeOpen, saveTreeOpen, pruneTreeOpen,
} from "../../web/bases/explorer/js/state.js";

const TABS = ["prepared", "poll_text", "market"];

test("tabFromUrl: karta z listy, nieznana albo brak -> domyślna", () => {
  assert.equal(tabFromUrl(TABS, "prepared", "?tab=market"), "market");
  assert.equal(tabFromUrl(TABS, "prepared", "?tab=nope"), "prepared");
  assert.equal(tabFromUrl(TABS, "prepared", "?id=3"), "prepared");
  assert.equal(tabFromUrl(TABS, "prepared", ""), "prepared");
  assert.equal(tabFromUrl(TABS, "prepared", "?tab="), "prepared");
});

test("tabHref: karta w ?tab=, domyślna usuwa parametr, reszta adresu zostaje", () => {
  const base = "https://x.test/games/?lang=en&ret=%2Fa%2F#h";
  assert.equal(tabHref(base, "market", "prepared"), "/games/?lang=en&ret=%2Fa%2F&tab=market#h");
  assert.equal(tabHref("https://x.test/games/?tab=market&id=1", "prepared", "prepared"), "/games/?id=1");
});

test("setTab: replaceState z ?tab=, bez pushState, bez zbędnego zapisu", () => {
  const calls = [];
  const loc = new URL("https://x.test/bases/?id=1");
  globalThis.location = {
    get href() { return loc.href; },
    get pathname() { return loc.pathname; },
    get search() { return loc.search; },
    get hash() { return loc.hash; },
  };
  globalThis.history = {
    state: { s: 1 },
    replaceState(state, _t, url) {
      calls.push(["replace", state, url]);
      const u = new URL(url, loc);
      loc.pathname = u.pathname; loc.search = u.search; loc.hash = u.hash;
    },
    pushState() { calls.push(["push"]); },
  };
  try {
    setTab("shared", "mine");
    assert.deepEqual(calls, [["replace", { s: 1 }, "/bases/?id=1&tab=shared"]]);
    setTab("shared", "mine"); // ten sam adres — bez zapisu
    assert.equal(calls.length, 1);
    setTab("mine", "mine");
    assert.equal(calls.length, 2);
    assert.equal(calls[1][2], "/bases/?id=1");
    assert.ok(!calls.some((c) => c[0] === "push"));
  } finally {
    delete globalThis.location;
    delete globalThis.history;
  }
});

test("drzewo eksploratora: klucz per baza, root zawsze rozwinięty, zepsuty zapis ignorowany", () => {
  assert.equal(treeStorageKey("b1"), "explorer:tree:b1");
  assert.deepEqual([...parseTreeOpen(null)], ["root"]);
  assert.deepEqual([...parseTreeOpen("nie json")], ["root"]);
  assert.deepEqual([...parseTreeOpen('{"a":1}')], ["root"]);
  assert.deepEqual([...parseTreeOpen('["f1",5,"f2"]')].sort(), ["f1", "f2", "root"]);
});

test("drzewo eksploratora: zapis i odczyt per baza, przycinanie usuniętych folderów", () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  saveTreeOpen("A", new Set(["root", "f1", "gone"]), storage);
  saveTreeOpen("B", new Set(["root", "x"]), storage);
  const a = loadTreeOpen("A", storage);
  assert.deepEqual([...a].sort(), ["f1", "gone", "root"]);
  assert.deepEqual([...loadTreeOpen("B", storage)].sort(), ["root", "x"]);
  pruneTreeOpen(a, [{ id: "f1" }]);
  assert.deepEqual([...a].sort(), ["f1", "root"]);
  assert.deepEqual([...loadTreeOpen("C", storage)], ["root"]);
  // niedostępny storage nie wywraca
  assert.deepEqual([...loadTreeOpen("A", { getItem() { throw new Error("x"); } })], ["root"]);
  saveTreeOpen("A", new Set(["root"]), { setItem() { throw new Error("x"); } });
});
