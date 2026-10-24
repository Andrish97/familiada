// js/core/swipe.js
// Przesunięcie palcem w bok (karuzele zrzutów: strona główna, Wskazówki). Pionowy ruch
// zostaje przewijaniem strony; po przesunięciu kliknięcie nie otwiera podglądu.

const MIN_DX = 40;

/**
 * @param {HTMLElement} el
 * @param {(dir: 1 | -1) => void} onSwipe  1 — następny (palec w lewo), -1 — poprzedni
 */
export function onSwipe(el, onSwipe) {
  let start = null;
  let swiped = false;
  el.classList.add("swipe-target"); // touch-action w silniku
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped = true;
    setTimeout(() => { swiped = false; }, 400);
    onSwipe(dx < 0 ? 1 : -1);
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", () => { start = null; });
  // Kliknięcie zaraz po przesunięciu to koniec gestu, nie otwarcie podglądu.
  el.addEventListener("click", (e) => {
    if (!swiped) return;
    e.preventDefault();
    e.stopPropagation();
    swiped = false;
  }, true);
}
