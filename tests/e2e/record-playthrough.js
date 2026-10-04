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
// E2E_BYPASS_SECRET, TEST_PASSWORD. Loguje się jako test1@familiada.online
// (domyślne konto puli testX, patrz e2e/helpers/login.js) -- domena jest
// stałą w kodzie, nie sekretem.
// Opcjonalnie: DISPLAY (domyślnie ":99"), PULSE_SINK (domyślnie "CaptureSink"),
// RECORD_OUT_DIR (domyślnie "tests/recordings").
//
// Uruchomienie lokalne (Linux z realnym X11 + audio, np. do próby przed CI):
//   DISPLAY=:0 PULSE_SINK=<istniejący sink> \
//     E2E_BYPASS_SECRET=... TEST_PASSWORD=... \
//     node tests/e2e/record-playthrough.js
// Ten skrypt zakłada gotowe środowisko (Xvfb/PulseAudio) — nie uruchamia
// ich sam.

const { chromium, expect } = require("@playwright/test");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { loginAsTestUser } = require("./helpers/login");
const { waitForEmail, extractHttpLinks } = require("./helpers/mailbox");

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

// Zgłoszone: "żeby to była żywa rozgrywka za każdym razem możesz użyć np.
// gry demo preparowanej (znajdziesz ją w migracji bazy)" — zamiast ręcznie
// wpisanych fixture'ów (TWO_QUESTIONS/PROGRESSION_QUESTIONS/..., syntetyczny
// tekst "Podaj coś...") ta funkcja woła to samo RPC co przycisk "Przywróć
// demo" w prawdziwej appce (public.restore_my_demo, migracja
// 2026-03-09_040_demo_in_db.sql): KASUJE i ZASIEWA NA NOWO demo bieżącego
// użytkownika, więc każde wywołanie to naprawdę świeży, żywy wiersz w
// bazie — nie ta sama, raz wstawiona fixtura odtwarzana w kółko. Demo
// "prepared" niesie 16 prawdziwych pytań rund (6 odpowiedzi każde,
// sumujące się do 100 punktów — realny content, jakim gra prawdziwy
// operator), ale startuje jako status="draft" bez żadnych ustawień
// (settings) — dociągamy je do stanu "gotowa do grania" tym samym patchem
// co dawny makeGame().
async function restoreDemoGame(setupPage, { pickOrds = [], settings = {}, finalPickOrds = [] } = {}) {
  return setupPage.evaluate(async ({ pickOrds, settings, finalPickOrds }) => {
    const sb = window.__sbClient;

    const { error: rErr } = await sb.rpc("restore_my_demo", { p_lang: "pl" });
    if (rErr) throw new Error("restore_my_demo failed: " + rErr.message);

    const { data: userData } = await sb.auth.getUser();
    const { data: g, error: gErr } = await sb
      .from("games")
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .eq("owner_id", userData.user.id).eq("is_demo", true).eq("type", "prepared")
      .single();
    if (gErr) throw new Error("select demo game failed: " + gErr.message);

    const { data: questions, error: qErr } = await sb
      .from("questions").select("id, ord, text").eq("game_id", g.id).order("ord");
    if (qErr) throw new Error("select demo questions failed: " + qErr.message);
    const { data: answers, error: aErr } = await sb
      .from("answers").select("id, question_id, ord, text, fixed_points")
      .in("question_id", questions.map((q) => q.id));
    if (aErr) throw new Error("select demo answers failed: " + aErr.message);
    const byQ = new Map(questions.map((q) => [q.id, { ...q, answers: [] }]));
    for (const a of answers) byQ.get(a.question_id)?.answers.push(a);
    const byOrd = (ord) => byQ.get(questions.find((q) => q.ord === ord)?.id);

    // Zgłoszone wprost: "nie zmieniaj progu punktów... rozgrywka ma być
    // naturalna" — treść demo NIE jest tu w żaden sposób modyfikowana
    // (wszystkie 6 odpowiedzi, realne punkty sumujące się do 100), a próg
    // (finalMinPoints) zostaje domyślny (300, shared/gameStateShape.js), o
    // ile scenariusz go jawnie nie nadpisze.
    const picked = pickOrds.map(byOrd);
    for (const q of picked) {
      if (!q) throw new Error("nie znaleziono pytania demo o żądanym ord");
    }

    // Zgłoszone: "czy finał już jest prawdziwy?" — finał BYŁ dotąd budowany
    // z pięciu sztucznie wstawionych pytań ("Pytanie finałowe N") z jedną
    // wymyśloną odpowiedzią każde, bo demo (migracja 040) ma tylko jedną,
    // wspólną pulę "rundową" (16 pytań, 6 realnych odpowiedzi każde) — bez
    // osobnej puli finałowej. Naprawione: finał TERAZ bierze te same,
    // prawdziwe pytania demo (inny ord niż w rundach tego scenariusza) —
    // zero insertów, zero sztucznej treści — dokładnie tym samym
    // mechanizmem co picked/rounds wyżej.
    const finalPicked = finalPickOrds.map(byOrd);
    for (const q of finalPicked) {
      if (!q) throw new Error("nie znaleziono pytania finałowego demo o żądanym ord");
    }

    const { error: upErr } = await sb.from("games").update({
      status: "ready",
      settings: {
        teams: { teamA: "Alfa", teamB: "Beta" },
        display: settings.display || {},
        game: {
          hasFinal: finalPickOrds.length > 0,
          roundsQuestionsMode: "pick",
          ...(finalPickOrds.length ? { finalQuestionsMode: "pick" } : {}),
          ...(settings.game || {}),
        },
        questions: { rounds: picked.map((q) => ({ id: q.id })), final: finalPicked.map((q) => ({ id: q.id })) },
      },
    }).eq("id", g.id);
    if (upErr) throw new Error("update demo settings failed: " + upErr.message);

    // finalQuestions: zwrócone TREŚCI (nie tylko id) pytań finałowych, żeby
    // scenariusz mógł zbudować selektory kafli dopasowania (każda realna
    // odpowiedź = osobny przycisk "<tekst> (<punkty>)" w renderFinalMapping,
    // control2/js/ui.js's matchOptions) bez ponownego odpytywania bazy.
    return { ...g, finalQuestions: finalPicked };
  }, { pickOrds, settings, finalPickOrds });
}

async function deleteGame(page, gameId) {
  await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    await sb.from("games").delete().eq("id", gid);
  }, gameId).catch(() => {});
}

// ===== Blokada logo (scenariusz 7) — te same RPC co
// js/core/resource-lock.js's acquireOnce()/releaseOnce(), wołane
// bezpośrednio (bez faktycznego otwierania logo-editor.html): zgłoszone
// "samego otwartego logo edytować nie musisz pokazywać na nagraniu" — ten
// sam skutek (aktywny wiersz w edit_locks) bez zależności od selektorów
// zupełnie innej strony. =====

function blankGlyphPayload() {
  return {
    layers: [{ color: "main", rows: Array.from({ length: 10 }, () => " ".repeat(30)) }],
    source: { mode: "TEXT" },
  };
}

async function insertLogo(setupPage, name) {
  return setupPage.evaluate(async ({ name, payload }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("user_logos")
      .insert({ user_id: userData.user.id, name, type: "GLYPH_30x10", payload })
      .select("id").single();
    if (error) throw new Error("insert logo failed: " + error.message);
    return data.id;
  }, { name, payload: blankGlyphPayload() });
}

async function acquireLogoLockExternally(setupPage, logoId, tabId) {
  await setupPage.evaluate(async ({ logoId, tabId }) => {
    const { error } = await window.__sbClient.rpc("acquire_edit_lock", {
      p_resource_type: "logo", p_resource_id: logoId, p_tab_id: tabId, p_context: "logo-editor",
    });
    if (error) throw new Error("acquire_edit_lock failed: " + error.message);
  }, { logoId, tabId });
}

async function releaseLogoLockExternally(setupPage, logoId, tabId) {
  await setupPage.evaluate(async ({ logoId, tabId }) => {
    await window.__sbClient.rpc("release_edit_lock", { p_resource_type: "logo", p_resource_id: logoId, p_tab_id: tabId });
  }, { logoId, tabId }).catch(() => {});
}

// Które z 16 realnych pytań demo (supabase/migrations/2026-03-09_040_
// demo_in_db.sql, lang="pl", slot="prepared" — 6 odpowiedzi każde, realnie
// sumujące się do 100 pkt) idzie do której rundy każdego scenariusza.
// Zgłoszone wprost: "nie zmieniaj progu punktów... rozgrywka ma być
// naturalna" — treść demo NIE jest tu w żaden sposób modyfikowana (ŻADNA
// odpowiedź nie jest usuwana, próg (finalMinPoints) zostaje domyślny — 300,
// shared/gameStateShape.js) — więc "naturalne" 3 pełne rundy po 100 pkt
// (mnożnik rund 1-3 domyślnie ×1, DEFAULT_SETTINGS.roundMultipliers=
// [1,1,1,2,3]) dają kumulatywnie 100/200/300: próg trafiony dopiero na
// końcu 3. rundy, nigdy wcześniej — bez żadnego ręcznego strojenia ustawień.
const PROGRESSION_ROUND_ORDS = [3, 4, 5]; // scenariusz "progresja + próg" (2/3)
const FINAL_SETUP_ROUND_ORDS = [6, 7, 8]; // scenariusze "final" (4/5) — ten sam wzorzec, inne pytania

// Dwie rundy scenariusza 6 (zerwanie i ponowne podłączenie) — bez progu,
// dowolne dwa różne pytania.
const RECONNECT_ROUND_ORDS = [9, 10];

// Runda scenariusza 7 (blokada logo) — bez progu, byle inna niż powyższe
// (żeby recording z osobnych scenariuszy nie polegał przypadkiem na tym
// samym pytaniu, mimo że restore_my_demo() i tak resetuje demo między
// scenariuszami).
const LOGO_LOCK_ROUND_ORD = 11;

// ===== Kafelkowanie okien 2x2 na wirtualnym ekranie (CDP Browser.setWindowBounds) =====

const QUADRANTS = {
  control: { left: 0, top: 0, width: QUAD_W, height: QUAD_H },
  display: { left: QUAD_W, top: 0, width: QUAD_W, height: QUAD_H },
  host: { left: 0, top: QUAD_H, width: QUAD_W, height: QUAD_H },
  buzzer: { left: QUAD_W, top: QUAD_H, width: QUAD_W, height: QUAD_H },
};

// Okno "odbiorcy" e-maila (scenariusz 8, udostępnianie przez e-mail) —
// mniejsze, wyśrodkowane na wierzchu siatki 2x2, żeby nagranie wyraźnie
// pokazało "ktoś inny otworzył link z maila", zamiast podmieniać w miejscu
// już widoczne okno Hosta/Buzzera (co wyglądałoby na ekranie identycznie
// jak zwykłe odświeżenie, gubiąc sens demonstracji).
const RECIPIENT_QUAD = { left: (SCREEN_W - 900) / 2, top: (SCREEN_H - 700) / 2, width: 900, height: 700 };

