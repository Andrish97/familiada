// js/core/auth.js
import { sb } from "./supabase.js";

function niceAuthError(e) {
  const msg = e?.message || String(e);
  const low = msg.toLowerCase();

  if (low.includes("email not confirmed")) return "Potwierdź e-mail (link w skrzynce).";
  if (low.includes("invalid login credentials")) return "Zły e-mail lub hasło.";
  return msg;
}

async function loginToEmail(login) {
  const v = String(login || "").trim();
  if (!v) return "";

  // jeśli wygląda jak email - zwracamy od razu
  if (v.includes("@")) return v.toLowerCase();

  // username -> email przez RPC
  const { data, error } = await sb().rpc("profile_login_to_email", { p_login: v });
  if (error) throw new Error(niceAuthError(error));

  return String(data || "").trim().toLowerCase();
}

function validateUsername(un) {
  const v = String(un || "").trim();
  if (!v) throw new Error("Podaj nazwę użytkownika.");
  if (v.length < 3) throw new Error("Nazwa użytkownika: min. 3 znaki.");
  if (v.length > 20) throw new Error("Nazwa użytkownika: max. 20 znaków.");
  if (!/^[a-zA-Z0-9_.-]+$/.test(v)) throw new Error("Dozwolone znaki: litery, cyfry, _ . -");
  return v;
}

export async function getUser() {
  try {
    const { data, error } = await sb().auth.getUser();
    if (error) return null;
    return data.user || null;
  } catch {
    return null;
  }
}

export async function requireAuth(redirect = "index.html") {
  const u = await getUser();
  if (!u) location.href = redirect;
  return u;
}

export async function signIn(login, password) {
  const email = await loginToEmail(login);
  if (!email) {
    if (String(login || "").includes("@")) throw new Error("Nie znam takiego e-maila lub konto nie istnieje.");
    throw new Error("Nie znam takiej nazwy użytkownika.");
  }

  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(niceAuthError(error));

  const user = data.user;
  if (!user) throw new Error("Nie udało się zalogować.");

  if (!user.email_confirmed_at) {
    await sb().auth.signOut();
    throw new Error("Najpierw potwierdź e-mail.");
  }

  return user;
}

export async function signUp(email, password, redirectTo, username) {
  const un = validateUsername(username);

  const { error } = await sb().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: { username: un }, // <-- zapis w user_metadata
    },
  });
  if (error) throw new Error(niceAuthError(error));
}

export async function signOut() {
  await sb().auth.signOut();
}

export async function resetPassword(loginOrEmail, redirectTo) {
  const email = await loginToEmail(loginOrEmail);
  if (!email) throw new Error("Podaj e-mail lub nazwę użytkownika.");

  const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(niceAuthError(error));
}
