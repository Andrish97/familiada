import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText = document.getElementById("paperText");
const hint = document.getElementById("hint");

const blank = document.getElementById("blank");
const blankHint = document.getElementById("blankHint");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

let lastText = "";
let hidden = false;

// ---------- fullscreen ----------
function setFullscreenIcon(){
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

// ---------- hide / reveal ----------
function setHidden(on){
  hidden = !!on;
  blank.hidden = !hidden;

  if (hidden) {
    hint.textContent = "";
    blankHint.textContent = "Przeciągnij w górę aby odsłonić";
  } else {
    hint.textContent = "Przeciągnij w dół żeby zasłonić";
  }
}

// ---------- gesture (Pointer Events - stabilne na iOS) ----------
let pid = null;
let startY = 0;
let startOK = false;

function yOK(y){
  const h = window.innerHeight || 1;
  return (y > 70) && (y < h - 70);
}

function onPointerDown(e){
  // tylko jeden “palec/mysz” naraz
  if (pid !== null) return;
  pid = e.pointerId;
  startY = e.clientY;
  startOK = yOK(startY);

  // ważne: przejmij kontrolę nad pointerem
  try { document.body.setPointerCapture(pid); } catch {}
}

function onPointerUp(e){
  if (pid === null || e.pointerId !== pid) return;

  const endY = e.clientY;
  const dy = endY - startY;

  if (startOK) {
    if (!hidden && dy > 70) setHidden(true);        // ↓ zasłoń
    else if (hidden && dy < -70) setHidden(false);  // ↑ odsłoń
  }

  pid = null;
  startOK = false;
}

document.addEventListener("pointerdown", onPointerDown, { passive:false });
document.addEventListener("pointerup", onPointerUp, { passive:true });
document.addEventListener("pointercancel", () => { pid = null; startOK = false; }, { passive:true });

// ---------- commands ----------
function norm(s){ return String(s ?? "").trim(); }

function handleCmd(line){
  const raw = norm(line);
  const up = raw.toUpperCase();

  // OFF/ON = zasłoń/odsłoń
  if (up === "OFF") { setHidden(true); return; }
  if (up === "ON")  { setHidden(false); return; }

  // SET "tekst" / CLEAR
  if (up === "CLEAR") {
    lastText = "";
    paperText.textContent = "";
    return;
  }

  if (/^SET\b/i.test(raw)) {
    const m = raw.match(/^SET\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : raw.replace(/^SET\s+/i, "");
    lastText = text || "";
    paperText.textContent = lastText;
    return;
  }

  // kompatybilnie z wcześniejszym SEND
  if (/^SEND\b/i.test(raw)) {
    const m = raw.match(/^SEND\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : raw.replace(/^SEND\s+/i, "");
    lastText = text || "";
    paperText.textContent = lastText;
    return;
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

// fullscreen
btnFS.addEventListener("click", async () => {
  try{
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
});
document.addEventListener("fullscreenchange", setFullscreenIcon);

document.addEventListener("DOMContentLoaded", ()=>{
  setFullscreenIcon();

  // start: bez “Ładuję…”
  paperText.textContent = "";
  lastText = "";

  if (!gameId || !key) {
    setHidden(true);
    return;
  }

  setHidden(false);
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

// debug
window.__host = { setHidden, handleCmd };
