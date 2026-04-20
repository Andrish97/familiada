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

import { initI18n, t, getUiLang } from "../../translation/translation.js?v=v2026-04-20T08154";
import { initUiSelect } from "../core/ui-select.js?v=v2026-04-20T08154";
import { confirmModal } from "../core/modal.js?v=v2026-04-20T08154";
import { sb } from "../core/supabase.js?v=v2026-04-20T08154";
import { v as cacheBust } from "../core/cache-bust.js?v=v2026-04-20T08154";

const API_BASE = "/_admin_api";
const TOOLS_MANIFEST = "/settings-tools/tools.json";
const POLL_MS = 15000;
const MINUTES_MIN = 10;
const MAIL_PROVIDERS = ["sendgrid", "brevo", "mailgun", "ses"];
const AI_PROVIDERS = ["openrouter", "groq"];
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
  if (mins > 0) return `${mins} ${pluralUk(mins, "хвиlina", "хвилини", "хвилин")}`;
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

function tNoCache(url) {
  return `${url}?v=${cacheBust}`;
}

function escSetting(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateMailSettingsUI(data) {
  if (!data) return;
  if (els.mailQueueEnabled) els.mailQueueEnabled.checked = data.queue_enabled;
  if (data.provider_order) {
    mailProviderOrder = parseProviderOrder(data.provider_order);
    renderProviderOrder();
  }
  if (els.mailDelayMs) els.mailDelayMs.value = String(data.delay_ms);
  if (els.mailBatchMax) els.mailBatchMax.value = String(data.batch_max);
  if (els.mailWorkerLimit) els.mailWorkerLimit.value = String(data.worker_limit);
  if (data.cron) {
    mailCronPresetValue = data.cron.preset || "5m";
    mailCronSupported = data.cron.supported !== false;
    mailCronActive = data.cron.active;
    renderCronPresetOptions();
    updateMailSettingsStatus(data.cron);
  }
  if (els.mailGreeting) {
    mailGreetingValue = data.greeting || "witaj";
    mailGreetingCustomValue = data.greeting_custom || "";
    els.mailGreeting.setValue(mailGreetingValue, { silent: true });
    els.mailGreetingCustomWrap.hidden = mailGreetingValue !== "custom";
    if (els.mailGreetingCustom) els.mailGreetingCustom.value = mailGreetingCustomValue;
  }
  if (els.mailFarewell) {
    mailFarewellValue = data.farewell || "team";
    mailFarewellCustomValue = data.farewell_custom || "";
    els.mailFarewell.setValue(mailFarewellValue, { silent: true });
    els.mailFarewellCustomWrap.hidden = mailFarewellValue !== "custom";
    if (els.mailFarewellCustom) els.mailFarewellCustom.value = mailFarewellCustomValue;
  }
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

function aiProviderLabel(provider) {
  const labels = { openrouter: "OpenRouter", groq: "Groq" };
  return labels[provider] || (provider.charAt(0).toUpperCase() + provider.slice(1));
}

function renderAiProviderOrder() {
  const el = document.getElementById("aiProviderOrderList");
  if (!el) return;
  el.innerHTML = "";
  
  aiProviderOrder.forEach((provider, idx) => {
    const row = document.createElement("div");
    row.className = "provider-order-row";
    row.style.marginBottom = "4px";

    const rank = document.createElement("div");
    rank.className = "provider-order-rank";
    rank.textContent = String(idx + 1);

    const name = document.createElement("div");
    name.className = "provider-order-name";
    name.textContent = aiProviderLabel(provider);

    const actions = document.createElement("div");
    actions.className = "provider-order-actions";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn sm";
    up.textContent = "↑";
    up.disabled = idx === 0;
    up.addEventListener("click", () => moveAiProvider(idx, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn sm";
    down.textContent = "↓";
    down.disabled = idx >= aiProviderOrder.length - 1;
    down.addEventListener("click", () => moveAiProvider(idx, 1));

    actions.append(up, down);
    row.append(rank, name, actions);
    el.appendChild(row);
  });
}

async function saveAiProviderOrder() {
  try {
    await sb().rpc('update_ai_provider_order', { p_order: aiProviderOrder.join(",") });
    showToast(`AI: ${aiProviderOrder.join(" → ")}`);
  } catch(e) {
    console.warn("[AI] save order error:", e);
  }
}

async function loadAiProviderOrder() {
  try {
    const { data } = await sb().rpc('get_provider_order');
    if (data) {
      const raw = Array.isArray(data) ? data[0]?.provider_order : data;
      if (raw) {
        aiProviderOrder = raw.split(',').map(p => p.trim().lower()).filter(Boolean);
        renderAiProviderOrder();
      }
    }
  } catch(e) {
    console.warn("[AI] load order error:", e);
  }
}

function moveAiProvider(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= aiProviderOrder.length) return;
  const next = [...aiProviderOrder];
  [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
  aiProviderOrder = next;
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