async function positionWindow(context, page, bounds) {
  const session = await context.newCDPSession(page);
  const { windowId } = await session.send("Browser.getWindowForTarget");
  await session.send("Browser.setWindowBounds", { windowId, bounds: { ...bounds, windowState: "normal" } });
  // CDP potwierdza przyjęcie komendy, ale renderer bywa o jedną klatkę do
  // tyłu -- zaobserwowane w CI (run #27): goto() wystrzelony zaraz po tym
  // await trafiał na window.innerWidth jeszcze ze STAREGO (domyślnego,
  // węższego niż 980px) rozmiaru okna, więc guardDesktopOnly()'s PIERWSZY
  // apply() (na starcie strony) ustawiał #deviceGuard na "narrow" i
  // przechwytywał kliknięcia na stałe (overlay odświeża się tylko na
  // kolejny "resize", którego już nie było, bo okno nie zmieniało już
  // rozmiaru po nawigacji). Komentarz wyżej (SCREEN_W/QUAD_W) opisywał
  // DOKŁADNIE ten sam objaw i "naprawiał" go podniesieniem rozdzielczości
  // (960->1280px) -- to zmniejszyło częstotliwość (szerszy margines do
  // wyścigu), ale nie usunęło samego wyścigu, stąd nawrót. Prawdziwa
  // naprawa: jawnie poczekać, aż innerWidth TEJ strony faktycznie odzwierciedli
  // nowy rozmiar, zanim cokolwiek nawiguje/klika na niej dalej.
  await page.waitForFunction((w) => window.innerWidth >= w, bounds.width - 4, { timeout: 5000 }).catch(() => {});
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

  // ZNALEZIONA REALNA PRZYCZYNA (run #334, scenario_filter jako JEDYNY
  // scenariusz sesji -- zupełnie zimny start, bez ciepłego cache/połączeń
  // TLS z poprzednich scenariuszy): `waitUntil: "domcontentloaded"` wraca,
  // gdy DOM jest gotowy, ale PRZED tym, jak JS aplikacji Control zdąży
  // zainicjalizować `window.__sbClient` -- w pełnym przebiegu (poprzednie
  // scenariusze już rozgrzały wszystko w tle) ten wyścig nigdy nie był
  // widoczny; przy jedynym, zimnym scenariuszu przegrywa zawsze. Czekamy
  // więc wprost na gotowość klienta Control (jedyne urządzenie, które go
  // realnie używa do RPC w scenariuszach), zamiast zakładać, że
  // domcontentloaded wystarczy.
  await pages.control.waitForFunction(() => !!window.__sbClient, { timeout: 15_000 });

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
//
// Podniesione do 2200ms — zgłoszone PONOWNIE po obejrzeniu realnego
// (choć skróconego crashem) nagrania: "przebieg nagrywania dalej wygląda
// nienaturalnie zbyt szybko", mimo poprzedniej podwyżki z 300ms. Skoro
// jedna korekta już nie wystarczyła, ta ma być wyraźnie odczuwalna
// (niemal dwukrotność), nie kolejny drobny krok, który znowu okaże się
// za mały.
//
// Trzecia korekta, tym razem NIE jednym płaskim numerem — zgłoszone: "wiele
// akcji jest dalej zbyt szybkich, ale np. na modalu ustawień wisi bardzo
// długo". Jeden wspólny CLICK_PACE_MS dla WSZYSTKIEGO (bzyczenie, odsłonięcie
// odpowiedzi I "Dalej" w kreatorze urządzeń I modal ustawień) był sprzeczny
// sam ze sobą: podbicie go pomaga scenom rozgrywki (gdzie w prawdziwej grze
// prowadzący GADA — trzeba dać mu czas), ale każdy krok czysto
// administracyjny (kreator, modal ustawień, "Rozpocznij grę") dostawał TĘ
// SAMĄ, coraz większą pauzę mimo że nic tam nie wymaga "czasu na
// komentarz" — stąd modal, który robi 6-7 takich kroków z rzędu, realnie
// wisiał kilkanaście sekund. Dwa osobne tempa:
//   REVEAL_PACE_MS — domyślne dla clickPaced/armAndConfirmPaced/fillPaced:
//     bzyczenie, "Zatwierdź: drużyna", odsłonięcie odpowiedzi/X/kradzież,
//     koniec/start rundy, finał (odliczanie, mapowanie, "Zakończ grę") —
//     momenty, które realny prowadzący komentuje na głos.
//   ADMIN_PACE_MS — jawnie podane tam, gdzie NIC się nie ogłasza: kroki
//     kreatora urządzeń ("Dalej", "Gotowe — przejdź do rozgrywki",
//     "Rozpocznij grę"), otwarcie/zapis modala ustawień gry.
const REVEAL_PACE_MS = 3400;
const ADMIN_PACE_MS = 900;
const WRITE_RPC_RE = /\/rpc\/(game_state_write|game_state_buzzer_press)(\?|$)/;

function waitForWrite(page) {
  // Zarejestruj oczekiwanie PRZED akcją, żeby nie przegapić odpowiedzi,
  // która wróci bardzo szybko. Nie każda akcja w tym scenariuszu wywołuje
  // zapis (np. czysto lokalne zaznaczenie drużyny w physicalBuzzer, przed
  // potwierdzeniem) — stąd .catch(() => null) zamiast wywalać cały
  // scenariusz na braku pasującej odpowiedzi.
  return page
    .waitForResponse((resp) => WRITE_RPC_RE.test(resp.url()), { timeout: 15000 })
    .catch(() => null);
}

async function clickPaced(locator, ms = REVEAL_PACE_MS) {
  const page = locator.page();
  const responded = waitForWrite(page);
  await locator.click();
  await responded;
  await page.waitForTimeout(ms);
}

// Buzzer v2 nie polluje -- czyta stan WYŁĄCZNIE reaktywnie, na "dzwonek"
// (broadcast realtime) albo visibilitychange/pageshow/online (js/core/
// game-state-subscribe.js) -- bez pollingu nie ma nic, co samo nadgoni
// zgubiony dzwonek, jeśli kanał realtime akurat urwał się w tym oknie
// (opisane wprost w komentarzu tego pliku jako znane ryzyko). Pod
// jednoczesnym obciążeniem 4 realnych okien + nagrywania wideo/audio w CI
// (run #32) zdarzyło się raz, że przycisk Buzzera zostawał trwale
// disabled po starcie nowej rundy, mimo że Control poprawnie przeszedł do
// r_duel -- nie dało się tego powiązać z żadnym konkretnym bugiem w
// resecie duel.firstTeam (który jest poprawny w engine.js i wielokrotnie
// potwierdzony zielony w control2.spec.js). Zamiast zgadywać dalej:
// odtwarzamy dokładnie to, co zrobiłby operator, gdy Buzzer "zamarzł" --
// krótkie oczekiwanie, a jeśli nie pomoże, przeładowanie strony (co i tak
// wywołuje świeży bootstrap przez game_state_get, patrz subscribe.start()).
async function waitBuzzerEnabledResilient(buzzerPage, label, timeoutMs = 12_000) {
  const btn = buzzerPage.getByRole("button", { name: label });
  try {
    await expect(btn).toBeEnabled({ timeout: timeoutMs });
    return btn;
  } catch {
    console.log(`[record] Buzzer (${label}) nie odblokował się w ${timeoutMs}ms -- przeładowuję stronę (tak jak zrobiłby to operator)`);
    await buzzerPage.reload({ waitUntil: "domcontentloaded" });
    await expect(btn).toBeEnabled({ timeout: timeoutMs });
    return buzzerPage.getByRole("button", { name: label });
  }
}

async function pressBuzzerPaced(buzzerPage, label, ms = REVEAL_PACE_MS) {
  const btn = await waitBuzzerEnabledResilient(buzzerPage, label);
  await clickPaced(btn, ms);
}

// Odpowiedź/X/"Oddaj kontrolę" idą przez zaznacz -> potwierdź
// (control2/js/ui.js's armableTile): pierwsze kliknięcie tylko uzbraja
// (złota obwódka) — CZYSTO LOKALNA zmiana UI, zero zapisu do game_state,
// więc clickPaced's waitForWrite by na niej wisiał do timeoutu. Uzbrojenie
// dostaje więc zwykły klik + krótką pauzę (żeby złota obwódka było widać w
// nagraniu), a dopiero drugi klik na TYM SAMYM elemencie idzie przez
// clickPaced jak każda inna akcja zapisująca stan. Domyślnie zawsze
// REVEAL_PACE_MS -- arm+confirm to z definicji moment rozgrywki (odpowiedź,
// X, kradzież), nigdy krok administracyjny.
async function armAndConfirmPaced(locator, ms = REVEAL_PACE_MS) {
  const page = locator.page();
  await locator.click();
  await page.waitForTimeout(1800); // widz ma zdążyć zobaczyć złotą obwódkę "uzbrojenia" przed potwierdzeniem (proporcjonalnie do REVEAL_PACE_MS)
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
async function fillPaced(locator, text, ms = REVEAL_PACE_MS) {
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

// Zgłoszone (po realnym nagraniu, punkt 3/C2-05): "modal ustawień wisi, nie
// widać wpisywania z klawiatury/suwaka" — do tego momentu suwaki w tym
// skrypcie (#gsFrame's input.sfx-vol, control2's input.summarySoundVol)
// dostawały wartość docelową JEDNYM .evaluate(), bez żadnego kroku
// pośredniego — na nagraniu wygląda to jak nic (kilkaset ms zera akcji),
// potem nagle inna wartość, zamiast widocznego przesunięcia uchwytu.
// Ten helper rozkłada tę samą zmianę na kilka pośrednich kroków wartości,
// z krótką pauzą między nimi, więc widz faktycznie widzi suwak jadący do
// nowej pozycji — identyczny mechanizm zapisu (set value + dispatch
// "input", na końcu też "change"), tylko rozciągnięty w czasie.
async function animateSlider(locator, toValue, { steps = 8, stepDelay = 70 } = {}) {
  const from = Number(await locator.evaluate((el) => el.value));
  const to = Number(toValue);
  for (let i = 1; i <= steps; i++) {
    const v = Math.round(from + ((to - from) * i) / steps);
    const isLast = i === steps;
    await locator.evaluate((el, { v, isLast }) => {
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if (isLast) el.dispatchEvent(new Event("change", { bubbles: true }));
    }, { v, isLast });
    await locator.page().waitForTimeout(stepDelay);
  }
}

// ===== Scenariusz 1: pojedynek z resetem, pass, kradzież wygrana i
// przegrana, dosłanianie reszty, mnożnik pominięty (2 pytania), koniec gry
// bez finału. Ten sam przebieg co control2.spec.js's test "reset
// pojedynku, pass, kradzież wygrana/przegrana, odkrywanie reszty...". =====

async function scenarioRoundsMechanics(pages, { contexts }) {
  const { control, buzzer, display } = pages;

  // ===== Druga karta Control na tę samą grę — zablokowana (resource-lock,
  // kontekst "control") — control2.spec.js's test "druga karta Control...
  // jest zablokowana". Ta sama sesja/konto (ten sam kontekst przeglądarki,
  // więc te same ciasteczka), ale osobna karta -> osobny tab_id
  // (sessionStorage NIE jest dzielony między kartami), więc guardResourceLock
  // widzi kolizję i pokazuje pełnoekranowy #resourceLockGuard. Pozycjonowana
  // NAD siatką 2x2 (jak "odbiorca" w scenariuszu 8), żeby było wyraźnie
  // widać, że to DRUGIE, osobne okno, nie ta sama karta Control.
  console.log("[record] otwieram drugą kartę Control na tę samą grę (dowód blokady zasobu)");
  const secondControlTab = await contexts.control.newPage();
  await positionWindow(contexts.control, secondControlTab, RECIPIENT_QUAD);
  await secondControlTab.goto(control.url(), { waitUntil: "domcontentloaded" });
  await secondControlTab.waitForSelector("#resourceLockGuard", { state: "visible", timeout: 15000 });
  await secondControlTab.waitForTimeout(2500); // widz ma zdążyć przeczytać komunikat blokady na drugiej karcie
  await secondControlTab.close();
  // Naprawiona luka (CI run #28): secondControlTab to NOWA KARTA W TYM SAMYM
  // OKNIE co `control` (ten sam kontekst, celowo -- patrz komentarz wyżej o
  // wspólnych ciasteczkach), nie osobne okno -- positionWindow() na niej
  // WYŻEJ zmniejszał więc CAŁE współdzielone okno do RECIPIENT_QUAD (900px,
  // poniżej progu 980px guardDesktopOnly), a samo zamknięcie karty nie
  // przywracało rozmiaru oknu z powrotem. `control` zostawał trwale zbyt
  // wąski -- dokładnie ten sam objaw ("#deviceGuard narrow" blokuje
  // kliknięcia), co wcześniej (błędnie) przypisano samemu wyścigowi
  // CDP-resize w positionWindow() (patrz komentarz tam). Jawne przywrócenie
  // rozmiaru okna do właściwej ćwiartki Control, zanim cokolwiek dalej na
  // `control` kliknie.
  await positionWindow(contexts.control, control, QUADRANTS.control);
  await control.waitForTimeout(500);

  // ===== QR na wyświetlaczu — Prowadzący i Przycisk, niezależnie i oba
  // naraz — control2.spec.js's test "QR na wyświetlaczu — host i buzzer
  // niezależne...". Operator pokazuje widzowi/grającym kod QR danego
  // urządzenia na Wyświetlaczu, żeby zeskanowali telefonem zamiast
  // przepisywać link/kod ręcznie. clickPaced -- oba przełączniki zapisują
  // detail.display.qr.{host,buzzer} przez zwykły game_state_write.
  console.log("[record] QR na wyświetlaczu — Prowadzący i Przycisk, pojedynczo i oba naraz");
  const qrToggle = (kind, wantOn) => control.locator(`.device-row[data-device="${kind}"] button`, { hasText: wantOn ? "QR na wyświetlaczu" : "Schowaj QR" });
  await clickPaced(qrToggle("host", true), ADMIN_PACE_MS);
  await display.waitForSelector("#qrHostCard:not(.hidden)", { timeout: 10000 });
  await display.waitForTimeout(1500); // widz ma zdążyć zobaczyć sam kod Prowadzącego
  await clickPaced(qrToggle("buzzer", true), ADMIN_PACE_MS);
  await display.waitForSelector("#qrBuzzerCard:not(.hidden)", { timeout: 10000 });
  await display.waitForTimeout(1500); // widz ma zdążyć zobaczyć oba kody naraz
  await clickPaced(qrToggle("host", false), ADMIN_PACE_MS);
  await clickPaced(qrToggle("buzzer", false), ADMIN_PACE_MS);
  // state:"attached" (nie domyślne "visible") -- selektor sam w sobie
  // sprawdza klasę "hidden" (czyli docelowo display:none), więc czekanie na
  // "visible" byłoby sprzeczne z własnym warunkiem i nigdy by się nie
  // spełniło (zdiagnozowane w CI run #29: element poprawnie dostawał klasę
  // "hidden" za każdym razem, ale waitForSelector i tak zawsze wyczerpywał
  // timeout, bo pytał o widoczność elementu, który z definicji ma być
  // niewidoczny).
  await display.waitForSelector("#qrScreen.hidden", { state: "attached", timeout: 10000 });
  await control.waitForTimeout(500);

  // Zgłoszone: "dodaj testy... jeden test niech używa dźwięku z display" —
  // przełącznik "Dźwięk" jest widoczny WYŁĄCZNIE na kroku Urządzeń (stąd na
  // samym początku scenariusza, przed "Dalej"). Po przełączeniu Display
  // pokazuje pełnoekranowy #audioUnlockScreen — przeglądarki wymagają
  // gestu użytkownika, zanim odtwarzanie w ogóle zadziała (nikt normalnie
  // nie dotyka ekranu Wyświetlacza w trakcie gry), więc to jest ten gest.
  // Przełącznik dwustanowy (.toggle-group, jak "Losowo"/"Wybierz" w
  // ustawieniach gry) — tekst opcji to CSS content:attr(data-text),
  // niewidoczny dla getByLabel; klikamy widoczną etykietę po wartości
  // ukrytego radio, ten sam wzorzec co control2.spec.js.
  await control.locator('.toggle-item:has(input[name="soundSource"][value="display"])').click();
  await control.waitForTimeout(600);
  await display.waitForSelector("#audioUnlockScreen", { state: "visible", timeout: 10_000 });
  await display.waitForTimeout(1000); // niech nagranie złapie ekran odblokowania na Display
  await display.locator("#btnAudioUnlock").click();
  await control.waitForTimeout(500);

  await clickPaced(control.getByRole("button", { name: "Dalej" }), ADMIN_PACE_MS);

  // Zgłoszone: "dodaj zmianę ustawień do... nagrywania" — pokaż na nagraniu,
  // że modal ustawień gry (naprawiony w tej sesji: podgląd Wyświetlacza był
  // martwy w trybie modalu) faktycznie działa. Zmiana nazwy drużyny w
  // formularzu, zapis, zamknięcie kliknięciem poza treścią modala (tak
  // zamyka się go naprawdę — control2/js/app.js's gsOverlayEl click handler).
  //
  // Zgłoszone (po realnym nagraniu): "na modalu ustawień wisi bardzo długo"
  // — cały ten blok to demo administracyjne (operator NIC nie ogłasza na
  // głos tutaj), więc ADMIN_PACE_MS + odchudzone pauzy lokalne, nie
  // REVEAL_PACE_MS na każdym kroku jak wcześniej.
  await clickPaced(control.getByRole("button", { name: "Zmień ustawienia" }), ADMIN_PACE_MS);
  await control.waitForTimeout(600); // niech nagranie złapie otwarcie modala
  const gsFrame = control.frameLocator("#gsFrame");
  const gsTeamAInput = gsFrame.locator("#gsTeamA");
  // Zgłoszone (punkt 3/C2-05): ".fill() wsadza cały tekst na raz, na
  // nagraniu wygląda to jak wklejenie, nie jak realne wpisywanie z
  // klawiatury" — tu, w odróżnieniu od typePaced() (control2's #app,
  // zapisuje do game_state), to zwykłe pole formularza bez żadnego zapisu
  // sieciowego do czekania na każdy znak, więc wystarczy wbudowane
  // pressSequentially() z opóźnieniem między znakami (ten sam wzorzec co
  // już używany niżej w tym pliku dla pola e-maila odbiorcy).
  //
  // Zgłoszone PONOWNIE po obejrzeniu nagrania z delay:70 — "dalej chwilę
  // wisi bez akcji a potem Mistrzowie Quizu pojawia się nagle w polu".
  // Przyczyna: #gsTeamA's "input" handler (js/pages/game-settings2.js)
  // przy KAŻDYM znaku woła postPreviewRow() — postMessage do osadzonego
  // /display2?preview=1, które przerysowuje podgląd nazwy drużyny na
  // symulowanej matrycy LED (realna praca głównego wątku, nie coś
  // darmowego). Na współdzielonym, wolniejszym runnerze CI ten koszt per
  // znak bywa dłuższy niż 70ms odstępu — główny wątek (ten sam, na którym
  // maluje się też SAM INPUT) nie nadąża z przemalowaniem między
  // klawiszami, więc kilka znaków loguje się logicznie, a widocznie
  // "doganiają" się w jednej klatce. Podniesione do 140ms, żeby dać
  // realny margines na przemalowanie między znakami, nie tylko na samo
  // zdarzenie "input".
  await gsTeamAInput.clear(); // czyści domyślną nazwę drużyny, zanim wpiszemy nową znak po znaku
  await gsTeamAInput.pressSequentially("Mistrzowie Quizu", { delay: 140 });
  await control.waitForTimeout(800); // niech nagranie złapie podgląd Wyświetlacza aktualizujący się na żywo

  // Zgłoszone: "...i pokręć głośności" — doprecyzowane później: "suwaki w
  // ustawieniach a suwaki w podsumowaniu to różne rzeczy", oba mają być
  // pokazane. To TU (kategoria Dźwięk w tym samym modalu ustawień gry) to
  // games.settings.sound jako punkt wyjściowy — osobny suwak
  // ("round_transition") od tego w samym Podsumowaniu niżej ("reveal"), żeby
  // nagranie pokazywało obie ścieżki osobno, nie jedną zamiast drugiej.
  //
  // W trybie modal sidebar startuje jako schowany drawer (css/game-settings.css's
  // .gs-modal-mode .gs-sidebar — domyślnie display:none, otwierany dopiero po
  // kliknięciu ☰ #btnToggleSidebar, patrz js/pages/game-settings2.js's
  // openSidebar()) — bez tego kliknięcia .gs-sidebar-item istnieje w DOM, ale
  // nie jest "visible" (real bug znaleziony przez failed nagranie: locator.click
  // Timeout 30000ms, "element is not visible").
  await gsFrame.locator("#btnToggleSidebar").click();
  await control.waitForTimeout(350); // niech nagranie złapie drawer się otwierający
  await gsFrame.locator('.gs-sidebar-item[data-cat="sound"]').click();
  await control.waitForTimeout(400);
  const transitionSlider = gsFrame.locator('input.sfx-vol[data-sfx-vol="round_transition"]');
  await transitionSlider.waitFor({ state: "visible", timeout: 10_000 });
  // Zgłoszone (punkt 3/C2-05): jeden skok wartości wygląda na nagraniu jak
  // nic się nie dzieje, a potem nagła zmiana — animateSlider() (patrz wyżej)
  // rozkłada to na kilka widocznych kroków przesuwu uchwytu.
  await animateSlider(transitionSlider, 70);
  await control.waitForTimeout(400); // niech nagranie złapie zaktualizowaną etykietę %

  // Real bug znaleziony przez failed nagranie (przebieg #12/#13): "Zapisz
  // wszystko" (#btnSaveAll) jest zdefiniowany w game-settings2.html, więc
  // renderuje się WEWNĄTRZ #gsFrame -- control.getByRole(...) (bez
  // przenikania do iframe'ów w Playwright) nigdy go nie znajdował, więc
  // locator.click() wisiał pełne 30s zanim rzucił TimeoutError. Poprawny
  // zakres to gsFrame. Zwykły klik, nie clickPaced -- saveAll() zapisuje
  // przez updateChecked("games",...), nie przez game_state_write/
  // game_state_buzzer_press (WRITE_RPC_RE), więc clickPaced's waitForWrite
  // i tak zawsze czekałby pełne 15s na coś, co nigdy nie nadejdzie.
  //
  // DRUGI real bug znaleziony przez failed nagranie (przebieg z 2026-09-25,
  // zrzut ekranu FAILURE.png): zamiast czekać na REALNE potwierdzenie
  // zapisu, kod czekał tu na stały ADMIN_PACE_MS (900ms, obniżone w tej
  // sesji z 2200ms) i OD RAZU klikał w tło, żeby zamknąć modal. Jeśli
  // prawdziwy zapis (saveAll(), sieć) trwał dłużej niż ten stały czas --
  // co w CI się zdarza -- klik w tło trafiał, gdy js/pages/game-settings2.js's
  // isDirty było WCIĄŻ true, więc tryClose() pokazywał
  // confirmModal("Masz niezapisane zmiany...", dokładnie to, co widać na
  // zrzucie), którego nic tu nie obsługiwało -- #gsOverlay nigdy nie
  // znikał, oczekiwanie niżej wisiało pełne 10s, a scenariusz padał kilka
  // kroków później na "Gotowe — przejdź do rozgrywki" (modal wciąż
  // otwarty). To DOKŁADNIE ten sam wyścig, co już raz opisany i naprawiony
  // w control2.spec.js (patrz tam identyczny komentarz) -- ten plik
  // powtórzył błąd stałego czasu zamiast Playwrightowego auto-czekania.
  // Naprawa (ten sam wzorzec co control2.spec.js): czekamy na REALNE
  // potwierdzenie -- przycisk wraca na "enabled" dopiero PO zakończeniu
  // saveAll() (js/pages/game-settings2.js's disabled=true jest pierwszą
  // instrukcją funkcji, więc "enabled" z powrotem jest niezawodnym
  // sygnałem) -- zamiast zgadywać, ile trwa zapis.
  const btnSaveAll = gsFrame.getByRole("button", { name: "Zapisz wszystko" });
  await btnSaveAll.click();
  await expect(btnSaveAll).toBeEnabled({ timeout: 10_000 });
  await control.waitForTimeout(ADMIN_PACE_MS); // widz ma zdążyć zobaczyć potwierdzony zapis
  await control.locator("#gsOverlay").click({ position: { x: 5, y: 5 } });
  await control.locator("#gsOverlay").waitFor({ state: "hidden", timeout: 10_000 });
  await control.waitForTimeout(500);

  // Drugi, NIEZALEŻNY mechanizm — suwak BEZPOŚREDNIO w sekcji "Dźwięk"
  // Podsumowania (control2/js/ui.js's soundSummarySection), bez modala —
  // zmiana tu leci na żywo do game_state, widoczna od razu na Wyświetlaczu
  // (bo soundSource="display"), bez zapisu do games.settings w ogóle.
  const revealSlider = control.locator('input.summarySoundVol[data-sfx-vol="reveal"]');
  await revealSlider.scrollIntoViewIfNeeded();
  await revealSlider.waitFor({ state: "visible", timeout: 10_000 });
  // Jak wyżej (punkt 3/C2-05) — widoczny przesuw uchwytu, nie jeden skok.
  await animateSlider(revealSlider, 40);
  await control.waitForTimeout(400); // niech nagranie złapie zaktualizowaną etykietę %

  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }), ADMIN_PACE_MS);

  // ===== RUNDA 1 =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));

  // Zgłoszone: "dostosuj testy, żeby też testowały zmianę języka" — ten sam
  // przełącznik i propagacja co control2.spec.js's test "zmiana języka w
  // Control propaguje się do Hosta". Przełączamy na angielski (widz łapie
  // tytuł fazy zmieniający się na Hoście), potem WRACAMY na polski, bo cała
  // reszta scenariusza celuje w polskie etykiety przycisków (uiLang jest
  // częścią game_state.detail.settings, więc dotyczy WSZYSTKICH urządzeń,
  // łącznie z etykietami "Buzzer A/B" na przyciskach Buzzera).
  await control.locator(".lang-btn").click();
  await control.waitForTimeout(500);
  await control.locator('.lang-option[data-lang="en"]').click();
  await control.waitForTimeout(2500); // niech nagranie złapie zmianę na Hoście/Display/Buzzerze
  await control.locator(".lang-btn").click();
  await control.waitForTimeout(500);
  await control.locator('.lang-option[data-lang="pl"]').click();
  await control.waitForTimeout(1500);

  // Zgłoszone: wyścig buzzerów wpleciony w pojedynek rundy 1 (zamiast
  // osobnego, krótkiego klipu) — control2.spec.js's test "wyścig — oba
  // przyciski Buzzera naciśnięte w tej samej chwili, tylko jeden
  // zaakceptowany". Oba kliknięcia wystrzelone w TYM SAMYM ticku JS
  // (page.evaluate), nie dwa kolejne Playwrightowe .click() -- dowód, że o
  // zwycięzcy decyduje pojedynczy, atomowy zapis w bazie
  // (game_state_buzzer_press, warunkowy UPDATE), nie klient. Zwycięzca jest
  // NIEDETERMINISTYCZNY -- ale dalszy przebieg pojedynku (X/X/reveal
  // poniżej) jest team-agnostic (generyczne etykiety "X"/kafle odpowiedzi,
  // nie nazwy drużyn), więc działa identycznie niezależnie od tego, kto
  // wygrał. Drużyna A dostała w tym scenariuszu (wyżej, przez modal
  // ustawień gry) nową nazwę "Mistrzowie Quizu" -- domyślne "Alfa" już tu
  // nie istnieje.
  //
  // Zgłoszone (po realnym nagraniu): "z tym żeby coś tam dostrzec był
  // wcześniej problem bo wszystko szło za szybko" -- dłuższe, jawne pauzy
  // (2s) w obu kluczowych momentach: zaraz po wyścigu (widać, który jedyny
  // wspólny kafel "Zatwierdź: ..." się pojawił) i zaraz po potwierdzeniu
  // (widać zaświecony/przygaszony przycisk na Buzzerze).
  console.log("[record] wyścig buzzerów w rundzie 1 — oba przyciski naciśnięte naraz");
  await expect(buzzer.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
  await buzzer.evaluate(() => {
    document.getElementById("btnA")?.click();
    document.getElementById("btnB")?.click();
  });
  const acceptMistrzowie = control.getByRole("button", { name: "Zatwierdź: Mistrzowie Quizu" });
  const acceptBeta = control.getByRole("button", { name: "Zatwierdź: Beta" });
  await expect.poll(async () => (await acceptMistrzowie.count()) + (await acceptBeta.count()), { timeout: 10000 }).toBeGreaterThan(0);
  const raceWinner = (await acceptMistrzowie.count()) > 0 ? "A" : "B";
  const raceWinnerBtn = raceWinner === "A" ? acceptMistrzowie : acceptBeta;
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć, który kafel się pojawił (dowód wyścigu)
  await armAndConfirmPaced(raceWinnerBtn);
  await buzzer.waitForSelector(`#btn${raceWinner}.lit`, { timeout: 10000 });
  await buzzer.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaświecony/przygaszony przycisk na Buzzerze

  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // pudło -> kolej drugiej drużyny
  // Druga drużyna też pudłuje -> RESET CYKLU: kolej wraca do zwycięzcy
  // wyścigu, BEZ nowego zgłoszenia buzzera (firstTeam/secondTeam nie są
  // czyszczone — nie ma ponownego buzera).
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(answerTile(control, 1)); // zwycięzca wyścigu trafia -> wygrywa pojedynek, bez nowego zgłoszenia

  // Zgłoszone: "...tez sprawdź mute na chwilę w jednej z rund" — wyciszenie
  // (#btnMute w topbarze Control, współdzielone przez game_state — patrz
  // control2/js/soundReactor.js) na czas trzech X, wznowione tuż przed
  // odsłonięciem kradzieży, żeby widz USŁYSZAŁ powrót dźwięku.
  await control.locator("#btnMute").click();
  await control.waitForTimeout(600);
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // 3x pudło A -> auto-KRADZIEŻ dla B
  await control.locator("#btnMute").click();
  await control.waitForTimeout(600);
  await armAndConfirmPaced(answerTile(control, 2)); // B kradnie WYGRANĄ
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy
  // Dosłanianie reszty — 6 odpowiedzi, ord 1-2 już odsłonięte (pojedynek+kradzież),
  // zostają 3-4-5-6.
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));
  await armAndConfirmPaced(answerTile(control, 6));
  // Po odsłonięciu WSZYSTKIEGO w R8 przycisk "Zakończ rundę" już nie
  // wystarcza — dochodzi kontekstowo podpisany krok pośredni
  // (NEXT_AFTER_REVEAL, engine.js's r.roundEndDestination), zanim w ogóle
  // pojawi się ekran startowy kolejnej rundy z "Rozpocznij rundę".
  await clickPaced(control.getByRole("button", { name: "Przejdź do następnej rundy" }));

  // ===== RUNDA 2 =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await pressBuzzerPaced(buzzer, "Przycisk B");
  // Zgłoszone: pokaż "Ponów naciśnięcie" jako zwykłą alternatywę
  // przyjęcia -- operator czasem uznaje pierwsze zgłoszenie za
  // przypadkowe i otwiera Buzzer na nowo, zamiast od razu klikać
  // "Zatwierdź". Dłuższa pauza, żeby widz zdążył zobaczyć oba kafle
  // (Zatwierdź + Ponów naciśnięcie) razem, zanim operator wybierze "Ponów".
  await expect(control.getByRole("button", { name: "Zatwierdź: Beta" })).toBeVisible({ timeout: 10000 });
  await control.waitForTimeout(1500);
  await clickPaced(control.getByRole("button", { name: "Ponów naciśnięcie" }));
  await control.waitForTimeout(800);
  await pressBuzzerPaced(buzzer, "Przycisk B");
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(answerTile(control, 1)); // B trafia -> kontrola B, allowPass
  await armAndConfirmPaced(control.getByRole("button", { name: "Oddaj kontrolę" })); // dawny "Pass" -> kontrola A
  await armAndConfirmPaced(answerTile(control, 2)); // A trafia
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // 3x pudło A -> auto-KRADZIEŻ dla B
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // B kradnie, ale PUDŁUJE -> kradzież PRZEGRANA
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy
  // Dosłanianie reszty — ord 1-2 już odsłonięte, zostają 3-4-5-6.
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));
  await armAndConfirmPaced(answerTile(control, 6));
  // Tu docelowo jest koniec gry (bez finału), nie kolejna runda — ten sam
  // krok pośredni, ale kontekstowo inny label (r.roundEndDestination==="GAME_END").
  await clickPaced(control.getByRole("button", { name: "Przejdź do zakończenia gry" }));

  // ===== Koniec gry bez finału =====
  await clickPaced(control.getByRole("button", { name: "Zakończ grę" }));
  await control.waitForTimeout(4000); // zostaw ekran końcowy widoczny chwilę na nagraniu

  // ===== "Zacznij od nowa" — control2.spec.js's test "\"Zacznij od nowa\"
  // w trakcie gry wraca do D0". Topbar -> modal potwierdzenia -> "Tak"
  // (exact:true, bo dopasowanie podciągiem złapałoby też "Kontakt") ->
  // powrót do kroku "Urządzenia".
  console.log("[record] \"Zacznij od nowa\" (dowód powrotu do kroku Urządzenia)");
  // Zwykły klik (nie clickPaced) -- samo otwarcie modala potwierdzenia nie
  // wywołuje żadnego zapisu do game_state, więc waitForWrite wisiałby tu
  // pełne, zmarnowane 15s (patrz komentarz przy waitForWrite/clickPaced).
  await control.locator("#btnStartOver").click();
  await control.waitForTimeout(500); // niech nagranie złapie modal potwierdzenia
  await clickPaced(control.getByRole("button", { name: "Tak", exact: true }), ADMIN_PACE_MS);
  await expect(control.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 10000 });
  await control.waitForTimeout(1500); // widz ma zdążyć zobaczyć powrót do kroku Urządzenia
}

