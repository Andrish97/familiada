// js/pages/polls.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { alertModal, confirmModal } from "../core/modal.js";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { initI18n, t, withLangParam } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const from = qs.get("from");

const $ = (id) => document.getElementById(id);

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBack");
const btnManual = $("btnManual");
const msg = $("msg");

const cardMain = $("cardMain");
const cardEmpty = $("cardEmpty");

const chipType = $("chipType");
const chipStatus = $("chipStatus");
const hintTop = $("hintTop");

const gName = $("gName");
const gMeta = $("gMeta");
const pollLinkEl = $("pollLink");
const qrBox = $("qr");

const btnCopy = $("btnCopy");
const btnOpen = $("btnOpen");
const btnOpenQr = $("btnOpenQr");

const btnPollAction = $("btnPollAction");

// “⟳ Odśwież” (fallback na stare ID, jeśli HTML jeszcze nie zmieniony)
const btnRefreshResults = $("btnRefreshResults") || $("btnPreview");

const resultsCard = $("resultsCard");
const resultsMeta = $("resultsMeta");
const resultsList = $("resultsList");

const textCloseCard = $("textCloseCard");
const textCloseMeta = $("textCloseMeta");
const textCloseList = $("textCloseList");
const btnCancelTextClose = $("btnCancelTextClose");
const btnFinishTextClose = $("btnFinishTextClose");

let game = null;
let textCloseModel = null;
let uiTextCloseOpen = false;

const backTarget = from === "polls-hub" ? "polls-hub.html" : "builder.html";

// ===== Preview DOM cache (poll_points) =====
let ppCache = null;
// ppCache = { qsKey, ansKey, valByAnswerId, builtAt }

// --- i18n sync (polls -> poll-qr) ---
const I18N_BC_NAME = "familiada:polls:qr-sync";
const i18nBc = ("BroadcastChannel" in window) ? new BroadcastChannel(I18N_BC_NAME) : null;

function broadcastLang(lang) {
  try {
    const scope = `${game?.id || ""}:${game?.share_key_poll || ""}`;
    i18nBc?.postMessage({ type: "polls:qr:i18n", scope, lang });
  } catch (e) {
    console.warn("[polls] i18n broadcast failed", e);
  }
}

window.addEventListener("i18n:lang", (e) => {
  const lang = e?.detail?.lang;
  if (!lang) return;

  broadcastLang(lang);
  void refresh();
});

function setTextCloseUi(open) {
  uiTextCloseOpen = !!open;

  if (textCloseCard) textCloseCard.style.display = open ? "" : "none";

  // ukryj główne przyciski gdy panel textClose otwarty
  if (btnPollAction) btnPollAction.style.display = open ? "none" : "";
  if (btnRefreshResults) btnRefreshResults.style.display = open ? "none" : "";

  // wyniki: widoczne zawsze, ale nie podczas textClose
  if (resultsCard) resultsCard.style.display = open ? "none" : "";
}

function resetPreviewDomCache() {
  ppCache = null;
}

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
const RULES = {
  QN_MIN: 10,
  AN_MIN: 3,
  AN_MAX: 6,
};

function setMsg(text) {
  if (!msg) return;
  msg.textContent = text || "";
  if (text) setTimeout(() => (msg.textContent = ""), 2400);
}

function typeLabel(type) {
  if (type === TYPES.POLL_TEXT) return t("builder.types.pollText");
  if (type === TYPES.POLL_POINTS) return t("builder.types.pollPoints");
  if (type === TYPES.PREPARED) return t("builder.types.prepared");
  return String(type || "—").toUpperCase();
}

function statusLabel(st) {
  const s = st || STATUS.DRAFT;
  if (s === STATUS.DRAFT) return t("builder.status.draft");
  if (s === STATUS.POLL_OPEN) return t("builder.status.open");
  if (s === STATUS.READY) return t("builder.status.closed");
  return String(s).toUpperCase();
}

function setChips(g) {
  if (chipType) chipType.textContent = typeLabel(g?.type);

  if (chipStatus) {
    chipStatus.className = "chip status";
    const st = g?.status || STATUS.DRAFT;
    chipStatus.textContent = statusLabel(st);
    if (st === STATUS.READY) chipStatus.classList.add("ok");
    else if (st === STATUS.POLL_OPEN) chipStatus.classList.add("warn");
    else chipStatus.classList.add("bad");
  }

  // hintTop – bez “g.desc”, bo go nie ma
  if (hintTop) hintTop.textContent = "";
}

