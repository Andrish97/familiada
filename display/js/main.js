import { initFullscreenButton } from "./fullscreen.js";
import { startPresence } from "./presence.js";
import { createQRController } from "./qr.js";
import { createScene } from "./scene.js";
import { createCommandHandler } from "./commands.js";

const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", async () => {
  initFullscreenButton();

  // 1) presence (heartbeat)
  startPresence({ channel: "familiada-display", key: "familiada_display_alive" });

  // 2) QR controller
  const qr = createQRController({
    qrScreen: $("qrScreen"),
    gameScreen: $("gameScreen"),
    hostImg: $("qrHostImg"),
    buzzerImg: $("qrBuzzerImg"),
  });

  // 3) scena gry
  const scene = await createScene();

  // 4) global mode switcher
  const app = {
    mode: "GRA",
    setMode(m) {
      const mm = (m ?? "").toString().toUpperCase();
      if (mm !== "GRA" && mm !== "QR") throw new Error("Mode musi być GRA albo QR");
      app.mode = mm;
      if (mm === "QR") qr.show();
      else qr.hide();
    },
    qr,
    scene,
  };

  // 5) komendy z backendu
  const handleCommand = createCommandHandler(app);

  window.app = app;
  window.scene = scene; // kompatybilnie z tym jak używałeś wcześniej
  window.handleCommand = handleCommand;

  // demo:
  app.setMode("GRA");
  console.log("Gotowe. Użyj: handleCommand('QR HOST \"https://...\" BUZZER \"https://...\"')");
});
