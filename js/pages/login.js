// js/pages/login.js
import {
  getUser,
  signIn,
  signInGuest,
  getEmailStatus,
  sendSignupConfirmation,
  convertGuestToRegistered,
  discardCurrentGuestAccount,
  resetPassword,
  resolveLoginToEmail,
  updateUserLanguage,
  validatePassword,
  validateUsername,
  niceAuthError,
  getPasswordRulesText,
  hasGuestLocalMarker,
  clearGuestLocalMarker,
} from "../core/auth.js";
import { isGuestUser } from "../core/guest-mode.js";
import { alertModal, confirmModal } from "../core/modal.js";

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
const btnGuest = $("#btnGuest");
const forgotCooldown = $("#forgotCooldown");
const loginCard = $("#loginCard");
const setupCard = $("#setupCard");
const usernameFirst = $("#usernameFirst");
const usernameErr = $("#usernameErr");
const btnUsernameSave = $("#btnUsernameSave");
const setupTitleEl = setupCard?.querySelector(".setup-title");
const setupSubEl = setupCard?.querySelector(".setup-sub");
const baseUrls = document.body?.dataset || {};
const confirmUrl = baseUrls.confirmUrl || "confirm.html";
const resetUrl = baseUrls.resetUrl || "reset.html";
const builderUrl = baseUrls.builderUrl || "builder.html";
const pollsUrl = baseUrls.pollsUrl;
const subscriptionsUrl = baseUrls.subscriptionsUrl;
const captchaProvider = String(baseUrls.captchaProvider || "hcaptcha").trim().toLowerCase();
const captchaSiteKey = String(baseUrls.captchaSiteKey || "").trim();
let captchaLoadPromise = null;

const LOGIN_CAPTCHA_FAIL_THRESHOLD = 3;
const loginFailuresByIdentity = new Map();

// Prewarm silent captcha so login doesn't block on first click.
if (captchaSiteKey) {
  setTimeout(() => {
    getSilentCaptchaToken().catch(() => {});
  }, 0);
}


function isSecurityRelevantLoginError(e) {
  const code = String(e?.errorCode || "").trim().toLowerCase();
  if (code === "invalid_login_credentials") return true;
  if (code === "unknown_email" || code === "unknown_username") return true;

  // Some providers return "captcha_required" or similar when abuse is detected.
  if (code === "captcha_required") return true;

  // As a fallback, treat explicit 400/401 invalid-credential responses as security-related.
  const status = Number(e?.status || 0) || 0;
  if ((status === 400 || status === 401) && /invalid|credential|password|email/i.test(String(e?.rawMessage || e?.message || ""))) {
    return true;
  }
  return false;
}

function isCaptchaError(e) {
  const code = String(e?.errorCode || "").trim().toLowerCase();
  if (code === "captcha_required") return true;
  if (String(e?.errorKind || "").toLowerCase() === "security") return true;
  const msg = String(e?.rawMessage || e?.message || "").toLowerCase();
  if (msg.includes("captcha")) return true;
  return false;
}


function getLoginFailureKey(loginOrEmail) {
  return String(loginOrEmail || "").trim().toLowerCase();
}

function getLoginFailureCount(loginOrEmail) {
  return loginFailuresByIdentity.get(getLoginFailureKey(loginOrEmail)) || 0;
}

function bumpLoginFailureCount(loginOrEmail) {
  const key = getLoginFailureKey(loginOrEmail);
  if (!key) return 0;
  const next = getLoginFailureCount(key) + 1;
  loginFailuresByIdentity.set(key, next);
  return next;
}

function resetLoginFailureCount(loginOrEmail) {
  const key = getLoginFailureKey(loginOrEmail);
  if (!key) return;
  loginFailuresByIdentity.delete(key);
}

function getLoginCaptchaPolicy(loginOrEmail) {
  const failures = getLoginFailureCount(loginOrEmail);
  return {
    failures,
    requireCaptcha: failures >= LOGIN_CAPTCHA_FAIL_THRESHOLD,
  };
}

