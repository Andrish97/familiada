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

const gameName = document.getElementById("gameName");
const btnSaveName = document.getElementById("btnSaveName");
const btnExport = document.getElementById("btnExport");

const qList = document.getElementById("qList");
const rightPanel = document.querySelector(".rightPanel");
const qText = document.getElementById("qText");
const btnAddQ = document.getElementById("btnAddQ");

const aList = document.getElementById("aList");

const msg = document.getElementById("msg");

const gameKindBadge = document.getElementById("gameKindBadge");
const lockBadge = document.getElementById("lockBadge");
const hintFixed = document.getElementById("hintFixed");
const hintPoll = document.getElementById("hintPoll");

const remainRow = document.getElementById("remainRow");
const remainVal = document.getElementById("remainVal");

let currentUser = null;
let game = null;
let questions = [];
let activeQ = null;
let answers = [];

function setMsg(t) {
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 1400);
}

function clip17(s) {
  const t = String(s || "");
  return t.length <= 17 ? t : t.slice(0, 17);
}

function isLocked(){
  return game?.kind === "poll" && game?.status === "poll_open";
}

function isFixed(){
  return game?.kind === "fixed";
}

function updateBadges(){
  if(!game) return;

  gameKindBadge.textContent = (game.kind === "poll") ? "SONDAŻOWA" : "LOKALNA";
  document.body.classList.toggle("is-poll", game.kind === "poll");

  const locked = isLocked();
  lockBadge.style.display = locked ? "" : "none";

  // “zostało” tylko dla lokalnej i tylko jeśli jest aktywne pytanie
  remainRow.style.display = (isFixed() && activeQ) ? "" : "none";
  hintFixed.style.display = isFixed() ? "" : "none";
  hintPoll.style.display = (game.kind === "poll") ? "" : "none";
}

function calcSum(){
  return answers.reduce((s,a)=> s + (Number(a.fixed_points)||0), 0);
}

