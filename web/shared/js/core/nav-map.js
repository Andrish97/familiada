// js/core/nav-map.js
// Jedna mapa stron: kto wchodzi, dokąd prowadzi „Wstecz”, jak strona się
// nazywa. Strony nie składają same ?ret=, etykiet „Wróć do …” ani adresów
// logowania — używają linkTo(), backHref() i loginUrl().
// Decyzje: docs/nawigacja-mapa-plan.md (sekcje 2 i 7).
//
// Pola wpisu w PAGES:
//   path          adres strony (pasuje dokładnie; subpaths: true — także podścieżki)
//   access        "public" | "guest" (gość + konto) | "user" (tylko konto)
//   device        "any" | "wide" (Control, ustawienia gry) | "noPhone"
//   parent        dokąd „Wstecz”, gdy nie ma poprawnego ?ret= (null — brak)
//   parentAnon    to samo dla niezalogowanego (strony publiczne)
//   parentParams  parametry adresu, które parent dostaje z bieżącej strony
//   from          strony, na które „Wstecz” wolno wrócić przez ?ret=
//                 (lista id albo "*" — każda strona z mapy)
//   manual        kotwica instrukcji dla przycisku „?”
//   state         parametry stanu strony (adres z nimi trafia do ?ret=)
//   tabs          karty strony w ?tab= (pierwsza = domyślna, bez parametru
//                 w adresie); czyta je tabs.js, strony nie mają własnych list
//   buttons       przyciski nawigacji strony: id elementu → opis
//                   to      id strony docelowej (cel buduje linkTo() z ret i językiem)
//                   roles   kto widzi przycisk: podzbiór ["anon", "guest", "user"]
//                           (anon — niezalogowany, guest — gość, user — konto);
//                           brak pola — każdy, kto ma wstęp na stronę
//                   device  "wide" albo "noPhone" — na telefonie przycisk jest ukryty
//                   tab     karta strony docelowej (?tab=)
//                   custom  true — przed przejściem strona coś sprawdza (wybrana
//                           gra, validateGame…); initPage tylko chowa przycisk wg
//                           roles i device, a kliknięcie i adres daje strona
//   locks         blokady zasobów, które strona trzyma (docs/blokady-zasobow.md,
//                 sekcja 6) — sama deklaracja, mechanizm jest w resource-lock.js:
//                   type    "game" | "logo" | "base" | "logos" (pula logo użytkownika)
//                   id      parametr adresu z id zasobu (brak dla "logos")
//                   mode    "exclusive" (domyślnie) | "shared"
//
// ?ret= niesie PEŁNY bieżący adres (razem z jego własnym ret), więc łańcuch
// powrotów odtwarza się krok po kroku. Każdy poziom jest sprawdzany z listą
// from strony, która go niesie; łańcuch dłuższy niż MAX_RET_DEPTH, obcy albo
// zepsuty ret oznacza powrót do parent. Bez fallbacków i aliasów.

import { getUiLang, t } from "../../translation/translation.js?v=v2026-10-10T06103";
import { iconText } from "./icons.js?v=v2026-10-10T06103";

export const MAX_RET_DEPTH = 4;

