const { expectMailDocument } = require("./helpers/mail-document");
const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail, extractHttpLinks } = require("./helpers/mailbox");
test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });
async function user(browser, number) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["friends", "subscribers", "go", "games"] });
  const page = await context.newPage();
  await loginAsTestUser(page, context, { username: testAccountUsername(number) });
  const id = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
  return { context, page, id };
}
async function cleanup(page, id) {
  await page.evaluate(async id => {
    const { data, error } = await window.__sbClient.rpc("e2e_friendships_cleanup", { p_other_user_id: id });
    if (error || !data?.ok) throw error || new Error(JSON.stringify(data));
  }, id);
}
async function open(page) {
  await page.goto("https://www.familiada.online/friends/");
  await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
}
async function invite(page, handle) {
  await page.locator("#inviteInput").fill(handle);
  await page.locator("#btnInvite").click();
}
test("@mailbox znajomi: zaproszenie z UI, mail, go, przyjęcie i usunięcie", async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const owner = await user(browser, 7);
  const recipient = await user(browser, 8);
  try {
    await cleanup(owner.page, recipient.id);
    await clearMailbox(testAccountUsername(8));
    await resetMailProviderLimits(owner.page);
    const after = new Date(Date.now() - 2000).toISOString();
    await open(owner.page);
    await expect(owner.page.locator("#inviteForm")).toBeVisible();
    await expect(owner.page.locator(".games-bottom")).toHaveCount(0);
    await invite(owner.page, testAccountUsername(8));
    const outgoing = owner.page.locator('.rowsSection--outgoing .shareRow').filter({ hasText: /test8/i });
    await expect(outgoing).toHaveCount(1);
    await expect(outgoing.locator("[data-act=resend]")).toHaveAttribute("aria-label", "Wyślij ponownie");
    await expect(outgoing.locator("[data-act=resend]")).toBeDisabled();
    await expect(outgoing.locator("[data-act=resend] .shareCountdown")).toBeVisible();
    await expect(outgoing).toHaveClass(/blocked/);
    await expect(outgoing.locator("[data-act=cancel]")).toBeEnabled();
    const blocked = await owner.page.evaluate(async id => (await window.__sbClient.rpc("friends_resend", { p_id: id })).data, await outgoing.getAttribute("data-id"));
    expect(blocked.err).toBe("cooldown");
    await owner.page.screenshot({ path: testInfo.outputPath("shot-friends-layout.png"), fullPage: true });
    const email = await waitForEmail({ recipient: testAccountUsername(8), after, subject: /znajom|friends/i, timeout: 150000 });
    expectMailDocument(email, { accountFooter: true });
    const link = extractHttpLinks(email).find(url => new URL(url).searchParams.has("f"));
    expect(link).toBeTruthy();
    await recipient.page.goto(link);
    await recipient.page.getByRole("button", { name: "Otwórz Znajomych" }).click();
    const incoming = recipient.page.locator('.rowsSection--incoming .shareRow').filter({ hasText: /test7/i });
    await expect(incoming).toHaveCount(1);
    await incoming.locator('[data-act="accept"]').click();
    const active = recipient.page.locator('.rowsSection--friend .shareRow').filter({ hasText: /test7/i });
    await expect(active).toHaveCount(1);
    await owner.page.reload();
    await expect(owner.page.locator('.rowsSection--friend .shareRow').filter({ hasText: /test8/i })).toHaveCount(1);
    await active.locator('[data-act="remove"]').click();
    await expect(recipient.page.locator(".uni-modal")).toContainText("Przyjęte bazy i urządzenia zostają");
    await recipient.page.locator(".uni-foot .btn.gold").click();
    await expect(active).toHaveCount(0);
  } finally {
    await cleanup(owner.page, recipient.id).catch(() => {});
    await owner.context.close();
    await recipient.context.close();
  }
});
test("znajomi: e-mail bez konta pokazuje przejście do Subskrybentów", async ({ browser }) => {
  const owner = await user(browser, 7);
  try {
    await open(owner.page);
    await invite(owner.page, "test14@familiada.online");
    await expect(owner.page.locator(".uni-modal")).toContainText("możesz dodać tę osobę jako subskrybenta");
    const link = owner.page.getByRole("link", { name: "Przejdź →" });
    await expect(link).toHaveAttribute("href", /\/subscribers\//);
    await link.click();
    await expect(owner.page).toHaveURL(/\/subscribers\//);
    const response = await owner.page.request.get("https://www.familiada.online/subscriptions/");
    expect(response.status()).toBe(404);
  } finally { await owner.context.close(); }
});

test("kontakty: wspólny licznik wygasa na żywo, flaga mailowa ukrywa ponowienie", async ({ browser }, testInfo) => {
  const owner = await user(browser, 7);
  try {
    await owner.context.route('**/rest/v1/rpc/contacts_list', async route => {
      const kind = route.request().postDataJSON().p_kind;
      const base = kind === "friends" ? { direction: "outgoing", label: "Odbiorca" } : {};
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([
        { ...base, id: "fixture-timer", email: "timer@example.net", status: "pending", email_enabled: true, resend_available_at: new Date(Date.now()+8000).toISOString() },
        { ...base, id: "fixture-off", email: "off@example.net", status: "pending", email_enabled: false, resend_available_at: null },
        { ...base, id: "fixture-ready", email: "ready@example.net", status: "pending", email_enabled: true, resend_available_at: null }
      ]) });
    });
    for (const kind of ["friends", "subscribers"]) {
      await owner.page.goto(`https://www.familiada.online/${kind}/`);
      const timed = owner.page.locator('[data-id="fixture-timer"]');
      const off = owner.page.locator('[data-id="fixture-off"]');
      const ready = owner.page.locator('[data-id="fixture-ready"]');
      await expect(timed.locator('[data-act="resend"]')).toBeDisabled();
      await expect(timed.locator('.shareCountdown')).toBeVisible();
      await expect(timed).toHaveClass(/blocked/);
      await expect(timed.locator(`[data-act="${kind === "friends" ? "cancel" : "remove"}"]`)).toBeEnabled();
      await expect(off.locator('[data-act="resend"]')).toHaveCount(0);
      await expect(ready.locator('[data-act="resend"]')).toBeEnabled();
      await expect(ready.locator('.shareCountdown')).toBeHidden();
      const sizes = await timed.locator('.shareRowActions .btn').evaluateAll(buttons => buttons.map(button => {
        const r = button.getBoundingClientRect(); return [r.width,r.height];
      }));
      expect(sizes).toHaveLength(2);
      expect(sizes[0]).toEqual(sizes[1]);
      await owner.page.screenshot({path:testInfo.outputPath(`shot-${kind}-countdown.png`),fullPage:true});
      await expect(timed.locator('[data-act="resend"]')).toBeEnabled({timeout:12000});
      await expect(timed.locator('.shareCountdown')).toBeHidden();
      await expect(timed).not.toHaveClass(/blocked/);
    }
  } finally { await owner.context.close(); }
});

