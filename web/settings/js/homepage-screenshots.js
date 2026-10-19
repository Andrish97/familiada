const API = "/_admin_api";
const els = {};
let config = null;
let initialized = false;
let dirty = false;
let sharedDirty = false;
let sharedEditorLanguage = "pl";
let lastFrameKey = "";
let deviceReadyPromise = null;
let deviceReadyResolve = null;
let editorSceneId = "";
let editorLanguage = "pl";
let saveTimer = 0;
let previewTimer = 0;
let languageSelectUI = null;
let sceneSelectUI = null;
let initUiSelectFn = null;
let resourceChoiceSelectUIs = [];
let previewResizeObserver = null;
const FIELD_LABELS = {
  game: "Nazwa gry", games: "Gry na liście", question: "Pytanie", answers: "Odpowiedzi i wyniki",
  points: "Punkty odpowiedzi", bases: "Bazy na liście", base: "Nazwa bazy", folders: "Foldery bazy",
  questions: "Wpisy bazy", people: "Znajomi lub subskrybenci", tasks: "Zadania", poll: "Nazwa ankiety",
  question: "Pytanie ankiety", subscribers: "Zaproszeni subskrybenci", link: "Link do ankiety",
  teams: "Nazwy drużyn", revealed: "Odsłonięte odpowiedzi (numery)",
  scores: "Wyniki drużyn", crosses: "Iksy drużyn", bank: "Punkty na planszy", finale: "Pytania finału",
  logos: "Logo na liście", logo: "Nazwa logo", words: "Hasła na planszy",
};

function extraGameQuestions(language) {
  return language === "en" ? [
    ["What do you pack for a weekend trip?", ["Clothes", "Snacks", "A book", "Charger", "Camera"], [34, 25, 18, 13, 10]],
    ["What do you drink in the morning?", ["Coffee", "Tea", "Water", "Juice"], [42, 28, 18, 12]],
    ["What do you do on a day off?", ["Sleep in", "Go for a walk", "Watch a film", "Meet friends"], [35, 25, 22, 18]],
    ["Which ice cream flavor do you choose?", ["Vanilla", "Chocolate", "Strawberry", "Pistachio"], [34, 28, 22, 16]],
    ["What helps you relax?", ["Music", "A walk", "A book", "A bath"], [36, 27, 21, 16]],
    ["What do you take to the park?", ["A ball", "Water", "A blanket", "A book"], [34, 27, 22, 17]],
    ["Which fruit do you like?", ["Apples", "Bananas", "Strawberries", "Grapes"], [32, 28, 22, 18]],
    ["What do you do on weekends?", ["Meet friends", "Relax"], [45, 35]],
    ["What drink do you serve guests?", ["Tea", "Coffee", "Juice"], [80, 40, 10]],
  ] : language === "uk" ? [
    ["Що береш у поїздку на вихідні?", ["Одяг", "Перекус", "Книжку", "Зарядку", "Камеру"], [34, 25, 18, 13, 10]],
    ["Що п’єш уранці?", ["Каву", "Чай", "Воду", "Сік"], [42, 28, 18, 12]],
    ["Що робиш у вихідний?", ["Висплюся", "Гуляю", "Дивлюся фільм", "Зустрічаю друзів"], [35, 25, 22, 18]],
    ["Який смак морозива обираєш?", ["Ваніль", "Шоколад", "Полуниця", "Фісташка"], [34, 28, 22, 16]],
    ["Що допомагає відпочити?", ["Музика", "Прогулянка", "Книжка", "Ванна"], [36, 27, 21, 16]],
    ["Що береш до парку?", ["М’яч", "Воду", "Плед", "Книжку"], [34, 27, 22, 17]],
    ["Який фрукт тобі до смаку?", ["Яблука", "Банани", "Полуниця", "Виноград"], [32, 28, 22, 18]],
    ["Що робиш у вихідні?", ["Зустрічаю друзів", "Відпочиваю"], [45, 35]],
    ["Що подаєш гостям?", ["Чай", "Каву", "Сік"], [80, 40, 10]],
  ] : [
    ["Co zabierasz na weekendowy wyjazd?", ["Ubrania", "Przekąski", "Książkę", "Ładowarkę", "Aparat"], [34, 25, 18, 13, 10]],
    ["Co pijesz rano?", ["Kawę", "Herbatę", "Wodę", "Sok"], [42, 28, 18, 12]],
    ["Co robisz w wolny dzień?", ["Dłużej śpię", "Spaceruję", "Oglądam film", "Spotykam znajomych"], [35, 25, 22, 18]],
    ["Jaki smak lodów wybierasz?", ["Waniliowy", "Czekoladowy", "Truskawkowy", "Pistacjowy"], [34, 28, 22, 16]],
    ["Co pomaga odpocząć?", ["Muzyka", "Spacer", "Książka", "Kąpiel"], [36, 27, 21, 16]],
    ["Co zabierasz do parku?", ["Piłkę", "Wodę", "Koc", "Książkę"], [34, 27, 22, 17]],
    ["Jaki owoc lubisz?", ["Jabłka", "Banany", "Truskawki", "Winogrona"], [32, 28, 22, 18]],
    ["Co robisz w weekend?", ["Spotykam znajomych", "Odpoczywam"], [45, 35]],
    ["Jaki napój podajesz gościom?", ["Herbatę", "Kawę", "Sok"], [80, 40, 10]],
  ];
}

function extraPollQuestions(language) {
  const data = language === "en" ? [
    ["What would you like to do during the trip?", [["Go for a walk", 7], ["See the sights", 5], ["Relax", 4], ["Meet friends", 2]]],
    ["What makes a weekend trip special?", [["A change of scenery", 8], ["Time together", 6], ["Good food", 4]]],
  ] : language === "uk" ? [
    ["Що хочеш робити під час поїздки?", [["Гуляти", 7], ["Оглядати місто", 5], ["Відпочивати", 4], ["Зустрічатися з друзями", 2]]],
    ["Що робить поїздку на вихідні особливою?", [["Зміна обстановки", 8], ["Час разом", 6], ["Смачна їжа", 4]]],
  ] : [
    ["Co chcesz robić podczas wyjazdu?", [["Spacerować", 7], ["Zwiedzać", 5], ["Odpoczywać", 4], ["Spotkać się ze znajomymi", 2]]],
    ["Co sprawia, że weekendowy wyjazd jest udany?", [["Zmiana otoczenia", 8], ["Wspólny czas", 6], ["Dobre jedzenie", 4]]],
  ];
  return data.map(([text, answers]) => ({ text, answers: answers.map(([answer, votes]) => ({ text: answer, votes })) }));
}

function byId(id) { return document.getElementById(id); }
function currentLanguage() { return byId("homepageShotLanguage").value; }
function currentScene() { return config.scenes.find(scene => scene.id === byId("homepageShotScene").value) || config.scenes[0]; }
function langFixture(scene, language = currentLanguage()) {
  const override = config.localeFixtures?.[language]?.[scene.id];
  const fixture = structuredClone(override || localizeFixture(scene.fixture || {}, language));
  const shared = config.sharedFixtures?.[language];
  if (!shared) return fixture;
  const firstQuestion = shared.gameQuestions?.[0];
  if (scene.id === "game-editor") fixture.gameQuestions = structuredClone(shared.gameQuestions || []);
  if (["game-editor", "appearance", "sound", "control-round", "host-round", "display-round", "control-finale"].includes(scene.id)) {
    fixture.game = shared.gameName || fixture.game;
  }
  if (scene.id === "control-finale" && shared.gameQuestions?.length) {
    const selected = fixture.finale || [];
    fixture.finale = selected.map((text, index) =>
      shared.gameQuestions.find(question => question.text === text)?.text
      || shared.gameQuestions[index % shared.gameQuestions.length].text
      || text
    );
  }
  if (scene.id === "games") fixture.games = [shared.gameName, ...(shared.otherGames || fixture.games?.slice(1) || [])];
  if (scene.id === "tasks") fixture.tasks = (fixture.tasks || []).map((task, index) => ({ ...task, game: shared.otherGames?.[index % Math.max(1, shared.otherGames.length)] || shared.gameName }));
  if (["game-editor", "control-round", "host-round", "display-round"].includes(scene.id) && firstQuestion) {
    fixture.question = firstQuestion.text;
    fixture.answers = firstQuestion.answers.map(answer => answer.text);
    fixture.points = firstQuestion.answers.map(answer => answer.points);
  }
  if (["control-round", "host-round", "display-round"].includes(scene.id)) fixture.teams = shared.teams || fixture.teams;
  if (scene.id === "subscribers") fixture.people = (shared.subscribers || []).map(name => ({ name, state: "active" }));
  if (["poll-share", "poll-vote-mobile", "poll-results"].includes(scene.id)) {
    fixture.poll = shared.pollName || fixture.poll;
    const pollQuestions = shared.pollQuestions || [{ text: shared.pollQuestion || fixture.question, answers: (shared.pollResults || []).map(answer => ({ text: answer.text, votes: answer.votes })) }];
    fixture.question = pollQuestions[0]?.text || fixture.question;
    if (scene.id === "poll-vote-mobile") fixture.answers = pollQuestions[0]?.answers.map(answer => answer.text) || fixture.answers;
    if (scene.id === "poll-results") fixture.pollQuestions = pollQuestions;
    if (scene.id === "poll-share") {
      const names = subscriberNames(language);
      const recipients = (config.localeFixtures?.[language]?.["poll-share-actions"] || names.map((_, index) => ({ subscriberIndex: index, responded: index === 0 })))
        .filter(recipient => Number.isInteger(recipient.subscriberIndex) && recipient.subscriberIndex >= 0 && recipient.subscriberIndex < names.length);
      fixture.pollRecipients = structuredClone(recipients);
      fixture.subscribers = recipients.map(recipient => names[recipient.subscriberIndex]).filter(Boolean);
      fixture.subscriberStates = recipients.map(recipient => !!recipient.responded);
    }
  }
  if (scene.id === "friends" && !fixture.friendGroups) fixture.friendGroups = defaultFriendGroups(language);
  if (scene.id === "subscribers") {
    fixture.outgoing ||= defaultSubscriberInvitations(language);
  }

  const selection = config.viewResources?.[language]?.[scene.id] || {};
  let resource = selectedResource(scene.id, language, "game");
  if (["poll-share", "poll-vote-mobile", "poll-results"].includes(scene.id) && !canOpenPollResource(resource)) resource = null;
  if (scene.id === "game-editor") fixture.activeQuestionIndex = Number(selection.questionIndex) || 0;
  if (scene.id === "games") {
    const loadedPrepared = ensureResourceData(language).filter(item => item.type === "game" && gameResourceType(item) === "prepared");
    config.viewResources ||= {};
    config.viewResources[language] ||= {};
    const selection = config.viewResources[language][scene.id] ||= {};
    const availableIds = new Set(loadedPrepared.map(item => item.id));
    const savedOrder = Array.isArray(selection.resourceOrder) ? selection.resourceOrder : (selection.resourceOrder = loadedPrepared.map(item => item.id));
    selection.resourceOrder = [...savedOrder.filter(id => availableIds.has(id)), ...loadedPrepared.map(item => item.id).filter(id => !savedOrder.includes(id))];
    if (!Array.isArray(selection.resourceIds)) selection.resourceIds = [...selection.resourceOrder];
    selection.resourceIds = selection.resourceIds.filter(id => availableIds.has(id));
    const selectedIds = new Set(selection.resourceIds);
    const preparedGames = selection.resourceOrder.filter(id => selectedIds.has(id)).map(id => loadedPrepared.find(item => item.id === id)).filter(Boolean);
    selection.resourceId = preparedGames[0]?.id || "";
    fixture.games = preparedGames.map(item => item.name);
    fixture.gameStatuses = preparedGames.map(gameResourceStatus);
  }
  if (scene.id === "bases") fixture.bases = orderedResources(scene.id, language, "base").map(item => item.name);
  if (scene.id === "logos") fixture.logos = orderedResources(scene.id, language, "logo").map(item => ({ name: item.name, data: item.data }));
  if (resource?.type === "game") {
    const game = resource.data || {};
    const questions = Array.isArray(game.questions) ? game.questions : [];
    fixture.game = resource.name;
    if (scene.id === "game-editor") {
      const mappedQuestions = questions.map(question => ({
      text: question.text || "", answers: (question.answers || []).map(answer => ({ text: answer.text || "", points: Number(answer.fixed_points ?? answer.points) || 0 })),
      }));
      const selectedIndex = Math.min(Number(selection.questionIndex) || 0, Math.max(0, mappedQuestions.length - 1));
      fixture.gameQuestions = mappedQuestions.length
        ? [mappedQuestions[selectedIndex], ...mappedQuestions.filter((_, index) => index !== selectedIndex)]
        : [];
      fixture.activeQuestionIndex = 0;
    }
    if (scene.id === "control-finale" && questions.length) {
      const previous = fixture.finale || [];
      fixture.finale = (previous.length ? previous : questions.slice(0, 5).map(question => question.text)).map((text, index) =>
        questions.find(question => question.text === text)?.text || questions[index % questions.length].text || text);
    }
    if (scene.id === "tasks") fixture.tasks = (fixture.tasks || []).map(task => ({ ...task, game: resource.name }));
    const activeQuestion = questions[Math.min(Number(selection.questionIndex) || 0, Math.max(0, questions.length - 1))];
    if (activeQuestion && ["game-editor", "control-round", "host-round", "display-round"].includes(scene.id)) {
      fixture.question = activeQuestion.text || fixture.question;
      fixture.answers = (activeQuestion.answers || []).map(answer => answer.text || "");
      fixture.points = (activeQuestion.answers || []).map(answer => Number(answer.fixed_points ?? answer.points) || 0);
    }
    if (["poll-share", "poll-vote-mobile", "poll-results"].includes(scene.id) && gameResourceType(resource) !== "prepared") {
      fixture.poll = resource.name;
      if (scene.id === "poll-results" && !Array.isArray(fixture.pollVotes)) fixture.pollVotes = questions.map(question => (question.answers || []).map(() => 0));
      const pollQuestions = questions.map((question, questionIndex) => ({
        text: question.text || "", answers: (question.answers || []).map((answer, answerIndex) => ({
          text: answer.text || "",
          votes: scene.id === "poll-results" ? Number(fixture.pollVotes?.[questionIndex]?.[answerIndex]) || 0 : Number(answer.votes) || 0,
        })),
      }));
      const pollQuestionIndex = Math.min(Number(selection.questionIndex) || 0, Math.max(0, pollQuestions.length - 1));
      fixture.question = pollQuestions[pollQuestionIndex]?.text || "";
      if (scene.id === "poll-vote-mobile") fixture.answers = pollQuestions[pollQuestionIndex]?.answers.map(answer => answer.text) || [];
      if (scene.id === "poll-results") fixture.pollQuestions = pollQuestions;
      if (scene.id === "poll-share") {
        const names = subscriberNames(language);
        const recipients = (config.localeFixtures?.[language]?.["poll-share-actions"] || names.map((_, index) => ({ subscriberIndex: index, responded: index === 0 })))
          .filter(item => Number.isInteger(item.subscriberIndex) && item.subscriberIndex >= 0 && item.subscriberIndex < names.length);
        fixture.pollRecipients = structuredClone(recipients);
        fixture.subscribers = recipients.map(item => names[item.subscriberIndex]).filter(Boolean);
        fixture.subscriberStates = recipients.map(item => !!item.responded);
      }
    }
  }
  if (!resource && ["game-editor", "appearance", "sound", "control-round", "host-round", "display-round", "control-finale", "tasks"].includes(scene.id)) {
    fixture.game = ""; fixture.question = ""; fixture.answers = []; fixture.points = []; fixture.gameQuestions = []; fixture.finale = [];
  }
  if (["poll-share", "poll-vote-mobile", "poll-results"].includes(scene.id) && !resource) {
    fixture.poll = ""; fixture.question = ""; fixture.answers = []; fixture.pollQuestions = []; fixture.pollRecipients = []; fixture.subscribers = []; fixture.subscriberStates = [];
  }
  if (["control-round", "host-round", "display-round"].includes(scene.id)) fixture.teams = shared.teams || [];
  if (scene.id === "base-explorer") {
    const base = selectedResource(scene.id, language, "base");
    const data = base?.data || {};
    fixture.base = base?.name || "";
    fixture.folders = (data.categories || []).map(item => item.name).filter(Boolean);
    fixture.questions = (data.questions || []).map(item => item.payload?.text || item.text).filter(Boolean);
  }
  if (scene.id === "logo-draw") {
    const logo = selectedResource(scene.id, language, "logo");
    fixture.logo = logo?.name || "";
    fixture.logoData = logo?.data || null;
  }
  if (scene.id === "subscribers") {
    fixture.people = (shared.subscribers || []).map(name => ({ name, state: "active" }));
  }
  return fixture;
}

function defaultFriendGroups(language) {
  return language === "en" ? {
    friends: [{ name: "Alex Morgan", email: "alex@example.test" }, { name: "Jamie Lee", email: "jamie@example.test" }],
    outgoing: [{ name: "Taylor Parker", email: "taylor@example.test" }],
    incoming: [{ name: "Sam Wilson", email: "sam@example.test" }, { name: "Casey Brown", email: "casey@example.test" }],
    declined: [{ name: "Jordan Smith", email: "jordan@example.test" }],
  } : language === "uk" ? {
    friends: [{ name: "Олександра Новак", email: "oleksandra@example.test" }, { name: "Ян Ковальський", email: "jan@example.test" }],
    outgoing: [{ name: "Тарас Мельник", email: "taras@example.test" }],
    incoming: [{ name: "Ірина Шевченко", email: "iryna@example.test" }, { name: "Петро Бондар", email: "petro@example.test" }],
    declined: [{ name: "Марта Зелінська", email: "marta@example.test" }],
  } : {
    friends: [{ name: "Aleksandra Nowak", email: "aleksandra@example.test" }, { name: "Jan Kowalski", email: "jan@example.test" }],
    outgoing: [{ name: "Tomasz Lewandowski", email: "tomasz@example.test" }],
    incoming: [{ name: "Kasia Maj", email: "kasia@example.test" }, { name: "Piotr Zieliński", email: "piotr@example.test" }],
    declined: [{ name: "Marta Zielińska", email: "marta@example.test" }],
  };
}

function defaultSubscriberInvitations(language) {
  return language === "en" ? [{ email: "pat@example.test", status: "pending" }, { email: "lee@example.test", status: "declined" }]
    : language === "uk" ? [{ email: "olena@example.test", status: "pending" }, { email: "maksym@example.test", status: "declined" }]
      : [{ email: "ola@example.test", status: "pending" }, { email: "maks@example.test", status: "declined" }];
}

