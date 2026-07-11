// js/pages/game-settings.js
import { requireAuth } from "../core/auth.js?v=v2026-07-11T19195";
import { t, getUiLang } from "../../translation/translation.js?v=v2026-07-11T19195";
import { setTopbarAccount } from "../core/topbar-controller.js?v=v2026-07-11T19195";
import { sb } from "../core/supabase.js?v=v2026-07-11T19195";
import { loadQuestions } from "../core/game-validate.js?v=v2026-07-11T19195";
import { loadFont5x7, buildLogoPreviewCanvas } from "../core/logo-preview.js?v=v2026-07-11T19195";
import { v as cacheBust } from "../core/cache-bust.js?v=v2026-07-11T19195";
import { alertModal, confirmModal } from "../core/modal.js?v=v2026-07-11T19195";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

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

// Color modal state — labels populated lazily from t()
let colorModalTarget = null;
let colorModalR = 0, colorModalG = 0, colorModalB = 0;

// ===== ELEMENTS =====
const titleEl = document.getElementById("gsTitle");
const unsavedBadge = document.getElementById("gsUnsavedBadge");
const btnSaveAll = document.getElementById("btnSaveAll");
const btnResetAll = document.getElementById("btnResetAll");
const btnBack = document.getElementById("btnBack");
const content = document.getElementById("gsContent");
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

  if (btnSaveAll) btnSaveAll.disabled = true;
  try {
    const payload = JSON.parse(JSON.stringify(localSettings));
    const { error } = await sb()
      .from("games")
      .update({ settings: payload })
      .eq("id", gameId);
    if (error) throw error;
    clearDirty();
  } catch (e) {
    console.error("[game-settings] saveAll error:", e);
    alertModal({ text: t("gameSettings.saveErrorPrefix") + (e?.message || e?.code || String(e)) });
  } finally {
    if (btnSaveAll) btnSaveAll.disabled = false;
  }
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

// ===== RENDER CATEGORIES =====
function renderCat(cat) {
  if (!content) return;
  switch (cat) {
    case "teams":     renderTeams();     break;
    case "display":   renderDisplay();   break;
    case "sound":     renderSound();     break;
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
    if (_displayIframe?.contentWindow?.handleCommand) {
      _displayIframe.contentWindow.handleCommand(cmd);
    }
  } catch {}
}

function previewLogo(id) {
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
  sendDisplayCmd("LOGO DRAW");
  sendDisplayCmd("LEFT 123");
  sendDisplayCmd("RIGHT 123");
  sendDisplayCmd("TOP 1");
  sendDisplayCmd(`LONG1 ${q(teamA)}`);
  sendDisplayCmd(`LONG2 ${q(teamB)}`);
  sendDisplayCmd("INDICATOR OFF");
}

function initDisplayPreview() {
  const container = document.getElementById("gsDisplayPreviewContainer");
  if (!container) return;

  // Check if the iframe content is still alive
  const isAlive = (() => {
    try { return !!_displayIframe?.contentWindow?.handleCommand; } catch { return false; }
  })();

  if (isAlive) {
    container.appendChild(_displayIframe);
    sendDisplayInitCmds();
    return;
  }

  // Create once or reload if content was destroyed (e.g. parent innerHTML was replaced)
  if (!_displayIframe) {
    _displayIframe = document.createElement("iframe");
    _displayIframe.id = "gsDisplayPreview";
    _displayIframe.style.cssText = "width:100%;height:100%;border:none;display:block";
    _displayIframe.title = "Display preview";
  }

  _displayReady = false;

  const startPoll = () => {
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      try {
        if (_displayIframe?.contentWindow?.handleCommand) {
          clearInterval(poll);
          _displayReady = true;
          sendDisplayInitCmds();
        } else if (attempts >= 30) {
          clearInterval(poll);
        }
      } catch {
        clearInterval(poll);
      }
    }, 100);
  };

  _displayIframe.addEventListener("load", startPoll, { once: true });
  _displayIframe.src = "/display"; // (re)load — triggers new load event
  container.appendChild(_displayIframe);
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
  const themeOptions = themeList.map(th =>
    `<option value="${escAttr(th.key)}" ${effectiveTheme === th.key ? "selected" : ""}>${escText(th.label)}</option>`
  ).join("");

  // Detach iframe before wiping innerHTML — re-attached by initDisplayPreview()
  if (_displayIframe?.isConnected) _displayIframe.remove();

  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.display")}</div>
    <div class="gs-section">
      <div class="gs-label">${t("gameSettings.display.colors")}</div>
      <div class="colorRow">${swatches}</div>
    </div>
    <div class="gs-section">
      <div class="gs-label">${t("gameSettings.display.theme")}</div>
      <select class="inp" id="gsThemeSelect" style="margin-top:8px">
        ${themeOptions}
      </select>
    </div>
    <div class="gs-section">
      <div class="gs-label">${t("gameSettings.display.logo")}</div>
      <div id="gsLogoGrid" class="gs-logo-grid"></div>
    </div>
    <div class="display-preview" id="gsDisplayPreviewContainer"></div>
  `;

  content.querySelectorAll(".swatchBtn").forEach(btn => {
    btn.addEventListener("click", () => openColorModal(btn.dataset.colorKey));
  });

  const themeSelect = document.getElementById("gsThemeSelect");
  if (themeSelect) {
    themeSelect.addEventListener("change", e => {
      localSettings.display.theme = e.target.value || null;
      markDirty();
      const key = e.target.value || (themeList[0]?.key ?? "");
      if (key) sendDisplayCmd(`THEME ${key}`);
    });
  }

  initDisplayPreview();
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
function renderSound() {
  content.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.sound")}</div>
    <div class="gs-section">
      <p class="gs-hint" style="font-size:.9rem">${t("gameSettings.sound.comingSoon")}</p>
    </div>
  `;
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
                  <div class="meta">#${q.ord}</div>
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
                  <div class="meta">#${q.ord}</div>
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
    localSettings = mergeSettings(null);
    markDirty();
    updateSubTabStates();
    setActiveCat(activeCat);
  });

  // Back button
  btnBack?.addEventListener("click", async () => {
    if (isDirty && !await confirmModal({ text: t("gameSettings.unsavedConfirm") || "Masz niezapisane zmiany. Czy na pewno chcesz wyjść?" })) return;
    location.href = `/builder`;
  });

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
    url.searchParams.set("tab", "control");
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
