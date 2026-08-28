// tests/e2e/cross-resource-locks.spec.js
// Krok 2.5 audytu "wielu miejsc naraz" (docs/plan-testy-i-poprawki.md,
// sekcja "Krzyżowe blokady między zasobami") — generyczny mechanizm
// zamiast N osobnych łatek:
// 1) delete_resource_checked(resource_type, resource_id) — blokuje
//    usunięcie gry/logo, gdy coś żywe (edit_locks / otwarta ankieta)
//    aktualnie z niego korzysta.
// 2) acquire_edit_lock zwraca trzeci stan 'gone' (zasób usunięty gdzie
//    indziej) obok 'ok'/'locked' — guardResourceLock() pokazuje inny
//    overlay i nie odpytuje dalej (nigdy się nie "zwolni").

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

async function waitForLock(page, resourceType, resourceId, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await page.evaluate(async ({ resourceType, resourceId }) => {
      const { data } = await window.__sbClient
        .from("edit_locks")
        .select("resource_type")
        .eq("resource_type", resourceType)
        .eq("resource_id", resourceId)
        .maybeSingle();
      return !!data;
    }, { resourceType, resourceId });
    if (found) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Lock ${resourceType}/${resourceId} nie zostały zajęte w ${timeoutMs}ms`);
}

async function gameExists(page, gameId) {
  return page.evaluate(async (id) => {
    const { data } = await window.__sbClient.from("games").select("id").eq("id", id).maybeSingle();
    return !!data;
  }, gameId);
}

async function logoExists(page, logoId) {
  return page.evaluate(async (id) => {
    const { data } = await window.__sbClient.from("user_logos").select("id").eq("id", id).maybeSingle();
    return !!data;
  }, logoId);
}

/* ================= Usuwanie gry ================= */

test("usuwanie gry: zablokowane, gdy jej ankieta jest otwarta (poll_open)", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameName = `E2E-XLOCK-POLLOPEN-${Date.now()}`;
  const gameId = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name, owner_id: userData.user.id, type: "poll_text", status: "poll_open" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, gameName);

  try {
    await page.goto("https://www.familiada.online/builder", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    // Domyślna aktywna zakładka to "Preparowana" — gra poll_text renderuje
    // się dopiero po przełączeniu na zakładkę Ankieta tekstowa.
    await page.locator("#tabPollText").click();

    const card = page.locator("#grid .card").filter({ hasText: gameName });
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.locator(".x").click({ timeout: 10000 });
    await page.locator(".uni-foot .btn.gold").click({ timeout: 10000 }); // potwierdź "Usuń"

    // builder.html ma własne statyczne modale (eksport do bazy/pliku,
    // zmiana nazwy), każdy z zawsze obecną w DOM klasą .mSub — jak w
    // logo-editorze, goły .mSub jest niejednoznaczny.
    await expect(page.locator(".uni-modal .mSub")).toContainText("otwarta", { timeout: 10000 });
    await page.locator(".uni-modal .uni-foot .btn.gold").click(); // zamknij alert blokady

    expect(await gameExists(page, gameId), "gra z otwartą ankietą nie powinna zostać usunięta").toBe(true);
  } finally {
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

test("usuwanie gry: zablokowane, gdy edytor jest otwarty w innej karcie", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameName = `E2E-XLOCK-LOCKED-${Date.now()}`;
  const gameId = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, gameName);

  const editorPage = await context.newPage();
  try {
    await editorPage.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await editorPage.waitForLoadState("networkidle");
    await waitForLock(editorPage, "game_editor", gameId);

    await page.goto("https://www.familiada.online/builder", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const card = page.locator("#grid .card").filter({ hasText: gameName });
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.locator(".x").click({ timeout: 10000 });
    await page.locator(".uni-foot .btn.gold").click({ timeout: 10000 });

    await expect(page.locator(".uni-modal .mSub")).toContainText("innej karcie", { timeout: 10000 });
    await page.locator(".uni-modal .uni-foot .btn.gold").click();

    expect(await gameExists(page, gameId), "gra otwarta w edytorze w innej karcie nie powinna zostać usunięta").toBe(true);
  } finally {
    await editorPage.close();
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

test("usuwanie gry: działa normalnie, gdy nic jej nie blokuje", async ({ page, context }) => {
  test.setTimeout(40_000);
  await loginAsTestUser(page, context);

  const gameName = `E2E-XLOCK-FREE-${Date.now()}`;
  const gameId = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, gameName);

  let deleted = false;
  try {
    await page.goto("https://www.familiada.online/builder", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const card = page.locator("#grid .card").filter({ hasText: gameName });
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.locator(".x").click({ timeout: 10000 });
    await page.locator(".uni-foot .btn.gold").click({ timeout: 10000 });

    await expect(card).toHaveCount(0, { timeout: 10000 });
    deleted = true;

    expect(await gameExists(page, gameId)).toBe(false);
  } finally {
    if (!deleted) await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

/* ================= Usuwanie logo ================= */

test("usuwanie logo: zablokowane, gdy używająca go gra ma teraz otwarte ustawienia", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const logoName = `E2E-XLOCK-LOGO-${Date.now()}`;
  const { logoId, gameId } = await page.evaluate(async (logoName) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();

    const { data: logo, error: logoErr } = await sb.from("user_logos")
      .insert({ user_id: userData.user.id, name: logoName, type: "PIX_150x70", payload: { source: { mode: "image", imageUrl: "" } } })
      .select("id").single();
    if (logoErr) throw new Error("insert logo failed: " + logoErr.message);

    const { data: game, error: gameErr } = await sb.from("games")
      .insert({
        name: `E2E-XLOCK-LOGOGAME-${Date.now()}`,
        owner_id: userData.user.id,
        type: "prepared",
        settings: { display: { logoId: logo.id } },
      })
      .select("id").single();
    if (gameErr) throw new Error("insert game failed: " + gameErr.message);

    return { logoId: logo.id, gameId: game.id };
  }, logoName);

  const settingsPage = await context.newPage();
  try {
    await settingsPage.goto(`https://www.familiada.online/game-settings?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await settingsPage.waitForLoadState("networkidle");
    await waitForLock(settingsPage, "game_settings", gameId);

    await page.goto("https://www.familiada.online/logo-editor", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const tile = page.locator(`.logoTile[data-key="${logoId}"]`);
    await expect(tile).toBeVisible({ timeout: 10000 });
    await tile.locator(".logoX").click({ timeout: 10000 });
    // .uni-foot .btn.gold potwierdzenia usunięcia (confirmModal) — czekamy
    // aż realnie się pojawi, zanim klikniemy.
    await expect(page.locator(".uni-foot .btn.gold")).toBeVisible({ timeout: 10000 });
    await page.locator(".uni-foot .btn.gold").click({ timeout: 10000 });

    // logo-editor.html ma własne, statyczne modale (create/rename/preview/
    // export) z klasą .mSub zawsze obecną w DOM — goły .mSub jest więc
    // niejednoznaczny. .uni-modal .mSub celuje tylko w dynamiczny modal
    // core/modal.js (confirmModal/alertModal).
    await expect(page.locator(".uni-modal .mSub")).toContainText("używane", { timeout: 10000 });
    await page.locator(".uni-modal .uni-foot .btn.gold").click({ timeout: 10000 }); // zamknij alert blokady

    expect(await logoExists(page, logoId), "logo używane przez grę z otwartymi ustawieniami nie powinno zostać usunięte").toBe(true);
  } finally {
    await settingsPage.close();
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
    await page.evaluate(async (id) => { await window.__sbClient.from("user_logos").delete().eq("id", id); }, logoId);
  }
});

