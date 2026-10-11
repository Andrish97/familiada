// tests/e2e/go.spec.js
// Weryfikuje stronę przekierowania z maila (go.js):
// - task invite (?t=token) — zaproszenie do głosowania zadania
// - subscription invite (?s=token) — zaproszenie do subskrypcji
// - unsub owner (?s=token&action=unsub) — wypisanie się z subskrypcji
// - unsub global (?u=token) — globalnie wypisanie się
// - Email-based i account-based identity flows
//
// Audyt: strona kompleksowa, obsługuje 4 główne ścieżki + edge case'i

const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");

// Strony głosowania z brancha (komunikaty stanów, E11e); baza z produkcji.
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["go", "polls/vote/text", "polls/vote/points"] });
});
const { loginAsPooledTestUser } = require("./helpers/login");

async function createTaskToken(page, pollType = "poll_points", opts = {}) {
  const { recipientPage = null } = opts;
  const game = await page.evaluate(async ({ type }) => {
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

    const { error: openErr } = await sb.rpc("poll_open", { p_game_id: game.id, p_key: game.share_key_poll });
    if (openErr) throw new Error("poll_open failed: " + openErr.message);
    return game;
  }, { type: pollType });
  let recipientUserId = null, subId = null;
  try {
  if (recipientPage) {
    const user = await recipientPage.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user);
    recipientUserId = user.id;
    const friendship = await page.evaluate(async user => {
      const sb = window.__sbClient;
      await sb.rpc("e2e_friendships_cleanup", { p_other_user_id: user.id });
      const { data, error } = await sb.rpc("friends_invite", { p_handle: user.email });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || "friend fixture failed");
      return data;
    }, user);
    await recipientPage.evaluate(async id => {
      const { data, error } = await window.__sbClient.rpc("friends_accept", { p_id: id });
      if (error || !data?.ok) throw new Error(error?.message || "friend acceptance failed");
    }, friendship.id);
  } else {
    subId = await page.evaluate(async () => {
      const sb = window.__sbClient, email = "test14@familiada.online";
      const { data: cleaned, error: cleanupError } = await sb.rpc("e2e_subscriber_email_cleanup", { p_email: email });
      if (cleanupError || !cleaned?.ok) throw new Error(cleanupError?.message || "subscriber fixture cleanup failed");
      const { data: invite, error } = await sb.rpc("subscribers_invite", { p_email: email });
      if (error || !invite?.ok) throw new Error(error?.message || "subscriber fixture invitation failed");
      const { data: accepted, error: acceptError } = await sb.rpc("poll_sub_accept_email", { p_token: invite.token, p_email: email });
      if (acceptError || !accepted?.ok) throw new Error(acceptError?.message || "subscriber fixture acceptance failed");
      return invite.id;
    });
  }
  const taskToken = await page.evaluate(async ({ gameId, recipientUserId, subId }) => {
    const sb = window.__sbClient;
    const { data, error } = await sb.rpc("poll_share_send", { p_game_id: gameId,
      p_friend_ids: recipientUserId ? [recipientUserId] : [], p_subscriber_ids: subId ? [subId] : [] });
    if (error || !data?.ok || data.created !== 1) throw new Error(error?.message || "canonical task fixture failed");
    const { data: task, error: readError } = await sb.from("poll_tasks").select("token").eq("game_id", gameId).single();
    if (readError) throw readError;
    return task.token;
  }, { gameId: game.id, recipientUserId, subId });
  return { gameId: game.id, taskToken, pollType };
  } catch (error) { await deleteGame(page, game.id); throw error; }
}

