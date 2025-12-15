// js/pages/editor.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Edytor Familiady jest dostępny tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");
const btnControl = document.getElementById("btnControl");

const gameName = document.getElementById("gameName");
const btnSaveName = document.getElementById("btnSaveName");
const btnExport = document.getElementById("btnExport");

const qList = document.getElementById("qList");
const rightPanel = document.querySelector(".rightPanel");
const qText = document.getElementById("qText");
const btnAddQ = document.getElementById("btnAddQ");
const btnDelQ = document.getElementById("btnDelQ");

// te przyciski zostają w HTML, ale tu je ignorujemy/ukrywamy
const btnModeFixed = document.getElementById("btnModeFixed");
const btnModePoll = document.getElementById("btnModePoll");

const btnAddA = document.getElementById("btnAddA");
const aList = document.getElementById("aList");

const msg = document.getElementById("msg");

let currentUser = null;
let game = null;
let questions = [];
let activeQ = null;
let answers = [];

let GAME_KIND = "fixed"; // 'fixed' | 'poll'
let GAME_STATUS = "draft";
let EDIT_LOCKED = false;

function setMsg(t) {
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 1400);
}

function clip17(s) {
  const t = String(s || "");
  return t.length <= 17 ? t : t.slice(0, 17);
}

function isPollGame() {
  return GAME_KIND === "poll";
}

function effectiveQuestionMode() {
  return isPollGame() ? "poll" : "fixed";
}

function isEditLocked() {
  // blokujemy edycję, jeśli sondaż otwarty
  return EDIT_LOCKED;
}

function applyLockUI() {
  const locked = isEditLocked();

  // Global disable
  btnAddQ.disabled = locked;
  btnDelQ.disabled = locked;
  btnAddA.disabled = locked;
  btnSaveName.disabled = locked;

  // inputy
  gameName.disabled = locked;
  qText.disabled = locked;

  // ukryj przełączniki mode (bo już nie istnieją w logice)
  if (btnModeFixed) btnModeFixed.style.display = "none";
  if (btnModePoll) btnModePoll.style.display = "none";

  // jeśli locked, pokaż komunikat
  if (locked) {
    setMsg("Sondaż jest otwarty — edycja zablokowana. Zamknij sondaż w zakładce Sondaże.");
  }
}

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function updateGameName(name) {
  const { error } = await sb().from("games").update({ name }).eq("id", gameId);
  if (error) throw error;
}

