// admin/js/marketplace.js — Społeczność gier: przegląd, akceptacja, odrzucenie, wycofanie.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { openDialog, closeDialog } from "../../shared/js/core/modal-sheet.js?v=v2026-10-25T07230";
import { confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-25T07230";
import { adminFetch, escSetting, showToast } from "./core.js?v=v2026-10-25T07230";
import { testTelegram } from "./mail-settings.js?v=v2026-10-25T07230";
import { loadProducerRatings } from "./ratings.js?v=v2026-10-25T07230";
import { loadMarketPendingBadge } from "./mailbox.js?v=v2026-10-25T07230";

// ============================================================
// MARKETPLACE ADMIN
// ============================================================

let marketActiveStatus = "pending";
let marketPreviewId = null;

export async function loadMarketplace({ silent = false } = {}) {
  const tbody = document.getElementById("marketTableBody");
  const info  = document.getElementById("marketTableInfo");
  if (!tbody) return;
  if (!silent && info) info.textContent = "Ładowanie…";

  void loadMarketPendingBadge();
  let data;
  try {
    const res = await adminFetch(`/marketplace/list?status=${marketActiveStatus}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    data = (json.rows || []).filter(r => r.origin !== "producer");
  } catch (err) {
    if (info) info.textContent = String(err?.message || err);
    return;
  }

  tbody.innerHTML = "";
  if (!data.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="table-empty table-empty--plain">Brak pozycji.</td>`;
    tbody.appendChild(tr);
    if (info) info.textContent = "";
    return;
  }

  for (const g of data) {
    const tr = document.createElement("tr");
    const date = g.created_at ? new Date(g.created_at).toLocaleDateString() : "—";
    const note = g.moderation_note ? ` <span class="market-note">(${escSetting(g.moderation_note)})</span>` : "";

    let actions = `<button class="btn sm" data-market-preview="${escSetting(g.id)}">Podgląd</button>`;
    if (marketActiveStatus === "pending") {
      actions += ` <button class="btn sm gold" data-market-approve="${escSetting(g.id)}">Zatwierdź</button>`;
      actions += ` <button class="btn sm" data-market-reject="${escSetting(g.id)}">Odrzuć</button>`;
    }

    const authorLabel = g.origin === "producer"
      ? "Producent"
      : (g.author_username || "—");

    tr.innerHTML = `
      <td>${escSetting(g.title)}${note}</td>
      <td>${escSetting(g.lang.toUpperCase())}</td>
      <td>${escSetting(authorLabel)}</td>
      <td>${date}</td>
      <td class="cluster market-actions">${actions}</td>`;
    tbody.appendChild(tr);
  }

  if (info) info.textContent = `${data.length} pozycji`;
}

async function openMarketPreview(id) {
  const overlay = document.getElementById("marketPreviewOverlay");
  if (!overlay) return;

  marketPreviewId = id;

  // Pobierz szczegół
  let game;
  try {
    const res = await adminFetch(`/marketplace/detail?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    game = json.game;
  } catch (err) {
    showToast(String(err?.message || err), "error");
    return;
  }

  const titleEl = document.getElementById("marketPreviewTitle");
  const metaEl  = document.getElementById("marketPreviewMeta");
  const descEl  = document.getElementById("marketPreviewDesc");
  const qEl     = document.getElementById("marketPreviewQuestions");
  const approveBtn = document.getElementById("btnMarketPreviewApprove");
  const rejectBtn  = document.getElementById("btnMarketPreviewReject");

  if (titleEl) titleEl.textContent = game.title || "—";
  if (metaEl)  metaEl.textContent  = `${(game.lang || "").toUpperCase()} · ${game.author_email || game.author_username || "—"} · ${game.status || ""}`;
  if (descEl)  descEl.textContent  = game.description || "";

  if (qEl) {
    const qs = game.payload?.questions || [];
    qEl.innerHTML = qs.map((q, i) => {
      const answers = (q.answers || [])
        .map(a => `<li>${escSetting(a.text)} <span class="q-preview-pts">(${a.fixed_points ?? 0} pkt)</span></li>`)
        .join("");
      return `<div class="q-preview-item">
        <div class="q-preview-text">${i + 1}. ${escSetting(q.text)}</div>
        <ol class="q-preview-answers">${answers}</ol>
      </div>`;
    }).join("");
  }

  // Przyciski zależne od statusu
  const isPending   = game.status === "pending";
  const isPublished = game.status === "published";
  if (approveBtn)  approveBtn.hidden  = !isPending;
  if (rejectBtn)   rejectBtn.hidden   = !isPending;
  const withdrawBtn = document.getElementById("btnMarketPreviewWithdraw");
  const deleteBtn   = document.getElementById("btnMarketPreviewDelete");
  if (withdrawBtn) withdrawBtn.hidden = !isPublished;
  if (deleteBtn)   deleteBtn.hidden   = false; // zawsze widoczny

  openDialog(overlay, { onClose: closeMarketPreview });
}

function closeMarketPreview() {
  const overlay = document.getElementById("marketPreviewOverlay");
  if (overlay) closeDialog(overlay);
  marketPreviewId = null;
}

async function approveMarketGame(id) {
  try {
    const res = await adminFetch("/marketplace/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "approve" }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "approve_failed");
    showToast("Gra została zatwierdzona");
    closeMarketPreview();
    await loadMarketplace({ silent: true });
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

function openRejectModal(id) {
  marketPreviewId = id;
  const overlay = document.getElementById("marketRejectOverlay");
  const note    = document.getElementById("marketRejectNote");
  if (note) note.value = "";
  openDialog(overlay, { onClose: closeRejectModal });
}

function closeRejectModal() {
  const overlay = document.getElementById("marketRejectOverlay");
  if (overlay) closeDialog(overlay);
}

async function confirmReject() {
  const id   = marketPreviewId;
  const note = (document.getElementById("marketRejectNote")?.value || "").trim();
  if (!id) return;
  try {
    const res = await adminFetch("/marketplace/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "reject", note }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "reject_failed");
    showToast("Odrzucono.");
    closeRejectModal();
    closeMarketPreview();
    await loadMarketplace({ silent: true });
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function adminForceWithdraw(id) {
  const ok = await confirmModal({ text: "Wycofać tę grę? Zniknie z browse, ale zostanie w bibliotekach osób które ją dodały." });
  if (!ok) return;
  try {
    const res = await adminFetch("/marketplace/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "withdraw_failed");
    showToast("Wycofano.");
    closeMarketPreview();
    await loadMarketplace({ silent: true });
  } catch (err) {
    console.error("[settings] adminForceWithdraw error:", err);
    showToast(String(err?.message || err), "error");
  }
}

async function adminHardDelete(id) {
  const ok = await confirmModal({ text: "Usunąć grę na stałe? Zniknie u wszystkich użytkowników. Tego nie da się cofnąć." });
  if (!ok) return;
  try {
    const res = await adminFetch("/marketplace/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!json.ok) {
      let msg = json.error || "delete_failed";
      if (json.debug) msg += ` (status: ${json.debug.status}, row_err: ${json.debug.row_err})`;
      throw new Error(msg);
    }
    showToast("Usunięto.");
    closeMarketPreview();
    await loadMarketplace({ silent: true });
  } catch (err) {
    console.error("[settings] adminHardDelete error:", err);
    showToast(String(err?.message || err), "error");
  }
}

export function wireMarketplaceEvents() {
  // Tab wewnętrzne
  const tabs = [
    { id: "mktTabPending",   status: "pending" },
    { id: "mktTabPublished", status: "published" },
    { id: "mktTabRejected",  status: "rejected" },
    { id: "mktTabWithdrawn", status: "withdrawn" },
  ];
  for (const { id, status } of tabs) {
    document.getElementById(id)?.addEventListener("click", async () => {
      tabs.forEach(t => document.getElementById(t.id)?.classList.toggle("is-active", t.id === id));
      marketActiveStatus = status;
      await loadMarketplace();
    });
  }

  // Odśwież
  document.getElementById("btnMarketRefresh")?.addEventListener("click", () => loadMarketplace());
  document.getElementById("btnProducerRatingsRefresh")?.addEventListener("click", () => loadProducerRatings());
  document.getElementById("btnRatersClose")?.addEventListener("click", () => {
    const ov = document.getElementById("ratersOverlay");
    if (ov) closeDialog(ov);
  });

  // Sync Storage
  // Telegram config
  document.getElementById("btnTelegramTest")?.addEventListener("click", testTelegram);

  // Delegacja kliknięć w tabeli
  document.getElementById("marketTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const previewId = btn.dataset.marketPreview;
    const approveId = btn.dataset.marketApprove;
    const rejectId  = btn.dataset.marketReject;
    if (previewId) await openMarketPreview(previewId);
    if (approveId) await approveMarketGame(approveId);
    if (rejectId)  openRejectModal(rejectId);
  });

  // Modal podglądu
  document.getElementById("btnMarketPreviewClose")?.addEventListener("click", closeMarketPreview);
  document.getElementById("btnMarketPreviewX")?.addEventListener("click", closeMarketPreview);
  document.getElementById("btnMarketPreviewApprove")?.addEventListener("click", () => {
    if (marketPreviewId) approveMarketGame(marketPreviewId);
  });
  document.getElementById("btnMarketPreviewReject")?.addEventListener("click", () => {
    if (marketPreviewId) { const id = marketPreviewId; closeMarketPreview(); openRejectModal(id); }
  });
  document.getElementById("btnMarketPreviewWithdraw")?.addEventListener("click", () => {
    if (marketPreviewId) adminForceWithdraw(marketPreviewId);
  });
  document.getElementById("btnMarketPreviewDelete")?.addEventListener("click", () => {
    if (marketPreviewId) adminHardDelete(marketPreviewId);
  });

  // Modal reject
  document.getElementById("btnMarketRejectCancel")?.addEventListener("click", closeRejectModal);
  document.getElementById("btnMarketRejectClose")?.addEventListener("click", closeRejectModal);
  document.getElementById("btnMarketRejectConfirm")?.addEventListener("click", confirmReject);
}
