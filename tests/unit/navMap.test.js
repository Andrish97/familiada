// Testy mapy nawigacji (js/core/nav-map.js): łańcuch ret, sprawdzanie z listą
// from, limit głębokości, zachowanie języka, parent bez ret.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAGES, MAX_RET_DEPTH, linkTo, backHref, backTarget, loginUrl, pageIdForPath,
} from "../../web/shared/js/core/nav-map.js";

const ctx = (href, extra = {}) => ({ href, lang: "pl", ...extra });
const retOf = (href) => new URL(href, "https://x.test").searchParams.get("ret");

test("każdy parent i każda pozycja from wskazuje istniejącą stronę", () => {
  for (const [id, p] of Object.entries(PAGES)) {
    if (p.parent) assert.ok(PAGES[p.parent], `${id}.parent`);
    if (p.parentAnon) assert.ok(PAGES[p.parentAnon], `${id}.parentAnon`);
    if (Array.isArray(p.from)) for (const f of p.from) assert.ok(PAGES[f], `${id}.from ${f}`);
  }
});

test("ścieżki stron są unikalne i rozpoznawane", () => {
  const paths = Object.values(PAGES).map((p) => p.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const [id, p] of Object.entries(PAGES)) assert.equal(pageIdForPath(p.path), id);
  assert.equal(pageIdForPath("/marketplace/game/abc"), "marketplace");
  assert.equal(pageIdForPath("/nie-ma/"), null);
  assert.equal(pageIdForPath("/games/settings"), "gameSettings");
  assert.equal(pageIdForPath("/logo/editor-draw"), "logoDraw");
});

test("linkTo niesie w ret pełny bieżący adres", () => {
  const href = linkTo("polls", { id: 7 }, ctx("/games/?tab=poll_text"));
  assert.equal(href, "/polls/?id=7&ret=%2Fgames%2F%3Ftab%3Dpoll_text");
  assert.equal(retOf(href), "/games/?tab=poll_text");
});

test("linkTo bez ret, gdy bieżąca strona nie jest na liście from celu", () => {
  const href = linkTo("editor", { id: 1 }, ctx("/account/"));
  assert.equal(href, "/games/editor/?id=1");
});

test("linkTo: kotwica w hash", () => {
  const href = linkTo("manual", { hash: "polls" }, ctx("/polls/?id=7"));
  assert.equal(href, "/manual/?ret=%2Fpolls%2F%3Fid%3D7#polls");
});

test("łańcuch powrotów: games -> subscriptions -> polls -> manual i z powrotem", () => {
  const subs = linkTo("subscriptions", {}, ctx("/games/"));
  const polls = linkTo("polls", { id: 7 }, ctx(subs));
  const manual = linkTo("manual", { hash: "polls" }, ctx(polls));

  const b1 = backTarget("manual", ctx(manual));
  assert.equal(b1.pageId, "polls");
  assert.equal(new URL(b1.href, "https://x.test").searchParams.get("id"), "7");

  const b2 = backTarget("polls", ctx(b1.href));
  assert.equal(b2.pageId, "subscriptions");

  const b3 = backTarget("subscriptions", ctx(b2.href));
  assert.equal(b3.pageId, "games");
  assert.equal(b3.href, "/games/");
});

test("ret spoza listy from jest ignorowany i wraca do parent", () => {
  // editor.from = [games]; ret na /account/ jest obcy
  assert.equal(backHref("editor", ctx("/games/editor/?id=1&ret=%2Faccount%2F")), "/games/");
  // nieznana strona
  assert.equal(backHref("editor", ctx("/games/editor/?id=1&ret=%2Fnie-ma%2F")), "/games/");
});

test("obcy, protokołowy i zepsuty ret wraca do parent", () => {
  for (const bad of [
    "https://evil.example/games/",
    "//evil.example/games/",
    "javascript:alert(1)",
    "games",
    "/\\evil.example",
    "",
  ]) {
    const href = `/games/editor/?id=1&ret=${encodeURIComponent(bad)}`;
    assert.equal(backHref("editor", ctx(href)), "/games/", bad);
  }
});

test("zepsuty poziom w środku łańcucha unieważnia cały ret", () => {
  const inner = "/polls/?id=7&ret=" + encodeURIComponent("/account/");
  const href = `/manual/?ret=${encodeURIComponent(inner)}`;
  assert.equal(backHref("manual", ctx(href)), "/games/");
});

test("limit głębokości: łańcuch dłuższy niż MAX_RET_DEPTH wraca do parent", () => {
  assert.equal(MAX_RET_DEPTH, 4);
  // 4 poziomy: subscriptions <- bases <- subscriptions <- bases ... -> games
  const levels = ["/games/"];
  const chain = ["bases", "subscriptions", "bases", "subscriptions", "bases"];
  let cur = "/games/";
  for (const id of chain) {
    const next = linkTo(id, {}, ctx(cur));
    levels.push(next);
    cur = next;
  }
  // linkTo przycina łańcuch, więc nigdy nie przekracza limitu
  let depth = 0;
  let h = cur;
  while (retOf(h) != null) { depth++; h = retOf(h); }
  assert.ok(depth <= MAX_RET_DEPTH, `głębokość ${depth}`);

  // ręcznie zbudowany, zbyt głęboki ret (5 poziomów) jest odrzucony
  let deep = "/games/";
  for (const path of ["/bases/", "/subscriptions/", "/bases/", "/subscriptions/", "/bases/"]) {
    deep = `${path}?ret=${encodeURIComponent(deep)}`;
  }
  // deep = bases?ret=subs?ret=bases?ret=subs?ret=bases?ret=games -> 5 poziomów w ret
  assert.equal(backHref("subscriptions", ctx(`/subscriptions/?ret=${encodeURIComponent(deep)}`)), "/games/");
});

