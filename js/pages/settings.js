/*
Settings panel (admin)
- GET  /_admin_api/me
- POST /_admin_api/login { username, password }
- POST /_admin_api/logout
- GET  /_admin_api/state
- POST /_admin_api/state { enabled, mode, returnAt }
- POST /_admin_api/off
- POST /_admin_api/bypass
- POST /_admin_api/bypass_off
*/

import { initI18n, t } from "../../translation/translation.js";
import { confirmModal } from "../core/modal.js";
import { initUiSelect } from "../core/ui-select.js";
import { guardDesktopOnly } from "../core/device-guard.js";

const API_BASE = "/_admin_api";
const TOOLS_MANIFEST = "/settings-tools/tools.json";
const POLL_MS = 15000;
const MINUTES_MIN = 10;

const els = {
  authScreen: document.getElementById("authScreen"),
  panelScreen: document.getElementById("panelScreen"),
  authStatus: document.getElementById("authStatus"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  loginError: document.getElementById("loginError"),
  btnLogout: document.getElementById("btnLogout"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnStartStop: document.getElementById("btnStartStop"),
  bypassToggle: document.getElementById("bypassToggle"),
  statusValue: document.getElementById("statusValue"),
  modeSlider: document.getElementById("modeSlider"),
  modeLabels: document.getElementById("modeLabels"),
  modeMessage: document.getElementById("modeMessage"),
  modeReturnAt: document.getElementById("modeReturnAt"),
  modeCountdown: document.getElementById("modeCountdown"),
  modeSliderWrap: document.getElementById("modeSliderWrap"),
  returnAtInput: document.getElementById("returnAtInput"),
  endAtInput: document.getElementById("endAtInput"),
  countdownNow: document.getElementById("countdownNow"),
  toolsShell: document.getElementById("toolsShell"),
  toolsFrame: document.getElementById("toolsFrame"),
  toolsSelect: document.getElementById("toolsSelect"),
  btnTabMaintenance: document.getElementById("btnTabMaintenance"),
  mainWrap: document.querySelector("main.wrap"),
  footer: document.querySelector("footer.footer"),
  maintenancePanel: document.querySelector(".maintenance-panel"),
  maintenanceControls: document.getElementById("maintenanceControls"),
  modeStatus: document.getElementById("modeStatus"),
  modeStatusValue: document.getElementById("modeStatusValue"),
  toast: document.getElementById("toast"),
};

let currentState = null;
let currentMode = "message";
let toastTimer = null;
let uiSelect = null;
let toolsOptions = null;
let pollTimer = null;
let countdownTimer = null;
let formDirty = false;
let topbarSync = null;
let activePicker = null;
let pickerState = { year: null, month: null, day: null };
let wheelReady = false;
const MODE_ORDER = ["message", "returnAt", "countdown"];
const MODE_TO_INDEX = {
  message: 0,
  returnAt: 1,
  countdown: 2
};

function setText(el, value) {
  if (el) el.textContent = value;
}

function showAuth(statusKey) {
  els.authScreen.hidden = false;
  els.panelScreen.hidden = true;
  document.body.classList.add("settings-locked");
  document.body.classList.add("no-footer-line");
  moveLangSwitcher(true);
  setText(els.authStatus, t(statusKey));
}

function showPanel() {
  els.authScreen.hidden = true;
  els.panelScreen.hidden = false;
  document.body.classList.remove("settings-locked");
  document.body.classList.remove("no-footer-line");
  moveLangSwitcher(false);
}

function moveLangSwitcher(locked) {
  const switcher = document.querySelector(".lang-switcher");
  if (!switcher) return;

  if (locked) {
    switcher.classList.add("lang-floating");
    document.body.appendChild(switcher);
    return;
  }

  const target = document.querySelector(".topbar .topbar-section-3");
  if (target) {
    switcher.classList.remove("lang-floating");
    target.prepend(switcher);
  }
}

function showToast(message, kind = "success") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove("success", "error", "show");
  els.toast.classList.add(kind);
  void els.toast.offsetWidth;
  els.toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
    cache: "no-store",
  });
  return res;
}

