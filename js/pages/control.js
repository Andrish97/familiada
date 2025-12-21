import { sb } from "../js/core/supabase.js";
import { playSfx } from "../js/core/sfx.js";

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

// ===== UI refs
const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

const gameLabel = $("gameLabel");
const gameMeta = $("gameMeta");

const msgDevices = $("msgDevices");
const msgCmd = $("msgCmd");

// links + pills + seen + lastcmd
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

// manual send
const manualTarget = $("manualTarget");
const manualLine = $("manualLine");
const btnManualSend = $("btnManualSend");

// tabs
document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    b.classList.add("active");

    const tab = b.dataset.tab;
    document.querySelectorAll("[data-panel]").forEach(p => p.style.display = "none");
    document.querySelector(`[data-panel="${tab}"]`).style.display = "";
  });
});

// ===== state
let game = null;

// ostatnia komenda per device, trzymamy też lokalnie (UI)
const lastCmd = {
  display: null,
  host: null,
  buzzer: null,
};

const ONLINE_MS = 12_000;

// ===== helpers
function setMsg(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function badge(el, status, text) {
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

// ===== auth / load game
async function ensureAuth() {
  const { data } = await sb().auth.getUser();
  const user = data?.user || null;
  if (!user) {
    // u Ciebie pewnie jest router/login – tu minimalnie:
    location.href = "../login.html";
    return null;
  }
  who.textContent = user.email || user.id;
  return user;
}

async function loadGameOrThrow() {
  if (!gameId) throw new Error("Brak ?id w URL.");

  // owner ma RLS -> może czytać
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_control,share_key_poll")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Gra nie istnieje albo brak uprawnień.");

  return data;
}

// ===== device presence read (device_presence)
async function fetchPresence() {
  // Oczekiwany schemat:
  // device_presence: game_id, device_type ('display'|'host'|'buzzer'), device_id, last_seen_at
  const { data, error } = await sb()
    .from("device_presence")
    .select("device_type,device_id,last_seen_at")
    .eq("game_id", game.id);

  if (error) {
    setMsg(msgDevices, `presence: ${error.message}`);
    return [];
  }
  return data || [];
}

function applyPresence(rows) {
  const now = Date.now();

  const byType = (t) => {
    const list = rows.filter(r => (r.device_type || "").toLowerCase() === t);
    // bierzemy najświeższy (gdyby było kilka device_id)
    list.sort((a,b) => new Date(b.last_seen_at) - new Date(a.last_seen_at));
    return list[0] || null;
  };

  const d = byType("display");
  const h = byType("host");
  const b = byType("buzzer");

  const isOn = (row) => {
    if (!row?.last_seen_at) return false;
    return (now - new Date(row.last_seen_at).getTime()) < ONLINE_MS;
  };

  badge(pillDisplay, isOn(d) ? "ok" : "bad", isOn(d) ? "OK" : "OFFLINE");
  badge(pillHost,    isOn(h) ? "ok" : "bad", isOn(h) ? "OK" : "OFFLINE");
  badge(pillBuzzer,  isOn(b) ? "ok" : "bad", isOn(b) ? "OK" : "OFFLINE");

  seenDisplay.textContent = fmtSince(d?.last_seen_at);
  seenHost.textContent = fmtSince(h?.last_seen_at);
  seenBuzzer.textContent = fmtSince(b?.last_seen_at);
}

// ===== command send
function channelName(target) {
  // zgodnie z Twoimi plikami:
  if (target === "display") return `familiada-display:${game.id}`;
  if (target === "host") return `familiada-host:${game.id}`;
  return `familiada-buzzer:${game.id}`;
}

function eventName(target) {
  if (target === "display") return "DISPLAY_CMD";
  if (target === "host") return "HOST_CMD";
  return "BUZZER_CMD";
}

async function sendCmd(target, line) {
  const t = String(target || "").toLowerCase();
  const l = String(line ?? "").trim();
  if (!l) return;

  // realtime broadcast
  const ch = sb().channel(channelName(t));
  await ch.subscribe();

  const { error } = await ch.send({
    type: "broadcast",
    event: eventName(t),
    payload: { line: l },
  });

  sb().removeChannel(ch);

  if (error) throw error;

  // zapamiętaj (local + DB, jeśli masz device_state)
  lastCmd[t] = l;
  refreshLastCmdUI();

  playSfx("ui_tick");

  // Opcjonalnie: zapisz do DB (jeśli masz tabelę device_state)
  // await saveLastCmdToDb(t, l).catch(()=>{});
}

function refreshLastCmdUI() {
  lastCmdDisplay.textContent = lastCmd.display || "—";
  lastCmdHost.textContent = lastCmd.host || "—";
  lastCmdBuzzer.textContent = lastCmd.buzzer || "—";
}

// ===== links
function fillLinks() {
  // ścieżki dopasuj do Twojego projektu
  const displayUrl = makeUrl("/main/display/index.html", game.id, game.share_key_display);
  const hostUrl    = makeUrl("/main/host/index.html",    game.id, game.share_key_host);
  const buzzerUrl  = makeUrl("/main/buzzer/index.html",  game.id, game.share_key_buzzer || game.share_key_host /* jeśli jeszcze nie masz buzzer key */);

  displayLink.value = displayUrl;
  hostLink.value = hostUrl;
  buzzerLink.value = buzzerUrl;

  // open
  btnOpenDisplay.onclick = () => window.open(displayUrl, "_blank");
  btnOpenHost.onclick = () => window.open(hostUrl, "_blank");
  btnOpenBuzzer.onclick = () => window.open(buzzerUrl, "_blank");

  // copy
  btnCopyDisplay.onclick = async () => setMsg(msgDevices, (await copyToClipboard(displayUrl)) ? "Skopiowano link display." : "Nie mogę skopiować.");
  btnCopyHost.onclick = async () => setMsg(msgDevices, (await copyToClipboard(hostUrl)) ? "Skopiowano link host." : "Nie mogę skopiować.");
  btnCopyBuzzer.onclick = async () => setMsg(msgDevices, (await copyToClipboard(buzzerUrl)) ? "Skopiowano link buzzer." : "Nie mogę skopiować.");
}

// ===== resend
btnResendDisplay.onclick = async () => {
  if (!lastCmd.display) return setMsg(msgCmd, "Brak ostatniej komendy dla display.");
  await sendCmd("display", lastCmd.display);
  setMsg(msgCmd, `Display <= ${lastCmd.display}`);
};
btnResendHost.onclick = async () => {
  if (!lastCmd.host) return setMsg(msgCmd, "Brak ostatniej komendy dla host.");
  await sendCmd("host", lastCmd.host);
  setMsg(msgCmd, `Host <= ${lastCmd.host}`);
};
btnResendBuzzer.onclick = async () => {
  if (!lastCmd.buzzer) return setMsg(msgCmd, "Brak ostatniej komendy dla buzzer.");
  await sendCmd("buzzer", lastCmd.buzzer);
  setMsg(msgCmd, `Buzzer <= ${lastCmd.buzzer}`);
};

// ===== buttons with data-send
document.addEventListener("click", async (e) => {
  const btn = e.target?.closest?.("[data-send]");
  if (!btn) return;

  const t = btn.dataset.send;
  const line = btn.dataset.line;

  try {
    await sendCmd(t, line);
    setMsg(msgCmd, `${t} <= ${line}`);
  } catch (err) {
    setMsg(msgCmd, `Błąd: ${err?.message || String(err)}`);
  }
});

// ===== manual send
btnManualSend.onclick = async () => {
  try {
    await sendCmd(manualTarget.value, manualLine.value);
    setMsg(msgCmd, `${manualTarget.value} <= ${manualLine.value}`);
    manualLine.value = "";
  } catch (err) {
    setMsg(msgCmd, `Błąd: ${err?.message || String(err)}`);
  }
};

// ===== topbar
btnBack.onclick = () => (location.href = "../builder/index.html");
btnLogout.onclick = async () => {
  await sb().auth.signOut().catch(()=>{});
  location.href = "../login.html";
};

// ===== boot
async function main() {
  setMsg(msgDevices, "");
  setMsg(msgCmd, "");

  const user = await ensureAuth();
  if (!user) return;

  game = await loadGameOrThrow();

  gameLabel.textContent = `Control — ${game.name}`;
  gameMeta.textContent = `${game.type} / ${game.status}`;

  refreshLastCmdUI();
  fillLinks();

  // presence loop
  const tick = async () => {
    const rows = await fetchPresence();
    applyPresence(rows);
  };

  await tick();
  setInterval(tick, 1500);
}

main().catch((e) => {
  setMsg(msgDevices, e?.message || String(e));
});

