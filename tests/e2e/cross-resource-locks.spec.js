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
    await waitForLock(editorPage, "game", gameId);

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
    await waitForLock(settingsPage, "game", gameId);

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
    // core/modal.js (confirmModal/alertModal). Komunikat od kroku 4 dotyczy
    // już całej puli logo ("ustawienia rozgrywki"), nie tylko referencji.
    await expect(page.locator(".uni-modal .mSub")).toContainText("ustawienia rozgrywki", { timeout: 10000 });
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
    // Siatka logo dorysowuje podglądy canvas asynchronicznie po pierwszym
    // renderze kafelków ("najpierw kafelki, potem canvas" w renderList()),
    // a hover/ruch myszy po zatłoczonej siatce potrafi chwilowo podnieść
    // z-index innego, niezwiązanego kafelka nad nasz — potwierdzone w CI
    // (run #61: "intercepts pointer events"; run #62: {force:true} samo
    // kliknięcie "przeszło", ale modal nigdy się nie pojawił, bo trafiło
    // w faktycznie zasłaniający element, nie w nasz .logoX). Wywołanie
    // .click() bezpośrednio przez DOM omija symulację myszy w ogóle —
    // gwarantowanie odpala handler na dokładnie tym elemencie.
    await tile.locator(".logoX").evaluate((el) => el.click());
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
    await waitForLock(page, "game", gameId);

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

/* ================= Edytor ↔ ustawienia — wzajemne wykluczanie tej samej gry ================= */
// Poprawka wcześniejszego założenia (Warstwa 1, "mapa zasobów"): edytor
// i ustawienia NIE są niezależnymi zasobami dla tej samej gry — operują
// na tych samych, powiązanych danych (pytania ↔ wybór finału/rund do
// nich), więc dzielą teraz jeden wspólny klucz blokady ("game") zamiast
// dwóch osobnych ("game_editor"/"game_settings"). Kto pierwszy otworzy
// dowolną z tych stron, ten trzyma blokadę — druga dostaje overlay,
// niezależnie od tego, która to konkretnie strona.

