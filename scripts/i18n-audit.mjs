import fs from "fs";
import path from "path";
import url from "url";

/**
 * i18n audit (repo-wide)
 *
 * Usage:
 *   node scripts/i18n-audit.mjs
 *   node scripts/i18n-audit.mjs --strict
 *   node scripts/i18n-audit.mjs --only-missing
 *   node scripts/i18n-audit.mjs --limit=300
 */

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const langs = {
  pl: path.join(root, "translation", "pl.js"),
  en: path.join(root, "translation", "en.js"),
  uk: path.join(root, "translation", "uk.js"),
};

const includeExt = new Set([".js", ".mjs", ".cjs", ".ts", ".html"]);
const ignoreDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage"]);
const ignoreFiles = new Set(["scripts/i18n-audit.mjs"]);

function parseArgs(argv) {
  const opts = {
    strict: false,
    onlyMissing: false,
    limit: 500,
  };

  for (const arg of argv) {
    if (arg === "--strict") opts.strict = true;
    else if (arg === "--only-missing") opts.onlyMissing = true;
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) opts.limit = Math.floor(n);
    }
  }

  return opts;
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (ignoreDirs.has(e.name)) continue;
      walk(p, out);
    } else if (e.isFile()) {
      const rel = path.relative(root, p).replace(/\\/g, "/");
      if (ignoreFiles.has(rel)) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (includeExt.has(ext)) out.push(p);
    }
  }
  return out;
}

/**
 * Obsługuje:
 *   t("a.b.c")
 *   t('a.b.c')
 *   t(`a.b.c`)   (bez ${})
 *   data-i18n="a.b.c"
 *   data-i18n-html="a.b.c"
 *
 * Nie obsłuży dynamicznych: t(prefix + key)
 */
function stripComments(txt) {
  return txt
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function extractKeysFromText(txt) {
  const keys = new Set();
  const src = stripComments(txt);

  for (const m of src.matchAll(/\bt\s*\(\s*["']([^"'\\]+)["']/g)) keys.add(m[1]);
  for (const m of src.matchAll(/\bt\s*\(\s*`([^`$\\]+)`/g)) keys.add(m[1]);
  for (const m of src.matchAll(/data-i18n(?:-html)?\s*=\s*["']([^"'\\]+)["']/g)) keys.add(m[1]);

  return keys;
}

function extractUsedKeys(files) {
  const used = new Set();
  for (const f of files) {
    let txt;
    try {
      txt = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }

    const ks = extractKeysFromText(txt);
    for (const k of ks) used.add(k);
  }
  return used;
}

function flatten(obj, prefix = "", out = []) {
  if (obj == null) return out;

  const t = typeof obj;
  if (t === "string" || t === "number" || t === "boolean" || t === "function") {
    out.push(prefix);
    return out;
  }
  if (Array.isArray(obj)) {
    out.push(prefix);
    return out;
  }
  if (t !== "object") return out;

  for (const k of Object.keys(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    flatten(obj[k], next, out);
  }
  return out;
}

async function loadLang(filePath) {
  const mod = await import(url.pathToFileURL(filePath));
  return mod?.default || mod;
}

function setDiff(a, b) {
  const out = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return out.sort();
}

function setInter(a, b) {
  const out = [];
  for (const x of a) if (b.has(x)) out.push(x);
  return out.sort();
}

function printSection(title, arr, limit = 200) {
  console.log(`\n=== ${title} (${arr.length}) ===`);
  if (!arr.length) return;
  const shown = arr.slice(0, limit);
  console.log(shown.join("\n"));
  if (arr.length > limit) console.log(`... +${arr.length - limit} więcej`);
}

(async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const files = walk(root);
  const used = extractUsedKeys(files);

  console.log(`Repo root: ${root}`);
  console.log(`Scanned files: ${files.length}`);
  console.log(`Used keys found: ${used.size}`);

  const langKeys = {};
  for (const [code, fp] of Object.entries(langs)) {
    const langObj = await loadLang(fp);
    const flat = flatten(langObj, "", []);
    langKeys[code] = new Set(flat.filter(Boolean));
    console.log(`Lang ${code}: ${langKeys[code].size} keys`);
  }

  const allDefined = new Set();
  for (const s of Object.values(langKeys)) for (const k of s) allDefined.add(k);

  const missingEverywhere = setDiff(used, allDefined);
  printSection("USED but missing in ALL languages", missingEverywhere, opts.limit);

  const missingByLang = {};
  for (const [code, s] of Object.entries(langKeys)) {
    const missing = setDiff(used, s);
    missingByLang[code] = missing;
    printSection(`MISSING in ${code}`, missing, opts.limit);
  }

  let unusedTotal = 0;
  if (!opts.onlyMissing) {
    for (const [code, s] of Object.entries(langKeys)) {
      const unused = setDiff(s, used);
      unusedTotal += unused.length;
      printSection(`UNUSED (dead) in ${code}`, unused, opts.limit);
    }
  }

  const freq = new Map();
  for (const s of Object.values(langKeys)) {
    for (const k of s) freq.set(k, (freq.get(k) || 0) + 1);
  }
  const onlyOne = [...freq.entries()].filter(([, n]) => n === 1).map(([k]) => k).sort();
  printSection("Keys present in ONLY ONE language (translation drift)", onlyOne, opts.limit);

  const all3 = Object.values(langKeys).reduce((acc, s) => {
    if (!acc) return new Set(s);
    return new Set(setInter(acc, s));
  }, null);
  console.log(`\nKeys present in ALL langs: ${all3 ? all3.size : 0}`);

  const perLangMissingCount = Object.values(missingByLang).reduce((acc, arr) => acc + arr.length, 0);
  const hasProblems = missingEverywhere.length > 0 || perLangMissingCount > 0 || onlyOne.length > 0;

  console.log("\nSummary:");
  console.log(`- missing in all: ${missingEverywhere.length}`);
  console.log(`- missing per lang (sum): ${perLangMissingCount}`);
  console.log(`- translation drift (only one lang): ${onlyOne.length}`);
  if (!opts.onlyMissing) console.log(`- unused (sum of all langs): ${unusedTotal}`);

  if (opts.strict && hasProblems) {
    console.error("\nStrict mode failed ❌");
    process.exitCode = 2;
    return;
  }

  console.log("\nDone ✅");
})().catch((e) => {
  console.error("Audit failed:", e);
  process.exitCode = 1;
});
