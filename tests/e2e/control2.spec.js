// tests/e2e/control.spec.js
//
// Wszystkie testy E2E dla Control v2 w jednym pliku (na wyraźną prośbę —
// jeden plik zamiast kilku). Kolejne test() bloki, od najprostszego do
// najbardziej złożonego. Towarzyszy im pełny opis scenariuszy (co się klika,
// co ma pokazać każde urządzenie) w dokumencie "Rundown Control" — ten plik
// jest jego automatyczną, sprawdzalną częścią, nie zamiennikiem.
//
//   1. Parowanie urządzeń (D0/D1) — linki renderują się bez błędu, Control
//      widzi je jako online.
//   2. Pełna runda + wznowienie Control po przeładowaniu w środku rundy 2
//      (plan, sekcja 7 — to jest bezpośredni dowód na to, że hydrate()
//      faktycznie wznawia stan, zamiast go kasować jak dziś).
//   3. Mechanika rund poza ścieżką idealną: reset pojedynku obustronnym
//      pudłem, pass, kradzież wygrana/przegrana, odkrywanie reszty,
//      mnożnik, koniec gry bez finału + "Wróć do moich gier".
//   4. Finał: próg w rundzie -> finał, wczesne zakończenie po osiągnięciu
//      celu w połowie mapowania gracza 1 (pomija gracza 2 całkowicie).
//   5-7. Nietypowe zachowania operatora: physicalBuzzer + noHostTablet,
//      "Zacznij od nowa", druga karta Control blokowana (resource-lock).
//   8. QR host/buzzer niezależne na Display.
//   9. Finał BEZ wczesnego wyjścia — obaj gracze, wszystkie 10 pytań,
//       naturalne wygaśnięcie timera gracza 1, flaga "powtórzenie" u
//       gracza 2, i — najważniejsze — dowód, że odpowiedzi gracza 1
//       faktycznie wracają na Display I Host w momencie startu rundy 2
//       (dokładnie ta luka, która była naprawiana w tej sesji audytu).
//   10. Mnożnik rundy — runda 4. z ×2 faktycznie przemnaża bank.
//   11. Wyścig dwóch przycisków Buzzera naciśniętych w tej samej chwili —
//       tylko jeden zaakceptowany, oba urządzenia się zgadzają.
//   11b. Ponów naciśnięcie (RETRY_DUEL) — odrzuca błędne zgłoszenie,
//       Buzzer otwiera się na nowo.
//   12. Wyciszenie dźwięku — po kliknięciu Mute żaden klucz SFX się nie
//       odtwarza mimo normalnie grającej akcji.
//   12b. Dźwięk ze źródła Wyświetlacz — odblokowanie, głośność z ustawień,
//       chwilowe mute w rundzie.
//   13. Zmiana języka propaguje się do Hosta, w tym samą TREŚĆ tytułu fazy
//       (nie tylko chrome strony) — regresja na dzisiejszą naprawę i18n.
//   14. Modal ustawień gry (js/pages/game-settings.js) — zmiana nazwy
//       drużyny faktycznie odświeża zagnieżdżony podgląd Wyświetlacza
//       (/display?preview=1) — regresja na naprawę martwego podglądu w
//       trybie modalu.
//   15. Blokada logo — Control czeka, aż logo-editor.js zwolni logo
//       referencowane przez grę, wznawia się sam po zwolnieniu.
//   16. Udostępnianie urządzenia przez e-mail — realny mail + link, który
//       faktycznie łączy (@mailbox, osobny od zwykłego szybkiego cyklu).
//   17. Zerwanie i ponowne podłączenie — wszystkie trzy urządzenia tracą
//       połączenie naraz w środku rundy, operator odzyskuje je po kolei
//       przez modal kropki statusu, gra działa dalej na świeżych kartach.
//   18. Timery (3s decyzja w rundach / 15s-20s gracza w finale) wracają do
//       stanu SPRZED swojego startu, nie do stanu "po", gdy Control zastaje
//       je już wygasłe przy wznowieniu (zamknięcie/przeładowanie w trakcie
//       odliczania) — bez naliczenia X / bez trwałego zużycia jednorazowej
//       szansy gracza.
//
// Każdy test tworzy i kasuje własną grę testową — niezależne od siebie,
// można je uruchamiać pojedynczo (--grep) przy diagnozowaniu awarii.
//
// Obserwowalność dźwięku/Display: js/core/sfx.js's playSfx() zapisuje każde
// odtworzenie do window.__sfxLog, a display/js/main.js owija scene.api tak,
// że każde wywołanie (revealAnswerRow, setX, indicator.set, ...) ląduje w
// window.__displayLog — obie instrumentacje istnieją WYŁĄCZNIE do tych
// testów (patrz komentarze przy ich definicjach), zero wpływu na normalne
// działanie. Bez nich nie dałoby się z Playwrighta zweryfikować ani dźwięku
// (Web Audio nie zostawia śladu w DOM), ani tego, co dokładnie Display
// narysował (SVG dot-matrix, nie tekst).

const { test, expect } = require("./helpers/production-test");

test("control2: TV odrzuca inne urządzenia, kod display otwiera nowy Wyświetlacz", async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-TV-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const context = await browser.newContext({ locale: "pl-PL", userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) TV Safari/537.36" });
  try {
    const codes = await page.evaluate(async (game) => {
      const result = {};
      for (const type of ["display", "host", "buzzer"]) {
        const { data, error } = await window.__sbClient.rpc("generate_device_connect_code", { p_game_id: game.id, p_device_type: type, p_share_key: game[`share_key_${type}`], p_game_name: "E2E-TV" });
        if (error || !data?.ok) throw new Error(error?.message || JSON.stringify(data));
        result[type] = data.code;
      }
      return result;
    }, game);
    const tv = await context.newPage();
    await tv.goto("https://www.familiada.online/");
    for (const type of ["host", "buzzer"]) {
      await tv.locator("#tvCode").fill(codes[type]);
      await tv.locator("#tvConnect").click();
      await expect(tv.locator("#tvMessage")).toContainText("nie jest kodem wyświetlacza");
      expect(new URL(tv.url()).pathname).toBe("/connect-device/");
    }
    await tv.locator("#tvCode").fill(codes.display);
    await tv.locator("#tvCode").press("Enter");
    await expect.poll(() => new URL(tv.url()).pathname).toBe("/display/");
    expect(new URL(tv.url()).searchParams.get("id")).toBe(game.id);
    await expect(tv.locator("#fsBtn")).toBeVisible();
    // The new Display remains directly accessible; its sound prompt works with TV OK.
    await tv.goto(`https://www.familiada.online/display/?id=${game.id}&key=${game.share_key_display}`);
    // Przy domyślnym źródle Control ekran odblokowania dźwięku na Display
    // pozostaje ukryty; pojawia się dopiero po wybraniu Display jako źródła.
    await expect(tv.locator("#audioUnlockScreen")).toBeHidden({ timeout: 15000 });
    await page.goto(`/control?id=${game.id}`);
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.locator('.toggle-item:has(input[name="soundSource"][value="display"])').click();
    await expect(tv.locator("#audioUnlockScreen")).toBeVisible({ timeout: 15000 });
    await expect(tv.locator("#btnAudioUnlock")).toBeFocused();
    await tv.keyboard.press("Enter");
    await expect(tv.locator("#audioUnlockScreen")).toBeHidden();
    await expect.poll(() => tv.evaluate(() => !!document.fullscreenElement)).toBe(true);
  } finally { await context.close(); await deleteGame(page, game.id); }
});

test("control2: własne outro ponad 30 sekund — ustawienia, zapis i podsumowanie", async ({ page, browser }, testInfo) => {
  test.setTimeout(180000);
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-CUSTOM-OUTRO-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.getByLabel("Przycisk fizyczny").check();
    await page.getByLabel("Nie używaj tabletu prowadzącego").check();
    await page.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await expect(page.locator('.summarySoundRow:has(input[data-sfx-vol="show_outro"])')).toContainText("Muzyka outro programu");
    await expect(page.locator('.summarySoundRow:has(input[data-sfx-vol="reveal"])')).toContainText("Odsłanianie");
    await page.getByRole("button", { name: "Zmień ustawienia" }).click();
    const frame = page.frameLocator("#gsFrame");
    await expect(frame.locator("#gsTeamA")).toBeVisible({ timeout: 15000 });
    await frame.locator("#btnToggleSidebar").click();
    await frame.locator('.gs-sidebar-item[data-cat="sound"]').click();
    await expect(frame.locator('.sfx-row[data-key="reveal"]')).toContainText("Odsłanianie");
    const fileInput = frame.locator('input[data-sfx-key="show_outro"]');
    await expect(fileInput).toHaveAttribute("accept", "audio/mpeg,audio/wav,audio/ogg");
    // A real 31-second PCM WAV verifies the separate outro limit (>30s).
    const sampleRate = 8000;
    const samples = sampleRate * 31;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
    wav.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / sampleRate) * 500), 44 + i * 2);
    await fileInput.setInputFiles({ name: "outro-test-31s.wav", mimeType: "audio/wav", buffer: wav });
    await expect(frame.locator('.sfx-row:has(input[data-sfx-key="show_outro"]) .sfx-file-name')).toHaveText("outro-test-31s.wav", { timeout: 15000 });
    const save = frame.getByRole("button", { name: "Zapisz wszystko" });
    await save.click();
    await expect(save).toBeEnabled({ timeout: 30000 });
    await page.locator("#gsOverlay").click({ position: { x: 5, y: 5 } });
    await expect(page.locator("#gsOverlay")).toHaveClass(/hidden/, { timeout: 10000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 15000 });
    const inspectAudio = () => page.evaluate(async () => {
      const resource = performance.getEntriesByType("resource").find((entry) => new URL(entry.name).pathname.endsWith("/shared/js/core/sfx.js"));
      if (!resource) return null;
      const sfx = await import(resource.name);
      return { duration: await sfx.getSfxDuration("show_outro"), playing: sfx.isSfxPlaying("show_outro") };
    });
    await expect.poll(async () => (await inspectAudio())?.duration, { timeout: 20000 }).toBeCloseTo(31, 1);
    const row = page.locator('.summarySoundRow:has(input[data-sfx-vol="show_outro"])');
    await row.locator(".summarySoundPlay").click();
    await expect.poll(async () => (await inspectAudio())?.playing, { timeout: 10000 }).toBe(true);
    await row.locator(".summarySoundPlay").click();
    await expect.poll(async () => (await inspectAudio())?.playing).toBe(false);
  } finally {
    await page.evaluate(async (gameId) => {
      const sb = window.__sbClient;
      if (!sb) return;
      const { data } = await sb.auth.getUser();
      if (!data.user) return;
      const { error } = await sb.storage.from("user-sounds").remove([`${data.user.id}/${gameId}/show_outro`]);
      if (error) throw new Error(error.message);
    }, game.id).catch((error) => console.warn("Custom outro cleanup:", error.message));
    for (const context of contexts) await context.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});
const { loginAsPooledTestUser, loginAsTestUser, testAccountUsername, isKnownNoiseText, isKnownNoiseUrl } = require("./helpers/login");
const { clearMailbox, waitForEmail, extractHttpLinks, resetMailProviderLimits } = require("./helpers/mailbox");

test.setTimeout(150_000);

// ===== Pomocnicze =====

async function clearSfxLog(page) {
  await page.evaluate(() => { window.__sfxLog = []; });
}

async function getSfxKeys(page) {
  return page.evaluate(() => (window.__sfxLog || []).map((e) => e.key));
}

// Czeka, aż w __sfxLog pojawi się dana PODSEKWENCJA kluczy w tej kolejności
// (dopuszcza inne dźwięki między nimi) — używane zamiast sztywnego
// odliczania milisekund, bo dokładny odstęp między np. "final_theme" i
// "reveal" zależy od realnego czasu trwania pliku audio (getSfxDuration).
async function waitForSfxSequence(page, keys, timeout = 15000) {
  await expect.poll(async () => {
    const log = await getSfxKeys(page);
    let i = 0;
    for (const k of log) {
      if (k === keys[i]) i++;
      if (i === keys.length) return true;
    }
    return false;
  }, { timeout, message: `oczekiwano sekwencji dźwięków ${JSON.stringify(keys)}` }).toBe(true);
}

// Jak wyżej, ale bez wymogu kolejności — używane dla playSyncedCombo()
// (control/js/soundReactor.js), gdzie o tym, KTÓRY klucz gra pierwszy,
// decyduje realny czas trwania pliku audio (dłuższy zaczyna pierwszy),
// nie kolejność argumentów — asercja na sztywną kolejność byłaby fałszywie
// krucha względem samych plików dźwiękowych, nie logiki gry.
async function waitForSfxKeysAnyOrder(page, keys, timeout = 15000) {
  await expect.poll(async () => {
    const log = await getSfxKeys(page);
    return keys.every((k) => log.includes(k));
  }, { timeout, message: `oczekiwano kluczy dźwięku ${JSON.stringify(keys)} (w dowolnej kolejności)` }).toBe(true);
}

async function clearDisplayLog(displayPage) {
  await displayPage.evaluate(() => { window.__displayLog = []; });
}

// Kafelki odpowiedzi w Rundach (control/js/ui.js's renderRounds()) nie
// pokazują już "#N" — pokazują prawdziwy tekst odpowiedzi (i zmieniają się
// po odsłonięciu), więc nie da się ich stabilnie wybrać po treści. Kolejność
// w DOM jest za to stała: renderRounds() dopisuje kafelki odpowiedzi do
// tablicy `tiles` w kolejności `ord` PRZED kafelkami X/licznika/timera, więc
// n-ty (1-bazowy) przycisk w jedynym renderowanym `.c2-tilegrid` to zawsze
// odpowiedź o ord=n — dokładnie ten sam kafelek, który dawniej pokazywał
// tekst "#n".
function answerTile(page, n) {
  return page.locator(".c2-tilegrid button").nth(n - 1);
}

// Odpowiedź/X/"Oddaj kontrolę" idą przez zaznacz -> potwierdź
// (control/js/ui.js's armableTile): pierwsze kliknięcie tylko uzbraja
// (złota obwódka, zero zapisu — czysto lokalny "ui.rerender", bez sieci),
// drugie na TYM SAMYM elemencie faktycznie wysyła akcję (game.dispatch ->
// zapis do bazy). Locator jest "żywy" (przeliczany przy każdym użyciu),
// więc dwa kolejne .click() poprawnie trafiają w ten sam kafel mimo
// przebudowy DOM między nimi.
//
// Realny bug znaleziony na żywo (2026-09-11, "pełna runda"): Playwright's
// .click() wraca, gdy tylko zdarzenie DOM zostanie wysłane — NIE czeka na
// to, aż async handler w app.js skończy zapis do bazy i ui.js przebuduje
// DOM na podstawie potwierdzonego stanu. Pierwsza próba (czekanie aż
// klikany element zniknie z DOM) okazała się NIEWYSTARCZAJĄCA — kolejne
// wywołanie armAndConfirm mogło ruszyć, zanim POTWIERDZAJĄCY zapis
// faktycznie doleciał do serwera (dowód na żywo: druga i trzecia
// odpowiedź w rzędzie kończyły się tak, jakby to WCIĄŻ była ta sama, już
// uzbrojona odpowiedź z poprzedniego wywołania). Właściwy sygnał to sama
// odpowiedź sieciowa z RPC zapisu — dokładnie ten sam, sprawdzony wzorzec
// co record-playthrough.js's clickPaced/waitForWrite.
const WRITE_RPC_RE = /\/rpc\/(game_state_write|game_state_buzzer_press)(\?|$)/;

// Margines PO odebraniu odpowiedzi sieciowej: page.waitForResponse()
// rozstrzyga się, gdy CDP zobaczy odpowiedź na poziomie sieci — to NIE to
// samo co "JS na stronie zdążył już wywołać applyRow()/emit() i
// przemalować DOM" (osobny kanał komunikacji, bez gwarancji tej samej
// kolejki mikrozadań co strona). Krótki bufor eliminuje tę resztkową
// szczelinę zamiast dalej gonić rzadkie "prawie na czas" niedopasowania.
async function settleAfterWrite(page) {
  await page.waitForTimeout(150);
}

async function armAndConfirm(locator) {
  const page = locator.page();
  const mappingChoice = await locator.evaluate((el) => !!document.querySelector(".c2-mapinput") && /^(?:[1-6]|w|o|r)$/.test(el.dataset.shortcut || ""));
  if (mappingChoice) {
    const response = page.waitForResponse((resp) => WRITE_RPC_RE.test(resp.url()), { timeout: 15000 });
    await locator.click();
    await response; await settleAfterWrite(page); return;
  }
  await locator.click(); // uzbrojenie — lokalne, bez zapisu
  const responded = page.waitForResponse((resp) => WRITE_RPC_RE.test(resp.url()), { timeout: 15000 }).catch(() => null);
  await locator.click(); // potwierdzenie — faktyczny zapis do game_state
  await responded;
  await settleAfterWrite(page);
}

// Ten sam problem (klik wraca zanim zapis faktycznie dotarł do serwera)
// dotyczy KAŻDEGO klikniecia prowadzącego wprost do zapisu do game_state,
// nie tylko dwuklikowego armAndConfirm — np. zmiana języka UI to pojedynczy
// klik bez żadnej asercji po drodze do następnej akcji, więc ten sam wyścig.
async function clickConfirmed(locator) {
  const page = locator.page();
  const responded = page.waitForResponse((resp) => WRITE_RPC_RE.test(resp.url()), { timeout: 15000 }).catch(() => null);
  await locator.click();
  await responded;
  await settleAfterWrite(page);
}

async function revealAnswer(page, n) {
  await armAndConfirm(answerTile(page, n));
}

// DIAGNOSTYKA TYMCZASOWA — "pełna runda" wisi na "Zakończ rundę" bez
// żadnego błędu w konsoli nawet po naprawie stale_write i timingu
// armAndConfirm. console.log() z page.evaluate() NIE trafia do loga CI
// (tests/e2e/helpers/login.js's instrumentPage łapie tylko error/warning),
// więc to zwykłe console.log() PO STRONIE NODE (Playwright/test runner —
// leci prosto na stdout, widoczne w CI bez żadnego haka).
async function dumpControlState(page, label) {
  const stepper = await page.locator("#c2TopbarProgress").textContent().catch((e) => `<err: ${e.message}>`);
  const tiles = await page.locator(".c2-tilegrid button").allTextContents().catch((e) => [`<err: ${e.message}>`]);
  const endBtn = page.getByRole("button", { name: /^(Zakończ rundę|Przejdź do zakończenia gry)$/ });
  const endCount = await endBtn.count().catch(() => -1);
  const endVisible = endCount > 0 ? await endBtn.first().isVisible().catch(() => false) : false;
  const endEnabled = endVisible ? await endBtn.first().isEnabled().catch(() => false) : false;
  const bodyText = await page.locator("body").innerText().catch((e) => `<err: ${e.message}>`);
  console.log(`[diag:${label}] stepper=${JSON.stringify(stepper)} tiles=${JSON.stringify(tiles)} endRoundBtn(count=${endCount} visible=${endVisible} enabled=${endEnabled})`);
  console.log(`[diag:${label}] body(500)=${JSON.stringify(bodyText.slice(0, 500))}`);
}

function xTile(page) {
  return page.getByRole("button", { name: "X", exact: true });
}

async function clickX(page) {
  await armAndConfirm(xTile(page));
}

// Pytania rund z jedną prawdziwą odpowiedzią są dopełniane do 3 odpowiedzi
// (reguła play), więc po odsłonięciu jedynej odpowiedzi zostają nieodsłonięte
// "Pusta 2/3". Trzecie pudło (X) nie kończy już rundy, tylko otwiera
// kradzież drużyny przeciwnej; dopiero jej pudło (czwarty X) odblokowuje
// "Zakończ rundę" i zostawia bank przy drużynie prowadzącej.
async function strikeOutAndLoseSteal(page) {
  await clickX(page);
  await clickX(page);
  await clickX(page);
  await clickX(page);
}