function setLinkUiVisible(on) {
  const v = !!on;
  if (btnCopy) btnCopy.disabled = !v;
  if (btnOpen) btnOpen.disabled = !v;
  if (btnOpenQr) btnOpenQr.disabled = !v;
  if (!v) clearQr();
}

function setLinkRowVisible(visible) {
  const v = !!visible;

  // input
  if (pollLinkEl) {
    pollLinkEl.style.display = v ? "" : "none";
    // opcjonalnie: jak ukryte, to czyść wartość
    if (!v) pollLinkEl.value = "";
  }

  // przyciski
  if (btnCopy) btnCopy.style.display = v ? "" : "none";
  if (btnOpen) btnOpen.style.display = v ? "" : "none";
  if (btnOpenQr) btnOpenQr.style.display = v ? "" : "none";

  // mini-QR
  if (!v) clearQr();
}


function clearQr() {
  if (qrBox) qrBox.innerHTML = "";
}

async function renderSmallQr(url) {
  if (!qrBox) return;
  qrBox.innerHTML = "";
  if (!url) return;

  try {
    const wrap = document.createElement("div");
    wrap.className = "qrFrameSmall";

    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, url, { width: 260, margin: 1 });

    wrap.appendChild(canvas);
    qrBox.appendChild(wrap);
  } catch (e) {
    console.warn("[polls] small QR failed:", e);
    qrBox.textContent = t("polls.qrFailed");
  }
}

function pollLink(g) {
  if (!g) return "";
  const base =
    g.type === TYPES.POLL_TEXT
      ? "poll-text.html"
      : g.type === TYPES.POLL_POINTS
      ? "poll-points.html"
      : "";
  if (!base) return "";

  const u = new URL(withLangParam(base), location.href);
  u.searchParams.set("id", g.id);
  u.searchParams.set("key", g.share_key_poll);
  return u.toString();
}

function updateRefreshButtonState() {
  if (!btnRefreshResults) return;
  btnRefreshResults.disabled = uiTextCloseOpen || !game || !gameId;
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

async function listAnswersFinalForQuestion(qid) {
  const { data, error } = await sb()
    .from("answers")
    .select("id, ord, text, fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listAnswersBasicForQuestion(qid) {
  const { data, error } = await sb()
    .from("answers")
    .select("id, ord, text")
    .eq("question_id", qid)
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

async function countQuestions() {
  const { count, error } = await sb()
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  if (error) throw error;
  return Number(count) || 0;
}

async function countAnswersForQuestion(qid) {
  const { count, error } = await sb()
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("question_id", qid);
  if (error) throw error;
  return Number(count) || 0;
}

/* =======================
   Walidacje
======================= */

async function validateCanOpen(g) {
  if (!g) return { ok: false, reason: t("polls.validation.noGame") };

  // jak w starej logice: otwieramy tylko z draft
  if ((g.status || STATUS.DRAFT) !== STATUS.DRAFT) {
    return { ok: false, reason: t("polls.validation.openOnlyDraft") };
  }

  if (g.type === TYPES.PREPARED) {
    return { ok: false, reason: t("polls.validation.preparedNoPoll") };
  }

  const qn = await countQuestions();
  if (qn < RULES.QN_MIN) {
    return { ok: false, reason: t("polls.validation.minQuestions", { min: RULES.QN_MIN, count: qn }) };
  }

  if (g.type === TYPES.POLL_POINTS) {
    const qsList = await listQuestionsBasic();
    for (const q of qsList) {
      const an = await countAnswersForQuestion(q.id);
      if (an < RULES.AN_MIN || an > RULES.AN_MAX) {
        return {
          ok: false,
          reason: t("polls.validation.pointsRange", { min: RULES.AN_MIN, max: RULES.AN_MAX }),
        };
      }
    }
  }

  return { ok: true, reason: "" };
}

async function validateCanReopen(g) {
  if ((g.status || STATUS.DRAFT) !== STATUS.READY) {
    return { ok: false, reason: t("polls.validation.reopenOnlyClosed") };
  }
  return await validateCanOpen({ ...g, status: STATUS.DRAFT });
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

async function validateCanClose(g) {
  if ((g.status || STATUS.DRAFT) !== STATUS.POLL_OPEN) {
    return { ok: false, reason: t("polls.validation.closeOnlyOpen") };
  }

  const qsList = await listQuestionsBasic();

  if (g.type === TYPES.POLL_POINTS) {
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);
      if (!sid) return { ok: false, reason: t("polls.validation.noActiveSession") };

      const { data, error } = await sb()
        .from("poll_votes")
        .select("answer_id")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);
      if (error) throw error;

      const counts = new Map();
      for (const row of data || []) {
        if (!row.answer_id) continue;
        counts.set(row.answer_id, (counts.get(row.answer_id) || 0) + 1);
      }

      const items = [...counts.entries()].map(([id, count]) => ({ id, count }));
      const normalized = normalizeCountsTo100(items);
      const strong = normalized.filter((x) => x.points >= 3);

      if (strong.length < 3) {
        return { ok: false, reason: t("polls.validation.closeMinPoints") };
      }
    }
    return { ok: true, reason: "" };
  }

  if (g.type === TYPES.POLL_TEXT) {
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);
      if (!sid) return { ok: false, reason: t("polls.validation.noActiveSessionGeneric") };

      const { data, error } = await sb()
        .from("poll_text_entries")
        .select("answer_norm")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);
      if (error) throw error;

      const uniq = new Set((data || []).map((x) => (x.answer_norm || "").trim()).filter(Boolean));
      if (uniq.size < 3) {
        return { ok: false, reason: t("polls.validation.closeMinTextAnswers") };
      }
    }
    return { ok: true, reason: "" };
  }

  return { ok: false, reason: t("polls.validation.unknownType") };
}

