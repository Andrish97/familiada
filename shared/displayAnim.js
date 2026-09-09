// shared/displayAnim.js
//
// Czasy animacji Wyświetlacza — jedno źródło prawdy. Wcześniej
// display2/js/render.js miał te stałe u siebie lokalnie, a control2/js/ui.js
// (blokada odsłaniania kolejnych kafli) trzymał osobną, ręcznie przepisaną
// kopię jednej z nich (500ms) — dwa miejsca z tą samą liczbą to właśnie
// "zgadywanie", którego zgłoszono unikać: jeśli render.js kiedyś zmieni ten
// czas, ui.js miałby o tym nie wiedzieć. Oba pliki mają teraz importować
// stąd, nie duplikować literałów.
//
// Wartości 1:1 z dawnego control/js/display.js (literały ANIMIN/ANIMOUT),
// zweryfikowane w kodzie przy przepisywaniu na display2 — nie zgadywane.
export const ROUND_INTRO_ANIM = { type: "matrix", axis: "down", ms: 1500 };
export const ROUND_OUT_ANIM = { type: "edge", dir: "down", ms: 1000 };
export const ANSWER_ANIM = { type: "matrix", axis: "right", ms: 500 };
export const FINAL_BOARD_ANIM = { type: "matrix", axis: "down", ms: 1500 };
export const FINAL_OUT_ANIM = { type: "edge", dir: "down", ms: 1000 };
export const LOGO_IN_ANIM = { type: "edge", dir: "up", ms: 1000 };
