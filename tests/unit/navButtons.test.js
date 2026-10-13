// Testy przycisków i blokad w mapie stron (PAGES[...].buttons / .locks):
// cele istnieją, przyciski są w HTML strony, kod stron nie podpina ręcznie
// tych samych przejść, diagramy w dokumencie zgadzają się z mapą.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  PAGES, NAV_DEPENDENCIES, ROLES, GLOBAL_DIALOGS, backTarget, buttonBlocked, buttonHref, buttonRoles, buttonVisible, dialogAllowed, pageRoles, roleOf,
} from "../../web/shared/js/core/nav-map.js";
import { applyToDoc, mapGraph, MAPS } from "../../scripts/nav-maps.mjs";

const WEB = fileURLToPath(new URL("../../web/", import.meta.url));
const DOC = fileURLToPath(new URL("../../docs/nawigacja-mapa-plan.md", import.meta.url));

const htmlOf = (id) => path.join(WEB, PAGES[id].path.slice(1), "index.html");
const jsDirOf = (id) => path.join(WEB, PAGES[id].path.slice(1), "js");

const withButtons = Object.entries(PAGES).filter(([, p]) => p.buttons);

test("są strony z przyciskami (games, bases, manual, gameSettings)", () => {
  for (const id of ["games", "bases", "manual", "gameSettings"]) assert.ok(PAGES[id].buttons, id);
});

test("wymagania szerokości stron są jawne i odróżniają edytory od Control", () => {
  assert.equal(PAGES.logoText.minViewportWidth, 700);
  assert.equal(PAGES.logoDraw.minViewportWidth, 700);
  assert.equal(PAGES.logoImage.minViewportWidth, 700);
  assert.equal(PAGES.control.minViewportWidth, 980);
  assert.equal(PAGES.gameSettings.minViewportWidth, 980);
  for (const page of Object.values(PAGES)) {
    if (page.minViewportWidth) assert.ok(Number.isFinite(page.minViewportWidth));
  }
});

test("każdy cel przycisku istnieje w PAGES, a karta celu na jego liście tabs", () => {
  for (const [id, p] of withButtons) {
    for (const [bid, spec] of Object.entries(p.buttons)) {
      assert.ok(PAGES[spec.to], `${id}.${bid}.to = ${spec.to}`);
      if (spec.tab) assert.ok(PAGES[spec.to].tabs?.includes(spec.tab), `${id}.${bid}.tab = ${spec.tab}`);
      if (spec.roles) for (const r of spec.roles) assert.ok(ROLES.includes(r), `${id}.${bid} rola ${r}`);
      if (spec.minViewportWidth) assert.ok(Number.isFinite(spec.minViewportWidth) && spec.minViewportWidth > 0, `${id}.${bid}.minViewportWidth`);
      assert.ok(buttonRoles(id, spec).length > 0, `${id}.${bid}: żadna rola nie widzi przycisku`);
    }
  }
});

test("„Wstecz” celu wolno wrócić na stronę z przyciskiem (from celu zawiera stronę)", () => {
  for (const [id, p] of withButtons) {
    for (const [bid, spec] of Object.entries(p.buttons)) {
      const href = buttonHref(spec, { href: p.path, lang: "pl" });
      const ret = new URL(href, "https://x.test").searchParams.get("ret");
      const from = PAGES[spec.to].from;
      const allowed = from === "*" || (Array.isArray(from) && from.includes(id));
      assert.equal(ret != null, allowed, `${id}.${bid} → ${spec.to}`);
    }
  }
});

test("każdy przycisk z mapy istnieje w HTML swojej strony", () => {
  for (const [id, p] of withButtons) {
    assert.ok(existsSync(htmlOf(id)), htmlOf(id));
    const html = readFileSync(htmlOf(id), "utf8");
    for (const bid of Object.keys(p.buttons)) {
      assert.match(html, new RegExp(`\\bid="${bid}"`), `${id}: brak #${bid} w HTML`);
    }
  }
});

test("adresowe dialogi E19N są jawnie dozwolone w mapie i obecne na stronie", () => {
  for (const [id, page] of Object.entries(PAGES)) {
    if (!page.dialogs?.length) continue;
    assert.ok(page.state?.includes("dialog"), `${id}: dialog musi być zachowany w adresie powrotu`);
    const html = readFileSync(htmlOf(id), "utf8");
    for (const dialog of page.dialogs) assert.match(html, new RegExp(`\\bid="${dialog}"`), `${id}: brak #${dialog}`);
  }
  for (const pageId of GLOBAL_DIALOGS.contactModalOverlay) {
    assert.equal(dialogAllowed(pageId, "contactModalOverlay"), true, pageId);
    assert.ok(PAGES[pageId].state?.includes("dialog"), `${pageId}: globalny dialog zachowuje stan URL`);
  }
  assert.equal(dialogAllowed("home", "contactModalOverlay"), false);
  assert.equal(dialogAllowed("games", "missingOverlay"), false);
});

