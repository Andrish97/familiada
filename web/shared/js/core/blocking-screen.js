// js/core/blocking-screen.js
// Jeden pełnoekranowy ekran blokady (.blocking-overlay > .blocking-card,
// wygląd: shared/css/blocking-overlay.css): ikona, tytuł, tekst, przyciski.
// Używają: page-overlay.js („tu nie wejdziesz”: gość, urządzenie) i
// resource-lock.js (zasób edytowany gdzie indziej). Identyfikatory części:
// <id>Icon, <id>Title, <id>Msg, <id><key> (przyciski).

import { t } from "../../translation/translation.js?v=v2026-10-23T15421";
import { icon } from "./icons.js?v=v2026-10-23T15421";

/**
 * Nakładka o danym id (tworzona raz). actions: [{ key, i18n, iconName, accent }].
 * Nie zamyka się kliknięciem w tło (to blokada).
 */
export function blockingScreen(id, actions = []) {
  let overlay = document.getElementById(id);
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = id;
  overlay.className = "blocking-overlay";
  const buttons = actions.map((a) => `<button id="${id}${a.key}" class="blocking-action${a.accent ? " is-accent" : ""}" type="button" data-i18n="${a.i18n}" data-i18n-icon="${a.iconName}">${icon(a.iconName)} ${t(a.i18n)}</button>`).join("");
  overlay.innerHTML = `
    <div class="blocking-card" role="alertdialog" aria-labelledby="${id}Title" aria-describedby="${id}Msg">
      <div class="blocking-heading">
        <span id="${id}Icon" class="blocking-icon" aria-hidden="true"></span>
        <h2 id="${id}Title" class="blocking-title"></h2>
      </div>
      <div id="${id}Msg" class="blocking-message"></div>
      <div class="blocking-actions">${buttons}</div>
    </div>`;
  document.documentElement.appendChild(overlay);
  return overlay;
}

/** Ikona nakładki (nazwa z icons.js). */
export function setBlockingIcon(overlay, name) {
  const el = overlay.querySelector(".blocking-icon");
  el.innerHTML = icon(name);
  el.firstElementChild?.setAttribute("style", "width:100%;height:100%");
}

/** Pokazuje/chowa nakładkę i blokuje przewijanie strony pod nią. */
export function setBlockingOpen(overlay, open) {
  overlay.style.display = open ? "flex" : "none";
  for (const el of [document.documentElement, document.body]) {
    if (!el) continue;
    el.style.overflow = open ? "hidden" : "";
    el.style.touchAction = open ? "none" : "";
  }
}
