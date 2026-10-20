// base-explorerjs/ui/marquee.js
// Zaznaczanie ramką — jedna implementacja dla listy, drzewa i lewego panelu.
// Mysz: przeciągnięcie od pustego miejsca (z Ctrl/⌘ — dokłada do
// zaznaczenia). Dotyk: przeciągnięcie dwoma palcami (przełącza trafione
// wiersze względem zaznaczenia sprzed gestu).
// Po przeciągnięciu przeglądarka wysyła jeszcze „click” — consumeClick()
// pozwala go pominąć, żeby nie skasował zaznaczenia z ramki.

import { isModKey } from "../platform.js?v=v2026-10-20T19584";

/**
 * container   element przewijany z wierszami
 * rowSelector selektor wierszy z data-key
 * canStart(ev)            czy wolno zacząć (np. uprawnienia, widok)
 * getBase()               zaznaczenie sprzed ramki (Set kluczy)
 * onSelect(keys, final)   nowy zbiór kluczy (final = koniec ramki)
 */
export function attachMarquee(container, { rowSelector, canStart = () => true, getBase, onSelect }) {
  if (!container) return { consumeClick: () => false };
  if (getComputedStyle(container).position === "static") container.style.position = "relative";

  let box = null;     // element ramki
  let start = null;   // punkt startu we współrzędnych kontenera
  let base = null;    // zaznaczenie bazowe (dokładanie / przełączanie)
  let toggle = false; // dotyk: przełączanie zamiast dokładania
  let moved = false;
  let suppressClick = false;

  const local = (p) => {
    const r = container.getBoundingClientRect();
    return { x: p.clientX - r.left + container.scrollLeft, y: p.clientY - r.top + container.scrollTop };
  };

  function rectOf(a, b) {
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
  }

  function begin(p, baseKeys, isToggle) {
    start = local(p);
    base = baseKeys;
    toggle = isToggle;
    moved = false;
    box = document.createElement("div");
    box.className = "marquee";
    Object.assign(box.style, { left: `${start.x}px`, top: `${start.y}px`, width: "0px", height: "0px" });
    container.appendChild(box);
  }

  function update(p) {
    const cur = local(p);
    const r = rectOf(start, cur);
    if (r.right - r.left > 3 || r.bottom - r.top > 3) moved = true;
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` });

    const cr = container.getBoundingClientRect();
    const hit = new Set();
    container.querySelectorAll(rowSelector).forEach((row) => {
      const rr = row.getBoundingClientRect();
      const top = rr.top - cr.top + container.scrollTop;
      const left = rr.left - cr.left + container.scrollLeft;
      const intersects = !(left > r.right || left + rr.width < r.left || top > r.bottom || top + rr.height < r.top);
      if (intersects && row.dataset.key) hit.add(row.dataset.key);
    });

    const out = new Set(base || []);
    for (const k of hit) {
      if (toggle && out.has(k)) out.delete(k);
      else out.add(k);
    }
    onSelect(out, false);
  }

  function end() {
    if (!box) return;
    box.remove();
    box = null;
    if (moved) suppressClick = true;
    onSelect(null, true);
  }

  // ----- mysz -----
  container.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(`${rowSelector}, .list-head, .col-resizer, button, a, input, textarea, select, label`)) return;
    if (!canStart(e)) return;
    begin(e, isModKey(e) ? new Set(getBase()) : new Set(), false);
    e.preventDefault(); // bez zaznaczania tekstu
  });
  document.addEventListener("mousemove", (e) => { if (box && !toggle) update(e); });
  document.addEventListener("mouseup", () => { if (box && !toggle) end(); });

  // ----- dotyk: dwa palce -----
  container.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 2 || box || !canStart(e)) return;
    begin(e.touches[0], new Set(getBase()), true);
  }, { passive: true });
  container.addEventListener("touchmove", (e) => {
    if (!box || !toggle || e.touches.length < 2) return;
    e.preventDefault();
    update(e.touches[1]);
  }, { passive: false });
  container.addEventListener("touchend", () => { if (box && toggle) end(); });
  container.addEventListener("touchcancel", () => { if (box && toggle) end(); });

  return {
    // true = ten „click” to koniec ramki (pomiń go)
    consumeClick() {
      const s = suppressClick;
      suppressClick = false;
      return s;
    },
  };
}
