#!/usr/bin/env node
/**
 * import.mjs — importuje gry z games-import/*.json do marketplace
 *
 * Użycie:
 *   node games-import/import.mjs --url https://twoja-domena.pl --token TWOJ_TOKEN_ADMINA
 *
 * Opcje:
 *   --url     adres strony (np. https://familiada.pl)
 *   --token   token admina (z ustawień panelu)
 *   --dry     tylko sprawdź pliki, nie importuj
 *   --skip N  pomiń pierwsze N gier (do wznawiania)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);

const BASE_URL = get("--url") || "http://localhost:8787";
const TOKEN    = get("--token");
const DRY_RUN  = has("--dry");
const SKIP     = parseInt(get("--skip") || "0", 10);

if (!TOKEN && !DRY_RUN) {
  console.error("Brak --token. Użyj --dry do podglądu bez importu.");
  process.exit(1);
}

// Wczytaj wszystkie gra-*.json
const files = fs.readdirSync(__dirname)
  .filter(f => /^gra-\d+\.json$/.test(f))
  .sort();

console.log(`Znaleziono ${files.length} plików.`);

const games = [];
for (const file of files) {
  const raw = fs.readFileSync(path.join(__dirname, file), "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`[BŁĄD] ${file}: niepoprawny JSON:`, e.message);
    continue;
  }
  // format: [ { title, description, lang, payload: { questions } } ]
  const game = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!game?.title || !game?.lang || !game?.payload?.questions) {
    console.error(`[BŁĄD] ${file}: brakuje title/lang/payload.questions`);
    continue;
  }
  const num = file.replace("gra-", "").replace(".json", "");
  games.push({
    storage_path: `import/gra-${num}`,
    title:        game.title,
    description:  game.description || "",
    lang:         game.lang,
    payload:      game.payload,
  });
}

console.log(`Poprawnych gier: ${games.length}`);

if (DRY_RUN) {
  games.forEach((g, i) => console.log(`[${i + 1}] ${g.title} (${g.lang}) — ${g.payload.questions.length} pytań`));
  process.exit(0);
}

const toImport = games.slice(SKIP);
console.log(`Importuję ${toImport.length} gier (pomijam ${SKIP})...\n`);

const BATCH = 10;
let imported = 0;
let failed = 0;

for (let i = 0; i < toImport.length; i += BATCH) {
  const batch = toImport.slice(i, i + BATCH);
  const res = await fetch(`${BASE_URL}/_admin_api/marketplace/import-bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": TOKEN,
    },
    body: JSON.stringify({ games: batch }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[HTTP ${res.status}] Batch ${i}–${i + batch.length - 1}:`, text);
    failed += batch.length;
    continue;
  }

  const data = await res.json();
  imported += data.imported || 0;
  failed += data.failed || 0;

  for (const r of (data.results || [])) {
    const status = r.ok ? (r.existing ? "już istnieje" : "zaimportowano") : `BŁĄD: ${r.error}`;
    console.log(`  [${SKIP + i + r.index + 1}] ${r.title || "?"} — ${status}`);
  }
}

console.log(`\nGotowe! Zaimportowano: ${imported}, błędów: ${failed}`);
