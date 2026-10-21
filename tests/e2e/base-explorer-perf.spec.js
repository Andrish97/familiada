// tests/e2e/base-explorer-perf.spec.js
// Menedżer bazy na dużej bazie (E22, etap 8a): czasy wczytania, rysowania,
// filtrów i zaznaczania. Tylko lokalnie (scripts/agent-tools/local-e2e,
// LOCAL_PERF=1) — wypełnia bazę tysiącami wierszy, więc nie na produkcji.
// Wynik: linie „[perf] …” na stdout + progi, których przekroczenie to błąd.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online/bases/explorer";
const N_QUESTIONS = Number(process.env.PERF_QUESTIONS || 5000);
const N_TOP = 10;      // foldery 1. poziomu
const N_SUB = 4;       // podfoldery na folder (2. poziom)
const N_SUB2 = 5;      // podfoldery 3. poziomu na folder 2. poziomu
const N_TAGS = 20;

test.skip(!process.env.LOCAL_PERF, "tylko lokalnie: LOCAL_PERF=1 scripts/agent-tools/local-e2e/run.sh e2e/base-explorer-perf.spec.js");

async function seed(page, sizes) {
  return page.evaluate(async ({ N_QUESTIONS, N_TOP, N_SUB, N_SUB2, N_TAGS }) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const ins = async (table, rows) => {
      const out = [];
      for (let i = 0; i < rows.length; i += 1000) {
        const { data, error } = await sb.from(table).insert(rows.slice(i, i + 1000)).select("id");
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...(data || []));
      }
      return out.map((r) => r.id);
    };
    const [base] = await ins("question_bases", [{ name: `E2E-PERF-${Date.now()}`, owner_id: u.user.id }]);
    const top = await ins("qb_categories", Array.from({ length: N_TOP }, (_, i) => ({ base_id: base, parent_id: null, name: `Dział ${i + 1}`, ord: i + 1 })));
    const sub = await ins("qb_categories", top.flatMap((p, i) => Array.from({ length: N_SUB }, (_, j) => ({ base_id: base, parent_id: p, name: `Temat ${i + 1}.${j + 1}`, ord: j + 1 }))));
    const sub2 = await ins("qb_categories", sub.flatMap((p, i) => Array.from({ length: N_SUB2 }, (_, j) => ({ base_id: base, parent_id: p, name: `Zestaw ${i + 1}.${j + 1}`, ord: j + 1 }))));
    const folders = [...sub, ...sub2];
    const words = ["kot", "pies", "żółw", "dom", "szkoła", "lato", "zima", "kuchnia", "sport", "muzyka", "góry", "morze"];
    const questions = Array.from({ length: N_QUESTIONS }, (_, i) => {
      const kind = i % 3; // preparowana / punktacja / ankieta
      const answers = kind === 2 ? [] : Array.from({ length: 4 }, (_, a) => (kind === 0 ? { text: `Odp ${a + 1}`, fixed_points: 10 + a } : { text: `Odp ${a + 1}` }));
      return {
        base_id: base,
        category_id: i % 25 === 0 ? null : folders[i % folders.length],
        ord: i + 1,
        payload: { text: `Pytanie ${i + 1}: ${words[i % words.length]} i ${words[(i * 7) % words.length]}?`, answers },
      };
    });
    const qids = await ins("qb_questions", questions);
    const tags = await ins("qb_tags", Array.from({ length: N_TAGS }, (_, i) => ({ base_id: base, name: `tag${i + 1}`, color: "#4da3ff", ord: i + 1 })));
    const links = [];
    qids.forEach((q, i) => {
      links.push({ question_id: q, tag_id: tags[i % N_TAGS] });
      if (i % 2 === 0) links.push({ question_id: q, tag_id: tags[(i + 7) % N_TAGS] });
    });
    for (let i = 0; i < links.length; i += 1000) {
      const { error } = await sb.from("qb_question_tags").insert(links.slice(i, i + 1000));
      if (error) throw new Error(`qb_question_tags: ${error.message}`);
    }
    return { base, top, tags, links: links.length };
  }, sizes);
}

// Czas od akcji do spełnienia warunku na stronie (ms).
async function timed(page, label, act, until) {
  const t0 = Date.now();
  await act();
  await until();
  const ms = Date.now() - t0;
  console.log(`[perf] ${label}: ${ms} ms`);
  return ms;
}

