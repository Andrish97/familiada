// admin/js/mail-settings.js — Poczta: dostawcy, harmonogram, kolejka, dziennik, dostawcy AI.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { icon } from "../../shared/js/core/icons.js?v=v2026-10-25T15433";
import { initUiSelect } from "../../shared/js/core/ui-select.js?v=v2026-10-25T15433";
import { API_BASE, CRON_PRESETS, MAIL_PROVIDERS, adminFetch, adminGet, adminPost, apiFetch, clampInt, els, formatDateTime, markUserAction, scrubText, shouldShowActionError, showAuth, showToast } from "./core.js?v=v2026-10-25T15433";
import { activeTab, setActiveTab } from "./tabs.js?v=v2026-10-25T15433";
import { stopPolling } from "./maintenance.js?v=v2026-10-25T15433";
import { closeTools } from "./tools.js?v=v2026-10-25T15433";
import { setProgress } from "../../shared/js/core/ui-metrics.js?v=v2026-10-25T15433";

let mailSettingsLoaded = false;
let mailProviderOrder = [...MAIL_PROVIDERS];
// Zapisany podział dziennego limitu (procent na kolejkę); paski liczone tak jak baza.
let mailQueueSharePct = 80;
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
let mailLogPerPageSelect = null;
const selectedQueueIds = new Set();

const PROVIDER_LABELS = { sendgrid: "SendGrid", brevo: "Brevo", mailgun: "Mailgun", ses: "AWS SES" };

function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || provider;
}

function getCronPresetById(id) {
  return CRON_PRESETS.find((p) => p.id === String(id || "").trim()) || null;
}

function getCronPresetBySchedule(schedule) {
  const value = String(schedule || "").trim();
  if (!value) return null;
  return CRON_PRESETS.find((p) => p.schedule === value) || null;
}

const CRON_PRESET_LABELS = {
  "1m": "Co 1 minutę",
  "2m": "Co 2 minuty",
  "5m": "Co 5 minut",
  "10m": "Co 10 minut",
  "15m": "Co 15 minut",
  "30m": "Co 30 minut",
  "1h": "Co 1 godzinę",
  "2h": "Co 2 godziny",
  "4h": "Co 4 godziny",
  "6h": "Co 6 godzin",
  "12h": "Co 12 godzin",
  "24h": "Co 24 godziny",
};

function cronPresetLabel(preset) {
  if (!preset) return "—";
  return CRON_PRESET_LABELS[preset.id] || `Every ${preset.minutes} min`;
}

export function mailSourceIcon(source) {
  const meta = { email: ["envelope", "E-mail"], form: ["file-doc", "Formularz kontaktowy"], compose: ["edit-paper", "Napisana w panelu"] }[source];
  return meta ? icon(meta[0], { label: meta[1] }) : "";
}

export const COMPOSE_LANG_META = {
  pl: { flag: "flag-pl", label: "Polski" },
  en: { flag: "lang-en", label: "English" },
  uk: { flag: "flag-ua", label: "Українська" },
};
export const COMPOSE_LANGS = Object.keys(COMPOSE_LANG_META);

const GREETING_OPTIONS_I18N = {
  pl: [
    { value: "witaj", label: "Witaj" },
    { value: "hello", label: "Dzień dobry" },
    { value: "hi", label: "Cześć" },
    { value: "dearUser", label: "Szanowny Użytkowniku" },
    { value: "dearCustomer", label: "Szanowny Kliencie" },
  ],
  en: [
    { value: "witaj", label: "Hello" },
    { value: "hello", label: "Good morning" },
    { value: "hi", label: "Hi" },
    { value: "dearUser", label: "Dear User" },
    { value: "dearCustomer", label: "Dear Customer" },
  ],
  uk: [
    { value: "witaj", label: "Вітаю" },
    { value: "hello", label: "Доброго дня" },
    { value: "hi", label: "Привіт" },
    { value: "dearUser", label: "Шановний Користувачу" },
    { value: "dearCustomer", label: "Шановний Клієнте" },
  ],
};

