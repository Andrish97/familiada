// tests/e2e/record-playthrough.js
//
// Nagrywa Control v2 + Display2 + Host2 + Buzzer2 W JEDNYM UJĘCIU (4 okna
// kafelkowane 2x2 na wirtualnym ekranie X11), z dźwiękiem — do przeglądu
// wizualnego, NIE część `npm test` / playwright.config.js. Scenariusze to
// TE SAME kroki co w tests/e2e/control2.spec.js (te same selektory, te
// same asercje-jako-punkty-synchronizacji, zamienione tu na krótkie
// oczekiwania żeby nagranie było oglądalne) — "system testów, który już
// mamy", owinięty w headed przeglądarkę + ffmpeg zamiast headless.
//
// Uruchamiane WYŁĄCZNIE przez .github/workflows/e2e-record.yml (ręczny
// workflow_dispatch) — ten skrypt sam w sobie niczego nie nagrywa bez
// działającego Xvfb (:99) i wirtualnego zlewu PulseAudio, oba
// przygotowywane przez ten workflow PRZED odpaleniem tego pliku.
//
// Wymagane zmienne środowiskowe (te same co istniejący e2e-tests.yml):
// E2E_BYPASS_SECRET, TEST_USERNAME, TEST_PASSWORD.
// Opcjonalnie: DISPLAY (domyślnie ":99"), PULSE_SINK (domyślnie "CaptureSink"),
// RECORD_OUT_DIR (domyślnie "tests/recordings").
//
// Uruchomienie lokalne (Linux z realnym X11 + audio, np. do próby przed CI):
//   DISPLAY=:0 PULSE_SINK=<istniejący sink> \
//     E2E_BYPASS_SECRET=... TEST_USERNAME=... TEST_PASSWORD=... \
//     node tests/e2e/record-playthrough.js
// Ten skrypt zakłada gotowe środowisko (Xvfb/PulseAudio) — nie uruchamia
// ich sam.

const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { loginAsTestUser } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online";
const DISPLAY_NUM = process.env.DISPLAY || ":99";
const PULSE_SINK = process.env.PULSE_SINK || "CaptureSink";
const OUT_DIR = process.env.RECORD_OUT_DIR || path.join(__dirname, "..", "recordings");
// control2/js/app.js's guardDesktopOnly() blokuje interakcję (#deviceGuard
// overlay przechwytuje kliknięcia) pod matchMedia('(max-width:980px)') —
// pierwszy przebieg z ćwiartkami 960px szerokości nadział się dokładnie na
// to. 2560x1440 -> ćwiartki 1280x720, bezpiecznie powyżej progu 980px.
const SCREEN_W = 2560, SCREEN_H = 1440;
const QUAD_W = SCREEN_W / 2, QUAD_H = SCREEN_H / 2;

// ===== Pomocnicze — skopiowane z control2.spec.js. Zamierzone
// duplikowanie tego małego, samodzielnego bloku zamiast refaktoru
// działającego pliku testowego (żeby nie ryzykować jego zepsucia bez
// możliwości uruchomienia go stąd dla sprawdzenia). =====

async function makeGame(page, name, { settings = {}, roundQuestions = [], finalAnswerPts = null } = {}) {
  return page.evaluate(async ({ name, settings, roundQuestions, finalAnswerPts }) => {
    // js/pages/editor.js's clip17()/normQ() clip answer/question text
    // client-side before a real user's save ever reaches the DB (maxlength=17
    // on the input, same limit here) — the DB's CHECK constraint is a second
    // line of defense, not the primary UX. Ten test wstawia bezpośrednio przez
    // Supabase, z pominięciem tego UI, więc musi sam sobie zrobić to samo
    // obcięcie, żeby literał wpisany tutaj nigdy nie wywalał 400 z bazy.
    const clip17 = (s) => String(s ?? "").trim().slice(0, 17);
    const clip200 = (s) => String(s ?? "").trim().slice(0, 200);

    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: g, error: gErr } = await sb
      .from("games")
      .insert({
        name, owner_id: userData.user.id, type: "prepared", status: "ready",
        settings: { teams: { teamA: "Alfa", teamB: "Beta" }, game: { hasFinal: false }, ...settings },
      })
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .single();
    if (gErr) throw new Error("insert games failed: " + gErr.message);

    for (const q of roundQuestions) {
      const { data: qRow, error: qErr } = await sb
        .from("questions").insert({ game_id: g.id, ord: q.ord, text: clip200(q.text) }).select("id").single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);
      const { error: aErr } = await sb.from("answers").insert(
        q.answers.map((a) => ({ ...a, question_id: qRow.id, text: clip17(a.text) }))
      );
      if (aErr) throw new Error("insert answers failed: " + aErr.message);
    }

    let finalPicked = [];
    if (finalAnswerPts) {
      for (let i = 1; i <= 5; i++) {
        const { data: fq, error: fqErr } = await sb
          .from("questions").insert({ game_id: g.id, ord: 100 + i, text: clip200(`Pytanie finałowe ${i}`) }).select("id").single();
        if (fqErr) throw new Error("insert final question failed: " + fqErr.message);
        const { error: faErr } = await sb.from("answers").insert([
          { question_id: fq.id, ord: 1, text: clip17("Odp. finałowa"), fixed_points: finalAnswerPts },
        ]);
        if (faErr) throw new Error("insert final answer failed: " + faErr.message);
        finalPicked.push({ id: fq.id });
      }
      // Scal z tym, co już przyszło w `settings` (np. game.advanced.finalMinPoints
      // dla scenariuszy progresji rund) zamiast nadpisywać cały obiekt — inaczej
      // ten update kasowałby ustawienia zaawansowane wstawione przy tworzeniu gry.
      const { error: upErr } = await sb.from("games").update({
        settings: {
          teams: { teamA: "Alfa", teamB: "Beta" },
          ...settings,
          game: { ...(settings.game || {}), hasFinal: true, finalQuestionsMode: "pick" },
          questions: { final: finalPicked, rounds: [] },
        },
      }).eq("id", g.id);
      if (upErr) throw new Error("update final settings failed: " + upErr.message);
    }

    return g;
  }, { name, settings, roundQuestions, finalAnswerPts });
}

async function deleteGame(page, gameId) {
  await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    await sb.from("games").delete().eq("id", gid);
  }, gameId).catch(() => {});
}

