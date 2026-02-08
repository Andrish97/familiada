import { getUiLang, t } from "../../translation/translation.js";

// ================== KOMUNIKATY ==================
const DEVICES_MSG = {
  get COPY_OK() { return t("control.copyOk"); },
  get COPY_FAIL() { return t("control.copyFail"); },
};
// =============== KONIEC KOMUNIKATÓW ===============

export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer }) {
  // --- NOWE: kolejki komend per urządzenie ---
  const cmdQueues = {
    display: [],
    host: [],
    buzzer: [],
  };

  function makeUrl(path, id, key, { lang } = {}) {
    const u = new URL(path, location.origin);
    u.searchParams.set("id", id);
    u.searchParams.set("key", key);
    if (lang) u.searchParams.set("lang", lang);
    return u.toString();
  }

  async function sendCmd(channel, event, line) {
    const l = String(line ?? "").trim();
    if (!l) return;
    // Wysyłamy jawnie przez REST (httpSend), żeby uniknąć ostrzeżeń Supabase
    // o automatycznym fallbacku send() -> REST.
    await channel.sendBroadcast(event, { line: l }, { mode: "http" });
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

  function buildUrls(lang) {
    const targetLang = lang || getUiLang();
    const displayUrl = makeUrl("../display/index.html", game.id, game.share_key_display, {
      lang: targetLang,
    });
    const hostUrl = makeUrl("../host.html", game.id, game.share_key_host, { lang: targetLang });
    const buzzerUrl = makeUrl("../buzzer.html", game.id, game.share_key_buzzer || "", { lang: targetLang });
    return { displayUrl, hostUrl, buzzerUrl };
  }

  function updateLinksAndQr(lang) {
    urls = buildUrls(lang);

    ui.setValue("displayLink", urls.displayUrl);
    ui.setValue("hostLink", urls.hostUrl);
    ui.setValue("buzzerLink", urls.buzzerUrl);

    ui.setImg("qrDisplayImg", qrSrc(urls.displayUrl));
    ui.setImg("qrHostImg", qrSrc(urls.hostUrl));
    ui.setImg("qrBuzzerImg", qrSrc(urls.buzzerUrl));
  }

  let actionsBound = false;
  function bindDeviceActions() {
    if (actionsBound) return;
    actionsBound = true;

    ui.on("devices.openDisplay", () => window.open(urls.displayUrl, "_blank"));
    ui.on("devices.openHost", () => window.open(urls.hostUrl, "_blank"));
    ui.on("devices.openBuzzer", () => window.open(urls.buzzerUrl, "_blank"));

    ui.on(
      "devices.copyDisplay",
      async () =>
        ui.setMsg(
          "msgDevices",
          (await copyToClipboard(urls.displayUrl)) ? DEVICES_MSG.COPY_OK : DEVICES_MSG.COPY_FAIL
        )
    );

    ui.on(
      "devices.copyHost",
      async () =>
        ui.setMsg(
          "msgDevices2",
          (await copyToClipboard(urls.hostUrl)) ? DEVICES_MSG.COPY_OK : DEVICES_MSG.COPY_FAIL
        )
    );

    ui.on(
      "devices.copyBuzzer",
      async () =>
        ui.setMsg(
          "msgDevices2",
          (await copyToClipboard(urls.buzzerUrl)) ? DEVICES_MSG.COPY_OK : DEVICES_MSG.COPY_FAIL
        )
    );
  }

  function initLinksAndQr() {
    updateLinksAndQr();
    bindDeviceActions();
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
    updateLinksAndQr,
    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
    sendQrToDisplay,
    getUrls,
    flushQueued,
  };
}
