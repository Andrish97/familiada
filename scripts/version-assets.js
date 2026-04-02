#!/usr/bin/env node

/**
 * scripts/version-assets.js
 * Adds version hash to HTML files for cache busting.
 * Run ONLY in GitHub Actions (not committed back to repo).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();

// Generate version from timestamp
const version = `v${new Date().toISOString().replace(/[:.]/g, '').slice(0, -5)}`;
console.log(`\n🔖 Version: ${version}\n`);

// ─── 1. Update HTML files ───────────────────────────────────────────────────

const htmlFiles = [
  'index.html',
  'settings.html',
  'host.html',
  'control.html',
  'display.html',
  'buzzer.html',
  'builder.html',
  'editor.html',
  'bases.html',
  'base-explorer.html',
  'logo-editor.html',
  'login.html',
  'account.html',
  'confirm.html',
  'reset.html',
  'connect-device.html',
  'polls.html',
  'poll-go.html',
  'poll-qr.html',
  'poll-text.html',
  'poll-points.html',
  'polls-hub.html',
  'marketplace.html',
  'subscriptions.html',
  'privacy.html',
  'maintenance.html',
  '404.html',
  'manual.html',
  'settings-tools/editor_5x7.html',
  'settings-tools/exporterandeditor.html',
  'settings-tools/kora-builder.html',
];

for (const file of htmlFiles) {
  const htmlPath = path.join(ROOT, file);
  if (!fs.existsSync(htmlPath)) continue;

  let content = fs.readFileSync(htmlPath, 'utf8');

  // Update .js?v=xxx
  content = content.replace(/(\.js)\?v=[a-f0-9]+/g, `$1?v=${version}`);
  content = content.replace(/(\.js)"/g, `$1?v=${version}"`);

  // Update .css?v=xxx
  content = content.replace(/(\.css)\?v=[a-f0-9]+/g, `$1?v=${version}`);
  content = content.replace(/(\.css)"/g, `$1?v=${version}"`);

  // Update meta app-version
  content = content.replace(/<meta name="app-version" content="[^"]*"/g, `<meta name="app-version" content="${version}"`);

  fs.writeFileSync(htmlPath, content, 'utf8');
  console.log(`  ✓ ${file}`);
}

// ─── 2. Write version.txt ───────────────────────────────────────────────────

fs.writeFileSync(path.join(ROOT, 'version.txt'), version, 'utf8');
console.log(`\n  ✓ version.txt → ${version}`);

// ─── 3. Update sw.js ────────────────────────────────────────────────────────

const swPath = path.join(ROOT, 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  swContent = swContent.replace(/\/\/ Version: .*/, '').trim();
  swContent = `// Version: ${version}\n${swContent}`;
  fs.writeFileSync(swPath, swContent, 'utf8');
  console.log(`  ✓ sw.js updated`);
}

console.log('\n✅ Version assets complete!\n');
