#!/usr/bin/env node
// Wypala logo demo prawdziwymi edytorami: otwiera edytor (TEXT/DRAW/IMAGE)
// z samym źródłem z data/logo-sources.cjs, wywołuje autozapis i przechwytuje
// payload wysłany do update_logo_checked. Wynik: data/logos.baked.json.
//   node scripts/screens/bake-logos.cjs
// Uruchamiać po zmianie źródeł logo albo formatu zapisu edytorów.
const fs = require("node:fs");
const path = require("node:path");
const { startServer, stopServer, launch, newContext } = require("./lib.cjs");
const { buildDb, id } = require("./data/demo.cjs");
const sources = require("./data/logo-sources.cjs");

const LOGO_ID = id("8300", 999);
const DESKTOP = { width: 1400, height: 900, scale: 1, mobile: false };
const READY = {
  TEXT: () => !!document.getElementById("logoName")?.value,
  DRAW: () => window.__drawFabric?.getObjects().length > 0,
  IMAGE: () => !!document.getElementById("logoName")?.value,
};

async function svgToPng(browser, svg) {
  const page = await browser.newPage();
  const data = await page.evaluate(async (svg) => {
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  }, svg);
  await page.close();
  return data;
}

async function bake(browser, origin, mode, source, name) {
  const db = buildDb("pl");
  db.tables.user_logos.push({ id: LOGO_ID, user_id: db.user.id, name, type: mode === "TEXT" ? "GLYPH_30x10" : "PIX_150x70", payload: { source }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  db.rpc.update_logo_checked = "fn:(args) => { window.__BAKED__ = args.p_patch; return { ok: true }; }";
  const context = await newContext(browser, db, "pl", DESKTOP);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push((e.stack || e.message).split("\n").slice(0, 4).join(" | ")));
  await page.goto(`${origin}/logos/editor/${mode.toLowerCase()}/?id=${LOGO_ID}&lang=pl`);
  await page.waitForFunction(READY[mode], null, { timeout: 20000 });
  await page.waitForTimeout(mode === "IMAGE" ? 1500 : 500);
  await page.evaluate(() => {
    const input = document.getElementById("logoName");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  try {
    await page.waitForFunction(() => window.__BAKED__, null, { timeout: 20000 });
  } catch {
    const status = await page.evaluate(() => document.querySelector("[data-save-status], #saveStatus, .saveStatus")?.textContent || "");
    throw new Error(`${mode} „${name}”: edytor nie zapisał (${status || "brak statusu"}) ${errors.join("; ")}`);
  }
  const patch = await page.evaluate(() => window.__BAKED__);
  await context.close();
  return patch;
}

(async () => {
  const origin = await startServer();
  const browser = await launch();
  const out = [];
  try {
    for (const item of sources) {
      const entry = { names: item.names, age: item.age, mode: item.mode };
      if (item.mode === "TEXT") {
        entry.payloads = {};
        for (const [lang, text] of Object.entries(item.text)) {
          const patch = await bake(browser, origin, "TEXT", { mode: "TEXT", text }, item.names.pl);
          entry.type = patch.type;
          entry.payloads[lang] = patch.payload;
        }
      } else {
        const source = item.mode === "IMAGE" ? { mode: "IMAGE", imageData: await svgToPng(browser, item.svg) } : item.source;
        const patch = await bake(browser, origin, item.mode, source, item.names.pl);
        entry.type = patch.type;
        entry.payload = patch.payload;
      }
      out.push(entry);
      console.log(`✓ ${item.mode} ${item.names.pl} (${entry.type})`);
    }
  } finally {
    await browser.close();
    stopServer();
  }
  const file = path.join(__dirname, "data/logos.baked.json");
  fs.writeFileSync(file, `${JSON.stringify(out)}\n`);
  console.log(`Zapisano ${out.length} logo: ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
})().catch((e) => { console.error(e.stack || e); stopServer(); process.exitCode = 1; });
