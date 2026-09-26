// tests/e2e/logo-editor2.spec.js
//
// Testy przepisanego edytora logo (logo-editor2.html). Strona jest serwowana
// z BIEŻĄCEGO CHECKOUTU przez lokalny serwer w runnerze (helpers/local-site.js),
// a nie z www.familiada.online -- testują kod z gałęzi, na prawdziwym
// backendzie (baza, RPC, blokady, Storage), bez wdrażania na produkcję.
//
// Konto test1@ (test5@/test9@ zwracały z Supabase "Database error querying
// schema"); logowanie raz na plik (captureSession). Nie odpalać równolegle
// z grupą "konto-glowne". Każdy test sprząta swoje logo i pliki (prefiks).
//
// Sprawdzamy WYNIK w bazie (payload, bity, które widzi wyświetlacz), nie
// tylko to, co widać na stronie. Odnośniki P0-x/P1-x -> docs/audyt-logo-editor.md.
// Zgodność ze starymi danymi: logo-editor2-compat.spec.js.

const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { startLocalSite, captureSession, useSession } = require("./helpers/local-site");
const { testAccountUsername } = require("./helpers/login");
const L = require("./helpers/logo-editor2");

const DEMO_IMAGE = path.resolve(__dirname, "../../logo-editor/assets/demo-image.png");
const OTHER_IMAGE = path.resolve(__dirname, "../../img/icon.png");

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });

let site;
let session;
test.beforeAll(async ({ browser }) => {
  site = await startLocalSite();
  session = await captureSession(browser, testAccountUsername(1));
});
test.afterAll(async () => { await site?.close(); });
test.beforeEach(async ({ context }) => { await useSession(context, site.origin, session); });
test.afterEach(async ({ page }) => { await L.cleanup(page); });

const open = (page) => L.openList(page, site);
const edit = (page, id) => L.editLogo(page, site, id);

async function pickShape(page, shape) {
  await page.keyboard.press("s");
  await page.locator("#cShapeBtn").click();
  await page.locator(`#shapePickerPop .spi[data-shape="${shape}"]`).click();
}

/* ======================= LISTA, NAZWY, IMPORT, EKSPORT ======================= */

test.describe("lista", () => {
  test("logo z bazy widoczne na liście z miniaturą", async ({ page }) => {
    await open(page);
    const id = await L.insertLogo(page, { name: L.uniq("smoke"), type: "GLYPH_30x10", payload: L.textPayload() });
    await open(page);
    await expect(page.locator(`.logoTile[data-key="${id}"]`)).toBeVisible();
    await expect(page.locator(`.logoTile[data-key="${id}"] canvas`)).toBeVisible();
  });

  test("P1-11: pusta nazwa nie blokuje na stałe przycisku Zapisz w zmianie nazwy", async ({ page }) => {
    await open(page);
    const id = await L.insertLogo(page, { name: L.uniq("rename"), type: "GLYPH_30x10", payload: L.textPayload() });
    await open(page);
    await page.locator(`.logoTile[data-key="${id}"] .logoName`).dblclick();
    await page.fill("#renameInput", "");
    await page.locator("#btnRenameOk").click();
    await expect(page.locator("#renameMsg")).not.toBeEmpty();
    const newName = L.uniq("renamed");
    await page.fill("#renameInput", newName);
    await page.locator("#btnRenameOk").click();
    await expect(page.locator("#renameOverlay")).toBeHidden();
    expect((await L.readLogo(page, id)).name).toBe(newName);
  });

  test("zmiana nazwy na zajętą dopina numer (bez błędu bazy)", async ({ page }) => {
    await open(page);
    const taken = L.uniq("taken");
    await L.insertLogo(page, { name: taken, type: "GLYPH_30x10", payload: L.textPayload() });
    const id = await L.insertLogo(page, { name: L.uniq("other"), type: "GLYPH_30x10", payload: L.textPayload() });
    await open(page);
    await page.locator(`.logoTile[data-key="${id}"] .logoName`).dblclick();
    await page.fill("#renameInput", taken);
    await page.locator("#btnRenameOk").click();
    await expect(page.locator("#renameOverlay")).toBeHidden();
    expect((await L.readLogo(page, id)).name).toBe(`${taken} (2)`);
  });

  test("nowe logo o zajętej nazwie zapisuje się z numerem", async ({ page }) => {
    await open(page);
    const taken = L.uniq("dupname");
    await L.insertLogo(page, { name: taken, type: "GLYPH_30x10", payload: L.textPayload() });
    await open(page);
    await L.createNew(page, "Text", taken);
    await expect(page.locator("#logoName")).toHaveValue(`${taken} (2)`);
    await page.fill("#textValue", "AB");
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect(await L.readLogoByName(page, `${taken} (2)`)).not.toBeNull();
  });

  test("usuwanie: wiersz znika z bazy i z listy", async ({ page }) => {
    await open(page);
    const name = L.uniq("del");
    const id = await L.insertLogo(page, { name, type: "GLYPH_30x10", payload: L.textPayload() });
    await open(page);
    await page.locator(`.logoTile[data-key="${id}"] .logoX`).click();
    await page.locator(".uni-modal .uni-foot .btn.gold").click();
    await expect(page.locator(`.logoTile[data-key="${id}"]`)).toHaveCount(0);
    expect(await L.readLogo(page, id)).toBeNull();
  });

  test("podgląd na pełnym ekranie otwiera się i zamyka", async ({ page }) => {
    await open(page);
    const id = await L.insertLogo(page, { name: L.uniq("prev"), type: "GLYPH_30x10", payload: L.textPayload() });
    await open(page);
    await page.locator(`.logoTile[data-key="${id}"]`).click();
    await page.locator("#btnPreview").click();
    await expect(page.locator("#previewOverlay")).toBeVisible();
    await page.locator("#btnPreviewClose").click();
    await expect(page.locator("#previewOverlay")).toBeHidden();
  });

  test("nowe logo powstaje w bazie dopiero przy zapisie; Wstecz zamyka edytor", async ({ page }) => {
    await open(page);
    const name = L.uniq("new");
    await L.createNew(page, "Text", name);
    expect(await L.readLogoByName(page, name)).toBeNull();
    await page.goBack();
    await expect(page.locator("#listShell")).toBeVisible();
    await expect(page.locator("#editorShell")).toBeHidden();
    expect(page.url()).toContain("/logo-editor2");
    expect(await L.readLogoByName(page, name)).toBeNull();
  });
});

