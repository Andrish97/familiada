// tests/e2e/logo-editor2.spec.js
//
// Testy przepisanego edytora logo (logo-editor2.html). Strona jest serwowana
// z BIEŻĄCEGO CHECKOUTU przez lokalny serwer w runnerze (helpers/local-site.js),
// a nie z www.familiada.online -- testują kod z gałęzi, na prawdziwym
// backendzie (baza, RPC, blokady, Storage), bez wdrażania na produkcję.
//
// Konto: test1@ (domyślne; test5@/test9@ zwracały z Supabase "Database error
// querying schema"). Nie odpalać równolegle z grupą "konto-glowne".
// Każdy test sprząta swoje logo i pliki (prefiks nazwy LE2_PREFIX).
//
// Scenariusze odpowiadają punktom z docs/audyt-logo-editor.md (P0-x/P1-x).

const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { startLocalSite, loginToLocalSite } = require("./helpers/local-site");
const { testAccountUsername, isKnownNoiseText } = require("./helpers/login");

const USERNAME = testAccountUsername(1);
const LE2_PREFIX = "E2E-LE2-";
const DEMO_IMAGE = path.resolve(__dirname, "../../logo-editor/assets/demo-image.png");
const OTHER_IMAGE = path.resolve(__dirname, "../../img/icon.png");

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });

let site;
test.beforeAll(async () => { site = await startLocalSite(); });
test.afterAll(async () => { await site?.close(); });

/* ---------------- pomocnicze ---------------- */

const uniq = (label) => `${LE2_PREFIX}${label}-${Date.now()}`;

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /logo-editor2/.test(m.location()?.url || "") && !isKnownNoiseText(m.text())) errors.push(m.text());
  });
  return errors;
}

async function openList(page, context) {
  await loginToLocalSite(page, context, site.origin, { username: USERNAME, startPath: "/logo-editor2" });
  await expect(page.locator("#grid .addCard")).toBeVisible({ timeout: 20000 });
}

async function reloadList(page) {
  await page.goto(`${site.origin}/logo-editor2`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#grid .addCard")).toBeVisible({ timeout: 20000 });
}

async function cleanup(page) {
  await page.evaluate(async (prefix) => {
    const sb = window.__sbClient;
    if (!sb) return;
    const { data } = await sb.from("user_logos").select("id,imageUrl:payload->source->>imageUrl").like("name", `${prefix}%`);
    const { data: u } = await sb.auth.getUser();
    const paths = (data || []).map((r) => String(r.imageUrl || "").split("/user-logos/")[1]).filter((p) => p && p.startsWith(`${u.user.id}/`));
    if (paths.length) await sb.storage.from("user-logos").remove(paths);
    await sb.from("user_logos").delete().like("name", `${prefix}%`);
  }, LE2_PREFIX).catch(() => {});
}
test.afterEach(async ({ page }) => { await cleanup(page); });

async function insertLogo(page, row) {
  return page.evaluate(async (row) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb.from("user_logos").insert({ user_id: u.user.id, ...row }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, row);
}

async function readLogo(page, id) {
  return page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient.from("user_logos").select("id,name,type,payload").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }, id);
}

async function readLogoByName(page, name) {
  return page.evaluate(async (name) => {
    const { data } = await window.__sbClient.from("user_logos").select("id,name,type,payload").eq("name", name).maybeSingle();
    return data;
  }, name);
}

async function createNew(page, mode, name) {
  await page.locator("#grid .addCard").click();
  await page.locator(`#pick${mode}`).click();
  await page.fill("#renameInput", name);
  await page.locator("#btnRenameOk").click();
  await expect(page.locator("#editorShell")).toHaveAttribute("data-mode", mode.toUpperCase(), { timeout: 10000 });
}

async function editLogo(page, id) {
  await reloadList(page);
  await page.locator(`.logoTile[data-key="${id}"]`).click();
  await page.locator("#btnEdit").click();
}

async function save(page) {
  await page.locator("#btnCreate").click();
  await expect(page.locator("#mMsg")).not.toHaveText(/Zapisuję|^$/, { timeout: 20000 });
  return page.locator("#mMsg").textContent();
}

async function stage(page) {
  return page.locator("#drawStageHost .upper-canvas").boundingBox();
}

async function drag(page, x0, y0, x1, y1) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
}

/**
 * Zamknięcie edytora pyta o niezapisane zmiany? Jeśli pyta -- odpowiada „Nie”
 * i edytor zostaje otwarty; jeśli nie pyta -- edytor jest już zamknięty.
 */
