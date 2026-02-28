/*
Settings panel (admin)
- GET  /_admin_api/me
- GET  /_admin_api/state
- POST /_admin_api/state { enabled, mode, returnAt }
- POST /_admin_api/off
- POST /_admin_api/bypass
- POST /_admin_api/bypass_off
- GET/POST /_admin_api/mail/settings
- GET /_admin_api/mail/queue
- POST /_admin_api/mail/queue/run
- GET /_admin_api/mail/logs
*/

import { initI18n, t } from "../../translation/translation.js";
import { initUiSelect } from "../core/ui-select.js";
import { guardDesktopOnly } from "../core/device-guard.js";

const API_BASE = "/_admin_api";
const TOOLS_MANIFEST = "/settings-tools/tools.json";
const POLL_MS = 15000;
const MINUTES_MIN = 10;
const MAIL_PROVIDERS = ["sendgrid", "brevo", "mailgun"];
const CRON_PRESETS = [
  { id: "1m", schedule: "* * * * *", minutes: 1 },
  { id: "2m", schedule: "*/2 * * * *", minutes: 2 },
  { id: "5m", schedule: "*/5 * * * *", minutes: 5 },
  { id: "10m", schedule: "*/10 * * * *", minutes: 10 },
  { id: "15m", schedule: "*/15 * * * *", minutes: 15 },
  { id: "30m", schedule: "*/30 * * * *", minutes: 30 },
  { id: "1h", schedule: "0 * * * *", minutes: 60 },
  { id: "2h", schedule: "0 */2 * * *", minutes: 120 },
  { id: "4h", schedule: "0 */4 * * *", minutes: 240 },
  { id: "6h", schedule: "0 */6 * * *", minutes: 360 },
  { id: "12h", schedule: "0 */12 * * *", minutes: 720 },
  { id: "24h", schedule: "0 0 * * *", minutes: 1440 },
];

