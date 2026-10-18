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

const TEAM_NAMES = {
  pl: ["Króliczki", "Zajączki"],
  en: ["Bunnies", "Rabbits"],
  uk: ["Зайчики", "Кролики"]
};

async function seedGames(page, copy) {
  return page.evaluate(async copy => {
    const sb = window.__sbClient;
    const { data: auth, error: authError } = await sb.auth.getUser();
    if (authError) throw authError;
    // Keep the seeded data compact: insert each game's questions and answers
    // in batches instead of making one network round trip per row.
    const games = [];
    const definitions = [
      { type: "prepared", title: copy.names[0] },
      { type: "poll_points", title: copy.names[1] },
      { type: "poll_text", title: copy.names[2] }
    ];
    for (const [index, def] of definitions.entries()) {
      let game = null;
      if (index === 0) {
        const { data: existing, error: lookupError } = await sb.from("games")
          .select("id,name,type,status,share_key_poll")
          .eq("owner_id", auth.user.id).eq("name", def.title).maybeSingle();
        if (lookupError) throw lookupError;
        game = existing;
        if (game && game.type !== def.type) throw new Error(`Screenshot fixture has unexpected type: ${def.title}`);
      } else {
        // Poll sharing has a per-game resend cooldown. Start each capture with
        // fresh poll IDs while keeping the same visible names and content.
        const { error: removeOldPollError } = await sb.from("games").delete()
          .eq("owner_id", auth.user.id).eq("name", def.title);
        if (removeOldPollError) throw removeOldPollError;
      }
      if (!game) {
        const { data: created, error } = await sb.from("games").insert({
          owner_id: auth.user.id, name: def.title, type: def.type, status: "draft"
        }).select("id,name,type,share_key_poll").single();
        if (error) throw error;
        game = created;
      } else {
        const { error: statusError } = await sb.from("games").update({ status: "draft" }).eq("id", game.id);
        if (statusError) throw statusError;
        const { error: questionCleanupError } = await sb.from("questions").delete().eq("game_id", game.id);
        if (questionCleanupError) throw questionCleanupError;
      }

      // The round question stays first in every game, including both polls.
      const prompts = [copy.gameplay[0], ...copy.questions.slice(0, 9)];
      const { data: questionRows, error: qError } = await sb.from("questions")
        .insert(prompts.map((text, ord) => ({ game_id: game.id, ord: ord + 1, text })))
        .select("id,ord").order("ord");
      if (qError) throw qError;
      if (index === 0 || index === 1) {
        const answerRows = [];
        for (const question of questionRows) {
          const first = question.ord === 1;
          const answers = index === 1 ? copy.pollAnswers : (first ? copy.gameplay[1] : copy.fillerAnswers);
          const points = index === 1 ? answers.map(() => 0) : (first ? [39, 24, 16, 9, 7, 5] : [40, 30, 20, 10]);
          answers.forEach((text, i) => answerRows.push({ question_id: question.id, ord: i + 1, text, fixed_points: points[i] }));
        }
        const { error: aError } = await sb.from("answers").insert(answerRows);
        if (aError) throw aError;
      }
      if (index === 0) {
        const { error: readyError } = await sb.from("games").update({ status: "ready" }).eq("id", game.id);
        if (readyError) throw readyError;
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
    return games;
  }, copy);
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

// Use the application's own renderers with local visual data. This keeps the
// examples consistent with the shipped UI without creating accounts, tasks,
// subscriptions, or hundreds of production vote rows just for PNGs.
async function renderVisualFixture(page, kind, copy) {
  await page.evaluate(async ({ kind, copy }) => {
    const lang = new URLSearchParams(location.search).get("lang") || "pl";
    const { t } = await import("/shared/translation/translation.js?v=v2026-10-14T23162");
    if (kind === "contacts") {
      const { shareSectionEl } = await import("/shared/js/core/share-sections.js?v=v2026-10-14T23162");
      const friends = location.pathname.includes("/friends/");
      const host = document.getElementById("contactsReceived");
      const people = friends
        ? [{ label: copy.friendName, note: `${copy.friendName.toLocaleLowerCase().replaceAll(" ", ".")}@example.com`, state: "active" }]
        : copy.subscriberEmails.map(email => ({ label: email, note: t("contacts.accountCreated"), state: "active" }));
      const rows = people.map((person, index) => ({
        id: `visual-${kind}-${index}`, label: person.label, compact: true,
        tags: person.state === "active" ? [] : [{ text: t(`contacts.status.${person.state}`) }],
        note: person.note,
        actions: [{ key: "remove", icon: "trash", title: t("contacts.actions.remove"), onClick: () => {} }]
      }));
      host.replaceChildren(shareSectionEl({ key: "active", title: t(`contacts.sections.${friends ? "friend" : "active"}`), rows }));
      return;
    }
    if (kind === "tasks" || kind === "tasks-done") {
      const { renderRowSections } = await import("/shared/js/core/share-sections.js?v=v2026-10-14T23162");
      const host = document.getElementById("tasksHost");
      const rows = [0, 1].map(index => ({
        id: `visual-task-${index}`, avatarIcon: "polls", title: copy.names[index + 1],
        note: `${t("tasks.from", { owner: copy.friendName })} · ${t("tasks.received", { date: new Date().toLocaleDateString(lang) })}`,
        noteMobile: t("tasks.from", { owner: copy.friendName }),
        actions: kind === "tasks-done" ? [] : [{ key: "vote", text: t("tasks.actions.vote"), icon: "polls", gold: true, onClick: () => {} }]
      }));
      const doneRows = rows.map(row => ({ ...row, id: `${row.id}-done`, note: `${t("tasks.from", { owner: copy.friendName })} · ${t("tasks.doneAt", { date: new Date().toLocaleDateString(lang) })}`, actions: [] }));
      renderRowSections(host, [
        { key: "todo", title: t("tasks.sections.todo"), rows: kind === "tasks" ? rows : [] },
        { key: "done", title: t("tasks.sections.done"), rows: kind === "tasks-done" ? doneRows : [], collapsed: false }
      ], { emptyText: t("tasks.empty") });
      return;
    }
    if (kind === "poll-share") {
      const { shareSectionEl } = await import("/shared/js/core/share-sections.js?v=v2026-10-14T23162");
      document.getElementById("subsGrid").replaceChildren(shareSectionEl({
        key: "poll-shared", title: t("polls.share.recipientsTitle"), rows: copy.subscriberEmails.map((email, index) => ({
          id: `visual-recipient-${index}`, label: email, compact: true,
          tags: [{ text: t("shareSections.channel.subscriber"), cls: "tag--muted" }],
          note: index === 0 ? t("polls.share.state.done") : t("polls.share.state.waiting"),
          actions: [{ key: "remove", icon: "trash", title: t("polls.share.remove"), onClick: () => {} }]
        }))
      }));
      const summary = document.getElementById("subsSummary");
      if (summary) summary.textContent = lang === "en" ? "3 invited · 1 responded" : lang === "uk" ? "Запрошено: 3 · відповіли: 1" : "Zaproszono: 3 · odpowiedziała 1 osoba";
      return;
    }
    if (kind === "results" || kind === "text-results") {
      const { createPollResults } = await import("/shared/js/core/poll-results.js?v=v2026-10-14T23162");
      const renderer = createPollResults(document.getElementById("resultsList"));
      if (kind === "results") renderer.render({
        status: "poll_open", type: "poll_points", questions: [{ id: "visual-question", ord: 1, text: copy.gameplay[0], answers: copy.pollAnswers.map((text, index) => ({ id: `visual-answer-${index}`, text, votes: [65, 35, 20, 5][index] })) }]
      });
      else renderer.render({
        status: "poll_open", type: "poll_text", questions: [{ id: "visual-text-question", ord: 1, text: copy.questions[0], text_rows: [{ text: copy.voteText, val: 18 }, { text: copy.pollAnswers[1], val: 7 }] }]
      });
    }
  }, { kind, copy });
}

async function prepareDevicePreviewFixture(browser, language, device = "display") {
  const viewport = device === "display" ? { width: 1600, height: 900 } : { width: 1365, height: 768 };
  const context = await browser.newContext({ serviceWorkers: "block", viewport });
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: [`control/${device}`] });
  const page = await context.newPage();
  try {
    await page.goto("https://www.familiada.online/", { waitUntil: "domcontentloaded" });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe id="devicePreview" title="${device}" src="/control/${device}/?preview=1&lang=${language}"></iframe><script>window.previewReady=false;addEventListener('message',event=>{if(event.source===document.getElementById('devicePreview').contentWindow&&['familiada:preview-ready','familiada:host-preview-ready'].includes(event.data?.type))window.previewReady=true})<\/script></body></html>`);
    await page.waitForFunction(() => window.previewReady === true, null, { timeout: 30_000 });
    const frame = page.frames().find(item => item.url().includes(`/control/${device}/`) && item.url().includes("preview=1"));
    if (!frame) throw new Error(`Could not load ${device} preview frame`);
    await frame.evaluate(() => {
      window.__manualDisplayDone = false;
      window.addEventListener("familiada:preview-rendered", () => { window.__manualDisplayDone = true; }, { once: true });
    });
    const row = {
      rev: 1, step: "r_play", phase: "PLAY", top_card: "rounds", control_team: null,
      detail: {
        display: {
          mode: "GAME", suppressLogoDraw: true,
        },
        teams: { teamA: TEAM_NAMES[language][0], teamB: TEAM_NAMES[language][1], defaultA: false, defaultB: false },
        settings: { uiLang: language },
        rounds: {
          roundNo: 1, question: { text: COPY[language].gameplay[0] }, bankPts: 38, totals: { A: 62, B: 47 },
          revealed: [1, 3], xA: 1, xB: 0,
          answers: [
            { ord: 1, text: language === "pl" ? "TWÓRZ" : language === "en" ? "CREATE" : "СТВОРЮЙ", fixed_points: 39 },
            { ord: 2, text: language === "pl" ? "ŁĄCZ" : language === "en" ? "CONNECT" : "ЄДНАЙ", fixed_points: 0 },
            { ord: 3, text: language === "pl" ? "GŁOSUJ" : language === "en" ? "VOTE" : "ГОЛОСУЙ", fixed_points: 16 },
            { ord: 4, text: language === "pl" ? "BAW SIĘ" : language === "en" ? "HAVE FUN" : "ГРАЙ", fixed_points: 0 },
            { ord: 5, text: language === "pl" ? "GRAJ" : language === "en" ? "PLAY" : "ГРАЙ", fixed_points: 7 }
          ]
        },
        host: { covered: false }
      }
    };
    await page.evaluate(row => document.getElementById("devicePreview").contentWindow.postMessage({ type: "familiada:preview-row", row }, location.origin), row);
    if (device === "display") await frame.waitForFunction(() => window.__manualDisplayDone === true, null, { timeout: 30_000 });
    else await expect(frame.locator("#paperText1")).toContainText(COPY[language].gameplay[0], { timeout: 30_000 });
    return { context, page, frame };
  } catch (error) {
    await context.close();
    throw error;
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

test(`manual screenshot fixtures and scenes (${LANGUAGE})`, async ({ page, context, browser }, testInfo) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(15_000);
  if (!USERS[LANGUAGE]) throw new Error(`Unsupported SCREENSHOT_LANG: ${LANGUAGE}`);
  let mobileContext;
  let displayFixtureContext;
  let gameplayPreviewContexts = [];
  let games = [];
  let screenshotBaseId = null;
  let ownerOriginalName = null;
  const captureErrors = [];
  await loginAsTestUser(page, context, { username: USERS[LANGUAGE] });
  // Game settings can ask for confirmation while leaving after an auto-save.
  // Accept that navigation prompt so one scene cannot strand later captures.
  page.removeAllListeners("dialog");
  page.on("dialog", dialog => {
    if (dialog.type() === "beforeunload") dialog.accept().catch(() => {});
    else if (dialog.type() === "confirm") dialog.accept().catch(() => {});
    else dialog.dismiss().catch(() => {});
  });
  try {
  ownerOriginalName = await setFriendlyScreenshotName(page, COPY[LANGUAGE].ownerName);
  await page.evaluate(lang => localStorage.setItem("uiLang", lang), LANGUAGE);
  await page.goto(`https://www.familiada.online/games/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 20_000 });
  games = await seedGames(page, COPY[LANGUAGE]);
    // Capture a clean Control setup, then the matching pre-rendered device views.
    // Screenshots describe the interface; they do not need live device sessions.
    const gameplayControlError = await take(page, testInfo, "gameplay-control", async () => {
      await page.goto(`https://www.familiada.online/control/?id=${games[0].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      const reset = page.locator("#btnStartOver");
      await expect(reset).toBeVisible({ timeout: 30_000 });
      await reset.click();
      const confirmReset = page.getByRole("button", { name: /^(Tak|Yes|Так|Да)$/ });
      if (await confirmReset.count()) await confirmReset.click();
      await expect(page.locator("#app")).toBeVisible({ timeout: 15_000 });
      const controlSound = page.locator('.toggle-item:has(input[name="soundSource"][value="control"])');
      if (await controlSound.count() && !(await controlSound.locator("input").isChecked())) await controlSound.click();
      // Reset first as the normal Control flow requires, then paint a matching
      // round fixture so this screenshot shows the actual gameplay controls.
      await page.evaluate(async ({ language, question, answers, teamNames }) => {
        const { createUI } = await import("/control/js/ui.js?v=v2026-10-14T23162");
        const { makeDefaultState } = await import("/shared/js/gameplay/gameStateShape.js?v=v2026-10-14T23162");
        const state = makeDefaultState("manual-control-preview");
        state.step = "r_play";
        state.topCard = "rounds";
        state.phase = "PLAY";
        state.controlTeam = "A";
        state.locks = { gameStarted: true, finalActive: false, gameEnded: false };
        state.teams = { teamA: teamNames[0], teamB: teamNames[1] };
        state.settings.uiLang = language;
        state.rounds.roundNo = 1;
        state.rounds.question = { id: "manual-round", text: question };
        state.rounds.answers = answers.map(([text, fixed_points], index) => ({ id: `manual-answer-${index + 1}`, ord: index + 1, text, fixed_points }));
        state.rounds.revealed = [1, 3];
        state.rounds.bankPts = 38;
        state.rounds.totals = { A: 62, B: 47 };
        state.rounds.xA = 1;
        state.rounds.xB = 0;
        state.rounds.allowPass = true;
        const ui = createUI({ root: document.querySelector("#app"), emit: () => {} });
        ui.render(state, { presenceFlags: { display: true, host: true, buzzer: false }, busy: false, typingPending: false, devicesBlocked: false });
      }, { language: LANGUAGE, question: COPY[LANGUAGE].gameplay[0], answers: COPY[LANGUAGE].gameplay[1].map((text, index) => [text, [39, 24, 16, 9, 7, 5][index]]), teamNames: TEAM_NAMES[LANGUAGE] });
      await expect(page.locator(".c2-tilegrid .c2-tile")).toHaveCount(9, { timeout: 15_000 });
      await expect(page.locator(".c2-stepper-question")).toContainText(COPY[LANGUAGE].gameplay[0]);
    });
    if (gameplayControlError) captureErrors.push(gameplayControlError);

    const finaleError = await take(page, testInfo, "gameplay-finale", async () => {
      // Render a representative finale entry screen from a local state fixture.
      // This is a visual manual screenshot, not a simulated live match.
      await page.evaluate(async ({ language, prompts, answers, teamNames }) => {
        const { createUI } = await import("/control/js/ui.js?v=v2026-10-14T23162");
        const { makeDefaultState } = await import("/shared/js/gameplay/gameStateShape.js?v=v2026-10-14T23162");
        const state = makeDefaultState("manual-finale-preview");
        state.step = "f_p1_entry";
        state.topCard = "final";
        state.phase = "FINAL";
        state.locks = { gameStarted: true, finalActive: true, gameEnded: false };
        state.teams = { teamA: teamNames[0], teamB: teamNames[1] };
        state.settings.uiLang = language;
        state.settings.hasFinal = true;
        state.final.questions = prompts.map((text, index) => ({ id: `final-${index + 1}`, text, answers: [] }));
        state.final.runtime.timer = { running: false, phase: null, endsAt: 0, usedP1: true, usedP2: false };
        state.final.runtime.p1 = answers.map(text => ({ text }));
        const ui = createUI({ root: document.querySelector("#app"), emit: () => {} });
        ui.render(state, { presenceFlags: { display: true, host: true, buzzer: false }, busy: false, typingPending: false, devicesBlocked: false });
      }, { language: LANGUAGE, prompts: COPY[LANGUAGE].questions.slice(1, 6), answers: COPY[LANGUAGE].finalAnswers, teamNames: TEAM_NAMES[LANGUAGE] });
      await expect(page.locator(".c2-entryrows .c2-entryrow")).toHaveCount(5, { timeout: 15_000 });
      await expect(page.locator(".c2-entryrows .c2-entryrow").first()).toContainText(COPY[LANGUAGE].questions[1]);
    });
    if (finaleError) captureErrors.push(finaleError);

    for (const device of ["host", "display"]) {
      try {
        const fixture = await prepareDevicePreviewFixture(browser, LANGUAGE, device);
        gameplayPreviewContexts.push(fixture.context);
        const previewError = await take(fixture.page, testInfo, `gameplay-${device}`, async () => {
          if (device === "display") await expect(fixture.frame.locator("#gameScreen")).toBeVisible({ timeout: 30_000 });
          else await expect(fixture.frame.locator("#paperText1")).toContainText(COPY[LANGUAGE].gameplay[0], { timeout: 30_000 });
        });
        if (previewError) captureErrors.push(previewError);
      } catch (error) {
        console.error(`[manual-screenshot] failed ${LANGUAGE}/gameplay-${device}: ${error.message}`);
        captureErrors.push(error);
      }
    }

    mobileContext = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
    if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(mobileContext, { pages: ["polls/vote/points"] });
    await mobileContext.addInitScript(lang => localStorage.setItem("uiLang", lang), LANGUAGE);
    const mobilePage = await mobileContext.newPage();
    mobilePage.setDefaultTimeout(15_000);

    // The resource lists below use the application's own renderers with local
    // example data; no test contacts or task records are written to production.
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
      const drawId = await Logo.insertLogo(page, {
        name: logoNames[1], type: "PIX_150x70",
        payload: { ...Logo.emptyPix, source: { mode: "DRAW", fabricData: { version: "5.3.0", objects: [], background: "#000000" }, world: { w: 1040, h: 440 } } }
      });
      await page.goto(`https://www.familiada.online/logo/editor/draw/?id=${drawId}&ret=${encodeURIComponent(`/logo/?tab=draw&lang=${LANGUAGE}`)}`, { waitUntil: "domcontentloaded" });
      await Logo.waitEditorReady(page, "Draw");
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
      await page.waitForURL(url => url.pathname.includes("/bases/explorer") && url.searchParams.get("id") === screenshotBaseId, { timeout: 30_000 });
      await expect(page.locator(".explorer")).toBeVisible({ timeout: 30_000 });
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
    });
    if (settingsFinalError) captureErrors.push(settingsFinalError);

    const settingsRoundsError = await take(page, testInfo, "game-settings-rounds", async () => {
      await page.locator('.gs-sidebar-item[data-cat="questions"]').click();
      await page.locator('.toggle-item:has(input[name="gsRoundsMode"][value="pick"])').click();
      await page.locator('.gs-sidebar-item[data-cat="rounds"]').click();
      await expect(page.locator("#gsRoundsOrderList .roundsOrderItem").first()).toContainText(COPY[LANGUAGE].gameplay[0], { timeout: 20_000 });
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

    const friendsShotError = await take(page, testInfo, "friends", async () => {
      await page.goto(`https://www.familiada.online/friends/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#contactsHost")).toHaveClass(/skel-step-ready/, { timeout: 30_000 });
      await page.locator("#contactsTabReceived").dispatchEvent("click");
      await expect(page.locator("#contactsReceived")).toBeVisible();
      await renderVisualFixture(page, "contacts", COPY[LANGUAGE]);
      await expect(page.locator("#contactsReceived .shareRow")).toHaveCount(1);
    });
    if (friendsShotError) captureErrors.push(friendsShotError);
    const subscribersShotError = await take(page, testInfo, "subscribers", async () => {
      await page.goto(`https://www.familiada.online/subscribers/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#contactsHost")).toHaveClass(/skel-step-ready/, { timeout: 30_000 });
      await page.locator("#contactsTabReceived").dispatchEvent("click");
      await expect(page.locator("#contactsReceived")).toBeVisible();
      await renderVisualFixture(page, "contacts", COPY[LANGUAGE]);
      for (const email of COPY[LANGUAGE].subscriberEmails) await expect(page.locator("#contactsReceived")).toContainText(email);
    });
    if (subscribersShotError) captureErrors.push(subscribersShotError);

    const pollShotError = await take(page, testInfo, "poll-sharing", async () => {
      await page.goto(`https://www.familiada.online/polls/?id=${games[1].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(games[1].name, { timeout: 30_000 });
      await expect(page.locator("#btnAddRecipients")).toBeVisible({ timeout: 15_000 });
      await renderVisualFixture(page, "poll-share", COPY[LANGUAGE]);
      for (const email of COPY[LANGUAGE].subscriberEmails) await expect(page.locator("#subsGrid")).toContainText(email);
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
      await renderVisualFixture(page, "poll-share", COPY[LANGUAGE]);
      for (const email of COPY[LANGUAGE].subscriberEmails) await expect(page.locator("#subsGrid")).toContainText(email);
    });
    if (textPollShotError) captureErrors.push(textPollShotError);

    const tasksPendingError = await take(page, testInfo, "tasks-pending", async () => {
      await page.goto(`https://www.familiada.online/tasks/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#tasksHost")).toHaveClass(/skel-step-ready/, { timeout: 30_000 });
      await renderVisualFixture(page, "tasks", COPY[LANGUAGE]);
      await expect(page.locator("#tasksHost .rowsRow")).toHaveCount(2);
    });
    if (tasksPendingError) captureErrors.push(tasksPendingError);

    const mobileVoteError = await take(mobilePage, testInfo, "anonymous-voting-mobile", async () => {
      await mobilePage.goto(`https://www.familiada.online/polls/vote/points/?id=${games[1].id}&key=${games[1].share_key_poll}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(mobilePage.locator("#qtext")).toContainText(COPY[LANGUAGE].gameplay[0], { timeout: 30_000 });
      await expect(mobilePage.locator("#alist button").first()).toBeVisible({ timeout: 15_000 });
    });
    if (mobileVoteError) captureErrors.push(mobileVoteError);

    const tasksDoneError = await take(page, testInfo, "tasks-done", async () => {
      await page.goto(`https://www.familiada.online/tasks/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#tasksHost")).toHaveClass(/skel-step-ready/, { timeout: 30_000 });
      await renderVisualFixture(page, "tasks-done", COPY[LANGUAGE]);
      await expect(page.locator(".rowsSection--done .rowsRow")).toHaveCount(2);
    });
    if (tasksDoneError) captureErrors.push(tasksDoneError);

    const resultsError = await take(page, testInfo, "poll-votes", async () => {
      await page.goto(`https://www.familiada.online/polls/?id=${games[1].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#tabResults")).toBeVisible({ timeout: 30_000 });
      await page.locator("#tabResults").click();
      await renderVisualFixture(page, "results", COPY[LANGUAGE]);
      await expect(page.locator("#resultsList")).toContainText(COPY[LANGUAGE].pollAnswers[0]);
      await expect(page.locator("#resultsList .aVal").first()).toHaveText("65");
    });
    if (resultsError) captureErrors.push(resultsError);
    const textResultsError = await take(page, testInfo, "poll-text-votes", async () => {
      await page.goto(`https://www.familiada.online/polls/?id=${games[2].id}&lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#tabResults")).toBeVisible({ timeout: 30_000 });
      await page.locator("#tabResults").click();
      await renderVisualFixture(page, "text-results", COPY[LANGUAGE]);
      await expect(page.locator("#resultsList")).toContainText(COPY[LANGUAGE].voteText.toLocaleLowerCase());
    });
    if (textResultsError) captureErrors.push(textResultsError);

    if (LANGUAGE === "pl") {
      try {
        const fixture = await prepareDevicePreviewFixture(browser, LANGUAGE, "display");
        displayFixtureContext = fixture.context;
        const mainDisplayError = await take(fixture.page, testInfo, "main-display", async () => {
          await expect(fixture.frame.locator("#gameScreen")).toBeVisible();
          await fixture.frame.waitForFunction(() => window.__manualDisplayDone === true, null, { timeout: 30_000 });
        });
        if (mainDisplayError) captureErrors.push(mainDisplayError);
      } catch (error) {
        console.error(`[manual-screenshot] failed pl/main-display: ${error.message}`);
        captureErrors.push(error);
      }
    }
  } finally {
    for (const previewContext of gameplayPreviewContexts) await previewContext.close().catch(() => {});
    await page.goto(`https://www.familiada.online/games/?lang=${LANGUAGE}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 10_000 }).catch(() => {});
    // The prepared game persists; the next run replaces its two poll fixtures
    // to keep task sharing repeatable under the app's resend limits.
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
    // on later runs; the two poll fixtures are replaced at the next run.
    await restoreScreenshotName(page, ownerOriginalName).catch(error => console.error("[manual-screenshot] owner name restore failed:", error.message));
    await mobileContext?.close();
    await displayFixtureContext?.close();
  }

  if (captureErrors.length) throw new Error(`${captureErrors.length} screenshot scene(s) failed; successful captures remain available as artifacts.`);
});
