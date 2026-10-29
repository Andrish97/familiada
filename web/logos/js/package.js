// The file importer and copy sender use the same canonical logo package.
import { DOT_W, DOT_H, TYPE_GLYPH, TYPE_PIX, PIX_FORMAT, normalizeRows } from "./render.js?v=v2026-10-29T13391";


// Nazwa logo: jak w polu nazwy i w bazie (migracja 513).
export const LOGO_NAME_MAX = 80;
// Obraz logo tylko z własnego Storage (bucket user-logos) -- adres z obcego
// pliku pobierałby obraz z dowolnego serwera na ekranie Prowadzącego.
const OWN_IMAGE_URL = /^https:\/\/[^/?#]+\/storage\/v1\/object\/public\/user-logos\/[^?#]+$/i;

// Rysunek (fabric) bez obrazów: edytor ich nie tworzy, a loadFromJSON
// pobrałby każdy `src` z pliku.
function withoutImages(scene) {
  if (!scene || typeof scene !== "object") return scene;
  const clean = { ...scene };
  delete clean.backgroundImage;
  delete clean.overlayImage;
  if (Array.isArray(clean.objects)) {
    clean.objects = clean.objects
      .filter((o) => !/image/i.test(String(o?.type || "")))
      .map((o) => (o && typeof o === "object" && Array.isArray(o.objects) ? withoutImages(o) : o));
  }
  return clean;
}

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
  const name = (String(obj?.name || "").trim() || String(fallbackName || "")).slice(0, LOGO_NAME_MAX);
  const p = obj?.payload || {};
  const source = p.source && typeof p.source === "object" ? { ...p.source } : {};
  delete source.editHistory;
  if (source.imageData || !OWN_IMAGE_URL.test(String(source.imageUrl || ""))) delete source.imageUrl;
  if (source.fabricData) source.fabricData = withoutImages(source.fabricData);
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