const FAREWELL_OPTIONS_I18N = {
  pl: [
    { value: "regards", label: "Pozdrawiam" },
    { value: "regardsPl", label: "Pozdrawiamy" },
    { value: "bestRegards", label: "Z poważaniem" },
    { value: "kindRegards", label: "Łączę wyrazy szacunku" },
  ],
  en: [
    { value: "regards", label: "Regards" },
    { value: "regardsPl", label: "Best regards" },
    { value: "bestRegards", label: "Sincerely" },
    { value: "kindRegards", label: "Kind regards" },
  ],
  uk: [
    { value: "regards", label: "З повагою" },
    { value: "regardsPl", label: "Вітаємо" },
    { value: "bestRegards", label: "З найкращими побажаннями" },
    { value: "kindRegards", label: "Щиро" },
  ],
};

const SENDER_OPTIONS_I18N = {
  pl: [
    { value: "team", label: "Zespół Familiada" },
    { value: "creator", label: "Twórca Familiada" },
    { value: "admin", label: "Admin" },
    { value: "support", label: "Wsparcie techniczne" },
  ],
  en: [
    { value: "team", label: "Familiada Team" },
    { value: "creator", label: "Familiada Creator" },
    { value: "admin", label: "Admin" },
    { value: "support", label: "Technical Support" },
  ],
  uk: [
    { value: "team", label: "Команда Familiada" },
    { value: "creator", label: "Творець Familiada" },
    { value: "admin", label: "Адмін" },
    { value: "support", label: "Технічна підтримка" },
  ],
};

const TEMPLATE_OPTIONS_I18N = {
  pl: [
    { value: "info", label: "Podziękowanie" },
    { value: "received", label: "Potwierdzenie otrzymania" },
    { value: "resolved", label: "Zgłoszenie rozwiązane" },
    { value: "pending", label: "W trakcie realizacji" },
    { value: "more_info", label: "Prośba o informacje" },
    { value: "followup", label: "Follow-up" },
    { value: "closed", label: "Zamknięcie zgłoszenia" },
    { value: "thanks", label: "Podziękowanie" },
  ],
  en: [
    { value: "info", label: "Thank you" },
    { value: "received", label: "Confirmation received" },
    { value: "resolved", label: "Ticket resolved" },
    { value: "pending", label: "In progress" },
    { value: "more_info", label: "Request for information" },
    { value: "followup", label: "Follow-up" },
    { value: "closed", label: "Ticket closed" },
    { value: "thanks", label: "Thank you" },
  ],
  uk: [
    { value: "info", label: "Подяка" },
    { value: "received", label: "Підтвердження отримання" },
    { value: "resolved", label: "Звернення вирішено" },
    { value: "pending", label: "В процесі" },
    { value: "more_info", label: "Прохання про інформацію" },
    { value: "followup", label: "Follow-up" },
    { value: "closed", label: "Звернення закрито" },
    { value: "thanks", label: "Подяка" },
  ],
};

// "Brak"/"Własny" (none/custom) są UI-owymi opcjami bez realnej treści w mailu,
// więc zostają zawsze po polsku - nie ma sensu ich tłumaczyć per język.
export function getGreetingOptions(lang = "pl") {
  const opts = GREETING_OPTIONS_I18N[lang] || GREETING_OPTIONS_I18N.pl;
  return [{ value: "none", label: "Brak powitania" }, ...opts, { value: "custom", label: "Własne..." }];
}

export function getFarewellOptions(lang = "pl") {
  const opts = FAREWELL_OPTIONS_I18N[lang] || FAREWELL_OPTIONS_I18N.pl;
  return [{ value: "none", label: "Brak pożegnania" }, ...opts, { value: "custom", label: "Własne..." }];
}

export function getSenderOptions(lang = "pl") {
  const opts = SENDER_OPTIONS_I18N[lang] || SENDER_OPTIONS_I18N.pl;
  return [{ value: "none", label: "Brak nadawcy" }, ...opts, { value: "custom", label: "Własny..." }];
}

export function getComposeTemplateOptions(lang = "pl") {
  const opts = TEMPLATE_OPTIONS_I18N[lang] || TEMPLATE_OPTIONS_I18N.pl;
  return [{ value: "custom", label: "Własny" }, ...opts];
}

