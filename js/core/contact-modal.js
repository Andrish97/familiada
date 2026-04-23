import { t, getUiLang } from "../../translation/translation.js?v=v2026-04-23T22191";

let modalEl = null;
let isSubmitting = false;

function buildModalHtml() {
  return `
    <div class="modal">
      <div class="mTitle" id="cModalTitle"></div>
      <div id="cModalForm">
        <div class="field" style="margin-top:14px">
          <label class="field-label" id="cModalEmailLabel"></label>
          <input class="inp" id="cModalEmail" type="email" autocomplete="email" style="width:100%;box-sizing:border-box"/>
        </div>
        <div class="field" style="margin-top:10px">
          <label class="field-label" id="cModalTicketLabel"></label>
          <input class="inp" id="cModalTicket" type="text" style="width:100%;box-sizing:border-box" autocomplete="off"/>
        </div>
        <div class="field" style="margin-top:10px" id="cModalSubjectField">
          <label class="field-label" id="cModalSubjectLabel"></label>
          <input class="inp" id="cModalSubject" type="text" style="width:100%;box-sizing:border-box"/>
        </div>
        <div class="field" style="margin-top:10px">
          <label class="field-label" id="cModalMessageLabel"></label>
          <textarea class="inp" id="cModalMessage" rows="7" style="width:100%;box-sizing:border-box;resize:vertical"></textarea>
        </div>
        <div class="field" style="margin-top:10px">
          <label class="field-label" id="cModalAttachLabel"></label>
          <input type="file" id="cModalAttachments" multiple style="display:none"/>
          <label for="cModalAttachments" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);font-size:12px;color:rgba(255,255,255,.65);cursor:pointer;user-select:none">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            <span id="cModalAttachBtnLabel"></span>
          </label>
          <div id="cModalAttachHint" style="font-size:11px;opacity:.4;margin-top:3px"></div>
          <div id="cModalFileList" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"></div>
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
  set("cModalClose",        "common.cancel");
  set("cModalSubmit",       "contact.modal.submit");
  set("cModalSuccessTitle", "contact.modal.successTitle");
  set("cModalDone",         "common.done");
  const ticketInp = document.getElementById("cModalTicket");
  if (ticketInp) ticketInp.placeholder = t("contact.modal.ticketPlaceholder") || "2026-0001";
}

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.id = "contactModalOverlay";
  modalEl.className = "overlay";
  modalEl.style.display = "none";
  modalEl.style.zIndex = "9999";
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

  document.getElementById("cModalAttachments")?.addEventListener("change", (e) => {
    const list = document.getElementById("cModalFileList");
    if (!list) return;
    const files = Array.from(e.target.files || []);
    list.innerHTML = files.map(f =>
      `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.12);font-size:11px;color:rgba(255,255,255,.6)">${f.name}</span>`
    ).join("");
  });

  window.addEventListener("i18n:lang", applyLabels);
}

async function prefillEmail() {
  try {
    const { sb } = await import("./supabase.js?v=v2026-04-23T22191");
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
  ensureModal();
  applyLabels();

  document.getElementById("cModalForm").style.display = "";
  document.getElementById("cModalSuccess").style.display = "none";
  const errEl = document.getElementById("cModalError");
  if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

  const fileInput = document.getElementById("cModalAttachments");
  if (fileInput) fileInput.value = "";
  const fileList = document.getElementById("cModalFileList");
  if (fileList) fileList.innerHTML = "";

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

  modalEl.style.display = "grid";
  document.body.style.overflow = "hidden";
  await prefillEmail();
  const emailInp = document.getElementById("cModalEmail");
  if (emailInp && !emailInp.value) emailInp.focus();
  else document.getElementById("cModalMessage")?.focus();
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

    let res;
    if (ticket) {
      res = await fetch("/_api/contact/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ticket, message, lang, attachments }),
      });
    } else {
      res = await fetch("/_api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subject: subject || message.slice(0, 80), message, lang, attachments }),
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
