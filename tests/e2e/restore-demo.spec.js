// tests/e2e/restore-demo.spec.js
// Weryfikuje punkt 4 Planu 2: "przywróć demo" (restore_my_demo) kasuje
// wiersze is_demo=true w user_logos/games, ale to czysty SQL bez dostępu
// do storage — więc account.js robi "zdjęcie przed/po" wokół RPC i sam
// czyści osierocone pliki. Test symuluje dokładnie ten przypadek: demo
// zostało wcześniej "wyedytowane" (dostało realny plik), a flaga
// is_demo=true została (edycja jej nie kasuje — patrz logo-editor/js/main.js
// updateLogo(), które nie dotyka is_demo).

const { test, expect } = require("./helpers/e2e-test");

test.use({ needs: { standard: 1 } });

// /account jest celowo zablokowane dla gości (guest-mode.js showGuestBlockedOverlay,
// account.js:453) — restore demo można przetestować tylko na koncie testowym.
test("restore_my_demo czyści osierocone pliki po edytowanym demo (logo i gra)", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(15 * 60_000);
  await loginAs(page, context, accounts.standard[0]);

  const setup = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    // "Edytowane demo" — gra z is_demo=true, ale z realnym dźwiękiem w storage
    const { data: game, error: gameErr } = await sb
      .from("games")
      .insert({ name: `E2E-DEMO-GAME-${Date.now()}`, owner_id: userId, type: "prepared", status: "draft", is_demo: true })
      .select("id")
      .single();
    if (gameErr) throw new Error("insert demo game failed: " + gameErr.message);

    const soundBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mpeg" });
    const soundPath = `${userId}/${game.id}/test_key`;
    const { error: soundErr } = await sb.storage.from("user-sounds").upload(soundPath, soundBlob, { upsert: true });
    if (soundErr) throw new Error("upload sound failed: " + soundErr.message);

    // "Edytowane demo" — logo z is_demo=true, ale z realnym wgranym obrazkiem
    const logoBlob = new Blob([new Uint8Array([5, 6, 7, 8])], { type: "image/png" });
    const logoPath = `${userId}/test-demo-logo.png`;
    const { error: logoErr } = await sb.storage.from("user-logos").upload(logoPath, logoBlob, { upsert: true });
    if (logoErr) throw new Error("upload logo failed: " + logoErr.message);
    const { data: pub } = sb.storage.from("user-logos").getPublicUrl(logoPath);

    const { error: rowErr } = await sb.from("user_logos").insert({
      user_id: userId,
      name: `E2E-DEMO-LOGO-${Date.now()}`,
      type: "PIX_150x70",
      is_demo: true,
      payload: { source: { mode: "image", imageUrl: pub.publicUrl } },
    });
    if (rowErr) throw new Error("insert user_logos failed: " + rowErr.message);

    return { userId, gameId: game.id, logoPath };
  });

  const before = await page.evaluate(async ({ userId, gameId }) => {
    const sb = window.__sbClient;
    const sounds = await sb.storage.from("user-sounds").list(`${userId}/${gameId}`);
    const logos = await sb.storage.from("user-logos").list(userId);
    return { sounds: sounds.data, logos: logos.data };
  }, setup);
  expect(before.sounds?.length, "plik audio demo-gry powinien istnieć przed restore").toBeGreaterThan(0);
  expect(before.logos?.length, "plik demo-logo powinien istnieć przed restore").toBeGreaterThan(0);

  // Kliknij "przywróć demo" na stronie konta i potwierdź modal
  await page.goto("https://www.familijna.app/account", { waitUntil: "domcontentloaded" });
  // loadProfile() w account.js dowiązuje listener na #demoRestoreBtn dopiero
  // po serii awaitów (requireAuth, sync języka, sprawdzenie ratingu) — stały
  // sleep bywał za krótki i klik trafiał w jeszcze niepodłączony przycisk.
  // Czekamy aż ruch sieciowy (te wywołania Supabase) faktycznie ucichnie.
  await page.waitForLoadState("networkidle");
  await page.locator("#demoRestoreBtn").click();
  await page.getByRole("button", { name: "Przywróć", exact: true }).click();

  // account.js po sukcesie robi location.href = "./games"
  await page.waitForURL(/games/, { timeout: 20000 });

  // Kluczowa asercja: oba pliki (audio starej demo-gry, obrazek starego
  // demo-logo) mają zniknąć z bucketów.
  // Pliki usuniętych wierszy trafiają do storage_cleanup_queue (313) i znikają
  // przy najbliższym przebiegu storage-cleanup (cron co 10 minut), nie od razu.
  const listFiles = () => page.evaluate(async ({ userId, gameId }) => {
    const sb = window.__sbClient;
    const sounds = await sb.storage.from("user-sounds").list(`${userId}/${gameId}`);
    const logos = await sb.storage.from("user-logos").list(userId, { search: "test-demo-logo" });
    return { sounds: sounds.data?.length ?? 0, demoLogo: (logos.data || []).filter((f) => f.name === "test-demo-logo.png").length };
  }, setup);
  // Sprawdzamy tylko pliki z tego testu: w katalogu konta bywają pliki logo
  // innych testów tego samego konta.
  await expect.poll(listFiles, {
    message: "pliki starej demo-gry i demo-logo powinny zniknąć po restore",
    timeout: 12 * 60_000, intervals: [15_000, 30_000],
  }).toEqual({ sounds: 0, demoLogo: 0 });
});
