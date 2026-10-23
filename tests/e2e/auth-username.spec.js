// P2 (audyt E24, B7): logowanie i reset hasła nazwą użytkownika przez Worker
// (/_api/auth/*) -- przeglądarka nigdy nie dostaje adresu e-mail konta.
// Kod strony logowania z brancha (serveBranchCode), Worker i baza produkcyjne.
// Konto disposable (reset hasła wysyła mail na adres konta -- plan E25 §1).
const { test, expect } = require("./helpers/e2e-test");
const { withE2EBypass, instrumentPage } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", needs: { disposable: 1, resources: ["mail"] } });
const LOGIN_URL = "https://www.familiada.online/login";

async function openLogin(browser) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main") await serveBranchCode(context, { pages: [] });
  await withE2EBypass(context);
  const page = await context.newPage();
  instrumentPage(page);
  const authResponses = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/_api/auth/") && !res.url().includes("/rpc/profile_login_to_email")) return;
    authResponses.push({ path: new URL(res.url()).pathname, status: res.status(), text: await res.text().catch(() => "") });
  });
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const status = document.querySelector("#status")?.textContent?.trim() || "";
    return !document.documentElement.classList.contains("page-loading") && !!status && !/checking|sprawdzam|перевіряю/i.test(status);
  }, null, { timeout: 20000 });
  return { context, page, authResponses };
}

async function submitAndReadError(page, login, password) {
  await page.fill("#email", login);
  await page.fill("#pass", password);
  await page.locator("#err").evaluate((el) => { el.textContent = ""; });
  await page.click("#btnPrimary");
  await expect(page.locator("#err")).not.toHaveText("", { timeout: 20000 });
  return (await page.locator("#err").textContent()).trim();
}

test("P2 B7: logowanie i reset hasła nazwą użytkownika bez ujawniania adresu e-mail", async ({ page, context, browser, accounts, loginAs }) => {
  test.setTimeout(180000);
  const [account] = accounts.disposable;
  await loginAs(page, context, account);
  const own = await page.evaluate(async () => {
    const client = window.__sbClient;
    const user = (await client.auth.getUser()).data.user;
    const { data, error } = await client.from("profiles").select("username").eq("id", user.id).single();
    if (error) throw new Error(error.message);
    return { id: user.id, email: user.email, username: data.username };
  });
  expect(own.username).toBeTruthy();
  expect(own.username).toBe(account.username);
  expect(own.username).not.toContain("@");

  const login = await openLogin(browser);
  try {
    const wrong = await submitAndReadError(login.page, own.username, "Zle-Haslo-e2e-1!");
    const unknown = await submitAndReadError(login.page, `e2e_nikt_${Date.now().toString(36)}`, "Zle-Haslo-e2e-1!");
    console.log("[e2e-diag] auth-username wrong/unknown equal:", wrong === unknown);
    expect(unknown).toBe(wrong);

    await login.page.fill("#email", own.username);
    await login.page.fill("#pass", process.env.TEST_PASSWORD);
    await login.page.click("#btnPrimary");
    await login.page.waitForURL(/games/, { timeout: 30000 });
    const sessionUser = await login.page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user?.id || null);
    expect(sessionUser).toBe(own.id);

    const logins = login.authResponses.filter((r) => r.path === "/_api/auth/login");
    console.log("[e2e-diag] auth-username login statuses:", logins.map((r) => r.status).join(","));
    expect(logins.length).toBe(3);
    expect(login.authResponses.some((r) => r.path.includes("profile_login_to_email"))).toBe(false);
    for (const r of login.authResponses) expect(r.text.toLowerCase()).not.toContain(own.email.toLowerCase());
    expect(logins.at(-1).status).toBe(200);
  } finally {
    await login.context.close();
  }

  // Reset hasła po nazwie: Worker wysyła link (albo trwa cooldown); adres nie wraca.
  const reset = await openLogin(browser);
  try {
    await reset.page.fill("#email", own.username);
    await reset.page.click("#btnForgot");
    await expect(reset.page.locator("#forgotCooldown")).toBeVisible({ timeout: 30000 });
    const resets = reset.authResponses.filter((r) => r.path === "/_api/auth/reset");
    console.log("[e2e-diag] auth-username reset statuses:", resets.map((r) => r.status).join(","));
    expect(resets.length).toBe(1);
    expect(resets[0].status).toBe(200);
    expect(resets[0].text.toLowerCase()).not.toContain(own.email.toLowerCase());
    expect(resets[0].text).not.toContain("@");
  } finally {
    await reset.context.close();
  }
});
