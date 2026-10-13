// tests/e2e/tasks.spec.js
// Zadania tylko ankiety; bazy obsługiwane wyłącznie w Bases.
// Chodzi po produkcji (po wdrożeniu strony). Konta tylko z puli: test2 (A)
// i test3 (B); test9/10 nie używać.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");

const { serveBranchCode } = require("./helpers/branch-code");
const { tasksPreview } = require("./fixtures/tasks-preview");

const TASKS_URL = "https://www.familiada.online/tasks/";

test.use({ serviceWorkers: "block" });

async function newUserContext(browser, username) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await loginAsTestUser(page, ctx, { username });
  // Na main sprawdzamy opublikowane pliki Pages; na branchu kandydat do wdrożenia.
  if (process.env.GITHUB_REF_NAME !== "main") await serveBranchCode(ctx, { pages: ["tasks", "bases", "go"] });
  return { ctx, page };
}

test.describe("tasks: baza udostępniona drugiemu kontu", () => {
  test("baza pozostaje w Bazach i nie powiela się w Zadaniach ani ich plakietce", async ({ browser }) => {
    test.setTimeout(120_000);
    const a = await newUserContext(browser, testAccountUsername(2));
    const b = await newUserContext(browser, testAccountUsername(3));
    const baseName = `E2E zadania ${Date.now()}`;
    let baseId = null;
    try {
      const recipientId = await b.page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);

      baseId = await a.page.evaluate(async (name) => {
        const sb = window.__sbClient;
        const { data: u } = await sb.auth.getUser();
        const { data, error } = await sb.from("question_bases").insert({ name, owner_id: u.user.id }).select("id").single();
        if (error) throw new Error("insert question_bases: " + error.message);
        return data.id;
      }, baseName);

      const before = await b.page.evaluate(async () => (await window.__sbClient.rpc("badges_get")).data.tasks_pending);
      const proposal = await a.page.evaluate(async ({ baseId, recipientId }) => {
        const { data, error } = await window.__sbClient.rpc("base_share_by_user", {
          p_base_id: baseId, p_recipient_user_id: recipientId, p_role: "viewer",
        });
        if (error) throw new Error(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.ok) throw new Error("base_share_by_user: " + row?.err);
        return row;
      }, { baseId, recipientId });

      await b.page.goto(TASKS_URL, { waitUntil: "domcontentloaded" });
      await expect(b.page.locator('[data-skel-step]')).toHaveClass(/skel-step-ready/);
      await expect(b.page.locator('.rowsRow[data-kind="base"],.rowsRow[data-kind="device"]')).toHaveCount(0);
      const after = await b.page.evaluate(async () => (await window.__sbClient.rpc("badges_get")).data.tasks_pending);
      expect(after).toBe(before);
      const token = new URL(proposal.mail_link, TASKS_URL).searchParams.get("b");
      expect(token).toBeTruthy();
      await b.page.goto(`/go/?b=${token}`);
      await b.page.getByRole('button', { name: 'Otwórz Bazy' }).click();
      await expect.poll(() => new URL(b.page.url()).pathname).toBe('/bases/');
      const tile = b.page.locator('#sharedGrid .card', { hasText: baseName });
      await expect(tile).toHaveClass(/selected/);
      await tile.locator('[data-accept]').click();
      await expect(b.page.locator('#sharedGrid .card[data-proposed="1"]', { hasText: baseName })).toHaveCount(0);
      await expect(b.page.locator('#sharedGrid .card', { hasText: baseName })).toBeVisible();
    } finally {
      if (baseId) {
        await a.page.evaluate(async (id) => { await window.__sbClient.from("question_bases").delete().eq("id", id); }, baseId).catch(() => {});
      }
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});

// Kontrolowane dane RPC; prawdziwy HTML, moduły, CSS i logowanie.
for (const viewport of [
  { width: 1400, height: 1100, label: "1400" },
  { width: 390, height: 844, label: "390" },
  { width: 844, height: 390, label: "844x390" },
  { width: 667, height: 375, label: "667x375" },
]) {
  test(`tasks: wszystkie kafelki i odstępy — ${viewport.label}`, async ({ browser }) => {
    const { ctx, page } = await newUserContext(browser, testAccountUsername(2));
    try {
      await page.setViewportSize(viewport);
      let fixture = tasksPreview;
      await page.route("**/rest/v1/rpc/tasks_list", (route) => route.fulfill({ json: fixture }));
      await page.goto(TASKS_URL);
      await expect(page.locator(".rowsRow")).toHaveCount(4);
      await expect(page.locator('input[type="search"], .list-search, .games-bottom')).toHaveCount(0);
      await expect(page.locator('.rowsRow[data-kind="base"],.rowsRow[data-kind="device"]')).toHaveCount(0);
      await expect(page.locator(".rowsSection--todo .rowsRow")).toHaveCount(2);
      await expect(page.locator(".rowsSection--done .rowsList")).toBeHidden();
      await page.locator(".rowsSection--done .rowsSectionHead").click();
      await expect(page.locator(".rowsSection--done .rowsRow")).toHaveCount(2);
      await expect(page.locator(".rowsSection--done .rowsAct")).toHaveCount(0);
      for (const task of tasksPreview.filter(task => task.kind === "poll")) {
        const row = page.locator(`.rowsRow[data-id="${task.id}"]`);
        await expect(row).toBeVisible();
        await expect(row.locator(".rowsTitle")).toHaveText(task.title);
        const sourceIcon = "polls";
        await expect(row.locator(`.rowsAvatar svg.ico-${sourceIcon}`)).toHaveCount(1);
        await expect(row.locator(".rowsAvatar")).toHaveText("");
        for (const note of [".rowsNote--mobile", ".rowsNote--desktop"]) {
          await expect(row.locator(note)).not.toContainText(/Ankieta tekstowa|Punktacja|Ankieta punktowa/);
          await expect(row.locator(note)).toContainText(task.owner_label);
        }
        if (viewport.width <= 980) {
          await expect(row.locator(".rowsNote--desktop")).toBeHidden();
          await expect(row.locator(".rowsNote--mobile")).toBeVisible();
          await expect(row.locator(".rowsNote--mobile")).not.toContainText("11.10.2026");
          expect((await row.boundingBox()).height).toBeLessThanOrEqual(104);
          if (task.state !== "done") {
            const allActionLabelsHidden = await row.locator(".rowsActText").evaluateAll((labels) =>
              labels.every((label) => getComputedStyle(label).display === "none"));
            expect(allActionLabelsHidden).toBe(true);
            await expect(row.locator(".rowsActIcon").first()).toBeVisible();
          }
        } else {
          await expect(row.locator(".rowsNote--desktop")).toBeVisible();
          await expect(row.locator(".rowsNote--mobile")).toBeHidden();
        }
        const actions = task.state === "done" ? [] : ["vote", "decline"];
        await expect(row.locator(".rowsAct")).toHaveCount(actions.length);
        for (const action of actions) await expect(row.locator(`[data-act="${action}"]`)).toHaveAttribute("aria-label", /.+/);
      }
      const metrics = await page.evaluate(() => {
        const rect = (s) => document.querySelector(s).getBoundingClientRect();
        const first = rect(".rowsSection--todo .rowsRow");
        const second = document.querySelectorAll(".rowsSection--todo .rowsRow")[1].getBoundingClientRect();
        return {
          pageGap: rect(".tasks-card").top - rect(".bar").bottom,
          rowGap: second.top - first.bottom,
          overflow: document.documentElement.scrollWidth > innerWidth,
          noteWrap: getComputedStyle(document.querySelector(".rowsNote")).whiteSpace,
        };
      });
      expect(metrics.pageGap).toBeGreaterThanOrEqual(14);
      expect(metrics.rowGap).toBeGreaterThanOrEqual(12);
      expect(metrics.overflow).toBe(false);
      expect(metrics.noteWrap).toBe("normal");
      await page.screenshot({ path: test.info().outputPath(`tasks-${viewport.label}.png`), fullPage: true });
      fixture = [];
      await page.goto(TASKS_URL);
      await expect(page.locator(".rowsEmpty")).toBeVisible();
      await expect(page.locator(".rowsRow")).toHaveCount(0);
    } finally { await ctx.close(); }
  });
}
