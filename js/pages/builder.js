// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

/* ===== ZASADY ===== */
const QN = 10; // min/stała liczba pytań
const AN = 5;  // stała liczba odpowiedzi

/* ===== DOM ===== */
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

/* ===== STATE ===== */
let currentUser = null;
let games = [];
let selectedId = null;

/* ===== HELPERS ===== */
function on(el, evt, fn){
  if (!el) return;
  el.addEventListener(evt, fn);
}

function show(el, visible){
  if (!el) return;
  el.style.display = visible ? "" : "none";
}

function setImportMsg(t){
  if (!importMsg) return;
  importMsg.textContent = t || "";
}

function safeInt(v, def = 0){
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.trunc(n);
}

function clampInt(v, min, max){
  return Math.max(min, Math.min(max, safeInt(v, min)));
}

function downloadJson(filename, obj){
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

function guessKindFromQuestions(qs){
  // jeśli jakiekolwiek pytanie ma mode='poll' -> traktujemy jako sondażowa
  return (qs || []).some(q => q.mode === "poll") ? "poll" : "fixed";
}

/* ===== SUPABASE ===== */
async function listGames(){
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at")
    .order("created_at", { ascending:false });

  if (error) throw error;
  return data || [];
}

async function loadQuestions(gameId){
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending:true });

  if (error) throw error;
  return data || [];
}

async function loadAnswers(qid){
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending:true });

  if (error) throw error;
  return data || [];
}

async function ensureLive(gameId){
  const { data, error } = await sb()
    .from("live_state")
    .select("game_id")
    .eq("game_id", gameId)
    .maybeSingle();

  // jeśli SELECT wywali (RLS) – nie stopujemy buildera, ale logujemy
  if (error){
    console.warn("[builder] ensureLive select error:", error);
    return;
  }

  if (data?.game_id) return;

  const ins = await sb().from("live_state").insert({ game_id: gameId });
  if (ins.error){
    console.warn("[builder] ensureLive insert error:", ins.error);
  }
}

async function createGame(kind){
  // kind: "fixed" | "poll"
  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name: kind === "poll" ? "Nowa Familiada (Sondaż)" : "Nowa Familiada",
      owner_id: currentUser.id,
    })
    .select("*")
    .single();

  if (error) throw error;

  await ensureLive(game.id);

  // 10 pytań x 5 odpowiedzi (zawsze, bez klikania)
  for (let i = 1; i <= QN; i++){
    const { data: q, error: qErr } = await sb()
      .from("questions")
      .insert({
        game_id: game.id,
        ord: i,
        text: `Pytanie ${i}`,
        mode: kind === "poll" ? "poll" : "fixed",
      })
      .select("*")
      .single();

    if (qErr) throw qErr;

    // fixed_points zawsze int4 (0)
    const rows = [];
    for (let j = 1; j <= AN; j++){
      rows.push({
        question_id: q.id,
        ord: j,
        text: `ODP ${j}`,
        fixed_points: 0,
      });
    }

    const { error: aErr } = await sb().from("answers").insert(rows);
    if (aErr) throw aErr;
  }

  return game;
}

