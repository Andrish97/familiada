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

import { hidePageGuard, showPageGuard } from "./page-overlay.js?v=v2026-10-15T22404";

export const PHONE_MAX_SHORT_SIDE = 700;
export const MIN_WORK_WIDTH = 980;
export const TV_HD_RESOLUTION = Object.freeze({ width: 1280, height: 720 });

function screenSides() {
  const w = window.screen?.width || window.innerWidth;
  const h = window.screen?.height || window.innerHeight;
  return { short: Math.min(w, h), long: Math.max(w, h) };
}

const isTouch = () => navigator.maxTouchPoints > 0 || !!window.matchMedia?.("(pointer: coarse)").matches;

export function getDeviceProfile() {
  const { short, long } = screenSides();
  const hasTouch = isTouch();
  const primaryCoarse = !!window.matchMedia?.("(pointer: coarse)").matches;
  const primaryHover = !!window.matchMedia?.("(hover: hover)").matches;
  // A touchscreen laptop usually has a fine, hover-capable primary pointer;
  // a phone/tablet is normally operated through a coarse, non-hover pointer.
  const touch = primaryCoarse && !primaryHover || (!window.matchMedia && hasTouch);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isTv = /SmartTV|SMART-TV|Tizen|web0s|WebOS|HbbTV|BRAVIA|Android TV|GoogleTV|Roku|Viera|NetCast/i.test(navigator.userAgent || "");
  const dpr = window.devicePixelRatio || 1;
  const screenWidth = Number(window.screen?.width) || width;
  const screenHeight = Number(window.screen?.height) || height;
  return {
    formFactor: isTv ? "tv" : touch ? (short < PHONE_MAX_SHORT_SIDE ? "phone" : "tablet") : "desktop",
    orientation: width >= height ? "landscape" : "portrait",
    viewportWidth: width,
    viewportHeight: height,
    screenShortSide: short,
    screenLongSide: long,
    screenPixelWidth: Math.round(screenWidth * dpr),
    screenPixelHeight: Math.round(screenHeight * dpr),
    touch,
    hasTouch,
    isTv,
  };
}

/** Czy format urządzenia to telefon; niezależne od viewportu i orientacji. */
export function isPhoneScreen() {
  return getDeviceProfile().formFactor === "phone";
}

/**
 * Kolejność decyzji: fizyczne możliwości ekranu → wymagany sposób wejścia →
 * dozwolona kategoria → szerokość viewportu i obrót, jeśli ten rozwiązuje brak
 * miejsca. Komputery i TV nigdy nie dostają sugestii obrotu.
 */
export function deviceGuardState(minWidth = MIN_WORK_WIDTH, { formFactors = null, requiresTouch = false, minScreenShortSide = 0, minTvResolution = false, allowPhoneLandscape = false, requirePhoneLandscape = false } = {}) {
  const profile = getDeviceProfile();
  // Physical screen limits take precedence over category exclusions. The
  // short-side threshold is for touch-first devices only (for example, a
  // large-tablet layout); desktop monitors remain governed by usable width.
  if (minScreenShortSide && profile.touch && profile.screenShortSide < minScreenShortSide) return "screen";
  if (minWidth > 0 && minWidth > profile.screenLongSide) return "screen";
  if (minTvResolution && profile.isTv) {
    const pxLong = Math.max(profile.screenPixelWidth, profile.screenPixelHeight);
    const pxShort = Math.min(profile.screenPixelWidth, profile.screenPixelHeight);
    if (pxLong < TV_HD_RESOLUTION.width || pxShort < TV_HD_RESOLUTION.height) return "screen";
  }
  if (requiresTouch && !profile.touch) return "touch";
  if (formFactors && !formFactors.includes(profile.formFactor)) return "unsupported";
  if (!allowPhoneLandscape && profile.formFactor === "phone" && profile.orientation === "landscape") return "rotate";
  if (requirePhoneLandscape && profile.formFactor === "phone" && profile.orientation === "portrait") return "rotate";
  if (profile.viewportWidth >= minWidth) return "ok";
  // Consider rotation only for a full-width portrait phone/tablet viewport.
  // A split-view tablet has a substantially reduced width; rotating its pane
  // is not a reliable way to obtain the full physical screen width.
  const fullPortraitViewport = profile.viewportWidth >= profile.screenShortSide * 0.85;
  if (["phone", "tablet"].includes(profile.formFactor)
      && profile.orientation === "portrait"
      && fullPortraitViewport
      && profile.viewportHeight >= minWidth) return "rotate";
  return "narrow";
}

