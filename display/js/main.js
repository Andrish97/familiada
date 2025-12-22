// display/js/main.js
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
        if (!Object.values(APP_MODES).includes(mm)) throw new Error("Mode: BLACK_SCREEN / GRA / QR");
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
    app.setMode("BLACK_SCREEN");

    const pres = await startPresence({
      pingMs: 5000,
      debug: true,
      onCommand: (line) => handleCommand(line),

      // snapshot odtwarza “stan ekranu”
      onSnapshot: (st) => {
        const mode = String(st?.app_mode ?? "BLACK").toUpperCase();
        // 1:1 odtwórz piksele (jeśli jest screen)
        if (mode === "GRA") app.setMode("GRA");
        else if (mode === "QR") app.setMode("QR");
        else app.setMode("BLACK_SCREEN");
        if (st?.screen && scene?.api?.restoreAll) {
          try { scene.api.restoreAll(st.screen); } catch (e) { console.warn(e); }
        }
        const sceneMode = String(st?.scene ?? "LOGO").toUpperCase();
        if (mode === "GRA" && !st?.screen) {
          try { handleCommand(`MODE ${sceneMode}`); } catch {}
        }
        const last = String(st?.last_cmd ?? "");
        if (last) {
          try { handleCommand(last); } catch {}
        }
      },
    });

    app.game = pres.game;
    app.gameId = pres.game.id;
    console.log("Display OK:", pres.game.name, pres.game.id);
  } catch (e) {
    showBlack(e?.message || String(e));
  }
});
