// js/core/auth.js
import { sb, buildSiteUrl } from "./supabase.js";
import { t, withLangParam } from "../../translation/translation.js";

const GUEST_LOCAL_MARKER_KEY = "fam:guest:session_seen";

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
  // Goal: keep Supabase / GoTrue error *content*, but show it in UI language when we know how.
  // If we don't recognize the message, we return the original message (better than hiding details).
  const msg =
    (e?.message ||
      e?.error_description ||
      e?.description ||
      (typeof e === "string" ? e : "") ||
      String(e || "")).trim();

  if (!msg) return t("auth.loginFailed");

  const low = msg.toLowerCase();

  // 1) Very common auth messages (stable)
  if (low.includes("email not confirmed")) return t("auth.emailNotConfirmed");
  if (low.includes("invalid login credentials")) return t("auth.invalidCredentials");
  if (low.includes("anonymous sign-ins are disabled")) {
    return "Anonymous sign-ins are disabled. Enable Anonymous auth and CAPTCHA in Supabase Auth settings.";
  }

  // 2) "New password should be different from the old password."
  if (low.includes("new password should be different")) return t("auth.passwordMustDiffer");

  // 3) Password length (Supabase sometimes enforces min 6 even if app uses stronger rules)
  // Examples: "Password should be at least 6 characters."
  let m = low.match(/password\s+should\s+be\s+at\s+least\s+(\d+)\s+characters?/i);
  if (m && m[1]) return t("auth.passwordTooShortMin", { min: Number(m[1]) });

  // 4) Rate limit with seconds:
  // "For security purposes, you can only request this once every 60 seconds."
  m = low.match(/for security purposes[\s\S]*once every\s+(\d+)\s+seconds?/i);
  if (m && m[1]) return t("auth.errSecurityOnceEvery", { seconds: Number(m[1]) });

  // 5) Email rate limit:
  // "Email rate limit exceeded"
  if (low.includes("email rate limit exceeded")) return t("auth.errEmailRateLimitExceeded");

  // 6) Generic "Too many requests" (without seconds) - translate, but keep meaning
  if (low.includes("too many requests")) return t("auth.tooManyRequests");

  if (low.includes("captcha") && (low.includes("invalid") || low.includes("failed") || low.includes("required"))) {
    return t("index.captchaRequired");
  }

  // 7) Links / tokens
  if (
    low.includes("invalid or expired") ||
    (low.includes("token") && low.includes("expired")) ||
    (low.includes("otp") && low.includes("expired")) ||
    (low.includes("token") && low.includes("invalid")) ||
    low.includes("invalid otp")
  ) {
    return t("auth.linkInvalidOrExpired");
  }

  // 8) Registration duplicates
  if (low.includes("user already registered") || (low.includes("already") && low.includes("registered"))) {
    return t("auth.userAlreadyRegistered");
  }

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


function passwordRulesAllHints() {
  return [
    t("auth.passwordHintMin"),
    t("auth.passwordHintLower"),
    t("auth.passwordHintUpper"),
    t("auth.passwordHintNumber"),
    t("auth.passwordHintSpecial"),
  ];
}

