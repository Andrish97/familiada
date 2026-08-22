// tests/e2e/account-deletion.spec.js
// Weryfikuje, że usunięcie konta (supabase/functions/delete-account)
// realnie czyści oba buckety — user-sounds i user-logos — nie tylko
// wiersze w DB. Używa świeżego, jednorazowego konta gościa (samo zniknie
// po 5 dniach nawet gdyby test padł przed usunięciem — zero ryzyka dla
// stałych fixture'ów).
//
// Idzie przez prawdziwe UI (/account → "Usuń konto i dane" → potwierdzenie
// modalem) — gość ma dostęp do tej jednej sekcji na /account (patrz
// account.js loadProfile()/handleDeleteAccount(), gałąź isGuestUser),
// z pominięciem weryfikacji hasłem (gość go nie ma).
//
// account.js po sukcesie realnie woła signOut() i przekierowuje na
// /login, więc window.__sbClient po tym momencie nie ma już sesji —
// stąd token wyciągnięty PRZED usunięciem i bezpośrednie zapytania do
// Storage REST API przez `request` (niezależne od nawigacji strony),
// zamiast dotychczasowego page.evaluate(window.__sbClient...).

const { test, expect } = require("@playwright/test");
const { loginAsGuest } = require("./helpers/login");

async function listStorage(request, { supabaseUrl, anonKey, accessToken }, bucket, prefix) {
  const res = await request.post(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    data: { prefix, limit: 100 },
  });
  if (!res.ok()) return null;
  return await res.json();
}

test("usunięcie konta czyści user-sounds i user-logos dla tego usera", async ({ page, context, request }) => {
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

  // Token gościa wyciągnięty PRZED usunięciem — to on posłuży do sprawdzenia
  // storage po fakcie, bo prawdziwy signOut() w UI wyczyści lokalną sesję
  // window.__sbClient. Sam JWT (bezstanowy) zostaje ważny do swojego exp
  // niezależnie od signOut() — Storage API po stronie Supabase nie sprawdza
  // listy odwołań, tylko podpis/ważność tokenu.
  const authInfo = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data } = await sb.auth.getSession();
    return {
      supabaseUrl: sb.supabaseUrl,
      anonKey: sb.supabaseKey,
      accessToken: data.session?.access_token,
    };
  });
  expect(authInfo.accessToken, "brak access_token gościa przed usunięciem").toBeTruthy();

  // Usuń konto przez prawdziwe UI — /account, sekcja "Usuń konto"
  // (jedyna dostępna dla gościa, patrz account.js loadProfile()).
  await page.goto("https://www.familiada.online/account", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator("#deleteAccount").click();
  await page.getByRole("button", { name: "Usuń", exact: true }).click();

  // account.js po sukcesie: signOut() + redirect na /login
  await page.waitForURL(/login/, { timeout: 20000 });

  const afterSounds = await listStorage(request, authInfo, "user-sounds", `${setup.userId}/${setup.gameId}`);
  const afterLogos = await listStorage(request, authInfo, "user-logos", setup.userId);
  expect(afterSounds?.length ?? 0, "user-sounds powinno być puste po usunięciu konta").toBe(0);
  expect(afterLogos?.length ?? 0, "user-logos powinno być puste po usunięciu konta").toBe(0);
});
