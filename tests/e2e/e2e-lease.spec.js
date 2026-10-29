// E25: mechanizm wypożyczania kont (familijna-server/docs/konta-testowe-plan.md) na produkcji.
// Wzór dla speców: deklaracja potrzeb w test.use({ needs }), konta z fixture
// `accounts`, logowanie `loginAs`, poczta `mailbox`.
const { test, expect } = require("./helpers/e2e-test");
const client = require("./helpers/e2e-lease-client");

const E2E_ADDRESS = /^e2e\+[a-z]+\d{2}@familijna\.app$/;

// Jedna deklaracja na plik (opcja workera): suma potrzeb wszystkich testów pliku.
test.use({ needs: { standard: 2, noaccount: 1, disposable: 1, dedicated: "e20-gallery", resources: ["mail"] } });

test.describe("lease: standard + noaccount", () => {
  test("komplet rozłącznych tożsamości i logowanie właściciela", async ({ page, context, accounts, loginAs }) => {
    expect(accounts.standard).toHaveLength(2);
    expect(accounts.noaccount).toHaveLength(1);
    const [owner, other] = accounts.standard;
    expect(owner.name).not.toBe(other.name);
    for (const identity of [...accounts.standard, ...accounts.noaccount]) expect(identity.email).toMatch(E2E_ADDRESS);
    expect(owner.user_id).toBeTruthy();
    expect(accounts.noaccount[0].user_id).toBeNull();
    await loginAs(page, context, owner);
    await expect(page).toHaveURL(/\/games/);
  });

  test("skrzynka: własna dostępna, cudza zablokowana", async ({ accounts, mailbox }) => {
    await mailbox.clear(accounts.noaccount[0]);
    const foreign = accounts.noaccount[0].email === "e2e+noaccount10@familijna.app"
      ? "e2e+noaccount09@familijna.app" : "e2e+noaccount10@familijna.app";
    const response = await fetch(`https://www.familijna.app/_e2e_api/emails?recipient=${encodeURIComponent(foreign)}`, {
      method: "DELETE", headers: client.headers(),
    });
    expect(response.status).toBe(403);
  });
});

test.describe("lease: poczta e2e+ (reguła Cloudflare e2e@ + Subaddressing)", () => {
  test("zaproszenie do znajomych dochodzi do skrzynki wypożyczonego odbiorcy", async ({ page, context, accounts, loginAs, mailbox }) => {
    test.setTimeout(240_000);
    const [owner, recipient] = accounts.standard;
    await mailbox.clear(recipient);
    const after = new Date(Date.now() - 2000).toISOString();
    await loginAs(page, context, owner);
    await page.goto("https://www.familijna.app/friends/");
    await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
    await page.locator("#inviteInput").fill(recipient.username);
    await page.locator("#btnInvite").click();
    await expect(page.locator(".rowsSection--outgoing .shareRow")).toHaveCount(1);
    const email = await mailbox.waitFor(recipient, { after, subject: /znajom|friends/i, timeout: 150_000 });
    expect(email.recipient).toBe(recipient.email);
  });
});

test.describe("lease: disposable", () => {
  test("konto odtworzone przy wypożyczeniu i logowanie", async ({ page, context, accounts, loginAs }) => {
    const [account] = accounts.disposable;
    expect(account.name).toMatch(/^e2e\.disposable\d{2}$/);
    await loginAs(page, context, account);
    await expect(page).toHaveURL(/\/games/);
  });
});

test.describe("lease: dedicated", () => {
  test("konto przypisane do czynności", async ({ page, context, accounts, loginAs }) => {
    const [account] = accounts.dedicated;
    expect(account.name).toBe("e2e.dedicated01");
    expect(account.purpose).toBe("e20-gallery");
    await loginAs(page, context, account);
    await expect(page).toHaveURL(/\/games/);
  });
});
