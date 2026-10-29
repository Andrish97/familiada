// Każda strona, na którą może prowadzić „Wstecz” (parent, parentAnon, from — także
// wyliczone from Wskazówek), ma nazwę nav.page.<id> we wszystkich językach.
// Zgłoszenie 2026-10-29: Znajomi, Subskrybenci i Zadania dawały surowy klucz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGES } from "../../web/shared/js/core/nav-map.js";
import { dictionaries } from "./helpers/i18n.js";

// Ekran TV nie ma przycisku Wskazówek ani menu konta — formalnie w from Wskazówek, nieosiągalny.
const NO_TOPBAR = new Set(["connectTv"]);

test("cele „Wstecz” mają nazwę strony (nav.page.*) w PL/EN/UK", () => {
  const targets = new Set();
  for (const p of Object.values(PAGES)) {
    if (p.parent) targets.add(p.parent);
    if (p.parentAnon) targets.add(p.parentAnon);
    for (const id of Array.isArray(p.from) ? p.from : []) targets.add(id);
  }
  for (const lang of ["pl", "en", "uk"]) {
    const names = dictionaries[lang].nav.page;
    for (const id of targets) {
      if (NO_TOPBAR.has(id)) continue;
      assert.ok(names[id], `${lang}: brak nav.page.${id}`);
    }
  }
});
