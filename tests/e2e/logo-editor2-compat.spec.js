// tests/e2e/logo-editor2-compat.spec.js
//
// Zgodność wstecz edytora logo 2 z danymi, które już są w bazie:
//  1) logo zrobione STARYM edytorem (logo-editor.html serwowany z tego samego
//     checkoutu, zapis do prawdziwej bazy) -> otwarte i zapisane bez zmian w
//     nowym -> bity mają wyjść takie same (to widzi wyświetlacz),
//  2) logo demo z konta testowego (kopie, oryginały nietknięte) -> nowy
//     edytor otwiera je i zapis nie niszczy tego, co widać na wyświetlaczu.
//
// Konto test1@ (patrz logo-editor2.spec.js).

const path = require("path");
const { test, expect } = require("@playwright/test");
const { startLocalSite, captureSession, useSession } = require("./helpers/local-site");
const { testAccountUsername } = require("./helpers/login");
const L = require("./helpers/logo-editor2");

const DEMO_IMAGE = path.resolve(__dirname, "../../logo-editor/assets/demo-image.png");

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
  expect(after.source.world).toEqual({ w: 1040, h: 440 });
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
    } else {
      const diff = L.bitDiff(d.payload.bits_b64, after.payload.bits_b64);
      console.log(`[demo] ${d.name}: różnych kropek po zapisie: ${diff}`);
      expect(diff).toBeLessThanOrEqual(Math.ceil(10500 * 0.03));
    }
    await page.locator("#btnCloseEditor").click();
  }
});
