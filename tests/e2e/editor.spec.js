// tests/e2e/editor.spec.js
// Weryfikuje edytor gier (js/pages/editor.js) — kreator pytań/odpowiedzi
// używany do przygotowania każdego typu gry (poll_text, poll_points,
// prepared). Zamiast tylko "happy path" (dodaj pytanie, dodaj odpowiedź),
// celujemy w nietypowe zachowania znalezione czytając kod i schema.sql:
// limity (albo ich brak), co się dzieje przy naruszeniu CHECK constraintów
// w bazie, asymetrię walidacji pytanie/odpowiedź, dziury w numeracji (ord),
// blokady stanu gry (poll_open/ready) i — najciekawsze — co się dzieje gdy
// ta sama gra jest edytowana w dwóch kartach naraz (editor.js nie ma żadnej
// synchronizacji w czasie rzeczywistym ani re-walidacji stanu gry per-akcja).
//
// Gry zakładane bezpośrednio przez API (jak w polls.spec.js/game-deletion.spec.js)
// — kreator sam w sobie jest przedmiotem testu, więc seedujemy tylko to, co
// potrzebne do konkretnego scenariusza.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

/* ================= Seed / DB helpers (bezpośrednio przez window.__sbClient) ================= */

async function createGame(page, { type = "prepared", name } = {}) {
  return await page.evaluate(async ({ type, name }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: game, error } = await sb
      .from("games")
      .insert({ name: name || `E2E-EDITOR-${Date.now()}`, owner_id: userData.user.id, type })
      .select("id")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);
    return game.id;
  }, { type, name });
}

async function addQuestionApi(page, gameId, ord, text) {
  return await page.evaluate(async ({ gameId, ord, text }) => {
    const { data, error } = await window.__sbClient
      .from("questions")
      .insert({ game_id: gameId, ord, text })
      .select("id")
      .single();
    if (error) throw new Error("insert question failed: " + error.message);
    return data.id;
  }, { gameId, ord, text });
}

async function addAnswerApi(page, questionId, ord, text, points = 0) {
  return await page.evaluate(async ({ questionId, ord, text, points }) => {
    const { data, error } = await window.__sbClient
      .from("answers")
      .insert({ question_id: questionId, ord, text, fixed_points: points })
      .select("id")
      .single();
    if (error) throw new Error("insert answer failed: " + error.message);
    return data.id;
  }, { questionId, ord, text, points });
}

async function getGameRow(page, gameId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient.from("games").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
  }, gameId);
}

async function getQuestionsRows(page, gameId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("questions").select("*").eq("game_id", id).order("ord");
    if (error) throw new Error(error.message);
    return data || [];
  }, gameId);
}

async function getAnswersRows(page, questionId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("answers").select("*").eq("question_id", id).order("ord");
    if (error) throw new Error(error.message);
    return data || [];
  }, questionId);
}

async function updateGameStatus(page, gameId, patch) {
  await page.evaluate(async ({ gameId, patch }) => {
    const { error } = await window.__sbClient.from("games").update(patch).eq("id", gameId);
    if (error) throw new Error(error.message);
  }, { gameId, patch });
}

async function deleteGame(page, gameId) {
  await page.evaluate(async (id) => {
    await window.__sbClient.from("games").delete().eq("id", id);
  }, gameId);
}

async function openEditor(page, gameId) {
  await page.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
  // editor.js wiąże listenery/renderuje dopiero po asynchronicznym
  // requireAuth+initI18n+loadGame w boot() — ten sam wyścig co gdzie indziej.
  await page.waitForLoadState("networkidle");
}

const qCard = (page, i) => page.locator("#qList .qcard:not(.addTile)").nth(i);
const aRow = (page, i) => page.locator("#aList .arow:not(.addTile)").nth(i);

