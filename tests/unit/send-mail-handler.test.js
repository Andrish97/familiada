import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { md5Hex } from '../../supabase/functions/_shared/md5.js';
import { parseNotificationItem, parseMailLang, prepareNotificationRow } from '../../supabase/functions/_shared/notification-send.js';
const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const source = stripTypeScriptTypes(read('supabase/functions/send-mail/index.ts'))
  .replace(/^import .*;\n/gm, '')
  .replace(/Deno.env.get\(([^)]*)\)!/g, 'Deno.env.get($1)');

const OWNER = '00000000-0000-4000-8000-0000000000aa';
const RECIPIENT = '00000000-0000-4000-8000-0000000000bb';
const BASE = '00000000-0000-4000-8000-0000000000cc';
const TOKEN = '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';

// Minimalny klient zapytań (select/eq/is/gt/order/limit/maybeSingle, insert().select()).
function fakeService(state) {
  const tableRows = name => state.tables[name] || [];
  return {
    rpc: async (fn, args) => ({ data: state.rpc[fn] ? state.rpc[fn](args) : [], error: null }),
    from: name => {
      const filters = [];
      const api = {
        select: () => api, order: () => api, limit: () => api,
        eq: (c, v) => { filters.push(r => r[c] === v); return api; },
        is: (c, v) => { filters.push(r => (r[c] ?? null) === v); return api; },
        gt: (c, v) => { filters.push(r => r[c] > v); return api; },
        maybeSingle: async () => ({ data: (name === 'mail_settings' ? [{ id: 1, batch_max: state.batchMax }] : tableRows(name)).filter(r => filters.every(f => f(r)))[0] ?? null, error: null }),
        insert: rows => {
          state.rows = Array.isArray(rows) ? rows : [...state.rows, rows];
          return { select: async () => ({ data: state.inserted ?? (Array.isArray(rows) ? rows.map(r => ({ to_email: r.to_email })) : [{ id: 'q' }]), error: state.error }) };
        },
      };
      return api;
    },
  };
}

