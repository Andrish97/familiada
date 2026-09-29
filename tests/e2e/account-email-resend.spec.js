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
//
// /account i cały front-end (js/, css/, translation/) serwowane z plików
// TEGO repo (helpers/branch-code.js), backend prawdziwy -- workflow odpalony
// na branchu testuje poprawkę przed wdrożeniem.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const ACCOUNT_URL = "https://www.familiada.online/account";
const CD_EMAIL_KEY = "account:email";

// service worker obsłużyłby żądania z własnego cache z pominięciem page.route
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["account"] });
});

async function releaseEmailCooldown(page) {
  await page.evaluate(async (key) => {
    const sb = window.__sbClient;
    // cooldown_release ma własną osłonę: zwalnia tylko, jeśli rezerwacja
    // była odświeżana w ciągu p_max_age_seconds -- rezerwacja z
    // przerwanego wcześniejszego przebiegu (test.setTimeout ubija test
    // zanim jego finally zdąży zwolnić) może być stara jak cały 1h
    // cooldown, więc dajemy tu margines dłuższy niż jego pełny czas
    // (RESET_COOLDOWN/GUEST_UPGRADE/account:email -- wszystkie to 1h),
    // żeby release faktycznie coś zmieniał, a nie cicho no-opował.
    const { error } = await sb.rpc("cooldown_release", { p_action_key: key, p_max_age_seconds: 7200 });
    if (error) throw new Error("cooldown_release failed: " + error.message);
  }, CD_EMAIL_KEY);
}

test("konto: 'Wyślij ponownie' na zmianę e-maila kończy się sukcesem, nie ReferenceError", async ({ page, context }) => {
  test.setTimeout(60_000);

  await loginAsTestUser(page, context);

  try {
    await page.goto(ACCOUNT_URL, { waitUntil: "domcontentloaded" });
    // account.js przypina listenery (#saveEmail itd.) dopiero PO całym
    // async łańcuchu loadProfile() -- "networkidle" potrafi wybrzmieć w
    // przerwie MIĘDZY kolejnymi await-owanymi requestami tego łańcucha,
    // więc klik może wylądować zanim listener w ogóle istnieje (ten sam
    // wzorzec race co #btnGuest/#btnPrimary w helpers/login.js). Ten sam,
    // już sprawdzony sygnał końca ładowania co w subscriptions.spec.js.
    await page.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 15000 });

    // Samoleczenie: gdyby poprzedni przebieg na tym wspólnym koncie nie
    // posprzątał po sobie (np. własny test.setTimeout ubił test w trakcie,
    // zanim finally zdążyło dokończyć swoje await-y), zacznij od czystego
    // stanu. Dwa NIEZALEŻNE gubione stany: pending e-mail (lockEl) ORAZ
    // sam cooldown "account:email" -- ten drugi też blokuje #email przez
    // tickCooldowns()/bindCooldown(), niezależnie od tego, czy pending
    // e-mail w ogóle istnieje, więc zwalniamy go zawsze, nie tylko przy
    // wykrytym pending.
    if (await page.locator("#emailPendingActions").isVisible()) {
      await page.locator("#cancelEmailChange").click();
      await expect(page.locator("#emailPendingActions")).toBeHidden({ timeout: 15000 });
    }
    await releaseEmailCooldown(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 15000 });
    await expect(page.locator("#email")).toBeEnabled({ timeout: 15000 });

    const migrateEmail = `e2e-resend-${Date.now()}@example.invalid`;
    await page.fill("#email", migrateEmail);
    await page.locator("#saveEmail").click();

    await expect(page.locator("#emailPendingActions")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#resendEmailChange")).toBeVisible();

    // Symuluj "minęła godzina" zamiast czekać naprawdę — ta sama RPC, którą
    // account.js woła sam przy rollbacku błędu (patrz komentarz na górze).
    await releaseEmailCooldown(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-skel-step].skel-step-ready', { timeout: 15000 });

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
