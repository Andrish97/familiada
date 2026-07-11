// /familiada/js/pages/controlapp.js
import { confirmModal } from "../../js/core/modal.js?v=v2026-07-11T21245";
import { getUiLang, initI18n, t } from "../../translation/translation.js?v=v2026-07-11T21245";
import { v as cacheBust } from "../../js/core/cache-bust.js?v=v2026-07-11T21245";

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

  get CODE_COPY_OK() { return t("control.codeCopyOk"); },
  get CODE_COPY_FAIL() { return t("control.codeCopyFail"); },

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

import { requireAuth, signOut } from "../../js/core/auth.js?v=v2026-07-11T21245";
import { setTopbarAccount } from "../../js/core/topbar-controller.js?v=v2026-07-11T21245";
import { isGuestUser } from "../../js/core/guest-mode.js?v=v2026-07-11T21245";
import { sb } from "../../js/core/supabase.js?v=v2026-07-11T21245";
import { rt } from "../../js/core/realtime.js?v=v2026-07-11T21245";
import { validateGameReadyToPlay, loadGameBasic, loadQuestions, loadAnswers } from "../../js/core/game-validate.js?v=v2026-07-11T21245";
import { unlockAudio, isAudioUnlocked, playSfx } from "../../js/core/sfx.js?v=v2026-07-11T21245";
import { createStore } from "./store.js?v=v2026-07-11T21245";
import { createUI } from "./ui.js?v=v2026-07-11T21245";
import { createDevices } from "./devices.js?v=v2026-07-11T21245";
import { createPresence } from "./presence.js?v=v2026-07-11T21245";
import { createDisplay } from "./display.js?v=v2026-07-11T21245";
import { createRounds } from "./gameRounds.js?v=v2026-07-11T21245";
import { createFinal } from "./gameFinal.js?v=v2026-07-11T21245";
import { initShareDevice } from "./share-device.js?v=v2026-07-11T21245";
import { loadFont5x7, buildLogoPreviewCanvas } from "../../js/core/logo-preview.js?v=v2026-07-11T21245";

initI18n({ withSwitcher: true });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

// ================== KOLORY (domyślne) ==================
const DEFAULT_COLORS = {
  A: "#c4002f",
  B: "#2a62ff",
  BACKGROUND: "#d21180",
  DOT: "#d7ff3d",
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
      await expireConnectCodes();
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
    .select("id,name,type,status,share_key_display,share_key_host,share_key_buzzer,settings")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (data?.id !== basic.id) throw new Error(APP_MSG.DATA_MISMATCH);
  return data;
}

