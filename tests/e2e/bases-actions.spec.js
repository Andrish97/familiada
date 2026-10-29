// tests/e2e/bases-actions.spec.js
//
// Czynności z podręcznika, rozdział 9 (Bazy pytań), których nie sprawdzały
// bases.spec.js i base-explorer.spec.js — razem z wariantem „źle/podejrzanie”:
// Enter/Backspace w folderach, Ctrl/Shift przy zaznaczaniu, Anuluj przy
// usuwaniu, [Odśwież widok] i Ctrl+Alt+R, Ctrl+G, zasięg wyszukiwania,
// czynności niedostępne w wynikach, przeciąganie (Ctrl = kopia, „Folder główny”,
// tag), zasady nazw tagów, skróty czytelnika, nazwy z HTML, nazwy
// z pominięciem strony oraz lista baz (Anuluj, 80 znaków, baza udostępniona).
//
// Strony z kodu brancha (serveBranchCode), baza i konta produkcyjne.
// Lokalnie: scripts/agent-tools/local-e2e/run.sh e2e/bases-actions.spec.js
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");
const { acceptBaseShare } = require("./helpers/base-sharing");

test.use({ serviceWorkers: "block", viewport: { width: 1400, height: 900 }, needs: { standard: 2 } });

const ORIGIN = "https://www.familijna.app";
const EXPLORER = `${ORIGIN}/bases/explorer`;
const PREFIX = "E2E-BA-";
const PAGES = ["bases", "bases/explorer"];
const branch = process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0";

test.beforeEach(async ({ context }) => {
  if (branch) await serveBranchCode(context, { pages: PAGES });
});

/* ================= dane (bezpośrednio przez window.__sbClient) ================= */

async function createBase(page, label) {
  return page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb.from("question_bases").insert({ name, owner_id: u.user.id }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, `${PREFIX}${label}-${Date.now()}`);
}

async function deleteBases(page) {
  await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(async (prefix) => {
    await window.__sbClient?.from("question_bases").delete().like("name", `${prefix}%`);
  }, PREFIX).catch(() => {});
}

