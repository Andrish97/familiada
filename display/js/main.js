import { initFullscreenButton } from "./fullscreen.js";
import { startPresence } from "./presence.js";
import { createQRController } from "./qr.js";
import { createScene } from "./scene.js";
import { createCommandHandler } from "./commands.js";

// ✅ dodaj supabase client (ESM)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// TODO: wstaw swoje
const SUPABASE_URL = "https://mohjsqjxgnzodmzltcri.supabase.co";
const SUPABASE_ANON_KEY = "WSTAW_TUTAJ_ANON_KEY";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

function parseParams() {
  const u = new URL(location.href);
  return {
    gameId: u.searchParams.get("id") || "",
    key: u.searchParams.get("key") || "",
  };
}

async function authDisplayOrThrow(gameId, key) {
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");

  // ✅ RPC: public.display_auth
  const { data, error } = await sb.rpc("display_auth", {
    p_game_id: gameId,
    p_key: key,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data; // zależnie jak Supabase zwróci
  if (!row?.id) throw new Error("Zły klucz (display) albo gra nie istnieje.");

  return row; // {id,name,kind,status}
}

window.addEventListener("DOMContentLoaded", async () => {
  initFullscreenButton();

  // referencje do ekranów
  const blackScreen = document.getElementById("blackScreen");
  const qrScreen    = document.getElementById("qrScreen");
  const gameScreen  = document.getElementById("gameScreen");

  const APP_MODES = {
    BLACK: "BLACK_SCREEN",
    GRA: "GRA",
    QR: "QR",
  };

  // startujemy na czarno zawsze
  const showBlack = (msg) => {
    blackScreen?.classList.remove("hidden");
    qrScreen?.classList.add("hidden");
    gameScreen?.classList.add("hidden");
    if (msg) console.warn("[display]", msg);
  };

  try {
    // ✅ 0) AUTH z URL
    const { gameId, key } = parseParams();
    const game = await authDisplayOrThrow(gameId, key);

    // ✅ 1) presence (heartbeat) – kanał per gra (żeby było czytelnie)
    startPresence({
      channel: `familiada-display:${game.id}`,
      key: "familiada_display_alive",
    });

    // ✅ 2) QR controller
    const qr = createQRController({
      qrScreen: $("qrScreen"),
      gameScreen: $("gameScreen"),
      hostImg: $("qrHostImg"),
      buzzerImg: $("qrBuzzerImg"),
    });

    // ✅ 3) scena gry
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

        blackScreen.classList.add("hidden");
        qrScreen.classList.add("hidden");
        gameScreen.classList.add("hidden");

        if (mm === APP_MODES.BLACK) {
          blackScreen.classList.remove("hidden");
          return;
        }
        if (mm === APP_MODES.QR) {
          qrScreen.classList.remove("hidden");
          return;
        }
        gameScreen.classList.remove("hidden");
      },

      qr,
      scene,

      // ✅ przydatne dalej: info o grze + klucz (np. do subskrypcji kanałów)
      game,
      gameId: game.id,
      key,
    };

    // ✅ 5) komendy z backendu
    const handleCommand = createCommandHandler(app);

    window.app = app;
    window.scene = scene;
    window.handleCommand = handleCommand;

    // domyślnie czarny ekran
    app.setMode("BLACK_SCREEN");
    console.log("Display OK. Game:", game.name, game.id);
  } catch (e) {
    // ❌ brak autoryzacji -> zostaje czarny ekran
    showBlack(e?.message || String(e));
  }
});
