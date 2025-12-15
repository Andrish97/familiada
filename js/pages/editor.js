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

function setMsg(t) {
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 1200);
}

function clip17(s) {
  const t = String(s || "");
  return t.length <= 17 ? t : t.slice(0, 17);
}

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name")
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
  const { data, error } = await sb()
    .from("questions")
    .insert({ game_id: gameId, ord, text: "Nowe pytanie", mode: "fixed" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function updateQuestion(qid, patch) {
  const { error } = await sb().from("questions").update(patch).eq("id", qid);
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
    el.innerHTML = `
      <div class="qord">#${q.ord}</div>
      <div class="qprev"></div>
      <div class="qmode">${q.mode === "poll" ? "Sondaż" : "Podane wartości"}</div>
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

  // tryb
  btnModeFixed.classList.toggle("gold", activeQ.mode === "fixed");
  btnModePoll.classList.toggle("gold", activeQ.mode === "poll");
}

function renderAnswers() {
  aList.innerHTML = "";
  if (!activeQ) return;

  answers.forEach((a) => {
    const row = document.createElement("div");
    row.className = "arow";

    row.innerHTML = `
      <input class="aText" />
      <input class="aPts" type="number" min="0" max="999" />
      <button class="aDel" type="button" title="Usuń">✕</button>
    `;

    const aText = row.querySelector(".aText");
    const aPts = row.querySelector(".aPts");
    const aDel = row.querySelector(".aDel");

    aText.value = a.text || "";
    aPts.value = typeof a.fixed_points === "number" ? a.fixed_points : 0;

    aText.addEventListener("input", () => {
      const t = aText.value || "";
      if (t.length > 17) {
        aText.value = t.slice(0, 17);
        setMsg("Odpowiedź max 17 znaków.");
      }
    });

    aText.addEventListener("change", async () => {
      const t = clip17(aText.value).trim() || "ODPOWIEDŹ";
      aText.value = t;
      await updateAnswer(a.id, { text: t });
      a.text = t;
    });

    aPts.addEventListener("change", async () => {
      const n = Number(aPts.value);
      const pts = Number.isFinite(n) ? Math.max(0, Math.min(999, Math.floor(n))) : 0;
      aPts.value = String(pts);
      await updateAnswer(a.id, { fixed_points: pts });
      a.fixed_points = pts;
    });

    aDel.addEventListener("click", async () => {
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

async function loadActive() {
  questions = await loadQuestions();
  activeQ = questions.find((x) => x.id === activeQ.id) || null;

  answers = activeQ ? await loadAnswers(activeQ.id) : [];
  renderQuestions();
  renderEditorShell();
  renderAnswers();
}

async function refreshAll() {
  game = await loadGame();
  gameName.value = game.name || "Familiada";

  questions = await loadQuestions();
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
    game: { id: game.id, name: game.name },
    questions: [],
  };

  for (const q of questions) {
    const ans = await loadAnswers(q.id);
    payload.questions.push({
      ord: q.ord,
      text: q.text,
      mode: q.mode,
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
    const q = await insertQuestion();
    activeQ = q;
    await loadActive();
  });

  qText.addEventListener("change", async () => {
    if (!activeQ) return;
    const t = (qText.value || "").trim() || "Nowe pytanie";
    await updateQuestion(activeQ.id, { text: t });
    activeQ.text = t;
    renderQuestions();
  });

  btnModeFixed.addEventListener("click", async () => {
    if (!activeQ) return;
    await updateQuestion(activeQ.id, { mode: "fixed" });
    activeQ.mode = "fixed";
    renderQuestions();
    renderEditorShell();
  });

  btnModePoll.addEventListener("click", async () => {
    if (!activeQ) return;
    await updateQuestion(activeQ.id, { mode: "poll" });
    activeQ.mode = "poll";
    renderQuestions();
    renderEditorShell();
  });

  btnDelQ.addEventListener("click", async () => {
    if (!activeQ) return;

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
    await insertAnswer(activeQ.id);
    answers = await loadAnswers(activeQ.id);
    renderAnswers();
  });

  await refreshAll();
});
