import test from 'node:test';
import assert from 'node:assert/strict';
import { secretHandoff } from '../../cloudflare/maintenance-worker/src/lib/admin-secret-handoff.js';
const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
const now = Date.now();
const env = { ADMIN_HANDOFF_UNTIL: String(now + 60000), ADMIN_HANDOFF_PUBLIC_KEY: JSON.stringify(pub), ADMIN_HANDOFF_SECRET: 'a'.repeat(64), SUPABASE_SERVICE_ROLE_KEY: 'unit-role', GENERATE_GAME_SECRET: 'unit-generate', LEAD_FINDER_API_KEY: 'unit-lead', ADMIN_BYPASS_TOKEN: 'unit-bypass', NEVER_EXPORT: 'unit-excluded' };
const req = (secret = env.ADMIN_HANDOFF_SECRET) => new Request('https://www.familiada.online/_internal/admin-secret-handoff', { method: 'POST', headers: { 'X-Internal-Secret': secret } });
test('handoff: wyłączony bez konfiguracji, po wygaśnięciu lub przy zbyt długim oknie', async () => {
 for (const e of [{}, { ...env, ADMIN_HANDOFF_UNTIL: now - 1 }, { ...env, ADMIN_HANDOFF_UNTIL: now + 31 * 60000 }]) assert.equal((await secretHandoff(req(), e, now)).status, 404);
});
test('handoff: odmowa bez sekretu, ze złym sekretem, dla GET i bez wymaganych kluczy', async () => {
 for (const s of ['', 'b'.repeat(64)]) assert.equal((await secretHandoff(req(s), env, now)).status, 401);
 assert.equal((await secretHandoff(new Request(req().url), env, now)).status, 405);
 assert.equal((await secretHandoff(req(), { ...env, ADMIN_BYPASS_TOKEN: '' }, now)).status, 503);
});
test('handoff: szyfrowanie dla wskazanego odbiorcy, wyłącznie dozwolone klucze', async () => {
 const res = await secretHandoff(req(), env, now); assert.equal(res.status, 200); assert.equal(res.headers.get('Cache-Control'), 'no-store');
 const raw = await res.text(); for (const value of ['unit-role','unit-bypass','unit-excluded']) assert.ok(!raw.includes(value));
 const data = JSON.parse(raw);
 const key = await crypto.subtle.decrypt('RSA-OAEP', pair.privateKey, Buffer.from(data.key, 'base64'));
 const aes = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
 const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(data.iv, 'base64'), additionalData: new TextEncoder().encode('familiada-admin-migration-v1') }, aes, Buffer.from(data.data, 'base64'));
 const values = JSON.parse(new TextDecoder().decode(plain)); assert.equal(values.ADMIN_BYPASS_TOKEN, env.ADMIN_BYPASS_TOKEN); assert.equal(Object.keys(values).length, 4); assert.ok(!('NEVER_EXPORT' in values));
});
