#!/usr/bin/env node

/**
 * scripts/version-assets.js
 * Globalny cache-buster: JEDEN timestamp dla WSZYSTKICH zasobów w całym repozytorium.
 * Przeszukuje automatycznie wszystkie pliki tekstowe i aktualizuje odniesienia do zasobów.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const version = process.env.VERSION_HASH || `v${new Date().toISOString().replace(/[:.]/g, '').slice(0, -5)}`;

// Rozszerzenia plików, które chcemy wersjonować (zasoby)
const ASSET_EXT = 'js|css|json|png|svg|ico|jpg|jpeg|gif|woff2?|ttf|otf|webp|avif|xml|webmanifest|eot|mp3|wav|ogg|mp4|webm';

// Rozszerzenia plików, w których szukamy odniesień do zasobów (pliki źródłowe)
const SOURCE_EXT = ['.html', '.js', '.json', '.css', '.webmanifest'];

// Katalogi do całkowitego pominięcia
const IGNORE_DIRS = ['.git', 'node_modules', '.claude', '.qwen', '.github', 'audio', 'img'];

/**
 * Rekurencyjnie pobiera listę plików do przetworzenia
 */
function getFiles(dir, allFiles = []) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      if (!IGNORE_DIRS.includes(file.name)) {
        getFiles(fullPath, allFiles);
      }
    } else {
      if (SOURCE_EXT.includes(path.extname(file.name).toLowerCase())) {
        allFiles.push(fullPath);
      }
    }
  }
  return allFiles;
}

console.log(`[Versioner] Target version: ${version}`);

const filesToProcess = getFiles(ROOT);
let updatedCount = 0;

filesToProcess.forEach(filePath => {
  // Pomiń sam skrypt wersjonujący i sw.js (on ma specjalną logikę na końcu)
  if (filePath.endsWith('version-assets.js') || filePath.endsWith('sw.js')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const ext = path.extname(filePath).toLowerCase();

  // 1. Uniwersalne zastępowanie istniejących wersji: path.ext?v=stara_wersja
  const existingVersionRegex = new RegExp(`(\\.[a-zA-Z0-9]+)\\?v=[a-zA-Z0-9T:-]+`, 'g');
  content = content.replace(existingVersionRegex, `$1?v=${version}`);

  // 2. Dodawanie wersji tam, gdzie jej nie ma
  // Wzorce: ="path.ext", ='path.ext', : "path.ext", url("path.ext"), from "path.ext", import("path.ext")
  const noVersionRegex = new RegExp(`((?:=|: |from |import\\s*\\(|url\\s*\\()\\s*['"])([^'"]+\\.(?:${ASSET_EXT}))(?=['"]|\\s*\\))`, 'g');
  
  content = content.replace(noVersionRegex, (match, prefix, assetPath) => {
    // Jeśli ścieżka już ma wersję (co nie powinno się stać po kroku 1, ale na wszelki wypadek)
    if (assetPath.includes('?v=')) return match;
    // Nie wersjonuj linków zewnętrznych (http/https)
    if (assetPath.startsWith('http') || assetPath.startsWith('//')) return match;
    return `${prefix}${assetPath}?v=${version}`;
  });

  // 3. Specjalna obsługa dla HTML (meta version i Cache-Control)
  if (ext === '.html') {
    content = content.replace(/<meta name="app-version" content="[^"]*"/g, `<meta name="app-version" content="${version}"`);
    if (!content.includes('http-equiv="Cache-Control"')) {
      content = content.replace(/<head>/i, `<head>\n  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">`);
    }
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    updatedCount++;
  }
});

// ─── Update version.txt ───────────────────────────────────────────────────
fs.writeFileSync(path.join(ROOT, 'version.txt'), version, 'utf8');

// ─── Update sw.js ────────────────────────────────────────────────────────
const swPath = path.join(ROOT, 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  swContent = swContent.replace(/\/\/ Version: .*/, '').trim();
  swContent = `// Version: ${version}\n${swContent}`;
  fs.writeFileSync(swPath, swContent, 'utf8');
  console.log(`[Versioner] Updated sw.js`);
}

console.log(`[Versioner] Finished. Processed ${filesToProcess.length} files, updated ${updatedCount} files.`);
