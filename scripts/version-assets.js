#!/usr/bin/env node
/**
 * version-assets.js
 * Adds/updates ?v=<sha256[0:8]> cache-busting query params on all local
 * .js and .css references in every .html file in the repo.
 *
 * Run:  node scripts/version-assets.js
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// Directories to skip entirely
const SKIP_DIRS = new Set(['.git', 'node_modules', 'cloudflare', 'supabase', 'marketplace']);

/** Recursively collect all .html files under dir */
function findHtml(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtml(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

/** First 8 hex chars of SHA-256 of the file, or null if file not found */
function fileHash(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  } catch {
    return null;
  }
}

/** Resolve a URL from an HTML file to an absolute filesystem path */
function resolveUrl(urlPath, htmlFile) {
  if (urlPath.startsWith('/')) {
    return path.join(ROOT, urlPath);
  }
  return path.join(path.dirname(htmlFile), urlPath);
}

let filesChanged = 0;
let attrsUpdated = 0;

for (const htmlFile of findHtml(ROOT)) {
  const original = fs.readFileSync(htmlFile, 'utf8');

  // Match any attribute value that could be a local .js or .css URL.
  // Handles both  src="..."  and  href="..."  with or without existing ?v=...
  const updated = original.replace(
    /((?:src|href)=")([^"]*?)(\?[^"]*)?(")/g,
    (match, attrOpen, urlPath, _query, attrClose) => {
      // Only process .js and .css
      if (!urlPath.endsWith('.js') && !urlPath.endsWith('.css')) return match;
      // Skip external URLs
      if (/^https?:\/\/|^\/\//.test(urlPath)) return match;
      // Skip empty
      if (!urlPath) return match;

      const absPath = resolveUrl(urlPath, htmlFile);
      const hash    = fileHash(absPath);
      if (!hash) {
        // File not found locally — leave unchanged
        return match;
      }

      attrsUpdated++;
      return `${attrOpen}${urlPath}?v=${hash}${attrClose}`;
    }
  );

  if (updated !== original) {
    fs.writeFileSync(htmlFile, updated, 'utf8');
    filesChanged++;
    console.log(`  versioned: ${path.relative(ROOT, htmlFile)}`);
  }
}

console.log(`\nDone — ${attrsUpdated} asset refs updated across ${filesChanged} HTML files.`);
