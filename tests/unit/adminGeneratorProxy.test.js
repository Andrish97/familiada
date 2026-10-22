import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminApi } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-api.js';
import { ACCESS_ENV, signAccessJwt, withJwks } from './helpers/accessJwt.js';

const URL_BASE = 'https://settings.familiada.online/_admin_api/generator/';
const env = { ...ACCESS_ENV, SUPABASE_URL: 'https://api.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'svc', GENERATE_GAME_SECRET: 'tajny' };
const post = async (action, body, extra = {}) => new Request(URL_BASE + action, {
  method: 'POST',
  headers: { 'Cf-Access-Jwt-Assertion': await signAccessJwt(), Origin: 'https://settings.familiada.online', 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

test('generator: Worker dokleja X-Internal-Secret i akcję z adresu', async () => {
  const prev = globalThis.fetch;
  const calls = [];
  globalThis.fetch = withJwks(async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify([{ id: 'g1' }]), { headers: { 'content-type': 'application/json' } });
  });
  try {
    const res = await handleAdminApi(await post('list-producer-games', { lang: 'pl', action: 'delete-game' }), env);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [{ id: 'g1' }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.example.invalid/functions/v1/generate-game');
    assert.equal(calls[0].headers.get('X-Internal-Secret'), 'tajny');
    assert.deepEqual(calls[0].body, { lang: 'pl', action: 'list-producer-games' });
  } finally { globalThis.fetch = prev; }
});

test('generator: bez admina 401, nieznana akcja 404, bez sekretu 503', async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = withJwks();
  try {
    const anon = new Request(URL_BASE + 'delete-game', { method: 'POST', headers: { Origin: 'https://settings.familiada.online', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await handleAdminApi(anon, env)).status, 401);
    assert.equal((await handleAdminApi(await post('drop-everything', {}), env)).status, 404);
    assert.equal((await handleAdminApi(await post('delete-game', { id: 'x' }), { ...env, GENERATE_GAME_SECRET: '' })).status, 503);
  } finally { globalThis.fetch = prev; }
});
