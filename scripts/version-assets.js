#!/usr/bin/env node

/**
 * scripts/version-assets.js
 * Globalny cache-buster: JEDEN timestamp dla WSZYSTKICH assetów.
 * Działa automatycznie — nowy plik? Dostaje ten sam ?v=.
 * Zmieniony plik? Nowy deploy → nowy timestamp → cache bust.
 * Run ONLY in GitHub Actions (not committed back to repo).
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// Globalny version z timestamp - UŻYWANY WE WSZYSTKICH PLIKACH
const version = `v${new Date().toISOString().replace(/[:.]/g, '').slice(0, -5)}`;
console.log(`\n🔖 Version: ${version}\n`);

// ─── 1. Update ALL HTML files ───────────────────────────────────────────────

const htmlFiles = [
  'index.html', 'settings.html', 'host.html', 'control.html', 'display.html',
  'buzzer.html', 'builder.html', 'editor.html', 'bases.html', 'base-explorer.html',
  'logo-editor.html', 'login.html', 'account.html', 'confirm.html', 'reset.html',
  'connect-device.html', 'polls.html', 'poll-go.html', 'poll-qr.html',
  'poll-text.html', 'poll-points.html', 'polls-hub.html', 'marketplace.html',
  'subscriptions.html', 'privacy.html', 'maintenance.html', '404.html', 'manual.html',
  'settings-tools/editor_5x7.html', 'settings-tools/exporterandeditor.html',
  'settings-tools/kora-builder.html',
];

let htmlUpdated = 0;
for (const file of htmlFiles) {
  const htmlPath = path.join(ROOT, file);
  if (!fs.existsSync(htmlPath)) {
    console.log(`  ⚠ ${file} (nie znaleziono, pomijam)`);
    continue;
  }

  let content = fs.readFileSync(htmlPath, 'utf8');
  const originalContent = content;

  // Zamień istniejące ?v= na nowy version (relative URLs: /, ./, ../, lub bez prefiksu)
  content = content.replace(/(=["'])([a-zA-Z0-9_/.-]*\.(?:js|css|json|png|svg|ico|jpg|jpeg|gif|woff2?|ttf|otf|webp|avif|xml|webmanifest|eot))\?v=[a-zA-Z0-9T:-]+/g, `$1$2?v=${version}`);
  // Dodaj ?v= tam gdzie go brakuje (relative URLs)
  content = content.replace(/(=["'])([a-zA-Z0-9_/.-]*\.(?:js|css|json|png|svg|ico|jpg|jpeg|gif|woff2?|ttf|otf|webp|avif|xml|webmanifest|eot))(?=['"])/g, `$1$2?v=${version}`);

  // Meta version
  content = content.replace(/<meta name="app-version" content="[^"]*"/g, `<meta name="app-version" content="${version}"`);

  if (content !== originalContent) {
    fs.writeFileSync(htmlPath, content, 'utf8');
    console.log(`  ✓ ${file}`);
    htmlUpdated++;
  } else {
    console.log(`  ○ ${file} (bez zmian)`);
  }
}
console.log(`\n  📝 Updated ${htmlUpdated} HTML files\n`);

// ─── 2. Update ALL JS files (import ... from "...js?v=xxx") ─────────────────

const jsDirs = ['js/', 'logo-editor/js/', 'translation/', 'display/js/', 'control/js/'];
let jsUpdated = 0;

for (const jsDir of jsDirs) {
  const dirPath = path.join(ROOT, jsDir);
  if (!fs.existsSync(dirPath)) {
    console.log(`  ⚠ ${jsDir} (nie znaleziono, pomijam)`);
    continue;
  }

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;

      let content = fs.readFileSync(full, 'utf8');
      const originalContent = content;
      let changed = false;

      // import from "...js?v=xxx" - dopasowuje WSZYSTKIE formaty wersji
      content = content.replace(/(from\s+['"])([a-zA-Z0-9_./-]+\.(?:js|json))\?v=[a-zA-Z0-9T:-]+(['"])/g, (m, pre, rel, post) => {
        changed = true;
        return `${pre}${rel}?v=${version}${post}`;
      });
      // import from "...js" (bez ?v=)
      content = content.replace(/(from\s+['"])([a-zA-Z0-9_./-]+\.(?:js|json))(?=['"])/g, (m, pre, rel) => {
        changed = true;
        return `${pre}${rel}?v=${version}`;
      });

      // import dynamiczne - `import("...")`
      content = content.replace(/(import\s*\(\s*['"])([a-zA-Z0-9_./-]+\.(?:js|json))\?v=[a-zA-Z0-9T:-]+(['"]\s*\))/g, (m, pre, rel, post) => {
        changed = true;
        return `${pre}${rel}?v=${version}${post}`;
      });
      content = content.replace(/(import\s*\(\s*['"])([a-zA-Z0-9_./-]+\.(?:js|json))(?=['"]\s*\))/g, (m, pre, rel) => {
        changed = true;
        return `${pre}${rel}?v=${version}`;
      });

      if (changed && content !== originalContent) {
        fs.writeFileSync(full, content, 'utf8');
        console.log(`  ✓ ${full}`);
        jsUpdated++;
      }
    }
  }
  walk(dirPath);
}
console.log(`\n  📝 Updated ${jsUpdated} JS files\n`);

// ─── 3. Write version.txt ───────────────────────────────────────────────────

fs.writeFileSync(path.join(ROOT, 'version.txt'), version, 'utf8');
console.log(`\n  ✓ version.txt → ${version}`);

// ─── 4. Update sw.js ────────────────────────────────────────────────────────

const swPath = path.join(ROOT, 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  swContent = swContent.replace(/\/\/ Version: .*/, '').trim();
  swContent = `// Version: ${version}\n${swContent}`;
  fs.writeFileSync(swPath, swContent, 'utf8');
  console.log(`  ✓ sw.js updated`);
}

console.log('\n✅ Version assets complete!\n');