async function checkMe() {
  try {
    const res = await apiFetch(`${API_BASE}/me`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromDatetimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const lang = (document.documentElement.lang || "").toLowerCase();
  if (lang.startsWith("en")) return formatCountdownEn(totalSeconds);
  if (lang.startsWith("uk")) return formatCountdownUk(totalSeconds);
  if (!lang.startsWith("pl")) {
    if (totalSeconds < 3600) {
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return `${minutes}:${seconds}`;
    }
    if (totalSeconds < 86400) {
      const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return `${hours}:${minutes}:${seconds}`;
    }
    const days = Math.floor(totalSeconds / 86400);
    if (totalSeconds < 86400 * 7) {
      const rem = totalSeconds % 86400;
      const hours = String(Math.floor(rem / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((rem % 3600) / 60)).padStart(2, "0");
      return `${days}d ${hours}:${minutes}`;
    }
    return `${days}d`;
  }
  const mins = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalSeconds / 3600);
  const days = Math.floor(totalSeconds / 86400);
  if (days > 0) return `${days} ${pluralPl(days, "dzień", "dni", "dni")}`;
  if (hours > 0) return `${hours} ${pluralPl(hours, "godzina", "godziny", "godzin")}`;
  if (mins > 0) return `${mins} ${pluralPl(mins, "minuta", "minuty", "minut")}`;
  return `${totalSeconds} ${pluralPl(totalSeconds, "sekunda", "sekundy", "sekund")}`;
}

function pluralPl(n, one, few, many) {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

function pluralUk(n, one, few, many) {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

function formatCountdownEn(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalSeconds / 3600);
  const days = Math.floor(totalSeconds / 86400);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  if (mins > 0) return `${mins} minute${mins === 1 ? "" : "s"}`;
  return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
}

function formatCountdownUk(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalSeconds / 3600);
  const days = Math.floor(totalSeconds / 86400);
  if (days > 0) return `${days} ${pluralUk(days, "день", "дні", "днів")}`;
  if (hours > 0) return `${hours} ${pluralUk(hours, "година", "години", "годин")}`;
  if (mins > 0) return `${mins} ${pluralUk(mins, "хвилина", "хвилини", "хвилин")}`;
  return `${totalSeconds} ${pluralUk(totalSeconds, "секунда", "секунди", "секунд")}`;
}

function formatReturnAtValue(date) {
  if (!date) return "—";
  const lang = (document.documentElement.lang || "").toLowerCase();
  if (lang.startsWith("en")) return formatReturnAtEn(date);
  if (lang.startsWith("uk")) return formatReturnAtUk(date);
  if (!lang.startsWith("pl")) {
    const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    return fmt.format(date);
  }
  const pad = (n) => String(n).padStart(2, "0");
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const today = new Date();
  const sameDay =
    today.getFullYear() === date.getFullYear() &&
    today.getMonth() === date.getMonth() &&
    today.getDate() === date.getDate();
  if (sameDay) return `o ${hh}:${mm}`;
  if (date.getHours() === 0 && date.getMinutes() === 0) return `${d}.${m}.${y}`;
  return `${d}.${m}.${y} o ${hh}:${mm}`;
}

function formatReturnAtEn(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const mo = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const yy = date.getFullYear();
  const today = new Date();
  const sameDay =
    today.getFullYear() === date.getFullYear() &&
    today.getMonth() === date.getMonth() &&
    today.getDate() === date.getDate();
  const datePart = `${mo}/${dd}/${yy}`;
  if (sameDay) return `at ${hh}:${mm}`;
  if (date.getHours() === 0 && date.getMinutes() === 0) return `on ${datePart}`;
  return `on ${datePart} at ${hh}:${mm}`;
}

function formatReturnAtUk(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const today = new Date();
  const sameDay =
    today.getFullYear() === date.getFullYear() &&
    today.getMonth() === date.getMonth() &&
    today.getDate() === date.getDate();
  const datePart = `${d}.${m}.${y}`;
  if (sameDay) return `о ${hh}:${mm}`;
  if (date.getHours() === 0 && date.getMinutes() === 0) return datePart;
  return `${datePart} о ${hh}:${mm}`;
}

function formatReturnPreview(date) {
  if (!date) return "—";
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return t("settings.preview.ready");
  return t("settings.preview.at").replace("{time}", formatReturnAtValue(date));
}

function minAllowedDate() {
  return new Date(Date.now() + MINUTES_MIN * 60 * 1000);
}

function roundToNext10Minutes(date = new Date()) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  const next = Math.ceil(m / 10) * 10;
  if (next === 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(next);
  }
  return d;
}

function getFieldValue(prefix) {
  const y = document.getElementById(`${prefix}Year`);
  const m = document.getElementById(`${prefix}Month`);
  const d = document.getElementById(`${prefix}Day`);
  const h = document.getElementById(`${prefix}Hour`);
  const min = document.getElementById(`${prefix}Minute`);
  if (!y || !m || !d || !h || !min) return null;
  const yy = Number(y.value);
  const mm = Number(m.value);
  const dd = Number(d.value);
  const hh = Number(h.value);
  const mi = Number(min.value);
  if (!yy || !mm || !dd || Number.isNaN(hh) || Number.isNaN(mi)) return null;
  const date = new Date(yy, mm - 1, dd, hh, mi, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function setFieldValue(prefix, date) {
  if (!date) return;
  const y = document.getElementById(`${prefix}Year`);
  const m = document.getElementById(`${prefix}Month`);
  const d = document.getElementById(`${prefix}Day`);
  const h = document.getElementById(`${prefix}Hour`);
  const min = document.getElementById(`${prefix}Minute`);
  if (!y || !m || !d || !h || !min) return;
  y.value = String(date.getFullYear());
  m.value = String(date.getMonth() + 1).padStart(2, "0");
  d.value = String(date.getDate()).padStart(2, "0");
  h.value = String(date.getHours()).padStart(2, "0");
  min.value = String(date.getMinutes()).padStart(2, "0");
}

function ensureDefaults(prefix) {
  const hasAny = ["Year","Month","Day","Hour","Minute"].some((k) => {
    const el = document.getElementById(`${prefix}${k}`);
    return el && el.value;
  });
  if (!hasAny) setFieldValue(prefix, roundToNext10Minutes(new Date()));
}

function isValidFuture(prefix) {
  const date = getFieldValue(prefix);
  if (!date) return false;
  return date.getTime() >= minAllowedDate().getTime();
}

function clampField(id, min, max) {
  const el = document.getElementById(id);
  if (!el) return;
  const n = Number(el.value);
  if (Number.isNaN(n)) return;
  const v = Math.min(Math.max(n, min), max);
  el.value = String(v).padStart(2, "0");
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function normalizeDateFields(prefix) {
  const y = document.getElementById(`${prefix}Year`);
  const m = document.getElementById(`${prefix}Month`);
  const d = document.getElementById(`${prefix}Day`);
  if (!y || !m || !d) return;
  const yy = Number(y.value);
  const mm = Number(m.value);
  if (!yy || !mm) return;
  const dim = daysInMonth(yy, mm);
  clampField(`${prefix}Month`, 1, 12);
  clampField(`${prefix}Day`, 1, dim);
  clampField(`${prefix}Hour`, 0, 23);
  clampField(`${prefix}Minute`, 0, 59);
}

function openPicker(prefix) {
  activePicker = prefix;
  const modal = document.getElementById("dtModal");
  if (!modal) return;
  const current = getFieldValue(prefix) || minAllowedDate();
  pickerState = {
    year: current.getFullYear(),
    month: current.getMonth() + 1,
    day: current.getDate(),
  };
  initTimeWheels();
  setWheelValue("dtHourWheel", current.getHours());
  setWheelValue("dtMinuteWheel", current.getMinutes());
  renderCalendar();
  modal.hidden = false;
}

function closePicker() {
  const modal = document.getElementById("dtModal");
  if (modal) modal.hidden = true;
}

function rearrangeDateFields(prefix, order, sepChar) {
  const anchor = document.getElementById(`${prefix}Day`);
  const group = anchor ? anchor.closest(".dt-group") : null;
  if (!group) return;
  const day = document.getElementById(`${prefix}Day`);
  const month = document.getElementById(`${prefix}Month`);
  const year = document.getElementById(`${prefix}Year`);
  if (!day || !month || !year) return;
  const dots = Array.from(group.querySelectorAll(".dt-dot"));
  if (dots.length >= 1) dots[0].textContent = sepChar;
  if (dots.length >= 2) dots[1].textContent = sepChar;
  [day, month, year, ...dots].forEach((el) => el.remove());
  const map = { day, month, year };
  order.forEach((key, idx) => {
    group.appendChild(map[key]);
    if (idx < order.length - 1 && dots[idx]) {
      group.appendChild(dots[idx]);
    }
  });
}

function applyDateOrderByLang() {
  const lang = (document.documentElement.lang || "").toLowerCase();
  if (lang.startsWith("en")) {
    rearrangeDateFields("returnAt", ["month", "day", "year"], "/");
    rearrangeDateFields("endAt", ["month", "day", "year"], "/");
  } else {
    rearrangeDateFields("returnAt", ["day", "month", "year"], ".");
    rearrangeDateFields("endAt", ["day", "month", "year"], ".");
  }
}

function applyModalLabels() {
  const set = (id, key, fallback) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = t(key);
    el.textContent = val && val !== key ? val : fallback;
  };
  set("dtToday", "settings.actions.today", "Dziś");
  set("dtCancel", "settings.actions.cancel", "Anuluj");
  set("dtOk", "settings.actions.ok", "OK");
  set("dtTimeLabel", "settings.actions.time", "Czas");
}

function renderCalendar() {
  const title = document.getElementById("dtTitle");
  const grid = document.getElementById("dtGrid");
  if (!grid) return;
  const year = pickerState.year;
  const month = pickerState.month;
  if (title) title.textContent = `${year}-${String(month).padStart(2, "0")}`;
  grid.innerHTML = "";
  const firstDay = new Date(year, month - 1, 1).getDay() || 7;
  const days = daysInMonth(year, month);
  const lang = document.documentElement.lang || undefined;
  const weekdayFmt = new Intl.DateTimeFormat(lang, { weekday: "short" });
  const monday = new Date(2020, 10, 2);
  const labels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return weekdayFmt.format(d);
  });
  labels.forEach((l) => {
    const el = document.createElement("div");
    el.className = "dt-day dt-day--label";
    el.textContent = l;
    grid.appendChild(el);
  });
  for (let i = 1; i < firstDay; i += 1) {
    const pad = document.createElement("div");
    pad.className = "dt-day dt-day--pad";
    grid.appendChild(pad);
  }
  for (let d = 1; d <= days; d += 1) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "dt-day";
    if (d === pickerState.day) el.classList.add("is-active");
    el.textContent = String(d);
    el.addEventListener("click", () => {
      pickerState.day = d;
      renderCalendar();
    });
    grid.appendChild(el);
  }
}

