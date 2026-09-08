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

const TWO_QUESTIONS = [
  { ord: 1, text: "Pytanie testowe 1", answers: [
    { ord: 1, text: "Odpowiedź A", fixed_points: 40 },
    { ord: 2, text: "Odpowiedź B", fixed_points: 30 },
    { ord: 3, text: "Odpowiedź C", fixed_points: 20 },
  ] },
  { ord: 2, text: "Pytanie testowe 2", answers: [
    { ord: 1, text: "Odpowiedź A", fixed_points: 40 },
    { ord: 2, text: "Odpowiedź B", fixed_points: 30 },
    { ord: 3, text: "Odpowiedź C", fixed_points: 20 },
  ] },
];

// 3 rundy do scenariusza "progresja + próg": kolejność i wartości punktów
// dobrane tak, żeby próg (finalMinPoints, obniżony do 180 w ustawieniach
// gry poniżej) padał dopiero PO trzeciej rundzie, nie wcześniej — inaczej
// runda 3. nigdy by się nie odbyła i "kilka rund" byłoby tylko dwiema.
// Ręczne przeliczenie (patrz REDUCERS w control2/js/engine.js):
//   R1: pojedynek wygrany za pierwszym razem (A, #1=40) -> reszta odsłonięta
//       zwykłym PLAY (30+20) -> bank 90 -> mnożnik r1=1 -> totals.A=90
//   R2: pojedynek — B pudłuje (X) -> BEZ resetu (to nie jest RESET, tylko
//       CONTINUE_SECOND) kolej NA DRUGĄ próbę idzie do A, która trafia
//       odpowiedź NIE-topową (#2=10) i WYGRYWA, bo B miał 0 -> reszta
//       (#1=50) odsłonięta w PLAY -> bank 60 -> mnożnik r2=1 -> totals.A=150
//   R3: pojedynek wygrany za pierwszym razem (A, #1=40) -> reszta (#2=10)
//       -> bank 50 -> mnożnik r3=1 -> totals.A=200 >= 180 -> PRÓG OSIĄGNIĘTY
const PROGRESSION_QUESTIONS = [
  { ord: 1, text: "Pytanie progresji 1", answers: [
    { ord: 1, text: "40 punktów", fixed_points: 40 },
    { ord: 2, text: "30 punktów", fixed_points: 30 },
    { ord: 3, text: "20 punktów", fixed_points: 20 },
  ] },
  { ord: 2, text: "Pytanie progresji 2", answers: [
    { ord: 1, text: "50 punktów", fixed_points: 50 },
    { ord: 2, text: "10 punktów", fixed_points: 10 },
  ] },
  { ord: 3, text: "Pytanie progresji 3", answers: [
    { ord: 1, text: "40 punktów", fixed_points: 40 },
    { ord: 2, text: "10 punktów", fixed_points: 10 },
  ] },
];
const PROGRESSION_FINAL_MIN_POINTS = 180;

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
const CLICK_PACE_MS = 300;
const WRITE_RPC_RE = /\/rpc\/(game_state_write|game_state_buzzer_press|game_state_undo)(\?|$)/;

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

async function checkPaced(locator, ms = CLICK_PACE_MS) {
  const page = locator.page();
  const responded = waitForWrite(page);
  await locator.check();
  await responded;
  await page.waitForTimeout(ms);
}

// ===== Scenariusz 1: pojedynek z resetem, pass, kradzież wygrana i
// przegrana, dosłanianie reszty, mnożnik pominięty (2 pytania), koniec gry
// bez finału. Ten sam przebieg co control2.spec.js's test "reset
// pojedynku, pass, kradzież wygrana/przegrana, odkrywanie reszty...". =====

