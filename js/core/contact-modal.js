import { t, getUiLang } from "../../translation/translation.js";

let modalEl = null;
let isSubmitting = false;

function buildModalHtml() {
  return `
    <div style="max-width:480px;margin:40px auto;padding:0 16px 40px">
      <div class="modal">
        <div class="mTitle" id="cModalTitle"></div>
        <div id="cModalForm">
          <div class="field" style="margin-top:14px">
            <label class="field-label" id="cModalEmailLabel"></label>
            <input class="inp" id="cModalEmail" type="email" autocomplete="email" style="width:100%;box-sizing:border-box"/>
          </div>
          <div class="field" style="margin-top:10px">
            <label class="field-label" id="cModalTicketLabel"></label>
            <input class="inp" id="cModalTicket" type="text" placeholder="np. 2026-0001" style="width:100%;box-sizing:border-box" autocomplete="off"/>
          </div>
          <div class="field" style="margin-top:10px" id="cModalSubjectField">
            <label class="field-label" id="cModalSubjectLabel"></label>
            <input class="inp" id="cModalSubject" type="text" style="width:100%;box-sizing:border-box"/>
          </div>
          <div class="field" style="margin-top:10px">
            <label class="field-label" id="cModalMessageLabel"></label>
            <textarea class="inp" id="cModalMessage" rows="7" style="width:100%;box-sizing:border-box;resize:vertical"></textarea>
          </div>
          <div id="cModalError" style="margin-top:8px;font-size:13px;color:#ff6b6b;display:none"></div>
          <div class="modal-actions" style="margin-top:14px">
            <button class="btn sm" id="cModalClose" type="button"></button>
            <button class="btn sm gold" id="cModalSubmit" type="button"></button>
          </div>
        </div>
        <div id="cModalSuccess" style="display:none;text-align:center;padding:16px 0">
          <div style="font-size:32px;margin-bottom:8px">✓</div>
          <div style="font-size:15px;font-weight:700" id="cModalSuccessTitle"></div>
          <div style="margin-top:6px;font-size:13px;opacity:.7" id="cModalSuccessTicket"></div>
          <div class="modal-actions" style="margin-top:16px">
            <button class="btn sm gold" id="cModalDone" type="button"></button>
          </div>
        </div>
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
  set("cModalClose",        "common.cancel");
  set("cModalSubmit",       "contact.modal.submit");
  set("cModalSuccessTitle", "contact.modal.successTitle");
  set("cModalDone",         "common.done");
}

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.id = "contactModalOverlay";
  modalEl.style.cssText = "display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);overflow-y:auto;";
  modalEl.innerHTML = buildModalHtml();
  document.body.appendChild(modalEl);

  modalEl.addEventListener("click", (e) => { if (e.target === modalEl) closeContactModal(); });
  document.getElementById("cModalClose")?.addEventListener("click", closeContactModal);
  document.getElementById("cModalDone")?.addEventListener("click", closeContactModal);
  document.getElementById("cModalSubmit")?.addEventListener("click", submitContact);
  document.getElementById("cModalTicket")?.addEventListener("input", () => {
    const ticket = document.getElementById("cModalTicket")?.value.trim();
    const subjectField = document.getElementById("cModalSubjectField");
    if (subjectField) subjectField.style.display = ticket ? "none" : "";
  });

  window.addEventListener("i18n:lang", applyLabels);
}

async function prefillEmail() {
  try {
    const { supabase } = await import("./supabase.js");
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email;
    if (email) {
      const inp = document.getElementById("cModalEmail");
      if (inp && !inp.value) inp.value = email;
    }
  } catch {}
}

export function openContactModal(opts = {}) {
  ensureModal();
  applyLabels();

  document.getElementById("cModalForm").style.display = "";
  document.getElementById("cModalSuccess").style.display = "none";
  const errEl = document.getElementById("cModalError");
  if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

  const ticketInp = document.getElementById("cModalTicket");
  if (opts.ticket && ticketInp) {
    ticketInp.value = opts.ticket;
    const subjectField = document.getElementById("cModalSubjectField");
    if (subjectField) subjectField.style.display = "none";
  } else if (ticketInp) {
    ticketInp.value = "";
    const subjectField = document.getElementById("cModalSubjectField");
    if (subjectField) subjectField.style.display = "";
  }

  modalEl.style.display = "block";
  document.body.style.overflow = "hidden";
  prefillEmail();
  setTimeout(() => {
    const email = document.getElementById("cModalEmail");
    if (email && !email.value) email.focus();
    else document.getElementById("cModalMessage")?.focus();
  }, 50);
}

export function closeContactModal() {
  if (!modalEl) return;
  modalEl.style.display = "none";
  document.body.style.overflow = "";
}

async function submitContact() {
  if (isSubmitting) return;

  const email   = (document.getElementById("cModalEmail")?.value || "").trim();
  const ticket  = (document.getElementById("cModalTicket")?.value || "").trim();
  const subject = (document.getElementById("cModalSubject")?.value || "").trim();
  const message = (document.getElementById("cModalMessage")?.value || "").trim();
  const lang    = getUiLang();
  const errEl   = document.getElementById("cModalError");

  const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = ""; } };

  if (!email || !email.includes("@")) { showErr(t("contact.modal.errEmail") || "Podaj poprawny e-mail."); return; }
  if (!message || message.length < 5) { showErr(t("contact.modal.errMessage") || "Wiadomość jest za krótka."); return; }
  if (!ticket && !subject)            { showErr(t("contact.modal.errSubject") || "Podaj temat."); return; }

  isSubmitting = true;
  const btn = document.getElementById("cModalSubmit");
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  if (errEl) { errEl.style.display = "none"; }

  try {
    let res;
    if (ticket) {
      res = await fetch("/_api/contact/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ticket, message, lang }),
      });
    } else {
      res = await fetch("/_api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subject: subject || message.slice(0, 80), message, lang }),
      });
    }

    if (res.status === 429) { showErr(t("privacy.contact.rateLimited") || "Zbyt wiele zgłoszeń. Spróbuj jutro."); return; }
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "send_failed");

    document.getElementById("cModalForm").style.display = "none";
    document.getElementById("cModalSuccess").style.display = "";
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
    isSubmitting = false;
    if (btn) { btn.disabled = false; applyLabels(); }
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-contact-modal], .btn-contact-footer")) openContactModal();
  });
}
