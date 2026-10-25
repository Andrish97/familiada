import test from "node:test";
import assert from "node:assert/strict";

// Lead Finder 3: eksport/import kontaktów (przegląd poza systemem) i filtry widoku.
import { parseCsv, importRows } from "../../web/admin/js/marketing-csv.js";
import { contactFilters, contactsCsv, handleAdminMarketingApi } from "../../cloudflare/maintenance-worker/src/lib/admin/admin-marketing-api.js";

const ID1 = "49100000-0000-4000-8000-000000000001";
const ID2 = "49100000-0000-4000-8000-000000000002";

test("eksport CSV: nagłówek, kategoria po nazwie, cudzysłowy, ochrona przed formułami", () => {
  const csv = contactsCsv([
    { id: ID1, title: 'DJ "Max", wesela', email: "a@a.pl", url: "https://a.pl", category_id: "k1", short_description: "=HYPERLINK(1)", sent_count: 2, last_sent_at: "2026-10-01T00:00:00Z", reaction: "replied" },
  ], [{ id: "k1", name: "DJ" }]);
  assert.ok(csv.startsWith("﻿id,name,email,url,category,description,sent_count,last_sent_at,reaction,decision\r\n"));
  assert.match(csv, /"DJ ""Max"", wesela"/);
  assert.match(csv, /,DJ,'=HYPERLINK\(1\),2,/);
});

test("import: CSV z eksportu (przecinek lub średnik), decyzje PL/EN, złe id pominięte", () => {
  const exported = contactsCsv([{ id: ID1, title: "A", email: "a@a.pl", url: "u", sent_count: 0 }, { id: ID2, title: "B", email: "b@b.pl", url: "u", sent_count: 1 }], []);
  const reviewed = exported.replace(/,\r\n/, ",\r\n").split("\r\n").map((line, i) => i === 1 ? line + "zostaw" : i === 2 ? line + "usuń" : line).join("\r\n");
  assert.deepEqual(importRows(parseCsv(reviewed)), [{ id: ID1, decision: "keep", name: "A" }, { id: ID2, decision: "delete", name: "B" }]);
  const semi = `id;decyzja;kategoria\n${ID1};tak;Wodzireje\nzle;usuń;x\n${ID2};"";\n`;
  assert.deepEqual(importRows(parseCsv(semi)), [{ id: ID1, decision: "keep", category: "Wodzireje" }, { id: ID2, decision: "" }]);
  assert.deepEqual(parseCsv('a,b\n"x\ny","z"""\n'), [{ a: "x\ny", b: 'z"' }]);
});

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

test("import przez funkcję bazy, kategorie: dodanie i duplikat", async () => {
  const imp = await call("/_admin_api/marketing/contacts/import", { method: "POST", body: JSON.stringify({ rows: [{ id: ID1, decision: "keep", category: "DJ" }, { id: "x" }] }) },
    [[200, { updated: 1, deleted: 0, categories: 1 }]]);
  assert.deepEqual(await imp.res.json(), { ok: true, updated: 1, deleted: 0, categories: 1 });
  assert.ok(imp.calls[0].url.endsWith("/rest/v1/rpc/marketing_import_contacts"));
  assert.deepEqual(imp.calls[0].body, { p_rows: [{ id: ID1, decision: "keep", category: "DJ" }] });
  const add = await call("/_admin_api/marketing/categories", { method: "POST", body: JSON.stringify({ name: "  DJ   na wesela " }) }, [[201, [{ id: ID2, name: "DJ na wesela" }]]]);
  assert.equal((await add.res.json()).row.name, "DJ na wesela");
  assert.deepEqual(add.calls[0].body, { name: "DJ na wesela" });
  const dup = await call("/_admin_api/marketing/categories", { method: "POST", body: JSON.stringify({ name: "DJ" }) }, [[409, { code: "23505" }]]);
  assert.equal(dup.res.status, 409);
});
