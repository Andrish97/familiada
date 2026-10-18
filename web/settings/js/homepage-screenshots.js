const API = "/_admin_api";
const els = {};
let config = null;
let initialized = false;
let dirty = false;
let lastFrameKey = "";
let deviceReadyPromise = null;
let deviceReadyResolve = null;
let editorSceneId = "";
let editorLanguage = "pl";
let saveTimer = 0;
let previewTimer = 0;
let languageSelectUI = null;
let sceneSelectUI = null;
const FIELD_LABELS = {
  game: "Nazwa gry", games: "Gry na liście", question: "Pytanie", answers: "Odpowiedzi i wyniki",
  points: "Punkty odpowiedzi", bases: "Bazy na liście", base: "Nazwa bazy", folders: "Foldery bazy",
  questions: "Wpisy bazy", people: "Znajomi lub subskrybenci", tasks: "Zadania", poll: "Nazwa ankiety",
  question: "Pytanie ankiety", subscribers: "Zaproszeni subskrybenci", link: "Link do ankiety",
  teams: "Nazwy drużyn", revealed: "Odsłonięte odpowiedzi (numery)",
  scores: "Wyniki drużyn", crosses: "Iksy drużyn", bank: "Punkty na planszy", finale: "Pytania finału",
  logos: "Logo na liście", logo: "Nazwa logo", words: "Hasła na planszy",
};

function byId(id) { return document.getElementById(id); }
function currentLanguage() { return byId("homepageShotLanguage").value; }
function currentScene() { return config.scenes.find(scene => scene.id === byId("homepageShotScene").value) || config.scenes[0]; }
function langFixture(scene, language = currentLanguage()) {
  const override = config.localeFixtures?.[language]?.[scene.id];
  return structuredClone(override || localizeFixture(scene.fixture || {}, language));
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
  languageSelectUI?.setValue(currentLanguage(), { silent: true });
  sceneSelectUI?.setValue(scene.id, { silent: true });
  editorSceneId = scene.id;
  editorLanguage = currentLanguage();
  els.title.textContent = `${scene.title} · ${scene.width}×${scene.height}`;
  els.fixture.value = JSON.stringify(langFixture(scene), null, 2);
  renderEditorFields(langFixture(scene));
  dirty = false;
  loadScenePreview(scene);
}

