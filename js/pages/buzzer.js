// js/pages/buzzer.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const dot = document.getElementById("dot");
const txt = document.getElementById("txt");
const btnFS = document.getElementById("btnFS");

const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");

function setStatus(ok, t) {
  dot.style.background = ok ? "#22e06f" : "#ff6b6b";
  txt.textContent = t;
}

function applyState(ls) {
  const locked = !!ls?.buzzer_locked;
  const winner = ls?.buzzer_winner || null;

  // “gaśnie” zwycięzca (Ty masz klasę .winner – możesz w CSS zrobić np. opacity: .25)
  btnA.classList.toggle("winner", winner === "A");
  btnB.classList.toggle("winner", winner === "B");

  btnA.disabled = locked;
  btnB.disabled = locked;

  setStatus(true, locked ? (winner ? `Wygrywa: ${winner}` : "Zablokowane") : "Gotowe");
}

async function ping() {
  try {
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "buzzer", p_key: key });
  } catch {
    setStatus(false, "Brak połączenia");
  }
}

async function press(team) {
  // jeśli już zablokowane, nie rób nic
  if (btnA.disabled || btnB.disabled) return;

  try {
    const res = await sb().rpc("buzzer_press", { p_game_id: gameId, p_key: key, p_team: team });
    const accepted = !!res.data?.accepted;

    if (accepted) setStatus(true, "Zgłoszono!");
    else setStatus(true, "Za późno");
  } catch {
    setStatus(false, "Błąd");
  }
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

btnA.addEventListener("click", () => press("A"));
btnB.addEventListener("click", () => press("B"));

btnFS.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});

window.addEventListener("beforeunload", (e) => {
  e.preventDefault();
  e.returnValue = "";
});

document.addEventListener("DOMContentLoaded", async () => {
  if (!gameId || !key) {
    setStatus(false, "Zły link");
    btnA.disabled = true;
    btnB.disabled = true;
    return;
  }

  // stan startowy z live_state
  try {
    const { data } = await sb().from("live_state").select("buzzer_locked,buzzer_winner").eq("game_id", gameId).single();
    applyState(data);
  } catch {}

  subLive();

  ping();
  setInterval(ping, 5000);
});
