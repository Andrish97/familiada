import { t, getUiLang } from "../../translation/translation.js?v=v2026-10-24T18062";
import { isSheetViewport, enterModalSheet, exitModalSheet, setOverlayOpen } from "./modal-sheet.js?v=v2026-10-24T18062";
import { icon, iconText } from "./icons.js?v=v2026-10-24T18062";
import { getTurnstileToken } from "./turnstile.js?v=v2026-10-24T18062";
import { ensureSupportEntryPoint } from "./support-modal.js?v=v2026-10-24T18062";


let modalEl = null;
let isSubmitting = false;
// Okno kontaktu zawsze korzysta ze wspólnego okna od dołu (modal-sheet.js).
let usedSheetMode = false;

function buildModalHtml() {
  return `
    <header class="topbar topbar-layout-4 contact-modal-topbar" hidden>
      <div class="topbar-section topbar-section-1"><button class="btn sm" id="cModalBack" type="button"></button></div>
      <div class="topbar-section topbar-section-2"></div>
      <div class="topbar-section topbar-section-3"></div>
      <div class="topbar-section topbar-section-4"></div>
    </header>
    <div class="modal">
      <div class="mHead">
        <div class="mTitle" id="cModalTitle"></div>
        <button class="btn sm" id="cModalX" type="button" aria-label="Zamknij">${icon("close")}</button>
      </div>
      <div id="cModalForm" class="uni-body contact-form">
        <div class="contact-field">
          <label class="field-label" id="cModalEmailLabel" for="cModalEmail"></label>
          <input class="inp" id="cModalEmail" type="email" autocomplete="email"/>
        </div>
        <div class="contact-field">
          <label class="field-label" id="cModalTicketLabel" for="cModalTicket"></label>
          <input class="inp" id="cModalTicket" type="text" autocomplete="off"/>
        </div>
        <div class="contact-field" id="cModalSubjectField">
          <label class="field-label" id="cModalSubjectLabel" for="cModalSubject"></label>
          <input class="inp" id="cModalSubject" type="text"/>
        </div>
        <div class="contact-field">
          <label class="field-label" id="cModalMessageLabel" for="cModalMessage"></label>
          <textarea class="inp" id="cModalMessage" rows="7"></textarea>
        </div>
        <div class="contact-field">
          <div class="field-label" id="cModalAttachLabel"></div>
          <input type="file" id="cModalAttachments" multiple hidden/>
          <label for="cModalAttachments" class="btn sm contact-attach-btn">
            ${icon("paperclip")}
            <span id="cModalAttachBtnLabel"></span>
          </label>
          <div id="cModalAttachHint" class="contact-hint"></div>
          <div id="cModalFileList" class="contact-files"></div>
        </div>
        <div id="cModalCaptcha" class="contact-captcha" hidden></div>
        <div id="cModalError" class="contact-error" hidden role="alert"></div>
      </div>
      <div id="cModalSuccess" class="uni-body contact-success" hidden>
        <div class="contact-success-icon">${icon("check")}</div>
        <div class="contact-success-title" id="cModalSuccessTitle"></div>
        <div class="contact-success-ticket" id="cModalSuccessTicket"></div>
      </div>
      <div id="cModalFormActions" class="uni-foot modal-actions">
        <button class="btn sm" id="cModalClose" type="button"></button>
        <button class="btn sm gold" id="cModalSubmit" type="button"></button>
      </div>
      <div id="cModalSuccessActions" class="uni-foot modal-actions" hidden>
        <button class="btn sm gold" id="cModalDone" type="button"></button>
      </div>
    </div>`;
}

function applyLabels() {
  const set = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key) || id; };
  set("cModalTitle",        "contact.modal.title");
  set("cModalEmailLabel",   "contact.modal.email");
  set("cModalTicketLabel",  "contact.modal.ticket");
  set("cModalSubjectLabel", "contact.modal.subject");
  set("cModalMessageLabel", "contact.modal.message");
  set("cModalAttachLabel",    "contact.modal.attachments");
  set("cModalAttachBtnLabel", "contact.modal.chooseFiles");
  const setAction = (id, key, iconName) => { const el = document.getElementById(id); if (el) el.innerHTML = iconText(iconName, t(key) || id); };
  setAction("cModalClose",  "common.cancel", "close");
  setAction("cModalSubmit", "contact.modal.submit", "envelope-out");
  set("cModalSuccessTitle", "contact.modal.successTitle");
  setAction("cModalDone",   "common.done", "check");
  const xBtn = document.getElementById("cModalX");
  if (xBtn) xBtn.setAttribute("aria-label", t("common.modal.closeLabel") || "Zamknij");
  const backBtn = document.getElementById("cModalBack");
  if (backBtn) backBtn.innerHTML = iconText("arrow-left", t("common.modalBack"));
  if (isSheetViewport() && usedSheetMode) document.querySelectorAll('.sheet-back-active').forEach(button => { button.innerHTML = iconText('arrow-left', t('common.modalBack')); });
  modalEl?.querySelector('.contact-modal-topbar')?.toggleAttribute('hidden', !isSheetViewport() || usedSheetMode);
  const ticketInp = document.getElementById("cModalTicket");
  if (ticketInp) ticketInp.placeholder = t("contact.modal.ticketPlaceholder") || "2026-0001";
}

