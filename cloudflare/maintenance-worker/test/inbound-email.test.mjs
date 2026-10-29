import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMimeParts, handleInboundEmail } from '../src/lib/email/inbound-email.js';

const fragment = '<div>Witam serdecznie,</div><div><br></div><div>Dziękujemy za wiadomość&nbsp;:)</div>';
function mime(type, body = fragment, extra = '') {
  return `From: sender@example.test\r\nTo: kontakt@familiada.online\r\nSubject: Reply\r\n${type ? `Content-Type: ${type}\r\n` : ''}${extra}\r\n${body}`;
}

test('single-part text/html keeps fragments, including quoted-printable and base64', () => {
  for (const [encoding, body] of [
    ['', fragment],
    ['quoted-printable', [...new TextEncoder().encode(fragment)].map(byte => `=${byte.toString(16).padStart(2, '0')}`).join('')],
    ['base64', Buffer.from(fragment).toString('base64')],
  ]) {
    const extra = encoding ? `Content-Transfer-Encoding: ${encoding}\r\n` : '';
    assert.deepEqual(extractMimeParts(mime('text/html; charset=utf-8', body, extra)), { text: '', html: fragment, attachments: [] });
  }
});

test('content type is read from headers: explicit plain text and body header examples remain text', () => {
  for (const body of [fragment, '<html><body>HTML example</body></html>', 'Content-Type: text/html\r\n<div>Example</div>']) {
    assert.deepEqual(extractMimeParts(mime('text/plain; charset=utf-8', body)), { text: body, html: '', attachments: [] });
  }
  const html = '<!doctype html><html><body>Mail</body></html>';
  assert.equal(extractMimeParts(mime(null, html)).html, html);
});

for (const multipart of [false, true]) test(`HTML-only ${multipart ? 'multipart' : 'single-part'} mail is saved with HTML and readable text`, async t => {
  const raw = multipart
    ? mime('multipart/alternative; boundary="part-boundary"', `--part-boundary\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${fragment}\r\n--part-boundary--\r\n`)
    : mime('text/html; charset=utf-8');
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ path: new URL(url).pathname, body: init.body && JSON.parse(init.body) });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  t.after(() => { globalThis.fetch = original; });
  await handleInboundEmail({
    from: 'sender@example.test', to: 'kontakt@familiada.online',
    headers: new Headers({ subject: 'Reply' }), raw: new Blob([raw]).stream(),
  }, { SUPABASE_URL: 'https://database.example.test', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key' });
  const saved = calls.filter(call => call.path === '/rest/v1/rpc/save_inbound_message');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].body.p_body_html, fragment);
  assert.equal(saved[0].body.p_body, 'Witam serdecznie, Dziękujemy za wiadomość :)');
});
