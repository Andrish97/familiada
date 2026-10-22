import { t } from "../../translation/translation.js?v=v2026-10-22T01235";
import { icon } from "./icons.js?v=v2026-10-22T01235";
import { choiceModal } from "./modal.js?v=v2026-10-22T01235";

// „Postaw kawę”: dobrowolne wsparcie twórcy, bez żadnych korzyści w aplikacji.
// Filiżanka w stopce (obok Kontaktu) otwiera okno z wyjaśnieniem i linkiem.
// Pusty adres = brak przycisku w stopce.
export const SUPPORT_URL = "";

function supportHost() {
  try { return new URL(SUPPORT_URL).host.replace(/^www\./, ""); } catch { return ""; }
}

function label(key, fallback) {
  const value = t(key);
  return value === key ? fallback : value;
}

function applyButtonLabels(button) {
  const text = label("support.footerBtn", "Postaw kawę");
  button.setAttribute("aria-label", text);
  button.dataset.tooltip = text;
  const span = button.querySelector(".support-footer-label");
  if (span) span.textContent = text;
}

export function openSupportModal() {
  if (!SUPPORT_URL) return Promise.resolve(false);
  const body = document.createElement("div");
  body.className = "support-modal-body";
  body.innerHTML = `<div class="support-modal-icon">${icon("coffee")}</div>`;
  for (const [key, cls] of [["support.lead", "support-modal-lead"], ["support.text", "support-modal-text"]]) {
    const p = document.createElement("p");
    p.className = cls;
    p.textContent = t(key);
    body.append(p);
  }
  const note = document.createElement("p");
  note.className = "support-modal-note";
  note.textContent = t("support.external", { host: supportHost() });
  body.append(note);

  return choiceModal({
    title: t("support.title"),
    body,
    modalClass: "support-modal",
    buttons: [
      { value: "close", text: t("support.close"), icon: "close" },
      { value: "go", text: t("support.go"), icon: "coffee", kind: "gold" },
    ],
    onChoice: (value) => {
      // Otwarcie w tym samym kliknięciu, żeby przeglądarka nie blokowała karty.
      if (value === "go") window.open(SUPPORT_URL, "_blank", "noopener");
      return true;
    },
  });
}

/** Dokłada filiżankę obok przycisku Kontakt w zwykłej stopce strony. */
export function ensureSupportEntryPoint() {
  if (!SUPPORT_URL || document.body?.hasAttribute("data-device-screen")) return;
  if (document.querySelector(".btn-support-footer")) return;
  const contact = document.querySelector(".footer:not(.contact-footer-entry--floating) .btn-contact-footer");
  if (!contact) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-support-footer";
  button.innerHTML = `${icon("coffee")}<span class="support-footer-label"></span>`;
  applyButtonLabels(button);

  // Kontakt jako ostatnie dziecko stopki trzyma prawą krawędź -- kawa i Kontakt
  // trafiają razem do jednej grupy, żeby układ stopki się nie zmienił.
  if (contact.parentElement.classList.contains("footer")) {
    const group = document.createElement("span");
    group.className = "footer-actions";
    contact.replaceWith(group);
    group.append(button, contact);
  } else {
    contact.parentElement.classList.add("footer-actions");
    contact.before(button);
  }

  window.addEventListener("i18n:lang", () => applyButtonLabels(button));
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (e.target.closest(".btn-support-footer")) openSupportModal();
  });
}