function initTimeWheels() {
  if (wheelReady) return;
  const hourWheel = document.getElementById("dtHourWheel");
  const minuteWheel = document.getElementById("dtMinuteWheel");
  if (!hourWheel || !minuteWheel) return;

  const build = (wheel, max) => {
    wheel.innerHTML = "";
    for (let i = 0; i <= max; i += 1) {
      const item = document.createElement("div");
      item.className = "dt-wheel-item";
      item.textContent = String(i).padStart(2, "0");
      item.dataset.value = String(i);
      item.addEventListener("click", () => {
        setWheelValue(wheel.id, i);
      });
      wheel.appendChild(item);
    }
    let raf = null;
    wheel.addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        updateWheelActive(wheel);
        raf = null;
      });
    }, { passive: true });
  };

  build(hourWheel, 23);
  build(minuteWheel, 59);
  wheelReady = true;
}

function setWheelValue(wheelId, value) {
  const wheel = document.getElementById(wheelId);
  if (!wheel) return;
  const itemHeight = 32;
  wheel.scrollTop = value * itemHeight;
  updateWheelActive(wheel);
}

function snapWheel(wheel) {
  updateWheelActive(wheel);
}

function updateWheelActive(wheel, idxOverride) {
  const itemHeight = 32;
  const idx = typeof idxOverride === "number" ? idxOverride : Math.round(wheel.scrollTop / itemHeight);
  const clamped = Math.max(0, Math.min(idx, wheel.children.length - 1));
  Array.from(wheel.children).forEach((el, i) => {
    el.classList.toggle("is-active", i === clamped);
  });
}

