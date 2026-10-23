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
  const css = await request.get(`${WWW}/shared/style/base.css`);
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

// ── Paczka P2 (B7, B8, N5, send-mail) ────────────────────────────────────
const anonHeaders = () => {
  const anonKey = fs.readFileSync(path.join(__dirname, "../../web/shared/js/core/supabase.js"), "utf8").match(/SUPABASE_ANON_KEY = "([^"]+)"/)[1];
  return { Authorization: `Bearer ${anonKey}`, apikey: anonKey };
};

// Worker: logowanie po nazwie -- nieznana nazwa = ten sam błąd co złe hasło,
// bez adresu e-mail; tylko JSON z własnej strony.
test("P2 Worker: /_api/auth/* odmawia bez tokenu Turnstile i bez ujawniania adresu, tylko JSON z www", async ({ request }) => {
  const login = await request.post(`${WWW}/_api/auth/login`, { data: { login: `e2e_nikt_${Date.now().toString(36)}`, password: "x" }, headers: { Origin: WWW } });
  const text = await login.text();
  log("auth/login unknown", login.status());
  // Bez tokenu Turnstile (żądanie spoza strony) -- odmowa przed jakimkolwiek sprawdzeniem konta.
  expect(login.status()).toBe(400);
  expect(JSON.parse(text)).toEqual({ ok: false, error: "captcha_failed" });
  expect(text).not.toContain("@");
  const foreign = await request.post(`${WWW}/_api/auth/login`, { data: { login: "x", password: "x" }, headers: { Origin: "https://evil.example" } });
  log("auth/login foreign origin", foreign.status());
  expect(foreign.status()).toBe(403);
  const plain = await request.post(`${WWW}/_api/auth/email-status`, { data: "email=a@example.com", headers: { "Content-Type": "text/plain" } });
  log("auth/email-status text/plain", plain.status());
  expect(plain.status()).toBe(415);
  const getReq = await request.get(`${WWW}/_api/auth/login`);
  log("auth/login GET", getReq.status());
  expect(getReq.status()).toBe(405);
});

// Baza (migracja 456): zamiana nazwy na e-mail, stan adresu i tokeny wypisania
// niedostępne z przeglądarki; strona potwierdzenia nie zdradza stanu konta.
test("P2 baza: RPC nazwa->e-mail i stan adresu niedostępne anonimowo, auth-email-status usunięta", async ({ request }) => {
  const headers = anonHeaders();
  for (const [fn, body] of [
    ["profile_login_to_email", { p_login: "e2e" }],
    ["email_get_status", { p_email: "e2e@example.com" }],
    ["email_resend_prepare", { p_email: "e2e@example.com", p_intent: "signup" }],
    ["get_unsub_info_for_task_emails", { p_owner_id: "00000000-0000-4000-8000-000000000000", p_emails: ["e2e@example.com"] }],
  ]) {
    const res = await request.post(`${API}/rest/v1/rpc/${fn}`, { data: body, headers });
    log(`rpc ${fn} anon`, res.status());
    expect([401, 403, 404]).toContain(res.status());
  }
  const intent = await request.post(`${API}/rest/v1/rpc/get_email_intent_status`, { data: { p_email: `e2e-${Date.now()}@example.invalid` }, headers });
  log("rpc get_email_intent_status anon", intent.status());
  expect(intent.status()).toBe(200);
  expect(await intent.json()).toBeNull();
  const edge = await request.post(`${API}/functions/v1/auth-email-status`, { data: { email: "e2e@example.com" }, headers });
  log("edge auth-email-status", edge.status());
  expect(edge.status()).toBeGreaterThanOrEqual(400);
});

// Formularz kontaktu: bez tokenu Turnstile odmowa (nic nie trafia do skrzynki zgłoszeń).
test("P2 Worker: formularz kontaktu bez tokenu Turnstile = 400", async ({ request }) => {
  for (const path of ["/_api/contact", "/_api/contact/append"]) {
    const res = await request.post(`${WWW}${path}`, { data: { email: "e2e-captcha@example.invalid", subject: "e2e", message: "e2e bez tokenu", ticket: "TICKET-0000-0000" }, headers: { Origin: WWW } });
    log(`${path} no captcha`, res.status());
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("captcha_failed");
  }
});
