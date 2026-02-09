// js/pages/index.js
import {
  getUser,
  signIn,
  signUp,
  resetPassword,
  resolveLoginToEmail,
  updateUserLanguage,
  validatePassword,
  validateUsername
} from "../core/auth.js";

import { sb } from "../core/supabase.js";
import { initI18n, t, getUiLang, withLangParam } from "../../translation/translation.js";

const $ = (s) => document.querySelector(s);
const email = $("#email");
const pass = $("#pass");
const pass2 = $("#pass2");
const status = $("#status");
const err = $("#err");
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

let mode = "login"; // login | register

let isBusy = false;

const RESET_COOLDOWN_MS = 60 * 60 * 1000; // 1h
let _forgotTimer = null;

function resetKey(email) {
  return `familiada:cooldown:reset:${String(email || "").toLowerCase()}`;
}

function getUntil(key) {
  const v = Number(localStorage.getItem(key) || "0");
  return Number.isFinite(v) ? v : 0;
}

function setUntil(key, until) {
  localStorage.setItem(key, String(until));
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

  const k = resetKey(resolvedEmail);
  const tick = () => {
    // pokazuj tylko, gdy aktualnie w polu jest ten sam email (lub user wpisał username → wtedy i tak kliknie)
    const current = String(email?.value || "").trim().toLowerCase();
    if (current.includes("@") && current !== String(resolvedEmail).toLowerCase()) {
      hideForgotCooldown();
      btnForgot.disabled = false;
      return;
    }

    const until = getUntil(k);
    const left = until - Date.now();

    if (left <= 0) {
      localStorage.removeItem(k);
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
  const url = new URL(pollsUrl.startsWith("/") ? pollsUrl : `/${pollsUrl}`, location.origin);
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
  setUsernameErr("");
  try {
    const username = validateUsername(usernameFirst?.value || "");
    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user) throw new Error(t("index.errNoSession"));
    await ensureUsernameAvailable(username, userData.user.id);
    const { error } = await sb()
      .from("profiles")
      .update({ username })
      .eq("id", userData.user.id);
    if (error) throw error;
    await sb().auth.updateUser({ data: { username } });
    closeUsernameSetup();
    location.href = withLangParam(builderUrl);
  } catch (e) {
    console.error(e);
    setUsernameErr(e?.message || String(e));
  }
}

function applyMode() {
  if (mode === "login") {
    pass2.style.display = "none";
    btnPrimary.textContent = t("index.btnLogin");
    btnToggle.textContent = t("index.btnToggleRegister");
    email.placeholder = t("index.placeholderLogin");
  } else {
    pass2.style.display = "block";
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

  const u = await getUser();
  if (u) {
    await syncLanguage();
    if (!u.username || setup === "username") {
      openUsernameSetup();
    } else if (nextTarget === "polls-hub") {
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
          return setErr(e?.message || String(e));
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
        } else if (nextTarget === "polls-hub") {
          location.href = buildNextUrl();
        } else {
          location.href = withLangParam(builderUrl);
        }
      }
    } catch (e) {
      console.error(e);
      setStatus(t("index.statusError"));
      setErr(e?.message || String(e));
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
  
      // 2) cooldown check (per email)
      const k = resetKey(resolved);
      const until = getUntil(k);
      const left = until - Date.now();
      if (left > 0) {
        setStatus(t("index.statusResetSent"));
        setErr(t("index.errResetCooldown", { time: formatLeft(left) }));
        showForgotCooldownForEmail(resolved);
        return;
      }
  
      // 3) send
      setStatus(t("index.statusResetSending"));
      const redirectTo = buildAuthRedirect(resetUrl);
  
      const usedEmail = await resetPassword(loginOrEmail, redirectTo, getUiLang(), resolved);
      setUntil(resetKey(usedEmail), Date.now() + RESET_COOLDOWN_MS);
  
      setStatus(t("index.statusResetSent"));
      hideForgotCooldown();
      showForgotCooldownForEmail(usedEmail);
    } catch (e) {
      console.error(e);
      setStatus(t("index.statusError"));
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  });

  btnForgot.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    btnForgot.click();
  });


  btnUsernameSave?.addEventListener("click", saveUsername);
  
  usernameFirst?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isBusy) return;
    btnUsernameSave.click();
  });

  btnUsernameSave?.addEventListener("touchend", (e) => {
    e.preventDefault();
    btnUsernameSave.click();
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
    const until = getUntil(resetKey(v));
    if (until > Date.now()) {
      showForgotCooldownForEmail(v);
    } else {
      hideForgotCooldown();
      btnForgot.disabled = false;
    }
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