// Stosuje dane z games.settings JSON do store przed startem UI
function applyGameSettingsToStore(settings, store) {
  if (!settings || typeof settings !== "object") return;

  const { teams, display, game, questions } = settings;

  if (teams?.teamA || teams?.teamB) {
    store.setTeams(teams.teamA || "", teams.teamB || "");
  }

  if (display) {
    store.setDisplay({
      colors: display.colors,
      theme: display.theme,
      logoId: display.logoId,
    });
  }

  if (game) {
    if (game.hasFinal !== undefined && game.hasFinal !== null) {
      store.setHasFinal(game.hasFinal);
    }
    if (game.finalQuestionsMode) {
      store.setFinalQuestionsMode(game.finalQuestionsMode);
    }
    if (game.roundsQuestionsMode) {
      store.setRoundsQuestionsMode(game.roundsQuestionsMode);
    }
    if (game.advanced && typeof game.advanced === "object") {
      store.setAdvanced(game.advanced);
    }
  }

  if (questions) {
    if (Array.isArray(questions.final) && questions.final.length > 0) {
      const ids = questions.final.map(q => q.id).filter(Boolean);
      if (ids.length > 0) store.confirmFinalQuestions(ids);
    }
    if (Array.isArray(questions.rounds) && questions.rounds.length > 0) {
      store.setRoundsPicked(questions.rounds);
    }
  }
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

  
  // Store tworzony tutaj — zanim zainicjujemy kolory, żeby odczytać display z localStorage
  const store = createStore(game.id);
  store.hydrate();

  // Wczytaj ustawienia z games.settings (DB) i zastosuj do store
  applyGameSettingsToStore(game.settings, store);

  // ===== Kolory: inicjalizowane ze store.state.display =====
  let colors = {
    A: normHex(store.state.display.colors.A) ?? DEFAULT_COLORS.A,
    B: normHex(store.state.display.colors.B) ?? DEFAULT_COLORS.B,
    BACKGROUND: normHex(store.state.display.colors.BACKGROUND) ?? DEFAULT_COLORS.BACKGROUND,
    DOT: normHex(store.state.display.colors.DOT) ?? DEFAULT_COLORS.DOT,
  };

  // pokaż na start kafelki
  ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND, dot: colors.DOT });

  // ===== Motyw: stan UI (lokalny) =====
  let activeTheme = null;
  let themeList = [];

  // wczytaj listę motywów z themes.json
  (async () => {
    try {
      const res = await fetch("./display/js/themes.json");
      const json = await res.json();
      const defaultTheme = json.default || "classic";
      themeList = json.themes.map(e => {
        const lang = document.documentElement.lang || "pl";
        const label = typeof e.label === "object"
          ? (e.label[lang] ?? e.label["pl"] ?? e.key)
          : t(e.label);
        return { key: e.key, label };
      });
      // przywróć zapisany motyw jeśli istnieje na liście, inaczej domyślny
      const savedTheme = store.state.display.theme;
      activeTheme = (savedTheme && themeList.some(t => t.key === savedTheme))
        ? savedTheme
        : defaultTheme;
      ui.setThemeOptions?.(themeList);
      ui.setActiveTheme?.(activeTheme);
    } catch (e) {
      console.warn("Nie można wczytać themes.json:", e);
    }
  })();

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

  const sendColorDot = async (hex) => {
    if (!devices) return;
    const h = normHex(hex);
    if (!h) return;
    await devices.sendDisplayCmd(`COLOR DOT ${h}`).catch(() => {});
  };

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
      ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND, dot: colors.DOT });
      sendColorA(h);
      store.setDisplay({ colors: { ...colors } });
      return;
    }
    if (kind === "B") {
      colors.B = h;
      ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND, dot: colors.DOT });
      sendColorB(h);
      store.setDisplay({ colors: { ...colors } });
      return;
    }
    if (kind === "BACKGROUND") {
      colors.BACKGROUND = h;
      ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND, dot: colors.DOT });
      sendColorBg(h);
      store.setDisplay({ colors: { ...colors } });
      return;
    }
    if (kind === "DOT") {
      colors.DOT = h;
      ui.setSwatches?.({ teamA: colors.A, teamB: colors.B, bg: colors.BACKGROUND, dot: colors.DOT });
      sendColorDot(h);
      store.setDisplay({ colors: { ...colors } });
      return;
    }
  }
  

  // === Modal QR z auth bar (top-status) ===
  let currentQrKind = null; // "display" | "host" | "buzzer"
  const _deviceCodes = { display: null, host: null, buzzer: null };

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

    const overlay     = document.getElementById("qrModalOverlay");
    const titleEl     = document.getElementById("qrModalTitle");
    const imgEl       = document.getElementById("qrModalImg");
    const codeValEl   = document.getElementById("qrModalCodeVal");

    if (!overlay || !titleEl || !imgEl) return;

    titleEl.textContent = APP_MSG.QR_LABEL(kind);
    imgEl.src = qrSrc(url);
    if (codeValEl) codeValEl.textContent = _deviceCodes[kind] || "——————";

    const openBtn = document.getElementById("qrModalOpen");
    if (openBtn) {
      if (kind === "display") {
        openBtn.href = url;
        openBtn.classList.remove("hidden");
      } else {
        openBtn.classList.add("hidden");
      }
    }

    overlay.classList.remove("hidden");
  }

  async function expireConnectCodes() {
    try {
      await sb().from("device_connect_codes").delete().eq("owner_id", (await sb().auth.getUser()).data.user?.id).eq("game_id", game.id);
    } catch {}
  }

  async function initDeviceCodes() {
    const cfgs = [
      { type: "display", valId: "displayCodeVal", shareKey: game.share_key_display },
      { type: "host",    valId: "hostCodeVal",    shareKey: game.share_key_host },
      { type: "buzzer",  valId: "buzzerCodeVal",  shareKey: game.share_key_buzzer },
    ];
    for (const cfg of cfgs) {
      try {
        const { data, error } = await sb().rpc("generate_device_connect_code", {
          p_game_id:     game.id,
          p_device_type: cfg.type,
          p_share_key:   cfg.shareKey || "",
          p_game_name:   game.name || null,
        });
        if (error || !data?.ok || !data?.code) continue;
        _deviceCodes[cfg.type] = data.code;
        const el = document.getElementById(cfg.valId);
        if (el) el.textContent = data.code;
      } catch {}
    }
  }

  async function copyQrLink() {
    const code = _deviceCodes[currentQrKind];
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  }

  function openQrLink() {
    const url = getDeviceUrl(currentQrKind);
    if (!url) return;
    window.open(url, "_blank");
  }


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
    expireConnectCodes().catch(() => {});
  });

  // realtime channels
  const chDisplay = rt(`familiada-display:${game.id}`);
  const chHost = rt(`familiada-host:${game.id}`);
  const chBuzzer = rt(`familiada-buzzer:${game.id}`);

  const devices = createDevices({ game, ui, store, chDisplay, chHost, chBuzzer });
  const presence = createPresence({ game, ui, store, devices, getTheme: () => activeTheme });

  shareDevice = initShareDevice({ currentUser, game, devices });
  void shareDevice.refreshBadges();

  let wasInSetupFinish = false;
  let prevDisplayOnline = false;
  // Załadowana czcionka (potrzebna do podglądu GLYPH)
  let _logoFont = null;
  // Domyślne logo Familiady (payload z pliku JSON)
  let _defaultLogoPayload = null;
  // Cache załadowanych logo (potrzebny w streszczeniu)
  let _loadedLogos = [];
  // true gdy game.settings zawierały zapisane ustawienia (nie null)
  const _hasCustomSettings = game.settings != null && typeof game.settings === "object";



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

      // Generuj kody połączeń
      await initDeviceCodes().catch(() => {});

      // Send LANG commands (non-blocking)
      const initialLang = getUiLang();
      await Promise.all([
        devices.sendDisplayCmd(`LANG ${initialLang}`).catch(() => {}),
        devices.sendHostCmd(`LANG ${initialLang}`).catch(() => {}),
        devices.sendBuzzerCmd(`LANG ${initialLang}`).catch(() => {}),
      ]);

      if (store.state.flags.qrOnDisplay) {
        await devices.sendQrLinksToDisplay(_deviceCodes, store.state.flags).catch(() => {});
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

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Language change handler
  window.addEventListener("i18n:lang", async (event) => {
    const nextLang = event?.detail?.lang;
    // Przelicz etykiety motywów po zmianie języka
    if (themeList.length) {
      const res = await fetch("./display/js/themes.json").then(r => r.json()).catch(() => null);
      if (res) {
        themeList = res.themes.map(e => {
          const label = typeof e.label === "object"
            ? (e.label[nextLang] ?? e.label["en"] ?? e.key)
            : t(e.label);
          return { key: e.key, label };
        });
        ui.setThemeOptions?.(themeList);
        if (activeTheme) ui.setActiveTheme?.(activeTheme);
      }
    }
    devices.updateLinksAndQr(nextLang);
    await Promise.all([
      devices.sendDisplayCmd(`LANG ${nextLang}`).catch(() => {}),
      devices.sendHostCmd(`LANG ${nextLang}`).catch(() => {}),
      devices.sendBuzzerCmd(`LANG ${nextLang}`).catch(() => {}),
    ]);
    if (store.state.flags.qrOnDisplay) {
      await devices.sendQrLinksToDisplay(_deviceCodes, store.state.flags).catch(() => {});
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

    const displayReady  = !!flags.displayOnline;
    const physBuzzer    = !!flags.physicalBuzzer;
    const noHostTablet  = !!flags.noHostTablet;
    const buzzerReady   = !!flags.buzzerOnline || physBuzzer;
    const hostReady     = !!flags.hostOnline   || noHostTablet;
    const requiredOnline = displayReady && buzzerReady && hostReady;

    // Opt-out: wyszarz całą sekcję urządzenia
    const buzzerRow = document.querySelector(".device-row[data-device='buzzer']");
    const hostRow   = document.querySelector(".device-row[data-device='host']");
    if (buzzerRow) buzzerRow.toggleAttribute("data-opted-out", physBuzzer);
    if (hostRow)   hostRow.toggleAttribute("data-opted-out", noHostTablet);

    // Topbar: wyszarz dot-row gdy opt-out
    const dotBuzzerRow = document.getElementById("dotBuzzerRow");
    const dotHostRow   = document.getElementById("dotHostRow");
    if (dotBuzzerRow) dotBuzzerRow.classList.toggle("opted-out", physBuzzer);
    if (dotHostRow)   dotHostRow.classList.toggle("opted-out", noHostTablet);

    // QR na wyświetlaczu tylko gdy wyświetlacz jest online
    ui.setEnabled("btnQrToggle", displayReady);

    // Aktualizuj przyciski "QR na wyświetlaczu" dla hosta i buzzera
    updateQrOnDisplayButtons();

    ui.setEnabled("btnDispBlack", displayReady);

    ui.setEnabled("btnDevicesNext", requiredOnline);

    // krok 3: „Gotowe — przejdź dalej" po odblokowaniu audio
    ui.setEnabled(
      "btnDevicesFinish",
      requiredOnline && !!flags.audioUnlocked
    );

    // ===== SETUP =====

    // ===== detekcja wejścia z setup_finish =====
    const inSetupFinish =
      (state.activeCard === "setup" && state.steps?.setup === "setup_finish");

    const displayJustCameOnline = !!state.flags?.displayOnline && !prevDisplayOnline;
    // wywołaj enterSetupFinish: przy pierwszym wejściu LUB gdy wyświetlacz się podłączył podczas setup_finish
    if (inSetupFinish && (!wasInSetupFinish || displayJustCameOnline)) {
      enterSetupFinish().catch(() => {});
    }
    if (inSetupFinish) {
      renderSetupFinishSummary();
    }
    wasInSetupFinish = inSetupFinish;
    prevDisplayOnline = !!state.flags?.displayOnline;

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
    const f = store.state.flags;
    const hostOn    = !!f.qrHostOnDisplay;
    const buzzerOn  = !!f.qrBuzzerOnDisplay;
    const displayOk = !!f.displayOnline;

    const btnHost   = document.getElementById("btnQrHostOnDisplay");
    const btnBuzzer = document.getElementById("btnQrBuzzerOnDisplay");

    if (btnHost) {
      btnHost.style.display = f.noHostTablet ? "none" : "";
      btnHost.textContent   = hostOn ? t("control.qrHide") : t("control.qrOnDisplay");
      btnHost.disabled      = !displayOk;
    }
    if (btnBuzzer) {
      btnBuzzer.style.display = f.physicalBuzzer ? "none" : "";
      btnBuzzer.textContent   = buzzerOn ? t("control.qrHide") : t("control.qrOnDisplay");
      btnBuzzer.disabled      = !displayOk;
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
    await expireConnectCodes();
    suppressUnloadWarn = true;
    location.href = "../builder";
  });
  
  ui.on("top.manual", () => {
    openHelpModal();
  });

  ui.on("auth.showQr", (kind) => showQrModal(kind));
  ui.on("auth.qr.close", () => hideQrModal());
  ui.on("auth.qr.copy", () => copyQrLink());

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
    store.setSetupStep("setup_finish");
    store.setActiveCard("setup");
  });

  ui.on("devices.copyCode", async (kind) => {
    const code = _deviceCodes[kind];
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  });

  ui.on("display.black", async () => {
    await devices.sendDisplayCmd("APP BLACK");
  });

  // Wysyła właściwą komendę QR lub BLACK na podstawie qrHostOnDisplay + qrBuzzerOnDisplay + opt-out
  async function syncQrDisplay() {
    const f = store.state.flags;
    const wantHost   = !!f.qrHostOnDisplay   && !f.noHostTablet;
    const wantBuzzer = !!f.qrBuzzerOnDisplay  && !f.physicalBuzzer;

    if (!wantHost && !wantBuzzer) {
      store.setQrHostOnDisplay(false);
      store.setQrBuzzerOnDisplay(false);
      await devices.sendDisplayCmd("APP BLACK").catch(() => {});
      return;
    }

    // Przekaż syntetyczne flagi: opt-out = odwrotność tego co chcemy pokazać
    const syntheticFlags = { ...f, noHostTablet: !wantHost, physicalBuzzer: !wantBuzzer };
    await devices.sendDisplayCmd("APP QR").catch(() => {});
    await devices.sendQrLinksToDisplay(_deviceCodes, syntheticFlags).catch(() => {});
    updateQrOnDisplayButtons();
  }

  ui.on("devices.physicalBuzzer", async (checked) => {
    const wasShowingBuzzer = !!store.state.flags.qrBuzzerOnDisplay;
    store.setPhysicalBuzzer(checked);
    if (checked && wasShowingBuzzer) {
      store.setQrBuzzerOnDisplay(false);
      await syncQrDisplay();
    }
    updateQrOnDisplayButtons();
  });

  ui.on("devices.noHostTablet", async (checked) => {
    const wasShowingHost = !!store.state.flags.qrHostOnDisplay;
    store.setNoHostTablet(checked);
    if (checked && wasShowingHost) {
      store.setQrHostOnDisplay(false);
      await syncQrDisplay();
    }
    updateQrOnDisplayButtons();
  });

  // Globalny przycisk "Schowaj QR" — chowa wszystko
  ui.on("qr.toggle", async () => {
    store.setQrHostOnDisplay(false);
    store.setQrBuzzerOnDisplay(false);
    store.setQrOnDisplay(false);
    await devices.sendDisplayCmd("APP BLACK").catch(() => {});
    updateQrOnDisplayButtons();
  });

  ui.on("qr.host.toggle", async () => {
    const now = !!store.state.flags.qrHostOnDisplay;
    store.setQrHostOnDisplay(!now);
    await syncQrDisplay();
  });

  ui.on("qr.buzzer.toggle", async () => {
    const now = !!store.state.flags.qrBuzzerOnDisplay;
    store.setQrBuzzerOnDisplay(!now);
    await syncQrDisplay();
  });

  // Obsługa przycisków QR dla każdego urządzenia (otwierają modal)
  ui.on("qr.display.show", () => showQrModal("display"));
  ui.on("qr.host.show", () => showQrModal("host"));
  ui.on("qr.buzzer.show", () => showQrModal("buzzer"));

  // SETUP
  ui.on("setup.backToDevices", () => store.setActiveCard("devices"));

  // ===== Motyw =====
  const sendTheme = async (key) => {
    if (!devices || !key) return;
    await devices.sendDisplayCmd(`THEME ${key}`).catch(() => {});
  };

  ui.on("setup.finish.back", () => store.setActiveCard("devices"));
  ui.on("setup.finish", () => {
    // zastosuj aktualne ustawienia wyświetlacza przed przejściem do gry
    sendColorA(colors.A);
    sendColorB(colors.B);
    sendColorBg(colors.BACKGROUND);
    sendColorDot(colors.DOT);
    if (activeTheme) sendTheme(activeTheme);
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
  
  // ===== SETUP_FINISH =====

  async function enterSetupFinish() {
    // Załaduj font i logo potrzebne do podglądu w streszczeniu
    if (!_logoFont) {
      try { _logoFont = await loadFont5x7(); } catch {}
    }
    if (!_defaultLogoPayload) {
      try {
        const r = await fetch(await cacheBust("/display/logo_familiada.json"), { cache: "force-cache" });
        if (r.ok) _defaultLogoPayload = await r.json();
      } catch {}
    }
    // Załaduj logo użytkownika (potrzebne do podglądu w streszczeniu)
    if (_loadedLogos.length === 0 && store.state.display.logoId) {
      try {
        const { data } = await sb().from("user_logos").select("id,name,type,payload").order("updated_at", { ascending: false });
        _loadedLogos = data || [];
      } catch {}
    }

    // Losowanie pytań (jeśli tryb losowy i jeszcze nie wylosowano)
    if (store.state.hasFinal === true && store.state.finalQuestionsMode === "random"
        && (!store.state.final?.confirmed || (store.state.final?.picked || []).length !== 5)) {
      try {
        const cached = sessionStorage.getItem("familiada:questionsCache");
        let all = [];
        try { all = cached ? JSON.parse(cached) : []; } catch {}
        const roundsPool = store.state.rounds?._questionPool || [];
        const usedIds = new Set(roundsPool.map(q => String(q.id)));
        const pool = all.filter(q => !usedIds.has(String(q.id)));
        const shuffled = pool.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const ids = shuffled.slice(0, 5).map(q => q.id).filter(Boolean);
        if (ids.length === 5) store.confirmFinalQuestions(ids);
      } catch {}
    }

    await rounds.prePickForSummary().catch(() => {});

    // Inicjalizacja urządzeń: wyślij kolory, motyw, logo, nazwy drużyn
    if (devices) {
      const teamA = store.state.teams?.teamA || t("gameSettings.teams.defaultA") || "Drużyna A";
      const teamB = store.state.teams?.teamB || t("gameSettings.teams.defaultB") || "Drużyna B";
      const q = (s) => `"${String(s ?? "").replace(/"/g, "'")}"`;
      await devices.sendDisplayCmd("APP GAME").catch(() => {});
      await devices.sendBuzzerCmd("ON").catch(() => {});
      await devices.sendHostCmd("COVER").catch(() => {});
      sendColorA(colors.A);
      sendColorB(colors.B);
      sendColorBg(colors.BACKGROUND);
      sendColorDot(colors.DOT);
      if (activeTheme) sendTheme(activeTheme);
      await devices.sendDisplayCmd(`LOGO RELOAD`).catch(() => {});
      await devices.sendDisplayCmd(`LONG1 ${q(teamA)}`).catch(() => {});
      await devices.sendDisplayCmd(`LONG2 ${q(teamB)}`).catch(() => {});
      await devices.sendHostCmd(`SET1 ${q(teamA)}`).catch(() => {});
      await devices.sendHostCmd(`SET2 ${q(teamB)}`).catch(() => {});
    }
  }

  function renderSetupFinishSummary() {
    const s = store.state;

    // Baner domyślnych ustawień
    const hintEl = document.getElementById("summaryDefaultHint");
    const hintTextEl = document.getElementById("summaryDefaultHintText");
    if (hintEl && hintTextEl) {
      if (!_hasCustomSettings) {
        const msg = t("control.summaryDefaultSettings") || "Używasz domyślnych ustawień rozgrywki.";
        const linkLabel = t("control.summaryDefaultSettingsLink") || "Otwórz ustawienia →";
        const settingsUrl = `/game-settings?id=${store.state.gameId || gameId}`;
        hintTextEl.innerHTML = `${escapeHtml(msg)} <a href="${escapeHtml(settingsUrl)}" class="summaryDefaultHintLink">${escapeHtml(linkLabel)}</a>`;
        hintEl.classList.remove("hidden");
      } else {
        hintEl.classList.add("hidden");
      }
    }

    const defaultA = t("gameSettings.teams.defaultA") || "Drużyna A";
    const defaultB = t("gameSettings.teams.defaultB") || "Drużyna B";
    const teamA = s.teams?.teamA || defaultA;
    const teamB = s.teams?.teamB || defaultB;

    // Drużyny
    const teamsEl = document.getElementById("summaryTeams");
    if (teamsEl) teamsEl.textContent = `${teamA} vs ${teamB}`;

    // Wygląd — kolory z nazwami drużyn
    const colorDotsEl = document.getElementById("summaryColorDots");
    if (colorDotsEl) {
      const c = s.display.colors;
      const labels = {
        A: teamA,
        B: teamB,
        BACKGROUND: t("control.colorBg") || "Tło",
        DOT: t("control.colorDot") || "Kropki",
      };
      colorDotsEl.innerHTML = ["A", "B", "BACKGROUND", "DOT"].map(k =>
        `<span class="summaryColorDotItem"><span class="summaryColorDot" style="background:${c[k]}"></span><span class="summaryColorDotLabel">${escapeHtml(labels[k])}</span></span>`
      ).join("");
    }

    // Motyw — "Klasyczny" gdy null/brak (domyślny)
    const themeNameEl = document.getElementById("summaryThemeName");
    if (themeNameEl) {
      const effectiveTheme = s.display.theme || "classic";
      const th = themeList.find(th => th.key === effectiveTheme);
      themeNameEl.textContent = th?.label || effectiveTheme;
    }

    const logoTileEl = document.getElementById("summaryLogoTile");
    if (logoTileEl) {
      logoTileEl.innerHTML = "";
      const logoId = s.display.logoId;
      let logoObj = null;
      if (logoId) {
        const found = _loadedLogos.find(l => l.id === logoId);
        if (found) logoObj = found;
      }
      const previewSrc = logoObj ?? (
        _defaultLogoPayload ? { type: "GLYPH_30x10", payload: _defaultLogoPayload } : null
      );
      if (previewSrc && _logoFont) {
        const canvas = buildLogoPreviewCanvas(previewSrc, _logoFont);
        const frame = document.createElement("div");
        frame.className = "summaryLogoFrame";
        frame.appendChild(canvas);
        logoTileEl.appendChild(frame);
      } else {
        logoTileEl.textContent = logoObj?.name || (logoId ? "—" : t("control.lookLogoDefault"));
      }
    }

    // Finał
    const finalEl = document.getElementById("summaryFinal");
    if (finalEl) finalEl.textContent = s.hasFinal ? t("common.yes") : t("common.no");

    // Sekcja pytań finału — ukryj gdy nie gramy finału
    const finalSection = document.getElementById("summaryFinalSection");
    if (finalSection) finalSection.style.display = s.hasFinal ? "" : "none";

    // Pytania finału — pokaż wylosowane (lub picked)
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
        finalQEl.innerHTML = items.length
          ? items.join("")
          : `<li class="summaryQRandom">${t("control.summaryQNone")}</li>`;
      }
    }

    // Pytania rund — pokaż wylosowane (lub ordered)
    const roundsQEl = document.getElementById("summaryRoundsQuestions");
    if (roundsQEl) {
      const pool = s.rounds?._questionPool || [];
      if (pool.length > 0) {
        roundsQEl.innerHTML = pool.map(q => `<li>${escapeHtml((q.text || "").slice(0, 60))}</li>`).join("");
      } else if (s.roundsQuestionsMode === "pick") {
        const ordered = s.roundsPicked || [];
        const items = ordered.map(q => `<li>${escapeHtml((q.text || "").slice(0, 60))}</li>`).filter(Boolean);
        roundsQEl.innerHTML = items.length ? items.join("") : `<li class="summaryQRandom">${t("control.summaryQNoOrder")}</li>`;
      } else {
        roundsQEl.innerHTML = `<li class="summaryQRandom">${t("control.summaryQWillRandom")}</li>`;
      }
    }
  }
  

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
  ui.on("buzz.retry", () => {
    if (store.state.flags.physicalBuzzer) rounds.confirmPhysicalTeam();
    else rounds.retryDuel();
  });
  ui.on("buzz.acceptA", () => {
    if (store.state.flags.physicalBuzzer) rounds.physicalSelectTeam("A");
    else rounds.acceptBuzz("A");
  });
  ui.on("buzz.acceptB", () => {
    if (store.state.flags.physicalBuzzer) rounds.physicalSelectTeam("B");
    else rounds.acceptBuzz("B");
  });

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

function showGlobalError(msg) {
  const bar = document.getElementById("alertBar");
  const txt = document.getElementById("alertTxt");
  if (txt) txt.textContent = msg;
  bar?.classList.remove("hidden");
}

window.addEventListener("unhandledrejection", (ev) => {
  const msg = ev.reason?.message || String(ev.reason ?? "Nieznany błąd");
  console.error("[unhandled]", msg);
  showGlobalError(msg);
});

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("msgSide");
  if (el) el.textContent = e?.message || String(e);
  showGlobalError(e?.message || String(e));
  if (e?._notFound) {
    setTimeout(() => { location.href = "builder?tab=market"; }, 3000);
  }
});
