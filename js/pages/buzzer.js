import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnFS = document.getElementById("btnFS");
const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");
const off = document.getElementById("off");

let isOff = false;

function setOff(on){
  isOff = !!on;
  off.classList.toggle("on", isOff);
  off.setAttribute("aria-hidden", isOff ? "false" : "true");
  btnA.disabled = isOff || btnA.disabled; // nie “odblokowujemy” tu logiki gry
  btnB.disabled = isOff || btnB.disabled;
}

function applyState(ls) {
  const locked = !!ls?.buzzer_locked;
  const winner = ls?.buzzer_winner || null;

  btnA.classList.toggle("winner", winner === "A");
  btnB.classList.toggle("winner", winner === "B");

  btnA.classList.toggle("loser", !!winner && winner !== "A");
  btnB.classList.toggle("loser", !!winner && winner !== "B");

  btnA.disabled = isOff || locked;
  btnB.disabled = isOff || locked;
}

async function ping() {
  try {
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "buzzer", p_key: key });
  } catch {}
}

async function press(team) {
  if (isOff) return;
  if (btnA.disabled || btnB.disabled) return;

  try {
    await sb().rpc("buzzer_press", { p_game_id: gameId, p_key: key, p_team: team });
  } catch {}
}

function subLive() {
  const ch = sb()
    .channel(`buzzer_live:${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      (payload) => applyState(payload.new)
    )
    .subscribe();

  return () => sb().removeChannel(ch);
}

/* fullscreen */
async function syncFSIcon(){
  btnFS?.classList.toggle("on", !!document.fullscreenElement);
}
btnFS?.addEventListener("click", async () => {
  try{
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
  syncFSIcon();
});
document.addEventListener("fullscreenchange", syncFSIcon);

btnA.addEventListener("click", () => press("A"));
btnB.addEventListener("click", () => press("B"));

document.addEventListener("DOMContentLoaded", async () => {
  syncFSIcon();

  if (!gameId || !key) {
    setOff(true);
    return;
  }

  // start: ON (czyli normalny ekran)
  setOff(false);

  // stan startowy z live_state
  try {
    const { data } = await sb()
      .from("live_state")
      .select("buzzer_locked,buzzer_winner")
      .eq("game_id", gameId)
      .single();
    applyState(data);
  } catch {}

  subLive();

  ping();
  setInterval(ping, 5000);

  // (opcjonalnie) do testów w konsoli:
  window.__buzzer = { setOff };
});
