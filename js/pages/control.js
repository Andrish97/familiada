// js/pages/control.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { playSfx } from "../core/sfx.js";

/* =========================================================
   Channels: DISPLAY / HOST / BUZZER + BUZZER_EVT to CONTROL
========================================================= */
let displayChannel = null;
function ensureDisplayChannel(gameId) {
  if (displayChannel) return displayChannel;
  displayChannel = sb().channel(`familiada-display:${gameId}`).subscribe();
  return displayChannel;
}
async function sendToDisplay(gameId, line) {
  const ch = ensureDisplayChannel(gameId);
  await ch.send({ type: "broadcast", event: "DISPLAY_CMD", payload: { line: String(line) } });
}

let hostChannel = null;
function ensureHostChannel(gameId) {
  if (hostChannel) return hostChannel;
  hostChannel = sb().channel(`familiada-host:${gameId}`).subscribe();
  return hostChannel;
}
async function sendToHost(gameId, line) {
  const ch = ensureHostChannel(gameId);
  await ch.send({ type: "broadcast", event: "HOST_CMD", payload: { line: String(line) } });
}

let buzzerChannel = null;
function ensureBuzzerChannel(gameId) {
  if (buzzerChannel) return buzzerChannel;
  buzzerChannel = sb().channel(`familiada-buzzer:${gameId}`).subscribe();
  return buzzerChannel;
}
async function sendToBuzzer(gameId, line) {
  const ch = ensureBuzzerChannel(gameId);
  await ch.send({ type: "broadcast", event: "BUZZER_CMD", payload: { line: String(line) } });
}

let controlChannel = null;
function ensureControlChannel(gameId) {
  if (controlChannel) return controlChannel;
  controlChannel = sb()
    .channel(`familiada-control:${gameId}`)
    .on("broadcast", { event: "BUZZER_EVT" }, (msg) => {
      const line = String(msg?.payload?.line ?? "").trim();
      onBuzzerEvt(line);
    })
    .subscribe();
  return controlChannel;
}

/* debug / konsola */
window.sendToDisplay = sendToDisplay;
window.sendToHost = sendToHost;
window.sendToBuzzer = sendToBuzzer;
window.ensureDisplayChannel = ensureDisplayChannel;
window.ensureHostChannel = ensureHostChannel;
window.ensureBuzzerChannel = ensureBuzzerChannel;
window.ensureControlChannel = ensureControlChannel;

