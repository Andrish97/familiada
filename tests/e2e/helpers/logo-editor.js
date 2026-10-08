// tests/e2e/helpers/logo-editor.js
// Wspólne kroki testów logo (logo-editor.spec.js): lista /logo/ i trzy
// strony edytorów /logo/editor-text|draw|image/?id= z autozapisem.

const { expect } = require("@playwright/test");
const { isKnownNoiseText } = require("./login");

const PREFIX = "E2E-LE2-"; // prefiks z czasu kopii logo-editor2 -- zostawiony, żeby sprzątanie łapało stare resztki
const uniq = (label) => `${PREFIX}${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

/** Błędy JS strony i błędy konsoli pochodzące z plików edytora. */
function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /\/logo\//.test(m.location()?.url || "") && !isKnownNoiseText(m.text())) errors.push(m.text());
  });
  return errors;
}

async function openList(page, site, path = "/logo/") {
  await page.goto(`${site.origin}${path}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#grid .addCard")).toBeAttached({ timeout: 20000 });
  await page.waitForFunction(() => !!window.__sbClient, null, { timeout: 20000 });
}

/** Usuwa logo testów (prefiks) i ich pliki w Storage. */
async function cleanup(page) {
  await page.evaluate(async (prefix) => {
    const sb = window.__sbClient;
    if (!sb) return;
    const { data } = await sb.from("user_logos").select("id,imageUrl:payload->source->>imageUrl").like("name", `${prefix}%`);
    const { data: u } = await sb.auth.getUser();
    const paths = (data || []).map((r) => String(r.imageUrl || "").split("/user-logos/")[1]).filter((p) => p && p.startsWith(`${u.user.id}/`));
    if (paths.length) await sb.storage.from("user-logos").remove(paths);
    await sb.from("user_logos").delete().like("name", `${prefix}%`);
  }, PREFIX).catch(() => {});
}

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

/** Czeka, aż strona edytora wczyta logo (pole nazwy odblokowane). */
async function waitEditorReady(page, mode) {
  await page.waitForURL(new RegExp(`/logo/editor-${mode.toLowerCase()}/\\?id=`), { timeout: 15000 });
  await expect(page.locator("#editorShell")).toHaveAttribute("data-mode", mode.toUpperCase());
  await expect(page.locator("#logoName")).toBeEnabled({ timeout: 15000 });
  if (mode.toUpperCase() === "DRAW") await page.waitForTimeout(300);
}

/** „Nowe logo” na liście: wiersz w bazie powstaje od razu, edytor otwiera się z jego id. Zwraca id. */
async function createNew(page, mode, name) {
  const tab = { Text: "#tabLogoText", Draw: "#tabLogoDraw", Image: "#tabLogoImage" }[mode];
  if (!tab) throw new Error(`Unknown logo mode: ${mode}`);
  // Aktywna karta ma nad sobą wypustkę (.tab-active), która przechwytuje klik.
  if (!(await page.locator(tab).getAttribute("class")).includes("active")) await page.locator(tab).click();
  await page.locator("#grid .addCard").click();
  await page.fill("#renameInput", name);
  await page.locator("#btnRenameOk").click();
  await waitEditorReady(page, mode);
  return new URL(page.url()).searchParams.get("id");
}

async function editLogo(page, site, id) {
  const row = await readLogo(page, id);
  const sourceMode = String(row?.payload?.source?.mode || "").toUpperCase();
  const tab = row?.type === "GLYPH_30x10" ? "text" : sourceMode === "IMAGE" || row?.payload?.source?.imageUrl || row?.payload?.source?.imageData ? "image" : "draw";
  await openList(page, site, `/logo/${tab === "text" ? "" : `?tab=${tab}`}`);
  await page.locator(`.logoTile[data-key="${id}"]`).click();
  await page.locator("#btnEdit").click();
  // Edycja zablokowana na liście (alert) zostawia stronę -- wtedy nie czekamy na edytor.
  await Promise.race([
    page.waitForURL(/\/logo\/editor-/, { timeout: 15000 }),
    page.locator(".uni-modal").waitFor({ state: "visible", timeout: 15000 }),
  ]);
  if (/\/logo\/editor-/.test(page.url()) && !(await page.locator("#resourceLockGuard").isVisible().catch(() => false))) {
    await expect(page.locator("#logoName")).toBeEnabled({ timeout: 15000 }).catch(() => {});
  }
}

