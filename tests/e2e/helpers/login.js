// tests/e2e/helpers/login.js
const { generateE2EToken } = require("./e2e-token");

const LOGIN_URL = "https://www.familiada.online/login";

// Domena kont testowych jest zawsze taka sama -- produkcja to zawsze
// familiada.online -- więc jest to stała w kodzie, nie sekret. Dzięki temu
// CI potrzebuje tylko DWÓCH sekretów w ogóle: E2E_BYPASS_SECRET i
// TEST_PASSWORD. Loginy (test1@…, test2@…, ...) same w sobie niczego nie
// odsłaniają bez prawdziwego hasła.
const TEST_ACCOUNT_DOMAIN = "familiada.online";

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
    // "[e2e-diag-state]" to TYMCZASOWA diagnostyka w control2/js/app.js
    // (console.log, nie warning/error -- inaczej niewidoczne wyżej) --
    // loguje KAŻDĄ zmianę store.state.step z realnym timestampem, żeby
    // rozstrzygnąć, czy stan lokalnie dochodzi do "r_roundStart" (bug w
    // renderze) czy nigdy tam nie dociera (bug wcześniej w łańcuchu).
    else if (msg.text().startsWith("[e2e-diag-state]")) {
      console.log(msg.text());
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      console.log("[e2e-diag] HTTP", res.status(), res.url());
    }
    // Wołania RPC (np. game_state_write) logowane ZAWSZE, nie tylko przy
    // błędzie -- żeby odróżnić "RPC w ogóle nie wystrzeliło" od "wystrzeliło,
    // dostało 200, ale zajęło podejrzanie długo" od zwykłego "poszło szybko
    // i OK". Sam status/URL nie ujawnia tokenu bypass (ten jest w nagłówku
    // żądania, nigdzie tu nielogowanym).
    if (res.url().includes("/rpc/")) {
      console.log(`[e2e-diag] rpc ${res.status()}`, res.url());
    }
    // game_state_write: 200 NIE dowodzi, że zwrócony wiersz faktycznie ma
    // oczekiwany step -- loguj TREŚĆ odpowiedzi (tylko pola stanu, nie całe
    // detail), żeby odróżnić "serwer zapisał coś innego niż wysłaliśmy" od
    // "serwer zapisał poprawnie, ale UI się nie przerysowało". Async handler
    // na "response" jest przez Playwrighta obsługiwany poprawnie (nie trzeba
    // czekać na niego explicite).
    if (res.url().includes("/rpc/game_state_write") && res.status() < 400) {
      res.json().then((body) => {
        const row = Array.isArray(body) ? body[0] : body;
        console.log("[e2e-diag] game_state_write ->", JSON.stringify({
          rev: row?.rev, step: row?.step, phase: row?.phase, top_card: row?.top_card,
          sound_cue_key: row?.sound_cue_key, sound_cue_seq: row?.sound_cue_seq,
        }));
      }).catch((e) => console.log("[e2e-diag] game_state_write body read failed:", e.message));
    }
  });
  // Zerwane na poziomie sieci (DNS, reset połączenia, timeout w samej
  // przeglądarce) -- NIE trafia do "response" wyżej wcale, bo nigdy nie
  // dostało odpowiedzi. To jest inna dziura niż "HTTP >=400": żądanie mogło
  // po prostu zniknąć bez śladu.
  page.on("requestfailed", (req) => {
    console.log("[e2e-diag] requestfailed", req.failure()?.errorText, req.url());
  });
  // control2/js/app.js's handleAction() łapie KAŻDY błąd akcji w try/catch
  // i pokazuje go operatorowi jako goły window.alert(`Błąd: ${e.message}`)
  // -- Playwright domyślnie po cichu odrzuca takie dialogi (auto-dismiss),
  // więc bez tego listenera taki błąd jest CAŁKOWICIE niewidoczny w logu CI
  // (nie pageerror, nie console.error -- alert() nie trafia do żadnego z
  // nich). Znalezione na żywo: 10/16 testów control2 utykało bez śladu
  // błędu w logach, mimo realnego, powtarzalnego zawieszenia stanu gry --
  // to jest dokładnie ta luka w diagnostyce.
  page.on("dialog", (dialog) => {
    console.log(`[e2e-diag] dialog:${dialog.type()}`, dialog.message());
    dialog.dismiss().catch(() => {});
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
 * Loguje jako konto testowe (domyślnie test1@familiada.online, patrz
 * testAccountUsername), zostawia stronę na /builder. Przekaż
 * { username: testAccountUsername(2) } żeby zalogować INNE konto z puli
 * w scenariuszach z dwoma+ użytkownikami naraz -- wszystkie konta puli
 * mają to samo TEST_PASSWORD (nie ma osobnych haseł per konto).
 */
async function loginAsTestUser(page, context, opts = {}) {
  // Rozróżniamy "nie podano username w ogóle" (użyj domyślnego test1@…) od
  // "podano klucz username, ale wartość jest pusta" -- to drugie MUSI
  // głośno wybuchnąć, bo inaczej cicho logujemy się na domyślne konto
  // zamiast na to, o które faktycznie chodziło, co przy testach
  // wielokontowych (editor/viewer na współdzielonej bazie) daje mylący,
  // trudny do zdiagnozowania fail.
  if ("username" in opts && !opts.username) {
    throw new Error(
      "loginAsTestUser wywołane z jawnym { username } które jest puste -- sprawdź wywołanie " +
      "testAccountUsername(n), inaczej test cicho zalogowałby się na domyślne konto zamiast na " +
      "to, o które chodziło."
    );
  }
  const username = opts.username || testAccountUsername(1);
  const password = process.env.TEST_PASSWORD;
  if (!username || !password) throw new Error("Brak TEST_PASSWORD w zmiennych środowiskowych");

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
 * Login n-tego konta z globalnej puli testX (1-indeksowane) —
 * test1@familiada.online, test2@familiada.online, ..., do test10.
 * Wszystkie z tym samym TEST_PASSWORD. Domena jest stałą w kodzie (patrz
 * TEST_ACCOUNT_DOMAIN), więc wygenerowanie loginu nie zależy od żadnego
 * sekretu -- sam login bez prawdziwego hasła niczego nie odsłania.
 * Dowolny plik/filtr testów może użyć DOWOLNEGO numeru z całej puli 1-10 —
 * brak sztywnego podziału/rezerwacji między plikami. Konta trzeba
 * oczywiście realnie założyć na produkcji, tyle ile faktycznie
 * wykorzystywane.
 */
function testAccountUsername(n) {
  return `test${n}@${TEST_ACCOUNT_DOMAIN}`;
}

/**
 * Pula N kolejnych kont z testX (test1, test2, ..., testN) do prawdziwej
 * równoległości WEWNĄTRZ jednego pliku testów -- każdy worker Playwrighta
 * loguje się na inne konto, więc nikt nie czeka w kolejce za cudzym
 * logowaniem. Rozmiar sterowany jedną, jawną (NIE sekretną) liczbą w
 * workflow -- TEST_ACCOUNT_COUNT -- więcej równoległości = zmiana jednej
 * cyfry, bez zmian w kodzie. COUNT<1 -> pula jednoelementowa (samo test1).
 */
function getTestAccountPool() {
  const count = parseInt(process.env.TEST_ACCOUNT_COUNT || "1", 10);
  const n = Number.isFinite(count) && count > 0 ? count : 1;
  return Array.from({ length: n }, (_, i) => testAccountUsername(i + 1));
}

/**
 * Loguje jako jedno z kont puli testX (patrz getTestAccountPool), wybrane
 * po `workerIndex` (przekaż testInfo.parallelIndex z testu Playwrighta) --
 * różne workery równoległe lądują na różnych kontach, więc nigdy nie
 * ścigają się o to samo logowanie. Używane dziś przez control2.spec.js,
 * ale nie jest do niego przywiązane -- każdy plik może po to sięgnąć.
 */
async function loginAsPooledTestUser(page, context, workerIndex) {
  const pool = getTestAccountPool();
  const username = pool[workerIndex % pool.length];
  return loginAsTestUser(page, context, { username });
}

module.exports = {
  loginAsTestUser,
  loginAsGuest,
  loginAsPooledTestUser,
  getTestAccountPool,
  testAccountUsername,
};
