#!/usr/bin/env node
// Części animowanych ikon pochodzą z tych samych SVG co wariant statyczny.
// Generacja przy edycji SVG; bez fetch i podmiany rysunku po pokazaniu strony.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sources = {
  hamburger: { file: 'navigation/hamburger.svg', animation: 'menu' },
  coffee: { file: 'communication/coffee.svg', animation: 'steam' },
  'caret-down': { file: 'navigation/caret-down.svg', animation: 'disclosure' },
  eye: { file: 'editor/eye.svg', animation: 'password' },
  save: { file: 'actions/save.svg', animation: 'save' },
  copy: { file: 'editing/copy.svg', animation: 'copy' },
  duplicate: { file: 'editing/duplicate.svg', animation: 'copy' },
};
export const output = path.join(root, 'web/shared/js/core/icon-parts.js');
export function buildIconParts() {
  const parts = {};
  for (const [name, { file, animation }] of Object.entries(sources)) {
    const source = fs.readFileSync(path.join(root, 'web/assets/icons', file), 'utf8').trim();
    const match = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/.exec(source);
    if (!match || /<(?:script|foreignObject)\b|\son\w+=|\sstyle=/i.test(source)) throw new Error(`Nieprawidłowe SVG: ${name}`);
    const attributes = [...match[1].matchAll(/\b(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="[^"]*"/g)].map(item => item[0]).join(' ');
    parts[name] = { animation, markup: `<g ${attributes}>${match[2]}</g>` };
  }
  return '// WYGENEROWANE: node scripts/build-icon-parts.mjs — źródła: web/assets/icons.\n'
    + `export const ICON_PARTS = Object.freeze(${JSON.stringify(parts, null, 2)});\n`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const content = buildIconParts();
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) {
      console.error('Części ikon nieaktualne: node scripts/build-icon-parts.mjs');
      process.exitCode = 1;
    }
  } else fs.writeFileSync(output, content);
}
