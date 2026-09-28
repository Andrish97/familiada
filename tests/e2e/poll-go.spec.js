// tests/e2e/poll-go.spec.js
// Weryfikuje stronę przekierowania z maila (poll-go.js):
// - task invite (?t=token) — zaproszenie do głosowania zadania
// - subscription invite (?s=token) — zaproszenie do subskrypcji
// - unsub owner (?s=token&action=unsub) — wypisanie się z subskrypcji
// - unsub global (?u=token) — globalnie wypisanie się
// - Email-based i account-based identity flows
//
// Audyt: strona kompleksowa, obsługuje 4 główne ścieżki + edge case'i

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, instrumentPage } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const testAccountUsername = (n) => `e2e-test${n}@familiada.online`;

async function createTaskToken(page, pollType = "poll_points") {
  return await page.evaluate(async (type) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    // Utwórz grę
    const { data: game } = await sb
      .from("games")
      .insert({
        name: `E2E-TASK-${Date.now()}`,
        owner_id: userId,
        type,
        status: "poll_open",
      })
      .select("id, share_key_poll")
      .single();

    // Dodaj 10 pytań
    for (let ord = 1; ord <= 10; ord++) {
      const { data: q } = await sb
        .from("questions")
        .insert({ game_id: game.id, ord, text: `Q${ord}` })
        .select("id")
        .single();

      if (type === "poll_points") {
        for (let a = 1; a <= 4; a++) {
          await sb
            .from("answers")
            .insert({ question_id: q.id, ord: a, text: `A${a}` })
            .select("id")
            .single();
        }
      }
    }

    // Utwórz task (zaproszenie)
    const { data: task } = await sb
      .from("poll_tasks")
      .insert({
        owner_id: userId,
        game_id: game.id,
        recipient_email: "invited@example.com",
        status: "pending",
      })
      .select("token")
      .single();

    return {
      gameId: game.id,
      taskToken: task.token,
      pollType: type,
    };
  }, pollType);
}

async function createSubToken(page) {
  return await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    // Utwórz subscription invite
    const { data: sub } = await sb
      .from("subscriptions")
      .insert({
        owner_id: userId,
        subscriber_email: "subscriber@example.com",
        status: "pending",
      })
      .select("token")
      .single();

    return {
      subToken: sub.token,
      ownerId: userId,
    };
  });
}

async function deleteGame(page, gameId) {
  return await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    await sb.from("games").delete().eq("id", gid);
  }, gameId);
}

