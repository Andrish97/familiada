import test from "node:test";
import assert from "node:assert/strict";

// Lead Finder 3: filtry widoku tabeli, adresy widoku do wysyłki, kategorie.
import { contactFilters, handleAdminMarketingApi } from "../../cloudflare/maintenance-worker/src/lib/admin/admin-marketing-api.js";

const ID1 = "49100000-0000-4000-8000-000000000001";
const ID2 = "49100000-0000-4000-8000-000000000002";

test("filtry widoku: kategoria, stan wysyłki, wyszukiwanie", () => {
  const f = (qs) => Object.fromEntries(contactFilters(new URLSearchParams(qs)));
  assert.deepEqual(f(`category=${ID1.toUpperCase()}&sent=unsent`), { category_id: `eq.${ID1}`, sent_count: "eq.0" });
  assert.deepEqual(f("category=none&sent=waiting"), { category_id: "is.null", sent_count: "gt.0", reaction: "is.null" });
  assert.deepEqual(f("sent=blocked"), { reaction: "in.(declined,bounced)" });
  assert.deepEqual(f("category=../x&sent=zle"), {});
  assert.match(f("search=dj%")["or"], /^\(title\.ilike\."\*dj\\+%\*",email\.ilike/);
});

async function call(path, init, replies) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    calls.push({ url: decodeURIComponent(String(u)), body: o.body ? JSON.parse(o.body) : null });
    const [status, data, headers] = replies.shift();
    return new Response(JSON.stringify(data), { status, headers: headers || {} });
  };
  try {
    const url = new URL(path, "https://admin.familiada.online");
    const res = await handleAdminMarketingApi(new Request(url, init), { SUPABASE_URL: "https://api.test", SUPABASE_SERVICE_ROLE_KEY: "k" }, url);
    return { res, calls };
  } finally { globalThis.fetch = orig; }
}

test("adresy widoku do wysyłki: bez odmów i odbitych, także z wyszukiwaniem", async () => {
  const { res, calls } = await call("/_admin_api/marketing/contacts/emails?category=none&search=dj", {}, [[200, [{ email: "A@a.pl" }, { email: "a@a.pl" }], { "content-range": "0-1/2" }]]);
  assert.deepEqual(await res.json(), { ok: true, emails: ["a@a.pl"], total: 2 });
  assert.match(calls[0].url, /and=\(or\(title\.ilike.*\),or\(reaction\.is\.null,reaction\.not\.in\.\(declined,bounced\)\)\)/);
  const blocked = await call("/_admin_api/marketing/contacts/emails?sent=blocked", {}, []);
  assert.deepEqual(await blocked.res.json(), { ok: true, emails: [], total: 0 });
});

test("kategorie: dodanie i duplikat; eksportu i importu w panelu nie ma", async () => {
  for (const path of ["/_admin_api/marketing/contacts/export", "/_admin_api/marketing/contacts/import"]) {
    const r = await call(path, { method: path.endsWith("import") ? "POST" : "GET", ...(path.endsWith("import") ? { body: "{}" } : {}) }, []);
    assert.equal(r.res.status, 404, path);
  }
  const add = await call("/_admin_api/marketing/categories", { method: "POST", body: JSON.stringify({ name: "  DJ   na wesela " }) }, [[201, [{ id: ID2, name: "DJ na wesela" }]]]);
  assert.equal((await add.res.json()).row.name, "DJ na wesela");
  assert.deepEqual(add.calls[0].body, { name: "DJ na wesela" });
  const dup = await call("/_admin_api/marketing/categories", { method: "POST", body: JSON.stringify({ name: "DJ" }) }, [[409, { code: "23505" }]]);
  assert.equal(dup.res.status, 409);
});
