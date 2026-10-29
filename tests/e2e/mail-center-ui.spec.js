// Centrum maili (/mails/, podręcznik 14.5 i 5.8): zachowanie strony przy
// odpowiedziach Workera, także błędnych i podejrzanych — zły adres, odliczanie
// ponownej wysyłki, awaria, okna potwierdzenia z [Anuluj], link spoza serwisu.
// Prawdziwy HTML i moduły strony z brancha; odpowiedzi /_api/mail/* podstawione
// (prawdziwą pocztę i Workera sprawdza mail-center.spec.js).
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block" });

const URL_MAILS = "https://www.familijna.app/mails/";

// Atrapa Workera centrum maili: handlers[path] -> odpowiedź (obiekt albo funkcja).
async function mockMailApi(page, handlers) {
  const calls = [];
  await page.route("**/_api/mail/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/_api/mail/", "");
    const body = route.request().postData() ? JSON.parse(route.request().postData()) : null;
    calls.push({ path, body });
    const h = handlers[path];
    const out = typeof h === "function" ? h(body) : h;
    if (out?.status) return route.fulfill({ status: out.status, contentType: "application/json", body: JSON.stringify(out.json || {}) });
    return route.fulfill({ json: out ?? { ok: false, error: "invalid_session" } });
  });
  return calls;
}

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["mails"] });
  await context.addInitScript(() => { localStorage.setItem("uiLang", "pl"); });
});

test("formularz: zły adres nie wysyła; po wysłaniu odliczanie, [Podaj inny adres] go nie omija", async ({ page }) => {
  const calls = await mockMailApi(page, { session: { ok: false, error: "no_session", csrf: "c1" }, request: { ok: true, cooldown_seconds: 60 } });
  await page.goto(URL_MAILS);
  await expect(page.locator("#mailTitle")).toHaveText("Twoje maile w Familijnej", { timeout: 20000 });
  const submit = page.locator("#mailForm button");
  for (const bad of ["", "bez-malpy", "a@"]) {
    await page.fill("#mailInput", bad);
    await submit.click();
  }
  expect(calls.filter((c) => c.path === "request"), "nieprawidłowy adres nie trafia do serwera").toEqual([]);

  await page.fill("#mailInput", "ktos@example.test");
  await submit.click();
  await expect(page.locator("#mailTitle")).toHaveText("Sprawdź swoją skrzynkę");
  await expect(page.locator("#mailMessage")).toContainText("ktos@example.test");
  const request = calls.find((c) => c.path === "request");
  expect(request.body).toEqual({ email: "ktos@example.test", lang: "pl" });

  await page.getByRole("button", { name: "Podaj inny adres" }).click();
  await expect(page.locator("#mailForm")).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText(/^Za (60|59|58) s$/);
  await page.fill("#mailInput", "inny@example.test");
  await page.locator("#mailInput").press("Enter");
  expect(calls.filter((c) => c.path === "request")).toHaveLength(1);
});

test("serwer: odliczanie z serwera i awaria — komunikat, formularz zostaje", async ({ page }) => {
  let reply = { ok: false, error: "cooldown", cooldown_seconds: 42 };
  await mockMailApi(page, { session: { ok: false, error: "no_session" }, request: () => reply });
  await page.goto(URL_MAILS);
  await expect(page.locator("#mailForm")).toBeVisible({ timeout: 20000 });
  await page.fill("#mailInput", "ktos@example.test");
  await page.locator("#mailForm button").click();
  await expect(page.locator(".app-toast-text")).toHaveText("Link został niedawno wysłany. Spróbuj ponownie po odliczeniu.");
  await expect(page.locator("#mailForm button")).toHaveText(/^Za (42|41|40) s$/);
  await expect(page.locator("#mailForm button")).toBeDisabled();

  // Awaria (500 bez treści błędu) przy wejściu: komunikat i formularz.
  await page.unroute("**/_api/mail/**");
  await mockMailApi(page, { session: { status: 500 } });
  await page.goto(URL_MAILS);
  await expect(page.locator(".app-toast-text")).toHaveText("Nie udało się wykonać operacji. Spróbuj ponownie.", { timeout: 20000 });
  await expect(page.locator("#mailForm")).toBeVisible();
  await expect(page.locator("#mailLists")).toBeHidden();
});

const ACTIVE = {
  ok: true, csrf: "c2", email: "ktos@example.test", notifications_enabled: true,
  subscriptions: [{ kind: "subscription", id: "s1", status: "active", owner_label: "<b>Ania</b>" }],
  items: [
    { kind: "poll", id: "p1", status: "pending", name: "Ankieta", owner_label: "Ania", link: "/go/?t=abc" },
    { kind: "poll", id: "p2", status: "pending", name: "Podejrzana", owner_label: "Ktoś", link: "https://evil.example.test/go/?t=x" },
  ],
};

test("aktywne centrum: [Wypisz się], [Odrzuć] i [Zrezygnuj] pytają, [Anuluj] nic nie wysyła; link spoza serwisu nie jest linkiem", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls = await mockMailApi(page, { session: ACTIVE, action: { ok: true }, notifications: { ok: true } });
  await page.goto(URL_MAILS);
  await expect(page.locator("#mailTitle")).toHaveText("Moje powiadomienia", { timeout: 20000 });
  await expect(page.locator("#mailAddress")).toHaveText("ktos@example.test");
  const sub = page.locator(".mail-row--subscription");
  await expect(sub.locator(".shareEmail")).toHaveText("<b>Ania</b>");

  // Żaden odnośnik nie prowadzi poza serwis; zwykły prowadzi przez /go/.
  const hrefs = await page.locator("#mailLists a[href]").evaluateAll((els) => els.map((a) => a.getAttribute("href")));
  expect(hrefs.some((h) => /evil\.example/.test(h)), "link spoza serwisu").toBe(false);
  expect(hrefs).toContain("/go/?t=abc");
  // Wiersz z podejrzanym linkiem zostaje na liście, bez [Zagłosuj].
  const suspicious = page.locator(".mail-row--poll", { hasText: "Podejrzana" });
  await expect(suspicious).toBeVisible();
  await expect(suspicious.getByRole("link")).toHaveCount(0);
  await expect(suspicious.getByRole("button", { name: "Odrzuć" })).toBeVisible();

  await sub.getByRole("button", { name: "Wypisz się" }).click();
  let dialog = page.locator(".uni-modal:visible");
  await expect(dialog).toContainText("Rezygnujesz z tej subskrypcji. Nowe zaproszenie będzie możliwe po 30 dniach.");
  await dialog.getByRole("button", { name: "Anuluj" }).click();
  await page.locator("#mailPreferenceButton").click();
  dialog = page.locator(".uni-modal:visible");
  await expect(dialog).toContainText("Wyłączysz wszystkie powiadomienia");
  await dialog.getByRole("button", { name: "Anuluj" }).click();
  expect(calls.filter((c) => ["action", "notifications"].includes(c.path)), "[Anuluj] nic nie wysyła").toEqual([]);

  await sub.getByRole("button", { name: "Wypisz się" }).click();
  await page.locator(".uni-modal:visible .uni-foot .btn.gold").click();
  await expect.poll(() => calls.filter((c) => c.path === "action").map((c) => c.body)).toEqual([{ kind: "subscription", id: "s1", action: "decline" }]);
  expect(errors).toEqual([]);
});