// Aktywna lista określa stan; nie powtarzamy etykiety zaakceptowania.
test("kontakty: aktywni bez zbędnego statusu desktop/mobile", async ({ browser }) => {
  const owner = await user(browser, 7);
  try {
    await owner.context.route("**/rest/v1/rpc/contacts_list", route => {
      const kind = route.request().postDataJSON().p_kind;
      return route.fulfill({ json: [
        { id: "active-preview", label: "Maja", email: "maja@example.net", status: "active", direction: kind === "friends" ? "friend" : undefined },
        { id: "pending-preview", label: "Alicja", email: "alicja@example.net", status: "pending", direction: "outgoing", email_enabled: false },
        { id: "declined-preview", label: "Piotr", email: "piotr@example.net", status: "declined", direction: "outgoing", email_enabled: false },
      ] });
    });
    for (const width of [1400, 390]) for (const kind of ["friends", "subscribers"]) {
      await owner.page.setViewportSize({ width, height: 900 });
      await owner.page.goto(`https://www.familiada.online/${kind}/`);
      await expect(owner.page.locator('[data-id="pending-preview"]')).toContainText("Oczekuje");
      if (kind === "friends") await expect(owner.page.locator('[data-id="declined-preview"]')).toContainText("Odrzucono");
      if (width === 390) await owner.page.locator('[data-contact-tab="received"]').click();
      const row = owner.page.locator('[data-id="active-preview"]');
      await expect(row).toBeVisible();
      await expect(row.locator(".shareTags")).toHaveCount(0);
      await expect(row.locator('[data-act="remove"]')).toBeEnabled();
      await expect(owner.page.locator('[data-id="pending-preview"]')).toContainText("Oczekuje");
      if (kind === "friends") await expect(owner.page.locator('[data-id="declined-preview"]')).toContainText("Odrzucono");
      await owner.page.screenshot({ path: test.info().outputPath(`shot-${kind}-active-${width}.png`), fullPage: true });
    }
  } finally { await owner.context.close(); }
});

