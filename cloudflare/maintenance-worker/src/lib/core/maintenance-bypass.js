// Wspólny podpis ciasteczka przerwy. API panelu jest w prywatnym Workerze.
import { getCookie } from "./http.js";

// Ciasteczko obejścia przerwy (audyt E24, Ś7): zamiast stałego sekretu
// podpisany token "v1.<ważność ms>.<HMAC-SHA256 base64url>". Kluczem HMAC
// jest sekret ADMIN_BYPASS_TOKEN (nie trafia już do przeglądarki). Ważność
// 12 h; weryfikacja podpisu stałoczasowa (crypto.subtle.verify).
export const ADMIN_BYPASS_TTL_SECONDS = 12 * 60 * 60;
const BYPASS_PREFIX = "v1";
const BYPASS_CONTEXT = "familijna-admin-bypass";

function bytesToB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(value) {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function bypassKey(secret, usage) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

const bypassMessage = (exp) => new TextEncoder().encode(`${BYPASS_CONTEXT}.${BYPASS_PREFIX}.${exp}`);

export async function createAdminBypassToken(env, now = Date.now()) {
  const secret = String(env.ADMIN_BYPASS_TOKEN || "");
  if (!secret) return null;
  const exp = now + ADMIN_BYPASS_TTL_SECONDS * 1000;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await bypassKey(secret, "sign"), bypassMessage(exp)));
  return `${BYPASS_PREFIX}.${exp}.${bytesToB64url(sig)}`;
}

export async function verifyAdminBypassToken(token, env, now = Date.now()) {
  const secret = String(env.ADMIN_BYPASS_TOKEN || "");
  if (!secret || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== BYPASS_PREFIX || !/^\d{1,15}$/.test(parts[1])) return false;
  const exp = Number(parts[1]);
  // Wygasły albo z ważnością dłuższą niż wydawana (zegar z zapasem 5 min).
  if (exp <= now || exp > now + ADMIN_BYPASS_TTL_SECONDS * 1000 + 5 * 60 * 1000) return false;
  let sig;
  try { sig = b64urlToBytes(parts[2]); } catch { return false; }
  if (sig.length !== 32) return false;
  try {
    return await crypto.subtle.verify("HMAC", await bypassKey(secret, "verify"), sig, bypassMessage(exp));
  } catch {
    return false;
  }
}

export async function hasAdminBypass(request, env) {
  const hostOnly = getCookie(request, "__Host-fml_admin");
  const allDomains = getCookie(request, "__Secure-fml_admin");
  for (const value of [allDomains, hostOnly]) {
    if (value && await verifyAdminBypassToken(value, env)) return true;
  }
  return false;
}

