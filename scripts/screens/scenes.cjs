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
  { ...H, id: "main-display", category: "Rozgrywka", title: "Główny Wyświetlacz", path: "/control/display/?preview=1", sources: DISPLAY, previewRow: "main", ready: "#gameScreen:not(.hidden)", size: { width: 1600, height: 900 }, settle: 1500 },
  { ...H, id: "og-image", category: "Rozgrywka", title: "Podgląd linku (og:image)", path: "/control/display/?preview=1", sources: DISPLAY, previewRow: "main", ready: "#gameScreen:not(.hidden)", size: { width: 1200, height: 630, scale: 2 }, settle: 1500 },

  // ---------- Dodatkowe (poza stroną główną) ----------
  { id: "games-poll-text", category: "Dodatkowe", title: "Moje gry — ankiety tekstowe", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [clickTab("#tabPollText")] },
  { id: "games-poll-points", category: "Dodatkowe", title: "Moje gry — punktacja", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [clickTab("#tabPollPoints")] },
  { id: "games-new", category: "Dodatkowe", title: "Moje gry — nowa gra", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [openModal("#grid .addCard")] },
  { id: "game-settings", category: "Dodatkowe", title: "Ustawienia gry — drużyny", path: `/games/settings/?id=${IDS.game}`, sources: page("games/settings"), ready: "#gsContentInner" },
  { id: "logos-draw", category: "Dodatkowe", title: "Biblioteka logo — rysunki", path: "/logos/", sources: [...page("logos"), "web/logos/js/list.js"], ready: ".logoTile", steps: [clickTab("#tabLogoDraw")] },
  { id: "logos-image", category: "Dodatkowe", title: "Biblioteka logo — obrazy", path: "/logos/", sources: [...page("logos"), "web/logos/js/list.js"], ready: ".logoTile", steps: [clickTab("#tabLogoImage")] },
  { id: "logo-text", category: "Dodatkowe", title: "Edytor logo — tekst", path: `/logos/editor/text/?id=${IDS.logoText}`, sources: ["web/logos/editor/text/", "web/logos/js/text.js", "web/logos/js/editor-text.js", "web/logos/js/editor-page.js"], ready: "#logoName", devices: ["desktop", "tablet"] },
  { id: "polls-text", category: "Dodatkowe", title: "Ankieta tekstowa — głosy", path: `/polls/?id=${IDS.textPoll}`, sources: [...page("polls"), "web/shared/js/core/poll-results.js"], ready: "#cardMain", steps: [clickTab("#tabResults")] },
  { id: "polls-stopped", category: "Dodatkowe", title: "Ankieta zatrzymana — głosy", path: `/polls/?id=${IDS.pollStopped}`, sources: [...page("polls"), "web/shared/js/core/poll-results.js"], ready: "#cardMain", steps: [clickTab("#tabResults")] },
  { id: "marketplace", category: "Dodatkowe", title: "Społeczność", path: "/marketplace/", sources: page("marketplace"), ready: ".mkt-card" },
  { id: "admin-screens", category: "Dodatkowe", title: "Panel admina — zrzuty stron", path: "/settings/", sources: ["web/settings/"], ready: "#btnTabScreenshots", devices: ["desktop"], steps: [clickTab("#btnTabScreenshots")] },
  { id: "account", category: "Dodatkowe", title: "Konto", path: "/account/", sources: page("account"), ready: "main" },
  { id: "home", guest: true, category: "Dodatkowe", title: "Strona główna", path: "/", sources: ["web/index.html", ...page("home"), "web/assets/img/"], ready: ".tile-shot img.is-loaded", fullPage: true },
  { id: "home-gallery", guest: true, category: "Dodatkowe", title: "Strona główna — galeria kadrów", path: "/", sources: ["web/index.html", ...page("home"), "web/assets/img/"], ready: ".tile-shot img.is-loaded",
    steps: [async (view) => { await view.locator(".tile-shot").nth(3).click(); await view.locator(".imgv-overlay.is-open .imgv-img").waitFor(); await view.locator(".imgv-nav-next").click(); await view.waitForTimeout(600); }] },
];
