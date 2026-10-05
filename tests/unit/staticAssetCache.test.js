import { test } from "node:test";
import assert from "node:assert/strict";
import { serveStaticAsset } from "../../cloudflare/maintenance-worker/src/lib/origin/assets.js";

test("HTML cached under a JS URL is discarded and real JavaScript replaces it", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; });
  let deleted = false, stored = null;
  globalThis.caches = { default: {
    match: async () => new Response("<html>wrong page</html>", { headers: { "Content-Type": "text/html" } }),
    delete: async () => { deleted = true; },
    put: async (_, response) => { stored = await response.text(); },
  } };
  globalThis.fetch = async () => new Response("export const ready = true;", { headers: { "Content-Type": "application/javascript" } });
  const request = new Request("https://www.familiada.online/bases/js/bases.js?v=test");
  const pending = [];
  const response = await serveStaticAsset(request, new URL(request.url), { waitUntil: (p) => pending.push(p) }, "https://origin.test", "origin.test", null);
  await Promise.all(pending);
  assert.equal(deleted, true);
  assert.match(response.headers.get("Content-Type"), /javascript/);
  assert.equal(stored, "export const ready = true;");
});

test("HTML returned as an asset is never cached or given an immutable success", async (t) => {
  const originalFetch = globalThis.fetch, originalCaches = globalThis.caches;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; });
  let stored = false;
  globalThis.caches = { default: { match: async () => null, put: async () => { stored = true; } } };
  globalThis.fetch = async () => new Response("<html>wrong page</html>", { headers: { "Content-Type": "text/html" } });
  const request = new Request("https://www.familiada.online/bases/js/bases.js?v=test");
  const response = await serveStaticAsset(request, new URL(request.url), { waitUntil() {} }, "https://origin.test", "origin.test", null);
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(stored, false);
});
