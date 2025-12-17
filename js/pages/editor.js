// js/pages/editor.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";
import { RULES } from "../core/game-validate.js";

guardDesktopOnly({ message: "Edytor Familiady jest dostępny tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");

const gameName = document.getElementById("gameName");
const btnSaveName = document.getElementById("btnSaveName");

const qList = document.getElementById("qList");
const rightPanel = document.querySelector(".rightPanel");
const qText = document.getElementById("qText");
const btnAddQ = document.getElementById("btnAddQ");

const aList = document.getElementById("aList");
const btnAddA = document.getElementById("btnAddA");
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

function setMsg(t){
  if(!msg) return;
  msg.textContent = t || "";
  if(t) setTimeout(()=>msg.textContent="", 1600);
}

function clip17(s){
  const t = String(s || "");
  return t.length <= 17 ? t : t.slice(0, 17);
}

function isPoll(){ return game?.kind === "poll"; }
function isFixed(){ return game?.kind === "fixed"; }
function isLocked(){
  return isPoll() && game?.status === "poll_open";
}

function clampInt(n, min, max){
  const x = Number(n);
  if(!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function updateBadges(){
  if(!game) return;

  if(gameKindBadge) gameKindBadge.textContent = isPoll() ? "SONDAŻOWA" : "LOKALNA";
  document.body.classList.toggle("is-poll", isPoll());

  if(lockBadge) lockBadge.style.display = isLocked() ? "" : "none";
  if(hintFixed) hintFixed.style.display = isFixed() ? "" : "none";
  if(hintPoll) hintPoll.style.display = isPoll() ? "" : "none";

  if(remainRow){
    remainRow.style.display = (isFixed() && !!activeQ) ? "" : "none";
  }

  if(btnAddA){
    btnAddA.style.display = activeQ ? "" : "none";
    btnAddA.disabled = isLocked() || !activeQ || answers.length >= RULES.AN_MAX;
  }
}

function calcSum(){
  return answers.reduce((s,a)=> s + (Number(a.fixed_points)||0), 0);
}

function updateRemaining(){
  if(!remainRow || !remainVal) return;
  if(!isFixed() || !activeQ){
    remainRow.style.display = "none";
    return;
  }
  remainRow.style.display = "";
  const left = Math.max(0, 100 - calcSum());
  remainVal.textContent = String(left);
}

async function loadGame(){
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status")
    .eq("id", gameId)
    .single();
  if(error) throw error;
  return data;
}

async function updateGameName(name){
  const { error } = await sb().from("games").update({ name }).eq("id", gameId);
  if(error) throw error;
}

async function loadQuestions(){
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending:true });
  if(error) throw error;
  return data || [];
}

async function insertQuestion(){
  const ord = questions.length ? Math.max(...questions.map(q=>q.ord||0)) + 1 : 1;

  const { data, error } = await sb()
    .from("questions")
    .insert({
      game_id: gameId,
      ord,
      text: `Pytanie ${ord}`,
      mode: isPoll() ? "poll" : "fixed",
    })
    .select("*")
    .single();

  if(error) throw error;
  return data;
}

async function updateQuestion(qid, patch){
  const { error } = await sb().from("questions").update(patch).eq("id", qid);
  if(error) throw error;
}

async function deleteQuestion(qid){
  const { error } = await sb().from("questions").delete().eq("id", qid);
  if(error) throw error;
}

async function loadAnswers(qid){
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending:true });
  if(error) throw error;
  return data || [];
}

async function insertAnswer(qid, ord){
  const { data, error } = await sb()
    .from("answers")
    .insert({ question_id: qid, ord, text: "ODPOWIEDŹ", fixed_points: 0 })
    .select("*")
    .single();
  if(error) throw error;
  return data;
}

async function updateAnswer(aid, patch){
  const { error } = await sb().from("answers").update(patch).eq("id", aid);
  if(error) throw error;
}

async function deleteAnswer(aid){
  const { error } = await sb().from("answers").delete().eq("id", aid);
  if(error) throw error;
}

async function normalizeAnswerOrds(qid){
  const list = await loadAnswers(qid);
  const sorted = [...list].sort((a,b)=>(a.ord||0)-(b.ord||0));
  for(let i=0;i<sorted.length;i++){
    const want = i+1;
    if(sorted[i].ord !== want){
      await updateAnswer(sorted[i].id, { ord: want });
    }
  }
  return await loadAnswers(qid);
}

