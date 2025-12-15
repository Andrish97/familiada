// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

const btnNew = document.getElementById("btnNew");
const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");

const typeOverlay = document.getElementById("typeOverlay");
const btnCreateFixed = document.getElementById("btnCreateFixed");
const btnCreatePoll = document.getElementById("btnCreatePoll");
const btnCancelType = document.getElementById("btnCancelType");

const importOverlay = document.getElementById("importOverlay");
const importFile = document.getElementById("importFile");
const btnImportFile = document.getElementById("btnImportFile");
const btnImportJson = document.getElementById("btnImportJson");
const btnCancelImport = document.getElementById("btnCancelImport");
const importTa = document.getElementById("importTa");
const importMsg = document.getElementById("importMsg");

let currentUser = null;
let games = [];
let selectedId = null;

function show(el, on){ el.style.display = on ? "" : "none"; }

function setImportMsg(t){
  importMsg.textContent = t || "";
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

async function readFileAsText(file){
  return await new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(String(r.result || ""));
    r.onerror = ()=>reject(new Error("Nie udało się wczytać pliku."));
    r.readAsText(file);
  });
}

function normalizeImportedPayload(raw){
  // Akceptujemy:
  // { game:{name, kind}, questions:[{ord,text,answers:[{ord,text,fixed_points}]}] }
  // kind: "fixed" | "poll" (jeśli brak -> fixed)
  const p = raw || {};
  const g = p.game || {};
  const kind = (g.kind === "poll") ? "poll" : "fixed";

  const name = String(g.name || "Zaimportowana Familiada").slice(0, 80);

  const qs = Array.isArray(p.questions) ? p.questions : [];
  // wymagane: 10 pytań, 5 odpowiedzi — bierzemy pierwsze i docinamy/uzupełniamy
  const QN = 10;
  const AN = 5;

  const outQs = [];
  for(let i=0;i<QN;i++){
    const srcQ = qs[i] || {};
    const qText = String(srcQ.text || `Pytanie ${i+1}`).slice(0, 200);

    const srcA = Array.isArray(srcQ.answers) ? srcQ.answers : [];
    const answers = [];
    for(let j=0;j<AN;j++){
      const a = srcA[j] || {};
      const aText = String(a.text || `ODP ${j+1}`).slice(0, 17);
      let pts = 0;
      if(kind === "fixed"){
        const n = Number(a.fixed_points);
        pts = Number.isFinite(n) ? Math.max(0, Math.min(1000, Math.floor(n))) : 0;
      }
      answers.push({ ord: j+1, text: aText, fixed_points: kind === "fixed" ? pts : null });
    }

    outQs.push({
      ord: i+1,
      text: qText,
      mode: kind === "poll" ? "poll" : "fixed",
      answers,
    });
  }

  return { game: { name, kind }, questions: outQs };
}

async function listGames(){
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,share_key_poll")
    .order("created_at", { ascending: false });

  if(error) throw error;
  return data || [];
}

async function loadQuestions(gameId){
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending:true });
  if(error) throw error;
  return data || [];
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

async function ensureLive(gameId){
  const { data } = await sb().from("live_state").select("game_id").eq("game_id", gameId).maybeSingle();
  if(data?.game_id) return;
  await sb().from("live_state").insert({ game_id: gameId });
}

async function createGame(kind){
  // Uwaga: w Twojej tabeli games nie ma kolumny kind/status w pokazanym SQL,
  // więc trzymamy "typ" w pytaniach: fixed vs poll.
  // Żeby builder wiedział czy to sondażowa, robimy prostą regułę:
  // "sondażowa" = wszystkie pytania mają mode='poll' (po stworzeniu ustawiamy tak).

  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name: kind === "poll" ? "Nowa Familiada (Sondaż)" : "Nowa Familiada",
      owner_id: currentUser.id,
    })
    .select("*")
    .single();

  if(error) throw error;

  await ensureLive(game.id);

  // tworzymy od razu 10 pytań + 5 odpowiedzi (żeby zawsze było gotowe do testów)
  const QN = 10;
  const AN = 5;

  for(let i=1;i<=QN;i++){
    const { data: q, error: qErr } = await sb()
      .from("questions")
      .insert({ game_id: game.id, ord: i, text: `Pytanie ${i}`, mode: kind === "poll" ? "poll" : "fixed" })
      .select("*")
      .single();
    if(qErr) throw qErr;

    for(let j=1;j<=AN;j++){
      const fp = (kind === "fixed") ? 0 : null;
      const { error: aErr } = await sb()
        .from("answers")
        .insert({ question_id: q.id, ord: j, text: `ODP ${j}`, fixed_points: fp });
      if(aErr) throw aErr;
    }
  }

  return game;
}

