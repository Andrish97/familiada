// tests/e2e/control2.spec.js
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
//   12. Wyciszenie dźwięku — po kliknięciu Mute żaden klucz SFX się nie
//       odtwarza mimo normalnie grającej akcji.
//   13. Zmiana języka propaguje się do Hosta, w tym samą TREŚĆ tytułu fazy
//       (nie tylko chrome strony) — regresja na dzisiejszą naprawę i18n.
//   14. Modal ustawień gry (js/pages/game-settings2.js) — zmiana nazwy
//       drużyny faktycznie odświeża zagnieżdżony podgląd Wyświetlacza
//       (/display2?preview=1) — regresja na naprawę martwego podglądu w
//       trybie modalu.
//
// Każdy test tworzy i kasuje własną grę testową — niezależne od siebie,
// można je uruchamiać pojedynczo (--grep) przy diagnozowaniu awarii.
//
// Obserwowalność dźwięku/Display: js/core/sfx.js's playSfx() zapisuje każde
// odtworzenie do window.__sfxLog, a display2/js/main.js owija scene.api tak,
// że każde wywołanie (revealAnswerRow, setX, indicator.set, ...) ląduje w
// window.__displayLog — obie instrumentacje istnieją WYŁĄCZNIE do tych
// testów (patrz komentarze przy ich definicjach), zero wpływu na normalne
// działanie. Bez nich nie dałoby się z Playwrighta zweryfikować ani dźwięku
// (Web Audio nie zostawia śladu w DOM), ani tego, co dokładnie Display
// narysował (SVG dot-matrix, nie tekst).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

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
// (control2/js/soundReactor.js), gdzie o tym, KTÓRY klucz gra pierwszy,
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

// Kafelki odpowiedzi w Rundach (control2/js/ui.js's renderRounds()) nie
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
// (control2/js/ui.js's armableTile): pierwsze kliknięcie tylko uzbraja
// (złota obwódka, zero zapisu), drugie na TYM SAMYM elemencie faktycznie
// wysyła akcję. Locator jest "żywy" (przeliczany przy każdym użyciu), więc
// dwa kolejne .click() poprawnie trafiają w ten sam kafel mimo przebudowy
// DOM między nimi.
async function armAndConfirm(locator) {
  await locator.click();
  await locator.click();
}

async function revealAnswer(page, n) {
  await armAndConfirm(answerTile(page, n));
}

function xTile(page) {
  return page.getByRole("button", { name: "X", exact: true });
}

async function clickX(page) {
  await armAndConfirm(xTile(page));
}

