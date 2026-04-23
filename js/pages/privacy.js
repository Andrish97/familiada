// js/pages/privacy.js
//
// - publiczna strona (bez wymuszania logowania)
// - jeśli user zalogowany -> pokazuj username + Wyloguj
// - jeśli niezalogowany -> ukryj username + Wyloguj, a Wstecz wraca do /

import { initI18n, t, withLangParam } from "../../translation/translation.js?v=v2026-04-23T16261";
import { getUser } from "../core/auth.js?v=v2026-04-23T16261";
import { initTopbarAccountDropdown } from "../core/topbar-controller.js?v=v2026-04-23T16261";
import "../core/contact-modal.js";

function byId(id) { return document.getElementById(id); }

function hasManualRef() {
  return new URLSearchParams(location.search).has("man");
}

function buildBuilderBackUrl() {
  const p = new URLSearchParams(location.search);
  const lang = p.get("lang") || localStorage.getItem("uiLang") || "pl";
  return `builder?lang=${encodeURIComponent(lang)}`;
}

function decodeManualBack() {
  const p = new URLSearchParams(location.search);
  const man = p.get("man");

  if (!man) return buildBuilderBackUrl();
  if (man.includes("lang=")) return man;

  const lang = p.get("lang") || localStorage.getItem("uiLang") || "pl";
  const sep = man.includes("?") ? "&" : "?";
  return `${man}${sep}lang=${encodeURIComponent(lang)}`;
}

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

  if (hasManualRef()) {
    btn.textContent = t("privacy.backToManual");
    btn.onclick = () => (location.href = decodeManualBack());
    return;
  }

  if (!loggedIn) {
    btn.textContent = t("privacy.backToHome");
    btn.onclick = () => (location.href = withLangParam("/"));
    return;
  }

  btn.textContent = t("manual.backToGames");
  btn.onclick = () => (location.href = decodeManualBack());
}

function setAuthUi(user) {
  if (!isControlModal()) {
    initTopbarAccountDropdown(user, { showAuthEntry: false });
  }
  setBackButton({ loggedIn: !!user });
}

window.dispatchEvent(new Event("resize"));

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: !(new URLSearchParams(location.search).get("modal") === "control") });

  applyControlModalLayout();

  const user = await getUser();
  setAuthUi(user);

  window.addEventListener("i18n:lang", async () => {
    const u = await getUser();
    setAuthUi(u);
  });
});
