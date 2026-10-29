// Wspólne liczby i zmienne CSS ustawiane z JS — jedno miejsce dla całej aplikacji.
// Skrypt liczy tylko wartość (procent, kolor z danych, położenie), wygląd daje CSS:
// pasek bierze szerokość z --p, słupek wykresu wysokość z --h, kropka koloru tło z --c.

/** Odstęp wyskakującego elementu od krawędzi okna (px). */
export const EDGE_PAD = 8;
/** Odstęp menu od przycisku, pod którym się otwiera (px). */
export const ANCHOR_GAP = 8;
/** Odstęp listy rozwijanej (ui-select) od pola (px). */
export const LIST_GAP = 6;
/** Najmniejsza wysokość listy rozwijanej przy braku miejsca (px). */
export const LIST_MIN_HEIGHT = 80;

export function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}

/** Procent 0–100 (nieliczba → 0). */
export function clampPct(pct) {
  return clamp(Number(pct) || 0, 0, 100);
}

/** Procent i z n (0, gdy n = 0), zaokrąglony. */
export function ratioPct(i, n) {
  const nn = Number(n) || 0;
  return nn > 0 ? clampPct(Math.round(((Number(i) || 0) / nn) * 100)) : 0;
}

/** Szerokość paska (.progress-bar, .aBar, linia etapów): --p w procentach. */
export function setProgress(el, pct, digits = 0) {
  el?.style.setProperty("--p", `${clampPct(pct).toFixed(digits)}%`);
}

/** Zmienne CSS elementu naraz: setVars(el, { "--c": kolor }); null usuwa. */
export function setVars(el, vars) {
  if (!el) return;
  for (const [name, value] of Object.entries(vars)) {
    if (value == null || value === "") el.style.removeProperty(name);
    else el.style.setProperty(name, String(value));
  }
}
