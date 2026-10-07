// js/pages/marketplace.js

import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-07T22435";
import { getUser } from "../../shared/js/core/auth.js?v=v2026-10-07T22435";
import { isGuestUser } from "../../shared/js/core/guest-mode.js?v=v2026-10-07T22435";
import { initI18n, t, getUiLang, withLangParam, applyTranslations } from "../../shared/translation/translation.js?v=v2026-10-07T22435";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-07T22435";
import { exportGame } from "../../games/js/games-import-export.js?v=v2026-10-07T22435";
import { initUiSelect } from "../../shared/js/core/ui-select.js?v=v2026-10-07T22435";
import { confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-07T22435";
import { enterModalSheet, exitModalSheet, isSheetViewport, handleSheetBack } from "../../shared/js/core/modal-sheet.js?v=v2026-10-07T22435";
import "../../shared/js/core/contact-modal.js?v=v2026-10-07T22435";
import { icon, iconText, starRating } from "../../shared/js/core/icons.js?v=v2026-10-07T22435";

// Status zgłoszonej gry → wariant oznaczenia (.tag z base.css).
const MKT_STATUS_TAG = { pending: "tag--warn", published: "tag--ok", rejected: "tag--bad", withdrawn: "tag--muted" };

/* =========================================================
   Constants
========================================================= */
const PAGE_SIZE = 20;

/* =========================================================
   State
========================================================= */
let currentUser   = null;
let isGuest       = false;
let currentOffset = 0;
let currentSearch = "";
let currentLangFilter = "all";
let currentSort = "recommended";
let searchTimer   = null;
let detailGameId  = null;
let detailGame    = null;
let submitLang    = "pl";
let submitGameUiSelect = null;
let langFilterUiSelect = null;
let sortUiSelect = null;
let browseRequest = 0;
let detailRequest = 0;
let browseLoading = false;
let browseRows = [];
let currentView = "browse";
let lastDetailTrigger = null;

// Strona przełącza się między widokiem "browse" (przycisk wstecz:
// btnGoGames) i "mine" (przycisk wstecz: btnBackBrowse) -- w danej
// chwili widoczny jest dokładnie jeden z nich (patrz showView()), więc
// modale sheet biorą jako backBtn ten, który akurat nie jest ukryty.
function currentBackBtn() {
  if (els.btnBackBrowse && !els.btnBackBrowse.hidden) return els.btnBackBrowse;
  return els.btnGoGames;
}

/* =========================================================
   Elements
========================================================= */
const els = {
  // views
  viewBrowse:  document.getElementById("viewBrowse"),
  viewMine:    document.getElementById("viewMine"),
  // browse
  browseGrid:  document.getElementById("browseGrid"),
  browseInfo:  document.getElementById("browseInfo"),
  searchInput: document.getElementById("searchInput"),
  langFilter: document.getElementById("langFilter"),
  sortSelect: document.getElementById("sortSelect"),
  loadMoreWrap:document.getElementById("loadMoreWrap"),
  btnLoadMore: document.getElementById("btnLoadMore"),
  btnMySent:   document.getElementById("btnMySent"),
  // mine
  mySentList:  document.getElementById("mySentList"),
  mySentInfo:  document.getElementById("mySentInfo"),
  btnSubmitNew:document.getElementById("btnSubmitNew"),
  // detail modal
  gameDetailOverlay: document.getElementById("gameDetailOverlay"),
  detailTitle:  document.getElementById("detailTitle"),
  detailMeta:   document.getElementById("detailMeta"),
  detailDesc:   document.getElementById("detailDesc"),
  detailQuestions: document.getElementById("detailQuestions"),
  detailRating: document.getElementById("detailRating"),
  detailRaters: document.getElementById("detailRaters"),
  btnDetailClose:  document.getElementById("btnDetailClose"),
  btnAddLibrary:   document.getElementById("btnAddLibrary"),
  btnRemoveLibrary:document.getElementById("btnRemoveLibrary"),
  addedBadge:      document.getElementById("addedBadge"),
  // submit modal
  submitOverlay:       document.getElementById("submitOverlay"),
  submitGameSelectEl:  document.getElementById("submitGameSelect"),
  submitNoEligible:    document.getElementById("submitNoEligible"),
  submitTitle:      document.getElementById("submitTitle"),
  submitDesc:       document.getElementById("submitDesc"),
  submitLangPicker: document.getElementById("submitLangPicker"),
  submitConfirm:    document.getElementById("submitConfirm"),
  submitError:      document.getElementById("submitError"),
  btnSubmitCancel:  document.getElementById("btnSubmitCancel"),
  btnSubmitConfirm: document.getElementById("btnSubmitConfirm"),
  // nav
  btnGoGames:  document.getElementById("btnGoGames"),
  btnBackBrowse: document.getElementById("btnBackBrowse"),
  btnManual:     document.getElementById("btnManual"),
  toast:        document.getElementById("toast"),
};

/* =========================================================
   Toast
========================================================= */
let toastTimer = null;
function showToast(msg, type = "info") {
  if (!els.toast) return;
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.className = `toast show${type === "error" ? " error" : type === "success" ? " success" : ""}`;
  toastTimer = setTimeout(() => els.toast?.classList.remove("show"), 3500);
}

/* =========================================================
   Views
========================================================= */
function showView(name) {
  currentView = name;
  els.viewBrowse.hidden = name !== "browse";
  els.viewMine.hidden   = name !== "mine";
  if (els.btnGoGames)  els.btnGoGames.hidden  = name !== "browse";
  if (els.btnBackBrowse) els.btnBackBrowse.hidden = name !== "mine";
}

function langFilterOptions() {
  return [
    { value: "all", label: t("marketplace.filterAll") },
    { value: "pl", label: "Polski" },
    { value: "en", label: "English" },
    { value: "uk", label: "Українська" },
  ];
}

function sortOptions() {
  return [
    { value: "recommended", label: t("marketplace.sortRecommended") },
    { value: "rating", label: t("marketplace.sortRating") },
    { value: "popular", label: t("marketplace.sortPopular") },
    { value: "newest", label: t("marketplace.sortNewest") },
    { value: "title", label: t("marketplace.sortTitle") },
  ];
}

function refreshBrowseSelectLabels() {
  langFilterUiSelect?.setOptions(langFilterOptions());
  sortUiSelect?.setOptions(sortOptions());
}

function initBrowseUiSelects() {
  langFilterUiSelect = initUiSelect(els.langFilter, {
    options: langFilterOptions(),
    value: currentLangFilter,
    onChange: async (value) => {
      if (value === currentLangFilter) return;
      currentLangFilter = value;
      syncBrowseParams();
      await loadBrowse({ reset: true });
    },
  });

  sortUiSelect = initUiSelect(els.sortSelect, {
    options: sortOptions(),
    value: currentSort,
    onChange: async (value) => {
      if (value === currentSort) return;
      currentSort = value;
      syncBrowseParams();
      await loadBrowse({ reset: true });
    },
  });
}

/* =========================================================
   Browse — load + render
========================================================= */
async function loadBrowse({ reset = false } = {}) {

  if (browseLoading && !reset) return;

  if (!reset) {
    const nextRows = browseRows.slice(currentOffset, currentOffset + PAGE_SIZE);
    nextRows.forEach(g => els.browseGrid?.appendChild(makeGameCard(g)));
    currentOffset += nextRows.length;
    if (els.loadMoreWrap) els.loadMoreWrap.hidden = currentOffset >= browseRows.length;
    return;
  }

  const requestId = ++browseRequest;
  browseLoading = true;
  if (els.btnLoadMore) els.btnLoadMore.disabled = true;

  if (reset) {
    currentOffset = 0;
    if (els.browseGrid) els.browseGrid.innerHTML = "";
  }

  if (els.browseInfo) els.browseInfo.textContent = t("marketplace.loading");

  const lang = getUiLang();
  const { data, error } = await sb().rpc("market_browse", {
    p_lang:   lang,
    p_search: currentSearch.trim(),
    p_limit:  100,
    p_offset: 0,
  });

  if (requestId !== browseRequest) return;
  browseLoading = false;
  if (els.btnLoadMore) els.btnLoadMore.disabled = false;

  if (error) {
    console.error("[marketplace] loadBrowse error:", error);
    if (els.browseInfo) els.browseInfo.textContent = t("marketplace.errorLoad");
    return;
  }

  let rows = Array.isArray(data) ? data : [];
  if (currentLangFilter !== "all") rows = rows.filter(g => g.lang === currentLangFilter);
  rows.sort((a, b) => compareBrowseRows(a, b, currentSort, lang));
  browseRows = rows;

  if (reset && rows.length === 0) {
    if (els.browseGrid) els.browseGrid.innerHTML =
      `<div class="mkt-empty">${esc(t("marketplace.empty"))}</div>`;
    if (els.loadMoreWrap) els.loadMoreWrap.hidden = true;
    return;
  }

  rows.slice(0, PAGE_SIZE).forEach(g => {
    const card = makeGameCard(g);
    els.browseGrid?.appendChild(card);
  });

  currentOffset = Math.min(PAGE_SIZE, rows.length);
  if (els.loadMoreWrap) els.loadMoreWrap.hidden = currentOffset >= rows.length;
  if (els.browseInfo) els.browseInfo.textContent = "";
}

function compareBrowseRows(a, b, sort, uiLang) {
  if (sort === "title") return String(a.title).localeCompare(String(b.title), uiLang);
  if (sort === "newest") return new Date(b.created_at) - new Date(a.created_at);
  if (sort === "popular") return (b.library_count || 0) - (a.library_count || 0) || new Date(b.created_at) - new Date(a.created_at);
  if (sort === "rating") return (b.avg_rating || 0) - (a.avg_rating || 0) || (b.rating_count || 0) - (a.rating_count || 0);
  return Number(b.lang === uiLang) - Number(a.lang === uiLang)
    || ((b.rating_count || 0) >= 3 ? (b.avg_rating || 0) : 0) - ((a.rating_count || 0) >= 3 ? (a.avg_rating || 0) : 0)
    || (b.library_count || 0) - (a.library_count || 0)
    || new Date(b.created_at) - new Date(a.created_at);
}

function makeGameCard(g) {
  const card = document.createElement("button");
  card.type = "button";
  const isProducer = g.origin === "producer" || !g.author_username || g.author_username === "";
  card.className = "mkt-card" + (isProducer ? " mkt-card-producer" : "");
  card.dataset.id = g.id;

  const authorLabel = isProducer
    ? `<span class="tag tag--gold mkt-badge-producer">${esc(t("marketplace.producerBadge"))}</span>`
    : `<span class="mkt-author">${esc(t("marketplace.authorLabel").replace("{author}", g.author_username))}</span>`;

  const inLibrary = !!g.in_library;

  card.innerHTML = `
    <div class="mkt-card-top">
      <span class="tag tag--gold mkt-lang-badge">${esc(g.lang.toUpperCase())}</span>
      ${inLibrary ? `<span class="tag tag--ok mkt-badge-added">${iconText("check", t("marketplace.addedBadge"))}</span>` : ""}
    </div>
    <div class="mkt-card-title">${esc(g.title)}</div>
    <div class="mkt-card-author">${authorLabel}</div>
    <div class="mkt-card-desc">${esc(g.description)}</div>
    <div class="mkt-card-footer">
      <span class="mkt-count">${esc(t("marketplace.libraryCount").replace("{count}", g.library_count ?? 0))}</span>
      <span class="mkt-card-rating">${starsDisplay(g.avg_rating, g.rating_count)}</span>
    </div>`;

  card.addEventListener("click", () => openDetail(g.id, { trigger: card }));
  return card;
}

/* =========================================================
   Detail modal
========================================================= */
async function openDetailBySlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ""))) {
    showToast(t("marketplace.detail.notFound"), "error");
    return;
  }
  const { data, error } = await sb().rpc("market_game_by_slug", { p_slug: slug }).single();
  if (error || !data) {
    console.error("[marketplace] openDetailBySlug error:", error, slug);
    showToast(t("marketplace.detail.notFound"), "error");
    return;
  }
  await openDetail(data.id, { updateUrl: false });
}

