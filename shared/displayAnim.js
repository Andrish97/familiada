// shared/displayAnim.js
//
// STYL animacji Wyświetlacza (typ/kierunek) — jedno źródło prawdy dla
// display2/js/render.js. Czasy trwania (`ms`) NIE są tu już zaszyte na
// sztywno (zgłoszone: "Pozbądźmy się sztywnych zapisanych ram czasowych...
// Animacja zawsze = dźwięki") — render.js dolicza `ms` dynamicznie, z
// shared/transitionTiming.js, na podstawie rzeczywistego czasu trwania
// dźwięku towarzyszącego danej animacji. Te stałe zostają WYŁĄCZNIE jako
// "jak" (typ wjazdu/wyjazdu: matrix/edge, kierunek), nie "jak długo".
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
