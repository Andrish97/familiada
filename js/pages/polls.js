// js/pages/polls.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { confirmModal } from "../core/modal.js";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const $ = (id) => document.getElementById(id);

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBack");
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
const btnPreview = $("btnPreview");

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

let liveTimer = null;
let liveBusy = false;

let uiTextCloseOpen = false;

function setTextCloseUi(open) {
  uiTextCloseOpen = !!open;

  // panel łączenia
  if (textCloseCard) textCloseCard.style.display = open ? "" : "none";

  // ukryj przyciski główne gdy panel otwarty
  if (btnPollAction) btnPollAction.style.display = open ? "none" : "";
  if (btnPreview) btnPreview.style.display = open ? "none" : "";

  // dla porządku: podgląd wyników też schowaj, żeby nie mieszać ekranów
  if (open) {
    if (resultsCard) resultsCard.style.display = "none";
    hidePreview();
    stopLiveLoop();
  } else {
    if ((game?.status || STATUS.DRAFT) === STATUS.POLL_OPEN && isPreviewOpen()) startLiveLoop();
  }
}

function installTextCloseLeaveGuard() {
  // 1) twardy alert przeglądarki (reload/close)
  window.addEventListener("beforeunload", (e) => {
    if (!uiTextCloseOpen) return;
    e.preventDefault();
    e.returnValue = ""; // wymagane, żeby przeglądarka pokazała swój dialog
    return "";
  });

  // 2) Back/Forward w historii (miękkie – nie zawsze 100% pewne na mobile)
  window.addEventListener("popstate", async (e) => {
    if (!uiTextCloseOpen) return;

    // Zatrzymaj na miejscu i zapytaj
    history.pushState({ __stay: true }, "");

    const ok = await confirmModal({
      title: "Masz otwarte łączenie",
      text: "Jeśli wyjdziesz teraz, stracisz niezapisane zmiany. Wyjść mimo to?",
      okText: "Wyjdź",
      cancelText: "Zostań",
    });

    if (ok) {
      // zamknij UI (opcjonalnie), żeby stan był spójny
      setTextCloseUi(false);

      // spróbuj wrócić „wstecz” jeszcze raz (już bez blokady)
      // (na wszelki wypadek odłóż na tick)
      setTimeout(() => history.back(), 0);
    }
  });

  // 3) żeby popstate guard miał na czym „zatrzymać” (1 stan w historii)
  history.pushState({ __stay: true }, "");
}

function isPreviewOpen() {
  // jeśli podgląd jest widoczny
  return !!(resultsCard && resultsCard.style.display !== "none");
}

function startLiveLoop() {
  stopLiveLoop();

  // odświeżaj tylko gdy to ma sens (sondaż otwarty / podgląd widoczny)
  liveTimer = setInterval(async () => {
    if (!gameId) return;
    if (document.hidden) return;
    if (liveBusy) return;

    // jeśli sondaż nie jest otwarty i podgląd nie jest otwarty -> nie męcz DB
    const st = game?.status || STATUS.DRAFT;
    const should = (st === STATUS.POLL_OPEN) && isPreviewOpen() && !uiTextCloseOpen;

    if (!should) return;

    liveBusy = true;
    try {
      // 1) odśwież status gry i stan przycisków
      await refresh();
      if (!isPreviewOpen()) return; // user zamknął w międzyczasie
      await previewResults();
    } catch (e) {
      console.warn("[polls] live loop error:", e);
    } finally {
      liveBusy = false;
    }
  }, 5000); // 2s: sensowny kompromis
}

function stopLiveLoop() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = null;
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

function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 2400);
}

function typePL(type) {
  if (type === TYPES.POLL_TEXT) return "TYPOWY SONDAŻ";
  if (type === TYPES.POLL_POINTS) return "PUNKTACJA";
  if (type === TYPES.PREPARED) return "PREPAROWANY";
  return String(type || "—").toUpperCase();
}

function statusPL(st) {
  const s = st || STATUS.DRAFT;
  if (s === STATUS.DRAFT) return "SZKIC";
  if (s === STATUS.POLL_OPEN) return "OTWARTY";
  if (s === STATUS.READY) return "ZAMKNIĘTY";
  return String(s).toUpperCase();
}

