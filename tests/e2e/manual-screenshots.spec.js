// Dedicated fixtures for the manual/landing screenshots. These accounts are
// deliberately outside the regular E2E pool (test16 PL, test17 EN, test18 UK).
const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");
const Logo = require("./helpers/logo-editor");

test.use({ serviceWorkers: "block" });
test.use({ viewport: { width: 1365, height: 768 } });
test.describe.configure({ retries: 0 });

const LANGUAGE = process.env.SCREENSHOT_LANG || "pl";
const USERS = { pl: "test16@familiada.online", en: "test17@familiada.online", uk: "test18@familiada.online" };
const COPY = {
  pl: {
    names: ["Wieczór z Familiadą", "Pytania dla znajomych", "Szybka ankieta"],
    ownerName: "Marta_Nowak", friendName: "Alex_Morgan", subscriberEmails: ["anna.nowak@example.com", "piotr.zielinski@example.com", "kasia.maj@example.com"],
    gameplay: ["Podaj coś, co można zjeść na szybko", ["kanapka", "pizza", "hot-dog", "zupa", "jogurt", "baton"]], finalAnswers: ["Ubrania", "Herbata", "Spacer", "Mapa", "Wanilia"],
    fillerAnswers: ["Przyjaciele", "Rodzina", "Dobra zabawa", "Odpoczynek"],
    pollAnswers: ["Zdecydowanie tak", "Raczej tak", "Raczej nie", "Jeszcze nie wiem"],
    voteText: "Świetny pomysł",
    questions: ["Co zabierasz na weekendowy wyjazd?", "Jaki napój wybierasz do śniadania?", "Co pomaga odpocząć po pracy?", "Co warto mieć w plecaku?", "Jaki smak lodów wybierasz latem?", "Co robisz w deszczowy dzień?", "Jaki owoc pasuje do deseru?", "Co przydaje się podczas pikniku?", "Jak spędzasz wolny wieczór?", "Co zabierasz na piknik?"]
  },
  en: {
    names: ["Family Game Night", "Questions for Friends", "Quick Survey"],
    ownerName: "Jamie_Taylor", friendName: "Olena_Koval", subscriberEmails: ["alex.morgan@example.com", "sam.taylor@example.com", "chris.parker@example.com"],
    gameplay: ["Name something you can eat on the go", ["sandwich", "pizza", "hot dog", "soup", "yogurt", "candy bar"]], finalAnswers: ["Clothes", "Tea", "A walk", "A map", "Vanilla"],
    fillerAnswers: ["Friends", "Family", "Good fun", "A break"],
    pollAnswers: ["Definitely", "Probably", "Probably not", "Not sure yet"],
    voteText: "Sounds like a great idea",
    questions: ["What do you pack for a weekend trip?", "Which drink goes with breakfast?", "What helps you relax after work?", "What belongs in a backpack?", "Which ice cream flavor do you choose?", "What do you do on a rainy day?", "Which fruit goes with dessert?", "What do you bring to a picnic?", "How do you spend a free evening?", "What do you bring to a picnic?"]
  },
  uk: {
    names: ["Вечір родинної гри", "Запитання для друзів", "Швидке опитування"],
    ownerName: "Olena_Koval", friendName: "Jan_Kowalski", subscriberEmails: ["oksana.koval@example.com", "andrii.shevchenko@example.com", "marta.bondar@example.com"],
    gameplay: ["Назвіть щось, що можна швидко з’їсти", ["бутерброд", "піца", "хот-дог", "суп", "йогурт", "батончик"]], finalAnswers: ["Одяг", "Чай", "Прогулянка", "Мапа", "Ваніль"],
    fillerAnswers: ["Друзі", "Родина", "Гарна розвага", "Відпочинок"],
    pollAnswers: ["Однозначно так", "Скоріше так", "Скоріше ні", "Ще не знаю"],
    voteText: "Чудова ідея",
    questions: ["Що ви берете на вихідні?", "Який напій обираєте до сніданку?", "Що допомагає відпочити після роботи?", "Що варто покласти до рюкзака?", "Який смак морозива обираєте влітку?", "Що робите в дощовий день?", "Який фрукт пасує до десерту?", "Що берете на пікнік?", "Як проводите вільний вечір?", "Що берете на пікнік?"]
  }
};

async function seedGames(page, copy) {
  return page.evaluate(async copy => {
    const sb = window.__sbClient;
    const { data: auth, error: authError } = await sb.auth.getUser();
    if (authError) throw authError;
    // These three accounts are reserved for screenshots; remove leftovers from
    // an interrupted run without touching any other account's games.
    const { error: cleanupError } = await sb.from("games").delete().eq("owner_id", auth.user.id).in("name", copy.names);
    if (cleanupError) throw cleanupError;
    const games = [];
    const definitions = [
      { type: "prepared", title: copy.names[0] },
      { type: "poll_points", title: copy.names[1] },
      { type: "poll_text", title: copy.names[2] }
    ];
    try {
      for (const [index, def] of definitions.entries()) {
      const { data: game, error } = await sb.from("games").insert({
        owner_id: auth.user.id, name: def.title, type: def.type, status: "draft"
      }).select("id,name,type,share_key_poll").single();
      if (error) throw error;
        // Each game has ten questions total. Put the question from the old
        // Control screenshot first so every screenshot scenario can use it.
        const prompts = [copy.gameplay[0], ...copy.questions.slice(0, 9)];
        for (let ord = 0; ord < prompts.length; ord++) {
          const { data: question, error: qError } = await sb.from("questions")
            .insert({ game_id: game.id, ord: ord + 1, text: prompts[ord] }).select("id").single();
          if (qError) throw qError;
          if (index === 0 || index === 1) {
            const isBoardQuestion = ord === 0;
            const answers = isBoardQuestion ? copy.gameplay[1] : (index === 1 ? copy.pollAnswers : copy.fillerAnswers);
            const points = isBoardQuestion ? [39, 24, 16, 9, 7, 5] : [40, 30, 20, 10];
            const { error: aError } = await sb.from("answers").insert(answers.map((text, i) => ({ question_id: question.id, ord: i + 1, text, fixed_points: points[i] })));
            if (aError) throw aError;
          }
        }
        if (index > 0) {
          const { error: openError } = await sb.rpc("poll_open", { p_game_id: game.id, p_key: game.share_key_poll });
          if (openError) throw openError;
          const { data: opened, error: keyError } = await sb.from("games").select("share_key_poll").eq("id", game.id).single();
          if (keyError) throw keyError;
          game.share_key_poll = opened.share_key_poll;
        }
        games.push(game);
      }
    } catch (error) {
      await sb.from("games").delete().eq("owner_id", auth.user.id).in("name", copy.names);
      throw error;
    }
    return games;
  }, copy);
}