async function addFolder(page, baseId, name, parentId = null, ord = 1) {
  return page.evaluate(async (row) => {
    const { data, error } = await window.__sbClient.from("qb_categories").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, { base_id: baseId, parent_id: parentId, name, ord });
}

async function addQuestion(page, baseId, text, { folderId = null, ord = 1, answers = [] } = {}) {
  return page.evaluate(async (row) => {
    const { data, error } = await window.__sbClient.from("qb_questions").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, { base_id: baseId, category_id: folderId, ord, payload: { text, answers } });
}

async function addTag(page, baseId, name, color = "#4da3ff") {
  return page.evaluate(async (row) => {
    const { data, error } = await window.__sbClient.from("qb_tags").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, { base_id: baseId, name, color, ord: 1 });
}

const questions = (page, baseId) => page.evaluate(async (baseId) => {
  const { data } = await window.__sbClient.from("qb_questions").select("id,category_id,payload").eq("base_id", baseId);
  return (data || []).map((r) => ({ id: r.id, folder: r.category_id, text: r.payload?.text })).sort((a, b) => a.text.localeCompare(b.text));
}, baseId);
const folders = (page, baseId) => page.evaluate(async (baseId) => {
  const { data } = await window.__sbClient.from("qb_categories").select("id,parent_id,name").eq("base_id", baseId);
  return (data || []).sort((a, b) => a.name.localeCompare(b.name));
}, baseId);
const tagsOf = (page, qid) => page.evaluate(async (qid) => {
  const { data } = await window.__sbClient.from("qb_question_tags").select("tag_id").eq("question_id", qid);
  return (data || []).map((r) => r.tag_id);
}, qid);

/* ================= strona ================= */

const qRow = (page, id) => page.locator(`#list .row[data-kind="q"][data-id="${id}"]`);
const fRow = (page, id) => page.locator(`#list .row[data-kind="cat"][data-id="${id}"]`);
const act = (page, name) => page.locator(`#toolbar button[data-act="${name}"]`);
const selectedCount = (page) => page.locator("#list .row.is-selected").count();

async function openBase(page, baseId) {
  await page.goto(`${EXPLORER}?id=${baseId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#list .row, #list .list-empty").first()).toBeVisible({ timeout: 20000 });
}

async function search(page, text) {
  await page.locator("#searchText").fill(text);
  await page.locator("#searchText").press("Enter");
}

// Zdarzenia przeciągania wprost (jak simulateDragDrop w base-explorer.spec.js:
// natywne dragTo zawieszało się w headless Chromium).
async function dragDrop(page, source, target, { ctrl = false } = {}) {
  await page.evaluate(({ source, target, ctrl }) => {
    const dt = new DataTransfer();
    const fire = (type, sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`dragDrop: brak ${sel}`);
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new DragEvent(type, {
        bubbles: true, cancelable: true, composed: true, dataTransfer: dt, ctrlKey: ctrl,
        clientX: r.left + r.width / 2, clientY: r.top + Math.min(r.height / 2, 200),
      }));
    };
    fire("dragstart", source);
    fire("dragenter", target);
    fire("dragover", target);
    fire("drop", target);
    fire("dragend", source);
  }, { source, target, ctrl });
}

async function dismissAlert(page, text) {
  const modal = page.locator(".uni-modal");
  await expect(modal).toContainText(text, { timeout: 5000 });
  await page.locator(".uni-modal .uni-foot .btn.gold").click();
  await expect(modal).toHaveCount(0);
}

test.afterEach(async ({ page }) => { await deleteBases(page); });

/* ================= 9.2 nawigacja i zaznaczanie ================= */

test("Enter otwiera folder, Backspace wraca wyżej; Backspace w polu wyszukiwania nie zmienia folderu", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "nav");
  const outer = await addFolder(page, baseId, "Zewnętrzny");
  const inner = await addFolder(page, baseId, "Wewnętrzny", outer);
  const deep = await addQuestion(page, baseId, "Głęboko", { folderId: inner });
  await openBase(page, baseId);

  await fRow(page, outer).click();
  await page.keyboard.press("Enter");
  await expect(fRow(page, inner)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`folder=${outer}`));
  await fRow(page, inner).click();
  await page.keyboard.press("Enter");
  await expect(qRow(page, deep)).toBeVisible();

  // Backspace w polu wyszukiwania kasuje znak, folder zostaje
  await page.locator("#searchText").fill("ab");
  await page.locator("#searchText").press("Backspace");
  await expect(page.locator("#searchText")).toHaveValue("a");
  await expect(page).toHaveURL(new RegExp(`folder=${inner}`));
  await page.locator("#searchText").fill("");
  await page.locator("#searchText").press("Enter");
  await page.locator("#searchText").blur();

  await page.keyboard.press("Backspace");
  await expect(fRow(page, inner)).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(fRow(page, outer)).toBeVisible();
  await expect(page).not.toHaveURL(/folder=/);
  // w Folderze głównym Backspace nic nie robi
  await page.keyboard.press("Backspace");
  await expect(fRow(page, outer)).toBeVisible();
});

test("Ctrl+klik dokłada i zdejmuje element z zaznaczenia, Shift+klik zaznacza zakres", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "select");
  const ids = [];
  for (let i = 1; i <= 5; i++) ids.push(await addQuestion(page, baseId, `Pytanie ${i}`, { ord: i }));
  await openBase(page, baseId);
  const rows = page.locator('#list .row[data-kind="q"]');
  await expect(rows).toHaveCount(5);

  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ["Control"] });
  expect(await selectedCount(page)).toBe(2);
  await rows.nth(2).click({ modifiers: ["Control"] });
  expect(await selectedCount(page)).toBe(1);

  await rows.nth(1).click();
  await rows.nth(3).click({ modifiers: ["Shift"] });
  expect(await selectedCount(page)).toBe(3);
  await expect(rows.nth(0)).not.toHaveClass(/is-selected/);
  await expect(rows.nth(4)).not.toHaveClass(/is-selected/);

  // zwykły klik zastępuje zaznaczenie
  await rows.nth(4).click();
  expect(await selectedCount(page)).toBe(1);
});

/* ================= 9.3 narzędzia ================= */

test("Usuń: Anuluj w potwierdzeniu nic nie usuwa i nie wkłada do Kosza", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "delcancel");
  const qid = await addQuestion(page, baseId, "Zostaję");
  await openBase(page, baseId);
  await qRow(page, qid).click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".uni-modal .mSub")).toContainText("kosza");
  await page.locator(".uni-modal .uni-foot .btn:not(.gold)").click();
  await expect(page.locator(".uni-modal")).toHaveCount(0);
  await expect(qRow(page, qid)).toBeVisible();
  expect(await questions(page, baseId)).toHaveLength(1);
  const trash = await page.evaluate(async (baseId) => (await window.__sbClient.from("qb_trash").select("id").eq("base_id", baseId)).data?.length ?? -1, baseId);
  expect(trash).toBe(0);
});

test("[Odśwież widok] i Ctrl+Alt+R pokazują zmiany zrobione gdzie indziej", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "refresh");
  await addQuestion(page, baseId, "Pierwsze");
  await openBase(page, baseId);
  const second = await addQuestion(page, baseId, "Dodane w innej karcie", { ord: 2 });
  await page.waitForTimeout(500);
  await expect(qRow(page, second)).toHaveCount(0); // bez odświeżenia (lokalnie bez realtime) nie widać
  await act(page, "refreshView").click();
  await expect(qRow(page, second)).toBeVisible({ timeout: 10000 });

  const third = await addQuestion(page, baseId, "Trzecie z zewnątrz", { ord: 3 });
  await page.locator("#list").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Control+Alt+KeyR");
  await expect(qRow(page, third)).toBeVisible({ timeout: 10000 });
});

test("Ctrl+G otwiera „Utwórz grę” z zaznaczonym pytaniem; bez zaznaczenia nic się nie otwiera", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "ctrlg");
  const qid = await addQuestion(page, baseId, "Do gry");
  await addQuestion(page, baseId, "Nie do gry", { ord: 2 });
  await openBase(page, baseId);
  await page.locator("#list").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+KeyG");
  await page.waitForTimeout(400);
  await expect(page.locator("#exportOverlay")).toBeHidden();

  await qRow(page, qid).click();
  await page.keyboard.press("Control+KeyG");
  await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#xList")).toContainText("Do gry");
  await expect(page.locator("#xList")).not.toContainText("Nie do gry");
  await page.locator("#xClose").click();
  await expect(page.locator("#exportOverlay")).toBeHidden();
});

/* ================= 9.5 wyszukiwanie ================= */

test("wyszukiwanie: bez względu na wielkość liter, bez odpowiedzi; w podfolderze tylko jego zawartość", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "search");
  const sport = await addFolder(page, baseId, "Sport");
  const inSport = await addQuestion(page, baseId, "Ulubiona DRUŻYNA", { folderId: sport });
  const atRoot = await addQuestion(page, baseId, "Drużyna z podwórka", { ord: 2 });
  const byAnswer = await addQuestion(page, baseId, "Co jemy rano", { ord: 3, answers: [{ text: "drużyna" }] });
  await openBase(page, baseId);

  // folder, w którym pasują wszystkie pytania, pokazuje się w wynikach jako folder
  await search(page, "drużyna");
  await expect(fRow(page, sport)).toBeVisible();
  await expect(qRow(page, atRoot)).toBeVisible();
  await expect(qRow(page, byAnswer), "odpowiedzi nie są przeszukiwane").toHaveCount(0);

  // wejście w folder z wyników: wyniki tylko z tego folderu
  await page.locator("#searchText").fill("");
  await page.locator("#searchText").press("Enter");
  await fRow(page, sport).dblclick();
  await expect(qRow(page, inSport)).toBeVisible();
  await addQuestion(page, baseId, "Inne w sporcie", { folderId: sport, ord: 2 });
  await act(page, "refreshView").click();
  await search(page, "DRUŻYNA");
  await expect(qRow(page, inSport)).toBeVisible();
  await expect(qRow(page, atRoot)).toHaveCount(0);
  await expect(page.locator('#list .row[data-kind="q"]')).toHaveCount(1);
});

test("wyniki wyszukiwania: bez Wklej, Duplikuj i Nowy folder; Ctrl+V tłumaczy dlaczego; wycięte pytanie wkleja się w folderze", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "results");
  const target = await addFolder(page, baseId, "Cel");
  const qid = await addQuestion(page, baseId, "Szukane pytanie", { ord: 2 });
  await openBase(page, baseId);

  await search(page, "szukane");
  await expect(qRow(page, qid)).toBeVisible();
  await qRow(page, qid).click();
  await expect(act(page, "cut")).toBeEnabled();
  for (const name of ["paste", "duplicate", "newFolder", "newQuestion"]) await expect(act(page, name), name).toBeHidden();

  await page.keyboard.press("Control+KeyX");
  await page.keyboard.press("Control+KeyV");
  await dismissAlert(page, "Tej akcji nie ma w wynikach wyszukiwania i filtrów.");
  expect((await questions(page, baseId))[0].folder).toBeNull();

  // po wyczyszczeniu wyszukiwania wklejenie w folderze przenosi pytanie
  await page.locator("#searchText").fill("");
  await page.locator("#searchText").press("Enter");
  await fRow(page, target).dblclick();
  await expect(act(page, "paste")).toBeEnabled();
  await act(page, "paste").click();
  await expect(qRow(page, qid)).toBeVisible({ timeout: 10000 });
  expect((await questions(page, baseId))[0].folder).toBe(target);
});

/* ================= 9.3 przeciąganie ================= */

test("przeciąganie: z Ctrl kopiuje, na „Folder główny” przenosi do głównego, na tag nadaje tag całemu folderowi; w wynikach tło nic nie robi", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "dnd");
  const box = await addFolder(page, baseId, "Pudło", null, 1);
  const sub = await addFolder(page, baseId, "Podfolder", box, 1);
  const nested = await addQuestion(page, baseId, "Zagnieżdżone", { folderId: sub });
  const loose = await addQuestion(page, baseId, "Luźne", { ord: 2 });
  const tag = await addTag(page, baseId, "sport");
  await openBase(page, baseId);

  // Ctrl + upuszczenie na folder = kopia (oryginał zostaje)
  await dragDrop(page, `#list .row[data-kind="q"][data-id="${loose}"]`, `#list .row[data-kind="cat"][data-id="${box}"]`, { ctrl: true });
  await expect.poll(async () => (await questions(page, baseId)).filter((q) => q.text === "Luźne").length).toBe(2);
  await expect(qRow(page, loose)).toBeVisible();

  // z folderu na „Folder główny” w drzewie = przeniesienie do głównego
  await fRow(page, box).dblclick();
  await fRow(page, sub).dblclick();
  await expect(qRow(page, nested)).toBeVisible();
  await dragDrop(page, `#list .row[data-kind="q"][data-id="${nested}"]`, '#tree .row[data-kind="root"]');
  await expect.poll(async () => (await questions(page, baseId)).find((q) => q.id === nested).folder).toBeNull();

  // folder upuszczony na tag: tag dostają pytania z podfolderów
  await page.locator('#breadcrumbs .crumb[data-kind="root"]').click();
  const subQ = await addQuestion(page, baseId, "W podfolderze", { folderId: sub, ord: 5 });
  await act(page, "refreshView").click();
  await page.locator('[data-left-view="tags"]:visible').first().click();
  await expect(page.locator(`#tags .row[data-kind="tag"]`)).toHaveCount(1);
  await dragDrop(page, `#list .row[data-kind="cat"][data-id="${box}"]`, `#tags .row[data-kind="tag"][data-id="${tag}"]`);
  await expect.poll(() => tagsOf(page, subQ)).toEqual([tag]);
  expect(await tagsOf(page, loose), "pytanie spoza folderu bez tagu").toEqual([]);

  // w wynikach wyszukiwania upuszczenie na tło listy nic nie przenosi
  await search(page, "luźne");
  const before = await questions(page, baseId);
  await dragDrop(page, `#list .row[data-kind="q"][data-id="${loose}"]`, "#list");
  await page.waitForTimeout(800);
  expect(await questions(page, baseId)).toEqual(before);
});

/* ================= 9.4 tagi ================= */

test("tag: nazwa ze spacją albo ze znakami spoza liter, cyfr i _ odrzucona; najwyżej 40 znaków", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "tagnames");
  const qid = await addQuestion(page, baseId, "Z tagiem");
  await openBase(page, baseId);
  await qRow(page, qid).click();
  await page.keyboard.press("Control+KeyT");
  await expect(page.locator("#tagsL1")).toBeVisible({ timeout: 5000 });
  await page.locator("#tagsAddNew").click();
  await expect(page.locator("#tagsL2")).toBeVisible();

  const name = page.locator("#tagsEditName");
  const err = page.locator("#tagsEditErr");
  await name.fill("dwa słowa");
  await page.locator("#tagsL2Save").click();
  await expect(err).toHaveText("Nazwa nie może zawierać spacji. Użyj _ zamiast spacji.");
  await name.fill("a-b<script>");
  await page.locator("#tagsL2Save").click();
  await expect(err).toHaveText("Dozwolone znaki: litery, cyfry i _");
  const tagsCount = () => page.evaluate(async (baseId) => (await window.__sbClient.from("qb_tags").select("id").eq("base_id", baseId)).data.length, baseId);
  expect(await tagsCount()).toBe(0);

  await name.fill("x".repeat(60));
  await expect(name).toHaveValue("x".repeat(40));
  await page.locator("#tagsL2Save").click();
  await expect(page.locator("#tagsL1")).toBeVisible({ timeout: 5000 });
  const saved = await page.evaluate(async (baseId) => (await window.__sbClient.from("qb_tags").select("name").eq("base_id", baseId)).data.map((r) => r.name), baseId);
  expect(saved).toEqual(["x".repeat(40)]);
});

/* ================= czytelnik ================= */

test("czytelnik: Ctrl+N, Ctrl+Shift+N, F2 i Delete mówią „Masz tylko podgląd tej bazy.” i nic nie zapisują", async ({ page, context, browser, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "viewer");
  const qid = await addQuestion(page, baseId, "Cudze pytanie");
  const viewerContext = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" });
  try {
    if (branch) await serveBranchCode(viewerContext, { pages: PAGES });
    const viewer = await viewerContext.newPage();
    await loginAs(viewer, viewerContext, accounts.standard[1]);
    const viewerId = await viewer.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    await acceptBaseShare(page, viewer, baseId, viewerId, "viewer");
    await openBase(viewer, baseId);
    await expect(qRow(viewer, qid)).toBeVisible();

    await viewer.locator("#list").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await viewer.keyboard.press("Control+KeyN");
    await dismissAlert(viewer, "Masz tylko podgląd tej bazy.");
    await viewer.keyboard.press("Control+Shift+KeyN");
    await dismissAlert(viewer, "Masz tylko podgląd tej bazy.");
    await qRow(viewer, qid).click();
    await viewer.keyboard.press("F2");
    await dismissAlert(viewer, "Masz tylko podgląd tej bazy.");
    await viewer.keyboard.press("Delete");
    await dismissAlert(viewer, "Masz tylko podgląd tej bazy.");

    expect(await questions(page, baseId)).toEqual([{ id: qid, folder: null, text: "Cudze pytanie" }]);
    expect(await folders(page, baseId)).toEqual([]);
  } finally {
    await viewerContext.close();
  }
});

/* ================= podejrzane dane ================= */

test("nazwy z HTML w eksploratorze (folder, pytanie, tag): widać tekst, nic się nie wykonuje", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "xss");
  const xss = "<img src=x onerror=__xssHit=1>";
  const folder = await addFolder(page, baseId, `F ${xss}`);
  const qid = await addQuestion(page, baseId, `Q ${xss}`.slice(0, 100), { ord: 2 });
  // tag z pominięciem strony (okno tagów takiej nazwy nie przyjmie)
  await addTag(page, baseId, `T${xss}`);
  await openBase(page, baseId);
  await page.locator('[data-left-view="tags"]:visible').first().click();
  await expect(fRow(page, folder)).toContainText("<img src=x");
  await expect(qRow(page, qid)).toContainText("<img src=x");
  await expect(page.locator('#tags .row[data-kind="tag"]')).toContainText("<img src=x");
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({ hit: window.__xssHit || 0, injected: document.querySelectorAll('img[src="x"]').length }));
  expect(state).toEqual({ hit: 0, injected: 0 });
});

