// [Kontakt] — okno „Napisz do nas” (podręcznik 19.6): adres wpisany po
// zalogowaniu, błędne pola, numer zgłoszenia (dopisanie bez tematu), limit
// załączników (5 plików po 5 MB), nazwy plików z HTML, limit zgłoszeń i
// nieudana weryfikacja. Prawdziwe okno z kodu brancha; Turnstile i odpowiedzi
// /_api/contact* podstawione, żeby test nie zakładał zgłoszeń w skrzynce
// pomocy (Worker: tests/unit/authApi.test.js, contactAppend.test.js).
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", needs: { standard: 1 } });

const ORIGIN = "https://www.familijna.app";

async function prepare(context, page) {
  await serveBranchCode(context, { pages: ["privacy", "games"] });
  // Atrapa Turnstile: token od razu, albo błąd, gdy test ustawi window.__captchaFail.
  await context.addInitScript(() => {
    localStorage.setItem("uiLang", "pl");
    window.turnstile = {
      render(_el, opts) {
        setTimeout(() => (window.__captchaFail ? opts["error-callback"]() : opts.callback("e2e-fake-token")), 0);
        return 1;
      },
      remove() {},
    };
  });
  const sent = [];
  let reply = { status: 200, json: { ok: true, ticket_number: "2026-0042" } };
  await page.route(/\/_api\/contact(\/append)?$/, async (route) => {
    sent.push({ path: new URL(route.request().url()).pathname, body: JSON.parse(route.request().postData() || "{}") });
    await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.json) });
  });
  return { sent, setReply: (r) => { reply = r; } };
}

async function openContact(page) {
  await page.locator("[data-contact-modal]:visible, .btn-contact-footer:visible").first().click();
  await expect(page.locator("#contactModalOverlay")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#cModalTitle")).toHaveText("Napisz do nas");
}

const error = (page) => page.locator("#cModalError");

test("zalogowany: adres wpisany sam; błędne pola nic nie wysyłają; załączniki ponad limit pominięte z informacją", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90_000);
  const { sent } = await prepare(context, page);
  await loginAs(page, context, accounts.standard[0]);
  await page.goto(`${ORIGIN}/games/`, { waitUntil: "domcontentloaded" });
  await openContact(page);
  await expect(page.locator("#cModalEmail")).toHaveValue(accounts.standard[0].email);

  const submit = page.locator("#cModalSubmit");
  for (const [email, subject, message, msg] of [
    ["", "Temat", "Opis problemu", "Podaj poprawny adres e-mail."],
    ["bez-malpy", "Temat", "Opis problemu", "Podaj poprawny adres e-mail."],
    [accounts.standard[0].email, "Temat", "abc ", "Wiadomość jest za krótka (min. 5 znaków)."],
    [accounts.standard[0].email, "   ", "Opis problemu", "Podaj temat."],
  ]) {
    await page.fill("#cModalEmail", email);
    await page.fill("#cModalSubject", subject);
    await page.fill("#cModalMessage", message);
    await submit.click();
    await expect(error(page)).toHaveText(msg);
  }
  expect(sent, "błędne pola: nic nie wysłane").toEqual([]);

  const small = (name) => ({ name, mimeType: "image/png", buffer: Buffer.from("png") });
  await page.setInputFiles("#cModalAttachments", [
    small("<b>zrzut</b>.png"), small("b.png"), { name: "duzy.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
    small("c.png"), small("d.png"), small("e.png"), small("f.png"),
  ]);
  await expect(page.locator("#cModalFileList .contact-file")).toHaveText(["<b>zrzut</b>.png", "b.png", "c.png", "d.png", "e.png"]);
  await expect(page.locator("#cModalFileList b")).toHaveCount(0);
  await expect(page.locator("#cModalAttachHint")).toHaveText("Pominięte (ponad 5 plików lub ponad 5 MB): duzy.png, f.png.");

  await page.fill("#cModalSubject", "Problem z grą");
  await page.fill("#cModalMessage", "Na stronie Moje gry nic się nie dzieje.");
  await submit.click();
  await expect(page.locator("#cModalSuccessTicket")).toHaveText("Numer zgłoszenia: 2026-0042");
  expect(sent).toHaveLength(1);
  expect(sent[0].path).toBe("/_api/contact");
  expect(sent[0].body).toMatchObject({ email: accounts.standard[0].email, subject: "Problem z grą", lang: "pl", captcha_token: "e2e-fake-token" });
  expect(sent[0].body.attachments.map((a) => a.filename)).toEqual(["<b>zrzut</b>.png", "b.png", "c.png", "d.png", "e.png"]);

  // Ponowne otwarcie: puste pola i bez starych załączników.
  await page.locator("#cModalDone").click();
  await openContact(page);
  await expect(page.locator("#cModalFileList .contact-file")).toHaveCount(0);
  await expect(page.locator("#cModalAttachHint")).toHaveText("");
  await expect(page.locator("#cModalMessage")).toHaveValue("");
});

test("anonim: numer zgłoszenia chowa temat i dopisuje do zgłoszenia; limit zgłoszeń i nieudana weryfikacja — komunikat", async ({ page, context }) => {
  test.setTimeout(60_000);
  const { sent, setReply } = await prepare(context, page);
  await page.goto(`${ORIGIN}/privacy/`, { waitUntil: "domcontentloaded" });
  await openContact(page);
  await expect(page.locator("#cModalEmail")).toHaveValue("");
  await page.fill("#cModalEmail", "ktos@example.test");
  await page.fill("#cModalTicket", "2026-0001");
  await expect(page.locator("#cModalSubjectField")).toBeHidden();
  await page.fill("#cModalMessage", "Dopisuję zrzut ekranu.");

  setReply({ status: 429, json: { ok: false, error: "rate_limited" } });
  await page.locator("#cModalSubmit").click();
  await expect(error(page)).toHaveText("Możesz wysłać jedno zgłoszenie na 24 godziny.");
  await expect(page.locator("#cModalForm")).toBeVisible();

  await page.evaluate(() => { window.__captchaFail = true; });
  await page.locator("#cModalSubmit").click();
  await expect(error(page)).toHaveText("Aby kontynuować, wykonaj weryfikację CAPTCHA.");
  expect(sent).toHaveLength(1);

  await page.evaluate(() => { window.__captchaFail = false; });
  setReply({ status: 200, json: { ok: true } });
  await page.locator("#cModalSubmit").click();
  await expect(page.locator("#cModalSuccessTicket")).toHaveText("Dodano do zgłoszenia: 2026-0001");
  expect(sent.map((s) => s.path)).toEqual(["/_api/contact/append", "/_api/contact/append"]);
  expect(sent[1].body).toMatchObject({ email: "ktos@example.test", ticket: "2026-0001", message: "Dopisuję zrzut ekranu." });
  expect(sent[1].body.subject).toBeUndefined();
});
