export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer }) {
  function makeUrl(path, id, key) {
    const u = new URL(path, location.origin);
    u.searchParams.set("id", id);
    u.searchParams.set("key", key);
    return u.toString();
  }

  async function sendCmd(channel, event, line) {
    const l = String(line ?? "").trim();
    if (!l) return;
    const { error } = await channel.sendBroadcast(event, { line: l });
    if (error) throw error;
  }

  async function sendDisplayCmd(line) { await sendCmd(chDisplay, "DISPLAY_CMD", line); }
  async function sendHostCmd(line) { await sendCmd(chHost, "HOST_CMD", line); }
  async function sendBuzzerCmd(line) { await sendCmd(chBuzzer, "BUZZER_CMD", line); }

  function qrSrc(url) {
    const u = encodeURIComponent(String(url));
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${u}`;
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  let urls = { displayUrl:"", hostUrl:"", buzzerUrl:"" };

  function initLinksAndQr() {
    const displayUrl = makeUrl("/familiada/display/index.html", game.id, game.share_key_display);
    const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);
    const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, game.share_key_buzzer || "");
    urls = { displayUrl, hostUrl, buzzerUrl };

    ui.setValue("displayLink", displayUrl);
    ui.setValue("hostLink", hostUrl);
    ui.setValue("buzzerLink", buzzerUrl);

    ui.setImg("qrDisplayImg", qrSrc(displayUrl));
    ui.setImg("qrHostImg", qrSrc(hostUrl));
    ui.setImg("qrBuzzerImg", qrSrc(buzzerUrl));

    ui.on("devices.openDisplay", () => window.open(displayUrl, "_blank"));
    ui.on("devices.openHost", () => window.open(hostUrl, "_blank"));
    ui.on("devices.openBuzzer", () => window.open(buzzerUrl, "_blank"));

    ui.on("devices.copyDisplay", async () => ui.setMsg("msgDevices", (await copyToClipboard(displayUrl)) ? "Skopiowano." : "Nie mogę skopiować."));
    ui.on("devices.copyHost", async () => ui.setMsg("msgDevices2", (await copyToClipboard(hostUrl)) ? "Skopiowano." : "Nie mogę skopiować."));
    ui.on("devices.copyBuzzer", async () => ui.setMsg("msgDevices2", (await copyToClipboard(buzzerUrl)) ? "Skopiowano." : "Nie mogę skopiować."));
  }

  function escQ(raw) {
    return String(raw ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  async function sendQrToDisplay() {
    await sendDisplayCmd("MODE QR");
    await sendDisplayCmd(`QR HOST "${escQ(urls.hostUrl)}" BUZZER "${escQ(urls.buzzerUrl)}"`);
  }

  return {
    initLinksAndQr,
    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
    sendQrToDisplay,
  };
}