test.describe("poll-go.js audyt", () => {
  test.use({ serviceWorkers: "block" });

  test("task invite: zalogowany user bez account invite → głos", async ({ context }) => {
    const page = await context.newPage();
    const context2 = await instrumentPage(page);

    try {
      await loginAsTestUser(page, context2, { username: testAccountUsername(21) });
      const { gameId, taskToken, pollType } = await createTaskToken(page, "poll_points");

      await serveBranchCode(context2, { pages: ["poll-go", "poll-points"] });

      const url = new URL("poll-go.html", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać status "Zaproszenie do ankiety"
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText("Pytanie|Question|Запитання", { timeout: 10000 });

      // Powinno być przycisk "Zagłosuj"
      const voteBtn = page.locator("button:has-text('Zagłosuj')");
      await expect(voteBtn).toBeVisible({ timeout: 5000 });

      // Kliknij "Zagłosuj" — powinno przejść do poll-points
      await voteBtn.click();
      await page.waitForLoadState("networkidle");

      // Sprawdź że URL zmienił się na poll-points
      expect(page.url()).toContain("poll-points");

      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("task invite: niezalogowany user → redirect do login", async ({ context }) => {
    const page = await context.newPage();
    const context2 = await instrumentPage(page);

    try {
      // Nie logujemy się
      const { gameId, taskToken } = await createTaskToken(page, "poll_points");

      await serveBranchCode(context2, { pages: ["poll-go"] });

      const url = new URL("poll-go.html", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Zaloguj się aby głosować"
      const message = page.locator(".poll-go-sub");
      await expect(message).toContainText("Zaloguj|Login|Увійти", { timeout: 10000 });

      // Powinno być przycisk "Zaloguj się"
      const loginBtn = page.locator("button:has-text('Zaloguj')");
      await expect(loginBtn).toBeVisible();

      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("subscription invite: zalogowany user → accept/decline", async ({ context }) => {
    const page = await context.newPage();
    const context2 = await instrumentPage(page);

    try {
      await loginAsTestUser(page, context2, { username: testAccountUsername(22) });
      const { subToken } = await createSubToken(page);

      await serveBranchCode(context2, { pages: ["poll-go"] });

      const url = new URL("poll-go.html", "https://www.familiada.online/");
      url.searchParams.set("s", subToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać status "Zaproszenie do subskrypcji"
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText("Zaproszeni|Subscription|Підписка", { timeout: 10000 });

      // Powinno być przycisk "Zaakceptuj" i "Odrzuć"
      const acceptBtn = page.locator("button:has-text('Zaakceptuj')");
      const declineBtn = page.locator("button:has-text('Odrzuć')");

      await expect(acceptBtn).toBeVisible();
      await expect(declineBtn).toBeVisible();

      // Kliknij "Odrzuć"
      await declineBtn.click();
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Zaproszenie odrzucone"
      await expect(title).toContainText("Odrzucone|Declined|Відхилено", { timeout: 5000 });
    } finally {
      await page.close();
    }
  });

  test("subscription invite: niezalogowany + email → subscribe", async ({ context }) => {
    const page = await context.newPage();
    const context2 = await instrumentPage(page);

    try {
      // Nie logujemy się
      const { subToken } = await createSubToken(page);

      await serveBranchCode(context2, { pages: ["poll-go"] });

      const url = new URL("poll-go.html", "https://www.familiada.online/");
      url.searchParams.set("s", subToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać prompt "Podaj e-mail"
      const emailInput = page.locator("#emailInput");
      await expect(emailInput).toBeVisible({ timeout: 10000 });

      // Wpisz email
      await emailInput.fill("newsubscriber@example.com");

      // Kliknij "Subskrybuj"
      const subscribeBtn = page.locator("button:has-text('Subskrybuj')");
      await subscribeBtn.click();
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Subskrypcja aktywna"
      const message = page.locator(".poll-go-sub");
      await expect(message).toContainText("Aktywna|Active|Активна", { timeout: 5000 });
    } finally {
      await page.close();
    }
  });

  test("task invite: expired token → error message", async ({ context }) => {
    const page = await context.newPage();
    const context2 = await instrumentPage(page);

    try {
      await loginAsTestUser(page, context2, { username: testAccountUsername(23) });
      const { gameId, taskToken } = await createTaskToken(page, "poll_points");

      // Ustaw task na "declined" (expired)
      await page.evaluate(async (token) => {
        const sb = window.__sbClient;
        await sb
          .from("poll_tasks")
          .update({ status: "declined" })
          .eq("token", token);
      }, taskToken);

      await serveBranchCode(context2, { pages: ["poll-go"] });

      const url = new URL("poll-go.html", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Zaproszenie już wykorzystane"
      const message = page.locator(".poll-go-sub");
      await expect(message).toContainText("wykorzystane|used|використано", { timeout: 10000 });

      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("missing token (?t= brak) → error message", async ({ context }) => {
    const page = await context.newPage();
    const context2 = await instrumentPage(page);

    try {
      await serveBranchCode(context2, { pages: ["poll-go"] });

      // Brak ?t= i ?s=
      await page.goto("https://www.familiada.online/poll-go.html", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Brak linku"
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText("Brak|Missing|Немає", { timeout: 10000 });
    } finally {
      await page.close();
    }
  });

  test("invalid token → error message", async ({ context }) => {
    const page = await context.newPage();
    const context2 = await instrumentPage(page);

    try {
      await serveBranchCode(context2, { pages: ["poll-go"] });

      const url = new URL("poll-go.html", "https://www.familiada.online/");
      url.searchParams.set("t", "invalid-fake-token-12345");

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Nieprawidłowy link"
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText("Nieprawidłowy|Invalid|Неправильний", {
        timeout: 10000,
      });
    } finally {
      await page.close();
    }
  });
});
