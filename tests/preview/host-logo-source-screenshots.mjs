import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webRoot = path.join(repo, "web");
const out = path.join(repo, "tests/recordings/host-logo-source");
const contentTypes = new Map([[".css", "text/css"], [".html", "text/html"], [".js", "text/javascript"], [".json", "application/json"], [".svg", "image/svg+xml"], [".ttf", "font/ttf"], [".png", "image/png"]]);
async function readLogoExport(filename) {
  const exported = JSON.parse(await fs.readFile(path.join(repo, "tests/preview", filename), "utf8"));
  return { type: exported.kind === "PIX" ? "PIX_150x70" : "GLYPH_30x10", name: exported.name, payload: exported.payload };
}
const textLogo = await readLogoExport("DEMO - Logo Tekst.famlogo.json");
const drawLogo = await readLogoExport("DEMO - Logo Rysunek.famlogo.json");
const imageLogo = await readLogoExport("DEMO - Logo Obraz.famlogo.json");
const imageData = imageLogo.payload.source.imageData;
if (!imageData?.startsWith("data:image/png;base64,")) throw new Error("Przesłany eksport IMAGE nie zawiera osadzonego PNG");
const imageBytes = Buffer.from(imageData.slice(imageData.indexOf(",") + 1), "base64");
delete imageLogo.payload.source.imageData;
imageLogo.payload.source.imageUrl = "/_storage/demo-logo-image.png";
const logos = { tekst: textLogo, rysunek: drawLogo, obraz: imageLogo };
let imageStorageFetches = 0;

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/shared/css/base.css"><link rel="stylesheet" href="/shared/css/game-settings.css"><link rel="stylesheet" href="/control/css/control.css"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg,#0b0d12);color:#fff;font:15px system-ui}.screen{height:100%;display:flex;flex-direction:column}.screen[hidden]{display:none!important}.topbar{height:64px;flex:none;padding:0 26px;border-bottom:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:space-between;background:#10131a}.brand{font-weight:900;letter-spacing:.06em;color:#ffd54a}.page-title{font-weight:800}.screen-body{flex:1;min-height:0;display:grid;grid-template-columns:205px minmax(0,1fr)}.sidebar{padding:20px 12px;border-right:1px solid rgba(255,255,255,.1);color:#aeb4c1}.sidebar div{padding:10px 12px;border-radius:8px}.sidebar .active{background:rgba(255,213,74,.1);color:#ffd54a}.settings-main{min-width:0;overflow:auto;padding:22px 26px}.gs-cat-title{margin-bottom:12px}.gs-section{margin-bottom:10px;padding:14px 16px}.gs-live-preview-grid{gap:12px;margin-top:10px}.gs-live-preview-title{margin-bottom:5px}.display-preview{margin:0!important}.preview-display{width:100%;height:100%;display:block;border:0;background:#05070a}.swatches{display:flex;gap:9px;margin-top:8px}.swatches i{width:22px;height:22px;border-radius:50%;border:1px solid #ffffff66}.settings-actions{display:flex;justify-content:flex-end;margin:8px 0 0}.settings-actions button{border:0;border-radius:9px;padding:10px 17px;background:#f2c94c;color:#211b08;font-weight:800}.summary-main{padding:22px 28px;overflow:auto}.summary-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:12px}.summary-head h1{font-size:21px;margin:0}.summary-head span{color:#9da4b2}.summarySection{margin:0;padding:14px 18px}.summaryDisplayInfo{gap:7px}.summaryDisplayRow{font-size:14px}.summaryDisplayLabel{font-size:14px}.summarySectionTitle{font-size:11px}#c2DevicePreviews{width:100%;max-width:none;margin-top:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.c2-device-preview-title{margin:0 0 6px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--gold)}#c2DisplayPreview,#c2HostPreview{width:100%;height:auto;aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden;border:1px solid var(--line2)}#c2HostPreview iframe{width:100%;height:100%;display:block;border:0}.preview-host{width:100%;height:100%;display:block;border:0}.radio-display{display:flex;gap:9px;align-items:center}.radio-display b{font-size:13px;color:#bbc1cc}.hint{margin-top:6px;color:#a6acb8;font-size:12px}.summary-tail{margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.summary-tail div{padding:12px 16px;border-radius:10px;background:#ffffff0c}.summary-tail b{display:block;color:var(--gold);font-size:10px;text-transform:uppercase;margin-bottom:4px}
</style></head><body>
<section class="screen" id="screenSettings"><header class="topbar"><span class="brand">FAMILIADA</span><span class="page-title">Ustawienia gry</span><button class="btn sm">Zapisz</button></header><div class="screen-body"><aside class="sidebar"><div>Gra</div><div>Drużyny</div><div class="active">Wygląd</div><div>Dźwięki</div><div>Pytania</div></aside><main class="settings-main"><div class="gs-cat-title">Wyświetlacz</div><section class="gs-section"><div class="gs-label">Kolory planszy</div><div class="swatches"><i style="background:#c4002f"></i><i style="background:#2a62ff"></i><i style="background:#10131a"></i><i style="background:#ffcc00"></i></div></section><section class="gs-section"><div class="gs-label">Logo na prowadzącym</div><div class="toggle-group gs-host-logo-mode"><label class="toggle-item"><input type="radio" disabled id="pixelRadio"><span class="toggle-slider" data-text="Piksele"></span></label><label class="toggle-item"><input type="radio" disabled id="sourceRadio"><span class="toggle-slider" data-text="Źródło"></span></label></div><div class="hint">Wybierz, jak własne logo ma wyglądać na ekranie prowadzącego.</div></section><div class="gs-live-preview-grid"><section class="gs-live-preview-card"><div class="gs-live-preview-title">Podgląd wyświetlacza</div><div class="display-preview"><iframe id="displaySettings" class="preview-display" src="/display/?preview=1"></iframe></div></section><section class="gs-live-preview-card"><div class="gs-live-preview-title">Podgląd prowadzącego</div><div class="display-preview"><iframe id="hostSettings" class="preview-host" src="/host/?preview=1"></iframe></div></section></div><div class="settings-actions"><button type="button">Zapisz ustawienia</button></div></main></div></section>
<section class="screen" id="screenControl" hidden><header class="topbar"><span class="brand">FAMILIADA</span><span class="page-title">Pulpit gry</span><button class="btn sm">Dalej</button></header><main class="summary-main"><div class="summary-head"><h1>Podsumowanie ustawień</h1><span>Przed rozpoczęciem gry</span></div><section class="summarySection c2-summary-display"><div class="summarySectionTitle">Wygląd planszy i logo</div><div class="summaryDisplayInfo"><div class="summaryDisplayRow"><span class="summaryDisplayLabel">Kolory:</span><span class="swatches"><i style="background:#c4002f"></i><i style="background:#2a62ff"></i><i style="background:#10131a"></i><i style="background:#ffcc00"></i></span></div><div class="summaryDisplayRow"><span class="summaryDisplayLabel">Motyw:</span> Nowoczesny</div><div class="summaryDisplayRow"><span class="summaryDisplayLabel">Logo:</span> Własne logo</div><div class="summaryDisplayRow"><span class="summaryDisplayLabel">Logo prowadzącego:</span><span id="summaryMode">Piksele</span></div><div id="c2DevicePreviews"><div class="c2-device-preview-card"><div class="c2-device-preview-title">Podgląd wyświetlacza</div><div id="c2DisplayPreview"><iframe id="displayControl" class="preview-display" src="/display/?preview=1"></iframe></div></div><div class="c2-device-preview-card"><div class="c2-device-preview-title">Podgląd prowadzącego</div><div id="c2HostPreview"><iframe id="hostControl" class="preview-host" src="/host/?preview=1"></iframe></div></div></div></div></section><div class="summary-tail"><div><b>Drużyny</b>Orły / Sokoły</div><div><b>Finał</b>Włączony</div></div></main></section>
<script>window.cases=${JSON.stringify(logos)};const ready=new Set();window.addEventListener('message',e=>{if(e.origin!==location.origin||!['familiada:host-preview-ready','familiada:preview-ready'].includes(e.data?.type))return;ready.add(e.source);if(ready.size>=4)window.hostReady=true});window.makeComposite=async()=>{const logo=structuredClone(window.cases.obraz);const image=new Image();image.src=logo.payload.source.imageUrl;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const overlay=new Image();overlay.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="260" height="110"><path d="M20 90 L110 12 L155 90 Z" fill="#00f5ff" fill-opacity=".82"/><circle cx="210" cy="50" r="30" fill="#ff00cc" fill-opacity=".72"/></svg>');await overlay.decode();ctx.drawImage(overlay,canvas.width*.22,canvas.height*.12,canvas.width*.56,canvas.height*.76);logo.name='obraz-warstwowy';logo.payload.source.imageData=canvas.toDataURL('image/png');delete logo.payload.source.imageUrl;logo.payload.source.rotate=0;logo.payload.source.straighten=0;logo.payload.source.crop={v:2,x:0,y:0,w:1};window.cases['obraz-warstwowy']=logo};window.setCase=async(name,mode,screen,logoOverride)=>{document.getElementById('screenSettings').hidden=screen!=='settings';document.getElementById('screenControl').hidden=screen!=='control';document.getElementById('pixelRadio').checked=mode==='pixel';document.getElementById('sourceRadio').checked=mode==='source';document.getElementById('summaryMode').textContent=mode==='pixel'?'Piksele':'Źródło';document.title=name+' · '+screen+' · '+mode;const row={top_card:'rounds',step:'r_intro',phase:null,control_team:null,sound_cue_key:null,sound_cue_seq:0,detail:{teams:{teamA:'Drużyna A',teamB:'Drużyna B'},rounds:{roundNo:1,bankPts:0,xA:0,xB:0,totals:{A:0,B:0}},final:{runtime:{}},display:{mode:'GAME',colors:{A:'#c4002f',B:'#2a62ff',DOT:'#d7ff3d'},theme:'modern',logoId:'logo-'+name,hostLogoMode:mode,logoPreview:logoOverride||window.cases[name]},host:{covered:true},locks:{gameEnded:false}}};for(const id of ['hostSettings','hostControl','displaySettings','displayControl'])document.getElementById(id).contentWindow.postMessage({type:'familiada:preview-row',row},location.origin);await new Promise(r=>setTimeout(r,1200));};</script></body></html>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/host-logo-test/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); return; }
  if (url.pathname === "/_storage/demo-logo-image.png") { imageStorageFetches++; res.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*" }); res.end(imageBytes); return; }
  const pathname = decodeURIComponent(url.pathname);
  const file = path.resolve(webRoot, `.${pathname.endsWith("/") ? pathname + "index.html" : pathname}`);
  if (!file.startsWith(webRoot + path.sep)) { res.writeHead(403).end(); return; }
  try { const body = await fs.readFile(file); res.writeHead(200, { "content-type": contentTypes.get(path.extname(file)) || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404).end("Not found"); }
});
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => console.error("PAGE ERROR", error.message));
  page.on("console", message => { if (message.type() === "error") console.error("CONSOLE ERROR", message.text()); });
  await page.addInitScript(() => localStorage.setItem("uiLang", "pl"));
  await page.goto(`${origin}/host-logo-test/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.hostReady === true, null, { timeout: 30000 });
  await page.evaluate(() => window.makeComposite());
  for (const [name] of Object.entries(await page.evaluate(() => window.cases))) {
    for (const screen of ["settings", "control"]) for (const mode of ["pixel", "source"]) {
      const frameId = screen === "settings" ? "hostSettings" : "hostControl";
      await page.evaluate(({ name, mode, screen }) => window.setCase(name, mode, screen), { name, mode, screen });
      const host = page.frameLocator(`#${frameId}`);
      const displayId = screen === 'settings' ? 'displaySettings' : 'displayControl';
      const display = page.frameLocator(`#${displayId}`);
      const rendered = await host.locator("#cover2Logo").evaluate(el => el.childElementCount > 0).catch(() => false);
      if (!rendered) throw new Error(`Logo ${name}/${screen}/${mode} nie zostało wyrenderowane: ${await host.locator("#cover2Logo").evaluate(el => el.innerHTML)}`);
      const displayPainted = await display.locator('#baseSvg, #displaysSvg').count().then(count => count === 2).catch(() => false);
      if (!displayPainted) throw new Error(`Rzeczywisty podgląd Display nie uruchomił się dla ${screen}/${mode}`);
      if (mode === "source") {
        const result = await host.locator("#cover2Logo").evaluate(async (el, type) => {
          if (type === "tekst") {
            const canvas = el.querySelector("canvas"), ctx = canvas?.getContext("2d");
            const pixels = canvas && ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let hasInk = false;
            if (pixels) for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) { hasInk = true; break; }
            const alpha = !!pixels && hasInk;
            return { valid: !!alpha && canvas.style.transform === "scaleY(1.35)", enlarged: canvas?.style.transform };
          }
          if (type === "obraz" || type === "obraz-warstwowy") {
            const canvas = el.querySelector("canvas"), ctx = canvas?.getContext("2d");
            if (!canvas || canvas.height < 1 || canvas.height > 542) return { valid: false, height: canvas?.height };
            const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data.filter((_, i) => i % 4 === 3);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const cyan = pixels.some((value, index) => index % 4 === 0 && value < 35 && pixels[index + 1] > 190 && pixels[index + 2] > 190 && pixels[index + 3] > 100);
            const magenta = pixels.some((value, index) => index % 4 === 0 && value > 190 && pixels[index + 1] < 60 && pixels[index + 2] > 150 && pixels[index + 3] > 100);
            const layered = type !== "obraz-warstwowy" || (cyan && magenta);
            return { valid: alpha.some(value => value === 0) && alpha.some(value => value > 0) && layered, cyan, magenta, height: canvas.height };
          }
          const image = el.querySelector("img");
          const svg = image?.src.startsWith("data:image/svg+xml") ? decodeURIComponent(image.src.split(",")[1]) : "";
          await image?.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image?.naturalWidth || 1; canvas.height = image?.naturalHeight || 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let minAlpha = 255, maxAlpha = 0, transparent = false, opaque = false;
          for (let i = 3; i < pixels.length; i += 4) {
            const value = pixels[i];
            minAlpha = Math.min(minAlpha, value); maxAlpha = Math.max(maxAlpha, value);
            if (value === 0) transparent = true;
            if (value > 0) opaque = true;
          }
          const strokeWidths = [...svg.matchAll(/stroke-width(?:=|:)\s*["']?([\d.]+)/g)].map(match => Number(match[1]));
          return {
            valid: svg.includes("<mask") && svg.includes("mask-type:luminance") && svg.includes("#ffcc00") &&
              transparent && opaque &&
              strokeWidths.length > 0 && Math.max(...strokeWidths) <= 20,
            mask: svg.includes("<mask"), luminance: svg.includes("mask-type:luminance"),
            dot: svg.includes("#ffcc00"), alphaRange: [minAlpha, maxAlpha], strokeWidths,
          };
        }, name);
        if (!result.valid) throw new Error(`Niepoprawny wariant źródłowy ${name}: ${JSON.stringify(result)}`);
      }
      await page.screenshot({ path: path.join(out, `${name}-${screen}-${mode}.png`) });
    }
  }
  if (!imageStorageFetches) throw new Error("IMAGE preview did not read the logo from the Storage route");

  // Draw a deterministic layered scene with the real Fabric.js engine, save its
  // editor-shaped JSON, reload it, then send that exact payload to Host+Display.
  const hostFrame = page.frames().find(frame => frame.url().includes("/host/?preview=1"));
  if (!hostFrame) throw new Error("Nie znaleziono rzeczywistej ramki Hosta");
  const drawRoundTrip = await hostFrame.evaluate(async () => {
    if (!globalThis.fabric?.StaticCanvas) throw new Error("Fabric.js nie został załadowany przez render DRAW");
    const scene = new fabric.StaticCanvas(document.createElement("canvas"), { width: 1040, height: 440, renderOnAddRemove: false });
    scene.add(new fabric.Rect({ left: 100, top: 100, width: 600, height: 220, fill: "#fff", strokeWidth: 0 }));
    scene.add(new fabric.Rect({ left: 250, top: 170, width: 200, height: 100, fill: "#000", strokeWidth: 0 }));
    scene.add(new fabric.Circle({ left: 320, top: 190, radius: 30, fill: "#fff", strokeWidth: 0 }));
    const saved = { name: "DRAW — zapis i odczyt warstw", type: "PIX_150x70", payload: { w: 150, h: 70, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64: "AA==", source: { mode: "DRAW", bg: "BLACK", world: { w: 1040, h: 440 }, fabricData: scene.toJSON() } } };
    localStorage.setItem("host-logo-draw-roundtrip", JSON.stringify(saved));
    scene.dispose();
    return JSON.parse(localStorage.getItem("host-logo-draw-roundtrip"));
  });
  await page.evaluate(({ logo }) => window.setCase("draw-roundtrip", "source", "control", logo), { logo: drawRoundTrip });
  const drawFrame = page.frameLocator("#hostControl");
  const drawResult = await drawFrame.locator("#cover2Logo img").evaluate(async image => {
    await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0);
    const read = (x, y) => context.getImageData(Math.round(x * canvas.width / 1040), Math.round(y * canvas.height / 440), 1, 1).data[3];
    return { width: image.naturalWidth, hasWhite: read(150, 140) > 200, blackCutsThroughWhite: read(270, 185) < 40, whiteTopLayerRestoresDot: read(350, 220) > 200, outsideTransparent: read(800, 350) < 40, src: image.src };
  });
  if (!(drawResult.width > 0 && drawResult.hasWhite && drawResult.blackCutsThroughWhite && drawResult.whiteTopLayerRestoresDot && drawResult.outsideTransparent)) throw new Error(`DRAW warstwy po zapisie i odczycie nie zgadzają się: ${JSON.stringify(drawResult)}`);

  // Exercise the actual editor rasterizer: flatten Fabric first, make a
  // transparent luminance mask, then let Host tint that saved PNG.
  const hostRasterData = await hostFrame.evaluate(async () => {
    const { sceneToHostRaster } = await import("/logo/js/draw/raster.js?v=v2026-10-09TDRAWHOST1");
    const scene = new fabric.StaticCanvas(document.createElement("canvas"), { width: 1040, height: 440, renderOnAddRemove: false });
    scene.backgroundColor = "#000";
    scene.add(new fabric.Rect({ left: 100, top: 100, width: 600, height: 220, fill: "#fff", strokeWidth: 0 }));
    scene.add(new fabric.Rect({ left: 250, top: 170, width: 200, height: 100, fill: "#000", strokeWidth: 0 }));
    scene.add(new fabric.Circle({ left: 320, top: 190, radius: 30, fill: "#fff", strokeWidth: 0 }));
    const blob = await sceneToHostRaster(fabric, scene.toJSON(), 1040, 440);
    scene.dispose();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
    });
  });
  const rasterLogo = structuredClone(drawRoundTrip);
  rasterLogo.payload.source.hostRasterUrl = hostRasterData;
  await page.evaluate(logo => window.setCase("draw-roundtrip-raster", "source", "control", logo), rasterLogo);
  const rasterResult = await drawFrame.locator("#cover2Logo canvas").evaluate(canvas => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const read = (x, y) => context.getImageData(Math.round(x * canvas.width / 1040), Math.round(y * canvas.height / 440), 1, 1).data;
    const white = read(150, 140), cut = read(270, 185), restored = read(350, 220), outside = read(800, 350);
    return { width: canvas.width, height: canvas.height, white: [...white], blackAlpha: cut[3], restoredAlpha: restored[3], outsideAlpha: outside[3] };
  });
  if (!(rasterResult.width === 1280 && rasterResult.height > 500 && rasterResult.white[3] > 200 && rasterResult.white[0] === 255 && rasterResult.white[1] === 204 && rasterResult.white[2] === 0 && rasterResult.blackAlpha < 40 && rasterResult.restoredAlpha > 200 && rasterResult.outsideAlpha < 40)) {
    throw new Error(`Niepoprawny PNG DRAW z warstwami Fabric: ${JSON.stringify(rasterResult)}`);
  }
  const transferResult = await hostFrame.evaluate(async imageData => {
    const { buildExport, parseImport } = await import("/logo/js/transfer.js?v=v2026-10-09TDRAWHOST1");
    const logo = { name: "DRAW transfer", type: "PIX_150x70", payload: { w: 150, h: 70, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64: "AA==", source: { mode: "DRAW", hostRasterUrl: imageData } } };
    const exported = await buildExport(logo, "DRAW transfer");
    const imported = parseImport(JSON.stringify(exported), "DRAW transfer");
    return {
      embeddedPng: exported.payload.source.hostRasterData?.startsWith("data:image/png;base64,") || false,
      removedStorageUrl: !exported.payload.source.hostRasterUrl,
      importKeepsPng: imported.payload.source.hostRasterData?.startsWith("data:image/png;base64,") || false,
    };
  }, hostRasterData);
  if (!transferResult.embeddedPng || !transferResult.removedStorageUrl || !transferResult.importKeepsPng) {
    throw new Error(`Eksport/import DRAW nie zachował PNG: ${JSON.stringify(transferResult)}`);
  }
  await page.screenshot({ path: path.join(out, "draw-roundtrip-control-source.png") });

  const gallery = `<!doctype html><meta charset="utf-8"><title>Logo prowadzącego — Ustawienia i Control</title><style>body{font:16px system-ui;background:#17181d;color:#eee;margin:24px}h1{font-size:24px}p{color:#bbb}section{margin:28px 0}h2{font-size:18px}div.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}figure{margin:0}figcaption{font-size:12px;color:#bbc1cc;margin:0 0 5px}img{width:100%;border-radius:8px;border:1px solid #393b43}</style><h1>Logo prowadzącego — Ustawienia i Control</h1><p>12 zrzutów: dla każdego typu logo Ustawienia rozgrywki i podsumowanie Control w trybie Piksele oraz Źródło.</p>${Object.keys(await page.evaluate(() => window.cases)).map(name=>`<section><h2>${name}</h2><div class="grid">${["settings-pixel","settings-source","control-pixel","control-source"].map(key=>`<figure><figcaption>${key.replace("settings","Game Settings").replace("control","Control")}</figcaption><img src="${name}-${key}.png"></figure>`).join("")}</div></section>`).join("")}`;
  await fs.writeFile(path.join(out, "index.html"), gallery);
  console.log(`Zapisano ${Object.keys(await page.evaluate(() => window.cases)).length * 4 + 1} zrzutów ekranu (w tym DRAW warstwy/zapis/odczyt): ${path.relative(repo, out)}`);
} finally { await browser.close(); server.close(); }
