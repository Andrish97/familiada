// /familiada/control/js/devices.js

export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer, chControl }) {
  const origin = window.location.origin;

  const links = {
    display: `${origin}/familiada/display.html?k=${encodeURIComponent(game.share_key_display)}`,
    host: `${origin}/familiada/host.html?k=${encodeURIComponent(game.share_key_host)}`,
    buzzer: `${origin}/familiada/buzzer.html?k=${encodeURIComponent(game.share_key_buzzer)}`,
  };

  function initLinksAndQr() {
    ui.setValue("displayLink", links.display);
    ui.setValue("hostLink", links.host);
    ui.setValue("buzzerLink", links.buzzer);

    // --- POPRAWKA QR DLA GITHUB PAGES ---
    // Na GitHub Pages nie ma /familiada/api/qr, więc 404 jest normalne.
    // Jeśli chcesz działające QR bez backendu, użyj publicznego generatora,
    // np. api.qrserver.com (działa jako czysty obrazek PNG).
    const qBase = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=";

    ui.setImg("qrDisplayImg", qBase + encodeURIComponent(links.display));
    ui.setImg("qrHostImg", qBase + encodeURIComponent(links.host));
    ui.setImg("qrBuzzerImg", qBase + encodeURIComponent(links.buzzer));
  }

  async function sendDisplayCmd(cmd) {
    console.log("[display] cmd:", cmd);
    await chDisplay.send({
      type: "broadcast",
      event: "DISPLAY_CMD",
      payload: { cmd },
    });
  }

  async function sendHostCmd(cmd) {
    console.log("[host] cmd:", cmd);
    await chHost.send({
      type: "broadcast",
      event: "HOST_CMD",
      payload: { cmd },
    });
  }

  async function sendBuzzerCmd(cmd) {
    console.log("[buzzer] cmd:", cmd);
    await chBuzzer.send({
      type: "broadcast",
      event: "BUZZER_CMD",
      payload: { cmd },
    });
  }

  async function sendQrToDisplay() {
    // Zakładam, że Twój display/scene.js ma komendę QR_LINKS.
    await sendDisplayCmd("APP GAME");
    await sendDisplayCmd(`QR_LINKS "${links.host}" "${links.buzzer}"`);
  }

  function getDeviceInfo(kind) {
    const flags = store.state.flags;
    const map = {
      display: {
        name: "Wyświetlacz",
        online: !!flags.displayOnline,
        link: links.display,
      },
      host: {
        name: "Prowadzący",
        online: !!flags.hostOnline,
        link: links.host,
      },
      buzzer: {
        name: "Przycisk",
        online: !!flags.buzzerOnline,
        link: links.buzzer,
      },
    };
    return map[kind] || null;
  }

  return {
    initLinksAndQr,
    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
    sendQrToDisplay,
    getDeviceInfo,
  };
}