// trg_assert_game_answers_minmax (schema.sql) blokuje UPDATE games.status na
// poll_open/ready dla poll_text/poll_points, jeśli gra ma <10 pytań albo (dla
// poll_points) jakieś pytanie ma <3 lub >6 odpowiedzi — więc każdy test, który
// wymusza status='ready'/'poll_open' wprost przez API, musi wcześniej
// nasadzić pełne, poprawne dane (dokładnie jak realny poll_open przez UI by
// wymagał). Zwraca id pierwszego pytania i jego pierwszej odpowiedzi.
async function seedPollPointsFull(page, gameId, { firstAnswerPoints = 0 } = {}) {
  let firstQ = null;
  let firstA = null;
  for (let ord = 1; ord <= 10; ord++) {
    const qId = await addQuestionApi(page, gameId, ord, `Pytanie ${ord}`);
    if (ord === 1) firstQ = qId;
    for (let a = 1; a <= 4; a++) {
      const aId = await addAnswerApi(page, qId, a, `Odp ${ord}.${a}`, ord === 1 && a === 1 ? firstAnswerPoints : 0);
      if (ord === 1 && a === 1) firstA = aId;
    }
  }
  return { qId: firstQ, aId: firstA };
}

/* ================= A: pytanie z pustym tekstem — desync UI/DB ================= */
// questions_text_len (schema.sql) wymaga char_length>=1 — ale saveQuestionNow()
// (w przeciwieństwie do odpowiedzi) NIE ma fallbacku na tekst domyślny gdy pole
// jest puste. Update leci do bazy, baza go odrzuca (constraint), UI pokazuje
// tylko generyczny "Błąd zapisu (konsola)." — textarea zostaje pusta, ale w
// bazie (i w lewej liście pytań) wciąż jest STARY tekst.
test("edytor: puste pole pytania — błąd zapisu, baza zostaje niezmieniona", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    const qId = await addQuestionApi(page, gameId, 1, "Pytanie testowe");
    await openEditor(page, gameId);

    await expect(page.locator("#qText")).toHaveValue("Pytanie testowe", { timeout: 15000 });

    await page.locator("#qText").fill("");
    await page.locator("#qText").blur();

    await expect(page.locator("#msg")).toHaveText("Błąd zapisu (konsola).", { timeout: 10000 });

    const q = await getQuestionsRows(page, gameId);
    expect(q.find((x) => x.id === qId)?.text, "tekst pytania w bazie nie powinien zniknąć mimo błędu zapisu").toBe("Pytanie testowe");
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= B: import zawsze wipeuje istniejącą zawartość ================= */
test("edytor: import tekstowy zawsze zastępuje (wipeuje) istniejącą zawartość gry", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    const oldQ = await addQuestionApi(page, gameId, 1, "Stare pytanie");
    await addAnswerApi(page, oldQ, 1, "Stara odp", 0);

    await openEditor(page, gameId);

    await page.locator("#btnImportTxt").click();
    await page.locator("#txtTa").fill("#Nowe pytanie\n1 Nowa odpowiedź /10");
    await page.locator("#btnTxtImport").click();
    await page.locator(".uni-foot .btn.gold").click(); // potwierdzenie importu
    await expect(page.locator("#txtMsg")).toHaveText("Zaimportowano (zastąpiono zawartość).", { timeout: 20000 });

    const questions = await getQuestionsRows(page, gameId);
    expect(questions, "po imporcie powinno zostać dokładnie jedno (nowe) pytanie").toHaveLength(1);
    expect(questions[0].text).toBe("Nowe pytanie");
    expect(questions[0].id, "stare pytanie powinno zniknąć (wipe), nie zostać nadpisane").not.toBe(oldQ);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= C: nieudany parse importu NIE kasuje zawartości ================= */
test("edytor: import bez '#' pokazuje błąd formatu i nie rusza istniejącej zawartości", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    await addQuestionApi(page, gameId, 1, "Zostaw mnie");

    await openEditor(page, gameId);
    await page.locator("#btnImportTxt").click();
    // Sama linia "@Nazwa" bez żadnego "#" — pętla kończy się z pustym items,
    // bez przechodzenia przez gałąź "odpowiedź przed pierwszym pytaniem"
    // (to inny, wcześniejszy błąd, na który wcześniej przypadkiem trafiał ten test).
    await page.locator("#txtTa").fill("@Tylko nazwa, bez pytań");
    await page.locator("#btnTxtImport").click();

    await expect(page.locator("#txtMsg")).toHaveText(
      "Brak pytań. Pamiętaj o liniach zaczynających się od #.",
      { timeout: 10000 }
    );
    // Overlay musi zostać otwarty (parse zawiódł PRZED confirmModal/wipe'em).
    await expect(page.locator("#txtImportOverlay")).toBeVisible();

    const questions = await getQuestionsRows(page, gameId);
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe("Zostaw mnie");
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= D: odpowiedź zaczynająca się od cyfry zostaje okaleczona ================= */
test("edytor: import okalecza odpowiedź zaczynającą się od cyfry (myli ją z numerem listy)", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    await openEditor(page, gameId);
    await page.locator("#btnImportTxt").click();
    await page.locator("#txtTa").fill("#Test\n5 sztuk\nCoś tam");
    await page.locator("#btnTxtImport").click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page.locator("#txtMsg")).toHaveText("Zaimportowano (zastąpiono zawartość).", { timeout: 20000 });

    const questions = await getQuestionsRows(page, gameId);
    const answers = await getAnswersRows(page, questions[0].id);
    const texts = answers.map((a) => a.text);
    expect(texts, "'5 sztuk' powinno stracić '5' (wzięte za numer porządkowy)").toContain("sztuk");
    expect(texts).not.toContain("5 sztuk");
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= E: ostatni "/" w linii zawsze traktowany jako punkty ================= */
test("edytor: import dwuznacznie tnie tekst na ostatnim '/', nawet gdy to część treści odpowiedzi", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    await openEditor(page, gameId);
    await page.locator("#btnImportTxt").click();
    await page.locator("#txtTa").fill("#Test\nFormuła 1/2");
    await page.locator("#btnTxtImport").click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page.locator("#txtMsg")).toHaveText("Zaimportowano (zastąpiono zawartość).", { timeout: 20000 });

    const questions = await getQuestionsRows(page, gameId);
    const answers = await getAnswersRows(page, questions[0].id);
    expect(answers[0].text, "'Formuła 1/2' zostaje rozbite na tekst + punkty, mimo że '/2' mogło być częścią treści").toBe("Formuła 1");
    expect(answers[0].fixed_points).toBe(2);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= F: ujemne i dziesiętne punkty z importu są przycinane ================= */
test("edytor: import przycina ujemne punkty do 0 i zaokrągla w dół dziesiętne", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    await openEditor(page, gameId);
    await page.locator("#btnImportTxt").click();
    await page.locator("#txtTa").fill("#Test\nOdp A /-5\nOdp B /3.7");
    await page.locator("#btnTxtImport").click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page.locator("#txtMsg")).toHaveText("Zaimportowano (zastąpiono zawartość).", { timeout: 20000 });

    const questions = await getQuestionsRows(page, gameId);
    const answers = await getAnswersRows(page, questions[0].id);
    const byText = Object.fromEntries(answers.map((a) => [a.text, a.fixed_points]));
    expect(byText["Odp A"], "ujemne punkty importu -> nonNegativeInt clamp do 0").toBe(0);
    expect(byText["Odp B"], "dziesiętne punkty importu -> Math.floor").toBe(3);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= G: import ucina odpowiedzi powyżej AN_MAX bez ostrzeżenia ================= */
test("edytor: import po cichu ucina odpowiedzi powyżej limitu 6 na pytanie", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    const lines = ["#Test", ...Array.from({ length: 8 }, (_, i) => `Odp ${i + 1}`)].join("\n");
    await openEditor(page, gameId);
    await page.locator("#btnImportTxt").click();
    await page.locator("#txtTa").fill(lines);
    await page.locator("#btnTxtImport").click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page.locator("#txtMsg")).toHaveText("Zaimportowano (zastąpiono zawartość).", { timeout: 20000 });

    const questions = await getQuestionsRows(page, gameId);
    const answers = await getAnswersRows(page, questions[0].id);
    expect(answers, "8 odpowiedzi w źródle -> tylko 6 zapisanych, bez błędu/ostrzeżenia").toHaveLength(6);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= H: import ignoruje punkty dla poll_points ================= */
test("edytor: import ignoruje punkty z tekstu dla typu poll_points (zawsze zapisuje 0)", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "poll_points" });
  try {
    await openEditor(page, gameId);
    await page.locator("#btnImportTxt").click();
    await page.locator("#txtTa").fill("#Test\nOdp /50");
    await page.locator("#btnTxtImport").click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page.locator("#txtMsg")).toHaveText("Zaimportowano (zastąpiono zawartość).", { timeout: 20000 });

    const questions = await getQuestionsRows(page, gameId);
    const answers = await getAnswersRows(page, questions[0].id);
    expect(answers[0].fixed_points, "poll_points ma ignoreImportPoints=true — /50 z tekstu ma zostać zignorowane").toBe(0);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= I: suma punktów >100 (prepared) NIE blokuje zapisu ================= */
test("edytor: suma punktów >100 dla 'prepared' to tylko wizualne ostrzeżenie, zapis i tak przechodzi", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    const qId = await addQuestionApi(page, gameId, 1, "Pytanie");
    await addAnswerApi(page, qId, 1, "A1", 0);
    await addAnswerApi(page, qId, 2, "A2", 0);

    await openEditor(page, gameId);
    await expect(aRow(page, 0)).toBeVisible({ timeout: 15000 });

    await aRow(page, 0).locator(".aPts").fill("80");
    await aRow(page, 0).locator(".aPts").blur();
    await expect(page.locator("#msg")).toHaveText("Zapisano.", { timeout: 10000 });

    await aRow(page, 1).locator(".aPts").fill("50");
    await aRow(page, 1).locator(".aPts").blur();
    await expect(page.locator("#msg")).toHaveText("Zapisano.", { timeout: 10000 });

    await expect(page.locator(".remainBox")).toHaveClass(/over/, { timeout: 5000 });
    await expect(page.locator(".remainBox b")).toHaveText("130/100");

    const answers = await getAnswersRows(page, qId);
    const sum = answers.reduce((s, a) => s + a.fixed_points, 0);
    expect(sum, "obie wartości mają zostać naprawdę zapisane w bazie mimo przekroczenia 100").toBe(130);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= J: usunięcie odpowiedzi ze środka -> nowa wypełnia zwolniony ord ================= */
test("edytor: nowa odpowiedź zajmuje zwolniony numer (ord) po usunięciu ze środka, nie doklejana na koniec", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    const qId = await addQuestionApi(page, gameId, 1, "Pytanie");
    const a2Id = await addAnswerApi(page, qId, 1, "A1", 0);
    const toDelete = await addAnswerApi(page, qId, 2, "A2", 0);
    await addAnswerApi(page, qId, 3, "A3", 0);
    await addAnswerApi(page, qId, 4, "A4", 0);

    await openEditor(page, gameId);
    await expect(page.locator("#aList .arow:not(.addTile)")).toHaveCount(4, { timeout: 15000 });

    // usuń odpowiedź o ord=2 ("A2")
    await aRow(page, 1).locator(".aDel").click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page.locator("#aList .arow:not(.addTile)")).toHaveCount(3, { timeout: 10000 });

    await page.locator("#aList .arow.addTile").click();
    await expect(page.locator("#aList .arow:not(.addTile)")).toHaveCount(4, { timeout: 10000 });

    const answers = await getAnswersRows(page, qId);
    const newOne = answers.find((a) => a.id !== a2Id && a.id !== toDelete && !["A1", "A3", "A4"].includes(a.text));
    expect(newOne, "powinna istnieć nowo dodana odpowiedź").toBeTruthy();
    expect(newOne.ord, "nowa odpowiedź powinna zająć zwolniony slot ord=2, nie ord=5").toBe(2);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= K: usunięcie pytania ze środka przenumerowuje resztę ================= */
test("edytor: usunięcie pytania ze środka przenumerowuje resztę, aktywne pytanie zachowuje treść i odpowiedzi", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    await addQuestionApi(page, gameId, 1, "Q1");
    await addQuestionApi(page, gameId, 2, "Q2");
    const q3Id = await addQuestionApi(page, gameId, 3, "Q3");
    await addAnswerApi(page, q3Id, 1, "A3text", 0);

    await openEditor(page, gameId);
    await expect(page.locator("#qList .qcard:not(.addTile)")).toHaveCount(3, { timeout: 15000 });

    await qCard(page, 2).click(); // Q3
    await expect(page.locator("#qText")).toHaveValue("Q3", { timeout: 10000 });
    await expect(aRow(page, 0).locator(".aText")).toHaveValue("A3text");

    await qCard(page, 1).locator(".x").click(); // usuń Q2 (środek)
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page.locator("#qList .qcard:not(.addTile)")).toHaveCount(2, { timeout: 10000 });

    // Q3 dalej aktywne, treść/odpowiedzi bez zmian mimo zmiany numeru porządkowego
    await expect(page.locator("#qText")).toHaveValue("Q3");
    await expect(aRow(page, 0).locator(".aText")).toHaveValue("A3text");

    const questions = await getQuestionsRows(page, gameId);
    const q3 = questions.find((q) => q.id === q3Id);
    expect(q3.ord, "Q3 powinno zostać przenumerowane z ord=3 na ord=2").toBe(2);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= L: brak twardego limitu liczby pytań ================= */
test("edytor: nie ma twardego limitu liczby pytań — dodanie wielu ponad minimum nie rzuca błędu", async ({ page, context }) => {
  test.setTimeout(90_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  const TARGET = 15; // wyraźnie ponad QN_MIN=10, bez przesady w czasie testu
  try {
    await openEditor(page, gameId);

    for (let i = 1; i <= TARGET; i++) {
      await page.locator("#qList .addTile").click();
      await expect(page.locator("#qList .qcard:not(.addTile)")).toHaveCount(i, { timeout: 10000 });
    }

    const questions = await getQuestionsRows(page, gameId);
    expect(questions, `powinno dać się dodać ${TARGET} pytań bez odrzucenia`).toHaveLength(TARGET);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= M: wejście do edytora gdy ankieta poll_open -> blokada ================= */
test("edytor: wejście na edytor gdy ankieta jest otwarta (poll_open) -> natychmiastowy redirect, brak dostępu", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "poll_points" });
  try {
    await seedPollPointsFull(page, gameId);

    const game = await getGameRow(page, gameId);
    await page.evaluate(async ({ gameId, key }) => {
      const { error } = await window.__sbClient.rpc("poll_open", { p_game_id: gameId, p_key: key });
      if (error) throw new Error(error.message);
    }, { gameId, key: game.share_key_poll });

    await page.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/builder/, { timeout: 15000 });
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= N/O: wejście gdy ankieta 'ready' -> confirm reset (Anuluj / OK) ================= */
test("edytor: wejście gdy ankieta jest 'ready' i Anuluj w confirmie -> nic się nie resetuje", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "poll_points" });
  try {
    const { qId, aId } = await seedPollPointsFull(page, gameId, { firstAnswerPoints: 42 });
    await updateGameStatus(page, gameId, { status: "ready" });

    await page.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".uni-modal")).toBeVisible({ timeout: 15000 });
    await page.locator(".uni-foot .btn:not(.gold)").click(); // Anuluj
    await page.waitForURL(/\/builder/, { timeout: 15000 });

    const game = await getGameRow(page, gameId);
    expect(game.status, "Anuluj nie powinno zresetować statusu").toBe("ready");
    const answers = await getAnswersRows(page, qId);
    expect(answers.find((a) => a.id === aId)?.fixed_points, "Anuluj nie powinno wyzerować punktów").toBe(42);
  } finally {
    await deleteGame(page, gameId);
  }
});

test("edytor: wejście gdy ankieta jest 'ready' i OK w confirmie -> realny reset do draft + zerowanie punktów", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "poll_points" });
  try {
    const { qId, aId } = await seedPollPointsFull(page, gameId, { firstAnswerPoints: 42 });
    await updateGameStatus(page, gameId, { status: "ready" });

    await page.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".uni-modal")).toBeVisible({ timeout: 15000 });
    await page.locator(".uni-foot .btn.gold").click(); // OK — resetuj

    await expect(page.locator("#qText")).toHaveValue("Pytanie 1", { timeout: 15000 });

    const game = await getGameRow(page, gameId);
    expect(game.status).toBe("draft");
    expect(game.poll_opened_at).toBeNull();
    expect(game.poll_closed_at).toBeNull();
    const answers = await getAnswersRows(page, qId);
    expect(answers.find((a) => a.id === aId)?.fixed_points, "OK powinno wyzerować punkty").toBe(0);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= P: dwie karty — usunięcie w A, edycja usuniętego w B to cichy no-op ================= */
