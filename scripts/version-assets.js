#!/usr/bin/env node

/**
 * scripts/version-assets.js
 * Content-based cache busting for HTML assets.
 * Each JS/CSS file gets its own SHA-256 hash (first 8 chars).
 * Only changed files get a new ?v= hash — unchanged ones keep theirs.
 * Run ONLY in GitHub Actions (not committed back to repo).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();

function contentHash(filePath) {
  if (!fs.existsSync(filePath)) return 'missing';
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

// Generate version from timestamp (for meta + sw.js)
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
  const htmlDir = path.dirname(htmlPath);

  // Replace .js?v=xxx with content-based hash
  content = content.replace(/([a-zA-Z0-9_/.-]+\.js)\?v=[a-f0-9]+/g, (m, rel) => {
    const abs = path.resolve(htmlDir, rel);
    return `${rel}?v=${contentHash(abs)}`;
  });
  // Add ?v= to .js" without version
  content = content.replace(/([a-zA-Z0-9_/.-]+\.js)(?=")/g, (m, rel) => {
    const abs = path.resolve(htmlDir, rel);
    return `${rel}?v=${contentHash(abs)}`;
  });

  // Replace .css?v=xxx with content-based hash
  content = content.replace(/([a-zA-Z0-9_/.-]+\.css)\?v=[a-f0-9]+/g, (m, rel) => {
    const abs = path.resolve(htmlDir, rel);
    return `${rel}?v=${contentHash(abs)}`;
  });
  // Add ?v= to .css" without version
  content = content.replace(/([a-zA-Z0-9_/.-]+\.css)(?=")/g, (m, rel) => {
    const abs = path.resolve(htmlDir, rel);
    return `${rel}?v=${contentHash(abs)}`;
  });

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
