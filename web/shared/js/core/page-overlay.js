// js/core/page-overlay.js
// Jedna pełnoekranowa nakładka „tu nie wejdziesz”: gość bez dostępu do strony
// albo urządzenie, którego strona nie obsługuje (telefon, za wąskie okno).
// Wygląd jak nakładka blokady zasobu (resource-lock.js): ikona + tytuł +
// tekst + przyciski. „Wróć” prowadzi na adres z mapy nawigacji (backHref),
// nigdy przez history.back() ani referrer. i18n: pageGuard.*.

import { applyTranslations, t, withLangParam } from "../../translation/translation.js?v=v2026-10-18T06505";
import { icon } from "./icons.js?v=v2026-10-18T06505";

export const PAGE_GUARD_ID = "pageGuard";
let redirectTimer = null;

function ensureOverlay() {
  let overlay = document.getElementById(PAGE_GUARD_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = PAGE_GUARD_ID;
  overlay.className = "blocking-overlay";

  overlay.innerHTML = `
    <div class="blocking-card" role="alertdialog" aria-labelledby="pageGuardTitle" aria-describedby="pageGuardMsg">
      <div class="blocking-heading">
        <span id="pageGuardIcon" class="blocking-icon" aria-hidden="true"></span>
        <h2 id="pageGuardTitle" class="blocking-title"></h2>
      </div>

      <div id="pageGuardMsg" class="blocking-message"></div>

      <div class="blocking-actions">
        <button id="pageGuardBack" class="blocking-action" type="button" data-i18n="pageGuard.back" data-i18n-icon="arrow-left">${icon("arrow-left")} ${t("pageGuard.back")}</button>
        <button id="pageGuardLogin" class="blocking-action is-accent" type="button" data-i18n="pageGuard.login" data-i18n-icon="person">${icon("person")} ${t("pageGuard.login")}</button>
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
export function showPageGuard({ kind, state = "", iconName = "info", titleKey, messageKey, backHref = null, loginHref = null, redirectHref = null, redirectDelayMs = 0 }) {
  const overlay = ensureOverlay();
  if (redirectTimer) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
  if (kind === "device" && document.body && !overlay.dataset.hidesBody) {
    overlay.dataset.bodyVisibility = document.body.style.visibility;
    document.body.style.visibility = "hidden";
    overlay.dataset.hidesBody = "true";
  }
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
  if (redirectHref) {
    const target = withLangParam(redirectHref);
    redirectTimer = setTimeout(() => {
      if (overlay.style.display !== "none") window.location.replace(target);
    }, Math.max(0, redirectDelayMs));
  }
  lockScroll(true);
  applyTranslations(overlay);
  return overlay;
}

/** Chowa nakładkę (np. po obrocie tabletu albo poszerzeniu okna). */
export function hidePageGuard() {
  if (redirectTimer) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
  const overlay = document.getElementById(PAGE_GUARD_ID);
  if (overlay) {
    overlay.style.display = "none";
    if (overlay.dataset.hidesBody === "true" && document.body) {
      document.body.style.visibility = overlay.dataset.bodyVisibility || "";
      delete overlay.dataset.bodyVisibility;
      delete overlay.dataset.hidesBody;
    }
  }
  lockScroll(false);
}
