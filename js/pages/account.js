import { sb } from "../core/supabase.js";
import { cooldownGet, cooldownReserve, cooldownRelease } from "../core/cooldown.js";
import { requireAuth, updateUserLanguage, validatePassword, validateUsername, signOut, niceAuthError } from "../core/auth.js";
import { initI18n, t, getUiLang, withLangParam } from "../../translation/translation.js";

const status = document.getElementById("status");
const err = document.getElementById("err");

const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const pass1 = document.getElementById("pass1");
const pass2 = document.getElementById("pass2");
const deletePassword = document.getElementById("deletePassword");

const saveUsername = document.getElementById("saveUsername");
const saveEmail = document.getElementById("saveEmail");
const savePass = document.getElementById("savePass");
const deleteAccount = document.getElementById("deleteAccount");
const backToGames = document.getElementById("backToGames");
const btnManual = document.getElementById("btnManual");

const usernameCooldownEl = document.getElementById("usernameCooldown");
const emailCooldownEl = document.getElementById("emailCooldown");
const passwordCooldownEl = document.getElementById("passwordCooldown");

const emailPendingActions = document.getElementById("emailPendingActions");
const emailPendingHint = document.getElementById("emailPendingHint");
const resendEmailChange = document.getElementById("resendEmailChange");
const cancelEmailChange = document.getElementById("cancelEmailChange");

function setStatus(m = "") { if (status) status.textContent = m; }

function buildManualUrl() {
  const url = new URL("manual.html", location.href);
  const ret = `${location.pathname.split("/").pop() || ""}${location.search}${location.hash}`;
  url.searchParams.set("ret", ret);
  return url.toString();
}
function setErr(m = "") { if (err) err.textContent = m; }

backToGames?.addEventListener("click", () => {
  const target = backToGames.dataset.baseHref || "builder.html";
  location.href = withLangParam(target);
});

btnManual?.addEventListener("click", () => {
  location.href = buildManualUrl();
});

// --- cooldowns (anti-spam) ---
// Per-user (server-side) cooldown via RPC (cross-device).
// DB is the source of truth; UI only renders countdown.
const COOLDOWN_SECONDS = 60 * 60;

const CD = {
  username: "account:username",
  email: "account:email",
  password: "account:password",
};

const cooldownBindings = [];
let cooldownTimer = null;

// in-memory cache of next_allowed timestamps (ms)
const cooldownEndMs = new Map();

function getCooldownEnd(key) {
  return cooldownEndMs.get(key) || 0;
}

function getRemainingMs(key) {
  const end = getCooldownEnd(key);
  return Math.max(0, end - Date.now());
}

function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function bindCooldown({ key, labelEl, disableEls }) {
  cooldownBindings.push({ key, labelEl, disableEls });
}

function tickCooldowns() {
  cooldownBindings.forEach(({ key, labelEl, disableEls }) => {
    const rem = getRemainingMs(key);
    const active = rem > 0;

    if (labelEl) {
      labelEl.hidden = !active;
      labelEl.textContent = active ? t("account.cooldown", { time: formatRemaining(rem) }) : "";
    }

    (disableEls || []).forEach((el) => {
      if (!el) return;
      if (active) el.disabled = true;
      else if (!el.dataset.locked) el.disabled = false;
    });
  });
}

function startCooldownTicker() {
  if (cooldownTimer) return;
  cooldownTimer = setInterval(tickCooldowns, 1000);
  tickCooldowns();
}

async function loadCooldownsFromServer() {
  const keys = Object.values(CD);
  const map = await cooldownGet(keys);
  keys.forEach((k) => cooldownEndMs.set(k, map.get(k) || 0));
  tickCooldowns();
}

// Atomically reserves the cooldown window in DB (cross-device anti-spam).
async function reserveCooldownOrThrow(key) {
  const res = await cooldownReserve(key, COOLDOWN_SECONDS);

  if (Number.isFinite(res.nextAllowedAtMs) && res.nextAllowedAtMs > 0) {
    cooldownEndMs.set(key, res.nextAllowedAtMs);
  }
  tickCooldowns();

  if (!res.ok) {
    const rem = getRemainingMs(key);
    throw new Error(t("account.errCooldown", { time: formatRemaining(rem) }));
  }
  return res;
}