async function isDirty(page) {
  await page.locator("#btnCloseEditor").click();
  const modal = page.locator(".uni-modal");
  const shown = await modal.waitFor({ state: "visible", timeout: 1500 }).then(() => true).catch(() => false);
  if (shown) await modal.locator(".uni-foot .btn:not(.gold)").click();
  return shown;
}

function unpack(b64) {
  const bytes = Buffer.from(b64 || "", "base64");
  const out = new Uint8Array(150 * 70);
  for (let y = 0; y < 70; y++) for (let x = 0; x < 150; x++) {
    const i = y * 19 + (x >> 3);
    out[y * 150 + x] = i < bytes.length ? (bytes[i] >> (7 - (x & 7))) & 1 : 0;
  }
  return out;
}
const litCount = (b64) => unpack(b64).reduce((a, b) => a + b, 0);
function litBox(b64) {
  const b = unpack(b64);
  const box = { x0: 999, y0: 999, x1: -1, y1: -1 };
  for (let y = 0; y < 70; y++) for (let x = 0; x < 150; x++) if (b[y * 150 + x]) {
    box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y); box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y);
  }
  return box;
}

const emptyPix = { w: 150, h: 70, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64: "" };
const rect = (left, top, width, height) => ({ type: "rect", version: "5.3.0", originX: "left", originY: "top", left, top, width, height, fill: "#ffffff", stroke: null, strokeWidth: 0 });
const textPayload = { layers: [{ rows: [] }], source: { mode: "TEXT", text: "" } };

/* ---------------- lista / nazwa / eksport ---------------- */

test("lista: logo z bazy widoczne na liście lokalnej kopii", async ({ page, context }) => {
  await openList(page, context);
  const id = await insertLogo(page, { name: uniq("smoke"), type: "GLYPH_30x10", payload: textPayload });
  await reloadList(page);
  await expect(page.locator(`.logoTile[data-key="${id}"]`)).toBeVisible();
  await expect(page.locator(`.logoTile[data-key="${id}"] canvas`)).toBeVisible();
});

test("P1-11: pusta nazwa nie blokuje na stałe przycisku Zapisz w zmianie nazwy", async ({ page, context }) => {
  await openList(page, context);
  const id = await insertLogo(page, { name: uniq("rename"), type: "GLYPH_30x10", payload: textPayload });
  await reloadList(page);
  await page.locator(`.logoTile[data-key="${id}"] .logoName`).dblclick();
  await page.fill("#renameInput", "");
  await page.locator("#btnRenameOk").click();
  await expect(page.locator("#renameMsg")).not.toBeEmpty();
  const newName = uniq("renamed");
  await page.fill("#renameInput", newName);
  await page.locator("#btnRenameOk").click();
  await expect(page.locator("#renameOverlay")).toBeHidden();
  expect((await readLogo(page, id)).name).toBe(newName);
});

test("P1-14: eksport -- nazwa pliku zachowuje polskie litery, treść to poprawny .famlogo", async ({ page, context }) => {
  await openList(page, context);
  const name = `${LE2_PREFIX}Żółw łąka ${Date.now()}`;
  const id = await insertLogo(page, { name, type: "GLYPH_30x10", payload: textPayload });
  await reloadList(page);
  await page.locator(`.logoTile[data-key="${id}"]`).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#btnExport").click()]);
  expect(dl.suggestedFilename()).toBe(`${name}.famlogo`);
  const content = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  expect(content.kind).toBe("GLYPH");
});

test("nowe logo powstaje w bazie dopiero przy zapisie; Wstecz zamyka edytor", async ({ page, context }) => {
  await openList(page, context);
  const name = uniq("new");
  await createNew(page, "Text", name);
  expect(await readLogoByName(page, name)).toBeNull();
  await page.goBack();
  await expect(page.locator("#listShell")).toBeVisible();
  await expect(page.locator("#editorShell")).toBeHidden();
  expect(page.url()).toContain("/logo-editor2");
  expect(await readLogoByName(page, name)).toBeNull();
});

/* ---------------- TEXT ---------------- */

test("TEXT: zapis i ponowne otwarcie przywraca napis", async ({ page, context }) => {
  const errors = collectPageErrors(page);
  await openList(page, context);
  const name = uniq("text");
  await createNew(page, "Text", name);
  await page.fill("#textValue", "FAMILIADA");
  await expect(page.locator("#textMeasure")).toContainText("/30");
  expect(await save(page)).toMatch(/Zapisano/);
  const row = await readLogoByName(page, name);
  expect(row.payload.source.text).toBe("FAMILIADA");
  expect(row.payload.layers[0].rows.join("").trim().length).toBeGreaterThan(0);
  await page.locator("#btnCloseEditor").click();
  await editLogo(page, row.id);
  await expect(page.locator("#textValue")).toHaveValue("FAMILIADA");
  expect(errors).toEqual([]);
});