function pollLink(g) {
  const base =
    g.type === TYPES.POLL_TEXT
      ? new URL("poll-text.html", location.href)
      : new URL("poll-points.html", location.href);

  base.searchParams.set("id", g.id);
  base.searchParams.set("key", g.share_key_poll);
  return base.toString();
}

function setChips(g) {
  if (chipType) chipType.textContent = typePL(g.type);

  if (chipStatus) {
    chipStatus.className = "chip status";
    const st = g.status || STATUS.DRAFT;
    chipStatus.textContent = statusPL(st);

    if (st === STATUS.READY) chipStatus.classList.add("ok");
    else if (st === STATUS.POLL_OPEN) chipStatus.classList.add("warn");
    else chipStatus.classList.add("bad");
  }
}

function clearQr() {
  if (qrBox) qrBox.innerHTML = "";
}

async function renderSmallQr(link) {
  if (!qrBox) return;
  qrBox.innerHTML = "";
  if (!link) return;

  try {
    const wrap = document.createElement("div");
    wrap.className = "qrFrameSmall";
    
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, link, { width: 260, margin: 1 });
    
    wrap.appendChild(canvas);
    qrBox.appendChild(wrap);
  } catch (e) {
    console.error("[polls] QR error:", e);
    qrBox.textContent = "QR nie działa.";
  }
}

function setLinkUiVisible(on) {
  btnCopy && (btnCopy.disabled = !on);
  btnOpen && (btnOpen.disabled = !on);
  btnOpenQr && (btnOpenQr.disabled = !on);
  if (!on) clearQr();
}

function setActionButton(label, disabled, hint) {
  if (btnPollAction) {
    btnPollAction.textContent = label;
    btnPollAction.disabled = !!disabled;
  }
  if (hintTop) hintTop.textContent = hint || "";
}

function hidePreview() {
  if (resultsCard) resultsCard.style.display = "none";
  if (resultsMeta) resultsMeta.textContent = "";
  if (resultsList) {
    resultsList.innerHTML = "";
    resultsList.style.display = "none"; // <- zabija inline display:grid
  }
}

function showPreview() {
  if (resultsCard) resultsCard.style.display = "";
  if (resultsList) resultsList.style.display = "grid"; // albo "" jeśli przeniesiesz do CSS
}