async function rpc(page, name, args) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }, { name, args });
}

async function setFriendlyScreenshotName(page, username) {
  return page.evaluate(async username => {
    const sb = window.__sbClient;
    const { data, error: authError } = await sb.auth.getUser();
    if (authError) throw authError;
    const user = data.user;
    const { data: profile, error: profileError } = await sb.from("profiles").select("username").eq("id", user.id).single();
    if (profileError) throw profileError;
    const original = { username: profile.username, metadata: user.user_metadata || {} };
    try {
      const { error } = await sb.from("profiles").update({ username }).eq("id", user.id);
      if (error) throw error;
      const { error: metadataError } = await sb.auth.updateUser({ data: { ...original.metadata, username } });
      if (metadataError) throw metadataError;
      return original;
    } catch (error) {
      await sb.from("profiles").update({ username: original.username }).eq("id", user.id);
      await sb.auth.updateUser({ data: original.metadata });
      throw error;
    }
  }, username);
}

async function restoreScreenshotName(page, original) {
  if (!page || !original) return;
  await page.evaluate(async original => {
    const sb = window.__sbClient;
    const { data } = await sb.auth.getUser();
    const { error } = await sb.from("profiles").update({ username: original.username }).eq("id", data.user.id);
    if (error) throw error;
    const { error: metadataError } = await sb.auth.updateUser({ data: original.metadata });
    if (metadataError) throw metadataError;
  }, original);
}

async function createRealContacts(ownerPage, friendPage, anonymousPage, language) {
  const friend = await friendPage.evaluate(async () => {
    const { data, error } = await window.__sbClient.auth.getUser();
    if (error) throw error;
    return { id: data.user.id, email: data.user.email };
  });
  const subscriberEmails = COPY[language].subscriberEmails;
  const friendRows = await rpc(ownerPage, "contacts_list", { p_kind: "friends" });
  let friendship = friendRows.find(row => row.user_id === friend.id && row.status === "active");
  if (!friendship) {
    friendship = friendRows.find(row => row.user_id === friend.id && row.status === "pending");
    if (!friendship) {
      const invite = await rpc(ownerPage, "friends_invite", { p_handle: friend.email });
      if (!invite?.id) throw new Error("Could not create screenshot friend invitation");
      friendship = { id: invite.id, direction: "outgoing", status: "pending" };
    }
    const acceptingPage = friendship.direction === "incoming" ? ownerPage : friendPage;
    const accepted = await rpc(acceptingPage, "friends_accept", { p_id: friendship.id });
    if (!accepted?.ok) throw new Error("Could not accept screenshot friend invitation");
  }

  const subscriberRows = await rpc(ownerPage, "contacts_list", { p_kind: "subscribers" });
  const subscriberIds = [];
  for (const subscriberEmail of subscriberEmails) {
    let subscriber = subscriberRows.find(row => row.email?.toLowerCase() === subscriberEmail && ["active", "pending"].includes(row.status));
    if (!subscriber) subscriber = await rpc(ownerPage, "subscribers_invite", { p_email: subscriberEmail });
    if (subscriber?.ok === false || !subscriber?.id) throw new Error(`Could not create screenshot subscriber ${subscriberEmail}: ${subscriber?.err || "unknown error"}`);
    if (subscriber.status !== "active") {
      if (!subscriber.token) throw new Error(`Screenshot subscriber ${subscriberEmail} has no invitation token`);
      const acceptance = await rpc(anonymousPage, "poll_sub_accept_email", { p_token: subscriber.token, p_email: subscriberEmail });
      if (!acceptance?.ok) throw new Error(`Could not accept screenshot subscriber ${subscriberEmail}: ${acceptance?.error || "unknown error"}`);
    }
    subscriberIds.push(subscriber.id);
  }
  return { friend, subscriberEmails, subscriberIds };
}

async function shareGamesWithContacts(ownerPage, games, contacts) {
  const taskSets = [];
  for (const game of games.filter(item => item.type.startsWith("poll_"))) {
    const sent = await rpc(ownerPage, "poll_share_send", {
      p_game_id: game.id, p_friend_ids: [contacts.friend.id], p_subscriber_ids: contacts.subscriberIds
    });
    if (!sent?.ok || sent.created !== 1 + contacts.subscriberIds.length) throw new Error(`Could not create friend and subscriber poll tasks (${game.name}): ${JSON.stringify(sent)}`);
    const tasks = await ownerPage.evaluate(async gameId => {
      const { data, error } = await window.__sbClient.from("poll_tasks")
        .select("id,token,recipient_user_id,recipient_email,game_id,status")
        .eq("game_id", gameId).order("created_at");
      if (error) throw error;
      return data;
    }, game.id);
    taskSets.push({ game, tasks });
  }
  return taskSets;
}