// Widok decyzji i dostępność akcji: kontrolowane dane, bez tworzenia maili.
test("kontakty: odmowa znajomości zachowuje stan i właściwe akcje", async ({ browser }, testInfo) => {
  const owner = await user(browser, 7);
  try {
    let incomingStatus = "declined";
    await owner.context.route("**/rest/v1/rpc/friends_undo_reject", route => { incomingStatus = "pending"; return route.fulfill({ json: { ok: true } }); });
    await owner.context.route("**/rest/v1/rpc/contacts_list", route => route.fulfill({ json: [
      { id: "declined-out", label: "Alicja", email: "alicja@example.net", status: "declined", direction: "outgoing", email_enabled: true, resend_available_at: new Date(Date.now()+86400000).toISOString() },
      { id: "declined-off", label: "Piotr", email: "piotr@example.net", status: "declined", direction: "outgoing", email_enabled: false },
      { id: "declined-in", label: "Maja", email: "maja@example.net", status: incomingStatus, direction: "incoming", email_enabled: true },
    ] }));
    for (const width of [1400, 390]) {
      await owner.page.setViewportSize({ width, height: 900 });
      incomingStatus = "declined";
      await open(owner.page);
      const outgoing = owner.page.locator('[data-id="declined-out"]');
      await expect(outgoing).toContainText("Odrzucono");
      await expect(outgoing.locator('[data-act="resend"]')).toHaveCount(0);
      await expect(outgoing.locator(".shareCountdown")).toHaveCount(0);
      await expect(outgoing.locator('[data-act="cancel"]')).toBeEnabled();
      await expect(outgoing.locator('[data-act="remove"]')).toHaveCount(0);
      await expect(owner.page.locator('[data-id="declined-off"] [data-act="resend"]')).toHaveCount(0);
      if (width === 390) await owner.page.locator('[data-contact-tab="received"]').click();
      const incoming = owner.page.locator('[data-id="declined-in"]');
      const toggle = owner.page.locator('.rowsSection--declined button.rowsSectionHead');
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(incoming).toBeHidden();
      await owner.page.screenshot({ path: testInfo.outputPath(`shot-friends-declined-collapsed-${width}.png`), fullPage: true });
      await toggle.click();
      await expect(incoming).toContainText("Odrzucono");
      await expect(incoming.locator('[data-act="accept"]')).toHaveCount(0);
      await expect(incoming.locator('[data-act="undo_reject"]')).toBeEnabled();
      await expect(incoming.locator('[data-act="reject"]')).toHaveCount(0);
      await owner.page.screenshot({ path: testInfo.outputPath(`shot-friends-declined-expanded-${width}.png`), fullPage: true });
      await incoming.locator('[data-act="undo_reject"]').click();
      await expect(owner.page.locator('.rowsSection--incoming [data-id="declined-in"] [data-act="accept"]')).toBeEnabled();
      await expect(owner.page.locator('.rowsSection--declined')).toBeHidden();
    }
  } finally { await owner.context.close(); }
});

