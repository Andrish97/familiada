// Wysyłanie kopii gier i logo (podręcznik 11): błędne i podejrzane działania.
// Okno „Wyślij znajomym” bez znajomych, gry, których nie da się wysłać
// (otwarta i zamknięta ankieta), komunikat przy odmowie serwera; przez API:
// nie-znajomy, siebie, ponowna wysyłka, odrzucona kopia (30 dni), usunięty
// znajomy, kopia oczekująca tylko do podglądu. Strony z kodu brancha, baza
// i Worker produkcyjne. Maile o kopii wyłączone flagą odbiorcy.
// Lokalnie: dwa pierwsze testy; test z API Workera (/_api/resource-send) tylko CI.
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");
const { seedOpenPoll, importClosedPoll } = require("./helpers/game-seed");

test.use({ serviceWorkers: "block", needs: { standard: 2 } });
test.describe.configure({ mode: "serial", retries: 0 });

const ORIGIN = "https://www.familijna.app";
const LOCAL = process.env.E2E_BYPASS_SECRET === "local";
const PREFIX = "E2E-SENDX-";

async function user(browser, loginAs, identity) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["games", "logos"] });
  await context.route("**/functions/v1/send-mail", (route) => route.fulfill({
    json: { ok: true, queued: false, results: [{ ok: true, queued: false, skipped: "e2e" }] },
  }));
  const page = await context.newPage();
  await loginAs(page, context, identity);
  const id = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
  return { context, page, id, identity };
}
async function rpc(page, name, args = {}) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }, { name, args });
}
async function befriend(a, b) {
  await rpc(a.page, "e2e_friendships_cleanup", { p_other_user_id: b.id });
  const invite = await rpc(a.page, "friends_invite", { p_handle: b.identity.email });
  expect(invite?.ok, JSON.stringify(invite)).toBe(true);
  expect((await rpc(b.page, "friends_accept", { p_id: invite.id })).ok).toBe(true);
  return invite.id;
}
async function createPrepared(page, name) {
  return page.evaluate(async (name) => {
    const db = window.__sbClient;
    const { data: u } = await db.auth.getUser();
    const { data: g, error } = await db.from("games").insert({ owner_id: u.user.id, name, type: "prepared", status: "draft" }).select("id").single();
    if (error) throw new Error(error.message);
    const { error: e } = await db.rpc("game_import_content", { p_game_id: g.id, p_name: name, p_questions: [{ text: "Pytanie?", answers: [{ text: "Rodzina", fixed_points: 20 }] }] });
    if (e) throw new Error(e.message);
    return g.id;
  }, name);
}
async function createDraftPoll(page, name) {
  return page.evaluate(async (name) => {
    const db = window.__sbClient;
    const { data: u } = await db.auth.getUser();
    const { data, error } = await db.from("games").insert({ owner_id: u.user.id, name, type: "poll_text", status: "draft" }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, name);
}
async function removeOwn(page) {
  await page.evaluate(async (prefix) => {
    const db = window.__sbClient;
    for (const kind of ["game", "logo"]) {
      const { data } = await db.rpc("resource_copy_inbox", { p_kind: kind });
      for (const item of data?.items || []) if (String(item.name).startsWith(prefix)) await db.rpc("resource_copy_decide", { p_offer: item.id, p_decision: "decline" });
    }
    await db.from("games").delete().like("name", `${prefix}%`);
  }, PREFIX);
}
async function selectTile(page, tab, name) {
  await page.goto(`${ORIGIN}/games/?tab=${tab}`, { waitUntil: "domcontentloaded" });
  const tile = page.locator("#grid .card", { has: page.locator(".name", { hasText: name }) });
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.locator(".name").click();
  return tile;
}
// Wysyłka przez API Workera z pominięciem okna (jak skrypt użytkownika).
async function apiSend(page, body) {
  return page.evaluate(async (body) => {
    const { data } = await window.__sbClient.auth.getSession();
    const r = await fetch("/_api/resource-send", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: crypto.randomUUID(), language: "pl", ...body }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, body);
}

test("Wyślij: bez znajomych pusty stan; otwartej i zamkniętej ankiety nie da się wysłać, szkicu i gry preparowanej tak", async ({ browser, accounts, loginAs }) => {
  test.setTimeout(150_000);
  const sender = await user(browser, loginAs, accounts.standard[0]);
  const other = await user(browser, loginAs, accounts.standard[1]);
  const stamp = Date.now();
  try {
    await rpc(sender.page, "e2e_friendships_cleanup", { p_other_user_id: other.id });
    const friends = (await rpc(sender.page, "friends_list")).filter((r) => r.direction === "friend" && r.status === "active");
    const prepared = `${PREFIX}PREP-${stamp}`, draft = `${PREFIX}DRAFT-${stamp}`, open = `${PREFIX}OPEN-${stamp}`, closed = `${PREFIX}CLOSED-${stamp}`;
    await createPrepared(sender.page, prepared);
    await createDraftPoll(sender.page, draft);
    await seedOpenPoll(sender.page, { type: "poll_text", name: open });
    await importClosedPoll(sender.page, { type: "poll_points", name: closed });
    for (const [tab, name, can] of [["poll_text", open, false], ["poll_points", closed, false], ["poll_text", draft, true], ["prepared", prepared, true]]) {
      await selectTile(sender.page, tab, name);
      const button = sender.page.locator("#btnSendCopy");
      await expect(button).toBeVisible();
      if (can) await expect(button, name).toBeEnabled({ timeout: 15_000 });
      else { await sender.page.waitForTimeout(1000); await expect(button, name).toBeDisabled(); }
    }
    // okno przy grze preparowanej: bez znajomych pusty stan i nieaktywne [Wyślij]
    if (!friends.length) {
      await sender.page.locator("#btnSendCopy").click();
      const dialog = sender.page.locator("#resourceSendOverlay");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Nie masz jeszcze aktywnych znajomych.");
      await expect(dialog.locator("[data-send]")).toBeDisabled();
    }
  } finally {
    await removeOwn(sender.page).catch(() => {});
    await sender.context.close();
    await other.context.close();
  }
});

test("Wyślij: odmowa serwera pokazuje komunikat w oknie (znany kod -- jego tekst, nieznany -- ogólny)", async ({ browser, accounts, loginAs }) => {
  test.setTimeout(120_000);
  const sender = await user(browser, loginAs, accounts.standard[0]);
  const friend = await user(browser, loginAs, accounts.standard[1]);
  const name = `${PREFIX}ERR-${Date.now()}`;
  try {
    await befriend(sender, friend);
    await createPrepared(sender.page, name);
    let reply = { status: 429, body: { ok: false, error: "declined_cooldown" } };
    await sender.context.route("**/_api/resource-send", (route) => route.fulfill({ status: reply.status, json: reply.body }));
    await selectTile(sender.page, "prepared", name);
    await sender.page.locator("#btnSendCopy").click();
    const dialog = sender.page.locator("#resourceSendOverlay");
    await expect(dialog).toBeVisible();
    // bez zaznaczonego znajomego [Wyślij] nic nie robi
    let calls = 0;
    sender.page.on("request", (r) => { if (r.url().endsWith("/_api/resource-send")) calls++; });
    await dialog.locator("[data-send]").click();
    await sender.page.waitForTimeout(300);
    expect(calls).toBe(0);
    await dialog.locator(`input[value="${friend.id}"]`).check();
    for (const [status, error, text] of [
      [429, "declined_cooldown", "Nie można teraz wysłać nowej kopii tej osobie."],
      [409, "not_friend", "Ta osoba nie jest już znajomym."],
      [409, "already_sent", "Kopia została już wysłana."],
      [503, "copy_failed", "Nie udało się wysłać kopii. Spróbuj ponownie."],
    ]) {
      reply = { status, body: { ok: false, error } };
      await dialog.locator("[data-send]").click();
      await expect(dialog.locator(".resource-send-error"), error).toHaveText(text);
      await expect(dialog).toBeVisible();
    }
  } finally {
    await rpc(sender.page, "e2e_friendships_cleanup", { p_other_user_id: friend.id }).catch(() => {});
    await removeOwn(sender.page).catch(() => {});
    await sender.context.close();
    await friend.context.close();
  }
});

// Tylko CI: lokalnie nie ma Workera (/_api/resource-send).
test("Wyślij przez API: nie-znajomy, siebie, ankieta otwarta, druga wysyłka, odrzucona kopia i usunięty znajomy; oczekująca kopia tylko do podglądu", async ({ browser, accounts, loginAs }) => {
  test.skip(LOCAL, "lokalnie brak Workera (/_api/resource-send)");
  test.setTimeout(240_000);
  const sender = await user(browser, loginAs, accounts.standard[0]);
  const recipient = await user(browser, loginAs, accounts.standard[1]);
  const stamp = Date.now();
  let previousFlag;
  try {
    await removeOwn(recipient.page);
    previousFlag = await recipient.page.evaluate(async (id) => (await window.__sbClient.from("user_flags").select("email_notifications").eq("user_id", id).maybeSingle()).data?.email_notifications ?? true, recipient.id);
    await recipient.page.evaluate(async (id) => { const { error } = await window.__sbClient.from("user_flags").upsert({ user_id: id, email_notifications: false }); if (error) throw error; }, recipient.id);
    await rpc(sender.page, "e2e_friendships_cleanup", { p_other_user_id: recipient.id });
    const game = await createPrepared(sender.page, `${PREFIX}API-${stamp}`);
    const second = await createPrepared(sender.page, `${PREFIX}API2-${stamp}`);
    const open = await seedOpenPoll(sender.page, { type: "poll_text", name: `${PREFIX}APIOPEN-${stamp}` });

    // nie-znajomy i siebie
    let r = await apiSend(sender.page, { kind: "game", source_id: game, recipient_id: recipient.id });
    expect(r, JSON.stringify(r)).toMatchObject({ status: 409, body: { ok: false, error: "not_friend" } });
    r = await apiSend(sender.page, { kind: "game", source_id: game, recipient_id: sender.id });
    expect(r.status, JSON.stringify(r)).toBe(400);
    // cudza gra jako źródło (odbiorca wysyła grę nadawcy)
    const friendship = await befriend(sender, recipient);
    r = await apiSend(recipient.page, { kind: "game", source_id: game, recipient_id: sender.id });
    expect(r.body?.ok, JSON.stringify(r)).toBe(false);
    // otwarta ankieta (przycisk w oknie jest nieaktywny; serwer też odmawia)
    r = await apiSend(sender.page, { kind: "game", source_id: open, recipient_id: recipient.id });
    expect(r.body?.ok, JSON.stringify(r)).toBe(false);

    // pierwsza wysyłka działa, druga tej samej gry -- „już wysłano”
    r = await apiSend(sender.page, { kind: "game", source_id: game, recipient_id: recipient.id });
    expect(r, JSON.stringify(r)).toMatchObject({ status: 200, body: { ok: true } });
    r = await apiSend(sender.page, { kind: "game", source_id: game, recipient_id: recipient.id });
    expect(r, JSON.stringify(r)).toMatchObject({ status: 409, body: { ok: false, error: "already_sent" } });

    // odbiorca: kopia czeka jako propozycja tylko do podglądu
    const tile = await selectTile(recipient.page, "prepared", `${PREFIX}API-${stamp}`);
    await expect(tile).toHaveAttribute("data-proposed", "1");
    await expect(tile.locator("[data-accept]")).toBeVisible();
    await expect(tile.locator(".x")).toHaveCount(0);
    for (const id of ["#btnEdit", "#btnDuplicate", "#btnSendCopy", "#btnChangeType"]) {
      const button = recipient.page.locator(id);
      if (await button.isVisible()) await expect(button, id).toBeDisabled();
    }
    const copyId = await tile.getAttribute("data-game-id");
    const tamper = await recipient.page.evaluate(async (id) => {
      const db = window.__sbClient;
      const upd = await db.from("games").update({ name: "ZMIENIONA" }).eq("id", id).select("id");
      const del = await db.from("games").delete().eq("id", id).select("id");
      return { upd: upd.error ? 0 : upd.data?.length || 0, del: del.error ? 0 : del.data?.length || 0 };
    }, copyId);
    expect(tamper).toEqual({ upd: 0, del: 0 });
    // odrzucenie: ta sama osoba nie wyśle tej kopii ponownie przez 30 dni
    await tile.locator("[data-decline]").click();
    await expect(recipient.page.locator(`#grid .card[data-game-id="${copyId}"]`)).toHaveCount(0, { timeout: 20_000 });
    r = await apiSend(sender.page, { kind: "game", source_id: game, recipient_id: recipient.id });
    expect(r, JSON.stringify(r)).toMatchObject({ status: 429, body: { ok: false, error: "declined_cooldown" } });

    // usunięty znajomy: kolejna wysyłka odrzucona
    expect((await rpc(sender.page, "friends_remove", { p_id: friendship })).ok).toBe(true);
    r = await apiSend(sender.page, { kind: "game", source_id: second, recipient_id: recipient.id });
    expect(r, JSON.stringify(r)).toMatchObject({ status: 409, body: { ok: false, error: "not_friend" } });
  } finally {
    await removeOwn(recipient.page).catch(() => {});
    await removeOwn(sender.page).catch(() => {});
    if (previousFlag !== undefined) await recipient.page.evaluate(async ({ id, value }) => { await window.__sbClient.from("user_flags").upsert({ user_id: id, email_notifications: value }); }, { id: recipient.id, value: previousFlag }).catch(() => {});
    await rpc(sender.page, "e2e_friendships_cleanup", { p_other_user_id: recipient.id }).catch(() => {});
    await sender.context.close();
    await recipient.context.close();
  }
});