/**
 * Zapewnij MIN 5 odpowiedzi, MAX 6 (nadmiar ucinamy).
 */
async function ensureAnswersRange(){
  if(!activeQ) return;

  answers = await loadAnswers(activeQ.id);

  while(answers.length < RULES.AN_MIN){
    const ord = answers.length ? Math.max(...answers.map(a=>a.ord||0)) + 1 : 1;
    await insertAnswer(activeQ.id, ord);
    answers = await loadAnswers(activeQ.id);
  }

  if(answers.length > RULES.AN_MAX){
    // tniemy do 6: kasujemy “najwyższe ord” po sortowaniu
    const sorted = [...answers].sort((a,b)=>(a.ord||0)-(b.ord||0));
    const toDel = sorted.slice(RULES.AN_MAX);
    for(const a of toDel){
      await deleteAnswer(a.id);
    }
  }

  answers = await normalizeAnswerOrds(activeQ.id);
}

function renderQuestions(){
  qList.innerHTML = "";
  questions.forEach((q)=>{
    const el = document.createElement("div");
    el.className = "qcard" + (activeQ?.id === q.id ? " active" : "");
    el.innerHTML = `
      <div class="qord">#${q.ord}</div>
      <div class="qprev"></div>
      <div class="qmode">${isPoll() ? "Sondaż" : "Lokalna"}</div>
    `;
    el.querySelector(".qprev").textContent = q.text || "—";

    el.addEventListener("click", async ()=>{
      activeQ = q;
      await loadActive();
    });

    qList.appendChild(el);
  });
}

function renderEditorShell(){
  if(!activeQ){
    rightPanel.classList.remove("hasQ");
    updateBadges();
    updateRemaining();
    return;
  }

  rightPanel.classList.add("hasQ");

  qText.disabled = isLocked();
  btnAddQ.disabled = isLocked();

  qText.value = activeQ.text || "";
  updateBadges();
  updateRemaining();
}

function renderAnswers(){
  aList.innerHTML = "";
  if(!activeQ) return;

  const locked = isLocked();

  answers.forEach((a, idx)=>{
    const row = document.createElement("div");
    row.className = "arow";

    const canDeleteRow = (answers.length > RULES.AN_MIN) && (idx === answers.length - 1); // usuwamy tylko “ostatnią” (6-tą)
    const delLabel = canDeleteRow ? "Usuń" : "Wyczyść";

    if(isFixed()){
      row.innerHTML = `
        <input class="aText" />
        <input class="aPts" type="number" min="0" max="100" step="1" inputmode="numeric" />
        <button class="aDel" type="button" title="${delLabel}" ${locked ? "disabled" : ""}>✕</button>
      `;
    }else{
      row.innerHTML = `
        <input class="aText" />
        <button class="aDel" type="button" title="${delLabel}" ${locked ? "disabled" : ""}>✕</button>
      `;
    }

    const aText = row.querySelector(".aText");
    const aPts  = row.querySelector(".aPts");
    const aDel  = row.querySelector(".aDel");

    if(aText) aText.value = a.text || "";
    if(aPts)  aPts.value  = String(typeof a.fixed_points === "number" ? a.fixed_points : 0);

    aText.addEventListener("input", ()=>{
      const t = aText.value || "";
      if(t.length > 17){
        aText.value = t.slice(0,17);
        setMsg("Odpowiedź max 17 znaków.");
      }
    });

    aText.addEventListener("change", async ()=>{
      if(locked) return;
      const t = clip17(aText.value).trim() || "ODPOWIEDŹ";
      aText.value = t;
      await updateAnswer(a.id, { text: t });
      a.text = t;
    });

    if(isFixed() && aPts){
      aPts.disabled = locked;

      const applyLive = async (commit)=>{
        if(locked) return;

        let cur = clampInt(aPts.value, 0, 100);

        const otherSum = answers
          .filter(x=>x.id !== a.id)
          .reduce((s,x)=> s + (Number(x.fixed_points)||0), 0);

        const maxAllowed = Math.max(0, 100 - otherSum);
        const next = Math.min(cur, maxAllowed);

        if(next !== cur){
          aPts.value = String(next);
          setMsg("Suma nie może przekroczyć 100.");
        }

        a.fixed_points = next;
        updateRemaining();

        if(commit){
          await updateAnswer(a.id, { fixed_points: next });
        }
      };

      aPts.addEventListener("input", ()=>{ applyLive(false); });
      aPts.addEventListener("change", ()=>{ applyLive(true); });
    }

    aDel.disabled = locked;
    aDel.addEventListener("click", async ()=>{
      if(locked) return;

      if(canDeleteRow){
        const ok = await confirmModal({
          title: "Usunąć odpowiedź?",
          text: "To usunie 6-tą odpowiedź (wrócisz do 5).",
          okText: "Usuń",
          cancelText: "Anuluj",
        });
        if(!ok) return;

        await deleteAnswer(a.id);
        answers = await normalizeAnswerOrds(activeQ.id);
        updateBadges();
        renderAnswers();
        updateRemaining();
        return;
      }

      const ok = await confirmModal({
        title:"Wyczyść odpowiedź",
        text: isFixed()
          ? "Wyczyścić tekst i ustawić 0 pkt?"
          : "Wyczyścić tekst?",
        okText:"Wyczyść",
        cancelText:"Anuluj",
      });
      if(!ok) return;

      const patch = isFixed()
        ? { text:"ODPOWIEDŹ", fixed_points:0 }
        : { text:"ODPOWIEDŹ" };

      await updateAnswer(a.id, patch);
      a.text = "ODPOWIEDŹ";
      if(isFixed()) a.fixed_points = 0;

      renderAnswers();
      updateRemaining();
    });

    aList.appendChild(row);
  });

  updateBadges();
  updateRemaining();
}

