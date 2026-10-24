import test from "node:test";
import assert from "node:assert/strict";

// Hosty usług (API, Studio, panel, Portainer, Lead Finder) Worker tylko
// przepuszcza do serwera.
const { default: worker } = await import("../../cloudflare/maintenance-worker/src/index.js");

const PASSTHROUGH = [
  "api.familiada.online", "supabase.familiada.online", "panel.familiada.online", "docker.familiada.online",
  "leads.familiada.online",
];

test("Worker przepuszcza hosty usług bez zmian", async (t) => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (request) => { seen.push(new URL(request.url).host); return new Response("serwer", { status: 200 }); };
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const host of PASSTHROUGH) {
    const response = await worker.fetch(new Request(`https://${host}/auth/v1/health`), {}, {});
    assert.equal(await response.text(), "serwer", host);
  }
  assert.deepEqual(seen, PASSTHROUGH);
});

test("Worker odpowiada na preflight CORS dla leads", async () => {
  const response = await worker.fetch(new Request("https://leads.familiada.online/search", { method: "OPTIONS" }), {}, {});
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://admin.familiada.online");
});
