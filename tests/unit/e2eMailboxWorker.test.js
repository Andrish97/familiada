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

test("E2E mailbox dopuszcza tylko test1..test14 i ograniczone okno czasu", async () => {
  const headers = { "X-E2E-Token": token() };
  const badRecipient = await worker.fetch(
    new Request(`https://www.familiada.online/_e2e_api/emails?recipient=test15%40familiada.online&after=${encodeURIComponent(new Date().toISOString())}`, { headers }),
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

for (const recipient of ["test1@familiada.online", "test14@familiada.online"]) {
test(`mail do ${recipient} zapisuje sie w e2e_emails i nie jest forwardowany`, async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify([{ id: "mail-id" }]), { status: 201, headers: { "Content-Type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  let forwarded = false;
  const raw = `From: sender@example.com\r\nTo: ${recipient}\r\nSubject: Zaproszenie\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nKliknij https://familiada.online/go/?s=abc`;
  await worker.email({
    from: "sender@example.com",
    to: recipient,
    headers: new Headers({ subject: "Zaproszenie" }),
    raw: new Blob([raw]).stream(),
    async forward() { forwarded = true; },
  }, { ...env(), FORWARD_EMAIL: "owner@example.com" });

  assert.equal(forwarded, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/e2e_emails$/);
  const saved = JSON.parse(calls[0].options.body);
  assert.equal(saved.recipient, recipient);
  assert.match(saved.body, /go\/\?s=/);
});

}

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

const { normalizeE2ERecipient } = await import("../../cloudflare/maintenance-worker/src/lib/e2e/e2e-api.js");
test("allowlista adresów obejmuje 1..14 i odrzuca adresy spoza puli", () => {
  for (let n=1;n<=14;n++) assert.equal(normalizeE2ERecipient(` TEST${n}@FAMILIADA.ONLINE `), `test${n}@familiada.online`);
  for (const value of ["test0@familiada.online","test15@familiada.online","test014@familiada.online","test14@example.com","real@familiada.online","test14@familiada.online.attacker.net",null]) {
    assert.equal(normalizeE2ERecipient(value),null);
  }
});
test("test14 może odczytać i wyczyścić skrzynkę oraz diagnostykę wyłącznie z tokenem E2E", async (t) => {
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (url,options={})=>{calls.push({url:String(url),method:options.method});return new Response(JSON.stringify([]),{status:200,headers:{"Content-Type":"application/json"}});};
  t.after(()=>{globalThis.fetch=originalFetch;});
  for(const [endpoint,method] of [["emails","GET"],["emails","DELETE"],["mail-delivery","GET"]]) {
    const url=`https://www.familiada.online/_e2e_api/${endpoint}?recipient=test14%40familiada.online&after=${encodeURIComponent(new Date().toISOString())}`;
    const blocked=await worker.fetch(new Request(url,{method}),env(),{});
    assert.equal(blocked.status,401);
    const response=await worker.fetch(new Request(url,{method,headers:{"X-E2E-Token":token()}}),env(),{});
    assert.equal(response.status,200);
  }
  assert.equal(calls.length,4);
  assert.ok(calls.every(call=>call.url.includes('test14%40familiada.online')));
});

async function restoreFixture(account, users, { createStatus = 200, createdEmail = account + "@familiada.online" } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: url.pathname, method, body });
    if (url.pathname === "/auth/v1/admin/users" && method === "GET") return Response.json({ users });
    if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
      if (createStatus !== 200) return Response.json({ message: "create failed" }, { status: createStatus });
      return Response.json({ id: "created-" + account, email: createdEmail, user_metadata: body.user_metadata });
    }
    return Response.json({});
  };
  try {
    const response = await worker.fetch(new Request("https://www.familiada.online/_e2e_api/accounts/restore", {
      method: "POST", headers: { "Content-Type": "application/json", "X-E2E-Token": token() },
      body: JSON.stringify({ account, password: "ValidPassword123!" }),
    }), env(), {});
    return { status: response.status, data: await response.json(), calls };
  } finally { globalThis.fetch = originalFetch; }
}

test("restore tworzy brakujące11/12 z potwierdzonym adresem i nazwą", async () => {
  for (const account of ["test11", "test12"]) {
    const result = await restoreFixture(account, []);
    assert.equal(result.status, 200);
    assert.equal(result.data.created, true);
    assert.equal(result.data.user_id, "created-" + account);
    const create = result.calls.find(call => call.path === "/auth/v1/admin/users" && call.method === "POST");
    assert.deepEqual(create.body, { email: account + "@familiada.online", password: "ValidPassword123!", email_confirm: true, user_metadata: { username: account, is_guest: false } });
  }
});

test("restore zachowuje tożsamość istniejących11/12 bez tworzenia kolejnego", async () => {
  for (const account of ["test11", "test12"]) {
    const result = await restoreFixture(account, [{ id: account, email: account + "@familiada.online" }]);
    assert.equal(result.status, 200);
    assert.equal(result.data.created, false);
    assert.equal(result.data.user_id, account);
    assert.equal(result.calls.filter(call => call.method === "POST" && call.path === "/auth/v1/admin/users").length, 0);
  }
});

test("restore nie wybiera spośród dwóch pasujących kont11/12", async () => {
  for (const account of ["test11", "test12"]) {
    const result = await restoreFixture(account, [{ id: "one", email: account + "@familiada.online" }, { id: "two", email: account === "test12" ? "test13@familiada.online" : "test11@familiada.online" }]);
    assert.equal(result.status, 409);
    assert.equal(result.data.error, "test_account_not_unique");
    assert.equal(result.calls.length, 1);
  }
});

test("restore odrzuca8/9/10/14 i adres zamiast nazwy przed zapytaniem do auth", async () => {
  for (const account of ["test8", "test9", "test10", "test14", "test11@familiada.online", "test7"]) {
    const result = await restoreFixture(account, []);
    assert.equal(result.status, 400);
    assert.equal(result.calls.length, 0);
  }
});

test("restore nie kontynuuje po błędzie tworzenia lub odpowiedzi innego konta", async () => {
  for (const account of ["test11", "test12"]) for (const options of [{ createStatus: 503 }, { createdEmail: "other@example.invalid" }]) {
    const result = await restoreFixture(account, [], options);
    assert.equal(result.status, options.createStatus || 502);
    assert.equal(result.calls.length, 2);
  }
});

test("restore zachowuje nazwę11 i odzyskuje12 z alternatywnego adresu13", async () => {
  for (const account of ["test11", "test12"]) {
    const result = await restoreFixture(account, [{ id: account, email: account === "test12" ? "test13@familiada.online" : "test11@familiada.online", user_metadata: { username: "custom11" } }]);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { ok: true, account, user_id: account, email: account + "@familiada.online", created: false });
    const update = result.calls.find(call => call.method === "PUT");
    assert.equal(update.body.user_metadata.username, account === "test11" ? "custom11" : "test12");
    assert.equal(result.calls.filter(call => call.path === "/auth/v1/admin/users" && call.method === "POST").length, 0);
  }
});