export const PAGES = {
  home:          { path: "/",                   access: "public", parent: null },
  login:         { path: "/login/",             access: "public", parent: "home" },
  games:         { path: "/games/",             access: "guest",  parent: null, from: [], manual: "general", tabs: ["prepared", "poll_text", "poll_points", "market"], state: ["tab"], buttons: {
    btnMarketplace:      { to: "marketplace" },
    btnLogoEditor:       { to: "logoEditor" },
    btnConnectDevice:    { to: "connectDevice", roles: ["user"] },
    btnSubscriptionsHub: { to: "subscriptions", roles: ["user"] },
    btnBases:            { to: "bases" },
    btnPlay:             { to: "control", device: "wide", custom: true },
    btnSettings:         { to: "gameSettings", device: "wide", custom: true },
    btnEdit:             { to: "editor", custom: true },
    btnPoll:             { to: "polls", custom: true },
  } },
  editor:        { path: "/games/editor/",     access: "guest",  parent: "games", from: ["games"], manual: "edit", state: ["id", "q"], locks: [{ type: "game", id: "id" }] },
  polls:         { path: "/polls/",             access: "guest",   parent: "games", from: ["games", "subscriptions"], manual: "polls", tabs: ["share", "results"], state: ["id", "tab"], locks: [{ type: "game", id: "id" }] },
  subscriptions: { path: "/subscriptions/",     access: "user",   parent: "games", from: ["games", "bases", "polls"], manual: "subscriptions", tabs: ["subscribers", "subscriptions", "tasks"], state: ["tab"] },
  bases:         { path: "/bases/",             access: "guest",  parent: "games", from: ["games", "subscriptions", "baseExplorer"], manual: "bases", tabs: ["mine", "shared"], state: ["tab"], buttons: {
    btnGoAlt:  { to: "subscriptions", roles: ["user"] },
    btnBrowse: { to: "baseExplorer", custom: true },
  } },
  baseExplorer:  { path: "/bases/explorer/",   access: "guest",  parent: "bases", from: ["bases"], manual: "bases", state: ["id", "folder"], locks: [{ type: "base", id: "id", mode: "shared" }] },
  logoEditor:    { path: "/logo/",              access: "guest",  parent: "games", from: ["games"], manual: "logo", tabs: ["text", "draw", "image"], state: ["tab"] },
  logoText:      { path: "/logo/editor/text/",  access: "guest",  parent: "logoEditor", from: ["logoEditor"], manual: "logo", device: "noPhone", state: ["id"], locks: [{ type: "logo", id: "id" }] },
  logoDraw:      { path: "/logo/editor/draw/",  access: "guest",  parent: "logoEditor", from: ["logoEditor"], manual: "logo", device: "noPhone", state: ["id"], locks: [{ type: "logo", id: "id" }] },
  logoImage:     { path: "/logo/editor/image/", access: "guest",  parent: "logoEditor", from: ["logoEditor"], manual: "logo", device: "noPhone", state: ["id"], locks: [{ type: "logo", id: "id" }] },
  control:       { path: "/control/",           access: "guest",  parent: "games", from: ["games", "gameSettings"], manual: "control", device: "wide", state: ["id"], locks: [{ type: "game", id: "id" }, { type: "logos", mode: "shared" }] },
  gameSettings:  { path: "/games/settings/",   access: "guest",  parent: "control", parentParams: ["id"], from: ["games", "control"], manual: "gameSettings", device: "wide", state: ["id"], buttons: {
    btnPlay: { to: "control", custom: true },
  }, locks: [{ type: "game", id: "id" }, { type: "logos", mode: "shared" }] },
  marketplace:   { path: "/marketplace/",       access: "public", parent: "games", parentAnon: "home", subpaths: true, from: ["home", "games"], manual: "community", state: ["q", "filter", "sort"] },
  connectDevice: { path: "/connect/",    access: "public", parent: "games", parentAnon: "home", from: ["home", "games"], manual: "connect" },
  account:       { path: "/account/",           access: "guest",  parent: "games", from: ["games"], manual: "general" },
  manual:        { path: "/manual/",            access: "guest",  parent: "games", from: [], tabs: ["general", "edit", "community", "bases", "polls", "subscriptions", "logo", "control", "gameSettings", "connect"], state: ["tab"], buttons: {
    btnLegal: { to: "privacy" },
  } },
  privacy:       { path: "/privacy/",           access: "public", parent: "manual", parentAnon: "home", from: ["home", "manual"] },
};

// Z instrukcji i prywatności wracamy na każdą stronę z topbarem; do samej
// instrukcji, prywatności, landingu i logowania nie.
const MANUAL_EXCLUDED = new Set(["manual", "privacy", "home", "login"]);
PAGES.manual.from = Object.keys(PAGES).filter((id) => !MANUAL_EXCLUDED.has(id));

export const ROLES = ["anon", "guest", "user"];

const ACCESS_ROLES = {
  public: ["anon", "guest", "user"],
  guest: ["guest", "user"],
  user: ["user"],
};