async function loadQuestions() {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function insertQuestion() {
  const ord = questions.length ? Math.max(...questions.map((q) => q.ord)) + 1 : 1;
  const mode = effectiveQuestionMode();

  const { data, error } = await sb()
    .from("questions")
    .insert({ game_id: gameId, ord, text: "Nowe pytanie", mode })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function updateQuestion(qid, patch) {
  // gwarancja: tryb zawsze zgodny z grą
  const safe = { ...patch, mode: effectiveQuestionMode() };
  const { error } = await sb().from("questions").update(safe).eq("id", qid);
  if (error) throw error;
}

async function deleteQuestion(qid) {
  const { error } = await sb().from("questions").delete().eq("id", qid);
  if (error) throw error;
}

async function loadAnswers(qid) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function insertAnswer(qid) {
  const ord = answers.length ? Math.max(...answers.map((a) => a.ord)) + 1 : 1;

  // w poll i tak nie używamy fixed_points, ale niech będzie 0
  const { data, error } = await sb()
    .from("answers")
    .insert({ question_id: qid, ord, text: "ODPOWIEDŹ", fixed_points: 0 })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function updateAnswer(aid, patch) {
  const { error } = await sb().from("answers").update(patch).eq("id", aid);
  if (error) throw error;
}

async function deleteAnswer(aid) {
  const { error } = await sb().from("answers").delete().eq("id", aid);
  if (error) throw error;
}

function renderQuestions() {
  qList.innerHTML = "";
  questions.forEach((q) => {
    const el = document.createElement("div");
    el.className = "qcard" + (activeQ?.id === q.id ? " active" : "");

    const modeLabel = isPollGame() ? "Sondaż" : "Wartości";
    el.innerHTML = `
      <div class="qord">#${q.ord}</div>
      <div class="qprev"></div>
      <div class="qmode">${modeLabel}</div>
    `;
    el.querySelector(".qprev").textContent = q.text;

    el.addEventListener("click", async () => {
      activeQ = q;
      await loadActive();
    });

    qList.appendChild(el);
  });
}

function renderEditorShell() {
  if (!activeQ) {
    rightPanel.classList.remove("hasQ");
    return;
  }
  rightPanel.classList.add("hasQ");

  qText.value = activeQ.text || "";

  // przełączniki mode są wyłączone/ukryte
  if (btnModeFixed) btnModeFixed.style.display = "none";
  if (btnModePoll) btnModePoll.style.display = "none";

  // lock
  qText.disabled = isEditLocked();
}

function renderAnswers() {
  aList.innerHTML = "";
  if (!activeQ) return;

  const locked = isEditLocked();
  const poll = isPollGame();

  answers.forEach((a) => {
    const row = document.createElement("div");
    row.className = "arow";

    // w poll ukrywamy punkty (albo robimy read-only placeholder)
    row.innerHTML = `
      <input class="aText" />
      <input class="aPts" type="number" min="0" max="999" />
      <button class="aDel" type="button" title="Usuń">✕</button>
    `;

    const aText = row.querySelector(".aText");
    const aPts = row.querySelector(".aPts");
    const aDel = row.querySelector(".aDel");

    aText.value = a.text || "";
    aText.disabled = locked;

    aPts.value = typeof a.fixed_points === "number" ? a.fixed_points : 0;

    if (poll) {
      // punkty nie mają sensu w sondażu — blokujemy i wizualnie wygaszamy
      aPts.disabled = true;
      aPts.value = "";
      aPts.placeholder = "SONDAŻ";
      aPts.style.opacity = ".45";
      aPts.style.cursor = "not-allowed";
    } else {
      aPts.disabled = locked;
    }

    aDel.disabled = locked;

    aText.addEventListener("input", () => {
      if (locked) return;
      const t = aText.value || "";
      if (t.length > 17) {
        aText.value = t.slice(0, 17);
        setMsg("Odpowiedź max 17 znaków.");
      }
    });

    aText.addEventListener("change", async () => {
      if (locked) return;
      const t = clip17(aText.value).trim() || "ODPOWIEDŹ";
      aText.value = t;
      await updateAnswer(a.id, { text: t });
      a.text = t;
    });

    aPts.addEventListener("change", async () => {
      if (locked || poll) return;
      const n = Number(aPts.value);
      const pts = Number.isFinite(n) ? Math.max(0, Math.min(999, Math.floor(n))) : 0;
      aPts.value = String(pts);
      await updateAnswer(a.id, { fixed_points: pts });
      a.fixed_points = pts;
    });

    aDel.addEventListener("click", async () => {
      if (locked) return;
      const ok = await confirmModal({
        title: "Usuń odpowiedź",
        text: "Na pewno usunąć tę odpowiedź?",
        okText: "Usuń",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      await deleteAnswer(a.id);
      answers = await loadAnswers(activeQ.id);
      renderAnswers();
    });

    aList.appendChild(row);
  });
}

async function normalizeQuestionModes() {
  // po wczytaniu gry: dopilnuj, że wszystkie pytania mają właściwy mode
  const mode = effectiveQuestionMode();
  const need = questions.filter(q => q.mode !== mode);
  if (!need.length) return;

  // jeśli edycja zablokowana, nie dotykamy
  if (isEditLocked()) return;

  for (const q of need) {
    try {
      await sb().from("questions").update({ mode }).eq("id", q.id);
    } catch (e) {
      console.warn("[editor] normalize mode failed:", e);
    }
  }
}

async function loadActive() {
  questions = await loadQuestions();
  await normalizeQuestionModes();

  activeQ = questions.find((x) => x.id === activeQ.id) || null;

  answers = activeQ ? await loadAnswers(activeQ.id) : [];
  renderQuestions();
  renderEditorShell();
  renderAnswers();
  applyLockUI();
}

async function refreshAll() {
  game = await loadGame();
  GAME_KIND = game.kind || "fixed";
  GAME_STATUS = game.status || "draft";
  EDIT_LOCKED = (GAME_KIND === "poll" && GAME_STATUS === "poll_open");

  gameName.value = game.name || "Familiada";

  questions = await loadQuestions();
  await normalizeQuestionModes();

  renderQuestions();

  if (activeQ) {
    activeQ = questions.find((x) => x.id === activeQ.id) || null;
  }
  renderEditorShell();

  if (activeQ) {
    answers = await loadAnswers(activeQ.id);
    renderAnswers();
  } else {
    answers = [];
    renderAnswers();
  }

  applyLockUI();
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportConfig() {
  const payload = {
    game: { id: game.id, name: game.name, kind: GAME_KIND, status: GAME_STATUS },
    questions: [],
  };

  for (const q of questions) {
    const ans = await loadAnswers(q.id);
    payload.questions.push({
      ord: q.ord,
      text: q.text,
      mode: effectiveQuestionMode(),
      answers: ans.map((a) => ({
        ord: a.ord,
        text: a.text,
        fixed_points: a.fixed_points,
      })),
    });
  }

  downloadJson(`familiada_${game.id}.json`, payload);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!gameId) {
    alert("Brak parametru id w URL (editor.html?id=...).");
    location.href = "builder.html";
    return;
  }

  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnBack.addEventListener("click", () => (location.href = "builder.html"));
  btnControl.addEventListener("click", () => (location.href = `control.html?id=${encodeURIComponent(gameId)}`));

  btnSaveName.addEventListener("click", async () => {
    if (isEditLocked()) return;
    const name = (gameName.value || "").trim() || "Familiada";
    await updateGameName(name);
    setMsg("Zapisano nazwę.");
    await refreshAll();
  });

  btnExport.addEventListener("click", async () => {
    try {
      await exportConfig();
      setMsg("Zapisano plik konfiguracji.");
    } catch (e) {
      console.error("[editor] export error:", e);
      alert("Nie udało się zapisać pliku. Sprawdź konsolę.");
    }
  });

  btnAddQ.addEventListener("click", async () => {
    if (isEditLocked()) return;
    const q = await insertQuestion();
    activeQ = q;
    await loadActive();
  });

  qText.addEventListener("change", async () => {
    if (!activeQ) return;
    if (isEditLocked()) return;
    const t = (qText.value || "").trim() || "Nowe pytanie";
    await updateQuestion(activeQ.id, { text: t });
    activeQ.text = t;
    renderQuestions();
  });

  // usunięte: zmiana mode (już nie istnieje w logice)
  if (btnModeFixed) btnModeFixed.style.display = "none";
  if (btnModePoll) btnModePoll.style.display = "none";

  btnDelQ.addEventListener("click", async () => {
    if (!activeQ) return;
    if (isEditLocked()) return;

    const ok = await confirmModal({
      title: "Usuń pytanie",
      text: "Usunąć pytanie i wszystkie odpowiedzi?",
      okText: "Usuń",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    await deleteQuestion(activeQ.id);
    activeQ = null;
    answers = [];
    await refreshAll();
  });

  btnAddA.addEventListener("click", async () => {
    if (!activeQ) return;
    if (isEditLocked()) return;
    await insertAnswer(activeQ.id);
    answers = await loadAnswers(activeQ.id);
    renderAnswers();
  });

  await refreshAll();
});