function updateRemaining(){
  if(!isFixed() || !activeQ){
    remainRow.style.display = "none";
    return;
  }
  const sum = calcSum();
  const left = Math.max(0, 100 - sum);
  remainVal.textContent = String(left);
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
  const { data, error } = await sb()
    .from("questions")
    .insert({ game_id: gameId, ord, text: "Nowe pytanie", mode: game?.kind === "poll" ? "poll" : "fixed" })
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

async function insertAnswer(qid, ord, text = "ODPOWIEDŹ") {
  const { data, error } = await sb()
    .from("answers")
    .insert({ question_id: qid, ord, text, fixed_points: 0 })
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

async function ensureExactlyFiveAnswers(){
  if(!activeQ) return;

  answers = await loadAnswers(activeQ.id);

  // jeśli mniej niż 5 — dopychamy
  while(answers.length < 5){
    const ord = answers.length ? Math.max(...answers.map(a=>a.ord)) + 1 : 1;
    await insertAnswer(activeQ.id, ord, "ODPOWIEDŹ");
    answers = await loadAnswers(activeQ.id);
  }

  // jeśli więcej niż 5 — przycinamy (od końca po ord)
  if(answers.length > 5){
    const sorted = [...answers].sort((a,b)=> (a.ord||0) - (b.ord||0));
    const toDelete = sorted.slice(5);
    for(const a of toDelete){
      await deleteAnswer(a.id);
    }
    answers = await loadAnswers(activeQ.id);
  }

  // wyrównaj ord na 1..5
  const sorted2 = [...answers].sort((a,b)=> (a.ord||0) - (b.ord||0));
  for(let i=0;i<sorted2.length;i++){
    const want = i+1;
    if(sorted2[i].ord !== want){
      await updateAnswer(sorted2[i].id, { ord: want });
    }
  }
  answers = await loadAnswers(activeQ.id);
}

function renderQuestions() {
  qList.innerHTML = "";
  questions.forEach((q) => {
    const el = document.createElement("div");
    el.className = "qcard" + (activeQ?.id === q.id ? " active" : "");
    el.innerHTML = `
      <div class="qord">#${q.ord}</div>
      <div class="qprev"></div>
      <div class="qmode">${game?.kind === "poll" ? "Sondaż" : "Lokalna"}</div>
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
    remainRow.style.display = "none";
    return;
  }
  rightPanel.classList.add("hasQ");

  qText.value = activeQ.text || "";
  qText.disabled = isLocked();
  btnAddQ.disabled = isLocked();

  updateBadges();
}

function clampInt(n, min, max){
  const x = Number(n);
  if(!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function renderAnswers() {
  aList.innerHTML = "";
  if (!activeQ) return;

  const locked = isLocked();

  answers.forEach((a) => {
    const row = document.createElement("div");
    row.className = "arow";

    row.innerHTML = `
      <input class="aText" />
      <input class="aPts" type="number" min="0" max="100" inputmode="numeric" />
      <button class="aDel" type="button" title="Usuń" ${locked ? "disabled" : ""}>✕</button>
    `;

    const aText = row.querySelector(".aText");
    const aPts = row.querySelector(".aPts");
    const aDel = row.querySelector(".aDel");

    aText.value = a.text || "";
    aPts.value = typeof a.fixed_points === "number" ? a.fixed_points : 0;

    // tekst
    aText.disabled = locked;
    aText.addEventListener("input", () => {
      const t = aText.value || "";
      if (t.length > 17) {
        aText.value = t.slice(0, 17);
        setMsg("Odpowiedź max 17 znaków.");
      }
    });

    aText.addEventListener("change", async () => {
      if(locked) return;
      const t = clip17(aText.value).trim() || "ODPOWIEDŹ";
      aText.value = t;
      await updateAnswer(a.id, { text: t });
      a.text = t;
    });

    // punkty (TYLKO dla lokalnych)
    if(!isFixed()){
      aPts.style.display = "none";
      aPts.disabled = true;
    } else {
      aPts.disabled = locked;

      const applyPtsLive = async (commit=false) => {
        if(locked) return;

        // bieżąca suma bez tego pola
        const current = clampInt(aPts.value, 0, 100);
        const otherSum = answers
          .filter(x=>x.id !== a.id)
          .reduce((s,x)=> s + (Number(x.fixed_points)||0), 0);

        // ile max możemy dać, żeby nie przebić 100
        const maxAllowed = Math.max(0, 100 - otherSum);
        const next = Math.min(current, maxAllowed);

        if(next !== current){
          aPts.value = String(next);
          setMsg("Suma nie może przekroczyć 100.");
        }

        a.fixed_points = next;
        updateRemaining();

        if(commit){
          await updateAnswer(a.id, { fixed_points: next });
        }
      };

      aPts.addEventListener("input", ()=>{ applyPtsLive(false); });
      aPts.addEventListener("change", ()=>{ applyPtsLive(true); });
    }

    // usuń odpowiedź — w tej wersji trzymamy “dokładnie 5”, więc NIE usuwamy.
    // zostawiamy X jako “wyczyść” (szybko) zamiast kasowania rekordu.
    aDel.disabled = locked;
    aDel.addEventListener("click", async () => {
      if(locked) return;
      const ok = await confirmModal({
        title: "Wyczyść odpowiedź",
        text: "Wyczyścić tekst i ustawić 0 pkt?",
        okText: "Wyczyść",
        cancelText: "Anuluj",
      });
      if(!ok) return;

      await updateAnswer(a.id, { text: "ODPOWIEDŹ", fixed_points: 0 });
      a.text = "ODPOWIEDŹ";
      a.fixed_points = 0;
      renderAnswers();
      updateRemaining();
    });

    aList.appendChild(row);
  });

  updateRemaining();
}

async function loadActive() {
  questions = await loadQuestions();
  activeQ = questions.find((x) => x.id === activeQ.id) || null;

  if(activeQ){
    await ensureExactlyFiveAnswers();
  } else {
    answers = [];
  }

  renderQuestions();
  renderEditorShell();
  renderAnswers();
}

async function refreshAll() {
  game = await loadGame();
  gameName.value = game.name || "Familiada";

  updateBadges();

  questions = await loadQuestions();
  renderQuestions();

  if (activeQ) {
    activeQ = questions.find((x) => x.id === activeQ.id) || null;
  }
  renderEditorShell();

  if (activeQ) {
    await ensureExactlyFiveAnswers();
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
    game: { id: game.id, name: game.name, kind: game.kind, status: game.status },
    questions: [],
  };

  for (const q of questions) {
    const ans = await loadAnswers(q.id);
    payload.questions.push({
      ord: q.ord,
      text: q.text,
      mode: q.mode,
      answers: ans
        .sort((a,b)=>(a.ord||0)-(b.ord||0))
        .slice(0,5)
        .map((a) => ({
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

  btnSaveName.addEventListener("click", async () => {
    if(isLocked()){
      setMsg("Sondaż jest otwarty — nie można edytować.");
      return;
    }
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
    if(isLocked()){
      setMsg("Sondaż jest otwarty — nie można dodawać pytań.");
      return;
    }
    const q = await insertQuestion();
    activeQ = q;
    await loadActive();
  });

  qText.addEventListener("change", async () => {
    if (!activeQ) return;
    if(isLocked()){
      setMsg("Sondaż jest otwarty — nie można edytować.");
      return;
    }
    const t = (qText.value || "").trim() || "Nowe pytanie";
    await updateQuestion(activeQ.id, { text: t });
    activeQ.text = t;
    renderQuestions();
  });

  // Usuwanie pytania: klik PPM na kafelku? (na razie zostawiamy “prosto”: alt+click)
  // Żeby nie mieszać UI — dodajemy delete po Shift+klik na kafelek.
  qList.addEventListener("click", async (e)=>{
    const card = e.target?.closest?.(".qcard");
    if(!card) return;
    if(!e.shiftKey) return;
    if(isLocked()){
      setMsg("Sondaż jest otwarty — nie można usuwać pytań.");
      return;
    }
    if(!activeQ) return;

    const ok = await confirmModal({
      title:"Usuń pytanie",
      text:"Usunąć pytanie i 5 odpowiedzi?",
      okText:"Usuń",
      cancelText:"Anuluj",
    });
    if(!ok) return;

    await deleteQuestion(activeQ.id);
    activeQ = null;
    answers = [];
    await refreshAll();
    setMsg("Usunięto pytanie.");
  });

  await refreshAll();
});
