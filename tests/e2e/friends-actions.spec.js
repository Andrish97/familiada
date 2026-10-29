// Znajomi (podręcznik 10.2–10.5): błędne i podejrzane działania użytkownika.
// Zaproszenie siebie, nieistniejącej lub niepełnej nazwy, ponowne zaproszenie
// w każdym stanie znajomości, akcje obcej osoby na cudzym zaproszeniu,
// usunięcie znajomego a przyjęte bazy, gość. Strony z kodu brancha, baza
// produkcyjna; maile zaproszeń nie są wysyłane (funkcja send-mail podmieniona
// w przeglądarce -- zaproszenie i jego zasady zapisuje sama baza).
// Lokalnie (scripts/agent-tools/local-e2e): wszystko poza testem gościa.
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsGuest } = require("./helpers/login");
const { acceptBaseShare } = require("./helpers/base-sharing");

test.use({ serviceWorkers: "block", needs: { standard: 3 } });
test.describe.configure({ mode: "serial" });

const ORIGIN = "https://www.familijna.app";
const LOCAL = process.env.E2E_BYPASS_SECRET === "local";

async function stubMail(context) {
  await context.route("**/functions/v1/send-mail", (route) => route.fulfill({
    json: { ok: true, queued: false, results: [{ ok: true, queued: false, skipped: "e2e" }] },
  }));
}
async function user(browser, loginAs, identity) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["friends", "subscribers", "bases"] });
  await stubMail(context);
  const page = await context.newPage();
  await loginAs(page, context, identity);
  const { id, name } = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const id = (await sb.auth.getUser()).data.user.id;
    const { data } = await sb.from("profiles").select("username").eq("id", id).single();
    return { id, name: data?.username };
  });
  // nazwa z profilu (inny spec mógł ją zmienić), adres z wypożyczenia
  return { context, page, id, identity: { ...identity, name: name || identity.name } };
}
async function rpc(page, name, args = {}) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }, { name, args });
}
async function cleanup(a, b) {
  const result = await rpc(a.page, "e2e_friendships_cleanup", { p_other_user_id: b.id });
  expect(result?.ok, JSON.stringify(result)).toBe(true);
}
async function open(page, query = "") {
  await page.goto(`${ORIGIN}/friends/${query}`);
  await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
}
// Zaproszenie z formularza; zwraca odpowiedź friends_invite. Poprzedni dymek
// błędu (zostaje do kliknięcia) jest najpierw zamykany.
async function invite(page, handle) {
  const box = page.locator("#appToast.show");
  if (await box.count()) await box.click();
  await page.locator("#inviteInput").fill(handle);
  const response = page.waitForResponse((r) => r.url().endsWith("/rpc/friends_invite"));
  await page.locator("#btnInvite").click();
  return (await response).json();
}
const toast = (page) => page.locator("#appToast");
const contacts = (page) => rpc(page, "contacts_list", { p_kind: "friends" });
// Wiersz znajomości z drugą osobą (etykieta = nazwa; adres bywa ukryty do przyjęcia).
async function findRow(page, identity) {
  return (await contacts(page)).find((r) => r.label === identity.name || r.email === identity.email);
}

test("znajomi: siebie, nieistniejąca lub niepełna nazwa i puste pole -- komunikat, nic nie powstaje", async ({ browser, accounts, loginAs }) => {
  const owner = await user(browser, loginAs, accounts.standard[0]);
  const other = await user(browser, loginAs, accounts.standard[1]);
  try {
    await cleanup(owner, other);
    await open(owner.page);
    const before = (await contacts(owner.page)).length;
    let invites = 0;
    owner.page.on("request", (r) => { if (r.url().endsWith("/rpc/friends_invite")) invites++; });

    // puste pole: formularz nic nie wysyła
    await owner.page.locator("#inviteInput").fill("   ");
    await owner.page.locator("#btnInvite").click();
    await owner.page.waitForTimeout(500);
    expect(invites).toBe(0);

    for (const handle of [owner.identity.email, owner.identity.name, owner.identity.email.toUpperCase()]) {
      expect(await invite(owner.page, handle), handle).toMatchObject({ ok: false, err: "self" });
      await expect(toast(owner.page)).toContainText("Nie możesz zaprosić samego siebie.");
      await expect(owner.page.locator("#inviteInput")).toHaveValue(handle);
    }
    // serwis nie podpowiada nazw: fragment nazwy innej osoby to „nie ma konta”
    for (const handle of [`e2e.brak-${Date.now()}`, other.identity.name.slice(0, -1), other.identity.name.slice(1)]) {
      expect(await invite(owner.page, handle), handle).toMatchObject({ ok: false, err: "unknown_user", has_email_only: false });
      await expect(toast(owner.page)).toContainText("Nie ma konta o takiej nazwie użytkownika.");
    }
    expect(invites).toBe(6);
    expect((await contacts(owner.page)).length).toBe(before);
    await expect(owner.page.locator(".rowsSection--outgoing .shareRow")).toHaveCount(
      (await contacts(owner.page)).filter((r) => r.direction === "outgoing").length);
  } finally {
    await owner.context.close();
    await other.context.close();
  }
});

