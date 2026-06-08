// game-settings/js/app.js

import { t, applyTranslations } from "../../translation/translation.js?v=v2026-06-07T17254";
import { sb } from "../../js/core/supabase.js?v=v2026-06-07T17254";
import { requireAuth } from "../../js/core/auth.js?v=v2026-06-07T17254";
import { confirmModal, alertModal } from "../../js/core/modal.js?v=v2026-06-07T17254";
import { loadSettings, saveSettings, getDefaults } from "../../js/core/game-settings.js?v=v2026-06-07T17254";

const SFX_KEYS = [
  "show_intro", "round_transition", "round_transition2", "final_theme",
  "buzzer_press", "answer_correct", "answer_wrong", "answer_repeat", "time_over", "bells",
];

/* ===== STATE ===== */
const state = {
  gameId:   null,
  game:     null,
  settings: null,
  questions: [],
  logos:    [],
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
  if (cat === "teams")   renderTeams();
  else if (cat === "display") renderDisplay();
  else if (cat === "sound")   renderSound();
  else if (cat === "rounds")  renderRounds();
  else if (cat === "finale")  renderFinale();
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
    <div class="gs-cat-title">${t("settings.categories.teams")}</div>
    <div class="gs-section">
      <div class="gs-field">
        <label class="gs-label" for="gsTeamA">${t("settings.teams.nameA")}</label>
        <input class="inp" id="gsTeamA" type="text" maxlength="30" value="${esc(nameA)}"/>
      </div>
      <div class="gs-field">
        <label class="gs-label" for="gsTeamB">${t("settings.teams.nameB")}</label>
        <input class="inp" id="gsTeamB" type="text" maxlength="30" value="${esc(nameB)}"/>
      </div>
      <div class="rowBtns" style="margin-top:12px;">
        <button class="btn btn-sm" id="btnTeamsReset" type="button">${t("settings.teams.restoreDefaults")}</button>
      </div>
    </div>`;

  document.getElementById("gsTeamA").addEventListener("input", (e) => {
    state.settings.teams.nameA = e.target.value;
    markDirty();
  });
  document.getElementById("gsTeamB").addEventListener("input", (e) => {
    state.settings.teams.nameB = e.target.value;
    markDirty();
  });
  document.getElementById("btnTeamsReset").addEventListener("click", () => {
    const def = getDefaults(state.locale).teams;
    state.settings.teams = { ...def };
    renderTeams();
    markDirty();
  });
}

/* ===== DISPLAY ===== */
function renderDisplay() {
  const { logoId, frameMode } = state.settings.display;
  const logoOptions = [
    `<option value=""${!logoId ? " selected" : ""}>${t("settings.display.logoDefault")}</option>`,
    ...state.logos.map(l =>
      `<option value="${esc(l.id)}"${l.id === logoId ? " selected" : ""}>${esc(l.name || l.id)}</option>`
    ),
  ].join("");

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("settings.categories.display")}</div>
    <div class="gs-section gs-display-cols">
      <div>
        <div class="gs-field">
          <div class="gs-label">${t("settings.display.logo")}</div>
          <select class="inp" id="gsLogoSelect" style="max-width:260px;">${logoOptions}</select>
        </div>
        <div class="gs-field" style="margin-top:16px;">
          <div class="gs-label">${t("settings.display.frameMode")}</div>
          <div class="gs-frame-radios">
            <label class="gs-radio-item">
              <input type="radio" name="gsFrameMode" value="classic" ${frameMode !== "minimal" ? "checked" : ""}/>
              ${t("settings.display.frameModeClassic")}
            </label>
            <label class="gs-radio-item">
              <input type="radio" name="gsFrameMode" value="minimal" ${frameMode === "minimal" ? "checked" : ""}/>
              ${t("settings.display.frameModeMinimal")}
            </label>
          </div>
        </div>
      </div>
      <div>
        <div class="gs-label">${t("settings.display.preview")}</div>
        <div class="display-preview" id="gsDisplayPreview" style="margin-top:8px;"></div>
      </div>
    </div>`;

  updateDisplayPreview();

  document.getElementById("gsLogoSelect").addEventListener("change", (e) => {
    state.settings.display.logoId = e.target.value || null;
    markDirty();
  });
  document.querySelectorAll("input[name=gsFrameMode]").forEach(r => {
    r.addEventListener("change", (e) => {
      state.settings.display.frameMode = e.target.value;
      markDirty();
    });
  });
}

