// Położenie wyskakujących menu (position: fixed) — jedno dla całej aplikacji:
// menu języka, „Więcej” i konta w topbarze (placeDropdown), menu kontekstowe
// (placeAtPoint). Zawsze w oknie, 8 px od krawędzi.

const PAD = 8;
const GAP = 8;

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}

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

/** Menu pod przyciskiem anchor, wyrównane do jego prawej krawędzi; gdy nie mieści się pod — nad nim. */
export function placeDropdown(anchor, el) {
  if (!anchor || !el) return;
  measured(el, (m) => {
    const a = anchor.getBoundingClientRect();
    const left = clamp(a.right - m.width, PAD, innerWidth - m.width - PAD);
    let top = a.bottom + GAP;
    if (top + m.height > innerHeight - PAD) top = a.top - m.height - GAP;
    top = clamp(top, PAD, innerHeight - m.height - PAD);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.right = "auto";
    el.style.transform = "";
  });
}

/** Zdejmuje położenie ustawione przez placeDropdown (np. menu przechodzi do panelu telefonu). */
export function clearPlacement(el) {
  if (!el) return;
  for (const prop of ["position", "left", "top", "right", "transform", "visibility", "pointer-events"]) el.style.removeProperty(prop);
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