function normalizeSharedFixture(shared, defaults) {
  const result = { ...defaults, ...shared };
  result.gameQuestions = Array.isArray(shared.gameQuestions) ? shared.gameQuestions : defaults.gameQuestions;
  result.teams = (Array.isArray(shared.teams) ? shared.teams : defaults.teams).slice(0, 2);
  result.subscribers = Array.isArray(shared.subscribers) ? shared.subscribers : defaults.subscribers;
  result.pollQuestions = Array.isArray(shared.pollQuestions) ? shared.pollQuestions : (() => {
    const oldAnswers = shared.pollAnswers || defaults.pollQuestions[0].answers.map(answer => answer.text);
    const oldResults = shared.pollResults || [];
    return [
      { text: shared.pollQuestion || defaults.pollQuestions[0].text, answers: oldAnswers.map((answer, index) => ({
        text: typeof answer === "string" ? answer : answer.text,
        votes: oldResults[index]?.votes ?? defaults.pollQuestions[0].answers[index]?.votes ?? 0,
      })) },
      ...defaults.pollQuestions.slice(1),
    ];
  })();
  delete result.pollQuestion; delete result.pollAnswers; delete result.pollResults;
  delete result.activeSubscribers; delete result.subscriberStates;
  delete result.pollRecipients;
  return result;
}

function defaultSharedFixture(language) {
  const editor = config.scenes.find(scene => scene.id === "game-editor");
  const editorFixture = localizeFixture(editor?.fixture || {}, language);
  const pollShare = config.scenes.find(scene => scene.id === "poll-share");
  const pollVote = config.scenes.find(scene => scene.id === "poll-vote-mobile");
  const pollResults = config.scenes.find(scene => scene.id === "poll-results");
  const pollFixture = localizeFixture(pollShare?.fixture || {}, language);
  const voteFixture = localizeFixture(pollVote?.fixture || {}, language);
  const resultsFixture = localizeFixture(pollResults?.fixture || {}, language);
  const generalSubscribers = localizeFixture({ subscribers: ["Anna Nowak", "Piotr Zieliński", "Kasia Maj"] }, language).subscribers;
  const oldResults = resultsFixture.answers || [];
  return {
    gameName: editorFixture.game || "Rodzinny pojedynek",
    otherGames: localizeFixture({ games: config.scenes.find(scene => scene.id === "games")?.fixture?.games?.slice(1) || [] }, language).games,
    gameQuestions: [
      { text: editorFixture.question, answers: (editorFixture.answers || []).map((text, index) => ({ text, points: editorFixture.points?.[index] ?? 0 })) },
      ...extraGameQuestions(language).map(([text, answers, points]) => ({ text, answers: answers.map((answer, index) => ({ text: answer, points: points[index] })) })),
    ],
    teams: localizeFixture({ teams: ["Króliczki", "Zajączki"] }, language).teams,
    subscribers: generalSubscribers,
    pollName: pollFixture.poll,
    pollQuestions: [
      { text: voteFixture.question || pollFixture.question, answers: (voteFixture.answers || []).map((text, index) => ({ text, votes: oldResults[index]?.votes ?? 0 })) },
      ...extraPollQuestions(language),
    ],
  };
}

function sharedFixture(language = currentLanguage()) {
  return config.sharedFixtures[language];
}

function subscriberNames(language = currentLanguage()) {
  return config.sharedFixtures?.[language]?.subscribers || [];
}

function ensureResourceData(language = currentLanguage()) {
  config.resourceData ||= {};
  config.viewResources ||= {};
  const shared = config.sharedFixtures[language];
  let resources = Array.isArray(config.resourceData[language]) ? config.resourceData[language] : null;
  const legacyResourceData = config.resourceData[language];
  const legacyResourceGroups = { game: "game", games: "game", base: "base", bases: "base", logo: "logo", logos: "logo" };
  if (!resources && legacyResourceData && typeof legacyResourceData === "object" && Object.keys(legacyResourceData).some(key => legacyResourceGroups[key])) {
    // Dawne grupy typów migrują do jednej wspólnej puli. Typ zostaje metadanymi zasobu.
    const migrated = Object.entries(legacyResourceData).flatMap(([key, value]) => {
      const type = legacyResourceGroups[key];
      if (!type) return [];
      const items = Array.isArray(value) ? value : Object.values(value || {});
      return items.filter(item => item && typeof item === "object").map(item => ({ ...item, type }));
    });
    const seen = new Set();
    resources = migrated.filter(item => !item.id || !seen.has(item.id) && seen.add(item.id));
    config.resourceData[language] = resources;
  }
  if (!resources) {
    resources = [];
    config.resourceData[language] = resources;
  }
  const legacyTeams = resources.find(item => item.type === "teams")?.data?.teams;
  const legacySubscribers = resources.find(item => item.type === "subscribers")?.data?.people;
  if (Array.isArray(legacyTeams)) shared.teams = structuredClone(legacyTeams.slice(0, 2));
  shared.teams = (Array.isArray(shared.teams) ? shared.teams : []).slice(0, 2);
  if (Array.isArray(legacySubscribers)) shared.subscribers = structuredClone(legacySubscribers);
  for (let index = resources.length - 1; index >= 0; index -= 1) {
    if (["teams", "subscribers"].includes(resources[index].type)) resources.splice(index, 1);
  }
  for (let index = resources.length - 1; index >= 0; index -= 1) {
    const item = resources[index];
    const allowed = item.type === "base"
      || item.type === "game" && gameResourceType(item) === "prepared"
      || item.type === "logo" && logoResourceMode(item) === "DRAW";
    if (!allowed) resources.splice(index, 1);
  }
  for (const item of resources) {
    if (item.type !== "game") continue;
    item.data ||= {};
    item.data.game ||= {};
    if (item.data.game.type === "fixed") item.data.game.type = "prepared";
    const savedStatusRaw = String(item.status || item.data.game.status || "").toLowerCase();
    const savedStatus = ({ poll_open: "open", poll_stopped: "stopped" })[savedStatusRaw] || savedStatusRaw;
    item.status = ["draft", "ready"].includes(savedStatus) ? savedStatus : "draft";
  }
  const views = config.viewResources[language] ||= {};
  const ids = type => resources.filter(item => item.type === type).map(item => item.id);
  const firstPreparedGame = resources.find(item => item.type === "game")?.id || "";
  const firstBase = resources.find(item => item.type === "base")?.id || "";
  const firstLogo = resources.find(item => item.type === "logo")?.id || "";
  for (const scene of config.scenes) {
    if (views[scene.id]) continue;
    if (scene.id === "games") views[scene.id] = { resourceIds: ids("game") };
    else if (scene.id === "bases") views[scene.id] = { resourceIds: ids("base") };
    else if (scene.id === "logos") views[scene.id] = { resourceIds: ids("logo") };
    else if (["poll-share", "poll-vote-mobile", "poll-results"].includes(scene.id)) views[scene.id] = { resourceId: "" };
    else if (scene.id === "base-explorer") views[scene.id] = { resourceId: ids("base")[0] || "" };
    else if (scene.id === "logo-draw") views[scene.id] = { resourceId: ids("logo")[0] || "" };
    else if (["control-round", "host-round", "display-round"].includes(scene.id)) views[scene.id] = { resourceId: ids("game")[0] || "", questionIndex: 0 };
    else if (["game-editor", "appearance", "sound", "control-finale", "tasks"].includes(scene.id)) views[scene.id] = { resourceId: ids("game")[0] || "", questionIndex: 0 };
  }
  const resourceTypeByScene = {
    games: "game", bases: "base", logos: "logo", "base-explorer": "base", "logo-draw": "logo",
    "control-round": "game", "host-round": "game", "display-round": "game", "game-editor": "game",
    appearance: "game", sound: "game", "control-finale": "game", tasks: "game",
  };
  for (const [sceneId, selection] of Object.entries(views)) {
    if (["poll-share", "poll-vote-mobile", "poll-results"].includes(sceneId)) {
      selection.resourceId = "";
      continue;
    }
    const expectedType = resourceTypeByScene[sceneId];
    const matches = id => resources.some(item => item.id === id && (!expectedType || item.type === expectedType));
    if (Array.isArray(selection.resourceIds)) selection.resourceIds = selection.resourceIds.filter(matches);
    if (selection.resourceId && !matches(selection.resourceId)) selection.resourceId = "";
    if (!selection.resourceId) {
      if (["control-round", "host-round", "display-round", "game-editor", "appearance", "sound", "control-finale", "tasks"].includes(sceneId)) selection.resourceId = firstPreparedGame;
      else if (sceneId === "base-explorer") selection.resourceId = firstBase;
      else if (sceneId === "logo-draw") selection.resourceId = firstLogo;
    }
  }
  for (const selection of Object.values(views)) delete selection.teamResourceId;
  return resources;
}

function selectedResource(sceneId, language = currentLanguage(), type = null) {
  const resources = ensureResourceData(language);
  const selection = config.viewResources?.[language]?.[sceneId] || {};
  return resources.find(item => item.id === selection.resourceId && (!type || item.type === type)) || null;
}

function gameResourceType(item) {
  const type = String(item?.data?.game?.type || "");
  if (["prepared", "poll_text", "poll_points"].includes(type)) return type;
  if (type === "fixed") return "prepared";
  if (type === "poll") return String(item?.name || "").toLowerCase().includes("punkt") ? "poll_points" : "poll_text";
  return null;
}

function gameResourceReadiness(item) {
  const questions = Array.isArray(item?.data?.questions) ? item.data.questions : [];
  const enoughQuestions = questions.length >= 10;
  const answersValid = questions.every(question => {
    const answers = Array.isArray(question?.answers) ? question.answers : [];
    if (answers.length < 3 || answers.length > 6) return false;
    const points = answers.map(answer => {
      const fixedPoints = answer?.fixed_points;
      const raw = fixedPoints != null && String(fixedPoints).trim() !== "" ? fixedPoints : answer?.points;
      return raw == null || String(raw).trim() === "" ? null : Number(raw);
    });
    return points.every(point => Number.isFinite(point) && point >= 0 && point <= 100)
      && points.reduce((sum, point) => sum + point, 0) <= 100;
  });
  return { ok: enoughQuestions && answersValid, count: questions.length };
}

function gameResourceIssue(item, language = currentLanguage()) {
  const questions = Array.isArray(item?.data?.questions) ? item.data.questions : [];
  const msg = {
    pl: {
      questions: count => `Brakuje pytań: ${count}/10.`,
      fewAnswers: n => `Pytanie ${n}: dodaj co najmniej 3 odpowiedzi.`,
      manyAnswers: n => `Pytanie ${n}: może mieć najwyżej 6 odpowiedzi.`,
      missingPoints: n => `Pytanie ${n}: wpisz punkty przy każdej odpowiedzi.`,
      range: n => `Pytanie ${n}: punkty muszą mieścić się w zakresie 0–100.`,
      sum: n => `Pytanie ${n}: suma punktów przekracza 100.`,
    },
    en: {
      questions: count => `Add more questions: ${count}/10.`,
      fewAnswers: n => `Question ${n}: add at least 3 answers.`,
      manyAnswers: n => `Question ${n}: use no more than 6 answers.`,
      missingPoints: n => `Question ${n}: enter points for every answer.`,
      range: n => `Question ${n}: points must be between 0 and 100.`,
      sum: n => `Question ${n}: the points total is over 100.`,
    },
    uk: {
      questions: count => `Додайте запитання: ${count}/10.`,
      fewAnswers: n => `Запитання ${n}: додайте щонайменше 3 відповіді.`,
      manyAnswers: n => `Запитання ${n}: має бути не більше 6 відповідей.`,
      missingPoints: n => `Запитання ${n}: вкажіть бали для кожної відповіді.`,
      range: n => `Запитання ${n}: бали мають бути від 0 до 100.`,
      sum: n => `Запитання ${n}: сума балів перевищує 100.`,
    },
  }[language] || {};
  if (questions.length < 10) return msg.questions?.(questions.length) || `Add more questions: ${questions.length}/10.`;
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const number = Number(question?.ord) || index + 1;
    const answers = Array.isArray(question?.answers) ? question.answers : [];
    if (answers.length < 3) return msg.fewAnswers?.(number) || `Question ${number}: add at least 3 answers.`;
    if (answers.length > 6) return msg.manyAnswers?.(number) || `Question ${number}: use no more than 6 answers.`;
    const points = answers.map(answer => {
      const fixed = answer?.fixed_points;
      const raw = fixed != null && String(fixed).trim() !== "" ? fixed : answer?.points;
      return raw == null || String(raw).trim() === "" ? null : Number(raw);
    });
    if (points.some(point => point == null || !Number.isFinite(point))) return msg.missingPoints?.(number) || `Question ${number}: enter points for every answer.`;
    if (points.some(point => point < 0 || point > 100)) return msg.range?.(number) || `Question ${number}: points must be between 0 and 100.`;
    if (points.reduce((sum, point) => sum + point, 0) > 100) return msg.sum?.(number) || `Question ${number}: the points total is over 100.`;
  }
  return "";
}

function gameResourceStatus(item) {
  const { ok } = gameResourceReadiness(item);
  return ok ? "ready" : "draft";
}

function logoModeFromData(data) {
  const kind = String(data?.kind || data?.type || "").toUpperCase();
  if (kind === "GLYPH" || kind.includes("GLYPH")) return "TEXT";
  const source = data?.payload?.source || data?.source || {};
  if (source.mode === "IMAGE") return "IMAGE";
  if (kind === "PIX" || kind.includes("PIX")) return "DRAW";
  return null;
}

function logoResourceMode(item) {
  return logoModeFromData(item?.data);
}

function canOpenPollResource(item) {
  const type = gameResourceType(item);
  if (!type?.startsWith("poll") || String(item?.status || item?.data?.game?.status || "draft") !== "draft") return false;
  const questions = Array.isArray(item?.data?.questions) ? item.data.questions : [];
  if (questions.length < 10) return false;
  return type !== "poll_points" || questions.every(question => {
    const count = Array.isArray(question.answers) ? question.answers.length : 0;
    return count >= 3 && count <= 6;
  });
}

function orderedResources(sceneId, language = currentLanguage(), type = null) {
  const resources = ensureResourceData(language);
  const ids = config.viewResources?.[language]?.[sceneId]?.resourceIds || [];
  return ids.map(id => resources.find(item => item.id === id)).filter(item => item && (!type || item.type === type));
}

function renderResourceList(language = currentLanguage()) {
  const root = byId("homepageShotResourceList");
  if (!root) return;
  const resources = ensureResourceData(language);
  const labels = { game: "Gry", base: "Bazy pytań", logo: "Logo" };
  const gameLabels = { prepared: "Gry preparowane" };
  const gameStatusLabels = { draft: "Szkic", ready: "Gotowe", open: "Otwarte", stopped: "Zatrzymane" };
  const gameStatusClasses = { draft: "tag--muted", ready: "tag--ok", open: "tag--info", stopped: "tag--gold" };
  const logoLabels = { DRAW: "Rysunek" };
  root.replaceChildren();
  for (const type of ["game", "base", "logo"]) {
    const items = resources.filter(item => item.type === type && (type !== "game" || gameResourceType(item) === "prepared"));
    const group = document.createElement("section"); group.className = "homepage-shot-resource-group";
    const heading = document.createElement("h3"); heading.textContent = `${labels[type]} · ${items.length}`; group.append(heading);
    if (!items.length) {
      const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Brak wczytanych zasobów."; group.append(empty);
    }
    const categories = new Map();
    for (const item of items) {
      const key = type === "game" ? gameResourceType(item) : type === "logo" ? logoResourceMode(item) : "all";
      if (!categories.has(key)) categories.set(key, []);
      categories.get(key).push(item);
    }
    const orderedKeys = type === "game" ? ["prepared"] : type === "logo" ? ["DRAW"] : ["all"];
    for (const key of orderedKeys) {
      const categoryItems = categories.get(key) || [];
      if (type !== "base") {
        const subheading = document.createElement("h4");
        subheading.className = "homepage-shot-resource-subheading";
        subheading.textContent = `${type === "game" ? gameLabels[key] : `Logo · ${logoLabels[key]}`} · ${categoryItems.length}`;
        group.append(subheading);
      }
      if (!categoryItems.length) {
        if (type !== "base") {
          const emptyCategory = document.createElement("p"); emptyCategory.className = "muted"; emptyCategory.textContent = "Brak zasobów w tej kategorii."; group.append(emptyCategory);
        }
        continue;
      }
      for (const item of categoryItems) {
        const row = document.createElement("div"); row.className = "homepage-shot-resource-card homepage-shot-resource-list-row";
        const main = document.createElement("div"); main.className = "homepage-shot-resource-list-main";
        const name = document.createElement("strong"); name.className = "homepage-shot-resource-list-title"; name.textContent = item.name || "Bez nazwy";
        const metadata = document.createElement("div"); metadata.className = "homepage-shot-resource-list-meta";
        const addTag = value => { const tag = document.createElement("span"); tag.className = "homepage-shot-resource-meta-tag"; tag.textContent = value; metadata.append(tag); };
        if (type === "game") {
          const readiness = gameResourceReadiness(item);
          const status = gameResourceStatus(item);
          addTag(`${readiness.count} ${readiness.count === 1 ? "pytanie" : "pytań"}`);
          const statusTag = document.createElement("span"); statusTag.className = `homepage-shot-resource-meta-tag ${gameStatusClasses[status]}`; statusTag.textContent = gameStatusLabels[status]; metadata.append(statusTag);
        } else if (type === "base") {
          const categoriesCount = Array.isArray(item.data?.categories) ? item.data.categories.length : 0;
          const entriesCount = Array.isArray(item.data?.questions) ? item.data.questions.length : 0;
          addTag(`${categoriesCount} ${categoriesCount === 1 ? "kategoria" : "kategorii"}`); addTag(`${entriesCount} ${entriesCount === 1 ? "wpis" : "wpisów"}`);
        }
        main.append(name, metadata);
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn sm homepage-shot-resource-remove";
        remove.dataset.removeResource = item.id; remove.setAttribute("aria-label", `Usuń ${item.name || "zasób"} z listy`); remove.title = "Usuń z listy zasobów"; remove.textContent = "×";
        row.append(main, remove); group.append(row);
      }
    }
    root.append(group);
  }
  const sharedRoot = byId("homepageShotSharedFields");
  sharedRoot.replaceChildren();
  const shared = config.sharedFixtures[language];
  const teams = sharedGroup(sharedRoot, "Nazwy drużyn");
  for (let index = 0; index < 2; index += 1) {
    const row = document.createElement("div"); row.className = "homepage-shot-shared-row homepage-shot-shared-row--plain";
    sharedField(row, `Drużyna ${index + 1}`, shared.teams?.[index] || "", { dataset: { sharedTeam: index } });
    teams.append(row);
  }
  const subscribers = sharedGroup(sharedRoot, "Aktywni subskrybenci");
  (shared.subscribers || []).forEach((name, index) => {
    const row = document.createElement("div"); row.className = "homepage-shot-shared-row homepage-shot-shared-row--plain";
    sharedField(row, `Osoba ${index + 1}`, name, { dataset: { sharedSubscriber: index } });
    sharedButton(row, "Usuń", "remove-subscriber", index); subscribers.append(row);
  });
  sharedButton(subscribers, "Dodaj subskrybenta", "add-subscriber");
}

