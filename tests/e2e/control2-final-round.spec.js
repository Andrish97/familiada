// tests/e2e/control2-final-round.spec.js
//
// Pokrycie finału (plan, tabela B) — celowo pominięte w
// control2-full-game.spec.js na pierwszy przebieg (hasFinal="Nie").
// Scenariusz zaprojektowany tak, żeby wymusić deterministycznie WCZESNE
// zakończenie finału (próg finalTarget=200 osiągnięty w połowie mapowania
// gracza 1): 1 pytanie rund z JEDNĄ odpowiedzią za 300 pkt (od razu
// przekracza finalMinPoints=300, wchodzimy do finału po jednej rundzie),
// 5 pytań finałowych z JEDNĄ odpowiedzią za 50 pkt każde — po 4.
// dopasowaniu suma = 200 = próg, więc silnik ma przeskoczyć PROSTO do
// f_end, pomijając 5. pytanie i CAŁEGO gracza 2 (engine.js's gotoEnd()).
// To sprawdza kluczową, łatwą do przeoczenia gałąź reguł finału.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test.setTimeout(120_000);

test("control2: próg w rundzie -> finał, wczesne zakończenie po 4/5 pytaniach (próg trafiony), pomija gracza 2", async ({
  page,
  browser,
}) => {
  await loginAsTestUser(page, page.context());

  const gameName = `E2E-CONTROL2-FINAL-${Date.now()}`;
  const game = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();

    const { data: g, error: gErr } = await sb
      .from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared", status: "ready" })
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .single();
    if (gErr) throw new Error("insert games failed: " + gErr.message);

    // Runda: 1 pytanie, 1 odpowiedź za 300 pkt -> próg finału (300) trafiony
    // od razu po pierwszej rundzie.
    const { data: rq, error: rqErr } = await sb
      .from("questions").insert({ game_id: g.id, ord: 1, text: "Pytanie testowe (runda)" }).select("id").single();
    if (rqErr) throw new Error("insert round question failed: " + rqErr.message);
    const { error: raErr } = await sb.from("answers").insert([
      { question_id: rq.id, ord: 1, text: "Odpowiedź warta 300", fixed_points: 300 },
    ]);
    if (raErr) throw new Error("insert round answer failed: " + raErr.message);

    // Finał: 5 pytań, 1 odpowiedź za 50 pkt każde.
    const pickedFinal = [];
    for (let i = 1; i <= 5; i++) {
      const { data: fq, error: fqErr } = await sb
        .from("questions").insert({ game_id: g.id, ord: 100 + i, text: `Pytanie finałowe ${i}` }).select("id").single();
      if (fqErr) throw new Error("insert final question failed: " + fqErr.message);
      const { error: faErr } = await sb.from("answers").insert([
        { question_id: fq.id, ord: 1, text: "Odpowiedź finałowa", fixed_points: 50 },
      ]);
      if (faErr) throw new Error("insert final answer failed: " + faErr.message);
      pickedFinal.push({ id: fq.id });
    }

    const { error: upErr } = await sb.from("games").update({
      settings: {
        teams: { teamA: "Alfa", teamB: "Beta" },
        game: { hasFinal: true, finalQuestionsMode: "pick" },
        questions: { final: pickedFinal, rounds: [] },
      },
    }).eq("id", g.id);
    if (upErr) throw new Error("update settings failed: " + upErr.message);

    return g;
  }, gameName);

  const contexts = [];
  const consoleErrors = [];
  const trackErrors = (p, label) => { p.on("pageerror", (err) => consoleErrors.push(`${label}: ${err.message}`)); };

  try {
    trackErrors(page, "control");
    const openAnon = async (path, label) => {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      const p = await ctx.newPage();
      trackErrors(p, label);
      await p.goto(path, { waitUntil: "domcontentloaded" });
      return p;
    };
    const buzzerPage = await openAnon(`/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer");
    await openAnon(`/display2?id=${game.id}&key=${game.share_key_display}`, "display");
    await openAnon(`/host2?id=${game.id}&key=${game.share_key_host}`, "host");

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

    // Jedna odpowiedź w puli: revealed==answers od razu po wygranym pojedynku,
    // ale canEndRound ustawia się dopiero przy 3. X (engine.js: DUEL-branch
    // REVEAL_ANSWER nie sprawdza tego wprost) — 3x pudło, potem koniec rundy.
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "Zakończ rundę" }).click();

    // Próg (300) trafiony, hasFinal=true, finalQuestionsMode="pick" + 5
    // potwierdzonych pytań -> prosto do finału (bez r_gameEnd).
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
      if (i < 3) {
        await page.getByRole("button", { name: "Dalej" }).click();
      }
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

    expect(consoleErrors, "żadne z urządzeń nie powinno rzucić błędu JS: " + consoleErrors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      await sb.from("games").delete().eq("id", gid);
    }, game.id).catch(() => {});
  }
});
