// Jednorazowe, szyfrowane przekazanie istniejących sekretów prywatnemu Workerowi.
// Wyłączone bez krótkiego okna i kluczy skonfigurowanych przez automat migracji.
const KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'GENERATE_GAME_SECRET', 'LEAD_FINDER_API_KEY', 'ADMIN_BYPASS_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
const REQUIRED = KEYS.slice(0, 4);
const AAD = new TextEncoder().encode('familiada-admin-migration-v1');
function sameSecret(a, b) {
  if (!/^[0-9a-f]{64}$/.test(a) || b.length !== a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
const reply = (body, status) => new Response(body, { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
export async function secretHandoff(request, env, now = Date.now()) {
  const until = Number(env.ADMIN_HANDOFF_UNTIL);
  if (!Number.isFinite(until) || until <= now || until > now + 30 * 60000 || !env.ADMIN_HANDOFF_PUBLIC_KEY || !env.ADMIN_HANDOFF_SECRET) return reply('{}', 404);
  if (request.method !== 'POST') return reply('{}', 405);
  if (!sameSecret(String(env.ADMIN_HANDOFF_SECRET), request.headers.get('X-Internal-Secret') || '')) return reply('{}', 401);
  if (REQUIRED.some(key => typeof env[key] !== 'string' || !env[key])) return reply('{}', 503);
  try {
    const pub = await crypto.subtle.importKey('jwk', JSON.parse(env.ADMIN_HANDOFF_PUBLIC_KEY), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const values = Object.fromEntries(KEYS.filter(key => typeof env[key] === 'string' && env[key]).map(key => [key, env[key]]));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, aes, new TextEncoder().encode(JSON.stringify(values)));
    const wrapped = await crypto.subtle.encrypt('RSA-OAEP', pub, await crypto.subtle.exportKey('raw', aes));
    return reply(JSON.stringify({ v: 1, key: b64(wrapped), iv: b64(iv), data: b64(ciphertext) }), 200);
  } catch { return reply('{}', 500); }
}
