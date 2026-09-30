const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");
const { clearMailbox, waitForEmail, extractHttpLinks } = require("./helpers/mailbox");

const BASE_URL = "https://www.familiada.online/subscriptions";

test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["subscriptions"] });
});

async function newUser(browser, accountNo, viewport) {
  const context = await browser.newContext({ serviceWorkers: "block", viewport });
  await serveBranchCode(context, { pages: ["subscriptions"] });
  const page = await context.newPage();
  await loginAsTestUser(page, context, { username: testAccountUsername(accountNo) });
  return { context, page };
}

async function userId(page) {
  return page.evaluate(async () => {
    const { data, error } = await window.__sbClient.auth.getUser();
    if (error || !data?.user) throw error || new Error("missing_user");
    return data.user.id;
  });
}

async function cleanupPair(page, otherId) {
  const result = await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient.rpc("e2e_poll_subscriptions_cleanup", {
      p_other_user_id: id,
    });
    if (error || data?.ok === false) throw error || new Error(JSON.stringify(data));
    return data;
  }, otherId);
  expect(result.ok).toBe(true);
}

async function openSubscriptions(page, suffix = "") {
  await page.goto(`${BASE_URL}${suffix}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-skel-step]").first()).toHaveClass(/skel-step-ready/, { timeout: 10000 });
}

async function closeAlert(page, expected) {
  const modal = page.locator(".uni-modal");
  await expect(modal).toBeVisible({ timeout: 15000 });
  await expect(modal).toContainText(expected);
  await modal.locator(".uni-foot .btn.gold").click();
}

async function inviteRegistered(page, recipient) {
  await page.locator("#inviteInputDesktop").fill(recipient);
  await page.locator("#btnInviteDesktop").click();
  await closeAlert(page, /Zaproszenie zapisane|wysyłka maila nie powiodła się/);
}

test("pełny przepływ: zaproszenie, akceptacja i anulowanie z czystym stanem", async ({ browser }) => {
  const owner = await newUser(browser, 7);
  const subscriber = await newUser(browser, 8);
  const subscriberId = await userId(subscriber.page);

  try {
    await cleanupPair(owner.page, subscriberId);
    await openSubscriptions(owner.page);
    await inviteRegistered(owner.page, testAccountUsername(8));

    await expect(owner.page.locator("#subscribersListDesktop")).toContainText(/test8/i);
    await expect(owner.page.locator("#subscribersListDesktop")).toContainText("Oczekujące");

    await openSubscriptions(subscriber.page);
    const subscriptionRow = subscriber.page.locator("#subscriptionsListDesktop .hub-item").filter({ hasText: /test7/i });
    await expect(subscriptionRow).toContainText("Oczekujące");
    await subscriptionRow.getByRole("button", { name: "Akceptuj" }).click();
    await expect(subscriptionRow).toContainText("Aktywny");

    await subscriptionRow.getByRole("button", { name: "Anuluj" }).click();
    const confirm = subscriber.page.locator(".uni-modal");
    await expect(confirm).toContainText("anulować tę subskrypcję");
    await confirm.getByRole("button", { name: "Anuluj subskrypcję" }).click();
    await expect(subscriptionRow).toHaveCount(0);

    await owner.page.reload({ waitUntil: "domcontentloaded" });
    await expect(owner.page.locator("[data-skel-step]").first()).toHaveClass(/skel-step-ready/);
    await expect(owner.page.locator("#subscribersListDesktop")).not.toContainText(/test8/i);
  } finally {
    await cleanupPair(owner.page, subscriberId).catch(() => {});
    await owner.context.close();
    await subscriber.context.close();
  }
});

test("@mailbox subskrypcje: zaproszenie z UI dochodzi na prawdziwą skrzynkę", async ({ browser }) => {
  test.setTimeout(120_000);
  const owner = await newUser(browser, 7);
  const subscriber = await newUser(browser, 8);
  const subscriberId = await userId(subscriber.page);
  const recipient = testAccountUsername(8);
  const after = new Date(Date.now() - 2_000).toISOString();

  try {
    await cleanupPair(owner.page, subscriberId);
    await clearMailbox(recipient);
    await openSubscriptions(owner.page);
    await inviteRegistered(owner.page, recipient);

    const email = await waitForEmail({ recipient, after, subject: /subskrypc|subscription/i });
    expect(`${email.body || ""}\n${email.body_html || ""}`).toMatch(/test7|Familiada/i);
    const invitation = extractHttpLinks(email).find((link) => {
      const url = new URL(link);
      return /\/poll-go(?:\.html)?$/.test(url.pathname) && url.searchParams.has("s");
    });
    expect(invitation, "mail musi zawierać link zaproszenia ?s=").toBeTruthy();

    await subscriber.page.goto(invitation, { waitUntil: "domcontentloaded" });
    await expect(subscriber.page.locator(".poll-go-title")).toContainText(/Zaproszenie|Subscription/i);
  } finally {
    await cleanupPair(owner.page, subscriberId).catch(() => {});
    await clearMailbox(recipient).catch(() => {});
    await owner.context.close();
    await subscriber.context.close();
  }
});

test("token innego konta: modal wylogowuje zamiast rzucać ReferenceError", async ({ browser }) => {
  const owner = await newUser(browser, 7);
  const recipient = await newUser(browser, 8);
  const wrongUser = await newUser(browser, 9);
  const recipientId = await userId(recipient.page);

  try {
    await cleanupPair(owner.page, recipientId);
    await openSubscriptions(owner.page);
    await inviteRegistered(owner.page, testAccountUsername(8));
    const token = await owner.page.evaluate(async () => {
      const { data, error } = await window.__sbClient.rpc("polls_hub_list_my_subscribers");
      if (error) throw error;
      return data.find((row) => /test8/i.test(row.subscriber_label || ""))?.token;
    });
    expect(token).toBeTruthy();

    await wrongUser.page.goto(`${BASE_URL}?s=${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded" });
    const modal = wrongUser.page.locator(".uni-modal");
    await expect(modal).toContainText("Zaproszenie nie pasuje do konta");
    await modal.getByRole("button", { name: "Wyloguj" }).click();
    await wrongUser.page.waitForURL(/\/login(?:\?|$)/, { timeout: 10000 });
  } finally {
    await cleanupPair(owner.page, recipientId).catch(() => {});
    await owner.context.close();
    await recipient.context.close();
    await wrongUser.context.close();
  }
});

