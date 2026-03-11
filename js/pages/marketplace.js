// js/pages/marketplace.js

import { sb, buildSiteUrl } from "../core/supabase.js";
import { getUser } from "../core/auth.js";
import { isGuestUser } from "../core/guest-mode.js";
import { initI18n, t, getUiLang, withLangParam, applyTranslations } from "../../translation/translation.js";
import { exportGame } from "./builder-import-export.js";

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
  submitOverlay:    document.getElementById("submitOverlay"),
  submitGameSelect: document.getElementById("submitGameSelect"),
  submitNoEligible: document.getElementById("submitNoEligible"),
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
  btnAccount:    document.getElementById("btnAccount"),
  btnLogout:     document.getElementById("btnLogout"),
  who:          document.getElementById("who"),
  whoStatic:    document.getElementById("whoStatic"),
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
  console.log("[marketplace] loadBrowse", { reset, offset: currentOffset, search: currentSearch });

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
  card.className = "mkt-card";
  card.dataset.id = g.id;

  const isProducer = !g.author_username || g.author_username === "";
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
    </div>`;

  card.addEventListener("click", () => openDetail(g.id));
  return card;
}

/* =========================================================
   Detail modal
========================================================= */
async function openDetail(id) {
  console.log("[marketplace] openDetail id:", id);
  detailGameId = id;

  const { data, error } = await sb().rpc("market_game_detail", { p_id: id }).single();
  if (error || !data) {
    console.error("[marketplace] openDetail error:", error);
    showToast(t("marketplace.errorLoad"), "error");
    return;
  }

  const g = data;
  if (els.detailTitle) els.detailTitle.textContent = g.title;
  if (els.detailMeta) {
    const isProducer = !g.author_username;
    const author = isProducer ? t("marketplace.producerBadge") : g.author_username;
    els.detailMeta.textContent = `${g.lang.toUpperCase()} · ${author}`;
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

  // Przyciski biblioteki
  const inLibrary = !!g.in_library;
  const withdrawn = g.status === "withdrawn";
  updateLibraryButtons(inLibrary, withdrawn);

  if (els.gameDetailOverlay) els.gameDetailOverlay.style.display = "";
}

function updateLibraryButtons(inLibrary, withdrawn = false) {
  const canAdd = !isGuest && !inLibrary;
  const canRemove = !isGuest && inLibrary;

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
}

/* =========================================================
   Library — add / remove
========================================================= */
async function addToLibrary() {
  console.log("[marketplace] addToLibrary", detailGameId);
  if (!detailGameId || isGuest) return;
  if (els.btnAddLibrary) els.btnAddLibrary.disabled = true;

  const { data, error } = await sb().rpc("market_add_to_library", { p_market_game_id: detailGameId });
  if (els.btnAddLibrary) els.btnAddLibrary.disabled = false;

  if (error) { console.error("[marketplace] addToLibrary error:", error); showToast(t("marketplace.errorLoad"), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  console.log("[marketplace] addToLibrary result:", res);
  if (!res?.ok) { showToast(res?.err || "error", "error"); return; }

  showToast(t("marketplace.addedBadge"), "success");
  updateLibraryButtons(true);
  refreshCardInLibrary(detailGameId, true);
}

async function removeFromLibrary() {
  console.log("[marketplace] removeFromLibrary", detailGameId);
  if (!detailGameId || isGuest) return;
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.disabled = true;

  const { data, error } = await sb().rpc("market_remove_from_library", { p_market_game_id: detailGameId });
  if (els.btnRemoveLibrary) els.btnRemoveLibrary.disabled = false;

  if (error) { console.error("[marketplace] removeFromLibrary error:", error); showToast(t("marketplace.errorLoad"), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  console.log("[marketplace] removeFromLibrary result:", res);
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
  console.log("[marketplace] loadMySent");
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
    return `<div class="mkt-sent-row">
      <div class="mkt-sent-info">
        <div class="mkt-sent-title">${esc(g.title)}</div>
        <div class="mkt-sent-meta">${esc(g.lang.toUpperCase())}</div>
        <span class="mkt-status-badge ${statusClass}">${esc(statusLabels[g.status] ?? g.status)}</span>
        ${note}
      </div>
      <div class="mkt-sent-actions">${withdrawBtn}</div>
    </div>`;
  }).join("");

  // Wire withdraw buttons
  els.mySentList.querySelectorAll("[data-withdraw]").forEach(btn => {
    btn.addEventListener("click", () => withdrawGame(btn.dataset.withdraw));
  });
}

async function withdrawGame(id) {
  console.log("[marketplace] withdrawGame id:", id);
  if (!confirm(t("marketplace.mySent.withdrawConfirm"))) return;

  const { data, error } = await sb().rpc("market_withdraw", { p_market_game_id: id });
  if (error) { console.error("[marketplace] withdrawGame error:", error); showToast(t("marketplace.errorLoad"), "error"); return; }
  const res = Array.isArray(data) ? data[0] : data;
  console.log("[marketplace] withdrawGame result:", res);
  if (!res?.ok) { showToast(res?.err || "error", "error"); return; }

  showToast(t("marketplace.mySent.withdrawn"), "success");
  await loadMySent();
}

/* =========================================================
   Submit modal
========================================================= */
async function openSubmitModal() {
  // Załaduj kwalifikujące się gry (grywalne = min 10 pytań + can_play warunki)
  const { data: games } = await sb()
    .from("games")
    .select("id,name,type,status,questions(count)")
    .eq("owner_id", currentUser.id)
    .order("updated_at", { ascending: false });

  const eligible = (games || []).filter(g => {
    const qCount = g.questions?.[0]?.count ?? 0;
    if (g.type === "prepared") return qCount >= 10;
    return g.status === "ready"; // poll_text/poll_points: status=ready już gwarantuje walidację
  });
  console.log("[marketplace] openSubmitModal games fetched:", (games || []).length, "eligible:", eligible.length);

  if (els.submitGameSelect) {
    els.submitGameSelect.innerHTML = `<option value="">${esc(t("marketplace.submit.pickGamePlaceholder"))}</option>`;
    eligible.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.name;
      els.submitGameSelect.appendChild(opt);
    });
  }

  if (els.submitNoEligible) els.submitNoEligible.hidden = eligible.length > 0;
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

  const gameId = els.submitGameSelect?.value;
  const title  = els.submitTitle?.value.trim() ?? "";
  const desc   = els.submitDesc?.value.trim() ?? "";
  const confirmed = els.submitConfirm?.checked;

  if (!gameId)    return showSubmitError(t("marketplace.submit.errorMissingGame"));
  if (!title)     return showSubmitError(t("marketplace.submit.errorMissingTitle"));
  if (!confirmed) return showSubmitError(t("marketplace.submit.errorCheckbox"));

  console.log("[marketplace] submitGame", { gameId, title, lang: submitLang });

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
  console.log("[marketplace] submitGame result:", res);
  if (!res?.ok) {
    const errCode = res?.err || "submit_failed";
    const errMsg = t(`marketplace.submit.err.${errCode}`) || errCode;
    showSubmitError(errMsg);
    return;
  }

  showToast(t("marketplace.submit.success"), "success");
  closeSubmitModal();
  await loadMySent();
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
    window.location.href = withLangParam("builder.html");
  });
  els.btnManual?.addEventListener("click", () => {
    const url = new URL("manual", location.href);
    url.searchParams.set("ret", "marketplace");
    url.hash = "community";
    location.href = url.toString();
  });
  els.btnAccount?.addEventListener("click", () => {
    window.location.href = withLangParam("account.html");
  });
  els.btnLogout?.addEventListener("click", async () => {
    await sb().auth.signOut();
    window.location.href = withLangParam("login.html");
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
}

/* =========================================================
   Init
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });

  currentUser = await getUser();
  isGuest = !currentUser || isGuestUser(currentUser);

  // Topbar — user info
  const whoLabel = currentUser?.username || currentUser?.email || "—";
  if (els.who) els.who.textContent = whoLabel;
  if (els.whoStatic) els.whoStatic.textContent = whoLabel;

  if (!currentUser) {
    if (els.btnAccount)  els.btnAccount.style.display = "none";
    if (els.whoStatic)   els.whoStatic.style.display = "none";
    if (els.btnLogout)   els.btnLogout.textContent = t("common.authEntry");
    if (els.btnLogout)   els.btnLogout.onclick = () => { window.location.href = withLangParam("login.html"); };
  } else if (isGuest) {
    if (els.btnAccount)  els.btnAccount.style.display = "none";
    if (els.whoStatic)   els.whoStatic.style.display = "";
  } else {
    if (els.btnAccount)  els.btnAccount.style.display = "";
    if (els.whoStatic)   els.whoStatic.style.display = "none";
  }

  // "Moje wysłane" button — only for logged-in non-guests
  if (els.btnMySent) els.btnMySent.hidden = isGuest || !currentUser;

  wireEvents();
  applyTranslations();

  console.log("[marketplace] init user:", currentUser?.id, "isGuest:", isGuest);

  showView("browse");
  await loadBrowse({ reset: true });
});