/** Consistent password policy text to show in UI (index / reset / account). */
export function getPasswordRulesText() {
  return t("auth.passwordRules", { hints: passwordRulesAllHints().join(", ") });
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

  let isGuest = false;
  let guestExpiresAt = null;
  try {
    const { data, error } = await sb()
      .from("profiles")
      .select("is_guest,guest_expires_at")
      .eq("id", u.id)
      .maybeSingle();
    if (!error && data) {
      isGuest = !!data.is_guest;
      guestExpiresAt = data.guest_expires_at || null;
    }
  } catch {}

  return { ...u, username, is_guest: isGuest, guest_expires_at: guestExpiresAt };
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

export async function requireAuth(redirect = "login.html") {
  const u = await getUser();
  if (!u) {
    location.href = withLangParam(redirect);
    return null; // na wypadek, gdyby ktoś jednak kontynuował kod
  }

  // Guest TTL check + touch
  if (u?.is_guest) {
    try {
      const { data: expired } = await sb().rpc("guest_is_expired", { p_user_id: u.id });
      if (expired === true) {
        await sb().auth.signOut();
        location.href = withLangParam("login.html?guest_expired=1");
        return null;
      }
      await sb().rpc("guest_touch", { p_ttl_days: 5 });
    } catch {
      // fail-open: nie blokuj flow przy chwilowym błędzie RPC
    }
  }

  const username = await fetchUsername(u);
  if (!username) {
    location.href = withLangParam("login.html?setup=username");
    return null;
  }
  return { ...u, username };
}

export async function signInGuest(captchaToken = null) {
  const options = { data: { is_guest: true } };
  if (captchaToken) options.captchaToken = captchaToken;

  const { data, error } = await sb().auth.signInAnonymously({ options });
  if (error) throw new Error(niceAuthError(error));
  const user = data?.user || null;
  if (!user) throw new Error(t("auth.loginFailed"));
  try { localStorage.setItem(GUEST_LOCAL_MARKER_KEY, "1"); } catch {}
  return user;
}


export function hasGuestLocalMarker() {
  try { return localStorage.getItem(GUEST_LOCAL_MARKER_KEY) === "1"; } catch { return false; }
}

export function clearGuestLocalMarker() {
  try { localStorage.removeItem(GUEST_LOCAL_MARKER_KEY); } catch {}
}

export function guestAuthEntryUrl() {
  return withLangParam("login.html?force_auth=1");
}

export async function convertGuestToRegistered(email, password, language) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail || !mail.includes("@")) throw new Error(t("index.errInvalidEmail"));

  // Guest upgrade flow: attach email + password to the same anonymous account
  // and trigger email confirmation via updateUser(attributes, options).
  const payload = { email: mail, password, data: { is_guest: false, familiada_email_change_pending: mail } };
  if (language) payload.data.language = language;

  const confirmUrl = new URL(buildAuthRedirect("confirm.html", language));
  confirmUrl.searchParams.set("to", mail);

  const { data, error } = await sb().auth.updateUser(payload, { emailRedirectTo: confirmUrl.toString() });
  if (error) throw new Error(niceAuthError(error));

  const { error: convErr } = await sb().rpc("guest_convert_account", { p_email: mail });
  if (convErr) throw new Error(niceAuthError(convErr));

  const user = data?.user || null;
  if (user?.email_confirmed_at) clearGuestLocalMarker();
  return user;
}

export async function discardCurrentGuestAccount() {
  const { error } = await sb().rpc("guest_discard_current");
  if (error) throw new Error(niceAuthError(error));
  clearGuestLocalMarker();
}

export async function signIn(login, password, captchaToken = null) {
  const email = await loginToEmail(login);
  if (!email) {
    if (String(login || "").includes("@")) throw new Error(t("auth.unknownEmail"));
    throw new Error(t("auth.unknownUsername"));
  }

  const payload = { email, password };
  if (captchaToken) payload.options = { captchaToken };

  const { data, error } = await sb().auth.signInWithPassword(payload);
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

export async function signUp(email, password, redirectTo, usernameInput, language, captchaToken = null) {
  const username = validateUsername(usernameInput, { allowEmpty: true });
  const userData = username ? { username } : null;

  // ✅ absolutny redirect + lang (bez withLangParam)
  const emailRedirectTo = redirectTo || buildAuthRedirect("confirm.html", language);

  const options = { emailRedirectTo };
  if (userData || language) {
    options.data = { ...(userData || {}) };
    if (language) options.data.language = language;
  }
  if (captchaToken) options.captchaToken = captchaToken;

  const { error } = await sb().auth.signUp({ email, password, options });
  if (error) throw new Error(niceAuthError(error));
}

export async function signOut() {
  await sb().auth.signOut();
  _unameCache = { userId: null, username: null, ts: 0 };
  clearGuestLocalMarker();
}

export async function resetPassword(loginOrEmail, redirectTo, language, resolvedEmail = null) {
  const email = (resolvedEmail || await loginToEmail(loginOrEmail))?.toLowerCase?.() || "";
  if (!email) throw new Error(t("index.errResetMissingLogin"));

  const resetRedirectTo = redirectTo || buildAuthRedirect("reset.html", language);

  const options = { redirectTo: resetRedirectTo };
  if (language) options.data = { language };

  const { error } = await sb().auth.resetPasswordForEmail(email, options);
  if (error) throw new Error(niceAuthError(error));

  return email; // ✅ ważne: login.js zapisze cooldown per konkretny email
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
