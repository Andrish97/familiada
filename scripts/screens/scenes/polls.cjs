// Seria zrzutów obszaru „polls”: strona ankiety (/polls/) we wszystkich stanach,
// głosowanie z linku (/polls/vote/text|points|qr/), Zadania (/tasks/) i bramka
// linków z e-maili (/go/). Sceny już obecne w scenes.cjs (poll-share,
// poll-results, poll-recipients-tools, polls-tally-tie, polls-tally-points,
// polls-stopped, polls-text, poll-vote-text, poll-vote-mobile, tasks,
// tasks-tools) nie są tu powtarzane.
const { id, IDS, USER_ID, panel } = require("../data/demo.cjs");

const page = (dir) => [`web/${dir}/index.html`, `web/${dir}/js/`, `web/${dir}/css/`];
const POLLS = [...page("polls"), "web/shared/css/polls.css", "web/shared/js/core/poll-results.js"];
const TALLY = [...POLLS, "web/shared/js/core/poll-tally-math.js"];
const VOTE_TEXT = ["web/polls/vote/text/", "web/shared/js/core/poll-anonymous.js", "web/shared/js/core/answer-text.js"];
const VOTE_POINTS = ["web/polls/vote/points/", "web/shared/js/core/poll-anonymous.js"];
const VOTE_QR = ["web/polls/vote/qr/", "web/shared/js/core/poll-links.js"];
const TASKS = [...page("tasks"), "web/shared/js/core/share-sections.js"];
const GO = [...page("go"), "web/shared/js/core/go-contract.js"];

// Gry demo (data/demo.cjs, MORE_GAMES): 110 + indeks.
const G = {
  draftPoints: id("8000", 116),  // „Pubowy quiz czwartkowy” -- punktowa, szkic, 10 pytań
  draftText: id("8000", 121),    // „Klub seniora” -- tekstowa, szkic, 4 pytania (za mało)
  readyText: id("8000", 114),    // „Turniej klas 8” -- tekstowa, gotowa
  readyPoints: id("8000", 122),  // „Urodziny Zosi” -- punktowa, gotowa
};
const KEY = (gameId) => `poll${gameId.slice(-3)}KEY`;

// ---------- kroki ----------
const wait = (ms) => async (view) => { await view.waitForTimeout(ms); };
const click = (selector, ms = 400) => async (view) => { await view.locator(selector).first().click(); await view.waitForTimeout(ms); };
// Wspólne okno potwierdzenia (confirmModal z modal.js) po prawdziwym przycisku.
const confirmFrom = (selector) => async (view) => {
  await view.locator(selector).first().waitFor({ state: "visible", timeout: 8000 });
  await view.waitForFunction((sel) => !document.querySelector(sel)?.disabled, selector, { timeout: 8000 });
  await view.locator(selector).first().click();
  await view.locator(".uni-modal:visible").first().waitFor({ timeout: 5000 });
  await view.waitForTimeout(350);
};
const enterTally = async (view) => {
  await view.locator("#tabResults").click();
  await view.waitForFunction(() => !document.getElementById("btnTallyPoll")?.disabled && !document.getElementById("btnTallyPoll")?.hidden, null, { timeout: 8000 });
  await view.locator("#btnTallyPoll").click();
  await view.locator("#tallyBar:not([hidden])").waitFor({ timeout: 8000 });
  await view.locator(".tallyRow").first().waitFor({ timeout: 8000 });
  await view.waitForTimeout(400);
};
// Wiersz podliczania tekstowego po tekście odpowiedzi (pole .aTxtInp).
const itemIdOf = (view, text) => view.evaluate((t) => [...document.querySelectorAll(".tallyRow")].find((r) => r.querySelector(".aTxtInp")?.value === t)?.dataset.itemId, text);
const mergeBtn = (itemId) => `.tallyRow[data-item-id="${itemId}"] .tcMergeBtn`;
const tallyRow = (itemId) => `.tallyRow[data-item-id="${itemId}"]`;
// Scalanie jak u użytkownika: telefon -- przycisk „Połącz z…” na obu wierszach,
// komputer -- przeciągnięcie uchwytu na wiersz docelowy.
async function mergeRows(view, device, from, to) {
  const a = await itemIdOf(view, from);
  const b = await itemIdOf(view, to);
  if (device === "phone") {
    await view.locator(mergeBtn(a)).click();
    await view.waitForTimeout(150);
    await view.locator(mergeBtn(b)).click();
  } else {
    await view.locator(`${tallyRow(a)} .tcHandle`).dragTo(view.locator(tallyRow(b)));
  }
  await view.waitForTimeout(250);
}
// Początek scalania: telefon -- wybrane źródło (podświetlone cele), komputer --
// uchwyt przeciągany nad wierszem docelowym (zrzut w trakcie przeciągania).
async function startMerge(view, device, from, to) {
  const a = await itemIdOf(view, from);
  if (device === "phone") { await view.locator(mergeBtn(a)).click(); await view.waitForTimeout(300); return; }
  const b = await itemIdOf(view, to);
  const h = await view.locator(`${tallyRow(a)} .tcHandle`).boundingBox();
  const r = await view.locator(tallyRow(b)).boundingBox();
  await view.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await view.mouse.down();
  await view.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 8 });
  await view.mouse.move(r.x + r.width / 2 + 4, r.y + r.height / 2, { steps: 2 });
  await view.waitForTimeout(300);
}