// 5 odpowiedzi (nie 3, zgłoszone: "pytanie nie może mieć 3 odpowiedzi") —
// realistycznie brzmiąca treść zamiast gołych "Odpowiedź A/B/C", żeby
// nagranie wyglądało jak prawdziwa gra, nie syntetyczny fixture.
const TWO_QUESTIONS = [
  { ord: 1, text: "Co ludzie robią rano przed pracą?", answers: [
    { ord: 1, text: "Piją kawę", fixed_points: 40 },
    { ord: 2, text: "Biorą prysznic", fixed_points: 25 },
    { ord: 3, text: "Sprawdzają telefon", fixed_points: 15 },
    { ord: 4, text: "Jedzą śniadanie", fixed_points: 12 },
    { ord: 5, text: "Ścielą łóżko", fixed_points: 8 },
  ] },
  { ord: 2, text: "Co ludzie najczęściej zapominają zabrać z domu?", answers: [
    { ord: 1, text: "Klucze", fixed_points: 38 },
    { ord: 2, text: "Telefon", fixed_points: 27 },
    { ord: 3, text: "Portfel", fixed_points: 18 },
    { ord: 4, text: "Parasol", fixed_points: 10 },
    { ord: 5, text: "Okulary", fixed_points: 7 },
  ] },
];

// 3 rundy do scenariusza "progresja + próg", KAŻDA z 5 odpowiedziami
// (zgłoszone: "pytanie nie może mieć 3 odpowiedzi") i wszystkimi
// odsłoniętymi naturalnie przez PLAY (nie tylko duel-win + jedna reszta) —
// kolejność i wartości punktów dobrane tak, żeby próg (finalMinPoints,
// obniżony do 180 w ustawieniach gry poniżej) padał dopiero PO trzeciej
// rundzie, nie wcześniej — inaczej runda 3. nigdy by się nie odbyła.
// Ręczne przeliczenie (patrz REDUCERS w control2/js/engine.js — R.revealed
// >= R.answers.length ustawia canEndRound niezależnie od tego, czy to
// zaszło przez pojedynek + zwykłe PLAY, czy przez STEAL):
//   R1: pojedynek wygrany za pierwszym razem (A, #1=40 top) -> reszta
//       (25+15+12+8) odsłonięta zwykłym PLAY -> bank 100 -> mnożnik r1=1
//       -> totals.A=100
//   R2: pojedynek — B pudłuje (X) -> BEZ resetu (to nie jest RESET, tylko
//       CONTINUE_SECOND) kolej NA DRUGĄ próbę idzie do A, która trafia
//       odpowiedź NIE-topową (#2=15) i WYGRYWA, bo B miał 0 -> reszta
//       (25 top + 12+5+3) odsłonięta w PLAY -> bank 60 -> mnożnik r2=1
//       -> totals.A=160
//   R3: pojedynek wygrany za pierwszym razem (A, #1=18 top) -> reszta
//       (14+10+6+4) odsłonięta w PLAY -> bank 52 -> mnożnik r3=1
//       -> totals.A=212 >= 180 -> PRÓG OSIĄGNIĘTY (dopiero teraz)
const PROGRESSION_QUESTIONS = [
  { ord: 1, text: "Ulubione zwierzę domowe", answers: [
    { ord: 1, text: "Pies", fixed_points: 40 },
    { ord: 2, text: "Kot", fixed_points: 25 },
    { ord: 3, text: "Chomik", fixed_points: 15 },
    { ord: 4, text: "Rybka", fixed_points: 12 },
    { ord: 5, text: "Papuga", fixed_points: 8 },
  ] },
  { ord: 2, text: "Czym ludzie jeżdżą do pracy", answers: [
    { ord: 1, text: "Samochodem", fixed_points: 25 },
    { ord: 2, text: "Autobusem", fixed_points: 15 },
    { ord: 3, text: "Rowerem", fixed_points: 12 },
    { ord: 4, text: "Pieszo", fixed_points: 5 },
    { ord: 5, text: "Metrem", fixed_points: 3 },
  ] },
  { ord: 3, text: "Co robimy w weekend", answers: [
    { ord: 1, text: "Odpoczywamy", fixed_points: 18 },
    { ord: 2, text: "Sprzątamy", fixed_points: 14 },
    { ord: 3, text: "Idziemy do kina", fixed_points: 10 },
    { ord: 4, text: "Spotykamy znajomych", fixed_points: 6 },
    { ord: 5, text: "Gotujemy", fixed_points: 4 },
  ] },
];
const PROGRESSION_FINAL_MIN_POINTS = 180;

// Runda "wejście do finału" dla scenariuszy 4/5 — 5 odpowiedzi (nie 1,
// zgłoszone: "pytanie nie może mieć 3 odpowiedzi", a jedna to było jeszcze
// gorzej), sumujące się do finalMinPoints domyślnego (300). Duel-win na
// topowej (120), reszta odsłonięta naturalnie w PLAY — dokładnie ten sam
// wzorzec co PROGRESSION_QUESTIONS, "wszystko odsłonięte" kończy rundę.
const FINAL_SETUP_ROUND = {
  ord: 1, text: "Ulubiona pora roku", answers: [
    { ord: 1, text: "Lato", fixed_points: 120 },
    { ord: 2, text: "Wiosna", fixed_points: 80 },
    { ord: 3, text: "Jesień", fixed_points: 50 },
    { ord: 4, text: "Zima", fixed_points: 30 },
    { ord: 5, text: "Nie mam ulubionej", fixed_points: 20 },
  ],
};

// Dwie rundy do scenariusza 6 (zerwanie i ponowne podłączenie urządzeń) —
// runda 1 przerwana W ŚRODKU pojedynku (rozłączenie następuje PO wygranym
// pojedynku, ale PRZED odsłonięciem reszty), runda 2 to nowy pojedynek
// rozegrany W CAŁOŚCI na już PONOWNIE podłączonym Buzzerze — dowód, że nowe
// urządzenie nie tylko "świeci na zielono", ale faktycznie bierze udział w
// rozgrywce (nie tylko presence, ale i realny zapis do game_state).
const RECONNECT_ROUND_1 = FINAL_SETUP_ROUND;
const RECONNECT_ROUND_2 = {
  ord: 2, text: "Co robimy, gdy zerwie się internet", answers: [
    { ord: 1, text: "Restartujemy router", fixed_points: 35 },
    { ord: 2, text: "Dzwonimy do dostawcy", fixed_points: 25 },
    { ord: 3, text: "Czekamy", fixed_points: 20 },
    { ord: 4, text: "Sprawdzamy telefon", fixed_points: 12 },
    { ord: 5, text: "Idziemy do sąsiada", fixed_points: 8 },
  ],
};

