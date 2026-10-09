// js/pages/polls.js
// Strona ankiety (właściciel): /polls/?id=<gra>.
//   A. Pasek stanu — stan słowem po lewej, WSZYSTKIE akcje po prawej
//      (Uruchom · Zatrzymaj · Wznów głosowanie · Podlicz głosy · Zatwierdź ·
//      Uruchom ponownie · Przerwij). Na telefonie stan u góry, przyciski pod nim.
//   B. Karty Udostępnianie · Wyniki. Wyniki są jedne dla wszystkich stanów:
//      na żywo, zatrzymane (surowe), podliczanie (poll-tally.js), ostateczne.
// Stany gry: draft -> poll_open <-> poll_stopped -> ready (migracja 315).
import { renderShareSections } from "../../shared/js/core/share-sections.js?v=v2026-10-09T18280";
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-09T18280";
import { requireAuth } from "../../shared/js/core/auth.js?v=v2026-10-09T18280";
import { alertModal, confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-09T18280";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { initI18n, t, withLangParam, getUiLang } from "../../shared/translation/translation.js?v=v2026-10-09T18280";
import { linkTo, backHref, renderBackLabel } from "../../shared/js/core/nav-map.js?v=v2026-10-09T18280";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-09T18280";
import { guardResourceLock } from "../../shared/js/core/resource-lock.js?v=v2026-10-09T18280";
import { validateGame, gameRuleErrorMessage, guardGameState } from "../../shared/js/core/game-validate.js?v=v2026-10-09T18280";
import { mailCooldownCheck } from "../../shared/js/core/cooldown.js?v=v2026-10-09T18280";
import { sendPollInviteMails } from "../../shared/js/core/poll-mail.js?v=v2026-10-09T18280";
import "../../shared/js/core/contact-modal.js?v=v2026-10-09T18280";
import { createPollResults } from "../../shared/js/core/poll-results.js?v=v2026-10-09T18280";
import { icon, iconText } from "../../shared/js/core/icons.js?v=v2026-10-09T18280";
import { toast, hideToast } from "../../shared/js/core/toast.js?v=v2026-10-09T18280";
import { createTally } from "./poll-tally.js?v=v2026-10-09T18280";

// initI18n is called at the start of DOMContentLoaded (see below)

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const $ = (id) => document.getElementById(id);

const btnBack = $("btnBack");
const btnManual = $("btnManual");

// pasek stanu
const pollBar = $("pollBar");
const pollStateWord = $("pollStateWord");
const pollStateInfo = $("pollStateInfo");
const hintTop = $("hintTop");
const btnOpenPoll = $("btnOpenPoll");
const btnStopPoll = $("btnStopPoll");
const btnResumePoll = $("btnResumePoll");
const btnTallyPoll = $("btnTallyPoll");
const btnApproveTally = $("btnApproveTally");
const btnLeaveTally = $("btnLeaveTally");
const btnReopenPoll = $("btnReopenPoll");
const btnAbort = $("btnAbort");
const pollActions = $("pollActions");

// treść
const cardMain = $("cardMain");
const cardEmpty = $("cardEmpty");
const tabShare = $("tabShare");
const tabResults = $("tabResults");
const secShare = $("secShare");
const secResults = $("secResults");

// Udostępnianie
const shareEmpty = $("shareEmpty");
const shareBody = $("shareBody");
const linkPlaceholder = $("linkPlaceholder");
const linkLive = $("linkLive");
const pollLinkEl = $("pollLink");
const qrBox = $("qr");
const btnCopy = $("btnCopy");
const btnOpen = $("btnOpen");
const btnOpenQr = $("btnOpenQr");
const btnSendInvites = $("btnSendInvites");
const btnSelectAll = $("btnSelectAll");
const subsGrid = $("subsGrid");
const subsEmpty = $("subsEmpty");
const subsSummary = $("subsSummary");
const sendHint = $("sendHint");

// QR modal (wyświetlacz ankiety / kod do głosowania)
const pollQrModalOverlay = $("pollQrModalOverlay");
const pollQrModalTitle = $("pollQrModalTitle");
const pollQrModalSubtitle = $("pollQrModalSubtitle");
const pollQrModalVote = $("pollQrModalVote");
const pollQrModalCode = $("pollQrModalCode");
const pollQrModalActions = $("pollQrModalActions");
const pollQrModalHint = $("pollQrModalHint");
const pollQrModalCodeVal = $("pollQrModalCodeVal");
const pollQrModalCopy = $("pollQrModalCopy");
const pollQrModalOpen = $("pollQrModalOpen");
const pollQrModalClose = $("pollQrModalClose");
let _pollQrDeviceCode = "";
let _pollQrOpenUrl = "";

// Wyniki
const resultsMeta = $("resultsMeta");
const resultsList = $("resultsList");
const tallyBar = $("tallyBar");
const tallyHint = $("tallyHint");
const tallyTools = $("tallyTools");
const tallySave = $("tallySave");
const btnUndo = $("btnUndo");
const btnRedo = $("btnRedo");

let game = null;
let currentUser = null;
let busy = false; // trwa akcja stanu (uruchom / zatrzymaj / podlicz / przerwij)
let lastCheck = null; // wynik validateGame() z ostatniego odświeżenia
let lastPreview = null; // ostatnia odpowiedź get_poll_preview
let votesText = ""; // „12 głosów” w pasku stanu (ankieta otwarta)
let tallyActive = false; // karta Wyniki w trybie podliczania
let tallyValid = false;


const TYPES = {
  POLL_TEXT: "poll_text",
  POLL_POINTS: "poll_points",
  PREPARED: "prepared",
};
const STATUS = {
  DRAFT: "draft",
  POLL_OPEN: "poll_open",
  POLL_STOPPED: "poll_stopped",
  READY: "ready",
};

const LIVE_REFRESH_MS = 5000;

function escapeHtml(s) {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function setMsg(text, kind = "info") {
  if (!text) { hideToast(); return; }
  toast(text, { kind });
}

function typeShortLabel(type) {
  if (type === TYPES.POLL_TEXT) return t("polls.typeShort.text");
  if (type === TYPES.POLL_POINTS) return t("polls.typeShort.points");
  return t("games.types.prepared");
}

function statusLabel(st) {
  const s = st || STATUS.DRAFT;
  if (s === STATUS.DRAFT) return t("games.status.draft");
  if (s === STATUS.POLL_OPEN) return t("games.status.open");
  if (s === STATUS.POLL_STOPPED) return t("games.status.stopped");
  if (s === STATUS.READY) return t("games.status.ready");
  return String(s).toUpperCase();
}

function formatUntil(untilMs) {
  try {
    return new Date(untilMs).toLocaleString(getUiLang() || "pl", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return new Date(untilMs).toLocaleString();
  }
}

/* =======================
   QR modal: wyświetlacz (kod urządzenia) albo powiększony kod do głosowania
======================= */

function hidePollQrModal() {
  if (pollQrModalOverlay) pollQrModalOverlay.classList.add("hidden");
}

function setQrModalMode(vote) {
  if (pollQrModalVote) pollQrModalVote.hidden = !vote;
  for (const el of [pollQrModalCode, pollQrModalActions, pollQrModalHint]) if (el) el.hidden = !!vote;
  if (pollQrModalTitle) pollQrModalTitle.textContent = vote ? t("polls.qrModal.voteTitle") : t("polls.qrModal.title");
  if (pollQrModalSubtitle) pollQrModalSubtitle.textContent = vote ? t("polls.qrModal.voteSubtitle") : t("polls.qrModal.subtitle");
}

// Kliknięcie małego QR: ten sam kod do głosowania, powiększony.
async function showVoteQrModal() {
  const url = pollLinkEl?.value;
  if (!url || !pollQrModalVote) return;
  setQrModalMode(true);
  pollQrModalVote.innerHTML = "";
  pollQrModalOverlay?.classList.remove("hidden");
  try {
    const wrap = document.createElement("div");
    wrap.className = "qrFrameSmall qrFrameBig";
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, url, { width: 640, margin: 1 });
    wrap.appendChild(canvas);
    pollQrModalVote.appendChild(wrap);
  } catch (e) {
    console.warn("[polls] big QR failed:", e);
    pollQrModalVote.textContent = t("polls.qrFailed");
  }
}

async function showPollQrModal() {
  if (!game || !pollLinkEl?.value) return;
  setQrModalMode(false);

  // URL do strony wyświetlacza (poll-qr) — zawiera aktualny język polls
  const displayUrl = new URL("/polls/vote/qr/", location.href);
  displayUrl.searchParams.set("id", game.id);
  displayUrl.searchParams.set("key", game.share_key_poll);
  displayUrl.searchParams.set("lang", getUiLang() || "pl");
  _pollQrOpenUrl = displayUrl.toString();

  if (pollQrModalCodeVal) pollQrModalCodeVal.textContent = "——————";
  if (pollQrModalOverlay) pollQrModalOverlay.classList.remove("hidden");

  try {
    const { data, error } = await sb().rpc("generate_device_connect_code", {
      p_game_id:     game.id,
      p_device_type: "poll_qr",
      p_share_key:   game.share_key_poll,
      p_game_name:   game.name,
    });
    if (error || !data?.ok) throw new Error(error?.message || "RPC error");
    _pollQrDeviceCode = data.code;
    if (pollQrModalCodeVal) pollQrModalCodeVal.textContent = data.code;
  } catch (e) {
    console.warn("[polls] showPollQrModal error", e);
    setMsg(t("common.genericError") || "Błąd.", "error");
  }
}

pollQrModalClose?.addEventListener("click", hidePollQrModal);
pollQrModalOverlay?.addEventListener("click", (e) => {
  if (e.target === pollQrModalOverlay) hidePollQrModal();
});
pollQrModalCopy?.addEventListener("click", async () => {
  if (!_pollQrDeviceCode) return;
  try {
    await navigator.clipboard.writeText(_pollQrDeviceCode);
    setMsg(t("polls.qrModal.copied"));
  } catch {
    setMsg(t("polls.copy.failed"), "error");
  }
});
pollQrModalOpen?.addEventListener("click", () => {
  if (!_pollQrOpenUrl) return;
  const u = new URL(withLangParam("/polls/vote/qr/"), location.href);
  u.searchParams.set("url", _pollQrOpenUrl);
  window.open(u.toString(), "_blank", "noopener,noreferrer");
});

// --- Język QR-a w ankietach (games.poll_qr_lang, migracja 269) ---
// Język jest PERSYSTOWANY na games.poll_qr_lang -- poll-qr.js samo się o niego
// dopytuje (pollowanie), więc broadcastLang() tylko zapisuje, nigdy nie czeka
// na odbiorcę.
async function broadcastLang(lang) {
  if (!game?.id) return;
  try {
    await sb().rpc("set_poll_qr_lang", { p_game_id: game.id, p_lang: lang });
  } catch (e) {
    console.warn("[polls] set_poll_qr_lang failed", e);
  }
}

window.addEventListener("i18n:lang", (e) => {
  const lang = e?.detail?.lang;
  if (!lang) return;

  broadcastLang(lang);
  tally.relabel();
  void refresh();
});

/* =======================
   Link i QR
======================= */

function setLinkUiVisible(on) {
  const v = !!on;
  if (btnCopy) btnCopy.disabled = !v;
  if (btnOpen) btnOpen.disabled = !v;
  if (btnOpenQr) btnOpenQr.disabled = !v;
  if (qrBox) qrBox.disabled = !v;
  if (!v) clearQr();
}

function clearQr() {
  if (qrBox) qrBox.innerHTML = "";
}

let renderedQrUrl = "";
async function renderQr(url) {
  if (!qrBox) return;
  if (url === renderedQrUrl && qrBox.firstChild) return;
  renderedQrUrl = url;
  qrBox.innerHTML = "";
  if (!url) return;

  try {
    const wrap = document.createElement("div");
    wrap.className = "qrFrameSmall";

    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, url, { width: 320, margin: 1 });

    wrap.appendChild(canvas);
    qrBox.appendChild(wrap);
  } catch (e) {
    console.warn("[polls] QR failed:", e);
    qrBox.textContent = t("polls.qrFailed");
  }
}

function pollLink(g) {
  if (!g) return "";
  const base =
    g.type === TYPES.POLL_TEXT
      ? "/polls/vote/text/"
      : g.type === TYPES.POLL_POINTS
      ? "/polls/vote/points/"
      : "";
  if (!base) return "";

  const u = new URL(withLangParam(base), location.href);
  u.searchParams.set("id", g.id);
  u.searchParams.set("key", g.share_key_poll);
  return u.toString();
}

/* =======================
   DB helpers
======================= */

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_poll,poll_opened_at,poll_closed_at")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function listQuestionsBasic() {
  const { data, error } = await sb()
    .from("questions")
    .select("id, ord, text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

function rpcErrText(error, data) {
  return error?.message || error?.details || data?.err || data?.error || t("common.genericError");
}

/* =======================
   Wyniki — jedna lista dla wszystkich stanów
   Na żywo (otwarta), surowe (zatrzymana), podliczanie (poll-tally.js),
   ostateczne (gotowa). Lista budowana raz; potem tylko liczby i szerokości
   pasków (przejścia CSS) — bez skakania.
======================= */

const pollResults = createPollResults(resultsList);
function resetResultsDom() { pollResults.reset(); }

const tally = createTally({
  gameId,
  pollResults,
  ui: {
    barEl: tallyBar,
    hintEl: tallyHint,
    toolsEl: tallyTools,
    saveEl: tallySave,
    undoBtn: btnUndo,
    redoBtn: btnRedo,
    onValidity: (ok) => { tallyValid = !!ok; renderBar(); },
    onNotice: (text) => setMsg(text),
  },
});

async function previewResults() {
  if (!game || !resultsList) return;
  if (game.type === TYPES.PREPARED) {
    resetResultsDom();
    if (resultsMeta) resultsMeta.textContent = t("polls.meta.prepared");
    return;
  }
  if (game.status === STATUS.DRAFT) {
    resetResultsDom();
    lastPreview = null;
    if (resultsMeta) resultsMeta.textContent = t("polls.results.draftEmpty");
    return;
  }

  const { data, error } = await sb().rpc("get_poll_preview", { p_game_id: gameId });
  if (error) throw error;
  lastPreview = data;
  if (tallyActive) return; // podliczanie ma własny widok tych wierszy
  const meta = pollResults.render(data);
  if (resultsMeta) {
    resultsMeta.textContent = game.status === STATUS.POLL_STOPPED ? t("polls.results.stopped") : meta;
  }
}

// liczba głosujących = wiersze odpowiedzi na pierwsze pytanie (jeden na osobę na pytanie)
let firstQuestionId = null;
async function fetchVotersCount() {
  if (!game || game.status !== STATUS.POLL_OPEN) return null;
  if (!firstQuestionId) {
    const qs1 = await listQuestionsBasic();
    firstQuestionId = qs1[0]?.id || null;
  }
  if (!firstQuestionId) return 0;
  const table = game.type === TYPES.POLL_TEXT ? "poll_text_entries" : "poll_votes";
  const { count, error } = await sb()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("question_id", firstQuestionId);
  if (error) throw error;
  return count || 0;
}

async function refreshVotes() {
  try {
    const n = await fetchVotersCount();
    if (n !== null) {
      votesText = t("polls.bar.votes", { n });
      renderBar();
    }
  } catch (e) {
    console.warn("[polls] votes count failed", e);
  }
}

/* =======================
   Podliczanie: wejście, wyjście, zatwierdzenie
======================= */

async function enterTally() {
  if (!game || game.status !== STATUS.POLL_STOPPED || tallyActive) return;
  setActiveTab("results");
  try {
    // świeże dane, ta sama lista wierszy co w widoku surowym
    tallyActive = false;
    await previewResults();
    if (!lastPreview) throw new Error("no preview");
    if (resultsMeta) resultsMeta.textContent = "";
    if (game.type === TYPES.POLL_POINTS) await tally.enterPoints(lastPreview);
    else await tally.enterText();
    tallyActive = true;
    setMsg("");
  } catch (e) {
    console.error("[polls] enter tally:", e);
    await alertModal({ text: `${t("polls.errors.loadAnswers")}\n\n${e?.message || e}` });
    try { await tally.leave(); } catch { /* sprzątanie */ }
    tallyActive = false;
    resetResultsDom();
    await previewResults().catch(() => {});
  }
  renderBar();
}

async function leaveTally() {
  if (!tallyActive) return;
  try { await tally.leave(); } catch (e) { console.warn("[polls] leave tally", e); }
  tallyActive = false;
  tallyValid = false;
  await previewResults().catch(() => {});
  renderBar();
}

async function approveTallyFlow() {
  if (!game || !tallyActive || !tally.valid()) return;
  const points = game.type === TYPES.POLL_POINTS;
  const key = points ? "tallyPoints" : "tallyText";
  const ok = await confirmModal({
    title: t(`polls.modals.${key}.title`),
    text: t(`polls.modals.${key}.text`),
    okText: t(`polls.modals.${key}.ok`),
    cancelText: t("polls.actions.cancel"),
  });
  if (!ok) return;

  try {
    if (points) {
      const { error } = await sb().rpc("poll_points_tally", { p_game_id: gameId });
      if (error) throw error;
    } else {
      const { error } = await sb().rpc("poll_text_tally_apply", { p_game_id: gameId, p_payload: tally.textPayload() });
      if (error) throw error;
    }
    tally.finish();
    tallyActive = false;
  } catch (e) {
    console.error("[polls] tally error:", e);
    await alertModal({ text: `${t("polls.errors.tally")}\n\n${gameRuleErrorMessage(e) || e?.message || e}` });
  }
}

/* =======================
   Wypustki Udostępnianie · Wyniki
======================= */

let activeTab = "share";
let tabTouchedByUser = false;

function setActiveTab(tab, { byUser = false } = {}) {
  activeTab = tab === "results" ? "results" : "share";
  if (byUser) tabTouchedByUser = true;
  const shareOn = activeTab === "share";
  secShare?.classList.toggle("active", shareOn);
  secResults?.classList.toggle("active", !shareOn);
  for (const [btn, on] of [[tabShare, shareOn], [tabResults, !shareOn]]) {
    btn?.classList.toggle("active", on);
    btn?.closest(".tab-slot")?.classList.toggle("active", on);
    btn?.setAttribute("aria-selected", on ? "true" : "false");
  }
}

function setShareTabEnabled(on) {
  if (tabShare) {
    tabShare.disabled = !on;
    tabShare.setAttribute("aria-disabled", on ? "false" : "true");
  }
  tabShare?.closest(".tab-slot")?.classList.toggle("is-disabled", !on);
  if (!on && activeTab === "share") setActiveTab("results");
}

/* =======================
   Subskrybenci (zaproszenia do ankiety)
======================= */

let subsAll = [];            // aktywni subskrybenci właściciela
let tasks = [];              // zaproszenia tego uruchomienia
const selectedSubIds = new Set();
const cooldownBySub = new Map(); // sub_id -> do kiedy (ms) nie wyślemy kolejnego maila
let subsSig = "";

function emailKey(s) {
  return String(s || "").trim().toLowerCase();
}

function taskForSub(sub) {
  return tasks.find((tk) =>
    sub.subscriber_user_id
      ? tk.recipient_user_id && String(tk.recipient_user_id) === String(sub.subscriber_user_id)
      : !tk.recipient_user_id && emailKey(tk.recipient_email) && emailKey(tk.recipient_email) === emailKey(sub.subscriber_email)
  ) || null;
}

function taskIsWaiting(tk) {
  return tk && (tk.status === "pending" || tk.status === "opened");
}

function subLabel(sub) {
  return sub.subscriber_label || sub.subscriber_email || "—";
}

function cooldownActive(subId) {
  const until = cooldownBySub.get(String(subId)) || 0;
  return until > Date.now() ? until : 0;
}

// Karta Udostępnianie działa w szkicu (przygotowanie listy), przy otwartej
// i zatrzymanej ankiecie. Po podliczeniu linki wygasają.
function sharingAvailable(st = game?.status) {
  return st === STATUS.DRAFT || st === STATUS.POLL_OPEN || st === STATUS.POLL_STOPPED;
}

async function loadTasks() {
  if (!game || !currentUser) { tasks = []; return; }
  const { data, error } = await sb()
    .from("poll_tasks")
    .select("id,recipient_user_id,recipient_email,status,share_key_poll,reminder_count")
    .eq("game_id", gameId)
    .eq("owner_id", currentUser.id);
  if (error) throw error;
  // zaproszenia z wcześniejszych uruchomień wygasły
  tasks = (data || []).filter((tk) => tk.share_key_poll === game.share_key_poll);
}

async function loadSubsData() {
  if (!game || !currentUser || !sharingAvailable()) return;
  const { data, error } = await sb().rpc("polls_hub_list_my_subscribers");
  if (error) throw error;
  subsAll = (data || []).filter((s) => s.status === "active");
  await loadTasks();

  // podgląd limitu maili (tylko subskrybenci z kontem; reszta dowie się z odpowiedzi RPC)
  await Promise.all(subsAll
    .filter((s) => s.subscriber_user_id)
    .map(async (s) => {
      const target = `pair:${currentUser.id}:${s.subscriber_user_id}:game:${gameId}`;
      try {
        const { ok, nextAllowedAtMs } = await mailCooldownCheck("poll:share", target);
        if (!ok && nextAllowedAtMs) cooldownBySub.set(String(s.sub_id), nextAllowedAtMs);
        else cooldownBySub.delete(String(s.sub_id));
      } catch { /* nieblokujące — i tak pilnuje baza */ }
    }));

  renderSubs(true);
}

async function refreshTasksOnly() {
  if (!game || game.status === STATUS.DRAFT || !sharingAvailable()) return;
  await loadTasks();
  renderSubs();
}

function selectableSubIds() {
  return subsAll
    .filter((s) => !taskForSub(s) && !cooldownActive(s.sub_id))
    .map((s) => String(s.sub_id));
}

function canSendInvites() {
  return game?.status === STATUS.POLL_OPEN;
}

function renderSubs(force = false) {
  if (!subsGrid) return;

  // zaznaczenia zostają tylko dla wciąż niezaproszonych
  for (const id of [...selectedSubIds]) {
    const sub = subsAll.find((s) => String(s.sub_id) === id);
    if (!sub || taskForSub(sub) || cooldownActive(id)) selectedSubIds.delete(id);
  }

  const stopped = game?.status === STATUS.POLL_STOPPED;
  const sig = JSON.stringify([
    game?.status,
    subsAll.map((s) => [s.sub_id, subLabel(s), cooldownActive(s.sub_id)]),
    tasks.map((tk) => [tk.id, tk.status, tk.reminder_count]),
    [...selectedSubIds].sort(),
    getUiLang(),
  ]);
  if (!force && sig === subsSig) return;
  subsSig = sig;

  // podsumowanie w nagłówku
  if (subsSummary) {
    subsSummary.textContent = t("polls.share.summary", {
      invited: tasks.length,
      voted: tasks.filter((tk) => tk.status === "done").length,
      declined: tasks.filter((tk) => tk.status === "declined").length,
    });
  }

  // zaznacz wszystkich / odznacz
  const selectable = selectableSubIds();
  if (btnSelectAll) {
    const allOn = selectable.length > 0 && selectable.every((id) => selectedSubIds.has(id));
    btnSelectAll.textContent = allOn ? t("polls.share.deselectAll") : t("polls.share.selectAll");
    btnSelectAll.disabled = selectable.length === 0;
  }

  // wyślij: tylko przy otwartej ankiecie i z zaznaczeniem
  if (btnSendInvites) {
    btnSendInvites.textContent = t("polls.share.sendInvitesN", { n: selectedSubIds.size });
    btnSendInvites.disabled = !canSendInvites() || selectedSubIds.size === 0;
  }
  if (sendHint) {
    sendHint.textContent = stopped ? t("polls.share.sendDisabledStopped")
      : game?.status === STATUS.DRAFT ? t("polls.share.sendAfterStart") : "";
  }
  renderBar();

  if (!subsAll.length) {
    subsGrid.innerHTML = "";
    if (subsEmpty) {
      subsEmpty.style.display = "";
      subsEmpty.innerHTML = `${escapeHtml(t("polls.share.noSubs"))} <a href="${escapeHtml(linkTo("subscriptions"))}">${escapeHtml(t("polls.share.noSubsLink"))}</a>`;
    }
    return;
  }
  if (subsEmpty) subsEmpty.style.display = "none";

  const groups = { subscribers: { rows: [] }, pending: { rows: [] }, active: { rows: [] }, declined: { rows: [] } };

  for (const sub of subsAll) {
    const tk = taskForSub(sub);
    const until = cooldownActive(sub.sub_id);
    if (!tk) {
      const id = String(sub.sub_id);
      const toggle = () => {
        if (selectedSubIds.has(id)) selectedSubIds.delete(id); else selectedSubIds.add(id);
        renderSubs();
      };
      groups.subscribers.rows.push({
        id,
        label: subLabel(sub),
        selected: selectedSubIds.has(id),
        disabled: !!until,
        role: "checkbox",
        note: until ? t("polls.share.canResend", { when: formatUntil(until) }) : "",
        onClick: toggle,
      });
      continue;
    }
    const waiting = taskIsWaiting(tk);
    const limit = (tk.reminder_count || 0) >= 2;
    const bellOff = limit || !!until || stopped;
    const bellTitle = stopped ? t("polls.share.sendDisabledStopped")
      : limit ? t("polls.share.reminderLimit")
      : until ? t("polls.share.canResend", { when: formatUntil(until) })
      : t("polls.share.remind");
    const actions = [];
    if (waiting) actions.push({ key: "remind", icon: "bell", title: bellTitle, disabled: bellOff, onClick: () => void remindShare(tk, sub) });
    actions.push({ key: "remove", icon: "trash", title: t("polls.share.remove"), onClick: () => void removeShare(tk, sub) });
    const row = {
      id: String(sub.sub_id),
      label: subLabel(sub),
      actions,
      note: waiting && until && !limit && !stopped ? t("polls.share.canResend", { when: formatUntil(until) }) : "",
    };
    (tk.status === "done" ? groups.active : tk.status === "declined" ? groups.declined : groups.pending).rows.push(row);
  }
  groups.active.subtitle = t("polls.share.activeSub");

  renderShareSections(subsGrid, groups, { grid: true });
}

// Wysyłka zaproszeń do zaznaczonych; wywołujący pilnuje `busy`.
async function sendInvitesCore() {
  // baza wycofuje czekające zaproszenia spoza listy — więc wysyłamy czekające + nowo zaznaczone
  const waitingIds = subsAll.filter((s) => taskIsWaiting(taskForSub(s))).map((s) => String(s.sub_id));
  const ids = [...new Set([...waitingIds, ...selectedSubIds])];

  const { data, error } = await sb().rpc("polls_hub_share_poll", { p_game_id: gameId, p_sub_ids: ids });
  if (error || data?.ok === false) {
    throw new Error(rpcErrText(error, data));
  }

  for (const b of data?.blocked_sub_ids || []) {
    const until = Date.parse(b.cooldown_until);
    if (b.sub_id && Number.isFinite(until)) cooldownBySub.set(String(b.sub_id), until);
  }

  const res = await sendPollInviteMails({ mailItems: data?.mail, pollName: game.name, currentUser });
  selectedSubIds.clear();

  if (res.failed) await alertModal({ text: `${t("polls.share.mailFailed")} (${res.failed}/${res.total})` });
  else setMsg(t("polls.share.invitesSent", { n: res.sent }));
  if (data?.blocked) setMsg(t("polls.share.invitesBlocked", { n: data.blocked }), "error");
}

async function sendInvites() {
  if (!game || busy || !selectedSubIds.size || !canSendInvites()) return;
  busy = true;
  if (btnSendInvites) btnSendInvites.disabled = true;
  try {
    await sendInvitesCore();
  } catch (e) {
    console.error("[polls] send invites", e);
    await alertModal({ text: `${t("polls.share.inviteFailed")}\n\n${e?.message || e}` });
  } finally {
    busy = false;
    await safeLoadSubs();
  }
}

async function remindShare(tk, sub) {
  if (busy || game?.status !== STATUS.POLL_OPEN) return;
  busy = true;
  try {
    const { data, error } = await sb().rpc("poll_share_remind", { p_game_id: gameId, p_task_id: tk.id });
    if (error) throw error;
    if (!data?.ok) {
      if (data?.err === "cooldown" && data.cooldown_until) {
        const until = Date.parse(data.cooldown_until);
        if (Number.isFinite(until)) cooldownBySub.set(String(sub.sub_id), until);
        await alertModal({ text: t("polls.share.canResend", { when: formatUntil(until) }) });
      } else if (data?.err === "reminder limit") {
        await alertModal({ text: t("polls.share.reminderLimit") });
      } else {
        await alertModal({ text: `${t("polls.share.remindFailed")}\n\n${rpcErrText(null, data)}` });
      }
      return;
    }
    const res = await sendPollInviteMails({ mailItems: data.mail, pollName: game.name, currentUser, reminder: true });
    if (res.failed) await alertModal({ text: `${t("polls.share.mailFailed")} (${res.failed}/${res.total})` });
    else setMsg(t("polls.share.reminded"));
    // po wysłaniu: kolejny mail dopiero za 24 h
    cooldownBySub.set(String(sub.sub_id), Date.now() + 24 * 3600 * 1000);
  } catch (e) {
    console.error("[polls] remind", e);
    await alertModal({ text: `${t("polls.share.remindFailed")}\n\n${e?.message || e}` });
  } finally {
    busy = false;
    await safeLoadSubs();
  }
}

async function removeShare(tk, sub) {
  if (busy) return;
  const ok = await confirmModal({
    title: t("polls.share.removeTitle"),
    text: tk.status === "done"
      ? t("polls.share.removeTextVoted", { name: subLabel(sub) })
      : t("polls.share.removeText", { name: subLabel(sub) }),
    okText: t("polls.share.removeOk"),
    cancelText: t("polls.actions.cancel"),
  });
  if (!ok) return;
  busy = true;
  try {
    const { data, error } = await sb().rpc("poll_share_remove", { p_game_id: gameId, p_task_id: tk.id });
    if (error || data?.ok === false) throw new Error(rpcErrText(error, data));
  } catch (e) {
    console.error("[polls] remove share", e);
    await alertModal({ text: `${t("polls.share.removeFailed")}\n\n${e?.message || e}` });
  } finally {
    busy = false;
    await safeLoadSubs();
    void refreshVotes();
    if (!tallyActive) void previewResults().catch(() => {});
  }
}

async function safeLoadSubs() {
  try {
    await loadSubsData();
  } catch (e) {
    console.warn("[polls] load subscribers failed", e);
  }
}

/* =======================
   A. Pasek stanu
======================= */

function show(btn, on) {
  if (btn) btn.hidden = !on;
}

// Stan słowem + krótki opis po lewej; przyciski wg stanu po prawej.
// Główna akcja złota, „Przerwij” zawsze ostatni (stonowany, czerwony obrys).
function renderBar() {
  if (!pollBar || !game) return;
  const st = game.status || STATUS.DRAFT;
  const prepared = game.type === TYPES.PREPARED;
  const tallying = tallyActive && st === STATUS.POLL_STOPPED;

  pollBar.dataset.state = tallying ? "tally" : st;
  if (pollStateWord) pollStateWord.textContent = statusLabel(st);

  let info = "";
  if (tallying) info = t("polls.bar.tallyInfo");
  else if (st === STATUS.POLL_OPEN) info = votesText;
  else if (st === STATUS.POLL_STOPPED) info = t("polls.bar.stoppedInfo");
  else if (st === STATUS.READY) info = t("polls.bar.readyInfo");
  if (pollStateInfo) pollStateInfo.textContent = prepared ? "" : info;

  const chk = lastCheck;
  const nInvite = selectedSubIds.size;
  let hint = "";

  show(btnOpenPoll, !prepared && st === STATUS.DRAFT);
  show(btnStopPoll, !prepared && st === STATUS.POLL_OPEN);
  show(btnResumePoll, !prepared && st === STATUS.POLL_STOPPED && !tallying);
  show(btnTallyPoll, !prepared && st === STATUS.POLL_STOPPED && !tallying);
  show(btnLeaveTally, tallying);
  show(btnApproveTally, tallying);
  show(btnReopenPoll, !prepared && st === STATUS.READY);
  show(btnAbort, !prepared && (st === STATUS.POLL_OPEN || st === STATUS.POLL_STOPPED));

  if (btnOpenPoll) {
    btnOpenPoll.textContent = nInvite > 0
      ? t("polls.actions.openAndInvite", { n: nInvite })
      : t("polls.actions.openPoll");
    const ok = chk?.poll_open?.ok;
    btnOpenPoll.disabled = busy || !ok;
    if (st === STATUS.DRAFT && chk && !ok) hint = chk.poll_open.reason;
  }
  if (btnReopenPoll) {
    const ok = chk?.poll_open?.ok;
    btnReopenPoll.disabled = busy || !ok;
    if (st === STATUS.READY && chk && !ok) hint = chk.poll_open.reason;
  }
  if (btnStopPoll) btnStopPoll.disabled = busy || (chk ? !chk.poll_stop?.ok : false);
  if (btnResumePoll) btnResumePoll.disabled = busy;
  if (btnTallyPoll) {
    const ok = chk?.poll_close?.ok;
    btnTallyPoll.disabled = busy || !ok;
    if (st === STATUS.POLL_STOPPED && !tallying && chk && !ok) hint = chk.poll_close.reason;
  }
  if (btnLeaveTally) btnLeaveTally.disabled = busy;
  if (btnApproveTally) btnApproveTally.disabled = busy || !tallyValid;
  if (btnAbort) btnAbort.disabled = busy;

  if (hintTop) hintTop.textContent = hint || "";
}

/* =======================
   Odświeżanie
======================= */

let stateKey = null;      // status + klucz: zmiana = nowy stan / nowe uruchomienie
let refreshSeq = 0;

function renderShareSection(st, link) {
  const available = sharingAvailable(st);
  const hasLink = st === STATUS.POLL_OPEN || st === STATUS.POLL_STOPPED;
  if (shareBody) shareBody.style.display = available ? "" : "none";
  if (shareEmpty) {
    shareEmpty.style.display = available ? "none" : "";
    shareEmpty.textContent = st === STATUS.READY ? t("polls.share.closedEmpty") : t("polls.share.draftEmpty");
  }
  if (linkPlaceholder) linkPlaceholder.hidden = st !== STATUS.DRAFT;
  if (linkLive) linkLive.hidden = st === STATUS.DRAFT;
  if (hasLink) {
    if (pollLinkEl) pollLinkEl.value = link;
    setLinkUiVisible(true);
    void renderQr(link);
  } else {
    if (pollLinkEl) pollLinkEl.value = "";
    setLinkUiVisible(false);
    renderedQrUrl = "";
  }
  setShareTabEnabled(st !== STATUS.READY);
}

async function refresh() {
  const seq = ++refreshSeq;
  if (!gameId) {
    if (pollBar) pollBar.style.display = "none";
    if (cardMain) cardMain.style.display = "none";
    if (cardEmpty) cardEmpty.style.display = "";
    setMsg(t("polls.missingId"), "error");
    return;
  }

  const prev = game;
  game = await loadGame();
  if (seq !== refreshSeq) return;

  if (cardEmpty) cardEmpty.style.display = "none";
  if (pollBar) pollBar.style.display = "";
  if (cardMain) cardMain.style.display = "";

  const st = game.status || STATUS.DRAFT;
  const key = `${st}:${game.share_key_poll}`;
  if (key !== stateKey) {
    // podliczanie kończy się razem ze stanem „zatrzymana” (podliczenie, wznowienie, przerwanie)
    if (tallyActive && st !== STATUS.POLL_STOPPED) {
      tally.finish();
      tallyActive = false;
      tallyValid = false;
    }
    // nowy stan lub nowe uruchomienie: domyślna wypustka, czysta lista wyników
    stateKey = key;
    tabTouchedByUser = false;
    if (!tallyActive) resetResultsDom();
    // zaznaczenia przeżywają szkic -> otwarta -> zatrzymana (ten sam klucz)
    if (!prev || prev.share_key_poll !== game.share_key_poll || !sharingAvailable(st)) selectedSubIds.clear();
    subsAll = [];
    tasks = [];
    subsSig = "";
    firstQuestionId = null;
    votesText = "";
  }
  if (!tabTouchedByUser) setActiveTab(st === STATUS.DRAFT || st === STATUS.POLL_OPEN ? "share" : "results");

  const nameEl = $("pollGameName");
  if (nameEl) {
    nameEl.textContent = t("polls.pageSubtitle", {
      type: typeShortLabel(game.type),
      name: game.name || t("polls.defaultName"),
    });
  }

  renderShareSection(st, st === STATUS.DRAFT ? "" : pollLink(game));
  renderBar();

  try {
    const [chk] = await Promise.all([
      game.type === TYPES.PREPARED ? Promise.resolve(null) : validateGame(game.id),
      previewResults(),
      st === STATUS.POLL_OPEN ? refreshVotes() : Promise.resolve(),
      sharingAvailable(st) ? safeLoadSubs() : Promise.resolve(),
    ]);
    if (seq !== refreshSeq) return;
    lastCheck = chk;
  } catch (e) {
    console.warn("[polls] refresh failed", e);
    if (resultsMeta) resultsMeta.textContent = t("polls.results.refreshFailed");
    lastCheck = null;
  }
  renderBar();
}

// odświeżanie na żywo: wyniki i zaproszenia (otwarta), zmiana stanu z innego okna (zatrzymana)
async function liveTick() {
  if (document.hidden || busy || tallyActive || !game) return;
  if (game.status !== STATUS.POLL_OPEN && game.status !== STATUS.POLL_STOPPED) return;
  try {
    const g = await loadGame();
    if (g.status !== game.status || g.share_key_poll !== game.share_key_poll) {
      await refresh();
      return;
    }
    if (game.status === STATUS.POLL_OPEN) {
      const [chk] = await Promise.all([
        validateGame(game.id),
        previewResults(),
        refreshVotes(),
        refreshTasksOnly(),
      ]);
      if (!busy && !tallyActive) { lastCheck = chk; renderBar(); }
    } else {
      await refreshTasksOnly();
    }
  } catch (e) {
    console.warn("[polls] live refresh failed", e);
  }
}

/* =======================
   Akcje stanu
======================= */

async function openPollFlow() {
  const chk = await validateGame(game.id);
  if (!chk.poll_open.ok) return setMsg(chk.poll_open.reason, "error");

  const withInvites = selectedSubIds.size > 0;
  const ok = await confirmModal({
    title: t("polls.modals.open.title"),
    text: withInvites
      ? t("polls.modals.open.textInvite", { name: game.name, n: selectedSubIds.size })
      : t("polls.modals.open.text", { name: game.name }),
    okText: t("polls.modals.open.ok"),
    cancelText: t("polls.modals.open.cancel"),
  });
  if (!ok) return;

  try {
    const { error } = await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
    if (error) throw error;
  } catch (e) {
    console.error("[polls] open error:", e);
    await alertModal({ text: `${t("polls.errors.open")}\n\n${gameRuleErrorMessage(e) || e?.message || e}` });
    return;
  }

  // start i wysyłka zaproszeń jednym krokiem
  if (withInvites) {
    try {
      game = await loadGame();
      await loadSubsData();
      await sendInvitesCore();
    } catch (e) {
      console.error("[polls] open + invites error:", e);
      await alertModal({ text: `${t("polls.errors.openedInviteFailed")}\n\n${e?.message || e}` });
    }
  }
}

async function stopPollFlow() {
  const ok = await confirmModal({
    title: t("polls.modals.stop.title"),
    text: t("polls.modals.stop.text"),
    okText: t("polls.modals.stop.ok"),
    cancelText: t("polls.actions.cancel"),
  });
  if (!ok) return;

  try {
    const { data, error } = await sb().rpc("poll_stop", { p_game_id: gameId });
    if (error || data?.ok === false) throw error || new Error(rpcErrText(null, data));
  } catch (e) {
    console.error("[polls] stop error:", e);
    await alertModal({ text: `${t("polls.errors.stop")}\n\n${gameRuleErrorMessage(e) || e?.message || e}` });
  }
}

async function resumePollFlow() {
  const ok = await confirmModal({
    title: t("polls.modals.resume.title"),
    text: t("polls.modals.resume.text"),
    okText: t("polls.modals.resume.ok"),
    cancelText: t("polls.actions.cancel"),
  });
  if (!ok) return;

  try {
    const { data, error } = await sb().rpc("poll_resume", { p_game_id: gameId });
    if (error || data?.ok === false) throw error || new Error(rpcErrText(null, data));
  } catch (e) {
    console.error("[polls] resume error:", e);
    await alertModal({ text: `${t("polls.errors.resume")}\n\n${gameRuleErrorMessage(e) || e?.message || e}` });
  }
}

async function abortPollFlow() {
  const ok = await confirmModal({
    title: t("polls.modals.abort.title"),
    text: t("polls.modals.abort.text"),
    okText: t("polls.modals.abort.ok"),
    cancelText: t("polls.actions.cancel"),
  });
  if (!ok) return;

  try {
    const { data, error } = await sb().rpc("poll_abort", { p_game_id: gameId });
    if (error || data?.ok === false) throw new Error(rpcErrText(error, data));
    if (tallyActive) {
      tally.finish();
      tallyActive = false;
      tallyValid = false;
    }
  } catch (e) {
    console.error("[polls] abort error:", e);
    await alertModal({ text: `${t("polls.errors.abort")}\n\n${e?.message || e}` });
  }
}

async function restartPollFlow() {
  const chk = await validateGame(game.id);
  if (!chk.poll_open.ok) return setMsg(chk.poll_open.reason, "error");

  const ok = await confirmModal({
    title: t("polls.modals.reopen.title"),
    text: t("polls.modals.reopen.text"),
    okText: t("polls.modals.reopen.ok"),
    cancelText: t("polls.modals.reopen.cancel"),
  });
  if (!ok) return;

  let aborted = false;
  try {
    const { data, error } = await sb().rpc("poll_abort", { p_game_id: gameId });
    if (error || data?.ok === false || !data?.share_key_poll) throw new Error(rpcErrText(error, data));
    aborted = true;
    const { error: e2 } = await sb().rpc("poll_open", { p_game_id: gameId, p_key: data.share_key_poll });
    if (e2) throw e2;
  } catch (e) {
    console.error("[polls] reopen error:", e);
    await alertModal({ text: `${t("polls.errors.reopen")}${aborted ? `\n${t("polls.errors.reopenAborted")}` : ""}\n\n${e?.message || e}` });
  }
}

async function runStateAction(fn) {
  if (!game || busy) return;
  busy = true;
  renderBar();
  try {
    await fn();
  } finally {
    busy = false;
    // stan i klucz zawsze czytamy z bazy od nowa (uruchomienie zmienia share_key_poll)
    try { await refresh(); } catch (e) { console.warn("[polls] refresh after action", e); }
  }
}

/* =======================
   Init
======================= */

document.addEventListener("DOMContentLoaded", async () => {
  const requireAuthP = requireAuth("/login/"); // start równolegle z initI18n
  await initI18n({ withSwitcher: true });
  document.documentElement.classList.remove('page-loading');

  const u = await requireAuthP;
  currentUser = u;
  initTopbarAccountDropdown(u);
  document.querySelector('.topbar')?.classList.add('topbar-ready');

  if (btnBack) {
    renderBackLabel(btnBack, "polls");
  }

  btnManual?.addEventListener("click", () => {
    location.href = linkTo("manual", { hash: "polls" });
  });

  // Poprawki podliczania zapisują się same (szkic w bazie); przed wyjściem
  // tylko dopychamy ostatni zapis.
  btnBack?.addEventListener("click", async () => {
    try { await tally.flush(); } catch { /* szkic i tak jest w bazie */ }
    location.href = backHref("polls");
  });
  window.addEventListener("pagehide", () => { void tally.flush(); });

  tabShare?.addEventListener("click", () => { if (!tabShare.disabled) setActiveTab("share", { byUser: true }); });
  tabResults?.addEventListener("click", () => setActiveTab("results", { byUser: true }));

  btnCopy?.addEventListener("click", async () => {
    if (!pollLinkEl?.value) return;
    try {
      await navigator.clipboard.writeText(pollLinkEl.value);
      setMsg(t("polls.copy.success"));
    } catch {
      setMsg(t("polls.copy.failed"), "error");
    }
  });

  btnOpen?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  btnOpenQr?.addEventListener("click", () => {
    showPollQrModal();
  });

  qrBox?.addEventListener("click", () => { void showVoteQrModal(); });

  btnSendInvites?.addEventListener("click", () => void sendInvites());

  btnSelectAll?.addEventListener("click", () => {
    const ids = selectableSubIds();
    const allOn = ids.length > 0 && ids.every((id) => selectedSubIds.has(id));
    if (allOn) ids.forEach((id) => selectedSubIds.delete(id));
    else ids.forEach((id) => selectedSubIds.add(id));
    renderSubs();
  });

  btnOpenPoll?.addEventListener("click", () => runStateAction(openPollFlow));
  btnStopPoll?.addEventListener("click", () => runStateAction(async () => {
    await stopPollFlow();
  }));
  btnResumePoll?.addEventListener("click", () => runStateAction(resumePollFlow));
  btnTallyPoll?.addEventListener("click", () => runStateAction(async () => { await enterTally(); }));
  btnLeaveTally?.addEventListener("click", () => runStateAction(leaveTally));
  btnApproveTally?.addEventListener("click", () => runStateAction(approveTallyFlow));
  btnReopenPoll?.addEventListener("click", () => runStateAction(restartPollFlow));
  btnAbort?.addEventListener("click", () => runStateAction(abortPollFlow));

  btnUndo?.addEventListener("click", () => tally.undo());
  btnRedo?.addEventListener("click", () => tally.redo());

  // Skróty Cofnij / Ponów w podliczaniu (poza polem tekstu — tam działa natywne cofanie)
  document.addEventListener("keydown", (e) => {
    if (!tallyActive || tally.mode() !== "text") return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === "z") {
      e.preventDefault();
      if (e.shiftKey) tally.redo(); else tally.undo();
    } else if (ctrl && k === "y") {
      e.preventDefault();
      tally.redo();
    }
  });

  // resourceType: "game" — dołącza do już istniejącego wspólnego klucza
  // z editor.js/game-settings.js (patrz komentarz w editor.js przy tym
  // samym wywołaniu): podliczenie zapisuje punkty do answers.fixed_points,
  // więc otwarcie ankiety wyklucza edytor/ustawienia tej samej gry i odwrotnie,
  // nie tylko drugą kartę tej samej strony.
  if (gameId) {
    const lock = await guardResourceLock({
      resourceType: "game",
      resourceId: gameId,
      context: "polls",
      message: t("resourceLock.gameMessage"),
      backHref: backHref("polls"),
    });
    if (!lock.ok) return;
    // Blokada stanu: strona ankiety tylko dla gry, która może mieć ankietę.
    if (!(await guardGameState(gameId, "poll_entry", { backHref: backHref("polls") }))) return;
  }

  await refresh();
  setInterval(() => void liveTick(), LIVE_REFRESH_MS);
});
