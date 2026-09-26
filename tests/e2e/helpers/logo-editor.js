// tests/e2e/helpers/logo-editor.js
// Wspólne kroki testów edytora logo (logo-editor.spec.js).

const { expect } = require("@playwright/test");
const { isKnownNoiseText } = require("./login");

const PREFIX = "E2E-LE2-"; // prefiks z czasu kopii logo-editor2 -- zostawiony, żeby sprzątanie łapało stare resztki
const uniq = (label) => `${PREFIX}${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

/** Błędy JS strony i błędy konsoli pochodzące z plików edytora. */
function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /\/logo-editor\//.test(m.location()?.url || "") && !isKnownNoiseText(m.text())) errors.push(m.text());
  });
  return errors;
}

async function openList(page, site, path = "/logo-editor") {
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

async function createNew(page, mode, name) {
  await page.locator("#grid .addCard").click();
  await page.locator(`#pick${mode}`).click();
  await page.fill("#renameInput", name);
  await page.locator("#btnRenameOk").click();
  await expect(page.locator("#editorShell")).toHaveAttribute("data-mode", mode.toUpperCase(), { timeout: 10000 });
  if (mode === "Draw") await page.waitForTimeout(300);
}

async function editLogo(page, site, id) {
  await openList(page, site);
  await page.locator(`.logoTile[data-key="${id}"]`).click();
  await page.locator("#btnEdit").click();
}

async function save(page) {
  await page.locator("#btnCreate").click();
  await expect(page.locator("#mMsg")).not.toHaveText(/Zapisuję|^$/, { timeout: 20000 });
  return page.locator("#mMsg").textContent();
}

/** Zamyka edytor; gdy pyta o niezapisane zmiany -- odpowiada „Nie” (edytor zostaje) i zwraca true. */
async function isDirty(page) {
  await page.locator("#btnCloseEditor").click();
  const modal = page.locator(".uni-modal");
  const shown = await modal.waitFor({ state: "visible", timeout: 1500 }).then(() => true).catch(() => false);
  if (shown) await modal.locator(".uni-foot .btn:not(.gold)").click();
  return shown;
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
  createNew, editLogo, save, isDirty, stage, drag,
  unpack, pack, litCount, bitDiff, litBox, emptyPix, textPayload, rect,
};
