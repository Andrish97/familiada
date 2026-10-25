// admin/js/marketing.js — Marketing: szablony, odbiorcy, podgląd i wysyłka.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { buildMarketingMailHtml } from "../../shared/js/core/marketing-mail.js?v=v2026-10-25T08352";
import { confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-25T08352";
import { adminFetch, esc, loadTinyMce, showToast } from "./core.js?v=v2026-10-25T08352";

// ── Marketing ──────────────────────────────────────────────────────────────

const MKT_TEMPLATES = {
  invitation: {
    subject: "familiada.online — profesjonalny system do Twoich wydarzeń",
    hasBody: false,
  },
  newsletter: {
    subject: "Nowości w Familiada Online",
    hasBody: true,
  },
  custom: {
    subject: "",
    hasBody: true,
  },
};

let mktActiveTpl = "invitation";
let mktValidEmails = [];
let mktPreviewVisible = false;

function mktApplyTemplate(tplId) {
  mktActiveTpl = tplId;
  document.querySelectorAll("#mktTemplateButtons [data-tpl]").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.tpl === tplId);
  });
  const tpl = MKT_TEMPLATES[tplId] || MKT_TEMPLATES.custom;
  const subjectEl = document.getElementById("mktSubject");
  const bodyWrap = document.getElementById("mktBodyWrap");
  const subjectHint = document.getElementById("mktSubjectHint");
  if (subjectEl && !subjectEl._userEdited) {
    subjectEl.value = tpl.subject;
  }
  if (bodyWrap) bodyWrap.hidden = !tpl.hasBody;
  if (subjectHint) subjectHint.textContent = tpl.hasBody ? "" : ("Temat ustawiony automatycznie — możesz go zmienić.");
  if (mktPreviewVisible) mktRefreshPreview();
}

async function mktRefreshPreview() {
  const frame = document.getElementById("mktPreviewFrame");
  if (!frame) return;
  const subject = (document.getElementById("mktSubject")?.value || "").trim();
  const editor = globalThis.tinymce?.get("mktBody");
  const bodyHtml = editor ? editor.getContent() : "";
  frame.srcdoc = buildMarketingMailHtml({ template: mktActiveTpl, subject, bodyHtml });
}

function mktParseEmails() {
  const raw = (document.getElementById("mktEmailInput")?.value || "");
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const tokens = raw.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const tok of tokens) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    if (emailRe.test(tok)) valid.push(tok);
    else invalid.push(tok);
  }
  mktValidEmails = valid;
  const listWrap = document.getElementById("mktEmailListWrap");
  const listEl   = document.getElementById("mktEmailList");
  const statsEl  = document.getElementById("mktEmailStats");
  const countEl  = document.getElementById("mktEmailCount");
  if (listWrap) listWrap.hidden = !(valid.length || invalid.length);
  if (listEl) {
    listEl.innerHTML = valid.map(e =>
      `<span class="mkt-email-chip">${esc(e)}</span>`
    ).join("") + (invalid.length ? `<div class="mkt-email-invalid">Niepoprawne: ${invalid.map(esc).join(", ")}</div>` : "");
  }
  const statsText = valid.length
    ? `${valid.length} poprawnych${invalid.length ? `, ${invalid.length} niepoprawnych` : ""}`
    : ("Brak poprawnych adresów.");
  if (statsEl) statsEl.textContent = statsText;
  if (countEl) countEl.textContent = valid.length ? `${valid.length}` : "";
}

