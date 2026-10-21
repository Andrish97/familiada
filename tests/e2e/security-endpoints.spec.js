// E24: kontrola produkcji — chronione punkty końcowe odmawiają bez uwierzytelnienia.
// Tylko kody HTTP, bez treści odpowiedzi i bez sekretów w logach.
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
