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

/**
 * Pula kont dedykowana WYŁĄCZNIE control2.spec.js — osobna od TEST_USERNAME
 * (reszta testów) i TEST_USERNAME_2 (base-explorer/bases), żeby nie
 * odtworzyć tego samego wyścigu "dwa jednoczesne logowania na jedno konto"
 * między równoległymi CI jobami. Celowo BEZ osobnego sekretu z listą
 * loginów -- konta są wyliczane wzorcem "test<N>@<domena TEST_USERNAME>"
 * (test1@…, test2@…, ...), wspólne TEST_PASSWORD jak reszta puli kont.
 * Jedyna sterowana wartość to CONTROL2_TEST_ACCOUNT_COUNT (zwykła, jawna
 * liczba w workflow, NIE sekret -- sam wzorzec loginu niczego nie
 * odsłania bez prawdziwego hasła) -- więcej równoległości = zmiana jednej
 * cyfry, zero nowych sekretów. Konta test1@…, test2@…, ... trzeba
 * oczywiście realnie założyć na produkcji, tyle ile wynosi
 * CONTROL2_TEST_ACCOUNT_COUNT. Brak TEST_USERNAME lub COUNT<1 -> pada z
 * powrotem na samo TEST_USERNAME (pula jednoelementowa == dzisiejsze
 * zachowanie reszty testów).
 */
function getControl2AccountPool() {
  const base = process.env.TEST_USERNAME || "";
  const atIdx = base.indexOf("@");
  if (atIdx === -1) return base ? [base] : [];
  const domain = base.slice(atIdx); // np. "@familiada.online"

  const count = parseInt(process.env.CONTROL2_TEST_ACCOUNT_COUNT || "1", 10);
  const n = Number.isFinite(count) && count > 0 ? count : 1;
  return Array.from({ length: n }, (_, i) => `test${i + 1}${domain}`);
}

/**
 * Loguje jako jedno z kont puli test1@…/test2@…/... (patrz
 * getControl2AccountPool), wybrane po `workerIndex` (przekaż
 * testInfo.parallelIndex z testu Playwrighta) -- różne workery równoległe
 * lądują na różnych kontach, więc nigdy nie ścigają się o to samo
 * logowanie.
 */
async function loginAsControl2TestUser(page, context, workerIndex) {
  const pool = getControl2AccountPool();
  if (!pool.length) {
    throw new Error(
      "Brak TEST_USERNAME w zmiennych środowiskowych -- control2.spec.js potrzebuje " +
      "przynajmniej jednego konta testowego (wzorzec test<N>@<domena TEST_USERNAME>)."
    );
  }
  const username = pool[workerIndex % pool.length];
  return loginAsTestUser(page, context, { username });
}

module.exports = { loginAsTestUser, loginAsGuest, loginAsControl2TestUser, getControl2AccountPool };
