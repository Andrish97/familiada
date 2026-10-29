import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// E25: /_e2e_api/lease* i poczta e2e+ (familijna-server/docs/konta-testowe-plan.md).
const { default: worker } = await import("../../cloudflare/maintenance-worker/src/index.js");

const SECRET = "unit-test-e2e-secret";
const env = () => ({ E2E_BYPASS_SECRET: SECRET, SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "service-role-test" });

function token() {
  const payload = Buffer.from(JSON.stringify({ iat: Date.now(), nonce: crypto.randomUUID() })).toString("base64");
  return `${payload}.${crypto.createHmac("sha256", SECRET).update(payload).digest("hex")}`;
}

function mockFetch(t, routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url: u, method: options.method || "GET", body });
    for (const [match, reply] of routes) {
      if (u.includes(match)) {
        const [status, data] = typeof reply === "function" ? reply(body, u, options) : reply;
        return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
      }
    }
    return new Response("{}", { status: 404 });
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

function leaseRequest(needs = { standard: 1 }, headers = { "X-E2E-Token": token() }) {
  return new Request("https://www.familijna.app/_e2e_api/lease", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ run_id: "run-1", worker: "w0", needs, password: "secret-password" }),
  });
}

const leased = { ok: true, identities: [
  { name: "e2e.standard01", role: "standard", email: "e2e+standard01@familijna.app", user_id: null, purpose: null },
  { name: "e2e.noaccount01", role: "noaccount", email: "e2e+noaccount01@familijna.app", user_id: null, purpose: null },
  { name: "resource.mail01", role: "resource", email: null, user_id: null, purpose: "mail" },
] };

test("lease wymaga tokenu E2E", async () => {
  const response = await worker.fetch(leaseRequest({ standard: 1 }, {}), env(), {});
  assert.equal(response.status, 401);
});

test("lease zakłada brakujące konto z e2e_role, odtwarza je i sprawdza wykluczenie", async (t) => {
  const calls = mockFetch(t, [
    ["/rpc/e2e_lease_release", [200, 1]],
    ["/rpc/e2e_lease", [200, leased]],
    ["/auth/v1/admin/users/u-1", [200, { id: "u-1" }]],
    ["/auth/v1/admin/users", [200, { id: "u-1", email: "e2e+standard01@familijna.app" }]],
    ["/rpc/e2e_identity_bind", [200, null]],
    ["/rpc/auth_clear_email_change", [200, null]],
    ["/rest/v1/profiles", [200, [{ id: "u-1" }]]],
    ["/rest/v1/stats_exclusions_effective", [200, [{ user_id: "u-1", reason: "test:standard" }]]],
  ]);
  const response = await worker.fetch(leaseRequest({ standard: 1, noaccount: 1, resources: ["mail"] }), env(), {});
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.identities.find((i) => i.name === "e2e.standard01").user_id, "u-1");
  const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/auth/v1/admin/users"));
  assert.equal(create.body.app_metadata.e2e_role, "standard");
  assert.equal(create.body.user_metadata.username, "e2e.standard01");
  assert.equal(create.body.email_confirm, true);
  const restore = calls.find((c) => c.method === "PUT");
  assert.equal(restore.body.password, "secret-password");
  assert.equal(restore.body.app_metadata.e2e_role, "standard");
  // noaccount i zasób nie zakładają konta
  assert.equal(calls.filter((c) => c.url.endsWith("/auth/v1/admin/users")).length, 1);
  assert.ok(!calls.some((c) => c.url.includes("e2e_lease_release")));
});

test("lease bez wykluczenia w statystykach zwalnia komplet i pada", async (t) => {
  const calls = mockFetch(t, [
    ["/rpc/e2e_lease_release", [200, 3]],
    ["/rpc/e2e_lease", [200, { ok: true, identities: [{ ...leased.identities[0], user_id: "u-1" }] }]],
    ["/auth/v1/admin/users/u-1", [200, { id: "u-1" }]],
    ["/rpc/auth_clear_email_change", [200, null]],
    ["/rest/v1/profiles", [200, [{ id: "u-1" }]]],
    ["/rest/v1/stats_exclusions_effective", [200, []]],
  ]);
  const response = await worker.fetch(leaseRequest(), env(), {});
  assert.equal(response.status, 502);
  assert.match((await response.json()).details, /admin_exclusion_missing/);
  assert.ok(calls.some((c) => c.url.includes("e2e_lease_release")));
});

