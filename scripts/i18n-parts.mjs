// Części słownika, które wczytuje każda strona: <meta name="i18n-parts" content="…">
// w jej HTML (translation.js zawsze dokłada część wspólną `common`).
//
// Lista wynika z kodu strony: HTML → moduły JS i pliki JSON, które wczytuje
// (import, <script>, ścieżki w kodzie, jak w scripts/screens/changes.cjs) →
// klucze `sekcja.…` w ich tekście → części, w których leżą te sekcje.
// Klucz składany w locie liczy się po dosłownym prefiksie (`games.${x}`,
// "games." + x). Sekcja wybrana całkiem ze zmiennej nie jest widoczna — wtedy
// t() pisze w konsoli „[i18n] brak sekcji …” (system zrzutów to zgłasza).
//
// node scripts/i18n-parts.mjs          -> zapisuje meta w HTML
// node scripts/i18n-parts.mjs --check  -> tylko sprawdza (kod wyjścia 1 przy różnicy)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
export const TRANSLATION_DIR = path.join(web, "shared/translation");
export const LANGS = ["pl", "en", "uk"];
// Teksty serwera (send-email, Worker, maile powiadomień) — strona ich nie wczytuje.
export const SERVER_PART = "server";

export function partNames(lang = "pl") {
  return fs.readdirSync(path.join(TRANSLATION_DIR, lang)).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
}

// { lang: { part: dict } } — każda część osobno.
export async function loadParts() {
  const out = {};
  for (const lang of LANGS) {
    out[lang] = {};
    for (const part of partNames(lang)) {
      const href = pathToFileURL(path.join(TRANSLATION_DIR, lang, `${part}.js`)).href;
      out[lang][part] = (await import(href)).default;
    }
  }
  return out;
}

// Cały słownik języka (suma części) — dla narzędzi i testów.
export async function loadDicts() {
  const parts = await loadParts();
  return Object.fromEntries(LANGS.map((lang) => [lang, Object.assign({}, ...Object.values(parts[lang]))]));
}

// sekcja -> część (wg PL; zgodność języków sprawdza unit/i18nParts.test.js).
export function sectionParts(parts) {
  const map = {};
  for (const [part, dict] of Object.entries(parts)) for (const section of Object.keys(dict)) map[section] = part;
  return map;
}

const REF = /["'`(]((?:\.{1,2}\/|\/)[^"'`()\s?#]+\.(?:m?js|json))(?:[?#][^"'`()\s]*)?["'`)]/g;
const read = (file) => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } };

function closure(htmlFile) {
  const seen = new Set([htmlFile]);
  const queue = [htmlFile];
  while (queue.length) {
    const file = queue.pop();
    for (const m of read(file).matchAll(REF)) {
      const target = m[1].startsWith("/") ? path.join(web, m[1]) : path.resolve(path.dirname(file), m[1]);
      if (target.startsWith(TRANSLATION_DIR + path.sep) && !target.endsWith("translation.js")) continue;
      if (!seen.has(target) && fs.existsSync(target)) { seen.add(target); queue.push(target); }
    }
  }
  return seen;
}

// Sekcje użyte w tekście: "sekcja.klucz" (klucz istnieje) albo prefiks dynamiczny.
export function usedSections(text, dict) {
  const names = Object.keys(dict);
  const re = new RegExp(`["'\`](${names.join("|")})\\.(\\$\\{|["'\`]|[A-Za-z_][\\w]*)`, "g");
  const out = new Set();
  for (const m of text.matchAll(re)) {
    const next = m[2];
    if (/^[A-Za-z_]/.test(next) && !(dict[m[1]] && typeof dict[m[1]] === "object" && next in dict[m[1]])) continue;
    out.add(m[1]);
  }
  return out;
}

export function htmlPages() {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (!["img", "audio", "fonts", "vendor"].includes(ent.name)) walk(full); }
      else if (ent.name.endsWith(".html")) out.push(full);
    }
  };
  walk(web);
  return out.sort();
}

// { "web/games/index.html": ["gameValidate", "games", …] | null (strona bez tłumaczeń) }
export async function computePageParts() {
  const parts = (await loadParts()).pl;
  const dict = Object.assign({}, ...Object.values(parts));
  const owner = sectionParts(parts);
  const result = {};
  for (const html of htmlPages()) {
    const files = closure(html);
    const rel = path.relative(root, html);
    if (![...files].some((f) => f.endsWith(`${path.sep}translation${path.sep}translation.js`))) { result[rel] = null; continue; }
    const needed = new Set();
    for (const f of files) for (const s of usedSections(read(f), dict)) needed.add(owner[s]);
    needed.delete("common");
    result[rel] = [...needed].sort();
  }
  return result;
}

const META = /^[ \t]*<meta name="i18n-parts" content="[^"]*">\r?\n/m;

export function withMeta(html, parts) {
  const clean = html.replace(META, "");
  if (!parts || !parts.length) return clean;
  const tag = `<meta name="i18n-parts" content="${parts.join(" ")}">`;
  const charset = /^([ \t]*)<meta charset=[^>]*>\r?\n/im.exec(clean);
  if (!charset) throw new Error("brak <meta charset> w HTML");
  const at = charset.index + charset[0].length;
  return `${clean.slice(0, at)}${charset[1]}${tag}\n${clean.slice(at)}`;
}

export async function stale() {
  const pages = await computePageParts();
  const out = [];
  for (const [rel, parts] of Object.entries(pages)) {
    const file = path.join(root, rel);
    const html = fs.readFileSync(file, "utf8");
    const next = withMeta(html, parts);
    if (next !== html) out.push({ rel, parts, file, next });
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const diff = await stale();
  if (process.argv.includes("--check")) {
    for (const d of diff) console.log(`${d.rel}: ${d.parts?.join(" ") || "(tylko common)"}`);
    process.exit(diff.length ? 1 : 0);
  }
  for (const d of diff) { fs.writeFileSync(d.file, d.next); console.log(`${d.rel}: ${d.parts?.join(" ") || "(tylko common)"}`); }
  console.log(`zmienione strony: ${diff.length}`);
}
