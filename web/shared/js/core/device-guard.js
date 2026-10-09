// js/core/device-guard.js
// Wspólna reguła „jakie to urządzenie” + blokada stron, które potrzebują
// szerokiego ekranu (Control, ustawienia gry). Nakładka jest wspólna z
// blokadą gościa (page-overlay.js), teksty: pageGuard.*; „Wróć” prowadzi na
// backHref z mapy nawigacji (bez history.back() i referrera).
//
// Telefon rozpoznajemy po KRÓTSZYM BOKU EKRANU (< 700 px), a nie po
// szerokości okna: ta miara nie zmienia się przy obrocie, więc tablet nie
// „staje się telefonem” w pionie, a telefon w poziomie nie staje się
// tabletem. Z tej samej funkcji korzysta edytor logo.
//
// Stany blokady (deviceGuardState):
//   ok     -- okno ma co najmniej minWidth szerokości,
//   phone  -- telefon: „przełącz się na komputer albo tablet”,
//   rotate -- tablet w pionie, a w poziomie by się zmieścił: „obróć tablet”
//             (znika sam po obrocie),
//   narrow -- komputer z za wąskim oknem: „poszerz okno”.

import { hidePageGuard, showPageGuard } from "./page-overlay.js?v=v2026-10-09T21300";

export const PHONE_MAX_SHORT_SIDE = 700;
export const MIN_WORK_WIDTH = 980;

function screenSides() {
  const w = window.screen?.width || window.innerWidth;
  const h = window.screen?.height || window.innerHeight;
  return { short: Math.min(w, h), long: Math.max(w, h) };
}

const isTouch = () => navigator.maxTouchPoints > 0 || !!window.matchMedia?.("(pointer: coarse)").matches;

/** Telefon: krótszy bok ekranu poniżej 700 px (niezależnie od orientacji). */
export function isPhoneScreen() {
  return screenSides().short < PHONE_MAX_SHORT_SIDE;
}

/** "ok" | "phone" | "rotate" | "narrow" -- patrz opis na górze pliku. */
export function deviceGuardState(minWidth = MIN_WORK_WIDTH) {
  if (isPhoneScreen()) return "phone";
  if (window.innerWidth >= minWidth) return "ok";
  const portrait = window.innerHeight > window.innerWidth;
  if (isTouch() && portrait && screenSides().long >= minWidth) return "rotate";
  return "narrow";
}

const TEXTS = {
  phone:  { title: "pageGuard.phoneTitle",  message: "pageGuard.phoneMessage",  icon: "phone" },
  rotate: { title: "pageGuard.rotateTitle", message: "pageGuard.rotateMessage", icon: "rotate-right" },
  narrow: { title: "pageGuard.narrowTitle", message: "pageGuard.narrowMessage", icon: "fullscreen-enter" },
};

function showDeviceGuard(state, backHref) {
  const txt = TEXTS[state];
  showPageGuard({
    kind: "device",
    state,
    iconName: txt.icon,
    titleKey: txt.title,
    messageKey: txt.message,
    backHref,
  });
}

/**
 * Strona niedostępna na telefonie: blokada jednorazowa, bez nasłuchu (krótszy bok
 * ekranu nie zmienia się przy obrocie). Zwraca true, gdy zablokowała.
 */
export function blockPhone({ backHref = null } = {}) {
  if (!isPhoneScreen()) return false;
  showDeviceGuard("phone", backHref);
  document.documentElement.dataset.deviceGuard = "phone";
  document.documentElement.removeAttribute("data-mobile-guard");
  return true;
}

/** Strona potrzebuje szerokiego okna: blokada na żywo (resize / obrót). */
export function guardDesktopOnly({ minWidth = MIN_WORK_WIDTH, backHref = null } = {}) {
  function apply() {
    const state = deviceGuardState(minWidth);
    if (state !== "ok") showDeviceGuard(state, backHref);
    else hidePageGuard();
    document.documentElement.dataset.deviceGuard = state;
    // Usuń wczesną blokadę (inline script w <head>) — guard przejął kontrolę
    document.documentElement.removeAttribute("data-mobile-guard");
  }

  // obrót: resize przychodzi zwykle, orientationchange na starszym iOS czasem przed nowym rozmiarem
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", () => setTimeout(apply, 250));
  apply();

  return { refresh: apply, state: () => deviceGuardState(minWidth) };
}