function updateDisplayPreview() {
  const el = document.getElementById("gsDisplayPreview");
  if (!el) return;
  const { nameA, nameB } = state.settings.teams;
  el.innerHTML = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:10px 12px;color:#fff;font-family:monospace;">
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="width:32px;height:32px;border:1px solid rgba(255,255,255,.15);border-radius:4px;background:#111;
          display:flex;align-items:center;justify-content:center;font-size:7px;opacity:.4;flex-shrink:0;">LOGO</div>
        <div style="flex:1;">
          <div style="height:6px;background:rgba(255,255,255,.13);border-radius:3px;margin-bottom:5px;"></div>
          <div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;width:65%;"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;background:rgba(255,255,255,.07);border-radius:6px;padding:6px 8px;">
          <div style="font-size:8px;opacity:.5;margin-bottom:2px;">${esc(nameA || "A")}</div>
          <div style="font-size:13px;font-weight:700;">0</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,.07);border-radius:6px;padding:6px 8px;">
          <div style="font-size:8px;opacity:.5;margin-bottom:2px;">${esc(nameB || "B")}</div>
          <div style="font-size:13px;font-weight:700;">0</div>
        </div>
      </div>
    </div>`;
}

/* ===== SOUND ===== */
function renderSound() {
  const volumes = state.settings.sound.volumes;

  const rows = SFX_KEYS.map(key => {
    const vol = volumes[key] ?? 100;
    return `
      <div class="gs-sfx-name">${t("control.sfxDesc." + key)}</div>
      <div class="gs-vol-wrap">
        <input type="range" min="0" max="100" step="1" value="${vol}"
          class="gs-vol-slider" data-key="${key}" />
        <span class="gs-vol-val" id="gsVol-${key}">${vol}%</span>
      </div>`;
  }).join("");

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("settings.categories.sound")}</div>
    <div class="gs-section">
      <div class="gs-sfx-table">
        <div class="gs-sfx-head">Dźwięk</div>
        <div class="gs-sfx-head" style="text-align:right;">Głośność</div>
        ${rows}
      </div>
      <div class="rowBtns" style="margin-top:16px;">
        <button class="btn btn-sm" id="btnSoundReset" type="button">${t("settings.teams.restoreDefaults")}</button>
      </div>
    </div>`;

  gsContent.querySelectorAll(".gs-vol-slider").forEach(slider => {
    slider.addEventListener("input", () => {
      const key = slider.dataset.key;
      const val = Number(slider.value);
      state.settings.sound.volumes[key] = val;
      const lbl = document.getElementById("gsVol-" + key);
      if (lbl) lbl.textContent = val + "%";
      markDirty();
    });
  });

  document.getElementById("btnSoundReset").addEventListener("click", () => {
    state.settings.sound.volumes = { ...getDefaults(state.locale).sound.volumes };
    renderSound();
    markDirty();
  });
}

