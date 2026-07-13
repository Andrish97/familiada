// js/pages/game-settings.js
import { requireAuth } from "../core/auth.js?v=v2026-07-13T21453";
import { t, getUiLang } from "../../translation/translation.js?v=v2026-07-13T21453";
import { setTopbarAccount } from "../core/topbar-controller.js?v=v2026-07-13T21453";
import { sb } from "../core/supabase.js?v=v2026-07-13T21453";
import { loadQuestions } from "../core/game-validate.js?v=v2026-07-13T21453";
import { loadFont5x7, buildLogoPreviewCanvas } from "../core/logo-preview.js?v=v2026-07-13T21453";
import { v as cacheBust } from "../core/cache-bust.js?v=v2026-07-13T21453";
import { alertModal, confirmModal } from "../core/modal.js?v=v2026-07-13T21453";
import { initUiSelect } from "../core/ui-select.js?v=v2026-07-13T21453";
import {
  loadSfxManifest, getSfxCategories,
  setSfxCustomBlob, clearSfxCustomFile, clearAllSfxCustomFiles, getSfxCustomFiles,
  playSfx, setSfxVolume,
} from "../core/sfx-new.js?v=v2026-07-13T21453";
import {
  uploadGameSound, deleteGameSound, deleteAllGameSounds,
} from "../core/sfx-cloud.js?v=v2026-07-13T21453";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

// Ustaw padding-top body na dokładną wysokość topbara (fixed), żeby nie było przerwy
{
  const _tb = document.querySelector(".topbar");
  if (_tb) document.body.style.paddingTop = _tb.getBoundingClientRect().height + "px";
}

// ===== DEFAULTS =====
const DEFAULT_SETTINGS = {
  teams: { teamA: "", teamB: "" },
  display: {
    colors: { A: "#c4002f", B: "#2a62ff", BACKGROUND: "#d21180", DOT: "#d7ff3d" },
    theme: null,
    logoId: null,
  },
  game: {
    hasFinal: null,
    finalQuestionsMode: "random",
    roundsQuestionsMode: "random",
    advanced: {
      roundMultipliers: [1, 1, 1, 2, 3],
      finalMinPoints: 300,
      finalTarget: 200,
      endScreenMode: "logo",
      finalPrizeMultiplier: 3,
      mainPrizeAmount: 25000,
    },
  },
  questions: { final: [], rounds: [] },
  sound: {
    volumes: {},   // key → 0–100 (int procent)
    variants: {},  // key → nazwa pliku, np. "classic.mp3"
  },
};

function mergeSettings(saved) {
  const s = saved || {};
  const defs = DEFAULT_SETTINGS;
  const savedAdv = s.game?.advanced || {};
  const defsAdv = defs.game.advanced;
  return {
    teams: {
      teamA: s.teams?.teamA ?? defs.teams.teamA,
      teamB: s.teams?.teamB ?? defs.teams.teamB,
    },
    display: {
      colors: {
        A: s.display?.colors?.A ?? defs.display.colors.A,
        B: s.display?.colors?.B ?? defs.display.colors.B,
        BACKGROUND: s.display?.colors?.BACKGROUND ?? defs.display.colors.BACKGROUND,
        DOT: s.display?.colors?.DOT ?? defs.display.colors.DOT,
      },
      theme: s.display?.theme ?? defs.display.theme,
      logoId: s.display?.logoId ?? defs.display.logoId,
    },
    game: {
      hasFinal: s.game?.hasFinal ?? defs.game.hasFinal,
      finalQuestionsMode: s.game?.finalQuestionsMode ?? defs.game.finalQuestionsMode,
      roundsQuestionsMode: s.game?.roundsQuestionsMode ?? defs.game.roundsQuestionsMode,
      advanced: {
        roundMultipliers: Array.isArray(savedAdv.roundMultipliers) ? savedAdv.roundMultipliers : defsAdv.roundMultipliers,
        finalMinPoints: typeof savedAdv.finalMinPoints === "number" ? savedAdv.finalMinPoints : defsAdv.finalMinPoints,
        finalTarget: typeof savedAdv.finalTarget === "number" ? savedAdv.finalTarget : defsAdv.finalTarget,
        endScreenMode: savedAdv.endScreenMode || defsAdv.endScreenMode,
        finalPrizeMultiplier: typeof savedAdv.finalPrizeMultiplier === "number" ? savedAdv.finalPrizeMultiplier : defsAdv.finalPrizeMultiplier,
        mainPrizeAmount: typeof savedAdv.mainPrizeAmount === "number" ? savedAdv.mainPrizeAmount : defsAdv.mainPrizeAmount,
      },
    },
    questions: {
      final: Array.isArray(s.questions?.final) ? s.questions.final : [],
      rounds: Array.isArray(s.questions?.rounds) ? s.questions.rounds : [],
    },
    sound: {
      volumes:  (s.sound?.volumes  && typeof s.sound.volumes  === "object") ? { ...s.sound.volumes }  : {},
      variants: (s.sound?.variants && typeof s.sound.variants === "object") ? { ...s.sound.variants } : {},
    },
  };
}

// ===== STATE =====
let localSettings = mergeSettings(null);
let isDirty = false;
let activeCat = "teams";
let themeRaw = [];
let themeList = [];
let allQuestions = [];
let _logoFont = null;
let _defaultLogoPayload = null;
let _loadedLogos = [];

// Display preview iframe
let _displayIframe = null;
let _displayReady = false;

// Wykryj modal mode już na poziomie modułu (inline script w <head> dodaje klasę przed renderem)
const _isModal = document.documentElement.classList.contains("gs-modal-mode");

// Color modal state — labels populated lazily from t()
let colorModalTarget = null;
let colorModalR = 0, colorModalG = 0, colorModalB = 0;

// ===== ELEMENTS =====
const titleEl = document.getElementById("gsTitle");
const unsavedBadge = document.getElementById("gsUnsavedBadge");
const btnSaveAll = document.getElementById("btnSaveAll");
const btnResetAll = document.getElementById("btnResetAll");
const btnPlay = document.getElementById("btnPlay");
const btnBack = document.getElementById("btnBack");
const content = document.getElementById("gsContentInner");
const sidebar = document.getElementById("gsSidebar");
const sidebarFinale = document.getElementById("sidebarFinale");
const sidebarRounds = document.getElementById("sidebarRounds");

// Color modal elements
const colorModal = document.getElementById("gsColorModal");
const colorModalTitleEl = document.getElementById("gsColorModalTitle");
const colorR = document.getElementById("gsColorR");
const colorG = document.getElementById("gsColorG");
const colorB = document.getElementById("gsColorB");
const colorRVal = document.getElementById("gsColorRVal");
const colorGVal = document.getElementById("gsColorGVal");
const colorBVal = document.getElementById("gsColorBVal");
const colorHex = document.getElementById("gsColorHex");
const colorPreviewEl = document.getElementById("gsColorPreview");
const colorModalClose = document.getElementById("gsColorModalClose");
const colorModalDone = document.getElementById("gsColorModalDone");

// ===== DIRTY / SAVE =====
function markDirty() {
  isDirty = true;
  unsavedBadge?.classList.remove("hidden");
  document.getElementById("gsFooterMsg")?.classList.remove("hidden");
}

function clearDirty() {
  isDirty = false;
  unsavedBadge?.classList.add("hidden");
  document.getElementById("gsFooterMsg")?.classList.add("hidden");
}

async function saveAll() {
  // Walidacja: finale w trybie "pick" wymaga dokładnie 5 pytań
  const hasFinal = localSettings.game.hasFinal === true;
  if (hasFinal && localSettings.game.finalQuestionsMode === "pick") {
    const count = localSettings.questions.final.length;
    if (count < 5) {
      alertModal({ text: t("gameSettings.saveErrorFinalNeed5", { count }) });
      return;
    }
  }

  // Walidacja: nie można zapisać gdy wybrano "Własny" bez wgranego pliku
  {
    let cfCheck = new Map();
    try { cfCheck = await getSfxCustomFiles(gameId); } catch {}
    const missing = getSfxCategories().filter(cat =>
      localSettings.sound.variants[cat.key] === VARIANT_CUSTOM && !cfCheck.get(cat.key)
    );
    if (missing.length > 0) {
      const names = missing.map(cat => t("control.sfxDesc." + cat.key) || cat.key).join(", ");
      alertModal({ text: (t("gameSettings.saveErrorCustomNoFile") || "Wgraj plik dla: {names}").replace("{names}", names) });
      return;
    }
  }

  if (btnSaveAll) btnSaveAll.disabled = true;
  try {
    // Uzupełnij filenames w sound settings (do streszczenia w control-new)
    await _syncSoundFilenames();

    const payload = JSON.parse(JSON.stringify(localSettings));
    const { error } = await sb()
      .from("games")
      .update({ settings: payload })
      .eq("id", gameId);
    if (error) throw error;

    // Synchronizuj custom pliki audio z bucketem (po sukcesie zapisu do DB)
    await _syncSoundBucket().catch(e => {
      console.warn("[game-settings] bucket sync partial failure:", e);
    });

    clearDirty();
  } catch (e) {
    console.error("[game-settings] saveAll error:", e);
    alertModal({ text: t("gameSettings.saveErrorPrefix") + (e?.message || e?.code || String(e)) });
  } finally {
    if (btnSaveAll) btnSaveAll.disabled = false;
  }
}

