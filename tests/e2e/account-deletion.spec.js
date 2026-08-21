// tests/e2e/account-deletion.spec.js
// Weryfikuje, że usunięcie konta (supabase/functions/delete-account)
// realnie czyści oba buckety — user-sounds i user-logos — nie tylko
// wiersze w DB. Używa świeżego, jednorazowego konta gościa (samo zniknie
// po 5 dniach nawet gdyby test padł przed usunięciem — zero ryzyka dla
// stałych fixture'ów).
//
// Pomija modal potwierdzenia hasłem w UI (goście nie mają hasła) —
// woła sb().functions.invoke("delete-account") wprost, tak samo jak
// robi to account.js po udanej weryfikacji hasła. To nie jest to co
// testujemy; testujemy sprzątanie storage wewnątrz tej edge function.

const { test, expect } = require("@playwright/test");
const { loginAsGuest } = require("./helpers/login");

test("usunięcie konta czyści user-sounds i user-logos dla tego usera", async ({ page, context }) => {
  await loginAsGuest(page, context);

  const setup = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user.id;

    // gra + dźwięk w user-sounds
    const { data: game, error: gameErr } = await sb
      .from("games")
      .insert({ name: `E2E-ACCDEL-${Date.now()}`, owner_id: userId, type: "prepared", status: "draft" })
      .select("id")
      .single();
    if (gameErr) throw new Error("insert games failed: " + gameErr.message);

    const soundBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mpeg" });
    const soundPath = `${userId}/${game.id}/test_key`;
    const { error: soundErr } = await sb.storage.from("user-sounds").upload(soundPath, soundBlob, { upsert: true });
    if (soundErr) throw new Error("upload sound failed: " + soundErr.message);

    // logo obrazkowe w user-logos
    const logoBlob = new Blob([new Uint8Array([5, 6, 7, 8])], { type: "image/png" });
    const logoPath = `${userId}/test-logo.png`;
    const { error: logoErr } = await sb.storage.from("user-logos").upload(logoPath, logoBlob, { upsert: true });
    if (logoErr) throw new Error("upload logo failed: " + logoErr.message);

    return { userId, gameId: game.id };
  });

  // Potwierdź że oba pliki faktycznie istnieją PRZED usunięciem konta
  const before = await page.evaluate(async ({ userId, gameId }) => {
    const sb = window.__sbClient;
    const sounds = await sb.storage.from("user-sounds").list(`${userId}/${gameId}`);
    const logos = await sb.storage.from("user-logos").list(userId);
    return { sounds: sounds.data, logos: logos.data };
  }, setup);
  expect(before.sounds?.length, "plik audio powinien istnieć przed usunięciem konta").toBeGreaterThan(0);
  expect(before.logos?.length, "plik logo powinien istnieć przed usunięciem konta").toBeGreaterThan(0);

  // Usuń konto — dokładnie to co woła account.js po weryfikacji hasła
  const delResult = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data, error } = await sb.functions.invoke("delete-account");
    return { data, error: error?.message || null };
  });
  expect(delResult.error, "wywołanie delete-account nie powinno zwrócić błędu").toBeNull();
  expect(delResult.data?.ok, "delete-account powinno zwrócić ok:true").toBe(true);

  // Ten sam (jeszcze nie wygasły) JWT nadal spełnia RLS storage
  // ((storage.foldername(name))[1] = auth.uid()::text) — auth.uid() czyta
  // się z tokenu, nie z żywego wiersza w auth.users — więc możemy tym
  // samym klientem sprawdzić czy oba buckety faktycznie opustoszały.
  const after = await page.evaluate(async ({ userId, gameId }) => {
    const sb = window.__sbClient;
    const sounds = await sb.storage.from("user-sounds").list(`${userId}/${gameId}`);
    const logos = await sb.storage.from("user-logos").list(userId);
    return { sounds: sounds.data, logos: logos.data };
  }, setup);
  expect(after.sounds?.length ?? 0, "user-sounds powinno być puste po usunięciu konta").toBe(0);
  expect(after.logos?.length ?? 0, "user-logos powinno być puste po usunięciu konta").toBe(0);
});