test("usuwanie logo: działa normalnie, gdy nic go nie blokuje", async ({ page, context }) => {
  test.setTimeout(40_000);
  await loginAsTestUser(page, context);

  const logoName = `E2E-XLOCK-LOGOFREE-${Date.now()}`;
  const logoId = await page.evaluate(async (logoName) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("user_logos")
      .insert({ user_id: userData.user.id, name: logoName, type: "PIX_150x70", payload: { source: { mode: "image", imageUrl: "" } } })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, logoName);

  let deleted = false;
  try {
    await page.goto("https://www.familiada.online/logo-editor", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const tile = page.locator(`.logoTile[data-key="${logoId}"]`);
    await expect(tile).toBeVisible({ timeout: 10000 });
    // force: true — siatka logo dorysowuje podglądy canvas asynchronicznie
    // po pierwszym renderze kafelków ("najpierw kafelki, potem canvas" w
    // renderList()), więc inny, stały kafelek potrafi się chwilowo znaleźć
    // "na wierzchu" tej samej pozycji i przechwycić kliknięcie mimo że
    // nasz .logoX (dopasowany po dokładnym data-key) jest widoczny —
    // potwierdzone w CI (run #61): "intercepts pointer events" od
    // zupełnie innego, niezwiązanego z testem logo.
    await tile.locator(".logoX").click({ timeout: 10000, force: true });
    await expect(page.locator(".uni-foot .btn.gold")).toBeVisible({ timeout: 10000 });
    await page.locator(".uni-foot .btn.gold").click({ timeout: 10000 });

    await expect(tile).toHaveCount(0, { timeout: 10000 });
    deleted = true;

    expect(await logoExists(page, logoId)).toBe(false);
  } finally {
    if (!deleted) await page.evaluate(async (id) => { await window.__sbClient.from("user_logos").delete().eq("id", id); }, logoId);
  }
});

/* ================= Stan "gone" (zasób zniknął w trakcie edycji) ================= */

test("edytor: zasób usunięty w trakcie edycji (gdziekolwiek, nie tylko przez delete_resource_checked) pokazuje overlay zamiast ciszy", async ({ page, context }) => {
  test.setTimeout(40_000);
  await loginAsTestUser(page, context);

  const gameName = `E2E-XLOCK-GONE-${Date.now()}`;
  const gameId = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, gameName);

  try {
    await page.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await waitForLock(page, "game_editor", gameId);

    // Usuwamy grę "z zewnątrz" (bezpośredni DELETE, z pominięciem
    // delete_resource_checked) — to trzeci stan 'gone' ma wykrywać:
    // zniknięcie zasobu niezależnie od tego, JAKĄ drogą do niego doszło,
    // nie tylko przez nasze własne, nowe RPC.
    await page.evaluate(async (id) => {
      await window.__sbClient.from("games").delete().eq("id", id);
    }, gameId);

    // Najbliższy heartbeat (co ~8s) wykryje zniknięcie i pokaże overlay
    // z innym komunikatem niż "zajęte przez kogoś".
    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#resourceLockGuardTitle")).toHaveText("Zasób został usunięty");
  } finally {
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});
