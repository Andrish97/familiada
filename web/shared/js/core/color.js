// Kolory jako tekst „#RRGGBB” — jeden format zapisu dla całej aplikacji
// (Ustawienia gry, znaczniki Eksploratora). Odczyt przyjmuje też dawne
// zapisy (małe litery, bez „#”, skrót „#abc”), więc dane w bazie nie
// wymagają migracji. Błędny zapis: null — domyślny kolor wybiera wołający.

export function normHex(value) {
  let s = String(value ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toUpperCase()}` : null;
}

export function hexToRgb(value) {
  const hex = normHex(value);
  if (!hex) return null;
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channel(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 0;
}

export function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => channel(x).toString(16).padStart(2, "0")).join("").toUpperCase();
}
