// Wybór scen do odświeżenia po zmianach (run.cjs --changed, publish-manual.cjs --base):
// tylko sceny, na których wygląd zmiana może wpłynąć.
//
// - Plik różniący się od <base> wyłącznie znacznikami wersji `?v=` (skrypt
//   version-assets.js przepisuje je w setkach plików) nie liczy się jako zmieniony.
// - Wspólny kod (web/shared/js, css, tłumaczenia) dotyczy tylko stron, które go
//   wczytują -- wprost albo przez inne moduły (importy, <script>, <link>, ścieżki
//   .js/.css/.json w kodzie).
// - Część słownika web/shared/translation/<lang>/<część>.js -- strony z tą częścią
//   w <meta name="i18n-parts"> (scripts/i18n-parts.mjs); część `common` -- jak
//   translation.js, czyli każda strona z tłumaczeniami; `server` -- żadna.
// - Zmiana definicji scen (scenes.cjs, scenes/<obszar>.cjs) -- sceny z tego pliku.
// - Wszystkie sceny tylko przy zmianie tego, co dotyczy każdego kadru: dane demo,
//   atrapa Supabase, silnik zrzutów, fonty, dane wyświetlacza, assety.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
// Znacznik wersji (w ?v= i meta app-version) -- przepisywany przez version-assets.js.
const VERSION = /v\d{4}-\d{2}-\d{2}T\d+/g;

// Pliki będące wynikiem zrzutów albo samym znacznikiem wersji -- nigdy nie są przyczyną.
const IGNORED = [/^web\/version\.txt$/, /^web\/assets\/img\/(pl|en|uk)\/shots\//, /^web\/assets\/img\/og\//, /^web\/manual\/img\//];
const GLOBAL = [
  /^web\/shared\/(fonts|data)\//,
  /^web\/assets\//,
  /^scripts\/screens\/(fake-supabase\.js|lib\.cjs|data\/)/,
];

const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }); } catch { return null; } };

// Zmienione pliki względem base (commity + niezacommitowane, także nowe).
function changedFiles(base) {
  const committed = git(`diff --name-only ${base}...HEAD`);
  if (committed === null) return null;
  const working = (git("status --porcelain") || "").split("\n").map((l) => l.slice(3).trim().replace(/^"|"$/g, "").split(" -> ").pop());
  return [...new Set([...committed.split("\n"), ...working].map((s) => s.trim()).filter(Boolean))];
}

// Czy plik różni się od base czymś więcej niż wersjami ?v= (usunięty/nowy -- tak).
function meaningful(file, base) {
  const before = git(`show ${base}:${file}`);
  const abs = path.join(repo, file);
  if (before === null || !fs.existsSync(abs)) return true;
  const after = fs.readFileSync(abs, "utf8");
  return before.replace(VERSION, "") !== after.replace(VERSION, "");
}

// Graf zależności web/: plik -> pliki, które go wczytują.
const REF = /["'`(]((?:\.{1,2}\/|\/)[^"'`()\s?#]+\.(?:m?js|css|json))(?:[?#][^"'`()\s]*)?["'`)]/g;
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!["img", "audio", "fonts"].includes(entry.name)) walk(p, out); }
    else if (/\.(m?js|css|html)$/.test(entry.name)) out.push(p);
  }
  return out;
}
function importers() {
  const web = path.join(repo, "web");
  const rev = new Map();
  for (const abs of walk(web)) {
    const text = fs.readFileSync(abs, "utf8");
    const from = path.relative(repo, abs);
    for (const m of text.matchAll(REF)) {
      const target = m[1].startsWith("/") ? path.join(web, m[1]) : path.resolve(path.dirname(abs), m[1]);
      const rel = path.relative(repo, target);
      if (rel.startsWith("..")) continue;
      if (!rev.has(rel)) rev.set(rel, new Set());
      rev.get(rel).add(from);
    }
  }
  return rev;
}
// Część słownika -> pliki, od których liczymy zasięg zmiany.
const I18N_PART = /^web\/shared\/translation\/(?:pl|en|uk)\/(\w+)\.js$/;
function i18nPartPages(part) {
  if (part === "common") return ["web/shared/translation/translation.js"];
  return walk(path.join(repo, "web")).filter((f) => f.endsWith(".html")).filter((f) => {
    const meta = /<meta name="i18n-parts" content="([^"]*)">/.exec(fs.readFileSync(f, "utf8"));
    return meta && meta[1].split(/\s+/).includes(part);
  }).map((f) => path.relative(repo, f));
}
function expandI18nParts(files) {
  return files.flatMap((f) => { const m = I18N_PART.exec(f); return m ? i18nPartPages(m[1]) : [f]; });
}
function withImporters(files) {
  const rev = importers();
  const seen = new Set(files);
  const queue = [...files];
  while (queue.length) {
    for (const parent of rev.get(queue.pop()) || []) if (!seen.has(parent)) { seen.add(parent); queue.push(parent); }
  }
  return seen;
}

// Plik definicji każdej sceny: scenes/<obszar>.cjs albo scenes.cjs.
function sceneFiles(scenes) {
  const dir = path.join(__dirname, "scenes");
  const map = new Map();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".cjs"))) {
    for (const s of require(path.join(dir, file))) map.set(s.id, `scripts/screens/scenes/${file}`);
  }
  for (const s of scenes) if (!map.has(s.id)) map.set(s.id, "scripts/screens/scenes.cjs");
  return map;
}

/**
 * @returns {{ all: boolean, scenes: object[], reason: string }}
 */
function selectChanged(scenes, base) {
  const files = changedFiles(base);
  if (files === null) return { all: true, scenes, reason: `nieznany punkt odniesienia ${base} -- wszystkie sceny` };
  const changed = files.filter((f) => !IGNORED.some((re) => re.test(f)) && meaningful(f, base));
  const global = changed.filter((f) => GLOBAL.some((re) => re.test(f)));
  if (global.length) return { all: true, scenes, reason: `pliki wspólne dla wszystkich kadrów (${global.slice(0, 5).join(", ")}${global.length > 5 ? " …" : ""})` };
  const affected = withImporters(expandI18nParts(changed).filter((f) => f.startsWith("web/")));
  const defs = sceneFiles(scenes);
  const picked = scenes.filter((s) => changed.includes(defs.get(s.id))
    || [...affected].some((f) => (s.sources || []).some((src) => f.startsWith(src))));
  const skipped = files.length - changed.length;
  return { all: false, scenes: picked, reason: `zmienione pliki: ${changed.length}${skipped ? ` (+${skipped} bez wpływu: same wersje albo wyniki zrzutów)` : ""}` };
}

module.exports = { selectChanged, changedFiles, meaningful, withImporters, expandI18nParts, VERSION };