function readResourceList(language = currentLanguage()) {
  ensureResourceData(language);
  const shared = config.sharedFixtures[language];
  const root = byId("homepageShotSharedFields");
  for (const input of root.querySelectorAll("[data-shared-team]")) shared.teams[Number(input.dataset.sharedTeam)] = input.value.trim();
  for (const input of root.querySelectorAll("[data-shared-subscriber]")) shared.subscribers[Number(input.dataset.sharedSubscriber)] = input.value.trim();
}

function resourceChoiceSpec(scene) {
  if (["games", "bases", "logos"].includes(scene.id)) return {
    multi: true,
    type: ({ games: "game", bases: "base", logos: "logo" })[scene.id],
    ...(scene.id === "games" ? { filter: item => gameResourceType(item) === "prepared" } : {}),
  };
  if (scene.id === "base-explorer") return { type: "base" };
  if (scene.id === "logo-draw") return { type: "logo" };
  if (["poll-share", "poll-vote-mobile", "poll-results"].includes(scene.id)) return { type: "game", filter: canOpenPollResource, label: "Ankieta do otwarcia", question: true };
  if (["control-round", "host-round", "display-round"].includes(scene.id)) return { type: "game", question: true };
  if (["game-editor", "appearance", "sound", "control-finale", "tasks"].includes(scene.id)) return { type: "game", question: scene.id === "game-editor" };
  return null;
}

function renderResourceChoices(scene = currentScene()) {
  const section = byId("homepageShotResourceChoices");
  const root = byId("homepageShotResourceChoiceFields");
  if (!section || !root) return;
  resourceChoiceSelectUIs.forEach(select => select.destroy());
  resourceChoiceSelectUIs = [];
  root.replaceChildren();
  const spec = resourceChoiceSpec(scene);
  if (!spec) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const resources = ensureResourceData(currentLanguage()).filter(item => item.type === spec.type && (!spec.filter || spec.filter(item)));
  const selection = config.viewResources[currentLanguage()][scene.id] ||= {};
  const addSelect = (label, key, choices, value) => {
    const wrap = document.createElement("label"); wrap.className = "homepage-shot-resource-choice";
    const caption = document.createElement("span"); caption.textContent = label;
    const widget = document.createElement("div"); widget.className = "ui-select homepage-shot-select";
    widget.innerHTML = '<button class="btn sm ui-select-btn" type="button"><span class="ui-select-label">—</span><span class="ui-select-caret"><i class="ico" data-icon="caret-down"></i></span></button><div class="ui-select-menu" role="listbox"></div>';
    widget.dataset.resourceSelectionWidget = key;
    const select = document.createElement("select"); select.hidden = true; select.dataset.resourceSelection = key;
    const empty = document.createElement("option"); empty.value = ""; empty.textContent = choices.length ? "Wybierz…" : "Brak wczytanych zasobów"; select.append(empty);
    choices.forEach(item => { const option = document.createElement("option"); option.value = item.value; option.textContent = item.label; select.append(option); });
    select.value = value || "";
    wrap.append(caption, widget, select); root.append(wrap);
    const ui = initUiSelectFn?.(widget, {
      options: [{ value: "", label: empty.textContent }, ...choices], value: value || "", placeholder: empty.textContent,
      onChange: next => { select.value = next; select.dispatchEvent(new Event("change", { bubbles: true })); },
    });
    if (ui) resourceChoiceSelectUIs.push(ui);
  };
  if (spec.multi) {
    if (!Array.isArray(selection.resourceIds)) selection.resourceIds = resources.map(item => item.id);
    const available = new Set(resources.map(item => item.id));
    const selected = selection.resourceIds.filter(id => available.has(id));
    if (scene.id === "games") {
      selection.resourceIds = selected;
      const savedOrder = Array.isArray(selection.resourceOrder) ? selection.resourceOrder : [];
      selection.resourceOrder = [...savedOrder.filter(id => available.has(id)), ...resources.map(item => item.id).filter(id => !savedOrder.includes(id))];
    } else {
      selection.resourceIds = selected;
    }
    if (!resources.length) {
      const note = document.createElement("p"); note.className = "muted"; note.textContent = `Brak wczytanych zasobów typu ${spec.type}. Dodaj je na karcie „Lista zasobów”.`; root.append(note); return;
    }
    const list = document.createElement("div"); list.className = "homepage-shot-resource-order";
    const orderIds = scene.id === "games" ? selection.resourceOrder : selection.resourceIds;
    orderIds.forEach((id, index) => {
      const item = resources.find(resource => resource.id === id); if (!item) return;
      const row = document.createElement("div"); row.className = "homepage-shot-resource-order-row";
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = selection.resourceIds.includes(id); check.dataset.resourceInclude = id; check.setAttribute("aria-label", `Pokaż ${item.name}`);
      const name = document.createElement("span"); name.textContent = item.name;
      const up = sharedButton(document.createElement("span"), "↑", "resource-up", index); up.setAttribute("aria-label", "Przenieś wyżej"); up.disabled = index === 0;
      const down = sharedButton(document.createElement("span"), "↓", "resource-down", index); down.setAttribute("aria-label", "Przenieś niżej"); down.disabled = index === orderIds.length - 1;
      row.append(check, name, up, down); list.append(row);
    });
    (scene.id === "games" ? [] : resources.filter(item => !selection.resourceIds.includes(item.id))).forEach(item => {
      const row = document.createElement("div"); row.className = "homepage-shot-resource-order-row";
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = false; check.dataset.resourceInclude = item.id; check.setAttribute("aria-label", `Pokaż ${item.name}`);
      const name = document.createElement("span"); name.textContent = item.name; row.append(check, name); list.append(row);
    });
    root.append(list);
    if (!selection.resourceIds.length) {
      const note = document.createElement("p"); note.className = "muted";
      note.textContent = `Nie wybrano żadnych ${spec.type === "game" ? "gier" : spec.type === "base" ? "baz" : "logotypów"} do pokazania.`;
      root.append(note);
    }
  } else {
    if (!resources.some(item => item.id === selection.resourceId)) selection.resourceId = "";
    const options = resources.map(item => ({ value: item.id, label: item.name }));
    addSelect(spec.label || "Zasób", "resourceId", options, selection.resourceId);
    if (spec.question) {
      const game = resources.find(item => item.id === selection.resourceId);
      const questions = game?.data?.questions || [];
      addSelect("Pytanie widoczne w edytorze lub podglądzie", "questionIndex", questions.map((item, index) => ({ value: String(index), label: `${index + 1}. ${item.text || "Pytanie bez treści"}` })), String(selection.questionIndex ?? 0));
    }
    if (!resources.length) {
      const note = document.createElement("p"); note.className = spec.filter ? "homepage-shot-resource-error" : "muted";
      note.setAttribute("role", spec.filter ? "alert" : "status");
      note.textContent = spec.filter
        ? "Brak wczytanej gry ankietowej w szkicu, którą można otworzyć. Wczytaj eksport szkicu z co najmniej 10 pytaniami; ankieta punktowa musi mieć po 3–6 odpowiedzi."
        : `Brak wczytanych zasobów typu ${spec.type}. Dodaj je na karcie „Lista zasobów”.`;
      root.append(note);
    } else if (!selection.resourceId) {
      const note = document.createElement("p"); note.className = spec.filter ? "homepage-shot-resource-error" : "muted";
      note.setAttribute("role", spec.filter ? "alert" : "status");
      note.textContent = spec.filter ? "Nie ma wczytanej pasującej gry ankietowej w szkicu. Ten widok nie jest gotowy." : "Nie wybrano zasobu dla tego widoku.";
      root.append(note);
    }
  }
}

function sharedField(parent, labelText, value, attrs = {}) {
  const wrapper = document.createElement("label"); wrapper.className = "homepage-shot-shared-field";
  if (labelText) { const label = document.createElement("span"); label.textContent = labelText; wrapper.append(label); }
  const input = document.createElement(attrs.tag || "input");
  input.className = "inp";
  if (attrs.type) input.type = attrs.type;
  if (attrs.min !== undefined) input.min = attrs.min;
  if (attrs.max !== undefined) input.max = attrs.max;
  input.value = value ?? "";
  if (attrs.dataset) Object.assign(input.dataset, attrs.dataset);
  wrapper.append(input); parent.append(wrapper);
  return input;
}

function sharedButton(parent, text, action, index = "") {
  const button = document.createElement("button");
  button.className = "btn sm"; button.type = "button"; button.textContent = text;
  button.dataset.sharedAction = action;
  if (index !== "") button.dataset.index = String(index);
  parent.append(button);
  return button;
}

function sharedGroup(parent, title) {
  const group = document.createElement("section"); group.className = "homepage-shot-shared-group";
  const heading = document.createElement("h3"); heading.textContent = title;
  group.append(heading); parent.append(group); return group;
}

function renderSharedEditor() {
  renderResourceList(sharedEditorLanguage);
}

function readSharedEditor() {
  readResourceList(sharedEditorLanguage);
  return config.sharedFixtures[sharedEditorLanguage];
}

function sharedKeysForScene(sceneId) {
  if (sceneId === "games") return ["games", "gameStatuses"];
  if (sceneId === "bases") return ["bases"];
  if (sceneId === "base-explorer") return ["base", "folders", "questions"];
  if (sceneId === "logos") return ["logos"];
  if (sceneId === "logo-draw") return ["logo", "logoData", "logoFile"];
  if (sceneId === "game-editor") return ["game", "question", "answers", "points", "gameQuestions", "activeQuestionIndex"];
  if (["appearance", "sound"].includes(sceneId)) return ["game"];
  if (sceneId === "control-finale") return ["game"];
  if (sceneId === "tasks") return ["game"];
  if (["control-round", "host-round", "display-round"].includes(sceneId)) return ["game", "question", "answers", "points", "teams"];
  if (sceneId === "subscribers") return ["people"];
  if (sceneId === "poll-share") return ["poll", "question", "subscribers", "subscriberStates", "pollRecipients"];
  if (sceneId === "poll-vote-mobile") return ["poll", "question", "answers"];
  if (sceneId === "poll-results") return ["poll", "question", "answers", "pollQuestions"];
  return [];
}
function localizeFixture(source, language) {
  const fixture = structuredClone(source);
  if (language === "pl") return fixture;
  const maps = language === "en" ? {
    "Rodzinny pojedynek": "Family Game Night", "Pytania dla znajomych": "Questions for Friends", "Szybka ankieta": "Quick Survey",
    "Podaj coś, co można zjeść na szybko": "Name something you can eat on the go", "Kanapka": "Sandwich", "Owoc": "Fruit", "Jogurt": "Yogurt", "Sałatka": "Salad", "Drożdżówka": "Sweet bun", "Baton": "Candy bar",
    "Króliczki": "Bunnies", "Zajączki": "Rabbits", "Pytania na rodzinny wieczór": "Questions for Family Night", "Wakacyjne skojarzenia": "Vacation Ideas", "Pytania dla znajomych": "Questions for Friends",
    "Co zabierasz na weekendowy wyjazd?": "What do you pack for a weekend trip?", "Wygodne ubrania": "Comfortable clothes", "Dobre jedzenie": "Good food", "Książkę": "A book", "Świetny pomysł": "Sounds like a great idea",
    "Weekendowy wyjazd": "Weekend getaway", "TWÓRZ": "CREATE", "ŁĄCZ": "CONNECT", "GŁOSUJ": "VOTE", "BAW SIĘ": "HAVE FUN", "GRAJ": "PLAY",
    "Na rozgrzewkę": "Warm-up", "Codzienne wybory": "Everyday choices", "Czas wolny": "Free time", "Rodzinny wieczór": "Family night", "Wielki finał": "Grand final",
  } : {
    "Rodzinny pojedynek": "Родинна гра", "Pytania dla znajomych": "Запитання для друзів", "Szybka ankieta": "Швидке опитування",
    "Podaj coś, co można zjeść na szybko": "Назвіть щось, що можна швидко з’їсти", "Kanapka": "Бутерброд", "Owoc": "Фрукт", "Jogurt": "Йогурт", "Sałatka": "Салат", "Drożdżówka": "Булочка", "Baton": "Батончик",
    "Króliczki": "Зайчики", "Zajączki": "Кролики", "Pytania na rodzinny wieczór": "Запитання для родинного вечора", "Wakacyjne skojarzenia": "Літні асоціації", "Pytania dla znajomych": "Запитання для друзів",
    "Co zabierasz na weekendowy wyjazd?": "Що ви берете із собою на вихідні?", "Wygodne ubrania": "Зручний одяг", "Dobre jedzenie": "Смачна їжа", "Książkę": "Книжку", "Świetny pomysł": "Чудова ідея",
    "Weekendowy wyjazd": "Вихідні разом", "TWÓRZ": "СТВОРЮЙ", "ŁĄCZ": "ЄДНАЙ", "GŁOSUJ": "ГОЛОСУЙ", "BAW SIĘ": "РОЗВАЖАЙСЯ", "GRAJ": "ГРАЙ",
    "Na rozgrzewkę": "Для розігріву", "Codzienne wybory": "Щоденний вибір", "Czas wolny": "Вільний час", "Rodzinny wieczór": "Родинний вечір", "Wielki finał": "Фінал",
  };
  const translate = value => typeof value === "string" ? (maps[value] || value) : value;
  for (const key of ["game", "question", "base", "logo", "poll"]) if (fixture[key]) fixture[key] = translate(fixture[key]);
  for (const key of ["games", "answers", "bases", "folders", "finale", "logos", "teams", "words", "tasks"]) {
    if (Array.isArray(fixture[key])) fixture[key] = fixture[key].map(item => typeof item === "string" ? translate(item) : item && typeof item === "object" ? { ...item, name: translate(item.name), text: translate(item.text), game: translate(item.game) } : item);
  }
  if (fixture.subscribers) fixture.subscribers = language === "en" ? ["Anna Miller", "Peter Wilson", "Kate Brown"] : ["Анна Мельник", "Петро Шевченко", "Катерина Бондар"];
  if (fixture.people) {
    const subscribers = fixture.people.some(person => person.state === "active");
    fixture.people = language === "en"
      ? subscribers ? [{ name: "Anna Miller", state: "active" }, { name: "Peter Wilson", state: "active" }, { name: "Kate Brown", state: "pending" }]
        : [{ name: "Alex Morgan", state: "accepted" }, { name: "Jamie Lee", state: "pending" }, { name: "Taylor Parker", state: "rejected" }]
      : subscribers ? [{ name: "Анна Мельник", state: "active" }, { name: "Петро Шевченко", state: "active" }, { name: "Катерина Бондар", state: "pending" }]
        : [{ name: "Олександра Новак", state: "accepted" }, { name: "Ян Ковальський", state: "pending" }, { name: "Марта Зелінська", state: "rejected" }];
  }
  return fixture;
}
function setStatus(message) { els.status.textContent = message; }
function updateDirtyIndicators() {
  const states = [
    ["homepageShotSharedTabDirty", "homepageShotSharedSaveDirty", "homepageShotSaveShared", sharedDirty],
    ["homepageShotCategoryTabDirty", "homepageShotViewSaveDirty", "homepageShotSave", dirty],
  ];
  for (const [tabId, buttonLabelId, buttonId, hasChanges] of states) {
    const tabIndicator = byId(tabId);
    const buttonIndicator = byId(buttonLabelId);
    const button = byId(buttonId);
    if (tabIndicator) tabIndicator.hidden = !hasChanges;
    if (buttonIndicator) buttonIndicator.hidden = !hasChanges;
    if (button) button.dataset.unsaved = String(hasChanges);
  }
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function viewPath(scene, language) {
  const query = new URLSearchParams({ lang: language });
  if (["host-round", "display-round", "main-display"].includes(scene.id)) query.set("preview", "1");
  return `${scene.path}${scene.path.includes("?") ? "&" : "?"}${query}`;
}

function renderSceneList() {
  const select = els.scene;
  const selected = select.value;
  select.replaceChildren(...config.scenes.map(scene => {
    const option = document.createElement("option");
    option.value = scene.id;
    option.textContent = scene.title;
    return option;
  }));
  if (config.scenes.some(scene => scene.id === selected)) select.value = selected;
  sceneSelectUI?.setOptions(config.scenes.map(scene => ({ value: scene.id, label: scene.title })));
  sceneSelectUI?.setValue(select.value, { silent: true });
  updateEditor();
}

function updateEditor() {
  const scene = currentScene();
  const qrToolbar = byId("homepageShotQrToolbar");
  if (qrToolbar) qrToolbar.hidden = scene.id !== "poll-share";
  sharedEditorLanguage = currentLanguage();
  if (!sharedDirty) renderSharedEditor();
  languageSelectUI?.setValue(currentLanguage(), { silent: true });
  sceneSelectUI?.setValue(scene.id, { silent: true });
  editorSceneId = scene.id;
  editorLanguage = currentLanguage();
  els.title.textContent = `${scene.title} · ${scene.width}×${scene.height}`;
  els.fixture.value = JSON.stringify(langFixture(scene), null, 2);
  renderEditorFields(langFixture(scene));
  dirty = false;
  updateDirtyIndicators();
  loadScenePreview(scene);
}

function selectScreenshotTab(name) {
  const isShared = name === "shared";
  for (const [tabId, panelId, active] of [
    ["homepageShotSharedTab", "homepageShotSharedPanel", isShared],
    ["homepageShotCategoryTab", "homepageShotCategoryPanel", !isShared],
  ]) {
    const tab = byId(tabId);
    tab.closest(".homepage-shot-tab-slot")?.classList.toggle("is-active", active);
    tab.classList.toggle("is-active", active);
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    byId(panelId).hidden = !active;
  }
  if (!isShared) {
    if (!dirty) renderEditorFields(langFixture(currentScene()));
    void loadScenePreview();
  }
}

async function loadScenePreview(scene = currentScene(), force = false) {
  const language = currentLanguage();
  const key = `${language}/${scene.id}`;
  if (!sizeScenePreview(scene)) return;
  if (!force && key === lastFrameKey && els.frame.contentDocument?.readyState === "complete") {
    await applyFixtureToFrame(scene, langFixture(scene, language));
    return;
  }
  const dynamicPreview = ["host-round", "display-round", "main-display"].includes(scene.id);
  if (dynamicPreview) {
    deviceReadyPromise = new Promise(resolve => { deviceReadyResolve = resolve; });
  }
  els.frame.setAttribute("sandbox", dynamicPreview ? "allow-scripts allow-same-origin" : "allow-same-origin");
  els.frame.dataset.sceneId = scene.id;
  els.frame.onload = async () => {
    try {
      await waitForFrameReady(els.frame, 12000);
      await applyFixtureToFrame(scene, langFixture(scene, language));
      lastFrameKey = key;
    } catch (error) {
      setStatus(`Nie udało się przygotować podglądu „${scene.title}”: ${error.message}`);
    }
  };
  els.frame.src = viewPath(scene, language);
}

function sizeScenePreview(scene) {
  const preview = els.frame?.closest(".homepage-shot-preview");
  const availableWidth = preview?.clientWidth || 0;
  if (!availableWidth || !scene?.width || !scene?.height) return false;
  const scale = Math.min(1, Math.max(0.1, (availableWidth - 2) / scene.width));
  els.frame.style.width = `${scene.width}px`;
  els.frame.style.aspectRatio = `${scene.width} / ${scene.height}`;
  els.frame.style.height = `${scene.height}px`;
  els.frame.style.transform = `scale(${scale})`;
  els.frame.style.transformOrigin = "top left";
  els.frameWrap.style.width = `${Math.round(scene.width * scale)}px`;
  els.frameWrap.style.height = `${Math.round(scene.height * scale)}px`;
  return true;
}

window.addEventListener("message", event => {
  if (event.source !== els.frame?.contentWindow) return;
  if (["familiada:preview-ready", "familiada:host-preview-ready"].includes(event.data?.type)) deviceReadyResolve?.();
});

function waitForFrameReady(frame, timeout) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      try {
        const doc = frame.contentDocument;
        if (doc?.readyState === "complete" && doc.body) return resolve();
      } catch { return reject(new Error("widok nie jest dostępny w podglądzie")); }
      if (Date.now() - started > timeout) return reject(new Error("przekroczono czas wczytywania"));
      setTimeout(poll, 120);
    };
    poll();
  });
}