// "Zakończ rundę" przy nieodsłoniętych odpowiedziach ("Pusta 2/3" z dopełnienia
// makeGame) nie kończy rundy od razu, tylko wchodzi w R8 (odkrywanie reszty):
// dopiero po odsłonięciu wszystkiego odblokowuje się kontekstowy przycisk
// ("Przejdź do następnej rundy" / "Przejdź do finału"). Wyjątek: gdy cel to
// koniec gry, END_ROUND finalizuje rundę od razu (engine.js, GAME_END).
async function endRoundAndRevealRest(page, nextButtonName, restOrds = [2, 3]) {
  await clickConfirmed(page.getByRole("button", { name: /^(Zakończ rundę|Przejdź do zakończenia gry)$/ }));
  for (const ord of restOrds) {
    await expect(answerTile(page, ord)).toBeEnabled({ timeout: 20000 });
    await revealAnswer(page, ord);
  }
  const next = page.getByRole("button", { name: nextButtonName });
  await expect(next).toBeEnabled({ timeout: 10000 });
  await next.click();
}

// "Rozpocznij rundę" po R8 bywa klikany w chwili, gdy akcja gry jest jeszcze
// odrzucana przez busy() w handle() (dźwięk/blokada kończą się tuż po
// odświeżeniu przycisku) — wtedy START_ROUND po cichu nie idzie, a Buzzer
// zostaje na stanie poprzedniej rundy (zapalony przycisk zwycięzcy, disabled).
// Klik jest powtarzany, aż Control faktycznie wyjdzie z ekranu startu rundy.
async function startRoundConfirmed(page) {
  const start = page.getByRole("button", { name: "Rozpocznij rundę" });
  for (let attempt = 0; attempt < 4; attempt++) {
    await start.click({ timeout: 30000 });
    try {
      await expect(start).toHaveCount(0, { timeout: 8000 });
      return;
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
}

// Symuluje gest przesunięcia (peek) na Hoście — host/js/main.js's
// setupPeekSwipe(): pointerdown -> pointerup w odległości >= 60px, lokalnie
// pokazuje treść pod zasłoną pasma 2, BEZ żadnego zapisu do game_state.
// Ten sam helper co tests/e2e/record-playthrough.js's hostPeekSwipe
// (świadomie zduplikowany, nie importowany -- record-playthrough.js to
// osobny skrypt nagrania, nie biblioteka współdzielona z testami). Zasłona
// jest jednokierunkowa W SILNIKU (state.host.covered nigdy nie wraca na
// false samo) -- to NIE jest bug do naprawienia nową logiką w Control;
// jedyny sposób odsłonięcia to właśnie ten gest NA URZĄDZENIU Hosta, i to
// TEST ma go wykonywać, żeby to pokryć, nie panel.
async function hostPeekSwipe(hostPage) {
  await hostPage.mouse.move(300, 220);
  await hostPage.mouse.down();
  await hostPage.mouse.move(300, 360, { steps: 10 });
  await hostPage.mouse.up();
}

async function getDisplayCalls(displayPage, filterPrefix = "") {
  return displayPage.evaluate((prefix) => (window.__displayLog || [])
    .filter((e) => e.call.startsWith(prefix))
    .map((e) => ({ call: e.call, args: e.args })), filterPrefix);
}

async function expectMappingFieldFits(page, testInfo, label) {
  await expect(page.locator(".c2-mapinput input")).toBeVisible();
  const geometry = await page.locator(".c2-mapinput").evaluate((tile) => {
    const box = tile.getBoundingClientRect();
    const input = tile.querySelector("input").getBoundingClientRect();
    const column = tile.querySelector(".c2-mapinput-labelcol").getBoundingClientRect();
    const caption = tile.querySelector(".c2-field-label").getBoundingClientRect();
    const card = document.querySelector(".c2-gameplay-card").getBoundingClientRect();
    const main = document.querySelector(".c2-roundlayout-main").getBoundingClientRect();
    return { top: input.top - box.top, bottom: box.bottom - input.bottom, right: box.right - input.right, centered: Math.abs((column.left + column.right) / 2 - (caption.left + caption.right) / 2), horizontalOverflow: tile.scrollWidth - tile.clientWidth, cardX: card.x, cardWidth: card.width, mainX: main.x, mainWidth: main.width };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(5);
  expect(geometry.bottom).toBeGreaterThanOrEqual(5);
  expect(geometry.right).toBeGreaterThanOrEqual(5);
  expect(geometry.centered).toBeLessThanOrEqual(1);
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  if (label === "p1") await page.evaluate((rect) => { window.__p1MappingLayout = rect; }, geometry);
  if (label === "p2") {
    const p1 = await page.evaluate(() => window.__p1MappingLayout);
    expect(Math.abs(geometry.cardX - p1.cardX), "karta nie może przesuwać się w mapowaniu gracza 2").toBeLessThan(1);
    expect(Math.abs(geometry.cardWidth - p1.cardWidth), "szerokość karty musi być stała między graczami").toBeLessThan(1);
    expect(Math.abs(geometry.mainX - p1.mainX), "lewa kolumna mapowania nie może przesuwać się między graczami").toBeLessThan(1);
    expect(Math.abs(geometry.mainWidth - p1.mainWidth), "szerokość kolumny mapowania musi być stała między graczami").toBeLessThan(1);
  }
  await page.screenshot({ path: testInfo.outputPath(`shot-mapping-${label}.png`) });
}

test("control2: intro logo i natychmiastowe światło Buzzera przed wysyłką", async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-INTRO-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [], errors = [];
  let releasePress;
  try {
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", errors);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(displayPage.locator("#blackScreen")).toBeVisible();
    await page.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(displayPage.locator("#blackScreen")).toBeVisible();
    await clearDisplayLog(displayPage);
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await expect(page.getByRole("button", { name: "Rozpocznij grę", exact: true })).toBeVisible();
    await expect.poll(async () => (await getDisplayCalls(displayPage, "api.big.clear")).length).toBeGreaterThan(0);
    expect(await getDisplayCalls(displayPage, "api.logo.show")).toEqual([]);
    await expect(displayPage.locator("#gameScreen")).toBeVisible();
    await expect.poll(async () => (await getDisplayCalls(displayPage, "api.small.long1")).at(-1)?.args[0]).toBe("Alfa");
    await expect.poll(async () => (await getDisplayCalls(displayPage, "api.small.leftDigits")).at(-1)?.args[0]).toBe("");
    await expect.poll(async () => (await getDisplayCalls(displayPage, "api.small.rightDigits")).at(-1)?.args[0]).toBe("");
    await expect(buzzerPage.locator("#btnA")).toBeVisible();
    await expect(buzzerPage.locator("#btnB")).toBeVisible();
    await expect(buzzerPage.locator("#btnA")).toBeDisabled();
    await expect(buzzerPage.locator("#btnB")).toBeDisabled();
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Rozpocznij grę", exact: true }).click();
    await waitForSfxKeysAnyOrder(page, ["show_intro", "reveal"], 30000);
    await expect.poll(async () => (await getDisplayCalls(displayPage, "api.logo.show")).at(-1)?.args[0]?.ms || 0).toBeGreaterThan(14);
    await expect(page.getByRole("button", { name: "Rozpocznij rundę", exact: true })).toBeEnabled({ timeout: 22000 });
    await displayPage.screenshot({ path: testInfo.outputPath("shot-intro-logo.png") });
    const roundWrite = page.waitForResponse(resp => WRITE_RPC_RE.test(resp.url()));
    await page.getByRole("button", { name: "Rozpocznij rundę", exact: true }).click();
    const written = await (await roundWrite).json();
    expect(Date.parse(written.locked_until)).toBeGreaterThan(Date.now());
    const premature = await buzzerPage.evaluate(async ({id,key}) => {
      const result = await window.__sbClient.rpc("game_state_buzzer_press", {p_game_id:id,p_key:key,p_team:"A"});
      return { error: result.error?.message, pressed: result.data?.detail?.rounds?.duel?.lastPressed };
    }, {id:game.id,key:game.share_key_buzzer});
    expect(premature.error).toContain("locked");
    expect(premature.pressed).toBeFalsy();
    await expect(buzzerPage.locator("#btnA")).toBeEnabled({ timeout: 15000 });

    // Pause only the outgoing request; continue it to the real production RPC.
    // This proves the light appears before the network can return a winner.
    const held = new Promise((resolve) => { releasePress = resolve; });
    let requests = 0;
    await buzzerPage.route("**/rpc/game_state_buzzer_press", async (route) => { requests++; await held; await route.continue(); });
    await clearSfxLog(page);
    await buzzerPage.locator("#btnA").click();
    await expect(buzzerPage.locator("#btnA")).toHaveClass(/\blit\b/);
    await expect(buzzerPage.locator("#btnB")).toBeDisabled();
    await expect.poll(() => requests).toBe(1);
    expect(await page.getByRole("button", { name: "Zatwierdź: Alfa" }).count()).toBe(0);
    const response = buzzerPage.waitForResponse((res) => res.url().includes("/rpc/game_state_buzzer_press"));
    releasePress();
    expect((await response).ok()).toBe(true);
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 15000 });
    await waitForSfxSequence(page, ["buzzer_press"]);
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    expect((await getSfxKeys(page)).filter((key) => key === "buzzer_press")).toHaveLength(1);
    await expect(buzzerPage.locator("#btnA")).toHaveClass(/\blit\b/);
    expect(errors).toEqual([]);
  } finally {
    releasePress?.();
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// Blokada stanu "play" (guardGameState, reguła game_validate): gra musi mieć
// co najmniej 10 pytań, każde z 3-6 odpowiedziami i sumą punktów <= 100.
// Testy budują małe gry, więc makeGame dopełnia je pytaniami-wypełniaczami
// (ord 200+, poza rundami i finałem) oraz dopełnia odpowiedzi pytań rund
// zerowymi odpowiedziami do 3. Zamierzony przepływ pytań zostaje, bo
// padGame przypina pytania rund trybem "pick" (settings.questions.rounds),
// więc losowanie nie dobiera wypełniaczy.
async function padGame(page, gameId) {
  await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    const { data: qs, error: qErr } = await sb.from("questions").select("id, text, ord").eq("game_id", gid).order("ord");
    if (qErr) throw new Error("padGame read questions: " + qErr.message);
    for (let i = 0; (qs.length + i) < 10; i++) {
      const { data: fq, error: fqErr } = await sb.from("questions")
        .insert({ game_id: gid, ord: 200 + i, text: `Pytanie dopełniające ${i + 1}` }).select("id").single();
      if (fqErr) throw new Error("padGame insert question: " + fqErr.message);
      const { error: faErr } = await sb.from("answers").insert([
        { question_id: fq.id, ord: 1, text: "Wypełniacz A", fixed_points: 40 },
        { question_id: fq.id, ord: 2, text: "Wypełniacz B", fixed_points: 30 },
        { question_id: fq.id, ord: 3, text: "Wypełniacz C", fixed_points: 20 },
      ]);
      if (faErr) throw new Error("padGame insert answers: " + faErr.message);
    }
    const rounds = qs.filter((q) => q.ord < 100).map((q) => ({ id: q.id, text: q.text }));
    if (!rounds.length) return;
    const { data: cur, error: cErr } = await sb.from("games").select("settings").eq("id", gid).single();
    if (cErr) throw new Error("padGame read settings: " + cErr.message);
    const st = cur.settings || {};
    st.game = { ...(st.game || {}), roundsQuestionsMode: "pick" };
    st.questions = { final: st.questions?.final || [], rounds };
    const { error: uErr } = await sb.from("games").update({ settings: st }).eq("id", gid);
    if (uErr) throw new Error("padGame update settings: " + uErr.message);
  }, gameId);
}

async function makeGame(page, name, opts = {}) {
  const g = await makeGameRaw(page, name, opts);
  await padGame(page, g.id);
  return g;
}

async function makeGameRaw(page, name, { settings = {}, roundQuestions = [], finalAnswerPts = null } = {}) {
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
      // reguła play: min. 3 odpowiedzi — dopełnienie zerowymi punktami
      q.answers = [...q.answers];
      while (q.answers.length < 3) q.answers.push({ ord: q.answers.length + 1, text: `Pusta ${q.answers.length + 1}`, fixed_points: 0 });
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
          // reguła play: min. 3 odpowiedzi na każde pytanie (także finałowe)
          { question_id: fq.id, ord: 2, text: clip17("Pusta 2"), fixed_points: 0 },
          { question_id: fq.id, ord: 3, text: clip17("Pusta 3"), fixed_points: 0 },
        ]);
        if (faErr) throw new Error("insert final answer failed: " + faErr.message);
        finalPicked.push({ id: fq.id });
      }
      const { error: upErr } = await sb.from("games").update({
        settings: {
          teams: { teamA: "Alfa", teamB: "Beta" },
          ...settings,
          game: { ...settings.game, hasFinal: true, finalQuestionsMode: "pick" },
          questions: { final: finalPicked, rounds: [] },
        },
      }).eq("id", g.id);
      if (upErr) throw new Error("update final settings failed: " + upErr.message);
    }

    return g;
  }, { name, settings, roundQuestions, finalAnswerPts });
}

const statisticsGameIds = new Set();

async function deleteGame(page, gameId) {
  if (process.env.KEEP_STATISTICS_GAMES === "1" && statisticsGameIds.has(gameId)) {
    console.log(`[statistics-review] kept production game ${gameId}`);
    return;
  }
  await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    await sb.from("games").delete().eq("id", gid);
  }, gameId).catch(() => {});
}

async function readControl2Sessions(page, gameId) {
  statisticsGameIds.add(gameId);
  return page.evaluate(async (gid) => {
    const { data, error } = await window.__sbClient.from("game_sessions")
      .select("id,status,ended_at,rounds_played,rounds_score_a,rounds_score_b,team_a_score,team_b_score,final_points,stats_detail")
      .eq("game_id", gid).eq("control_version", 2).order("started_at");
    if (error) throw new Error("read production statistics: " + error.message);
    return data;
  }, gameId);
}

async function attachStatistics(testInfo, label, rows) {
  const name = `statistics-${label}.json`;
  const path = testInfo.outputPath(name);
  await require("node:fs/promises").writeFile(path, JSON.stringify(rows, null, 2));
  await testInfo.attach(name, { path, contentType: "application/json" });
}

test("control2: widoczność zachowanych statystyk w panelu administratora", async ({ page }, testInfo) => {
  test.skip(process.env.KEEP_STATISTICS_GAMES !== "1", "Only inspect explicitly retained production games.");
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const report = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: user, error: authError } = await sb.auth.getUser();
    if (authError) throw authError;
    const { data: games, error: gamesError } = await sb.from("games").select("id,name")
      .eq("owner_id", user.user.id).like("name", "E2E-CONTROL2-%");
    if (gamesError) throw gamesError;
    const { data: history, error: historyError } = await sb.rpc("get_stats_detail", { p_type: "gameplay", p_limit: 200 });
    if (historyError) throw historyError;
    const names = new Set((games || []).map(game => game.name));
    const { data: excluded, error: excludedError } = await sb.rpc("stats_excluded_list");
    if (excludedError) throw excludedError;
    return {
      account: user.user.email,
      excludedFromStatistics: (excluded || []).some(row => row.user_id === user.user.id),
      games: games || [],
      // Return only these owned test games, never unrelated users' history.
      visibleRows: (history || []).filter(row => names.has(row.game_name)),
    };
  });
  expect(report.games.length).toBeGreaterThanOrEqual(2);
  const path = testInfo.outputPath("statistics-panel-visibility.json");
  await require("node:fs/promises").writeFile(path, JSON.stringify(report, null, 2));
  await testInfo.attach("statistics-panel-visibility.json", { path, contentType: "application/json" });
  console.log(`[statistics-review] ${report.account}: ${report.games.length} owned games, ${report.visibleRows.length} rows visible in admin history, excluded=${report.excludedFromStatistics}`);
});