test("@mailbox znajomi: odmowa zachowuje link, świadoma akceptacja i cofnięcie", async ({ browser }) => {
  test.setTimeout(240000);
  const owner = await user(browser, 7);
  const recipient = await user(browser, 8);
  try {
    await cleanup(owner.page, recipient.id);
    await clearMailbox(testAccountUsername(8));
    await resetMailProviderLimits(owner.page);
    const after = new Date(Date.now()-2000).toISOString();
    await open(owner.page);
    await invite(owner.page, testAccountUsername(8));
    const email = await waitForEmail({ recipient: testAccountUsername(8), after, subject: /znajom|friends/i, timeout: 150000 });
    expectMailDocument(email, { accountFooter: true });
    const link = extractHttpLinks(email).find(url => new URL(url).searchParams.has("f"));
    expect(link).toBeTruthy();
    const token = new URL(link).searchParams.get("f");
    await recipient.page.goto(link);
    await recipient.page.getByRole("button", { name: "Otwórz Znajomych" }).click();
    const incoming = recipient.page.locator('.rowsSection--incoming .shareRow').filter({ hasText: /test7/i });
    const id = await incoming.getAttribute("data-id");
    await incoming.locator('[data-act="reject"]').click();
    await recipient.page.locator(".uni-foot .btn.gold").click();
    await expect(incoming).toHaveCount(0);
    await recipient.page.locator('.rowsSection--declined button.rowsSectionHead').click();
    const refusal = recipient.page.locator(`.rowsSection--declined [data-id="${id}"]`);
    await expect(refusal).toContainText("Odrzucono");
    await expect(refusal.locator('[data-act="undo_reject"]')).toBeEnabled();
    await owner.page.reload();
    const outgoing = owner.page.locator(`[data-id="${id}"]`);
    await expect(outgoing).toContainText("Odrzucono");
    await expect(outgoing.locator('[data-act="resend"]')).toHaveCount(0);
    const blocked = await owner.page.evaluate(async id => (await window.__sbClient.rpc("friends_resend", { p_id: id })).data, id);
    expect(blocked.err).toBe("declined");
    const info = await owner.page.evaluate(async token => (await window.__sbClient.rpc("friends_token_info", { p_token: token })).data, token);
    expect(info.status).toBe("declined");
    await recipient.page.goto(link);
    await expect(recipient.page.locator("#title")).toHaveText("Odrzucono");
    await recipient.page.getByRole("button", { name: "Otwórz Znajomych" }).click();
    await refusal.locator('[data-act="undo_reject"]').click();
    await expect(incoming.locator('[data-act="accept"]')).toBeEnabled();
    await incoming.locator('[data-act="accept"]').click();
    await expect(recipient.page.locator(`.rowsSection--friend [data-id="${id}"]`)).toBeVisible();
    await recipient.page.goto(link);
    await expect(recipient.page.locator("#title")).toHaveText("Zaakceptowano");
    // Drugi przypadek bez wysyłki: fixture RPC dla sprawdzenia cofania odmowy.
    await cleanup(owner.page, recipient.id);
    const next = await owner.page.evaluate(async handle => (await window.__sbClient.rpc("friends_invite", { p_handle: handle })).data, testAccountUsername(8));
    expect(next.ok).toBe(true);
    await recipient.page.evaluate(async id => {
      const { data, error } = await window.__sbClient.rpc("friends_reject", { p_id: id });
      if (error || !data?.ok) throw error || new Error(JSON.stringify(data));
    }, next.id);
    await open(owner.page);
    const cancelled = owner.page.locator(`[data-id="${next.id}"]`);
    await cancelled.locator('[data-act="cancel"]').click();
    await owner.page.locator(".uni-foot .btn.gold").click();
    await expect(cancelled).toHaveCount(0);
    const revoked = await owner.page.evaluate(async token => (await window.__sbClient.rpc("friends_token_info", { p_token: token })).data, next.token);
    expect(revoked.err).toBe("not_found");
  } finally {
    await cleanup(owner.page, recipient.id).catch(() => {});
    await owner.context.close(); await recipient.context.close();
  }
});