function updatePreviewButtonState() {
  if (!btnPreview || !game) return;

  const st = game.status || STATUS.DRAFT;
  const isPollType = game.type === TYPES.POLL_TEXT || game.type === TYPES.POLL_POINTS;
  const okStatus = st === STATUS.POLL_OPEN || st === STATUS.READY;

  btnPreview.disabled = !(isPollType && okStatus);
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

async function countQuestions() {
  const { count, error } = await sb()
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  if (error) throw error;
  return count || 0;
}

async function listQuestionsBasic() {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listAnswersFinalForQuestion(qid) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

function enforceDistinctTo100TopN(rows, { topN = 6, minPoint = 3 } = {}) {
  // rows: [{id, ord, fixed_points}]
  const arr = (rows || []).map((r) => ({
    id: r.id,
    ord: Number(r.ord) || 0,
    points: Math.max(0, Number(r.fixed_points) || 0),
  }));

  // kandydaci do TOP: tylko te z punktami > 0 (reszta i tak 0)
  let top = arr.filter((x) => x.points > 0);
  if (!top.length) return { updates: [], zeros: arr.map((x) => x.id) };

  // sort: najpierw punkty malejąco, potem ord rosnąco (deterministycznie)
  top.sort((a, b) => (b.points - a.points) || (a.ord - b.ord));

  // TOP N
  top = top.slice(0, Math.min(topN, top.length));

  // 1) wymuś ściśle malejące (min 1 różnicy), dół minPoint
  for (let i = 1; i < top.length; i++) {
    let p = top[i].points;
    if (p >= top[i - 1].points) p = top[i - 1].points - 1;
    if (p < minPoint) p = minPoint;
    top[i].points = p;
  }

  // 2) dopasuj sumę do 100 (korekta na TOP), pilnując malejącości
  let sum = top.reduce((s, x) => s + x.points, 0);
  let diff = 100 - sum;

  if (diff > 0) {
    top[0].points += diff;
  } else if (diff < 0) {
    diff = -diff;
    let i = 0;
    while (diff > 0 && i < top.length) {
      const next = i + 1 < top.length ? top[i + 1].points : minPoint;
      const minAllowed = i + 1 < top.length ? next + 1 : minPoint;
      const canTake = Math.max(0, top[i].points - minAllowed);
      if (canTake > 0) {
        const take = Math.min(canTake, diff);
        top[i].points -= take;
        diff -= take;
      } else {
        i++;
      }
    }
  }

  // 3) sanity: jeszcze raz dopnij malejącość
  for (let i = 1; i < top.length; i++) {
    if (top[i].points >= top[i - 1].points) {
      top[i].points = Math.max(minPoint, top[i - 1].points - 1);
    }
  }

  // final: updates dla TOP; reszta => 0
  const topIds = new Set(top.map((x) => x.id));
  const updates = top.map((x) => ({ id: x.id, fixed_points: x.points }));
  const zeros = arr.filter((x) => !topIds.has(x.id)).map((x) => x.id);

  return { updates, zeros };
}

async function applyPollPointsUniqueFixedPoints() {
  const qsList = await listQuestionsBasic();

  // UWAGA: tu robimy wiele UPDATE — lepiej sekwencyjnie (bez zalewania API)
  for (const q of qsList) {
    const ans = await listAnswersFinalForQuestion(q.id);

    const { updates, zeros } = enforceDistinctTo100TopN(ans, { topN: 6, minPoint: 3 });

    // najpierw ustaw TOP z unikatowymi punktami
    for (const u of updates) {
      const { error } = await sb().from("answers").update({ fixed_points: u.fixed_points }).eq("id", u.id);
      if (error) throw error;
    }

    // potem reszta na 0
    for (const id of zeros) {
      const { error } = await sb().from("answers").update({ fixed_points: 0 }).eq("id", id);
      if (error) throw error;
    }
  }
}

async function countAnswersForQuestion(qid) {
  const { count, error } = await sb()
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("question_id", qid);
  if (error) throw error;
  return count || 0;
}

async function getLastSessionIdForQuestion(questionId) {
  const { data, error } = await sb()
    .from("poll_sessions")
    .select("id,created_at")
    .eq("game_id", gameId)
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

/* =======================
   Walidacje przycisku
======================= */

async function validateCanOpen(g) {
  if (g.status !== STATUS.DRAFT) return { ok: false, reason: "Sondaż można uruchomić tylko ze stanu SZKIC." };
  if (g.type === TYPES.PREPARED) return { ok: false, reason: "Gra preparowana nie ma sondażu." };

  const qn = await countQuestions();
  if (qn < RULES.QN_MIN) {
    return { ok: false, reason: `Żeby uruchomić: liczba pytań musi być ≥ ${RULES.QN_MIN} (masz ${qn}).` };
  }

  if (g.type === TYPES.POLL_POINTS) {
    const qsList = await listQuestionsBasic();
    for (const q of qsList) {
      const an = await countAnswersForQuestion(q.id);
      if (an < RULES.AN_MIN || an > RULES.AN_MAX) {
        return {
          ok: false,
          reason: `W trybie PUNKTACJA każde pytanie musi mieć ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi.`,
        };
      }
    }
  }

  return { ok: true, reason: "" };
}

async function validateCanReopen(g) {
  if (g.status !== STATUS.READY) return { ok: false, reason: "Ponowne uruchomienie możliwe tylko gdy sondaż jest ZAMKNIĘTY." };
  return await validateCanOpen({ ...g, status: STATUS.DRAFT });
}

async function validateCanClose(g) {
  if (g.status !== STATUS.POLL_OPEN) return { ok: false, reason: "Sondaż można zamknąć tylko gdy jest OTWARTY." };

  const qsList = await listQuestionsBasic();

  if (g.type === TYPES.POLL_POINTS) {
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);
      if (!sid) return { ok: false, reason: "Brak aktywnej sesji głosowania." };

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
        return {
          ok: false,
          reason: "Aby zamknąć: w każdym pytaniu co najmniej 3 odpowiedzi muszą mieć ≥ 3 punkty po przeliczeniu.",
        };
      }
    }
    return { ok: true, reason: "" };
  }

  if (g.type === TYPES.POLL_TEXT) {
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);
      if (!sid) return { ok: false, reason: "Brak aktywnej sesji." };

      const { data, error } = await sb()
        .from("poll_text_entries")
        .select("answer_norm")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);
      if (error) throw error;

      const uniq = new Set((data || []).map((x) => (x.answer_norm || "").trim()).filter(Boolean));
      if (uniq.size < 3) {
        return { ok: false, reason: "Aby zamknąć: w każdym pytaniu muszą być ≥ 3 różne odpowiedzi." };
      }
    }
    return { ok: true, reason: "" };
  }

  return { ok: false, reason: "Nieznany typ gry." };
}