async function completeRealTasks(ownerPage, friendPage, anonymousPage, taskSets, copy) {
  for (const { game, tasks } of taskSets) {
    const source = await ownerPage.evaluate(async ({ gameId, type, voteText }) => {
      const sb = window.__sbClient;
      const { data: questions, error } = await sb.from("questions").select("id,ord").eq("game_id", gameId).order("ord");
      if (error) throw error;
      if (type === "poll_text") return questions.map(question => ({ question_id: question.id, answer_raw: voteText, answer_norm: voteText.toLocaleLowerCase() }));
      const ids = questions.map(question => question.id);
      const { data: answers, error: answerError } = await sb.from("answers").select("id,question_id").in("question_id", ids).eq("ord", 1);
      if (answerError) throw answerError;
      return questions.map(question => ({ question_id: question.id, answer_id: answers.find(answer => answer.question_id === question.id)?.id }));
    }, { gameId: game.id, type: game.type, voteText: copy.voteText });
    if (source.length !== 10 || source.some(item => game.type === "poll_points" ? !item.answer_id : !item.question_id)) {
      throw new Error(`Screenshot fixture ${game.name} does not have ten valid voting items`);
    }
    for (const task of tasks) {
      const voterPage = task.recipient_user_id ? friendPage : anonymousPage;
      await rpc(voterPage, "poll_task_opened", { p_token: task.token });
      await rpc(voterPage, game.type === "poll_text" ? "poll_text_submit_batch" : "poll_points_vote_batch", {
        p_game_id: game.id, p_key: game.share_key_poll, p_voter_token: `task:${task.id}`, p_items: source
      });
      const completion = await rpc(voterPage, "poll_task_done", { p_token: task.token });
      if (completion !== "ok") throw new Error(`Could not complete screenshot poll task: ${completion}`);
    }
  }
}

test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE !== "0") {
    await serveBranchCode(context, { pages: ["games", "games/editor", "games/settings", "polls", "polls/vote/points", "polls/vote/text", "tasks", "friends", "subscribers", "bases", "base-explorer", "logo", "logo/editor", "control"] });
  }
});

async function take(page, testInfo, name, ready) {
  try {
    await ready();
    await page.screenshot({ path: testInfo.outputPath(`shot-${LANGUAGE}-${name}.png`), fullPage: false, animations: "disabled" });
    console.log(`[manual-screenshot] captured ${LANGUAGE}/${name}`);
  } catch (error) {
    // One missing scene must not prevent the remaining screenshots.
    console.error(`[manual-screenshot] failed ${LANGUAGE}/${name}: ${error.message}`);
    return error;
  }
}

async function prepareMainDisplayFixture(browser, language) {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1600, height: 900 } });
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["control/display"] });
  const page = await context.newPage();
  try {
    await page.goto(`https://www.familiada.online/control/display/?preview=1&lang=${language}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#gameScreen")).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      window.__manualDisplayDone = false;
      window.addEventListener("familiada:preview-rendered", () => { window.__manualDisplayDone = true; }, { once: true });
    });
  const row = {
    rev: 1, step: "r_play", phase: "PLAY", top_card: "rounds", control_team: null,
    detail: {
      display: {
        mode: "GAME", suppressLogoDraw: true,
        previewNumbers: { left: "111", top: "999", right: "111" },
        previewXPositions: { A: [1, 3], B: [1, 3] }
      },
      teams: { teamA: "FAMILIADA", teamB: "ONLINE", defaultA: false, defaultB: false },
      settings: { uiLang: language },
      rounds: {
        roundNo: 1, question: COPY.pl.gameplay[0], bankPts: 62, totals: { A: 111, B: 111 },
        revealed: [1, 3, 5], xA: 3, xB: 3,
        answers: [
          { ord: 1, text: "TWÓRZ", fixed_points: 39 },
          { ord: 2, text: "ŁĄCZ", fixed_points: 0 },
          { ord: 3, text: "GŁOSUJ", fixed_points: 16 },
          { ord: 4, text: "BAW SIĘ", fixed_points: 0 },
          { ord: 5, text: "GRAJ", fixed_points: 7 }
        ]
      }
    }
  };
  await page.evaluate(row => window.postMessage({ type: "familiada:preview-row", row }, "*"), row);
    await page.waitForFunction(() => window.__manualDisplayDone === true, null, { timeout: 30_000 });
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function createGameplayDevices(browser, ownerPage, gameId) {
  const keys = await ownerPage.evaluate(async gameId => {
    const { data: session, error: sessionError } = await window.__sbClient.rpc("control_runtime_session_touch", {
      p_game_id: gameId, p_session_id: null
    });
    if (sessionError || !session?.ok) throw new Error(sessionError?.message || session?.error || "Could not start screenshot game session");
    const result = {};
    for (const type of ["display", "host", "buzzer"]) {
      const { data, error } = await window.__sbClient.rpc("control_runtime_device_link", { p_game_id: gameId, p_device_type: type });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || `Could not link screenshot ${type}`);
      result[type] = data.token;
    }
    return result;
  }, gameId);
  const contexts = [];
  const pages = {};
  for (const type of ["display", "host", "buzzer"]) {
    const deviceContext = await browser.newContext({ serviceWorkers: "block", locale: LANGUAGE === "uk" ? "uk-UA" : LANGUAGE === "en" ? "en-US" : "pl-PL", viewport: type === "display" ? { width: 1600, height: 900 } : { width: 1365, height: 768 } });
    contexts.push(deviceContext);
    await deviceContext.addInitScript(lang => localStorage.setItem("uiLang", lang), LANGUAGE);
    if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(deviceContext, { pages: [`control/${type}`] });
    const devicePage = await deviceContext.newPage();
    devicePage.setDefaultTimeout(20_000);
    await devicePage.goto(`https://www.familiada.online/go/?d=${type}&id=${gameId}&key=${keys[type]}`, { waitUntil: "domcontentloaded" });
    pages[type] = devicePage;
  }
  await pages.display.waitForFunction(() => !!window.__sbClient, null, { timeout: 30_000 });
  await expect(pages.display.locator("#blackScreen")).toBeVisible({ timeout: 30_000 });
  await pages.host.waitForFunction(() => !!window.__sbClient, null, { timeout: 30_000 });
  await pages.buzzer.waitForFunction(() => !!window.__sbClient, null, { timeout: 30_000 });
  await expect(pages.host.locator("#paperText2")).toBeAttached({ timeout: 30_000 });
  return { contexts, pages };
}