async function getCaptchaPromptForLogin(loginOrEmail) {
  if (!captchaSiteKey) return null;
  const policy = getLoginCaptchaPolicy(loginOrEmail);
  if (policy.requireCaptcha) return await askCaptchaToken();
  return await getSilentCaptchaToken();
}

function getCaptchaLang() {
  const fromPage = document.documentElement?.lang;
  if (fromPage) return String(fromPage).trim().toLowerCase();
  return getUiLang() || "pl";
}

function loadCaptchaApi() {
  if (!captchaSiteKey) return Promise.resolve(null);

  if (captchaProvider === "hcaptcha") {
    const captchaLang = getCaptchaLang();
    const existing = document.querySelector('script[data-captcha="hcaptcha"]');
    const existingLang = existing?.dataset?.captchaLang || "";

    if (window.hcaptcha && existing && existingLang === captchaLang) return Promise.resolve(window.hcaptcha);
    if (existing && existingLang && existingLang !== captchaLang) {
      try { existing.remove(); } catch {}
      try { delete window.hcaptcha; } catch {}
      captchaLoadPromise = null;
    }

    if (captchaLoadPromise) return captchaLoadPromise;
    captchaLoadPromise = new Promise((resolve, reject) => {
      const onloadCallback = "__familiadaHcaptchaOnLoad";
      const cleanup = () => { try { delete window[onloadCallback]; } catch {} };
      window[onloadCallback] = () => {
        cleanup();
        resolve(window.hcaptcha || null);
      };
      const reuse = document.querySelector('script[data-captcha="hcaptcha"]');
      if (reuse) {
        if (window.hcaptcha && reuse.dataset.captchaLang === captchaLang) {
          cleanup();
          resolve(window.hcaptcha);
          return;
        }
        reuse.addEventListener("load", () => resolve(window.hcaptcha || null), { once: true });
        reuse.addEventListener("error", () => reject(new Error("hCaptcha failed to load")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = `https://js.hcaptcha.com/1/api.js?render=explicit&onload=${encodeURIComponent(onloadCallback)}&hl=${encodeURIComponent(captchaLang)}`;
      script.async = true;
      script.defer = true;
      script.dataset.captcha = "hcaptcha";
      script.dataset.captchaLang = captchaLang;
      script.onload = () => {
        if (window.hcaptcha) {
          cleanup();
          resolve(window.hcaptcha);
        }
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("hCaptcha failed to load"));
      };
      document.head.appendChild(script);
    });
    return captchaLoadPromise;
  }

  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (captchaLoadPromise) return captchaLoadPromise;
  captchaLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-captcha="turnstile"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile || null), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.captcha = "turnstile";
    script.onload = () => resolve(window.turnstile || null);
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });
  return captchaLoadPromise;
}

// -------------------------
// Silent captcha token (Variant B)
// -------------------------

let _silentCaptchaCache = { token: "", expMs: 0 };
let _silentCaptchaInFlight = null;
let _visibleCaptchaInFlight = null;

function getCachedSilentCaptchaToken() {
  const now = Date.now();
  if (_silentCaptchaCache.token && now < (_silentCaptchaCache.expMs || 0)) return _silentCaptchaCache.token;
  return "";
}

function setCachedSilentCaptchaToken(token) {
  const tkn = String(token || "").trim();
  if (!tkn) {
    _silentCaptchaCache = { token: "", expMs: 0 };
    return;
  }
  // Tokens are short-lived; cache briefly to avoid re-render on rapid clicks.
  _silentCaptchaCache = { token: tkn, expMs: Date.now() + 90_000 };
}

