// Testy scripts/version-assets.js — cache-bustera odpalanego przy każdym
// wdrożeniu (deploy-pages.yml). Zasoby z ?v= Worker serwuje jako
// "immutable", więc KAŻDE lokalne odwołanie do .js/.css musi dostać ?v=
// bieżącego wdrożenia. Odwołanie bez ?v= zostaje w cache przeglądarki ze
// starą treścią, a ta ładuje resztę modułów ze starymi wersjami.
//
// Regresja: `import "../core/contact-modal.js"` (import bez nazw) nie
// dostawał ?v=. Stary contact-modal.js ładował translation.js ze starym ?v=
// — drugi egzemplarz modułu tłumaczeń ze starym słownikiem nakładał się na
// stronę i po zmianie builder → games /games pokazywał klucze zamiast tekstów.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/version-assets.js");
const SKIP = new Set([".git", "node_modules", "img", "audio", "tests", "docs", "supabase", "cloudflare", "services", "searxng", ".github"]);
const VERSION = "vTEST123";

function runVersioner(dir) {
  execFileSync(process.execPath, [SCRIPT], { cwd: dir, env: { ...process.env, VERSION_HASH: VERSION }, stdio: "pipe" });
}

function walk(dir, rel = "", out = []) {
  for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) { if (!SKIP.has(ent.name) && ent.name !== "scripts") walk(dir, r, out); }
    else if (/\.(js|mjs|html)$/.test(ent.name)) out.push(r);
  }
  return out;
}

test("import bez nazw (import \"x.js\") dostaje ?v=", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-"));
  try {
    fs.writeFileSync(path.join(dir, "a.js"), [
      'import "../core/contact-modal.js";',
      "import './side.js';",
      'import { t } from "../../translation/translation.js";',
      'const m = await import("./lazy.js");',
    ].join("\n"));
    runVersioner(dir);
    const out = fs.readFileSync(path.join(dir, "a.js"), "utf8");
    assert.match(out, new RegExp(`import "\\.\\./core/contact-modal\\.js\\?v=${VERSION}";`));
    assert.match(out, new RegExp(`import '\\./side\\.js\\?v=${VERSION}';`));
    assert.match(out, new RegExp(`from "\\.\\./\\.\\./translation/translation\\.js\\?v=${VERSION}"`));
    assert.match(out, new RegExp(`import\\("\\./lazy\\.js\\?v=${VERSION}"\\)`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("po wersjonowaniu całej aplikacji każdy lokalny .js/.css ma bieżące ?v=", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-app-"));
  try {
    fs.cpSync(ROOT, dir, {
      recursive: true,
      filter: (src) => !SKIP.has(path.basename(src)) || src === ROOT,
    });
    fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
    runVersioner(dir);

    const unversioned = [];
    const stale = [];
    const re = /(?:\bimport\s*\(?\s*|\bfrom\s+|\b(?:src|href)=)["']([^"']+\.(?:js|mjs|css)(?:\?[^"']*)?)["']/g;
    for (const f of walk(dir)) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of src.matchAll(re)) {
        const ref = m[1];
        if (/^(https?:)?\/\//.test(ref) || ref.includes("${")) continue;
        if (!ref.includes("?v=")) unversioned.push(`${f}: ${ref}`);
        else if (!ref.includes(`?v=${VERSION}`)) stale.push(`${f}: ${ref}`);
      }
    }
    assert.deepEqual(unversioned, [], "odwołania bez ?v=:\n" + unversioned.join("\n"));
    assert.deepEqual(stale, [], "odwołania ze starym ?v=:\n" + stale.join("\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("żadna strona nie ładuje tego samego modułu pod dwoma różnymi adresami", () => {
  // Ten sam plik pod dwoma adresami (np. z ?v= i bez) = dwa egzemplarze
  // modułu. connect-device.html miał contact-modal.js?v=… w <script>, a
  // connect-device.js importował go jeszcze raz bez ?v=. Ten sam adres w
  // <script> i w imporcie (np. topbar-controller.js z tym samym ?v=) jest OK.
  const conflicts = [];
  for (const html of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
    const src = fs.readFileSync(path.join(ROOT, html), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const urls = new Map(); // ścieżka -> Set(pełnych adresów)
    const add = (p, full) => {
      if (!urls.has(p)) urls.set(p, new Set());
      urls.get(p).add(full);
    };
    const scripts = [...src.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !/^(https?:)?\/\//.test(u));
    for (const u of scripts) {
      const [p, q = ""] = u.replace(/^\//, "").split("?");
      add(path.posix.normalize(p), q);
    }
    for (const u of scripts) {
      const s = path.posix.normalize(u.replace(/^\//, "").split("?")[0]);
      const file = path.join(ROOT, s);
      if (!fs.existsSync(file)) continue;
      const js = fs.readFileSync(file, "utf8");
      for (const m of js.matchAll(/\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g)) {
        if (!m[1].startsWith(".")) continue;
        const [ref, q = ""] = m[1].split("?");
        add(path.posix.normalize(path.posix.join(path.posix.dirname(s), ref)), q);
      }
    }
    for (const [p, set] of urls) {
      if (set.size > 1) conflicts.push(`${html}: ${p} jako ${[...set].map((q) => q ? "?" + q : "(bez ?v)").join(" i ")}`);
    }
  }
  assert.deepEqual(conflicts, []);
});
