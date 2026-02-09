// js/core/device-guard.js
// Uniwersalna blokada na telefon + i18n (deviceGuard.*) + "Wróć" (history/referrer)

import { applyTranslations, t } from "../../translation/translation.js";

export function guardDesktopOnly({
  // techniczny breakpoint (nie pokazujemy w UI)
  maxWidth = 980,
} = {}) {
  const mq = window.matchMedia(`(max-width:${maxWidth}px)`);

  function canGoBack() {
    try { return window.history.length > 1; } catch { return false; }
  }

  function goBack() {
    if (canGoBack()) {
      history.back();
      return;
    }
    if (document.referrer) {
      location.href = document.referrer;
      return;
    }
    location.href = "/";
  }

  function ensureOverlay() {
    let overlay = document.getElementById("deviceGuard");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "deviceGuard";

    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      background: "rgba(0,0,0,.92)",
      color: "#fff",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      boxSizing: "border-box",
      overscrollBehavior: "none",
    });

    overlay.innerHTML = `
      <div id="deviceGuardBox" style="
        width:100%;
        max-width:520px;
        box-sizing:border-box;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.18);
        border-radius:18px;
        padding:18px;
        text-align:left;
      ">
        <div
          id="deviceGuardTitle"
          data-i18n="deviceGuard.title"
          style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;"
        >${t("deviceGuard.title")}</div>

        <div
          id="deviceGuardMsg"
          data-i18n="deviceGuard.message"
          style="opacity:.9;line-height:1.4;word-wrap:break-word;"
        >${t("deviceGuard.message")}</div>

        <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
          <button
            id="deviceGuardBack"
            type="button"
            data-i18n="deviceGuard.back"
            style="
              appearance:none;border:0;border-radius:12px;padding:10px 14px;
              font-weight:800;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;
            "
          >${t("deviceGuard.back")}</button>
        </div>
      </div>
    `;

    overlay.querySelector("#deviceGuardBack")?.addEventListener("click", goBack);

    // nie zamykamy kliknięciem w tło (to blokada)
    document.documentElement.appendChild(overlay);

    // zastosuj tłumaczenia na wypadek gdy overlay powstał po initI18n()
    applyTranslations(overlay);

    return overlay;
  }

  function lockScroll(on) {
    if (on) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.documentElement.style.touchAction = "none";
      document.body.style.touchAction = "none";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.documentElement.style.touchAction = "";
      document.body.style.touchAction = "";
    }
  }

  function apply() {
    const overlay = ensureOverlay();
    const on = mq.matches;
    overlay.style.display = on ? "flex" : "none";
    lockScroll(on);
    if (on) applyTranslations(overlay);
  }

  // reaguj na zmianę języka globalnie
  window.addEventListener("i18n:lang", () => {
    const overlay = document.getElementById("deviceGuard");
    if (overlay && overlay.style.display !== "none") applyTranslations(overlay);
  });

  mq.addEventListener?.("change", apply);
  window.addEventListener("resize", apply);
  apply();

  return { refresh: apply };
}
