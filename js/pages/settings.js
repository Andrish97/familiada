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

<<<<<<< HEAD
import { initI18n, t, getUiLang } from "../../translation/translation.js?v=v2026-04-23T17271";
import { initUiSelect } from "../core/ui-select.js?v=v2026-04-23T17271";
import { confirmModal } from "../core/modal.js?v=v2026-04-23T17271";
import { sb } from "../core/supabase.js?v=v2026-04-23T17271";
import { v as cacheBust } from "../core/cache-bust.js?v=v2026-04-23T17271";
=======
import { initI18n, t, getUiLang } from "../../translation/translation.js?v=v2026-04-23T22255";
import { initUiSelect } from "../core/ui-select.js?v=v2026-04-23T22255";
import { confirmModal } from "../core/modal.js?v=v2026-04-23T22255";
import { sb } from "../core/supabase.js?v=v2026-04-23T22255";
import { v as cacheBust } from "../core/cache-bust.js?v=v2026-04-23T22255";
>>>>>>> 3b9d02497ee77b4707ad719247efae14a45e4180

const API_BASE = "/_admin_api";
const TOOLS_MANIFEST = "/settings-tools/tools.json";
const POLL_MS = 15000;
const MINUTES_MIN = 10;
const MAIL_PROVIDERS = ["brevo", "mailgun", "sendpulse", "mailerlite"];
const EMAIL_TEMPLATES = {
  custom: "",
  info: "Dziękujemy za wiadomość. Odpowiemy tak szybko, jak to możliwe.",
  received: "Twoja wiadomość została odebrana. Zajmiemy się nią wkrótce.",
  resolved: "Twoje zgłoszenie zostało rozwiązane. Jeśli masz dodatkowe pytania, odpowiedz na tę wiadomość.",
  pending: "Twoje zgłoszenie jest w trakcie realizacji. Otrzymasz aktualizację, gdy tylko będziemy mieli więcej informacji.",
  more_info: "Aby lepiej zrozumieć Twój problem, prosimy o dodatkowe informacje:\n- Kiedy wystąpił problem?\n- Jakie kroki podjąłeś/aś przed wystąpieniem problemu?\n- Czy problem występuje nadal?",
  followup: "Chcielibyśmy się upewnić, że wszystko działa poprawnie. Czy masz jeszcze jakieś pytania lub wątpliwości?",
  closed: "To zgłoszenie zostało zamknięte. Jeśli potrzebujesz dalszej pomocy, utwórz nowe zgłoszenie.",
  thanks: "Dziękujemy za kontakt z nami. Miłego dnia!",
};

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
  marketingPanel: document.getElementById("marketingPanel"),
  marketingContactsPanel: document.getElementById("marketingContactsPanel"),
  btnTabMarketing: document.getElementById("btnTabMarketing"),
  btnTabMarketingContacts: document.getElementById("btnTabMarketingContacts"),
  btnRatingsRefresh: document.getElementById("btnRatingsRefresh"),
  btnStatsRefresh: document.getElementById("btnStatsRefresh"),
  ratingsTableBody: document.getElementById("ratingsTableBody"),
  ratingsTableInfo: document.getElementById("ratingsTableInfo"),
  ratingsGlobalStats: document.getElementById("ratingsGlobalStats"),
  statUsersTotal: document.getElementById("statUsersTotal"),
  statUsersGrowth: document.getElementById("statUsersGrowth"),
  statUsersLangs: document.getElementById("statUsersLangs"),
  statGamesTotal: document.getElementById("statGamesTotal"),
  statGamesGrowth: document.getElementById("statGamesGrowth"),
  statGamesQuality: document.getElementById("statGamesQuality"),
  statPlayedTotal: document.getElementById("statPlayedTotal"),
  statPlayedPeriods: document.getElementById("statPlayedPeriods"),
  statBuzzerActivity: document.getElementById("statBuzzerActivity"),
  statBasesTotal: document.getElementById("statBasesTotal"),
  statBasesGrowth: document.getElementById("statBasesGrowth"),
  statLogosTotal: document.getElementById("statLogosTotal"),
  statLogosGrowth: document.getElementById("statLogosGrowth"),
  statLogosSub: document.getElementById("statLogosSub"),
  statRating: document.getElementById("statRating"),
  statRatingsGrowth: document.getElementById("statRatingsGrowth"),
  statRatingsTotal: document.getElementById("statRatingsTotal"),
  statHealthMails: document.getElementById("statHealthMails"),
  statsUpdateTs: document.getElementById("statsUpdateTs"),
  maintenanceControls: document.getElementById("maintenanceControls"),
  maintenanceUseStandardText: document.getElementById("maintenanceUseStandardText"),
  maintenanceCustomCommentWrap: document.getElementById("maintenanceCustomCommentWrap"),
  maintenanceCustomCommentPl: document.getElementById("maintenanceCustomCommentPl"),
  maintenanceCustomCommentEn: document.getElementById("maintenanceCustomCommentEn"),
  maintenanceCustomCommentUk: document.getElementById("maintenanceCustomCommentUk"),
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
let aiProviderOrder = [];
let mailCronPresetValue = "5m";
let mailCronSupported = true;
let mailQueueStatusValue = "all";
let mailLogFnValue = "all";
let mailLogLevelValue = "all";
let mailLogsPage = 1;
let mailLogsPerPage = 50;
let mailCronSelect = null;
let mailGreetingValue = "witaj";
let mailFarewellValue = "team";
let mailGreetingCustomValue = "";
let mailFarewellCustomValue = "";
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
  
  if (els.maintenanceUseStandardText) {
    els.maintenanceUseStandardText.checked = state?.useStandardText ?? (state?.customComments?.pl || state?.customComments?.en || state?.customComments?.uk ? false : true);
    if (els.maintenanceCustomCommentWrap) {
      els.maintenanceCustomCommentWrap.hidden = els.maintenanceUseStandardText.checked;
    }
  }
  
  if (els.maintenanceCustomCommentPl) els.maintenanceCustomCommentPl.value = state?.customComments?.pl || "";
  if (els.maintenanceCustomCommentEn) els.maintenanceCustomCommentEn.value = state?.customComments?.en || "";
  if (els.maintenanceCustomCommentUk) els.maintenanceCustomCommentUk.value = state?.customComments?.uk || "";

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
  const common = {
    enabled: true,
    useStandardText: els.maintenanceUseStandardText?.checked ?? true,
    customComments: {
      pl: els.maintenanceCustomCommentPl?.value || null,
      en: els.maintenanceCustomCommentEn?.value || null,
      uk: els.maintenanceCustomCommentUk?.value || null
    }
  };

  if (currentMode === "message") {
    return { ...common, mode: "message", returnAt: null };
  }
  if (currentMode === "returnAt") {
    const date = getFieldValue("returnAt");
    return { ...common, mode: "returnAt", returnAt: date ? date.toISOString() : null };
  }
  if (currentMode === "countdown") {
    const date = getFieldValue("endAt");
    return { ...common, mode: "countdown", returnAt: date ? date.toISOString() : null };
  }
  return { ...common, mode: "message", returnAt: null };
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

function setStatus(msg) {
  const el = document.getElementById("statusValue");
  if (el) el.textContent = msg;
}

