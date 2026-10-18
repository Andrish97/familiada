// Screenshots use the deployed main pages and styles with local visual data.
// No account, login, or database writes are needed for these manual examples.
const { test, expect } = require("@playwright/test");

test.use({ serviceWorkers: "block" });
test.use({ viewport: { width: 1365, height: 768 } });
test.describe.configure({ retries: 0 });

const LANGUAGE = process.env.SCREENSHOT_LANG || "pl";
const COPY = {
  pl: {
    games: ["Wieczór z Familiadą", "Pytania dla znajomych", "Szybka ankieta"], owner: "Marta_Nowak", friend: "Alex_Morgan",
    emails: ["anna.nowak@example.com", "piotr.zielinski@example.com", "kasia.maj@example.com"],
    question: "Podaj coś, co można zjeść na szybko", answers: ["kanapka", "pizza", "hot-dog", "zupa", "jogurt", "baton"],
    prompt: "Co zabierasz na weekendowy wyjazd?", options: ["Zdecydowanie tak", "Raczej tak", "Raczej nie", "Jeszcze nie wiem"],
    vote: "Świetny pomysł", teams: ["Króliczki", "Zajączki"], final: ["Ubrania", "Herbata", "Spacer", "Mapa", "Wanilia"],
    words: ["TWÓRZ", "ŁĄCZ", "GŁOSUJ", "BAW SIĘ", "GRAJ"]
  },
  en: {
    games: ["Family Game Night", "Questions for Friends", "Quick Survey"], owner: "Jamie_Taylor", friend: "Alex_Morgan",
    emails: ["alex.morgan@example.com", "sam.taylor@example.com", "chris.parker@example.com"],
    question: "Name something you can eat on the go", answers: ["sandwich", "pizza", "hot dog", "soup", "yogurt", "candy bar"],
    prompt: "What do you pack for a weekend trip?", options: ["Definitely", "Probably", "Probably not", "Not sure yet"],
    vote: "Sounds like a great idea", teams: ["Bunnies", "Rabbits"], final: ["Clothes", "Tea", "A walk", "A map", "Vanilla"],
    words: ["CREATE", "CONNECT", "VOTE", "HAVE FUN", "PLAY"]
  },
  uk: {
    games: ["Вечір родинної гри", "Запитання для друзів", "Швидке опитування"], owner: "Olena_Koval", friend: "Jan_Kowalski",
    emails: ["oksana.koval@example.com", "andrii.shevchenko@example.com", "marta.bondar@example.com"],
    question: "Назвіть щось, що можна швидко з’їсти", answers: ["бутерброд", "піца", "хот-дог", "суп", "йогурт", "батончик"],
    prompt: "Що ви берете на вихідні?", options: ["Однозначно так", "Скоріше так", "Скоріше ні", "Ще не знаю"],
    vote: "Чудова ідея", teams: ["Зайчики", "Кролики"], final: ["Одяг", "Чай", "Прогулянка", "Мапа", "Ваніль"],
    words: ["СТВОРЮЙ", "ЄДНАЙ", "ГОЛОСУЙ", "ГРАЙ", "ГРАЙ"]
  }
};
const COPY_LANG = COPY[LANGUAGE];
const ROOT = "https://www.familiada.online";

async function installMainFixtureContext(context) {
  // The main page's early guest guard checks for a session key. This inert key
  // only keeps the static main HTML in place; app scripts and network APIs are
  // blocked below, so no user session is created or used.
  await context.addInitScript(() => {
    localStorage.setItem("sb-screenshot-auth-token", "visual-fixture");
  });
  await context.route("**/*", async route => {
    const request = route.request();
    if (request.resourceType() !== "script") return route.continue();
    const url = new URL(request.url());
    const path = url.pathname;
    if (/supabase-js|qrcode|security-warning|topbar-controller|contact-modal|\/control\/js\/app\.js|\/games\/js\/games\.js|\/games\/editor\/js\/editor\.js|\/games\/settings\/js\/game-settings\.js|\/logo\/js\/(list|editor-draw)\.js|\/bases\/(js\/bases|explorer\/js\/page)\.js|\/(friends|subscribers|tasks|polls)\/js\//.test(request.url())) {
      return route.abort();
    }
    // Allow shared visual renderers and Control's pure UI renderer, while
    // blocking all other page controllers that would call authenticated APIs.
    if (path.includes("/shared/translation/") || path.endsWith("/shared/js/core/icons.js") ||
        path.endsWith("/shared/js/core/share-sections.js") || path.endsWith("/shared/js/core/poll-results.js") ||
        path.includes("/shared/js/gameplay/") || path.includes("/control/js/") || path.endsWith("/shared/js/core/sfx.js")) {
      return route.continue();
    }
    return route.abort();
  });
}