function trackErrors(p, label, bucket) {
  p.on("pageerror", (err) => bucket.push(`${label}: ${err.message}`));
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

// DIAGNOSTYKA TYMCZASOWA — do teraz TYLKO strona Control (authenticated)
// miała jakąkolwiek widoczność RPC (tests/e2e/helpers/login.js's
// instrumentPage) -- Buzzer/Host/Display (anon, otwierane tu) były całkowicie
// nieme w logu CI. Znalezione na żywo: test #2 wisi 10s na "Zatwierdź: Alfa"
// po kliknięciu "Przycisk A" na Buzzerze, zero game_state_buzzer_press w
// logu -- ale bez tego nie da się rozstrzygnąć, czy to dlatego, że RPC
// faktycznie się nie wystrzeliło (press()'s wewnętrzny guard
// deriveButtonState()!==ON go zablokował), czy wystrzeliło i dostało błąd,
// czy wystrzeliło OK ale dzwonek/hydrate po stronie Control zgubił
// potwierdzenie. Etykieta z `label` odróżnia urządzenia w jednym logu.
function instrumentAnon(p, label) {
  p.on("console", (msg) => {
    if ((msg.type() === "error" || msg.type() === "warning") && !isKnownNoiseText(msg.text())) {
      console.log(`[e2e-diag:${label}] console:${msg.type()}`, msg.text());
    }
  });
  p.on("response", (res) => {
    if (res.url().includes("/rpc/")) {
      console.log(`[e2e-diag:${label}] rpc ${res.status()}`, res.url());
    }
    if (res.url().includes("/rpc/game_state_buzzer_press")) {
      res.text().then((body) => console.log(`[e2e-diag:${label}] buzzer_press ->`, body))
        .catch((e) => console.log(`[e2e-diag:${label}] buzzer_press body read failed:`, e.message));
    }
  });
  p.on("requestfailed", (req) => {
    if (isKnownNoiseUrl(req.url())) return;
    console.log(`[e2e-diag:${label}] requestfailed`, req.failure()?.errorText, req.url());
  });
}

async function openAnon(browser, contexts, path, label, errors) {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const p = await ctx.newPage();
  trackErrors(p, label, errors);
  instrumentAnon(p, label);
  await p.goto(path, { waitUntil: "domcontentloaded" });
  return p;
}

// ===== 1. Parowanie urządzeń =====

test("control2: parowanie urządzeń — linki renderują się bez błędu, Control widzi je jako online", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-PAIRING-${Date.now()}`, {
    settings: { game: { hasFinal: true, roundsQuestionsMode: "pick", finalQuestionsMode: "random", advanced: { finalTarget: 250 } } },
    roundQuestions: Array.from({ length: 6 }, (_, i) => ({
      ord: i + 1,
      text: `Pytanie rundy ${i + 1}`,
      answers: [{ ord: 1, text: `Odp. ${i + 1}`, fixed_points: 10 }],
    })),
  });
  await page.evaluate(async (gameId) => {
    const sb = window.__sbClient;
    const { data: questions, error: readError } = await sb.from("questions").select("id, text, ord").eq("game_id", gameId).lt("ord", 100).order("ord");
    if (readError) throw new Error(readError.message);
    const { data: current, error: gameError } = await sb.from("games").select("settings").eq("id", gameId).single();
    if (gameError) throw new Error(gameError.message);
    const settings = current.settings;
    settings.questions = {
      rounds: questions,
      final: [],
    };
    const { error } = await sb.from("games").update({ settings }).eq("id", gameId);
    if (error) throw new Error(error.message);
  }, game.id);
  const contexts = [];
  try {
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    const errors = [];
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    // Nowa gra: żaden wiersz game_state jeszcze nie istnieje, więc Display
    // powinien zostać na czarnym ekranie bez błędu — "wznowienie/pierwsze
    // wejście bez specjalnego przypadku" z planu.
    await expect(displayPage.locator("#blackScreen")).not.toHaveClass(/hidden/, { timeout: 10000 });

    const hostPage = await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", errors);
    await expect(hostPage.locator("#paperText1")).toBeVisible({ timeout: 10000 });

    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    await expect(buzzerPage.locator("#offScreen")).toBeVisible({ timeout: 10000 });

    // Wszystkie 3 urządzenia na JEDNYM ekranie (dokładnie jak stary
    // control.html: "Step 2 (host+buzzer) – usunięty, scalony z step 1") —
    // "Dalej" odblokowuje się dopiero gdy WSZYSTKIE są online.
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/, { timeout: 15000 });
    // .device-row-1 (nie cały .device-row) — od dodania "Udostępnij" każdy
    // wiersz ma DRUGI .badge (znaczek udostępnienia) w device-row-2.
    // "Online" nigdy nie istniało jako realny tekst odznaki — tłumaczenia
    // (translation/pl.js's control.deviceStatusOk) dają "POŁĄCZONO" (PL),
    // "CONNECTED" (EN), "ПІДКЛЮЧЕНО" (UK); ten test od zawsze błędnie
    // oczekiwał angielskiego słowa mimo że reszta asercji w tym pliku jest
    // po polsku — nigdy wcześniej nie uruchomiony na żywo.
    await expect(page.locator('.device-row[data-device="host"] .device-row-1 .conn-status')).toHaveText("POŁĄCZONO", { timeout: 10000 });
    await expect(page.locator('.device-row[data-device="buzzer"] .device-row-1 .conn-status')).toHaveText("POŁĄCZONO", { timeout: 10000 });
    await expect(page.locator('.device-row[data-device="host"] .device-row-1 .conn-status')).toHaveClass(/\bconn-status--connected\b/);
    const deviceListFits = await page.locator(".c2-devices-layout .c2-scroll-area").evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
    expect(deviceListFits, "Urządzenia powinny mieścić się bez przewijania przy 1366×768").toBe(true);

    await page.locator('.toggle-item:has(input[name="soundSource"][value="display"])').click();
    await expect(page.locator('.device-row:has(input[name="soundSource"][value="display"]) .device-opt-check-hint').last())
      .toContainText("bez tego start gry będzie zablokowany");
    await expect(displayPage.locator("#audioUnlockScreen")).not.toHaveClass(/hidden/, { timeout: 10000 });

    const nextStep = page.getByRole("button", { name: "Dalej" });
    await expect(nextStep).toBeDisabled();
    await displayPage.locator("#btnAudioUnlock").click();
    await expect(displayPage.locator("#audioUnlockScreen")).toHaveClass(/hidden/);
    await expect(nextStep).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await expect(page.locator(".c2-summary-rounds .c2-qpreview-text")).toHaveCount(1);
    await expect(page.locator(".c2-summary-final-questions .c2-qpreview-text")).toHaveCount(5);
    const initialRoundQuestion = await page.locator(".c2-summary-rounds .c2-qpreview-text").textContent();
    const initialFinalQuestions = await page.locator(".c2-summary-final-questions .c2-qpreview-text").allTextContents();
    expect(initialFinalQuestions).not.toContain(initialRoundQuestion);
    expect(new Set([...initialFinalQuestions, initialRoundQuestion]).size).toBe(6);
    await expect(page.locator(".c2-summary-advanced")).toContainText("250");
    const questionCards = await page.locator(".c2-summary-question-grid > .summarySection").evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    }));
    expect(questionCards).toHaveLength(2);
    expect(questionCards[1].left).toBeGreaterThan(questionCards[0].left + questionCards[0].width - 2);
    await page.evaluate(() => { window.__originalRandom = Math.random; Math.random = () => 0.99; });
    await page.locator(".c2-summary-final-questions .c2-summary-row .btn").click();
    await expect(page.locator(".c2-summary-final-questions .c2-qpreview-text")).not.toHaveText(initialFinalQuestions);
    await expect(page.locator(".c2-summary-rounds .c2-qpreview-text")).toHaveText([initialFinalQuestions[4]]);
    await page.evaluate(() => { Math.random = window.__originalRandom; delete window.__originalRandom; });
    const displayPreview = page.locator("#c2DisplayPreview");
    const previewBox = await displayPreview.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const section = el.closest(".c2-summary-display").getBoundingClientRect();
      return { width: rect.width, height: rect.height, left: rect.left, sectionLeft: section.left, sectionWidth: section.width };
    });
    expect(previewBox.width).toBeLessThanOrEqual(641);
    expect(previewBox.width / previewBox.height).toBeCloseTo(16 / 9, 1);
    expect(Math.abs((previewBox.left + previewBox.width / 2) - (previewBox.sectionLeft + previewBox.sectionWidth / 2))).toBeLessThan(2);

    const revealPreview = page.locator('.summarySoundRow:has(input[data-sfx-vol="reveal"]) .summarySoundPlay');
    const beginGame = page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" });
    await expect(beginGame).toBeEnabled();
    await expect(page.locator(".c2-audio-gate-hint")).toHaveCount(0);
    await revealPreview.click();
    await expect(revealPreview.locator(".ico")).toHaveClass(/ico-stop/);
    await expect(beginGame).toBeEnabled();
    await beginGame.click();
    // Po "Gotowe" jest ekran wstępu (r_intro): .stepTitle znika (istnieje tylko
    // w krokach przygotowania), a start rundy wymaga najpierw "Rozpocznij grę".
    await expect(page.locator(".stepTitle")).toHaveCount(0, { timeout: 10000 });
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 1", { timeout: 22000 });

    // Po utracie i odzyskaniu połączenia Control przy źródle Display
    // ponownie wymaga gestu na Wyświetlaczu. Akcje gry pozostają zablokowane
    // do potwierdzenia, a odpowiedź Display odblokowuje je bez reloadu.
    const startRound = page.getByRole("button", { name: "Rozpocznij rundę" });
    await expect(startRound).toBeVisible();
    // Źródło dźwięku to Display: przycisk jest zablokowany do końca intro
    // (dźwięk + animacja na Display, blokada akcji). Dopiero gdy jest aktywny,
    // blokada po odzyskaniu połączenia pochodzi wyłącznie z braku gestu na
    // Display — inaczej "odblokowany po gestie" mierzyłby koniec intro.
    await expect(startRound).toBeEnabled({ timeout: 60000 });
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await expect(displayPage.locator("#audioUnlockScreen")).toBeVisible({ timeout: 10000 });
    await expect(startRound).toBeDisabled();
    await displayPage.locator("#btnAudioUnlock").click();
    await expect(displayPage.locator("#audioUnlockScreen")).toBeHidden({ timeout: 10000 });
    await expect(startRound).toBeEnabled({ timeout: 10000 });

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 2. Pełna runda + wznowienie po przeładowaniu =====

test("control2: pełna runda przez 4 urządzenia + wznowienie Control po przeładowaniu w środku rundy 2", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-FULLGAME-${Date.now()}`, { roundQuestions: TWO_QUESTIONS });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    const hostPage = await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", errors);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await expect(page.getByText("Alfa vs Beta")).toBeVisible();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();

    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 1", { timeout: 22000 });
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    const questionDuringDuel = page.locator(".c2-stepper-question");
    await expect(questionDuringDuel).toHaveText(/\S/);
    const visibleQuestion = await questionDuringDuel.textContent();
    const topbarLayout = await page.evaluate(() => {
      const progress = document.querySelector("#c2TopbarProgress").getBoundingClientRect();
      const display = document.querySelector("#dotDisplayRow").getBoundingClientRect();
      return {
        progressRight: progress.right,
        displayLeft: display.left,
        progressCenter: progress.top + progress.height / 2,
        displayCenter: display.top + display.height / 2,
        progressHeight: progress.height,
        deviceIconCount: document.querySelectorAll("#dotDisplayRow svg, #dotHostRow svg, #dotBuzzerRow svg").length,
      };
    });
    expect(topbarLayout.progressRight).toBeLessThan(topbarLayout.displayLeft);
    expect(Math.abs(topbarLayout.progressCenter - topbarLayout.displayCenter)).toBeLessThan(2);
    expect(topbarLayout.progressHeight).toBeGreaterThanOrEqual(36);
    expect(topbarLayout.deviceIconCount).toBe(3);

    // Regresja: Prowadzący musi widzieć PEŁNĄ treść i punkty KAŻDEJ
    // odpowiedzi od początku rundy, nie tylko już odsłoniętych dla widzów
    // (inaczej nie mógłby ocenić, czy to, co powiedział kontestant, pasuje
    // do listy) — wcześniejsza wersja chowała je pod "______".
    await expect(hostPage.locator("#paperText2")).toContainText("Odpowiedź B (30)", { timeout: 10000 });
    await expect(hostPage.locator("#paperText2")).toContainText("Odpowiedź C (20)", { timeout: 10000 });

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await expect(questionDuringDuel).toHaveText(visibleQuestion);
    const duelGridRows = await page.locator(".c2-tilegrid").evaluate((grid) => getComputedStyle(grid).gridTemplateRows.split(" ").length);
    expect(duelGridRows).toBe(6);
    const duelTileHeight = await page.locator(".c2-tilegrid .c2-tile").first().evaluate((tile) => tile.getBoundingClientRect().height);
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    const roundTileHeight = await page.locator(".c2-tilegrid .c2-tile").first().evaluate((tile) => tile.getBoundingClientRect().height);
    expect(Math.abs(roundTileHeight - duelTileHeight)).toBeLessThan(1);
    await expect(page.locator(".c2-gameplay-nav .c2-statusbar")).toBeVisible();

    // Odpowiedź #1 ma najwyższe punkty (40) — trafienie wygrywa pojedynek.
    await dumpControlState(page, "przed-reveal-1");
    await revealAnswer(page, 1);
    await dumpControlState(page, "po-reveal-1");
    await revealAnswer(page, 2);
    await dumpControlState(page, "po-reveal-2");
    await revealAnswer(page, 3);
    await dumpControlState(page, "po-reveal-3");
    // Krótki, jawny timeout (zamiast domyślnego 150s testu) — jeśli to
    // zawiśnie, chcemy szybki, kompletny dump zamiast czekać 2.5 min na
    // każdą z dwóch prób (5 min razem) tylko po to, żeby dostać ten sam,
    // pusty "Timeout of 150000ms exceeded".
    try {
      await page.getByRole("button", { name: /^(Zakończ rundę|Przejdź do zakończenia gry)$/ }).click({ timeout: 15000 });
    } catch (e) {
      await dumpControlState(page, "PO-TIMEOUCIE-zakoncz-runde");
      throw e;
    }

    // finalizeRound(): próg (300) nieosiągnięty, pula ma jeszcze pytanie 2.
    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 2", { timeout: 22000 });

    // ===== KLUCZOWY MOMENT: przeładowanie Control w środku rundy 2 =====
    const beforeReload = await readControl2Sessions(page, game.id);
    expect(beforeReload).toHaveLength(1);
    expect(beforeReload[0]).toMatchObject({ rounds_played: 1, rounds_score_a: 90 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 2", { timeout: 22000 });
    await expect(page.getByText("Alfa: 90")).toBeVisible({ timeout: 10000 });
    const afterReload = await readControl2Sessions(page, game.id);
    expect(afterReload).toHaveLength(1);
    expect(afterReload[0].id).toBe(beforeReload[0].id);
    expect(afterReload[0].rounds_played).toBe(1);
    await attachStatistics(testInfo, "reload", afterReload);

    expect(errors, "żadne z 4 urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 3. Mechanika rund: reset pojedynku, pass, kradzież win/loss, R8 =====

test("control2: reset pojedynku, pass, kradzież wygrana/przegrana, odkrywanie reszty, koniec gry + Wróć do moich gier", async ({ page, browser }, testInfo) => {
  test.setTimeout(300000);
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-ROUNDMECH-${Date.now()}`, { roundQuestions: TWO_QUESTIONS });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", errors);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();

    // ===== RUNDA 1 =====
    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 1", { timeout: 22000 });
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    // Zgłoszone: "X nie odtwarza żadnego dźwięku" — regresja wprost na
    // ADD_X (engine.js zawsze zwraca soundCueKey "answer_wrong" dla X,
    // niezależnie od fazy DUEL/PLAY/STEAL, patrz komentarz tam).
    await clearSfxLog(page);
    await clickX(page); // A pudłuje -> kolej B
    await waitForSfxSequence(page, ["answer_wrong"], 10000);
    // B pudłuje też -> RESET CYKLU: kolej wraca do A, BEZ nowego zgłoszenia
    // buzzera (firstTeam/secondTeam nie są czyszczone — "nie ma czegoś
    // takiego jak ponowny buzer").
    await clickX(page);

    await revealAnswer(page, 1); // A trafia (40 pkt) -> wygrywa pojedynek, BEZ nowego zgłoszenia
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });

    await clickX(page);
    await clickX(page);
    await clickX(page); // 3x pudło A -> auto-KRADZIEŻ dla B

    await revealAnswer(page, 2); // B kradnie WYGRANĄ (30 pkt)
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /^(Zakończ rundę|Przejdź do zakończenia gry)$/ }).click();

    // Zgłoszone: wynik na Wyświetlaczu (LEFT/RIGHT) ma skoczyć na nowy wynik
    // DOSŁOWNIE w momencie dźwięku końca rundy — nie dopiero przy starcie
    // NASTĘPNEJ rundy. Sprawdzone TU, W TRAKCIE R8 (jeszcze przed
    // odsłonięciem #3), żeby złapać regresję na wcześniejszy brak
    // jakiejkolwiek obsługi tego przejścia w display/js/render.js.
    await expect.poll(async () => {
      const calls = await getDisplayCalls(displayPage, "api.small.rightDigits");
      return calls.at(-1)?.args?.[0];
    }, { timeout: 10000 }).toBe("70");
    await expect.poll(async () => {
      const calls = await getDisplayCalls(displayPage, "api.small.leftDigits");
      return calls.at(-1)?.args?.[0];
    }, { timeout: 10000 }).toBe("0");

    await revealAnswer(page, 3); // #3 nieodkryte -> R8

    // Zgłoszone: ostatnie odsłonięcie w R8 NIE MA już samo odpalać ekranu
    // kolejnej rundy "znikąd" — operator musi kliknąć osobny, kontekstowo
    // podpisany przycisk (tu: "Przejdź do następnej rundy", bo próg
    // nieosiągnięty i pula ma jeszcze pytanie 2).
    const nextRoundBtn = page.getByRole("button", { name: "Przejdź do następnej rundy" });
    await expect(nextRoundBtn).toBeEnabled({ timeout: 10000 });
    await nextRoundBtn.click();

    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 2", { timeout: 22000 });
    await expect(page.getByText("Alfa: 0")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Beta: 70")).toBeVisible({ timeout: 10000 });

    // ===== RUNDA 2 =====
    await startRoundConfirmed(page);
    // Przycisk Buzzera czeka, aż Display dokończy animację końca poprzedniej
    // rundy (display_animation_pending) — przy 4 workerach to trwa dłużej.
    await expect(buzzerPage.getByRole("button", { name: "Przycisk B" })).toBeEnabled({ timeout: 60000 });
    await buzzerPage.getByRole("button", { name: "Przycisk B" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Beta" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Beta" }));

    await revealAnswer(page, 1); // B trafia (40 pkt) -> kontrola B, allowPass
    await armAndConfirm(page.getByRole("button", { name: "Oddaj kontrolę" })); // dawny "Pass" -> kontrola A

    await revealAnswer(page, 2); // A trafia (30 pkt) -> bank 70
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });

    await clickX(page);
    await clickX(page);
    await clickX(page); // 3x pudło A -> auto-KRADZIEŻ dla B

    await clickX(page); // B kradnie, ale też PUDŁUJE -> kradzież PRZEGRANA
    // Pula wyczerpana (2/2), próg nieosiągnięty, hasFinal=false: cel to koniec
    // gry, więc END_ROUND finalizuje rundę od razu (engine.js, GAME_END) —
    // bez R8, mimo nieodsłoniętej odpowiedzi #3. Przycisk podpisuje się
    // "Przejdź do zakończenia gry".
    await clickConfirmed(page.getByRole("button", { name: /^(Zakończ rundę|Przejdź do zakończenia gry)$/ }));

    // Runda 1 dała bank drużynie B (70), runda 2 zostaje przy A (70) -> remis.
    await expect(page.locator("#c2TopbarProgress")).toContainText("Koniec gry", { timeout: 22000 });

    // gameEndSummary() (ui.js) renderuje się dopiero PO locks.gameEnded —
    // czyli PO tym kliknięciu, nie przed nim (poprzednia kolejność w tym
    // teście była odwrócona względem UI).
    await page.getByRole("button", { name: "Zakończ grę" }).click();
    await expect(page.getByText("Remis — 70:70")).toBeVisible({ timeout: 10000 });
    const finishBtn = page.getByRole("button", { name: "Wróć do moich gier" });
    await expect(finishBtn).toBeVisible({ timeout: 10000 });
    await expect(finishBtn).toBeEnabled({ timeout: 150000 });
    await finishBtn.click();
    await expect(page).toHaveURL(/\/games/, { timeout: 10000 });
    await page.waitForFunction(() => window.__sbClient, { timeout: 10000 }).catch(() => {});

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 4. Finał: próg -> finał, wczesne zakończenie w połowie mapowania =====

test("control2: próg w rundzie -> finał, wczesne zakończenie po 4/5 pytaniach, pomija gracza 2", async ({ page, browser }, testInfo) => {
  test.setTimeout(300000);
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-FINAL-${Date.now()}`, {
    roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odp. warta 300", fixed_points: 100 }] }],
    finalAnswerPts: 50,
    settings: { game: { advanced: { endScreenMode: "money", roundMultipliers: [3] } } },
  });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", errors);

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await revealAnswer(page, 1); // jedyna odpowiedź, 300 pkt -> bank 300

    // Jedyna prawdziwa odpowiedź odsłonięta, "Pusta 2/3" nie: 3 X otwierają
    // kradzież, a dopiero jej pudło (4. X) pozwala zakończyć rundę.
    await strikeOutAndLoseSteal(page);
    await endRoundAndRevealRest(page, "Przejdź do finału");

    // Próg (300) trafiony, hasFinal=true, finalQuestionsMode="pick" + 5
    // potwierdzonych pytań -> prosto do finału.
    await expect(page.locator("#c2TopbarProgress")).toContainText("Finał", { timeout: 22000 });
    await page.getByRole("button", { name: "Rozpocznij finał" }).click();

    await expect(page.locator("#c2TopbarProgress")).toContainText(/Finał\s*(—\s*)?gracz 1,\s*wpisywanie/, { timeout: 22000 });
    // Bez wpisanej odpowiedzi gracza kafel dopasowania zostaje trwale
    // disabled (ui.js's hasTyped) — ta sama luka co w drugim, pełnym teście
    // finału (linia ~846), ale tu brakowało tego kroku w ogóle.
    const p1Inputs = page.locator("#app input[type=text]");
    await expect(p1Inputs).toHaveCount(5, { timeout: 10000 });
    for (let i = 0; i < 5; i++) await p1Inputs.nth(i).fill("Odp. finałowa");
    // Start/stop zegarka gracza to teraz zaznacz->potwierdź (nieodwracalne/
    // ryzykowne kliknięcie, ui.js's finalTimerRow) — armAndConfirm jak
    // reszta kosztownych kafli finału.
    await armAndConfirm(page.getByRole("button", { name: "Rozpocznij odliczanie (15s)" }));
    // "Dalej" zablokowany, dopóki zegarek aktywnie odlicza (zgłoszone: "nie
    // czeka na koniec timera i przechodzi dalej") — zatrzymujemy legalnie,
    // przez sam kafel zegarka (wszystkie pola już wypełnione).
    await armAndConfirm(page.getByRole("button", { name: "Zatrzymaj" }));
    await page.getByRole("button", { name: "Dalej" }).click();

    for (let i = 0; i < 4; i++) {
      await expect(page.locator("#c2TopbarProgress")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 22000 });
      await armAndConfirm(page.getByRole("button", { name: "Odp. finałowa (50)" }));
      // "Pokaż odpowiedź"/"Pokaż punkty" — kafle odsłaniania (zaznacz ->
      // potwierdź, jak odpowiedzi w Rundach), nazwa stała, druga linijka to
      // żywy podgląd (aria-hidden, więc dostępna nazwa nie zawiera wartości).
      await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
      await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
      // Na i===3 suma trafia finalTarget (200) i REVEAL_POINTS (engine.js)
      // SAMO, synchronicznie w tej samej akcji, przeskakuje do f_end —
      // kafel "Pokaż punkty" znika z DOM natychmiast, zanim ten check by
      // zdążył go zobaczyć. Suma i tak jest zweryfikowana niżej ("Suma
      // finału: 200").
      if (i < 3) {
        await expect(page.getByRole("button", { name: "Pokaż punkty" })).toContainText("50", { timeout: 10000 });
        await page.getByRole("button", { name: "Dalej" }).click();
      }
    }

    await expect(page.locator(".c2-roundlayout-side")).toContainText("Osiągnięto próg finału", { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Pokaż odpowiedź" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Pokaż punkty" })).toBeDisabled();
    await page.getByRole("button", { name: "Zakończ finał", exact: true }).click();
    await expect(page.locator("#c2TopbarProgress")).toContainText("Koniec gry", { timeout: 22000 });

    // finalStatusBar (ui.js's renderFinalMapping) istnieje tylko na
    // ekranach mapowania — tu już zeszliśmy na f_end, gdzie go nie ma.
    // Realna weryfikacja sumy (200): FINISH_FINAL wtapia ją w rounds.totals
    // (bank rundy 300×1 + suma finału 200 = 500), widoczne dopiero po
    // "Zakończ grę" jako gameEndSummary (ta sama funkcja co w teście
    // "reset pojedynku...", tam już sprawdzona dla remisu).
    await page.getByRole("button", { name: "Zakończ grę", exact: true }).click();
    await expect(page.getByText("Wygrała drużyna Alfa wynikiem 500:0")).toBeVisible({ timeout: 10000 });
    // The UI renders optimistically before the final RPC is committed.
    await expect.poll(async () => (await readControl2Sessions(page, game.id))[0]?.status, { timeout: 15000 }).toBe("final");
    const earlyFinalSessions = await readControl2Sessions(page, game.id);
    expect(earlyFinalSessions).toHaveLength(1);
    expect(earlyFinalSessions[0]).toMatchObject({ status: "final", rounds_score_a: 300, team_a_score: 500, final_points: 200 });
    expect(earlyFinalSessions[0].stats_detail.end_reason).toBe("final_target");
    expect(earlyFinalSessions[0].stats_detail.prize).toBe(26500);
    expect(earlyFinalSessions[0].stats_detail.final.mapping1.filter(row => row.revealedPoints)).toHaveLength(4);
    expect(earlyFinalSessions[0].stats_detail.final.mapping2.filter(row => row.revealedPoints)).toHaveLength(0);
    await attachStatistics(testInfo, "early-final", earlyFinalSessions);
    await expect.poll(async () => (await getDisplayCalls(displayPage, "api.win.set")).at(-1)?.args[0], { timeout: 30000 }).toBe(26500);
    const finishBtn = page.getByRole("button", { name: "Wróć do moich gier" });
    await expect(finishBtn).toBeVisible({ timeout: 10000 });
    await expect(finishBtn).toBeEnabled({ timeout: 150000 });
    await finishBtn.click();
    await expect(page).toHaveURL(/\/games/, { timeout: 10000 });
    await page.waitForFunction(() => window.__sbClient, { timeout: 10000 }).catch(() => {});

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 5. physicalBuzzer + noHostTablet =====

test("control2: physicalBuzzer + noHostTablet — urządzenia pominięte, ręczny wybór drużyny", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-PHYSBUZZ-${Date.now()}`, {
    roundQuestions: [TWO_QUESTIONS[0]],
  });
  const contexts = [];
  try {
    // Wyświetlacz jest wymagany ZAWSZE — nie ma dla niego opt-outu (patrz
    // control/js/app.js's requiredOnline) — więc nawet w tym scenariuszu
    // (host+buzzer pominięte) trzeba go realnie podłączyć, inaczej "Dalej"
    // zostaje trwale zablokowane.
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    const hostPage = await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });

    // "Fizyczny przycisk" -> "Przycisk fizyczny" (ujednolicenie słownictwa,
    // translation/pl.js) -- REALNA przyczyna znalezionej w CI awarii: nie
    // obciążenie runnera (sygnatura "element is not stable"), tylko
    // locator.check() nigdy nie znajdujący ŻADNEGO elementu (pusty call log,
    // bez prób retry na konkretnym węźle) przez cały test.setTimeout, co
    // dokładnie pasuje do "selector nigdy się nie zgadza", nie "niestabilny
    // DOM".
    await page.getByLabel("Przycisk fizyczny").check();
    await page.getByLabel("Nie używaj tabletu prowadzącego").check();
    // Świadoma zmiana względem starego control.html (patrz control2.html's
    // komentarz przy .c2-devicerows .device-row[data-opted-out] .device-row-2):
    // wiersz zostaje w DOM I WIDOCZNY (nazwa/badge/checkbox), tylko kod/
    // przyciski się WYSZARZAJĄ i przestają być klikalne -- NIE znikają
    // (display:none), w odróżnieniu od jednokolumnowego control.html.
    await expect(page.locator('.device-row[data-device="buzzer"]')).toHaveAttribute("data-opted-out", "", { timeout: 10000 });
    await expect(page.locator('.device-row[data-device="host"]')).toHaveAttribute("data-opted-out", "", { timeout: 10000 });
    await expect(page.locator('.device-row[data-device="buzzer"] .device-row-2')).toHaveCSS("pointer-events", "none");
    await expect(page.locator('.device-row[data-device="host"] .device-row-2')).toHaveCSS("pointer-events", "none");

    // Zgłoszone: przycisk nieaktywnego urządzenia w topbarze ma zniknąć
    // CAŁKOWICIE (nie tylko przygasnąć) — już na kroku Urządzeń, nie
    // dopiero na Podsumowaniu. Wyświetlacz (zawsze wymagany) zostaje.
    await expect(page.locator("#dotHostRow")).toHaveClass(/\bhidden\b/, { timeout: 5000 });
    await expect(page.locator("#dotBuzzerRow")).toHaveClass(/\bhidden\b/, { timeout: 5000 });
    await expect(page.locator("#dotDisplayRow")).not.toHaveClass(/\bhidden\b/);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    // Wyszarzenie (.device-row-2 pointer-events:none) dotyczy WYŁĄCZNIE
    // samego kroku Urządzeń -- po "Dalej" cała karta Urządzeń przestaje się
    // renderować (renderDevicesStep już nie jest wywoływane), więc wiersze
    // host/buzzer znikają naprawdę (nie ma ich już w DOM), nie tylko dalej
    // wyszarzone.
    await expect(page.locator('.device-row[data-device="host"]')).toHaveCount(0);
    await expect(page.locator('.device-row[data-device="buzzer"]')).toHaveCount(0);
    // Utrzymuje się na Podsumowaniu i dalej w rozgrywce, nie tylko na
    // samym kroku Urządzeń.
    await expect(page.locator("#dotHostRow")).toHaveClass(/\bhidden\b/);
    await expect(page.locator("#dotBuzzerRow")).toHaveClass(/\bhidden\b/);
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await expect(buzzerPage.locator("#offScreen")).toBeVisible();
    await expect(buzzerPage.locator("#btnA")).toBeDisabled();
    await expect(hostPage.locator("#paperText1")).toBeEmpty();
    await expect(hostPage.locator("#paperText2")).toBeEmpty();
    await expect.poll(async () => buzzerPage.evaluate(async ({ id, key }) => {
      const { error } = await window.__sbClient.rpc("game_state_buzzer_press", { p_game_id: id, p_key: key, p_team: "A" });
      return error?.message;
    }, { id: game.id, key: game.share_key_buzzer }), { timeout: 30000 }).toBe("device_disabled");

    await expect(page.locator("#dotHostRow")).toHaveClass(/\bhidden\b/);
    await expect(page.locator("#dotBuzzerRow")).toHaveClass(/\bhidden\b/);

    // Bez Buzzera na ekranie: zaznacz -> zmień zdanie (klik drugiej drużyny,
    // bez osobnego "Anuluj") -> zaznacz->potwierdź (ten sam wspólny kafel
    // "Zatwierdź: <drużyna>" co w trybie normalnym -- ekrany identyczne,
    // tu tylko oba kafle drużyn są klikalne). Przyciski pokazują realną
    // nazwę drużyny (Alfa/Beta), nie kod "A"/"B".
    await expect(page.getByRole("button", { name: "Alfa" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Alfa" })).toBeEnabled({ timeout: 22000 });
    await page.keyboard.press("a");
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeVisible();
    await page.keyboard.press("b");
    await expect(page.getByRole("button", { name: "Zatwierdź: Beta" })).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(page.locator('[data-shortcut="1"]')).toBeEnabled();
    await page.keyboard.press("1");
    await expect(page.locator('[data-shortcut="1"]')).toHaveClass(/c2-tile-armed/);
    await page.keyboard.press("Enter"); // B trafia -> przejmuje kontrolę
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 6. "Zacznij od nowa" =====

test("control2: \"Zacznij od nowa\" w trakcie gry wraca do D0", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-RESTART-${Date.now()}`);
  const contexts = [];
  try {
    // "Dalej" wymaga WSZYSTKICH trzech urządzeń online (Wyświetlacz zawsze,
    // Prowadzący/Przycisk bez opt-outu tutaj) -- bez pełnego sparowania
    // zostaje trwale disabled, a goły .click() wisi do końca budżetu testu
    // (150s), zamiast szybko failować z jasnym powodem.
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await expect(page.locator("#c2TopbarProgress")).toContainText("Rozpoczęcie gry", { timeout: 22000 });

    await page.getByRole("button", { name: "Rozpocznij grę", exact: true }).click();
    await expect(page.getByRole("button", { name: "Rozpocznij rundę", exact: true })).toBeDisabled();
    await expect(page.locator("#btnStartOver")).toBeEnabled();
    await page.locator("#btnStartOver").click();
    // exact:true -- bez tego locator dopasowuje też przycisk "Kontakt"
    // (Playwright domyślnie dopasowuje podciąg nazwy dostępnej, a "takt"
    // w "Kontakt" zawiera "tak" jako fragment case-insensitive), co dawało
    // "strict mode violation: 2 elements match".
    await page.getByRole("button", { name: "Tak", exact: true }).click();

    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 10000 });
    await expect(displayPage.locator("#blackScreen")).toBeVisible();
    const restartedSessions = await readControl2Sessions(page, game.id);
    expect(restartedSessions).toHaveLength(1);
    expect(restartedSessions[0].status).toBe("abandoned");
    expect(restartedSessions[0].ended_at).toBeTruthy();
    expect(restartedSessions[0].stats_detail.end_reason).toBe("restart");
    await page.getByRole("button", { name: "Dalej", exact: true }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    // Readiness is not itself a new play.
    expect(await readControl2Sessions(page, game.id)).toHaveLength(1);
    await page.getByRole("button", { name: "Rozpocznij grę", exact: true }).click();
    await expect.poll(async () => (await readControl2Sessions(page, game.id)).length).toBe(2);
    const newSessions = await readControl2Sessions(page, game.id);
    expect(newSessions[1].id).not.toBe(restartedSessions[0].id);
    expect(newSessions[1].ended_at).toBeNull();
    await attachStatistics(testInfo, "restart", newSessions);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 7. Druga karta Control blokowana (resource-lock) =====

test("control2: druga karta Control na tę samą grę jest zablokowana (resource-lock, kontekst \"control\")", async ({ page, context }, testInfo) => {
  await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-LOCK-${Date.now()}`);
  try {
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    // Druga karta (ta sama sesja/konto, INNY tab_id — sessionStorage nie
    // jest dzielony między kartami) musi zobaczyć overlay blokady.
    const secondTab = await context.newPage();
    await secondTab.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(secondTab.locator("#resourceLockGuard")).toBeVisible({ timeout: 15000 });
    await expect(secondTab.locator(".stepTitle")).toHaveCount(0);
    await secondTab.close();
  } finally {
    await deleteGame(page, game.id);
  }
});

// ===== 8. QR host/buzzer niezależne na Display =====

// Przycisk "QR na wyświetlaczu"/"Ukryj QR" żyje wewnątrz `.device-row` dla
// danego urządzenia (control/js/ui.js's deviceRow()) — po każdym kliknięciu
// etykieta się przełącza, więc kolejne wywołanie tej funkcji z tym samym
// `kind` musi na nowo odnaleźć przycisk po AKTUALNEJ etykiecie (stąd `wantOn`
// — czy oczekujemy stanu "wyłączony -> włącz" czy odwrotnie), a nie polegać
// na złapanym wcześniej Locatorze.
function qrToggleBtn(page, kind, wantOn) {
  // t("control.qrOnDisplayToggle")/t("control.qrHide") — translation/pl.js:
  // "QR na wyświetlaczu" / "Schowaj QR" (NIE "Ukryj QR" — literał z
  // poprzedniej wersji tego testu nie pasował do żadnego tłumaczenia w
  // ogóle, więc ten selektor nigdy realnie nie trafiał w przycisk).
  const label = wantOn ? "QR na wyświetlaczu" : "Schowaj QR";
  return page.locator(`.device-row[data-device="${kind}"] button`, { hasText: label });
}

// Krok 1: brak QR w ogóle -> mode="BLACK" -> #qrScreen ukryty CAŁKOWICIE
// (nie samo puste .qr-grid) — control/js/app.js's syncQrDisplay() ustawia
// display.mode="QR" TYLKO gdy chociaż jedno z dwóch jest show:true, inaczej
// wraca do "BLACK". Ta asercja dowodzi, że wyłączenie OBU naraz faktycznie
// gasi cały ekran QR na Display, nie zostawia go widocznego z pustą siatką.
async function expectQrOff(displayPage) {
  await expect(displayPage.locator("#qrScreen")).toHaveClass(/hidden/, { timeout: 10000 });
}
async function expectQrSingle(displayPage, visibleKind) {
  await expect(displayPage.locator("#qrScreen")).not.toHaveClass(/hidden/, { timeout: 10000 });
  await expect(displayPage.locator(".qr-grid")).toHaveClass(/qr-single/);
  const visibleCard = visibleKind === "host" ? "#qrHostCard" : "#qrBuzzerCard";
  const hiddenCard = visibleKind === "host" ? "#qrBuzzerCard" : "#qrHostCard";
  await expect(displayPage.locator(visibleCard)).not.toHaveClass(/hidden/);
  await expect(displayPage.locator(hiddenCard)).toHaveClass(/hidden/);
}
async function expectQrBoth(displayPage) {
  await expect(displayPage.locator("#qrScreen")).not.toHaveClass(/hidden/, { timeout: 10000 });
  await expect(displayPage.locator(".qr-grid")).not.toHaveClass(/qr-single/);
  await expect(displayPage.locator("#qrHostCard")).not.toHaveClass(/hidden/);
  await expect(displayPage.locator("#qrBuzzerCard")).not.toHaveClass(/hidden/);
}

test("control2: QR na wyświetlaczu — host i buzzer niezależne, każdy z osobna i oba naraz", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-DUALQR-${Date.now()}`);
  const contexts = [];
  try {
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    // Stan początkowy: żaden QR nie jest jeszcze pokazany.
    await expectQrOff(displayPage);

    // ===== Sam host: włącz -> sprawdź -> wyłącz -> sprawdź powrót do BLACK =====
    await qrToggleBtn(page, "host", true).click();
    await expectQrSingle(displayPage, "host");
    await qrToggleBtn(page, "host", false).click();
    await expectQrOff(displayPage);

    // ===== Sam buzzer: włącz -> sprawdź -> wyłącz -> sprawdź powrót do BLACK =====
    await qrToggleBtn(page, "buzzer", true).click();
    await expectQrSingle(displayPage, "buzzer");
    await qrToggleBtn(page, "buzzer", false).click();
    await expectQrOff(displayPage);

    // ===== Oba naraz: host, potem buzzer -> siatka podwójna (nie qr-single) =====
    await qrToggleBtn(page, "host", true).click();
    await expectQrSingle(displayPage, "host");
    await qrToggleBtn(page, "buzzer", true).click();
    await expectQrBoth(displayPage);

    // Wyłączenie JEDNEGO z dwóch wraca do pojedynczego układu (drugi zostaje).
    await qrToggleBtn(page, "host", false).click();
    await expectQrSingle(displayPage, "buzzer");

    // Dołożenie hosta z powrotem -> znów oba naraz (kolejność włączenia
    // odwrotna niż za pierwszym razem — dowód, że to naprawdę niezależne
    // flagi, nie sekwencja/kolejka).
    await qrToggleBtn(page, "host", true).click();
    await expectQrBoth(displayPage);

    // Wyłączenie OBU (buzzer, potem host) -> z powrotem całkowicie ukryty ekran QR.
    await qrToggleBtn(page, "buzzer", false).click();
    await expectQrSingle(displayPage, "host");
    await qrToggleBtn(page, "host", false).click();
    await expectQrOff(displayPage);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 9. Finał bez wczesnego wyjścia: obaj gracze, wszystkie 10 pytań =====
//
// Odwrotność testu 4 (który celowo pomija gracza 2). Punkty dobrane tak, że
// suma finału NIGDY nie osiąga finalTarget (200) nawet po 10 trafieniach
// (5×15 + 4×15 = 135, jedno pytanie gracza 2 to "powtórzenie" = 0 pkt) —
// gwarantuje przejście przez KAŻDY krok F1-F10, w tym ten, którego dotyczyła
// dzisiejsza naprawa: odpowiedzi gracza 1 muszą wrócić widoczne na Display
// w momencie startu rundy 2. Host NIE — ustalona zasada dla całego Control:
// zasłonięcie jest jednokierunkowe (silnik sam nigdy nie odsłania, tylko
// lokalny "peek" operatora), więc Host zostaje zasłonięty przez cały finał.

test("control2: finał — obaj gracze, wszystkie 10 pytań, naturalne wygaśnięcie timera, powtórzenie, odsłonięcie P1 na Display przy starcie P2", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  // 180s okazało się za ciasne w CI: 15s realnego oczekiwania na timer
  // gracza 1 + 10 pytań mapowania, z których KAŻDE ma teraz poprawnie
  // wymuszaną blokadę na długość dźwięku "Pokaż odpowiedź"/"Pokaż punkty"
  // (actionGate.js, migracja 264) -- test realnie docierał do pytania 8/10
  // dokładnie w 180000ms, bez żadnego faktycznego zawieszenia (potwierdzone
  // diagnostyką [e2e-diag-state]: każdy commit/lock w całym przebiegu
  // rozstrzygał się w <1s). Zapas, nie naprawa buga.
  test.setTimeout(240_000);
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-FINALFULL-${Date.now()}`, {
    roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odp. warta 300", fixed_points: 100 }] }],
    finalAnswerPts: 15,
    settings: { game: { advanced: { endScreenMode: "money", roundMultipliers: [3] } } },
  });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    const hostPage = await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", errors);

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    // ===== Runda jedyna: A wygrywa próg finału (300 pkt) =====
    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await page.keyboard.press("c");
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toHaveClass(/c2-tile-armed/);
    await page.keyboard.press("Enter");
    await settleAfterWrite(page);
    await revealAnswer(page, 1);
    await strikeOutAndLoseSteal(page);
    await endRoundAndRevealRest(page, "Przejdź do finału");
    await expect(page.locator("#c2TopbarProgress")).toContainText("Finał", { timeout: 22000 });

    // ===== F1: start finału =====
    await clearSfxLog(page);
    await clearDisplayLog(displayPage);
    await page.getByRole("button", { name: "Rozpocznij finał" }).click();
    // final_theme -> reveal, sekwencyjnie (soundReactor.js's playSequentialCombo).
    await waitForSfxSequence(page, ["final_theme", "reveal"], 15000);
    // Wskaźnik na zwycięzcy (A) i zapowiedź "15" na jego stronie (dzisiejsza naprawa) —
    // obie rzeczy widoczne w tym samym zestawie wywołań co narysowanie planszy finału.
    await expect.poll(async () => {
      const calls = await getDisplayCalls(displayPage);
      return calls.some((c) => c.call === "api.indicator.set" && c.args[0] === "ON_A")
        && calls.some((c) => c.call === "api.small.rightDigits" && c.args[0] === "15");
    }, { timeout: 10000 }).toBe(true);
    await expect(hostPage.locator("#cover2")).toHaveClass(/coverOn/, { timeout: 10000 });

    // ===== F2/F3: gracz 1 wpisuje, timer wygasa NATURALNIE (bez klikania "Dalej") =====
    await expect(page.locator("#c2TopbarProgress")).toContainText(/Finał\s*(—\s*)?gracz 1,\s*wpisywanie/, { timeout: 22000 });
    const p1Inputs = page.locator("#app input[type=text]");
    await expect(p1Inputs).toHaveCount(5, { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Dalej", exact: true })).toBeDisabled();
    await p1Inputs.nth(0).evaluate((input) => { window.__entryInputBefore = input; window.__entryTimerBefore = document.querySelector(".c2-timer-row"); });
    for (let i = 0; i < 5; i++) await p1Inputs.nth(i).fill(`Odp. finałowa`);
    await expect.poll(() => page.evaluate(() => window.__entryInputBefore === document.querySelector(".c2-entryrow input") && window.__entryTimerBefore === document.querySelector(".c2-timer-row"))).toBe(true);

    await clearSfxLog(page);
    // Start zegarka to zaznacz->potwierdź (nieodwracalne — usedP1 jednorazowe).
    await p1Inputs.nth(0).focus();
    await page.keyboard.press("Control+Enter");
    await expect(page.locator('[data-timer-role="final"]')).toBeVisible();
    // Bez klikania niczego: dograny dziś zegarek w control/js/app.js sam
    // dispatch'uje EXPIRE_TIMER po 15s. Zegarek jest jednorazowy (usedP1) —
    // kafel wraca WIDOCZNY (jak w starym Control), ale pokazuje "Czas
    // wykorzystany" i jest ZABLOKOWANY, bo nie da się go odpalić drugi raz
    // w tej samej rundzie.
    await expect(page.getByRole("button", { name: "Czas wykorzystany" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "Czas wykorzystany" })).toBeDisabled();
    await expect.poll(() => getSfxKeys(page), { timeout: 5000 }).toEqual(expect.arrayContaining(["time_over"]));

    // ===== F4/F5: mapowanie gracza 1 — trafienie wszystkich 5x15 pkt =====
    await page.getByRole("button", { name: "Dalej" }).click();
    for (let i = 0; i < 5; i++) {
      await expect(page.locator("#c2TopbarProgress")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 22000 });
      if (i === 0) {
        await expectMappingFieldFits(page, testInfo, "p1");
        const field = page.locator(".c2-mapinput input");
        await field.fill("");
        await expect(page.getByRole("button", { name: "Odp. finałowa (15)" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Nie ma na liście (0 pkt)" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Brak odpowiedzi", exact: true })).toBeEnabled();
        await field.fill("Odp. finałowa");
        await expect(page.getByRole("button", { name: "Brak odpowiedzi", exact: true })).toBeDisabled();
      }
      // Zgłoszone: wybór dopasowania w finale też idzie przez zaznacz ->
      // potwierdź (armableTile), jak reszta konsekwentnych kafli.
      await p1Inputs.first().evaluate(() => document.activeElement?.blur());
      // Klawisz podczas przejścia planszy ma być ignorowany; poczekaj na
      // faktyczne odblokowanie kafla, zamiast wyprzedzać dźwięk testem.
      await expect(page.locator('[data-shortcut="1"]')).toBeEnabled({ timeout: 22000 });
      await page.keyboard.press("1");
      await expect(page.locator('[data-shortcut="1"]')).toHaveClass(/c2-tile-primary/);
      if (i === 0) {
        await expect(hostPage.locator("#paperText2 .hostGreen:not(.hostStrike)")).toHaveText("z listy");
        await expect(hostPage.locator("#paperText2 .hostStrike")).toHaveText("Odp. finałowa (15)");
      }
      await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
      await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
      // Suma widoczna na ekranie mapowania (ui.js's finalStatusBar) —
      // sprawdzona TU, na ostatnim pytaniu, PRZED "Dalej", bo ten klik
      // (NEXT_QUESTION, nextIdx>5) już przenosi na f_p2_start, gdzie tego
      // statusbara nie ma.
      if (i === 4) await expect(page.getByText("Suma finału: 75")).toBeVisible({ timeout: 10000 });
      await page.getByRole("button", { name: "Dalej" }).click();
    }
    // Suma 75 < finalTarget (200) — BEZ wczesnego wyjścia, prosto do F6.

    // ===== F6: przejście do gracza 2 — TU jest sedno testu =====
    await expect(page.locator("#c2TopbarProgress")).toContainText("Finał — start rundy 2", { timeout: 22000 });
    await clearDisplayLog(displayPage);
    await page.getByRole("button", { name: "Rozpocznij 2 rundę" }).click();

    // Display: odpowiedzi gracza 1 wracają odsłonięte (animIn), NIE placeholder.
    await expect.poll(async () => {
      const calls = await getDisplayCalls(displayPage, "api.final.setHalf");
      const last = calls.at(-1);
      return !!last
        && last.args[0] === "A"
        && !!last.args[1].animIn
        && last.args[1].rows.every((r) => r.left === "Odp. finałowa" && r.a === "15");
    }, { timeout: 10000 }).toBe(true);
    // Host NIE odsłania się tutaj — ustalona zasada dla całego Control
    // (nie tylko finału): zasłonięcie wrażliwej treści jest jednokierunkowe,
    // silnik nigdy sam jej nie zdejmuje (state.host.covered ustawiane na
    // true raz, w START_FINAL, i nigdy z powrotem na false w engine.js).
    // Jedyny sposób odsłonięcia to lokalny, nieprzechowywany w game_state
    // gest "peek" operatora na urządzeniu Hosta.
    await expect(hostPage.locator("#cover2")).toHaveClass(/coverOn/, { timeout: 10000 });

    // Formalna asercja samego gestu "peek" (dotąd demonstrowana TYLKO w
    // tests/e2e/record-playthrough.js, bez pokrycia w tym pliku, zgłoszone):
    // Host odsłania się lokalnie po geście, BEZ żadnej zmiany w game_state
    // (host/js/render.js's `peeked`), i zasłona wraca sama przy KOLEJNEJ
    // zmianie stanu gry (nie trzeba nic specjalnie robić, żeby ją przywrócić).
    //
    // ZNALEZIONY PRZY OKAZJI REALNY BUG (nie tylko testu -- diagnostyka
    // pokazała klasę #cover2 nigdy się nie zmieniającą po geście):
    // host/js/main.js's setupPeekSwipe wołało
    // `renderer.setPeek(!renderer.isCovered())`. isCovered() = authoritative
    // Covered && !peeked -- na starcie gestu (zasłonięte, peeked=false)
    // isCovered() JUŻ zwraca true, więc !isCovered()=false -> setPeek(false)
    // -> peeked zostawało false, bez żadnej zmiany. Gest nigdy nie mógł
    // zadziałać za pierwszym razem w DOKŁADNIE tej sytuacji, w której
    // operator chce go użyć. Naprawione: setPeek(!isPeeked()) -- przełącza
    // WŁASNY stan, nie wypadkową dwóch zmiennych.
    await hostPeekSwipe(hostPage);
    await expect(hostPage.locator("#cover2")).toHaveClass(/coverOff/, { timeout: 5000 });

    // ===== F7: gracz 2 — pytanie #1 oznaczone jako "powtórzenie" =====
    await expect(page.locator("#c2TopbarProgress")).toContainText("Finał — gracz 2, wpisywanie", { timeout: 22000 });
    await clearSfxLog(page);
    // "Powtórzenie" WŁĄCZANE jest teraz zaznacz->potwierdź (konsekwentne:
    // dźwięk + wymuszony SKIP w mapowaniu, ui.js) -- jak reszta kosztownych
    // kafli finału. Wyłączenie zostaje jednoklikowe (bezpieczne, bez efektu
    // ubocznego), ale tu włączamy, więc armAndConfirm.
    await page.getByRole("button", { name: "Powtórzenie" }).first().click();
    await expect.poll(() => getSfxKeys(page), { timeout: 5000 }).toEqual(expect.arrayContaining(["answer_repeat"]));
    // Zasłona wraca SAMA przy tej pierwszej kolejnej zmianie stanu gry po
    // peeku wyżej — bez żadnej dodatkowej akcji operatora na Hoście.
    await expect(hostPage.locator("#cover2")).toHaveClass(/coverOn/, { timeout: 10000 });

    const p2Inputs = page.locator("#app input[type=text]");
    for (const viewport of [{ width:1366, height:768 }, { width:1920, height:1080 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.locator(".c2-gameplay-body").evaluate(el => el.scrollHeight <= el.clientHeight + 2)).toBe(true);
    }
    await page.setViewportSize({ width:1366, height:768 });
    const repeatFirst = page.locator(".c2-entryrow .c2-btn-repeat").first();
    await expect(repeatFirst).toHaveClass(/\bon\b/);
    await expect(repeatFirst).toBeEnabled();
    await clearSfxLog(page);
    await repeatFirst.click();
    await expect(repeatFirst).toHaveClass(/\bon\b/);
    await expect.poll(() => getSfxKeys(page)).toEqual(expect.arrayContaining(["answer_repeat"]));
    await expect(p2Inputs.nth(0)).toBeEnabled();
    await p2Inputs.nth(0).focus();
    await expect(repeatFirst).toHaveClass(/\bon\b/);
    await p2Inputs.nth(0).evaluate(() => { window.__repeatButtonBefore = document.querySelector(".c2-btn-repeat"); });
    await p2Inputs.nth(0).fill("Inna odpowiedź");
    await expect.poll(() => page.evaluate(() => window.__repeatButtonBefore === document.querySelector(".c2-btn-repeat"))).toBe(true);
    await expect(repeatFirst).not.toHaveClass(/\bon\b/);
    await expect(repeatFirst).toBeDisabled();
    await p2Inputs.nth(0).fill("");
    await page.getByRole("button", { name: "Powtórzenie" }).first().click();
    for (let i = 1; i < 5; i++) await p2Inputs.nth(i).fill("Odp. finałowa");
    // Start/stop zegarka to zaznacz->potwierdź (patrz wyżej).
    await armAndConfirm(page.getByRole("button", { name: "Rozpocznij odliczanie (20s)" }));
    // Zgłoszone: "po drugiej rundzie finału nawet nie czeka na koniec
    // timera i przechodzi dalej" — "Dalej" jest teraz zablokowany, dopóki
    // zegarek TEJ rundy aktywnie odlicza (control/js/ui.js's
    // renderFinalEntry) — nie da się już przerwać go tym przyciskiem.
    // Zatrzymujemy więc legalnie, przez sam kafel zegarka (wszystkie pola
    // gracza 2 już wypełnione/oznaczone powtórzeniem, więc wczesne
    // zatrzymanie jest dozwolone — finalTimerRow), zamiast czekać pełne 20s.
    // START_MAPPING (engine.js) nadal bezwarunkowo zeruje stan zegarka przy
    // wejściu w mapowanie — to sprawdzenie zostaje, tylko dochodzi się tam
    // teraz legalną ścieżką, nie przypadkowym przerwaniem w trakcie.
    await expect(page.getByRole("button", { name: "Zatrzymaj" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Czas wykorzystany" })).toBeVisible({ timeout: 25000 });
    await page.getByRole("button", { name: "Dalej" }).click();

    // ===== F8/F9: mapowanie gracza 2 — pytanie #1 to SKIP (powtórzenie), reszta MATCH =====
    for (let i = 0; i < 5; i++) {
      if (i === 0) {
        await expectMappingFieldFits(page, testInfo, "p2");
        await expect(page.getByRole("button", { name: "Odp. finałowa (15)" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Nie ma na liście (0 pkt)" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Brak odpowiedzi", exact: true })).toBeEnabled();
        await expect(page.getByRole("button", { name: "Powtórzenie", exact: true })).toBeEnabled();
      }
      await expect(page.locator("#c2TopbarProgress")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 22000 });
      if (i > 0) await armAndConfirm(page.getByRole("button", { name: "Odp. finałowa (15)" }));
      await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
      // C2-14 (engine.js's REVEAL_ANSWER_ONLY): dla kind!=MATCH (tu i=0,
      // "powtórzenie" -> SKIP) ten sam klik od razu dogrywa REVEAL_POINTS --
      // "Pokaż punkty" zostaje trwale wyszarzone (nie ma czego potwierdzać),
      // więc dla i=0 go NIE klikamy, inaczej armAndConfirm czeka w kółko na
      // przycisk, który nigdy się nie odblokuje.
      if (i > 0) await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
      if (i < 4) await page.getByRole("button", { name: "Dalej" }).click();
    }
    // 75 (gracz 1) + 0 (powtórzenie) + 4x15 (gracz 2) = 135 < 200 — pełne 10/10, bez wczesnego wyjścia.
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Zakończ finał", exact: true }).click();
    await expect(page.locator("#c2TopbarProgress")).toContainText("Koniec gry", { timeout: 22000 });
    await expect(page.getByText("Suma finału: 135")).toBeVisible({ timeout: 10000 });

    // Najpierw kończy się przejście wyniku; dopiero potem liczymy dźwięki outro.
    await expect(page.getByRole("button", { name: "Zakończ grę", exact: true })).toBeEnabled({ timeout: 30000 });
    await waitForSfxKeysAnyOrder(page, ["final_theme", "reveal"], 10000);
    // ===== F10: koniec finału =====
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Zakończ grę", exact: true }).click();
    await waitForSfxKeysAnyOrder(page, ["show_outro"], 15000);
    expect(await getSfxKeys(page)).not.toContain("round_transition");
    expect(await getSfxKeys(page)).not.toContain("reveal");
    await expect.poll(async () => (await getDisplayCalls(displayPage, "api.win.set")).at(-1)?.args[0], { timeout: 15000 }).toBe(1305);
    const finalSessions = await readControl2Sessions(page, game.id);
    expect(finalSessions).toHaveLength(1);
    expect(finalSessions[0]).toMatchObject({ status: "final", final_points: 135 });
    expect(finalSessions[0].team_a_score - finalSessions[0].rounds_score_a).toBe(135);
    expect(finalSessions[0].stats_detail.final.mapping1).toHaveLength(5);
    expect(finalSessions[0].stats_detail.final.mapping2).toHaveLength(5);
    expect(finalSessions[0].stats_detail.end_reason).toBe("final_complete");
    expect(finalSessions[0].stats_detail.prize).toBe(1305);
    await attachStatistics(testInfo, "full-final", finalSessions);
    await expect.poll(async () => {
      const calls = await getDisplayCalls(displayPage, "api.indicator.set");
      return calls.at(-1)?.args[0] === "ON_A";
    }, { timeout: 10000 }).toBe(true);

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 10. Mnożnik rundy =====

test("control2: mnożnik rundy — runda 4. z domyślnym ×2 faktycznie przemnaża bank", async ({ page, browser }, testInfo) => {
  // Ten sam wzorzec i przyczyna co przy teście "pełny finał" (patrz
  // komentarz przy jego test.setTimeout(240_000) wyżej w tym pliku) --
  // zdiagnozowane 1:1 z logów [e2e-diag-state] CI (run #299/#300, oba
  // solo I w pełnym zestawie): 4 pełne rundy x ~30-35s realnego czasu
  // (gate dźwięku/animacji + polling anon zamiast prawdziwego push +
  // RTT do produkcyjnego Supabase) to legalnie ~120-140s SAMEJ rozgrywki,
  // zanim test w ogóle dotrze do rundy 4 -- bez żadnego faktycznego
  // zawieszenia (każdy commit/lock w logach rozstrzygał się w <1s,
  // zero luk >8s w całym przebiegu). Domyślne 150_000ms z góry pliku to
  // za ciasny margines na tę długość testu, nie błąd aplikacji. Zapas,
  // nie naprawa buga.
  test.setTimeout(240_000);
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const roundQ = (n) => ({ ord: n, text: `Pytanie rundowe ${n}`, answers: [{ ord: 1, text: "Jedyna odpowiedź", fixed_points: 40 }] });
  // 5. pytanie (nieużywane) tylko po to, żeby pula NIE wyczerpała się po
  // rundzie 4 -- z dokładnie 4 pytaniami R9's gałąź ③ ("pula wyczerpana")
  // przenosiła grę PROSTO do r_gameEnd zaraz po "Zakończ rundę", zanim
  // asercja "Alfa: 200" zdążyła cokolwiek sprawdzić -- na tym ekranie nie
  // ma już paska statusu z wynikiem drużyn wcale (inny render, patrz
  // ui.js's renderEndScreen). Silnik liczył mnożnik CAŁKOWICIE poprawnie
  // przez cały czas (potwierdzone diagnostyką [e2e-diag-state] na żywo:
  // totals.A=200 dokładnie w momencie przejścia step -> r_gameEnd) -- to
  // był test sprawdzający złą rzecz w złym momencie, nie bug aplikacji.
  const game = await makeGame(page, `E2E-CONTROL2-MULTIPLIER-${Date.now()}`, {
    roundQuestions: [roundQ(1), roundQ(2), roundQ(3), roundQ(4), roundQ(5)],
  });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();

    // Rundy 1-3: mnożnik x1 (domyślne roundMultipliers [1,1,1,2,3]) — A wygrywa za każdym razem, bank 40.
    for (let round = 1; round <= 3; round++) {
      await expect(page.locator("#c2TopbarProgress")).toContainText(`Runda ${round}`, { timeout: 22000 });
      await startRoundConfirmed(page);
      await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 60000 });
      await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
      await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
      await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
      await revealAnswer(page, 1);
      await strikeOutAndLoseSteal(page);
      await endRoundAndRevealRest(page, "Przejdź do następnej rundy");
    }
    await expect(page.getByText("Alfa: 120")).toBeVisible({ timeout: 10000 });

    // Runda 4: mnożnik x2 — bank 40 ma dać +80, nie +40.
    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 4", { timeout: 22000 });
    await startRoundConfirmed(page);
    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 60000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await revealAnswer(page, 1);
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });
    await strikeOutAndLoseSteal(page);
    await endRoundAndRevealRest(page, "Przejdź do następnej rundy");

    await expect(page.getByText("Alfa: 200")).toBeVisible({ timeout: 10000 }); // 120 + 40x2, nie 160
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 11. Wyścig dwóch przycisków Buzzera =====

test("control2: wyścig — oba przyciski Buzzera naciśnięte w tej samej chwili, tylko jeden zaakceptowany", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-BUZZRACE-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    // Oba kliknięcia wystrzelone w tym samym ticku JS — dwa równoległe
    // wywołania game_state_buzzer_press ścigające się o ten sam wiersz
    // (plan, sekcja 1: atomowy warunkowy UPDATE, nie wyścig po stronie klienta).
    await buzzerPage.evaluate(() => {
      document.getElementById("btnA")?.click();
      document.getElementById("btnB")?.click();
    });

    // renderDuelAccept() pokazuje TERAZ jeden wspólny kafel "Zatwierdź:
    // <drużyna>", z nazwą tego, kto naprawdę wygrał wyścig (duel.lastPressed)
    // — tylko ten jeden kafel w ogóle istnieje w DOM. Trzeba odtworzyć literę
    // drużyny z nazwy, żeby wskazać właściwy #btnA/#btnB na stronie Buzzera.
    const acceptAlfa = page.getByRole("button", { name: "Zatwierdź: Alfa" });
    const acceptBeta = page.getByRole("button", { name: "Zatwierdź: Beta" });
    await expect.poll(async () => (await acceptAlfa.count()) + (await acceptBeta.count()), { timeout: 10000 }).toBeGreaterThan(0);
    const winner = (await acceptAlfa.count()) > 0 ? "A" : "B";
    const loser = winner === "A" ? "B" : "A";
    const winnerName = winner === "A" ? "Alfa" : "Beta";

    // buzzer/js/render.js's deriveButtonState czyta duel.firstTeam, nie
    // duel.lastPressed — a firstTeam ustawia dopiero ACCEPT_BUZZ (Control
    // klika "Zatwierdź: X"). Bez tego kliknięcia Buzzer zostaje w STATE.ON
    // (oba przyciski "dim") na zawsze — trzeba faktycznie przyjąć zgłoszenie,
    // zanim sprawdzimy, który przycisk się zaświecił.
    await armAndConfirm(page.getByRole("button", { name: `Zatwierdź: ${winnerName}` }));

    // Buzzer i Control muszą się zgadzać co do tego, KTO wygrał wyścig.
    await expect(buzzerPage.locator(`#btn${winner}`)).toHaveClass(/lit/, { timeout: 10000 });
    await expect(buzzerPage.locator(`#btn${loser}`)).toHaveClass(/dim/, { timeout: 10000 });
    await expect(buzzerPage.locator(`#btn${winner}`)).not.toHaveClass(/dim/);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 11b. Ponów naciśnięcie (RETRY_DUEL) =====

test("control2: Ponów naciśnięcie — odrzuca błędne zgłoszenie, Buzzer otwiera się na nowo", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-RETRYDUEL-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    // A naciska pierwszy -- Control pokazuje wspólny kafel "Zatwierdź: Alfa"
    // RAZEM z "Ponów naciśnięcie" pod nim (renderDuelAccept, tryb normalny
    // Buzzera) -- operator może albo przyjąć zgłoszenie, albo uznać je za
    // błędne/przypadkowe i otworzyć Buzzer na nowo.
    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Ponów naciśnięcie" })).toBeVisible();

    // "Ponów naciśnięcie" to bezpieczna, odwracalna akcja (RETRY_DUEL) --
    // celowo jednoklikowa, w odróżnieniu od "Zatwierdź" (zaznacz->potwierdź).
    await clickConfirmed(page.getByRole("button", { name: "Ponów naciśnięcie" }));

    // RETRY_DUEL czyści duel.lastPressed -- oba kafle (Zatwierdź/Ponów)
    // znikają, drużyny wracają do czystego, nieklikalnego stanu wskaźnika.
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ponów naciśnięcie" })).toHaveCount(0);

    // Teraz zgłasza się B -- przyjmujemy normalnie, dowód że Buzzer
    // naprawdę wrócił do nasłuchu po "Ponów naciśnięcie", nie tylko
    // wizualnie na ekranie Control.
    await buzzerPage.getByRole("button", { name: "Przycisk B" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Beta" })).toBeVisible({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Beta" }));

    await revealAnswer(page, 1); // B trafia -> przejmuje kontrolę
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 12. Wyciszenie dźwięku =====

test("control2: wyciszenie dźwięku — po Mute żaden klucz SFX się nie odtwarza", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-MUTE-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();

    // Referencja: BEZ wyciszenia start rundy gra normalnie. Czekamy na CAŁY
    // combo (soundCueEngine.js's playSyncedCombo: "reveal", jako krótszy
    // dźwięk, leci z setTimeout PO "round_transition") — inaczej ten
    // opóźniony "reveal" wystrzeliłby dopiero PO włączeniu Mute niżej,
    // fałszywie wyglądając jak wyciek dźwięku mimo wyciszenia.
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await waitForSfxKeysAnyOrder(page, ["round_transition", "reveal"], 10000);

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await page.keyboard.press("m");
    await expect(page.locator("#btnMute .ico-speaker-off")).toHaveCount(1);

    await clearSfxLog(page);
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await revealAnswer(page, 1); // normalnie: buzzer_press + answer_correct
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });

    expect(await getSfxKeys(page), "wyciszenie ma zablokować KAŻDY dźwięk, nie tylko część").toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 12b. Dźwięk ze źródła Wyświetlacz: odblokowanie, głośność, mute =====
//
// Zgłoszone: "dodaj testy... jeden test niech używa dźwięku z display i tez
// sprawdź mute na chwilę w jednej z rund np. i pokrec głośności" — i po
// doprecyzowaniu: "suwaki w ustawieniach a suwaki w podsumowaniu to różne
// rzeczy". Przechodzi przez CAŁĄ ścieżkę na raz: przełącznik "Dźwięk" w
// kroku Urządzeń -> #audioUnlockScreen na Display (musi się pojawić,
// kliknięcie musi je schować) -> DWA różne suwaki, dwie różne kategorie
// dźwięku (żeby nie dało się ich pomylić w asercjach): (a) modal "Zmień
// ustawienia" -> games.settings.sound jako punkt wyjściowy, denormalizacja
// do game_state dopiero po zamknięciu modala; (b) suwak BEZPOŚREDNIO w
// sekcji "Dźwięk" Podsumowania (control/js/ui.js's soundSummarySection)
// -> zapis prosto do game_state na żywo, bez modala. Oba muszą dotrzeć do
// Display (nie do Control — sprawdzone osobno, że Control zostaje cicho
// przez cały czas) -> Mute (współdzielony, patrz control/js/soundReactor.js)
// wyciszony na chwilę w środku rundy, potem wznowiony — ten sam #btnMute co
// w teście "wyciszenie dźwięku" wyżej, tylko że tym razem wycisza
// urządzenie, które FAKTYCZNIE gra (Display).

test("control2: dźwięk ze źródła Wyświetlacz — odblokowanie, głośność z ustawień, chwilowe mute w rundzie", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-SOUNDSRC-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    let displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });

    // Domyślnym źródłem jest Control, więc Display nie prosi o odblokowanie.
    await expect(displayPage.locator("#audioUnlockScreen")).toBeHidden();
    const nextStep = page.getByRole("button", { name: "Dalej" });
    await expect(nextStep).toBeEnabled({ timeout: 10000 });

    // Przełącznik dwustanowy (.toggle-group, jak "Losowo"/"Wybierz" w
    // ustawieniach gry) — widoczny tekst opcji to CSS content:attr(data-text)
    // na ::before, niewidoczny dla getByLabel/getByText; klikamy widoczną
    // etykietę .toggle-item po wartości ukrytego radio, ten sam wzorzec co
    // game-settings.spec.js's analogiczne przełączniki.
    await page.locator('.toggle-item:has(input[name="soundSource"][value="display"])').click();
    const devicesFitAfterAudioSwitch = await page.locator(".c2-devices-layout .c2-scroll-area").evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
    expect(devicesFitAfterAudioSwitch, "włączenie dźwięku z Wyświetlacza nie powinno dodawać przewijania na normalnym ekranie").toBe(true);
    await expect(displayPage.locator("#audioUnlockScreen")).not.toHaveClass(/\bhidden\b/, { timeout: 10000 });
    await expect(nextStep).toBeDisabled({ timeout: 10000 });
    await displayPage.locator("#btnAudioUnlock").click();
    await expect(displayPage.locator("#audioUnlockScreen")).toHaveClass(/\bhidden\b/);
    await expect(nextStep).toBeEnabled({ timeout: 10000 });

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });

    // Dwa RÓŻNE mechanizmy, dwie różne kategorie dźwięku, żeby nie dało się
    // ich pomylić w asercjach:
    //
    // (a) Modal "Zmień ustawienia" -> games.settings.sound -> denormalizacja
    //     do game_state DOPIERO po zamknięciu modala (onGsModalClose() w
    //     control/js/app.js). To jest "punkt wyjściowy" — trwały, per-gra
    //     domyślny zapis, edytowalny tylko tam (warianty/pliki własne też).
    //
    // (b) Suwak BEZPOŚREDNIO w sekcji "Dźwięk" Podsumowania
    //     (control/js/ui.js's soundSummarySection) -> zapis PROSTO do
    //     game_state ("settings.setSoundVolume" w app.js), NA ŻYWO, bez
    //     dotykania games.settings i bez otwierania modala w ogóle.
    //
    // Zgłoszone wprost: to są różne rzeczy, oba mają działać i oba mają być
    // przetestowane osobno — modal zmienia "round_transition", Podsumowanie
    // zmienia "reveal", więc każda asercja wiąże się jednoznacznie z jednym
    // z dwóch mechanizmów.

    // (a) games.settings jako punkt wyjściowy — modal ustawień.
    await page.getByRole("button", { name: "Zmień ustawienia" }).click();
    await expect(page.locator("#gsOverlay")).not.toHaveClass(/hidden/, { timeout: 5000 });
    const gsFrame = page.frameLocator("#gsFrame");
    // Poczekaj, aż async inicjalizacja modala (js/pages/game-settings.js's
    // główna funkcja init -- await requireAuth()/guardResourceLock()/
    // guardResourceBusy(), realnie 0.5-1s RPC-ów) faktycznie się skończy,
    // ZANIM zaczniemy klikać po sidebarze. #gsTeamA staje się widoczny
    // dopiero jako efekt setActiveCat("teams") na samym końcu tego łańcucha
    // -- to ten sam, już sprawdzony wzorzec co w teście "modal ustawień
    // gry" niżej. Bez tego kliknięcie kategorii "sound" potrafiło trafić w
    // to samo okno wyścigu co #btnToggleSidebar (naprawione w poprzednim
    // commicie): sidebar?.addEventListener("click", ...setActiveCat...) w
    // js/pages/game-settings.js jest wpięty dopiero w tym łańcuchu, więc
    // klik na ".gs-sidebar-item[data-cat=sound]" trafiający przed jego
    // zakończeniem był no-opem -- renderSound() nigdy się nie wykonywał
    // (diagnostyka .evaluate() potwierdziła: #gsContentInner zostawał z
    // nietkniętym placeholderem "<!-- rendered by JS -->" z markupu).
    await expect(gsFrame.locator("#gsTeamA")).toBeVisible({ timeout: 10000 });
    // W trybie modal (iframe z control2) sidebar startuje jako schowany
    // drawer (css/game-settings.css's .gs-modal-mode .gs-sidebar — domyślnie
    // display:none, otwierany dopiero po kliknięciu ☰ #btnToggleSidebar,
    // patrz js/pages/game-settings.js's openSidebar()) — bez tego kliknięcia
    // .gs-sidebar-item istnieje w DOM, ale nie jest "visible" dla Playwrighta.
    await gsFrame.locator("#btnToggleSidebar").click();
    await gsFrame.locator('.gs-sidebar-item[data-cat="sound"]').click();
    const transitionSlider = gsFrame.locator('input.sfx-vol[data-sfx-vol="round_transition"]');
    await expect(transitionSlider).toBeVisible({ timeout: 10000 });
    // .fill() na <input type="range"> nie zawsze niezawodnie odpala "input"
    // (na czym wisi handler ustawiający localSettings.sound.volumes w
    // js/pages/game-settings.js) — ustawiamy value i wysyłamy zdarzenie
    // wprost.
    await transitionSlider.evaluate((el) => {
      el.value = "70";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const btnSaveAll = gsFrame.getByRole("button", { name: "Zapisz wszystko" });
    await btnSaveAll.click();
    // saveAll() (js/pages/game-settings.js) jest asynchroniczny (realny
    // zapis do bazy) i czyści isDirty dopiero PO zakończeniu -- klik na tło
    // modala (niżej) trafiający przed tym momentem widzi isDirty=true i
    // tryClose() pokazuje confirmModal() "Masz niezapisane zmiany", którego
    // nic tu nie obsługuje -- modal wisi w nieskończoność, #gsOverlay nigdy
    // nie znika. Root cause znaleziony diagnostyką console.warn() w
    // tryClose(): btnSaveAll.disabled szedł na `true` DOPIERO tuż przed
    // realnym zapisem, PO dwóch wcześniejszych, nieblokujących wizualnie
    // zapytaniach sieciowych (loadQuestions()/getSfxCustomFiles()) -- więc
    // to `await expect(...).toBeEnabled()` przechodziło natychmiast (bo
    // przycisk nigdy nie zdążył się jeszcze wyłączyć), zanim zapis w ogóle
    // się zaczął. Naprawione w saveAll(): `disabled=true` jest teraz
    // pierwszą instrukcją funkcji, więc "enabled" na powrót jest już
    // niezawodnym sygnałem zakończenia całego try/finally.
    await expect(btnSaveAll).toBeEnabled({ timeout: 10000 });
    await page.locator("#gsOverlay").click({ position: { x: 5, y: 5 } });
    await page.locator("#gsOverlay").waitFor({ state: "hidden", timeout: 10000 });

    await expect.poll(
      () => displayPage.evaluate(() => localStorage.getItem("sfx_vol_round_transition")),
      { timeout: 10000, message: "głośność 'round_transition' skonfigurowana w games.settings (modal) powinna dotrzeć do Display" }
    ).toBe("0.7");

    // (b) game_state na żywo — suwak w Podsumowaniu, bez modala.
    const revealSlider = page.locator('input.summarySoundVol[data-sfx-vol="reveal"]');
    await expect(revealSlider).toBeVisible({ timeout: 10000 });
    // "input" (przeciąganie) tylko podgląd lokalny; dopiero "change"
    // (puszczenie suwaka) commituje do game_state — patrz komentarz w ui.js.
    await revealSlider.evaluate((el) => {
      el.value = "40";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator('.summarySoundRow:has(input[data-sfx-vol="reveal"]) .summarySoundVolLabel')).toHaveText("40%");

    await expect.poll(
      () => displayPage.evaluate(() => localStorage.getItem("sfx_vol_reveal")),
      { timeout: 10000, message: "głośność 'reveal' zmieniona w Podsumowaniu (game_state) powinna dotrzeć do Display natychmiast" }
    ).toBe("0.4");

    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();

    await clearSfxLog(page);
    await clearSfxLog(displayPage);
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await waitForSfxSequence(displayPage, ["round_transition"], 10000);
    // Control ma soundSource="control" domyślnie wyłączone — zero dźwięku
    // powinno polecieć TAM, wszystko idzie przez Display.
    expect(await getSfxKeys(page), "Control nie powinien grać nic, gdy źródłem jest Wyświetlacz").toEqual([]);

    // ===== Odpowiedź #1 (bez mute) — dowód normalnego odtwarzania z Display =====
    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await clearSfxLog(displayPage);
    await revealAnswer(page, 1); // Odpowiedź A, 40 pkt -> wygrywa pojedynek
    await waitForSfxSequence(displayPage, ["reveal"], 10000);

    // Ponowne podłączenie Display w trakcie gry wymaga nowego gestu audio.
    // Control blokuje odsłanianie do momentu potwierdzenia przez nową kartę.
    await displayPage.context().close();
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bbad\b/, { timeout: 20000 });
    await expect(page.locator("#deviceLostOverlay")).toBeVisible({ timeout: 10000 });
    await page.locator("#deviceLostClose").click();
    displayPage = await reconnectViaModal(browser, page, "display", contexts, []);
    await expect(displayPage.locator("#audioUnlockScreen")).toBeVisible({ timeout: 15000 });
    await expect(answerTile(page, 2)).toBeDisabled();
    const reUnlockAck = displayPage.waitForResponse((response) =>
      response.url().includes("/rpc/acknowledge_display_audio_unlock")
    );
    await displayPage.locator("#btnAudioUnlock").click();
    const reUnlockAckResponse = await reUnlockAck;
    expect(await reUnlockAckResponse.json(), "reconnected Display's new unlock request must be accepted by the server")
      .toBe(true);
    await expect(displayPage.locator("#audioUnlockScreen")).toBeHidden({ timeout: 10000 });
    await expect(answerTile(page, 2)).toBeEnabled({ timeout: 15000 });

    // ===== Mute na chwilę w tej samej rundzie — odpowiedź #2 podczas wyciszenia =====
    await page.locator("#btnMute").click();
    await expect(page.locator("#btnMute .ico-speaker-off")).toHaveCount(1);
    await clearSfxLog(displayPage);
    await revealAnswer(page, 2); // Odpowiedź B, 30 pkt
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });
    expect(await getSfxKeys(displayPage), "wyciszone -> Display nie powinien nic odtworzyć").toEqual([]);

    // ===== Un-mute — odpowiedź #3 znów słyszalna =====
    await page.locator("#btnMute").click();
    await expect(page.locator("#btnMute .ico-speaker-on")).toHaveCount(1);
    await clearSfxLog(displayPage);
    await revealAnswer(page, 3); // Odpowiedź C, 20 pkt -> wszystko odkryte
    await waitForSfxSequence(displayPage, ["reveal"], 10000);

    // Control przez całą rundę zostaje cicho — dowód, że gating jest
    // symetryczny (nie tylko "Display gra", ale i "Control naprawdę nie gra").
    expect(await getSfxKeys(page)).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 13. Zmiana języka propaguje się do urządzeń, w tym treść Hosta =====
//
// Sprawdza całą ścieżkę na raz: przełącznik w topbarze Control -> zapis
// settings.uiLang do game_state -> odczyt przez host/js/main.js -> setUiLang
// -> host/js/render.js's t()-owane tytuły faz. Regresja na dzisiejszą
// naprawę: wcześniej host/js/render.js miał te napisy zaszyte na sztywno po
// polsku, więc nawet gdyby cała reszta ścieżki działała, treść by się nie
// zmieniła.

test("control2: zmiana języka w Control propaguje się do Hosta — tytuł fazy faktycznie się tłumaczy", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-LANG-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const hostPage = await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(hostPage.locator("#paperText1")).toContainText("PRZYCISK", { timeout: 10000 });
    await expect(hostPage.locator("#p2Hint")).toContainText("zasłonić");
    await expect(hostPage.locator("#cover2Swipe")).toContainText("odsłonić");

    await page.locator(".lang-btn").click();
    // Zmiana języka leci przez window "i18n:lang" -> store.commit() poza
    // kolejką engine.dispatch() (ten sam wzorzec co Mute) — bez czekania na
    // faktyczny zapis test sprawdzał Hosta, zanim uiLang w ogóle dotarło.
    await clickConfirmed(page.locator('.lang-option[data-lang="en"]'));

    await expect(hostPage.locator("#paperText1")).toContainText("BUZZER", { timeout: 10000 });
    await expect(hostPage.locator("#paperText1")).not.toContainText("PRZYCISK");
    await expect(hostPage.locator("#p2Hint")).toContainText("cover");
    await page.locator(".lang-btn").click();
    await clickConfirmed(page.locator('.lang-option[data-lang="pl"]'));
    await expect(hostPage.locator("#p2Hint")).toContainText("zasłonić");
    await expect(hostPage.locator("#cover2Swipe")).toContainText("odsłonić");
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 14. Modal ustawień gry — zmiana nazwy drużyny odświeża podgląd Wyświetlacza =====
//
// Zgłoszone: podgląd Wyświetlacza w modalu ustawień (js/pages/game-settings.js)
// był całkowicie martwy — sendDisplayCmd() w trybie modalu tylko przekazywał
// tekstowe komendy do window.parent, licząc na Control, żeby je dalej
// przekazał "prawdziwemu" Displayowi (czego Control v2 nigdy nie robi —
// komend już nie ma). Naprawa: modal sam osadza /display?preview=1 i
// przesyła mu postMessage familiada:preview-row, ten sam mechanizm co D3.
// Ten test dowodzi, że to faktycznie działa: zmiana nazwy drużyny w polu
// formularza musi się pojawić w window.__displayLog ZAGNIEŻDŻONEGO iframe'a
// podglądu (display/js/main.js's instrumentSceneApi(), dodane też do trybu
// podglądu w tej samej naprawie) jako wywołanie api.small.long1(...).
test("control2: modal ustawień gry — zmiana nazwy drużyny odświeża podgląd Wyświetlacza", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-GSPREVIEW-${Date.now()}`);
  const contexts = [];
  try {
    // "Dalej" wymaga WSZYSTKICH trzech urządzeń online -- bez sparowania
    // zostaje trwale disabled (patrz analogiczna naprawa w teście "Zacznij
    // od nowa" wyżej).
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });

    // Skróty są ignorowane, dopóki plansza jest zajęta (zapis przejścia do
    // Podsumowania jeszcze trwa, a ekran renderuje się optymistycznie) —
    // powtarzaj "e" + Enter, aż modal się otworzy.
    await expect(async () => {
      await page.keyboard.press("e");
      await page.keyboard.press("Enter");
      await expect(page.locator("#gsOverlay")).not.toHaveClass(/hidden/, { timeout: 1500 });
    }).toPass({ timeout: 20000 });

    const gsFrame = page.frameLocator("#gsFrame");
    // Kategoria "Drużyny" jest domyślnie aktywna po otwarciu modala —
    // pole nazwy drużyny A jest widoczne od razu, bez przełączania zakładek.
    await expect(gsFrame.locator("#gsTeamA")).toBeVisible({ timeout: 10000 });

    // Zagnieżdżony iframe podglądu (display/js/main.js's bootPreview()) —
    // dostępny wprost z page.frames() (ten sam origin, zwykła strona), nie
    // przez frameLocator zagnieżdżony w innym frameLocator. UWAGA: D3
    // (control/js/ui.js's renderSetupFinish) ma WŁASNY, NIEZALEŻNY
    // podgląd-iframe (`/display?id=...&key=...&preview=1`), zamontowany w
    // Control jeszcze PRZED otwarciem tego modala -- samo filtrowanie po
    // "/display"+"preview=1" w page.frames() (płaska lista wszystkich
    // ramek na stronie) łapało WTEDY ten D3-owy iframe zamiast modala,
    // bo pasował do filtra i był w drzewie ramek wcześniej (zgłoszone:
    // test wisiał na __displayLog, mimo że modal realnie wysyłał i
    // odbierał poprawne wiadomości -- po prostu do INNEJ ramki). Naprawa:
    // szukamy WYŁĄCZNIE wśród potomków samej ramki #gsFrame, więc D3-owy
    // podgląd (sibling w drzewie, nie potomek modala) nigdy nie pasuje.
    const gsFrameHandle = await page.$("#gsFrame");
    const gsFrameObj = await gsFrameHandle.contentFrame();
    const previewFrame = () => gsFrameObj.childFrames().find((f) => f.url().includes("/display") && f.url().includes("preview=1"));
    await expect.poll(() => previewFrame()?.url(), { timeout: 10000 }).toBeTruthy();
    await expect.poll(async () => {
      try { return await previewFrame().evaluate(() => Array.isArray(window.__displayLog)); } catch { return false; }
    }, { timeout: 10000 }).toBe(true);

    await previewFrame().evaluate(() => { window.__displayLog = []; });
    await gsFrame.locator("#gsTeamA").fill("Testowi Mistrzowie");

    await expect.poll(async () => {
      const log = await previewFrame().evaluate(() => window.__displayLog || []);
      return log.some((e) => e.call === "api.small.long1" && e.args?.[0] === "Testowi Mistrzowie");
    }, { timeout: 10000 }).toBe(true);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 15. Blokada logo — Control (i modal ustawień gry) czekają, aż
// logo-editor.js zwolni logo referencowane przez grę =====
//
// js/core/resource-lock.js's guardResourceBusy() — dodane w tej sesji do
// control/js/app.js i js/pages/game-settings.js (patrz komentarze przy
// obu wywołaniach): to urządzenie NIE edytuje logo, tylko je referuje na
// żywo (podgląd Wyświetlacza), więc nie trzyma własnej blokady — tylko
// czeka, aż logo-editor.js (jedyny prawdziwy posiadacz "logo" locka)
// zwolni swoją. Ten sam wzorzec i te same asercje (#resourceLockGuard) co
// cross-resource-locks.spec.js's testy Warstwy A/B dla logo, tu
// zweryfikowany od strony Control v2 zamiast game-settings.js/logo-editor.js
// wprost. Blokada jest zajmowana bezpośrednio przez RPC (bez faktycznego
// otwierania logo-editor.html) — to samo, co realnie robi ta strona po
// kliknięciu "Edytuj", tylko bez UI, żeby test nie zależał od jej
// konkretnych selektorów.
function blankGlyphPayload() {
  return {
    layers: [{ color: "main", rows: Array.from({ length: 10 }, (_, i) => i === 4 ? "FAMILIADA".padStart(19).padEnd(30) : " ".repeat(30)) }],
    source: { mode: "TEXT" },
  };
}

async function acquireLogoLock(page, logoId, tabId) {
  return page.evaluate(async ({ logoId, tabId }) => {
    const { data, error } = await window.__sbClient.rpc("acquire_edit_lock", {
      p_resource_type: "logo", p_resource_id: logoId, p_tab_id: tabId, p_context: "logo-editor",
    });
    if (error) throw new Error("acquire_edit_lock failed: " + error.message);
    return data;
  }, { logoId, tabId });
}

async function releaseLogoLock(page, logoId, tabId) {
  await page.evaluate(async ({ logoId, tabId }) => {
    await window.__sbClient.rpc("release_edit_lock", {
      p_resource_type: "logo", p_resource_id: logoId, p_tab_id: tabId,
    });
  }, { logoId, tabId }).catch(() => {});
}

test("control2: zablokowany, gdy logo gry jest edytowane w logo-editorze — i wznawia się samo po zwolnieniu", async ({ page, context, browser }, testInfo) => {
  await loginAsPooledTestUser(page, context, testInfo.parallelIndex);

  const logoName = `E2E-CONTROL2-LOGOLOCK-${Date.now()}`;
  const { logoId, gameId, hostKey } = await page.evaluate(async ({ name, payload }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: logo, error: logoErr } = await sb.from("user_logos")
      .insert({ user_id: userData.user.id, name, type: "GLYPH_30x10", payload })
      .select("id").single();
    if (logoErr) throw new Error("insert logo failed: " + logoErr.message);
    const { data: game, error: gameErr } = await sb.from("games")
      .insert({
        name: `E2E-CONTROL2-LOGOLOCKGAME-${Date.now()}`,
        owner_id: userData.user.id, type: "prepared", status: "ready",
        settings: { teams: { teamA: "Alfa", teamB: "Beta" }, game: { hasFinal: false }, display: { logoId: logo.id } },
      })
      .select("id, share_key_host").single();
    if (gameErr) throw new Error("insert game failed: " + gameErr.message);
    return { logoId: logo.id, gameId: game.id, hostKey:game.share_key_host };
  }, { name: logoName, payload: blankGlyphPayload() });

  // stan "play" wymaga >= 10 pytań, inaczej overlay stanu przykrywa blokadę logo
  await padGame(page, gameId);
  const logoContexts = [];
  let hostPage;
  const lockTabId = `e2e-fake-logo-editor-${Date.now()}`;
  try {
    await acquireLogoLock(page, logoId, lockTabId);
    hostPage = await openAnon(browser, logoContexts, `/host?id=${gameId}&key=${hostKey}`, "host", []);

    await page.goto(`/control?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#resourceLockGuardMsg")).toContainText("edytowane", { timeout: 5000 });
    // Zablokowany PRZED wyrenderowaniem czegokolwiek z #app (guardResourceBusy
    // jest wołane zanim Control zdąży namalować krok "Urządzenia").
    await expect(page.locator(".stepTitle")).toHaveCount(0);

    await expect(hostPage.locator("#cover2Logo svg")).toHaveCount(1, {timeout:10000});
    await releaseLogoLock(page, logoId, lockTabId);

    // Odzyskanie działa DWIEMA niezależnymi drogami (broadcast RELEASED +
    // polling co 5s) — ten test celowo nie synchronizuje się z broadcastem,
    // żeby przy okazji sprawdzić fallback pollingu.
    await expect(page.locator("#resourceLockGuard")).toBeHidden({ timeout: 15000 });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.getByLabel("Przycisk fizyczny").check();
    await openAnon(browser, logoContexts, `/display?id=${gameId}&key=${await page.evaluate(async id => (await window.__sbClient.from("games").select("share_key_display").eq("id",id).single()).data.share_key_display, gameId)}`, "display", []);
    await page.getByRole("button", {name:"Dalej",exact:true}).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie");
    await expect.poll(() => hostPage.locator("#cover2Logo canvas").evaluateAll(canvases => canvases.some(canvas => {
      const pixels = canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
      return pixels.some((value,idx) => idx % 4 === 3 && value > 0);
    })), {timeout:15000}).toBe(true);
  } finally {
    await Promise.all(logoContexts.map(context => context.close().catch(() => {})));
    await releaseLogoLock(page, logoId, lockTabId);
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
    await page.evaluate(async (id) => { await window.__sbClient.from("user_logos").delete().eq("id", id); }, logoId);
  }
});

// ===== 16. Udostępnianie urządzenia przez e-mail =====
//
// Jedyne dotychczasowe pokrycie tej funkcji (control/js/shareDevice.js)
// żyło WYŁĄCZNIE w tests/e2e/record-playthrough.js (scenariusz 8) — realne
// asercje, ale uruchamiane tylko ręcznie, w ramach wolnego workflow
// produkującego wideo (e2e-record.yml), nigdy w zwykłym, szybkim cyklu
// (e2e-tests.yml). Ten test to ten sam przebieg, bez nagrywania: operator
// (test1) udostępnia urządzenie Prowadzącego drugiemu, PRAWDZIWEMU kontu
// (test7 — poza pulą control2 (test1..test<workery>) i inny niż odbiorcy
// maili w bases.spec.js (test6) i subscriptions.spec.js (test8), bo
// clearMailbox kasuje całą skrzynkę odbiorcy), czeka na realny e-mail (ten sam
// tests/e2e/helpers/mailbox.js co bases.spec.js's "@mailbox" testy) i
// dowodzi, że link z maila faktycznie łączy -- NOWY, niezalogowany kontekst
// przeglądarki otwiera go i dostaje działającą stronę Prowadzącego, bez
// żadnego logowania (sam share_key_host w URL-u wystarcza).
test("@mailbox control2: udostępnianie urządzenia (Prowadzący) przez e-mail -- link z maila faktycznie łączy", async ({ page, context, browser }, testInfo) => {
  const recipient = testAccountUsername(7);
  await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  const game = await makeGame(page, `E2E-CONTROL2-SHAREMAIL-${Date.now()}`);
  const contexts = [];
  try {
    await resetMailProviderLimits(page);
    await clearMailbox(recipient);

    // Zgłoszone: maile mają cooldown/suppression, żeby nie spamować -- przy
    // wielokrotnym testowaniu na TYM SAMYM koncie trzeba to ręcznie zdjąć w
    // bazie przed testem. docs/email-system-description.md: mail-worker
    // POMIJA wysyłkę CICHO (bez błędu), gdy user_flags.email_notifications
    // odbiorcy jest false -- wygląda identycznie jak zwykły timeout, tylko
    // mail nigdy się nie zjawi. test7 jest tu odbiorcą w WIELU przebiegach
    // tego testu (każdy dzień CI) -- zamiast liczyć na to, że nikt nigdy
    // nie zgasił tej flagi (np. inny test klikający link wypisujący),
    // wymuszamy ją z powrotem na true PRZED udostępnieniem: logujemy się
    // NA KONTO ODBIORCY w osobnym, efemerycznym kontekście (user_flags ma
    // RLS tylko na własny wiersz -- auth.uid()=user_id) i nadpisujemy.
    // Ten sam kontekst usuwa też udostępnienie z poprzedniego przebiegu
    // (e2e_shared_devices_cleanup, migracja 287) -- shared_devices ma TTL
    // 4h i UNIQUE (owner,recipient,typ) GLOBALNIE na konto, nie per-grę,
    // więc inaczej kolejny przebieg tego samego dnia zastaje już istniejące
    // udostępnienie i #shareDeviceCurrentContent nigdy nie pokaże formularza
    // "Dodaj" (zdiagnozowane w tests/e2e/record-playthrough.js's bliźniaczym
    // scenariuszu, CI run #30).
    const ownerUid = await page.evaluate(async () => {
      const { data } = await window.__sbClient.auth.getUser();
      return data?.user?.id || null;
    });
    const recipientSetupContext = await browser.newContext();
    const recipientSetupPage = await recipientSetupContext.newPage();
    let recipientUid = null;
    try {
      await loginAsTestUser(recipientSetupPage, recipientSetupContext, { username: recipient });
      recipientUid = await recipientSetupPage.evaluate(async (ownerId) => {
        const sb = window.__sbClient;
        const { data: userData } = await sb.auth.getUser();
        await sb.from("user_flags").upsert({ user_id: userData.user.id, email_notifications: true }, { onConflict: "user_id" });
        if (ownerId) await sb.rpc("e2e_shared_devices_cleanup", { p_other_user_id: ownerId });
        return userData.user.id;
      }, ownerUid);
    } finally {
      await recipientSetupContext.close().catch(() => {});
    }

    // ZNALEZIONA REALNA PRZYCZYNA (run #333): list_my_device_shares() (RPC
    // za #shareDeviceCurrentContent) zwraca WSZYSTKIE udostępnienia danego
    // device_type dla operatora -- niezależnie od odbiorcy I od gry -- a UI
    // bierze po prostu pierwsze dopasowanie. test1 (operator, na stałe) ma
    // "host" udostępniony test2 z osobnego, niepowiązanego przebiegu
    // tests/e2e/record-playthrough.js (ten sam hardcodowany operator) --
    // e2e_shared_devices_cleanup wyżej czyści tylko parę (test1,test7), nie
    // (test1,test2), więc ten stary wpis został i modal pokazywał "test2"
    // zamiast świeżo dodanego "test7". Czyścimy więc TU, szeroko, każde
    // istniejące "host"-udostępnienie operatora, niezależnie od odbiorcy --
    // to jest czysto porządek testowy (operator i tak zawsze zaczyna ten
    // test z zerowym stanem), nie zmiana produktowego zachowania.
    const staleHostShares = await page.evaluate(async () => {
      const { data } = await window.__sbClient.rpc("list_my_device_shares");
      return (data || []).filter((s) => s.device_type === "host").map((s) => s.recipient_id);
    });
    for (const staleRecipientId of staleHostShares) {
      await page.evaluate(async (rid) => {
        await window.__sbClient.rpc("unshare_device", { p_recipient_user_id: rid, p_device_type: "host" });
      }, staleRecipientId);
    }

    const after = new Date(Date.now() - 2_000).toISOString();

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    await page.locator('[data-device="host"]').getByRole("button", { name: "Udostępnij" }).click();
    await expect(page.locator("#shareDeviceOverlay")).toBeVisible({ timeout: 10000 });
    await page.locator("#shareDeviceEmail").fill(recipient);
    await page.getByRole("button", { name: "Dodaj" }).click();
    // Potwierdzenie zapisu w UI (RPC share_device) -- niezależne od tego,
    // czy/kiedy realny e-mail dotrze. shareDevice.js's `current.recipient_
    // username || current.recipient_email` -- skoro test7 ma ustawiony
    // username, modal pokazuje SAMĄ nazwę użytkownika ("test7"), nie pełny
    // e-mail -- real finding z pierwszego przebiegu CI, nie zgadywane.
    const recipientUsername = recipient.split("@")[0];
    await expect(page.locator("#shareDeviceCurrentContent")).toContainText(recipientUsername, { timeout: 15000 });

    // Zgłoszony realny bug naprawiony migracją 287: share_device() robiło
    // ON CONFLICT DO UPDATE bez sygnalizowania wywołującemu, czy to nowy
    // wiersz czy aktualizacja -- shareDevice.js wysyłało więc pełny mail
    // przy KAŻDYM "Dodaj", nawet dla już istniejącego udostępnienia. Test
    // bezpośrednio (RPC, bez UI) powtarza share_device dla tego samego
    // odbiorcy/typu i sprawdza created=false -- to jest naprawiony sygnał,
    // na którym shareDevice.js opiera decyzję "wysłać drugi mail czy nie",
    // bez kosztu drugiego 90s oczekiwania na pocztę.
    // ZNALEZIONA REALNA NIEZGODNOŚĆ przy ujednolicaniu cooldownów (migracja
    // 290): v_created teraz prawidłowo uwzględnia też game_id (bez tego
    // zmiana gry dla tej samej osoby/urządzenia cicho nie wysyłała maila,
    // mimo że odbiorca realnie potrzebuje nowego linku -- patrz migracja
    // 290). Ten test MUSI więc podać TEN SAM p_game_id co pierwotne
    // udostępnienie wyżej, inaczej to jest już inna, nowa kombinacja
    // (created=true słusznie) -- nie regresja, tylko stary test pisany
    // pod starą, mniej precyzyjną granularność.
    const resendResult = await page.evaluate(async ({ recipientId, gameId }) => {
      const { data, error } = await window.__sbClient.rpc("share_device", {
        p_recipient_user_id: recipientId,
        p_device_type: "host",
        p_game_id: gameId,
      });
      return { data, error: error?.message || null };
    }, { recipientId: recipientUid, gameId: game.id });
    expect(resendResult.error).toBeNull();
    expect(resendResult.data?.ok).toBe(true);
    expect(resendResult.data?.created, "powtórne udostępnienie temu samemu odbiorcy nie powinno być 'created' -- inaczej shareDevice.js wysłałby drugi mail").toBe(false);

    // BEZ `timeout` -- domyślne 90s z helpers/mailbox.js, tak jak WSZYSTKIE
    // inne testy mailowe w repo (bases.spec.js/
    // subscriptions.spec.js/account-password-email.spec.js). Zgłoszone:
    // poprzednia wersja jawnie skracała do 60_000 -- ale docs/email-system-
    // description.md's mail-worker przetwarza kolejkę `mail_queue` co 60s
    // (pg_cron), więc worst-case opóźnienie samo w sobie zbliża się do 60s
    // (mail wstawiony tuż PO tiku czeka na kolejny), zanim doliczyć jeszcze
    // czas wysyłki przez łańcuch dostawców -- 60_000 nie był bezpiecznym
    // marginesem ponad to, tylko dokładnie na jego granicy (realny powód
    // sporadycznych "Nie otrzymano maila... w 60000 ms" w CI, nie infra flake).
    const email = await waitForEmail({ recipient, after, subject: /Udostępniono urządzenie/ });
    const links = extractHttpLinks(email).filter((u) => u.includes("/host"));
    expect(links.length, "mail musi zawierać działający link do /host").toBeGreaterThan(0);

    await page.locator("#btnShareDeviceClose").click();

    // Odbiorca klika link z maila -- zupełnie NOWY, niezalogowany kontekst
    // (nie ten sam user/sesja co operator) -- dowód, że share_key_host w
    // URL-u wystarcza, bez żadnego logowania.
    const recipientContext = await browser.newContext();
    contexts.push(recipientContext);
    const recipientPage = await recipientContext.newPage();
    await recipientPage.goto(links[0], { waitUntil: "domcontentloaded" });
    // ZNALEZIONA REALNA PRZYCZYNA (diagnostyka, run #297): host2.html NIE MA
    // w ogóle elementu "#app" -- to selektor skopiowany przez pomyłkę z
    // control2.html's konwencji (tam root #app istnieje). host2.html's
    // prawdziwy, statyczny root to #paper (main.paperSplit), z #paperText1/
    // #paperText2 w środku -- diagnostyka potwierdziła, że strona faktycznie
    // działa poprawnie (game_state_get 200 w ~1s, device_ping tyka dalej w
    // nieskończoność), więc "#app" po prostu NIGDY nie mógł się znaleźć,
    // niezależnie od timeoutu -- stąd każdy dotychczasowy przebieg tego
    // testu musiał paść.
    await expect(recipientPage.locator("#paper")).toBeVisible({ timeout: 15000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await clearMailbox(recipient).catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 17. Zerwanie i ponowne podłączenie urządzeń =====
//
// Jedyne dotychczasowe pokrycie tego scenariusza (zamknięcie WSZYSTKICH
// trzech urządzeń naraz w środku rundy, ponowne podłączenie przez modal
// kropki statusu w topbarze) żyło wyłącznie w tests/e2e/record-playthrough.js
// (scenariusz 6) -- znowu: realne, ale tylko w ramach wolnego workflow
// nagrywania wideo, zero pokrycia w szybkim cyklu. To jest dokładnie ten
// scenariusz, po który cała przebudowa Control na wspólną tabelę stanu
// (game_state) powstała -- dowód, że stan gry przeżywa rozłączenie każdego
// urządzenia niezależnie od Control, bez żadnej ręcznej resynchronizacji
// poza ponownym wejściem na URL urządzenia.

// Modal kropki statusu (control/js/app.js's showQrModal) koduje URL
// urządzenia jako obrazek qrserver.com's `data=` query param dla Hosta/
// Buzzera, a dla Wyświetlacza jako bezpośredni link "Otwórz" (#qrModalOpen).
async function readDeviceUrlFromModal(control, kind) {
  if (kind === "display") return control.locator("#qrModalOpen").getAttribute("href");
  const src = await control.locator("#qrModalImg").getAttribute("src");
  return decodeURIComponent(new URL(src).searchParams.get("data") || "");
}

// Pełny cykl "operator odzyskuje rozłączone urządzenie": klik na kropkę
// statusu w topbarze (klikalna PRZEZ CAŁĄ GRĘ, nie tylko na kroku
// Urządzeń), odczyt linku z modala, otwarcie go w ZUPEŁNIE NOWYM kontekście
// przeglądarki (świeży localStorage/deviceId -- wierniejsza symulacja
// realnego ponownego podłączenia niż zwykły reload tej samej, wciąż
// istniejącej karty), zamknięcie modala, czekanie na zieloną kropkę.
async function reconnectViaModal(browser, control, kind, contexts, errors) {
  const rowId = `#dot${kind[0].toUpperCase()}${kind.slice(1)}Row`;
  await control.locator(rowId).click();
  const url = await readDeviceUrlFromModal(control, kind);
  if (!url) throw new Error(`modal (${kind}) nie pokazał żadnego URL-a do ponownego podłączenia`);
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const p = await ctx.newPage();
  trackErrors(p, kind, errors);
  instrumentAnon(p, kind);
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await control.locator("#qrModalClose").click();
  await expect(control.locator(`#dot${kind[0].toUpperCase()}${kind.slice(1)}`)).toHaveClass(/\bok\b/, { timeout: 15000 });
  return p;
}

test("control2: zerwanie połączenia wszystkich trzech urządzeń naraz i ponowne podłączenie przez modal", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-RECONNECT-${Date.now()}`, { roundQuestions: TWO_QUESTIONS });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    let displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    const hostPage = await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", errors);
    let buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);

    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/, { timeout: 15000 });

    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await clearDisplayLog(displayPage);
    await revealAnswer(page, 1); // odp. #1 (top) -> wygrywa pojedynek, reszta rundy zostaje NIEODSŁONIĘTA

    // ===== Zerwanie wszystkich trzech naraz =====
    const toClose = contexts.splice(0, contexts.length); // zdejmij z listy sprzątanej w finally -- zamykamy je TU, świadomie
    await Promise.all(toClose.map((ctx) => ctx.close()));
    // Ten sam wzorzec co naprawiony timeout maila (patrz test #16 wyżej):
    // margines MUSI przekraczać realne worst-case opóźnienie, nie być mu
    // dokładnie równy. control/js/presence.js: ONLINE_MS=15_000 (ostatni
    // ping musi być starszy niż 15s, żeby isOnline() zwróciło false) + do
    // POLL_MS=1_500 na kolejny tick, który to w ogóle przeliczy i odświeży
    // #dotX -- worst-case to ~16.5s, nie 15s. 15000ms (dokładnie na granicy)
    // bywał za ciasny pod obciążeniem runnera CI (real finding: ten test
    // padał powtarzalnie w CI, nie losowo).
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bbad\b/, { timeout: 8500 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bbad\b/, { timeout: 8500 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bbad\b/, { timeout: 8500 });
    await expect(answerTile(page, 2)).toBeDisabled();
    await expect(page.locator(".c2-gameplay .msg-pill")).toHaveCount(0);
    await expect(page.locator("#deviceLostOverlay")).toBeVisible();
    await expect(page.locator("#deviceLostText")).toContainText("Wyświetlacz");
    await expect(page.locator("#deviceLostClose")).toHaveText("OK");
    await page.locator("#deviceLostClose").click();
    const revBefore = await page.evaluate(async (id) => (await window.__sbClient.from("game_state").select("rev").eq("game_id", id).single()).data.rev, game.id);
    await answerTile(page, 2).evaluate((button) => button.click());
    const revAfter = await page.evaluate(async (id) => (await window.__sbClient.from("game_state").select("rev").eq("game_id", id).single()).data.rev, game.id);
    expect(revAfter).toBe(revBefore);

    // ===== Ponowne podłączenie po kolei, przez modal =====
    displayPage = await reconnectViaModal(browser, page, "display", contexts, errors);
    await expect(page.locator("#deviceLostOverlay")).toBeHidden();
    await expect(answerTile(page, 2)).toBeDisabled();
    await reconnectViaModal(browser, page, "host", contexts, errors);
    await expect(page.locator("#deviceLostOverlay")).toBeHidden();
    await expect(answerTile(page, 2)).toBeDisabled();
    buzzerPage = await reconnectViaModal(browser, page, "buzzer", contexts, errors);
    await expect(answerTile(page, 2)).toBeEnabled({ timeout: 10000 });

    // Świeżo podłączony Display musi pokazać PRAWDZIWY, aktualny obraz gry
    // (odkrytą odpowiedź #1) -- nie pusty/czarny ekran. Dowód realnego
    // wznowienia stanu, nie tylko zielonej kropki w topbarze.
    const setAllCalls = await getDisplayCalls(displayPage, "api.rounds.setAll");
    expect(setAllCalls.length, "Display po ponownym podłączeniu musi przynajmniej raz namalować planszę rund").toBeGreaterThan(0);
    expect(setAllCalls.at(-1).args[0].rows[0]).toMatchObject({ text: "Odpowiedź A", pts: "40" });

    // ===== Dokończenie rundy 1 na świeżo podłączonych urządzeniach =====
    await revealAnswer(page, 2);
    await revealAnswer(page, 3);
    await page.getByRole("button", { name: /^(Zakończ rundę|Przejdź do zakończenia gry)$/ }).click();
    await expect(page.getByText("Alfa: 90")).toBeVisible({ timeout: 10000 });

    // ===== Runda 2, w CAŁOŚCI na ponownie podłączonym Buzzerze -- dowód, że
    // nowe urządzenie nie tylko świeci na zielono (presence), ale faktycznie
    // bierze udział w rozgrywce (realny zapis przez game_state_buzzer_press).
    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 2", { timeout: 22000 });
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await expect(buzzerPage.getByRole("button", { name: "Przycisk B" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk B" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Beta" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Beta" }));
    await revealAnswer(page, 1);
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => {
      const sessions = await readControl2Sessions(page, game.id);
      return (sessions[0]?.stats_detail.events || []).map(event => event.kind);
    }).toEqual(expect.arrayContaining(["disconnect", "reconnect"]));
    const reconnectSessions = await readControl2Sessions(page, game.id);
    expect(reconnectSessions).toHaveLength(1);
    expect(reconnectSessions[0].rounds_played).toBe(1);
    expect(reconnectSessions[0].ended_at).toBeNull();
    await attachStatistics(testInfo, "reconnect", reconnectSessions);

    expect(errors, "żadne z urządzeń (stare ani świeżo podłączone) nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 18. Timery wracają do stanu SPRZED startu, gdy Control zastaje je
// już wygasłe przy wznowieniu =====
//
// Zgłoszone wprost: "rozłącz w trakcie timerów, albo zamknij Control w
// trakcie timerów -- czy one wrócą do stanu przed, a nie po, bo tak
// powinny". control/js/engine.js's CANCEL_TIMER3/CANCEL_TIMER (patrz ich
// komentarze) implementują dokładnie to.
//
// WAŻNE, znalezione przy pierwszym przebiegu tych testów w CI: zwykłe
// "poczekaj, potem page.reload()" NIE symuluje "zamknięte" -- dopóki karta
// Control żyje (nawet tylko czekając przez await), jej WŁASNY, żywy
// zegarek (app.js's scheduleTimer3Watch/scheduleFinalTimerWatch) sam
// odpala EXPIRE_TIMER3/EXPIRE_TIMER dokładnie w momencie wygaśnięcia --
// dokładnie tę gałąź "operator obecny i patrzy", którą te testy MAJĄ
// wykluczyć. Prawdziwa symulacja: page.goto("about:blank") PRZED
// czekaniem (zabija kontekst JS razem z jego setTimeout), dopiero PO
// odczekaniu powrót przez page.goto(control2 URL) -- to jest dopiero
// odpowiednik "karta była faktycznie zamknięta/rozłączona, gdy czas
// minął", analogicznie do reload-owego wznowienia z testu #2, tylko z
// deterministycznym wyłączeniem żywego zegarka na czas przerwy.

test("control2: zegarek 3s w rundach wraca do stanu SPRZED startu (bez naliczenia X), gdy Control zamknięte podczas odliczania", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-TIMER3REVERT-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await revealAnswer(page, 1); // A trafia -> przejmuje kontrolę (PLAY), 0 X na koncie

    await expect(xTile(page)).toBeVisible({ timeout: 10000 });
    await expect(xTile(page)).toContainText("0 / 3");

    // Start zegarka to zwykłe, pojedyncze kliknięcie -- tylko jego ręczne
    // ZATRZYMANIE na żywo jest zaznacz->potwierdź (timer3Tile w ui.js).
    await clearDisplayLog(displayPage);
    await clickConfirmed(page.getByRole("button", { name: "Rozpocznij odliczanie 3s" }));
    await expect(page.locator('[data-timer-role="timer3"]')).toBeVisible({ timeout: 10000 });

    // Zgłoszone: Display (nie tylko Control) musi jednoznacznie pokazywać,
    // że 3s zegarek trwa -- display/js/render.js's startTimer3Tick()
    // podmienia LEFT (drużyna A ma kontrolę) na odliczanie w dół,
    // DWUCYFROWE ("03"/"02"/"01", padStart), odróżnialne od zwykłego
    // wyniku drużyny (paintTotals() pisze BEZ wiodącego zera -- "0").
    await page.waitForTimeout(700);
    const duringCalls = await getDisplayCalls(displayPage, "api.small.leftDigits");
    expect(duringCalls.length, "Display musi dostać przynajmniej jedno odliczenie LEFT w trakcie timera3").toBeGreaterThan(0);
    expect(duringCalls.at(-1).args[0]).toMatch(/^0[123]$/);

    // "Control zamknięte w trakcie odliczania" -- NIE page.reload() po
    // prostym waitForTimeout(): karta Control, dopóki żyje (nawet tylko
    // czekając), ma WŁASNY, na żywo działający zegarek
    // (app.js's scheduleTimer3Watch/makeTimerWatch) -- sam odpaliłby
    // EXPIRE_TIMER3 (naliczenie X, "operator obecny i patrzy") dokładnie w
    // momencie wygaśnięcia, ZANIM zdążylibyśmy przeładować -- co dowodziłoby
    // czegoś innego niż scenariusz z tego zgłoszenia. Prawdziwe "zamknięte"
    // wymaga, żeby żadna karta nie miała tego zegarka żywego przez cały czas
    // odliczania -- stąd nawigacja NA ZEWNĄTRZ (zabija kontekst JS Control,
    // razem z jego setTimeout) PRZED czekaniem, dopiero potem powrót.
    await page.goto("about:blank").catch(() => {});
    await page.waitForTimeout(3600);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });

    // CANCEL_TIMER3 (nie EXPIRE_TIMER3): zegarek znika, ale licznik X
    // zostaje DOKŁADNIE tam, gdzie był PRZED jego startem -- "0 / 3", nigdy
    // naliczone pudło za czas, kiedy nikt nie patrzył.
    await expect(xTile(page)).toBeVisible({ timeout: 15000 });
    await expect(xTile(page)).toContainText("0 / 3");
    await expect(page.locator('[data-timer-role="timer3"]')).toHaveCount(0);

    // Display też wraca do prawdziwego wyniku (TIMER3_STOPPED -> paintTotals,
    // "0" bez wiodącego zera) -- dowód, że to nie tylko Control wie o cofnięciu.
    const afterCalls = await getDisplayCalls(displayPage, "api.small.leftDigits");
    expect(afterCalls.at(-1).args[0]).toBe("0");

    // Dowód, że to nie tylko wygląd po jednym renderze -- zegarek da się
    // uruchomić ponownie, nie został zablokowany w pośrednim stanie.
    await expect(page.getByRole("button", { name: "Rozpocznij odliczanie 3s" })).toBeVisible({ timeout: 10000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

test("control2: zegarek gracza w finale (15s) wraca do stanu SPRZED startu (usedP1 cofnięte), gdy Control zamknięte podczas odliczania", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-FINALTIMERREVERT-${Date.now()}`, {
    roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odp. warta 300", fixed_points: 100 }] }],
    finalAnswerPts: 50,
    settings: { game: { advanced: { roundMultipliers: [3] } } },
  });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await revealAnswer(page, 1); // jedyna odpowiedź, 300 pkt -> próg trafiony
    await strikeOutAndLoseSteal(page);
    await endRoundAndRevealRest(page, "Przejdź do finału");

    await expect(page.locator("#c2TopbarProgress")).toContainText("Finał", { timeout: 22000 });
    await page.getByRole("button", { name: "Rozpocznij finał" }).click();
    await expect(page.locator("#c2TopbarProgress")).toContainText(/Finał\s*(—\s*)?gracz 1,\s*wpisywanie/, { timeout: 22000 });

    const p1Inputs = page.locator("#app input[type=text]");
    await expect(p1Inputs).toHaveCount(5, { timeout: 10000 });
    for (let i = 0; i < 5; i++) await p1Inputs.nth(i).fill("Odp. finałowa");

    await armAndConfirm(page.getByRole("button", { name: "Rozpocznij odliczanie (15s)" }));
    await expect(page.locator('[data-timer-role="final"]')).toBeVisible({ timeout: 10000 });

    // "Control zamknięte w trakcie odliczania" -- NIE page.reload() po
    // prostym waitForTimeout() (patrz identyczny komentarz w teście
    // timera3 wyżej): dopóki karta Control żyje, jej WŁASNY żywy zegarek
    // (scheduleFinalTimerWatch) sam odpaliłby EXPIRE_TIMER dokładnie w
    // momencie wygaśnięcia, zanim zdążylibyśmy przeładować -- to byłby
    // scenariusz "operator obecny i patrzy", nie "zamknięte". Nawigacja na
    // zewnątrz PRZED czekaniem zabija ten kontekst JS na czas odliczania.
    await page.goto("about:blank").catch(() => {});
    await page.waitForTimeout(15500);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });

    // CANCEL_TIMER (nie EXPIRE_TIMER): zegarek zniknął, ale usedP1 wraca do
    // false -- "Rozpocznij odliczanie (15s)" da się kliknąć PONOWNIE,
    // zamiast trwale zablokowanego "Czas wykorzystany" (co by oznaczało, że
    // EXPIRE_TIMER jednak się odpalił, zużywając jednorazową szansę gracza
    // za czas, kiedy nikt nie patrzył).
    await expect(page.locator('[data-timer-role="final"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Czas wykorzystany" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rozpocznij odliczanie (15s)" })).toBeVisible({ timeout: 15000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 21. Koniec gry bez finału w trybie "punkty" — Wyświetlacz pokazuje
// WIN, nie logo =====
//
// Zgłoszone wprost: "Pytanie czemu ani jedna rozgrywka nie kończy się
// alternatywnym zamiast logo punktami lub wygraną, trzeba to poprawić...
// Jedno z zakończeń gry bez finału ma pokazać punkty." Silnik
// (web/shared/js/gameplay/endScreen.js's resolveRoundsEndScreen) już obsługiwał warianty
// "points"/"money" (pokryte testami jednostkowymi w
// tests/unit/settings.branching.test.js) — ale ŻADEN e2e/nagraniowy
// scenariusz nigdy faktycznie nie ustawiał endScreenMode!=="logo" i nie
// sprawdzał, że Wyświetlacz naprawdę woła api.win.set (nie api.logo.show).
// To jest właśnie ten brakujący, rzeczywisty dowód.
//
// Najkrótsza możliwa ścieżka do r_gameEnd: 1 pytanie w puli (wyczerpanie
// puli samo, niezależnie od progu, wymusza r_gameEnd — engine.js's
// finalizeRound()/previewRoundEndDestination), physicalBuzzer+
// noHostTablet (zero potrzeby otwierania Host/Buzzera), wszystkie 3
// odpowiedzi odsłonięte PRZED "Zakończ rundę" (END_ROUND z
// r.revealed.length>=r.answers.length finalizuje rundę OD RAZU, bez
// pośredniego kroku R8 "Przejdź do...").
test("control2: koniec gry bez finału w trybie \"punkty\" — Wyświetlacz pokazuje WIN, nie logo", async ({ page, browser }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-ENDPOINTS-${Date.now()}`, {
    roundQuestions: [TWO_QUESTIONS[0]],
    settings: { game: { hasFinal: false, advanced: { endScreenMode: "points" } } },
  });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    const displayPage = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", errors);

    const hostPage = await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", errors);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.getByLabel("Przycisk fizyczny").check();

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await expect(page.locator("#c2TopbarProgress")).toContainText("Runda 1", { timeout: 22000 });
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(page.getByRole("button", { name: "Alfa" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Alfa" }).click();
    await armAndConfirm(page.getByRole("button", { name: "Zatwierdź: Alfa" }));

    await revealAnswer(page, 1); // 40
    await revealAnswer(page, 2); // 30 -> bank 70
    await revealAnswer(page, 3); // 20 -> bank 90, wszystko odsłonięte

    // END_ROUND z wszystkim już odsłoniętym finalizuje rundę od razu --
    // pula (1 pytanie) wyczerpana -> prosto do r_gameEnd, bez R8.
    await expect(hostPage.locator("#paperText2")).not.toBeEmpty();
    await page.getByRole("button", { name: /^(Zakończ rundę|Przejdź do zakończenia gry)$/ }).click();
    await expect(page.locator("#c2TopbarProgress")).toContainText("Koniec gry", { timeout: 22000 });
    await expect(hostPage.locator("#paperText1")).toBeEmpty();
    await expect(hostPage.locator("#paperText2")).toBeEmpty();

    await expect.poll(async () => (await getDisplayCalls(displayPage, "api.win.set")).at(-1)?.args?.[0]).toBe(90);
    await clearDisplayLog(displayPage);
    await page.getByRole("button", { name: "Zakończ grę" }).click();
    await expect(page.getByText("Wygrała drużyna Alfa wynikiem 90:0")).toBeVisible({ timeout: 10000 });
    const completedSessions = await readControl2Sessions(page, game.id);
    expect(completedSessions).toHaveLength(1);
    expect(completedSessions[0]).toMatchObject({ status: "final", rounds_played: 1, rounds_score_a: 90, rounds_score_b: 0, team_a_score: 90, final_points: null });
    expect(completedSessions[0].ended_at).toBeTruthy();
    expect(completedSessions[0].stats_detail.end_reason).toBe("questions_exhausted");
    expect(completedSessions[0].stats_detail.rounds["1"].awarded_a).toBe(90);
    await attachStatistics(testInfo, "no-final", completedSessions);

    // Outro does not repeat the result animation.
    expect(await getDisplayCalls(displayPage, "api.win.set")).toEqual([]);
    // Logo NIE powinno się pojawić w tej ścieżce (endScreenMode="points",
    // bez remisu) -- dowód, że to rozróżnienie faktycznie działa, nie
    // tylko że WIN czasem leci.
    const logoCalls = await getDisplayCalls(displayPage, "api.logo.show");
    expect(logoCalls, "logo nie powinno się pojawić przy endScreenMode=\"points\" bez remisu").toEqual([]);

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

test("control2: opóźnione potwierdzenie Display blokuje następną akcję i buzzer po końcu dźwięku", async ({ page, browser }, testInfo) => {
  test.setTimeout(150000);
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const game = await makeGame(page, `E2E-CONTROL2-ACK-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  try {
    const display = await openAnon(browser, contexts, `/display?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host?id=${game.id}&key=${game.share_key_host}`, "host", []);
    const buzzer = await openAnon(browser, contexts, `/buzzer?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await page.goto(`/control?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/);
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/);
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/);
    await expect(page.locator(".c2-hint-shortcuts")).toHaveCount(0);
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".c2-hint-shortcuts")).toHaveCount(0);
    await page.getByRole("button", { name: "Gotowe — przejdź do rozgrywki" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await expect(page.getByRole("button", { name: "Rozpocznij rundę" })).toBeEnabled({ timeout: 35000 });
    let intercepted = false;
    await display.route("**/rpc/game_state_display_complete", async route => {
      intercepted = true;
      await held;
      await route.continue();
    });
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await expect.poll(() => intercepted, { timeout: 20000 }).toBe(true);
    // The actual scene has finished, and the full sound lock has elapsed,
    // but its real completion has not reached the server yet.
    await page.waitForTimeout(2000);
    await expect(buzzer.locator("#btnA")).toBeDisabled();
    const readyBefore = await page.evaluate(async id => (await window.__sbClient.from("game_state_display_completion").select("rendered_rev,requested_rev").eq("game_id",id).single()).data, game.id);
    expect(readyBefore.rendered_rev).toBeLessThan(readyBefore.requested_rev);
    release();
    await expect(buzzer.locator("#btnA")).toBeEnabled({ timeout: 15000 });
    await display.unroute("**/rpc/game_state_display_complete");
    await buzzer.locator("#btnA").click();
    await armAndConfirm(page.getByRole("button", { name: /^Zatwierdź:/ }));
    await expect(page.locator('[data-shortcut="1"]')).toBeEnabled({ timeout: 15000 });
    intercepted = false;
    const heldScore = new Promise(resolve => { release = resolve; });
    await display.route("**/rpc/game_state_display_complete", async route => {
      intercepted = true;
      await heldScore;
      await route.continue();
    });
    await armAndConfirm(page.locator('[data-shortcut="1"]'));
    await expect.poll(() => intercepted, { timeout: 15000 }).toBe(true);
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-shortcut="2"]')).toBeDisabled();
    release();
    await expect(page.locator('[data-shortcut="2"]')).toBeEnabled({ timeout: 15000 });
  } finally {
    release();
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});
