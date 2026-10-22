import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContactAppend } from '../../cloudflare/maintenance-worker/src/lib/email/contact.js';

function kv() { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
const env = () => ({ SUPABASE_URL: 'https://api.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'svc', TURNSTILE_SECRET_KEY: 'real-secret', MAINT_KV: kv() });
const req = (body, ip = '1.2.3.4') => new Request('https://www.familiada.online/_api/contact/append', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ captcha_token: 'ok-token', ...body }) });

function mockDb({ report = { id: 'r1', ticket_number: 'TICKET-2026-0001' }, first = { direction: 'inbound', from_email: 'owner@example.com', to_email: null } } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'challenges.cloudflare.com') return new Response(JSON.stringify({ success: init.body.get('response') === 'ok-token', hostname: 'www.familiada.online' }));
    calls.push(u.pathname);
    const ok = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/rest/v1/reports') return ok(report ? [report] : []);
    if (u.pathname === '/rest/v1/messages') return ok(first ? [first] : []);
    if (u.pathname === '/rest/v1/rpc/save_inbound_message') return ok([{ id: 'm1', report_id: 'r1', ticket_number: 'TICKET-2026-0001' }]);
    throw new Error('unexpected ' + u.pathname);
  };
  return calls;
}

test('contact/append: zapis tylko dla adresu właściciela zgłoszenia', async () => {
  const prev = globalThis.fetch;
  try {
    let calls = mockDb();
    const okRes = await handleContactAppend(req({ email: 'Owner@Example.com', ticket: '2026-0001', message: 'dalszy ciąg' }), env());
    assert.equal(okRes.status, 200);
    assert.ok(calls.includes('/rest/v1/rpc/save_inbound_message'));

    calls = mockDb();
    const other = await handleContactAppend(req({ email: 'intruz@example.com', ticket: 'TICKET-2026-0001', message: 'spam spam' }), env());
    assert.equal(other.status, 404);
    assert.ok(!calls.includes('/rest/v1/rpc/save_inbound_message'));

    calls = mockDb({ report: null });
    const missing = await handleContactAppend(req({ email: 'owner@example.com', ticket: 'TICKET-9999-9999', message: 'cokolwiek' }), env());
    assert.equal(missing.status, 404);
    assert.ok(!calls.includes('/rest/v1/rpc/save_inbound_message'));

    calls = mockDb({ first: { direction: 'outbound', from_email: null, to_email: 'klient@example.com' } });
    assert.equal((await handleContactAppend(req({ email: 'klient@example.com', ticket: 'TICKET-2026-0001', message: 'odpowiedź' }), env())).status, 200);
  } finally { globalThis.fetch = prev; }
});

test('contact/append: limit na adres e-mail (KV)', async () => {
  const prev = globalThis.fetch;
  try {
    mockDb();
    const e = env();
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await handleContactAppend(req({ email: 'owner@example.com', ticket: 'TICKET-2026-0001', message: 'wiadomość ' + i }), e)).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  } finally { globalThis.fetch = prev; }
});