test.beforeEach(async ({ context }) => installMainFixtureContext(context));

async function openMain(page, path, lang = LANGUAGE) {
  await page.goto(`${ROOT}${path}${path.includes("?") ? "&" : "?"}lang=${lang}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async lang => {
    const { initI18n } = await import("/shared/translation/translation.js?v=v2026-10-14T23162");
    await initI18n({ withSwitcher: false });
    const { hydrateIcons } = await import("/shared/js/core/icons.js?v=v2026-10-14T23162");
    hydrateIcons(document);
    document.documentElement.classList.remove("page-loading");
    document.body.classList.remove("skel-body");
    document.querySelectorAll("[data-skel-step]").forEach(el => el.classList.add("skel-step-ready"));
    const who = document.querySelector("#who, #whoStatic");
    if (who) who.textContent = lang === "pl" ? "Marta_Nowak" : lang === "en" ? "Jamie_Taylor" : "Olena_Koval";
  }, lang);
  await page.evaluate(() => document.fonts?.ready.then(() => true));
}

async function paint(page, scene, data = COPY_LANG) {
  await page.evaluate(async ({ scene, data }) => {
    const { icon, hydrateIcons } = await import("/shared/js/core/icons.js?v=v2026-10-14T23162");
    const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    const grid = document.getElementById("grid");
    const title = document.querySelector("main .title");
    if (scene === "games" || scene === "game-ready") {
      if (grid) grid.innerHTML = `<div class="addCard"><div class="plus">${icon("plus")}</div><div class="txt">Nowa gra</div></div>${data.games.map((name, i) => `<div class="card tile ${i === 0 ? "selected" : ""}"><div class="x">${icon("trash")}</div><div class="name">${esc(name)}</div><div class="meta">${i === 0 ? "Gra przygotowana" : i === 1 ? "Ankieta punktowa" : "Ankieta tekstowa"}</div><div class="rules"></div><div class="tileTags"><span class="tag ${scene === "game-ready" && i === 0 ? "tag--ok" : "tag--muted"}">${scene === "game-ready" && i === 0 ? "Gotowa do gry" : "Szkic"}</span></div></div>`).join("")}`;
      const action = document.getElementById("btnSettings"); if (action) action.disabled = false;
      if (title && scene === "game-ready") title.textContent = "Twoja gra jest gotowa";
    } else if (scene === "editor") {
      const name = document.getElementById("gameName"); if (name) name.value = data.games[0];
      const pageTitle = document.getElementById("pageTitle"); if (pageTitle) pageTitle.textContent = data.games[0];
      const prompt = document.getElementById("qText"); if (prompt) prompt.value = data.question;
      const qList = document.getElementById("qList"); if (qList) qList.innerHTML = [data.question, ...["Co zabierasz na wyjazd?", "Co pijesz rano?", "Co robisz w wolny dzień?" ]].map((text, i) => `<div class="qItem ${i === 0 ? "active" : ""}"><span>${i + 1}. ${esc(text)}</span></div>`).join("");
      const answers = document.getElementById("aList"); if (answers) answers.innerHTML = data.answers.map((text, i) => `<div class="qf-row"><span class="qf-n">${i + 1}</span><input class="inp qf-text" value="${esc(text)}"><input class="inp qf-points" value="${[39,24,16,9,7,5][i]}" aria-label="Punkty"><button class="btn icon-btn">${icon("trash")}</button></div>`).join("");
    } else if (scene.startsWith("settings")) {
      const inner = document.getElementById("gsContentInner");
      const categories = { "settings-finale": ["Pytania finału", "Wybierz 5 pytań", ...["Co zabierasz na wyjazd?", "Jaki napój wybierasz?", "Co pomaga odpocząć?", "Co masz w plecaku?", "Jaki smak lodów?" ]], "settings-rounds": ["Pytania rund", "Wybierz kolejność pytań", data.question], "settings-display": ["Wygląd wyświetlacza", "Logo", data.games[0]], "settings-sound": ["Dźwięk", "Źródło dźwięku", "Panel sterowania"] };
      const item = categories[scene] || categories["settings-finale"];
      document.querySelectorAll(".gs-sidebar-item").forEach(el => el.classList.toggle("active", el.dataset.cat === (scene === "settings-finale" ? "finale" : scene === "settings-rounds" ? "rounds" : scene.replace("settings-", ""))));
      if (inner) inner.innerHTML = `<section class="gs-step"><h2>${esc(item[0])}</h2><p>${esc(item[1])}</p><div class="gs-card">${item.slice(2).map((text, i) => `<label class="gs-row"><input type="checkbox" ${i < 5 ? "checked" : ""}><span>${esc(text)}</span></label>`).join("")}</div></section>`;
      const sub = document.getElementById("gsTitle"); if (sub) sub.textContent = data.games[0];
    } else if (scene === "logos") {
      if (grid) grid.innerHTML = `<div class="addCard"><div class="plus">${icon("plus")}</div><div class="txt">Utwórz logo</div></div>${["FAMILIADA", "Zespół rodzinny", "Logo na finał"].map((name, i) => `<div class="logoTile ${i === 0 ? "is-selected" : ""}"><div class="logoTileTop"><div><div class="logoName">${esc(name)}</div><div class="logoMeta">${i ? "Edytowano niedawno" : "Logo tekstowe"}</div></div><div class="logoActions"><div class="logoX">${icon("trash")}</div></div></div><div class="logoPrev"><svg viewBox="0 0 300 80" role="img"><text x="150" y="48" text-anchor="middle" fill="#f5c451" font-size="28" font-weight="700">${esc(name)}</text></svg></div></div>`).join("")}`;
    } else if (scene === "logo-draw") {
      const shell = document.getElementById("editorShell"); if (shell) shell.dataset.mode = "DRAW";
      const name = document.querySelector("#logoName, #nameInput, input[name=name]"); if (name) name.value = "Logo na finał";
      const canvas = document.querySelector("canvas"); if (canvas) { const c = canvas.getContext("2d"); c.fillStyle = "#111827"; c.fillRect(0,0,canvas.width,canvas.height); c.fillStyle = "#f5c451"; c.font = "bold 44px sans-serif"; c.textAlign = "center"; c.fillText("FAMILIADA", canvas.width/2, canvas.height/2); }
    } else if (scene === "bases") {
      if (grid) grid.innerHTML = `<div class="addCard"><div class="plus">${icon("plus")}</div><div class="txt">Nowa baza</div></div>${["Pytania na rodzinny wieczór", "Wakacyjne skojarzenia", "Pytania dla znajomych"].map((name, i) => `<div class="card tile ${i === 0 ? "selected" : ""}" data-base-id="visual-${i}"><div class="name">${esc(name)}</div><div class="meta">${i === 0 ? "12 pytań · 3 kategorie" : "8 pytań · 2 kategorie"}</div><div class="tileTags"><span class="tag ${i ? "tag--muted" : "tag--ok"}">${i ? "Moja baza" : "Właściciel"}</span></div></div>`).join("")}`;
    } else if (scene === "explorer") {
      const baseName = document.getElementById("baseName"); if (baseName) baseName.textContent = "Pytania na rodzinny wieczór";
      const left = document.getElementById("explorerLeft"); if (left) left.innerHTML = `<div class="explorer-tree"><button class="btn selected">Wszystkie pytania <span>12</span></button><button class="btn">Na rozgrzewkę <span>4</span></button><button class="btn">Codzienne wybory <span>5</span></button><button class="btn">Czas wolny <span>3</span></button></div>`;
      const q = document.querySelector("#qText"); if (q) q.value = "Co zabierasz na weekendowy wyjazd?";
      const answers = document.querySelector("#aList"); if (answers) answers.innerHTML = ["Ubrania", "Jedzenie", "Telefon", "Kosmetyki"].map((v,i)=>`<div class="qf-row"><span class="qf-n">${i+1}</span><input class="inp qf-text" value="${v}"><input class="inp qf-points" value="${[40,30,20,10][i]}"></div>`).join("");
      const exp = document.querySelector(".explorer"); if (exp) exp.classList.add("skel-step-ready");
    } else if (scene === "poll-share" || scene === "poll-results" || scene === "poll-text-results") {
      const card = document.getElementById("cardMain"); if (card) card.style.display = "";
      const empty = document.getElementById("cardEmpty"); if (empty) empty.style.display = "none";
      const state = document.getElementById("pollBar"); if (state) state.style.display = "";
      const share = document.getElementById("secShare"); if (share) share.hidden = scene !== "poll-share";
      const results = document.getElementById("secResults"); if (results) results.hidden = scene === "poll-share";
      const resultsTab = document.getElementById("tabResults"); if (resultsTab) resultsTab.classList.toggle("active", scene !== "poll-share");
      const shareTab = document.getElementById("tabShare"); if (shareTab) shareTab.classList.toggle("active", scene === "poll-share");
      const qr = document.getElementById("qr"); if (qr) qr.style.visibility = "hidden";
      if (scene === "poll-share") return;
    } else if (scene === "vote") {
      const box = document.getElementById("qbox"); if (box) box.style.display = "";
      const prompt = document.getElementById("qtext"); if (prompt) prompt.textContent = data.question;
      const list = document.getElementById("alist"); if (list) list.innerHTML = data.options.map(text => `<button class="btn voteOption">${esc(text)}</button>`).join("");
    }
    hydrateIcons(document);
  }, { scene, data });
  if (["friends", "subscribers", "tasks", "tasks-done", "poll-share"].includes(scene)) {
    const kind = scene === "friends" || scene === "subscribers" ? "contacts" : scene;
    await renderVisualFixture(page, kind, data);
  }
  if (scene === "poll-results" || scene === "poll-text-results") {
    await renderVisualFixture(page, scene === "poll-results" ? "results" : "text-results", data);
  }
}

// The list fixtures use the same render helpers shipped by the deployed main.
async function renderVisualFixture(page, kind, copy) {
  await page.evaluate(async ({ kind, copy }) => {
    const lang = new URLSearchParams(location.search).get("lang") || "pl";
    const { t } = await import("/shared/translation/translation.js?v=v2026-10-14T23162");
    if (kind === "contacts") {
      const { shareSectionEl } = await import("/shared/js/core/share-sections.js?v=v2026-10-14T23162");
      const friends = location.pathname.includes("/friends/");
      const people = friends ? [{ label: copy.friend, note: "alex.morgan@example.com" }] : copy.emails.map(email => ({ label: email, note: t("contacts.accountCreated") }));
      const rows = people.map((person, index) => ({ id: `visual-${index}`, label: person.label, compact: true, note: person.note, actions: [{ key: "remove", icon: "trash", title: t("contacts.actions.remove"), onClick: () => {} }] }));
      document.getElementById("contactsReceived").replaceChildren(shareSectionEl({ key: "active", title: t(`contacts.sections.${friends ? "friend" : "active"}`), rows }));
    } else if (kind === "tasks" || kind === "tasks-done") {
      const { renderRowSections } = await import("/shared/js/core/share-sections.js?v=v2026-10-14T23162");
      const rows = copy.games.slice(1).map((title, index) => ({ id: `visual-task-${index}`, avatarIcon: "polls", title, note: `${t("tasks.from", { owner: copy.friend })} · ${t(kind === "tasks" ? "tasks.received" : "tasks.doneAt", { date: new Date().toLocaleDateString(lang) })}`, noteMobile: t("tasks.from", { owner: copy.friend }), actions: kind === "tasks" ? [{ key: "vote", text: t("tasks.actions.vote"), icon: "polls", gold: true, onClick: () => {} }] : [] }));
      renderRowSections(document.getElementById("tasksHost"), [{ key: kind === "tasks" ? "todo" : "done", title: t(`tasks.sections.${kind === "tasks" ? "todo" : "done"}`), rows }]);
    } else if (kind === "poll-share") {
      const { shareSectionEl } = await import("/shared/js/core/share-sections.js?v=v2026-10-14T23162");
      const rows = copy.emails.map((email, index) => ({ id: `recipient-${index}`, label: email, compact: true, tags: [{ text: t("shareSections.channel.subscriber"), cls: "tag--muted" }], note: t(index ? "polls.share.state.waiting" : "polls.share.state.done"), actions: [{ key: "remove", icon: "trash", title: t("polls.share.remove"), onClick: () => {} }] }));
      document.getElementById("subsGrid").replaceChildren(shareSectionEl({ key: "poll-shared", title: t("polls.share.recipientsTitle"), rows }));
      const summary = document.getElementById("subsSummary"); if (summary) summary.textContent = lang === "en" ? "3 invited · 1 responded" : lang === "uk" ? "Запрошено: 3 · відповіли: 1" : "Zaproszono: 3 · odpowiedziała 1 osoba";
    } else if (kind === "results" || kind === "text-results") {
      const { createPollResults } = await import("/shared/js/core/poll-results.js?v=v2026-10-14T23162");
      const renderer = createPollResults(document.getElementById("resultsList"));
      if (kind === "results") renderer.render({ status: "poll_open", type: "poll_points", questions: [{ id: "visual-q", ord: 1, text: copy.question, answers: copy.options.map((text, i) => ({ id: `visual-a${i}`, text, votes: [65, 35, 20, 5][i] })) }] });
      else renderer.render({ status: "poll_open", type: "poll_text", questions: [{ id: "visual-text", ord: 1, text: copy.prompt, text_rows: [{ text: copy.vote, val: 18 }, { text: copy.options[1], val: 7 }] }] });
    }
  }, { kind, copy });
}

async function take(page, testInfo, name, ready) {
  try {
    await ready();
    await page.screenshot({ path: testInfo.outputPath(`shot-${LANGUAGE}-${name}.png`), fullPage: false, animations: "disabled" });
    console.log(`[manual-screenshot] captured ${LANGUAGE}/${name}`);
  } catch (error) {
    console.error(`[manual-screenshot] failed ${LANGUAGE}/${name}: ${error.message}`);
    return error;
  }
}

async function prepareDevicePreviewFixture(browser, language, device, special = false) {
  const viewport = device === "display" ? { width: 1600, height: 900 } : { width: 1365, height: 768 };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(ROOT, { waitUntil: "domcontentloaded" });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe id="devicePreview" title="${device}" src="/control/${device}/?preview=1&lang=${language}"></iframe><script>window.previewReady=false;addEventListener('message',event=>{if(event.source===document.getElementById('devicePreview').contentWindow&&['familiada:preview-ready','familiada:host-preview-ready'].includes(event.data?.type))window.previewReady=true})<\/script></body></html>`);
    await page.waitForFunction(() => window.previewReady === true, null, { timeout: 30_000 });
    const frame = page.frames().find(item => item.url().includes(`/control/${device}/`) && item.url().includes("preview=1"));
    if (!frame) throw new Error(`Could not load ${device} preview frame on main`);
    await frame.evaluate(() => {
      window.__manualDisplayDone = false;
      window.addEventListener("familiada:preview-rendered", () => { window.__manualDisplayDone = true; }, { once: true });
    });
    const data = COPY[language];
    const row = {
      rev: 1, step: "r_play", phase: "PLAY", top_card: "rounds", control_team: null,
      detail: {
        display: { mode: "GAME", suppressLogoDraw: true },
        teams: { teamA: special ? "FAMILIADA" : data.teams[0], teamB: special ? "ONLINE" : data.teams[1], defaultA: false, defaultB: false },
        settings: { uiLang: language },
        rounds: {
          roundNo: 1, question: { text: special ? "TWÓRZ · ŁĄCZ · GRAJ" : data.question },
          bankPts: special ? 999 : 38, totals: { A: special ? 111 : 62, B: special ? 111 : 47 },
          revealed: special ? [1, 3] : [1, 3], xA: special ? 1 : 1, xB: special ? 1 : 0,
          answers: (special ? data.words : data.answers.slice(0, 5)).map((text, i) => ({ ord: i + 1, text, fixed_points: [39, 0, 16, 0, 7][i] }))
        }, host: { covered: false }
      }
    };
    await page.evaluate(row => document.getElementById("devicePreview").contentWindow.postMessage({ type: "familiada:preview-row", row }, location.origin), row);
    if (device === "display") await frame.waitForFunction(() => window.__manualDisplayDone === true, null, { timeout: 30_000 });
    else await expect(frame.locator("#paperText1")).toContainText(data.question, { timeout: 30_000 });
    return { context, page, frame };
  } catch (error) { await context.close(); throw error; }
}