test("@mailbox znajomi346: wypisanie obu stron, własna odmowa, undo i unieważnienie", async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const owner = await user(browser, 7);
  const recipient = await user(browser, 8);
  const rpc = async (page, name, args) => page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw error;
    return data;
  }, { name, args });
  try {
    await cleanup(owner.page, recipient.id);
    const initialBadges = new Map([
      [owner.id, (await rpc(owner.page, "badges_get", {})).friends_pending],
      [recipient.id, (await rpc(recipient.page, "badges_get", {})).friends_pending],
    ]);
    await clearMailbox(testAccountUsername(8));
    await resetMailProviderLimits(owner.page);
    const after = new Date(Date.now() - 2000).toISOString();
    await open(owner.page);
    await invite(owner.page, testAccountUsername(8));
    const email = await waitForEmail({ recipient: testAccountUsername(8), after, subject: /znajom|friends/i, timeout: 150000 });
    expectMailDocument(email, { accountFooter: true });
    const link = extractHttpLinks(email).find(url => new URL(url).searchParams.has("f"));
    expect(link).toBeTruthy();
    const token = new URL(link).searchParams.get("f");
    await recipient.page.goto(link);
    await recipient.page.getByRole("button", { name: "Otwórz Znajomych" }).click();
    const proposal = recipient.page.locator('.rowsSection--incoming .shareRow').filter({ hasText: /test7/i });
    const id = await proposal.getAttribute("data-id");
    await proposal.locator('[data-act="accept"]').click();
    for (const [actor, peer, number] of [[owner, recipient, 7], [recipient, owner, 8]]) {
      await actor.page.goto("https://www.familiada.online/friends/?tab=received");
      const active = actor.page.locator(`.rowsSection--friend [data-id="${id}"]`);
      await expect(active).toBeVisible();
      await active.locator('[data-act="remove"]').click();
      await actor.page.locator(".uni-foot .btn.gold").click();
      await expect(active).toHaveCount(0);
      const section = actor.page.locator('.rowsSection--declined');
      const toggle = section.locator('button.rowsSectionHead');
      const ownRefusal = section.locator(`[data-id="${id}"]`);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      for (const width of [390, 1400]) {
        await actor.page.setViewportSize({ width, height: 900 });
        await actor.page.screenshot({ path: testInfo.outputPath(`shot-friend346-actor${number}-collapsed-${width}.png`), fullPage: true });
        await toggle.click();
        await expect(ownRefusal).toBeVisible();
        await expect(ownRefusal.locator('[data-act="undo_reject"]')).toBeEnabled();
        await expect(ownRefusal.locator('[data-act="resend"]')).toHaveCount(0);
        await actor.page.screenshot({ path: testInfo.outputPath(`shot-friend346-actor${number}-expanded-${width}.png`), fullPage: true });
        await toggle.click();
      }
      const ownInfo = await rpc(actor.page, "friends_token_info", { p_token: token });
      expect(ownInfo).toMatchObject({ ok: true, status: "declined", addressee_matches_me: true });
      const peerInfo = await rpc(peer.page, "friends_token_info", { p_token: token });
      expect(peerInfo.addressee_matches_me).toBe(false);
      expect(await rpc(actor.page, "poll_go_resolve", { p_token: token })).toMatchObject({ ok: true, recipient_matches_me: true });
      expect((await rpc(peer.page, "friends_undo_reject", { p_id: id })).ok).toBe(false);
      expect((await rpc(peer.page, "friends_resend", { p_id: id })).err).toBe("declined");
      await peer.page.reload();
      await expect(peer.page.locator(`.rowsSection--outgoing [data-id="${id}"]`)).toContainText("Odrzucono");
      await toggle.click();
      await ownRefusal.locator('[data-act="undo_reject"]').click();
      await expect(section).toBeHidden();
      const restored = actor.page.locator(`.rowsSection--incoming [data-id="${id}"]`);
      await expect(restored).toBeVisible();
      expect((await rpc(actor.page, "badges_get", {})).friends_pending).toBe(initialBadges.get(actor.id) + 1);
      expect((await rpc(peer.page, "friends_resend", { p_id: id })).err).toBe("cooldown");
      await restored.locator('[data-act="accept"]').click();
      await expect(active).toBeVisible();
    }
    expect((await rpc(recipient.page, "friends_remove", { p_id: id })).ok).toBe(true);
    expect((await rpc(owner.page, "friends_cancel", { p_id: id })).ok).toBe(true);
    expect((await rpc(recipient.page, "friends_undo_reject", { p_id: id })).ok).toBe(false);
    expect((await rpc(owner.page, "friends_token_info", { p_token: token })).ok).toBe(false);
    for (const [actor, handle] of [[owner, testAccountUsername(8)], [recipient, testAccountUsername(7)]]) {
      expect(await rpc(actor.page, "friends_invite", { p_handle: handle })).toMatchObject({ ok: false, reason: "after_reject" });
    }
  } finally {
    await cleanup(owner.page, recipient.id).catch(() => {});
    await owner.context.close();
    await recipient.context.close();
  }
});

