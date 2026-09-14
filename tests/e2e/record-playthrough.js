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

const { chromium, expect } = require("@playwright/test");
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
async function restoreDemoGame(setupPage, { pickOrds = [], settings = {}, finalAnswerPts = null } = {}) {
  return setupPage.evaluate(async ({ pickOrds, settings, finalAnswerPts }) => {
    const clip17 = (s) => String(s ?? "").trim().slice(0, 17);
    const clip200 = (s) => String(s ?? "").trim().slice(0, 200);
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
      .from("questions").select("id, ord").eq("game_id", g.id).order("ord");
    if (qErr) throw new Error("select demo questions failed: " + qErr.message);
    const { data: answers, error: aErr } = await sb
      .from("answers").select("id, question_id, ord")
      .in("question_id", questions.map((q) => q.id));
    if (aErr) throw new Error("select demo answers failed: " + aErr.message);
    const byQ = new Map(questions.map((q) => [q.id, { ...q, answers: [] }]));
    for (const a of answers) byQ.get(a.question_id)?.answers.push(a);

    // Scenariusze zakładają DOKŁADNIE 5 odpowiedzi na pytanie rundy (jak
    // dawna syntetyczna fixtura, "pytanie nie może mieć 3 odpowiedzi" —
    // 5 to minimum realistycznej rundy) — realne demo ma ich 6; usuwamy
    // najsłabszą (ord=6, najniższe punkty), żeby istniejąca logika klikania
    // (tile 1..5, "wszystko odsłonięte" po piątej) działała bez zmian.
    const picked = pickOrds.map((ord) => byQ.get(questions.find((q) => q.ord === ord)?.id));
    for (const q of picked) {
      if (!q) throw new Error("nie znaleziono pytania demo o żądanym ord");
      const weakest = q.answers.find((a) => a.ord === 6);
      if (weakest) await sb.from("answers").delete().eq("id", weakest.id);
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
    }

    const { error: upErr } = await sb.from("games").update({
      status: "ready",
      settings: {
        teams: { teamA: "Alfa", teamB: "Beta" },
        display: settings.display || {},
        game: {
          hasFinal: !!finalAnswerPts,
          roundsQuestionsMode: "pick",
          ...(finalAnswerPts ? { finalQuestionsMode: "pick" } : {}),
          ...(settings.game || {}),
        },
        questions: { rounds: picked.map((q) => ({ id: q.id })), final: finalPicked },
      },
    }).eq("id", g.id);
    if (upErr) throw new Error("update demo settings failed: " + upErr.message);

    return g;
  }, { pickOrds, settings, finalAnswerPts });
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
// demo_in_db.sql, lang="pl", slot="prepared" — 6 odpowiedzi każde, sumujące
// się do 100 pkt) idzie do której rundy każdego scenariusza — restoreDemoGame()
// wyżej usuwa dla KAŻDEGO z nich najsłabszą, 6. odpowiedź (więc realny bank
// pełnej rundy to 100 minus ta jedna wartość, nie równe 100 — stąd konkretne
// liczby w komentarzach niżej, PRZELICZONE z rzeczywistej treści migracji,
// nie zgadywane). Scenariusze BEZ progu (1/6/7) nie są wrażliwe na dokładne
// punkty — dowolne różne pytania wystarczą, byle #1 (ord odpowiedzi) było
// zawsze topowe (co w realnym demo jest zawsze prawdą — odpowiedzi są tam
// posortowane malejąco po fixed_points).
//
//   ord=1 (Podaj coś, co ludzie robią zaraz po przebudzeniu): 38,24,18,11,6 (bez 3) = 97
//   ord=2 (Podaj coś, co zabiera się na wakacje):              34,26,18,12,6 (bez 4) = 96
//   ord=3 (Podaj powód spóźnienia do pracy lub szkoły):        42,23,15,9,7  (bez 4) = 96
//   ord=4 (Podaj coś, co kupisz na stacji benzynowej):         40,22,17,11,6 (bez 4) = 96
//   ord=5 (Podaj zwierzę, którego ludzie się boją):            44,26,13,7,6  (bez 4) = 96
//   ord=6 (Wymień coś, co robi się codziennie w kuchni):       33,27,18,11,7 (bez 4) = 96
//   ord=9 (Podaj miejsce, gdzie nie wypada mówić głośno):      36,28,17,8,7  (bez 4) = 96
//   ord=10 (Podaj coś, co często się gubi):                    43,24,14,10,6 (bez 3) = 97
//   ord=11 (Wymień domowy obowiązek...):                       37,23,16,13,7 (bez 4) = 96

// Scenariusz "progresja + próg" (2/3): R1=96 (ord3), R2=96 (ord4), R3=96
// (ord5) — mnożnik rund 1-3 domyślnie ×1 (shared/gameStateShape.js's
// DEFAULT_SETTINGS.roundMultipliers=[1,1,1,2,3]) — kumulatywnie 96/192/288.
// finalMinPoints=250 (poniżej domyślnego 300, żeby scenariusz nie musiał
// grać 4-5 rund) trafiony dopiero PO R3 (192<250<=288), nigdy wcześniej.
const PROGRESSION_ROUND_ORDS = [3, 4, 5];
const PROGRESSION_FINAL_MIN_POINTS = 250;

// Scenariusze "final" (4/5): JEDNA runda musi sama przekroczyć próg —
// ord=6 daje bank=96, więc finalMinPoints=90 (poniżej tego) trafiony od
// razu po pierwszej rundzie, jak w oryginalnym (syntetycznym) FINAL_SETUP_ROUND.
const FINAL_SETUP_ROUND_ORD = 6;
const FINAL_SETUP_MIN_POINTS = 90;

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
  const { control, buzzer, display } = pages;

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

  await clickPaced(control.getByRole("button", { name: "Dalej" }));

  // Zgłoszone: "dodaj zmianę ustawień do... nagrywania" — pokaż na nagraniu,
  // że modal ustawień gry (naprawiony w tej sesji: podgląd Wyświetlacza był
  // martwy w trybie modalu) faktycznie działa. Zmiana nazwy drużyny w
  // formularzu, zapis, zamknięcie kliknięciem poza treścią modala (tak
  // zamyka się go naprawdę — control2/js/app.js's gsOverlayEl click handler).
  await clickPaced(control.getByRole("button", { name: "Zmień ustawienia" }));
  await control.waitForTimeout(1000); // niech nagranie złapie otwarcie modala
  const gsFrame = control.frameLocator("#gsFrame");
  const gsTeamAInput = gsFrame.locator("#gsTeamA");
  await gsTeamAInput.fill("Mistrzowie Quizu");
  await control.waitForTimeout(1200); // niech nagranie złapie podgląd Wyświetlacza aktualizujący się na żywo

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
  await control.waitForTimeout(400); // niech nagranie złapie drawer się otwierający
  await gsFrame.locator('.gs-sidebar-item[data-cat="sound"]').click();
  await control.waitForTimeout(600);
  const transitionSlider = gsFrame.locator('input.sfx-vol[data-sfx-vol="round_transition"]');
  await transitionSlider.waitFor({ state: "visible", timeout: 10_000 });
  // .fill() na range input nie zawsze niezawodnie odpala "input" (na czym
  // wisi handler zapisujący głośność) — ustawiamy value i wysyłamy zdarzenie
  // wprost.
  await transitionSlider.evaluate((el) => { el.value = "70"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await control.waitForTimeout(1000); // niech nagranie złapie suwak i zaktualizowaną etykietę %

  await clickPaced(control.getByRole("button", { name: "Zapisz wszystko" }));
  await control.locator("#gsOverlay").click({ position: { x: 5, y: 5 } });
  await control.locator("#gsOverlay").waitFor({ state: "hidden", timeout: 10_000 });
  await control.waitForTimeout(800);

  // Drugi, NIEZALEŻNY mechanizm — suwak BEZPOŚREDNIO w sekcji "Dźwięk"
  // Podsumowania (control2/js/ui.js's soundSummarySection), bez modala —
  // zmiana tu leci na żywo do game_state, widoczna od razu na Wyświetlaczu
  // (bo soundSource="display"), bez zapisu do games.settings w ogóle.
  const revealSlider = control.locator('input.summarySoundVol[data-sfx-vol="reveal"]');
  await revealSlider.scrollIntoViewIfNeeded();
  await revealSlider.waitFor({ state: "visible", timeout: 10_000 });
  // .fill() na range input nie zawsze niezawodnie odpala "input"/"change"
  // (na czym wiszą handlery podglądu lokalnego i commitu do game_state) —
  // ustawiamy value i wysyłamy oba zdarzenia wprost.
  await revealSlider.evaluate((el) => {
    el.value = "40";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await control.waitForTimeout(1000); // niech nagranie złapie suwak i zaktualizowaną etykietę %

  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }));

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

  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // A pudłuje -> kolej B
  // B pudłuje też -> RESET CYKLU: kolej wraca do A, BEZ nowego zgłoszenia
  // buzzera (firstTeam/secondTeam nie są czyszczone — nie ma ponownego buzera).
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true }));
  await armAndConfirmPaced(answerTile(control, 1)); // A trafia -> wygrywa pojedynek, bez nowego zgłoszenia

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
  // Dosłanianie reszty — 5 odpowiedzi, ord 1-2 już odsłonięte (pojedynek+kradzież),
  // zostają 3-4-5.
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));
  // Po odsłonięciu WSZYSTKIEGO w R8 przycisk "Zakończ rundę" już nie
  // wystarcza — dochodzi kontekstowo podpisany krok pośredni
  // (NEXT_AFTER_REVEAL, engine.js's r.roundEndDestination), zanim w ogóle
  // pojawi się ekran startowy kolejnej rundy z "Rozpocznij rundę".
  await clickPaced(control.getByRole("button", { name: "Przejdź do następnej rundy" }));

  // ===== RUNDA 2 =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Przycisk B" }));
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
  // Tu docelowo jest koniec gry (bez finału), nie kolejna runda — ten sam
  // krok pośredni, ale kontekstowo inny label (r.roundEndDestination==="GAME_END").
  await clickPaced(control.getByRole("button", { name: "Przejdź do zakończenia gry" }));

  // ===== Koniec gry bez finału =====
  await clickPaced(control.getByRole("button", { name: "Zakończ grę" }));
  await control.waitForTimeout(4000); // zostaw ekran końcowy widoczny chwilę na nagraniu
}