test("zapis z pominięciem strony: pytanie dłuższe niż 100 znaków i 7 odpowiedzi odrzucone przez serwer", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "direct");
  const errors = await page.evaluate(async (baseId) => {
    const sb = window.__sbClient;
    const ins = (payload) => sb.from("qb_questions").insert({ base_id: baseId, ord: 1, payload });
    const long = await ins({ text: "x".repeat(101), answers: [] });
    const many = await ins({ text: "ok", answers: Array.from({ length: 7 }, (_, i) => ({ text: `a${i}` })) });
    const pts = await ins({ text: "ok", answers: [{ text: "a", fixed_points: 500 }] });
    return [long.error?.message, many.error?.message, pts.error?.message];
  }, baseId);
  expect(errors[0]).toContain("questionTooLong");
  expect(errors[1]).toContain("tooManyAnswers");
  expect(errors[2]).toContain("points");
  expect(await questions(page, baseId)).toEqual([]);
});

// Błąd do naprawy w bazie (nie migracją w tym etapie): okno tagów i RPC
// qb_save_tag pilnują nazwy tagu (litery, cyfry, _, do 40 znaków), ale
// polityka qb_tags_write pozwala wstawić tag wprost do tabeli z dowolną nazwą;
// nazwa folderu (qb_categories.name) nie ma żadnego limitu. test.fail: gdy
// baza zacznie odrzucać takie zapisy, Playwright zgłosi „nieoczekiwanie
// przeszedł” — wtedy usunąć test.fail.
test("zapis z pominięciem strony: tag ze spacją lub 5000 znaków i folder o nazwie 5000 znaków odrzucone", async ({ page, context, accounts, loginAs }) => {
  test.fail(true, "brak strażnika w bazie: qb_tags.name i qb_categories.name (raport bases-actions)");
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "directtag");
  const errors = await page.evaluate(async (baseId) => {
    const sb = window.__sbClient;
    const a = await sb.from("qb_tags").insert({ base_id: baseId, name: "dwa słowa", color: "#4da3ff", ord: 1 });
    const b = await sb.from("qb_tags").insert({ base_id: baseId, name: "y".repeat(5000), color: "#4da3ff", ord: 2 });
    const c = await sb.from("qb_categories").insert({ base_id: baseId, parent_id: null, name: "z".repeat(5000), ord: 1 });
    return [a.error?.message || null, b.error?.message || null, c.error?.message || null];
  }, baseId);
  console.log(`[e2e-diag] zapisy wprost (błąd = odrzucone): ${JSON.stringify(errors.map((e) => (e ? e.slice(0, 60) : null)))}`);
  expect(errors.every(Boolean), JSON.stringify(errors)).toBe(true);
});

