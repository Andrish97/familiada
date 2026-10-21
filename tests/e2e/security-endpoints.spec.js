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

test("E24: lead-finder API bez klucza = 401, /health publiczne", async ({ request }) => {
  const status = await request.get(`${LEADS}/api/search-runs/status`);
  log("leads status", status.status());
  expect(status.status()).toBe(401);

  const health = await request.get(`${LEADS}/health`);
  log("leads health", health.status());
  expect(health.status()).toBe(200);
});
