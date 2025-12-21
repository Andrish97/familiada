// main/display/js/main.js
import { initFullscreenButton } from "./fullscreen.js";
import { startPresence } from "./presence.js";
import { createQRController } from "./qr.js";
import { createScene } from "./scene.js";
import { createCommandHandler } from "./commands.js";

const $ = (id) => document.getElementById(id);

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
    const qr = createQRController({
      qrScreen,
      gameScreen,
      hostImg: $("qrHostImg"),
      buzzerImg: $("qrBuzzerImg"),
    });

    const scene = await createScene();

    const app = {
      mode: APP_MODES.BLACK,
      setMode(m) {
        let mm = (m ?? "").toString().toUpperCase();
        if (mm === "BLACK") mm = APP_MODES.BLACK;
        if (!Object.values(APP_MODES).includes(mm)) throw new Error("Mode musi być BLACK_SCREEN / GRA / QR");
        this.mode = mm;

        blackScreen?.classList.add("hidden");
        qrScreen?.classList.add("hidden");
        gameScreen?.classList.add("hidden");

        if (mm === APP_MODES.BLACK) return blackScreen?.classList.remove("hidden");
        if (mm === APP_MODES.QR) return qrScreen?.classList.remove("hidden");
        return gameScreen?.classList.remove("hidden");
      },
      qr,
      scene,
      game: null,
      gameId: null,
    };

    const handleCommand = createCommandHandler(app);

    window.app = app;
    window.scene = scene;
    window.handleCommand = handleCommand;

    const pres = await startPresence({
      pingMs: 5000,
      debug: true,
      onCommand: (line) => handleCommand(line),

      // SNAPSHOT z device_state.state
      onSnapshot: async (st) => {
        const mode = String(st?.app_mode ?? "BLACK").toUpperCase();
        if (mode === "GRA") app.setMode("GRA");
        else if (mode === "QR") app.setMode("QR");
        else app.setMode("BLACK_SCREEN");

        // QR linki (jeśli trzymasz je w state)
        if (st?.qr?.host)  try { handleCommand(`QR HOST "${st.qr.host}" BUZZER "${st.qr.buzzer || ""}"`); } catch {}
        if (mode === "QR") {
          // w QR i tak komenda QR HOST/BUZZER robi robotę, ale zostawiamy.
        }

        // scena (tylko gdy GRA)
        const sceneMode = String(st?.scene ?? "LOGO").toUpperCase();
        if (mode === "GRA") {
          try { handleCommand(`MODE ${sceneMode}`); } catch {}
        }

        // ostatnia “komenda budująca ekran”
        const last = String(st?.last_cmd ?? "");
        if (last) {
          try { handleCommand(last); } catch {}
        }
      },
    });

    app.game = pres.game;
    app.gameId = pres.game.id;

    // Jeżeli control jeszcze nic nie zapisał do device_state, startuj na czarno
    app.setMode("BLACK_SCREEN");

    console.log("Display OK:", pres.game.name, pres.game.id);
  } catch (e) {
    showBlack(e?.message || String(e));
  }
});
