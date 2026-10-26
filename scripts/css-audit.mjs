#!/usr/bin/env node
// E23: audyt wspólnych stylów (docs/wspolne-style-plan.md).
// Liczy naruszenia zasad per plik; test tests/unit/cssAudit.test.js pilnuje,
// żeby żadna liczba nie rosła ponad scripts/css-audit/baseline.json.
//   node scripts/css-audit.mjs                  raport (suma i najgorsze pliki)
//   node scripts/css-audit.mjs --file=web/x.css szczegóły jednego pliku
//   node scripts/css-audit.mjs --unused         lista klas bez użycia w HTML/JS
//   node scripts/css-audit.mjs --write-baseline zapis nowego poziomu odniesienia
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const WEB = path.join(REPO, "web");
export const BASELINE_PATH = path.join(REPO, "scripts/css-audit/baseline.json");

// Jedyne miejsce definicji tokenów (kolory, odstępy, z-index) — krok 3 planu.
const TOKEN_FILES = new Set(["web/shared/style/tokens.css"]);
// Progi szerokości dozwolone w @media (silnik-stylow-projekt.md §3.3: narrow 600,
// work 980, wide 1280; min-width = próg + 1). Silnik ma jeszcze progi przejściowe
// (640/720/760/1200/1366 z dawnego base.css) — liczone jako naruszenia do kroku progów.
const ALLOWED_WIDTHS = new Set([600, 601, 980, 981, 1280, 1281]);

export const METRICS = {
  important: "`!important`",
  colorLiteral: "kolor wpisany na sztywno (poza definicją `--token`)",
  rootTokens: "własne definicje `--token` poza plikiem tokenów",
  mediaWidth: "`@media` z progiem szerokości spoza wspólnych",
  zIndexLiteral: "`z-index` ≥ 10 liczbą zamiast tokenu",
  sharedDuplicate: "klasa zdefiniowana też w innym pliku CSS",
  unusedClass: "klasa bez wystąpienia w HTML/JS",
  inlineStyleJs: "styl przypisany w JS (`.style.x =`, `cssText`, `style=\"`)",
  inlineStyleHtml: "atrybut `style=` w HTML",
  styleBlock: "blok `<style>` w HTML",
};

// Poza silnikiem (decyzje §11.4 i §8 planu): laboratoria admina, Wyświetlacz
// (TV, własny wygląd gry), biblioteki zewnętrzne, plik generowany (flat.css)
// i generatory HTML maili (style w atrybutach są tam wymagane przez programy pocztowe).
const OUTSIDE_ENGINE = [
  "web/admin/tools/",
  "web/control/display/",
  "web/shared/js/display/",
  "web/shared/vendor/",
  "web/shared/style/flat.css",
];
// Ekrany gry (§3.1): własne tokeny z prefiksem na :root, kolory gry tylko w nich.
const GAME_PREFIX = {
  "web/control/host/css/host.css": "--host-",
  "web/control/buzzer/css/buzzer.css": "--buzz-",
  "web/snake/css/snake.css": "--snake-",
  "web/connect/tv/css/tv.css": "--tv-",
  "web/polls/vote/qr/css/poll-qr.css": "--qr-",
};
const outsideEngine = (name) => OUTSIDE_ENGINE.some((p) => name === p || name.startsWith(p));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const file = path.join(dir, entry.name);
    if (outsideEngine(rel(file) + (entry.isDirectory() ? "/" : ""))) continue;
    if (entry.isDirectory()) walk(file, out); else out.push(file);
  }
  return out;
}

const rel = (file) => path.relative(REPO, file).split(path.sep).join("/");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// Zwraca reguły: { selector, body, media } (zagnieżdżenie w @media/@supports spłaszczone).
function parseRules(css) {
  const rules = [];
  const stack = [];
  let buf = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}") {
      const head = stack.pop() ?? "";
      if (!head.startsWith("@")) rules.push({ selector: head, body: buf, media: stack.filter((s) => s.startsWith("@media")) });
      buf = "";
    } else if (ch === ";" && stack.length === 0) {
      buf = "";
    } else {
      buf += ch;
    }
  }
  return rules;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
const classesOf = (selector) => new Set([...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));

