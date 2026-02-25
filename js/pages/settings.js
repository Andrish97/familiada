/*
Settings panel (admin)
- API endpoints:
  GET  /maintenance-state.json  -> public state
  GET  /_admin_api/state         -> admin state
  POST /_admin_api/state         -> { enabled:boolean, mode:string, returnAt:string|null }
  POST /_admin_api/off           -> shortcut to disable maintenance
  GET  /_admin_api/me            -> 200 if Access or cookie auth, else 401
  POST /_admin_api/login         -> { password }
- Cloudflare Access: create a Self-hosted app for settings.familiada.online and
  require a single allowed email. Access adds CF-Access-Jwt-Assertion header.
*/

import { initI18n, t } from "../../translation/translation.js";
import { confirmModal } from "../core/modal.js";

const API_BASE = "/_admin_api";
const PUBLIC_STATE = "/maintenance-state.json";

const els = {
  authScreen: document.getElementById("authScreen"),
  panelScreen: document.getElementById("panelScreen"),
  panelActions: document.getElementById("panelActions"),
  authStatus: document.getElementById("authStatus"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  loginError: document.getElementById("loginError"),
  loginHint: document.getElementById("loginHint"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnSave: document.getElementById("btnSave"),
  btnLogout: document.getElementById("btnLogout"),
  enabledToggle: document.getElementById("enabledToggle"),
  modeSelect: document.getElementById("modeSelect"),
  returnAtInput: document.getElementById("returnAtInput"),
  btnClearReturnAt: document.getElementById("btnClearReturnAt"),
  returnAtWarn: document.getElementById("returnAtWarn"),
  btnQuickOff: document.getElementById("btnQuickOff"),
  btnQuickMessage: document.getElementById("btnQuickMessage"),
  btnQuickReturnAt: document.getElementById("btnQuickReturnAt"),
  btnQuickCountdown: document.getElementById("btnQuickCountdown"),
  btnBypassOn: document.getElementById("btnBypassOn"),
  btnBypassOff: document.getElementById("btnBypassOff"),
  bypassHint: document.getElementById("bypassHint"),
  previewTitle: document.getElementById("previewTitle"),
  previewText: document.getElementById("previewText"),
  toast: document.getElementById("toast"),
};

let currentState = null;
let toastTimer = null;

function setText(el, value) {
  if (el) el.textContent = value;
}

function showAuth(statusKey) {
  els.authScreen.hidden = false;
  els.panelScreen.hidden = true;
  els.panelActions.hidden = true;
  document.body.classList.add("settings-locked");
  document.body.classList.add("no-footer-line");
  moveLangSwitcher(true);
  setText(els.authStatus, t(statusKey));
}

function showPanel() {
  els.authScreen.hidden = true;
  els.panelScreen.hidden = false;
  els.panelActions.hidden = false;
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

function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function applyStateToForm(state) {
  els.enabledToggle.checked = Boolean(state.enabled);
  els.modeSelect.value = state.mode || "off";
  els.returnAtInput.value = toDatetimeLocal(state.returnAt);

  updatePreview();
}

function buildStateFromForm() {
  const enabled = Boolean(els.enabledToggle.checked);
  const mode = els.modeSelect.value;
  const returnAt = fromDatetimeLocal(els.returnAtInput.value);
  return { enabled, mode, returnAt };
}

function updateWarn() {
  const mode = els.modeSelect.value;
  const needsReturnAt = mode === "returnAt" || mode === "countdown";
  const hasReturnAt = Boolean(els.returnAtInput.value);
  els.returnAtWarn.hidden = !(needsReturnAt && !hasReturnAt);
}

function updatePreview() {
  const state = buildStateFromForm();
  let title = "";
  let text = "";

  if (!state.enabled || state.mode === "off") {
    title = t("maintenance.inactiveTitle");
    text = t("maintenance.inactiveText");
  } else if (state.mode === "message") {
    title = t("maintenance.messageTitle");
    text = t("maintenance.messageText");
  } else if (state.mode === "returnAt") {
    const d = state.returnAt ? new Date(state.returnAt) : null;
    const time = d && !Number.isNaN(d.getTime()) ? formatDate(d) : "—";
    title = t("maintenance.returnAtTitle");
    text = t("maintenance.returnAtText").replace("{time}", time);
  } else if (state.mode === "countdown") {
    title = t("maintenance.countdownTitle");
    if (state.returnAt) {
      const d = new Date(state.returnAt);
      if (d.getTime() > Date.now()) {
        text = t("maintenance.countdownText").replace("{countdown}", "00:00:00");
      } else {
        text = t("maintenance.countdownDone");
      }
    } else {
      text = t("maintenance.countdownText").replace("{countdown}", "00:00:00");
    }
  }

  setText(els.previewTitle, title || "—");
  setText(els.previewText, text || "—");
  updateWarn();
}

async function loadState() {
  try {
    const res = await apiFetch(PUBLIC_STATE, { method: "GET" });
    if (!res.ok) throw new Error("state fetch failed");
    const data = await res.json();
    currentState = data;
    applyStateToForm(data);
  } catch (err) {
    showToast(t("settings.toast.error"), "error");
  }
}

async function saveState() {
  const payload = buildStateFromForm();
  try {
    els.btnSave.disabled = true;
    const res = await apiFetch(`${API_BASE}/state`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("save failed");
    const data = await res.json();
    currentState = data;
    applyStateToForm(data);
    showToast(t("settings.toast.saved"));
  } catch {
    setText(els.rawState, t("settings.debug.saveError"));
    showToast(t("settings.toast.error"), "error");
  } finally {
    els.btnSave.disabled = false;
  }
}

async function quickSet(mode) {
  try {
    if (mode === "off") {
      await apiFetch(`${API_BASE}/off`, { method: "POST" });
      await loadState();
      showToast(t("settings.toast.saved"));
      return;
    }

    const payload = buildStateFromForm();
    payload.enabled = true;
    payload.mode = mode;
    const res = await apiFetch(`${API_BASE}/state`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      currentState = data;
      applyStateToForm(data);
      showToast(t("settings.toast.saved"));
      return;
    }
    throw new Error("quick set failed");
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

function wireEvents() {
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

  els.btnRefresh.addEventListener("click", async () => {
    await loadState();
  });

  els.btnSave.addEventListener("click", async () => {
    await saveState();
  });

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
      showLogin();
      showToast(t("settings.toast.logout"));
    });
  }

  els.btnClearReturnAt.addEventListener("click", () => {
    els.returnAtInput.value = "";
    updatePreview();
  });

  if (els.btnQuickOff) {
    els.btnQuickOff.addEventListener("click", async () => quickSet("off"));
  }
  if (els.btnQuickMessage) {
    els.btnQuickMessage.addEventListener("click", async () => quickSet("message"));
  }
  if (els.btnQuickReturnAt) {
    els.btnQuickReturnAt.addEventListener("click", async () => quickSet("returnAt"));
  }
  if (els.btnQuickCountdown) {
    els.btnQuickCountdown.addEventListener("click", async () => quickSet("countdown"));
  }

  if (els.btnBypassOn) {
    els.btnBypassOn.addEventListener("click", async () => setBypass("on"));
  }
  if (els.btnBypassOff) {
    els.btnBypassOff.addEventListener("click", async () => setBypass("off"));
  }

  [
    els.enabledToggle,
    els.modeSelect,
    els.returnAtInput,
  ].forEach((el) => {
    el.addEventListener("change", updatePreview);
    el.addEventListener("input", updatePreview);
  });
}

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  wireEvents();
  showAuth("settings.login.checking");

  const ok = await checkMe();
  if (ok) {
    showPanel();
    await loadState();
  } else {
    showAuth("settings.login.passwordTitle");
  }
})();
