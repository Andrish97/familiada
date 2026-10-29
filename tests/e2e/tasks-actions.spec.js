// Zadania (podręcznik 15.4, 20.2 „Zadanie”): akcje wiersza i ich wersje
// „źle/podejrzanie”: [Odrzuć] z [Anuluj], błąd odrzucenia, [Głosuj] z tokenem
// ze znakami specjalnymi, ?t= z nieznanym tokenem, tytuł i nadawca z HTML.
// Kontrolowane dane RPC (tasks_list, polls_hub_task_decline), prawdziwy HTML,
// moduły i logowanie; kod strony z brancha. Wygląd i błąd odczytu: tasks.spec.js.
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", needs: { standard: 1 } });

const ORIGIN = "https://www.familijna.app";
const XSS = "<img src=x onerror=window.__xssHit=1>";
const base = { owner_label: "Agnieszka", created_at: "2026-10-11T09:00:00Z", kind: "poll" };
const fixture = () => [
  { ...base, id: "t-text", state: "todo", poll_type: "poll_text", title: "Rodzinny wieczór", token: "tok&x=1/?#" },
  { ...base, id: "t-points", state: "todo", poll_type: "poll_points", title: `Ankieta ${XSS}`, owner_label: XSS, token: "tok-points" },
  { ...base, id: "t-done", state: "done", done_at: "2026-10-12T09:00:00Z", poll_type: "poll_text", title: "Zrobiona", token: "tok-done" },
  // Rodzaje spoza ankiet (dawne zadania baz/urządzeń) nie trafiają na listę.
  { ...base, id: "t-base", kind: "base", state: "todo", title: "Baza", token: "tok-base" },
];

async function openTasks(page, query = "", { declineResult = true } = {}) {
  let rows = fixture();
  const declined = [];
  await page.route("**/rest/v1/rpc/tasks_list", (route) => route.fulfill({ json: rows }));
  await page.route("**/rest/v1/rpc/polls_hub_task_decline", async (route) => {
    declined.push(JSON.parse(route.request().postData() || "{}").p_task_id);
    if (declineResult) rows = rows.filter((r) => r.id !== declined.at(-1));
    await route.fulfill({ json: declineResult });
  });
  await page.goto(`${ORIGIN}/tasks/${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".rowsRow").first()).toBeVisible({ timeout: 20000 });
  return declined;
}

test.beforeEach(async ({ page, context, accounts, loginAs }) => {
  await serveBranchCode(context, { pages: ["tasks"] });
  await page.setViewportSize({ width: 1400, height: 900 });
  await loginAs(page, context, accounts.standard[0]);
});

test("[Odrzuć]: [Anuluj] zostawia zadanie, potwierdzenie usuwa je z listy; tylko ankiety na liście", async ({ page }) => {
  const declined = await openTasks(page);
  await expect(page.locator(".rowsRow")).toHaveCount(3);
  await expect(page.locator('.rowsRow[data-kind="base"]')).toHaveCount(0);
  const row = page.locator('.rowsRow[data-id="t-text"]');
  await row.locator('[data-act="decline"]').click();
  const dialog = page.locator(".uni-modal:visible");
  await expect(dialog).toContainText("Odrzucić zadanie?");
  await expect(dialog).toContainText("Ankieta zniknie z Twojej listy.");
  await dialog.getByRole("button", { name: "Anuluj" }).click();
  await expect(row).toBeVisible();
  expect(declined).toEqual([]);

  await row.locator('[data-act="decline"]').click();
  await page.locator(".uni-modal:visible .uni-foot .btn.gold").click();
  await expect(row).toHaveCount(0);
  expect(declined).toEqual(["t-text"]);
  // Zrobione: bez akcji.
  await page.locator(".rowsSection--done .rowsSectionHead").click();
  await expect(page.locator('.rowsRow[data-id="t-done"] .rowsAct')).toHaveCount(0);
});

test("[Odrzuć] nieudane: komunikat, zadanie zostaje", async ({ page }) => {
  await openTasks(page, "", { declineResult: false });
  const row = page.locator('.rowsRow[data-id="t-points"]');
  await row.locator('[data-act="decline"]').click();
  await page.locator(".uni-modal:visible .uni-foot .btn.gold").click();
  await expect(page.locator(".app-toast-text")).toHaveText("Nie udało się odrzucić zadania.", { timeout: 10000 });
  await expect(row).toBeVisible();
});

test("[Głosuj] otwiera właściwą stronę głosowania z zakodowanym tokenem; tytuł i nadawca z HTML jako tekst", async ({ page }) => {
  await openTasks(page);
  const points = page.locator('.rowsRow[data-id="t-points"]');
  await expect(points.locator(".rowsTitle")).toHaveText(`Ankieta ${XSS}`);
  await expect(points.locator(".rowsNote--desktop")).toContainText(XSS);
  expect(await page.evaluate(() => ({ hit: window.__xssHit || 0, img: document.querySelectorAll('img[src="x"]').length }))).toEqual({ hit: 0, img: 0 });

  await page.route("**/polls/vote/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>vote</title>" }));
  await page.locator('.rowsRow[data-id="t-text"] [data-act="vote"]').click();
  await page.waitForURL(/\/polls\/vote\/text\//);
  const url = new URL(page.url());
  expect(url.searchParams.get("t")).toBe("tok&x=1/?#");
  expect(url.searchParams.get("x")).toBeNull();
  expect(url.hash).toBe("");
  await page.goBack();
  await expect(page.locator(".rowsRow").first()).toBeVisible({ timeout: 20000 });
  await page.locator('.rowsRow[data-id="t-points"] [data-act="vote"]').click();
  await page.waitForURL(/\/polls\/vote\/points\/\?t=tok-points/);
});

test("?t= z maila: znany token wyróżnia wiersz, nieznany i podejrzany niczego nie psują; parametr znika z adresu", async ({ page }) => {
  await openTasks(page, "?t=tok-points");
  await expect(page.locator('.rowsRow[data-id="t-points"]')).toHaveClass(/rowsFocus/);
  await expect.poll(() => new URL(page.url()).searchParams.get("t")).toBeNull();

  for (const token of ["nieznany", `"]<x>`, "tok-done"]) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${ORIGIN}/tasks/?t=${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".rowsRow").first()).toBeVisible({ timeout: 20000 });
    await expect.poll(() => new URL(page.url()).searchParams.get("t"), token).toBeNull();
    expect(errors, token).toEqual([]);
  }
  // Zadanie zrobione: sekcja „Zrobione” rozwinięta, wiersz wyróżniony.
  await expect(page.locator('.rowsRow[data-id="t-done"]')).toHaveClass(/rowsFocus/);
  await expect(page.locator('.rowsRow[data-id="t-done"]')).toBeVisible();
});
