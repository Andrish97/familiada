import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnFS = document.getElementById("btnFS");
const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");

const off = document.getElementById("off");

let localMode = "ON"; // ON | OFF

function setFsIcon(){
  const on = !!document.fullscreenElement;
  btnFS.textContent = on ? "⧉" : "▢";
  btnFS.setAttribute("aria-label", on ? "Wyjdź z pełnego ekranu" : "Pełny ekran");
}

btnFS.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});
document.addEventListener("fullscreenchange", setFsIcon);

function blockScrollAndRefresh(){
  window.addEventListener("wheel", (e) => e.preventDefault(), { passive:false });
  window.addEventListener("touchmove", (e) => e.preventDefault(), { passive:false });
}

function setMode(m){
  localMode = (m || "").toUpperCase() === "OFF" ? "OFF" : "ON";
  off.classList.toggle("on", localMode === "OFF");
  applyEnabledState();
}

function applyEnabledState(ls){
  const locked = !!ls?.buzzer_locked;
  const winner = ls?.buzzer_winner || null;

  btnA.classList.toggle("winner", winner === "A");
  btnB.classList.toggle("winner", winner === "B");

  const enabled = (localMode === "ON") && !locked;
  btnA.disabled = !enabled;
  btnB.disabled = !enabled;
}

async function ping(){
  try {
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "buzzer", p_key: key });
  } catch {}
}

async function readState(){
  try {
    const { data } = await sb()
      .from("live_state")
      .select("buzzer_locked,buzzer_winner")
      .eq("game_id", gameId)
      .single();
    applyEnabledState(data);
  } catch {}
}

async function press(team){
  if (btnA.disabled || btnB.disabled) return;

  try {
    const res = await sb().rpc("buzzer_press", { p_game_id: gameId, p_key: key, p_team: team });
    const accepted = !!res.data?.accepted;
    if (!accepted) return;
  } catch {}
}

function subLive(){
  const ch = sb()
    .channel(`buzzer_live:${gameId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      (payload) => applyEnabledState(payload.new)
    )
    .subscribe();

  return () => sb().removeChannel(ch);
}

/** Komendy z control: familliada-buzzer:${id} event BUZZER_CMD payload {line} */
function installBuzzerCommands(){
  const ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, async (payload) => {
      const line = String(payload?.payload?.line || "").trim().toUpperCase();

      if (line === "OFF" || line === "MODE OFF") { setMode("OFF"); return; }
      if (line === "ON"  || line === "MODE ON")  { setMode("ON");  await readState(); return; }
      if (line === "RESET") { await readState(); return; }
    })
    .subscribe();

  return () => sb().removeChannel(ch);
}

btnA.addEventListener("click", () => press("A"));
btnB.addEventListener("click", () => press("B"));

window.addEventListener("beforeunload", (e) => {
  e.preventDefault();
  e.returnValue = "";
});

document.addEventListener("DOMContentLoaded", async () => {
  setFsIcon();
  blockScrollAndRefresh();

  if (!gameId || !key) {
    setMode("OFF");
    btnA.disabled = true;
    btnB.disabled = true;
    return;
  }

  installBuzzerCommands();
  subLive();

  await readState();
  await ping();
  setInterval(ping, 5000);
});