// ===== Scenariusz 2/3: progresja przez KILKA rund aż do naturalnego
// osiągnięcia progu (finalMinPoints, obniżony do PROGRESSION_FINAL_MIN_POINTS
// — patrz PROGRESSION_ROUND_ORDS) — nie jeden sztuczny strzał na dużą liczbę punktów.
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
  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // A trafia topową odpowiedź od razu -> wygrywa pojedynek (Pies, 40)
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5 -> wszystko odsłonięte -> koniec rundy pomija ekran dosłaniania
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy

  // ===== RUNDA 2: B pudłuje -> BEZ resetu, druga próba (A) wygrywa
  // odpowiedzią nie-topową, potem reszta (w tym top) odsłonięta w PLAY =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Przycisk B" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(control.getByRole("button", { name: "X", exact: true })); // B pudłuje -> kolej na drugą próbę (A), NIE reset
  await armAndConfirmPaced(answerTile(control, 2)); // A trafia odpowiedź NIE-topową -> WYGRYWA, bo B miał 0 pkt
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top, dosłaniane normalnie)
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5 -> wszystko odsłonięte
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000); // widz ma zdążyć zobaczyć zaktualizowany wynik przed startem kolejnej rundy

  // ===== RUNDA 3: pojedynek wygrany za pierwszym razem, reszta w PLAY,
  // dobicie do progu (180) =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top)
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5 -> wszystko odsłonięte
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

  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top) -> wygrywa pojedynek
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5 -> wszystko odsłonięte, bank pełny -> próg osiągnięty
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

  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top) -> wygrywa pojedynek
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5 -> wszystko odsłonięte, bank pełny -> próg osiągnięty, wchodzimy w finał
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

  await clickPaced(pages.buzzer.getByRole("button", { name: "Przycisk A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
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
  await clickPaced(control.getByRole("button", { name: "Zakończ rundę" }));
  await control.waitForTimeout(2000);

  // ===== Runda 2, w CAŁOŚCI na ponownie podłączonym Buzzerze — nie tylko
  // presence, prawdziwy udział w grze. =====
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(pages.buzzer.getByRole("button", { name: "Przycisk B" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Beta" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top)
  await armAndConfirmPaced(answerTile(control, 2));
  await armAndConfirmPaced(answerTile(control, 3));
  await armAndConfirmPaced(answerTile(control, 4));
  await armAndConfirmPaced(answerTile(control, 5));
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
  await clickPaced(control.getByRole("button", { name: "Dalej" }));
  await clickPaced(control.getByRole("button", { name: "Gotowe — przejdź do rund" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij grę" }));
  await clickPaced(control.getByRole("button", { name: "Rozpocznij rundę" }));
  await clickPaced(buzzer.getByRole("button", { name: "Przycisk A" }));
  await clickPaced(control.getByRole("button", { name: "Zatwierdź: Alfa" }));
  await armAndConfirmPaced(answerTile(control, 1)); // odp. #1 (top)
  await armAndConfirmPaced(answerTile(control, 2)); // odp. #2
  await armAndConfirmPaced(answerTile(control, 3)); // odp. #3
  await armAndConfirmPaced(answerTile(control, 4)); // odp. #4
  await armAndConfirmPaced(answerTile(control, 5)); // odp. #5
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
      settings: { game: { hasFinal: true, advanced: { finalMinPoints: PROGRESSION_FINAL_MIN_POINTS } } },
      finalAnswerPts: 15, // treść finału nieużywana (scenariusz zatrzymuje się na f_p1_entry) — wymagana tylko, żeby canEnterFinal() przepuściło
    }),
    run: (pages) => scenarioRoundsThreshold(pages, { expectFinal: true }),
  },
  {
    file: "03-rundy-progresja-bez-finalu.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, {
      pickOrds: PROGRESSION_ROUND_ORDS,
      settings: { game: { advanced: { finalMinPoints: PROGRESSION_FINAL_MIN_POINTS } } },
    }),
    run: (pages) => scenarioRoundsThreshold(pages, { expectFinal: false }),
  },
  {
    file: "04-final-pelny.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, {
      pickOrds: [FINAL_SETUP_ROUND_ORD],
      settings: { game: { advanced: { finalMinPoints: FINAL_SETUP_MIN_POINTS } } },
      finalAnswerPts: 15,
    }),
    run: scenarioFinalFull,
  },
  {
    // finalAnswerPts=250 > finalTarget domyślne (200) -> pierwsza trafiona
    // odpowiedź gracza 1 sama kończy finał wcześniej.
    file: "05-final-wczesne-zakonczenie.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, {
      pickOrds: [FINAL_SETUP_ROUND_ORD],
      settings: { game: { advanced: { finalMinPoints: FINAL_SETUP_MIN_POINTS } } },
      finalAnswerPts: 250,
    }),
    run: scenarioFinalEarlyExit,
  },
  {
    file: "06-zerwanie-i-ponowne-podlaczenie.mp4",
    makeGame: (setupPage) => restoreDemoGame(setupPage, { pickOrds: RECONNECT_ROUND_ORDS }),
    run: scenarioDeviceReconnect,
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
