#!/usr/bin/env node
// Podręcznik (E13): jeden samodzielny plik HTML do przeczytania całości bez serwera
// (spis treści + wszystkie rozdziały, style strony, ikony wstawione do pliku).
// Użycie: node scripts/manual/preview.mjs <katalog-wyjścia>  → podrecznik-{pl,en,uk}.html

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = path.resolve(process.argv[2] || path.join(ROOT, "scripts", "manual", "out"));
fs.mkdirSync(outDir, { recursive: true });

const { ICONS } = await import(pathToFileURL(path.join(ROOT, "web/shared/js/core/icons.js")).href).catch(() => ({ ICONS: {} }));
const iconSvg = (name) => {
  const rel = String(ICONS[name] || "").split("?")[0];
  if (!rel) return "";
  const file = path.join(ROOT, "web", rel);
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8")
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<svg\b/, '<svg class="ico" width="1em" height="1em" aria-hidden="true"');
};
const css = ["web/shared/css/base.css", "web/manual/css/manual.css"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TITLES = { pl: "Podręcznik użytkownika", en: "User guide", uk: "Посібник користувача" };

for (const lang of ["pl", "en", "uk"]) {
  const file = path.join(ROOT, "web", "manual", "content", `${lang}.js`);
  if (!fs.existsSync(file)) continue;
  const manual = (await import(pathToFileURL(file).href + `?t=${Date.now()}`)).default;
  const local = (html) => html
    .replace(/<i data-icon="([\w-]+)"><\/i>/g, (_, n) => iconSvg(n))
    .replace(/href="\?ch=\d+#(s-[\d-]+)"/g, 'href="#$1"')
    .replace(/href="\?ch=(\d+)"/g, 'href="#ch-$1"');
  const toc = manual.parts.map((p) => `<div class="m-side-part">${esc(p.title)}</div>${
    p.chapters.map((id) => { const c = manual.chapters.find((x) => x.id === id); return `<a class="m-side-item" href="#ch-${id}">${esc(c.title)}</a>`; }).join("")}`).join("");
  const body = manual.parts.map((p) => `<section><div class="m-crumb">${esc(p.title)}</div>${local(p.intro || "")}${
    p.chapters.map((id) => { const c = manual.chapters.find((x) => x.id === id); return `<article class="m-article" id="ch-${id}" style="margin-bottom:48px"><h1 class="m-title">${esc(c.title)}</h1><div class="m-doc">${local(c.html)}</div></article>`; }).join("")}</section>`).join("");
  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${TITLES[lang]} — podgląd</title><style>${css}
body{background:var(--bg);color:#fff;margin:0}@media (max-width:980px){.m-side{display:none}}</style></head>
<body class="manual-body"><div class="m-layout"><nav class="m-side">${toc}</nav><main class="m-content">${body}</main></div></body></html>`;
  const out = path.join(outDir, `podrecznik-${lang}.html`);
  fs.writeFileSync(out, html);
  console.log(out);
}
