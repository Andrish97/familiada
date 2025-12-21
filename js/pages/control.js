import { sb } from "../core/supabase.js";
import { playSfx } from "../core/sfx.js";
import { requireAuth, signOut } from "../core/auth.js";

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

// ===== tabs (bezpiecznie)
document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");

    const tab = b.dataset.tab;
    document.querySelectorAll("[data-panel]").forEach((p) => (p.style.display = "none"));
    const panel = document.querySelector(`[data-panel="${tab}"]`);
    if (panel) panel.style.display = "";
  });
});

// ===== state
let game = null;

const ONLINE_MS = 12_000;

// last command (persist per game)
const LS_KEY = (kind) => `familiada:lastcmd:${gameId}:${kind}`;
const lastCmd = {
  display: null,
  host: null,
  buzzer: null,
};

// ===== helpers
function setMsg(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

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

function loadLastCmdFromStorage() {
  lastCmd.display = localStorage.getItem(LS_KEY("display"));
  lastCmd.host = localStorage.getItem(LS_KEY("host"));
  lastCmd.buzzer = localStorage.getItem(LS_KEY("buzzer"));
}

function saveLastCmdToStorage(kind, line) {
  try {
    localStorage.setItem(LS_KEY(kind), String(line));
  } catch {}
}

function refreshLastCmdUI() {
  if (lastCmdDisplay) lastCmdDisplay.textContent = lastCmd.display || "—";
  if (lastCmdHost) lastCmdHost.textContent = lastCmd.host || "—";
  if (lastCmdBuzzer) lastCmdBuzzer.textContent = lastCmd.buzzer || "—";
}

// ===== auth / load game
async function ensureAuthOrRedirect() {
  const user = await requireAuth("../login.html"); // dopasuj jeśli masz inną ścieżkę
  if (who) who.textContent = user?.email || user?.id || "—";
  return user;
}

async function loadGameOrThrow() {
  if (!gameId) throw new Error("Brak ?id w URL.");

  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_control,share_key_poll,share_key_buzzer")
    .eq("id", gameId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("Gra nie istnieje albo brak uprawnień.");

  return data;
}

// ===== presence (tabela device_presence – jeśli istnieje)
async function fetchPresenceSafe() {
  // jeśli tabeli nie ma -> Supabase zwróci error, my po prostu uznamy OFFLINE
  const { data, error } = await sb()
    .from("device_presence")
    .select("device_type,device_id,last_seen_at")
    .eq("game_id", game.id);

  if (error) return { ok: false, rows: [], error };
  return { ok: true, rows: data || [], error: null };
}

function applyPresence(rows) {
  const now = Date.now();

  const pickNewest = (t) => {
    const list = rows
      .filter((r) => String(r.device_type || "").toLowerCase() === t)
      .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at));
    return list[0] || null;
  };

  const d = pickNewest("display");
  const h = pickNewest("host");
  const b = pickNewest("buzzer");

  const isOn = (row) => {
    if (!row?.last_seen_at) return false;
    return now - new Date(row.last_seen_at).getTime() < ONLINE_MS;
  };

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

// ===== command send (Twoje obecne kanały + eventy)
function channelName(target) {
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

  const ch = sb().channel(channelName(t));

  await ch.subscribe();

  const { error } = await ch.send({
    type: "broadcast",
    event: eventName(t),
    payload: { line: l },
  });

  sb().removeChannel(ch);

  if (error) throw error;

  // pamiętaj ostatnią komendę (localStorage)
  lastCmd[t] = l;
  saveLastCmdToStorage(t, l);
  refreshLastCmdUI();

  playSfx("ui_tick");
}

// ===== links
function fillLinks() {
  // dopasuj ścieżki do Twojego GH pages / projektu
  const displayUrl = makeUrl("familiada/display/index.html", game.id, game.share_key_display);
  const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);

  // buzzer: jeśli masz share_key_buzzer — użyj. Jeśli nie, tymczasowo host key (żeby nie blokować pracy)
  const buzKey = game.share_key_buzzer || game.share_key_host;
  const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, buzKey);

  if (displayLink) displayLink.value = displayUrl;
  if (hostLink) hostLink.value = hostUrl;
  if (buzzerLink) buzzerLink.value = buzzerUrl;

  // open
  if (btnOpenDisplay) btnOpenDisplay.onclick = () => window.open(displayUrl, "_blank");
  if (btnOpenHost) btnOpenHost.onclick = () => window.open(hostUrl, "_blank");
  if (btnOpenBuzzer) btnOpenBuzzer.onclick = () => window.open(buzzerUrl, "_blank");

  // copy
  if (btnCopyDisplay)
    btnCopyDisplay.onclick = async () =>
      setMsg(msgDevices, (await copyToClipboard(displayUrl)) ? "Skopiowano link display." : "Nie mogę skopiować.");

  if (btnCopyHost)
    btnCopyHost.onclick = async () =>
      setMsg(msgDevices, (await copyToClipboard(hostUrl)) ? "Skopiowano link host." : "Nie mogę skopiować.");

  if (btnCopyBuzzer)
    btnCopyBuzzer.onclick = async () =>
      setMsg(msgDevices, (await copyToClipboard(buzzerUrl)) ? "Skopiowano link buzzer." : "Nie mogę skopiować.");
}

// ===== resend buttons
if (btnResendDisplay)
  btnResendDisplay.onclick = async () => {
    if (!lastCmd.display) return setMsg(msgCmd, "Brak ostatniej komendy dla display.");
    await sendCmd("display", lastCmd.display);
    setMsg(msgCmd, `Display <= ${lastCmd.display}`);
  };

if (btnResendHost)
  btnResendHost.onclick = async () => {
    if (!lastCmd.host) return setMsg(msgCmd, "Brak ostatniej komendy dla host.");
    await sendCmd("host", lastCmd.host);
    setMsg(msgCmd, `Host <= ${lastCmd.host}`);
  };

if (btnResendBuzzer)
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
if (btnManualSend)
  btnManualSend.onclick = async () => {
    try {
      await sendCmd(manualTarget?.value, manualLine?.value);
      setMsg(msgCmd, `${manualTarget?.value} <= ${manualLine?.value}`);
      if (manualLine) manualLine.value = "";
    } catch (err) {
      setMsg(msgCmd, `Błąd: ${err?.message || String(err)}`);
    }
  };

// ===== topbar
if (btnBack) btnBack.onclick = () => (location.href = "../builder/index.html");
if (btnLogout)
  btnLogout.onclick = async () => {
    await signOut().catch(() => {});
    location.href = "../login.html";
  };

// ===== boot
async function main() {
  setMsg(msgDevices, "");
  setMsg(msgCmd, "");

  await ensureAuthOrRedirect();

  game = await loadGameOrThrow();

  if (gameLabel) gameLabel.textContent = `Control — ${game.name}`;
  if (gameMeta) gameMeta.textContent = `${game.type} / ${game.status}`;

  loadLastCmdFromStorage();
  refreshLastCmdUI();
  fillLinks();

  // presence loop
  const tick = async () => {
    const res = await fetchPresenceSafe();
    if (!res.ok) {
      applyPresenceUnavailable();
      // pokazuj ten komunikat tylko raz / delikatnie
      setMsg(msgDevices, "Brak tabeli device_presence (status urządzeń = —).");
      return;
    }
    applyPresence(res.rows);
    setMsg(msgDevices, "");
  };

  await tick();
  setInterval(tick, 1500);
}

main().catch((e) => {
  setMsg(msgDevices, e?.message || String(e));
});

