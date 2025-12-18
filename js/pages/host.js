import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText = document.getElementById("paperText");
const hint = document.getElementById("hint");
const blank = document.getElementById("blank");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

function setFullscreenIcon(){
  fsIco.textContent = document.fullscreenElement ? "▢" : "▢▢";
}

function setHidden(on){
  blank.hidden = !on;
  hint.textContent = on
    ? "Przeciągnij w górę aby odsłonić"
    : "Przeciągnij w dół żeby zasłonić";
}

function norm(s){ return String(s ?? "").trim(); }

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

  // próg
  if (!blank.hidden && dy > 70) {
    setHidden(true);
    startY = null;
    return;
  }
  if (blank.hidden && dy < -70) {
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
  setFullscreenIcon();
});
document.addEventListener("fullscreenchange", setFullscreenIcon);

// komendy z control: kanał familiada-host:{gameId}, event HOST_CMD, payload.line
let ch = null;
function ensureChannel(){
  if (ch) return ch;
  ch = sb().channel(`familiada-host:${gameId}`)
    .on("broadcast", { event:"HOST_CMD" }, (msg)=>{
      const line = norm(msg?.payload?.line);
      handleCmd(line);
    })
    .subscribe();
  return ch;
}

function handleCmd(lineRaw){
  const line = lineRaw;

  // OFF/ON dla hosta (zasłona)
  if (line.toUpperCase() === "OFF") { setHidden(true); return; }
  if (line.toUpperCase() === "ON")  { setHidden(false); return; }

  // SEND "Tekst..."
  // przyjmujemy też SEND bez cudzysłowu (na wszelki)
  if (/^SEND\b/i.test(line)) {
    const m = line.match(/^SEND\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : line.replace(/^SEND\s+/i, "");
    paperText.textContent = text || "";
    return;
  }
}

// ping (jak masz public_ping)
async function ping(){
  try { await sb().rpc("public_ping", { p_game_id: gameId, p_kind:"host", p_key:key }); } catch {}
}

document.addEventListener("DOMContentLoaded", ()=>{
  setFullscreenIcon();

  if (!gameId || !key) {
    paperText.textContent = "Zły link.";
    setHidden(true);
    return;
  }

  setHidden(false);
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});