async function getDisplayCalls(displayPage, filterPrefix = "") {
  return displayPage.evaluate((prefix) => (window.__displayLog || [])
    .filter((e) => e.call.startsWith(prefix))
    .map((e) => ({ call: e.call, args: e.args })), filterPrefix);
}

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
      const { error: upErr } = await sb.from("games").update({
        settings: {
          teams: { teamA: "Alfa", teamB: "Beta" },
          game: { hasFinal: true, finalQuestionsMode: "pick" },
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

async function openAnon(browser, contexts, path, label, errors) {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const p = await ctx.newPage();
  trackErrors(p, label, errors);
  await p.goto(path, { waitUntil: "domcontentloaded" });
  return p;
}

// ===== 1. Parowanie urządzeń =====

test("control2: parowanie urządzeń — linki renderują się bez błędu, Control widzi je jako online", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-PAIRING-${Date.now()}`);
  const contexts = [];
  try {
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    const errors = [];
    const displayPage = await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    // Nowa gra: żaden wiersz game_state jeszcze nie istnieje, więc Display
    // powinien zostać na czarnym ekranie bez błędu — "wznowienie/pierwsze
    // wejście bez specjalnego przypadku" z planu.
    await expect(displayPage.locator("#blackScreen")).not.toHaveClass(/hidden/, { timeout: 10000 });

    const hostPage = await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", errors);
    await expect(hostPage.locator("#paperText1")).toBeVisible({ timeout: 10000 });

    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    await expect(buzzerPage.locator("#offScreen")).toBeVisible({ timeout: 10000 });

    // Wszystkie 3 urządzenia na JEDNYM ekranie (dokładnie jak stary
    // control.html: "Step 2 (host+buzzer) – usunięty, scalony z step 1") —
    // "Dalej" odblokowuje się dopiero gdy WSZYSTKIE są online.
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/, { timeout: 15000 });
    // .device-row-1 (nie cały .device-row) — od dodania "Udostępnij" każdy
    // wiersz ma DRUGI .badge (znaczek udostępnienia) w device-row-2.
    await expect(page.locator('.device-row[data-device="host"] .device-row-1 .badge')).toHaveText("Online", { timeout: 10000 });
    await expect(page.locator('.device-row[data-device="buzzer"] .device-row-1 .badge')).toHaveText("Online", { timeout: 10000 });

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 2. Pełna runda + wznowienie po przeładowaniu =====

test("control2: pełna runda przez 4 urządzenia + wznowienie Control po przeładowaniu w środku rundy 2", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-FULLGAME-${Date.now()}`, { roundQuestions: TWO_QUESTIONS });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    const hostPage = await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", errors);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await expect(page.getByText("Alfa vs Beta")).toBeVisible();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();

    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Runda 1", { timeout: 10000 });
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    // Regresja: Prowadzący musi widzieć PEŁNĄ treść i punkty KAŻDEJ
    // odpowiedzi od początku rundy, nie tylko już odsłoniętych dla widzów
    // (inaczej nie mógłby ocenić, czy to, co powiedział kontestant, pasuje
    // do listy) — wcześniejsza wersja chowała je pod "______".
    await expect(hostPage.locator("#paperText2")).toContainText("Odpowiedź B (30)", { timeout: 10000 });
    await expect(hostPage.locator("#paperText2")).toContainText("Odpowiedź C (20)", { timeout: 10000 });

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Zatwierdź: Alfa" }).click();

    // Odpowiedź #1 ma najwyższe punkty (40) — trafienie wygrywa pojedynek.
    await revealAnswer(page, 1);
    await revealAnswer(page, 2);
    await revealAnswer(page, 3);
    await page.getByRole("button", { name: "Zakończ rundę" }).click();

    // finalizeRound(): próg (300) nieosiągnięty, pula ma jeszcze pytanie 2.
    await expect(page.locator(".c2-stepper")).toContainText("Runda 2", { timeout: 10000 });

    // ===== KLUCZOWY MOMENT: przeładowanie Control w środku rundy 2 =====
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".c2-stepper")).toContainText("Runda 2", { timeout: 15000 });
    await expect(page.getByText(/Wyniki: A 90/)).toBeVisible({ timeout: 10000 });

    expect(errors, "żadne z 4 urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 3. Mechanika rund: reset pojedynku, pass, kradzież win/loss, R8 =====

test("control2: reset pojedynku, pass, kradzież wygrana/przegrana, odkrywanie reszty, koniec gry + Wróć do moich gier", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-ROUNDMECH-${Date.now()}`, { roundQuestions: TWO_QUESTIONS });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", errors);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();

    // ===== RUNDA 1 =====
    await expect(page.locator(".c2-stepper")).toContainText("Runda 1", { timeout: 10000 });
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Zatwierdź: Alfa" }).click();
    await clickX(page); // A pudłuje -> kolej B
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

    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    await revealAnswer(page, 3); // #3 nieodkryte -> R8

    await expect(page.locator(".c2-stepper")).toContainText("Runda 2", { timeout: 10000 });
    await expect(page.getByText(/Wyniki: A 0 — B 70/)).toBeVisible({ timeout: 10000 });

    // ===== RUNDA 2 =====
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await expect(buzzerPage.getByRole("button", { name: "Przycisk B" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk B" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Beta" })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Zatwierdź: Beta" }).click();

    await revealAnswer(page, 1); // B trafia (40 pkt) -> kontrola B, allowPass
    await armAndConfirm(page.getByRole("button", { name: "Oddaj kontrolę" })); // dawny "Pass" -> kontrola A

    await revealAnswer(page, 2); // A trafia (30 pkt) -> bank 70
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });

    await clickX(page);
    await clickX(page);
    await clickX(page); // 3x pudło A -> auto-KRADZIEŻ dla B

    await clickX(page); // B kradnie, ale też PUDŁUJE -> kradzież PRZEGRANA
    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    await revealAnswer(page, 3); // R8 ponownie

    // Pula wyczerpana (2/2), próg nieosiągnięty, hasFinal=false -> r_gameEnd.
    // Runda 1 dała bank drużynie B (70), runda 2 zostaje przy A (70) -> remis.
    await expect(page.locator(".c2-stepper")).toContainText("Koniec gry", { timeout: 10000 });
    await expect(page.getByText("Wynik końcowy: A 70 — B 70")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Zakończ grę" }).click();
    const finishBtn = page.getByRole("button", { name: "Wróć do moich gier" });
    await expect(finishBtn).toBeVisible({ timeout: 10000 });
    await finishBtn.click();
    await expect(page).toHaveURL(/\/builder/, { timeout: 10000 });
    await page.waitForFunction(() => window.__sbClient, { timeout: 10000 }).catch(() => {});

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 4. Finał: próg -> finał, wczesne zakończenie w połowie mapowania =====

test("control2: próg w rundzie -> finał, wczesne zakończenie po 4/5 pytaniach, pomija gracza 2", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-FINAL-${Date.now()}`, {
    roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odp. warta 300", fixed_points: 300 }] }],
    finalAnswerPts: 50,
  });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", errors);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Zatwierdź: Alfa" }).click();
    await revealAnswer(page, 1); // jedyna odpowiedź, 300 pkt -> bank 300

    // Jedna odpowiedź: revealed==answers od razu, ale canEndRound ustawia
    // się dopiero przy 3. X (DUEL-branch REVEAL_ANSWER tego nie sprawdza).
    await clickX(page);
    await clickX(page);
    await clickX(page);
    await page.getByRole("button", { name: "Zakończ rundę" }).click();

    // Próg (300) trafiony, hasFinal=true, finalQuestionsMode="pick" + 5
    // potwierdzonych pytań -> prosto do finału.
    await expect(page.locator(".c2-stepper")).toContainText("Finał", { timeout: 10000 });
    await page.getByRole("button", { name: "Rozpocznij finał" }).click();

    await expect(page.locator(".c2-stepper")).toContainText("Finał — gracz 1, wpisywanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Rozpocznij odliczanie (15s)" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();

    for (let i = 0; i < 4; i++) {
      await expect(page.locator(".c2-stepper")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 10000 });
      await page.getByRole("button", { name: "Odp. finałowa (50)" }).click();
      // "Pokaż odpowiedź"/"Pokaż punkty" — kafle odsłaniania (zaznacz ->
      // potwierdź, jak odpowiedzi w Rundach), nazwa stała, druga linijka to
      // żywy podgląd (aria-hidden, więc dostępna nazwa nie zawiera wartości).
      await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
      await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
      await expect(page.getByRole("button", { name: "Pokaż punkty" })).toContainText("50", { timeout: 10000 });
      if (i < 3) await page.getByRole("button", { name: "Dalej" }).click();
    }

    // Po 4. pytaniu suma = 200 = finalTarget -> natychmiastowy skok do
    // f_end, BEZ 5. pytania i BEZ gracza 2.
    await expect(page.locator(".c2-stepper")).toContainText("Koniec gry", { timeout: 10000 });
    await expect(page.getByText("Suma finału: 200")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Zakończ grę", exact: true }).click();
    const finishBtn = page.getByRole("button", { name: "Wróć do moich gier" });
    await expect(finishBtn).toBeVisible({ timeout: 10000 });
    await finishBtn.click();
    await expect(page).toHaveURL(/\/builder/, { timeout: 10000 });
    await page.waitForFunction(() => window.__sbClient, { timeout: 10000 }).catch(() => {});

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 5. physicalBuzzer + noHostTablet =====

test("control2: physicalBuzzer + noHostTablet — urządzenia pominięte, ręczny wybór drużyny", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-PHYSBUZZ-${Date.now()}`, {
    roundQuestions: [TWO_QUESTIONS[0]],
  });
  const contexts = [];
  try {
    // Wyświetlacz jest wymagany ZAWSZE — nie ma dla niego opt-outu (patrz
    // control/js/app.js's requiredOnline) — więc nawet w tym scenariuszu
    // (host+buzzer pominięte) trzeba go realnie podłączyć, inaczej "Dalej"
    // zostaje trwale zablokowane.
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });

    await page.getByLabel("Fizyczny przycisk").check();
    await page.getByLabel("Nie używaj tabletu prowadzącego").check();
    await expect(page.locator('.device-row[data-device="buzzer"]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('.device-row[data-device="host"]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText("Przycisk pominięty")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Prowadzący pominięty")).toBeVisible({ timeout: 10000 });

    // Zgłoszone: przycisk nieaktywnego urządzenia w topbarze ma zniknąć
    // CAŁKOWICIE (nie tylko przygasnąć) — już na kroku Urządzeń, nie
    // dopiero na Podsumowaniu. Wyświetlacz (zawsze wymagany) zostaje.
    await expect(page.locator("#dotHostRow")).toHaveClass(/\bhidden\b/, { timeout: 5000 });
    await expect(page.locator("#dotBuzzerRow")).toHaveClass(/\bhidden\b/, { timeout: 5000 });
    await expect(page.locator("#dotDisplayRow")).not.toHaveClass(/\bhidden\b/);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    // Utrzymuje się na Podsumowaniu i dalej w rozgrywce, nie tylko na
    // samym kroku Urządzeń.
    await expect(page.locator("#dotHostRow")).toHaveClass(/\bhidden\b/);
    await expect(page.locator("#dotBuzzerRow")).toHaveClass(/\bhidden\b/);
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await expect(page.locator("#dotHostRow")).toHaveClass(/\bhidden\b/);
    await expect(page.locator("#dotBuzzerRow")).toHaveClass(/\bhidden\b/);

    // Bez Buzzera na ekranie: zaznacz -> anuluj -> zaznacz -> potwierdź.
    // Przyciski pokazują realną nazwę drużyny (Alfa/Beta), nie kod "A"/"B".
    await expect(page.getByRole("button", { name: "Alfa" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Alfa" }).click();
    await expect(page.getByRole("button", { name: "Potwierdź: Alfa" })).toBeVisible();
    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(page.getByRole("button", { name: "Alfa" })).toBeVisible();
    await page.getByRole("button", { name: "Beta" }).click();
    await expect(page.getByRole("button", { name: "Potwierdź: Beta" })).toBeVisible();
    await page.getByRole("button", { name: "Potwierdź: Beta" }).click();

    await revealAnswer(page, 1); // B trafia -> przejmuje kontrolę
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 6. "Zacznij od nowa" =====

test("control2: \"Zacznij od nowa\" w trakcie gry wraca do D0", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-RESTART-${Date.now()}`);
  const contexts = [];
  try {
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Rozpoczęcie gry", { timeout: 10000 });

    await page.locator("#btnStartOver").click();
    await page.getByRole("button", { name: "Tak" }).click();

    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 10000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 7. Druga karta Control blokowana (resource-lock) =====

test("control2: druga karta Control na tę samą grę jest zablokowana (resource-lock, kontekst \"control\")", async ({ page, context }) => {
  await loginAsTestUser(page, context);
  const game = await makeGame(page, `E2E-CONTROL2-LOCK-${Date.now()}`);
  try {
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });

    // Druga karta (ta sama sesja/konto, INNY tab_id — sessionStorage nie
    // jest dzielony między kartami) musi zobaczyć overlay blokady.
    const secondTab = await context.newPage();
    await secondTab.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(secondTab.locator("#resourceLockGuard")).toBeVisible({ timeout: 15000 });
    await expect(secondTab.locator(".stepTitle")).toHaveCount(0);
    await secondTab.close();
  } finally {
    await deleteGame(page, game.id);
  }
});

