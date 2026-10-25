// Audyt E24, paczka P1: proxy lead-findera (Ś2), podpisane ciasteczko obejścia
// przerwy (Ś7), nagłówki bezpieczeństwa stron (N3), dopinanie poczty do
// zgłoszeń tylko od adresu zgłoszenia (N6), sekret storage-cleanup (N4),
// podgląd maili bez skryptów (Ś6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { handleAdminApi } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-api.js';
import { leadFinderTarget } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-leads-api.js';
import {
  createAdminBypassToken, verifyAdminBypassToken, hasAdminBypass, ADMIN_BYPASS_TTL_SECONDS,
} from '../../cloudflare/maintenance-worker/src/lib/admin/admin-auth.js';
import { withSecurityHeaders } from '../../cloudflare/maintenance-worker/src/lib/core/security-headers.js';
import { ticketForSender } from '../../cloudflare/maintenance-worker/src/lib/email/inbound-email.js';
import { ACCESS_ENV, signAccessJwt, withJwks } from './helpers/accessJwt.js';
import { adminPanelSource } from "./helpers/admin-source.js";

const ROOT = new URL('../../', import.meta.url);
const ADMIN = 'https://admin.familiada.online';
const RUN = '0f1e2d3c-4b5a-4987-8654-3210fedcba98';

// ── Ś2 ────────────────────────────────────────────────────────────────────
test('Ś2: lista dozwolonych ścieżek lead-findera', () => {
  const q = new URLSearchParams();
  assert.deepEqual(leadFinderTarget('GET', 'search-runs/status', q), { action: 'status' });
  assert.deepEqual(leadFinderTarget('POST', 'search-runs', new URLSearchParams('target_count=70')), { action: 'start', target_count: 70 });
  assert.deepEqual(leadFinderTarget('POST', 'search-runs', new URLSearchParams('target_count=99999')), { action: 'start', target_count: 1000 });
  for (const action of ['pause', 'resume', 'cancel']) {
    assert.deepEqual(leadFinderTarget('POST', `search-runs/${RUN}/${action}`, q), { action, run_id: RUN });
  }
  assert.equal(leadFinderTarget('GET', 'search-runs', q), null);
  assert.equal(leadFinderTarget('POST', 'search-runs/status', q), null);
  assert.equal(leadFinderTarget('POST', `search-runs/${RUN}/delete`, q), null);
  assert.equal(leadFinderTarget('POST', 'search-runs/../../health/pause', q), null);
  assert.equal(leadFinderTarget('GET', 'health', q), null);
  // Przegląd kontaktów przez usługę wycofany (LF3).
  assert.equal(leadFinderTarget('POST', 'contacts-review', q), null);
});

test('Ś2: proxy dokleja klucz po stronie Workera; bez Access 401; stary punkt tokenu zniknął', async () => {
  const env = { ...ACCESS_ENV, LEAD_FINDER_API_KEY: 'klucz-lf', SUPABASE_URL: 'https://api.test', SUPABASE_SERVICE_ROLE_KEY: 'srk' };
  const prev = globalThis.fetch;
  const calls = [];
  globalThis.fetch = withJwks(async (url, init) => {
    const h = new Headers(init.headers);
    calls.push({ url: String(url), method: init.method, secret: h.get('X-Internal-Secret'), body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ status: 'idle', run_id: null }), { headers: { 'content-type': 'application/json' } });
  });
  try {
    const jwt = await signAccessJwt();
    const res = await handleAdminApi(new Request(`${ADMIN}/_admin_api/leads/search-runs/status`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), env);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'idle', run_id: null });
    // Przez funkcję Edge lead-finder (usługa tylko w sieci Dockera), klucz w X-Internal-Secret.
    assert.deepEqual(calls, [{ url: 'https://api.test/functions/v1/lead-finder', method: 'POST', secret: 'klucz-lf', body: { action: 'status' } }]);

    const start = await handleAdminApi(new Request(`${ADMIN}/_admin_api/leads/search-runs?target_count=5`, {
      method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': jwt, Origin: ADMIN, 'Content-Type': 'application/json' },
    }), env);
    assert.equal(start.status, 200);
    assert.deepEqual(calls[1].body, { action: 'start', target_count: 5 });
    assert.equal(calls[1].secret, 'klucz-lf');

    const anon = await handleAdminApi(new Request(`${ADMIN}/_admin_api/leads/search-runs/status`), env);
    assert.equal(anon.status, 401);
    const csrf = await handleAdminApi(new Request(`${ADMIN}/_admin_api/leads/search-runs?target_count=5`, {
      method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': jwt, Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    }), env);
    assert.equal(csrf.status, 403);
    const unknown = await handleAdminApi(new Request(`${ADMIN}/_admin_api/leads/health`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), env);
    assert.equal(unknown.status, 404);
    const token = await handleAdminApi(new Request(`${ADMIN}/_admin_api/config/lead-finder-token`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), env);
    assert.equal(token.status, 404);
    assert.doesNotMatch(await token.text(), /klucz-lf/);
    const noKey = await handleAdminApi(new Request(`${ADMIN}/_admin_api/leads/search-runs/status`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), { ...ACCESS_ENV });
    assert.equal(noKey.status, 503);
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = prev; }
});