// editor.js nie ma żadnej synchronizacji w czasie rzeczywistym między kartami.
// UPDATE ... WHERE id = <usunięte> pasuje do 0 wierszy — Supabase/PostgREST NIE
// zwraca błędu w takiej sytuacji, więc UI karty B pokazuje "Zapisano.", mimo że
// nic nie zostało zapisane (wiersz już nie istnieje).
test("edytor: dwie karty — edycja pytania usuniętego w innej karcie kończy się CICHYM sukcesem, bez realnego zapisu", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    await addQuestionApi(page, gameId, 1, "Q1");
    const q2Id = await addQuestionApi(page, gameId, 2, "Q2");

    const pageA = page;
    const pageB = await context.newPage();

    await openEditor(pageA, gameId);
    await openEditor(pageB, gameId);

    // Karta B: aktywuje Q2
    await qCard(pageB, 1).click();
    await expect(pageB.locator("#qText")).toHaveValue("Q2", { timeout: 10000 });

    // Karta A: usuwa Q2
    await qCard(pageA, 1).locator(".x").click();
    await pageA.locator(".uni-foot .btn.gold").click();
    await expect(pageA.locator("#qList .qcard:not(.addTile)")).toHaveCount(1, { timeout: 10000 });

    // Karta B nie wie o usunięciu — dalej "edytuje" Q2 i próbuje zapisać
    await pageB.locator("#qText").fill("Nowy tekst po usunięciu w innej karcie");
    await pageB.locator("#qText").blur();
    await expect(pageB.locator("#msg")).toHaveText("Zapisano.", { timeout: 10000 });

    const questions = await getQuestionsRows(page, gameId);
    expect(questions.find((q) => q.id === q2Id), "wiersz usunięty w A nie powinien zostać wskrzeszony przez 'udany' zapis w B").toBeUndefined();

    await pageB.close();
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= Q: dwie karty — otwarcie ankiety w B nie blokuje edycji w A ================= */
// canEnterEdit() sprawdzany jest RAZ w boot() — żadna kolejna akcja (blur na
// polu) nie re-waliduje aktualnego game.status. Otwarcie ankiety w drugiej
// karcie (czyli realnie: przez inną osobę/urządzenie) NIE blokuje dalszej
// edycji pytań w karcie, która była otwarta wcześniej jako draft.
test("edytor: dwie karty — otwarcie ankiety w karcie B nie blokuje dalszej edycji w karcie A", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "poll_points" });
  try {
    const { qId: firstQId } = await seedPollPointsFull(page, gameId);

    const pageA = page;
    await openEditor(pageA, gameId); // ładuje się jako draft

    const pageB = await context.newPage();
    // window.__sbClient istnieje dopiero po załadowaniu strony aplikacji —
    // świeża karta zaczyna na about:blank, więc trzeba ją najpierw nawigować.
    await openEditor(pageB, gameId);
    const game = await getGameRow(pageB, gameId);
    await pageB.evaluate(async ({ gameId, key }) => {
      const { error } = await window.__sbClient.rpc("poll_open", { p_game_id: gameId, p_key: key });
      if (error) throw new Error(error.message);
    }, { gameId, key: game.share_key_poll });
    const gameAfter = await getGameRow(pageB, gameId);
    expect(gameAfter.status, "sanity: ankieta faktycznie otwarta w tle").toBe("poll_open");

    // Karta A dalej "myśli", że jest draft — edytuje bez żadnego ostrzeżenia
    // (tekst musi mieścić się w limicie 17 znaków pola odpowiedzi — inaczej
    // sam zostanie ucięty przez app, co nie ma nic wspólnego z tym, co ten
    // test sprawdza).
    await expect(aRow(pageA, 0).locator(".aText")).toBeVisible({ timeout: 10000 });
    await aRow(pageA, 0).locator(".aText").fill("Zmieniona w A!");
    await aRow(pageA, 0).locator(".aText").blur();
    await expect(pageA.locator("#msg")).toHaveText("Zapisano.", { timeout: 10000 });

    const answers = await getAnswersRows(pageA, firstQId);
    expect(answers[0].text, "edycja w A powinna się realnie zapisać mimo otwartej w B ankiety — brak re-walidacji stanu per-akcja").toBe("Zmieniona w A!");

    await pageB.close();
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= R: import do poll_text w ogóle nie tworzy odpowiedzi ================= */
// cfgFromGameType(POLL_TEXT).allowAnswers = false — import warunkuje tworzenie
// odpowiedzi tym flagiem, więc dla poll_text odpowiedzi z importowanego tekstu
// są całkowicie pomijane (nie tylko punkty, jak dla poll_points — same wiersze
// answers() nigdy nie powstają).
test("edytor: import do gry typu poll_text nie tworzy żadnych odpowiedzi (allowAnswers=false)", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "poll_text" });
  try {
    await openEditor(page, gameId);
    await page.locator("#btnImportTxt").click();
    await page.locator("#txtTa").fill("#Test\n1 Odpowiedź A\n2 Odpowiedź B");
    await page.locator("#btnTxtImport").click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(page.locator("#txtMsg")).toHaveText("Zaimportowano (zastąpiono zawartość).", { timeout: 20000 });

    const questions = await getQuestionsRows(page, gameId);
    expect(questions).toHaveLength(1);
    const answers = await getAnswersRows(page, questions[0].id);
    expect(answers, "poll_text nie pokazuje/nie tworzy sekcji odpowiedzi w edytorze wcale").toHaveLength(0);
  } finally {
    await deleteGame(page, gameId);
  }
});