// ===== Scenariusz 9: physicalBuzzer + noHostTablet — control2.spec.js's
// test "physicalBuzzer + noHostTablet — urządzenia pominięte, ręczny wybór
// drużyny". Wyświetlacz zawsze wymagany (bez opt-outu w ogóle) — nadal
// otwieramy wszystkie 4 okna (openTiledDevices w main()), Host/Buzzer po
// prostu zostają "opted-out" (wyszarzone, nieklikalne) i nieużywane przez
// resztę scenariusza. Krótki, czysto pokazowy scenariusz (jedna odpowiedź) —
// sedno to sam mechanizm ręcznego wyboru drużyny, nie pełna runda. =====

async function scenarioPhysicalBuzzerNoHost(pages) {
  const { control } = pages;

  console.log("[record] physicalBuzzer + noHostTablet (ręczny wybór drużyny, bez Prowadzącego/Przycisku)");
  await control.getByLabel("Przycisk fizyczny").check(); // "Fizyczny przycisk" -> "Przycisk fizyczny", ujednolicenie słownictwa
  await control.waitForTimeout(400); // niech nagranie złapie wiersz Przycisku wyszarzający się
  await control.getByLabel("Nie używaj tabletu prowadzącego").check();
  await control.waitForTimeout(1000); // niech nagranie złapie wiersz Prowadzącego wyszarzający się + kropki w topbarze znikające

  await clickPaced(control.getByRole("button", { name: "Dalej" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));

  // Bez Buzzera na ekranie: zaznacz -> zmień zdanie (klik drugiej drużyny,
  // ekran identyczny jak w trybie normalnym -- oba kafle drużyn po prostu
  // klikalne) -> zaznacz->potwierdź wspólny kafel "Zatwierdź: <drużyna>".
  // Pierwsze kliknięcia to czysto lokalne zaznaczenie (zero zapisu do
  // game_state) -- zwykły klik + krótka pauza, nie clickPaced.
  await control.getByRole("button", { name: "Alfa", exact: true }).click();
  await control.waitForTimeout(1200); // widz ma zdążyć zobaczyć "Zatwierdź: Alfa"
  await control.getByRole("button", { name: "Beta", exact: true }).click();
  await control.waitForTimeout(1200);
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));

  await armAndConfirmPaced(answerTile(control, 1)); // Beta trafia -> przejmuje kontrolę
  await control.waitForTimeout(2500); // zostaw wynik (Bank) widoczny chwilę na nagraniu
}

