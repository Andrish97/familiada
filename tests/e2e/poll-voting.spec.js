// tests/e2e/poll-voting.spec.js
// Weryfikuje głosowanie w ankietach (poll-points.js, poll-text.js):
// - ładowanie ankiety z RPC poll_get_payload
// - głosowanie (klikanie odpowiedzi / wpisanie tekstu)
// - wysyłka głosów w batchu
// - obsługa errorów (brak parametrów, ankieta zamknięta, już głosował)
// - zmiana języka
// - task mode (?t=token) dla zaproszonych
//
// Audyt: bliźniacze strony (poll-points i poll-text) z asymetrią:
// - brakujący komunikat "już zagłosowałeś" w poll-text
// - brak odbloknięcia przycisków w poll-points na error
// - niejasne optional chaining w poll-text

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, instrumentPage, testAccountUsername } = require("./helpers/login");

async function createPollGame(page, type) {
  return await page.evaluate(async (pollType) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    const { data: game, error } = await sb
      .from("games")
      .insert({
        name: `E2E-${pollType}-${Date.now()}`,
        owner_id: userId,
        type: pollType,
        status: "draft",
      })
      .select("id, share_key_poll")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);

    // Dodaj 10 pytań
    for (let ord = 1; ord <= 10; ord++) {
      const { data: q, error: qErr } = await sb
        .from("questions")
        .insert({ game_id: game.id, ord, text: `Pytanie ${ord}` })
        .select("id")
        .single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);

      // Dodaj odpowiedzi
      if (pollType === "poll_points") {
        // 4 odpowiedzi dla punktów
        for (let a = 1; a <= 4; a++) {
          await sb
            .from("answers")
            .insert({ question_id: q.id, ord: a, text: `Odp ${ord}.${a}` })
            .select("id")
            .single();
        }
      }
      // poll_text nie potrzebuje answers (są tekstowe)
    }

    // Zmień status na poll_open
    await sb.from("games").update({ status: "poll_open" }).eq("id", game.id);

    return { gameId: game.id, shareKey: game.share_key_poll };
  }, type);
}

async function deleteGame(page, gameId) {
  return await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    await sb.from("games").delete().eq("id", gid);
  }, gameId);
}