async function _getSoundUserId() {
  const { data: { user } } = await sb().auth.getUser();
  return user?.id ?? null;
}

// Uzupełnia localSettings.sound.filenames na podstawie IndexedDB customFiles
async function _syncSoundFilenames() {
  let customFiles = new Map();
  try { customFiles = await getSfxCustomFiles(gameId); } catch {}
  if (!localSettings.sound.filenames) localSettings.sound.filenames = {};
  for (const cat of getSfxCategories()) {
    const key = cat.key;
    const custom = customFiles.get(key);
    if (custom?.filename) {
      localSettings.sound.filenames[key] = custom.filename;
    } else {
      delete localSettings.sound.filenames[key];
    }
  }
  // Wyczyść obiekt jeśli pusty
  if (Object.keys(localSettings.sound.filenames).length === 0) {
    delete localSettings.sound.filenames;
  }
}

// Upload custom files do bucketu, usuń te których już nie ma
async function _syncSoundBucket() {
  if (!gameId) return;
  const userId = await _getSoundUserId();
  if (!userId) return;

  let customFiles = new Map();
  try { customFiles = await getSfxCustomFiles(gameId); } catch {}

  const cats = getSfxCategories();
  await Promise.all(cats.map(async cat => {
    const key = cat.key;
    const variant = localSettings.sound.variants[key];
    const custom = customFiles.get(key);

    if (variant === "__custom__" && custom?.blob) {
      // Wgraj plik do bucketu
      await uploadGameSound(sb(), userId, gameId, key, custom.blob);
    } else if (variant !== "__custom__") {
      // Wariant z listy — usuń ewentualny stary custom z bucketu (błąd 404 ignorowany)
      await deleteGameSound(sb(), userId, gameId, key);
    }
  }));
}

// ===== SUB-TAB GRAYING =====
function updateSubTabStates() {
  const hasFinal = localSettings.game.hasFinal === true;
  const finalRandom = localSettings.game.finalQuestionsMode !== "pick";
  const roundsRandom = localSettings.game.roundsQuestionsMode !== "pick";

  if (sidebarFinale) {
    sidebarFinale.classList.toggle("gs-sidebar-item-disabled", !hasFinal || finalRandom);
  }
  if (sidebarRounds) {
    sidebarRounds.classList.toggle("gs-sidebar-item-disabled", roundsRandom);
  }
}

// ===== NAVIGATION =====
function setActiveCat(cat) {
  activeCat = cat;
  sidebar?.querySelectorAll(".gs-sidebar-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === cat);
  });
  renderCat(cat);
}

// ===== HEX / RGB UTILS =====
function normHex(s) {
  s = String(s ?? "").trim();
  if (!s.startsWith("#")) s = "#" + s;
  s = s.toUpperCase();
  return /^#[0-9A-F]{6}$/.test(s) ? s : null;
}

function hexToRgb(hex) {
  const h = normHex(hex);
  if (!h) return { r: 0, g: 0, b: 0 };
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const n = (Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0));
  return "#" + n.toString(16).padStart(6, "0").toUpperCase();
}

// ===== COLOR MODAL =====
function getColorLabels() {
  return {
    A: t("gameSettings.display.colorA"),
    B: t("gameSettings.display.colorB"),
    BACKGROUND: t("gameSettings.display.colorBgShort"),
    DOT: t("gameSettings.display.colorDot"),
  };
}

function openColorModal(key) {
  colorModalTarget = key;
  const hex = localSettings.display.colors[key] || "#000000";
  const { r, g, b } = hexToRgb(hex);
  colorModalR = r; colorModalG = g; colorModalB = b;
  if (colorModalTitleEl) colorModalTitleEl.textContent = getColorLabels()[key] || key;
  syncColorModalUI();
  colorModal?.classList.remove("hidden");
}

function syncColorModalUI() {
  if (colorR) { colorR.value = colorModalR; if (colorRVal) colorRVal.textContent = colorModalR; }
  if (colorG) { colorG.value = colorModalG; if (colorGVal) colorGVal.textContent = colorModalG; }
  if (colorB) { colorB.value = colorModalB; if (colorBVal) colorBVal.textContent = colorModalB; }
  const hex = rgbToHex(colorModalR, colorModalG, colorModalB);
  if (colorHex) colorHex.value = hex;
  if (colorPreviewEl) colorPreviewEl.style.background = hex;
  updateSliderTrack(colorR, colorModalG, colorModalB, "r");
  updateSliderTrack(colorG, colorModalR, colorModalB, "g");
  updateSliderTrack(colorB, colorModalR, colorModalG, "b");
}

function updateSliderTrack(el, v1, v2, ch) {
  if (!el) return;
  const from = ch === "r" ? `rgb(0,${v1},${v2})` : ch === "g" ? `rgb(${v1},0,${v2})` : `rgb(${v1},${v2},0)`;
  const to   = ch === "r" ? `rgb(255,${v1},${v2})` : ch === "g" ? `rgb(${v1},255,${v2})` : `rgb(${v1},${v2},255)`;
  el.style.setProperty("--track", `linear-gradient(to right, ${from}, ${to})`);
}

function applyColorModal() {
  const hex = rgbToHex(colorModalR, colorModalG, colorModalB);
  if (!colorModalTarget) return;
  localSettings.display.colors[colorModalTarget] = hex;
  markDirty();
  content?.querySelectorAll(`[data-color-key="${colorModalTarget}"]`).forEach(el => {
    el.style.background = hex;
  });
  sendDisplayCmd(`COLOR ${colorModalTarget} ${hex}`);
  colorModal?.classList.add("hidden");
}

function initColorModal() {
  colorR?.addEventListener("input", () => {
    colorModalR = parseInt(colorR.value, 10);
    syncColorModalUI();
  });
  colorG?.addEventListener("input", () => {
    colorModalG = parseInt(colorG.value, 10);
    syncColorModalUI();
  });
  colorB?.addEventListener("input", () => {
    colorModalB = parseInt(colorB.value, 10);
    syncColorModalUI();
  });
  colorHex?.addEventListener("change", () => {
    const h = normHex(colorHex.value);
    if (!h) return;
    const { r, g, b } = hexToRgb(h);
    colorModalR = r; colorModalG = g; colorModalB = b;
    syncColorModalUI();
  });
  colorModalClose?.addEventListener("click", () => colorModal?.classList.add("hidden"));
  colorModalDone?.addEventListener("click", applyColorModal);
  colorModal?.addEventListener("click", e => {
    if (e.target === colorModal) colorModal.classList.add("hidden");
  });
}

// ===== STRING HELPERS =====
function escAttr(s) {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escText(s) {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function parkDisplayIframe() {
  const holder = document.getElementById("gsDisplayIframeHolder");
  if (holder) holder.style.display = "none";
}

function showDisplayIframe() {
  const holder = document.getElementById("gsDisplayIframeHolder");
  if (holder) holder.style.display = "";
}

// ===== RENDER CATEGORIES =====
function renderCat(cat) {
  if (!content) return;
  // Zawsze zatrzymaj podgląd przed innerHTML (iframe nie rusza się w DOM)
  stopDisplayPreview();
  switch (cat) {
    case "teams":     renderTeams();     break;
    case "display":   renderDisplay();   break;
    case "sound":     renderSound().catch(console.error);     break;
    case "questions": renderQuestions(); break;
    case "finale":    renderFinale();    break;
    case "rounds":    renderRounds();    break;
    case "game":      renderGame();      break;
  }
}

// --- DRUŻYNY ---
function renderTeams() {
  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.teams")}</div>
    <div class="gs-section">
      <div class="gs-field">
        <div class="gs-label">${t("gameSettings.teams.nameA")}</div>
        <input class="inp" id="gsTeamA" value="${escAttr(localSettings.teams.teamA)}" maxlength="40" placeholder="${escAttr(t("gameSettings.teams.placeholderA"))}"/>
      </div>
      <div class="gs-field">
        <div class="gs-label">${t("gameSettings.teams.nameB")}</div>
        <input class="inp" id="gsTeamB" value="${escAttr(localSettings.teams.teamB)}" maxlength="40" placeholder="${escAttr(t("gameSettings.teams.placeholderB"))}"/>
      </div>
      <div class="gs-hint" style="margin-top:10px">${t("gameSettings.teams.defaultHint").replace("{a}", t("gameSettings.teams.defaultA")).replace("{b}", t("gameSettings.teams.defaultB"))}</div>
    </div>
  `;

  document.getElementById("gsTeamA")?.addEventListener("input", e => {
    localSettings.teams.teamA = e.target.value;
    markDirty();
    const q = (s) => `"${String(s ?? "").replace(/"/g, "'")}"`;
    sendDisplayCmd(`LONG1 ${q(e.target.value || t("gameSettings.teams.defaultA"))}`);
  });
  document.getElementById("gsTeamB")?.addEventListener("input", e => {
    localSettings.teams.teamB = e.target.value;
    markDirty();
    const q = (s) => `"${String(s ?? "").replace(/"/g, "'")}"`;
    sendDisplayCmd(`LONG2 ${q(e.target.value || t("gameSettings.teams.defaultB"))}`);
  });
}

