import { sb } from "../core/supabase.js";
import { startSnapshotPoll } from "../core/realtime.js";

const $ = (s) => document.querySelector(s);

const status = $("#status");
const hint = $("#hint");
const bigBtn = $("#bigBtn");

function qsParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

const gameId = qsParam("id");
const key = qsParam("key");

let team = null;
let live = null;

function setStatus(m){ status.textContent = m; }

function setTeam(t){
  team = t;
  document.querySelectorAll("[data-team]").forEach(b => b.classList.toggle("on", b.dataset.team === t));
  bigBtn.disabled = !team;
}

document.addEventListener("DOMContentLoaded", () => {
  if (!gameId || !key) {
    setStatus("Brak parametrów: buzzer.html?id=...&key=...");
    return;
  }

  document.querySelectorAll("[data-team]").forEach(btn => {
    btn.addEventListener("click", () => setTeam(btn.dataset.team));
  });

  // podgląd stanu buzzera
  startSnapshotPoll({
    gameId,
    key: key,     // tu klucz BUZZERA, snapshot i tak jest publiczny przez display/remote,
    kind: "display", // użyjemy display-snapshot do samego “live”; key tu nie pasuje
    intervalMs: 350,
    onData(data){
      live = data?.live || {};
      if (live?.buzzer_locked) {
        bigBtn.disabled = true;
        hint.textContent = `Zablokowane. Wygrał: ${live.buzzer_winner || "?"}`;
      } else {
        bigBtn.disabled = !team;
        hint.textContent = team ? `Gotowe: Zespół ${team}.` : "Wybierz zespół, potem kliknij.";
      }
      setStatus("Na żywo ✔");
    },
    onError(e){
      console.error(e);
      setStatus("Błąd: " + (e?.message || String(e)));
    }
  });

  // naciśnięcie buzzera
  bigBtn.addEventListener("click", async () => {
    if (!team) return;
    try {
      const { data, error } = await sb().rpc("buzzer_press", {
        p_game_id: gameId,
        p_key: key,
        p_team: team
      });
      if (error) throw error;

      if (data?.accepted) {
        hint.textContent = "✔ ZŁAPANE!";
      } else {
        hint.textContent = `Za późno. Wygrał: ${data?.winner || "?"}`;
      }
    } catch (e) {
      console.error(e);
      hint.textContent = "Błąd wysyłania.";
    }
  });

  // Fullscreen na tap
  document.body.addEventListener("dblclick", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });
});
