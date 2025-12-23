// control/js/presence.js
import { sb } from "/familiada/js/core/supabase.js";

const ONLINE_MS = 12_000;

function fmtSince(ts) {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${s}s temu`;
}

export function createPresence({ game, ui, store, devices }) {
  let timer = null;

  async function fetchPresenceSafe() {
    const { data, error } = await sb()
      .from("device_presence")
      .select("device_type,device_id,last_seen_at")
      .eq("game_id", game.id);

    if (error) return { ok: false, rows: [], error };
    return { ok: true, rows: data || [], error: null };
  }

  function pickNewest(rows, t) {
    return (
      rows
        .filter((r) => String(r.device_type || "").toLowerCase() === t)
        .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0] || null
    );
  }

  function isOnline(row) {
    if (!row?.last_seen_at) return false;
    return Date.now() - new Date(row.last_seen_at).getTime() < ONLINE_MS;
  }

  async function tick() {
    const res = await fetchPresenceSafe();
    if (!res.ok) {
      ui.setDeviceBadgesUnavailable();
      store.setOnlineFlags({ display: false, host: false, buzzer: false });
      ui.setMsg("msgDevices", "Brak tabeli device_presence (status = —).");
      return;
    }

    const d = pickNewest(res.rows, "display");
    const h = pickNewest(res.rows, "host");
    const b = pickNewest(res.rows, "buzzer");

    const dOn = isOnline(d);
    const hOn = isOnline(h);
    const bOn = isOnline(b);

    ui.setDeviceBadges({
      display: { on: dOn, seen: fmtSince(d?.last_seen_at) },
      host: { on: hOn, seen: fmtSince(h?.last_seen_at) },
      buzzer: { on: bOn, seen: fmtSince(b?.last_seen_at) },
    });

    store.setOnlineFlags({ display: dOn, host: hOn, buzzer: bOn });

    // auto-send MODE BLACK once when display first becomes online (and not yet sent)
    if (dOn && !store.state.flags.sentBlackAfterDisplayOnline) {
      try {
        await devices.sendDisplayCmd("MODE BLACK");
        store.markSentBlackAfterDisplayOnline();
        ui.setMsg("msgDevices", "Wyświetlacz online → wysłano MODE BLACK (czarny ekran).");
      } catch {
        // ignore; will retry on next tick implicitly if flag is still false
      }
    }
  }

  async function start() {
    await tick();
    timer = setInterval(tick, 1500);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop };
}



// control/js/devices.js
export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer, chControl }) {
  function makeUrl(path, id, key) {
    const u = new URL(path, location.origin);
    u.searchParams.set("id", id);
    u.searchParams.set("key", key);
    return u.toString();
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function sendCmd(channel, event, line) {
    const l = String(line ?? "").trim();
    if (!l) return;

    // use your managed channel
    await channel.sendBroadcast(event, { line: l });
  }

  async function sendDisplayCmd(line) {
    await sendCmd(chDisplay, "DISPLAY_CMD", line);
  }
  async function sendHostCmd(line) {
    await sendCmd(chHost, "HOST_CMD", line);
  }
  async function sendBuzzerCmd(line) {
    await sendCmd(chBuzzer, "BUZZER_CMD", line);
  }

  function initLinksAndQr() {
    const displayUrl = makeUrl("/familiada/display/index.html", game.id, game.share_key_display);
    const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);
    const buzKey = game.share_key_buzzer;
    const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, buzKey || "");

    ui.setValue("displayLink", displayUrl);
    ui.setValue("hostLink", hostUrl);
    ui.setValue("buzzerLink", buzzerUrl);

    ui.on("devices.openDisplay", () => window.open(displayUrl, "_blank"));
    ui.on("devices.openHost", () => window.open(hostUrl, "_blank"));
    ui.on("devices.openBuzzer", () => window.open(buzzerUrl, "_blank"));

    ui.on("devices.copyDisplay", async () => ui.setMsg("msgDevices", (await copyToClipboard(displayUrl)) ? "Skopiowano link wyświetlacza." : "Nie mogę skopiować."));
    ui.on("devices.copyHost", async () => ui.setMsg("msgDevices", (await copyToClipboard(hostUrl)) ? "Skopiowano link prowadzącego." : "Nie mogę skopiować."));
    ui.on("devices.copyBuzzer", async () => ui.setMsg("msgDevices", (await copyToClipboard(buzzerUrl)) ? "Skopiowano link przycisku." : "Nie mogę skopiować."));

    // QR modal: external QR image generator (simple and works everywhere)
    ui.on("qr.open", () => ui.openQrModal({ hostUrl, buzzerUrl }));
    ui.on("qr.copyHost", async () => ui.setMsg("msgDevices", (await copyToClipboard(hostUrl)) ? "Skopiowano link prowadzącego." : "Nie mogę skopiować."));
    ui.on("qr.copyBuzzer", async () => ui.setMsg("msgDevices", (await copyToClipboard(buzzerUrl)) ? "Skopiowano link przycisku." : "Nie mogę skopiować."));

    // QR on display
    ui.on("display.black", async () => {
      await sendDisplayCmd("MODE BLACK");
      ui.setMsg("msgDevices", "Wyświetlacz: czarny ekran.");
    });

    ui.on("display.qr", async () => {
      await sendDisplayCmd("MODE QR");
      await sendDisplayCmd(`QR HOST "${escapeForQuotedCommand(hostUrl)}" BUZZER "${escapeForQuotedCommand(buzzerUrl)}"`);
      ui.setMsg("msgDevices", "Wyświetlacz: QR prowadzącego i przycisku.");
    });

    // BUZZER_EVT log only
    chControl.onBroadcast("BUZZER_EVT", (msg) => {
      const line = String(msg?.payload?.line ?? "").trim();
      if (!line) return;
      ui.appendBuzzLog(line);
    });
  }

  function escapeForQuotedCommand(raw) {
    return String(raw ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  return {
    initLinksAndQr,

    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
  };
}