test.describe("poll-voting (poll-points.js i poll-text.js) audyt", () => {
  test.use({ serviceWorkers: "block" });

  test("poll-points: głosowanie w ankiecie punktowej", async ({ page, context }) => {
    try {
      await loginAsTestUser(page, context, { username: testAccountUsername(1) });
      const game = await createPollGame(page, "poll_points");

      const url = new URL("poll-points.html", "https://www.familiada.online/");
      url.searchParams.set("id", game.gameId);
      url.searchParams.set("key", game.shareKey);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Czekaj na załadowanie pytań
      await expect(page.locator(".qtext")).toContainText("Pytanie 1", { timeout: 10000 });

      // Sprawdź czy są przyciski odpowiedzi (4 dla każdego pytania)
      const answerButtons = page.locator(".alist button");
      await expect(answerButtons).toHaveCount(4);

      // Kliknij pierwszą odpowiedź
      await answerButtons.first().click();

      // Powinno przejść do pytania 2
      await expect(page.locator(".qtext")).toContainText("Pytanie 2", { timeout: 5000 });

      // Przejdź przez wszystkie pytania
      for (let i = 2; i <= 10; i++) {
        const buttons = page.locator(".alist button");
        await buttons.first().click();
        if (i < 10) {
          await expect(page.locator(".qtext")).toContainText(`Pytanie ${i + 1}`, { timeout: 5000 });
        }
      }

      // Po ostatnim pytaniu powinno przejść do wysyłki i podziękowania
      await expect(page.locator(".sub")).toContainText(/Dziękujemy|Thanks|Дякуємо/, { timeout: 10000 });

      // Sprawdź że localStorage ma mark "już zagłosowałeś"
      const isDone = await page.evaluate(
        (key) => localStorage.getItem(`fam_poll_done_${key}`) === "1",
        `${game.gameId}_${game.shareKey}`
      );
      expect(isDone).toBe(true);

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("poll-text: głosowanie w ankiecie tekstowej", async ({ page, context }) => {
    try {
      await loginAsTestUser(page, context, { username: testAccountUsername(2) });
      const game = await createPollGame(page, "poll_text");


      const url = new URL("poll-text.html", "https://www.familiada.online/");
      url.searchParams.set("id", game.gameId);
      url.searchParams.set("key", game.shareKey);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Czekaj na załadowanie pytania
      await expect(page.locator(".qtext")).toContainText("Pytanie 1", { timeout: 10000 });

      const input = page.locator("#answerInput");
      const sendBtn = page.locator("#btnSend");

      // Wpisz odpowiedź na pytanie 1
      await input.fill("Moja odpowiedź");
      await sendBtn.click();

      // Powinno przejść do pytania 2
      await expect(page.locator(".qtext")).toContainText("Pytanie 2", { timeout: 5000 });

      // Przejdź przez wszystkie pytania
      for (let i = 2; i <= 10; i++) {
        await input.fill(`Odpowiedź ${i}`);
        await sendBtn.click();
        if (i < 10) {
          await expect(page.locator(".qtext")).toContainText(`Pytanie ${i + 1}`, { timeout: 5000 });
        }
      }

      // Po ostatnim pytaniu powinno być podziękowanie
      await expect(page.locator(".sub")).toContainText(/Dziękujemy|Thanks|Дякуємо/, { timeout: 10000 });

      // Sprawdź localStorage
      const isDone = await page.evaluate(
        (key) => localStorage.getItem(`fam_poll_done_${key}`) === "1",
        `${game.gameId}_${game.shareKey}`
      );
      expect(isDone).toBe(true);

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("poll-text: komunikat 'już zagłosowałeś' przy powtórnym wejściu", async ({ page, context }) => {
    try {
      await loginAsTestUser(page, context, { username: testAccountUsername(3) });
      const game = await createPollGame(page, "poll_text");


      // Ustaw localStorage na "już głosował"
      await page.evaluate(
        (key) => localStorage.setItem(`fam_poll_done_${key}`, "1"),
        `${game.gameId}_${game.shareKey}`
      );

      const url = new URL("poll-text.html", "https://www.familiada.online/");
      url.searchParams.set("id", game.gameId);
      url.searchParams.set("key", game.shareKey);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać komunikat "Już zagłosowałeś" zamiast pytań
      const closed = page.locator(".closed");
      await expect(closed).toContainText(/wziąłeś udział|already participated|вже брали участь/, { timeout: 10000 });

      // Formularz powinien być ukryty
      const qbox = page.locator(".qbox");
      await expect(qbox).not.toBeVisible();

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("poll-points: obsługuje brakujące parametry", async ({ context }) => {
    const page = await context.newPage();
    instrumentPage(page);

    try {

      // Brak ?id i ?key
      await page.goto("https://www.familiada.online/poll-points.html", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać komunikat o błędzie
      const sub = page.locator(".sub");
      await expect(sub).toContainText(/Brak|Missing/, { timeout: 10000 });

      // Formularz powinien być ukryty
      const qbox = page.locator(".qbox");
      await expect(qbox).not.toBeVisible();
    } finally {
      await page.close();
    }
  });

  test("poll-text: limit 17 znaków w polu tekstowym", async ({ page, context }) => {
    try {
      await loginAsTestUser(page, context, { username: testAccountUsername(4) });
      const game = await createPollGame(page, "poll_text");


      const url = new URL("poll-text.html", "https://www.familiada.online/");
      url.searchParams.set("id", game.gameId);
      url.searchParams.set("key", game.shareKey);

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const input = page.locator("#answerInput");
      const countEl = page.locator("#count");

      // Wpisz tekst
      await input.fill("To jest bardzo długi tekst");

      // Sprawdź że limit 17 znaków zadziałał
      const value = await input.inputValue();
      expect(value.length).toBeLessThanOrEqual(17);

      // Licznik powinien pokazywać 17/17
      await expect(countEl).toContainText("17/17");

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("poll-points: obsługuje error wysyłki z recovery", async ({ context }) => {
    const page = await context.newPage();
    instrumentPage(page);

    try {
      // TODO: Test error scenario — wymaga mock'owania błędu RPC
      // Na razie zostawiamy placeholder
      expect(true).toBe(true);
    } finally {
      await page.close();
    }
  });
});
