import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnHide = document.getElementById("btnHide");
const cover = document.getElementById("cover");

const qEl = document.getElementById("q");

function showCover(on){ cover.style.display = on ? "" : "none"; }
btnHide.addEventListener("click", () => showCover(true));
cover.addEventListener("click", () => showCover(false));

function setText(t){
  qEl.textContent = String(t ?? "");
}

function parseQuoted(str){
  // TEXT "...." (z obsługą \n)
  const m = str.match(/^TEXT\s+"([\s\S]*)"\s*$/i);
  if (!m) return null;
  return m[1]
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"');
}

function handleCommand(line){
  const s = String(line || "").trim();
  if (!s) return;

  const v = parseQuoted(s);
  if (v !== null) {
    setText(v);
    return;
  }

  if (s.toUpperCase() === "HIDE") return showCover(true);
  if (s.toUpperCase() === "SHOW") return showCover(false);
  if (s.toUpperCase() === "CLEAR") return setText("");

  console.warn("[host] unknown cmd:", s);
}

function subscribeCommands(){
  const ch = sb()
    .channel(`familiada-host:${gameId}`)
    .on("broadcast", { event:"CMD" }, (payload) => {
      handleCommand(payload?.payload?.line);
    })
    .subscribe();

  return () => sb().removeChannel(ch);
}

async function ping(){
  try { await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "host", p_key: key }); } catch {}
}

/* swipe góra/dół bez scrolla */
let y0 = null;
let lastToggleAt = 0;

function onTouchStart(e){
  if (!e.touches?.length) return;
  y0 = e.touches[0].clientY;
}
function onTouchMove(e){
  // blokuj przewijanie
  e.preventDefault();
}
function onTouchEnd(e){
  if (y0 == null) return;
  const y1 = (e.changedTouches?.[0]?.clientY ?? y0);
  const dy = y1 - y0; // + w dół
  y0 = null;

  const now = Date.now();
  if (now - lastToggleAt < 500) return;

  if (dy > 80) { // swipe w dół => ukryj
    showCover(true);
    lastToggleAt = now;
  } else if (dy < -80) { // swipe w górę => pokaż
    showCover(false);
    lastToggleAt = now;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!gameId || !key) { setText("Zły link."); return; }

  // start
  setText("Ładuję…");
  subscribeCommands();
  ping();
  setInterval(ping, 5000);

  // blok scroll / pull-to-refresh
  document.addEventListener("touchstart", onTouchStart, { passive:false });
  document.addEventListener("touchmove", onTouchMove, { passive:false });
  document.addEventListener("touchend", onTouchEnd, { passive:false });

  // debug:
  window.handleCommand = handleCommand;
});
