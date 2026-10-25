// js/core/game-state-doorbell.js
// Nazwa kanału + wysyłka "dzwonka" broadcastowego {rev} — wydzielone, żeby
// nie duplikować konwencji nazwy kanału w kilku miejscach. KAŻDY zapis do
// public.game_state musi zadzwonić, nie tylko te z control/js/store.js:
// game_state_buzzer_press (wołane bezpośrednio przez Buzzer, z pominięciem
// store.js) też jest realnym zapisem, który inne urządzenia muszą zauważyć
// — brak tego dzwonka był realną luką, znalezioną dopiero przez
// control2-full-game.spec.js na żywo (Control nigdy nie widział wciśnięcia
// Buzzera, bo nic nie ringDoorbell'owało po tamtej stronie).

import { rt } from "./realtime.js?v=v2026-10-25T19434";

let onDoorbellSent = null;

// Control installs a lightweight observer so its revision can be correlated
// with the device-side receipt/fallback diagnostics. Other devices leave it
// unset; the broadcast payload remains unchanged.
export function setDoorbellObserver(observer) {
  onDoorbellSent = typeof observer === "function" ? observer : null;
  return () => { if (onDoorbellSent === observer) onDoorbellSent = null; };
}


export function doorbellTopic(gameId) {
  return `familiada-state:${gameId}`;
}

export function ringDoorbell(gameId, rev) {
  try { onDoorbellSent?.({ gameId, revision: rev, client_time_ms: Date.now() }); } catch { /* diagnostics never block gameplay */ }
  return rt(doorbellTopic(gameId))
    .sendBroadcast("rev", { rev }, { mode: "http" })
    .catch(() => {});
}
