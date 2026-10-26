#!/usr/bin/env node
// Wersje URL-i wynikają z treści gotowego artefaktu i jego zależności.
// Źródłowe web/ pozostaje czytelne; ten skrypt działa tylko na katalogu wydania.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SOURCE_EXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.xml']);
const ASSET_EXT = 'js|css|json|png|svg|ico|jpg|jpeg|gif|woff2?|ttf|otf|webp|avif|xml|webmanifest|eot|mp3|wav|ogg|mp4|webm';
const REF = new RegExp(`((?:[a-zA-Z0-9_./%-]*/)?[a-zA-Z0-9_.%-]+\\.(?:${ASSET_EXT}))\\?v=[a-zA-Z0-9T:-]+`, 'g');
const hex = value => crypto.createHash('sha256').update(value).digest('hex');

function allFiles(root, dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) return allFiles(root, name);
    if (!entry.isFile()) throw new Error(`Nieobsługiwany plik: ${name}`);
    return [name];
  });
}

function contentHashAssets(root) {
  root = path.resolve(root);
  const files = allFiles(root).filter(file => path.basename(file) !== 'asset-hashes.json').sort();
  const known = new Set(files);
  const records = new Map();
  const virtuals = new Map();
  const resolve = (file, url, source = '', offset = 0) => {
    if (url.startsWith('//') || /^https?:/i.test(url)) return null;
    if (path.basename(file) === 'sounds.json' && path.basename(path.dirname(file)) === 'data' && !url.includes('/')) {
      const before = source.slice(0, offset);
      const folders = [...before.matchAll(/"folder"\s*:\s*"([a-zA-Z0-9_-]+)"/g)];
      const folder = folders.at(-1)?.[1];
      const sound = folder && path.join(root, 'assets/audio', folder, url);
      if (sound && known.has(sound)) return sound;
    }
    if (path.basename(file) === 'display-themes.json' && /^\.\/theme_[a-z0-9_-]+\.js$/.test(url)) {
      const theme = path.join(root, 'shared/js/display', url.slice(2));
      if (known.has(theme)) return theme;
    }
    if (url === '/close.svg') {
      const icon = path.join(root, 'assets/icons/actions/close.svg');
      if (known.has(icon)) return icon;
    }
    if (file === path.join(root, 'index.html') && /^shots\/[a-zA-Z0-9_-]+\.webp$/.test(url)) {
      const images = ['pl', 'en', 'uk'].map(lang => path.join(root, 'assets/img', lang, url));
      if (images.every(image => known.has(image))) {
        const key = `shots:${url}`;
        virtuals.set(key, images);
        return key;
      }
    }
    const target = path.resolve(url.startsWith('/') ? root : path.dirname(file), url.replace(/^\//, ''));
    return target.startsWith(root + path.sep) && known.has(target) ? target : null;
  };

  for (const file of files) {
    const bytes = fs.readFileSync(file);
    if (!SOURCE_EXT.has(path.extname(file).toLowerCase())) {
      records.set(file, { base: hex(bytes), refs: [] });
      continue;
    }
    let source = bytes.toString('utf8');
    if (path.basename(file) === 'sw.js') source = source.replace(/^\/\/ Version: [^\n]*\n/, '');
    const refs = [];
    const normalized = source.replace(REF, (match, url, offset) => {
      if (url === '/maintenance-state.json') return url; // Worker zwraca no-store
      const target = resolve(file, url, source, offset);
      if (!target) return match;
      refs.push({ url, target });
      return url;
    });
    records.set(file, { base: hex(normalized), refs });
  }
  for (const [key, images] of virtuals) records.set(key, { base: hex(images.map(image => hex(fs.readFileSync(image))).join('\n')), refs: [] });

  const hashes = new Map();
  const visiting = new Set();
  function hashFile(file) {
    if (hashes.has(file)) return hashes.get(file);
    const record = records.get(file);
    if (visiting.has(file)) return record.base; // cykl importów: stabilna treść węzła
    visiting.add(file);
    const input = [record.base, ...record.refs.map(({ url, target }) => `${url}:${hashFile(target)}`)];
    const value = hex(input.join('\n'));
    visiting.delete(file);
    hashes.set(file, value);
    return value;
  }
  for (const file of files) hashFile(file);

  let updated = 0;
  for (const file of files) {
    if (!SOURCE_EXT.has(path.extname(file).toLowerCase())) continue;
    let source = fs.readFileSync(file, 'utf8');
    if (path.basename(file) === 'sw.js') {
      source = source.replace(/^\/\/ Version: [^\n]*\n/, `// Version: h${hashes.get(file).slice(0, 16)}\n`);
    }
    const output = source.replace(REF, (match, url, offset) => {
      if (url === '/maintenance-state.json') return url;
      const target = resolve(file, url, source, offset);
      return target ? `${url}?v=h${hashes.get(target).slice(0, 16)}` : match;
    });
    if (output !== fs.readFileSync(file, 'utf8')) { fs.writeFileSync(file, output); updated++; }
  }
  const manifest = Object.fromEntries(files.map(file => [path.relative(root, file).split(path.sep).join('/'), hashes.get(file)]));
  fs.writeFileSync(path.join(root, 'asset-hashes.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { files: files.length, updated };
}

module.exports = { contentHashAssets };
if (require.main === module) {
  const root = process.argv[2];
  if (!root) { console.error('Użycie: content-hash-assets.cjs KATALOG_ARTEFAKTU'); process.exitCode = 2; }
  else console.log(JSON.stringify(contentHashAssets(root)));
}
