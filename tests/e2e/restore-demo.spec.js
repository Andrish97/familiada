// tests/e2e/restore-demo.spec.js
// Weryfikuje punkt 4 Planu 2: "przywróć demo" (restore_my_demo) kasuje
// wiersze is_demo=true w user_logos/games, ale to czysty SQL bez dostępu
// do storage — więc account.js robi "zdjęcie przed/po" wokół RPC i sam
// czyści osierocone pliki. Test symuluje dokładnie ten przypadek: demo
// zostało wcześniej "wyedytowane" (dostało realny plik), a flaga
// is_demo=true została (edycja jej nie kasuje — patrz logo-editor/js/main.js
// updateLogo(), które nie dotyka is_demo).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

// /account jest celowo zablokowane dla gości (guest-mode.js showGuestBlockedOverlay,
// account.js:453) — restore demo można przetestować tylko na koncie testowym.
test("restore_my_demo czyści osierocone pliki po edytowanym demo (logo i gra)", async ({ page, context }) => {
  await loginAsTestUser(page, context);

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
  await page.goto("https://www.familiada.online/account", { waitUntil: "domcontentloaded" });
  // loadProfile() w account.js dowiązuje listener na #demoRestoreBtn dopiero
  // po serii awaitów (requireAuth, sync języka, sprawdzenie ratingu) — stały
  // sleep bywał za krótki i klik trafiał w jeszcze niepodłączony przycisk.
  // Czekamy aż ruch sieciowy (te wywołania Supabase) faktycznie ucichnie.
  await page.waitForLoadState("networkidle");
  await page.locator("#demoRestoreBtn").click();
  await page.getByRole("button", { name: "Przywróć", exact: true }).click();

  // account.js po sukcesie robi location.href = "./builder"
  await page.waitForURL(/builder/, { timeout: 20000 });

  // Kluczowa asercja: oba pliki (audio starej demo-gry, obrazek starego
  // demo-logo) mają zniknąć z bucketów, mimo że restore_my_demo sam w
  // sobie ich nie kasuje (to czysty SQL) — musi to zrobić diff w account.js
  const after = await page.evaluate(async ({ userId, gameId }) => {
    const sb = window.__sbClient;
    const sounds = await sb.storage.from("user-sounds").list(`${userId}/${gameId}`);
    const logos = await sb.storage.from("user-logos").list(userId);
    return { sounds: sounds.data, logos: logos.data };
  }, setup);
  expect(after.sounds?.length ?? 0, "plik audio starej demo-gry powinien zniknąć po restore").toBe(0);
  // Świeżo dosiane demo (seed_demo_for_user) nigdy nie ma plików w buckecie
  // (payload trzymany inline w DB) — więc po restore user-logos ma być puste.
  expect(after.logos?.length ?? 0, "user-logos powinno być puste po restore (stary plik skasowany, nowe demo nic nie wgrywa)").toBe(0);
});
