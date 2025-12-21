import { sb } from "../core/supabase.js";


// blokuj pinch-zoom (iOS Safari)
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });

// blokuj double-tap zoom
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 250) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// opcjonalnie: blokuj też multi-touch w ogóle (żeby 2 palce nie robiły “akcji”)
document.addEventListener("touchstart", (e) => {
  if (e.touches && e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener("touchmove", (e) => {
  if (e.touches && e.touches.length > 1) e.preventDefault();
}, { passive: false });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

const offScreen = document.getElementById("offScreen");
const arena = document.getElementById("arena");
const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");

const STATE = {
  OFF: "OFF",
  ON: "ON",
  PUSHED_A: "PUSHED_A",
  PUSHED_B: "PUSHED_B",
};

let cur = STATE.OFF;

// ---------- fullscreen ----------
function setFullscreenIcon() {
  // ⧉ = “dwa nałożone”, ▢ = “jeden”
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

// ---------- UI ----------
function show(state) {
  cur = state;

  const isOff = state === STATE.OFF;

  // OFF = czarny ekran, nic więcej
  offScreen.hidden = !isOff;
  arena.hidden = isOff;
  
  arena.style.pointerEvents = isOff ? "none" : "";
  arena.style.visibility    = isOff ? "hidden" : "visible";
  
  // reset klas
  btnA.classList.remove("lit", "dim");
  btnB.classList.remove("lit", "dim");

  if (isOff) {
    btnA.disabled = true;
    btnB.disabled = true;
    return;
  }

  if (state === STATE.ON) {
    btnA.disabled = false;
    btnB.disabled = false;
    btnA.classList.add("dim");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_A) {
    btnA.disabled = true;
    btnB.disabled = true;
    btnA.classList.add("lit");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_B) {
    btnA.disabled = true;
    btnB.disabled = true;
    btnB.classList.add("lit");
    btnA.classList.add("dim");
  }
}

// ---------- networking ----------
let ch = null;

function ensureChannel() {
  if (ch) return ch;
  ch = sb().channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (msg) => {
      const line = String(msg?.payload?.line ?? "").trim();
      handleCmd(line);
    })
    .subscribe();
  return ch;
}

async function ping() {
  try {
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "buzzer", p_key: key });
  } catch {}
}

async function sendClick(team) {
  // docelowo możesz to podpiąć do RPC buzzer_press,
  // a na razie broadcast do control jest OK do testów
  try {
    const ctl = sb().channel(`familiada-control:${gameId}`).subscribe();
    await ctl.send({
      type: "broadcast",
      event: "BUZZER_EVT",
      payload: { line: `CLICK ${team}` },
    });
    sb().removeChannel(ctl);
  } catch {}
}

// ---------- commands ----------
function norm(line){
  return line.trim().toUpperCase();
}

function handleCmd(lineRaw) {
  const line = norm(lineRaw);

  if (line === "OFF")   { show(STATE.OFF); return; }
  if (line === "ON")    { show(STATE.ON); return; }

  // wymuszenie stanów (opcjonalne)
  if (line === "PUSHED A" || line === "PUSHED_A") { show(STATE.PUSHED_A); return; }
  if (line === "PUSHED B" || line === "PUSHED_B") { show(STATE.PUSHED_B); return; }
}

// ---------- input ----------
async function press(team) {
  if (cur !== STATE.ON) return;

  // natychmiast lokalnie
  show(team === "A" ? STATE.PUSHED_A : STATE.PUSHED_B);

  await sendClick(team);
}
e.preventDefault

btnA.addEventListener("touchstart", (e) => press("A", e), { passive: false });
btnB.addEventListener("touchstart", (e) => press("B", e), { passive: false });
btnA.addEventListener("click", () => press("A"));
btnB.addEventListener("click", () => press("B"));

// fullscreen
btnFS.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});

document.addEventListener("fullscreenchange", setFullscreenIcon);

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();

  if (!gameId || !key) {
    show(STATE.OFF);
    return;
  }

  // domyślnie OFF
  show(STATE.OFF);

  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

// debug (opcjonalnie)
window.__buzzer = { show, STATE };
