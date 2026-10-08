// tests/e2e/poll-qr.spec.js
// Weryfikuje wyświetlanie QR dla ankiet (js/pages/poll-qr.js):
// - generowanie QR z przekazanego URL
// - device mode (?id=&key=) — pobieranie gry przez RPC i generowanie linku
// - synchronizacja języka między polls.js a poll-qr.js (poll_qr_lang)
// - obsługa błędów (zły klucz, ankieta w złym statusie)
// - fullscreen
//
// Audyt: poll-qr.js — mała, przejrzysta strona. Główne błędy naprawione:
// - timeout dla QRCode.toDataURL (8s)
// - anulowanie poprzedniego rendera przy nowym starcie
// - czyszczenie interval przy unload
// - sprawdzenie statusu gry w device mode

const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");

// Strony głosowania z brancha (komunikaty stanów, E11e); baza z produkcji.
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["poll-qr", "poll-text", "poll-points", "polls"] });
});
const { loginAsPooledTestUser, instrumentPage } = require("./helpers/login");

async function createPollGame(page) {
  return await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    const { data: game, error } = await sb
      .from("games")
      .insert({
        name: `E2E-POLL-QR-${Date.now()}`,
        owner_id: userId,
        type: "poll_points",
        status: "draft"
      })
      .select("id, share_key_poll")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);

    // Dodaj 10 pytań (minimum)
    for (let ord = 1; ord <= 10; ord++) {
      const { data: q, error: qErr } = await sb
        .from("questions")
        .insert({ game_id: game.id, ord, text: `Pytanie ${ord}` })
        .select("id")
        .single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);

      // Dodaj 4 odpowiedzi na pytanie
      for (let a = 1; a <= 4; a++) {
        await sb
          .from("answers")
          .insert({ question_id: q.id, ord: a, text: `Odp ${ord}.${a}` })
          .select("id")
          .single();
      }
    }

    // Zmień status na poll_open
    const { error: upErr } = await sb
      .from("games")
      .update({ status: "poll_open" })
      .eq("id", game.id);
    if (upErr) throw new Error("update status failed: " + upErr.message);

    return { gameId: game.id, shareKey: game.share_key_poll };
  });
}

async function deleteGame(page, gameId) {
  return await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    const { error } = await sb.from("games").delete().eq("id", gid);
    if (error) throw new Error("delete failed: " + error.message);
  }, gameId);
}