/* =======================
   Podgląd wyników
======================= */

async function previewResults() {
  showPreview();
  if (!resultsList || !resultsMeta || !resultsCard) return;

  resultsList.style.display = "grid";
  if (!game) return;

  resultsCard.style.display = "";
  resultsList.innerHTML = "";
  resultsMeta.textContent = "Ładuję…";

  const st = game.status || STATUS.DRAFT;
  const qsList = await listQuestionsBasic();

  // ==========================
  // FINAL (po zamknięciu)
  // ==========================
  if (st === STATUS.READY) {
    if (game.type === TYPES.POLL_POINTS) {
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

      resultsMeta.textContent = "Wynik:.";
      return;
    }

    if (game.type === TYPES.POLL_TEXT) {
      for (const q of qsList) {
        const ans = await listAnswersFinalForQuestion(q.id);

        // tylko te, które realnie istnieją po zamknięciu (czyli w answers)
        const box = document.createElement("div");
        box.className = "resultQ";
        box.innerHTML = `<div class="qTitle">P${q.ord}: ${q.text}</div>`;

        for (const a of (ans || []).filter((x) => Number(x.fixed_points) > 0)) {
          const row = document.createElement("div");
          row.className = "aRow";
          row.innerHTML = `<div class="aTxt"></div><div class="aVal"></div>`;
          row.querySelector(".aTxt").textContent = a.text;
          row.querySelector(".aVal").textContent = String(Number(a.fixed_points) || 0);
          box.appendChild(row);
        }

        resultsList.appendChild(box);
      }

      resultsMeta.textContent = "Wynik:";
      return;
    }
  }

  // ==========================
  // LIVE (przed zamknięciem)
  // ==========================
  if (game.type === TYPES.POLL_POINTS) {
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);

      const { data: ans, error: aErr } = await sb()
        .from("answers")
        .select("id,ord,text")
        .eq("question_id", q.id)
        .order("ord", { ascending: true });
      if (aErr) throw aErr;

      const counts = new Map();
      (ans || []).forEach((a) => counts.set(a.id, 0));

      if (sid) {
        const { data: votes, error: vErr } = await sb()
          .from("poll_votes")
          .select("answer_id")
          .eq("poll_session_id", sid)
          .eq("question_id", q.id);
        if (vErr) throw vErr;

        for (const v of votes || []) {
          if (!v.answer_id) continue;
          counts.set(v.answer_id, (counts.get(v.answer_id) || 0) + 1);
        }
      }

      const box = document.createElement("div");
      box.className = "resultQ";
      box.innerHTML = `<div class="qTitle">P${q.ord}: ${q.text}</div>`;

      for (const a of ans || []) {
        const row = document.createElement("div");
        row.className = "aRow";
        row.innerHTML = `<div class="aTxt"></div><div class="aVal"></div>`;
        row.querySelector(".aTxt").textContent = a.text;
        row.querySelector(".aVal").textContent = String(counts.get(a.id) || 0);
        box.appendChild(row);
      }

      resultsList.appendChild(box);
    }

    resultsMeta.textContent = "Podgląd na żywo:";
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

  resultsMeta.textContent = "Podgląd na żywo:";
}