// ===== Kafelkowanie okien 2x2 na wirtualnym ekranie (CDP Browser.setWindowBounds) =====

const QUADRANTS = {
  control: { left: 0, top: 0, width: QUAD_W, height: QUAD_H },
  display: { left: QUAD_W, top: 0, width: QUAD_W, height: QUAD_H },
  host: { left: 0, top: QUAD_H, width: QUAD_W, height: QUAD_H },
  buzzer: { left: QUAD_W, top: QUAD_H, width: QUAD_W, height: QUAD_H },
};

async function positionWindow(context, page, bounds) {
  const session = await context.newCDPSession(page);
  const { windowId } = await session.send("Browser.getWindowForTarget");
  await session.send("Browser.setWindowBounds", { windowId, bounds: { ...bounds, windowState: "normal" } });
}

async function tileDevices(contexts, pages) {
  for (const name of ["control", "display", "host", "buzzer"]) {
    await positionWindow(contexts[name], pages[name], QUADRANTS[name]);
  }
}

// ===== Nagrywanie: cały wirtualny ekran + monitor wirtualnego zlewu audio =====

function startRecording(outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const args = [
    "-y",
    "-video_size", `${SCREEN_W}x${SCREEN_H}`,
    "-framerate", "30",
    "-f", "x11grab", "-i", DISPLAY_NUM,
    "-f", "pulse", "-i", `${PULSE_SINK}.monitor`,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    outFile,
  ];
  console.log("[record] ffmpeg", args.join(" "));
  return spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
}

async function stopRecording(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill("SIGINT"); // finalizuje plik zamiast urwać go w połowie
  await new Promise((resolve) => proc.once("exit", resolve));
}

// ===== Otwarcie i skasowanie 4 urządzeń jednej gry, po jednym oknie na ćwiartkę =====

