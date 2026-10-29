// web/js/gameplay/displayAnim.js
//
// STYL animacji Wyświetlacza (typ/kierunek) — jedno źródło prawdy dla
// control/display/js/render.js. Czasy trwania są w displayTiming.js (stałe,
// decyzja właściciela 2026-10-29); dźwięk wyznacza tylko start animacji.
//
// Typy 1:1 z dawnego control/js/display.js (literały ANIMIN/ANIMOUT),
// zweryfikowane w kodzie przy przepisywaniu na display2 — nie zgadywane.
// Przejścia planszy (logo, rundy, finał, ekran końcowy) mają własną animację:
// anim.js's transition (losowe wyrywanie starej, nachodzący wjazd nowej).
export const ANSWER_ANIM = { type: "matrix", axis: "right" };
// Pierwsze pojawienie się logo po intro (z pustego ekranu).
export const LOGO_IN_ANIM = { type: "edge", dir: "up" };