// ===== Scenariusz 2/3: progresja przez 3 rundy aż do NATURALNEGO
// osiągnięcia domyślnego progu (finalMinPoints=300, shared/gameStateShape.js)
// — zgłoszone: "nie zmieniaj progu punktów... rozgrywka ma być naturalna".
// Każda z 3 rund to inne, prawdziwe pytanie demo (PROGRESSION_ROUND_ORDS),
// odsłonięte w CAŁOŚCI (6 odpowiedzi, realnie sumujące się do 100 —
// zweryfikowane w treści migracji), mnożnik rund 1-3 domyślnie ×1
// (DEFAULT_SETTINGS.roundMultipliers=[1,1,1,2,3]) — kumulatywnie
// 100/200/300, próg trafiony DOPIERO na końcu 3. rundy, nigdy wcześniej.
// Runda 2. dodatkowo pokazuje jedyną gałąź pojedynku, której nie było w
// żadnym innym scenariuszu: pierwsza drużyna pudłuje, DRUGA wygrywa na
// swojej próbie odpowiedzią NIE-topową, bez żadnego resetu (to inny
// przypadek niż RESET z scenariusza 1, gdzie pudłują OBIE drużyny).
// `expectFinal` przełącza wyłącznie to, co się dzieje PO 3. rundzie: wejście
// w finał (próg + hasFinal=true) albo prosto na ekran końca gry (próg +
// hasFinal=false) — sama progresja rund jest identyczna w obu wariantach. =====

async function scenarioRoundsThreshold(pages, { expectFinal, showReload = false }) {
  const { control, buzzer } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }), ADMIN_PACE_MS);

  // ===== RUNDA 1: pojedynek wygrany za pierwszym razem (bez pudła), potem
  // wszystkie 6 odpowiedzi odsłonięte naturalnie w PLAY =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // A trafia topową odpowiedź od razu -> wygrywa pojedynek
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5
  await armAndConfirmPaced(answerTile(control, 6)); // odp. #6 -> wszystko odsłonięte -> koniec rundy pomija ekran dosłaniania
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy

  // ===== RUNDA 2: B pudłuje -> BEZ resetu, druga próba (A) wygrywa
  // odpowiedzią nie-topową, potem reszta (w tym top) odsłonięta w PLAY =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await pressBuzzerPaced(buzzer, "Przycisk B");
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // B pudłuje -> kolej na drugą próbę (A), NIE reset
  await armAndConfirmPaced(answerTile(control, 2)); // A trafia odpowiedź NIE-topową -> WYGRYWA, bo B miał 0 pkt

  if (showReload) {
    // ===== KLUCZOWY MOMENT: przeładowanie Control W ŚRODKU rundy 2 —
    // dokładnie ten scenariusz, po który cała przebudowa game_state
    // (wspólna tabela stanu zamiast ulotnych komend w pamięci przeglądarki
    // operatora) powstała (plan, sekcja 7 "Weryfikacja", punkt 4). Stan
    // (runda, wynik, kto ma kontrolę, które odpowiedzi już odsłonięte)
    // musi wrócić DOKŁADNIE taki, jaki był, bez żadnej ręcznej interwencji
    // — to samo, co już sprawdza control2.spec.js's test "pełna runda +
    // wznowienie Control po przeładowaniu", tu widoczne na nagraniu.
    console.log("[record] przeładowuję Control w środku rundy 2 (dowód wznowienia stanu)");
    await control.reload({ waitUntil: "domcontentloaded" });
    await expect(control.locator(".c2-stepper")).toContainText("Runda 2", { timeout: 22000 });
    // Odpowiedź #2 (odsłonięta PRZED przeładowaniem) musi wrócić zielona —
    // dowód, że to prawdziwe wznowienie stanu, nie tylko pusty ekran "Runda 2".
    await expect(answerTile(control, 2)).toHaveClass(/c2-tile-revealed/, { timeout: 10000 });
    await control.waitForTimeout(2500); // widz ma zdążyć zobaczyć, że Control wznowił się dokładnie w tym samym miejscu
  }

  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top, dosłaniane normalnie)
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5
  await armAndConfirmPaced(answerTile(control, 6)); // odp. #6 -> wszystko odsłonięte
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy

  // ===== RUNDA 3: pojedynek wygrany za pierwszym razem, reszta w PLAY,
  // dobicie do domyślnego progu (300) =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top)
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5
  await armAndConfirmPaced(answerTile(control, 6)); // odp. #6 -> wszystko odsłonięte
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" })); // domyślny próg (300) osiągnięty

  if (expectFinal) {
    await clickPaced(control.getByRole("button", { name: "Rozpocznij finał" }));
    await control.waitForTimeout(4000); // ekran wpisywania gracza 1 widoczny chwilę — pełny final to osobne scenariusze
  } else {
    await clickPaced(control.getByRole("button", { name: "Zakończ grę" }));
    await control.waitForTimeout(4000);
  }
}

