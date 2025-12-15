import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("game");
const kind = qs.get("kind") || "remote";
const key = qs.get("key");

const $ = (s) => document.querySelector(s);

const ui = {
  btnToggle: $(".host-toggle"),
  game: $(".host-game"),
  phase: $(".host-phase"),
  q: $(".host-question"),
  live: $(".host-live"),
  err: $(".host-error"),
  timerVal: $(".host-timer-val"),
};

let hidden = false;
let client = null;

function setError(msg) {
  ui.err.textContent = msg || "";
}

function fmtPhase(phase) {
  if (!phase) return "—";
  if (phase === "idle") return "Gotowość";
  if (phase === "round") return "Runda";
  if (phase === "final") return "Finał";
  if (phase === "ended") return "Koniec";
  return phase;
}

async function rpc(name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}

function setHidden(on) {
  hidden = !!on;
  document.body.classList.toggle("host-hidden-mode", hidden);
  ui.btnToggle.textContent = hidden ? "POKAŻ" : "UKRYJ";
}

function applySnapshot(snap) {
  const g = snap?.game;
  const ls = snap?.live;
  const q = snap?.question;

  ui.game.textContent = `Gra: ${g?.name || "—"}`;
  ui.phase.textContent = `Stan: ${fmtPhase(ls?.phase)}`;
  ui.q.textContent = q?.text || "Czekam na start…";

  const t = typeof ls?.timer_seconds_left === "number" ? ls.timer_seconds_left : null;
  ui.timerVal.textContent = t === null ? "—" : `${t}s`;

  ui.live.textContent = ls?.updated_at
    ? `Aktualizacja: ${new Date(ls.updated_at).toLocaleTimeString()}`
    : "";
}

async function hello() {
  try {
    await rpc("host_hello", { p_game_id: gameId, p_key: key });
  } catch (e) {
    // jeśli nie masz host_hello jeszcze, to po prostu nie będzie blokady startu
    // (ale Ty chcesz blokadę, więc to warto mieć)
    console.warn("[host] host_hello error:", e?.message || e);
  }
}

async function poll() {
  const snap = await rpc("get_public_snapshot", {
    p_game_id: gameId,
    p_kind: kind,
    p_key: key,
  });
  applySnapshot(snap);
}

async function main() {
  if (!gameId || !key) {
    setError("Brak parametrów URL (game/key).");
    return;
  }

  client = sb();

  ui.btnToggle.addEventListener("click", () => setHidden(!hidden));

  await hello();
  await poll();

  setInterval(poll, 600);
  setInterval(hello, 15000);
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    setError(e?.message || "Błąd krytyczny.");
  });
});