/** Role, które w ogóle wchodzą na stronę (access). */
export function pageRoles(pageId) {
  return ACCESS_ROLES[page(pageId).access];
}

/** Rola użytkownika: "anon" (null), "guest" (gość) albo "user" (konto). */
export function roleOf(user, isGuest) {
  if (!user) return "anon";
  return isGuest ? "guest" : "user";
}

/** Role widzące przycisk: roles z opisu, ale tylko spośród tych, które mają wstęp na stronę. */
export function buttonRoles(pageId, spec) {
  const allowed = pageRoles(pageId);
  return spec.roles ? spec.roles.filter((r) => allowed.includes(r)) : allowed;
}

/** Czy przycisk jest widoczny dla roli i urządzenia (phone: true — telefon). */
export function buttonVisible(pageId, spec, role, phone) {
  if (!buttonRoles(pageId, spec).includes(role)) return false;
  if (phone && (spec.device === "wide" || spec.device === "noPhone")) return false;
  return true;
}

/** Adres celu przycisku (bez custom — te adresy składa strona). */
export function buttonHref(spec, ctx) {
  return linkTo(spec.to, spec.tab ? { tab: spec.tab } : {}, ctx);
}

const DUMMY_ORIGIN = "https://nav.invalid";

function defaultCtx() {
  const hasLoc = typeof location !== "undefined";
  return {
    href: hasLoc ? `${location.pathname}${location.search}${location.hash}` : "/",
    lang: hasLoc ? getUiLang() : "pl",
    anon: false,
  };
}

function resolveCtx(ctx) {
  return { ...defaultCtx(), ...(ctx || {}) };
}

function page(id) {
  const p = PAGES[id];
  if (!p) throw new Error(`nav-map: nieznana strona "${id}"`);
  return p;
}

// Tylko adresy względne w tym samym serwisie ("/ścieżka…"), bez "//host".
function parseInternal(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(s)) return null;
  try {
    const u = new URL(s, DUMMY_ORIGIN);
    return u.origin === DUMMY_ORIGIN ? u : null;
  } catch {
    return null;
  }
}

// Strona jest serwowana także bez końcowego "/" (np. /game-settings), więc
// adres bieżącej strony porównujemy z tym "/" dopisanym.
export function pageIdForPath(pathname) {
  const withSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
  let sub = null;
  for (const [id, p] of Object.entries(PAGES)) {
    if (p.path === withSlash) return id;
    if (p.subpaths && withSlash.startsWith(p.path)) sub = id;
  }
  return sub;
}

function allowedFrom(targetId, sourceId) {
  const from = PAGES[targetId]?.from;
  if (from === "*") return !!PAGES[sourceId];
  return Array.isArray(from) && from.includes(sourceId);
}

function rel(u) {
  return `${u.pathname}${u.search}${u.hash}`;
}

function applyLang(u, lang) {
  if (!lang || lang === "pl") u.searchParams.delete("lang");
  else u.searchParams.set("lang", lang);
}

// Sprawdza cały łańcuch ret zaczynając od strony ownerId. Zwraca
// { pageId, url } dla pierwszego poziomu albo null (obcy, zepsuty, za głęboki).
function resolveRet(ownerId, raw) {
  let owner = ownerId;
  let cur = raw;
  let first = null;
  for (let depth = 1; ; depth++) {
    if (depth > MAX_RET_DEPTH) return null;
    const u = parseInternal(cur);
    const pid = u ? pageIdForPath(u.pathname) : null;
    if (!pid || !allowedFrom(owner, pid)) return null;
    if (!first) first = { pageId: pid, url: u };
    const inner = u.searchParams.get("ret");
    if (inner == null) return first;
    owner = pid;
    cur = inner;
  }
}

// Przycina łańcuch ret w adresie u (strona ownerId) do poprawnych poziomów,
// nie więcej niż budget. Usuwa lang z zagnieżdżonych adresów.
function sanitizeRet(u, ownerId, budget) {
  const raw = u.searchParams.get("ret");
  if (raw == null) return;
  const iu = budget > 0 ? parseInternal(raw) : null;
  const pid = iu ? pageIdForPath(iu.pathname) : null;
  if (!pid || !allowedFrom(ownerId, pid)) {
    u.searchParams.delete("ret");
    return;
  }
  iu.searchParams.delete("lang");
  sanitizeRet(iu, pid, budget - 1);
  u.searchParams.set("ret", rel(iu));
}

