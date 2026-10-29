// web/js/gameplay/displayAnim.js
//
// STYL animacji Wyświetlacza (typ/kierunek) — jedno źródło prawdy dla
// control/display/js/render.js. Czasy trwania są w displayTiming.js (stałe,
// decyzja właściciela 2026-10-29); dźwięk wyznacza tylko start animacji.
//
// Typy 1:1 z dawnego control/js/display.js (literały ANIMIN/ANIMOUT),
// zweryfikowane w kodzie przy przepisywaniu na display2 — nie zgadywane.
export const ROUND_INTRO_ANIM = { type: "matrix", axis: "down" };
export const ROUND_OUT_ANIM = { type: "edge", dir: "down" };
export const ANSWER_ANIM = { type: "matrix", axis: "right" };
export const FINAL_BOARD_ANIM = { type: "matrix", axis: "down" };
export const FINAL_OUT_ANIM = { type: "edge", dir: "down" };
export const LOGO_IN_ANIM = { type: "edge", dir: "up" };
// control/js/display.js's hideLogo(): "LOGO HIDE ANIMOUT edge down" —
// zejście logo PRZED wjazdem pierwszej planszy rund (control/js/gameRounds.js's
// startRound(): `await display.hideLogo()` zawsze PRZED
// roundsBoardPlaceholders(), nigdy równolegle).
export const LOGO_OUT_ANIM = { type: "edge", dir: "down" };