function getWheelValue(wheelId) {
  const wheel = document.getElementById(wheelId);
  if (!wheel) return 0;
  const itemHeight = 32;
  const idx = Math.round(wheel.scrollTop / itemHeight);
  return Math.max(0, Math.min(idx, wheel.children.length - 1));
}

function animateWheelTo() {}

function setMode(mode) {
  currentMode = mode;
  if (els.modeSlider) {
    const idx = MODE_TO_INDEX[mode] ?? 0;
    els.modeSlider.value = String(idx);
  }
  if (els.modeLabels) {
    els.modeLabels.querySelectorAll(".mode-label").forEach((label) => {
      label.classList.toggle("active", label.dataset.mode === mode);
    });
  }
  if (els.modeMessage) els.modeMessage.hidden = mode !== "message";
  if (els.modeReturnAt) els.modeReturnAt.hidden = mode !== "returnAt";
  if (els.modeCountdown) els.modeCountdown.hidden = mode !== "countdown";
}

function setLocked(locked) {
  if (els.modeSlider) {
    els.modeSlider.disabled = locked;
  }
  if (els.modeSliderWrap) {
    els.modeSliderWrap.classList.toggle("is-locked", locked);
  }
  if (els.modeLabels) {
    els.modeLabels.classList.toggle("is-disabled", locked);
  }
  if (els.returnAtInput) els.returnAtInput.disabled = locked;
  if (els.endAtInput) els.endAtInput.disabled = locked;
  if (els.btnRefresh) els.btnRefresh.disabled = false;
  if (els.maintenanceControls) {
    els.maintenanceControls.classList.toggle("is-locked", locked);
  }
}

