// js/pages/index.js
// Logika strony logowania -> zawsze do games.html

document.addEventListener("DOMContentLoaded", async () => {
  // jeśli zalogowany -> games.html
  try {
    const user = await window.ArcadeAuth?.getUser?.();
    if (user) {
      window.location.replace("games.html");
      return;
    }
  } catch (e) {
    console.error("[index] getUser error:", e);
  }

  const email = document.querySelector(".auth-email");
  const pass = document.querySelector(".auth-pass");
  const pass2 = document.querySelector(".auth-pass2");
  const status = document.querySelector(".auth-status");
  const error = document.querySelector(".auth-error");
  const btnLogin = document.querySelector(".auth-login");
  const btnRegister = document.querySelector(".auth-register");
  const btnGuest = document.querySelector(".auth-guest");
  const btnLogout = document.querySelector(".auth-logout");
  const btnForgot = document.querySelector(".auth-forgot");

  if (!window.ArcadeAuthUI?.initLoginPanel) {
    console.error("[index] Brak ArcadeAuthUI.initLoginPanel – sprawdź js/core/auth.js");
    if (status) status.textContent = "Błąd: system logowania jest niedostępny.";
    return;
  }

  ArcadeAuthUI.initLoginPanel({
    email,
    pass,
    pass2,
    status,
    error,
    btnLogin,
    btnRegister,
    btnGuest,
    btnLogout,
    btnForgot,

    onLoginSuccess() {
      window.location.replace("games.html");
    },

    onRegisterSuccess() {
      if (status) {
        status.textContent =
          "Sprawdź skrzynkę e-mail – wysłaliśmy link aktywacyjny do potwierdzenia konta.";
      }
    },

    onLogout() {
      window.location.reload();
    },

    onGuest() {
      // brak trybu gościa u Ciebie – ale jakbyś zostawił przycisk, to też kieruj na games
      window.location.replace("games.html");
    },
  });
});

// bfcache: jeśli wróci z pamięci i user jest zalogowany -> games.html
window.addEventListener("pageshow", async (event) => {
  if (!event.persisted) return;
  try {
    const user = await window.ArcadeAuth?.getUser?.();
    if (user) window.location.replace("games.html");
  } catch (e) {
    console.error("[index] pageshow getUser error:", e);
  }
});
