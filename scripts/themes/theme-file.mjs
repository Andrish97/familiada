#!/usr/bin/env node
// Narzędzie do plików motywu (format: web/shared/js/display/theme-file.js,
// zasady: familijna-server/docs/motywy.md).
//
//   node scripts/themes/theme-file.mjs check  <plik.json> [--builtin]
//       sprawdza plik tak jak serwer przy wgraniu (--builtin: jak motyw wbudowany)
//   node scripts/themes/theme-file.mjs unpack <plik.json> <katalog>
//       rozkłada plik na theme.json (wejścia, wyjścia, Prowadzący) i display.svg (SVG do Inkscape)
//   node scripts/themes/theme-file.mjs pack   <katalog> <plik.json> [--builtin]
//       składa theme.json + display.svg (+ kroje z fonts/) w jeden plik i go sprawdza
//
// Zapisywany plik zawiera grafikę po oczyszczeniu — to samo, co trafi do bucketu.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parseThemeFile } from "../../web/shared/js/display/theme-file.js";
import pl from "../../web/shared/translation/pl/gameSettings.js";

const ERRORS = pl.gameSettings?.display?.themeErrors ?? {};
const [command, source, target] = process.argv.slice(2).filter(a => !a.startsWith("--"));
const builtin = process.argv.includes("--builtin");

function report(result, file) {
  if (result.ok) { console.log(`OK: ${file} — „${result.theme.name}”`); return true; }
  const text = (ERRORS[result.error] || result.error).replace("{detail}", result.detail || "");
  console.error(`BŁĄD: ${file}: ${text} [${result.error}${result.detail ? `: ${result.detail}` : ""}]`);
  return false;
}

// Plik zapisany czytelnie: grafika wcięta liniami, reszta jak w motywach wbudowanych.
function pretty(theme) {
  const { svg, ...display } = theme.display;
  const out = { type: "familijna-theme", version: 1, name: theme.name };
  if (theme.label) out.label = theme.label;
  out.inputs = theme.inputs.T ? { T: { default: theme.inputs.T.default, ...(theme.inputs.T.label ? { label: theme.inputs.T.label } : {}) } } : {};
  out.outputs = theme.outputs;
  out.display = { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">\n${svg.replace(/></g, ">\n<")}\n</svg>`, ...display };
  out.host = theme.host.from ?? theme.host;
  return JSON.stringify(out, null, 2) + "\n";
}

if (command === "check" && source) {
  process.exit(report(parseThemeFile(readFileSync(source, "utf8"), { builtin }), source) ? 0 : 1);
} else if (command === "unpack" && source && target) {
  const data = JSON.parse(readFileSync(source, "utf8"));
  mkdirSync(target, { recursive: true });
  if (typeof data.display?.svg === "string") writeFileSync(path.join(target, "display.svg"), data.display.svg.trim() + "\n");
  if (data.display) delete data.display.svg;
  // Kroje Prowadzącego jako osobne pliki: fonts/<rodzina>.<format>.
  for (const font of data.host?.fonts || []) {
    const m = /^data:font\/(\w+);base64,(.*)$/.exec(font.data || "");
    if (!m) continue;
    const base = `fonts/${font.family.replace(/[^A-Za-z0-9-]+/g, "-")}`;
    let file = `${base}.${m[1]}`;
    for (let n = 2; existsSync(path.join(target, file)); n++) file = `${base}-${n}.${m[1]}`;
    mkdirSync(path.join(target, "fonts"), { recursive: true });
    writeFileSync(path.join(target, file), Buffer.from(m[2], "base64"));
    font.data = file;
  }
  writeFileSync(path.join(target, "theme.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(`Rozpakowano do ${target}: theme.json${existsSync(path.join(target, "display.svg")) ? ", display.svg" : ""}`);
} else if (command === "pack" && source && target) {
  const data = JSON.parse(readFileSync(path.join(source, "theme.json"), "utf8"));
  const svgFile = path.join(source, "display.svg");
  if (existsSync(svgFile)) data.display = { ...data.display, svg: readFileSync(svgFile, "utf8") };
  // Kroje: "data" może wskazywać plik w katalogu motywu (fonts/x.woff2).
  for (const font of data.host?.fonts || []) {
    const ext = /\.(woff2|woff|ttf|otf)$/i.exec(font.data || "")?.[1]?.toLowerCase();
    if (ext && existsSync(path.join(source, font.data))) font.data = `data:font/${ext};base64,${readFileSync(path.join(source, font.data)).toString("base64")}`;
  }
  const result = parseThemeFile(JSON.stringify(data), { builtin });
  if (!report(result, target)) process.exit(1);
  writeFileSync(target, pretty(result.theme));
} else {
  console.error("Użycie: node scripts/themes/theme-file.mjs check <plik.json> [--builtin] | unpack <plik.json> <katalog> | pack <katalog> <plik.json> [--builtin]");
  process.exit(2);
}
