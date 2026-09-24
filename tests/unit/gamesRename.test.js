// Strażnik zmiany nazwy strony „Moje gry”: builder → games.
//
// Stara nazwa „builder” (builder.html, js/pages/builder.js,
// builder-import-export.js, css/builder.css, sekcje tłumaczeń builder.* /
// builderImportExport.*, klasy builder-*) została zastąpiona przez „games”.
// builder.html zostaje WYŁĄCZNIE jako przekierowanie na /games, żeby stare
// zakładki, skróty PWA i linki z e-maili dalej działały.
//
// Testy pilnują, żeby:
//  - w kodzie aplikacji nie wróciło żadne odwołanie do „builder”,
//  - przekierowanie zachowywało ?parametry i #hash,
//  - każdy użyty klucz games.* / gamesImportExport.* istniał w pl/en/uk,
//  - lokalne <script src>, <link href> i importy JS wskazywały istniejące pliki.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// Katalogi/pliki poza kodem aplikacji albo z „builderem” w innym znaczeniu
// (narzędzia w settings-tools: kora-builder/theme_builder, generatory e-maili w Workerze,
// historia w docs, migracje bazy, dane audytu w ikony.html).
const SKIP_DIRS = new Set([".git", "node_modules", "docs", "supabase", "cloudflare", "tests", "img", "audio", "settings-tools"]);
const SKIP_FILES = new Set(["builder.html", "ikony.html"]);
const ALLOWED = /kora-builder|theme_builder|Theme Builder/gi;

function walk(dir = "", out = []) {
  for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walk(rel, out);
    } else if (/\.(html|js|mjs|css|json|webmanifest)$/.test(ent.name) && !SKIP_FILES.has(rel)) {
      out.push(rel);
    }
  }
  return out;
}

async function loadTranslation(lang) {
  const src = read(`translation/${lang}.js`);
  const url = "data:text/javascript;base64," + Buffer.from(src).toString("base64");
  return (await import(url)).default;
}

function flatKeys(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatKeys(v, key, out);
    else out.add(key);
  }
  return out;
}

