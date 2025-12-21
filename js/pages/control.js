// js/pages/control.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { playSfx } from "../core/sfx.js";

/* =========================================================
   Guard + params
========================================================= */
guardDesktopOnly({ message: "Sterowanie Familiady jest dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

/* =========================================================
   DOM refs (zgodne z Twoim HTML)
========================================================= */
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");
const gameLabel = document.getElementById("gameLabel");

const tabs = Array.from(document.querySelectorAll(".tab"));
const panels = Array.from(document.querySelectorAll(".panel"));

const msgDevices = document.getElementById("msgDevices");
const msgGame = document.getElementById("msgGame");

const pillHost = document.getElementById("pillHost");
const pillBuzzer = document.getElementById("pillBuzzer");
const pillDisplay = document.getElementById("pillDisplay");

const hostLink = document.getElementById("hostLink");
const buzzerLink = document.getElementById("buzzerLink");
const displayLink = document.getElementById("displayLink");

const btnCopyHost = document.getElementById("btnCopyHost");
const btnCopyBuzzer = document.getElementById("btnCopyBuzzer");
const btnCopyDisplay = document.getElementById("btnCopyDisplay");

const btnOpenHost = document.getElementById("btnOpenHost");
const btnOpenBuzzer = document.getElementById("btnOpenBuzzer");
const btnOpenDisplay = document.getElementById("btnOpenDisplay");

// (na razie zostawiamy Twoje przyciski “gra”, ale to będzie przepinane)
const btnStartGame = document.getElementById("btnStartGame");
const btnStartRound = document.getElementById("btnStartRound");
const btnResetBuzzer = document.getElementById("btnResetBuzzer");

const stRound = document.getElementById("stRound");
const stMult = document.getElementById("stMult");
const stStep = document.getElementById("stStep");
const stBuzz = document.getElementById("stBuzz");
const stTeam = document.getElementById("stTeam");
const stStrikes = document.getElementById("stStrikes");
const stSum = document.getElementById("stSum");

const btnPlay = document.getElementById("btnPlay");
const btnPass = document.getElementById("btnPass");
const btnX = document.getElementById("btnX");

const answersBox = document.getElementById("answers");
const btnRevealNext = document.getElementById("btnRevealNext");
const btnEndRound = document.getElementById("btnEndRound");

/* =========================================================
   UI helpers
========================================================= */
function setMsg(where, t) {
  where.textContent = t || "";
  if (t) setTimeout(() => (where.textContent = ""), 1400);
}
function setPill(pill, ok, text) {
  pill.classList.remove("ok", "bad");
  pill.classList.add(ok ? "ok" : "bad");
  pill.textContent = text;
}
function tabSwitch(name) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  panels.forEach((p) => (p.style.display = p.dataset.panel === name ? "" : "none"));
}
tabs.forEach((t) => t.addEventListener("click", () => tabSwitch(t.dataset.tab)));

function buildLink(file, params) {
  const u = new URL(file, location.href);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
function openPopup(url, name) {
  return window.open(url, name, "noopener,noreferrer");
}

/* =========================================================
   Realtime broadcast channels (tak jak dziś)
========================================================= */
let displayCh = null;
let hostCh = null;
let buzzerCh = null;
let controlCh = null;

function ensureDisplayChannel(gid) {
  if (displayCh) return displayCh;
  displayCh = sb().channel(`familiada-display:${gid}`).subscribe();
  return displayCh;
}
function ensureHostChannel(gid) {
  if (hostCh) return hostCh;
  hostCh = sb().channel(`familiada-host:${gid}`).subscribe();
  return hostCh;
}
function ensureBuzzerChannel(gid) {
  if (buzzerCh) return buzzerCh;
  buzzerCh = sb().channel(`familiada-buzzer:${gid}`).subscribe();
  return buzzerCh;
}
function ensureControlChannel(gid) {
  if (controlCh) return controlCh;
  controlCh = sb()
    .channel(`familiada-control:${gid}`)
    .on("broadcast", { event: "BUZZER_EVT" }, async (msg) => {
      const line = String(msg?.payload?.line ?? "").trim();
      if (!line) return;
      console.log("[control] BUZZER_EVT:", line);

      // minimum: ustaw stan PUSHED w DB (żeby refresh buzzera trzymał zwycięzcę)
      // oraz wpisz winner do “statusów” UI (na razie lokalnie)
      if (line === "CLICK A") {
        await setBuzzerMode("PUSHED_A");
        playSfx("buzzer_press");
      }
      if (line === "CLICK B") {
        await setBuzzerMode("PUSHED_B");
        playSfx("buzzer_press");
      }
    })
    .subscribe();
  return controlCh;
}

async function sendToDisplay(gid, line) {
  const ch = ensureDisplayChannel(gid);
  await ch.send({ type: "broadcast", event: "DISPLAY_CMD", payload: { line: String(line) } });
}
async function sendToHost(gid, line) {
  const ch = ensureHostChannel(gid);
  await ch.send({ type: "broadcast", event: "HOST_CMD", payload: { line: String(line) } });
}
async function sendToBuzzer(gid, line) {
  const ch = ensureBuzzerChannel(gid);
  await ch.send({ type: "broadcast", event: "BUZZER_CMD", payload: { line: String(line) } });
}

/* =========================================================
   DB: game + snapshot urządzeń
========================================================= */
let game = null;
let devices = null; // ostatni snapshot.devices

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_control,share_key_display,share_key_host,share_key_buzzer")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * CONTROL ma pełny dostęp (auth) – ale i tak korzystamy z snapshotu,
 * bo to jest “źródło prawdy” dla UI po refreshu.
 */
async function getSnapshotControl() {
  const { data, error } = await sb().rpc("get_device_snapshot", {
    p_game_id: gameId,
    p_kind: "control",
    p_key: game?.share_key_control || "", // jeśli kontrol też ma share_key
  });
  if (error) throw error;
  if (!data?.ok) throw new Error("Brak dostępu do snapshotu (control).");
  return data; // {ok, game, devices}
}

/**
 * Zapisuje stan urządzeń w DB:
 * - to jest “pamięć” po refreshu
 * - a control równolegle wysyła broadcast
 */
async function setDeviceState(patch) {
  const { error } = await sb().rpc("set_device_state", {
    p_game_id: gameId,
    p_kind: "control",
    p_patch: patch,
  });
  if (error) throw error;
}

/* =========================================================
   Device state setters (DB + broadcast)
========================================================= */
async function setDisplayMode(mode) {
  // DB
  await setDeviceState({ display_mode: String(mode).toUpperCase() });
  // broadcast (żeby display reagował natychmiast)
  if (mode === "QR") {
    await sendToDisplay(gameId, "MODE QR");
    await sendToDisplay(gameId, `QR HOST "${hostLink.value}" BUZZER "${buzzerLink.value}"`);
  } else if (mode === "GRA") {
    await sendToDisplay(gameId, "MODE GRA");
  } else {
    await sendToDisplay(gameId, "MODE BLACK");
  }
}

async function setDisplayScene(sceneMode) {
  await setDeviceState({ display_scene: String(sceneMode).toUpperCase() });
  await sendToDisplay(gameId, `MODE ${String(sceneMode).toUpperCase()}`);
}

async function setBuzzerMode(mode) {
  const mm = String(mode).toUpperCase();
  await setDeviceState({ buzzer_mode: mm });
  if (mm === "OFF") await sendToBuzzer(gameId, "OFF");
  if (mm === "ON") await sendToBuzzer(gameId, "ON");
  if (mm === "PUSHED_A") await sendToBuzzer(gameId, "PUSHED A");
  if (mm === "PUSHED_B") await sendToBuzzer(gameId, "PUSHED B");
}

async function setHostHidden(hidden) {
  await setDeviceState({ host_hidden: !!hidden });
  await sendToHost(gameId, hidden ? "OFF" : "ON");
}

async function setHostText(text) {
  const t = String(text ?? "");
  await setDeviceState({ host_text: t });
  await sendToHost(gameId, `SET "${t.replace(/"/g, '\\"')}"`);
}

async function clearHost() {
  await setDeviceState({ host_text: "" });
  await sendToHost(gameId, "CLEAR");
}

/* =========================================================
   Presence / pills (czy urządzenia żyją)
   - bazujemy na devices.seen_*_at z snapshotu (albo tabeli)
========================================================= */
function pingOk(seenAtIso) {
  if (!seenAtIso) return false;
  const seen = new Date(seenAtIso).getTime();
  const now = Date.now();
  return now - seen <= 15000;
}

function syncPills() {
  const hostOk = pingOk(devices?.seen_host_at);
  const buzOk = pingOk(devices?.seen_buzzer_at);
  const dispOk = pingOk(devices?.seen_display_at);

  setPill(pillHost, hostOk, hostOk ? "HOST: OK" : "HOST: BRAK");
  setPill(pillBuzzer, buzOk, buzOk ? "BUZZER: OK" : "BUZZER: BRAK");
  setPill(pillDisplay, dispOk, dispOk ? "DISPLAY: OK" : "DISPLAY: BRAK");
}

/* =========================================================
   Minimal “game tab” (na razie placeholdery)
========================================================= */
function resetGameUi() {
  // to i tak poleci do kosza jak zaczniemy robić rundy wg nowego schematu
  stRound.textContent = "—";
  stMult.textContent = "—";
  stStep.textContent = "—";
  stBuzz.textContent = "—";
  stTeam.textContent = "—";
  stStrikes.textContent = "0";
  stSum.textContent = "0";

  answersBox.innerHTML = "";
  btnPlay.disabled = true;
  btnPass.disabled = true;
  btnX.disabled = true;
  btnRevealNext.disabled = true;
  btnEndRound.disabled = true;
  btnResetBuzzer.disabled = false;
}

async function quickStartShow() {
  // intro na PC operatora (jak chcesz)
  playSfx("show_intro");

  // display: gra + logo
  await setDisplayMode("GRA");
  await setDisplayScene("LOGO");

  // buzzer OFF (dopóki nie start buzzu)
  await setBuzzerMode("OFF");

  // host ON + wyczyść
  await setHostHidden(false);
  await clearHost();

  setMsg(msgGame, "Show ustawione: GRA/LOGO, buzzer OFF, host ON.");
}

async function quickRoundBuzzOn() {
  await setBuzzerMode("ON");
  setMsg(msgGame, "Buzzer: ON");
}

async function quickRoundBuzzOff() {
  await setBuzzerMode("OFF");
  setMsg(msgGame, "Buzzer: OFF");
}

/* =========================================================
   MAIN
========================================================= */
async function main() {
  if (!gameId) {
    alert("Brak parametru id w URL (control.html?id=...).");
    location.href = "builder.html";
    return;
  }

  const u = await requireAuth("index.html");
  who.textContent = u?.email || "—";

  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnBack.addEventListener("click", () => (location.href = "builder.html"));

  game = await loadGame();
  gameLabel.textContent = `Gra: ${game.name} • typ: ${game.type} • status: ${game.status}`;

  // linki urządzeń
  const hostUrl = buildLink("host.html", { id: game.id, key: game.share_key_host });
  const buzUrl = buildLink("buzzer.html", { id: game.id, key: game.share_key_buzzer });
  const dispUrl = buildLink("display/index.html", { id: game.id, key: game.share_key_display });

  hostLink.value = hostUrl;
  buzzerLink.value = buzUrl;
  displayLink.value = dispUrl;

  btnCopyHost.addEventListener("click", async () =>
    setMsg(msgDevices, (await copyText(hostUrl)) ? "Skopiowano link HOST." : "Nie udało się skopiować.")
  );
  btnCopyBuzzer.addEventListener("click", async () =>
    setMsg(msgDevices, (await copyText(buzUrl)) ? "Skopiowano link BUZZER." : "Nie udało się skopiować.")
  );
  btnCopyDisplay.addEventListener("click", async () =>
    setMsg(msgDevices, (await copyText(dispUrl)) ? "Skopiowano link DISPLAY." : "Nie udało się skopiować.")
  );

  // popupy
  btnOpenHost.addEventListener("click", () => {
    openPopup(hostUrl, "fam_host");
    setMsg(msgDevices, "Otworzono host.");
    ensureHostChannel(game.id);
  });

  btnOpenBuzzer.addEventListener("click", async () => {
    openPopup(buzUrl, "fam_buzzer");
    setMsg(msgDevices, "Otworzono buzzer.");
    ensureBuzzerChannel(game.id);

    // stan bazowy: OFF (DB + broadcast)
    await setBuzzerMode("OFF");
  });

  btnOpenDisplay.addEventListener("click", async () => {
    openPopup(dispUrl, "fam_display");
    setMsg(msgDevices, "Otworzono display.");
    ensureDisplayChannel(game.id);

    // pokaż QR na start (DB + broadcast)
    await setDisplayMode("QR");
  });

  // realtime odbiór klików z buzzera
  ensureControlChannel(game.id);

  // wczytaj snapshot (odtwarza pamięć po refreshu)
  const snap = await getSnapshotControl();
  devices = snap.devices || {};
  syncPills();

  // Timer: co 1.5s odśwież snapshot i pillki
  // (prosto i pewnie; realtime na devices dorobimy później)
  setInterval(async () => {
    try {
      const s = await getSnapshotControl();
      devices = s.devices || {};
      syncPills();
    } catch {}
  }, 1500);

  // --- “Gra” tab: NA RAZIE szybkie akcje ---
  resetGameUi();

  btnStartGame.addEventListener("click", quickStartShow);

  btnStartRound.addEventListener("click", quickRoundBuzzOn);

  btnResetBuzzer.addEventListener("click", async () => {
    await setBuzzerMode("ON"); // reset = wróć do ON
    setMsg(msgGame, "Buzzer reset → ON.");
  });

  // placeholdery – wyłączamy, bo to będzie nowa logika
  btnPlay.disabled = true;
  btnPass.disabled = true;
  btnX.disabled = true;
  btnRevealNext.disabled = true;
  btnEndRound.disabled = true;

  // klik anywhere = ui tick (jak lubisz)
  document.addEventListener("click", () => playSfx("ui_tick"), { once: true });

  tabSwitch("devices");

  // debug
  window.__ctl2 = {
    gameId: game.id,
    setDisplayMode,
    setDisplayScene,
    setBuzzerMode,
    setHostHidden,
    setHostText,
    clearHost,
    quickRoundBuzzOff,
    sendToDisplay,
    sendToHost,
    sendToBuzzer,
  };
  console.log("[control] __ctl2 ready", window.__ctl2);
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    alert(e?.message || "Błąd sterowania. Sprawdź konsolę (F12).");
  });
});
