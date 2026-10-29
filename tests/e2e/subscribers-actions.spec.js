// Subskrybenci (podręcznik 14.2–14.3): błędne i podejrzane działania.
// Zły adres, adres konta (także własny), puste pole, ten sam adres drugi raz,
// adres wypisany ze wszystkich wiadomości, cudzy subskrybent. Strony z kodu
// brancha, baza produkcyjna; maile nie są wysyłane (send-mail podmieniony
// w przeglądarce). Działa także lokalnie (scripts/agent-tools/local-e2e).
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", needs: { standard: 2, noaccount: 1 } });
test.describe.configure({ mode: "serial" });

const ORIGIN = "https://www.familijna.app";

async function user(browser, loginAs, identity) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["subscribers", "friends"] });
  await context.route("**/functions/v1/send-mail", (route) => route.fulfill({
    json: { ok: true, queued: false, results: [{ ok: true, queued: false, skipped: "e2e" }] },
  }));
  const page = await context.newPage();
  await loginAs(page, context, identity);
  return { context, page, identity };
}
async function rpc(page, name, args = {}) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }, { name, args });
}
async function open(page) {
  await page.goto(`${ORIGIN}/subscribers/`);
  await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
}
// Zaproszenie z formularza; zwraca odpowiedź subscribers_invite (null, gdy
// przeglądarka nie wysłała formularza). Dymek błędu zostaje do kliknięcia.
async function invite(page, email) {
  const box = page.locator("#appToast.show");
  if (await box.count()) await box.click();
  await page.locator("#inviteInput").fill(email);
  const response = page.waitForResponse((r) => r.url().endsWith("/rpc/subscribers_invite"), { timeout: 3000 }).catch(() => null);
  await page.locator("#btnInvite").click();
  const r = await response;
  return r ? r.json() : null;
}
const subscribers = (page) => rpc(page, "contacts_list", { p_kind: "subscribers" });
const toast = (page) => page.locator("#appToast");

test("subskrybenci: zły adres, adres konta (też własny) i puste pole -- komunikat, nic nie powstaje", async ({ browser, accounts, loginAs }) => {
  const owner = await user(browser, loginAs, accounts.standard[0]);
  try {
    await open(owner.page);
    const before = (await subscribers(owner.page)).length;
    // pole e-mail: puste i bez „@” zatrzymuje już przeglądarka
    for (const value of ["", "   ", "bez-malpy"]) expect(await invite(owner.page, value), value).toBeNull();
    // adres bez domeny najwyższego poziomu odrzuca serwer
    expect(await invite(owner.page, "ktos@localhost")).toMatchObject({ ok: false, err: "invalid_email" });
    await expect(toast(owner.page)).toContainText("Wpisz poprawny adres e-mail.");
    // adres konta -- także własny, inną wielkością liter -- prowadzi do Znajomych
    for (const email of [accounts.standard[1].email.toUpperCase(), owner.identity.email]) {
      expect(await invite(owner.page, email), email).toMatchObject({ ok: false, err: "has_account" });
      await expect(owner.page.locator(".uni-modal")).toContainText("możesz zaprosić tę osobę do znajomych");
      await expect(owner.page.getByRole("link", { name: "Przejdź", exact: true })).toHaveAttribute("href", /\/friends\//);
      await owner.page.keyboard.press("Escape");
      await expect(owner.page.locator(".uni-modal")).toHaveCount(0);
    }
    expect((await subscribers(owner.page)).length).toBe(before);
  } finally { await owner.context.close(); }
});

test("subskrybenci: ten sam adres drugi raz bez kopii; obca osoba nie usunie ani nie ponowi; usunięcie z potwierdzeniem", async ({ browser, accounts, loginAs }) => {
  const owner = await user(browser, loginAs, accounts.standard[0]);
  const stranger = await user(browser, loginAs, accounts.standard[1]);
  const email = accounts.noaccount[0].email;
  const cleanup = () => rpc(owner.page, "e2e_subscriber_email_cleanup", { p_email: email });
  try {
    expect((await cleanup())?.ok).toBe(true);
    await open(owner.page);
    const first = await invite(owner.page, email);
    expect(first, JSON.stringify(first)).toMatchObject({ ok: true, already: false });
    const row = owner.page.locator(`.rowsSection--pending [data-id="${first.id}"]`);
    await expect(row).toContainText("Oczekuje");
    // ten sam adres z wielkimi literami i spacjami: ten sam wpis
    expect(await invite(owner.page, `  ${email.toUpperCase()}  `)).toMatchObject({ ok: true, already: true, id: first.id });
    await expect(toast(owner.page)).toContainText("Ta osoba jest już na liście");
    expect((await subscribers(owner.page)).filter((r) => r.email === email)).toHaveLength(1);

    // obca osoba nie widzi, nie usuwa, nie ponawia i nie zmienia wpisu
    expect((await subscribers(stranger.page)).filter((r) => r.id === first.id)).toEqual([]);
    for (const name of ["polls_hub_subscriber_remove", "polls_hub_subscriber_resend"]) {
      const result = await rpc(stranger.page, name, { p_id: first.id });
      expect(result?.ok, `${name}: ${JSON.stringify(result)}`).toBe(false);
    }
    const direct = await stranger.page.evaluate(async (id) => {
      const sb = window.__sbClient;
      const upd = await sb.from("poll_subscriptions").update({ status: "active" }).eq("id", id).select("id");
      const del = await sb.from("poll_subscriptions").delete().eq("id", id).select("id");
      return { upd: upd.data?.length || 0, del: del.data?.length || 0 };
    }, first.id);
    expect(direct).toEqual({ upd: 0, del: 0 });
    expect((await subscribers(owner.page)).find((r) => r.id === first.id)).toMatchObject({ status: "pending" });

    // właściciel: kosz pyta o potwierdzenie; „Anuluj” zostawia wpis
    await row.locator('[data-act="remove"]').click();
    await expect(owner.page.locator(".uni-modal")).toContainText("Usunąć tego subskrybenta?");
    await owner.page.keyboard.press("Escape");
    await expect(row).toBeVisible();
    await row.locator('[data-act="remove"]').click();
    await owner.page.locator(".uni-foot .btn.gold").click();
    await expect(row).toHaveCount(0);
    expect((await subscribers(owner.page)).filter((r) => r.id === first.id)).toEqual([]);
  } finally {
    await cleanup().catch(() => {});
    await owner.context.close();
    await stranger.context.close();
  }
});

// Komunikat dla adresu, którego właściciel zrezygnował ze wszystkich wiadomości.
// Sam stan bazy (globalne wypisanie) sprawdza subscribers.spec.js na poczcie;
// tu tylko odpowiedź serwera podstawiona w przeglądarce.
test("subskrybenci: adres wypisany ze wszystkich wiadomości -- jasny komunikat, bez wpisu", async ({ browser, accounts, loginAs }) => {
  const owner = await user(browser, loginAs, accounts.standard[0]);
  try {
    await owner.context.route("**/rest/v1/rpc/subscribers_invite", (route) => route.fulfill({
      json: { ok: false, err: "notifications_disabled", mail_allowed: false },
    }));
    await open(owner.page);
    const before = (await subscribers(owner.page)).length;
    expect(await invite(owner.page, "wypisany@example.net")).toMatchObject({ err: "notifications_disabled" });
    await expect(toast(owner.page)).toContainText("zrezygnowała ze wszystkich wiadomości");
    await expect(owner.page.locator("#inviteInput")).toHaveValue("wypisany@example.net");
    expect((await subscribers(owner.page)).length).toBe(before);
  } finally { await owner.context.close(); }
});