// ===== 8. QR host/buzzer niezależne na Display =====

// Przycisk "QR na wyświetlaczu"/"Ukryj QR" żyje wewnątrz `.device-row` dla
// danego urządzenia (control2/js/ui.js's deviceRow()) — po każdym kliknięciu
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
// (nie samo puste .qr-grid) — control2/js/app.js's syncQrDisplay() ustawia
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

test("control2: QR na wyświetlaczu — host i buzzer niezależne, każdy z osobna i oba naraz", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-DUALQR-${Date.now()}`);
  const contexts = [];
  try {
    const displayPage = await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
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
// I Host w momencie startu rundy 2, nie zostać zasłonięte do końca gry.

test("control2: finał — obaj gracze, wszystkie 10 pytań, naturalne wygaśnięcie timera, powtórzenie, odsłonięcie P1 przy starcie P2", async ({ page, browser }) => {
  test.setTimeout(180_000); // + realne 15s oczekiwania na naturalne wygaśnięcie timera gracza 1
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-FINALFULL-${Date.now()}`, {
    roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odp. warta 300", fixed_points: 300 }] }],
    finalAnswerPts: 15,
  });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    const displayPage = await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    const hostPage = await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", errors);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    // ===== Runda jedyna: A wygrywa próg finału (300 pkt) =====
    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Zatwierdź: Alfa" }).click();
    await revealAnswer(page, 1);
    await clickX(page);
    await clickX(page);
    await clickX(page);
    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Finał", { timeout: 10000 });

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
        && calls.some((c) => c.call === "api.small.leftDigits" && c.args[0] === "15");
    }, { timeout: 10000 }).toBe(true);
    await expect(hostPage.locator("#cover2")).toHaveClass(/coverOn/, { timeout: 10000 });

    // ===== F2/F3: gracz 1 wpisuje, timer wygasa NATURALNIE (bez klikania "Dalej") =====
    await expect(page.locator(".c2-stepper")).toContainText("Finał — gracz 1, wpisywanie", { timeout: 10000 });
    const p1Inputs = page.locator("#app input[type=text]");
    await expect(p1Inputs).toHaveCount(5, { timeout: 10000 });
    for (let i = 0; i < 5; i++) await p1Inputs.nth(i).fill(`Odp. finałowa`);

    await clearSfxLog(page);
    await page.getByRole("button", { name: "Rozpocznij odliczanie (15s)" }).click();
    // Bez klikania niczego: dograny dziś zegarek w control2/js/app.js sam
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
      await expect(page.locator(".c2-stepper")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 10000 });
      await page.getByRole("button", { name: "Odp. finałowa (15)" }).click();
      await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
      await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
      await page.getByRole("button", { name: "Dalej" }).click();
    }
    // Suma 75 < finalTarget (200) — BEZ wczesnego wyjścia, prosto do F6.
    await expect(page.getByText("Suma finału: 75")).toBeVisible({ timeout: 10000 });

    // ===== F6: przejście do gracza 2 — TU jest sedno testu =====
    await expect(page.locator(".c2-stepper")).toContainText("Finał — start rundy 2", { timeout: 10000 });
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
    // Host: odsłania się W TYM SAMYM momencie (naprawiona luka — dawniej
    // zostawał zasłonięty do końca gry mimo że Display już odsłaniał).
    await expect(hostPage.locator("#cover2")).not.toHaveClass(/coverOn/, { timeout: 10000 });

    // ===== F7: gracz 2 — pytanie #1 oznaczone jako "powtórzenie" =====
    await expect(page.locator(".c2-stepper")).toContainText("Finał — gracz 2, wpisywanie", { timeout: 10000 });
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Powtórzenie" }).first().click();
    await expect.poll(() => getSfxKeys(page), { timeout: 5000 }).toEqual(expect.arrayContaining(["answer_repeat"]));

    const p2Inputs = page.locator("#app input[type=text]");
    for (let i = 1; i < 5; i++) await p2Inputs.nth(i).fill("Odp. finałowa");
    await page.getByRole("button", { name: "Rozpocznij odliczanie (20s)" }).click();
    // Tym razem NIE czekamy na naturalne wygaśnięcie — klikamy "Dalej" od
    // razu (jak w teście 4), sprawdzając DRUGĄ naprawę z dzisiejszego audytu:
    // START_MAPPING musi wyzerować timer, inaczej zostałby "running" na zawsze.
    await page.getByRole("button", { name: "Dalej" }).click();

    // ===== F8/F9: mapowanie gracza 2 — pytanie #1 to SKIP (powtórzenie), reszta MATCH =====
    for (let i = 0; i < 5; i++) {
      await expect(page.locator(".c2-stepper")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 10000 });
      if (i > 0) await page.getByRole("button", { name: "Odp. finałowa (15)" }).click();
      await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
      await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
      await page.getByRole("button", { name: "Dalej" }).click();
    }
    // 75 (gracz 1) + 0 (powtórzenie) + 4x15 (gracz 2) = 135 < 200 — pełne 10/10, bez wczesnego wyjścia.
    await expect(page.locator(".c2-stepper")).toContainText("Koniec gry", { timeout: 10000 });
    await expect(page.getByText("Suma finału: 135")).toBeVisible({ timeout: 10000 });

    // ===== F10: koniec finału =====
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Zakończ grę", exact: true }).click();
    await waitForSfxKeysAnyOrder(page, ["round_transition", "reveal"], 15000); // final_end combo (synced, kolejność zależy od realnych czasów trwania plików)
    await expect.poll(async () => {
      const calls = await getDisplayCalls(displayPage, "api.indicator.set");
      return calls.some((c) => c.args[0] === "OFF");
    }, { timeout: 10000 }).toBe(true);

    expect(errors, "żadne z urządzeń nie powinno rzucić błędu JS: " + errors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 10. Mnożnik rundy =====

test("control2: mnożnik rundy — runda 4. z domyślnym ×2 faktycznie przemnaża bank", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const roundQ = (n) => ({ ord: n, text: `Pytanie rundowe ${n}`, answers: [{ ord: 1, text: "Jedyna odpowiedź", fixed_points: 40 }] });
  const game = await makeGame(page, `E2E-CONTROL2-MULTIPLIER-${Date.now()}`, {
    roundQuestions: [roundQ(1), roundQ(2), roundQ(3), roundQ(4)],
  });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();

    // Rundy 1-3: mnożnik x1 (domyślne roundMultipliers [1,1,1,2,3]) — A wygrywa za każdym razem, bank 40.
    for (let round = 1; round <= 3; round++) {
      await expect(page.locator(".c2-stepper")).toContainText(`Runda ${round}`, { timeout: 10000 });
      await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
      await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
      await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
      await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
      await page.getByRole("button", { name: "Zatwierdź: Alfa" }).click();
      await revealAnswer(page, 1);
      await clickX(page);
      await clickX(page);
      await clickX(page);
      await page.getByRole("button", { name: "Zakończ rundę" }).click();
    }
    await expect(page.getByText(/Wyniki: A 120/)).toBeVisible({ timeout: 10000 });

    // Runda 4: mnożnik x2 — bank 40 ma dać +80, nie +40.
    await expect(page.locator(".c2-stepper")).toContainText("Runda 4", { timeout: 10000 });
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Zatwierdź: Alfa" }).click();
    await revealAnswer(page, 1);
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });
    await clickX(page);
    await clickX(page);
    await clickX(page);
    await page.getByRole("button", { name: "Zakończ rundę" }).click();

    await expect(page.getByText(/Wyniki: A 200/)).toBeVisible({ timeout: 10000 }); // 120 + 40x2, nie 160
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 11. Wyścig dwóch przycisków Buzzera =====

