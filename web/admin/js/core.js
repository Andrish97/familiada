// admin/js/core.js — Wspólne dla paneli: elementy (els), API panelu (adminFetch/apiFetch), dymki, formatowanie, TinyMCE.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { handleSheetBack } from "../../shared/js/core/modal-sheet.js?v=v2026-10-24T22002";
import { toast } from "../../shared/js/core/toast.js?v=v2026-10-24T22002";

// settings.html nie ma naturalnego przycisku wstecz na mobile (panel admina
// bez nawigacji "do tyłu") -- btnBackSheet istnieje wyłącznie na potrzeby
// trybu sheet, zastępuje brand w topbarze gdy modal jest otwarty (patrz
// analogiczne rozwiązanie w games.js).
export const btnBackSheet = document.getElementById("btnBackSheet");
if (btnBackSheet) btnBackSheet.dataset.sheetBack = "1";
btnBackSheet?.addEventListener("click", () => { handleSheetBack(); });

export const API_BASE = "/_admin_api";
export const TOOLS_MANIFEST = "/admin/data/tools.json?v=v2026-10-24T22002";

export const POLL_MS = 15000;
export const MINUTES_MIN = 10;
export const MAIL_PROVIDERS = ["brevo", "mailgun", "sendpulse", "zeptomail"];
const EMAIL_TEMPLATES_I18N = {
  pl: {
    custom: "",
    info: "Dziękujemy za wiadomość. Odpowiemy tak szybko, jak to możliwe.",
    received: "Twoja wiadomość została odebrana. Zajmiemy się nią wkrótce.",
    resolved: "Twoje zgłoszenie zostało rozwiązane. Jeśli masz dodatkowe pytania, odpowiedz na tę wiadomość.",
    pending: "Twoje zgłoszenie jest w trakcie realizacji. Otrzymasz aktualizację, gdy tylko będziemy mieli więcej informacji.",
    more_info: "Aby lepiej zrozumieć Twój problem, prosimy o dodatkowe informacje:\n- Kiedy wystąpił problem?\n- Jakie kroki podjąłeś/aś przed wystąpieniem problemu?\n- Czy problem występuje nadal?",
    followup: "Chcielibyśmy się upewnić, że wszystko działa poprawnie. Czy masz jeszcze jakieś pytania lub wątpliwości?",
    closed: "To zgłoszenie zostało zamknięte. Jeśli potrzebujesz dalszej pomocy, utwórz nowe zgłoszenie.",
    thanks: "Dziękujemy za kontakt z nami. Miłego dnia!",
  },
  en: {
    custom: "",
    info: "Thank you for your message. We'll get back to you as soon as possible.",
    received: "Your message has been received. We'll take care of it shortly.",
    resolved: "Your ticket has been resolved. If you have any further questions, just reply to this message.",
    pending: "Your ticket is currently being processed. We'll update you as soon as we have more information.",
    more_info: "To better understand your issue, please provide some additional information:\n- When did the problem occur?\n- What steps did you take before it happened?\n- Is the problem still occurring?",
    followup: "We just wanted to make sure everything is working properly. Do you have any further questions or concerns?",
    closed: "This ticket has been closed. If you need further assistance, please open a new ticket.",
    thanks: "Thank you for contacting us. Have a great day!",
  },
  uk: {
    custom: "",
    info: "Дякуємо за повідомлення. Відповімо якнайшвидше.",
    received: "Ваше повідомлення отримано. Незабаром ми ним займемося.",
    resolved: "Ваше звернення вирішено. Якщо у вас є додаткові запитання, відповідайте на цей лист.",
    pending: "Ваше звернення перебуває в обробці. Ми повідомимо вас, щойно матимемо більше інформації.",
    more_info: "Щоб краще зрозуміти вашу проблему, повідомте, будь ласка, додаткову інформацію:\n- Коли виникла проблема?\n- Які кроки ви виконали перед тим, як вона виникла?\n- Чи проблема досі актуальна?",
    followup: "Хочемо переконатися, що все працює належним чином. Чи маєте ви ще якісь запитання або сумніви?",
    closed: "Це звернення закрито. Якщо потрібна подальша допомога, створіть нове звернення.",
    thanks: "Дякуємо за звернення до нас. Гарного дня!",
  },
};

export function getEmailTemplates(lang = "pl") {
  return EMAIL_TEMPLATES_I18N[lang] || EMAIL_TEMPLATES_I18N.pl;
}