test(`manual screenshots from main with local fixtures (${LANGUAGE})`, async ({ page, context, browser }, testInfo) => {
  test.setTimeout(300_000);
  const data = COPY_LANG;
  const errors = [];
  const capture = async (name, path, scene, target = page) => {
    const error = await take(target, testInfo, name, async () => {
      await openMain(target, path, LANGUAGE);
      await paint(target, scene, data);
    });
    if (error) errors.push(error);
  };

  await capture("games", "/games/", "games");
  await capture("game-editor", "/games/editor/", "editor");
  await capture("game-ready", "/games/", "game-ready");
  await capture("game-settings-finale", "/games/settings/", "settings-finale");
  await capture("game-settings-rounds", "/games/settings/", "settings-rounds");
  await capture("game-settings-display", "/games/settings/", "settings-display");
  await capture("game-settings-sound", "/games/settings/", "settings-sound");
  await capture("logos", "/logo/", "logos");
  await capture("logo-draw-editor", "/logo/editor/draw/", "logo-draw");
  await capture("bases", "/bases/", "bases");
  await capture("base-explorer", "/bases/explorer/", "explorer");
  await capture("friends", "/friends/", "friends");
  await capture("subscribers", "/subscribers/", "subscribers");
  await capture("poll-sharing", "/polls/", "poll-share");
  await capture("tasks-pending", "/tasks/", "tasks");
  await capture("tasks-done", "/tasks/", "tasks-done");
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installMainFixtureContext(mobileContext);
  const mobile = await mobileContext.newPage();
  await capture("anonymous-voting-mobile", "/polls/vote/points/", "vote", mobile);
  await capture("poll-votes", "/polls/", "poll-results");
  await capture("poll-text-votes", "/polls/", "poll-text-results");

  const gameplay = async (name, finale = false) => take(page, testInfo, name, async () => {
    await openMain(page, "/control/", LANGUAGE);
    await page.evaluate(async ({ language, data, finale }) => {
      const { createUI } = await import("/control/js/ui.js?v=v2026-10-14T23162");
      const { makeDefaultState } = await import("/shared/js/gameplay/gameStateShape.js?v=v2026-10-14T23162");
      const state = makeDefaultState("manual-visual-fixture");
      state.step = finale ? "f_p1_entry" : "r_play";
      state.topCard = finale ? "final" : "rounds";
      state.phase = finale ? "FINAL" : "PLAY";
      state.controlTeam = "A";
      state.locks = { gameStarted: true, finalActive: finale, gameEnded: false };
      state.teams = { teamA: data.teams[0], teamB: data.teams[1] };
      state.settings.uiLang = language;
      state.settings.hasFinal = true;
      state.rounds.roundNo = 1;
      state.rounds.question = { id: "visual-round", text: data.question };
      state.rounds.answers = data.answers.map((text, i) => ({ id: `a${i}`, ord: i + 1, text, fixed_points: [39,24,16,9,7,5][i] }));
      state.rounds.revealed = [1, 3]; state.rounds.bankPts = 38; state.rounds.totals = { A: 62, B: 47 }; state.rounds.xA = 1; state.rounds.xB = 0;
      state.final.questions = data.final.map((text, i) => ({ id: `f${i}`, text, answers: [] }));
      state.final.runtime.timer = { running: false, phase: null, endsAt: 0, usedP1: true, usedP2: false };
      state.final.runtime.p1 = data.final.map(text => ({ text }));
      const ui = createUI({ root: document.querySelector("#app"), emit: () => {} });
      ui.render(state, { presenceFlags: { display: true, host: true, buzzer: false }, busy: false, typingPending: false, devicesBlocked: false });
    }, { language: LANGUAGE, data, finale });
    await expect(page.locator(finale ? ".c2-entryrows .c2-entryrow" : ".c2-stepper-question")).toBeVisible();
  });
  const roundError = await gameplay("gameplay-control"); if (roundError) errors.push(roundError);
  const finaleError = await gameplay("gameplay-finale", true); if (finaleError) errors.push(finaleError);

  for (const device of ["host", "display"]) {
    try {
      const fixture = await prepareDevicePreviewFixture(browser, LANGUAGE, device);
      const error = await take(fixture.page, testInfo, `gameplay-${device}`, async () => {
        if (device === "display") await expect(fixture.frame.locator("#gameScreen")).toBeVisible();
        else await expect(fixture.frame.locator("#paperText1")).toContainText(data.question);
      });
      if (error) errors.push(error);
      await fixture.context.close();
    } catch (error) { errors.push(error); }
  }
  if (LANGUAGE === "pl") {
    try {
      const fixture = await prepareDevicePreviewFixture(browser, LANGUAGE, "display", true);
      await take(fixture.page, testInfo, "main-display", async () => expect(fixture.frame.locator("#gameScreen")).toBeVisible());
      await fixture.context.close();
    } catch (error) { errors.push(error); }
  }
  await mobileContext.close();
  if (errors.length) throw new Error(`${errors.length} screenshot scene(s) failed; successful captures remain available as artifacts.`);
});
