// tests/e2e/control2-full-game.spec.js
//
// Test tego, po co cała ta przebudowa powstała (plan, sekcja 7): cztery
// konteksty (Control + Display + Host + Buzzer) grają rundę od startu do
// końca (bzyczenie przez prawdziwy klik na Buzzerze, przejęcie kontroli,
// odkrywanie odpowiedzi, koniec rundy z przejściem do rundy 2), a potem
// Control jest PRZEŁADOWANY w środku rundy 2 — i musi wrócić dokładnie do
// tego samego miejsca (numer rundy, wyniki), bez żadnej ręcznej interwencji.
// To jest bezpośredni dowód na to, że hydrate() faktycznie wznawia stan
// (control/js/store.js:338-343 — luka, którą ta przebudowa zamyka), zamiast
// go kasować jak dziś.
//
// Finał celowo POMINIĘTY w tym pierwszym przebiegu testu (hasFinal="Nie")
// — to osobny, duży blok do dopisania po potwierdzeniu, że podstawowy
// przepływ (rundy + bzyczenie + wznowienie) faktycznie działa na żywo.
//
// Dwa pytania w puli (nie jedno), żeby po rundzie 1 gra przeszła do "runda
// 2" zamiast prosto do r_gameEnd (finalizeRound() kończy grę, gdy pula
// pytań jest pusta) — właśnie w tym momencie robimy reload.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test.setTimeout(120_000);

test("control2: pełna runda przez wszystkie 4 urządzenia + wznowienie Control po przeładowaniu w środku rundy 2", async ({
  page,
  browser,
}) => {
  await loginAsTestUser(page, page.context());

  const gameName = `E2E-CONTROL2-FULLGAME-${Date.now()}`;
  const game = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: g, error: gErr } = await sb
      .from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared", status: "ready" })
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .single();
    if (gErr) throw new Error("insert games failed: " + gErr.message);

    for (const [ord, text] of [[1, "Pytanie testowe 1"], [2, "Pytanie testowe 2"]]) {
      const { data: q, error: qErr } = await sb
        .from("questions")
        .insert({ game_id: g.id, ord, text })
        .select("id")
        .single();
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
  const trackErrors = (p, label) => {
    p.on("pageerror", (err) => consoleErrors.push(`${label}: ${err.message}`));
  };

  try {
    trackErrors(page, "control");
    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h2")).toHaveText("Podłącz wyświetlacz", { timeout: 15000 });

    const openAnon = async (path, label) => {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      const p = await ctx.newPage();
      trackErrors(p, label);
      await p.goto(path, { waitUntil: "domcontentloaded" });
      return p;
    };

    const displayPage = await openAnon(`/display2?id=${game.id}&key=${game.share_key_display}`, "display");
    const hostPage = await openAnon(`/host2?id=${game.id}&key=${game.share_key_host}`, "host");
    const buzzerPage = await openAnon(`/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, "buzzer");

    // D0 -> D1 -> D3
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator("h2")).toHaveText("Podłącz prowadzącego i buzzer", { timeout: 15000 });
    await page.getByRole("button", { name: "Zakończ podłączanie" }).click();
    await expect(page.locator("h2")).toHaveText("Ustawienia gry", { timeout: 10000 });

    await page.locator('input[placeholder="Drużyna A"]').fill("Alfa");
    await page.locator('input[placeholder="Drużyna B"]').fill("Beta");
    await page.locator("select").selectOption("false"); // hasFinal = Nie
    await page.getByRole("button", { name: "Rozpocznij" }).click();

    // r_intro -> r_roundStart (runda 1)
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Runda 1", { timeout: 10000 });
    await page.getByRole("button", { name: "Start rundy" }).click();

    // Bzyczenie: prawdziwy klik na Buzzerze (nie symulacja w Control).
    await expect(buzzerPage.getByRole("button", { name: "Buzzer A" })).toBeEnabled({ timeout: 10000 });
    await buzzerPage.getByRole("button", { name: "Buzzer A" }).click();
    await expect(page.getByText("Zgłoszono: A")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Przyjmij" }).click();

    // Pojedynek: odpowiedź #1 ma najwyższe punkty (40) — trafienie wygrywa
    // pojedynek i przechodzi do PLAY z kontrolą drużyny A.
    await page.getByRole("button", { name: "#1" }).click();
    await page.getByRole("button", { name: "#2" }).click();
    await page.getByRole("button", { name: "#3" }).click();

    await page.getByRole("button", { name: "Zakończ rundę" }).click();

    // finalizeRound(): próg (300) nieosiągnięty, hasFinal=false, pula ma
    // jeszcze pytanie 2 -> powrót do r_roundStart, runda 2.
    await expect(page.locator(".c2-stepper")).toContainText("Runda 2", { timeout: 10000 });

    // ===== KLUCZOWY MOMENT: przeładowanie Control w środku rundy 2 =====
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".c2-stepper")).toContainText("Runda 2", { timeout: 15000 });
    // Wynik rundy 1 (bank 90, mnożnik x1 dla rundy 1) musi przetrwać reload.
    await expect(page.getByText(/Wyniki: A 90/)).toBeVisible({ timeout: 10000 });

    expect(consoleErrors, "żadne z 4 urządzeń nie powinno rzucić błędu JS w trakcie gry: " + consoleErrors.join(" | ")).toEqual([]);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      await sb.from("games").delete().eq("id", gid);
    }, game.id);
  }
});