async function openMaintenancePreview() {
  const overlay = document.getElementById("maintenancePreviewOverlay");
  const frame = document.getElementById("maintenancePreviewFrame");
  if (!overlay || !frame) return;

  // Build preview HTML
  const useStandard = els.maintenanceUseStandardText?.checked ?? true;

  // Get language to preview based on current UI language
  const currentUiLang = (getUiLang() || "pl").toLowerCase();
  let customCommentRaw = "";
  if (currentUiLang.startsWith("pl")) customCommentRaw = els.maintenanceCustomCommentPl?.value || "";
  else if (currentUiLang.startsWith("uk")) customCommentRaw = els.maintenanceCustomCommentUk?.value || "";
  else customCommentRaw = els.maintenanceCustomCommentEn?.value || "";

  const state = currentState || {};  const mode = currentMode || state.mode || "message";
  const returnAtValue = (mode === "returnAt") ? getFieldValue("returnAt") : (mode === "countdown" ? getFieldValue("endAt") : null);
  
  let titleText = t("maintenance.title") || "TRWA PRZERWA TECHNICZNA";
  let messageText = t("maintenance.messageText") || "System jest chwilowo niedostępny. Za moment wszystko wróci do normy.";
  
  if (mode === "returnAt" && returnAtValue) {
    titleText = t("maintenance.returnAtTitle") || titleText;
    messageText = t("maintenance.returnAtText")?.replace("{returnAt}", formatReturnAtValue(returnAtValue)) || `Powrót o ${formatReturnAtValue(returnAtValue)}`;
  } else if (mode === "countdown" && returnAtValue) {
    titleText = t("maintenance.countdownTitle") || titleText;
    messageText = t("maintenance.countdownText") || "System wróci za: {countdown}";
  }

  let finalContentHtml = "";
  if (useStandard) {
    finalContentHtml = `
      <p>${escSetting(messageText)}</p>
      <div class="countdown" id="countdown" ${mode === "countdown" || mode === "returnAt" ? "" : "hidden"}>
        ${mode === "countdown" ? "00:00:00" : (returnAtValue ? formatReturnAtValue(returnAtValue) : "—")}
      </div>
    `;
  } else {
    // Custom text logic
    let customHtml = escSetting(customCommentRaw).replace(/\n/g, "<br>");
    
    // Replace #timer
    if (customHtml.includes("#timer")) {
      let timerReplacement = "";
      if (mode === "countdown") {
        timerReplacement = '<span class="countdown-inline">00:00:00</span>';
      } else if (mode === "returnAt" && returnAtValue) {
        timerReplacement = `<span class="countdown-inline">${formatReturnAtValue(returnAtValue)}</span>`;
      } else {
        timerReplacement = ""; // or some placeholder if no time
      }
      customHtml = customHtml.replace("#timer", timerReplacement);
    }
    
    finalContentHtml = `
      <div class="custom-maintenance-content">
        ${customHtml}
      </div>
    `;
  }

  const previewHtml = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link rel="stylesheet" href="/css/base.css"/>
  <link rel="stylesheet" href="/css/maintenance.css"/>
  <style>
    body{margin:0;padding:0}
    .custom-maintenance-content { font-size: 18px; line-height: 1.6; opacity: 0.9; }
    .countdown-inline { font-weight: bold; color: var(--gold); }
  </style>
</head>
<body class="maintenance-body">
  <header class="topbar topbar-layout-4 topbar-mobile-keep-brand">
    <div class="topbar-section topbar-section-1"><span class="brand">FAMILIADA</span></div>
    <div class="topbar-section topbar-section-2"></div>
    <div class="topbar-section topbar-section-3"></div>
    <div class="topbar-section topbar-section-4"></div>
  </header>
  <main class="maintenance-main">
    <section class="maintenance-card" role="status" aria-live="polite">
      <div class="card-top">
        <h1>${escSetting(titleText)}</h1>
        ${finalContentHtml}
      </div>
    </section>
  </main>
  <footer class="footer wrap">
    <span>Familiada — tryb konserwacji</span>
    <span>Masz pilną sprawę? Skontaktuj się z nami.</span>
  </footer>
</body>
</html>`;

  frame.srcdoc = previewHtml;
  overlay.style.display = "block";
}

function closeMaintenancePreview() {
  const overlay = document.getElementById("maintenancePreviewOverlay");
  if (overlay) overlay.style.display = "none";
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
    if (els.statGamesGrowth) els.statGamesGrowth.textContent = `Dziś: ${data.games.new_today} | 7 dni: ${data.games.new_7d} | 30 dni: ${data.games.new_30d}`;
    if (els.statGamesQuality) els.statGamesQuality.textContent = `Gotowe: ${data.games.ready} | Śr. pytań: ${data.games.avg_q}`;

    if (els.statPlayedTotal) els.statPlayedTotal.textContent = data.gameplay.played_30d;
    if (els.statPlayedPeriods) els.statPlayedPeriods.textContent = `Dziś: ${data.gameplay.played_today} | 7 dni: ${data.gameplay.played_7d} | 30 dni: ${data.gameplay.played_30d}`;
    if (els.statBuzzerActivity) els.statBuzzerActivity.textContent = `Buzzer 7d: ${data.gameplay.buzzer_7d} | Sesje ankiet 7d: ${data.polls.sessions_7d}`;

    if (els.statBasesTotal) els.statBasesTotal.textContent = data.bases.total;
    if (els.statBasesGrowth) els.statBasesGrowth.textContent = `Dziś: ${data.bases.new_today} | 7 dni: ${data.bases.new_7d} | 30 dni: ${data.bases.new_30d}`;

    if (els.statLogosTotal) els.statLogosTotal.textContent = data.logos.total;
    if (els.statLogosGrowth) els.statLogosGrowth.textContent = `Dziś: ${data.logos.new_today} | 7 dni: ${data.logos.new_7d} | 30 dni: ${data.logos.new_30d}`;
    if (els.statLogosSub) els.statLogosSub.textContent = `Aktywne: ${data.logos.active}`;

    if (els.statRating) els.statRating.textContent = `${data.ratings.average} / 5`;
    if (els.statRatingsGrowth) els.statRatingsGrowth.textContent = `Dziś: ${data.ratings.new_today} | 7 dni: ${data.ratings.new_7d} | 30 dni: ${data.ratings.new_30d}`;
    if (els.statRatingsTotal) els.statRatingsTotal.textContent = `Łącznie: ${data.ratings.total}`;
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
  const { funnel, retention } = data;
  const total = funnel.registered || 1;
  const d7pct  = retention.d7.cohort  ? Math.round(retention.d7.returned  / retention.d7.cohort  * 100) : null;
  const d30pct = retention.d30.cohort ? Math.round(retention.d30.returned / retention.d30.cohort * 100) : null;

  const sep = `<tr><td colspan="3" style="padding:4px 0 2px"><div style="border-top:1px solid rgba(255,255,255,.08)"></div></td></tr>`;
  const row = (label, value, percent, color) => `
    <tr>
      <td style="padding:5px 0;opacity:.6;font-size:12px">${label}</td>
      <td style="padding:5px 0;text-align:right;font-weight:700">${value}</td>
      <td style="padding:5px 0;text-align:right;padding-left:10px;font-size:12px;color:${color || "inherit"};opacity:.8">${percent}</td>
    </tr>`;

  tbody.innerHTML = `
    ${row("1. Zarejestrowani", funnel.registered, "100%", "inherit")}
    ${row("2. Stworzyli grę", funnel.game_created, pct(funnel.game_created, total), funnel.game_created / total >= 0.3 ? "#4caf50" : "#ffc107")}
    ${row("3. Uruchomili rozgrywkę", funnel.game_played, pct(funnel.game_played, total), funnel.game_played / total >= 0.1 ? "#4caf50" : funnel.game_played > 0 ? "#ffc107" : "#ff5722")}
    ${row("Nigdy aktywni", funnel.never_active, pct(funnel.never_active, total), "#ff5722")}
    ${sep}
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

function renderExcludedList(users) {
  const el = document.getElementById("excludedList");
  if (!el) return;
  if (!users.length) {
    el.innerHTML = `<div style="opacity:.4;font-size:12px">Brak wykluczonych kont.</div>`;
    return;
  }
  el.innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;font-size:12px">
      <span><b>${u.username || "—"}</b> <span style="opacity:.4">${u.email}</span></span>
      <button class="btn xs" type="button" data-uid="${u.user_id}" style="opacity:.6">Usuń</button>
    </div>`).join("");

  el.querySelectorAll("[data-uid]").forEach(btn => {
    btn.addEventListener("click", () => removeExcludedUser(btn.dataset.uid));
  });
}

async function loadExcludedUsers() {
  try {
    const { data, error } = await sb().rpc("stats_excluded_list");
    if (error) throw error;
    renderExcludedList(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("[settings] loadExcludedUsers error:", e);
  }
}

async function addExcludedUser() {
  const input = document.getElementById("excludeUsernameInput");
  const msg   = document.getElementById("excludeMsg");
  const username = input?.value?.trim();
  if (!username || !msg) return;
  msg.textContent = "";
  try {
    const { data, error } = await sb().rpc("stats_exclude_user", { p_username: username });
    if (error) throw error;
    if (!data.ok) {
      msg.style.color = "#ff5722";
      msg.textContent = data.err === "not_found" ? "Nie znaleziono użytkownika." : data.err;
      return;
    }
    msg.style.color = "#4caf50";
    msg.textContent = `Wykluczono: ${username}`;
    input.value = "";
    await loadExcludedUsers();
  } catch (e) {
    msg.style.color = "#ff5722";
    msg.textContent = "Błąd: " + (e.message || e);
  }
}

async function removeExcludedUser(userId) {
  try {
    const { error } = await sb().rpc("stats_unexclude_user", { p_user_id: userId });
    if (error) throw error;
    await loadExcludedUsers();
  } catch (e) {
    console.error("[settings] removeExcludedUser error:", e);
  }
}

async function loadRetentionStats() {
  try {
    const { data, error } = await sb().rpc("get_retention_stats");
    if (error) throw error;
    if (!data?.funnel) throw new Error("get_retention_stats: unexpected response shape: " + JSON.stringify(data));
    renderRetentionTable(data);
    renderSegmentBars(data.segments, data.funnel.registered);
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
    const { data, error } = await sb().rpc("get_ratings_admin");

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      if (els.ratingsTableBody) els.ratingsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;opacity:.5">Brak ocen.</td></tr>';
      return;
    }

    if (els.ratingsTableBody) {
      els.ratingsTableBody.innerHTML = rows.map(r => {
        const date = new Date(r.created_at).toLocaleString();
        const user = r.username || r.email || "Nieznany";
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

function getGreetingOptions() {
  return [
    { value: "none", label: t("settings.mail.greetingOptions.none") || "Brak powitania" },
    { value: "witaj", label: t("settings.mail.greetingOptions.witaj") || "Witaj" },
    { value: "hello", label: t("settings.mail.greetingOptions.hello") || "Dzień dobry" },
    { value: "hi", label: t("settings.mail.greetingOptions.hi") || "Cześć" },
    { value: "dearUser", label: t("settings.mail.greetingOptions.dearUser") || "Szanowny Użytkowniku" },
    { value: "dearCustomer", label: t("settings.mail.greetingOptions.dearCustomer") || "Szanowny Kliencie" },
    { value: "custom", label: t("settings.mail.greetingOptions.custom") || "Własne..." },
  ];
}

function getFarewellOptions() {
  return [
    { value: "none", label: t("settings.mail.farewellOptions.none") || "Brak pożegnania" },
    { value: "regards", label: t("settings.mail.farewellOptions.regards") || "Pozdrawiam" },
    { value: "regardsPl", label: t("settings.mail.farewellOptions.regardsPl") || "Pozdrawiamy" },
    { value: "bestRegards", label: t("settings.mail.farewellOptions.bestRegards") || "Z poważaniem" },
    { value: "kindRegards", label: t("settings.mail.farewellOptions.kindRegards") || "Łączę wyrazy szacunku" },
    { value: "custom", label: t("settings.mail.farewellOptions.custom") || "Własne..." },
  ];
}

function getSenderOptions() {
  return [
    { value: "none", label: t("settings.mail.senderOptions.none") || "Brak nadawcy" },
    { value: "team", label: t("settings.mail.senderOptions.team") || "Zespół Familiada" },
    { value: "creator", label: t("settings.mail.senderOptions.creator") || "Twórca Familiada" },
    { value: "admin", label: t("settings.mail.senderOptions.admin") || "Admin" },
    { value: "support", label: t("settings.mail.senderOptions.support") || "Wsparcie techniczne" },
    { value: "custom", label: t("settings.mail.senderOptions.custom") || "Własny..." },
  ];
}

function buildEmailSignature({ greeting = "none", farewell = "none", sender = "none", greetingCustom = "", farewellCustom = "", senderCustom = "" } = {}) {
  let greetingText = "";
  if (greeting === "custom" && greetingCustom) {
    greetingText = greetingCustom.trim();
  } else if (greeting !== "none" && greeting !== "custom") {
    greetingText = {
      witaj: t("settings.mail.greetingOptions.witaj") || "Witaj",
      hello: t("settings.mail.greetingOptions.hello") || "Dzień dobry",
      hi: t("settings.mail.greetingOptions.hi") || "Cześć",
      dearUser: t("settings.mail.greetingOptions.dearUser") || "Szanowny Użytkowniku",
      dearCustomer: t("settings.mail.greetingOptions.dearCustomer") || "Szanowny Kliencie",
    }[greeting] || "";
  }

  let farewellText = "";
  if (farewell === "custom" && farewellCustom) {
    farewellText = farewellCustom.trim();
  } else if (farewell !== "none" && farewell !== "custom") {
    farewellText = {
      regards: t("settings.mail.farewellOptions.regards") || "Pozdrawiam",
      regardsPl: t("settings.mail.farewellOptions.regardsPl") || "Pozdrawiamy",
      bestRegards: t("settings.mail.farewellOptions.bestRegards") || "Z poważaniem",
      kindRegards: t("settings.mail.farewellOptions.kindRegards") || "Łączę wyrazy szacunku",
    }[farewell] || "";
  }

  let senderText = "";
  if (sender === "custom" && senderCustom) {
    senderText = senderCustom.trim();
  } else if (sender !== "none" && sender !== "custom") {
    senderText = {
      team: t("settings.mail.senderOptions.team") || "Zespół Familiada",
      creator: t("settings.mail.senderOptions.creator") || "Twórca Familiada",
      admin: t("settings.mail.senderOptions.admin") || "Admin",
      support: t("settings.mail.senderOptions.support") || "Wsparcie techniczne",
    }[sender] || "";
  }

  // Combine farewell and sender
  if (farewellText && senderText) {
    farewellText = `${farewellText},\n${senderText}`;
  } else if (farewellText) {
    farewellText = `${farewellText},`;
  }

  const parts = [];
  if (greetingText) parts.push(greetingText);
  if (farewellText) parts.push(farewellText);

  return parts.length ? parts.join("\n\n") : "";
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
  console.log("Rendering providers:", mailProviderOrder);
  if (!els.mailProviderOrderList) {
    console.error("List element not found!");
    return;
  }
  els.mailProviderOrderList.innerHTML = "";
  
  mailProviderOrder.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "provider-order-row";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "12px";
    row.style.padding = "10px 14px";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
    row.style.background = p.is_active ? "transparent" : "rgba(255,0,0,0.05)";

    const activeCheck = document.createElement("input");
    activeCheck.type = "checkbox";
    activeCheck.checked = p.is_active !== false;
    activeCheck.title = "Active";
    activeCheck.addEventListener("change", (e) => {
      p.is_active = e.target.checked;
      row.style.background = p.is_active ? "transparent" : "rgba(255,0,0,0.05)";
    });

    const rank = document.createElement("div");
    rank.className = "provider-order-rank";
    rank.style.width = "20px";
    rank.style.fontSize = "12px";
    rank.style.opacity = "0.5";
    rank.textContent = String(idx + 1);

    const info = document.createElement("div");
    info.style.flex = "1";
    
    const label = document.createElement("div");
    label.style.fontWeight = "600";
    label.textContent = p.label || p.name;
    
    const stats = document.createElement("div");
    stats.style.fontSize = "11px";
    stats.style.opacity = "0.7";
    stats.style.marginTop = "4px";
    stats.style.display = "flex";
    stats.style.flexDirection = "column";
    stats.style.gap = "4px";

    const remW = p.rem_worker ?? 0;
    const remI = p.rem_immediate ?? 0;
    const total = p.daily_limit ?? 0;
    const limitW = Math.floor(total * 0.8);
    const limitI = total - limitW;

    const createBar = (current, max, label) => {
      const perc = max > 0 ? Math.round((current / max) * 100) : 0;
      const color = perc > 20 ? "#4ade80" : perc > 5 ? "#fbbf24" : "#f87171";
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "6px";
      
      const lbl = document.createElement("span");
      lbl.style.width = "65px";
      lbl.textContent = label;
      
      const barBg = document.createElement("div");
      barBg.style.flex = "1";
      barBg.style.height = "6px";
      barBg.style.background = "rgba(255,255,255,0.1)";
      barBg.style.borderRadius = "3px";
      barBg.style.overflow = "hidden";
      
      const barFill = document.createElement("div");
      barFill.style.width = `${perc}%`;
      barFill.style.height = "100%";
      barFill.style.background = color;
      barFill.style.transition = "width 0.3s ease";
      
      const val = document.createElement("span");
      val.style.width = "60px";
      val.style.textAlign = "right";
      val.textContent = `${current}/${max}`;
      
      barBg.appendChild(barFill);
      wrap.append(lbl, barBg, val);
      return wrap;
    };

    stats.appendChild(createBar(remW, limitW, "Worker"));
    stats.appendChild(createBar(remI, limitI, "Immediate"));
    
    info.append(label, stats);

    const limitInput = document.createElement("input");
    limitInput.type = "number";
    limitInput.className = "inp sm";
    limitInput.style.width = "80px";
    limitInput.style.textAlign = "center";
    limitInput.value = String(p.daily_limit || 1000);
    limitInput.title = "Daily Limit";
    limitInput.addEventListener("change", (e) => {
      p.daily_limit = parseInt(e.target.value) || 0;
    });

    const actions = document.createElement("div");
    actions.className = "provider-order-actions";
    actions.style.display = "flex";
    actions.style.gap = "6px";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn sm";
    up.innerHTML = '<span style="font-size:14px">↑</span>';
    up.disabled = idx === 0;
    up.addEventListener("click", () => {
      if (idx <= 0) return;
      [mailProviderOrder[idx - 1], mailProviderOrder[idx]] = [mailProviderOrder[idx], mailProviderOrder[idx - 1]];
      renderProviderOrder();
    });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn sm";
    down.innerHTML = '<span style="font-size:14px">↓</span>';
    down.disabled = idx >= mailProviderOrder.length - 1;
    down.addEventListener("click", () => {
      if (idx >= mailProviderOrder.length - 1) return;
      [mailProviderOrder[idx + 1], mailProviderOrder[idx]] = [mailProviderOrder[idx], mailProviderOrder[idx + 1]];
      renderProviderOrder();
    });

    actions.append(up, down);
    row.append(activeCheck, rank, info, limitInput, actions);
    els.mailProviderOrderList?.appendChild(row);
  });
}

let aiProviders = []; // Pełne obiekty dostawców z bazy

function aiProviderLabel(providerObj) {
  if (providerObj.label) return providerObj.label;
  return providerObj.name.charAt(0).toUpperCase() + providerObj.name.slice(1);
}

function renderAiProviderOrder() {
  const el = document.getElementById("aiProviderOrderList");
  if (!el) return;
  el.innerHTML = "";
  
  aiProviders.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "provider-order-row";
    row.style.marginBottom = "8px";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";

    const rank = document.createElement("div");
    rank.className = "provider-order-rank";
    rank.style.fontWeight = "bold";
    rank.textContent = String(idx + 1);

    const infoWrap = document.createElement("div");
    infoWrap.style.flex = "1";

    const name = document.createElement("div");
    name.className = "provider-order-name";
    name.textContent = aiProviderLabel(p);

    const status = document.createElement("div");
    status.style.fontSize = "11px";
    
    const now = new Date();
    const cooldown = p.cooldown_until ? new Date(p.cooldown_until) : null;
    
    if (!p.is_active) {
      status.textContent = "Wyłączony";
      status.style.color = "#ff4d4d";
    } else if (cooldown && cooldown > now) {
      const diff = Math.ceil((cooldown - now) / 1000);
      const hours = Math.floor(diff / 3600);
      const mins = Math.ceil((diff % 3600) / 60);
      status.textContent = `Zablokowany (Quota) - jeszcze ${hours}h ${mins}m`;
      status.style.color = "#ffa500";
    } else {
      status.textContent = "Aktywny";
      status.style.color = "#00ff00";
    }
    
    infoWrap.append(name, status);

    const actions = document.createElement("div");
    actions.className = "provider-order-actions";
    actions.style.display = "flex";
    actions.style.gap = "4px";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn sm";
    up.textContent = "↑";
    up.disabled = (idx === 0);
    up.addEventListener("click", () => moveAiProvider(idx, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn sm";
    down.textContent = "↓";
    down.disabled = (idx === aiProviders.length - 1);
    down.addEventListener("click", () => moveAiProvider(idx, 1));

    actions.append(up, down);
    row.append(rank, infoWrap, actions);
    el.appendChild(row);
  });
}

async function saveAiProviderOrder() {
  try {
    // Aktualizuj priorytety dla wszystkich modeli w bazie
    const updates = aiProviders.map((p, idx) => 
      sb().from('marketing_ai_providers').update({ priority: idx }).eq('name', p.name)
    );
    await Promise.all(updates);
    showToast(`Kolejność AI zapisana.`);
  } catch(e) {
    console.warn("[AI] save order error:", e);
  }
}

async function loadAiProviderOrder() {
  try {
    const { data, error } = await sb()
      .from('marketing_ai_providers')
      .select('*')
      .order('priority', { ascending: true });
    
    if (error) throw error;
    if (data) {
      aiProviders = data;
      renderAiProviderOrder();
    }
  } catch(e) {
    console.warn("[AI] load providers error:", e);
  }
}

function moveAiProvider(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= aiProviders.length) return;
  const next = [...aiProviders];
  [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
  aiProviders = next;
  renderAiProviderOrder();
  saveAiProviderOrder();
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
  const ok = await confirmModal({ text: t("settings.marketplace.forceWithdrawConfirm") || "Wycofać tę grę? Zniknie z browse, ale zostanie w bibliotekach." });
  if (!ok) return;
  try {
    const res = await adminFetch("/marketplace/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
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
  const ok = await confirmModal({ text: t("settings.marketplace.hardDeleteConfirm") || "Usunąć grę na stałe? Zniknie u wszystkich użytkowników. Tego nie da się cofnąć." });
  if (!ok) return;
  try {
    const res = await adminFetch("/marketplace/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
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


async function loadProducerRatings() {
  const tbody = document.getElementById("producerRatingsBody");
  const info  = document.getElementById("producerRatingsInfo");
  if (!tbody) return;
  if (info) info.textContent = t("settings.marketplace.loading") || "Ładowanie…";
  try {
    const res = await adminFetch("/marketplace/producer-ratings");
    if (!res.ok) throw new Error(await res.text());
    const { rows } = await res.json();
    if (info) info.textContent = "";
    if (!rows || !rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;opacity:.6">Brak gier producenta.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(g => `<tr>
      <td>${escSetting(g.title)}</td>
      <td>${escSetting(g.lang.toUpperCase())}</td>
      <td>${g.avg_rating > 0 ? (+(g.avg_rating)).toFixed(1) + " ★" : "—"}</td>
      <td>${g.rating_count}</td>
      <td>${g.library_count}</td>
      <td><button class="btn sm" data-raters-id="${escSetting(g.id)}" data-raters-title="${escSetting(g.title)}" type="button">${t("settings.marketplace.producerRatersBtnView") || "Oceniający"}</button></td>
    </tr>`).join("");
    tbody.querySelectorAll("[data-raters-id]").forEach(btn => {
      btn.addEventListener("click", () => openRatersModal(btn.dataset.ratersId, btn.dataset.ratersTitle));
    });
  } catch (err) {
    if (info) info.textContent = String(err?.message || err);
  }
}

async function openRatersModal(gameId, title) {
  const overlay = document.getElementById("ratersOverlay");
  const body    = document.getElementById("ratersBody");
  const titleEl = document.getElementById("ratersTitle");
  if (!overlay || !body) return;
  if (titleEl) titleEl.textContent = title || t("settings.marketplace.producerRatersBtnView") || "Oceniający";
  body.innerHTML = t("settings.marketplace.loading") || "Ładowanie…";
  overlay.style.display = "";
  try {
    const res = await adminFetch(`/marketplace/game-raters?id=${encodeURIComponent(gameId)}`);
    if (!res.ok) throw new Error(await res.text());
    const { rows } = await res.json();
    if (!rows || !rows.length) {
      body.textContent = "Brak ocen.";
      return;
    }
    body.innerHTML = `<table class="mail-table"><thead><tr>
      <th>Użytkownik</th><th>Ocena</th><th>Data</th>
    </tr></thead><tbody>${rows.map(r =>
      `<tr>
        <td>${escSetting(r.username || "?")}</td>
        <td>${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)} (${r.stars})</td>
        <td>${new Date(r.rated_at).toLocaleString()}</td>
      </tr>`
    ).join("")}</tbody></table>`;
  } catch (err) {
    body.textContent = String(err?.message || err);
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
    } else if (msgActiveFolder === "marketing") {
      // Fetch ALL messages and filter for marketing (outbound + inbound replies)
      const res = await adminFetch(`/messages?filter=all&limit=500`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("[loadMailFolder] Marketing fetch ERROR:", errorText);
        throw new Error(errorText);
      }
      const json = await res.json();
      // Filter for marketing emails by is_marketing flag (includes replies to marketing)
      msgRows = (json.rows || []).filter(m =>
        m.is_marketing === true  // Both outbound campaigns AND inbound replies
      );
    } else {
      const res = await adminFetch(`/messages?filter=${encodeURIComponent(msgActiveFolder)}&limit=500`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("[loadMailFolder] Folder fetch ERROR:", errorText);
        throw new Error(errorText);
      }
      const json = await res.json();
      msgRows = json.rows || [];
      
      // For "sent" folder, also include marketing emails
      if (msgActiveFolder === "sent") {
        const marketingEmails = msgRows.filter(m =>
          m.direction === "outbound" &&
          m.is_marketing === true
        );
        // If we have marketing emails, reload from "all" to get everything
        if (marketingEmails.length > 0) {
          try {
            const allRes = await adminFetch(`/messages?filter=all&limit=500`);
            if (allRes.ok) {
              const allJson = await allRes.json();
              const allOutbound = (allJson.rows || []).filter(m => m.direction === "outbound");
              msgRows = allOutbound;
              msgRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
          } catch (e) { console.error("[loadMailFolder] sent merge error:", e); }
        }
      }
    }
    renderMailList(msgRows);
    // Refresh badge counts after loading folder
    loadFolderBadges();
  } catch (err) {
    if (!silent) showToast(String(err?.message || err), "error");
  }
}

function updateFolderBadges(inboxUnread, reportsOpen) {
  // Update badge elements with provided counts
  const badgeInbox = document.getElementById("badgeInbox");
  const badgeReports = document.getElementById("badgeReports");
  
  if (badgeInbox) {
    badgeInbox.textContent = inboxUnread;
    badgeInbox.classList.toggle("visible", inboxUnread > 0);
  }
  
  if (badgeReports) {
    badgeReports.textContent = reportsOpen;
    badgeReports.classList.toggle("visible", reportsOpen > 0);
  }
}

// Load unread counts on initial load and after folder changes
async function loadFolderBadges() {
  try {
    // Fetch inbox unread count
    const inboxRes = await adminFetch("/messages?filter=inbox&limit=100");
    let inboxUnread = 0;
    if (inboxRes.ok) {
      const inboxJson = await inboxRes.json();
      inboxUnread = (inboxJson.rows || []).filter(r => 
        !r.report_id && r.direction === "inbound" && !r.is_read
      ).length;
    }
    
    // Fetch reports open count
    const reportsRes = await adminFetch("/reports?status=all&limit=100");
    let reportsOpen = 0;
    if (reportsRes.ok) {
      const reportsJson = await reportsRes.json();
      reportsOpen = (reportsJson.rows || []).filter(r => 
        r.status === "open"
      ).length;
    }
    
    // Update badge elements
    updateFolderBadges(inboxUnread, reportsOpen);
  } catch (e) {
    console.error("[loadFolderBadges] error:", e);
  }
}

function isMarketingEmail(m) {
  // Check if message is a marketing email by is_marketing flag
  // This includes both outbound campaigns AND inbound replies (auto-tagged)
  return m.is_marketing === true;
}

function stripMarketingPrefix(subject) {
  // Remove [Marketing] prefix from subject for display
  return (subject || "").replace(/^\[Marketing\]\s*/i, "").trim();
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
      <div style="padding:0 20px 16px;text-align:center;opacity:.25;font-size:11px">${t("settings.reports.trashNote") || "Elementy starsze niż 30 dni są usuwane automatycznie"}</div>
      <div style="padding:0 20px 16px;text-align:center">
        <button class="btn sm" id="btnCleanupTrashInList" type="button" style="width:100%;opacity:.55;font-size:11px">${t("settings.reports.cleanupTrash") || "Wyczyść kosz (30d)"}</button>
      </div>`;
    document.getElementById("btnCleanupTrashInList")?.addEventListener("click", cleanupTrash);
    return;
  }

  // Trash with items: add cleanup button at bottom
  if (msgActiveFolder === "trash" && filtered.length) {
    const trashFooter = document.createElement("div");
    trashFooter.style.cssText = "padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);margin-top:auto";
    trashFooter.innerHTML = `<button class="btn sm" id="btnCleanupTrashInList" type="button" style="width:100%;opacity:.55;font-size:11px">${t("settings.reports.cleanupTrash") || "Wyczyść kosz (30d)"}</button>`;
    body.parentNode.appendChild(trashFooter);
    document.getElementById("btnCleanupTrashInList")?.addEventListener("click", cleanupTrash);
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

  if (msgActiveFolder === "marketing") {
    for (const r of filtered) {
      const item = document.createElement("div");
      const isInbound = r.direction === "inbound";
      item.className = "mail-thread-item" + (isInbound ? "" : "") + (r.id === msgActiveId ? " active" : "");
      item.dataset.msgId = r.id;
      const dateStr = new Date(r.created_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"2-digit" });
      const fromTo = isInbound
        ? `↙ ${escSetting(r.from_email || "—")}`
        : `📢 ${escSetting(r.to_email || "Kampania")}`;

      // Marketing badge for ALL marketing emails (already filtered by is_marketing flag)
      const marketingBadge = isMarketingEmail(r)
        ? `<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(255,234,166,.15);color:#ffeaa6;border:1px solid rgba(255,234,166,.3)">marketing</span>`
        : "";

      // Strip [Marketing] prefix from subject
      const displaySubject = stripMarketingPrefix(r.subject);
      // Ticket number badge for messages with tickets
      const ticketBadge = r.ticket_number ? `<span class="mail-ti-ticket-badge">${escSetting(r.ticket_number)}</span>` : "";

      item.innerHTML = `
        <div class="mail-ti-row">
          <span class="mail-ti-from">${fromTo}</span>
          <span class="mail-ti-date">${dateStr}</span>
        </div>
        <div class="mail-ti-subject" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${ticketBadge}${marketingBadge}${escSetting(displaySubject || "—")}</div>
        <div class="mail-ti-preview" style="opacity:.45">${isInbound ? 'Odpowiedź na kampanię' : 'Kampania marketingowa'}</div>`;
      item.addEventListener("click", () => openMessage(r.id));
      body.appendChild(item);
    }
    return;
  }

  for (const r of filtered) {
    const item = document.createElement("div");
    const isInbound = r.direction === "inbound";
    item.className = "mail-thread-item" + (!r.report_id && isInbound && !r.is_read ? " unread" : "") + (r.id === msgActiveId ? " active" : "");
    item.dataset.msgId = r.id;
    const dateStr = new Date(r.created_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"2-digit" });
    const sourceBadge = { email: "📧", form: "📝", compose: "✏" }[r.source] || "";
    const from = isInbound ? (r.from_email || "—") : (r.to_email || "—");

    // Ticket number badge for messages with tickets - displayed prominently
    const ticketBadge = r.ticket_number ? `<span class="mail-ti-ticket-badge">${escSetting(r.ticket_number)}</span>` : "";

    // Marketing badge for ALL marketing emails (outbound campaigns + inbound replies)
    const marketingBadge = isMarketingEmail(r)
      ? `<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(255,234,166,.15);color:#ffeaa6;border:1px solid rgba(255,234,166,.3);margin-right:4px">marketing</span>`
      : "";

    // Strip [Marketing] prefix from subject
    const displaySubject = stripMarketingPrefix(r.subject);
    
    // Extract ALL text from message for preview - show EVERYTHING
    let previewText = "";

    // Strategy 1: Try body_html first (has full HTML email)
    if (r.body_html) {
      const tmp = document.createElement("div");
      tmp.innerHTML = r.body_html;
      previewText = (tmp.textContent || tmp.innerText || "").trim();
    }

    // Strategy 2: Try body (might be plain text or HTML)
    if (!previewText && r.body) {
      if (r.body.trim().startsWith("<")) {
        // HTML - extract ALL text
        const tmp = document.createElement("div");
        tmp.innerHTML = r.body;
        previewText = (tmp.textContent || tmp.innerText || "").trim();
      } else {
        // Plain text
        previewText = r.body.trim();
      }
    }

    // Strategy 3: Final fallback - body_preview
    if (!previewText && r.body_preview) {
      // Aggressively strip <style> tags, HTML tags, and CSS content
      previewText = r.body_preview
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove <style> blocks
        .replace(/:[^;]+;/g, '')  // Remove CSS properties like :root{color-scheme:dark}
        .replace(/^[^a-zA-Z0-9]*[A-Z]{2,}[^a-zA-Z0-9]*/g, '')  // Remove leading CSS like :root{...}FAMILIADA
        .replace(/<[^>]*>/g, ' ')  // Strip remaining HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);  // Limit length
    }

    // Strategy 4: Emergency fallback - use subject if no content
    if (!previewText) {
      previewText = r.subject ? `(brak treści) ${r.subject}` : `(brak treści)`;
    }

    // Minimal cleanup - just normalize whitespace and limit length
    previewText = previewText
      .replace(/\n\s*\n/g, '\n')  // Remove empty lines
      .replace(/\s+/g, ' ')  // Collapse whitespace
      .slice(0, 80)  // Limit length
      .trim();

    item.innerHTML = `
      <div class="mail-ti-row">
        <span class="mail-ti-from">${sourceBadge} ${escSetting(from)}</span>
        <span class="mail-ti-date">${dateStr}</span>
      </div>
      <div class="mail-ti-subject" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${ticketBadge}${marketingBadge}${escSetting(displaySubject || "—")}</div>
      <div class="mail-ti-preview">${escSetting(previewText)}</div>`;
    item.addEventListener("click", () => openMessage(r.id));
    body.appendChild(item);
  }
}

