// Sceny zrzutów. Każda scena to jedna strona (albo jej stan) z danymi demo.
//   id        -- nazwa katalogu wyniku i wartość dla --scenes
//   category  -- grupa w galerii; sceny z homepage: true to kadry strony głównej
//                (docs/e13-zrzuty-strona-glowna.md, dawny panel admina /settings/)
//   path      -- adres strony (lang=… dopisuje runner)
//   sources   -- prefiksy plików, których zmiana oznacza scenę w --changed
//   ready     -- selektor CSS albo funkcja (w stronie) zwracająca true, gdy widok jest gotowy
//   steps     -- kroki Playwrighta przed zrzutem: async (view, { lang, device, page }) => {}
//   devices   -- tylko te urządzenia (np. ["phone"]); size -- własny rozmiar zamiast urządzeń
//   gameState -- wiersz game_state w atrapie (data/game-state.mjs: round | finale | main)
//   previewRow-- stan wysłany do trybu podglądu urządzenia (?preview=1); frame -- przez ramkę rodzica
//   guest     -- odwiedzający bez konta i sesji (atrapa nie zwraca użytkownika)
//   safeArea  -- emulacja strefy bezpiecznej { top, bottom, … } (env(safe-area-inset-*) w CSS strony)
//   deviceFrame -- "iphone": ekran w ramce iPhone'a na czarnym tle (frameSize: { width, height, scale })
// Przy zmianie strony: dopisz/popraw tu scenę i dane w data/, potem
//   node scripts/screens/run.cjs --changed
const { id, IDS } = require("./data/demo.cjs");

const page = (dir) => [`web/${dir}/index.html`, `web/${dir}/js/`, `web/${dir}/css/`];
const DISPLAY = ["web/control/display/", "web/shared/js/gameplay/", "web/shared/fonts/"];
const clickTab = (selector) => async (view) => {
  await view.locator(selector).first().click();
  await view.waitForTimeout(400);
};
const openModal = (selector, modal = ".overlay:visible") => async (view) => {
  await view.locator(selector).first().click();
  await view.locator(modal).first().waitFor({ state: "visible", timeout: 5000 });
  await view.waitForTimeout(250);
};
const scrollPreview = async (view) => {
  await view.locator('.gs-logo-tile[data-logo-id="default"]').click();
  await view.locator("#gsLivePreviewWrap").scrollIntoViewIfNeeded();
  await view.waitForTimeout(1500);
};
const selectTile = (selector) => async (view) => {
  await view.locator(selector).first().click();
  await view.waitForTimeout(250);
};