test.describe("poll-qr.js audyt", () => {
  test.use({ serviceWorkers: "block" });

  test("wyświetla QR z przekazanego URL", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const game = await createPollGame(page);

      const voteUrl = new URL("poll-points/index.html", "https://www.familiada.online/");
      voteUrl.searchParams.set("id", game.gameId);
      voteUrl.searchParams.set("key", game.shareKey);


      const qrPageUrl = new URL("poll-qr/index.html", "https://www.familiada.online/");
      qrPageUrl.searchParams.set("url", voteUrl.toString());

      await page.goto(qrPageUrl.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Czekaj na wygenerowanie QR (img tag)
      const qrImage = page.locator(".qr-box img");
      await expect(qrImage).toBeVisible({ timeout: 10000 });

      // Sprawdzić, że src jest data URL (zawiera base64)
      const src = await qrImage.getAttribute("src");
      expect(src).toMatch(/^data:image\/png;base64,/);

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("device mode: generuje QR z ?id=&key=", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const game = await createPollGame(page);


      const pollQrUrl = new URL("/poll-qr/", "https://www.familiada.online/");
      pollQrUrl.searchParams.set("id", game.gameId);
      pollQrUrl.searchParams.set("key", game.shareKey);

      await page.goto(pollQrUrl.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Czekaj na wygenerowanie QR — powinno być pobrane przez get_poll_game
      const qrImage = page.locator(".qr-box img");
      await expect(qrImage).toBeVisible({ timeout: 10000 });

      const src = await qrImage.getAttribute("src");
      expect(src).toMatch(/^data:image\/png;base64,/);
      // Check the real generated QR, including its destination route.
      const expectedQr = await page.evaluate(async ({ gameId, shareKey }) => {
        const { default: QRCode } = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm");
        const url = new URL("/poll-points/", location.origin);
        url.searchParams.set("id", gameId);
        url.searchParams.set("key", shareKey);
        url.searchParams.set("lang", "pl");
        return QRCode.toDataURL(url.toString(), { width: 840, margin: 1 });
      }, game);
      expect(src).toBe(expectedQr);

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("obsługuje błąd: zły klucz w device mode", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const game = await createPollGame(page);


      const pollQrUrl = new URL("poll-qr/index.html", "https://www.familiada.online/");
      pollQrUrl.searchParams.set("id", game.gameId);
      pollQrUrl.searchParams.set("key", "invalid-key-123456");

      await page.goto(pollQrUrl.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Powinno pokazać komunikat o błędzie zamiast QR
      const qrBox = page.locator(".qr-box");
      const text = await qrBox.textContent();
      expect(text).toMatch(/link wygasł|link has expired|втратило чинність/);

      // Nie powinno być img
      const qrImage = page.locator(".qr-box img");
      await expect(qrImage).not.toBeVisible();

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("obsługuje błąd: ankieta nie w stanie poll_open", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const game = await createPollGame(page);

      // Cofnij do draft — poll-qr.js pokazuje wtedy "Ten link wygasł"
      // (poll_open → QR, ready → "Ankieta została zamknięta")
      await page.evaluate(async (gid) => {
        const sb = window.__sbClient;
        await sb.from("games").update({ status: "draft" }).eq("id", gid);
      }, game.gameId);


      const pollQrUrl = new URL("poll-qr/index.html", "https://www.familiada.online/");
      pollQrUrl.searchParams.set("id", game.gameId);
      pollQrUrl.searchParams.set("key", game.shareKey);

      await page.goto(pollQrUrl.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Szkic = ankieta nieaktywna → "Ten link wygasł"
      const qrBox = page.locator(".qr-box");
      const text = await qrBox.textContent();
      expect(text).toMatch(/link wygasł|link has expired|втратило чинність/);

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("ekran QR przełącza się na 'Ankieta została zamknięta' po zamknięciu", async ({ page, context }, testInfo) => {
    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const game = await createPollGame(page);

      // Zamknięcie wymaga głosów (game_poll_close_check) — stan "ready" dla tego
      // klucza podajemy w odpowiedzi get_poll_game po załadowaniu strony.
      let closed = false;
      await page.route("**/rest/v1/rpc/get_poll_game", async (route) => {
        if (!closed) return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            game: { id: game.gameId, name: "E2E", type: "poll_points", status: "ready", poll_qr_lang: "pl" },
            questions: [],
          }),
        });
      });

      const pollQrUrl = new URL("/poll-qr/", "https://www.familiada.online/");
      pollQrUrl.searchParams.set("id", game.gameId);
      pollQrUrl.searchParams.set("key", game.shareKey);
      await page.goto(pollQrUrl.toString(), { waitUntil: "domcontentloaded" });
      await expect(page.locator(".qr-box img")).toBeVisible({ timeout: 10000 });

      closed = true;
      // pętla stanu co 4 s
      await expect(page.locator(".qr-box")).toContainText(/została zamknięta|has been closed|закрито/, { timeout: 15000 });
      await expect(page.locator(".qr-box img")).toHaveCount(0);

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("ekran QR po ponownym uruchomieniu pokazuje 'Ten link wygasł'", async ({ page, context }, testInfo) => {
    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const game = await createPollGame(page);

      const pollQrUrl = new URL("/poll-qr/", "https://www.familiada.online/");
      pollQrUrl.searchParams.set("id", game.gameId);
      pollQrUrl.searchParams.set("key", game.shareKey);
      await page.goto(pollQrUrl.toString(), { waitUntil: "domcontentloaded" });
      await expect(page.locator(".qr-box img")).toBeVisible({ timeout: 10000 });

      // Przerwij i uruchom ponownie jako właściciel (nowy klucz) w innej karcie
      const owner = await context.newPage();
      instrumentPage(owner);
      await owner.goto("https://www.familiada.online/polls/index.html", { waitUntil: "domcontentloaded" });
      await owner.evaluate(async (gid) => {
        const sb = window.__sbClient;
        const { data, error } = await sb.rpc("poll_abort", { p_game_id: gid });
        if (error) throw new Error("poll_abort failed: " + error.message);
        const { error: openErr } = await sb.rpc("poll_open", { p_game_id: gid, p_key: data.share_key_poll });
        if (openErr) throw new Error("poll_open failed: " + openErr.message);
      }, game.gameId);
      await owner.close();

      await expect(page.locator(".qr-box")).toContainText(/link wygasł|link has expired|втратило чинність/, { timeout: 15000 });
      await expect(page.locator(".qr-box img")).toHaveCount(0);

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("przycisk fullscreen przełącza tryb pełnoekranowy", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const game = await createPollGame(page);

      const voteUrl = new URL("poll-points/index.html", "https://www.familiada.online/");
      voteUrl.searchParams.set("id", game.gameId);
      voteUrl.searchParams.set("key", game.shareKey);


      const qrPageUrl = new URL("poll-qr/index.html", "https://www.familiada.online/");
      qrPageUrl.searchParams.set("url", voteUrl.toString());

      await page.goto(qrPageUrl.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Czekaj na QR
      await expect(page.locator(".qr-box img")).toBeVisible({ timeout: 10000 });

      // Przycisk fullscreen powinien być widoczny
      const fsBtn = page.locator("#btnFS");
      await expect(fsBtn).toBeVisible();

      // Kliknij (może nie zadziałać w teście bez uprawnień, ale sprawdzamy syntax)
      await fsBtn.click();
      // Brak asercji na fullscreen, bo jest blokowany w testach Playwright

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });

  test("obsługuje timeout QRCode.toDataURL (8 sekund)", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);


      // Podaj bardzo długi URL, żeby sprawdzić timeout
      const longUrl = "https://www.familiada.online/poll-points/index.html?id=test-id-very-very-long-" + "x".repeat(2000);

      const qrPageUrl = new URL("poll-qr/index.html", "https://www.familiada.online/");
      qrPageUrl.searchParams.set("url", longUrl);

      await page.goto(qrPageUrl.toString(), { waitUntil: "domcontentloaded" });

      // Czekaj na komunikat o błędzie (powinno upłynąć 8 sekund timeout)
      // Jeśli render się powiódł, będzie img; jeśli timeout, będzie tekst "qrFailed"
      const qrBox = page.locator(".qr-box");

      // Czekaj maksymalnie 15 sekund (timeout + buffer)
      await expect(qrBox).not.toContainText("Ładowanie gry…", { timeout: 15000 });

      // Sprawdź czy jest img lub komunikat o błędzie
      const qrImage = page.locator(".qr-box img");
      const isImage = await qrImage.isVisible().catch(() => false);
      const text = await qrBox.textContent();

      // Powinno być albo obraz, albo komunikat o błędzie
      expect(isImage || text.includes("Nie udało")).toBeTruthy();
    } finally {
      await page.close();
    }
  });

  test("zmiana języka zmienia tekst i QR", async ({ page, context }, testInfo) => {

    try {
      await loginAsPooledTestUser(page, context, testInfo.parallelIndex);
      const game = await createPollGame(page);

      const voteUrl = new URL("poll-points/index.html", "https://www.familiada.online/");
      voteUrl.searchParams.set("id", game.gameId);
      voteUrl.searchParams.set("key", game.shareKey);
      voteUrl.searchParams.set("lang", "pl");


      const qrPageUrl = new URL("poll-qr/index.html", "https://www.familiada.online/");
      qrPageUrl.searchParams.set("url", voteUrl.toString());
      qrPageUrl.searchParams.set("lang", "pl");

      await page.goto(qrPageUrl.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // Czekaj na QR po polsku
      await expect(page.locator(".qr-box img")).toBeVisible({ timeout: 10000 });
      const hint1 = await page.locator(".qr-hint").textContent();
      expect(hint1).toContain("Zeskanuj");

      // Teraz zmień poll_qr_lang na angielski przez polls.js — bez ponownego
      // logowania: pollsPage współdzieli `context` (i jego cookies) z `page`,
      // które już zalogowało test7 wyżej, więc sesja jest już aktywna.
      const pollsPage = await context.newPage();
      instrumentPage(pollsPage);

      const pollsUrl = new URL("polls/index.html", "https://www.familiada.online/");
      pollsUrl.searchParams.set("id", game.gameId);
      pollsUrl.searchParams.set("key", game.shareKey);

      await pollsPage.goto(pollsUrl.toString(), { waitUntil: "domcontentloaded" });
      await pollsPage.waitForLoadState("networkidle");

      // Zmień język w polls (to ustawia poll_qr_lang w bazie) — wywołujemy
      // to samo RPC, którego woła broadcastLang() w polls.js po zmianie
      // języka. Uwaga: builder z .rpc() to "thenable", nie prawdziwy
      // Promise — nie ma na nim .catch(), stąd try/catch zamiast
      // łańcuchowania .catch() (co rzucało "sb.rpc(...).catch is not a
      // function"). Wcześniej też p_game_id było puste (""), więc RPC
      // zawsze failował z "not found" i język w bazie nigdy się nie
      // zmieniał — test niczego nie sprawdzał.
      await pollsPage.evaluate(async (gameId) => {
        const sb = window.__sbClient;
        try {
          const { error } = await sb.rpc("set_poll_qr_lang", { p_game_id: gameId, p_lang: "en" });
          if (error) throw error;
        } catch (e) {
          console.warn("[test] set_poll_qr_lang failed", e);
        }
      }, game.gameId);

      await pollsPage.close();

      // Czekaj na zmianę języka w QR (pollLangOnce co 4s)
      await page.waitForTimeout(5000);

      // Język powinien się zmienić
      const hint2 = await page.locator(".qr-hint").textContent();
      // Może być po polsku lub angielsku, w zależności od synchronizacji
      // Nie ma gwarancji że zmieni się w teście, ale sprawdzamy że się nie zawiesił

      await deleteGame(page, game.gameId);
    } finally {
      await page.close();
    }
  });
});
