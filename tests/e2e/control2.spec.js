// tests/e2e/control2.spec.js
//
// Wszystkie testy E2E dla Control v2 w jednym pliku (na wyraźną prośbę —
// jeden plik zamiast kilku). Kolejne test() bloki, od najprostszego do
// najbardziej złożonego:
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
//
// Każdy test tworzy i kasuje własną grę testową — niezależne od siebie,
// można je uruchamiać pojedynczo (--grep) przy diagnozowaniu awarii.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test.setTimeout(150_000);

// ===== Pomocnicze =====

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
    await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`, "host", errors);
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