// W trakcie wysyłki (także gdy czeka na wyzwanie Turnstile) „Wyślij” zostaje
// z ikoną i etykietą, tylko wyłączony -- dawny sam „…” wyglądał jak menu
// „więcej” i chował główną akcję (uwaga właściciela 2026-10-22); ta sama
// szerokość, więc nagłówek arkusza nie przeskakuje.
function setSubmitBusy(busy) {
  isSubmitting = busy;
  const btn = document.getElementById("cModalSubmit");
  if (!btn) return;
  btn.disabled = busy;
  if (busy) btn.setAttribute("aria-busy", "true");
  else btn.removeAttribute("aria-busy");
}

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.id = "contactModalOverlay";
  modalEl.className = "overlay contact-modal-overlay";
  modalEl.hidden = true;
  modalEl.innerHTML = buildModalHtml();
  const modal = modalEl.querySelector(":scope > .modal");
  modal?.classList.add("uni-modal");
  modal?.setAttribute("role", "dialog");
  modal?.setAttribute("aria-modal", "true");
  modal?.setAttribute("aria-labelledby", "cModalTitle");
  document.body.appendChild(modalEl);

  modalEl.addEventListener("click", (e) => {
    if (e.target !== modalEl) return;
    // Na telefonie modal jest pełnoekranowy — jedynym wyjściem ma być
    // widoczny przycisk zamknięcia, nie klik w tło.
    if (isSheetViewport()) return;
    closeContactModal();
  });
  document.getElementById("cModalClose")?.addEventListener("click", closeContactModal);
  document.getElementById("cModalX")?.addEventListener("click", closeContactModal);
  document.getElementById("cModalBack")?.addEventListener("click", closeContactModal);
  document.getElementById("cModalDone")?.addEventListener("click", closeContactModal);
  document.getElementById("cModalSubmit")?.addEventListener("click", submitContact);
  document.getElementById("cModalTicket")?.addEventListener("input", () => {
    const ticket = document.getElementById("cModalTicket")?.value.trim();
    const subjectField = document.getElementById("cModalSubjectField");
    if (subjectField) subjectField.hidden = !!ticket;
  });

  document.getElementById("cModalAttachments")?.addEventListener("change", (e) => {
    const list = document.getElementById("cModalFileList");
    if (!list) return;
    const files = Array.from(e.target.files || []);
    // Nazwa pliku jako tekst (nazwa może zawierać znaczniki HTML).
    list.replaceChildren(...files.map(f => {
      const chip = document.createElement("span");
      chip.className = "contact-file";
      chip.textContent = f.name;
      return chip;
    }));
  });

  window.addEventListener("i18n:lang", applyLabels);
}

async function prefillEmail() {
  try {
    const { sb } = await import("./supabase.js?v=v2026-10-24T18062");

    const { data } = await sb().auth.getSession();
    const user = data?.session?.user;
    const isGuest = user?.user_metadata?.is_guest === true || user?.app_metadata?.is_guest === true;
    const email = user?.email;
    if (email && !isGuest) {
      const inp = document.getElementById("cModalEmail");
      if (inp && !inp.value) inp.value = email;
    }
  } catch {}
}

export async function openContactModal(opts = {}) {
  if (document.body?.hasAttribute("data-device-screen")) return;
  ensureModal();
  applyLabels();

  document.getElementById("cModalForm").hidden = false;
  document.getElementById("cModalSuccess").hidden = true;
  document.getElementById("cModalFormActions").hidden = false;
  document.getElementById("cModalSuccessActions").hidden = true;
  const errEl = document.getElementById("cModalError");
  if (errEl) { errEl.hidden = true; errEl.textContent = ""; }

  const fileInput = document.getElementById("cModalAttachments");
  if (fileInput) fileInput.value = "";
  const fileList = document.getElementById("cModalFileList");
  if (fileList) fileList.innerHTML = "";

  const ticketInp = document.getElementById("cModalTicket");
  if (opts.ticket && ticketInp) {
    ticketInp.value = opts.ticket;
    const subjectField = document.getElementById("cModalSubjectField");
    if (subjectField) subjectField.hidden = true;
  } else if (ticketInp) {
    ticketInp.value = "";
    const subjectField = document.getElementById("cModalSubjectField");
    if (subjectField) subjectField.hidden = false;
  }

  // Okno od dołu (telefon/tablet dotykowy) leży nad całą stroną, jak inne
  // rozbudowane okna -- zawsze w body, bez przejmowania przycisku wstecz
  // (wcześniej wstawiane do main z z-index:auto chowało pasek okna pod topbarem).
  usedSheetMode = true;
  modalEl.classList.add("modal--sheet");
  document.body.appendChild(modalEl);

  setOverlayOpen(modalEl, true);
  enterModalSheet(modalEl, { onClose: closeContactModal });
  applyLabels();
  await prefillEmail();
  const emailInp = document.getElementById("cModalEmail");
  if (emailInp && !emailInp.value) emailInp.focus();
  else document.getElementById("cModalMessage")?.focus();
}

