const { test, expect } = require("./helpers/production-test");
const { loginAsTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");
const L = require("./helpers/logo-editor");

const ORIGIN = "https://www.familiada.online";
test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "parallel" });

const previewHarness = `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test DRAW Host/Display</title><style>
*{box-sizing:border-box}body{margin:0;padding:18px;background:#10131a;color:#fff;font:14px system-ui}.grid{height:calc(100vh - 36px);display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel{min-width:0;min-height:0;display:flex;flex-direction:column}.panel b{padding:0 0 7px;text-transform:uppercase;letter-spacing:.06em;color:#ffcc00}.panel iframe{width:100%;height:100%;border:1px solid #424652;border-radius:8px;background:#000}
</style><div class="grid"><div class="panel"><b>Display</b><iframe id="display" src="/control/display/?preview=1"></iframe></div><div class="panel"><b>Host</b><iframe id="host" src="/control/host/?preview=1"></iframe></div></div><script>
const ready=new Set();addEventListener('message',e=>{if(e.origin!==location.origin||!['familiada:preview-ready','familiada:host-preview-ready'].includes(e.data?.type))return;ready.add(e.source);if(ready.size===2)window.previewReady=true});window.applyRow=async row=>{for(const id of ['display','host'])document.getElementById(id).contentWindow.postMessage({type:'familiada:preview-row',row},location.origin);await new Promise(resolve=>setTimeout(resolve,1600))};
</script></html>`;

async function cleanupPreviousDrawRows(page, accountNumber) {
  const prefix = `E2E-HOST-DRAW-${accountNumber}-`;
  await page.evaluate(async namePrefix => {
    const sb = window.__sbClient;
    const { data, error } = await sb.from("user_logos").select("id,payload->source->>hostRasterUrl").like("name", `${namePrefix}%`);
    if (error) throw new Error(error.message);
    const ids = (data || []).map(row => row.id);
    if (!ids.length) return;
    const paths = data.map(row => String(row.hostRasterUrl || "").split("/user-logos/")[1]?.split("?")[0]).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await sb.storage.from("user-logos").remove(paths);
      if (storageError) throw new Error(storageError.message);
    }
    const { error: deleteError } = await sb.from("user_logos").delete().in("id", ids);
    if (deleteError) throw new Error(deleteError.message);
  }, prefix);
}

