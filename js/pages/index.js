// js/pages/index.js
import {
  getUser,
  signIn,
  signUp,
  resetPassword,
  resolveLoginToEmail,
  updateUserLanguage,
  validatePassword,
  validateUsername,
  niceAuthError,
  getPasswordRulesText
} from "../core/auth.js";

import { sb } from "../core/supabase.js";
import { cooldownEmailGet, cooldownEmailReserve } from "../core/cooldown.js";
import { initI18n, t, getUiLang, withLangParam } from "../../translation/translation.js";

const $ = (s) => document.querySelector(s);
const email = $("#email");
const pass = $("#pass");
const pass2 = $("#pass2");
const status = $("#status");
const err = $("#err");
const pwdHint = $("#pwdHint");
const btnPrimary = $("#btnPrimary");
const btnToggle = $("#btnToggle");
const btnForgot = $("#btnForgot");
const forgotCooldown = $("#forgotCooldown");
const loginCard = $("#loginCard");
const setupCard = $("#setupCard");
const usernameFirst = $("#usernameFirst");
const usernameErr = $("#usernameErr");
const btnUsernameSave = $("#btnUsernameSave");
const baseUrls = document.body?.dataset || {};
const confirmUrl = baseUrls.confirmUrl || "confirm.html";
const resetUrl = baseUrls.resetUrl || "reset.html";
const builderUrl = baseUrls.builderUrl || "builder.html";
const pollsUrl = baseUrls.pollsUrl || "polls-hub.html";
const subscriptionsUrl = baseUrls.subscriptionsUrl || "subscriptions.html";

let mode = "login"; // login | register

let isBusy = false;

const RESET_COOLDOWN_MS = 60 * 60 * 1000; // 1h
const RESET_ACTION_KEY = "auth:reset_password";
const RESET_COOLDOWN_SECONDS = 60 * 60;

let _forgotTimer = null;
let _forgotDebounce = null;

// in-memory cache (truth is in DB; we refresh on interactions)
const forgotUntilByEmail = new Map();

function getForgotUntil(email) {
  const e = String(email || "").trim().toLowerCase();
  return forgotUntilByEmail.get(e) || 0;
}

function setForgotUntil(email, untilMs) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return;
  forgotUntilByEmail.set(e, Number(untilMs) || 0);
}

async function refreshForgotUntil(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return 0;
  const map = await cooldownEmailGet(e, [RESET_ACTION_KEY]);
  const until = map.get(RESET_ACTION_KEY) || 0;
  setForgotUntil(e, until);
  return until;
}