/* =========================================================
   Guard + params
========================================================= */
guardDesktopOnly({ message: "Sterowanie Familiady jest dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

/* =========================================================
   DOM refs (Twoje obecne)
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

const btnStartGame = document.getElementById("btnStartGame");
const btnStartRound = document.getElementById("btnStartRound");
const btnResetBuzzer = document.getElementById("btnResetBuzzer"); // ukryjemy (reset out)

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
   Local state
========================================================= */
let displayWin = null;
let hostWin = null;
let buzzerWin = null;

let game = null;
let live = null;

let questions = [];          // za chwilę dopniemy porządek pytań
let activeQuestion = null;   // obiekt pytania (na razie minimalnie)
let introTimer = null;

/* =========================================================
   Helpers
========================================================= */
function setMsg(where, t) {
  where.textContent = t || "";
  if (t) setTimeout(() => (where.textContent = ""), 1800);
}

function setPill(pill, ok, text) {
  pill.classList.remove("ok", "bad");
  pill.classList.add(ok ? "ok" : "bad");
  pill.textContent = text;
}

function buildLink(file, params) {
  const u = new URL(file, location.href);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function tabSwitch(name) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  panels.forEach((p) => (p.style.display = p.dataset.panel === name ? "" : "none"));
}
tabs.forEach((t) => t.addEventListener("click", () => tabSwitch(t.dataset.tab)));

function pingOk(seenAtIso) {
  if (!seenAtIso) return false;
  const seen = new Date(seenAtIso).getTime();
  return (Date.now() - seen) <= 15000;
}

function openPopup(url, name) {
  return window.open(url, name, "noopener,noreferrer");
}

function upper(s){ return String(s ?? "").trim().toUpperCase(); }

/* =========================================================
   DB helpers
========================================================= */
async function ensureLive() {
  // bez gadania: spróbuj insert, jak conflict to OK
  await sb().from("live_state").insert({ game_id: gameId }).select().maybeSingle().catch(()=>{});
}

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,share_key_display,share_key_buzzer,share_key_host")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function readLive() {
  const { data, error } = await sb().from("live_state").select("*").eq("game_id", gameId).single();
  if (error) throw error;
  return data;
}

async function updateLive(patch) {
  const { error } = await sb().from("live_state").update(patch).eq("game_id", gameId);
  if (error) throw error;
}

/* =========================================================
   UI: wstrzykujemy brakujące elementy (TEAM_NAMES / BUZZ_CONFIRM)
========================================================= */
let ui = {
  teamWrap: null,
  inpA: null,
  inpB: null,
  btnTeamsOk: null,

  buzzWrap: null,
  btnBuzzOk: null,
  btnBuzzRetry: null,
};

function ensureExtraUi() {
  const gamePanel = document.querySelector('[data-panel="game"]');
  if (!gamePanel) return;

  // wrzućmy na górę panelu “Gra” dwa bloki narzędziowe
  if (!ui.teamWrap) {
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.marginBottom = "12px";
    wrap.innerHTML = `
      <div class="name">Drużyny</div>
      <div class="rowBtns" style="margin-top:10px;">
        <input class="inp" id="teamA" placeholder="Nazwa drużyny A (max 16)" maxlength="16" style="width:min(260px,100%);" />
        <input class="inp" id="teamB" placeholder="Nazwa drużyny B (max 16)" maxlength="16" style="width:min(260px,100%);" />
        <button class="btn gold" id="btnTeamsOk" type="button">Zatwierdź</button>
      </div>
      <div class="hint" style="margin-top:10px; opacity:.75;">Nazwy będą widoczne przez całą grę.</div>
    `;
    gamePanel.insertBefore(wrap, gamePanel.firstChild);
    ui.teamWrap = wrap;
    ui.inpA = wrap.querySelector("#teamA");
    ui.inpB = wrap.querySelector("#teamB");
    ui.btnTeamsOk = wrap.querySelector("#btnTeamsOk");

    ui.btnTeamsOk.addEventListener("click", async () => {
      const a = String(ui.inpA.value || "").trim().slice(0,16);
      const b = String(ui.inpB.value || "").trim().slice(0,16);
      if (!a || !b) { setMsg(msgGame, "Wpisz obie nazwy drużyn."); return; }

      await updateLive({ team_a_name: a, team_b_name: b });
      await go("GAME_READY");
    });
  }

  if (!ui.buzzWrap) {
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.marginBottom = "12px";
    wrap.innerHTML = `
      <div class="name">Buzzer — potwierdzenie</div>
      <div class="rowBtns" style="margin-top:10px;">
        <button class="btn gold" id="btnBuzzOk" type="button">Zatwierdź buzz</button>
        <button class="btn" id="btnBuzzRetry" type="button">Powtórz buzz</button>
      </div>
      <div class="hint" style="margin-top:10px; opacity:.75;">
        Używaj tylko w stanie BUZZ_CONFIRM.
      </div>
    `;
    gamePanel.insertBefore(wrap, gamePanel.firstChild);
    ui.buzzWrap = wrap;
    ui.btnBuzzOk = wrap.querySelector("#btnBuzzOk");
    ui.btnBuzzRetry = wrap.querySelector("#btnBuzzRetry");

    ui.btnBuzzRetry.addEventListener("click", async () => {
      if (!live || live.game_state !== "BUZZ_CONFIRM") return;
      await updateLive({
        buzzer_locked: false,
        buzzer_winner: null,
        buzzer_at: null,
      });
      await sendToBuzzer(game.id, "ON");
      await go("ROUND_BUZZ");
    });

    ui.btnBuzzOk.addEventListener("click", async () => {
      if (!live || live.game_state !== "BUZZ_CONFIRM") return;
      await go("ROUND_PLAY");
    });
  }
}

/* =========================================================
   DISPLAY helpers (Twoje API z GUIDE)
========================================================= */
function dots17(){ return "…".repeat(17); }

async function dispQR(hostUrl, buzUrl) {
  await sendToDisplay(game.id, "MODE QR");
  await sendToDisplay(game.id, `QR HOST "${hostUrl}" BUZZER "${buzUrl}"`);
}

async function dispBlack() {
  await sendToDisplay(game.id, "MODE BLACK");
}

async function dispGameEmpty() {
  // “tryb GRA, pusto” — najbezpieczniej: GRA + BLACK_SCREEN (ale w ramach GRA)
  // więc: MODE GRA, MODE ROUNDS, i czyść (bez animacji)
  await sendToDisplay(game.id, "MODE GRA");
  await sendToDisplay(game.id, "MODE ROUNDS");
  await sendToDisplay(game.id, 'RBATCH SUMA 000 R1 "" 00 R2 "" 00 R3 "" 00 R4 "" 00 R5 "" 00 R6 "" 00');
  await sendToDisplay(game.id, "TOP 000");
  await sendToDisplay(game.id, "LEFT 000");
  await sendToDisplay(game.id, "RIGHT 000");
  await sendToDisplay(game.id, 'LONG1 ""');
  await sendToDisplay(game.id, 'LONG2 ""');
}

async function dispShowLogoRainHorizontal() {
  await sendToDisplay(game.id, "MODE GRA");
  await sendToDisplay(game.id, 'LOGO LOAD "./logo_familiada.json"');
  // rain poziomo = axis left (albo right) — wybieram left
  await sendToDisplay(game.id, "MODE LOGO");
  await sendToDisplay(game.id, "LOGO SHOW ANIMIN rain left 22");
}

async function dispHideLogoRainHorizontal() {
  // schowaj logo rain poziomo
  await sendToDisplay(game.id, "LOGO HIDE ANIMOUT rain left 22");
}

async function dispRoundBoardIn() {
  // tablica ROUNDS wjeżdża edge od góry, wiersze: 5 odpowiedzi + 1 pusty
  const d = dots17();
  await sendToDisplay(game.id, "MODE GRA");
  await sendToDisplay(game.id, "MODE ROUNDS");
  await sendToDisplay(
    game.id,
    `RBATCH SUMA 000 ` +
      `R1 "${d}" —— ` +
      `R2 "${d}" —— ` +
      `R3 "${d}" —— ` +
      `R4 "${d}" —— ` +
      `R5 "${d}" —— ` +
      `R6 "" 00 ` +
      `ANIMIN edge top 18`
  );
  await sendToDisplay(game.id, "TOP 000");
  await sendToDisplay(game.id, "LEFT 000");
  await sendToDisplay(game.id, "RIGHT 000");
}

/* =========================================================
   GAME STATE MACHINE
========================================================= */
async function go(state) {
  if (!state) return;
  await updateLive({ game_state: state });
  // resztę zrobi subLive → enterState()
}

async function enterState(ls, prev) {
  // wyczyść stare timery
  if (introTimer) { clearTimeout(introTimer); introTimer = null; }

  const state = String(ls.game_state || "TOOLS_SETUP");

  // wchodzenie w stan: robimy “efekty uboczne” tylko gdy realnie zmiana
  const changed = state !== String(prev || "");

  if (changed) console.log("[control] ENTER", prev, "->", state);

  // UI: domyślnie blokady
  btnStartGame.disabled = true;
  btnStartRound.disabled = true;
  btnPlay.disabled = true;
  btnPass.disabled = true;
  btnX.disabled = true;
  btnRevealNext.disabled = true;
  btnEndRound.disabled = true;

  // usuń reset (masz rację — niepotrzebny)
  if (btnResetBuzzer) btnResetBuzzer.style.display = "none";

  // pokaż/ukryj bloki pomocnicze
  if (ui.teamWrap) ui.teamWrap.style.display = "none";
  if (ui.buzzWrap) ui.buzzWrap.style.display = "none";

  stStep.textContent = state;

  if (state === "TOOLS_SETUP") {
    // docelowo: operator ma “Otwórz wyświetlacz”, display czarny, buzzer OFF
    if (changed) {
      try { await dispBlack(); } catch {}
      try { await sendToBuzzer(game.id, "OFF"); } catch {}
    }
    // przejście dalej: gdy display wykryty
    if (pingOk(ls.seen_display_at)) {
      // auto przejście (żeby nie klikać miliona razy)
      await go("TOOLS_LINKS");
    }
    return;
  }

  if (state === "TOOLS_LINKS") {
    // QR na display + buzzer OFF
    if (changed) {
      try { await sendToBuzzer(game.id, "OFF"); } catch {}
      try { await dispQR(window.__ctl?.hostUrl || hostLink.value, window.__ctl?.buzUrl || buzzerLink.value); } catch {}
    }
    // przejście dalej: wszystkie wykryte
    if (pingOk(ls.seen_display_at) && pingOk(ls.seen_host_at) && pingOk(ls.seen_buzzer_at)) {
      await go("TEAM_NAMES");
    }
    return;
  }

  if (state === "TEAM_NAMES") {
    if (ui.teamWrap) ui.teamWrap.style.display = "";
    if (changed) {
      try { await dispBlack(); } catch {}
      try { await sendToBuzzer(game.id, "OFF"); } catch {}
    }
    // zostaje na ręcznym “Zatwierdź”
    return;
  }

  if (state === "GAME_READY") {
    // przycisk “Rozpocznij rozgrywkę”
    btnStartGame.disabled = false;
    btnStartGame.textContent = "Rozpocznij rozgrywkę";
    if (changed) {
      try { await dispGameEmpty(); } catch {}
      try { await sendToBuzzer(game.id, "OFF"); } catch {}
    }
    return;
  }

  if (state === "GAME_INTRO") {
    // sekwencja intro: show_intro x2, w 14s pierwszego pokaz logo rain poziomo
    if (changed) {
      btnStartGame.disabled = true;
      btnStartRound.disabled = true;

      playSfx("show_intro");
      setTimeout(() => playSfx("show_intro"), 80);

      setTimeout(() => {
        dispShowLogoRainHorizontal().catch(()=>{});
      }, 14000);

      // po ~30s (bez zgadywania do milisekundy) przechodzimy do ROUND_READY
      introTimer = setTimeout(() => {
        go("ROUND_READY").catch(()=>{});
      }, 30000);
    }
    return;
  }

  if (state === "ROUND_READY") {
    btnStartRound.disabled = false;
    btnStartRound.textContent = "Rozpocznij rundę";
    if (changed) {
      try { await sendToBuzzer(game.id, "OFF"); } catch {}
      // logo zostaje (jak opisałeś)
    }
    return;
  }

  if (state === "ROUND_TRANSITION_IN") {
    if (changed) {
      playSfx("round_transition");
      setTimeout(() => playSfx("ui_tick"), 1700);

      try { await dispHideLogoRainHorizontal(); } catch {}
      try { await dispRoundBoardIn(); } catch {}

      // pytanie na hosta (na razie: placeholder)
      const q = (activeQuestion?.text || "").trim();
      if (q) {
        try { await sendToHost(game.id, `SET "${q}"`); } catch {}
        try { await sendToHost(game.id, "ON"); } catch {}
      } else {
        // jak nie mamy jeszcze logiki wyboru pytania — wyczyść
        try { await sendToHost(game.id, "CLEAR"); } catch {}
        try { await sendToHost(game.id, "ON"); } catch {}
      }

      // buzzer ON
      try { await sendToBuzzer(game.id, "ON"); } catch {}

      // po krótkiej chwili przechodzimy do ROUND_BUZZ
      setTimeout(() => {
        go("ROUND_BUZZ").catch(()=>{});
      }, 900);
    }
    return;
  }

  if (state === "ROUND_BUZZ") {
    // buzzer ON czeka
    if (changed) {
      try { await sendToBuzzer(game.id, "ON"); } catch {}
      await updateLive({ buzzer_locked: false, buzzer_winner: null, buzzer_at: null }).catch(()=>{});
    }
    return;
  }

  if (state === "BUZZ_CONFIRM") {
    if (ui.buzzWrap) ui.buzzWrap.style.display = "";
    // podczas decyzji: buzzer OFF (czarny)
    if (changed) {
      try { await sendToBuzzer(game.id, "OFF"); } catch {}
    }
    return;
  }

  if (state === "ROUND_PLAY") {
    // tu dopniemy Twoje zasady “kapitani, X, 3 szanse, steal…”
    // na razie tylko odblokuj przyciski odpowiedzi / X
    btnX.disabled = false;
    // dalej wejdzie Twoje klikanie odpowiedzi (przerobimy po podpięciu pytań)
    return;
  }
}

/* =========================================================
   BUZZER_EVT handling (CLICK A/B)
========================================================= */
async function onBuzzerEvt(lineRaw) {
  const line = upper(lineRaw);
  if (!line.startsWith("CLICK ")) return;
  const team = line.endsWith("A") ? "A" : (line.endsWith("B") ? "B" : null);
  if (!team) return;

  // tylko w ROUND_BUZZ
  if (!live || live.game_state !== "ROUND_BUZZ") return;
  if (live.buzzer_locked) return;

  // natychmiast: dźwięk na control + “pushed” na buzzer
  playSfx("buzzer_press");
  await updateLive({
    buzzer_locked: true,
    buzzer_winner: team,
    buzzer_at: new Date().toISOString(),
  });

  try { await sendToBuzzer(game.id, team === "A" ? "PUSHED_A" : "PUSHED_B"); } catch {}

  // host dostaje informację “kto pierwszy”
  const q = (activeQuestion?.text || "").trim();
  const msg = q ? `${q}\n\nPierwszy: ${team}` : `Pierwszy: ${team}`;
  try { await sendToHost(game.id, `SET "${msg.replaceAll('"','\\"')}"`); } catch {}

  await go("BUZZ_CONFIRM");
}

/* =========================================================
   LIVE subscribe
========================================================= */
function subLive(onChange) {
  const ch = sb()
    .channel(`live_state:${gameId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      (payload) => onChange(payload.new, payload.old)
    )
    .subscribe();

  return () => sb().removeChannel(ch);
}

/* =========================================================
   UI sync (pills + status)
========================================================= */
function syncUi(ls) {
  const hostOk = pingOk(ls.seen_host_at);
  const buzOk = pingOk(ls.seen_buzzer_at);
  const dispOk = pingOk(ls.seen_display_at) || (!!displayWin && !displayWin.closed);

  setPill(pillHost, hostOk, hostOk ? "HOST: OK" : "HOST: BRAK");
  setPill(pillBuzzer, buzOk, buzOk ? "BUZZER: OK" : "BUZZER: BRAK");
  setPill(pillDisplay, dispOk, dispOk ? "DISPLAY: OK" : "DISPLAY: BRAK");

  stRound.textContent = String(ls.round_no ?? "—");
  stMult.textContent = String(ls.multiplier ?? "—");
  stBuzz.textContent = ls.buzzer_winner || "—";
  stTeam.textContent = ls.playing_team || "—";
  stStrikes.textContent = String(ls.strikes ?? 0);
  stSum.textContent = String(ls.round_sum ?? 0);

  // podpowiedź: stan
  stStep.textContent = String(ls.game_state ?? "—");
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

  await ensureLive();
  game = await loadGame();

  gameLabel.textContent = `Gra: ${game.name} • typ: ${game.kind} • status: ${game.status}`;

  // zbuduj linki narzędzi
  const hostUrl = buildLink("host.html", { id: game.id, key: game.share_key_host });
  const buzUrl = buildLink("buzzer.html", { id: game.id, key: game.share_key_buzzer });
  const dispUrl = buildLink("display/index.html", { id: game.id, key: game.share_key_display });

  hostLink.value = hostUrl;
  buzzerLink.value = buzUrl;
  displayLink.value = dispUrl;

  // expose do display QR itp.
  window.__ctl = { gameId: game.id, hostUrl, buzUrl, dispUrl };

  // kanały
  ensureControlChannel(game.id);

  // UI injection
  ensureExtraUi();

  // devices buttons
  btnCopyHost.addEventListener("click", async () =>
    setMsg(msgDevices, (await copyText(hostUrl)) ? "Skopiowano link HOST." : "Nie udało się skopiować.")
  );
  btnCopyBuzzer.addEventListener("click", async () =>
    setMsg(msgDevices, (await copyText(buzUrl)) ? "Skopiowano link BUZZER." : "Nie udało się skopiować.")
  );
  btnCopyDisplay.addEventListener("click", async () =>
    setMsg(msgDevices, (await copyText(dispUrl)) ? "Skopiowano link DISPLAY." : "Nie udało się skopiować.")
  );

  btnOpenHost.addEventListener("click", () => {
    hostWin = openPopup(hostUrl, "fam_host");
    setMsg(msgDevices, "Otworzono host.");
    ensureHostChannel(game.id);
  });

  btnOpenBuzzer.addEventListener("click", async () => {
    buzzerWin = openPopup(buzUrl, "fam_buzzer");
    setMsg(msgDevices, "Otworzono buzzer.");
    ensureBuzzerChannel(game.id);
    // zawsze domyślnie OFF
    setTimeout(() => sendToBuzzer(game.id, "OFF").catch(()=>{}), 350);
    setTimeout(() => sendToBuzzer(game.id, "OFF").catch(()=>{}), 900);
  });

  btnOpenDisplay.addEventListener("click", async () => {
    displayWin = openPopup(dispUrl, "fam_display");
    setMsg(msgDevices, "Otworzono display.");
    ensureDisplayChannel(game.id);
  });

  // “Start gry” i “Start rundy” robią przejścia stanów wg Twojego MD
  btnStartGame.addEventListener("click", async () => {
    if (!live) return;
    if (live.game_state === "GAME_READY") await go("GAME_INTRO");
  });

  btnStartRound.addEventListener("click", async () => {
    if (!live) return;
    if (live.game_state === "ROUND_READY") await go("ROUND_TRANSITION_IN");
  });

  // przełącznik tabów
  tabSwitch("devices");

  // subLive: 1) aktualizuj UI 2) wykonuj enterState
  let prevState = null;
  live = await readLive();
  syncUi(live);
  await enterState(live, prevState);
  prevState = live.game_state;

  subLive(async (n) => {
    live = n;
    syncUi(live);
    await enterState(live, prevState);
    prevState = live.game_state;
  });

  // start: jeśli pusty stan, ustaw TOOLS_SETUP i wymuś buzzer OFF
  if (!live?.game_state) {
    await updateLive({ game_state: "TOOLS_SETUP" }).catch(()=>{});
  } else {
    // bezpieczeństwo: buzzer zawsze OFF dopóki nie wejdziemy w ROUND_TRANSITION_IN
    sendToBuzzer(game.id, "OFF").catch(()=>{});
  }

  // klik pierwszy raz = odblokuj audio w przeglądarce
  document.addEventListener("click", () => playSfx("ui_tick"), { once: true });

  console.log("[control] ready", { gameId: game.id });
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    alert("Błąd sterowania. Sprawdź konsolę (F12).");
  });
});
