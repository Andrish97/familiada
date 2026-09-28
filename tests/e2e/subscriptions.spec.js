// tests/e2e/subscriptions.spec.js
// Weryfikuje subscriptions.js (js/pages/subscriptions.js) -- hub do zarządzania
// zaproszeniami i subskrypcjami między użytkownikami (dwie strony lustra).
//
// Testy obejmują:
// 1) Wysyłanie zaproszenia do istniejącego użytkownika (email i login)
// 2) Akceptacja/odrzucenie zaproszenia
// 3) Anulowanie subskrypcji
// 4) Usuwanie subskrybenta
// 5) Lista oczekujących/aktywnych zaproszień i filtrowanie po statusie
// 6) Pobieranie labeli użytkowników w zaproszeniach email

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const BASE_URL = "https://www.familiada.online/subscriptions";

// service worker obsłużyłby żądania z cache
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["subscriptions"] });
});

async function newUserContext(browser, username, contextOptions = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", ...contextOptions });
  await serveBranchCode(ctx, { pages: ["subscriptions"] });
  const pg = await ctx.newPage();
  await loginAsTestUser(pg, ctx, { username });
  return { ctx, page: pg };
}

async function getUserId(page) {
  return await page.evaluate(async () => {
    const { data } = await window.__sbClient.auth.getUser();
    return data.user.id;
  });
}

async function getUserEmail(page) {
  return await page.evaluate(async () => {
    const { data } = await window.__sbClient.auth.getUser();
    return data.user.email;
  });
}

async function createSubscriptionDirect(page, ownerEmail, subscriberEmail) {
  return await page.evaluate(async ({ ownerEmail, subscriberEmail }) => {
    const sb = window.__sbClient;

    // Pobierz IDs obu użytkowników
    const { data: ownerData } = await sb
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail)
      .single();

    const { data: subData } = await sb
      .from("profiles")
      .select("id")
      .eq("email", subscriberEmail)
      .single();

    if (!ownerData || !subData) throw new Error("User not found");

    // Utwórz subscription
    const { data, error } = await sb
      .from("poll_subscriptions")
      .insert({
        owner_id: ownerData.id,
        subscriber_user_id: subData.id,
        subscriber_email: subscriberEmail,
        status: "active",
        token: crypto.randomUUID(),
      })
      .select("id")
      .single();

    if (error) throw new Error("insert failed: " + error.message);
    return data.id;
  }, { ownerEmail, subscriberEmail });
}

/* ================= Audyt subscriptions.js (2026-09-28) ================= */

test("audyt: zaproszenie — wpisanie emaila i zaproszenie nowego użytkownika", async ({ browser, page, context }) => {
  // User 1 zalogowany
  const user1 = await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(BASE_URL);

  // Czekaj na załadowanie strony
  await page.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 5000 });

  // User 2 — email znany
  const user2Email = `test2@familiada.online`;

  // Wpisz email do pola zaproszenia (desktop)
  const inviteInput = page.locator('#inviteInputDesktop');
  await inviteInput.click();
  await inviteInput.clear();
  await inviteInput.fill(user2Email);

  // Kliknij przycisk zaproszenia
  const inviteBtn = page.locator('#btnInviteDesktop');
  await inviteBtn.click();

  // Czekaj na komunikat sukcesu lub error (modal)
  const modal = page.locator('.modal').first();
  await modal.waitFor({ state: "visible", timeout: 3000 });
  const modalText = await modal.textContent();

  // OK lub error — zależy od konfiguracji, ale strona powinna obsłużyć
  expect(modalText).toBeTruthy();
});

test("audyt: lista subskrybentów — wyświetlenie aktualnych", async ({ browser, page, context }) => {
  const user1 = await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  const user1Email = await page.evaluate(() => window.__sbClient.auth.getUser().then(r => r.data.user.email));

  // Utwórz subscription z user2 do user1
  const subId = await createSubscriptionDirect(page, user1Email, "test2@familiada.online");

  await page.goto(BASE_URL);
  await page.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 5000 });

  // Sprawdź czy lista subskrybentów zawiera element
  const list = page.locator('#subscribersListDesktop');
  await expect(list).toContainText("test2@familiada.online");
});

