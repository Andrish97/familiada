// js/core/device-guard.js
// Wspólna reguła „jakie to urządzenie” + blokada stron, które potrzebują
// szerokiego ekranu (Control, ustawienia gry). Nakładka jest wspólna z
// blokadą gościa (page-overlay.js), teksty: pageGuard.*; „Wróć” prowadzi na
// backHref z mapy nawigacji (bez history.back() i referrera).
//
// Typ urządzenia, orientacja i dostępna szerokość są osobnymi cechami. Typ
// wynika z ekranu dotykowego i krótszego boku ekranu; orientacja oraz to,
// czy konkretna funkcja się mieści, wynikają z bieżącego viewportu. Obrót
// nie zmienia typu urządzenia, ale może udostępnić funkcję wymagającą miejsca.

import { hidePageGuard, showPageGuard } from "./page-overlay.js?v=v2026-10-13T13432";

export const PHONE_MAX_SHORT_SIDE = 700;
export const MIN_WORK_WIDTH = 980;

function screenSides() {
  const w = window.screen?.width || window.innerWidth;
  const h = window.screen?.height || window.innerHeight;
  return { short: Math.min(w, h), long: Math.max(w, h) };
}

const isTouch = () => navigator.maxTouchPoints > 0 || !!window.matchMedia?.("(pointer: coarse)").matches;

export function getDeviceProfile() {
  const { short, long } = screenSides();
  const touch = isTouch();
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    formFactor: touch ? (short < PHONE_MAX_SHORT_SIDE ? "phone" : "tablet") : "desktop",
    orientation: width >= height ? "landscape" : "portrait",
    viewportWidth: width,
    viewportHeight: height,
    screenShortSide: short,
    screenLongSide: long,
    touch,
  };
}

/** Czy format urządzenia to telefon; niezależne od viewportu i orientacji. */
export function isPhoneScreen() {
  return getDeviceProfile().formFactor === "phone";
}

/** "ok" | "rotate" | "narrow" — decyzja zależy od wymagań funkcji. */
export function deviceGuardState(minWidth = MIN_WORK_WIDTH) {
  const profile = getDeviceProfile();
  if (profile.viewportWidth >= minWidth) return "ok";
  if (profile.touch && profile.orientation === "portrait" && profile.screenLongSide >= minWidth) return "rotate";
  return "narrow";
}

const TEXTS = {
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

/** Strona wymaga minimalnej szerokości: guard reaguje na resize i obrót. */
export function guardViewportWidth({ minWidth = MIN_WORK_WIDTH, backHref = null, fits = null, messageKey = null } = {}) {
  const currentState = () => {
    const state = deviceGuardState(minWidth);
    return state === "ok" && fits && !fits() ? "narrow" : state;
  };
  function apply() {
    const state = currentState();
    if (state === "narrow" && messageKey) {
      showPageGuard({ kind: "device", state, iconName: "fullscreen-enter", titleKey: TEXTS.narrow.title, messageKey, backHref });
    } else if (state !== "ok") showDeviceGuard(state, backHref);
    else hidePageGuard();
    document.documentElement.dataset.deviceGuard = state;
    // Usuń wczesną blokadę (inline script w <head>) — guard przejął kontrolę
    document.documentElement.removeAttribute("data-mobile-guard");
  }

  let resolveReady;
  let readyResolved = false;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const refresh = () => {
    apply();
    if (!readyResolved && deviceGuardState(minWidth) === "ok") {
      readyResolved = true;
      resolveReady?.(true);
    }
  };
  const onOrientationChange = () => setTimeout(refresh, 250);
  window.addEventListener("resize", refresh);
  window.addEventListener("orientationchange", onOrientationChange);
  refresh();

  return { refresh, state: currentState, ready };
}