test.describe("import / eksport", () => {
  async function exportFile(page, id) {
    await open(page);
    await page.locator(`.logoTile[data-key="${id}"]`).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#btnExport").click()]);
    return { name: dl.suggestedFilename(), path: await dl.path() };
  }

  async function importFile(page, file) {
    await page.locator("#btnImport").click();
    await page.setInputFiles("#inpImportLogoFile", file);
    await expect(page.locator("#btnLogoImportConfirm")).toBeEnabled();
    await page.locator("#btnLogoImportConfirm").click();
    await expect(page.locator("#logoImportOverlay")).toBeHidden({ timeout: 15000 });
  }

  test("P1-14: nazwa pliku eksportu zachowuje polskie litery", async ({ page }) => {
    await open(page);
    const name = `${L.PREFIX}Żółw łąka ${Date.now()}`;
    const id = await L.insertLogo(page, { name, type: "GLYPH_30x10", payload: L.textPayload() });
    const f = await exportFile(page, id);
    expect(f.name).toBe(`${name}.famlogo`);
    expect(JSON.parse(fs.readFileSync(f.path, "utf8")).kind).toBe("GLYPH");
  });

  test("eksport -> import rysunku: nowe logo z tymi samymi bitami i sceną", async ({ page }) => {
    await open(page);
    const fabricData = { version: "5.3.0", objects: [L.rect(100, 100, 300, 200)], background: "#000000" };
    const bits = Buffer.alloc(19 * 70, 0); bits[500] = 0xff;
    const name = L.uniq("rt-draw");
    const id = await L.insertLogo(page, { name, type: "PIX_150x70", payload: { ...L.emptyPix, bits_b64: bits.toString("base64"), source: { mode: "DRAW", fabricData, world: { w: 1040, h: 440 } } } });
    const f = await exportFile(page, id);
    await L.cleanup(page); // oryginał znika -- import ma odtworzyć go z pliku
    await open(page);
    await importFile(page, f.path);
    const back = await L.readLogoByName(page, name);
    expect(back.type).toBe("PIX_150x70");
    expect(back.payload.bits_b64).toBe(bits.toString("base64"));
    expect(back.payload.source.fabricData.objects[0].width).toBe(300);
  });

  test("eksport -> import obrazu: obraz osadzony w pliku, po imporcie da się go edytować", async ({ page }) => {
    await open(page);
    const name = L.uniq("rt-image");
    await L.createNew(page, "Image", name);
    await page.setInputFiles("#imgFile", DEMO_IMAGE);
    await expect(page.locator("#cropFrame")).toBeVisible();
    expect(await L.save(page)).toMatch(/Zapisano/);
    const orig = await L.readLogoByName(page, name);
    await page.locator("#btnCloseEditor").click();

    const f = await exportFile(page, orig.id);
    const file = JSON.parse(fs.readFileSync(f.path, "utf8"));
    expect(file.payload.source.imageData).toMatch(/^data:image\//);
    await L.cleanup(page);

    await open(page);
    await importFile(page, f.path);
    const back = await L.readLogoByName(page, name);
    expect(back.payload.bits_b64).toBe(orig.payload.bits_b64);
    await edit(page, back.id);
    await expect(page.locator("#cropFrame")).toBeVisible({ timeout: 15000 });
    expect(await L.save(page)).toMatch(/Zapisano/);
  });

  test("import pliku, który nie jest logo, pokazuje błąd i nic nie zapisuje", async ({ page }) => {
    await open(page);
    await page.locator("#btnImport").click();
    await page.setInputFiles("#inpImportLogoFile", { name: "x.famlogo", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
    await expect(page.locator("#logoImportErr")).toBeVisible();
    await expect(page.locator("#btnLogoImportConfirm")).toBeDisabled();
  });
});

/* ======================= TEKST ======================= */

test.describe("tryb Tekst", () => {
  test("zapis i ponowne otwarcie przywraca napis", async ({ page }) => {
    const errors = L.collectPageErrors(page);
    await open(page);
    const name = L.uniq("text");
    await L.createNew(page, "Text", name);
    await page.fill("#textValue", "FAMILIADA");
    await expect(page.locator("#textMeasure")).toContainText("/30");
    expect(await L.save(page)).toMatch(/Zapisano/);
    const row = await L.readLogoByName(page, name);
    expect(row.payload.source.text).toBe("FAMILIADA");
    expect(row.payload.layers[0].rows.join("").trim().length).toBeGreaterThan(0);
    await page.locator("#btnCloseEditor").click();
    await edit(page, row.id);
    await expect(page.locator("#textValue")).toHaveValue("FAMILIADA");
    expect(errors).toEqual([]);
  });

  test("niedozwolone znaki: ostrzeżenie widoczne, zapis odrzucony", async ({ page }) => {
    await open(page);
    const name = L.uniq("badchars");
    await L.createNew(page, "Text", name);
    await page.fill("#textValue", "AB~{}");
    await expect(page.locator("#textWarn")).toBeVisible();
    expect(await L.save(page)).not.toMatch(/Zapisano/);
    expect(await L.readLogoByName(page, name)).toBeNull();
  });

  test("za długi napis: zapis odrzucony", async ({ page }) => {
    await open(page);
    const name = L.uniq("toolong");
    await L.createNew(page, "Text", name);
    await page.fill("#textValue", "FAMILIADA FAMILIADA FAMILIADA");
    await expect(page.locator("#textWarn")).toBeVisible();
    expect(await L.save(page)).not.toMatch(/Zapisano/);
    expect(await L.readLogoByName(page, name)).toBeNull();
  });

  test("P0-4: napis odtwarzany z wierszy, gdy logo nie ma zapisanego tekstu", async ({ page }) => {
    await open(page);
    // wiersze wygenerowane przez edytor dla "AB 12" -- zapisane bez source.text
    const name = L.uniq("rows");
    await L.createNew(page, "Text", name);
    await page.fill("#textValue", "AB  12");
    expect(await L.save(page)).toMatch(/Zapisano/);
    const saved = await L.readLogoByName(page, name);
    const id = await L.insertLogo(page, { name: L.uniq("rows-only"), type: "GLYPH_30x10", payload: { layers: [{ rows: saved.payload.layers[0].rows }], source: { mode: "TEXT" } } });
    await edit(page, id);
    await expect(page.locator("#textValue")).toHaveValue("AB  12");
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogo(page, id)).payload.layers[0].rows).toEqual(saved.payload.layers[0].rows);
  });

  test("P0-4: wiersze, których nie da się odczytać jako napis -> edycja zablokowana, logo nietknięte", async ({ page }) => {
    await open(page);
    const rows = Array.from({ length: 10 }, (_, i) => (i === 3 ? "  ~~~~~ ~".padEnd(30) : " ".repeat(30)));
    const id = await L.insertLogo(page, { name: L.uniq("oldtext"), type: "GLYPH_30x10", payload: { layers: [{ rows }], source: { mode: "TEXT" } } });
    await edit(page, id);
    await expect(page.locator(".uni-modal")).toBeVisible();
    await expect(page.locator("#editorShell")).toBeHidden();
    expect((await L.readLogo(page, id)).payload.layers[0].rows[3]).toContain("~~~~~");
  });
});

/* ======================= RYSUNEK ======================= */

test.describe("tryb Rysunek", () => {
  test("P0-3: zapis w stałym świecie bez editHistory; po otwarciu w innym oknie bity bez zmian", async ({ page }) => {
    const errors = L.collectPageErrors(page);
    await open(page);
    const name = L.uniq("brush");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("b");
    const b = await L.stage(page);
    await L.drag(page, b.x + b.width * 0.2, b.y + b.height * 0.43, b.x + b.width * 0.8, b.y + b.height * 0.43);
    expect(await L.isDirty(page)).toBe(true);
    expect(await L.save(page)).toMatch(/Zapisano/);
    const row = await L.readLogoByName(page, name);
    expect(row.payload.source.editHistory).toBeUndefined();
    expect(row.payload.source.world).toEqual({ w: 1040, h: 440 });
    expect(L.litCount(row.payload.bits_b64)).toBeGreaterThan(50);

    await page.locator("#btnCloseEditor").click();
    await page.setViewportSize({ width: 1100, height: 800 });
    await edit(page, row.id);
    await expect(page.locator("#paneDraw")).toBeVisible();
    await page.waitForTimeout(800);
    expect(await L.isDirty(page)).toBe(false); // bez zmian -> zamknięte bez pytania
    await edit(page, row.id);
    await page.waitForTimeout(800);
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogo(page, row.id)).payload.bits_b64).toBe(row.payload.bits_b64);
    expect(errors).toEqual([]);
  });

  test("P0-3: stary rysunek (scena 700px) zachowuje swój świat -- kropki jak na wyświetlaczu", async ({ page }) => {
    await open(page);
    const fabricData = {
      version: "5.3.0",
      objects: [L.rect(350, 0, 350, 296)],
      background: "#000",
      clipPath: { type: "rect", version: "5.3.0", left: 0, top: 0, width: 700, height: 296, absolutePositioned: true },
    };
    const id = await L.insertLogo(page, { name: L.uniq("legacy"), type: "PIX_150x70", payload: { ...L.emptyPix, source: { mode: "DRAW", fabricData, bg: "BLACK", editHistory: { undoStack: [], redoStack: [] } } } });
    await edit(page, id);
    await page.waitForTimeout(800);
    expect(await L.save(page)).toMatch(/Zapisano/);
    const box = L.litBox((await L.readLogo(page, id)).payload.bits_b64);
    expect(box.x0).toBeGreaterThanOrEqual(70);
    expect(box.x0).toBeLessThanOrEqual(80);
    expect([box.x1, box.y0, box.y1]).toEqual([149, 0, 69]);
  });

  test("logo PIX bez sceny (demo/stare) otwiera się, a zapis bez zmian daje te same kropki", async ({ page }) => {
    await open(page);
    const bits = new Uint8Array(150 * 70);
    for (let y = 10; y < 60; y++) for (let x = 20; x < 130; x++) if ((x + y) % 3 === 0) bits[y * 150 + x] = 1;
    const b64 = L.pack(bits);
    const id = await L.insertLogo(page, { name: L.uniq("noscene"), type: "PIX_150x70", payload: { ...L.emptyPix, bits_b64: b64 } });
    await edit(page, id);
    await expect(page.locator("#paneDraw")).toBeVisible();
    await page.waitForTimeout(1000);
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect(L.bitDiff((await L.readLogo(page, id)).payload.bits_b64, b64)).toBe(0);
  });

  test("P1-6: skróty klawiszowe nie wywalają edytora; R = prostokąt, F = wypełnienie", async ({ page }) => {
    const errors = L.collectPageErrors(page);
    await open(page);
    const name = L.uniq("keys");
    await L.createNew(page, "Draw", name);
    for (const k of ["r", "o", "l", "p", "u", "s", "t", "v", "h", "b", "e", "[", "]"]) await page.keyboard.press(k);
    await page.keyboard.press("r");
    await expect(page.locator("#tShapes")).toHaveClass(/\bon\b/);
    const b = await L.stage(page);
    await L.drag(page, b.x + 100, b.y + 100, b.x + 300, b.y + 250);
    await page.keyboard.press("f");
    await L.drag(page, b.x + 500, b.y + 100, b.x + 700, b.y + 250);
    expect(await L.save(page)).toMatch(/Zapisano/);
    const objs = (await L.readLogoByName(page, name)).payload.source.fabricData.objects;
    expect(objs.map((o) => o.type)).toEqual(["rect", "rect"]);
    expect(objs[1].fill).toBe("#ffffff");
    expect(errors).toEqual([]);
  });

  test("każdy z 14 kształtów rysuje się i trafia do zapisu", async ({ page }) => {
    const errors = L.collectPageErrors(page);
    await open(page);
    const name = L.uniq("shapes");
    await L.createNew(page, "Draw", name);
    const shapes = ["line", "rect", "roundRect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "star5", "arrow1", "arrow2", "arrow1Fill", "arrow2Fill", "heart"];
    const b = await L.stage(page);
    const cols = 5, cw = b.width / cols, ch = b.height / 3;
    for (const [i, s] of shapes.entries()) {
      await pickShape(page, s);
      const cx = b.x + (i % cols) * cw, cy = b.y + Math.floor(i / cols) * ch;
      await L.drag(page, cx + cw * 0.2, cy + ch * 0.2, cx + cw * 0.8, cy + ch * 0.8);
    }
    expect(await L.save(page)).toMatch(/Zapisano/);
    const row = await L.readLogoByName(page, name);
    expect(row.payload.source.fabricData.objects).toHaveLength(shapes.length);
    expect(L.litCount(row.payload.bits_b64)).toBeGreaterThan(300);
    expect(errors).toEqual([]);
  });

  test("wielokąt: kliknięcia + Enter; Backspace cofa punkt; Esc porzuca", async ({ page }) => {
    await open(page);
    const name = L.uniq("poly");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("p");
    const b = await L.stage(page);
    for (const [fx, fy] of [[0.1, 0.1], [0.4, 0.1], [0.9, 0.9]]) await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
    await page.keyboard.press("Backspace"); // cofa (0.9, 0.9)
    await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.7);
    await page.keyboard.press("Enter");
    await page.mouse.click(b.x + b.width * 0.6, b.y + b.height * 0.2);
    await page.keyboard.press("Escape"); // porzucony szkic
    expect(await L.save(page)).toMatch(/Zapisano/);
    const objs = (await L.readLogoByName(page, name)).payload.source.fabricData.objects;
    expect(objs).toHaveLength(1);
    expect(objs[0].type).toBe("polygon");
    expect(objs[0].points).toHaveLength(3);
  });

  test("gumka usuwa dotknięte obiekty, jedno Cofnij je przywraca", async ({ page }) => {
    await open(page);
    const name = L.uniq("eraser");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("r");
    const b = await L.stage(page);
    await L.drag(page, b.x + 100, b.y + 100, b.x + 200, b.y + 200);
    await L.drag(page, b.x + 400, b.y + 100, b.x + 500, b.y + 200);
    await L.drag(page, b.x + 700, b.y + 100, b.x + 800, b.y + 200);
    await page.keyboard.press("e");
    await L.drag(page, b.x + 90, b.y + 150, b.x + 520, b.y + 150, 30); // przez dwa pierwsze
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogoByName(page, name)).payload.source.fabricData.objects).toHaveLength(1);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogoByName(page, name)).payload.source.fabricData.objects).toHaveLength(3);
  });

  test("zoom i przesuwanie widoku nie zmieniają zapisanych kropek", async ({ page }) => {
    await open(page);
    const name = L.uniq("zoom");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("r");
    const b = await L.stage(page);
    await L.drag(page, b.x + 200, b.y + 100, b.x + 600, b.y + 300);
    expect(await L.save(page)).toMatch(/Zapisano/);
    const before = (await L.readLogoByName(page, name)).payload.bits_b64;
    for (let i = 0; i < 4; i++) await page.locator("#tZoomIn").click();
    await page.keyboard.press("h");
    await L.drag(page, b.x + 500, b.y + 200, b.x + 300, b.y + 100);
    await page.keyboard.press("v");
    await page.mouse.click(b.x + 5, b.y + 5); // odznacz
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogoByName(page, name)).payload.bits_b64).toBe(before);
  });

  test("P1-7/P1-9: po Cofnij obiekty dają się zaznaczyć; Wyczyść cofa się jednym krokiem; Ponów działa", async ({ page }) => {
    await open(page);
    const name = L.uniq("undo");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("r");
    const b = await L.stage(page);
    await L.drag(page, b.x + 100, b.y + 100, b.x + 300, b.y + 250);
    await L.drag(page, b.x + 500, b.y + 100, b.x + 700, b.y + 250);
    await page.keyboard.press("v");
    await page.keyboard.press("Control+z");
    await page.mouse.click(b.x + 100, b.y + 175);
    await expect(page.locator("#cObjStroke")).toBeVisible();
    await page.keyboard.press("Control+y"); // drugi prostokąt wraca

    await page.keyboard.press("r");
    await L.drag(page, b.x + 500, b.y + 300, b.x + 700, b.y + 400);
    await page.locator("#tClear").click();
    await page.locator(".uni-modal .uni-foot .btn.gold").click();
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogoByName(page, name)).payload.source.fabricData.objects).toHaveLength(3);
  });

  test("P0-5: zmiana koloru zaznaczonego obiektu = niezapisana zmiana", async ({ page }) => {
    await open(page);
    await L.createNew(page, "Draw", L.uniq("dirty"));
    await page.keyboard.press("r");
    const b = await L.stage(page);
    await L.drag(page, b.x + 100, b.y + 100, b.x + 300, b.y + 250);
    expect(await L.save(page)).toMatch(/Zapisano/);
    await page.keyboard.press("v");
    await page.mouse.click(b.x + 100, b.y + 175);
    await page.locator("#cObjStrokeColor").click();
    expect(await L.isDirty(page)).toBe(true);
  });

  test("P1-8: zmiana rozmiaru tekstu cofa się jednym Cofnij", async ({ page }) => {
    await open(page);
    const name = L.uniq("textundo");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("t");
    const b = await L.stage(page);
    await page.mouse.click(b.x + 200, b.y + 150);
    await page.keyboard.type("AB");
    await page.mouse.click(b.x + b.width - 30, b.y + b.height - 30); // koniec edycji
    await page.mouse.click(b.x + 210, b.y + 170); // zaznacz tekst (narzędzie Tekst)
    await page.fill("#cSz", "120");
    await page.locator("#cSz").press("Enter");
    await page.mouse.click(b.x + b.width - 30, b.y + b.height - 30);
    await page.keyboard.press("v");
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogoByName(page, name)).payload.source.fabricData.objects[0].fontSize).toBe(120);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogoByName(page, name)).payload.source.fabricData.objects[0].fontSize).toBe(80);
  });

  test("tło białe zapala resztę kropek; Cofnij przywraca czarne", async ({ page }) => {
    await open(page);
    const name = L.uniq("bg");
    await L.createNew(page, "Draw", name);
    await page.locator("#tBg").click();
    expect(await L.save(page)).toMatch(/Zapisano/);
    let row = await L.readLogoByName(page, name);
    expect(row.payload.source.bg).toBe("WHITE");
    expect(L.litCount(row.payload.bits_b64)).toBe(150 * 70);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
    expect(await L.save(page)).toMatch(/Zapisano/);
    row = await L.readLogoByName(page, name);
    expect(row.payload.source.bg).toBe("BLACK");
    expect(L.litCount(row.payload.bits_b64)).toBe(0);
  });

  test("strzałki przesuwają zaznaczenie (1 / Shift = 10), Delete usuwa", async ({ page }) => {
    await open(page);
    const name = L.uniq("arrows");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("r");
    const b = await L.stage(page);
    await L.drag(page, b.x + 200, b.y + 100, b.x + 400, b.y + 250);
    await L.drag(page, b.x + 600, b.y + 100, b.x + 700, b.y + 250);
    expect(await L.save(page)).toMatch(/Zapisano/);
    const left0 = (await L.readLogoByName(page, name)).payload.source.fabricData.objects[0].left;
    await page.keyboard.press("v");
    await page.mouse.click(b.x + 200, b.y + 175);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect(Math.round((await L.readLogoByName(page, name)).payload.source.fabricData.objects[0].left - left0)).toBe(11);
    await page.keyboard.press("Delete");
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogoByName(page, name)).payload.source.fabricData.objects).toHaveLength(1);
  });

  test("P1-10: duplikat kilku obiektów ląduje obok oryginałów (+10), nie w rogu", async ({ page }) => {
    await open(page);
    const name = L.uniq("dup");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("r");
    const b = await L.stage(page);
    await L.drag(page, b.x + 100, b.y + 100, b.x + 200, b.y + 200);
    await L.drag(page, b.x + 400, b.y + 100, b.x + 500, b.y + 200);
    await page.keyboard.press("v");
    await L.drag(page, b.x + 50, b.y + 50, b.x + 600, b.y + 300);
    await page.keyboard.press("Control+d");
    await page.mouse.click(b.x + b.width - 20, b.y + b.height - 20);
    expect(await L.save(page)).toMatch(/Zapisano/);
    const [a, c, a2, c2] = (await L.readLogoByName(page, name)).payload.source.fabricData.objects;
    expect(Math.round(a2.left - a.left)).toBe(10);
    expect(Math.round(c2.left - c.left)).toBe(10);
    expect(Math.round(a2.top - a.top)).toBe(10);
  });

  test("tekst na scenie zapisuje się z treścią", async ({ page }) => {
    await open(page);
    const name = L.uniq("drawtext");
    await L.createNew(page, "Draw", name);
    await page.keyboard.press("t");
    const b = await L.stage(page);
    await page.mouse.click(b.x + 200, b.y + 150);
    await page.keyboard.type("ABC");
    await page.mouse.click(b.x + b.width - 30, b.y + b.height - 30);
    expect(await L.save(page)).toMatch(/Zapisano/);
    const row = await L.readLogoByName(page, name);
    expect(row.payload.source.fabricData.objects.filter((o) => o.type === "i-text").map((o) => o.text)).toContain("ABC");
    expect(L.litCount(row.payload.bits_b64)).toBeGreaterThan(20);
  });

  test.describe("ekran Retina (deviceScaleFactor 2)", () => {
    test.use({ deviceScaleFactor: 2 });

    test("P0-5b: raster rysunku nie zależy od gęstości ekranu", async ({ page }) => {
      await open(page);
      const fabricData = { version: "5.3.0", objects: [L.rect(780, 330, 260, 110)], background: "#000" };
      const id = await L.insertLogo(page, { name: L.uniq("retina"), type: "PIX_150x70", payload: { ...L.emptyPix, source: { mode: "DRAW", fabricData, world: { w: 1040, h: 440 } } } });
      await edit(page, id);
      await page.waitForTimeout(800);
      expect(await L.save(page)).toMatch(/Zapisano/);
      expect(L.litBox((await L.readLogo(page, id)).payload.bits_b64)).toEqual({ x0: 112, y0: 52, x1: 149, y1: 69 });
    });
  });
});