/* ===== ROUNDS ===== */
function renderRounds() {
  const q = state.settings.questions;
  const isOrdered = q.mode === "ordered";
  const selectedSet = new Set(q.selectedIds);
  const available = state.questions.filter(qObj => !selectedSet.has(qObj.id));

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
    <div class="gs-cat-title">${t("settings.categories.rounds")}</div>
    <div class="gs-section">
      <div class="gs-field">
        <div class="gs-label">Tryb pytań rund</div>
        <div class="gs-radio-group">
          <label class="gs-radio-item">
            <input type="radio" name="gsRoundsMode" value="random" ${!isOrdered ? "checked" : ""}/>
            ${t("settings.questions.modeRandom")}
          </label>
          <label class="gs-radio-item">
            <input type="radio" name="gsRoundsMode" value="ordered" ${isOrdered ? "checked" : ""}/>
            ${t("settings.questions.modeOrdered")}
          </label>
        </div>
      </div>

      <div id="gsRoundsRandom" ${isOrdered ? 'style="display:none"' : ""}>
        <div class="gs-count-row">
          <div class="gs-label">${t("settings.questions.countPerRound")}</div>
          <select class="inp" id="gsRoundCount" style="width:auto;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n =>
              `<option value="${n}" ${q.count === n ? "selected" : ""}>${n}</option>`
            ).join("")}
          </select>
          <div class="gs-label" style="margin-left:12px;">${t("settings.questions.roundsCount")}</div>
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
            <button class="btn btn-sm" id="btnAddRoundQ" type="button">${t("settings.questions.addQuestion")}</button>
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
function renderFinale() {
  const q = state.settings.questions;
  const isSelected = q.finaleMode === "selected";
  const finaleSet = new Set(q.finaleIds);
  const available = state.questions.filter(qObj => !finaleSet.has(qObj.id));

  const selectedItems = q.finaleIds.map((id, i) => {
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

  const addOptions = available.map(qObj =>
    `<option value="${esc(qObj.id)}">${esc(qObj.text)}</option>`
  ).join("");

  gsContent.innerHTML = `
    <div class="gs-cat-title">${t("settings.categories.finale")}</div>
    <div class="gs-section">
      <div class="gs-field">
        <div class="gs-label">Tryb pytań finałowych</div>
        <div class="gs-radio-group">
          <label class="gs-radio-item">
            <input type="radio" name="gsFinaleMode" value="random" ${!isSelected ? "checked" : ""}/>
            ${t("settings.questions.finaleModeRandom")}
          </label>
          <label class="gs-radio-item">
            <input type="radio" name="gsFinaleMode" value="selected" ${isSelected ? "checked" : ""}/>
            ${t("settings.questions.finaleModeSelected")}
          </label>
        </div>
      </div>

      <div id="gsFinaleRandom" ${isSelected ? 'style="display:none"' : ""}>
        <div class="gs-count-row">
          <div class="gs-label">${t("settings.questions.finaleCount")}</div>
          <select class="inp" id="gsFinaleCount" style="width:auto;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n =>
              `<option value="${n}" ${q.finaleCount === n ? "selected" : ""}>${n}</option>`
            ).join("")}
          </select>
        </div>
      </div>

      <div id="gsFinaleSelected" ${!isSelected ? 'style="display:none"' : ""}>
        <div class="gs-hint" style="margin-bottom:6px;">Pytania finałowe w ustalonej kolejności.</div>
        <div class="gs-q-list" id="gsFinaleQList">${selectedItems}</div>
        ${available.length > 0 ? `
          <div class="gs-add-row">
            <select class="inp" id="gsAddFinaleQ">${addOptions}</select>
            <button class="btn btn-sm" id="btnAddFinaleQ" type="button">${t("settings.questions.addFinaleQuestion")}</button>
          </div>` : `<div class="gs-hint" style="margin-top:8px;">Wszystkie pytania dodane.</div>`}
      </div>
    </div>`;

  document.querySelectorAll("input[name=gsFinaleMode]").forEach(r => {
    r.addEventListener("change", () => {
      state.settings.questions.finaleMode = r.value;
      markDirty();
      renderFinale();
    });
  });
  document.getElementById("gsFinaleCount")?.addEventListener("change", (e) => {
    state.settings.questions.finaleCount = Number(e.target.value);
    markDirty();
  });
  document.getElementById("gsFinaleQList")?.addEventListener("click", onQListClick.bind(null, "finaleIds", renderFinale));
  document.getElementById("btnAddFinaleQ")?.addEventListener("click", () => {
    const sel = document.getElementById("gsAddFinaleQ");
    if (sel?.value) {
      state.settings.questions.finaleIds.push(sel.value);
      markDirty();
      renderFinale();
    }
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
      await alertModal({ text: `${t("settings.saveError")}: ${error.message}` });
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
    .select("id,name,type,owner_id")
    .eq("id", gameId)
    .single();

  if (gameErr || !game || game.owner_id !== user.id) {
    location.href = "/builder-new";
    return;
  }
  state.game = game;

  gsTitle.textContent = game.name;
  document.title = `${game.name} — Ustawienia rozgrywki`;

  if (game.type === "prepared" && sidebarFinale) {
    sidebarFinale.style.display = "none";
  }

  // Load settings, questions, logos in parallel
  const [settings, { data: questions }, { data: logos }] = await Promise.all([
    loadSettings(gameId, state.locale),
    sb().from("questions").select("id,ord,text").eq("game_id", gameId).order("ord"),
    sb().from("user_logos").select("id,name,type").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  state.settings  = settings;
  state.questions = questions || [];
  state.logos     = logos    || [];

  applyTranslations();

  // Events
  gsSidebar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (btn) setCategory(btn.dataset.cat);
  });

  btnBack?.addEventListener("click", async () => {
    if (state.isDirty) {
      const ok = await confirmModal({ text: t("settings.unsavedConfirm") });
      if (!ok) return;
    }
    history.back();
  });

  btnSaveAll?.addEventListener("click", save);
  btnSaveFooter?.addEventListener("click", save);

  setCategory("teams");
}

init().catch(console.error);
