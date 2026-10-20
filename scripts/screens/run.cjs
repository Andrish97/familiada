#!/usr/bin/env node
// Zrzuty prawdziwych stron z bogatymi danymi demo -- bez kont i bez bazy.
//
//   node scripts/screens/run.cjs --changed          # sceny stron zmienionych względem origin/main (+ nie zacommitowane)
//   node scripts/screens/run.cjs --scenes=games,logos
//   node scripts/screens/run.cjs --all --lang=all
//   opcje: --devices=desktop,phone,tablet,phone-landscape  --lang=pl,en,uk|all  --base=<ref>  --out=<katalog>  --list  --dry (tylko wypisz sceny)  --verbose (konsola strony)  --homepage (tylko kadry strony głównej)
//
// Strony, CSS i JS pochodzą z web/ (kod z bieżącego katalogu roboczego).
// Supabase podmienia fake-supabase.js, dane: data/demo.cjs, sceny: scenes.cjs.
// Wynik: <out>/<scena>/<język>-<urządzenie>.png oraz <out>/index.html (galeria).
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { repo, startServer, stopServer, launch, newContext, emulateSafeArea, composeIPhone } = require("./lib.cjs");
const scenes = require("./scenes.cjs");
const { buildDb } = require("./data/demo.cjs");
let buildGameState = null; // data/game-state.mjs (ESM, ładowany w main)

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : "true"];
}));

const DEVICES = {
  desktop: { width: 1440, height: 900, scale: 1, mobile: false },
  phone: { width: 390, height: 844, scale: 2, mobile: true },
  tablet: { width: 820, height: 1180, scale: 2, mobile: true },
  "phone-landscape": { width: 844, height: 390, scale: 2, mobile: true },
};
const LANGS = ["pl", "en", "uk"];

// ---------- wybór scen ----------
function changedFiles(base) {
  const run = (cmd) => { try { return execSync(cmd, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
  const committed = run(`git diff --name-only ${base}...HEAD`);
  const working = run("git status --porcelain").split("\n").map((l) => l.slice(3).trim()).join("\n");
  return [...new Set(`${committed}\n${working}`.split("\n").map((s) => s.trim()).filter(Boolean))];
}
function pickScenes() {
  if (args.all) return scenes;
  if (args.scenes) {
    const ids = args.scenes.split(",").filter(Boolean);
    const unknown = ids.filter((id) => !scenes.some((s) => s.id === id));
    if (unknown.length) throw new Error(`Nieznane sceny: ${unknown.join(", ")}. Lista: --list`);
    return scenes.filter((s) => ids.includes(s.id));
  }
  if (args.changed) {
    const base = args.base || "origin/main";
    const files = changedFiles(base);
    // Zmiana wspólnego kodu albo samych danych/silnika zrzutów dotyczy wszystkich stron.
    const global = files.filter((f) => /^web\/(shared|assets)\//.test(f) || /^scripts\/screens\/(fake-supabase|lib\.cjs|data\/)/.test(f));
    if (global.length) {
      console.log(`Zmienione pliki wspólne (${global.slice(0, 5).join(", ")}${global.length > 5 ? " …" : ""}) -- wszystkie sceny.`);
      return scenes;
    }
    const picked = scenes.filter((s) => files.some((f) => s.sources.some((src) => f.startsWith(src))));
    console.log(`Zmienione pliki: ${files.length}, sceny: ${picked.map((s) => s.id).join(", ") || "brak"}`);
    return picked;
  }
  throw new Error("Podaj --changed, --scenes=… albo --all (--list pokazuje sceny).");
}

// ---------- jedna scena ----------
async function capture(browser, origin, scene, lang, deviceName, outDir) {
  const device = scene.size ? { scale: 1, mobile: false, ...scene.size } : DEVICES[deviceName];
  const db = buildDb(lang, scene.gameState ? { gameState: buildGameState(lang, scene.gameState) } : {});
  // guest: odwiedzający bez konta i sesji.
  if (scene.guest) { db.user = null; db.localStorage = {}; }
  const context = await newContext(browser, db, lang, device);
  if (scene.safeArea) await emulateSafeArea(context, origin, scene.safeArea);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (args.verbose) page.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log(`    [${m.type()}] ${m.text().slice(0, 300)}`); });
  const sep = scene.path.includes("?") ? "&" : "?";
  const target = `${scene.path}${sep}lang=${lang}`;
  await page.goto(scene.frame ? `${origin}/__screens__/frame.html?src=${encodeURIComponent(target)}` : `${origin}${target}`, { waitUntil: "domcontentloaded" });
  // W ramce czekamy i robimy kroki na stronie wewnątrz, zrzut -- całego okna.
  const view = scene.frame ? await (await page.waitForSelector("#screensFrame")).contentFrame() : page;
  let readyError = null;
  try {
    if (scene.previewRow) {
      // Tryb podglądu urządzenia (?preview=1): stan gry jak w Control -> postMessage.
      const row = buildGameState(lang, scene.previewRow);
      await view.waitForFunction(() => document.readyState === "complete", null, { timeout: 15000 });
      await view.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(1500);
      if (scene.frame) await page.evaluate((row) => document.getElementById("screensFrame").contentWindow.postMessage({ type: "familiada:preview-row", row }, location.origin), row);
      else await page.evaluate((row) => window.postMessage({ type: "familiada:preview-row", row }, "*"), row);
    }
    if (typeof scene.ready === "string") await view.waitForSelector(scene.ready, { state: "visible", timeout: 15000 });
    else if (scene.ready) await view.waitForFunction(scene.ready, null, { timeout: 15000 });
    await view.waitForFunction(() => !document.documentElement.classList.contains("page-loading"), null, { timeout: 8000 }).catch(() => {});
    for (const step of scene.steps || []) await step(view, { lang, device: deviceName, page });
    if (scene.fullPage) {
      // Zrzut całej strony: przewinąć, żeby wczytały się obrazy z loading="lazy".
      await view.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.8)) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((resolve) => { img.onload = img.onerror = resolve; }))));
        window.scrollTo(0, 0);
      });
    }
    await view.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(scene.settle ?? 400);
  } catch (e) { readyError = e.message.split("\n")[0]; }
  const misses = await view.evaluate(() => window.__SCREENS_MISSES__ || []).catch(() => []);
  const file = path.join(outDir, scene.id, scene.size ? `${lang}.png` : `${lang}-${deviceName}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const shot = await page.screenshot({ fullPage: !!scene.fullPage, animations: "disabled" });
  // deviceFrame: "iphone" -- ekran telefonu w ramce iPhone'a na czarnym tle (kadr strony głównej).
  fs.writeFileSync(file, scene.deviceFrame === "iphone" ? await composeIPhone(browser, shot, scene.frameSize?.width, scene.frameSize?.height, scene.frameSize?.scale) : shot);
  await context.close();
  return { scene: scene.id, title: scene.title, lang, device: scene.size ? `${scene.size.width}×${scene.size.height}` : deviceName, file: path.relative(outDir, file), errors, misses, readyError };
}

function gallery(outDir, results) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cards = results.map((r) => {
    const problems = [r.readyError && `Nie doczekano gotowości: ${r.readyError}`, ...r.errors.map((e) => `Błąd JS: ${e}`), r.misses.length && `Brak danych w atrapie: ${r.misses.join(", ")}`].filter(Boolean);
    return `<article class="${problems.length ? "bad" : ""}"><h2>${esc(r.title)} <small>${r.lang} · ${r.device}</small></h2>${problems.map((p) => `<p class="err">${esc(p)}</p>`).join("")}<a href="${r.file}"><img loading="lazy" src="${r.file}" alt="${esc(r.title)}"></a></article>`;
  }).join("\n");
  // README.md: ta sama galeria w Markdownie -- GitHub pokazuje ją z obrazkami (także na telefonie).
  const md = results.map((r) => {
    const problems = [r.readyError && `nie doczekano gotowości`, r.errors.length && `${r.errors.length} błędów JS`, r.misses.length && `brak danych: ${r.misses.join(", ")}`].filter(Boolean);
    return `### ${r.title} — ${r.lang} · ${r.device}${problems.length ? `\n\n> ⚠️ ${problems.join("; ")}` : ""}\n\n![${r.scene} ${r.lang} ${r.device}](${r.file})\n`;
  }).join("\n");
  fs.writeFileSync(path.join(outDir, "README.md"), `# Zrzuty — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n\n${md}`);
  fs.writeFileSync(path.join(outDir, "index.html"), `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zrzuty Familiady</title><style>body{font:14px system-ui;background:#0b1020;color:#e5e7eb;margin:16px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}article{background:#151c30;border-radius:12px;padding:12px;min-width:0}article.bad{outline:2px solid #f87171}h2{font-size:15px;margin:0 0 8px}small{color:#94a3b8;font-weight:400}.err{color:#fca5a5;font-size:12px;margin:4px 0}img{display:block;width:100%;height:auto;border-radius:6px;border:1px solid #334155}</style><h1>Zrzuty — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</h1><main>${cards}</main></html>`);
}

