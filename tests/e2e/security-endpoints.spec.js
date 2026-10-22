// E24: kontrola produkcji — chronione punkty końcowe odmawiają bez uwierzytelnienia.
// Tylko kody HTTP, bez treści odpowiedzi i bez sekretów w logach.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const WWW = "https://www.familiada.online";
const API = "https://api.familiada.online";
const LEADS = "https://leads.familiada.online";

function log(name, status) {
  console.log(`[e2e-diag] security ${name} -> ${status}`);
}

test("E24: API panelu admina bez tokenu Access = 401 (także z dopisanymi nagłówkami)", async ({ request }) => {
  const plain = await request.get(`${WWW}/_admin_api/stats/overview`, { maxRedirects: 0 });
  log("admin_api plain", plain.status());
  expect(plain.status()).toBe(401);

  const forged = await request.get(`${WWW}/_admin_api/stats/overview`, {
    maxRedirects: 0,
    headers: {
      "Cf-Access-Authenticated-User-Email": "e2e@familiada.online",
      "Cf-Access-Jwt-Assertion": "e2e.forged.token",
    },
  });
  log("admin_api forged", forged.status());
  expect(forged.status()).toBe(401);
});

test("E24: generate-game bez nagłówka sekretu = 401, funkcja lead-finder usunięta", async ({ request }) => {
  const gen = await request.post(`${API}/functions/v1/generate-game`, { data: {} });
  log("generate-game", gen.status());
  expect(gen.status()).toBe(401);

  const lead = await request.post(`${API}/functions/v1/lead-finder`, { data: {} });
  log("edge lead-finder", lead.status());
  expect(lead.status()).toBeGreaterThanOrEqual(400);
});

// leads.* przez Caddy: bez poprawnego klucza (Authorization: Bearer) Caddy
// odpowiada 404 i nie przekazuje żądania do usługi (która sama też wymaga
// klucza: 401). Przy rotacji LEAD_FINDER_API_KEY trzeba zmienić też Caddyfile.
test("E24: lead-finder bez klucza lub z fałszywym kluczem nie odpowiada (404 z Caddy)", async ({ request }) => {
  const diag = (name, res) => console.log(`[e2e-diag] security ${name} -> ${res.status()}`);
  const health = await request.get(`${LEADS}/health`);
  diag("leads health", health);
  const status = await request.get(`${LEADS}/api/search-runs/status`);
  diag("leads status", status);
  const forged = await request.get(`${LEADS}/api/search-runs/status`, { headers: { Authorization: "Bearer e2e-forged-key" } });
  diag("leads status forged", forged);
  const start = await request.post(`${LEADS}/api/search-runs?target_count=1`);
  diag("leads start", start);

  for (const res of [health, status, forged, start]) expect([401, 404]).toContain(res.status());
});

// ── Paczka P1 (Ś2, Ś7, N3, N4) ───────────────────────────────────────────
const SETTINGS = "https://settings.familiada.online";

// Ś2: klucz lead-findera nie wychodzi z Workera. Bez sesji Access: www = 401
// (API panelu tylko na hoście panelu), host panelu = bramka Access (302/403)
// albo 401/404 z Workera -- nigdy 200.
test("P1 Ś2: punkt klucza lead-findera i pośrednik /leads bez Access odmawiają", async ({ request }) => {
  for (const [name, url, method] of [
    ["www token", `${WWW}/_admin_api/config/lead-finder-token`, "get"],
    ["www leads status", `${WWW}/_admin_api/leads/search-runs/status`, "get"],
    ["www leads start", `${WWW}/_admin_api/leads/search-runs?target_count=1`, "post"],
    ["settings token", `${SETTINGS}/_admin_api/config/lead-finder-token`, "get"],
    ["settings leads status", `${SETTINGS}/_admin_api/leads/search-runs/status`, "get"],
  ]) {
    const res = await request[method](url, { maxRedirects: 0, headers: { "Cf-Access-Jwt-Assertion": "e2e.forged.token" } });
    log(name, res.status());
    expect([302, 401, 403, 404]).toContain(res.status());
    if (name.startsWith("www")) expect(res.status()).toBe(401);
    expect(await res.text()).not.toMatch(/"token"\s*:/);
  }
});

// N3: nagłówki bezpieczeństwa na stronach HTML (CSP tylko Report-Only).
test("P1 N3: strony HTML mają nagłówki bezpieczeństwa", async ({ request }) => {
  for (const path of ["/", "/games/", "/control/display/", "/nie-ma-takiej-strony-e2e"]) {
    const res = await request.get(`${WWW}${path}`, { headers: { Accept: "text/html" } });
    const h = res.headers();
    console.log(`[e2e-diag] security headers ${path} -> ${res.status()} nosniff=${h["x-content-type-options"]} xfo=${h["x-frame-options"]} ro=${!!h["content-security-policy-report-only"]}`);
    expect(h["content-type"] || "").toContain("text/html");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    // Egzekwowaną CSP nadpisuje reguła nagłówków strefy Cloudflare (poza repo,
    // stosowana po Workerze) -- osadzanie blokuje X-Frame-Options powyżej.
    console.log(`[e2e-diag] security csp ${path} frame-ancestors=${/frame-ancestors/.test(h["content-security-policy"] || "")}`);
    expect(h["permissions-policy"] || "").toContain("camera=(self)");
    expect(h["content-security-policy-report-only"] || "").toContain("script-src 'self'");
  }
  // Zasoby statyczne bez zmian (nagłówki tylko dla HTML).
  const css = await request.get(`${WWW}/shared/css/base.css`);
  console.log(`[e2e-diag] security headers css -> ${css.status()} xfo=${css.headers()["x-frame-options"]}`);
  expect(css.headers()["x-frame-options"]).toBeUndefined();
});

// Ś7: ciasteczko obejścia przerwy to podpisany token z ważnością -- podrobione
// wartości (surowy tekst, token v1 z fałszywym podpisem) nie psują odpowiedzi.
// Odrzucenie podpisu i ważności sprawdzają testy jednostkowe (securityP1).
test("P1 Ś7: podrobione ciasteczko obejścia nie zmienia odpowiedzi", async ({ request }) => {
  const forged = `v1.${Date.now() + 3600000}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  for (const cookie of ["__Secure-fml_admin=e2e-raw-secret", `__Secure-fml_admin=${forged}`]) {
    const res = await request.get(`${WWW}/`, { headers: { Cookie: cookie, Accept: "text/html" } });
    log("forged bypass cookie", res.status());
    expect([200, 503]).toContain(res.status());
  }
});

// N4: storage-cleanup bez nagłówka X-Internal-Secret = 401 -- także z publicznym
// kluczem anon (przechodzi bramkę JWT, odmawia sama funkcja).
test("P1 N4: storage-cleanup bez nagłówka sekretu = 401", async ({ request }) => {
  const anonKey = fs.readFileSync(path.join(__dirname, "../../web/shared/js/core/supabase.js"), "utf8").match(/SUPABASE_ANON_KEY = "([^"]+)"/)[1];
  const auth = { Authorization: `Bearer ${anonKey}`, apikey: anonKey };
  const res = await request.post(`${API}/functions/v1/storage-cleanup`, { data: {}, headers: auth });
  log("storage-cleanup anon", res.status());
  expect(res.status()).toBe(401);
  const forged = await request.post(`${API}/functions/v1/storage-cleanup`, { data: {}, headers: { ...auth, "X-Internal-Secret": "e2e-forged" } });
  log("storage-cleanup forged", forged.status());
  expect(forged.status()).toBe(401);
});