async function openDetail(id, { updateUrl = true, trigger = null } = {}) {
  const requestId = ++detailRequest;
  detailGameId = id;
  detailGame = null;
  lastDetailTrigger = trigger || document.activeElement;

  // Show modal immediately with loading state
  if (els.detailTitle) els.detailTitle.textContent = "…";
  if (els.detailMeta) els.detailMeta.textContent = "";
  if (els.detailDesc) els.detailDesc.textContent = "";
  if (els.detailQuestions) els.detailQuestions.innerHTML = `<p class="mkt-no-q">${esc(t("marketplace.loading") || "Ładowanie…")}</p>`;
  if (els.detailRating) els.detailRating.innerHTML = "";
  if (els.detailRaters) { els.detailRaters.hidden = true; els.detailRaters.innerHTML = ""; }
  if (els.btnAddLibrary) els.btnAddLibrary.hidden = true;
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.hidden = true;
  if (els.addedBadge) els.addedBadge.hidden = true;
  if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "";
  enterModalSheet(els.gameDetailOverlay, { backBtn: currentBackBtn(), onClose: closeDetail });

  const { data, error } = await sb().rpc("market_game_detail", { p_id: id }).single();
  if (requestId !== detailRequest) return;
  if (error || !data) {
    console.error("[marketplace] openDetail error:", error);
    if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "none";
    exitModalSheet(els.gameDetailOverlay);
    detailGameId = null;
    showToast(t("marketplace.errorLoad"), "error");
    return;
  }

  const g = data;
  detailGame = g;
  renderDetail(g);

  if (updateUrl) setDetailUrl(g.slug || id);
  els.btnDetailClose?.focus();
}

