// js/pages/polls.js
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-08T18594";
import { requireAuth } from "../../shared/js/core/auth.js?v=v2026-10-08T18594";
import { alertModal, confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-08T18594";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { initI18n, t, withLangParam, getUiLang } from "../../shared/translation/translation.js?v=v2026-10-08T18594";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-08T18594";
import { guardResourceLock } from "../../shared/js/core/resource-lock.js?v=v2026-10-08T18594";
import { validateGame, gameRuleErrorMessage, guardGameState } from "../../shared/js/core/game-validate.js?v=v2026-10-08T18594";
import { mailCooldownCheck } from "../../shared/js/core/cooldown.js?v=v2026-10-08T18594";
import { sendPollInviteMails } from "../../shared/js/core/poll-mail.js?v=v2026-10-08T18594";
import "../../shared/js/core/contact-modal.js?v=v2026-10-08T18594";
import { createPollResults } from "../../shared/js/core/poll-results.js?v=v2026-10-08T18594";
import { icon, iconText } from "../../shared/js/core/icons.js?v=v2026-10-08T18594";

// initI18n is called at the start of DOMContentLoaded (see below)

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const ret = qs.get("ret");

const $ = (id) => document.getElementById(id);

const btnBack = $("btnBack");
const btnManual = $("btnManual");
const msg = $("msg");

// pasek stanu
const pollBar = $("pollBar");
const chipType = $("chipType");
const chipStatus = $("chipStatus");
const chipVotes = $("chipVotes");
const hintTop = $("hintTop");
const btnPollAction = $("btnPollAction");
const btnAbort = $("btnAbort");
const btnCancelTextCloseTop = $("btnCancelTextCloseTop");

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
const pollLinkEl = $("pollLink");
const qrBox = $("qr");
const btnCopy = $("btnCopy");
const btnOpen = $("btnOpen");
const btnOpenQr = $("btnOpenQr");
const btnSendInvites = $("btnSendInvites");
const subsGrid = $("subsGrid");
const subsEmpty = $("subsEmpty");

// QR modal (wyświetlacz ankiety)
const pollQrModalOverlay = $("pollQrModalOverlay");

const pollQrModalCodeVal = $("pollQrModalCodeVal");
const pollQrModalCopy    = $("pollQrModalCopy");
const pollQrModalOpen    = $("pollQrModalOpen");
const pollQrModalClose   = $("pollQrModalClose");
let _pollQrDeviceCode = "";
let _pollQrOpenUrl    = "";

// Wyniki
const resultsMeta = $("resultsMeta");
const resultsList = $("resultsList");

// zamykanie ankiety tekstowej
const textCloseShell = $("textCloseShell");
const textCloseMeta = $("textCloseMeta");
const textCloseList = $("textCloseList");
const btnCancelTextClose = $("btnCancelTextClose");
const btnFinishTextClose = $("btnFinishTextClose");
const btnUndo = $("btnUndo");
const btnRedo = $("btnRedo");

let game = null;
let currentUser = null;
let textCloseModel = null;
let uiTextCloseOpen = false;
let busy = false; // trwa akcja stanu (uruchom / zamknij / przerwij)

let undoStack = [];
let redoStack = [];

function saveSnapshot() {
  if (!textCloseModel) return;
  // głęboka kopia modelu
  undoStack.push(JSON.parse(JSON.stringify(textCloseModel)));
  redoStack = []; // nowa akcja czyści redo
  updateHistoryButtons();
}

function updateHistoryButtons() {
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

function undoAction() {
  if (!uiTextCloseOpen || undoStack.length === 0) return;
  redoStack.push(JSON.parse(JSON.stringify(textCloseModel)));
  textCloseModel = undoStack.pop();
  updateHistoryButtons();
  if (window._textCloseRerenderAll) window._textCloseRerenderAll();
}

function redoAction() {
  if (!uiTextCloseOpen || redoStack.length === 0) return;
  undoStack.push(JSON.parse(JSON.stringify(textCloseModel)));
  textCloseModel = redoStack.pop();
  updateHistoryButtons();
  if (window._textCloseRerenderAll) window._textCloseRerenderAll();
}

const backTarget = withLangParam(new URL(ret || "/games/", location.origin + "/").href);


function getRetPathnameLower() {
  if (!ret) return "";
  try {
    return new URL(ret, location.origin + "/").pathname.toLowerCase();
  } catch {
    return "";
  }
}

function buildManualUrl() {
  const url = new URL("/manual/", location.href);
  const current = `${location.pathname}${location.search}${location.hash}`;
  url.searchParams.set("ret", current);
  const lang = (new URLSearchParams(location.search).get("lang") || localStorage.getItem("uiLang") || "pl");
  url.searchParams.set("lang", lang);
  url.hash = "polls";
  return url.toString();
}

// --- QR modal (wyświetlacz ankiety) ---
function hidePollQrModal() {
  if (pollQrModalOverlay) pollQrModalOverlay.classList.add("hidden");
}

async function showPollQrModal() {
  if (!game || !pollLinkEl?.value) return;

  // URL do strony wyświetlacza (poll-qr) — zawiera aktualny język polls
  const displayUrl = new URL("/poll-qr/", location.href);
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
    setMsg(t("common.genericError") || "Błąd.");
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
    setMsg(t("polls.copy.failed"));
  }
});
pollQrModalOpen?.addEventListener("click", () => {
  if (!_pollQrOpenUrl) return;
  const u = new URL(withLangParam("/poll-qr/"), location.href);
  u.searchParams.set("url", _pollQrOpenUrl);
  window.open(u.toString(), "_blank", "noopener,noreferrer");
});

