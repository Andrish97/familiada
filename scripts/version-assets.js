#!/usr/bin/env node
/**
 * version-assets.js
 * Adds/updates ?v=<sha256[0:8]> cache-busting query params on:
 *   1. All local .js / .css references (src=, href=) in every .html file
 *   2. All relative ES module imports (import ... from, import()) in .js files
 *
 * Hash is computed from file content with existing ?v=... stripped —
 * this makes the process idempotent (running twice gives the same result).
 *
 * Run:  node scripts/version-assets.js
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// Directories to skip entirely
const SKIP_DIRS = new Set(['.git', 'node_modules', 'cloudflare', 'supabase', 'marketplace']);

// Regex used to strip existing ?v= before hashing (so hash is content-stable)
const STRIP_V = /\?v=[0-9a-f]{8}/g;

/** Recursively collect all files with given extension under dir */
function findFiles(dir, ext) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

/** SHA-256 of file content with ?v=... stripped, first 8 hex chars. null if not found. */
function fileHash(absPath) {
  try {
    const content = fs.readFileSync(absPath, 'utf8').replace(STRIP_V, '');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  } catch {
    return null;
  }
}

/** Resolve a URL (possibly with ?v=) from a source file to an absolute filesystem path */
function resolveUrl(urlPath, sourceFile) {
  const cleanPath = urlPath.split('?')[0];
  if (cleanPath.startsWith('/')) {
    return path.join(ROOT, cleanPath);
  }
  return path.join(path.dirname(sourceFile), cleanPath);
}

let htmlFilesChanged = 0;
let htmlAttrsUpdated = 0;
let jsFilesChanged   = 0;
let jsImportsUpdated = 0;

// ─── 1. HTML files: src="*.js", href="*.css" ───────────────────────────────

for (const htmlFile of findFiles(ROOT, '.html')) {
  const original = fs.readFileSync(htmlFile, 'utf8');

  const updated = original.replace(
    /((?:src|href)=")([^"]*?)(\?[^"]*)?(")/g,
    (match, attrOpen, urlPath, _query, attrClose) => {
      if (!urlPath.endsWith('.js') && !urlPath.endsWith('.css')) return match;
      if (/^https?:\/\/|^\/\//.test(urlPath)) return match;
      if (!urlPath) return match;

      const absPath = resolveUrl(urlPath, htmlFile);
      const hash    = fileHash(absPath);
      if (!hash) return match;

      htmlAttrsUpdated++;
      return `${attrOpen}${urlPath.split('?')[0]}?v=${hash}${attrClose}`;
    }
  );

  if (updated !== original) {
    fs.writeFileSync(htmlFile, updated, 'utf8');
    htmlFilesChanged++;
    console.log(`  html: ${path.relative(ROOT, htmlFile)}`);
  }
}

// ─── 2. JS files: import ... from "./foo.js" and import("./foo.js") ────────

for (const jsFile of findFiles(ROOT, '.js')) {
  if (jsFile === __filename) continue; // skip this script

  const original = fs.readFileSync(jsFile, 'utf8');

  // Matches:
  //   from "./foo.js"           from '../../bar.js'
  //   import("./foo.js")        import('./bar.js')
  // Only relative paths (./ or ../) — absolute paths use server cache headers.
  const updated = original.replace(
    /(\b(?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"'?]+\.js)(\?v=[0-9a-f]{8})?(?=["']|\s*\))/g,
    (match, prefix, urlPath, _oldV) => {
      const absPath = resolveUrl(urlPath, jsFile);
      const hash    = fileHash(absPath);
      if (!hash) return match;

      jsImportsUpdated++;
      return `${prefix}${urlPath}?v=${hash}`;
    }
  );

  if (updated !== original) {
    fs.writeFileSync(jsFile, updated, 'utf8');
    jsFilesChanged++;
    console.log(`  js:   ${path.relative(ROOT, jsFile)}`);
  }
}

console.log(
  `\nDone — HTML: ${htmlAttrsUpdated} attrs in ${htmlFilesChanged} files` +
  ` | JS: ${jsImportsUpdated} imports in ${jsFilesChanged} files.`
);

// ─── 3. Update app-version meta tag in ALL HTML files ───────────────────────

const date = new Date();
const version = `v${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}.${String(Math.floor(date.getTime()/1000)).slice(-4)}`;

for (const htmlFile of findFiles(ROOT, '.html')) {
  try {
    const content = fs.readFileSync(htmlFile, 'utf8');
    const updated = content.replace(
      /(<meta name="app-version" content=")[^"]*("\/>)/g,
      `$1${version}$2`
    );
    if (updated !== content) {
      fs.writeFileSync(htmlFile, updated, 'utf8');
      console.log(`  version: ${path.relative(ROOT, htmlFile)} → ${version}`);
    }
  } catch(e) {
    console.warn(`Could not update ${htmlFile}:`, e.message);
  }
}