test('Ś2: panel nie pobiera klucza ani nie woła leads.familiada.online', () => {
  const src = adminPanelSource();
  assert.doesNotMatch(src, /lead-finder-token/);
  assert.doesNotMatch(src, /leads\.familiada\.online/);
  assert.match(src, /adminFetch\(`\/leads\/\$\{path\}`/);
});

// ── Ś6 ────────────────────────────────────────────────────────────────────
test('Ś6: podglądy maili w panelu bez allow-scripts', () => {
  const src = adminPanelSource();
  assert.doesNotMatch(src, /allow-scripts/);
  assert.equal((src.match(/frame\.sandbox = MAIL_FRAME_SANDBOX;/g) || []).length, 6);
});

// ── Ś7 ────────────────────────────────────────────────────────────────────
const BYPASS_ENV = { ADMIN_BYPASS_TOKEN: 'stary-staly-sekret' };
const cookieReq = (cookie) => new Request('https://www.familiada.online/', { headers: { Cookie: cookie } });

test('Ś7: podpisany token obejścia z ważnością 12 h', async () => {
  const now = Date.now();
  const token = await createAdminBypassToken(BYPASS_ENV, now);
  assert.match(token, /^v1\.\d+\.[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(token, /stary-staly-sekret/);
  assert.equal(await verifyAdminBypassToken(token, BYPASS_ENV, now), true);
  assert.equal(await verifyAdminBypassToken(token, BYPASS_ENV, now + ADMIN_BYPASS_TTL_SECONDS * 1000 + 1), false);
  assert.equal(await verifyAdminBypassToken(token, { ADMIN_BYPASS_TOKEN: 'inny' }, now), false);
  assert.equal(await verifyAdminBypassToken(token, {}, now), false);
  const [v, exp, sig] = token.split('.');
  assert.equal(await verifyAdminBypassToken(`${v}.${Number(exp) + 3600000}.${sig}`, BYPASS_ENV, now), false);
  assert.equal(await verifyAdminBypassToken(`${v}.${exp}.${sig.slice(0, -2)}AA`, BYPASS_ENV, now), false);
  // Token „na zawsze” z poprawnym podpisem i tak odrzucony (ważność > 12 h).
  const far = now + 30 * 86400000;
  const { createHmac: h } = await import('node:crypto');
  const farSig = h('sha256', 'stary-staly-sekret').update(`familiada-admin-bypass.v1.${far}`).digest('base64url');
  assert.equal(await verifyAdminBypassToken(`v1.${far}.${farSig}`, BYPASS_ENV, now), false);
});

test('Ś7: stare ciasteczko z surowym sekretem nie działa, nowe działa', async () => {
  assert.equal(await hasAdminBypass(cookieReq('__Secure-fml_admin=stary-staly-sekret'), BYPASS_ENV), false);
  assert.equal(await hasAdminBypass(cookieReq('__Host-fml_admin=stary-staly-sekret'), BYPASS_ENV), false);
  const token = await createAdminBypassToken(BYPASS_ENV);
  assert.equal(await hasAdminBypass(cookieReq(`a=b; __Secure-fml_admin=${token}`), BYPASS_ENV), true);
  assert.equal(await hasAdminBypass(cookieReq(`__Secure-fml_admin=${token}`), {}), false);
});

test('Ś7: /_admin_api/bypass ustawia podpisany token na 12 h', async () => {
  const env = { ...ACCESS_ENV, ...BYPASS_ENV };
  const prev = globalThis.fetch;
  globalThis.fetch = withJwks();
  try {
    const res = await handleAdminApi(new Request(`${ADMIN}/_admin_api/bypass`, {
      method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': await signAccessJwt(), Origin: ADMIN, 'Content-Type': 'application/json' },
    }), env);
    assert.equal(res.status, 200);
    const cookie = res.headers.get('Set-Cookie');
    assert.match(cookie, /^__Secure-fml_admin=v1\.\d+\.[A-Za-z0-9_-]+; /);
    assert.match(cookie, /Max-Age=43200/);
    assert.match(cookie, /HttpOnly/);
    assert.doesNotMatch(cookie, /stary-staly-sekret/);
    const value = cookie.split(';')[0].split('=')[1];
    assert.equal(await hasAdminBypass(cookieReq(`__Secure-fml_admin=${value}`), env), true);
  } finally { globalThis.fetch = prev; }
});

// ── N3 ────────────────────────────────────────────────────────────────────
const html = (headers = {}) => new Response('<p>x</p>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });

test('N3: nagłówki bezpieczeństwa na stronach HTML naszych hostów', () => {
  for (const host of ['www.familiada.online', 'admin.familiada.online', 'nieznana.familiada.online']) {
    const res = withSecurityHeaders(new Request(`https://${host}/`), html());
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff', host);
    assert.equal(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
    const csp = res.headers.get('Content-Security-Policy');
    for (const directive of ["frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      assert.ok(csp.split('; ').includes(directive), directive);
    }
    assert.match(res.headers.get('Permissions-Policy'), /camera=\(self\)/);
    const ro = res.headers.get('Content-Security-Policy-Report-Only');
    assert.match(ro, /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net/);
    assert.match(ro, /connect-src [^;]*wss:\/\/api\.familiada\.online/);
    assert.match(ro, /object-src 'none'/);
    assert.equal(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert.equal(res.status, 200);
  }
});

test('N3: bez zmian dla usług przepuszczanych, nie-HTML; istniejąca CSP uzupełniona', () => {
  for (const host of ['api.familiada.online', 'panel.familiada.online', 'supabase.familiada.online', 'docker.familiada.online']) {
    assert.equal(withSecurityHeaders(new Request(`https://${host}/`), html()).headers.get('X-Frame-Options'), null, host);
  }
  const js = withSecurityHeaders(new Request('https://www.familiada.online/a.js'), new Response('1', { headers: { 'Content-Type': 'application/javascript' } }));
  assert.equal(js.headers.get('X-Frame-Options'), null);
  const redirect = withSecurityHeaders(new Request('https://familiada.online/'), Response.redirect('https://www.familiada.online/', 301));
  assert.equal(redirect.status, 301);
  const nf = withSecurityHeaders(new Request('https://www.familiada.online/x'), html({ 'Content-Security-Policy': "default-src 'self'" }));
  assert.match(nf.headers.get('Content-Security-Policy'), /^default-src 'self'; frame-ancestors 'self'/);
  const tools = withSecurityHeaders(new Request('https://admin.familiada.online/admin/tools/a.html'), html({ 'Content-Security-Policy': "frame-ancestors 'self'" }));
  assert.equal(tools.headers.get('Content-Security-Policy').split("frame-ancestors").length, 2);
});

test('N3: Worker dokłada nagłówki do strony z Pages', async () => {
  const { default: worker } = await import('../../cloudflare/maintenance-worker/src/index.js');
  const { setStateCache } = await import('../../cloudflare/maintenance-worker/src/lib/core/state.js');
  setStateCache({ enabled: false, mode: 'off' });
  const prev = globalThis.fetch;
  globalThis.fetch = async () => new Response('<p>Gry</p>', { headers: { 'Content-Type': 'text/html' } });
  try {
    const res = await worker.fetch(new Request('https://www.familiada.online/games/', { headers: { Accept: 'text/html' } }), {}, { waitUntil() {} });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.match(await res.text(), /Gry/);
  } finally { globalThis.fetch = prev; }
});

// ── N6 ────────────────────────────────────────────────────────────────────
function mockTicketDb(first) {
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const ok = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/rest/v1/reports') return ok([{ id: 'r1', ticket_number: 'TICKET-2026-0007' }]);
    if (u.pathname === '/rest/v1/messages') return ok([first]);
    throw new Error('unexpected ' + u.pathname);
  };
}

test('N6: mail z [TICKET-…] dopina się tylko od adresu zgłoszenia', async () => {
  const env = { SUPABASE_URL: 'https://api.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
  const prev = globalThis.fetch;
  try {
    mockTicketDb({ direction: 'inbound', from_email: 'owner@example.com', to_email: null });
    assert.equal(await ticketForSender(env, '2026-0007', 'Owner@Example.com'), 'TICKET-2026-0007');
    assert.equal(await ticketForSender(env, '2026-0007', 'intruz@example.com'), null);
    assert.equal(await ticketForSender(env, '2026-0007', ''), null);
    mockTicketDb({ direction: 'outbound', from_email: null, to_email: 'klient@example.com' });
    assert.equal(await ticketForSender(env, '2026-0007', 'klient@example.com'), 'TICKET-2026-0007');
    globalThis.fetch = async () => new Response('[]', { headers: { 'content-type': 'application/json' } });
    assert.equal(await ticketForSender(env, '2026-9999', 'owner@example.com'), null);
  } finally { globalThis.fetch = prev; }
});

// ── N4 ────────────────────────────────────────────────────────────────────
test('N4: storage-cleanup wymaga nagłówka pochodnego od MAIL_WORKER_SECRET (zgodny z bazą)', async () => {
  const fn = readFileSync(new URL('supabase/functions/storage-cleanup/index.ts', ROOT), 'utf8');
  assert.match(fn, /const CLEANUP_CONTEXT = "storage-cleanup";/);
  assert.match(fn, /x-internal-secret/);
  assert.doesNotMatch(fn, /Access-Control-Allow-Origin/);
  const sql = readFileSync(new URL('supabase/migrations/2026-10-21_452_storage_cleanup_internal_secret.sql', ROOT), 'utf8');
  assert.match(sql, /extensions\.hmac\('storage-cleanup', v_secret, 'sha256'\)/);
  // Ten sam wektor sprawdza tests/sql/security-p1-452-454.sql (pgcrypto).
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('storage-cleanup')));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(hex, '7d142014d30bcd1ef18534140dbd10c5bc144f64759a48205691ac44400f68a8');
  assert.equal(hex, createHmac('sha256', 'test-secret').update('storage-cleanup').digest('hex'));
});
