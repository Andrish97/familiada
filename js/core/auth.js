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

let _unameCache = { userId: null, username: null, ts: 0 };

async function fetchUsername(user) {
  if (!user?.id) return null;

  // cache ~2 min (żeby nie pytać DB na każdej stronie/odświeżeniu)
  const now = Date.now();
  if (_unameCache.userId === user.id && _unameCache.username && (now - _unameCache.ts) < 120_000) {
    return _unameCache.username;
  }

  // 1) profiles (źródło prawdy)
  try {
    const { data, error } = await sb()
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (!error && data?.username) {
      _unameCache = { userId: user.id, username: data.username, ts: now };
      return data.username;
    }
  } catch {}

  // 2) fallback: user_metadata (np. świeża rejestracja)
  const un = String(user?.user_metadata?.username || "").trim();
  if (un) {
    _unameCache = { userId: user.id, username: un, ts: now };
    return un;
  }

  return null;
}

async function enrichUser(u) {
  if (!u) return null;
  const username = await fetchUsername(u);
  return { ...u, username };
}

export async function getUser() {
  try {
    const { data, error } = await sb().auth.getUser();
    if (error) return null;
    const u = data.user || null;
    return await enrichUser(u);
  } catch {
    return null;
  }
}

export async function requireAuth(redirect = "index.html") {
  const u = await getUser();
  if (!u) {
    location.href = redirect;
    return null; // na wypadek, gdyby ktoś jednak kontynuował kod
  }

  const username = await fetchUsername(u);
  return { ...u, username };
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
  _unameCache = { userId: null, username: null, ts: 0 };
  return user;
}

export async function signUp(email, password, redirectTo, usernameInput) {
  const un = validateUsername(usernameInput);

  const username = (un || "").trim();
  if (!username) throw new Error("Podaj nazwę użytkownika.");
  
  const { error } = await sb().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: { username }
    },
  });
  if (error) throw new Error(niceAuthError(error));
}

export async function signOut() {
  await sb().auth.signOut();
  _unameCache = { userId: null, username: null, ts: 0 };
}

export async function resetPassword(loginOrEmail, redirectTo) {
  const email = await loginToEmail(loginOrEmail);
  if (!email) throw new Error("Podaj e-mail lub nazwę użytkownika.");

  const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(niceAuthError(error));
}
