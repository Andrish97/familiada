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
//      mnożnik, koniec gry bez finału + "Zakończ rozgrywkę".
//   4. Finał: próg w rundzie -> finał, wczesne zakończenie po osiągnięciu
//      celu w połowie mapowania gracza 1 (pomija gracza 2 całkowicie).
//   5-8. Nietypowe zachowania operatora: physicalBuzzer + noHostTablet,
//      "Zacznij od nowa", "Cofnij ostatnią akcję", druga karta Control
//      blokowana (resource-lock), QR host/buzzer niezależne na Display.
//   9. QR host/buzzer niezależne na Display.
//   10. Finał BEZ wczesnego wyjścia — obaj gracze, wszystkie 10 pytań,
//       naturalne wygaśnięcie timera gracza 1, flaga "powtórzenie" u
//       gracza 2, i — najważniejsze — dowód, że odpowiedzi gracza 1
//       faktycznie wracają na Display I Host w momencie startu rundy 2
//       (dokładnie ta luka, która była naprawiana w tej sesji audytu).
//   11. Mnożnik rundy — runda 4. z ×2 faktycznie przemnaża bank.
//   12. Wyścig dwóch przycisków Buzzera naciśniętych w tej samej chwili —
//       tylko jeden zaakceptowany, oba urządzenia się zgadzają.
//   13. Wyciszenie dźwięku — po kliknięciu Mute żaden klucz SFX się nie
//       odtwarza mimo normalnie grającej akcji.
//   14. Zmiana języka propaguje się do Hosta, w tym samą TREŚĆ tytułu fazy
//       (nie tylko chrome strony) — regresja na dzisiejszą naprawę i18n.
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

async function getDisplayCalls(displayPage, filterPrefix = "") {
  return displayPage.evaluate((prefix) => (window.__displayLog || [])
    .filter((e) => e.call.startsWith(prefix))
    .map((e) => ({ call: e.call, args: e.args })), filterPrefix);
}

async function makeGame(page, name, { settings = {}, roundQuestions = [], finalAnswerPts = null } = {}) {
  return page.evaluate(async ({ name, settings, roundQuestions, finalAnswerPts }) => {
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
        .from("questions").insert({ game_id: g.id, ord: q.ord, text: q.text }).select("id").single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);
      const { error: aErr } = await sb.from("answers").insert(
        q.answers.map((a) => ({ question_id: qRow.id, ...a }))
      );
      if (aErr) throw new Error("insert answers failed: " + aErr.message);
    }

    let finalPicked = [];
    if (finalAnswerPts) {
      for (let i = 1; i <= 5; i++) {
        const { data: fq, error: fqErr } = await sb
          .from("questions").insert({ game_id: g.id, ord: 100 + i, text: `Pytanie finałowe ${i}` }).select("id").single();
        if (fqErr) throw new Error("insert final question failed: " + fqErr.message);
        const { error: faErr } = await sb.from("answers").insert([
          { question_id: fq.id, ord: 1, text: "Odpowiedź finałowa", fixed_points: finalAnswerPts },
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
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });

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

    await expect(page.locator("#dotDisplay")).toHaveClass(/\bok\b/, { timeout: 15000 });

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Prowadzący i Przycisk", { timeout: 10000 });
    await expect(page.locator("#dotHost")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator("#dotBuzzer")).toHaveClass(/\bok\b/, { timeout: 15000 });
    await expect(page.locator('.device-row[data-device="host"] .badge')).toHaveText("Online", { timeout: 10000 });
    await expect(page.locator('.device-row[data-device="buzzer"] .badge')).toHaveText("Online", { timeout: 10000 });

    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
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
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });

    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    const hostPage = await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", errors);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Prowadzący i Przycisk", { timeout: 15000 });
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await expect(page.getByText("Alfa vs Beta")).toBeVisible();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Runda 1", { timeout: 10000 });
    await page.getByRole("button", { name: "Start rundy" }).click();

    // Regresja: Prowadzący musi widzieć PEŁNĄ treść i punkty KAŻDEJ
    // odpowiedzi od początku rundy, nie tylko już odsłoniętych dla widzów
    // (inaczej nie mógłby ocenić, czy to, co powiedział kontestant, pasuje
    // do listy) — wcześniejsza wersja chowała je pod "______".
    await expect(hostPage.locator("#paperText2")).toContainText("Odpowiedź B (30)", { timeout: 10000 });
    await expect(hostPage.locator("#paperText2")).toContainText("Odpowiedź C (20)", { timeout: 10000 });

    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();

    // Odpowiedź #1 ma najwyższe punkty (40) — trafienie wygrywa pojedynek.
    await page.getByRole("button", { name: "#1" }).click();
    await page.getByRole("button", { name: "#2" }).click();
    await page.getByRole("button", { name: "#3" }).click();
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