async function getSilentCaptchaToken() {
  if (!captchaSiteKey) return null;

  const cached = getCachedSilentCaptchaToken();
  if (cached) return cached;
  if (_silentCaptchaInFlight) return _silentCaptchaInFlight;

  _silentCaptchaInFlight = (async () => {
    const captcha = await loadCaptchaApi();
    if (!captcha?.render) return null;

    const mount = document.createElement("div");
    // Must be in DOM for both providers, but fully offscreen.
    mount.style.position = "fixed";
    mount.style.left = "-9999px";
    mount.style.top = "0";
    mount.style.width = "1px";
    mount.style.height = "1px";
    mount.style.opacity = "0";
    mount.style.pointerEvents = "none";
    mount.dataset.theme = "dark";
    document.body.appendChild(mount);

    let token = "";
    let widgetId = null;

    const tokenPromise = new Promise((resolve) => {
      const done = () => resolve(String(token || "").trim());
    const timer = setTimeout(done, 4000);

      const setToken = (value) => {
        token = String(value || "");
        clearTimeout(timer);
        done();
      };

      try {
        if (captchaProvider === "hcaptcha") {
          widgetId = captcha.render(mount, {
            sitekey: captchaSiteKey,
            theme: "dark",
            size: "invisible",
            callback: setToken,
            "expired-callback": () => { token = ""; },
            "error-callback": () => { token = ""; },
          });
          try { captcha.execute(widgetId); } catch {}
        } else {
        widgetId = captcha.render(mount, {
          sitekey: captchaSiteKey,
          theme: "auto",
          size: "normal",
          appearance: "interaction-only",
          execution: "execute",
          callback: setToken,
          "expired-callback": () => { token = ""; },
          "error-callback": () => { token = ""; },
        });
        try { captcha.reset(widgetId); } catch {}
        try { captcha.execute(widgetId); } catch {}
        }
      } catch {
        clearTimeout(timer);
        resolve("");
      }
    });

    try {
      const tkn = await tokenPromise;
      if (tkn) setCachedSilentCaptchaToken(tkn);
      return tkn || null;
    } finally {
      try {
        if (widgetId !== null && widgetId !== undefined) {
          if (captchaProvider === "hcaptcha") captcha.reset(widgetId);
          else captcha.remove(widgetId);
        }
      } catch {}
      try { mount.remove(); } catch {}
    }
  })();

  try {
    return await _silentCaptchaInFlight;
  } finally {
    _silentCaptchaInFlight = null;
  }
}


async function askCaptchaToken() {
  if (!captchaSiteKey) return null;
  if (_visibleCaptchaInFlight) return _visibleCaptchaInFlight;

  _visibleCaptchaInFlight = (async () => {
  const captcha = await loadCaptchaApi();
  if (!captcha?.render) throw new Error(t("index.captchaRequired"));

  const status = document.createElement("div");
  status.style.marginTop = "8px";
  status.style.opacity = "0.85";
  status.style.fontSize = "12px";
  status.textContent = t("index.captchaStatusPending");

  const mount = document.createElement("div");
  mount.dataset.theme = "dark";
  mount.style.minHeight = "84px";
  mount.style.display = "grid";
  mount.style.placeItems = "center";
  mount.appendChild(status);

  let token = "";
  const widgetId = captchaProvider === "hcaptcha"
    ? captcha.render(mount, {
      sitekey: captchaSiteKey,
      theme: "dark",
      size: "normal",
      callback: (value) => {
        token = String(value || "");
        if (token) status.textContent = t("index.captchaStatusOk");
      },
      "expired-callback": () => { token = ""; },
      "error-callback": () => { token = ""; },
    })
    : captcha.render(mount, {
      sitekey: captchaSiteKey,
      theme: "auto",
      size: "normal",
      callback: (value) => {
        token = String(value || "");
        if (token) status.textContent = t("index.captchaStatusOk");
      },
      "expired-callback": () => { token = ""; },
      "error-callback": () => { token = ""; },
    });

    try {
      const ok = await confirmModal({
        title: t("index.captchaTitle"),
        text: t("index.captchaText"),
        okText: t("index.captchaOk"),
        cancelText: t("index.captchaCancel"),
        body: mount,
        initialFocus: mount,
      });

      if (!ok) throw new Error(t("index.captchaRequired"));
      if (!token) throw new Error(t("index.captchaRequired"));
      return token;
    } finally {
      try {
        if (captchaProvider === "hcaptcha") captcha.reset(widgetId);
        else captcha.remove(widgetId);
      } catch {}
    }
  })();

  try {
    return await _visibleCaptchaInFlight;
  } finally {
    _visibleCaptchaInFlight = null;
  }
}