async function openTiledDevices(browser, game) {
  const contexts = {};
  const pages = {};
  for (const name of ["control", "display", "host", "buzzer"]) {
    const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: null }); // viewport:null -> rozmiar okna, nie fixed viewport
    contexts[name] = ctx;
    pages[name] = await ctx.newPage();
  }
  await loginAsTestUser(pages.control, contexts.control);
  await tileDevices(contexts, pages);

  await Promise.all([
    pages.control.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" }),
    pages.display.goto(`/display2?id=${game.id}&key=${game.share_key_display}`, { waitUntil: "domcontentloaded" }),
    pages.host.goto(`/host2?id=${game.id}&key=${game.share_key_host}`, { waitUntil: "domcontentloaded" }),
    pages.buzzer.goto(`/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, { waitUntil: "domcontentloaded" }),
  ]);

  return { contexts, pages };
}

async function closeAll(contexts) {
  for (const ctx of Object.values(contexts)) await ctx.close().catch(() => {});
}

// ===== Zerwanie i ponowne podłączenie urządzenia PRZEZ MODAL (scenariusz 6) =====

const DOT_ID = { display: "dotDisplay", host: "dotHost", buzzer: "dotBuzzer" };

// control2/js/presence.js: urządzenie liczy się jako offline dopiero
// 15s (ONLINE_MS) po ostatnim pingu, sprawdzane co 1.5s (POLL_MS) —
// zamknięcie kontekstu przeglądarki nie zmienia kropki NATYCHMIAST, trzeba
// poczekać, aż ostatni ping faktycznie się zestarzeje. Timeout z zapasem
// ponad ten najgorszy przypadek (ostatni ping tuż przed zamknięciem +
// 15s + kolejny tick pollowania).
async function waitForDotStatus(control, kind, status, timeoutMs = 30_000) {
  await control.waitForFunction(
    ({ id, status }) => document.getElementById(id)?.className.includes(status),
    { id: DOT_ID[kind], status },
    { timeout: timeoutMs },
  );
}

// Modal kropki statusu (control2/js/app.js's showQrModal) koduje URL
// urządzenia jako obrazek qrserver.com's `data=` query param dla Hosta/
// Buzzera (jedyny sposób pokazania QR bez biblioteki po stronie klienta),
// a dla Wyświetlacza dodatkowo jako bezpośredni link "Otwórz" (#qrModalOpen
// — jedyny kind z widocznym przyciskiem, patrz komentarz przy tym elemencie
// w app.js). Czytamy URL DOKŁADNIE z tego, co modal pokazuje operatorowi —
// nie z osobno złożonego game.share_key_* — żeby scenariusz sprawdzał, że
// modal faktycznie prowadzi do właściwego urządzenia, a nie tylko że
// nawigacja pod z góry znanym URL-em działa.
async function readDeviceUrlFromModal(control, kind) {
  if (kind === "display") {
    return control.locator("#qrModalOpen").getAttribute("href");
  }
  const src = await control.locator("#qrModalImg").getAttribute("src");
  return decodeURIComponent(new URL(src).searchParams.get("data") || "");
}

// Pełny cykl "operator odzyskuje rozłączone urządzenie": klik na kropkę
// statusu w topbarze (klikalna PRZEZ CAŁĄ GRĘ, nie tylko na kroku
// Urządzenia — patrz app.js), odczyt linku/QR z modala, otwarcie go w
// ZUPEŁNIE NOWYM kontekście przeglądarki (świeży localStorage/deviceId —
// wierniejsza symulacja realnego ponownego podłączenia niż zwykły
// page.reload() tej samej, wciąż istniejącej karty), zamknięcie modala,
// czekanie na zieloną kropkę. Zwraca nowy {context, page} do podmiany w
// mapach contexts/pages wywołującego.
async function reconnectDeviceViaModal(browser, control, kind) {
  await control.locator(`#dot${kind[0].toUpperCase()}${kind.slice(1)}Row`).click();
  await control.waitForTimeout(1200); // widz ma zdążyć zobaczyć modal z kodem/QR/linkiem

  const url = await readDeviceUrlFromModal(control, kind);
  if (!url) throw new Error(`[record] modal (${kind}) nie pokazał żadnego URL-a do ponownego podłączenia`);

  const context = await browser.newContext({ baseURL: BASE_URL, viewport: null });
  const page = await context.newPage();
  await positionWindow(context, page, QUADRANTS[kind]);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  await control.locator("#qrModalClose").click();
  await waitForDotStatus(control, kind, "ok");
  return { context, page };
}

// Symuluje gest przesunięcia (peek) na Hoście — host2/js/main.js's
// setupPeekSwipe(): pointerdown -> pointerup w odległości >= 60px, lokalnie
// pokazuje to, co jest pod zasłoną pasma 2, BEZ żadnego zapisu do
// game_state (patrz notatka w figurze 7 "Mapa Rozgrywki": Host ma treść
// zawsze, zasłona to tylko wizualna nakładka). Ten podgląd sam się cofa
// przy KOLEJNEJ zmianie stanu (host2/js/render.js's `peeked = false` na
// nowym wierszu) — więc następna scripted akcja w scenariuszu naturalnie
// pokaże na nagraniu, że zasłona wraca sama.
async function hostPeekSwipe(hostPage) {
  await hostPage.mouse.move(300, 220);
  await hostPage.mouse.down();
  await hostPage.mouse.move(300, 360, { steps: 10 });
  await hostPage.mouse.up();
}

// ===== Odstęp między kolejnymi akcjami zmieniającymi grę. control2/js/
// persist.js's game_state_write() jest asynchroniczne i noszone po REALNEJ
// sieci (produkcja) — klikanie kolejnego przycisku, zanim poprzedni zapis
// wróci i rev się zaktualizuje, wysyła kolejny zapis z JUŻ NIEAKTUALNYM
// p_expected_rev (stale_write, patrz plan sekcja 4 o bezpiecznym retry).
// Zwykłe .click() Playwrighta czeka tylko, aż element jest klikalny w DOM —
// nie wie nic o tym asynchronicznym zapisie w tle.
//
// Stały odstęp (500ms) okazał się niewystarczający: na współdzielonym
// runnerze CI (4 konteksty przeglądarki + Xvfb + ffmpeg nagrywające na
// żywo) pojedynczy zapis do produkcyjnego Supabase czasem trwa dłużej niż
// 500ms, więc kolejne kliknięcie i tak trafiało na jeszcze nieodświeżony
// state.rev (run #34161808665: stale_write na 7. kliknięciu X w rundzie 2,
// mimo pełnego pacingu). Zamiast zgadywać stały czas, czekamy wprost na
// odpowiedź sieciową zapisu wywołanego tym kliknięciem — to samo, na co
// i tak czeka prawdziwy operator (patrz plan, sekcja 4: "przycisk pokazuje
// stan wysyłania, dopiero po potwierdzeniu... ekran się aktualizuje").
//
// 1200ms (nie 300ms) — zgłoszone: "przebieg jest zbyt szybki nie mam
// okazji nawet nic zauważyć". Ta wartość to pauza WIDZA (żeby zdążyć
// przeczytać, co się właśnie zmieniło na ekranie), nie techniczny wymóg
// zapisu — control2/js/ui.js ma teraz WŁASNĄ, niezależną blokadę
// odsłaniania na czas animacji Wyświetlacza (REVEAL_ANIM_MS=650ms,
// zgłoszone osobno: "nie idzie odsłonić następnej odpowiedzi jeśli
// pierwsza się nie pojawiła jeszcze na ekranie") — 1200ms tutaj jest
// nadwyżką NAD tamtą blokadą, nie próbą jej zastąpienia.
const CLICK_PACE_MS = 1200;
const WRITE_RPC_RE = /\/rpc\/(game_state_write|game_state_buzzer_press)(\?|$)/;

function waitForWrite(page) {
  // Zarejestruj oczekiwanie PRZED akcją, żeby nie przegapić odpowiedzi,
  // która wróci bardzo szybko. Nie każda akcja w tym scenariuszu wywołuje
  // zapis (np. czysto lokalne "Anuluj") — stąd .catch(() => null) zamiast
  // wywalać cały scenariusz na braku pasującej odpowiedzi.
  return page
    .waitForResponse((resp) => WRITE_RPC_RE.test(resp.url()), { timeout: 15000 })
    .catch(() => null);
}

async function clickPaced(locator, ms = CLICK_PACE_MS) {
  const page = locator.page();
  const responded = waitForWrite(page);
  await locator.click();
  await responded;
  await page.waitForTimeout(ms);
}

// Odpowiedź/X/"Oddaj kontrolę" idą przez zaznacz -> potwierdź
// (control2/js/ui.js's armableTile): pierwsze kliknięcie tylko uzbraja
// (złota obwódka) — CZYSTO LOKALNA zmiana UI, zero zapisu do game_state,
// więc clickPaced's waitForWrite by na niej wisiał do timeoutu. Uzbrojenie
// dostaje więc zwykły klik + krótką pauzę (żeby złota obwódka było widać w
// nagraniu), a dopiero drugi klik na TYM SAMYM elemencie idzie przez
// clickPaced jak każda inna akcja zapisująca stan.
async function armAndConfirmPaced(locator, ms = CLICK_PACE_MS) {
  const page = locator.page();
  await locator.click();
  await page.waitForTimeout(900); // widz ma zdążyć zobaczyć złotą obwódkę "uzbrojenia" przed potwierdzeniem
  await clickPaced(locator, ms);
}

// Kafelki odpowiedzi w Rundach nie pokazują już "#N" (control2/js/ui.js's
// renderRounds() pokazuje prawdziwy tekst odpowiedzi) — n-ty (1-bazowy)
// przycisk w jedynym renderowanym `.c2-tilegrid` to zawsze odpowiedź o
// ord=n, patrz identyczny komentarz przy control2.spec.js's answerTile().
function answerTile(control, n) {
  return control.locator(".c2-tilegrid button").nth(n - 1);
}

// Jak clickPaced, ale dla .fill()/.check() — SET_ENTRY_TEXT/SET_REPEAT też
// zapisują do game_state (ui.js's "input"/"change" listenery), więc podlegają
// dokładnie temu samemu wyścigowi z p_expected_rev co kliknięcia.
async function fillPaced(locator, text, ms = CLICK_PACE_MS) {
  const page = locator.page();
  const responded = waitForWrite(page);
  await locator.fill(text);
  await responded;
  await page.waitForTimeout(ms);
}

// To nagranie ma pokazywać, jak realnie wygląda praca operatora — .fill()
// wsadza cały tekst do pola w jednej klatce, co na wideo wygląda jak wklejenie,
// nie jak wpisywanie. Tu wpisujemy znak po znaku.
//
// WAŻNE: ui.js po KAŻDYM zapisie (SET_ENTRY_TEXT) przebudowuje cały #app —
// stary <input> znika, w jego miejsce wchodzi nowy element DOM. Pierwsza
// wersja robiła jeden .click() (focus) na starcie i dalej sypała znaki przez
// page.keyboard.insertText() na to, co ma focus na poziomie systemu — po
// pierwszym znaku, gdy DOM się przebudował, focus ginął i żaden kolejny znak
// nigdzie nie trafiał (każde oczekiwanie na zapis czekało pełne 15s zanim
// przechodziło dalej — stąd nagranie "wisiało" kilkanaście minut).
// locator.press("End") samo od nowa odnajduje element w DOM, focusuje go I
// przestawia kursor na koniec aktualnej wartości — przeżywa więc przebudowę
// DOM po każdym znaku ORAZ gwarantuje, że kolejny znak dopisze się na końcu,
// a nie wstawi się w środek (zwykły .click() nie gwarantuje pozycji kursora
// przy klikaniu w pole z już wpisanym tekstem). page.keyboard.insertText()
// obsługuje polskie znaki (w odróżnieniu od .press(), które operuje na
// nazwach klawiszy, nie na dowolnym Unicode) — wywoływane dopiero PO
// ustawieniu focusu/kursora przez press("End"), więc trafia we właściwe,
// aktualne miejsce.
async function typePaced(locator, text, msPerChar = 90) {
  const page = locator.page();
  for (const ch of text) {
    const responded = waitForWrite(page);
    await locator.press("End");
    await page.keyboard.insertText(ch);
    await responded;
    await page.waitForTimeout(msPerChar);
  }
}

// ===== Scenariusz 1: pojedynek z resetem, pass, kradzież wygrana i
// przegrana, dosłanianie reszty, mnożnik pominięty (2 pytania), koniec gry
// bez finału. Ten sam przebieg co control2.spec.js's test "reset
// pojedynku, pass, kradzież wygrana/przegrana, odkrywanie reszty...". =====

async function scenarioRoundsMechanics(pages) {
  const { control, buzzer } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }));

  // ===== RUNDA 1 =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // A pudłuje -> kolej B
  // B pudłuje też -> RESET CYKLU: kolej wraca do A, BEZ nowego zgłoszenia
  // buzzera (firstTeam/secondTeam nie są czyszczone — nie ma ponownego buzera).
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(answerTile(control, 1)); // A trafia -> wygrywa pojedynek, bez nowego zgłoszenia
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // 3x pudło A -> auto-KRADZIEŻ dla B
  await armAndConfirmPaced(answerTile(control, 2)); // B kradnie WYGRANĄ
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy
  // Dosłanianie reszty — 5 odpowiedzi, ord 1-2 już odsłonięte (pojedynek+kradzież),
  // zostają 3-4-5.
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));

  // ===== RUNDA 2 =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer B" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(answerTile(control, 1)); // B trafia -> kontrola B, allowPass
  await armAndConfirmPaced(control.getByRole("button", { name: "Oddaj kontrolę" })); // dawny "Pass" -> kontrola A
  await armAndConfirmPaced(answerTile(control, 2)); // A trafia
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // 3x pudło A -> auto-KRADZIEŻ dla B
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // B kradnie, ale PUDŁUJE -> kradzież PRZEGRANA
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy
  // Dosłanianie reszty — ord 1-2 już odsłonięte, zostają 3-4-5.
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));

  // ===== Koniec gry bez finału =====
  await clickPaced(control.getByRole("button", { name: "Zakończ grę" }));
  await control.waitForTimeout(4000); // zostaw ekran końcowy widoczny chwilę na nagraniu
}

