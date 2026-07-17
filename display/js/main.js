// displayjs/main.js
import { initFullscreenButton } from "./fullscreen.js?v=v2026-07-17T07322";
import { startPresence } from "./presence.js?v=v2026-07-17T07322";
import { createQRController } from "./qr.js?v=v2026-07-17T07322";
import { createScene } from "./scene.js?v=v2026-07-17T07322";
import { createCommandHandler } from "./commands.js?v=v2026-07-17T07322";
import { initI18n } from "../../translation/translation.js?v=v2026-07-17T07322";
import { startKeepAlive } from "../../js/core/keep-alive.js?v=v2026-07-17T07322";
startKeepAlive();

const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: false });
  initFullscreenButton();

  const blackScreen = $("blackScreen");
  const qrScreen = $("qrScreen");
  const gameScreen = $("gameScreen");

  const APP_MODES = {
    BLACK: "BLACK_SCREEN",
    GAME: "GAME",
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
      hostCard: $("qrHostCard"),
      buzzerCard: $("qrBuzzerCard"),
      hostImg: $("qrHostImg"),
      buzzerImg: $("qrBuzzerImg"),
      hostCodeEl: $("qrHostCode"),
      buzzerCodeEl: $("qrBuzzerCode"),
    });

    const scene = await createScene();

    const app = {
      mode: APP_MODES.BLACK,
      setMode(m) {
        let mm = (m ?? "").toString().toUpperCase();
        if (mm === "BLACK") mm = APP_MODES.BLACK;
        if (!Object.values(APP_MODES).includes(mm)) throw new Error("Mode: BLACK_SCREEN / GAME / QR");
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
    document.documentElement.classList.remove('page-loading');

    // Jeśli brak parametrów URL (np. podgląd w game-settings) — nie łączymy z Supabase
    const _previewParams = new URL(location.href).searchParams;
    if (!_previewParams.get("id") || !_previewParams.get("key")) return;

    const pres = await startPresence({
      pingMs: 3000,
      debug: true,
      onCommand: (line) => handleCommand(line),

      // snapshot odtwarza “stan ekranu”
      onSnapshot: (st) => {
        const mode = String(st?.app_mode ?? "BLACK_SCREEN").toUpperCase();
        const appMode =
          mode === "BLACK" ? "BLACK_SCREEN" :
          (mode === "GAME" || mode === "QR" || mode === "BLACK_SCREEN") ? mode :
          "BLACK_SCREEN";
      
        // Odtwórz QR linki (nieważne czy finalnie pokażesz QR od razu)
        const hostUrl = st?.qr?.hostUrl ?? "";
        const buzzerUrl = st?.qr?.buzzerUrl ?? "";
        if (hostUrl) app.qr.setHost(hostUrl);
        if (buzzerUrl) app.qr.setBuzzer(buzzerUrl);
      
        // Przełącz tryb strony
        app.setMode(appMode);
      
        // “sztywne wejście” po snapshot: bez animacji, bez komend
        if (appMode === "GAME") {
          // tu odtwarzasz zrzut ekranu jeśli masz restore w scene
          app.scene.api.restoreSnapshot?.(st?.screen);
          // albo: app.scene.api.restoreSnapshot?.(st?.screen); (zależnie jak nazwałeś)
          return;
        }
      
        // QR/BLACK: nic więcej nie odpalamy
        return;
      }
    });

    app.game = pres.game;
    app.gameId = pres.game.id;
    await scene.api.logo.bindGame?.(app.gameId);

  } catch (e) {
    const msg = e?.message || String(e);
    showBlack(/Brak id lub key/i.test(msg) ? null : msg);
  }
});