/* =======================
   Wyniki (zawsze widoczne) — bez “Перегляд наживо”
======================= */

function buildPollPointsPreviewDom(qsList, ansByQ) {
  if (!resultsList) return null;
  
  // FIX: jeśli ktoś wcześniej wyczyścił resultsList (np. klik ⟳ Odśwież),
  // to ppCache wskazuje na odłączone elementy i nic się nie pokaże.
  // Wtedy unieważniamy cache i przebudowujemy DOM.
  if (ppCache && !resultsList.firstElementChild) {
    ppCache = null;
  }

  const qsKey = qsList.map((q) => q.id).join(",");
  const ansKey = qsList
    .map((q) => {
      const ans = ansByQ.get(q.id) || [];
      return `${q.id}:${ans.map((a) => a.id).join("|")}`;
    })
    .join(";");

  if (ppCache && ppCache.qsKey === qsKey && ppCache.ansKey === ansKey) return ppCache;

  resultsList.innerHTML = "";
  const valByAnswerId = new Map();

  for (const q of qsList) {
    const ans = ansByQ.get(q.id) || [];

    const box = document.createElement("div");
    box.className = "resultQ";
    box.innerHTML = `<div class="qTitle">P${q.ord}: ${q.text}</div>`;

    for (const a of ans) {
      const row = document.createElement("div");
      row.className = "aRow";
      row.innerHTML = `<div class="aTxt"></div><div class="aVal"></div>`;
      row.querySelector(".aTxt").textContent = a.text;
      row.querySelector(".aVal").textContent = "0";
      valByAnswerId.set(a.id, row.querySelector(".aVal"));
      box.appendChild(row);
    }

    resultsList.appendChild(box);
  }

  ppCache = { qsKey, ansKey, valByAnswerId, builtAt: Date.now() };
  return ppCache;
}

function updatePollPointsPreviewValues(valuesByAnswerId) {
  if (!ppCache?.valByAnswerId) return;
  for (const [aid, valEl] of ppCache.valByAnswerId.entries()) {
    const v = valuesByAnswerId.get(aid) || 0;
    const next = String(v);
    if (valEl.textContent !== next) valEl.textContent = next;
  }
}

function showResultsCard() {
  if (resultsCard) resultsCard.style.display = uiTextCloseOpen ? "none" : "";
}

function setResultsMeta(text) {
  if (!resultsMeta) return;
  resultsMeta.textContent = text || "";
}