// Kadry strony głównej: jedna wersja każdego -- widok komputerowy 1440×900,
// taki sam na stronie głównej w każdym widoku (telefon i komputer). Wyjątek:
// głosowanie (poll-vote-mobile) -- ekran telefonu w ramce iPhone'a.
const H = { homepage: true, devices: ["desktop"] };
module.exports = [
  // ---------- 1. Gry i bazy ----------
  { ...H, id: "games", category: "Gry i bazy", title: "Moje gry — Preparowane", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [selectTile("#grid .card:not(.addCard)")] },
  { ...H, id: "game-editor", category: "Gry i bazy", title: "Edycja gry", path: `/games/editor/?id=${IDS.game}`, sources: page("games/editor"), ready: "#qList > *:nth-child(2)" },
  { ...H, id: "bases", category: "Gry i bazy", title: "Bazy pytań", path: "/bases/", sources: page("bases"), ready: "#mineGrid > *:nth-child(2)" },
  { ...H, id: "base-explorer", category: "Gry i bazy", title: "Eksplorator bazy", path: `/bases/explorer/?id=${IDS.base}`, sources: page("bases/explorer"), ready: "#list > *" },

  // ---------- 2. Znajomi, zadania i ankiety ----------
  { ...H, id: "friends", category: "Znajomi, zadania i ankiety", title: "Znajomi", path: "/friends/", sources: [...page("friends"), "web/shared/js/core/contacts-page.js"], ready: () => document.querySelector("#contactsReceived")?.children.length > 0 },
  { ...H, id: "subscribers", category: "Znajomi, zadania i ankiety", title: "Subskrybenci", path: "/subscribers/", sources: [...page("subscribers"), "web/shared/js/core/contacts-page.js"], ready: () => document.querySelector("#contactsReceived")?.children.length > 0 },
  { ...H, id: "tasks", category: "Znajomi, zadania i ankiety", title: "Zadania", path: "/tasks/", sources: page("tasks"), ready: "#tasksHost > *" },
  { id: "connect-device", category: "Znajomi, zadania i ankiety", title: "Podłącz urządzenie", path: "/connect/", sources: page("connect"), ready: ".games-shell.skel-step-ready" },
  { ...H, id: "poll-share", category: "Znajomi, zadania i ankiety", title: "Udostępnianie ankiety", path: `/polls/?id=${IDS.poll}`, sources: page("polls"), ready: "#cardMain" },
  { ...H, id: "poll-vote-mobile", category: "Znajomi, zadania i ankiety", title: "Głosowanie anonimowe — telefon", path: `/polls/vote/points/?id=${IDS.poll}&key=poll103KEY`, sources: ["web/polls/vote/points/", "web/shared/js/core/poll"], ready: "#qbox", devices: ["phone"],
    // Jak w dawnym panelu: iPhone 14 (safe area 47/34) na czarnym tle 1440×900.
    safeArea: { top: 47, bottom: 34 }, deviceFrame: "iphone", frameSize: { width: 1440, height: 900, scale: 1 } },
  { ...H, id: "poll-results", category: "Znajomi, zadania i ankiety", title: "Głosy i wyniki ankiety", path: `/polls/?id=${IDS.poll}`, sources: [...page("polls"), "web/shared/js/core/poll-results.js"], ready: "#cardMain", steps: [clickTab("#tabResults")] },

  // ---------- 3. Wygląd i logo ----------
  { ...H, id: "appearance", category: "Wygląd i logo", title: "Ustawienia wyglądu", path: `/games/settings/?id=${IDS.game}`, sources: [...page("games/settings"), ...DISPLAY], ready: "#gsContentInner", steps: [clickTab('.gs-sidebar-item[data-cat="display"]')], devices: ["desktop"], settle: 1500 },
  { ...H, id: "sound", category: "Wygląd i logo", title: "Ustawienia dźwięku", path: `/games/settings/?id=${IDS.game}`, sources: page("games/settings"), ready: "#gsContentInner", steps: [clickTab('.gs-sidebar-item[data-cat="sound"]')], devices: ["desktop"] },
  { ...H, id: "logos", category: "Wygląd i logo", title: "Biblioteka logo", path: "/logos/", sources: [...page("logos"), "web/logos/js/list.js"], ready: ".logoTile" },
  {
    ...H, id: "logo-draw", category: "Wygląd i logo", title: "Edytor rysunku", path: `/logos/editor/draw/?id=${IDS.logoDraw}`,
    sources: ["web/logos/editor/draw/", "web/logos/js/draw", "web/logos/js/editor-draw.js", "web/logos/js/editor-page.js"],
    ready: () => window.__drawFabric?.getObjects().length > 0,
  },

  // ---------- 4. Rozgrywka ----------
  { ...H, id: "control-round", category: "Rozgrywka", title: "Panel sterowania — runda", path: `/control/?id=${IDS.game}`, sources: page("control"), gameState: "round", ready: "#app", devices: ["desktop"], settle: 1200 },
  { ...H, id: "host-round", category: "Rozgrywka", title: "Prowadzący — runda", path: "/control/host/?preview=1", sources: ["web/control/host/", "web/shared/js/gameplay/"], previewRow: "round", frame: true, ready: "#paper.skel-step-ready", devices: ["desktop"] },
  { ...H, id: "display-round", category: "Rozgrywka", title: "Wyświetlacz — runda", path: "/control/display/?preview=1", sources: DISPLAY, previewRow: "round", ready: "#gameScreen:not(.hidden)", devices: ["desktop"], settle: 1500 },
  { ...H, id: "control-finale", category: "Rozgrywka", title: "Panel sterowania — finał", path: `/control/?id=${IDS.game}`, sources: page("control"), gameState: "finale", ready: "#app", devices: ["desktop"], settle: 1200 },
  { id: "control-devices", category: "Rozgrywka", title: "Panel sterowania — urządzenia", path: `/control/?id=${IDS.game}`, sources: page("control"), gameState: "devices", ready: ".device-row", devices: ["desktop"], settle: 1200 },
  { id: "control-summary", category: "Rozgrywka", title: "Panel sterowania — podsumowanie", path: `/control/?id=${IDS.game}`, sources: [...page("control"), "web/control/host/", "web/control/display/"], gameState: "summary", ready: ".c2-summary-display", devices: ["desktop"], settle: 2500 },
  { id: "control-finale-p2", category: "Rozgrywka", title: "Panel sterowania — finał, gracz 2", path: `/control/?id=${IDS.game}`, sources: page("control"), gameState: "finale2", ready: "#app", devices: ["desktop"], settle: 1200 },
  { ...H, id: "main-display", category: "Rozgrywka", title: "Główny Wyświetlacz", path: "/control/display/?preview=1", sources: DISPLAY, previewRow: "main", ready: "#gameScreen:not(.hidden)", size: { width: 1600, height: 900 }, settle: 1500 },
  { ...H, id: "og-image", category: "Rozgrywka", title: "Podgląd linku (og:image)", path: "/control/display/?preview=1", sources: DISPLAY, previewRow: "main", ready: "#gameScreen:not(.hidden)", size: { width: 1200, height: 630, scale: 2 }, settle: 1500 },

  // ---------- Dodatkowe (poza stroną główną) ----------
  { id: "games-poll-text", category: "Dodatkowe", title: "Moje gry — ankiety tekstowe", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [clickTab("#tabPollText")] },
  { id: "games-poll-points", category: "Dodatkowe", title: "Moje gry — punktacja", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [clickTab("#tabPollPoints")] },
  { id: "games-new", category: "Dodatkowe", title: "Moje gry — nowa gra", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [openModal("#grid .addCard")] },
  { id: "game-settings", category: "Dodatkowe", title: "Ustawienia gry — drużyny", path: `/games/settings/?id=${IDS.game}`, sources: page("games/settings"), ready: "#gsContentInner" },
  { id: "game-settings-team-limit", category: "Dodatkowe", title: "Ustawienia gry — nazwa drużyny dłuższa niż Wyświetlacz", path: `/games/settings/?id=${IDS.game}`, devices: ["desktop"], sources: [...page("games/settings"), "web/shared/js/display/long-text.js"], ready: "#gsTeamA",
    steps: [async (view) => {
      await view.waitForFunction(() => performance.getEntriesByType("resource").some((r) => r.name.includes("font_5x7.json")));
      await view.locator("#gsTeamA").fill("");
      await view.locator("#gsTeamA").pressSequentially("Wesołe Króliczki z Wąchocka");
      await view.locator("#gsTeamB").fill("Zajączki 😀");
      await view.waitForFunction(() => ["A", "B"].every((k) => document.getElementById(`gsTeam${k}Measure`)?.classList.contains("is-warn")));
    }] },
  { id: "game-settings-display", category: "Dodatkowe", title: "Ustawienia gry — wygląd i logo Prowadzącego", path: `/games/settings/?id=${IDS.game}`, sources: [...page("games/settings"), "web/control/host/", "web/control/display/"], ready: "#gsTeamA", devices: ["desktop"], settle: 2500,
    steps: [clickTab('.gs-sidebar-item[data-cat="display"]'), scrollPreview] },
  { id: "game-settings-display-pixel", category: "Dodatkowe", title: "Ustawienia gry — logo domyślne w trybie Piksele", path: `/games/settings/?id=${IDS.game}`, sources: [...page("games/settings"), "web/control/host/", "web/control/display/"], ready: "#gsTeamA", devices: ["desktop"], settle: 2500,
    steps: [clickTab('.gs-sidebar-item[data-cat="display"]'), clickTab(".gs-host-logo-mode .toggle-item"), scrollPreview] },
  { id: "logos-draw", category: "Dodatkowe", title: "Biblioteka logo — rysunki", path: "/logos/", sources: [...page("logos"), "web/logos/js/list.js"], ready: ".logoTile", steps: [clickTab("#tabLogoDraw")] },
  { id: "logos-image", category: "Dodatkowe", title: "Biblioteka logo — obrazy", path: "/logos/", sources: [...page("logos"), "web/logos/js/list.js"], ready: ".logoTile", steps: [clickTab("#tabLogoImage")] },
  { id: "logo-text", category: "Dodatkowe", title: "Edytor logo — tekst", path: `/logos/editor/text/?id=${IDS.logoText}`, sources: ["web/logos/editor/text/", "web/logos/js/text.js", "web/logos/js/editor-text.js", "web/logos/js/editor-page.js"], ready: "#logoName", devices: ["desktop", "tablet"] },
  { id: "logo-image", category: "Dodatkowe", title: "Edytor logo — obraz", path: `/logos/editor/image/?id=${id("8300", 47)}`, sources: ["web/logos/editor/image/", "web/logos/js/editor-image.js", "web/logos/js/editor-page.js"], ready: "#logoName", devices: ["desktop", "tablet"], settle: 1500 },
  { id: "logo-text-space", category: "Dodatkowe", title: "Edytor logo — tekst ze spacją (odstęp między słowami)", path: `/logos/editor/text/?id=${IDS.logoText}`, sources: ["web/logos/editor/text/", "web/logos/js/text.js", "web/logos/js/editor-text.js", "web/logos/js/editor-page.js"], ready: "#logoName", devices: ["desktop", "tablet"], devices: ["desktop"], steps: [async (view) => { await view.locator("#textValue").fill("QUIZ 2026"); await view.waitForTimeout(300); }] },
  { id: "login-register", guest: true, category: "Dodatkowe", title: "Logowanie — tryb zakładania konta (ikony przycisków po zmianie trybu)", path: "/login/", sources: ["web/login/"], ready: "#btnPrimary",
    steps: [async (view) => { await view.locator("#btnToggle").click(); await view.waitForTimeout(300); }] },
  // Narzędzia list w nagłówku (share-sections.js, attachListTools): szukaj · filtr · sortowanie
  { id: "subscribers-search", category: "Dodatkowe", title: "Subskrybenci — wyszukiwanie (komputer: pole w liście, telefon: okno)", path: "/subscribers/", sources: [...page("subscribers"), "web/shared/js/core/contacts-page.js", "web/shared/js/core/share-sections.js"], ready: () => document.querySelector("#contactsReceived")?.children.length > 0,
    steps: [async (view, { device }) => {
      const tab = view.locator("#contactsTabReceived");
      if (await tab.isVisible()) { await tab.click(); await view.waitForTimeout(300); }
      await view.locator("#contactsReceived .listTools-search:visible").first().click();
      if (device === "phone") { await view.locator(".uni-inp").fill("k"); await view.locator(".uni-modal .btn.gold").click(); }
      else await view.locator("#contactsReceived .listToolsInline .searchText").fill("k");
      await view.waitForTimeout(300);
    }] },
  { id: "subscribers-search-prompt", category: "Dodatkowe", title: "Subskrybenci — okno wyszukiwania (telefon)", devices: ["phone"], path: "/subscribers/", sources: [...page("subscribers"), "web/shared/js/core/contacts-page.js", "web/shared/js/core/share-sections.js"], ready: () => document.querySelector("#contactsReceived")?.children.length > 0,
    steps: [async (view) => {
      const tab = view.locator("#contactsTabReceived");
      if (await tab.isVisible()) { await tab.click(); await view.waitForTimeout(300); }
      await view.locator("#contactsReceived .listTools-search:visible").first().click();
      await view.locator(".uni-inp").fill("klasa");
      await view.waitForTimeout(300);
    }] },
  { id: "subscribers-filter", category: "Dodatkowe", title: "Subskrybenci — filtr stanu (oczekujące i odrzucone)", path: "/subscribers/", sources: [...page("subscribers"), "web/shared/js/core/contacts-page.js", "web/shared/js/core/share-sections.js"], ready: () => document.querySelector("#contactsReceived")?.children.length > 0,
    steps: [async (view) => {
      const tab = view.locator("#contactsTabInvite");
      if (await tab.isVisible()) { await tab.click(); await view.waitForTimeout(300); }
      await view.locator("#contactsOutgoing .list-filter .ui-select-btn:visible").first().click();
      await view.waitForTimeout(300);
    }] },
  { id: "tasks-tools", category: "Dodatkowe", title: "Zadania — przyciski listy w nagłówku sekcji", path: "/tasks/", sources: [...page("tasks"), "web/shared/js/core/share-sections.js"], ready: "#tasksHost > *" },
  { id: "friends-tools", category: "Dodatkowe", title: "Znajomi — przyciski listy w nagłówku sekcji", path: "/friends/", sources: [...page("friends"), "web/shared/js/core/contacts-page.js", "web/shared/js/core/share-sections.js"], ready: () => document.querySelector("#contactsReceived")?.children.length > 0 },
  { id: "bases-share-tools", category: "Dodatkowe", title: "Bazy — okno udostępniania z przyciskami list", path: "/bases/", sources: [...page("bases"), "web/shared/js/core/share-sections.js"], ready: "#mineGrid > *:nth-child(2)",
    steps: [async (view) => { await view.locator("#mineGrid .card:not(.addCard)").first().click(); await view.locator("#btnShare").click(); await view.locator("#shareOverlay").waitFor({ state: "visible" }); await view.waitForTimeout(600); }] },
  { id: "bases-share-long-name", category: "Dodatkowe", title: "Bazy — udostępnione: długa nazwa użytkownika (wielokropek, stała wysokość kafla)", path: "/bases/", sources: [...page("bases"), "web/shared/js/core/share-sections.js"], ready: "#mineGrid > *:nth-child(2)",
    steps: [async (view) => { await view.locator("#mineGrid .card:not(.addCard)").first().click(); await view.locator("#btnShare").click(); await view.locator("#shareOverlay").waitFor({ state: "visible" }); await view.waitForTimeout(600); await view.locator("#shareSectionsHost").evaluate((el) => { el.scrollTop = el.scrollHeight; }); await view.waitForTimeout(200); }] },
  { id: "poll-recipients-tools", category: "Dodatkowe", title: "Ankieta — okno odbiorców z przyciskami list", path: `/polls/?id=${IDS.poll}`, sources: [...page("polls"), "web/shared/js/core/share-sections.js"], ready: "#cardMain",
    steps: [async (view) => { const b = view.locator("#btnAddRecipients"); if (!(await b.isVisible())) { const tab = view.locator(".slot-recipients button, #tabRecipients").first(); if (await tab.count()) await tab.click(); } await view.locator("#btnAddRecipients").click(); await view.waitForTimeout(600); }] },
  { id: "mails-tools", category: "Dodatkowe", title: "Mails — listy subskrypcji i zadań z przyciskami", path: "/mails/", sources: ["web/mails/", "web/mail/", "web/shared/js/core/share-sections.js"], ready: "#subscriptionList > *" },
  { id: "games-send-tools", category: "Dodatkowe", title: "Moje gry — okno Wyślij kopię (lista znajomych z przyciskami)", path: "/games/", sources: [...page("games"), "web/shared/js/core/resource-send.js", "web/shared/js/core/share-sections.js"], ready: "#grid .card",
    steps: [selectTile("#grid .card:not(.addCard)"), async (view) => { await view.locator("#btnSendCopy").click(); await view.locator("#resourceSendOverlay").waitFor({ state: "visible" }); await view.waitForTimeout(500); }] },
  // E21: reguły gier, edytory i podliczanie
  { id: "game-editor-answer-rules", category: "Dodatkowe", title: "Edycja gry — warunki gotowości, odpowiedź ze znakiem spoza Wyświetlacza i poniżej 4 pkt, podpowiedzi 17/finał 11", path: `/games/editor/?id=${IDS.game}`, sources: [...page("games/editor"), "web/shared/js/core/question-form.js", "web/shared/js/core/game-rules.js", "web/shared/css/question-form.css"], ready: "#qList > *:nth-child(2)",
    steps: [async (view) => { await view.locator("#qList .qcard:not(.addTile)").first().click(); const inp = view.locator("#aList .qf-row:not(.qf-add) .qf-text").first(); await inp.fill("kawa😀"); const pts = view.locator("#aList .qf-row:not(.qf-add) .qf-pts").nth(3); await pts.fill("2"); await pts.blur(); await view.waitForTimeout(600); }] },
  { id: "games-change-type", category: "Dodatkowe", title: "Moje gry — Zmień typ", path: "/games/", sources: [...page("games"), "web/shared/js/core/game-validate.js"], ready: "#grid .card",
    steps: [selectTile("#grid .card:not(.addCard)"), openModal("#btnChangeType", ".change-type"), async (view) => { await view.locator('.change-type-option:has(input[value="poll_text"])').click(); await view.waitForTimeout(250); }] },
  { id: "base-explorer-create-game", category: "Dodatkowe", title: "Eksplorator bazy — Utwórz grę (braki informacyjnie)", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer"), "web/shared/js/core/game-rules.js"], ready: "#list > *",
    steps: [async (view) => { await view.locator("#list .row[data-kind=\"q\"]").first().click(); await view.locator("#list .row[data-kind=\"q\"]").nth(1).click({ modifiers: ["Control"] }); await view.locator('#toolbar button[data-act="createGame"]').click(); await view.locator("#exportOverlay").waitFor({ state: "visible", timeout: 5000 }); await view.waitForTimeout(300); }] },
  { id: "base-explorer-tags", category: "Dodatkowe", title: "Eksplorator bazy — okno tagów zaznaczonego pytania", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator('#list .row[data-kind="q"]').first().click(); await view.locator('#toolbar button[data-act="editTags"]').click(); await view.locator("#tagsOverlay").waitFor({ state: "visible", timeout: 5000 }); await view.waitForTimeout(500); }] },
  { id: "base-explorer-tags-edit", category: "Dodatkowe", title: "Eksplorator bazy — okno tagów: dodawanie tagu", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator('#list .row[data-kind="q"]').first().click(); await view.locator('#toolbar button[data-act="editTags"]').click(); await view.locator("#tagsAddNew").click(); await view.locator("#tagsL2").waitFor({ state: "visible", timeout: 5000 }); await view.waitForTimeout(500); }] },
  { id: "base-explorer-tags-color", category: "Dodatkowe", title: "Eksplorator bazy — okno tagów: wybór koloru", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator('#list .row[data-kind="q"]').first().click(); await view.locator('#toolbar button[data-act="editTags"]').click(); await view.locator("#tagsAddNew").click(); await view.locator("#tagsEditColorTile").click(); await view.locator("#tagsL3").waitFor({ state: "visible", timeout: 5000 }); await view.waitForTimeout(500); }] },
  { id: "base-explorer-drawer", category: "Dodatkowe", title: "Eksplorator bazy — lewy panel na telefonie (hamburger)", devices: ["phone"], path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator("#btnDrawerToggle").click(); await view.waitForTimeout(500); }] },
  { id: "base-explorer-left-tags", category: "Dodatkowe", title: "Eksplorator bazy — lewy panel: widok tagów (przycisk przy wyszukiwarce / na telefonie)", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator('[data-left-view="tags"]:visible').click(); await view.locator('#tags .row[data-kind="tag"]').first().click(); await view.waitForTimeout(500); }] },
  { id: "base-explorer-left-types", category: "Dodatkowe", title: "Eksplorator bazy — lewy panel: widok proponowanych kategorii", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator('[data-left-view="types"]:visible').click(); await view.waitForTimeout(500); }] },
  { id: "base-explorer-search-sheet", devices: ["phone"], category: "Dodatkowe", title: "Eksplorator bazy — telefon: okno Szukaj (tabletki tagów i podpowiedzi)", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => {
      await view.locator("#searchBox").click();
      await view.locator("#searchOverlay.sheet-active").waitFor({ timeout: 5000 });
      const names = await view.evaluate(() => [...document.querySelectorAll('#tags .row[data-kind="tag"] .title-text')].map((el) => el.textContent.trim().replace(/^#/, "")));
      for (const n of names.slice(0, 3)) await view.locator("#searchText").pressSequentially(`#${n} `);
      await view.locator("#searchText").pressSequentially("#");
      await view.waitForTimeout(500);
    }] },
  { id: "base-explorer-search-chips", category: "Dodatkowe", title: "Eksplorator bazy — wiele tabletek tagów w pasku (jedna linia)", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => {
      const names = await view.evaluate(() => [...document.querySelectorAll('#tags .row[data-kind="tag"] .title-text')].map((el) => el.textContent.trim().replace(/^#/, "")).filter((n) => !n.includes(" ")));
      if (await view.locator("#searchOverlay").isHidden() && await view.locator(".left-view-tabs").isVisible()) await view.locator("#searchBox").click();
      for (const n of names.slice(0, 4)) await view.locator("#searchText").pressSequentially(`#${n} `);
      if (await view.locator("#searchSheetDone").isVisible()) await view.locator("#searchSheetDone").click();
      else await view.locator("#searchText").blur();
      await view.waitForTimeout(500);
    }] },
  { id: "base-explorer-move", category: "Dodatkowe", title: "Eksplorator bazy — Przenieś do… (drzewo folderów z wyszukiwaniem)", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator('#list .row[data-kind="q"]').first().click({ button: "right" }); await view.locator('#contextMenu .cm-item[data-action="item.moveTo"]').click(); await view.locator("#moveOverlay .moveRow").first().waitFor({ timeout: 5000 }); await view.locator("#moveList .tree-toggle").nth(1).click(); await view.locator("#moveList .tree-toggle").nth(2).click(); await view.locator('#moveList .moveRow[aria-expanded="true"] + .moveRow').last().click(); await view.waitForTimeout(400); }] },
  { id: "base-explorer-move-search", category: "Dodatkowe", title: "Eksplorator bazy — Przenieś do…: wyszukiwanie folderu", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator('#list .row[data-kind="q"]').first().click({ button: "right" }); await view.locator('#contextMenu .cm-item[data-action="item.copyTo"]').click(); await view.locator("#moveSearch").fill("o"); await view.waitForTimeout(400); }] },
  { id: "base-explorer-trash", category: "Dodatkowe", title: "Eksplorator bazy — Kosz jako folder (dni do usunięcia, Przywróć w pasku)", path: `/bases/explorer/?id=${IDS.base}&trash=1`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="trash"]',
    steps: [async (view) => { await view.locator('#list .row[data-kind="trash"]').first().click(); await view.waitForTimeout(300); }] },
  { id: "base-explorer-menu", category: "Dodatkowe", title: "Eksplorator bazy — menu kontekstowe (telefon: arkusz od dołu)", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => { await view.locator('#list .row[data-kind="q"]').first().click({ button: "right" }); await view.locator("#contextMenu:not([hidden])").waitFor({ timeout: 5000 }); await view.waitForTimeout(300); }] },
  { id: "base-explorer-filter", category: "Dodatkowe", title: "Eksplorator bazy — wyniki filtra (tabletka #tagu, liczba trafień w folderach)", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer")], ready: '#list .row[data-kind="q"]',
    steps: [async (view) => {
      const name = await view.locator('#tags .row[data-kind="tag"] .title-text').first().textContent().catch(() => "");
      const tag = String(name || "").trim().replace(/^#/, "");
      await view.locator("#searchText").click();
      await view.keyboard.type(`#${tag} `);
      await view.locator("#searchChips .chip").first().waitFor({ timeout: 5000 });
      await view.locator("#searchText").blur();
      await view.waitForTimeout(400);
    }] },
  { id: "game-editor-question-sheet", devices: ["phone"], category: "Dodatkowe", title: "Edycja gry na telefonie — pytanie w oknie od dołu", path: `/games/editor/?id=${IDS.game}`, sources: [...page("games/editor"), "web/shared/js/core/modal-sheet.js", "web/shared/css/question-form.css"], ready: "#qList > *:nth-child(2)",
    steps: [async (view) => { await view.locator("#qList .qcard[data-id]").first().click(); await view.locator("#questionSheetOverlay.sheet-active").waitFor({ timeout: 5000 }); await view.locator("#aList .qf-row:not(.qf-add)").first().waitFor({ timeout: 5000 }); await view.waitForTimeout(500); }] },
  { id: "base-explorer-question-modal", category: "Dodatkowe", title: "Eksplorator bazy — edycja pytania (podpowiedzi nad kafelkiem dodawania)", path: `/bases/explorer/?id=${IDS.base}`, sources: [...page("bases/explorer"), "web/shared/js/core/question-form.js", "web/shared/css/question-form.css"], ready: "#list > *",
    steps: [async (view) => { await view.locator('#list .row[data-kind="q"]').first().dblclick(); await view.locator("#questionOverlay").waitFor({ state: "visible", timeout: 5000 }); await view.waitForTimeout(400); }] },
  { id: "polls-tally-tie", category: "Dodatkowe", title: "Podliczanie ankiety tekstowej — remis na granicy szóstki", path: `/polls/?id=${IDS.tallyTie}`, sources: [...page("polls"), "web/shared/js/core/poll-tally-math.js", "web/shared/js/core/poll-results.js"], ready: "#cardMain",
    steps: [clickTab("#tabResults"), async (view) => { await view.locator("#btnTallyPoll").click(); await view.locator(".tallyTieInfo:not([hidden])").first().waitFor({ timeout: 8000 }); await view.waitForTimeout(400); }] },
  { id: "poll-vote-text", category: "Dodatkowe", title: "Głosowanie tekstowe — podpowiedź (17 znaków, pomijane znaki)", path: `/polls/vote/text/?id=${IDS.textPoll}&key=poll104KEY`, sources: ["web/polls/vote/text/", "web/shared/js/core/answer-text.js"], ready: "#answerInput", devices: ["phone"] },
  { id: "polls-text", category: "Dodatkowe", title: "Ankieta tekstowa — głosy", path: `/polls/?id=${IDS.textPoll}`, sources: [...page("polls"), "web/shared/js/core/poll-results.js"], ready: "#cardMain", steps: [clickTab("#tabResults")] },
  { id: "polls-tally-points", category: "Dodatkowe", title: "Podliczanie ankiety punktowej (zamykanie)", path: `/polls/?id=${IDS.pollStopped}`, sources: [...page("polls"), "web/shared/js/core/poll-tally-math.js", "web/shared/js/core/poll-results.js"], ready: "#cardMain",
    steps: [clickTab("#tabResults"), async (view) => { await view.locator("#btnTallyPoll").click(); await view.locator("#tallyBar:not([hidden])").waitFor({ timeout: 8000 }); await view.waitForTimeout(400); }] },
  { id: "polls-stopped", category: "Dodatkowe", title: "Ankieta zatrzymana — głosy", path: `/polls/?id=${IDS.pollStopped}`, sources: [...page("polls"), "web/shared/js/core/poll-results.js"], ready: "#cardMain", steps: [clickTab("#tabResults")] },
  { id: "marketplace", category: "Dodatkowe", title: "Społeczność", path: "/marketplace/", sources: page("marketplace"), ready: ".mkt-card" },
  { id: "snake-iphone", guest: true, category: "Dodatkowe", title: "Ukryta gra w węża — iPhone w poziomie (wcięcie i pasek gestu)", path: "/snake/?qr=00000000-0000-4000-8000-000000000103", devices: ["phone-landscape"], safeArea: { left: 59, right: 59, bottom: 21 },
    sources: [...page("snake")], ready: "#snakeFrame[data-mode=intro]" },
  // Okno „Do ekranu początkowego” pokazuje się po przycisku pełnego ekranu w Safari na iPhonie;
  // Chromium zrzutów nie jest Safari, więc krok otwiera to samo okno tak, jak robi to strona.
  { id: "snake-a2hs", guest: true, category: "Dodatkowe", title: "Ukryta gra w węża — iPhone: dodaj do ekranu początkowego", path: "/snake/?qr=00000000-0000-4000-8000-000000000103", devices: ["phone-landscape"], safeArea: { left: 59, right: 59, bottom: 21 },
    sources: [...page("snake")], ready: "#snakeFrame[data-mode=intro]",
    steps: [async (view) => { await view.evaluate(() => { document.documentElement.classList.add("showA2HS"); document.getElementById("snakeA2HS").setAttribute("aria-hidden", "false"); }); await view.waitForTimeout(200); }] },
  { id: "snake-lang", guest: true, category: "Dodatkowe", title: "Ukryta gra w węża — przełącznik języka (menu otwarte)", path: "/snake/?qr=00000000-0000-4000-8000-000000000103", devices: ["desktop", "phone-landscape"],
    sources: [...page("snake")], ready: "#snakeFrame[data-mode=intro]",
    steps: [async (view) => { await view.locator(".lang-floating .lang-btn").click(); await view.locator(".lang-menu:not([hidden])").waitFor(); await view.waitForTimeout(200); }] },
  { id: "admin-stats-snake", category: "Dodatkowe", title: "Panel admina — statystyki węża", path: "/settings/", sources: ["web/settings/"], ready: "#btnTabStats", devices: ["desktop"],
    steps: [clickTab("#btnTabStats"), async (view) => { await view.locator("#snakeTop tr").first().waitFor(); await view.locator("#snakeFunnel").scrollIntoViewIfNeeded(); await view.waitForTimeout(300); }] },
  // Liczniki powiadomień na zakładkach (Poczta Familiada 5, Gry Społeczności 4); węższe okno -- suma na „Więcej”.
  { id: "admin-badges", category: "Dodatkowe", title: "Panel admina — liczniki powiadomień na zakładkach i „Więcej”", path: "/settings/", sources: ["web/settings/", "web/shared/js/core/topbar-controller.js"], ready: () => document.getElementById("tabBadgeMarketplace")?.textContent === "4", devices: ["desktop", "phone"],
    steps: [async (view, { device }) => { if (device !== "phone") { await view.setViewportSize({ width: 1180, height: 760 }); await view.waitForTimeout(500); await view.locator("#btnMore").click(); await view.waitForTimeout(300); } else { await view.locator(".topbar-menu-toggle").click(); await view.waitForTimeout(400); } }] },
  { id: "admin-market-pending", category: "Dodatkowe", title: "Panel admina — Gry Społeczności, licznik „Do zatwierdzenia”", path: "/settings/", sources: ["web/settings/"], ready: () => document.getElementById("tabBadgeMarketplace")?.textContent === "4", devices: ["desktop"],
    steps: [async (view) => { await view.locator("#btnMore").click(); await view.locator("#navMoreDropdown").getByText("Gry Społeczności").click(); await view.locator("#badgeMarketPending").waitFor(); await view.waitForTimeout(500); }] },
  { id: "admin-screens", category: "Dodatkowe", title: "Panel admina — zrzuty stron", path: "/settings/", sources: ["web/settings/"], ready: "#btnTabScreenshots", devices: ["desktop"], steps: [clickTab("#btnTabScreenshots")] },
  { id: "account", category: "Dodatkowe", title: "Konto", path: "/account/", sources: page("account"), ready: "main" },
  { id: "games-name-create", category: "Dodatkowe", title: "Moje gry — okno nazwy nowej gry (wspólne promptModal)", path: "/games/", sources: [...page("games"), "web/shared/js/core/modal.js"], ready: "#grid .card", steps: [openModal("#grid .addCard", ".uni-modal")] },
  { id: "bases-name-create", category: "Dodatkowe", title: "Bazy — okno nazwy nowej bazy (wspólne promptModal)", path: "/bases/", sources: [...page("bases"), "web/shared/js/core/modal.js"], ready: "#mineGrid > *:nth-child(2)", steps: [openModal("#mineGrid .addCard", ".uni-modal")] },
  { id: "logos-name-create", devices: ["desktop"], category: "Dodatkowe", title: "Logo — okno nazwy nowego logo (wspólne promptModal)", path: "/logos/", sources: [...page("logos"), "web/shared/js/core/modal.js"], ready: ".logoTile", steps: [openModal("#grid .addCard", ".uni-modal")] },
  { id: "games-export-progress", category: "Dodatkowe", title: "Moje gry — okno postępu eksportu (wspólne progressModal)", path: "/games/", sources: [...page("games"), "web/shared/js/core/modal.js"], ready: "#grid .card", steps: [selectTile("#grid .card[data-game-id]"), openModal("#btnExport", ".uni-modal")] },
  { id: "rating-prompt", category: "Dodatkowe", title: "Prośba o ocenę — trzy przyciski (wspólne choiceModal)", path: "/games/", sources: ["web/shared/js/core/rating-system.js", "web/shared/js/core/modal.js"], ready: "#grid .card", steps: [async (view) => {
    await view.evaluate(async () => {
      const m = await import("/shared/js/core/rating-system.js");
      // okno pokazuje się po 7 dniach od rejestracji i bez wcześniejszej odmowy
      try { for (const k of Object.keys(localStorage)) if (k.startsWith("fam:app_rat")) localStorage.removeItem(k); } catch {}
      void m.initRatingSystem({ id: "screens-user", created_at: "2026-01-01T00:00:00Z" });
    });
    await view.locator("#ratingOverlay").waitFor({ state: "visible", timeout: 5000 });
    await view.locator('#ratingOverlay .star-btn[data-value="4"]').click();
    await view.waitForTimeout(300);
  }] },
  { id: "account-rating-modal", category: "Dodatkowe", title: "Konto — okno oceny", path: "/account/", sources: [...page("account"), "web/shared/js/core/rating-system.js"], ready: "#ratingEditBtn", steps: [openModal("#ratingEditBtn", "#ratingEditOverlay")] },
  { id: "account-rating-saved", category: "Dodatkowe", title: "Konto — zapisana ocena", path: "/account/", sources: [...page("account"), "web/shared/js/core/rating-system.js"], ready: "#ratingEditBtn", steps: [async (view) => {
    await openModal("#ratingEditBtn", "#ratingEditOverlay")(view);
    await view.locator('#ratingEditOverlay .star-btn[data-value="4"]').click();
    await view.locator("#ratingEditOverlay .rating-comment").fill("Świetna zabawa na rodzinnych spotkaniach, <b>bez</b> HTML.");
    await view.locator("#ratingEditOverlay .uni-foot .btn.gold").click();
    await view.locator("#ratingEditOverlay").waitFor({ state: "detached", timeout: 5000 });
    await view.locator("#userRatingInfo .rating-info").waitFor({ timeout: 5000 });
    await view.waitForTimeout(300);
  }] },
  { id: "home", guest: true, category: "Dodatkowe", title: "Strona główna", path: "/", sources: ["web/index.html", ...page("home"), "web/assets/img/"], ready: ".tile-shot img.is-loaded", fullPage: true },
  { id: "home-gallery", guest: true, category: "Dodatkowe", title: "Strona główna — karuzela kadrów w kaflu", path: "/", sources: ["web/index.html", ...page("home"), "web/assets/img/"], ready: ".tile-shot img.is-loaded",
    steps: [async (view) => { const shot = view.locator(".tile-shot").nth(1); await shot.scrollIntoViewIfNeeded(); await view.evaluate(() => window.scrollBy(0, -120)); await shot.locator(".shot-carousel-next").click(); await shot.locator(".shot-carousel-next").click(); await view.waitForFunction(() => document.querySelectorAll(".tile-shot")[1].querySelector("img.is-loaded")); await view.waitForTimeout(400); }] },
  { id: "home-viewer-iphone", guest: true, category: "Dodatkowe", title: "Strona główna — podgląd kadru na iPhonie (wcięcie, otwarty z dołu strony)", path: "/", devices: ["phone"], safeArea: { top: 47, bottom: 34 },
    sources: ["web/index.html", ...page("home"), "web/shared/css/", "web/shared/js/core/modal-sheet.js"], ready: ".tile-shot img.is-loaded",
    steps: [async (view) => { const shot = view.locator(".tile-shot").nth(3); await shot.scrollIntoViewIfNeeded(); await shot.locator(".shot-img").click(); await view.locator(".imgv-overlay.is-open .imgv-img").waitFor(); await view.waitForTimeout(600); }] },
  // Ukryta gra w węża (wejście z kodu QR na kadrze poll-share).
  { id: "snake", category: "Dodatkowe", title: "Ukryta gra w węża — start (telefon w pionie: prośba o obrót)", path: "/snake/?qr=00000000-0000-4000-8000-000000000103", sources: [...page("snake"), "web/shared/js/core/snake-log.js", "web/shared/js/display/"], ready: () => document.querySelector("#snakeFrame[data-mode]") || document.querySelector("#pageGuard") },
  { id: "snake-play", guest: true, category: "Dodatkowe", title: "Ukryta gra w węża — rozgrywka (bez konta)", path: "/snake/?qr=00000000-0000-4000-8000-000000000103", devices: ["desktop", "phone-landscape"], sources: [...page("snake"), "web/shared/js/core/snake-log.js"], ready: "#snakeFrame[data-mode=intro]",
    steps: [async (view) => { await view.locator("body").press("ArrowUp"); await view.waitForTimeout(450); await view.locator("body").press("ArrowRight"); await view.waitForTimeout(1500); }] },
  { id: "home-viewer", guest: true, category: "Dodatkowe", title: "Strona główna — podgląd kadru z przybliżaniem", path: "/", sources: ["web/index.html", ...page("home"), "web/assets/img/"], ready: ".tile-shot img.is-loaded",
    steps: [async (view) => { const shot = view.locator(".tile-shot").nth(3); await shot.scrollIntoViewIfNeeded(); await shot.locator(".shot-carousel-next").click(); await shot.locator(".shot-img").click(); await view.locator(".imgv-overlay.is-open .imgv-img").waitFor(); await view.waitForTimeout(600); }] },
];