// Wspólne dla scenariuszy 4/5 — JEDNA runda (100 pkt) nie wystarcza, żeby
// naturalnie osiągnąć domyślny próg (finalMinPoints=300, zgłoszone: "nie
// zmieniaj progu punktów... rozgrywka ma być naturalna"), więc oba
// scenariusze rozgrywają 3 rundy (inne pytania niż scenariusz 2/3 —
// FINAL_SETUP_ROUND_ORDS). Zgłoszone: "też chodzi o przetestowanie
// kradzieży... w warunkach zbliżonych do naturalnych" — R1-2 to proste
// pojedynki (jak w 2/3), R3 dokłada TRZECI, jeszcze niećwiczony w tym pliku
// przebieg kradzieży (patrz komentarz przy R3 niżej): wygrana kradzież W
// RUNDZIE, która akurat kończy się progiem, więc trzeba dokończyć
// dosłanianie (R8) i kliknąć kontekstowy "Przejdź do finału" zamiast
// automatycznego pominięcia R8.
async function playThreeNaturalRoundsToThreshold(pages) {
  const { control, buzzer } = pages;

  // ===== RUNDA 1-2: proste, pojedynek wygrany od razu, reszta w PLAY =====
  for (let round = 1; round <= 2; round++) {
    await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
    await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
    await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top) -> wygrywa pojedynek
    await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
    await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
    await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
    await armAndConfirmPaced(answerTile(control, 5)); // odp. #5
    await armAndConfirmPaced(answerTile(control, 6)); // odp. #6 -> wszystko odsłonięte
    await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
    await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy
  }

  // ===== RUNDA 3: zgłoszone — "też chodzi o przetestowanie kradzieży...
  // w warunkach zbliżonych do naturalnych". Scenariusz 1 już pokazuje OBIE
  // kradzieże (wygraną i przegraną), ta runda dokłada TRZECI, jeszcze
  // niećwiczony przebieg: kradzież wygrana W RUNDZIE, która akurat kończy
  // się progiem — więc po "Zakończ rundę" trzeba dokończyć dosłanianie
  // (R8) i dopiero potem kliknąć kontekstowy "Przejdź do finału" (destination
  // FINAL), zamiast automatycznego pominięcia R8 jak w rundach 1-2. Steal
  // WYGRANA (nie przegrana) — bank nadal liczy się w CAŁOŚCI (skradziona
  // odpowiedź i tak trafia do banku, tylko innej drużyny), więc suma progu
  // (100 pkt na rundę × 3) zostaje nienaruszona. =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await pressBuzzerPaced(buzzer, "Przycisk B");
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(answerTile(control, 1)); // B trafia top -> wygrywa pojedynek, kontrola B
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // 3x pudło B -> auto-KRADZIEŻ dla A
  await armAndConfirmPaced(answerTile(control, 3)); // A kradnie WYGRANĄ -> bank nadal pełny (skradziona odpowiedź trafia do banku)
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" })); // domyślny próg (300) osiągnięty, ale zostały nieodsłonięte odpowiedzi
  await armAndConfirmPaced(answerTile(control, 4)); // dosłanianie reszty
  await armAndConfirmPaced(answerTile(control, 5));
  await armAndConfirmPaced(answerTile(control, 6));
  await clickPaced(control.getByRole("button", { name: "Przejdź do finału" }));
}

// ===== Scenariusz 11: mnożnik rundy — runda 4. z domyślnym ×2 faktycznie
// przemnaża bank. control2.spec.js's test "mnożnik rundy — runda 4. z
// domyślnym ×2 faktycznie przemnaża bank" (DEFAULT_SETTINGS.roundMultipliers
// = [1,1,1,2,3], shared/gameStateShape.js). finalMinPoints podniesiony
// celowo wysoko (999) w makeGame tego scenariusza -- próg domyślny (300)
// zostałby trafiony dokładnie po rundzie 3, zanim runda 4 (ta, która
// faktycznie ma mnożnik ×2) w ogóle by się zaczęła. Czysty pokaz mnożnika,
// nie progresja do finału/końca gry -- zatrzymuje się zaraz po rundzie 4,
// bez kończenia gry. Cztery różne pytania demo, każde pełne 100 pkt (bank
// w całości odsłonięty, jak w rundach 1-2 wyżej). =====

async function scenarioRoundMultiplier(pages) {
  const { control, buzzer } = pages;

  await clickPaced(control.getByRole("button", { name: "Dalej" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }), ADMIN_PACE_MS);

  const playFullRound = async () => {
    await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
    await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
    await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await armAndConfirmPaced(answerTile(control, 1));
    await armAndConfirmPaced(answerTile(control, 2));
    await armAndConfirmPaced(answerTile(control, 3));
    await armAndConfirmPaced(answerTile(control, 4));
    await armAndConfirmPaced(answerTile(control, 5));
    await armAndConfirmPaced(answerTile(control, 6));
  };

  console.log("[record] mnożnik rundy — rundy 1-3 (×1)");
  for (let round = 1; round <= 3; round++) {
    await playFullRound();
    await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
    await control.waitForTimeout(1500);
  }
  await expect(control.getByText("Alfa: 300")).toBeVisible({ timeout: 10000 });

  console.log("[record] mnożnik rundy — runda 4 (×2, dowód przemnożenia banku)");
  await playFullRound();
  await control.waitForTimeout(800); // widz ma zdążyć zobaczyć pełny bank 100 przed "Zakończ rundę"
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await expect(control.getByText("Alfa: 500")).toBeVisible({ timeout: 10000 }); // 300 + 100x2, nie 400
  await control.waitForTimeout(2500);
}

// n-ta w kolejności (1=najwyżej punktowana, 6=najniżej) PRAWDZIWA odpowiedź
// danego pytania finałowego (game.finalQuestions[i], patrz restoreDemoGame)
// + etykieta kafla dopasowania — dokładnie ten sam format co
// control2/js/ui.js's matchOptions ("<tekst> (<punkty>)"). Zgłoszone
// wprost: "trafienie to nie zawsze najwyższej punktowana odpowiedź" —
// scenariusz 4 dopasowuje różne miejsca w rankingu (nie zawsze to samo),
// dokładnie jak w realnej grze, gdzie gracz może trafić w dowolną z 6
// odpowiedzi na planszy.
function answerByRank(q, rank) {
  return [...q.answers].sort((a, b) => b.fixed_points - a.fixed_points)[rank - 1];
}
function matchButtonLabel(a) {
  return `${a.text} (${a.fixed_points})`;
}

// ===== Scenariusz 4: finał pełny — oba bloki, naturalne wygaśnięcie
// zegarka gracza 1, powtórzenie u gracza 2, odsłonięcie odpowiedzi gracza 1
// na Display I Host przy starcie tury gracza 2, WSZYSTKIE cztery wyniki
// mapowania (MATCH/MISS/SKIP/Powtórzenie) — i, zgłoszone wprost, drużyna
// FAKTYCZNIE WYGRYWA finał na końcu (w odróżnieniu od scenariusza 5, gdzie
// próg jest trafiony natychmiast, na samym początku). Ten sam przebieg co
// control2.spec.js's test "finał — obaj gracze, wszystkie 10 pytań...",
// tyle że TU liczby są dobrane tak, żeby ostatnie trafienie (gracz 2,
// pytanie #4) przekroczyło finalTarget (patrz P1_MATCH_RANK/P2_MATCH_RANK
// i finalTarget:100 w makeGame). Każdy z czterech MATCH-ów trafia w INNE
// miejsce rankingu odpowiedzi (2. i 3. u gracza 1, 2. i 1. u gracza 2) —
// nie mechanicznie zawsze to samo, i nie zawsze najwyższe. Realna suma w
// kolejności odsłonięć: 28 (P1#1) -> 46 (P1#4, +18) -> 70 (P2#2, +24) -> 105
// (P2#4, +35) — ostatnie trafienie przekracza próg (100), więc silnik
// (REVEAL_POINTS w engine.js) skacze PROSTO do f_end zaraz po nim: pytanie
// #5 gracza 2 (SKIP) nigdy nie zostaje odsłonięte — SKIP jest i tak już
// pokazany trzykrotnie wcześniej w tym scenariuszu (P1#2, P1#5, P2#3), więc
// nic realnie nie ginie z demonstrowanej różnorodności. =====

