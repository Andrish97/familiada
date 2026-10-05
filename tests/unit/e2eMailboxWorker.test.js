import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// cloudflare/maintenance-worker/package.json ustawia "type": "module", więc
// ten plik i wszystko, co z niego importuje (src/lib/**), jest ladowane
// przez Node jako prawdziwe moduly ES z realnych sciezek plikowych --
// relatywne importy w index.js rozwiazuja sie normalnie. To testuje
// dokladnie ten sam plik, ktory buduje Wrangler (esbuild ignoruje
// package.json "type" i tak samo traktuje ten plik jako ESM).
const { default: worker } = await import("../../cloudflare/maintenance-worker/src/index.js");

const SECRET = "unit-test-e2e-secret";

test("Diagnostyka dostarczenia wymaga tokenu i adresu testowego w krótkim oknie", async () => {
  const after = encodeURIComponent(new Date().toISOString());
  for (const [recipient, headers, status] of [
    ["test1@familiada.online", {}, 401],
    ["real@example.com", { "X-E2E-Token": token() }, 400],
  ]) {
    const response = await worker.fetch(new Request(`https://www.familiada.online/_e2e_api/mail-delivery?recipient=${encodeURIComponent(recipient)}&after=${after}`, { headers }), env(), {});
    assert.equal(response.status, status);
  }
});

function token() {
  const payload = Buffer.from(JSON.stringify({ iat: Date.now(), nonce: crypto.randomUUID() })).toString("base64");
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function env() {
  return {
    E2E_BYPASS_SECRET: SECRET,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
  };
}

test("E2E mailbox odrzuca brak podpisanego tokenu", async () => {
  const response = await worker.fetch(
    new Request("https://www.familiada.online/_e2e_api/emails?recipient=test1%40familiada.online&after=2026-09-30T10:00:00Z"),
    env(),
    {}
  );
  assert.equal(response.status, 401);
});

test("E2E mailbox dopuszcza tylko test1..test13 i ograniczone okno czasu", async () => {
  const headers = { "X-E2E-Token": token() };
  const badRecipient = await worker.fetch(
    new Request(`https://www.familiada.online/_e2e_api/emails?recipient=test14%40familiada.online&after=${encodeURIComponent(new Date().toISOString())}`, { headers }),
    env(),
    {}
  );
  assert.equal(badRecipient.status, 400);

  const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const oldWindow = await worker.fetch(
    new Request(`https://www.familiada.online/_e2e_api/emails?recipient=test1%40familiada.online&after=${encodeURIComponent(oldDate)}`, { headers: { "X-E2E-Token": token() } }),
    env(),
    {}
  );
  assert.equal(oldWindow.status, 400);
});

test("mail do test1 zapisuje sie w e2e_emails i nie jest forwardowany", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify([{ id: "mail-id" }]), { status: 201, headers: { "Content-Type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  let forwarded = false;
  const raw = "From: sender@example.com\r\nTo: test1@familiada.online\r\nSubject: Zaproszenie\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nKliknij https://familiada.online/poll-go?token=abc";
  await worker.email({
    from: "sender@example.com",
    to: "test1@familiada.online",
    headers: new Headers({ subject: "Zaproszenie" }),
    raw: new Blob([raw]).stream(),
    async forward() { forwarded = true; },
  }, { ...env(), FORWARD_EMAIL: "owner@example.com" });

  assert.equal(forwarded, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/e2e_emails$/);
  const saved = JSON.parse(calls[0].options.body);
  assert.equal(saved.recipient, "test1@familiada.online");
  assert.match(saved.body, /poll-go/);
});

test("restore konta jest ograniczony do test11 i test12", async () => {
  const response = await worker.fetch(
    new Request("https://www.familiada.online/_e2e_api/accounts/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-E2E-Token": token() },
      body: JSON.stringify({ account: "test10", password: "ValidPassword123!" }),
    }),
    env(),
    {}
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_restore_request" });
});
