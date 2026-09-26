// familiada/logo-editor/js/transfer.js
// Eksport/import logo do pliku .famlogo (JSON, bez id i użytkownika).
//
// Formaty wejściowe:
//   (A) { kind:"GLYPH"|"PIX", name, payload:{ rows | layers | bits_b64, source } }  -- nasz eksport
//   (B) { type:"GLYPH_30x10"|"PIX_150x70", name, payload }                          -- stary zrzut z bazy

import { t } from "../../translation/translation.js?v=v2026-09-26T16124";
import { DOT_W, DOT_H, TYPE_GLYPH, TYPE_PIX, PIX_FORMAT, normalizeRows } from "./render.js?v=v2026-09-26T16124";

/** Nazwa pliku z nazwy logo -- zostawia litery każdego alfabetu, wycina znaki zakazane w systemach plików. */
export function safeFileName(name, fallback) {
  const s = String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return s || fallback;
}

async function fetchImageAsDataUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Pełny rekord z bazy -> obiekt pliku. Obraz ze Storage osadzany jako base64. */
export async function buildExport(logo, fallbackName) {
  const name = logo.name || fallbackName;
  const p = logo.payload || {};
  const source = { ...(p.source || {}) };

  if (logo.type === TYPE_PIX) {
    if (source.imageUrl && !source.imageData) {
      try {
        source.imageData = await fetchImageAsDataUrl(source.imageUrl);
      } catch (e) {
        console.warn("[logo-editor/export] could not embed image:", e);
      }
    }
    // Z osadzonym obrazem plik jest samowystarczalny; URL zostaje tylko, gdy osadzenie się nie udało.
    if (source.imageData) delete source.imageUrl;
    delete source.editHistory;
    return {
      kind: "PIX",
      name,
      payload: { w: DOT_W, h: DOT_H, format: PIX_FORMAT, bits_b64: String(p.bits_b64 || ""), source },
    };
  }

  return {
    kind: "GLYPH",
    name,
    payload: { layers: [{ color: "main", rows: normalizeRows(p.layers?.[0]?.rows) }], source },
  };
}

export function downloadJson(obj, fileName) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Po kliknięciu przeglądarka i tak ma już referencję; zwolnienie z opóźnieniem
  // dla Safari, które potrafi zacząć pobieranie dopiero po obsłudze zdarzenia.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Tekst pliku -> { name, type, payload } gotowe do INSERT.
 * Rzuca Error z przetłumaczonym komunikatem.
 */
export function parseImport(text, fallbackName) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error(t("logoEditor.errors.invalidJson")); }

  const kindRaw = String(obj?.kind || "").toUpperCase();
  const typeRaw = String(obj?.type || "").toUpperCase();
  const kind = kindRaw || (typeRaw.includes("GLYPH") ? "GLYPH" : typeRaw.includes("PIX") ? "PIX" : "");
  const name = String(obj?.name || "").trim() || fallbackName;
  const p = obj?.payload || {};
  const source = p.source && typeof p.source === "object" ? { ...p.source } : {};
  delete source.editHistory;
  // Osadzony obraz ma pierwszeństwo przed URL-em ze Storage innego konta/instalacji.
  if (source.imageData) delete source.imageUrl;

  if (kind === "GLYPH") {
    const rows = normalizeRows(p.rows ?? p.layers?.[0]?.rows ?? obj?.rows);
    if (!source.mode) source.mode = "TEXT";
    return { name, type: TYPE_GLYPH, payload: { layers: [{ color: "main", rows }], source } };
  }

  if (kind === "PIX") {
    const w = Number(p.w) || DOT_W;
    const h = Number(p.h) || DOT_H;
    if (w !== DOT_W || h !== DOT_H) {
      throw new Error(t("logoEditor.errors.pixSize", { expectedW: DOT_W, expectedH: DOT_H, actualW: w, actualH: h }));
    }
    const bits_b64 = String(p.bits_b64 || "");
    if (!bits_b64) throw new Error(t("logoEditor.errors.missingBits"));
    if (!source.mode) source.mode = source.fabricData ? "DRAW" : "IMAGE";
    return { name, type: TYPE_PIX, payload: { w, h, format: PIX_FORMAT, bits_b64, source } };
  }

  throw new Error(t("logoEditor.errors.unknownImportFormat"));
}
