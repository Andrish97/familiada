// js/core/device-guard.js
// Wspólna reguła „jakie to urządzenie” + blokada stron, które potrzebują
// szerokiego ekranu (Control, ustawienia gry). i18n: deviceGuard.*.
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

import { applyTranslations, t } from "../../translation/translation.js?v=v2026-09-26T14341";
import { icon } from "./icons.js?v=v2026-09-26T14341";

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
  phone:  { title: "deviceGuard.title",       message: "deviceGuard.message",       icon: "info" },
  rotate: { title: "deviceGuard.rotateTitle", message: "deviceGuard.rotateMessage", icon: "rotate-right" },
  narrow: { title: "deviceGuard.narrowTitle", message: "deviceGuard.narrowMessage", icon: "fullscreen-enter" },
};

export function guardDesktopOnly({ minWidth = MIN_WORK_WIDTH } = {}) {
  function goBack() {
    try {
      if (window.history.length > 1) { history.back(); return; }
    } catch {}
    location.href = document.referrer || "/";
  }

  function ensureOverlay() {
    let overlay = document.getElementById("deviceGuard");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "deviceGuard";
    // Wygląd jak pozostałe okna systemu (kryjące tło #050914, ramka --line).
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif",
      background: "rgba(0,0,0,.78)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      color: "#fff",
      zIndex: "2147483647",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      boxSizing: "border-box",
      overscrollBehavior: "none",
    });

    overlay.innerHTML = `
      <div id="deviceGuardBox" role="alertdialog" aria-labelledby="deviceGuardTitle" aria-describedby="deviceGuardMsg" style="
        width:100%;max-width:520px;box-sizing:border-box;
        background:#050914;border:1px solid var(--line, rgba(255,255,255,.14));
        border-radius:18px;padding:18px;text-align:left;
        box-shadow:0 24px 60px rgba(0,0,0,.6);
      ">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span id="deviceGuardIcon" aria-hidden="true" style="display:inline-flex;width:26px;height:26px;color:var(--gold, #ffeaa6);"></span>
          <div id="deviceGuardTitle" style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;"></div>
        </div>
        <div id="deviceGuardMsg" style="opacity:.9;line-height:1.4;word-wrap:break-word;"></div>
        <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
          <button id="deviceGuardBack" type="button" data-i18n="deviceGuard.back" style="
            appearance:none;border:0;border-radius:12px;padding:10px 14px;
            font-weight:800;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;
          ">${t("deviceGuard.back")}</button>
        </div>
      </div>
    `;
    overlay.querySelector("#deviceGuardBack")?.addEventListener("click", goBack);
    // nie zamykamy kliknięciem w tło (to blokada)
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function lockScroll(on) {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      el.style.overflow = on ? "hidden" : "";
      el.style.touchAction = on ? "none" : "";
    }
  }

  function render(overlay, state) {
    const txt = TEXTS[state];
    const title = overlay.querySelector("#deviceGuardTitle");
    const msg = overlay.querySelector("#deviceGuardMsg");
    title.setAttribute("data-i18n", txt.title);
    msg.setAttribute("data-i18n", txt.message);
    title.textContent = t(txt.title);
    msg.textContent = t(txt.message);
    const ico = overlay.querySelector("#deviceGuardIcon");
    ico.innerHTML = icon(txt.icon);
    ico.firstElementChild?.setAttribute("style", "width:100%;height:100%");
    overlay.dataset.state = state;
    applyTranslations(overlay);
  }

  function apply() {
    const state = deviceGuardState(minWidth);
    const overlay = ensureOverlay();
    const on = state !== "ok";
    if (on) render(overlay, state);
    overlay.style.display = on ? "flex" : "none";
    document.documentElement.dataset.deviceGuard = state;
    lockScroll(on);
    // Usuń wczesną blokadę (inline script w <head>) — guard przejął kontrolę
    document.documentElement.removeAttribute("data-mobile-guard");
  }

  window.addEventListener("i18n:lang", () => {
    const overlay = document.getElementById("deviceGuard");
    if (overlay && overlay.style.display !== "none") applyTranslations(overlay);
  });
  // obrót: resize przychodzi zwykle, orientationchange na starszym iOS czasem przed nowym rozmiarem
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", () => setTimeout(apply, 250));
  apply();

  return { refresh: apply, state: () => deviceGuardState(minWidth) };
}