test("duża baza: wczytanie, rysowanie, filtry i zaznaczanie mieszczą się w progach", async ({ page, context }) => {
  test.setTimeout(300_000);
  await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(`${BASE_URL}?id=00000000-0000-0000-0000-000000000000`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 30000 });
  const s = await seed(page, { N_QUESTIONS, N_TOP, N_SUB, N_SUB2, N_TAGS });
  console.log(`[perf] dane: ${N_QUESTIONS} pytań, ${N_TOP + N_TOP * N_SUB + N_TOP * N_SUB * N_SUB2} folderów, ${N_TAGS} tagów, ${s.links} przypisań`);

  try {
    const rows = page.locator("#list tbody tr.row");
    const load = await timed(page, "wczytanie strony do listy", () => page.goto(`${BASE_URL}?id=${s.base}`, { waitUntil: "domcontentloaded" }),
      () => expect(rows.first()).toBeVisible({ timeout: 60000 }));

    // pełna lista: wszystkie pytania przez tag w wynikach (~połowa bazy)
    const search = page.locator("#searchText");
    const before = await rows.count();
    // z opóźnieniem pisania 200 ms (ui/search.js)
    const filterText = await timed(page, "filtr tekstowy (cała baza, z opóźnieniem 200 ms)", () => search.fill("żółw"),
      async () => {
        await expect(page.locator("#breadcrumbs .crumb-results")).toBeVisible({ timeout: 30000 });
        await expect.poll(() => rows.count(), { timeout: 30000 }).not.toBe(before);
      });
    const nText = await rows.count();
    console.log(`[perf]   wierszy po filtrze tekstowym: ${nText}`);

    await search.fill("");
    await expect.poll(() => rows.count(), { timeout: 30000 }).toBeLessThan(500);
    await page.locator('[data-left-view="tags"]:visible').first().click(); // lewy panel: widok tagów
    const filterTag = await timed(page, "filtr tagu (klik w lewym panelu)", () => page.locator(`#tags .row[data-kind="tag"][data-id="${s.tags[0]}"]`).click(),
      () => expect(page.locator(`#tags .row[data-kind="tag"][data-id="${s.tags[0]}"]`)).toHaveClass(/is-selected/, { timeout: 30000 }));
    console.log(`[perf]   wierszy po filtrze tagu: ${await rows.count()}`);

    const select = await timed(page, "klik w wiersz (zaznaczenie)", () => rows.nth(5).click(),
      () => expect(rows.nth(5)).toHaveClass(/is-selected/, { timeout: 10000 }));
    const nRows = await rows.count();
    const selectAll = await timed(page, "Ctrl+A", () => page.keyboard.press("Control+a"),
      () => expect(page.locator("#list tr.row.is-selected")).toHaveCount(nRows, { timeout: 10000 }));

    await page.locator("#searchSubmitBtn").click(); // czyści filtr
    const openFolder = await timed(page, "otwarcie folderu (dwuklik)", () => page.locator(`#list .row[data-kind="cat"][data-id="${s.top[0]}"]`).dblclick(),
      () => expect(page.locator("#breadcrumbs .crumb[data-kind=\"crumb\"]")).toHaveCount(1, { timeout: 10000 }));

    // punkt odniesienia: jedno małe zapytanie w tym środowisku (narzut
    // przekierowania zapytań przez lokalne e2e, nie kod strony)
    const rpcMs = await page.evaluate(async (id) => {
      const t0 = performance.now();
      await window.__sbClient.rpc("qb_trash_list", { p_base_id: id });
      return Math.round(performance.now() - t0);
    }, s.base);
    console.log(`[perf] jedno małe zapytanie RPC (narzut środowiska): ${rpcMs} ms`);

    // okna na dużym zaznaczeniu: tagi (stan przypisań) i „Utwórz grę”
    await page.locator('#breadcrumbs .crumb[data-kind="root"]').click();
    const bigFolder = page.locator(`#list .row[data-kind="cat"][data-id="${s.top[0]}"]`);
    await bigFolder.click();
    const tagsWin = await timed(page, "okno tagów dla dużego folderu (Ctrl+T)", () => page.keyboard.press("Control+t"),
      () => expect(page.locator("#tagsAssignList input[type=\"checkbox\"]").first()).toBeVisible({ timeout: 30000 }));
    await page.locator("#tagsL1Close").click();
    await expect(page.locator("#tagsOverlay")).toBeHidden({ timeout: 10000 });
    await bigFolder.click();
    const gameWin = await timed(page, "okno Utwórz grę (Ctrl+G)", () => page.keyboard.press("Control+g"),
      () => expect(page.locator("#xList .xPickItem").first()).toBeVisible({ timeout: 60000 }));
    console.log(`[perf]   pozycji w oknie gry: ${await page.locator("#xList .xPickItem").count()}`);
    await page.locator("#xClose").click();

    // progi: wczytanie z lokalnej bazy i rysowanie — żeby wyłapać regresję
    expect(load, "wczytanie").toBeLessThan(8000);
    expect(filterText, "filtr tekstowy").toBeLessThan(2500);
    expect(filterTag, "filtr tagu").toBeLessThan(2500);
    expect(select, "zaznaczenie").toBeLessThan(500);
    expect(selectAll, "Ctrl+A").toBeLessThan(1000);
    expect(openFolder, "otwarcie folderu").toBeLessThan(1000);
    expect(tagsWin, "okno tagów").toBeLessThan(3000);
    expect(gameWin, "okno gry").toBeLessThan(3000);
  } finally {
    await page.evaluate(async (id) => { await window.__sbClient.from("question_bases").delete().eq("id", id); }, s.base);
  }
});
