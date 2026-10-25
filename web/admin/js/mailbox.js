// admin/js/mailbox.js — Skrzynka i zgłoszenia: foldery, wiadomości, wątki, przypisania, pisanie.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { icon, iconText } from "../../shared/js/core/icons.js?v=v2026-10-25T00035";
import { buildStoredMailHtml } from "../../shared/js/core/stored-mail.js?v=v2026-10-25T00035";
import { confirmModal, promptModal } from "../../shared/js/core/modal.js?v=v2026-10-25T00035";
import { openDialog, closeDialog, handleSheetBack } from "../../shared/js/core/modal-sheet.js?v=v2026-10-25T00035";
import { initUiSelect } from "../../shared/js/core/ui-select.js?v=v2026-10-25T00035";
import { t } from "../../shared/translation/translation.js?v=v2026-10-25T00035";
import { buildComposeMailHtml } from "../../shared/js/core/compose-mail.js?v=v2026-10-25T00035";
import { adminFetch, btnBackSheet, escSetting, getEmailTemplates, loadTinyMce, showToast } from "./core.js?v=v2026-10-25T00035";
import { activeTab } from "./tabs.js?v=v2026-10-25T00035";
import { COMPOSE_LANGS, COMPOSE_LANG_META, buildEmailSignature, getComposeTemplateOptions, getFarewellOptions, getGreetingOptions, getSenderOptions, mailSourceIcon } from "./mail-settings.js?v=v2026-10-25T00035";
import { emptyStateHtml } from "../../shared/js/core/empty-state.js?v=v2026-10-25T00035";

// helper — fetch do /_admin_api/*
// ============================================================
// REPORTS ADMIN
// ============================================================

// ── Mail client state ──────────────────────────────────────────
let msgActiveFolder  = "inbox";  // inbox | sent | trash | reports | <report-uuid>
let msgActiveId      = null;     // aktywna wiadomość lub zgłoszenie
let msgRows          = [];       // lista wiadomości lub zgłoszeń
let msgSearchQuery   = "";
let msgReports       = [];       // cache zgłoszeń (do assign select)

export async function loadMailFolder({ silent = false } = {}) {
  try {
    if (msgActiveFolder === "reports") {
      const res = await adminFetch("/reports?status=all&limit=100");
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      msgRows = json.rows || [];
    } else if (msgActiveFolder === "marketing") {
      // Fetch ALL messages and filter for marketing (outbound + inbound replies)
      const res = await adminFetch(`/messages?filter=all&limit=500`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("[loadMailFolder] Marketing fetch ERROR:", errorText);
        throw new Error(errorText);
      }
      const json = await res.json();
      // Filter for marketing emails by is_marketing flag (includes replies to marketing)
      msgRows = (json.rows || []).filter(m =>
        m.is_marketing === true  // Both outbound campaigns AND inbound replies
      );
    } else {
      const res = await adminFetch(`/messages?filter=${encodeURIComponent(msgActiveFolder)}&limit=500`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("[loadMailFolder] Folder fetch ERROR:", errorText);
        throw new Error(errorText);
      }
      const json = await res.json();
      msgRows = json.rows || [];
      
      // For "sent" folder, also include marketing emails
      if (msgActiveFolder === "sent") {
        const marketingEmails = msgRows.filter(m =>
          m.direction === "outbound" &&
          m.is_marketing === true
        );
        // If we have marketing emails, reload from "all" to get everything
        if (marketingEmails.length > 0) {
          try {
            const allRes = await adminFetch(`/messages?filter=all&limit=500`);
            if (allRes.ok) {
              const allJson = await allRes.json();
              const allOutbound = (allJson.rows || []).filter(m => m.direction === "outbound");
              msgRows = allOutbound;
              msgRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
          } catch (e) { console.error("[loadMailFolder] sent merge error:", e); }
        }
      }
    }
    renderMailList(msgRows);
    // Refresh badge counts after loading folder
    loadFolderBadges();
  } catch (err) {
    if (!silent) showToast(String(err?.message || err), "error");
  }
}

function updateFolderBadges(inboxUnread, reportsOpen) {
  // Update badge elements with provided counts
  const badgeInbox = document.getElementById("badgeInbox");
  const badgeReports = document.getElementById("badgeReports");
  
  // Liczniki = wspólny licznik powiadomień (.badge z base.css; pusty = schowany).
  if (badgeInbox) {
    badgeInbox.textContent = inboxUnread > 99 ? "99+" : String(inboxUnread || "");
  }
  
  if (badgeReports) {
    badgeReports.textContent = reportsOpen > 99 ? "99+" : String(reportsOpen || "");
  }
  // Zakładka „Poczta Familiada” w topbarze: nieprzeczytane + otwarte zgłoszenia
  // (licznik trafia też na „Więcej” i do menu na telefonie -- topbar-controller).
  setCountBadge("tabBadgeReports", inboxUnread + reportsOpen);
}

function setCountBadge(id, count) {
  const el = document.getElementById(id);
  if (el) el.textContent = count > 99 ? "99+" : String(count || "");
}

// Gry Społeczności czekające na zatwierdzenie: zakładka w topbarze
// i „Do zatwierdzenia” (bez gier producenta, jak lista).
export async function loadMarketPendingBadge() {
  try {
    const res = await adminFetch("/marketplace/list?status=pending");
    if (!res.ok) return;
    const json = await res.json();
    const count = (json.rows || []).filter((r) => r.origin !== "producer").length;
    setCountBadge("tabBadgeMarketplace", count);
    setCountBadge("badgeMarketPending", count);
  } catch (e) {
    console.error("[loadMarketPendingBadge] error:", e);
  }
}

// Liczniki powiadomień odświeżane w tle (karta widoczna), jak na innych stronach.
export function startAdminBadges() {
  const refresh = () => { loadFolderBadges(); loadMarketPendingBadge(); };
  refresh();
  setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
}

// Load unread counts on initial load and after folder changes
async function loadFolderBadges() {
  try {
    // Fetch inbox unread count
    const inboxRes = await adminFetch("/messages?filter=inbox&limit=100");
    let inboxUnread = 0;
    if (inboxRes.ok) {
      const inboxJson = await inboxRes.json();
      inboxUnread = (inboxJson.rows || []).filter(r => 
        !r.report_id && r.direction === "inbound" && !r.is_read
      ).length;
    }
    
    // Fetch reports open count
    const reportsRes = await adminFetch("/reports?status=all&limit=100");
    let reportsOpen = 0;
    if (reportsRes.ok) {
      const reportsJson = await reportsRes.json();
      reportsOpen = (reportsJson.rows || []).filter(r => 
        r.status === "open"
      ).length;
    }
    
    // Update badge elements
    updateFolderBadges(inboxUnread, reportsOpen);
  } catch (e) {
    console.error("[loadFolderBadges] error:", e);
  }
}

function isMarketingEmail(m) {
  // Check if message is a marketing email by is_marketing flag
  // This includes both outbound campaigns AND inbound replies (auto-tagged)
  return m.is_marketing === true;
}

function stripMarketingPrefix(subject) {
  // Remove [Marketing] prefix from subject for display
  return (subject || "").replace(/^\[Marketing\]\s*/i, "").trim();
}

function extractHtmlPreviewText(html) {
  // element.textContent includes the raw text of <style>/<script> children
  // (they're just text nodes to the DOM) - strip them first so CSS source
  // like "P {margin-top:0;...}" doesn't leak into the preview.
  // DOMParser tworzy dokument nieaktywny: obrazy się nie ładują, a atrybuty
  // typu onerror nie wykonują się (innerHTML na elemencie odpiętym — tak).
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("style, script").forEach((el) => el.remove());
  return (doc.body?.textContent || "").trim();
}

function renderMailList(rows) {
  const body = document.getElementById("mailListBody");
  if (!body) return;
  const q = msgSearchQuery.toLowerCase();
  const filtered = q
    ? rows.filter(r =>
        (r.from_email || r.to_email || "").toLowerCase().includes(q) ||
        (r.subject || "").toLowerCase().includes(q) ||
        (r.ticket_number || "").toLowerCase().includes(q)
      )
    : rows;

  body.innerHTML = "";

  if (msgActiveFolder === "trash" && !filtered.length) {
    body.innerHTML = `${emptyStateHtml("Kosz jest pusty")}
      <div class="mail-list-note">Elementy starsze niż 30 dni są usuwane automatycznie</div>
      <div class="mail-list-note mail-list-note--action">
        <button class="btn sm mail-trash-cleanup" id="btnCleanupTrashInList" type="button">Wyczyść kosz (30d)</button>
      </div>`;
    document.getElementById("btnCleanupTrashInList")?.addEventListener("click", cleanupTrash);
    return;
  }

  // Trash with items: add cleanup button at bottom
  if (msgActiveFolder === "trash" && filtered.length) {
    const trashFooter = document.createElement("div");
    trashFooter.className = "mail-trash-footer";
    trashFooter.innerHTML = `<button class="btn sm mail-trash-cleanup" id="btnCleanupTrashInList" type="button">Wyczyść kosz (30d)</button>`;
    body.parentNode.appendChild(trashFooter);
    document.getElementById("btnCleanupTrashInList")?.addEventListener("click", cleanupTrash);
  }

  if (!filtered.length) {
    body.innerHTML = emptyStateHtml("Brak wiadomości");
    return;
  }

  if (msgActiveFolder === "reports") {
    for (const r of filtered) {
      const item = document.createElement("div");
      const isOpen = r.status === "open";
      item.className = "mail-thread-item" + (isOpen ? " unread" : "") + (r.id === msgActiveId ? " active" : "");
      item.dataset.reportId = r.id;
      const dateStr = new Date(r.created_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"2-digit" });
      const badge = isOpen
        ? `<span class="tag tag--gold">open</span>`
        : `<span class="tag tag--muted">closed</span>`;
      // Zgłoszenie zostaje po usunięciu konta autora (decyzja 2026-10-23) -- tylko plakietka.
      const deletedBadge = r.author_account_deleted_at
        ? `<span title="Autor usunął konto ${escSetting(new Date(r.author_account_deleted_at).toLocaleDateString("pl-PL"))}" class="tag tag--bad">konto usunięte</span>`
        : "";
      item.innerHTML = `
        <div class="mail-ti-row">
          <span class="mail-ti-from">${escSetting(r.ticket_number)}</span>
          <span class="mail-ti-date">${dateStr}</span>
        </div>
        <div class="mail-ti-subject mail-ti-subject--report">${badge}${deletedBadge} ${escSetting(r.subject || "—")}</div>
        <div class="mail-ti-preview mail-ti-preview--dim">${escSetting(String(r.message_count || 0))} msg</div>`;
      item.addEventListener("click", () => openReport(r.id));
      body.appendChild(item);
    }
    return;
  }

  if (msgActiveFolder === "marketing") {
    for (const r of filtered) {
      const item = document.createElement("div");
      const isInbound = r.direction === "inbound";
      item.className = "mail-thread-item" + (isInbound ? "" : "") + (r.id === msgActiveId ? " active" : "");
      item.dataset.msgId = r.id;
      const dateStr = new Date(r.created_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"2-digit" });
      const fromTo = isInbound
        ? `${icon("envelope-in")} ${escSetting(r.from_email || "—")}`
        : `${icon("megaphone")} ${escSetting(r.to_email || "Kampania")}`;

      // Marketing badge for ALL marketing emails (already filtered by is_marketing flag)
      const marketingBadge = isMarketingEmail(r)
        ? `<span class="tag tag--gold">marketing</span>`
        : "";

      // Strip [Marketing] prefix from subject
      const displaySubject = stripMarketingPrefix(r.subject);
      // Ticket number badge for messages with tickets
      const ticketBadge = r.ticket_number ? `<span class="tag tag--gold mail-ti-ticket-badge">${escSetting(r.ticket_number)}</span>` : "";

      item.innerHTML = `
        <div class="mail-ti-row">
          <span class="mail-ti-from">${fromTo}</span>
          <span class="mail-ti-date">${dateStr}</span>
        </div>
        <div class="mail-ti-subject mail-ti-subject--tags">${ticketBadge}${marketingBadge}${escSetting(displaySubject || "—")}</div>
        <div class="mail-ti-preview mail-ti-preview--dim">${isInbound ? 'Odpowiedź na kampanię' : 'Kampania marketingowa'}</div>`;
      item.addEventListener("click", () => openMessage(r.id));
      body.appendChild(item);
    }
    return;
  }

  for (const r of filtered) {
    const item = document.createElement("div");
    const isInbound = r.direction === "inbound";
    item.className = "mail-thread-item" + (!r.report_id && isInbound && !r.is_read ? " unread" : "") + (r.id === msgActiveId ? " active" : "");
    item.dataset.msgId = r.id;
    const dateStr = new Date(r.created_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"2-digit" });
    const sourceBadge = mailSourceIcon(r.source);
    const from = isInbound ? (r.from_email || "—") : (r.to_email || "—");

    // Ticket number badge for messages with tickets - displayed prominently
    const ticketBadge = r.ticket_number ? `<span class="tag tag--gold mail-ti-ticket-badge">${escSetting(r.ticket_number)}</span>` : "";

    // Marketing badge for ALL marketing emails (outbound campaigns + inbound replies)
    const marketingBadge = isMarketingEmail(r)
      ? `<span class="tag tag--gold">marketing</span>`
      : "";

    // Strip [Marketing] prefix from subject
    const displaySubject = stripMarketingPrefix(r.subject);
    
    // Extract ALL text from message for preview - show EVERYTHING
    let previewText = "";

    // Strategy 1: Try body_html first (has full HTML email)
    if (r.body_html) {
      previewText = extractHtmlPreviewText(r.body_html);
    }

    // Strategy 2: Try body (might be plain text or HTML)
    if (!previewText && r.body) {
      if (r.body.trim().startsWith("<")) {
        // HTML - extract ALL text
        previewText = extractHtmlPreviewText(r.body);
      } else {
        // Plain text
        previewText = r.body.trim();
      }
    }

    // Strategy 3: Final fallback - body_preview
    if (!previewText && r.body_preview) {
      // Aggressively strip <style> tags, HTML tags, and CSS content
      previewText = r.body_preview
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove <style> blocks
        .replace(/:[^;]+;/g, '')  // Remove CSS properties like :root{color-scheme:dark}
        .replace(/^[^a-zA-Z0-9]*[A-Z]{2,}[^a-zA-Z0-9]*/g, '')  // Remove leading CSS like :root{...}FAMILIADA
        .replace(/<[^>]*>/g, ' ')  // Strip remaining HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);  // Limit length
    }

    // Strategy 4: Emergency fallback - use subject if no content
    if (!previewText) {
      previewText = r.subject ? `(brak treści) ${r.subject}` : `(brak treści)`;
    }

    // Minimal cleanup - just normalize whitespace and limit length
    previewText = previewText
      .replace(/\n\s*\n/g, '\n')  // Remove empty lines
      .replace(/\s+/g, ' ')  // Collapse whitespace
      .slice(0, 80)  // Limit length
      .trim();

    item.innerHTML = `
      <div class="mail-ti-row">
        <span class="mail-ti-from">${sourceBadge} ${escSetting(from)}</span>
        <span class="mail-ti-date">${dateStr}</span>
      </div>
      <div class="mail-ti-subject mail-ti-subject--tags">${ticketBadge}${marketingBadge}${escSetting(displaySubject || "—")}</div>
      <div class="mail-ti-preview">${escSetting(previewText)}</div>`;
    item.addEventListener("click", () => openMessage(r.id));
    body.appendChild(item);
  }
}

