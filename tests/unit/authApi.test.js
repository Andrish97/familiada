import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAuthLogin, handleAuthReset, handleAuthEmailStatus, handleAuthResendPrepare, classifyGoTrueError,
  LOGIN_MAX_PER_LOGIN, STATUS_MAX_PER_EMAIL } from '../../cloudflare/maintenance-worker/src/lib/auth/auth-api.js';
import { handleContactSubmit, SUBMIT_MAX_PER_IP } from '../../cloudflare/maintenance-worker/src/lib/email/contact.js';

function kv() { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
const env = () => ({ SUPABASE_URL: 'https://api.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', MAINT_KV: kv() });
const req = (path, body, { ip = '1.2.3.4', origin = 'https://www.familiada.online', type = 'application/json' } = {}) =>
  new Request('https://www.familiada.online' + path, { method: 'POST', headers: { 'Content-Type': type, 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

// Baza: alicja -> alicja@example.com; hasło "dobre". GoTrue: token / recover.
function mockBackend() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, search: u.search, body, headers: Object.fromEntries(new Headers(init.headers)) });
    if (u.pathname === '/rest/v1/rpc/profile_login_to_email') return ok(body.p_login.toLowerCase() === 'alicja' ? 'alicja@example.com' : null);
    if (u.pathname === '/rest/v1/rpc/mail_cooldown_email_reserve') return ok([{ ok: true, next_allowed_at: '2030-01-01T00:00:00Z' }]);
    if (u.pathname === '/rest/v1/rpc/email_get_status') return ok([{ status: body.p_email === 'jest@example.com' ? 'confirmed' : 'none', intent: 'signup' }]);
    if (u.pathname === '/rest/v1/rpc/email_resend_prepare') return ok([{ ok: true, nextallowedat: '2030-01-01T00:00:00Z', status: 'pending', intent: 'signup' }]);
    if (u.pathname === '/rest/v1/rpc/save_form_message') return ok([{ ok: true, ticket_number: 'TICKET-1', message_id: null }]);
    if (u.pathname === '/rest/v1/mail_queue') return ok([]);
    if (u.pathname === '/auth/v1/token') {
      if (body.email === 'alicja@example.com' && body.password === 'dobre') {
        return ok({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, expires_at: 1, token_type: 'bearer', user: { email: 'alicja@example.com' } });
      }
      return ok({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (u.pathname === '/auth/v1/recover') return ok({});
    throw new Error('unexpected ' + u.pathname);
  };
  return calls;
}

test('auth/login: nazwa -> sesja, bez adresu e-mail w odpowiedzi; GoTrue kluczem anon z captcha', async () => {
  const prev = globalThis.fetch;
  try {
    const calls = mockBackend();
    const res = await handleAuthLogin(req('/_api/auth/login', { login: 'Alicja', password: 'dobre', captcha_token: 'tok' }), env());
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('@'), 'odpowiedź nie zawiera e-maila');
    assert.deepEqual(JSON.parse(text).session.refresh_token, 'rt');
    const token = calls.find(c => c.path === '/auth/v1/token');
    assert.equal(token.search, '?grant_type=password');
    assert.equal(token.headers.authorization, 'Bearer anon');
    assert.deepEqual(token.body.gotrue_meta_security, { captcha_token: 'tok' });
  } finally { globalThis.fetch = prev; }
});

test('auth/login: nieznana nazwa i złe hasło dają identyczną odpowiedź; limit nieudanych prób', async () => {
  const prev = globalThis.fetch;
  try {
    mockBackend();
    const e = env();
    const unknown = await handleAuthLogin(req('/_api/auth/login', { login: 'nikt', password: 'x' }), e);
    const wrong = await handleAuthLogin(req('/_api/auth/login', { login: 'alicja', password: 'złe' }), env());
    assert.equal(unknown.status, wrong.status);
    assert.deepEqual(await unknown.json(), await wrong.json());
    const e2 = env();
    const statuses = [];
    for (let i = 0; i < LOGIN_MAX_PER_LOGIN + 1; i++) statuses.push((await handleAuthLogin(req('/_api/auth/login', { login: 'alicja', password: 'złe' }), e2)).status);
    assert.equal(statuses.at(-1), 429);
    assert.equal(statuses.filter(s => s === 400).length, LOGIN_MAX_PER_LOGIN);
    // poprawne hasło też czeka na koniec okna
    assert.equal((await handleAuthLogin(req('/_api/auth/login', { login: 'alicja', password: 'dobre' }), e2)).status, 429);
    assert.ok([...e2.MAINT_KV.m.keys()].every(k => !k.includes('alicja') && !k.includes('1.2.3.4')), 'KV bez jawnych identyfikatorów');
  } finally { globalThis.fetch = prev; }
});

test('auth/login: tylko JSON z własnej strony', async () => {
  const prev = globalThis.fetch;
  try {
    mockBackend();
    assert.equal((await handleAuthLogin(req('/_api/auth/login', { login: 'alicja', password: 'dobre' }, { origin: 'https://evil.example' }), env())).status, 403);
    assert.equal((await handleAuthLogin(req('/_api/auth/login', { login: 'alicja', password: 'dobre' }, { type: 'text/plain' }), env())).status, 415);
    const get = new Request('https://www.familiada.online/_api/auth/login');
    assert.equal((await handleAuthLogin(get, env())).status, 405);
  } finally { globalThis.fetch = prev; }
});

test('classifyGoTrueError: captcha, niepotwierdzony e-mail, limit, awaria', () => {
  assert.equal(classifyGoTrueError(400, { error_code: 'captcha_failed' }), 'captcha_failed');
  assert.equal(classifyGoTrueError(400, { error_description: 'Email not confirmed' }), 'email_not_confirmed');
  assert.equal(classifyGoTrueError(429, {}), 'rate_limited');
  assert.equal(classifyGoTrueError(500, {}), 'auth_unavailable');
  assert.equal(classifyGoTrueError(400, { error: 'invalid_grant' }), 'invalid_credentials');
});

test('auth/reset: nazwa -> cooldown + /recover z adresem resetu; e-mail nie wraca do klienta', async () => {
  const prev = globalThis.fetch;
  try {
    const calls = mockBackend();
    const res = await handleAuthReset(req('/_api/auth/reset', { login: 'alicja', lang: 'en' }), env());
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('@'));
    assert.equal(JSON.parse(text).sent, true);
    const recover = calls.find(c => c.path === '/auth/v1/recover');
    assert.equal(new URLSearchParams(recover.search).get('redirect_to'), 'https://www.familiada.online/login/reset/?lang=en');
    assert.equal(recover.body.email, 'alicja@example.com');
    assert.equal(calls.find(c => c.path.endsWith('mail_cooldown_email_reserve')).body.p_action_key, 'auth:reset_password');
    assert.equal((await handleAuthReset(req('/_api/auth/reset', { login: 'nikt' }), env())).status, 404);
  } finally { globalThis.fetch = prev; }
});

test('auth/email-status i resend-prepare: limity na adres, odpowiedź bez stanu konta w resend', async () => {
  const prev = globalThis.fetch;
  try {
    mockBackend();
    const e = env();
    const first = await handleAuthEmailStatus(req('/_api/auth/email-status', { email: 'Jest@Example.com' }), e);
    assert.deepEqual(await first.json(), { ok: true, status: 'confirmed', intent: 'signup' });
    let last;
    for (let i = 1; i <= STATUS_MAX_PER_EMAIL; i++) last = await handleAuthEmailStatus(req('/_api/auth/email-status', { email: 'jest@example.com' }, { ip: '9.9.9.' + i }), e);
    assert.equal(last.status, 429);
    const resend = await (await handleAuthResendPrepare(req('/_api/auth/resend-prepare', { email: 'a@example.com', intent: 'signup' }), env())).json();
    assert.deepEqual(Object.keys(resend).sort(), ['allowed', 'next_allowed_at', 'ok']);
    assert.equal((await handleAuthEmailStatus(req('/_api/auth/email-status', { email: 'zly' }), env())).status, 400);
  } finally { globalThis.fetch = prev; }
});

test('contact: limit na IP i łączny (KV) przed zapisem zgłoszenia', async () => {
  const prev = globalThis.fetch;
  try {
    const calls = mockBackend();
    const e = env();
    const statuses = [];
    for (let i = 0; i <= SUBMIT_MAX_PER_IP; i++) {
      statuses.push((await handleContactSubmit(req('/_api/contact', { email: 'a@example.com', subject: 'S', message: 'Treść ' + i }), e)).status);
    }
    assert.equal(statuses.at(-1), 429);
    assert.equal(calls.filter(c => c.path.endsWith('save_form_message')).length, SUBMIT_MAX_PER_IP);
    e.MAINT_KV.m.set('contact_submit_global', '100');
    assert.equal((await handleContactSubmit(req('/_api/contact', { email: 'b@example.com', subject: 'S', message: 'Treść' }, { ip: '5.5.5.5' }), e)).status, 429);
  } finally { globalThis.fetch = prev; }
});

test('Worker: trasy /_api/auth/* przed bramką; przy przerwie technicznej 503 bez obejścia', async () => {
  const { default: worker } = await import('../../cloudflare/maintenance-worker/src/index.js');
  const { setStateCache } = await import('../../cloudflare/maintenance-worker/src/lib/core/state.js');
  const prev = globalThis.fetch;
  try {
    const calls = mockBackend();
    setStateCache({ enabled: false, mode: 'off' });
    const ctx = { waitUntil() {} };
    const res = await worker.fetch(req('/_api/auth/login', { login: 'alicja', password: 'dobre' }), env(), ctx);
    assert.equal(res.status, 200);
    assert.ok(calls.some(c => c.path === '/auth/v1/token'));
    setStateCache({ enabled: true, mode: 'full' });
    const blocked = await worker.fetch(req('/_api/auth/email-status', { email: 'a@example.com' }), env(), ctx);
    assert.equal(blocked.status, 503);
  } finally { globalThis.fetch = prev; setStateCache({ enabled: false, mode: 'off' }); }
});
