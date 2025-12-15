import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("game");
const key = qs.get("key");

const $ = (s) => document.querySelector(s);

const ui = {
  status: $(".bz-status"),
  btnA: $(".bz-a"),
  btnB: $(".bz-b"),
  live: $(".bz-live"),
  err: $(".bz-error"),
};

let client = null;
let locked = false;

function setError(msg) {
  ui.err.textContent = msg || "";
}
function setStatus(msg) {
  ui.status.textContent = msg || "";
}
function setLocked(on, winner) {
  locked = !!on;
  ui.btnA.disabled = locked;
  ui.btnB.disabled = locked;
  setStatus(locked ? `Zablokowane – pierwszy: ${winner || "?"}` : "Gotowe – naciśnij A lub B");
}

async function rpc(name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}

async function hello() {
  try {
    await rpc("buzzer_hello", { p_game_id: gameId, p_key: key });
  } catch (e) {
    console.warn("[buzzer] buzzer_hello error:", e?.message || e);
  }
}

async function press(team) {
  if (locked) return;
  try {
    setError("");
    setStatus("Wysyłam…");

    const res = await rpc("buzzer_press", {
      p_game_id: gameId,
      p_key: key,
      p_team: team,
    });

    if (res?.accepted) setLocked(true, res?.winner || team);
    else setLocked(true, res?.winner || "?");
  } catch (e) {
    console.error(e);
    setError(e?.message || "Błąd buzzera.");
    setStatus("Błąd");
  }
}

async function main() {
  if (!gameId || !key) {
    setError("Brak parametrów URL (game/key).");
    setStatus("Błąd");
    return;
  }

  client = sb();

  ui.btnA.addEventListener("click", () => press("A"));
  ui.btnB.addEventListener("click", () => press("B"));

  setLocked(false);
  await hello();
  setInterval(hello, 15000);

  ui.live.textContent = "Połączono";
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    setError(e?.message || "Błąd krytyczny.");
  });
});