const STATUS = "#saveStatus";
const settledStates = ["saved", "invalid", "error"];

/**
 * Autozapis: czeka, aż ostatnia zmiana się zapisze (albo okaże się, że nie
 * da się jej zapisać) i zwraca tekst stanu. Bez zmian (stan idle) wymusza
 * zapis „pustą” zmianą nazwy -- payload jest wtedy liczony na nowo z edytora,
 * jak dawny „Zapisz” bez zmian. Zwraca stan (data-state) — strona nie
 * pokazuje żadnego tekstu o zapisie.
 */
async function save(page) {
  const status = page.locator(STATUS);
  if ((await status.getAttribute("data-state")) === "idle") {
    await page.locator("#logoName").dispatchEvent("input");
  }
  await page.waitForFunction(({ sel, done }) => done.includes(document.querySelector(sel)?.dataset.state), { sel: STATUS, done: settledStates }, { timeout: 20000 });
  return status.getAttribute("data-state");
}

/** Czy edytor zarejestrował zmianę (autozapis ruszył)? Świeżo otwarte logo bez zmian: idle. */
async function isDirty(page) {
  return (await page.locator(STATUS).getAttribute("data-state")) !== "idle";
}

/** „Wstecz” z edytora: zapis i powrót na listę logo. */
async function close(page) {
  await page.locator("#btnBack").click();
  await page.waitForURL(/\/logo\/(\?|$)/, { timeout: 20000 });
  await expect(page.locator("#grid .addCard")).toBeAttached({ timeout: 20000 });
}

async function stage(page) {
  return page.locator("#drawStageHost .upper-canvas").boundingBox();
}

async function drag(page, x0, y0, x1, y1, steps = 8) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps });
  await page.mouse.up();
}

/* ---------- bity PIX 150x70 ---------- */

function unpack(b64) {
  const bytes = Buffer.from(b64 || "", "base64");
  const out = new Uint8Array(150 * 70);
  for (let y = 0; y < 70; y++) for (let x = 0; x < 150; x++) {
    const i = y * 19 + (x >> 3);
    out[y * 150 + x] = i < bytes.length ? (bytes[i] >> (7 - (x & 7))) & 1 : 0;
  }
  return out;
}

function pack(bits) {
  const out = Buffer.alloc(19 * 70);
  for (let y = 0; y < 70; y++) for (let x = 0; x < 150; x++) if (bits[y * 150 + x]) out[y * 19 + (x >> 3)] |= 1 << (7 - (x & 7));
  return out.toString("base64");
}

const litCount = (b64) => unpack(b64).reduce((a, b) => a + b, 0);
const bitDiff = (a, b) => { const x = unpack(a), y = unpack(b); let n = 0; for (let i = 0; i < x.length; i++) n += x[i] !== y[i] ? 1 : 0; return n; };

function litBox(b64) {
  const b = unpack(b64);
  const box = { x0: 999, y0: 999, x1: -1, y1: -1 };
  for (let y = 0; y < 70; y++) for (let x = 0; x < 150; x++) if (b[y * 150 + x]) {
    box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y); box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y);
  }
  return box;
}

const emptyPix = { w: 150, h: 70, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64: "" };
const textPayload = (text = "") => ({ layers: [{ color: "main", rows: [] }], source: { mode: "TEXT", text } });
const rect = (left, top, width, height, fill = "#ffffff") => ({ type: "rect", version: "5.3.0", originX: "left", originY: "top", left, top, width, height, fill, stroke: null, strokeWidth: 0 });

module.exports = {
  PREFIX, uniq, collectPageErrors, openList, cleanup, insertLogo, readLogo, readLogoByName,
  createNew, editLogo, waitEditorReady, save, isDirty, close, stage, drag,
  unpack, pack, litCount, bitDiff, litBox, emptyPix, textPayload, rect,
};