async function loadScenePreview(scene = currentScene(), force = false) {
  const language = currentLanguage();
  const key = `${language}/${scene.id}`;
  if (!force && key === lastFrameKey && els.frame.contentDocument?.readyState === "complete") {
    await applyFixtureToFrame(scene, langFixture(scene, language));
    return;
  }
  lastFrameKey = key;
  const dynamicPreview = ["host-round", "display-round", "main-display"].includes(scene.id);
  if (dynamicPreview) {
    deviceReadyPromise = new Promise(resolve => { deviceReadyResolve = resolve; });
  }
  els.frame.setAttribute("sandbox", dynamicPreview ? "allow-scripts allow-same-origin" : "allow-same-origin");
  els.frame.style.width = `${scene.width}px`;
  els.frame.style.aspectRatio = `${scene.width} / ${scene.height}`;
  els.frame.style.height = `${scene.height}px`;
  const scale = Math.min(1, (els.frame.closest(".homepage-shot-preview").clientWidth - 2) / scene.width);
  els.frame.style.transform = `scale(${scale})`;
  els.frame.style.transformOrigin = "top left";
  els.frameWrap.style.width = `${Math.round(scene.width * scale)}px`;
  els.frameWrap.style.height = `${Math.round(scene.height * scale)}px`;
  els.frame.dataset.sceneId = scene.id;
  els.frame.onload = async () => {
    try {
      await waitForFrameReady(els.frame, 12000);
      await applyFixtureToFrame(scene, langFixture(scene, language));
    } catch (error) {
      setStatus(`Nie udało się przygotować podglądu „${scene.title}”: ${error.message}`);
    }
  };
  els.frame.src = viewPath(scene, language);
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
  const { icon, iconText, hydrateIcons } = await import("/shared/js/core/icons.js?v=v2026-10-18T21281");
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
      const { setTopbarNavPriority } = await import("/shared/js/core/topbar-controller.js?v=v2026-10-18T21281");
      const nav = setTopbarNavPriority({ moreEl: more, moreDropdownEl: moreDropdown });
      nav.recalc();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    for (const id of ["btnPlay", "btnSettings", "btnEdit", "btnPreview", "btnDuplicate", "btnExport", "btnExportBase", "btnImport", "btnSendCopy"]) {
      const button = doc.getElementById(id); if (button) button.disabled = false;
    }
    const pollButton = doc.getElementById("btnPoll"); if (pollButton) pollButton.disabled = true;
    doc.querySelectorAll(".tab-label").forEach(button => button.classList.toggle("active", button.id === "tabPrepared"));
    const names = fixture.games || [];
    if (grid) grid.innerHTML = `<div class="addCard"><div class="plus">${icon("plus")}</div><div class="txt">${language === "en" ? "New game" : language === "uk" ? "Нова гра" : "Nowa gra"}</div></div>${names.map((name, i) => `<div class="card tile ${i === 0 ? "selected" : ""}" data-status="${i === 0 ? "ready" : "draft"}" data-updated="2026-10-${String(18 - i).padStart(2, "0")}T12:00:00Z"><div class="x">${icon("trash")}</div><div class="name">${escapeHtml(name)}</div><div class="tileTags"><span class="tag ${i === 0 ? "tag--ok" : "tag--muted"}">${i === 0 ? words.ready : words.draft}</span></div></div>`).join("")}`;
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
    const localizedQuestions = language === "en" ? [
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
    const questions = [
      { text: fixture.question, answers: (fixture.answers || []).map((text, i) => ({ text, points: fixture.points?.[i] ?? 0 })) },
      ...localizedQuestions.map(([text, answers, points]) => ({ text, answers: answers.map((answer, i) => ({ text: answer, points: points[i] })) })),
    ];
    if (qList) {
      const addTileLabel = language === "en" ? "Add question" : language === "uk" ? "Додати запитання" : "Dodaj pytanie";
      const addTileHint = language === "en" ? "At least 10 questions" : language === "uk" ? "Додай щонайменше 10 запитань" : "Dodaj co najmniej 10 pytań";
      const addTile = `<button type="button" class="qcard addTile"><div class="plus">${icon("plus")}</div><div class="txt">${addTileLabel}</div><div class="sub">${addTileHint}</div></button>`;
      qList.innerHTML = addTile + questions.map((question, i) => {
        const answers = question.answers;
        const sum = answers.reduce((total, answer) => total + (Number(answer.points) || 0), 0);
        const valid = question.text.trim().length > 0 && answers.length >= 3 && answers.length <= 6
          && answers.every(answer => answer.text.trim().length > 0) && sum <= 100;
        const status = valid ? "good" : "bad";
        const meta = language === "en" ? `${answers.length}/6 answers · ${sum}/100 pts`
          : language === "uk" ? `${answers.length}/6 відповідей · ${sum}/100 балів`
            : `${answers.length}/6 odpowiedzi · ${sum}/100 pkt`;
        return `<div class="qcard ${status} ${i === 0 ? "active" : ""}" data-id="shot-question-${i + 1}"><div class="qord">${language === "en" ? "Question" : language === "uk" ? "Запитання" : "Pytanie"} ${i + 1}</div><div class="qprev">${escapeHtml(question.text)}</div><div class="qmeta">${meta}</div><button type="button" class="x" aria-label="${language === "en" ? "Delete" : language === "uk" ? "Видалити" : "Usuń"}">${icon("trash")}</button></div>`;
      }).join("");
    }
    const answers = doc.getElementById("aList");
    const selectedAnswers = questions[0].answers;
    const totalPoints = selectedAnswers.reduce((sum, answer) => sum + (Number(answer.points) || 0), 0);
    const pointsRemain = doc.getElementById("pointsRemainTop");
    if (pointsRemain) pointsRemain.innerHTML = `<div class="qf-sum"><span>${language === "en" ? "Total" : language === "uk" ? "Сума" : "Suma"}</span><b>${totalPoints}/100</b></div>`;
    if (answers) {
      const addAnswerLabel = language === "en" ? "Add answer" : language === "uk" ? "Додати відповідь" : "Dodaj odpowiedź";
      const count = selectedAnswers.length;
      const addAnswerTile = `<button type="button" class="qf-row qf-add" ${count >= 6 ? "disabled" : ""}><span class="qf-addPlus">${icon("plus")}</span><span class="qf-addLbl">${addAnswerLabel}</span><span class="qf-addCnt">${count}/6</span></button>`;
      answers.innerHTML = addAnswerTile + selectedAnswers.map((answer, i) => `<div class="qf-row"><input class="qf-text" value="${escapeHtml(answer.text)}" aria-label="${language === "en" ? "Answer" : language === "uk" ? "Відповідь" : "Odpowiedź"} ${i + 1}"><input class="qf-pts" value="${Number(answer.points) || 0}" aria-label="${language === "en" ? "Points" : language === "uk" ? "Бали" : "Punkty"}"><button type="button" class="qf-del" aria-label="${language === "en" ? "Delete" : language === "uk" ? "Видалити" : "Usuń"}">${icon("trash")}</button></div>`).join("");
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
    setText(doc, "title", fixture.poll || "Ankieta");
    setText(doc, "sub", currentLanguage() === "en" ? "One question · one vote" : currentLanguage() === "uk" ? "Одне запитання · один голос" : "Jedno pytanie · jeden głos");
    setText(doc, "qtext", fixture.question);
    const list = doc.getElementById("alist");
    if (list) list.innerHTML = fixture.answers.map(text => `<button class="btn voteOption">${escapeHtml(text)}</button>`).join("");
    const box = doc.getElementById("qbox"); if (box) box.style.display = "";
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
      const previews = await Promise.all(fixture.logos.map(logo => logoCanvasFromFile(logo.file, 260, 100)));
      list.querySelectorAll("[data-logo-preview]").forEach(node => node.append(previews[Number(node.dataset.logoPreview)]));
    }
  } else if (scene.id === "logo-draw") {
    setInput(doc, "logoName", fixture.logo);
    const canvas = doc.querySelector("canvas");
    if (canvas) {
      const logo = await logoCanvasFromFile(fixture.logoFile, 520, 245);
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
    import(`/shared/translation/${currentLanguage()}.js?v=v2026-10-18T21281`),
    import("/shared/js/core/icons.js?v=v2026-10-18T21281"),
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
  const { default: dictionary } = await import(`/shared/translation/${language}.js?v=v2026-10-18T21281`);
  const output = {};
  for (const [name, key] of Object.entries(keys)) output[name] = key.split(".").reduce((value, part) => value?.[part], dictionary) || "";
  return output;
}

async function logoCanvasFromFile(file, width, height) {
  const logoRequest = fetch(file || "/shared/data/logo_familiada.json", { cache: "force-cache" });
  const [{ buildLogoPreviewCanvas, loadFont5x7 }, response] = await Promise.all([
    import("/shared/js/core/logo-preview.js?v=v2026-10-18T21281"), logoRequest,
  ]);
  if (!response.ok) throw new Error("nie udało się wczytać przykładowego logo");
  const stored = await response.json();
  const logo = stored.kind === "GLYPH" ? { type: "GLYPH_30x10", payload: stored.payload }
    : stored.kind === "PIX" ? { type: "PIX_150x70", payload: stored.payload }
      : { type: "GLYPH_30x10", payload: stored };
  const glyphs = await loadFont5x7();
  return buildLogoPreviewCanvas(logo, glyphs, width, height);
}

async function translateFrame(doc, language) {
  if (language === "pl") return;
  const { default: dictionary } = await import(`/shared/translation/${language}.js?v=v2026-10-18T21281`);
  const { iconText } = await import("/shared/js/core/icons.js?v=v2026-10-18T21281");
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
  const { shareSectionEl } = await import("/shared/js/core/share-sections.js?v=v2026-10-18T21281");
  const host = doc.getElementById("contactsReceived");
  if (!host) return;
  const friends = els.frame.dataset.sceneId === "friends";
  const rows = fixture.people.map((person, index) => ({
    id: `shot-person-${index}`, label: person.name, compact: true,
    note: friends ? (person.state === "accepted" ? "Znajomy" : person.state === "pending" ? "Oczekuje na odpowiedź" : "Zaproszenie odrzucone") : "Adres na liście odbiorców ankiet",
    tags: [{ text: person.state === "accepted" || person.state === "active" ? (friends ? "Znajomy" : "Aktywny") : person.state === "pending" ? "Oczekuje" : "Odrzucono", cls: person.state === "accepted" || person.state === "active" ? "tag--ok" : "tag--muted" }],
    actions: [{ key: "remove", icon: "trash", title: "Usuń", onClick: () => {} }],
  }));
  host.replaceChildren(shareSectionEl({ key: "active", title: friends ? "Znajomi" : "Subskrybenci", rows }));
}

async function paintTasks(doc, fixture) {
  const { renderRowSections } = await import("/shared/js/core/share-sections.js?v=v2026-10-18T21281");
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
  setText(doc, "pollGameName", fixture.poll);
  const main = doc.getElementById("cardMain"); if (main) main.style.display = "";
  const empty = doc.getElementById("cardEmpty"); if (empty) empty.style.display = "none";
  const bar = doc.getElementById("pollBar"); if (bar) { bar.style.display = ""; bar.dataset.state = "open"; }
  setText(doc, "pollStateWord", currentLanguage() === "en" ? "Voting open" : currentLanguage() === "uk" ? "Голосування триває" : "Głosowanie trwa");
  setText(doc, "pollStateInfo", currentLanguage() === "en" ? "18 votes received" : currentLanguage() === "uk" ? "Отримано 18 голосів" : "Oddano 18 głosów");
  setText(doc, "hintTop", fixture.question);
  setText(doc, "subsSummary", currentLanguage() === "en" ? "3 invited · 1 responded" : currentLanguage() === "uk" ? "Запрошено: 3 · відповіли: 1" : "Zaproszono: 3 · odpowiedziała 1 osoba");
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
    const { shareSectionEl } = await import("/shared/js/core/share-sections.js?v=v2026-10-18T21281");
    subs.replaceChildren(shareSectionEl({ key: "poll-shared", title: "Zaproszeni subskrybenci", rows: fixture.subscribers.map((name, i) => ({ id: `shot-sub-${i}`, label: name, compact: true, note: i === 0 ? "Oddano głos" : "Oczekuje na odpowiedź", tags: [{ text: "Subskrybent", cls: "tag--muted" }] })) }));
  }
  if (scene.id === "poll-results") {
    const shareTab = doc.getElementById("tabShare"); if (shareTab) shareTab.classList.remove("active");
    const resultTab = doc.getElementById("tabResults"); if (resultTab) resultTab.classList.add("active");
    setText(doc, "resultsMeta", currentLanguage() === "en" ? "18 votes · live results" : currentLanguage() === "uk" ? "18 голосів · результати наживо" : "18 głosów · wyniki na żywo");
    const { createPollResults } = await import("/shared/js/core/poll-results.js?v=v2026-10-18T21281");
    createPollResults(doc.getElementById("resultsList")).render({ status: "poll_open", type: "poll_points", questions: [{ id: "shot-poll", ord: 1, text: fixture.question, answers: fixture.answers.map((answer, i) => ({ id: `shot-answer-${i}`, text: answer.text, votes: answer.votes })) }] });
  }
}

async function paintControl(scene, fixture) {
  const doc = els.frame.contentDocument;
  const translation = await import("/shared/translation/translation.js?v=v2026-10-18T21281");
  const restoreLanguage = translation.getUiLang();
  await translation.setUiLang(currentLanguage(), { persist: false, updateUrl: false, apply: false });
  const { createUI } = await import("/control/js/ui.js?v=v2026-10-18T21281");
  const { makeDefaultState } = await import("/shared/js/gameplay/gameStateShape.js?v=v2026-10-18T21281");
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
function readEditorIntoConfig() {
  const scene = config.scenes.find(item => item.id === editorSceneId) || currentScene();
  const fixture = JSON.parse(els.fixture.value);
  config.localeFixtures ||= {};
  config.localeFixtures[editorLanguage] ||= {};
  config.localeFixtures[editorLanguage][scene.id] = fixture;
  dirty = false;
  return scene;
}

function renderEditorFields(fixture) {
  els.fields.replaceChildren();
  for (const [key, value] of Object.entries(fixture)) {
    if (key === "logoFile") continue;
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
    setStatus("Przykłady zapisane.");
    return true;
  } catch (error) {
    setStatus(`Nie zapisano zmian: ${error.message}`);
    return false;
  }
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
  try {
    config = await readConfig();
    config.scenes = Array.isArray(config.scenes) ? config.scenes : [];
    byId("homepageShotQrUrl").value = config.qrUrl || "";
    renderSceneList();
    const { initUiSelect } = await import("/shared/js/core/ui-select.js?v=v2026-10-18T21281");
    const languageSelect = byId("homepageShotLanguageSelect");
    const sceneSelect = byId("homepageShotSceneSelect");
    languageSelectUI = initUiSelect(languageSelect, {
      options: [...els.language.options].map(option => ({ value: option.value, label: option.textContent })),
      value: els.language.value,
      onChange: value => { els.language.value = value; els.language.dispatchEvent(new Event("change")); },
    });
    sceneSelectUI = initUiSelect(sceneSelect, {
      options: config.scenes.map(scene => ({ value: scene.id, label: scene.title })),
      value: els.scene.value,
      onChange: value => { els.scene.value = value; els.scene.dispatchEvent(new Event("change")); },
    });
    setStatus("Przykłady wczytane. Możesz edytować dane wybranego widoku.");
    els.scene.addEventListener("change", async () => {
      if (!await flushEditor()) { els.scene.value = editorSceneId; sceneSelectUI?.setValue(editorSceneId, { silent: true }); return; }
      updateEditor();
    });
    els.language.addEventListener("change", async () => {
      if (!await flushEditor()) { els.language.value = editorLanguage; languageSelectUI?.setValue(editorLanguage, { silent: true }); return; }
      updateEditor();
    });
    els.fixture.addEventListener("input", scheduleFixtureSave);
    els.fields.addEventListener("input", syncFieldsToJson);
    byId("homepageShotQrUrl").addEventListener("change", async () => {
      config.qrUrl = byId("homepageShotQrUrl").value.trim();
      try {
        await saveConfig();
        if (currentScene().id === "poll-share") await loadScenePreview(currentScene(), true);
      } catch (error) { setStatus(`Nie udało się zapisać linku QR: ${error.message}`); }
    });
    byId("homepageShotPrevious").addEventListener("click", () => moveScene(-1));
    byId("homepageShotNext").addEventListener("click", () => moveScene(1));
    byId("homepageShotSave").addEventListener("click", async () => {
      try { readEditorIntoConfig(); await saveConfig(); await loadScenePreview(); setStatus("Przykłady zapisane."); }
      catch (error) { setStatus(`Nie udało się zapisać: ${error.message}`); }
    });
    byId("homepageShotCaptureOne").addEventListener("click", async () => {
      try { readEditorIntoConfig(); await saveConfig(); setStatus("Przygotowuję zrzut…"); await captureMany([currentScene()]); }
      catch (error) { setStatus(`Nie udało się zrobić zrzutu: ${error.message}`); }
    });
    byId("homepageShotCaptureAll").addEventListener("click", async () => {
      try { readEditorIntoConfig(); await saveConfig(); setStatus("Odświeżam zrzuty po kolei…"); await captureMany(config.scenes); }
      catch (error) { setStatus(`Nie udało się rozpocząć: ${error.message}`); }
    });
    initialized = true;
  } catch (error) {
    setStatus(`Nie udało się wczytać przykładów: ${error.message}`);
  }
}

async function moveScene(delta) {
  if (!await flushEditor()) return;
  const index = config.scenes.findIndex(scene => scene.id === els.scene.value);
  const next = (index + delta + config.scenes.length) % config.scenes.length;
  els.scene.value = config.scenes[next].id;
  sceneSelectUI?.setValue(els.scene.value, { silent: true });
  updateEditor();
}
