// tests/e2e/game-deletion.spec.js
// Weryfikuje, że usunięcie gry przez UI (js/pages/builder.js, deleteGame())
// realnie czyści folder user-sounds/{userId}/{gameId}/ w Supabase Storage,
// nie tylko wiersz w DB.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test("usunięcie gry przez UI czyści folder audio w buckecie user-sounds", async ({ page, context }) => {
  await loginAsTestUser(page, context);

  // Stwórz testową grę bezpośrednio przez API (nie testujemy tu kreatora gier,
  // tylko usuwanie — dokładnie ten sam kształt co createGame() w builder.js)
  const gameName = `E2E-TEST-DELETE-${Date.now()}`;
  const { userId, gameId } = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;
    const { data: game, error } = await sb
      .from("games")
      .insert({ name, owner_id: userId, type: "prepared", status: "draft" })
      .select("id")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);
    return { userId, gameId: game.id };
  }, gameName);

  // Wgraj testowy plik audio do bucketu, dokładnie na ścieżkę jakiej używa sfx-cloud.js
  const uploadError = await page.evaluate(async ({ userId, gameId }) => {
    const sb = window.__sbClient;
    const path = `${userId}/${gameId}/test_key`;
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mpeg" });
    const { error } = await sb.storage.from("user-sounds").upload(path, blob, { upsert: true });
    return error?.message || null;
  }, { userId, gameId });
  expect(uploadError, "upload testowego pliku audio nie powiódł się").toBeNull();

  // Sprawdź że plik faktycznie jest w buckecie PRZED usunięciem gry
  const before = await page.evaluate(async ({ userId, gameId }) => {
    const sb = window.__sbClient;
    const { data } = await sb.storage.from("user-sounds").list(`${userId}/${gameId}`);
    return data;
  }, { userId, gameId });
  expect(before?.length, "plik testowy powinien być w buckecie przed usunięciem gry").toBeGreaterThan(0);

  // Przejdź do buildera i odśwież listę gier, żeby nowa gra się pojawiła
  await page.goto("https://www.familiada.online/builder", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500); // czas na załadowanie listy gier z DB

  // Znajdź kartę naszej testowej gry po nazwie i kliknij jej przycisk usuwania (".x")
  const card = page.locator(".card", { has: page.locator(".name", { hasText: gameName }) });
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.locator(".x").click();

  // Potwierdź modal usuwania (przycisk "Usuń")
  await page.getByRole("button", { name: "Usuń", exact: true }).click();

  // Poczekaj aż wiersz gry zniknie z DB (deleteGame() zakończy się)
  await expect
    .poll(async () => {
      return await page.evaluate(async (id) => {
        const sb = window.__sbClient;
        const { data } = await sb.from("games").select("id").eq("id", id);
        return data?.length ?? -1;
      }, gameId);
    }, { timeout: 15000, message: "gra powinna zniknąć z bazy po usunięciu" })
    .toBe(0);

  // Kluczowa asercja: folder w buckecie user-sounds ma być pusty/nie istnieć
  const after = await page.evaluate(async ({ userId, gameId }) => {
    const sb = window.__sbClient;
    const { data } = await sb.storage.from("user-sounds").list(`${userId}/${gameId}`);
    return data;
  }, { userId, gameId });
  expect(after?.length ?? 0, "plik audio nie powinien już istnieć w buckecie po usunięciu gry").toBe(0);
});
