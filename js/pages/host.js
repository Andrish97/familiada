// js/pages/host.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const page = document.getElementById("page");
const hiddenStage = document.getElementById("hiddenStage");

const qEl = document.getElementById("q");
const pull = document.getElementById("pull");
const pullHint = document.getElementById("pullHint");

const btnFS = document.getElementById("btnFS");

let isHidden = false;

// ===== Fullscreen (stan + ikonka) =====
function syncFSBtn(){
  const on = !!document.fullscreenElement;
  btnFS.classList.toggle("isOn", on);
  btnFS.textContent = on ? "⤫" : "⛶";
  btnFS.title = on ? "Wyjdź z pełnego ekranu" : "Pełny ekran";
}

btnFS?.addEventListener("click", async () => {
  try{
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
});
document.addEventListener("fullscreenchange", syncFSBtn);

// ===== Ukrywanie/pokazywanie =====
function setHidden(on){
  isHidden = !!on;

  page.classList.toggle("hidden", isHidden);
  hiddenStage.classList.toggle("on", isHidden);

  // hint tekstowy (opcjonalnie)
  if (pullHint) pullHint.textContent = isHidden
    ? "Pociągnij z dołu, aby pokazać"
    : "Pociągnij w górę / dół, aby ukryć / pokazać";
}

// drag tylko “na dole” (i na hiddenStage też)
function attachPullGesture(el){
  if (!el) return;

  let dragging = false;
  let startY = 0;
  let lastY = 0;

  const TH = 80; // próg przełączenia

  const onDown = (e) => {
    dragging = true;
    startY = (e.touches?.[0]?.clientY ?? e.clientY);
    lastY = startY;
    try { el.setPointerCapture?.(e.pointerId); } catch {}
  };

  const onMove = (e) => {
    if (!dragging) return;
    lastY = (e.touches?.[0]?.clientY ?? e.clientY);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;

    const dy = lastY - startY;

    // dy>0 = ruch w dół
    // dy<0 = ruch w górę
    if (!isHidden && dy < -TH) setHidden(true);   // schowaj “do góry”
    if (isHidden && dy > TH) setHidden(false);    // pokaż “z dołu”
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);

  // touch fallback (niektóre webview)
  el.addEventListener("touchstart", onDown, { passive: true });
  el.addEventListener("touchmove", onMove, { passive: true });
  el.addEventListener("touchend", onUp);
}

attachPullGesture(pull);
attachPullGesture(hiddenStage);

// ===== Komendy “ładne” (opcjonalnie) =====
// TEXT "...."  -> ustawia treść kartki
// HIDE / SHOW  -> ukrywa/pokazuje
function parseQuoted(s){
  const m = String(s).match(/"([\s\S]*)"/);
  return m ? m[1] : "";
}

function handleHostCommand(line){
  const l = String(line || "").trim();
  const up = l.toUpperCase();

  if (up === "HIDE") { setHidden(true); return; }
  if (up === "SHOW") { setHidden(false); return; }
  if (up.startsWith("TEXT ")) {
    const t = parseQuoted(l);
    qEl.textContent = t;
    return;
  }
}

// ===== Ping + dane =====
async function ping() {
  try {
    // Jeśli masz public_ping sprawdzające key, to zostawiamy:
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "host", p_key: key });
  } catch {}
}

async function loadSnapshot() {
  try {
    const { data } = await sb().rpc("get_public_snapshot", {
      p_game_id: gameId,
      p_kind: "host",
      p_key: key,
    });

    // Jeśli snapshot ma “question.text” -> wpisujemy na kartkę
    const q = data?.question?.text ?? "";
    qEl.textContent = String(q);
  } catch {
    // nie wywalajmy błędami, po prostu nic
  }
}

// ===== Subskrypcje =====
function subLiveRefresh(){
  // odśwież po zmianie live_state (tak jak wcześniej)
  const ch = sb()
    .channel(`host_live:${gameId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      () => loadSnapshot()
    )
    .subscribe();

  return () => sb().removeChannel(ch);
}

function subHostCommands(){
  // kanał komend dla hosta (control -> host)
  const ch = sb()
    .channel(`familiada-host:${gameId}`)
    .on("broadcast", { event: "HOST_CMD" }, (payload) => {
      const line = payload?.payload?.line ?? payload?.payload ?? payload?.line;
      if (line) handleHostCommand(line);
    })
    .subscribe();

  return () => sb().removeChannel(ch);
}

document.addEventListener("DOMContentLoaded", async () => {
  syncFSBtn();

  if (!gameId || !key) {
    qEl.textContent = "";
    return;
  }

  // start: pusta kartka (bez “Ładuję…”)
  qEl.textContent = "";

  // bazowo: snapshot + sub live
  await loadSnapshot();
  subLiveRefresh();

  // komendy (jeśli w control będziesz wysyłał)
  subHostCommands();

  // ping do “pillHost OK”
  ping();
  setInterval(ping, 5000);

  // start: pokazane
  setHidden(false);
});
