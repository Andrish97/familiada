import { initI18n, t } from "../../translation/translation.js";

const ENDPOINT = "/maintenance-state.json";
const POLL_MS = 30000;

const FALLBACKS = {
  messageTitle: "TRWA PRZERWA TECHNICZNA",
  messageText:
    "System jest chwilowo niedostępny.\nZa jakiś czas wszystko wróci do normy i będzie można kontynuować pracę.",
  inactiveTitle: "Brak prac technicznych",
  inactiveText: "Aktualnie nie trwają żadne prace.",
  returnAtTitle: "TRWA PRZERWA TECHNICZNA",
  returnAtText:
    "System jest chwilowo niedostępny.\nPowrót nastąpi:",
  countdownTitle: "TRWA PRZERWA TECHNICZNA",
  countdownText:
    "System jest chwilowo niedostępny.\nPowrót nastąpi:",
  countdownDone: "Powrót już możliwy. 🎉",
};

const els = {
  title: document.getElementById("title"),
  description: document.getElementById("description"),
  countdown: document.getElementById("countdown"),
};

let countdownTimer = null;
let redirectTimer = null;

function setText(el, text) {
  if (el) el.textContent = text;
}

function tr(key, fallback) {
  const value = t(key);
  if (!value || value === key) return fallback;
  return value;
}

function scheduleRedirect() {
  if (redirectTimer) return;
  redirectTimer = setTimeout(() => {
    window.location.href = "/";
  }, 1500);
}

function redirectNow() {
  window.location.href = "/";
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const lang = (document.documentElement.lang || "").toLowerCase();
  if (lang.startsWith("en")) return formatCountdownEn(totalSeconds);
  if (lang.startsWith("uk")) return formatCountdownUk(totalSeconds);
  if (!lang.startsWith("pl")) {
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
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

function formatReturnAt(date) {
  if (!date) return "—";
  const lang = (document.documentElement.lang || "").toLowerCase();
  if (lang.startsWith("en")) return formatReturnAtEn(date);
  if (lang.startsWith("uk")) return formatReturnAtUk(date);
  if (!lang.startsWith("pl")) return formatDate(date);
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

function formatCountdownDisplay(ms) {
  return formatCountdown(ms);
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

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function updateCountdown(targetDate) {
  if (!targetDate) return false;
  const diff = targetDate.getTime() - Date.now();
  if (diff <= 0) {
    setText(els.description, tr("maintenance.countdownDone", FALLBACKS.countdownDone));
    if (els.countdown) els.countdown.hidden = true;
    scheduleRedirect();
    return false;
  }
  const formatted = formatCountdownDisplay(diff);
  if (els.countdown) {
    els.countdown.hidden = false;
    setText(els.countdown, formatted);
  }
  setText(
    els.description,
    tr("maintenance.countdownText", FALLBACKS.countdownText)
  );
  return true;
}

function startCountdown(targetDate) {
  stopCountdown();
  if (!targetDate) return;
  if (!updateCountdown(targetDate)) return;
  countdownTimer = setInterval(() => {
    if (!updateCountdown(targetDate)) {
      stopCountdown();
    }
  }, 1000);
}

function renderFallback() {
  setText(els.title, tr("maintenance.messageTitle", FALLBACKS.messageTitle));
  setText(els.description, tr("maintenance.messageText", FALLBACKS.messageText));
  if (els.countdown) els.countdown.hidden = true;
  stopCountdown();
}

function renderState(state) {
  const mode = typeof state?.mode === "string" ? state.mode : "message";
  const enabled = typeof state?.enabled === "boolean" ? state.enabled : null;
  const returnAt = parseDate(state?.returnAt);

  if (enabled === false || mode === "off") {
    redirectNow();
    return;
  }

  if (els.countdown) els.countdown.hidden = true;

  const titleText = tr("maintenance.title", FALLBACKS.messageTitle);
  if (mode === "message") {
    setText(els.title, titleText);
    setText(els.description, tr("maintenance.messageText", FALLBACKS.messageText));
    stopCountdown();
    return;
  }

  if (mode === "returnAt") {
    setText(els.title, titleText);
    setText(els.description, tr("maintenance.returnAtText", FALLBACKS.returnAtText));
    if (els.countdown) {
      els.countdown.hidden = false;
      setText(els.countdown, returnAt ? formatReturnAt(returnAt) : "—");
    }
    stopCountdown();
    return;
  }

  if (mode === "countdown") {
    setText(els.title, titleText);
    if (returnAt && returnAt.getTime() > Date.now()) {
      startCountdown(returnAt);
    } else if (returnAt) {
      setText(els.description, tr("maintenance.countdownDone", FALLBACKS.countdownDone));
      if (els.countdown) els.countdown.hidden = true;
      scheduleRedirect();
      stopCountdown();
    } else {
      setText(
        els.description,
        tr("maintenance.countdownText", FALLBACKS.countdownText).replace("{countdown}", "00:00:00")
      );
      if (els.countdown) {
        els.countdown.hidden = false;
        setText(els.countdown, "00:00:00");
      }
      stopCountdown();
    }
  }
}

async function loadState() {
  const response = await fetch(ENDPOINT, { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load maintenance state");
  const data = await response.json();
  if (!data || typeof data !== "object") throw new Error("Invalid maintenance state");
  return data;
}

async function refresh() {
  try {
    const state = await loadState();
    renderState(state);
  } catch (err) {
    renderFallback();
  }
}

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  await refresh();
  setInterval(refresh, POLL_MS);
})();