async function scenarioFinalFull(pages, { game }) {
  const { control, buzzer, host } = pages;
  const fq = game.finalQuestions;

  await clickPaced(control.getByRole("button", { name: "Dalej" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }), ADMIN_PACE_MS);

  await playThreeNaturalRoundsToThreshold(pages);

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
  // Które miejsce w rankingu odpowiedzi (1=najwyżej, 6=najniżej punktowana)
  // trafia każdy MATCH — celowo różne za każdym razem, nie zawsze ta sama
  // pozycja. Dokładna suma (28+18+24+35=105) jest policzona tak, żeby
  // ostatnie trafienie (P2, idx3) przekroczyło finalTarget:100 (makeGame) —
  // patrz pełne wyliczenie w komentarzu nad funkcją.
  const P1_MATCH_RANK = [2, null, null, 3, null];
  const P2_MATCH_RANK = [null, 2, null, 1, null];

  // Zgłoszone wprost: "wpisywanie w finale ma być podczas odliczania, nie
  // przed" -- kod (control2/js/ui.js's finalTimerRow/renderFinalEntry) już
  // na to pozwala: pole wpisywania blokuje WYŁĄCZNIE boardBusy() (krótka
  // serwerowa blokada zaraz po przejściu ekranu), nie stan zegarka, a
  // tickTimers() (naprawione przy #13) aktualizuje TYLKO cyfry co 250ms,
  // bez przebudowy reszty ekranu -- więc pisanie w trakcie odliczania nie
  // gubi fokusu pola. Scenariusz ma to NAPRAWDĘ pokazać: zegarek startuje
  // NAJPIERW, wpisywanie leci W TRAKCIE, nie przed.
  // armAndConfirmPaced, nie clickPaced -- start/stop zegarka gracza idzie
  // teraz przez zaznacz->potwierdź (nieodwracalna, ryzykowna akcja).
  await armAndConfirmPaced(control.getByRole("button", { name: "Rozpocznij odliczanie (15s)" }));
  const p1Inputs = control.locator("#app input[type=text]");
  for (let i = 0; i < 5; i++) {
    if (P1_PLAN[i] === true) await typePaced(p1Inputs.nth(i), answerByRank(fq[i], P1_MATCH_RANK[i]).text);
    else if (P1_PLAN[i] === "miss") await typePaced(p1Inputs.nth(i), "Zła odpowiedź");
    // false: nic nie wpisujemy -> AUTO+SKIP, widoczne od razu jako domyślne
    // zaznaczenie na kaflu "Brak odpowiedzi" (control2/js/ui.js's
    // effectiveMappingResolution), potwierdzane przez "Pokazana" niżej.
  }
  // Wpisywanie powyżej już zjadło kilka sekund PO starcie zegarka -- reszta
  // to tylko dociągnięcie do naturalnego wygaśnięcia (15s), z zapasem.
  await control.waitForTimeout(12_000);

  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  for (let i = 0; i < 5; i++) {
    // armAndConfirmPaced, nie clickPaced -- ten kafel wyboru dopasowania
    // idzie przez armableTile (zaznacz -> potwierdź), zwykły pojedynczy
    // klik by go tylko zaznaczył, zostawiając efektywne dopasowanie na
    // domyślnym AUTO-fallbacku (MISS) -- patrz identyczny, real bug
    // znaleziony i opisany w scenariuszu 5 niżej.
    if (P1_PLAN[i] === true) await armAndConfirmPaced(control.getByRole("button", { name: matchButtonLabel(answerByRank(fq[i], P1_MATCH_RANK[i])) }));
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

  // Gracz 2: zegarek NAJPIERW (ta sama poprawka co u gracza 1 wyżej —
  // "wpisywanie w finale ma być podczas odliczania, nie przed"), dopiero
  // POTEM powtórzenie (pytanie #1) i reszta wg P2_PLAN (dosłowny tekst
  // prawdziwej, najniżej punktowanej odpowiedzi przy MATCH).
  await armAndConfirmPaced(control.getByRole("button", { name: "Rozpocznij odliczanie (20s)" }));
  // Włączenie "Powtórzenie" też zaznacz->potwierdź (konsekwentne: dźwięk +
  // wymuszony SKIP w mapowaniu) -- zdjęcie flagi zostaje jednoklikowe.
  await armAndConfirmPaced(control.getByRole("button", { name: "Powtórzenie" }).first());
  const p2Inputs = control.locator("#app input[type=text]");
  for (let i = 1; i < 5; i++) {
    if (P2_PLAN[i] === true) await typePaced(p2Inputs.nth(i), answerByRank(fq[i], P2_MATCH_RANK[i]).text);
    // false: nic nie wpisujemy -> AUTO+SKIP
  }
  // Zgłoszone: "po drugiej rundzie finału nawet nie czeka na koniec
  // timera" — "Dalej" jest teraz zablokowany, dopóki zegarek tej rundy
  // aktywnie odlicza (control2/js/ui.js's renderFinalEntry), więc TEN test
  // musi poczekać na naturalne wygaśnięcie (20s) dokładnie jak gracz 1
  // wyżej — wcześniejszy komentarz "tym razem NIE czekamy" opisywał stan
  // sprzed tej naprawy. Wpisywanie powyżej już zjadło kilka sekund PO
  // starcie zegarka -- reszta to tylko dociągnięcie z zapasem.
  await control.waitForTimeout(16_000);
  await clickPaced(control.getByRole("button", { name: "Dalej" }));

  for (let i = 0; i < 5; i++) {
    if (P2_PLAN[i] === true) await armAndConfirmPaced(control.getByRole("button", { name: matchButtonLabel(answerByRank(fq[i], P2_MATCH_RANK[i])) }));
    await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż odpowiedź" }));
    await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż punkty" }));
    // Suma po TYM trafieniu (idx3: 70+35=105) przekracza finalTarget:100
    // (makeGame) -> REVEAL_POINTS w engine.js skacze PROSTO do f_end, silnik
    // NIE czeka na kolejne "Dalej" -- ekran mapowania po prostu już nie
    // istnieje, klik w "Dalej" nie miałby czego trafić. Pytanie #5 gracza 2
    // (SKIP) nigdy nie zostaje odsłonięte -- drużyna wygrywa finał w tym
    // właśnie momencie.
    if (i === 3) break;
    await clickPaced(control.getByRole("button", { name: "Dalej" }));
  }

  // renderEndScreen (control2/js/ui.js) pokazuje TU, na ekranie PRZED
  // odsłonięciem ("Zakończ grę" jeszcze nieklikn.), pasek z sumą finału
  // (state.final.runtime.sum) — widz ma zdążyć go przeczytać, zanim klik
  // przejdzie dalej do właściwego ekranu końcowego.
  await control.waitForTimeout(2000);
  await clickPaced(control.getByRole("button", { name: "Zakończ grę", exact: true }));
  await control.waitForTimeout(4000); // ekran końcowy widoczny chwilę na nagraniu
}

// ===== Scenariusz 5: finał z WCZESNYM zakończeniem — pierwsza odpowiedź
// gracza 1 sama przekracza próg finału (finalTarget, tu celowo obniżony do
// 30 w makeGame — patrz komentarz przy SCENARIOS), więc silnik przeskakuje
// prosto do f_end (REVEAL_POINTS w engine.js), pomijając resztę pytań
// gracza 1 I CAŁEGO gracza 2. Ta gałąź nie była w ogóle ćwiczona wcześniej —
// dotychczasowy "final pełny" celowo dobiera niskie wartości punktowe, żeby
// NIGDY nie trafić progu przed końcem. Wymaga wpisania tylko JEDNEJ
// odpowiedzi — dokładnie to, o co chodziło w uwadze "nie musimy wpisywać
// wszystkich odpowiedzi". Prawdziwe pytanie demo (game.finalQuestions[0]) —
// dopasowujemy jego NAJWYŻEJ punktowaną odpowiedź, żeby sama przekroczyła
// obniżony próg. =====

async function scenarioFinalEarlyExit(pages, { game }) {
  const { control, buzzer, host } = pages;
  const q0 = game.finalQuestions[0];
  const top = answerByRank(q0, 1);

  await clickPaced(control.getByRole("button", { name: "Dalej" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }), ADMIN_PACE_MS);

  await playThreeNaturalRoundsToThreshold(pages);

  await clickPaced(control.getByRole("button", { name: "Rozpocznij finał" }));
  await control.waitForTimeout(4000); // final_theme + reveal

  await hostPeekSwipe(host);
  await host.waitForTimeout(1500);

  // Tylko JEDNA odpowiedź — reszta pól gracza 1 zostaje pusta, bo i tak
  // nigdy do nich nie dojdziemy. Zegarek pomijamy całkowicie (opcjonalny —
  // "Dalej" działa niezależnie od tego, czy w ogóle był uruchomiony).
  const p1Inputs = control.locator("#app input[type=text]");
  await typePaced(p1Inputs.nth(0), top.text);
  await clickPaced(control.getByRole("button", { name: "Dalej" }));

  // Real bug znaleziony przez failed nagranie (przebieg #22, diagnostyka):
  // kafle wyboru dopasowania w finale (control2/js/ui.js's renderFinalMapping,
  // optionTiles) idą przez armableTile -- zaznacz -> potwierdź, DOKŁADNIE
  // jak odpowiedzi/X w Rundach (patrz komentarz tam: "z podwójnym
  // kliknięciem jako skrótem"). Zwykły clickPaced (pojedynczy klik) tylko
  // ZAZNACZAŁ ten kafel, nigdy nie potwierdzał -- efektywne dopasowanie
  // zostawało więc na domyślnym AUTO-fallbacku ("Nie ma na liście", MISS,
  // potwierdzone diagnostyką: ta opcja pokazywała się jako aktywna/danger,
  // a kafel realnej odpowiedzi jako zwykły, niezaznaczony kafel) --
  // runtime.sum nigdy nie osiągał finalTarget, więc silnik nigdy nie skakał
  // do f_end i "Zakończ grę" nigdy się nie pojawiało.
  await armAndConfirmPaced(control.getByRole("button", { name: matchButtonLabel(top) }));
  await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż odpowiedź" }));
  // top.fixed_points >= finalTarget (30, obniżony w makeGame) -> REVEAL_POINTS
  // w engine.js skacze prosto do f_end, pomijając NEXT_QUESTION/pytania 2-5
  // gracza 1 i CAŁEGO gracza 2 — "Pokaż punkty" to ostatni kafel
  // odsłaniania w tym scenariuszu.
  await armAndConfirmPaced(control.getByRole("button", { name: "Pokaż punkty" }));

  // Patrz identyczny komentarz w scenariuszu 4 — pasek z sumą finału na
  // ekranie przed odsłonięciem, widz ma zdążyć go zobaczyć.
  await control.waitForTimeout(2000);
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

  await clickPaced(control.getByRole("button", { name: "Dalej" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));

  await clickPaced(pages.buzzer.getByRole("button", { name: "Przycisk A" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top) -> wygrywa pojedynek, reszta rundy zostaje NIEODSŁONIĘTA

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
  await armAndConfirmPaced(answerTile(control, 6));
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000);

  // ===== Runda 2, w CAŁOŚCI na ponownie podłączonym Buzzerze — nie tylko
  // presence, prawdziwy udział w grze. =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(pages.buzzer.getByRole("button", { name: "Przycisk B" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top)
  await armAndConfirmPaced(answerTile(control, 2));
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));
  await armAndConfirmPaced(answerTile(control, 6));
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000);

  await clickPaced(control.getByRole("button", { name: "Zakończ grę" }));
  await control.waitForTimeout(4000); // ekran końcowy widoczny chwilę na nagraniu
}

// ===== Scenariusz 7: blokada logo — Control czeka, aż logo-editor.js
// zwolni logo referencowane przez grę, i wznawia się SAM, gdy się zwolni.
// Zgłoszone: "dostosuj testy, żeby też testowały... blokadę logo (samego
// otwartego logo edytować nie musisz pokazywać na nagraniu, albo możesz w
// miejscu gdzie potem będzie inne urządzenie" — blokada jest zajęta
// zewnętrznie, PRZED otwarciem okna Control (patrz makeGame w definicji
// scenariusza niżej: acquireLogoLockExternally() woła dokładnie to samo
// RPC co logo-editor.js po kliknięciu "Edytuj", bez pokazywania samej tej
// strony), a okno "control" pokazuje zablokowany ekran DOKŁADNIE w tym
// samym miejscu (ćwiartka "control"), w które chwilę później wejdzie
// normalne parowanie urządzeń — ten sam kwadrat na ekranie, dwa kolejne
// etapy tej samej gry testowej. =====

