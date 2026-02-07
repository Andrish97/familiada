// js/pages/index.js
import { getUser, signIn, signUp, resetPassword } from "../core/auth.js";

const $ = (s) => document.querySelector(s);
const email = $("#email");
const pass = $("#pass");
const pass2 = $("#pass2");
const status = $("#status");
const err = $("#err");
const btnPrimary = $("#btnPrimary");
const btnToggle = $("#btnToggle");
const btnForgot = $("#btnForgot");

let mode = "login"; // login | register
const params = new URLSearchParams(location.search);
const nextTarget = params.get("next");
const nextTask = params.get("t");
const nextSub = params.get("s");

function buildNextUrl() {
  const url = new URL("polls-hub.html", location.href);
  if (nextTask) url.searchParams.set("t", nextTask);
  if (nextSub) url.searchParams.set("s", nextSub);
  return url.toString();
}

function setErr(m = "") { err.textContent = m; }
function setStatus(m = "") { status.textContent = m; }

function applyMode() {
  if (mode === "login") {
    pass2.style.display = "none";
    if (username) username.style.display = "none";
    btnPrimary.textContent = "Zaloguj";
    btnToggle.textContent = "Załóż konto";
    email.placeholder = "E-mail lub nazwa użytkownika";
  } else {
    pass2.style.display = "block";
    if (username) username.style.display = "block";
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
    if (nextTarget === "polls-hub") {
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

    try {
      if (mode === "register") {
        const mail = loginOrEmail;
        const un = (username?.value || "").trim();

        if (!mail || !mail.includes("@")) return setErr("Podaj poprawny e-mail.");
        if (!un) return setErr("Podaj nazwę użytkownika.");

        if (pass2.value !== pwd) return setErr("Hasła nie są takie same.");

        setStatus("Rejestruję…");
        const redirectTo = new URL("confirm.html", location.href).toString();
        await signUp(mail, pwd, redirectTo, un); // <-- UWAGA: 4-ty parametr
        setStatus("Sprawdź e-mail (link aktywacyjny).");
      } else {
        setStatus("Loguję…");
        await signIn(loginOrEmail, pwd); // <-- może być username
        if (nextTarget === "polls-hub") {
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
});
