// js/core/auth.js
import { sb, buildSiteUrl } from "./supabase.js";
import { t, withLangParam } from "../../translation/translation.js";

function buildAuthRedirect(page, lang) {
  // page: "confirm.html" | "reset.html" lub "/confirm.html"
  const p = String(page || "").trim();
  const path = p.startsWith("/") ? p : `/${p}`;
  const url = new URL(buildSiteUrl(path)); // buildSiteUrl zwraca absolutny URL w Twoim projekcie
  const l = String(lang || "").trim().toLowerCase();
  if (l) url.searchParams.set("lang", l);
  return url.toString();
}

export function niceAuthError(e) {
  const msg = (e?.message || String(e || "")).trim();
  const low = msg.toLowerCase();

  // Most common Supabase / GoTrue messages we want to localize
  if (low.includes("email not confirmed")) return t("auth.emailNotConfirmed");
  if (low.includes("invalid login credentials")) return t("auth.invalidCredentials");

  // Rate limiting / spam protection (429 etc.)
  if (
    low.includes("for security purposes") ||
    low.includes("rate limit") ||
    low.includes("too many requests") ||
    low.includes("too many") && low.includes("requests") ||
    low.includes("status") && low.includes("429")
  ) {
    return t("auth.tooManyRequests");
  }

  // Password rules
  if (low.includes("new password should be different")) return t("auth.passwordMustDiffer");
  if (low.includes("password should be at least") || (low.includes("password") && low.includes("length"))) {
    return t("auth.passwordTooShort");
  }

  // Links / tokens
  if (
    low.includes("invalid or expired") ||
    (low.includes("token") && low.includes("expired")) ||
    (low.includes("otp") && low.includes("expired")) ||
    (low.includes("token") && low.includes("invalid"))
  ) {
    return t("auth.linkInvalidOrExpired");
  }

  // Registration duplicates
  if (low.includes("user already registered") || (low.includes("already") && low.includes("registered"))) {
    return t("auth.userAlreadyRegistered");
  }

  return msg || t("auth.loginFailed");
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

export async function resolveLoginToEmail(loginOrEmail) {
  return await loginToEmail(loginOrEmail);
}

export function validateUsername(un, { allowEmpty = false } = {}) {
  const v = String(un || "").trim();
  if (!v) {
    if (allowEmpty) return "";
    throw new Error(t("auth.enterUsername"));
  }
  if (v.length < 3) throw new Error(t("auth.usernameMin"));
  if (v.length > 20) throw new Error(t("auth.usernameMax"));
  if (!/^[a-zA-Z0-9_.-]+$/.test(v)) throw new Error(t("auth.usernameChars"));
  return v;
}

export function validatePassword(pwd) {
  const v = String(pwd || "");
  const hints = [];
  if (v.length < 8) hints.push(t("auth.passwordHintMin"));
  if (!/[a-z]/.test(v)) hints.push(t("auth.passwordHintLower"));
  if (!/[A-Z]/.test(v)) hints.push(t("auth.passwordHintUpper"));
  if (!/[0-9]/.test(v)) hints.push(t("auth.passwordHintNumber"));
  if (!/[^A-Za-z0-9]/.test(v)) hints.push(t("auth.passwordHintSpecial"));
  if (hints.length) {
    throw new Error(t("auth.passwordRules", { hints: hints.join(", ") }));
  }
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
    location.href = withLangParam(redirect);
    return null; // na wypadek, gdyby ktoś jednak kontynuował kod
  }

  const username = await fetchUsername(u);
  if (!username) {
    location.href = withLangParam("index.html?setup=username");
    return null;
  }
  return { ...u, username };
}

export async function signIn(login, password) {
  const email = await loginToEmail(login);
  if (!email) {
    if (String(login || "").includes("@")) throw new Error(t("auth.unknownEmail"));
    throw new Error(t("auth.unknownUsername"));
  }

  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(niceAuthError(error));

  const user = data.user;
  if (!user) throw new Error(t("auth.loginFailed"));

  if (!user.email_confirmed_at) {
    await sb().auth.signOut();
    throw new Error(t("auth.confirmEmailFirst"));
  }
  _unameCache = { userId: null, username: null, ts: 0 };
  return user;
}

export async function signUp(email, password, redirectTo, usernameInput, language) {
  const username = validateUsername(usernameInput, { allowEmpty: true });
  const userData = username ? { username } : null;

  // ✅ absolutny redirect + lang (bez withLangParam)
  const emailRedirectTo = redirectTo || buildAuthRedirect("confirm.html", language);

  const options = { emailRedirectTo };
  if (userData || language) {
    options.data = { ...(userData || {}) };
    if (language) options.data.language = language;
  }

  const { error } = await sb().auth.signUp({ email, password, options });
  if (error) throw new Error(niceAuthError(error));
}

export async function signOut() {
  await sb().auth.signOut();
  _unameCache = { userId: null, username: null, ts: 0 };
}

export async function resetPassword(loginOrEmail, redirectTo, language, resolvedEmail = null) {
  const email = (resolvedEmail || await loginToEmail(loginOrEmail))?.toLowerCase?.() || "";
  if (!email) throw new Error(t("index.errResetMissingLogin"));

  const resetRedirectTo = redirectTo || buildAuthRedirect("reset.html", language);

  const options = { redirectTo: resetRedirectTo };
  if (language) options.data = { language };

  const { error } = await sb().auth.resetPasswordForEmail(email, options);
  if (error) throw new Error(niceAuthError(error));

  return email; // ✅ ważne: index.js zapisze cooldown per konkretny email
}

export async function updateUserLanguage(language) {
  if (!language) return;
  try {
    const { data } = await sb().auth.getSession();
    if (!data?.session?.user) return;
    const { error } = await sb().auth.updateUser({ data: { language } });
    if (error) console.warn("[auth] updateUserLanguage failed:", error);
  } catch (e) {
    console.warn("[auth] updateUserLanguage failed:", e);
  }
}
