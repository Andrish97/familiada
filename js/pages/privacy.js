// js/pages/privacy.js
//
// - publiczna strona (bez wymuszania logowania)
// - jeśli user zalogowany -> pokazuj username + Wyloguj
// - jeśli niezalogowany -> ukryj username + Wyloguj, a Wstecz wraca do /

import { initI18n, t, getUiLang, withLangParam } from "../../translation/translation.js";
import { getUser } from "../core/auth.js";

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
    btn.onclick = () => (location.href = withLangParam("/"));
    return;
  }

  btn.textContent = t("manual.backToGames");
  btn.onclick = () => (location.href = decodeManualBack());
}

function setAuthUi(user) {
  const who = byId("who");
  const btnLogout = byId("btnLogout");

  if (who) {
    who.textContent = user?.username || user?.email || "—";
    who.style.display = user ? "" : "none";
  }


  setBackButton({ loggedIn: !!user });
}

window.dispatchEvent(new Event("resize"));

// ============================================================
// CONTACT FORM
// ============================================================

function initContactForm(user) {
  const form    = document.getElementById("contactForm");
  const emailEl = document.getElementById("contactEmail");
  const langEl  = document.getElementById("contactLang");
  const errEl   = document.getElementById("contactError");
  const success = document.getElementById("contactSuccess");
  const ticket  = document.getElementById("contactTicket");
  const submitBtn = document.getElementById("contactSubmit");

  if (!form) return;

  // Pre-fill email if logged in
  if (user?.email && emailEl) {
    emailEl.value = user.email;
  }

  // Set lang from current UI lang
  if (langEl) {
    const uiLang = getUiLang() || "pl";
    if (["pl","en","uk"].includes(uiLang)) langEl.value = uiLang;
  }

  // Update lang select when UI lang changes
  window.addEventListener("i18n:lang", () => {
    if (langEl) {
      const uiLang = getUiLang() || "pl";
      if (["pl","en","uk"].includes(uiLang)) langEl.value = uiLang;
    }
  });

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = msg ? "block" : "none";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const email   = (emailEl?.value || "").trim();
    const subject = (document.getElementById("contactSubject")?.value || "").trim();
    const message = (document.getElementById("contactMessage")?.value || "").trim();
    const lang    = langEl?.value || "pl";

    if (!email || !email.includes("@")) {
      showError(t("privacy.contact.validEmail") || "Podaj poprawny adres e-mail.");
      return;
    }
    if (!subject) {
      showError(t("privacy.contact.validSubject") || "Podaj temat.");
      return;
    }
    if (message.length < 5 || message.length > 5000) {
      showError(t("privacy.contact.validMessage") || "Wiadomość musi mieć od 5 do 5000 znaków.");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    const currentUser = user || await getUser();

    try {
      const res = await fetch("/_api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          subject,
          message,
          lang,
          user_id: currentUser?.id || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const isRateLimit = data.error === "rate_limited_email" || data.error === "rate_limited_ip";
        showError(isRateLimit
          ? (t("privacy.contact.rateLimited") || "Możesz wysłać jedno zgłoszenie na 24 godziny.")
          : (t("privacy.contact.errorGeneric") || "Coś poszło nie tak. Spróbuj ponownie."));
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      // Show success
      form.style.display = "none";
      if (success) success.style.display = "block";
      if (ticket)  ticket.textContent = "#" + (data.ticket_number || "");
    } catch {
      showError(t("privacy.contact.errorGeneric") || "Coś poszło nie tak. Spróbuj ponownie.");
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: !(new URLSearchParams(location.search).get("modal") === "control") });

  applyControlModalLayout();

  const user = await getUser(); // soft — bez redirectów
  setAuthUi(user);
  initContactForm(user);

  window.addEventListener("i18n:lang", async () => {
    const u = await getUser();
    setAuthUi(u);
  });
});