let mode = "login"; // login | register

let isBusy = false;

const RESET_COOLDOWN_MS = 60 * 60 * 1000; // 1h
const RESET_ACTION_KEY = "auth:reset_password";
const RESET_COOLDOWN_SECONDS = 60 * 60;

const GUEST_UPGRADE_ACTION_KEY = "auth:guest_upgrade_email";
const GUEST_UPGRADE_COOLDOWN_SECONDS = 60 * 60;
const SIGNUP_RESEND_ACTION_KEY = "auth:signup_confirm";
const RESEND_COOLDOWN_SECONDS = 60 * 60;

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
  if (btnGuest) btnGuest.disabled = v;
  if (btnUsernameSave) btnUsernameSave.disabled = v;
}

const params = new URLSearchParams(location.search);
const nextTarget = params.get("next");
const nextTask = params.get("t");
const nextSub = params.get("s");
const guestUsername = params.get("guest_username") === "1";
const guestExpired = params.get("guest_expired") === "1";
const forceAuth = params.get("force_auth") === "1";

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
  const target = nextTarget === "subscriptions" ? subscriptionsUrl : pollsUrl;
  if (!target) throw new Error(t("index.statusError"));
  const url = new URL(target.startsWith("/") ? target : `/${target}`, location.origin);

  if (nextTarget === "subscriptions" && nextSub) url.searchParams.set("s", nextSub);
  if (nextTarget === "polls-hub" && nextTask) url.searchParams.set("t", nextTask);

  url.searchParams.set("lang", getUiLang());
  return url.toString();
}

function setErr(m = "") { err.textContent = m; }
function setStatus(m = "") { status.textContent = m; }
function setUsernameErr(m = "") { if (usernameErr) usernameErr.textContent = m; }

async function waitForUserSession({ maxMs = 2500, stepMs = 150 } = {}) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const user = await getUser();
    if (user) return user;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return null;
}


async function confirmDiscardGuestIfActive() {
  try {
    const current = await getUser();
    if (!current || !isGuestUser(current)) return true;

    const who =
      current.username ||
      current.user_metadata?.username ||
      current.email ||
      current.id;

    const ok = await confirmModal({
      title: t("index.guestSessionLossTitle"),
      text: t("index.guestSessionLossText", { who }),
      okText: t("index.guestSessionLossOk"),
      cancelText: t("index.guestSessionLossCancel"),
    });

    if (!ok) {
      try {
        if (email) email.value = "";
        if (pass) pass.value = "";
        if (pass2) pass2.value = "";
      } catch {}
      return false;
    }

    await discardCurrentGuestAccount();
    return true;
  } catch {
    // If we can't reliably detect, do not block login.
    return true;
  }
}

