// js/core/page-overlay.js
// Jedna pełnoekranowa nakładka „tu nie wejdziesz”: gość bez dostępu do strony
// albo urządzenie, którego strona nie obsługuje (telefon, za wąskie okno).
// Wygląd jak nakładka blokady zasobu (resource-lock.js): ikona + tytuł +
// tekst + przyciski. „Wróć” prowadzi na adres z mapy nawigacji (backHref),
// nigdy przez history.back() ani referrer. i18n: pageGuard.*.

import { applyTranslations, t } from "../../translation/translation.js?v=v2026-10-10T15095";
import { icon } from "./icons.js?v=v2026-10-10T15095";

export const PAGE_GUARD_ID = "pageGuard";

function ensureOverlay() {
  let overlay = document.getElementById(PAGE_GUARD_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = PAGE_GUARD_ID;
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
    <div role="alertdialog" aria-labelledby="pageGuardTitle" aria-describedby="pageGuardMsg" style="
      width:100%;max-width:560px;box-sizing:border-box;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.18);
      border-radius:18px;
      padding:18px;
      text-align:left;
    ">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span id="pageGuardIcon" aria-hidden="true" style="display:inline-flex;width:26px;height:26px;flex:none;color:var(--gold, #ffeaa6);"></span>
        <div id="pageGuardTitle" style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;"></div>
      </div>

      <div id="pageGuardMsg" style="opacity:.9;line-height:1.4;word-wrap:break-word;"></div>

      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button id="pageGuardBack" type="button" data-i18n="pageGuard.back" style="
          appearance:none;border:0;border-radius:12px;padding:10px 14px;
          font-weight:800;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;
        ">${t("pageGuard.back")}</button>
        <button id="pageGuardLogin" type="button" data-i18n="pageGuard.login" style="
          appearance:none;border:0;border-radius:12px;padding:10px 14px;
          font-weight:800;cursor:pointer;background:rgba(255,220,120,.24);color:#fff;
        ">${t("pageGuard.login")}</button>
      </div>
    </div>
  `;
  // Nie zamykamy kliknięciem w tło (to blokada).
  document.documentElement.appendChild(overlay);
  window.addEventListener("i18n:lang", () => {
    if (overlay.style.display !== "none") applyTranslations(overlay);
  });
  return overlay;
}

function lockScroll(on) {
  for (const el of [document.documentElement, document.body]) {
    if (!el) continue;
    el.style.overflow = on ? "hidden" : "";
    el.style.touchAction = on ? "none" : "";
  }
}

/**
 * Pokazuje nakładkę.
 *   kind        "guest" | "device" (znacznik w data-kind)
 *   state       drobniejszy stan (np. "phone", "rotate", "narrow")
 *   iconName    nazwa ikony z icons.js
 *   titleKey / messageKey   klucze tłumaczeń
 *   backHref    adres „Wróć” (null — bez przycisku)
 *   loginHref   adres „Zaloguj” (null — bez przycisku)
 */
export function showPageGuard({ kind, state = "", iconName = "info", titleKey, messageKey, backHref = null, loginHref = null }) {
  const overlay = ensureOverlay();
  const title = overlay.querySelector("#pageGuardTitle");
  const msg = overlay.querySelector("#pageGuardMsg");
  title.setAttribute("data-i18n", titleKey);
  msg.setAttribute("data-i18n", messageKey);
  title.textContent = t(titleKey);
  msg.textContent = t(messageKey);

  const ico = overlay.querySelector("#pageGuardIcon");
  ico.innerHTML = icon(iconName);
  ico.firstElementChild?.setAttribute("style", "width:100%;height:100%");

  const back = overlay.querySelector("#pageGuardBack");
  back.style.display = backHref ? "" : "none";
  back.onclick = backHref ? () => { location.href = backHref; } : null;

  const login = overlay.querySelector("#pageGuardLogin");
  login.style.display = loginHref ? "" : "none";
  login.onclick = loginHref ? () => { location.href = loginHref; } : null;

  overlay.dataset.kind = kind;
  overlay.dataset.state = state;
  overlay.style.display = "flex";
  lockScroll(true);
  applyTranslations(overlay);
  return overlay;
}

/** Chowa nakładkę (np. po obrocie tabletu albo poszerzeniu okna). */
export function hidePageGuard() {
  const overlay = document.getElementById(PAGE_GUARD_ID);
  if (overlay) overlay.style.display = "none";
  lockScroll(false);
}