// ===== Scenariusz 8: udostępnianie urządzenia przez e-mail =====
// Zgłoszone: "chcę też dodać test podłączania urządzenia przez 'podłącz
// urządzenie' używając maila — już mamy system ze skrzynką testową".
// control2/js/shareDevice.js's "Udostępnij": operator wpisuje e-mail
// ISTNIEJĄCEGO konta (resolveToUserId tam szuka w profiles -- dowolny
// adres spoza puli testX skończyłby się "Nie znaleziono użytkownika", bez
// wysłania czegokolwiek), RPC share_device zapisuje udostępnienie, a
// js/core/send-mail (Edge Function) wysyła PRAWDZIWY e-mail z linkiem
// /host2?id=&key=<share_key_host> -- DOKŁADNIE tym samym mechanizmem co
// QR/kod, tylko dostarczonym pocztą zamiast zeskanowania. test2@familiada.online
// to drugie konto z tej samej puli testX co test1 (login.js) -- gwarantowane
// istniejące na produkcji (e2e-tests.yml's TEST_ACCOUNT_COUNT=10), więc
// resolveToUserId zawsze je znajdzie.
async function scenarioShareDeviceEmail(pages, { browser }) {
  const { control } = pages;
  const RECIPIENT_EMAIL = "test2@familiada.online";

  // Zgłoszone: maile mają cooldown/suppression, żeby nie spamować -- przy
  // wielokrotnym testowaniu na TYM SAMYM koncie trzeba to ręcznie zdjąć w
  // bazie przed testem. docs/email-system-description.md: mail-worker
  // POMIJA wysyłkę CICHO (bez błędu), gdy user_flags.email_notifications
  // odbiorcy jest false -- wygląda identycznie jak zwykły timeout, tylko
  // mail nigdy się nie zjawi. test2 jest tu odbiorcą w WIELU przebiegach
  // tego scenariusza (każde CI) -- zamiast liczyć na to, że nikt nigdy nie
  // zgasił tej flagi, wymuszamy ją z powrotem na true PRZED udostępnieniem:
  // logujemy się NA KONTO ODBIORCY w osobnym, efemerycznym kontekście
  // (user_flags ma RLS tylko na własny wiersz -- auth.uid()=user_id) i
  // nadpisujemy. Identyczny wzorzec jak w control2.spec.js's @mailbox test
  // dla tego samego scenariusza (tam na test10, nie test2 -- inne konto
  // odbiorcy, ten sam mechanizm).
  //
  // Ten sam kontekst usuwa też od razu udostępnienie z poprzedniego
  // przebiegu (e2e_shared_devices_cleanup, migracja 287 -- analogiczne do
  // e2e_poll_subscriptions_cleanup) zamiast klikać "Cofnij" w UI dopiero
  // gdy modal każe -- shared_devices ma TTL 4h i UNIQUE (owner,recipient,
  // typ) GLOBALNIE na konto, nie per-grę, więc inaczej każdy kolejny
  // przebieg tego samego dnia zastaje już istniejące udostępnienie.
  const testUid = await control.evaluate(async () => {
    const { data } = await window.__sbClient.auth.getUser();
    return data?.user?.id || null;
  });
  let recipientUid = null;
  {
    const recipientSetupCtx = await browser.newContext();
    const recipientSetupPage = await recipientSetupCtx.newPage();
    try {
      await loginAsTestUser(recipientSetupPage, recipientSetupCtx, { username: RECIPIENT_EMAIL });
      recipientUid = await recipientSetupPage.evaluate(async (ownerUid) => {
        const sb = window.__sbClient;
        const { data: userData } = await sb.auth.getUser();
        await sb.from("user_flags").upsert({ user_id: userData.user.id, email_notifications: true }, { onConflict: "user_id" });
        if (ownerUid) await sb.rpc("e2e_shared_devices_cleanup", { p_other_user_id: ownerUid });
        return userData.user.id;
      }, testUid);
      console.log("[record] user_flags.email_notifications wymuszone na true + stare udostępnienia wyczyszczone dla test2");
    } finally {
      await recipientSetupCtx.close().catch(() => {});
    }
  }

  // Krok Urządzeń jest już widoczny (openTiledDevices) -- "Udostępnij" dla
  // Prowadzącego (wiersz host), dokładnie jak operator kliknąłby na żywo.
  await expect(control.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
  await control.locator('[data-device="host"]').getByRole("button", { name: "Udostępnij" }).click();
  await control.waitForSelector("#shareDeviceOverlay", { state: "visible", timeout: 10_000 });
  await control.waitForTimeout(800); // widz ma zdążyć zobaczyć otwarty modal

  // Zapasowa siatka bezpieczeństwa: e2e_shared_devices_cleanup wyżej
  // powinno już usunąć każde stare udostępnienie między tymi dwoma
  // kontami (dowolny device_type), ale gdyby coś mu umknęło (np. race),
  // modal i tak pokaże "już udostępnione" -- wtedy cofamy przez UI,
  // dokładnie jak zrobiłby operator.
  const alreadyShared = await control.locator("#shareDeviceCurrentWrap").isVisible();
  if (alreadyShared) {
    console.log("[record] urządzenie już udostępnione z poprzedniego przebiegu -- cofam, zanim dodam ponownie");
    await control.locator("#btnRevokeDevice").click();
    await control.locator("#shareDeviceCurrentWrap").waitFor({ state: "hidden", timeout: 10_000 });
    await control.waitForTimeout(400);
  }

  // NIE typePaced(): to pole nie jest częścią game_state (czysty, lokalny
  // formularz w shareDevice.js) -- żadne naciśnięcie klawisza nie wywołuje
  // RPC zapisu, więc typePaced's waitForWrite() (15s timeout NA ZNAK)
  // czekałoby daremnie na coś, co nigdy nie nadejdzie. pressSequentially()
  // daje tę samą widoczną na nagraniu animację pisania, bez tego założenia.
  const emailInput = control.locator("#shareDeviceEmail");
  await emailInput.pressSequentially(RECIPIENT_EMAIL, { delay: 60 });
  await control.waitForTimeout(400);

  // Moment TUŻ PRZED wysyłką -- granica dla waitForEmail() niżej, żeby nie
  // złapać przypadkiem starszego maila z poprzedniego przebiegu na ten sam
  // adres odbiorcy (dwa przebiegi równoległe/kolejne na tym samym koncie).
  const sentAfter = new Date().toISOString();
  await control.getByRole("button", { name: "Dodaj" }).click();

  // Modal pokazuje "Aktualnie udostępnione dla: ..." — to jest POTWIERDZENIE
  // zapisu RPC (share_device), widoczne na nagraniu natychmiast; realny
  // e-mail leci asynchronicznie, osobno (fetch do Edge Function, bez
  // czekania w UI). shareDevice.js's renderModal() pokazuje
  // `recipient_username || recipient_email` -- skoro konto testowe MA
  // ustawiony username ("test2"), modal poprawnie pokazuje tylko to, nie
  // pełny e-mail (zdiagnozowane w CI run #31: treść była "test2", nie
  // "test2@familiada.online" -- to zachowanie aplikacji, nie błąd).
  await expect(control.locator("#shareDeviceCurrentContent")).toContainText("test2", { timeout: 15_000 });
  await control.waitForTimeout(2000); // widz ma zdążyć przeczytać potwierdzenie

  console.log(`[record] czekam na e-mail udostępnienia do ${RECIPIENT_EMAIL}`);
  // BEZ `timeout` -- domyślne 90s z helpers/mailbox.js. Ten sam test w
  // control2.spec.js jawnie skracał do 60_000, co było dokładnie na
  // granicy worst-case opóźnienia kolejki (mail-worker przetwarza
  // mail_queue co 60s przez pg_cron -- mail wstawiony tuż PO tiku czeka
  // prawie całą minutę na następny, zanim doliczyć czas wysyłki przez
  // łańcuch dostawców), stąd sporadyczne "Nie otrzymano maila... w
  // 60000 ms" (naprawione tam w commicie f1f13fa, ten plik miał własną,
  // zduplikowaną kopię tego samego 60_000 i nie dostał tamtej poprawki).
  const email = await waitForEmail({
    recipient: RECIPIENT_EMAIL,
    after: sentAfter,
    subject: /Udostępniono urządzenie/,
  });
  const links = extractHttpLinks(email).filter((u) => u.includes("/host2"));
  if (!links.length) throw new Error("[record] e-mail udostępnienia nie zawierał linku do /host2");
  const shareLink = links[0];
  console.log("[record] link z maila:", shareLink);

  await control.locator("#btnShareDeviceClose").click();
  await control.waitForTimeout(500);

  // ===== "Odbiorca" klika link z maila — nowe, osobne okno (nie ten sam
  // kontekst co reszta urządzeń), wyśrodkowane NAD siatką 2x2, żeby było
  // widać, że to NOWA, oddzielna przeglądarka, nie odświeżenie istniejącego
  // Hosta. =====
  const recipientContext = await browser.newContext({ baseURL: BASE_URL, viewport: null });
  const recipientPage = await recipientContext.newPage();
  await positionWindow(recipientContext, recipientPage, RECIPIENT_QUAD);
  await recipientPage.goto(shareLink, { waitUntil: "domcontentloaded" });

  // Dowód, że link faktycznie działa: strona /host2 z kluczem z maila
  // ładuje się normalnie (ten sam widok co Host w głównej siatce), bez
  // żadnego logowania -- share_key_host w URL-u wystarcza, dokładnie jak
  // dla kodu/QR. host2.html NIE MA elementu "#app" (selektor skopiowany
  // przez pomyłkę z control2.html's konwencji) -- jego prawdziwy, statyczny
  // root to #paper (main.paperSplit), dokładnie ta sama, już raz znaleziona
  // i naprawiona pomyłka co w control2.spec.js's @mailbox teście.
  await recipientPage.waitForSelector("#paper", { state: "attached", timeout: 15_000 });
  await recipientPage.waitForTimeout(2500); // widz ma zdążyć zobaczyć, że to realnie działający Host

  await recipientContext.close();
  await control.waitForTimeout(500);

  // ZNALEZIONA REALNA PRZYCZYNA (control2.spec.js's @mailbox test, run #333):
  // bez tego to udostępnienie zostawało w bazie (TTL 4h) i zanieczyszczało
  // KAŻDY inny test/scenariusz, który loguje się jako ten sam, hardcodowany
  // operator (test1) i pokazuje "Aktualnie udostępnione dla: ..." dla
  // urządzenia "host" -- list_my_device_shares() zwraca WSZYSTKIE
  // udostępnienia tego device_type niezależnie od gry/testu, a UI bierze
  // pierwsze dopasowanie, więc stare "test2" z tego scenariusza przesłaniało
  // świeże udostępnienie innego testu. Sprzątamy po sobie, zamiast liczyć na
  // TTL albo na cleanup innego testu.
  await control.evaluate(async (rid) => {
    await window.__sbClient.rpc("unshare_device", { p_recipient_user_id: rid, p_device_type: "host" });
  }, recipientUid);
}

async function scenarioLogoLock(pages, { setupPage, logoId, logoLockTabId }) {
  const { control, buzzer } = pages;

  // Okno Control zostało otwarte (przez openTiledDevices, PRZED startem
  // nagrania) z logiem już zablokowanym — overlay jest więc widoczny od
  // pierwszej klatki tego pliku wideo.
  await control.waitForSelector("#resourceLockGuard", { state: "visible", timeout: 15000 });
  await control.waitForTimeout(3500); // widz ma zdążyć przeczytać komunikat blokady

  console.log("[record] zwalniam zewnętrzną blokadę logo");
  await releaseLogoLockExternally(setupPage, logoId, logoLockTabId);

  // Odzyskanie samo w sobie jest tym, co ten scenariusz ma pokazać —
  // #resourceLockGuard znika i control2 wznawia się (reload + realne
  // wyrenderowanie kroku "Urządzenia") bez żadnej ręcznej interwencji.
  await control.waitForSelector("#resourceLockGuard", { state: "hidden", timeout: 20000 });
  await expect(control.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
  await control.waitForTimeout(1000);

  // Krótka runda — dowód, że po odzyskaniu Control działa normalnie, nie
  // tylko "odblokował się i stoi".
  await clickPaced(control.getByRole("button", { name: "Dalej" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }), ADMIN_PACE_MS);
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top)
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5
  await armAndConfirmPaced(answerTile(control, 6)); // odp. #6
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
    makeGame: (setupPage) => restoreDemoGame(setupPage, { pickOrds: [1, 2] }),
    run: scenarioRoundsMechanics,
  },
  {
    // Ta sama progresja rund co scenariusz 3, ale hasFinal=true -> R9 kończy
    // się wejściem w finał zamiast w ekran końca gry.
    file: "02-rundy-progresja-final.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, {
      pickOrds: PROGRESSION_ROUND_ORDS,
      settings: { game: { hasFinal: true } },
      // Treść finału nieużywana (scenariusz zatrzymuje się na f_p1_entry) —
      // wymagana tylko, żeby canEnterFinal() przepuściło. Mimo to realne
      // pytania demo (inny ord niż PROGRESSION_ROUND_ORDS), nie sztuczne.
      finalPickOrds: [6, 7, 8, 9, 10],
    }),
    run: (pages) => scenarioRoundsThreshold(pages, { expectFinal: true }),
  },
  {
    file: "03-rundy-progresja-bez-finalu.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, { pickOrds: PROGRESSION_ROUND_ORDS }),
    // showReload: TYLKO tu (nie w scenariuszu 02) -- sam dowód wznowienia
    // stanu jest niezależny od hasFinal, pokazanie go raz wystarcza, bez
    // dublowania czasu nagrania w dwóch prawie identycznych scenariuszach.
    run: (pages) => scenarioRoundsThreshold(pages, { expectFinal: false, showReload: true }),
  },
  {
    file: "04-final-pelny.mp4",
    // finalMinPoints:280 -- patrz komentarz przy playThreeNaturalRoundsToThreshold
    // (Runda 3): domyślny próg 300 jest z TĄ rundą matematycznie
    // nieosiągalny. Rundy 1-2 (pełne odsłonięcie) dają RAZEM dokładnie 200,
    // a Runda 3 kończy "Zakończ rundę" z odsłoniętymi tylko 3/6 odpowiedzi
    // (ord1+2+3 -- w demo ord6/7/8 sumuje się to na 41+26+17=84 pkt), reszta
    // (ord4-6, 16 pkt) dochodzi dopiero w R8 "dosłanianie", które z
    // definicji NIE dolicza się do banku/totals (control2/js/engine.js's
    // REVEAL_LEFT, czysto pokazowe -- patrz plan i komentarz tam). Suma
    // realnie WCHODZĄCA do totals w momencie "Zakończ rundę" to więc zawsze
    // 200+84=284, NIGDY 300 -- próg 300 przy tym wzorcu (częściowe
    // odsłonięcie + dosłanianie) jest structuralnie nieosiągalny, niezależnie
    // od tego, które 3 pytania demo się wybierze. 280 (>200, żeby Rundy 1-2
    // same z siebie NIE kończyły gry przedwcześnie; ≤284, żeby Runda 3
    // faktycznie trafiła próg w momencie "Zakończ rundę", zanim jeszcze
    // dosłanianie się zacznie) -- naprawdę zweryfikowane przez diagnostykę
    // bazy danych z failed przebiegu (dbDump: totals faktycznie ==284 w tym
    // momencie), nie zgadywane.
    makeGame: (setupPage) => restoreDemoGame(setupPage, {
      pickOrds: FINAL_SETUP_ROUND_ORDS,
      // Prawdziwe pytania demo (nie sztuczne "Pytanie finałowe N") — inny
      // ord niż FINAL_SETUP_ROUND_ORDS. scenarioFinalFull dopasowuje przy
      // każdym MATCH INNE miejsce w rankingu odpowiedzi (patrz
      // P1_MATCH_RANK/P2_MATCH_RANK i answerByRank() tam), a finalTarget
      // obniżony do 100 (domyślne 200) tak, żeby suma realnych trafień
      // (28+18+24+35=105) przekroczyła go dopiero na ostatnim trafieniu
      // gracza 2 — zgłoszone wprost: drużyna ma FAKTYCZNIE WYGRAĆ finał w
      // tym scenariuszu, nie tylko bezpiecznie zostać pod progiem.
      finalPickOrds: [9, 10, 11, 12, 13],
      settings: { game: { advanced: { finalMinPoints: 280, finalTarget: 100 } } },
    }),
    run: scenarioFinalFull,
  },
  {
    // Ten sam finalPickOrds co scenariusz 4 -- tu liczy się tylko PIERWSZE
    // pytanie (ord9, "Podaj miejsce, gdzie nie wypada mówić głośno"),
    // reszta nigdy nie zostaje odsłonięta. scenarioFinalEarlyExit
    // dopasowuje NAJWYŻEJ punktowaną odpowiedź tego pytania (36,
    // "biblioteka") -- finalTarget obniżony do 30 (patrz advanced niżej),
    // żeby ta pojedyncza, prawdziwa odpowiedź sama przekroczyła próg,
    // dokładnie jak wcześniej robiła to sztuczna odpowiedź za 250 pkt przy
    // domyślnym progu 200. finalMinPoints:280 -- identyczny powód i
    // wyliczenie co w scenariuszu 4 wyżej (ten sam FINAL_SETUP_ROUND_ORDS,
    // ta sama współdzielona playThreeNaturalRoundsToThreshold, ta sama
    // matematyka 200+84=284).
    file: "05-final-wczesne-zakonczenie.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, {
      pickOrds: FINAL_SETUP_ROUND_ORDS,
      finalPickOrds: [9, 10, 11, 12, 13],
      settings: { game: { advanced: { finalMinPoints: 280, finalTarget: 30 } } },
    }),
    run: scenarioFinalEarlyExit,
  },
  {
    file: "06-zerwanie-i-ponowne-podlaczenie.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, { pickOrds: RECONNECT_ROUND_ORDS }),
    run: scenarioDeviceReconnect,
  },
  {
    // Krótki scenariusz, celowo BEZ rozgrywki — sedno to sam krok Urządzeń
    // (openTiledDevices zatrzymuje się tam, zanim scenariusz kliknie
    // cokolwiek), więc pickOrds nieistotne (żadna runda się tu nie toczy).
    file: "08-udostepnianie-urzadzenia-mailem.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, {}),
    run: scenarioShareDeviceEmail,
  },
  {
    file: "09-fizyczny-przycisk-bez-prowadzacego.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, { pickOrds: [12] }),
    run: scenarioPhysicalBuzzerNoHost,
  },
  {
    file: "10-mnoznik-rundy.mp4",
    // ZNALEZIONA REALNA PRZYCZYNA ("Alfa: 500" nigdy nie widoczne, run #37
    // i #335): tylko 4 pytania w puli = runda 4 jest OSTATNIĄ rundą (pula
    // wyczerpana) -- po "Zakończ rundę" engine.js's R9③ skacze PROSTO do
    // r_gameEnd, pomijając ekran startu rundy 5 (r_roundStart), na którym
    // normalnie pokazuje się literalny tekst "Alfa: <suma>" (control2/js/
    // ui.js's scoreLine, dokładnie ten sam mechanizm co już działający
    // check "Alfa: 300" po rundzie 3->4 wyżej w scenarioRoundMultiplier).
    // Ekran "Koniec gry" (przed kliknięciem "Zakończ grę") NIE pokazuje
    // wyniku w ogóle, a po kliknięciu pokazuje go w innym formacie
    // ("X wygrywa z wynikiem..."), nie "Alfa: 500" -- to był błąd w
    // SCENARIUSZU (złożenie puli), nie w produkcie. 5. pytanie (ord 1,
    // reużyty z puli scenariusza 1 -- bezpieczne, każdy scenariusz gra na
    // WŁASNEJ, niezależnej kopii gry demo) daje rundzie 4 następczynię,
    // więc "Alfa: 500" faktycznie się pojawia na ekranie startu rundy 5.
    makeGame: (setupPage) => restoreDemoGame(setupPage, {
      pickOrds: [13, 14, 15, 16, 1],
      settings: { game: { advanced: { finalMinPoints: 999 } } },
    }),
    run: scenarioRoundMultiplier,
  },
];

