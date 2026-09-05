// tests/e2e/control2-edge-cases.spec.js
//
// "Nietypowe zachowania operatora" poza samej ścieżki rozgrywki — cztery
// niezależne testy (osobna gra/setup każdy, żeby awaria jednego nie
// przesłoniła pozostałych):
//   A. physicalBuzzer + noHostTablet: urządzenia pominięte w D1, pojedynek
//      rozstrzygany ręcznym wyborem drużyny (zaznacz -> potwierdź/anuluj).
//   B. "Zacznij od nowa" w trakcie gry wraca do D0.
//   C. "Cofnij ostatnią akcję" cofa jeden zapis (3. pudło -> powrót do 2.).
//   D. Druga karta Control na TĘ SAMĄ grę jest blokowana (resource-lock,
//      Warstwa 1 — docs/plan-testy-i-poprawki.md, sekcja "Control").

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test.setTimeout(120_000);

async function makeGame(page, name, settingsExtra = {}) {
  return page.evaluate(async ({ name, settingsExtra }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: g, error: gErr } = await sb
      .from("games")
      .insert({
        name, owner_id: userData.user.id, type: "prepared", status: "ready",
        settings: { teams: { teamA: "Alfa", teamB: "Beta" }, game: { hasFinal: false }, ...settingsExtra },
      })
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .single();
    if (gErr) throw new Error("insert games failed: " + gErr.message);
    const { data: q, error: qErr } = await sb
      .from("questions").insert({ game_id: g.id, ord: 1, text: "Pytanie testowe" }).select("id").single();
    if (qErr) throw new Error("insert questions failed: " + qErr.message);
    const { error: aErr } = await sb.from("answers").insert([
      { question_id: q.id, ord: 1, text: "Odpowiedź A", fixed_points: 40 },
      { question_id: q.id, ord: 2, text: "Odpowiedź B", fixed_points: 30 },
      { question_id: q.id, ord: 3, text: "Odpowiedź C", fixed_points: 20 },
    ]);
    if (aErr) throw new Error("insert answers failed: " + aErr.message);
    return g;
  }, { name, settingsExtra });
}

async function deleteGame(page, gameId) {
  await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    await sb.from("games").delete().eq("id", gid);
  }, gameId).catch(() => {});
}

test("control2: physicalBuzzer + noHostTablet — urządzenia pominięte, ręczny wybór drużyny (zaznacz/anuluj/potwierdź)", async ({ page }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-PHYSBUZZ-${Date.now()}`);
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

    // B trafia #1 (najwyższe punkty) -> przejmuje kontrolę.
    await page.getByRole("button", { name: "#1" }).click();
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });
  } finally {
    await deleteGame(page, game.id);
  }
});

test("control2: \"Zacznij od nowa\" w trakcie gry wraca do D0 (parowanie), ustawienia zaawansowane zostają", async ({ page }) => {
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

test("control2: \"Cofnij ostatnią akcję\" cofa ostatni zapis (3. pudło -> z powrotem 2.)", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-UNDO-${Date.now()}`);
  const contexts = [];
  try {
    const buzzerCtx = await browser.newContext();
    contexts.push(buzzerCtx);
    const buzzerPage = await buzzerCtx.newPage();
    await buzzerPage.goto(`/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, { waitUntil: "domcontentloaded" });

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

test("control2: druga karta Control na tę samą grę jest zablokowana (resource-lock, kontekst \"control\")", async ({ page, context }) => {
  await loginAsTestUser(page, context);
  const game = await makeGame(page, `E2E-CONTROL2-LOCK-${Date.now()}`);
  try {
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });

    // Druga karta (ta sama sesja/konto, INNY tab_id — sessionStorage nie
    // jest dzielony między kartami) na tę samą grę musi zobaczyć overlay
    // blokady zamiast wyrenderować Control.
    const secondTab = await context.newPage();
    await secondTab.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(secondTab.locator("#resourceLockGuard")).toBeVisible({ timeout: 15000 });
    await expect(secondTab.locator(".stepTitle")).toHaveCount(0);
    await secondTab.close();
  } finally {
    await deleteGame(page, game.id);
  }
});

test("control2: QR na wyświetlaczu — host i buzzer niezależne, jeden LUB oba naraz", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const game = await makeGame(page, `E2E-CONTROL2-DUALQR-${Date.now()}`);
  const contexts = [];
  try {
    const displayCtx = await browser.newContext();
    contexts.push(displayCtx);
    const displayPage = await displayCtx.newPage();
    await displayPage.goto(`/display2?id=${game.id}&key=${game.share_key_display}`, { waitUntil: "domcontentloaded" });

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Prowadzący i Przycisk", { timeout: 10000 });

    // Tylko host -> Display pokazuje JEDEN kod (qr-single, buzzer ukryty).
    await page.locator('.device-row[data-device="host"] button', { hasText: "QR na wyświetlaczu" }).click();
    await expect(displayPage.locator("#qrScreen")).not.toHaveClass(/hidden/, { timeout: 10000 });
    await expect(displayPage.locator(".qr-grid")).toHaveClass(/qr-single/);
    await expect(displayPage.locator("#qrHostCard")).not.toHaveClass(/hidden/);
    await expect(displayPage.locator("#qrBuzzerCard")).toHaveClass(/hidden/);

    // Dołączenie buzzera -> oba naraz (qr-single znika).
    await page.locator('.device-row[data-device="buzzer"] button', { hasText: "QR na wyświetlaczu" }).click();
    await expect(displayPage.locator(".qr-grid")).not.toHaveClass(/qr-single/, { timeout: 10000 });
    await expect(displayPage.locator("#qrHostCard")).not.toHaveClass(/hidden/);
    await expect(displayPage.locator("#qrBuzzerCard")).not.toHaveClass(/hidden/);

    // Schowanie hosta -> z powrotem tylko buzzer, pojedynczo.
    await page.locator('.device-row[data-device="host"] button', { hasText: "Ukryj QR" }).click();
    await expect(displayPage.locator(".qr-grid")).toHaveClass(/qr-single/, { timeout: 10000 });
    await expect(displayPage.locator("#qrBuzzerCard")).not.toHaveClass(/hidden/);
    await expect(displayPage.locator("#qrHostCard")).toHaveClass(/hidden/);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});