test("stare pliki strony nie istnieją, nowe tak", () => {
  for (const f of ["js/pages/builder.js", "js/pages/builder-import-export.js", "css/builder.css"]) {
    assert.equal(exists(f), false, `${f} powinien być przemianowany`);
  }
  for (const f of ["games.html", "js/pages/games.js", "js/pages/games-import-export.js", "css/games.css"]) {
    assert.equal(exists(f), true, `brak ${f}`);
  }
  const html = read("games.html");
  assert.match(html, /src="js\/pages\/games\.js/);
  assert.match(html, /href="css\/games\.css/);
  assert.match(html, /<title data-i18n="games\.title">/);
});

test("w kodzie aplikacji nie zostało żadne odwołanie do „builder”", () => {
  const hits = [];
  for (const f of walk()) {
    read(f).split("\n").forEach((line, i) => {
      if (/builder/i.test(line.replace(ALLOWED, ""))) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(hits, [], "znalezione pozostałości:\n" + hits.join("\n"));
});

test("builder.html tylko przekierowuje na /games z zachowaniem ?query i #hash", () => {
  const html = read("builder.html");
  assert.match(html, /location\.replace\(\s*'\/games'\s*\+\s*location\.search\s*\+\s*location\.hash\s*\)/);
  assert.match(html, /http-equiv="refresh"\s+content="0;\s*url=\/games"/);
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.familiada\.online\/games"/);
  // żadnej logiki aplikacji — sam redirect
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/);
  assert.doesNotMatch(html, /<link[^>]*stylesheet/);

  // symulacja: skrypt przekierowania dostaje stary adres z parametrami
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let target = null;
  const location = { search: "?tab=market&lang=en", hash: "#x", replace: (u) => { target = u; } };
  new Function("location", script)(location);
  assert.equal(target, "/games?tab=market&lang=en#x");
});

test("manifest PWA otwiera /games", () => {
  const m = JSON.parse(read("manifest.json"));
  assert.equal(m.start_url, "/games");
  for (const s of m.shortcuts || []) assert.doesNotMatch(String(s.url || s.action || ""), /builder/);
  assert.ok(JSON.stringify(m).includes('"/games"'));
});

test("tłumaczenia: sekcje games i gamesImportExport, bez builder*, te same klucze w pl/en/uk", async () => {
  const langs = {};
  for (const l of ["pl", "en", "uk"]) langs[l] = await loadTranslation(l);
  for (const [l, tr] of Object.entries(langs)) {
    assert.ok(tr.games && typeof tr.games === "object", `${l}: brak sekcji games`);
    assert.ok(tr.gamesImportExport && typeof tr.gamesImportExport === "object", `${l}: brak sekcji gamesImportExport`);
    assert.equal(tr.builder, undefined, `${l}: została sekcja builder`);
    assert.equal(tr.builderImportExport, undefined, `${l}: została sekcja builderImportExport`);
    assert.match(tr.games.title, /^Familiada — /, `${l}: games.title`);
  }
  const keysOf = (l) => [...flatKeys({ games: langs[l].games, gamesImportExport: langs[l].gamesImportExport })].sort();
  assert.deepEqual(keysOf("en"), keysOf("pl"), "en ma inne klucze games* niż pl");
  assert.deepEqual(keysOf("uk"), keysOf("pl"), "uk ma inne klucze games* niż pl");
});

test("każdy użyty w kodzie klucz games.* / gamesImportExport.* istnieje w pl/en/uk", async () => {
  const keys = {};
  for (const l of ["pl", "en", "uk"]) keys[l] = flatKeys(await loadTranslation(l));
  const used = new Map();
  const re = /["'`]((?:games|gamesImportExport)\.[A-Za-z0-9_.]+[A-Za-z0-9_])["'`]/g;
  for (const f of walk()) {
    if (f.startsWith("translation/")) continue;
    for (const m of read(f).matchAll(re)) {
      if (/\.(js|css|html)$/.test(m[1])) continue; // ścieżki plików, nie klucze
      if (!used.has(m[1])) used.set(m[1], f);
    }
  }
  assert.ok(used.size > 50, `podejrzanie mało kluczy games.* w kodzie (${used.size})`);
  const missing = [];
  for (const [k, f] of used) {
    for (const l of ["pl", "en", "uk"]) if (!keys[l].has(k)) missing.push(`${l}: ${k} (użyty w ${f})`);
  }
  assert.deepEqual(missing, []);
});

test("lokalne skrypty, style i importy JS wskazują istniejące pliki", () => {
  const broken = [];
  const check = (from, ref) => {
    const clean = ref.split("?")[0].split("#")[0];
    if (!clean || /^(https?:)?\/\//.test(clean) || /^(data|blob|mailto):/.test(clean)) return;
    if (!/\.(js|mjs|css)$/.test(clean)) return;
    const target = clean.startsWith("/") ? clean.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
    if (!exists(target)) broken.push(`${from} → ${ref}`);
  };
  for (const f of walk()) {
    const src = read(f);
    if (f.endsWith(".html")) {
      for (const m of src.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) check(f, m[1]);
      for (const m of src.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) check(f, m[1]);
    }
    if (/\.(js|mjs|html)$/.test(f)) {
      for (const m of src.matchAll(/\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g)) check(f, m[1]);
    }
  }
  assert.deepEqual(broken, []);
});

test("powroty do listy gier prowadzą na games (login, confirm, konto, manifest)", () => {
  assert.match(read("login.html"), /data-games-url="games"/);
  assert.match(read("login.html"), /_dest = 'games'/);
  assert.match(read("js/pages/login.js"), /baseUrls\.gamesUrl \|\| "games"/);
  assert.match(read("confirm.html"), /data-base-href="games"/);
  assert.match(read("account.html"), /data-base-href="games"/);
  assert.match(read("index.html"), /location\.replace\('games' \+ location\.search\)/);
  assert.match(read("marketplace.html"), /id="btnGoGames"/);
  assert.match(read("polls-hub.html"), /id="btnBackToGames"/);
  assert.match(read("subscriptions.html"), /id="btnBackToGames"/);
  assert.match(read("js/core/topbar-controller.js"), /#btnBackToGames/);
});
