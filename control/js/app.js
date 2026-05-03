// /familiada/js/pages/controlapp.js
import { confirmModal } from "../../js/core/modal.js?v=v2026-05-03T21160";
import { getUiLang, initI18n, t } from "../../translation/translation.js?v=v2026-05-03T21160";
import { v as cacheBust } from "../../js/core/cache-bust.js?v=v2026-05-03T21160";

// ================== KOMUNIKATY ==================
const APP_MSG = {
  get NO_ID() { return t("control.noId"); },
  GAME_NOT_READY: (reason) => t("control.gameNotReady", { reason }),
  get DATA_MISMATCH() { return t("control.dataMismatch"); },
  get GAME_NOT_FOUND() { return t("control.gameNotFound"); },

  QR_LABEL: (kind) =>
    kind === "display" ? t("control.deviceDisplay") :
    kind === "host" ? t("control.deviceHost") :
    kind === "buzzer" ? t("control.deviceBuzzer") :
    t("control.qrModalTitle"),

  get QR_COPY_OK() { return t("control.qrCopyOk"); },
  get QR_COPY_FAIL() { return t("control.qrCopyFail"); },

  get UNLOAD_WARN() { return t("control.unloadWarn"); },

  get CONFIRM_BACK() { return t("control.confirmBack"); },

  get AUDIO_OK() { return t("control.audioOk"); },
  get AUDIO_FAIL() { return t("control.audioFail"); },

  get FINAL_CONFIRMED() { return t("control.finalConfirmed"); },

  get FINAL_RELOAD_START() { return t("control.finalReloadStart"); },
  get FINAL_RELOAD_DONE() { return t("control.finalReloadDone"); },

  get ADV_SAVED() { return t("control.advSaved"); },
  get ADV_RESET() { return t("control.advReset"); },
};
// ================= KONIEC KOMUNIKATÓW =================

import { requireAuth, signOut } from "../../js/core/auth.js?v=v2026-05-03T21160";
import { setTopbarAccount } from "../../js/core/topbar-controller.js?v=v2026-05-03T21160";
import { isGuestUser } from "../../js/core/guest-mode.js?v=v2026-05-03T21160";
import { sb } from "../../js/core/supabase.js?v=v2026-05-03T21160";
import { rt } from "../../js/core/realtime.js?v=v2026-05-03T21160";
import { validateGameReadyToPlay, loadGameBasic, loadQuestions, loadAnswers } from "../../js/core/game-validate.js?v=v2026-05-03T21160";
import { unlockAudio, isAudioUnlocked, playSfx } from "../../js/core/sfx.js?v=v2026-05-03T21160";
import { createStore } from "./store.js?v=v2026-05-03T21160";
import { createUI } from "./ui.js?v=v2026-05-03T21160";
import { createDevices } from "./devices.js?v=v2026-05-03T21160";
import { createPresence } from "./presence.js?v=v2026-05-03T21160";
import { createDisplay } from "./display.js?v=v2026-05-03T21160";
import { createRounds } from "./gameRounds.js?v=v2026-05-03T21160";
import { createFinal } from "./gameFinal.js?v=v2026-05-03T21160";
import { initShareDevice } from "./share-device.js?v=v2026-05-03T21160";
import { loadFont5x7, buildLogoPreviewCanvas } from "../../js/core/logo-preview.js?v=v2026-05-03T21160";

initI18n({ withSwitcher: true });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

// ================== KOLORY (domyślne) ==================
const DEFAULT_COLORS = {
  A: "#c4002f",
  B: "#2a62ff",
  BACKGROUND: "#d21180",
};

function normHex(input) {
  let s = String(input ?? "").trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = "#" + s;
  s = s.toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(s)) return null;
  return s;
}