async function deleteGame(game){
  const ok = await confirmModal({
    title: "Usuń Familiadę",
    text: `Na pewno usunąć "${game.name}"?`,
    okText: "Usuń",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  const { error } = await sb().from("games").delete().eq("id", game.id);
  if (error){
    console.error("[builder] delete error:", error);
    alert("Nie udało się usunąć. Sprawdź konsolę.");
  }
}

/* ===== IMPORT/EXPORT FORMAT ===== */
function normalizeImportedPayload(raw){
  // wejście: { game:{name, kind}, questions:[{text, answers:[{text,fixed_points}]}] }
  const p = raw || {};
  const g = p.game || {};
  const kind = (g.kind === "poll") ? "poll" : "fixed";
  const name = String(g.name || "Zaimportowana Familiada").slice(0, 80);

  const srcQs = Array.isArray(p.questions) ? p.questions : [];

  const outQs = [];
  for (let i = 0; i < QN; i++){
    const srcQ = srcQs[i] || {};
    const qText = String(srcQ.text || `Pytanie ${i+1}`).slice(0, 200);

    const srcA = Array.isArray(srcQ.answers) ? srcQ.answers : [];
    const answers = [];

    for (let j = 0; j < AN; j++){
      const a = srcA[j] || {};
      const aText = String(a.text || `ODP ${j+1}`).slice(0, 17);

      // fixed_points: zawsze int
      let pts = 0;
      if (kind === "fixed"){
        pts = clampInt(a.fixed_points, 0, 999); // int4 i tak, ale trzymamy rozsądnie
      }

      answers.push({ ord: j+1, text: aText, fixed_points: pts });
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

async function doExportSelected(){
  const sel = games.find(g => g.id === selectedId);
  if (!sel) return;

  const qs = await loadQuestions(sel.id);
  const kind = guessKindFromQuestions(qs);

  const payload = { game: { name: sel.name, kind }, questions: [] };

  for (const q of qs){
    const ans = await loadAnswers(q.id);
    payload.questions.push({
      ord: q.ord,
      text: q.text,
      mode: q.mode,
      answers: ans.map(a => ({
        ord: a.ord,
        text: a.text,
        fixed_points: safeInt(a.fixed_points, 0),
      })),
    });
  }

  const safe = sel.name.replace(/[^\w\d\- ]+/g, "").trim().slice(0, 40) || "familiada";
  downloadJson(`${safe}.json`, payload);
}

async function doImportPayload(rawObj){
  const payload = normalizeImportedPayload(rawObj);

  const { data: game, error } = await sb()
    .from("games")
    .insert({ name: payload.game.name, owner_id: currentUser.id })
    .select("*")
    .single();

  if (error) throw error;

  await ensureLive(game.id);

  for (const q of payload.questions){
    const { data: qRow, error: qErr } = await sb()
      .from("questions")
      .insert({
        game_id: game.id,
        ord: q.ord,
        text: q.text,
        mode: q.mode,
      })
      .select("*")
      .single();

    if (qErr) throw qErr;

    const rows = q.answers.map(a => ({
      question_id: qRow.id,
      ord: safeInt(a.ord, 1),
      text: String(a.text || "ODP").slice(0, 17),
      fixed_points: payload.game.kind === "fixed" ? clampInt(a.fixed_points, 0, 999) : 0,
    }));

    const { error: aErr } = await sb().from("answers").insert(rows);
    if (aErr) throw aErr;
  }

  return game;
}

/* ===== UI ===== */
function setActionState(kind = null){
  const has = !!selectedId;

  if (btnEdit) btnEdit.disabled = !has;
  if (btnPlay) btnPlay.disabled = !has;
  if (btnExport) btnExport.disabled = !has;

  // Poll tylko dla sondażowej
  if (btnPoll) btnPoll.disabled = !has || (kind && kind !== "poll");
}

function openTypeModal(){ show(typeOverlay, true); }
function closeTypeModal(){ show(typeOverlay, false); }

function openImportModal(){
  if (importTa) importTa.value = "";
  if (importFile) importFile.value = "";
  setImportMsg("");
  show(importOverlay, true);
}
function closeImportModal(){
  show(importOverlay, false);
  setImportMsg("");
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

  el.addEventListener("click", async ()=>{
    selectedId = g.id;
    render();

    try{
      const qs = await loadQuestions(selectedId);
      const kind = guessKindFromQuestions(qs);
      setActionState(kind);
    }catch{
      setActionState(null);
    }
  });

  el.querySelector(".x").addEventListener("click", async (e)=>{
    e.stopPropagation();
    await deleteGame(g);
    await refresh();
  });

  return el;
}

function render(){
  if (!grid) return;

  grid.innerHTML = "";
  for (const g of games){
    const el = cardGame(g);
    if (g.id === selectedId) el.classList.add("selected");
    grid.appendChild(el);
  }

  // domyślnie: brak wyboru = przyciski disabled
  setActionState(null);
}

async function refresh(){
  games = await listGames();

  if (selectedId && !games.some(g => g.id === selectedId)){
    selectedId = null;
  }

  render();

  if (selectedId){
    try{
      const qs = await loadQuestions(selectedId);
      const kind = guessKindFromQuestions(qs);
      setActionState(kind);
    }catch{
      setActionState(null);
    }
  } else {
    setActionState(null);
  }
}

/* ===== START ===== */
document.addEventListener("DOMContentLoaded", async ()=>{
  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.email || "—";

  on(btnLogout, "click", async ()=>{
    await signOut();
    location.href = "index.html";
  });

  on(btnNew, "click", openTypeModal);
  on(btnCancelType, "click", closeTypeModal);

  on(btnCreateFixed, "click", async ()=>{
    closeTypeModal();
    try{
      await createGame("fixed");
      await refresh();
    }catch(e){
      console.error("[builder] create fixed error:", e);
      alert("Nie udało się utworzyć gry (fixed). Sprawdź konsolę.");
    }
  });

  on(btnCreatePoll, "click", async ()=>{
    closeTypeModal();
    try{
      await createGame("poll");
      await refresh();
    }catch(e){
      console.error("[builder] create poll error:", e);
      alert("Nie udało się utworzyć gry (poll). Sprawdź konsolę.");
    }
  });

  on(btnEdit, "click", ()=>{
    if (!selectedId) return;
    location.href = `editor.html?id=${encodeURIComponent(selectedId)}`;
  });

  on(btnPlay, "click", ()=>{
    if (!selectedId) return;
    location.href = `control.html?id=${encodeURIComponent(selectedId)}`;
  });

  on(btnPoll, "click", async ()=>{
    if (!selectedId) return;

    try{
      const qs = await loadQuestions(selectedId);
      const kind = guessKindFromQuestions(qs);
      if (kind !== "poll"){
        alert("To nie jest Familiada sondażowa.");
        return;
      }
    }catch(e){
      console.error("[builder] poll kind check error:", e);
      alert("Nie udało się sprawdzić typu gry.");
      return;
    }

    location.href = `polls.html?id=${encodeURIComponent(selectedId)}`;
  });

  on(btnExport, "click", async ()=>{
    try{
      await doExportSelected();
    }catch(e){
      console.error("[builder] export error:", e);
      alert("Nie udało się wyeksportować. Sprawdź konsolę.");
    }
  });

  on(btnImport, "click", openImportModal);
  on(btnCancelImport, "click", closeImportModal);

  // klik w tło modala importu zamyka (opcjonalnie, ale wygodne)
  if (importOverlay){
    importOverlay.addEventListener("click", (e)=>{
      if (e.target === importOverlay) closeImportModal();
    });
  }
  if (typeOverlay){
    typeOverlay.addEventListener("click", (e)=>{
      if (e.target === typeOverlay) closeTypeModal();
    });
  }

  on(btnImportFile, "click", async ()=>{
    try{
      const f = importFile?.files?.[0];
      if (!f){
        setImportMsg("Wybierz plik JSON.");
        return;
      }
      const txt = await readFileAsText(f);
      if (importTa) importTa.value = txt;
      setImportMsg("Plik wczytany. Kliknij Importuj.");
    }catch(e){
      console.error("[builder] read file error:", e);
      setImportMsg("Nie udało się wczytać pliku.");
    }
  });

  on(btnImportJson, "click", async ()=>{
    try{
      const txt = (importTa?.value || "").trim();
      if (!txt){
        setImportMsg("Wklej JSON albo wczytaj plik.");
        return;
      }

      const obj = JSON.parse(txt);
      const g = await doImportPayload(obj);

      closeImportModal();

      // odśwież + zaznacz nową
      selectedId = g.id;
      await refresh();
    }catch(e){
      console.error("[builder] IMPORT ERROR:", e);
      setImportMsg("Błąd importu: zły JSON albo problem z bazą (sprawdź konsolę).");
    }
  });

  await refresh();
});
