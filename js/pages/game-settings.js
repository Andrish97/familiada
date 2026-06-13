import { t, applyTranslations } from "../../translation/translation.js?v=v2026-06-13T07282";
import { sb } from "../core/supabase.js?v=v2026-06-13T07282";
import { requireAuth } from "../core/auth.js?v=v2026-06-13T07282";
import { confirmModal, alertModal } from "../core/modal.js?v=v2026-06-13T07282";
import { loadSettings, saveSettings, getDefaults } from "../core/game-settings.js?v=v2026-06-13T07282";
import { guardDesktopOnly } from "../core/device-guard.js?v=v2026-06-13T07282";
import { initUiSelect } from "../core/ui-select.js?v=v2026-06-13T07282";
import {
  loadSfxManifest, getSfxCategories, setCurrentGameId,
  setSfxCustomBlob, clearSfxCustomFile, clearAllSfxCustomFiles, getSfxCustomFiles,
} from "../core/sfx-new.js?v=v2026-06-13T07282";
import { loadFont5x7, buildLogoPreviewCanvas } from "../core/logo-preview.js?v=v2026-06-13T07282";

const SFX_KEYS = [
  "show_intro", "round_transition", "round_transition2", "final_theme",
  "buzzer_press", "answer_correct", "answer_wrong", "answer_repeat", "time_over", "bells",
];

/* ===== COLOR HELPERS ===== */
function normHex(h) {
  h = h.replace(/^#/, "").trim();
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  return h.length === 6 ? "#" + h.toLowerCase() : "#000000";
}

function hexToRgb(hex) {
  const h = normHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0,2), 16),
    g: parseInt(h.slice(2,4), 16),
    b: parseInt(h.slice(4,6), 16),
  };
}

function rgbToHex(r, g, b) {
  return "#" + [r,g,b].map(v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,"0")).join("");
}

let _colorModalTarget = null;

function openGsColorModal(target, title) {
  _colorModalTarget = target;
  const hex = state.settings.display.colors[target] || "#000000";
  const { r, g, b } = hexToRgb(hex);
  const overlay = document.getElementById("gsColorModal");
  if (!overlay) return;
  document.getElementById("gsColorModalTitle").textContent = title || target;
  document.getElementById("gsColorPreview").style.background = hex;
  document.getElementById("gsColorHex").value = hex;
  document.getElementById("gsColorR").value = r;
  document.getElementById("gsColorG").value = g;
  document.getElementById("gsColorB").value = b;
  document.getElementById("gsColorRVal").textContent = r;
  document.getElementById("gsColorGVal").textContent = g;
  document.getElementById("gsColorBVal").textContent = b;
  updateRngTrack("gsColorR", r, 255);
  updateRngTrack("gsColorG", g, 255);
  updateRngTrack("gsColorB", b, 255);
  overlay.classList.remove("hidden");
}

function closeGsColorModal() {
  document.getElementById("gsColorModal")?.classList.add("hidden");
  _colorModalTarget = null;
}

function updateRngTrack(id, val, max) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = (val / max) * 100;
  el.style.setProperty("--track", `linear-gradient(to right,#000 0%,#fff ${pct}%,rgba(255,255,255,.15) ${pct}%)`);
}

function applyGsColorFromModal() {
  if (!_colorModalTarget) return;
  const hex = normHex(document.getElementById("gsColorHex")?.value || "#000000");
  state.settings.display.colors[_colorModalTarget] = hex;
  const swatch = document.getElementById("gsSwatch" + _colorModalTarget);
  if (swatch) swatch.style.background = hex;
  markDirty();
  refreshPreviewColor(_colorModalTarget, hex);
}

function initColorModal() {
  const rSlider = document.getElementById("gsColorR");
  const gSlider = document.getElementById("gsColorG");
  const bSlider = document.getElementById("gsColorB");
  const hexInput = document.getElementById("gsColorHex");
  const preview = document.getElementById("gsColorPreview");

  function updateFromSliders() {
    const r = Number(rSlider.value);
    const g = Number(gSlider.value);
    const b = Number(bSlider.value);
    const hex = rgbToHex(r, g, b);
    if (preview) preview.style.background = hex;
    if (hexInput) hexInput.value = hex;
    document.getElementById("gsColorRVal").textContent = r;
    document.getElementById("gsColorGVal").textContent = g;
    document.getElementById("gsColorBVal").textContent = b;
    updateRngTrack("gsColorR", r, 255);
    updateRngTrack("gsColorG", g, 255);
    updateRngTrack("gsColorB", b, 255);
    applyGsColorFromModal();
  }

  rSlider?.addEventListener("input", updateFromSliders);
  gSlider?.addEventListener("input", updateFromSliders);
  bSlider?.addEventListener("input", updateFromSliders);

  hexInput?.addEventListener("input", () => {
    const raw = hexInput.value.trim();
    const cleaned = raw.replace(/^#/, "");
    if (cleaned.length === 6 && /^[0-9a-fA-F]{6}$/.test(cleaned)) {
      const hex = "#" + cleaned.toLowerCase();
      const { r, g, b } = hexToRgb(hex);
      if (rSlider) rSlider.value = r;
      if (gSlider) gSlider.value = g;
      if (bSlider) bSlider.value = b;
      document.getElementById("gsColorRVal").textContent = r;
      document.getElementById("gsColorGVal").textContent = g;
      document.getElementById("gsColorBVal").textContent = b;
      updateRngTrack("gsColorR", r, 255);
      updateRngTrack("gsColorG", g, 255);
      updateRngTrack("gsColorB", b, 255);
      if (preview) preview.style.background = hex;
      applyGsColorFromModal();
    }
  });

  document.getElementById("gsColorModalClose")?.addEventListener("click", closeGsColorModal);
  document.getElementById("gsColorModalDone")?.addEventListener("click", closeGsColorModal);
}

/* ===== STATE ===== */
const state = {
  gameId:   null,
  game:     null,
  shareKeyDisplay: null,
  settings: null,
  questions: [],
  logos:    [],
  themes:   [],
  locale:   "pl",
  activeCategory: "teams",
  isDirty:  false,
};

let _gsLogoFont = null;
let _gsDefaultLogoPayload = null;

/* ===== ELEMENTS ===== */
const btnBack        = document.getElementById("btnBack");
const btnSaveAll     = document.getElementById("btnSaveAll");
const btnSaveFooter  = document.getElementById("btnSaveFooter");
const gsSidebar      = document.getElementById("gsSidebar");
const gsContent      = document.getElementById("gsContent");
const gsFooter       = document.getElementById("gsFooter");
const gsTitle        = document.getElementById("gsTitle");
const gsUnsavedBadge = document.getElementById("gsUnsavedBadge");
const sidebarFinale  = document.getElementById("sidebarFinale");

/* ===== DIRTY ===== */
function markDirty() {
  state.isDirty = true;
  gsFooter.classList.remove("hidden");
  gsUnsavedBadge.classList.remove("hidden");
}

function markClean() {
  state.isDirty = false;
  gsFooter.classList.add("hidden");
  gsUnsavedBadge.classList.add("hidden");
}

window.addEventListener("beforeunload", (e) => {
  if (state.isDirty) { e.preventDefault(); e.returnValue = ""; }
});

/* ===== SIDEBAR ===== */
function setCategory(cat) {
  state.activeCategory = cat;
  gsSidebar.querySelectorAll(".gs-sidebar-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === cat);
  });
  renderContent();
}