/* ================= 9.1 lista baz ================= */

test("Nowa baza: Anuluj nic nie tworzy, nazwa dłuższa niż 80 znaków jest ucinana", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  await page.goto(`${ORIGIN}/bases/`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mineGrid .addCard")).toBeVisible({ timeout: 20000 });
  const count = () => page.evaluate(async (prefix) => (await window.__sbClient.from("question_bases").select("id").like("name", `${prefix}%`)).data.length, PREFIX);

  await page.locator("#mineGrid .addCard").click();
  await page.fill(".uni-modal .uni-inp", `${PREFIX}anulowana`);
  await page.locator(".uni-modal .uni-foot .btn:not(.gold)").click();
  await expect(page.locator(".uni-modal")).toHaveCount(0);
  expect(await count()).toBe(0);

  const long = `${PREFIX}${"d".repeat(120)}`;
  await page.locator("#mineGrid .addCard").click();
  await page.fill(".uni-modal .uni-inp", long);
  await expect(page.locator(".uni-modal .uni-inp")).toHaveValue(long.slice(0, 80));
  await page.locator(".uni-modal .uni-foot .btn.gold").click();
  await expect(page.locator(".uni-modal")).toHaveCount(0);
  await expect(page.locator("#mineGrid .card").filter({ hasText: long.slice(0, 80) })).toBeVisible({ timeout: 10000 });
  expect(await count()).toBe(1);
});