// --- WYGLĄD ---
function sendDisplayCmd(cmd) {
  try {
    if (_isModal) {
      window.parent.postMessage({ type: "gs:displayCmd", cmd }, "*");
      return;
    }
    if (_displayIframe?.contentWindow?.handleCommand) {
      _displayIframe.contentWindow.handleCommand(cmd);
    }
  } catch {}
}

function logoToBase64(data) {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

function previewLogo(id) {
  if (_isModal) {
    try {
      if (id === null) {
        sendDisplayCmd(`LOGO JSON ${logoToBase64(null)}`);
      } else {
        const logo = _loadedLogos.find(l => l.id === id);
        if (!logo) return;
        sendDisplayCmd(`LOGO JSON ${logoToBase64({ type: logo.type, payload: logo.payload })}`);
      }
    } catch {}
    return;
  }
  try {
    const logoApi = _displayIframe?.contentWindow?.scene?.api?.logo;
    if (!logoApi) return;
    if (!logoApi._origGetSource) logoApi._origGetSource = logoApi._getSource;
    if (id === null) {
      logoApi._getSource = logoApi._origGetSource;
    } else {
      const logo = _loadedLogos.find(l => l.id === id);
      if (!logo) return;
      logoApi._getSource = () => ({ type: logo.type, payload: logo.payload });
    }
    logoApi.draw();
  } catch {}
}

function sendDisplayInitCmds() {
  const c = localSettings.display.colors;
  const q = (s) => `"${String(s ?? "").replace(/"/g, "'")}"`;
  const teamA = localSettings.teams.teamA || t("gameSettings.teams.defaultA");
  const teamB = localSettings.teams.teamB || t("gameSettings.teams.defaultB");
  sendDisplayCmd("APP GAME");
  sendDisplayCmd(`COLOR A ${c.A}`);
  sendDisplayCmd(`COLOR B ${c.B}`);
  sendDisplayCmd(`COLOR BACKGROUND ${c.BACKGROUND}`);
  sendDisplayCmd(`COLOR DOT ${c.DOT}`);
  const theme = localSettings.display.theme || (themeList[0]?.key ?? "");
  if (theme) sendDisplayCmd(`THEME ${theme}`);
  if (_isModal) {
    sendDisplayCmd("LOGO RELOAD");
  } else if (localSettings.display.logoId === null || _loadedLogos.length > 0) {
    // logos already loaded (or default selected) — preview correctly
    previewLogo(localSettings.display.logoId);
  } else {
    // logos not yet loaded — draw default for now; renderLogoGrid will call previewLogo after load
    sendDisplayCmd("LOGO DRAW");
  }
  sendDisplayCmd("LEFT 123");
  sendDisplayCmd("RIGHT 123");
  sendDisplayCmd("TOP 1");
  sendDisplayCmd(`LONG1 ${q(teamA)}`);
  sendDisplayCmd(`LONG2 ${q(teamB)}`);
  sendDisplayCmd("INDICATOR OFF");
}

function createDisplayIframe() {
  if (_displayIframe) return;
  const holder = document.getElementById("gsDisplayIframeHolder");
  if (!holder) return;

  _displayIframe = document.createElement("iframe");
  _displayIframe.id = "gsDisplayPreview";
  _displayIframe.src = "/display";
  _displayIframe.style.cssText = "width:100%;height:100%;border:none;display:block";
  _displayIframe.title = "Display preview";
  _displayReady = false;

  // Chrome odpala load najpierw dla about:blank, a potem dla /display.
  // NIE używamy { once:true } — pomijamy blank, startujemy poll dopiero przy prawdziwym /display.
  let _pollInterval = null;
  _displayIframe.addEventListener("load", () => {
    // Pomiń load z about:blank (przed właściwym /display)
    try {
      const loc = _displayIframe.contentWindow?.location?.href ?? "";
      if (!loc || loc === "about:blank") return;
    } catch { return; }

    if (_pollInterval) clearInterval(_pollInterval);
    let attempts = 0;
    _pollInterval = setInterval(() => {
      attempts++;
      try {
        if (_displayIframe?.contentWindow?.handleCommand) {
          clearInterval(_pollInterval);
          _pollInterval = null;
          _displayReady = true;
          if (activeCat === "display") {
            sendDisplayInitCmds();
          }
        } else if (attempts >= 50) {
          clearInterval(_pollInterval);
          _pollInterval = null;
        }
      } catch {
        clearInterval(_pollInterval);
        _pollInterval = null;
      }
    }, 100);
  });

  holder.appendChild(_displayIframe);
}

function stopDisplayPreview() {
  parkDisplayIframe();
}

function renderDisplay() {
  const c = localSettings.display.colors;
  const colorLabels = getColorLabels();
  const swatches = ["A", "B", "BACKGROUND", "DOT"].map(key => `
    <div class="colorItem">
      <div class="lbl2">${escText(colorLabels[key])}</div>
      <button class="swatchBtn" data-color-key="${key}" style="background:${c[key]}" title="${key}" type="button"></button>
    </div>
  `).join("");

  const effectiveTheme = localSettings.display.theme || (themeList[0]?.key ?? "");

  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.display")}</div>
    <div class="gs-section">
      <div class="gs-label">${t("gameSettings.display.colors")}</div>
      <div class="colorRow">${swatches}</div>
    </div>
    <div class="gs-section">
      <div class="gs-label">${t("gameSettings.display.theme")}</div>
      <div class="ui-select" id="gsThemeSelect" style="margin-top:8px;width:100%">
        <button class="btn inp ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="ui-select-label">—</span>
          <span class="ui-select-caret" aria-hidden="true">▾</span>
        </button>
        <div class="ui-select-menu" role="listbox"></div>
      </div>
    </div>
    <div class="gs-section">
      <div class="gs-label">${t("gameSettings.display.logo")}</div>
      <div id="gsLogoGrid" class="gs-logo-grid"></div>
    </div>
    <div class="sfx-foot">
      <button class="btn" id="btnDisplayReset" type="button">${t("gameSettings.resetSection") || "Przywróć domyślne"}</button>
    </div>
  `;

  content.querySelectorAll(".swatchBtn").forEach(btn => {
    btn.addEventListener("click", () => openColorModal(btn.dataset.colorKey));
  });

  initUiSelect(document.getElementById("gsThemeSelect"), {
    options: themeList.map(th => ({ value: th.key, label: th.label })),
    value: effectiveTheme,
    onChange: (val) => {
      localSettings.display.theme = val || null;
      markDirty();
      const key = val || (themeList[0]?.key ?? "");
      if (key) sendDisplayCmd(`THEME ${key}`);
    },
  });

  document.getElementById("btnDisplayReset")?.addEventListener("click", async () => {
    if (!await confirmModal({ text: t("gameSettings.resetSectionConfirm") || "Przywrócić domyślne ustawienia wyglądu?" })) return;
    localSettings.display = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.display));
    markDirty();
    renderDisplay();
  });

  // Iframe jest zawsze w gsDisplayIframeHolder (sibling gsContentInner) — tylko show/hide
  showDisplayIframe();
  if (_displayReady) sendDisplayInitCmds();
  renderLogoGrid();
}

async function renderLogoGrid() {
  const grid = document.getElementById("gsLogoGrid");
  if (!grid) return;

  grid.innerHTML = `<div class="hint" style="padding:8px 0">${t("gameSettings.display.logoLoading")}</div>`;

  if (!_logoFont) {
    try { _logoFont = await loadFont5x7(); } catch {}
  }
  if (!_defaultLogoPayload) {
    try {
      const r = await fetch(await cacheBust("/display/logo_familiada.json"), { cache: "force-cache" });
      if (r.ok) _defaultLogoPayload = await r.json();
    } catch {}
  }

  try {
    const { data, error } = await sb()
      .from("user_logos")
      .select("id,name,type,payload")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    _loadedLogos = data || [];
    // After loading: update preview iframe with the selected logo
    if (_displayReady && !_isModal) previewLogo(localSettings.display.logoId);
  } catch (e) {
    if (document.getElementById("gsLogoGrid")) {
      grid.innerHTML = `<div class="hint">${escText(e?.message || String(e))}</div>`;
    }
    return;
  }

  // Check tab still active
  if (!document.getElementById("gsLogoGrid")) return;

  grid.innerHTML = "";
  const selectedId = localSettings.display.logoId;

  grid.appendChild(makeLogoTile(null, selectedId));
  for (const logo of _loadedLogos) {
    grid.appendChild(makeLogoTile(logo.id, selectedId));
  }

  grid.querySelectorAll(".gs-logo-tile").forEach(tile => {
    tile.addEventListener("click", () => {
      const rawId = tile.dataset.logoId;
      const id = rawId === "default" ? null : rawId;
      localSettings.display.logoId = id;
      markDirty();
      grid.querySelectorAll(".gs-logo-tile").forEach(t => t.classList.remove("selected"));
      tile.classList.add("selected");
      previewLogo(id);
    });
  });
}

function makeLogoTile(id, selectedId) {
  const key = id ?? "default";
  const name = id === null ? t("gameSettings.display.logoDefault") : (_loadedLogos.find(l => l.id === id)?.name || "—");
  const logoObj = id === null
    ? (_defaultLogoPayload ? { type: "GLYPH_30x10", payload: _defaultLogoPayload } : null)
    : _loadedLogos.find(l => l.id === id) || null;
  const sel = (id === null && selectedId === null) || (id !== null && id === selectedId);

  const el = document.createElement("div");
  el.className = "gs-logo-tile" + (sel ? " selected" : "");
  el.dataset.logoId = String(key);

  const prev = document.createElement("div");
  prev.className = "gs-logo-prev";
  const canvas = buildLogoPreviewCanvas(logoObj, _logoFont, 180, 84);
  prev.appendChild(canvas);
  el.appendChild(prev);

  const label = document.createElement("div");
  label.className = "gs-logo-name";
  label.textContent = name;
  el.appendChild(label);

  return el;
}

// --- DŹWIĘK ---
const VARIANT_CUSTOM = "__custom__";

async function renderSound() {
  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.sound")}</div>
    <div class="gs-section">
      <div class="sfx-table" id="sfxTableGs"></div>
    </div>
    <div class="sfx-foot">
      <button class="btn" id="btnSoundReset" type="button">${t("control.sfxResetAll") || "Przywróć domyślne"}</button>
    </div>
  `;

  try { await loadSfxManifest(); } catch (e) {
    const tbl = document.getElementById("sfxTableGs");
    if (tbl) tbl.innerHTML = `<div class="gs-hint" style="color:red">Błąd ładowania dźwięków: ${escText(e?.message || String(e))}</div>`;
    return;
  }

  const categories = getSfxCategories();
  const lang = getUiLang() || "pl";

  let customFiles = new Map();
  try { customFiles = await getSfxCustomFiles(gameId); } catch {}

  const tableEl = document.getElementById("sfxTableGs");
  if (!tableEl) return;

  const variantInsts = new Map(); // key → ui-select instance

  for (const cat of categories) {
    const key = cat.key;
    const volPct = localSettings.sound.volumes[key] ?? 100;
    const custom = customFiles.get(key);
    // Aktywny wariant: "__custom__" jeśli mamy własny plik, inaczej zapisany lub domyślny
    const activeVariant = custom ? VARIANT_CUSTOM
      : (localSettings.sound.variants[key] || (cat.sounds[0]?.file || "classic.mp3").split("?")[0]);
    const desc = t("control.sfxDesc." + key) || key;

    const row = document.createElement("div");
    row.className = "sfx-row";
    row.dataset.key = key;

    // Opcje dla ui-select: warianty twórcy + "Własny" na końcu
    const variantOptions = cat.sounds.map(s => {
      const file = s.file.split("?")[0];
      const label = s.label?.[lang] || s.file;
      return { value: file, label };
    });
    variantOptions.push({ value: VARIANT_CUSTOM, label: t("control.sfxCustom") || "Własny" });

    // Tag z własnym plikiem (widoczny tylko gdy custom)
    const fileTagHtml = custom
      ? `<div class="sfx-file-tag">
           <span class="sfx-file-name" title="${escAttr(custom.filename)}">${escText(custom.filename)}</span>
           <button class="sfx-file-remove" type="button" data-sfx-clear="${escAttr(key)}" title="Usuń">✕</button>
         </div>`
      : "";

    // Przycisk "Wybierz plik" — widoczny tylko gdy wybrany "Własny" i nie ma jeszcze pliku
    const showUploadBtn = !custom && activeVariant === VARIANT_CUSTOM;
    const uploadBtnHtml = `<button class="btn sfx-add-btn" type="button" data-sfx-file="${escAttr(key)}"${showUploadBtn ? "" : " hidden"}>${t("control.sfxChooseFile") || "Wybierz plik"}</button>`;

    // Przycisk odtwarzania — zablokowany gdy Własny bez pliku
    const previewDisabled = activeVariant === VARIANT_CUSTOM && !custom;

    row.innerHTML = `
      <div class="sfx-row-desc">${escText(desc)}</div>
      <div class="ui-select sfx-variant-select" data-sfx-variant="${escAttr(key)}" style="min-width:0">
        <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="ui-select-label">—</span>
          <span class="ui-select-caret" aria-hidden="true">▾</span>
        </button>
        <div class="ui-select-menu" role="listbox"></div>
      </div>
      <button class="sfx-preview-btn" type="button" data-sfx-preview="${escAttr(key)}" title="Podgląd"${previewDisabled ? " disabled" : ""}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg></button>
      <div class="sfx-vol-wrap">
        <input class="sfx-vol" type="range" min="0" max="100" step="1" value="${volPct}" data-sfx-vol="${escAttr(key)}"/>
        <span class="sfx-vol-label" id="sfxVol_${escAttr(key)}">${volPct}%</span>
      </div>
      <div class="sfx-file-wrap">
        ${fileTagHtml}${uploadBtnHtml}
        <input class="sfx-file-input" type="file" accept="audio/mpeg,audio/wav,audio/ogg" data-sfx-key="${escAttr(key)}"/>
      </div>
    `;

    // Inicjalizacja ui-select dla tego wiersza
    const variantRoot = row.querySelector(".sfx-variant-select");
    const variantInst = initUiSelect(variantRoot, {
      options: variantOptions,
      value: activeVariant,
      onChange: (val) => {
        const uploadBtn = row.querySelector("[data-sfx-file]");
        const previewBtn = row.querySelector("[data-sfx-preview]");
        if (val === VARIANT_CUSTOM) {
          const hasCustom = !!customFiles.get(key);
          if (uploadBtn) uploadBtn.hidden = hasCustom;
          if (previewBtn) previewBtn.disabled = !hasCustom;
          const fileTag = row.querySelector(".sfx-file-tag");
          if (fileTag) fileTag.hidden = !hasCustom;
          localSettings.sound.variants[key] = VARIANT_CUSTOM;
          markDirty();
        } else {
          if (uploadBtn) uploadBtn.hidden = true;
          if (previewBtn) previewBtn.disabled = false;
          const fileTag = row.querySelector(".sfx-file-tag");
          if (fileTag) fileTag.hidden = true;
          localSettings.sound.variants[key] = val;
          markDirty();
        }
      },
    });
    variantInsts.set(key, variantInst);

    tableEl.appendChild(row);
  }

  // Podgląd — play/stop toggle
  let _previewAudio = null;
  let _previewBtn   = null;
  let _previewUrl   = null; // blob URL do zwolnienia

  function _stopPreview() {
    if (_previewAudio) { try { _previewAudio.pause(); _previewAudio.currentTime = 0; } catch {} }
    if (_previewUrl)   { URL.revokeObjectURL(_previewUrl); _previewUrl = null; }
    if (_previewBtn)   { _previewBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>'; delete _previewBtn.dataset.playing; }
    _previewAudio = null;
    _previewBtn   = null;
  }

  tableEl.querySelectorAll("[data-sfx-preview]").forEach(btn => {
    btn.addEventListener("click", () => {
      // Stop jeśli to ten sam przycisk
      if (_previewBtn === btn) { _stopPreview(); return; }
      _stopPreview();

      const key = btn.dataset.sfxPreview;
      const val = variantInsts.get(key)?.getValue() ?? VARIANT_CUSTOM;
      const vol = (localSettings.sound.volumes[key] ?? 100) / 100;

      let audio, blobUrl = null;
      if (val === VARIANT_CUSTOM) {
        const custom = customFiles.get(key);
        if (!custom?.blob) return;
        blobUrl = URL.createObjectURL(custom.blob);
        audio = new Audio(blobUrl);
      } else {
        const cat = categories.find(c => c.key === key);
        if (!cat) return;
        audio = new Audio(`/audio_new/${cat.folder}/${val}`);
      }
      audio.volume = vol;
      audio.play().catch(() => {});
      audio.addEventListener("ended", _stopPreview, { once: true });

      _previewAudio = audio;
      _previewBtn   = btn;
      _previewUrl   = blobUrl;
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="1.5" width="9" height="9" fill="currentColor"/></svg>';
      btn.dataset.playing = "1";
    });
  });

  // Zmiana głośności podczas odtwarzania podglądu
  tableEl.querySelectorAll(".sfx-vol").forEach(slider => {
    slider.addEventListener("input", () => {
      const key = slider.dataset.sfxVol;
      if (_previewBtn?.dataset.sfxPreview === key && _previewAudio) {
        _previewAudio.volume = parseInt(slider.value, 10) / 100;
      }
    });
  }, true); // capture=true żeby odpalić przed istniejącym listenerem

  // Głośność
  tableEl.querySelectorAll(".sfx-vol").forEach(slider => {
    slider.addEventListener("input", () => {
      const key = slider.dataset.sfxVol;
      const pct = parseInt(slider.value, 10);
      localSettings.sound.volumes[key] = pct;
      const lbl = document.getElementById(`sfxVol_${key}`);
      if (lbl) lbl.textContent = `${pct}%`;
      setSfxVolume(key, pct / 100);
      markDirty();
    });
  });

  // Trigger input pliku
  tableEl.querySelectorAll("[data-sfx-file]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sfxFile;
      tableEl.querySelector(`input[data-sfx-key="${key}"]`)?.click();
    });
  });

  // Upload własnego pliku
  tableEl.querySelectorAll(".sfx-file-input").forEach(input => {
    input.addEventListener("change", async () => {
      const key = input.dataset.sfxKey;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;

      const cat = categories.find(c => c.key === key);
      const limitSec = cat?.limitSec || 30;

      try {
        const buf = await file.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(buf);
        await ctx.close();
        if (decoded.duration > limitSec) {
          alertModal({ text: (t("control.sfxTooLong") || "Maksymalna długość to {limit}s").replace("{limit}", limitSec) });
          return;
        }
      } catch { /* nie blokuj jeśli AudioContext niedostępny */ }

      try {
        await setSfxCustomBlob(key, file, file.name, gameId);
        customFiles.set(key, { blob: file, filename: file.name });
        localSettings.sound.variants[key] = VARIANT_CUSTOM;
        markDirty();
        // Odblokuj podgląd po wgraniu pliku
        const row = input.closest(".sfx-row");
        const previewBtn = row?.querySelector("[data-sfx-preview]");
        if (previewBtn) previewBtn.disabled = false;
        renderSound();
      } catch (e) {
        alertModal({ text: `Błąd: ${e?.message || String(e)}` });
      }
    });
  });

  // Usuń własny plik → pokaż "Wybierz plik", usuń tag, usuń z bucketu
  tableEl.querySelectorAll("[data-sfx-clear]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.sfxClear;
      // IndexedDB
      try { await clearSfxCustomFile(key, gameId); } catch {}
      // Bucket (fire-and-forget, błąd nie blokuje UI)
      _getSoundUserId().then(userId => {
        if (userId) deleteGameSound(sb(), userId, gameId, key).catch(console.warn);
      });
      customFiles.delete(key);
      delete localSettings.sound.variants[key];
      markDirty();

      const row = btn.closest(".sfx-row");
      if (!row) return;
      // Usuń tag z nazwą pliku
      btn.closest(".sfx-file-tag")?.remove();
      // Pokaż "Wybierz plik" i zablokuj podgląd (Własny nadal wybrany, brak pliku)
      const uploadBtn = row.querySelector("[data-sfx-file]");
      if (uploadBtn) uploadBtn.hidden = false;
      const previewBtn = row.querySelector("[data-sfx-preview]");
      if (previewBtn) previewBtn.disabled = true;
    });
  });

  // Reset wszystkich dźwięków
  document.getElementById("btnSoundReset")?.addEventListener("click", async () => {
    if (!await confirmModal({ text: t("gameSettings.sound.resetConfirm") || "Przywrócić domyślne ustawienia dźwięku?" })) return;

    const customKeys = [...customFiles.keys()];
    localSettings.sound = { volumes: {}, variants: {} };

    // IndexedDB
    try { await clearAllSfxCustomFiles(gameId); } catch {}

    // Bucket (fire-and-forget)
    if (customKeys.length > 0) {
      _getSoundUserId().then(userId => {
        if (userId) deleteAllGameSounds(sb(), userId, gameId, customKeys).catch(console.warn);
      });
    }

    markDirty();
    renderSound();
  });
}

