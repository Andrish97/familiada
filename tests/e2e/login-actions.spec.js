// Logowanie, potwierdzenie konta i reset hasła (podręcznik 5.1–5.7, 19.1):
// czynności z opisu i ich wersje „źle/podejrzanie”: puste pola, adres bez @,
// nieznany next=, podrobione linki z maila, link otwarty przy zalogowanym
// koncie, ekran „Pierwsze logowanie”, wylogowanie, konto gościa na logowaniu.
// Kod strony z brancha (serveBranchCode), baza i Worker produkcyjne; HTML
// /login zawsze z Workera (Turnstile). Lokalnie (scripts/agent-tools/local-e2e)
// nie ma Workera ani prawdziwego logowania — takie testy są pomijane.
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");
const { withE2EBypass, instrumentPage, loginAsGuest } = require("./helpers/login");

test.use({ serviceWorkers: "block", needs: { standard: 1, disposable: 1, noaccount: 1 } });

const ORIGIN = "https://www.familijna.app";
const LOCAL = process.env.E2E_BYPASS_SECRET === "local";
const PAGES = ["account", "games", "tasks", "friends", "go", "login/confirm", "login/reset"];

// Kontekst bez sesji (anonim) z kodem brancha.
async function anonContext(browser) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await withE2EBypass(ctx);
  await serveBranchCode(ctx, { pages: PAGES });
  const page = await ctx.newPage();
  instrumentPage(page);
  return { ctx, page };
}