// Scenariusz 7 (blokada logo) potrzebuje dzielić logoId/tabId między
// makeGame() (zajmuje blokadę, ZANIM okno Control w ogóle się otworzy) a
// run() (zwalnia ją i dowodzi odzyskania) — stąd fabryka z małym, prywatnym
// stanem zamiast dwóch niezależnych top-level funkcji jak reszta scenariuszy.
function makeLogoLockScenario() {
  const shared = {};
  return {
    file: "07-blokada-logo.mp4",
    makeGame: async (setupPage) => {
      shared.setupPage = setupPage;
      shared.logoId = await insertLogo(setupPage, `E2E-REC-LOGOLOCK-${Date.now()}`);
      shared.logoLockTabId = `rec-fake-logo-editor-${Date.now()}`;
      await acquireLogoLockExternally(setupPage, shared.logoId, shared.logoLockTabId);
      return restoreDemoGame(setupPage, {
        pickOrds: [LOGO_LOCK_ROUND_ORD],
        settings: { display: { logoId: shared.logoId } },
      });
    },
    run: (pages) => scenarioLogoLock(pages, shared),
    // Wołane z main() PO deleteGame(), niezależnie od tego, czy run() zdążyło
    // samo zwolnić blokadę (np. scenariusz rzucił błąd w połowie) — logo
    // testowe nie może zostać w bazie z osieroconą blokadą.
    cleanup: async () => {
      if (!shared.logoId) return;
      await releaseLogoLockExternally(shared.setupPage, shared.logoId, shared.logoLockTabId);
      await shared.setupPage.evaluate(async (id) => {
        await window.__sbClient.from("user_logos").delete().eq("id", id);
      }, shared.logoId).catch(() => {});
    },
  };
}
SCENARIOS.push(makeLogoLockScenario());

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
    // Znalezione po przebiegu #16: ten dump patrzył WYŁĄCZNIE na
    // .c2-tilegrid, a przycisk, na którym padał timeout ("Przejdź do
    // zakończenia gry"), mieszka w .c2-statusbar -- więc dotąd byliśmy
    // ślepi na jego realny stan (disabled?/w ogóle wyrenderowany?) przy
    // każdym failu. Zamiast zgadywać kolejny kontener (.c2-statusbar,
    // .stepFoot, .c2-gameplay-nav...), zrzucamy WSZYSTKIE <button> na
    // stronie -- ich jest niewiele, a to jedyny sposób, żeby następny fail
    // dał realny dowód zamiast kolejnej niekompletnej diagnostyki.
    const allButtons = [...document.querySelectorAll("button")].map((el) => ({
      text: el.textContent.trim(),
      disabled: el.disabled,
      visible: el.offsetParent !== null,
      classes: el.className,
    }));
    return { stepper, tileCount: tiles.length, tiles, allButtons };
  }).catch((e) => ({ evalError: e.message }));
  // Zgłoszone/znalezione po przebiegu #19: przycisk R8 pokazał "Przejdź do
  // zakończenia gry" zamiast "Przejdź do finału" mimo hasFinal=true i progu
  // trafionego -- statyczna analiza control2/js/engine.js's canEnterFinal()
  // (final.confirmed/final.picked.length===5) niczego nie wykazała, a
  // dokładnie ten sam warunek ma już zielony test jednostkowy
  // (tests/unit/settings.branching.test.js) z ręcznie ustawionym stanem.
  // Żeby nie zgadywać dalej -- zrzut PRAWDZIWEGO stanu z bazy (Control jest
  // "authenticated", ten sam __sbClient co restoreDemoGame() używa, czyta
  // games.settings BEZPOŚREDNIO -- bez przechodzenia przez UI) obok tego,
  // co faktycznie wylądowało w game_state.detail po hydrate()/commit().
  const dbDump = await controlPage.evaluate(async () => {
    try {
      const sb = window.__sbClient;
      const gameId = new URLSearchParams(location.search).get("id");
      if (!sb || !gameId) return { dbError: "brak __sbClient lub ?id=" };
      const [{ data: g, error: gErr }, { data: gs, error: gsErr }] = await Promise.all([
        sb.from("games").select("settings").eq("id", gameId).single(),
        sb.from("game_state").select("detail, step, top_card").eq("game_id", gameId).single(),
      ]);
      return {
        gamesSettingsGame: g?.settings?.game ?? null,
        gamesSettingsQuestionsFinalLen: Array.isArray(g?.settings?.questions?.final) ? g.settings.questions.final.length : null,
        gamesError: gErr?.message ?? null,
        gameStateStep: gs?.step ?? null,
        gameStateFinal: gs?.detail?.final ? { confirmed: gs.detail.final.confirmed, pickedLen: gs.detail.final.picked?.length } : null,
        gameStateSettings: gs?.detail?.settings ? { hasFinal: gs.detail.settings.hasFinal, finalQuestionsMode: gs.detail.settings.finalQuestionsMode, finalMinPoints: gs.detail.settings.finalMinPoints } : null,
        gameStateError: gsErr?.message ?? null,
      };
    } catch (e) { return { dbError: e.message }; }
  }).catch((e) => ({ dbEvalError: e.message }));
  dump.dbDump = dbDump;
  fs.writeFileSync(`${base}.json`, JSON.stringify(dump, null, 2));
  console.log(`[record] diagnostyka ${scenarioFile}:`, JSON.stringify(dump));
}

// SCENARIO_FILTER (opcjonalna zmienna środowiskowa) -- czysto dla szybkiej
// iteracji przy naprawianiu jednego scenariusza: zamiast czekać ~35 min na
// cały przebieg, uruchamia tylko scenariusze, których `file` zawiera dany
// podciąg (porównanie bez rozszerzenia .mp4, case-insensitive; można podać
// kilka, rozdzielonych przecinkiem -- dopasowany, jeśli zawiera
// KTÓRYKOLWIEK z nich). Puste/nieustawione = wszystkie scenariusze (pełny
// przebieg, tak jak dotąd) -- to jest jedyny tryb używany do kontrolnego,
// końcowego potwierdzenia, że całość przechodzi na zielono.
function filterScenarios(all) {
  const raw = String(process.env.SCENARIO_FILTER || "").trim();
  if (!raw) return all;
  const needles = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const filtered = all.filter((s) => needles.some((n) => s.file.toLowerCase().includes(n)));
  if (!filtered.length) {
    throw new Error(`SCENARIO_FILTER="${raw}" nie dopasował żadnego scenariusza. Dostępne: ${all.map((s) => s.file).join(", ")}`);
  }
  console.log(`[record] SCENARIO_FILTER="${raw}" -> ${filtered.map((s) => s.file).join(", ")}`);
  return filtered;
}

async function main() {
  for (const env of ["E2E_BYPASS_SECRET", "TEST_PASSWORD"]) {
    if (!process.env[env]) throw new Error(`Brak ${env} w zmiennych środowiskowych`);
  }

  const scenariosToRun = filterScenarios(SCENARIOS);

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      `--window-size=${QUAD_W},${QUAD_H}`,
    ],
  });

  try {
    // Zgłoszone: kolejka maili (scenariusz 8, udostępnianie urządzenia)
    // bywa pusta nawet po 90s timeoutu waitForEmail() -- nie to samo co
    // zbyt ciasny margines (ten osobno naprawiony, patrz commit o 60s/90s).
    // Realna przyczyna: email_providers.rem_worker (budżet dla maili
    // wysyłanych przez mail-worker co 60s, w odróżnieniu od rem_immediate
    // dla maili auth -- reset/zmiana hasła -- wysyłanych wprost z
    // send-email) wyczerpuje się w ciągu dnia po wielu testowych
    // przebiegach na tym samym koncie i NIE odnawia się sam poza
    // zaplanowanym resetem o północy (pg_cron, reset_email_limits()).
    // Wołane tu wprost, bezpiecznie (tylko odnawia licznik do 80%/20%
    // daily_limit, nic nie wysyła) -- "ręczny reset cooldownu", o którym
    // była mowa, zautomatyzowany, żeby nie trzeba było robić go z
    // zewnątrz przy każdym przebiegu. RPC nie ma żadnego GRANT/REVOKE w
    // migracji (2026-04-23_email_providers_limits.sql), więc jest wołalna
    // z tego samego, zwykłego klienta co restoreDemoGame().
    {
      const resetCtx = await browser.newContext({ baseURL: BASE_URL });
      const resetPage = await resetCtx.newPage();
      await loginAsTestUser(resetPage, resetCtx);
      const resetResult = await resetPage.evaluate(async () => {
        const { error } = await window.__sbClient.rpc("reset_email_limits");
        return { error: error?.message || null };
      });
      console.log("[record] reset_email_limits:", resetResult.error ? `FAILED (${resetResult.error})` : "OK");
      await resetCtx.close().catch(() => {});
    }

    for (const scenario of scenariosToRun) {
      console.log(`\n=== Scenariusz: ${scenario.file} ===`);
      const setupCtx = await browser.newContext({ baseURL: BASE_URL });
      const setupPage = await setupCtx.newPage();
      await loginAsTestUser(setupPage, setupCtx);
      const game = await scenario.makeGame(setupPage);

      const { contexts, pages } = await openTiledDevices(browser, game);
      const rec = startRecording(path.join(OUT_DIR, scenario.file));
      try {
        // { contexts, browser, game } — contexts/browser: tylko scenariusz 6
        // (scenarioDeviceReconnect) z tego korzysta (zamyka/otwiera konteksty
        // urządzeń w locie); game: scenariusze finałowe (4/5) czytają stąd
        // game.finalQuestions (prawdziwa treść z restoreDemoGame). Reszta
        // scenariuszy deklaruje run(pages) i ten drugi argument po prostu
        // ignoruje.
        await scenario.run(pages, { contexts, browser, game });
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
      if (scenario.cleanup) await scenario.cleanup();
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