async function runDrawRoundTrip(page, context, accountNumber, testInfo) {
  test.setTimeout(120_000);
  await serveBranchCode(context, { pages: ["logo", "host", "display"] });
  // This dedicated spec has explicit permission to use test9/test10. They
  // remain excluded from the shared account pool and general E2E suites.
  await loginAsTestUser(page, context, { username: `test${accountNumber}@familiada.online` });
  const name = `E2E-HOST-DRAW-${accountNumber}-${Date.now()}`;
  let logoId = null;
  try {
    // A prior interrupted run may have stopped before its finally cleanup.
    // The account-specific prefix is reserved for this spec only.
    await cleanupPreviousDrawRows(page, accountNumber);
    // Insert only the empty DRAW row, then exercise the real editor. The
    // list's create action is guarded while an account has an active game or
    // settings lock; that guard is covered by the existing logo E2E.
    logoId = await L.insertLogo(page, {
      name,
      type: "PIX_150x70",
      payload: {
        w: 150, h: 70, format: "BITPACK_MSB_FIRST_ROW_MAJOR",
        bits_b64: Buffer.alloc(19 * 70).toString("base64"),
        source: { mode: "DRAW" },
      },
    });
    await page.goto(`${ORIGIN}/logo/editor/draw/?id=${encodeURIComponent(logoId)}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#editorShell")).toHaveAttribute("data-mode", "DRAW");
    await expect(page.locator("#logoName")).toBeEnabled({ timeout: 15000 });
    await page.evaluate(() => {
      const canvas = window.__drawFabric;
      const fabric = window.fabric;
      if (!canvas || !fabric) throw new Error("Edytor DRAW nie udostępnił sceny Fabric");
      const width = canvas.getWidth(), height = canvas.getHeight();
      canvas.discardActiveObject();
      const layers = [
        new fabric.Rect({ left: width * .10, top: height * .20, width: width * .60, height: height * .50, fill: "#fff", strokeWidth: 0 }),
        new fabric.Rect({ left: width * .25, top: height * .38, width: width * .20, height: height * .24, fill: "#000", strokeWidth: 0 }),
        new fabric.Circle({ left: width * .35 - Math.min(width, height) * .035, top: height * .50 - Math.min(width, height) * .035, radius: Math.min(width, height) * .035, fill: "#fff", strokeWidth: 0 }),
      ];
      for (const layer of layers) canvas.add(layer);
      canvas.fire("object:modified", { target: layers.at(-1) });
      canvas.requestRenderAll();
    });
    await expect.poll(() => page.locator("#saveStatus").getAttribute("data-state"), { timeout: 25_000 }).toBe("saved");
    const saved = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("user_logos").select("id,name,type,payload").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data;
    }, logoId);
    expect(saved.payload.source.mode).toBe("DRAW");
    expect(saved.payload.source.fabricData.objects).toHaveLength(3);
    expect(saved.payload.source).not.toHaveProperty("hostRasterUrl");
    expect(saved.payload.source).not.toHaveProperty("hostRasterData");

    const transfer = await page.evaluate(async logo => {
      const { buildExport, parseImport } = await import("/logo/js/transfer.js?v=svg-draw-no-png");
      const file = await buildExport(logo, "test");
      const imported = parseImport(JSON.stringify(file), "test");
      return {
        exportedHasRaster: Object.hasOwn(file.payload.source, "hostRasterUrl") || Object.hasOwn(file.payload.source, "hostRasterData"),
        importedHasRaster: Object.hasOwn(imported.payload.source, "hostRasterUrl") || Object.hasOwn(imported.payload.source, "hostRasterData"),
        fabricObjects: imported.payload.source.fabricData?.objects?.length || 0,
      };
    }, saved);
    expect(transfer).toEqual({ exportedHasRaster: false, importedHasRaster: false, fabricObjects: 3 });

    await context.route(`${ORIGIN}/__host_draw_preview`, route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: previewHarness }));
    await page.goto(`${ORIGIN}/__host_draw_preview`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.previewReady === true, null, { timeout: 25_000 });
    const row = {
      top_card: "rounds", step: "r_intro", phase: null, control_team: null,
      sound_cue_key: null, sound_cue_seq: 0,
      detail: {
        teams: { teamA: "Drużyna A", teamB: "Drużyna B" },
        rounds: { roundNo: 1, bankPts: 0, xA: 0, xB: 0, totals: { A: 0, B: 0 } },
        final: { runtime: {} },
        display: { mode: "GAME", colors: { A: "#c4002f", B: "#2a62ff", DOT: "#d7ff3d" }, theme: "modern", logoId, hostLogoMode: "source", logoPreview: saved },
        host: { covered: true }, locks: { gameEnded: false },
      },
    };
    await page.evaluate(data => window.applyRow(data), row);
    const host = page.frameLocator("#host");
    await expect(host.locator("#cover2Logo img")).toBeVisible();
    const pixels = await host.locator("#cover2Logo img").evaluate(async image => {
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const alpha = (x, y) => context.getImageData(Math.round(x * canvas.width), Math.round(y * canvas.height), 1, 1).data[3];
      return {
        whiteShowsDot: alpha(.15, .30) > 200,
        blackCutsWhite: alpha(.29, .42) < 40,
        whiteOnTopRestoresDot: alpha(.35, .50) > 200,
        outsideRemainsClear: alpha(.80, .80) < 40,
      };
    });
    expect(pixels).toEqual({ whiteShowsDot: true, blackCutsWhite: true, whiteOnTopRestoresDot: true, outsideRemainsClear: true });
    await expect.poll(() => page.frameLocator("#display").locator("#displays").locator("*").count()).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`host-draw-account-${accountNumber}.png`), fullPage: true });
  } finally {
    // Zwolnij blokadę edytora przed skasowaniem wyłącznie utworzonego logo.
    await page.goto(`${ORIGIN}/games/`, { waitUntil: "domcontentloaded" }).catch(() => {});
    if (logoId) await page.evaluate(async id => {
      const sb = window.__sbClient;
      const { data } = await sb.from("user_logos").select("payload->source->>hostRasterUrl").eq("id", id).maybeSingle();
      const path = String(data?.hostRasterUrl || "").split("/user-logos/")[1]?.split("?")[0];
      if (path) await sb.storage.from("user-logos").remove([path]);
      await sb.from("user_logos").delete().eq("id", id);
    }, logoId).catch(() => {});
  }
}

test("DRAW: zapis z edytora i odtworzenie warstw na Hostcie obok Display (konto test9)", async ({ page, context }, testInfo) => {
  await runDrawRoundTrip(page, context, 9, testInfo);
});

test("DRAW: równoległy przebieg izolowany na koncie test10", async ({ page, context }, testInfo) => {
  await runDrawRoundTrip(page, context, 10, testInfo);
});
