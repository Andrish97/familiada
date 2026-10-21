// src/lib/admin/access-jwt.js -- weryfikacja tokenu Cloudflare Access
// (nagłówek Cf-Access-Jwt-Assertion): RS256, klucze z JWKS zespołu,
// sprawdzenie aud/iss/exp/nbf. Bez konfiguracji (CF_ACCESS_TEAM_DOMAIN,
// CF_ACCESS_AUD) każde żądanie jest odrzucane.

const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_REFRESH_MIN_MS = 60 * 1000;
const CLOCK_LEEWAY_S = 60;

const jwksCache = new Map();

export function resetAccessJwksCache() {
  jwksCache.clear();
}

export function accessConfig(env) {
  const team = String(env?.CF_ACCESS_TEAM_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  const auds = String(env?.CF_ACCESS_AUD || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!team || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(team) || !auds.length) return null;
  return {
    issuer: `https://${team}`,
    certsUrl: `https://${team}/cdn-cgi/access/certs`,
    auds,
  };
}

function b64urlToBytes(s) {
  const norm = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJsonPart(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

async function fetchJwks(certsUrl, fetchImpl) {
  const res = await fetchImpl(certsUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`jwks_http_${res.status}`);
  const data = await res.json();
  const keys = new Map();
  for (const jwk of Array.isArray(data?.keys) ? data.keys : []) {
    if (!jwk || jwk.kty !== "RSA" || !jwk.kid || !jwk.n || !jwk.e) continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    keys.set(jwk.kid, key);
  }
  return keys;
}

async function getKey(cfg, kid, fetchImpl, nowMs) {
  let entry = jwksCache.get(cfg.certsUrl);
  const stale = !entry || nowMs - entry.fetchedAt > JWKS_TTL_MS;
  const unknownKid = entry && !entry.keys.has(kid) && nowMs - entry.fetchedAt > JWKS_REFRESH_MIN_MS;
  if (stale || unknownKid) {
    try {
      const keys = await fetchJwks(cfg.certsUrl, fetchImpl);
      entry = { keys, fetchedAt: nowMs };
      jwksCache.set(cfg.certsUrl, entry);
    } catch {
      if (!entry) return null;
    }
  }
  return entry?.keys.get(kid) || null;
}

// Zwraca { ok: true, payload } albo { ok: false, reason }.
export async function verifyAccessJwt(token, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const cfg = accessConfig(env);
  if (!cfg) return { ok: false, reason: "access_not_configured" };
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) return { ok: false, reason: "malformed" };

  let header;
  let payload;
  try {
    header = decodeJsonPart(parts[0]);
    payload = decodeJsonPart(parts[1]);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (header?.alg !== "RS256" || !header?.kid) return { ok: false, reason: "bad_alg" };

  const key = await getKey(cfg, String(header.kid), fetchImpl, now);
  if (!key) return { ok: false, reason: "unknown_key" };

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad_signature" };

  const nowS = Math.floor(now / 1000);
  if (payload?.iss !== cfg.issuer) return { ok: false, reason: "bad_issuer" };
  const tokenAud = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
  if (!tokenAud.some((a) => cfg.auds.includes(a))) return { ok: false, reason: "bad_audience" };
  if (typeof payload?.exp !== "number" || payload.exp + CLOCK_LEEWAY_S < nowS) return { ok: false, reason: "expired" };
  if (typeof payload?.nbf === "number" && payload.nbf - CLOCK_LEEWAY_S > nowS) return { ok: false, reason: "not_yet_valid" };
  if (typeof payload?.iat === "number" && payload.iat - CLOCK_LEEWAY_S > nowS) return { ok: false, reason: "issued_in_future" };
  return { ok: true, payload };
}
