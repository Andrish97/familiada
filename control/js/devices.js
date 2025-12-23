// control/js/devices.js
export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer }) {
  function makeUrl(path, id, key) {
    const u = new URL(path, location.origin);
    u.searchParams.set("id", id);
    u.searchParams.set("key", key);
    return u.toString();
  }

  function escapeForQuotedCommand(raw) {
    return String(raw ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  async function sendCmd(channel, event, line) {
    const l = String(line ?? "").trim();
    if (!l) return;
    await channel.sendBroadcast(event, { line: l });
  }

  async function sendDisplayCmd(line) { await sendCmd(chDisplay, "DISPLAY_CMD", line); }
  async function sendHostCmd(line) { await sendCmd(chHost, "HOST_CMD", line); }
  async function sendBuzzerCmd(line) { await sendCmd(chBuzzer, "BUZZER_CMD", line); }

  function qrSrc(url) {
    const u = encodeURIComponent(String(url));
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${u}`;
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  function initLinksAndQrInline() {
    const displayUrl = makeUrl("/familiada/display/index.html", game.id, game.share_key_display);
    const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);
    const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, game.share_key_buzzer || "");

    ui.setValue("displayLink", displayUrl);
    ui.setValue("hostLink", hostUrl);
    ui.setValue("buzzerLink", buzzerUrl);

    // inline QR (step 1)
    ui.setQrInline({
      hostUrl,
      buzzerUrl,
      hostImgSrc: qrSrc(hostUrl),
      buzzerImgSrc: qrSrc(buzzerUrl),
    });

    // card QR (step 2)
    ui.setCardQr({
      hostUrl,
      buzzerUrl,
      hostImgSrc: qrSrc(hostUrl),
      buzzerImgSrc: qrSrc(buzzerUrl),
    });

    // open/copy
    ui.on("devices.openDisplay", () => window.open(displayUrl, "_blank"));
    ui.on("devices.openHost", () => window.open(hostUrl, "_blank"));
    ui.on("devices.openBuzzer", () => window.open(buzzerUrl, "_blank"));

    ui.on("devices.copyDisplay", async () => ui.setMsg("msgDevices", (await copyToClipboard(displayUrl)) ? "Skopiowano link wyświetlacza." : "Nie mogę skopiować."));
    ui.on("devices.copyHost", async () => ui.setMsg("msgDevices2", (await copyToClipboard(hostUrl)) ? "Skopiowano link prowadzącego." : "Nie mogę skopiować."));
    ui.on("devices.copyBuzzer", async () => ui.setMsg("msgDevices2", (await copyToClipboard(buzzerUrl)) ? "Skopiowano link przycisku." : "Nie mogę skopiować."));

    // buttons already wired by UI emitters
    ui.on("display.sendQrToDisplay", async () => sendQrToDisplay());
  }

  async function sendQrToDisplay() {
    const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);
    const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, game.share_key_buzzer || "");

    // only now: switch to QR and send both
    await sendDisplayCmd("MODE QR");
    await sendDisplayCmd(`QR HOST "${escapeForQuotedCommand(hostUrl)}" BUZZER "${escapeForQuotedCommand(buzzerUrl)}"`);
  }

  return {
    initLinksAndQrInline,

    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,

    sendQrToDisplay,
  };
}
