// The file importer and copy sender use the same canonical logo package.
import { DOT_W, DOT_H, TYPE_GLYPH, TYPE_PIX, PIX_FORMAT, normalizeRows } from "./render.js?v=v2026-10-19T12270";


function invalid(code, params = {}) {
  const error = new Error(code);
  error.code = code;
  error.params = params;
  throw error;
}

export function parseLogoPackage(obj, fallbackName) {
  const kindRaw = String(obj?.kind || "").toUpperCase();
  const typeRaw = String(obj?.type || "").toUpperCase();
  const kind = kindRaw || (typeRaw.includes("GLYPH") ? "GLYPH" : typeRaw.includes("PIX") ? "PIX" : "");
  const name = String(obj?.name || "").trim() || fallbackName;
  const p = obj?.payload || {};
  const source = p.source && typeof p.source === "object" ? { ...p.source } : {};
  delete source.editHistory;
  if (source.imageData) delete source.imageUrl;
  delete source.hostRasterUrl;
  delete source.hostRasterData;
  if (kind === "GLYPH") {
    const rows = normalizeRows(p.rows ?? p.layers?.[0]?.rows ?? obj?.rows);
    if (!source.mode) source.mode = "TEXT";
    return { name, type: TYPE_GLYPH, payload: { layers: [{ color: "main", rows }], source } };
  }
  if (kind === "PIX") {
    const w = Number(p.w) || DOT_W;
    const h = Number(p.h) || DOT_H;
    if (w !== DOT_W || h !== DOT_H) invalid("pixSize", { expectedW: DOT_W, expectedH: DOT_H, actualW: w, actualH: h });
    const bits_b64 = String(p.bits_b64 || "");
    if (!bits_b64) invalid("missingBits");
    if (!source.mode) source.mode = source.fabricData ? "DRAW" : "IMAGE";
    return { name, type: TYPE_PIX, payload: { w, h, format: PIX_FORMAT, bits_b64, source } };
  }
  invalid("unknownImportFormat");
}
