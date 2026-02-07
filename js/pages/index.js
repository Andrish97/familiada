// js/pages/index.js
import { getUser, signIn, signUp, resetPassword, validateUsername } from "../core/auth.js";
import { sb } from "../core/supabase.js";

const $ = (s) => document.querySelector(s);
const email = $("#email");
const pass = $("#pass");
const pass2 = $("#pass2");
const status = $("#status");
const err = $("#err");
const btnPrimary = $("#btnPrimary");
const btnToggle = $("#btnToggle");
const btnForgot = $("#btnForgot");
const loginCard = $("#loginCard");
const setupCard = $("#setupCard");
const usernameFirst = $("#usernameFirst");
const usernameErr = $("#usernameErr");
const btnUsernameSave = $("#btnUsernameSave");

let mode = "login"; // login | register
const params = new URLSearchParams(location.search);
const nextTarget = params.get("next");
const nextTask = params.get("t");
const nextSub = params.get("s");
const setup = params.get("setup");

function buildNextUrl() {
  const url = new URL("polls-hub.html", location.href);
  if (nextTask) url.searchParams.set("t", nextTask);
  if (nextSub) url.searchParams.set("s", nextSub);
  return url.toString();
}

function setErr(m = "") { err.textContent = m; }
function setStatus(m = "") { status.textContent = m; }
function setUsernameErr(m = "") { if (usernameErr) usernameErr.textContent = m; }

function getPendingEmailChange() {
  try {
    const raw = localStorage.getItem("pendingEmailChange");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingEmailChange() {
  localStorage.removeItem("pendingEmailChange");
}

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
  if (data?.id) throw new Error("Ta nazwa użytkownika jest już zajęta.");
}

async function saveUsername() {
  setUsernameErr("");
  try {
    const username = validateUsername(usernameFirst?.value || "");
    const { data: userData, error: userError } = await sb().auth.getUser();
    if (userError || !userData?.user) throw new Error("Brak aktywnej sesji.");
    await ensureUsernameAvailable(username, userData.user.id);
    const { error } = await sb()
      .from("profiles")
      .update({ username })
      .eq("id", userData.user.id);
    if (error) throw error;
    await sb().auth.updateUser({ data: { username } });
    closeUsernameSetup();
    location.href = "builder.html";
  } catch (e) {
    console.error(e);
    setUsernameErr(e?.message || String(e));
  }
}

function applyMode() {
  if (mode === "login") {
    pass2.style.display = "none";
    btnPrimary.textContent = "Zaloguj";
    btnToggle.textContent = "Załóż konto";
    email.placeholder = "E-mail lub nazwa użytkownika";
  } else {
    pass2.style.display = "block";
    btnPrimary.textContent = "Zarejestruj";
    btnToggle.textContent = "Mam konto";
    email.placeholder = "E-mail";
  }
  setErr("");
}

document.addEventListener("DOMContentLoaded", async () => {
  applyMode();
  setStatus("Sprawdzam sesję…");

  const u = await getUser();
  if (u) {
    if (!u.username || setup === "username") {
      openUsernameSetup();
    } else if (nextTarget === "polls-hub") {
      location.href = buildNextUrl();
    } else {
      location.href = "builder.html";
    }
    return;
  }
  setStatus("Niezalogowany.");

  btnToggle.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    applyMode();
  });

  btnPrimary.addEventListener("click", async () => {
    setErr("");
    const loginOrEmail = email.value.trim();
    const pwd = pass.value;

    if (!loginOrEmail || !pwd) return setErr("Podaj e-mail/nazwę użytkownika i hasło.");
    if (loginOrEmail.includes("@")) {
      const pending = getPendingEmailChange();
      if (pending?.old && String(pending.old).toLowerCase() === loginOrEmail.toLowerCase()) {
        return setErr("Zmieniałeś adres e-mail. Zaloguj się nowym adresem.");
      }
    }

    try {
      if (mode === "register") {
        const mail = loginOrEmail;

        if (!mail || !mail.includes("@")) return setErr("Podaj poprawny e-mail.");

        if (pass2.value !== pwd) return setErr("Hasła nie są takie same.");

        setStatus("Rejestruję…");
        const redirectTo = new URL("confirm.html", location.href).toString();
        await signUp(mail, pwd, redirectTo);
        setStatus("Sprawdź e-mail (link aktywacyjny).");
      } else {
        setStatus("Loguję…");
        await signIn(loginOrEmail, pwd); // <-- może być username
        clearPendingEmailChange();
        const authed = await getUser();
        if (!authed?.username) {
          openUsernameSetup();
        } else if (nextTarget === "polls-hub") {
          location.href = buildNextUrl();
        } else {
          location.href = "builder.html";
        }
      }
    } catch (e) {
      console.error(e);
      setStatus("Błąd.");
      setErr(e?.message || String(e));
    }
  });

  btnForgot.addEventListener("click", async () => {
    setErr("");
    const loginOrEmail = email.value.trim();
    if (!loginOrEmail) return setErr("Podaj e-mail lub nazwę użytkownika do resetu.");

    try {
      setStatus("Wysyłam link resetu…");
      const redirectTo = new URL("reset.html", location.href).toString();
      await resetPassword(loginOrEmail, redirectTo);
      setStatus("Wysłano link resetu hasła.");
    } catch (e) {
      console.error(e);
      setStatus("Błąd.");
      setErr(e?.message || String(e));
    }
  });

  btnUsernameSave?.addEventListener("click", saveUsername);
  usernameFirst?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveUsername();
  });
});
