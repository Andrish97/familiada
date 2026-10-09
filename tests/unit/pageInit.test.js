// Testy initPage() (js/core/page-init.js): dostęp wg PAGES, guard urządzenia,
// podpięcie #btnBack / #btnManual / konta, wspólna nakładka (gość, telefon).
// Zależności z sieci i przeglądarki (auth, topbar, modal-sheet, device-guard)
// podstawiamy przez opts.deps; DOM to minimalna atrapa.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initPage } from "../../web/shared/js/core/page-init.js";
import { loginUrl } from "../../web/shared/js/core/nav-map.js";

function fakeEl(tag = "BUTTON") {
  const listeners = {};
  return {
    tagName: tag,
    dataset: {},
    style: {},
    hidden: false,
    attrs: {},
    innerHTML: "",
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    async click() { for (const fn of listeners.click || []) await fn({ type: "click" }); },
    listeners,
  };
}

let els;
let topbar;
let loc;

beforeEach(() => {
  els = { btnBack: fakeEl(), btnManual: fakeEl() };
  topbar = { classList: { added: [], add(c) { this.added.push(c); } } };
  // lang=pl w adresie: getUiLang() czyta go przed navigator.language.
  loc = { pathname: "/games/editor/", search: "?id=1&lang=pl", hash: "", href: "" };
  globalThis.location = loc;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    getElementById: (id) => els[id] || null,
    querySelector: (sel) => (sel === ".topbar" ? topbar : null),
  };
});

function makeDeps(over = {}) {
  const calls = { requireAuth: [], getUser: 0, account: [], sheet: 0, wide: [], phone: [] };
  const deps = {
    requireAuth: async (to) => { calls.requireAuth.push(to); return over.user === undefined ? { id: "u1" } : over.user; },
    getUser: async () => { calls.getUser++; return over.user === undefined ? null : over.user; },
    setTopbarAccount: (u, o) => { calls.account.push({ u, o }); return { guestMode: false }; },
    handleSheetBack: () => { calls.sheet++; return over.sheetOpen === true; },
    guardDesktopOnly: (o) => { calls.wide.push(o); return { refresh() {} }; },
    blockPhone: (o) => { calls.phone.push(o); return over.phone === true; },
    isPhoneScreen: () => over.phoneScreen === true,
  };
  return { deps, calls };
}

test("strona z kontem: requireAuth z adresem logowania, topbar-ready, zwraca użytkownika", async () => {
  const { deps, calls } = makeDeps();
  const user = await initPage("editor", { deps });
  assert.deepEqual(user, { id: "u1" });
  assert.deepEqual(calls.requireAuth, [loginUrl({ lang: "pl" })]);
  assert.equal(calls.account.length, 1);
  assert.deepEqual(topbar.classList.added, ["topbar-ready"]);
});

test("brak sesji: requireAuth przekierował, initPage zwraca null i niczego nie podpina", async () => {
  const { deps, calls } = makeDeps({ user: null });
  assert.equal(await initPage("editor", { deps }), null);
  assert.equal(calls.account.length, 0);
  assert.equal(topbar.classList.added.length, 0);
  assert.equal(els.btnBack.listeners.click, undefined);
});

test("strona publiczna: getUser bez przekierowania, null dla niezalogowanego", async () => {
  const { deps, calls } = makeDeps({ user: null });
  loc.pathname = "/marketplace/";
  const user = await initPage("marketplace", { deps });
  assert.equal(user, null);
  assert.equal(calls.getUser, 1);
  assert.equal(calls.requireAuth.length, 0);
  assert.equal(calls.account.length, 1); // menu „Zaloguj” dla niezalogowanego
  assert.deepEqual(topbar.classList.added, ["topbar-ready"]);
});

test("niezalogowany nie dostaje przycisku „Wskazówki” (instrukcja jest dla konta)", async () => {
  const { deps } = makeDeps({ user: null });
  loc.pathname = "/marketplace/";
  await initPage("marketplace", { deps });
  assert.equal(els.btnManual.hidden, true);
  assert.equal(els.btnManual.listeners.click, undefined);
});

test("#btnBack: handleSheetBack idzie pierwsze, potem przejście na backHref z mapy", async () => {
  const { deps, calls } = makeDeps({ sheetOpen: true });
  loc.search = "?id=1&ret=%2Fgames%2F&lang=pl";
  await initPage("editor", { deps });
  assert.equal(els.btnBack.dataset.sheetBack, "1");
  await els.btnBack.click();
  assert.equal(calls.sheet, 1);
  assert.equal(loc.href, "", "otwarty modal przejmuje kliknięcie");

  const second = makeDeps({ sheetOpen: false });
  els.btnBack = fakeEl();
  await initPage("editor", { deps: second.deps });
  await els.btnBack.click();
  assert.equal(loc.href, "/games/");
});