function handler() {
  const state = { inserted: [], error: null, batchMax: 100, rows: [], rpc: {}, tables: {
    profiles: [{ id: 'test-owner', is_guest: false, username: 'nadawca' }, { id: OWNER, is_guest: false, username: 'nadawca' }, { id: 'guest-owner', is_guest: true }],
  } };
  const users = {
    'valid-test-token': { id: 'test-owner', email: 'owner@example.com' },
    'owner-token': { id: OWNER, email: 'owner@example.com' },
    'guest-token': { id: 'guest-owner', is_anonymous: true },
    'guest-profile-token': { id: 'guest-owner' },
  };
  const service = fakeService(state);
  const anonymous = { auth: { getUser: async token => users[token] ? { data: { user: users[token] } } : { data: {}, error: new Error('Invalid token') } } };
  const context = vm.createContext({ Response, Request, Date, JSON, String, Number, Math, Array, Object, Uint8Array, TextEncoder, crypto: webcrypto,
    Deno: { env: { get: key => key } }, createClient: (_url, key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? service : anonymous,
    serve: fn => { state.handler = fn; },
    md5Hex, parseNotificationItem, parseMailLang, prepareNotificationRow });
  vm.runInContext(source, context);
  state.request = async (body, { token = 'valid-test-token', method = 'POST', raw = false } = {}) => {
    const request = new Request('https://example.com/functions/v1/send-mail', { method, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(method === 'POST' ? { body: raw ? body : JSON.stringify(body) } : {}) });
    const response = await state.handler(request);
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  return state;
}
test('send-mail: odrzuca HTML i adres od klienta (dawny tryb), nieautoryzowane i błędne żądania; OPTIONS', async () => {
  const app = handler();
  const legacy = { to: 'test8@familiada.online', subject: 'Test', html: '<a href="https://www.familiada.online/go/?f=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa">Test</a>', cooldownActionKey: 'friend:invite', cooldownTargetKey: 'email:test8@familiada.online' };
  for (const body of [legacy, { items: [legacy] }]) {
    const res = await app.request(body);
    assert.equal(res.status, 400); assert.equal(res.body.error, 'invalid_notification_request');
  }
  assert.equal(app.rows.length, 0);
  for (const token of ['', 'invalid-test-token']) assert.equal((await app.request({ lang: 'pl', items: [] }, { token })).status, 401);
  for (const raw of ['', '{']) assert.equal((await app.request(raw, { raw: true })).status, 400);
  for (const body of [null, 14, "body", [], {}]) assert.equal((await app.request(body)).status, 400);
  assert.equal((await app.request(null, { method: 'OPTIONS', token: '' })).status, 204);
});

test('send-mail: limit partii i cooldown bazy per element', async () => {
  const app = handler(); app.batchMax = 1; app.inserted = undefined;
  const T2 = '1f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';
  app.tables.mail_notification_allocations = [TOKEN, T2].map(source_token => ({ owner_id: OWNER, source_kind: 'friend', source_token, consumed_at: null, revoked_at: null,
    enqueue_before: '2999-01-01T00:00:00Z', to_email: 'f@example.com', recipient_id: RECIPIENT, snapshot: { resource: {} }, copy_offer_id: null }));
  const res = await app.request({ lang: 'pl', items: [{ action: 'friend:invite', token: TOKEN }, { action: 'friend:invite', token: T2 }] }, { token: 'owner-token' });
  assert.equal(res.status, 200); assert.equal(res.body.queued, 1);
  assert.equal(res.body.results[1].error, 'batch_limit');
  app.batchMax = 100; app.error = { message: 'cooldown_active: baseline' };
  const cooldown = await app.request({ lang: 'pl', items: [{ action: 'friend:invite', token: TOKEN }] }, { token: 'owner-token' });
  assert.equal(cooldown.status, 429); assert.equal(cooldown.body.error, 'cooldown');
  app.error = { message: 'Database error' };
  assert.equal((await app.request({ lang: 'pl', items: [{ action: 'friend:invite', token: TOKEN }] }, { token: 'owner-token' })).status, 500);
});

test('send-mail: goście (anonimowi i z profilem gościa) nie wysyłają żadnych maili', async () => {
  const app = handler();
  for (const token of ['guest-token', 'guest-profile-token']) {
    const res = await app.request({ lang: 'pl', items: [{ action: 'base:share', token: TOKEN }] }, { token });
    assert.equal(res.status, 403); assert.equal(res.body.error, 'guest_forbidden');
  }
  assert.equal(app.rows.length, 0);
});

test('send-mail (szablony): odbiorca i treść z bazy, pola klienta ignorowane', async () => {
  const app = handler(); app.inserted = undefined;
  app.tables.mail_notification_allocations = [{ owner_id: OWNER, source_kind: 'base', source_token: TOKEN, consumed_at: null, revoked_at: null,
    enqueue_before: '2999-01-01T00:00:00Z', to_email: 'Odbiorca@Example.com', recipient_id: RECIPIENT,
    snapshot: { resource: { base_id: BASE, role: 'editor' } }, copy_offer_id: null }];
  app.tables.question_bases = [{ id: BASE, name: 'Baza testowa' }];
  const res = await app.request({ lang: 'en', items: [{ action: 'base:share', token: TOKEN, reminder: false, to: 'atak@example.com', html: '<script>x</script>', subject: 'X' }] }, { token: 'owner-token' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results, [{ token: TOKEN, ok: true, queued: true }]);
  const [row] = app.rows;
  assert.equal(row.to_email, 'odbiorca@example.com');
  assert.equal(row.created_by, OWNER);
  assert.equal(row.cooldown_action_key, 'base:share');
  assert.equal(row.cooldown_target_key, `pair:${OWNER}:${RECIPIENT}:base:${BASE}`);
  assert.deepEqual(row.meta, { notification_reference: { kind: 'base', token: TOKEN } });
  assert.equal(row.notification_source_kind, 'base'); assert.equal(row.notification_source_token, TOKEN);
  assert.ok(row.html.includes('Baza testowa') && row.html.includes(`/go/?b=${TOKEN}&amp;lang=en`) && !row.html.includes('<script>x'));
  assert.ok(row.subject.includes('Baza testowa'));
});

test('send-mail (szablony): brak przydziału = pominięte; zły język/akcja/token = 400', async () => {
  const app = handler();
  const skipped = await app.request({ lang: 'pl', items: [{ action: 'friend:invite', token: TOKEN }] }, { token: 'owner-token' });
  assert.equal(skipped.status, 200);
  assert.deepEqual(skipped.body.results, [{ token: TOKEN, ok: true, queued: false, skipped: true, reason: 'notifications_disabled' }]);
  assert.equal(app.rows.length, 0);
  for (const body of [{ lang: 'de', items: [{ action: 'friend:invite', token: TOKEN }] }, { lang: 'pl', items: [] },
    { lang: 'pl', items: [{ action: 'admin:compose', token: TOKEN }] }, { lang: 'pl', items: [{ action: 'friend:invite', token: 'x' }] },
    { lang: 'pl', items: [{ action: 'friend:invite', token: TOKEN, reminder: 'tak' }] }]) {
    assert.equal((await app.request(body, { token: 'owner-token' })).status, 400);
  }
});

test('send-mail (szablony): urządzenie bez konta -- klucz cooldownu z md5 adresu jak w RPC', async () => {
  const app = handler(); app.inserted = undefined;
  const GAME = '12345678-1234-4234-8234-123456789abc';
  app.tables.mail_notification_allocations = [{ owner_id: OWNER, source_kind: 'device', source_token: TOKEN, consumed_at: null, revoked_at: null,
    enqueue_before: '2999-01-01T00:00:00Z', to_email: 'gosc@example.com', recipient_id: null,
    snapshot: { resource: { game_id: GAME, device_type: 'host', session_id: 's' } }, copy_offer_id: null }];
  app.tables.games = [{ id: GAME, name: 'Gra' }];
  const res = await app.request({ lang: 'pl', items: [{ action: 'device:share', token: TOKEN }] }, { token: 'owner-token' });
  assert.equal(res.status, 200);
  const md5 = createHash('md5').update('gosc@example.com').digest('hex');
  assert.equal(app.rows[0].cooldown_target_key, `pair:${OWNER}:${md5}:device:host:game:${GAME}`);
  assert.deepEqual(app.rows[0].meta.notification_reference, { kind: 'device', token: TOKEN, device_type: 'host', game_id: GAME });
  assert.ok(app.rows[0].html.includes(`/go/?d=host&amp;id=${GAME}&amp;key=${TOKEN}&amp;lang=pl`));
});
