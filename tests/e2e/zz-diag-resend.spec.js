// Tymczasowa diagnostyka: który adres przyjmuje GoTrue przy resend email_change
// (secure email change wyłączone). Do usunięcia po ustaleniu.
const { test } = require("@playwright/test");
const { clearMailbox, waitForEmail, restoreTestAccount } = require("./helpers/mailbox");
const { loginAsTestUser } = require("./helpers/login");
const OLD = "test12@familiada.online", NEW = "test13@familiada.online";

async function got(recipient, after) {
  try { await waitForEmail({ recipient, after, timeout: 40_000 }); return true; } catch { return false; }
}

test("diag resend email_change", async ({ page, context }) => {
  test.setTimeout(360_000);
  await restoreTestAccount("test12");
  await clearMailbox(OLD); await clearMailbox(NEW);
  await new Promise((r) => setTimeout(r, 65_000));
  try {
    await loginAsTestUser(page, context, { username: OLD });
    let after = new Date(Date.now() - 2000).toISOString();
    const r0 = await page.evaluate(async (n) => {
      const { error } = await window.__sbClient.auth.updateUser({ email: n }); return error?.message || "ok";
    }, NEW);
    console.log("[diag] updateUser:", r0, "new:", await got(NEW, after), "old:", await got(OLD, after));
    for (const target of [NEW, OLD]) {
      await new Promise((r) => setTimeout(r, 65_000));
      after = new Date(Date.now() - 2000).toISOString();
      const r = await page.evaluate(async (e) => {
        const { data, error } = await window.__sbClient.auth.resend({ type: "email_change", email: e });
        return error ? `${error.status} ${error.message}` : "ok " + JSON.stringify(data);
      }, target);
      console.log(`[diag] resend(email=${target === NEW ? "NEW" : "OLD"}):`, r, "new:", await got(NEW, after), "old:", await got(OLD, after));
    }
    await new Promise((r) => setTimeout(r, 65_000));
    after = new Date(Date.now() - 2000).toISOString();
    const r2 = await page.evaluate(async (n) => {
      const { error } = await window.__sbClient.auth.updateUser({ email: n }); return error ? `${error.status} ${error.message}` : "ok";
    }, NEW);
    console.log("[diag] updateUser ponownie (ten sam nowy adres):", r2, "new:", await got(NEW, after), "old:", await got(OLD, after));
  } finally {
    await restoreTestAccount("test12");
    await clearMailbox(OLD); await clearMailbox(NEW);
  }
});
