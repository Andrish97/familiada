// base-explorerjs/trash-modal.js
// Kosz bazy (migracja 428): lista usuniętych folderów i pytań z licznikiem
// dni do automatycznego usunięcia, Przywróć / Usuń trwale / Opróżnij kosz.
// Wiersz „Kosz” z licznikiem na dole lewego panelu otwiera okno.

import * as ops from "./ops.js?v=v2026-10-20T19584";
import { icon } from "../../../shared/js/core/icons.js?v=v2026-10-20T19584";
import { confirmModal } from "../../../shared/js/core/modal.js?v=v2026-10-20T19584";
import { enterModalSheet, exitModalSheet, isSheetViewport } from "../../../shared/js/core/modal-sheet.js?v=v2026-10-20T19584";
import { t } from "../../../shared/translation/translation.js?v=v2026-10-20T19584";

const $ = (id) => document.getElementById(id);
const DAY_MS = 24 * 60 * 60 * 1000;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Ile pełnych dni zostało do automatycznego usunięcia (0 = dziś).
export function trashDaysLeft(expiresAt, now = Date.now()) {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / DAY_MS);
}

function daysLeftText(n) {
  if (n <= 0) return t("baseExplorer.trash.today");
  if (n === 1) return t("baseExplorer.trash.dayLeft");
  return t("baseExplorer.trash.daysLeft", { n });
}

/**
 * onChange(kind, result): po przywróceniu ("restore", wynik qb_trash_restore)
 * albo trwałym usunięciu ("purge") — menedżer odświeża widok.
 */
export function initTrashModal({ state, onChange }) {
  const overlay = $("trashOverlay");
  const listEl = $("trashList");
  const btnOpen = $("trashOpen");
  const countEl = $("trashCount");
  const btnEmpty = $("trashEmpty");
  const errEl = $("trashErr");
  if (!overlay || !listEl) return null;

  let items = [];
  let busy = false;
  let isOpen = false;

  const canWrite = () => state?.role === "owner" || state?.role === "editor";

  function setErr(msg) {
    if (!errEl) return;
    errEl.style.display = msg ? "block" : "none";
    errEl.textContent = msg || "";
  }

  function renderCount() {
    if (btnOpen) btnOpen.hidden = !canWrite();
    if (countEl) countEl.textContent = items.length ? String(items.length) : "";
  }

  function render() {
    renderCount();
    if (btnEmpty) btnEmpty.disabled = busy || !items.length;
    if (!items.length) {
      listEl.innerHTML = `<div class="trash-empty">${escapeHtml(t("baseExplorer.trash.empty"))}</div>`;
      return;
    }
    listEl.innerHTML = items.map((it) => {
      const days = trashDaysLeft(it.expires_at);
      const isFolder = it.kind === "folder";
      const summary = isFolder
        ? t("baseExplorer.trash.folderSummary", { q: it.n_questions })
        : t("baseExplorer.trash.questionSummary");
      return `
        <div class="trash-row" data-id="${escapeHtml(it.id)}">
          ${icon(isFolder ? "folder" : "file-doc", { className: "trash-ico" })}
          <div class="trash-main">
            <div class="trash-label">${escapeHtml(it.label || "—")}</div>
            <div class="trash-meta">
              <span>${escapeHtml(summary)}</span>
              <span class="tag ${days <= 3 ? "tag--warn" : "tag--muted"}">${escapeHtml(daysLeftText(days))}</span>
            </div>
          </div>
          <button class="btn sm" type="button" data-act="restore" ${busy ? "disabled" : ""}
            title="${escapeHtml(t("baseExplorer.trash.restore"))}" aria-label="${escapeHtml(t("baseExplorer.trash.restore"))}">${icon("restore")}</button>
          <button class="btn sm danger" type="button" data-act="purge" ${busy ? "disabled" : ""}
            title="${escapeHtml(t("baseExplorer.trash.purge"))}" aria-label="${escapeHtml(t("baseExplorer.trash.purge"))}">${icon("trash-forever")}</button>
        </div>`;
    }).join("");
  }

  // Odświeża licznik (i listę, gdy okno jest otwarte).
  async function refresh() {
    if (!canWrite()) { items = []; renderCount(); return; }
    try {
      items = await ops.trashList(state.baseId) || [];
      setErr("");
    } catch (e) {
      console.warn("trash list failed:", e);
      if (isOpen) setErr(e?.userMessage || t("baseExplorer.trash.loadFailed"));
    }
    render();
  }

  async function run(fn, kind) {
    if (busy) return;
    busy = true;
    setErr("");
    render();
    try {
      const result = await fn();
      await onChange?.(kind, result);
    } catch (e) {
      console.error(e);
      setErr(e?.userMessage || t("baseExplorer.trash.actionFailed"));
    } finally {
      busy = false;
      await refresh();
    }
  }

  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest?.("button[data-act]");
    const id = btn?.closest?.(".trash-row")?.dataset?.id;
    if (!btn || !id) return;
    if (btn.dataset.act === "restore") {
      await run(() => ops.trashRestore(state.baseId, [id]), "restore");
    } else if (btn.dataset.act === "purge") {
      if (!(await confirmModal({ text: t("baseExplorer.trash.confirmPurge") }))) return;
      await run(() => ops.trashPurge(state.baseId, [id]), "purge");
    }
  });

  btnEmpty?.addEventListener("click", async () => {
    if (!items.length) return;
    if (!(await confirmModal({ text: t("baseExplorer.trash.confirmEmpty") }))) return;
    await run(() => ops.trashPurge(state.baseId, null), "purge");
  });

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.style.display = "none";
    exitModalSheet(overlay);
    setErr("");
  }

  async function open() {
    if (!canWrite()) return;
    isOpen = true;
    overlay.style.display = "grid";
    enterModalSheet(overlay, { backBtn: $("btnBack"), onClose: close });
    listEl.innerHTML = "";
    await refresh();
  }

  $("trashClose")?.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target !== overlay) return;
    // telefon (arkusz): wyjście tylko przyciskiem, jak w pozostałych oknach
    if (overlay.classList.contains("modal--sheet") && isSheetViewport()) return;
    close();
  });
  document.addEventListener("keydown", (e) => {
    if (isOpen && e.key === "Escape") { e.preventDefault(); close(); }
  });
  btnOpen?.addEventListener("click", () => { void open(); });

  return { open, close, refresh, isOpen: () => isOpen };
}
