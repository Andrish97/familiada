import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccessJwt, resetAccessJwksCache, accessConfig } from '../../cloudflare/maintenance-worker/src/lib/admin/access-jwt.js';
import { isAdminAuthorized, adminWriteAllowed } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-auth.js';
import { handleAdminApi } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-api.js';
import { ACCESS_ENV, ACCESS_AUD, signAccessJwt, withJwks } from './helpers/accessJwt.js';

const fetchImpl = withJwks();

test('Access JWT: poprawny podpis, aud, iss i exp przechodzą', async () => {
  resetAccessJwksCache();
  const res = await verifyAccessJwt(await signAccessJwt(), ACCESS_ENV, { fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.payload.email, 'admin@example.com');
});

test('Access JWT: brak konfiguracji = odmowa (bez fallbacku)', async () => {
  const token = await signAccessJwt();
  assert.equal(accessConfig({}), null);
  assert.equal((await verifyAccessJwt(token, {}, { fetchImpl })).reason, 'access_not_configured');
  assert.equal((await verifyAccessJwt(token, { CF_ACCESS_TEAM_DOMAIN: ACCESS_ENV.CF_ACCESS_TEAM_DOMAIN }, { fetchImpl })).ok, false);
});

test('Access JWT: odrzuca zły podpis, aud, iss, wygasły, alg none i śmieci', async () => {
  resetAccessJwksCache();
  const cases = [
    [await signAccessJwt({}, { wrongKey: true }), 'bad_signature'],
    [await signAccessJwt({ aud: ['inna-aplikacja'] }), 'bad_audience'],
    [await signAccessJwt({ iss: 'https://evil.cloudflareaccess.com' }), 'bad_issuer'],
    [await signAccessJwt({ exp: Math.floor(Date.now() / 1000) - 3600 }), 'expired'],
    [await signAccessJwt({ nbf: Math.floor(Date.now() / 1000) + 3600 }), 'not_yet_valid'],
    [await signAccessJwt({}, { header: { alg: 'none' } }), 'bad_alg'],
    [await signAccessJwt({}, { header: { kid: 'nieznany' } }), 'unknown_key'],
    ['unit', 'malformed'],
    ['a.b.c', 'malformed'],
  ];
  for (const [token, reason] of cases) {
    const res = await verifyAccessJwt(token, ACCESS_ENV, { fetchImpl });
    assert.equal(res.ok, false, reason);
    assert.equal(res.reason, reason);
  }
});

test('Access JWT: aud jako tekst i lista AUD w env', async () => {
  resetAccessJwksCache();
  const env = { ...ACCESS_ENV, CF_ACCESS_AUD: `inna, ${ACCESS_AUD}` };
  assert.equal((await verifyAccessJwt(await signAccessJwt({ aud: ACCESS_AUD }), env, { fetchImpl })).ok, true);
});

test('isAdminAuthorized: sam nagłówek tożsamości lub atrapa tokenu nie wystarcza', async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = withJwks();
  try {
    resetAccessJwksCache();
    const url = 'https://admin.familiada.online/_admin_api/me';
    assert.equal(await isAdminAuthorized(new Request(url, { headers: { 'Cf-Access-Authenticated-User-Email': 'a@b.c' } }), ACCESS_ENV), false);
    assert.equal(await isAdminAuthorized(new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': 'unit' } }), ACCESS_ENV), false);
    assert.equal(await isAdminAuthorized(new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': await signAccessJwt() } }), {}), false);
    assert.equal(await isAdminAuthorized(new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': await signAccessJwt() } }), ACCESS_ENV), true);
    const me = await handleAdminApi(new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': await signAccessJwt() } }), ACCESS_ENV);
    assert.equal(me.status, 200);
  } finally { globalThis.fetch = prev; }
});

test('CSRF: zmiany tylko z Origin panelu i jako JSON', async () => {
  const u = (p) => new URL(`https://admin.familiada.online${p}`);
  const req = (p, method, headers) => new Request(u(p), { method, headers });
  const ok = { Origin: 'https://admin.familiada.online', 'Content-Type': 'application/json' };
  assert.equal(adminWriteAllowed(req('/_admin_api/state', 'GET', {}), u('/_admin_api/state')), true);
  assert.equal(adminWriteAllowed(req('/_admin_api/state', 'POST', ok), u('/_admin_api/state')), true);
  assert.equal(adminWriteAllowed(req('/_admin_api/state', 'POST', { 'Content-Type': 'application/json' }), u('/_admin_api/state')), false);
  assert.equal(adminWriteAllowed(req('/_admin_api/state', 'POST', { ...ok, Origin: 'https://evil.example' }), u('/_admin_api/state')), false);
  assert.equal(adminWriteAllowed(req('/_admin_api/off', 'POST', { Origin: ok.Origin, 'Content-Type': 'text/plain' }), u('/_admin_api/off')), false);
  assert.equal(adminWriteAllowed(req('/_admin_api/off', 'POST', { Origin: ok.Origin }), u('/_admin_api/off')), false);
  const mp = { Origin: ok.Origin, 'Content-Type': 'multipart/form-data; boundary=x' };
  assert.equal(adminWriteAllowed(req('/_admin_api/attachments/upload', 'POST', mp), u('/_admin_api/attachments/upload')), true);
  assert.equal(adminWriteAllowed(req('/_admin_api/messages/send', 'POST', mp), u('/_admin_api/messages/send')), false);
  const blocked = await handleAdminApi(req('/_admin_api/off', 'POST', { Origin: 'https://evil.example', 'Content-Type': 'application/json' }), ACCESS_ENV);
  assert.equal(blocked.status, 403);
});
