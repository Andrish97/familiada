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
import { confirmModal, alertModal } from "../core/modal.js";
import { initUiSelect } from "../core/ui-select.js";

const API_BASE = "/_admin_api";
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
  btnBypassOn: document.getElementById("btnBypassOn"),
  btnBypassOff: document.getElementById("btnBypassOff"),
  statusValue: document.getElementById("statusValue"),
  modeSwitch: document.getElementById("modeSwitch"),
  modeMessage: document.getElementById("modeMessage"),
  modeReturnAt: document.getElementById("modeReturnAt"),
  modeCountdown: document.getElementById("modeCountdown"),
  returnAtInput: document.getElementById("returnAtInput"),
  endAtInput: document.getElementById("endAtInput"),
  countdownNow: document.getElementById("countdownNow"),
  toolsShell: document.getElementById("toolsShell"),
  toolsFrame: document.getElementById("toolsFrame"),
  toolsSelect: document.getElementById("toolsSelect"),
  btnTabMaintenance: document.getElementById("btnTabMaintenance"),
  toast: document.getElementById("toast"),
};

let currentState = null;
let currentMode = "message";
let toastTimer = null;
let uiSelect = null;
let pollTimer = null;
let countdownTimer = null;

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
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function minAllowedDate() {
  return new Date(Date.now() + MINUTES_MIN * 60 * 1000);
}

async function ensureMinDate(input) {
  if (!input || !input.value) return true;
  const val = new Date(input.value);
  if (Number.isNaN(val.getTime())) return false;
  if (val.getTime() < minAllowedDate().getTime()) {
    await alertModal({
      title: t("settings.validation.tooSoonTitle"),
      text: t("settings.validation.tooSoonText"),
      okText: t("settings.validation.ok"),
    });
    input.value = "";
    return false;
  }
  return true;
}

function setMode(mode) {
  currentMode = mode;
  for (const btn of els.modeSwitch.querySelectorAll(".mode-btn")) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }
  if (els.modeMessage) els.modeMessage.hidden = mode !== "message";
  if (els.modeReturnAt) els.modeReturnAt.hidden = mode !== "returnAt";
  if (els.modeCountdown) els.modeCountdown.hidden = mode !== "countdown";
}

function setLocked(locked) {
  els.modeSwitch.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.disabled = locked;
  });
  if (els.returnAtInput) els.returnAtInput.disabled = locked;
  if (els.endAtInput) els.endAtInput.disabled = locked;
  if (els.btnRefresh) els.btnRefresh.disabled = false;
}

function updateStatus(state) {
  if (!state) {
    setText(els.statusValue, "—");
    return;
  }
  if (!state.enabled || state.mode === "off") {
    setText(els.statusValue, t("settings.status.off"));
    return;
  }
  const modeLabel = t(`settings.status.mode_${state.mode}`);
  setText(els.statusValue, `${t("settings.status.on")} • ${modeLabel}`);
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
  currentState = state;
  const mode = state?.mode || "message";
  setMode(mode === "off" ? "message" : mode);
  if (els.returnAtInput) {
    els.returnAtInput.value = toDatetimeLocal(state?.returnAt);
  }
  if (els.endAtInput) {
    els.endAtInput.value = toDatetimeLocal(state?.returnAt);
  }
  updateStatus(state);
  updateStartStop(state);
  updateCountdownDisplay();
}

function buildPayload() {
  if (currentMode === "message") {
    return { enabled: true, mode: "message", returnAt: null };
  }
  if (currentMode === "returnAt") {
    return { enabled: true, mode: "returnAt", returnAt: fromDatetimeLocal(els.returnAtInput.value) };
  }
  if (currentMode === "countdown") {
    return { enabled: true, mode: "countdown", returnAt: fromDatetimeLocal(els.endAtInput.value) };
  }
  return { enabled: true, mode: "message", returnAt: null };
}

function updateCountdownDisplay() {
  if (!els.countdownNow) return;
  if (currentMode !== "countdown") {
    setText(els.countdownNow, "—");
    return;
  }
  const end = fromDatetimeLocal(els.endAtInput.value);
  if (!end) {
    setText(els.countdownNow, "—");
    return;
  }
  const diff = new Date(end).getTime() - Date.now();
  setText(els.countdownNow, formatCountdown(diff));
}

function startCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdownDisplay, 1000);
}

async function loadState() {
  try {
    const res = await apiFetch(`${API_BASE}/state`, { method: "GET" });
    if (!res.ok) throw new Error("state fetch failed");
    const data = await res.json();
    applyState(data);
  } catch {
    showToast(t("settings.toast.error"), "error");
  }
}

async function startMaintenance() {
  if (currentMode === "returnAt") {
    const ok = await ensureMinDate(els.returnAtInput);
    if (!ok) return;
  }
  if (currentMode === "countdown") {
    const ok = await ensureMinDate(els.endAtInput);
    if (!ok) return;
  }

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

async function stopMaintenance() {
  try {
    const res = await apiFetch(`${API_BASE}/off`, { method: "POST" });
    if (!res.ok) throw new Error("off failed");
    const data = await res.json();
    applyState(data);
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

function initToolsSelect() {
  const options = [
    { value: "", label: t("settings.tools.placeholder") },
    { value: "/settings-tools/editor_5x7.html", label: t("settings.tools.editor5x7") },
    { value: "/settings-tools/exporterandeditor.html", label: t("settings.tools.exporterEditor") },
    { value: "/settings-tools/kora-builder.html", label: t("settings.tools.koraBuilder") },
  ];

  uiSelect = initUiSelect(els.toolsSelect, {
    options,
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
  els.panelScreen.hidden = true;
}

function closeTools() {
  if (!els.toolsShell || !els.toolsFrame) return;
  els.toolsFrame.src = "about:blank";
  els.toolsShell.hidden = true;
  els.panelScreen.hidden = false;
  if (uiSelect) uiSelect.setValue("", { silent: true });
}

function wireEvents() {
  els.modeSwitch.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  if (els.btnStartStop) {
    els.btnStartStop.addEventListener("click", async () => {
      if (currentState?.enabled) {
        await stopMaintenance();
      } else {
        await startMaintenance();
      }
    });
  }

  if (els.btnRefresh) {
    els.btnRefresh.addEventListener("click", loadState);
  }

  if (els.btnBypassOn) {
    els.btnBypassOn.addEventListener("click", () => setBypass("on"));
  }
  if (els.btnBypassOff) {
    els.btnBypassOff.addEventListener("click", () => setBypass("off"));
  }

  if (els.returnAtInput) {
    els.returnAtInput.addEventListener("change", () => ensureMinDate(els.returnAtInput));
  }
  if (els.endAtInput) {
    els.endAtInput.addEventListener("change", () => ensureMinDate(els.endAtInput));
  }

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
      await loadState();
    } catch {
      setText(els.loginError, t("settings.login.loginInvalid"));
    }
  });
}

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  startCountdownTimer();
  initToolsSelect();
  wireEvents();
  showAuth("settings.login.checking");

  const ok = await checkMe();
  if (ok) {
    showPanel();
    await loadState();
  } else {
    showAuth("settings.login.passwordTitle");
  }

  pollTimer = setInterval(loadState, POLL_MS);
})();