// ===== Scenariusz 2/3: progresja przez KILKA rund aż do naturalnego
// osiągnięcia progu (finalMinPoints, obniżony do 180 — patrz
// PROGRESSION_QUESTIONS) — nie jeden sztuczny strzał na dużą liczbę punktów.
// Runda 2. dodatkowo pokazuje jedyną gałąź pojedynku, której nie było w
// żadnym innym scenariuszu: pierwsza drużyna pudłuje, DRUGA wygrywa na
// swojej próbie odpowiedzią NIE-topową, bez żadnego resetu (to inny
// przypadek niż RESET z scenariusza 1, gdzie pudłują OBIE drużyny).
// `expectFinal` przełącza wyłącznie to, co się dzieje PO 3. rundzie: wejście
// w finał (próg + hasFinal=true) albo prosto na ekran końca gry (próg +
// hasFinal=false) — sama progresja rund jest identyczna w obu wariantach. =====

async function scenarioRoundsThreshold(pages, { expectFinal }) {
  const { control, buzzer } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }));

  // ===== RUNDA 1: pojedynek wygrany za pierwszym razem (bez pudła), potem
  // wszystkie 5 odpowiedzi odsłonięte naturalnie w PLAY =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // A trafia topową odpowiedź od razu -> wygrywa pojedynek (Pies, 40)
  await armAndConfirmPaced(answerTile(control, 2)); // Kot, 25
  await armAndConfirmPaced(answerTile(control, 3)); // Chomik, 15
  await armAndConfirmPaced(answerTile(control, 4)); // Rybka, 12
  await armAndConfirmPaced(answerTile(control, 5)); // Papuga, 8 -> wszystko odsłonięte -> koniec rundy pomija ekran dosłaniania
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy

  // ===== RUNDA 2: B pudłuje -> BEZ resetu, druga próba (A) wygrywa
  // odpowiedzią nie-topową, potem reszta (w tym top) odsłonięta w PLAY =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer B" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // B pudłuje -> kolej na drugą próbę (A), NIE reset
  await armAndConfirmPaced(answerTile(control, 2)); // A trafia odpowiedź nie-topową (Autobusem, 15) -> WYGRYWA, bo B miał 0 pkt
  await armAndConfirmPaced(answerTile(control, 1)); // Samochodem, 25 (top, dosłaniane normalnie)
  await armAndConfirmPaced(answerTile(control, 3)); // Rowerem, 12
  await armAndConfirmPaced(answerTile(control, 4)); // Pieszo, 5
  await armAndConfirmPaced(answerTile(control, 5)); // Metrem, 3 -> wszystko odsłonięte
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy

  // ===== RUNDA 3: pojedynek wygrany za pierwszym razem, reszta w PLAY,
  // dobicie do progu (180) =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // Odpoczywamy, 18
  await armAndConfirmPaced(answerTile(control, 2)); // Sprzątamy, 14
  await armAndConfirmPaced(answerTile(control, 3)); // Idziemy do kina, 10
  await armAndConfirmPaced(answerTile(control, 4)); // Spotykamy znajomych, 6
  await armAndConfirmPaced(answerTile(control, 5)); // Gotujemy, 4 -> wszystko odsłonięte
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" })); // próg (180) osiągnięty

  if (expectFinal) {
    await clickPaced(control.getByRole("button", { name: "Rozpocznij finał" }));
    await control.waitForTimeout(4000); // ekran wpisywania gracza 1 widoczny chwilę — pełny final to osobne scenariusze
  } else {
    await clickPaced(control.getByRole("button", { name: "Zakończ grę" }));
    await control.waitForTimeout(4000);
  }
}

