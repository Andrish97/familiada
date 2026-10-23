#!/usr/bin/env node
// Porównanie dwóch katalogów zrzutów (run.cjs --out=…) piksel po pikselu (E23).
//   node scripts/screens/compare.cjs <przed> <po> [--out=<raport>] [--threshold=16] [--max=0.0005] [--scenes=a,b] [--style-lines=12]
// Zrzuty zrobione z run.cjs --styles mają obok PNG obliczone style — raport pokazuje też ich różnice.
// Dla każdej pary PNG o tej samej ścieżce: liczba różnych pikseli (różnica
// kanału > threshold), obraz różnic (czerwone piksele na wyszarzonym „po”).
// Raport: <raport>/index.html + <raport>/diff/<scena>/<plik>.png.
// Kod wyjścia 1, gdy którakolwiek para przekracza --max (ułamek pikseli)
// albo różni się rozmiarem lub brakuje jej po jednej stronie.
// Bez zależności poza Playwrightem: dekodowanie i różnice liczy Chromium (canvas).
const fs = require("fs");
const path = require("path");
const { launch } = require("./lib.cjs");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const [beforeDir, afterDir] = args.filter((a) => !a.startsWith("--"));
if (!beforeDir || !afterDir) {
  console.error("Użycie: compare.cjs <przed> <po> [--out=<raport>] [--threshold=16] [--max=0.0005]");
  process.exit(2);
}
const outDir = path.resolve(opt("out", path.join(afterDir, "..", "compare")));
const threshold = Number(opt("threshold", "16"));
const maxRatio = Number(opt("max", "0.0005"));
const only = opt("scenes", "").split(",").filter(Boolean);

function listPngs(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".png")) out.push(path.relative(root, p));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out.sort();
}

async function main() {
  const before = new Set(listPngs(beforeDir));
  const after = new Set(listPngs(afterDir));
  let all = [...new Set([...before, ...after])].sort();
  if (only.length) all = all.filter((f) => only.includes(f.split(path.sep)[0]));
  fs.mkdirSync(path.join(outDir, "diff"), { recursive: true });

  const browser = await launch();
  const page = await browser.newPage();
  await page.setContent("<canvas id=a></canvas><canvas id=b></canvas>");
  const rows = [];
  for (const rel of all) {
    if (!before.has(rel) || !after.has(rel)) {
      rows.push({ rel, status: before.has(rel) ? "brak po" : "brak przed", ratio: 1 });
      continue;
    }
    const a = fs.readFileSync(path.join(beforeDir, rel)).toString("base64");
    const b = fs.readFileSync(path.join(afterDir, rel)).toString("base64");
    if (a === b) { rows.push({ rel, status: "identyczne", ratio: 0 }); continue; }
    const res = await page.evaluate(async ({ a, b, threshold }) => {
      const load = (src) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });
      const [ia, ib] = await Promise.all([load(`data:image/png;base64,${a}`), load(`data:image/png;base64,${b}`)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { size: `${ia.width}×${ia.height} → ${ib.width}×${ib.height}` };
      }
      const w = ia.width, h = ia.height;
      const ctx = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x; };
      const da = ctx(ia).getImageData(0, 0, w, h).data;
      const cb = ctx(ib);
      const out = cb.getImageData(0, 0, w, h);
      const db = out.data;
      let diff = 0, minX = w, minY = h, maxX = -1, maxY = -1;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        if (d > threshold) {
          diff++;
          const p = i / 4, x = p % w, y = (p - x) / w;
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
          db[i] = 255; db[i + 1] = 0; db[i + 2] = 0; db[i + 3] = 255;
        } else {
          const g = (db[i] + db[i + 1] + db[i + 2]) / 3 * 0.35;
          db[i] = db[i + 1] = db[i + 2] = g;
        }
      }
      if (!diff) return { diff: 0, total: w * h };
      cb.putImageData(out, 0, 0);
      return { diff, total: w * h, box: [minX, minY, maxX, maxY], png: cb.canvas.toDataURL("image/png").split(",")[1] };
    }, { a, b, threshold });
    if (res.size) { rows.push({ rel, status: `rozmiar ${res.size}`, ratio: 1 }); continue; }
    const ratio = res.diff / res.total;
    let diffRel = null;
    if (res.diff) {
      diffRel = path.join("diff", rel);
      fs.mkdirSync(path.dirname(path.join(outDir, diffRel)), { recursive: true });
      fs.writeFileSync(path.join(outDir, diffRel), Buffer.from(res.png, "base64"));
    }
    rows.push({ rel, status: res.diff ? `${res.diff} px` : "identyczne", ratio, box: res.box, diffRel });
  }
  await browser.close();

  // Różnice obliczonych stylów (run.cjs --styles): pierwsze właściwości, które się zmieniły.
  for (const r of rows) {
    const fa = path.join(beforeDir, r.rel.replace(/\.png$/, ".styles.json"));
    const fb = path.join(afterDir, r.rel.replace(/\.png$/, ".styles.json"));
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) continue;
    const a = JSON.parse(fs.readFileSync(fa, "utf8")), b = JSON.parse(fs.readFileSync(fb, "utf8"));
    const diffs = [];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!a[key] || !b[key]) { diffs.push(`${key}: ${a[key] ? "znika" : "nowy"}`); continue; }
      for (const prop of Object.keys(a[key])) if (a[key][prop] !== b[key][prop]) diffs.push(`${key} { ${prop}: ${a[key][prop]} → ${b[key][prop]} }`);
    }
    r.styleDiffs = diffs;
  }

  const bad = rows.filter((r) => r.ratio > maxRatio);
  const changed = rows.filter((r) => r.ratio > 0);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = (dir, rel) => `file://${path.resolve(dir, rel)}`;
  const html = `<!doctype html><meta charset=utf-8><title>Porównanie zrzutów</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:16px}figure{margin:0}img{max-width:100%;border:1px solid #333}
.row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 28px}h2{font-size:15px;margin:0}.bad{color:#f66}</style>
<h1>Porównanie: ${changed.length} różnych z ${rows.length} (próg ${maxRatio})</h1>
${changed.map((r) => `<h2 class="${r.ratio > maxRatio ? "bad" : ""}">${esc(r.rel)} — ${esc(r.status)} (${(r.ratio * 100).toFixed(3)}%)${r.box ? ` obszar ${r.box.join(",")}` : ""}</h2>
<div class=row><figure><img src="${img(beforeDir, r.rel)}"><figcaption>przed</figcaption></figure><figure><img src="${img(afterDir, r.rel)}"><figcaption>po</figcaption></figure>${r.diffRel ? `<figure><img src="${esc(r.diffRel)}"><figcaption>różnice</figcaption></figure>` : ""}</div>${r.styleDiffs?.length ? `<pre>${esc(r.styleDiffs.slice(0, 200).join("\n"))}</pre>` : ""}`).join("\n")}`;
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(rows, null, 1));

  const maxStyle = Number(opt("style-lines", "12"));
  for (const r of rows.filter((x) => x.styleDiffs?.length)) {
    console.log(`  style ${r.rel}: ${r.styleDiffs.length} różnic`);
    for (const d of r.styleDiffs.slice(0, maxStyle)) console.log(`    ${d}`);
  }
  for (const r of changed) console.log(`${r.ratio > maxRatio ? "✗" : "~"} ${r.rel}: ${r.status} (${(r.ratio * 100).toFixed(3)}%)${r.box ? ` [${r.box.join(",")}]` : ""}`);
  console.log(`\n${rows.length} par, ${changed.length} różnych, ${bad.length} ponad próg. Raport: ${path.join(outDir, "index.html")}`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