export const CRON_PRESETS = [
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

export const els = {
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
  toolsMenu: document.getElementById("toolsMenu"),
  btnTools: document.getElementById("btnTools"),
  toolsDropdown: document.getElementById("toolsDropdown"),
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
  statCustomSettingsTotal: document.getElementById("statCustomSettingsTotal"),
  statCustomSettingsSub: document.getElementById("statCustomSettingsSub"),
  statPlayedTotal: document.getElementById("statPlayedTotal"),
  statPlayedPeriods: document.getElementById("statPlayedPeriods"),
  statPlayedOutcomes: document.getElementById("statPlayedOutcomes"),
  statPlayedIssues: document.getElementById("statPlayedIssues"),
  statPollGamesTotal: document.getElementById("statPollGamesTotal"),
  statPollGamesTypes: document.getElementById("statPollGamesTypes"),
  statPollActive: document.getElementById("statPollActive"),
  statPollResponses: document.getElementById("statPollResponses"),
  statPollSharing: document.getElementById("statPollSharing"),
  statSubscriptionsTotal: document.getElementById("statSubscriptionsTotal"),
  statSubscriptionsSummary: document.getElementById("statSubscriptionsSummary"),
  statSubscriptionsOther: document.getElementById("statSubscriptionsOther"),
  statBasesTotal: document.getElementById("statBasesTotal"),
  statBasesGrowth: document.getElementById("statBasesGrowth"),
  statLogosTotal: document.getElementById("statLogosTotal"),
  statLogosGrowth: document.getElementById("statLogosGrowth"),
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
  mailProviderOrderList: document.getElementById("mailProviderOrderList"),
  mailDelayMs: document.getElementById("mailDelayMs"),
  mailBatchMax: document.getElementById("mailBatchMax"),
  mailWorkerLimit: document.getElementById("mailWorkerLimit"),
  mailQueueShare: document.getElementById("mailQueueShare"),
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
let lastUserActionTs = 0;

export function setText(el, value) {
  if (el) el.textContent = value;
}

export function markUserAction() {
  lastUserActionTs = Date.now();
}

export function shouldShowActionError() {
  return Date.now() - lastUserActionTs < 5000;
}

export function showAuth(statusText) {
  els.authScreen.hidden = false;
  els.panelScreen.hidden = true;
  document.body.classList.add("settings-locked");
  document.body.classList.add("no-footer-line");
  moveLangSwitcher(true);
  setText(els.authStatus, statusText);
  document.querySelector("main[data-skel-step]")?.classList.add("skel-step-ready");
}

export function showPanel() {
  els.authScreen.hidden = true;
  els.panelScreen.hidden = false;
  document.body.classList.remove("settings-locked");
  document.body.classList.remove("no-footer-line");
  moveLangSwitcher(false);
  syncTopbarHeight();
  // Ustawienia startują z ukrytym topbarem, więc dopiero teraz można
  // wiarygodnie zmierzyć miejsce na przyciski i zdecydować o „Więcej”.
  window.dispatchEvent(new Event("nav:visibilitychange"));
  document.querySelector("main[data-skel-step]")?.classList.remove("skel-step-ready");
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

export function showToast(message, kind = "success") {
  toast(message, { kind: kind === "error" ? "error" : "info" });
}

export async function apiFetch(path, options = {}) {
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

// Dane panelu z Workera (Cloudflare Access + klucz serwisowy po stronie
// serwera); funkcje bazy nie są dostępne publicznym kluczem.
export async function adminGet(path, key) {
  const res = await apiFetch(`${API_BASE}${path}`, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "błąd");
  return key ? data[key] : data;
}

export async function adminPost(path, body, key) {
  const res = await apiFetch(`${API_BASE}${path}`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "błąd");
  return key ? data[key] : data;
}

export async function checkMe() {
  try {
    const res = await apiFetch(`${API_BASE}/me`, { method: "GET" });
    return res.ok;
  } catch(e) {
    return false;
  }
}

export function clampInt(value, min, max, fallback) {
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

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function scrubText(value, max = 160) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

// Zmiany (nie-GET) Worker przyjmuje tylko jako JSON z Origin panelu (CSRF);
// FormData (załączniki) ustawia własny typ multipart.
export function adminFetch(path, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (method !== "GET" && method !== "HEAD" && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`/_admin_api${path}`, { ...init, headers });
}

export function escSetting(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// TinyMCE (edytor treści maili: „Napisz” i Marketing) ładowany dopiero przy
// pierwszym użyciu, w przypiętej wersji — nie blokuje startu panelu.
const TINYMCE_SRC = "https://cdn.jsdelivr.net/npm/tinymce@7.9.3/tinymce.min.js";
let tinymcePromise = null;
export function loadTinyMce() {
  if (globalThis.tinymce) return Promise.resolve(globalThis.tinymce);
  tinymcePromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TINYMCE_SRC;
    script.onload = () => resolve(globalThis.tinymce);
    script.onerror = () => { tinymcePromise = null; reject(new Error("TinyMCE could not be loaded")); };
    document.head.appendChild(script);
  });
  return tinymcePromise;
}

export function syncTopbarHeight() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  const h = Math.ceil(topbar.getBoundingClientRect().height || 0);
  document.body.style.setProperty("--topbar-h", `${h}px`);
}

export function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}
