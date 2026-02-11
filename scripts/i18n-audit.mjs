import fs from "fs";
import path from "path";
import url from "url";

/**
 * Konfiguracja repo
 * - root: domyślnie katalog repo (parent scripts/)
 * - langs: ścieżki do plików tłumaczeń (ESM export default)
 * - includeExt: jakie pliki skanujemy pod użycie kluczy
 * - ignoreDirs: co ignorować
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

/** ============ Helpers: FS ============ */
function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (ignoreDirs.has(e.name)) continue;
      walk(p, out);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (includeExt.has(ext)) out.push(p);
    }
  }
  return out;
}

/** ============ Extract: used keys ============ */
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
function extractKeysFromText(txt) {
  const keys = new Set();

  // t("...")
  for (const m of txt.matchAll(/\bt\s*\(\s*["']([^"'\\]+)["']/g)) keys.add(m[1]);

  // t(`...`) bez interpolacji
  for (const m of txt.matchAll(/\bt\s*\(\s*`([^`$\\]+)`/g)) keys.add(m[1]);

  // data-i18n / data-i18n-html
  for (const m of txt.matchAll(/data-i18n(?:-html)?\s*=\s*["']([^"'\\]+)["']/g)) keys.add(m[1]);

  return keys;
}

function extractUsedKeys(files) {
  const used = new Set();
  const byFile = new Map(); // file -> Set(keys) (opcjonalnie)
  for (const f of files) {
    let txt;
    try {
      txt = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const ks = extractKeysFromText(txt);
    if (ks.size) {
      byFile.set(f, ks);
      for (const k of ks) used.add(k);
    }
  }
  return { used, byFile };
}

/** ============ Flatten: translation keys ============ */
function flatten(obj, prefix = "", out = []) {
  if (obj == null) return out;

  const t = typeof obj;
  if (t === "string" || t === "number" || t === "boolean") {
    out.push(prefix);
    return out;
  }
  if (Array.isArray(obj)) {
    // ignorujemy tablice jako liście (zwykle nie używasz tego w i18n)
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

/** ============ Diff logic ============ */
function setDiff(a, b) {
  // a\b
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

/** ============ Main ============ */
(async function main() {
  const files = walk(root);
  const { used } = extractUsedKeys(files);

  console.log(`Repo root: ${root}`);
  console.log(`Scanned files: ${files.length}`);
  console.log(`Used keys found: ${used.size}`);

  // Wczytaj i spłaszcz tłumaczenia
  const langKeys = {};
  for (const [code, fp] of Object.entries(langs)) {
    const langObj = await loadLang(fp);
    const flat = flatten(langObj, "", []);
    langKeys[code] = new Set(flat.filter(Boolean));
    console.log(`Lang ${code}: ${langKeys[code].size} keys`);
  }

  // Global: keys defined in ANY lang
  const allDefined = new Set();
  for (const s of Object.values(langKeys)) for (const k of s) allDefined.add(k);

  // 1) Used but not defined anywhere
  const missingEverywhere = setDiff(used, allDefined);
  printSection("USED but missing in ALL languages", missingEverywhere, 500);

  // 2) Per-lang missing
  for (const [code, s] of Object.entries(langKeys)) {
    const missing = setDiff(used, s);
    printSection(`MISSING in ${code}`, missing, 500);
  }

  // 3) Per-lang unused (defined but never used)
  for (const [code, s] of Object.entries(langKeys)) {
    const unused = setDiff(s, used);
    printSection(`UNUSED (dead) in ${code}`, unused, 500);
  }

  // 4) Orphans: keys existing only in one lang
  // policz wystąpienia
  const freq = new Map();
  for (const [code, s] of Object.entries(langKeys)) {
    for (const k of s) freq.set(k, (freq.get(k) || 0) + 1);
  }
  const onlyOne = [...freq.entries()].filter(([, n]) => n === 1).map(([k]) => k).sort();
  printSection("Keys present in ONLY ONE language (translation drift)", onlyOne, 500);

  // 5) “core set” (present in all langs)
  const all3 = Object.values(langKeys).reduce((acc, s) => {
    if (!acc) return new Set(s);
    return new Set(setInter(acc, s));
  }, null);
  console.log(`\nKeys present in ALL langs: ${all3 ? all3.size : 0}`);

  console.log("\nDone ✅");
})().catch((e) => {
  console.error("Audit failed:", e);
  process.exitCode = 1;
});
