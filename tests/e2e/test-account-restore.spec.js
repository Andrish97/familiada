const { test, expect } = require("@playwright/test");
const { restoreTestAccount } = require("./helpers/mailbox");
const { loginAsTestUser } = require("./helpers/login");

test("@mailbox konta11/12/15: odtworzenie i potwierdzone logowanie", async ({ browser }) => {
  test.setTimeout(120000);
  for (const account of ["test11", "test12", "test15"]) {
    const restored = await restoreTestAccount(account);
    expect(restored).toMatchObject({ ok: true, account, email: account + "@familiada.online" });
    if (account === "test15") expect(restored.admin_excluded).toBe(true);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await loginAsTestUser(page, context, { username: restored.email });
      const user = await page.evaluate(async () => {
        const { data, error } = await window.__sbClient.auth.getUser();
        if (error) throw error;
        return { id: data.user.id, email: data.user.email, confirmed: !!data.user.email_confirmed_at };
      });
      expect(user).toMatchObject({ id: restored.user_id, email: restored.email, confirmed: true });
      console.log("[restore-account]", account, restored.created ? "created" : "restored", "login confirmed");
    } finally { await context.close(); }
  }
});