async function openMessage(id) {
  
  msgActiveId = id;
  document.querySelectorAll(".mail-thread-item").forEach(el => {
    el.classList.toggle("active", el.dataset.msgId === id);
  });

  // Mark message as read
  try {
    const readRes = await adminFetch(`/messages/read?id=${encodeURIComponent(id)}`, { method: "POST" });
    
    if (!readRes.ok) {
      const readText = await readRes.text().catch(() => "N/A");
      console.error("[openMessage] /messages/read failed:", readRes.status, readText);
    }
    
    // Refresh badges and list after marking as read
    loadFolderBadges();
    loadMailFolder({ silent: true });
  } catch (e) {
    console.error("[openMessage] Error marking as read:", e);
  }

  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = `<div class="mail-conv-placeholder">Ładowanie…</div>`;

  try {
    const res = await adminFetch(`/messages/detail?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);

    const msg = json.message;

    // Fetch conversation thread (Apple Mail style - all messages in the same conversation)
    let threadMessages = [];
    try {
      const threadRes = await adminFetch(`/messages?filter=all&limit=500`);
      if (threadRes.ok) {
        const threadJson = await threadRes.json();
        const allMessages = threadJson.rows || [];
        
        // Find conversation by subject line (strip Re:/Fwd:/etc.)
        const baseSubject = msg.subject?.replace(/^(Re|Fwd|FW):\s*/gi, '').trim().toLowerCase();
        
        // Debug: log all subjects for comparison

        
        // Find all messages in this conversation
        threadMessages = allMessages.filter(m => {
          if (m.id === id) return false; // Exclude the central message (we render it separately)

          // Same ticket/report - highest priority
          if (msg.ticket_number && m.ticket_number === msg.ticket_number) {
            return true;
          }
          if (msg.report_id && m.report_id === msg.report_id) {
            return true;
          }

          // Same subject conversation + same participants (from/to)
          // This ensures we don't mix emails with same subject but different recipients
          if (baseSubject && baseSubject.length > 5 && m.subject) {
            const mSubject = m.subject.replace(/^(Re|Fwd|FW):\s*/gi, '').trim().toLowerCase();
            
            // Check if subjects match
            if (mSubject === baseSubject) {
              // Check if participants match (same conversation thread)
              const msgParticipants = new Set([
                (msg.from_email || "").toLowerCase(),
                (msg.to_email || "").toLowerCase()
              ]);
              const mParticipants = new Set([
                (m.from_email || "").toLowerCase(),
                (m.to_email || "").toLowerCase()
              ]);
              
              // Check if there's overlap in participants (at least one common email)
              const hasCommonParticipant = [...msgParticipants].some(p => 
                p && mParticipants.has(p)
              );
              
              if (hasCommonParticipant) {
                return true;
              } else {

              }
            } else {
            }
          }

          return false;
        });
        
        
        // Debug: show found messages with dates
        if (threadMessages.length > 0) {

        }
        
        // Sort by date (oldest first)
        threadMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      } else {
        console.error("[openMessage] Thread fetch failed:", threadRes.status);
      }
    } catch (e) { 
      console.error("[openMessage] Thread fetch error:", e); 
    }

    let attachments = [];
    try {
      const attRes = await adminFetch(`/attachments?message_id=${encodeURIComponent(id)}`);
      if (attRes.ok) {
        const attJson = await attRes.json();
        attachments = attJson.attachments || [];
      }
    } catch (e) { console.error("[openMessage] Attachments error:", e); }

    renderMessageDetail(msg, attachments, threadMessages);
  } catch (err) {
    console.error("[openMessage] Error:", err);
    showToast(String(err?.message || err), "error");
    conv.innerHTML = "";
  }
}

function showAttachmentPreview(url, filename) {
  let overlay = document.getElementById("attPreviewOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "attPreviewOverlay";
    overlay.className = "att-preview-overlay";
    overlay.addEventListener("click", () => {
      URL.revokeObjectURL(overlay.querySelector("img")?.src || "");
      overlay.remove();
    });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="att-preview">
    <img src="${url}" alt="${escSetting(filename)}">
    <a href="${url}" download="${escSetting(filename)}" onclick="event.stopPropagation()">Pobierz</a>
  </div>`;
}

// Podgląd maili (także przychodzących): bez skryptów i bez wspólnego
// origin (audyt E24, Ś6). Linki otwierają się w nowej karcie jak zwykle.
const MAIL_FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

function renderSimpleMessageContent(bubble, msg) {
  const bodyEl = document.createElement("div");
  const htmlSrc = msg.body_html;
  if (htmlSrc) {
    bodyEl.className = "mail-msg-body-html";
    const frame = document.createElement("iframe");
    frame.className = "mail-msg-html-frame";
    frame.sandbox = MAIL_FRAME_SANDBOX;
    const wrappedHtml = buildStoredMailHtml(msg);
    frame.srcdoc = wrappedHtml;
    bodyEl.appendChild(frame);
  } else {
    bodyEl.className = "mail-msg-body";
    bodyEl.textContent = msg.body || "";
  }
  bubble.appendChild(bodyEl);
}

function renderMessageDetail(msg, attachments = [], threadMessages = []) {
  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = "";

  const isInbound = msg.direction === "inbound";
  const sourceLabelMap = {
    email:   "E-mail",
    form:    "Formularz",
    compose: "Wiadomość",
  };
  const sourceLabel = sourceLabelMap[msg.source] || msg.source;
  const from = isInbound ? msg.from_email : msg.to_email;

  const header = document.createElement("div");
  header.className = "mail-conv-header";

  
  let ticketBadge = "";
  if (msg.ticket_number) {
    ticketBadge = `<span class="tag tag--gold mail-ticket-badge" data-report-id="${escSetting(msg.report_id)}" title="Przejdź do zgłoszenia">${escSetting(msg.ticket_number)}</span>`;
  }
  
  // Marketing badge for conversation header
  let marketingBadge = "";
  if (msg.is_marketing) {
    marketingBadge = `<span class="tag tag--gold mail-tag-after">marketing</span>`;
  }

  header.innerHTML = `
    <div class="mail-conv-subject">${escSetting(msg.subject || "—")}</div>
    <div class="mail-conv-meta">
      ${isInbound ? ("Od:") : ("Do:")} ${escSetting(from || "—")} · ${new Date(msg.created_at).toLocaleString("pl-PL")} · ${escSetting(sourceLabel)}${ticketBadge}${marketingBadge}
    </div>`;
  conv.appendChild(header);

  // Container for all messages (scrollable)
  const msgs = document.createElement("div");
  msgs.className = "mail-conv-messages";

  // Render earlier messages (above the central message)
  const earlierMessages = threadMessages.filter(m => new Date(m.created_at) < new Date(msg.created_at));
  if (earlierMessages.length > 0) {

  }
  for (const threadMsg of earlierMessages) {
    const threadBubble = document.createElement("div");
    threadBubble.className = `mail-msg ${threadMsg.direction === "inbound" ? "inbound" : "outbound"} mail-msg-thread`;
    renderSimpleMessageContent(threadBubble, threadMsg);
    msgs.appendChild(threadBubble);
  }

  // Render current message (central with gold accent)
  const bubble = document.createElement("div");
  bubble.className = `mail-msg ${isInbound ? "inbound" : "outbound"} mail-msg-central`;

  const bodyEl = document.createElement("div");
  const htmlSrc = msg.body_html;
  if (htmlSrc) {
    bodyEl.className = "mail-msg-body-html";
    const frame = document.createElement("iframe");
    frame.className = "mail-msg-html-frame";
    frame.sandbox = MAIL_FRAME_SANDBOX;
    const wrappedHtml = buildStoredMailHtml(msg);
    frame.srcdoc = wrappedHtml;
    bodyEl.appendChild(frame);
  } else {
    bodyEl.className = "mail-msg-body";
    bodyEl.textContent = msg.body || "";
  }
  bubble.appendChild(bodyEl);
  
  // Double-click bubble to preview message (shows rendered HTML)
  bubble.addEventListener("dblclick", () => {
    const htmlSrc = msg.body_html || msg.body;
    const subject = msg.subject || "(brak tematu)";

    // Preview the saved document without nesting or overriding its theme.
    const emailHtml = buildStoredMailHtml(msg);

    const frame = document.createElement("iframe");
    frame.className = "mail-html-frame";
    frame.sandbox = MAIL_FRAME_SANDBOX;
    frame.srcdoc = emailHtml;

    // Create wrapper with dark background (matches email theme #050914)
    const wrapper = document.createElement("div");
    wrapper.className = "compose-preview-wrapper";
    
    // Zamknięcie: przez standardowy, wbudowany "✕" w nagłówku modala
    // (ten sam wygląd we wszystkich modalach) — bez własnego duplikatu.
    wrapper.appendChild(frame);

    void confirmModal({
      title: `Podgląd wiadomości - ${new Date(msg.created_at).toLocaleString("pl-PL")}`,
      text: "",
      body: wrapper,
      okText: "",
      showCancel: false,
      sheet: { backBtn: document.getElementById("btnMailBackTopbar") || btnBackSheet, keepBackBtnText: true },
    });
  });

  // Attachments (non-inline)
  const nonInline = attachments.filter(a => !a.inline);
  if (nonInline.length) {
    const attList = document.createElement("div");
    attList.className = "att-list";
    for (const att of nonInline) {
      const chip = document.createElement("a");
      chip.href = "#";
      const isExpired = !!att.expired;
      const isImage = att.mime_type?.startsWith("image/");
      const isPdf   = att.mime_type === "application/pdf";

      if (isExpired) {
        chip.className = "att-chip is-expired";
        chip.innerHTML = `${icon("file-expired")}${escSetting(att.filename)} <span class="att-chip-note">— załącznik wygasł</span>`;
      } else {
        chip.className = "att-chip";
        const attIcon = isImage
          ? `${icon("image")}`
          : isPdf
          ? `${icon("file-doc")}`
          : `${icon("paperclip")}`;
        chip.innerHTML = `${attIcon}${escSetting(att.filename)} <span class="att-chip-type">${escSetting(att.mime_type.split('/')[1] || '')}</span>`;
        chip.addEventListener("click", async (e) => {
          e.preventDefault();
          try {
            chip.setAttribute("aria-busy", "true");
            const res = await adminFetch(`/attachments/download?id=${encodeURIComponent(att.id)}`);
            chip.removeAttribute("aria-busy");
            if (!res.ok) { showToast("Błąd pobierania.", "error"); return; }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (isImage) {
              showAttachmentPreview(url, att.filename);
            } else if (isPdf) {
              window.open(url, "_blank");
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            } else {
              const a2 = document.createElement("a");
              a2.href = url; a2.download = att.filename; a2.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            }
          } catch(e) { chip.removeAttribute("aria-busy"); showToast("Błąd pobierania.", "error"); }
        });
      }
      attList.appendChild(chip);
    }
    bubble.appendChild(attList);
  }

  // Add central message to the scrollable container
  msgs.appendChild(bubble);

  // Render later messages (below the central message)
  const laterMessages = threadMessages.filter(m => new Date(m.created_at) > new Date(msg.created_at));
  if (laterMessages.length > 0) {

  }
  for (const threadMsg of laterMessages) {
    const threadBubble = document.createElement("div");
    threadBubble.className = `mail-msg ${threadMsg.direction === "inbound" ? "inbound" : "outbound"} mail-msg-thread`;
    renderSimpleMessageContent(threadBubble, threadMsg);
    msgs.appendChild(threadBubble);
  }

  // Add scrollable messages container to conv
  conv.appendChild(msgs);

  // Action bar — icon buttons (fixed at bottom, outside scrollable area)
  const actions = document.createElement("div");
  actions.className = "mail-msg-actions";

  // Left group: assign/unassign + marketing toggle + reply
  const leftGroup = document.createElement("div");
  leftGroup.className = "mail-msg-actions-group";

  // Assign/unassign ticket
  if (!msg.report_id) {
    const btnAssign = document.createElement("button");
    btnAssign.className = "btn sm icon gold";
    btnAssign.type = "button";
    btnAssign.title = "Przydziel zgłoszenie";
    btnAssign.innerHTML = `${icon("tag")}`;
    btnAssign.addEventListener("click", () => assignReport(msg));
    leftGroup.appendChild(btnAssign);
  } else {
    const btnUnassign = document.createElement("button");
    btnUnassign.className = "btn sm icon is-active";
    btnUnassign.type = "button";
    btnUnassign.title = `${escSetting(msg.ticket_number || "")} — odepnij`;
    btnUnassign.innerHTML = `${icon("tag")}`;
    btnUnassign.addEventListener("click", () => unassignReport(msg.id));
    leftGroup.appendChild(btnUnassign);
  }

  // Toggle marketing flag - megaphone/bullhorn icon
  const btnMarketing = document.createElement("button");
  btnMarketing.className = `btn sm icon${msg.is_marketing ? " is-active" : ""}`;
  btnMarketing.type = "button";
  btnMarketing.title = msg.is_marketing ? "Oznacz jako zwykłą wiadomość" : "Oznacz jako marketing";
  // Megaphone icon - rectangle handle (longer) + trapezoid horn (bigger)
  btnMarketing.innerHTML = msg.is_marketing
    ? `${icon("megaphone")}`
    : `${icon("megaphone")}`;
  btnMarketing.addEventListener("click", () => toggleMarketing(msg.id, !msg.is_marketing));
  leftGroup.appendChild(btnMarketing);

  if (isInbound && msg.from_email) {
    const btnReply = document.createElement("button");
    btnReply.className = "btn sm icon";
    btnReply.type = "button";
    btnReply.title = "Odpowiedz";
    btnReply.innerHTML = `${icon("reply")}`;
    btnReply.addEventListener("click", () => showCompose({ to: msg.from_email, subject: `Re: ${stripMarketingPrefix(msg.subject || "")}`, report_id: msg.report_id, quote: msg.body, quoteFrom: msg.from_email, quoteDate: msg.created_at }));
    leftGroup.appendChild(btnReply);
  } else if (!isInbound && msg.to_email) {
    // Reply button for outbound messages (pencil icon)
    const btnReply = document.createElement("button");
    btnReply.className = "btn sm icon";
    btnReply.type = "button";
    btnReply.title = "Napisz odpowiedź";
    btnReply.innerHTML = `${icon("edit-paper")}`;
    btnReply.addEventListener("click", () => showCompose({ to: msg.to_email, subject: `Re: ${stripMarketingPrefix(msg.subject || "")}`, report_id: msg.report_id, quote: msg.body, quoteFrom: msg.to_email, quoteDate: msg.created_at }));
    leftGroup.appendChild(btnReply);
  }

  actions.appendChild(leftGroup);

  // Right group: trash / restore + delete
  const rightGroup = document.createElement("div");
  rightGroup.className = "mail-msg-actions-group mail-msg-actions-group--end";

  if (!msg.deleted_at) {
    const btnTrash = document.createElement("button");
    btnTrash.className = "btn sm icon danger";
    btnTrash.type = "button";
    btnTrash.title = "Do kosza";
    btnTrash.innerHTML = `${icon("trash")}`;
    btnTrash.addEventListener("click", () => trashMessage(msg.id));
    rightGroup.appendChild(btnTrash);
  } else {
    const btnRestore = document.createElement("button");
    btnRestore.className = "btn sm icon";
    btnRestore.type = "button";
    btnRestore.title = "Przywróć";
    btnRestore.innerHTML = `${icon("restore")}`;
    btnRestore.addEventListener("click", () => restoreMessage(msg.id));
    rightGroup.appendChild(btnRestore);

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn sm icon danger";
    btnDelete.type = "button";
    btnDelete.title = "Usuń na zawsze";
    btnDelete.innerHTML = `${icon("trash-forever")}`;
    btnDelete.addEventListener("click", () => deleteForever(msg.id));
    rightGroup.appendChild(btnDelete);
  }

  actions.appendChild(rightGroup);
  conv.appendChild(msgs);      // Messages container FIRST
  conv.appendChild(actions);   // Actions at BOTTOM (after msgs)

  // click on ticket badge → open report
  conv.querySelector(".mail-ticket-badge")?.addEventListener("click", (e) => {
    const rid = e.currentTarget.dataset.reportId;
    if (rid) {
      msgActiveFolder = "reports";
      document.querySelectorAll(".mail-folder").forEach(f => {
        f.classList.toggle("active", f.dataset.folder === "reports");
      });
      loadMailFolder({ silent: true }).then(() => openReport(rid));
    }
  });
}

async function openReport(id) {
  msgActiveId = id;
  document.querySelectorAll(".mail-thread-item").forEach(el => {
    el.classList.toggle("active", el.dataset.reportId === id);
  });

  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = `<div class="mail-conv-placeholder">Ładowanie…</div>`;

  try {
    const res = await adminFetch(`/reports/messages?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    const messages = json.messages || [];

    // Fetch attachments for each message in parallel
    const attsByMsg = {};
    await Promise.all(messages.map(async (msg) => {
      try {
        const attRes = await adminFetch(`/attachments?message_id=${encodeURIComponent(msg.id)}`);
        if (attRes.ok) {
          const attJson = await attRes.json();
          attsByMsg[msg.id] = attJson.attachments || [];
        } else {
          console.error("[openReport] attachments fetch failed:", msg.id, attRes.status);
        }
      } catch (e) { console.error("[openReport] attachments error:", msg.id, e); }
    }));

    const report = msgRows.find(r => r.id === id) || null;
    renderReportThread(report, messages, attsByMsg);
  } catch (err) {
    showToast(String(err?.message || err), "error");
    conv.innerHTML = "";
  }
}

function renderReportThread(report, messages, attsByMsg = {}) {
  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = "";

  const isOpen = !report || report.status === "open";
  const ticketNum = report?.ticket_number || "—";
  const statusLabel = isOpen
    ? ("Otwarte")
    : ("Zamknięte");

  const header = document.createElement("div");
  header.className = "mail-conv-header";
  header.innerHTML = `
    <div class="mail-conv-subject">${escSetting(ticketNum)} <span class="mail-conv-status">${escSetting(statusLabel)}</span></div>
    <div class="mail-conv-meta">${escSetting(report?.subject || "—")}</div>
    <div class="mail-conv-actions">
      ${report
        ? isOpen
          ? `<button class="btn sm danger" id="btnReportClose" type="button">Zamknij zgłoszenie</button>`
          : `<button class="btn sm" id="btnReportOpen" type="button">Otwórz zgłoszenie</button>`
        : ""}
    </div>`;
  conv.appendChild(header);

  const msgs = document.createElement("div");
  msgs.className = "mail-conv-messages";
  msgs.id = "mailConvMessages";

  for (const msg of messages) {
    const isOut = msg.direction === "outbound";
    const el = document.createElement("div");
    el.className = `mail-msg ${isOut ? "outbound" : "inbound"}`;
    const metaEl = document.createElement("div");
    metaEl.className = "mail-msg-meta";
    const from = isOut ? (msg.to_email || "—") : (msg.from_email || "—");
    const sourceBadge = mailSourceIcon(msg.source);
    metaEl.innerHTML = `<span>${icon(isOut ? "envelope-out" : "envelope-in")} ${escSetting(from)} · ${new Date(msg.created_at).toLocaleString("pl-PL")} ${sourceBadge}</span>`;
    el.appendChild(metaEl);

    const bodyEl = document.createElement("div");
    const htmlSrc = msg.body_html;
    if (htmlSrc) {
      bodyEl.className = "mail-msg-body-html";
      const frame = document.createElement("iframe");
      frame.className = "mail-msg-html-frame";
      frame.sandbox = MAIL_FRAME_SANDBOX;
        const wrappedHtml = buildStoredMailHtml(msg);
      frame.srcdoc = wrappedHtml;
      bodyEl.appendChild(frame);
    } else {
      bodyEl.className = "mail-msg-body";
      bodyEl.textContent = msg.body || "";
    }
    el.appendChild(bodyEl);

    // Double-click to preview message (shows rendered HTML - dark theme)
    el.addEventListener("dblclick", () => {
      const htmlSrc = msg.body_html || msg.body;
      const subject = msg.subject || "(brak tematu)";

      // Preview the saved document without nesting or overriding its theme.
      const emailHtml = buildStoredMailHtml(msg);

      const frame = document.createElement("iframe");
      frame.className = "mail-html-frame";
      frame.sandbox = MAIL_FRAME_SANDBOX;
      frame.srcdoc = emailHtml;

      // Create wrapper with dark background (matches email theme #050914)
      const wrapper = document.createElement("div");
      wrapper.className = "compose-preview-wrapper";
      
      // Zamknięcie: przez standardowy, wbudowany "✕" w nagłówku modala
      // (ten sam wygląd we wszystkich modalach) — bez własnego duplikatu.
      wrapper.appendChild(frame);

      void confirmModal({
        title: `Podgląd wiadomości - ${new Date(msg.created_at).toLocaleString("pl-PL")}`,
        text: "",
        body: wrapper,
        okText: "",
        showCancel: false,
        sheet: { backBtn: document.getElementById("btnMailBackTopbar") || btnBackSheet, keepBackBtnText: true },
      });
    });

    // Attachments for this message
    const msgAtts = (attsByMsg[msg.id] || []).filter(a => !a.inline);
    if (msgAtts.length) {
      const attList = document.createElement("div");
      attList.className = "att-list att-list--report";
      for (const att of msgAtts) {
        const chip = document.createElement("a");
        chip.href = "#";
        const isExpired = !!att.expired;
        const isImage = att.mime_type?.startsWith("image/");
        const isPdf   = att.mime_type === "application/pdf";
        if (isExpired) {
          chip.className = "att-chip is-expired";
          chip.innerHTML = `${icon("file-expired")}${escSetting(att.filename)} <span class="att-chip-note">— załącznik wygasł</span>`;
        } else {
          chip.className = "att-chip";
          const attIcon = isImage
            ? `${icon("image")}`
            : `${icon("paperclip")}`;
          chip.innerHTML = `${attIcon}${escSetting(att.filename)} <span class="att-chip-type">${escSetting(att.mime_type.split("/")[1] || "")}</span>`;
          chip.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
              chip.setAttribute("aria-busy", "true");
              const res = await adminFetch(`/attachments/download?id=${encodeURIComponent(att.id)}`);
              chip.removeAttribute("aria-busy");
              if (!res.ok) { showToast("Błąd pobierania.", "error"); return; }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              if (isImage) {
                showAttachmentPreview(url, att.filename);
              } else if (isPdf) {
                window.open(url, "_blank");
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              } else {
                const a2 = document.createElement("a");
                a2.href = url; a2.download = att.filename; a2.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              }
            } catch(e) { chip.removeAttribute("aria-busy"); showToast("Błąd pobierania.", "error"); }
          });
        }
        attList.appendChild(chip);
      }
      el.appendChild(attList);
    }

    msgs.appendChild(el);
  }
  if (!messages.length) {
    msgs.innerHTML = emptyStateHtml("Brak wiadomości");
  }
  conv.appendChild(msgs);
  setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);

  // Reply button - opens full compose window
  const replyButtonSection = document.createElement("div");
  replyButtonSection.className = "report-reply-section";
  replyButtonSection.innerHTML = `
    <button class="btn gold report-reply-btn" id="btnReportReply" type="button">
      ${icon("edit-paper")} Odpowiedz
    </button>
  `;
  conv.appendChild(replyButtonSection);

  if (report) {
    document.getElementById("btnReportClose")?.addEventListener("click", () => toggleReportStatus(report.id, "open"));
    document.getElementById("btnReportOpen")?.addEventListener("click",  () => toggleReportStatus(report.id, "closed"));
  }
  
  document.getElementById("btnReportReply")?.addEventListener("click", () => {
    // Open full compose window for reply
    const lastInbound = [...messages].reverse().find(m => m.direction === "inbound");
    const to = lastInbound?.from_email;
    const quote = lastInbound?.body || "";
    const quoteDate = lastInbound?.created_at;
    const quoteFrom = lastInbound?.from_email;
    
    showCompose({
      to: to || "",
      subject: `Re: [${ticketNum}] ${report?.subject || ""}`,
      body: "",
      quote,
      quoteDate,
      quoteFrom,
      report_id: report?.id || undefined,
    });
  });
}

let _assignMsgData = null;

async function assignReport(msgOrId) {
  _assignMsgData = msgOrId && typeof msgOrId === "object" ? msgOrId : { id: msgOrId };
  // Load reports for modal
  try {
    const res = await adminFetch("/reports?status=all&limit=100");
    if (res.ok) {
      const json = await res.json();
      msgReports = json.rows || [];
    }
  } catch(e) {}
  openAssignModal(_assignMsgData.id);
}

function openAssignModal(messageId) {
  const modal = document.getElementById("assignReportModal");
  if (!modal) { fallbackAssign(messageId); return; }
  modal.dataset.messageId = messageId;

  const list = document.getElementById("assignReportList");
  if (list) {
    list.innerHTML = "";
    for (const r of msgReports) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "menu-item assign-report-option";
      opt.setAttribute("role", "option");
      opt.setAttribute("aria-selected", "false");
      opt.dataset.reportId = r.id;
      const isOpen = r.status === "open";
      opt.innerHTML = `
        <b class="assign-report-ticket">${escSetting(r.ticket_number)}</b>
        <span class="assign-report-subject">${escSetting(r.subject || "—")}</span>
        <small class="assign-report-status">${isOpen ? "open" : "closed"}</small>`;
      opt.addEventListener("click", () => {
        const wasSelected = opt.getAttribute("aria-selected") === "true";
        list.querySelectorAll(".assign-report-option").forEach(el => el.setAttribute("aria-selected", "false"));
        if (!wasSelected) opt.setAttribute("aria-selected", "true");
      });
      list.appendChild(opt);
    }
    if (!msgReports.length) {
      list.innerHTML = emptyStateHtml("Brak zgłoszeń. Utwórz nowe poniżej.", { variant: "inline" });
    }
  }

  const subjectInput = document.getElementById("assignNewSubject");
  if (subjectInput) {
    subjectInput.value = "";
    subjectInput.oninput = () => {
      const quoteLabel = document.getElementById("assignQuoteLabel");
      if (quoteLabel) quoteLabel.hidden = !subjectInput.value.trim();
    };
  }
  const quoteLabel = document.getElementById("assignQuoteLabel");
  if (quoteLabel) quoteLabel.hidden = true;
  const quoteCheck = document.getElementById("assignQuoteCheck");
  if (quoteCheck) quoteCheck.checked = false;
  openDialog(modal, { onClose: closeAssignModal });
}

async function fallbackAssign(messageId) {
  const ticketOrId = await promptModal({ text: "Podaj ID zgłoszenia lub wpisz temat nowego:" });
  if (!ticketOrId) return;
  await doAssign(messageId, ticketOrId, false);
}

async function doAssign(messageId, reportId, isNew, withQuote = false, ticketNumber = null) {
  try {
    const res = await adminFetch("/messages/assign", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, report_id: reportId }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast("Zgłoszenie przydzielone", "success");
    closeAssignModal();

    if (isNew && withQuote && _assignMsgData && _assignMsgData.from_email) {
      const msg = _assignMsgData;
      const ticket = ticketNumber || "";
      const userQuote = (msg.body || "").trim();
      const replyBody = `Twoja wiadomość została zarejestrowana jako zgłoszenie nr ${ticket}.\nMożesz odpowiadać na ten email aby kontynuować rozmowę.`;
      const replySubject = `[${ticket}] Zgłoszenie zarejestrowane`;
      await adminFetch("/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: msg.from_email,
          subject: replySubject,
          body: replyBody,
          quote: userQuote,
          report_id: reportId,
        }),
      });
    }

    await loadMailFolder({ silent: true });
    if (msgActiveId) await openMessage(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function doCreateAndAssign(messageId, subject, withQuote = false) {
  try {
    const createRes = await adminFetch("/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject || "", lang: "pl" }),
    });
    if (!createRes.ok) throw new Error(await createRes.text());
    const createJson = await createRes.json();
    if (!createJson.ok) throw new Error(createJson.error);
    await doAssign(messageId, createJson.id, true, withQuote, createJson.ticket_number);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

function closeAssignModal() {
  const modal = document.getElementById("assignReportModal");
  closeDialog(modal);
}

async function unassignReport(messageId) {
  try {
    const res = await adminFetch("/messages/assign", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, report_id: null }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast("Odepnięto.", "success");
    await loadMailFolder({ silent: true });
    if (msgActiveId) await openMessage(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function toggleMarketing(messageId, isMarketing) {
  try {
    const res = await adminFetch(`/messages/marketing?id=${encodeURIComponent(messageId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_marketing: isMarketing }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(isMarketing ? "Oznaczono jako marketing." : "Oznaczono jako zwykła wiadomość.", "success");
    // Refresh folder and badges to show the change
    await loadMailFolder({ silent: true });
    await loadFolderBadges();
    if (msgActiveId) await openMessage(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function trashMessage(messageId) {
  try {
    const res = await adminFetch("/messages/trash", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast("Do kosza", "success");
    await loadMailFolder({ silent: true });
    const conv = document.getElementById("mailConv");
    if (conv) conv.innerHTML = `<div class="mail-conv-placeholder"><div class="mail-conv-placeholder-icon">${icon("envelope")}</div><div class="mail-conv-placeholder-text">Wybierz wątek</div></div>`;
    msgActiveId = null;
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function restoreMessage(messageId) {
  try {
    const res = await adminFetch("/messages/restore", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast("Przywróć", "success");
    await loadMailFolder({ silent: true });
    if (msgActiveId) await openMessage(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function deleteForever(messageId) {
  const ok = await confirmModal({ text: "Usuń na zawsze" });
  if (!ok) return;
  try {
    const res = await adminFetch("/messages/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast("Usuń na zawsze", "success");
    await loadMailFolder({ silent: true });
    const conv = document.getElementById("mailConv");
    if (conv) conv.innerHTML = `<div class="mail-conv-placeholder"><div class="mail-conv-placeholder-icon">${icon("envelope")}</div><div class="mail-conv-placeholder-text">Wybierz wątek</div></div>`;
    msgActiveId = null;
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function toggleReportStatus(reportId, currentStatus) {
  const newStatus = currentStatus === "open" ? "closed" : "open";
  try {
    const res = await adminFetch("/reports/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId, status: newStatus }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(newStatus === "closed" ? ("Zamknij zgłoszenie") : ("Otwórz zgłoszenie"), "success");
    // Refresh list and reopen
    await loadMailFolder({ silent: true });
    if (msgActiveId) await openReport(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

let _composePrevActiveId   = null;
let _composePrevIsReport   = false;
let _composeCurrentAttachments = [];
let composeLang = "pl";

function showCompose(defaults = {}) {
  const conv = document.getElementById("mailConv");
  if (!conv) return;

  // On mobile: switch to conversation view
  if (window.matchMedia("(max-width: 980px)").matches) {
    setMailView("conv");
  }

  _composePrevActiveId = msgActiveId;
  _composePrevIsReport = msgActiveFolder === "reports";
  composeLang = "pl";
  msgActiveId = null;
  document.querySelectorAll(".mail-thread-item").forEach(el => el.classList.remove("active"));

  const hasQuote = !!defaults.quote;

  // Build quote block
  let quoteBlockHtml = "";
  if (hasQuote) {
    const dateStr = defaults.quoteDate ? new Date(defaults.quoteDate).toLocaleString("pl-PL") : "";
    const fromStr = defaults.quoteFrom ? `${escSetting(defaults.quoteFrom)}, ${dateStr}` : dateStr;
    quoteBlockHtml = `<div id="composeQuoteBlock" class="compose-quote" hidden>
      <div class="compose-quote-from">${fromStr}</div>${escSetting(defaults.quote)}</div>`;
  }

  // Body without signature - signature is added on send/preview
  const bodyText = defaults.body || "";

  conv.innerHTML = `
    <div class="mail-compose-pane">
      <div id="composePaneInner" class="mail-conv-header">
        <div class="compose-head">
          <div class="compose-title">Napisz wiadomość</div>
          <button id="btnComposeClose" class="compose-close" type="button" title="Zamknij" aria-label="Zamknij">${icon("close")}</button>
        </div>

        <div class="compose-body">
          <div class="field">
            <label class="field-label">Do (e-mail)</label>
            <input class="inp" id="composeToInput" type="email" value="${escSetting(defaults.to || "")}" placeholder="np. kontakt@firma.pl" ${hasQuote ? 'disabled' : ''}>
          </div>
          <div class="field">
            <label class="field-label">Temat</label>
            <input class="inp" id="composeSubjectInput" type="text" autocomplete="off" value="${escSetting(defaults.subject || "")}" placeholder="Wpisz temat wiadomości">
          </div>

          <div class="compose-lang-row">
            <div class="lang-switcher compose-lang" id="composeLangSwitcher">
              <button type="button" class="btn lang-btn" id="composeLangBtn" aria-label="Zmień język treści powitania, pożegnania, nadawcy i szablonu" title="Zmień język treści powitania, pożegnania, nadawcy i szablonu">${icon("flag-pl")}</button>
              <div class="lang-menu" id="composeLangMenu" hidden></div>
            </div>
          </div>
          <div class="mail-inline-grid">
            <div class="field">
              <label class="field-label">Powitanie</label>
              <div class="ui-select" id="composeGreetingSelect">
                <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                  <span class="ui-select-label">Brak powitania</span>
                  <span class="ui-select-caret" aria-hidden="true">${icon("caret-down")}</span>
                </button>
                <div class="ui-select-menu" role="listbox"></div>
              </div>
              <input class="inp" id="composeGreetingCustom" type="text" placeholder="Wpisz własne powitanie" hidden>
            </div>
            <div class="field">
              <label class="field-label">Pożegnanie</label>
              <div class="ui-select" id="composeFarewellSelect">
                <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                  <span class="ui-select-label">Brak pożegnania</span>
                  <span class="ui-select-caret" aria-hidden="true">${icon("caret-down")}</span>
                </button>
                <div class="ui-select-menu" role="listbox"></div>
              </div>
              <textarea class="inp" id="composeFarewellCustom" rows="2" placeholder="Wpisz własne pożegnanie" hidden></textarea>
            </div>
            <div class="field">
              <label class="field-label">Nadawca</label>
              <div class="ui-select" id="composeSenderSelect">
                <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                  <span class="ui-select-label">Brak nadawcy</span>
                  <span class="ui-select-caret" aria-hidden="true">${icon("caret-down")}</span>
                </button>
                <div class="ui-select-menu" role="listbox"></div>
              </div>
              <input class="inp" id="composeSenderCustom" type="text" placeholder="Wpisz własnego nadawcę" hidden>
            </div>
          </div>

          <div class="field">
            <label class="field-label">Szablon odpowiedzi</label>
            <div class="ui-select" id="composeTemplateSelect">
              <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                <span class="ui-select-label">—</span>
                <span class="ui-select-caret" aria-hidden="true">${icon("caret-down")}</span>
              </button>
              <div class="ui-select-menu" role="listbox"></div>
            </div>
          </div>

          <div class="field compose-message-field">
            <label class="field-label">
              Treść
              ${hasQuote ? `
                <span class="compose-quote-hint">Użyj #quote aby wstawić cytat</span>
                <button type="button" class="btn xs compose-quote-btn" id="btnInsertQuote" title="Wstaw #quote w miejscu kursora">#quote</button>
              ` : ""}
            </label>
            <div id="composeMessageArea" class="compose-message-area"></div>
          </div>

          <div class="field attachments-section">
            <label class="field-label attachments-label">Załączniki <span class="attachments-limit">(maks. 10 MB)</span></label>
            <input type="file" id="composeAttachmentInput" multiple hidden>
            <label for="composeAttachmentInput" class="attachments-pick">
              ${icon("paperclip")}
              Wybierz pliki
            </label>
            <div id="composeAttachmentList" class="attachments-list"></div>
          </div>

          <input type="hidden" id="composeReportId" value="${escSetting(defaults.report_id || "")}">
          <input type="hidden" id="composeQuoteBody" value="${escSetting(defaults.quote || "")}">
          <input type="hidden" id="composeToEmail" value="${escSetting(defaults.to || "")}">

          <div class="cluster cluster--end compose-foot">
            <button class="btn sm" id="btnComposePreview" type="button">${icon("eye")} Podgląd</button>
            <span class="hint" id="composeSendStatus"></span>
            <button class="btn sm gold" id="btnComposeSend" type="button">Wyślij</button>
          </div>
        </div>
      </div>
    </div>`;

  // Initialize TinyMCE for composeMessageArea after HTML is inserted
  const initComposeTinyMCE = () => {
    if (!globalThis.tinymce) {
      loadTinyMce().then(initComposeTinyMCE, () => showToast("Nie udało się wczytać edytora treści.", "error"));
      return;
    }
    const composeEl = document.getElementById("composeMessageArea");
    if (!composeEl) {
      console.warn("composeMessageArea element not found, retrying...");
      setTimeout(initComposeTinyMCE, 200);
      return;
    }
    
    // Remove existing TinyMCE instance
    const existing = globalThis.tinymce?.get("composeMessageArea");
    if (existing) {
      globalThis.tinymce.remove(existing);
    }
    
    globalThis.tinymce.init({
      selector: "#composeMessageArea",
      height: 400,
      menubar: "edit insert view format table tools",
      branding: false,
      promotion: false,
      license_key: "gpl",
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
      statusbar: false,
      skin: "oxide-dark",
      content_css: "dark",
      content_style: `
        body { background: #050914; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.4; }
        a { color: #ffeaa6; }
        table { border-collapse: collapse; width: 100%; }
        table td, table th { border: 1px solid rgba(255,255,255,.2); padding: 8px; }
        code, pre { background: rgba(255,234,166,.1); color: #ffeaa6; padding: 2px 6px; border-radius: 4px; }
      `,
      paste_data_images: true,
      images_upload_handler: (blobInfo) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blobInfo.blob());
        });
      },
      setup: (editor) => {
        editor.on("init", () => {
        });
        editor.on("change", () => {
          const content = editor.getContent();
          if (content.includes("#quote")) {
            const quoteBlock = document.getElementById("composeQuoteBlock");
            if (quoteBlock) quoteBlock.hidden = false;
          }
        });
      },
    });
  };

  // Start initialization
  setTimeout(initComposeTinyMCE, 100);

  // Initialize greeting select
  const composeGreetingSelect = initUiSelect(document.getElementById("composeGreetingSelect"), {
    options: getGreetingOptions(composeLang),
    value: defaults.greetingValue || "none",
    placeholder: "Brak",
    onChange: (val) => {
      const customInput = document.getElementById("composeGreetingCustom");
      if (customInput) {
        customInput.hidden = val !== "custom";
        if (val === "custom") customInput.focus();
      }
    },
  });
  
  // Initialize farewell select
  const composeFarewellSelect = initUiSelect(document.getElementById("composeFarewellSelect"), {
    options: getFarewellOptions(composeLang),
    value: defaults.farewellValue || "none",
    placeholder: "Brak pożegnania",
    onChange: (val) => {
      const customInput = document.getElementById("composeFarewellCustom");
      if (customInput) {
        customInput.hidden = val !== "custom";
        if (val === "custom") customInput.focus();
      }
    },
  });

  // Initialize sender select
  const composeSenderSelect = initUiSelect(document.getElementById("composeSenderSelect"), {
    options: getSenderOptions(composeLang),
    value: defaults.senderValue || "team",
    placeholder: "Zespół Familiada",
    onChange: (val) => {
      const customInput = document.getElementById("composeSenderCustom");
      if (customInput) {
        customInput.hidden = val !== "custom";
        if (val === "custom") customInput.focus();
      }
    },
  });

  // Set custom values if provided
  if (defaults.greetingCustom) {
    const customInput = document.getElementById("composeGreetingCustom");
    if (customInput && defaults.greetingValue === "custom") {
      customInput.value = defaults.greetingCustom;
      customInput.hidden = false;
    }
  }
  if (defaults.farewellCustom) {
    const customInput = document.getElementById("composeFarewellCustom");
    if (customInput && defaults.farewellValue === "custom") {
      customInput.value = defaults.farewellCustom;
      customInput.hidden = false;
    }
  }
  if (defaults.senderCustom) {
    const customInput = document.getElementById("composeSenderCustom");
    if (customInput && defaults.senderValue === "custom") {
      customInput.value = defaults.senderCustom;
      customInput.hidden = false;
    }
  }

  document.getElementById("btnComposeSend")?.addEventListener("click", () => sendComposeWithSignature(composeGreetingSelect, composeFarewellSelect, composeSenderSelect));

  document.getElementById("btnComposePreview")?.addEventListener("click", () => {
    showComposePreview(composeGreetingSelect, composeFarewellSelect, composeSenderSelect);
  });

  document.getElementById("btnComposeClose")?.addEventListener("click", async () => {
    const editor = globalThis.tinymce?.get("composeMessageArea");
    const hasData = (document.getElementById("composeSubjectInput")?.value || "").trim()
      || (editor ? editor.getContent() : "")
      || (document.getElementById("composeGreetingCustom")?.value || "").trim()
      || (document.getElementById("composeFarewellCustom")?.value || "").trim();
    if (hasData) {
      const ok = await confirmModal({ text: "Wprowadzone dane zostaną utracone. Zrezygnować?" });
      if (!ok) return;
    }
    closeCompose();
  });

  // ── Attachments Logic ──────────────────────────────────────────────────────
  _composeCurrentAttachments = defaults.attachments || [];

  const updateAttachmentList = () => {
    const list = document.getElementById("composeAttachmentList");
    if (!list) return;
    list.innerHTML = "";
    _composeCurrentAttachments.forEach((f, index) => {
      const span = document.createElement("span");
      span.className = "compose-att";
      span.textContent = f.name;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "compose-att-remove";
      removeBtn.innerHTML = icon("close", { label: "Usuń" });
      removeBtn.addEventListener("click", () => {
        _composeCurrentAttachments.splice(index, 1);
        updateAttachmentList();
      });

      span.appendChild(removeBtn);
      list.appendChild(span);
    });
  };

  // Initial list update
  updateAttachmentList();

  document.getElementById("composeAttachmentInput")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    _composeCurrentAttachments = [..._composeCurrentAttachments, ...files];
    e.target.value = ""; // reset input
    updateAttachmentList();
  });

  // Quote position radio buttons
  document.querySelectorAll('input[name="composeQuotePosition"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      // Rebuild compose window with new quote position
      const newQuotePosition = e.target.value;
      const reportId = document.getElementById("composeReportId")?.value;
      const quote = document.getElementById("composeQuoteBody")?.value;
      const subject = document.getElementById("composeSubjectInput")?.value;
      const body = document.getElementById("composeMessageArea")?.value;
      const greetingValue = composeGreetingSelect?.getValue();
      const farewellValue = composeFarewellSelect?.getValue();
      const greetingCustom = document.getElementById("composeGreetingCustom")?.value;
      const farewellCustom = document.getElementById("composeFarewellCustom")?.value;
      
      // Save current state
      const currentState = {
        subject: subject || "",
        body: body || "",
        quote: quote || "",
        report_id: reportId || undefined,
        greetingValue,
        farewellValue,
        greetingCustom,
        farewellCustom,
        attachments: _composeCurrentAttachments,
      };
      
      // Reopen compose with new quote position
      showCompose(currentState);
      
      // Set the new quote position
      const newRadio = document.querySelector(`input[name="composeQuotePosition"][value="${newQuotePosition}"]`);
      if (newRadio) newRadio.checked = true;
    });
  });
  
  // Template select - insert template text into TinyMCE body
  const composeTemplateSelect = initUiSelect(document.getElementById("composeTemplateSelect"), {
    options: getComposeTemplateOptions(composeLang),
    value: "custom",
    onChange: (templateKey) => {
      const templateText = getEmailTemplates(composeLang)[templateKey] || "";
      const editor = globalThis.tinymce?.get("composeMessageArea");
      if (editor && templateText) editor.setContent(templateText);
    },
  });

  // Language switcher - dropdown styled/behaving like the site's lang-switcher (translation.js),
  // picks a language directly instead of cycling. Swaps only the dropdown option texts above.
  {
    const switcherEl = document.getElementById("composeLangSwitcher");
    const btnEl = document.getElementById("composeLangBtn");
    const menuEl = document.getElementById("composeLangMenu");

    const applyComposeLang = (lang) => {
      composeLang = lang;
      composeGreetingSelect?.setOptions(getGreetingOptions(composeLang));
      composeFarewellSelect?.setOptions(getFarewellOptions(composeLang));
      composeSenderSelect?.setOptions(getSenderOptions(composeLang));
      composeTemplateSelect?.setOptions(getComposeTemplateOptions(composeLang));
      if (btnEl) btnEl.innerHTML = icon(COMPOSE_LANG_META[composeLang].flag);
    };

    if (menuEl) {
      COMPOSE_LANGS.forEach((lang) => {
        const meta = COMPOSE_LANG_META[lang];
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = "menu-item";
        opt.dataset.lang = lang;
        opt.innerHTML = iconText(meta.flag, meta.label);
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          menuEl.hidden = true;
          applyComposeLang(lang);
        });
        menuEl.appendChild(opt);
      });
    }

    btnEl?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!menuEl) return;
      menuEl.hidden = !menuEl.hidden;
    });

    document.addEventListener("click", (e) => {
      if (menuEl && !menuEl.hidden && switcherEl && !switcherEl.contains(e.target) && !menuEl.contains(e.target)) {
        menuEl.hidden = true;
      }
    });
  }

  // Insert #quote button - only for replies (when hasQuote is true)
  document.getElementById("btnInsertQuote")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const editor = globalThis.tinymce?.get("composeMessageArea");
    if (editor) {
      editor.insertContent("#quote");
      editor.focus();
    }
  });
}

function closeCompose() {
  if (_composePrevActiveId) {
    if (_composePrevIsReport) {
      openReport(_composePrevActiveId);
    } else {
      openMessage(_composePrevActiveId);
    }
  } else {
    const conv = document.getElementById("mailConv");
    if (!conv) return;
    conv.innerHTML = `<div class="mail-conv-placeholder"><div class="mail-conv-placeholder-icon">${icon("envelope")}</div><div class="mail-conv-placeholder-text">Wybierz wątek</div></div>`;
    msgActiveId = null;

    // On mobile: switch back to list view
    if (window.matchMedia("(max-width: 980px)").matches) {
      setMailView("list");
    }
  }
  _composePrevActiveId = null;
  _composePrevIsReport = false;
}

async function sendComposeWithSignature(greetingSelect, farewellSelect, senderSelect) {
  const subject = (document.getElementById("composeSubjectInput")?.value || "").trim();
  const toEmail = (document.getElementById("composeToInput")?.value || "").trim();
  const editor = globalThis.tinymce?.get("composeMessageArea");
  if (!editor) {
    showToast("Edytor nie jest gotowy.", "error");
    return;
  }
  let body = editor.getContent();
  const reportId = (document.getElementById("composeReportId")?.value || "").trim() || null;
  const status = document.getElementById("composeSendStatus");
  const quote = (document.getElementById("composeQuoteBody")?.value || "").trim() || null;

  if (!subject) { showToast("Podaj temat wiadomości.", "error"); return; }
  if (!toEmail) { showToast("Podaj odbiorcę.", "error"); return; }
  // Validate email format
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(toEmail)) { showToast("Nieprawidłowy format e-mail.", "error"); return; }
  if (!body) { showToast("Podaj treść wiadomości.", "error"); return; }
  if (status) status.textContent = "Wysyłam…";

  // Build signature from compose window selections
  const greetingValue = greetingSelect?.getValue() || "none";
  const farewellValue = farewellSelect?.getValue() || "none";
  const senderValue = senderSelect?.getValue() || "team";
  const greetingCustom = (document.getElementById("composeGreetingCustom")?.value || "").trim();
  const farewellCustom = (document.getElementById("composeFarewellCustom")?.value || "").trim();
  const senderCustom = (document.getElementById("composeSenderCustom")?.value || "").trim();

  const signatureText = buildEmailSignature({
    greeting: greetingValue,
    farewell: farewellValue,
    sender: senderValue,
    greetingCustom,
    farewellCustom,
    senderCustom,
    lang: composeLang,
  });

  // Build HTML email body with Familiada wrapper (dark theme)
  const greetingText = buildEmailSignature({ greeting: greetingValue, farewell: "none", greetingCustom, farewellCustom: "", lang: composeLang });
  const farewellText = buildEmailSignature({
    greeting: "none",
    farewell: farewellValue,
    sender: senderValue,
    greetingCustom: "",
    farewellCustom,
    senderCustom,
    lang: composeLang,
  });

  const htmlBody = buildComposeMailHtml({ lang: composeLang, subject, bodyHtml: body,
    quote, greeting: greetingText, farewell: farewellText });

  // Upload attachments
  const uploadedAttachments = [];
  if (_composeCurrentAttachments.length) {
    for (const file of _composeCurrentAttachments) {
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await adminFetch("/attachments/upload", { method: "POST", body: fd });
      const upJson = await upRes.json().catch(() => ({}));
      if (!upRes.ok) {
        showToast(`Błąd uploadu: ${upJson.error || upRes.status}${upJson.details ? " — " + upJson.details : ""}`, "error");
        if (status) status.textContent = "";
        return;
      }
      if (upJson.ok) uploadedAttachments.push(upJson);
    }
  }

  try {
    const res = await adminFetch("/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_email: toEmail || undefined,
        subject,
        body: body,
        body_html: htmlBody,
        report_id: reportId || undefined,
        attachments: uploadedAttachments.length ? uploadedAttachments : undefined,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    if (json.queued === 0) {
      if (status) status.textContent = "";
      showToast(t("pollSharePanel.mailDisabled"));
      return;
    }
    showToast("Dodano do kolejki.", "success");
    closeCompose();
    await loadMailFolder({ silent: true });
  } catch (err) {
    if (status) status.textContent = "";
    showToast(String(err?.message || err), "error");
  }
}

function showComposePreview(greetingSelect, farewellSelect, senderSelect) {
  const subject = (document.getElementById("composeSubjectInput")?.value || "").trim();
  const editor = globalThis.tinymce?.get("composeMessageArea");
  if (!editor) {
    showToast("Edytor nie jest gotowy.", "error");
    return;
  }
  const body = editor.getContent();
  const quote = (document.getElementById("composeQuoteBody")?.value || "").trim() || null;

  // Build greeting and farewell separately
  const greetingValue = greetingSelect?.getValue() || "none";
  const farewellValue = farewellSelect?.getValue() || "none";
  const senderValue = senderSelect?.getValue() || "team";
  const greetingCustom = (document.getElementById("composeGreetingCustom")?.value || "").trim();
  const farewellCustom = (document.getElementById("composeFarewellCustom")?.value || "").trim();
  const senderCustom = (document.getElementById("composeSenderCustom")?.value || "").trim();

  const greetingText = buildEmailSignature({
    greeting: greetingValue,
    farewell: "none",
    sender: "none",
    greetingCustom,
    farewellCustom: "",
    senderCustom: "",
    lang: composeLang,
  });

  const farewellText = buildEmailSignature({
    greeting: "none",
    farewell: farewellValue,
    sender: senderValue,
    greetingCustom: "",
    farewellCustom,
    senderCustom,
    lang: composeLang,
  });

  const emailHtml = buildComposeMailHtml({ lang: composeLang, subject, bodyHtml: body,
    quote, greeting: greetingText, farewell: farewellText });

  // Create iframe for preview (renders HTML exactly like system emails)
  const frame = document.createElement("iframe");
  frame.className = "mail-html-frame";
  frame.sandbox = MAIL_FRAME_SANDBOX;
  frame.srcdoc = emailHtml;
  
  // Create wrapper with dark background (matches email theme #050914)
  const wrapper = document.createElement("div");
  wrapper.className = "compose-preview-wrapper";
  
  // Zamknięcie: przez standardowy, wbudowany "✕" w nagłówku modala
  // (ten sam wygląd we wszystkich modalach) — bez własnego duplikatu.
  wrapper.appendChild(frame);

  void confirmModal({
    title: "Podgląd wiadomości",
    text: "",
    body: wrapper,
    okText: "",
    showCancel: false,
    sheet: { backBtn: document.getElementById("btnMailBackTopbar") || btnBackSheet, keepBackBtnText: true },
  });
}

// ── Mobile mail navigation (3-pane → one at a time) ───────────────────
let mailView = "list"; // list | folders | conv

export function setMailView(view) {
  // Only show mail nav when reports tab is active
  if (activeTab !== "reports") return;

  mailView = view;
  const client = document.getElementById("mailClient");
  const navTopbar = document.getElementById("mailNavTopbar");
  const btnBack = document.getElementById("btnMailBackTopbar");
  const btnCompose = document.getElementById("btnMailComposeTopbar");
  const brand = document.getElementById("settingsBrand");

  if (!client) return;
  client.dataset.mailView = view;

  const isMobile = window.matchMedia("(max-width: 980px)").matches;

  if (!isMobile) {
    if (navTopbar) navTopbar.hidden = true;
    if (brand) brand.hidden = false;
    return;
  }

  // On mobile: show mail nav, hide brand
  if (navTopbar) navTopbar.hidden = false;
  if (brand) brand.hidden = true;

  // Show/hide back button based on view
  if (btnBack) btnBack.hidden = view === "folders";

  // Show compose in folders and list views, hide in conv
  if (btnCompose) btnCompose.hidden = !(view === "folders" || view === "list");
}

export function hideMailNav() {
  const navTopbar = document.getElementById("mailNavTopbar");
  const brand = document.getElementById("settingsBrand");
  if (navTopbar) navTopbar.hidden = true;
  if (brand) brand.hidden = false;
}

function mailViewBack() {
  if (mailView === "conv") setMailView("list");
  else if (mailView === "list") setMailView("folders");
}

function initMobileMailNav() {
  const btnMailBack = document.getElementById("btnMailBackTopbar");
  btnMailBack?.addEventListener("click", () => {
    if (handleSheetBack()) return;
    mailViewBack();
  });
  document.getElementById("btnMailComposeTopbar")?.addEventListener("click", () => showCompose());

  // When clicking a folder on mobile, go to list view
  document.querySelectorAll(".mail-folder").forEach(el => {
    el.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 980px)").matches) {
        setMailView("list");
      }
    });
  });

  // Observe when conversation is opened — only if reports tab is active
  const convObserver = new MutationObserver(() => {
    if (activeTab !== "reports") return;
    const conv = document.getElementById("mailConv");
    const hasContent = conv && conv.querySelector(".mail-conv-header");
    if (hasContent && window.matchMedia("(max-width: 980px)").matches) {
      setMailView("conv");
    }
  });

  const convEl = document.getElementById("mailConv");
  if (convEl) convObserver.observe(convEl, { childList: true, subtree: true });

  // Initial state
  setMailView("list");
}

export function wireReportsEvents() {
  // Mobile mail navigation
  initMobileMailNav();

  // Folder nav
  document.querySelectorAll(".mail-folder").forEach(el => {
    el.addEventListener("click", async () => {
      document.querySelectorAll(".mail-folder").forEach(f => f.classList.remove("active"));
      el.classList.add("active");
      msgActiveFolder = el.dataset.folder;
      msgActiveId = null;
      const conv = document.getElementById("mailConv");
      if (conv) {
        conv.innerHTML = `<div class="mail-conv-placeholder"><div class="mail-conv-placeholder-icon">${icon("envelope")}</div><div class="mail-conv-placeholder-text">Wybierz wątek</div></div>`;
      }
      await loadMailFolder();
    });
  });

  document.getElementById("btnMailRefresh")?.addEventListener("click", () => loadMailFolder());
  document.getElementById("btnMailCompose")?.addEventListener("click", () => showCompose());

  document.getElementById("mailSearch")?.addEventListener("input", (e) => {
    msgSearchQuery = e.target.value;
    renderMailList(msgRows);
  });

  // Assign modal wiring
  document.getElementById("btnAssignConfirm")?.addEventListener("click", async () => {
    const modal = document.getElementById("assignReportModal");
    const messageId = modal?.dataset.messageId;
    if (!messageId) return;

    const selected = document.querySelector('.assign-report-option[aria-selected="true"]');
    if (selected) {
      await doAssign(messageId, selected.dataset.reportId, false);
      return;
    }

    const newSubject = (document.getElementById("assignNewSubject")?.value || "").trim();
    if (newSubject) {
      const withQuote = document.getElementById("assignQuoteCheck")?.checked ?? false;
      await doCreateAndAssign(messageId, newSubject, withQuote);
      return;
    }

    showToast("Wybierz zgłoszenie lub podaj temat nowego.", "error");
  });

  document.getElementById("btnAssignCancel")?.addEventListener("click", closeAssignModal);
  document.getElementById("btnAssignClose")?.addEventListener("click", closeAssignModal);
}

async function cleanupTrash() {
  try {
    const res = await adminFetch("/cleanup/trash", { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    showToast(`Usunięto ${json.deleted || 0} elementów.`, "success");
    if (msgActiveFolder === "trash") await loadMailFolder({ silent: true });
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}