test("P0-4: TEXT bez zapisanego tekstu nie otwiera się (edycja by je wyczyściła)", async ({ page, context }) => {
  await openList(page, context);
  const rows = Array.from({ length: 10 }, (_, i) => (i === 3 ? "   ABC".padEnd(30) : " ".repeat(30)));
  const id = await insertLogo(page, { name: uniq("oldtext"), type: "GLYPH_30x10", payload: { layers: [{ rows }], source: { mode: "TEXT" } } });
  await editLogo(page, id);
  await expect(page.locator(".uni-modal")).toBeVisible();
  await expect(page.locator("#editorShell")).toBeHidden();
  expect((await readLogo(page, id)).payload.layers[0].rows[3]).toContain("ABC");
});

/* ---------------- DRAW ---------------- */

test("P0-3: rysunek -- zapis bez editHistory, w stałym świecie; po otwarciu w innym rozmiarze okna bity bez zmian", async ({ page, context }) => {
  const errors = collectPageErrors(page);
  await openList(page, context);
  const name = uniq("brush");
  await createNew(page, "Draw", name);
  await page.keyboard.press("b");
  const b = await stage(page);
  await drag(page, b.x + b.width * 0.2, b.y + b.height * 0.43, b.x + b.width * 0.8, b.y + b.height * 0.43);
  expect(await isDirty(page)).toBe(true);
  expect(await save(page)).toMatch(/Zapisano/);
  const row = await readLogoByName(page, name);
  expect(row.payload.source.editHistory).toBeUndefined();
  expect(row.payload.source.world).toEqual({ w: 1040, h: 440 });
  expect(litCount(row.payload.bits_b64)).toBeGreaterThan(50);

  await page.locator("#btnCloseEditor").click();
  await page.setViewportSize({ width: 1100, height: 800 });
  await editLogo(page, row.id);
  await expect(page.locator("#paneDraw")).toBeVisible();
  await page.waitForTimeout(800);
  expect(await isDirty(page)).toBe(false); // bez zmian -> edytor się zamknął bez pytania
  await editLogo(page, row.id);
  await expect(page.locator("#paneDraw")).toBeVisible();
  await page.waitForTimeout(800);
  expect(await save(page)).toMatch(/Zapisano/);
  expect((await readLogo(page, row.id)).payload.bits_b64).toBe(row.payload.bits_b64);
  expect(errors).toEqual([]);
});

test("P0-3: stary rysunek (współrzędne ekranu 700px) jest przeskalowany do stałego świata", async ({ page, context }) => {
  await openList(page, context);
  const fabricData = {
    version: "5.3.0",
    objects: [rect(350, 0, 350, 296)],
    background: "#000",
    clipPath: { type: "rect", version: "5.3.0", left: 0, top: 0, width: 700, height: 296, absolutePositioned: true },
  };
  const id = await insertLogo(page, { name: uniq("legacy"), type: "PIX_150x70", payload: { ...emptyPix, source: { mode: "DRAW", fabricData, bg: "BLACK", editHistory: { undoStack: [], redoStack: [] } } } });
  await editLogo(page, id);
  await page.waitForTimeout(800);
  expect(await save(page)).toMatch(/Zapisano/);
  const box = litBox((await readLogo(page, id)).payload.bits_b64);
  // prawa połowa sceny = kolumny ~75..149, cała wysokość
  expect(box.x0).toBeGreaterThanOrEqual(70);
  expect(box.x0).toBeLessThanOrEqual(80);
  expect(box.x1).toBe(149);
  expect(box.y0).toBe(0);
  expect(box.y1).toBe(69);
});

test("P1-6: skróty klawiszowe narzędzi i kształtów nie wywalają edytora", async ({ page, context }) => {
  const errors = collectPageErrors(page);
  await openList(page, context);
  const name = uniq("keys");
  await createNew(page, "Draw", name);
  for (const k of ["r", "o", "l", "p", "u", "s", "t", "v", "h", "b", "e"]) await page.keyboard.press(k);
  await page.keyboard.press("r");
  await expect(page.locator("#tShapes")).toHaveClass(/\bon\b/);
  const b = await stage(page);
  await drag(page, b.x + 100, b.y + 100, b.x + 300, b.y + 250);
  await page.keyboard.press("f");
  await drag(page, b.x + 500, b.y + 100, b.x + 700, b.y + 250);
  expect(await save(page)).toMatch(/Zapisano/);
  const objs = (await readLogoByName(page, name)).payload.source.fabricData.objects;
  expect(objs.map((o) => o.type)).toEqual(["rect", "rect"]);
  expect(objs[1].fill).toBe("#ffffff");
  expect(errors).toEqual([]);
});