// --- Język QR-a w ankietach (games.poll_qr_lang, migracja 269) ---
// Wcześniej: broadcast (BroadcastChannel same-browser + Supabase Realtime
// cross-device) — wymagał, żeby poll-qr.js było podłączone w TEJ SAMEJ
// chwili, gdy operator zmienia język tutaj; urządzenie offline/dołączone
// później zostawało trwale z nieaktualnym językiem. Zamiast tego po prostu
// PERSYSTUJEMY język na games.poll_qr_lang -- poll-qr.js samo się o niego
// dopytuje (pollowanie, patrz komentarz tam), więc nie ma już czego
// "wysyłać": broadcastLang() tylko zapisuje, nigdy nie czeka na odbiorcę.
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
  void refresh();
});

const TYPES = {
  POLL_TEXT: "poll_text",
  POLL_POINTS: "poll_points",
  PREPARED: "prepared",
};
const STATUS = {
  DRAFT: "draft",
  POLL_OPEN: "poll_open",
  READY: "ready",
};

const LIVE_REFRESH_MS = 5000;

function escapeHtml(s) {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

let msgTimer = null;
function setMsg(text) {
  if (!msg) return;
  msg.textContent = text || "";
  msg.classList.toggle("on", !!text);
  clearTimeout(msgTimer);
  if (text) msgTimer = setTimeout(() => { msg.textContent = ""; msg.classList.remove("on"); }, 2800);
}

function typeLabel(type) {
  if (type === TYPES.POLL_TEXT) return t("games.types.pollText");
  if (type === TYPES.POLL_POINTS) return t("games.types.pollPoints");
  if (type === TYPES.PREPARED) return t("games.types.prepared");
  return String(type || "—").toUpperCase();
}

function statusLabel(st) {
  const s = st || STATUS.DRAFT;
  if (s === STATUS.DRAFT) return t("games.status.draft");
  if (s === STATUS.POLL_OPEN) return t("games.status.open");
  if (s === STATUS.READY) return t("games.status.closed");
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
   A. Pasek stanu
======================= */

function setChips(g) {
  if (chipType) chipType.textContent = typeLabel(g?.type);

  if (chipStatus) {
    const st = g?.status || STATUS.DRAFT;
    chipStatus.textContent = statusLabel(st);
    chipStatus.className = "tag " + (st === STATUS.READY ? "tag--ok" : st === STATUS.POLL_OPEN ? "tag--warn" : "tag--muted");
  }

  if (chipVotes && g?.status !== STATUS.POLL_OPEN) chipVotes.style.display = "none";
}

function setVotesChip(n) {
  if (!chipVotes) return;
  chipVotes.style.display = "";
  chipVotes.textContent = t("polls.tags.votes", { n: Number(n) || 0 });
}

function setActionButton(label, disabled, hint) {
  if (btnPollAction) {
    btnPollAction.textContent = label || "";
    btnPollAction.disabled = !!disabled;
    btnPollAction.style.visibility = "";
  }
  if (hintTop) hintTop.textContent = hint || "";
}

/* =======================
   Link i QR
======================= */

function setLinkUiVisible(on) {
  const v = !!on;
  if (btnCopy) btnCopy.disabled = !v;
  if (btnOpen) btnOpen.disabled = !v;
  if (btnOpenQr) btnOpenQr.disabled = !v;
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
      ? "/poll-text/"
      : g.type === TYPES.POLL_POINTS
      ? "/poll-points/"
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

async function getLastSessionIdForQuestion(qid) {
  const { data, error } = await sb()
    .from("poll_sessions")
    .select("id")
    .eq("game_id", gameId)
    .eq("question_id", qid)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id || null;
}

/* =======================
   Walidacje
======================= */

// Warunki otwarcia / zamknięcia liczy baza (game_validate, migracja 273).
async function validateCanOpen(g) {
  if (!g) return { ok: false, reason: t("gameValidate.noGame") };
  return (await validateGame(g.id)).poll_open;
}

async function validateCanClose(g) {
  if (!g) return { ok: false, reason: t("gameValidate.noGame") };
  return (await validateGame(g.id)).poll_close;
}

function setTextCloseUi(open) {
  uiTextCloseOpen = !!open;

  // okno scalania zastępuje treść (wypustki), pasek stanu zostaje
  if (textCloseShell) textCloseShell.style.display = open ? "" : "none";
  if (cardMain && game) cardMain.style.display = open ? "none" : "";

  if (btnPollAction) btnPollAction.style.display = open ? "none" : "";
  if (btnAbort) btnAbort.style.display = open ? "none" : (game?.status === STATUS.POLL_OPEN ? "" : "none");
  if (btnCancelTextCloseTop) btnCancelTextCloseTop.style.display = open ? "" : "none";

  // czyść historię
  undoStack = [];
  redoStack = [];
  updateHistoryButtons();
}

function normalizeCountsTo100(items) {
  const cleaned = (items || [])
    .map((x) => ({ ...x, count: Math.max(0, Number(x.count) || 0) }))
    .filter((x) => x.count > 0);

  if (!cleaned.length) return [];

  const total = cleaned.reduce((s, x) => s + x.count, 0) || 1;

  const raw = cleaned.map((x) => {
    const r = (100 * x.count) / total;
    const f = Math.floor(r);
    return { ...x, raw: r, floor: f, frac: r - f };
  });

  let sum = raw.reduce((s, x) => s + x.floor, 0);
  let diff = 100 - sum;

  if (diff > 0) {
    raw.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < diff; i++) raw[i % raw.length].floor += 1;
  } else if (diff < 0) {
    diff = -diff;
    raw.sort((a, b) => b.floor - a.floor);
    let i = 0;
    while (diff > 0 && i < raw.length * 5) {
      const idx = i % raw.length;
      if (raw[idx].floor > 0) {
        raw[idx].floor -= 1;
        diff--;
      }
      i++;
    }
  }

  return raw.map((x) => ({ ...x, points: x.floor }));
}

/* =======================
   Wyniki — na żywo, bez skakania
   Lista budowana raz; potem tylko liczby i szerokości pasków (przejście CSS).
   Punktacja: kolejność odpowiedzi z gry. Tekst: kolejność pojawienia się,
   nowe na końcu. Sortowanie wg głosów dopiero przy zamykaniu.
======================= */

const pollResults = createPollResults(resultsList);
function resetResultsDom() { pollResults.reset(); }

async function previewResults() {
  if (!game || !resultsList) return;
  if (game.type === TYPES.PREPARED) {
    resetResultsDom();
    if (resultsMeta) resultsMeta.textContent = t("polls.meta.prepared");
    return;
  }

  const { data, error } = await sb().rpc("get_poll_preview", { p_game_id: gameId });
  if (error) throw error;
  const meta = pollResults.render(data);
  if (resultsMeta) resultsMeta.textContent = meta;
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

async function refreshVotesChip() {
  try {
    const n = await fetchVotersCount();
    if (n !== null) setVotesChip(n);
  } catch (e) {
    console.warn("[polls] votes count failed", e);
  }
}


/* =======================
   poll_text close panel
======================= */

function clip17Final(s) {
  const t1 = String(s ?? "").trim();
  if (!t1) return "";
  return t1.length > 17 ? t1.slice(0, 17) : t1;
}

// normalizacja 'klasyczna' dla text-close (z Twojej wersji)
function normalizeTo100Int(items) {
  const normalized = normalizeCountsTo100(items);
  if (!normalized.length) return [];

  let filtered = normalized.filter((x) => x.points >= 3);
  filtered.sort((a, b) => b.points - a.points);
  if (filtered.length > 6) filtered = filtered.slice(0, 6);

  const base = filtered.map((x) => ({ text: x.text, points: x.points }));

  const used = new Set();
  for (const x of base) {
    let p = Number(x.points) || 0;
    while (p > 0 && used.has(p)) p--;
    x.points = p;
    used.add(p);
  }
  return base;
}

function mergeDuplicatesInPlace(items) {
  const map = new Map();
  for (const it of items || []) {
    const key = String(it.text ?? "").trim().toLowerCase();
    const cnt = Number(it.count) || 0;
    if (!key || cnt <= 0) continue;

    if (!map.has(key)) map.set(key, { text: String(it.text ?? "").trim(), count: cnt });
    else map.get(key).count += cnt;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function validateTextCloseModel() {
  if (!textCloseModel || !btnFinishTextClose) return;

  let allOk = true;
  for (const q of textCloseModel) {
    const validCount = q.items.filter((it) => it.text?.trim() && Number(it.count) > 0).length;
    if (validCount < 3) {
      allOk = false;
      break;
    }
  }
  btnFinishTextClose.disabled = !allOk;
}

async function buildTextClosePanel() {
  // #btnFinishTextClose nie ma domyślnie atrybutu disabled w HTML — bez tego
  // jest klikalne od razu po załadowaniu strony, na długo zanim poniższe
  // zapytania (10x sekwencyjnie, sesja + wpisy na pytanie) w ogóle ustawią
  // textCloseModel. Klik w tym oknie trafia w early-return w handlerze
  // (textCloseModel jeszcze null) i nie robi kompletnie nic — bez błędu, bez
  // modala — potwierdzone diagnostyką w e2e. validateTextCloseModel() poniżej
  // dopiero WYŁĄCZA przycisk gdy walidacja nie przejdzie, nigdy go nie blokuje
  // na starcie, więc trzeba to zrobić tutaj jawnie.
  if (btnFinishTextClose) btnFinishTextClose.disabled = true;
  setTextCloseUi(true);
  if (textCloseList) textCloseList.innerHTML = "";
  if (textCloseMeta) textCloseMeta.textContent = t("polls.textClose.loading");

  const qsList = await listQuestionsBasic();
  const model = [];

  for (const q of qsList) {
    const sid = await getLastSessionIdForQuestion(q.id);
    const map = new Map();

    if (sid) {
      const { data, error } = await sb()
        .from("poll_text_entries")
        .select("answer_norm")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);
      if (error) throw error;

      for (const r of data || []) {
        const k = (r.answer_norm || "").trim();
        if (!k) continue;
        map.set(k, (map.get(k) || 0) + 1);
      }
    }

    const items = [...map.entries()]
      .map(([txt, count]) => ({ text: txt, count }))
      .sort((a, b) => b.count - a.count);

    model.push({ question_id: q.id, ord: q.ord, text: q.text, items });
  }

  textCloseModel = model;
  window._textCloseRerenderAll = renderTextCloseFromModel;
  renderTextCloseFromModel();

  return textCloseModel;
}

function renderTextCloseFromModel() {
  if (!textCloseList) return;
  textCloseList.innerHTML = "";

  if (textCloseMeta) textCloseMeta.textContent = t("polls.textClose.instructions");

  for (const q of textCloseModel) {
    const box = document.createElement("div");
    box.className = "tcQ";
    box.innerHTML = `
      <div class="head">
        <div>
          <div class="qTitle">P${q.ord}: ${escapeHtml(q.text)}</div>
          <div class="qHint">${t("polls.textClose.hint")}</div>
        </div>
        <div class="tcTools">
          <button class="btn sm tcMergeDup" type="button" title="${t("polls.textClose.mergeTitle")}">${t("polls.textClose.mergeLabel")}</button>
        </div>
      </div>
      <div class="tcList"></div>
    `;

    const list = box.querySelector(".tcList");
    const btnDup = box.querySelector(".tcMergeDup");

    btnDup?.addEventListener("click", () => {
      saveSnapshot();
      q.items = mergeDuplicatesInPlace(q.items);
      rerender();
    });

    const rerender = () => {
      list.innerHTML = "";
      q.items.sort((a, b) => b.count - a.count);
      validateTextCloseModel();

      let mergeSrcIdx = null; // tryb merge na touch

      for (let idx = 0; idx < q.items.length; idx++) {
        const it = q.items[idx];

        const row = document.createElement("div");
        row.className = "tcItem";
        row.draggable = true;
        row.innerHTML = `
          <input class="tcTxtInp" type="text" />
          <div class="tcCnt"></div>
          <button class="tcMergeBtn" type="button" title="${t("polls.textClose.mergeWith")}" aria-label="${t("polls.textClose.mergeWith")}">${icon("merge")}</button>
          <button class="tcDel" type="button" title="${t("polls.textClose.remove")}" aria-label="${t("polls.textClose.remove")}">${icon("trash")}</button>
        `;

        const inp = row.querySelector(".tcTxtInp");
        inp.value = it.text;

        inp.addEventListener("focus", () => {
          inp._oldValue = inp.value;
        });

        inp.addEventListener("input", () => {
          it.text = inp.value;
          validateTextCloseModel();
        });

        inp.addEventListener("blur", () => {
          if (inp.value !== inp._oldValue) {
            // Przywróć stary stan, zapisz snapshot, potem przywróć nowy
            const newValue = inp.value;
            it.text = inp._oldValue;
            saveSnapshot();
            it.text = newValue;
          }
        });

        row.querySelector(".tcCnt").textContent = String(it.count || 0);

        row.querySelector(".tcDel").addEventListener("click", () => {
          saveSnapshot();
          q.items.splice(idx, 1);
          rerender();
        });

        row.addEventListener("dragstart", (e) => {
          row.classList.add("dragging");
          e.dataTransfer.setData("text/plain", String(idx));
        });
        row.addEventListener("dragend", () => row.classList.remove("dragging"));
        row.addEventListener("dragover", (e) => e.preventDefault());

        row.addEventListener("drop", (e) => {
          e.preventDefault();
          const fromIdx = Number(e.dataTransfer.getData("text/plain"));
          const toIdx = idx;
          if (!Number.isFinite(fromIdx) || fromIdx === toIdx) return;

          const fromIt = q.items[fromIdx];
          const toIt = q.items[toIdx];
          if (!fromIt || !toIt) return;

          saveSnapshot();
          toIt.count += fromIt.count;
          q.items.splice(fromIdx, 1);
          rerender();
        });

        // Przycisk ⇄ — tryb merge na touch
        row.querySelector(".tcMergeBtn").addEventListener("click", () => {
          if (mergeSrcIdx === idx) {
            // anuluj tryb
            mergeSrcIdx = null;
            list.querySelectorAll(".tcItem").forEach(r => r.classList.remove("merge-src", "merge-target"));
            return;
          }
          if (mergeSrcIdx !== null) {
            // wykonaj merge: mergeSrcIdx → idx
            const fromIt = q.items[mergeSrcIdx];
            const toIt = q.items[idx];
            if (fromIt && toIt) {
              saveSnapshot();
              toIt.count += fromIt.count;
              q.items.splice(mergeSrcIdx, 1);
            }
            mergeSrcIdx = null;
            rerender();
            return;
          }
          // wejdź w tryb wyboru celu
          mergeSrcIdx = idx;
          list.querySelectorAll(".tcItem").forEach((r, i) => {
            r.classList.remove("merge-src", "merge-target");
            if (i === idx) r.classList.add("merge-src");
            else r.classList.add("merge-target");
          });
        });

        list.appendChild(row);
      }
    };

    rerender();
    textCloseList?.appendChild(box);
  }
}


/* =======================
   B. Wypustki Udostępnianie · Wyniki
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
  if (!game || game.status !== STATUS.POLL_OPEN) return;
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
  if (!game || game.status !== STATUS.POLL_OPEN) return;
  await loadTasks();
  renderSubs();
}

function tagFor(tk) {
  if (tk.status === "done") return { cls: "tag--ok", text: t("polls.share.state.done") };
  if (tk.status === "declined") return { cls: "tag--bad", text: t("polls.share.state.declined") };
  return { cls: "tag--warn", text: t("polls.share.state.waiting") };
}

function renderSubs(force = false) {
  if (!subsGrid) return;

  // zaznaczenia zostają tylko dla wciąż niezaproszonych
  for (const id of [...selectedSubIds]) {
    const sub = subsAll.find((s) => String(s.sub_id) === id);
    if (!sub || taskForSub(sub) || cooldownActive(id)) selectedSubIds.delete(id);
  }

  const sig = JSON.stringify([
    subsAll.map((s) => [s.sub_id, subLabel(s), cooldownActive(s.sub_id)]),
    tasks.map((tk) => [tk.id, tk.status, tk.reminder_count]),
    [...selectedSubIds].sort(),
  ]);
  if (!force && sig === subsSig) return;
  subsSig = sig;

  if (btnSendInvites) btnSendInvites.disabled = selectedSubIds.size === 0;

  if (!subsAll.length) {
    subsGrid.innerHTML = "";
    if (subsEmpty) {
      subsEmpty.style.display = "";
      subsEmpty.innerHTML = `${escapeHtml(t("polls.share.noSubs"))} <a href="${escapeHtml(withLangParam("/subscriptions/"))}">${escapeHtml(t("polls.share.noSubsLink"))}</a>`;
    }
    return;
  }
  if (subsEmpty) subsEmpty.style.display = "none";

  const invited = [];
  const rest = [];
  for (const sub of subsAll) {
    const tk = taskForSub(sub);
    (tk ? invited : rest).push({ sub, tk });
  }

  const frag = document.createDocumentFragment();

  for (const { sub, tk } of invited) {
    const tag = tagFor(tk);
    const until = cooldownActive(sub.sub_id);
    const waiting = taskIsWaiting(tk);
    const limit = (tk.reminder_count || 0) >= 2;
    const bellTitle = limit ? t("polls.share.reminderLimit")
      : until ? t("polls.share.canResend", { when: formatUntil(until) })
      : t("polls.share.remind");

    const tile = document.createElement("div");
    tile.className = "card subTile invited";
    tile.innerHTML = `
      ${waiting ? `<button class="x x-bell" type="button" data-act="remind" ${limit || until ? "disabled" : ""} title="${escapeHtml(bellTitle)}" aria-label="${escapeHtml(bellTitle)}">${icon("bell")}</button>` : ""}
      <button class="x" type="button" data-act="remove" title="${escapeHtml(t("polls.share.remove"))}" aria-label="${escapeHtml(t("polls.share.remove"))}">${icon("trash")}</button>
      <div class="name"></div>
      <div class="meta"><span class="tag ${tag.cls}">${escapeHtml(tag.text)}</span></div>
      ${waiting && until && !limit ? `<div class="subNote">${escapeHtml(t("polls.share.canResend", { when: formatUntil(until) }))}</div>` : ""}
    `;
    tile.querySelector(".name").textContent = subLabel(sub);
    tile.querySelector('[data-act="remove"]').addEventListener("click", () => void removeShare(tk, sub));
    tile.querySelector('[data-act="remind"]')?.addEventListener("click", () => void remindShare(tk, sub));
    frag.appendChild(tile);
  }

  for (const { sub } of rest) {
    const id = String(sub.sub_id);
    const until = cooldownActive(id);
    const tile = document.createElement("div");
    tile.className = "card subTile pick" + (selectedSubIds.has(id) ? " selected" : "") + (until ? " blocked" : "");
    tile.setAttribute("role", "checkbox");
    tile.setAttribute("aria-checked", selectedSubIds.has(id) ? "true" : "false");
    tile.innerHTML = `
      <div class="name" style="padding-right:0"></div>
      <div class="meta"><span class="tag tag--muted">${escapeHtml(t("polls.share.state.notInvited"))}</span></div>
      ${until ? `<div class="subNote">${escapeHtml(t("polls.share.canResend", { when: formatUntil(until) }))}</div>` : ""}
    `;
    tile.querySelector(".name").textContent = subLabel(sub);
    if (!until) {
      tile.tabIndex = 0;
      const toggle = () => {
        if (selectedSubIds.has(id)) selectedSubIds.delete(id); else selectedSubIds.add(id);
        renderSubs();
      };
      tile.addEventListener("click", toggle);
      tile.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
      });
    }
    frag.appendChild(tile);
  }

  subsGrid.replaceChildren(frag);
}

function rpcErrText(error, data) {
  return error?.message || error?.details || data?.err || data?.error || t("common.genericError");
}

async function sendInvites() {
  if (!game || busy || !selectedSubIds.size) return;
  busy = true;
  if (btnSendInvites) btnSendInvites.disabled = true;
  try {
    // baza wycofuje czekające zaproszenia spoza listy — więc wysyłamy czekające + nowo zaznaczone
    const waitingIds = subsAll.filter((s) => taskIsWaiting(taskForSub(s))).map((s) => String(s.sub_id));
    const ids = [...new Set([...waitingIds, ...selectedSubIds])];

    const { data, error } = await sb().rpc("polls_hub_share_poll", { p_game_id: gameId, p_sub_ids: ids });
    if (error || data?.ok === false) {
      await alertModal({ text: `${t("polls.share.inviteFailed")}\n\n${rpcErrText(error, data)}` });
      return;
    }

    for (const b of data?.blocked_sub_ids || []) {
      const until = Date.parse(b.cooldown_until);
      if (b.sub_id && Number.isFinite(until)) cooldownBySub.set(String(b.sub_id), until);
    }

    const res = await sendPollInviteMails({ mailItems: data?.mail, pollName: game.name, currentUser });
    selectedSubIds.clear();

    if (res.failed) await alertModal({ text: `${t("polls.share.mailFailed")} (${res.failed}/${res.total})` });
    else setMsg(t("polls.share.invitesSent", { n: res.sent }));
    if (data?.blocked) setMsg(t("polls.share.invitesBlocked", { n: data.blocked }));
  } catch (e) {
    console.error("[polls] send invites", e);
    await alertModal({ text: `${t("polls.share.inviteFailed")}\n\n${e?.message || e}` });
  } finally {
    busy = false;
    await safeLoadSubs();
  }
}

async function remindShare(tk, sub) {
  if (busy) return;
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
    setMsg(t("polls.share.removed"));
  } catch (e) {
    console.error("[polls] remove share", e);
    await alertModal({ text: `${t("polls.share.removeFailed")}\n\n${e?.message || e}` });
  } finally {
    busy = false;
    await safeLoadSubs();
    void refreshVotesChip();
    void previewResults().catch(() => {});
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
   Odświeżanie
======================= */

let stateKey = null;      // status + klucz: zmiana = nowe uruchomienie / koniec
let refreshSeq = 0;

function renderShareSection(st, link) {
  const open = st === STATUS.POLL_OPEN;
  if (shareBody) shareBody.style.display = open ? "" : "none";
  if (shareEmpty) {
    shareEmpty.style.display = open ? "none" : "";
    shareEmpty.textContent = st === STATUS.READY ? t("polls.share.closedEmpty") : t("polls.share.draftEmpty");
  }
  if (open) {
    if (pollLinkEl) pollLinkEl.value = link;
    setLinkUiVisible(true);
    void renderQr(link);
  } else {
    if (pollLinkEl) pollLinkEl.value = "";
    setLinkUiVisible(false);
    renderedQrUrl = "";
  }
}

function applyActionButtons(st, chk) {
  if (game.type === TYPES.PREPARED) {
    setActionButton(t("polls.actions.noPoll"), true, "");
    if (btnAbort) btnAbort.style.display = "none";
    return;
  }
  if (btnAbort) btnAbort.style.display = st === STATUS.POLL_OPEN && !uiTextCloseOpen ? "" : "none";
  const reason = chk?.ok ? "" : (chk?.reason || "");
  if (st === STATUS.DRAFT) setActionButton(t("polls.actions.openPoll"), !chk?.ok, reason);
  else if (st === STATUS.POLL_OPEN) setActionButton(t("polls.actions.closePoll"), !chk?.ok, reason);
  else if (st === STATUS.READY) setActionButton(t("polls.actions.reopenPoll"), !chk?.ok, reason);
  else setActionButton("", true, "");
}

async function validateForState(st) {
  if (game.type === TYPES.PREPARED) return null;
  if (st === STATUS.POLL_OPEN) return validateCanClose(game);
  return validateCanOpen(game); // szkic i zamknięta: te same warunki uruchomienia
}

async function refresh() {
  const seq = ++refreshSeq;
  if (!gameId) {
    if (pollBar) pollBar.style.display = "none";
    if (cardMain) cardMain.style.display = "none";
    if (cardEmpty) cardEmpty.style.display = "";
    setMsg(t("polls.missingId"));
    return;
  }

  game = await loadGame();
  if (seq !== refreshSeq) return;

  if (cardEmpty) cardEmpty.style.display = "none";
  if (pollBar) pollBar.style.display = "";
  if (cardMain) cardMain.style.display = uiTextCloseOpen ? "none" : "";

  const st = game.status || STATUS.DRAFT;
  const key = `${st}:${game.share_key_poll}`;
  if (key !== stateKey) {
    // nowy stan lub nowe uruchomienie: domyślna wypustka, czysta lista wyników i zaznaczeń
    stateKey = key;
    tabTouchedByUser = false;
    resetResultsDom();
    selectedSubIds.clear();
    subsAll = [];
    tasks = [];
    subsSig = "";
    firstQuestionId = null;
  }
  if (!tabTouchedByUser) setActiveTab(st === STATUS.POLL_OPEN ? "share" : "results");

  setChips(game);
  const pollGameName = $("pollGameName");
  if (pollGameName) pollGameName.textContent = game.name || t("polls.defaultName");

  renderShareSection(st, st === STATUS.POLL_OPEN ? pollLink(game) : "");

  if (uiTextCloseOpen) return;

  try {
    const [chk] = await Promise.all([
      validateForState(st),
      previewResults(),
      st === STATUS.POLL_OPEN ? refreshVotesChip() : Promise.resolve(),
      st === STATUS.POLL_OPEN ? safeLoadSubs() : Promise.resolve(),
    ]);
    if (seq !== refreshSeq) return;
    applyActionButtons(st, chk);
  } catch (e) {
    console.warn("[polls] refresh failed", e);
    if (resultsMeta) resultsMeta.textContent = t("polls.results.refreshFailed");
    applyActionButtons(st, null);
  }
}

// odświeżanie wyników na żywo (bez przebudowy listy)
async function liveTick() {
  if (document.hidden || uiTextCloseOpen || busy || !game || game.status !== STATUS.POLL_OPEN) return;
  try {
    const g = await loadGame();
    if (g.status !== game.status || g.share_key_poll !== game.share_key_poll) {
      await refresh();
      return;
    }
    const [chk] = await Promise.all([
      validateCanClose(game),
      previewResults(),
      refreshVotesChip(),
      refreshTasksOnly(),
    ]);
    if (!uiTextCloseOpen && !busy) applyActionButtons(STATUS.POLL_OPEN, chk);
  } catch (e) {
    console.warn("[polls] live refresh failed", e);
  }
}

/* =======================
   Akcje stanu
======================= */

async function openPollFlow() {
  const chk = await validateCanOpen(game);
  if (!chk.ok) return setMsg(chk.reason);

  const ok = await confirmModal({
    title: t("polls.modals.open.title"),
    text: t("polls.modals.open.text", { name: game.name }),
    okText: t("polls.modals.open.ok"),
    cancelText: t("polls.modals.open.cancel"),
  });
  if (!ok) return;

  try {
    const { error } = await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
    if (error) throw error;
    setMsg(t("polls.status.opened"));
  } catch (e) {
    console.error("[polls] open error:", e);
    await alertModal({ text: `${t("polls.errors.open")}\n\n${e?.message || e}` });
  }
}

async function closePollFlow() {
  const chk = await validateCanClose(game);
  if (!chk.ok) return setMsg(chk.reason);

  if (game.type === TYPES.POLL_POINTS) {
    const ok = await confirmModal({
      title: t("polls.modals.closePoints.title"),
      text: t("polls.modals.closePoints.text"),
      okText: t("polls.modals.closePoints.ok"),
      cancelText: t("polls.modals.closePoints.cancel"),
    });
    if (!ok) return;

    try {
      const { error } = await sb().rpc("poll_points_close_and_normalize", {
        p_game_id: gameId,
        p_key: game.share_key_poll,
      });
      if (error) throw error;
      setMsg(t("polls.status.closedPoints"));
    } catch (e) {
      console.error("[polls] close points error:", e);
      await alertModal({ text: `${t("polls.errors.close")}\n\n${gameRuleErrorMessage(e) || e?.message || e}` });
    }
    return;
  }

  // poll_text: pełnoszerokie okno scalania odpowiedzi
  try {
    textCloseModel = await buildTextClosePanel();
    setMsg(t("polls.textClose.editHint"));
  } catch (e) {
    console.error("[polls] build text close:", e);
    setTextCloseUi(false);
    await alertModal({ text: `${t("polls.errors.loadAnswers")}\n\n${e?.message || e}` });
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
    setMsg(t("polls.status.aborted"));
  } catch (e) {
    console.error("[polls] abort error:", e);
    await alertModal({ text: `${t("polls.errors.abort")}\n\n${e?.message || e}` });
  }
}

async function restartPollFlow() {
  const chk = await validateCanOpen(game);
  if (!chk.ok) return setMsg(chk.reason);

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
    setMsg(t("polls.status.reopened"));
  } catch (e) {
    console.error("[polls] reopen error:", e);
    await alertModal({ text: `${t("polls.errors.reopen")}${aborted ? `\n${t("polls.errors.reopenAborted")}` : ""}\n\n${e?.message || e}` });
  }
}

async function runStateAction(fn) {
  if (!game || busy) return;
  busy = true;
  if (btnPollAction) btnPollAction.disabled = true;
  if (btnAbort) btnAbort.disabled = true;
  try {
    await fn();
  } finally {
    busy = false;
    if (btnAbort) btnAbort.disabled = false;
    // stan i klucz zawsze czytamy z bazy od nowa (uruchomienie zmienia share_key_poll)
    if (!uiTextCloseOpen) {
      try { await refresh(); } catch (e) { console.warn("[polls] refresh after action", e); }
    }
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
    btnBack.innerHTML = iconText("arrow-left", t("polls.backToGames"));
  }

  btnManual?.addEventListener("click", () => {
    location.href = buildManualUrl();
  });

  btnBack?.addEventListener("click", async () => {
    if (uiTextCloseOpen) {
      const ok = await confirmModal({
        title: t("polls.textClose.leaveCheckTitle"),
        text: t("polls.textClose.leaveCheckText"),
        okText: t("polls.textClose.leaveOk"),
        cancelText: t("polls.textClose.leaveCancel"),
      });
      if (!ok) return;
      setTextCloseUi(false);
    }
    location.href = backTarget;
  });

  // Guard: jeśli jest otwarty edytor tekstu, potwierdź przed wylogowaniem
  const btnLogoutMenu = document.getElementById("topbar-account-logout");
  btnLogoutMenu?.addEventListener("click", async (e) => {
    if (!uiTextCloseOpen) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const ok = await confirmModal({
      title: t("polls.textClose.leaveCheckTitle"),
      text: t("polls.textClose.logoutWarn"),
      okText: t("polls.textClose.logoutOk"),
      cancelText: t("polls.textClose.leaveCancel"),
    });
    if (!ok) return;
    setTextCloseUi(false);

    btnLogoutMenu.click();
  }, true); // capture = true, żeby interceptować przed handlerem dropdown

  tabShare?.addEventListener("click", () => setActiveTab("share", { byUser: true }));
  tabResults?.addEventListener("click", () => setActiveTab("results", { byUser: true }));

  btnCopy?.addEventListener("click", async () => {
    if (!pollLinkEl?.value) return;
    try {
      await navigator.clipboard.writeText(pollLinkEl.value);
      setMsg(t("polls.copy.success"));
    } catch {
      setMsg(t("polls.copy.failed"));
    }
  });

  btnOpen?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  btnOpenQr?.addEventListener("click", () => {
    showPollQrModal();
  });

  btnSendInvites?.addEventListener("click", () => void sendInvites());

  btnPollAction?.addEventListener("click", () => {
    if (!game) return;
    const st = game.status || STATUS.DRAFT;
    if (st === STATUS.DRAFT) return runStateAction(openPollFlow);
    if (st === STATUS.POLL_OPEN) return runStateAction(closePollFlow);
    if (st === STATUS.READY) return runStateAction(restartPollFlow);
  });

  btnAbort?.addEventListener("click", () => runStateAction(abortPollFlow));

  const cancelTextClose = () => {
    setTextCloseUi(false);
    setMsg(t("polls.textClose.cancelled"));
    void refresh();
  };
  btnCancelTextClose?.addEventListener("click", cancelTextClose);
  btnCancelTextCloseTop?.addEventListener("click", cancelTextClose);

  btnUndo?.addEventListener("click", undoAction);
  btnRedo?.addEventListener("click", redoAction);

  // Globalne skróty klawiszowe (tylko w trybie zamykania)
  document.addEventListener("keydown", (e) => {
    if (!uiTextCloseOpen) return;

    const isZ = e.key.toLowerCase() === "z";
    const isY = e.key.toLowerCase() === "y";
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (ctrl && isZ) {
      e.preventDefault();
      if (shift) redoAction();
      else undoAction();
    } else if (ctrl && isY) {
      e.preventDefault();
      redoAction();
    }
  });

  btnFinishTextClose?.addEventListener("click", async () => {
    if (!game || game.type !== TYPES.POLL_TEXT) return;
    if (!textCloseModel) return;

    btnFinishTextClose.disabled = true;
    btnCancelTextClose.disabled = true;
    if (btnCancelTextCloseTop) btnCancelTextCloseTop.disabled = true;

    try {
      const payloadItems = [];

      for (const q of textCloseModel) {
        const cleaned = q.items
          .map((x) => ({ text: clip17Final(x.text), count: Number(x.count) || 0 }))
          .filter((x) => x.text && x.count > 0);

        const final = normalizeTo100Int(cleaned)
          .map((x) => ({ text: clip17Final(x.text), points: Number(x.points) || 0 }))
          .filter((x) => x.text);

        if (final.length < 3) {
          throw new Error(t("polls.textClose.minAnswers", { ord: q.ord }));
        }

        payloadItems.push({ question_id: q.question_id, answers: final });
      }

      const ok = await confirmModal({
        title: t("polls.modals.closeText.title"),
        text: t("polls.modals.closeText.text"),
        okText: t("polls.modals.closeText.ok"),
        cancelText: t("polls.modals.closeText.cancel"),
      });
      if (!ok) return;

      const { error } = await sb().rpc("poll_text_close_apply", {
        p_game_id: gameId,
        p_key: game.share_key_poll,
        p_payload: { items: payloadItems },
      });
      if (error) throw error;

      setMsg(t("polls.status.closed"));
      setTextCloseUi(false);
      resetResultsDom();
      await refresh();
    } catch (e) {
      console.error("[polls] close text error:", e);
      await alertModal({ text: `${t("polls.errors.close")}\n\n${gameRuleErrorMessage(e) || e?.message || e}` });
    } finally {
      btnFinishTextClose.disabled = false;
      btnCancelTextClose.disabled = false;
      if (btnCancelTextCloseTop) btnCancelTextCloseTop.disabled = false;
    }
  });

  // resourceType: "game" — dołącza do już istniejącego wspólnego klucza
  // z editor.js/game-settings.js (patrz komentarz w editor.js przy tym
  // samym wywołaniu): zamykanie ankiety zapisuje znormalizowane punkty do
  // answers.fixed_points, więc otwarcie ankiety wyklucza edytor/ustawienia
  // tej samej gry i odwrotnie, nie tylko drugą kartę tej samej strony.
  if (gameId) {
    const lock = await guardResourceLock({
      resourceType: "game",
      resourceId: gameId,
      context: "polls",
      message: t("resourceLock.gameMessage"),
      backHref: backTarget,
    });
    if (!lock.ok) return;
    // Blokada stanu: strona ankiety tylko dla gry, która może mieć ankietę.
    if (!(await guardGameState(gameId, "poll_entry", { backHref: backTarget }))) return;
  }

  await refresh();
  setInterval(() => void liveTick(), LIVE_REFRESH_MS);
});
