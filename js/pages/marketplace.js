// js/pages/marketplace.js

import { sb, buildSiteUrl } from "../core/supabase.js?v=v2026-04-23T16213";
import { getUser } from "../core/auth.js?v=v2026-04-23T16213";
import { isGuestUser } from "../core/guest-mode.js?v=v2026-04-23T16213";
import { initI18n, t, getUiLang, withLangParam, applyTranslations } from "../../translation/translation.js?v=v2026-04-23T16213";
import { initTopbarAccountDropdown } from "../core/topbar-controller.js?v=v2026-04-23T16213";
import { exportGame } from "./builder-import-export.js?v=v2026-04-23T16213";
import { initUiSelect } from "../core/ui-select.js?v=v2026-04-23T16213";
import { confirmModal } from "../core/modal.js?v=v2026-04-23T16213";
import "../core/contact-modal.js";

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
let searchTimer   = null;
let detailGameId  = null;
let submitLang    = "pl";
let submitGameUiSelect = null;

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
  btnGoBuilder:  document.getElementById("btnGoBuilder"),
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
  els.viewBrowse.hidden = name !== "browse";
  els.viewMine.hidden   = name !== "mine";
  if (els.btnGoBuilder)  els.btnGoBuilder.hidden  = name !== "browse";
  if (els.btnBackBrowse) els.btnBackBrowse.hidden = name !== "mine";
}

/* =========================================================
   Browse — load + render
========================================================= */
async function loadBrowse({ reset = false } = {}) {

  if (reset) {
    currentOffset = 0;
    if (els.browseGrid) els.browseGrid.innerHTML = "";
  }

  if (els.browseInfo) els.browseInfo.textContent = "";

  const lang = getUiLang();
  const { data, error } = await sb().rpc("market_browse", {
    p_lang:   lang,
    p_search: currentSearch.trim(),
    p_limit:  PAGE_SIZE,
    p_offset: currentOffset,
  });

  if (error) {
    console.error("[marketplace] loadBrowse error:", error);
    if (els.browseInfo) els.browseInfo.textContent = t("marketplace.errorLoad");
    return;
  }

  const rows = Array.isArray(data) ? data : [];

  if (reset && rows.length === 0) {
    if (els.browseGrid) els.browseGrid.innerHTML =
      `<div class="mkt-empty">${esc(t("marketplace.empty"))}</div>`;
    if (els.loadMoreWrap) els.loadMoreWrap.hidden = true;
    return;
  }

  rows.forEach(g => {
    const card = makeGameCard(g);
    els.browseGrid?.appendChild(card);
  });

  currentOffset += rows.length;
  if (els.loadMoreWrap) els.loadMoreWrap.hidden = rows.length < PAGE_SIZE;
  if (els.browseInfo) els.browseInfo.textContent = "";
}

function makeGameCard(g) {
  const card = document.createElement("div");
  const isProducer = g.origin === "producer" || !g.author_username || g.author_username === "";
  card.className = "mkt-card" + (isProducer ? " mkt-card-producer" : "");
  card.dataset.id = g.id;

  const authorLabel = isProducer
    ? `<span class="mkt-badge mkt-badge-producer">${esc(t("marketplace.producerBadge"))}</span>`
    : `<span class="mkt-author">${esc(t("marketplace.authorLabel").replace("{author}", g.author_username))}</span>`;

  const inLibrary = !!g.in_library;

  card.innerHTML = `
    <div class="mkt-card-top">
      <span class="mkt-lang-badge">${esc(g.lang.toUpperCase())}</span>
      ${inLibrary ? `<span class="mkt-badge mkt-badge-added">${esc(t("marketplace.addedBadge"))}</span>` : ""}
    </div>
    <div class="mkt-card-title">${esc(g.title)}</div>
    <div class="mkt-card-author">${authorLabel}</div>
    <div class="mkt-card-desc">${esc(g.description)}</div>
    <div class="mkt-card-footer">
      <span class="mkt-count">${esc(t("marketplace.libraryCount").replace("{count}", g.library_count ?? 0))}</span>
      ${starsDisplay(g.avg_rating, g.rating_count)}
    </div>`;

  card.addEventListener("click", () => openDetail(g.id));
  return card;
}

/* =========================================================
   Detail modal
========================================================= */
async function openDetailBySlug(slug) {
  const { data, error } = await sb().rpc("market_game_by_slug", { p_slug: slug }).single();
  if (error || !data) {
    console.error("[marketplace] openDetailBySlug error:", error, slug);
    return;
  }
  await openDetail(data.id, { fromUrl: true });
}

