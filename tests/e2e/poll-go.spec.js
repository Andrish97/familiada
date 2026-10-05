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
const { loginAsPooledTestUser } = require("./helpers/login");

async function createTaskToken(page, pollType = "poll_points", opts = {}) {
  const { recipientUserId = null } = opts;
  return await page.evaluate(async ({ type, recipientUserId }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    // Utwórz grę jako draft — trigger game_content_locked:poll_open
    // zabrania insertu do questions/answers gdy games.status='poll_open'
    const { data: game, error: gameErr } = await sb
      .from("games")
      .insert({
        name: `E2E-TASK-${Date.now()}`,
        owner_id: userId,
        type,
        status: "draft",
      })
      .select("id, share_key_poll")
      .single();
    if (gameErr) throw new Error("insert games failed: " + gameErr.message);

    // Dodaj 10 pytań
    for (let ord = 1; ord <= 10; ord++) {
      const { data: q, error: qErr } = await sb
        .from("questions")
        .insert({ game_id: game.id, ord, text: `Q${ord}` })
        .select("id")
        .single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);

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

    // Teraz otwórz ankietę
    const { error: openErr } = await sb.from("games").update({ status: "poll_open" }).eq("id", game.id);
    if (openErr) throw new Error("update games poll_open failed: " + openErr.message);

    // Utwórz task (zaproszenie) — poll_tasks wymaga poll_type (nie "type")
    // i share_key_poll (kopiowany z games.share_key_poll, NOT NULL).
    // Constraint poll_tasks_one_recipient_chk: dokładnie jedno z
    // recipient_user_id/recipient_email (XOR) — account invite vs email-only.
    const { data: task, error: taskErr } = await sb
      .from("poll_tasks")
      .insert({
        owner_id: userId,
        game_id: game.id,
        poll_type: type,
        share_key_poll: game.share_key_poll,
        ...(recipientUserId
          ? { recipient_user_id: recipientUserId }
          : { recipient_email: "invited@example.com" }),
        status: "pending",
      })
      .select("token")
      .single();
    if (taskErr) throw new Error("insert poll_tasks failed: " + taskErr.message);

    return {
      gameId: game.id,
      taskToken: task.token,
      pollType: type,
    };
  }, { type: pollType, recipientUserId });
}

