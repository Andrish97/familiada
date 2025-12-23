import { sb } from "../../js/core/supabase.js";
import { rt } from "../../js/core/realtime.js";

const $ = (id) => document.getElementById(id);

const ONLINE_MS = 12_000;

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
    return true;
  } catch {
    return false;
  }
}

export function createDevices({ gameId, setMsgDevices }) {
  const pillDisplay = $("pillDisplay");
  const pillHost = $("pillHost");
  const pillBuzzer = $("pillBuzzer");

  const seenDisplay = $("seenDisplay");
  const seenHost = $("seenHost");
  const seenBuzzer = $("seenBuzzer");

  const lastCmdDisplay = $("lastCmdDisplay");
  const lastCmdHost = $("lastCmdHost");
  const lastCmdBuzzer = $("lastCmdBuzzer");

  const displayLink = $("displayLink");
  const hostLink = $("hostLink");
  const buzzerLink = $("buzzerLink");

  const btnCopyDisplay = $("btnCopyDisplay");
  const btnCopyHost = $("btnCopyHost");
  const btnCopyBuzzer = $("btnCopyBuzzer");

  const btnOpenDisplay = $("btnOpenDisplay");
  const btnOpenHost = $("btnOpenHost");
  const btnOpenBuzzer = $("btnOpenBuzzer");

  const btnResendDisplay = $("btnResendDisplay");
  const btnResendHost = $("btnResendHost");
  const btnResendBuzzer = $("btnResendBuzzer");

  const LS_KEY = (kind) => `familiada:lastcmd:${gameId}:${kind}`;
  const lastCmd = { display: null, host: null, buzzer: null };

  // channels przez realtime manager
  const chDisplay = rt(`familiada-display:${gameId}`);
  const chHost = rt(`familiada-host:${gameId}`);
  const chBuzzer = rt(`familiada-buzzer:${gameId}`);

  function refreshLastCmdUI() {
    if (lastCmdDisplay) lastCmdDisplay.textContent = lastCmd.display || "—";
    if (lastCmdHost) lastCmdHost.textContent = lastCmd.host || "—";
    if (lastCmdBuzzer) lastCmdBuzzer.textContent = lastCmd.buzzer || "—";
  }

  function loadLastCmdFromStorage() {
    lastCmd.display = localStorage.getItem(LS_KEY("display"));
    lastCmd.host = localStorage.getItem(LS_KEY("host"));
    lastCmd.buzzer = localStorage.getItem(LS_KEY("buzzer"));
  }

  function saveLastCmdToStorage(kind, line) {
    try { localStorage.setItem(LS_KEY(kind), String(line)); } catch {}
  }

  function eventName(target) {
    if (target === "display") return "DISPLAY_CMD";
    if (target === "host") return "HOST_CMD";
    return "BUZZER_CMD";
  }

  function channelFor(target) {
    if (target === "display") return chDisplay;
    if (target === "host") return chHost;
    return chBuzzer;
  }

  async function send(target, line) {
    const t = String(target || "").toLowerCase();
    const l = String(line ?? "").trim();
    if (!l) return;

    await channelFor(t).sendBroadcast(eventName(t), { line: l });

    lastCmd[t] = l;
    saveLastCmdToStorage(t, l);
    refreshLastCmdUI();
  }

  async function fetchPresenceSafe() {
    const { data, error } = await sb()
      .from("device_presence")
      .select("device_type,device_id,last_seen_at")
      .eq("game_id", gameId);

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
  }

  function applyPresenceUnavailable() {
    badge(pillDisplay, "mid", "—");
    badge(pillHost, "mid", "—");
    badge(pillBuzzer, "mid", "—");
    if (seenDisplay) seenDisplay.textContent = "brak tabeli";
    if (seenHost) seenHost.textContent = "brak tabeli";
    if (seenBuzzer) seenBuzzer.textContent = "brak tabeli";
  }

  async function fillLinks() {
    const { data, error } = await sb()
      .from("games")
      .select("id,share_key_display,share_key_host,share_key_buzzer")
      .eq("id", gameId)
      .single();

    if (error) throw error;

    const displayUrl = makeUrl("/familiada/display/index.html", data.id, data.share_key_display);
    const hostUrl = makeUrl("/familiada/host.html", data.id, data.share_key_host);
    const buzKey = data.share_key_buzzer;
    const buzzerUrl = makeUrl("/familiada/buzzer.html", data.id, buzKey || "");

    if (displayLink) displayLink.value = displayUrl;
    if (hostLink) hostLink.value = hostUrl;
    if (buzzerLink) buzzerLink.value = buzzerUrl;

    btnOpenDisplay && (btnOpenDisplay.onclick = () => window.open(displayUrl, "_blank"));
    btnOpenHost && (btnOpenHost.onclick = () => window.open(hostUrl, "_blank"));
    btnOpenBuzzer && (btnOpenBuzzer.onclick = () => {
      if (!buzKey) return setMsgDevices?.("Brak share_key_buzzer w tej grze.");
      window.open(buzzerUrl, "_blank");
    });

    btnCopyDisplay && (btnCopyDisplay.onclick = async () =>
      setMsgDevices?.((await copyToClipboard(displayUrl)) ? "Skopiowano link display." : "Nie mogę skopiować."));
    btnCopyHost && (btnCopyHost.onclick = async () =>
      setMsgDevices?.((await copyToClipboard(hostUrl)) ? "Skopiowano link host." : "Nie mogę skopiować."));
    btnCopyBuzzer && (btnCopyBuzzer.onclick = async () => {
      if (!buzKey) return setMsgDevices?.("Brak share_key_buzzer w tej grze.");
      setMsgDevices?.((await copyToClipboard(buzzerUrl)) ? "Skopiowano link buzzer." : "Nie mogę skopiować.");
    });
  }


  async function initPresencePolling() {
    const tick = async () => {
      const res = await fetchPresenceSafe();
      if (!res.ok) {
        applyPresenceUnavailable();
        setMsgDevices?.("Brak tabeli device_presence (status = —).");
        return;
      }
      applyPresence(res.rows);
      setMsgDevices?.("");
    };

    await tick();
    setInterval(tick, 1500);
  }

  async function init() {
    loadLastCmdFromStorage();
    refreshLastCmdUI();

    await fillLinks();
    initBuzzerEvtLog();
    await initPresencePolling();

    // resend przyciski
    btnResendDisplay?.addEventListener("click", async () => {
      if (!lastCmd.display) return setMsgDevices?.("Brak last dla display.");
      await send("display", lastCmd.display);
      setMsgDevices?.(`display <= ${lastCmd.display}`);
    });
    btnResendHost?.addEventListener("click", async () => {
      if (!lastCmd.host) return setMsgDevices?.("Brak last dla host.");
      await send("host", lastCmd.host);
      setMsgDevices?.(`host <= ${lastCmd.host}`);
    });
    btnResendBuzzer?.addEventListener("click", async () => {
      if (!lastCmd.buzzer) return setMsgDevices?.("Brak last dla buzzer.");
      await send("buzzer", lastCmd.buzzer);
      setMsgDevices?.(`buzzer <= ${lastCmd.buzzer}`);
    });
  }

  return {
    init,
    sendDisplay: (line) => send("display", line),
    sendHost: (line) => send("host", line),
    sendBuzzer: (line) => send("buzzer", line),
  };
}
