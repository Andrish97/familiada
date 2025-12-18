import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText = document.getElementById("paperText");
const hint = document.getElementById("hint");
const blank = document.getElementById("blank");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

let lastText = "";
let hidden = false;

// ---------- fullscreen ----------
function setFullscreenIcon(){
  // ⧉ = “dwa nałożone”, ▢ = “jeden”
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

// ---------- hide / reveal ----------

function setHidden(on){
  if (on === hidden) return;
  hidden = on;

  if (on) {
    lastText = paperText.textContent;
    paperText.textContent = "";
    hint.textContent = "Przeciągnij w górę aby odsłonić";
  } else {
    paperText.textContent = lastText || "";
    hint.textContent = "Przeciągnij w dół żeby zasłonić";
  }
}

// swipe/drag w całym ekranie, ale nie przy samej górze/dole
let startY = null;
let startOK = false;

function yOK(y){
  const h = window.innerHeight || 1;
  return (y > 70) && (y < h - 70);
}

function onDown(y){
  startY = y;
  startOK = yOK(y);
}

function onMove(y){
  if (startY == null || !startOK) return;

  const dy = y - startY;

  // ↓ zasłoń (z widocznej kartki)
  if (!hidden && dy > 70) {
    setHidden(true);
    startY = null;
    return;
  }

  // ↑ odsłoń (z czarnej zasłony)
  if (hidden && dy < -70) {
    setHidden(false);
    startY = null;
    return;
  }
}

function onUp(){
  startY = null;
  startOK = false;
}

// touch + mouse
document.addEventListener("touchstart", (e)=> onDown(e.touches?.[0]?.clientY ?? 0), { passive:false });
document.addEventListener("touchmove",  (e)=> { e.preventDefault(); onMove(e.touches?.[0]?.clientY ?? 0); }, { passive:false });
document.addEventListener("touchend",   ()=> onUp(), { passive:true });

document.addEventListener("mousedown", (e)=> onDown(e.clientY));
document.addEventListener("mousemove", (e)=> onMove(e.clientY));
document.addEventListener("mouseup",   ()=> onUp());

// fullscreen
btnFS.addEventListener("click", async () => {
  try{
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
});
document.addEventListener("fullscreenchange", setFullscreenIcon);

// ---------- commands ----------
function norm(s){ return String(s ?? "").trim(); }

function setText(t){
  paperText.textContent = t ?? "";
}

function handleCmd(line){
  const cmd = line.toUpperCase();

  if (cmd === "OFF") { setHidden(true); return; }
  if (cmd === "ON")  { setHidden(false); return; }

  if (/^SEND\b/i.test(line)) {
    const m = line.match(/^SEND\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : line.replace(/^SEND\s+/i, "");
    lastText = text || "";
    if (!hidden) paperText.textContent = lastText;
  }
}

// ---------- channel ----------
let ch = null;
function ensureChannel(){
  if (ch) return ch;
  ch = sb().channel(`familiada-host:${gameId}`)
    .on("broadcast", { event:"HOST_CMD" }, (msg)=>{
      handleCmd(norm(msg?.payload?.line));
    })
    .subscribe();
  return ch;
}

// ping (opcjonalnie)
async function ping(){
  try { await sb().rpc("public_ping", { p_game_id: gameId, p_kind:"host", p_key:key }); } catch {}
}

document.addEventListener("DOMContentLoaded", ()=>{
  setFullscreenIcon();

  // start bez “Ładuję…”
  setText("");

  if (!gameId || !key) {
    setHidden(true);
    setText("");
    return;
  }

  setHidden(false);
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

// debug
window.__host = { setText, setHidden, handleCmd };