function updateStatus(state) {
  if (!state) {
    setText(els.statusValue, "—");
    return;
  }
  if (!state.enabled || state.mode === "off") {
    setText(els.statusValue, t("settings.status.off"));
    if (els.modeStatus) els.modeStatus.hidden = true;
    return;
  }
  const modeLabel = t(`settings.status.mode_${state.mode}`);
  setText(els.statusValue, `${t("settings.status.on")} • ${modeLabel}`);
  updateModeStatus(state);
}

function updateStartStop(state) {
  const enabled = Boolean(state?.enabled);
  if (els.btnStartStop) {
    els.btnStartStop.dataset.state = enabled ? "on" : "off";
    els.btnStartStop.textContent = enabled ? t("settings.actions.stop") : t("settings.actions.start");
  }
  setLocked(enabled);
}

function applyState(state) {
  if (formDirty) {
    updateStatus(state);
    updateStartStop(state);
    return;
  }
  currentState = state;
  const mode = state?.mode || "message";
  setMode(mode === "off" ? "message" : mode);
  if (state?.returnAt) {
    const date = new Date(state.returnAt);
    setFieldValue("returnAt", date);
    setFieldValue("endAt", date);
  } else {
    ensureDefaults("returnAt");
    ensureDefaults("endAt");
  }
  updateStatus(state);
  updateStartStop(state);
  updateCountdownDisplay();
  updateReturnPreview();
}

function buildPayload() {
  if (currentMode === "message") {
    return { enabled: true, mode: "message", returnAt: null };
  }
  if (currentMode === "returnAt") {
    const date = getFieldValue("returnAt");
    return { enabled: true, mode: "returnAt", returnAt: date ? date.toISOString() : null };
  }
  if (currentMode === "countdown") {
    const date = getFieldValue("endAt");
    return { enabled: true, mode: "countdown", returnAt: date ? date.toISOString() : null };
  }
  return { enabled: true, mode: "message", returnAt: null };
}

function formatCountdownDisplay(ms) {
  const lang = (document.documentElement.lang || "").toLowerCase();
  const value = formatCountdown(ms);
  if (lang.startsWith("en")) return `in ${value}`;
  if (lang.startsWith("uk")) return `через ${value}`;
  if (lang.startsWith("pl")) return `za ${value}`;
  return value;
}