(async () => {
  if (args.list) {
    for (const s of scenes) console.log(`${s.id.padEnd(22)} ${s.path.padEnd(40)} ${s.title}`);
    return;
  }
  // --homepage: tylko kadry strony głównej (scene.homepage) spośród wybranych.
  const picked = pickScenes().filter((scene) => !args.homepage || scene.homepage);
  if (!picked.length) { console.log("Brak scen do zrobienia."); return; }
  if (args.dry) { console.log(picked.map((s) => s.id).join("\n")); return; }
  const langs = args.lang === "all" ? LANGS : (args.lang || "pl").split(",");
  const devices = (args.devices || "desktop,phone").split(",");
  for (const d of devices) if (!DEVICES[d]) throw new Error(`Nieznane urządzenie ${d}: ${Object.keys(DEVICES).join(", ")}`);
  const outDir = path.resolve(repo, args.out || "scripts/screens/out");
  if (!args.keep) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  ({ buildGameState } = await import("./data/game-state.mjs"));
  const origin = await startServer();
  const browser = await launch();
  const results = [];
  try {
    for (const scene of picked) {
      for (const lang of langs) {
        const sceneDevices = scene.size ? ["size"] : scene.devices ? scene.devices.filter((d) => devices.includes(d) || args.devices == null) : devices;
        for (const device of sceneDevices) {
          const r = await capture(browser, origin, scene, lang, device, outDir);
          results.push(r);
          const flags = [r.readyError && "NIEGOTOWA", r.errors.length && `${r.errors.length} błędów JS`, r.misses.length && `brak danych: ${r.misses.join(", ")}`].filter(Boolean);
          console.log(`${flags.length ? "✗" : "✓"} ${scene.id} ${lang}/${device}${flags.length ? `  ${flags.join(" | ")}` : ""}`);
          for (const e of r.errors) console.log(`    JS: ${e}`);
        }
      }
    }
  } finally {
    await browser.close();
    stopServer();
  }
  gallery(outDir, results);
  console.log(`\nGaleria: ${path.join(outDir, "index.html")} (${results.length} zrzutów)`);
  if (args.strict && results.some((r) => r.readyError || r.errors.length)) process.exitCode = 1;
})().catch((e) => { console.error(e.stack || e); stopServer(); process.exitCode = 1; });
