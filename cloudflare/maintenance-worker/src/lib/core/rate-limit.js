// src/lib/core/rate-limit.js -- liczniki limitów w KV (okno stałe, TTL = okno).
// Klucze zawierają tylko skróty SHA-256 (adres IP, e-mail i login nie trafiają do KV).

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function readCount(env, key) {
  return Number(await env.MAINT_KV.get(key)) || 0;
}

// Czy limit jest już wyczerpany (bez zużywania próby).
export async function limitReached(env, key, max) {
  return (await readCount(env, key)) >= max;
}

// Zużywa jedną próbę; false = limit wyczerpany (próba nie jest liczona).
export async function claimSlot(env, key, max, windowS) {
  const count = await readCount(env, key);
  if (count >= max) return false;
  await env.MAINT_KV.put(key, String(count + 1), { expirationTtl: Math.max(60, windowS) });
  return true;
}

// Dolicza próbę bez sprawdzania (np. nieudane logowanie).
export async function countAttempt(env, key, windowS) {
  const count = await readCount(env, key);
  await env.MAINT_KV.put(key, String(count + 1), { expirationTtl: Math.max(60, windowS) });
}

// Kilka limitów naraz: najpierw sprawdzenie wszystkich, potem zużycie.
// Odmowa jednego nie zużywa pozostałych.
export async function claimSlots(env, limits) {
  for (const { key, max } of limits) {
    if (await limitReached(env, key, max)) return false;
  }
  for (const { key, windowS } of limits) await countAttempt(env, key, windowS);
  return true;
}
