// /familiada/control/js/devices.js

// Zakładam, że rt(...) zwraca kanał Supabase Realtime
// z metodami .send(...) i .on("broadcast", { event }, handler),
// oraz .subscribe(cb).

export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer, chControl }) {
  const origin = window.location.origin;

  // ===== LINKI DO URZĄDZEŃ =====

  const links = {
    display: `${origin}/familiada/display.html?k=${encodeURIComponent(
      game.share_key_display
    )}`,
    host: `${origin}/familiada/host.html?k=${encodeURIComponent(
      game.share_key_host
    )}`,
    buzzer: `${origin}/familiada/buzzer.html?k=${encodeURIComponent(
      game.share_key_buzzer
    )}`,
  };

  function initLinksAndQr() {
    // wpisy w inputach
    ui.setValue("displayLink", links.display);
    ui.setValue("hostLink", links.host);
    ui.setValue("buzzerLink", links.buzzer);

    // obrazki QR – TU DOPASUJ endpoint jeśli masz inny
    const qBase = `${origin}/familiada/api/qr?text=`;
    ui.setImg("qrDisplayImg", qBase + encodeURIComponent(links.display));
    ui.setImg("qrHostImg", qBase + encodeURIComponent(links.host));
    ui.setImg("qrBuzzerImg", qBase + encodeURIComponent(links.buzzer));
  }

  // ===== WYSYŁANIE KOMEND =====

  async function sendDisplayCmd(cmd) {
    console.log("[display] cmd:", cmd);
    try {
      await chDisplay.send({
        type: "broadcast",
        event: "DISPLAY_CMD",
        payload: { cmd },
      });
    } catch (e) {
      console.error("sendDisplayCmd error", e);
    }
  }

  async function sendHostCmd(cmd) {
    console.log("[host] cmd:", cmd);
    try {
      await chHost.send({
        type: "broadcast",
        event: "HOST_CMD",
        payload: { cmd },
      });
    } catch (e) {
      console.error("sendHostCmd error", e);
    }
  }

  async function sendBuzzerCmd(cmd) {
    console.log("[buzzer] cmd:", cmd);
    try {
      await chBuzzer.send({
        type: "broadcast",
        event: "BUZZER_CMD",
        payload: { cmd },
      });
    } catch (e) {
      console.error("sendBuzzerCmd error", e);
    }
  }

  // QR na dużym wyświetlaczu – wywoływane z app.js przy kliknięciu "QR na wyświetlaczu"
  async function sendQrToDisplay() {
    // TU DOPASUJ do protokołu wyświetlacza – przykładowo:
    // 1. przełącz w tryb QR
    await sendDisplayCmd("MODE QR");
    // 2. wyślij linki – np. host + buzzer
    await sendDisplayCmd(
      `QR_LINKS "${links.host}" "${links.buzzer}"`
    );
    // jeśli wyświetlacz ma inny format (np. 3 linki, albo osobne komendy),
    // zamień powyższy wiersz na swój odpowiednik.
  }

  // ===== PRESENCE – stany online urządzeń =====
  //
  // presence.js oczekuje, że devices.onPresenceUpdate(cb)
  // będzie wołało cb({ display: {on, seen}, host: {...}, buzzer: {...} })

  function onPresenceUpdate(cb) {
    // Odbieramy broadcast PRESENCE z kanału control
    // DOPASUJ: jeśli w Twoim kodzie event nazywa się inaczej, zmień "PRESENCE"
    chControl
      .on("broadcast", { event: "PRESENCE" }, (payload) => {
        try {
          const st = payload.payload?.state;
          if (!st) return;
          // Oczekiwany format:
          // {
          //   display: { on: bool, seen: "..." },
          //   host:    { on: bool, seen: "..." },
          //   buzzer:  { on: bool, seen: "..." }
          // }
          cb(st);
        } catch (e) {
          console.error("presence handler error", e);
        }
      })
      .subscribe((status) => {
        console.log("[control] presence subscribe status:", status);
      });

    // Zwracamy funkcję "sprzątającą" (na razie no-op, bo supabase v2 nie ma .off)
    return () => {
      // Tu można dodać detach, jeśli w Twojej wersji supabase jest dostępny.
    };
  }

  // ===== API eksportowane do app.js / innych modułów =====

  return {
    initLinksAndQr,

    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
    sendQrToDisplay,

    onPresenceUpdate,
  };
}
