import { initI18n, t } from "../../translation/translation.js";

const ENDPOINT = "/maintenance-state.json";
const POLL_MS = 30000;

const FALLBACKS = {
  messageTitle: "Krótka przerwa w studiu 🎙️",
  messageText:
    "System jest chwilowo niedostępny.\nZa jakiś czas wszystko wróci do normy i będzie można kontynuować pracę.",
  inactiveTitle: "Brak prac technicznych",
  inactiveText: "Aktualnie nie trwają żadne prace.",
  returnAtTitle: "Przerwa techniczna",
  returnAtText:
    "System jest tymczasowo niedostępny.\nWrócimy o {time} — wtedy znów będzie można swobodnie tworzyć i edytować gry.",
  countdownTitle: "Trwa przerwa techniczna ⏳",
  countdownText:
    "System jest chwilowo niedostępny.\nDo ponownego uruchomienia pozostało {countdown}.",
  countdownDone: "Za chwilę wszystko będzie gotowe. 🎉",
};

const els = {
  title: document.getElementById("title"),
  description: document.getElementById("description"),
  returnAt: document.getElementById("returnAt"),
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
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
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
  const formatted = formatCountdown(diff);
  if (els.countdown) {
    els.countdown.hidden = false;
    setText(els.countdown, formatted);
  }
  setText(
    els.description,
    tr("maintenance.countdownText", FALLBACKS.countdownText).replace("{countdown}", formatted)
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
  if (els.returnAt) els.returnAt.hidden = true;
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

  if (els.returnAt) els.returnAt.hidden = true;
  if (els.countdown) els.countdown.hidden = true;

  if (mode === "message") {
    setText(els.title, tr("maintenance.messageTitle", FALLBACKS.messageTitle));
    setText(els.description, tr("maintenance.messageText", FALLBACKS.messageText));
    stopCountdown();
    return;
  }

  if (mode === "returnAt") {
    setText(els.title, tr("maintenance.returnAtTitle", FALLBACKS.returnAtTitle));
    setText(
      els.description,
      tr("maintenance.returnAtText", FALLBACKS.returnAtText).replace(
        "{time}",
        returnAt ? formatDate(returnAt) : "—"
      )
    );
    if (returnAt && els.returnAt) {
      els.returnAt.hidden = false;
      setText(els.returnAt, formatDate(returnAt));
    }
    if (els.countdown) els.countdown.hidden = true;
    stopCountdown();
    return;
  }

  if (mode === "countdown") {
    setText(els.title, tr("maintenance.countdownTitle", FALLBACKS.countdownTitle));
    if (returnAt && returnAt.getTime() > Date.now()) {
      if (els.returnAt) els.returnAt.hidden = true;
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