const TEXTS = {
  unsupported: { title: "pageGuard.phoneTitle", message: "pageGuard.phoneMessage", icon: "phone" },
  screen: { title: "pageGuard.screenTitle", message: "pageGuard.screenMessage", icon: "fullscreen-enter" },
  touch: { title: "pageGuard.touchTitle", message: "pageGuard.touchMessage", icon: "phone" },
  rotate: { title: "pageGuard.rotateTitle", message: "pageGuard.rotateMessage", icon: "rotate-right" },
  narrow: { title: "pageGuard.narrowTitle", message: "pageGuard.narrowMessage", icon: "fullscreen-enter" },
  tvUnsupported: { title: "pageGuard.tvUnsupportedTitle", message: "pageGuard.tvUnsupportedMessage", icon: "display" },
};

export function showDeviceGuard(state, backHref, messageKey = null) {
  const profile = getDeviceProfile();
  const tvUnsupported = state === "unsupported" && profile.formFactor === "tv";
  const txt = tvUnsupported
    ? TEXTS.tvUnsupported
    : TEXTS[state] || TEXTS.unsupported;
  // Obrót rozwiązuje blokadę bez opuszczania bieżącej strony, więc nie
  // pokazuj nieużytecznego przycisku „Wróć” przy żadnym guardzie rotate.
  showPageGuard({
    kind: "device",
    state,
    iconName: txt.icon,
    titleKey: txt.title,
    messageKey: messageKey || txt.message,
    backHref: state === "rotate" || tvUnsupported ? null : backHref,
    loginHref: tvUnsupported ? null : undefined,
    redirectHref: tvUnsupported ? "/connect/?tv=1" : null,
    redirectDelayMs: tvUnsupported ? 3000 : 0,
  });
}

/** Strona wymaga minimalnej szerokości: guard reaguje na resize i obrót. */
export function guardViewportWidth({ minWidth = MIN_WORK_WIDTH, backHref = null, fits = null, fitsAfterRotate = null, messageKey = null, rotateMessageKey = null, formFactors = null, requiresTouch = false, minScreenShortSide = 0, minTvResolution = false, allowPhoneLandscape = false, requirePhoneLandscape = false } = {}) {
  const currentState = () => {
    let state = deviceGuardState(minWidth, { formFactors, requiresTouch, minScreenShortSide, minTvResolution, allowPhoneLandscape, requirePhoneLandscape });
    const profile = getDeviceProfile();
    const rotationCanHelp = ["phone", "tablet"].includes(profile.formFactor)
      && profile.orientation === "portrait"
      && profile.viewportWidth >= profile.screenShortSide * 0.85
      && typeof fitsAfterRotate === "function"
      && fitsAfterRotate();
    if (state === "rotate" && fitsAfterRotate && !rotationCanHelp) state = "narrow";
    if (state === "ok" && fits && !fits()) state = rotationCanHelp ? "rotate" : "narrow";
    return state;
  };
  function apply() {
    const state = currentState();
    if (state === "narrow" && messageKey) {
      showPageGuard({ kind: "device", state, iconName: "fullscreen-enter", titleKey: TEXTS.narrow.title, messageKey, backHref });
    } else if (state === "rotate" && rotateMessageKey) showDeviceGuard(state, backHref, rotateMessageKey);
    else if (state !== "ok") showDeviceGuard(state, backHref);
    else if (document.getElementById("pageGuard")?.dataset.kind !== "guest") hidePageGuard();
    document.documentElement.dataset.deviceGuard = state;
    // Guard jest końcowym, widocznym stanem zablokowanej nawigacji. Zdejmujemy
    // ukrywanie startowe po pokazaniu nakładki; page-overlay ukrywa body, więc
    // sekcje strony nadal nie są odsłonięte ani ładowane przed decyzją guarda.
    if (state !== "ok") document.documentElement.classList.remove("page-loading");
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
    if (!readyResolved && currentState() === "ok") {
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