async function createSubToken(page) {
  return await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    // poll_subscriptions ma RLS bez INSERT policy dla klientów — jedyna
    // droga stworzenia zaproszenia to RPC polls_hub_subscription_invite,
    // tak samo jak robi to prawdziwy UI (polls-hub.js).
    const { data, error } = await sb.rpc("polls_hub_subscription_invite", {
      p_recipient: `e2e-subscriber-${Date.now()}@example.com`,
    });
    if (error) throw new Error("polls_hub_subscription_invite failed: " + error.message);
    if (!data?.ok) throw new Error("polls_hub_subscription_invite returned not ok: " + JSON.stringify(data));

    return {
      subToken: data.token,
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

  test("task invite: zalogowany user bez account invite → głos", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const { gameId, taskToken, pollType } = await createTaskToken(page, "poll_points");


      const url = new URL("poll-go/index.html", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać status "Zaproszenie do ankiety" (taskHeading)
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText(/Zaproszenie|invitation|Запрошення/, { timeout: 10000 });

      // Powinno być przycisk "Głosuj" (voteLabel)
      const voteBtn = page.locator("button:has-text('Głosuj')");
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

  test("task invite: niezalogowany user → redirect do login", async ({ page, browser }, testInfo) => {
    // Task musi mieć recipient_user_id (account invite) — tylko wtedy
    // niezalogowany widz dostaje prompt logowania (handleTaskInvite Case 4
    // w js/pages/poll-go.js); recipient_email-only jest Case 5, wolny głos
    // bez logowania. Setup w IZOLOWANYM kontekście, żeby zalogowanie ownera
    // nie zaraziło cookies głównego `page` (współdzielone w jednym context).
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();
    let gameId;
    try {
      await loginAsPooledTestUser(setupPage, setupContext, testInfo.parallelIndex);
      const recipientUserId = await setupPage.evaluate(async () => {
        const sb = window.__sbClient;
        const { data } = await sb.auth.getUser();
        return data.user.id;
      });
      const created = await createTaskToken(setupPage, "poll_points", { recipientUserId });
      gameId = created.gameId;
      const taskToken = created.taskToken;

      const url = new URL("poll-go/index.html", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);

      // `page` nigdy się nie loguje (test sprawdza właśnie widok dla
      // niezalogowanego) -- withE2EBypass() w loginAsTestUser normalnie
      // ustawia localStorage.uiLang=pl, ale tu ten kod nigdy nie leci, więc
      // strona spada na navigator.language (w CI: en-US) i renderuje się
      // po angielsku -- patrz identyczny komentarz w polls.spec.js.
      await page.context().addInitScript(() => {
        try { localStorage.setItem("uiLang", "pl"); } catch {}
      });

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "musisz się zalogować" (loginToVote)
      const message = page.locator(".poll-go-sub");
      await expect(message).toContainText(/zalogować|Log in|Увійди/, { timeout: 10000 });

      // Powinno być przycisk "Zaloguj się"
      const loginBtn = page.locator("button:has-text('Zaloguj')");
      await expect(loginBtn).toBeVisible();
    } finally {
      if (gameId) await deleteGame(setupPage, gameId);
      await setupContext.close();
    }
  });

  test("subscription invite: zalogowany user → accept/decline", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const { subToken } = await createSubToken(page);


      const url = new URL("poll-go/index.html", "https://www.familiada.online/");
      url.searchParams.set("s", subToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać status "Zaproszenie do subskrypcji" (subHeading)
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText(/Zaproszenie|Subscription|Запрошення/, { timeout: 10000 });

      // Powinno być przycisk "Akceptuj" i "Odrzuć" (acceptLabel/declineLabel)
      const acceptBtn = page.locator("button:has-text('Akceptuj')");
      const declineBtn = page.locator("button:has-text('Odrzuć')");

      await expect(acceptBtn).toBeVisible();
      await expect(declineBtn).toBeVisible();

      // Kliknij "Odrzuć"
      await declineBtn.click();
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Odrzucono" (declined heading)
      await expect(title).toContainText(/Odrzucono|Declined|Відхилено/, { timeout: 5000 });
    } finally {
      await page.close();
    }
  });

  test("subscription invite: niezalogowany + email → accept/decline", async ({ page, browser }, testInfo) => {
    // Setup w izolowanym kontekście (insert wymaga zalogowanego ownera; nie
    // chcemy zarazić cookies głównego `page`, które ma zostać niezalogowane).
    // Dla subscriber_email-only + status pending, handleSubInvite (Case 4 w
    // js/pages/poll-go.js) pokazuje od razu przyciski Zaakceptuj/Odrzuć dla
    // ZNANEGO emaila zaproszenia — email input (#emailInput) jest tylko dla
    // scenariusza !isActive (status inny niż "pending"), którego to nie testuje.
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();
    try {
      await loginAsPooledTestUser(setupPage, setupContext, testInfo.parallelIndex);
      const { subToken } = await createSubToken(setupPage);

      const url = new URL("poll-go/index.html", "https://www.familiada.online/");
      url.searchParams.set("s", subToken);

      // `page` nigdy się nie loguje (test ma zostać niezalogowany) -- bez
      // tego strona spada na navigator.language (w CI: en-US) i przyciski
      // renderują się po angielsku, patrz identyczny komentarz wyżej.
      await page.context().addInitScript(() => {
        try { localStorage.setItem("uiLang", "pl"); } catch {}
      });

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinny być przyciski "Akceptuj" i "Odrzuć" dla znanego subscriber_email
      const acceptBtn = page.locator("button:has-text('Akceptuj')");
      const declineBtn = page.locator("button:has-text('Odrzuć')");
      await expect(acceptBtn).toBeVisible({ timeout: 10000 });
      await expect(declineBtn).toBeVisible();

      // Kliknij "Akceptuj"
      await acceptBtn.click();
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Subskrypcja aktywna" (subscriptionActive)
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText(/aktywna|active|активна/, { timeout: 5000 });
    } finally {
      await setupContext.close();
    }
  });

  test("task invite: expired token → error message", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const { gameId, taskToken } = await createTaskToken(page, "poll_points");

      // Ustaw task na "declined" (expired)
      await page.evaluate(async (token) => {
        const sb = window.__sbClient;
        await sb
          .from("poll_tasks")
          .update({ status: "declined" })
          .eq("token", token);
      }, taskToken);


      const url = new URL("poll-go/index.html", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Zaproszenie już wykorzystane"
      const message = page.locator(".poll-go-sub");
      await expect(message).toContainText(/wykorzystane|used|використано/, { timeout: 10000 });

      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("missing token (?t= brak) → error message", async ({ page, context }) => {

    try {

      // Brak ?t= i ?s=
      await page.goto("https://www.familiada.online/poll-go/index.html", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Brak linku"
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText(/Brak|Missing|Немає/, { timeout: 10000 });
    } finally {
      await page.close();
    }
  });

  test("invalid token → error message", async ({ page, context }) => {

    try {

      // p_token w poll_go_resolve jest kolumny typu uuid — string, który nie
      // parsuje się jako UUID, wywala błąd rzutowania w Postgresie (RPC
      // error) zamiast dojść do gałęzi "nie znaleziono" (ok:false), co
      // zamiast "Link nieważny" pokazuje ogólny MSG.error()/"Błąd". Dlatego
      // tu poprawny format UUID, którego po prostu nie ma w bazie.
      const url = new URL("poll-go/index.html", "https://www.familiada.online/");
      url.searchParams.set("t", "00000000-0000-0000-0000-000000000000");

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać "Link nieważny" (invalidLinkTitle)
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText(/nieważny|Invalid|Недійсне/, {
        timeout: 10000,
      });
    } finally {
      await page.close();
    }
  });
});