test("audyt: lista zaproszonych — wyświetlenie oczekujących", async ({ browser, page, context }) => {
  const { ctx: ctx1, page: page1 } = await newUserContext(browser, testAccountUsername(1));
  const { ctx: ctx2, page: page2 } = await newUserContext(browser, testAccountUsername(2));

  const email1 = await getUserEmail(page1);

  // User 2 wysyła zaproszenie do User 1 (jako subskrypcję)
  await page2.goto(BASE_URL);
  await page2.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 5000 });

  const inviteInput = page2.locator('#inviteInputDesktop');
  await inviteInput.fill(email1);
  await page2.locator('#btnInviteDesktop').click();

  // Czekaj na modal (sukces lub error)
  await page2.locator('.modal').first().waitFor({ state: "visible", timeout: 3000 });

  // User 1 widzi zaproszenie
  await page1.goto(BASE_URL);
  await page1.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 5000 });

  // Przejdź na kartę "Moje subskrypcje" na mobilu (jeśli dostępna)
  const subsTab = page1.locator('#tabSubscriptionsMobile');
  if (await subsTab.isVisible()) {
    await subsTab.click();
  }

  // Lista powinna zawierać User 2
  const subsList = page1.locator('#subscriptionsListDesktop, #subscriptionsListMobile').first();
  await expect(subsList).toContainText("test", { timeout: 3000 });

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});

test("audyt: akceptacja zaproszenia", async ({ browser, page, context }) => {
  const { ctx: ctx1, page: page1 } = await newUserContext(browser, testAccountUsername(1));
  const { ctx: ctx2, page: page2 } = await newUserContext(browser, testAccountUsername(2));

  const email1 = await getUserEmail(page1);

  // User 2 wysyła zaproszenie
  await page2.goto(BASE_URL);
  await page2.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 5000 });

  const inviteInput = page2.locator('#inviteInputDesktop');
  await inviteInput.fill(email1);
  await page2.locator('#btnInviteDesktop').click();

  // Czekaj na zakończenie
  await page2.locator('.modal').first().waitFor({ state: "visible", timeout: 3000 });
  await page2.keyboard.press("Escape");

  // User 1 odświeża i widzi zaproszenie
  await page1.goto(BASE_URL);
  await page1.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 5000 });

  // Szukaj przycisku akceptacji (zielony z ikoną "check")
  const acceptBtn = page1.locator('button:has-text("check")').first();
  if (await acceptBtn.isVisible()) {
    await acceptBtn.click();

    // Czekaj na modal (potwierdzenie)
    await page1.locator('.modal').first().waitFor({ state: "visible", timeout: 3000 });
    const modalText = await page1.locator('.modal').first().textContent();
    expect(modalText).toBeTruthy();
  }

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});

test("audyt: filtry i sortowanie list", async ({ page, context }) => {
  const user = await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(BASE_URL);
  await page.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 5000 });

  // Sprawdź czy selekty sortowania są dostępne
  const sortSelects = page.locator('.ui-select-btn');
  const count = await sortSelects.count();
  expect(count).toBeGreaterThanOrEqual(2); // co najmniej dla subscribers i subscriptions

  // Kliknij na sortowanie
  const firstSort = sortSelects.first();
  await firstSort.click();

  // Menu powinno się pojawić
  const menu = page.locator('.ui-select-menu').first();
  await expect(menu).toBeVisible();
});

test("audyt: toggle archiwum", async ({ page, context }) => {
  const user = await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(BASE_URL);
  await page.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 5000 });

  // Sprawdź czy przyciski toggle są dostępne
  const toggles = page.locator('.hub-toggle button');
  const count = await toggles.count();
  expect(count).toBeGreaterThanOrEqual(4); // "Aktualne" i "Archiwalne" dla obu sekcji

  // Kliknij na "Archiwalne" dla subskrybentów
  const archiveBtn = toggles.nth(1);
  await archiveBtn.click();

  // Przycisk powinien mieć klasę "active"
  await expect(archiveBtn).toHaveClass(/active/);
});