/* =======================
   poll_text: panel merge/delete + finalizacja
======================= */

function clip17Final(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > 17 ? t.slice(0, 17) : t;
}

// bazowy przelicznik: count -> punkty do 100 (bez limitu 6 odp.)
function normalizeCountsTo100(items) {
  const cleaned = (items || [])
    .map((x) => ({
      ...x,
      count: Math.max(0, Number(x.count) || 0),
    }))
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

// klasyczny sondaż: normalizacja + odrzucenie <3 + max 6 + UNIKALNE PUNKTY
function normalizeTo100Int(items) {
  const normalized = normalizeCountsTo100(items);
  if (!normalized.length) return [];

  let filtered = normalized.filter((x) => x.points >= 3);
  filtered.sort((a, b) => b.points - a.points);

  if (filtered.length > 6) filtered = filtered.slice(0, 6);

  // Zwracamy {text, points}
  const base = filtered.map((x) => ({ text: x.text, points: x.points }));

  // NOWE: wymuś unikalność punktów + suma=100
  const distinct = forceDistinctPointsTo100(base);

  // (opcjonalnie) jeszcze raz sort malejąco (dla pewności UI)
  distinct.sort((a, b) => b.points - a.points);

  return distinct;
}

// Wymusza punkty łącznie = 100, unikalne i ściśle malejące (różnica min 1).
// Działa na elementach { text, points }, zakłada sortowanie malejąco wg points.
function forceDistinctPointsTo100(items) {
  const arr = (items || []).map((x) => ({
    text: x.text,
    points: Math.max(0, Number(x.points) || 0),
  }));

  if (!arr.length) return [];

  // 1) sort: malejąco po punktach (dla stabilności)
  arr.sort((a, b) => b.points - a.points);

  // 2) wymuszenie ściśle malejące (min 1 różnicy), z dołem min 3
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1].points;
    let p = arr[i].points;

    // jeśli remis lub rośnie -> zetnij do prev-1
    if (p >= prev) p = prev - 1;

    // minimalny próg (w Twojej logice i tak filtrujesz >=3)
    if (p < 3) p = 3;

    arr[i].points = p;
  }

  // 3) dopasuj sumę do 100 (dodaj/odejmij od TOP, zachowując malejącość)
  let sum = arr.reduce((s, x) => s + x.points, 0);
  let diff = 100 - sum;

  if (diff > 0) {
    // dodaj brakujące punkty na TOP
    arr[0].points += diff;
  } else if (diff < 0) {
    // odejmij nadmiar z góry, ale nie wolno spaść do <= drugiego + 0
    diff = -diff;
    let i = 0;

    // próbuj odejmować najpierw z TOP, potem z kolejnych, ale pilnuj:
    // arr[i].points >= arr[i+1].points + 1 (dla i < last)
    while (diff > 0 && i < arr.length) {
      const next = i + 1 < arr.length ? arr[i + 1].points : 3;
      const minAllowed = i + 1 < arr.length ? next + 1 : 3;
      const canTake = Math.max(0, arr[i].points - minAllowed);

      if (canTake > 0) {
        const take = Math.min(canTake, diff);
        arr[i].points -= take;
        diff -= take;
      } else {
        i++;
      }
    }
  }

  // 4) ostatnia sanity: wymuś jeszcze raz malejącość (po korekcie sumy)
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].points >= arr[i - 1].points) {
      arr[i].points = Math.max(3, arr[i - 1].points - 1);
    }
  }

  return arr;
}

function normKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function mergeDuplicatesInPlace(items) {
  // scala po normKey(text), sumuje count, zachowuje "najładniejszy" tekst (pierwszy napotkany)
  const map = new Map(); // key -> { text, count }
  for (const it of items || []) {
    const key = normKey(it.text);
    const cnt = Math.max(0, Number(it.count) || 0);
    if (!key || cnt <= 0) continue;

    if (!map.has(key)) {
      map.set(key, { text: String(it.text ?? "").trim(), count: cnt });
    } else {
      map.get(key).count += cnt;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

async function buildTextClosePanel() {
  setTextCloseUi(true);
  textCloseList.innerHTML = "";
  textCloseMeta.textContent = "Ładuję odpowiedzi z ostatniej sesji…";

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

  textCloseMeta.textContent =
    "Przeciągnij odpowiedź na inną, aby je połączyć (sumuje ilość). Możesz usuwać. Na końcu bierzemy TOP 6 i normalizujemy do 100.";

  for (const q of model) {
    const box = document.createElement("div");
    box.className = "tcQ";
    box.innerHTML = `
      <div class="head">
        <div>
          <div class="qTitle">P${q.ord}: ${q.text}</div>
          <div class="qHint">Przeciągnij, żeby połączyć • edytuj literówki • final max 17 znaków</div>
        </div>
        <div class="tcTools">
          <button class="btn sm tcMergeDup" type="button" title="Scal identyczne">Scal identyczne</button>
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
          <button class="tcDel" type="button" title="Usuń">✕</button>
        `;
        
        const inp = row.querySelector(".tcTxtInp");
        inp.value = it.text;
        
        // edycja literówek -> od razu w modelu
        inp.addEventListener("input", () => {
          it.text = inp.value; // zapis w modelu
        });

        inp.addEventListener("blur", () => {
          // po edycji tekstu: znormalizuj model przez scalenie duplikatów
          q.items = mergeDuplicatesInPlace(q.items);
          rerender();
        });
        
        // żeby edycja nie “łapała” drag & drop
        inp.addEventListener("mousedown", (e) => e.stopPropagation());
        inp.addEventListener("pointerdown", (e) => e.stopPropagation());
        inp.addEventListener("dragstart", (e) => e.preventDefault());
        
        row.querySelector(".tcCnt").textContent = String(it.count);

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

          const from = q.items[fromIdx];
          const to = q.items[toIdx];
          if (!from || !to) return;

          to.count += from.count;
          q.items.splice(fromIdx, 1);
          rerender();
        });

        list.appendChild(row);
      }
    };

    rerender();
    textCloseList.appendChild(box);
  }

  return model;
}

/* =======================
   Refresh UI
======================= */

async function refresh() {
  if (!gameId) {
    cardMain && (cardMain.style.display = "none");
    cardEmpty && (cardEmpty.style.display = "");
    setMsg("Brak parametru id.");
    return;
  }

  game = await loadGame();

  cardEmpty && (cardEmpty.style.display = "none");
  cardMain && (cardMain.style.display = "");

  setChips(game);

  if (gName) gName.textContent = game.name || "Sondaż";

  if (gMeta) {
    if (game.type === TYPES.POLL_TEXT) {
      gMeta.textContent = `Tryb: typowy sondaż (tekst). Start: ≥ ${RULES.QN_MIN} pytań. Zamknięcie: w każdym pytaniu ≥ 3 różne odpowiedzi.`;
    } else if (game.type === TYPES.POLL_POINTS) {
      gMeta.textContent = `Tryb: punktacja. Start: ≥ ${RULES.QN_MIN} pytań i każde pytanie ma ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi. Zamknięcie: w każdym pytaniu co najmniej 3 odpowiedzi muszą mieć ≥ 3 pkt po przeliczeniu do 100.`;
    } else {
      gMeta.textContent = "Gra preparowana nie ma sondażu.";
    }
  }

  if (pollLinkEl) pollLinkEl.value = "";
  setLinkUiVisible(false);
  clearQr();

  // NIE niszcz podglądu jeśli użytkownik go ma otwartego
  const wasPreviewOpen = isPreviewOpen();
  
  // Ukryj panele tylko jeśli NIE oglądamy podglądu i NIE jesteśmy w łączeniu
  if (!uiTextCloseOpen) {
    textCloseCard && (textCloseCard.style.display = "none");
  }
  
  if (!wasPreviewOpen && !uiTextCloseOpen) {
    // tylko wtedy wolno czyścić podgląd
    resultsCard && (resultsCard.style.display = "none");
    hidePreview();
  }

  const st = game.status || STATUS.DRAFT;

  if (st === STATUS.POLL_OPEN) {
    const link = pollLink(game);
    if (pollLinkEl) pollLinkEl.value = link;
    setLinkUiVisible(true);
    await renderSmallQr(link);
  }

  updatePreviewButtonState();

  if (game.type === TYPES.PREPARED) {
    setActionButton("Brak sondażu", true, "Gra preparowana nie ma sondażu.");
    return;
  }

  if (st === STATUS.DRAFT) {
    const chk = await validateCanOpen(game);
    setActionButton("Uruchomić sondaż", !chk.ok, chk.ok ? "Gotowe do uruchomienia." : chk.reason);
    return;
  }

  if (st === STATUS.POLL_OPEN) {
    const chk = await validateCanClose(game);
    setActionButton("Zamknąć sondaż", !chk.ok, chk.ok ? "Możesz zamknąć sondaż." : chk.reason);
    return;
  }

  if (st === STATUS.READY) {
    const chk = await validateCanReopen(game);
    setActionButton(
      "Uruchomić ponownie",
      !chk.ok,
      chk.ok ? "Otworzy nową sesję i usunie poprzednie dane sondażowe." : chk.reason
    );
    return;
  }

  setActionButton("—", true, "Nieznany status.");
}

