// js/pages/privacy.js
//
// - publiczna strona (bez wymuszania logowania)
// - jeśli user zalogowany -> pokazuj username + Wyloguj
// - jeśli niezalogowany -> ukryj username + Wyloguj, a Wstecz wraca do index.html

import { initI18n, t, withLangParam } from "../../translation/translation.js";
import { getUser, signOut, guestAuthEntryUrl } from "../core/auth.js";

function byId(id) { return document.getElementById(id); }

function hasManualRef() {
  return new URLSearchParams(location.search).has("man");
}

function buildBuilderBackUrl() {
  const p = new URLSearchParams(location.search);
  const lang = p.get("lang") || localStorage.getItem("uiLang") || "pl";
  return `builder.html?lang=${encodeURIComponent(lang)}`;
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
  document.body.classList.add("manual-in-control-modal");
  byId("who")?.remove();
  byId("btnLogout")?.remove();
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
    btn.onclick = () => (location.href = withLangParam("index.html"));
    return;
  }

  btn.textContent = t("manual.backToGames");
  btn.onclick = () => (location.href = decodeManualBack());
}

function setAuthUi(user) {
  const who = byId("who");
  const btnLogout = byId("btnLogout");

  const loggedIn = !!user;

  if (who) {
    who.textContent = user?.username || user?.email || "—";
    who.style.display = loggedIn ? "" : "none";
  }

  if (btnLogout) {
    btnLogout.style.display = loggedIn ? "" : "none";
    btnLogout.onclick = async () => {
      await signOut();
      location.href = guestAuthEntryUrl();
    };
  }

  setBackButton({ loggedIn });
}

window.dispatchEvent(new Event("resize"));

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: !(new URLSearchParams(location.search).get("modal") === "control") });

  applyControlModalLayout();

  const user = await getUser(); // soft — bez redirectów
  setAuthUi(user);

  window.addEventListener("i18n:lang", async () => {
    const u = await getUser();
    setAuthUi(u);
  });
});
