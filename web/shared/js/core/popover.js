// Położenie wyskakujących menu (position: fixed) — jedno dla całej aplikacji:
// menu języka, „Więcej” i konta w topbarze (placeDropdown), lista rozwijana
// ui-select (placeUnder), menu kontekstowe (placeAtPoint). Zawsze w oknie,
// EDGE_PAD od krawędzi.

import { EDGE_PAD as PAD, ANCHOR_GAP as GAP, LIST_GAP, LIST_MIN_HEIGHT, clamp } from "./ui-metrics.js?v=v2026-10-24T21364";

// Pomiar ukrytego menu: na chwilę widoczne, ale niewidzialne i bez kliknięć.
function measured(el, fn) {
  const wasHidden = el.hidden;
  if (wasHidden) {
    el.hidden = false;
    el.style.visibility = "hidden";
    el.style.pointerEvents = "none";
  }
  el.style.position = "fixed";
  fn(el.getBoundingClientRect());
  if (wasHidden) {
    el.style.visibility = "";
    el.style.pointerEvents = "";
    el.hidden = true;
  }
}

/**
 * Menu pod przyciskiem anchor, wyrównane do jego prawej krawędzi (align
 * "start" — do lewej); gdy nie mieści się pod — nad nim.
 */
export function placeDropdown(anchor, el, { align = "end" } = {}) {
  if (!anchor || !el) return;
  measured(el, (m) => {
    const a = anchor.getBoundingClientRect();
    const left = clamp(align === "start" ? a.left : a.right - m.width, PAD, innerWidth - m.width - PAD);
    let top = a.bottom + GAP;
    if (top + m.height > innerHeight - PAD) top = a.top - m.height - GAP;
    top = clamp(top, PAD, innerHeight - m.height - PAD);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.right = "auto";
    el.style.transform = "";
  });
}

/**
 * Lista pod polem (ui-select): szerokość pola (co najmniej minWidth), od jego
 * lewej krawędzi; nad polem, gdy pod nim jest mniej miejsca. Wysokość listy
 * ograniczona miejscem w oknie (przewija się sama).
 */
export function placeUnder(anchor, el, { minWidth = 0, gap = LIST_GAP, preferredHeight = 260 } = {}) {
  if (!anchor || !el) return;
  const a = anchor.getBoundingClientRect();
  const width = Math.min(Math.max(a.width, minWidth), innerWidth - 2 * PAD);
  const below = innerHeight - a.bottom - gap;
  const above = a.top - gap;
  const down = below >= Math.min(preferredHeight, above) || below >= above;
  Object.assign(el.style, {
    position: "fixed",
    left: `${clamp(a.left, PAD, innerWidth - width - PAD)}px`,
    width: `${width}px`,
    right: "auto",
    top: down ? `${a.bottom + gap}px` : "auto",
    bottom: down ? "auto" : `${innerHeight - a.top + gap}px`,
    maxHeight: `${Math.max(down ? below : above, LIST_MIN_HEIGHT)}px`,
  });
}

/** Zdejmuje położenie ustawione przez placeDropdown/placeUnder (np. menu przechodzi do panelu telefonu). */
export function clearPlacement(el) {
  if (!el) return;
  for (const prop of ["position", "left", "top", "right", "bottom", "width", "max-height", "transform", "visibility", "pointer-events"]) el.style.removeProperty(prop);
}

/** Menu w punkcie (x, y), np. menu kontekstowe — przesunięte, żeby mieściło się w oknie. */
export function placeAtPoint(el, x, y) {
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  el.hidden = false;
  el.style.position = "fixed";
  const m = el.getBoundingClientRect();
  el.style.left = `${clamp(x, PAD, innerWidth - m.width - PAD)}px`;
  el.style.top = `${clamp(y, PAD, innerHeight - m.height - PAD)}px`;
}