/**
 * Adres strony pageId z parametrami params; ret = pełny bieżący adres,
 * jeśli bieżąca strona jest na liście from celu. params.hash — kotwica.
 * Wartości null/undefined są pomijane.
 */
export function linkTo(pageId, params = {}, ctx) {
  const c = resolveCtx(ctx);
  const target = page(pageId);
  const u = new URL(target.path, DUMMY_ORIGIN);
  let hash = "";
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null) continue;
    if (k === "hash") { hash = String(v); continue; }
    u.searchParams.set(k, String(v));
  }
  const cur = parseInternal(c.href);
  const curId = cur ? pageIdForPath(cur.pathname) : null;
  if (cur && curId && allowedFrom(pageId, curId)) {
    cur.searchParams.delete("lang");
    sanitizeRet(cur, curId, MAX_RET_DEPTH - 1);
    u.searchParams.set("ret", rel(cur));
  }
  applyLang(u, c.lang);
  if (hash) u.hash = hash.startsWith("#") ? hash : `#${hash}`;
  return rel(u);
}

/**
 * Cel „Wstecz” strony pageId: { pageId, href }. ret z łańcucha dozwolonego
 * przez from, inaczej parent (null, gdy strona nie ma rodzica).
 */
export function backTarget(pageId, ctx) {
  const c = resolveCtx(ctx);
  const p = page(pageId);
  const cur = parseInternal(c.href) || new URL("/", DUMMY_ORIGIN);
  const raw = cur.searchParams.get("ret");
  if (raw != null) {
    const r = resolveRet(pageId, raw);
    if (r) {
      r.url.searchParams.delete("lang");
      applyLang(r.url, c.lang);
      return { pageId: r.pageId, href: rel(r.url) };
    }
  }
  const anonParent = c.anon && p.parentAnon;
  const parentId = anonParent || p.parent;
  if (!parentId) return null;
  const u = new URL(page(parentId).path, DUMMY_ORIGIN);
  if (!anonParent) {
    for (const k of p.parentParams || []) {
      const v = cur.searchParams.get(k);
      if (v != null) u.searchParams.set(k, v);
    }
  }
  applyLang(u, c.lang);
  return { pageId: parentId, href: rel(u) };
}

export function backHref(pageId, ctx) {
  return backTarget(pageId, ctx)?.href ?? null;
}

/**
 * Adres logowania — po zalogowaniu zawsze /games/ (wyjątek: next= z maila).
 * ctx.forceAuth — gość, który chce przejść do logowania mimo otwartej sesji.
 */
export function loginUrl(ctx) {
  const c = resolveCtx(ctx);
  const u = new URL(PAGES.login.path, DUMMY_ORIGIN);
  if (c.forceAuth) u.searchParams.set("force_auth", "1");
  applyLang(u, c.lang);
  return rel(u);
}

/** Etykieta przycisku „Wstecz”: „{strona}”. */
export function backLabel(pageId, ctx) {
  const target = backTarget(pageId, ctx);
  if (!target) return "";
  return t("nav.backTo", { page: t(`nav.page.${target.pageId}`) });
}

/**
 * Wstawia do przycisku ikonę i etykietę „{strona}” i odświeża ją przy
 * zmianie języka. getCtx — funkcja zwracająca kontekst (np. { anon }).
 */
export function renderBackLabel(btn, pageId, getCtx) {
  if (!btn) return;
  const render = () => {
    const label = backLabel(pageId, getCtx ? getCtx() : undefined);
    if (label) btn.innerHTML = iconText("arrow-left", label);
  };
  render();
  // Ponowne wywołanie dla tego samego przycisku zastępuje poprzedni nasłuch.
  if (btn._navBackRender) window.removeEventListener("i18n:lang", btn._navBackRender);
  btn._navBackRender = render;
  window.addEventListener("i18n:lang", render);
}
