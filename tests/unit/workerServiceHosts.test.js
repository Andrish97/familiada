import test from "node:test";
import assert from "node:assert/strict";

// Hosty usług (API, Studio, panel, Portainer) Worker tylko
// przepuszcza do serwera.
const { default: worker } = await import("../../cloudflare/maintenance-worker/src/index.js");

const PASSTHROUGH = [
  "api.familijna.app", "supabase.familijna.app", "panel.familijna.app", "docker.familijna.app",
  // Stare adresy API do końca przekierowań (plan rebrandingu).
  "api.familiada.online", "supabase.familiada.online", "panel.familiada.online", "docker.familiada.online",
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

// Lead Finder działa tylko w sieci Dockera (sterowanie przez funkcję Edge):
// leads.* to dla Workera nieznana subdomena -- strona 404, nigdy serwer.
test("Worker nie przepuszcza leads.familijna.app do serwera", async (t) => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (request) => { seen.push(new URL(String(request.url || request)).host); return new Response("x", { status: 200 }); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const env = { MAINTENANCE_KV: { get: async () => null } };
  await worker.fetch(new Request("https://leads.familijna.app/api/search-runs/status"), env, {}).catch(() => null);
  await worker.fetch(new Request("https://leads.familijna.app/search", { method: "OPTIONS" }), env, {}).catch(() => null);
  assert.ok(!seen.includes("leads.familijna.app"), seen.join(","));
});