// --- email change pending state ---
let currentEmail = "";
let pendingEmail = "";

function extractPendingEmail(u) {
  const candidates = [
    u?.new_email,
    u?.newEmail,
    u?.email_change?.new_email,
    u?.email_change?.email,
    u?.user_metadata?.new_email,
    u?.user_metadata?.newEmail,
    u?.user_metadata?.familiada_email_change_pending,
  ];
  return candidates.find((v) => typeof v === "string" && v.includes("@")) || "";
}

function lockEl(el, locked) {
  if (!el) return;
  if (locked) el.dataset.locked = "1";
  else delete el.dataset.locked;
  el.disabled = !!locked;
}

function setEmailPendingUi(nextPendingEmail) {
  pendingEmail = nextPendingEmail || "";
  const hasPending = !!pendingEmail && pendingEmail !== currentEmail;

  if (emailPendingActions) emailPendingActions.hidden = !hasPending;
  if (saveEmail) saveEmail.hidden = hasPending;

  if (emailPendingHint) {
    emailPendingHint.hidden = !hasPending;
    emailPendingHint.textContent = hasPending ? t("account.emailPendingText", { email: pendingEmail }) : "";
  }

  if (hasPending) {
    if (emailInput) {
      emailInput.value = pendingEmail;
      lockEl(emailInput, true);
    }
    lockEl(saveEmail, true);
    setStatus(t("account.statusEmailPending"));
  } else {
    if (emailInput) {
      emailInput.value = currentEmail || "";
      lockEl(emailInput, false);
    }
    lockEl(saveEmail, false);
  }

  // cooldown may additionally disable resend (cancel is always allowed)
  tickCooldowns();
}


