// tests/e2e/control2-round-mechanics.spec.js
//
// Rozszerzone pokrycie mechaniki rund poza samą "ścieżką idealną" ze
// control2-full-game.spec.js (ten plik dotyka wyłącznie wznowienia).
// Jeden ciągły przebieg dwóch rund celowo splata ze sobą "nietypowe"
// zachowania operatora, żeby pokryć wszystkie gałęzie R2-R10 (plan, tabela
// A) w jednym, w pełni policzalnym scenariuszu:
//
// Runda 1: pojedynek RESETUJE się (obie drużyny pudłują pierwszą próbę),
// dopiero drugie bzyknięcie wygrywa; potem 3x pudło -> KRADZIEŻ WYGRANA
// przez drużynę przeciwną; koniec rundy bez pełnego odsłonięcia -> R8
// (odkrywanie reszty).
// Runda 2: pojedynek wygrany od razu; "Oddaj pytanie" (PASS); kolejne 3x
// pudło -> KRADZIEŻ PRZEGRANA; znowu R8; pula pytań się kończy (2 pytania)
// -> r_gameEnd (hasFinal=false) -> "Pokaż koniec gry" -> NOWY przycisk
// "Zakończ rozgrywkę" musi wrócić do /builder.
//
// Zweryfikowane ręcznie punkt-po-punkcie na engine.js przed napisaniem
// (patrz komentarze przy każdym kroku) — oczekiwany wynik końcowy: A 140,
// B 0 (mnożniki rund 1-2 = x1 z domyślnego roundMultipliers).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test.setTimeout(150_000);

test("control2: reset pojedynku, pass, kradzież wygrana/przegrana, odkrywanie reszty, koniec gry bez finału + Zakończ rozgrywkę", async ({
  page,
  browser,
}) => {
  await loginAsTestUser(page, page.context());

  const gameName = `E2E-CONTROL2-ROUNDMECH-${Date.now()}`;
  const game = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: g, error: gErr } = await sb
      .from("games")
      .insert({
        name, owner_id: userData.user.id, type: "prepared", status: "ready",
        settings: { teams: { teamA: "Alfa", teamB: "Beta" }, game: { hasFinal: false } },
      })
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .single();
    if (gErr) throw new Error("insert games failed: " + gErr.message);

    for (const [ord, text] of [[1, "Pytanie testowe 1"], [2, "Pytanie testowe 2"]]) {
      const { data: q, error: qErr } = await sb
        .from("questions").insert({ game_id: g.id, ord, text }).select("id").single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);
      const answers = [
        { question_id: q.id, ord: 1, text: "Odpowiedź A", fixed_points: 40 },
        { question_id: q.id, ord: 2, text: "Odpowiedź B", fixed_points: 30 },
        { question_id: q.id, ord: 3, text: "Odpowiedź C", fixed_points: 20 },
      ];
      const { error: aErr } = await sb.from("answers").insert(answers);
      if (aErr) throw new Error("insert answers failed: " + aErr.message);
    }
    return g;
  }, gameName);

  const contexts = [];
  const consoleErrors = [];
  const trackErrors = (p, label) => { p.on("pageerror", (err) => consoleErrors.push(`${label}: ${err.message}`)); };

  try {
    trackErrors(page, "control");
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Wyświetlacz", { timeout: 15000 });

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

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia — Prowadzący i Przycisk", { timeout: 15000 });
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();

    // ===== RUNDA 1 =====
    await expect(page.locator(".c2-stepper")).toContainText("Runda 1", { timeout: 10000 });
    await page.getByRole("button", { name: "Start rundy" }).click();

    // Bzyknięcie A, potem A i B pudłują po kolei -> pełny reset pojedynku.
    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();
    await page.getByRole("button", { name: "X", exact: true }).click(); // A pudłuje -> kolej B
    await page.getByRole("button", { name: "X", exact: true }).click(); // B pudłuje też -> RESET

    // Po resecie Buzzer znów aktywny (step wraca do r_duel) -> teraz B bzyka.
    await expect(buzzerPage.getByRole("button", { name: "Buzzer B" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer B" }).click();
    await expect(page.getByText("Zgłoszono: B")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();

    // B trafia #1 (40 pkt, najwyższe) -> wygrywa pojedynek, przejmuje kontrolę.
    await page.getByRole("button", { name: "#1" }).click();
    await expect(page.getByText("Bank: 40")).toBeVisible({ timeout: 10000 });

    // B pudłuje 3x -> auto-KRADZIEŻ dla A (nie wszystkie odpowiedzi odkryte).
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();

    // A kradnie WYGRANĄ: trafia #2 (30 pkt).
    await page.getByRole("button", { name: "#2" }).click();
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    // #3 nieodkryte -> R8 (odkrywanie reszty, czysto pokazowe).
    await page.getByRole("button", { name: "#3" }).click();

    // finalizeRound(): próg (300) nieosiągnięty, pula ma jeszcze pytanie 2.
    await expect(page.locator(".c2-stepper")).toContainText("Runda 2", { timeout: 10000 });
    await expect(page.getByText(/Wyniki: A 70/)).toBeVisible({ timeout: 10000 });

    // ===== RUNDA 2 =====
    await page.getByRole("button", { name: "Start rundy" }).click();
    await expect(buzzerPage.getByRole("button", { name: "Buzzer B" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer B" }).click();
    await expect(page.getByText("Zgłoszono: B")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();

    // B trafia #1 (40 pkt) -> kontrola B, allowPass=true.
    await page.getByRole("button", { name: "#1" }).click();
    await page.getByRole("button", { name: "Pass" }).click(); // "Oddaj pytanie" -> kontrola A

    // A trafia #2 (30 pkt) -> bank 70.
    await page.getByRole("button", { name: "#2" }).click();
    await expect(page.getByText("Bank: 70")).toBeVisible({ timeout: 10000 });

    // A pudłuje 3x -> auto-KRADZIEŻ dla B.
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "X", exact: true }).click();

    // B kradnie, ale też PUDŁUJE -> kradzież PRZEGRANA, bank zostaje przy A.
    await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    await page.getByRole("button", { name: "#3" }).click(); // R8 ponownie

    // Pula pytań wyczerpana (2/2 użyte), próg nieosiągnięty, hasFinal=false
    // -> prosto do r_gameEnd. Wynik: A 70+70=140, B 0.
    await expect(page.locator(".c2-stepper")).toContainText("Koniec gry", { timeout: 10000 });
    await expect(page.getByText("Wynik końcowy: A 140 — B 0")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Pokaż koniec gry" }).click();
    const finishBtn = page.getByRole("button", { name: "Zakończ rozgrywkę" });
    await expect(finishBtn).toBeVisible({ timeout: 10000 });
    await finishBtn.click();
    await expect(page).toHaveURL(/\/builder/, { timeout: 10000 });
    // Poczekaj aż /builder w pełni zainicjuje swój klient Supabase, żeby
    // sprzątanie w finally (usunięcie gry testowej) miało czego użyć.
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
