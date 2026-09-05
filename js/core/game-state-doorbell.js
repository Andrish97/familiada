// js/core/game-state-doorbell.js
// Nazwa kanału + wysyłka "dzwonka" broadcastowego {rev} — wydzielone, żeby
// nie duplikować konwencji nazwy kanału w kilku miejscach. KAŻDY zapis do
// public.game_state musi zadzwonić, nie tylko te z control2/js/store.js:
// game_state_buzzer_press (wołane bezpośrednio przez Buzzer, z pominięciem
// store.js) też jest realnym zapisem, który inne urządzenia muszą zauważyć
// — brak tego dzwonka był realną luką, znalezioną dopiero przez
// control2-full-game.spec.js na żywo (Control nigdy nie widział wciśnięcia
// Buzzera, bo nic nie ringDoorbell'owało po tamtej stronie).

import { rt } from "./realtime.js?v=v2026-09-05T00002";

export function doorbellTopic(gameId) {
  return `familiada-state:${gameId}`;
}

export function ringDoorbell(gameId, rev) {
  return rt(doorbellTopic(gameId))
    .sendBroadcast("rev", { rev }, { mode: "http" })
    .catch(() => {});
}
