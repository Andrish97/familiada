// Zgodność zapisanych rysunków logo przy zmianie wersji fabric (web/shared/vendor):
// stara wersja vs nowa -- kropki bezpośrednio, po zapisie edytora (toObject + nazwy
// typów z Fabric 5) i po ponownym zapisie; własne pola (_line) i stabilność zapisu.
//   node scripts/agent-tools/fabric-compat-check.cjs <stary fabric.min.js> <nowy fabric.min.js>
// (np. stary: git show <rev>:web/shared/vendor/fabric.min.js > /tmp/old.js).
const fs = require("fs");
const { chromium } = require(process.env.PW || require("path").join(__dirname, "../../tests/node_modules/playwright"));
const baked = JSON.parse(fs.readFileSync(require("path").join(__dirname, "../screens/data/logos.baked.json"), "utf8"));
const scenes = [];
const walk = (o, name) => { if (o && typeof o === "object") { if (o.fabricData && o.mode === "DRAW") scenes.push({ name, data: o.fabricData, w: o.world?.w || 1040, h: o.world?.h || 440 }); for (const v of Object.values(o)) walk(v, name); } };
for (const x of baked) walk(x, x.names?.pl);
// stara scena bez originX (jak test P0-3), świat 700x296, z linią _line
scenes.push({ name: "stara scena 700px bez originX", w: 700, h: 296, data: { version: "5.3.0", background: "#000",
  clipPath: { type: "rect", version: "5.3.0", left: 0, top: 0, width: 700, height: 296, absolutePositioned: true },
  objects: [ { type: "rect", version: "5.3.0", left: 350, top: 0, width: 350, height: 296, fill: "#ffffff", strokeWidth: 0 },
             { type: "path", version: "5.3.0", left: 20, top: 20, path: [["M", 20, 20], ["L", 300, 250]], stroke: "#ffffff", strokeWidth: 12, fill: "", _line: { kind: "line", x1: 20, y1: 20, x2: 300, y2: 250 } } ] } });
const compat = fs.readFileSync(require("path").join(__dirname, "../../web/shared/js/core/fabric-compat.js"), "utf8").replace(/export /g, "");
const RASTER = `
async function bits(json, worldW, worldH){
  const el=fabric.util.createCanvasElement(); el.width=208; el.height=88;
  const sc=new fabric.StaticCanvas(el,{renderOnAddRemove:false,enableRetinaScaling:false});
  const s=Math.min(208/worldW,88/worldH); sc.setViewportTransform([s,0,0,s,0,0]);
  const r = sc.loadFromJSON(json, ()=>{}); if (r && r.then) await r; else await new Promise(res=>setTimeout(res,300));
  sc.renderAll(); const d=el.getContext('2d').getImageData(0,0,208,88).data; sc.dispose();
  const out=[]; for(let y=0;y<88;y++){ if(y%9>=7) continue; for(let x=0;x<208;x++){ if(x%7>=5) continue; const i=(y*208+x)*4; out.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]>=128?1:0);} } return out.join('');
}`;
const EXTRA = ["strokeUniform","strokeDashArray","strokeLineCap","strokeLineJoin","fontFamily","fontSize","fontWeight","fontStyle","underline","textAlign","lineHeight","charSpacing","_canHaveFill","imageSmoothing","_line"];
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p5 = await b.newPage(); await p5.setContent("<html></html>");
  await p5.addScriptTag({ content: fs.readFileSync(process.argv[2], "utf8") }); await p5.addScriptTag({ content: RASTER });
  const p7 = await b.newPage(); await p7.setContent("<html></html>");
  await p7.addScriptTag({ content: fs.readFileSync(process.argv[3], "utf8") }); await p7.addScriptTag({ content: compat + RASTER + "prepareFabric(window.fabric);" });
  let ok = true;
  for (const s of scenes) {
    const b5 = await p5.evaluate(([j, w, h]) => bits(j, w, h), [s.data, s.w, s.h]);
    const r = await p7.evaluate(async ([j, w, h, extra]) => {
      const direct = await bits(j, w, h);
      // edytor: wczytaj, zapisz (toObject + nazwy typów z Fabric 5), wczytaj zapis, zapisz ponownie
      const el = document.createElement("canvas"); el.width = 600; el.height = 300;
      const c = new fabric.Canvas(el);
      await c.loadFromJSON(j);
      const saved = legacySceneTypes(c.toObject(extra));
      await c.loadFromJSON(saved);
      const saved2 = legacySceneTypes(c.toObject(extra));
      c.dispose();
      const types = [...new Set(JSON.stringify(saved).match(/"type":"[^"]+"/g))].join(" ");
      const lineKept = JSON.stringify(saved).includes('"_line"') === JSON.stringify(j).includes('"_line"');
      return { direct, afterSave: await bits(saved, w, h), afterResave: await bits(saved2, w, h), types, lineKept, stable: JSON.stringify(saved) === JSON.stringify(saved2) };
    }, [s.data, s.w, s.h, EXTRA]);
    const diff = (a, c) => [...a].filter((x, i) => x !== c[i]).length;
    const line = `${s.name}: v5 vs v7 ${diff(b5, r.direct)}, po zapisie ${diff(b5, r.afterSave)}, po 2. zapisie ${diff(b5, r.afterResave)} (kropek ${[...b5].filter(x => x === "1").length}); typy ${r.types}; _line ${r.lineKept ? "zachowane" : "ZGUBIONE"}; zapis stabilny ${r.stable}`;
    if (diff(b5, r.direct) || diff(b5, r.afterSave) || diff(b5, r.afterResave) || !r.lineKept || !r.stable) ok = false;
    console.log(line);
  }
  console.log(ok ? "WYNIK: zgodne" : "WYNIK: RÓŻNICE");
  await b.close();
})();
