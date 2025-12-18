import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText = document.getElementById("paperText");
const hint = document.getElementById("hint");
const blank = document.getElementById("blank");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

let hidden = false;
let lastText = "";

// ---------- fullscreen ----------
function setFullscreenIcon(){
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

async function toggleFullscreen(){
  try{
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
  setFullscreenIcon();
}

// ---------- hide / reveal ----------
function setHidden(on){
  hidden = !!on;
  blank.hidden = !hidden;

  hint.textContent = hidden
    ? "Przeciągnij w górę aby odsłonić"
    : "Przeciągnij w dół żeby zasłonić";
}

function setText(t){
  lastText = String(t ?? "");
  if (!hidden) paperText.textContent = lastText;
}

function clearText(){
  lastText = "";
  if (!hidden) paperText.textContent = "";
}

// ---------- gestures (touch + mouse) ----------
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

  // widoczne -> zasłoń (swipe w dół)
  if (!hidden && dy > 70){
    setHidden(true);
    startY = null;
    return;
  }

  // zasłonięte -> odsłoń (swipe w górę)
  if (hidden && dy < -70){
    setHidden(false);
    // po odsłonięciu przywróć tekst
    paperText.textContent = lastText;
    startY = null;
    return;
  }
}

function onUp(){
  startY = null;
  startOK = false;
}

// touch: blokuj tylko pinch / multi-touch, nie “zwykły” swipe
document.addEventListener("touchstart", (e)=>{
  if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
  onDown(e.touches?.[0]?.clientY ?? 0);
}, { passive:false });

document.addEventListener("touchmove", (e)=>{
  if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
  onMove(e.touches?.[0]?.clientY ?? 0);
}, { passive:false });

document.addEventListener("touchend", ()=> onUp(), { passive:true });

// mouse (desktop)
document.addEventListener("mousedown", (e)=> onDown(e.clientY));
document.addEventListener("mousemove", (e)=> onMove(e.clientY));
document.addEventListener("mouseup", ()=> onUp());

// blokuj ctrl+scroll zoom (desktop)
document.addEventListener("wheel", (e)=>{
  if (e.ctrlKey) e.preventDefault();
}, { passive:false });

// ---------- commands ----------
function norm(s){ return String(s ?? "").trim(); }

function handleCmd(lineRaw){
  const line = norm(lineRaw);
  const up = line.toUpperCase();

  // zasłona
  if (up === "OFF") { setHidden(true); return; }
  if (up === "ON")  { setHidden(false); paperText.textContent = lastText; return; }

  // SET "tekst"  |  SET bez cudzysłowu
  if (/^SET\b/i.test(line)){
    const m = line.match(/^SET\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : line.replace(/^SET\s+/i, "");
    setText(text);
    return;
  }

  // CLEAR
  if (up === "CLEAR"){
    clearText();
    return;
  }
}

// ---------- channel ----------
let ch = null;
function ensureChannel(){
  if (ch) return ch;
  ch = sb().channel(`familiada-host:${gameId}`)
    .on("broadcast", { event:"HOST_CMD" }, (msg)=>{
      handleCmd(msg?.payload?.line);
    })
    .subscribe();
  return ch;
}

// ping (opcjonalnie)
async function ping(){
  try { await sb().rpc("public_ping", { p_game_id: gameId, p_kind:"host", p_key:key }); } catch {}
}

btnFS.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

document.addEventListener("DOMContentLoaded", ()=>{
  setFullscreenIcon();
  paperText.textContent = "";   // bez “Ładuję…”

  if (!gameId || !key){
    setHidden(true);
    return;
  }

  setHidden(false);
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

// debug
window.__host = { setHidden, setText, clearText, handleCmd };
