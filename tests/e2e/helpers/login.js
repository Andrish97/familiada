// tests/e2e/helpers/login.js
const { generateE2EToken } = require("./e2e-token");

const LOGIN_URL = "https://www.familiada.online/login";

// Trwała diagnostyka (nie tylko na czas jednego debugowania) — logowanie
// bywa niedeterministycznie wolne/nieudane w CI (waitForURL timeout) bez
// żadnego wcześniejszego sygnału dlaczego. Podpięte raz na page, żeby przy
// kolejnym takim failu CI log od razu pokazał: błędy JS, błędy sieciowe
// (zwłaszcza 429 — rate limit) i błędy konsoli, zamiast zgadywania.
function instrumentPage(page) {
  page.on("pageerror", (err) => console.log("[e2e-diag] pageerror:", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[e2e-diag] console:${msg.type()}`, msg.text());
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      console.log("[e2e-diag] HTTP", res.status(), res.url());
    }
  });
}

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
      // getUiLang() (translation/translation.js) sięga po navigator.language
      // zanim spadnie na domyślne "pl" — Chromium w CI ma en-US, więc bez
      // tego cała strona (i teksty przycisków w modalach) renderuje się po
      // angielsku, a testy oczekują polskich napisów.
      localStorage.setItem("uiLang", "pl");
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

/**
 * Loguje jako konto testowe (TEST_USERNAME/TEST_PASSWORD domyślnie), zostawia
 * stronę na /builder. Przekaż { username: process.env.TEST_USERNAME_2 } żeby
 * zalogować DRUGIE konto testowe w scenariuszach z dwoma użytkownikami
 * naraz -- ma to samo TEST_PASSWORD (nie ma osobnego TEST_PASSWORD_2).
 */
async function loginAsTestUser(page, context, opts = {}) {
  // Rozróżniamy "nie podano username w ogóle" (użyj domyślnego TEST_USERNAME)
  // od "podano klucz username, ale zmienna środowiskowa jest pusta" (np.
  // TEST_USERNAME_2 brakuje w sekretach CI) -- to drugie MUSI głośno wybuchnąć,
  // bo inaczej cicho logujemy się na TO SAMO konto co "pierwszy" user, co przy
  // testach dwóch-kont (editor/viewer na współdzielonej bazie) daje mylący,
  // trudny do zdiagnozowania fail (np. "toolbar viewera jest enabled" zamiast
  // czytelnego komunikatu o brakującym sekrecie).
  if ("username" in opts && !opts.username) {
    throw new Error(
      "loginAsTestUser wywołane z jawnym { username } które jest puste -- brakuje odpowiedniej " +
      "zmiennej środowiskowej (np. TEST_USERNAME_2) w konfiguracji CI. Dodaj ją jako sekret, " +
      "inaczej test cicho zalogowałby się na domyślne TEST_USERNAME zamiast na drugie konto."
    );
  }
  const username = opts.username || process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  if (!username || !password) throw new Error("Brak TEST_USERNAME/TEST_PASSWORD w zmiennych środowiskowych");

  instrumentPage(page);
  await withE2EBypass(context);
  const res = await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  // login.js attaches #btnPrimary/#btnGuest click listeners only after an
  // async initI18n()+getUser() chain inside its DOMContentLoaded handler.
  // "domcontentloaded" fires before that chain resolves, so a click right
  // after goto can land before the listener exists — silently doing
  // nothing (no error, no navigation), which then times out at
  // waitForURL below looking like an unexplained login hang. Same root
  // cause as the #demoRestoreBtn race fixed earlier for account.js.
  await page.waitForLoadState("networkidle");
  try {
    await page.fill("#email", username, { timeout: 15000 });
  } catch (e) {
    await dumpPageDiagnostics(page, res);
    throw e;
  }
  await page.fill("#pass", password);
  await page.click("#btnPrimary");
  try {
    await page.waitForURL(/builder/, { timeout: 20000 });
  } catch (e) {
    await dumpPageDiagnostics(page, res);
    throw e;
  }
  await clearE2EBypass(context); // token już niepotrzebny, sesja jest prawdziwa
}

/** Zakłada świeże konto gościa, zostawia stronę na /builder. Gość sam wygaśnie po 5 dniach. */
async function loginAsGuest(page, context) {
  instrumentPage(page);
  await withE2EBypass(context);
  const res = await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  // See the identical comment in loginAsTestUser — #btnGuest's listener is
  // wired by the same async chain.
  await page.waitForLoadState("networkidle");
  try {
    await page.click("#btnGuest", { timeout: 15000 });
  } catch (e) {
    await dumpPageDiagnostics(page, res);
    throw e;
  }
  // Zakładanie gościa to więcej pracy po stronie backendu niż zwykłe
  // logowanie (auth signup + trigger seedujący dane demo + redirect) —
  // w CI bywa wolniejsze niż 20s, stąd dłuższy limit niż w loginAsTestUser.
  try {
    await page.waitForURL(/builder/, { timeout: 40000 });
  } catch (e) {
    await dumpPageDiagnostics(page, res);
    throw e;
  }
  await clearE2EBypass(context);
}

module.exports = { loginAsTestUser, loginAsGuest };