function renderDetail(g) {
  const detailRating = els.detailRating;
  const detailRaters = els.detailRaters;
  if (els.detailTitle) els.detailTitle.textContent = g.title;
  if (els.detailMeta) {
    const isProducer = g.origin === "producer" || !g.author_username;
    if (isProducer) {
      els.detailMeta.innerHTML = `${esc(g.lang.toUpperCase())} · <span class="tag tag--gold mkt-badge-producer">${esc(t("marketplace.producerBadge"))}</span>`;
    } else {
      els.detailMeta.textContent = `${g.lang.toUpperCase()} · ${g.author_username}`;
    }
  }
  if (els.detailDesc) els.detailDesc.textContent = g.description || "";

  // Pytania
  if (els.detailQuestions) {
    const qs = g.payload?.questions ?? [];
    if (!qs.length) {
      els.detailQuestions.innerHTML = `<p class="mkt-no-q">${esc(t("marketplace.detail.noQuestions"))}</p>`;
    } else {
      els.detailQuestions.innerHTML = qs.map((q, i) => {
        const answers = (q.answers ?? []).map(a =>
          `<li>${esc(a.text)} <span class="mkt-pts">(${esc(t("marketplace.detail.points", { count: a.fixed_points ?? 0 }))})</span></li>`
        ).join("");
        return `<div class="mkt-q-block">
          <div class="mkt-q-text">${i + 1}. ${esc(q.text)}</div>
          <ol class="mkt-q-answers">${answers}</ol>
        </div>`;
      }).join("");
    }
  }

  // Rating display + input
  if (detailRating) {
    detailRating.innerHTML = "";
    const summary = document.createElement("div");
    summary.className = "mkt-rating-summary";
    summary.innerHTML = starsDisplay(g.avg_rating, g.rating_count);
    detailRating.appendChild(summary);

    const canRate = !!currentUser && !isGuest && g.status === "published";
    if (canRate) {
      detailRating.appendChild(buildStarInput(g.id, g.user_stars));
    }
  }

  // Raters list (only visible if current user is the author — RPC returns empty otherwise)
  if (detailRaters && currentUser) loadRaters(g.id, detailRaters);

  // Przyciski biblioteki
  const inLibrary = !!g.in_library;
  const withdrawn = g.status === "withdrawn";
  updateLibraryButtons(inLibrary, withdrawn);

  if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "";
}