test("onBack zastępuje przejście i dostaje href z mapy", async () => {
  const { deps } = makeDeps();
  let got = null;
  await initPage("polls", { deps, onBack: async (href) => { got = href; } });
  await els.btnBack.click();
  assert.equal(got, "/games/");
  assert.equal(loc.href, "");
});

test("back: false i manual: false pomijają przyciski", async () => {
  const { deps } = makeDeps();
  await initPage("gameSettings", { deps, back: false, manual: false });
  assert.equal(els.btnBack.listeners.click, undefined);
  assert.equal(els.btnManual.listeners.click, undefined);
});

test("#btnManual prowadzi do instrukcji z kotwicą ze strony i ret", async () => {
  const { deps } = makeDeps();
  loc.pathname = "/polls/";
  loc.search = "?id=7&lang=pl";
  await initPage("polls", { deps });
  await els.btnManual.click();
  assert.equal(loc.href, "/manual/?tab=polls&ret=%2Fpolls%2F%3Fid%3D7");
});

test("onManual dostaje adres instrukcji", async () => {
  const { deps } = makeDeps();
  let got = null;
  await initPage("editor", { deps, onManual: async (href) => { got = href; } });
  await els.btnManual.click();
  assert.match(got, /^\/manual\/\?tab=edit&ret=/);
});

test("device wide: guardDesktopOnly z backHref, użytkownik wraca", async () => {
  const { deps, calls } = makeDeps();
  loc.pathname = "/control/";
  loc.search = "?id=g1&lang=pl";
  const user = await initPage("control", { deps, manual: false });
  assert.deepEqual(user, { id: "u1" });
  assert.equal(calls.wide.length, 1);
  assert.equal(calls.wide[0].backHref, "/games/");
});

test("device noPhone: telefon dostaje nakładkę i null, topbar nadal działa", async () => {
  const { deps, calls } = makeDeps({ phone: true });
  loc.pathname = "/logo/editor/draw/";
  loc.search = "?id=3&lang=pl";
  const user = await initPage("logoDraw", { deps });
  assert.equal(user, null);
  assert.equal(calls.phone.length, 1);
  assert.equal(calls.phone[0].backHref, "/logo/");
  assert.ok(els.btnBack.listeners.click, "„Wstecz” w topbarze zostaje");
  assert.deepEqual(topbar.classList.added, ["topbar-ready"]);
});

test("device noPhone: szeroki ekran przechodzi", async () => {
  const { deps } = makeDeps({ phone: false });
  loc.pathname = "/logo/editor/draw/";
  assert.deepEqual(await initPage("logoDraw", { deps }), { id: "u1" });
});

test("konto: loginHref i accountHref z mapy, opcje strony nadpisują", async () => {
  const { deps, calls } = makeDeps();
  await initPage("games", { deps, account: { withAccountSettings: true } });
  const o = calls.account[0].o;
  assert.equal(o.loginHref, "/login/");
  assert.equal(o.accountHref, "/account/");
  assert.equal(o.withAccountSettings, true);
});

test("czeka na opts.ready przed wiringiem topbaru", async () => {
  const { deps } = makeDeps();
  let release;
  const ready = new Promise((r) => { release = r; });
  const p = initPage("editor", { deps, ready });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(topbar.classList.added.length, 0);
  release();
  await p;
  assert.equal(topbar.classList.added.length, 1);
});

test("nieznana strona to błąd programisty", async () => {
  const { deps } = makeDeps();
  await assert.rejects(() => initPage("nieMaTakiej", { deps }), /nieznana strona/);
});

test("loginUrl z forceAuth dla gościa", () => {
  assert.equal(loginUrl({ lang: "pl", forceAuth: true }), "/login/?force_auth=1");
  assert.equal(loginUrl({ lang: "en", forceAuth: true }), "/login/?force_auth=1&lang=en");
});

test("device-guard, page-overlay i page-init nie cofają przez historię ani referrera", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["device-guard.js", "page-overlay.js", "page-init.js"]) {
    const src = readFileSync(new URL(`../../web/shared/js/core/${f}`, import.meta.url), "utf8");
    const code = src.replace(/\/\/[^\n]*/g, ""); // komentarze mogą o tym mówić
    assert.doesNotMatch(code, /history\.back|document\.referrer/, f);
  }
});

