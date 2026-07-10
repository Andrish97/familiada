import { getUiLang, t } from "../../translation/translation.js?v=v2026-07-10T22352";

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
    // Wysyłamy jawnie przez REST — realtime.js używa własnego fetch zamiast ch.httpSend()
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
    const displayUrl = makeUrl("../display", game.id, game.share_key_display, {
      lang: targetLang,
    });
    const hostUrl = makeUrl("../host", game.id, game.share_key_host, { lang: targetLang });
    const buzzerUrl = makeUrl("../buzzer", game.id, game.share_key_buzzer || "", { lang: targetLang });
    return { displayUrl, hostUrl, buzzerUrl };
  }

  function updateLinksAndQr(lang) {
    urls = buildUrls(lang);

    // Linki są teraz skrócone do 6-cyfrowych kodów (generowanych asynchronicznie przez app.js)
    const openBtn = document.getElementById("btnOpenDisplay");
    if (openBtn) openBtn.href = urls.displayUrl || "#";
  }

  let actionsBound = false;
  function bindDeviceActions() {
    if (actionsBound) return;
    actionsBound = true;

    ui.on("devices.openDisplay", () => window.open(urls.displayUrl, "_blank"));
    ui.on("devices.openHost", () => window.open(urls.hostUrl, "_blank"));
    ui.on("devices.openBuzzer", () => window.open(urls.buzzerUrl, "_blank"));
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

  async function sendQrToDisplay(codes, flags) {
    await sendDisplayCmd("APP QR");
    await sendQrLinksToDisplay(codes, flags);
  }

  async function sendQrLinksToDisplay(codes, flags) {
    const showHost   = !(flags?.noHostTablet);
    const showBuzzer = !(flags?.physicalBuzzer);
    const parts = [];
    if (showHost) {
      const hc = codes?.host ? ` HOST_CODE "${escQ(codes.host)}"` : "";
      parts.push(`HOST "${escQ(urls.hostUrl)}"${hc}`);
    }
    if (showBuzzer) {
      const bc = codes?.buzzer ? ` BUZZER_CODE "${escQ(codes.buzzer)}"` : "";
      parts.push(`BUZZER "${escQ(urls.buzzerUrl)}"${bc}`);
    }
    const single = (!showHost || !showBuzzer) ? " SINGLE" : "";
    if (parts.length) {
      await sendDisplayCmd(`QR ${parts.join(" ")}${single}`);
    }
  }

  return {
    initLinksAndQr,
    updateLinksAndQr,
    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
    sendQrToDisplay,
    sendQrLinksToDisplay,
    getUrls,
    flushQueued,
  };
}
