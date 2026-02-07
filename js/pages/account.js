import { sb } from "../core/supabase.js";
import { requireAuth, validateUsername, signOut } from "../core/auth.js";

const status = document.getElementById("status");
const err = document.getElementById("err");

const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const pass1 = document.getElementById("pass1");
const pass2 = document.getElementById("pass2");
const deleteConfirm = document.getElementById("deleteConfirm");

const saveUsername = document.getElementById("saveUsername");
const saveEmail = document.getElementById("saveEmail");
const savePass = document.getElementById("savePass");
const deleteAccount = document.getElementById("deleteAccount");

function setStatus(m = "") { if (status) status.textContent = m; }
function setErr(m = "") { if (err) err.textContent = m; }

async function loadProfile() {
  const user = await requireAuth("index.html?setup=username");
  if (!user) return;
  usernameInput.value = user.username || "";
  emailInput.value = user.email || "";
  setStatus("Profil załadowany.");
}

async function handleUsernameSave() {
  setErr("");
  try {
    const username = validateUsername(usernameInput.value || "");
    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user) throw new Error("Brak aktywnej sesji.");

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

    const { data, error } = await sb().auth.updateUser({ email: mail });
    if (error) throw error;

    if (data?.user?.email?.toLowerCase() === mail) {
      const { error: profileError } = await sb()
        .from("profiles")
        .update({ email: mail })
        .eq("id", data.user.id);
      if (profileError) throw profileError;
    }

    setStatus("Zapisano zmianę e-maila. Sprawdź skrzynkę.");
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
    if (a.length < 6) throw new Error("Hasło musi mieć co najmniej 6 znaków.");
    if (a !== b) throw new Error("Hasła nie są takie same.");

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
    const confirm = String(deleteConfirm.value || "").trim().toUpperCase();
    if (confirm !== "USUŃ") throw new Error("Wpisz USUŃ, aby potwierdzić.");

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