test("ret o dozwolonej głębokości (4 poziomy) jest przyjęty", () => {
  let deep = "/games/";
  for (const path of ["/bases/", "/subscriptions/", "/bases/"]) {
    deep = `${path}?ret=${encodeURIComponent(deep)}`;
  }
  // deep: bases -> subs -> bases -> games = 4 strony
  const target = backTarget("subscriptions", ctx(`/subscriptions/?ret=${encodeURIComponent(deep)}`));
  assert.equal(target.pageId, "bases");
});

test("linkTo przycina zepsuty ret bieżącej strony zamiast go przenosić", () => {
  const href = linkTo("manual", {}, ctx("/games/editor/?id=1&ret=%2Faccount%2F"));
  assert.equal(href, "/manual/?ret=%2Fgames%2Feditor%2F%3Fid%3D1");
});

test("język: nie-polski trafia na zewnętrzny adres, nie do ret", () => {
  const href = linkTo("polls", { id: 7 }, ctx("/games/?lang=en&tab=poll_text", { lang: "en" }));
  const u = new URL(href, "https://x.test");
  assert.equal(u.searchParams.get("lang"), "en");
  assert.equal(u.searchParams.get("ret"), "/games/?tab=poll_text");

  const back = backHref("polls", ctx(href, { lang: "en" }));
  assert.equal(new URL(back, "https://x.test").searchParams.get("lang"), "en");
  assert.equal(new URL(back, "https://x.test").searchParams.get("tab"), "poll_text");
});

test("język polski: parametr lang znika", () => {
  const href = linkTo("bases", {}, ctx("/games/?lang=en", { lang: "pl" }));
  assert.equal(new URL(href, "https://x.test").searchParams.has("lang"), false);
  assert.equal(backHref("bases", ctx("/bases/?lang=en", { lang: "pl" })), "/games/");
  assert.equal(backHref("bases", ctx("/bases/", { lang: "uk" })), "/games/?lang=uk");
});

test("backHref bez ret: parent; games nie ma rodzica", () => {
  assert.equal(backHref("polls", ctx("/polls/?id=7")), "/games/");
  assert.equal(backHref("baseExplorer", ctx("/bases/explorer/?id=b1")), "/bases/");
  assert.equal(backHref("logoDraw", ctx("/logo/editor-draw/?id=3")), "/logo/");
  assert.equal(backHref("games", ctx("/games/")), null);
});

test("ret zachowuje kartę listy, z której wyszliśmy", () => {
  const explorer = linkTo("baseExplorer", { id: "b1" }, ctx("/bases/?tab=shared"));
  assert.equal(backHref("baseExplorer", ctx(explorer)), "/bases/?tab=shared");
  const logo = linkTo("logoDraw", { id: 5 }, ctx("/logo/?tab=draw"));
  assert.equal(backHref("logoDraw", ctx(logo)), "/logo/?tab=draw");
});

test("gameSettings bez ret wraca do Control tej samej gry", () => {
  assert.equal(backHref("gameSettings", ctx("/games/settings/?id=g1")), "/control/?id=g1");
  const fromGames = linkTo("gameSettings", { id: "g1" }, ctx("/games/"));
  assert.equal(backHref("gameSettings", ctx(fromGames)), "/games/");
});

test("strony publiczne: niezalogowany wraca na landing", () => {
  assert.equal(backHref("marketplace", ctx("/marketplace/", { anon: true })), "/");
  assert.equal(backHref("marketplace", ctx("/marketplace/", { anon: false })), "/games/");
  assert.equal(backHref("connectDevice", ctx("/connect-device/", { anon: true })), "/");
  assert.equal(backHref("privacy", ctx("/privacy/", { anon: true })), "/");
});

test("instrukcja i prywatność: powrót przez wszystkie kroki", () => {
  const manual = linkTo("manual", { hash: "polls" }, ctx("/polls/?id=7&ret=%2Fgames%2F"));
  const privacy = linkTo("privacy", {}, ctx(manual));
  const b1 = backTarget("privacy", ctx(privacy));
  assert.equal(b1.pageId, "manual");
  const b2 = backTarget("manual", ctx(b1.href));
  assert.equal(b2.pageId, "polls");
  const b3 = backTarget("polls", ctx(b2.href));
  assert.equal(b3.pageId, "games");
});

test("instrukcja nie wraca do samej siebie ani do landingu", () => {
  assert.equal(backHref("manual", ctx("/manual/?ret=%2Fmanual%2F")), "/games/");
  assert.equal(backHref("manual", ctx("/manual/?ret=%2F")), "/games/");
});

test("loginUrl: /login/ z językiem", () => {
  assert.equal(loginUrl({ lang: "pl" }), "/login/");
  assert.equal(loginUrl({ lang: "en" }), "/login/?lang=en");
});

test("nieznana strona to błąd programisty", () => {
  assert.throws(() => linkTo("nieMaTakiej", {}, ctx("/")), /nieznana strona/);
});
