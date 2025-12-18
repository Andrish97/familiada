import { initFullscreenButton } from "./fullscreen.js";
import { startPresence } from "./presence.js";
import { createQRController } from "./qr.js";
import { createScene } from "./scene.js";
import { createCommandHandler } from "./commands.js";
import { sb } from "../js/core/supabase.js";

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

  // referencje do ekranów
  const blackScreen = document.getElementById("blackScreen");
  const qrScreen    = document.getElementById("qrScreen");
  const gameScreen  = document.getElementById("gameScreen");
  
  const APP_MODES = {
    BLACK: "BLACK_SCREEN",
    GRA: "GRA",
    QR: "QR",
  };
  
  const app = {
    mode: APP_MODES.BLACK,
  
    setMode(m) {
      let mm = (m ?? "").toString().toUpperCase();
      if (mm === "BLACK") mm = APP_MODES.BLACK;
  
      if (!Object.values(APP_MODES).includes(mm)) {
        throw new Error("Mode musi być BLACK_SCREEN / GRA / QR");
      }
  
      this.mode = mm;
  
      // reset widoczności
      blackScreen.classList.add("hidden");
      qrScreen.classList.add("hidden");
      gameScreen.classList.add("hidden");
  
      // pokaż wybrany ekran
      if (mm === APP_MODES.BLACK) {
        blackScreen.classList.remove("hidden");
        return;
      }
  
      if (mm === APP_MODES.QR) {
        blackScreen.classList.add("hidden"); // optional, i tak hidden już jest
        qrScreen.classList.remove("hidden");
        return;
      }
  
      // GRA
      gameScreen.classList.remove("hidden");
    },
  
    qr,
    scene,
  };


  // 5) komendy z backendu
  const handleCommand = createCommandHandler(app);

  window.app = app;
  window.scene = scene; // kompatybilnie z tym jak używałeś wcześniej
  window.handleCommand = handleCommand;

  // 6) Realtime: komendy z CONTROL -> DISPLAY (broadcast)
  const qs = new URLSearchParams(location.search);
  const gameId = qs.get("id");

  if (!gameId) {
    console.warn("[display] Brak id w URL (display.html?id=...) — realtime bez gameId nie ruszy.");
  } else {
    const ch = sb()
      .channel(`fam_display:${gameId}`)
      .on("broadcast", { event: "DISPLAY_CMD" }, ({ payload }) => {
        const line = String(payload?.line || "").trim();
        if (!line) return;
        try {
          window.handleCommand(line);
        } catch (e) {
          console.error("[display] handleCommand error:", e, line);
        }
      })
      .subscribe((status) => {
        console.log("[display] realtime:", status);
      });

    // (opcjonalnie) gdybyś chciał kiedyś sprzątać:
    // window.addEventListener("beforeunload", () => sb().removeChannel(ch));
  }
  
  // demo:
  app.setMode("BLACK_SCREEN");
  console.log("Gotowe.");
});
