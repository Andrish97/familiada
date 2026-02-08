// /familiada/js/pages/control/app.js
import { getUiLang, initI18n, t } from "../../translation/translation.js";

// ================== KOMUNIKATY ==================
const APP_MSG = {
  get NO_ID() { return t("control.noId"); },
  GAME_NOT_READY: (reason) => t("control.gameNotReady", { reason }),
  get DATA_MISMATCH() { return t("control.dataMismatch"); },

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

import { requireAuth, signOut } from "../../js/core/auth.js";
import { sb } from "../../js/core/supabase.js";
import { rt } from "../../js/core/realtime.js";
import { validateGameReadyToPlay, loadGameBasic, loadQuestions, loadAnswers } from "../../js/core/game-validate.js";
import { unlockAudio, isAudioUnlocked, playSfx } from "../../js/core/sfx.js";

import { createStore } from "./store.js";
import { createUI } from "./ui.js";
import { createDevices } from "./devices.js";
import { createPresence } from "./presence.js";
import { createDisplay } from "./display.js";
import { createRounds } from "./gameRounds.js";
import { createFinal } from "./gameFinal.js";

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

async function ensureAuthOrRedirect() {
  const user = await requireAuth("../index.html");
  const who = document.getElementById("who");
  if (who) who.textContent = user?.username || user?.email || user?.id || "—";
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

  const basic = await loadGameBasic(gameId);

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
  await ensureAuthOrRedirect();
  const game = await loadGameOrThrow();

  const qsAll = await loadQuestions(game.id);
  sessionStorage.setItem("familiada:questionsCache", JSON.stringify(qsAll));

  const ui = createUI();
  ui.setGameHeader(game.name, `${game.type} / ${game.status}`);

  
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
  // DEBUG (tymczasowo)
  window.__fam = { store };

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

  // Próba złapania cofania w przeglądarce – ustawiamy flagę, żeby nie
  // dublować ostrzeżenia (nie zawsze odpali przed beforeunload, ale pomaga).
  window.addEventListener("popstate", () => {
    suppressUnloadWarn = true;
  });
  window.addEventListener("pagehide", () => {
    suppressUnloadWarn = true;
  
    if (isEndedUiState()) {
      // bez await – przeglądarka może zabić JS w locie
      sendZeroStatesToDevices().catch(() => {});
    }
  });

  // realtime channels
  const chDisplay = rt(`familiada-display:${game.id}`);
  const chHost = rt(`familiada-host:${game.id}`);
  const chBuzzer = rt(`familiada-buzzer:${game.id}`);

  const devices = createDevices({ game, ui, store, chDisplay, chHost, chBuzzer });
  const presence = createPresence({ game, ui, store, devices });

    // ===== Wejście/wyjście z kroku "Nazwy drużyn" =====
  let wasInSetupNames = false;

  async function enterSetupNames() {
    if (!devices) return;
    await devices.sendDisplayCmd("APP GAME").catch(() => {});
    await devices.sendBuzzerCmd("ON").catch(() => {});
    await devices.sendHostCmd("COVER").catch(() => {});
    // na wejściu od razu pokaż aktualne kolory (bez spamowania: throttlowane)
    sendColorA(colors.A);
    sendColorB(colors.B);
    sendColorBg(colors.BACKGROUND);
  }

  async function leaveSetupNames() {
    if (!devices) return;
    await devices.sendDisplayCmd("APP BLACK").catch(() => {});
    await devices.sendBuzzerCmd("OFF").catch(() => {});
  }


  const display = createDisplay({ devices, store });
  const rounds = createRounds({ ui, store, devices, display, loadQuestions, loadAnswers });
  rounds.bootIfNeeded();
  const final = createFinal({ ui, store, devices, display, loadAnswers });

  // start presence (online / offline / OSTATNIO)
  presence.start();

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
      if (hasFinal) pickerCard.classList.remove("hidden");
      else pickerCard.classList.add("hidden");
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
  
    root.addEventListener("dragleave", () => {
      root.classList.remove("droptarget");
  
      // tylko jeśli to był aktualny hover
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
    // Pobierz na świeżo pytania z bazy
    const qsAll = await loadQuestions(game.id);
  
    // Zaktualizuj cache
    sessionStorage.setItem("familiada:questionsCache", JSON.stringify(qsAll));
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

  devices.initLinksAndQr();
  const initialLang = getUiLang();
  devices.updateLinksAndQr(initialLang);
  await devices.sendDisplayCmd(`LANG ${initialLang}`);
  await devices.sendHostCmd(`LANG ${initialLang}`);
  await devices.sendBuzzerCmd(`LANG ${initialLang}`);
  if (store.state.flags.qrOnDisplay) {
    await devices.sendQrLinksToDisplay();
  }
  window.addEventListener("i18n:lang", async (event) => {
    const nextLang = event?.detail?.lang;
    devices.updateLinksAndQr(nextLang);
    await devices.sendDisplayCmd(`LANG ${nextLang}`);
    await devices.sendHostCmd(`LANG ${nextLang}`);
    await devices.sendBuzzerCmd(`LANG ${nextLang}`);
    if (store.state.flags.qrOnDisplay) {
      await devices.sendQrLinksToDisplay();
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

    // krok 1: wyświetlacz -> Dalej
    ui.setEnabled("btnDevicesNext", !!flags.displayOnline);

    // krok 2: „QR na wyświetlaczu”
    
    ui.setEnabled("btnQrToggle", flags.displayOnline);
    
    // krok 2: prowadzący + przycisk online
    const hostReady = !!flags.hostOnline;
    const buzzerReady = !!flags.buzzerOnline;
    const allOnline = flags.displayOnline && hostReady && buzzerReady;
    ui.setEnabled("btnDevicesToAudio", allOnline);

    // krok 3: „Gotowe — przejdź dalej” po odblokowaniu audio
    ui.setEnabled(
      "btnDevicesFinish",
      allOnline && !!flags.audioUnlocked
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

  }

  // startowy render + subskrypcja
  renderFromState(store.state);
  store.subscribe(renderFromState);

  // === NAWIGACJA GÓRNA ===
  ui.mountNavigation({
    canEnter: (card) => store.canEnterCard(card),
    onNavigate: (card) => store.setActiveCard(card),
  });

  // === Top bar ===
  ui.on("top.back", async () => {
    if (shouldWarnBeforeUnload()) {
      const ok = confirm(APP_MSG.CONFIRM_BACK);
      if (!ok) return;
    }
  
    // jeśli wychodzimy PO zakończeniu – zerujemy urządzenia
    if (isEndedUiState()) {
      await sendZeroStatesToDevices().catch(() => {});
    }
  
    suppressUnloadWarn = true;
    location.href = "../builder.html";
  });
  
  ui.on("top.logout", async () => {
    // jeśli wychodzimy PO zakończeniu – zerujemy urządzenia
    if (isEndedUiState()) {
      await sendZeroStatesToDevices().catch(() => {});
    }
  
    await signOut().catch(() => {});
    suppressUnloadWarn = true;
    location.href = "../index.html";
  });

  ui.on("auth.showQr", (kind) => showQrModal(kind));
  ui.on("auth.qr.close", () => hideQrModal());
  ui.on("auth.qr.copy", async () => await copyQrLink());
  ui.on("auth.qr.open", () => openQrLink());

  // DEVICES kroki
  ui.on("devices.next", () => store.setDevicesStep("devices_hostbuzzer"));
  ui.on("devices.back", () => store.setDevicesStep("devices_display"));
  ui.on("devices.toAudio", () => store.setDevicesStep("devices_audio"));
  ui.on("audio.back", () => store.setDevicesStep("devices_hostbuzzer"));

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

  ui.on("qr.toggle", async () => {
    const now = store.state.flags.qrOnDisplay;

    if (!now) {
      await devices.sendQrToDisplay();
      store.setQrOnDisplay(true);
      ui.setQrToggleLabel(true, store.state.flags.hostOnline && store.state.flags.buzzerOnline);
    } else {
      await devices.sendDisplayCmd("APP BLACK");
      store.setQrOnDisplay(false);
      ui.setQrToggleLabel(false, store.state.flags.hostOnline && store.state.flags.buzzerOnline);
    }
  });

  // SETUP
  ui.on("setup.backToDevices", () => store.setActiveCard("devices"));

  ui.on("teams.change", ({ teamA, teamB }) => {
    store.setTeams(teamA, teamB);
  });

    // ===== UI: Kolory =====
  let colorModalTarget = null; // "A" | "B" | "BACKGROUND"

  ui.on("colors.open", (target) => {
    const t = target === "A" || target === "B" || target === "BACKGROUND" ? target : null;
    if (!t) return;
    colorModalTarget = t;

    const hex =
      t === "A" ? colors.A :
      t === "B" ? colors.B :
      colors.BACKGROUND;

    const rgb = hexToRgb(hex);

    ui.openColorModal?.(
      t === "A" ? t("control.teamAColorAria") :
      t === "B" ? t("control.teamBColorAria") :
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

  ui.on("setup.next", () => store.setSetupStep("setup_final"));
  ui.on("setup.back", () => store.setSetupStep("setup_names"));

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

  ui.on("setup.finish", () => {
    store.completeCard("setup");
    store.setActiveCard("rounds");
  });

    // ROUNDS
  ui.on("game.ready", async () => {
    // po "Gra gotowa" blokujemy Urządzenia i Ustawienia
    store.setGameStarted(true);
    await rounds.stateGameReady();
  });

  ui.on("game.startIntro", async () => {
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
    store.state.flags.hostOnline && store.state.flags.buzzerOnline
  );
}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("msgSide");
  if (el) el.textContent = e?.message || String(e);
});  