async function handlePendingEmailResend(emailAddr, pendingIntent) {
  const ok = await confirmModal({
    title: t("index.pendingEmailTitle"),
    text: t("index.pendingEmailText", { email: emailAddr }),
    okText: t("index.pendingEmailOk"),
    cancelText: t("index.pendingEmailCancel"),
  });
  if (!ok) return true;

  const intent = pendingIntent === "guest_migrate" ? "guest_migrate" : "signup";
  let reserveOk = false;
  let nextAllowedAtMs = 0;

  try {
    const { data, error } = await sb().rpc("email_resend_prepare", {
      p_email: String(emailAddr || "").trim().toLowerCase(),
      p_intent: intent,
    });
    if (!error && Array.isArray(data) && data.length) {
      reserveOk = !!data[0]?.ok;
      nextAllowedAtMs = data[0]?.nextallowedat ? new Date(data[0].nextallowedat).getTime() : 0;
    }
  } catch {}

  // Fallback for environments without the new RPC.
  if (!reserveOk && !nextAllowedAtMs) {
    const actionKey = intent === "guest_migrate" ? GUEST_UPGRADE_ACTION_KEY : SIGNUP_RESEND_ACTION_KEY;
    const reserve = await cooldownEmailReserve(emailAddr, actionKey, RESEND_COOLDOWN_SECONDS);
    reserveOk = !!reserve.ok;
    nextAllowedAtMs = reserve.nextAllowedAtMs || 0;
  }

  if (!reserveOk) {
    const left = (nextAllowedAtMs || 0) - Date.now();
    if (left > 0) setErr(t("index.errResendCooldown", { time: formatLeft(left) }));
    else setErr(t("index.errResendCooldownGeneric"));
    return true;
  }

  const language = getUiLang();
  const redirect = new URL("/confirm.html", location.origin);
  redirect.searchParams.set("lang", language);
  redirect.searchParams.set("to", emailAddr);

  if (intent === "guest_migrate") {
    const { error: resendErr } = await sb().auth.resend({
      type: "email_change",
      email: emailAddr,
      options: { emailRedirectTo: redirect.toString() },
    });
    if (resendErr) throw resendErr;
  } else {
    const { error: resendErr } = await sb().auth.resend({
      type: "signup",
      email: emailAddr,
      options: { emailRedirectTo: redirect.toString() },
    });
    if (resendErr) throw resendErr;
  }

  setStatus(t("index.statusCheckEmail"));
  void alertModal({ text: t("index.pendingEmailResent") });
  return true;
}