/* ======================= OBRAZ ======================= */

test.describe("tryb Obraz", () => {
  test("P0-1/P1-15: kolejne zapisy trzymają URL ze Storage, obraz wczytuje się ponownie, podmieniony plik jest sprzątany", async ({ page }) => {
    const errors = L.collectPageErrors(page);
    await open(page);
    const name = L.uniq("image");
    await L.createNew(page, "Image", name);
    expect(await L.save(page)).toMatch(/Najpierw/);
    expect(await L.readLogoByName(page, name)).toBeNull();

    await page.setInputFiles("#imgFile", DEMO_IMAGE);
    await expect(page.locator("#cropFrame")).toBeVisible();
    expect(await L.save(page)).toMatch(/Zapisano/);
    const first = await L.readLogoByName(page, name);
    const url1 = first.payload.source.imageUrl;
    expect(url1).toMatch(/^https:\/\/.+\/user-logos\//);

    await page.locator('.imgSetBtn[data-panel="bright"]').click();
    await page.locator("#rngImgBright").fill("40");
    await page.locator("#rngImgBright").dispatchEvent("input");
    expect(await L.save(page)).toMatch(/Zapisano/);
    const second = await L.readLogo(page, first.id);
    expect(second.payload.source.imageUrl).toBe(url1);
    expect(second.payload.source.bright).toBe(40);

    await page.locator("#btnCloseEditor").click();
    await edit(page, first.id);
    await expect(page.locator("#cropFrame")).toBeVisible({ timeout: 15000 });

    await page.setInputFiles("#imgFile", OTHER_IMAGE);
    await expect(page.locator("#cropFrame")).toBeVisible();
    expect(await L.save(page)).toMatch(/Zapisano/);
    const third = await L.readLogo(page, first.id);
    expect(third.payload.source.imageUrl).not.toBe(url1);
    const oldStatus = await page.evaluate((u) => fetch(`${u}?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.status), url1);
    expect(oldStatus).toBeGreaterThanOrEqual(400);
    expect(errors).toEqual([]);
  });

  test("P0-2: obraz, którego nie da się wczytać, blokuje zapis (logo nie zostaje wyzerowane)", async ({ page }) => {
    await open(page);
    const full = Buffer.alloc(19 * 70, 255).toString("base64");
    const id = await L.insertLogo(page, {
      name: L.uniq("broken"),
      type: "PIX_150x70",
      payload: { ...L.emptyPix, bits_b64: full, source: { mode: "IMAGE", imageUrl: "https://api.familiada.online/storage/v1/object/public/user-logos/nope/missing.png" } },
    });
    await edit(page, id);
    await expect(page.locator(".uni-modal")).toBeVisible({ timeout: 15000 });
    await page.locator(".uni-modal .uni-foot .btn.gold").click();
    expect(await L.save(page)).toMatch(/Nie udało się wczytać/);
    expect((await L.readLogo(page, id)).payload.bits_b64).toBe(full);
  });

  test("suwaki, odwrócenie i Przywróć zmieniają wynik; kadr przeciągnięty zostaje po ponownym otwarciu", async ({ page }) => {
    await open(page);
    const name = L.uniq("sliders");
    await L.createNew(page, "Image", name);
    await page.setInputFiles("#imgFile", DEMO_IMAGE);
    await expect(page.locator("#cropFrame")).toBeVisible();
    expect(await L.save(page)).toMatch(/Zapisano/);
    const base = (await L.readLogoByName(page, name)).payload;

    await page.locator("#chkImgInvert").click();
    expect(await L.save(page)).toMatch(/Zapisano/);
    const inv = (await L.readLogoByName(page, name)).payload;
    expect(inv.source.invert).toBe(false);
    expect(L.bitDiff(base.bits_b64, inv.bits_b64)).toBeGreaterThan(5000);

    await page.locator("#btnImgResetDefault").click();
    await page.waitForTimeout(300);
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect((await L.readLogoByName(page, name)).payload.source.invert).toBe(true);

    // przesunięcie kadru
    const f = await page.locator("#cropFrame").boundingBox();
    await L.drag(page, f.x + f.width / 2, f.y + f.height / 2, f.x + f.width / 2 + 40, f.y + f.height / 2 + 20);
    expect(await L.save(page)).toMatch(/Zapisano/);
    const moved = (await L.readLogoByName(page, name)).payload;
    expect(moved.source.crop.v).toBe(2);
    expect(L.bitDiff(base.bits_b64, moved.bits_b64)).toBeGreaterThan(50);

    const id = (await L.readLogoByName(page, name)).id;
    await page.locator("#btnCloseEditor").click();
    await edit(page, id);
    await expect(page.locator("#cropFrame")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    expect(await L.save(page)).toMatch(/Zapisano/);
    expect(L.bitDiff((await L.readLogoByName(page, name)).payload.bits_b64, moved.bits_b64)).toBeLessThanOrEqual(30);
  });

  test("walidacja pliku: zły typ i za duży plik odrzucone przed wysłaniem", async ({ page }) => {
    await open(page);
    await L.createNew(page, "Image", L.uniq("badfile"));
    await page.setInputFiles("#imgFile", { name: "a.bmp", mimeType: "image/bmp", buffer: Buffer.from("BM....") });
    await expect(page.locator(".uni-modal")).toContainText(/JPG, PNG, GIF/);
    await page.locator(".uni-modal .uni-foot .btn.gold").click();
    await page.setInputFiles("#imgFile", { name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(6 * 1024 * 1024) });
    await expect(page.locator(".uni-modal")).toContainText(/5 MB/);
    await page.locator(".uni-modal .uni-foot .btn.gold").click();
    await expect(page.locator("#cropFrame")).toBeHidden();
  });
});

/* ======================= BLOKADY ======================= */

test.describe("blokady", () => {
  test("edytowane logo ma blokadę, druga karta go nie otworzy, zamknięcie ją zwalnia", async ({ page, context }) => {
    await open(page);
    const id = await L.insertLogo(page, { name: L.uniq("lock"), type: "GLYPH_30x10", payload: L.textPayload() });
    await edit(page, id);
    await expect(page.locator("#paneText")).toBeVisible();

    const tabB = await context.newPage();
    try {
      await L.openList(tabB, site);
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

  test("otwarte ustawienia gry blokują edycję logo (cała pula)", async ({ page }) => {
    await open(page);
    const id = await L.insertLogo(page, { name: L.uniq("pool"), type: "GLYPH_30x10", payload: L.textPayload("AB") });
    const gameId = await page.evaluate(async () => {
      const { data } = await window.__sbClient.from("games").select("id").limit(1).maybeSingle();
      return data?.id || null;
    });
    test.skip(!gameId, "konto testowe nie ma żadnej gry");
    const tab = `e2e-le2-${Date.now()}`;
    const lock = (fn) => page.evaluate(async ({ fn, gameId, tab }) => window.__sbClient.rpc(fn, {
      p_resource_type: "game", p_resource_id: gameId, p_tab_id: tab, ...(fn === "acquire_edit_lock" ? { p_context: "settings" } : {}),
    }), { fn, gameId, tab });
    await lock("acquire_edit_lock");
    try {
      await edit(page, id);
      await expect(page.locator(".uni-modal")).toBeVisible();
      await expect(page.locator("#editorShell")).toBeHidden();
    } finally {
      await lock("release_edit_lock");
    }
  });
});

/* ======================= ZGODNOŚĆ ZE STARYMI DANYMI =======================
   1) logo zrobione STARYM edytorem (logo-editor.html z tego samego checkoutu,
      zapis do prawdziwej bazy) -> otwarte i zapisane bez zmian w nowym ->
      te same kropki (to widzi wyświetlacz),
   2) logo demo z konta testowego (kopie, oryginały nietknięte). */

test.describe("zgodność ze starymi danymi", () => {
  /* ---------- stary edytor: tworzenie logo tak jak użytkownik na produkcji ---------- */

  async function oldCreate(page, mode, name) {
    await page.goto(`${site.origin}/logo-editor`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#grid .addCard")).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState("networkidle");
    await page.locator("#grid .addCard").click();
    await expect(page.locator("#createOverlay")).toBeVisible();
    await page.locator(`#pick${mode}`).click();
    try {
      await expect(page.locator("#renameOverlay")).toBeVisible({ timeout: 5000 });
    } catch (e) {
      console.log("[compat-diag] stan po wyborze trybu:", JSON.stringify(await page.evaluate(() => ({
        overlays: [...document.querySelectorAll(".overlay")].map((o) => `${o.id || o.className}:${getComputedStyle(o).display}`),
        uniModal: document.querySelector(".uni-modal .mSub")?.textContent || null,
        body: document.body.className,
      }))));
      throw e;
    }
    await page.fill("#renameInput", name);
    await page.locator("#btnRenameOk").click();
    // stary edytor od razu wstawia pusty wiersz i NIE otwiera edycji
    await expect.poll(() => L.readLogoByName(page, name).then((r) => !!r), { timeout: 10000 }).toBe(true);
    const row = await L.readLogoByName(page, name);
    await page.locator(`.logoTile[data-key="${row.id}"]`).click();
    await page.locator("#btnEdit").click();
    await expect(page.locator("#editorShell")).toBeVisible();
    await page.waitForTimeout(600);
    return row.id;
  }

  async function oldSave(page) {
    await page.locator("#btnCreate").click();
    await expect(page.locator("#mMsg")).toHaveText(/Zapisano/, { timeout: 20000 });
  }

  async function oldPickShape(page, shape) {
    await page.locator("#tShapes").click();
    await page.locator("#cShapeBtn").click();
    await page.locator(`#shapePickerPop .spi[data-shape="${shape}"]`).click();
  }

  /**
   * Zapis kopii logo STARYM edytorem przy scenie o rozmiarze `world`. Stary
   * edytor bierze rozmiar sceny z rozmiaru ramki (#drawStageHost), więc
   * ustawiamy ją na sztywno. Dwa warianty, bo stary świat mógł powstać z
   * szerokości ramki (h = floor(w / proporcja)) albo z jej wysokości.
   */
  async function oldEditorResave(page, logo, world) {
    const id = await L.insertLogo(page, { name: L.uniq("old-resave"), type: logo.type, payload: logo.payload });
    await page.setViewportSize({ width: 1600, height: 1000 });
    let got = null;
    for (const [bw, bh] of [[world.w, world.h + 40], [world.w + 8, world.h]]) {
      await page.goto(`${site.origin}/logo-editor`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page.addStyleTag({ content: `#drawStageHost{width:${bw}px!important;height:${bh}px!important;aspect-ratio:auto!important;max-width:none!important}` });
      await page.locator(`.logoTile[data-key="${id}"]`).click();
      await page.locator("#btnEdit").click();
      await page.waitForTimeout(1200);
      got = await page.evaluate(() => [window.__drawFabric?.getWidth?.() || 0, window.__drawFabric?.getHeight?.() || 0]);
      if (got[0] === world.w && got[1] === world.h) break;
      console.log(`[demo] stary edytor: ramka ${bw}x${bh} -> scena ${got.join("x")}`);
    }
    expect(got, "stary edytor ze sceną tego samego rozmiaru").toEqual([world.w, world.h]);
    await oldSave(page);
    return (await L.readLogo(page, id)).payload.bits_b64;
  }

  /** Otwiera logo w nowym edytorze i zapisuje bez zmian; zwraca payload po zapisie. */
  async function resaveInNew(page, id) {
    await L.editLogo(page, site, id);
    await expect(page.locator("#editorShell")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1200);
    expect(await L.save(page)).toMatch(/Zapisano/);
    return (await L.readLogo(page, id)).payload;
  }

  test("zgodność: TEXT zrobiony starym edytorem -> nowy odtwarza napis i identyczne wiersze", async ({ page }) => {
    const name = L.uniq("compat-text");
    const id = await oldCreate(page, "Text", name);
    await page.fill("#textValue", "FAMILIADA");
    await oldSave(page);
    const before = (await L.readLogo(page, id)).payload;

    await L.editLogo(page, site, id);
    await expect(page.locator("#textValue")).toHaveValue("FAMILIADA");
    expect(await L.save(page)).toMatch(/Zapisano/);
    const after = (await L.readLogo(page, id)).payload;
    expect(after.layers[0].rows).toEqual(before.layers[0].rows);
  });

  test("zgodność: RYSUNEK ze starego edytora (pędzel, kształty, tekst, wielokąt) -> te same kropki po zapisie w nowym", async ({ page }) => {
    const name = L.uniq("compat-draw");
    const id = await oldCreate(page, "Draw", name);
    const b = await L.stage(page);
    const P = (fx, fy) => [b.x + b.width * fx, b.y + b.height * fy];

    await page.locator("#tBrush").click();
    await L.drag(page, ...P(0.05, 0.2), ...P(0.4, 0.3));
    await oldPickShape(page, "rect");
    await L.drag(page, ...P(0.5, 0.1), ...P(0.7, 0.4));
    await oldPickShape(page, "ellipse");
    await L.drag(page, ...P(0.75, 0.1), ...P(0.95, 0.45));
    await oldPickShape(page, "arrow1");
    await L.drag(page, ...P(0.1, 0.6), ...P(0.4, 0.8));
    await oldPickShape(page, "star5");
    await L.drag(page, ...P(0.45, 0.55), ...P(0.6, 0.9));
    await page.locator("#tText").click();
    await page.mouse.click(...P(0.7, 0.6));
    await page.keyboard.type("AB");
    await page.mouse.click(...P(0.02, 0.97));
    await oldSave(page);
    const before = (await L.readLogo(page, id)).payload;
    expect(before.source.fabricData.clipPath?.width).toBeGreaterThan(0);
    expect(L.litCount(before.bits_b64)).toBeGreaterThan(100);

    const after = await resaveInNew(page, id);
    const diff = L.bitDiff(before.bits_b64, after.bits_b64);
    console.log(`[compat-draw] stary świat ${before.source.fabricData.clipPath.width}x${before.source.fabricData.clipPath.height}, kropek ${L.litCount(before.bits_b64)}, różnych po zapisie w nowym: ${diff}`);
    expect(diff).toBeLessThanOrEqual(Math.ceil(L.litCount(before.bits_b64) * 0.01));
    // stary rysunek zachowuje świat, na którym go narysowano (dlatego bit w bit)
    expect(after.source.world).toEqual({ w: before.source.fabricData.clipPath.width, h: before.source.fabricData.clipPath.height });
  });

  test("zgodność: OBRAZ ze starego edytora -> nowy wczytuje obraz z tym samym kadrem", async ({ page }) => {
    const name = L.uniq("compat-image");
    const id = await oldCreate(page, "Image", name);
    await page.setInputFiles("#imgFile", DEMO_IMAGE);
    await page.waitForTimeout(1200);
    await oldSave(page);
    const before = (await L.readLogo(page, id)).payload;
    expect(before.source.imageUrl).toMatch(/\/user-logos\//);

    const after = await resaveInNew(page, id);
    expect(after.source.imageUrl).toBe(before.source.imageUrl);
    const diff = L.bitDiff(before.bits_b64, after.bits_b64);
    console.log(`[compat-image] kropek ${L.litCount(before.bits_b64)}, różnych po zapisie w nowym: ${diff}`);
    expect(diff).toBeLessThanOrEqual(Math.ceil(10500 * 0.03));
  });

  /* ---------- logo demo (kopie z konta testowego) ---------- */

  test("logo demo: każde da się otworzyć w nowym edytorze, a zapis bez zmian nie psuje kropek", async ({ page }) => {
    await L.openList(page, site);
    const demos = await page.evaluate(async () => {
      const { data, error } = await window.__sbClient.from("user_logos").select("name,type,payload").eq("is_demo", true);
      if (error) throw new Error(error.message);
      return data;
    });
    console.log(`[demo] logo demo na koncie: ${demos.length}`);
    for (const d of demos) {
      const s = d.payload?.source || null;
      console.log(`[demo] ${d.name} | ${d.type} | source: ${s ? Object.keys(s).join(",") : "—"} | text: ${typeof s?.text} | fabric: ${!!s?.fabricData} | img: ${String(s?.imageUrl || "").replace(/^https?:\/\/([^/]+).*$/, "$1")}`);
    }
    test.skip(!demos.length, "konto testowe nie ma logo demo");

    for (const d of demos) {
      const copyName = L.uniq(`demo-${d.type}`);
      const id = await L.insertLogo(page, { name: copyName, type: d.type, payload: d.payload });
      await L.editLogo(page, site, id);
      const modal = page.locator(".uni-modal");
      const blocked = await modal.waitFor({ state: "visible", timeout: 2500 }).then(() => true).catch(() => false);
      if (blocked) {
        const msg = await modal.locator(".mSub").textContent();
        console.log(`[demo] ${d.name}: ZABLOKOWANE -- ${msg}`);
        await modal.locator(".uni-foot .btn.gold").click();
      }
      expect(blocked, `${d.name} powinno dać się edytować`).toBe(false);
      await expect(page.locator("#editorShell")).toBeVisible();
      await page.waitForTimeout(1500);
      expect(await L.save(page)).toMatch(/Zapisano/);
      const after = await L.readLogo(page, id);
      if (d.type === "GLYPH_30x10") {
        expect(after.payload.layers[0].rows).toEqual(d.payload.layers[0].rows.map((r) => String(r).padEnd(30).slice(0, 30)));
      } else if (d.payload.source?.fabricData) {
        // Rysunek: zapisane kropki powstały w przeglądarce autora (czcionki
        // systemowe napisów renderują się różnie w różnych systemach), więc
        // odniesieniem jest STARY edytor w tej samej przeglądarce i na scenie
        // tego samego rozmiaru (dobieramy szerokość okna).
        const world = after.payload.source.world;
        const oldBits = await oldEditorResave(page, d, world);
        const vsOld = L.bitDiff(oldBits, after.payload.bits_b64);
        const types = d.payload.source.fabricData.objects.map((o) => o.type).join(",");
        console.log(`[demo] ${d.name}: świat ${JSON.stringify(world)}, obiekty [${types}], vs zapisane: ${L.bitDiff(d.payload.bits_b64, after.payload.bits_b64)}, vs stary edytor: ${vsOld}`);
        expect(vsOld).toBe(0);
        await page.setViewportSize({ width: 1440, height: 900 });
        await L.openList(page, site);
        continue;
      } else if (d.payload.source?.mode === "IMAGE") {
        // Obraz: kadr demo (migracja 270) był DOPASOWANY do zapisanych kropek
        // z dokładnością do 4 cyfr, a dithering rozlewa każde przesunięcie
        // kadru o ułamek piksela na cały obraz -- zapisane kropki nie są więc
        // wzorcem. Wzorcem jest stary edytor na tym samym obrazie i kadrze.
        // (Stary edytor ładuje adres www.familiada.online wprost -- w runnerze
        // to cross-origin, więc podajemy mu ten sam plik z lokalnego serwera.)
        const src = d.payload.source;
        const localUrl = String(src.imageUrl || "").replace(/^https?:\/\/(www\.)?familiada\.online(?=\/logo-editor\/assets\/)/i, site.origin);
        const oldId = await L.insertLogo(page, { name: L.uniq("old-resave"), type: d.type, payload: { ...d.payload, source: { ...src, imageUrl: localUrl } } });
        await page.goto(`${site.origin}/logo-editor`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle");
        await page.locator(`.logoTile[data-key="${oldId}"]`).click();
        await page.locator("#btnEdit").click();
        await page.waitForTimeout(3000);
        await oldSave(page);
        const oldBits = (await L.readLogo(page, oldId)).payload.bits_b64;
        const vsOld = L.bitDiff(oldBits, after.payload.bits_b64);
        console.log(`[demo] ${d.name}: vs zapisane: ${L.bitDiff(d.payload.bits_b64, after.payload.bits_b64)}, stary edytor vs zapisane: ${L.bitDiff(d.payload.bits_b64, oldBits)}, vs stary edytor: ${vsOld}`);
        expect(after.payload.source.imageUrl, "adres obrazu demo bez zmian").toBe(src.imageUrl);
        expect(vsOld).toBe(0);
        await L.openList(page, site);
        continue;
      } else {
        const diff = L.bitDiff(d.payload.bits_b64, after.payload.bits_b64);
        console.log(`[demo] ${d.name}: różnych kropek po zapisie: ${diff}`);
        expect(diff).toBeLessThanOrEqual(Math.ceil(10500 * 0.01));
      }
      await page.locator("#btnCloseEditor").click();
    }
  });
});

/* ======================= JĘZYKI, TELEFON ======================= */

for (const lang of ["en", "uk"]) {
  test(`język ${lang}: żadnego surowego klucza tłumaczenia na liście i w trzech trybach`, async ({ page, context }) => {
    await context.addInitScript((l) => { try { localStorage.setItem("uiLang", l); } catch {} }, lang);
    await open(page);
    const rawKeys = () => page.evaluate(() => {
      const txt = document.body.innerText + [...document.querySelectorAll("[title],[aria-label],[placeholder],[data-tip]")]
        .map((e) => `${e.title} ${e.getAttribute("aria-label")} ${e.placeholder || ""} ${e.dataset.tip || ""}`).join(" ");
      return (txt.match(/logoEditor\.[\w.]+/g) || []).slice(0, 5);
    });
    expect(await rawKeys()).toEqual([]);
    for (const mode of ["Text", "Draw", "Image"]) {
      await L.createNew(page, mode, L.uniq(`lang-${mode}`));
      expect(await rawKeys()).toEqual([]);
      await page.locator("#btnCloseEditor").click();
    }
  });
}

test.describe("telefon", () => {
  test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

  test("lista i podgląd działają; tworzenie i edycja są ukryte", async ({ page }) => {
    await open(page);
    const id = await L.insertLogo(page, { name: L.uniq("mobile"), type: "GLYPH_30x10", payload: L.textPayload("AB") });
    await open(page);
    await expect(page.locator("#grid .addCard")).toBeHidden();
    await expect(page.locator("#btnEdit")).toBeHidden();
    await page.locator(`.logoTile[data-key="${id}"]`).tap();
    await page.locator("#btnPreview").tap();
    await expect(page.locator("#previewOverlay")).toBeVisible();
  });
});