function renderContent() {
  const cat = state.activeCategory;
  if (cat === "teams")        renderTeams();
  else if (cat === "display") renderDisplay();
  else if (cat === "sound")   renderSound().catch(console.error);
  else if (cat === "questions") renderQuestions();
  else if (cat === "rounds")  renderRounds();
  else if (cat === "finale")  renderFinale();
  else if (cat === "game")    renderGame();
}

/* ===== HELPERS ===== */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function questionById(id) {
  return state.questions.find(q => q.id === id);
}

/* ===== TEAMS ===== */
function renderTeams() {
  const { nameA, nameB } = state.settings.teams;
  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.teams")}</div>
    <div class="gs-section">
      <div class="gs-field">
        <label class="gs-label" for="gsTeamA">${t("gameSettings.teams.nameA")}</label>
        <input class="inp" id="gsTeamA" type="text" maxlength="30" value="${esc(nameA)}"/>
      </div>
      <div class="gs-field">
        <label class="gs-label" for="gsTeamB">${t("gameSettings.teams.nameB")}</label>
        <input class="inp" id="gsTeamB" type="text" maxlength="30" value="${esc(nameB)}"/>
      </div>
      <div class="rowBtns" style="margin-top:12px;">
        <button class="btn btn-sm" id="btnTeamsReset" type="button">${t("gameSettings.teams.restoreDefaults")}</button>
      </div>
    </div>`;

  document.getElementById("gsTeamA").addEventListener("input", (e) => {
    state.settings.teams.nameA = e.target.value;
    markDirty();
    refreshPreviewTeams();
  });
  document.getElementById("gsTeamB").addEventListener("input", (e) => {
    state.settings.teams.nameB = e.target.value;
    markDirty();
    refreshPreviewTeams();
  });
  document.getElementById("btnTeamsReset").addEventListener("click", () => {
    const def = getDefaults(state.locale).teams;
    state.settings.teams = { ...def };
    renderTeams();
    markDirty();
  });
}

/* ===== DISPLAY PREVIEW (iframe) ===== */
let _previewCmdQueue = [];
let _previewReady = false;

function getPreviewIframe() {
  return document.getElementById("gsDisplayIframe");
}

function sendPreviewCmd(cmd) {
  const iframe = getPreviewIframe();
  if (!iframe) return;
  const win = iframe.contentWindow;
  if (!win) return;
  try { win.handleCommand?.(cmd); } catch (e) { /* cross-origin or not loaded */ }
}

function flushPreviewCmds() {
  const q = _previewCmdQueue.splice(0);
  for (const cmd of q) sendPreviewCmd(cmd);
}

function queuePreviewCmd(cmd) {
  if (_previewReady) {
    sendPreviewCmd(cmd);
  } else {
    _previewCmdQueue.push(cmd);
  }
}

function initPreviewIframe() {
  if (!state.shareKeyDisplay) return;

  const iframe = getPreviewIframe();
  if (!iframe) return;

  _previewReady = false;
  _previewCmdQueue = [];

  iframe.src = `/display.html?id=${encodeURIComponent(state.gameId)}&key=${encodeURIComponent(state.shareKeyDisplay)}`;

  iframe.onload = () => {
    _previewReady = true;
    // display/js/main.js sets window.handleCommand asynchronously inside
    // DOMContentLoaded — poll until it's available before sending commands
    const tryInit = (n) => {
      try {
        if (iframe.contentWindow?.handleCommand) {
          sendPreviewCommands();
          flushPreviewCmds();
          return;
        }
      } catch {}
      if (n > 0) setTimeout(() => tryInit(n - 1), 150);
    };
    tryInit(15);
  };
}

function sendPreviewCommands() {
  const { nameA, nameB } = state.settings.teams;
  const { colors, theme } = state.settings.display;
  const q = (s) => `"${(s || "").replace(/"/g, '\\"')}"`;
  sendPreviewCmd("APP GAME");
  sendPreviewCmd(`COLOR A ${colors.A}`);
  sendPreviewCmd(`COLOR B ${colors.B}`);
  sendPreviewCmd(`COLOR BACKGROUND ${colors.BACKGROUND}`);
  sendPreviewCmd(`COLOR DOT ${colors.DOT}`);
  sendPreviewCmd("LOGO RELOAD");
  sendPreviewCmd("LEFT 123");
  sendPreviewCmd("RIGHT 123");
  sendPreviewCmd("TOP 1");
  sendPreviewCmd(`LONG1 ${q(nameA || "A")}`);
  sendPreviewCmd(`LONG2 ${q(nameB || "B")}`);
  if (theme) sendPreviewCmd(`THEME ${theme}`);
}

function refreshPreviewTeams() {
  if (!_previewReady) return;
  const { nameA, nameB } = state.settings.teams;
  const q = (s) => `"${(s || "").replace(/"/g, '\\"')}"`;
  sendPreviewCmd(`LONG1 ${q(nameA || "A")}`);
  sendPreviewCmd(`LONG2 ${q(nameB || "B")}`);
}

function refreshPreviewLogo() {
  if (!_previewReady) return;
  sendPreviewCmd("LOGO RELOAD");
}

