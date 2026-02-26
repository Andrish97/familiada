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
  const h = document.getElementById("dtHour");
  const m = document.getElementById("dtMinute");
  if (h) h.value = String(current.getHours()).padStart(2, "0");
  if (m) m.value = String(current.getMinutes()).padStart(2, "0");
  renderCalendar();
  modal.hidden = false;
}

function closePicker() {
  const modal = document.getElementById("dtModal");
  if (modal) modal.hidden = true;
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
  const labels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
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

function updateCountdownDisplay() {
  if (!els.countdownNow) return;
  if (currentMode !== "countdown") {
    setText(els.countdownNow, "—");
    return;
  }
  const endDate = getFieldValue("endAt");
  if (!endDate) {
    setText(els.countdownNow, "—");
    return;
  }
  const diff = endDate.getTime() - Date.now();
  setText(els.countdownNow, formatCountdown(diff));
}

function startCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdownDisplay, 1000);
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
  let ok = true;
  if (currentMode === "returnAt") {
    ok = isValidFuture("returnAt");
  }
  if (currentMode === "countdown") {
    ok = isValidFuture("endAt");
  }
  if (currentMode === "message") ok = true;
  if (warn) {
    warn.hidden = ok || currentMode === "message";
  }
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
    });
  });

  document.querySelectorAll(".dt-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-dt-open");
      if (target) openPicker(target);
    });
  });

  document.getElementById("dtCancel")?.addEventListener("click", closePicker);
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
    const h = document.getElementById("dtHour");
    const m = document.getElementById("dtMinute");
    const hh = Number(h?.value ?? 0);
    const mm = Number(m?.value ?? 0);
    const date = new Date(pickerState.year, pickerState.month - 1, pickerState.day, hh, mm, 0, 0);
    if (activePicker) {
      setFieldValue(activePicker, date);
      formDirty = true;
      updateValidation();
      updateCountdownDisplay();
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
  guardDesktopOnly({ maxWidth: 980 });
  syncTopbarHeight();
  window.addEventListener("resize", syncTopbarHeight);
  window.addEventListener("i18n:lang", syncTopbarHeight);
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
