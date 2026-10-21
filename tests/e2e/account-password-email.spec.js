const { expectMailDocument, escapeMailText } = require("./helpers/mail-document");
const { test, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const { generateE2EToken } = require("./helpers/e2e-token");
const { clearMailbox, waitForEmail, extractHttpLinks, restoreTestAccount } = require("./helpers/mailbox");
const { loginAsTestUser, withE2EBypass } = require("./helpers/login");

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

function expectMailInLanguage(email, copy, lang, label, typeKey, { actionPattern = /token_hash=/, vars = {} } = {}) {
  expectMailDocument(email, { lang });
  const html = email.body_html || "";
  // Znacznik wstawiany tylko przez send-email czytający tłumaczenia strony —
  // stara wersja z tekstami w kodzie (identycznymi) go nie ma. "@lang" wyklucza
  // też ciche przejście na polski przy brakującym tłumaczeniu.
  expect(html, `${label}: mail nie powstał z translation/${lang}.js`)
    .toContain(`<meta name="familiada-i18n" content="authEmail.${typeKey}@${lang}">`);
  expect(email.subject, `${label}: temat`).toBe(copy.subject);
  for (const field of ["subtitle", "title", "desc", "btn", "ignore", "footer"]) {
    const text = Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), copy[field]);
    expect(html, `${label}: brak pola ${field}`).toContain(escapeMailText(text));
  }
  const action = extractHttpLinks(email).find((link) => actionPattern.test(link));
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
    // Supabase moze wyslac albo bezposredni /login/reset?token_hash=..., albo
    // najpierw swoj /auth/v1/verify?...&redirect_to=/login/reset. Oba warianty
    // sa prawidlowym linkiem akcji i koncza na ekranie resetu.
    const resetLink = extractHttpLinks(email).find((link) =>
      /\/login\/reset(?:[?#]|$)|\/auth\/v1\/verify|token_hash=|type=recovery/i.test(link)
    );
    expect(resetLink, "mail resetu powinien zawierac link odzyskiwania").toBeTruthy();

    await page.goto(resetLink, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#form")).toBeVisible({ timeout: 30_000 });
    await page.locator("#p1").fill(temporaryPassword);
    await page.locator("#p2").fill(temporaryPassword);
    await page.locator("#save").click();
    // Po sukcesie reset.js pokazuje krotki status i automatycznie wraca do
    // /login po 900 ms; URL jest stabilniejszym sygnalem niz migajacy tekst.
    await page.waitForURL(/\/login\/?(?:[?#]|$)/, { timeout: 30_000 });

    await openLoginWithCaptchaBypass(page, context);
    await page.locator("#email").fill(PASSWORD_EMAIL);
    await page.locator("#pass").fill(temporaryPassword);
    await page.locator("#btnPrimary").click();
    await page.waitForURL(/\/games\/?(?:[?#]|$)/, { timeout: 30_000 });
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
    await expect(page.locator("#appToast")).toContainText("zapis", { timeout: 20_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-skel-step].skel-step-ready", { timeout: 20_000 });
    await expect(page.locator("#username")).toHaveValue(changedUsername);
  } finally {
    await restoreTestAccount("test12");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Zmiana e-maila: wszystko, co może zrobić użytkownik (test12 → test13, prawdziwe
// skrzynki). Bez "secure email change": link tylko na nowy adres, na stary samo
// powiadomienie. Konto test12 przywracane przed i po każdym teście.
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_URL = "https://www.familiada.online/account";
const isEmailChangeLink = (link) =>
  /\/login\/confirm(?:[?#]|$)|\/auth\/v1\/verify|token_hash=|type=email_change/i.test(link);

async function openAccount(page) {
  await page.goto(ACCOUNT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-skel-step].skel-step-ready", { timeout: 20_000 });
}

async function submitEmailChange(page, first, second = first) {
  await page.locator("#email").fill(first);
  await page.locator("#email2").fill(second);
  await page.locator("#saveEmail").click();
}

async function expectToast(page, pattern, { error = false } = {}) {
  const toast = page.locator("#appToast");
  await expect(toast).toContainText(pattern, { timeout: 30_000 });
  if (error) await expect(toast).toHaveClass(/error/);
  else await expect(toast).not.toHaveClass(/error/);
  await dismissToast(page);
}

// Błąd zostaje do kliknięcia; zamykamy, żeby następna asercja widziała nowy dymek.
async function dismissToast(page) {
  const toast = page.locator("#appToast");
  if (await toast.evaluate((el) => el.classList.contains("show")).catch(() => false)) await toast.click();
  await expect(toast).not.toHaveClass(/\bshow\b/, { timeout: 5_000 });
}

async function expectNoEmail(recipient, after, timeout = 20_000) {
  let email = null;
  try { email = await waitForEmail({ recipient, after, timeout }); } catch {}
  expect(email, `${recipient}: nie powinien dostac maila`).toBeNull();
}

// Mail na stary adres: powiadomienie z nowym adresem i linkiem do logowania, bez potwierdzenia.
function expectOldAddressNotice(email) {
  const html = email.body_html || "";
  expect(html).toContain('content="authEmail.emailChangeNotice@pl"');
  expect(html).toContain(escapeMailText(PROFILE_NEW_EMAIL));
  const links = extractHttpLinks(email);
  expect(links.find(isEmailChangeLink), "stary adres: bez linku potwierdzajacego").toBeFalsy();
  const loginLink = links.find((link) => /\/login\/\?lang=pl/.test(link));
  expect(loginLink, "stary adres: link do logowania").toBeTruthy();
  return loginLink;
}

function confirmLinkFrom(email) {
  expect(email.body_html || "").toContain('content="authEmail.emailChange@pl"');
  const link = extractHttpLinks(email).find(isEmailChangeLink);
  expect(link, "nowy adres: link potwierdzajacy").toBeTruthy();
  return link;
}

async function openConfirmLink(browser, link) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link, { waitUntil: "domcontentloaded" });
  const status = page.locator("#status");
  await expect(status).not.toHaveText(/^\s*$|aktywuj|sprawdzam/i, { timeout: 20_000 });
  await page.waitForTimeout(1_500);
  const text = (await status.textContent()) || "";
  await context.close();
  return text;
}

async function expectLoginFails(browser, username) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await withE2EBypass(context);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const status = document.querySelector("#status")?.textContent?.trim() || "";
    return !document.documentElement.classList.contains("page-loading") && !!status && !/checking|sprawdzam/i.test(status);
  }, null, { timeout: 20_000 });
  await page.fill("#email", username);
  await page.fill("#pass", process.env.TEST_PASSWORD);
  await page.click("#btnPrimary");
  await expect(page.locator("#err")).not.toBeEmpty({ timeout: 20_000 });
  expect(page.url()).not.toMatch(/\/games/);
  await context.close();
}

async function currentAuthEmail(page) {
  return page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user?.email);
}

async function releaseEmailCooldown(page) {
  await page.evaluate(async () => {
    const { error } = await window.__sbClient.rpc("cooldown_release", { p_action_key: "account:email", p_max_age_seconds: 7200 });
    if (error) throw new Error("cooldown_release: " + error.message);
  });
}

async function startEmailChangeTest(testInfo) {
  await restoreTestAccount("test12");
  await clearMailbox(PROFILE_EMAIL);
  await clearMailbox(PROFILE_NEW_EMAIL);
  await waitForAuthMailSlot("test12", testInfo);
}

async function finishEmailChangeTest() {
  await restoreTestAccount("test12");
  await clearMailbox(PROFILE_EMAIL);
  await clearMailbox(PROFILE_NEW_EMAIL);
}

test("zmiana e-maila: bledne dane nic nie wysylaja", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  await startEmailChangeTest(testInfo);
  const after = new Date(Date.now() - 2_000).toISOString();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAsTestUser(page, context, { username: PROFILE_EMAIL });
    await openAccount(page);

    await submitEmailChange(page, "test13familiada.online");
    await expectToast(page, "Podaj poprawny e-mail", { error: true });

    await submitEmailChange(page, PROFILE_EMAIL.toUpperCase(), PROFILE_EMAIL);
    await expectToast(page, "To jest Twój obecny adres e-mail", { error: true });

    await submitEmailChange(page, PROFILE_NEW_EMAIL, "test13@familiada.onlin");
    await expectToast(page, "Adresy e-mail nie są takie same", { error: true });

    // Adres zajęty przez inne konto: błąd z serwera, nic nie zostaje w toku.
    await submitEmailChange(page, "test1@familiada.online");
    const toast = page.locator("#appToast");
    await expect(toast).toHaveClass(/\bshow\b/, { timeout: 30_000 });
    await expect(toast).toHaveClass(/error/);
    console.log("[e2e-diag] zajety adres:", (await toast.textContent())?.trim());

    await openAccount(page);
    await expect(page.locator("#emailPendingActions")).toBeHidden();
    await expect(page.locator("#emailCooldown")).toBeHidden();
    await expect(page.locator("#email")).toHaveValue(PROFILE_EMAIL);
    await expectNoEmail(PROFILE_EMAIL, after);
    await expectNoEmail(PROFILE_NEW_EMAIL, after, 5_000);
  } finally {
    await context.close().catch(() => {});
    await finishEmailChangeTest();
  }
});

test("zmiana e-maila: pelna zmiana, maile, link raz, logowanie nowym adresem", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  await startEmailChangeTest(testInfo);
  const after = new Date(Date.now() - 2_000).toISOString();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAsTestUser(page, context, { username: PROFILE_EMAIL });
    await openAccount(page);
    // Wielkość liter i spacje nie mają znaczenia przy porównaniu pól.
    await submitEmailChange(page, ` ${PROFILE_NEW_EMAIL.toUpperCase()} `, PROFILE_NEW_EMAIL);
    lastAuthMailAt.set("test12", Date.now());
    await expectToast(page, "Wysłano");

    await openAccount(page);
    await expect(page.locator("#emailPendingActions")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#emailActions")).toBeHidden();
    await expect(page.locator("#email")).toHaveValue(PROFILE_NEW_EMAIL);
    await expect(page.locator("#emailPendingHint")).toContainText(PROFILE_NEW_EMAIL);

    const [oldEmail, newEmail] = await Promise.all([
      waitForEmail({ recipient: PROFILE_EMAIL, after }),
      waitForEmail({ recipient: PROFILE_NEW_EMAIL, after }),
    ]);
    const loginLink = expectOldAddressNotice(oldEmail);
    const confirmLink = confirmLinkFrom(newEmail);

    // Przycisk z powiadomienia prowadzi na stronę logowania.
    const noticeContext = await browser.newContext();
    const noticePage = await noticeContext.newPage();
    const res = await noticePage.goto(loginLink, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(400);
    await expect(noticePage.locator("#btnPrimary")).toBeVisible({ timeout: 20_000 });
    await noticeContext.close();

    // Przed potwierdzeniem nadal loguje stary adres.
    expect(await currentAuthEmail(page)).toBe(PROFILE_EMAIL);
    await context.close();

    const first = await openConfirmLink(browser, confirmLink);
    expect(first, "pierwsze klikniecie linku").toMatch(/gotowe/i);
    const second = await openConfirmLink(browser, confirmLink);
    expect(second, "drugie klikniecie tego samego linku").not.toMatch(/gotowe/i);

    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginAsTestUser(loginPage, loginContext, { username: PROFILE_NEW_EMAIL });
    expect(await currentAuthEmail(loginPage)).toBe(PROFILE_NEW_EMAIL);
    await openAccount(loginPage);
    await expect(loginPage.locator("#email")).toHaveValue(PROFILE_NEW_EMAIL);
    await expect(loginPage.locator("#emailPendingActions")).toBeHidden();
    await loginContext.close();

    await expectLoginFails(browser, PROFILE_EMAIL);
    // Po potwierdzeniu nikt nie dostaje kolejnych maili.
    const afterConfirm = new Date().toISOString();
    await expectNoEmail(PROFILE_EMAIL, afterConfirm, 10_000);
  } finally {
    await context.close().catch(() => {});
    await finishEmailChangeTest();
  }
});

test("zmiana e-maila: ponowne wyslanie uniewaznia stary link, anulowanie nowy", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  await startEmailChangeTest(testInfo);
  const after = new Date(Date.now() - 2_000).toISOString();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAsTestUser(page, context, { username: PROFILE_EMAIL });
    await openAccount(page);
    await submitEmailChange(page, PROFILE_NEW_EMAIL);
    lastAuthMailAt.set("test12", Date.now());
    await expectToast(page, "Wysłano");
    const [oldEmail, newEmail] = await Promise.all([
      waitForEmail({ recipient: PROFILE_EMAIL, after }),
      waitForEmail({ recipient: PROFILE_NEW_EMAIL, after }),
    ]);
    expectOldAddressNotice(oldEmail);
    const firstLink = confirmLinkFrom(newEmail);

    // "Minęła godzina" (ta sama RPC co rollback w account.js) i odstęp GoTrue.
    await releaseEmailCooldown(page);
    await waitForAuthMailSlot("test12", testInfo);
    await openAccount(page);
    await expect(page.locator("#resendEmailChange")).toBeEnabled({ timeout: 15_000 });
    const resendAfter = new Date(Date.now() - 1_000).toISOString();
    await page.locator("#resendEmailChange").click();
    lastAuthMailAt.set("test12", Date.now());
    await expectToast(page, "Wysłano ponownie");
    await expect(page.locator("#emailCooldown")).toBeVisible({ timeout: 15_000 });

    const resent = await waitForEmail({ recipient: PROFILE_NEW_EMAIL, after: resendAfter });
    const secondLink = confirmLinkFrom(resent);
    expect(secondLink).not.toBe(firstLink);
    let resentNotice = null;
    try { resentNotice = await waitForEmail({ recipient: PROFILE_EMAIL, after: resendAfter, timeout: 20_000 }); } catch {}
    if (resentNotice) expectOldAddressNotice(resentNotice);
    console.log("[e2e-diag] powiadomienie na stary adres po ponownym wyslaniu:", !!resentNotice);

    const oldLinkStatus = await openConfirmLink(browser, firstLink);
    expect(oldLinkStatus, "link sprzed ponownego wyslania").not.toMatch(/gotowe/i);

    await page.locator("#cancelEmailChange").click();
    await expectToast(page, "Anulowano zmianę e-maila");
    const newLinkStatus = await openConfirmLink(browser, secondLink);
    expect(newLinkStatus, "link po anulowaniu").not.toMatch(/gotowe/i);

    await openAccount(page);
    await expect(page.locator("#emailPendingActions")).toBeHidden({ timeout: 15_000 });
    expect(await currentAuthEmail(page)).toBe(PROFILE_EMAIL);
  } finally {
    await context.close().catch(() => {});
    await finishEmailChangeTest();
  }
});

test("zmiana e-maila: anulowanie z drugiego urzadzenia, blokada, link niewazny", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  await startEmailChangeTest(testInfo);
  const after = new Date(Date.now() - 2_000).toISOString();
  const context = await browser.newContext();
  const page = await context.newPage();
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  try {
    await loginAsTestUser(page, context, { username: PROFILE_EMAIL });
    await openAccount(page);
    await submitEmailChange(page, PROFILE_NEW_EMAIL);
    lastAuthMailAt.set("test12", Date.now());
    await expectToast(page, "Wysłano");

    // Blokada 1 h: licznik widoczny, "Wyślij ponownie" wyłączone, "Anuluj" dostępne.
    await openAccount(page);
    await expect(page.locator("#emailCooldown")).toContainText("Ponowna akcja możliwa za", { timeout: 15_000 });
    await expect(page.locator("#resendEmailChange")).toBeDisabled();
    await expect(page.locator("#cancelEmailChange")).toBeEnabled();

    const [, newEmail] = await Promise.all([
      waitForEmail({ recipient: PROFILE_EMAIL, after }),
      waitForEmail({ recipient: PROFILE_NEW_EMAIL, after }),
    ]);
    const confirmLink = confirmLinkFrom(newEmail);

    // Drugie urządzenie widzi zmianę w toku i ją anuluje.
    await loginAsTestUser(otherPage, otherContext, { username: PROFILE_EMAIL });
    await openAccount(otherPage);
    await expect(otherPage.locator("#emailPendingActions")).toBeVisible({ timeout: 15_000 });
    await expect(otherPage.locator("#email")).toHaveValue(PROFILE_NEW_EMAIL);
    await otherPage.locator("#cancelEmailChange").click();
    await expectToast(otherPage, "Anulowano zmianę e-maila");

    // Pierwsze urządzenie po odświeżeniu: brak zmiany w toku, stary adres.
    await openAccount(page);
    await expect(page.locator("#emailPendingActions")).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("#email")).toHaveValue(PROFILE_EMAIL);

    const status = await openConfirmLink(browser, confirmLink);
    expect(status, "link po anulowaniu").toMatch(/anulowana|nie udało/i);

    await otherContext.close();
    await context.close();
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginAsTestUser(loginPage, loginContext, { username: PROFILE_EMAIL });
    expect(await currentAuthEmail(loginPage)).toBe(PROFILE_EMAIL);
    await loginContext.close();
  } finally {
    await otherContext.close().catch(() => {});
    await context.close().catch(() => {});
    await finishEmailChangeTest();
  }
});

test("Auth: reset hasla dociera przy wylaczonych powiadomieniach", async ({ page, context }) => {
  test.setTimeout(180_000);
  let previousFlag;
  await restoreTestAccount("test11");
  await clearMailbox(PASSWORD_EMAIL);
  try {
    await loginAsTestUser(page, context, { username: PASSWORD_EMAIL });
    previousFlag = await page.evaluate(async () => {
      const sb = window.__sbClient;
      const { data: { user } } = await sb.auth.getUser();
      const { data, error } = await sb.from("user_flags").select("email_notifications").eq("user_id", user.id).single();
      if (error) throw error;
      return data.email_notifications;
    });
    await page.evaluate(async () => {
      const sb = window.__sbClient;
      const { data: { user } } = await sb.auth.getUser();
      const updated = await sb.from("user_flags").update({ email_notifications: false }).eq("user_id", user.id).select("email_notifications").single();
      if (updated.error) throw updated.error;
      if (updated.data.email_notifications !== false) throw new Error("Notification flag was not disabled");
      await sb.auth.signOut();
    });
    const after = new Date(Date.now() - 2_000).toISOString();
    await openLoginWithCaptchaBypass(page, context);
    await page.locator("#email").fill(PASSWORD_EMAIL);
    await page.locator("#btnForgot").click();
    await expect(page.locator("#status")).toContainText("Wysłano", { timeout: 30_000 });
    const email = await waitForEmail({ recipient: PASSWORD_EMAIL, after, subject: /has|reset|odzysk/i });
    expectMailDocument(email, { lang: "pl" });
    expect(email.body_html).not.toContain("data-familiada-mail-center");
    expect(extractHttpLinks(email).some(link => /token_hash=|type=recovery/.test(link))).toBeTruthy();
  } finally {
    if (previousFlag !== undefined) {
      await loginAsTestUser(page, context, { username: PASSWORD_EMAIL });
      await page.evaluate(async (enabled) => {
        const sb = window.__sbClient;
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from("user_flags").update({ email_notifications: enabled }).eq("user_id", user.id);
        if (error) throw error;
      }, previousFlag);
    }
    await restoreTestAccount("test11");
    await clearMailbox(PASSWORD_EMAIL);
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
      await page.locator("#email2").fill(PROFILE_NEW_EMAIL);
      await page.locator("#saveEmail").click();
      lastAuthMailAt.set("test12", Date.now());

      // Linków nie klikamy — przepływ sprawdza test PL wyżej; restore cofa zmianę.
      const [oldEmail, newEmail] = await Promise.all([
        waitForEmail({ recipient: PROFILE_EMAIL, after }),
        waitForEmail({ recipient: PROFILE_NEW_EMAIL, after }),
      ]);
      expectMailInLanguage(oldEmail, authEmail.emailChangeNotice, lang, `zmiana e-maila ${lang} (powiadomienie na stary adres)`,
        "emailChangeNotice", { actionPattern: /\/login\/\?lang=/, vars: { email: PROFILE_NEW_EMAIL } });
      expectMailInLanguage(newEmail, authEmail.emailChange, lang, `zmiana e-maila ${lang} (nowy adres)`, "emailChange");
    } finally {
      await restoreTestAccount("test12");
      await clearMailbox(PROFILE_EMAIL);
      await clearMailbox(PROFILE_NEW_EMAIL);
    }
  });
}
