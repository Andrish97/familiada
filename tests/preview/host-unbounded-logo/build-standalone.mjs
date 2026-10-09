import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
const [font, svg, renderer] = await Promise.all([
  fs.readFile(path.join(dir, 'Unbounded-Variable.ttf')),
  fs.readFile(path.resolve(dir, '../../../web/assets/img/logo.svg')),
  fs.readFile(path.join(dir, 'render.js'), 'utf8'),
]);
html = html.replace('./Unbounded-Variable.ttf', `data:font/ttf;base64,${font.toString('base64')}`);
html = html.replace('../../../web/assets/img/logo.svg', `data:image/svg+xml;base64,${svg.toString('base64')}`);
html = html.replace('<script defer src="./render.js"></script>', `<script>\n${renderer}\n</script>`);
await fs.writeFile(path.join(dir, 'standalone.html'), html);
console.log(`Created standalone.html (${Buffer.byteLength(html)} bytes)`);