// Strona logowania gotowa: sesja sprawdzona, przyciski podpięte.
async function openLogin(page, query = "") {
  await page.goto(`${ORIGIN}/login/${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#status")).toHaveText("Niezalogowany.", { timeout: 20000 });
}

function watchAuthApi(page) {
  const calls = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/_api/auth/") || u.pathname.startsWith("/auth/v1/verify") || u.pathname.startsWith("/auth/v1/signup") || u.pathname.startsWith("/auth/v1/recover")) calls.push(u.pathname);
  });
  return calls;
}

test.describe("logowanie: błędne dane bez wysyłki", () => {
  test("puste pola, „Przypomnij hasło” bez loginu i rejestracja bez adresu: komunikat, nic nie trafia do serwera", async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await anonContext(browser);
    try {
      const calls = watchAuthApi(page);
      await openLogin(page);
      const err = page.locator("#err");

      await page.click("#btnPrimary");
      await expect(err).toHaveText("Podaj e-mail/nazwę użytkownika i hasło.");
      await page.fill("#email", "ktos@example.test");
      await page.click("#btnPrimary");
      await expect(err).toHaveText("Podaj e-mail/nazwę użytkownika i hasło.");
      await page.fill("#email", "   ");
      await page.click("#btnForgot");
      await expect(err).toHaveText("Podaj e-mail lub nazwę użytkownika do resetu.");

      // Załóż konto: drugie pole hasła i zasady hasła widoczne od razu.
      await page.click("#btnToggle");
      await expect(page.locator("#btnPrimary")).toContainText("Zarejestruj");
      await expect(page.locator("#btnToggle")).toContainText("Mam konto");
      await expect(page.locator("#pass2")).toBeEnabled();
      await expect(page.locator("#pwdHint")).toHaveText("Hasło musi zawierać: min. 8 znaków, mała litera, duża litera, cyfra, znak specjalny.");
      await expect(err).toHaveText("");
      await page.fill("#email", "");
      await page.fill("#pass", "Dobre-Haslo-1");
      await page.click("#btnPrimary");
      await expect(err).toHaveText("Podaj poprawny e-mail.");
      await page.fill("#email", "bez-malpy.example.test");
      await page.click("#btnPrimary");
      await expect(err).toHaveText("Podaj poprawny e-mail.");
      await page.fill("#email", "ktos@example.test");
      await page.fill("#pass", "");
      await page.click("#btnPrimary");
      await expect(err).toHaveText("Podaj e-mail/nazwę użytkownika i hasło.");

      // Powrót do logowania czyści drugie hasło i zasady.
      await page.fill("#pass2", "cokolwiek");
      await page.click("#btnToggle");
      await expect(page.locator("#btnPrimary")).toContainText("Zaloguj");
      await expect(page.locator("#pass2")).toBeDisabled();
      await expect(page.locator("#pass2")).toHaveValue("");
      await expect(page.locator("#pwdHint")).toHaveText("");

      expect(calls, "żadnego żądania logowania, rejestracji ani resetu").toEqual([]);
      await expect(page).toHaveURL(/\/login\/?$/);
    } finally {
      await ctx.close();
    }
  });

  test("komunikaty błędów konta z podręcznika (19.1) i zasady hasła po polsku", async ({ browser }) => {
    const { ctx, page } = await anonContext(browser);
    try {
      await openLogin(page);
      const out = await page.evaluate(async () => {
        const auth = await import("/shared/js/core/auth.js");
        const pass = (v) => { try { auth.validatePassword(v); return "ok"; } catch (e) { return e.message; } };
        return {
          notConfirmed: auth.niceAuthError({ message: "Email not confirmed" }),
          badLogin: auth.niceAuthError({ message: "Invalid login credentials" }),
          sameAsOld: auth.niceAuthError({ message: "New password should be different from the old password." }),
          tooMany: auth.niceAuthError({ message: "Too many requests" }),
          wait: auth.niceAuthError({ message: "For security purposes, you can only request this after 53 seconds." }),
          empty: auth.niceAuthError({}),
          short: pass("Ab1!"),
          noUpper: pass("abcdefg1!"),
          noSpecial: pass("Abcdefg12"),
          all: pass(""),
          good: pass("Abcdefg1!"),
        };
      });
      expect(out).toEqual({
        notConfirmed: "Potwierdź e-mail (link w skrzynce).",
        badLogin: "Zły e-mail lub hasło.",
        sameAsOld: "Nowe hasło musi być inne niż poprzednie.",
        tooMany: "Za dużo prób. Spróbuj ponownie później.",
        wait: "Możesz wysłać ponownie za 53 s.",
        empty: "Nie udało się zalogować.",
        short: "Brakuje: min. 8 znaków.",
        noUpper: "Brakuje: duża litera.",
        noSpecial: "Brakuje: znak specjalny.",
        all: "Brakuje: min. 8 znaków, mała litera, duża litera, cyfra, znak specjalny.",
        good: "ok",
      });
    } finally {
      await ctx.close();
    }
  });

  test("rejestracja (tylko CI): różne hasła i za słabe hasło nie zakładają konta, istniejący adres przełącza na logowanie", async ({ browser, accounts }) => {
    test.skip(LOCAL, "rejestracja sprawdza adres przez Workera (/_api/auth/email-status)");
    test.setTimeout(120_000);
    const { ctx, page } = await anonContext(browser);
    try {
      const calls = watchAuthApi(page);
      await openLogin(page);
      await page.click("#btnToggle");
      // Adres bez konta (noaccount): sprawdzenie stanu adresu, ale bez zakładania konta.
      await page.fill("#email", accounts.noaccount[0].email);
      await page.fill("#pass", "Dobre-Haslo-1!");
      await page.fill("#pass2", "Inne-Haslo-1!");
      await page.click("#btnPrimary");
      await expect(page.locator("#err")).toHaveText("Hasła nie są takie same.", { timeout: 30000 });
      await page.fill("#pass", "slabe");
      await page.fill("#pass2", "slabe");
      await page.click("#btnPrimary");
      await expect(page.locator("#err")).toHaveText(/^Brakuje: /, { timeout: 30000 });
      expect(calls.filter((p) => p !== "/_api/auth/email-status"), "bez rejestracji").toEqual([]);

      // Adres zajęty: komunikat i przełączenie na logowanie.
      await page.fill("#email", accounts.standard[0].email);
      await page.fill("#pass", "Dobre-Haslo-1!");
      await page.fill("#pass2", "Dobre-Haslo-1!");
      await page.click("#btnPrimary");
      const dialog = page.locator(".uni-modal:visible");
      await expect(dialog).toContainText("Konto już istnieje. Przełączam na logowanie.", { timeout: 30000 });
      await dialog.locator(".uni-foot .btn.gold").click();
      await expect(page.locator("#btnPrimary")).toContainText("Zaloguj");
      await expect(page.locator("#pass2")).toBeDisabled();
      expect(calls.filter((p) => p !== "/_api/auth/email-status"), "bez rejestracji").toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("zalogowany na stronie logowania", () => {
  test.beforeEach(async ({ context }) => {
    await serveBranchCode(context, { pages: PAGES });
  });

  test("przekierowanie do Moich gier; next= tylko na znane strony (Ustawienia konta z centrum maili, Zadania, link kopii)", async ({ page, context, accounts, loginAs }) => {
    test.setTimeout(120_000);
    await loginAs(page, context, accounts.standard[0]);
    const COPY_TOKEN = "0f0e0d0c-0b0a-4908-8706-050403020100";
    for (const [query, path] of [
      ["", "/games/"],
      ["?next=account", "/account/"],
      ["?next=tasks", "/tasks/"],
      ["?next=https://evil.example.test/", "/games/"],
      ["?next=javascript:alert(1)", "/games/"],
      ["?next=../admin", "/games/"],
      // 5.3: link kopii gry/logo (go.js redirectToLogin) wraca po logowaniu na
      // /go/ z tym samym c=; c= spoza formatu tokenu -- Moje gry.
      [`?from=poll-go&next=copy&c=${COPY_TOKEN}`, "/go/"],
      ["?from=poll-go&next=copy&c=https://evil.example.test/", "/games/"],
    ]) {
      await page.goto(`${ORIGIN}/login/${query}`, { waitUntil: "domcontentloaded" });
      let reached;
      await page.waitForURL((u) => (u.pathname === path ? (reached = u, true) : false), { timeout: 20000 });
      expect(reached.origin, query).toBe(ORIGIN);
      if (path === "/go/") expect(reached.searchParams.get("c"), query).toBe(COPY_TOKEN);
    }
  });

  test("[Wyloguj] w menu konta kończy sesję; strona dla kont odsyła na logowanie", async ({ page, context, accounts, loginAs }) => {
    test.setTimeout(90_000);
    await loginAs(page, context, accounts.standard[0]);
    await page.goto(`${ORIGIN}/games/`, { waitUntil: "domcontentloaded" });
    const who = page.locator("#who, #whoStatic").first();
    await expect(who).toContainText(accounts.standard[0].username, { timeout: 20000 });
    await who.click();
    await page.locator("#topbarAccountMenu").getByRole("button", { name: "Wyloguj", exact: true }).click();
    await page.waitForURL(/\/login\//, { timeout: 20000 });
    await expect(page.locator("#status")).toHaveText("Niezalogowany.", { timeout: 20000 });
    const user = await page.evaluate(async () => (await window.__sbClient.auth.getSession()).data.session?.user?.id || null);
    expect(user, "brak sesji po wylogowaniu").toBeNull();
    if (!LOCAL) {
      // Lokalna atrapa wstawia sesję przy każdym wejściu; na produkcji sesji już nie ma.
      await page.goto(`${ORIGIN}/account/`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/login\//, { timeout: 20000 });
    }
  });

  test("„Pierwsze logowanie”: za krótka, zarezerwowana i zajęta nazwa — komunikat; poprawna — Moje gry", async ({ page, context, accounts, loginAs }) => {
    test.setTimeout(120_000);
    const [account] = accounts.disposable;
    await loginAs(page, context, account);
    await page.goto(`${ORIGIN}/login/?setup=username`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#setupCard")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#loginCard")).toBeHidden();
    await expect(page.locator("#setupCard .setup-title")).toHaveText("Ustaw nazwę użytkownika");
    const err = page.locator("#usernameErr");
    const cases = [
      ["", "Podaj nazwę użytkownika."],
      ["ab", "Nazwa użytkownika: min. 3 znaki."],
      ["guest_123456", "Prefiks guest_ jest zarezerwowany."],
      ["<b>x</b>", "Dozwolone znaki"],
      [accounts.standard[0].username.toUpperCase(), "Ta nazwa użytkownika jest już zajęta."],
    ];
    // Zarezerwowane początki nazw przychodzą z bazy (reserved_username_prefixes);
    // lokalny schemat nie ma wierszy tej tabeli.
    if (!LOCAL) cases.push(["admin_kowalski", "Ta nazwa użytkownika jest już zajęta."], ["Familijna-Team", "Ta nazwa użytkownika jest już zajęta."]);
    for (const [value, msg] of cases) {
      await page.fill("#usernameFirst", value);
      await page.click("#btnUsernameSave");
      await expect(err, value).toContainText(msg);
    }
    const before = await page.evaluate(async () => {
      const sb = window.__sbClient;
      const { data: u } = await sb.auth.getUser();
      return (await sb.from("profiles").select("username").eq("id", u.user.id).single()).data.username;
    });
    expect(before, "błędne nazwy nic nie zapisały").toBe(account.username);

    const fresh = `nowa_${Date.now().toString(36)}`;
    try {
      await page.fill("#usernameFirst", fresh);
      await page.click("#btnUsernameSave");
      await page.waitForURL(/\/games\//, { timeout: 20000 });
      const saved = await page.evaluate(async () => {
        const sb = window.__sbClient;
        const { data: u } = await sb.auth.getUser();
        return (await sb.from("profiles").select("username").eq("id", u.user.id).single()).data.username;
      });
      expect(saved).toBe(fresh);
    } finally {
      // Konto disposable odtwarza wypożyczenie; przywracamy i tak, żeby kolejne testy pliku miały nazwę z rejestru.
      await page.evaluate(async (name) => {
        const sb = window.__sbClient;
        const { data: u } = await sb.auth.getUser();
        await sb.from("profiles").update({ username: name }).eq("id", u.user.id);
        await sb.auth.updateUser({ data: { username: name } });
      }, account.username);
    }
  });
});

test.describe("linki z maila: potwierdzenie i reset", () => {
  test("potwierdzenie: link bez kodu, użyty, wygasły, z HTML i „pierwszy link” — komunikat i powrót do logowania", async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await anonContext(browser);
    try {
      const calls = watchAuthApi(page);
      const status = page.locator("#status");
      const err = page.locator("#err");
      const back = page.locator("#back");
      const open = async (suffix) => {
        await page.goto(`${ORIGIN}/login/confirm/${suffix}`, { waitUntil: "domcontentloaded" });
        await expect(back).toBeVisible({ timeout: 20000 });
        await expect(back).toHaveAttribute("href", /^(https:\/\/www\.familijna\.app)?\/login\/(\?lang=pl)?$/);
        await expect(page.locator("#go")).toBeHidden();
      };

      await open("");
      await expect(status).toHaveText("Brak kodu w linku.");
      await expect(err).toHaveText("Wygląda na to, że link jest niepełny albo został już użyty.");

      await open("?error=access_denied&error_description=Email+link+has+already+been+used");
      await expect(status).toHaveText("Ten link został już użyty.");

      await open("#error=access_denied&error_description=Email+link+is+invalid+or+has+expired");
      await expect(status).toHaveText("Link jest nieprawidłowy lub wygasł.");
      await expect(err).toHaveText("Email link is invalid or has expired");

      // Podrobiony opis błędu z HTML: zostaje tekstem, nic się nie wykonuje.
      await open(`?r=1#error=x&error_description=${encodeURIComponent("<img src=x onerror=window.__xssHit=1>")}`);
      await expect(err).toHaveText("<img src=x onerror=window.__xssHit=1>");
      expect(await page.evaluate(() => ({ hit: window.__xssHit || 0, img: document.querySelectorAll('img[src="x"]').length }))).toEqual({ hit: 0, img: 0 });

      await open(`?message=${encodeURIComponent("Confirmation link accepted. Please proceed to confirm link sent to the other email")}`);
      await expect(status).toHaveText("Potwierdzono pierwszy link.");

      expect(calls, "żaden z tych linków nie wywołuje weryfikacji").toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("link z maila przy zalogowanym koncie: okno „Aktywna sesja”, [Anuluj] zostawia sesję i nie zużywa linku", async ({ page, context, accounts, loginAs }) => {
    test.setTimeout(90_000);
    await serveBranchCode(context, { pages: PAGES });
    await loginAs(page, context, accounts.standard[0]);
    const calls = watchAuthApi(page);
    for (const [path, title] of [["/login/confirm/", "Aktywna sesja na tym urządzeniu"], ["/login/reset/", "Aktywna sesja na tym urządzeniu"]]) {
      await page.goto(`${ORIGIN}${path}?token_hash=${"ab".repeat(28)}&type=${path.includes("reset") ? "recovery" : "signup"}`, { waitUntil: "domcontentloaded" });
      const dialog = page.locator(".uni-modal:visible");
      await expect(dialog).toContainText(title, { timeout: 20000 });
      await expect(dialog).toContainText("jesteś zalogowany jako:");
      await dialog.getByRole("button", { name: "Anuluj" }).click();
      await expect(page.locator("#status")).toHaveText("Anulowano");
      await expect(page.locator("#back")).toBeVisible();
    }
    if (!LOCAL) expect(calls, "link nie został zweryfikowany").toEqual([]);
    const still = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user?.email || null);
    expect(still).toBe(accounts.standard[0].email);
  });

  test("reset: podrobiony token — formularz nowego hasła się nie pokazuje", async ({ browser }) => {
    test.setTimeout(60_000);
    const { ctx, page } = await anonContext(browser);
    try {
      await page.goto(`${ORIGIN}/login/reset/?token_hash=${"cd".repeat(28)}&type=recovery`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#back")).toBeVisible({ timeout: 20000 });
      await expect(page.locator("#status")).toHaveText(/Nie udało się zweryfikować linku\.|Nie udało się rozpocząć resetu\./);
      await expect(page.locator("#form")).toBeHidden();
    } finally {
      await ctx.close();
    }
  });

  test("reset: różne i za słabe hasła nie są zapisywane (sesja z linku podstawiona)", async ({ browser, page, context, accounts, loginAs }) => {
    test.setTimeout(90_000);
    // Sesja konta jak po kliknięciu linku: odpowiedź weryfikacji GoTrue podmieniona sesją
    // zalogowanego konta (prawdziwy link z maila sprawdza account-password-email.spec.js).
    await loginAs(page, context, accounts.disposable[0]);
    const session = await page.evaluate(async () => (await window.__sbClient.auth.getSession()).data.session);
    const { ctx, page: reset } = await anonContext(browser);
    try {
      await reset.route("**/auth/v1/verify**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
      const writes = [];
      reset.on("request", (r) => { if (r.url().includes("/auth/v1/user") && r.method() === "PUT" && /"password"/.test(r.postData() || "")) writes.push(r.url()); });
      await reset.goto(`${ORIGIN}/login/reset/?token_hash=${"ef".repeat(28)}&type=recovery`, { waitUntil: "domcontentloaded" });
      await expect(reset.locator("#form")).toBeVisible({ timeout: 20000 });
      await expect(reset.locator("#status")).toHaveText("Link jest ważny.");
      await expect(reset.locator("#pwdHint")).toContainText("Hasło musi zawierać:");
      await reset.fill("#p1", "Dobre-Haslo-1!");
      await reset.fill("#p2", "Dobre-Haslo-2!");
      await reset.click("#save");
      await expect(reset.locator("#err")).toHaveText("Hasła nie są takie same.");
      await reset.fill("#p1", "slabehaslo");
      await reset.fill("#p2", "slabehaslo");
      await reset.click("#save");
      await expect(reset.locator("#err")).toHaveText("Brakuje: duża litera, cyfra, znak specjalny.");
      await expect(reset.locator("#form")).toBeVisible();
      expect(writes, "hasło nie zostało wysłane").toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("konto gościa na stronie logowania (tylko CI)", () => {
  test("aktywna sesja gościa: [Wróć do konta gościa] wraca do tego samego konta, logowanie pyta o utratę danych, [Anuluj] je zachowuje", async ({ page, context, accounts }) => {
    test.skip(LOCAL, "konto gościa zakłada Worker");
    test.setTimeout(150_000);
    await serveBranchCode(context, { pages: PAGES });
    await loginAsGuest(page, context);
    await withE2EBypass(context);
    const guestId = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    try {
      await page.goto(`${ORIGIN}/login/`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#status")).toContainText("Aktywna sesja gościa:", { timeout: 20000 });
      await expect(page.locator("#btnGuest")).toContainText("Wróć do konta gościa");
      await page.click("#btnGuest");
      await page.waitForURL(/\/games\//, { timeout: 20000 });
      expect(await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id)).toBe(guestId);

      await page.goto(`${ORIGIN}/login/`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#status")).toContainText("Aktywna sesja gościa:", { timeout: 20000 });
      await page.fill("#email", accounts.standard[0].email);
      await page.fill("#pass", process.env.TEST_PASSWORD || "x");
      await page.click("#btnPrimary");
      const dialog = page.locator(".uni-modal:visible");
      await expect(dialog).toContainText("Aktywna sesja gościa", { timeout: 20000 });
      await expect(dialog).toContainText("na zawsze stracisz dane gościa");
      await dialog.getByRole("button", { name: "Anuluj" }).click();
      await expect(page.locator("#email")).toHaveValue("");
      await expect(page.locator("#pass")).toHaveValue("");
      expect(await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id)).toBe(guestId);
    } finally {
      // Sprzątanie gościa przez prawdziwe UI (tests/README.md „Tryby logowania”).
      await page.goto(`${ORIGIN}/account/`, { waitUntil: "domcontentloaded" });
      await page.click("#deleteAccount", { timeout: 20000 });
      await page.locator(".uni-modal:visible").getByRole("button", { name: "Usuń", exact: true }).click();
      await page.waitForURL(/\/login/, { timeout: 30000 });
    }
  });
});
