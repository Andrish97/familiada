// src/lib/admin-auth.js -- admin bypass cookie + Cloudflare Access checks.
import { getCookie } from "./http.js";

export function hasAdminBypass(request, env) {
  const hostOnly = getCookie(request, "__Host-fml_admin");
  const allDomains = getCookie(request, "__Secure-fml_admin");
  const token = env.ADMIN_BYPASS_TOKEN;
  return Boolean(token && (hostOnly === token || allDomains === token));
}

export function hasAccessJwt(request) {
  return Boolean(
    request.headers.get("CF-Access-Jwt-Assertion") ||
      request.headers.get("Cf-Access-Jwt-Assertion")
  );
}

export function hasAccessUserIdentity(request) {
  return Boolean(
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
      request.headers.get("CF-Access-Authenticated-User-Email") ||
      request.headers.get("cf-access-authenticated-user-email")
  );
}

export async function isAdminAuthorized(request) {
  // Access is the only auth layer for settings admin API.
  return hasAccessUserIdentity(request) || hasAccessJwt(request);
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
