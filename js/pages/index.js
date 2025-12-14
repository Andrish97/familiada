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

function setErr(m = "") { err.textContent = m; }
function setStatus(m = "") { status.textContent = m; }

function applyMode() {
  if (mode === "login") {
    pass2.style.display = "none";
    btnPrimary.textContent = "Zaloguj";
    btnToggle.textContent = "Załóż konto";
  } else {
    pass2.style.display = "block";
    btnPrimary.textContent = "Zarejestruj";
    btnToggle.textContent = "Mam konto";
  }
  setErr("");
}

document.addEventListener("DOMContentLoaded", async () => {
  applyMode();
  setStatus("Sprawdzam sesję…");

  const u = await getUser();
  if (u) {
    location.href = "builder.html";
    return;
  }
  setStatus("Niezalogowany.");

  btnToggle.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    applyMode();
  });

  btnPrimary.addEventListener("click", async () => {
    setErr("");
    const mail = email.value.trim();
    const pwd = pass.value;

    if (!mail || !pwd) return setErr("Podaj e-mail i hasło.");

    try {
      if (mode === "register") {
        if (pass2.value !== pwd) return setErr("Hasła nie są takie same.");
        setStatus("Rejestruję…");
        const redirectTo = new URL("confirm.html", location.href).toString();
        await signUp(mail, pwd, redirectTo);
        setStatus("Sprawdź e-mail (link aktywacyjny).");
      } else {
        setStatus("Loguję…");
        await signIn(mail, pwd);
        location.href = "builder.html";
      }
    } catch (e) {
      console.error(e);
      setStatus("Błąd.");
      setErr(e?.message || String(e));
    }
  });

  btnForgot.addEventListener("click", async () => {
    setErr("");
    const mail = email.value.trim();
    if (!mail) return setErr("Podaj e-mail do resetu.");

    try {
      setStatus("Wysyłam link resetu…");
      const redirectTo = new URL("reset.html", location.href).toString();
      await resetPassword(mail, redirectTo);
      setStatus("Wysłano link resetu hasła.");
    } catch (e) {
      console.error(e);
      setStatus("Błąd.");
      setErr(e?.message || String(e));
    }
  });
});
