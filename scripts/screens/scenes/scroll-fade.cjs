// Seria zrzutów „Wygaszona krawędź list” (scroll-fade.js, decyzja 2026-10-21):
// przewijane listy z większą liczbą elementów niż mieści widok — dolna
// krawędź zanika, a po przewinięciu do środka także górna. Dane demo
// powielone w scenie (więcej znajomych, zadań, gier, logo, folderów, pytań).
const { id, IDS } = require("../data/demo.cjs");
const play = require("./play.cjs");

const page = (dir) => [`web/${dir}/index.html`, `web/${dir}/js/`, `web/${dir}/css/`];
const FADE = ["web/shared/js/core/scroll-fade.js", "web/shared/css/base.css"];
const CAT = "Wygaszona krawędź list";
const BOTH = ["phone", "desktop"];

// Przewinięcie listy do połowy: widać obie wygaszone krawędzie.
const scrollMid = (selector) => async (view) => {
  await view.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.scrollHeight > x.clientHeight + 1);
    if (el) el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2);
  }, selector);
  await view.waitForTimeout(300);
};

function patchRpc(db, name, fn) {
  const old = db.rpc[name];
  const prev = typeof old === "string" && old.startsWith("fn:") ? old.slice(3) : `() => (${JSON.stringify(old ?? null)})`;
  db.rpc[name] = `fn:(args, db) => (${fn})((${prev})(args, db), args)`;
}

const moreFriends = (db) => patchRpc(db, "contacts_list", `(prev, args) => {
  if (args.p_kind !== "friends") return prev;
  const base = prev.filter((r) => r.direction === "friend");
  const extra = [];
  for (let k = 1; k <= 3; k++) base.forEach((r, i) => extra.push({ ...r, id: r.id.slice(0, -4) + String(9000 + k * 100 + i), friend_user_id: r.friend_user_id.slice(0, -4) + String(9000 + k * 100 + i), label: r.label + "_" + (k + 1), email: (k + 1) + "." + r.email }));
  return [...prev, ...extra];
}`);

function moreTasks(db) {
  const base = db.rpc.tasks_list;
  db.rpc.tasks_list = [0, 1, 2].flatMap((k) => base.map((t, i) => (k ? { ...t, id: id("8a20", k * 20 + i), token: id("8a30", k * 20 + i), title: `${t.title} · ${k + 1}` } : t)));
}

function moreGames(db) {
  const base = db.tables.games.filter((g) => g.type === "prepared");
  for (let k = 1; k <= 2; k++) base.forEach((g, i) => db.tables.games.push({ ...g, id: id("8090", k * 50 + i), name: `${g.name} · ${k + 1}`, received_from_label: null, received_from_identity: null }));
}

function moreLogos(db) {
  const base = [...db.tables.user_logos];
  for (let k = 1; k <= 2; k++) base.forEach((l, i) => db.tables.user_logos.push({ ...l, id: id("8390", k * 50 + i), name: `${l.name} · ${k + 1}` }));
}

function moreFolders(db) {
  const root = db.tables.qb_categories.filter((c) => !c.parent_id);
  const n0 = db.tables.qb_categories.length;
  root.forEach((c, i) => db.tables.qb_categories.push({ ...c, id: id("8690", i + 1), name: `${c.name} · 2`, ord: n0 + i + 1 }));
}

// Dziesięć dodatkowych pytań gry (kopie z odpowiedziami) — lista pytań
// w Ustawieniach gry wychodzi poza wysokość okna.
function moreQuestions(db) {
  const qs = db.tables.questions.filter((q) => q.game_id === IDS.game).sort((a, b) => a.ord - b.ord);
  qs.forEach((q, i) => {
    const qid = id("8190", i + 1);
    db.tables.questions.push({ ...q, id: qid, ord: qs.length + i + 1, text: `${q.text} (2)` });
    db.tables.answers.filter((a) => a.question_id === q.id).forEach((a, ai) => db.tables.answers.push({ ...a, id: id("8290", i * 10 + ai + 1), question_id: qid }));
  });
}

const finale = play.find((s) => s.id === "play-settings-finale");

module.exports = [
  { id: "fade-friends", category: CAT, title: "Znajomi — długa lista: wygaszona dolna krawędź", path: "/friends/", devices: BOTH,
    sources: [...page("friends"), ...FADE], ready: () => document.querySelector("#contactsReceived")?.children.length > 0, db: moreFriends },
  { id: "fade-friends-mid", category: CAT, title: "Znajomi — lista przewinięta do środka: wygaszone obie krawędzie", path: "/friends/?tab=received", devices: BOTH,
    sources: [...page("friends"), ...FADE], ready: () => document.querySelector("#contactsReceived")?.children.length > 0, db: moreFriends,
    steps: [scrollMid(".shareList")] },
  { id: "fade-tasks", category: CAT, title: "Zadania — lista przewinięta do środka: wygaszone obie krawędzie", path: "/tasks/", devices: BOTH,
    sources: [...page("tasks"), ...FADE], ready: "#tasksHost > *", db: moreTasks, steps: [scrollMid(".tasks-scroll")] },
  { id: "fade-games", category: CAT, title: "Moje gry — siatka przewinięta do środka: wygaszone obie krawędzie", path: "/games/", devices: BOTH,
    sources: [...page("games"), ...FADE, "web/shared/js/core/list-search.js"], ready: "#grid .card", db: moreGames, steps: [scrollMid("#grid")] },
  { id: "fade-logos", category: CAT, title: "Biblioteka logo — siatka z dłuższą listą: wygaszona dolna krawędź", path: "/logos/", devices: BOTH,
    sources: [...page("logos"), ...FADE, "web/logos/js/list.js"], ready: ".logoTile", db: moreLogos },
  { id: "fade-explorer", category: CAT, title: "Eksplorator bazy — lista i drzewo przewinięte: nagłówek tabeli bez maski", path: `/bases/explorer/?id=${IDS.base}`, devices: BOTH,
    sources: [...page("bases/explorer"), ...FADE], ready: "#list > *", db: moreFolders, steps: [scrollMid(".explorer .list")] },
  { id: "fade-explorer-move", category: CAT, title: "Eksplorator bazy — okno Przenieś do… z długim drzewem (lista w ramce)", path: `/bases/explorer/?id=${IDS.base}`, devices: BOTH,
    sources: [...page("bases/explorer"), ...FADE], ready: '#list .row[data-kind="q"]', db: moreFolders,
    steps: [async (view) => { await view.locator('#list .row[data-kind="q"]').first().click({ button: "right" }); await view.locator('#contextMenu .cm-item[data-action="item.moveTo"]').click(); await view.locator("#moveOverlay .moveRow").first().waitFor({ timeout: 5000 }); await view.waitForTimeout(300); }, scrollMid("#moveList")] },
  { id: "fade-editor", category: CAT, title: "Edycja gry — lista pytań przewinięta do środka", path: `/games/editor/?id=${IDS.game}`, devices: BOTH,
    sources: [...page("games/editor"), ...FADE], ready: "#qList > *:nth-child(2)", steps: [scrollMid(".listShell")] },
  { ...finale, id: "fade-settings-finale", category: CAT, title: "Ustawienia gry — Finał: długa pula pytań (lista w ramce, wygaszona dolna krawędź)", devices: BOTH,
    sources: [...finale.sources, ...FADE], db: (db, lang) => { moreQuestions(db); finale.db(db, lang); } },
];