export function closeContactModal() {
  if (!modalEl) return;
  setOverlayOpen(modalEl, false);
  exitModalSheet(modalEl);
}

async function submitContact() {
  if (isSubmitting) return;

  const email   = (document.getElementById("cModalEmail")?.value || "").trim();
  const ticket  = (document.getElementById("cModalTicket")?.value || "").trim();
  const subject = (document.getElementById("cModalSubject")?.value || "").trim();
  const message = (document.getElementById("cModalMessage")?.value || "").trim();
  const lang    = getUiLang();
  const errEl   = document.getElementById("cModalError");

  const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };

  if (!email || !email.includes("@")) { showErr(t("contact.modal.errEmail") || "Podaj poprawny e-mail."); return; }
  if (!message || message.length < 5) { showErr(t("contact.modal.errMessage") || "Wiadomość jest za krótka."); return; }
  if (!ticket && !subject)            { showErr(t("contact.modal.errSubject") || "Podaj temat."); return; }

  setSubmitBusy(true);
  if (errEl) { errEl.hidden = true; }

  try {
    // Convert attachments to base64
    const attachments = [];
    const fileInput = document.getElementById("cModalAttachments");
    if (fileInput?.files?.length) {
      for (const file of Array.from(fileInput.files).slice(0, 5)) {
        if (file.size > 5 * 1024 * 1024) continue;
        const b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        attachments.push({ filename: file.name, mime_type: file.type || "application/octet-stream", data_b64: b64 });
      }
    }

    // Weryfikacja Turnstile po stronie Workera (token jednorazowy).
    let captcha_token;
    try {
      captcha_token = await getTurnstileToken(document.getElementById("cModalCaptcha"), { lang, size: "flexible" });
    } catch {
      showErr(t("auth.captchaRequired") || "Potwierdź, że nie jesteś robotem.");
      return;
    }
    let res;
    if (ticket) {
      res = await fetch("/_api/contact/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ticket, message, lang, attachments, captcha_token }),
      });
    } else {
      res = await fetch("/_api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subject: subject || message.slice(0, 80), message, lang, attachments, captcha_token }),
      });
    }

    if (res.status === 429) { showErr(t("contact.rateLimited") || "Zbyt wiele zgłoszeń. Spróbuj jutro."); return; }
    if (res.status === 400 || res.status === 503) {
      const failed = await res.clone().json().catch(() => ({}));
      if (String(failed?.error || "").startsWith("captcha")) { showErr(t("auth.captchaRequired") || "Potwierdź, że nie jesteś robotem."); return; }
    }
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "send_failed");

    document.getElementById("cModalForm").hidden = true;
    document.getElementById("cModalFormActions").hidden = true;
    document.getElementById("cModalSuccess").hidden = false;
    document.getElementById("cModalSuccessActions").hidden = false;
    const ticketEl = document.getElementById("cModalSuccessTicket");
    if (ticketEl) {
      ticketEl.textContent = json.ticket_number
        ? `${t("contact.modal.ticketLabel") || "Numer zgłoszenia:"} ${json.ticket_number}`
        : (ticket ? `${t("contact.modal.addedTo") || "Dodano do zgłoszenia:"} ${ticket}` : "");
    }
    ["cModalEmail","cModalTicket","cModalSubject","cModalMessage"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
  } catch (err) {
    showErr(String(err?.message || err));
  } finally {
    setSubmitBusy(false);
  }
}

function ensureContactEntryPoint() {
  if (document.body?.hasAttribute("data-device-screen")) return;
  if (document.querySelector('[data-contact-modal], .btn-contact-footer')) return;
  let footer = document.querySelector('.footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'footer contact-footer-entry';
    const host = document.querySelector('main.wrap');
    if (host) host.append(footer);
    else { footer.classList.add('contact-footer-entry--floating'); document.body.append(footer); }
  }
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'btn-contact-footer';
  button.setAttribute('data-contact-modal',''); button.setAttribute('data-i18n','common.contactBtn');
  const label = t('common.contactBtn');
  button.textContent = label === 'common.contactBtn' ? 'Kontakt' : label;
  footer.append(button);
}

if (typeof document !== "undefined") {
  window.matchMedia("(max-width:600px)").addEventListener("change", applyLabels);
  window.addEventListener('i18n:lang', applyLabels);
  const ensureFooterEntryPoints = () => { ensureContactEntryPoint(); ensureSupportEntryPoint(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureFooterEntryPoints, { once: true });
  else ensureFooterEntryPoints();
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-contact-modal], .btn-contact-footer")) openContactModal();
  });
}
