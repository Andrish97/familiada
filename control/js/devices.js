// ================== KOMUNIKATY ==================
const DEVICES_MSG = {
  COPY_OK: "Skopiowano.",
  COPY_FAIL: "Nie mogę skopiować.",
};
// =============== KONIEC KOMUNIKATÓW ===============

export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer }) {
  // --- NOWE: kolejki komend per urządzenie ---
  const cmdQueues = {
    display: [],
    host: [],
    buzzer: [],
  };

  function makeUrl(path, id, key) {
    const u = new URL(path, location.origin);
    u.searchParams.set("id", id);
    u.searchParams.set("key", key);
    return u.toString();
  }

  async function sendCmd(channel, event, line) {
    const l = String(line ?? "").trim();
    if (!l) return;
  
    // Jeśli to RealtimeManager (rt), ma sendBroadcast
    if (channel && typeof channel.sendBroadcast === "function") {
      await channel.sendBroadcast(event, { line: l }, { mode: "http" });
      return;
    }
  
    // Jeśli to surowy RealtimeChannel
    const msg = { type: "broadcast", event, payload: { line: l } };
  
    if (channel && typeof channel.httpSend === "function") {
      const { error } = await channel.httpSend(msg);
      if (error) throw error;
      return;
    }
  
    if (channel && typeof channel.send === "function") {
      const { error } = await channel.send(msg);
      if (error) throw error;
      return;
    }
  
    throw new Error("Unknown channel type (no sendBroadcast/httpSend/send)");
  }
  
  function isOnline(kind) {
    const flags = store.state?.flags || {};
    if (kind === "display") return !!flags.displayOnline;
    if (kind === "host") return !!flags.hostOnline;
    if (kind === "buzzer") return !!flags.buzzerOnline;
    return false;
  }

  function enqueue(kind, line) {
    const l = String(line ?? "").trim();
    if (!l) return;
    cmdQueues[kind].push(l);
  }

  async function flushQueued(kind) {
    if (!isOnline(kind)) return;

    const q = cmdQueues[kind];
    if (!q || !q.length) return;

    let channel;
    let event;

    if (kind === "display") {
      channel = chDisplay;
      event = "DISPLAY_CMD";
    } else if (kind === "host") {
      channel = chHost;
      event = "HOST_CMD";
    } else if (kind === "buzzer") {
      channel = chBuzzer;
      event = "BUZZER_CMD";
    } else {
      return;
    }

    while (q.length) {
      const line = q.shift();
      await sendCmd(channel, event, line);
    }
  }

  async function sendDisplayCmd(line) {
    const l = String(line ?? "").trim();
    if (!l) return;

    if (isOnline("display")) {
      await sendCmd(chDisplay, "DISPLAY_CMD", l);
    } else {
      enqueue("display", l);
    }
  }

  async function sendHostCmd(line) {
    const l = String(line ?? "").trim();
    if (!l) return;

    if (isOnline("host")) {
      await sendCmd(chHost, "HOST_CMD", l);
    } else {
      enqueue("host", l);
    }
  }

  async function sendBuzzerCmd(line) {
    const l = String(line ?? "").trim();
    if (!l) return;

    if (isOnline("buzzer")) {
      await sendCmd(chBuzzer, "BUZZER_CMD", l);
    } else {
      enqueue("buzzer", l);
    }
  }

  function qrSrc(url) {
    const u = encodeURIComponent(String(url));
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${u}`;
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  let urls = { displayUrl:"", hostUrl:"", buzzerUrl:"" };
  function getUrls() {
    return { ...urls };
  }

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

    ui.on(
      "devices.copyDisplay",
      async () =>
        ui.setMsg(
          "msgDevices",
          (await copyToClipboard(displayUrl)) ? DEVICES_MSG.COPY_OK : DEVICES_MSG.COPY_FAIL
        )
    );

    ui.on(
      "devices.copyHost",
      async () =>
        ui.setMsg(
          "msgDevices2",
          (await copyToClipboard(hostUrl)) ? DEVICES_MSG.COPY_OK : DEVICES_MSG.COPY_FAIL
        )
    );

    ui.on(
      "devices.copyBuzzer",
      async () =>
        ui.setMsg(
          "msgDevices2",
          (await copyToClipboard(buzzerUrl)) ? DEVICES_MSG.COPY_OK : DEVICES_MSG.COPY_FAIL
        )
    );
  }

  function escQ(raw) {
    return String(raw ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  async function sendQrToDisplay() {
    await sendDisplayCmd("APP QR");
    await sendDisplayCmd(`QR HOST "${escQ(urls.hostUrl)}" BUZZER "${escQ(urls.buzzerUrl)}"`);
  }

  return {
    initLinksAndQr,
    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
    sendQrToDisplay,
    getUrls,
    flushQueued,
  };
}