export function buildEmailSignature({ greeting = "none", farewell = "none", sender = "none", greetingCustom = "", farewellCustom = "", senderCustom = "", lang = "pl" } = {}) {
  const greetingMap = Object.fromEntries(getGreetingOptions(lang).map((o) => [o.value, o.label]));
  const farewellMap = Object.fromEntries(getFarewellOptions(lang).map((o) => [o.value, o.label]));
  const senderMap = Object.fromEntries(getSenderOptions(lang).map((o) => [o.value, o.label]));

  let greetingText = "";
  if (greeting === "custom" && greetingCustom) {
    greetingText = greetingCustom.trim();
  } else if (greeting !== "none" && greeting !== "custom") {
    greetingText = greetingMap[greeting] || "";
  }

  let farewellText = "";
  if (farewell === "custom" && farewellCustom) {
    farewellText = farewellCustom.trim();
  } else if (farewell !== "none" && farewell !== "custom") {
    farewellText = farewellMap[farewell] || "";
  }

  let senderText = "";
  if (sender === "custom" && senderCustom) {
    senderText = senderCustom.trim();
  } else if (sender !== "none" && sender !== "custom") {
    senderText = senderMap[sender] || "";
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
    { value: "all", label: "Wszystkie" },
    { value: "pending", label: "Pending" },
    { value: "sending", label: "Sending" },
    { value: "failed", label: "Failed" },
  ];
}

function mailLogFnOptions() {
  return [
    { value: "all", label: "Wszystkie funkcje" },
    { value: "send-mail", label: "send-mail" },
    { value: "send-email", label: "send-email" },
    { value: "mail-worker", label: "mail-worker" },
  ];
}

function mailLogLevelOptions() {
  return [
    { value: "all", label: "Wszystkie poziomy" },
    { value: "info", label: "info" },
    { value: "warn", label: "warn" },
    { value: "error", label: "error" },
  ];
}