function marketplaceUrl(pathname = "/marketplace/") {
  const url = new URL(location.href);
  url.pathname = pathname;
  url.searchParams.delete("game");
  return `${url.pathname}${url.search}${url.hash}`;
}

function setDetailUrl(segment) {
  history.pushState({ gameId: detailGameId }, "", marketplaceUrl(`/marketplace/game/${encodeURIComponent(segment)}`));
}

function updateLibraryButtons(inLibrary, withdrawn = false) {
  const canAdd = !!currentUser && !inLibrary;
  const canRemove = !!currentUser && inLibrary;

  if (els.btnAddLibrary)    els.btnAddLibrary.hidden    = !canAdd;
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.hidden = !canRemove;
  if (els.addedBadge) {
    els.addedBadge.hidden = !inLibrary;
    if (inLibrary && withdrawn) {
      els.addedBadge.innerHTML = iconText("check", `${t("marketplace.addedBadge")} · ${t("marketplace.withdrawnBadge")}`);
    } else if (inLibrary) {
      els.addedBadge.innerHTML = iconText("check", t("marketplace.addedBadge"));
    }
  }
}

function closeDetail({ updateUrl = true } = {}) {
  detailRequest++;
  if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "none";
  exitModalSheet(els.gameDetailOverlay);
  detailGameId = null;
  detailGame = null;
  // Przywróć URL → /marketplace
  if (updateUrl && location.pathname.startsWith("/marketplace/game/")) {
    // Zamknięcie nie może dopisywać kolejnego wpisu: sekwencja
    // otwórz → zamknij → otwórz → Wstecz wracałaby do starego detail URL.
    history.replaceState(null, "", marketplaceUrl());
  }
  lastDetailTrigger?.focus?.();
  lastDetailTrigger = null;
}

