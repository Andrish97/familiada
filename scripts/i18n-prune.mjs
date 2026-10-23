// Usuwa z web/shared/translation/{pl,en,uk}.js klucze, których nie używa kod
// (lista z scripts/i18n-unused.mjs). Wycina tekst właściwości wprost ze
// źródła, więc reszta pliku (formatowanie, funkcje, komentarze) zostaje;
// obiekt, z którego zniknęły wszystkie klucze, znika razem z nimi.
//
// node scripts/i18n-prune.mjs           -> usuwa i sprawdza wynik
// node scripts/i18n-prune.mjs --dry     -> tylko liczby
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LANGS, flatten, report } from "./i18n-unused.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Właściwości literału obiektu: { path, start, end } (end za przecinkiem).
export function parseProps(src, objStart, base = "") {
  const props = [];
  let i = objStart;
  const skipWs = () => {
    for (;;) {
      if (/\s/.test(src[i])) i++;
      else if (src.startsWith("//", i)) i = src.indexOf("\n", i) === -1 ? src.length : src.indexOf("\n", i);
      else if (src.startsWith("/*", i)) i = src.indexOf("*/", i) + 2;
      else return;
    }
  };
  const skipString = () => {
    const q = src[i++];
    while (src[i] !== q) {
      if (src[i] === "\\") i++;
      else if (q === "`" && src.startsWith("${", i)) { i += 2; skipExpr("}"); }
      i++;
    }
    i++;
  };
  // Pomija wyrażenie do przecinka/zamknięcia na głębokości 0 (stop = znak końca).
  function skipExpr(stop) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") { skipString(); continue; }
      if (src.startsWith("//", i) || src.startsWith("/*", i)) { skipWs(); continue; }
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) {
        if (depth === 0) return;
        depth--;
      } else if (c === "," && depth === 0 && stop !== "}") return;
      i++;
    }
  }
  function parseObject(prefix) {
    if (src[i] !== "{") throw new Error(`oczekiwano { w ${i}`);
    i++;
    for (;;) {
      skipWs();
      if (src[i] === "}") { i++; return; }
      const start = i;
      let key;
      if (src[i] === '"' || src[i] === "'") {
        const s = i;
        skipString();
        key = JSON.parse(src[s] === "'" ? `"${src.slice(s + 1, i - 1).replace(/"/g, '\\"')}"` : src.slice(s, i));
      } else {
        const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200));
        if (!m) throw new Error(`nieznany klucz w ${i}: ${src.slice(i, i + 40)}`);
        key = m[0];
        i += key.length;
      }
      skipWs();
      if (src[i] !== ":") throw new Error(`oczekiwano : po ${key} w ${i}`);
      i++;
      skipWs();
      const keyPath = prefix ? `${prefix}.${key}` : key;
      const isObject = src[i] === "{";
      if (isObject) parseObject(keyPath);
      else skipExpr(",");
      const valueEnd = i;
      skipWs();
      if (src[i] === ",") i++;
      props.push({ path: keyPath, start, valueEnd, end: src[i - 1] === "," ? i : valueEnd, isObject });
    }
  }
  i = objStart;
  parseObject(base);
  return props;
}

export function prune(src, remove) {
  // Główny obiekt (const pl = {) i sekcje dopisane później (pl.sekcja = {).
  const props = [];
  for (const m of src.matchAll(/^(?:const \w+|\w+\.(\w+))\s*=\s*\{/gm)) {
    props.push(...parseProps(src, m.index + m[0].length - 1, m[1] || ""));
  }
  const removeSet = new Set(remove);
  // Obiekt usuwamy w całości, gdy wszystkie jego liście idą do usunięcia.
  const leaves = props.filter((p) => !p.isObject);
  const drop = new Set();
  for (const p of props) {
    if (p.isObject) {
      const own = leaves.filter((l) => l.path.startsWith(`${p.path}.`));
      if (own.length && own.every((l) => removeSet.has(l.path))) drop.add(p.path);
    } else if (removeSet.has(p.path)) drop.add(p.path);
  }
  // Tylko najwyższe usuwane węzły (dzieci usuniętego obiektu znikają z nim).
  const ranges = props
    .filter((p) => drop.has(p.path) && !p.path.split(".").slice(0, -1).some((_, idx, arr) => drop.has(arr.slice(0, idx + 1).join("."))))
    .map((p) => [p.start, p.end])
    .sort((a, b) => b[0] - a[0]);
  let out = src;
  for (let [s, e] of ranges) {
    // Cała linia, gdy właściwość ją wypełnia (z wcięciem i końcem linii).
    const lineStart = out.lastIndexOf("\n", s - 1) + 1;
    const lineEnd = out.indexOf("\n", e);
    if (/^\s*$/.test(out.slice(lineStart, s)) && /^\s*$/.test(out.slice(e, lineEnd === -1 ? out.length : lineEnd))) {
      s = lineStart;
      e = lineEnd === -1 ? out.length : lineEnd + 1;
    }
    out = out.slice(0, s) + out.slice(e);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { unused } = await report();
  console.log(`do usunięcia: ${unused.length}`);
  if (process.argv.includes("--dry")) process.exit(0);
  for (const lang of LANGS) {
    const file = path.join(root, `web/shared/translation/${lang}.js`);
    const before = (await import(`${pathToFileURL(file).href}?b=${Date.now()}`)).default;
    const src = fs.readFileSync(file, "utf8");
    const out = prune(src, unused);
    const tmp = path.join(path.dirname(file), `.prune-${lang}.mjs`);
    fs.writeFileSync(tmp, out);
    const after = (await import(`${pathToFileURL(tmp).href}?a=${Date.now()}`)).default;
    fs.rmSync(tmp);
    const expected = flatten(before).filter((k) => !unused.includes(k));
    const got = flatten(after);
    if (JSON.stringify(expected) !== JSON.stringify(got)) throw new Error(`${lang}: wynik nie zgadza się z oczekiwanym`);
    // Wartości pozostałych kluczy bez zmian.
    for (const k of got) {
      const a = k.split(".").reduce((o, p) => o[p], before);
      const b = k.split(".").reduce((o, p) => o[p], after);
      if (String(a) !== String(b)) throw new Error(`${lang}: zmieniona wartość ${k}`);
    }
    fs.writeFileSync(file, out);
    console.log(`${lang}: ${flatten(before).length} -> ${got.length}`);
  }
}