// ---------- dane ----------
const game = (db, gameId) => db.tables.games.find((g) => g.id === gameId);
// Zmiana stanu ankiety demo razem z regułami (game_validate czyta rules_state).
function setPollStatus(db, gameId, status) {
  const g = game(db, gameId);
  const ok = { ok: true };
  const no = (code) => ({ ok: false, code, params: {} });
  const open = status === "poll_open";
  const stopped = status === "poll_stopped";
  g.status = status;
  Object.assign(g.rules_state, {
    edit: open ? no("pollOpenNoEdit") : stopped ? no("pollStoppedNoEdit") : ok,
    poll_open: open ? no("pollAlreadyOpen") : ok,
    poll_stop: open ? ok : no("stopOnlyOpen"),
    poll_resume: stopped ? ok : no("resumeOnlyStopped"),
    poll_close: open || stopped ? ok : no("closeOnlyOpen"),
  });
}
// Szkic: jeszcze nikogo nie zaproszono.
const noTasks = (db) => { db.rpc.poll_share_panel = { ...db.rpc.poll_share_panel, tasks: [] }; };

// Odpowiedzi „z ulicy” do scalania: pierwsze pytanie „Szybkiej ankiety”
// (Co robisz w niedzielę rano?) -- [tekst, głosy, odpowiedź docelowa].
const MESSY = {
  pl: [["śniadanie", 3, "jem śniadanie"], ["kościół", 2, "idę do kościoła"], ["śpię długo", 2, "śpię"]],
  en: [["breakfast", 3, "have breakfast"], ["church", 2, "go to church"], ["sleeping", 2, "sleep in"]],
  uk: [["сніданок", 3, "снідаю"], ["церква", 2, "іду до церкви"], ["довго сплю", 2, "сплю"]],
};
function messyTextTally(db, lang) {
  setPollStatus(db, IDS.textPoll, "poll_stopped");
  db.rpc.poll_text_tally_draft_save = { ok: true };
  const orig = db.rpc.poll_tally_source.slice(3);
  db.rpc.poll_tally_source = `fn:(args, db) => {
    const out = (${orig})(args, db);
    if (args.p_game_id === ${JSON.stringify(IDS.textPoll)} && out?.questions?.[0]) {
      out.questions[0].items.push(...${JSON.stringify(MESSY[lang].map(([text, count]) => ({ text, count })))});
    }
    return out;
  }`;
}

// /tasks/: zadanie z zaproszenia (tasks_list z demo.cjs ma token id("8a10", n)).
const firstTaskToken = id("8a10", 1);

// /go/: identyfikatory linków (UUID spoza zakresu ankiet demo).
const TOKEN = id("a000", 1);
const OWNER = (lang) => panel[lang].friends.accepted[0][0];
const goResolve = (db, data) => { db.rpc.poll_go_resolve = { ok: true, ...data }; };

// Głosowanie: stan ankiety względem klucza z linku.
const pollState = (state, type) => (db) => { db.rpc.poll_state = { ok: true, state, type }; };
const answerPoints = (n) => async (view) => {
  for (let i = 0; i < n; i++) {
    await view.locator("#alist button").first().click();
    await view.waitForTimeout(120);
  }
};
const answerText = (n, words) => async (view, { lang }) => {
  for (let i = 0; i < n; i++) {
    const inp = view.locator("#answerInput");
    await inp.waitFor({ state: "visible" });
    await inp.fill(words[lang][i % words[lang].length]);
    await view.locator("#btnSend").click();
    await view.waitForTimeout(120);
  }
};
const WORDS = {
  pl: ["Kanapki", "Burek", "Śpię", "Lodówkę", "Jabłko", "Śnieg", "Nad morze", "Pieniądze", "Frytki", "Czytam"],
  en: ["Sandwiches", "Max", "Sleep in", "Fridge", "Apple", "Snow", "The seaside", "Money", "Chips", "Read"],
  uk: ["Бутерброди", "Рекс", "Сплю", "Холодильник", "Яблуко", "Сніг", "На море", "Гроші", "Картопля фрі", "Читаю"],
};

