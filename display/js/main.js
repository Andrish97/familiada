import { initFullscreenButton } from "./fullscreen.js";
import { startPresence } from "./presence.js";
import { createQRController } from "./qr.js";
import { createScene } from "./scene.js";
import { createCommandHandler } from "./commands.js";

import { sb } from "../../js/core/supabase.js";

const $ = (id) => document.getElementById(id);

async function pingDisplay(gameId) {
  const now = new Date().toISOString();

  // upsert = działa nawet jeśli wiersza live_state jeszcze nie ma
  const { error } = await sb()
    .from("live_state")
    .upsert({ game_id: gameId, seen_display_at: now }, { onConflict: "game_id" });

  if (error) {
    console.warn("[display] ping failed", error);
  }
}

function parseParams() {
  const u = new URL(location.href);
  return {
    gameId: u.searchParams.get("id") || "",
    key: u.searchParams.get("key") || "",
  };
}

async function authDisplayOrThrow(gameId, key) {
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");

  const { data, error } = await sb().rpc("display_auth", {
    p_game_id: gameId,
    p_key: key,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Zły klucz (display) albo gra nie istnieje.");

  return row; // {id,name,kind,status}
}

window.addEventListener("DOMContentLoaded", async () => {
  initFullscreenButton();

  const blackScreen = $("blackScreen");
  const qrScreen = $("qrScreen");
  const gameScreen = $("gameScreen");

  const APP_MODES = {
    BLACK: "BLACK_SCREEN",
    GRA: "GRA",
    QR: "QR",
  };

  const showBlack = (msg) => {
    blackScreen?.classList.remove("hidden");
    qrScreen?.classList.add("hidden");
    gameScreen?.classList.add("hidden");
    if (msg) console.warn("[display]", msg);
  };

  try {
    // 0) AUTH
    const { gameId, key } = parseParams();
    const game = await authDisplayOrThrow(gameId, key);
    
    // ping od razu + co 5s
    await pingDisplay(game.id);
    setInterval(() => pingDisplay(game.id), 2000);
    
    // 1) presence (heartbeat)
    startPresence({
      channel: `familiada-display:${game.id}`,
      key: "familiada_display_alive",
    });

    // 2) QR controller
    const qr = createQRController({
      qrScreen: $("qrScreen"),
      gameScreen: $("gameScreen"),
      hostImg: $("qrHostImg"),
      buzzerImg: $("qrBuzzerImg"),
    });

    // 3) scena gry
    const scene = await createScene();

    const app = {
      mode: APP_MODES.BLACK,

      setMode(m) {
        let mm = (m ?? "").toString().toUpperCase();
        if (mm === "BLACK") mm = APP_MODES.BLACK;

        if (!Object.values(APP_MODES).includes(mm)) {
          throw new Error("Mode musi być BLACK_SCREEN / GRA / QR");
        }

        this.mode = mm;

        blackScreen?.classList.add("hidden");
        qrScreen?.classList.add("hidden");
        gameScreen?.classList.add("hidden");

        if (mm === APP_MODES.BLACK) {
          blackScreen?.classList.remove("hidden");
          return;
        }
        if (mm === APP_MODES.QR) {
          qrScreen?.classList.remove("hidden");
          return;
        }
        gameScreen?.classList.remove("hidden");
      },

      qr,
      scene,

      game,
      gameId: game.id,
      key,
    };

    const handleCommand = createCommandHandler(app);

    window.app = app;
    window.scene = scene;
    window.handleCommand = handleCommand;

    app.setMode("BLACK_SCREEN");
    console.log("Display OK. Game:", game.name, game.id);
  } catch (e) {
    showBlack(e?.message || String(e));
  }
});