async function confirmGameplayTile(page, locator) {
  await locator.click();
  const write = page.waitForResponse(response => /\/rpc\/(?:control_runtime|game_state|control_v2)/.test(response.url()), { timeout: 20_000 }).catch(() => null);
  await locator.click();
  await write;
  await page.waitForTimeout(250);
}

test(`manual screenshot fixtures and scenes (${LANGUAGE})`, async ({ page, context, browser }, testInfo) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(15_000);
  if (!USERS[LANGUAGE]) throw new Error(`Unsupported SCREENSHOT_LANG: ${LANGUAGE}`);
  const friendLang = { pl: "en", en: "uk", uk: "pl" }[LANGUAGE];
  const friendUsername = USERS[friendLang];
  let friendContext;
  let anonymousContext;
  let mobileContext;
  let displayFixtureContext;
  let gameplayDeviceContexts = [];
  let games = [];
  let screenshotBaseId = null;
  let friendId = null;
  let ownerOriginalName = null;
  let friendOriginalName = null;
  const captureErrors = [];
  await loginAsTestUser(page, context, { username: USERS[LANGUAGE] });
  // Game settings can ask for confirmation while leaving after an auto-save.
  // Accept that navigation prompt so one scene cannot strand later captures.
  page.removeAllListeners("dialog");
  page.on("dialog", dialog => {
    if (dialog.type() === "beforeunload") dialog.accept().catch(() => {});
    else dialog.dismiss().catch(() => {});
  });
  try {
  ownerOriginalName = await setFriendlyScreenshotName(page, COPY[LANGUAGE].ownerName);
  await page.evaluate(lang => localStorage.setItem("uiLang", lang), LANGUAGE);
  await page.goto(`https://www.familiada.online/games/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  games = await seedGames(page, COPY[LANGUAGE]);
    friendContext = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1365, height: 768 } });
    if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(friendContext, { pages: ["tasks", "friends", "subscribers", "polls"] });
    const friendPage = await friendContext.newPage();
    friendPage.setDefaultTimeout(15_000);
    await loginAsTestUser(friendPage, friendContext, { username: friendUsername });
    friendOriginalName = await setFriendlyScreenshotName(friendPage, COPY[LANGUAGE].friendName);
    await friendPage.evaluate(lang => localStorage.setItem("uiLang", lang), LANGUAGE);
    friendId = await friendPage.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);

    anonymousContext = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
    if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(anonymousContext, { pages: ["polls/vote/points", "polls/vote/text"] });
    await anonymousContext.addInitScript(lang => localStorage.setItem("uiLang", lang), LANGUAGE);
    const anonymousPage = await anonymousContext.newPage();
    anonymousPage.setDefaultTimeout(15_000);
    await anonymousPage.goto("https://www.familiada.online/", { waitUntil: "domcontentloaded" });
    await anonymousPage.waitForFunction(() => !!window.__sbClient, { timeout: 20_000 });

    mobileContext = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
    if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(mobileContext, { pages: ["polls/vote/points"] });
    await mobileContext.addInitScript(lang => localStorage.setItem("uiLang", lang), LANGUAGE);
    const mobilePage = await mobileContext.newPage();
    mobilePage.setDefaultTimeout(15_000);

    const contacts = await createRealContacts(page, friendPage, anonymousPage, LANGUAGE);
    const taskSets = await shareGamesWithContacts(page, games, contacts);
    const friendTasks = taskSets.flatMap(set => set.tasks.filter(task => task.recipient_user_id === friendId));
    if (friendTasks.length !== 2) throw new Error("The friend account did not receive both screenshot tasks");

    // Capture owner facing resources after the real friend/subscriber exist.
    const gamesShotError = await take(page, testInfo, "games", async () => {
      await page.goto(`https://www.familiada.online/games/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(games[0].name, { timeout: 30_000 });
    });
    if (gamesShotError) captureErrors.push(gamesShotError);
    const editorShotError = await take(page, testInfo, "game-editor", async () => {
      await page.goto(`https://www.familiada.online/games/editor/?id=${games[0].id}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#qText")).toHaveValue(COPY[LANGUAGE].gameplay[0], { timeout: 30_000 });
      await expect(page.locator("#aList input.qf-text")).toHaveCount(6, { timeout: 15_000 });
      await expect(page.locator("#aList input.qf-text").first()).toHaveValue(COPY[LANGUAGE].gameplay[1][0]);
    });
    if (editorShotError) captureErrors.push(editorShotError);
    const readyGameError = await take(page, testInfo, "game-ready", async () => {
      await page.goto(`https://www.familiada.online/games/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      const updateError = await page.evaluate(async gameId => {
        const { error } = await window.__sbClient.from("games").update({ status: "ready" }).eq("id", gameId);
        return error?.message || null;
      }, games[0].id);
      if (updateError) throw new Error(updateError);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(games[0].name, { timeout: 20_000 });
      const status = await page.evaluate(async gameId => {
        const { data, error } = await window.__sbClient.from("games").select("status").eq("id", gameId).single();
        if (error) throw error;
        return data.status;
      }, games[0].id);
      expect(status).toBe("ready");
    });
    if (readyGameError) captureErrors.push(readyGameError);

    const logoNames = [`E13-${LANGUAGE}-wordmark`, `E13-${LANGUAGE}-drawn`];
    const logoError = await take(page, testInfo, "logos", async () => {
      await page.goto(`https://www.familiada.online/logo/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#grid .addCard")).toBeAttached({ timeout: 30_000 });
      await page.evaluate(language => window.__sbClient.from("user_logos").delete().like("name", `E13-${language}-%`), LANGUAGE);
      await Logo.insertLogo(page, { name: logoNames[0], type: "GLYPH_30x10", payload: Logo.textPayload("FAMILIADA") });
      await Logo.insertLogo(page, { name: `E13-${LANGUAGE}-team`, type: "GLYPH_30x10", payload: Logo.textPayload("ONLINE") });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("#grid")).toContainText(logoNames[0], { timeout: 20_000 });
    });
    if (logoError) captureErrors.push(logoError);

    const logoDrawError = await take(page, testInfo, "logo-draw-editor", async () => {
      await page.locator("#tabLogoDraw").click();
      await Logo.createNew(page, "Draw", logoNames[1]);
      await page.keyboard.press("p");
      const stage = await Logo.stage(page);
      for (const [x, y] of [[0.2, 0.25], [0.75, 0.25], [0.5, 0.75]]) await page.mouse.click(stage.x + stage.width * x, stage.y + stage.height * y);
      await page.keyboard.press("Enter");
      expect(await Logo.save(page)).toBe("saved");
      await expect(page.locator("#editorShell")).toHaveAttribute("data-mode", "DRAW");
    });
    if (logoDrawError) captureErrors.push(logoDrawError);

    const basesError = await take(page, testInfo, "bases", async () => {
      screenshotBaseId = await page.evaluate(async lang => {
        const sb = window.__sbClient;
        const { data: user } = await sb.auth.getUser();
        await sb.from("question_bases").delete().eq("owner_id", user.user.id).eq("name", `E13 ${lang} — Zestaw rodzinny`);
        const { data: base, error } = await sb.from("question_bases").insert({ owner_id: user.user.id, name: `E13 ${lang} — Zestaw rodzinny` }).select("id").single();
        if (error) throw error;
        const { data: category, error: categoryError } = await sb.from("qb_categories").insert({ base_id: base.id, name: "Na co dzień", ord: 1 }).select("id").single();
        if (categoryError) throw categoryError;
        const { error: qError } = await sb.from("qb_questions").insert([
          { base_id: base.id, category_id: category.id, ord: 1, payload: { text: "Co zabierasz na weekendowy wyjazd?", answers: [{ text: "Ubrania", fixed_points: 40 }, { text: "Jedzenie", fixed_points: 35 }, { text: "Telefon", fixed_points: 25 }] } },
          { base_id: base.id, category_id: category.id, ord: 2, payload: { text: "Co pomaga odpocząć po pracy?", answers: [{ text: "Spacer", fixed_points: 40 }, { text: "Muzyka", fixed_points: 35 }, { text: "Książka", fixed_points: 25 }] } }
        ]);
        if (qError) throw qError;
        return base.id;
      }, LANGUAGE);
      await page.goto(`https://www.familiada.online/bases/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      const card = page.locator(`.card[data-base-id="${screenshotBaseId}"]`);
      await expect(card).toContainText("Zestaw rodzinny", { timeout: 30_000 });
    });
    if (basesError) captureErrors.push(basesError);
    const explorerError = await take(page, testInfo, "base-explorer", async () => {
      const card = page.locator(`.card[data-base-id="${screenshotBaseId}"]`);
      await expect(card).toBeVisible({ timeout: 20_000 });
      if (!(await card.evaluate(element => element.classList.contains("selected")))) await card.click();
      await expect(card).toHaveClass(/selected/, { timeout: 10_000 });
      const browse = page.locator("#btnBrowse");
      await expect(browse).toBeEnabled({ timeout: 10_000 });
      await browse.click();
      await page.waitForURL(url => url.pathname.includes("/bases/explorer"), { timeout: 30_000 });
      await expect(page.locator("body")).toContainText("Co zabierasz na weekendowy wyjazd?", { timeout: 30_000 });
    });
    if (explorerError) captureErrors.push(explorerError);

    const settingsFinalError = await take(page, testInfo, "game-settings-finale", async () => {
      // Let the editor release the game lock before opening its settings.
      await page.goto(`https://www.familiada.online/games/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(games[0].name, { timeout: 20_000 });
      await page.waitForTimeout(2_000);
      await page.goto(`https://www.familiada.online/games/settings?id=${games[0].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".gs-sidebar-item[data-cat=questions]")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("#gsContentInner")).toHaveClass(/skel-step-ready/, { timeout: 30_000 });
      await page.locator('.gs-sidebar-item[data-cat="questions"]').click();
      await page.locator('.toggle-item:has(input[name="gsHasFinal"][value="yes"])').click({ timeout: 12_000 });
      await page.locator('.toggle-item:has(input[name="gsFinalMode"][value="pick"])').click({ timeout: 12_000 });
      await page.locator('.gs-sidebar-item[data-cat="finale"]').click();
      await expect(page.locator("#gsFinalePool .qRow")).toHaveCount(10, { timeout: 20_000 });
      // Keep the Control question out of the finale; it remains first in the
      // round pool and the five finale prompts come from the other nine.
      for (let i = 0; i < 5; i++) await page.locator("#gsFinalePool .qRow").nth(1).click();
      await expect(page.locator(".gs-badge-row .tag b")).toHaveText("5");
      await page.waitForTimeout(1200);
    });
    if (settingsFinalError) captureErrors.push(settingsFinalError);

    const settingsRoundsError = await take(page, testInfo, "game-settings-rounds", async () => {
      await page.locator('.gs-sidebar-item[data-cat="questions"]').click();
      await page.locator('.toggle-item:has(input[name="gsRoundsMode"][value="pick"])').click();
      await page.locator('.gs-sidebar-item[data-cat="rounds"]').click();
      await expect(page.locator("#gsRoundsOrderList .roundsOrderItem").first()).toContainText(COPY[LANGUAGE].gameplay[0], { timeout: 20_000 });
      await page.waitForTimeout(1200);
    });
    if (settingsRoundsError) captureErrors.push(settingsRoundsError);

    const settingsDisplayError = await take(page, testInfo, "game-settings-display", async () => {
      await page.locator('.gs-sidebar-item[data-cat="display"]').click();
      const wordmark = page.locator(`.gs-logo-tile[data-logo-id]`).filter({ hasText: `E13-${LANGUAGE}-wordmark` });
      await expect(wordmark).toBeVisible({ timeout: 30_000 });
      await wordmark.click();
      await expect(wordmark).toHaveClass(/selected/);
    });
    if (settingsDisplayError) captureErrors.push(settingsDisplayError);
    const settingsSoundError = await take(page, testInfo, "game-settings-sound", async () => {
      await page.locator('.gs-sidebar-item[data-cat="sound"]').click();
      await expect(page.locator("#sfxTableGs .sfx-row").first()).toBeVisible({ timeout: 30_000 });
    });
    if (settingsSoundError) captureErrors.push(settingsSoundError);

    // For this temporary screenshot game, make one completed round enough to
    // reach the finale. These are ordinary per-game settings and are removed
    // with the fixture after the run.
    const gameplayError = await take(page, testInfo, "gameplay-control", async () => {
      await page.locator('.gs-sidebar-item[data-cat="game"]').click();
      await expect(page.locator("#gsFinalMinPts")).toBeVisible({ timeout: 15_000 });
      await page.locator("#gsFinalMinPts").fill("1");
      await page.locator("#gsFinalMinPts").dispatchEvent("change");
      await page.locator("#gsFinalTarget").fill("50");
      await page.locator("#gsFinalTarget").dispatchEvent("change");
      await page.locator("#btnSaveAll").click();
      await expect(page.locator("#gsFooterMsg")).toHaveAttribute("data-state", "saved", { timeout: 30_000 });

      const devices = await createGameplayDevices(browser, page, games[0].id);
      gameplayDeviceContexts = devices.contexts;
      await page.goto(`https://www.familiada.online/control/?id=${games[0].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".stepTitle")).toContainText(/Urządzenia|Devices|Пристрої/, { timeout: 30_000 });
      await page.getByRole("button", { name: /^(Dalej|Next|Далі)$/ }).click();
      const ready = page.getByRole("button", { name: /^(Gotowe — przejdź do rozgrywki|Done — start the game|Готово — почати гру)$/ });
      await expect(ready).toBeEnabled({ timeout: 20_000 });
      await ready.click();
      await expect(devices.pages.display.locator("#gameScreen")).toBeVisible({ timeout: 30_000 });
      const startGame = page.getByRole("button", { name: /^(Rozpocznij grę|Start game|Розпочати гру)$/ });
      await expect(startGame).toBeEnabled({ timeout: 30_000 });
      await startGame.click();
      await expect(page.locator("#c2TopbarProgress")).toHaveAttribute("title", /Runda 1|Round 1|Раунд 1/, { timeout: 30_000 });
      const startRound = page.getByRole("button", { name: /^(Rozpocznij rundę|Start|Розпочати)$/ });
      await expect(startRound).toBeEnabled({ timeout: 30_000 });
      await startRound.click();
      await expect(page.locator(".c2-stepper-question")).toContainText(COPY[LANGUAGE].gameplay[0], { timeout: 20_000 });
      await devices.pages.buzzer.getByRole("button", { name: /Przycisk A|Button A|Кнопка A/ }).click();
      const winner = page.getByRole("button", { name: /Zatwierdź:/ });
      await expect(winner).toBeEnabled({ timeout: 20_000 });
      await confirmGameplayTile(page, winner);
      const answerTiles = page.locator(".c2-tilegrid button");
      await confirmGameplayTile(page, answerTiles.nth(0));
      await confirmGameplayTile(page, answerTiles.nth(2));
      const strike = page.getByRole("button", { name: "X", exact: true });
      if (await strike.count()) await confirmGameplayTile(page, strike);
      await expect(devices.pages.display.locator("#gameScreen")).toBeVisible();
      await expect(devices.pages.host.locator("#paperText2")).toContainText(COPY[LANGUAGE].gameplay[0]);
      await expect(page.locator(".c2-gameplay-nav .c2-statusbar")).toBeVisible();
    });
    if (gameplayError) captureErrors.push(gameplayError);
    const gameplayHostError = await take(gameplayDeviceContexts.length ? await gameplayDeviceContexts[1].pages()[0] : page, testInfo, "gameplay-host", async () => {
      await expect(gameplayDeviceContexts[1].pages()[0].locator("#paperText2")).toContainText(COPY[LANGUAGE].gameplay[0], { timeout: 20_000 });
    });
    if (gameplayHostError) captureErrors.push(gameplayHostError);
    const gameplayDisplayError = await take(gameplayDeviceContexts.length ? await gameplayDeviceContexts[0].pages()[0] : page, testInfo, "gameplay-display", async () => {
      await expect(gameplayDeviceContexts[0].pages()[0].locator("#gameScreen")).toBeVisible({ timeout: 20_000 });
    });
    if (gameplayDisplayError) captureErrors.push(gameplayDisplayError);
    const gameplayFinaleError = await take(page, testInfo, "gameplay-finale", async () => {
      const answerTiles = page.locator(".c2-tilegrid button");
      for (let i = 1; i < 6; i++) {
        const tile = answerTiles.nth(i);
        if (await tile.isEnabled().catch(() => false)) await confirmGameplayTile(page, tile);
      }
      const endRound = page.getByRole("button", { name: /^(Zakończ rundę|End round|Завершити раунд|Przejdź do zakończenia gry|Go to game end|Перейти до завершення гри)$/ });
      if (await endRound.isEnabled().catch(() => false)) await endRound.click();
      const next = page.getByRole("button", { name: /^(Przejdź do finału|Go to the final|Перейти до фіналу)$/ });
      await expect(next).toBeEnabled({ timeout: 25_000 });
      await next.click();
      const startFinal = page.getByRole("button", { name: /^(Rozpocznij finał|Start|Старт)$/ });
      await expect(startFinal).toBeEnabled({ timeout: 30_000 });
      await startFinal.click();
      await expect(page.locator("#c2TopbarProgress")).toHaveAttribute("title", /Finał|Final|Фінал/, { timeout: 30_000 });
      const finalAnswers = page.locator("#app input[type=text]");
      await expect(finalAnswers).toHaveCount(5, { timeout: 20_000 });
      for (let i = 0; i < 5; i++) await finalAnswers.nth(i).fill(COPY[LANGUAGE].finalAnswers[i]);
    });
    if (gameplayFinaleError) captureErrors.push(gameplayFinaleError);

    const friendsShotError = await take(page, testInfo, "friends", async () => {
      await page.goto(`https://www.familiada.online/friends/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#contactsHost")).toHaveClass(/skel-step-ready/, { timeout: 30_000 });
      await page.locator("#contactsTabReceived").dispatchEvent("click");
      await expect(page.locator("#contactsReceived")).toBeVisible();
      await expect(page.locator("#contactsReceived")).toContainText(contacts.friend.email.split("@")[0], { timeout: 15_000 });
    });
    if (friendsShotError) captureErrors.push(friendsShotError);
    const subscribersShotError = await take(page, testInfo, "subscribers", async () => {
      await page.goto(`https://www.familiada.online/subscribers/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#contactsHost")).toHaveClass(/skel-step-ready/, { timeout: 30_000 });
      await page.locator("#contactsTabReceived").dispatchEvent("click");
      await expect(page.locator("#contactsReceived")).toBeVisible();
      for (const email of contacts.subscriberEmails) await expect(page.locator("#contactsReceived")).toContainText(email, { timeout: 15_000 });
    });
    if (subscribersShotError) captureErrors.push(subscribersShotError);

    const pollShotError = await take(page, testInfo, "poll-sharing", async () => {
      await page.goto(`https://www.familiada.online/polls/?id=${games[1].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(games[1].name, { timeout: 30_000 });
      await expect(page.locator("#btnAddRecipients")).toBeVisible({ timeout: 15_000 });
      for (const email of contacts.subscriberEmails) await expect(page.locator("#subsGrid")).toContainText(email, { timeout: 15_000 });
      // The final public QR destination will be supplied later. Keep this
      // scene capturable while that link is undecided or QR rendering fails.
      // Hide only the empty/error QR control in this screenshot context; the
      // rest of the sharing screen remains a real application view.
      const qr = page.locator("#qr");
      try {
        await expect(qr.locator("canvas, img")).toBeVisible({ timeout: 5_000 });
      } catch {
        await qr.evaluate(element => {
          element.setAttribute("aria-hidden", "true");
          element.style.visibility = "hidden";
        });
        console.log(`[manual-screenshot] ${LANGUAGE}/poll-sharing captured without QR`);
      }
    });
    if (pollShotError) captureErrors.push(pollShotError);
    const textPollShotError = await take(page, testInfo, "poll-text-sharing", async () => {
      await page.goto(`https://www.familiada.online/polls/?id=${games[2].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(games[2].name, { timeout: 30_000 });
      for (const email of contacts.subscriberEmails) await expect(page.locator("#subsGrid")).toContainText(email, { timeout: 15_000 });
    });
    if (textPollShotError) captureErrors.push(textPollShotError);

    const tasksPendingError = await take(friendPage, testInfo, "tasks-pending", async () => {
      await friendPage.goto(`https://www.familiada.online/tasks/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(friendPage.locator("#tasksHost .rowsRow")).toHaveCount(2, { timeout: 30_000 });
    });
    if (tasksPendingError) captureErrors.push(tasksPendingError);

    const mobileVoteError = await take(mobilePage, testInfo, "anonymous-voting-mobile", async () => {
      await mobilePage.goto(`https://www.familiada.online/polls/vote/points/?id=${games[1].id}&key=${games[1].share_key_poll}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(mobilePage.locator("#qtext")).toContainText(COPY[LANGUAGE].gameplay[0], { timeout: 30_000 });
      await expect(mobilePage.locator("#alist button").first()).toBeVisible({ timeout: 15_000 });
    });
    if (mobileVoteError) captureErrors.push(mobileVoteError);

    const anonymousDoneError = await take(mobilePage, testInfo, "anonymous-voting-done-mobile", async () => {
      const prompts = [COPY[LANGUAGE].gameplay[0], ...COPY[LANGUAGE].questions.slice(0, 9)];
      for (let index = 0; index < prompts.length; index++) {
        await expect(mobilePage.locator("#qtext")).toContainText(prompts[index], { timeout: 15_000 });
        await mobilePage.locator("#alist button").first().click();
      }
      await expect(mobilePage.locator("#qbox")).toBeHidden({ timeout: 30_000 });
      const count = await page.evaluate(async gameId => {
        const { count, error } = await window.__sbClient.from("poll_votes").select("id", { count: "exact", head: true }).eq("game_id", gameId);
        if (error) throw error;
        return count;
      }, games[1].id);
      // One anonymous participant voted once on each of the ten questions.
      expect(count).toBe(10);
    });
    if (anonymousDoneError) captureErrors.push(anonymousDoneError);

    await completeRealTasks(page, friendPage, anonymousPage, taskSets, COPY[LANGUAGE]);
    const tasksDoneError = await take(friendPage, testInfo, "tasks-done", async () => {
      await friendPage.goto(`https://www.familiada.online/tasks/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(friendPage.locator("#tasksHost .rowsRow")).toHaveCount(2, { timeout: 30_000 });
      await friendPage.locator(".rowsSection--done .rowsSectionHead").click();
      await expect(friendPage.locator(".rowsSection--done .rowsRow")).toHaveCount(2);
    });
    if (tasksDoneError) captureErrors.push(tasksDoneError);

    const resultsError = await take(page, testInfo, "poll-votes", async () => {
      await page.goto(`https://www.familiada.online/polls/?id=${games[1].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#tabResults")).toBeVisible({ timeout: 30_000 });
      await page.locator("#tabResults").click();
      await expect(page.locator("#resultsList")).toContainText(COPY[LANGUAGE].pollAnswers[0], { timeout: 20_000 });
    });
    if (resultsError) captureErrors.push(resultsError);
    const textResultsError = await take(page, testInfo, "poll-text-votes", async () => {
      await page.goto(`https://www.familiada.online/polls/?id=${games[2].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#tabResults")).toBeVisible({ timeout: 30_000 });
      await page.locator("#tabResults").click();
      await expect(page.locator("#resultsList")).toContainText(COPY[LANGUAGE].voteText.toLocaleLowerCase(), { timeout: 20_000 });
    });
    if (textResultsError) captureErrors.push(textResultsError);

    if (LANGUAGE === "pl") {
      try {
        const fixture = await prepareMainDisplayFixture(browser, LANGUAGE);
        displayFixtureContext = fixture.context;
        const mainDisplayError = await take(fixture.page, testInfo, "main-display", async () => {
          await expect(fixture.page.locator("#gameScreen")).toBeVisible();
          await fixture.page.waitForFunction(() => window.__manualDisplayDone === true, null, { timeout: 30_000 });
        });
        if (mainDisplayError) captureErrors.push(mainDisplayError);
      } catch (error) {
        console.error(`[manual-screenshot] failed pl/main-display: ${error.message}`);
        captureErrors.push(error);
      }
    }
  } finally {
    for (const deviceContext of gameplayDeviceContexts) await deviceContext.close().catch(() => {});
    await page.goto(`https://www.familiada.online/games/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 10_000 }).catch(() => {});
    if (games.length) {
      await page.evaluate(async ids => {
        const { error } = await window.__sbClient.from("games").delete().in("id", ids);
        if (error) throw error;
      }, games.map(game => game.id)).catch(error => console.error("[manual-screenshot] game cleanup failed:", error.message));
    }
    if (screenshotBaseId) await page.evaluate(async id => {
      const { error } = await window.__sbClient.from("question_bases").delete().eq("id", id);
      if (error) throw error;
    }, screenshotBaseId).catch(error => console.error("[manual-screenshot] base cleanup failed:", error.message));
    await page.evaluate(async language => {
      await window.__sbClient.from("user_logos").delete().like("name", `E13-${language}-%`);
    }, LANGUAGE).catch(error => console.error("[manual-screenshot] logo cleanup failed:", error.message));
    // The accepted friendship and subscriber are stable fixtures, reused
    // instead of creating declined rows/cooldowns on every run.
    // Keep one active friend and subscriber per dedicated account. Reuse them
    // on later runs; games and their per-poll tasks are deleted below.
    await restoreScreenshotName(friendContext?.pages()[0], friendOriginalName).catch(error => console.error("[manual-screenshot] friend name restore failed:", error.message));
    await restoreScreenshotName(page, ownerOriginalName).catch(error => console.error("[manual-screenshot] owner name restore failed:", error.message));
    await friendContext?.close();
    await anonymousContext?.close();
    await mobileContext?.close();
    await displayFixtureContext?.close();
  }

  if (captureErrors.length) throw new Error(`${captureErrors.length} screenshot scene(s) failed; successful captures remain available as artifacts.`);
});