function hexToRgb(hex) {
  const h = normHex(hex);
  if (!h) return { r: 0, g: 0, b: 0 };
  const n = parseInt(h.slice(1), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToHex(r, g, b) {
  const rr = Math.max(0, Math.min(255, Number(r) || 0));
  const gg = Math.max(0, Math.min(255, Number(g) || 0));
  const bb = Math.max(0, Math.min(255, Number(b) || 0));
  const n = (rr << 16) | (gg << 8) | bb;
  return "#" + n.toString(16).padStart(6, "0").toUpperCase();
}

// prosty throttle (leading+trailing, ale tu wystarczy trailing)
function throttleMs(ms, fn) {
  let t = null;
  let lastArgs = null;

  return (...args) => {
    lastArgs = args;
    if (t) return;
    t = setTimeout(() => {
      t = null;
      const a = lastArgs;
      lastArgs = null;
      try { fn(...(a || [])); } catch {}
    }, ms);
  };
}
// ========================================================

let guestMode = false;

async function ensureAuthOrRedirect() {
  const user = await requireAuth("../login");
  guestMode = isGuestUser(user);
  setTopbarAccount(user, {
    showAuthEntry: true,
    onLogout: async () => {
      if (isEndedUiState()) {
        await sendZeroStatesToDevices().catch(() => {});
      }
      await shareDevice.expireShares();
      suppressUnloadWarn = true;
    },
  });
  return user;
}

function syncPanelStepPills() {
  const panel = document.querySelector(".cardPanel:not(.hidden)");
  if (!panel) return;

  const pill = panel.querySelector("[data-panel-step]");
  if (!pill) return;

  const step = panel.querySelector(".step:not(.hidden)");
  if (!step) { pill.textContent = ""; return; }

  const st = step.querySelector(".stepTitle");
  pill.textContent = (st?.textContent || "").trim();
}

async function loadGameOrThrow() {
  if (!gameId) throw new Error(APP_MSG.NO_ID);

  let basic;
  try {
    basic = await loadGameBasic(gameId);
  } catch (e) {
    if (e?.code === "PGRST116") throw Object.assign(new Error(APP_MSG.GAME_NOT_FOUND), { _notFound: true });
    throw e;
  }

  const v = await validateGameReadyToPlay(gameId);
  if (!v.ok) throw new Error(APP_MSG.GAME_NOT_READY(v.reason));

  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_buzzer")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (data?.id !== basic.id) throw new Error(APP_MSG.DATA_MISMATCH);
  return data;
}

async function main() {
  const currentUser = await ensureAuthOrRedirect();
  const game = await loadGameOrThrow();

  // Load questions in background (non-blocking)
  loadQuestions(game.id).then(qsAll => {
    sessionStorage.setItem("familiada:questionsCache", JSON.stringify(qsAll));
  }).catch(console.error);

  const ui = createUI();
  ui.setGameHeader(game.name, `${game.type} / ${game.status}`);

  // Share device modal – inicjalizujemy po utworzeniu devices (niżej)
  let shareDevice = { refreshBadges: async () => {}, expireShares: async () => {} };

  
  // ===== Kolory: stan UI (lokalny) =====
  let colors = {
    A: DEFAULT_COLORS.A,
    B: DEFAULT_COLORS.B,
    BACKGROUND: DEFAULT_COLORS.BACKGROUND,
  };

  // pokaż na start kafelki
  ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND });

  // throttlowane wysyłki, żeby nie zabić realtime
  const sendColorA = throttleMs(120, async (hex) => {
    if (!devices) return;
    const h = normHex(hex);
    if (!h) return;
    await devices.sendDisplayCmd(`COLOR A ${h}`).catch(() => {});
    await devices.sendBuzzerCmd(`COLOR_A ${h}`).catch(() => {});
    await devices.sendHostCmd(`COLOR_A ${h}`).catch(() => {});
  });

  const sendColorB = throttleMs(120, async (hex) => {
    if (!devices) return;
    const h = normHex(hex);
    if (!h) return;
    await devices.sendDisplayCmd(`COLOR B ${h}`).catch(() => {});
    await devices.sendBuzzerCmd(`COLOR_B ${h}`).catch(() => {});
    await devices.sendHostCmd(`COLOR_B ${h}`).catch(() => {});
  });

  const sendColorBg = throttleMs(120, async (hex) => {
    if (!devices) return;
    const h = normHex(hex);
    if (!h) return;
    await devices.sendDisplayCmd(`COLOR BACKGROUND ${h}`).catch(() => {});
  });

  async function sendColorsReset() {
    if (!devices) return;
    await devices.sendDisplayCmd("COLOR RESET").catch(() => {});
    await devices.sendBuzzerCmd("COLOR_RESET").catch(() => {});
    await devices.sendHostCmd("COLOR_RESET").catch(() => {});
  }

  function applyColor(kind, hex) {
    const h = normHex(hex);
    if (!h) return;

    if (kind === "A") {
      colors.A = h;
      ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND });
      sendColorA(h);
      return;
    }
    if (kind === "B") {
      colors.B = h;
      ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND });
      sendColorB(h);
      return;
    }
    if (kind === "BACKGROUND") {
      colors.BACKGROUND = h;
      ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND });
      sendColorBg(h);
      return;
    }
  }
  

  // === Modal QR z auth bar (top-status) ===
  let currentQrKind = null; // "display" | "host" | "buzzer"

  function qrSrc(url) {
    const u = encodeURIComponent(String(url ?? ""));
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${u}`;
  }

  function getDeviceUrl(kind) {
    if (!window || !kind) return null;
    if (!devices || !devices.getUrls) return null;
    const urls = devices.getUrls();
    if (kind === "display") return urls.displayUrl;
    if (kind === "host") return urls.hostUrl;
    if (kind === "buzzer") return urls.buzzerUrl;
    return null;
  }

  function hideQrModal() {
    const overlay = document.getElementById("qrModalOverlay");
    if (overlay) overlay.classList.add("hidden");
  }

  function showQrModal(kind) {
    const url = getDeviceUrl(kind);
    if (!url) return;

    currentQrKind = kind;

    const overlay = document.getElementById("qrModalOverlay");
    const titleEl = document.getElementById("qrModalTitle");
    const imgEl = document.getElementById("qrModalImg");
    const linkEl = document.getElementById("qrModalLink");

    if (!overlay || !titleEl || !imgEl || !linkEl) return;

    titleEl.textContent = APP_MSG.QR_LABEL(kind);
    linkEl.value = url;
    imgEl.src = qrSrc(url);

    overlay.classList.remove("hidden");
  }

  async function copyQrLink() {
    const url = getDeviceUrl(currentQrKind);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      ui.showAlert(APP_MSG.QR_COPY_OK);
    } catch {
      ui.showAlert(APP_MSG.QR_COPY_FAIL);
    }
  }

  function openQrLink() {
    const url = getDeviceUrl(currentQrKind);
    if (!url) return;
    window.open(url, "_blank");
  }

  const store = createStore(game.id);
  store.hydrate();

  const hasFinalNow = store.state.hasFinal === true;
  const finalYesRadio = document.getElementById("finalYes");
  const finalNoRadio = document.getElementById("finalNo");

  if (finalYesRadio && finalNoRadio) {
    finalYesRadio.checked = hasFinalNow;
    finalNoRadio.checked = !hasFinalNow;
  }
  ui.setFinalHasFinal(hasFinalNow);


  // === OSTRZEŻENIE PRZY WYJŚCIU ZE STRONY ===
  // Gdy nawigujemy "świadomie" (przycisk Powrót / wylogowanie),
  // nie chcemy drugiego alertu z beforeunload.
  let suppressUnloadWarn = false;

  function shouldWarnBeforeUnload() {
    if (suppressUnloadWarn) return false;

    const s = store.state;

    // 1) Jeśli jesteśmy na końcówkach UI, NIE ostrzegamy
    const activeCard = s.activeCard || "";
    const rStep = s.steps?.rounds || "";
    const fStep = s.final?.step || "";

    // ROUNDS: karta "Zakończ grę"
    if (activeCard === "rounds" && rStep === "r_gameEnd") return false;

    // FINAL: krok "Zakończ finał"
    if (activeCard === "final" && fStep === "f_end") return false;

    // 2) Jeśli gra już formalnie zakończona
    if (s.locks?.gameEnded) return false;

    const r = s.rounds || {};
    const totals = r.totals || { A: 0, B: 0 };

    const gameStarted = !!s.locks?.gameStarted;
    const finalActive = !!s.locks?.finalActive;

    const someRoundProgress = r.phase && r.phase !== "IDLE";

    const somePoints =
      (totals.A || 0) > 0 ||
      (totals.B || 0) > 0 ||
      (r.bankPts || 0) > 0;

    return gameStarted && (someRoundProgress || somePoints || finalActive);
  }

function isEndedUiState() {
  const s = store.state;
  const activeCard = s.activeCard || "";
  const rStep = s.steps?.rounds || "";
  const fStep = s.final?.step || "";

  // ROUNDS: karta "Zakończ grę"
  if (activeCard === "rounds" && rStep === "r_gameEnd") return true;

  // FINAL: krok "Zakończ finał"
  if (activeCard === "final" && fStep === "f_end") return true;

  // globalny lock
  if (s.locks?.gameEnded) return true;

  return false;
}

async function sendZeroStatesToDevices() {
  if (!devices) return;
  try { await devices.sendDisplayCmd("APP GAME"); } catch {}
  try { await devices.sendDisplayCmd("COLOR RESET"); } catch {}
  try { await devices.sendDisplayCmd("APP BLACK"); } catch {}
  try { await devices.sendHostCmd("COLOR_RESET"); } catch {}
  try { await devices.sendHostCmd("CLEAR"); } catch {}
  try { await devices.sendHostCmd("COVER"); } catch {}
  try { await devices.sendBuzzerCmd("OFF"); } catch {}
  try { await devices.sendBuzzerCmd("COLOR_RESET"); } catch {}
}


  window.addEventListener("beforeunload", (e) => {
    if (!shouldWarnBeforeUnload()) return;
    const msg = APP_MSG.UNLOAD_WARN;
    e.preventDefault();
    e.returnValue = msg;
    return msg;
  });

  // Strażnik historii: jeden dodatkowy wpis daje nam szansę na popstate
  // zanim przeglądarka opuści stronę.
  history.pushState({ navGuard: true }, "");

  let navGuardBusy = false;
  window.addEventListener("popstate", async () => {
    if (navGuardBusy) {
      // Drugie popstate wywołane przez nasze history.go — ignorujemy.
      navGuardBusy = false;
      return;
    }
    if (!shouldWarnBeforeUnload()) {
      // Gra nie zaczęta lub już zakończona — przepuszczamy transparentnie.
      navGuardBusy = true;
      history.go(-1);
      return;
    }
    // Blokujemy: przywróć guard i pokaż modal.
    history.pushState({ navGuard: true }, "");
    const confirmed = await confirmModal({
      title: t("control.leaveTitle"),
      text: t("control.leaveText"),
      okText: t("control.leaveOk"),
      cancelText: t("control.leaveCancel"),
    });
    if (confirmed) {
      suppressUnloadWarn = true;
      navGuardBusy = true;
      history.go(-2);
    }
  });
  window.addEventListener("pagehide", () => {
    suppressUnloadWarn = true;

    if (isEndedUiState()) {
      sendZeroStatesToDevices().catch(() => {});
    }
    // Wygaś udostępnienia – fire-and-forget (przeglądarka może zabić JS)
    shareDevice.expireShares().catch(() => {});
  });

  // realtime channels
  const chDisplay = rt(`familiada-display:${game.id}`);
  const chHost = rt(`familiada-host:${game.id}`);
  const chBuzzer = rt(`familiada-buzzer:${game.id}`);

  const devices = createDevices({ game, ui, store, chDisplay, chHost, chBuzzer });
  const presence = createPresence({ game, ui, store, devices });

  shareDevice = initShareDevice({ currentUser, game, devices });
  void shareDevice.refreshBadges();

    // ===== Wejście/wyjście z kroku "Nazwy drużyn" =====
  let wasInSetupNames = false;
  let wasInSetupLook = false;
  let wasInSetupGame = false;
  let wasInSetupFinish = false;
  let wasInSetupRounds = false;

  // Logo wybrane w setup_look (null = domyślne)
  let selectedLogoId = null;
  // Załadowana czcionka (potrzebna do podglądu GLYPH)
  let _logoFont = null;
  // Domyślne logo Familiady (payload z pliku JSON)
  let _defaultLogoPayload = null;

  async function enterSetupNames() {
    // urządzenia startują dopiero w setup_look
  }

  async function leaveSetupNames() {
    // nic
  }

  async function enterSetupLook() {
    if (!devices) return;
    // uruchom urządzenia przy wejściu w ten krok
    await devices.sendDisplayCmd("APP GAME").catch(() => {});
    await devices.sendBuzzerCmd("ON").catch(() => {});
    await devices.sendHostCmd("COVER").catch(() => {});
    // pokaż aktualne kolory na wyświetlaczu
    sendColorA(colors.A);
    sendColorB(colors.B);
    sendColorBg(colors.BACKGROUND);

    // ustaw nazwy drużyn przy swatchach
    const teamA = store.state.teams?.teamA || t("control.teamALabel");
    const teamB = store.state.teams?.teamB || t("control.teamBLabel");
    const elA = document.getElementById("lookTeamAName");
    const elB = document.getElementById("lookTeamBName");
    if (elA) elA.textContent = teamA;
    if (elB) elB.textContent = teamB;

    // podgląd na urządzeniach: logo + przykładowe wyniki + nazwy drużyn
    const q = (s) => `"${String(s ?? "").replace(/"/g, "'")}"`;
    devices.sendDisplayCmd(`LOGO RELOAD`).catch(() => {});
    devices.sendDisplayCmd(`LEFT 123`).catch(() => {});
    devices.sendDisplayCmd(`RIGHT 123`).catch(() => {});
    devices.sendDisplayCmd(`TOP 1`).catch(() => {});
    devices.sendDisplayCmd(`LONG1 ${q(teamA)}`).catch(() => {});
    devices.sendDisplayCmd(`LONG2 ${q(teamB)}`).catch(() => {});
    devices.sendHostCmd(`SET1 ${q(teamA)}`).catch(() => {});
    devices.sendHostCmd(`SET2 ${q(teamB)}`).catch(() => {});

    // załaduj czcionkę i domyślne logo (raz) i wyrenderuj grid
    if (!_logoFont) {
      try { _logoFont = await loadFont5x7(); } catch (e) { console.warn("[logo] font load failed", e); }
    }
    if (!_defaultLogoPayload) {
      try {
        const r = await fetch(await cacheBust("/display/logo_familiada.json"), { cache: "force-cache" });
        if (r.ok) _defaultLogoPayload = await r.json();
      } catch (e) { console.warn("[logo] default logo load failed", e); }
    }
    await renderLogoGrid();
  }

  async function renderLogoGrid() {
    const grid = document.getElementById("logoGrid");
    if (!grid) return;

    grid.innerHTML = `<div class="hint">${t("control.lookLogoLoading")}</div>`;

    try {
      const { data: logos, error } = await sb()
        .from("user_logos")
        .select("id,name,type,is_active,payload")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const list = logos || [];

      if (list.length === 0 && selectedLogoId !== null) selectedLogoId = null;

      // ustal które logo jest aktywne (db) jeśli jeszcze nie wybrano
      if (selectedLogoId === null) {
        const active = list.find(l => l.is_active);
        if (active) selectedLogoId = active.id;
      }

      grid.innerHTML = "";

      // kafelek "Domyślne" — ze podglądem domyślnego logo
      const defaultLogoObj = _defaultLogoPayload
        ? { type: "GLYPH_30x10", payload: _defaultLogoPayload }
        : null;
      grid.appendChild(makeLogo(null, defaultLogoObj));

      for (const logo of list) {
        grid.appendChild(makeLogo(logo));
      }

      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "logoGridEmpty hint";
        empty.textContent = t("control.lookLogoNone");
        grid.appendChild(empty);
      }

      grid.querySelectorAll(".logoTile").forEach(tile => {
        tile.addEventListener("click", () => onLogoTileClick(tile.dataset.logoId || null, grid));
      });

    } catch (e) {
      grid.innerHTML = `<div class="hint">${e?.message || String(e)}</div>`;
    }
  }

  // Buduje kafelek logo jako element DOM (z canvasem)
  // previewLogo: opcjonalny obiekt {type,payload} do renderowania (dla kafelka "Domyślne")
  function makeLogo(logo, previewLogo) {
    const id = logo?.id ?? null;
    const key = id ?? "default";
    const name = logo?.name || (id === null ? t("control.lookLogoDefault") : "—");
    const sel = (id === null && selectedLogoId === null) || (id !== null && id === selectedLogoId);

    const el = document.createElement("div");
    el.className = "logoTile" + (sel ? " selected" : "");
    el.dataset.logoId = String(key);

    const prev = document.createElement("div");
    prev.className = "logoTilePrev";
    const canvas = buildLogoPreviewCanvas(previewLogo ?? logo, _logoFont);
    canvas.style.cursor = "default";
    prev.appendChild(canvas);
    el.appendChild(prev);

    const label = document.createElement("div");
    label.className = "logoTileName";
    label.textContent = name;
    el.appendChild(label);

    return el;
  }

  function escapeHtmlAttr(s) {
    return String(s ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  }

  async function onLogoTileClick(logoId, grid) {
    selectedLogoId = logoId === "default" ? null : logoId;

    // wizualna selekcja
    grid.querySelectorAll(".logoTile").forEach(el => el.classList.remove("selected"));
    const key = selectedLogoId ?? "default";
    grid.querySelector(`[data-logo-id="${key}"]`)?.classList.add("selected");

    // ustaw aktywne w bazie (fire-and-forget)
    try {
      if (selectedLogoId === null) {
        await sb().rpc("user_logo_clear_active");
      } else {
        await sb().rpc("user_logo_set_active", { p_logo_id: selectedLogoId });
      }
    } catch (e) { console.warn("[logo] set active failed", e); }

    // przeładuj logo na wyświetlaczu
    await devices.sendDisplayCmd("LOGO RELOAD").catch(() => {});
  }
  
  async function leaveSetupLook() {
    if (!devices) return;
    // zgaś podgląd na urządzeniach (przejście do setup_game)
    await devices.sendDisplayCmd("APP BLACK").catch(() => {});
    await devices.sendBuzzerCmd("OFF").catch(() => {});
    await devices.sendHostCmd("CLEAR").catch(() => {});
  }

  async function enterSetupGame() {
    // synchronizacja stanu z UI przy wejściu
    syncGameSettingsUI();
  }
  
  async function leaveSetupGame() {
    // Nic nie robimy - zapis następuje przy kliknięciu "Dalej"
  }
  
  // ===== Ustawienia gry - synchronizacja UI z store =====
  function syncGameSettingsUI() {
    const s = store.state;

    // Czy gramy finał?
    const finalYes = document.getElementById("finalYes");
    const finalNo = document.getElementById("finalNo");
    if (finalYes && finalNo) {
      finalYes.checked = (s.hasFinal === true);
      finalNo.checked = (s.hasFinal !== true);
    }

    // Tryb pytań finału
    const finalRandom = document.getElementById("finalRandom");
    const finalPick = document.getElementById("finalPick");
    if (finalRandom && finalPick) {
      finalRandom.checked = (s.finalQuestionsMode !== "pick");
      finalPick.checked = (s.finalQuestionsMode === "pick");
    }

    // Tryb pytań rund
    const roundsRandom = document.getElementById("roundsRandom");
    const roundsPick = document.getElementById("roundsPick");
    if (roundsRandom && roundsPick) {
      roundsRandom.checked = (s.roundsQuestionsMode !== "pick");
      roundsPick.checked = (s.roundsQuestionsMode === "pick");
    }

    // Tryb zakończenia gry
    const adv = s.advanced || {};
    const endMode = adv.endScreenMode || "logo";
    const winModeLogo = document.getElementById("winModeLogo");
    const winModePoints = document.getElementById("winModePoints");
    const winModeMoney = document.getElementById("winModeMoney");
    if (winModeLogo) winModeLogo.checked = (endMode === "logo");
    if (winModePoints) winModePoints.checked = (endMode === "points");
    if (winModeMoney) winModeMoney.checked = (endMode === "money");

    // Pokaż/ukryj opcje w zależności od wyboru
    updateGameSettingsVisibility();
  }
  
  function updateGameSettingsVisibility() {
    // Pokaż/ukryj wybór pytań finału w zależności od czy gramy finał
    const finalModeField = document.getElementById("finalModeField");
    const hasFinal = document.getElementById("finalYes")?.checked;
    if (finalModeField) {
      finalModeField.style.display = hasFinal ? "flex" : "none";
    }

    // "Cel finału" - tylko gdy finał włączony
    const finalTargetField = document.getElementById("finalTargetField");
    if (finalTargetField) {
      finalTargetField.style.display = hasFinal ? "flex" : "none";
    }

    // "Pokaż kwotę (po finale)" - tylko gdy finał włączony
    const winModeMoneyChk = document.getElementById("winModeMoneyChk");
    if (winModeMoneyChk) {
      winModeMoneyChk.style.display = hasFinal ? "flex" : "none";
    }

    // Pola nagrody - widoczne tylko gdy finał włączony I wybrano "Pokaż kwotę"
    const prizeSettingsRow = document.getElementById("prizeSettingsRow");
    const winModeMoney = document.getElementById("winModeMoney")?.checked;
    const showPrizeFields = hasFinal && winModeMoney;

    if (prizeSettingsRow) {
      prizeSettingsRow.style.display = showPrizeFields ? "grid" : "none";
    }
  }
  
  function saveGameSettings() {
    const hasFinal = document.getElementById("finalYes")?.checked;
    const finalMode = document.getElementById("finalRandom")?.checked ? "random" : "pick";
    const roundsMode = document.getElementById("roundsRandom")?.checked ? "random" : "pick";
    
    store.setHasFinal(hasFinal);
    store.setFinalQuestionsMode(finalMode);
    store.setRoundsQuestionsMode(roundsMode);
    
    // Jeśli wybrano losowanie, wyczyść potwierdzenie wyboru ręcznego
    if (finalMode === "random") {
      store.unconfirmFinalQuestions();
    }
  }


  const display = createDisplay({ devices, store });
  const rounds = createRounds({ ui, store, devices, display, loadQuestions, loadAnswers });
  rounds.bootIfNeeded();
  const final = createFinal({ ui, store, devices, display, loadAnswers });

  // Generate QR links immediately (synchronous)
  devices.updateLinksAndQr(getUiLang());

  // Start presence and device init in background (non-blocking)
  Promise.resolve().then(async () => {
    try {
      // start presence (online / offline / OSTATNIO)
      presence.start();
      
      // Initialize device links
      devices.initLinksAndQr();
      
      // Send LANG commands (non-blocking)
      const initialLang = getUiLang();
      await Promise.all([
        devices.sendDisplayCmd(`LANG ${initialLang}`).catch(() => {}),
        devices.sendHostCmd(`LANG ${initialLang}`).catch(() => {}),
        devices.sendBuzzerCmd(`LANG ${initialLang}`).catch(() => {}),
      ]);
      
      if (store.state.flags.qrOnDisplay) {
        await devices.sendQrLinksToDisplay().catch(() => {});
      }
    } catch (e) {
      console.error("Device init error:", e);
    }
  });

  // ===== Realtime: odbiór kliknięć z przycisku (BUZZER_EVT) =====
  const chControlIn = sb()
    .channel(`familiada-control:${game.id}`)
    .on("broadcast", { event: "BUZZER_EVT" }, (msg) => {
      const line = String(msg?.payload?.line || "").trim().toUpperCase();
      // spodziewamy się "CLICK A" / "CLICK B"
      const [cmd, team] = line.split(/\s+/);
      if (cmd === "CLICK" && (team === "A" || team === "B")) {
        rounds.handleBuzzerClick(team);
      }
    })
    .subscribe();

  // === PICKER PYTAŃ FINAŁU: góra "czy gramy", lewo rozgrywka, prawo finał ===
  let finalPickerAll = [];
  let finalPickerSelected = new Set(); // trzymamy ID jako STRINGI

  // ===== FINAL PICKER: stała wysokość kafelków + synchronizacja slotów =====
  
  const finalDnd = {
    draggingId: null, // string
    fromSide: null,   // "pool" | "final"
    overSide: null,   // "pool" | "final"
  };
  
  function countRows(root) {
    return root ? root.querySelectorAll(".qRow").length : 0;
  }
  
  function computeVirtualCounts(poolRoot, finalRoot) {
    let poolN = countRows(poolRoot);
    let finalN = countRows(finalRoot);
  
    // klocek "w ręku" = znika ze źródła
    if (finalDnd.draggingId && finalDnd.fromSide) {
      if (finalDnd.fromSide === "pool") poolN = Math.max(0, poolN - 1);
      if (finalDnd.fromSide === "final") finalN = Math.max(0, finalN - 1);
    }
  
    // klocek "nad pudełkiem" = jakby już tam wpadł
    if (finalDnd.draggingId && finalDnd.overSide) {
      if (finalDnd.overSide === "pool") poolN = poolN + 1;
      if (finalDnd.overSide === "final") finalN = finalN + 1;
    }
  
    return { poolN, finalN };
  }
  
  function readGapPx(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    // dla flex: gap
    const g = parseFloat(cs.gap || "0");
    return Number.isFinite(g) ? g : 0;
  }
  
  function readPadPx(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    const pt = parseFloat(cs.paddingTop || "0") || 0;
    const pb = parseFloat(cs.paddingBottom || "0") || 0;
    return pt + pb;
  }
  
  function readTileHeightPx(poolRoot, finalRoot) {
    const tile =
      poolRoot?.querySelector(".qRow") ||
      finalRoot?.querySelector(".qRow");
    if (!tile) return 56;
    return Math.round(tile.getBoundingClientRect().height);
  }
  
  function syncFinalPickerSlotsHeight(poolRoot, finalRoot) {
    if (!poolRoot || !finalRoot) return;
  
    const { poolN, finalN } = computeVirtualCounts(poolRoot, finalRoot);
    const maxCount = Math.max(poolN, finalN, 1);
  
    const tileH = readTileHeightPx(poolRoot, finalRoot);
    const gap = readGapPx(poolRoot);      // oba mają ten sam CSS
    const pad = readPadPx(poolRoot);      // padding slotu
  
    const h = maxCount * tileH + (maxCount - 1) * gap + pad;
  
    poolRoot.style.minHeight = `${h}px`;
    finalRoot.style.minHeight = `${h}px`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function finalPickerGetSelectedIds() {
    return Array.from(finalPickerSelected);
  }

  function finalPickerUpdateButtons() {
    const cntEl = document.getElementById("pickedCount");
    const btnConfirm = document.getElementById("btnConfirmFinal");

    const hasFinal = store.state.hasFinal === true;
    const confirmed = store.state.final.confirmed === true;
    const count = finalPickerSelected.size;

    if (cntEl) cntEl.textContent = String(count);

    if (btnConfirm) {
      btnConfirm.disabled = !hasFinal || confirmed || count !== 5;
    }

    // dodatkowo: chowamy/pokazujemy kartę z listami
    const pickerCard = document.getElementById("finalPickerCard");
    if (pickerCard) {
      pickerCard.style.display = hasFinal ? "" : "none";
    }

    // ustawienie stanu radio (wizualnie)
    const finalYes = document.getElementById("finalYes");
    const finalNo = document.getElementById("finalNo");
    if (finalYes && finalNo) {
      if (hasFinal) {
        finalYes.checked = true;
        finalNo.checked = false;
      } else {
        finalYes.checked = false;
        finalNo.checked = true;
      }
    }
  }

  // strefa zrzutu dla list (lewa/prawa)
  function bindDropZone(root, targetSide) {
    if (!root || root._finalDndBound) return;
    root._finalDndBound = true;
  
    root.addEventListener("dragover", (e) => {
      if (store.state.final.confirmed) return;
      e.preventDefault();
  
      root.classList.add("droptarget");
  
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
  
    root.addEventListener("dragleave", (e) => {
      if (root.contains(e.relatedTarget)) return;
      root.classList.remove("droptarget");
      if (finalDnd.overSide === targetSide) finalDnd.overSide = null;
    });
  
    root.addEventListener("drop", (e) => {
      if (store.state.final.confirmed) return;
      e.preventDefault();
  
      root.classList.remove("droptarget");
      finalDnd.overSide = null;
  
      const id = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
      if (!id) return;
  
      if (targetSide === "final") {
        if (!finalPickerSelected.has(id)) {
          if (finalPickerSelected.size >= 5) return; // limit 5
          finalPickerSelected.add(id);
        }
      } else {
        finalPickerSelected.delete(id);
      }
  
      store.state.final.picked = finalPickerGetSelectedIds();
      finalPickerRender();
  
      const poolRoot = document.getElementById("finalGameList");
      const finalRoot = document.getElementById("finalFinalList");
      syncFinalPickerSlotsHeight(poolRoot, finalRoot);
    });
  }

  function renderList(root, list, side, confirmed) {
    if (!root) return;
  
    root.innerHTML = list
      .map(
        (q) => `
        <div class="qRow" data-id="${String(q.id)}" draggable="${confirmed ? "false" : "true"}">
          <div class="meta">#${q.ord}</div>
          <div class="txt">${escapeHtml(q.text || "")}</div>
        </div>
      `
      )
      .join("");
  
    if (confirmed) return;
  
    root.querySelectorAll(".qRow").forEach((row) => {
      const id = row.dataset.id || "";
      if (!id) return;
  
      row.addEventListener("dragstart", (e) => {
        if (store.state.final.confirmed) return;
  
        finalDnd.draggingId = id;
        finalDnd.fromSide = side;     // "pool" albo "final"
        finalDnd.overSide = null;
  
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", id);
          e.dataTransfer.effectAllowed = "move";
        }
        row.classList.add("dragging");
      });
  
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
  
        // sprzątamy stan DND
        finalDnd.draggingId = null;
        finalDnd.fromSide = null;
        finalDnd.overSide = null;
  
        const poolRoot = document.getElementById("finalGameList");
        const finalRoot = document.getElementById("finalFinalList");
        if (poolRoot) poolRoot.classList.remove("droptarget");
        if (finalRoot) finalRoot.classList.remove("droptarget");
  
        syncFinalPickerSlotsHeight(poolRoot, finalRoot);
      });
    });
  }

  function finalPickerRender() {
    const poolRoot = document.getElementById("finalGameList");   // lewo – rozgrywka
    const finalRoot = document.getElementById("finalFinalList"); // prawo – finał

    if (!poolRoot || !finalRoot) return;

    const confirmed = store.state.final.confirmed === true;

    // podpinamy strefy drop (tylko raz na root)
    bindDropZone(poolRoot, "pool");
    bindDropZone(finalRoot, "final");

    const pickedIds = finalPickerSelected;
    const picked = finalPickerAll.filter((q) => pickedIds.has(String(q.id)));
    const pool = finalPickerAll.filter((q) => !pickedIds.has(String(q.id)));

    renderList(poolRoot, pool, "pool", confirmed);
    renderList(finalRoot, picked, "final", confirmed);

    finalPickerUpdateButtons();
    
    // 1) ustaw na start minimalną, żeby nie było “0”
    poolRoot.style.minHeight = "120px";
    finalRoot.style.minHeight = "120px";
    
    // 2) synchronizacja po layout (2 klatki)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncFinalPickerSlotsHeight(poolRoot, finalRoot);
      });
    });
  }

  async function finalPickerReload() {
    // Use cached questions if available, otherwise load fresh
    let qsAll = [];
    const cached = sessionStorage.getItem("familiada:questionsCache");
    if (cached) {
      try { qsAll = JSON.parse(cached); } catch {}
    }
    if (!qsAll.length) {
      qsAll = await loadQuestions(game.id);
      sessionStorage.setItem("familiada:questionsCache", JSON.stringify(qsAll));
    }
    
    finalPickerAll = qsAll;
  
    const confirmed = store.state.final.confirmed === true;
  
    if (!confirmed) {
      // NIEzatwierdzony finał: czyścimy wybór
      finalPickerSelected = new Set();
      store.state.final.picked = [];
    } else {
      // Zatwierdzony finał: zachowujemy wybór ze store
      const existing = Array.isArray(store.state.final?.picked)
        ? store.state.final.picked
        : [];
      finalPickerSelected = new Set(existing.map((id) => String(id)));
    }
  
    finalPickerRender();
  }

  // Language change handler
  window.addEventListener("i18n:lang", async (event) => {
    const nextLang = event?.detail?.lang;
    devices.updateLinksAndQr(nextLang);
    await Promise.all([
      devices.sendDisplayCmd(`LANG ${nextLang}`).catch(() => {}),
      devices.sendHostCmd(`LANG ${nextLang}`).catch(() => {}),
      devices.sendBuzzerCmd(`LANG ${nextLang}`).catch(() => {}),
    ]);
    if (store.state.flags.qrOnDisplay) {
      await devices.sendQrLinksToDisplay().catch(() => {});
    }
  });

  // audio: stan początkowy
  store.setAudioUnlocked(!!isAudioUnlocked());
  ui.setAudioStatus(store.state.flags.audioUnlocked);

  // === GLOBALNE RENDEROWANIE STANU (Opcja B) ===
  function renderFromState(state) {
    // aktywna karta
    ui.showCard(state.activeCard);
    syncPanelStepPills();

    // kroki kart
    ui.showDevicesStep(state.steps.devices);
    ui.showSetupStep(state.steps.setup);

    // nav enable/disable wg canEnterCard
    ui.setNavEnabled({
      devices: store.canEnterCard("devices"),
      setup: store.canEnterCard("setup"),
      rounds: store.canEnterCard("rounds"),
      final: store.canEnterCard("final"),
    });

    const flags = state.flags || {};

    // ===== DEVICES =====

    // krok 2: prowadzący + przycisk online (Tylko host jest opcjonalny)
    const displayReady = !!flags.displayOnline;
    const buzzerReady = !!flags.buzzerOnline;
    const requiredOnline = displayReady && buzzerReady;
    
    // QR na wyświetlaczu tylko gdy wyświetlacz jest online
    ui.setEnabled("btnQrToggle", displayReady);

    // Aktualizuj przyciski "QR na wyświetlaczu" dla hosta i buzzera
    updateQrOnDisplayButtons();

    // Dalej w kroku 1 (wyświetlacz) i kroku 2 (host/buzzer)
    // Wymagamy Display + Buzzer
    ui.setEnabled("btnDevicesNext", requiredOnline);

    // krok 3: „Gotowe — przejdź dalej” po odblokowaniu audio
    ui.setEnabled(
      "btnDevicesFinish",
      requiredOnline && !!flags.audioUnlocked
    );

    // ===== SETUP =====

    // 1/2 — Nazwy drużyn: przynajmniej jedna nazwa niepusta
    const teamA = (state.teams.teamA || "").trim();
    const teamB = (state.teams.teamB || "").trim();
    const teamsOk = teamA.length > 0 && teamB.length > 0;
    ui.setEnabled("btnSetupNext", teamsOk);

    // 2/2 — Finał: logika jak w store.canFinishSetup()
    const hasFinal = state.hasFinal === true;
    const finalPickedOk =
      Array.isArray(state.final?.picked) &&
      state.final.picked.length === 5 &&
      state.final.confirmed === true;

    const setupOk =
      teamsOk &&
      (
        !hasFinal ||                 // finał wyłączony
        (hasFinal && finalPickedOk)  // finał włączony + 5 zatwierdzonych pytań
      );

    ui.setEnabled("btnSetupFinish", setupOk);

    // od razu zsynchronizuj wizualnie radio + kartę list
    finalPickerUpdateButtons();
    syncPanelStepPills();

    // ===== detekcja wejścia/wyjścia z setup_names =====
    const inSetupNames =
      (state.activeCard === "setup" && state.steps?.setup === "setup_names");

    if (inSetupNames && !wasInSetupNames) {
      enterSetupNames().catch(() => {});
    }
    if (!inSetupNames && wasInSetupNames) {
      leaveSetupNames().catch(() => {});
    }
    wasInSetupNames = inSetupNames;

    // ===== detekcja wejścia/wyjścia z setup_look =====
    const inSetupLook =
      (state.activeCard === "setup" && state.steps?.setup === "setup_look");

    if (inSetupLook && !wasInSetupLook) {
      enterSetupLook().catch(() => {});
    }
    if (!inSetupLook && wasInSetupLook) {
      leaveSetupLook().catch(() => {});
    }
    wasInSetupLook = inSetupLook;

    // ===== detekcja wejścia/wyjścia z setup_game =====
    const inSetupGame =
      (state.activeCard === "setup" && state.steps?.setup === "setup_game");

    if (inSetupGame && !wasInSetupGame) {
      enterSetupGame().catch(() => {});
    }
    if (!inSetupGame && wasInSetupGame) {
      leaveSetupGame().catch(() => {});
    }
    wasInSetupGame = inSetupGame;

    // ===== detekcja wejścia/wyjścia z setup_finish =====
    const inSetupFinish =
      (state.activeCard === "setup" && state.steps?.setup === "setup_finish");

    if (inSetupFinish) {
      renderSetupFinishSummary();
    }
    wasInSetupFinish = inSetupFinish;

    // ===== detekcja wejścia/wyjścia z setup_rounds =====
    const inSetupRounds =
      (state.activeCard === "setup" && state.steps?.setup === "setup_rounds");

    if (inSetupRounds && !wasInSetupRounds) {
      renderSetupRoundsOrder();
    }
    wasInSetupRounds = inSetupRounds;

  }

  // startowy render + subskrypcja
  renderFromState(store.state);
  store.subscribe(renderFromState);

  // Subskrypcja na zmiany nazw drużyn - aktualizacja HUD w rundach
  let lastTeams = JSON.stringify(store.state.teams);
  store.subscribe((s) => {
    const teamsJson = JSON.stringify(s.teams);
    if (teamsJson !== lastTeams) {
      lastTeams = teamsJson;
      // Aktualizuj HUD rund z nowymi nazwami drużyn
      const r = s.rounds || {};
      ui.setRoundsHud(r, s.teams);
      // Aktualizuj przyciski akceptacji buzzera
      if (rounds && typeof rounds.syncTeamLabels === "function") {
        rounds.syncTeamLabels();
      }
    }
  });

  // === NAWIGACJA GÓRNA ===
  ui.mountNavigation({
    canEnter: (card) => store.canEnterCard(card),
    onNavigate: (card) => store.setActiveCard(card),
  });



  const helpOverlay = document.getElementById("helpOverlay");
  const helpFrame = document.getElementById("helpFrame");
  const btnHelpClose = document.getElementById("btnHelpClose");
  const btnLegal = document.getElementById("btnLegal");
  
  const legalOverlay = document.getElementById("legalOverlay");
  const legalFrame = document.getElementById("legalFrame");
  const btnBackToManual = document.getElementById("btnBackToManual");
  const btnLegalClose = document.getElementById("btnLegalClose");
  
  function buildHelpUrl() {
    const url = new URL("../manual", location.href);
    const ret = `${location.pathname.split("/").slice(-2).join("/")}${location.search}${location.hash}`;
    url.searchParams.set("ret", ret);
    url.searchParams.set("modal", "control");
    url.searchParams.set("lang", getUiLang() || "pl");
    url.searchParams.set("tab", "control");
    url.hash = "control";
    return url.toString();
  }

  function buildLegalUrl() {
    const url = new URL("../privacy", location.href);
    const ret = `${location.pathname.split("/").slice(-2).join("/")}${location.search}${location.hash}`;
    url.searchParams.set("ret", ret);
    url.searchParams.set("modal", "control");
    url.searchParams.set("lang", getUiLang() || "pl");
    url.hash = "control";
    return url.toString();
  }

  function openHelpModal() {
    if (helpFrame) helpFrame.src = buildHelpUrl();
    helpOverlay?.classList.remove("hidden");
  }

  function closeHelpModal() {
    helpOverlay?.classList.add("hidden");
  }

  function openLegalModal() {
    if (legalFrame) legalFrame.src = buildLegalUrl();
    legalOverlay?.classList.remove("hidden");
  }

  function closeLegalModal() {
    legalOverlay?.classList.add("hidden");
  }

  btnHelpClose?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeHelpModal(); });
  helpOverlay?.addEventListener("click", (ev) => { if (ev.target === helpOverlay) closeHelpModal(); });

  btnLegal?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); openLegalModal(); });
  btnBackToManual?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeLegalModal(); openHelpModal(); });
  btnLegalClose?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeLegalModal(); });
  legalOverlay?.addEventListener("click", (ev) => { if (ev.target === legalOverlay) closeLegalModal(); });

  // ===== Helper: aktualizacja etykiet przycisków "QR na wyświetlaczu" =====
  function updateQrOnDisplayButtons() {
    const hostOn = !!store.state.flags.qrHostOnDisplay;
    const buzzerOn = !!store.state.flags.qrBuzzerOnDisplay;
    const displayOnline = !!store.state.flags.displayOnline;
    const buzzerOnline = !!store.state.flags.buzzerOnline;

    const btnHost = document.getElementById("btnQrHostOnDisplay");
    const btnBuzzer = document.getElementById("btnQrBuzzerOnDisplay");

    // Aktualizuj etykiety
    if (btnHost) {
      btnHost.textContent = hostOn ? t("control.qrHide") : t("control.qrOnDisplay");
      btnHost.disabled = !displayOnline || !buzzerOnline;
    }
    if (btnBuzzer) {
      btnBuzzer.textContent = buzzerOn ? t("control.qrHide") : t("control.qrOnDisplay");
      btnBuzzer.disabled = !displayOnline || !buzzerOnline;
    }
  }

  // === Top bar ===
  ui.on("top.back", async () => {
    if (shouldWarnBeforeUnload()) {
      const ok = await confirmModal({
        title: t("control.leaveTitle"),
        text: t("control.leaveText"),
        okText: t("control.leaveOk"),
        cancelText: t("control.leaveCancel"),
      });
      if (!ok) return;
    }

    if (isEndedUiState()) {
      await sendZeroStatesToDevices().catch(() => {});
    }

    await shareDevice.expireShares();
    suppressUnloadWarn = true;
    location.href = "../builder";
  });
  
  ui.on("top.manual", () => {
    openHelpModal();
  });

  ui.on("auth.showQr", (kind) => showQrModal(kind));
  ui.on("auth.qr.close", () => hideQrModal());
  ui.on("auth.qr.copy", async () => await copyQrLink());
  ui.on("auth.qr.open", () => openQrLink());

  // DEVICES kroki
  ui.on("devices.next", () => store.setDevicesStep("devices_audio"));
  ui.on("devices.back", () => store.setDevicesStep("devices_display"));
  ui.on("audio.back", () => store.setDevicesStep("devices_display"));

  ui.on("audio.unlock", () => {
    const ok = unlockAudio();
    store.setAudioUnlocked(!!ok);
    ui.setAudioStatus(!!ok);
    ui.setMsg("msgAudio", ok ? APP_MSG.AUDIO_OK : APP_MSG.AUDIO_FAIL);
    playSfx("answer_correct");
  });

  ui.on("devices.finish", () => {
    store.completeCard("devices");
    store.setActiveCard("setup");
  });

  ui.on("display.black", async () => {
    await devices.sendDisplayCmd("APP BLACK");
  });

  // QR na wyświetlaczu - globalny (stary przycisk)
  ui.on("qr.toggle", async () => {
    const now = store.state.flags.qrOnDisplay;

    if (!now) {
      await devices.sendQrToDisplay();
      store.setQrOnDisplay(true);
      ui.setQrToggleLabel(true, store.state.flags.displayOnline && store.state.flags.buzzerOnline);
    } else {
      await devices.sendDisplayCmd("APP BLACK");
      store.setQrOnDisplay(false);
      ui.setQrToggleLabel(false, store.state.flags.displayOnline && store.state.flags.buzzerOnline);
    }
  });

  // QR na wyświetlaczu - prowadzący (sparowany z buzzerem)
  ui.on("qr.host.toggle", async () => {
    const now = store.state.flags.qrHostOnDisplay || false;
    const buzzerNow = store.state.flags.qrBuzzerOnDisplay || false;

    // Wysyłamy komendę QR na wyświetlacz (host + buzzer)
    if (!now) {
      await devices.sendQrToDisplay();
      store.setQrHostOnDisplay(true);
      store.setQrBuzzerOnDisplay(true);
    } else {
      // Jeśli wyłączamy, wysyłamy czarny ekran
      await devices.sendDisplayCmd("APP BLACK");
      store.setQrHostOnDisplay(false);
      store.setQrBuzzerOnDisplay(false);
    }

    // Aktualizuj etykiety przycisków
    updateQrOnDisplayButtons();
  });

  ui.on("qr.buzzer.toggle", async () => {
    // Sparowane z hostem - ta sama logika
    const now = store.state.flags.qrBuzzerOnDisplay || false;

    if (!now) {
      await devices.sendQrToDisplay();
      store.setQrHostOnDisplay(true);
      store.setQrBuzzerOnDisplay(true);
    } else {
      await devices.sendDisplayCmd("APP BLACK");
      store.setQrHostOnDisplay(false);
      store.setQrBuzzerOnDisplay(false);
    }

    updateQrOnDisplayButtons();
  });

  // Obsługa przycisków QR dla każdego urządzenia (otwierają modal)
  ui.on("qr.display.show", () => showQrModal("display"));
  ui.on("qr.host.show", () => showQrModal("host"));
  ui.on("qr.buzzer.show", () => showQrModal("buzzer"));

  // SETUP
  ui.on("setup.backToDevices", () => store.setActiveCard("devices"));

  ui.on("teams.change", ({ teamA, teamB }) => {
    store.setTeams(teamA, teamB);
  });

    // ===== UI: Kolory =====
  let colorModalTarget = null; // "A" | "B" | "BACKGROUND"

  ui.on("colors.open", (target) => {
    if (target !== "A" && target !== "B" && target !== "BACKGROUND") return;
    colorModalTarget = target;

    const hex =
      target === "A" ? colors.A :
      target === "B" ? colors.B :
      colors.BACKGROUND;

    const rgb = hexToRgb(hex);

    ui.openColorModal?.(
      target === "A" ? t("control.teamAColorAria") :
      target === "B" ? t("control.teamBColorAria") :
      t("control.bgColorAria")
    );

    ui.setColorModalRgb?.(rgb);
    ui.setColorModalHex?.(hex);
  });

  ui.on("colors.close", () => {
    colorModalTarget = null;
    ui.closeColorModal?.();
  });

  ui.on("colors.reset", async () => {
    colors = {
      A: DEFAULT_COLORS.A,
      B: DEFAULT_COLORS.B,
      BACKGROUND: DEFAULT_COLORS.BACKGROUND,
    };

    ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND });

    // ustaw modal (jeśli otwarty) na domyślne dla aktualnego targetu
    if (colorModalTarget) {
      const hex =
        colorModalTarget === "A" ? colors.A :
        colorModalTarget === "B" ? colors.B :
        colors.BACKGROUND;
      ui.setColorModalHex?.(hex);
      ui.setColorModalRgb?.(hexToRgb(hex));
    }

    await sendColorsReset().catch(() => {});
  });

  ui.on("colors.input", ({ kind, value }) => {
    if (!colorModalTarget) return;

    // pobierz aktualne rgb z suwaków (źródło prawdy podczas kręcenia)
    const rEl = document.getElementById("colorR");
    const gEl = document.getElementById("colorG");
    const bEl = document.getElementById("colorB");

    let r = Number(rEl?.value ?? 0);
    let g = Number(gEl?.value ?? 0);
    let b = Number(bEl?.value ?? 0);

    if (kind === "HEX") {
      const h = normHex(value);
      if (!h) return;
      const rgb = hexToRgb(h);
      ui.setColorModalRgb?.(rgb);
      ui.setColorModalHex?.(h);
      applyColor(colorModalTarget, h);
      return;
    }

    if (kind === "R") r = Number(value ?? 0);
    if (kind === "G") g = Number(value ?? 0);
    if (kind === "B") b = Number(value ?? 0);

    const hex = rgbToHex(r, g, b);

    ui.setColorModalRgb?.({ r, g, b });
    ui.setColorModalHex?.(hex);

    applyColor(colorModalTarget, hex);
  });


  ui.on("advanced.change", () => {
    if (!ui.getAdvancedForm || !store.setAdvanced) return;

    const form = ui.getAdvancedForm();
    const adv = {};

    // mnożniki
    if (form.roundMultipliersText != null) {
      const parts = String(form.roundMultipliersText)
        .split(/[,\s]+/)
        .filter(Boolean);
      if (parts.length) {
        adv.roundMultipliers = parts.map((p) => {
          const n = Number.parseInt(p, 10);
          return Number.isFinite(n) && n > 0 ? n : 1;
        });
      }
    }

    // próg do finału
    if (form.finalMinPointsText != null && form.finalMinPointsText !== "") {
      const n = Number.parseInt(form.finalMinPointsText, 10);
      if (Number.isFinite(n) && n >= 0) adv.finalMinPoints = n;
    }

    // cel finału
    if (form.finalTargetText != null && form.finalTargetText !== "") {
      const n = Number.parseInt(form.finalTargetText, 10);
      if (Number.isFinite(n) && n >= 0) adv.finalTarget = n;
    }

    // mnożnik nagrody głównej
    if (form.finalPrizeMultiplierText != null && form.finalPrizeMultiplierText !== "") {
      const n = Number.parseInt(form.finalPrizeMultiplierText, 10);
      if (Number.isFinite(n) && n >= 1) adv.finalPrizeMultiplier = n;
    }

    // kwota nagrody głównej
    if (form.mainPrizeAmountText != null && form.mainPrizeAmountText !== "") {
      const n = Number.parseInt(form.mainPrizeAmountText, 10);
      if (Number.isFinite(n) && n >= 0) {
        adv.mainPrizeAmount = Math.min(n, 99999); // max 5 cyfr
      }
    }

    if (form.winMode === "logo" || form.winMode === "points" || form.winMode === "money") {
      adv.endScreenMode = form.winMode;
    }
    // kompatybilność wstecz:
    if (form.winMode === "money") adv.winEnabled = true;
    if (form.winMode === "logo") adv.winEnabled = false;
    if (form.winMode === "points") adv.winEnabled = true;

    store.setAdvanced(adv);
    ui.setMsg?.("msgAdvanced", APP_MSG.ADV_SAVED);
  });

  ui.on("advanced.reset", () => {
    if (!store.resetAdvanced || !ui.setAdvancedForm) return;
    store.resetAdvanced();
    ui.setAdvancedForm(store.state.advanced);
    ui.setMsg?.("msgAdvanced", APP_MSG.ADV_RESET);
  });

  ui.on("setup.next", () => store.setSetupStep("setup_look"));
  ui.on("setup.back", () => store.setSetupStep("setup_names"));
  ui.on("setup.look.next", () => store.setSetupStep("setup_game"));
  ui.on("setup.look.back", () => store.setSetupStep("setup_names"));
  ui.on("setup.game.next", () => goToNextSetupStep());
  ui.on("setup.game.back", () => store.setSetupStep("setup_look"));
  ui.on("setup.finish.back", () => store.setSetupStep("setup_game"));
  ui.on("setup.finish", () => {
    store.completeCard("setup");
    store.setActiveCard("rounds");
  });
  
  // Przycisk w setup_finish
  document.getElementById("btnSetupFinish2")?.addEventListener("click", () => {
    ui.emit("setup.finish");
  });
  document.getElementById("btnSetupFinishBack")?.addEventListener("click", () => {
    ui.emit("setup.finish.back");
  });
  
  // Przyciski w setup_game
  document.getElementById("btnSetupGameNext")?.addEventListener("click", () => {
    ui.emit("setup.game.next");
  });
  document.getElementById("btnSetupGameBack")?.addEventListener("click", () => {
    ui.emit("setup.game.back");
  });
  
  // Przyciski w setup_names
  document.getElementById("btnSetupNext")?.addEventListener("click", () => {
    ui.emit("setup.next");
  });
  document.getElementById("btnBackToDevices")?.addEventListener("click", () => {
    ui.emit("setup.back");
  });

  // Przyciski w setup_look
  document.getElementById("btnSetupLookNext")?.addEventListener("click", () => {
    ui.emit("setup.look.next");
  });
  document.getElementById("btnSetupLookBack")?.addEventListener("click", () => {
    ui.emit("setup.look.back");
  });
  
  // Nasłuchiwanie zmian w setup_game
  document.getElementById("finalYes")?.addEventListener("change", (e) => {
    if (e.target.checked) {
      store.setHasFinal(true);
      updateGameSettingsVisibility();
    }
  });
  document.getElementById("finalNo")?.addEventListener("change", (e) => {
    if (e.target.checked) {
      store.setHasFinal(false);
      updateGameSettingsVisibility();
    }
  });
  document.getElementById("finalRandom")?.addEventListener("change", (e) => {
    if (e.target.checked) {
      store.setFinalQuestionsMode("random");
    }
  });
  document.getElementById("finalPick")?.addEventListener("change", (e) => {
    if (e.target.checked) {
      store.setFinalQuestionsMode("pick");
    }
  });
  document.getElementById("roundsRandom")?.addEventListener("change", (e) => {
    if (e.target.checked) {
      store.setRoundsQuestionsMode("random");
    }
  });
  document.getElementById("roundsPick")?.addEventListener("change", (e) => {
    if (e.target.checked) {
      store.setRoundsQuestionsMode("pick");
    }
  });

  // Nasłuchiwanie zmian w trybie zakończenia gry (pokazuj/ukrywaj pola kwoty)
  document.getElementById("winModeLogo")?.addEventListener("change", updateGameSettingsVisibility);
  document.getElementById("winModePoints")?.addEventListener("change", updateGameSettingsVisibility);
  document.getElementById("winModeMoney")?.addEventListener("change", updateGameSettingsVisibility);
  
  // ===== Nawigacja w setup_game - decyzja o losowaniu =====
  function goToNextSetupStep() {
    saveGameSettings();

    const hasFinal = store.state.hasFinal === true;
    const finalMode = store.state.finalQuestionsMode;
    const roundsMode = store.state.roundsQuestionsMode;

    // Losuj finał w tle jeśli wybrano "random" i gramy finał (nie blokuj nawigacji)
    if (hasFinal && finalMode === "random") {
      pickRandomFinalQuestions().catch(console.error);
    }

    // Losuj rundy w tle jeśli wybrano "random" (nie blokuj nawigacji)
    if (roundsMode === "random") {
      pickRandomRoundsQuestions().catch(console.error);
    }

    // Decyzja: czy przechodzimy do wyboru ręcznego, czy od razu do finish?
    const needsFinalPick = hasFinal && finalMode === "pick";
    const needsRoundsPick = roundsMode === "pick";

    // Nawigacja natychmiastowa (bez czekania na losowanie)
    if (needsFinalPick) {
      // Najpierw wybór finału
      store.setSetupStep("setup_final");
    } else if (needsRoundsPick) {
      // Tylko wybór rund - przejdź do stepu wyboru kolejności
      store.setSetupStep("setup_rounds");
    } else {
      // Wszystko wylosowane - przejdź do finish
      store.setSetupStep("setup_finish");
    }
  }
  
  // Powrót z setup_final/setup_rounds do setup_game
  ui.on("setup.final.back", () => {
    store.unconfirmFinalQuestions();
    ui.setFinalConfirmed(false);
    store.setSetupStep("setup_game");
  });
  ui.on("setup.rounds.back", () => store.setSetupStep("setup_game"));
  ui.on("setup.rounds.next", () => {
    // Zatwierź kolejność rund i przejdź do finish
    store.setSetupStep("setup_finish");
  });
  ui.on("setup.final.next", () => {
    store.confirmFinalQuestions(finalPickerGetSelectedIds());
    ui.setFinalConfirmed(true);
    ui.setMsg("msgFinalPick", APP_MSG.FINAL_CONFIRMED);
    const roundsMode = store.state.roundsQuestionsMode;
    if (roundsMode === "pick") store.setSetupStep("setup_rounds");
    else store.setSetupStep("setup_finish");
  });  
  // Przycisk powrotu w setup_final
  document.getElementById("btnSetupFinalBack")?.addEventListener("click", () => {
    ui.emit("setup.final.back");
  });
  // Przycisk dalej w setup_final
  document.getElementById("btnSetupFinish")?.addEventListener("click", () => {
    ui.emit("setup.final.next");
  });

  // Przyciski w setup_rounds
  document.getElementById("btnSetupRoundsBack")?.addEventListener("click", () => {
    ui.emit("setup.rounds.back");
  });
  document.getElementById("btnSetupRoundsNext")?.addEventListener("click", () => {
    ui.emit("setup.rounds.next");
  });
  
  async function pickRandomFinalQuestions() {
    // Losuje 5 pytań z puli i zatwierdza
    // Use cached questions if available
    let all = [];
    const cached = sessionStorage.getItem("familiada:questionsCache");
    if (cached) {
      try { all = JSON.parse(cached); } catch {}
    }
    if (!all.length) {
      all = await loadQuestions(store.state.gameId || "");
    }
    
    if (!all || all.length < 5) {
      ui.setMsg("msgSetupGame", t("control.tooFewFinalQuestions"));
      return;
    }

    // Tasowanie Fisher-Yates
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }

    const picked = all.slice(0, 5).map(q => q.id);
    store.confirmFinalQuestions(picked);
  }
  
  async function pickRandomRoundsQuestions() {
    // Losuje pytania rund z pozostałych (po odjęciu finałowych)
    // Na razie tylko oznaczamy że losowane - właściwe losowanie w gameRounds.js
  }
  
  // ===== SETUP_FINISH - renderowanie podsumowania =====

  function renderSetupFinishSummary() {
    const s = store.state;

    // Drużyny
    const teamsEl = document.getElementById("summaryTeams");
    if (teamsEl) teamsEl.textContent = `${s.teams.teamA || "—"} vs ${s.teams.teamB || "—"}`;

    // Finał
    const finalEl = document.getElementById("summaryFinal");
    if (finalEl) finalEl.textContent = s.hasFinal ? t("common.yes") : t("common.no");

    // Sekcja pytań finału — ukryj gdy nie gramy finału
    const finalSection = document.getElementById("summaryFinalSection");
    if (finalSection) finalSection.style.display = s.hasFinal ? "" : "none";

    // Pytania finału
    const finalQEl = document.getElementById("summaryFinalQuestions");
    if (finalQEl) {
      if (!s.hasFinal) {
        finalQEl.innerHTML = "";
      } else {
        const pickedIds = s.final?.picked || [];
        const cached = sessionStorage.getItem("familiada:questionsCache");
        let all = [];
        try { all = cached ? JSON.parse(cached) : []; } catch {}
        const items = pickedIds.map(id => {
          const q = all.find(x => x.id === id);
          return q ? `<li>${escapeHtml((q.text || "").slice(0, 60))}</li>` : "";
        }).filter(Boolean);
        if (items.length) {
          finalQEl.innerHTML = items.join("");
        } else {
          finalQEl.innerHTML = `<li class="summaryQRandom">${s.finalQuestionsMode === "random" ? t("control.summaryQRandom") : t("control.summaryQNone")}</li>`;
        }
      }
    }

    // Pytania rund
    const roundsQEl = document.getElementById("summaryRoundsQuestions");
    if (roundsQEl) {
      if (s.roundsQuestionsMode === "random") {
        roundsQEl.innerHTML = `<li class="summaryQRandom">${t("control.summaryQWillRandom")}</li>`;
      } else {
        const ordered = s.roundsPicked || [];
        const items = ordered.map(q => `<li>${escapeHtml((q.text || "").slice(0, 60))}</li>`).filter(Boolean);
        roundsQEl.innerHTML = items.length ? items.join("") : `<li class="summaryQRandom">${t("control.summaryQNoOrder")}</li>`;
      }
    }
  }
  
  // ===== SETUP_ROUNDS - renderowanie listy pytań z drag-and-drop =====
  let roundsOrderAll = []; // wszystkie pytania (bez finałowych)
  
  async function renderSetupRoundsOrder() {
    const container = document.getElementById("roundsOrderList");
    if (!container) return;

    const s = store.state;
    const finalPickedIds = new Set(s.final?.picked || []);

    // Use cached questions if available, otherwise load
    let all = [];
    const cached = sessionStorage.getItem("familiada:questionsCache");
    if (cached) {
      try { all = JSON.parse(cached); } catch {}
    }
    if (!all.length) {
      all = await loadQuestions(s.gameId || "");
    }

    roundsOrderAll = (all || []).filter(q => !finalPickedIds.has(q.id));

    // Jeśli już mamy zapisaną kolejność, użyj jej
    if (s.roundsPicked?.length > 0) {
      // Przywróć zapisaną kolejność
      const ordered = s.roundsPicked;
      renderRoundsOrderList(container, ordered);
    } else {
      // Domyślna kolejność (jak w puli)
      renderRoundsOrderList(container, roundsOrderAll);
    }
  }
  
  function renderRoundsOrderList(container, questions) {
    container.innerHTML = questions.map((q, i) => `
      <div class="roundsOrderItem" draggable="true" data-id="${q.id}">
        <div class="roundsOrderHandle">⋮⋮</div>
        <div class="roundsOrderNum">${i + 1}</div>
        <div class="roundsOrderText">${escapeHtml(q.text || "")}</div>
        <div class="roundsOrderActions">
          <button class="roundsOrderBtn" data-dir="up" title="W górę">↑</button>
          <button class="roundsOrderBtn" data-dir="down" title="W dół">↓</button>
        </div>
      </div>
    `).join("");
    
    // Obsługa przycisków góra/dół
    container.querySelectorAll(".roundsOrderBtn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const item = e.target.closest(".roundsOrderItem");
        const dir = btn.dataset.dir;
        const id = item.dataset.id;
        moveRoundsOrderItem(id, dir);
      });
    });
    
    // Drag and drop
    setupRoundsDragAndDrop(container);
  }
  
  function moveRoundsOrderItem(id, dir) {
    const container = document.getElementById("roundsOrderList");
    if (!container) return;
    
    const items = Array.from(container.querySelectorAll(".roundsOrderItem"));
    const idx = items.findIndex(item => item.dataset.id === id);
    if (idx < 0) return;
    
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    
    // Zamień miejscami
    if (dir === "up") {
      container.insertBefore(items[idx], items[newIdx]);
    } else {
      container.insertBefore(items[newIdx], items[idx]);
    }
    
    // Aktualizuj numerację
    updateRoundsOrderNumbers();
  }
  
  function updateRoundsOrderNumbers() {
    const container = document.getElementById("roundsOrderList");
    if (!container) return;
    
    container.querySelectorAll(".roundsOrderItem").forEach((item, i) => {
      const numEl = item.querySelector(".roundsOrderNum");
      if (numEl) numEl.textContent = i + 1;
    });
  }
  
  function setupRoundsDragAndDrop(container) {
    let draggedItem = null;
    
    container.querySelectorAll(".roundsOrderItem").forEach(item => {
      item.addEventListener("dragstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      
      item.addEventListener("dragend", () => {
        draggedItem = null;
        item.classList.remove("dragging");
        updateRoundsOrderNumbers();
        saveRoundsOrder();
      });
      
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedItem && draggedItem !== item) {
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            container.insertBefore(draggedItem, item);
          } else {
            container.insertBefore(draggedItem, item.nextSibling);
          }
        }
      });
    });
  }
  
  function saveRoundsOrder() {
    const container = document.getElementById("roundsOrderList");
    if (!container) return;
    
    const ordered = [];
    container.querySelectorAll(".roundsOrderItem").forEach(item => {
      const id = item.dataset.id;
      const q = roundsOrderAll.find(x => x.id === id);
      if (q) ordered.push(q);
    });
    
    store.setRoundsPicked(ordered);
  }
  
  ui.on("final.toggle", (hasFinal) => {
    store.setHasFinal(hasFinal);
    ui.setFinalHasFinal(hasFinal);   // <-- to chowa/pokazuje #finalPickerCard
    finalPickerUpdateButtons();
  });


  ui.on("final.reload", async () => {
    ui.setMsg("msgFinalPick", APP_MSG.FINAL_RELOAD_START);
    try {
      await finalPickerReload();
      ui.setMsg("msgFinalPick", APP_MSG.FINAL_RELOAD_DONE);
    } catch (e) {
      ui.setMsg("msgFinalPick", e?.message || String(e));
    }
  });

    // pierwszy load – żeby lista była gotowa po wejściu w krok 2/2
  finalPickerReload().catch((e) => {
    console.error(e);
    ui.setMsg("msgFinalPick", e?.message || String(e));
  });

  ui.on("final.confirm", () => {
    store.confirmFinalQuestions(finalPickerGetSelectedIds());
    ui.setFinalConfirmed(true);
    ui.setMsg("msgFinalPick", APP_MSG.FINAL_CONFIRMED);
    finalPickerRender();
  });

  ui.on("final.edit", () => {
    store.unconfirmFinalQuestions();
    ui.setFinalConfirmed(false);
    ui.setMsg("msgFinalPick", "");
    finalPickerRender();
  });

    // ROUNDS
  ui.on("game.startIntro", async () => {
    if (!store.state.locks.gameStarted) {
      store.setGameStarted(true);
      await rounds.stateGameReady();
    }
    await rounds.stateStartGameIntro();
  });

  ui.on("rounds.start", async () => {
    await rounds.startRound();
  });

  // duel
  ui.on("buzz.enable", () => rounds.enableBuzzerDuel());
  ui.on("buzz.retry", () => rounds.retryDuel());
  ui.on("buzz.acceptA", () => rounds.acceptBuzz("A"));
  ui.on("buzz.acceptB", () => rounds.acceptBuzz("B"));

  // play
  ui.on("rounds.pass", () => rounds.passQuestion());
  ui.on("rounds.timer3", () => rounds.startTimer3());
  ui.on("rounds.answerClick", (ord) => rounds.revealAnswerByOrd(ord));
  ui.on("rounds.addX", () => rounds.addX());
  ui.on("rounds.goEnd", () => rounds.goEndRound());

  // odsłanianie pozostałych odpowiedzi
  ui.on("rounds.showReveal", () => rounds.showRevealLeft());
  ui.on("rounds.revealClick", (ord) => rounds.revealLeftByOrd(ord));
  ui.on("rounds.revealDone", () => rounds.revealDone());
  ui.on("rounds.gameEndShow", () => rounds.gameEndShow());

  // FINAL (runtime – nie picker)
  final.bootIfNeeded();

  ui.on("final.start", () => final.startFinal());
  ui.on("final.back", (card) => store.setActiveCard(card));
  ui.on("final.backStep", (step) => final.backTo(step));

  ui.on("final.p1.timerStart", () => final.p1StartTimer());
  ui.on("final.p1.toQ", (n) => final.toP1MapQ(n));
  ui.on("final.p1.nextQ", (n) => final.nextFromP1Q(n));

  ui.on("final.p2.start", () => final.startP2Round());
  ui.on("final.repeatTest", () => {
    playSfx("answer_repeat");
  });

  ui.on("final.p2.timerStart", () => final.p2StartTimer());
  ui.on("final.p2.toQ", (n) => final.toP2MapQ(n));
  ui.on("final.p2.nextQ", (n) => final.nextFromP2Q(n));

  ui.on("final.finish", () => final.finishFinal());

  ui.setRoundsStep(
    store.state.rounds.phase === "IDLE" || store.state.rounds.phase === "READY"
      ? "READY"
      : store.state.rounds.phase === "INTRO"
      ? "INTRO"
      : "ROUND"
  );

  // boot view state
  ui.setQrToggleLabel(
    store.state.flags.qrOnDisplay,
    store.state.flags.displayOnline && store.state.flags.buzzerOnline
  );
}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("msgSide");
  if (el) el.textContent = e?.message || String(e);
  if (e?._notFound) {
    setTimeout(() => { location.href = "builder?tab=market"; }, 3000);
  }
});
