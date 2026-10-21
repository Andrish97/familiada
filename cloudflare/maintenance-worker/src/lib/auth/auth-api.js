// src/lib/auth/auth-api.js -- logowanie i reset hasła po nazwie użytkownika,
// stan adresu e-mail przy rejestracji (audyt E24: B7, B8, N5).
//
// Nazwa -> e-mail rozwiązywana tylko tutaj (klucz serwisowy); przeglądarka
// dostaje sesję albo wynik, nigdy adres e-mail innego konta. Limity w KV
// (skróty SHA-256 adresu IP i loginu/e-maila).
import { json } from "../core/http.js";
import { supabaseRpc, normalizeRpcValue } from "../core/supabase.js";
import { sha256Hex, clientIp, limitReached, countAttempt, claimSlots } from "../core/rate-limit.js";

const SITE_ORIGIN = "https://www.familiada.online";
const LANGS = ["pl", "en", "uk"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

// Logowanie: liczone tylko nieudane próby (okno 15 min).
export const LOGIN_WINDOW_S = 15 * 60;
export const LOGIN_MAX_PER_LOGIN = 10;
export const LOGIN_MAX_PER_IP = 30;
// Reset hasła po nazwie (okno 1 h; baza ma jeszcze cooldown 1 h na adres).
const RESET_WINDOW_S = 3600;
const RESET_MAX_PER_LOGIN = 5;
const RESET_MAX_PER_IP = 10;
// Stan adresu przy rejestracji i ponowne wysłanie potwierdzenia (okno 1 h).
const STATUS_WINDOW_S = 3600;
export const STATUS_MAX_PER_EMAIL = 10;
export const STATUS_MAX_PER_IP = 30;
const RESEND_MAX_PER_EMAIL = 5;
const RESEND_MAX_PER_IP = 10;

function authConfig(env) {
  const baseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) return null;
  return { baseUrl, anonKey };
}

// Tylko JSON z własnej strony (żądanie z innej domeny wymaga preflightu,
// którego Worker nie przepuszcza).
async function readAuthBody(request) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const origin = request.headers.get("Origin");
  if (origin && origin !== SITE_ORIGIN) return json({ ok: false, error: "forbidden" }, 403);
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "invalid_content_type" }, 415);
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_body" }, 400);
    return body;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
}

function normLogin(value) {
  return String(value || "").trim();
}

function captchaMeta(body) {
  const token = typeof body.captcha_token === "string" ? body.captcha_token.trim() : "";
  return token && token.length <= 4096 ? { captcha_token: token } : undefined;
}

async function resolveLogin(env, login) {
  if (login.includes("@")) {
    const email = login.toLowerCase();
    return EMAIL_RE.test(email) ? email : "";
  }
  if (!USERNAME_RE.test(login)) return "";
  const rpc = await supabaseRpc(env, "profile_login_to_email", { p_login: login });
  if (!rpc.ok) throw new Error("resolve_failed");
  const email = String(normalizeRpcValue(rpc.data) || "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : "";
}

async function goTrue(cfg, path, body) {
  const res = await fetch(`${cfg.baseUrl}/auth/v1${path}`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, ok: res.ok, data };
}

// Klasyfikacja błędu GoTrue bez przekazywania jego treści do klienta.
export function classifyGoTrueError(status, data) {
  const code = String(data?.error_code || data?.code || data?.error || "").toLowerCase();
  const msg = String(data?.msg || data?.error_description || data?.message || "").toLowerCase();
  if (status === 429 || code.includes("rate_limit")) return "rate_limited";
  if (code.includes("captcha") || msg.includes("captcha")) return "captcha_failed";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "email_not_confirmed";
  if (status >= 500 || !status) return "auth_unavailable";
  return "invalid_credentials";
}

const STATUS_BY_ERROR = { rate_limited: 429, captcha_failed: 400, email_not_confirmed: 400, auth_unavailable: 502, invalid_credentials: 400 };

export async function handleAuthLogin(request, env) {
  const body = await readAuthBody(request);
  if (body instanceof Response) return body;
  const cfg = authConfig(env);
  if (!cfg) return json({ ok: false, error: "auth_unavailable" }, 503);

  const login = normLogin(body.login);
  const password = typeof body.password === "string" ? body.password : "";
  if (!login || login.length > 320 || !password || password.length > 1024) {
    return json({ ok: false, error: "invalid_credentials" }, 400);
  }

  const ipKey = `auth_login_ip:${await sha256Hex(clientIp(request))}`;
  const idKey = `auth_login_id:${await sha256Hex(login.toLowerCase())}`;
  if (await limitReached(env, ipKey, LOGIN_MAX_PER_IP) || await limitReached(env, idKey, LOGIN_MAX_PER_LOGIN)) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }
  const failed = async () => {
    await countAttempt(env, ipKey, LOGIN_WINDOW_S);
    await countAttempt(env, idKey, LOGIN_WINDOW_S);
    return json({ ok: false, error: "invalid_credentials" }, 400);
  };

  let email;
  try { email = await resolveLogin(env, login); } catch { return json({ ok: false, error: "auth_unavailable" }, 502); }
  // Nieznana nazwa i złe hasło dają tę samą odpowiedź.
  if (!email) return failed();

  const meta = captchaMeta(body);
  let res;
  try {
    res = await goTrue(cfg, "/token?grant_type=password", { email, password, ...(meta ? { gotrue_meta_security: meta } : {}) });
  } catch {
    return json({ ok: false, error: "auth_unavailable" }, 502);
  }
  if (res.ok && res.data?.access_token && res.data?.refresh_token) {
    const s = res.data;
    return json({ ok: true, session: {
      access_token: s.access_token, refresh_token: s.refresh_token,
      expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type,
    } });
  }
  const error = res.ok ? "auth_unavailable" : classifyGoTrueError(res.status, res.data);
  if (error === "invalid_credentials") return failed();
  return json({ ok: false, error }, STATUS_BY_ERROR[error]);
}

