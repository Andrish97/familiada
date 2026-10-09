// js/pages/privacy.js
//
// - publiczna strona (bez wymuszania logowania)
// - jeśli user zalogowany -> pokazuj username + Wyloguj
// - jeśli niezalogowany -> ukryj username + Wyloguj, a Wstecz wraca do /

import { initI18n } from "../../shared/translation/translation.js?v=v2026-10-09T17412";
import { backHref, renderBackLabel } from "../../shared/js/core/nav-map.js?v=v2026-10-09T17412";
import { getUser } from "../../shared/js/core/auth.js?v=v2026-10-09T17412";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-09T17412";
import "../../shared/js/core/contact-modal.js?v=v2026-10-09T17412";

function byId(id) { return document.getElementById(id); }

function isControlModal() {
  const p = new URLSearchParams(location.search);
  return p.get("modal") === "control";
}

function applyControlModalLayout() {
  if (!isControlModal()) return;
  // Ensure the class is set (fallback if inline script didn't run)
  document.documentElement.classList.add("modal-mode");
  document.body.classList.add("manual-in-control-modal");
}

function setBackButton({ loggedIn }) {
  const btn = byId("btnBack");
  if (!btn) return;
  const getCtx = () => ({ anon: !loggedIn });
  renderBackLabel(btn, "privacy", getCtx);
  btn.onclick = () => (location.href = backHref("privacy", getCtx()));
}

function setAuthUi(user) {
  initTopbarAccountDropdown(user, { showAuthEntry: false });
  setBackButton({ loggedIn: !!user });
}

window.dispatchEvent(new Event("resize"));

document.addEventListener("DOMContentLoaded", async () => {
  const getUserP = getUser().catch(() => null); // start równolegle z initI18n
  await initI18n({ withSwitcher: !(new URLSearchParams(location.search).get("modal") === "control") });
  document.documentElement.classList.remove('page-loading');
  document.querySelector('.topbar')?.classList.add('topbar-ready');

  applyControlModalLayout();

  const user = await getUserP;
  setAuthUi(user);

  window.addEventListener("i18n:lang", () => {
    // Zmiana języka nie zmienia sesji. Ponowne pytanie auth mogło zawieść
    // chwilowo i zostawić przycisk z etykietą w poprzednim języku.
    setAuthUi(user);
  });
});
