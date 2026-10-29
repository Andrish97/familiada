// src/lib/utils.js -- small generic utilities (pure, no deps).

export function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

const SUPPORTED_LANGS = ["pl", "en", "uk"];

export function normalizeLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : "pl";
}

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