async function deleteGame(game){
  const ok = await confirmModal({
    title: "Usuń Familiadę",
    text: `Na pewno usunąć "${game.name}"? Tego nie da się łatwo odkręcić.`,
    okText: "Usuń",
    cancelText: "Anuluj",
  });
  if(!ok) return;

  const { error } = await sb().from("games").delete().eq("id", game.id);
  if(error){
    console.error("[builder] delete error:", error);
    alert("Nie udało się usunąć. Sprawdź konsolę.");
  }
}

function guessKindFromQuestions(qs){
  // jeśli jakiekolwiek pytanie ma mode='poll' -> traktujemy jako sondażową
  return (qs||[]).some(q => q.mode === "poll") ? "poll" : "fixed";
}

function setActionState(){
  const sel = games.find(g => g.id === selectedId) || null;
  const has = !!sel;

  btnEdit.disabled = !has;
  btnPlay.disabled = !has;
  btnPoll.disabled = !has;
  btnExport.disabled = !has;

  // dodatkowo: sondaż tylko sensownie dla "poll"
  // (i tak finalnie w polls.html zrobimy twardą walidację, ale tu UX)
  btnPoll.disabled = !has; // docinamy po wczytaniu pytań (poniżej)
}

function cardGame(g){
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <div class="x" title="Usuń">✕</div>
    <div class="name"></div>
    <div class="meta"></div>
  `;
  el.querySelector(".name").textContent = g.name;
  el.querySelector(".meta").textContent = "Kliknij, aby zaznaczyć";

  el.addEventListener("click", ()=>{
    selectedId = g.id;
    render();
  });

  el.querySelector(".x").addEventListener("click", async (e)=>{
    e.stopPropagation();
    await deleteGame(g);
    await refresh();
  });

  return el;
}

function render(){
  grid.innerHTML = "";
  for(const g of games){
    const el = cardGame(g);
    if(g.id === selectedId) el.classList.add("selected");
    grid.appendChild(el);
  }
  setActionState();
}

async function refresh(){
  games = await listGames();
  if(selectedId && !games.some(g=>g.id === selectedId)){
    selectedId = null;
  }
  render();

  // po renderze dociągamy “czy sondaż” dla zaznaczonej gry i ustawiamy btnPoll
  const sel = games.find(g => g.id === selectedId);
  if(sel){
    try{
      const qs = await loadQuestions(sel.id);
      const kind = guessKindFromQuestions(qs);
      btnPoll.disabled = (kind !== "poll");
    }catch{
      // jak padnie — nie psujemy UI
      btnPoll.disabled = true;
    }
  }else{
    btnPoll.disabled = true;
  }
}

async function doExportSelected(){
  const sel = games.find(g => g.id === selectedId);
  if(!sel) return;

  const qs = await loadQuestions(sel.id);
  const kind = guessKindFromQuestions(qs);

  const payload = {
    game: { name: sel.name, kind },
    questions: [],
  };

  for(const q of qs){
    const ans = await loadAnswers(q.id);
    payload.questions.push({
      ord: q.ord,
      text: q.text,
      mode: q.mode,
      answers: ans.map(a => ({
        ord: a.ord,
        text: a.text,
        fixed_points: a.fixed_points,
      })),
    });
  }

  const safe = sel.name.replace(/[^\w\d\- ]+/g, "").trim().slice(0, 40) || "familiada";
  downloadJson(`${safe}.json`, payload);
}

async function doImportPayload(rawObj){
  const payload = normalizeImportedPayload(rawObj);

  // tworzymy nową grę
  const { data: game, error } = await sb()
    .from("games")
    .insert({ name: payload.game.name, owner_id: currentUser.id })
    .select("*")
    .single();
  if(error) throw error;

  await ensureLive(game.id);

  // wrzucamy 10 pytań i 5 odpowiedzi
  for(const q of payload.questions){
    const { data: qRow, error: qErr } = await sb()
      .from("questions")
      .insert({ game_id: game.id, ord: q.ord, text: q.text, mode: q.mode })
      .select("*")
      .single();
    if(qErr) throw qErr;

    for(const a of q.answers){
      const { error: aErr } = await sb()
        .from("answers")
        .insert({
          question_id: qRow.id,
          ord: a.ord,
          text: a.text,
          fixed_points: (payload.game.kind === "fixed") ? (Number(a.fixed_points)||0) : null,
        });
      if(aErr) throw aErr;
    }
  }

  return game;
}

/* ====== UI modale ====== */
function openTypeModal(){ show(typeOverlay, true); }
function closeTypeModal(){ show(typeOverlay, false); }

function openImportModal(){
  importTa.value = "";
  importFile.value = "";
  setImportMsg("");
  show(importOverlay, true);
}
function closeImportModal(){ show(importOverlay, false); }

document.addEventListener("DOMContentLoaded", async ()=>{
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout.addEventListener("click", async ()=>{
    await signOut();
    location.href = "index.html";
  });

  btnNew.addEventListener("click", openTypeModal);

  btnCancelType.addEventListener("click", closeTypeModal);

  btnCreateFixed.addEventListener("click", async ()=>{
    closeTypeModal();
    try{
      await createGame("fixed");
      await refresh();
    }catch(e){
      console.error(e);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    }
  });

  btnCreatePoll.addEventListener("click", async ()=>{
    closeTypeModal();
    try{
      await createGame("poll");
      await refresh();
    }catch(e){
      console.error(e);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    }
  });

  btnEdit.addEventListener("click", ()=>{
    if(!selectedId) return;
    location.href = `editor.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnPlay.addEventListener("click", ()=>{
    if(!selectedId) return;
    location.href = `control.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnPoll.addEventListener("click", async ()=>{
    if(!selectedId) return;

    // twarda blokada UX: tylko jeśli to “poll”
    try{
      const qs = await loadQuestions(selectedId);
      const kind = guessKindFromQuestions(qs);
      if(kind !== "poll"){
        alert("To nie jest Familiada sondażowa.");
        return;
      }
    }catch{}

    location.href = `polls.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnExport.addEventListener("click", async ()=>{
    try{
      await doExportSelected();
    }catch(e){
      console.error(e);
      alert("Nie udało się wyeksportować. Sprawdź konsolę.");
    }
  });

  btnImport.addEventListener("click", openImportModal);

  btnCancelImport.addEventListener("click", closeImportModal);

  btnImportFile.addEventListener("click", async ()=>{
    try{
      const f = importFile.files?.[0];
      if(!f){
        setImportMsg("Wybierz plik JSON.");
        return;
      }
      const txt = await readFileAsText(f);
      importTa.value = txt;
      setImportMsg("Plik wczytany. Kliknij Importuj.");
    }catch(e){
      console.error(e);
      setImportMsg("Nie udało się wczytać pliku.");
    }
  });

  btnImportJson.addEventListener("click", async ()=>{
    try{
      const txt = importTa.value || "";
      if(!txt.trim()){
        setImportMsg("Wklej JSON albo wczytaj plik.");
        return;
      }
      const obj = JSON.parse(txt);
      const g = await doImportPayload(obj);
      closeImportModal();
      await refresh();

      // zaznacz nową grę
      selectedId = g.id;
      render();
    }catch(e){
      console.error(e);
      setImportMsg("Błąd importu: nieprawidłowy JSON albo problem z bazą.");
    }
  });

  await refresh();
});