test("klucze pageGuard są w pl/en/uk, stare deviceGuard i guestGuard zniknęły", async () => {
  const keys = ["phoneTitle", "phoneMessage", "rotateTitle", "rotateMessage", "narrowTitle", "narrowMessage", "back", "guestTitle", "guestMessage", "login"];
  for (const lang of ["pl", "en", "uk"]) {
    const mod = await import(`../../web/shared/translation/${lang}.js`);
    const dict = mod.default || Object.values(mod)[0];
    for (const k of keys) assert.equal(typeof dict.pageGuard?.[k], "string", `${lang}.pageGuard.${k}`);
    assert.equal(dict.deviceGuard, undefined, `${lang}.deviceGuard`);
    assert.equal(dict.guestGuard, undefined, `${lang}.guestGuard`);
  }
});

// --- przyciski z PAGES[id].buttons ---------------------------------------

function gamesButtons() {
  for (const id of ["btnMarketplace", "btnLogoEditor", "btnConnectDevice", "btnSubscriptionsHub", "btnBases", "btnPlay", "btnSettings", "btnEdit", "btnPoll"]) {
    els[id] = fakeEl();
  }
  els.btnConnectDevice.dataset.navHidden = "true";
  els.btnConnectDevice.style.display = "none";
  loc.pathname = "/games/";
  loc.search = "?lang=pl";
}

test("przyciski: konto widzi wszystkie, przejście przez linkTo", async () => {
  gamesButtons();
  const { deps } = makeDeps();
  await initPage("games", { deps });
  assert.equal(els.btnSubscriptionsHub.hidden, false);
  assert.equal(els.btnConnectDevice.dataset.navHidden, undefined, "zdjęte domyślne ukrycie z HTML");
  assert.equal(els.btnConnectDevice.style.display, "");
  await els.btnBases.click();
  assert.equal(loc.href, "/bases/?ret=%2Fgames%2F");
  await els.btnConnectDevice.click();
  assert.equal(loc.href, "/connect/?ret=%2Fgames%2F");
});

test("przyciski: gość nie dostaje przycisków dla konta (roles: user)", async () => {
  gamesButtons();
  const guest = { id: "g1", user_metadata: { is_guest: true } };
  const { deps } = makeDeps({ user: guest });
  await initPage("games", { deps });
  for (const id of ["btnSubscriptionsHub", "btnConnectDevice"]) {
    assert.equal(els[id].hidden, true, id);
    assert.equal(els[id].style.display, "none", id);
    assert.equal(els[id].dataset.navHidden, "true", id);
    assert.equal(els[id].listeners.click, undefined, id);
  }
  assert.equal(els.btnBases.hidden, false);
  assert.ok(els.btnBases.listeners.click);
});

test("przyciski: device wide jest ukryty na telefonie, na komputerze zostaje", async () => {
  gamesButtons();
  await initPage("games", { deps: makeDeps({ phoneScreen: true }).deps });
  for (const id of ["btnPlay", "btnSettings"]) {
    assert.equal(els[id].hidden, true, id);
    assert.equal(els[id].style.display, "none", id);
  }
  assert.equal(els.btnEdit.hidden, false);
  assert.equal(els.btnMarketplace.hidden, false);

  gamesButtons();
  await initPage("games", { deps: makeDeps({ phoneScreen: false }).deps });
  assert.equal(els.btnPlay.hidden, false);
  assert.equal(els.btnSettings.hidden, false);
});

test("przyciski custom: initPage nie podpina kliknięcia, cel daje strona", async () => {
  gamesButtons();
  await initPage("games", { deps: makeDeps().deps });
  for (const id of ["btnPlay", "btnSettings", "btnEdit", "btnPoll"]) {
    assert.equal(els[id].listeners.click, undefined, id);
  }
});

test("przyciski: brak elementu w HTML nie przeszkadza, a strona bez buttons jest pomijana", async () => {
  loc.pathname = "/games/";
  await initPage("games", { deps: makeDeps().deps });
  loc.pathname = "/account/";
  await initPage("account", { deps: makeDeps().deps });
});

test("przyciski: odnośnik <a> dostaje href zamiast nasłuchu", async () => {
  els.btnLegal = fakeEl("A");
  loc.pathname = "/manual/";
  loc.search = "?lang=pl";
  await initPage("manual", { deps: makeDeps().deps });
  assert.equal(els.btnLegal.attrs.href, "/privacy/?ret=%2Fmanual%2F");
  assert.equal(els.btnLegal.listeners.click, undefined);
});
