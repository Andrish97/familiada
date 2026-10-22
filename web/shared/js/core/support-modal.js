import { t } from "../../translation/translation.js?v=v2026-10-22T01235";
import { icon } from "./icons.js?v=v2026-10-22T01235";
import { choiceModal } from "./modal.js?v=v2026-10-22T01235";

// „Postaw kawę”: dobrowolne wsparcie twórcy, bez żadnych korzyści w aplikacji.
// Filiżanka w stopce (obok Kontaktu, bez napisu) otwiera okno z wyjaśnieniem
// i wyborem kawy (linki do buycoffee.to).
// Pusty adres = brak przycisku w stopce.
export const SUPPORT_URL = "https://buycoffee.to/familiada.online";

function supportHost() {
  try { return new URL(SUPPORT_URL).host.replace(/^www\./, ""); } catch { return ""; }
}

function label(key, fallback) {
  const value = t(key);
  return value === key ? fallback : value;
}

// Rozmiary jak w widżecie buycoffee.to (?coffeeSize=…); kwoty ustawione w profilu.
export const SUPPORT_SIZES = Object.freeze([
  { size: "small", amount: "5 zł" },
  { size: "medium", amount: "15 zł" },
  { size: "large", amount: "25 zł" },
]);

function supportSizeUrl(size) {
  const url = new URL(SUPPORT_URL);
  url.searchParams.set("coffeeSize", size);
  return url.toString();
}

function applyButtonLabels(button) {
  const text = label("support.footerBtn", "Postaw kawę");
  button.setAttribute("aria-label", text);
  button.dataset.tooltip = text;
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
  const pick = document.createElement("p");
  pick.className = "support-modal-pick";
  pick.textContent = t("support.pick");
  const sizes = document.createElement("div");
  sizes.className = "support-sizes";
  SUPPORT_SIZES.forEach(({ size, amount }) => {
    const link = document.createElement("a");
    link.className = `support-size support-size--${size}`;
    link.href = supportSizeUrl(size);
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = `${icon("coffee")}<span></span>`;
    link.querySelector("span").textContent = amount;
    link.setAttribute("aria-label", t("support.sizeLabel", { amount }));
    sizes.append(link);
  });
  const note = document.createElement("p");
  note.className = "support-modal-note";
  note.textContent = t("support.external", { host: supportHost() });
  body.append(pick, sizes, note);

  return choiceModal({
    title: t("support.title"),
    body,
    modalClass: "support-modal",
    buttons: [{ value: "close", text: t("support.close"), icon: "close" }],
    // Po wyborze kawy karta buycoffee.to otwiera się z linku, a okno się zamyka.
    onReady: ({ closeBtn }) => sizes.addEventListener("click", (e) => {
      if (e.target.closest(".support-size")) setTimeout(() => closeBtn.click(), 0);
    }),
  });
}

/** Dokłada filiżankę obok przycisku Kontakt w zwykłej stopce strony. */
export function ensureSupportEntryPoint() {
  if (!SUPPORT_URL || document.body?.hasAttribute("data-device-screen")) return;
  // Inne wejścia do okna (np. odpowiedź w FAQ strony głównej) czekają ukryte na adres.
  document.querySelectorAll("[data-support-modal][hidden]").forEach((el) => { el.hidden = false; });
  if (document.querySelector(".btn-support-footer")) return;
  const contact = document.querySelector(".footer:not(.contact-footer-entry--floating) .btn-contact-footer");
  if (!contact) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-support-footer";
  button.innerHTML = icon("coffee");
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
    if (e.target.closest(".btn-support-footer, [data-support-modal]")) openSupportModal();
  });
}
