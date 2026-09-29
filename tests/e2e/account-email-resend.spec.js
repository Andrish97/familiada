// tests/e2e/account-email-resend.spec.js
// Regresja na realny bug znaleziony w audycie login/reset/confirm/account
// (2026-09-29): handleEmailResend() w account.js wołał
// setEmailPendingUi(normalizedMail) — `normalizedMail` to zmienna lokalna
// z ZUPEŁNIE INNEJ funkcji (handleEmailSave), więc w handleEmailResend była
// niezadeklarowana. Efekt na żywo: kliknięcie "Wyślij ponownie" faktycznie
// wysyłało e-mail (sb().auth.resend() kończył się sukcesem), ale zaraz potem
// skrypt wywalał się ReferenceError, catch pokazywał użytkownikowi błąd
// (mimo że mail poszedł), a cooldown "account:email" był bezwarunkowo
// zwalniany w tej samej gałęzi catch — czyli ochrona antyspamowa na ten
// przycisk była całkowicie martwa.
//
// Test korzysta ze wspólnego konta testowego test1@familiada.online — zmiana
// e-maila NIE podmienia realnego loginu tego konta dopóki link nie zostanie
// kliknięty (Supabase "secure email change"), więc jest bezpieczna dla
// innych testów/przebiegów, pod warunkiem że na końcu anulujemy zmianę i
// zwalniamy cooldown (finally, bezwarunkowo).
//
// Cooldown "account:email" zwalniany bezpośrednio przez tę samą RPC
// (cooldown_release), której używa sam account.js przy rollbacku błędu —
// symuluje to "minęła godzina", bez czekania w czasie rzeczywistym.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

const ACCOUNT_URL = "https://www.familiada.online/account";
const CD_EMAIL_KEY = "account:email";

async function releaseEmailCooldown(page) {
  await page.evaluate(async (key) => {
    const sb = window.__sbClient;
    const { error } = await sb.rpc("cooldown_release", { p_action_key: key, p_max_age_seconds: 300 });
    if (error) throw new Error("cooldown_release failed: " + error.message);
  }, CD_EMAIL_KEY);
}

test("konto: 'Wyślij ponownie' na zmianę e-maila kończy się sukcesem, nie ReferenceError", async ({ page, context }) => {
  test.setTimeout(60_000);

  await loginAsTestUser(page, context);

  try {
    await page.goto(ACCOUNT_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const migrateEmail = `e2e-resend-${Date.now()}@example.invalid`;
    await page.fill("#email", migrateEmail);
    await page.locator("#saveEmail").click();

    await expect(page.locator("#emailPendingActions")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#resendEmailChange")).toBeVisible();

    // Symuluj "minęła godzina" zamiast czekać naprawdę — ta sama RPC, którą
    // account.js woła sam przy rollbacku błędu (patrz komentarz na górze).
    await releaseEmailCooldown(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#resendEmailChange")).toBeEnabled({ timeout: 15000 });
    await page.locator("#resendEmailChange").click();

    // Przed poprawką: #err dostawał treść ReferenceError ("normalizedMail is
    // not defined") mimo że resend() realnie się powiódł.
    await expect(page.locator("#status")).toContainText("Wysłano ponownie", { timeout: 15000 });
    await expect(page.locator("#err")).toHaveText("");
  } finally {
    // Przywróć konto testowe do stanu bez oczekującej zmiany e-maila i bez
    // wypalonego cooldownu — dla kolejnych przebiegów e2e na tym samym
    // wspólnym koncie.
    await page.locator("#cancelEmailChange").click().catch(() => {});
    await expect(page.locator("#emailPendingActions")).toBeHidden({ timeout: 15000 }).catch(() => {});
    await releaseEmailCooldown(page).catch(() => {});
  }
});
