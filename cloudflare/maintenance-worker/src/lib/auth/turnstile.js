// src/lib/auth/turnstile.js -- weryfikacja tokenu Cloudflare Turnstile po
// stronie Workera (audyt E24, P2). Klucz tajny: sekret TURNSTILE_SECRET_KEY;
// bez niego odmowa (fail closed).
//
// Testy e2e (ważny podpisany nagłówek X-E2E-Token, ten sam co obejście na
// /login): strona dostaje testowy sitekey Cloudflare, więc token weryfikujemy
// oficjalnym testowym kluczem tajnym, który przyjmuje tokeny testowe. Zwykłe
// żądania zawsze idą przez prawdziwy klucz.
import { authorizeE2EApi } from "../e2e/e2e-api.js";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const ALLOWED_HOSTNAMES = ["www.familiada.online", "familiada.online", "settings.familiada.online"];

// { ok: true } albo { ok: false, error: "captcha_failed" | "captcha_unavailable" }
export async function verifyTurnstile(request, env, token) {
  const e2e = await authorizeE2EApi(request, env);
  const secret = e2e ? TURNSTILE_TEST_SECRET : String(env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) return { ok: false, error: "captcha_unavailable" };
  const value = typeof token === "string" ? token.trim() : "";
  if (!value || value.length > 2048) return { ok: false, error: "captcha_failed" };

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", value);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  let result;
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
    result = await res.json();
  } catch {
    return { ok: false, error: "captcha_unavailable" };
  }
  if (result?.success !== true) return { ok: false, error: "captcha_failed" };
  if (!e2e && !ALLOWED_HOSTNAMES.includes(String(result.hostname || ""))) return { ok: false, error: "captcha_failed" };
  return { ok: true };
}

export const CAPTCHA_STATUS = { captcha_failed: 400, captcha_unavailable: 503 };
