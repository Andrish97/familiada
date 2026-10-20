// Sceny zrzutów. Każda scena to jedna strona (albo jej stan) z danymi demo.
//   id       -- nazwa katalogu wyniku i wartość dla --scenes
//   path     -- adres strony (lang=… dopisuje runner)
//   sources  -- prefiksy plików, których zmiana oznacza scenę w --changed
//   ready    -- selektor CSS albo funkcja (w stronie) zwracająca true, gdy widok jest gotowy
//   steps    -- opcjonalne kroki Playwrighta przed zrzutem: async (page, { lang, device }) => {}
//   devices  -- opcjonalnie: tylko te urządzenia (np. edytory nie działają na telefonie)
// Przy zmianie strony: dopisz/popraw tu scenę i dane w data/, potem
//   node scripts/screens/run.cjs --changed
const { id } = require("./data/demo.cjs");

const GAME_READY = id("8000", 100);
const GAME_POLL_OPEN = id("8000", 102);
const GAME_POLL_STOPPED = id("8000", 103);
const LOGO_TEXT = id("8300", 2);
const LOGO_DRAW = id("8300", 20);
const BASE_MAIN = id("8400", 1);

const page = (dir) => [`web/${dir}/index.html`, `web/${dir}/js/`, `web/${dir}/css/`];
const clickTab = (selector) => async (p) => {
  await p.locator(selector).first().click();
  await p.waitForTimeout(400);
};
const openModal = (selector, modal = ".overlay:visible") => async (p) => {
  await p.locator(selector).first().click();
  await p.locator(modal).first().waitFor({ state: "visible", timeout: 5000 });
  await p.waitForTimeout(250);
};

module.exports = [
  { id: "games", title: "Moje gry", path: "/games/", sources: page("games"), ready: "#grid .card" },
  { id: "games-poll-text", title: "Moje gry – ankiety tekstowe", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [clickTab("#tabPollText")] },
  { id: "games-poll-points", title: "Moje gry – punktacja", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [clickTab("#tabPollPoints")] },
  { id: "game-editor", title: "Edytor gry", path: `/games/editor/?id=${GAME_READY}`, sources: page("games/editor"), ready: "#qList .qRow, #qList [data-qid], #qList > *:nth-child(2)" },
  { id: "game-settings", title: "Ustawienia gry", path: `/games/settings/?id=${GAME_READY}`, sources: page("games/settings"), ready: "#gsContentInner" },
  { id: "bases", title: "Bazy pytań", path: "/bases/", sources: page("bases"), ready: "#mineGrid > *:nth-child(2)" },
  { id: "base-explorer", title: "Eksplorator bazy", path: `/bases/explorer/?id=${BASE_MAIN}`, sources: page("bases/explorer"), ready: "#list > *" },
  { id: "logos", title: "Moje logo", path: "/logos/", sources: [...page("logos"), "web/logos/js/list.js"], ready: ".logoTile" },
  { id: "logos-draw", title: "Moje logo – rysunki", path: "/logos/", sources: [...page("logos"), "web/logos/js/list.js"], ready: ".logoTile", steps: [clickTab("#tabLogoDraw")] },
  { id: "logos-image", title: "Moje logo – obrazy", path: "/logos/", sources: [...page("logos"), "web/logos/js/list.js"], ready: ".logoTile", steps: [clickTab("#tabLogoImage")] },
  { id: "logo-text", title: "Edytor logo – tekst", path: `/logos/editor/text/?id=${LOGO_TEXT}`, sources: ["web/logos/editor/text/", "web/logos/js/text.js", "web/logos/js/editor-text.js", "web/logos/js/editor-page.js"], ready: "#logoName", devices: ["desktop", "tablet"] },
  {
    id: "logo-draw", title: "Edytor logo – rysunek", path: `/logos/editor/draw/?id=${LOGO_DRAW}`,
    sources: ["web/logos/editor/draw/", "web/logos/js/draw", "web/logos/js/editor-draw.js", "web/logos/js/editor-page.js"],
    ready: () => window.__drawFabric?.getObjects().length > 0, devices: ["desktop", "tablet"],
  },
  { id: "marketplace", title: "Społeczność", path: "/marketplace/", sources: page("marketplace"), ready: "main" },
  { id: "polls", title: "Ankieta", path: `/polls/?id=${GAME_POLL_OPEN}`, sources: page("polls"), ready: "#cardMain" },
  { id: "polls-results", title: "Ankieta – głosy", path: `/polls/?id=${GAME_POLL_OPEN}`, sources: [...page("polls"), "web/shared/js/core/poll-results.js"], ready: "#cardMain", steps: [clickTab("#tabResults")] },
  { id: "polls-stopped", title: "Ankieta zatrzymana – głosy", path: `/polls/?id=${GAME_POLL_STOPPED}`, sources: [...page("polls"), "web/shared/js/core/poll-results.js"], ready: "#cardMain", steps: [clickTab("#tabResults")] },
  { id: "friends", title: "Znajomi", path: "/friends/", sources: [...page("friends"), "web/shared/js/core/contacts-page.js"], ready: "#contactsReceived > *" },
  { id: "subscribers", title: "Subskrybenci", path: "/subscribers/", sources: [...page("subscribers"), "web/shared/js/core/contacts-page.js"], ready: "#contactsReceived > *" },
  { id: "tasks", title: "Zadania", path: "/tasks/", sources: page("tasks"), ready: "#tasksHost" },
  { id: "account", title: "Konto", path: "/account/", sources: page("account"), ready: "main" },
  { id: "home", title: "Strona główna", path: "/", sources: ["web/index.html", ...page("home")], ready: "main, body > *" },
  { id: "games-new", title: "Moje gry – nowa gra", path: "/games/", sources: page("games"), ready: "#grid .card", steps: [openModal("#grid .addCard")] },
];