async function previewResults() {
  showResultsCard();
  if (!resultsList || !resultsMeta || !resultsCard) return;
  if (uiTextCloseOpen) return;
  if (!game) return;

  resultsList.style.display = "grid";

  // loading
  setResultsMeta(t("polls.results.loading"));
  // NIE czyścimy resultsList tutaj — bo poll_points ma cache i może reużyć DOM
  // resultsList.innerHTML = "";


  const st = game.status || STATUS.DRAFT;
  const qsList = await listQuestionsBasic();

  // FINAL (po zamknięciu): pokazujemy meta (to OK)
  if (st === STATUS.READY) {
    for (const q of qsList) {
      const ans = await listAnswersFinalForQuestion(q.id);

      const box = document.createElement("div");
      box.className = "resultQ";
      box.innerHTML = `<div class="qTitle">P${q.ord}: ${q.text}</div>`;

      for (const a of ans || []) {
        const row = document.createElement("div");
        row.className = "aRow";
        row.innerHTML = `<div class="aTxt"></div><div class="aVal"></div>`;
        row.querySelector(".aTxt").textContent = a.text;
        row.querySelector(".aVal").textContent = String(Number(a.fixed_points) || 0);
        box.appendChild(row);
      }

      resultsList.appendChild(box);
    }

    setResultsMeta(t("polls.results.final"));
    return;
  }

  // LIVE (w trakcie): meta ma być PUSTE (usuwa “Перегляд наживо:”)
  if (game.type === TYPES.POLL_POINTS) {
    const ansByQ = new Map();
    for (const q of qsList) {
      const ans = await listAnswersBasicForQuestion(q.id);
      ansByQ.set(q.id, ans || []);
    }

    buildPollPointsPreviewDom(qsList, ansByQ);

    const values = new Map();

    for (const q of qsList) {
      const ans = ansByQ.get(q.id) || [];
      for (const a of ans) values.set(a.id, 0);

      const sid = await getLastSessionIdForQuestion(q.id);
      if (!sid) continue;

      const { data: votes, error: vErr } = await sb()
        .from("poll_votes")
        .select("answer_id")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);
      if (vErr) throw vErr;

      for (const v of votes || []) {
        if (!v.answer_id) continue;
        values.set(v.answer_id, (values.get(v.answer_id) || 0) + 1);
      }
    }

    // Uwaga: buildPollPointsPreviewDom przebudował listę; więc nie czyścimy jej już ponownie.
    updatePollPointsPreviewValues(values);
    setResultsMeta(""); // <— TU usuwamy LIVE tekst
    return;
  }

  // poll_text LIVE
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

    const rows = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([txt, cnt]) => ({ text: txt, val: cnt }));

    const box = document.createElement("div");
    box.className = "resultQ";
    box.innerHTML = `<div class="qTitle">P${q.ord}: ${q.text}</div>`;

    for (const a of rows) {
      const row = document.createElement("div");
      row.className = "aRow";
      row.innerHTML = `<div class="aTxt"></div><div class="aVal"></div>`;
      row.querySelector(".aTxt").textContent = a.text;
      row.querySelector(".aVal").textContent = String(a.val);
      box.appendChild(row);
    }

    resultsList.appendChild(box);
  }

  setResultsMeta(""); // <— TU usuwamy LIVE tekst
}

/* =======================
   poll_text close panel
======================= */

function clip17Final(s) {
  const t1 = String(s ?? "").trim();
  if (!t1) return "";
  return t1.length > 17 ? t1.slice(0, 17) : t1;
}

// normalizacja “klasyczna” dla text-close (z Twojej wersji)
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