function auditCss(file, css) {
  const name = rel(file);
  const tokenFile = TOKEN_FILES.has(name);
  const gamePrefix = GAME_PREFIX[name];
  const src = stripComments(css);
  const m = { important: 0, colorLiteral: 0, rootTokens: 0, mediaWidth: 0, zIndexLiteral: 0 };
  m.important = (src.match(/!important/g) || []).length;
  for (const decl of src.split(/[;{}]/)) {
    const isToken = /^\s*--[\w-]+\s*:/.test(decl);
    if (isToken && tokenFile) continue;
    if (isToken && gamePrefix && decl.trim().startsWith(gamePrefix)) continue;
    // rgb(var(--rgb-x) / alfa) to kolor z tokenu (kanały), nie literał.
    m.colorLiteral += (decl.replace(/\brgba?\(\s*var\(/g, "").match(COLOR_RE) || []).length;
    if (/^\s*z-index\s*:\s*-?\d{2,}/.test(decl)) m.zIndexLiteral++; // 0–9: kolejność w elemencie
  }
  // Paleta poza plikiem tokenów: definicje --x na :root/html. Zmienne lokalne
  // komponentu (--btn-tint, --under na elemencie) są dozwolone.
  if (!tokenFile) {
    for (const rule of parseRules(src)) {
      const onRoot = rule.selector.split(",").some((part) => /^(?::root|html)(?:\[[^\]]*\]|:[\w-]+(?:\([^)]*\))?)*$/.test(part.trim()));
      if (onRoot) {
        const names = [...rule.body.matchAll(/(?:^|;)\s*(--[\w-]+)\s*:/g)].map((d) => d[1]);
        m.rootTokens += names.filter((n) => !(gamePrefix && n.startsWith(gamePrefix))).length;
      }
    }
  }
  for (const q of src.matchAll(/@media([^{]*)\{/g)) {
    const widths = [...q[1].matchAll(/(?:min|max)-width\s*:\s*(\d+)px/g)].map((w) => Number(w[1]));
    if (widths.some((w) => !ALLOWED_WIDTHS.has(w))) m.mediaWidth++;
  }
  const simple = new Set();
  const all = new Set();
  for (const rule of parseRules(src)) {
    for (const part of rule.selector.split(",")) {
      const s = part.trim();
      for (const c of classesOf(s)) all.add(c);
      if (/^\.[\w-]+$/.test(s)) simple.add(s);
    }
  }
  return { name, metrics: m, simple, classes: all };
}

function countInline(source, html) {
  if (html) {
    return {
      inlineStyleHtml: (source.match(/\sstyle\s*=\s*["']/g) || []).length,
      styleBlock: (source.match(/<style[\s>]/g) || []).length,
    };
  }
  return { inlineStyleJs: (source.match(/\.style\.(?!setProperty|removeProperty|getPropertyValue)[a-zA-Z]+\s*=(?!=)|\.style\.cssText\s*=|\bstyle\s*=\s*\\?["'](?!--)/g) || []).length };
}

// Warianty klas tworzone przez szablon (jak w css-dead.cjs).
export function classIsUsed(cls, code) {
  if (code.includes(cls)) return true;
  const family = cls.replace(/-[\w]+$/, '');
  return family !== cls && code.includes(family + '-${');
}

export function audit() {
  const files = walk(WEB);
  const cssFiles = files.filter((f) => f.endsWith(".css"));
  const codeFiles = files.filter((f) => /\.(?:html|js|mjs|json)$/.test(f));
  const code = codeFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const css = cssFiles.map((f) => auditCss(f, fs.readFileSync(f, "utf8")));

  const owners = new Map();
  for (const c of css) for (const s of c.simple) owners.set(s, (owners.get(s) || 0) + 1);

  const result = {};
  const unused = {};
  for (const c of css) {
    const dup = [...c.simple].filter((s) => owners.get(s) > 1).length;
    const missing = [...c.classes].filter((cls) => !classIsUsed(cls, code)).sort();
    unused[c.name] = missing;
    result[c.name] = { ...c.metrics, sharedDuplicate: dup, unusedClass: missing.length };
  }
  for (const f of codeFiles) {
    if (f.endsWith(".json")) continue;
    const counts = countInline(fs.readFileSync(f, "utf8"), f.endsWith(".html"));
    if (Object.values(counts).some(Boolean)) result[rel(f)] = counts;
  }
  for (const [name, m] of Object.entries(result)) {
    for (const k of Object.keys(m)) if (!m[k]) delete m[k];
    if (!Object.keys(m).length) delete result[name];
  }
  return { result, unused };
}

export function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

// Naruszenia ponad poziom odniesienia; nowy plik ma poziom 0.
export function regressions(result, baseline) {
  const out = [];
  for (const [file, m] of Object.entries(result)) {
    for (const [k, v] of Object.entries(m)) {
      const allowed = baseline[file]?.[k] ?? 0;
      if (v > allowed) out.push({ file, metric: k, value: v, allowed });
    }
  }
  return out;
}

function totals(result) {
  const t = {};
  for (const m of Object.values(result)) for (const [k, v] of Object.entries(m)) t[k] = (t[k] || 0) + v;
  return t;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const { result, unused } = audit();
  const only = args.find((a) => a.startsWith("--file="))?.slice(7);
  if (args.includes("--write-baseline")) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 1) + "\n");
    console.log(`zapisano ${rel(BASELINE_PATH)}`);
  } else if (args.includes("--unused")) {
    for (const [file, list] of Object.entries(unused)) {
      if (only && file !== only) continue;
      if (list.length) console.log(`${file} (${list.length}): ${list.join(" ")}`);
    }
  } else if (only) {
    console.log(JSON.stringify(result[only] || {}, null, 1));
  } else {
    const t = totals(result);
    for (const [k, label] of Object.entries(METRICS)) console.log(`${String(t[k] || 0).padStart(6)}  ${label}`);
    const base = fs.existsSync(BASELINE_PATH) ? readBaseline() : null;
    if (base) {
      const bt = totals(base);
      console.log("\nzmiana względem baseline:");
      for (const k of Object.keys(METRICS)) console.log(`${String((t[k] || 0) - (bt[k] || 0)).padStart(6)}  ${k}`);
      const reg = regressions(result, base);
      for (const r of reg) console.log(`PRZEKROCZENIE ${r.file}: ${r.metric} ${r.value} > ${r.allowed}`);
    }
  }
}