test("znajomi: ponowne zaproszenie w każdym stanie -- oczekujące, propozycja od tej osoby, znajomy, odrzucone", async ({ browser, accounts, loginAs }) => {
  test.setTimeout(150_000);
  const owner = await user(browser, loginAs, accounts.standard[0]);
  const recipient = await user(browser, loginAs, accounts.standard[1]);
  try {
    await cleanup(owner, recipient);
    await open(owner.page);
    await invite(owner.page, recipient.identity.email);
    await expect.poll(async () => (await findRow(owner.page, recipient.identity))?.status).toBe("pending");
    const id = (await findRow(owner.page, recipient.identity)).id;
    const outgoing = owner.page.locator(`.rowsSection--outgoing [data-id="${id}"]`);
    await expect(outgoing).toContainText("Oczekuje");

    // drugie zaproszenie tej samej osoby (inną drogą -- nazwą) nie tworzy kopii
    expect(await invite(owner.page, recipient.identity.name)).toMatchObject({ ok: false, err: "already", status: "pending", direction: "outgoing" });
    await expect(toast(owner.page)).toContainText("Zaproszenie do tej osoby już oczekuje na odpowiedź.");
    await expect(owner.page.locator(`[data-id="${id}"]`)).toHaveCount(1);
    expect((await contacts(owner.page)).filter((r) => r.id === id)).toHaveLength(1);

    // zapraszany zaprasza nadawcę: serwis wskazuje istniejącą propozycję
    await open(recipient.page);
    expect(await invite(recipient.page, owner.identity.email)).toMatchObject({ ok: false, err: "already", direction: "incoming" });
    await expect(toast(recipient.page)).toContainText("Masz oczekującą prośbę od tej osoby. Sprawdź Propozycje.");
    const proposal = recipient.page.locator(`.rowsSection--incoming [data-id="${id}"]`);
    await expect(proposal).toHaveClass(/rowsFocus/);
    // nadawca nie przyjmie własnego zaproszenia -- w jego wierszu nie ma ✓
    await expect(outgoing.locator('[data-act="accept"]')).toHaveCount(0);
    expect(await rpc(owner.page, "friends_accept", { p_id: id })).toMatchObject({ ok: false });

    await proposal.locator('[data-act="accept"]').click();
    await expect(recipient.page.locator(`.rowsSection--friend [data-id="${id}"]`)).toBeVisible();
    await open(owner.page);
    expect(await invite(owner.page, recipient.identity.email)).toMatchObject({ ok: false, err: "already", status: "active" });
    await expect(toast(owner.page)).toContainText("Ta osoba jest już Twoim znajomym.");

    // usunięcie ze znajomych = odmowa: nikt nie zaprosi drugiej strony od nowa
    const friend = recipient.page.locator(`.rowsSection--friend [data-id="${id}"]`);
    await friend.locator('[data-act="remove"]').click();
    await recipient.page.locator(".uni-foot .btn.gold").click();
    await expect(friend).toHaveCount(0);
    await open(owner.page);
    await expect(owner.page.locator(`.rowsSection--outgoing [data-id="${id}"]`)).toContainText("Odrzucono");
    expect(await invite(owner.page, recipient.identity.email)).toMatchObject({ ok: false, err: "already", status: "declined", direction: "outgoing" });
    await expect(toast(owner.page)).toContainText("Ta osoba odrzuciła zaproszenie. Nie można teraz wysłać kolejnego.");
    expect((await rpc(owner.page, "friends_resend", { p_id: id })).err).toBe("declined");
    await open(recipient.page);
    expect(await invite(recipient.page, owner.identity.name)).toMatchObject({ ok: false, err: "already", status: "declined", direction: "incoming" });
    await expect(toast(recipient.page)).toContainText("Odrzuciłeś tę prośbę. Możesz cofnąć odmowę w sekcji Odrzucone.");
    const refusal = recipient.page.locator(`.rowsSection--declined [data-id="${id}"]`);
    await expect(refusal).toBeVisible();
    await expect(refusal.locator('[data-act="undo_reject"]')).toBeEnabled();
    // tylko jedna znajomość między tą parą, w obu listach
    expect((await contacts(owner.page)).filter((r) => r.id === id)).toHaveLength(1);
    expect((await contacts(recipient.page)).filter((r) => r.id === id)).toHaveLength(1);
  } finally {
    await cleanup(owner, recipient).catch(() => {});
    await owner.context.close();
    await recipient.context.close();
  }
});

