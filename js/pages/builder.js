// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth } from "../core/auth.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("game");

const $ = (s) => document.querySelector(s);

const ui = {
  back: $(".b-back"),
  control: $(".b-control"),

  gameName: $(".b-game-name"),
  saveName: $(".b-save-name"),

  qList: $(".b-q-list"),
  addQ: $(".b-add-q"),

  panel: $(".b-rightpanel"),
  qText: $(".b-q-text"),
  modeFixed: $(".b-mode-fixed"),
  modePoll: $(".b-mode-poll"),
  delQ: $(".b-del-q"),

  addA: $(".b-add-a"),
  aList: $(".b-a-list"),

  err: $(".b-error"),
};

let client = null;
let gameRow = null;
let questions = [];
let activeQ = null;
let answers = [];

function setError(msg) {
  ui.err.textContent = msg || "";
}

function clip17(s) {
  const t = (s || "").trim();
  if (t.length <= 17) return t;
  return t.slice(0, 17);
}

async function loadGame() {
  const { data, error } = await client
    .from("games")
    .select("id,name,created_at")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function updateGameName(name) {
  const { error } = await client.from("games").update({ name }).eq("id", gameId);
  if (error) throw error;
}

async function loadQuestions() {
  const { data, error } = await client
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function insertQuestion() {
  const ord = questions.length ? Math.max(...questions.map((q) => q.ord)) + 1 : 1;
  const { data, error } = await client
    .from("questions")
    .insert({ game_id: gameId, ord, text: "Nowe pytanie", mode: "fixed" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function updateQuestion(qid, patch) {
  const { error } = await client.from("questions").update(patch).eq("id", qid);
  if (error) throw error;
}

async function deleteQuestion(qid) {
  const { error } = await client.from("questions").delete().eq("id", qid);
  if (error) throw error;
}

async function loadAnswers(qid) {
  const { data, error } = await client
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function insertAnswer(qid) {
  const ord = answers.length ? Math.max(...answers.map((a) => a.ord)) + 1 : 1;
  const { data, error } = await client
    .from("answers")
    .insert({ question_id: qid, ord, text: "ODPOWIEDŹ", fixed_points: 0 })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function updateAnswer(aid, patch) {
  const { error } = await client.from("answers").update(patch).eq("id", aid);
  if (error) throw error;
}

async function deleteAnswer(aid) {
  const { error } = await client.from("answers").delete().eq("id", aid);
  if (error) throw error;
}

function renderQuestions() {
  ui.qList.innerHTML = "";
  questions.forEach((q) => {
    const item = document.createElement("div");
    item.className = "b-q-item";
    if (activeQ && activeQ.id === q.id) item.classList.add("active");

    item.innerHTML = `
      <div class="b-q-ord">#${q.ord}</div>
      <div class="b-q-preview"></div>
      <div class="b-q-mode">${q.mode === "poll" ? "Sondaż" : "Podane wartości"}</div>
    `;
    item.querySelector(".b-q-preview").textContent = q.text;

    item.addEventListener("click", async () => {
      setError("");
      activeQ = q;
      await loadActive();
    });

    ui.qList.appendChild(item);
  });
}

function renderEditor() {
  if (!activeQ) {
    ui.panel.classList.remove("has-q");
    return;
  }

  ui.panel.classList.add("has-q");
  ui.qText.value = activeQ.text || "";

  // tryb
  ui.modeFixed.classList.toggle("btn-secondary", activeQ.mode === "fixed");
  ui.modePoll.classList.toggle("btn-secondary", activeQ.mode === "poll");
}

function renderAnswers() {
  ui.aList.innerHTML = "";
  if (!activeQ) return;

  answers.forEach((a) => {
    const row = document.createElement("div");
    row.className = "b-a-item";

    row.innerHTML = `
      <input class="b-a-text" />
      <input class="b-a-pts" type="number" min="0" max="999" />
      <button class="b-a-del" type="button" title="Usuń">✕</button>
    `;

    const inpText = row.querySelector(".b-a-text");
    const inpPts = row.querySelector(".b-a-pts");
    const btnDel = row.querySelector(".b-a-del");

    inpText.value = a.text || "";
    inpPts.value = (typeof a.fixed_points === "number" ? a.fixed_points : 0);

    inpText.addEventListener("input", () => {
      const t = inpText.value || "";
      if (t.length > 17) {
        inpText.value = t.slice(0, 17);
        setError("Odpowiedź max 17 znaków.");
        setTimeout(() => setError(""), 900);
      }
    });

    inpText.addEventListener("change", async () => {
      const t = clip17(inpText.value);
      inpText.value = t;
      await updateAnswer(a.id, { text: t });
      // odśwież w pamięci
      a.text = t;
    });

    inpPts.addEventListener("change", async () => {
      const n = Number(inpPts.value);
      const pts = Number.isFinite(n) ? Math.max(0, Math.min(999, Math.floor(n))) : 0;
      inpPts.value = String(pts);
      await updateAnswer(a.id, { fixed_points: pts });
      a.fixed_points = pts;
    });

    btnDel.addEventListener("click", async () => {
      const ok = confirm("Usunąć odpowiedź?");
      if (!ok) return;
      await deleteAnswer(a.id);
      answers = await loadAnswers(activeQ.id);
      renderAnswers();
    });

    ui.aList.appendChild(row);
  });
}

async function loadActive() {
  if (!activeQ) return;

  // fresh questions (żeby mode/text były aktualne)
  questions = await loadQuestions();
  activeQ = questions.find((x) => x.id === activeQ.id) || null;

  answers = activeQ ? await loadAnswers(activeQ.id) : [];
  renderQuestions();
  renderEditor();
  renderAnswers();
}

async function main() {
  if (!gameId) {
    setError("Brak parametru ?game=...");
    return;
  }

  await requireAuth("index.html");
  client = sb();

  ui.back.addEventListener("click", () => (location.href = "games.html"));
  ui.control.addEventListener("click", () => (location.href = `control.html?game=${encodeURIComponent(gameId)}`));

  gameRow = await loadGame();
  ui.gameName.value = gameRow.name || "Familiada";

  ui.saveName.addEventListener("click", async () => {
    try {
      setError("");
      const name = (ui.gameName.value || "").trim() || "Familiada";
      await updateGameName(name);
      setError("Zapisano nazwę.");
      setTimeout(() => setError(""), 800);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd zapisu nazwy.");
    }
  });

  ui.addQ.addEventListener("click", async () => {
    try {
      setError("");
      const q = await insertQuestion();
      questions = await loadQuestions();
      activeQ = q;
      await loadActive();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Nie udało się dodać pytania.");
    }
  });

  ui.qText.addEventListener("change", async () => {
    if (!activeQ) return;
    const t = (ui.qText.value || "").trim() || "Pytanie";
    await updateQuestion(activeQ.id, { text: t });
    activeQ.text = t;
    renderQuestions();
  });

  ui.modeFixed.addEventListener("click", async () => {
    if (!activeQ) return;
    await updateQuestion(activeQ.id, { mode: "fixed" });
    activeQ.mode = "fixed";
    renderQuestions();
    renderEditor();
  });

  ui.modePoll.addEventListener("click", async () => {
    if (!activeQ) return;
    await updateQuestion(activeQ.id, { mode: "poll" });
    activeQ.mode = "poll";
    renderQuestions();
    renderEditor();
  });

  ui.delQ.addEventListener("click", async () => {
    if (!activeQ) return;
    const ok = confirm("Usunąć pytanie i wszystkie odpowiedzi?");
    if (!ok) return;

    await deleteQuestion(activeQ.id);
    activeQ = null;
    answers = [];
    questions = await loadQuestions();
    renderQuestions();
    renderEditor();
    renderAnswers();
  });

  ui.addA.addEventListener("click", async () => {
    if (!activeQ) return;
    await insertAnswer(activeQ.id);
    answers = await loadAnswers(activeQ.id);
    renderAnswers();
  });

  // start
  questions = await loadQuestions();
  renderQuestions();
  renderEditor();
  renderAnswers();
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    setError(e?.message || "Błąd krytyczny.");
  });
});