/* =========================================================
   Library — add / remove
========================================================= */
async function addToLibrary() {
  if (!detailGameId || !currentUser) return;
  if (els.btnAddLibrary) els.btnAddLibrary.disabled = true;

  const { data, error } = await sb().rpc("market_add_to_library", { p_market_game_id: detailGameId });
  if (els.btnAddLibrary) els.btnAddLibrary.disabled = false;

  if (error) { console.error("[marketplace] addToLibrary error:", error); showToast(rpcErrorMessage(error), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) { showToast(marketErrorMessage(res?.err), "error"); return; }

  showToast(t("marketplace.addedBadge"), "success");
  updateLibraryButtons(true, detailGame?.status === "withdrawn");
  if (detailGame) detailGame.in_library = true;
  refreshCardInLibrary(detailGameId, true);
}

async function removeFromLibrary() {
  if (!detailGameId || !currentUser) return;
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.disabled = true;

  const { data, error } = await sb().rpc("market_remove_from_library", { p_market_game_id: detailGameId });
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.disabled = false;

  if (error) { console.error("[marketplace] removeFromLibrary error:", error); showToast(rpcErrorMessage(error), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) { showToast(marketErrorMessage(res?.err), "error"); return; }

  updateLibraryButtons(false);
  if (detailGame) detailGame.in_library = false;
  refreshCardInLibrary(detailGameId, false);
}

function refreshCardInLibrary(id, inLibrary) {
  const card = els.browseGrid?.querySelector(`[data-id="${id}"]`);
  if (!card) return;
  const badge = card.querySelector(".mkt-badge-added");
  if (inLibrary && !badge) {
    const top = card.querySelector(".mkt-card-top");
    const span = document.createElement("span");
    span.className = "tag tag--ok mkt-badge-added";
    span.innerHTML = iconText("check", t("marketplace.addedBadge"));
    top?.appendChild(span);
  } else if (!inLibrary && badge) {
    badge.remove();
  }
}

/* =========================================================
   Moje wysłane
========================================================= */
async function loadMySent() {
  if (!els.mySentList) return;
  els.mySentList.innerHTML = "";
  if (els.mySentInfo) els.mySentInfo.textContent = t("marketplace.loading");

  const { data, error } = await sb().rpc("market_my_submissions");
  if (error) {
    console.error("[marketplace] loadMySent error:", error);
    if (els.mySentInfo) els.mySentInfo.textContent = t("marketplace.errorLoad");
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  if (els.mySentInfo) els.mySentInfo.textContent = "";
  if (!rows.length) {
    els.mySentList.innerHTML = `<p class="mkt-empty">${esc(t("marketplace.mySent.empty"))}</p>`;
    return;
  }

  const statusLabels = {
    pending:   t("marketplace.mySent.statusPending"),
    published: t("marketplace.mySent.statusPublished"),
    rejected:  t("marketplace.mySent.statusRejected"),
    withdrawn: t("marketplace.mySent.statusWithdrawn"),
  };

  els.mySentList.innerHTML = rows.map(g => {
    const statusClass = MKT_STATUS_TAG[g.status] || "";
    const note = g.moderation_note
      ? `<div class="mkt-sent-note">${esc(t("marketplace.mySent.reasonLabel").replace("{note}", g.moderation_note))}</div>`
      : "";
    const withdrawBtn = g.status === "published"
      ? `<button class="btn sm" data-withdraw="${esc(g.id)}" type="button">${esc(t("marketplace.mySent.btnWithdraw"))}</button>`
      : "";
    const ratingInfo = g.rating_count
      ? `<span class="mkt-sent-rating">${starsDisplay(g.avg_rating, g.rating_count)}</span>`
      : "";
    const libraryInfo = `<span class="mkt-sent-library">${esc(t("marketplace.libraryCount").replace("{count}", g.library_count ?? 0))}</span>`;
    return `<div class="mkt-sent-row">
      <div class="mkt-sent-info">
        <div class="mkt-sent-title">${esc(g.title)}</div>
        <div class="mkt-sent-meta">${esc(g.lang.toUpperCase())} · ${libraryInfo} ${ratingInfo}</div>
        <span class="tag tag--upper ${statusClass} mkt-status-badge">${esc(statusLabels[g.status] ?? g.status)}</span>
        ${note}
      </div>
      <div class="mkt-sent-actions">
        <button class="btn sm" data-preview="${esc(g.id)}" type="button">${esc(t("marketplace.mySent.btnPreview"))}</button>
        ${withdrawBtn}
      </div>
    </div>`;
  }).join("");

  // Wire withdraw buttons
  els.mySentList.querySelectorAll("[data-withdraw]").forEach(btn => {
    btn.addEventListener("click", () => withdrawGame(btn.dataset.withdraw));
  });
  // Wire preview buttons
  els.mySentList.querySelectorAll("[data-preview]").forEach(btn => {
    btn.addEventListener("click", () => openDetail(btn.dataset.preview));
  });
}

async function withdrawGame(id) {
  const ok = await confirmModal({
    title: t("marketplace.mySent.withdrawConfirmTitle"),
    text:  t("marketplace.mySent.withdrawConfirm"),
    okText:     t("marketplace.mySent.btnWithdraw"),
    cancelText: t("common.cancel"),
  });
  if (!ok) return;

  const { data, error } = await sb().rpc("market_withdraw", { p_market_game_id: id });
  if (error) { console.error("[marketplace] withdrawGame error:", error); showToast(rpcErrorMessage(error), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) { showToast(marketErrorMessage(res?.err), "error"); return; }

  showToast(t("marketplace.mySent.withdrawn"), "success");
  await loadMySent();
}

/* =========================================================
   Submit modal
========================================================= */
async function openSubmitModal() {
  // Załaduj kwalifikujące się gry (własne, nie z marketplace, min 10 pytań)
  const { data: games, error } = await sb()
    .from("games")
    .select("id,name,type,status,questions(count)")
    .eq("owner_id", currentUser.id)
    .is("source_market_id", null)
    .eq("is_demo", false)
    .neq("type", "market")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[marketplace] eligible games error:", error);
    showToast(t("marketplace.submit.errorLoadEligible"), "error");
    return;
  }

  const eligible = (games || []).filter(g => {
    const qCount = g.questions?.[0]?.count ?? 0;
    if (g.type === "prepared") return qCount >= 10;
    return g.status === "ready";
  });


  const hasEligible = eligible.length > 0;

  if (submitGameUiSelect) {
    submitGameUiSelect.setOptions(eligible.map(g => ({ value: g.id, label: g.name })));
    submitGameUiSelect.setValue("", { silent: true });
  }
  if (els.submitGameSelectEl) els.submitGameSelectEl.hidden = !hasEligible;
  if (els.submitNoEligible) els.submitNoEligible.hidden = hasEligible;
  if (els.submitTitle) els.submitTitle.value = "";
  if (els.submitDesc) els.submitDesc.value = "";
  if (els.submitConfirm) els.submitConfirm.checked = false;
  if (els.submitError) els.submitError.hidden = true;

  // Reset lang picker
  submitLang = getUiLang();
  els.submitLangPicker?.querySelectorAll("[data-lang]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === submitLang);
  });

  if (els.submitOverlay) els.submitOverlay.style.display = "";
  enterModalSheet(els.submitOverlay, { backBtn: currentBackBtn(), onClose: closeSubmitModal });
}

function closeSubmitModal() {
  if (els.submitOverlay) els.submitOverlay.style.display = "none";
  exitModalSheet(els.submitOverlay);
}

function showSubmitError(msg) {
  if (!els.submitError) return;
  els.submitError.textContent = msg;
  els.submitError.hidden = false;
}

async function submitGame() {
  if (els.submitError) els.submitError.hidden = true;

  const gameId = submitGameUiSelect?.getValue() || "";
  const title  = els.submitTitle?.value.trim() ?? "";
  const desc   = els.submitDesc?.value.trim() ?? "";
  const confirmed = els.submitConfirm?.checked;

  if (!gameId)    return showSubmitError(t("marketplace.submit.errorMissingGame"));
  if (!title)     return showSubmitError(t("marketplace.submit.errorMissingTitle"));
  if (!confirmed) return showSubmitError(t("marketplace.submit.errorCheckbox"));


  if (els.btnSubmitConfirm) els.btnSubmitConfirm.disabled = true;

  let payload;
  try {
    payload = await exportGame(gameId);
  } catch (e) {
    console.error("[marketplace] submitGame export error:", e);
    if (els.btnSubmitConfirm) els.btnSubmitConfirm.disabled = false;
    showSubmitError(String(e?.message || e));
    return;
  }

  const { data, error } = await sb().rpc("market_submit_game", {
    p_game_id:     gameId,
    p_title:       title,
    p_description: desc,
    p_lang:        submitLang,
    p_payload:     payload,
  });

  if (els.btnSubmitConfirm) els.btnSubmitConfirm.disabled = false;

  if (error) { console.error("[marketplace] submitGame rpc error:", error); showSubmitError(rpcErrorMessage(error)); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) {
    const errCode = res?.err || "submit_failed";
    const errKey = `marketplace.submit.err.${errCode}`;
    const errMsg = t(errKey);
    showSubmitError(errMsg === errKey ? t("marketplace.submit.err.submit_failed") : errMsg);
    return;
  }

  showToast(t("marketplace.submit.success"), "success");
  closeSubmitModal();
  await loadMySent();
  fetch("/_api/notify-submission", { method: "POST" }).catch(() => {});
}

/* =========================================================
   Ratings
========================================================= */
function starsDisplay(avg, count) {
  if (!count) return `<span class="mkt-no-rating">${esc(t("marketplace.rating.none"))}</span>`;
  return `<span class="mkt-stars" role="img" aria-label="${(+avg).toFixed(1)}/5">${starRating(avg)}</span> <span class="mkt-rating-avg">${(+avg).toFixed(1)}</span> <span class="mkt-rating-count">(${count})</span>`;
}

function buildStarInput(gameId, selectedStars = 0) {
  const wrap = document.createElement("div");
  wrap.className = "mkt-rate-wrap";

  const label = document.createElement("span");
  label.className = "mkt-rate-label";
  label.textContent = t("marketplace.rating.rateThis");
  wrap.appendChild(label);

  const row = document.createElement("div");
  row.className = "mkt-star-input";
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mkt-star-btn";
    btn.innerHTML = icon("star");
    btn.setAttribute("aria-label", `${i}/5`);
    btn.dataset.stars = i;
    btn.classList.toggle("selected", i <= Number(selectedStars || 0));
    btn.setAttribute("aria-pressed", i === Number(selectedStars || 0) ? "true" : "false");
    btn.addEventListener("mouseover", () => {
      row.querySelectorAll(".mkt-star-btn").forEach((b, j) => b.classList.toggle("hover", j < i));
    });
    btn.addEventListener("click", () => submitRating(gameId, i, wrap, row));
    row.appendChild(btn);
  }
  row.addEventListener("mouseleave", () => {
    row.querySelectorAll(".mkt-star-btn").forEach(b => b.classList.remove("hover"));
  });
  wrap.appendChild(row);
  return wrap;
}

async function submitRating(gameId, stars, wrap, row) {
  row.querySelectorAll(".mkt-star-btn").forEach(b => { b.disabled = true; });
  const { data, error } = await sb().rpc("market_rate_game", { p_market_game_id: gameId, p_stars: stars });
  row.querySelectorAll(".mkt-star-btn").forEach(b => { b.disabled = false; });

  if (error) { showToast(rpcErrorMessage(error), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) {
    showToast(marketErrorMessage(res?.err), "error");
    return;
  }
  showToast(t("marketplace.rating.saved"), "success");
  // Refresh summary counts in detail header
  const { data: fresh } = await sb().rpc("market_game_detail", { p_id: gameId }).single();
  const detailRatingEl = wrap.closest(".mkt-detail-rating");
  if (fresh) {
    detailGame = fresh;
    const summary = detailRatingEl?.querySelector(".mkt-rating-summary");
    if (summary) summary.innerHTML = starsDisplay(fresh.avg_rating, fresh.rating_count);
    wrap.replaceWith(buildStarInput(gameId, fresh.user_stars));
    // Refresh card on browse grid
    const card = els.browseGrid?.querySelector(`[data-id="${CSS.escape(gameId)}"]`);
    const oldRating = card?.querySelector(".mkt-card-rating");
    if (oldRating) oldRating.innerHTML = starsDisplay(fresh.avg_rating, fresh.rating_count);
  }
}

async function loadRaters(gameId, container) {
  const { data, error } = await sb().rpc("market_game_raters", { p_market_game_id: gameId });
  if (error || !data?.length) return;
  container.hidden = false;
  container.innerHTML =
    `<div class="mkt-raters-title">${esc(t("marketplace.rating.ratersTitle"))}</div>` +
    data.map(r =>
      `<div class="mkt-rater-row">
        <span class="mkt-rater-name">${esc(r.username || "?")}</span>
        <span class="mkt-rater-stars" role="img" aria-label="${r.stars}/5">${icon("star").repeat(r.stars)}${icon("star-empty").repeat(5 - r.stars)}</span>
      </div>`
    ).join("");
}

/* =========================================================
   Helpers
========================================================= */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function marketErrorMessage(code) {
  const key = `marketplace.errors.${String(code || "unknown")}`;
  const translated = t(key);
  return translated === key ? t("marketplace.errors.unknown") : translated;
}

// Wyjątki plpgsql (`RAISE EXCEPTION`) trafiają do Supabase w `message`, nie
// w `code`. Najpierw mapujemy znany tekst backendu, dopiero potem fallback.
function rpcErrorMessage(error) {
  const message = String(error?.message || "");
  const known = [
    "not_authenticated", "game_not_available", "game_not_found",
    "invalid_stars", "cannot_rate_own_game", "not_found_or_not_published",
  ].find(code => message.includes(code));
  return marketErrorMessage(known || "unknown");
}

/* =========================================================
   Wire events
========================================================= */
function wireEvents() {
  // Znaczniki dla contact-modal.js -- patrz js/pages/bases.js dla wyjaśnienia.
  if (els.btnGoGames) els.btnGoGames.dataset.sheetBack = "1";
  if (els.btnBackBrowse) els.btnBackBrowse.dataset.sheetBack = "1";

  // Nav
  els.btnGoGames?.addEventListener("click", () => {
    if (handleSheetBack()) return;
    window.location.href = withLangParam(!currentUser ? "/" : "/games/");
  });
  els.btnManual?.addEventListener("click", () => {
    const url = new URL("/manual/", location.href);
    url.searchParams.set("ret", "marketplace");
    url.hash = "community";
    location.href = url.toString();
  });
  // Browse
  els.btnMySent?.addEventListener("click", async () => {
    if (isGuest || !currentUser) return;
    showView("mine");
    await loadMySent();
  });
  els.btnBackBrowse?.addEventListener("click", () => {
    if (handleSheetBack()) return;
    showView("browse");
  });

  els.searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      currentSearch = els.searchInput.value;
      syncBrowseParams();
      await loadBrowse({ reset: true });
    }, 350);
  });

  els.btnLoadMore?.addEventListener("click", () => loadBrowse());
  // Detail modal
  els.btnDetailClose?.addEventListener("click", closeDetail);
  els.gameDetailOverlay?.addEventListener("click", e => {
    if (e.target !== e.currentTarget) return;
    // W trybie sheet (mobile) modal zastępuje treść strony — jedynym
    // wyjściem ma być przycisk wstecz w topbarze, nie klik w tło.
    if (els.gameDetailOverlay.classList.contains("modal--sheet") && isSheetViewport()) return;
    closeDetail();
  });
  els.btnAddLibrary?.addEventListener("click", addToLibrary);
  els.btnRemoveLibrary?.addEventListener("click", removeFromLibrary);

  // Submit modal
  els.btnSubmitNew?.addEventListener("click", openSubmitModal);
  els.btnSubmitCancel?.addEventListener("click", closeSubmitModal);
  document.getElementById("btnSubmitClose")?.addEventListener("click", closeSubmitModal);
  els.submitOverlay?.addEventListener("click", e => {
    if (e.target !== e.currentTarget) return;
    // W trybie sheet (mobile) modal zastępuje treść strony — jedynym
    // wyjściem ma być widoczny przycisk zamknięcia/anuluj, nie klik w tło.
    if (els.submitOverlay.classList.contains("modal--sheet") && isSheetViewport()) return;
    closeSubmitModal();
  });
  els.btnSubmitConfirm?.addEventListener("click", submitGame);

  // Lang picker in submit modal
  els.submitLangPicker?.addEventListener("click", e => {
    const btn = e.target.closest("[data-lang]");
    if (!btn) return;
    submitLang = btn.dataset.lang;
    els.submitLangPicker.querySelectorAll("[data-lang]").forEach(b => {
      b.classList.toggle("active", b === btn);
    });
  });

  // Keyboard close
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeDetail();
      closeSubmitModal();
    }
  });

  // Przycisk wstecz w przeglądarce
  const UUID_RE_NAV = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  window.addEventListener("popstate", e => {
    if (location.pathname.startsWith("/marketplace/game/")) {
      const param = location.pathname.split("/")[3];
      if (param) {
        if (UUID_RE_NAV.test(param)) openDetail(param, { updateUrl: false });
        else openDetailBySlug(decodeURIComponent(param));
      }
    } else {
      closeDetail({ updateUrl: false });
      restoreBrowseParams();
      loadBrowse({ reset: true });
    }
  });
}