test("control2: reset pojedynku, pass, kradzież wygrana/przegrana, odkrywanie reszty, koniec gry + Zakończ rozgrywkę", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-ROUNDMECH-${Date.now()}`, { roundQuestions: TWO_QUESTIONS });
  const contexts = [];
  const errors = [];
  try {
    trackErrors(page, "control", errors);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });

    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", errors);
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", errors);
    await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", errors);

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Prowadzący i Przycisk", { timeout: 15000 });
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();

    // ===== RUNDA 1 =====
    await expect(page.locator(".c2-stepper")).toContainText("Runda 1", { timeout: 10000 });
    await page.getByRole("button", { name: "Start rundy" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();
    await page.getByRole("button", { name: "X", exact: true }).click(); // A pudłuje -> kolej B
    await page.getByRole("button", { name: "X", exact: true }).click(); // B pudłuje też -> RESET

    await expect(buzzerPage.getByRole("button", { name: "Buzzer B" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer B" }).click();
    await expect(page.getByText("Zgłoszono: B")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();

    await page.getByRole("button", { name: "#1" }).click(); // B trafia (40 pkt) -> wygrywa pojedynek
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click(); // 3x pudło B -> auto-KRADZIEŻ dla A

    await page.getByRole("button", { name: "#2" }).click(); // A kradnie WYGRANĄ (30 pkt)
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    await page.getByRole("button", { name: "#3" }).click(); // #3 nieodkryte -> R8

    await expect(page.locator(".c2-stepper")).toContainText("Runda 2", { timeout: 10000 });
    await expect(page.getByText(/Wyniki: A 70/)).toBeVisible({ timeout: 10000 });

    // ===== RUNDA 2 =====
    await page.getByRole("button", { name: "Start rundy" }).click();
    await expect(buzzerPage.getByRole("button", { name: "Buzzer B" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer B" }).click();
    await expect(page.getByText("Zgłoszono: B")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();

    await page.getByRole("button", { name: "#1" }).click(); // B trafia (40 pkt) -> kontrola B, allowPass
    await page.getByRole("button", { name: "Pass" }).click(); // "Oddaj pytanie" -> kontrola A

    await page.getByRole("button", { name: "#2" }).click(); // A trafia (30 pkt) -> bank 70
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click(); // 3x pudło A -> auto-KRADZIEŻ dla B

    await page.getByRole("button", { name: "X", exact: true }).click(); // B kradnie, ale też PUDŁUJE -> kradzież PRZEGRANA
    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    await page.getByRole("button", { name: "#3" }).click(); // R8 ponownie

    // Pula wyczerpana (2/2), próg nieosiągnięty, hasFinal=false -> r_gameEnd.
    // Wynik: A 70+70=140, B 0.
    await expect(page.locator(".c2-stepper")).toContainText("Koniec gry", { timeout: 10000 });
    await expect(page.getByText("Wynik końcowy: A 140 — B 0")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Pokaż koniec gry" }).click();
    const finishBtn = page.getByRole("button", { name: "Zakończ rozgrywkę" });
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
    roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odpowiedź warta 300", fixed_points: 300 }] }],
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
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Start rundy" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();
    await page.getByRole("button", { name: "#1" }).click(); // jedyna odpowiedź, 300 pkt -> bank 300

    // Jedna odpowiedź: revealed==answers od razu, ale canEndRound ustawia
    // się dopiero przy 3. X (DUEL-branch REVEAL_ANSWER tego nie sprawdza).
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "Zakończ rundę" }).click();

    // Próg (300) trafiony, hasFinal=true, finalQuestionsMode="pick" + 5
    // potwierdzonych pytań -> prosto do finału.
    await expect(page.locator(".c2-stepper")).toContainText("Finał", { timeout: 10000 });
    await page.getByRole("button", { name: "Start finału" }).click();

    await expect(page.locator(".c2-stepper")).toContainText("Finał — gracz 1, wpisywanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Start timera" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();

    for (let i = 0; i < 4; i++) {
      await expect(page.locator(".c2-stepper")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 10000 });
      await page.getByRole("button", { name: "Odpowiedź finałowa (50)" }).click();
      await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
      await page.getByRole("button", { name: "Pokaż punkty" }).click();
      await expect(page.getByText("Punkty: 50")).toBeVisible({ timeout: 10000 });
      if (i < 3) await page.getByRole("button", { name: "Dalej" }).click();
    }

    // Po 4. pytaniu suma = 200 = finalTarget -> natychmiastowy skok do
    // f_end, BEZ 5. pytania i BEZ gracza 2.
    await expect(page.locator(".c2-stepper")).toContainText("Finał — koniec", { timeout: 10000 });
    await expect(page.getByText("Suma finału: 200")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Zakończ", exact: true }).click();
    const finishBtn = page.getByRole("button", { name: "Zakończ rozgrywkę" });
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

test("control2: physicalBuzzer + noHostTablet — urządzenia pominięte, ręczny wybór drużyny", async ({ page }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-PHYSBUZZ-${Date.now()}`, {
    roundQuestions: [TWO_QUESTIONS[0]],
  });
  try {
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Prowadzący i Przycisk", { timeout: 10000 });

    await page.getByLabel("Fizyczny przycisk").check();
    await page.getByLabel("Nie używaj tabletu prowadzącego").check();
    await expect(page.locator('.device-row[data-device="buzzer"]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('.device-row[data-device="host"]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText("Przycisk pominięty")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Prowadzący pominięty")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Start rundy" }).click();

    // Bez Buzzera na ekranie: zaznacz -> anuluj -> zaznacz -> potwierdź.
    await expect(page.getByRole("button", { name: "Drużyna A" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Drużyna A" }).click();
    await expect(page.getByText("Wybrano: A")).toBeVisible();
    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(page.getByRole("button", { name: "Drużyna A" })).toBeVisible();
    await page.getByRole("button", { name: "Drużyna B" }).click();
    await expect(page.getByText("Wybrano: B")).toBeVisible();
    await page.getByRole("button", { name: "Potwierdź" }).click();

    await page.getByRole("button", { name: "#1" }).click(); // B trafia -> przejmuje kontrolę
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });
  } finally {
    await deleteGame(page, game.id);
  }
});