test("control2: wyścig — oba przyciski Buzzera naciśnięte w tej samej chwili, tylko jeden zaakceptowany", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-BUZZRACE-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
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

    // renderDuelAccept() pokazuje oba kafle "Zatwierdź: <drużyna>" od razu,
    // ale tylko TEN, kto naprawdę wygrał wyścig, budzi się (enabled) — drugi
    // zostaje wyszarzonym placeholderem. Trzeba odtworzyć literę drużyny z
    // nazwy, żeby wskazać właściwy #btnA/#btnB na stronie Buzzera.
    const acceptAlfa = page.getByRole("button", { name: "Zatwierdź: Alfa" });
    const acceptBeta = page.getByRole("button", { name: "Zatwierdź: Beta" });
    await expect.poll(async () => (await acceptAlfa.isEnabled()) || (await acceptBeta.isEnabled()), { timeout: 10000 }).toBe(true);
    const winner = (await acceptAlfa.isEnabled()) ? "A" : "B";
    const loser = winner === "A" ? "B" : "A";

    // Buzzer i Control muszą się zgadzać co do tego, KTO wygrał wyścig.
    await expect(buzzerPage.locator(`#btn${winner}`)).toHaveClass(/lit/, { timeout: 10000 });
    await expect(buzzerPage.locator(`#btn${loser}`)).toHaveClass(/dim/, { timeout: 10000 });
    await expect(buzzerPage.locator(`#btn${winner}`)).not.toHaveClass(/dim/);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 12. Wyciszenie dźwięku =====

test("control2: wyciszenie dźwięku — po Mute żaden klucz SFX się nie odtwarza", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-MUTE-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();

    // Referencja: BEZ wyciszenia start rundy gra normalnie.
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await waitForSfxSequence(page, ["round_transition"], 10000);

    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await page.locator("#btnMute").click();
    await expect(page.locator("#btnMute")).toHaveText("🔇");

    await clearSfxLog(page);
    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Zatwierdź: Alfa" }).click();
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
// sprawdź mute na chwilę w jednej z rund np. i pokrec głośności". Przechodzi
// przez CAŁĄ ścieżkę na raz: przełącznik "Dźwięk" w kroku Urządzeń ->
// #audioUnlockScreen na Display (musi się pojawić, kliknięcie musi je
// schować) -> głośność ustawiona w modalu ustawień PRZED startem gry musi
// dotrzeć do Display (nie do Control — sprawdzone osobno, że Control
// zostaje cicho przez cały czas) -> Mute (współdzielony, patrz
// control2/js/soundReactor.js) wyciszony na chwilę w środku rundy, potem
// wznowiony — ten sam #btnMute co w teście "wyciszenie dźwięku" wyżej,
// tylko że tym razem wycisza urządzenie, które FAKTYCZNIE gra (Display).

test("control2: dźwięk ze źródła Wyświetlacz — odblokowanie, głośność z ustawień, chwilowe mute w rundzie", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-SOUNDSRC-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    const displayPage = await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", []);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });

    // Przed przełączeniem: Display nigdy nie pokazuje ekranu odblokowania.
    await expect(displayPage.locator("#audioUnlockScreen")).toHaveClass(/\bhidden\b/);

    await page.getByLabel("Odtwarzaj dźwięk na Wyświetlaczu zamiast Panelu sterowania").check();
    await expect(displayPage.locator("#audioUnlockScreen")).not.toHaveClass(/\bhidden\b/, { timeout: 10000 });
    await displayPage.locator("#btnAudioUnlock").click();
    await expect(displayPage.locator("#audioUnlockScreen")).toHaveClass(/\bhidden\b/);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });

    // Głośność ustawiona TERAZ (przed startem gry) musi dotrzeć do Display —
    // control2/js/app.js's onGsModalClose() odświeża store.state z fresh
    // games.settings po zamknięciu modala, co obejmuje teraz też `sound`.
    await page.getByRole("button", { name: "Zmień ustawienia" }).click();
    await expect(page.locator("#gsOverlay")).not.toHaveClass(/hidden/, { timeout: 5000 });
    const gsFrame = page.frameLocator("#gsFrame");
    await gsFrame.locator('.gs-sidebar-item[data-cat="sound"]').click();
    const revealSlider = gsFrame.locator('input.sfx-vol[data-sfx-vol="reveal"]');
    await expect(revealSlider).toBeVisible({ timeout: 10000 });
    // .fill() na <input type="range"> nie zawsze niezawodnie odpala "input"
    // (na czym wisi handler ustawiający localSettings.sound.volumes w
    // js/pages/game-settings2.js) — ustawiamy value i wysyłamy zdarzenie
    // wprost, bez zależności od tego, jak dana wersja Playwrighta obsługuje
    // range input.
    await revealSlider.evaluate((el) => {
      el.value = "40";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await gsFrame.getByRole("button", { name: "Zapisz wszystko" }).click();
    await page.locator("#gsOverlay").click({ position: { x: 5, y: 5 } });
    await page.locator("#gsOverlay").waitFor({ state: "hidden", timeout: 10000 });

    await expect.poll(
      () => displayPage.evaluate(() => localStorage.getItem("sfx_vol_reveal")),
      { timeout: 10000, message: "głośność 'reveal' skonfigurowana w ustawieniach powinna dotrzeć do Display" }
    ).toBe("0.4");

    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
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
    await page.getByRole("button", { name: "Zatwierdź: Alfa" }).click();
    await clearSfxLog(displayPage);
    await revealAnswer(page, 1); // Odpowiedź A, 40 pkt -> wygrywa pojedynek
    await waitForSfxSequence(displayPage, ["answer_correct"], 10000);

    // ===== Mute na chwilę w tej samej rundzie — odpowiedź #2 podczas wyciszenia =====
    await page.locator("#btnMute").click();
    await expect(page.locator("#btnMute")).toHaveText("🔇");
    await clearSfxLog(displayPage);
    await revealAnswer(page, 2); // Odpowiedź B, 30 pkt
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });
    expect(await getSfxKeys(displayPage), "wyciszone -> Display nie powinien nic odtworzyć").toEqual([]);

    // ===== Un-mute — odpowiedź #3 znów słyszalna =====
    await page.locator("#btnMute").click();
    await expect(page.locator("#btnMute")).toHaveText("🔊");
    await clearSfxLog(displayPage);
    await revealAnswer(page, 3); // Odpowiedź C, 20 pkt -> wszystko odkryte
    await waitForSfxSequence(displayPage, ["answer_correct"], 10000);

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
// settings.uiLang do game_state -> odczyt przez host2/js/main.js -> setUiLang
// -> host2/js/render.js's t()-owane tytuły faz. Regresja na dzisiejszą
// naprawę: wcześniej host2/js/render.js miał te napisy zaszyte na sztywno po
// polsku, więc nawet gdyby cała reszta ścieżki działała, treść by się nie
// zmieniła.

test("control2: zmiana języka w Control propaguje się do Hosta — tytuł fazy faktycznie się tłumaczy", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-LANG-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const hostPage = await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", []);
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);
    await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();

    await expect(hostPage.locator("#paperText1")).toContainText("PRZYCISK", { timeout: 10000 });

    await page.locator(".lang-btn").click();
    await page.locator('.lang-option[data-lang="en"]').click();

    await expect(hostPage.locator("#paperText1")).toContainText("BUZZER", { timeout: 10000 });
    await expect(hostPage.locator("#paperText1")).not.toContainText("PRZYCISK");
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 14. Modal ustawień gry — zmiana nazwy drużyny odświeża podgląd Wyświetlacza =====
//
// Zgłoszone: podgląd Wyświetlacza w modalu ustawień (js/pages/game-settings2.js)
// był całkowicie martwy — sendDisplayCmd() w trybie modalu tylko przekazywał
// tekstowe komendy do window.parent, licząc na Control, żeby je dalej
// przekazał "prawdziwemu" Displayowi (czego Control v2 nigdy nie robi —
// komend już nie ma). Naprawa: modal sam osadza /display2?preview=1 i
// przesyła mu postMessage familiada:preview-row, ten sam mechanizm co D3.
// Ten test dowodzi, że to faktycznie działa: zmiana nazwy drużyny w polu
// formularza musi się pojawić w window.__displayLog ZAGNIEŻDŻONEGO iframe'a
// podglądu (display2/js/main.js's instrumentSceneApi(), dodane też do trybu
// podglądu w tej samej naprawie) jako wywołanie api.small.long1(...).
test("control2: modal ustawień gry — zmiana nazwy drużyny odświeża podgląd Wyświetlacza", async ({ page }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-GSPREVIEW-${Date.now()}`);
  try {
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });

    await page.getByRole("button", { name: "Zmień ustawienia" }).click();
    await expect(page.locator("#gsOverlay")).not.toHaveClass(/hidden/, { timeout: 5000 });

    const gsFrame = page.frameLocator("#gsFrame");
    // Kategoria "Drużyny" jest domyślnie aktywna po otwarciu modala —
    // pole nazwy drużyny A jest widoczne od razu, bez przełączania zakładek.
    await expect(gsFrame.locator("#gsTeamA")).toBeVisible({ timeout: 10000 });

    // Zagnieżdżony iframe podglądu (display2/js/main.js's bootPreview()) —
    // dostępny wprost z page.frames() (ten sam origin, zwykła strona), nie
    // przez frameLocator zagnieżdżony w innym frameLocator.
    const previewFrame = () => page.frames().find((f) => f.url().includes("/display2") && f.url().includes("preview=1"));
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
    await deleteGame(page, game.id);
  }
});

// ===== 15. Blokada logo — Control (i modal ustawień gry) czekają, aż
// logo-editor.js zwolni logo referencowane przez grę =====
//
// js/core/resource-lock.js's guardResourceBusy() — dodane w tej sesji do
// control2/js/app.js i js/pages/game-settings2.js (patrz komentarze przy
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
    layers: [{ color: "main", rows: Array.from({ length: 10 }, () => " ".repeat(30)) }],
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

test("control2: zablokowany, gdy logo gry jest edytowane w logo-editorze — i wznawia się samo po zwolnieniu", async ({ page, context }) => {
  await loginAsTestUser(page, context);

  const logoName = `E2E-CONTROL2-LOGOLOCK-${Date.now()}`;
  const { logoId, gameId } = await page.evaluate(async ({ name, payload }) => {
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
      .select("id").single();
    if (gameErr) throw new Error("insert game failed: " + gameErr.message);
    return { logoId: logo.id, gameId: game.id };
  }, { name: logoName, payload: blankGlyphPayload() });

  const lockTabId = `e2e-fake-logo-editor-${Date.now()}`;
  try {
    await acquireLogoLock(page, logoId, lockTabId);

    await page.goto(`/control2?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#resourceLockGuardMsg")).toContainText("edytowane", { timeout: 5000 });
    // Zablokowany PRZED wyrenderowaniem czegokolwiek z #app (guardResourceBusy
    // jest wołane zanim Control zdąży namalować krok "Urządzenia").
    await expect(page.locator(".stepTitle")).toHaveCount(0);

    await releaseLogoLock(page, logoId, lockTabId);

    // Odzyskanie działa DWIEMA niezależnymi drogami (broadcast RELEASED +
    // polling co 5s) — ten test celowo nie synchronizuje się z broadcastem,
    // żeby przy okazji sprawdzić fallback pollingu.
    await expect(page.locator("#resourceLockGuard")).toBeHidden({ timeout: 15000 });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
  } finally {
    await releaseLogoLock(page, logoId, lockTabId);
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
    await page.evaluate(async (id) => { await window.__sbClient.from("user_logos").delete().eq("id", id); }, logoId);
  }
});