async function openDetail(id, { fromUrl = false } = {}) {
  detailGameId = id;

  // Show modal immediately with loading state
  if (els.detailTitle) els.detailTitle.textContent = "…";
  if (els.detailMeta) els.detailMeta.textContent = "";
  if (els.detailDesc) els.detailDesc.textContent = "";
  if (els.detailQuestions) els.detailQuestions.innerHTML = `<p class="mkt-no-q">${esc(t("marketplace.loading") || "Ładowanie…")}</p>`;
  const detailRating = document.getElementById("detailRating");
  if (detailRating) detailRating.innerHTML = "";
  const detailRaters = document.getElementById("detailRaters");
  if (detailRaters) { detailRaters.hidden = true; detailRaters.innerHTML = ""; }
  if (els.btnAddLibrary) els.btnAddLibrary.hidden = true;
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.hidden = true;
  if (els.addedBadge) els.addedBadge.hidden = true;
  if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "";

  const { data, error } = await sb().rpc("market_game_detail", { p_id: id }).single();
  if (error || !data) {
    console.error("[marketplace] openDetail error:", error);
    if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "none";
    showToast(t("marketplace.errorLoad"), "error");
    return;
  }

  const g = data;
  if (els.detailTitle) els.detailTitle.textContent = g.title;
  if (els.detailMeta) {
    const isProducer = g.origin === "producer" || !g.author_username;
    if (isProducer) {
      els.detailMeta.innerHTML = `${esc(g.lang.toUpperCase())} · <span class="mkt-badge mkt-badge-producer">${esc(t("marketplace.producerBadge"))}</span>`;
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
          `<li>${esc(a.text)} <span class="mkt-pts">(${a.fixed_points ?? 0} pkt)</span></li>`
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
    if (canRate && !g.user_stars) {
      detailRating.appendChild(buildStarInput(id));
    }
  }

  // Raters list (only visible if current user is the author — RPC returns empty otherwise)
  if (detailRaters && currentUser) loadRaters(id, detailRaters);

  // Przyciski biblioteki
  const inLibrary = !!g.in_library;
  const withdrawn = g.status === "withdrawn";
  updateLibraryButtons(inLibrary, withdrawn);

  if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "";

  // Aktualizuj URL → /marketplace/game/[slug] (lub UUID jako fallback przed migracją)
  const urlSegment = g.slug || id;
  history.pushState({ gameId: id, slug: g.slug || null }, "", `/marketplace/game/${urlSegment}`);
}

function updateLibraryButtons(inLibrary, withdrawn = false) {
  const canAdd = !!currentUser && !inLibrary;
  const canRemove = !!currentUser && inLibrary;

  if (els.btnAddLibrary)    els.btnAddLibrary.hidden    = !canAdd;
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.hidden = !canRemove;
  if (els.addedBadge) {
    els.addedBadge.hidden = !inLibrary;
    if (inLibrary && withdrawn) {
      els.addedBadge.textContent = `${t("marketplace.addedBadge")} · ${t("marketplace.withdrawnBadge")}`;
    } else if (inLibrary) {
      els.addedBadge.textContent = t("marketplace.addedBadge");
    }
  }
}

function closeDetail() {
  if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "none";
  detailGameId = null;
  // Przywróć URL → /marketplace
  if (location.pathname.startsWith("/marketplace/game/")) {
    history.pushState(null, "", "/marketplace");
  }
}

/* =========================================================
   Library — add / remove
========================================================= */
async function addToLibrary() {
  if (!detailGameId || !currentUser) return;
  if (els.btnAddLibrary) els.btnAddLibrary.disabled = true;

  const { data, error } = await sb().rpc("market_add_to_library", { p_market_game_id: detailGameId });
  if (els.btnAddLibrary) els.btnAddLibrary.disabled = false;

  if (error) { console.error("[marketplace] addToLibrary error:", error); showToast(t("marketplace.errorLoad"), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) { showToast(res?.err || "error", "error"); return; }

  showToast(t("marketplace.addedBadge"), "success");
  updateLibraryButtons(true);
  refreshCardInLibrary(detailGameId, true);
}

async function removeFromLibrary() {
  if (!detailGameId || !currentUser) return;
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.disabled = true;

  const { data, error } = await sb().rpc("market_remove_from_library", { p_market_game_id: detailGameId });
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.disabled = false;

  if (error) { console.error("[marketplace] removeFromLibrary error:", error); showToast(t("marketplace.errorLoad"), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) { showToast(res?.err || "error", "error"); return; }

  updateLibraryButtons(false);
  refreshCardInLibrary(detailGameId, false);
}

function refreshCardInLibrary(id, inLibrary) {
  const card = els.browseGrid?.querySelector(`[data-id="${id}"]`);
  if (!card) return;
  const badge = card.querySelector(".mkt-badge-added");
  if (inLibrary && !badge) {
    const top = card.querySelector(".mkt-card-top");
    const span = document.createElement("span");
    span.className = "mkt-badge mkt-badge-added";
    span.textContent = t("marketplace.addedBadge");
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

  const { data, error } = await sb().rpc("market_my_submissions");
  if (error) {
    console.error("[marketplace] loadMySent error:", error);
    if (els.mySentInfo) els.mySentInfo.textContent = t("marketplace.errorLoad");
    return;
  }

  const rows = Array.isArray(data) ? data : [];
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
    const statusClass = `mkt-status-${g.status}`;
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
        <span class="mkt-status-badge ${statusClass}">${esc(statusLabels[g.status] ?? g.status)}</span>
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
  if (error) { console.error("[marketplace] withdrawGame error:", error); showToast(t("marketplace.errorLoad"), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) { showToast(res?.err || "error", "error"); return; }

  showToast(t("marketplace.mySent.withdrawn"), "success");
  await loadMySent();
}

/* =========================================================
   Submit modal
========================================================= */
async function openSubmitModal() {
  // Załaduj kwalifikujące się gry (własne, nie z marketplace, min 10 pytań)
  const { data: games } = await sb()
    .from("games")
    .select("id,name,type,status,questions(count)")
    .eq("owner_id", currentUser.id)
    .is("source_market_id", null)
    .eq("is_demo", false)
    .neq("type", "market")
    .order("updated_at", { ascending: false });

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
}

function closeSubmitModal() {
  if (els.submitOverlay) els.submitOverlay.style.display = "none";
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

  if (error) { console.error("[marketplace] submitGame rpc error:", error); showSubmitError(error.message); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) {
    const errCode = res?.err || "submit_failed";
    const errMsg = t(`marketplace.submit.err.${errCode}`) || errCode;
    showSubmitError(errMsg);
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
  const full = Math.round(+avg);
  const stars = "★".repeat(full) + "☆".repeat(5 - full);
  return `<span class="mkt-stars">${stars}</span> <span class="mkt-rating-avg">${(+avg).toFixed(1)}</span> <span class="mkt-rating-count">(${count})</span>`;
}

function buildStarInput(gameId) {
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
    btn.textContent = "★";
    btn.dataset.stars = i;
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

  if (error) { showToast(t("marketplace.errorLoad"), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  if (!res?.ok) {
    if (res?.err === "cannot_rate_own_game") showToast(t("marketplace.rating.ownGameError"), "error");
    else showToast(res?.err || "error", "error");
    return;
  }
  showToast(t("marketplace.rating.saved"), "success");
  // Refresh summary counts in detail header
  const { data: fresh } = await sb().rpc("market_game_detail", { p_id: gameId }).single();
  const detailRatingEl = wrap.closest(".mkt-detail-rating");
  wrap.remove();
  if (fresh) {
    const summary = detailRatingEl?.querySelector(".mkt-rating-summary");
    if (summary) summary.innerHTML = starsDisplay(fresh.avg_rating, fresh.rating_count);
    // Refresh card on browse grid
    const card = els.browseGrid?.querySelector(`[data-id="${gameId}"] .mkt-rating-summary`);
    if (card) card.innerHTML = starsDisplay(fresh.avg_rating, fresh.rating_count);
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
        <span class="mkt-rater-stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span>
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

/* =========================================================
   Wire events
========================================================= */
function wireEvents() {
  // Nav
  els.btnGoBuilder?.addEventListener("click", () => {
    window.location.href = withLangParam(!currentUser ? "/" : "builder");
  });
  els.btnManual?.addEventListener("click", () => {
    const url = new URL("manual", location.href);
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
  els.btnBackBrowse?.addEventListener("click", () => showView("browse"));

  els.searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      currentSearch = els.searchInput.value;
      await loadBrowse({ reset: true });
    }, 350);
  });

  els.btnLoadMore?.addEventListener("click", () => loadBrowse());

  // Detail modal
  els.btnDetailClose?.addEventListener("click", closeDetail);
  els.gameDetailOverlay?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeDetail();
  });
  els.btnAddLibrary?.addEventListener("click", addToLibrary);
  els.btnRemoveLibrary?.addEventListener("click", removeFromLibrary);

  // Submit modal
  els.btnSubmitNew?.addEventListener("click", openSubmitModal);
  els.btnSubmitCancel?.addEventListener("click", closeSubmitModal);
  els.submitOverlay?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeSubmitModal();
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
        if (UUID_RE_NAV.test(param)) openDetail(param);
        else openDetailBySlug(param);
      }
    } else {
      closeDetail();
    }
  });
}

/* =========================================================
   Init
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });

  currentUser = await getUser();
  isGuest = !currentUser || isGuestUser(currentUser);

  // Topbar — user info (account dropdown)
  initTopbarAccountDropdown(currentUser, { showAuthEntry: false });

  if (!currentUser) {
    // Anonim: zmień przycisk powrotu na "← Strona główna", ukryj zbędne przyciski
    if (els.btnGoBuilder) {
      els.btnGoBuilder.innerHTML =
        `<span class="only-desktop">${esc(t("marketplace.nav.backHome"))}</span>` +
        `<span class="only-mobile">🏠</span>`;
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


  showView("browse");
  await loadBrowse({ reset: true });

  // Otwórz modal jeśli URL to /marketplace/game/[slug-or-uuid]
  const pathParts = location.pathname.split("/");
  if (pathParts[1] === "marketplace" && pathParts[2] === "game" && pathParts[3]) {
    const param = pathParts[3];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(param)) {
      await openDetail(param);
    } else {
      await openDetailBySlug(param);
    }
  }

  window.addEventListener("i18n:lang", () => loadBrowse({ reset: true }));
});
