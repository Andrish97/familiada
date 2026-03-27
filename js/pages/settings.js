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
import { confirmModal } from "../core/modal.js";
import { sb } from "../core/supabase.js";

const API_BASE = "/_admin_api";
const TOOLS_MANIFEST = "/settings-tools/tools.json";
const POLL_MS = 15000;
const MINUTES_MIN = 10;
const MAIL_PROVIDERS = ["sendgrid", "brevo", "mailgun", "ses"];
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
  btnTabMarketplace: document.getElementById("btnTabMarketplace"),
  btnTabRatings: document.getElementById("btnTabRatings"),
  btnTabStats: document.getElementById("btnTabStats"),
  btnTabGenerator: document.getElementById("btnTabGenerator"),
  btnTabReports: document.getElementById("btnTabReports"),
  mainWrap: document.querySelector("main.wrap"),
  footer: document.querySelector("footer.footer"),
  maintenancePanel: document.querySelector(".maintenance-panel"),
  mailPanel: document.getElementById("mailPanel"),
  marketplacePanel: document.getElementById("marketplacePanel"),
  ratingsPanel: document.getElementById("ratingsPanel"),
  statsPanel: document.getElementById("statsPanel"),
  generatorPanel: document.getElementById("generatorPanel"),
  reportsPanel: document.getElementById("reportsPanel"),
  btnRatingsRefresh: document.getElementById("btnRatingsRefresh"),
  btnStatsRefresh: document.getElementById("btnStatsRefresh"),
  ratingsTableBody: document.getElementById("ratingsTableBody"),
  ratingsTableInfo: document.getElementById("ratingsTableInfo"),
  ratingsGlobalStats: document.getElementById("ratingsGlobalStats"),
  statUsersTotal: document.getElementById("statUsersTotal"),
  statUsersGrowth: document.getElementById("statUsersGrowth"),
  statUsersLangs: document.getElementById("statUsersLangs"),
  statGamesTotal: document.getElementById("statGamesTotal"),
  statGamesActivity: document.getElementById("statGamesActivity"),
  statGamesQuality: document.getElementById("statGamesQuality"),
  statPlayedTotal: document.getElementById("statPlayedTotal"),
  statPlayedPeriods: document.getElementById("statPlayedPeriods"),
  statBuzzerActivity: document.getElementById("statBuzzerActivity"),
  statRating: document.getElementById("statRating"),
  statRatingsTotal: document.getElementById("statRatingsTotal"),
  statHealthMails: document.getElementById("statHealthMails"),
  statsUpdateTs: document.getElementById("statsUpdateTs"),
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
  mailLogPerPage: document.getElementById("mailLogPerPage"),
  mailLogsPagination: document.getElementById("mailLogsPagination"),
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
let mailLogsPage = 1;
let mailLogsPerPage = 50;
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
  } catch(e) {
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

async function loadAdminStats({ silent = false } = {}) {
  if (!silent) setStatus("Ładowanie statystyk…");
  try {
    const { data, error } = await sb().rpc("get_admin_stats");
    if (error) throw error;

    if (els.statUsersTotal) els.statUsersTotal.textContent = data.users.total;
    if (els.statUsersGrowth) els.statUsersGrowth.textContent = `Dziś: ${data.users.new_today} | 7 dni: ${data.users.new_7d} | 30 dni: ${data.users.new_30d}`;
    if (els.statUsersLangs) els.statUsersLangs.textContent = `PL: ${data.users.langs.pl} | EN: ${data.users.langs.en} | UK: ${data.users.langs.uk}`;

    if (els.statGamesTotal) els.statGamesTotal.textContent = data.games.total;
    if (els.statGamesActivity) els.statGamesActivity.textContent = `Nowe 7d: ${data.games.new_7d} | Gotowe: ${data.games.ready}`;
    if (els.statGamesQuality) els.statGamesQuality.textContent = `Śr. pytań: ${data.games.avg_q}`;

    if (els.statPlayedTotal) els.statPlayedTotal.textContent = data.gameplay.played_30d;
    if (els.statPlayedPeriods) els.statPlayedPeriods.textContent = `Dziś: ${data.gameplay.played_today} | 7d: ${data.gameplay.played_7d} | 30d: ${data.gameplay.played_30d}`;
    if (els.statBuzzerActivity) els.statBuzzerActivity.textContent = `Buzzer 7d: ${data.gameplay.buzzer_7d} | Sesje ankiet 7d: ${data.polls.sessions_7d}`;

    if (els.statRating) els.statRating.textContent = `${data.ratings.average} / 5`;
    if (els.statRatingsTotal) els.statRatingsTotal.textContent = `Ocen: ${data.ratings.total}`;
    if (els.statHealthMails) els.statHealthMails.textContent = `Błędy maili (24h): ${data.health.mail_errors}`;
    
    if (els.statsUpdateTs) {
      const date = new Date(data.timestamp).toLocaleString();
      els.statsUpdateTs.textContent = `Ostatnia aktualizacja: ${date}`;
    }
  } catch (e) {
    console.error("[settings] loadAdminStats error:", e);
  } finally {
    if (!silent) setStatus(t("settings.status.loaded") || "Załadowano");
  }
}

function pct(part, total) {
  if (!total) return "0%";
  return Math.round((part / total) * 100) + "%";
}

function renderRetentionTable(data) {
  const tbody = document.getElementById("retentionTable");
  if (!tbody) return;
  const { activation, retention } = data;
  const total = activation.total || 1;
  const d7pct  = retention.d7.cohort  ? Math.round(retention.d7.returned  / retention.d7.cohort  * 100) : null;
  const d30pct = retention.d30.cohort ? Math.round(retention.d30.returned / retention.d30.cohort * 100) : null;

  const row = (label, value, percent, color) => `
    <tr>
      <td style="padding:5px 0;opacity:.6;font-size:12px">${label}</td>
      <td style="padding:5px 0;text-align:right;font-weight:700">${value}</td>
      <td style="padding:5px 0;text-align:right;padding-left:10px;font-size:12px;color:${color || "inherit"};opacity:.7">${percent}</td>
    </tr>`;

  tbody.innerHTML = `
    ${row("Aktywowani (stworz. grę)", activation.activated, pct(activation.activated, total), "#4caf50")}
    ${row("Nigdy aktywni", activation.never_active, pct(activation.never_active, total), "#ff5722")}
    <tr><td colspan="3" style="padding:6px 0 2px"><div style="border-top:1px solid rgba(255,255,255,.08)"></div></td></tr>
    ${row(
      `Retencja D7 <span style="opacity:.4;font-size:11px">(z ${retention.d7.cohort})</span>`,
      retention.d7.returned,
      d7pct !== null ? d7pct + "%" : "—",
      d7pct >= 30 ? "#4caf50" : d7pct >= 10 ? "#ffc107" : "#ff5722"
    )}
    ${row(
      `Retencja D30 <span style="opacity:.4;font-size:11px">(z ${retention.d30.cohort})</span>`,
      retention.d30.returned,
      d30pct !== null ? d30pct + "%" : "—",
      d30pct >= 20 ? "#4caf50" : d30pct >= 5 ? "#ffc107" : "#ff5722"
    )}`;
}

function renderSegmentBars(segments, total) {
  const el = document.getElementById("segmentBars");
  if (!el) return;
  const items = [
    { label: "Aktywni ≤7d",     count: segments.active_7d,    color: "#4caf50" },
    { label: "Aktywni 8–30d",   count: segments.active_8_30d, color: "#ffc107" },
    { label: "Uśpieni 30d+",    count: segments.dormant,      color: "#ff5722" },
    { label: "Brak aktywności", count: segments.never,        color: "rgba(255,255,255,.25)" },
  ];
  el.innerHTML = items.map(({ label, count, color }) => {
    const p = total > 0 ? Math.round(count / total * 100) : 0;
    return `<div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="opacity:.7">${label}</span>
        <span style="font-weight:700">${count} <span style="opacity:.45;font-weight:400;font-size:11px">${p}%</span></span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${p}%;background:${color};border-radius:3px;transition:width .5s"></div>
      </div>
    </div>`;
  }).join("");
}

function renderTrendChart(trend) {
  const chartEl = document.getElementById("trendChart");
  const labelsEl = document.getElementById("trendLabels");
  if (!chartEl || !labelsEl) return;

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = (trend || []).find(t => t.day === key);
    days.push({ day: key, count: found?.count ?? 0 });
  }

  const maxCount = Math.max(...days.map(d => d.count), 1);

  chartEl.innerHTML = days.map(({ day, count }) => {
    const h = count > 0 ? Math.max(Math.round((count / maxCount) * 100), 4) : 0;
    return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
      <div title="${day}: ${count}" style="width:100%;height:${h}%;background:var(--gold);border-radius:2px 2px 0 0;opacity:.8;min-height:${count > 0 ? "3px" : "0"}"></div>
    </div>`;
  }).join("");

  labelsEl.innerHTML = days.map(({ day }, i) => {
    const show = i === 0 || i === 6 || i === 13;
    return `<div style="flex:1;font-size:9px;opacity:.4;text-align:center;overflow:hidden;white-space:nowrap">${show ? day.slice(5) : ""}</div>`;
  }).join("");
}

async function loadRetentionStats() {
  try {
    const { data, error } = await sb().rpc("get_retention_stats");
    if (error) throw error;
    renderRetentionTable(data);
    renderSegmentBars(data.segments, data.activation.total);
    renderTrendChart(data.trend_users);
  } catch (e) {
    console.error("[settings] loadRetentionStats error:", e);
  }
}

async function loadRatings({ silent = false } = {}) {
  if (!silent) setStatus("Ładowanie ocen…");
  if (els.ratingsTableBody) els.ratingsTableBody.innerHTML = "";
  if (els.ratingsTableInfo) els.ratingsTableInfo.textContent = "";

  try {
    // Load stats
    const { data: statsData, error: statsError } = await sb().rpc("get_app_rating_stats");
    if (statsError) throw statsError;
    const stats = Array.isArray(statsData) ? statsData[0] : statsData;
    if (els.ratingsGlobalStats && stats) {
      els.ratingsGlobalStats.innerHTML = `Średnia: ${stats.avg_stars}/5 ⭐ | Łącznie: ${stats.total_count}`;
    }

    // Load detailed ratings
    const { data, error } = await sb()
      .from("app_ratings")
      .select("*, profiles(username, email)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      if (els.ratingsTableBody) els.ratingsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;opacity:.5">Brak ocen.</td></tr>';
      return;
    }

    if (els.ratingsTableBody) {
      els.ratingsTableBody.innerHTML = rows.map(r => {
        const date = new Date(r.created_at).toLocaleString();
        const user = r.profiles?.username || r.profiles?.email || "Nieznany";
        const stars = "★".repeat(r.stars) + "☆".repeat(5 - r.stars);
        return `
          <tr>
            <td style="font-size:11px;opacity:.7">${date}</td>
            <td style="font-weight:900">${esc(user)}</td>
            <td style="color:var(--gold)">${stars}</td>
            <td style="font-size:13px">${esc(r.comment || "-")}</td>
          </tr>
        `;
      }).join("");
    }
  } catch (e) {
    console.error("[settings] loadRatings error:", e);
    if (els.ratingsTableInfo) els.ratingsTableInfo.textContent = "Błąd ładowania ocen: " + e.message;
  } finally {
    if (!silent) setStatus(t("settings.status.loaded") || "Załadowano");
  }
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
  } catch(e) {
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
  } catch(e) {
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
  updateMailCategoryHighlights();
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
        updateMailCategoryHighlights();
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
        updateMailCategoryHighlights();
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
        mailLogsPage = 1;
        updateMailCategoryHighlights();
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
        mailLogsPage = 1;
        updateMailCategoryHighlights();
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
  updateMailCategoryHighlights();
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
  const isOpen = els.mailLogsHelp.hidden;
  els.mailLogsHelp.hidden = !isOpen;
  els.btnMailLogsHelp?.classList.toggle("is-active", isOpen);
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

function createPill(label, className) {
  const span = document.createElement("span");
  span.className = `mail-pill ${className || ""}`.trim();
  span.textContent = String(label || "—");
  return span;
}

function queueStatusPillClass(statusRaw) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "pending") return "mail-pill-status-pending";
  if (status === "sending") return "mail-pill-status-sending";
  if (status === "failed") return "mail-pill-status-failed";
  return "mail-pill-status-default";
}

function logLevelPillClass(levelRaw) {
  const level = String(levelRaw || "").toLowerCase();
  if (level === "error") return "mail-pill-level-error";
  if (level === "warn") return "mail-pill-level-warn";
  if (level === "info") return "mail-pill-level-info";
  if (level === "debug") return "mail-pill-level-debug";
  return "mail-pill-level-default";
}

function logFunctionPillClass(fnRaw) {
  const fn = String(fnRaw || "").toLowerCase();
  if (fn === "mail-worker") return "mail-pill-fn-worker";
  if (fn === "send-mail") return "mail-pill-fn-send-mail";
  if (fn === "send-email") return "mail-pill-fn-send-email";
  return "mail-pill-fn-default";
}

function updateMailCategoryHighlights() {
  const queueActive = mailQueueStatusValue !== "all";
  const fnActive = mailLogFnValue !== "all";
  const levelActive = mailLogLevelValue !== "all";
  const cronActive = mailCronPresetValue !== "5m";

  els.mailQueueStatusSelect?.classList.toggle("is-category-active", queueActive);
  els.mailLogFnSelect?.classList.toggle("is-category-active", fnActive);
  els.mailLogLevelSelect?.classList.toggle("is-category-active", levelActive);
  els.mailCronPresetSelect?.classList.toggle("is-category-active", cronActive);
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
    tdStatus.appendChild(createPill(String(row.status || "—"), queueStatusPillClass(row.status)));

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
    const isSkipped = String(row.event || "") === "email_skipped";
    tr.className = isSkipped
      ? "mail-event-skipped"
      : `mail-level-${String(row.level || "").toLowerCase()}`;

    const tdTime = document.createElement("td");
    tdTime.textContent = formatDateTime(row.created_at);

    const tdFn = document.createElement("td");
    tdFn.appendChild(createPill(String(row.function_name || "—"), logFunctionPillClass(row.function_name)));

    const tdLevel = document.createElement("td");
    tdLevel.appendChild(
      isSkipped
        ? createPill(t("settings.mail.skippedPill"), "mail-pill-event-skipped")
        : createPill(String(row.level || "—"), logLevelPillClass(row.level))
    );

    const tdEvent = document.createElement("td");
    tdEvent.textContent = scrubText(row.event || "—", 80);

    const tdTo = document.createElement("td");
    tdTo.textContent = scrubText(row.recipient_email || "—", 60);

    const tdProvider = document.createElement("td");
    if (isSkipped) {
      const reasonKey = String(row.provider || "");
      const label = reasonKey === "skipped_user_flag"
        ? t("settings.mail.skipReasonUserFlag")
        : reasonKey === "skipped_suppression"
          ? t("settings.mail.skipReasonSuppression")
          : reasonKey || "—";
      tdProvider.textContent = label;
    } else {
      tdProvider.textContent = String(row.provider || "—");
    }

    const tdError = document.createElement("td");
    tdError.textContent = scrubText(row.error || "—", 180);

    tr.append(tdTime, tdFn, tdLevel, tdEvent, tdTo, tdProvider, tdError);
    els.mailLogsBody?.appendChild(tr);
  });
}

// ============================================================
// MARKETPLACE ADMIN
// ============================================================

let marketActiveStatus = "pending";
let marketPreviewId = null;

async function loadMarketplace({ silent = false } = {}) {
  const tbody = document.getElementById("marketTableBody");
  const info  = document.getElementById("marketTableInfo");
  if (!tbody) return;
  if (!silent && info) info.textContent = t("settings.marketplace.loading") || "Ładowanie…";

  let data;
  try {
    const res = await adminFetch(`/marketplace/list?status=${marketActiveStatus}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    data = (json.rows || []).filter(r => r.origin !== "producer");
  } catch (err) {
    if (info) info.textContent = String(err?.message || err);
    return;
  }

  tbody.innerHTML = "";
  if (!data.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" style="text-align:center;opacity:.6">${t("settings.marketplace.empty") || "Brak pozycji."}</td>`;
    tbody.appendChild(tr);
    if (info) info.textContent = "";
    return;
  }

  for (const g of data) {
    const tr = document.createElement("tr");
    const date = g.created_at ? new Date(g.created_at).toLocaleDateString() : "—";
    const note = g.moderation_note ? ` <span style="opacity:.6;font-size:.85em">(${escSetting(g.moderation_note)})</span>` : "";

    let actions = `<button class="btn sm" data-market-preview="${escSetting(g.id)}">${t("settings.marketplace.marketPreview") || "Podgląd"}</button>`;
    if (marketActiveStatus === "pending") {
      actions += ` <button class="btn sm gold" data-market-approve="${escSetting(g.id)}">${t("settings.marketplace.marketApprove") || "Zatwierdź"}</button>`;
      actions += ` <button class="btn sm" data-market-reject="${escSetting(g.id)}">${t("settings.marketplace.marketReject") || "Odrzuć"}</button>`;
    }

    const authorLabel = g.origin === "producer"
      ? "♟ Producent"
      : (g.author_username || "—");

    tr.innerHTML = `
      <td>${escSetting(g.title)}${note}</td>
      <td>${escSetting(g.lang.toUpperCase())}</td>
      <td>${escSetting(authorLabel)}</td>
      <td>${date}</td>
      <td class="market-actions">${actions}</td>`;
    tbody.appendChild(tr);
  }

  if (info) info.textContent = `${data.length} ${t("settings.marketplace.items") || "pozycji"}`;
}

async function openMarketPreview(id) {
  const overlay = document.getElementById("marketPreviewOverlay");
  if (!overlay) return;

  marketPreviewId = id;

  // Pobierz szczegół
  let game;
  try {
    const res = await adminFetch(`/marketplace/detail?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    game = json.game;
  } catch (err) {
    showToast(String(err?.message || err), "error");
    return;
  }

  const titleEl = document.getElementById("marketPreviewTitle");
  const metaEl  = document.getElementById("marketPreviewMeta");
  const descEl  = document.getElementById("marketPreviewDesc");
  const qEl     = document.getElementById("marketPreviewQuestions");
  const approveBtn = document.getElementById("btnMarketPreviewApprove");
  const rejectBtn  = document.getElementById("btnMarketPreviewReject");

  if (titleEl) titleEl.textContent = game.title || "—";
  if (metaEl)  metaEl.textContent  = `${(game.lang || "").toUpperCase()} · ${game.author_email || game.author_username || "—"} · ${game.status || ""}`;
  if (descEl)  descEl.textContent  = game.description || "";

  if (qEl) {
    const qs = game.payload?.questions || [];
    qEl.innerHTML = qs.map((q, i) => {
      const answers = (q.answers || [])
        .map(a => `<li>${escSetting(a.text)} <span style="opacity:.5">(${a.fixed_points ?? 0} pkt)</span></li>`)
        .join("");
      return `<div class="market-preview-q">
        <div class="market-preview-q-text">${i + 1}. ${escSetting(q.text)}</div>
        <ol>${answers}</ol>
      </div>`;
    }).join("");
  }

  // Przyciski zależne od statusu
  const isPending   = game.status === "pending";
  const isPublished = game.status === "published";
  if (approveBtn)  approveBtn.hidden  = !isPending;
  if (rejectBtn)   rejectBtn.hidden   = !isPending;
  const withdrawBtn = document.getElementById("btnMarketPreviewWithdraw");
  const deleteBtn   = document.getElementById("btnMarketPreviewDelete");
  if (withdrawBtn) withdrawBtn.hidden = !isPublished;
  if (deleteBtn)   deleteBtn.hidden   = false; // zawsze widoczny

  overlay.style.display = "";
}

function closeMarketPreview() {
  const overlay = document.getElementById("marketPreviewOverlay");
  if (overlay) overlay.style.display = "none";
  marketPreviewId = null;
}

async function approveMarketGame(id) {
  try {
    const res = await adminFetch("/marketplace/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "approve" }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "approve_failed");
    showToast(t("settings.marketplace.approved") || "Zatwierdzono ✓");
    closeMarketPreview();
    await loadMarketplace({ silent: true });
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

function openRejectModal(id) {
  marketPreviewId = id;
  const overlay = document.getElementById("marketRejectOverlay");
  const note    = document.getElementById("marketRejectNote");
  if (overlay) overlay.style.display = "";
  if (note) note.value = "";
}

function closeRejectModal() {
  const overlay = document.getElementById("marketRejectOverlay");
  if (overlay) overlay.style.display = "none";
}

async function confirmReject() {
  const id   = marketPreviewId;
  const note = (document.getElementById("marketRejectNote")?.value || "").trim();
  if (!id) return;
  try {
    const res = await adminFetch("/marketplace/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "reject", note }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "reject_failed");
    showToast(t("settings.marketplace.rejected") || "Odrzucono.");
    closeRejectModal();
    closeMarketPreview();
    await loadMarketplace({ silent: true });
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function adminForceWithdraw(id) {
  console.log("[settings] adminForceWithdraw id:", id);
  const ok = await confirmModal({ text: t("settings.marketplace.forceWithdrawConfirm") || "Wycofać tę grę? Zniknie z browse, ale zostanie w bibliotekach." });
  if (!ok) return;
  try {
    const res = await adminFetch("/marketplace/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    console.log("[settings] adminForceWithdraw response:", json);
    if (!json.ok) throw new Error(json.error || "withdraw_failed");
    showToast(t("settings.marketplace.forceWithdrawn") || "Wycofano.");
    closeMarketPreview();
    await loadMarketplace({ silent: true });
  } catch (err) {
    console.error("[settings] adminForceWithdraw error:", err);
    showToast(String(err?.message || err), "error");
  }
}

async function adminHardDelete(id) {
  console.log("[settings] adminHardDelete id:", id);
  const ok = await confirmModal({ text: t("settings.marketplace.hardDeleteConfirm") || "Usunąć grę na stałe? Zniknie u wszystkich użytkowników. Tego nie da się cofnąć." });
  if (!ok) return;
  try {
    const res = await adminFetch("/marketplace/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    console.log("[settings] adminHardDelete response:", json);
    if (!json.ok) {
      let msg = json.error || "delete_failed";
      if (json.debug) msg += ` (status: ${json.debug.status}, row_err: ${json.debug.row_err})`;
      throw new Error(msg);
    }
    showToast(t("settings.marketplace.hardDeleted") || "Usunięto.");
    closeMarketPreview();
    await loadMarketplace({ silent: true });
  } catch (err) {
    console.error("[settings] adminHardDelete error:", err);
    showToast(String(err?.message || err), "error");
  }
}


async function testTelegram() {
  const status = document.getElementById("telegramStatus");
  try {
    const res  = await adminFetch("/config/telegram/test", { method: "POST" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "test_failed");
    if (status) status.textContent = t("settings.marketplace.telegramTestSent") || "Testowe powiadomienie wysłane.";
    showToast(t("settings.marketplace.telegramTestToast") || "Testowe powiadomienie Telegram wysłane.", "success");
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

// helper — fetch do /_admin_api/*
// ============================================================
// REPORTS ADMIN
// ============================================================

// ── Mail client state ──────────────────────────────────────────
let msgActiveFolder  = "inbox";  // inbox | sent | trash | reports | <report-uuid>
let msgActiveId      = null;     // aktywna wiadomość lub zgłoszenie
let msgRows          = [];       // lista wiadomości lub zgłoszeń
let msgSearchQuery   = "";
let msgReports       = [];       // cache zgłoszeń (do assign select)

async function loadMailFolder({ silent = false } = {}) {
  try {
    if (msgActiveFolder === "reports") {
      const res = await adminFetch("/reports?status=all&limit=100");
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      msgRows = json.rows || [];
    } else {
      const res = await adminFetch(`/messages?filter=${encodeURIComponent(msgActiveFolder)}&limit=100`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      msgRows = json.rows || [];
    }
    renderMailList(msgRows);
  } catch (err) {
    if (!silent) showToast(String(err?.message || err), "error");
  }
}

function renderMailList(rows) {
  const body = document.getElementById("mailListBody");
  if (!body) return;
  const q = msgSearchQuery.toLowerCase();
  const filtered = q
    ? rows.filter(r =>
        (r.from_email || r.to_email || "").toLowerCase().includes(q) ||
        (r.subject || "").toLowerCase().includes(q) ||
        (r.ticket_number || "").toLowerCase().includes(q)
      )
    : rows;

  body.innerHTML = "";

  if (msgActiveFolder === "trash" && !filtered.length) {
    body.innerHTML = `<div style="padding:20px;text-align:center;opacity:.35;font-size:12px">${t("settings.reports.trashEmpty") || "Kosz jest pusty."}</div>
      <div style="padding:0 20px 16px;text-align:center;opacity:.25;font-size:11px">${t("settings.reports.trashNote") || "Elementy starsze niż 30 dni są usuwane automatycznie"}</div>`;
    return;
  }

  if (!filtered.length) {
    body.innerHTML = `<div style="padding:20px;text-align:center;opacity:.35;font-size:12px">${t("settings.reports.noMessages") || "Brak wiadomości."}</div>`;
    return;
  }

  if (msgActiveFolder === "reports") {
    for (const r of filtered) {
      const item = document.createElement("div");
      const isOpen = r.status === "open";
      item.className = "mail-thread-item" + (isOpen ? " unread" : "") + (r.id === msgActiveId ? " active" : "");
      item.dataset.reportId = r.id;
      const dateStr = new Date(r.created_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"2-digit" });
      const badge = isOpen
        ? `<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(255,234,166,.18);color:#ffeaa6">open</span>`
        : `<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.07);opacity:.5">closed</span>`;
      item.innerHTML = `
        <div class="mail-ti-row">
          <span class="mail-ti-from">${escSetting(r.ticket_number)}</span>
          <span class="mail-ti-date">${dateStr}</span>
        </div>
        <div class="mail-ti-subject" style="display:flex;gap:6px;align-items:center">${badge} ${escSetting(r.subject || "—")}</div>
        <div class="mail-ti-preview" style="opacity:.45">${escSetting(String(r.message_count || 0))} msg</div>`;
      item.addEventListener("click", () => openReport(r.id));
      body.appendChild(item);
    }
    return;
  }

  for (const r of filtered) {
    const item = document.createElement("div");
    const isInbound = r.direction === "inbound";
    item.className = "mail-thread-item" + (!r.report_id && isInbound ? " unread" : "") + (r.id === msgActiveId ? " active" : "");
    item.dataset.msgId = r.id;
    const dateStr = new Date(r.created_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"2-digit" });
    const sourceBadge = { email: "📧", form: "📝", compose: "✏" }[r.source] || "";
    const from = isInbound ? (r.from_email || "—") : (r.to_email || "—");
    const ticketPart = r.ticket_number ? ` · <span style="opacity:.5;font-size:10px">${escSetting(r.ticket_number)}</span>` : "";
    item.innerHTML = `
      <div class="mail-ti-row">
        <span class="mail-ti-from">${sourceBadge} ${escSetting(from)}</span>
        <span class="mail-ti-date">${dateStr}</span>
      </div>
      <div class="mail-ti-subject">${escSetting(r.subject || "—")}</div>
      <div class="mail-ti-preview">${escSetting((r.body_preview || "").slice(0, 80))}${ticketPart}</div>`;
    item.addEventListener("click", () => openMessage(r.id));
    body.appendChild(item);
  }
}

