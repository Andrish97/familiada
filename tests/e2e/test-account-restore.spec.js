// E25: konto disposable po wypożyczeniu jest w znanym stanie (Worker odtwarza
// je przy każdym lease -- dawny /_e2e_api/accounts/restore już nie istnieje):
// logowanie hasłem testowym, ten sam user_id co z lease, adres tożsamości
// potwierdzony, nazwa = nazwa tożsamości, bez zmiany e-maila w toku.
const { test, expect } = require("./helpers/e2e-test");

test.use({ needs: { disposable: 1 } });

test("konto disposable: odtworzone przy wypożyczeniu i potwierdzone logowanie", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(120000);
  const [account] = accounts.disposable;
  expect(account.user_id).toBeTruthy();
  await loginAs(page, context, account);
  await expect(page).toHaveURL(/\/games/);
  const user = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data, error } = await sb.auth.getUser();
    if (error) throw error;
    const { data: profile, error: profileError } = await sb.from("profiles").select("username").eq("id", data.user.id).single();
    if (profileError) throw profileError;
    const meta = data.user.user_metadata || {};
    return {
      id: data.user.id,
      email: data.user.email,
      confirmed: !!data.user.email_confirmed_at,
      newEmail: data.user.new_email || "",
      pending: meta.familiada_email_change_pending || "",
      username: profile.username,
    };
  });
  expect(user).toMatchObject({
    id: account.user_id, email: account.email, confirmed: true, newEmail: "", pending: "", username: account.name,
  });
  console.log("[restore-account] disposable: login confirmed");
});