async function openMessage(id) {
  
  msgActiveId = id;
  document.querySelectorAll(".mail-thread-item").forEach(el => {
    el.classList.toggle("active", el.dataset.msgId === id);
  });

  // Mark message as read
  try {
    const readRes = await adminFetch(`/messages/read?id=${encodeURIComponent(id)}`, { method: "POST" });
    
    if (!readRes.ok) {
      const readText = await readRes.text().catch(() => "N/A");
      console.error("[openMessage] /messages/read failed:", readRes.status, readText);
    }
    
    // Refresh badges and list after marking as read
    loadFolderBadges();
    loadMailFolder({ silent: true });
  } catch (e) {
    console.error("[openMessage] Error marking as read:", e);
  }

  const conv = document.getElementById("mailConv");
  if (!conv) return;
  conv.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;opacity:.35;font-size:12px">${t("settings.marketplace.loadingConv") || "Ładowanie…"}</div>`;

  try {
    const res = await adminFetch(`/messages/detail?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);

    const msg = json.message;

    // Fetch conversation thread (Apple Mail style - all messages in the same conversation)
    let threadMessages = [];
    try {
      const threadRes = await adminFetch(`/messages?filter=all&limit=500`);
      if (threadRes.ok) {
        const threadJson = await threadRes.json();
        const allMessages = threadJson.rows || [];
        
        // Find conversation by subject line (strip Re:/Fwd:/etc.)
        const baseSubject = msg.subject?.replace(/^(Re|Fwd|FW):\s*/gi, '').trim().toLowerCase();
        
        // Debug: log all subjects for comparison

        
        // Find all messages in this conversation
        threadMessages = allMessages.filter(m => {
          if (m.id === id) return false; // Exclude the central message (we render it separately)

          // Same ticket/report - highest priority
          if (msg.ticket_number && m.ticket_number === msg.ticket_number) {
            return true;
          }
          if (msg.report_id && m.report_id === msg.report_id) {
            return true;
          }

          // Same subject conversation + same participants (from/to)
          // This ensures we don't mix emails with same subject but different recipients
          if (baseSubject && baseSubject.length > 5 && m.subject) {
            const mSubject = m.subject.replace(/^(Re|Fwd|FW):\s*/gi, '').trim().toLowerCase();
            
            // Check if subjects match
            if (mSubject === baseSubject) {
              // Check if participants match (same conversation thread)
              const msgParticipants = new Set([
                (msg.from_email || "").toLowerCase(),
                (msg.to_email || "").toLowerCase()
              ]);
              const mParticipants = new Set([
                (m.from_email || "").toLowerCase(),
                (m.to_email || "").toLowerCase()
              ]);
              
              // Check if there's overlap in participants (at least one common email)
              const hasCommonParticipant = [...msgParticipants].some(p => 
                p && mParticipants.has(p)
              );
              
              if (hasCommonParticipant) {
                return true;
              } else {

              }
            } else {
            }
          }

          return false;
        });
        
        
        // Debug: show found messages with dates
        if (threadMessages.length > 0) {

        }
        
        // Sort by date (oldest first)
        threadMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      } else {
        console.error("[openMessage] Thread fetch failed:", threadRes.status);
      }
    } catch (e) { 
      console.error("[openMessage] Thread fetch error:", e); 
    }

    let attachments = [];
    try {
      const attRes = await adminFetch(`/attachments?message_id=${encodeURIComponent(id)}`);
      if (attRes.ok) {
        const attJson = await attRes.json();
        attachments = attJson.attachments || [];
      }
    } catch (e) { console.error("[openMessage] Attachments error:", e); }

    renderMessageDetail(msg, attachments, threadMessages);
  } catch (err) {
    console.error("[openMessage] Error:", err);
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

function renderSimpleMessageContent(bubble, msg) {
  const bodyEl = document.createElement("div");
  const htmlSrc = msg.body_html || (/<[a-z][\s\S]*>/i.test(msg.body || "") ? msg.body : null);
  if (htmlSrc) {
    bodyEl.className = "mail-msg-body-html";
    const frame = document.createElement("iframe");
    frame.className = "mail-msg-html-frame";
    frame.sandbox = "allow-scripts allow-popups";
    const wrappedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:8px;background:#050914;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.4;}a{color:#ffeaa6;}</style></head><body>${htmlSrc}</body></html>`;
    frame.srcdoc = wrappedHtml;
    bodyEl.appendChild(frame);
  } else {
    bodyEl.className = "mail-msg-body";
    bodyEl.style.whiteSpace = "pre-wrap";
    bodyEl.textContent = msg.body || "";
  }
  bubble.appendChild(bodyEl);
}

function renderMessageDetail(msg, attachments = [], threadMessages = []) {
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
  
  // Marketing badge for conversation header
  let marketingBadge = "";
  if (msg.is_marketing) {
    marketingBadge = `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(255,234,166,.15);color:#ffeaa6;border:1px solid rgba(255,234,166,.3);margin-left:6px">marketing</span>`;
  }

  header.innerHTML = `
    <div class="mail-conv-subject">${escSetting(msg.subject || "—")}</div>
    <div class="mail-conv-meta">
      ${isInbound ? (t("settings.marketplace.convFrom") || "Od:") : (t("settings.marketplace.convTo") || "Do:")} ${escSetting(from || "—")} · ${new Date(msg.created_at).toLocaleString("pl-PL")} · ${escSetting(sourceLabel)}${ticketBadge}${marketingBadge}
    </div>`;
  conv.appendChild(header);

  // Container for all messages (scrollable)
  const msgs = document.createElement("div");
  msgs.className = "mail-conv-messages";

  // Render earlier messages (above the central message)
  const earlierMessages = threadMessages.filter(m => new Date(m.created_at) < new Date(msg.created_at));
  if (earlierMessages.length > 0) {

  }
  for (const threadMsg of earlierMessages) {
    const threadBubble = document.createElement("div");
    threadBubble.className = `mail-msg ${threadMsg.direction === "inbound" ? "inbound" : "outbound"} mail-msg-thread`;
    threadBubble.style.opacity = "0.6";
    renderSimpleMessageContent(threadBubble, threadMsg);
    msgs.appendChild(threadBubble);
  }

  // Render current message (central with gold accent)
  const bubble = document.createElement("div");
  bubble.className = `mail-msg ${isInbound ? "inbound" : "outbound"} mail-msg-central`;
  bubble.style.cssText = "border:1px solid rgba(255,234,166,.4);box-shadow:0 0 15px rgba(255,234,166,.15);";

  const bodyEl = document.createElement("div");
  const htmlSrc = msg.body_html || (/<[a-z][\s\S]*>/i.test(msg.body || "") ? msg.body : null);
  if (htmlSrc) {
    bodyEl.className = "mail-msg-body-html";
    const frame = document.createElement("iframe");
    frame.className = "mail-msg-html-frame";
    frame.sandbox = "allow-scripts allow-popups";
    // Wrap content in dark theme - ALWAYS force dark theme
    const wrappedHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { background: #050914 !important; color: #ffffff !important; }
        body { margin:0; padding:10px; background: #050914 !important; color: #ffffff !important; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.4; }
        p, div, span, h1, h2, h3, h4, h5, h6 { background: transparent !important; color: #ffffff !important; }
        a { color: #ffeaa6 !important; }
        strong, b { color: #ffffff !important; }
      </style>
      </head>
      <body>${htmlSrc}</body>
      </html>
    `;
    frame.srcdoc = wrappedHtml;
    bodyEl.appendChild(frame);
  } else {
    bodyEl.className = "mail-msg-body";
    bodyEl.style.whiteSpace = "pre-wrap";
    bodyEl.textContent = msg.body || "";
  }
  bubble.appendChild(bodyEl);
  
  // Double-click bubble to preview message (shows rendered HTML)
  bubble.addEventListener("dblclick", () => {
    const htmlSrc = msg.body_html || msg.body;
    const subject = msg.subject || "(brak tematu)";

    // Generate full HTML email for preview (dark theme)
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #050914; color: #ffffff; }
          .email-container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .email-header { background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); padding: 25px 20px; margin: -20px -20px 25px -20px; border-radius: 8px 8px 0 0; }
          .email-subject { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
          .email-body { padding: 24px; background: transparent; line-height: 1.4; }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="email-header">
            <h1 class="email-subject">${escSetting(subject)}</h1>
          </div>
          <div class="email-body">
            ${htmlSrc || ""}
          </div>
        </div>
      </body>
      </html>
    `;

    const frame = document.createElement("iframe");
    frame.style.cssText = "width:100%;height:500px;border:none;display:block;";
    frame.sandbox = "allow-scripts allow-popups";
    frame.srcdoc = emailHtml;

    // Create wrapper with dark background (matches email theme #050914)
    const wrapper = document.createElement("div");
    wrapper.className = "compose-preview-wrapper";
    wrapper.style.cssText = "background:#050914;border-radius:8px;padding:20px;position:relative;";
    
    // Add close button (X) only - no OK/Cancel buttons
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = "position:absolute;top:10px;right:10px;background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;padding:5px;border-radius:4px;";
    closeBtn.onmouseover = () => closeBtn.style.color = "rgba(255,255,255,.9)";
    closeBtn.onmouseout = () => closeBtn.style.color = "rgba(255,255,255,.5)";
    closeBtn.onclick = () => {
      const modal = wrapper.closest(".overlay");
      if (modal) modal.remove();
    };
    
    wrapper.appendChild(closeBtn);
    wrapper.appendChild(frame);

    void confirmModal({
      title: `Podgląd wiadomości - ${new Date(msg.created_at).toLocaleString("pl-PL")}`,
      text: "",
      body: wrapper,
      okText: "",
      showCancel: false,
    });
  });

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

  // Add central message to the scrollable container
  msgs.appendChild(bubble);

  // Render later messages (below the central message)
  const laterMessages = threadMessages.filter(m => new Date(m.created_at) > new Date(msg.created_at));
  if (laterMessages.length > 0) {

  }
  for (const threadMsg of laterMessages) {
    const threadBubble = document.createElement("div");
    threadBubble.className = `mail-msg ${threadMsg.direction === "inbound" ? "inbound" : "outbound"} mail-msg-thread`;
    threadBubble.style.opacity = "0.6";
    renderSimpleMessageContent(threadBubble, threadMsg);
    msgs.appendChild(threadBubble);
  }

  // Add scrollable messages container to conv
  conv.appendChild(msgs);

  // Action bar — icon buttons (fixed at bottom, outside scrollable area)
  const actions = document.createElement("div");
  actions.className = "mail-msg-actions";
  actions.style.cssText = "flex-shrink:0;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);";

  // Left group: assign/unassign + marketing toggle + reply
  const leftGroup = document.createElement("div");
  leftGroup.style.cssText = "display:flex;gap:4px;align-items:center;";

  // Assign/unassign ticket
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

  // Toggle marketing flag - megaphone/bullhorn icon
  const btnMarketing = document.createElement("button");
  btnMarketing.className = `msg-icon-btn ${msg.is_marketing ? "msg-icon-btn--active" : ""}`;
  btnMarketing.type = "button";
  btnMarketing.title = msg.is_marketing ? "Oznacz jako zwykłą wiadomość" : "Oznacz jako marketing";
  // Megaphone icon - rectangle handle (longer) + trapezoid horn (bigger)
  btnMarketing.innerHTML = msg.is_marketing
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="7" width="5" height="10" rx="1"/><path d="M7 9l12-5v16L7 15V9z"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="5" height="10" rx="1"/><path d="M7 9l12-5v16L7 15V9z"/></svg>`;
  btnMarketing.addEventListener("click", () => toggleMarketing(msg.id, !msg.is_marketing));
  leftGroup.appendChild(btnMarketing);

  if (isInbound && msg.from_email) {
    const btnReply = document.createElement("button");
    btnReply.className = "msg-icon-btn";
    btnReply.type = "button";
    btnReply.title = t("settings.reports.replyBtn") || "Odpowiedz";
    btnReply.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>`;
    btnReply.addEventListener("click", () => showCompose({ to: msg.from_email, subject: `Re: ${stripMarketingPrefix(msg.subject || "")}`, report_id: msg.report_id, quote: msg.body, quoteFrom: msg.from_email, quoteDate: msg.created_at }));
    leftGroup.appendChild(btnReply);
  } else if (!isInbound && msg.to_email) {
    // Reply button for outbound messages (pencil icon)
    const btnReply = document.createElement("button");
    btnReply.className = "msg-icon-btn";
    btnReply.type = "button";
    btnReply.title = "Napisz odpowiedź";
    btnReply.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    btnReply.addEventListener("click", () => showCompose({ to: msg.to_email, subject: `Re: ${stripMarketingPrefix(msg.subject || "")}`, report_id: msg.report_id, quote: msg.body, quoteFrom: msg.to_email, quoteDate: msg.created_at }));
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
  conv.appendChild(msgs);      // Messages container FIRST
  conv.appendChild(actions);   // Actions at BOTTOM (after msgs)

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
      // Wrap content in dark theme - ALWAYS force dark theme
      const wrappedHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { background: #050914 !important; color: #ffffff !important; }
          body { margin:0; padding:10px; background: #050914 !important; color: #ffffff !important; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.4; }
          p, div, span, h1, h2, h3, h4, h5, h6 { background: transparent !important; color: #ffffff !important; }
          a { color: #ffeaa6 !important; }
          strong, b { color: #ffffff !important; }
        </style>
        </head>
        <body>${htmlSrc}</body>
        </html>
      `;
      frame.srcdoc = wrappedHtml;
      bodyEl.appendChild(frame);
    } else {
      bodyEl.className = "mail-msg-body";
      bodyEl.style.whiteSpace = "pre-wrap";
      bodyEl.textContent = msg.body || "";
    }
    el.appendChild(bodyEl);

    // Double-click to preview message (shows rendered HTML - dark theme)
    el.addEventListener("dblclick", () => {
      const htmlSrc = msg.body_html || msg.body;
      const subject = msg.subject || "(brak tematu)";

      // Generate full HTML email for preview (dark theme)
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #050914; color: #ffffff; }
            .email-container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .email-header { background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); padding: 25px 20px; margin: -20px -20px 25px -20px; border-radius: 8px 8px 0 0; }
            .email-subject { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
            .email-body { padding: 24px; background: transparent; line-height: 1.4; }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="email-header">
              <h1 class="email-subject">${escSetting(subject)}</h1>
            </div>
            <div class="email-body">
              ${htmlSrc || ""}
            </div>
          </div>
        </body>
        </html>
      `;

      const frame = document.createElement("iframe");
      frame.style.cssText = "width:100%;height:500px;border:none;display:block;";
      frame.sandbox = "allow-scripts allow-popups";
      frame.srcdoc = emailHtml;

      // Create wrapper with dark background (matches email theme #050914)
      const wrapper = document.createElement("div");
      wrapper.className = "compose-preview-wrapper";
      wrapper.style.cssText = "background:#050914;border-radius:8px;padding:20px;position:relative;";
      
      // Add close button (X) only - no OK/Cancel buttons
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "✕";
      closeBtn.style.cssText = "position:absolute;top:10px;right:10px;background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;padding:5px;border-radius:4px;";
      closeBtn.onmouseover = () => closeBtn.style.color = "rgba(255,255,255,.9)";
      closeBtn.onmouseout = () => closeBtn.style.color = "rgba(255,255,255,.5)";
      closeBtn.onclick = () => {
        const modal = wrapper.closest(".overlay");
        if (modal) modal.remove();
      };
      
      wrapper.appendChild(closeBtn);
      wrapper.appendChild(frame);

      void confirmModal({
        title: `Podgląd wiadomości - ${new Date(msg.created_at).toLocaleString("pl-PL")}`,
        text: "",
        body: wrapper,
        okText: "",
        showCancel: false,
      });
    });

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

  // Reply button - opens full compose window
  const replyButtonSection = document.createElement("div");
  replyButtonSection.style.cssText = "padding:20px;text-align:center;border-top:1px solid rgba(255,255,255,.1);margin-top:20px";
  replyButtonSection.innerHTML = `
    <button class="btn gold" id="btnReportReply" type="button" style="padding:10px 24px;font-size:13px">
      ✏️ ${t("settings.reports.replyBtn") || "Odpowiedz"}
    </button>
  `;
  conv.appendChild(replyButtonSection);

  if (report) {
    document.getElementById("btnReportClose")?.addEventListener("click", () => toggleReportStatus(report.id, "open"));
    document.getElementById("btnReportOpen")?.addEventListener("click",  () => toggleReportStatus(report.id, "closed"));
  }
  
  document.getElementById("btnReportReply")?.addEventListener("click", () => {
    // Open full compose window for reply
    const lastInbound = [...messages].reverse().find(m => m.direction === "inbound");
    const to = lastInbound?.from_email;
    const quote = lastInbound?.body || "";
    const quoteDate = lastInbound?.created_at;
    const quoteFrom = lastInbound?.from_email;
    
    showCompose({
      to: to || "",
      subject: `Re: [${ticketNum}] ${report?.subject || ""}`,
      body: "",
      quote,
      quoteDate,
      quoteFrom,
      report_id: report?.id || undefined,
    });
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

async function toggleMarketing(messageId, isMarketing) {
  try {
    const res = await adminFetch(`/messages/marketing?id=${encodeURIComponent(messageId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_marketing: isMarketing }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(isMarketing ? "Oznaczono jako marketing." : "Oznaczono jako zwykła wiadomość.", "success");
    // Refresh folder and badges to show the change
    await loadMailFolder({ silent: true });
    await loadFolderBadges();
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

  // Build quote block
  let quoteBlockHtml = "";
  if (hasQuote) {
    const dateStr = defaults.quoteDate ? new Date(defaults.quoteDate).toLocaleString("pl-PL") : "";
    const fromStr = defaults.quoteFrom ? `${escSetting(defaults.quoteFrom)}, ${dateStr}` : dateStr;
    quoteBlockHtml = `<div id="composeQuoteBlock" style="display:none;margin:15px 0;padding:10px 14px;border-left:3px solid rgba(255,234,166,.35);background:rgba(0,0,0,.2);border-radius:0 8px 8px 0;font-size:12px;opacity:.65;white-space:pre-wrap;word-break:break-word">
      <div style="font-size:11px;opacity:.7;margin-bottom:6px">${fromStr}</div>${escSetting(defaults.quote)}</div>`;
  }

  // Body without signature - signature is added on send/preview
  const bodyText = defaults.body || "";

  conv.innerHTML = `
    <div class="mail-compose-pane">
      <div id="composePaneInner">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0;padding:16px 16px 0 16px">
          <div style="font-size:14px;font-weight:700">${t("settings.reports.compose.title") || "Napisz nową wiadomość"}</div>
          <button id="btnComposeClose" type="button" title="Zamknij" style="background:none;border:none;cursor:pointer;padding:4px;color:rgba(255,255,255,.4);line-height:1;font-size:18px;border-radius:4px" onmouseover="this.style.color='rgba(255,255,255,.8)'" onmouseout="this.style.color='rgba(255,255,255,.4)'">✕</button>
        </div>

        <div style="padding:0 16px">
          <div class="field" style="margin-bottom:12px">
            <label class="field-label">Do (e-mail)</label>
            <input class="inp" id="composeToInput" type="email" style="width:100%;box-sizing:border-box" value="${escSetting(defaults.to || "")}" placeholder="np. kontakt@firma.pl" ${hasQuote ? 'disabled style="opacity:.5"' : ''}>
          </div>
          <div class="field" style="margin-bottom:12px">
            <label class="field-label">${t("settings.reports.compose.subject") || "Temat"}</label>
            <input class="inp" id="composeSubjectInput" type="text" autocomplete="off" style="width:100%;box-sizing:border-box" value="${escSetting(defaults.subject || "")}" placeholder="Wpisz temat wiadomości">
          </div>

          <div class="mail-inline-grid" style="margin-bottom:12px">
            <div class="field">
              <label class="field-label" style="font-size:12px">Powitanie</label>
              <div class="ui-select" id="composeGreetingSelect" style="width:100%">
                <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                  <span class="ui-select-label">${t("settings.mail.greetingOptions.none") || "Brak"}</span>
                  <span class="ui-select-caret" aria-hidden="true">▾</span>
                </button>
                <div class="ui-select-menu" role="listbox"></div>
              </div>
              <input class="inp" id="composeGreetingCustom" type="text" placeholder="Wpisz własne powitanie" style="margin-top:6px;display:none;width:100%;box-sizing:border-box">
            </div>
            <div class="field">
              <label class="field-label" style="font-size:12px">Pożegnanie</label>
              <div class="ui-select" id="composeFarewellSelect" style="width:100%">
                <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                  <span class="ui-select-label">${t("settings.mail.farewellOptions.none") || "Brak pożegnania"}</span>
                  <span class="ui-select-caret" aria-hidden="true">▾</span>
                </button>
                <div class="ui-select-menu" role="listbox"></div>
              </div>
              <textarea class="inp" id="composeFarewellCustom" rows="2" placeholder="Wpisz własne pożegnanie" style="margin-top:6px;display:none;width:100%;box-sizing:border-box;resize:vertical"></textarea>
            </div>
            <div class="field">
              <label class="field-label" style="font-size:12px">Nadawca</label>
              <div class="ui-select" id="composeSenderSelect" style="width:100%">
                <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                  <span class="ui-select-label">${t("settings.mail.senderOptions.none") || "Brak nadawcy"}</span>
                  <span class="ui-select-caret" aria-hidden="true">▾</span>
                </button>
                <div class="ui-select-menu" role="listbox"></div>
              </div>
              <input class="inp" id="composeSenderCustom" type="text" placeholder="Wpisz własnego nadawcę" style="margin-top:6px;display:none;width:100%;box-sizing:border-box">
            </div>
          </div>

          <div class="field" style="margin-bottom:12px">
            <label class="field-label" style="font-size:12px">${t("settings.reports.compose.templateLabel") || "Szablon odpowiedzi"}</label>
            <select class="inp" id="composeTemplateSelect" style="width:100%;box-sizing:border-box">
              <option value="custom">${t("settings.reports.compose.templates.custom") || "Własny"}</option>
              <option value="info">${t("settings.reports.compose.templates.info") || "Podziękowanie"}</option>
              <option value="received">${t("settings.reports.compose.templates.received") || "Potwierdzenie otrzymania"}</option>
              <option value="resolved">${t("settings.reports.compose.templates.resolved") || "Zgłoszenie rozwiązane"}</option>
              <option value="pending">${t("settings.reports.compose.templates.pending") || "W trakcie realizacji"}</option>
              <option value="more_info">${t("settings.reports.compose.templates.moreInfo") || "Prośba o informacje"}</option>
              <option value="followup">${t("settings.reports.compose.templates.followup") || "Follow-up"}</option>
              <option value="closed">${t("settings.reports.compose.templates.closed") || "Zamknięcie zgłoszenia"}</option>
              <option value="thanks">${t("settings.reports.compose.templates.thanks") || "Podziękowanie"}</option>
            </select>
          </div>

          <div class="field" style="margin-bottom:12px;min-height:0;display:flex;flex-direction:column">
            <label class="field-label" style="margin-bottom:6px;display:block">
              ${t("settings.reports.compose.message") || "Treść"}
              ${hasQuote ? `
                <span style="opacity:.5;font-size:11px;margin-left:8px" data-i18n="settings.reports.compose.quoteHint">Użyj #quote aby wstawić cytat</span>
                <button type="button" class="btn sm" id="btnInsertQuote" style="font-size:11px;padding:4px 8px;margin-left:8px" title="Wstaw #quote w miejscu kursora">#quote</button>
              ` : ""}
            </label>
            <div id="composeMessageArea" style="min-height:300px"></div>
          </div>

          <div class="field attachments-section" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)">
            <label class="field-label attachments-label" style="margin-bottom:8px;display:block">Załączniki <span style="opacity:.4;font-size:10px">(maks. 10 MB)</span></label>
            <input type="file" id="composeAttachmentInput" multiple style="display:none">
            <label for="composeAttachmentInput" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);font-size:12px;color:rgba(255,255,255,.7);cursor:pointer;user-select:none">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              Wybierz pliki
            </label>
            <div id="composeAttachmentList" class="attachments-list" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px"></div>
          </div>

          <input type="hidden" id="composeReportId" value="${escSetting(defaults.report_id || "")}">
          <input type="hidden" id="composeQuoteBody" value="${escSetting(defaults.quote || "")}">
          <input type="hidden" id="composeToEmail" value="${escSetting(defaults.to || "")}">

          <div style="display:flex;justify-content:flex-end;gap:8px;align-items:center;padding-top:12px;margin-top:12px;border-top:1px solid rgba(255,255,255,.1)">
            <button class="btn sm" id="btnComposePreview" type="button" data-i18n="settings.reports.compose.preview">👁 Podgląd</button>
            <span class="field-hint" id="composeSendStatus"></span>
            <button class="btn sm gold" id="btnComposeSend" type="button">${t("settings.reports.compose.send") || "Wyślij"}</button>
          </div>
        </div>
      </div>
    </div>`;

  // Initialize TinyMCE for composeMessageArea after HTML is inserted
  const initComposeTinyMCE = () => {
    if (typeof tinymce === "undefined") {
      console.warn("TinyMCE script not loaded yet, retrying...");
      setTimeout(initComposeTinyMCE, 200);
      return;
    }
    const composeEl = document.getElementById("composeMessageArea");
    if (!composeEl) {
      console.warn("composeMessageArea element not found, retrying...");
      setTimeout(initComposeTinyMCE, 200);
      return;
    }
    
    // Remove existing TinyMCE instance
    const existing = tinymce.get("composeMessageArea");
    if (existing) {
      tinymce.remove(existing);
    }
    
    tinymce.init({
      selector: "#composeMessageArea",
      height: 400,
      menubar: "edit insert view format table tools",
      branding: false,
      promotion: false,
      license_key: "gpl",
      plugins: "lists link image table autoresize codesample",
      toolbar: "undo redo | fontsize | formatselect | bold italic forecolor backcolor | bullist numlist | link image | table | codesample | removeformat",
      fontsize_formats: "10px 11px 12px 13px 14px 15px 16px 18px 20px 22px 24px 26px 28px 32px 36px 48px",
      color_map: [
        "000000", "Czarny",
        "ffffff", "Biały",
        "ffeaa6", "Złoty Familiada",
        "050914", "Ciemny Familiada",
        "ff6b6b", "Czerwony",
        "4ecdc4", "Turkusowy",
        "45b7d1", "Niebieski",
        "96ceb4", "Zielony",
        "f7d794", "Żółty",
        "778ca3", "Szary"
      ],
      statusbar: false,
      skin: "oxide-dark",
      content_css: "dark",
      content_style: `
        body { background: #050914 !important; color: #ffffff !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; line-height: 1.4; }
        a { color: #ffeaa6 !important; }
        table { border-collapse: collapse; width: 100%; }
        table td, table th { border: 1px solid rgba(255,255,255,.2); padding: 8px; }
        code, pre { background: rgba(255,234,166,.1); color: #ffeaa6; padding: 2px 6px; border-radius: 4px; }
      `,
      paste_data_images: true,
      images_upload_handler: (blobInfo) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blobInfo.blob());
        });
      },
      setup: (editor) => {
        editor.on("init", () => {
        });
        editor.on("change", () => {
          const content = editor.getContent();
          if (content.includes("#quote")) {
            const quoteBlock = document.getElementById("composeQuoteBlock");
            if (quoteBlock) quoteBlock.style.display = "";
          }
        });
      },
    });
  };

  // Start initialization
  setTimeout(initComposeTinyMCE, 100);

  // Initialize greeting select
  const composeGreetingSelect = initUiSelect(document.getElementById("composeGreetingSelect"), {
    options: getGreetingOptions(),
    value: defaults.greetingValue || "none",
    placeholder: "Brak",
    onChange: (val) => {
      const customInput = document.getElementById("composeGreetingCustom");
      if (customInput) {
        customInput.style.display = (val === "custom") ? "" : "none";
        if (val === "custom") customInput.focus();
      }
    },
  });
  
  // Initialize farewell select
  const composeFarewellSelect = initUiSelect(document.getElementById("composeFarewellSelect"), {
    options: getFarewellOptions(),
    value: defaults.farewellValue || "none",
    placeholder: "Brak pożegnania",
    onChange: (val) => {
      const customInput = document.getElementById("composeFarewellCustom");
      if (customInput) {
        customInput.style.display = (val === "custom") ? "" : "none";
        if (val === "custom") customInput.focus();
      }
    },
  });

  // Initialize sender select
  const composeSenderSelect = initUiSelect(document.getElementById("composeSenderSelect"), {
    options: getSenderOptions(),
    value: defaults.senderValue || "team",
    placeholder: "Zespół Familiada",
    onChange: (val) => {
      const customInput = document.getElementById("composeSenderCustom");
      if (customInput) {
        customInput.style.display = (val === "custom") ? "" : "none";
        if (val === "custom") customInput.focus();
      }
    },
  });

  // Set custom values if provided
  if (defaults.greetingCustom) {
    const customInput = document.getElementById("composeGreetingCustom");
    if (customInput && defaults.greetingValue === "custom") {
      customInput.value = defaults.greetingCustom;
      customInput.style.display = "";
    }
  }
  if (defaults.farewellCustom) {
    const customInput = document.getElementById("composeFarewellCustom");
    if (customInput && defaults.farewellValue === "custom") {
      customInput.value = defaults.farewellCustom;
      customInput.style.display = "";
    }
  }
  if (defaults.senderCustom) {
    const customInput = document.getElementById("composeSenderCustom");
    if (customInput && defaults.senderValue === "custom") {
      customInput.value = defaults.senderCustom;
      customInput.style.display = "";
    }
  }

  document.getElementById("btnComposeSend")?.addEventListener("click", () => sendComposeWithSignature(composeGreetingSelect, composeFarewellSelect, composeSenderSelect));

  document.getElementById("btnComposePreview")?.addEventListener("click", () => {
    showComposePreview(composeGreetingSelect, composeFarewellSelect, composeSenderSelect);
  });

  document.getElementById("btnComposeClose")?.addEventListener("click", async () => {
    const editor = tinymce.get("composeMessageArea");
    const hasData = (document.getElementById("composeSubjectInput")?.value || "").trim()
      || (editor ? editor.getContent() : "")
      || (document.getElementById("composeGreetingCustom")?.value || "").trim()
      || (document.getElementById("composeFarewellCustom")?.value || "").trim();
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

  // Quote position radio buttons
  document.querySelectorAll('input[name="composeQuotePosition"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      // Rebuild compose window with new quote position
      const newQuotePosition = e.target.value;
      const reportId = document.getElementById("composeReportId")?.value;
      const quote = document.getElementById("composeQuoteBody")?.value;
      const subject = document.getElementById("composeSubjectInput")?.value;
      const body = document.getElementById("composeMessageArea")?.value;
      const greetingValue = composeGreetingSelect?.getValue();
      const farewellValue = composeFarewellSelect?.getValue();
      const greetingCustom = document.getElementById("composeGreetingCustom")?.value;
      const farewellCustom = document.getElementById("composeFarewellCustom")?.value;
      
      // Save current state
      const currentState = {
        subject: subject || "",
        body: body || "",
        quote: quote || "",
        report_id: reportId || undefined,
        greetingValue,
        farewellValue,
        greetingCustom,
        farewellCustom,
      };
      
      // Reopen compose with new quote position
      showCompose(currentState);
      
      // Set the new quote position
      const newRadio = document.querySelector(`input[name="composeQuotePosition"][value="${newQuotePosition}"]`);
      if (newRadio) newRadio.checked = true;
    });
  });
  
  // Template select - insert template text into TinyMCE body
  document.getElementById("composeTemplateSelect")?.addEventListener("change", (e) => {
    const templateKey = e.target.value;
    const templateText = EMAIL_TEMPLATES[templateKey] || "";
    const editor = tinymce.get("composeMessageArea");
    if (editor && templateText) {
      editor.setContent(templateText);
    }
  });

  // Insert #quote button - only for replies (when hasQuote is true)
  document.getElementById("btnInsertQuote")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const editor = tinymce.get("composeMessageArea");
    if (editor) {
      editor.insertContent("#quote");
      editor.focus();
    }
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

async function sendComposeWithSignature(greetingSelect, farewellSelect, senderSelect) {
  const subject = (document.getElementById("composeSubjectInput")?.value || "").trim();
  const toEmail = (document.getElementById("composeToInput")?.value || "").trim();
  const editor = tinymce.get("composeMessageArea");
  if (!editor) {
    showToast("Edytor nie jest gotowy.", "error");
    return;
  }
  let body = editor.getContent();
  const reportId = (document.getElementById("composeReportId")?.value || "").trim() || null;
  const status = document.getElementById("composeSendStatus");
  const quote = (document.getElementById("composeQuoteBody")?.value || "").trim() || null;

  if (!subject) { showToast("Podaj temat wiadomości.", "error"); return; }
  if (!toEmail) { showToast("Podaj odbiorcę.", "error"); return; }
  // Validate email format
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(toEmail)) { showToast("Nieprawidłowy format e-mail.", "error"); return; }
  if (!body) { showToast("Podaj treść wiadomości.", "error"); return; }
  if (status) status.textContent = "Wysyłam…";

  // Build signature from compose window selections
  const greetingValue = greetingSelect?.getValue() || "none";
  const farewellValue = farewellSelect?.getValue() || "none";
  const senderValue = senderSelect?.getValue() || "team";
  const greetingCustom = (document.getElementById("composeGreetingCustom")?.value || "").trim();
  const farewellCustom = (document.getElementById("composeFarewellCustom")?.value || "").trim();
  const senderCustom = (document.getElementById("composeSenderCustom")?.value || "").trim();

  const signatureText = buildEmailSignature({
    greeting: greetingValue,
    farewell: farewellValue,
    sender: senderValue,
    greetingCustom,
    farewellCustom,
    senderCustom,
  });

  // Build HTML email body with Familiada wrapper (dark theme)
  const greetingText = buildEmailSignature({ greeting: greetingValue, farewell: "none", greetingCustom, farewellCustom: "" });
  const farewellText = buildEmailSignature({ 
    greeting: "none", 
    farewell: farewellValue, 
    sender: senderValue,
    greetingCustom: "", 
    farewellCustom,
    senderCustom
  });

  // body from TinyMCE is already HTML (<p>, <strong>, etc.) - don't replace \n with <br>
  let bodyContent = body;

  // Replace #quote placeholder with actual quote HTML (only when replying with quote)
  if (quote) {
    const quoteHtml = `<div style="margin:25px 0;padding:20px;background:rgba(255,255,255,.05);border-left:4px solid #ffeaa6;border-radius:4px;font-size:13px;line-height:1.6;color:#ccc">${quote.replace(/\n/g, "<br>")}</div>`;
    if (bodyContent.includes("#quote")) {
      bodyContent = bodyContent.replace(/#quote/g, quoteHtml);
    }
  }

  // Build full HTML email with Familiada branding
  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <style>:root{color-scheme:dark}</style>
</head>
<body style="margin:0;padding:0;background:#050914;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;">
    <!-- Header -->
    <div style="padding:14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;margin-bottom:14px;">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:4px;font-size:11px;opacity:.7;letter-spacing:.06em;">familiada.online</div>
    </div>
    
    <!-- Content -->
    <div style="padding:16px;">
      ${greetingText ? `<p style="margin:0 0 20px">${greetingText.replace(/\n/g, "<br>")}${greetingText.trim().endsWith(',') ? '' : ','}</p>` : ""}
      <div style="line-height:1.6;color:#fff;margin-bottom:20px">${bodyContent}</div>
      ${farewellText ? `<p style="margin:20px 0 0">${farewellText.replace(/\n/g, "<br>")}</p>` : ""}
    </div>
    
    <!-- Footer -->
    <div style="margin-top:26px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12);font-size:11px;opacity:.5;text-align:center;">
      Ta wiadomość została wysłana przez system Familiada.
    </div>
  </div>
</body>
</html>`;

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
      body: JSON.stringify({
        to_email: toEmail || undefined,
        subject,
        body: body,
        body_html: htmlBody,
        report_id: reportId || undefined,
        attachments: uploadedAttachments.length ? uploadedAttachments : undefined,
      }),
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

function showComposePreview(greetingSelect, farewellSelect, senderSelect) {
  const subject = (document.getElementById("composeSubjectInput")?.value || "").trim();
  const editor = tinymce.get("composeMessageArea");
  if (!editor) {
    showToast("Edytor nie jest gotowy.", "error");
    return;
  }
  const body = editor.getContent();
  const quote = (document.getElementById("composeQuoteBody")?.value || "").trim() || null;

  // Build greeting and farewell separately
  const greetingValue = greetingSelect?.getValue() || "none";
  const farewellValue = farewellSelect?.getValue() || "none";
  const senderValue = senderSelect?.getValue() || "team";
  const greetingCustom = (document.getElementById("composeGreetingCustom")?.value || "").trim();
  const farewellCustom = (document.getElementById("composeFarewellCustom")?.value || "").trim();
  const senderCustom = (document.getElementById("composeSenderCustom")?.value || "").trim();

  const greetingText = buildEmailSignature({
    greeting: greetingValue,
    farewell: "none",
    sender: "none",
    greetingCustom,
    farewellCustom: "",
    senderCustom: "",
  });
  
  // Add comma after greeting if present (but not if it already ends with comma)
  const greetingWithComma = greetingText ? `${greetingText}${greetingText.trim().endsWith(',') ? '' : ','}` : "";
  
  const farewellText = buildEmailSignature({
    greeting: "none",
    farewell: farewellValue,
    sender: senderValue,
    greetingCustom: "",
    farewellCustom,
    senderCustom,
  });

  // body from TinyMCE is already HTML (<p>, <strong>, etc.) - don't replace \n with <br>
  let bodyHtml = body;

  // Replace #quote placeholder with actual quote HTML
  const quoteHtml = quote ? `<div style="margin:25px 0;padding:20px;background:rgba(255,255,255,.05);border-left:4px solid #ffeaa6;border-radius:4px;font-size:13px;line-height:1.6;color:#ccc">${quote.replace(/\n/g, "<br>")}</div>` : "";
  if (bodyHtml.includes("#quote")) {
    bodyHtml = bodyHtml.replace(/#quote/g, quoteHtml);
  }

  // Structure: Greeting → Body (with #quote replaced) → Farewell
  const finalBody = `
    ${greetingWithComma ? `<div style="margin-bottom:20px;line-height:1.4;font-size:14px">${greetingWithComma.replace(/\n/g, "<br>")}</div>` : ""}
    <div style="line-height:1.4;color:#fff;margin-bottom:20px;font-size:14px">${bodyHtml}</div>
    ${farewellText ? `<div style="margin-top:20px;line-height:1.4;font-size:14px">${farewellText.replace(/\n/g, "<br>")}</div>` : ""}
  `;

  // Generate full HTML email (dark theme like system emails)
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #050914; color: #ffffff; line-height: 1.4; }
        .email-container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .email-header { background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); padding: 25px 20px; margin: -20px -20px 25px -20px; border-radius: 8px 8px 0 0; }
        .email-subject { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
        .email-body { padding: 0 5px; }
        .email-quote { margin: 25px 0; padding: 20px; background: rgba(255,255,255,.05); border-left: 4px solid #ffeaa6; border-radius: 4px; font-size: 13px; line-height: 1.4; color: #ccc; }
        .email-footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.1); font-size: 12px; color: #888; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h1 class="email-subject">${escSetting(subject || "(brak tematu)")}</h1>
        </div>
        <div class="email-body">
          ${finalBody}
        </div>
        <div class="email-footer">
          <p style="margin:0;color:#888;font-size:12px">Ta wiadomość została wysłana przez system Familiada.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  // Create iframe for preview (renders HTML exactly like system emails)
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:100%;height:500px;border:none;display:block";
  frame.sandbox = "allow-scripts allow-popups";
  frame.srcdoc = emailHtml;
  
  // Create wrapper with dark background (matches email theme #050914)
  const wrapper = document.createElement("div");
  wrapper.className = "compose-preview-wrapper";
  wrapper.style.cssText = "background:#050914;border-radius:8px;padding:20px;position:relative;";
  
  // Add close button (X) only - no OK/Cancel buttons
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "position:absolute;top:10px;right:10px;background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;padding:5px;border-radius:4px;";
  closeBtn.onmouseover = () => closeBtn.style.color = "rgba(255,255,255,.9)";
  closeBtn.onmouseout = () => closeBtn.style.color = "rgba(255,255,255,.5)";
  closeBtn.onclick = () => {
    const modal = wrapper.closest(".overlay");
    if (modal) modal.remove();
  };
  
  wrapper.appendChild(closeBtn);
  wrapper.appendChild(frame);
  
  void confirmModal({
    title: t("settings.reports.compose.previewTitle") || "Podgląd wiadomości",
    text: "",
    body: wrapper,
    okText: "",
    showCancel: false,
  });
}

// ── Mobile mail navigation (3-pane → one at a time) ───────────────────
let mailView = "list"; // list | folders | conv

function setMailView(view) {
  // Only show mail nav when reports tab is active
  if (activeTab !== "reports") return;

  mailView = view;
  const client = document.getElementById("mailClient");
  const navTopbar = document.getElementById("mailNavTopbar");
  const btnBack = document.getElementById("btnMailBackTopbar");
  const btnCompose = document.getElementById("btnMailComposeTopbar");
  const brand = document.getElementById("settingsBrand");

  if (!client) return;
  client.dataset.mailView = view;

  const isMobile = window.matchMedia("(max-width: 900px)").matches;

  if (!isMobile) {
    if (navTopbar) navTopbar.style.display = "none";
    if (brand) brand.style.display = "";
    return;
  }

  // On mobile: show mail nav, hide brand
  if (navTopbar) navTopbar.style.display = "flex";
  if (brand) brand.style.display = "none";

  // Show/hide back button based on view
  if (btnBack) btnBack.style.display = (view === "folders") ? "none" : "";

  // Show compose in folders and list views, hide in conv
  if (btnCompose) btnCompose.style.display = (view === "folders" || view === "list") ? "" : "none";
}

function hideMailNav() {
  const navTopbar = document.getElementById("mailNavTopbar");
  const brand = document.getElementById("settingsBrand");
  if (navTopbar) navTopbar.style.display = "none";
  if (brand) brand.style.display = "";
}

function mailViewBack() {
  if (mailView === "conv") setMailView("list");
  else if (mailView === "list") setMailView("folders");
}

function initMobileMailNav() {
  document.getElementById("btnMailBackTopbar")?.addEventListener("click", () => mailViewBack());
  document.getElementById("btnMailComposeTopbar")?.addEventListener("click", () => showCompose());

  // When clicking a folder on mobile, go to list view
  document.querySelectorAll(".mail-folder").forEach(el => {
    el.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        setMailView("list");
      }
    });
  });

  // Observe when conversation is opened — only if reports tab is active
  const convObserver = new MutationObserver(() => {
    if (activeTab !== "reports") return;
    const conv = document.getElementById("mailConv");
    const hasContent = conv && conv.querySelector(".mail-conv-header");
    if (hasContent && window.matchMedia("(max-width: 900px)").matches) {
      setMailView("conv");
    }
  });

  const convEl = document.getElementById("mailConv");
  if (convEl) convObserver.observe(convEl, { childList: true, subtree: true });

  // Initial state
  setMailView("list");
}

function wireReportsEvents() {
  // Mobile mail navigation
  initMobileMailNav();

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
}

async function cleanupTrash() {
  try {
    const res = await adminFetch("/cleanup/trash", { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    showToast(`Usunięto ${json.deleted || 0} elementów.`, "success");
    if (msgActiveFolder === "trash") await loadMailFolder({ silent: true });
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
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
  document.getElementById("btnProducerRatingsRefresh")?.addEventListener("click", () => loadProducerRatings());
  document.getElementById("btnRatersClose")?.addEventListener("click", () => {
    const ov = document.getElementById("ratersOverlay");
    if (ov) ov.style.display = "none";
  });
  document.getElementById("ratersOverlay")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
  });

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
    const providers = data?.providers || [];
    const cron = data?.cron || null;

    mailProviderOrder = providers;
    renderProviderOrder();

    if (els.mailDelayMs) els.mailDelayMs.value = String(clampInt(settings.delay_ms, 0, 5000, 250));
    if (els.mailBatchMax) els.mailBatchMax.value = String(clampInt(settings.batch_max, 1, 500, 100));
    if (els.mailWorkerLimit) els.mailWorkerLimit.value = String(clampInt(settings.worker_limit, 1, 200, 25));
    if (els.mailRunLimit) els.mailRunLimit.value = String(clampInt(settings.worker_limit, 1, 200, 25));

    // Load greeting/farewell settings
    mailGreetingValue = settings.email_greeting || "witaj";
    mailFarewellValue = settings.email_farewell || "team";
    mailGreetingCustomValue = settings.email_greeting_custom || "";
    mailFarewellCustomValue = settings.email_farewell_custom || "";

    // Set custom values and show/hide inputs
    const greetingCustomEl = document.getElementById("mailGreetingCustom");
    const farewellCustomEl = document.getElementById("mailFarewellCustom");
    if (greetingCustomEl) {
      greetingCustomEl.value = mailGreetingCustomValue;
      greetingCustomEl.style.display = (mailGreetingValue === "custom") ? "" : "none";
    }
    if (farewellCustomEl) {
      farewellCustomEl.value = mailFarewellCustomValue;
      farewellCustomEl.style.display = (mailFarewellValue === "custom") ? "" : "none";
    }

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
    providers: mailProviderOrder,
    delay_ms: delayMs,
    batch_max: batchMax,
    worker_limit: workerLimit,
    email_greeting: mailGreetingValue,
    email_farewell: mailFarewellValue,
    email_greeting_custom: document.getElementById("mailGreetingCustom")?.value || "",
    email_farewell_custom: document.getElementById("mailFarewellCustom")?.value || "",
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
    const res = await fetch(await cacheBust(TOOLS_MANIFEST), { cache: "no-store" });
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
  window.activeTab = tab;
  
  const btn = document.getElementById("btnTabMaintenance");
  const btnMail = document.getElementById("btnTabMail");
  const btnMarket = document.getElementById("btnTabMarketplace");
  const btnRatings = document.getElementById("btnTabRatings");
  const btnStats = document.getElementById("btnTabStats");
  const btnGen = document.getElementById("btnTabGenerator");
  const btnReports = document.getElementById("btnTabReports");
  const btnMarketing = document.getElementById("btnTabMarketing");
  const btnMarketingContacts = document.getElementById("btnTabMarketingContacts");
  const tools = document.getElementById("toolsSelect");

  if (btn) btn.classList.toggle("active", tab === "maintenance");
  if (btnMail) btnMail.classList.toggle("active", tab === "mail");
  if (btnMarket) btnMarket.classList.toggle("active", tab === "marketplace");
  if (btnRatings) btnRatings.classList.toggle("active", tab === "ratings");
  if (btnStats) btnStats.classList.toggle("active", tab === "stats");
  if (btnGen) btnGen.classList.toggle("active", tab === "generator");
  if (btnReports) btnReports.classList.toggle("active", tab === "reports");
  if (btnMarketing) btnMarketing.classList.toggle("active", tab === "marketing");
  if (btnMarketingContacts) btnMarketingContacts.classList.toggle("active", tab === "marketingContacts");
  if (tools) tools.classList.toggle("active", tab === "tools");

  // Hide/show panels
  if (els.maintenancePanel) els.maintenancePanel.hidden = tab !== "maintenance";
  if (els.mailPanel) els.mailPanel.hidden = tab !== "mail";
  if (els.marketplacePanel) els.marketplacePanel.hidden = tab !== "marketplace";
  if (els.ratingsPanel) els.ratingsPanel.hidden = tab !== "ratings";
  if (els.statsPanel) els.statsPanel.hidden = tab !== "stats";
  if (els.generatorPanel) els.generatorPanel.hidden = tab !== "generator";
  if (els.reportsPanel) els.reportsPanel.hidden = tab !== "reports";
  if (els.marketingPanel) els.marketingPanel.hidden = tab !== "marketing";
  if (els.marketingContactsPanel) els.marketingContactsPanel.hidden = tab !== "marketingContacts";

  // Force display style for panels (mobile compatibility)
  if (els.mailPanel) els.mailPanel.style.display = tab === "mail" ? "" : "none";
  if (els.marketplacePanel) els.marketplacePanel.style.display = tab === "marketplace" ? "" : "none";
  if (els.ratingsPanel) els.ratingsPanel.style.display = tab === "ratings" ? "" : "none";
  if (els.statsPanel) els.statsPanel.style.display = tab === "stats" ? "" : "none";
  if (els.generatorPanel) els.generatorPanel.style.display = tab === "generator" ? "" : "none";
  if (els.reportsPanel) els.reportsPanel.style.display = tab === "reports" ? "" : "none";
  if (els.marketingPanel) els.marketingPanel.style.display = tab === "marketing" ? "" : "none";
  if (els.marketingContactsPanel) els.marketingContactsPanel.style.display = tab === "marketingContacts" ? "" : "none";

  // When entering reports panel, init mail view
  if (tab === "reports") {
    setMailView("list");
  } else {
    hideMailNav();
  }

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

const STAT_DETAIL_CONFIG = {
  users: {
    title: "Użytkownicy",
    cols: ["Username", "Email", "Język", "Gość?", "Rejestracja"],
    row: r => [r.username || "—", r.email || "—", r.language || "—", r.is_guest ? "tak" : "nie", fmtDate(r.created_at)],
  },
  games: {
    title: "Gry",
    cols: ["Nazwa", "Typ", "Status", "Właściciel", "Data"],
    row: r => [r.name || "—", r.type || "—", r.status || "—", r.owner || "—", fmtDate(r.created_at)],
  },
  gameplay: {
    title: "Rozgrywki",
    cols: ["Gra", "Właściciel", "Ostatnia rozgrywka"],
    row: r => [r.game_name || "—", r.owner || "—", fmtDate(r.last_seen_at)],
  },
  bases: {
    title: "Bazy pytań",
    cols: ["Nazwa", "Właściciel", "Data"],
    row: r => [r.name || "—", r.owner || "—", fmtDate(r.created_at)],
  },
  logos: {
    title: "Logo",
    cols: ["Nazwa", "Typ", "Aktywne", "Właściciel", "Data"],
    row: r => [r.name || "—", r.type || "—", r.is_active ? "tak" : "nie", r.owner || "—", fmtDate(r.created_at)],
  },
  ratings: {
    title: "Oceny",
    cols: ["Użytkownik", "Ocena", "Komentarz", "Data"],
    row: r => [r.username || "—", r.stars != null ? `${r.stars}/5` : "—", r.comment || "—", fmtDate(r.created_at)],
  },
};

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

const STATS_DETAIL_PER_PAGE = 25;

function buildStatsTable(cfg, rows) {
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size:13px;opacity:.45;text-align:center;padding:16px 0";
    empty.textContent = "Brak danych.";
    return empty;
  }

  const wrap = document.createElement("div");
  wrap.style.cssText = "overflow-x:auto";

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap";

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  cfg.cols.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    th.style.cssText = "padding:6px 10px;text-align:left;opacity:.5;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid rgba(255,255,255,.1)";
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,.02)";
    cfg.row(r).forEach(cell => {
      const td = document.createElement("td");
      td.textContent = cell;
      td.style.cssText = "padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.05);max-width:240px;overflow:hidden;text-overflow:ellipsis";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildStatsPagination(page, pages, onPage) {
  const nav = document.createElement("div");
  nav.className = "logs-page-nav";
  nav.style.cssText = "margin-top:10px";

  const prevBtn = document.createElement("button");
  prevBtn.className = "btn sm";
  prevBtn.textContent = "‹";
  prevBtn.disabled = page <= 1;
  prevBtn.addEventListener("click", () => onPage(page - 1));
  nav.appendChild(prevBtn);

  const windowSize = 7;
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(pages, start + windowSize - 1);
  if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);

  if (start > 1) {
    const btn = document.createElement("button");
    btn.className = "btn sm";
    btn.textContent = "1";
    btn.addEventListener("click", () => onPage(1));
    nav.appendChild(btn);
    if (start > 2) {
      const dots = document.createElement("span");
      dots.style.cssText = "padding:0 4px;opacity:.4;font-size:12px";
      dots.textContent = "…";
      nav.appendChild(dots);
    }
  }

  for (let i = start; i <= end; i++) {
    const btn = document.createElement("button");
    btn.className = "btn sm" + (i === page ? " is-active" : "");
    btn.textContent = String(i);
    if (i !== page) btn.addEventListener("click", () => onPage(i));
    nav.appendChild(btn);
  }

  if (end < pages) {
    if (end < pages - 1) {
      const dots = document.createElement("span");
      dots.style.cssText = "padding:0 4px;opacity:.4;font-size:12px";
      dots.textContent = "…";
      nav.appendChild(dots);
    }
    const btn = document.createElement("button");
    btn.className = "btn sm";
    btn.textContent = String(pages);
    btn.addEventListener("click", () => onPage(pages));
    nav.appendChild(btn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn sm";
  nextBtn.textContent = "›";
  nextBtn.disabled = page >= pages;
  nextBtn.addEventListener("click", () => onPage(page + 1));
  nav.appendChild(nextBtn);

  return nav;
}

async function openStatsDetailModal(type) {
  const cfg = STAT_DETAIL_CONFIG[type];
  if (!cfg) return;

  const perPage = STATS_DETAIL_PER_PAGE;
  let allRows = [];

  const infoEl = document.createElement("div");
  infoEl.style.cssText = "font-size:11px;opacity:.4;margin-bottom:6px;min-height:16px";

  const tableWrap = document.createElement("div");
  tableWrap.style.cssText = "min-height:60px";
  tableWrap.textContent = "Ładowanie…";

  const pageWrap = document.createElement("div");

  const body = document.createElement("div");
  body.style.cssText = "min-width:min(680px,88vw)";
  body.appendChild(infoEl);
  body.appendChild(tableWrap);
  body.appendChild(pageWrap);

  confirmModal({
    title: cfg.title,
    text: "",
    okText: "Zamknij",
    body,
    onReady: ({ cancelBtn }) => { if (cancelBtn) cancelBtn.style.display = "none"; },
  });

  function renderPage(page) {
    const total = allRows.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const from = (page - 1) * perPage;
    const to = Math.min(page * perPage, total);
    const pageRows = allRows.slice(from, to);

    infoEl.textContent = total ? `${from + 1}–${to} / ${total}` : "0 wyników";

    tableWrap.innerHTML = "";
    tableWrap.appendChild(buildStatsTable(cfg, pageRows));

    pageWrap.innerHTML = "";
    if (pages > 1) pageWrap.appendChild(buildStatsPagination(page, pages, renderPage));
  }

  try {
    const res = await apiFetch(`${API_BASE}/stats/detail?type=${encodeURIComponent(type)}&limit=500`, { method: "GET" });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[stats/detail] HTTP", res.status, errBody);
      throw new Error(`HTTP ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "błąd");
    allRows = data.rows || [];
    renderPage(1);
  } catch (err) {
    tableWrap.textContent = `Błąd: ${err.message}`;
  }
}

function wireStatsEvents() {
  if (els.btnStatsRefresh) {
    els.btnStatsRefresh.addEventListener("click", () => {
      loadAdminStats();
      loadRetentionStats();
      loadExcludedUsers();
    });
  }

  document.querySelectorAll(".stat-box[data-detail]").forEach(box => {
    box.addEventListener("click", () => openStatsDetailModal(box.dataset.detail));
  });

  const btnAdd = document.getElementById("btnExcludeAdd");
  if (btnAdd) btnAdd.addEventListener("click", addExcludedUser);

  const input = document.getElementById("excludeUsernameInput");
  if (input) input.addEventListener("keydown", e => { if (e.key === "Enter") addExcludedUser(); });
}

function wireRatingsEvents() {
  if (els.btnRatingsRefresh) {
    els.btnRatingsRefresh.addEventListener("click", () => loadRatings());
  }
}

// ── Marketing ──────────────────────────────────────────────────────────────

const MKT_TEMPLATES = {
  invitation: {
    subject: "familiada.online — profesjonalny system do Twoich wydarzeń",
    hasBody: false,
  },
  newsletter: {
    subject: "Nowości w Familiada Online",
    hasBody: true,
  },
  custom: {
    subject: "",
    hasBody: true,
  },
};

let mktActiveTpl = "invitation";
let mktValidEmails = [];
let mktPreviewVisible = false;

function mktApplyTemplate(tplId) {
  mktActiveTpl = tplId;
  document.querySelectorAll("#mktTemplateButtons [data-tpl]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tpl === tplId);
  });
  const tpl = MKT_TEMPLATES[tplId] || MKT_TEMPLATES.custom;
  const subjectEl = document.getElementById("mktSubject");
  const bodyWrap = document.getElementById("mktBodyWrap");
  const subjectHint = document.getElementById("mktSubjectHint");
  if (subjectEl && !subjectEl._userEdited) {
    subjectEl.value = tpl.subject;
  }
  if (bodyWrap) bodyWrap.style.display = tpl.hasBody ? "" : "none";
  if (subjectHint) subjectHint.textContent = tpl.hasBody ? "" : (t("settings.marketing.subjectAutoHint") || "Temat ustawiony automatycznie — możesz go zmienić.");
  if (mktPreviewVisible) mktRefreshPreview();
}

async function mktRefreshPreview() {
  const frame = document.getElementById("mktPreviewFrame");
  if (!frame) return;
  const subject = (document.getElementById("mktSubject")?.value || "").trim();

  // Get HTML content from TinyMCE (same as what will be sent)
  const mktEditor = tinymce.get("mktBody");
  const bodyHtml = mktEditor ? mktEditor.getContent() : "";

  // Build preview based on template type (same as sendMarketing)
  let previewHtml = "";
  
  if (mktActiveTpl === "invitation") {
    // Invitation - full template with feature tiles and images
    const IMG_BASE = "https://familiada.online/img/pl";
    previewHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:dark}</style></head><body style="margin:0;padding:0;background:#050914;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:26px 16px;"><div style="padding:14px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:16px;margin-bottom:14px;"><a href="https://familiada.online" style="text-decoration:none"><div style="font-weight:900;font-size:16px;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6">FAMILIADA</div><div style="margin-top:3px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.05em">familiada.online</div></a></div><div style="padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)"><p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.9)">Witam,</p><p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">Piszę w sprawie narzędzia, które ułatwia organizację wydarzeń i może realnie wesprzeć realizowane projekty.</p><p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)"><strong style="color:#fff">familiada.online</strong> to profesjonalna platforma do prowadzenia teleturnieju na żywo. To kompletny system: od zbierania odpowiedzi od gości (kod QR), przez panel operatora, aż po animowaną tablicę wyników z dźwiękami prosto z telewizyjnego studia.</p><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tr><td style="padding:0 0 8px"><img src="https://familiada.online/img/pl/landing-polls.webp" width="516" alt="Ankieta QR" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Ankieta QR — goście odpowiadają na żywo</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Uczestnicy odpowiadają z własnych telefonów. System automatycznie normalizuje wyniki do 100 punktów.</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tr><td style="padding:0 0 8px"><img src="https://familiada.online/img/pl/landing-control.webp" width="516" alt="Panel operatora" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Panel operatora — pełna kontrola</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Intuicyjne sterowanie rundami, punktami i błędami (X) w czasie rzeczywistym.</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tr><td style="padding:0 0 8px"><img src="https://familiada.online/img/pl/landing-display.webp" width="516" alt="Tablica wyników" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Tablica wyników na TV lub rzutnik</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Animowana tablica z zakrytymi odpowiedziami, bankiem punktów i błędami X — z dźwiękami prosto z telewizyjnego studia.</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tr><td style="padding:0 0 8px"><img src="https://familiada.online/img/pl/landing-host.webp" width="516" alt="Panel prowadzącego" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Panel prowadzącego — gotowe pytania</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Baza pytań z gotowymi kategoriami. Możliwość dodania własnych pytań i kategorii.</td></tr></table><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><div style="margin-top:24px;text-align:center"><a href="https://familiada.online" style="display:inline-block;padding:13px 30px;background:#ffeaa6;color:#050914;font-weight:800;font-size:13px;letter-spacing:.09em;text-transform:uppercase;border-radius:10px;text-decoration:none">Poznaj system familiada.online</a></div><div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.4);line-height:1.6">Wiadomość ma charakter informacyjny i została wysłana jednorazowo do osób związanych z branżą eventową. W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.</div></div><div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.35);text-align:center;line-height:1.6">Familiada Online — bezpłatny system na <a href="https://familiada.online" style="color:rgba(255,234,166,.5);text-decoration:none">familiada.online</a><br>Wysłano z kontakt@familiada.online</div></div></body></html>`;
  } else if (mktActiveTpl === "newsletter") {
    // Newsletter - Familiada wrapper + TinyMCE HTML + unsubscribe + footer
    previewHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:dark}</style></head><body style="margin:0;padding:0;background:#050914;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:26px 16px;"><div style="padding:14px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:16px;margin-bottom:14px;"><a href="https://familiada.online" style="text-decoration:none"><div style="font-weight:900;font-size:16px;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6">FAMILIADA</div><div style="margin-top:3px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.05em">familiada.online</div></a></div><div style="padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)"><p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#ffeaa6">${escSetting(subject)}</p><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><div style="font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">${bodyHtml || '<em style="opacity:.5">(brak treści)</em>'}</div><div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.4);line-height:1.6">W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.</div></div><div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.35);text-align:center;line-height:1.6">Familiada Online — bezpłatny system na <a href="https://familiada.online" style="color:rgba(255,234,166,.5);text-decoration:none">familiada.online</a><br>Wysłano z kontakt@familiada.online</div></div></body></html>`;
  } else {
    // Custom - TinyMCE HTML + unsubscribe + footer
    previewHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:dark}</style></head><body style="margin:0;padding:0;background:#050914;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:26px 16px;"><div style="padding:14px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:16px;margin-bottom:14px;"><a href="https://familiada.online" style="text-decoration:none"><div style="font-weight:900;font-size:16px;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6">FAMILIADA</div><div style="margin-top:3px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.05em">familiada.online</div></a></div><div style="padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)"><div style="font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">${bodyHtml || '<em style="opacity:.5">(brak treści)</em>'}</div><div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.4);line-height:1.6">W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.</div></div><div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.35);text-align:center;line-height:1.6">Familiada Online — bezpłatny system na <a href="https://familiada.online" style="color:rgba(255,234,166,.5);text-decoration:none">familiada.online</a><br>Wysłano z kontakt@familiada.online</div></div></body></html>`;
  }
  
  frame.srcdoc = previewHtml;
}

function mktParseEmails() {
  const raw = (document.getElementById("mktEmailInput")?.value || "");
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const tokens = raw.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const tok of tokens) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    if (emailRe.test(tok)) valid.push(tok);
    else invalid.push(tok);
  }
  mktValidEmails = valid;
  const listWrap = document.getElementById("mktEmailListWrap");
  const listEl   = document.getElementById("mktEmailList");
  const statsEl  = document.getElementById("mktEmailStats");
  const countEl  = document.getElementById("mktEmailCount");
  if (listWrap) listWrap.style.display = valid.length || invalid.length ? "" : "none";
  if (listEl) {
    listEl.innerHTML = valid.map(e =>
      `<span style="display:inline-block;margin:1px 4px 1px 0;padding:2px 8px;border-radius:4px;background:rgba(255,234,166,.12);color:#ffeaa6;font-size:11px">${esc(e)}</span>`
    ).join("") + (invalid.length ? `<div style="margin-top:6px;color:rgba(255,80,80,.8);font-size:11px">${t("settings.marketing.invalidEmails") || "Niepoprawne:"} ${invalid.map(esc).join(", ")}</div>` : "");
  }
  const statsText = valid.length
    ? `${valid.length} ${t("settings.marketing.validCount") || "poprawnych"}${invalid.length ? `, ${invalid.length} ${t("settings.marketing.invalidCount") || "niepoprawnych"}` : ""}`
    : (t("settings.marketing.noValid") || "Brak poprawnych adresów.");
  if (statsEl) statsEl.textContent = statsText;
  if (countEl) countEl.textContent = valid.length ? `${valid.length}` : "";
}

async function sendMarketing() {
  const subject = (document.getElementById("mktSubject")?.value || "").trim();
  // Get HTML content from TinyMCE
  const editor = tinymce.get("mktBody");
  if (!editor) {
    showToast("Edytor nie jest gotowy.", "error");
    return;
  }
  const bodyHtml = editor.getContent();
  const statusEl = document.getElementById("mktSendStatus");
  if (!subject) { showToast(t("settings.marketing.errSubject") || "Podaj temat.", "error"); return; }
  if (!mktValidEmails.length) { showToast(t("settings.marketing.errEmails") || "Waliduj listę adresów.", "error"); return; }

  // Build HTML email based on template type (templates in JS, not worker)
  let htmlBody = "";
  if (mktActiveTpl === "invitation") {
    // Invitation - full template with feature tiles and images
    const IMG_BASE = "https://familiada.online/img/pl";
    htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:dark}</style></head><body style="margin:0;padding:0;background:#050914;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:26px 16px;"><div style="padding:14px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:16px;margin-bottom:14px;"><a href="https://familiada.online" style="text-decoration:none"><div style="font-weight:900;font-size:16px;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6">FAMILIADA</div><div style="margin-top:3px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.05em">familiada.online</div></a></div><div style="padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)"><p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.9)">Witam,</p><p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">Piszę w sprawie narzędzia, które ułatwia organizację wydarzeń i może realnie wesprzeć realizowane projekty.</p><p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)"><strong style="color:#fff">familiada.online</strong> to profesjonalna platforma do prowadzenia teleturnieju na żywo. To kompletny system: od zbierania odpowiedzi od gości (kod QR), przez panel operatora, aż po animowaną tablicę wyników z dźwiękami prosto z telewizyjnego studia.</p><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tr><td style="padding:0 0 8px"><img src="${IMG_BASE}/landing-polls.webp" width="516" alt="Ankieta QR" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Ankieta QR — goście odpowiadają na żywo</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Uczestnicy odpowiadają z własnych telefonów. System automatycznie normalizuje wyniki do 100 punktów.</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tr><td style="padding:0 0 8px"><img src="${IMG_BASE}/landing-control.webp" width="516" alt="Panel operatora" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Panel operatora — pełna kontrola</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Intuicyjne sterowanie rundami, punktami i błędami (X) w czasie rzeczywistym.</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tr><td style="padding:0 0 8px"><img src="${IMG_BASE}/landing-display.webp" width="516" alt="Tablica wyników" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Tablica wyników na TV lub rzutnik</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Animowana tablica z zakrytymi odpowiedziami, bankiem punktów i błędami X — z dźwiękami prosto z telewizyjnego studia.</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tr><td style="padding:0 0 8px"><img src="${IMG_BASE}/landing-host.webp" width="516" alt="Panel prowadzącego" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Panel prowadzącego — gotowe pytania</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Baza pytań z gotowymi kategoriami. Możliwość dodania własnych pytań i kategorii.</td></tr></table><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><div style="margin-top:24px;text-align:center"><a href="https://familiada.online" style="display:inline-block;padding:13px 30px;background:#ffeaa6;color:#050914;font-weight:800;font-size:13px;letter-spacing:.09em;text-transform:uppercase;border-radius:10px;text-decoration:none">Poznaj system familiada.online</a></div><div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.4);line-height:1.6">Wiadomość ma charakter informacyjny i została wysłana jednorazowo do osób związanych z branżą eventową. W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.</div></div><div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.35);text-align:center;line-height:1.6">Familiada Online — bezpłatny system na <a href="https://familiada.online" style="color:rgba(255,234,166,.5);text-decoration:none">familiada.online</a><br>Wysłano z kontakt@familiada.online</div></div></body></html>`;
  } else if (mktActiveTpl === "newsletter") {
    // Newsletter - Familiada wrapper + TinyMCE HTML + unsubscribe + footer
    htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:dark}</style></head><body style="margin:0;padding:0;background:#050914;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:26px 16px;"><div style="padding:14px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:16px;margin-bottom:14px;"><a href="https://familiada.online" style="text-decoration:none"><div style="font-weight:900;font-size:16px;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6">FAMILIADA</div><div style="margin-top:3px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.05em">familiada.online</div></a></div><div style="padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)"><p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#ffeaa6">${escSetting(subject)}</p><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><div style="font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">${bodyHtml}</div><div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.4);line-height:1.6">W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.</div></div><div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.35);text-align:center;line-height:1.6">Familiada Online — bezpłatny system na <a href="https://familiada.online" style="color:rgba(255,234,166,.5);text-decoration:none">familiada.online</a><br>Wysłano z kontakt@familiada.online</div></div></body></html>`;
  } else {
    // Custom - TinyMCE HTML + unsubscribe + footer (always the same structure)
    htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:dark}</style></head><body style="margin:0;padding:0;background:#050914;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:26px 16px;"><div style="padding:14px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:16px;margin-bottom:14px;"><a href="https://familiada.online" style="text-decoration:none"><div style="font-weight:900;font-size:16px;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6">FAMILIADA</div><div style="margin-top:3px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.05em">familiada.online</div></a></div><div style="padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)"><div style="font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">${bodyHtml}</div><div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.4);line-height:1.6">W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.</div></div><div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.35);text-align:center;line-height:1.6">Familiada Online — bezpłatny system na <a href="https://familiada.online" style="color:rgba(255,234,166,.5);text-decoration:none">familiada.online</a><br>Wysłano z kontakt@familiada.online</div></div></body></html>`;
  }

  const confirmed = await confirmModal({
    text: `${t("settings.marketing.confirmSend") || "Wysłać wiadomość do"} ${mktValidEmails.length} ${t("settings.marketing.confirmRecipients") || "odbiorców"}?`,
  });
  if (!confirmed) return;

  if (statusEl) statusEl.textContent = t("settings.marketing.sending") || "Wysyłam…";
  document.getElementById("btnMktSend")?.setAttribute("disabled", "");

  try {
    const res = await adminFetch("/marketing/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: mktValidEmails, subject, template_id: mktActiveTpl, custom_body: htmlBody }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast(`${t("settings.marketing.sent") || "Dodano do kolejki:"} ${json.queued}/${json.total}`, "success");
    if (statusEl) statusEl.textContent = "";
    
    // Clear email list after successful send
    const emailInput = document.getElementById("mktEmailInput");
    if (emailInput) emailInput.value = "";
    mktValidEmails = [];
    mktParseEmails();
  } catch (err) {
    if (statusEl) statusEl.textContent = "";
    showToast(String(err?.message || err), "error");
  } finally {
    document.getElementById("btnMktSend")?.removeAttribute("disabled");
  }
}

function wireMarketingEvents() {
  // Template buttons
  document.querySelectorAll("#mktTemplateButtons [data-tpl]").forEach(btn => {
    btn.addEventListener("click", () => mktApplyTemplate(btn.dataset.tpl));
  });

  // Subject user-edited flag
  const subjectEl = document.getElementById("mktSubject");
  if (subjectEl) {
    subjectEl.addEventListener("input", () => { subjectEl._userEdited = true; });
  }

  // Parse on demand
  document.getElementById("btnMktParseEmails")?.addEventListener("click", mktParseEmails);

  // File input
  document.getElementById("mktFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const area = document.getElementById("mktEmailInput");
    if (area) area.value = (area.value ? area.value + "\n" : "") + text;
    mktParseEmails();
    e.target.value = "";
  });

  // Clear list
  document.getElementById("btnMktClearList")?.addEventListener("click", () => {
    mktValidEmails = [];
    const area = document.getElementById("mktEmailInput");
    if (area) area.value = "";
    const listWrap = document.getElementById("mktEmailListWrap");
    if (listWrap) listWrap.style.display = "none";
    const countEl = document.getElementById("mktEmailCount");
    if (countEl) countEl.textContent = "";
  });

  // Toggle preview
  document.getElementById("btnMktTogglePreview")?.addEventListener("click", () => {
    mktPreviewVisible = !mktPreviewVisible;
    const wrap = document.getElementById("mktPreviewWrap");
    const btn  = document.getElementById("btnMktTogglePreview");
    if (wrap) wrap.style.display = mktPreviewVisible ? "" : "none";
    if (btn) btn.textContent = mktPreviewVisible
      ? (t("settings.marketing.hidePreview") || "Ukryj podgląd")
      : (t("settings.marketing.showPreview") || "Pokaż podgląd");
    if (mktPreviewVisible) mktRefreshPreview();
  });

  document.getElementById("btnMktPreview")?.addEventListener("click", mktRefreshPreview);

  // Send
  document.getElementById("btnMktSend")?.addEventListener("click", sendMarketing);

  // Init default template
  mktApplyTemplate("invitation");
}

function wireEvents() {
  const markDirty = () => {
    formDirty = true;
  };

  if (els.btnTabStats) {
    els.btnTabStats.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("stats");
      await Promise.all([loadAdminStats({ silent: true }), loadRetentionStats(), loadExcludedUsers()]);
    });
  }

  if (els.btnTabRatings) {
    els.btnTabRatings.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("ratings");
      await loadRatings({ silent: true });
      loadProducerRatings();
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

  if (els.maintenanceUseStandardText) {
    els.maintenanceUseStandardText.addEventListener("change", () => {
      markDirty();
      if (els.maintenanceCustomCommentWrap) {
        els.maintenanceCustomCommentWrap.hidden = els.maintenanceUseStandardText.checked;
      }
    });
  }
  if (els.maintenanceCustomCommentPl) els.maintenanceCustomCommentPl.addEventListener("input", markDirty);
  if (els.maintenanceCustomCommentEn) els.maintenanceCustomCommentEn.addEventListener("input", markDirty);
  if (els.maintenanceCustomCommentUk) els.maintenanceCustomCommentUk.addEventListener("input", markDirty);

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

  // Maintenance preview
  document.getElementById("btnMaintenancePreview")?.addEventListener("click", () => {
    markUserAction();
    openMaintenancePreview();
  });
  document.getElementById("btnMaintenancePreviewClose")?.addEventListener("click", () => {
    closeMaintenancePreview();
  });
  document.getElementById("maintenancePreviewOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "maintenancePreviewOverlay") closeMaintenancePreview();
  });

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

  if (els.btnTabMarketing) {
    els.btnTabMarketing.addEventListener("click", () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("marketing");
    });
  }

  if (els.btnTabMarketingContacts) {
    els.btnTabMarketingContacts.addEventListener("click", () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("marketingContacts");
    });
  }

  wireMarketplaceEvents();
  wireReportsEvents();
  loadFolderBadges();
  wireMarketingEvents();
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
      // Try standard Cloudflare Access login
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
  syncTopbarHeight();
  window.addEventListener("resize", syncTopbarHeight);
  window.addEventListener("i18n:lang", () => {
    syncTopbarHeight();
    applyDateOrderByLang();
    applyModalLabels();
    renderProviderOrder();
  });
  startCountdownTimer();
  await initToolsSelect();
  wireEvents();


  // Initialize TinyMCE for marketing message area
  const initMktTinyMCE = () => {
    if (typeof tinymce === "undefined") { setTimeout(initMktTinyMCE, 200); return; }
    const mktEl = document.getElementById("mktBody");
    if (!mktEl) { setTimeout(initMktTinyMCE, 200); return; }
    if (mktEl._tinyMCEInitialized) return;
    tinymce.init({
      selector: "#mktBody", height: 400, menubar: "edit insert view format table tools",
      branding: false, promotion: false, license_key: "gpl",
      plugins: "lists link image table autoresize codesample",
      toolbar: "undo redo | fontsize | formatselect | bold italic forecolor backcolor | bullist numlist | link image | table | codesample | removeformat",
      fontsize_formats: "10px 11px 12px 13px 14px 15px 16px 18px 20px 22px 24px 26px 28px 32px 36px 48px",
      color_map: [
        "000000", "Czarny",
        "ffffff", "Biały",
        "ffeaa6", "Złoty Familiada",
        "050914", "Ciemny Familiada",
        "ff6b6b", "Czerwony",
        "4ecdc4", "Turkusowy",
        "45b7d1", "Niebieski",
        "96ceb4", "Zielony",
        "f7d794", "Żółty",
        "778ca3", "Szary"
      ],
      content_style: `
        body { background: #050914 !important; color: #ffffff !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; line-height: 1.4; }
        a { color: #ffeaa6 !important; }
        table { border-collapse: collapse; width: 100%; }
        table td, table th { border: 1px solid rgba(255,255,255,.2); padding: 8px; }
        code, pre { background: rgba(255,234,166,.1); color: #ffeaa6; padding: 2px 6px; border-radius: 4px; }
      `,
      paste_data_images: true,
      images_upload_handler: (blobInfo) => new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blobInfo.blob()); }),
      setup: (editor) => { mktEl._tinyMCEInitialized = true; },
    });
  };
  setTimeout(initMktTinyMCE, 100);

  // ═══════════════════════════════════════════════════════════
  // MARKETING CONTACTS
  // ═══════════════════════════════════════════════════════════
<<<<<<< HEAD
  const { rt } = await import("../core/realtime.js?v=v2026-04-23T17271");
=======
  const { rt } = await import("../core/realtime.js?v=v2026-04-23T22255");
>>>>>>> 3b9d02497ee77b4707ad719247efae14a45e4180
  const MC_API = "https://leads.familiada.online";
  const MC_PAGE_SIZE = 50;
  let mcToken = null;
  let mcRealtimeChannel = null;

  async function mcGetToken() {
    if (mcToken) return mcToken;
    try {
      const res = await fetch("/_admin_api/config/lead-finder-token");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.token) {
          mcToken = data.token;
          return mcToken;
        }
      }
    } catch(e) {}
    return null;
  }
  let mcState = {
    runs: [],
    contacts: [],
    selectedRows: new Set(),
    page: 1,
    sortCol: 'added_at',
    sortDir: 'desc',
    logs: [],
    logRun: null,
    logTimer: null,
    status: "idle"
  };

  function mcUpdateButtons() {
    const actionBtn = document.getElementById("mcActionBtn");
    const cancelBtn = document.getElementById("mcCancelBtn");
    const targetInput = document.getElementById("mcTargetCount");
    if (!actionBtn || !cancelBtn) return;

    actionBtn.disabled = false;
    cancelBtn.disabled = false;

    switch (mcState.status) {
      case "running":
        actionBtn.textContent = "⏸ Wstrzymaj";
        actionBtn.className = "btn sm warning";
        cancelBtn.style.display = "";
        targetInput.disabled = true;
        break;
      case "paused":
        actionBtn.textContent = "▶ Wznów";
        actionBtn.className = "btn sm gold";
        cancelBtn.style.display = "";
        targetInput.disabled = true;
        break;
      case "cancelled":
      case "completed":
      case "idle":
      default:
        actionBtn.textContent = "▶ Uruchom";
        actionBtn.className = "btn sm gold";
        cancelBtn.style.display = "none";
        targetInput.disabled = false;
        break;
    }
    renderAiProviderOrder();
  }

  async function mcLoadRuns() {
    try {
      const tk = await mcGetToken();
      const res = await fetch(`${MC_API}/api/search-runs/status`, {headers:{Authorization:`Bearer ${tk}`}});
      if (!res.ok) {
        mcState.status = "idle";
        mcUpdateButtons();
        return;
      }
      const data = await res.json();
      mcState.status = data.status || "idle";
      mcState.logRun = data.run_id;
      mcUpdateButtons();
    } catch(e) {
      mcState.status = "idle";
      mcUpdateButtons();
    }
  }

  async function mcStartRun() {
    const actionBtn = document.getElementById("mcActionBtn");
    const count = parseInt(document.getElementById("mcTargetCount").value) || 50;
    actionBtn.disabled = true;
    try {
      const tk = await mcGetToken();
      mcState.logs = [];
      mcRenderLogs();
      const res = await fetch(`${MC_API}/api/search-runs?target_count=${count}`, {method:"POST", headers:{Authorization:`Bearer ${tk}`}});
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      actionBtn.textContent = "✅ Uruchomiono!";
      setTimeout(()=>{ mcState.status = "running"; mcUpdateButtons(); }, 1500);
      mcState.logRun = data.run_id;
      mcStartLogAutoRefresh();
    } catch(e) {
      alert("Błąd: " + e.message);
      mcUpdateButtons();
    }
  }

  window.mcAction = async function() {
    const actionBtn = document.getElementById("mcActionBtn");
    const cancelBtn = document.getElementById("mcCancelBtn");
    actionBtn.disabled = true;
    cancelBtn.disabled = true;
    
    const tk = await mcGetToken();
    await mcLoadRuns();
    if (mcState.status === "running") {
      await fetch(`${MC_API}/api/search-runs/${mcState.logRun}/pause`,{method:"POST", headers:{Authorization:`Bearer ${tk}`}});
      mcState.status = "paused";
      mcUpdateButtons();
      mcStopLogAutoRefresh();
    } else if (mcState.status === "paused") {
      await fetch(`${MC_API}/api/search-runs/${mcState.logRun}/resume`,{method:"POST", headers:{Authorization:`Bearer ${tk}`}});
      mcState.status = "running";
      mcUpdateButtons();
      mcStartLogAutoRefresh();
    } else {
      await mcStartRun();
    }
  };

  window.mcCancel = async function() {
    if(!confirm("Anulować zlecenie?")) return;
    const actionBtn = document.getElementById("mcActionBtn");
    const cancelBtn = document.getElementById("mcCancelBtn");
    actionBtn.disabled = true;
    cancelBtn.disabled = true;
    
    const tk = await mcGetToken();
    await fetch(`${MC_API}/api/search-runs/${mcState.logRun}/cancel`,{method:"POST", headers:{Authorization:`Bearer ${tk}`}});
    mcState.status = "idle";
    mcUpdateButtons();
    mcStopLogAutoRefresh();
    mcLoadContacts();
  };

  async function mcLoadContacts() {
    const tbody = document.getElementById("mcTableBody");
    console.log('[MC] mcLoadContacts called, page:', mcState.page, 'panel hidden:', document.getElementById("marketingContactsPanel")?.hidden);
    try {
      let query = sb().from("marketing_verified_contacts").select("*", { count: 'exact' });
      const fUsed = document.getElementById("mcFilterUsed").value;
      if (fUsed !== "") query = query.eq("is_used", fUsed === "true");
      const from = (mcState.page - 1) * MC_PAGE_SIZE;
      const to = from + MC_PAGE_SIZE - 1;
      const { data, error, count } = await query.order(mcState.sortCol, {ascending: mcState.sortDir === 'asc'}).range(from, to);
      if (error) throw error;
      mcState.contacts = data || [];
      mcRenderContacts(count || 0);
      mcUpdateSortHeaders();
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.5;padding:1.5rem">Błąd: ${e.message}</td></tr>`;
    }
  }

  function mcUpdateSortHeaders() {
    document.querySelectorAll('.mc-sortable').forEach(th => {
      const col = th.dataset.col;
      const arrow = col === mcState.sortCol ? (mcState.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      th.innerHTML = th.dataset.label + arrow;
    });
  }

  function mcInitSorting() {
    document.querySelectorAll('.mc-sortable').forEach(th => {
      th.dataset.label = th.textContent.trim().replace(/[▲▼]/g, '');
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (mcState.sortCol === col) {
          mcState.sortDir = mcState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          mcState.sortCol = col;
          mcState.sortDir = 'desc';
        }
        mcState.page = 1;
        mcLoadContacts();
      });
    });
  }

  function mcRenderContacts(totalCount) {
    const tbody = document.getElementById("mcTableBody");
    if (!mcState.contacts.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:.5;padding:1.5rem">Brak kontaktów</td></tr>';
      mcUpdatePagination(0);
      return;
    }
    tbody.innerHTML = mcState.contacts.map((c, i) => {
      const usedClass = c.is_used ? 'mc-used' : '';
      const usedText = c.is_used ? '✓' : '';
      const addedAt = c.added_at ? new Date(c.added_at).toLocaleString('pl-PL', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '—';
      return `<tr class="${usedClass}" data-id="${c.id}">
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="0">${mcEsc(c.title||'')}</td>
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="1">${mcEsc(c.email||'')}</td>
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="2">${mcEsc(c.url||'')}</td>
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="3">${addedAt}</td>
        <td class="mc-cell mc-selectable" data-row="${i}" data-col="4" style="text-align:center">${usedText}</td>
      </tr>`;
    }).join("");
    mcUpdatePagination(totalCount);
    mcSetupTableSelection();
  }

  function mcSetupTableSelection() {
    const tbody = document.getElementById("mcTableBody");
    let isDragging = false;
    let startCell = null;
    let scrollInterval = null;

    function highlightCells() {
      tbody.querySelectorAll('.mc-cell-selected').forEach(c => c.classList.remove('mc-cell-selected'));
      mcState.selectedCells.forEach(({row, col}) => {
        const cellEl = tbody.querySelector(`.mc-selectable[data-row="${row}"][data-col="${col}"]`);
        if (cellEl) cellEl.classList.add('mc-cell-selected');
      });
      // Show/hide visit URL button
      mcUpdateUrlButton();
      // Update mark used button
      mcUpdateMarkUsedBtn();
    }

    function toggleCell(row, col) {
      const idx = mcState.selectedCells.findIndex(c => c.row === row && c.col === col);
      if (idx >= 0) mcState.selectedCells.splice(idx, 1);
      else mcState.selectedCells.push({row, col});
      highlightCells();
    }

    function selectRange(startRow, startCol, endRow, endCol) {
      mcState.selectedCells = [];
      const minRow = Math.min(startRow, endRow);
      const maxRow = Math.max(startRow, endRow);
      const minCol = Math.min(startCol, endCol);
      const maxCol = Math.max(startCol, endCol);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          mcState.selectedCells.push({row: r, col: c});
        }
      }
      highlightCells();
    }

    function deselectAll() {
      mcState.selectedCells = [];
      highlightCells();
    }

    function mcUpdateUrlButton() {
      const btn = document.getElementById("mcVisitUrlBtn");
      const info = document.getElementById("mcSelectionInfo");
      if (!btn) return;

      // Only show button if exactly ONE cell is selected and it's a URL cell
      if (mcState.selectedCells.length === 1 && mcState.selectedCells[0].col === 2) {
        const row = mcState.selectedCells[0].row;
        const contact = mcState.contacts[row];
        if (contact && contact.url) {
          btn.href = contact.url;
          btn.style.display = '';
          if (info) info.textContent = '';
          return;
        }
      }

      btn.style.display = 'none';
      // Update selection info
      if (info) {
        const rows = new Set(mcState.selectedCells.map(c => c.row));
        info.textContent = mcState.selectedCells.length > 0 ? `${mcState.selectedCells.length} komórek, ${rows.size} wierszy` : '';
      }
    }

    // Auto-scroll during drag
    function startAutoScroll() {
      if (scrollInterval) return;
      scrollInterval = setInterval(() => {
        if (!isDragging || !startCell) { stopAutoScroll(); return; }
        
        const threshold = 100;
        const scrollSpeed = 20;
        const viewportHeight = window.innerHeight;
        
        let scrolled = false;
        if (mcDragY < threshold) {
          window.scrollBy(0, -scrollSpeed);
          scrolled = true;
        } else if (mcDragY > viewportHeight - threshold) {
          window.scrollBy(0, scrollSpeed);
          scrolled = true;
        }

        if (scrolled) {
          const el = document.elementFromPoint(mcDragX, mcDragY);
          const cell = el ? el.closest('.mc-selectable') : null;
          if (cell) {
            const endRow = parseInt(cell.dataset.row);
            const endCol = parseInt(cell.dataset.col);
            selectRange(startCell.row, startCell.col, endRow, endCol);
          }
        }
      }, 20);
    }

    function stopAutoScroll() {
      if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
    }

    let mcDragX = 0;
    let mcDragY = 0;

    // Mouse down on cell
    tbody.addEventListener('mousedown', (e) => {
      const cell = e.target.closest('.mc-selectable');
      if (!cell) return;
      e.preventDefault();
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);

      if (e.metaKey || e.ctrlKey) {
        toggleCell(row, col);
        console.log('[MC] Toggle cell:', row, col, 'selected:', mcState.selectedCells.length);
      } else if (e.shiftKey && mcState.selectedCells.length > 0) {
        const last = mcState.selectedCells[mcState.selectedCells.length - 1];
        selectRange(last.row, last.col, row, col);
      } else {
        isDragging = true;
        startCell = {row, col};
        mcDragX = e.clientX;
        mcDragY = e.clientY;
        mcState.selectedCells = [];
        mcState.selectedCells.push({row, col});
        highlightCells();
      }
    });

    // Mouse move - drag select with auto-scroll
    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !startCell) return;
      mcDragX = e.clientX;
      mcDragY = e.clientY;
      
      const threshold = 100;
      const vh = window.innerHeight;
      if (mcDragY < threshold || mcDragY > vh - threshold) {
        startAutoScroll();
      } else {
        stopAutoScroll();
      }

      const cell = e.target.closest('.mc-selectable');
      if (cell) {
        const endRow = parseInt(cell.dataset.row);
        const endCol = parseInt(cell.dataset.col);
        selectRange(startCell.row, startCell.col, endRow, endCol);
      }
    });

    // Mouse up
    document.addEventListener('mouseup', () => {
      isDragging = false;
      startCell = null;
      stopAutoScroll();
    });

    // Click outside table to deselect
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('#mcContactsTable') && 
          !e.target.closest('#mcVisitUrlBtn') &&
          !e.target.closest('#mcMarkUsedBtn') &&
          !e.target.closest('#mcDeleteBtn')) {
        deselectAll();
      }
    });

    // Copy
    document.addEventListener('copy', (e) => {
      if (!mcState.selectedCells || mcState.selectedCells.length === 0) return;
      const panel = document.getElementById("marketingContactsPanel");
      if (panel && panel.hidden) return;
      e.preventDefault();
      const rows = {};
      mcState.selectedCells.forEach(({row, col}) => {
        if (!rows[row]) rows[row] = [];
        rows[row].push(col);
      });
      const sortedRows = Object.keys(rows).map(Number).sort((a,b) => a - b);
      const allCols = new Set();
      mcState.selectedCells.forEach(({col}) => allCols.add(col));
      const sortedCols = [...allCols].sort((a,b) => a - b);
      const lines = sortedRows.map(r => {
        return sortedCols.map(c => {
          const cell = tbody.querySelector(`.mc-selectable[data-row="${r}"][data-col="${c}"]`);
          return cell ? cell.textContent.trim() : '';
        }).join('\t');
      });
      e.clipboardData.setData('text/plain', lines.join('\n'));
    });
  }

  function mcEsc(s) { const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }

  window.mcToggle = function(id, checked) {
    if (checked) mcState.selected.add(id); else mcState.selected.delete(id);
    document.querySelectorAll("#mcTableBody tr").forEach(tr => {
      tr.classList.toggle("selected", mcState.selected.has(tr.dataset.id));
    });
  };

  window.mcUpdate = async function(id, field, value) {
    try {
      const { error } = await sb().from("marketing_verified_contacts").update({[field]:value}).eq("id", id);
      if (error) throw error;
    } catch(e) { mcLoadContacts(); }
  };

  function mcUpdateMarkUsedBtn() {
    const btn = document.getElementById("mcMarkUsedBtn");
    if (!btn) return;
    const rows = new Set(mcState.selectedCells.map(c => c.row));
    if (!rows.size) {
      btn.textContent = "✓ Użyte";
      return;
    }
    const selected = [...rows].map(i => mcState.contacts[i]).filter(Boolean);
    const allUsed = selected.every(c => c.is_used);
    const allUnused = selected.every(c => !c.is_used);
    if (allUsed) {
      btn.textContent = "✗ Nieużyte";
    } else if (allUnused) {
      btn.textContent = "✓ Użyte";
    } else {
      btn.textContent = "⇄ Użyte";
    }
  }

  async function mcMarkUsed() {
    const rows = new Set(mcState.selectedCells.map(c => c.row));
    console.log('[MC] mcMarkUsed called, selectedCells:', mcState.selectedCells.length, 'rows:', rows.size);
    if (!rows.size) { console.log('[MC] No rows selected!'); return; }
    try {
      const selectedContacts = [...rows].map(i => mcState.contacts[i]).filter(Boolean);
      if (!selectedContacts.length) return;
      const allUsed = selectedContacts.every(c => c.is_used);
      const newUsedState = !allUsed;
      const ids = selectedContacts.map(c => c.id);
      const { error } = await sb().from("marketing_verified_contacts").update({is_used: newUsedState}).in("id", ids);
      if (error) throw error;
      mcState.selectedCells = [];
      mcLoadContacts();
    } catch(e) { alert("Błąd: " + e.message); }
  }

  async function mcDeleteSelected() {
    const rows = new Set(mcState.selectedCells.map(c => c.row));
    console.log('[MC] mcDeleteSelected called, selectedCells:', mcState.selectedCells.length, 'rows:', rows.size);
    if (!rows.size) { console.log('[MC] No rows selected!'); return; }
    if (!confirm(`Usunąć ${rows.size} kontaktów?`)) return;
    try {
      const ids = [...rows].map(i => mcState.contacts[i]?.id).filter(Boolean);
      if (!ids.length) return;
      const { error } = await sb().from("marketing_verified_contacts").delete().in("id", ids);
      if (error) throw error;
      mcState.selectedCells = [];
      mcLoadContacts();
    } catch(e) { alert("Błąd: " + e.message); }
  }

  function mcUpdatePagination(total) {
    const pages = Math.ceil(total / MC_PAGE_SIZE) || 1;
    document.getElementById("mcPageInfo").textContent = `Strona ${mcState.page} / ${pages} (${total})`;
    document.getElementById("mcPrevPage").disabled = mcState.page <= 1;
    document.getElementById("mcNextPage").disabled = mcState.page >= pages;
  }

  async function mcLoadLogs() {
    const el = document.getElementById("mcLogsContainer");
    try {
      const { data, error } = await sb().from("marketing_search_logs").select("*").order("created_at", {ascending: false}).limit(200);
      if (error) throw error;
      // Odwróć, aby najstarsze były na górze, najnowsze na dole (chronologicznie)
      mcState.logs = (data || []).reverse();
      mcRenderLogs();
    } catch(e) { el.innerHTML = `<div style="text-align:center;opacity:.5">Błąd: ${e.message}</div>`; }
  }
  async function mcClearLogs() {
    try {
      const { error } = await sb().rpc('clear_marketing_logs');
      if (error) throw error;
      mcState.logs = [];
      mcRenderLogs();
    } catch(e) { console.warn('[MC] Clear logs error:', e); }
  }
  
  function mcInitRealtime() {
    mcDestroyRealtime();
    try {
      const channelName = 'marketing-search-logs-changes';
      mcRealtimeChannel = sb().channel(channelName);
      mcRealtimeChannel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'marketing_search_logs'
          },
          (payload) => {
            if (payload.new) {
              mcState.logs.push(payload.new);
              if (mcState.logs.length > 200) mcState.logs.shift();
              mcRenderLogs();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'marketing_verified_contacts'
          },
          () => {
            if (mcState.page === 1) mcLoadContacts();
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[MC] Realtime subscribed');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[MC] Realtime channel error');
          }
        });
    } catch(e) {
      console.warn('[MC] Realtime init error:', e);
    }
  }
  
  function mcDestroyRealtime() {
    if (mcRealtimeChannel) {
      sb().removeChannel(mcRealtimeChannel);
      mcRealtimeChannel = null;
    }
  }

  function mcRenderLogs() {
    const el = document.getElementById("mcLogsContainer");
    if (!mcState.logs.length) { el.innerHTML = '<div style="text-align:center;opacity:.5">Brak logów</div>'; return; }
    el.innerHTML = mcState.logs.slice().map(l => {
      const time = new Date(l.created_at).toLocaleString("pl-PL",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
      const levelClass = {info:"info",success:"success",warning:"warning",error:"error"}[l.level] || "info";
      const levelText = {info:"INFO",success:"OK",warning:"WARN",error:"ERR"}[l.level] || l.level;
      return `<div class="mc-log-entry"><span class="mc-log-time">${time}</span><span class="mc-log-level ${levelClass}">${levelText}</span><span class="mc-log-message">${mcEsc(l.message)}</span></div>`;
    }).join("");
    el.scrollTop = el.scrollHeight;
  }

  function mcStartLogAutoRefresh() {
    if (mcState.logTimer) return;
    mcInitRealtime();
    mcState.logTimer = setInterval(async () => {
      try {
        const tk = await mcGetToken();
        const res = await fetch(`${MC_API}/api/search-runs/status`, {headers:{Authorization:`Bearer ${tk}`}});
        if (!res.ok) {
          mcStopLogAutoRefresh();
          return;
        }
        const data = await res.json();
        mcState.status = data.status || "idle";
        mcState.logRun = data.run_id;
        mcUpdateButtons();
        if (mcState.status !== "running") {
          mcStopLogAutoRefresh();
        }
      } catch(e) {}
    }, 3000);
    // Polling fallback for logs (every 2s)
    mcState.logPollTimer = setInterval(() => mcLoadLogs(), 2000);
  }

  function mcStopLogAutoRefresh() {
    if (mcState.logTimer) { clearInterval(mcState.logTimer); mcState.logTimer = null; }
    if (mcState.logPollTimer) { clearInterval(mcState.logPollTimer); mcState.logPollTimer = null; }
    mcDestroyRealtime();
  }

  // Init MC events
  document.getElementById("mcActionBtn")?.addEventListener("click", mcAction);
  document.getElementById("mcCancelBtn")?.addEventListener("click", mcCancel);
  document.getElementById("mcRefreshBtn")?.addEventListener("click", () => { mcLoadRuns(); mcLoadContacts(); mcLoadLogs(); });
  document.getElementById("mcFilterUsed")?.addEventListener("change", () => { mcState.page=1; mcLoadContacts(); });
  document.getElementById("mcMarkUsedBtn")?.addEventListener("click", mcMarkUsed);
  document.getElementById("mcDeleteBtn")?.addEventListener("click", mcDeleteSelected);
  document.getElementById("mcPrevPage")?.addEventListener("click", () => { if(mcState.page>1){mcState.page--;mcLoadContacts();} });
  document.getElementById("mcNextPage")?.addEventListener("click", () => { mcState.page++; mcLoadContacts(); });
  document.getElementById("mcAutoRefreshLogs")?.addEventListener("change", (e) => { if(e.target.checked) mcStartLogAutoRefresh(); else mcStopLogAutoRefresh(); });
  mcInitSorting();

  // Load MC data when entering tab
  const origSetTab = window.setActiveTabMC;
  const mcObserver = new MutationObserver(async () => {
    if (!document.getElementById("marketingContactsPanel")?.hidden) {
      mcLoadContacts();
      await mcLoadRuns();
      mcLoadLogs();
      if (document.getElementById("mcAutoRefreshLogs")?.checked) mcStartLogAutoRefresh();
      await loadAiProviderOrder();
      }

  });
  const mcPanel = document.getElementById("marketingContactsPanel");
  if (mcPanel) mcObserver.observe(mcPanel, { attributes: true, attributeFilter: ["hidden"] });

  showAuth("settings.login.checking");
  mcUpdateButtons();

  const ok = await checkMe();
  if (ok) {
    showPanel();
    await loadState();
    if (!pollTimer) pollTimer = setInterval(() => loadState({ silent: true }), POLL_MS);
  } else {
    showAuth("settings.login.accessRequired");
  }
})();