async function fetchEmailChangeStatus() {
  try {
    const { data: sess } = await sb().auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return null;

    const { data, error } = await sb().functions.invoke("email-change-status", {
      body: {},
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    if (!data?.ok) return null;
    return data;
  } catch (e) {
    // Fallback will handle UI. We keep this silent.
    console.warn("[email-change-status] failed:", e);
    return null;
  }
}

async function refreshAuthEmailState() {
  try {
    // 1) Preferred: edge function (service role) – sees pending email across GoTrue versions
    const st = await fetchEmailChangeStatus();
    if (st) {
      currentEmail = st.email || currentEmail;
      const p = st.pending_email || "";
      setEmailPendingUi(p);
      return;
    }

    // 2) Fallback: client-side user object
    const { data, error } = await sb().auth.getUser();
    if (error) throw error;
    const u = data?.user;
    if (!u) return;
    currentEmail = u.email || currentEmail;
    const p = extractPendingEmail(u);
    setEmailPendingUi(p);
  } catch (e) {
    console.warn("refreshAuthEmailState failed:", e);
  }
}

let emailStateTimer = null;

function startEmailStateWatcher() {
  if (emailStateTimer) return;
  const tick = () => {
    if (document.visibilityState !== "visible") return;
    refreshAuthEmailState();
  };
  // refresh when user returns to the tab/window
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", tick);
  // periodic refresh (cross-device confirmations)
  emailStateTimer = setInterval(tick, 30_000);
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

async function loadProfile() {
  const user = await requireAuth("index.html?setup=username");
  if (!user) return;

  const syncLanguage = () => updateUserLanguage(getUiLang());
  await syncLanguage();
  window.addEventListener("i18n:lang", () => {
    syncLanguage();
    // refresh dynamic texts after language switch
    setEmailPendingUi(pendingEmail);
    tickCooldowns();
  });

  usernameInput.value = user.username || "";
  emailInput.value = user.email || "";
  currentEmail = user.email || "";

  setStatus(t("account.statusLoaded"));
  await refreshAuthEmailState();
  await loadCooldownsFromServer();
  startEmailStateWatcher();
}

async function handleUsernameSave() {
  setErr("");
  let reserved = false;
  try {
    const username = validateUsername(usernameInput.value || "");
    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user) throw new Error(t("index.errNoSession"));
    await ensureUsernameAvailable(username, userData.user.id);

    await reserveCooldownOrThrow(CD.username);
    reserved = true;

    const { error } = await sb()
      .from("profiles")
      .update({ username })
      .eq("id", userData.user.id);
    if (error) throw error;

    const { error: metaErr } = await sb().auth.updateUser({ data: { username } });
    if (metaErr) throw metaErr;

    setStatus(t("account.statusUsernameSaved"));
    await loadCooldownsFromServer();
  } catch (e) {
    console.error(e);
    if (reserved) {
      try {
        await cooldownRelease(CD.username, 60);
        await loadCooldownsFromServer();
      } catch {}
    }
    setErr(niceAuthError(e));
  }
}

async function handleEmailSave() {
  setErr("");
  let reserved = false;
  try {
    if (pendingEmail && pendingEmail !== currentEmail) {
      throw new Error(t("account.errEmailPending"));
    }

    const mail = String(emailInput.value || "").trim();
    if (!mail || !mail.includes("@")) throw new Error(t("account.errInvalidEmail"));

    const normalizedMail = mail.toLowerCase();
    const language = getUiLang();

    const confirmUrl = new URL("/confirm.html", location.origin);
    confirmUrl.searchParams.set("lang", language);
    confirmUrl.searchParams.set("to", normalizedMail);

    await reserveCooldownOrThrow(CD.email);
    reserved = true;

    setStatus(t("account.statusSavingEmail"));

    const { error } = await sb().auth.updateUser(
      { email: normalizedMail, data: { language, familiada_email_change_pending: normalizedMail } },
      { emailRedirectTo: confirmUrl.toString() }
    );
    if (error) throw error;

    setStatus(t("account.statusEmailSaved"));
    await refreshAuthEmailState();
    await loadCooldownsFromServer();
  } catch (e) {
    console.error(e);
    if (reserved) {
      try {
        await cooldownRelease(CD.email, 60);
        await loadCooldownsFromServer();
      } catch {}
    }
    setErr(niceAuthError(e));
  }
}

async function handleEmailResend() {
  setErr("");
  let reserved = false;
  try {
    if (!pendingEmail || pendingEmail === currentEmail) {
      throw new Error(t("account.errNoPendingEmail"));
    }

    const language = getUiLang();
    const confirmUrl = new URL("/confirm.html", location.origin);
    confirmUrl.searchParams.set("lang", language);
    confirmUrl.searchParams.set("to", pendingEmail);

    await reserveCooldownOrThrow(CD.email);
    reserved = true;

    setStatus(t("account.statusEmailResending"));

    const { error } = await sb().auth.resend({
      type: "email_change",
      email: pendingEmail,
      options: { emailRedirectTo: confirmUrl.toString() },
    });
    if (error) throw error;

    setStatus(t("account.statusEmailResent"));
    await refreshAuthEmailState();
    await loadCooldownsFromServer();
  } catch (e) {
    console.error(e);
    if (reserved) {
      try {
        await cooldownRelease(CD.email, 60);
        await loadCooldownsFromServer();
      } catch {}
    }
    setErr(niceAuthError(e));
  }
}

async function cancelEmailChangeOnServer(pendingEmail) {
  // Requires Edge Function: supabase/functions/email-change-cancel
  const { data, error } = await sb().functions.invoke("email-change-cancel", {
    body: { pendingEmail: pendingEmail || null },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Email change cancel failed.");
  return data;
}


async function handleEmailCancel() {
  setErr("");
  try {
    // state might have changed on another device (confirmed already)
    await refreshAuthEmailState();

    if (!pendingEmail || pendingEmail === currentEmail) {
      // nothing to cancel
      setStatus(t("account.statusLoaded"));
      setEmailPendingUi("");
      return;
    }

    const language = getUiLang();
    const confirmUrl = new URL("/confirm.html", location.origin);
    confirmUrl.searchParams.set("lang", language);
    confirmUrl.searchParams.set("to", currentEmail);

    setStatus(t("account.statusEmailCancelling"));

    // Prefer server-side cancel (service-role) – reliable and domain-agnostic.
    const res = await cancelEmailChangeOnServer(pendingEmail);
    if (res?.ok) {
      setStatus(t("account.statusEmailCancelled"));
      await refreshAuthEmailState();
      await loadCooldownsFromServer();
      return;
    }

    // Fallback: client-side attempt (may not fully cancel on all Supabase setups)


    const { error } = await sb().auth.updateUser(
      { email: currentEmail, data: { language, familiada_email_change_pending: "" } },
      { emailRedirectTo: confirmUrl.toString() }
    );
    if (error) throw error;

    setStatus(t("account.statusEmailCancelled"));
    await refreshAuthEmailState();
    await loadCooldownsFromServer();
  } catch (e) {
    console.error(e);
    setStatus(t("account.statusError"));
    setErr(niceAuthError(e));
  }
}

async function handlePassSave() {
  setErr("");
  let reserved = false;
  try {
    const a = String(pass1.value || "");
    const b = String(pass2.value || "");
    if (a !== b) throw new Error(t("account.errPasswordMismatch"));
    validatePassword(a);

    await reserveCooldownOrThrow(CD.password);
    reserved = true;

    const { error } = await sb().auth.updateUser({ password: a });
    if (error) throw error;

    pass1.value = "";
    pass2.value = "";
    setStatus(t("account.statusPasswordSaved"));
    await loadCooldownsFromServer();
  } catch (e) {
    console.error(e);
    if (reserved) {
      try {
        await cooldownRelease(CD.password, 60);
        await loadCooldownsFromServer();
      } catch {}
    }
    setErr(niceAuthError(e));
  }
}

async function handleDeleteAccount() {
  setErr("");
  try {
    const pwd = String(deletePassword.value || "");
    if (!pwd) throw new Error(t("account.errDeletePasswordMissing"));

    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user?.email) throw new Error(t("index.errNoSession"));

    const { error: signInError } = await sb().auth.signInWithPassword({
      email: userData.user.email,
      password: pwd,
    });
    if (signInError) throw new Error(t("account.errInvalidPassword"));

    setStatus(t("account.statusDeleting"));
    const { data, error } = await sb().functions.invoke("delete-account");
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || t("account.errDeleteFailed"));

    await signOut();
    location.href = withLangParam("index.html");
  } catch (e) {
    console.error(e);
    setStatus(t("account.statusError"));
    setErr(niceAuthError(e));
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });

  // cooldown: server state (cross-device)
  bindCooldown({ key: CD.username, labelEl: usernameCooldownEl, disableEls: [usernameInput, saveUsername] });
  bindCooldown({ key: CD.email, labelEl: emailCooldownEl, disableEls: [emailInput, saveEmail, resendEmailChange] });
  bindCooldown({ key: CD.password, labelEl: passwordCooldownEl, disableEls: [pass1, pass2, savePass] });
  startCooldownTicker();

  await loadProfile();

  saveUsername?.addEventListener("click", handleUsernameSave);
  saveEmail?.addEventListener("click", handleEmailSave);
  savePass?.addEventListener("click", handlePassSave);
  deleteAccount?.addEventListener("click", handleDeleteAccount);

  resendEmailChange?.addEventListener("click", handleEmailResend);
  cancelEmailChange?.addEventListener("click", handleEmailCancel);

  usernameInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    saveUsername?.click();
  });

  emailInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    saveEmail?.click();
  });

  pass1?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    pass2?.focus();
  });

  pass2?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    savePass?.click();
  });

  deletePassword?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    deleteAccount?.click();
  });
});