function refreshPreviewColor(key, hex) {
  if (!_previewReady) return;
  sendPreviewCmd(`COLOR ${key} ${hex}`);
}

function refreshPreviewTheme(key) {
  if (!_previewReady) return;
  if (key) sendPreviewCmd(`THEME ${key}`);
}

/* ===== DISPLAY ===== */
function renderDisplay() {
  const { theme, colors } = state.settings.display;

  const colorDefs = [
    { key: "A",          label: t("gameSettings.display.colorA"),   val: colors.A },
    { key: "B",          label: t("gameSettings.display.colorB"),   val: colors.B },
    { key: "BACKGROUND", label: t("gameSettings.display.colorBg"),  val: colors.BACKGROUND },
    { key: "DOT",        label: t("gameSettings.display.colorDot"), val: colors.DOT },
  ];
  const colorSwatches = colorDefs.map(cd =>
    `<div class="colorItem">
       <span class="lbl2">${cd.label}</span>
       <button class="swatchBtn" id="gsSwatch${cd.key}" type="button" style="background:${esc(cd.val)};"></button>
     </div>`
  ).join("");

  const hasPreview = !!state.shareKeyDisplay;

  const themeSelectId = "gsThemeSelect";
  const themeOptions = state.themes.map(th =>
    `<div class="ui-select-option" data-value="${esc(th.key)}"${th.key === theme ? ' data-selected="true"' : ""}>${esc(th.label)}</div>`
  ).join("");
  const currentTheme = state.themes.find(th => th.key === theme);
  const currentThemeLabel = currentTheme ? esc(currentTheme.label) : (theme ? esc(theme) : "—");

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.display")}</div>
    <div class="gs-section gs-display-cols">
      <div>
        <div class="sectionBlock">
          <div class="sectionTitle">${t("gameSettings.display.colors")}</div>
          <div class="colorRow">${colorSwatches}</div>
          <button class="btn btn-sm" id="btnColorsReset" type="button" style="margin-top:10px;">${t("gameSettings.display.colorsReset")}</button>
        </div>
        ${themeOptions ? `
        <div class="sectionBlock">
          <div class="sectionTitle">${t("gameSettings.display.theme")}</div>
          <div class="ui-select" id="${themeSelectId}" style="max-width:260px;">
            <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
              <span class="ui-select-label">${currentThemeLabel}</span>
              <span class="ui-select-caret" aria-hidden="true">▾</span>
            </button>
            <div class="ui-select-menu" role="listbox">${themeOptions}</div>
          </div>
        </div>` : ""}
        <div class="sectionBlock">
          <div class="sectionTitle">${t("gameSettings.display.logo")}</div>
          <div class="logoGrid" id="gsLogoGrid"><div class="hint" style="font-size:.8rem;opacity:.5;">Ładowanie...</div></div>
        </div>
      </div>
      <div>
        <div class="sectionTitle">${t("gameSettings.display.preview")}</div>
        ${hasPreview
          ? `<iframe id="gsDisplayIframe" class="display-preview" style="margin-top:8px;border:none;" scrolling="no" allowfullscreen></iframe>`
          : `<div class="display-preview display-preview-placeholder" style="margin-top:8px;"></div>`
        }
      </div>
    </div>`;

  renderGsLogoGrid().catch(console.error);

  if (hasPreview) {
    initPreviewIframe();
  }

  document.getElementById("gsSwatchA")?.addEventListener("click", () => openGsColorModal("A", t("gameSettings.display.colorA")));
  document.getElementById("gsSwatchB")?.addEventListener("click", () => openGsColorModal("B", t("gameSettings.display.colorB")));
  document.getElementById("gsSwatchBACKGROUND")?.addEventListener("click", () => openGsColorModal("BACKGROUND", t("gameSettings.display.colorBg")));
  document.getElementById("gsSwatchDOT")?.addEventListener("click", () => openGsColorModal("DOT", t("gameSettings.display.colorDot")));

  document.getElementById("btnColorsReset")?.addEventListener("click", () => {
    const defColors = getDefaults(state.locale).display.colors;
    state.settings.display.colors = { ...defColors };
    markDirty();
    renderDisplay();
  });

  const themeSelectEl = document.getElementById(themeSelectId);
  if (themeSelectEl && themeOptions) {
    const btn = themeSelectEl.querySelector(".ui-select-btn");
    const menu = themeSelectEl.querySelector(".ui-select-menu");
    if (btn && menu) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = themeSelectEl.classList.contains("open");
        document.querySelectorAll(".ui-select.open").forEach(el => el.classList.remove("open"));
        if (!isOpen) themeSelectEl.classList.add("open");
      });
      menu.querySelectorAll(".ui-select-option").forEach(opt => {
        opt.addEventListener("click", () => {
          const val = opt.dataset.value;
          menu.querySelectorAll(".ui-select-option").forEach(o => o.removeAttribute("data-selected"));
          opt.setAttribute("data-selected", "true");
          themeSelectEl.querySelector(".ui-select-label").textContent = opt.textContent;
          themeSelectEl.classList.remove("open");
          state.settings.display.theme = val;
          markDirty();
          refreshPreviewTheme(val);
        });
      });
      document.addEventListener("click", () => {
        themeSelectEl?.classList.remove("open");
      });
    }
  }
}

/* ===== LOGO GRID ===== */
async function renderGsLogoGrid() {
  const grid = document.getElementById("gsLogoGrid");
  if (!grid) return;

  if (!_gsLogoFont) {
    try { _gsLogoFont = await loadFont5x7(); } catch {}
  }
  if (!_gsDefaultLogoPayload) {
    try {
      const r = await fetch("/display/logo_familiada.json", { cache: "force-cache" });
      if (r.ok) _gsDefaultLogoPayload = await r.json();
    } catch {}
  }

  grid.innerHTML = "";
  grid.appendChild(makeGsLogo(null));
  for (const logo of state.logos) {
    grid.appendChild(makeGsLogo(logo));
  }
  if (!state.logos.length) {
    const em = document.createElement("div");
    em.className = "logoGridEmpty hint";
    em.textContent = "Brak logo. Dodaj je w edytorze logo.";
    grid.appendChild(em);
  }

  grid.querySelectorAll(".logoTile").forEach(tile => {
    tile.addEventListener("click", () => {
      const key = tile.dataset.logoId;
      const newId = key === "default" ? null : key;
      state.settings.display.logoId = newId;
      markDirty();
      refreshPreviewLogo();
      grid.querySelectorAll(".logoTile").forEach(t => t.classList.remove("selected"));
      tile.classList.add("selected");
    });
  });
}

function makeGsLogo(logo) {
  const id = logo?.id ?? null;
  const key = id ?? "default";
  const name = logo?.name || (id === null ? (t("control.lookLogoDefault") || "Domyślne") : "—");
  const curId = state.settings.display.logoId;
  const sel = (id === null && !curId) || (id !== null && id === curId);

  const previewData = id === null
    ? (_gsDefaultLogoPayload ? { type: "GLYPH_30x10", payload: _gsDefaultLogoPayload } : null)
    : logo;

  const el = document.createElement("div");
  el.className = "logoTile" + (sel ? " selected" : "");
  el.dataset.logoId = String(key);

  const prev = document.createElement("div");
  prev.className = "logoTilePrev";
  prev.appendChild(buildLogoPreviewCanvas(previewData, _gsLogoFont));
  el.appendChild(prev);

  const label = document.createElement("div");
  label.className = "logoTileName";
  label.textContent = name;
  el.appendChild(label);

  return el;
}

/* ===== SOUND ===== */
async function renderSound() {
  const categories = getSfxCategories();
  const lang = document.documentElement.lang || "pl";

  if (!categories.length) {
    gsContent.innerHTML = `<div class="gs-cat-title">${t("gameSettings.categories.sound")}</div><div class="gs-section"><div class="gs-hint">Ładowanie...</div></div>`;
    return;
  }

  let customFiles = new Map();
  try { customFiles = await getSfxCustomFiles(); } catch {}

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.sound")}</div>
    <div class="gs-section">
      <div id="sfxTableGs"></div>
      <div class="sfx-advanced-foot">
        <button class="btn btn-sm" id="btnSoundReset" type="button">${t("gameSettings.teams.restoreDefaults")}</button>
      </div>
    </div>`;

  const tableEl = document.getElementById("sfxTableGs");
  const customLabel = t("control.sfxCustom") || "Własny";

  for (const cat of categories) {
    const key = cat.key;
    const vol = state.settings.sound.volumes[key] ?? 100;
    const currentVariant = state.settings.sound.variants[key] || cat.sounds[0]?.file?.split("?")[0] || "";
    const custom = customFiles.get(key);
    const isCustom = !!custom;

    const soundOptions = cat.sounds.map(s => {
      const file = s.file.split("?")[0];
      const label = typeof s.label === "object" ? (s.label[lang] ?? s.label["pl"] ?? s.file) : s.file;
      const selected = !isCustom && file === currentVariant ? ' data-selected="true"' : "";
      return `<div class="ui-select-option" data-value="${file}"${selected}>${label}</div>`;
    });
    const optionsHtml = [
      ...soundOptions,
      `<div class="ui-select-option" data-value="custom"${isCustom ? ' data-selected="true"' : ""}>${customLabel}</div>`,
    ].join("");

    const selectedSound = cat.sounds.find(s => s.file.split("?")[0] === currentVariant) || cat.sounds[0];
    const variantLabel = selectedSound
      ? (typeof selectedSound.label === "object" ? (selectedSound.label[lang] ?? selectedSound.label["pl"] ?? selectedSound.file) : selectedSound.file)
      : currentVariant;
    const displayLabel = isCustom ? customLabel : variantLabel;

    const desc = t("control.sfxDesc." + key) || key;

    const row = document.createElement("div");
    row.className = "sfx-row";
    row.dataset.key = key;
    row.innerHTML = `
      <div class="sfx-row-desc">${desc}</div>
      <div class="sfx-variant-wrap">
        <div class="ui-select" data-sfx-variant="${key}" id="sfxSelect_${key}">
          <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span class="ui-select-label">${displayLabel}</span>
            <span class="ui-select-caret" aria-hidden="true">▾</span>
          </button>
          <div class="ui-select-menu" role="listbox">${optionsHtml}</div>
        </div>
      </div>
      <button class="sfx-preview-btn" type="button" title="Odtwórz" data-sfx-preview="${key}">▶</button>
      <div class="sfx-vol-wrap">
        <input type="range" class="sfx-vol" min="0" max="100" value="${vol}" data-sfx-vol="${key}"/>
        <span class="sfx-vol-label" id="sfxVolLabel_${key}">${vol}%</span>
      </div>
      <div class="sfx-file-wrap${isCustom ? "" : " hidden"}" id="sfxFileWrap_${key}">
        <button class="btn sm sfx-add-btn${custom ? " hidden" : ""}" type="button" data-sfx-add="${key}">${t("control.sfxAddFile") || "Wybierz plik"}</button>
        <input type="file" class="sfx-file-input" accept="audio/mpeg,audio/wav,audio/ogg" data-sfx-file-input="${key}"/>
        <div class="sfx-file-tag${custom ? "" : " hidden"}" id="sfxFileTag_${key}">
          <span class="sfx-file-name" id="sfxFileName_${key}">${custom ? esc(custom.filename) : ""}</span>
          <button class="sfx-file-remove" type="button" title="Usuń" data-sfx-remove="${key}">✕</button>
        </div>
      </div>`;
    tableEl.appendChild(row);
    _bindGsSfxRow(key, cat, custom || null, currentVariant);
  }

  // Close selects on outside click
  const sfxOutsideClick = (e) => {
    if (!e.target.closest(".ui-select")) {
      tableEl?.querySelectorAll(".ui-select.open").forEach(el => el.classList.remove("open"));
    }
  };
  document.addEventListener("click", sfxOutsideClick);

  // Variant selects
  tableEl.querySelectorAll(".ui-select[data-sfx-variant]").forEach(selectEl => {
    const key = selectEl.dataset.sfxVariant;
    const btn = selectEl.querySelector(".ui-select-btn");
    const menu = selectEl.querySelector(".ui-select-menu");
    if (!btn || !menu) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = selectEl.classList.contains("open");
      tableEl.querySelectorAll(".ui-select.open").forEach(el => el.classList.remove("open"));
      if (!isOpen) selectEl.classList.add("open");
    });
    menu.querySelectorAll(".ui-select-option").forEach(opt => {
      opt.addEventListener("click", () => {
        const file = opt.dataset.value;
        menu.querySelectorAll(".ui-select-option").forEach(o => o.removeAttribute("data-selected"));
        opt.setAttribute("data-selected", "true");
        btn.querySelector(".ui-select-label").textContent = opt.textContent;
        selectEl.classList.remove("open");
        const fileWrap = document.getElementById(`sfxFileWrap_${key}`);
        if (file === "custom") {
          fileWrap?.classList.remove("hidden");
        } else {
          fileWrap?.classList.add("hidden");
          clearSfxCustomFile(key).catch(() => {});
          state.settings.sound.variants[key] = file;
          markDirty();
        }
      });
    });
  });

  document.getElementById("btnSoundReset")?.addEventListener("click", async () => {
    const ok = await confirmModal({ text: t("gameSettings.sound.resetConfirm") || "Przywrócić domyślne ustawienia dźwięku? Usunie to wszystkie własne pliki." });
    if (!ok) return;
    state.settings.sound = { ...getDefaults(state.locale).sound };
    try { await clearAllSfxCustomFiles(); } catch {}
    document.removeEventListener("click", sfxOutsideClick);
    markDirty();
    renderSound().catch(console.error);
  });
}