// ===== Scenariusz 4: finał pełny — oba bloki, naturalne wygaśnięcie
// zegarka gracza 1, powtórzenie u gracza 2, odsłonięcie odpowiedzi gracza 1
// na Display I Host przy starcie tury gracza 2. Ten sam przebieg co
// control2.spec.js's test "finał — obaj gracze, wszystkie 10 pytań...". =====

async function scenarioFinalFull(pages) {
  const { control, buzzer, host } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));

  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // Lato, 120 -> wygrywa pojedynek
  await armAndConfirmPaced(answerTile(control, 2)); // Wiosna, 80
  await armAndConfirmPaced(answerTile(control, 3)); // Jesień, 50
  await armAndConfirmPaced(answerTile(control, 4)); // Zima, 30
  await armAndConfirmPaced(answerTile(control, 5)); // Nie mam ulubionej, 20 -> wszystko odsłonięte, bank=300 -> próg osiągnięty
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy

  await clickPaced(control.getByRole("button", { name: "Rozpocznij finał" }));
  await control.waitForTimeout(4000); // final_theme + reveal

  // Host: zasłona pasma 2 właśnie się włączyła (startFinal). Prowadzący
  // sam podgląda gestem przesunięcia — Host ma treść zawsze, zasłona to
  // tylko lokalna nakładka. Ta próba znika sama na następnej akcji
  // (wpisanie pierwszej odpowiedzi wysyła nowy stan, co resetuje peek).
  await hostPeekSwipe(host);
  await host.waitForTimeout(1500);

  // Nie trzeba wpisywać WSZYSTKICH pięciu odpowiedzi na gracza, żeby
  // pokazać ekran mapowania — puste pole samo rozstrzyga się jako SKIP
  // (defaultResolve w ui.js), a wpisany, ale niedopasowany ręcznie tekst
  // jako MISS. true=wpisz i kliknij dopasowanie (MATCH), "miss"=wpisz, ale
  // NIE klikaj dopasowania (AUTO+MISS), false=zostaw puste (AUTO+SKIP).
  // Gracz 1: 2× MATCH, 1× MISS, 2× SKIP — pokazuje wszystkie trzy wyniki
  // mapowania jednym przebiegiem, bez wpisywania 5 identycznych odpowiedzi.
  const P1_PLAN = [true, false, "miss", true, false];
  // Gracz 2: idx 0 to powtórzenie (osobna gałąź, obsłużona niżej) — reszta
  // 2× MATCH, 2× SKIP.
  const P2_PLAN = [null, true, false, true, false];

  // Gracz 1: wpisz zaplanowane odpowiedzi, uruchom zegarek, poczekaj na
  // NATURALNE wygaśnięcie (15s).
  const p1Inputs = control.locator("#app input[type=text]");
  for (let i = 0; i < 5; i++) {
    if (P1_PLAN[i] === true) await typePaced(p1Inputs.nth(i), "Odp. finałowa");
    else if (P1_PLAN[i] === "miss") await typePaced(p1Inputs.nth(i), "Zła odpowiedź");
    // false: nic nie wpisujemy -> AUTO+SKIP, widoczne od razu jako domyślne
    // zaznaczenie na kaflu "Brak odpowiedzi" (control2/js/ui.js's
    // effectiveMappingResolution), potwierdzane przez "Pokazana" niżej.
  }
  await clickPaced(control.getByRole("button", { name: "Rozpocznij odliczanie (15s)" }));
  await control.waitForTimeout(16_000);

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  for (let i = 0; i < 5; i++) {
    if (P1_PLAN[i] === true) await clickPaced(control.getByRole("button", { name: "Odp. finałowa (15)" }));
    // "Pokaż odpowiedź"/"Pokaż punkty" — kafle odsłaniania, zaznacz ->
    // potwierdź jak odpowiedzi w Rundach (nazwa stała, druga linijka to
    // żywy podgląd).
    await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż odpowiedź" }));
    await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż punkty" }));
    await clickPaced(control.getByRole("button", { name: "Dalej" }));
  }

  await clickPaced(control.getByRole("button", { name: "Rozpocznij 2 rundę" }));
  await control.waitForTimeout(1500); // niech nagranie złapie pełne odsłonięcie odpowiedzi gracza 1 na Display

  // Host NIE dostaje żadnego automatycznego odsłonięcia razem z Display —
  // zasłona pasma 2 zostaje włączona przez cały finał (patrz figura 7).
  // Prowadzący znowu peekuje sam, żeby to pokazać na nagraniu wprost.
  await hostPeekSwipe(host);
  await host.waitForTimeout(1500);

  // Gracz 2: pytanie #1 = powtórzenie, reszta wg P2_PLAN.
  await clickPaced(control.getByRole("button", { name: "Powtórzenie" }).first());
  const p2Inputs = control.locator("#app input[type=text]");
  for (let i = 1; i < 5; i++) {
    if (P2_PLAN[i] === true) await typePaced(p2Inputs.nth(i), "Odp. finałowa");
    // false: nic nie wpisujemy -> AUTO+SKIP
  }
  await clickPaced(control.getByRole("button", { name: "Rozpocznij odliczanie (20s)" }));
  await clickPaced(control.getByRole("button", { name: "Dalej" })); // tym razem NIE czekamy na naturalne wygaśnięcie

  for (let i = 0; i < 5; i++) {
    if (P2_PLAN[i] === true) await clickPaced(control.getByRole("button", { name: "Odp. finałowa (15)" }));
    await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż odpowiedź" }));
    await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż punkty" }));
    await clickPaced(control.getByRole("button", { name: "Dalej" }));
  }

  await clickPaced(control.getByRole("button", { name: "Zakończ grę", exact: true }));
  await control.waitForTimeout(4000); // ekran końcowy widoczny chwilę na nagraniu
}