test("niepoprawny adres nie czyści pola i nie pozostawia aktywnego progressu", async ({ page, context }) => {
  await loginAsTestUser(page, context, { username: testAccountUsername(7) });
  await openSubscriptions(page);
  await page.locator("#inviteInputDesktop").fill("błędny@adres");
  await page.locator("#btnInviteDesktop").click();
  await closeAlert(page, "Niepoprawny e-mail");
  await expect(page.locator("#inviteInputDesktop")).toHaveValue("błędny@adres");
  await expect(page.locator("#progressOverlay")).toBeHidden();
  await expect(page.locator("#btnInviteDesktop")).toBeEnabled();
});

test("ret nie pozwala opuścić originu, a poprawny powrót jest zachowany", async ({ page, context }) => {
  await loginAsTestUser(page, context, { username: testAccountUsername(7) });

  await openSubscriptions(page, "?ret=https%3A%2F%2Fevil.example%2Fphishing");
  await page.locator("#btnBackToGames").click();
  await page.waitForURL((url) => url.origin === "https://www.familiada.online" && url.pathname === "/games");

  await openSubscriptions(page, "?ret=%2Fpolls-hub%3Flang%3Den");
  await expect(page.locator("#btnBackToGames")).toContainText("Centrum ankiet");
  await page.locator("#btnBackToGames").click();
  await page.waitForURL((url) => url.pathname === "/polls-hub" && url.searchParams.get("lang") === "en");
});

test("PL/EN/UK oraz mobilne zakładki mają poprawną semantykę i klawiaturę", async ({ browser }) => {
  const mobile = await newUser(browser, 7, { width: 390, height: 844 });
  try {
    const cases = [
      { lang: "pl", title: "Subskrypcje" },
      { lang: "en", title: "Subscriptions" },
      { lang: "uk", title: "Підписки" },
    ];
    for (const item of cases) {
      await openSubscriptions(mobile.page, `?lang=${item.lang}`);
      await expect(mobile.page.locator(".bar .title")).toHaveText(item.title);
    }

    const first = mobile.page.getByRole("tab").first();
    const second = mobile.page.getByRole("tab").nth(1);
    await first.focus();
    await first.press("ArrowRight");
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(mobile.page.locator("#panelSubscriptionsMobile")).toBeVisible();
    await expect(mobile.page.locator("#panelSubscribersMobile")).toBeHidden();
  } finally {
    await mobile.context.close();
  }
});