function _bindGsSfxRow(key, cat, initialCustom, currentVariant) {
  let currentCustom = initialCustom;

  const volSlider = document.querySelector(`[data-sfx-vol="${key}"]`);
  const volLabel = document.getElementById(`sfxVolLabel_${key}`);
  volSlider?.addEventListener("input", () => {
    const v = Number(volSlider.value);
    if (volLabel) volLabel.textContent = `${v}%`;
    state.settings.sound.volumes[key] = v;
    markDirty();
  });

  const previewBtn = document.querySelector(`[data-sfx-preview="${key}"]`);
  previewBtn?.addEventListener("click", () => {
    if (currentCustom?.blob) {
      const url = URL.createObjectURL(currentCustom.blob);
      const audio = new Audio(url);
      audio.play().catch(() => {});
      audio.onended = () => URL.revokeObjectURL(url);
      return;
    }
    const variant = state.settings.sound.variants[key] || cat.sounds[0]?.file || "";
    try { new Audio(`/audio_new/${cat.folder}/${variant}`).play(); } catch {}
  });

  const addBtn = document.querySelector(`[data-sfx-add="${key}"]`);
  const fileInput = document.querySelector(`[data-sfx-file-input="${key}"]`);
  addBtn?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = "";
    try {
      const buf = await file.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(buf.slice());
      ctx.close().catch(() => {});
      const limitSec = cat.limitSec || 30;
      if (decoded.duration > limitSec) {
        await alertModal({ title: t("control.sfxTooLongTitle"), text: t("control.sfxTooLong", { limit: limitSec }) || `Maksymalna długość: ${limitSec}s` });
        return;
      }
      const blob = new Blob([buf], { type: file.type || "audio/mpeg" });
      await setSfxCustomBlob(key, blob, file.name);
      currentCustom = { blob, filename: file.name };
      _gsSetFileTag(key, file.name, true);
    } catch (e) { console.warn("[sfx] decode error", e); }
  });

  const removeBtn = document.querySelector(`[data-sfx-remove="${key}"]`);
  removeBtn?.addEventListener("click", async () => {
    await clearSfxCustomFile(key).catch(console.warn);
    currentCustom = null;
    _gsSetFileTag(key, "", false);
    // Przełącz select z powrotem na poprzedni wariant
    const selectEl = document.getElementById(`sfxSelect_${key}`);
    const menu = selectEl?.querySelector(".ui-select-menu");
    const labelEl = selectEl?.querySelector(".ui-select-label");
    const fallback = currentVariant || cat.sounds[0]?.file?.split("?")[0] || "";
    if (menu && labelEl) {
      menu.querySelectorAll(".ui-select-option").forEach(o => {
        if (o.dataset.value === fallback) o.setAttribute("data-selected", "true");
        else o.removeAttribute("data-selected");
      });
      const opt = menu.querySelector(`[data-value="${fallback}"]`);
      if (opt) labelEl.textContent = opt.textContent;
    }
    document.getElementById(`sfxFileWrap_${key}`)?.classList.add("hidden");
  });
}

