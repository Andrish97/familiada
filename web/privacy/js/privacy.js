// js/pages/privacy.js
//
// - publiczna strona (bez wymuszania logowania)
// - jeśli user zalogowany -> pokazuj username + Wyloguj
// - jeśli niezalogowany -> ukryj username + Wyloguj, a Wstecz wraca do /

import { initI18n, t, withLangParam } from "../../shared/translation/translation.js?v=v2026-10-09T01243";
import { getUser } from "../../shared/js/core/auth.js?v=v2026-10-09T01243";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-09T01243";
import "../../shared/js/core/contact-modal.js?v=v2026-10-09T01243";
import { icon, iconText } from "../../shared/js/core/icons.js?v=v2026-10-09T01243";

function byId(id) { return document.getElementById(id); }

function hasManualRef() {
  return new URLSearchParams(location.search).has("man");
}

function buildGamesBackUrl() {
  const p = new URLSearchParams(location.search);
  const lang = p.get("lang") || localStorage.getItem("uiLang") || "pl";
  return `/games/?lang=${encodeURIComponent(lang)}`;
}

function normalizeManualBack(raw) {
  const fallback = buildGamesBackUrl();
  const trimmed = String(raw || "").trim();
  if (!trimmed) return fallback;

  try {
    const target = new URL(trimmed, location.origin + "/");
    // `man` pochodzi z query stringa. Akceptujemy wyłącznie adres w tym
    // samym serwisie, żeby przycisk powrotu nie był otwartym przekierowaniem
    // (ani nawigacją do javascript:/data:).
    if (target.origin !== location.origin) return fallback;
    const lang = new URLSearchParams(location.search).get("lang") || localStorage.getItem("uiLang") || "pl";
    if (!target.searchParams.has("lang")) target.searchParams.set("lang", lang);
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

function decodeManualBack() {
  const p = new URLSearchParams(location.search);
  return normalizeManualBack(p.get("man"));
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
    btn.innerHTML = iconText("arrow-left", t("privacy.backToManual"));
    btn.onclick = () => (location.href = decodeManualBack());
    return;
  }

  if (!loggedIn) {
    btn.innerHTML = iconText("arrow-left", t("privacy.backToHome"));
    btn.onclick = () => (location.href = withLangParam("/"));
    return;
  }

  btn.innerHTML = iconText("arrow-left", t("manual.backToGames"));
  btn.onclick = () => (location.href = decodeManualBack());
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