test("lease przekazuje busy z listą posiadaczy", async (t) => {
  mockFetch(t, [["/rpc/e2e_lease", [200, { ok: false, error: "busy", role: "standard", holders: [{ run_id: "other" }] }]]]);
  const response = await worker.fetch(leaseRequest(), env(), {});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).holders[0].run_id, "other");
});

test("skrzynka e2e+ tylko dla przebiegu, który ją wypożyczył", async (t) => {
  let owns = false;
  mockFetch(t, [
    ["/rpc/e2e_lease_owns", () => [200, owns]],
    ["/rest/v1/e2e_emails", [200, []]],
  ]);
  const url = `https://www.familijna.app/_e2e_api/emails?recipient=${encodeURIComponent("e2e+noaccount01@familijna.app")}&after=${encodeURIComponent(new Date().toISOString())}`;
  const denied = await worker.fetch(new Request(url, { headers: { "X-E2E-Token": token(), "X-E2E-Run": "run-1" } }), env(), {});
  assert.equal(denied.status, 403);
  owns = true;
  const allowed = await worker.fetch(new Request(url, { headers: { "X-E2E-Token": token(), "X-E2E-Run": "run-1" } }), env(), {});
  assert.equal(allowed.status, 200);
  const clear = await worker.fetch(new Request(url, { method: "DELETE", headers: { "X-E2E-Token": token() } }), env(), {});
  assert.equal(clear.status, 403, "bez X-E2E-Run nie wolno czyścić");
});

function inbound(to, headerTo = to) {
  let rejected = null;
  return {
    message: {
      from: "sender@example.com", to,
      headers: new Headers({ subject: "Zaproszenie", to: headerTo }),
      raw: new Blob([`From: sender@example.com\r\nTo: ${headerTo}\r\nSubject: Zaproszenie\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nTresc`]).stream(),
      setReject(reason) { rejected = reason; },
      forward() { throw new Error("forward test mail"); },
    },
    rejected: () => rejected,
  };
}

test("poczta e2e+: znana tożsamość do skrzynki testowej, nieznana odrzucona", async (t) => {
  const calls = mockFetch(t, [
    ["/rpc/e2e_identity", (body) => [200, body.p_email === "e2e+noaccount01@familijna.app" ? { name: "e2e.noaccount01" } : { name: null }]],
    ["/rest/v1/e2e_emails", [201, [{ id: "m" }]]],
  ]);
  const known = inbound("e2e+noaccount01@familijna.app");
  await worker.email(known.message, env(), {});
  assert.equal(known.rejected(), null);
  const saved = calls.find((c) => c.url.includes("/rest/v1/e2e_emails"));
  assert.equal(saved.body.recipient, "e2e+noaccount01@familijna.app");

  const unknown = inbound("e2e+zzz99@familijna.app");
  await worker.email(unknown.message, env(), {});
  assert.ok(unknown.rejected());
  assert.equal(calls.filter((c) => c.url.includes("/rest/v1/e2e_emails")).length, 1);

  const bare = inbound("e2e@familijna.app", "Someone <e2e@familijna.app>");
  await worker.email(bare.message, env(), {});
  assert.ok(bare.rejected(), "goły e2e@ bez adresu tożsamości");
});

test("poczta e2e@ bez +detail: adresat z nagłówka To", async (t) => {
  const calls = mockFetch(t, [
    ["/rpc/e2e_identity", [200, { name: "e2e.standard02" }]],
    ["/rest/v1/e2e_emails", [201, [{ id: "m" }]]],
  ]);
  const m = inbound("e2e@familijna.app", "Test <e2e+standard02@familijna.app>");
  await worker.email(m.message, env(), {});
  assert.equal(m.rejected(), null);
  assert.equal(calls.find((c) => c.url.includes("/rest/v1/e2e_emails")).body.recipient, "e2e+standard02@familijna.app");
});