function _gsSetFileTag(key, filename, show) {
  const tag = document.getElementById(`sfxFileTag_${key}`);
  const nameEl = document.getElementById(`sfxFileName_${key}`);
  const addBtn = document.querySelector(`[data-sfx-add="${key}"]`);
  tag?.classList.toggle("hidden", !show);
  addBtn?.classList.toggle("hidden", show);
  if (nameEl && filename) nameEl.textContent = filename;
}

/* ===== QUESTIONS SETTINGS ===== */
function updateQSidebarState() {
  const q = state.settings.questions;
  const finaleClickable = q.hasFinal && q.finaleMode === "selected";
  const roundsClickable = q.mode === "ordered";

  const finaleBtn = document.getElementById("sidebarFinale");
  const roundsBtn = document.getElementById("sidebarRounds");

  finaleBtn?.classList.toggle("gs-sidebar-item-disabled", !finaleClickable);
  roundsBtn?.classList.toggle("gs-sidebar-item-disabled", !roundsClickable);

  if (state.activeCategory === "finale" && !finaleClickable) setCategory("questions");
  if (state.activeCategory === "rounds" && !roundsClickable) setCategory("questions");
}

function renderQuestions() {
  const q = state.settings.questions;
  const hasFinal = q.hasFinal;
  const finalMode = q.finaleMode || "random";
  const roundsMode = q.mode === "ordered" ? "pick" : "random";

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.questions") || "Pytania — Ustawienia"}</div>
    <div class="gs-section">
      <div class="sectionBlock">
        <div class="sectionTitle">${t("control.sectionFinal") || "Finał"}</div>
        <div class="setting-item">
          <div class="lbl2">${t("control.playFinal") || "Gramy finał?"}</div>
          <div class="toggle-group">
            <label class="toggle-item">
              <input type="radio" name="qHasFinal" value="yes" ${hasFinal ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${t("control.toggleYes") || "Tak"}"></span>
            </label>
            <label class="toggle-item">
              <input type="radio" name="qHasFinal" value="no" ${!hasFinal ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${t("control.toggleNo") || "Nie"}"></span>
            </label>
          </div>
        </div>
        <div class="setting-item" id="qFinalModeField" style="${hasFinal ? "" : "opacity:.35;pointer-events:none;"}">
          <div class="lbl2">${t("control.finalQuestionsMode") || "Pytania finału"}</div>
          <div class="toggle-group">
            <label class="toggle-item">
              <input type="radio" name="qFinalMode" value="random" ${finalMode !== "selected" ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${t("control.toggleRandom") || "Losuj"}"></span>
            </label>
            <label class="toggle-item">
              <input type="radio" name="qFinalMode" value="selected" ${finalMode === "selected" ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${t("control.togglePick") || "Wybierz"}"></span>
            </label>
          </div>
        </div>
      </div>
      <div class="sectionBlock">
        <div class="sectionTitle">${t("control.sectionRounds") || "Rundy"}</div>
        <div class="setting-item">
          <div class="lbl2">${t("control.roundsQuestionsMode") || "Pytania rund"}</div>
          <div class="toggle-group">
            <label class="toggle-item">
              <input type="radio" name="qRoundsMode" value="random" ${roundsMode !== "pick" ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${t("control.toggleRandom") || "Losuj"}"></span>
            </label>
            <label class="toggle-item">
              <input type="radio" name="qRoundsMode" value="pick" ${roundsMode === "pick" ? "checked" : ""}/>
              <span class="toggle-slider" data-text="${t("control.togglePick") || "Wybierz"}"></span>
            </label>
          </div>
        </div>
      </div>
    </div>`;

  document.querySelectorAll("input[name=qHasFinal]").forEach(r => {
    r.addEventListener("change", () => {
      state.settings.questions.hasFinal = r.value === "yes";
      markDirty();
      updateQSidebarState();
      renderQuestions();
    });
  });
  document.querySelectorAll("input[name=qFinalMode]").forEach(r => {
    r.addEventListener("change", () => {
      state.settings.questions.finaleMode = r.value;
      if (r.value === "random") state.settings.questions.finaleIds = [];
      markDirty();
      updateQSidebarState();
      renderQuestions();
    });
  });
  document.querySelectorAll("input[name=qRoundsMode]").forEach(r => {
    r.addEventListener("change", () => {
      state.settings.questions.mode = r.value === "pick" ? "ordered" : "random";
      if (r.value === "random") state.settings.questions.selectedIds = [];
      markDirty();
      updateQSidebarState();
      renderQuestions();
    });
  });

  updateQSidebarState();
}

/* ===== ROUNDS ===== */
function renderRounds() {
  const q = state.settings.questions;
  const isOrdered = q.mode === "ordered";

  if (!isOrdered) {
    gsContent.innerHTML = `
      <div class="gs-cat-title">${t("gameSettings.categories.rounds")}</div>
      <div class="gs-section">
        <div class="gs-hint sfx-disabled-msg">
          Pytania rund są losowane automatycznie.<br>
          Aby ustalić kolejność, przejdź do <a href="#" id="linkQSettings">Pytania — Ustawienia</a> i wybierz tryb „Wybierz".
        </div>
      </div>`;
    document.getElementById("linkQSettings")?.addEventListener("click", (e) => { e.preventDefault(); setCategory("questions"); });
    return;
  }

  const selectedSet = new Set(q.selectedIds);
  const finaleExclude = q.hasFinal ? new Set(q.finaleIds) : new Set();
  const available = state.questions.filter(qObj => !selectedSet.has(qObj.id) && !finaleExclude.has(qObj.id));

  const orderedItems = q.selectedIds.map((id, i) => {
    const qObj = questionById(id);
    const text = qObj ? esc(qObj.text) : `<em style="opacity:.5;">[usunięte]</em>`;
    return `<div class="gs-q-item" data-id="${esc(id)}" data-idx="${i}">
      <span class="gs-q-item-handle">☰</span>
      <span class="gs-q-item-text">${text}</span>
      <button class="btn xs" type="button" data-move="-1">↑</button>
      <button class="btn xs" type="button" data-move="1">↓</button>
      <button class="gs-q-item-remove" type="button" data-remove="${esc(id)}">✕</button>
    </div>`;
  }).join("") || `<div class="gs-hint">Brak wybranych pytań.</div>`;

  const addOptions = available.map(qObj =>
    `<option value="${esc(qObj.id)}">${esc(qObj.text)}</option>`
  ).join("");

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.rounds")}</div>
    <div class="gs-section">
      <div class="gs-hint" style="margin-bottom:10px;">Pytania zostaną zadane w tej kolejności. Liczba rund = liczba wybranych pytań.</div>
      <div class="gs-q-list" id="gsRoundsQList">${orderedItems}</div>
      ${available.length > 0 ? `
        <div class="gs-add-row">
          <select class="inp" id="gsAddRoundQ">${addOptions}</select>
          <button class="btn btn-sm" id="btnAddRoundQ" type="button">${t("gameSettings.questions.addQuestion")}</button>
        </div>` : `<div class="gs-hint" style="margin-top:8px;">Wszystkie pytania zostały dodane.</div>`}
    </div>`;

  document.getElementById("gsRoundsQList")?.addEventListener("click", onQListClick.bind(null, "selectedIds", renderRounds));
  document.getElementById("btnAddRoundQ")?.addEventListener("click", () => {
    const sel = document.getElementById("gsAddRoundQ");
    if (sel?.value) {
      state.settings.questions.selectedIds.push(sel.value);
      markDirty();
      renderRounds();
    }
  });
}

/* ===== FINALE ===== */
function renderFinale() {
  const q = state.settings.questions;
  const enabled = q.hasFinal && q.finaleMode === "selected";

  if (!enabled) {
    const reason = !q.hasFinal
      ? `Finał jest wyłączony.`
      : `Pytania finału są losowane automatycznie.`;
    const hint = !q.hasFinal
      ? `Aby wybrać pytania, przejdź do <a href="#" id="linkQSettingsFinale">Pytania — Ustawienia</a> i ustaw „Gramy finał → Tak" oraz „Pytania finału → Wybierz".`
      : `Aby wybrać pytania, przejdź do <a href="#" id="linkQSettingsFinale">Pytania — Ustawienia</a> i zmień „Pytania finału → Wybierz".`;
    gsContent.innerHTML = `
      <div class="gs-cat-title">${t("gameSettings.categories.finale")}</div>
      <div class="gs-section">
        <div class="gs-hint sfx-disabled-msg">${reason}<br>${hint}</div>
      </div>`;
    document.getElementById("linkQSettingsFinale")?.addEventListener("click", (e) => {
      e.preventDefault();
      setCategory("questions");
    });
    return;
  }

  const finaleIds = q.finaleIds || [];
  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.finale")}</div>
    <div class="gs-section">
      <div class="gs-picker-card">
        <div class="gs-picker-head">
          <span class="gs-label" style="margin-bottom:0;">${t("control.finalListHint") || "Pytania finału"}</span>
          <span class="badge"><span>Finał:</span> <b id="gsFinalePickCount">${finaleIds.length}</b>/5</span>
        </div>
        <div class="gs-picker-lists">
          <div class="gs-picker-col">
            <div class="gs-picker-col-title">${t("control.finalPoolHint") || "Pytania do rozgrywki (pula)"}</div>
            <div class="gs-qrow-list" id="gsFinalPoolList"></div>
          </div>
          <div class="gs-picker-col">
            <div class="gs-picker-col-title">${t("control.finalListHint") || "Pytania finału (max 5)"}</div>
            <div class="gs-qrow-list" id="gsFinalSelectedList"></div>
          </div>
        </div>
      </div>
    </div>`;

  renderGsFinalPickerDnD();
}

function renderGsFinalPickerDnD() {
  const poolRoot = document.getElementById("gsFinalPoolList");
  const finalRoot = document.getElementById("gsFinalSelectedList");
  const countEl = document.getElementById("gsFinalePickCount");
  if (!poolRoot || !finalRoot) return;

  const finaleIds = state.settings.questions.finaleIds;
  const finaleSet = new Set(finaleIds);
  const pool = state.questions.filter(q => !finaleSet.has(q.id));
  const picked = finaleIds.map(id => questionById(id)).filter(Boolean);

  if (countEl) countEl.textContent = String(picked.length);

  function renderList(root, list, side) {
    root.innerHTML = list.length
      ? list.map(q =>
          `<div class="gs-qrow" data-id="${esc(q.id)}" draggable="true">
            <span class="meta">#${q.ord ?? ""}</span>
            <span class="txt">${esc(q.text)}</span>
          </div>`
        ).join("")
      : `<div class="gs-picker-empty">${
          side === "final" ? "Nie wybrano pytań finałowych." : "Brak dostępnych pytań."
        }</div>`;

    root.querySelectorAll(".gs-qrow").forEach(row => {
      const id = row.dataset.id;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        poolRoot.classList.remove("droptarget");
        finalRoot.classList.remove("droptarget");
      });
      row.addEventListener("click", () => {
        const ids = state.settings.questions.finaleIds;
        if (side === "final") {
          state.settings.questions.finaleIds = ids.filter(x => x !== id);
        } else {
          if (ids.length >= 5) return;
          state.settings.questions.finaleIds = [...ids, id];
        }
        markDirty();
        renderGsFinalPickerDnD();
      });
    });
  }

  function bindDropZone(root, targetSide) {
    if (root._dndBound) return;
    root._dndBound = true;
    root.addEventListener("dragover", (e) => {
      e.preventDefault();
      root.classList.add("droptarget");
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    root.addEventListener("dragleave", (e) => {
      if (root.contains(e.relatedTarget)) return;
      root.classList.remove("droptarget");
    });
    root.addEventListener("drop", (e) => {
      e.preventDefault();
      root.classList.remove("droptarget");
      const id = e.dataTransfer?.getData("text/plain");
      if (!id) return;
      const ids = state.settings.questions.finaleIds;
      if (targetSide === "final") {
        if (!ids.includes(id)) {
          if (ids.length >= 5) return;
          state.settings.questions.finaleIds = [...ids, id];
        }
      } else {
        state.settings.questions.finaleIds = ids.filter(x => x !== id);
      }
      markDirty();
      renderGsFinalPickerDnD();
    });
  }

  renderList(poolRoot, pool, "pool");
  renderList(finalRoot, picked, "final");
  bindDropZone(poolRoot, "pool");
  bindDropZone(finalRoot, "final");
}

/* ===== GAME SETTINGS ===== */
function renderGame() {
  const g = state.settings.game;
  const hasFinal = state.settings.questions.hasFinal;
  const multipliersStr = Array.isArray(g.roundMultipliers) ? g.roundMultipliers.join(", ") : "";
  const showMoney = hasFinal && g.endMode === "money";

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.game")}</div>
    <div class="gs-section">
      <div class="gs-field">
        <div class="gs-label">${t("gameSettings.game.roundMultipliers")}</div>
        <div class="gs-hint">${t("gameSettings.game.roundMultipliersHint")}</div>
        <input class="inp" id="gsRoundMultipliers" type="text" value="${esc(multipliersStr)}" style="max-width:240px;" autocomplete="off" inputmode="numeric"/>
      </div>
      <div class="gs-field" style="margin-top:14px;">
        <div class="gs-label">${t("gameSettings.game.finalMinPoints")}</div>
        <div class="gs-hint">${t("gameSettings.game.finalMinPointsHint")}</div>
        <input class="inp" id="gsFinalMinPoints" type="number" min="0" step="10" value="${g.finalMinPoints}" style="max-width:120px;"/>
      </div>
      ${hasFinal ? `
      <div class="gs-field" style="margin-top:14px;">
        <div class="gs-label">${t("gameSettings.game.finalTarget")}</div>
        <input class="inp" id="gsFinalTarget" type="number" min="0" step="10" value="${g.finalTarget}" style="max-width:120px;"/>
      </div>` : ""}
      <div class="gs-field" style="margin-top:14px;">
        <div class="gs-label">${t("gameSettings.game.endMode")}</div>
        <div class="gs-radio-group">
          <label class="gs-radio-item">
            <input type="radio" name="gsEndMode" value="logo" ${g.endMode === "logo" ? "checked" : ""}/>
            ${t("gameSettings.game.endModeLogo")}
          </label>
          <label class="gs-radio-item">
            <input type="radio" name="gsEndMode" value="points" ${g.endMode === "points" ? "checked" : ""}/>
            ${t("gameSettings.game.endModePoints")}
          </label>
          ${hasFinal ? `
          <label class="gs-radio-item">
            <input type="radio" name="gsEndMode" value="money" ${g.endMode === "money" ? "checked" : ""}/>
            ${t("gameSettings.game.endModeMoney")}
          </label>` : ""}
        </div>
      </div>
      ${showMoney ? `
      <div class="gs-field" style="margin-top:14px;">
        <div class="gs-label">${t("gameSettings.game.prizeMultiplier")}</div>
        <input class="inp" id="gsPrizeMultiplier" type="number" min="1" step="1" value="${g.prizeMultiplier}" style="max-width:120px;"/>
      </div>
      <div class="gs-field" style="margin-top:14px;">
        <div class="gs-label">${t("gameSettings.game.prizeAmount")}</div>
        <input class="inp" id="gsPrizeAmount" type="number" min="0" max="99999" step="100" value="${g.prizeAmount}" style="max-width:160px;"/>
      </div>` : ""}
      <div class="rowBtns" style="margin-top:16px;">
        <button class="btn btn-sm" id="btnGameReset" type="button">${t("gameSettings.game.restoreDefaults")}</button>
      </div>
    </div>`;

  document.getElementById("gsRoundMultipliers")?.addEventListener("change", (e) => {
    const parts = e.target.value.split(/[,\s]+/).filter(Boolean);
    state.settings.game.roundMultipliers = parts.map(p => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    });
    markDirty();
  });
  document.getElementById("gsFinalMinPoints")?.addEventListener("change", (e) => {
    state.settings.game.finalMinPoints = Math.max(0, Number(e.target.value) || 0);
    markDirty();
  });
  document.getElementById("gsFinalTarget")?.addEventListener("change", (e) => {
    state.settings.game.finalTarget = Math.max(0, Number(e.target.value) || 0);
    markDirty();
  });
  document.querySelectorAll("input[name=gsEndMode]").forEach(r => {
    r.addEventListener("change", () => {
      state.settings.game.endMode = r.value;
      markDirty();
      renderGame();
    });
  });
  document.getElementById("gsPrizeMultiplier")?.addEventListener("change", (e) => {
    state.settings.game.prizeMultiplier = Math.max(1, Number(e.target.value) || 1);
    markDirty();
  });
  document.getElementById("gsPrizeAmount")?.addEventListener("change", (e) => {
    state.settings.game.prizeAmount = Math.min(99999, Math.max(0, Number(e.target.value) || 0));
    markDirty();
  });
  document.getElementById("btnGameReset")?.addEventListener("click", () => {
    state.settings.game = { ...getDefaults(state.locale).game };
    markDirty();
    renderGame();
  });
}

/* ===== QUESTION LIST EVENT HANDLER ===== */
function onQListClick(arrayKey, rerender, e) {
  const removeBtn = e.target.closest("[data-remove]");
  const moveBtn   = e.target.closest("[data-move]");

  if (removeBtn) {
    const id = removeBtn.dataset.remove;
    state.settings.questions[arrayKey] = state.settings.questions[arrayKey].filter(x => x !== id);
    markDirty();
    rerender();
    return;
  }
  if (moveBtn) {
    const item = moveBtn.closest("[data-idx]");
    if (!item) return;
    const idx    = Number(item.dataset.idx);
    const dir    = Number(moveBtn.dataset.move);
    const arr    = state.settings.questions[arrayKey];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    markDirty();
    rerender();
  }
}

/* ===== SAVE ===== */
async function save() {
  btnSaveAll.disabled = true;
  if (btnSaveFooter) btnSaveFooter.disabled = true;
  try {
    const { error } = await saveSettings(state.gameId, state.settings);
    if (error) {
      await alertModal({ text: `${t("gameSettings.saveError")}: ${error.message}` });
      return;
    }
    markClean();
  } finally {
    btnSaveAll.disabled = false;
    if (btnSaveFooter) btnSaveFooter.disabled = false;
  }
}

/* ===== INIT ===== */
async function init() {
  // guardDesktopOnly();

  const params = new URLSearchParams(location.search);
  const gameId = params.get("id");
  if (!gameId) { location.href = "/builder-new"; return; }
  state.gameId = gameId;

  const user = await requireAuth();
  if (!user) return;

  state.locale = document.documentElement.lang || "pl";

  // Load game + all related data in parallel
  const [{ data: game, error: gameErr }, settings, { data: questions }, { data: logos }, themesJson] = await Promise.all([
    sb().from("games").select("id,name,type,owner_id,share_key_display").eq("id", gameId).single(),
    loadSettings(gameId, state.locale),
    sb().from("questions").select("id,ord,text").eq("game_id", gameId).order("ord"),
    sb().from("user_logos").select("id,name,type").eq("user_id", user.id).order("created_at", { ascending: false }),
    fetch("/display/js/themes.json").then(r => r.json()).catch(() => null),
    loadSfxManifest(),
  ]);

  if (gameErr || !game || game.owner_id !== user.id) {
    location.href = "/builder-new";
    return;
  }
  state.game = game;
  state.shareKeyDisplay = game.share_key_display || null;
  setCurrentGameId(gameId);

  gsTitle.textContent = game.name;
  document.title = `${game.name} — Ustawienia rozgrywki`;

  if (game.type === "prepared" && sidebarFinale) {
    sidebarFinale.style.display = "none";
  }

  state.settings  = settings;
  state.questions = questions || [];
  state.logos     = logos    || [];
  if (themesJson?.themes) {
    state.themes = themesJson.themes.map(e => ({
      key: e.key,
      label: typeof e.label === "object"
        ? (e.label[state.locale] ?? e.label["en"] ?? e.key)
        : String(e.label ?? e.key),
    }));
  }

  applyTranslations();
  initColorModal();

  // Events
  gsSidebar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (btn) setCategory(btn.dataset.cat);
  });

  btnBack?.addEventListener("click", async () => {
    if (state.isDirty) {
      const ok = await confirmModal({ text: t("gameSettings.unsavedConfirm") });
      if (!ok) return;
    }
    location.href = "/builder-new";
  });

  btnSaveAll?.addEventListener("click", save);
  btnSaveFooter?.addEventListener("click", save);

  setCategory("teams");
}

init().catch(console.error);
