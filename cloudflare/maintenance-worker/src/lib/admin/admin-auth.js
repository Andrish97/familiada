// src/lib/admin-auth.js -- admin bypass cookie + Cloudflare Access checks.
import { getCookie } from "../core/http.js";
import { verifyAccessJwt } from "./access-jwt.js";

export function hasAdminBypass(request, env) {
  const hostOnly = getCookie(request, "__Host-fml_admin");
  const allDomains = getCookie(request, "__Secure-fml_admin");
  const token = env.ADMIN_BYPASS_TOKEN;
  return Boolean(token && (hostOnly === token || allDomains === token));
}

export function accessJwtFromRequest(request) {
  return String(request.headers.get("Cf-Access-Jwt-Assertion") || "").trim();
}

// Jedyna warstwa uwierzytelnienia API panelu: podpisany token Cloudflare
// Access (sama obecność nagłówków nie wystarcza -- można je dopisać przy
// żądaniu omijającym Access, np. przez *.workers.dev).
export async function isAdminAuthorized(request, env) {
  const token = accessJwtFromRequest(request);
  if (!token) return false;
  const result = await verifyAccessJwt(token, env);
  return result.ok;
}

export const ADMIN_ORIGIN = "https://settings.familiada.online";

// Ochrona przed CSRF dla zmian (POST/PUT/PATCH/DELETE): żądanie musi przyjść
// z panelu (Origin) i nieść JSON. Wyjątek typu treści: wgrywanie załącznika
// (multipart/form-data) -- tam wystarcza zgodny Origin.
export function adminWriteAllowed(request, url) {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (request.headers.get("Origin") !== ADMIN_ORIGIN) return false;
  const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type === "application/json") return true;
  return url.pathname === "/_admin_api/attachments/upload" && type === "multipart/form-data";
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function setAdminBypassCookieForAllDomains(env) {
  // __Secure- pozwala na Domain=.familiada.online (shared for apex + www)
  return `__Secure-fml_admin=${env.ADMIN_BYPASS_TOKEN}; Path=/; Domain=familiada.online; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}

export function clearAdminBypassCookieForAllDomains() {
  return `__Secure-fml_admin=; Path=/; Domain=familiada.online; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}