async function openMessage(id) {
  msgActiveId = id;
  document.querySelectorAll(".mail-thread-item").forEach(el => {
    el.classList.toggle("active", el.dataset.msgId === id);
  });

  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;opacity:.35;font-size:12px">${t("settings.marketplace.loadingConv") || "Ładowanie…"}</div>`;

  try {
    const res = await adminFetch(`/messages/detail?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    let attachments = [];
    try {
      const attRes = await adminFetch(`/attachments?message_id=${encodeURIComponent(id)}`);
      if (attRes.ok) {
        const attJson = await attRes.json();
        attachments = attJson.attachments || [];
      } else {
        console.error("[openMessage] attachments fetch failed:", attRes.status, await attRes.text().catch(() => ""));
      }
    } catch (e) { console.error("[openMessage] attachments error:", e); }
    renderMessageDetail(json.message, attachments);
  } catch (err) {
    showToast(String(err?.message || err), "error");
    conv.innerHTML = "";
  }
}

function showAttachmentPreview(url, filename) {
  let overlay = document.getElementById("attPreviewOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "attPreviewOverlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;";
    overlay.addEventListener("click", () => {
      URL.revokeObjectURL(overlay.querySelector("img")?.src || "");
      overlay.remove();
    });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div style="position:relative;max-width:92vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:8px;">
    <img src="${url}" alt="${escSetting(filename)}" style="max-width:100%;max-height:80vh;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.7);">
    <a href="${url}" download="${escSetting(filename)}" style="font-size:11px;color:rgba(255,255,255,.6);text-decoration:none;" onclick="event.stopPropagation()">Pobierz</a>
  </div>`;
}

function renderMessageDetail(msg, attachments = []) {
  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = "";

  const isInbound = msg.direction === "inbound";
  const sourceLabelMap = {
    email:   t("settings.reports.sourceEmail")   || "Email",
    form:    t("settings.reports.sourceForm")     || "Formularz",
    compose: t("settings.reports.sourceCompose")  || "Wiadomość",
  };
  const sourceLabel = sourceLabelMap[msg.source] || msg.source;
  const from = isInbound ? msg.from_email : msg.to_email;

  const header = document.createElement("div");
  header.className = "mail-conv-header";

  let ticketBadge = "";
  if (msg.ticket_number) {
    ticketBadge = `<span class="mail-ticket-badge" data-report-id="${escSetting(msg.report_id)}" style="cursor:pointer;font-size:11px;padding:2px 7px;border-radius:6px;background:rgba(255,234,166,.15);color:#ffeaa6;margin-left:6px" title="${t("settings.marketplace.ticketBadgeTitle") || "Przejdź do zgłoszenia"}">${escSetting(msg.ticket_number)}</span>`;
  }

  header.innerHTML = `
    <div class="mail-conv-subject">${escSetting(msg.subject || "—")}</div>
    <div class="mail-conv-meta">
      ${isInbound ? (t("settings.marketplace.convFrom") || "Od:") : (t("settings.marketplace.convTo") || "Do:")} ${escSetting(from || "—")} · ${new Date(msg.created_at).toLocaleString("pl-PL")} · ${escSetting(sourceLabel)}${ticketBadge}
    </div>`;
  conv.appendChild(header);

  const msgEl = document.createElement("div");
  msgEl.className = "mail-conv-messages";
  const bubble = document.createElement("div");
  bubble.className = `mail-msg ${isInbound ? "inbound" : "outbound"}`;

  const bodyEl = document.createElement("div");
  const htmlSrc = msg.body_html || (/<[a-z][\s\S]*>/i.test(msg.body || "") ? msg.body : null);
  if (htmlSrc) {
    bodyEl.className = "mail-msg-body-html";
    const frame = document.createElement("iframe");
    frame.className = "mail-msg-html-frame";
    frame.sandbox = "allow-scripts allow-popups";
    frame.srcdoc = htmlSrc;
    frame.onload = () => { try { frame.style.height = (frame.contentDocument.documentElement.scrollHeight + 20) + "px"; } catch(e) {} };
    bodyEl.appendChild(frame);
  } else {
    bodyEl.className = "mail-msg-body";
    bodyEl.style.whiteSpace = "pre-wrap";
    bodyEl.textContent = msg.body || "";
  }
  bubble.appendChild(bodyEl);

  // Attachments (non-inline)
  const nonInline = attachments.filter(a => !a.inline);
  if (nonInline.length) {
    const attList = document.createElement("div");
    attList.style.cssText = "margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;";
    for (const att of nonInline) {
      const chip = document.createElement("a");
      chip.href = "#";
      const isExpired = !!att.expired;
      const isImage = att.mime_type?.startsWith("image/");
      const isPdf   = att.mime_type === "application/pdf";

      if (isExpired) {
        chip.style.cssText = "display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;border:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.3);text-decoration:none;cursor:default;background:rgba(255,255,255,.02);";
        chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>${escSetting(att.filename)} <span style="opacity:.5">${t("settings.marketplace.attachExpired") || "— załącznik wygasł"}</span>`;
      } else {
        chip.style.cssText = "display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;border:1px solid rgba(255,255,255,.15);font-size:11px;color:rgba(255,255,255,.7);text-decoration:none;cursor:pointer;background:rgba(255,255,255,.04);";
        const icon = isImage
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
          : isPdf
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
          : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`;
        chip.innerHTML = `${icon}${escSetting(att.filename)} <span style="opacity:.45">${escSetting(att.mime_type.split('/')[1] || '')}</span>`;
        chip.addEventListener("click", async (e) => {
          e.preventDefault();
          try {
            chip.style.opacity = "0.5";
            const res = await adminFetch(`/attachments/download?id=${encodeURIComponent(att.id)}`);
            chip.style.opacity = "";
            if (!res.ok) { showToast("Błąd pobierania.", "error"); return; }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (isImage) {
              showAttachmentPreview(url, att.filename);
            } else if (isPdf) {
              window.open(url, "_blank");
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            } else {
              const a2 = document.createElement("a");
              a2.href = url; a2.download = att.filename; a2.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            }
          } catch(e) { chip.style.opacity = ""; showToast("Błąd pobierania.", "error"); }
        });
      }
      attList.appendChild(chip);
    }
    bubble.appendChild(attList);
  }

  msgEl.appendChild(bubble);
  conv.appendChild(msgEl);

  // Action bar — icon buttons
  const actions = document.createElement("div");
  actions.className = "mail-msg-actions";

  // Left group: assign/unassign + reply
  const leftGroup = document.createElement("div");
  leftGroup.style.cssText = "display:flex;gap:4px;align-items:center;";

  if (!msg.report_id) {
    const btnAssign = document.createElement("button");
    btnAssign.className = "msg-icon-btn msg-icon-btn--gold";
    btnAssign.type = "button";
    btnAssign.title = t("settings.reports.assignReport") || "Przydziel zgłoszenie";
    btnAssign.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
    btnAssign.addEventListener("click", () => assignReport(msg));
    leftGroup.appendChild(btnAssign);
  } else {
    const btnUnassign = document.createElement("button");
    btnUnassign.className = "msg-icon-btn msg-icon-btn--tagged";
    btnUnassign.type = "button";
    btnUnassign.title = `${escSetting(msg.ticket_number || "")} — odepnij`;
    btnUnassign.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
    btnUnassign.addEventListener("click", () => unassignReport(msg.id));
    leftGroup.appendChild(btnUnassign);
  }

  if (isInbound && msg.from_email) {
    const btnReply = document.createElement("button");
    btnReply.className = "msg-icon-btn";
    btnReply.type = "button";
    btnReply.title = t("settings.reports.replyBtn") || "Odpowiedz";
    btnReply.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>`;
    btnReply.addEventListener("click", () => showCompose({ to: msg.from_email, subject: `Re: ${msg.subject || ""}`, report_id: msg.report_id, quote: msg.body, quoteFrom: msg.from_email, quoteDate: msg.created_at }));
    leftGroup.appendChild(btnReply);
  }

  actions.appendChild(leftGroup);

  // Right group: trash / restore + delete
  const rightGroup = document.createElement("div");
  rightGroup.style.cssText = "display:flex;gap:4px;align-items:center;margin-left:auto;";

  if (!msg.deleted_at) {
    const btnTrash = document.createElement("button");
    btnTrash.className = "msg-icon-btn msg-icon-btn--danger";
    btnTrash.type = "button";
    btnTrash.title = t("settings.reports.trashMsg") || "Do kosza";
    btnTrash.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    btnTrash.addEventListener("click", () => trashMessage(msg.id));
    rightGroup.appendChild(btnTrash);
  } else {
    const btnRestore = document.createElement("button");
    btnRestore.className = "msg-icon-btn";
    btnRestore.type = "button";
    btnRestore.title = t("settings.reports.restore") || "Przywróć";
    btnRestore.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`;
    btnRestore.addEventListener("click", () => restoreMessage(msg.id));
    rightGroup.appendChild(btnRestore);

    const btnDelete = document.createElement("button");
    btnDelete.className = "msg-icon-btn msg-icon-btn--danger";
    btnDelete.type = "button";
    btnDelete.title = t("settings.reports.deleteForever") || "Usuń na zawsze";
    btnDelete.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    btnDelete.addEventListener("click", () => deleteForever(msg.id));
    rightGroup.appendChild(btnDelete);
  }

  actions.appendChild(rightGroup);
  conv.appendChild(actions);

  // click on ticket badge → open report
  conv.querySelector(".mail-ticket-badge")?.addEventListener("click", (e) => {
    const rid = e.currentTarget.dataset.reportId;
    if (rid) {
      msgActiveFolder = "reports";
      document.querySelectorAll(".mail-folder").forEach(f => {
        f.classList.toggle("active", f.dataset.folder === "reports");
      });
      loadMailFolder({ silent: true }).then(() => openReport(rid));
    }
  });
}

async function openReport(id) {
  msgActiveId = id;
  document.querySelectorAll(".mail-thread-item").forEach(el => {
    el.classList.toggle("active", el.dataset.reportId === id);
  });

  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;opacity:.35;font-size:12px">${t("settings.marketplace.loadingConv") || "Ładowanie…"}</div>`;

  try {
    const res = await adminFetch(`/reports/messages?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    const messages = json.messages || [];

    // Fetch attachments for each message in parallel
    const attsByMsg = {};
    await Promise.all(messages.map(async (msg) => {
      try {
        const attRes = await adminFetch(`/attachments?message_id=${encodeURIComponent(msg.id)}`);
        if (attRes.ok) {
          const attJson = await attRes.json();
          attsByMsg[msg.id] = attJson.attachments || [];
        } else {
          console.error("[openReport] attachments fetch failed:", msg.id, attRes.status);
        }
      } catch (e) { console.error("[openReport] attachments error:", msg.id, e); }
    }));

    const report = msgRows.find(r => r.id === id) || null;
    renderReportThread(report, messages, attsByMsg);
  } catch (err) {
    showToast(String(err?.message || err), "error");
    conv.innerHTML = "";
  }
}

function renderReportThread(report, messages, attsByMsg = {}) {
  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = "";

  const isOpen = !report || report.status === "open";
  const ticketNum = report?.ticket_number || "—";
  const statusLabel = isOpen
    ? (t("settings.reports.status.open") || "Otwarte")
    : (t("settings.reports.status.closed") || "Zamknięte");

  const header = document.createElement("div");
  header.className = "mail-conv-header";
  header.innerHTML = `
    <div class="mail-conv-subject">${escSetting(ticketNum)} <span style="font-size:12px;opacity:.6">${escSetting(statusLabel)}</span></div>
    <div class="mail-conv-meta">${escSetting(report?.subject || "—")}</div>
    <div class="mail-conv-actions">
      ${report
        ? isOpen
          ? `<button class="btn sm danger" id="btnReportClose" type="button">${t("settings.reports.closeReport") || "Zamknij zgłoszenie"}</button>`
          : `<button class="btn sm" id="btnReportOpen" type="button">${t("settings.reports.openReport") || "Otwórz zgłoszenie"}</button>`
        : ""}
    </div>`;
  conv.appendChild(header);

  const msgs = document.createElement("div");
  msgs.className = "mail-conv-messages";
  msgs.id = "mailConvMessages";

  for (const msg of messages) {
    const isOut = msg.direction === "outbound";
    const el = document.createElement("div");
    el.className = `mail-msg ${isOut ? "outbound" : "inbound"}`;
    const metaEl = document.createElement("div");
    metaEl.className = "mail-msg-meta";
    const from = isOut ? `↗ ${msg.to_email || "—"}` : `↙ ${msg.from_email || "—"}`;
    const sourceBadge = { email: "📧", form: "📝", compose: "✏" }[msg.source] || "";
    metaEl.innerHTML = `<span>${escSetting(from)} · ${new Date(msg.created_at).toLocaleString("pl-PL")} ${escSetting(sourceBadge)}</span>`;
    el.appendChild(metaEl);

    const bodyEl = document.createElement("div");
    const htmlSrc = msg.body_html || (/<[a-z][\s\S]*>/i.test(msg.body || "") ? msg.body : null);
    if (htmlSrc) {
      bodyEl.className = "mail-msg-body-html";
      const frame = document.createElement("iframe");
      frame.className = "mail-msg-html-frame";
      frame.sandbox = "allow-scripts allow-popups";
      frame.srcdoc = htmlSrc;
      frame.onload = () => { try { frame.style.height = (frame.contentDocument.documentElement.scrollHeight + 20) + "px"; } catch(e) {} };
      bodyEl.appendChild(frame);
    } else {
      bodyEl.className = "mail-msg-body";
      bodyEl.style.whiteSpace = "pre-wrap";
      bodyEl.textContent = msg.body || "";
    }
    el.appendChild(bodyEl);

    // Attachments for this message
    const msgAtts = (attsByMsg[msg.id] || []).filter(a => !a.inline);
    if (msgAtts.length) {
      const attList = document.createElement("div");
      attList.style.cssText = "margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;";
      for (const att of msgAtts) {
        const chip = document.createElement("a");
        chip.href = "#";
        const isExpired = !!att.expired;
        const isImage = att.mime_type?.startsWith("image/");
        const isPdf   = att.mime_type === "application/pdf";
        if (isExpired) {
          chip.style.cssText = "display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;border:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.3);text-decoration:none;cursor:default;background:rgba(255,255,255,.02);";
          chip.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>${escSetting(att.filename)} <span style="opacity:.5">${t("settings.marketplace.attachExpired") || "— wygasł"}</span>`;
        } else {
          chip.style.cssText = "display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;border:1px solid rgba(255,255,255,.15);font-size:11px;color:rgba(255,255,255,.7);text-decoration:none;cursor:pointer;background:rgba(255,255,255,.04);";
          const icon = isImage
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
            : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`;
          chip.innerHTML = `${icon}${escSetting(att.filename)} <span style="opacity:.45">${escSetting(att.mime_type.split("/")[1] || "")}</span>`;
          chip.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
              chip.style.opacity = "0.5";
              const res = await adminFetch(`/attachments/download?id=${encodeURIComponent(att.id)}`);
              chip.style.opacity = "";
              if (!res.ok) { showToast("Błąd pobierania.", "error"); return; }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              if (isImage) {
                showAttachmentPreview(url, att.filename);
              } else if (isPdf) {
                window.open(url, "_blank");
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              } else {
                const a2 = document.createElement("a");
                a2.href = url; a2.download = att.filename; a2.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              }
            } catch(e) { chip.style.opacity = ""; showToast("Błąd pobierania.", "error"); }
          });
        }
        attList.appendChild(chip);
      }
      el.appendChild(attList);
    }

    msgs.appendChild(el);
  }
  if (!messages.length) {
    msgs.innerHTML = `<div style="padding:20px;text-align:center;opacity:.3;font-size:12px">${t("settings.reports.noMessages") || "Brak wiadomości"}</div>`;
  }
  conv.appendChild(msgs);
  setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);

  // Reply compose area
  const replySection = document.createElement("div");
  replySection.className = "mail-conv-reply";
  replySection.id = "mailConvReply";
  replySection.innerHTML = `
    <textarea class="inp" id="mailReplyArea" rows="4" placeholder="${t("settings.reports.replyPlaceholder") || "Treść odpowiedzi…"}" style="width:100%;box-sizing:border-box;resize:vertical;min-height:80px"></textarea>
    <div class="mail-conv-reply-actions">
      <span class="field-hint" id="mailReplyStatus"></span>
      <button class="btn sm gold" id="btnReportReply" type="button">${t("settings.reports.replyBtn") || "Odpowiedz"}</button>
    </div>`;
  conv.appendChild(replySection);

  if (report) {
    document.getElementById("btnReportClose")?.addEventListener("click", () => toggleReportStatus(report.id, "open"));
    document.getElementById("btnReportOpen")?.addEventListener("click",  () => toggleReportStatus(report.id, "closed"));
  }
  document.getElementById("btnReportReply")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnReportReply");
    const statusEl = document.getElementById("mailReplyStatus");
    const body = (document.getElementById("mailReplyArea")?.value || "").trim();
    if (!body) { showToast("Podaj treść odpowiedzi.", "error"); return; }
    const lastInbound = [...messages].reverse().find(m => m.direction === "inbound");
    const to = lastInbound?.from_email;
    if (!to) { showToast("Brak adresu odbiorcy.", "error"); return; }
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    if (statusEl) statusEl.textContent = "Wysyłam…";
    try {
      const res = await adminFetch("/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: to,
          subject: `Re: [${ticketNum}] ${report?.subject || ""}`,
          body,
          lang: report?.lang || "pl",
          report_id: report?.id || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const area = document.getElementById("mailReplyArea");
      if (area) area.value = "";
      if (statusEl) statusEl.textContent = "";
      showToast(t("settings.reports.compose.sent") || "Wysłano.", "success");
      await openReport(report?.id || msgActiveId);
    } catch (err) {
      if (statusEl) statusEl.textContent = "";
      showToast(String(err?.message || err), "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = t("settings.reports.replyBtn") || "Odpowiedz"; }
    }
  });
}

let _assignMsgData = null;

async function assignReport(msgOrId) {
  _assignMsgData = msgOrId && typeof msgOrId === "object" ? msgOrId : { id: msgOrId };
  // Load reports for modal
  try {
    const res = await adminFetch("/reports?status=all&limit=100");
    if (res.ok) {
      const json = await res.json();
      msgReports = json.rows || [];
    }
  } catch(e) {}
  openAssignModal(_assignMsgData.id);
}

function openAssignModal(messageId) {
  const modal = document.getElementById("assignReportModal");
  if (!modal) { fallbackAssign(messageId); return; }
  modal.dataset.messageId = messageId;

  const list = document.getElementById("assignReportList");
  if (list) {
    list.innerHTML = "";
    for (const r of msgReports) {
      const opt = document.createElement("div");
      opt.className = "assign-report-option";
      opt.dataset.reportId = r.id;
      opt.style.cssText = "padding:6px 8px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:0";
      const isOpen = r.status === "open";
      opt.innerHTML = `
        <span style="font-weight:600;color:#ffeaa6">${escSetting(r.ticket_number)}</span>
        <span style="opacity:.6;font-size:12px;margin-left:8px">${escSetting(r.subject || "—")}</span>
        <span style="font-size:10px;margin-left:4px;opacity:.4">${isOpen ? "open" : "closed"}</span>`;
      opt.addEventListener("click", () => {
        const wasSelected = opt.classList.contains("selected");
        list.querySelectorAll(".assign-report-option").forEach(el => {
          el.style.background = "";
          el.classList.remove("selected");
        });
        if (!wasSelected) {
          opt.classList.add("selected");
          opt.style.background = "rgba(255,234,166,.12)";
        }
      });
      list.appendChild(opt);
    }
    if (!msgReports.length) {
      list.innerHTML = `<div style="opacity:.4;font-size:12px;padding:8px">Brak zgłoszeń. Utwórz nowe poniżej.</div>`;
    }
  }

  const subjectInput = document.getElementById("assignNewSubject");
  if (subjectInput) {
    subjectInput.value = "";
    subjectInput.oninput = () => {
      const quoteLabel = document.getElementById("assignQuoteLabel");
      if (quoteLabel) quoteLabel.style.display = subjectInput.value.trim() ? "flex" : "none";
    };
  }
  const quoteLabel = document.getElementById("assignQuoteLabel");
  if (quoteLabel) quoteLabel.style.display = "none";
  const quoteCheck = document.getElementById("assignQuoteCheck");
  if (quoteCheck) quoteCheck.checked = false;
  modal.hidden = false;
}

async function fallbackAssign(messageId) {
  const ticketOrId = prompt("Podaj ID zgłoszenia lub wpisz temat nowego:");
  if (!ticketOrId) return;
  await doAssign(messageId, ticketOrId, false);
}

async function doAssign(messageId, reportId, isNew, withQuote = false, ticketNumber = null) {
  try {
    const res = await adminFetch("/messages/assign", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, report_id: reportId }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast(t("settings.reports.reportAssigned") || "Zgłoszenie przydzielone.", "success");
    closeAssignModal();

    if (isNew && withQuote && _assignMsgData && _assignMsgData.from_email) {
      const msg = _assignMsgData;
      const ticket = ticketNumber || "";
      const userQuote = (msg.body || "").trim();
      const replyBody = `Twoja wiadomość została zarejestrowana jako zgłoszenie nr ${ticket}.\nMożesz odpowiadać na ten email aby kontynuować rozmowę.`;
      const replySubject = `[${ticket}] Zgłoszenie zarejestrowane`;
      await adminFetch("/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: msg.from_email,
          subject: replySubject,
          body: replyBody,
          quote: userQuote,
          report_id: reportId,
        }),
      });
    }

    await loadMailFolder({ silent: true });
    if (msgActiveId) await openMessage(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function doCreateAndAssign(messageId, subject, withQuote = false) {
  try {
    const createRes = await adminFetch("/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject || "", lang: "pl" }),
    });
    if (!createRes.ok) throw new Error(await createRes.text());
    const createJson = await createRes.json();
    if (!createJson.ok) throw new Error(createJson.error);
    await doAssign(messageId, createJson.id, true, withQuote, createJson.ticket_number);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

function closeAssignModal() {
  const modal = document.getElementById("assignReportModal");
  if (modal) modal.hidden = true;
}

async function unassignReport(messageId) {
  try {
    const res = await adminFetch("/messages/assign", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, report_id: null }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast("Odepnięto.", "success");
    await loadMailFolder({ silent: true });
    if (msgActiveId) await openMessage(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function trashMessage(messageId) {
  try {
    const res = await adminFetch("/messages/trash", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(t("settings.reports.trashMsg") || "Do kosza.", "success");
    await loadMailFolder({ silent: true });
    const conv = document.getElementById("mailConv");
    if (conv) conv.innerHTML = `<div class="mail-conv-placeholder"><div style="font-size:48px;margin-bottom:12px;opacity:.3">✉</div><div style="opacity:.4;font-size:13px">${t("settings.reports.selectMsg") || "Wybierz wątek"}</div></div>`;
    msgActiveId = null;
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function restoreMessage(messageId) {
  try {
    const res = await adminFetch("/messages/restore", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(t("settings.reports.restore") || "Przywrócono.", "success");
    await loadMailFolder({ silent: true });
    if (msgActiveId) await openMessage(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function deleteForever(messageId) {
  const ok = await confirmModal({ text: t("settings.reports.deleteForever") || "Usunąć na zawsze?" });
  if (!ok) return;
  try {
    const res = await adminFetch("/messages/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(t("settings.reports.deleteForever") || "Usunięto.", "success");
    await loadMailFolder({ silent: true });
    const conv = document.getElementById("mailConv");
    if (conv) conv.innerHTML = `<div class="mail-conv-placeholder"><div style="font-size:48px;margin-bottom:12px;opacity:.3">✉</div><div style="opacity:.4;font-size:13px">${t("settings.reports.selectMsg") || "Wybierz wątek"}</div></div>`;
    msgActiveId = null;
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function toggleReportStatus(reportId, currentStatus) {
  const newStatus = currentStatus === "open" ? "closed" : "open";
  try {
    const res = await adminFetch("/reports/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId, status: newStatus }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(newStatus === "closed" ? (t("settings.reports.closeReport") || "Zamknięto.") : (t("settings.reports.openReport") || "Otwarto."), "success");
    // Refresh list and reopen
    await loadMailFolder({ silent: true });
    if (msgActiveId) await openReport(msgActiveId);
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

let _composePrevActiveId   = null;
let _composePrevIsReport   = false;

function showCompose(defaults = {}) {
  const conv = document.getElementById("mailConv");
  if (!conv) return;
  _composePrevActiveId = msgActiveId;
  _composePrevIsReport = msgActiveFolder === "reports";
  msgActiveId = null;
  document.querySelectorAll(".mail-thread-item").forEach(el => el.classList.remove("active"));

  const hasQuote = !!defaults.quote;
  let quoteBlockHtml = "";
  if (hasQuote) {
    const dateStr = defaults.quoteDate ? new Date(defaults.quoteDate).toLocaleString("pl-PL") : "";
    const fromStr = defaults.quoteFrom ? `${escSetting(defaults.quoteFrom)}, ${dateStr}` : dateStr;
    quoteBlockHtml = `<div id="composeQuoteBlock" style="margin-top:10px;padding:10px 14px;border-left:3px solid rgba(255,234,166,.35);background:rgba(0,0,0,.2);border-radius:0 8px 8px 0;font-size:12px;opacity:.65;white-space:pre-wrap;word-break:break-word">
      <div style="font-size:11px;opacity:.7;margin-bottom:6px">${fromStr}</div>${escSetting(defaults.quote)}</div>`;
  }

  conv.innerHTML = `
    <div class="mail-compose-pane" id="composePaneInner">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:14px;font-weight:700">${t("settings.reports.compose.title") || "Napisz nową wiadomość"}</div>
        <button id="btnComposeClose" type="button" title="Zamknij" style="background:none;border:none;cursor:pointer;padding:4px;color:rgba(255,255,255,.4);line-height:1;font-size:18px;border-radius:4px" onmouseover="this.style.color='rgba(255,255,255,.8)'" onmouseout="this.style.color='rgba(255,255,255,.4)'">✕</button>
      </div>
      <div class="field">
        <label class="field-label">${t("settings.reports.compose.to") || "Do (e-mail)"}</label>
        <input class="inp" id="composeToInput" type="email" autocomplete="off" style="width:100%;box-sizing:border-box" value="${escSetting(defaults.to || "")}">
      </div>
      <div class="field">
        <label class="field-label">${t("settings.reports.compose.subject") || "Temat"}</label>
        <input class="inp" id="composeSubjectInput" type="text" autocomplete="off" style="width:100%;box-sizing:border-box" value="${escSetting(defaults.subject || "")}">
      </div>
      <div class="field" style="flex:1;display:flex;flex-direction:column">
        <label class="field-label">${t("settings.reports.compose.message") || "Treść"}</label>
        <textarea class="inp" id="composeMessageArea" rows="6" style="width:100%;box-sizing:border-box;resize:vertical">${escSetting(defaults.body || "")}</textarea>
      </div>
      <div class="field">
        <label class="field-label" style="display:flex;align-items:center;justify-content:space-between">
          Załączniki
          <span style="opacity:.4;font-size:10px">maks. 10 MB</span>
        </label>
        <input type="file" id="composeAttachmentInput" multiple style="display:none">
        <label for="composeAttachmentInput" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);font-size:12px;color:rgba(255,255,255,.6);cursor:pointer;user-select:none">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          Wybierz pliki
        </label>
        <div id="composeAttachmentList" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px"></div>
      </div>
      ${hasQuote ? `<label style="display:flex;align-items:center;gap:7px;font-size:12px;opacity:.55;cursor:pointer;margin-top:8px;user-select:none"><input type="checkbox" id="composeQuoteToggle" checked style="accent-color:#ffeaa6"> Dołącz cytat</label>` : ""}
      ${quoteBlockHtml}
      <input type="hidden" id="composeReportId" value="${escSetting(defaults.report_id || "")}">
      <input type="hidden" id="composeQuoteBody" value="${escSetting(defaults.quote || "")}">
      <div style="display:flex;justify-content:flex-end;gap:8px;align-items:center;padding-bottom:4px;margin-top:10px">
        <span class="field-hint" id="composeSendStatus"></span>
        <button class="btn sm gold" id="btnComposeSend" type="button">${t("settings.reports.compose.send") || "Wyślij"}</button>
      </div>
    </div>`;
  document.getElementById("btnComposeSend")?.addEventListener("click", sendCompose);

  document.getElementById("btnComposeClose")?.addEventListener("click", async () => {
    const hasData = (document.getElementById("composeToInput")?.value || "").trim()
      || (document.getElementById("composeSubjectInput")?.value || "").trim()
      || (document.getElementById("composeMessageArea")?.value || "").trim();
    if (hasData) {
      const ok = await confirmModal({ text: "Wprowadzone dane zostaną utracone. Zrezygnować?" });
      if (!ok) return;
    }
    closeCompose();
  });

  document.getElementById("composeAttachmentInput")?.addEventListener("change", (e) => {
    const list = document.getElementById("composeAttachmentList");
    if (!list) return;
    list.innerHTML = Array.from(e.target.files || []).map(f =>
      `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.12);font-size:11px;color:rgba(255,255,255,.6)">${escSetting(f.name)}</span>`
    ).join("");
  });

  document.getElementById("composeQuoteToggle")?.addEventListener("change", (e) => {
    const block = document.getElementById("composeQuoteBlock");
    if (block) block.style.display = e.target.checked ? "" : "none";
  });
}