async function applyFixtureToFrame(scene, fixture) {
  const frame = els.frame;
  const doc = frame.contentDocument;
  if (!doc?.body) throw new Error("brak treści widoku");
  await translateFrame(doc, currentLanguage());
  const footerCopy = doc.querySelector('[data-i18n="common.footer.left"]');
  if (footerCopy) footerCopy.textContent = footerCopy.textContent.replace(/©\s*(?:\{?year\}?|\d{4})/i, `© ${new Date().getFullYear()}`);
  doc.documentElement.lang = currentLanguage();
  doc.documentElement.style.width = `${scene.width}px`;
  doc.documentElement.style.height = `${scene.height}px`;
  doc.documentElement.style.overflow = "hidden";
  doc.body.style.width = `${scene.width}px`;
  doc.body.style.height = `${scene.height}px`;
  doc.body.style.minHeight = `${scene.height}px`;
  doc.body.style.overflow = "hidden";
  doc.body.classList.remove("skel-body");
  doc.documentElement.classList.remove("page-loading");
  doc.querySelectorAll("[data-skel-step]").forEach(node => node.classList.add("skel-step-ready"));
  const requiredByScene = {
    games: ["#grid"], "game-editor": ["#qList", "#aList", "#qText"], bases: ["#grid"], "base-explorer": ["#tree", "#list"],
    friends: ["#contactsReceived"], subscribers: ["#contactsReceived"], tasks: ["#tasksHost"], "poll-share": ["#cardMain", "#secShare", "#subsGrid"],
    "poll-vote-mobile": ["#qtext", "#alist"], "poll-results": ["#cardMain", "#resultsList"],
    appearance: ["#gsContentInner"], sound: ["#gsContentInner"], logos: ["#grid"], "logo-draw": ["#drawStage"],
    "control-round": ["#app"], "control-finale": ["#app"], "host-round": ["#paperText1"], "display-round": ["#gameScreen"], "main-display": ["#gameScreen"],
  }[scene.id] || [];
  for (const selector of requiredByScene) if (!doc.querySelector(selector)) throw new Error(`brakuje elementu ${selector} na widoku`);
  const who = doc.querySelector("#who, #whoStatic");
  if (who) who.textContent = currentLanguage() === "en" ? "John Smith" : currentLanguage() === "uk" ? "Іван Петренко" : "Jan Kowalski";

  if (["host-round", "display-round", "main-display"].includes(scene.id)) {
    await prepareDeviceScene(scene, fixture);
    doc.body.dataset.fixtureReady = "true";
    return;
  }
  if (scene.id === "control-round" || scene.id === "control-finale") {
    await paintControl(scene, fixture);
    doc.body.dataset.fixtureReady = "true";
    return;
  }
  const { icon, iconText, hydrateIcons } = await import("/shared/js/core/icons.js?v=v2026-10-19T12244");

  const grid = doc.getElementById("grid");
  if (scene.id === "games") {
    const language = currentLanguage();
    const words = language === "en" ? {
      hint: "Select a game to use its actions. Double-click a game name to rename it.", search: "Search…", filter: "All statuses",
      updated: "Recently updated", created: "Recently added", byName: "Name A–Z", draft: "DRAFT", ready: "Ready", open: "OPEN", stopped: "STOPPED",
      account: "John Smith", community: "Community games", logo: "Logos", bases: "Question banks", friends: "Friends",
      connect: "Connect a device", subscribers: "Subscribers", tasks: "Tasks", more: "More", logout: "Sign out",
    } : language === "uk" ? {
      hint: "Виберіть гру, щоб скористатися її діями. Двічі натисніть назву, щоб перейменувати.", search: "Пошук…", filter: "Усі стани",
      updated: "Нещодавно змінені", created: "Нещодавно додані", byName: "Назва А–Я", draft: "ЧЕРНЕТКА", ready: "Готова", open: "ВІДКРИТА", stopped: "ЗУПИНЕНА",
      account: "Іван Петренко", community: "Ігри спільноти", logo: "Логотипи", bases: "Бази запитань", friends: "Друзі",
      connect: "Підключити пристрій", subscribers: "Підписники", tasks: "Завдання", more: "Ще", logout: "Вийти",
    } : {
      hint: "Zaznacz grę, aby włączyć jej akcje. Dwukrotne kliknięcie nazwy pozwala ją zmienić.", search: "Szukaj…", filter: "Wszystkie",
      updated: "Ostatnio zmienione", created: "Najnowsze", byName: "Nazwa A–Z", draft: "Szkic", ready: "Gotowe", open: "OTWARTA", stopped: "ZATRZYMANA",
      account: "Jan Kowalski", community: "Gry Społeczności", logo: "Logo", bases: "Bazy pytań", friends: "Znajomi",
      connect: "Podłącz urządzenie", subscribers: "Subskrybenci", tasks: "Zadania", more: "Więcej", logout: "Wyloguj",
    };
    const headingHint = doc.getElementById("hint");
    if (headingHint) headingHint.textContent = words.hint;

    // Odtwórz ikony nawigacji, które zwykle dodaje warstwa tłumaczeń.
    const navIcons = { btnMarketplace: "gamepad", btnLogoEditor: "display", btnBases: "drawer", btnFriends: "people", btnConnectDevice: "phone", btnSubscribers: "envelope", btnTasks: "bell" };
    for (const [id, iconName] of Object.entries(navIcons)) {
      const button = doc.getElementById(id);
      const label = button?.querySelector("[data-i18n]");
      if (label) label.innerHTML = `${icon(iconName)} ${escapeHtml(words[id === "btnMarketplace" ? "community" : id === "btnLogoEditor" ? "logo" : id === "btnBases" ? "bases" : id === "btnFriends" ? "friends" : id === "btnConnectDevice" ? "connect" : id === "btnSubscribers" ? "subscribers" : "tasks"])}`;
    }
    const section3 = doc.querySelector(".topbar-section-3");
    if (section3) {
      let lang = section3.querySelector(".lang-switcher");
      if (!lang) { lang = doc.createElement("div"); lang.className = "lang-switcher"; section3.prepend(lang); }
      const flag = { pl: "flag-pl", en: "lang-en", uk: "flag-ua" }[language] || "flag-pl";
      const languageLabel = language === "en" ? "Language" : language === "uk" ? "Мова" : "Język";
      lang.innerHTML = `<button type="button" class="btn lang-btn" aria-label="${languageLabel}">${icon(flag)}</button>`;
    }
    const login = doc.getElementById("btnLogout");
    if (login) login.style.display = "none";
    const who = doc.getElementById("whoStatic");
    if (who) {
      who.className = "who account-btn btn";
      who.innerHTML = `<span class="account-who">${escapeHtml(words.account)}</span><span class="account-chevron">${icon("caret-down")}</span>`;
      const accountMenu = doc.createElement("div");
      accountMenu.id = "topbarAccountMenu";
      accountMenu.className = "account-menu";
      accountMenu.hidden = true;
      accountMenu.innerHTML = `<button class="btn account-menu-item" type="button">${icon("settings")} ${language === "pl" ? "Ustawienia konta" : language === "en" ? "Account settings" : "Налаштування облікового запису"}</button><button class="btn account-menu-item" type="button">${icon("logout")} ${escapeHtml(words.logout)}</button>`;
      who.after(accountMenu);
    }
    // Ukaż komplet nawigacji; ten sam układ priorytetów co na żywej stronie
    // sam schowa najmniej ważne przyciski do „Więcej” tylko przy braku miejsca.
    for (const id of ["btnMarketplace", "btnLogoEditor", "btnBases", "btnFriends", "btnConnectDevice", "btnSubscribers", "btnTasks"]) {
      const button = doc.getElementById(id);
      if (button) { button.dataset.navHidden = "false"; button.style.display = ""; }
    }
    const more = doc.getElementById("navMore");
    const moreBtn = doc.getElementById("btnMore");
    const moreDropdown = doc.getElementById("navMoreDropdown");
    if (more && moreBtn && moreDropdown) {
      const { setTopbarNavPriority } = await import("/shared/js/core/topbar-controller.js?v=v2026-10-19T12244");

      const nav = setTopbarNavPriority({ moreEl: more, moreDropdownEl: moreDropdown });
      nav.recalc();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    const availableGameResources = ensureResourceData(language).filter(item => item.type === "game" && gameResourceType(item) === "prepared");
    const gameSelection = config.viewResources?.[language]?.[scene.id] || {};
    const savedGameOrder = Array.isArray(gameSelection.resourceOrder) ? gameSelection.resourceOrder : availableGameResources.map(item => item.id);
    const availableGameIds = new Set(availableGameResources.map(item => item.id));
    const gameOrder = [...savedGameOrder.filter(id => availableGameIds.has(id)), ...availableGameResources.map(item => item.id).filter(id => !savedGameOrder.includes(id))];
    gameSelection.resourceOrder = gameOrder;
    const selectedGameIds = Array.isArray(gameSelection.resourceIds) ? new Set(gameSelection.resourceIds) : new Set(gameOrder);
    gameSelection.resourceIds = gameOrder.filter(id => availableGameIds.has(id) && selectedGameIds.has(id));
    gameSelection.resourceId = gameSelection.resourceIds[0] || "";
    const gameById = new Map(availableGameResources.map(item => [item.id, item]));
    const gameResources = gameSelection.resourceIds.map(id => gameById.get(id)).filter(Boolean);
    const selectedGame = gameResources[0] || null;
    const statusLabels = { draft: words.draft, ready: words.ready, open: words.open, stopped: words.stopped };
    const sampleRules = item => {
      const ready = !!item && gameResourceReadiness(item).ok;
      return {
        edit: { ok: !!item },
        play: { ok: ready },
        poll_entry: { ok: false },
        export: { ok: !!item },
      };
    };
    const listFilterModule = await import("/shared/js/core/list-filter.js?v=v2026-10-19T12244");
    const selectedRules = selectedGame ? sampleRules(selectedGame) : null;
    const tileStatus = item => {
      if (!item) return "draft";
      const rules = sampleRules(item);
      return listFilterModule.gameStateKey(
        gameResourceStatus(item),
        { isPrepared: gameResourceType(item) === "prepared", playOk: !!rules?.play?.ok },
      );
    };
    const previewStatus = tileStatus(selectedGame);
    const setDisabled = (id, disabled) => { const button = doc.getElementById(id); if (button) button.disabled = disabled; };
    setDisabled("btnPlay", !selectedGame || !selectedRules?.play?.ok);
    setDisabled("btnSettings", !selectedGame);
    setDisabled("btnEdit", !selectedGame || !selectedRules?.edit?.ok);
    setDisabled("btnPreview", !selectedGame);
    setDisabled("btnPoll", !selectedGame || !selectedRules?.poll_entry?.ok);
    setDisabled("btnDuplicate", !selectedGame || !selectedRules?.export?.ok);
    setDisabled("btnExport", !selectedGame || !selectedRules?.export?.ok);
    setDisabled("btnExportBase", !selectedGame || !selectedRules?.export?.ok);
    setDisabled("btnSendCopy", !selectedGame || !selectedRules?.export?.ok);
    for (const [id, rule] of [["btnPlay", selectedRules?.play], ["btnEdit", selectedRules?.edit], ["btnPoll", selectedRules?.poll_entry], ["btnDuplicate", selectedRules?.export], ["btnExport", selectedRules?.export], ["btnExportBase", selectedRules?.export], ["btnSendCopy", selectedRules?.export]]) {
      const button = doc.getElementById(id);
      if (!button) continue;
      if (rule && !rule.ok && rule.reason) button.title = rule.reason;
      else button.removeAttribute("title");
    }
    setDisabled("btnImport", false);
    doc.querySelectorAll(".tab-label").forEach(button => button.classList.toggle("active", button.id === "tabPrepared"));
    const names = gameResources.map(item => item.name);
    if (grid) grid.innerHTML = `<div class="addCard"><div class="plus">${icon("plus")}</div><div class="txt">${language === "en" ? "New game" : language === "uk" ? "Нова гра" : "Nowa gra"}</div></div>${names.map((name, i) => {
      const resource = gameResources[i];
      const status = resource === selectedGame ? previewStatus : tileStatus(resource);
      const statusClass = status === "ready" ? "tag--ok" : status === "open" ? "tag--info" : status === "stopped" ? "tag--gold" : "tag--muted";
      const rules = sampleRules(resource);
      const blocker = status === "draft" ? gameResourceIssue(resource, language) : "";
      const origin = resource.received_from_label ? `<span class="tag tag--muted">${escapeHtml(resource.received_from_label)}</span>` : "";
      return `<div class="card tile ${i === 0 ? "selected" : ""} ${blocker ? "not-ready" : ""}" data-status="${status}" data-updated="2026-10-${String(18 - i).padStart(2, "0")}T12:00:00Z"><div class="x">${icon("trash")}</div><div class="name">${escapeHtml(name)}</div><div class="rules" style="color:#ffad42">${escapeHtml(blocker)}</div><div class="tileTags"><span class="tag ${statusClass}">${statusLabels[status]}</span>${origin}</div></div>`;
    }).join("")}`;
    const searchSlot = doc.querySelector(".games-bottom-left");
    if (searchSlot) {
      searchSlot.innerHTML = `<div class="ui-select list-filter"><button class="btn sm ui-select-btn" type="button" aria-label="Filtruj wg stanu"><span class="ui-select-icon">${icon("filter")}</span><span class="ui-select-label">${escapeHtml(words.filter)}</span><span class="ui-select-caret">${icon("caret-down")}</span></button></div><div class="ui-select list-sort"><button class="btn sm ui-select-btn" type="button" aria-label="Sortowanie"><span class="ui-select-icon">${icon("sort")}</span><span class="ui-select-label">${escapeHtml(words.updated)}</span><span class="ui-select-caret">${icon("caret-down")}</span></button></div><div class="list-search"><div class="searchBox"><input class="searchText" type="text" placeholder="${escapeHtml(words.search)}" aria-label="${escapeHtml(words.search)}"></div><button class="btn list-search-open" type="button" aria-label="${escapeHtml(words.search)}">${icon("search")}</button></div>`;
    }
  } else if (scene.id === "game-editor") {
    const language = currentLanguage();
    const backLabel = language === "en" ? "Back" : language === "uk" ? "Назад" : "Wstecz";
    const back = doc.getElementById("btnBack");
    if (back) back.innerHTML = iconText("arrow-left", backLabel);
    const section3 = doc.querySelector(".topbar-section-3");
    if (section3) {
      let lang = section3.querySelector(".lang-switcher");
      if (!lang) { lang = doc.createElement("div"); lang.className = "lang-switcher"; section3.prepend(lang); }
      const flag = { pl: "flag-pl", en: "lang-en", uk: "flag-ua" }[language] || "flag-pl";
      const languageLabel = language === "en" ? "Language" : language === "uk" ? "Мова" : "Język";
      lang.innerHTML = `<button type="button" class="btn lang-btn" aria-label="${languageLabel}">${icon(flag)}</button>`;
    }
    const login = doc.getElementById("btnLogout");
    if (login) login.style.display = "none";
    const account = doc.getElementById("who");
    if (account) {
      const accountName = language === "en" ? "John Smith" : language === "uk" ? "Іван Петренко" : "Jan Kowalski";
      const logoutLabel = language === "en" ? "Sign out" : language === "uk" ? "Вийти" : "Wyloguj";
      account.className = "who account-btn btn";
      account.innerHTML = `<span class="account-who">${accountName}</span><span class="account-chevron">${icon("caret-down")}</span>`;
      const menu = doc.createElement("div");
      menu.id = "topbarAccountMenu";
      menu.className = "account-menu";
      menu.hidden = true;
      const settingsLabel = language === "en" ? "Account settings" : language === "uk" ? "Налаштування облікового запису" : "Ustawienia konta";
      menu.innerHTML = `<button class="btn account-menu-item" type="button">${icon("settings")} ${settingsLabel}</button><button class="btn account-menu-item" type="button">${icon("logout")} ${logoutLabel}</button>`;
      account.after(menu);
    }
    setInput(doc, "gameName", fixture.game);
    setText(doc, "pageTitle", fixture.game);
    setText(doc, "hintTop", language === "en" ? "At least 10 questions · 3–6 answers each" : language === "uk" ? "Щонайменше 10 запитань · по 3–6 відповідей" : "Minimum 10 pytań · po 3–6 odpowiedzi");
    const editorPanel = doc.querySelector(".rightPanel");
    editorPanel?.classList.add("hasQ");
    setInput(doc, "qText", fixture.question);
    const qList = doc.getElementById("qList");
    const { questionProblems } = await import("/shared/js/core/question-form.js?v=v2026-10-19T12244");
    const questions = fixture.gameQuestions || [
      { text: fixture.question, answers: (fixture.answers || []).map((text, i) => ({ text, points: fixture.points?.[i] ?? 0 })) },
    ];
    const selectedQuestionIndex = Math.min(Number(fixture.activeQuestionIndex) || 0, Math.max(0, questions.length - 1));
    const selectedQuestion = questions[selectedQuestionIndex] || { text: "", answers: [] };
    if (qList) {
      const addTileLabel = language === "en" ? "Add question" : language === "uk" ? "Додати запитання" : "Dodaj pytanie";
      const addTileHint = language === "en" ? "At least 10 questions" : language === "uk" ? "Додай щонайменше 10 запитань" : "Dodaj co najmniej 10 pytań";
      const addTile = questions.length ? `<button type="button" class="qcard addTile"><div class="plus">${icon("plus")}</div><div class="txt">${addTileLabel}</div><div class="sub">${addTileHint}</div></button>` : `<div class="qcard"><div class="qprev">${language === "en" ? "No game selected" : language === "uk" ? "Гру не вибрано" : "Nie wybrano gry"}</div></div>`;
      qList.innerHTML = addTile + questions.map((question, i) => {
        const answers = Array.isArray(question.answers) ? question.answers : [];
        const sum = answers.reduce((total, answer) => total + (Number(answer.points) || 0), 0);
        const valid = questionProblems({
          text: question.text,
          answers: answers.map(answer => ({ text: answer.text, fixed_points: answer.points })),
        }, "prepared").length === 0;
        const status = valid ? "good" : "bad";
        const meta = language === "en" ? `${answers.length}/6 answers · ${sum}/100 pts`
          : language === "uk" ? `${answers.length}/6 відповідей · ${sum}/100 балів`
            : `${answers.length}/6 odpowiedzi · ${sum}/100 pkt`;
        return `<div class="qcard ${status} ${i === selectedQuestionIndex ? "active" : ""}" data-id="shot-question-${i + 1}"><div class="qord">${language === "en" ? "Question" : language === "uk" ? "Запитання" : "Pytanie"} ${i + 1}</div><div class="qprev">${escapeHtml(question.text)}</div><div class="qmeta">${meta}</div><button type="button" class="x" aria-label="${language === "en" ? "Delete" : language === "uk" ? "Видалити" : "Usuń"}">${icon("trash")}</button></div>`;
      }).join("");
    }
    const answers = doc.getElementById("aList");
    const selectedAnswers = selectedQuestion.answers || [];
    const totalPoints = selectedAnswers.reduce((sum, answer) => sum + (Number(answer.points) || 0), 0);
    const pointsRemain = doc.getElementById("pointsRemainTop");
    if (pointsRemain) pointsRemain.innerHTML = `<div class="qf-sum"><span>${language === "en" ? "Total" : language === "uk" ? "Сума" : "Suma"}</span><b>${totalPoints}/100</b></div>`;
    if (answers) {
      if (!questions.length) {
        answers.innerHTML = `<div class="qf-row">${language === "en" ? "Choose a game to edit its answers." : language === "uk" ? "Виберіть гру, щоб редагувати відповіді." : "Wybierz grę, aby zobaczyć jej odpowiedzi."}</div>`;
      } else {
      const addAnswerLabel = language === "en" ? "Add answer" : language === "uk" ? "Додати відповідь" : "Dodaj odpowiedź";
      const count = selectedAnswers.length;
      const addAnswerTile = `<button type="button" class="qf-row qf-add" ${count >= 6 ? "disabled" : ""}><span class="qf-addPlus">${icon("plus")}</span><span class="qf-addLbl">${addAnswerLabel}</span><span class="qf-addCnt">${count}/6</span></button>`;
      answers.innerHTML = addAnswerTile + selectedAnswers.map((answer, i) => `<div class="qf-row"><input class="qf-text" value="${escapeHtml(answer.text)}" aria-label="${language === "en" ? "Answer" : language === "uk" ? "Відповідь" : "Odpowiedź"} ${i + 1}"><input class="qf-pts" value="${Number(answer.points) || 0}" aria-label="${language === "en" ? "Points" : language === "uk" ? "Бали" : "Punkty"}"><button type="button" class="qf-del" aria-label="${language === "en" ? "Delete" : language === "uk" ? "Видалити" : "Usuń"}">${icon("trash")}</button></div>`).join("");
      }
    }
  } else if (scene.id === "bases") {
    if (grid) grid.innerHTML = `<div class="addCard"><div class="plus">${icon("plus")}</div><div class="txt">Nowa baza</div></div>${fixture.bases.map((name, i) => `<div class="card tile ${i === 0 ? "selected" : ""}"><div class="name">${escapeHtml(name)}</div><div class="meta">${i ? "8 pytań · 2 kategorie" : "12 pytań · 3 kategorie"}</div><div class="tileTags"><span class="tag ${i ? "tag--muted" : "tag--ok"}">${i ? "Moja baza" : "Właściciel"}</span></div></div>`).join("")}`;
  } else if (scene.id === "base-explorer") {
    setText(doc, "baseName", fixture.base);
    const tree = doc.getElementById("tree");
    if (tree) tree.innerHTML = `<button class="row tree-row is-selected" data-kind="cat"><span class="col-main"><span class="title-text">Wszystkie pytania</span></span><span class="col-num">12</span></button>${fixture.folders.map((folder, i) => `<button class="row tree-row" data-kind="cat"><span class="col-main"><span class="title-text">${escapeHtml(folder)}</span></span><span class="col-num">${[4,5,3][i] || 2}</span></button>`).join("")}`;
    setText(doc, "breadcrumbs", `${fixture.base} / Wszystkie pytania`);
    const list = doc.getElementById("list");
    if (list) list.innerHTML = fixture.questions.map((question, i) => `<div class="row" data-kind="q"><span class="col-num">${String(i + 1).padStart(2, "0")}</span><div class="col-main"><span class="title-line"><span class="title-text">${escapeHtml(question)}</span></span></div><span class="col-type">Pytanie</span><span class="col-meta">Odpowiedzi: 6</span></div>`).join("");
    doc.querySelector(".explorer")?.classList.add("skel-step-ready");
  } else if (scene.id === "friends") {
    await paintPeople(doc, fixture);
  } else if (scene.id === "subscribers") {
    await paintPeople(doc, fixture);
  } else if (scene.id === "tasks") {
    await paintTasks(doc, fixture);
  } else if (scene.id === "poll-share" || scene.id === "poll-results") {
    await paintPoll(doc, scene, fixture);
  } else if (scene.id === "poll-vote-mobile") {
    const noPoll = !fixture.poll;
    setText(doc, "title", noPoll ? (currentLanguage() === "en" ? "No open poll" : currentLanguage() === "uk" ? "Немає відкритого опитування" : "Brak otwartej ankiety") : fixture.poll);
    setText(doc, "sub", noPoll ? "" : currentLanguage() === "en" ? "One question · one vote" : currentLanguage() === "uk" ? "Одне запитання · один голос" : "Jedno pytanie · jeden głos");
    setText(doc, "qtext", noPoll ? (currentLanguage() === "en" ? "Choose a game opened as a poll." : currentLanguage() === "uk" ? "Виберіть гру, відкриту як опитування." : "Wybierz grę otwartą jako ankietę.") : fixture.question);
    const list = doc.getElementById("alist");
    if (list) list.innerHTML = fixture.answers.map(text => `<button class="btn voteOption">${escapeHtml(text)}</button>`).join("");
    const box = doc.getElementById("qbox"); if (box) box.style.display = noPoll ? "none" : "";
    setText(doc, "prog", "1 / 1");
  } else if (scene.id === "appearance" || scene.id === "sound") {
    setText(doc, "gsTitle", fixture.game);
    doc.querySelectorAll(".gs-sidebar-item").forEach(item => item.classList.toggle("active", item.dataset.cat === (scene.id === "appearance" ? "display" : "sound")));
    const content = doc.getElementById("gsContentInner");
    if (scene.id === "appearance") {
      const text = await getStrings(currentLanguage(), {
        category: "gameSettings.categories.display", colors: "gameSettings.display.colors", colorA: "gameSettings.display.colorA",
        colorB: "gameSettings.display.colorB", colorBg: "gameSettings.display.colorBg", colorDot: "gameSettings.display.colorDot",
        theme: "gameSettings.display.theme", logo: "gameSettings.display.logo", defaultLogo: "gameSettings.display.logoDefault",
        hostLogo: "gameSettings.display.hostLogoMode", pixel: "gameSettings.display.hostLogoPixel",
        source: "gameSettings.display.hostLogoSource", hint: "gameSettings.display.hostLogoHint", reset: "gameSettings.resetSection",
      });
      if (content) content.innerHTML = `<div class="gs-cat-title">${escapeHtml(text.category)}</div>
        <div class="gs-section"><div class="gs-label">${escapeHtml(text.colors)}</div><div class="colorRow">
          ${[["A", text.colorA, "#c4002f"], ["B", text.colorB, "#2a62ff"], ["BACKGROUND", text.colorBg, "#d21180"], ["DOT", text.colorDot, "#d7ff3d"]].map(([key,label,color]) => `<div class="colorItem"><div class="lbl2">${escapeHtml(label)}</div><button class="swatchBtn" data-color-key="${key}" style="background:${color}" type="button"></button></div>`).join("")}
        </div></div>
        <div class="gs-section"><div class="gs-label">${escapeHtml(text.theme)}</div><div class="ui-select" id="gsThemeSelect" style="margin-top:8px;width:100%"><button class="btn inp ui-select-btn" type="button"><span class="ui-select-label">—</span><span class="ui-select-caret"><i class="ico" data-icon="caret-down"></i></span></button><div class="ui-select-menu" role="listbox"></div></div></div>
        <div class="gs-section"><div class="gs-label">${escapeHtml(text.logo)}</div><div id="gsLogoGrid" class="gs-logo-grid"></div></div>
        <div class="gs-section"><div class="gs-label">${escapeHtml(text.hostLogo)}</div><div class="toggle-group gs-host-logo-mode" role="radiogroup"><label class="toggle-item"><input type="radio" name="gsHostLogoMode" value="pixel" checked/><span class="toggle-slider" data-text="${escapeHtml(text.pixel)}"></span></label><label class="toggle-item"><input type="radio" name="gsHostLogoMode" value="source"/><span class="toggle-slider" data-text="${escapeHtml(text.source)}"></span></label></div><div class="gs-hint">${escapeHtml(text.hint)}</div></div>
        <div class="sfx-foot"><button class="btn" id="btnDisplayReset" type="button">${escapeHtml(text.reset)}</button></div>`;
      const grid = doc.getElementById("gsLogoGrid");
      if (grid) {
        const tile = doc.createElement("div"); tile.className = "gs-logo-tile selected";
        const preview = doc.createElement("div"); preview.className = "gs-logo-prev";
        preview.append(await logoCanvasFromFile(fixture.logoFile || "/shared/data/logo_familiada.json", 180, 84));
        const name = doc.createElement("div"); name.className = "gs-logo-name"; name.textContent = text.defaultLogo;
        tile.append(preview, name); grid.append(tile);
      }
      const theme = await fetch("/shared/data/display-themes.json", { cache: "force-cache" }).then(response => response.json()).catch(() => null);
      const firstTheme = theme?.themes?.[0]?.label?.[currentLanguage()] || (currentLanguage() === "en" ? "Classic" : currentLanguage() === "uk" ? "Класична" : "Klasyczny");
      const themeLabel = doc.querySelector("#gsThemeSelect .ui-select-label"); if (themeLabel) themeLabel.textContent = firstTheme;
    } else if (content) {
      const title = await getStrings(currentLanguage(), { category: "gameSettings.categories.sound", reset: "control.sfxResetAll" });
      content.innerHTML = `<div class="gs-cat-title">${escapeHtml(title.category)}</div><div class="gs-section"><div class="sfx-table" id="shotSfxTable"></div></div><div class="sfx-foot"><button class="btn" id="btnSoundReset" type="button">${escapeHtml(title.reset)}</button></div>`;
    }
    if (scene.id === "sound") await paintSoundSettings(doc);
  } else if (scene.id === "logos") {
    const list = doc.getElementById("grid");
    if (list) {
      list.innerHTML = `<div class="addCard"><div class="plus">${icon("plus")}</div><div class="txt">Utwórz logo</div></div>${fixture.logos.map((logo, i) => `<div class="logoTile ${i === 0 ? "is-selected" : ""}"><div class="logoTileTop"><div><div class="logoName">${escapeHtml(logo.name)}</div><div class="logoMeta">Logo demonstracyjne</div></div></div><div class="logoPrev" data-logo-preview="${i}"></div></div>`).join("")}`;
      const previews = await Promise.all(fixture.logos.map(logo => logo.data
        ? logoCanvasFromStored(logo.data, 260, 100)
        : logoCanvasFromFile(logo.file, 260, 100)));
      list.querySelectorAll("[data-logo-preview]").forEach(node => node.append(previews[Number(node.dataset.logoPreview)]));
    }
  } else if (scene.id === "logo-draw") {
    setInput(doc, "logoName", fixture.logo);
    const canvas = doc.querySelector("canvas");
    if (canvas) {
      const logo = fixture.logoData
        ? await logoCanvasFromStored(fixture.logoData, 520, 245)
        : await logoCanvasFromFile(fixture.logoFile, 520, 245);
      canvas.width = 520; canvas.height = 245;
      canvas.style.width = "520px"; canvas.style.height = "245px";
      canvas.getContext("2d").drawImage(logo, 0, 0, 520, 245);
    }
  }
  hydrateIcons(doc);
  doc.body.dataset.fixtureReady = "true";
}

async function paintSoundSettings(doc) {
  const [{ default: sounds }, { default: dictionary }, { icon }] = await Promise.all([
    fetch("/shared/data/sounds.json", { cache: "force-cache" }).then(response => response.json()),
    import(`/shared/translation/${currentLanguage()}.js?v=v2026-10-19T12244`),
    import("/shared/js/core/icons.js?v=v2026-10-19T12244"),

  ]);
  const table = doc.getElementById("shotSfxTable");
  if (!table) return;
  const lookup = key => key.split(".").reduce((value, part) => value?.[part], dictionary);
  table.innerHTML = sounds.categories.map(category => {
    const label = lookup(`control.sfxDesc.${category.key}`) || category.key;
    const variant = category.sounds?.[0]?.label?.[currentLanguage()] || "Classic";
    return `<div class="sfx-row" data-sound="${escapeHtml(category.key)}"><div class="sfx-row-desc">${escapeHtml(label)}</div><div class="ui-select sfx-variant-select"><button class="btn sm ui-select-btn" type="button"><span class="ui-select-label">${escapeHtml(variant)}</span><span class="ui-select-caret">⌄</span></button></div><button class="sfx-preview-btn sound-preview-btn" type="button" title="Podgląd" aria-label="Podgląd">${icon("play")}</button><div class="sfx-vol-wrap"><input class="sfx-vol" type="range" min="0" max="100" value="100"><span class="sfx-vol-label">100%</span></div><div class="sfx-file-wrap"><button class="btn sfx-add-btn" type="button" disabled>Wybierz plik</button></div></div>`;
  }).join("");
  table.querySelectorAll(".sfx-row").forEach(row => {
    const slider = row.querySelector(".sfx-vol");
    slider.addEventListener("input", () => { row.querySelector(".sfx-vol-label").textContent = `${slider.value}%`; });
    row.querySelector(".sfx-preview-btn").addEventListener("click", () => {
      const audio = new Audio(`/assets/audio/${row.dataset.sound}/classic.mp3`);
      void audio.play().catch(() => {});
    });
  });
}

async function getStrings(language, keys) {
  const { default: dictionary } = await import(`/shared/translation/${language}.js?v=v2026-10-19T12244`);

  const output = {};
  for (const [name, key] of Object.entries(keys)) output[name] = key.split(".").reduce((value, part) => value?.[part], dictionary) || "";
  return output;
}

async function logoCanvasFromFile(file, width, height) {
  const response = await fetch(file || "/shared/data/logo_familiada.json", { cache: "force-cache" });
  if (!response.ok) throw new Error("nie udało się wczytać przykładowego logo");
  const stored = await response.json();
  return logoCanvasFromStored(stored, width, height);
}

async function logoCanvasFromStored(stored, width, height) {
  const { buildLogoPreviewCanvas, loadFont5x7 } = await import("/shared/js/core/logo-preview.js?v=v2026-10-19T12244");
  const logo = stored.kind === "GLYPH" ? { type: "GLYPH_30x10", payload: stored.payload }
    : stored.kind === "PIX" ? { type: "PIX_150x70", payload: stored.payload }
      : stored.type ? stored : { type: "GLYPH_30x10", payload: stored.payload || stored };
  const glyphs = await loadFont5x7();
  return buildLogoPreviewCanvas(logo, glyphs, width, height);
}

async function translateFrame(doc, language) {
  if (language === "pl") return;
  const { default: dictionary } = await import(`/shared/translation/${language}.js?v=v2026-10-19T12244`);
  const { iconText } = await import("/shared/js/core/icons.js?v=v2026-10-19T12244");

  const lookup = key => key.split(".").reduce((value, part) => value?.[part], dictionary);
  const replace = (key, node) => {
    const value = lookup(key);
    if (value == null || typeof value === "object") return;
    const text = String(value).replace(/\{(\w+)\}/g, (_, token) => node.dataset[token] || `{${token}}`);
    const before = node.getAttribute("data-i18n-icon");
    const after = node.getAttribute("data-i18n-icon-after");
    if (before || after) node.innerHTML = iconText(before || after, text, { after: !before });
    else if (node.hasAttribute("data-i18n-html")) node.innerHTML = text;
    else if (node.hasAttribute("data-i18n-placeholder")) node.setAttribute("placeholder", text);
    else node.textContent = text;
  };
  doc.querySelectorAll("[data-i18n]").forEach(node => replace(node.getAttribute("data-i18n"), node));
  doc.querySelectorAll("[data-i18n-html]").forEach(node => replace(node.getAttribute("data-i18n-html"), node));
  doc.querySelectorAll("[data-i18n-placeholder]").forEach(node => replace(node.getAttribute("data-i18n-placeholder"), node));
}

function setInput(doc, id, value) { const node = doc.getElementById(id); if (node) node.value = value ?? ""; }
function setText(doc, id, value) { const node = doc.getElementById(id); if (node) node.textContent = value ?? ""; }

async function paintPeople(doc, fixture) {
  const { shareSectionEl } = await import("/shared/js/core/share-sections.js?v=v2026-10-19T12244");

  const received = doc.getElementById("contactsReceived");
  const outgoing = doc.getElementById("contactsOutgoing");
  if (!received || !outgoing) return;
  const friends = els.frame.dataset.sceneId === "friends";
  const language = currentLanguage();
  const labels = language === "en"
    ? { friends: "Friends", outgoing: "Pending and declined", incoming: "Suggestions", declined: "Declined by me", active: "Subscribers", pending: "Pending" }
    : language === "uk"
      ? { friends: "Друзі", outgoing: "Очікують та відхилені", incoming: "Пропозиції", declined: "Відхилені мною", active: "Підписники", pending: "Очікують" }
      : { friends: "Znajomi", outgoing: "Oczekujące i odrzucone", incoming: "Propozycje", declined: "Odrzucone przeze mnie", active: "Subskrybenci", pending: "Oczekujące" };
  const contactRow = (person, index, kind) => ({
    id: `shot-contact-${kind}-${index}`, label: person.name || person.email, compact: true,
    note: friends ? (person.email || "") : "",
    tags: kind === "friends" || kind === "active" ? [] : [{ text: kind === "declined" || person.status === "declined" ? (language === "en" ? "Declined" : language === "uk" ? "Відхилено" : "Odrzucone") : (language === "en" ? "Pending" : language === "uk" ? "Очікує" : "Oczekuje"), cls: "tag--muted" }],
    actions: kind === "incoming"
      ? [{ key: "accept", icon: "check", title: language === "en" ? "Accept" : language === "uk" ? "Прийняти" : "Akceptuj", onClick: () => {} }, { key: "reject", icon: "cancel", title: language === "en" ? "Decline" : language === "uk" ? "Відхилити" : "Odrzuć", onClick: () => {} }]
      : friends && kind === "declined"
        ? [{ key: "undo_reject", icon: "undo", title: language === "en" ? "Restore" : language === "uk" ? "Відновити" : "Przywróć", onClick: () => {} }]
        : [{ key: kind === "outgoing" || person.status === "pending" ? "cancel" : "remove", icon: "trash", title: language === "en" ? "Remove" : language === "uk" ? "Видалити" : "Usuń", onClick: () => {} }],
  });
  if (friends) {
    const groups = fixture.friendGroups || defaultFriendGroups(language);
    outgoing.replaceChildren(shareSectionEl({ key: "outgoing", title: labels.outgoing, rows: (groups.outgoing || []).map((row, index) => contactRow(row, index, "outgoing")) }));
    received.replaceChildren(
      shareSectionEl({ key: "friend", title: labels.friends, rows: (groups.friends || []).map((row, index) => contactRow(row, index, "friends")) }),
      shareSectionEl({ key: "incoming", title: labels.incoming, rows: (groups.incoming || []).map((row, index) => contactRow(row, index, "incoming")) }),
      shareSectionEl({ key: "declined", title: labels.declined, rows: (groups.declined || []).map((row, index) => contactRow(row, index, "declined")), collapsed: true }),
    );
    return;
  }
  outgoing.replaceChildren(shareSectionEl({ key: "pending", title: labels.pending, rows: (fixture.outgoing || []).map((row, index) => contactRow(row, index, row.status === "declined" ? "declined" : "outgoing")) }));
  received.replaceChildren(shareSectionEl({ key: "active", title: labels.active, rows: (fixture.people || []).map((row, index) => contactRow(row, index, "active")) }));
}

async function paintTasks(doc, fixture) {
  const { renderRowSections } = await import("/shared/js/core/share-sections.js?v=v2026-10-19T12244");

  const host = doc.getElementById("tasksHost");
  if (!host) return;
  const rows = fixture.tasks.map((task, index) => ({
    id: `shot-task-${index}`, avatarIcon: "polls", title: task.game,
    note: `${task.state === "done" ? "Oddano głos" : "Oczekuje na głos"} · od Aleksandry Nowak`,
    actions: task.state === "pending" ? [{ key: "vote", text: "Zagłosuj", icon: "polls", gold: true, onClick: () => {} }] : [],
  }));
  renderRowSections(host, [{ key: "sample", title: "Ankiety", rows }]);
}

async function paintPoll(doc, scene, fixture) {
  const main = doc.getElementById("cardMain");
  const empty = doc.getElementById("cardEmpty");
  if (!fixture.poll) {
    if (main) main.style.display = "none";
    if (empty) {
      empty.style.display = "";
      const title = empty.querySelector(".name");
      const meta = empty.querySelector(".meta");
      if (title) title.textContent = currentLanguage() === "en" ? "No open poll" : currentLanguage() === "uk" ? "Немає відкритого опитування" : "Brak otwartej ankiety";
      if (meta) meta.textContent = currentLanguage() === "en" ? "Choose a game opened as a poll in the screenshot settings." : currentLanguage() === "uk" ? "Виберіть гру, відкриту як опитування, у налаштуваннях знімка." : "Wybierz grę otwartą jako ankietę w ustawieniach zrzutu.";
    }
    const bar = doc.getElementById("pollBar"); if (bar) bar.style.display = "none";
    return;
  }
  setText(doc, "pollGameName", fixture.poll);
  if (main) main.style.display = "";
  if (empty) empty.style.display = "none";
  const bar = doc.getElementById("pollBar"); if (bar) { bar.style.display = ""; bar.dataset.state = "open"; }
  setText(doc, "pollStateWord", currentLanguage() === "en" ? "Voting open" : currentLanguage() === "uk" ? "Голосування триває" : "Głosowanie trwa");
  setText(doc, "pollStateInfo", currentLanguage() === "en" ? "18 votes received" : currentLanguage() === "uk" ? "Отримано 18 голосів" : "Oddano 18 głosów");
  setText(doc, "hintTop", fixture.question);
  const invited = fixture.subscribers?.length || 0;
  const responded = fixture.subscriberStates?.filter(Boolean).length || 0;
  setText(doc, "subsSummary", currentLanguage() === "en" ? `${invited} invited · ${responded} responded` : currentLanguage() === "uk" ? `Запрошено: ${invited} · відповіли: ${responded}` : `Zaproszono: ${invited} · odpowiedzi: ${responded}`);
  const shareBody = doc.getElementById("shareBody"); if (shareBody) shareBody.style.display = "";
  const shareEmpty = doc.getElementById("shareEmpty"); if (shareEmpty) shareEmpty.style.display = "none";
  const share = doc.getElementById("secShare"); if (share) share.hidden = scene.id !== "poll-share";
  const results = doc.getElementById("secResults"); if (results) results.hidden = scene.id !== "poll-results";
  const qr = doc.getElementById("qr");
  const qrUrl = config.qrUrl;
  if (qr && qrUrl) {
    try {
      const { default: QRCode } = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm");
      const canvas = doc.createElement("canvas");
      await QRCode.toCanvas(canvas, qrUrl, { width: 180, margin: 1 });
      qr.replaceChildren(canvas);
      qr.hidden = false;
    } catch { qr.replaceChildren(); qr.hidden = true; }
  } else if (qr) { qr.replaceChildren(); qr.hidden = true; }
  const link = doc.getElementById("pollLink"); if (link) link.value = fixture.link || "https://familiada.online/go/weekend-trip";
  for (const id of ["btnCopy", "btnOpen", "btnOpenQr"]) { const button = doc.getElementById(id); if (button) button.disabled = false; }
  const subs = doc.getElementById("subsGrid");
  if (subs) {
    const { shareSectionEl } = await import("/shared/js/core/share-sections.js?v=v2026-10-19T12244");

    subs.replaceChildren(shareSectionEl({ key: "poll-shared", title: "Zaproszeni subskrybenci", rows: fixture.subscribers.map((name, i) => ({ id: `shot-sub-${i}`, label: name, compact: true, note: fixture.subscriberStates?.[i] ? "Oddano głos" : "Oczekuje na odpowiedź", tags: [{ text: "Subskrybent", cls: "tag--muted" }] })) }));
  }
  if (scene.id === "poll-results") {
    const shareTab = doc.getElementById("tabShare"); if (shareTab) shareTab.classList.remove("active");
    const resultTab = doc.getElementById("tabResults"); if (resultTab) resultTab.classList.add("active");
    setText(doc, "resultsMeta", currentLanguage() === "en" ? "18 votes · live results" : currentLanguage() === "uk" ? "18 голосів · результати наживо" : "18 głosów · wyniki na żywo");
    const { createPollResults } = await import("/shared/js/core/poll-results.js?v=v2026-10-19T12244");

    const questions = (fixture.pollQuestions || []).map((question, questionIndex) => ({
      id: `shot-poll-${questionIndex + 1}`, ord: questionIndex + 1, text: question.text,
      answers: question.answers.map((answer, answerIndex) => ({ id: `shot-answer-${questionIndex + 1}-${answerIndex + 1}`, text: answer.text, votes: answer.votes })),
    }));
    createPollResults(doc.getElementById("resultsList")).render({ status: "poll_open", type: "poll_points", questions });
  }
}

async function paintControl(scene, fixture) {
  const doc = els.frame.contentDocument;
  const translation = await import("/shared/translation/translation.js?v=v2026-10-19T12244");
  const restoreLanguage = translation.getUiLang();
  await translation.setUiLang(currentLanguage(), { persist: false, updateUrl: false, apply: false });
  const { createUI } = await import("/control/js/ui.js?v=v2026-10-19T12244");
  const { makeDefaultState } = await import("/shared/js/gameplay/gameStateShape.js?v=v2026-10-19T12244");

  const finale = scene.id === "control-finale";
  const state = makeDefaultState("homepage-visual-fixture");
  state.step = finale ? "f_p1_entry" : "r_play"; state.topCard = finale ? "final" : "rounds"; state.phase = finale ? "FINAL" : "PLAY";
  state.controlTeam = "A"; state.locks = { gameStarted: true, finalActive: finale, gameEnded: false };
  state.teams = { teamA: fixture.teams?.[0] || "Króliczki", teamB: fixture.teams?.[1] || "Zajączki" };
  state.settings.uiLang = currentLanguage(); state.settings.hasFinal = true;
  state.rounds.roundNo = 1; state.rounds.question = { id: "shot-round", text: fixture.question };
  state.rounds.answers = (fixture.answers || []).map((text, i) => ({ id: `shot-a${i}`, ord: i + 1, text, fixed_points: [39,24,16,9,7,5][i] }));
  state.rounds.revealed = fixture.revealed || [1,3]; state.rounds.bankPts = 38; state.rounds.totals = { A: 62, B: 47 }; state.rounds.xA = 1; state.rounds.xB = 0;
  state.final.questions = (fixture.finale || []).map((text, i) => ({ id: `shot-f${i}`, text, answers: [] }));
  state.final.runtime.timer = { running: false, phase: null, endsAt: 0, usedP1: true, usedP2: false };
  state.final.runtime.p1 = (fixture.answers || []).slice(0, 5).map(text => ({ text }));
  try {
    createUI({ root: doc.querySelector("#app"), emit: () => {} }).render(state, { presenceFlags: { display: true, host: true, buzzer: false }, busy: false, typingPending: false, devicesBlocked: false });
  } finally {
    await translation.setUiLang(restoreLanguage, { persist: false, updateUrl: false, apply: false });
  }
}

async function prepareDeviceScene(scene, fixture) {
  if (!deviceReadyPromise) throw new Error("podgląd urządzenia nie zgłosił gotowości");
  let readyTimer;
  await Promise.race([
    deviceReadyPromise,
    new Promise((_, reject) => { readyTimer = setTimeout(() => reject(new Error("urządzenie nie zgłosiło gotowości")), 20000); }),
  ]).finally(() => clearTimeout(readyTimer));
  const win = els.frame.contentWindow;
  const row = {
    rev: 1, step: "r_play", phase: "PLAY", top_card: "rounds", control_team: null,
    detail: { display: scene.id === "main-display"
      ? { mode: "GAME", suppressLogoDraw: true, previewNumbers: { left: fixture.scores?.[0] ?? 111, right: fixture.scores?.[1] ?? 111, top: fixture.bank ?? 999 }, previewXPositions: { A: fixture.revealed || [1,3], B: fixture.revealed || [1,3] } }
      : { mode: "GAME", suppressLogoDraw: true },
      teams: { teamA: fixture.teams?.[0] || "Króliczki", teamB: fixture.teams?.[1] || "Zajączki", defaultA: false, defaultB: false },
      settings: { uiLang: currentLanguage() },
      rounds: { roundNo: 1, question: { text: fixture.question || "TWÓRZ · ŁĄCZ · GRAJ" }, bankPts: fixture.bank || 38,
        totals: { A: fixture.scores?.[0] ?? 62, B: fixture.scores?.[1] ?? 47 }, revealed: fixture.revealed || [1,3], xA: fixture.crosses?.[0] ?? 1, xB: fixture.crosses?.[1] ?? 0,
        answers: (fixture.words || fixture.answers || ["Kanapka","Owoc","Jogurt","Sałatka","Drożdżówka","Baton"]).map((text, i) => ({ ord: i + 1, text, fixed_points: [39,24,16,9,7,5][i] })) }, host: { covered: false } }
  };
  win.postMessage({ type: "familiada:preview-row", row }, location.origin);
  await new Promise(resolve => setTimeout(resolve, 1600));
  const doc = els.frame.contentDocument;
  if (scene.id === "host-round" && !doc.getElementById("paperText1")?.textContent?.includes(fixture.question)) throw new Error("Prowadzący nie wyświetlił pytania z przykładu");
  if (scene.id !== "host-round" && doc.getElementById("gameScreen")?.classList.contains("hidden")) throw new Error("Wyświetlacz nie pokazał planszy z przykładem");
  if (scene.id === "main-display") {
    const doc = els.frame.contentDocument;
    const root = doc.getElementById("displays");
    if (root) root.dataset.fixture = "main-display";
  }
}

async function readConfig() {
  const response = await fetch(`${API}/config/homepage-screenshots`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload.config;
}
async function saveConfig() {
  config.qrUrl = byId("homepageShotQrUrl").value.trim();
  const response = await fetch(`${API}/config/homepage-screenshots`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
}
async function exportConfigJson() {
  if (!await flushAllEditors()) return;
  for (const language of ["pl", "en", "uk"]) ensureResourceData(language);
  await saveConfig();
  const bundle = {
    format: "familiada-screenshots-shared-data",
    version: 2,
    languages: Object.fromEntries(["pl", "en", "uk"].map(language => [language, {
      shared: {
        teams: structuredClone(config.sharedFixtures[language].teams || []).slice(0, 2),
        subscribers: structuredClone(config.sharedFixtures[language].subscribers || []),
        qrUrl: config.qrUrl || "",
      },
      resources: {
        games: structuredClone(config.resourceData[language].filter(item => item.type === "game")),
        bases: structuredClone(config.resourceData[language].filter(item => item.type === "base")),
        logos: structuredClone(config.resourceData[language].filter(item => item.type === "logo")),
      },
      views: {
        fixtures: structuredClone(config.localeFixtures?.[language] || {}),
        selections: structuredClone(config.viewResources?.[language] || {}),
        sectionDefaults: Object.fromEntries(Object.entries(config.sharedFixtures[language] || {}).filter(([key]) => !["teams", "subscribers"].includes(key))),
      },
    }])),
  };
  const content = JSON.stringify(bundle, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `familiada-wspolne-dane-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Wyeksportowano wspólne dane i zasoby wszystkich języków.");
}

async function importConfigJson(file) {
  if (!await flushAllEditors()) return;
  const imported = JSON.parse(await file.text());
  const languages = ["pl", "en", "uk"];
  const validResource = (item, type) => {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.data || typeof item.data !== "object") return false;
    if (type === "game") return item.type === "game" && gameResourceType(item) === "prepared" && Array.isArray(item.data.questions);
    if (type === "base") return item.type === "base" && !!item.data.base && Array.isArray(item.data.categories) && Array.isArray(item.data.questions);
    return item.type === "logo" && logoResourceMode(item) === "DRAW" && !!item.data.payload;
  };
  const valid = imported?.format === "familiada-screenshots-shared-data" && imported.version === 2 && imported.languages
    && languages.every(language => {
      const entry = imported.languages[language];
      return entry?.shared && Array.isArray(entry.shared.teams) && entry.shared.teams.length === 2
        && entry.shared.teams.every(name => typeof name === "string")
        && Array.isArray(entry.shared.subscribers) && entry.shared.subscribers.every(name => typeof name === "string")
        && (entry.shared.qrUrl == null || typeof entry.shared.qrUrl === "string")
        && entry.resources && Array.isArray(entry.resources.games) && entry.resources.games.every(item => validResource(item, "game"))
        && Array.isArray(entry.resources.bases) && entry.resources.bases.every(item => validResource(item, "base"))
        && Array.isArray(entry.resources.logos) && entry.resources.logos.every(item => validResource(item, "logo"))
        && new Set([...entry.resources.games, ...entry.resources.bases, ...entry.resources.logos].map(item => item.id)).size
          === entry.resources.games.length + entry.resources.bases.length + entry.resources.logos.length
        && entry.views && entry.views.fixtures && typeof entry.views.fixtures === "object"
        && entry.views.sectionDefaults && typeof entry.views.sectionDefaults === "object"
        && entry.views.selections && typeof entry.views.selections === "object";
    });
  if (!valid) throw new Error("Plik nie zawiera poprawnego wspólnego JSON-a z zasobami i ustawieniami widoków dla języków PL, EN i UK.");
  const { confirmModal } = await import("/shared/js/core/modal.js?v=v2026-10-19T12244");
  if (!await confirmModal({ text: "Import zastąpi wspólne dane, listy zasobów i dodatkowe dane wszystkich widoków we wszystkich językach. Kontynuować?" })) return;
  config.localeFixtures ||= {};
  config.viewResources ||= {};
  for (const language of languages) {
    const entry = imported.languages[language];
    config.sharedFixtures[language] = {
      ...structuredClone(entry.views.sectionDefaults),
      teams: structuredClone(entry.shared.teams),
      subscribers: structuredClone(entry.shared.subscribers),
    };
    config.resourceData[language] = [
      ...structuredClone(entry.resources.games),
      ...structuredClone(entry.resources.bases),
      ...structuredClone(entry.resources.logos),
    ];
    config.localeFixtures[language] = structuredClone(entry.views.fixtures);
    config.viewResources[language] = structuredClone(entry.views.selections);
  }
  config.qrUrl = String(imported.languages.pl.shared.qrUrl || config.qrUrl || "");
  byId("homepageShotQrUrl").value = config.qrUrl;
  sharedDirty = true;
  updateDirtyIndicators();
  try {
    await saveConfig();
    sharedDirty = false;
    updateDirtyIndicators();
    renderSharedEditor();
    updateEditor();
    setStatus("Zaimportowano wspólne dane, zasoby i ustawienia widoków.");
  } catch (error) {
    setStatus(`Nie udało się zapisać importowanego JSON-a: ${error.message}`);
  }
}
function readEditorIntoConfig() {
  const scene = config.scenes.find(item => item.id === editorSceneId) || currentScene();
  const fixture = JSON.parse(els.fixture.value);
  if (scene.id === "poll-results") fixture.pollVotes = readPollVotes();
  if (scene.id === "tasks") {
    fixture.tasks = (fixture.tasks || []).map((task, index) => ({
      ...task,
      state: byId("homepageShotCategoryActions").querySelector(`[data-task-action-state="${index}"]`)?.value || task.state,
    }));
  }
  for (const key of sharedKeysForScene(scene.id)) delete fixture[key];
  config.localeFixtures ||= {};
  config.localeFixtures[editorLanguage] ||= {};
  config.localeFixtures[editorLanguage][scene.id] = fixture;
  if (scene.id === "poll-share") {
    config.localeFixtures[editorLanguage]["poll-share-actions"] = readPollActions();
  }
  return scene;
}

function readPollActions() {
  return [...byId("homepageShotCategoryActions").querySelectorAll("[data-poll-action-status]")].map(select => ({
    subscriberIndex: Number(select.closest("[data-poll-action-row]").dataset.subscriberIndex), responded: select.value === "yes",
  }));
}

function readPollVotes() {
  const votes = [];
  for (const input of byId("homepageShotCategoryActions").querySelectorAll("[data-poll-vote]")) {
    const questionIndex = Number(input.dataset.questionIndex);
    const answerIndex = Number(input.dataset.answerIndex);
    votes[questionIndex] ||= [];
    votes[questionIndex][answerIndex] = Math.max(0, Number(input.value) || 0);
  }
  return votes;
}

function renderEditorFields(fixture) {
  renderResourceChoices(currentScene());
  els.fields.replaceChildren();
  byId("homepageShotFieldsTitle").textContent = "Dane dodatkowe widoku";
  byId("homepageShotFieldsTitle").hidden = false;
  renderCategoryActions(fixture);
  const scene = currentScene();
  const sharedKeys = new Set(sharedKeysForScene(scene.id));
  for (const [key, value] of Object.entries(fixture)) {
    if (key === "logoFile" || key === "tasks" || (key === "pollVotes" && scene.id === "poll-results") || sharedKeys.has(key) || (key === "game" && resourceChoiceSpec(scene)?.type === "game")) continue;
    const wrapper = document.createElement("div"); wrapper.className = "homepage-shot-field";
    const label = document.createElement("label"); label.textContent = FIELD_LABELS[key] || key; label.htmlFor = `homepage-shot-field-${key}`;
    const input = document.createElement(Array.isArray(value) && value.some(item => item && typeof item === "object") || (value && typeof value === "object") ? "textarea" : typeof value === "boolean" ? "input" : Array.isArray(value) || typeof value === "string" ? (String(value).length > 70 || Array.isArray(value) ? "textarea" : "input") : "input");
    input.id = label.htmlFor; input.dataset.field = key;
    if (input.type !== "checkbox") input.classList.add("inp");
    if (typeof value === "boolean") { input.type = "checkbox"; input.checked = value; }
    else if (Array.isArray(value) && value.some(item => item && typeof item === "object") || (value && typeof value === "object")) input.value = JSON.stringify(value, null, 2);
    else if (Array.isArray(value)) input.value = value.join(value.every(item => typeof item === "number") ? ", " : "\n");
    else input.value = String(value ?? "");
    if (input.tagName === "TEXTAREA") { input.rows = Array.isArray(value) ? Math.min(8, Math.max(3, value.length)) : 4; wrapper.classList.add("homepage-shot-field--wide"); }
    wrapper.append(label, input); els.fields.append(wrapper);
  }
  byId("homepageShotExtraCard").hidden = !els.fields.children.length
    && byId("homepageShotCategoryActions").hidden
    && byId("homepageShotQrToolbar").hidden;
}

function renderCategoryActions(fixture) {
  const root = byId("homepageShotCategoryActions");
  root.replaceChildren();
  const sceneId = currentScene().id;
  const visible = ["poll-share", "poll-results", "tasks"].includes(sceneId);
  root.hidden = !visible;
  if (!visible) return;
  if (sceneId === "tasks") {
    const group = sharedGroup(root, "Stan zadań");
    const rows = document.createElement("div"); rows.className = "homepage-shot-shared-rows";
    (fixture.tasks || []).forEach((task, index) => {
      const row = document.createElement("div"); row.className = "homepage-shot-shared-row homepage-shot-action-row";
      const name = document.createElement("strong"); name.textContent = `Zadanie ${index + 1}`;
      const statusField = document.createElement("label"); statusField.className = "homepage-shot-shared-field";
      const statusLabel = document.createElement("span"); statusLabel.textContent = "Stan";
      const status = document.createElement("select"); status.className = "inp"; status.dataset.taskActionState = String(index);
      for (const [value, label] of [["pending", "Do wykonania"], ["done", "Wykonane"]]) {
        const option = document.createElement("option"); option.value = value; option.textContent = label; status.append(option);
      }
      status.value = task.state === "done" ? "done" : "pending";
      statusField.append(statusLabel, status);
      row.append(name, statusField); rows.append(row);
    });
    group.append(rows);
    return;
  }
  if (sceneId === "poll-results") {
    const resource = selectedResource(sceneId, currentLanguage(), "game");
    if (!canOpenPollResource(resource)) return;
    const questions = resource.data?.questions || [];
    fixture.pollVotes ||= questions.map(question => (question.answers || []).map(() => 0));
    const group = sharedGroup(root, "Głosy w tym podglądzie");
    const note = document.createElement("p"); note.className = "muted homepage-shot-tab-note";
    note.textContent = "Wpisz przykładowe głosy dla odpowiedzi. Są zapisane tylko dla tego widoku.";
    group.append(note);
    questions.forEach((question, questionIndex) => {
      const questionCard = document.createElement("details"); questionCard.className = "homepage-shot-question";
      questionCard.open = questionIndex === 0;
      const summary = document.createElement("summary"); summary.textContent = `${questionIndex + 1}. ${question.text || "Pytanie bez treści"}`;
      const rows = document.createElement("div"); rows.className = "homepage-shot-shared-rows";
      (question.answers || []).forEach((answer, answerIndex) => {
        const row = document.createElement("div"); row.className = "homepage-shot-shared-row homepage-shot-answer-row";
        const label = document.createElement("span"); label.textContent = answer.text || `Odpowiedź ${answerIndex + 1}`;
        const count = document.createElement("label"); count.className = "homepage-shot-shared-field";
        const countLabel = document.createElement("span"); countLabel.textContent = "Głosy";
        const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.step = "1"; input.className = "inp";
        input.dataset.pollVote = ""; input.dataset.questionIndex = String(questionIndex); input.dataset.answerIndex = String(answerIndex);
        input.value = String(fixture.pollVotes?.[questionIndex]?.[answerIndex] ?? 0);
        count.append(countLabel, input); row.append(label, count); rows.append(row);
      });
      questionCard.append(summary, rows); group.append(questionCard);
    });
    return;
  }
  const subscribers = subscriberNames(currentLanguage());
  const group = sharedGroup(root, "Zaproszeni subskrybenci");
  const note = document.createElement("p"); note.className = "muted homepage-shot-tab-note";
  note.textContent = "Osoby są pobrane z listy ogólnej. Tutaj ustawiasz tylko ich udział w tej ankiecie.";
  group.append(note);
  const rows = document.createElement("div"); rows.className = "homepage-shot-shared-rows";
  (fixture.pollRecipients || []).forEach((recipient, index) => {
    const name = subscribers[recipient.subscriberIndex];
    if (!name) return;
    const row = document.createElement("div"); row.className = "homepage-shot-shared-row homepage-shot-action-row";
    row.dataset.pollActionRow = ""; row.dataset.subscriberIndex = String(recipient.subscriberIndex);
    const identity = document.createElement("div"); identity.className = "homepage-shot-shared-field";
    const identityLabel = document.createElement("span"); identityLabel.textContent = `Z listy ogólnej · osoba ${index + 1}`;
    const identityValue = document.createElement("strong"); identityValue.textContent = name;
    identity.append(identityLabel, identityValue);
    const actionField = document.createElement("label"); actionField.className = "homepage-shot-shared-field";
    const actionLabel = document.createElement("span"); actionLabel.textContent = "Akcja w tej ankiecie";
    const action = document.createElement("select"); action.className = "inp"; action.dataset.pollActionStatus = "";
    for (const [value, label] of [["yes", "Oddał głos"], ["no", "Jeszcze nie odpowiedział"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = label; action.append(option);
    }
    action.value = recipient.responded ? "yes" : "no";
    actionField.append(actionLabel, action);
    const remove = sharedButton(document.createElement("span"), "Usuń z ankiety", "remove-poll-recipient", index);
    row.append(identity, actionField, remove); rows.append(row);
  });
  group.append(rows);
  const addRow = document.createElement("div"); addRow.className = "homepage-shot-action-add";
  const selector = document.createElement("select"); selector.className = "inp"; selector.dataset.pollActionAdd = "";
  for (const [index, name] of subscribers.entries()) {
    if ((fixture.pollRecipients || []).some(item => item.subscriberIndex === index)) continue;
    const option = document.createElement("option"); option.value = String(index); option.textContent = name; selector.append(option);
  }
  if (!selector.options.length) { const option = document.createElement("option"); option.value = ""; option.textContent = "Wszystkie osoby z listy już dodane"; selector.append(option); selector.disabled = true; }
  sharedButton(addRow, "Dodaj osobę do ankiety", "add-poll-recipient");
  addRow.querySelector("button").dataset.index = "";
  addRow.prepend(selector); group.append(addRow);
}

function syncFieldsToJson() {
  let fixture;
  try { fixture = JSON.parse(els.fixture.value); }
  catch { setStatus("Najpierw popraw nieprawidłowy JSON w sekcji zaawansowanej."); return; }
  for (const input of els.fields.querySelectorAll("[data-field]")) {
    const key = input.dataset.field;
    const prior = fixture[key];
    if (input.type === "checkbox") fixture[key] = input.checked;
    else if (Array.isArray(prior)) {
      const parts = input.value.split(Array.isArray(prior) && prior.every(item => typeof item === "number") ? /[,\n]/ : /\n/).map(value => value.trim()).filter(Boolean);
      if (prior.some(item => item && typeof item === "object")) {
        try { fixture[key] = JSON.parse(input.value); } catch { setStatus(`Sprawdź format pola „${FIELD_LABELS[key] || key}”.`); return; }
      } else if (prior.every(item => typeof item === "number")) fixture[key] = parts.map(Number).filter(Number.isFinite);
      else fixture[key] = parts;
    } else if (prior && typeof prior === "object") {
      try { fixture[key] = JSON.parse(input.value); } catch { setStatus(`Sprawdź format pola „${FIELD_LABELS[key] || key}”.`); return; }
    } else if (typeof prior === "number") fixture[key] = Number(input.value) || 0;
    else fixture[key] = input.value;
  }
  els.fixture.value = JSON.stringify(fixture, null, 2);
  scheduleFixtureSave();
}

function scheduleFixtureSave() {
  dirty = true;
  updateDirtyIndicators();
  setStatus("Zapiszę zmiany po chwili…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flushEditor(); }, 700);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    try {
      const fixture = JSON.parse(els.fixture.value);
      await applyFixtureToFrame(currentScene(), fixture);
    } catch (error) {
      if (error instanceof SyntaxError) setStatus("Popraw format danych, aby odświeżyć podgląd.");
      else setStatus(`Nie udało się odświeżyć podglądu: ${error.message}`);
    }
  }, 350);
}

async function flushEditor() {
  if (!dirty) return true;
  try {
    readEditorIntoConfig();
    await saveConfig();
    dirty = false;
    updateDirtyIndicators();
    setStatus("Przykłady zapisane.");
    return true;
  } catch (error) {
    setStatus(`Nie zapisano zmian: ${error.message}`);
    return false;
  }
}

async function flushSharedEditor() {
  if (!sharedDirty) return true;
  try {
    readResourceList(sharedEditorLanguage);
    await saveConfig();
    sharedDirty = false;
    updateDirtyIndicators();
    renderSharedEditor();
    renderEditorFields(langFixture(currentScene()));
    await loadScenePreview(currentScene(), true);
    return true;
  }
  catch (error) { setStatus(`Nie udało się zapisać wspólnych danych: ${error.message}`); return false; }
}

function newResourceId() {
  return globalThis.crypto?.randomUUID?.() || `resource-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function importResourceFile(file, type) {
  const data = JSON.parse(await file.text());
  let resource;
  if (type === "game") {
    if (!data?.game || !Array.isArray(data.questions)) throw new Error("Plik nie zawiera eksportu gry.");
    if (!["prepared", "fixed"].includes(data.game.type)) throw new Error("Można wczytać tylko grę preparowaną.");
    if (data.game.type === "fixed") data.game.type = "prepared";
    data.questions = data.questions.map(question => ({
      ...question,
      text: String(question.text || ""),
      answers: (question.answers || []).map(answer => ({ ...answer, text: String(answer.text || ""), fixed_points: Number(answer.fixed_points ?? answer.points) || 0 })),
    }));
    resource = { id: newResourceId(), type, name: data.game.name || file.name.replace(/\.famgame$/i, ""), data, openPoll: false };
  } else if (type === "base") {
    if (!data?.base || !Array.isArray(data.questions) || !Array.isArray(data.categories)) throw new Error("Plik nie zawiera eksportu bazy pytań.");
    resource = { id: newResourceId(), type, name: data.base.name || file.name.replace(/\.fambase$/i, ""), data };
  } else {
    if (!(data?.kind === "PIX" || data?.type === "PIX_150x70") || !data?.payload) throw new Error("Można wczytać tylko eksport logo rysunkowego.");
    if (logoModeFromData(data) !== "DRAW") throw new Error("Można wczytać tylko logo z rysowaniem.");
    resource = { id: newResourceId(), type, name: data.name || file.name.replace(/\.famlogo$/i, ""), data };
  }
  const language = currentLanguage();
  const resources = ensureResourceData(language);
  resources.push(resource);
  const scenes = type === "game" ? ["games"] : type === "base" ? ["bases"] : ["logos"];
  for (const sceneId of scenes) {
    const selection = config.viewResources[language][sceneId] ||= { resourceIds: [] };
    selection.resourceIds ||= [];
    selection.resourceIds.push(resource.id);
  }
  sharedDirty = true;
  updateDirtyIndicators();
  renderResourceList(language);
  renderEditorFields(langFixture(currentScene()));
  await flushSharedEditor();
  setStatus(`${resource.name} dodano do listy zasobów.`);
}

async function handleResourceImportInput(event, type) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (!await flushEditor() || !await flushSharedEditor()) return;
    await importResourceFile(file, type);
  } catch (error) {
    setStatus(`Nie udało się wczytać zasobu: ${error.message}`);
  } finally {
    input.value = "";
  }
}

async function flushAllEditors() {
  if (!await flushEditor()) return false;
  return flushSharedEditor();
}

async function captureScene(scene) {
  if (scene.id !== currentScene().id) {
    els.scene.value = scene.id;
    updateEditor();
  }
  await loadScenePreview(scene, true);
  await new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (els.frame.contentDocument?.readyState === "complete" && els.frame.contentDocument.body?.dataset.fixtureReady === "true") return resolve();
      if (Date.now() - started > 20000) return reject(new Error("podgląd nie osiągnął gotowości"));
      setTimeout(check, 120);
    };
    check();
  });
  const previewDoc = els.frame.contentDocument;
  await Promise.race([previewDoc.fonts?.ready || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 6000))]);
  await Promise.all(Array.from(previewDoc.images || []).map(image => image.decode?.().catch(() => {}) || Promise.resolve()));
  const { toCanvas } = await import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/+esm");
  let canvas = await toCanvas(previewDoc.documentElement, { width: scene.width, height: scene.height, pixelRatio: 1, backgroundColor: "#050914", cacheBust: true });
  if (scene.id === "poll-vote-mobile") canvas = composeIPhoneFrame(canvas);
  let image = canvas.toDataURL("image/webp", 0.88);
  if (!image.startsWith("data:image/webp")) image = canvas.toDataURL("image/png");
  const mimeType = image.slice(5, image.indexOf(";"));
  const response = await fetch(`${API}/screenshots/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: currentLanguage(), id: scene.id, mimeType, data: image.split(",")[1] }) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  config.images ||= {};
  config.images[currentLanguage()] ||= {};
  config.images[currentLanguage()][scene.id] = payload.url;
  await saveConfig();
  return payload;
}

function composeIPhoneFrame(screenCanvas) {
  const bezel = 8;
  const border = 2;
  const margin = 4;
  const radius = 42;
  const output = document.createElement("canvas");
  output.width = screenCanvas.width + bezel * 2 + border * 2 + margin;
  output.height = screenCanvas.height + bezel * 2 + border * 2 + margin;
  const ctx = output.getContext("2d");
  ctx.fillStyle = "#10131a";
  ctx.fillRect(0, 0, output.width, output.height);

  const deviceX = margin / 2;
  const deviceY = margin / 2;
  const deviceW = output.width - margin;
  const deviceH = output.height - margin;
  ctx.save();
  ctx.shadowColor = "#000b";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 12;
  roundedRect(ctx, deviceX, deviceY, deviceW, deviceH, radius + bezel);
  ctx.fillStyle = "#030407";
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, deviceX + 1, deviceY + 1, deviceW - 2, deviceH - 2, radius + bezel - 1);
  ctx.strokeStyle = "#30343d";
  ctx.lineWidth = 2;
  ctx.stroke();

  const screenX = margin / 2 + border + bezel;
  const screenY = margin / 2 + border + bezel;
  ctx.save();
  roundedRect(ctx, screenX, screenY, screenCanvas.width, screenCanvas.height, radius);
  ctx.clip();
  ctx.drawImage(screenCanvas, screenX, screenY);

  const notchWidth = screenCanvas.width * 0.323;
  const notchHeight = screenCanvas.height * 0.0427;
  const notchX = screenX + (screenCanvas.width - notchWidth) / 2;
  ctx.beginPath();
  ctx.moveTo(notchX, screenY);
  ctx.lineTo(notchX + notchWidth, screenY);
  ctx.lineTo(notchX + notchWidth, screenY + notchHeight - 22);
  ctx.quadraticCurveTo(notchX + notchWidth, screenY + notchHeight, notchX + notchWidth - 22, screenY + notchHeight);
  ctx.lineTo(notchX + 22, screenY + notchHeight);
  ctx.quadraticCurveTo(notchX, screenY + notchHeight, notchX, screenY + notchHeight - 22);
  ctx.closePath();
  ctx.fillStyle = "#030407";
  ctx.fill();
  ctx.fillStyle = "#111318";
  ctx.beginPath();
  ctx.roundRect(notchX + notchWidth * 0.72, screenY + notchHeight * 0.34, notchWidth * 0.15, notchHeight * 0.15, 5);
  ctx.fill();
  ctx.fillStyle = "#08090c";
  ctx.beginPath();
  ctx.arc(notchX + notchWidth * 0.72 - 28, screenY + notchHeight * 0.34 + notchHeight * 0.075, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffffa8";
  ctx.beginPath();
  ctx.roundRect(screenX + (screenCanvas.width - 92) / 2, screenY + screenCanvas.height - 11, 92, 4, 99);
  ctx.fill();
  ctx.restore();
  return output;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function captureMany(scenes) {
  els.results.replaceChildren();
  readEditorIntoConfig();
  await saveConfig();
  let good = 0;
  for (const scene of scenes) {
    const row = document.createElement("div"); row.className = "homepage-shot-result"; row.textContent = `${scene.title} · wczytywanie`;
    els.results.append(row);
    try {
      await captureScene(scene);
      row.dataset.state = "ok"; row.textContent = `${scene.title} · gotowe`;
      good += 1;
    } catch (error) {
      row.dataset.state = "error"; row.textContent = `${scene.title} · ${error.message}`;
    }
  }
  await saveConfig().catch(() => {});
  setStatus(`Gotowe: ${good} z ${scenes.length} zrzutów.`);
}

export async function initHomepageScreenshots() {
  if (initialized) { await loadScenePreview(); return; }
  els.language = byId("homepageShotLanguage"); els.scene = byId("homepageShotScene");
  els.fixture = byId("homepageShotFixture"); els.frame = byId("homepageShotFrame");
  els.fields = byId("homepageShotFields");
  els.frameWrap = byId("homepageShotFrameWrap");
  els.title = byId("homepageShotPreviewTitle"); els.status = byId("homepageShotStatus"); els.results = byId("homepageShotResults");
  previewResizeObserver = new ResizeObserver(() => {
    if (byId("homepageShotCategoryPanel").hidden) return;
    void loadScenePreview();
  });
  previewResizeObserver.observe(els.frame.closest(".homepage-shot-preview"));
  try {
    config = await readConfig();
    config.scenes = Array.isArray(config.scenes) ? config.scenes : [];
    let initializeSharedFixtures = false;
    config.sharedFixtures ||= {};
    for (const language of ["pl", "en", "uk"]) {
      const defaults = defaultSharedFixture(language);
      const legacyPollActions = config.sharedFixtures[language]?.pollRecipients;
      if (!config.sharedFixtures[language]) initializeSharedFixtures = true;
      const normalized = normalizeSharedFixture(config.sharedFixtures[language] || {}, defaults);
      if (JSON.stringify(normalized) !== JSON.stringify(config.sharedFixtures[language] || {})) initializeSharedFixtures = true;
      config.sharedFixtures[language] = normalized;
      config.localeFixtures ||= {};
      config.localeFixtures[language] ||= {};
      if (!Array.isArray(config.localeFixtures[language]["poll-share-actions"])) {
        config.localeFixtures[language]["poll-share-actions"] = Array.isArray(legacyPollActions)
          ? legacyPollActions.map(recipient => ({ subscriberIndex: Number(recipient.subscriberIndex) || 0, responded: !!recipient.responded }))
          : normalized.subscribers.map((_, index) => ({ subscriberIndex: index, responded: index === 0 }));
        initializeSharedFixtures = true;
      }
      const friendsScene = config.scenes.find(scene => scene.id === "friends");
      const friendsFixture = config.localeFixtures[language].friends || localizeFixture(friendsScene?.fixture || {}, language);
      if (!friendsFixture.friendGroups) { friendsFixture.friendGroups = defaultFriendGroups(language); initializeSharedFixtures = true; }
      config.localeFixtures[language].friends = friendsFixture;
      const subscribersScene = config.scenes.find(scene => scene.id === "subscribers");
      const subscribersFixture = config.localeFixtures[language].subscribers || localizeFixture(subscribersScene?.fixture || {}, language);
      if (!subscribersFixture.outgoing) { subscribersFixture.outgoing = defaultSubscriberInvitations(language); initializeSharedFixtures = true; }
      config.localeFixtures[language].subscribers = subscribersFixture;
      // Wspólne wartości przechowujemy wyłącznie w sekcji wspólnej; stare kopie widoków usuwamy.
      for (const scene of config.scenes) {
        const fixture = config.localeFixtures[language][scene.id];
        if (!fixture || typeof fixture !== "object") continue;
        for (const key of sharedKeysForScene(scene.id)) {
          if (!Object.hasOwn(fixture, key)) continue;
          delete fixture[key];
          initializeSharedFixtures = true;
        }
      }
    }
    config.resourceData ||= {};
    config.viewResources ||= {};
    for (const language of ["pl", "en", "uk"]) {
      const hadResources = Array.isArray(config.resourceData[language]);
      const oldResourceCount = hadResources ? config.resourceData[language].length : null;
      const hadViews = !!config.viewResources[language];
      const hadLegacyLists = Array.isArray(config.resourceData[language]) && config.resourceData[language].some(item => ["teams", "subscribers"].includes(item.type));
      const resources = ensureResourceData(language);
      if (!hadResources || !hadViews || hadLegacyLists || oldResourceCount !== resources.length) initializeSharedFixtures = true;
    }
    if (Number(config.resourcePoolResetVersion) < 2) {
      for (const language of ["pl", "en", "uk"]) ensureResourceData(language);
      config.resourcePoolResetVersion = 2;
      initializeSharedFixtures = true;
    }
    byId("homepageShotQrUrl").value = config.qrUrl || "";
    if (initializeSharedFixtures) await saveConfig();
    renderSceneList();
    const { initUiSelect } = await import("/shared/js/core/ui-select.js?v=v2026-10-19T12244");
    initUiSelectFn = initUiSelect;

    const languageSelect = byId("homepageShotLanguageSelect");
    const sceneSelect = byId("homepageShotSceneSelect");
    document.querySelectorAll("[data-shot-tab]").forEach(tab => tab.addEventListener("click", async () => {
      if (!await flushAllEditors()) return;
      selectScreenshotTab(tab.dataset.shotTab);
    }));
    languageSelectUI = initUiSelect(languageSelect, {
      options: [...els.language.options].map(option => ({
        value: option.value,
        label: option.textContent,
        icon: ({ pl: "flag-pl", en: "lang-en", uk: "flag-ua" })[option.value],
      })),
      value: els.language.value,
      onChange: value => { els.language.value = value; els.language.dispatchEvent(new Event("change")); },
    });
    sceneSelectUI = initUiSelect(sceneSelect, {
      options: config.scenes.map(scene => ({ value: scene.id, label: scene.title })),
      value: els.scene.value,
      onChange: value => { els.scene.value = value; els.scene.dispatchEvent(new Event("change")); },
    });
    setStatus("");
    els.scene.addEventListener("change", async () => {
      if (!await flushAllEditors()) { els.scene.value = editorSceneId; sceneSelectUI?.setValue(editorSceneId, { silent: true }); return; }
      updateEditor();
    });
    els.language.addEventListener("change", async () => {
      if (!await flushAllEditors()) { els.language.value = editorLanguage; languageSelectUI?.setValue(editorLanguage, { silent: true }); return; }
      updateEditor();
    });
    els.fixture.addEventListener("input", scheduleFixtureSave);
    els.fields.addEventListener("input", syncFieldsToJson);
    byId("homepageShotQrUrl").addEventListener("change", async () => {
      config.qrUrl = byId("homepageShotQrUrl").value.trim();
      dirty = true;
      updateDirtyIndicators();
      try {
        await saveConfig();
        dirty = false;
        updateDirtyIndicators();
        if (currentScene().id === "poll-share") await loadScenePreview(currentScene(), true);
      } catch (error) { setStatus(`Nie udało się zapisać linku QR: ${error.message}`); }
    });
    byId("homepageShotSaveShared").addEventListener("click", async () => {
      if (!await flushEditor() || !await flushSharedEditor()) return;
      renderEditorFields(langFixture(currentScene()));
      await loadScenePreview(currentScene(), true);
      setStatus("Dane wspólne zapisane.");
    });
    byId("homepageShotImportGame").addEventListener("change", event => handleResourceImportInput(event, "game"));
    byId("homepageShotImportBase").addEventListener("change", event => handleResourceImportInput(event, "base"));
    byId("homepageShotImportLogo").addEventListener("change", event => handleResourceImportInput(event, "logo"));
    byId("homepageShotExportConfig").addEventListener("click", async () => {
      try { await exportConfigJson(); }
      catch (error) { setStatus(`Nie udało się wyeksportować wspólnego JSON-a: ${error.message}`); }
    });
    byId("homepageShotImportConfig").addEventListener("change", async event => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      try { await importConfigJson(file); }
      catch (error) { setStatus(`Nie udało się zaimportować wspólnego JSON-a: ${error.message}`); }
      finally { input.value = ""; }
    });
    byId("homepageShotResourceList").addEventListener("click", async event => {
      const button = event.target.closest("[data-remove-resource]");
      if (!button) return;
      if (!await flushSharedEditor()) return;
      const language = sharedEditorLanguage;
      const id = button.dataset.removeResource;
      config.resourceData[language] = (config.resourceData[language] || []).filter(item => item.id !== id);
      const views = config.viewResources?.[language] || {};
      for (const selection of Object.values(views)) {
        if (selection.resourceId === id) selection.resourceId = "";
        if (Array.isArray(selection.resourceIds)) selection.resourceIds = selection.resourceIds.filter(value => value !== id);
      }
      sharedDirty = true;
      updateDirtyIndicators();
      try {
        await saveConfig();
        sharedDirty = false;
        updateDirtyIndicators();
        renderResourceList(language);
        updateEditor();
        setStatus("Zasób usunięty z listy.");
      } catch (error) { setStatus(`Nie udało się usunąć zasobu: ${error.message}`); }
    });
    byId("homepageShotResourceChoiceFields").addEventListener("change", async event => {
      const input = event.target;
      if (!(input.matches("[data-resource-selection]") || input.matches("[data-resource-include]"))) return;
      if (!await flushEditor() || !await flushSharedEditor()) return;
      const language = currentLanguage();
      const scene = currentScene();
      const selection = config.viewResources[language][scene.id] ||= {};
      if (input.matches("[data-resource-selection]")) {
        const key = input.dataset.resourceSelection;
        selection[key] = key === "questionIndex" ? Number(input.value) : input.value;
        if (key === "resourceId") selection.questionIndex = 0;
      } else {
        const id = input.dataset.resourceInclude;
        const ids = selection.resourceIds || (selection.resourceIds = []);
        if (input.checked && !ids.includes(id)) ids.push(id);
        if (!input.checked) selection.resourceIds = ids.filter(value => value !== id);
        if (scene.id === "games") {
          const order = selection.resourceOrder || (selection.resourceOrder = resources.map(item => item.id));
          selection.resourceIds = order.filter(value => selection.resourceIds.includes(value));
          selection.resourceId = selection.resourceIds[0] || "";
        }
      }
      dirty = true;
      updateDirtyIndicators();
      try {
        await saveConfig();
        dirty = false;
        updateDirtyIndicators();
        updateEditor();
      } catch (error) { setStatus(`Nie udało się zapisać wyboru zasobów: ${error.message}`); }
    });
    byId("homepageShotResourceChoiceFields").addEventListener("click", async event => {
      const button = event.target.closest('[data-shared-action="resource-up"], [data-shared-action="resource-down"]');
      if (!button) return;
      const selection = config.viewResources[currentLanguage()][currentScene().id];
      const isGames = currentScene().id === "games";
      const ids = isGames ? (selection?.resourceOrder || []) : (selection?.resourceIds || []);
      const index = Number(button.dataset.index);
      const target = index + (button.dataset.sharedAction === "resource-up" ? -1 : 1);
      if (target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      if (isGames) selection.resourceId = ids.find(id => (selection.resourceIds || []).includes(id)) || "";
      dirty = true;
      updateDirtyIndicators();
      try {
        await saveConfig();
        dirty = false;
        updateDirtyIndicators();
        updateEditor();
      } catch (error) { setStatus(`Nie udało się zapisać kolejności zasobów: ${error.message}`); }
    });
    byId("homepageShotSharedFields").addEventListener("input", () => {
      sharedDirty = true;
      updateDirtyIndicators();
      setStatus("Wspólne dane zmienione — zapisz albo przejdź dalej, aby je zachować.");
    });
    byId("homepageShotSharedFields").addEventListener("change", () => { sharedDirty = true; updateDirtyIndicators(); });
    byId("homepageShotSharedFields").addEventListener("click", event => {
      const button = event.target.closest("[data-shared-action]");
      if (!button) return;
      const shared = readSharedEditor();
      const index = Number(button.dataset.index);
      switch (button.dataset.sharedAction) {
        case "add-other-game": shared.otherGames.push("Nowa gra"); break;
        case "remove-other-game": shared.otherGames.splice(index, 1); break;
        case "add-question": shared.gameQuestions.push({ text: "Nowe pytanie", answers: [] }); break;
        case "remove-question": shared.gameQuestions.splice(index, 1); break;
        case "add-game-answer": shared.gameQuestions[index]?.answers.push({ text: "Nowa odpowiedź", points: 0 }); break;
        case "remove-game-answer": {
          const answerIndex = Number(button.closest(".homepage-shot-shared-row").dataset.answerIndex);
          shared.gameQuestions[index]?.answers.splice(answerIndex, 1); break;
        }
        case "add-poll-question": shared.pollQuestions.push({ text: "Nowe pytanie ankiety", answers: [] }); break;
        case "remove-poll-question": shared.pollQuestions.splice(index, 1); break;
        case "add-poll-answer": shared.pollQuestions[index]?.answers.push({ text: "Nowa odpowiedź", votes: 0 }); break;
        case "remove-poll-answer": {
          const answerIndex = Number(button.closest(".homepage-shot-shared-row").dataset.pollAnswerIndex);
          shared.pollQuestions[index]?.answers.splice(answerIndex, 1); break;
        }
        case "add-subscriber": shared.subscribers.push("Nowy subskrybent"); break;
        case "remove-subscriber":
          shared.subscribers.splice(index, 1);
          config.localeFixtures[sharedEditorLanguage]["poll-share-actions"] = (config.localeFixtures[sharedEditorLanguage]["poll-share-actions"] || []).filter(recipient => recipient.subscriberIndex !== index).map(recipient => ({ ...recipient, subscriberIndex: recipient.subscriberIndex > index ? recipient.subscriberIndex - 1 : recipient.subscriberIndex }));
          break;
        default: return;
      }
      renderSharedEditor(shared);
      sharedDirty = true;
      updateDirtyIndicators();
      setStatus("Wspólne dane zmienione — zapisz albo przejdź dalej, aby je zachować.");
    });
    byId("homepageShotCategoryActions").addEventListener("change", event => {
      if (event.target.matches("[data-poll-action-status]")) {
        config.localeFixtures[currentLanguage()]["poll-share-actions"] = readPollActions();
        els.fixture.value = JSON.stringify(langFixture(currentScene()), null, 2);
        scheduleFixtureSave();
      } else if (event.target.matches("[data-poll-vote]")) {
        const fixture = JSON.parse(els.fixture.value);
        fixture.pollVotes = readPollVotes();
        els.fixture.value = JSON.stringify(fixture, null, 2);
        scheduleFixtureSave();
      } else if (event.target.matches("[data-task-action-state]")) {
        const fixture = JSON.parse(els.fixture.value);
        const index = Number(event.target.dataset.taskActionState);
        if (fixture.tasks?.[index]) fixture.tasks[index].state = event.target.value;
        els.fixture.value = JSON.stringify(fixture, null, 2);
        scheduleFixtureSave();
      }
    });
    byId("homepageShotCategoryActions").addEventListener("click", event => {
      const button = event.target.closest("[data-shared-action]");
      if (!button) return;
      const fixture = langFixture(currentScene());
      if (button.dataset.sharedAction === "add-poll-recipient") {
        const select = byId("homepageShotCategoryActions").querySelector("[data-poll-action-add]");
        if (!select || select.disabled || select.value === "") return;
        fixture.pollRecipients.push({ subscriberIndex: Number(select.value), responded: false });
      } else if (button.dataset.sharedAction === "remove-poll-recipient") {
        fixture.pollRecipients.splice(Number(button.dataset.index), 1);
      } else return;
      config.localeFixtures[currentLanguage()]["poll-share-actions"] = fixture.pollRecipients;
      renderEditorFields(fixture);
      els.fixture.value = JSON.stringify(langFixture(currentScene()), null, 2);
      dirty = true;
      scheduleFixtureSave();
    });
    byId("homepageShotPrevious").addEventListener("click", () => moveScene(-1));
    byId("homepageShotNext").addEventListener("click", () => moveScene(1));
    byId("homepageShotSave").addEventListener("click", async () => {
      try { if (!await flushAllEditors()) return; selectScreenshotTab("category"); readEditorIntoConfig(); await saveConfig(); dirty = false; updateDirtyIndicators(); await loadScenePreview(); setStatus("Przykłady zapisane."); }
      catch (error) { setStatus(`Nie udało się zapisać: ${error.message}`); }
    });
    byId("homepageShotCaptureOne").addEventListener("click", async () => {
      try { if (!await flushAllEditors()) return; selectScreenshotTab("category"); readEditorIntoConfig(); await saveConfig(); setStatus("Przygotowuję zrzut…"); await captureMany([currentScene()]); }
      catch (error) { setStatus(`Nie udało się zrobić zrzutu: ${error.message}`); }
    });
    byId("homepageShotCaptureAll").addEventListener("click", async () => {
      try { if (!await flushAllEditors()) return; selectScreenshotTab("category"); readEditorIntoConfig(); await saveConfig(); setStatus("Odświeżam zrzuty po kolei…"); await captureMany(config.scenes); }
      catch (error) { setStatus(`Nie udało się rozpocząć: ${error.message}`); }
    });
    updateEditor();
    initialized = true;
  } catch (error) {
    setStatus(`Nie udało się wczytać przykładów: ${error.message}`);
  }
}

async function moveScene(delta) {
  if (!await flushAllEditors()) return;
  const index = config.scenes.findIndex(scene => scene.id === els.scene.value);
  const next = (index + delta + config.scenes.length) % config.scenes.length;
  els.scene.value = config.scenes[next].id;
  sceneSelectUI?.setValue(els.scene.value, { silent: true });
  updateEditor();
}