async function createSubToken(page) {
  return await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    // poll_subscriptions ma RLS bez INSERT policy dla klientów — jedyna
    // droga stworzenia zaproszenia to RPC polls_hub_subscription_invite,
    // tak samo jak robi to prawdziwy UI (subscriptions.js).
    const { data, error } = await sb.rpc("subscribers_invite", {
      p_email: `e2e-subscriber-${Date.now()}@example.com`,
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
  return page.evaluate(async gid => {
    const sb = window.__sbClient;
    const { data: tasks, error: readError } = await sb.from("poll_tasks").select("recipient_user_id,recipient_email").eq("game_id", gid);
    if (readError) throw readError;
    const { error } = await sb.from("games").delete().eq("id", gid);
    if (error) throw error;
    for (const task of tasks || []) {
      const name = task.recipient_user_id ? "e2e_friendships_cleanup" : "e2e_subscriber_email_cleanup";
      const args = task.recipient_user_id ? { p_other_user_id: task.recipient_user_id } : { p_email: task.recipient_email };
      const { error: cleanupError } = await sb.rpc(name, args);
      if (cleanupError) throw cleanupError;
    }
  }, gameId);
}

test.describe("go.js audyt", () => {
  test.use({ serviceWorkers: "block" });

  test("task invite: zalogowany user bez account invite → głos", async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const { gameId, taskToken, pollType } = await createTaskToken(page, "poll_points");


      const url = new URL("/go/", "https://www.familiada.online/");
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
      expect(page.url()).toContain("polls/vote/points");
      for (let n = 0; n < 10; n++) await page.locator("#alist button").first().click({ timeout: 30_000 });
      await page.waitForURL(/\/tasks\//, { timeout: 30_000 });
      await page.waitForFunction(() => Boolean(window.__sbClient));
      await expect.poll(async () => page.evaluate(async id => {
        const { data, error } = await window.__sbClient.from("poll_tasks").select("status").eq("game_id", id).single();
        if (error) throw error; return data.status;
      }, gameId), { timeout: 30_000 }).toBe("done");
      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("task invite: niezalogowany user → redirect do login", async ({ page, browser }, testInfo) => {
    // Task musi mieć recipient_user_id (account invite) — tylko wtedy
    // niezalogowany widz dostaje prompt logowania (handleTaskInvite Case 4
    // w js/pages/go.js); recipient_email-only jest Case 5, wolny głos
    // bez logowania. Setup w IZOLOWANYM kontekście, żeby zalogowanie ownera
    // nie zaraziło cookies głównego `page` (współdzielone w jednym context).
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();
    const recipientContext = await browser.newContext({ serviceWorkers: "block" });
    const recipientPage = await recipientContext.newPage();
    let gameId;
    try {
      await loginAsPooledTestUser(setupPage, setupContext, testInfo.parallelIndex);
      await loginAsPooledTestUser(recipientPage, recipientContext, (testInfo.parallelIndex + 1) % 2);
      const created = await createTaskToken(setupPage, "poll_points", { recipientPage });
      gameId = created.gameId;
      const taskToken = created.taskToken;

      const url = new URL("/go/", "https://www.familiada.online/");
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
      await recipientContext.close();
      await setupContext.close();
    }
  });

  test("subscription invite: zalogowany user → accept/decline", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const { subToken } = await createSubToken(page);


      const url = new URL("/go/", "https://www.familiada.online/");
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
      await page.reload();
      await expect(title).toContainText(/Odrzucono|Declined|Відхилено/);
      await expect(page.locator("#emailInput")).toBeHidden();
    } finally {
      await page.close();
    }
  });

  test("subscription invite: niezalogowany + email → accept/decline", async ({ page, browser }, testInfo) => {
    // Setup w izolowanym kontekście (insert wymaga zalogowanego ownera; nie
    // chcemy zarazić cookies głównego `page`, które ma zostać niezalogowane).
    // Dla subscriber_email-only + status pending, handleSubInvite (Case 4 w
    // js/pages/go.js) pokazuje od razu przyciski Zaakceptuj/Odrzuć dla
    // ZNANEGO emaila zaproszenia — email input (#emailInput) jest tylko dla
    // scenariusza !isActive (status inny niż "pending"), którego to nie testuje.
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();
    try {
      await loginAsPooledTestUser(setupPage, setupContext, testInfo.parallelIndex);
      const { subToken } = await createSubToken(setupPage);

      const url = new URL("/go/", "https://www.familiada.online/");
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
      await page.reload();
      await expect(title).toContainText(/aktywna|active|активна/);
      await expect(page.locator("#emailInput")).toBeHidden();
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
        const { data, error } = await sb.rpc("poll_task_decline", { p_token: token });
        if (error || data !== "ok") throw new Error(error?.message || "canonical fixture decline failed");
      }, taskToken);


      const url = new URL("/go/", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Odrzucone zaproszenie → "Zaproszenie odrzucone"
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText(/Zaproszenie odrzucone|Invitation declined|Запрошення відхилено/, { timeout: 10000 });

      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("task invite: ponowne uruchomienie ankiety → 'To zaproszenie wygasło'", async ({ page, context }, testInfo) => {
    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const { gameId, taskToken } = await createTaskToken(page, "poll_points");

      // poll_abort kasuje zaproszenia i rotuje klucz; poll_open uruchamia z nowym kluczem
      await page.evaluate(async (gid) => {
        const sb = window.__sbClient;
        const { data, error } = await sb.rpc("poll_abort", { p_game_id: gid });
        if (error) throw new Error("poll_abort failed: " + error.message);
        const { error: openErr } = await sb.rpc("poll_open", { p_game_id: gid, p_key: data.share_key_poll });
        if (openErr) throw new Error("poll_open failed: " + openErr.message);
      }, gameId);

      const url = new URL("/go/", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await expect(page.locator(".poll-go-title")).toContainText(/zaproszenie wygasło|invitation has expired|запрошення втратило/, { timeout: 10000 });

      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("task invite: ankieta zakończona (podliczona) → 'Ankieta zakończona'", async ({ page, context }, testInfo) => {
    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const { gameId, taskToken } = await createTaskToken(page, "poll_points");

      // Podliczenie wymaga głosów — poll_go_resolve podajemy jako odpowiedź 'poll_closed'.
      await page.route("**/rest/v1/rpc/poll_go_resolve", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "poll_closed" }),
        })
      );

      const url = new URL("/go/", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await expect(page.locator(".poll-go-title")).toContainText(/zakończona|has ended|завершено/, { timeout: 10000 });

      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("task invite: ankieta zatrzymana → 'Ankieta jest zatrzymana'", async ({ page, context }, testInfo) => {
    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const { gameId, taskToken } = await createTaskToken(page, "poll_points");

      // Stan zatrzymania — poll_go_resolve podajemy jako odpowiedź 'poll_stopped'.
      await page.route("**/rest/v1/rpc/poll_go_resolve", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "poll_stopped" }),
        })
      );

      const url = new URL("/go/", "https://www.familiada.online/");
      url.searchParams.set("t", taskToken);
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await expect(page.locator(".poll-go-title")).toContainText(/jest zatrzymana|is stopped|зупинено/, { timeout: 10000 });

      await deleteGame(page, gameId);
    } finally {
      await page.close();
    }
  });

  test("missing token (?t= brak) → error message", async ({ page, context }) => {

    try {

      // Brak ?t= i ?s=
      await page.goto("https://www.familiada.online/go/index.html", {
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
      const url = new URL("/go/", "https://www.familiada.online/");
      url.searchParams.set("t", "00000000-0000-0000-0000-000000000000");

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Nieznany token (np. usunięte zadanie) → "To zaproszenie wygasło"
      const title = page.locator(".poll-go-title");
      await expect(title).toContainText(/zaproszenie wygasło|invitation has expired|запрошення втратило/, {
        timeout: 10000,
      });
    } finally {
      await page.close();
    }
  });
});

test("task invite: odmowa po zatrzymaniu nie pokazuje fałszywego sukcesu", async ({ page, context }, testInfo) => {
  await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
  const { gameId, taskToken } = await createTaskToken(page, "poll_text");
  try {
    await page.goto(`https://www.familiada.online/go/?t=${taskToken}`);
    await expect(page.getByRole("button", { name: "Odrzuć", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async id => {
      const { error } = await window.__sbClient.rpc("poll_stop", { p_game_id: id });
      if (error) throw error;
    }, gameId);
    await page.getByRole("button", { name: "Odrzuć", exact: true }).click();
    await expect(page.locator(".poll-go-title")).toContainText(/zatrzymana/);
    await expect(page.getByRole("button", { name: "Odrzuć", exact: true })).toHaveCount(0);
    const task = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("poll_tasks").select("status,declined_at").eq("game_id", id).single();
      if (error) throw error; return data;
    }, gameId);
    expect(task).toMatchObject({ status: "opened", declined_at: null });
  } finally { await deleteGame(page, gameId); }
});