function formatLeft(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function stopForgotTimer() {
  if (_forgotTimer) clearInterval(_forgotTimer);
  _forgotTimer = null;
}

function hideForgotCooldown() {
  stopForgotTimer();
  if (forgotCooldown) {
    forgotCooldown.hidden = true;
    forgotCooldown.textContent = "";
  }
}

function showForgotCooldownForEmail(resolvedEmail) {
  stopForgotTimer();

  const resolved = String(resolvedEmail || "").trim().toLowerCase();
  const tick = () => {
    // pokazuj tylko, gdy aktualnie w polu jest ten sam email (lub user wpisał username → wtedy i tak kliknie)
    const current = String(email?.value || "").trim().toLowerCase();
    if (current.includes("@") && current !== String(resolvedEmail).toLowerCase()) {
      hideForgotCooldown();
      btnForgot.disabled = false;
      return;
    }

    const until = getForgotUntil(resolved);
    const left = until - Date.now();

    if (left <= 0) {
      hideForgotCooldown();
      btnForgot.disabled = false;
      return;
    }

    if (forgotCooldown) {
      forgotCooldown.hidden = false;
      forgotCooldown.textContent = t("index.resetCooldown", { time: formatLeft(left) });
    }

    // blokuj resend tylko dla tego maila
    if (current.includes("@")) btnForgot.disabled = true;
  };

  tick();
  _forgotTimer = setInterval(tick, 1000);
}

function setBusy(v) {
  isBusy = v;
  if (btnPrimary) btnPrimary.disabled = v;
  if (btnToggle) btnToggle.disabled = v;
  if (btnForgot) btnForgot.disabled = v;
  if (btnUsernameSave) btnUsernameSave.disabled = v;
}

const params = new URLSearchParams(location.search);
const nextTarget = params.get("next");
const nextTask = params.get("t");
const nextSub = params.get("s");
const setup = params.get("setup");

function buildAuthRedirect(page) {
  // page: "confirm.html" | "reset.html" (może być też "/confirm.html")
  const p = String(page || "").trim();

  // Wymuś ścieżkę absolutną w obrębie tego samego origin
  const path = p.startsWith("http://") || p.startsWith("https://")
    ? new URL(p).pathname
    : (p.startsWith("/") ? p : `/${p}`);

  const url = new URL(path, location.origin);
  url.searchParams.set("lang", getUiLang());
  return url.toString();
}

function buildNextUrl() {
  const target = nextSub && !nextTask ? subscriptionsUrl : pollsUrl;
  const url = new URL(target.startsWith("/") ? target : `/${target}`, location.origin);
  if (nextTask) url.searchParams.set("t", nextTask);
  if (nextSub) url.searchParams.set("s", nextSub);
  url.searchParams.set("lang", getUiLang());
  return url.toString();
}

function setErr(m = "") { err.textContent = m; }
function setStatus(m = "") { status.textContent = m; }
function setUsernameErr(m = "") { if (usernameErr) usernameErr.textContent = m; }

function openUsernameSetup() {
  if (loginCard) loginCard.hidden = true;
  if (setupCard) setupCard.hidden = false;
  document.body.classList.add("setup-mode");
  if (usernameFirst) usernameFirst.focus();
}

function closeUsernameSetup() {
  if (loginCard) loginCard.hidden = false;
  if (setupCard) setupCard.hidden = true;
  document.body.classList.remove("setup-mode");
}

async function ensureUsernameAvailable(username, userId) {
  const { data, error } = await sb()
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .neq("id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) throw new Error(t("index.errUsernameTaken"));
}

async function saveUsername() {
  console.log("[saveUsername] START", new Date().toISOString());
  setUsernameErr("");
  try {
    const username = validateUsername(usernameFirst?.value || "");
    const { data: userData, error: userError } = await sb().auth.getUser();
    console.log("[saveUsername] userId", userData?.user?.id, "usernameInput", username);

    if (userError || !userData?.user) throw new Error(t("index.errNoSession"));

    await ensureUsernameAvailable(username, userData.user.id);

    const res = await sb()
      .from("profiles")
      .update({ username })
      .eq("id", userData.user.id)
      .select("id, username")
      .single();

    console.log("[saveUsername] DB result", res);

    if (res.error) throw res.error;

    const meta = await sb().auth.updateUser({ data: { username } });
    console.log("[saveUsername] META result", meta);

    if (meta.error) throw meta.error;

    closeUsernameSetup();
    location.href = withLangParam(builderUrl);
  } catch (e) {
    console.error("[saveUsername] FAIL", e);
    setUsernameErr(niceAuthError(e));
  }
}

function applyMode() {
  if (mode === "login") {
    pass2.style.display = "none";
    if (pwdHint) pwdHint.hidden = true;
    btnPrimary.textContent = t("index.btnLogin");
    btnToggle.textContent = t("index.btnToggleRegister");
    email.placeholder = t("index.placeholderLogin");
  } else {
    pass2.style.display = "block";
    if (pwdHint) {
      pwdHint.hidden = false;
      pwdHint.textContent = getPasswordRulesText();
    }
    btnPrimary.textContent = t("index.btnRegister");
    btnToggle.textContent = t("index.btnToggleLogin");
    email.placeholder = t("index.placeholderEmail");
  }
  setErr("");
}

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });
  const syncLanguage = () => updateUserLanguage(getUiLang());
  applyMode();
  setStatus(t("index.statusChecking"));
  
  const usernameForm = document.querySelector("#usernameForm");
  
  usernameForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isBusy) return;
    await saveUsername();
  });

  const u = await getUser();
  if (u) {
    await syncLanguage();
    if (!u.username) {
      openUsernameSetup();
    } else if (nextTarget === "polls-hub" || nextTarget === "subscriptions") {
      location.href = buildNextUrl();
    } else {
      location.href = withLangParam(builderUrl);
    }
    return;
  }
  
  setStatus(t("index.statusLoggedOut"));

  window.addEventListener("i18n:lang", syncLanguage);

  btnToggle.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    applyMode();
  });

  btnPrimary.addEventListener("click", async () => {
    if (isBusy) return;
    setBusy(true);

    setErr("");
    const loginOrEmail = email.value.trim();
    const pwd = pass.value;

    if (!loginOrEmail || !pwd) {
      setBusy(false);
      return setErr(t("index.errMissingLogin"));
    }

    try {
      if (mode === "register") {
        const mail = loginOrEmail;

        if (!mail || !mail.includes("@")) return setErr(t("index.errInvalidEmail"));

        if (pass2.value !== pwd) return setErr(t("index.errPasswordMismatch"));
        try {
          validatePassword(pwd);
        } catch (e) {
          return setErr(niceAuthError(e));
        }

        setStatus(t("index.statusRegistering"));
        const redirectTo = buildAuthRedirect(confirmUrl);
        await signUp(mail, pwd, redirectTo, null, getUiLang());
        setStatus(t("index.statusCheckEmail"));
      } else {
        setStatus(t("index.statusLoggingIn"));
        await signIn(loginOrEmail, pwd); // <-- może być username
        const authed = await getUser();
        await syncLanguage();
        if (!authed?.username) {
          openUsernameSetup();
        } else if (nextTarget === "polls-hub" || nextTarget === "subscriptions") {
          location.href = buildNextUrl();
        } else {
          location.href = withLangParam(builderUrl);
        }
      }
    } catch (e) {
      console.error(e);
      setStatus(t("index.statusError"));
      setErr(niceAuthError(e));
    } finally {
      setBusy(false);
    }
  });

  btnForgot.addEventListener("click", async () => {
    if (isBusy) return;
    setBusy(true);
    setErr("");
  
    const loginOrEmail = email.value.trim();
    if (!loginOrEmail) {
      setBusy(false);
      return setErr(t("index.errResetMissingLogin"));
    }
  
    try {
      // 1) resolve (email lub username -> email)
      const resolved = await resolveLoginToEmail(loginOrEmail);
      if (!resolved) throw new Error(t("index.errResetMissingLogin"));
      // 2) cooldown check (per email, cross-device)
      await refreshForgotUntil(resolved);
      const until = getForgotUntil(resolved);
      const left = until - Date.now();
      if (left > 0) {
        setStatus(t("index.statusResetSent"));
        setErr(t("index.errResetCooldown", { time: formatLeft(left) }));
        showForgotCooldownForEmail(resolved);
        return;
      }
      // 3) reserve cooldown (cross-device) + send
      const reserve = await cooldownEmailReserve(resolved, RESET_ACTION_KEY, RESET_COOLDOWN_SECONDS);
      if (reserve.nextAllowedAtMs) setForgotUntil(resolved, reserve.nextAllowedAtMs);

      if (!reserve.ok) {
        const left2 = getForgotUntil(resolved) - Date.now();
        setStatus(t("index.statusResetSent"));
        setErr(t("index.errResetCooldown", { time: formatLeft(left2) }));
        showForgotCooldownForEmail(resolved);
        return;
      }

      setStatus(t("index.statusResetSending"));
      const redirectTo = buildAuthRedirect(resetUrl);

      const usedEmail = await resetPassword(loginOrEmail, redirectTo, getUiLang(), resolved);

      if (reserve.nextAllowedAtMs) setForgotUntil(usedEmail, reserve.nextAllowedAtMs);

      setStatus(t("index.statusResetSent"));
      hideForgotCooldown();
      showForgotCooldownForEmail(usedEmail);
} catch (e) {
      console.error(e);
      setStatus(t("index.statusError"));
      setErr(niceAuthError(e));
    } finally {
      setBusy(false);
    }
  });

  btnForgot.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    btnForgot.click();
  });

  email.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    pass.focus();
  });

  email.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
  
    if (document.activeElement === email && e.shiftKey === false) {
      e.preventDefault();
      if (mode === "login") {
        pass.focus();
      }
    }
  });

  email?.addEventListener("input", () => {
    const v = String(email.value || "").trim().toLowerCase();
    if (!v.includes("@")) {
      hideForgotCooldown();
      btnForgot.disabled = false;
      return;
    }

    if (_forgotDebounce) clearTimeout(_forgotDebounce);
    _forgotDebounce = setTimeout(async () => {
      try {
        await refreshForgotUntil(v);
        const until = getForgotUntil(v);
        if (until > Date.now()) {
          showForgotCooldownForEmail(v);
        } else {
          hideForgotCooldown();
          btnForgot.disabled = false;
        }
      } catch {
        // If RPC is unavailable, fallback to hiding the countdown (do not block UI).
        hideForgotCooldown();
        btnForgot.disabled = false;
      }
    }, 400);
  });
  
  pass.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
  
    if (mode === "register") {
      pass2.focus();
    } else {
      btnPrimary.click(); // 🔴 jedyne miejsce wywołania
    }
  });
  
  pass2.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    btnPrimary.click(); // 🔴 jedyne miejsce wywołania
  });

});