function updateReturnPreview() {
  const row = document.getElementById("returnPreview");
  const val = document.getElementById("returnPreviewValue");
  if (!row || !val) return;
  if (currentMode !== "returnAt") {
    row.hidden = true;
    return;
  }
  const date = getFieldValue("returnAt");
  if (!date) {
    row.hidden = true;
    return;
  }
  row.hidden = false;
  val.textContent = formatReturnPreview(date);
}

function updateModeStatus(state) {
  if (!els.modeStatus || !els.modeStatusValue) return;
  if (!state?.enabled || state.mode === "off" || state.mode === "message") {
    els.modeStatus.hidden = true;
    return;
  }
  const date = state.returnAt ? new Date(state.returnAt) : null;
  if (state.mode === "returnAt") {
    els.modeStatus.hidden = false;
    els.modeStatusValue.textContent = date ? formatReturnAtValue(date) : "—";
    return;
  }
  if (state.mode === "countdown") {
    els.modeStatus.hidden = false;
    if (!date || Number.isNaN(date.getTime())) {
      els.modeStatusValue.textContent = "—";
      return;
    }
    const diff = date.getTime() - Date.now();
    if (diff <= 0) {
      els.modeStatusValue.textContent = t("settings.preview.ready");
      return;
    }
    els.modeStatusValue.textContent = formatCountdownDisplay(diff);
  }
}

function startCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (currentState?.enabled && currentState.mode === "countdown") {
      updateModeStatus(currentState);
    }
  }, 1000);
}

async function loadState() {
  try {
    const res = await apiFetch(`${API_BASE}/state`, { method: "GET" });
    if (res.status === 401) {
      showAuth("settings.login.passwordTitle");
      return;
    }
    if (!res.ok) throw new Error("state fetch failed");
    const data = await res.json();
    applyState(data);
  } catch {
    showToast(t("settings.toast.error"), "error");
  }
}