function openUsernameSetup() {
  if (loginCard) loginCard.hidden = true;
  if (setupCard) setupCard.hidden = false;
  document.body.classList.add("setup-mode");

  if (guestUsername) {
    if (setupTitleEl) setupTitleEl.textContent = t("index.setupGuestPrompt");
    if (setupSubEl) setupSubEl.textContent = t("index.setupGuestSub");
  } else {
    if (setupTitleEl) setupTitleEl.textContent = t("index.setupPrompt");
    if (setupSubEl) setupSubEl.textContent = t("index.setupSub");
  }

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
    btnPrimary.textContent = t("index.btnLogin");
    btnToggle.textContent = t("index.btnToggleRegister");
    email.placeholder = t("index.placeholderLogin");
    if (pass2) {
      pass2.value = "";
      pass2.disabled = true;
    }
  } else {
    email.placeholder = t("index.placeholderEmail");
    btnToggle.textContent = t("index.btnToggleLogin");
    if (pwdHint) pwdHint.textContent = getPasswordRulesText();
    btnPrimary.textContent = t("index.btnRegister");
    if (pass2) pass2.disabled = false;
  }

  document.body.classList.toggle("mode-login", mode === "login");
  document.body.classList.toggle("mode-register", mode === "register");
  if (pwdHint && mode !== "register") pwdHint.textContent = "";
  setErr("");
}

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });
  const syncLanguage = () => updateUserLanguage(getUiLang());
  applyMode();
  setStatus(t("index.statusChecking"));
  if (guestExpired) {
    void alertModal({ text: t("index.guestExpired") });
  }
  if (forceAuth) {
    void alertModal({ text: t("index.forceAuthInfo") });
  }
  
  const usernameForm = document.querySelector("#usernameForm");
  
  usernameForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isBusy) return;
    await saveUsername();
  });

  const u = await getUser();
  if (!u && hasGuestLocalMarker()) {
    // If we just initiated a guest upgrade, do not show the "deleted by inactivity" message.
    const pending = String(localStorage.getItem("auth:guest_upgrade_pending") || "");
    clearGuestLocalMarker();
    if (!pending) {
      void alertModal({ text: t("index.guestDeletedByInactivity") });
    } else {
      try { localStorage.removeItem("auth:guest_upgrade_pending"); } catch {}
    }
  }
  if (u) {
    if (isGuestUser(u) || forceAuth) {
      setStatus(t("index.statusLoggedOut"));
    } else {
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
  }
  
  setStatus(t("index.statusLoggedOut"));

  window.addEventListener("i18n:lang", syncLanguage);

  btnToggle.addEventListener("click", async () => {
    const nextMode = mode === "login" ? "register" : "login";
    mode = nextMode;

    applyMode();
  });

  btnPrimary.addEventListener("click", async () => {
    if (isBusy) return;
    setBusy(true);

    setErr("");
    const loginOrEmail = String(email.value || "").trim();
    const pwd = String(pass.value || "");

    if (mode === "login") {
      if (!loginOrEmail || !pwd) {
        setBusy(false);
        return setErr(t("index.errMissingLogin"));
      }
    } else {
      if (!loginOrEmail) {
        setBusy(false);
        return setErr(t("index.errInvalidEmail"));
      }
      if (!pwd) {
        setBusy(false);
        return setErr(t("index.errMissingLogin"));
      }
    }

    try {
      if (mode === "register") {
        const mail = loginOrEmail;

        if (!mail || !mail.includes("@")) return setErr(t("index.errInvalidEmail"));

        const statusInfo = await getEmailStatus(mail);
        if (statusInfo.status === "confirmed") {
          void alertModal({ text: t("index.emailAlreadyRegistered") });
          mode = "login";
          applyMode();
          return;
        }

        if (statusInfo.status === "pending") {
          await handlePendingEmailResend(mail, statusInfo.intent || "");
          return;
        }

        let current = null;
        try { current = await getUser(); } catch {}

        let migrateGuest = false;
        if (current && isGuestUser(current)) {
          migrateGuest = await confirmModal({
            title: t("index.guestMigrateTitle"),
            text: t("index.guestMigrateText"),
            okText: t("index.guestMigrateOk"),
            cancelText: t("index.guestMigrateCancel"),
          });
        }

        // Guest migrate: email-only + 1h resend cooldown.
        if (migrateGuest) {
          const reserve = await cooldownEmailReserve(mail, GUEST_UPGRADE_ACTION_KEY, GUEST_UPGRADE_COOLDOWN_SECONDS);
          if (!reserve.ok) {
            const left = (reserve.nextAllowedAtMs || 0) - Date.now();
            if (left > 0) return setErr(t("index.errResendCooldown", { time: formatLeft(left) }));
            return setErr(t("index.errResendCooldownGeneric"));
          }

          setStatus(t("index.statusRegistering"));

          if (current && isGuestUser(current)) {
            if (pass2.value !== pwd) return setErr(t("index.errPasswordMismatch"));
            try {
              validatePassword(pwd);
            } catch (e) {
              return setErr(niceAuthError(e));
            }

            let captchaToken = await getSilentCaptchaToken();
            setStatus(t("index.statusRegistering"));
            try {
              await convertGuestToRegistered(mail, pwd, getUiLang(), captchaToken);
            } catch (e) {
              if (isCaptchaError(e)) {
                captchaToken = await askCaptchaToken();
                await convertGuestToRegistered(mail, pwd, getUiLang(), captchaToken);
              } else {
                throw e;
              }
            }

            // We want the browser to be logged out after requesting the link (avoid accidental session switch).
            try { localStorage.setItem("auth:guest_upgrade_pending", "1"); } catch {}
            try { clearGuestLocalMarker(); } catch {}
            try { await sb().auth.signOut(); } catch {}

            setStatus(t("index.statusCheckEmail"));
            void alertModal({ text: t("index.guestMigrateConfirmEmail") });
            return;
          }

          // No guest session found: fall back to email_change resend.
          const language = getUiLang();
          const confirmUrl2 = new URL("/confirm.html", location.origin);
          confirmUrl2.searchParams.set("lang", language);
          confirmUrl2.searchParams.set("to", mail);

          const { error: resendErr } = await sb().auth.resend({
            type: "email_change",
            email: mail,
            options: { emailRedirectTo: confirmUrl2.toString() },
          });
          if (resendErr) throw resendErr;

          setStatus(t("index.statusCheckEmail"));
          void alertModal({ text: t("index.guestMigrateConfirmEmailNoPassword") });
          return;
        }

        if (pass2.value !== pwd) return setErr(t("index.errPasswordMismatch"));
        try {
          validatePassword(pwd);
        } catch (e) {
          return setErr(niceAuthError(e));
        }

        let captchaToken = await getSilentCaptchaToken();
        setStatus(t("index.statusRegistering"));
        const redirectTo = buildAuthRedirect(confirmUrl);
        try {
          await sendSignupConfirmation(mail, pwd, redirectTo, getUiLang(), captchaToken);
        } catch (e) {
          if (isCaptchaError(e)) {
            captchaToken = await askCaptchaToken();
            await sendSignupConfirmation(mail, pwd, redirectTo, getUiLang(), captchaToken);
          } else {
            throw e;
          }
        }
        setStatus(t("index.statusCheckEmail"));
      } else {
        // If a guest session is active, warn that logging in will discard guest data.
        const okToLogin = await confirmDiscardGuestIfActive();
        if (!okToLogin) return;

        setStatus(t("index.statusLoggingIn"));
        let captchaToken = await getCaptchaPromptForLogin(loginOrEmail);
        try {
          await signIn(loginOrEmail, pwd, captchaToken); // <-- może być username
        } catch (e) {
          if (isCaptchaError(e)) {
            captchaToken = await askCaptchaToken();
            await signIn(loginOrEmail, pwd, captchaToken);
          } else {
            throw e;
          }
        }
        resetLoginFailureCount(loginOrEmail);

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
      if (mode === "login" && isSecurityRelevantLoginError(e)) bumpLoginFailureCount(loginOrEmail);
      console.error(e);
      setStatus(t("index.statusError"));
      setErr(niceAuthError(e));
    } finally {
      setBusy(false);
    }
  });

  btnGuest?.addEventListener("click", async () => {
    if (isBusy) return;
    setBusy(true);
    setErr("");
    setStatus(t("index.statusLoggingIn"));
    try {
      const current = await getUser();
      if (current && isGuestUser(current)) {
        location.href = withLangParam(builderUrl);
        return;
      }
      let captchaToken = await getSilentCaptchaToken();
      try {
        await signInGuest(captchaToken);
      } catch (e) {
        if (isCaptchaError(e)) {
          captchaToken = await askCaptchaToken();
          await signInGuest(captchaToken);
        } else {
          throw e;
        }
      }
      const guestUser = await waitForUserSession();
      if (!guestUser) throw new Error(t("auth.loginFailed"));
      location.href = withLangParam(builderUrl);
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
        setErr("");
        showForgotCooldownForEmail(resolved);
        return;
      }
      // 3) reserve cooldown (cross-device) + send
      const reserve = await cooldownEmailReserve(resolved, RESET_ACTION_KEY, RESET_COOLDOWN_SECONDS);
      if (reserve.nextAllowedAtMs) setForgotUntil(resolved, reserve.nextAllowedAtMs);

      if (!reserve.ok) {
        const left2 = getForgotUntil(resolved) - Date.now();
        setStatus(t("index.statusResetSent"));
        setErr("");
        showForgotCooldownForEmail(resolved);
        return;
      }

      setStatus(t("index.statusResetSending"));
      const redirectTo = buildAuthRedirect(resetUrl);

      let captchaToken = await getSilentCaptchaToken();
      let usedEmail;
      try {
        usedEmail = await resetPassword(loginOrEmail, redirectTo, getUiLang(), resolved, captchaToken);
      } catch (e) {
        if (isCaptchaError(e)) {
          captchaToken = await askCaptchaToken();
          usedEmail = await resetPassword(loginOrEmail, redirectTo, getUiLang(), resolved, captchaToken);
        } else {
          throw e;
        }
      }

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
        // Jeśli RPC jest niedostępne, ukryj odliczanie (nie blokuj UI).
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