test("kod strony nie podpina ręcznie przejść z mapy (bez dublowania initPage)", () => {
  for (const [id, p] of withButtons) {
    const dir = jsDirOf(id);
    if (!existsSync(dir)) continue;
    const code = readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
    for (const [bid, spec] of Object.entries(p.buttons)) {
      if (spec.custom) continue;
      assert.doesNotMatch(code, new RegExp(`\\b${bid}\\??\\.addEventListener`), `${id}: ${bid} podpinany w kodzie strony`);
    }
  }
});

test("w kodzie stron nie ma twardych przejść na adresy z mapy", () => {
  const files = [
    "bases/explorer/js/actions.js", "account/js/account.js", "games/js/games.js",
    "bases/js/bases.js", "manual/js/manual.js", "games/settings/js/game-settings.js",
  ];
  for (const f of files) {
    const code = readFileSync(path.join(WEB, f), "utf8").replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(code, /location\.href\s*=\s*[`"']\/(games|bases|friends|polls|logo|marketplace|connect|manual|privacy)\//, f);
  }
});

test("widoczność przycisków: rola i wymagany viewport, niezależnie od formatu urządzenia", () => {
  const connect = PAGES.games.buttons.btnConnectDevice;
  assert.equal(buttonVisible("games", connect, "user", { viewportWidth: 390, formFactor: "phone" }), true);
  assert.equal(buttonVisible("games", connect, "guest", { viewportWidth: 390, formFactor: "phone" }), false);
  const play = PAGES.games.buttons.btnPlay;
  assert.equal(buttonVisible("games", play, "guest", { viewportWidth: 1280, formFactor: "desktop" }), true);
  assert.equal(buttonVisible("games", play, "guest", { viewportWidth: 844, formFactor: "phone" }), false, "telefon landscape nadal nie mieści Control");
  assert.equal(buttonVisible("games", play, "guest", { viewportWidth: 1200, formFactor: "phone" }), true, "szeroki viewport telefonu spełnia wymaganie strony");
  assert.equal(buttonVisible("games", PAGES.games.buttons.btnBases, "guest", { viewportWidth: 390, formFactor: "phone" }), true);
  for (const [id, page] of Object.entries(PAGES)) {
    if (page.minViewportWidth !== 700) continue;
    assert.equal(buttonVisible("games", { to: id, minViewportWidth: page.minViewportWidth }, "guest", { viewportWidth: 844, formFactor: "phone" }), true, `${id} dostępny na telefonie poziomo`);
    assert.equal(buttonVisible("games", { to: id, minViewportWidth: page.minViewportWidth }, "guest", { viewportWidth: 390, formFactor: "phone" }), false, `${id} ukryty przy zbyt wąskim viewportcie`);
  }
  assert.deepEqual(buttonRoles("games", PAGES.games.buttons.btnBases), ["guest", "user"]);
});

test("role: anon, guest, user; wstęp na stronę wg access", () => {
  assert.equal(roleOf(null, false), "anon");
  assert.equal(roleOf({}, true), "guest");
  assert.equal(roleOf({}, false), "user");
  assert.deepEqual(pageRoles("marketplace"), ["anon", "guest", "user"]);
  assert.deepEqual(pageRoles("games"), ["guest", "user"]);
  assert.deepEqual(pageRoles("friends"), ["user"]);
});

test("locks: znane typy, id z parametrów stanu strony, tryb exclusive/shared", () => {
  const types = ["game", "logo", "base", "logos"];
  for (const [id, p] of Object.entries(PAGES)) {
    if (!p.locks) continue;
    for (const l of p.locks) {
      assert.ok(types.includes(l.type), `${id}: typ ${l.type}`);
      if (l.type === "logos") assert.equal(l.id, undefined, `${id}: pula logo bez id`);
      else assert.ok(p.state?.includes(l.id), `${id}: id "${l.id}" nie jest w state`);
      if (l.mode) assert.ok(["exclusive", "shared"].includes(l.mode), `${id}: tryb ${l.mode}`);
    }
  }
});

test("locks wg docs/blokady-zasobow.md, sekcja 6", () => {
  const sig = (id) => (PAGES[id].locks || []).map((l) => `${l.type}${l.mode === "shared" ? "~" : ""}`).sort().join(",");
  assert.equal(sig("editor"), "game");
  assert.equal(sig("polls"), "game");
  assert.equal(sig("gameSettings"), "game,logos~");
  assert.equal(sig("control"), "game,logos~");
  for (const id of ["logoText", "logoDraw", "logoImage"]) assert.equal(sig(id), "logo");
  assert.equal(sig("baseExplorer"), "base~");
});

test("strony, które wołają guardResourceLock(s), mają locks w mapie", () => {
  const holders = {
    editor: "games/editor/js/editor.js",
    polls: "polls/js/polls.js",
    gameSettings: "games/settings/js/game-settings.js",
    control: "control/js/app.js",
    logoText: "logo/js/editor-page.js",
    baseExplorer: "bases/explorer/js/page.js",
  };
  for (const [id, f] of Object.entries(holders)) {
    const code = readFileSync(path.join(WEB, f), "utf8");
    assert.match(code, /guardResourceLocks?\(/, `${f} nie woła guardResourceLock(s)`);
    assert.ok(PAGES[id].locks?.length > 0, `${id}: brak locks w mapie`);
  }
});

test("mapy: telefon nie ma stron i przycisków wide, komputer ma", () => {
  const phone = mapGraph({ role: "user", phone: true });
  const desktop = mapGraph({ role: "user", phone: false });
  assert.ok(!phone.nodes.includes("control") && !phone.nodes.includes("gameSettings"));
  assert.ok(!phone.buttons.some((b) => b.label.startsWith("btnPlay")));
  assert.ok(desktop.buttons.some((b) => b.from === "games" && b.to === "control"));
  const guest = mapGraph({ role: "guest", phone: false });
  assert.ok(!guest.nodes.includes("friends"));
  assert.ok(!guest.buttons.some((b) => b.label === "btnConnectDevice"));
  assert.equal(MAPS.length, 6);
});

test("docs/nawigacja-mapa-plan.md: diagramy zgodne z PAGES (node scripts/nav-maps.mjs)", () => {
  const doc = readFileSync(DOC, "utf8");
  assert.equal(applyToDoc(doc), doc, "diagramy nieaktualne — uruchom: node scripts/nav-maps.mjs");
});

test("skróty kontaktów: wspólne ikony, tylko konto i powrót do Control", () => {
  for (const [id, p] of withButtons) for (const [bid, spec] of Object.entries(p.buttons)) {
    if (!["friends", "subscribers"].includes(spec.to)) continue;
    const html = readFileSync(htmlOf(id), "utf8");
    const button = html.match(new RegExp(`<button[^>]*id="${bid}"[^>]*>[\\s\\S]*?</button>`))?.[0];
    assert.ok(button, `${id}.${bid}`);
    assert.match(button, new RegExp(`data-i18n-icon-after="${spec.to === "friends" ? "people" : "envelope"}"`));
    assert.equal(buttonVisible(id, spec, "guest", false), false);
    assert.equal(buttonVisible(id, spec, "user", false), true);
  }
  assert.match(readFileSync(htmlOf("games"), "utf8"), /data-i18n="games.nav.tasks" data-i18n-icon-after="bell"/);
  assert.match(readFileSync(htmlOf("control"), "utf8"), /id="btnFriends"[^>]*data-nav-hidden="true"/);
});

test("Control → Znajomi jest aktywny w mapie, a ustawienia zachowują kontekst gry", () => {
  const spec = PAGES.control.buttons.btnFriends;
  assert.equal(spec.blockedUntil, undefined);
  assert.equal(NAV_DEPENDENCIES.modalPagesReview.completed, true);
  assert.equal(buttonBlocked(spec), false);
  const graph = mapGraph({role:"user",phone:false});
  assert.ok(graph.buttons.some(edge => edge.from === "control" && edge.to === "friends"));
  assert.ok(!graph.blocked.some(edge => edge.from === "control"));
  assert.ok(!mapGraph({role:"user",phone:true}).blocked.some(edge => edge.from === "control"));
  assert.equal(buttonBlocked(PAGES.games.buttons.btnFriends), false);
  const backToControl = backTarget("gameSettings", { href: "/games/settings/?id=game-1&ret=%2Fcontrol%2F%3Fid%3Dgame-1" });
  assert.equal(backToControl.pageId, "control");
});