async function scenarioRoundsMechanics(pages) {
  const { control, buzzer } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Zakończ podłączanie" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Dalej" }));

  // ===== RUNDA 1 =====
  await clickPaced(control.getByRole("button", { name: "Start rundy" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Przyjmij" }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true })); // A pudłuje -> kolej B
  // B pudłuje też -> RESET CYKLU: kolej wraca do A, BEZ nowego zgłoszenia
  // buzzera (firstTeam/secondTeam nie są czyszczone — nie ma ponownego buzera).
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "#1" })); // A trafia -> wygrywa pojedynek, bez nowego zgłoszenia
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true })); // 3x pudło A -> auto-KRADZIEŻ dla B
  await clickPaced(control.getByRole("button", { name: "#2" })); // B kradnie WYGRANĄ
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await clickPaced(control.getByRole("button", { name: "#3" })); // dosłanianie reszty

  // ===== RUNDA 2 =====
  await clickPaced(control.getByRole("button", { name: "Start rundy" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer B" }));
  await clickPaced(control.getByRole("button", { name: "Przyjmij" }));
  await clickPaced(control.getByRole("button", { name: "#1" })); // B trafia -> kontrola B, allowPass
  await clickPaced(control.getByRole("button", { name: "Pass" })); // oddaje pytanie -> kontrola A
  await clickPaced(control.getByRole("button", { name: "#2" })); // A trafia
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true })); // 3x pudło A -> auto-KRADZIEŻ dla B
  await clickPaced(control.getByRole("button", { name: "X", exact: true })); // B kradnie, ale PUDŁUJE -> kradzież PRZEGRANA
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await clickPaced(control.getByRole("button", { name: "#3" })); // dosłanianie reszty

  // ===== Koniec gry bez finału =====
  await clickPaced(control.getByRole("button", { name: "Pokaż koniec gry" }));
  await control.waitForTimeout(2500); // zostaw ekran końcowy widoczny chwilę na nagraniu
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
  await clickPaced(control.getByRole("button", { name: "Zakończ podłączanie" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Dalej" }));

  // ===== RUNDA 1: pojedynek wygrany za pierwszym razem (bez pudła) =====
  await clickPaced(control.getByRole("button", { name: "Start rundy" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Przyjmij" }));
  await clickPaced(control.getByRole("button", { name: "#1" })); // A trafia topową odpowiedź od razu -> wygrywa pojedynek
  await clickPaced(control.getByRole("button", { name: "#2" }));
  await clickPaced(control.getByRole("button", { name: "#3" })); // wszystko odsłonięte -> koniec rundy pomija ekran dosłaniania
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));

  // ===== RUNDA 2: B pudłuje -> BEZ resetu, druga próba (A) wygrywa
  // odpowiedzią nie-topową =====
  await clickPaced(control.getByRole("button", { name: "Start rundy" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer B" }));
  await clickPaced(control.getByRole("button", { name: "Przyjmij" }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true })); // B pudłuje -> kolej na drugą próbę (A), NIE reset
  await clickPaced(control.getByRole("button", { name: "#2" })); // A trafia odpowiedź nie-topową -> WYGRYWA, bo B miał 0 pkt
  await clickPaced(control.getByRole("button", { name: "#1" })); // A dosłania resztę
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));

  // ===== RUNDA 3: pojedynek wygrany za pierwszym razem, dobicie do progu =====
  await clickPaced(control.getByRole("button", { name: "Start rundy" }));
  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Przyjmij" }));
  await clickPaced(control.getByRole("button", { name: "#1" }));
  await clickPaced(control.getByRole("button", { name: "#2" }));
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" })); // próg (180) osiągnięty

  if (expectFinal) {
    await clickPaced(control.getByRole("button", { name: "Start finału" }));
    await control.waitForTimeout(3000); // ekran wpisywania gracza 1 widoczny chwilę — pełny final to osobne scenariusze
  } else {
    await clickPaced(control.getByRole("button", { name: "Pokaż koniec gry" }));
    await control.waitForTimeout(2500);
  }
}

// ===== Scenariusz 4: finał pełny — oba bloki, naturalne wygaśnięcie
// zegarka gracza 1, powtórzenie u gracza 2, odsłonięcie odpowiedzi gracza 1
// na Display I Host przy starcie tury gracza 2. Ten sam przebieg co
// control2.spec.js's test "finał — obaj gracze, wszystkie 10 pytań...". =====

async function scenarioFinalFull(pages) {
  const { control, buzzer, host } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Zakończ podłączanie" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Start rundy" }));

  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Przyjmij" }));
  await clickPaced(control.getByRole("button", { name: "#1" })); // A dobija do progu finału (300 pkt)
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));

  await clickPaced(control.getByRole("button", { name: "Start finału" }));
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
    // false: nic nie wpisujemy -> AUTO+SKIP przy "Pokaż odpowiedź"
  }
  await clickPaced(control.getByRole("button", { name: "Start timera" }));
  await control.waitForTimeout(16_000);

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  for (let i = 0; i < 5; i++) {
    if (P1_PLAN[i] === true) await clickPaced(control.getByRole("button", { name: "Odp. finałowa (15)" }));
    await clickPaced(control.getByRole("button", { name: "Pokaż odpowiedź" }));
    await clickPaced(control.getByRole("button", { name: "Pokaż punkty" }));
    await clickPaced(control.getByRole("button", { name: "Dalej" }));
  }

  await clickPaced(control.getByRole("button", { name: "Start rundy 2" }));
  await control.waitForTimeout(1500); // niech nagranie złapie pełne odsłonięcie odpowiedzi gracza 1 na Display

  // Host NIE dostaje żadnego automatycznego odsłonięcia razem z Display —
  // zasłona pasma 2 zostaje włączona przez cały finał (patrz figura 7).
  // Prowadzący znowu peekuje sam, żeby to pokazać na nagraniu wprost.
  await hostPeekSwipe(host);
  await host.waitForTimeout(1500);

  // Gracz 2: pytanie #1 = powtórzenie, reszta wg P2_PLAN.
  await checkPaced(control.getByLabel("powtórzenie").first());
  const p2Inputs = control.locator("#app input[type=text]");
  for (let i = 1; i < 5; i++) {
    if (P2_PLAN[i] === true) await typePaced(p2Inputs.nth(i), "Odp. finałowa");
    // false: nic nie wpisujemy -> AUTO+SKIP
  }
  await clickPaced(control.getByRole("button", { name: "Start timera" }));
  await clickPaced(control.getByRole("button", { name: "Dalej" })); // tym razem NIE czekamy na naturalne wygaśnięcie

  for (let i = 0; i < 5; i++) {
    if (P2_PLAN[i] === true) await clickPaced(control.getByRole("button", { name: "Odp. finałowa (15)" }));
    await clickPaced(control.getByRole("button", { name: "Pokaż odpowiedź" }));
    await clickPaced(control.getByRole("button", { name: "Pokaż punkty" }));
    await clickPaced(control.getByRole("button", { name: "Dalej" }));
  }

  await clickPaced(control.getByRole("button", { name: "Zakończ", exact: true }));
  await control.waitForTimeout(3000); // ekran końcowy widoczny chwilę na nagraniu
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
  await clickPaced(control.getByRole("button", { name: "Zakończ podłączanie" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Start rundy" }));

  await clickPaced(buzzer.getByRole("button", { name: "Buzzer A" }));
  await clickPaced(control.getByRole("button", { name: "Przyjmij" }));
  await clickPaced(control.getByRole("button", { name: "#1" })); // A dobija do progu rund (300 pkt) -> wchodzimy w finał
  // Ta jedyna odpowiedź w pytaniu została już odsłonięta PRZEZ sam pojedynek
  // (wygrana na pierwszej próbie odsłania ją od razu) — canEndRound ustawia
  // się TYLKO w gałęzi PLAY po odsłonięciu (engine.js's REVEAL_ANSWER), a
  // gałąź DUEL tego nie robi. Bez nic więcej do odsłonięcia jedyną drogą do
  // canEndRound jest 3x X w PLAY (ADD_X: xA>=STRIKE_LIMIT -> canEndRound),
  // dokładnie jak w scenarioFinalFull's identycznej rundzie na 300 pkt.
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "X", exact: true }));
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));

  await clickPaced(control.getByRole("button", { name: "Start finału" }));
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
  await clickPaced(control.getByRole("button", { name: "Pokaż odpowiedź" }));
  // 250 >= finalTarget (200) -> REVEAL_POINTS w engine.js skacze prosto do
  // f_end, pomijając NEXT_QUESTION/pytania 2-5 gracza 1 i CAŁEGO gracza 2 —
  // "Pokaż punkty" to ostatnie kliknięcie w mapowaniu w tym scenariuszu.
  await clickPaced(control.getByRole("button", { name: "Pokaż punkty" }));

  await clickPaced(control.getByRole("button", { name: "Zakończ", exact: true }));
  await control.waitForTimeout(3000); // ekran końcowy widoczny chwilę na nagraniu
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
      roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odp. warta 300", fixed_points: 300 }] }],
      finalAnswerPts: 15,
    }),
    run: scenarioFinalFull,
  },
  {
    // finalAnswerPts=250 > finalTarget domyślne (200) -> pierwsza trafiona
    // odpowiedź gracza 1 sama kończy finał wcześniej.
    file: "05-final-wczesne-zakonczenie.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-FINAL-WCZESNY-${Date.now()}`, {
      roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odp. warta 300", fixed_points: 300 }] }],
      finalAnswerPts: 250,
    }),
    run: scenarioFinalEarlyExit,
  },
];

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
        await scenario.run(pages);
      } catch (err) {
        console.error(`[record] scenariusz ${scenario.file} rzucił błąd:`, err);
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
