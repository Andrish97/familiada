// admin/js/marketing-contacts.js — Kontakty marketingowe (lead-finder): przebiegi, tabela, dzienniki.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { initUiSelect } from "../../shared/js/core/ui-select.js?v=v2026-10-25T07165";
import { alertModal, confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-25T07165";
import { icon, iconText } from "../../shared/js/core/icons.js?v=v2026-10-25T07165";
import { adminFetch, adminGet, adminPost } from "./core.js?v=v2026-10-25T07165";
import { loadAiProviderOrder, renderAiProviderOrder } from "./mail-settings.js?v=v2026-10-25T07165";

// Kontakty marketingowe (lead-finder): tabela, przebiegi, dzienniki.
export async function initMarketingContacts() {
  // ═══════════════════════════════════════════════════════════
  // MARKETING CONTACTS
  // ═══════════════════════════════════════════════════════════
  const { rt } = await import("../../shared/js/core/realtime.js?v=v2026-10-25T07165");

  const MC_PAGE_SIZE = 50;

  // Lead-finder przez Worker (/_admin_api/leads/*): klucz usługi zostaje po
  // stronie serwera (audyt E24, Ś2). Zwraca odpowiedź usługi (JSON).
  async function mcLeads(path, method = "GET") {
    const res = await adminFetch(`/leads/${path}`, { method });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
    return data || {};
  }
  let mcFilterUsedValue = "";
  let mcSearchValue = "";
  let mcState = {
    runs: [],
    contacts: [],
    selectedCells: [],
    page: 1,
    sortCol: 'added_at',
    sortDir: 'desc',
    logs: [],
    logRun: null,
    logTimer: null,
    status: "idle"
  };

  function mcUpdateButtons() {
    const actionBtn = document.getElementById("mcActionBtn");
    const cancelBtn = document.getElementById("mcCancelBtn");
    const targetInput = document.getElementById("mcTargetCount");
    if (!actionBtn || !cancelBtn) return;

    actionBtn.disabled = false;
    cancelBtn.disabled = false;

    switch (mcState.status) {
      case "running":
        actionBtn.innerHTML = iconText("pause", "Wstrzymaj");
        actionBtn.className = "btn sm warning";
        cancelBtn.hidden = false;
        targetInput.disabled = true;
        break;
      case "paused":
        actionBtn.innerHTML = iconText("play", "Wznów");
        actionBtn.className = "btn sm gold";
        cancelBtn.hidden = false;
        targetInput.disabled = true;
        break;
      case "cancelled":
      case "completed":
      case "idle":
      default:
        actionBtn.innerHTML = iconText("play", "Uruchom");
        actionBtn.className = "btn sm gold";
        cancelBtn.hidden = true;
        targetInput.disabled = false;
        break;
    }
    renderAiProviderOrder();
  }

  async function mcLoadRuns() {
    try {
      const data = await mcLeads("search-runs/status");
      mcState.status = data.status || "idle";
      mcState.logRun = data.run_id;
      mcUpdateButtons();
    } catch(e) {
      mcState.status = "idle";
      mcUpdateButtons();
    }
  }

  async function mcStartRun() {
    const actionBtn = document.getElementById("mcActionBtn");
    const count = parseInt(document.getElementById("mcTargetCount").value) || 50;
    actionBtn.disabled = true;
    try {
      mcState.logs = [];
      mcRenderLogs();
      const data = await mcLeads(`search-runs?target_count=${count}`, "POST");
      actionBtn.innerHTML = iconText("check", "Wyszukiwanie uruchomione");
      setTimeout(()=>{ mcState.status = "running"; mcUpdateButtons(); }, 1500);
      mcState.logRun = data.run_id;
      mcStartLogAutoRefresh();
    } catch(e) {
      alertModal({ text: "Błąd: " + e.message });
      mcUpdateButtons();
    }
  }

  window.mcAction = async function() {
    const actionBtn = document.getElementById("mcActionBtn");
    const cancelBtn = document.getElementById("mcCancelBtn");
    actionBtn.disabled = true;
    cancelBtn.disabled = true;

    if (mcState.status !== "running" && mcState.status !== "paused") {
      await mcStartRun();
      return;
    }

    try {
      if (mcState.status === "running") {
        actionBtn.innerHTML = iconText("pause", "Wstrzymywanie…");
        await mcLeads(`search-runs/${mcState.logRun}/pause`, "POST").catch(() => { throw new Error("Nie udało się wstrzymać zlecenia"); });
        mcState.status = "paused";
        mcStopLogAutoRefresh();
      } else {
        actionBtn.innerHTML = iconText("play", "Wznawianie…");
        await mcLeads(`search-runs/${mcState.logRun}/resume`, "POST").catch(() => { throw new Error("Nie udało się wznowić zlecenia"); });
        mcState.status = "running";
        mcStartLogAutoRefresh();
      }
      mcUpdateButtons();
    } catch(e) {
      alertModal({ text: "Błąd: " + e.message });
      await mcLoadRuns();
    }
  };

  window.mcCancel = async function() {
    if(!await confirmModal({ text: "Anulować zlecenie?" })) return;
    const actionBtn = document.getElementById("mcActionBtn");
    const cancelBtn = document.getElementById("mcCancelBtn");
    actionBtn.disabled = true;
    cancelBtn.disabled = true;
    
    await mcLeads(`search-runs/${mcState.logRun}/cancel`, "POST").catch(() => {});
    mcState.status = "idle";
    mcUpdateButtons();
    mcStopLogAutoRefresh();
    mcLoadContacts();
  };

  async function mcLoadContacts() {
    const tbody = document.getElementById("mcTableBody");
    console.log('[MC] mcLoadContacts called, page:', mcState.page, 'panel hidden:', document.getElementById("marketingContactsPanel")?.hidden);
    try {
      const q = new URLSearchParams({ page: String(mcState.page), sort: mcState.sortCol, dir: mcState.sortDir });
      if (mcFilterUsedValue !== "") q.set("used", mcFilterUsedValue);
      const search = mcSearchValue.trim();
      if (search) q.set("search", search);
      const { rows, total } = await adminGet(`/marketing/contacts?${q}`);
      mcState.contacts = rows || [];
      mcRenderContacts(total || 0);
      mcUpdateSortHeaders();
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="5" class="mc-empty mc-empty--cell">Błąd: ${e.message}</td></tr>`;
    }
  }

  function mcUpdateSortHeaders() {
    document.querySelectorAll('.mc-sortable').forEach(th => {
      const col = th.dataset.col;
      const arrow = col === mcState.sortCol ? ' ' + icon(mcState.sortDir === 'asc' ? 'caret-up' : 'caret-down') : '';
      th.innerHTML = th.dataset.label + arrow;
    });
  }

  function mcInitSorting() {
    document.querySelectorAll('.mc-sortable').forEach(th => {
      th.dataset.label = th.textContent.trim();
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (mcState.sortCol === col) {
          mcState.sortDir = mcState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          mcState.sortCol = col;
          mcState.sortDir = 'desc';
        }
        mcState.page = 1;
        mcLoadContacts();
      });
    });
  }

  function mcRenderContacts(totalCount) {
    const tbody = document.getElementById("mcTableBody");
    if (!mcState.contacts.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="mc-empty mc-empty--cell">Brak kontaktów</td></tr>';
      mcUpdatePagination(0);
      mcUpdateSelectionInfo();
      return;
    }
    tbody.innerHTML = mcState.contacts.map((c, i) => {
      const usedClass = c.is_used ? 'mc-used' : '';
      const usedText = c.is_used ? `${icon('check', { label: 'użyte' })}<span hidden>✓</span>` : '';
      const addedAt = c.added_at ? new Date(c.added_at).toLocaleString('pl-PL', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '—';
      return `<tr class="${usedClass}" data-id="${c.id}">
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="0">${mcEsc(c.title||'')}</td>
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="1">${mcEsc(c.email||'')}</td>
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="2">${mcEsc(c.url||'')}</td>
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="3">${addedAt}</td>
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="4">${usedText}</td>
      </tr>`;
    }).join("");
    mcUpdatePagination(totalCount);
    mcSetupTableSelection();
  }

  function mcSetupTableSelection() {
    const tbody = document.getElementById("mcTableBody");
    let isDragging = false;
    let dragStart = null;
    let autoScrollTimer = null;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let existingSelection = [];
    let touchToggleMode = false;
    let tapStartX = 0;
    let tapStartY = 0;

    function highlight() {
      tbody.querySelectorAll('.mc-cell-selected').forEach(c => c.classList.remove('mc-cell-selected'));
      mcState.selectedCells.forEach(({row, col}) => {
        const el = tbody.querySelector(`.mc-selectable[data-row="${row}"][data-col="${col}"]`);
        if (el) el.classList.add('mc-cell-selected');
      });
      mcUpdateSelectionInfo();
      mcUpdateMarkUsedBtn();
    }

    function selectRange(r1, c1, r2, c2) {
      const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
      const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2);
      const newRange = [];
      for (let r = rMin; r <= rMax; r++)
        for (let c = cMin; c <= cMax; c++)
          newRange.push({row: r, col: c});
      if (touchToggleMode) {
        const rangeKeys = new Set(newRange.map(c => `${c.row}:${c.col}`));
        const existMap = new Map(existingSelection.map(c => [`${c.row}:${c.col}`, c]));
        const result = existingSelection.filter(c => !rangeKeys.has(`${c.row}:${c.col}`));
        for (const c of newRange) { if (!existMap.has(`${c.row}:${c.col}`)) result.push(c); }
        mcState.selectedCells = result;
      } else {
        const existSet = new Set(existingSelection.map(c => `${c.row}:${c.col}`));
        mcState.selectedCells = [
          ...existingSelection,
          ...newRange.filter(c => !existSet.has(`${c.row}:${c.col}`))
        ];
      }
      highlight();
    }

    function cellAt(x, y) {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('.mc-selectable') : null;
    }

    function stopAutoScroll() {
      if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
    }

    function startAutoScroll(getXY) {
      if (autoScrollTimer) return;
      const tableWrap = document.getElementById("mcContactsTable")?.parentElement;
      autoScrollTimer = setInterval(() => {
        if (!isDragging) { stopAutoScroll(); return; }
        const {x, y} = getXY();
        const thresh = 80, speed = 18;
        if (y < thresh) window.scrollBy(0, -speed);
        else if (y > window.innerHeight - thresh) window.scrollBy(0, speed);
        if (tableWrap) {
          const rect = tableWrap.getBoundingClientRect();
          if (x < rect.left + thresh) tableWrap.scrollLeft -= speed;
          else if (x > rect.right - thresh) tableWrap.scrollLeft += speed;
        }
        const cell = cellAt(x, y);
        if (cell && dragStart) {
          selectRange(dragStart.row, dragStart.col, parseInt(cell.dataset.row), parseInt(cell.dataset.col));
        }
      }, 20);
    }

    // ── Mouse ──────────────────────────────────────────────────────────────
    tbody.addEventListener('mousedown', e => {
      const cell = e.target.closest('.mc-selectable');
      if (!cell) return;
      e.preventDefault();
      const row = parseInt(cell.dataset.row), col = parseInt(cell.dataset.col);
      if (e.shiftKey && mcState.selectedCells.length) {
        existingSelection = [];
        const last = mcState.selectedCells[mcState.selectedCells.length - 1];
        selectRange(last.row, last.col, row, col);
        return;
      }
      existingSelection = [];
      isDragging = true;
      dragStart = {row, col};
      mcState.selectedCells = [{row, col}];
      highlight();
      startAutoScroll(() => ({x: lastTouchX, y: lastTouchY}));
    });

    document.addEventListener('mousemove', e => {
      if (!isDragging || !dragStart) return;
      lastTouchX = e.clientX; lastTouchY = e.clientY;
      const cell = cellAt(e.clientX, e.clientY);
      if (cell) selectRange(dragStart.row, dragStart.col, parseInt(cell.dataset.row), parseInt(cell.dataset.col));
    });

    document.addEventListener('mouseup', () => {
      isDragging = false; dragStart = null; stopAutoScroll();
    });

    // ── Touch: 1 palec = scroll / tap kasuje; 2 palce = dodawanie do zaznaczenia ──
    tbody.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        tapStartX = e.touches[0].clientX; tapStartY = e.touches[0].clientY;
        return;
      }
      if (e.touches.length < 2) return;
      const anchor = cellAt(e.touches[0].clientX, e.touches[0].clientY);
      if (!anchor) return;
      isDragging = true;
      touchToggleMode = true;
      existingSelection = [...mcState.selectedCells];
      dragStart = {row: parseInt(anchor.dataset.row), col: parseInt(anchor.dataset.col)};
      lastTouchX = e.touches[1].clientX; lastTouchY = e.touches[1].clientY;
      const cursor = cellAt(lastTouchX, lastTouchY);
      if (cursor) selectRange(dragStart.row, dragStart.col, parseInt(cursor.dataset.row), parseInt(cursor.dataset.col));
      else {
        const key = `${dragStart.row}:${dragStart.col}`;
        if (!existingSelection.some(c => `${c.row}:${c.col}` === key))
          mcState.selectedCells = [...existingSelection, {row: dragStart.row, col: dragStart.col}];
        highlight();
      }
      startAutoScroll(() => ({x: lastTouchX, y: lastTouchY}));
    }, {passive: true});

    tbody.addEventListener('touchmove', e => {
      if (e.touches.length < 2 || !isDragging || !dragStart) return;
      e.preventDefault();
      lastTouchX = e.touches[1].clientX; lastTouchY = e.touches[1].clientY;
      const cell = cellAt(lastTouchX, lastTouchY);
      if (cell) selectRange(dragStart.row, dragStart.col, parseInt(cell.dataset.row), parseInt(cell.dataset.col));
    }, {passive: false});

    tbody.addEventListener('touchend', e => {
      if (!isDragging && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const dx = t.clientX - tapStartX, dy = t.clientY - tapStartY;
        if (Math.hypot(dx, dy) < 12) {
          const cell = cellAt(t.clientX, t.clientY);
          if (cell) {
            existingSelection = [];
            mcState.selectedCells = [{row: parseInt(cell.dataset.row), col: parseInt(cell.dataset.col)}];
            highlight();
          }
        }
      }
      isDragging = false; dragStart = null; touchToggleMode = false; stopAutoScroll();
    });

    // ── Klik poza tabelą → odznacz ─────────────────────────────────────────
    document.addEventListener('mousedown', e => {
      if (!e.target.closest('#mcContactsTable') &&
          !e.target.closest('#mcVisitUrlBtn') &&
          !e.target.closest('#mcMarkUsedBtn') &&
          !e.target.closest('#mcDeleteBtn') &&
          !e.target.closest('#mcCopyBtn')) {
        mcState.selectedCells = [];
        highlight();
      }
    });

    // ── Kopiowanie ─────────────────────────────────────────────────────────
    document.addEventListener('copy', e => {
      if (!mcState.selectedCells.length) return;
      const panel = document.getElementById("marketingContactsPanel");
      if (panel && panel.hidden) return;
      e.preventDefault();
      const rows = {};
      mcState.selectedCells.forEach(({row, col}) => { (rows[row] = rows[row] || []).push(col); });
      const sortedRows = Object.keys(rows).map(Number).sort((a, b) => a - b);
      const allCols = [...new Set(mcState.selectedCells.map(c => c.col))].sort((a, b) => a - b);
      const lines = sortedRows.map(r =>
        allCols.map(c => {
          const el = tbody.querySelector(`.mc-selectable[data-row="${r}"][data-col="${c}"]`);
          return el ? el.textContent.trim() : '';
        }).join('\t')
      );
      e.clipboardData.setData('text/plain', lines.join('\n'));
    });
  }

  function mcEsc(s) { const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }

  function mcUpdateSelectionInfo() {
    const info = document.getElementById("mcSelectionInfo");
    const urlBtn = document.getElementById("mcVisitUrlBtn");
    const copyBtn = document.getElementById("mcCopyBtn");
    const cells = mcState.selectedCells;
    if (info) {
      if (cells.length) {
        const rowCount = new Set(cells.map(c => c.row)).size;
        info.textContent = cells.length === 1 ? '1 komórka' : `${cells.length} komórek, ${rowCount} wierszy`;
      } else {
        info.textContent = '';
      }
    }
    if (copyBtn) copyBtn.hidden = !cells.length;
    if (urlBtn) {
      if (cells.length === 1 && cells[0].col === 2) {
        const contact = mcState.contacts[cells[0].row];
        if (contact?.url) { urlBtn.href = contact.url; urlBtn.hidden = false; return; }
      }
      urlBtn.hidden = true;
    }
  }

  function mcUpdateMarkUsedBtn() {
    const btn = document.getElementById("mcMarkUsedBtn");
    if (!btn) return;
    const rows = new Set(mcState.selectedCells.map(c => c.row));
    const setLabel = (used) => { btn.innerHTML = used ? iconText("check", "Użyte") : iconText("cancel", "Nieużyte"); };
    if (!rows.size) { setLabel(true); return; }
    const selected = [...rows].map(i => mcState.contacts[i]).filter(Boolean);
    if (!selected.length) { setLabel(true); return; }
    // mcMarkUsed: gdy wszystkie są użyte — zdejmuje oznaczenie, w pozostałych
    // przypadkach (także mieszany wybór) oznacza wszystkie jako użyte.
    setLabel(!selected.every(c => c.is_used));
  }

  async function mcMarkUsed() {
    const rows = new Set(mcState.selectedCells.map(c => c.row));
    if (!rows.size) return;
    try {
      const selected = [...rows].map(i => mcState.contacts[i]).filter(Boolean);
      if (!selected.length) return;
      const allUsed = selected.every(c => c.is_used);
      const ids = selected.map(c => c.id);
      await adminPost("/marketing/contacts/used", { ids, used: !allUsed });
      mcState.selectedCells = [];
      mcLoadContacts();
    } catch(e) { alertModal({ text: "Błąd: " + e.message }); }
  }

  async function mcDeleteSelected() {
    const rows = new Set(mcState.selectedCells.map(c => c.row));
    if (!rows.size) return;
    if (!await confirmModal({ text: `Usunąć ${rows.size} kontaktów?` })) return;
    try {
      const ids = [...rows].map(i => mcState.contacts[i]?.id).filter(Boolean);
      await adminPost("/marketing/contacts/delete", { ids });
      mcState.selectedCells = [];
      mcLoadContacts();
    } catch(e) { alertModal({ text: "Błąd: " + e.message }); }
  }

  function mcUpdatePagination(total) {
    const pages = Math.ceil(total / MC_PAGE_SIZE) || 1;
    document.getElementById("mcPageInfo").textContent = `Strona ${mcState.page} / ${pages} (${total})`;
    document.getElementById("mcPrevPage").disabled = mcState.page <= 1;
    document.getElementById("mcNextPage").disabled = mcState.page >= pages;
  }

  async function mcLoadLogs() {
    const el = document.getElementById("mcLogsContainer");
    try {
      const data = await adminGet("/marketing/logs", "rows");
      // Odwróć, aby najstarsze były na górze, najnowsze na dole (chronologicznie)
      mcState.logs = (data || []).reverse();
      mcRenderLogs();
    } catch(e) { el.innerHTML = `<div class="mc-empty">Błąd: ${e.message}</div>`; }
  }
  function mcRenderLogs() {
    const el = document.getElementById("mcLogsContainer");
    if (!mcState.logs.length) { el.innerHTML = '<div class="mc-empty">Brak logów</div>'; return; }
    el.innerHTML = mcState.logs.slice().map(l => {
      const time = new Date(l.created_at).toLocaleString("pl-PL",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
      const levelClass = {info:"info",success:"success",warning:"warning",error:"error"}[l.level] || "info";
      const levelText = {info:"INFO",success:"OK",warning:"WARN",error:"ERR"}[l.level] || l.level;
      return `<div class="mc-log-entry"><span class="mc-log-time">${time}</span><span class="mc-log-level ${levelClass}">${levelText}</span><span class="mc-log-message">${mcEsc(l.message)}</span></div>`;
    }).join("");
    el.scrollTop = el.scrollHeight;
  }

  function mcStartLogAutoRefresh() {
    if (mcState.logTimer) return;
    mcState.logTimer = setInterval(async () => {
      try {
        let data;
        try { data = await mcLeads("search-runs/status"); } catch {
          mcStopLogAutoRefresh();
          return;
        }
        mcState.status = data.status || "idle";
        mcState.logRun = data.run_id;
        mcUpdateButtons();
        if (mcState.page === 1) mcLoadContacts();
        if (mcState.status !== "running") {
          mcStopLogAutoRefresh();
        }
      } catch(e) {}
    }, 3000);
    // Logi co 2 s (tabela tylko przez Worker, bez Realtime)
    mcState.logPollTimer = setInterval(() => mcLoadLogs(), 2000);
  }

  function mcStopLogAutoRefresh() {
    if (mcState.logTimer) { clearInterval(mcState.logTimer); mcState.logTimer = null; }
    if (mcState.logPollTimer) { clearInterval(mcState.logPollTimer); mcState.logPollTimer = null; }
  }

  // Init MC events
  document.getElementById("mcActionBtn")?.addEventListener("click", () => window.mcAction());
  document.getElementById("mcCancelBtn")?.addEventListener("click", () => window.mcCancel());
  document.getElementById("mcRefreshBtn")?.addEventListener("click", () => { mcLoadRuns(); mcLoadContacts(); mcLoadLogs(); });
  {
    let mcSearchTimer = null;
    const searchInput = document.getElementById("mcSearchInput");
    const searchClearBtn = document.getElementById("mcSearchClearBtn");
    searchInput?.addEventListener("input", (e) => {
      if (searchClearBtn) searchClearBtn.hidden = !e.target.value;
      clearTimeout(mcSearchTimer);
      mcSearchTimer = setTimeout(() => {
        mcSearchValue = e.target.value;
        mcState.page = 1;
        mcLoadContacts();
      }, 300);
    });
    searchClearBtn?.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = "";
      searchClearBtn.hidden = true;
      clearTimeout(mcSearchTimer);
      mcSearchValue = "";
      mcState.page = 1;
      mcLoadContacts();
      searchInput.focus();
    });
  }
  initUiSelect(document.getElementById("mcFilterUsed"), {
    options: [
      { value: "", label: "Wszystkie" },
      { value: "false", label: "Nieużywane" },
      { value: "true", label: "Używane" },
    ],
    value: "",
    onChange: (val) => { mcFilterUsedValue = val; mcState.page = 1; mcLoadContacts(); },
  });
  document.getElementById("mcMarkUsedBtn")?.addEventListener("click", mcMarkUsed);
  document.getElementById("mcDeleteBtn")?.addEventListener("click", mcDeleteSelected);
  document.getElementById("mcCopyBtn")?.addEventListener("click", () => {
    if (!mcState.selectedCells.length) return;
    const tbody = document.getElementById("mcTableBody");
    const rows = {};
    mcState.selectedCells.forEach(({row, col}) => { (rows[row] = rows[row] || []).push(col); });
    const sortedRows = Object.keys(rows).map(Number).sort((a, b) => a - b);
    const allCols = [...new Set(mcState.selectedCells.map(c => c.col))].sort((a, b) => a - b);
    const text = sortedRows.map(r =>
      allCols.map(c => {
        const el = tbody?.querySelector(`.mc-selectable[data-row="${r}"][data-col="${c}"]`);
        return el ? el.textContent.trim() : '';
      }).join('\t')
    ).join('\n');

    const btn = document.getElementById("mcCopyBtn");
    function flash(ok) {
      if (!btn) return;
      const orig = btn.innerHTML;
      btn.innerHTML = ok ? iconText('check', 'Skopiowano') : iconText('error', 'Błąd');
      setTimeout(() => { btn.innerHTML = orig; }, 1200);
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => flash(true)).catch(() => {
        try { fallbackCopy(text); flash(true); } catch { flash(false); }
      });
    } else {
      try { fallbackCopy(text); flash(true); } catch { flash(false); }
    }

    function fallbackCopy(txt) {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.className = "offscreen-copy";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) throw new Error('execCommand failed');
    }
  });
  document.getElementById("mcPrevPage")?.addEventListener("click", () => { if(mcState.page>1){mcState.page--;mcLoadContacts();} });
  document.getElementById("mcNextPage")?.addEventListener("click", () => { mcState.page++; mcLoadContacts(); });
  document.getElementById("mcAutoRefreshLogs")?.addEventListener("change", (e) => { if(e.target.checked) mcStartLogAutoRefresh(); else mcStopLogAutoRefresh(); });
  mcInitSorting();

  // Load MC data when entering tab
  const origSetTab = window.setActiveTabMC;
  const mcObserver = new MutationObserver(async () => {
    if (!document.getElementById("marketingContactsPanel")?.hidden) {
      mcLoadContacts();
      await mcLoadRuns();
      mcLoadLogs();
      if (document.getElementById("mcAutoRefreshLogs")?.checked) mcStartLogAutoRefresh();
      await loadAiProviderOrder();
      }

  });
  const mcPanel = document.getElementById("marketingContactsPanel");
  if (mcPanel) mcObserver.observe(mcPanel, { attributes: true, attributeFilter: ["hidden"] });
  mcUpdateButtons();
}