test("znajomi: obca osoba nie przyjmie, nie odrzuci, nie cofnie ani nie usunie cudzej znajomości", async ({ browser, accounts, loginAs }) => {
  const owner = await user(browser, loginAs, accounts.standard[0]);
  const recipient = await user(browser, loginAs, accounts.standard[1]);
  const stranger = await user(browser, loginAs, accounts.standard[2]);
  try {
    await cleanup(owner, recipient);
    const created = await rpc(owner.page, "friends_invite", { p_handle: recipient.identity.email });
    expect(created, JSON.stringify(created)).toMatchObject({ ok: true });
    const id = created.id;
    const tryAll = async (actor, names) => {
      for (const name of names) {
        const result = await rpc(actor.page, name, { p_id: id });
        expect(result?.ok, `${actor.identity.role}: ${name} ${JSON.stringify(result)}`).toBe(false);
      }
    };
    await tryAll(stranger, ["friends_accept", "friends_reject", "friends_cancel", "friends_remove", "friends_undo_reject", "friends_resend"]);
    // nadawca nie decyduje za odbiorcę, odbiorca nie cofa cudzego zaproszenia
    await tryAll(owner, ["friends_accept", "friends_reject", "friends_undo_reject"]);
    await tryAll(recipient, ["friends_cancel", "friends_remove"]);
    expect((await contacts(stranger.page)).filter((r) => r.id === id)).toEqual([]);
    const row = (await contacts(recipient.page)).find((r) => r.id === id);
    expect(row).toMatchObject({ status: "pending", direction: "incoming" });

    // po przyjęciu obca osoba nadal nie usunie znajomości
    expect((await rpc(recipient.page, "friends_accept", { p_id: id })).ok).toBe(true);
    await tryAll(stranger, ["friends_remove", "friends_cancel", "friends_reject"]);
    expect((await contacts(owner.page)).find((r) => r.id === id)).toMatchObject({ status: "active", direction: "friend" });
    // bezpośredni zapis do tabeli z pominięciem RPC też nic nie zmienia
    const direct = await stranger.page.evaluate(async (id) => {
      const sb = window.__sbClient;
      const upd = await sb.from("friendships").update({ status: "declined" }).eq("id", id).select("id");
      const del = await sb.from("friendships").delete().eq("id", id).select("id");
      return { upd: upd.data?.length || 0, del: del.data?.length || 0 };
    }, id);
    expect(direct).toEqual({ upd: 0, del: 0 });
    expect((await contacts(owner.page)).find((r) => r.id === id)).toMatchObject({ status: "active" });
  } finally {
    await cleanup(owner, recipient).catch(() => {});
    await owner.context.close();
    await recipient.context.close();
    await stranger.context.close();
  }
});

