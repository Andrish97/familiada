import { sb } from "../core/supabase.js";
import { requireAuth, updateUserLanguage, validatePassword, validateUsername, signOut } from "../core/auth.js";
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

const usernameCooldownEl = document.getElementById("usernameCooldown");
const emailCooldownEl = document.getElementById("emailCooldown");
const passwordCooldownEl = document.getElementById("passwordCooldown");

const emailPendingBox = document.getElementById("emailPendingBox");
const emailPendingText = document.getElementById("emailPendingText");
const resendEmailChange = document.getElementById("resendEmailChange");
const cancelEmailChange = document.getElementById("cancelEmailChange");

function setStatus(m = "") { if (status) status.textContent = m; }
function setErr(m = "") { if (err) err.textContent = m; }

backToGames?.addEventListener("click", () => {
  const target = backToGames.dataset.baseHref || "builder.html";
  location.href = withLangParam(target);
});

// --- cooldowns (anti-spam) ---
const COOLDOWN_MS = 60 * 60 * 1000;
const CD = {
  username: "familiada:cooldown:account:username",
  email: "familiada:cooldown:account:email",
  password: "familiada:cooldown:account:password",
};

const cooldownBindings = [];
let cooldownTimer = null;

function getCooldownEnd(key) {
  const v = Number(localStorage.getItem(key) || "0");
  return Number.isFinite(v) ? v : 0;
}

function getRemainingMs(key) {
  const end = getCooldownEnd(key);
  return Math.max(0, end - Date.now());
}

function formatRemaining(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startCooldown(key) {
  localStorage.setItem(key, String(Date.now() + COOLDOWN_MS));
  tickCooldowns();
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
      if (active) labelEl.textContent = t("account.cooldown", { time: formatRemaining(rem) });
      else labelEl.textContent = "";
    }

    (disableEls || []).forEach((el) => {
      if (!el) return;
      // some elements might be disabled by other logic (e.g. pending email); never force-enable in that case
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

  if (emailPendingBox) emailPendingBox.hidden = !hasPending;

  if (hasPending) {
    if (emailPendingText) emailPendingText.textContent = t("account.emailPendingText", { email: pendingEmail });
    if (emailInput) {
      emailInput.value = pendingEmail;
      lockEl(emailInput, true);
    }
    lockEl(saveEmail, true);
    setStatus(t("account.statusEmailPending"));
  } else {
    if (emailPendingText) emailPendingText.textContent = "";
    if (emailInput) {
      emailInput.value = currentEmail || "";
      lockEl(emailInput, false);
    }
    lockEl(saveEmail, false);
  }

  // cooldown may additionally disable resend/cancel
  tickCooldowns();
}

async function refreshAuthEmailState() {
  try {
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
  window.addEventListener("i18n:lang", syncLanguage);

  usernameInput.value = user.username || "";
  emailInput.value = user.email || "";
  currentEmail = user.email || "";

  setStatus(t("account.statusLoaded"));
  await refreshAuthEmailState();
}

function cooldownGuard(key) {
  const rem = getRemainingMs(key);
  if (rem > 0) {
    throw new Error(t("account.errCooldown", { time: formatRemaining(rem) }));
  }
}

async function handleUsernameSave() {
  setErr("");
  try {
    cooldownGuard(CD.username);

    const username = validateUsername(usernameInput.value || "");
    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user) throw new Error(t("index.errNoSession"));
    await ensureUsernameAvailable(username, userData.user.id);

    const { error } = await sb()
      .from("profiles")
      .update({ username })
      .eq("id", userData.user.id);
    if (error) throw error;

    await sb().auth.updateUser({ data: { username } });

    startCooldown(CD.username);
    setStatus(t("account.statusUsernameSaved"));
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
  }
}

async function handleEmailSave() {
  setErr("");
  try {
    cooldownGuard(CD.email);

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

    setStatus(t("account.statusSavingEmail"));

    const { error } = await sb().auth.updateUser(
      { email: normalizedMail, data: { language } },
      { emailRedirectTo: confirmUrl.toString() }
    );
    if (error) throw error;

    startCooldown(CD.email);
    setStatus(t("account.statusEmailSaved"));
    await refreshAuthEmailState();
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
  }
}

async function handleEmailResend() {
  setErr("");
  try {
    cooldownGuard(CD.email);

    if (!pendingEmail || pendingEmail === currentEmail) {
      throw new Error(t("account.errNoPendingEmail"));
    }

    const language = getUiLang();
    const confirmUrl = new URL("/confirm.html", location.origin);
    confirmUrl.searchParams.set("lang", language);
    confirmUrl.searchParams.set("to", pendingEmail);

    setStatus(t("account.statusEmailResending"));

    // Prefer a dedicated resend for the email_change flow (avoid re-initiating updateUser).
    const { error } = await sb().auth.resend({
      type: "email_change",
      email: pendingEmail,
      options: { emailRedirectTo: confirmUrl.toString() },
    });
    if (error) throw error;

    startCooldown(CD.email);
    setStatus(t("account.statusEmailResent"));
    await refreshAuthEmailState();
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
  }
}

async function handleEmailCancel() {
  setErr("");
  try {
    cooldownGuard(CD.email);

    if (!pendingEmail || pendingEmail === currentEmail) {
      throw new Error(t("account.errNoPendingEmail"));
    }

    const language = getUiLang();
    const confirmUrl = new URL("/confirm.html", location.origin);
    confirmUrl.searchParams.set("lang", language);
    confirmUrl.searchParams.set("to", currentEmail);

    setStatus(t("account.statusEmailCancelling"));

    // best-effort: request "revert" by setting email back to the current one
    const { error } = await sb().auth.updateUser(
      { email: currentEmail, data: { language } },
      { emailRedirectTo: confirmUrl.toString() }
    );
    if (error) throw error;

    startCooldown(CD.email);
    setStatus(t("account.statusEmailCancelled"));
    await refreshAuthEmailState();
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
  }
}

async function handlePassSave() {
  setErr("");
  try {
    cooldownGuard(CD.password);

    const a = String(pass1.value || "");
    const b = String(pass2.value || "");
    if (a !== b) throw new Error(t("account.errPasswordMismatch"));
    validatePassword(a);

    const { error } = await sb().auth.updateUser({ password: a });
    if (error) throw error;

    pass1.value = "";
    pass2.value = "";

    startCooldown(CD.password);
    setStatus(t("account.statusPasswordSaved"));
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
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
    setErr(e?.message || String(e));
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });

  bindCooldown({ key: CD.username, labelEl: usernameCooldownEl, disableEls: [usernameInput, saveUsername] });
  bindCooldown({ key: CD.email, labelEl: emailCooldownEl, disableEls: [emailInput, saveEmail, resendEmailChange, cancelEmailChange] });
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
