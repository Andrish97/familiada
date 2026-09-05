// buzzer2/js/main.js
// Napisane od zera (nie kopia js/pages/buzzer.js). Wysyłka kliknięcia to
// najważniejsza różnica architektoniczna z całego planu (sekcja 1/4):
// zamiast broadcastu do Control ("BUZZER_EVT CLICK A", wyścig po stronie
// klienta), Buzzer sam woła atomowy RPC game_state_buzzer_press — pierwszy
// zapis wygrywa w bazie, drugi dostaje jawny błąd already_pressed. Trzy
// możliwe wyniki, wszystkie jawne dla kontestanta (plan, sekcja 4):
// sukces (przycisk pokazuje PUSHED_x od razu, przez applyRow), already_pressed
// (przycisk natychmiast pokazuje, kto był pierwszy, przez refetchNow —
// autorytatywny wiersz już to wie), błąd sieci (przycisk wraca do ON,
// można spróbować ponownie).

import { initI18n } from "../../translation/translation.js?v=v2026-09-05T07140";
import { startKeepAlive } from "../../js/core/keep-alive.js?v=v2026-09-05T07140";
import { sb } from "../../js/core/supabase.js?v=v2026-09-05T07140";
import { createSubscription } from "../../js/core/game-state-subscribe.js?v=v2026-09-05T07140";
import { createButtonRenderer, STATE, deriveButtonState } from "./render.js?v=v2026-09-05T07140";
import { ringDoorbell } from "../../js/core/game-state-doorbell.js?v=v2026-09-05T00002";

startKeepAlive();

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "" };
}

function startPresenceHeartbeat({ gameId, key }, pingMs = 3000) {
  const DEVICE_ID_KEY = "familiada:deviceId:buzzer";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
  const ping = async () => {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId, p_device_type: "buzzer", p_key: key, p_device_id: deviceId, p_meta: {},
    });
    if (!error && data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  };
  ping();
  setInterval(ping, pingMs);
}

function setupFullscreenButton() {
  const btn = document.getElementById("btnFS");
  const ico = document.getElementById("fsIco");
  function syncIcon() { if (ico) ico.textContent = document.fullscreenElement ? "⧉" : "▢"; }
  btn?.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    } catch {}
    syncIcon();
  });
  document.addEventListener("fullscreenchange", syncIcon);
}

async function main() {
  await initI18n({ withSwitcher: false });
  setupFullscreenButton();
  document.documentElement.classList.remove("page-loading");

  const { gameId, key } = parseParams();
  if (!gameId) return;

  const renderer = createButtonRenderer();
  let lastRow = null;

  const subscription = createSubscription({
    gameId, deviceType: "buzzer", key,
    onRow: (row) => { lastRow = row; renderer.render(row); },
    onError: (error) => console.warn("[buzzer2] game_state_get failed:", error),
  });

  async function press(team) {
    if (!lastRow || deriveButtonState(lastRow) !== STATE.ON) return;
    const { data, error } = await sb().rpc("game_state_buzzer_press", {
      p_game_id: gameId, p_key: key, p_team: team,
    });
    if (!error) {
      subscription.applyRow(data);
      lastRow = data;
      renderer.render(data);
      // game_state_buzzer_press idzie z pominięciem control2/js/store.js,
      // więc nic INNEGO nie zadzwoni dzwonkiem po tym zapisie — bez tego
      // Control (i Display/Host) nigdy by się nie dowiedzieli, że ktoś
      // nacisnął (znalezione na żywo przez control2-full-game.spec.js:
      // Buzzer widział własne wciśnięcie, ale Control — nie).
      ringDoorbell(gameId, data.rev);
      return;
    }
    if (String(error.message || "").includes("already_pressed")) {
      await subscription.refetchNow();
      return;
    }
    console.warn("[buzzer2] press failed, spróbuj ponownie:", error);
  }

  document.getElementById("btnA")?.addEventListener("click", () => press("A"));
  document.getElementById("btnB")?.addEventListener("click", () => press("B"));
  document.getElementById("btnA")?.addEventListener("touchstart", (e) => { e.preventDefault(); press("A"); }, { passive: false });
  document.getElementById("btnB")?.addEventListener("touchstart", (e) => { e.preventDefault(); press("B"); }, { passive: false });

  if (!key) return;
  startPresenceHeartbeat({ gameId, key });
  await subscription.start();
}

main();
