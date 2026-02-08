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

function setStatus(m = "") { if (status) status.textContent = m; }
function setErr(m = "") { if (err) err.textContent = m; }

backToGames?.addEventListener("click", () => {
  const target = backToGames.dataset.baseHref || "builder.html";
  location.href = withLangParam(target);
});

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

let currentEmail = "";

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
}

async function handleUsernameSave() {
  setErr("");
  try {
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
    setStatus(t("account.statusUsernameSaved"));
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
  }
}

async function handleEmailSave() {
  setErr("");
  try {
    const mail = String(emailInput.value || "").trim().toLowerCase();
    if (!mail || !mail.includes("@")) throw new Error(t("account.errInvalidEmail"));

    const redirectTo = withLangParam(new URL("confirm.html", location.href).toString());
    const language = getUiLang();
    const { data, error } = await sb().auth.updateUser(
      { email: mail, data: { language } },
      { emailRedirectTo: redirectTo }
    );
    if (error) throw error;

    if (data?.user?.email?.toLowerCase() === mail) {
      const { error: profileError } = await sb()
        .from("profiles")
        .update({ email: mail })
        .eq("id", data.user.id);
      if (profileError) throw profileError;
    }

    if (currentEmail) {
      localStorage.setItem("pendingEmailChange", JSON.stringify({
        old: currentEmail,
        next: mail,
        ts: Date.now(),
      }));
    }
    setStatus(t("account.statusEmailSaved"));
    await signOut();
    setTimeout(() => {
      location.href = withLangParam("index.html");
    }, 400);
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
  }
}

async function handlePassSave() {
  setErr("");
  try {
    const a = String(pass1.value || "");
    const b = String(pass2.value || "");
    if (a !== b) throw new Error(t("account.errPasswordMismatch"));
    validatePassword(a);

    const { error } = await sb().auth.updateUser({ password: a });
    if (error) throw error;

    pass1.value = "";
    pass2.value = "";
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

document.addEventListener("DOMContentLoaded", () => {
  initI18n({ withSwitcher: true });
  loadProfile();
  saveUsername?.addEventListener("click", handleUsernameSave);
  saveEmail?.addEventListener("click", handleEmailSave);
  savePass?.addEventListener("click", handlePassSave);
  deleteAccount?.addEventListener("click", handleDeleteAccount);
});