test("P1-7/P1-9: po Cofnij obiekty dają się zaznaczyć; Wyczyść cofa się jednym krokiem", async ({ page, context }) => {
  await openList(page, context);
  const name = uniq("undo");
  await createNew(page, "Draw", name);
  await page.keyboard.press("r");
  const b = await stage(page);
  await drag(page, b.x + 100, b.y + 100, b.x + 300, b.y + 250);
  await drag(page, b.x + 500, b.y + 100, b.x + 700, b.y + 250);
  await page.keyboard.press("v");
  await page.keyboard.press("Control+z");
  await page.mouse.click(b.x + 100, b.y + 175);
  await expect(page.locator("#cObjStroke")).toBeVisible();

  await page.keyboard.press("r");
  await drag(page, b.x + 500, b.y + 300, b.x + 700, b.y + 400);
  await page.locator("#tClear").click();
  await page.locator(".uni-modal .uni-foot .btn.gold").click();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  expect(await save(page)).toMatch(/Zapisano/);
  expect((await readLogoByName(page, name)).payload.source.fabricData.objects).toHaveLength(2);
});

test("P0-5: zmiana koloru zaznaczonego obiektu = niezapisana zmiana", async ({ page, context }) => {
  await openList(page, context);
  await createNew(page, "Draw", uniq("dirty"));
  await page.keyboard.press("r");
  const b = await stage(page);
  await drag(page, b.x + 100, b.y + 100, b.x + 300, b.y + 250);
  expect(await save(page)).toMatch(/Zapisano/);
  await page.keyboard.press("v");
  await page.mouse.click(b.x + 100, b.y + 175);
  await page.locator("#cObjStrokeColor").click();
  expect(await isDirty(page)).toBe(true);
});

test("P1-10: duplikat kilku obiektów ląduje obok oryginałów (+10), nie w rogu", async ({ page, context }) => {
  await openList(page, context);
  const name = uniq("dup");
  await createNew(page, "Draw", name);
  await page.keyboard.press("r");
  const b = await stage(page);
  await drag(page, b.x + 100, b.y + 100, b.x + 200, b.y + 200);
  await drag(page, b.x + 400, b.y + 100, b.x + 500, b.y + 200);
  await page.keyboard.press("v");
  await drag(page, b.x + 50, b.y + 50, b.x + 600, b.y + 300);
  await page.keyboard.press("Control+d");
  await page.mouse.click(b.x + b.width - 20, b.y + b.height - 20);
  expect(await save(page)).toMatch(/Zapisano/);
  const [a, c, a2, c2] = (await readLogoByName(page, name)).payload.source.fabricData.objects;
  expect(Math.round(a2.left - a.left)).toBe(10);
  expect(Math.round(c2.left - c.left)).toBe(10);
  expect(Math.round(a2.top - a.top)).toBe(10);
});

test("DRAW: tekst na scenie zapisuje się z treścią", async ({ page, context }) => {
  await openList(page, context);
  const name = uniq("drawtext");
  await createNew(page, "Draw", name);
  await page.keyboard.press("t");
  const b = await stage(page);
  await page.mouse.click(b.x + 200, b.y + 150);
  await page.keyboard.type("ABC");
  await page.mouse.click(b.x + b.width - 30, b.y + b.height - 30);
  expect(await save(page)).toMatch(/Zapisano/);
  const row = await readLogoByName(page, name);
  const texts = row.payload.source.fabricData.objects.filter((o) => o.type === "i-text").map((o) => o.text);
  expect(texts).toContain("ABC");
  expect(litCount(row.payload.bits_b64)).toBeGreaterThan(20);
});

test.describe("ekran Retina (deviceScaleFactor 2)", () => {
  test.use({ deviceScaleFactor: 2 });

  test("P0-5b: raster rysunku nie zależy od gęstości ekranu", async ({ page, context }) => {
    await openList(page, context);
    const fabricData = { version: "5.3.0", objects: [rect(780, 330, 260, 110)], background: "#000" };
    const id = await insertLogo(page, { name: uniq("retina"), type: "PIX_150x70", payload: { ...emptyPix, source: { mode: "DRAW", fabricData, world: { w: 1040, h: 440 } } } });
    await editLogo(page, id);
    await page.waitForTimeout(800);
    expect(await save(page)).toMatch(/Zapisano/);
    const box = litBox((await readLogo(page, id)).payload.bits_b64);
    expect(box).toEqual({ x0: 112, y0: 52, x1: 149, y1: 69 });
  });
});