const P = { category: "polls" };
module.exports = [
  // ================= /polls/ — stany ankiety =================
  { ...P, id: "polls-draft-points", title: "Ankieta punktowa — SZKIC (udostępnianie zablokowane do uruchomienia)", path: `/polls/?id=${G.draftPoints}`, sources: POLLS, ready: "#cardMain.skel-step-ready", db: noTasks,
    steps: [async (view) => { await view.waitForFunction(() => !document.getElementById("btnOpenPoll")?.disabled, null, { timeout: 8000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "polls-draft-text-blocked", title: "Ankieta tekstowa — SZKIC zablokowany (za mało pytań, podpowiedź przy „Uruchom”)", path: `/polls/?id=${G.draftText}`, sources: [...POLLS, "web/shared/js/core/game-validate.js"], ready: "#cardMain.skel-step-ready", db: noTasks,
    steps: [async (view) => { await view.waitForFunction(() => document.getElementById("hintTop")?.textContent.trim().length > 0, null, { timeout: 8000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "polls-draft-text-blocked-slow", title: "Ankieta tekstowa — powód blokady po wolnym odczycie", path: `/polls/?id=${G.draftText}`, sources: [...POLLS, "web/shared/js/core/page-layout.js"], devices: ["desktop", "phone", "phone-360"], ready: "#cardMain.skel-step-ready",
    db: (db) => { noTasks(db); db.latency = 250; } },
  { ...P, id: "polls-recipients-modal-empty", title: "Okno „Dodaj odbiorców” — brak znajomych i subskrybentów", path: `/polls/?id=${IDS.textPoll}`, sources: [...POLLS, "web/shared/js/core/share-sections.js"], ready: "#cardMain.skel-step-ready",
    db: (db) => { db.rpc.poll_share_panel = { ok: true, friends: [], subscribers: [], tasks: [] }; },
    steps: [async (view) => {
      const tab = view.locator("#tabRecipients");
      if (await tab.isVisible()) await tab.click();
      await view.locator("#btnAddRecipients").click();
      await view.locator("#pollRecipientsOverlay").waitFor({ state: "visible", timeout: 5000 });
      await view.waitForTimeout(400);
    }] },
  { ...P, id: "polls-open-text-share", title: "Ankieta tekstowa — OTWARTA, Udostępnianie (link, QR, odbiorcy)", path: `/polls/?id=${IDS.textPoll}`, sources: POLLS, ready: "#cardMain.skel-step-ready", settle: 800 },
  { ...P, id: "polls-open-recipients-tab", devices: ["phone"], title: "Ankieta otwarta na telefonie — zakładka Odbiorcy (stany zaproszeń)", path: `/polls/?id=${IDS.poll}`, sources: [...POLLS, "web/shared/js/core/share-sections.js"], ready: "#cardMain.skel-step-ready",
    steps: [click("#tabRecipients", 600)] },
  { ...P, id: "polls-qr-display-modal", title: "Okno „QR na wyświetlaczu” — kod podłączenia urządzenia", path: `/polls/?id=${IDS.poll}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [async (view) => {
      await view.waitForFunction(() => !document.getElementById("btnOpenQr")?.disabled, null, { timeout: 8000 });
      await view.locator("#btnOpenQr").click();
      await view.locator("#pollQrModalOverlay:not(.hidden)").waitFor({ timeout: 5000 });
      await view.waitForFunction(() => /\d/.test(document.getElementById("pollQrModalCodeVal")?.textContent || ""), null, { timeout: 5000 });
      await view.waitForTimeout(300);
    }] },
  { ...P, id: "polls-qr-vote-modal", title: "Okno powiększonego kodu QR do głosowania (kliknięty mały QR)", path: `/polls/?id=${IDS.poll}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [async (view) => {
      await view.locator("#qr img").first().waitFor({ timeout: 8000 });
      await view.locator("#qr").click();
      await view.locator("#pollQrModalVote img").waitFor({ timeout: 5000 });
      await view.waitForTimeout(300);
    }] },
  { ...P, id: "polls-open-confirm", title: "Okno potwierdzenia — uruchomienie ankiety ze szkicu", path: `/polls/?id=${G.draftPoints}`, sources: POLLS, ready: "#cardMain.skel-step-ready", db: noTasks,
    steps: [confirmFrom("#btnOpenPoll")] },
  { ...P, id: "polls-stop-confirm", title: "Okno potwierdzenia — zatrzymanie otwartej ankiety", path: `/polls/?id=${IDS.poll}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [confirmFrom("#btnStopPoll")] },
  { ...P, id: "polls-abort-confirm", title: "Okno potwierdzenia — przerwanie ankiety (głosy przepadają)", path: `/polls/?id=${IDS.poll}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [confirmFrom("#btnAbort")] },
  { ...P, id: "polls-stopped-text-share", title: "Ankieta tekstowa — ZATRZYMANA, Udostępnianie (wysyłka wstrzymana)", path: `/polls/?id=${IDS.tallyTie}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [click("#tabShare", 600)] },
  { ...P, id: "polls-resume-confirm", title: "Okno potwierdzenia — wznowienie zatrzymanej ankiety", path: `/polls/?id=${IDS.pollStopped}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [confirmFrom("#btnResumePoll")] },
  { ...P, id: "polls-tally-text-merge", title: "Podliczanie tekstowe — scalanie: wybrana odpowiedź do połączenia, za dużo odpowiedzi", path: `/polls/?id=${IDS.textPoll}`, sources: TALLY, ready: "#cardMain.skel-step-ready", db: messyTextTally,
    steps: [enterTally, async (view, { lang, device }) => { await startMerge(view, device, MESSY[lang][0][0], MESSY[lang][0][2]); }] },
  { ...P, id: "polls-tally-text-merged", title: "Podliczanie tekstowe — po scaleniu (Cofnij aktywne, 3–6 odpowiedzi spełnione)", path: `/polls/?id=${IDS.textPoll}`, sources: TALLY, ready: "#cardMain.skel-step-ready", db: messyTextTally,
    steps: [enterTally, async (view, { lang, device }) => {
      for (const [from, , to] of MESSY[lang]) await mergeRows(view, device, from, to);
      await view.waitForFunction(() => !document.getElementById("btnUndo")?.disabled, null, { timeout: 5000 });
      await view.waitForTimeout(1500); // zapis szkicu (opóźniony)
    }] },
  { ...P, id: "polls-tally-text-approve", title: "Okno potwierdzenia — zatwierdzenie podliczenia ankiety tekstowej", path: `/polls/?id=${IDS.textPoll}`, sources: TALLY, ready: "#cardMain.skel-step-ready", db: messyTextTally,
    steps: [enterTally, async (view, { lang, device }) => {
      for (const [from, , to] of MESSY[lang]) await mergeRows(view, device, from, to);
    }, confirmFrom("#btnApproveTally")] },
  { ...P, id: "polls-tally-points-approve", title: "Okno potwierdzenia — zatwierdzenie podliczenia ankiety punktowej", path: `/polls/?id=${IDS.pollStopped}`, sources: TALLY, ready: "#cardMain.skel-step-ready",
    steps: [enterTally, confirmFrom("#btnApproveTally")] },
  { ...P, id: "polls-tally-abort-confirm", title: "Okno potwierdzenia — przerwanie ankiety w trakcie podliczania", path: `/polls/?id=${IDS.pollStopped}`, sources: TALLY, ready: "#cardMain.skel-step-ready",
    steps: [enterTally, confirmFrom("#btnAbort")] },
  { ...P, id: "polls-ready-points", title: "Ankieta punktowa — GOTOWA, ostateczne punkty", path: `/polls/?id=${G.readyPoints}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [async (view) => { await view.locator("#resultsList.skel-step-ready").waitFor({ timeout: 8000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "polls-ready-text", title: "Ankieta tekstowa — GOTOWA, ostateczne punkty", path: `/polls/?id=${G.readyText}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [async (view) => { await view.locator("#resultsList.skel-step-ready").waitFor({ timeout: 8000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "polls-reopen-confirm", title: "Okno potwierdzenia — ponowne uruchomienie gotowej ankiety", path: `/polls/?id=${G.readyPoints}`, sources: POLLS, ready: "#cardMain.skel-step-ready",
    steps: [confirmFrom("#btnReopenPoll")] },

  // ================= /polls/vote/points/ =================
  { ...P, id: "polls-vote-points-progress", title: "Głosowanie punktowe — w trakcie (pytanie 4 z 10)", path: `/polls/vote/points/?id=${IDS.poll}&key=poll103KEY`, sources: VOTE_POINTS, ready: "#qbox",
    steps: [answerPoints(3), wait(300)] },
  { ...P, id: "polls-vote-points-thanks", title: "Głosowanie punktowe — po oddaniu głosu (podziękowanie)", path: `/polls/vote/points/?id=${IDS.poll}&key=poll103KEY`, sources: VOTE_POINTS, ready: "#qbox",
    db: (db) => { db.rpc.poll_anonymous_submit = { ok: true }; },
    steps: [answerPoints(10), async (view) => { await view.waitForFunction(() => document.getElementById("qbox")?.style.display === "none", null, { timeout: 5000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "polls-vote-points-retry", title: "Głosowanie punktowe — wysyłka odrzucona chwilowo (ponów za chwilę)", path: `/polls/vote/points/?id=${IDS.poll}&key=poll103KEY`, sources: [...VOTE_POINTS, "web/shared/js/core/poll-submit-retry.js"], ready: "#qbox",
    db: (db) => { db.rpc.poll_anonymous_submit = { ok: false, error: "rate_limited", retry_after: 45 }; },
    steps: [answerPoints(10), wait(800)] },
  { ...P, id: "polls-vote-points-stopped", title: "Głosowanie punktowe — ankieta zatrzymana", path: `/polls/vote/points/?id=${IDS.pollStopped}&key=${KEY(IDS.pollStopped)}`, sources: VOTE_POINTS, ready: "#closed", db: pollState("stopped", "poll_points") },
  { ...P, id: "polls-vote-points-ended", title: "Głosowanie punktowe — ankieta zakończona", path: `/polls/vote/points/?id=${G.readyPoints}&key=${KEY(G.readyPoints)}`, sources: VOTE_POINTS, ready: "#closed", db: pollState("ended", "poll_points") },
  { ...P, id: "polls-vote-points-expired", title: "Głosowanie punktowe — link wygasł (ankieta uruchomiona ponownie)", path: `/polls/vote/points/?id=${IDS.poll}&key=staryKLUCZ`, sources: VOTE_POINTS, ready: "#closed", db: pollState("expired", "poll_points") },
  { ...P, id: "polls-vote-points-invite-done", title: "Głosowanie z zaproszenia — głos już oddany", path: `/polls/vote/points/?t=${firstTaskToken}`, sources: VOTE_POINTS, ready: "#closed",
    db: (db) => { db.rpc.poll_task_resolve = { ok: false, error: "already_done" }; } },

  // ================= /polls/vote/text/ =================
  { ...P, id: "polls-vote-text-typing", title: "Głosowanie tekstowe — wpisana odpowiedź (licznik znaków)", path: `/polls/vote/text/?id=${IDS.textPoll}&key=poll104KEY`, sources: VOTE_TEXT, ready: "#answerInput",
    steps: [answerText(2, WORDS), async (view, { lang }) => { await view.locator("#answerInput").pressSequentially({ pl: "Śpię do południa", en: "Sleep till noon", uk: "Сплю до обіду" }[lang]); await view.waitForTimeout(300); }] },
  { ...P, id: "polls-vote-text-thanks", title: "Głosowanie tekstowe — po oddaniu głosu (podziękowanie)", path: `/polls/vote/text/?id=${IDS.textPoll}&key=poll104KEY`, sources: VOTE_TEXT, ready: "#answerInput",
    db: (db) => { db.rpc.poll_anonymous_submit = { ok: true }; },
    steps: [answerText(10, WORDS), async (view) => { await view.waitForFunction(() => document.getElementById("qbox")?.style.display === "none", null, { timeout: 5000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "polls-vote-text-stopped", title: "Głosowanie tekstowe — ankieta zatrzymana", path: `/polls/vote/text/?id=${IDS.tallyTie}&key=${KEY(IDS.tallyTie)}`, sources: VOTE_TEXT, ready: "#closed", db: pollState("stopped", "poll_text") },
  { ...P, id: "polls-vote-text-ended", title: "Głosowanie tekstowe — ankieta zakończona", path: `/polls/vote/text/?id=${G.readyText}&key=${KEY(G.readyText)}`, sources: VOTE_TEXT, ready: "#closed", db: pollState("ended", "poll_text") },
  { ...P, id: "polls-vote-text-expired", title: "Głosowanie tekstowe — link wygasł", path: `/polls/vote/text/?id=${IDS.textPoll}&key=staryKLUCZ`, sources: VOTE_TEXT, ready: "#closed", db: pollState("expired", "poll_text") },
  { ...P, id: "polls-vote-text-not-found", title: "Głosowanie tekstowe — ankiety nie ma (usunięta)", path: `/polls/vote/text/?id=${id("a000", 9)}&key=brakKLUCZ`, sources: VOTE_TEXT, ready: "#closed", db: pollState("not_found", "poll_text") },

  // ================= /polls/vote/qr/ (ekran QR na wyświetlaczu, tylko duży ekran) =================
  { ...P, id: "polls-vote-qr", guest: true, devices: ["desktop"], title: "Wyświetlacz QR ankiety — aktywna (kod do głosowania)", path: `/polls/vote/qr/?id=${IDS.poll}&key=poll103KEY`, sources: VOTE_QR, ready: "#qr img",
    db: (db) => { db.rpc.get_poll_game = { game: { id: IDS.poll, status: "poll_open", poll_qr_lang: null } }; } },
  { ...P, id: "polls-vote-qr-ended", guest: true, devices: ["desktop"], title: "Wyświetlacz QR ankiety — ankieta zakończona", path: `/polls/vote/qr/?id=${G.readyPoints}&key=${KEY(G.readyPoints)}`, sources: VOTE_QR, ready: ".qr-container.is-ended",
    db: (db) => { db.rpc.get_poll_game = { game: { id: G.readyPoints, status: "ready", poll_qr_lang: null } }; } },
  { ...P, id: "polls-vote-qr-expired", guest: true, devices: ["desktop"], title: "Wyświetlacz QR ankiety — link wygasł", path: `/polls/vote/qr/?id=${IDS.poll}&key=staryKLUCZ`, sources: VOTE_QR, ready: ".qr-container.is-ended",
    db: (db) => { db.rpc.get_poll_game = { game: { id: IDS.poll, status: "draft", poll_qr_lang: null } }; } },
  { ...P, id: "polls-vote-qr-phone", guest: true, devices: ["phone"], title: "Wyświetlacz QR ankiety na telefonie — blokada urządzenia", path: `/polls/vote/qr/?id=${IDS.poll}&key=poll103KEY`, sources: [...VOTE_QR, "web/shared/js/core/device-guard.js"], ready: () => !document.documentElement.classList.contains("page-loading"),
    db: (db) => { db.rpc.get_poll_game = { game: { id: IDS.poll, status: "poll_open", poll_qr_lang: null } }; } },

  // ================= /tasks/ =================
  { ...P, id: "tasks-done-open", title: "Zadania — rozwinięta sekcja Zrobione", path: "/tasks/", sources: TASKS, ready: "#tasksHost > *",
    steps: [async (view) => { await view.locator("#tasksHost .rowsSectionHead").nth(1).click(); await view.waitForTimeout(400); }] },
  { ...P, id: "tasks-only-done", title: "Zadania — wszystko zrobione (brak zadań do zrobienia)", path: "/tasks/", sources: TASKS, ready: "#tasksHost > *",
    db: (db) => { db.rpc.tasks_list = db.rpc.tasks_list.filter((x) => x.state === "done"); },
    steps: [async (view) => { await view.locator("#tasksHost .rowsSectionHead").first().click(); await view.waitForTimeout(400); }] },
  { ...P, id: "tasks-empty", title: "Zadania — pusta lista", path: "/tasks/", sources: TASKS, ready: "#tasksHost > *", db: (db) => { db.rpc.tasks_list = []; } },
  { ...P, id: "tasks-focus", title: "Zadania — wejście z linku (wyróżnione zaproszenie)", path: `/tasks/?t=${firstTaskToken}`, sources: TASKS, ready: "#tasksHost .rowsFocus" },
  { ...P, id: "tasks-decline-confirm", title: "Zadania — okno potwierdzenia odrzucenia ankiety", path: "/tasks/", sources: TASKS, ready: "#tasksHost > *",
    steps: [confirmFrom('#tasksHost .rowsAct[data-act="decline"]')] },
  { ...P, id: "tasks-load-error", title: "Zadania — błąd wczytywania (przycisk Ponów)", path: "/tasks/", sources: TASKS, ready: "#tasksLoadRetryWrap:not([hidden])",
    db: (db) => { db.rpc.tasks_list = "fn:() => { throw new Error(\"network\"); }"; } },

  // ================= /go/ — linki z e-maili =================
  { ...P, id: "go-poll-invite", guest: true, title: "Link: zaproszenie do ankiety (bez konta) — Głosuj / Odrzuć", path: `/go/?t=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "task", status: "pending", game_name: panel[lang].poll, owner_label: OWNER(lang), poll_type: "poll_points", recipient_user_id: null, recipient_email: "babcia.halina@example.test" }) },
  { ...P, id: "go-poll-invite-account", title: "Link: zaproszenie do ankiety (zalogowany adresat) — przejdź do Zadań", path: `/go/?t=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "task", status: "pending", game_name: panel[lang].poll, owner_label: OWNER(lang), poll_type: "poll_text", recipient_user_id: USER_ID, recipient_email: db.user.email }) },
  { ...P, id: "go-poll-invite-login", guest: true, title: "Link: zaproszenie do ankiety dla konta — zaloguj się", path: `/go/?t=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "task", status: "pending", game_name: panel[lang].poll, owner_label: OWNER(lang), poll_type: "poll_points", recipient_user_id: id("8810", 7), recipient_email: "anna.nowak@example.test" }) },
  { ...P, id: "go-poll-invite-done", guest: true, title: "Link: zaproszenie do ankiety — głos już oddany", path: `/go/?t=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db, lang) => goResolve(db, { kind: "task", status: "done", game_name: panel[lang].poll, owner_label: OWNER(lang), poll_type: "poll_points", recipient_user_id: null, recipient_email: "babcia.halina@example.test" }) },
  { ...P, id: "go-poll-invite-declined", guest: true, title: "Link: zaproszenie do ankiety — odrzucone", path: `/go/?t=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db, lang) => goResolve(db, { kind: "task", status: "declined", game_name: panel[lang].poll, owner_label: OWNER(lang), poll_type: "poll_points", recipient_user_id: null, recipient_email: "babcia.halina@example.test" }) },
  { ...P, id: "go-poll-stopped", guest: true, title: "Link: zaproszenie do ankiety — ankieta zatrzymana", path: `/go/?t=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db) => { db.rpc.poll_go_resolve = { ok: false, error: "poll_stopped" }; } },
  { ...P, id: "go-poll-declined-done", guest: true, title: "Link: zaproszenie do ankiety — po kliknięciu „Odrzuć”", path: `/go/?t=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => { goResolve(db, { kind: "task", status: "pending", game_name: panel[lang].poll, owner_label: OWNER(lang), poll_type: "poll_points", recipient_user_id: null, recipient_email: "babcia.halina@example.test" }); db.rpc.poll_task_decline = "ok"; },
    steps: [async (view) => { await view.locator("#actions button").nth(1).click(); await view.waitForFunction(() => !document.querySelector("#actions button"), null, { timeout: 5000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "go-expired", guest: true, title: "Link: zaproszenie wygasło", path: `/go/?t=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db) => { db.rpc.poll_go_resolve = { ok: false, error: "expired" }; } },
  { ...P, id: "go-mismatch", title: "Link: zaproszenie dla innego konta (zalogowano na inne)", path: `/go/?t=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db, lang) => goResolve(db, { kind: "task", status: "pending", game_name: panel[lang].poll, owner_label: OWNER(lang), poll_type: "poll_points", recipient_user_id: id("8810", 7), recipient_email: "anna.nowak@example.test" }) },
  { ...P, id: "go-friend-invite", guest: true, title: "Link: zaproszenie do znajomych (bez logowania)", path: `/go/?f=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "friend", status: "pending", owner_label: OWNER(lang), recipient_matches_me: false }) },
  { ...P, id: "go-friend-invite-logged", title: "Link: zaproszenie do znajomych (zalogowany adresat)", path: `/go/?f=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "friend", status: "pending", owner_label: OWNER(lang), recipient_matches_me: true }) },
  { ...P, id: "go-friend-declined", title: "Link: zaproszenie do znajomych — odrzucone", path: `/go/?f=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "friend", status: "declined", owner_label: OWNER(lang), recipient_matches_me: true }) },
  { ...P, id: "go-base-invite", title: "Link: udostępniona baza pytań", path: `/go/?b=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "base", status: "pending", owner_label: OWNER(lang), recipient_matches_me: true, recipient_email: db.user.email }) },
  { ...P, id: "go-base-invite-login", guest: true, title: "Link: udostępniona baza pytań — zaloguj się", path: `/go/?b=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "base", status: "pending", owner_label: OWNER(lang), recipient_matches_me: false, recipient_email: "anna.nowak@example.test" }) },
  { ...P, id: "go-base-revoked", title: "Link: udostępnienie bazy cofnięte", path: `/go/?b=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db, lang) => goResolve(db, { kind: "base", status: "cancelled", owner_label: OWNER(lang), recipient_matches_me: true }) },
  { ...P, id: "go-copy-invite", title: "Link: odbiór kopii gry — Przyjmij / Odrzuć", path: `/go/?c=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => { db.rpc.resource_copy_go_resolve = { ok: true, kind: "copy", id: id("a100", 1), status: "pending", resource_kind: "game", name: panel[lang].game, sender_label: OWNER(lang), recipient_matches_me: true, recipient_email: db.user.email }; } },
  { ...P, id: "go-copy-accepted", title: "Link: odbiór kopii gry — przyjęta (otwórz)", path: `/go/?c=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => { db.rpc.resource_copy_go_resolve = { ok: true, kind: "copy", id: id("a100", 1), status: "pending", resource_kind: "game", name: panel[lang].game, sender_label: OWNER(lang), recipient_matches_me: true, recipient_email: db.user.email }; db.rpc.resource_copy_decide = { ok: true }; },
    steps: [async (view) => { await view.locator("#actions button.gold").click(); await view.waitForFunction(() => document.querySelectorAll("#actions button").length === 1, null, { timeout: 5000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "go-copy-login", guest: true, title: "Link: odbiór kopii logo — zaloguj się", path: `/go/?c=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => { db.rpc.resource_copy_go_resolve = { ok: true, kind: "copy", id: id("a100", 2), status: "pending", resource_kind: "logo", name: panel[lang].logos.classic, sender_label: OWNER(lang), recipient_matches_me: false, recipient_email: "anna.nowak@example.test" }; } },
  { ...P, id: "go-copy-expired", title: "Link: odbiór kopii — oferta wygasła", path: `/go/?c=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db, lang) => { db.rpc.resource_copy_go_resolve = { ok: true, kind: "copy", id: id("a100", 1), status: "expired", resource_kind: "game", name: panel[lang].game, sender_label: OWNER(lang), recipient_matches_me: true }; } },
  { ...P, id: "go-sub-invite", guest: true, title: "Link: zaproszenie do subskrypcji (e-mail bez konta) — Przyjmij / Odrzuć", path: `/go/?s=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "sub", status: "pending", owner_label: OWNER(lang), subscriber_email: "babcia.halina@example.test", registered_user_id: null }) },
  { ...P, id: "go-sub-active", guest: true, title: "Link: subskrypcja aktywna (po przyjęciu)", path: `/go/?s=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db, lang) => goResolve(db, { kind: "sub", status: "active", owner_label: OWNER(lang), subscriber_email: "babcia.halina@example.test", registered_user_id: null }) },
  { ...P, id: "go-unsub-owner", guest: true, title: "Link: wypisanie z wiadomości jednej osoby", path: `/go/?s=${TOKEN}&action=unsub`, sources: GO, ready: "#actions button",
    db: (db, lang) => goResolve(db, { kind: "sub", status: "active", owner_label: OWNER(lang), subscriber_email: "babcia.halina@example.test", registered_user_id: null }) },
  { ...P, id: "go-unsub-owner-done", guest: true, title: "Link: wypisanie z wiadomości jednej osoby — wypisano", path: `/go/?s=${TOKEN}&action=unsub`, sources: GO, ready: "#actions button",
    db: (db, lang) => { goResolve(db, { kind: "sub", status: "active", owner_label: OWNER(lang), subscriber_email: "babcia.halina@example.test", registered_user_id: null }); db.rpc.poll_sub_unsubscribe = { ok: true, owner_label: OWNER(lang) }; },
    steps: [async (view) => { await view.locator("#actions button").click(); await view.waitForFunction(() => !document.querySelector("#actions button"), null, { timeout: 5000 }); await view.waitForTimeout(300); }] },
  { ...P, id: "go-unsub-global", guest: true, title: "Link: wypisanie ze wszystkich wiadomości Familiady", path: `/go/?u=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db) => goResolve(db, { kind: "unsub", already_suppressed: false }) },
  { ...P, id: "go-unsub-global-already", guest: true, title: "Link: wypisanie ze wszystkich wiadomości — już wypisano", path: `/go/?u=${TOKEN}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])"),
    db: (db) => goResolve(db, { kind: "unsub", already_suppressed: true }) },
  { ...P, id: "go-device-expired", guest: true, title: "Link: udostępnione urządzenie (Wyświetlacz) — link wygasł", path: `/go/?d=display&id=${IDS.game}&key=${id("a200", 1)}`, sources: GO, ready: () => document.querySelector("#title:not([data-i18n])") && !/…|\.\.\./.test(document.getElementById("message")?.textContent || ""),
    db: (db) => { db.rpc.control_device_share_resolve = { state: "expired" }; } },
  { ...P, id: "go-anon-stopped", guest: true, title: "Link anonimowy do ankiety — ankieta zatrzymana", path: `/go/?p=anon&id=${id("a000", 5)}&key=anonKEY`, sources: [...GO, "web/shared/js/core/poll-links.js"], ready: () => document.querySelector("#title:not([data-i18n])") && !document.getElementById("message")?.textContent,
    db: pollState("stopped", "poll_points") },
  { ...P, id: "go-invalid", guest: true, title: "Link: nieprawidłowy (uszkodzony adres)", path: "/go/?t=nie-uuid", sources: GO, ready: () => document.querySelector("#title:not([data-i18n])") },
  { ...P, id: "go-network-error", guest: true, title: "Link: błąd sprawdzania (przycisk Ponów)", path: `/go/?t=${TOKEN}`, sources: GO, ready: "#actions button",
    db: (db) => { db.rpc.poll_go_resolve = "fn:() => { throw new Error(\"network\"); }"; } },
];