/* =======================
   Init
======================= */

document.addEventListener("DOMContentLoaded", async () => {
  const u = await requireAuth("index.html");
  if (who) who.textContent = u?.email || "—";


  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLiveLoop();
    else {
      if ((game?.status || STATUS.DRAFT) === STATUS.POLL_OPEN && isPreviewOpen() && !uiTextCloseOpen) startLiveLoop();
    }
  });
  
  window.addEventListener("focus", () => {
    if ((game?.status || STATUS.DRAFT) === STATUS.POLL_OPEN && isPreviewOpen() && !uiTextCloseOpen) startLiveLoop();
  });
  
  window.addEventListener("blur", stopLiveLoop);
  

  btnBack?.addEventListener("click", async () => {
    if (uiTextCloseOpen) {
      const ok = await confirmModal({
        title: "Masz otwarte sprawdzanie odpowiedzi",
        text: "Wyjście spowoduje utratę niezapisanych zmian. Wyjść?",
        okText: "Wyjdź",
        cancelText: "Zostań",
      });
      if (!ok) return;
      setTextCloseUi(false);
    }
    location.href = "builder.html";
  });
  
  btnLogout?.addEventListener("click", async () => {
    if (uiTextCloseOpen) {
      const ok = await confirmModal({
        title: "Masz otwarte sprawdzanie odpowiedzi",
        text: "Wylogowanie spowoduje utratę niezapisanych zmian. Wylogować?",
        okText: "Wyloguj",
        cancelText: "Zostań",
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
      setMsg("Skopiowano link sondażu.");
    } catch {
      setMsg("Nie udało się skopiować.");
    }
  });

  btnOpen?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  btnOpenQr?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    const u = new URL("poll-qr.html", location.href);
    u.searchParams.set("url", pollLinkEl.value);
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  });

  btnPreview?.addEventListener("click", async () => {
    if (!game || btnPreview.disabled) return;
  
    const open = isPreviewOpen();
    if (open) {
      hidePreview();
      stopLiveLoop(); // <- ważne
      return;
    }
  
    showPreview();
    await previewResults();
  
    // live tylko gdy status OTWARTY
    if ((game?.status || STATUS.DRAFT) === STATUS.POLL_OPEN && !uiTextCloseOpen) {
      startLiveLoop();
    } else {
      stopLiveLoop();
    }
  });

  btnPollAction?.addEventListener("click", async () => {
    if (!game) return;
    const st = game.status || STATUS.DRAFT;

    // START
    if (st === STATUS.DRAFT) {
      const chk = await validateCanOpen(game);
      if (!chk.ok) return setMsg(chk.reason);

      const ok = await confirmModal({
        title: "Uruchomić sondaż?",
        text: `Uruchomić sondaż dla "${game.name}"?`,
        okText: "Uruchom",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      try {
        const { error } = await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
        if (error) throw error;

        setMsg("Sondaż uruchomiony.");
        await refresh();
      } catch (e) {
        console.error("[polls] open error:", e);
        alert(`Nie udało się uruchomić sondażu.\n\n${e?.message || e}`);
      }
      return;
    }

    // CLOSE
    if (st === STATUS.POLL_OPEN) {
      const chk = await validateCanClose(game);
      if (!chk.ok) return setMsg(chk.reason);

      if (game.type === TYPES.POLL_POINTS) {
        const ok = await confirmModal({
          title: "Zakończyć sondaż?",
          text: "Zamknąć sondaż i przeliczyć punkty do 100?",
          okText: "Zakończ",
          cancelText: "Anuluj",
        });
        if (!ok) return;

        try {
          const { error } = await sb().rpc("poll_points_close_and_normalize", {
            p_game_id: gameId,
            p_key: game.share_key_poll,
          });
          if (error) throw error;
        
          // NOWE: po RPC wymuś unikatowe punkty w TOP 6 i wyzeruj resztę
          await applyPollPointsUniqueFixedPoints();
        
          setMsg("Sondaż zamknięty. Gra gotowa (unikatowe punkty).");
          await refresh();
        } catch (e) {
          console.error("[polls] close points error:", e);
          alert(`Nie udało się zamknąć sondażu.\n\n${e?.message || e}`);
        }
        return;
      }

      // poll_text: panel merge/delete, a final w RPC poll_text_close_apply
      try {
        textCloseModel = await buildTextClosePanel();
        setMsg("Edytuj odpowiedzi, a potem kliknij „Zamknij i przelicz”.");
      } catch (e) {
        console.error("[polls] build text close:", e);
        alert(`Nie udało się wczytać odpowiedzi.\n\n${e?.message || e}`);
      }
      return;
    }

    // REOPEN
    if (st === STATUS.READY) {
      const chk = await validateCanReopen(game);
      if (!chk.ok) return setMsg(chk.reason);

      const ok = await confirmModal({
        title: "Uruchomić ponownie?",
        text: "Otworzyć sondaż ponownie? Poprzednie dane zostaną usunięte.",
        okText: "Otwórz ponownie",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      try {
        const { error } = await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
        if (error) throw error;

        setMsg("Sondaż uruchomiony ponownie.");
        await refresh();
      } catch (e) {
        console.error("[polls] reopen error:", e);
        alert(`Nie udało się otworzyć ponownie.\n\n${e?.message || e}`);
      }
      return;
    }
  });

  btnCancelTextClose?.addEventListener("click", () => {
    setTextCloseUi(false);
    setMsg("Anulowano zamykanie (sondaż dalej otwarty).");
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
          alert(`Pytanie ${q.ord}: po edycji zostało mniej niż 3 odpowiedzi. Dodaj/połącz inaczej.`);
          return;
        }

        payloadItems.push({ question_id: q.question_id, answers: final });
      }

      const ok = await confirmModal({
        title: "Zamknąć sondaż?",
        text: "Zamknąć sondaż, wybrać TOP 6 i zapisać punkty do 100 dla każdego pytania?",
        okText: "Zamknij",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      const { error } = await sb().rpc("poll_text_close_apply", {
        p_game_id: gameId,
        p_key: game.share_key_poll,
        p_payload: { items: payloadItems },
      });
      if (error) throw error;

      setMsg("Sondaż zamknięty. Gra gotowa.");
      setTextCloseUi(false);

      await refresh();
      // po zamknięciu: live tylko jeśli user ma otwarty preview i status OPEN (tu już raczej READY, więc i tak stop)
      stopLiveLoop();
    } catch (e) {
      console.error("[polls] close text error:", e);
      alert(`Nie udało się zamknąć sondażu.\n\n${e?.message || e}`);
    } finally {
      btnFinishTextClose.disabled = false;
      btnCancelTextClose.disabled = false;
    }
  });

  await refresh();
  installTextCloseLeaveGuard();
  stopLiveLoop();
});