function syncBrowseParams() {
  const url = new URL(location.href);
  if (currentSearch) url.searchParams.set("q", currentSearch); else url.searchParams.delete("q");
  if (currentLangFilter !== "all") url.searchParams.set("filter", currentLangFilter); else url.searchParams.delete("filter");
  if (currentSort !== "recommended") url.searchParams.set("sort", currentSort); else url.searchParams.delete("sort");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function restoreBrowseParams() {
  const params = new URLSearchParams(location.search);
  const filter = params.get("filter");
  const sort = params.get("sort");
  currentSearch = params.get("q") || "";
  currentLangFilter = ["pl", "en", "uk"].includes(filter) ? filter : "all";
  currentSort = ["recommended", "rating", "popular", "newest", "title"].includes(sort) ? sort : "recommended";
  if (els.searchInput) els.searchInput.value = currentSearch;
  langFilterUiSelect?.setValue(currentLangFilter, { silent: true });
  sortUiSelect?.setValue(currentSort, { silent: true });
}

/* =========================================================
   Init
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const getUserP = getUser().catch(() => null); // start równolegle z initI18n
  await initI18n({ withSwitcher: true });
  document.documentElement.classList.remove('page-loading');
  initBrowseUiSelects();
  window.addEventListener("i18n:lang", refreshBrowseSelectLabels);

  currentUser = await getUserP;
  isGuest = !currentUser || isGuestUser(currentUser);

  // Topbar — user info (account dropdown)
  initTopbarAccountDropdown(currentUser, { showAuthEntry: false });
  document.querySelector('.topbar')?.classList.add('topbar-ready');

  if (!currentUser) {
    // Anonim wraca na Stronę główną; zalogowany użytkownik do „Moich gier”.
    if (els.btnGoGames) {
      // applyTranslations() jest wołane niżej, więc zmieniamy również klucz;
      // inaczej dynamiczny napis zostałby zaraz nadpisany przez „Moje gry”.
      els.btnGoGames.dataset.i18n = "marketplace.nav.backHome";
      els.btnGoGames.dataset.i18nIcon = "arrow-left";
    }
    if (els.btnManual)  els.btnManual.hidden = true;
  }

  // "Moje wysłane" button — only for logged-in non-guests
  if (els.btnMySent) els.btnMySent.hidden = isGuest || !currentUser;

  // init ui-select for game picker in submit modal
  submitGameUiSelect = initUiSelect(els.submitGameSelectEl, {
    placeholder: t("marketplace.submit.pickGamePlaceholder"),
    options: [],
    value: "",
  });

  wireEvents();
  applyTranslations();
  restoreBrowseParams();


  showView("browse");
  await loadBrowse({ reset: true });
  document.getElementById('browseGrid')?.classList.add('skel-step-ready');

  // Otwórz modal jeśli URL to /marketplace/game/[slug-or-uuid]
  const pathParts = location.pathname.split("/");
  if (pathParts[1] === "marketplace" && pathParts[2] === "game" && pathParts[3]) {
    const param = pathParts[3];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(param)) {
      await openDetail(param, { updateUrl: false });
    } else {
      await openDetailBySlug(param);
    }
  }

  window.addEventListener("i18n:lang", async () => {
    if (detailGame) renderDetail(detailGame);
    if (currentView === "mine") await loadMySent();
    await loadBrowse({ reset: true });
  });
});
