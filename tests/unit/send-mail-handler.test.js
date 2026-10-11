import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const resultModule = await import('data:text/javascript;base64,' + Buffer.from(read('supabase/functions/_shared/mail-queue-results.js')).toString('base64'));
const source = read('supabase/functions/send-mail/index.ts')
  .replace(/^import .*;\n/gm, '')
  .replaceAll(': string | null', '').replaceAll(': string', '').replaceAll(': any', '')
  .replace(/Deno.env.get\(([^)]*)\)!/g, 'Deno.env.get($1)');
function handler() {
  const state = { inserted: [], error: null, batchMax: 100, rows: [] };
  const service = { from: table => table === 'mail_settings'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { batch_max: state.batchMax } }) }) }) }
    : { insert: rows => { state.rows = rows; return { select: async () => ({ data: state.inserted, error: state.error }) }; } } };
  const anonymous = { auth: { getUser: async token => token === 'valid-test-token' ? { data: { user: { id: 'test-owner' } } } : { data: {}, error: new Error('Invalid token') } } };
  const context = vm.createContext({ Response, Request, Date, JSON, String, Number, Math, crypto: webcrypto,
    Deno: { env: { get: key => key } }, createClient: (_url, key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? service : anonymous,
    serve: fn => { state.handler = fn; }, mailQueueResult: resultModule.mailQueueResult });
  vm.runInContext(source, context);
  state.request = async (body, { token = 'valid-test-token', method = 'POST', raw = false } = {}) => {
    const request = new Request('https://example.com/functions/v1/send-mail', { method, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(method === 'POST' ? { body: raw ? body : JSON.stringify(body) } : {}) });
    const response = await state.handler(request);
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  return state;
}
const item = to => ({ to, subject: 'Test', html: '<p>Test</p>', cooldownActionKey: 'friend:invite', cooldownTargetKey: `email:${to}` });
test('full send-mail handler returns actual queued0/mixed/full results, keeping owner and policy in inserted rows', async () => {
  const app = handler();
  const body = { items: [item('test8@familiada.online'), item('test14@familiada.online')] };
  for (const inserted of [[], [{ to_email: body.items[1].to }], body.items.map(i => ({ to_email: i.to }))]) {
    app.inserted = inserted;
    const response = await app.request(body);
    assert.equal(response.status, 200); assert.equal(response.body.queued, inserted.length);
    assert.equal(response.body.results.filter(r => r.queued).length, inserted.length);
    assert.equal(response.body.results.filter(r => r.skipped).length, 2 - inserted.length);
    assert.equal(app.rows.length, 2);
    assert.ok(app.rows.every(row => row.created_by === 'test-owner' && row.cooldown_action_key === 'friend:invite'));
  }
});
test('full send-mail handler returns explicit batch overflow and current database cooldown failure', async () => {
  const app = handler(); app.batchMax = 1; app.inserted = [{ to_email: 'test8@familiada.online' }];
  const response = await app.request({ items: [item('test8@familiada.online'), item('test14@familiada.online')] });
  assert.equal(app.rows.length, 1); assert.equal(response.body.queued, 1);
  assert.equal(response.body.results[1].error, 'batch_limit');
  app.error = { message: 'cooldown_active' }; assert.equal((await app.request(item('test8@familiada.online'))).status, 429);
  app.error = { message: 'Database error' }; assert.equal((await app.request(item('test8@familiada.online'))).status, 500);
});
test('full send-mail handler rejects unauthorized, malformed, empty and missing-policy requests, permits OPTIONS', async () => {
  const app = handler();
  for (const token of ['', 'invalid-test-token']) assert.equal((await app.request(item('test8@familiada.online'), { token })).status, 401);
  for (const raw of ['', '{']) assert.equal((await app.request(raw, { raw: true })).status, 400);
  for (const body of [null, 14, "body", [], {}, { to: 'test8@familiada.online', subject: 'Test', html: '<p>Test</p>' }]) assert.equal((await app.request(body)).status, 400);
  assert.equal((await app.request(null, { method: 'OPTIONS', token: '' })).status, 204);
});
