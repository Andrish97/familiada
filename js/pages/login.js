// js/pages/login.js
import {
  getUser,
  signIn,
  signInGuest,
  signUp,
  convertGuestToRegistered,
  convertGuestToRegisteredEmailOnly,
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
const passwordCard = $("#passwordCard");
const usernameFirst = $("#usernameFirst");
const usernameErr = $("#usernameErr");
const btnUsernameSave = $("#btnUsernameSave");
const passwordNew1 = $("#passwordNew1");
const passwordNew2 = $("#passwordNew2");
const passwordErr = $("#passwordErr");
const passwordHint = $("#passwordHint");
const btnPasswordSave = $("#btnPasswordSave");
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

function getCaptchaPromptForLogin(loginOrEmail) {
  const policy = getLoginCaptchaPolicy(loginOrEmail);
  if (policy.requireCaptcha) return askCaptchaToken();
  return Promise.resolve(null);
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

async function askCaptchaToken() {
  if (!captchaSiteKey) return null;
  const captcha = await loadCaptchaApi();
  if (!captcha?.render) throw new Error(t("index.captchaRequired"));

  const mount = document.createElement("div");
  mount.dataset.theme = "dark";
  mount.style.minHeight = "84px";
  mount.style.display = "grid";
  mount.style.placeItems = "center";

  let token = "";
  const widgetId = captchaProvider === "hcaptcha"
    ? captcha.render(mount, {
      sitekey: captchaSiteKey,
      theme: "dark",
      size: "normal",
      callback: (value) => { token = String(value || ""); },
      "expired-callback": () => { token = ""; },
      "error-callback": () => { token = ""; },
    })
    : captcha.render(mount, {
      sitekey: captchaSiteKey,
      theme: "auto",
      callback: (value) => { token = String(value || ""); },
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
}


let mode = "login"; // login | register
let registerVariant = "normal"; // normal | guest-migrate

let isBusy = false;

const RESET_COOLDOWN_MS = 60 * 60 * 1000; // 1h
const RESET_ACTION_KEY = "auth:reset_password";
const RESET_COOLDOWN_SECONDS = 60 * 60;

const GUEST_UPGRADE_ACTION_KEY = "auth:guest_upgrade_email";
const GUEST_UPGRADE_COOLDOWN_SECONDS = 60 * 60;

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
const setup = params.get("setup");
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

function openUsernameSetup() {
  if (loginCard) loginCard.hidden = true;
  if (setupCard) setupCard.hidden = false;
  if (passwordCard) passwordCard.hidden = true;
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
  if (passwordCard) passwordCard.hidden = true;
  document.body.classList.remove("setup-mode");
}

function openPasswordSetup() {
  if (loginCard) loginCard.hidden = true;
  if (setupCard) setupCard.hidden = true;
  if (passwordCard) passwordCard.hidden = false;
  document.body.classList.add("setup-mode");
  if (passwordHint) {
    passwordHint.hidden = false;
    passwordHint.textContent = getPasswordRulesText();
  }
  if (passwordNew1) passwordNew1.focus();
}

function closePasswordSetup() {
  if (loginCard) loginCard.hidden = false;
  if (setupCard) setupCard.hidden = true;
  if (passwordCard) passwordCard.hidden = true;
  document.body.classList.remove("setup-mode");
}

function setPasswordErr(m = "") {
  if (passwordErr) passwordErr.textContent = m;
}

async function savePassword() {
  setPasswordErr("");
  try {
    const p1 = String(passwordNew1?.value || "");
    const p2 = String(passwordNew2?.value || "");
    if (!p1 || !p2) throw new Error(t("index.errPasswordMissing"));
    if (p1 !== p2) throw new Error(t("index.errPasswordMismatch"));
    validatePassword(p1);

    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user) throw new Error(t("index.errNoSession"));

    const { error } = await sb().auth.updateUser({
      password: p1,
      data: { familiada_needs_password: false },
    });
    if (error) throw error;

    closePasswordSetup();
    location.href = withLangParam(builderUrl);
  } catch (e) {
    console.error("[savePassword] FAIL", e);
    setPasswordErr(niceAuthError(e));
  }
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
    registerVariant = "normal";
  } else {
    email.placeholder = t("index.placeholderEmail");
    btnToggle.textContent = t("index.btnToggleLogin");

    if (registerVariant === "guest-migrate") {
      pass.style.display = "none";
      pass2.style.display = "none";
      if (pwdHint) pwdHint.hidden = true;
      btnPrimary.textContent = t("index.btnRegisterGuestEmail");
    } else {
      pass.style.display = "block";
      pass2.style.display = "block";
      if (pwdHint) {
        pwdHint.hidden = false;
        pwdHint.textContent = getPasswordRulesText();
      }
      btnPrimary.textContent = t("index.btnRegister");
    }
  }
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
  const passwordForm = document.querySelector("#passwordForm");
  
  usernameForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isBusy) return;
    await saveUsername();
  });

  passwordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isBusy) return;
    setBusy(true);
    try { await savePassword(); } finally { setBusy(false); }
  });

  const u = await getUser();
  if (!u && hasGuestLocalMarker()) {
    clearGuestLocalMarker();
    void alertModal({ text: t("index.guestDeletedByInactivity") });
  }
  if (u) {
    if (isGuestUser(u) || forceAuth) {
      setStatus(t("index.statusLoggedOut"));
    } else {
      await syncLanguage();
      if (u.user_metadata?.familiada_needs_password === true) {
        openPasswordSetup();
        return;
      }
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

  if (setup === "password") {
    const me = await getUser();
    if (me) {
      openPasswordSetup();
    } else {
      void alertModal({ text: t("index.errNoSession") });
    }
  }

  window.addEventListener("i18n:lang", syncLanguage);

  btnToggle.addEventListener("click", async () => {
    const nextMode = mode === "login" ? "register" : "login";
    mode = nextMode;
    registerVariant = "normal";

    // If switching to register while already in guest session, ask whether to migrate.
    if (nextMode === "register") {
      try {
        const current = await getUser();
        if (current && isGuestUser(current)) {
          const migrate = await confirmModal({
            title: t("index.guestMigrateTitle"),
            text: t("index.guestMigrateText"),
            okText: t("index.guestMigrateOk"),
            cancelText: t("index.guestMigrateCancel"),
          });
          registerVariant = migrate ? "guest-migrate" : "normal";
        }
      } catch {}
    }

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
      if (registerVariant !== "guest-migrate" && !pwd) {
        setBusy(false);
        return setErr(t("index.errMissingLogin"));
      }
    }

    try {
      if (mode === "register") {
        const mail = loginOrEmail;

        if (!mail || !mail.includes("@")) return setErr(t("index.errInvalidEmail"));

        // Guest migrate: email-only (no password) + 1h resend cooldown.
        if (registerVariant === "guest-migrate") {
          try {
            await refreshForgotUntil(mail); // reuse cache infra
          } catch {}

          const reserve = await cooldownEmailReserve(mail, GUEST_UPGRADE_ACTION_KEY, GUEST_UPGRADE_COOLDOWN_SECONDS);
          if (!reserve.ok) {
            const left = (reserve.nextAllowedAtMs || 0) - Date.now();
            if (left > 0) return setErr(t("index.errResendCooldown", { time: formatLeft(left) }));
            return setErr(t("index.errResendCooldownGeneric"));
          }

          setStatus(t("index.statusRegistering"));
          const upgraded = await convertGuestToRegisteredEmailOnly(mail, getUiLang());
          if (!upgraded?.email_confirmed_at) {
            setStatus(t("index.statusCheckEmail"));
            void alertModal({ text: t("index.guestMigrateConfirmEmailNoPassword") });
            return;
          }
          // Edge case: already confirmed (rare). Go to password setup.
          openPasswordSetup();
          return;
        }

        if (pass2.value !== pwd) return setErr(t("index.errPasswordMismatch"));
        try {
          validatePassword(pwd);
        } catch (e) {
          return setErr(niceAuthError(e));
        }

        const current = await getUser();
        if (current && isGuestUser(current)) {
          // User decided not to migrate (registerVariant==normal). Discard guest first.
          await discardCurrentGuestAccount();
        }

        const captchaToken = await askCaptchaToken();
        setStatus(t("index.statusRegistering"));
        const redirectTo = buildAuthRedirect(confirmUrl);
        await signUp(mail, pwd, redirectTo, null, getUiLang(), captchaToken);
        setStatus(t("index.statusCheckEmail"));
      } else {
        setStatus(t("index.statusLoggingIn"));
        const captchaToken = await getCaptchaPromptForLogin(loginOrEmail);
        await signIn(loginOrEmail, pwd, captchaToken); // <-- może być username
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
      if (mode === "login") bumpLoginFailureCount(loginOrEmail);
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
      const captchaToken = await askCaptchaToken();
      await signInGuest(captchaToken);
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
