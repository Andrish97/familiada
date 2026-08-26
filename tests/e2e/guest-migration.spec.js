// tests/e2e/guest-migration.spec.js
// Weryfikuje sekcję migracji konta gościa na /account (account.js,
// #migrateSection) — jedyna droga dla gościa, żeby zamienić swoje konto na
// pełne, zanim zniknie po 5 dniach (patrz guest-migrate-reminder.js i
// guest-info-modal.js). Nie da się przejść PEŁNEGO cyklu w e2e (wymaga
// kliknięcia linku z prawdziwej skrzynki), więc test sprawdza to, co
// weryfikowalne przez UI: pojawienie się stanu "pending" po submit,
// egzekwowanie cooldownu na "Wyślij ponownie" (ten sam klucz co login.js —
// patrz komentarz przy GUEST_UPGRADE_ACTION_KEY w account.js), i że
// "Anuluj" realnie czyści stan niezależnie od cooldownu.
//
// Email do migracji celowo na domenie .invalid (RFC 2606 — zarezerwowana,
// nigdy nie rozwiąże się do prawdziwej skrzynki) — testujemy zachowanie UI
// po stronie klienta, nie dostarczalność maila.

const { test, expect } = require("@playwright/test");
const { loginAsGuest } = require("./helpers/login");

const TEST_PASSWORD = "E2eTest123!";

test("migracja konta gościa: stan pending po submit, cooldown na resend, anulowanie czyści stan", async ({ page, context }) => {
  test.setTimeout(60_000);

  await loginAsGuest(page, context);

  try {
    await page.goto("https://www.familiada.online/account", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    // Sekcja migracji jest jedną z dwóch widocznych dla gościa (obok usuwania
    // konta) — reszta (username/email/hasło/oceny/demo) jest schowana przez
    // hideForGuest() w loadProfile().
    await expect(page.locator("#migrateSection")).toBeVisible();
    await expect(page.locator("#usernameSection")).toBeHidden();

    const migrateEmail = `e2e-migrate-${Date.now()}@example.invalid`;

    await page.locator("#migrateEmail").fill(migrateEmail);
    await page.locator("#migratePass1").fill(TEST_PASSWORD);
    await page.locator("#migratePass2").fill(TEST_PASSWORD);
    await page.locator("#btnMigrate").click();

    // Po sukcesie: hint "sprawdź maila" widoczny z adresem, przycisk submit
    // znika na rzecz pary Wyślij ponownie/Anuluj, pola formularza zablokowane.
    await expect(page.locator("#migratePendingHint")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#migratePendingHint")).toContainText(migrateEmail);
    await expect(page.locator("#btnMigrate")).toBeHidden();
    await expect(page.locator("#migratePendingActions")).toBeVisible();
    await expect(page.locator("#migrateEmail")).toBeDisabled();
    await expect(page.locator("#migrateEmail")).toHaveValue(migrateEmail);

    // Cooldown (1h, per e-mail, klucz auth:guest_upgrade_email — ten sam co
    // login.js) był właśnie zarezerwowany przez submit powyżej, więc
    // natychmiastowy klik "Wyślij ponownie" MUSI zostać odrzucony, nie wysłać
    // kolejnego maila. To realna ochrona przed spamem, nie tylko UI-owy detal.
    await page.locator("#migrateResend").click();
    await expect(page.locator("#err")).not.toHaveText("", { timeout: 10000 });

    // Mimo aktywnego cooldownu na resend, "Anuluj" musi zadziałać od razu —
    // to inna operacja (czyści new_email), nie objęta tym limitem.
    await page.locator("#migrateCancel").click();
    await expect(page.locator("#migratePendingHint")).toBeHidden({ timeout: 15000 });
    await expect(page.locator("#btnMigrate")).toBeVisible();
    await expect(page.locator("#migratePendingActions")).toBeHidden();
    await expect(page.locator("#migrateEmail")).toBeEnabled();
  } finally {
    // Obowiązkowe sprzątanie kont gościa w e2e (patrz tests/README.md) —
    // przez prawdziwy UI flow, ta sama sekcja #deleteSection jest widoczna
    // na tej samej stronie /account, więc bez dodatkowej nawigacji.
    await page.locator("#deleteAccount").click();
    await page.getByRole("button", { name: "Usuń", exact: true }).click();
    await page.waitForURL(/login/, { timeout: 20000 });
  }
});