/* ================= S: nazwa gry — pusta -> fallback do domyślnej, >80 znaków -> ucięta ================= */
test("edytor: pusta nazwa gry po blur zapisuje się jako domyślna, nie jako pusty string", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared", name: "Moja gra testowa" });
  try {
    await openEditor(page, gameId);
    await expect(page.locator("#gameName")).toHaveValue("Moja gra testowa", { timeout: 15000 });

    await page.locator("#gameName").fill("");
    await page.locator("#gameName").blur();
    // Zapis nazwy gry ma własny, inny komunikat niż zapis pytania/odpowiedzi.
    await expect(page.locator("#msg")).toHaveText("Zapisano nazwę.", { timeout: 10000 });

    const game = await getGameRow(page, gameId);
    expect(game.name, "pusta nazwa -> fallback do 'Nowa gra', nie błąd i nie pusty string").toBe("Nowa gra");
  } finally {
    await deleteGame(page, gameId);
  }
});

test("edytor: nazwa gry dłuższa niż 80 znaków zostaje ucięta do 80", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await createGame(page, { type: "prepared" });
  try {
    await openEditor(page, gameId);
    const longName = "X".repeat(120);
    await page.locator("#gameName").fill(longName);
    await page.locator("#gameName").blur();
    await expect(page.locator("#msg")).toHaveText("Zapisano nazwę.", { timeout: 10000 });

    const game = await getGameRow(page, gameId);
    expect(game.name.length, "nazwa w bazie nie powinna przekroczyć 80 znaków (games_name_len)").toBe(80);
    expect(game.name).toBe("X".repeat(80));
  } finally {
    await deleteGame(page, gameId);
  }
});
