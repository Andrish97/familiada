import { t, applyTranslations } from "../../translation/translation.js?v=v2026-06-11T21213";
import { sb } from "../core/supabase.js?v=v2026-06-11T21213";
import { requireAuth } from "../core/auth.js?v=v2026-06-11T21213";
import { confirmModal, alertModal } from "../core/modal.js?v=v2026-06-11T21213";
import { loadSettings, saveSettings, getDefaults } from "../core/game-settings.js?v=v2026-06-11T21213";
import { guardDesktopOnly } from "../core/device-guard.js?v=v2026-06-11T21213";
import { initUiSelect } from "../core/ui-select.js?v=v2026-06-11T21213";
import { loadSfxManifest, getSfxCategories } from "../core/sfx-new.js?v=v2026-06-11T21213";

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
  else if (cat === "sound")   renderSound();
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
    sendPreviewCommands();
    flushPreviewCmds();
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
  const { logoId, theme, colors } = state.settings.display;

  const logoOptions = [
    `<option value=""${!logoId ? " selected" : ""}>${t("gameSettings.display.logoDefault")}</option>`,
    `<option value="none"${logoId === "none" ? " selected" : ""}>${t("gameSettings.display.logoNone")}</option>`,
    ...state.logos.map(l =>
      `<option value="${esc(l.id)}"${l.id === logoId ? " selected" : ""}>${esc(l.name || l.id)}</option>`
    ),
  ].join("");

  const colorDefs = [
    { key: "A",          label: t("gameSettings.display.colorA"),   val: colors.A },
    { key: "B",          label: t("gameSettings.display.colorB"),   val: colors.B },
    { key: "BACKGROUND", label: t("gameSettings.display.colorBg"),  val: colors.BACKGROUND },
    { key: "DOT",        label: t("gameSettings.display.colorDot"), val: colors.DOT },
  ];
  const colorSwatches = colorDefs.map(cd =>
    `<div class="colorItem">
       <button class="swatchBtn" id="gsSwatch${cd.key}" type="button" style="background:${esc(cd.val)};"></button>
       <span class="lbl2">${cd.label}</span>
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
        <div class="gs-field">
          <div class="gs-label">${t("gameSettings.display.logo")}</div>
          <select class="inp" id="gsLogoSelect" style="max-width:260px;">${logoOptions}</select>
        </div>
        <div class="gs-field" style="margin-top:16px;">
          <div class="gs-label">${t("gameSettings.display.colors")}</div>
          <div class="colorRow">${colorSwatches}</div>
          <button class="btn btn-sm" id="btnColorsReset" type="button" style="margin-top:10px;">${t("gameSettings.display.colorsReset")}</button>
        </div>
        ${themeOptions ? `
        <div class="gs-field" style="margin-top:16px;">
          <div class="gs-label">${t("gameSettings.display.theme")}</div>
          <div class="ui-select" id="${themeSelectId}" style="max-width:260px;">
            <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
              <span class="ui-select-label">${currentThemeLabel}</span>
              <span class="ui-select-caret" aria-hidden="true">▾</span>
            </button>
            <div class="ui-select-menu" role="listbox">${themeOptions}</div>
          </div>
        </div>` : ""}
      </div>
      <div>
        <div class="gs-label">${t("gameSettings.display.preview")}</div>
        ${hasPreview
          ? `<iframe id="gsDisplayIframe" class="display-preview" style="margin-top:8px;border:none;" scrolling="no" allowfullscreen></iframe>`
          : `<div class="display-preview display-preview-placeholder" style="margin-top:8px;"></div>`
        }
      </div>
    </div>`;

  if (hasPreview) {
    initPreviewIframe();
  }

  document.getElementById("gsLogoSelect").addEventListener("change", (e) => {
    state.settings.display.logoId = e.target.value || null;
    markDirty();
    refreshPreviewLogo();
  });

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

  // Theme select via ui-select API
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

/* ===== SOUND ===== */
function renderSound() {
  const categories = getSfxCategories();
  const lang = document.documentElement.lang || "pl";

  if (!categories.length) {
    gsContent.innerHTML = `<div class="gs-cat-title">${t("gameSettings.categories.sound")}</div><div class="gs-section"><div class="gs-hint">Ładowanie...</div></div>`;
    return;
  }

  const rows = categories.map(cat => {
    const key = cat.key;
    const vol = state.settings.sound.volumes[key] ?? 100;
    const currentVariant = state.settings.sound.variants[key] || cat.sounds[0]?.file || "";

    const optionsHtml = cat.sounds.map(s => {
      const file = s.file.split("?")[0];
      const label = typeof s.label === "object" ? (s.label[lang] ?? s.label["pl"] ?? s.file) : s.file;
      const selected = file === currentVariant ? ' data-selected="true"' : "";
      return `<div class="ui-select-option" data-value="${file}"${selected}>${label}</div>`;
    }).join("");

    const selectedSound = cat.sounds.find(s => s.file.split("?")[0] === currentVariant) || cat.sounds[0];
    const selectedLabel = selectedSound
      ? (typeof selectedSound.label === "object" ? (selectedSound.label[lang] ?? selectedSound.label["pl"] ?? selectedSound.file) : selectedSound.file)
      : currentVariant;

    const desc = t("control.sfxDesc." + key) || key;

    return `<div class="sfx-row" data-key="${key}">
      <div class="sfx-row-desc">${desc}</div>
      <div class="sfx-variant-wrap">
        <div class="ui-select" id="sfxSelect_${key}">
          <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span class="ui-select-label">${selectedLabel}</span>
            <span class="ui-select-caret" aria-hidden="true">▾</span>
          </button>
          <div class="ui-select-menu" role="listbox">${optionsHtml}</div>
        </div>
      </div>
      <button class="sfx-preview-btn" type="button" data-sfx-preview="${key}">▶</button>
      <div class="sfx-vol-wrap">
        <input type="range" class="sfx-vol" min="0" max="100" value="${vol}" data-sfx-vol="${key}"/>
        <span class="sfx-vol-label" id="sfxVolLabel_${key}">${vol}%</span>
      </div>
    </div>`;
  }).join("");

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.sound")}</div>
    <div class="gs-section">
      <div id="sfxTableGs">${rows}</div>
      <div class="rowBtns" style="margin-top:12px;">
        <button class="btn btn-sm" id="btnSoundReset" type="button">${t("gameSettings.teams.restoreDefaults")}</button>
      </div>
    </div>`;

  // Wire up sfx selects
  const tableEl = document.getElementById("sfxTableGs");

  // Close open selects when clicking outside
  const sfxOutsideClick = () => {
    tableEl?.querySelectorAll(".ui-select.open").forEach(el => el.classList.remove("open"));
  };
  document.addEventListener("click", sfxOutsideClick);

  tableEl.querySelectorAll(".ui-select").forEach(selectEl => {
    const key = selectEl.id.replace("sfxSelect_", "");
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
        selectEl.querySelector(".ui-select-label").textContent = opt.textContent;
        selectEl.classList.remove("open");
        state.settings.sound.variants[key] = file;
        markDirty();
      });
    });
  });

  // Volume sliders
  tableEl.querySelectorAll(".sfx-vol").forEach(slider => {
    slider.addEventListener("input", () => {
      const key = slider.dataset.sfxVol;
      const val = Number(slider.value);
      state.settings.sound.volumes[key] = val;
      const lbl = document.getElementById("sfxVolLabel_" + key);
      if (lbl) lbl.textContent = val + "%";
      markDirty();
    });
  });

  // Preview buttons
  tableEl.querySelectorAll("[data-sfx-preview]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sfxPreview;
      const cat = getSfxCategories().find(c => c.key === key);
      if (!cat) return;
      const variant = state.settings.sound.variants[key] || cat.sounds[0]?.file || "";
      try {
        new Audio(`/audio_new/${cat.folder}/${variant}`).play();
      } catch {}
    });
  });

  document.getElementById("btnSoundReset")?.addEventListener("click", () => {
    state.settings.sound = { ...getDefaults(state.locale).sound };
    document.removeEventListener("click", sfxOutsideClick);
    renderSound();
    markDirty();
  });
}

/* ===== ROUNDS ===== */
function renderRounds() {
  const q = state.settings.questions;
  const isOrdered = q.mode === "ordered";
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
      <div class="gs-field">
        <div class="gs-label">Tryb pytań rund</div>
        <div class="toggle-group">
          <label class="toggle-item">
            <input type="radio" name="gsRoundsMode" value="random" ${!isOrdered ? "checked" : ""}/>
            <span class="toggle-slider" data-text="${t("gameSettings.questions.modeRandom")}"></span>
          </label>
          <label class="toggle-item">
            <input type="radio" name="gsRoundsMode" value="ordered" ${isOrdered ? "checked" : ""}/>
            <span class="toggle-slider" data-text="${t("gameSettings.questions.modeOrdered")}"></span>
          </label>
        </div>
      </div>

      <div id="gsRoundsRandom" ${isOrdered ? 'style="display:none"' : ""}>
        <div class="gs-count-row">
          <div class="gs-label">${t("gameSettings.questions.countPerRound")}</div>
          <select class="inp" id="gsRoundCount" style="width:auto;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n =>
              `<option value="${n}" ${q.count === n ? "selected" : ""}>${n}</option>`
            ).join("")}
          </select>
          <div class="gs-label" style="margin-left:12px;">${t("gameSettings.questions.roundsCount")}</div>
          <select class="inp" id="gsRoundsCount" style="width:auto;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n =>
              `<option value="${n}" ${q.roundsCount === n ? "selected" : ""}>${n}</option>`
            ).join("")}
          </select>
        </div>
      </div>

      <div id="gsRoundsOrdered" ${!isOrdered ? 'style="display:none"' : ""}>
        <div class="gs-hint" style="margin-bottom:6px;">Pytania zostaną zadane w tej kolejności. Liczba rund = liczba wybranych pytań.</div>
        <div class="gs-q-list" id="gsRoundsQList">${orderedItems}</div>
        ${available.length > 0 ? `
          <div class="gs-add-row">
            <select class="inp" id="gsAddRoundQ">${addOptions}</select>
            <button class="btn btn-sm" id="btnAddRoundQ" type="button">${t("gameSettings.questions.addQuestion")}</button>
          </div>` : `<div class="gs-hint" style="margin-top:8px;">Wszystkie pytania dodane.</div>`}
      </div>
    </div>`;

  document.querySelectorAll("input[name=gsRoundsMode]").forEach(r => {
    r.addEventListener("change", () => {
      state.settings.questions.mode = r.value;
      markDirty();
      renderRounds();
    });
  });
  document.getElementById("gsRoundCount")?.addEventListener("change", (e) => {
    state.settings.questions.count = Number(e.target.value);
    markDirty();
  });
  document.getElementById("gsRoundsCount")?.addEventListener("change", (e) => {
    state.settings.questions.roundsCount = Number(e.target.value);
    markDirty();
  });
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
function doRandomizeFinale() {
  const q = state.settings.questions;
  const count = q.finaleCount || 5;
  const selectedSet = new Set(q.selectedIds);
  const pool = state.questions.filter(qObj => !selectedSet.has(qObj.id));
  if (!pool.length) return;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = shuffled.slice(0, count).map(qObj => qObj.id);
  q.selectedIds = q.selectedIds.filter(id => !picked.includes(id));
  q.finaleIds = picked;
  markDirty();
  renderFinale();
}

function renderFinale() {
  const q = state.settings.questions;
  const { hasFinal, finaleMode, finaleCount, finaleIds } = q;

  const finaleSet = new Set(finaleIds);
  const finalePool = state.questions.filter(qObj => !finaleSet.has(qObj.id));

  let finaleBody = "";
  if (hasFinal) {
    const isSelected = finaleMode === "selected";
    let pickSection = "";

    if (isSelected) {
      const selectedItems = finaleIds.map((id, i) => {
        const qObj = questionById(id);
        const text = qObj ? esc(qObj.text) : `<em style="opacity:.5;">[usunięte]</em>`;
        return `<div class="gs-q-item" data-id="${esc(id)}" data-idx="${i}">
          <span class="gs-q-item-handle">☰</span>
          <span class="gs-q-item-text">${text}</span>
          <button class="btn xs" type="button" data-move="-1">↑</button>
          <button class="btn xs" type="button" data-move="1">↓</button>
          <button class="gs-q-item-remove" type="button" data-remove="${esc(id)}">✕</button>
        </div>`;
      }).join("") || `<div class="gs-hint">Brak wybranych pytań finałowych.</div>`;
      const addOptions = finalePool.map(qObj =>
        `<option value="${esc(qObj.id)}">${esc(qObj.text)}</option>`
      ).join("");
      pickSection = `
        <div class="gs-q-list" id="gsFinaleQList">${selectedItems}</div>
        ${finalePool.length > 0 ? `
          <div class="gs-add-row">
            <select class="inp" id="gsAddFinaleQ">${addOptions}</select>
            <button class="btn btn-sm" id="btnAddFinaleQ" type="button">${t("gameSettings.questions.addFinaleQuestion")}</button>
          </div>` : ""}`;
    } else {
      if (!finaleIds.length) {
        pickSection = `<button class="btn btn-sm gold" id="btnFinaleRandomize" type="button">${t("gameSettings.finale.randomize").replace("{n}", finaleCount || 5)}</button>`;
      } else {
        const lockedItems = finaleIds.map(id => {
          const qObj = questionById(id);
          const text = qObj ? esc(qObj.text) : `<em style="opacity:.5;">[usunięte]</em>`;
          return `<div class="gs-q-item"><span class="gs-q-item-text">${text}</span></div>`;
        }).join("");
        pickSection = `
          <div class="gs-hint" style="margin-bottom:6px;">${t("gameSettings.finale.randomLocked")}</div>
          <div class="gs-q-list">${lockedItems}</div>
          <button class="btn btn-sm" id="btnFinaleReRandomize" type="button" style="margin-top:8px;">${t("gameSettings.finale.rerandomize")}</button>`;
      }
    }

    finaleBody = `
      <div class="gs-field" style="margin-top:16px;">
        <div class="gs-label">${t("gameSettings.questions.finaleTitle")}</div>
        <div class="toggle-group">
          <label class="toggle-item">
            <input type="radio" name="gsFinaleQMode" value="random" ${!isSelected ? "checked" : ""}/>
            <span class="toggle-slider" data-text="${t("gameSettings.questions.finaleModeRandom")}"></span>
          </label>
          <label class="toggle-item">
            <input type="radio" name="gsFinaleQMode" value="selected" ${isSelected ? "checked" : ""}/>
            <span class="toggle-slider" data-text="${t("gameSettings.questions.finaleModeSelected")}"></span>
          </label>
        </div>
      </div>
      ${!isSelected ? `
      <div class="gs-field" style="margin-top:10px;">
        <div class="gs-label">${t("gameSettings.questions.finaleCount")}</div>
        <select class="inp" id="gsFinaleCount" style="width:auto;">
          ${[1,2,3,4,5,6,7,8,9,10].map(n =>
            `<option value="${n}" ${finaleCount === n ? "selected" : ""}>${n}</option>`
          ).join("")}
        </select>
      </div>` : ""}
      <div class="gs-field" style="margin-top:12px;">${pickSection}</div>`;
  } else {
    finaleBody = `<div class="gs-hint" style="margin-top:12px;">${t("gameSettings.finale.disabled")}</div>`;
  }

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("gameSettings.categories.finale")}</div>
    <div class="gs-section">
      <div class="gs-field">
        <div class="gs-label">${t("gameSettings.finale.hasFinal")}</div>
        <div class="toggle-group">
          <label class="toggle-item">
            <input type="radio" name="gsHasFinal" value="yes" ${hasFinal ? "checked" : ""}/>
            <span class="toggle-slider" data-text="${t("gameSettings.finale.yes")}"></span>
          </label>
          <label class="toggle-item">
            <input type="radio" name="gsHasFinal" value="no" ${!hasFinal ? "checked" : ""}/>
            <span class="toggle-slider" data-text="${t("gameSettings.finale.no")}"></span>
          </label>
        </div>
      </div>
      ${finaleBody}
    </div>`;

  document.querySelectorAll("input[name=gsHasFinal]").forEach(r => {
    r.addEventListener("change", () => {
      state.settings.questions.hasFinal = r.value === "yes";
      markDirty();
      renderFinale();
    });
  });
  document.querySelectorAll("input[name=gsFinaleQMode]").forEach(r => {
    r.addEventListener("change", () => {
      state.settings.questions.finaleMode = r.value;
      if (r.value === "random") state.settings.questions.finaleIds = [];
      markDirty();
      renderFinale();
    });
  });
  document.getElementById("gsFinaleCount")?.addEventListener("change", (e) => {
    state.settings.questions.finaleCount = Number(e.target.value);
    markDirty();
  });
  document.getElementById("btnFinaleRandomize")?.addEventListener("click", doRandomizeFinale);
  document.getElementById("btnFinaleReRandomize")?.addEventListener("click", doRandomizeFinale);
  document.getElementById("gsFinaleQList")?.addEventListener("click", onQListClick.bind(null, "finaleIds", renderFinale));
  document.getElementById("btnAddFinaleQ")?.addEventListener("click", () => {
    const sel = document.getElementById("gsAddFinaleQ");
    if (!sel?.value) return;
    const id = sel.value;
    state.settings.questions.finaleIds.push(id);
    state.settings.questions.selectedIds = state.settings.questions.selectedIds.filter(x => x !== id);
    markDirty();
    renderFinale();
  });
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

  // Load game
  const { data: game, error: gameErr } = await sb()
    .from("games")
    .select("id,name,type,owner_id,share_key_display")
    .eq("id", gameId)
    .single();

  if (gameErr || !game || game.owner_id !== user.id) {
    location.href = "/builder-new";
    return;
  }
  state.game = game;
  state.shareKeyDisplay = game.share_key_display || null;

  gsTitle.textContent = game.name;
  document.title = `${game.name} — Ustawienia rozgrywki`;

  if (game.type === "prepared" && sidebarFinale) {
    sidebarFinale.style.display = "none";
  }

  // Load settings, questions, logos, themes, sfx manifest in parallel
  const [settings, { data: questions }, { data: logos }, themesJson] = await Promise.all([
    loadSettings(gameId, state.locale),
    sb().from("questions").select("id,ord,text").eq("game_id", gameId).order("ord"),
    sb().from("user_logos").select("id,name,type").eq("user_id", user.id).order("created_at", { ascending: false }),
    fetch("/display/js/themes.json").then(r => r.json()).catch(() => null),
    loadSfxManifest(),
  ]);

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
    history.back();
  });

  btnSaveAll?.addEventListener("click", save);
  btnSaveFooter?.addEventListener("click", save);

  setCategory("teams");
}

init().catch(console.error);
