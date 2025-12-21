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
    ? "Podwójne dotknięcie aby odsłonić"
    : "Podwójne dotknięcie aby zasłonić";
}

function setText(t){
  lastText = String(t ?? "");
  if (!hidden) paperText.textContent = lastText;
}

function clearText(){
  lastText = "";
  if (!hidden) paperText.textContent = "";
}

// ---------- double tap / double click ----------
const DOUBLE_MS = 320;
let lastTapAt = 0;

function yOK(y){
  const h = window.innerHeight || 1;
  return (y > 70) && (y < h - 70);
}

function toggleCover(){
  if (hidden) {
    setHidden(false);
    paperText.textContent = lastText;
  } else {
    setHidden(true);
  }
}

function handleTap(y){
  if (!yOK(y)) return;

  const now = Date.now();
  if (now - lastTapAt <= DOUBLE_MS) {
    lastTapAt = 0;
    toggleCover();
  } else {
    lastTapAt = now;
  }
}

// touch: ignoruj multi-touch (pinch)
document.addEventListener("touchstart", (e)=>{
  if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
  const y = e.touches?.[0]?.clientY ?? 0;
  handleTap(y);
}, { passive:false });

// desktop: double click
document.addEventListener("dblclick", (e)=>{
  handleTap(e.clientY);
});

// blokuj ctrl+scroll zoom (desktop)
document.addEventListener("wheel", (e)=>{
  if (e.ctrlKey) e.preventDefault();
}, { passive:false });

// ---------- commands ----------
function norm(s){ return String(s ?? "").trim(); }

function handleCmd(lineRaw){
  const line = norm(lineRaw);
  const up = line.toUpperCase();

  if (up === "OFF") { setHidden(true); return; }
  if (up === "ON")  { setHidden(false); paperText.textContent = lastText; return; }

  if (/^SET\b/i.test(line)){
    const m = line.match(/^SET\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : line.replace(/^SET\s+/i, "");
    setText(text);
    return;
  }

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
  try { await sb().rpc("device_ping", { p_game_id: gameId, p_kind:"host", p_key:key }); } catch {}
}

async function loadSnapshot(){
  try{
    const { data } = await sb().rpc("get_device_snapshot", {
      p_game_id: gameId,
      p_kind: "host",
      p_key: key,
    });

    const d = data?.devices || {};
    setHidden(!!d.host_hidden);
    if (!d.host_hidden) {
      lastText = String(d.host_text ?? "");
      paperText.textContent = lastText;
    } else {
      lastText = String(d.host_text ?? "");
      paperText.textContent = "";
    }
    hint.textContent = String(d.host_hint ?? hint.textContent);
  } catch {
    // jak snapshot padnie: zostaw jak jest
  }
}

document.addEventListener("DOMContentLoaded", async ()=>{
  setFullscreenIcon();
  paperText.textContent = "";

  if (!gameId || !key){
    setHidden(true);
    return;
  }

  setHidden(false);
  ensureChannel();

  await loadSnapshot();  // <-- ODTWÓRZ stan po odświeżeniu

  ping();
  setInterval(ping, 5000);
});

// debug
window.__host = { setHidden, setText, clearText, handleCmd };
