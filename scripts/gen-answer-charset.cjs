#!/usr/bin/env node
// E21: zestaw znaków dozwolonych w odpowiedziach, wyliczany z czcionki
// Wyświetlacza (web/shared/fonts/display/font_5x7.json, wszystkie grupy poza
// "meta", jak buildGlyphMap w fonts.js). Znak jest dozwolony, gdy po NFC
// i toUpperCase() (tak rysuje renderer) każdy wynikowy znak ma glif.
// Pomijamy znaki zastępcze U+FFFD/U+FFFE — glif „�” nie dowodzi obsługi.
//
//   node scripts/gen-answer-charset.cjs          -> zapisuje moduł JS
//   node scripts/gen-answer-charset.cjs --check  -> kod wyjścia 1, gdy moduł nieaktualny
//   node scripts/gen-answer-charset.cjs --sql    -> wypisuje literał SQL zestawu
//   node scripts/gen-answer-charset.cjs --sql-functions [schemat] -> definicje
//        fam_answer_charset / fam_answer_invalid_chars / fam_answer_clean
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FONT = path.join(ROOT, "web/shared/fonts/display/font_5x7.json");
const OUT = path.join(ROOT, "web/shared/js/core/answer-charset.js");
const EXCLUDED = new Set(["�", "￾"]);

function fontChars() {
  const font = JSON.parse(fs.readFileSync(FONT, "utf8"));
  const map = new Map();
  for (const [group, val] of Object.entries(font)) {
    if (group === "meta") continue;
    for (const [k, v] of Object.entries(val || {})) map.set(k, v);
  }
  const has = (ch) => {
    let v = map.get(ch);
    for (let i = 0; i < 4 && typeof v === "string" && v.startsWith("@"); i++) v = map.get(v.slice(1));
    return Array.isArray(v) && !EXCLUDED.has(ch);
  };
  return has;
}

function computeCharset() {
  const has = fontChars();
  const out = [];
  for (let cp = 0x20; cp <= 0x2ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const ch = String.fromCodePoint(cp);
    if (ch.normalize("NFC") !== ch) continue;
    if (/\s/u.test(ch) && ch !== " ") continue;
    const upper = Array.from(ch.toUpperCase());
    if (upper.every(has)) out.push(ch);
  }
  return out.join("");
}

function moduleSource(charset) {
  return `// PLIK GENEROWANY: node scripts/gen-answer-charset.cjs — nie edytować ręcznie.
// Znaki dozwolone w odpowiedziach (E21): czcionka 5x7 Wyświetlacza po NFC
// i zamianie na wielkie litery. Ten sam zestaw ma SQL (public.fam_answer_charset).
export const ANSWER_CHARSET = ${JSON.stringify(charset)};
`;
}

// Odpowiednik WHITESPACE_CLASS z answer-text.js (JS \\s), w składni regexu SQL.
const SQL_WS = "[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]";

function sqlFunctions(charset, schema = "public") {
  const lit = "'" + charset.replace(/'/g, "''") + "'";
  return `CREATE OR REPLACE FUNCTION ${schema}.fam_answer_charset() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$ SELECT ${lit}::text $f$;

CREATE OR REPLACE FUNCTION ${schema}.fam_answer_invalid_chars(p text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT coalesce(array_agg(ch ORDER BY pos), '{}'::text[])
  FROM (
    SELECT ch, min(i) AS pos
    FROM regexp_split_to_table(normalize(coalesce(p, ''), NFC), '') WITH ORDINALITY AS t(ch, i)
    WHERE ch !~ '${SQL_WS}' AND strpos(${schema}.fam_answer_charset(), ch) = 0
    GROUP BY ch
  ) s
$f$;

CREATE OR REPLACE FUNCTION ${schema}.fam_answer_clean(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT btrim(left(btrim(regexp_replace(coalesce(string_agg(ch, '' ORDER BY i), ''), '${SQL_WS}+', ' ', 'g'), ' '), 17), ' ')
  FROM regexp_split_to_table(normalize(coalesce(p, ''), NFC), '') WITH ORDINALITY AS t(ch, i)
  WHERE ch ~ '${SQL_WS}' OR strpos(${schema}.fam_answer_charset(), ch) > 0
$f$;
`;
}

const charset = computeCharset();
const arg = process.argv[2];
if (arg === "--sql-functions") {
  process.stdout.write(sqlFunctions(charset, process.argv[3] || "public"));
} else if (arg === "--sql") {
  process.stdout.write("'" + charset.replace(/'/g, "''") + "'");
} else if (arg === "--check") {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (cur !== moduleSource(charset)) { console.error("answer-charset.js nieaktualny"); process.exit(1); }
} else {
  fs.writeFileSync(OUT, moduleSource(charset));
  console.log(`answer-charset.js: ${Array.from(charset).length} znaków`);
}
module.exports = { computeCharset, sqlFunctions };
