// tests/e2e/helpers/login.js
const { generateE2EToken } = require("./e2e-token");

const LOGIN_URL = "https://www.familiada.online/login";

async function withE2EBypass(context) {
  const secret = process.env.E2E_BYPASS_SECRET;
  if (!secret) throw new Error("Brak E2E_BYPASS_SECRET w zmiennych środowiskowych");

  const token = generateE2EToken(secret);
  await context.setExtraHTTPHeaders({
    "X-E2E-Token": token, // weryfikowany (HMAC) przez Worker — omija Turnstile
  });

  // Konto testowe istnieje dłużej niż 7 dni, więc js/core/rating-system.js
  // pokazuje na każdej stronie pełnoekranowy #ratingOverlay proszący o ocenę
  // — nie testujemy tego, a zasłania klikalne elementy. Suppress ustawiany
  // przed pierwszą nawigacją (addInitScript), więc initRatingSystem() od
  // razu wychodzi wcześnie (patrz rating-system.js:19).
  await context.addInitScript(() => {
    try {
      localStorage.setItem("fam:app_rating_suppressed", "true");
    } catch {
      // ignore
    }
  });
}

async function clearE2EBypass(context) {
  await context.setExtraHTTPHeaders({});
}

// Wypisuje do logu (widocznego w output CI) co faktycznie wylądowało na
// stronie — status HTTP, tytuł, początek treści body, czy #email istnieje.
// Wołane tylko przy błędzie, żeby zdiagnozować bez potrzeby ściągania
// screenshotów/artefaktów.
async function dumpPageDiagnostics(page, gotoResponse) {
  try {
    console.log("[e2e-diag] goto status:", gotoResponse?.status(), gotoResponse?.statusText());
    console.log("[e2e-diag] goto headers:", JSON.stringify(gotoResponse?.headers() || {}));
    console.log("[e2e-diag] page.url():", page.url());
    console.log("[e2e-diag] page title:", await page.title());
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || "(brak body/innerText)");
    console.log("[e2e-diag] body text (pierwsze 500 znaków):", bodyText);
    const hasEmailField = await page.evaluate(() => !!document.getElementById("email"));
    console.log("[e2e-diag] #email istnieje w DOM:", hasEmailField);
  } catch (diagErr) {
    console.log("[e2e-diag] dump się nie powiódł:", diagErr?.message || diagErr);
  }
}

/** Loguje jako konto testowe (TEST_USERNAME/TEST_PASSWORD), zostawia stronę na /builder */
async function loginAsTestUser(page, context) {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  if (!username || !password) throw new Error("Brak TEST_USERNAME/TEST_PASSWORD w zmiennych środowiskowych");

  await withE2EBypass(context);
  const res = await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  try {
    await page.fill("#email", username, { timeout: 15000 });
  } catch (e) {
    await dumpPageDiagnostics(page, res);
    throw e;
  }
  await page.fill("#pass", password);
  await page.click("#btnPrimary");
  await page.waitForURL(/builder/, { timeout: 20000 });
  await clearE2EBypass(context); // token już niepotrzebny, sesja jest prawdziwa
}

/** Zakłada świeże konto gościa, zostawia stronę na /builder. Gość sam wygaśnie po 5 dniach. */
async function loginAsGuest(page, context) {
  await withE2EBypass(context);
  const res = await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  try {
    await page.click("#btnGuest", { timeout: 15000 });
  } catch (e) {
    await dumpPageDiagnostics(page, res);
    throw e;
  }
  // Zakładanie gościa to więcej pracy po stronie backendu niż zwykłe
  // logowanie (auth signup + trigger seedujący dane demo + redirect) —
  // w CI bywa wolniejsze niż 20s, stąd dłuższy limit niż w loginAsTestUser.
  await page.waitForURL(/builder/, { timeout: 40000 });
  await clearE2EBypass(context);
}

module.exports = { loginAsTestUser, loginAsGuest };