async function loadActive(){
  questions = await loadQuestions();
  activeQ = questions.find(x=>x.id === activeQ.id) || null;

  if(activeQ){
    await ensureAnswersRange();
  }else{
    answers = [];
  }

  renderQuestions();
  renderEditorShell();
  renderAnswers();
}

async function refreshAll(){
  game = await loadGame();
  if(gameName) gameName.value = game.name || "Familiada";

  updateBadges();

  questions = await loadQuestions();
  renderQuestions();

  if(activeQ){
    activeQ = questions.find(x=>x.id === activeQ.id) || null;
  }

  renderEditorShell();

  if(activeQ){
    await ensureAnswersRange();
    renderAnswers();
  }else{
    answers = [];
    renderAnswers();
  }
}

document.addEventListener("DOMContentLoaded", async ()=>{
  if(!gameId){
    alert("Brak parametru id w URL (editor.html?id=...).");
    location.href = "builder.html";
    return;
  }

  currentUser = await requireAuth("index.html");
  if(who) who.textContent = currentUser?.email || "—";

  btnLogout?.addEventListener("click", async ()=>{
    await signOut();
    location.href = "index.html";
  });

  btnBack?.addEventListener("click", ()=>location.href="builder.html");

  btnSaveName?.addEventListener("click", async ()=>{
    if(isLocked()){
      setMsg("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }
    const name = (gameName.value || "").trim() || "Familiada";
    await updateGameName(name);
    setMsg("Zapisano nazwę.");
    await refreshAll();
  });

  btnAddQ?.addEventListener("click", async ()=>{
    if(isLocked()){
      setMsg("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }
    const q = await insertQuestion();
    activeQ = q;
    await loadActive();
  });

  btnAddA?.addEventListener("click", async ()=>{
    if(!activeQ) return;
    if(isLocked()) return;

    answers = await loadAnswers(activeQ.id);
    if(answers.length >= RULES.AN_MAX){
      setMsg(`Maksymalnie ${RULES.AN_MAX} odpowiedzi.`);
      updateBadges();
      return;
    }

    const ord = answers.length ? Math.max(...answers.map(a=>a.ord||0)) + 1 : 1;
    await insertAnswer(activeQ.id, ord);
    answers = await normalizeAnswerOrds(activeQ.id);

    setMsg("Dodano odpowiedź.");
    renderAnswers();
  });

  qText?.addEventListener("change", async ()=>{
    if(!activeQ) return;
    if(isLocked()){
      setMsg("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }
    const t = (qText.value || "").trim() || "Nowe pytanie";
    await updateQuestion(activeQ.id, { text: t });
    activeQ.text = t;
    renderQuestions();
  });

  // SHIFT+klik na kafelku = usuń pytanie
  qList?.addEventListener("click", async (e)=>{
    const card = e.target?.closest?.(".qcard");
    if(!card) return;
    if(!e.shiftKey) return;

    if(isLocked()){
      setMsg("Sondaż jest otwarty — nie można usuwać.");
      return;
    }
    if(!activeQ) return;

    const ok = await confirmModal({
      title:"Usuń pytanie",
      text:"Usunąć pytanie i wszystkie odpowiedzi?",
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
