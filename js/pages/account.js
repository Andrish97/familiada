import { sb } from "../core/supabase.js";
import { requireAuth, validatePassword, validateUsername, signOut } from "../core/auth.js";

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

function setStatus(m = "") { if (status) status.textContent = m; }
function setErr(m = "") { if (err) err.textContent = m; }

async function ensureUsernameAvailable(username, userId) {
  const { data, error } = await sb()
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .neq("id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) throw new Error("Ta nazwa użytkownika jest już zajęta.");
}

let currentEmail = "";

async function loadProfile() {
  const user = await requireAuth("index.html?setup=username");
  if (!user) return;
  usernameInput.value = user.username || "";
  emailInput.value = user.email || "";
  currentEmail = user.email || "";
  setStatus("Profil załadowany.");
}

async function handleUsernameSave() {
  setErr("");
  try {
    const username = validateUsername(usernameInput.value || "");
    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user) throw new Error("Brak aktywnej sesji.");
    await ensureUsernameAvailable(username, userData.user.id);

    const { error } = await sb()
      .from("profiles")
      .update({ username })
      .eq("id", userData.user.id);
    if (error) throw error;

    await sb().auth.updateUser({ data: { username } });
    setStatus("Nazwa użytkownika zapisana.");
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
  }
}

async function handleEmailSave() {
  setErr("");
  try {
    const mail = String(emailInput.value || "").trim().toLowerCase();
    if (!mail || !mail.includes("@")) throw new Error("Podaj poprawny e-mail.");

    const redirectTo = new URL("confirm.html", location.href).toString();
    const { data, error } = await sb().auth.updateUser(
      { email: mail },
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
    setStatus("Zapisano zmianę e-maila. Zaloguj się ponownie.");
    await signOut();
    setTimeout(() => {
      location.href = "index.html";
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
    if (a !== b) throw new Error("Hasła nie są takie same.");
    validatePassword(a);

    const { error } = await sb().auth.updateUser({ password: a });
    if (error) throw error;

    pass1.value = "";
    pass2.value = "";
    setStatus("Hasło zostało zmienione.");
  } catch (e) {
    console.error(e);
    setErr(e?.message || String(e));
  }
}

async function handleDeleteAccount() {
  setErr("");
  try {
    const pwd = String(deletePassword.value || "");
    if (!pwd) throw new Error("Podaj hasło, aby potwierdzić.");

    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user?.email) throw new Error("Brak aktywnej sesji.");

    const { error: signInError } = await sb().auth.signInWithPassword({
      email: userData.user.email,
      password: pwd,
    });
    if (signInError) throw new Error("Nieprawidłowe hasło.");

    setStatus("Usuwam konto…");
    const { data, error } = await sb().functions.invoke("delete-account");
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Nie udało się usunąć konta.");

    await signOut();
    location.href = "index.html";
  } catch (e) {
    console.error(e);
    setStatus("Błąd.");
    setErr(e?.message || String(e));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadProfile();
  saveUsername?.addEventListener("click", handleUsernameSave);
  saveEmail?.addEventListener("click", handleEmailSave);
  savePass?.addEventListener("click", handlePassSave);
  deleteAccount?.addEventListener("click", handleDeleteAccount);
});