test("baza udostępniona do odczytu: bez zmiany nazwy i kosza (X = „Usuń z listy”), filtr ról pokazuje ją tylko przy „Odczyt”", async ({ page, context, browser, accounts, loginAs }) => {
  test.setTimeout(90_000);
  await loginAs(page, context, accounts.standard[0]);
  const baseId = await createBase(page, "sharedlist");
  const baseName = await page.evaluate(async (id) => (await window.__sbClient.from("question_bases").select("name").eq("id", id).single()).data.name, baseId);
  const viewerContext = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" });
  try {
    if (branch) await serveBranchCode(viewerContext, { pages: PAGES });
    const viewer = await viewerContext.newPage();
    await loginAs(viewer, viewerContext, accounts.standard[1]);
    const viewerId = await viewer.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    await acceptBaseShare(page, viewer, baseId, viewerId, "viewer");

    await viewer.goto(`${ORIGIN}/bases/?role=viewer`, { waitUntil: "domcontentloaded" });
    await viewer.locator("#tabBasesShared").click();
    const tile = viewer.locator("#sharedGrid .card").filter({ hasText: baseName });
    await expect(tile).toBeVisible({ timeout: 20000 });
    await expect(tile.locator(".x")).toHaveAttribute("data-tooltip", "Usuń z listy");

    await tile.locator(".name").dblclick();
    await viewer.waitForTimeout(500);
    await expect(viewer.locator(".uni-modal .uni-inp")).toHaveCount(0);

    // właściciel nie zobaczy zmiany nazwy z bezpośredniego zapisu czytelnika
    const err = await viewer.evaluate(async (id) => {
      const { data, error } = await window.__sbClient.from("question_bases").update({ name: "przejęta" }).eq("id", id).select("id");
      return error ? "error" : String(data?.length ?? 0);
    }, baseId);
    expect(["error", "0"]).toContain(err);
    expect(await page.evaluate(async (id) => (await window.__sbClient.from("question_bases").select("name").eq("id", id).single()).data.name, baseId)).toBe(baseName);

    await viewer.goto(`${ORIGIN}/bases/?role=owner`, { waitUntil: "domcontentloaded" });
    await viewer.locator("#tabBasesShared").click();
    await expect(viewer.locator("#sharedGrid .card").filter({ hasText: baseName })).toBeHidden({ timeout: 10000 });
  } finally {
    await viewerContext.close();
  }
});