export async function handleAuthReset(request, env) {
  const body = await readAuthBody(request);
  if (body instanceof Response) return body;
  const cfg = authConfig(env);
  if (!cfg) return json({ ok: false, error: "auth_unavailable" }, 503);

  const login = normLogin(body.login);
  if (!login || login.length > 320) return json({ ok: false, error: "unknown_user" }, 404);
  const lang = LANGS.includes(body.lang) ? body.lang : "pl";

  const allowed = await claimSlots(env, [
    { key: `auth_reset_ip:${await sha256Hex(clientIp(request))}`, max: RESET_MAX_PER_IP, windowS: RESET_WINDOW_S },
    { key: `auth_reset_id:${await sha256Hex(login.toLowerCase())}`, max: RESET_MAX_PER_LOGIN, windowS: RESET_WINDOW_S },
  ]);
  if (!allowed) return json({ ok: false, error: "rate_limited" }, 429);

  let email;
  try { email = await resolveLogin(env, login); } catch { return json({ ok: false, error: "auth_unavailable" }, 502); }
  // Nazwy użytkowników są publiczne (username_taken) -- adres e-mail nie.
  if (!email) return json({ ok: false, error: "unknown_user" }, 404);

  const reserve = await supabaseRpc(env, "mail_cooldown_email_reserve", { p_action_key: "auth:reset_password", p_email: email });
  if (!reserve.ok) return json({ ok: false, error: "auth_unavailable" }, 502);
  const row = Array.isArray(reserve.data) ? reserve.data[0] : reserve.data;
  const nextAllowedAt = row?.next_allowed_at || null;
  if (!row?.ok) return json({ ok: true, sent: false, next_allowed_at: nextAllowedAt });

  const redirect = new URL("/login/reset/", SITE_ORIGIN);
  redirect.searchParams.set("lang", lang);
  const meta = captchaMeta(body);
  let res;
  try {
    res = await goTrue(cfg, `/recover?redirect_to=${encodeURIComponent(redirect.toString())}`, { email, ...(meta ? { gotrue_meta_security: meta } : {}) });
  } catch {
    return json({ ok: false, error: "auth_unavailable" }, 502);
  }
  if (!res.ok) {
    const error = classifyGoTrueError(res.status, res.data);
    return json({ ok: false, error: error === "invalid_credentials" ? "auth_unavailable" : error }, STATUS_BY_ERROR[error] || 502);
  }
  return json({ ok: true, sent: true, next_allowed_at: nextAllowedAt });
}

function emailFrom(body) {
  const email = String(body.email || "").trim().toLowerCase();
  return email.length <= 320 && EMAIL_RE.test(email) ? email : "";
}

export async function handleAuthEmailStatus(request, env) {
  const body = await readAuthBody(request);
  if (body instanceof Response) return body;
  const email = emailFrom(body);
  if (!email) return json({ ok: false, error: "invalid_email" }, 400);
  const allowed = await claimSlots(env, [
    { key: `auth_status_ip:${await sha256Hex(clientIp(request))}`, max: STATUS_MAX_PER_IP, windowS: STATUS_WINDOW_S },
    { key: `auth_status_em:${await sha256Hex(email)}`, max: STATUS_MAX_PER_EMAIL, windowS: STATUS_WINDOW_S },
  ]);
  if (!allowed) return json({ ok: false, error: "rate_limited" }, 429);
  const rpc = await supabaseRpc(env, "email_get_status", { p_email: email });
  if (!rpc.ok) return json({ ok: false, error: "status_failed" }, 502);
  const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  const statusRaw = String(row?.status || "").toLowerCase();
  const status = ["confirmed", "pending"].includes(statusRaw) ? statusRaw : "none";
  const intent = status === "pending" && String(row?.intent || "").toLowerCase() === "guest_migrate" ? "guest_migrate" : "signup";
  return json({ ok: true, status, intent });
}

export async function handleAuthResendPrepare(request, env) {
  const body = await readAuthBody(request);
  if (body instanceof Response) return body;
  const email = emailFrom(body);
  if (!email) return json({ ok: false, error: "invalid_email" }, 400);
  const intent = body.intent === "guest_migrate" ? "guest_migrate" : "signup";
  const allowed = await claimSlots(env, [
    { key: `auth_resend_ip:${await sha256Hex(clientIp(request))}`, max: RESEND_MAX_PER_IP, windowS: STATUS_WINDOW_S },
    { key: `auth_resend_em:${await sha256Hex(email)}`, max: RESEND_MAX_PER_EMAIL, windowS: STATUS_WINDOW_S },
  ]);
  if (!allowed) return json({ ok: false, error: "rate_limited" }, 429);
  const rpc = await supabaseRpc(env, "email_resend_prepare", { p_email: email, p_intent: intent });
  if (!rpc.ok) return json({ ok: false, error: "prepare_failed" }, 502);
  const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  // Bez pola status: odpowiedź nie mówi, czy adres ma potwierdzone konto.
  return json({ ok: true, allowed: !!row?.ok, next_allowed_at: row?.nextallowedat || null });
}

export const AUTH_ROUTES = {
  "/_api/auth/login": handleAuthLogin,
  "/_api/auth/reset": handleAuthReset,
  "/_api/auth/email-status": handleAuthEmailStatus,
  "/_api/auth/resend-prepare": handleAuthResendPrepare,
};