test("edytor blokuje ustawienia tej samej gry", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name: `E2E-XLOCK-CROSSPAGE-${Date.now()}`, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  });

  const editorPage = await context.newPage();
  try {
    await editorPage.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await editorPage.waitForLoadState("networkidle");
    await waitForLock(editorPage, "game", gameId);

    await page.goto(`https://www.familiada.online/game-settings?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#gsTeamA")).toHaveCount(0);

    await editorPage.close();

    // Po zwolnieniu blokady przez edytor — ustawienia realnie wchodzą.
    await expect(page.locator("#resourceLockGuard")).toBeHidden({ timeout: 40000 });
    await expect(page.locator("#gsTeamA")).toHaveCount(1, { timeout: 10000 });
  } finally {
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

test("ustawienia blokują edytor tej samej gry", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name: `E2E-XLOCK-CROSSPAGE2-${Date.now()}`, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  });

  const settingsPage = await context.newPage();
  try {
    await settingsPage.goto(`https://www.familiada.online/game-settings?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await settingsPage.waitForLoadState("networkidle");
    await waitForLock(settingsPage, "game", gameId);

    await page.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 10000 });

    await settingsPage.close();

    // Po zwolnieniu blokady przez ustawienia — edytor realnie wchodzi
    // (nie tylko chowa overlay w trakcie reloadu, zanim __sbClient wróci).
    await expect(page.locator("#resourceLockGuard")).toBeHidden({ timeout: 40000 });
    await expect(page.locator("#qList")).not.toBeEmpty({ timeout: 10000 });
  } finally {
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

/* ================= Ankieta ↔ edytor — dołączenie do tego samego wspólnego klucza ================= */
// polls.js dołączył do wspólnego klucza 'game' (krok 3 audytu, plan-testy-
// i-poprawki.md): zamykanie ankiety zapisuje znormalizowane punkty do
// answers.fixed_points, tych samych danych co edytor/ustawienia — więc
// otwarcie ankiety wyklucza edytor tej samej gry i odwrotnie.

test("ankieta blokuje edytor tej samej gry", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name: `E2E-XLOCK-POLLS-${Date.now()}`, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  });

  const pollsPage = await context.newPage();
  try {
    await pollsPage.goto(`https://www.familiada.online/polls?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await pollsPage.waitForLoadState("networkidle");
    await waitForLock(pollsPage, "game", gameId);

    await page.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 10000 });

    await pollsPage.close();

    await expect(page.locator("#resourceLockGuard")).toBeHidden({ timeout: 40000 });
    await expect(page.locator("#qList")).not.toBeEmpty({ timeout: 10000 });
  } finally {
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

test("edytor blokuje ankietę tej samej gry", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameId = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name: `E2E-XLOCK-POLLS2-${Date.now()}`, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  });

  const editorPage = await context.newPage();
  try {
    await editorPage.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await editorPage.waitForLoadState("networkidle");
    await waitForLock(editorPage, "game", gameId);

    await page.goto(`https://www.familiada.online/polls?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 10000 });

    await editorPage.close();

    await expect(page.locator("#resourceLockGuard")).toBeHidden({ timeout: 40000 });
    await expect(page.locator("#gName")).not.toBeEmpty({ timeout: 10000 });
  } finally {
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

/* ================= builder.js — jednorazowe akcje sprawdzają busy zamiast overlayu ================= */
// Model "busy/free" (plan-testy-i-poprawki.md): rename i reset-do-draftu w
// builder.js nie otwierają własnej sesji, ale piszą do tych samych danych
// co editor.js/game-settings.js -- muszą sprawdzić aktywny lock 'game' i
// pokazać alert modal zamiast zapisywać w ciemno.

test("builder.js: zmiana nazwy gry zablokowana alert-modalem, gdy gra jest edytowana gdzie indziej", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const originalName = `E2E-XLOCK-RENAME-${Date.now()}`;
  const gameId = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, originalName);

  const editorPage = await context.newPage();
  try {
    await editorPage.goto(`https://www.familiada.online/editor?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await editorPage.waitForLoadState("networkidle");
    await waitForLock(editorPage, "game", gameId);

    await page.goto("https://www.familiada.online/builder", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const card = page.locator("#grid .card").filter({ hasText: originalName });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.dblclick();

    await expect(page.locator("#nameOverlay")).toBeVisible({ timeout: 5000 });
    await page.locator("#nameInp").fill(`${originalName}-RENAMED`);
    await page.locator("#btnNameOk").click();

    await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".uni-modal .mSub")).toContainText("używana", { timeout: 5000 });
    await page.locator(".uni-foot .btn.gold").click();

    const nameAfter = await page.evaluate(async (id) => {
      const { data } = await window.__sbClient.from("games").select("name").eq("id", id).single();
      return data?.name;
    }, gameId);
    expect(nameAfter, "nazwa nie powinna się zmienić, skoro rename zostało zablokowane").toBe(originalName);
  } finally {
    await editorPage.close();
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

test("builder.js: reset gry do draftu po ankiecie zablokowany alert-modalem, gdy gra jest edytowana gdzie indziej", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const gameName = `E2E-XLOCK-RESET-${Date.now()}`;
  const { gameId, questionId } = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: game, error: gErr } = await sb.from("games")
      .insert({ name, owner_id: userData.user.id, type: "poll_text", status: "ready" })
      .select("id").single();
    if (gErr) throw new Error(gErr.message);
    const { data: q, error: qErr } = await sb.from("questions")
      .insert({ game_id: game.id, ord: 1, text: "Pytanie 1" })
      .select("id").single();
    if (qErr) throw new Error(qErr.message);
    const { error: aErr } = await sb.from("answers")
      .insert({ question_id: q.id, ord: 1, text: "Odp 1", fixed_points: 42 });
    if (aErr) throw new Error(aErr.message);
    return { gameId: game.id, questionId: q.id };
  }, gameName);

  const settingsPage = await context.newPage();
  try {
    await settingsPage.goto(`https://www.familiada.online/game-settings?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await settingsPage.waitForLoadState("networkidle");
    await waitForLock(settingsPage, "game", gameId);

    await page.goto("https://www.familiada.online/builder", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    // Domyślna aktywna zakładka to "Preparowana" -- gra poll_text renderuje
    // się dopiero po przejściu na jej własną zakładkę.
    await page.locator("#tabPollText").click();

    const card = page.locator("#grid .card").filter({ hasText: gameName });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page.locator("#btnEdit")).toBeEnabled({ timeout: 10000 });
    await page.locator("#btnEdit").click();

    // canEnterEdit() zwraca needsResetWarning dla poll_text/ready -- najpierw
    // confirmModal "na pewno zresetować", dopiero potem (po OK) trafiamy w
    // sprawdzenie busy wewnątrz resetPollForEditing().
    await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 10000 });
    await page.locator(".uni-foot .btn.gold").click();

    await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".uni-modal .mSub")).toContainText("używana", { timeout: 5000 });
    await page.locator(".uni-foot .btn.gold").click();

    await expect(page).toHaveURL(/\/builder/, { timeout: 5000 });

    const after = await page.evaluate(async ({ gameId, questionId }) => {
      const sb = window.__sbClient;
      const { data: g } = await sb.from("games").select("status").eq("id", gameId).single();
      const { data: answers } = await sb.from("answers").select("fixed_points").eq("question_id", questionId);
      return { status: g?.status, points: answers?.[0]?.fixed_points };
    }, { gameId, questionId });
    expect(after.status, "status nie powinien wrócić do draft, skoro reset został zablokowany").toBe("ready");
    expect(after.points, "punkty nie powinny zostać wyzerowane, skoro reset został zablokowany").toBe(42);
  } finally {
    await settingsPage.close();
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
  }
});