async function sendMarketing() {
  const subject = (document.getElementById("mktSubject")?.value || "").trim();
  // Get HTML content from TinyMCE
  const editor = globalThis.tinymce?.get("mktBody");
  if (!editor) {
    showToast("Edytor nie jest gotowy.", "error");
    return;
  }
  const bodyHtml = editor.getContent();
  const statusEl = document.getElementById("mktSendStatus");
  if (!subject) { showToast("Podaj temat.", "error"); return; }
  if (!mktValidEmails.length) { showToast("Waliduj listę adresów przed wysyłką.", "error"); return; }

  const htmlBody = buildMarketingMailHtml({ template: mktActiveTpl, subject, bodyHtml });

  const confirmed = await confirmModal({
    text: `Wysłać wiadomość do ${mktValidEmails.length} odbiorców?`,
  });
  if (!confirmed) return;

  if (statusEl) statusEl.textContent = "Wysyłam…";
  document.getElementById("btnMktSend")?.setAttribute("disabled", "");

  try {
    const res = await adminFetch("/marketing/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: mktValidEmails, subject, template_id: mktActiveTpl, custom_body: htmlBody }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast(`Dodano do kolejki: ${json.queued}/${json.total}${json.skipped ? `; pominięto ${json.skipped} — powiadomienia wyłączone.` : ""}`, json.queued ? "success" : "info");
    if (statusEl) statusEl.textContent = "";
    if (!json.queued) return;
    
    // Clear email list after successful send
    const emailInput = document.getElementById("mktEmailInput");
    if (emailInput) emailInput.value = "";
    mktValidEmails = [];
    mktParseEmails();
  } catch (err) {
    if (statusEl) statusEl.textContent = "";
    showToast(String(err?.message || err), "error");
  } finally {
    document.getElementById("btnMktSend")?.removeAttribute("disabled");
  }
}

export function wireMarketingEvents() {
  // Template buttons
  document.querySelectorAll("#mktTemplateButtons [data-tpl]").forEach(btn => {
    btn.addEventListener("click", () => mktApplyTemplate(btn.dataset.tpl));
  });

  // Subject user-edited flag
  const subjectEl = document.getElementById("mktSubject");
  if (subjectEl) {
    subjectEl.addEventListener("input", () => { subjectEl._userEdited = true; });
  }

  // Parse on demand
  document.getElementById("btnMktParseEmails")?.addEventListener("click", mktParseEmails);

  // File input
  document.getElementById("mktFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const area = document.getElementById("mktEmailInput");
    if (area) area.value = (area.value ? area.value + "\n" : "") + text;
    mktParseEmails();
    e.target.value = "";
  });

  // Clear list
  document.getElementById("btnMktClearList")?.addEventListener("click", () => {
    mktValidEmails = [];
    const area = document.getElementById("mktEmailInput");
    if (area) area.value = "";
    const listWrap = document.getElementById("mktEmailListWrap");
    if (listWrap) listWrap.hidden = true;
    const countEl = document.getElementById("mktEmailCount");
    if (countEl) countEl.textContent = "";
  });

  // Toggle preview
  document.getElementById("btnMktTogglePreview")?.addEventListener("click", () => {
    mktPreviewVisible = !mktPreviewVisible;
    const wrap = document.getElementById("mktPreviewWrap");
    const btn  = document.getElementById("btnMktTogglePreview");
    if (wrap) wrap.hidden = !mktPreviewVisible;
    if (btn) btn.textContent = mktPreviewVisible
      ? ("Ukryj podgląd")
      : ("Pokaż podgląd");
    if (mktPreviewVisible) mktRefreshPreview();
  });

  document.getElementById("btnMktPreview")?.addEventListener("click", mktRefreshPreview);

  // Send
  document.getElementById("btnMktSend")?.addEventListener("click", sendMarketing);

  // Init default template
  mktApplyTemplate("invitation");
}

// Edytor treści maila marketingowego (TinyMCE) — przy pierwszym wejściu na kartę.
export function initMarketingEditor() {
  // Initialize TinyMCE for marketing message area
  const initMktTinyMCE = () => {
    if (!globalThis.tinymce) { loadTinyMce().then(initMktTinyMCE, () => showToast("Nie udało się wczytać edytora treści.", "error")); return; }
    const mktEl = document.getElementById("mktBody");
    if (!mktEl) { setTimeout(initMktTinyMCE, 200); return; }
    if (mktEl._tinyMCEInitialized) return;
    globalThis.tinymce.init({
      selector: "#mktBody", height: 400, menubar: "edit insert view format table tools",
      branding: false, promotion: false, license_key: "gpl",
      plugins: "lists link image table autoresize codesample",
      toolbar: "undo redo | fontsize | formatselect | bold italic forecolor backcolor | bullist numlist | link image | table | codesample | removeformat",
      fontsize_formats: "10px 11px 12px 13px 14px 15px 16px 18px 20px 22px 24px 26px 28px 32px 36px 48px",
      color_map: [
        "000000", "Czarny",
        "ffffff", "Biały",
        "ffeaa6", "Złoty Familiada",
        "050914", "Ciemny Familiada",
        "ff6b6b", "Czerwony",
        "4ecdc4", "Turkusowy",
        "45b7d1", "Niebieski",
        "96ceb4", "Zielony",
        "f7d794", "Żółty",
        "778ca3", "Szary"
      ],
      content_style: `
        body { background: #050914; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.4; }
        a { color: #ffeaa6; }
        table { border-collapse: collapse; width: 100%; }
        table td, table th { border: 1px solid rgba(255,255,255,.2); padding: 8px; }
        code, pre { background: rgba(255,234,166,.1); color: #ffeaa6; padding: 2px 6px; border-radius: 4px; }
      `,
      paste_data_images: true,
      images_upload_handler: (blobInfo) => new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blobInfo.blob()); }),
      setup: (editor) => { mktEl._tinyMCEInitialized = true; },
    });
  };
  return initMktTinyMCE;
}