/* ---------------- IMAGE ---------------- */

test("P0-1/P1-15: obraz -- kolejne zapisy trzymają URL ze Storage, obraz wczytuje się ponownie, podmieniony plik jest sprzątany", async ({ page, context }) => {
  const errors = collectPageErrors(page);
  await openList(page, context);
  const name = uniq("image");
  await createNew(page, "Image", name);
  expect(await save(page)).toMatch(/Najpierw/);
  expect(await readLogoByName(page, name)).toBeNull();

  await page.setInputFiles("#imgFile", DEMO_IMAGE);
  await expect(page.locator("#cropFrame")).toBeVisible();
  expect(await save(page)).toMatch(/Zapisano/);
  const first = await readLogoByName(page, name);
  const url1 = first.payload.source.imageUrl;
  expect(url1).toMatch(/^https:\/\/.+\/user-logos\//);

  await page.locator('.imgSetBtn[data-panel="bright"]').click();
  await page.locator("#rngImgBright").fill("40");
  await page.locator("#rngImgBright").dispatchEvent("input");
  expect(await save(page)).toMatch(/Zapisano/);
  const second = await readLogo(page, first.id);
  expect(second.payload.source.imageUrl).toBe(url1);
  expect(second.payload.source.bright).toBe(40);

  await page.locator("#btnCloseEditor").click();
  await editLogo(page, first.id);
  await expect.poll(() => page.evaluate(() => document.getElementById("imgPreview").naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);

  // nowy plik -> po zapisie poprzedni znika ze Storage
  await page.setInputFiles("#imgFile", OTHER_IMAGE);
  await page.waitForTimeout(800);
  expect(await save(page)).toMatch(/Zapisano/);
  const third = await readLogo(page, first.id);
  expect(third.payload.source.imageUrl).not.toBe(url1);
  const oldStatus = await page.evaluate((u) => fetch(`${u}?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.status), url1);
  expect(oldStatus).toBeGreaterThanOrEqual(400);
  expect(errors).toEqual([]);
});

test("P0-2: obraz, którego nie da się wczytać, blokuje zapis (logo nie zostaje wyzerowane)", async ({ page, context }) => {
  await openList(page, context);
  const full = Buffer.alloc(19 * 70, 255).toString("base64");
  const id = await insertLogo(page, {
    name: uniq("broken"),
    type: "PIX_150x70",
    payload: { ...emptyPix, bits_b64: full, source: { mode: "IMAGE", imageUrl: "https://api.familiada.online/storage/v1/object/public/user-logos/nope/missing.png" } },
  });
  await editLogo(page, id);
  await expect(page.locator(".uni-modal")).toBeVisible({ timeout: 15000 });
  await page.locator(".uni-modal .uni-foot .btn.gold").click();
  expect(await save(page)).toMatch(/Nie udało się wczytać/);
  expect((await readLogo(page, id)).payload.bits_b64).toBe(full);
});

/* ---------------- blokady ---------------- */

test("blokada: edytowane logo ma blokadę, druga karta go nie otworzy, zamknięcie ją zwalnia", async ({ page, context }) => {
  await openList(page, context);
  const id = await insertLogo(page, { name: uniq("lock"), type: "GLYPH_30x10", payload: textPayload });
  await editLogo(page, id);
  await expect(page.locator("#paneText")).toBeVisible();

  const tabB = await context.newPage();
  try {
    await tabB.goto(`${site.origin}/logo-editor2`, { waitUntil: "domcontentloaded" });
    await tabB.locator(`.logoTile[data-key="${id}"]`).click();
    await tabB.locator("#btnEdit").click();
    await expect(tabB.locator("#resourceLockGuard")).toBeVisible({ timeout: 10000 });
    await expect(tabB.locator("#editorShell")).toBeHidden();
  } finally {
    await tabB.close();
  }

  await page.locator("#btnCloseEditor").click();
  await expect.poll(() => page.evaluate(async (id) => {
    const { data } = await window.__sbClient.from("edit_locks").select("resource_id").eq("resource_type", "logo").eq("resource_id", id);
    return (data || []).length;
  }, id), { timeout: 10000 }).toBe(0);
});