async function startMaintenance() {
  const payload = buildPayload();
  try {
    const res = await apiFetch(`${API_BASE}/state`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("save failed");
    const data = await res.json();
    applyState(data);
    showToast(t("settings.toast.saved"));
  } catch {
    showToast(t("settings.toast.error"), "error");
  }
}

function updateValidation() {
  const warn = document.getElementById("timeWarn");
  if (currentMode === "message") {
    if (warn) warn.hidden = true;
    if (els.btnStartStop) els.btnStartStop.disabled = false;
    return;
  }
  let ok = true;
  if (currentMode === "returnAt") ok = isValidFuture("returnAt");
  if (currentMode === "countdown") ok = isValidFuture("endAt");
  if (warn) warn.hidden = ok;
  if (els.btnStartStop) {
    const blocked = !ok && !currentState?.enabled;
    els.btnStartStop.disabled = blocked;
  }
}

async function stopMaintenance() {
  try {
    const res = await apiFetch(`${API_BASE}/off`, { method: "POST" });
    if (!res.ok) throw new Error("off failed");
    const data = await res.json();
    applyState(data);
    const now = roundToNext10Minutes(new Date());
    setFieldValue("returnAt", now);
    setFieldValue("endAt", now);
    showToast(t("settings.toast.saved"));
  } catch {
    showToast(t("settings.toast.error"), "error");
  }
}

async function setBypass(state) {
  const path = state === "on" ? `${API_BASE}/bypass` : `${API_BASE}/bypass_off`;
  const res = await apiFetch(path, { method: "POST" });
  if (res.ok) {
    showToast(state === "on" ? t("settings.toast.bypassOn") : t("settings.toast.bypassOff"));
  } else {
    showToast(t("settings.toast.error"), "error");
  }
}

async function loadToolsManifest() {
  try {
    const res = await fetch(TOOLS_MANIFEST, { cache: "no-store" });
    if (!res.ok) throw new Error("manifest fetch failed");
    const data = await res.json();
    if (!data || !Array.isArray(data.tools)) throw new Error("invalid manifest");
    const items = data.tools
      .filter((t) => t && typeof t.title === "string" && typeof t.path === "string")
      .map((t) => ({ value: t.path, label: labelFromPath(t.path) }));
    if (items.length) return items;
  } catch {
    // fall back to static list
  }
  return [
    { value: "/settings-tools/editor_5x7.html", label: labelFromPath("/settings-tools/editor_5x7.html") },
    { value: "/settings-tools/exporterandeditor.html", label: labelFromPath("/settings-tools/exporterandeditor.html") },
    { value: "/settings-tools/kora-builder.html", label: labelFromPath("/settings-tools/kora-builder.html") },
  ];
}

async function initToolsSelect() {
  const items = await loadToolsManifest();
  toolsOptions = [{ value: "", label: t("settings.tools.placeholder") }, ...items];

  uiSelect = initUiSelect(els.toolsSelect, {
    options: toolsOptions,
    value: "",
    placeholder: t("settings.tabs.tools"),
    onChange: (val) => {
      if (!val) return;
      openTool(val);
    },
  });
}

function openTool(path) {
  if (!els.toolsShell || !els.toolsFrame) return;
  els.toolsShell.hidden = false;
  els.toolsFrame.src = path;
  if (els.panelScreen) els.panelScreen.hidden = true;
  if (els.mainWrap) els.mainWrap.classList.add("is-hidden");
  if (els.footer) els.footer.classList.add("is-hidden");
  document.body.classList.add("tools-fullscreen");
  syncTopbarHeight();
  setActiveTab("tools");
}

function closeTools() {
  if (!els.toolsShell || !els.toolsFrame) return;
  els.toolsFrame.src = "about:blank";
  els.toolsShell.hidden = true;
  if (els.panelScreen) els.panelScreen.hidden = false;
  if (els.mainWrap) els.mainWrap.classList.remove("is-hidden");
  if (els.footer) els.footer.classList.remove("is-hidden");
  document.body.classList.remove("tools-fullscreen");
  if (uiSelect) uiSelect.setValue("", { silent: true });
  syncTopbarHeight();
  setActiveTab("maintenance");
}

function setActiveTab(tab) {
  const btn = document.getElementById("btnTabMaintenance");
  const tools = document.getElementById("toolsSelect");
  if (btn) btn.classList.toggle("active", tab === "maintenance");
  if (tools) tools.classList.toggle("active", tab === "tools");
}

function labelFromPath(pathname) {
  const raw = pathname.split("/").pop() || pathname;
  return raw.replace(/\.html$/i, "");
}

function syncTopbarHeight() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  const h = Math.ceil(topbar.getBoundingClientRect().height || 0);
  document.body.style.setProperty("--topbar-h", `${h}px`);
}