test("kontakty: wypustki mobilne, liczniki i stan zakładek", async ({ browser }) => {
  const owner = await user(browser, 7);
  try {
    let empty = false;
    await owner.context.route("**/rest/v1/rpc/contacts_list", route => route.fulfill({ json: empty ? [] : [
      { id: "incoming", label: "Maja", email: "maja@example.net", status: "pending", direction: "incoming", email_enabled: false },
      { id: "outgoing", label: "Ola", email: "ola@example.net", status: "pending", direction: "outgoing", email_enabled: false },
      { id: "active", label: "Piotr", email: "piotr@example.net", status: "active", direction: "friend" },
      { id: "refusal", label: "Ala", email: "ala@example.net", status: "declined", direction: "incoming" },
    ] }));
    for (const kind of ["friends", "subscribers"]) {
      await owner.page.setViewportSize({ width: 390, height: 844 });
      await owner.page.goto(`https://www.familiada.online/${kind}/`);
      const invite = owner.page.locator('[data-contact-tab="invite"]');
      const received = owner.page.locator('[data-contact-tab="received"]');
      await expect(invite).toHaveAttribute("aria-selected", "true");
      expect((await invite.boundingBox()).height).toBe(36);
      await expect(owner.page.locator("#contactsInvite")).toBeVisible();
      await expect(owner.page.locator("#contactsReceived")).toBeHidden();
      await expect(received.locator(".badge")).toHaveText("1");
      await expect(invite.locator(".badge")).toHaveText(kind === "friends" ? "1" : "2");
      await owner.page.locator("#inviteInput").fill("saved@example.net");
      await received.click();
      await expect(owner.page).toHaveURL(/tab=received/);
      await expect(owner.page.locator("#contactsInvite")).toBeHidden();
      await expect(owner.page.locator("#contactsReceived")).toBeVisible();
      await owner.page.reload();
      await expect(received).toHaveAttribute("aria-selected", "true");
      await owner.page.setViewportSize({ width: 1400, height: 900 });
      await expect(owner.page.locator("#contactsTabs")).toBeHidden();
      await expect(owner.page.locator("#contactsInvite")).toBeVisible();
      await expect(owner.page.locator("#contactsReceived")).toBeVisible();
      const scrolling = await owner.page.evaluate(() => {
        const cards = [...document.querySelectorAll(".contacts-card")].map(el => el.getBoundingClientRect());
        const lists = [...document.querySelectorAll(".shareList")].filter(el => !el.hidden && el.querySelector(".shareRow"));
        for (const list of lists) {
          const row = list.querySelector(".shareRow");
          for (let i=0;i<30;i++) list.append(row.cloneNode(true));
        }
        lists[0].scrollTop=70; lists[1].scrollTop=120;
        return { independent: lists[0].scrollTop===70 && lists[1].scrollTop===120,
          equal: Math.abs(cards[0].height-cards[1].height)<1,
          full: cards.every(card => Math.abs(card.bottom-document.querySelector(".contacts-layout").getBoundingClientRect().bottom)<1),
          pageOverflow: document.documentElement.scrollHeight>innerHeight };
      });
      expect(scrolling).toEqual({ independent:true, equal:true, full:true, pageOverflow:false });
      await owner.page.reload();
      await expect(received).toHaveAttribute("aria-selected", "true");
      await owner.page.setViewportSize({ width: 390, height: 844 });
      await received.focus(); await received.press("ArrowLeft");
      await expect(invite).toHaveAttribute("aria-selected", "true");
      expect(new URL(owner.page.url()).searchParams.has("tab")).toBe(false);
      await owner.page.locator("#inviteInput").fill("saved@example.net");
      await received.click(); await invite.click();
      await expect(owner.page.locator("#inviteInput")).toHaveValue("saved@example.net");
      empty = true; await owner.page.reload();
      await expect(received.locator(".badge")).toBeHidden();
      await expect(invite.locator(".badge")).toBeHidden();
      await expect(owner.page.locator(".shareEmpty").first()).toBeVisible();
      empty = false;
    }
    await owner.context.route("**/rest/v1/rpc/poll_go_resolve", route => route.fulfill({ json: {ok:true,id:"incoming",kind:"friend"} }));
    await owner.page.goto("https://www.familiada.online/friends/?f=preview");
    await expect(owner.page.locator('[data-contact-tab="received"]')).toHaveAttribute("aria-selected", "true");
    await expect(owner.page.locator('[data-id="incoming"]')).toHaveClass(/rowsFocus/);
  } finally { await owner.context.close(); }
});
