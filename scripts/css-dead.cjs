// E23: martwe klasy CSS per plik strony. Kod = HTML stron, które ładują dany
// plik CSS, + wszystkie moduły JS osiągalne z ich skryptów (import, import(),
// <script type="module">), bez komentarzy. Klasa żyje, gdy występuje jako
// słowo w tym kodzie albo jako przedrostek nazwy składanej (`x-${…}`).
//   node scripts/css-dead.cjs        lista martwych klas
// Silnik (shared/style) pomijany — jego elementy są katalogiem dla wszystkich.
const fs = require("fs"), path = require("path");
const WEB = path.resolve(__dirname, "../web");
// Klasy nadawane przez zewnętrzne biblioteki (TinyMCE) i Wyświetlacz (poza E23).
const IGNORE = [/^tox(-|$)/, /^control\/display\//];
const rel = (f) => path.relative(WEB, f).split(path.sep).join("/");
function walk(d, o = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (/vendor|admin\/tools|node_modules/.test(f)) continue; if (e.isDirectory()) walk(f, o); else o.push(f); } return o; }
const files = walk(WEB);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const resolve = (from, spec) => { spec = spec.split("?")[0]; if (spec.startsWith("/")) return path.join(WEB, spec); if (spec.startsWith(".")) return path.resolve(path.dirname(from), spec); return null; };
const jsCache = new Map();
function jsClosure(entry, seen = new Set()) {
  if (!entry || seen.has(entry) || !fs.existsSync(entry)) return seen;
  seen.add(entry);
  const src = fs.readFileSync(entry, "utf8");
  for (const m of src.matchAll(/(?:import\s*(?:[^"'`;]*?from\s*)?|import\(\s*)["'`]([^"'`]+)["'`]/g)) jsClosure(resolve(entry, m[1]), seen);
  return seen;
}
const pagesByCss = new Map();
for (const html of files.filter((f) => f.endsWith(".html"))) {
  const src = fs.readFileSync(html, "utf8");
  const css = [...src.matchAll(/<link[^>]+href="([^"?]+\.css)/g)].map((m) => resolve(html, m[1]));
  for (const c of css) { if (!pagesByCss.has(c)) pagesByCss.set(c, new Set()); pagesByCss.get(c).add(html); }
}
const classesOf = (css) => { const out = new Set(); for (const m of strip(css).matchAll(/([^{}]+)\{/g)) { if (m[1].trim().startsWith("@")) continue; for (const c of m[1].matchAll(/\.([a-zA-Z_][\w-]*)/g)) out.add(c[1]); } return out; };
const ENGINE = /shared\/style\//;
const report = {};
for (const [css, pages] of pagesByCss) {
  if (ENGINE.test(css) || !fs.existsSync(css) || IGNORE.some((r) => r.test(rel(css)))) continue;
  let code = "";
  for (const html of pages) {
    const src = fs.readFileSync(html, "utf8"); code += src;
    const entries = [...src.matchAll(/<script[^>]+src="([^"?]+)[^"]*"/g)].map((m) => m[1]);
    for (const m of src.matchAll(/(?:import\s*(?:[^"'`;<]*?from\s*)?|import\(\s*)["'`]([^"'`]+)["'`]/g)) entries.push(m[1]); // moduły w <script type="module">
    const seen = new Set();
    for (const e of entries) jsClosure(resolve(html, e), seen);
    for (const js of seen) code += strip(fs.readFileSync(js, "utf8"));
  }
  const dead = [...classesOf(fs.readFileSync(css, "utf8"))].filter((c) => !new RegExp(`(?<![\\w-])${c.replace(/[-]/g, "\\-")}(?![\\w-])`).test(code) && !new RegExp(`${c.replace(/-[\w]+$/, "").replace(/[-]/g, "\\-")}-\\$\\{`).test(code)).filter((c) => !IGNORE.some((r) => r.test(c))).sort();
  if (dead.length) report[rel(css)] = dead;
}
module.exports = { report };
if (require.main === module) for (const [f, d] of Object.entries(report)) console.log(f, d.length, d.join(" "));