// ===== Scenariusz 5: finał z WCZESNYM zakończeniem — pierwsza odpowiedź
// gracza 1 sama przekracza próg finału (finalTarget, domyślnie 200; tu
// odpowiedź warta 250), więc silnik przeskakuje prosto do f_end
// (REVEAL_POINTS w engine.js), pomijając resztę pytań gracza 1 I CAŁEGO
// gracza 2. Ta gałąź nie była w ogóle ćwiczona wcześniej — dotychczasowy
// "final pełny" celowo dobiera niskie wartości punktowe, żeby NIGDY nie
// trafić progu przed końcem. Wymaga wpisania tylko JEDNEJ odpowiedzi —
// dokładnie to, o co chodziło w uwadze "nie musimy wpisywać wszystkich
// odpowiedzi". =====

async function scenarioFinalEarlyExit(pages) {
  const { control, buzzer, host } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));

  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // Lato, 120 -> wygrywa pojedynek
  await armAndConfirmPaced(answerTile(control, 2)); // Wiosna, 80
  await armAndConfirmPaced(answerTile(control, 3)); // Jesień, 50
  await armAndConfirmPaced(answerTile(control, 4)); // Zima, 30
  await armAndConfirmPaced(answerTile(control, 5)); // Nie mam ulubionej, 20 -> wszystko odsłonięte, bank=300 -> próg osiągnięty, wchodzimy w finał
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy

  await clickPaced(control.getByRole("button", { name: "Rozpocznij finał" }));
  await control.waitForTimeout(4000); // final_theme + reveal

  await hostPeekSwipe(host);
  await host.waitForTimeout(1500);

  // Tylko JEDNA odpowiedź — reszta pól gracza 1 zostaje pusta, bo i tak
  // nigdy do nich nie dojdziemy. Zegarek pomijamy całkowicie (opcjonalny —
  // "Dalej" działa niezależnie od tego, czy w ogóle był uruchomiony).
  const p1Inputs = control.locator("#app input[type=text]");
  await typePaced(p1Inputs.nth(0), "Odp. finałowa");
  await clickPaced(control.getByRole("button", { name: "Dalej" }));

  await clickPaced(control.getByRole("button", { name: "Odp. finałowa (250)" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż odpowiedź" }));
  // 250 >= finalTarget (200) -> REVEAL_POINTS w engine.js skacze prosto do
  // f_end, pomijając NEXT_QUESTION/pytania 2-5 gracza 1 i CAŁEGO gracza 2 —
  // "Pokaż punkty" to ostatni kafel odsłaniania w tym scenariuszu.
  await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż punkty" }));

  await clickPaced(control.getByRole("button", { name: "Zakończ grę", exact: true }));
  await control.waitForTimeout(4000); // ekran końcowy widoczny chwilę na nagraniu
}

// ===== Scenariusz 6: zerwanie połączenia WSZYSTKICH trzech urządzeń naraz
// (np. restart routera) W ŚRODKU rundy i ponowne podłączenie PRZEZ MODAL —
// kropka statusu w topbarze, klikalna przez całą grę (nie tylko na kroku
// Urządzeń), pokazuje kod/QR/link DOKŁADNIE tak, jak trzeba by je odczytać
// w prawdziwej awarii (patrz reconnectDeviceViaModal). To jest dosłownie
// scenariusz, po który cała przebudowa game_state (wspólna tabela stanu
// zamiast komend, plan sekcja 4) powstała — dowód, że stan gry przeżywa
// rozłączenie każdego urządzenia niezależnie od Control, bez żadnej ręcznej
// resynchronizacji poza samym ponownym wejściem na URL urządzenia.
//
// Runda 1: pojedynek wygrany, JEDNA odpowiedź odsłonięta — DOPIERO wtedy
// wszystkie trzy urządzenia tracą połączenie na raz, żeby nagranie wyraźnie
// pokazało "grę w toku, nagle rozłączoną", nie tylko rozłączenie na czystym
// ekranie startowym. Po ponownym podłączeniu runda kończy się normalnie
// (dowód: Control->Display/Host nadal działa na świeżych urządzeniach).
// Runda 2: całkowicie NOWY pojedynek rozegrany na już podłączonym z powrotem
// Buzzerze — dowód, że nowe urządzenie nie tylko "świeci na zielono"
// (presence), ale faktycznie bierze udział w rozgrywce (realny zapis do
// game_state przez game_state_buzzer_press).
async function scenarioDeviceReconnect(pages, { contexts, browser }) {
  const { control } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));

  await clickPaced(pages.buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // Lato, 120 -> wygrywa pojedynek, reszta rundy zostaje NIEODSŁONIĘTA

  // ===== Zerwanie połączenia WSZYSTKICH trzech urządzeń naraz =====
  console.log("[record] symulacja zerwania połączenia: zamykam Display/Host/Buzzer");
  await Promise.all([contexts.display.close(), contexts.host.close(), contexts.buzzer.close()]);
  await Promise.all([
    waitForDotStatus(control, "display", "bad"),
    waitForDotStatus(control, "host", "bad"),
    waitForDotStatus(control, "buzzer", "bad"),
  ]);
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć wszystkie trzy kropki na czerwono naraz

  // ===== Ponowne podłączenie PO KOLEI, przez modal (Display -> Host -> Buzzer) =====
  const display2 = await reconnectDeviceViaModal(browser, control, "display");
  contexts.display = display2.context; pages.display = display2.page;
  await control.waitForTimeout(1500); // widz ma zdążyć zobaczyć zieloną kropkę I odzyskany obraz gry na Display

  const host2 = await reconnectDeviceViaModal(browser, control, "host");
  contexts.host = host2.context; pages.host = host2.page;
  await control.waitForTimeout(1500);

  const buzzer2 = await reconnectDeviceViaModal(browser, control, "buzzer");
  contexts.buzzer = buzzer2.context; pages.buzzer = buzzer2.page;
  await control.waitForTimeout(1500);

  // ===== Dowód, że gra działa dalej: dokończ rundę 1 na świeżo podłączonych
  // urządzeniach (Display/Host odbierają odsłonięcia normalnie) =====
  await armAndConfirmPaced(answerTile(control, 2));
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000);

  // ===== Runda 2, w CAŁOŚCI na ponownie podłączonym Buzzerze — nie tylko
  // presence, prawdziwy udział w grze. =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(pages.buzzer.getByRole("button", { name: "Buzzer B" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(answerTile(control, 1)); // Restartujemy router, 35
  await armAndConfirmPaced(answerTile(control, 2));
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000);

  await clickPaced(control.getByRole("button", { name: "Zakończ grę" }));
  await control.waitForTimeout(4000); // ekran końcowy widoczny chwilę na nagraniu
}