async function buildTextClosePanel() {
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

  if (textCloseMeta) textCloseMeta.textContent = t("polls.textClose.instructions");

  for (const q of model) {
    const box = document.createElement("div");
    box.className = "tcQ";
    box.innerHTML = `
      <div class="head">
        <div>
          <div class="qTitle">P${q.ord}: ${q.text}</div>
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
      q.items = mergeDuplicatesInPlace(q.items);
      rerender();
    });

    const rerender = () => {
      list.innerHTML = "";
      q.items.sort((a, b) => b.count - a.count);

      for (let idx = 0; idx < q.items.length; idx++) {
        const it = q.items[idx];

        const row = document.createElement("div");
        row.className = "tcItem";
        row.draggable = true;
        row.innerHTML = `
          <input class="tcTxtInp" type="text" />
          <div class="tcCnt"></div>
          <button class="tcDel" type="button" title="${t("polls.textClose.remove")}">✕</button>
        `;

        const inp = row.querySelector(".tcTxtInp");
        inp.value = it.text;

        inp.addEventListener("input", () => {
          it.text = inp.value;
        });

        row.querySelector(".tcCnt").textContent = String(it.count || 0);

        row.querySelector(".tcDel").addEventListener("click", () => {
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

          toIt.count += fromIt.count;
          q.items.splice(fromIdx, 1);
          rerender();
        });

        list.appendChild(row);
      }
    };

    rerender();
    textCloseList?.appendChild(box);
  }

  return model;
}

/* =======================
   UI / Actions
======================= */

function setActionButton(label, disabled, hint) {
  if (btnPollAction) {
    btnPollAction.textContent = label || "—";
    btnPollAction.disabled = !!disabled;
  }
  if (hintTop) hintTop.textContent = hint || "";
}

async function applyPollPointsUniqueFixedPoints() {
  // placeholder jak u Ciebie (jeśli masz realną implementację w repo – podmień tutaj)
}

async function refresh() {
  if (!gameId) {
    if (cardMain) cardMain.style.display = "none";
    if (cardEmpty) cardEmpty.style.display = "";
    setMsg(t("polls.missingId"));
    return;
  }

  game = await loadGame();

  if (cardEmpty) cardEmpty.style.display = "none";
  if (cardMain) cardMain.style.display = "";

  setChips(game);

  if (gName) gName.textContent = game.name || t("polls.defaultName");

  if (gMeta) {
    if (game.type === TYPES.POLL_TEXT) {
      gMeta.textContent = t("polls.meta.pollText", { min: RULES.QN_MIN });
    } else if (game.type === TYPES.POLL_POINTS) {
      gMeta.textContent = t("polls.meta.pollPoints", {
        min: RULES.QN_MIN,
        minAns: RULES.AN_MIN,
        maxAns: RULES.AN_MAX,
      });
    } else {
      gMeta.textContent = t("polls.meta.prepared");
    }
  }

  // resultsCard zawsze widoczny (poza textClose)
  showResultsCard();

  // link + QR (pokazujemy TYLKO gdy poll jest otwarty)
  const st = game.status || STATUS.DRAFT;
  
  if (st === STATUS.POLL_OPEN) {
    setLinkRowVisible(true);
  
    const link = pollLink(game);
    if (pollLinkEl) pollLinkEl.value = link;
  
    setLinkUiVisible(true);
    await renderSmallQr(link);
  } else {
    // draft + ready: link i przyciski mają zniknąć
    setLinkRowVisible(false);
    setLinkUiVisible(false);
  }

  updateRefreshButtonState();

  // odśwież wyniki przy każdym refresh UI (bez “LIVE” metki)
  if (!uiTextCloseOpen) {
    try {
      resetPreviewDomCache(); // bezpiecznie: nie zostawiaj starego DOM przy zmianach gry
      await previewResults();
    } catch (e) {
      console.warn("[polls] previewResults in refresh failed", e);
      setResultsMeta(t("polls.results.refreshFailed"));
    }
  }

  // przycisk główny
  if (game.type === TYPES.PREPARED) {
    setActionButton(t("polls.actions.noPoll"), true, t("polls.meta.prepared"));
    return;
  }

  if (st === STATUS.DRAFT) {
    const chk = await validateCanOpen(game);
    setActionButton(
      t("polls.actions.openPoll"),
      !chk.ok,
      chk.ok ? t("polls.actions.openReady") : chk.reason
    );
    return;
  }

  if (st === STATUS.POLL_OPEN) {
    const chk = await validateCanClose(game);
    setActionButton(
      t("polls.actions.closePoll"),
      !chk.ok,
      chk.ok ? t("polls.actions.closeReady") : chk.reason
    );
    return;
  }

  if (st === STATUS.READY) {
    const chk = await validateCanReopen(game);
    setActionButton(
      t("polls.actions.reopenPoll"),
      !chk.ok,
      chk.ok ? t("polls.actions.reopenHint") : chk.reason
    );
    return;
  }

  setActionButton("—", true, t("polls.actions.unknownStatus"));
}

/* =======================
   Init
======================= */

document.addEventListener("DOMContentLoaded", async () => {
  const u = await requireAuth("index.html");
  if (who) who.textContent = u?.username || u?.email || "—";

  if (btnBack) {
    btnBack.textContent = from === "polls-hub" ? t("polls.backToHub") : t("polls.backToGames");
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

  btnLogout?.addEventListener("click", async () => {
    if (uiTextCloseOpen) {
      const ok = await confirmModal({
        title: t("polls.textClose.leaveCheckTitle"),
        text: t("polls.textClose.logoutWarn"),
        okText: t("polls.textClose.logoutOk"),
        cancelText: t("polls.textClose.leaveCancel"),
      });
      if (!ok) return;
      setTextCloseUi(false);
    }
    await signOut();
    location.href = "index.html";
  });

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
    if (!pollLinkEl?.value) return;

    const u1 = new URL(withLangParam("poll-qr.html"), location.href);
    u1.searchParams.set("url", pollLinkEl.value);
    window.open(u1.toString(), "_blank", "noopener,noreferrer");
  });

  // ⟳ Odśwież (naprawione: zawsze pokazuje loading + błąd w meta)
  btnRefreshResults?.addEventListener("click", async () => {
    if (!game || btnRefreshResults.disabled) return;

    try {
      setResultsMeta(t("polls.results.loading"));
      await previewResults();
      setMsg(t("polls.results.refreshed"));
    } catch (e) {
      console.warn("[polls] refresh results error:", e);
      setResultsMeta(t("polls.results.refreshFailed"));
      await alertModal({ text: `${t("polls.results.refreshFailed")}\n\n${e?.message || e}` });
    }
  });

  btnPollAction?.addEventListener("click", async () => {
    if (!game) return;
    const st = game.status || STATUS.DRAFT;

    // OPEN
    if (st === STATUS.DRAFT) {
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
        await refresh();
      } catch (e) {
        console.error("[polls] open error:", e);
        await alertModal({ text: `${t("polls.errors.open")}\n\n${e?.message || e}` });
      }
      return;
    }

    // CLOSE
    if (st === STATUS.POLL_OPEN) {
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

          await applyPollPointsUniqueFixedPoints();

          setMsg(t("polls.status.closedPoints"));
          await refresh();
        } catch (e) {
          console.error("[polls] close points error:", e);
          await alertModal({ text: `${t("polls.errors.close")}\n\n${e?.message || e}` });
        }
        return;
      }

      // poll_text: otwórz panel merge/delete
      try {
        textCloseModel = await buildTextClosePanel();
        setMsg(t("polls.textClose.editHint"));
      } catch (e) {
        console.error("[polls] build text close:", e);
        await alertModal({ text: `${t("polls.errors.loadAnswers")}\n\n${e?.message || e}` });
      }
      return;
    }

    // REOPEN
    if (st === STATUS.READY) {
      const chk = await validateCanReopen(game);
      if (!chk.ok) return setMsg(chk.reason);

      const ok = await confirmModal({
        title: t("polls.modals.reopen.title"),
        text: t("polls.modals.reopen.text"),
        okText: t("polls.modals.reopen.ok"),
        cancelText: t("polls.modals.reopen.cancel"),
      });
      if (!ok) return;

      try {
        const { error } = await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
        if (error) throw error;

        setMsg(t("polls.status.reopened"));
        await refresh();
      } catch (e) {
        console.error("[polls] reopen error:", e);
        await alertModal({ text: `${t("polls.errors.reopen")}\n\n${e?.message || e}` });
      }
      return;
    }
  });

  btnCancelTextClose?.addEventListener("click", () => {
    setTextCloseUi(false);
    setMsg(t("polls.textClose.cancelled"));
    void refresh();
  });

  btnFinishTextClose?.addEventListener("click", async () => {
    if (!game || game.type !== TYPES.POLL_TEXT) return;
    if (!textCloseModel) return;

    btnFinishTextClose.disabled = true;
    btnCancelTextClose.disabled = true;

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
          await alertModal({ text: t("polls.textClose.minAnswers", { ord: q.ord }) });
          return;
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
      resetPreviewDomCache();
      await refresh();
    } catch (e) {
      console.error("[polls] close text error:", e);
      await alertModal({ text: `${t("polls.errors.close")}\n\n${e?.message || e}` });
    } finally {
      btnFinishTextClose.disabled = false;
      btnCancelTextClose.disabled = false;
    }
  });

  await refresh();
});
