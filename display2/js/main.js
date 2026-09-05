// display2/js/main.js
// Punkt wejścia Display v2. Napisane od zera (nie kopia display/js/main.js)
// — inna orkiestracja: zamiast kanału komend + snapshotu z device_state,
// jest jedno wywołanie RPC na start (game_state_get, przez subscribe.js)
// i "dzwonek" broadcastowy zamiast kanału DISPLAY_CMD. Ping obecności
// (device_ping) i walidacja klucza (display_auth) to te same, generyczne,
// niezwiązane z komendami RPC co dziś — reużyte bez zmian.

import { initFullscreenButton } from "../../display/js/fullscreen.js?v=v2026-09-05T07201";
import { initI18n } from "../../translation/translation.js?v=v2026-09-05T07201";
import { startKeepAlive } from "../../js/core/keep-alive.js?v=v2026-09-05T07201";
import { sb } from "../../js/core/supabase.js?v=v2026-09-05T07201";
import { createScene } from "./scene.js?v=v2026-09-05T07201";
import { createQRController } from "./qr.js?v=v2026-09-05T07201";
import { createSubscription } from "../../js/core/game-state-subscribe.js?v=v2026-09-05T07201";
import { createRenderer } from "./render.js?v=v2026-09-05T07201";

startKeepAlive();

const $ = (id) => document.getElementById(id);

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "" };
}

async function authDisplayOrThrow(gameId, key) {
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");
  const { data, error } = await sb().rpc("display_auth", { p_game_id: gameId, p_key: key });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Zły klucz (display) albo gra nie istnieje.");
  return row;
}

function startPresenceHeartbeat({ gameId, key }, pingMs = 3000) {
  const DEVICE_ID_KEY = "familiada:deviceId:display";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
  const ping = async () => {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId, p_device_type: "display", p_key: key, p_device_id: deviceId, p_meta: {},
    });
    if (!error && data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  };
  ping();
  setInterval(ping, pingMs);
}

function showBlack() {
  $("blackScreen")?.classList.remove("hidden");
  $("qrScreen")?.classList.add("hidden");
  $("gameScreen")?.classList.add("hidden");
}

window.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: false });
  initFullscreenButton();

  try {
    const { gameId, key } = parseParams();
    const game = await authDisplayOrThrow(gameId, key);
    startPresenceHeartbeat({ gameId: game.id, key });

    const scene = await createScene();
    const qrCtrl = createQRController({
      qrScreen: $("qrScreen"), gameScreen: $("gameScreen"),
      hostCard: $("qrHostCard"), buzzerCard: $("qrBuzzerCard"),
      hostImg: $("qrHostImg"), buzzerImg: $("qrBuzzerImg"),
      hostCodeEl: $("qrHostCode"), buzzerCodeEl: $("qrBuzzerCode"),
    });
    await scene.api.logo.bindGame?.(game.id);

    // Host/buzzer NIEZALEŻNE — jeden LUB oba naraz (plan, korekta po
    // feedbacku: pierwszy przebieg pokazywał tylko jeden na raz, źle).
    const qr = {
      show(qrDetail) {
        $("blackScreen")?.classList.add("hidden");
        const host = qrDetail?.host || {};
        const buzzer = qrDetail?.buzzer || {};
        qrCtrl.setHost(host.show ? host.url || "" : "");
        qrCtrl.setHostCode(host.show ? host.code || "" : "");
        qrCtrl.setBuzzer(buzzer.show ? buzzer.url || "" : "");
        qrCtrl.setBuzzerCode(buzzer.show ? buzzer.code || "" : "");
        qrCtrl.setSingle(!!host.show !== !!buzzer.show);
        qrCtrl.show();
      },
      hide() {
        qrCtrl.hide();
      },
    };

    const renderer = createRenderer({ scene, qr });
    let prevRow = null;

    const subscription = createSubscription({
      gameId: game.id,
      deviceType: "display",
      key,
      onRow: (row) => {
        // Widoczność kontenerów zależy wyłącznie od trybu — samo malowanie
        // planszy/QR/czarnego to render.js.
        const mode = row.detail?.display?.mode || "BLACK";
        if (mode === "GAME") {
          $("blackScreen")?.classList.add("hidden");
          $("qrScreen")?.classList.add("hidden");
          $("gameScreen")?.classList.remove("hidden");
        } else if (mode === "QR") {
          $("gameScreen")?.classList.add("hidden");
        } else {
          $("qrScreen")?.classList.add("hidden");
          $("gameScreen")?.classList.add("hidden");
          $("blackScreen")?.classList.remove("hidden");
        }

        if (!prevRow) renderer.renderSnapshot(row);
        else renderer.renderDiff(prevRow, row);
        prevRow = row;
      },
      onError: (error) => {
        console.warn("[display2] game_state_get failed:", error);
        showBlack();
      },
    });

    document.documentElement.classList.remove("page-loading");
    await subscription.start();
  } catch (e) {
    console.warn("[display2]", e?.message || e);
    showBlack();
  }
});
