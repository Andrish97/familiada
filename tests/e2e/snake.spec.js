// Ukryta gra w węża: kod QR z kadru ankiet (id demo) → /go/ → /snake/,
// zdarzenia scan/enter/start/finish w bazie i postęp zalogowanego.
// Przeglądarka testu ma identyfikator „e2e-…”, więc statystyki admina go pomijają.
const { test, expect } = require("@playwright/test");
const { loginAsPooledTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const SITE = "https://www.familiada.online";
const QR = `${SITE}/go/?p=anon&id=00000000-0000-4000-8000-000000000103&key=poll103KEY&lang=pl`;
const branch = process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0";
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  if (branch) await serveBranchCode(context, { pages: ["snake", "go"] });
  await context.addInitScript((id) => {
    try { if (!localStorage.getItem("familiada:snake:visitor")) localStorage.setItem("familiada:snake:visitor", id); } catch {}
  }, `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
});

// Odpowiedzi snake_log w kolejności: [{ kind, body }].
function recordSnakeLog(page) {
  const log = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/rpc/snake_log")) return;
    const kind = res.request().postDataJSON()?.p_kind;
    log.push({ kind, status: res.status(), body: await res.json().catch(() => null) });
  });
  return log;
}

// Start strzałką w prawo (wąż i tak jedzie w prawo) i czekanie na uderzenie w ścianę.
async function playUntilCrash(page) {
  const frame = page.locator("#snakeFrame");
  await expect(frame).toHaveAttribute("data-mode", "intro", { timeout: 30_000 });
  await page.locator("body").press("ArrowRight");
  await expect(frame).toHaveAttribute("data-mode", "play");
  await expect(frame).toHaveAttribute("data-mode", "over", { timeout: 30_000 });
}

test("wąż: kod QR z kadru prowadzi do gry, zdarzenia trafiają do bazy (bez konta)", async ({ page }) => {
  test.setTimeout(120_000);
  const log = recordSnakeLog(page);
  await page.goto(QR, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/snake\/\?lang=pl$/, { timeout: 30_000 });
  await expect(page.locator("#displays circle").first()).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("#snakeProgress")).toContainText("tylko w tej przeglądarce");
  await expect(page.locator("#snakeLogin")).toBeVisible();
  await playUntilCrash(page);
  await expect.poll(() => log.map((e) => e.kind).join(","), { timeout: 15_000 }).toBe("scan,enter,start,finish");
  for (const e of log) {
    expect(e.status, `${e.kind}: HTTP`).toBe(200);
    expect(e.body, `${e.kind}: odpowiedź`).toEqual({ ok: true });
  }
});

test("wąż: zalogowany ma zapisany rekord i liczbę gier", async ({ page, context }) => {
  test.setTimeout(180_000);
  await loginAsPooledTestUser(page, context, 0);
  const log = recordSnakeLog(page);
  await page.goto(`${SITE}/snake/?lang=pl`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#snakeProgress")).toContainText("na koncie", { timeout: 30_000 });
  await expect(page.locator("#snakeLogin")).toBeHidden();
  await expect.poll(() => log.find((e) => e.kind === "enter")?.body?.ok, { timeout: 15_000 }).toBe(true);
  const before = log.find((e) => e.kind === "enter").body.games;
  await playUntilCrash(page);
  await expect.poll(() => log.find((e) => e.kind === "finish")?.body?.games, { timeout: 15_000 }).toBe(before + 1);
  const finish = log.find((e) => e.kind === "finish").body;
  await expect(page.locator("#snakeProgress")).toContainText(`rozegrane gry: ${before + 1}`);
  expect(finish.best).toBeGreaterThanOrEqual(0);
});