// ===== 6. "Zacznij od nowa" =====

test("control2: \"Zacznij od nowa\" w trakcie gry wraca do D0", async ({ page }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-RESTART-${Date.now()}`);
  try {
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Rundy — wprowadzenie", { timeout: 10000 });

    await page.locator("#btnStartOver").click();
    await page.getByRole("button", { name: "Tak" }).click();

    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 10000 });
  } finally {
    await deleteGame(page, game.id);
  }
});

// ===== 7. "Cofnij ostatnią akcję" =====

test("control2: \"Cofnij ostatnią akcję\" cofa ostatni zapis (3. pudło -> z powrotem 2.)", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-UNDO-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Start rundy" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();
    await page.getByRole("button", { name: "#1" }).click(); // A przejmuje kontrolę, bank 40

    await expect(page.getByRole("button", { name: "Kradzież" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "X", exact: true }).click(); // xA=1
    await page.getByRole("button", { name: "X", exact: true }).click(); // xA=2
    await expect(page.getByRole("button", { name: "Kradzież" })).toBeVisible();
    await page.getByRole("button", { name: "X", exact: true }).click(); // xA=3 -> auto-STEAL, "Kradzież" znika
    await expect(page.getByRole("button", { name: "Kradzież" })).toHaveCount(0, { timeout: 10000 });

    await page.locator("#btnUndo").click();
    // Cofnięcie 3. pudła -> z powrotem w PLAY z xA=2 -> "Kradzież" znów dostępna.
    await expect(page.getByRole("button", { name: "Kradzież" })).toBeVisible({ timeout: 10000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 8. Druga karta Control blokowana (resource-lock) =====

test("control2: druga karta Control na tę samą grę jest zablokowana (resource-lock, kontekst \"control\")", async ({ page, context }) => {
  await loginAsTestUser(page, context);
  const game = await makeGame(page, `E2E-CONTROL2-LOCK-${Date.now()}`);
  try {
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });

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

// ===== 9. QR host/buzzer niezależne na Display =====

test("control2: QR na wyświetlaczu — host i buzzer niezależne, jeden LUB oba naraz", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-DUALQR-${Date.now()}`);
  const contexts = [];
  try {
    const displayPage = await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`, "display", []);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Prowadzący i Przycisk", { timeout: 10000 });

    await page.locator('.device-row[data-device="host"] button', { hasText: "QR na wyświetlaczu" }).click();
    await expect(displayPage.locator("#qrScreen")).not.toHaveClass(/hidden/, { timeout: 10000 });
    await expect(displayPage.locator(".qr-grid")).toHaveClass(/qr-single/);
    await expect(displayPage.locator("#qrHostCard")).not.toHaveClass(/hidden/);
    await expect(displayPage.locator("#qrBuzzerCard")).toHaveClass(/hidden/);

    await page.locator('.device-row[data-device="buzzer"] button', { hasText: "QR na wyświetlaczu" }).click();
    await expect(displayPage.locator(".qr-grid")).not.toHaveClass(/qr-single/, { timeout: 10000 });
    await expect(displayPage.locator("#qrHostCard")).not.toHaveClass(/hidden/);
    await expect(displayPage.locator("#qrBuzzerCard")).not.toHaveClass(/hidden/);

    await page.locator('.device-row[data-device="host"] button', { hasText: "Ukryj QR" }).click();
    await expect(displayPage.locator(".qr-grid")).toHaveClass(/qr-single/, { timeout: 10000 });
    await expect(displayPage.locator("#qrBuzzerCard")).not.toHaveClass(/hidden/);
    await expect(displayPage.locator("#qrHostCard")).toHaveClass(/hidden/);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 10. Finał bez wczesnego wyjścia: obaj gracze, wszystkie 10 pytań =====
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
    roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odpowiedź warta 300", fixed_points: 300 }] }],
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
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Start rundy" }).click();

    // ===== Runda jedyna: A wygrywa próg finału (300 pkt) =====
    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();
    await page.getByRole("button", { name: "#1" }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Finał", { timeout: 10000 });

    // ===== F1: start finału =====
    await clearSfxLog(page);
    await clearDisplayLog(displayPage);
    await page.getByRole("button", { name: "Start finału" }).click();
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
    for (let i = 0; i < 5; i++) await p1Inputs.nth(i).fill(`Odpowiedź finałowa`);

    await clearSfxLog(page);
    await page.getByRole("button", { name: "Start timera" }).click();
    // Bez klikania niczego: dograny dziś zegarek w control2/js/app.js sam
    // dispatch'uje EXPIRE_TIMER po 15s — przycisk "Start timera" wraca,
    // bo tylko `!timerRunning` go pokazuje (engine.js nie ma już `usedP1`).
    await expect(page.getByRole("button", { name: "Start timera" })).toBeVisible({ timeout: 20000 });
    await expect.poll(() => getSfxKeys(page), { timeout: 5000 }).toEqual(expect.arrayContaining(["time_over"]));

    // ===== F4/F5: mapowanie gracza 1 — trafienie wszystkich 5x15 pkt =====
    await page.getByRole("button", { name: "Dalej" }).click();
    for (let i = 0; i < 5; i++) {
      await expect(page.locator(".c2-stepper")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 10000 });
      await page.getByRole("button", { name: "Odpowiedź finałowa (15)" }).click();
      await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
      await page.getByRole("button", { name: "Pokaż punkty" }).click();
      await page.getByRole("button", { name: "Dalej" }).click();
    }
    // Suma 75 < finalTarget (200) — BEZ wczesnego wyjścia, prosto do F6.
    await expect(page.getByText("Suma finału: 75")).toBeVisible({ timeout: 10000 });

    // ===== F6: przejście do gracza 2 — TU jest sedno testu =====
    await expect(page.locator(".c2-stepper")).toContainText("Finał — start rundy 2", { timeout: 10000 });
    await clearDisplayLog(displayPage);
    await page.getByRole("button", { name: "Start rundy 2" }).click();

    // Display: odpowiedzi gracza 1 wracają odsłonięte (animIn), NIE placeholder.
    await expect.poll(async () => {
      const calls = await getDisplayCalls(displayPage, "api.final.setHalf");
      const last = calls.at(-1);
      return !!last
        && last.args[0] === "A"
        && !!last.args[1].animIn
        && last.args[1].rows.every((r) => r.left === "Odpowiedź finałowa" && r.a === "15");
    }, { timeout: 10000 }).toBe(true);
    // Host: odsłania się W TYM SAMYM momencie (naprawiona luka — dawniej
    // zostawał zasłonięty do końca gry mimo że Display już odsłaniał).
    await expect(hostPage.locator("#cover2")).not.toHaveClass(/coverOn/, { timeout: 10000 });

    // ===== F7: gracz 2 — pytanie #1 oznaczone jako "powtórzenie" =====
    await expect(page.locator(".c2-stepper")).toContainText("Finał — gracz 2, wpisywanie", { timeout: 10000 });
    await clearSfxLog(page);
    await page.getByLabel("powtórzenie").first().check();
    await expect.poll(() => getSfxKeys(page), { timeout: 5000 }).toEqual(expect.arrayContaining(["answer_repeat"]));

    const p2Inputs = page.locator("#app input[type=text]");
    for (let i = 1; i < 5; i++) await p2Inputs.nth(i).fill("Odpowiedź finałowa");
    await page.getByRole("button", { name: "Start timera" }).click();
    // Tym razem NIE czekamy na naturalne wygaśnięcie — klikamy "Dalej" od
    // razu (jak w teście 4), sprawdzając DRUGĄ naprawę z dzisiejszego audytu:
    // START_MAPPING musi wyzerować timer, inaczej zostałby "running" na zawsze.
    await page.getByRole("button", { name: "Dalej" }).click();

    // ===== F8/F9: mapowanie gracza 2 — pytanie #1 to SKIP (powtórzenie), reszta MATCH =====
    for (let i = 0; i < 5; i++) {
      await expect(page.locator(".c2-stepper")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 10000 });
      if (i > 0) await page.getByRole("button", { name: "Odpowiedź finałowa (15)" }).click();
      await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
      await page.getByRole("button", { name: "Pokaż punkty" }).click();
      await page.getByRole("button", { name: "Dalej" }).click();
    }
    // 75 (gracz 1) + 0 (powtórzenie) + 4x15 (gracz 2) = 135 < 200 — pełne 10/10, bez wczesnego wyjścia.
    await expect(page.locator(".c2-stepper")).toContainText("Finał — koniec", { timeout: 10000 });
    await expect(page.getByText("Suma finału: 135")).toBeVisible({ timeout: 10000 });

    // ===== F10: koniec finału =====
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Zakończ", exact: true }).click();
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

// ===== 11. Mnożnik rundy =====

test("control2: mnożnik rundy — runda 4. z domyślnym ×2 faktycznie przemnaża bank", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const roundQ = (n) => ({ ord: n, text: `Pytanie rundowe ${n}`, answers: [{ ord: 1, text: "Jedyna odpowiedź", fixed_points: 40 }] });
  const game = await makeGame(page, `E2E-CONTROL2-MULTIPLIER-${Date.now()}`, {
    roundQuestions: [roundQ(1), roundQ(2), roundQ(3), roundQ(4)],
  });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();

    // Rundy 1-3: mnożnik x1 (domyślne roundMultipliers [1,1,1,2,3]) — A wygrywa za każdym razem, bank 40.
    for (let round = 1; round <= 3; round++) {
      await expect(page.locator(".c2-stepper")).toContainText(`Runda ${round}`, { timeout: 10000 });
      await page.getByRole("button", { name: "Start rundy" }).click();
      await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
      await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
      await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
      await page.getByRole("button", { name: "Przyjmij" }).click();
      await page.getByRole("button", { name: "#1" }).click();
      await page.getByRole("button", { name: "X", exact: true }).click();
      await page.getByRole("button", { name: "X", exact: true }).click();
      await page.getByRole("button", { name: "X", exact: true }).click();
      await page.getByRole("button", { name: "Zakończ rundę" }).click();
    }
    await expect(page.getByText(/Wyniki: A 120/)).toBeVisible({ timeout: 10000 });

    // Runda 4: mnożnik x2 — bank 40 ma dać +80, nie +40.
    await expect(page.locator(".c2-stepper")).toContainText("Runda 4", { timeout: 10000 });
    await page.getByRole("button", { name: "Start rundy" }).click();
    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();
    await page.getByRole("button", { name: "#1" }).click();
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "Zakończ rundę" }).click();

    await expect(page.getByText(/Wyniki: A 200/)).toBeVisible({ timeout: 10000 }); // 120 + 40x2, nie 160
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 12. Wyścig dwóch przycisków Buzzera =====

test("control2: wyścig — oba przyciski Buzzera naciśnięte w tej samej chwili, tylko jeden zaakceptowany", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-BUZZRACE-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Start rundy" }).click();

    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    // Oba kliknięcia wystrzelone w tym samym ticku JS — dwa równoległe
    // wywołania game_state_buzzer_press ścigające się o ten sam wiersz
    // (plan, sekcja 1: atomowy warunkowy UPDATE, nie wyścig po stronie klienta).
    await buzzerPage.evaluate(() => {
      document.getElementById("btnA")?.click();
      document.getElementById("btnB")?.click();
    });

    const zgloszono = page.getByText(/Zgłoszono: (A|B)/);
    await expect(zgloszono).toBeVisible({ timeout: 10000 });
    const winner = (await zgloszono.textContent()).includes("A") ? "A" : "B";
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

// ===== 13. Wyciszenie dźwięku =====

test("control2: wyciszenie dźwięku — po Mute żaden klucz SFX się nie odtwarza", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-MUTE-${Date.now()}`, { roundQuestions: [TWO_QUESTIONS[0]] });
  const contexts = [];
  try {
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer", []);
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();

    // Referencja: BEZ wyciszenia start rundy gra normalnie.
    await clearSfxLog(page);
    await page.getByRole("button", { name: "Start rundy" }).click();
    await waitForSfxSequence(page, ["round_transition"], 10000);

    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await page.locator("#btnMute").click();
    await expect(page.locator("#btnMute")).toHaveText("🔇");

    await clearSfxLog(page);
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();
    await page.getByRole("button", { name: "#1" }).click(); // normalnie: buzzer_press + answer_correct
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });

    expect(await getSfxKeys(page), "wyciszenie ma zablokować KAŻDY dźwięk, nie tylko część").toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

// ===== 14. Zmiana języka propaguje się do urządzeń, w tym treść Hosta =====
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
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByRole("button", { name: "Start rundy" }).click();

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