const els = {
  authScreen: document.getElementById("authScreen"),
  panelScreen: document.getElementById("panelScreen"),
  authStatus: document.getElementById("authStatus"),
  btnAccessLogin: document.getElementById("btnAccessLogin"),
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
  btnTabMail: document.getElementById("btnTabMail"),
  mainWrap: document.querySelector("main.wrap"),
  footer: document.querySelector("footer.footer"),
  maintenancePanel: document.querySelector(".maintenance-panel"),
  mailPanel: document.getElementById("mailPanel"),
  maintenanceControls: document.getElementById("maintenanceControls"),
  modeStatus: document.getElementById("modeStatus"),
  modeStatusValue: document.getElementById("modeStatusValue"),
  toast: document.getElementById("toast"),
  mailQueueEnabled: document.getElementById("mailQueueEnabled"),
  mailProviderOrderList: document.getElementById("mailProviderOrderList"),
  mailDelayMs: document.getElementById("mailDelayMs"),
  mailBatchMax: document.getElementById("mailBatchMax"),
  mailWorkerLimit: document.getElementById("mailWorkerLimit"),
  mailCronPresetSelect: document.getElementById("mailCronPresetSelect"),
  mailCronHint: document.getElementById("mailCronHint"),
  mailCronActive: document.getElementById("mailCronActive"),
  mailSettingsStatus: document.getElementById("mailSettingsStatus"),
  btnMailSaveSettings: document.getElementById("btnMailSaveSettings"),
  btnMailReloadSettings: document.getElementById("btnMailReloadSettings"),
  mailRunLimit: document.getElementById("mailRunLimit"),
  btnMailRunWorker: document.getElementById("btnMailRunWorker"),
  btnMailRetryFailed: document.getElementById("btnMailRetryFailed"),
  btnMailRetrySelected: document.getElementById("btnMailRetrySelected"),
  mailQueueStatusSelect: document.getElementById("mailQueueStatusSelect"),
  mailQueueLimit: document.getElementById("mailQueueLimit"),
  btnMailQueueRefresh: document.getElementById("btnMailQueueRefresh"),
  mailQueueBody: document.getElementById("mailQueueBody"),
  mailQueueInfo: document.getElementById("mailQueueInfo"),
  mailLogFnSelect: document.getElementById("mailLogFnSelect"),
  mailLogLevelSelect: document.getElementById("mailLogLevelSelect"),
  mailLogLimit: document.getElementById("mailLogLimit"),
  btnMailLogsHelp: document.getElementById("btnMailLogsHelp"),
  btnMailLogsRefresh: document.getElementById("btnMailLogsRefresh"),
  mailLogsHelp: document.getElementById("mailLogsHelp"),
  mailLogsBody: document.getElementById("mailLogsBody"),
  mailLogsInfo: document.getElementById("mailLogsInfo"),
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
let lastUserActionTs = 0;
let activeTab = "maintenance";
let previousTabBeforeTools = "maintenance";
let mailSettingsLoaded = false;
let mailProviderOrder = [...MAIL_PROVIDERS];
let mailCronPresetValue = "5m";
let mailCronSupported = true;
let mailQueueStatusValue = "all";
let mailLogFnValue = "all";
let mailLogLevelValue = "all";
let mailCronSelect = null;
let mailQueueStatusSelect = null;
let mailLogFnSelect = null;
let mailLogLevelSelect = null;
const selectedQueueIds = new Set();
const MODE_ORDER = ["message", "returnAt", "countdown"];
const MODE_TO_INDEX = {
  message: 0,
  returnAt: 1,
  countdown: 2
};

function setText(el, value) {
  if (el) el.textContent = value;
}

function markUserAction() {
  lastUserActionTs = Date.now();
}

function shouldShowActionError() {
  return Date.now() - lastUserActionTs < 5000;
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

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
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

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseProviderOrder(raw) {
  const source = Array.isArray(raw)
    ? raw
    : String(raw || "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  const out = [];
  for (const p of source) {
    if (!MAIL_PROVIDERS.includes(p)) continue;
    if (out.includes(p)) continue;
    out.push(p);
  }
  for (const p of MAIL_PROVIDERS) {
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function scrubText(value, max = 160) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
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
  updateValidation();
  if (currentState) updateModeStatus(currentState);
  if (mode === "message") {
    const warn = document.getElementById("timeWarn");
    if (warn) warn.hidden = true;
    if (els.btnStartStop) els.btnStartStop.disabled = false;
  }
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
  updateModeStatus(state);
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
  return formatCountdown(ms);
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

async function loadState({ silent = false } = {}) {
  try {
    const res = await apiFetch(`${API_BASE}/state`, { method: "GET" });
    if (res.status === 401) {
      stopPolling();
      showAuth("settings.login.accessRequired");
      return;
    }
    if (!res.ok) throw new Error("state fetch failed");
    const data = await res.json();
    applyState(data);
  } catch (err) {
    if (silent) {
      console.warn("[settings] state poll failed", err);
      return;
    }
    if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
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
    if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
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
    if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
  }
}

async function setBypass(state) {
  const path = state === "on" ? `${API_BASE}/bypass` : `${API_BASE}/bypass_off`;
  const res = await apiFetch(path, { method: "POST" });
  if (res.ok) {
    showToast(state === "on" ? t("settings.toast.bypassOn") : t("settings.toast.bypassOff"));
  } else {
    if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
  }
}

function providerLabel(provider) {
  const key = `settings.mail.providers.${provider}`;
  const translated = t(key);
  return translated === key ? provider : translated;
}

function trOr(key, fallback) {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

function getCronPresetById(id) {
  return CRON_PRESETS.find((p) => p.id === String(id || "").trim()) || null;
}

function getCronPresetBySchedule(schedule) {
  const value = String(schedule || "").trim();
  if (!value) return null;
  return CRON_PRESETS.find((p) => p.schedule === value) || null;
}

function cronPresetLabel(preset) {
  if (!preset) return "—";
  return trOr(`settings.mail.cronPreset.${preset.id}`, `Every ${preset.minutes} min`);
}

function mailQueueStatusOptions() {
  return [
    { value: "all", label: t("settings.mail.filter.all") },
    { value: "pending", label: t("settings.mail.filter.pending") },
    { value: "sending", label: t("settings.mail.filter.sending") },
    { value: "failed", label: t("settings.mail.filter.failed") },
  ];
}

function mailLogFnOptions() {
  return [
    { value: "all", label: t("settings.mail.filter.allFunctions") },
    { value: "send-mail", label: "send-mail" },
    { value: "send-email", label: "send-email" },
    { value: "mail-worker", label: "mail-worker" },
  ];
}

function mailLogLevelOptions() {
  return [
    { value: "all", label: t("settings.mail.filter.allLevels") },
    { value: "info", label: "info" },
    { value: "warn", label: "warn" },
    { value: "error", label: "error" },
  ];
}

function syncMailSelectLabels() {
  if (mailQueueStatusSelect) {
    mailQueueStatusSelect.setOptions(mailQueueStatusOptions());
    mailQueueStatusSelect.setValue(mailQueueStatusValue, { silent: true });
  }
  if (mailLogFnSelect) {
    mailLogFnSelect.setOptions(mailLogFnOptions());
    mailLogFnSelect.setValue(mailLogFnValue, { silent: true });
  }
  if (mailLogLevelSelect) {
    mailLogLevelSelect.setOptions(mailLogLevelOptions());
    mailLogLevelSelect.setValue(mailLogLevelValue, { silent: true });
  }
}

function initMailSelects() {
  if (!mailCronSelect && els.mailCronPresetSelect) {
    mailCronSelect = initUiSelect(els.mailCronPresetSelect, {
      options: [],
      value: mailCronPresetValue,
      placeholder: "—",
      onChange: (val) => {
        mailCronPresetValue = String(val || mailCronPresetValue);
        updateCronHint();
      },
    });
  }

  if (!mailQueueStatusSelect && els.mailQueueStatusSelect) {
    mailQueueStatusSelect = initUiSelect(els.mailQueueStatusSelect, {
      options: mailQueueStatusOptions(),
      value: mailQueueStatusValue,
      placeholder: "—",
      onChange: (val) => {
        mailQueueStatusValue = String(val || "all");
        void loadMailQueue();
      },
    });
  }

  if (!mailLogFnSelect && els.mailLogFnSelect) {
    mailLogFnSelect = initUiSelect(els.mailLogFnSelect, {
      options: mailLogFnOptions(),
      value: mailLogFnValue,
      placeholder: "—",
      onChange: (val) => {
        mailLogFnValue = String(val || "all");
        void loadMailLogs();
      },
    });
  }

  if (!mailLogLevelSelect && els.mailLogLevelSelect) {
    mailLogLevelSelect = initUiSelect(els.mailLogLevelSelect, {
      options: mailLogLevelOptions(),
      value: mailLogLevelValue,
      placeholder: "—",
      onChange: (val) => {
        mailLogLevelValue = String(val || "all");
        void loadMailLogs();
      },
    });
  }
}

function renderCronPresetOptions() {
  if (!mailCronSelect) return;
  const prev = mailCronPresetValue;
  const selected = getCronPresetById(prev) || getCronPresetById("5m") || CRON_PRESETS[0];
  if (!selected) return;

  mailCronSelect.setOptions(CRON_PRESETS.map((preset) => ({ value: preset.id, label: cronPresetLabel(preset) })));
  mailCronPresetValue = selected.id;
  mailCronSelect.setValue(selected.id, { silent: true });
  mailCronSelect.setDisabled(!mailCronSupported);
  updateCronHint();
}

function updateCronHint() {
  if (!els.mailCronHint) return;
  if (!mailCronSupported) {
    els.mailCronHint.textContent = t("settings.mail.cronUnavailable");
    return;
  }
  const selected = getCronPresetById(mailCronPresetValue) || getCronPresetById("5m") || CRON_PRESETS[0];
  if (!selected) {
    els.mailCronHint.textContent = "—";
    return;
  }
  const template = trOr(
    "settings.mail.cronHint",
    "Worker będzie uruchamiany co {minutes} min (cron: {schedule})."
  );
  els.mailCronHint.textContent = template
    .replace("{minutes}", String(selected.minutes))
    .replace("{schedule}", selected.schedule);
}

function toggleMailLogsHelp() {
  if (!els.mailLogsHelp) return;
  els.mailLogsHelp.hidden = !els.mailLogsHelp.hidden;
}

function renderProviderOrder() {
  if (!els.mailProviderOrderList) return;
  els.mailProviderOrderList.innerHTML = "";
  mailProviderOrder.forEach((provider, idx) => {
    const row = document.createElement("div");
    row.className = "provider-order-row";

    const rank = document.createElement("div");
    rank.className = "provider-order-rank";
    rank.textContent = String(idx + 1);

    const name = document.createElement("div");
    name.className = "provider-order-name";
    name.textContent = providerLabel(provider);

    const actions = document.createElement("div");
    actions.className = "provider-order-actions";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn sm";
    up.textContent = "↑";
    up.disabled = idx === 0;
    up.addEventListener("click", () => {
      if (idx <= 0) return;
      const next = [...mailProviderOrder];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      mailProviderOrder = next;
      renderProviderOrder();
    });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn sm";
    down.textContent = "↓";
    down.disabled = idx >= mailProviderOrder.length - 1;
    down.addEventListener("click", () => {
      if (idx >= mailProviderOrder.length - 1) return;
      const next = [...mailProviderOrder];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      mailProviderOrder = next;
      renderProviderOrder();
    });

    actions.append(up, down);
    row.append(rank, name, actions);
    els.mailProviderOrderList?.appendChild(row);
  });
}

function updateMailSettingsStatus(cron) {
  if (!els.mailSettingsStatus) return;
  if (!cron || cron.supported === false) {
    els.mailSettingsStatus.textContent = t("settings.mail.cronUnavailable");
    return;
  }
  if (!cron.configured) {
    els.mailSettingsStatus.textContent = t("settings.mail.cronNotConfigured");
    return;
  }
  const mode = cron.active ? t("settings.mail.active") : t("settings.mail.inactive");
  const schedule = String(cron.schedule || "—");
  const preset = getCronPresetBySchedule(schedule);
  const scheduleLabel = preset ? cronPresetLabel(preset) : schedule;
  const limit = clampInt(cron.limit, 1, 200, 25);
  const limitLabel = trOr("settings.mail.limitBadge", "limit {count}").replace("{count}", String(limit));
  els.mailSettingsStatus.textContent = `${mode} • ${scheduleLabel} • ${limitLabel}`;
}

function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function queueSelectionSync(rows) {
  const valid = new Set((rows || []).map((r) => String(r.id)));
  for (const id of selectedQueueIds) {
    if (!valid.has(id)) selectedQueueIds.delete(id);
  }
}

function renderQueueRows(rows) {
  if (!els.mailQueueBody) return;
  clearChildren(els.mailQueueBody);

  if (!Array.isArray(rows) || !rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "mail-empty";
    td.textContent = t("settings.mail.emptyQueue");
    tr.appendChild(td);
    els.mailQueueBody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = `mail-status-${String(row.status || "").toLowerCase()}`;

    const tdPick = document.createElement("td");
    const pick = document.createElement("input");
    pick.type = "checkbox";
    pick.checked = selectedQueueIds.has(String(row.id));
    pick.dataset.queueId = String(row.id);
    tdPick.appendChild(pick);

    const tdStatus = document.createElement("td");
    tdStatus.textContent = String(row.status || "—");

    const tdTo = document.createElement("td");
    tdTo.textContent = String(row.to_email || "—");

    const tdSubject = document.createElement("td");
    tdSubject.textContent = scrubText(row.subject || "—", 120);

    const tdAttempts = document.createElement("td");
    tdAttempts.textContent = String(row.attempts ?? "0");

    const tdError = document.createElement("td");
    tdError.textContent = scrubText(row.last_error || "—", 180);

    const tdCreated = document.createElement("td");
    tdCreated.textContent = formatDateTime(row.created_at);

    const tdAction = document.createElement("td");
    const action = document.createElement("button");
    action.type = "button";
    action.className = "btn sm mail-row-action";
    const status = String(row.status || "").toLowerCase();
    const isSending = status === "sending";
    action.textContent = isSending ? t("settings.mail.sendingNow") : t("settings.mail.runNow");
    action.disabled = isSending;
    if (!isSending) action.dataset.queueRunId = String(row.id);
    tdAction.appendChild(action);

    tr.append(tdPick, tdStatus, tdTo, tdSubject, tdAttempts, tdError, tdCreated, tdAction);
    els.mailQueueBody?.appendChild(tr);
  });
}

function renderLogRows(rows) {
  if (!els.mailLogsBody) return;
  clearChildren(els.mailLogsBody);

  if (!Array.isArray(rows) || !rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "mail-empty";
    td.textContent = t("settings.mail.emptyLogs");
    tr.appendChild(td);
    els.mailLogsBody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = `mail-level-${String(row.level || "").toLowerCase()}`;

    const tdTime = document.createElement("td");
    tdTime.textContent = formatDateTime(row.created_at);

    const tdFn = document.createElement("td");
    tdFn.textContent = String(row.function_name || "—");

    const tdLevel = document.createElement("td");
    tdLevel.textContent = String(row.level || "—");

    const tdEvent = document.createElement("td");
    tdEvent.textContent = scrubText(row.event || "—", 80);

    const tdTo = document.createElement("td");
    tdTo.textContent = scrubText(row.recipient_email || "—", 60);

    const tdProvider = document.createElement("td");
    tdProvider.textContent = String(row.provider || "—");

    const tdError = document.createElement("td");
    tdError.textContent = scrubText(row.error || "—", 180);

    tr.append(tdTime, tdFn, tdLevel, tdEvent, tdTo, tdProvider, tdError);
    els.mailLogsBody?.appendChild(tr);
  });
}

async function loadMailSettings({ silent = false } = {}) {
  try {
    const res = await apiFetch(`${API_BASE}/mail/settings`, { method: "GET" });
    if (res.status === 401) {
      stopPolling();
      showAuth("settings.login.accessRequired");
      return false;
    }
    if (!res.ok) throw new Error(`mail settings fetch failed: ${res.status}`);
    const data = await res.json();
    const settings = data?.settings || {};
    const cron = data?.cron || null;

    mailProviderOrder = parseProviderOrder(settings.provider_order);
    renderProviderOrder();

    if (els.mailQueueEnabled) els.mailQueueEnabled.checked = settings.queue_enabled !== false;
    if (els.mailDelayMs) els.mailDelayMs.value = String(clampInt(settings.delay_ms, 0, 5000, 250));
    if (els.mailBatchMax) els.mailBatchMax.value = String(clampInt(settings.batch_max, 1, 500, 100));
    if (els.mailWorkerLimit) els.mailWorkerLimit.value = String(clampInt(settings.worker_limit, 1, 200, 25));
    if (els.mailRunLimit) els.mailRunLimit.value = String(clampInt(settings.worker_limit, 1, 200, 25));

    mailCronSupported = cron?.supported !== false;
    const selectedPreset =
      getCronPresetBySchedule(String(cron?.schedule || "")) ||
      getCronPresetById(mailCronPresetValue) ||
      getCronPresetById("5m") ||
      CRON_PRESETS[0];
    if (selectedPreset) {
      mailCronPresetValue = selectedPreset.id;
    }
    mailCronSelect?.setValue(mailCronPresetValue, { silent: true });
    mailCronSelect?.setDisabled(!mailCronSupported);
    updateCronHint();
    if (els.mailCronActive) {
      els.mailCronActive.checked = cron?.active !== false;
      els.mailCronActive.disabled = !mailCronSupported;
    }

    updateMailSettingsStatus(cron);
    mailSettingsLoaded = true;
    return true;
  } catch (err) {
    if (!silent && shouldShowActionError()) showToast(t("settings.toast.error"), "error");
    console.warn("[settings] mail settings load failed", err);
    return false;
  }
}

async function saveMailSettings() {
  const queueEnabled = els.mailQueueEnabled?.checked !== false;
  const delayMs = clampInt(els.mailDelayMs?.value, 0, 5000, 250);
  const batchMax = clampInt(els.mailBatchMax?.value, 1, 500, 100);
  const workerLimit = clampInt(els.mailWorkerLimit?.value, 1, 200, 25);
  const selectedPreset =
    getCronPresetById(mailCronPresetValue) ||
    getCronPresetById("5m") ||
    CRON_PRESETS[0];
  mailCronPresetValue = selectedPreset ? selectedPreset.id : "5m";
  const cronSchedule = selectedPreset ? selectedPreset.schedule : "*/5 * * * *";
  const cronActive = els.mailCronActive?.checked !== false;

  const payload = {
    queue_enabled: queueEnabled,
    provider_order: mailProviderOrder,
    delay_ms: delayMs,
    batch_max: batchMax,
    worker_limit: workerLimit,
  };

  if (mailCronSupported && cronSchedule) {
    payload.cron_schedule = cronSchedule;
    payload.cron_active = cronActive;
  }

  const res = await apiFetch(`${API_BASE}/mail/settings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `save failed (${res.status})`);
  }
  const data = await res.json();
  updateMailSettingsStatus(data?.cron);
  if (els.mailRunLimit) els.mailRunLimit.value = String(workerLimit);
  showToast(t("settings.toast.saved"));
}

async function loadMailQueue({ silent = false } = {}) {
  try {
    const status = String(mailQueueStatusValue || "all");
    const limit = clampInt(els.mailQueueLimit?.value, 1, 500, 150);
    const res = await apiFetch(`${API_BASE}/mail/queue?status=${encodeURIComponent(status)}&limit=${limit}`, { method: "GET" });
    if (res.status === 401) {
      stopPolling();
      showAuth("settings.login.accessRequired");
      return false;
    }
    if (!res.ok) throw new Error(`queue fetch failed: ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    queueSelectionSync(rows);
    renderQueueRows(rows);
    if (els.mailQueueInfo) {
      els.mailQueueInfo.textContent = t("settings.mail.rows").replace("{count}", String(rows.length));
    }
    return true;
  } catch (err) {
    if (!silent && shouldShowActionError()) showToast(t("settings.toast.error"), "error");
    console.warn("[settings] mail queue load failed", err);
    return false;
  }
}

async function loadMailLogs({ silent = false } = {}) {
  try {
    const fn = String(mailLogFnValue || "all");
    const level = String(mailLogLevelValue || "all");
    const limit = clampInt(els.mailLogLimit?.value, 1, 500, 200);
    const res = await apiFetch(
      `${API_BASE}/mail/logs?fn=${encodeURIComponent(fn)}&level=${encodeURIComponent(level)}&limit=${limit}`,
      { method: "GET" }
    );
    if (res.status === 401) {
      stopPolling();
      showAuth("settings.login.accessRequired");
      return false;
    }
    if (!res.ok) throw new Error(`logs fetch failed: ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    renderLogRows(rows);
    if (els.mailLogsInfo) {
      els.mailLogsInfo.textContent = t("settings.mail.rows").replace("{count}", String(rows.length));
    }
    return true;
  } catch (err) {
    if (!silent && shouldShowActionError()) showToast(t("settings.toast.error"), "error");
    console.warn("[settings] mail logs load failed", err);
    return false;
  }
}

async function runMailWorker({ requeueFailed = false, ids = [] } = {}) {
  const baseLimit = clampInt(els.mailRunLimit?.value, 1, 200, 25);
  const requestedIds = Array.isArray(ids) ? ids : [];
  const limit = requestedIds.length ? Math.min(200, Math.max(baseLimit, requestedIds.length)) : baseLimit;
  const payload = { limit };
  if (requeueFailed) payload.requeue_failed = true;
  if (requestedIds.length) payload.ids = requestedIds;

  const res = await apiFetch(`${API_BASE}/mail/queue/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `worker run failed (${res.status})`);
  }

  showToast(requestedIds.length === 1 ? t("settings.mail.singleInvoked") : t("settings.mail.workerInvoked"));
  await loadMailQueue({ silent: true });
  await loadMailLogs({ silent: true });
  setTimeout(() => {
    void loadMailQueue({ silent: true });
    void loadMailLogs({ silent: true });
  }, 2000);
}

async function refreshMailTab() {
  await loadMailSettings({ silent: true });
  await Promise.all([loadMailQueue({ silent: true }), loadMailLogs({ silent: true })]);
}

async function openMailTab() {
  if (activeTab === "tools") closeTools();
  setActiveTab("mail");
  if (!mailSettingsLoaded) {
    await loadMailSettings({ silent: true });
  }
  await Promise.all([loadMailQueue({ silent: true }), loadMailLogs({ silent: true })]);
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
  previousTabBeforeTools = activeTab === "tools" ? "maintenance" : activeTab;
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
  setActiveTab(previousTabBeforeTools || "maintenance");
}

function setActiveTab(tab) {
  activeTab = tab;
  const btn = document.getElementById("btnTabMaintenance");
  const btnMail = document.getElementById("btnTabMail");
  const tools = document.getElementById("toolsSelect");
  if (btn) btn.classList.toggle("active", tab === "maintenance");
  if (btnMail) btnMail.classList.toggle("active", tab === "mail");
  if (tools) tools.classList.toggle("active", tab === "tools");
  if (els.maintenancePanel) els.maintenancePanel.hidden = tab !== "maintenance";
  if (els.mailPanel) els.mailPanel.hidden = tab !== "mail";
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
      markUserAction();
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
      markUserAction();
      formDirty = false;
      await loadState();
    });
  }

  if (els.bypassToggle) {
    els.bypassToggle.addEventListener("change", async () => {
      markUserAction();
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
      if (currentState) updateModeStatus(currentState);
      updateReturnPreview();
    });
  });

  document.querySelectorAll(".dt-btn[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-step");
      const delta = Number(btn.getAttribute("data-delta") || "0");
      const input = id ? document.getElementById(id) : null;
      if (!input) return;
      const min = Number(input.getAttribute("min") || "0");
      const max = Number(input.getAttribute("max") || "9999");
      const curr = Number(input.value || "0");
      const next = Math.min(max, Math.max(min, curr + delta));
      input.value = String(next).padStart(input.id.includes("Year") ? 4 : 2, "0");
      const prefix = id.startsWith("returnAt") ? "returnAt" : "endAt";
      formDirty = true;
      normalizeDateFields(prefix);
      updateValidation();
      if (currentState) updateModeStatus(currentState);
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
    els.btnTabMaintenance.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("maintenance");
      await loadState({ silent: true });
    });
  }

  if (els.btnTabMail) {
    els.btnTabMail.addEventListener("click", async () => {
      await openMailTab();
    });
  }

  if (els.toolsShell) {
    els.toolsShell.addEventListener("dblclick", closeTools);
  }

  if (els.mailQueueBody) {
    els.mailQueueBody.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
      const id = String(target.dataset.queueId || "");
      if (!id) return;
      if (target.checked) selectedQueueIds.add(id);
      else selectedQueueIds.delete(id);
    });

    els.mailQueueBody.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest("button[data-queue-run-id]");
      if (!(btn instanceof HTMLButtonElement)) return;
      const id = String(btn.dataset.queueRunId || "");
      if (!id) return;
      markUserAction();
      btn.disabled = true;
      try {
        await runMailWorker({ ids: [id] });
      } catch {
        if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  els.btnMailSaveSettings?.addEventListener("click", async () => {
    markUserAction();
    try {
      await saveMailSettings();
      await refreshMailTab();
    } catch {
      if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
    }
  });

  els.btnMailReloadSettings?.addEventListener("click", async () => {
    markUserAction();
    await refreshMailTab();
  });

  els.btnMailQueueRefresh?.addEventListener("click", async () => {
    markUserAction();
    await loadMailQueue();
  });

  els.btnMailLogsRefresh?.addEventListener("click", async () => {
    markUserAction();
    await loadMailLogs();
  });

  els.btnMailLogsHelp?.addEventListener("click", () => {
    toggleMailLogsHelp();
  });

  els.btnMailRunWorker?.addEventListener("click", async () => {
    markUserAction();
    try {
      await runMailWorker();
    } catch {
      if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
    }
  });

  els.btnMailRetryFailed?.addEventListener("click", async () => {
    markUserAction();
    try {
      await runMailWorker({ requeueFailed: true });
    } catch {
      if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
    }
  });

  els.btnMailRetrySelected?.addEventListener("click", async () => {
    markUserAction();
    const ids = [...selectedQueueIds];
    if (!ids.length) {
      showToast(t("settings.mail.selectRows"), "error");
      return;
    }
    try {
      await runMailWorker({ ids });
    } catch {
      if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
    }
  });

  if (els.btnLogout) {
    els.btnLogout.addEventListener("click", () => {
      stopPolling();
      window.location.href = "/cdn-cgi/access/logout";
    });
  }

  if (els.btnAccessLogin) {
    els.btnAccessLogin.addEventListener("click", () => {
      window.location.href = "/cdn-cgi/access/login";
    });
  }
}

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  applyDateOrderByLang();
  applyModalLabels();
  setActiveTab("maintenance");
  initMailSelects();
  syncMailSelectLabels();
  renderCronPresetOptions();
  renderProviderOrder();
  guardDesktopOnly({ maxWidth: 980 });
  syncTopbarHeight();
  window.addEventListener("resize", syncTopbarHeight);
  window.addEventListener("i18n:lang", () => {
    syncTopbarHeight();
    applyDateOrderByLang();
    applyModalLabels();
    renderProviderOrder();
    syncMailSelectLabels();
    renderCronPresetOptions();
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
    if (!pollTimer) pollTimer = setInterval(() => loadState({ silent: true }), POLL_MS);
  } else {
    showAuth("settings.login.accessRequired");
  }
})();
