// tests/e2e/helpers/login.js
const { generateE2EToken } = require("./e2e-token");

const LOGIN_URL = "https://www.familiada.online/login";

async function withE2EBypass(context) {
  const secret = process.env.E2E_BYPASS_SECRET;
  if (!secret) throw new Error("Brak E2E_BYPASS_SECRET w zmiennych środowiskowych");
  const wafSecret = process.env.E2E_WAF_BYPASS_SECRET;
  if (!wafSecret) throw new Error("Brak E2E_WAF_BYPASS_SECRET w zmiennych środowiskowych");

  const token = generateE2EToken(secret);
  await context.setExtraHTTPHeaders({
    "X-E2E-Token": token, // weryfikowany (HMAC) przez Worker — omija Turnstile
    "X-E2E-Waf-Bypass": wafSecret, // statyczny sekret — omija Cloudflare Bot Fight Mode dla /login
  });
}

async function clearE2EBypass(context) {
  await context.setExtraHTTPHeaders({});
}

/** Loguje jako konto testowe (TEST_USERNAME/TEST_PASSWORD), zostawia stronę na /builder */
async function loginAsTestUser(page, context) {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  if (!username || !password) throw new Error("Brak TEST_USERNAME/TEST_PASSWORD w zmiennych środowiskowych");

  await withE2EBypass(context);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.fill("#email", username);
  await page.fill("#pass", password);
  await page.click("#btnPrimary");
  await page.waitForURL(/builder/, { timeout: 20000 });
  await clearE2EBypass(context); // token już niepotrzebny, sesja jest prawdziwa
}

/** Zakłada świeże konto gościa, zostawia stronę na /builder. Gość sam wygaśnie po 5 dniach. */
async function loginAsGuest(page, context) {
  await withE2EBypass(context);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.click("#btnGuest");
  await page.waitForURL(/builder/, { timeout: 20000 });
  await clearE2EBypass(context);
}

module.exports = { loginAsTestUser, loginAsGuest };
