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
    // 1) QR controller
    const qr = createQRController({
      qrScreen,
      gameScreen,
      hostImg: $("qrHostImg"),
      buzzerImg: $("qrBuzzerImg"),
    });

    // 2) scena gry
    const scene = await createScene();

    // 3) app (router ekranów)
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

        if (mm === APP_MODES.BLACK) return blackScreen?.classList.remove("hidden");
        if (mm === APP_MODES.QR) return qrScreen?.classList.remove("hidden");
        return gameScreen?.classList.remove("hidden");
      },

      qr,
      scene,

      // uzupełnimy po auth w presence:
      game: null,
      gameId: null,
      key: null,
    };

    // 4) komendy
    const handleCommand = createCommandHandler(app);

    window.app = app;
    window.scene = scene;
    window.handleCommand = handleCommand;

    // 5) AUTH + ping + realtime commands w presence.js
    const pres = await startPresence({
      // ten kanał ma pasować do controla:
      channel: null, // => domyślnie familiada-display:<gameId>
      pingMs: 5000,
      debug: true,
      onCommand: (line) => handleCommand(line),
    });

    // wpisz info o grze do app (przyda się w komendach/QR)
    app.game = pres.game;
    app.gameId = pres.game.id;

    // startowo czarny
    app.setMode("BLACK_SCREEN");
    console.log("Display OK. Game:", pres.game.name, pres.game.id);
  } catch (e) {
    showBlack(e?.message || String(e));
  }
});