/* ================= Krok 4: logo-editor.js — Warstwa A (per logo) i Warstwa B (cała pula) ================= */
// Warstwa A: dwie karty nie mogą edytować TEGO SAMEGO logo naraz (ten sam
// wzorzec co editor.js/game-settings.js dla gry, ale w obrębie jednej
// strony -- lock trzymany od kliknięcia "Edytuj" do zamknięcia edytora).
// Warstwa B: Control/game-settings.js blokują edycję/zmianę nazwy/usunięcie
// WSZYSTKICH logo użytkownika, nawet gdy dany logo nie jest w ogóle
// referencowany przez żadną grę -- patrz docs/plan-testy-i-poprawki.md,
// "Model: zasób ma stan busy/free".

function blankGlyphPayload() {
  return {
    layers: [{ color: "main", rows: Array.from({ length: 10 }, () => " ".repeat(30)) }],
    source: { mode: "TEXT" },
  };
}

test("logo-editor.js: druga karta nie może edytować tego samego logo", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const logoName = `E2E-XLOCK-LOGOEDIT-${Date.now()}`;
  const logoId = await page.evaluate(async ({ name, payload }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("user_logos")
      .insert({ user_id: userData.user.id, name, type: "GLYPH_30x10", payload })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, { name: logoName, payload: blankGlyphPayload() });

  const tabA = await context.newPage();
  try {
    await tabA.goto("https://www.familiada.online/logo-editor", { waitUntil: "domcontentloaded" });
    await tabA.waitForLoadState("networkidle");
    const tileA = tabA.locator(`.logoTile[data-key="${logoId}"]`);
    await expect(tileA).toBeVisible({ timeout: 10000 });
    await tileA.evaluate((el) => el.click());
    await expect(tabA.locator("#btnEdit")).toBeEnabled({ timeout: 10000 });
    await tabA.locator("#btnEdit").click();
    await waitForLock(tabA, "logo", logoId);

    await page.goto("https://www.familiada.online/logo-editor", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    const tileB = page.locator(`.logoTile[data-key="${logoId}"]`);
    await expect(tileB).toBeVisible({ timeout: 10000 });
    await tileB.evaluate((el) => el.click());
    await expect(page.locator("#btnEdit")).toBeEnabled({ timeout: 10000 });
    await page.locator("#btnEdit").click();

    await expect(page.locator("#resourceLockGuard")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#editorShell")).toBeHidden({ timeout: 5000 });
  } finally {
    await tabA.close();
    await page.evaluate(async (id) => { await window.__sbClient.from("user_logos").delete().eq("id", id); }, logoId);
  }
});

test("logo-editor.js: edycja i zmiana nazwy DOWOLNEGO logo zablokowane, gdy game-settings.js ma otwartą inną grę użytkownika", async ({ page, context }) => {
  test.setTimeout(60_000);
  await loginAsTestUser(page, context);

  const logoName = `E2E-XLOCK-LOGOPOOL-${Date.now()}`;
  const { logoId, gameId } = await page.evaluate(async ({ name, payload }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    // Logo celowo NIE referencowany przez tę grę -- dowód, że blokada
    // dotyczy całej puli, nie tylko logo wskazanego w danej grze.
    const { data: logo, error: logoErr } = await sb.from("user_logos")
      .insert({ user_id: userData.user.id, name, type: "GLYPH_30x10", payload })
      .select("id").single();
    if (logoErr) throw new Error(logoErr.message);
    const { data: game, error: gameErr } = await sb.from("games")
      .insert({ name: `E2E-XLOCK-LOGOPOOLGAME-${Date.now()}`, owner_id: userData.user.id, type: "prepared" })
      .select("id").single();
    if (gameErr) throw new Error(gameErr.message);
    return { logoId: logo.id, gameId: game.id };
  }, { name: logoName, payload: blankGlyphPayload() });

  const settingsPage = await context.newPage();
  try {
    await settingsPage.goto(`https://www.familiada.online/game-settings?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await settingsPage.waitForLoadState("networkidle");
    await waitForLock(settingsPage, "game", gameId);

    await page.goto("https://www.familiada.online/logo-editor", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const tile = page.locator(`.logoTile[data-key="${logoId}"]`);
    await expect(tile).toBeVisible({ timeout: 10000 });
    await tile.evaluate((el) => el.click());
    await expect(page.locator("#btnEdit")).toBeEnabled({ timeout: 10000 });
    await page.locator("#btnEdit").click();

    await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".uni-modal .mSub")).toContainText("ustawienia rozgrywki", { timeout: 5000 });
    await page.locator(".uni-modal .uni-foot .btn.gold").click({ timeout: 10000 });
    await expect(page.locator("#editorShell")).toBeHidden({ timeout: 5000 });

    await tile.dblclick();
    await expect(page.locator("#renameOverlay")).toBeVisible({ timeout: 5000 });
    await page.locator("#renameInput").fill(`${logoName}-RENAMED`);
    await page.locator("#btnRenameOk").click();
    await expect(page.locator("#renameMsg")).toContainText("ustawienia rozgrywki", { timeout: 5000 });

    const nameAfter = await page.evaluate(async (id) => {
      const { data } = await window.__sbClient.from("user_logos").select("name").eq("id", id).single();
      return data?.name;
    }, logoId);
    expect(nameAfter, "nazwa nie powinna się zmienić, skoro rename zostało zablokowane").toBe(logoName);
  } finally {
    await settingsPage.close();
    await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
    await page.evaluate(async (id) => { await window.__sbClient.from("user_logos").delete().eq("id", id); }, logoId);
  }
});