// ===== Orkiestracja: jedna przeglądarka, po kolei każdy scenariusz z
// własną grą testową, własnym zestawem 4 okien i własnym plikiem nagrania. =====

const SCENARIOS = [
  {
    file: "01-rundy-mechanika.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-ROUNDS-${Date.now()}`, { roundQuestions: TWO_QUESTIONS }),
    run: scenarioRoundsMechanics,
  },
  {
    // Ta sama progresja rund co scenariusz 3, ale hasFinal=true -> R9 kończy
    // się wejściem w finał zamiast w ekran końca gry.
    file: "02-rundy-progresja-final.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-PROGRESJA-FINAL-${Date.now()}`, {
      roundQuestions: PROGRESSION_QUESTIONS,
      settings: { game: { hasFinal: true, advanced: { finalMinPoints: PROGRESSION_FINAL_MIN_POINTS } } },
      finalAnswerPts: 15, // treść finału nieużywana (scenariusz zatrzymuje się na f_p1_entry) — wymagana tylko, żeby canEnterFinal() przepuściło
    }),
    run: (pages) => scenarioRoundsThreshold(pages, { expectFinal: true }),
  },
  {
    file: "03-rundy-progresja-bez-finalu.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-PROGRESJA-KONIEC-${Date.now()}`, {
      roundQuestions: PROGRESSION_QUESTIONS,
      settings: { game: { hasFinal: false, advanced: { finalMinPoints: PROGRESSION_FINAL_MIN_POINTS } } },
    }),
    run: (pages) => scenarioRoundsThreshold(pages, { expectFinal: false }),
  },
  {
    file: "04-final-pelny.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-FINAL-${Date.now()}`, {
      roundQuestions: [FINAL_SETUP_ROUND],
      finalAnswerPts: 15,
    }),
    run: scenarioFinalFull,
  },
  {
    // finalAnswerPts=250 > finalTarget domyślne (200) -> pierwsza trafiona
    // odpowiedź gracza 1 sama kończy finał wcześniej.
    file: "05-final-wczesne-zakonczenie.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-FINAL-WCZESNY-${Date.now()}`, {
      roundQuestions: [FINAL_SETUP_ROUND],
      finalAnswerPts: 250,
    }),
    run: scenarioFinalEarlyExit,
  },
  {
    file: "06-zerwanie-i-ponowne-podlaczenie.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-RECONNECT-${Date.now()}`, {
      roundQuestions: [RECONNECT_ROUND_1, RECONNECT_ROUND_2],
    }),
    run: scenarioDeviceReconnect,
  },
];

// Zrzut diagnostyczny na wypadek błędu scenariusza — video samo w sobie nie
// jest dostępne z poziomu tej sesji do wglądu (artefakt CI, nie plik lokalny
// dostępny stąd bez ręcznego pobrania), więc przy TimeoutError na
// locator.click() (np. "waiting for locator(...).nth(N)") potrzebny jest
// zrzut ekranu + treść tego, co faktycznie jest w DOM w tym momencie:
// dokładny tekst/stan każdego kafla w .c2-tilegrid, aktualny krok
// (.c2-stepper), i czy przypadkiem nie wisi natywny alert() (control2/js/
// app.js's dispatch handler pokazuje alert() na każdym nieobsłużonym
// błędzie zapisu — to jest jedyne miejsce, gdzie mogłoby zablokować dalsze
// kliknięcia bez żadnego śladu w konsoli).
async function dumpFailureDiagnostics(controlPage, scenarioFile) {
  const base = path.join(OUT_DIR, `${scenarioFile.replace(/\.mp4$/, "")}-FAILURE`);
  await controlPage.screenshot({ path: `${base}.png`, fullPage: true }).catch((e) => {
    console.error("[record] screenshot się nie powiódł:", e.message);
  });
  const dump = await controlPage.evaluate(() => {
    const stepper = document.querySelector(".c2-stepper")?.textContent || null;
    const tiles = [...document.querySelectorAll(".c2-tilegrid button")].map((el) => ({
      text: el.textContent.trim(),
      disabled: el.disabled,
      visible: el.offsetParent !== null,
      classes: el.className,
    }));
    return { stepper, tileCount: tiles.length, tiles };
  }).catch((e) => ({ evalError: e.message }));
  fs.writeFileSync(`${base}.json`, JSON.stringify(dump, null, 2));
  console.log(`[record] diagnostyka ${scenarioFile}:`, JSON.stringify(dump));
}

async function main() {
  for (const env of ["E2E_BYPASS_SECRET", "TEST_USERNAME", "TEST_PASSWORD"]) {
    if (!process.env[env]) throw new Error(`Brak ${env} w zmiennych środowiskowych`);
  }

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      `--window-size=${QUAD_W},${QUAD_H}`,
    ],
  });

  try {
    for (const scenario of SCENARIOS) {
      console.log(`\n=== Scenariusz: ${scenario.file} ===`);
      const setupCtx = await browser.newContext({ baseURL: BASE_URL });
      const setupPage = await setupCtx.newPage();
      await loginAsTestUser(setupPage, setupCtx);
      const game = await scenario.makeGame(setupPage);

      const { contexts, pages } = await openTiledDevices(browser, game);
      const rec = startRecording(path.join(OUT_DIR, scenario.file));
      try {
        // { contexts, browser } — tylko scenariusz 6 (scenarioDeviceReconnect)
        // z tego korzysta (zamyka/otwiera kontensty urządzeń w locie); reszta
        // scenariuszy deklaruje run(pages) i ten drugi argument po prostu
        // ignoruje.
        await scenario.run(pages, { contexts, browser });
      } catch (err) {
        console.error(`[record] scenariusz ${scenario.file} rzucił błąd:`, err);
        await dumpFailureDiagnostics(pages.control, scenario.file).catch((diagErr) => {
          console.error("[record] zrzut diagnostyczny się nie powiódł:", diagErr);
        });
        throw err;
      } finally {
        await stopRecording(rec);
        await closeAll(contexts);
      }

      await deleteGame(setupPage, game.id);
      await setupCtx.close().catch(() => {});
    }
  } finally {
    await browser.close();
  }
}

main().then(() => {
  console.log("Nagrywanie zakończone, pliki w", OUT_DIR);
  process.exit(0);
}).catch((err) => {
  console.error("record-playthrough.js failed:", err);
  process.exit(1);
});