export function syncMailSelectLabels() {
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

export function initMailSelects() {
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

  if (!mailLogPerPageSelect && els.mailLogPerPage) {
    mailLogPerPageSelect = initUiSelect(els.mailLogPerPage, {
      options: [
        { value: "25", label: "25 / str." },
        { value: "50", label: "50 / str." },
        { value: "100", label: "100 / str." },
        { value: "200", label: "200 / str." },
      ],
      value: "50",
      onChange: () => { mailLogsPage = 1; void loadMailLogs(); },
    });
  }
}

export function renderCronPresetOptions() {
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
    els.mailCronHint.textContent = "Cron niedostępny w tej bazie";
    return;
  }
  const selected = getCronPresetById(mailCronPresetValue) || getCronPresetById("5m") || CRON_PRESETS[0];
  if (!selected) {
    els.mailCronHint.textContent = "—";
    return;
  }
  const template = "Worker będzie uruchamiany co {minutes} min (cron: {schedule}).";
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

export function renderProviderOrder() {
  console.log("Rendering providers:", mailProviderOrder);
  if (!els.mailProviderOrderList) {
    console.error("List element not found!");
    return;
  }
  els.mailProviderOrderList.innerHTML = "";
  
  mailProviderOrder.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "provider-order-row mail-provider-row";
    row.classList.toggle("is-off", !p.is_active);

    const activeCheck = document.createElement("input");
    activeCheck.type = "checkbox";
    activeCheck.checked = p.is_active !== false;
    activeCheck.title = "Active";
    activeCheck.addEventListener("change", (e) => {
      p.is_active = e.target.checked;
      row.classList.toggle("is-off", !p.is_active);
    });

    const rank = document.createElement("div");
    rank.className = "provider-order-rank";
    rank.textContent = String(idx + 1);

    const info = document.createElement("div");
    info.className = "grow";
    
    const label = document.createElement("div");
    label.className = "provider-label";
    label.textContent = p.label || p.name;
    
    const stats = document.createElement("div");
    stats.className = "provider-stats";

    const remW = p.rem_worker ?? 0;
    const remI = p.rem_immediate ?? 0;
    const total = p.daily_limit ?? 0;
    const limitW = Math.floor(total * mailQueueSharePct / 100);
    const limitI = total - limitW;

    const createBar = (current, max, label) => {
      const perc = max > 0 ? Math.round((current / max) * 100) : 0;
      const tone = perc > 20 ? "ok" : perc > 5 ? "warn" : "bad";
      const wrap = document.createElement("div");
      wrap.className = "provider-bar";
      
      const lbl = document.createElement("span");
      lbl.className = "provider-bar-label";
      lbl.textContent = label;
      
      const barBg = document.createElement("div");
      barBg.className = "progress provider-bar-track";
      
      const barFill = document.createElement("div");
      barFill.className = "progress-bar";
      barFill.dataset.tone = tone;
      setProgress(barFill, perc);
      
      const val = document.createElement("span");
      val.className = "provider-bar-value";
      val.textContent = `${current}/${max}`;
      
      barBg.appendChild(barFill);
      wrap.append(lbl, barBg, val);
      return wrap;
    };

    stats.appendChild(createBar(remW, limitW, "Kolejka"));
    stats.appendChild(createBar(remI, limitI, "Od razu"));
    
    info.append(label, stats);

    const limitInput = document.createElement("input");
    limitInput.type = "number";
    limitInput.className = "inp sm provider-limit";
    limitInput.value = String(p.daily_limit || 1000);
    limitInput.title = `Limit dzienny: ${mailQueueSharePct}% na kolejkę, reszta na maile wysyłane od razu`;
    limitInput.addEventListener("change", (e) => {
      p.daily_limit = parseInt(e.target.value) || 0;
    });

    const actions = document.createElement("div");
    actions.className = "cluster provider-order-actions";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn sm";
    up.innerHTML = icon("arrow-up", { label: "W górę" });
    up.disabled = idx === 0;
    up.addEventListener("click", () => {
      if (idx <= 0) return;
      [mailProviderOrder[idx - 1], mailProviderOrder[idx]] = [mailProviderOrder[idx], mailProviderOrder[idx - 1]];
      renderProviderOrder();
    });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn sm";
    down.innerHTML = icon("arrow-down", { label: "W dół" });
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

export function renderAiProviderOrder() {
  const el = document.getElementById("aiProviderOrderList");
  if (!el) return;
  el.innerHTML = "";
  
  aiProviders.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "provider-order-row";

    const rank = document.createElement("div");
    rank.className = "provider-order-rank";
    rank.textContent = String(idx + 1);

    const infoWrap = document.createElement("div");
    infoWrap.className = "grow";

    const name = document.createElement("div");
    name.className = "provider-order-name";
    name.textContent = aiProviderLabel(p);

    const status = document.createElement("div");
    status.className = "provider-status";
    
    const now = new Date();
    const cooldown = p.cooldown_until ? new Date(p.cooldown_until) : null;
    
    if (!p.is_active) {
      status.textContent = "Wyłączony";
      status.dataset.tone = "bad";
    } else if (cooldown && cooldown > now) {
      // pełne minuty w górę, potem podział (3 h nie daje „2h 60m”)
      const totalMins = Math.ceil((cooldown - now) / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      status.textContent = `Zablokowany (Quota) - jeszcze ${hours}h ${mins}m`;
      status.dataset.tone = "warn";
    } else {
      status.textContent = "Aktywny";
      status.dataset.tone = "ok";
    }
    
    infoWrap.append(name, status);

    const actions = document.createElement("div");
    actions.className = "cluster provider-order-actions";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn sm";
    up.innerHTML = icon("arrow-up", { label: "W górę" });
    up.disabled = (idx === 0);
    up.addEventListener("click", () => moveAiProvider(idx, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn sm";
    down.innerHTML = icon("arrow-down", { label: "W dół" });
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
    await adminPost("/marketing/ai-providers/order", { names: aiProviders.map((p) => p.name) });
    showToast(`Kolejność AI zapisana.`);
  } catch(e) {
    console.warn("[AI] save order error:", e);
  }
}

export async function loadAiProviderOrder() {
  try {
    const data = await adminGet("/marketing/ai-providers", "rows");
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
    els.mailSettingsStatus.textContent = "Cron niedostępny w tej bazie";
    return;
  }
  if (!cron.configured) {
    els.mailSettingsStatus.textContent = "Cron nie jest skonfigurowany";
    return;
  }
  const mode = cron.active ? "Aktywny" : "Nieaktywny";
  const schedule = String(cron.schedule || "—");
  const preset = getCronPresetBySchedule(schedule);
  const scheduleLabel = preset ? cronPresetLabel(preset) : schedule;
  const limit = clampInt(cron.limit, 1, 200, 25);
  const limitLabel = "limit {count}".replace("{count}", String(limit));
  els.mailSettingsStatus.textContent = `${mode} • ${scheduleLabel} • ${limitLabel}`;
}

function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function createPill(label, className) {
  const span = document.createElement("span");
  span.className = `tag tag--upper ${className || "tag--muted"}`.trim();
  span.textContent = String(label || "—");
  return span;
}

function queueStatusPillClass(statusRaw) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "pending") return "tag--gold";
  if (status === "sending") return "tag--info";
  if (status === "failed") return "tag--bad";
  return "tag--muted";
}

function logLevelPillClass(levelRaw) {
  const level = String(levelRaw || "").toLowerCase();
  if (level === "error") return "tag--bad";
  if (level === "warn") return "tag--warn";
  if (level === "info") return "tag--info";
  if (level === "debug") return "tag--muted";
  return "tag--muted";
}

function logFunctionPillClass(fnRaw) {
  const fn = String(fnRaw || "").toLowerCase();
  if (fn === "mail-worker") return "tag--gold";
  if (fn === "send-mail") return "tag--ok";
  if (fn === "send-email") return "tag--info";
  return "tag--muted";
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
    td.className = "data-table-empty";
    td.textContent = "Brak rekordów w kolejce dla wybranego filtra.";
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
    action.textContent = isSending ? "Wysyłanie..." : "Wyślij teraz";
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
    td.className = "data-table-empty";
    td.textContent = "Brak logów dla wybranego filtra.";
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
        ? createPill("pominięty", "tag--ok")
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
        ? "wyłączone powiadomienia"
        : reasonKey === "skipped_suppression"
          ? "globalny unsubscribe"
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

export async function testTelegram() {
  const status = document.getElementById("telegramStatus");
  try {
    const res  = await adminFetch("/config/telegram/test", { method: "POST" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "test_failed");
    if (status) status.textContent = "Testowe powiadomienie wysłane.";
    showToast("Testowe powiadomienie Telegram wysłane.", "success");
  } catch (err) {
    showToast(String(err?.message || err), "error");
  }
}

async function loadMailSettings({ silent = false } = {}) {
  try {
    const res = await apiFetch(`${API_BASE}/mail/settings`, { method: "GET" });
    if (res.status === 401) {
      stopPolling();
      showAuth("Wymagane logowanie przez Cloudflare Access.");
      return false;
    }
    if (!res.ok) throw new Error(`mail settings fetch failed: ${res.status}`);
    const data = await res.json();
    const settings = data?.settings || {};
    const providers = data?.providers || [];
    const cron = data?.cron || null;

    mailProviderOrder = providers;
    mailQueueSharePct = clampInt(settings.queue_share_pct, 50, 95, 80);
    renderProviderOrder();

    if (els.mailDelayMs) els.mailDelayMs.value = String(clampInt(settings.delay_ms, 0, 5000, 250));
    if (els.mailBatchMax) els.mailBatchMax.value = String(clampInt(settings.batch_max, 1, 500, 100));
    if (els.mailWorkerLimit) els.mailWorkerLimit.value = String(clampInt(settings.worker_limit, 1, 200, 25));
    if (els.mailQueueShare) els.mailQueueShare.value = String(clampInt(settings.queue_share_pct, 50, 95, 80));
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
      greetingCustomEl.hidden = mailGreetingValue !== "custom";
    }
    if (farewellCustomEl) {
      farewellCustomEl.value = mailFarewellCustomValue;
      farewellCustomEl.hidden = mailFarewellValue !== "custom";
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
    if (!silent && shouldShowActionError()) showToast("Błąd operacji", "error");
    console.warn("[settings] mail settings load failed", err);
    return false;
  }
}

async function saveMailSettings() {
  const delayMs = clampInt(els.mailDelayMs?.value, 0, 5000, 250);
  const batchMax = clampInt(els.mailBatchMax?.value, 1, 500, 100);
  const workerLimit = clampInt(els.mailWorkerLimit?.value, 1, 200, 25);
  const queueSharePct = clampInt(els.mailQueueShare?.value, 50, 95, 80);
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
    queue_share_pct: queueSharePct,
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
  showToast("Zapisano");
}

async function loadMailQueue({ silent = false } = {}) {
  try {
    const status = String(mailQueueStatusValue || "all");
    const limit = clampInt(els.mailQueueLimit?.value, 1, 500, 150);
    const res = await apiFetch(`${API_BASE}/mail/queue?status=${encodeURIComponent(status)}&limit=${limit}`, { method: "GET" });
    if (res.status === 401) {
      stopPolling();
      showAuth("Wymagane logowanie przez Cloudflare Access.");
      return false;
    }
    if (!res.ok) throw new Error(`queue fetch failed: ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    queueSelectionSync(rows);
    renderQueueRows(rows);
    if (els.mailQueueInfo) {
      els.mailQueueInfo.textContent = "Wiersze: {count}".replace("{count}", String(rows.length));
    }
    return true;
  } catch (err) {
    if (!silent && shouldShowActionError()) showToast("Błąd operacji", "error");
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
    const perPage = clampInt(mailLogPerPageSelect?.getValue() ?? "50", 10, 200, 50);
    mailLogsPerPage = perPage;
    const res = await apiFetch(
      `${API_BASE}/mail/logs?fn=${encodeURIComponent(fn)}&level=${encodeURIComponent(level)}&per_page=${perPage}&page=${mailLogsPage}`,
      { method: "GET" }
    );
    if (res.status === 401) {
      stopPolling();
      showAuth("Wymagane logowanie przez Cloudflare Access.");
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
      const parts = ["Wiersze: {count}".replace("{count}", String(total))];
      if (cntSent) parts.push("wysłane: {count}".replace("{count}", String(cntSent)));
      if (cntFailed) parts.push("błędy: {count}".replace("{count}", String(cntFailed)));
      if (cntSkipped) {
        const skipDetail = [
          cntSkippedFlag ? "flaga: {count}".replace("{count}", String(cntSkippedFlag)) : "",
          cntSkippedSup ? "unsub: {count}".replace("{count}", String(cntSkippedSup)) : "",
        ].filter(Boolean).join(", ");
        parts.push(`${"pominięte: {count}".replace("{count}", String(cntSkipped))} (${skipDetail})`);
      }
      els.mailLogsInfo.textContent = parts.join(" · ");
    }
    return true;
  } catch (err) {
    if (!silent && shouldShowActionError()) showToast("Błąd operacji", "error");
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

  showToast(requestedIds.length === 1 ? "Wysłanie maila uruchomione" : "Worker uruchomiony");
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

export async function openMailTab() {
  if (activeTab === "tools") closeTools();
  setActiveTab("mail");
  if (!mailSettingsLoaded) {
    await loadMailSettings({ silent: true });
  }
  await Promise.all([loadMailQueue({ silent: true }), loadMailLogs({ silent: true })]);
}

// Poczta: ustawienia, kolejka, dziennik.
export function wireMailSettingsEvents() {
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
        if (shouldShowActionError()) showToast("Błąd operacji", "error");
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
      if (shouldShowActionError()) showToast("Błąd operacji", "error");
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

  // mailLogPerPage onChange handled in initMailSelects via mailLogPerPageSelect

  els.btnMailLogsHelp?.addEventListener("click", () => {
    toggleMailLogsHelp();
  });

  els.btnMailRunWorker?.addEventListener("click", async () => {
    markUserAction();
    try {
      await runMailWorker();
    } catch(e) {
      if (shouldShowActionError()) showToast("Błąd operacji", "error");
    }
  });

  els.btnMailRetryFailed?.addEventListener("click", async () => {
    markUserAction();
    try {
      await runMailWorker({ requeueFailed: true });
    } catch(e) {
      if (shouldShowActionError()) showToast("Błąd operacji", "error");
    }
  });

  els.btnMailRetrySelected?.addEventListener("click", async () => {
    markUserAction();
    const ids = [...selectedQueueIds];
    if (!ids.length) {
      showToast("Zaznacz rekordy kolejki", "error");
      return;
    }
    try {
      await runMailWorker({ ids });
    } catch(e) {
      if (shouldShowActionError()) showToast("Błąd operacji", "error");
    }
  });
}