// --- PYTANIA — USTAWIENIA ---
function renderQuestions() {
  const g = localSettings.game;
  const hasFinal = g.hasFinal === true;
  const finalRandom = g.finalQuestionsMode !== "pick";
  const roundsRandom = g.roundsQuestionsMode !== "pick";

  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.questions")}</div>
    <div class="gs-section">
      <div class="sectionBlock">
        <div class="sectionTitle">${t("gameSettings.questions.finaleSection")}</div>
        <div class="setting-item">
          <div class="lbl2">${t("gameSettings.finale.hasFinal")}</div>
          <div class="toggle-group" style="margin-top:8px">
            <label class="toggle-item">
              <input type="radio" name="gsHasFinal" value="yes" ${hasFinal ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${escAttr(t("gameSettings.finale.yes"))}"></span>
            </label>
            <label class="toggle-item">
              <input type="radio" name="gsHasFinal" value="no" ${!hasFinal ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${escAttr(t("gameSettings.finale.no"))}"></span>
            </label>
          </div>
        </div>
        <div class="setting-item" id="gsFinalModeField" style="display:${hasFinal ? "block" : "none"}">
          <div class="lbl2">${t("gameSettings.questions.finalModeLabel")}</div>
          <div class="toggle-group" style="margin-top:8px">
            <label class="toggle-item">
              <input type="radio" name="gsFinalMode" value="random" ${finalRandom ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${escAttr(t("gameSettings.questions.modeRandom"))}"></span>
            </label>
            <label class="toggle-item">
              <input type="radio" name="gsFinalMode" value="pick" ${!finalRandom ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${escAttr(t("gameSettings.questions.modeManual"))}"></span>
            </label>
          </div>
          <div class="gs-hint">${t("gameSettings.questions.finalModeHint")}</div>
        </div>
      </div>
      <div class="sectionBlock">
        <div class="sectionTitle">${t("gameSettings.questions.roundsSection")}</div>
        <div class="setting-item">
          <div class="lbl2">${t("gameSettings.questions.roundsModeLabel")}</div>
          <div class="toggle-group" style="margin-top:8px">
            <label class="toggle-item">
              <input type="radio" name="gsRoundsMode" value="random" ${roundsRandom ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${escAttr(t("gameSettings.questions.modeRandom"))}"></span>
            </label>
            <label class="toggle-item">
              <input type="radio" name="gsRoundsMode" value="pick" ${!roundsRandom ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${escAttr(t("gameSettings.questions.modeOrdered"))}"></span>
            </label>
          </div>
          <div class="gs-hint">${t("gameSettings.questions.roundsModeHint")}</div>
        </div>
      </div>
    </div>
  `;

  content.querySelectorAll("[name='gsHasFinal']").forEach(radio => {
    radio.addEventListener("change", () => {
      localSettings.game.hasFinal = radio.value === "yes";
      markDirty();
      updateSubTabStates();
      const field = document.getElementById("gsFinalModeField");
      if (field) field.style.display = localSettings.game.hasFinal ? "block" : "none";
    });
  });

  content.querySelectorAll("[name='gsFinalMode']").forEach(radio => {
    radio.addEventListener("change", () => {
      localSettings.game.finalQuestionsMode = radio.value;
      markDirty();
      updateSubTabStates();
    });
  });

  content.querySelectorAll("[name='gsRoundsMode']").forEach(radio => {
    radio.addEventListener("change", () => {
      localSettings.game.roundsQuestionsMode = radio.value;
      markDirty();
      updateSubTabStates();
    });
  });
}

// --- PYTANIA — FINAŁ ---
function renderFinale() {
  const picked = localSettings.questions.final;
  const pickedIds = new Set(picked.map(q => q.id));
  const pool = allQuestions.filter(q => !pickedIds.has(q.id));

  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.finale")}</div>
    <div class="gs-section">
      <div class="gs-hint" style="margin-bottom:12px">${t("gameSettings.finale.dragHint")}</div>
      <div class="gs-badge-row">
        <span class="badge">${t("control.finalBadge")} <b>${picked.length}</b>/5</span>
      </div>
      <div class="finalLists">
        <div class="finalCol">
          <div class="mini"><div class="hint">${t("control.finalPoolHint")}</div></div>
          <div class="qList" id="gsFinalePool">
            ${pool.length === 0
              ? `<div class="gs-picker-empty">${t("control.finalPoolEmpty") || "Brak dostępnych pytań"}</div>`
              : pool.map(q => `<div class="qRow" data-qid="${escAttr(q.id)}" draggable="true">
                  <div class="meta">${q.ord}</div>
                  <div class="txt">${escText(q.text)}</div>
                </div>`).join("")}
          </div>
        </div>
        <div class="finalCol">
          <div class="mini"><div class="hint">${t("control.finalListHint")}</div></div>
          <div class="qList" id="gsGsFinalePicked">
            ${picked.length === 0
              ? `<div class="gs-picker-empty">${t("control.finalPickEmpty") || "Kliknij pytanie, aby dodać (max 5)"}</div>`
              : picked.map(q => `<div class="qRow gs-draggable" draggable="true" data-qid="${escAttr(q.id)}">
                  <div class="meta">${q.ord}</div>
                  <div class="txt">${escText(q.text)}</div>
                </div>`).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  const poolEl = document.getElementById("gsFinalePool");
  const pickedEl = document.getElementById("gsGsFinalePicked");

  // Klik w puli → dodaj do finału
  poolEl?.addEventListener("click", e => {
    const row = e.target.closest(".qRow");
    if (!row) return;
    if (localSettings.questions.final.length >= 5) return;
    const id = row.dataset.qid;
    const q = allQuestions.find(q => q.id === id);
    if (!q || localSettings.questions.final.some(p => p.id === id)) return;
    localSettings.questions.final = [...localSettings.questions.final, q];
    // Usuń z listy rund (żeby nie było duplikatu)
    localSettings.questions.rounds = localSettings.questions.rounds.filter(r => r.id !== id);
    markDirty();
    renderFinale();
  });

  // Klik w finałowej → usuń
  pickedEl?.addEventListener("click", e => {
    const row = e.target.closest(".qRow");
    if (!row) return;
    const id = row.dataset.qid;
    if (!id) return;
    const q = allQuestions.find(q => q.id === id);
    localSettings.questions.final = localSettings.questions.final.filter(p => p.id !== id);
    // Przywróć do rund (na końcu) jeśli jeszcze nie ma
    if (q && !localSettings.questions.rounds.some(r => r.id === id)) {
      localSettings.questions.rounds = [...localSettings.questions.rounds, q];
    }
    markDirty();
    renderFinale();
  });

  // Drag: przenoszenie między kolumnami
  setupFinaleColumnDnd(poolEl, pickedEl);

  // Drag: sortowanie wewnątrz finałowej listy
  if (pickedEl) {
    initDragSort(pickedEl, () => localSettings.questions.final, v => { localSettings.questions.final = v; }, renderFinale);
  }
}

function setupFinaleColumnDnd(poolEl, pickedEl) {
  if (!poolEl || !pickedEl) return;
  let dragId = null;
  let dragSide = null; // "pool" | "picked"

  function onDragStart(side, e) {
    const row = e.target.closest(".qRow");
    if (!row) return;
    dragId = row.dataset.qid;
    dragSide = side;
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(targetSide, e) {
    if (!dragId) return;
    if (dragSide === targetSide) return; // nie przenosimy w obrębie tej samej kolumny tu (initDragSort to obsługuje)
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    (targetSide === "pool" ? poolEl : pickedEl).classList.add("droptarget");
  }

  function onDragLeave(targetSide) {
    (targetSide === "pool" ? poolEl : pickedEl).classList.remove("droptarget");
  }

  function onDrop(targetSide, e) {
    e.preventDefault();
    poolEl.classList.remove("droptarget");
    pickedEl.classList.remove("droptarget");
    if (!dragId || dragSide === targetSide) return;
    if (targetSide === "picked") {
      if (localSettings.questions.final.length >= 5) return;
      const q = allQuestions.find(q => q.id === dragId);
      if (!q || localSettings.questions.final.some(p => p.id === dragId)) return;
      localSettings.questions.final = [...localSettings.questions.final, q];
      localSettings.questions.rounds = localSettings.questions.rounds.filter(r => r.id !== dragId);
    } else {
      const q = allQuestions.find(q => q.id === dragId);
      localSettings.questions.final = localSettings.questions.final.filter(p => p.id !== dragId);
      if (q && !localSettings.questions.rounds.some(r => r.id === dragId)) {
        localSettings.questions.rounds = [...localSettings.questions.rounds, q];
      }
    }
    dragId = null; dragSide = null;
    markDirty();
    renderFinale();
  }

  poolEl.addEventListener("dragstart", e => onDragStart("pool", e));
  pickedEl.addEventListener("dragstart", e => onDragStart("picked", e));
  poolEl.addEventListener("dragover", e => onDragOver("pool", e));
  pickedEl.addEventListener("dragover", e => onDragOver("picked", e));
  poolEl.addEventListener("dragleave", () => onDragLeave("pool"));
  pickedEl.addEventListener("dragleave", () => onDragLeave("picked"));
  poolEl.addEventListener("drop", e => onDrop("pool", e));
  pickedEl.addEventListener("drop", e => onDrop("picked", e));
}

// --- PYTANIA — RUNDY ---
function renderRounds() {
  // Pytania w finale ZAWSZE wykluczone z rund (bez względu na tryb)
  const finaleIds = new Set(localSettings.questions.final.map(q => q.id));

  // Zbuduj pełną listę: najpierw zapisana kolejność (bez finalowych), potem brakujące
  const pickedIds = new Set(localSettings.questions.rounds.map(q => q.id));
  const missing = allQuestions.filter(q => !pickedIds.has(q.id) && !finaleIds.has(q.id));
  if (missing.length > 0) {
    // Uzupełnij bez markDirty — to inicjalizacja domyślna
    localSettings.questions.rounds = [...localSettings.questions.rounds, ...missing];
  }
  // Przefiltruj rounds — usuń pytania które są teraz w finale
  const questions = localSettings.questions.rounds.filter(q => !finaleIds.has(q.id));

  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.rounds")}</div>
    <div class="gs-section">
      <div class="gs-hint" style="margin-bottom:12px">${t("gameSettings.rounds.hint")}</div>
      <div class="roundsOrderList" id="gsRoundsOrderList">
        ${questions.map((q, i) => `
          <div class="roundsOrderItem" draggable="true" data-qid="${escAttr(q.id)}">
            <div class="roundsOrderHandle">⋮⋮</div>
            <div class="roundsOrderNum">${i + 1}</div>
            <div class="roundsOrderText">${escText(q.text)}</div>
            <div class="roundsOrderActions">
              <button class="roundsOrderBtn" data-dir="up" title="${escAttr(t("gameSettings.rounds.up"))}" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="roundsOrderBtn" data-dir="down" title="${escAttr(t("gameSettings.rounds.down"))}" ${i === questions.length - 1 ? "disabled" : ""}>↓</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  const listEl = document.getElementById("gsRoundsOrderList");
  if (!listEl) return;

  // Przyciski ↑↓ — operujemy na przefiltrowanej liście (bez finałowych)
  listEl.addEventListener("click", e => {
    const btn = e.target.closest(".roundsOrderBtn");
    if (!btn) return;
    const item = btn.closest(".roundsOrderItem");
    if (!item) return;
    const id = item.dataset.qid;
    const dir = btn.dataset.dir;
    const finaleSet = new Set(localSettings.questions.final.map(q => q.id));
    const arr = localSettings.questions.rounds.filter(q => !finaleSet.has(q.id));
    const idx = arr.findIndex(q => q.id === id);
    if (idx < 0) return;
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    localSettings.questions.rounds = arr;
    markDirty();
    renderRounds();
  });

  // Drag & drop
  setupRoundsOrderDnd(listEl);
}

function setupRoundsOrderDnd(listEl) {
  let dragged = null;

  listEl.querySelectorAll(".roundsOrderItem").forEach(item => {
    item.addEventListener("dragstart", e => {
      dragged = item;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => {
      if (dragged) dragged.classList.remove("dragging");
      listEl.querySelectorAll(".roundsOrderItem").forEach(el => el.classList.remove("gs-row-drag-over-top", "gs-row-drag-over-bot"));
      // Zapisz nową kolejność z DOM (tylko widoczne, bez finalowych)
      const finaleSet = new Set(localSettings.questions.final.map(q => q.id));
      const newOrder = [...listEl.querySelectorAll(".roundsOrderItem")]
        .map(el => localSettings.questions.rounds.find(q => q.id === el.dataset.qid))
        .filter(Boolean);
      // Zachowaj w rounds tylko pytania nie-finalowe, w nowej kolejności
      localSettings.questions.rounds = newOrder.filter(q => !finaleSet.has(q.id));
      markDirty();
      dragged = null;
      renderRounds();
    });
    item.addEventListener("dragover", e => {
      e.preventDefault();
      if (!dragged || dragged === item) return;
      const rect = item.getBoundingClientRect();
      const half = rect.top + rect.height / 2;
      item.classList.toggle("gs-row-drag-over-top", e.clientY < half);
      item.classList.toggle("gs-row-drag-over-bot", e.clientY >= half);
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("gs-row-drag-over-top", "gs-row-drag-over-bot");
    });
    item.addEventListener("drop", e => {
      e.preventDefault();
      if (!dragged || dragged === item) return;
      const rect = item.getBoundingClientRect();
      const half = rect.top + rect.height / 2;
      if (e.clientY < half) {
        listEl.insertBefore(dragged, item);
      } else {
        listEl.insertBefore(dragged, item.nextSibling);
      }
      item.classList.remove("gs-row-drag-over-top", "gs-row-drag-over-bot");
    });
  });
}

// --- DRAG-AND-DROP SORT (dla finału - reorder wewnątrz kolumny) ---
function initDragSort(listEl, getItems, setItems, reRender) {
  let dragged = null;

  listEl.querySelectorAll(".gs-draggable").forEach(row => {
    row.addEventListener("dragstart", e => {
      dragged = row;
      row.classList.add("gs-row-dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      if (dragged) dragged.classList.remove("gs-row-dragging");
      listEl.querySelectorAll(".gs-row-drag-over-top, .gs-row-drag-over-bot").forEach(el => {
        el.classList.remove("gs-row-drag-over-top", "gs-row-drag-over-bot");
      });
      const newOrder = [...listEl.querySelectorAll(".gs-draggable")].map(el => {
        return getItems().find(q => q.id === el.dataset.qid);
      }).filter(Boolean);
      setItems(newOrder);
      markDirty();
      dragged = null;
      reRender();
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      if (!dragged || dragged === row) return;
      const rect = row.getBoundingClientRect();
      const half = rect.top + rect.height / 2;
      row.classList.toggle("gs-row-drag-over-top", e.clientY < half);
      row.classList.toggle("gs-row-drag-over-bot", e.clientY >= half);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("gs-row-drag-over-top", "gs-row-drag-over-bot");
    });
    row.addEventListener("drop", e => {
      e.preventDefault();
      if (!dragged || dragged === row) return;
      const rect = row.getBoundingClientRect();
      const half = rect.top + rect.height / 2;
      if (e.clientY < half) {
        listEl.insertBefore(dragged, row);
      } else {
        listEl.insertBefore(dragged, row.nextSibling);
      }
      row.classList.remove("gs-row-drag-over-top", "gs-row-drag-over-bot");
    });
  });
}

// --- USTAWIENIA GRY ---
function renderGame() {
  const adv = localSettings.game.advanced;
  const hasFinal = localSettings.game.hasFinal === true;
  const endMode = adv.endScreenMode || "logo";

  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.game")}</div>
    <div class="gs-section">
      <div class="sectionBlock">
        <div class="sectionTitle">${t("gameSettings.game.roundsScoreSection")}</div>
        <div class="setting-item">
          <div class="lbl2">${t("gameSettings.game.roundMultipliers")}</div>
          <input class="inp" id="gsMultipliers" value="${escAttr(adv.roundMultipliers.join(", "))}" placeholder="1, 1, 1, 2, 3" style="margin-top:6px"/>
          <div class="gs-hint">${t("gameSettings.game.roundMultipliersHint")}</div>
        </div>
      </div>
      <div class="sectionBlock">
        <div class="sectionTitle">${t("gameSettings.game.finaleSection")}</div>
        <div class="setting-item">
          <div class="lbl2">${t("gameSettings.game.finalMinPoints")}</div>
          <input class="inp" id="gsFinalMinPts" type="number" min="0" max="9999" value="${adv.finalMinPoints}" style="margin-top:6px;max-width:160px"/>
          <div class="gs-hint">${t("gameSettings.game.finalMinPointsHint")}</div>
        </div>
        <div class="setting-item" id="gsFinalTargetField" style="display:${hasFinal ? "block" : "none"}">
          <div class="lbl2">${t("gameSettings.game.finalTarget")}</div>
          <input class="inp" id="gsFinalTarget" type="number" min="50" max="999" value="${adv.finalTarget}" style="margin-top:6px;max-width:160px"/>
        </div>
      </div>
      <div class="sectionBlock">
        <div class="sectionTitle">${t("gameSettings.game.endScreenSection")}</div>
        <div class="setting-item">
          <div class="lbl2">${t("gameSettings.game.endModeLabel")}</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
            <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
              <input type="radio" name="gsEndMode" value="logo" ${endMode === "logo" ? "checked" : ""}/>${t("gameSettings.game.endModeLogoShort")}
            </label>
            <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
              <input type="radio" name="gsEndMode" value="points" ${endMode === "points" ? "checked" : ""}/>${t("gameSettings.game.endModePointsShort")}
            </label>
            <label style="display:${hasFinal ? "flex" : "none"};gap:8px;align-items:center;cursor:pointer" id="gsEndModeMoneyLabel">
              <input type="radio" name="gsEndMode" value="money" ${endMode === "money" ? "checked" : ""}/>${t("gameSettings.game.endModeMoneyShort")}
            </label>
          </div>
        </div>
        <div class="setting-item" id="gsPrizeSettingsRow" style="display:${hasFinal && endMode === "money" ? "grid" : "none"};grid-template-columns:1fr 1fr;gap:14px">
          <div>
            <div class="lbl2">${t("gameSettings.game.prizeAmount")}</div>
            <input class="inp" id="gsMainPrize" type="number" min="1" max="99999" value="${adv.mainPrizeAmount}" style="margin-top:6px"/>
          </div>
          <div>
            <div class="lbl2">${t("gameSettings.game.prizeMultiplier")}</div>
            <input class="inp" id="gsPrizeMultiplier" type="number" min="1" max="10" value="${adv.finalPrizeMultiplier}" style="margin-top:6px"/>
          </div>
        </div>
      </div>
    </div>
    <div class="sfx-foot">
      <button class="btn" id="btnGameReset" type="button">${t("gameSettings.resetSection") || "Przywróć domyślne"}</button>
    </div>
  `;

  document.getElementById("gsMultipliers")?.addEventListener("change", e => {
    const parts = e.target.value.split(/[,\s]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n > 0);
    if (parts.length > 0) {
      localSettings.game.advanced.roundMultipliers = parts;
      markDirty();
    }
  });

  document.getElementById("gsFinalMinPts")?.addEventListener("change", e => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v) && v >= 0) { localSettings.game.advanced.finalMinPoints = v; markDirty(); }
  });

  document.getElementById("gsFinalTarget")?.addEventListener("change", e => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v) && v > 0) { localSettings.game.advanced.finalTarget = v; markDirty(); }
  });

  content.querySelectorAll("[name='gsEndMode']").forEach(radio => {
    radio.addEventListener("change", () => {
      localSettings.game.advanced.endScreenMode = radio.value;
      markDirty();
      const prizeRow = document.getElementById("gsPrizeSettingsRow");
      if (prizeRow) {
        prizeRow.style.display = (localSettings.game.hasFinal === true && radio.value === "money") ? "grid" : "none";
      }
    });
  });

  document.getElementById("gsMainPrize")?.addEventListener("change", e => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v) && v > 0) { localSettings.game.advanced.mainPrizeAmount = Math.min(v, 99999); markDirty(); }
  });

  document.getElementById("gsPrizeMultiplier")?.addEventListener("change", e => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v) && v > 0) { localSettings.game.advanced.finalPrizeMultiplier = v; markDirty(); }
  });

  document.getElementById("btnGameReset")?.addEventListener("click", async () => {
    if (!await confirmModal({ text: t("gameSettings.resetSectionConfirm") || "Przywrócić domyślne ustawienia gry?" })) return;
    localSettings.game.advanced = { ...DEFAULT_SETTINGS.game.advanced };
    markDirty();
    renderGame();
  });
}

// ===== MAIN =====
async function main() {
  const user = await requireAuth("../login");
  setTopbarAccount(user, { showAuthEntry: false });

  if (!gameId) {
    location.href = "/my-games";
    return;
  }

  // Load game + saved settings
  const { data: game, error: gameErr } = await sb()
    .from("games")
    .select("id,name,settings")
    .eq("id", gameId)
    .single();

  if (gameErr || !game) {
    if (content) content.innerHTML = `<p style="color:red;padding:20px">${escText(t("gameSettings.loadError"))}${escText(gameErr?.message || t("gameSettings.unknownError"))}</p>`;
    return;
  }

  if (titleEl) titleEl.textContent = game.name || "—";
  document.title = `${game.name || t("gameSettings.defaultGameName")} — ${t("gameSettings.pageTitle")}`;

  // Modal mode (opened from control-new) — odczyt z modułowej stałej _isModal
  const isModal = _isModal;
  if (isModal) {
    // Hide back button — modal backdrop closes it
    if (btnBack) btnBack.classList.add("hidden");

    // Sidebar toggle (☰ button)
    const btnToggle   = document.getElementById("btnToggleSidebar");
    const sidebarEl   = document.getElementById("gsSidebar");
    const backdropEl  = document.getElementById("gsSidebarBackdrop");
    if (btnToggle) btnToggle.classList.remove("hidden");

    function openSidebar()  {
      sidebarEl?.classList.add("gs-sidebar-open");
      backdropEl?.classList.add("gs-sidebar-open");
    }
    function closeSidebar() {
      sidebarEl?.classList.remove("gs-sidebar-open");
      backdropEl?.classList.remove("gs-sidebar-open");
    }
    btnToggle?.addEventListener("click", openSidebar);
    backdropEl?.addEventListener("click", closeSidebar);
    // Zamknij drawer po wyborze kategorii
    sidebarEl?.addEventListener("click", (e) => {
      if (e.target.closest(".gs-sidebar-item")) closeSidebar();
    });

    // Handle close requests — confirm if unsaved changes
    async function tryClose() {
      if (isDirty) {
        if (!await confirmModal({ text: t("gameSettings.unsavedConfirmModal") || "Masz niezapisane zmiany. Czy chcesz zamknąć ustawienia?" })) return;
      }
      // Reset defaultValue na wszystkich inputach żeby przeglądarka nie pokazała
      // natywnego "Masz niezapisane zmiany" przy nawigacji iframe
      document.querySelectorAll("input, textarea, select").forEach(el => {
        if (el.type === "checkbox" || el.type === "radio") el.defaultChecked = el.checked;
        else el.defaultValue = el.value;
      });
      window.parent.postMessage({ type: "gs:close" }, "*");
    }

    window.addEventListener("message", (ev) => {
      if (ev.data?.type === "gs:requestClose") tryClose();
    });

    const btnGsModalClose = document.getElementById("btnGsModalClose");
    if (btnGsModalClose) {
      btnGsModalClose.classList.remove("hidden");
      btnGsModalClose.addEventListener("click", tryClose);
    }
  }

  localSettings = mergeSettings(game.settings);

  // Cleanup: usuń pytania finałowe z rounds (mogły tam trafić przed wdrożeniem tej logiki)
  {
    const finalSet = new Set(localSettings.questions.final.map(q => q.id));
    if (finalSet.size > 0) {
      localSettings.questions.rounds = localSettings.questions.rounds.filter(q => !finalSet.has(q.id));
    }
  }

  // Load themes list
  try {
    const res = await fetch("/display/js/themes.json");
    const json = await res.json();
    themeRaw = json.themes || [];
    resolveThemeLabels();
  } catch {}

  function resolveThemeLabels() {
    const lang = getUiLang() || "pl";
    themeList = themeRaw.map(e => ({
      key: e.key,
      label: typeof e.label === "object" ? (e.label[lang] ?? e.label["pl"] ?? e.key) : (e.label || e.key),
    }));
  }

  // Load all questions for pickers
  try {
    allQuestions = await loadQuestions(gameId);
  } catch {}

  // Show "Graj" button if game has questions — only outside modal mode
  if (btnPlay && !isModal) {
    if (allQuestions.length > 0) {
      btnPlay.classList.remove("hidden");
    }
    btnPlay.addEventListener("click", () => {
      location.href = `control-new?id=${encodeURIComponent(gameId)}`;
    });
  }

  updateSubTabStates();

  // Sidebar clicks
  sidebar?.addEventListener("click", e => {
    const btn = e.target.closest(".gs-sidebar-item");
    if (!btn || btn.classList.contains("gs-sidebar-item-disabled")) return;
    const cat = btn.dataset.cat;
    if (cat) setActiveCat(cat);
  });

  // Save buttons
  btnSaveAll?.addEventListener("click", saveAll);

  // Reset to defaults
  btnResetAll?.addEventListener("click", async () => {
    if (!await confirmModal({ text: t("gameSettings.resetAllConfirm") || "Przywrócić ustawienia domyślne? Niezapisane zmiany zostaną utracone." })) return;

    // Wyczyść custom pliki dźwiękowe (IndexedDB + bucket)
    let customKeys = [];
    try { customKeys = [...(await getSfxCustomFiles(gameId)).keys()]; } catch {}
    try { await clearAllSfxCustomFiles(gameId); } catch {}
    if (customKeys.length > 0) {
      _getSoundUserId().then(userId => {
        if (userId) deleteAllGameSounds(sb(), userId, gameId, customKeys).catch(console.warn);
      });
    }

    localSettings = mergeSettings(null);
    markDirty();
    updateSubTabStates();
    setActiveCat(activeCat);
  });

  // Back button
  if (!isModal) {
    btnBack?.addEventListener("click", async () => {
      if (isDirty && !await confirmModal({ text: t("gameSettings.unsavedConfirm") || "Masz niezapisane zmiany. Czy na pewno chcesz wyjść?" })) return;
      location.href = `/builder`;
    });
  }

  initColorModal();

  // Manual / Legal overlays
  const helpOverlay = document.getElementById("helpOverlay");
  const helpFrame   = document.getElementById("helpFrame");
  const legalOverlay = document.getElementById("legalOverlay");
  const legalFrame   = document.getElementById("legalFrame");
  const btnManual     = document.getElementById("btnManual");
  const btnHelpClose  = document.getElementById("btnHelpClose");
  const btnLegal      = document.getElementById("btnLegal");
  const btnBackToManual = document.getElementById("btnBackToManual");
  const btnLegalClose = document.getElementById("btnLegalClose");

  function buildHelpUrl() {
    const url = new URL("/manual", location.href);
    url.searchParams.set("ret", `game-settings${location.search}`);
    url.searchParams.set("modal", "control");
    url.searchParams.set("lang", getUiLang() || "pl");
    url.searchParams.set("tab", "gameSettings");
    return url.toString();
  }
  function buildLegalUrl() {
    const url = new URL("/privacy", location.href);
    url.searchParams.set("ret", `game-settings${location.search}`);
    url.searchParams.set("modal", "control");
    url.searchParams.set("lang", getUiLang() || "pl");
    return url.toString();
  }

  btnManual?.addEventListener("click", () => {
    if (helpFrame) helpFrame.src = buildHelpUrl();
    helpOverlay?.classList.remove("hidden");
  });
  btnHelpClose?.addEventListener("click", () => helpOverlay?.classList.add("hidden"));
  helpOverlay?.addEventListener("click", (ev) => { if (ev.target === helpOverlay) helpOverlay.classList.add("hidden"); });

  btnLegal?.addEventListener("click", (ev) => {
    ev.stopImmediatePropagation();
    if (legalFrame) legalFrame.src = buildLegalUrl();
    legalOverlay?.classList.remove("hidden");
  });
  btnBackToManual?.addEventListener("click", () => {
    legalOverlay?.classList.add("hidden");
    if (helpFrame) helpFrame.src = buildHelpUrl();
    helpOverlay?.classList.remove("hidden");
  });
  btnLegalClose?.addEventListener("click", () => legalOverlay?.classList.add("hidden"));
  legalOverlay?.addEventListener("click", (ev) => { if (ev.target === legalOverlay) legalOverlay.classList.add("hidden"); });

  // Create display preview iframe — skip in modal mode (real display managed by control-new)
  if (!isModal) createDisplayIframe();
  else sendDisplayInitCmds();

  setActiveCat("teams");

  window.addEventListener("i18n:lang", () => {
    resolveThemeLabels();
    renderCat(activeCat);
  });
}

main().catch(err => {
  console.error("[game-settings]", err);
  if (content) content.innerHTML = `<p style="color:red;padding:20px">${escText(t("gameSettings.errorPrefix"))}${escText(String(err?.message || err))}</p>`;
});
