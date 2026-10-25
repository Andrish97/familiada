// admin/js/marketing-csv.js — CSV kontaktów marketingowych: odczyt pliku z przeglądu
// (eksport z panelu, kolumna decision) i wiersze do importu. Bez DOM.

// Prosty CSV (RFC 4180): pola w cudzysłowie, "" w środku, separator , albo ;.
export function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// Wiersze importu: id + decyzja (zostaw/usuń) + opcjonalnie nazwa i kategoria.
export function importRows(records) {
  const keep = /^(1|tak|yes|true|zostaw|keep|good|dobry|ok)$/i;
  const drop = /^(0|nie|no|false|usuń|usun|delete|junk|śmieć|smiec|remove)$/i;
  const out = [];
  for (const r of records) {
    const id = String(r.id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const d = String(r.decision ?? r.decyzja ?? "").trim();
    const decision = drop.test(d) ? "delete" : keep.test(d) ? "keep" : "";
    const row = { id, decision };
    if (r.name ?? r.nazwa) row.name = String(r.name ?? r.nazwa).slice(0, 200);
    if (r.category ?? r.kategoria) row.category = String(r.category ?? r.kategoria).slice(0, 80);
    out.push(row);
  }
  return out;
}
