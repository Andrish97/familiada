const { test, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const { generateE2EToken } = require("./helpers/e2e-token");
const { clearMailbox, waitForEmail, extractHttpLinks, restoreTestAccount } = require("./helpers/mailbox");
const { loginAsTestUser } = require("./helpers/login");

const PASSWORD_EMAIL = "test11@familiada.online";
const PROFILE_EMAIL = "test12@familiada.online";
const PROFILE_NEW_EMAIL = "test13@familiada.online";
const LOGIN_URL = "https://www.familiada.online/login";

test.describe.configure({ mode: "serial" });

// ─────────────────────────────────────────────────────────────────────────────
// Treść maili auth we wszystkich językach. send-email bierze teksty z sekcji
// authEmail w translation/<lang>.js (pobieranej ze strony w trakcie działania),
// więc tu sprawdzamy, że prawdziwy mail w danym języku ma dokładnie te teksty
// i link z tym samym ?lang=. Testy przepływu niżej (kliknięcie linku) działają
// po polsku; testy na końcu pliku sprawdzają język treści.
// ─────────────────────────────────────────────────────────────────────────────

const MAIL_LANGS = ["pl", "en", "uk"];
// GoTrue nie wyśle kolejnego maila auth temu samemu użytkownikowi szybciej
// niż co ~60 s (SMTP max frequency) — restoreTestAccount czyści tylko nasze
// cooldowny, nie ten. Odstęp z zapasem.
const AUTH_MAIL_GAP_MS = 65_000;
const lastAuthMailAt = new Map();

async function loadAuthEmailCopy(lang) {
  // translation/*.js to ESM bez "type": "module" — Node 20 w CI nie wykrywa
  // tego sam, więc import przez data: URL (jak w tests/unit/gamesRename.test.js).
  const src = fs.readFileSync(path.resolve(__dirname, "../../web/shared/translation", `${lang}.js`), "utf8");
  const dict = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;
  return { authEmail: dict.authEmail, index: dict.index };
}

async function waitForAuthMailSlot(account, testInfo) {
  // Po porażce Playwright restartuje workera (mapa znika) — przy retry czekamy zawsze.
  const last = lastAuthMailAt.get(account) ?? (testInfo.retry > 0 ? Date.now() : 0);
  const wait = last + AUTH_MAIL_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

function expectMailInLanguage(email, copy, lang, label, typeKey) {
  const html = (email.body_html || "").replace(/&amp;/g, "&");
  // Znacznik wstawiany tylko przez send-email czytający tłumaczenia strony —
  // stara wersja z tekstami w kodzie (identycznymi) go nie ma. "@lang" wyklucza
  // też ciche przejście na polski przy brakującym tłumaczeniu.
  expect(html, `${label}: mail nie powstał z translation/${lang}.js`)
    .toContain(`<meta name="familiada-i18n" content="authEmail.${typeKey}@${lang}">`);
  expect(email.subject, `${label}: temat`).toBe(copy.subject);
  for (const field of ["subtitle", "title", "desc", "btn", "ignore", "footer"]) {
    expect(html, `${label}: brak pola ${field}`).toContain(copy[field]);
  }
  const action = extractHttpLinks(email).find((link) => /token_hash=/.test(link));
  expect(action, `${label}: brak linku akcji`).toBeTruthy();
  expect(new URL(action).searchParams.get("lang"), `${label}: lang w linku`).toBe(lang);
}

async function openLoginWithCaptchaBypass(page, context) {
  const secret = process.env.E2E_BYPASS_SECRET;
  await context.addInitScript(() => localStorage.setItem("uiLang", "pl"));
  await context.setExtraHTTPHeaders({ "X-E2E-Token": generateE2EToken(secret) });
  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await context.setExtraHTTPHeaders({});
}

test("konto test11: reset hasla przez prawdziwy e-mail i przywrocenie stanu", async ({ page, context }) => {
  test.setTimeout(180_000);
  const temporaryPassword = `E2e-${Date.now()}-Aa!`;

  await restoreTestAccount("test11");
  await clearMailbox(PASSWORD_EMAIL);
  const after = new Date(Date.now() - 2_000).toISOString();

  try {
    await openLoginWithCaptchaBypass(page, context);
    await page.locator("#email").fill(PASSWORD_EMAIL);
    await page.locator("#btnForgot").click();
    lastAuthMailAt.set("test11", Date.now());
    await expect(page.locator("#status")).toContainText("Wysłano", { timeout: 30_000 });

    const email = await waitForEmail({ recipient: PASSWORD_EMAIL, after, subject: /has|reset|odzysk/i });
    // Supabase moze wyslac albo bezposredni /reset?token_hash=..., albo
    // najpierw swoj /auth/v1/verify?...&redirect_to=/reset. Oba warianty
    // sa prawidlowym linkiem akcji i koncza na ekranie resetu.
    const resetLink = extractHttpLinks(email).find((link) =>
      /\/reset(?:[?#]|$)|\/auth\/v1\/verify|token_hash=|type=recovery/i.test(link)
    );
    expect(resetLink, "mail resetu powinien zawierac link odzyskiwania").toBeTruthy();

    await page.goto(resetLink, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#form")).toBeVisible({ timeout: 30_000 });
    await page.locator("#p1").fill(temporaryPassword);
    await page.locator("#p2").fill(temporaryPassword);
    await page.locator("#save").click();
    // Po sukcesie reset.js pokazuje krotki status i automatycznie wraca do
    // /login po 900 ms; URL jest stabilniejszym sygnalem niz migajacy tekst.
    await page.waitForURL(/\/login(?:[?#]|$)/, { timeout: 30_000 });

    await openLoginWithCaptchaBypass(page, context);
    await page.locator("#email").fill(PASSWORD_EMAIL);
    await page.locator("#pass").fill(temporaryPassword);
    await page.locator("#btnPrimary").click();
    await page.waitForURL(/\/games(?:[?#]|$)/, { timeout: 30_000 });
  } finally {
    await restoreTestAccount("test11");
    await clearMailbox(PASSWORD_EMAIL);
  }
});

test("konto test12: zmiana nazwy i administracyjne przywrocenie", async ({ page, context }) => {
  const changedUsername = `e2e_${Date.now()}`;
  await restoreTestAccount("test12");

  try {
    await loginAsTestUser(page, context, { username: PROFILE_EMAIL });
    await page.goto("https://www.familiada.online/account", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-skel-step].skel-step-ready", { timeout: 20_000 });
    await page.locator("#username").fill(changedUsername);
    await page.locator("#saveUsername").click();
    await expect(page.locator("#status")).toContainText("zapis", { timeout: 20_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-skel-step].skel-step-ready", { timeout: 20_000 });
    await expect(page.locator("#username")).toHaveValue(changedUsername);
  } finally {
    await restoreTestAccount("test12");
  }
});

test("konto test12: zmiana e-maila przez wiadomosci test12 i test13", async ({ browser }) => {
  test.setTimeout(180_000);
  await restoreTestAccount("test12");
  await clearMailbox(PROFILE_EMAIL);
  await clearMailbox(PROFILE_NEW_EMAIL);
  const after = new Date(Date.now() - 2_000).toISOString();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginAsTestUser(page, context, { username: PROFILE_EMAIL });
    await page.goto("https://www.familiada.online/account", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-skel-step].skel-step-ready", { timeout: 20_000 });
    await page.locator("#email").fill(PROFILE_NEW_EMAIL);
    await page.locator("#saveEmail").click();
    lastAuthMailAt.set("test12", Date.now());
    await expect(page.locator("#status")).toContainText("Wysłano", { timeout: 30_000 });

    const [oldEmail, newEmail] = await Promise.all([
      waitForEmail({ recipient: PROFILE_EMAIL, after }),
      waitForEmail({ recipient: PROFILE_NEW_EMAIL, after }),
    ]);
    const isEmailChangeLink = (link) =>
      /\/confirm(?:[?#]|$)|\/auth\/v1\/verify|token_hash=|type=email_change/i.test(link);
    const oldLink = extractHttpLinks(oldEmail).find(isEmailChangeLink);
    const newLink = extractHttpLinks(newEmail).find(isEmailChangeLink);
    expect(oldLink, "mail na stary adres powinien zawierac link potwierdzajacy").toBeTruthy();
    expect(newLink, "mail na nowy adres powinien zawierac link potwierdzajacy").toBeTruthy();

    await context.close();
    for (const link of [oldLink, newLink]) {
      const confirmContext = await browser.newContext();
      const confirmPage = await confirmContext.newPage();
      await confirmPage.goto(link, { waitUntil: "domcontentloaded" });
      await confirmPage.waitForTimeout(2_000);
      const status = await confirmPage.locator("#status").textContent();
      expect(status || "").not.toMatch(/nieprawid|błąd|wygas/i);
      await confirmContext.close();
    }

    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginAsTestUser(loginPage, loginContext, { username: PROFILE_NEW_EMAIL });
    await expect(loginPage).toHaveURL(/\/games(?:[?#]|$)/);
    await loginContext.close();
  } finally {
    await context.close().catch(() => {});
    await restoreTestAccount("test12");
    await clearMailbox(PROFILE_EMAIL);
    await clearMailbox(PROFILE_NEW_EMAIL);
  }
});

for (const lang of MAIL_LANGS) {
  test(`mail resetu hasla (${lang}) ma teksty z translation/${lang}.js`, async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    const { authEmail, index } = await loadAuthEmailCopy(lang);

    await restoreTestAccount("test11");
    await clearMailbox(PASSWORD_EMAIL);
    await waitForAuthMailSlot("test11", testInfo);
    const after = new Date(Date.now() - 2_000).toISOString();

    try {
      const secret = process.env.E2E_BYPASS_SECRET;
      await context.addInitScript((l) => localStorage.setItem("uiLang", l), lang);
      await context.setExtraHTTPHeaders({ "X-E2E-Token": generateE2EToken(secret) });
      await page.goto(lang === "pl" ? LOGIN_URL : `${LOGIN_URL}?lang=${lang}`, { waitUntil: "networkidle" });
      await context.setExtraHTTPHeaders({});

      await page.locator("#email").fill(PASSWORD_EMAIL);
      await page.locator("#btnForgot").click();
      lastAuthMailAt.set("test11", Date.now());
      await expect(page.locator("#status")).toContainText(index.statusResetSent, { timeout: 30_000 });

      const email = await waitForEmail({ recipient: PASSWORD_EMAIL, after });
      expectMailInLanguage(email, authEmail.recovery, lang, `reset ${lang}`, "recovery");
    } finally {
      await restoreTestAccount("test11");
      await clearMailbox(PASSWORD_EMAIL);
    }
  });
}

for (const lang of MAIL_LANGS) {
  test(`maile zmiany e-maila (${lang}) maja teksty z translation/${lang}.js`, async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    const { authEmail } = await loadAuthEmailCopy(lang);

    await restoreTestAccount("test12");
    await clearMailbox(PROFILE_EMAIL);
    await clearMailbox(PROFILE_NEW_EMAIL);
    await waitForAuthMailSlot("test12", testInfo);
    const after = new Date(Date.now() - 2_000).toISOString();

    try {
      await loginAsTestUser(page, context, { username: PROFILE_EMAIL });
      // ?lang= ma pierwszeństwo przed uiLang=pl ustawianym przez loginAsTestUser.
      await page.goto(`https://www.familiada.online/account${lang === "pl" ? "" : `?lang=${lang}`}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-skel-step].skel-step-ready", { timeout: 20_000 });
      await page.locator("#email").fill(PROFILE_NEW_EMAIL);
      await page.locator("#saveEmail").click();
      lastAuthMailAt.set("test12", Date.now());

      // Linków nie klikamy — przepływ sprawdza test PL wyżej; restore cofa zmianę.
      const [oldEmail, newEmail] = await Promise.all([
        waitForEmail({ recipient: PROFILE_EMAIL, after }),
        waitForEmail({ recipient: PROFILE_NEW_EMAIL, after }),
      ]);
      expectMailInLanguage(oldEmail, authEmail.emailChange, lang, `zmiana e-maila ${lang} (stary adres)`, "emailChange");
      expectMailInLanguage(newEmail, authEmail.emailChange, lang, `zmiana e-maila ${lang} (nowy adres)`, "emailChange");
    } finally {
      await restoreTestAccount("test12");
      await clearMailbox(PROFILE_EMAIL);
      await clearMailbox(PROFILE_NEW_EMAIL);
    }
  });
}