test("znajomi: usunięcie znajomego zostawia przyjęte bazy, a wybór z listy znajomych przestaje działać", async ({ browser, accounts, loginAs }) => {
  test.setTimeout(120_000);
  const owner = await user(browser, loginAs, accounts.standard[0]);
  const recipient = await user(browser, loginAs, accounts.standard[1]);
  const bases = [];
  try {
    await cleanup(owner, recipient);
    for (const suffix of ["KEEP", "NEXT"]) {
      bases.push(await owner.page.evaluate(async (name) => {
        const sb = window.__sbClient;
        const { data: u } = await sb.auth.getUser();
        const { data, error } = await sb.from("question_bases").insert({ name, owner_id: u.user.id }).select("id").single();
        if (error) throw new Error(error.message);
        return data.id;
      }, `E2E-FRIEND-BASE-${suffix}-${Date.now()}`));
    }
    const created = await rpc(owner.page, "friends_invite", { p_handle: recipient.identity.name });
    expect((await rpc(recipient.page, "friends_accept", { p_id: created.id })).ok).toBe(true);
    await acceptBaseShare(owner.page, recipient.page, bases[0], recipient.id, "editor");
    const shared = async () => (await rpc(recipient.page, "list_shared_bases_ext")).map((b) => b.id);
    expect(await shared()).toContain(bases[0]);

    // okno udostępniania bazy: znajomy jest na liście do zaznaczenia
    const openShareSend = async (page) => {
      await page.goto(`${ORIGIN}/bases/`);
      await page.locator("#mineGrid .card", { hasText: "E2E-FRIEND-BASE-NEXT" }).click();
      await page.locator("#btnShareSend").click();
      await expect(page.locator("#shareSendOverlay")).toBeVisible();
      await expect(page.locator("#shareEmail")).toBeVisible();
    };
    await openShareSend(owner.page);
    await expect(owner.page.locator(`#baseShareFriends [data-id="${recipient.id}"] input`)).toBeVisible();

    await open(owner.page, "?tab=received");
    const friend = owner.page.locator(`.rowsSection--friend [data-id="${created.id}"]`);
    await friend.locator('[data-act="remove"]').click();
    await expect(owner.page.locator(".uni-modal")).toContainText("Przyjęte bazy i urządzenia zostają");
    await owner.page.locator(".uni-foot .btn.gold").click();
    await expect(friend).toHaveCount(0);

    // przyjęta baza zostaje u byłego znajomego (dostęp cofa się osobno)
    expect(await shared()).toContain(bases[0]);
    // nowe udostępnienie „ze znajomych” jest odrzucone ...
    const viaFriend = await rpc(owner.page, "base_share_to_friend", { p_base_id: bases[1], p_recipient_user_id: recipient.id, p_role: "viewer" });
    expect((Array.isArray(viaFriend) ? viaFriend[0] : viaFriend)).toMatchObject({ ok: false, err: "not_friend" });
    // ... a okno udostępniania nie pokazuje już tej osoby na liście znajomych
    await openShareSend(owner.page);
    await expect(owner.page.locator(`#baseShareFriends [data-id="${recipient.id}"]`)).toHaveCount(0);
  } finally {
    await cleanup(owner, recipient).catch(() => {});
    for (const id of bases) await owner.page.evaluate(async (id) => { await window.__sbClient.from("question_bases").delete().eq("id", id); }, id).catch(() => {});
    await owner.context.close();
    await recipient.context.close();
  }
});

// Tylko CI: lokalna atrapa nie zakłada kont gościa.
test("gość: Znajomi i Subskrybenci zablokowane, zaproszenie z pominięciem strony odrzucone", async ({ page, context, accounts }) => {
  test.skip(LOCAL, "lokalnie nie ma kont gościa (loginAsGuest wymaga Workera)");
  test.setTimeout(120_000);
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["friends", "subscribers", "account"] });
  await stubMail(context);
  await loginAsGuest(page, context);
  try {
    for (const path of ["friends", "subscribers"]) {
      await page.goto(`${ORIGIN}/${path}/`);
      await expect(page.locator('#pageGuard[data-kind="guest"]')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#pageGuard")).toContainText("tylko dla zarejestrowanych użytkowników");
    }
    const attempts = await page.evaluate(async ({ handle, email }) => {
      const sb = window.__sbClient;
      const friend = await sb.rpc("friends_invite", { p_handle: handle });
      const sub = await sb.rpc("subscribers_invite", { p_email: email });
      return { friend: friend.data?.ok === true, sub: sub.data?.ok === true };
    }, { handle: accounts.standard[0].name, email: `e2e-guest-${Date.now()}@example.net` });
    expect(attempts).toEqual({ friend: false, sub: false });
  } finally {
    // obowiązkowe sprzątanie konta gościa (tests/README.md)
    await page.goto(`${ORIGIN}/account/`);
    const guestInfoOk = page.locator(".uni-modal").getByRole("button", { name: "Rozumiem", exact: true });
    await guestInfoOk.click({ timeout: 5_000 }).catch(() => {});
    await page.locator("#deleteAccount").click();
    await page.getByRole("button", { name: "Usuń", exact: true }).click();
    await page.waitForURL(/login/, { timeout: 20_000 });
  }
});
