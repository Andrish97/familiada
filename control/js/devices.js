import { sb } from "../../js/core/supabase.js";
import { rt } from "../../js/core/realtime.js";
import { playSfx } from "../../js/core/sfx.js";

const $ = (id) => document.getElementById(id);

const ONLINE_MS = 12_000;

const LS_KEY = (gameId, kind) => `familiada:lastcmd:${gameId}:${kind}`;

function setMsg(el, text) { if (el) el.textContent = text || ""; }

function badge(el, status, text) {
  if (!el) return;
  el.classList.remove("ok", "bad", "mid");
  if (status) el.classList.add(status);
  el.textContent = text;
}

function fmtSince(ts) {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${s}s temu`;
}

function makeUrl(path, id, key) {
  const u = new URL(path, location.origin);
  u.searchParams.set("id", id);
  u.searchParams.set("key", key);
  return u.toString();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    playSfx("ui_tick");
    return true;
  } catch {
    return false;
  }
}

export function createDevicesController({ game }) {
  // DOM
  const msgDevices = $("msgDevices");

  const displayLink = $("displayLink");
  const hostLink = $("hostLink");
  const buzzerLink = $("buzzerLink");

  const pillDisplay = $("pillDisplay");
  const pillHost = $("pillHost");
  const pillBuzzer = $("pillBuzzer");

  const seenDisplay = $("seenDisplay");
  const seenHost = $("seenHost");
  const seenBuzzer = $("seenBuzzer");

  const lastCmdDisplay = $("lastCmdDisplay");
  const lastCmdHost = $("lastCmdHost");
  const lastCmdBuzzer = $("lastCmdBuzzer");

  const btnCopyDisplay = $("btnCopyDisplay");
  const btnCopyHost = $("btnCopyHost");
  const btnCopyBuzzer = $("btnCopyBuzzer");

  const btnOpenDisplay = $("btnOpenDisplay");
  const btnOpenHost = $("btnOpenHost");
  const btnOpenBuzzer = $("btnOpenBuzzer");

  const btnResendDisplay = $("btnResendDisplay");
  const btnResendHost = $("btnResendHost");
  const btnResendBuzzer = $("btnResendBuzzer");

  // buzzer log
  const buzzLog = $("buzzLog");
  const buzzEvtLast = $("buzzEvtLast");
  const btnBuzzLogClear = $("btnBuzzLogClear");

  let presenceTimer = null;

  const lastCmd = {
    display: localStorage.getItem(LS_KEY(game.id, "display")) || "",
    host: localStorage.getItem(LS_KEY(game.id, "host")) || "",
    buzzer: localStorage.getItem(LS_KEY(game.id, "buzzer")) || "",
  };

  function refreshLastCmdUI() {
    if (lastCmdDisplay) lastCmdDisplay.textContent = lastCmd.display || "—";
    if (lastCmdHost) lastCmdHost.textContent = lastCmd.host || "—";
    if (lastCmdBuzzer) lastCmdBuzzer.textContent = lastCmd.buzzer || "—";
  }

  function logBuzz(line) {
    if (!buzzLog) return;
    const ts = new Date().toLocaleTimeString();
    buzzLog.textContent = `[${ts}] ${line}\n` + (buzzLog.textContent || "");
  }

  // Realtime send (managed by rt())
  const chDisplay = rt(`familiada-display:${game.id}`);
  const chHost = rt(`familiada-host:${game.id}`);
  const chBuzzer = rt(`familiada-buzzer:${game.id}`);
  const chControl = rt(`familiada-control:${game.id}`);

  function chFor(target) {
    if (target === "display") return chDisplay;
    if (target === "host") return chHost;
    return chBuzzer;
  }
  function evFor(target) {
    if (target === "display") return "DISPLAY_CMD";
    if (target === "host") return "HOST_CMD";
    return "BUZZER_CMD";
  }

  async function sendCmd(target, line, { remember = true } = {}) {
    const t = String(target || "").toLowerCase();
    const l = String(line ?? "").trim();
    if (!l) return false;

    const ch = chFor(t);
    await ch.sendBroadcast(evFor(t), { line: l });

    if (remember) {
      lastCmd[t] = l;
      try { localStorage.setItem(LS_KEY(game.id, t), l); } catch {}
      refreshLastCmdUI();
    }
    return true;
  }

  function fillLinks() {
    const displayUrl = makeUrl("/familiada/display/index.html", game.id, game.share_key_display);
    const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);
    const buzKey = game.share_key_buzzer;
    const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, buzKey || "");

    if (displayLink) displayLink.value = displayUrl;
    if (hostLink) hostLink.value = hostUrl;
    if (buzzerLink) buzzerLink.value = buzzerUrl;

    if (btnOpenDisplay) btnOpenDisplay.onclick = () => window.open(displayUrl, "_blank");
    if (btnOpenHost) btnOpenHost.onclick = () => window.open(hostUrl, "_blank");
    if (btnOpenBuzzer) btnOpenBuzzer.onclick = () => {
      if (!buzKey) return setMsg(msgDevices, "Brak share_key_buzzer w tej grze.");
      window.open(buzzerUrl, "_blank");
    };

    if (btnCopyDisplay) btnCopyDisplay.onclick = async () =>
      setMsg(msgDevices, (await copyToClipboard(displayUrl)) ? "Skopiowano link display." : "Nie mogę skopiować.");

    if (btnCopyHost) btnCopyHost.onclick = async () =>
      setMsg(msgDevices, (await copyToClipboard(hostUrl)) ? "Skopiowano link host." : "Nie mogę skopiować.");

    if (btnCopyBuzzer) btnCopyBuzzer.onclick = async () => {
      if (!buzKey) return setMsg(msgDevices, "Brak share_key_buzzer w tej grze.");
      setMsg(msgDevices, (await copyToClipboard(buzzerUrl)) ? "Skopiowano link buzzer." : "Nie mogę skopiować.");
    };
  }

  async function fetchPresenceSafe() {
    const { data, error } = await sb()
      .from("device_presence")
      .select("device_type,device_id,last_seen_at")
      .eq("game_id", game.id);

    if (error) return { ok: false, rows: [], error };
    return { ok: true, rows: data || [], error: null };
  }

  function applyPresence(rows) {
    const now = Date.now();

    const pickNewest = (t) =>
      rows
        .filter((r) => String(r.device_type || "").toLowerCase() === t)
        .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0] || null;

    const d = pickNewest("display");
    const h = pickNewest("host");
    const b = pickNewest("buzzer");

    const isOn = (row) => row?.last_seen_at && now - new Date(row.last_seen_at).getTime() < ONLINE_MS;

    badge(pillDisplay, isOn(d) ? "ok" : "bad", isOn(d) ? "OK" : "OFFLINE");
    badge(pillHost, isOn(h) ? "ok" : "bad", isOn(h) ? "OK" : "OFFLINE");
    badge(pillBuzzer, isOn(b) ? "ok" : "bad", isOn(b) ? "OK" : "OFFLINE");

    if (seenDisplay) seenDisplay.textContent = fmtSince(d?.last_seen_at);
    if (seenHost) seenHost.textContent = fmtSince(h?.last_seen_at);
    if (seenBuzzer) seenBuzzer.textContent = fmtSince(b?.last_seen_at);

    return {
      displayOnline: isOn(d),
      hostOnline: isOn(h),
      buzzerOnline: isOn(b),
      rows,
    };
  }

  function applyPresenceUnavailable() {
    badge(pillDisplay, "mid", "—");
    badge(pillHost, "mid", "—");
    badge(pillBuzzer, "mid", "—");
    if (seenDisplay) seenDisplay.textContent = "brak tabeli";
    if (seenHost) seenHost.textContent = "brak tabeli";
    if (seenBuzzer) seenBuzzer.textContent = "brak tabeli";
    return { displayOnline: false, hostOnline: false, buzzerOnline: false, rows: [] };
  }

  function hookBuzzerLog() {
    chControl.onBroadcast("BUZZER_EVT", (msg) => {
      const line = String(msg?.payload?.line ?? "").trim();
      if (!line) return;
      if (buzzEvtLast) buzzEvtLast.textContent = line;
      logBuzz(`BUZZER_EVT: ${line}`);
    });
    // ensure subscribed early
    chControl.whenReady().catch(() => {});
  }

  function hookResendButtons() {
    btnResendDisplay?.addEventListener("click", async () => {
      if (!lastCmd.display) return setMsg(msgDevices, "Brak last dla display.");
      await sendCmd("display", lastCmd.display, { remember: false });
      playSfx("ui_tick");
    });
    btnResendHost?.addEventListener("click", async () => {
      if (!lastCmd.host) return setMsg(msgDevices, "Brak last dla host.");
      await sendCmd("host", lastCmd.host, { remember: false });
      playSfx("ui_tick");
    });
    btnResendBuzzer?.addEventListener("click", async () => {
      if (!lastCmd.buzzer) return setMsg(msgDevices, "Brak last dla buzzer.");
      await sendCmd("buzzer", lastCmd.buzzer, { remember: false });
      playSfx("ui_tick");
    });
  }

  btnBuzzLogClear?.addEventListener("click", () => {
    if (buzzLog) buzzLog.textContent = "";
    if (buzzEvtLast) buzzEvtLast.textContent = "—";
  });

  let lastPresence = { displayOnline: false, hostOnline: false, buzzerOnline: false, rows: [] };

  async function tickPresence() {
    const res = await fetchPresenceSafe();
    if (!res.ok) {
      lastPresence = applyPresenceUnavailable();
      setMsg(msgDevices, "Brak tabeli device_presence (status = —).");
      return lastPresence;
    }
    lastPresence = applyPresence(res.rows);
    setMsg(msgDevices, "");
    return lastPresence;
  }

  async function start() {
    fillLinks();
    refreshLastCmdUI();
    hookResendButtons();
    hookBuzzerLog();

    await tickPresence();
    presenceTimer = setInterval(tickPresence, 1500);
  }

  function stop() {
    try { if (presenceTimer) clearInterval(presenceTimer); } catch {}
    presenceTimer = null;
  }

  return {
    game,
    start,
    stop,

    // presence
    get presence() { return lastPresence; },

    // realtime send
    sendCmd,

    // for game controller
    logBuzz,
  };
}