function wireEvents() {
  const markDirty = () => {
    formDirty = true;
  };

  if (els.returnAtInput) {
    els.returnAtInput.addEventListener("input", markDirty);
  }
  if (els.endAtInput) {
    els.endAtInput.addEventListener("input", markDirty);
  }
  if (els.modeSlider) {
    els.modeSlider.addEventListener("input", markDirty);
  }

  if (els.modeSlider) {
    els.modeSlider.addEventListener("input", () => {
      const idx = Number(els.modeSlider.value) || 0;
      setMode(MODE_ORDER[idx] || "message");
    });
  }
  if (els.modeLabels) {
    els.modeLabels.querySelectorAll(".mode-label").forEach((label) => {
      label.addEventListener("click", () => {
        if (els.modeSlider?.disabled) return;
        const mode = label.dataset.mode || "message";
        setMode(mode);
      });
    });
  }

  if (els.btnStartStop) {
    els.btnStartStop.addEventListener("click", async () => {
      updateValidation();
      if (els.btnStartStop.disabled) return;
      if (currentState?.enabled) {
        await stopMaintenance();
      } else {
        await startMaintenance();
      }
      formDirty = false;
    });
  }

  if (els.btnRefresh) {
    els.btnRefresh.addEventListener("click", async () => {
      formDirty = false;
      await loadState();
    });
  }

  if (els.bypassToggle) {
    els.bypassToggle.addEventListener("change", async () => {
      const state = els.bypassToggle.checked ? "on" : "off";
      await setBypass(state);
    });
  }

  ["returnAtYear","returnAtMonth","returnAtDay","returnAtHour","returnAtMinute","endAtYear","endAtMonth","endAtDay","endAtHour","endAtMinute"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      formDirty = true;
      const prefix = id.startsWith("returnAt") ? "returnAt" : "endAt";
      normalizeDateFields(prefix);
      updateValidation();
      updateCountdownDisplay();
      updateReturnPreview();
    });
  });

  document.querySelectorAll(".dt-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-dt-open");
      if (target) openPicker(target);
    });
  });

  document.getElementById("dtCancel")?.addEventListener("click", closePicker);
  document.getElementById("dtToday")?.addEventListener("click", () => {
    const now = new Date();
    pickerState.year = now.getFullYear();
    pickerState.month = now.getMonth() + 1;
    pickerState.day = now.getDate();
    setWheelValue("dtHourWheel", now.getHours());
    setWheelValue("dtMinuteWheel", now.getMinutes());
    renderCalendar();
  });
  document.getElementById("dtPrev")?.addEventListener("click", () => {
    pickerState.month -= 1;
    if (pickerState.month <= 0) {
      pickerState.month = 12;
      pickerState.year -= 1;
    }
    renderCalendar();
  });
  document.getElementById("dtNext")?.addEventListener("click", () => {
    pickerState.month += 1;
    if (pickerState.month >= 13) {
      pickerState.month = 1;
      pickerState.year += 1;
    }
    renderCalendar();
  });
  document.getElementById("dtOk")?.addEventListener("click", () => {
    const hh = getWheelValue("dtHourWheel");
    const mm = getWheelValue("dtMinuteWheel");
    const date = new Date(pickerState.year, pickerState.month - 1, pickerState.day, hh, mm, 0, 0);
    if (activePicker) {
      setFieldValue(activePicker, date);
      formDirty = true;
      updateValidation();
      if (currentState) updateModeStatus(currentState);
    }
    closePicker();
  });

  if (els.btnTabMaintenance) {
    els.btnTabMaintenance.addEventListener("click", () => {
      closeTools();
    });
  }

  if (els.toolsShell) {
    els.toolsShell.addEventListener("dblclick", closeTools);
  }

  if (els.btnLogout) {
    els.btnLogout.addEventListener("click", async () => {
      const ok = await confirmModal({
        title: t("settings.logoutConfirmTitle"),
        text: t("settings.logoutConfirmText"),
        okText: t("settings.logoutConfirmOk"),
        cancelText: t("settings.logoutConfirmCancel"),
      });
      if (!ok) return;
      await apiFetch(`${API_BASE}/logout`, { method: "POST" });
      showAuth("settings.login.checking");
      showToast(t("settings.toast.logout"));
    });
  }

  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setText(els.loginError, "");
    const username = els.loginUsername.value || "";
    const password = els.loginPassword.value || "";
    if (!username) {
      setText(els.loginError, t("settings.login.usernameMissing"));
      return;
    }
    if (!password) {
      setText(els.loginError, t("settings.login.passwordMissing"));
      return;
    }
    try {
      const res = await apiFetch(`${API_BASE}/login`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error("login failed");
      showPanel();
      formDirty = false;
      await loadState();
      if (!pollTimer) pollTimer = setInterval(loadState, POLL_MS);
    } catch {
      setText(els.loginError, t("settings.login.loginInvalid"));
    }
  });
}

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  applyDateOrderByLang();
  applyModalLabels();
  guardDesktopOnly({ maxWidth: 980 });
  syncTopbarHeight();
  window.addEventListener("resize", syncTopbarHeight);
  window.addEventListener("i18n:lang", () => {
    syncTopbarHeight();
    applyDateOrderByLang();
    applyModalLabels();
    renderCalendar();
    if (currentState) updateModeStatus(currentState);
  });
  startCountdownTimer();
  await initToolsSelect();
  wireEvents();
  showAuth("settings.login.checking");

  const ok = await checkMe();
  if (ok) {
    showPanel();
    await loadState();
    pollTimer = setInterval(loadState, POLL_MS);
  } else {
    showAuth("settings.login.passwordTitle");
  }
})();
