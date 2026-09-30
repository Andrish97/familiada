const { test, expect } = require("@playwright/test");
const { generateE2EToken } = require("./helpers/e2e-token");
const { clearMailbox, waitForEmail, extractHttpLinks, restoreTestAccount } = require("./helpers/mailbox");
const { loginAsTestUser } = require("./helpers/login");

const PASSWORD_EMAIL = "test11@familiada.online";
const PROFILE_EMAIL = "test12@familiada.online";
const PROFILE_NEW_EMAIL = "test13@familiada.online";
const LOGIN_URL = "https://www.familiada.online/login";

test.describe.configure({ mode: "serial" });

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
    await expect(page.locator("#status")).toContainText("zapis", { timeout: 30_000 });

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
    await expect(page.locator("#status")).toContainText("Wysłano", { timeout: 30_000 });

    const [oldEmail, newEmail] = await Promise.all([
      waitForEmail({ recipient: PROFILE_EMAIL, after }),
      waitForEmail({ recipient: PROFILE_NEW_EMAIL, after }),
    ]);
    const oldLink = extractHttpLinks(oldEmail).find((link) => /\/confirm(?:[?#]|$)/.test(link));
    const newLink = extractHttpLinks(newEmail).find((link) => /\/confirm(?:[?#]|$)/.test(link));
    expect(oldLink, "mail na stary adres powinien zawierac /confirm").toBeTruthy();
    expect(newLink, "mail na nowy adres powinien zawierac /confirm").toBeTruthy();

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