function closeCompose() {
  if (_composePrevActiveId) {
    if (_composePrevIsReport) {
      openReport(_composePrevActiveId);
    } else {
      openMessage(_composePrevActiveId);
    }
  } else {
    const conv = document.getElementById("mailConv");
    if (!conv) return;
    conv.innerHTML = `<div class="mail-conv-placeholder"><div style="font-size:48px;margin-bottom:12px;opacity:.3">✉</div><div style="opacity:.4;font-size:13px">${t("settings.reports.selectMsg") || "Wybierz wątek"}</div></div>`;
    msgActiveId = null;
  }
  _composePrevActiveId = null;
  _composePrevIsReport = false;
}

async function sendCompose(defaults) {
  // Called either as event handler (no args) or directly with defaults
  const to      = (document.getElementById("composeToInput")?.value || "").trim();
  const subject = (document.getElementById("composeSubjectInput")?.value || "").trim();
  const body    = (document.getElementById("composeMessageArea")?.value || "").trim();
  const reportId = (document.getElementById("composeReportId")?.value || "").trim() || null;
  const quoteToggle = document.getElementById("composeQuoteToggle");
  const quoteIncluded = !quoteToggle || quoteToggle.checked;
  const quote   = quoteIncluded ? ((document.getElementById("composeQuoteBody")?.value || "").trim() || null) : null;
  const status  = document.getElementById("composeSendStatus");

  if (!to || !to.includes("@")) { showToast("Podaj poprawny e-mail.", "error"); return; }
  if (!body) { showToast("Podaj treść wiadomości.", "error"); return; }
  if (status) status.textContent = "Wysyłam…";

  // Upload attachments
  const fileInput = document.getElementById("composeAttachmentInput");
  const uploadedAttachments = [];
  if (fileInput?.files?.length) {
    for (const file of fileInput.files) {
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await adminFetch("/attachments/upload", { method: "POST", body: fd });
      const upJson = await upRes.json().catch(() => ({}));
      if (!upRes.ok) {
        showToast(`Błąd uploadu: ${upJson.error || upRes.status}${upJson.details ? " — " + upJson.details : ""}`, "error");
        if (status) status.textContent = "";
        return;
      }
      if (upJson.ok) uploadedAttachments.push(upJson);
    }
  }

  try {
    const res = await adminFetch("/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: to, subject, body, quote: quote || undefined, report_id: reportId || undefined, attachments: uploadedAttachments.length ? uploadedAttachments : undefined }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast(t("settings.reports.compose.sent") || "Wysłano.", "success");
    closeCompose();
    await loadMailFolder({ silent: true });
  } catch (err) {
    if (status) status.textContent = "";
    showToast(String(err?.message || err), "error");
  }
}

function wireReportsEvents() {
  // Folder nav
  document.querySelectorAll(".mail-folder").forEach(el => {
    el.addEventListener("click", async () => {
      document.querySelectorAll(".mail-folder").forEach(f => f.classList.remove("active"));
      el.classList.add("active");
      msgActiveFolder = el.dataset.folder;
      msgActiveId = null;
      const conv = document.getElementById("mailConv");
      if (conv) {
        conv.innerHTML = `<div class="mail-conv-placeholder"><div style="font-size:48px;margin-bottom:12px;opacity:.3">✉</div><div style="opacity:.4;font-size:13px">${t("settings.reports.selectMsg") || "Wybierz wątek"}</div></div>`;
      }
      await loadMailFolder();
    });
  });

  document.getElementById("btnMailRefresh")?.addEventListener("click", () => loadMailFolder());
  document.getElementById("btnMailCompose")?.addEventListener("click", () => showCompose());

  document.getElementById("mailSearch")?.addEventListener("input", (e) => {
    msgSearchQuery = e.target.value;
    renderMailList(msgRows);
  });

  // Assign modal wiring
  document.getElementById("btnAssignConfirm")?.addEventListener("click", async () => {
    const modal = document.getElementById("assignReportModal");
    const messageId = modal?.dataset.messageId;
    if (!messageId) return;

    const selected = document.querySelector(".assign-report-option.selected");
    if (selected) {
      await doAssign(messageId, selected.dataset.reportId, false);
      return;
    }

    const newSubject = (document.getElementById("assignNewSubject")?.value || "").trim();
    if (newSubject) {
      const withQuote = document.getElementById("assignQuoteCheck")?.checked ?? false;
      await doCreateAndAssign(messageId, newSubject, withQuote);
      return;
    }

    showToast("Wybierz zgłoszenie lub podaj temat nowego.", "error");
  });

  document.getElementById("btnAssignCancel")?.addEventListener("click", closeAssignModal);
  document.getElementById("assignReportModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeAssignModal();
  });

  // Cleanup trash
  document.getElementById("btnCleanupTrash")?.addEventListener("click", async () => {
    try {
      const res = await adminFetch("/cleanup/trash", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      showToast(`Usunięto ${json.deleted || 0} elementów.`, "success");
      if (msgActiveFolder === "trash") await loadMailFolder({ silent: true });
    } catch (err) {
      showToast(String(err?.message || err), "error");
    }
  });
}

function adminFetch(path, init = {}) {
  return fetch(`/_admin_api${path}`, init);
}

function escSetting(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wireMarketplaceEvents() {
  // Tab wewnętrzne
  const tabs = [
    { id: "mktTabPending",   status: "pending" },
    { id: "mktTabPublished", status: "published" },
    { id: "mktTabRejected",  status: "rejected" },
    { id: "mktTabWithdrawn", status: "withdrawn" },
  ];
  for (const { id, status } of tabs) {
    document.getElementById(id)?.addEventListener("click", async () => {
      tabs.forEach(t => document.getElementById(t.id)?.classList.toggle("active", t.id === id));
      marketActiveStatus = status;
      await loadMarketplace();
    });
  }

  // Odśwież
  document.getElementById("btnMarketRefresh")?.addEventListener("click", () => loadMarketplace());

  // Sync Storage
  // Telegram config
  document.getElementById("btnTelegramTest")?.addEventListener("click", testTelegram);

  // Delegacja kliknięć w tabeli
  document.getElementById("marketTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const previewId = btn.dataset.marketPreview;
    const approveId = btn.dataset.marketApprove;
    const rejectId  = btn.dataset.marketReject;
    if (previewId) await openMarketPreview(previewId);
    if (approveId) await approveMarketGame(approveId);
    if (rejectId)  openRejectModal(rejectId);
  });

  // Modal podglądu
  document.getElementById("btnMarketPreviewClose")?.addEventListener("click", closeMarketPreview);
  document.getElementById("btnMarketPreviewApprove")?.addEventListener("click", () => {
    if (marketPreviewId) approveMarketGame(marketPreviewId);
  });
  document.getElementById("btnMarketPreviewReject")?.addEventListener("click", () => {
    if (marketPreviewId) { const id = marketPreviewId; closeMarketPreview(); openRejectModal(id); }
  });
  document.getElementById("btnMarketPreviewWithdraw")?.addEventListener("click", () => {
    if (marketPreviewId) adminForceWithdraw(marketPreviewId);
  });
  document.getElementById("btnMarketPreviewDelete")?.addEventListener("click", () => {
    if (marketPreviewId) adminHardDelete(marketPreviewId);
  });
  document.getElementById("marketPreviewOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeMarketPreview();
  });

  // Modal reject
  document.getElementById("btnMarketRejectCancel")?.addEventListener("click", closeRejectModal);
  document.getElementById("btnMarketRejectConfirm")?.addEventListener("click", confirmReject);
  document.getElementById("marketRejectOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeRejectModal();
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
    updateMailCategoryHighlights();
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

function renderLogsPagination(total, page, perPage, pages) {
  const el = els.mailLogsPagination;
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ""; return; }

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const frag = document.createDocumentFragment();

  const info = document.createElement("span");
  info.className = "logs-page-info";
  info.textContent = `${from}–${to} / ${total}`;
  frag.appendChild(info);

  const nav = document.createElement("div");
  nav.className = "logs-page-nav";

  const prevBtn = document.createElement("button");
  prevBtn.className = "btn sm";
  prevBtn.textContent = "‹";
  prevBtn.disabled = page <= 1;
  prevBtn.addEventListener("click", () => void loadMailLogs({ page: page - 1 }));
  nav.appendChild(prevBtn);

  // Page buttons — show up to 7 around current page
  const windowSize = 7;
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(pages, start + windowSize - 1);
  if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);

  if (start > 1) {
    const btn = document.createElement("button");
    btn.className = "btn sm";
    btn.textContent = "1";
    btn.addEventListener("click", () => void loadMailLogs({ page: 1 }));
    nav.appendChild(btn);
    if (start > 2) {
      const dots = document.createElement("span");
      dots.className = "logs-page-dots";
      dots.textContent = "…";
      nav.appendChild(dots);
    }
  }

  for (let i = start; i <= end; i++) {
    const btn = document.createElement("button");
    btn.className = "btn sm" + (i === page ? " is-active" : "");
    btn.textContent = String(i);
    if (i !== page) btn.addEventListener("click", () => void loadMailLogs({ page: i }));
    nav.appendChild(btn);
  }

  if (end < pages) {
    if (end < pages - 1) {
      const dots = document.createElement("span");
      dots.className = "logs-page-dots";
      dots.textContent = "…";
      nav.appendChild(dots);
    }
    const btn = document.createElement("button");
    btn.className = "btn sm";
    btn.textContent = String(pages);
    btn.addEventListener("click", () => void loadMailLogs({ page: pages }));
    nav.appendChild(btn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn sm";
  nextBtn.textContent = "›";
  nextBtn.disabled = page >= pages;
  nextBtn.addEventListener("click", () => void loadMailLogs({ page: page + 1 }));
  nav.appendChild(nextBtn);

  frag.appendChild(nav);
  el.innerHTML = "";
  el.appendChild(frag);
}

async function loadMailLogs({ silent = false, page } = {}) {
  if (page !== undefined) mailLogsPage = page;
  try {
    const fn = String(mailLogFnValue || "all");
    const level = String(mailLogLevelValue || "all");
    const perPage = clampInt(els.mailLogPerPage?.value, 10, 200, 50);
    mailLogsPerPage = perPage;
    const res = await apiFetch(
      `${API_BASE}/mail/logs?fn=${encodeURIComponent(fn)}&level=${encodeURIComponent(level)}&per_page=${perPage}&page=${mailLogsPage}`,
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
    const total = Number(data?.total ?? 0);
    const pages = Number(data?.pages ?? 1);
    mailLogsPage = Number(data?.page ?? mailLogsPage);
    renderLogRows(rows);
    renderLogsPagination(total, mailLogsPage, perPage, pages);
    if (els.mailLogsInfo) {
      const cntSent = rows.filter((r) => r.event === "provider_success" || r.event === "queue_item_sent").length;
      const cntFailed = rows.filter((r) => r.event === "queue_item_failed" || r.event === "all_providers_failed").length;
      const cntSkippedFlag = rows.filter((r) => r.event === "email_skipped" && r.provider === "skipped_user_flag").length;
      const cntSkippedSup = rows.filter((r) => r.event === "email_skipped" && r.provider === "skipped_suppression").length;
      const cntSkipped = cntSkippedFlag + cntSkippedSup;
      const parts = [t("settings.mail.rows").replace("{count}", String(total))];
      if (cntSent) parts.push(t("settings.mail.statsSent").replace("{count}", String(cntSent)));
      if (cntFailed) parts.push(t("settings.mail.statsFailed").replace("{count}", String(cntFailed)));
      if (cntSkipped) {
        const skipDetail = [
          cntSkippedFlag ? t("settings.mail.statsSkippedFlag").replace("{count}", String(cntSkippedFlag)) : "",
          cntSkippedSup ? t("settings.mail.statsSkippedSup").replace("{count}", String(cntSkippedSup)) : "",
        ].filter(Boolean).join(", ");
        parts.push(`${t("settings.mail.statsSkipped").replace("{count}", String(cntSkipped))} (${skipDetail})`);
      }
      els.mailLogsInfo.textContent = parts.join(" · ");
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
      .map((t) => ({ value: t.path, label: t.title }));
    if (items.length) return items;
  } catch(e) {
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
  toolsOptions = [{ value: "", label: t("settings.tabs.tools") }, ...items];

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
  window.activeTab = tab; // dla generator.js
  const btn = document.getElementById("btnTabMaintenance");
  const btnMail = document.getElementById("btnTabMail");
  const btnMarket = document.getElementById("btnTabMarketplace");
  const btnRatings = document.getElementById("btnTabRatings");
  const btnStats = document.getElementById("btnTabStats");
  const btnGen = document.getElementById("btnTabGenerator");
  const btnReports = document.getElementById("btnTabReports");
  const tools = document.getElementById("toolsSelect");
  if (btn) btn.classList.toggle("active", tab === "maintenance");
  if (btnMail) btnMail.classList.toggle("active", tab === "mail");
  if (btnMarket) btnMarket.classList.toggle("active", tab === "marketplace");
  if (btnRatings) btnRatings.classList.toggle("active", tab === "ratings");
  if (btnStats) btnStats.classList.toggle("active", tab === "stats");
  if (btnGen) btnGen.classList.toggle("active", tab === "generator");
  if (btnReports) btnReports.classList.toggle("active", tab === "reports");
  if (tools) tools.classList.toggle("active", tab === "tools");
  if (els.maintenancePanel) els.maintenancePanel.hidden = tab !== "maintenance";
  if (els.mailPanel) els.mailPanel.hidden = tab !== "mail";
  if (els.marketplacePanel) els.marketplacePanel.hidden = tab !== "marketplace";
  if (els.ratingsPanel) els.ratingsPanel.hidden = tab !== "ratings";
  if (els.statsPanel) els.statsPanel.hidden = tab !== "stats";
  if (els.generatorPanel) els.generatorPanel.hidden = tab !== "generator";
  if (els.reportsPanel) els.reportsPanel.hidden = tab !== "reports";
  if (els.mailPanel) els.mailPanel.style.display = tab === "mail" ? "" : "none";
  if (els.marketplacePanel) els.marketplacePanel.style.display = tab === "marketplace" ? "" : "none";
  if (els.ratingsPanel) els.ratingsPanel.style.display = tab === "ratings" ? "" : "none";
  if (els.statsPanel) els.statsPanel.style.display = tab === "stats" ? "" : "none";
  if (els.generatorPanel) els.generatorPanel.style.display = tab === "generator" ? "" : "none";
  if (els.reportsPanel) els.reportsPanel.style.display = tab === "reports" ? "" : "none";

  if (tab === "generator" && window.resetGeneratorSession) {
    window.resetGeneratorSession();
  }
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

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wireStatsEvents() {
  if (els.btnStatsRefresh) {
    els.btnStatsRefresh.addEventListener("click", () => {
      loadAdminStats();
      loadRetentionStats();
    });
  }
}

function wireRatingsEvents() {
  if (els.btnRatingsRefresh) {
    els.btnRatingsRefresh.addEventListener("click", () => loadRatings());
  }
}

function wireEvents() {
  const markDirty = () => {
    formDirty = true;
  };

  if (els.btnTabStats) {
    els.btnTabStats.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("stats");
      await Promise.all([loadAdminStats({ silent: true }), loadRetentionStats()]);
    });
  }

  if (els.btnTabRatings) {
    els.btnTabRatings.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("ratings");
      await loadRatings({ silent: true });
    });
  }

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

  if (els.btnTabMarketplace) {
    els.btnTabMarketplace.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("marketplace");
      await loadMarketplace({ silent: true });
    });
  }

  if (els.btnTabGenerator) {
    els.btnTabGenerator.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("generator");
    });
  }

  if (els.btnTabReports) {
    els.btnTabReports.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("reports");
      await loadMailFolder({ silent: true });
    });
  }

  wireMarketplaceEvents();
  wireReportsEvents();
  wireRatingsEvents();
  wireStatsEvents();

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
      } catch(e) {
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
    } catch(e) {
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
    mailLogsPage = 1;
    await loadMailLogs();
  });

  els.mailLogPerPage?.addEventListener("change", () => {
    mailLogsPage = 1;
    void loadMailLogs();
  });

  els.btnMailLogsHelp?.addEventListener("click", () => {
    toggleMailLogsHelp();
  });

  els.btnMailRunWorker?.addEventListener("click", async () => {
    markUserAction();
    try {
      await runMailWorker();
    } catch(e) {
      if (shouldShowActionError()) showToast(t("settings.toast.error"), "error");
    }
  });

  els.btnMailRetryFailed?.addEventListener("click", async () => {
    markUserAction();
    try {
      await runMailWorker({ requeueFailed: true });
    } catch(e) {
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
    } catch(e) {
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
