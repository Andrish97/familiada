// web/shared/js/gameplay/displayTiming.js
//
// Stałe czasy animacji Wyświetlacza (decyzja właściciela 2026-10-29:
// animacje były za szybkie i nierówne — odpowiedź (17 znaków) i punkty
// (2 znaki) dzieliły czas dźwięku po połowie, więc tekst leciał kilka razy
// szybciej niż punkty; „kiedyś mieliśmy stałe czasy”).
// Odsłanianie idzie w jednym tempie na znak (kafel 5x7), przejścia planszy
// i logo mają stały czas. Dźwięk nadal wyznacza START animacji
// (transitionTiming.js), nie jej długość. Control liczy z tych samych stałych
// oczekiwany czas potwierdzenia planszy (control/js/app.js).

// Jeden krok odsłaniania: jeden znak (kolumna kafli) tekstu lub punktów.
export const REVEAL_TILE_MS = 90;

// Szerokości pól (control/display/js/scene.js).
export const ROUND_TEXT_TILES = 17;
export const POINTS_TILES = 2;
export const SUMA_TILES = 3;
export const FINAL_TEXT_TILES = 11;

export const revealMs = (tiles) => Math.max(0, tiles | 0) * REVEAL_TILE_MS;

// Odpowiedź w rundzie: tekst, punkty i (gdy bank rośnie) suma — po kolei.
export const ROUND_TEXT_MS = revealMs(ROUND_TEXT_TILES);
export const ROUND_POINTS_MS = revealMs(POINTS_TILES);
export const ROUND_SUMA_MS = revealMs(SUMA_TILES);
export const ROUND_ANSWER_TOTAL_MS = ROUND_TEXT_MS + ROUND_POINTS_MS + ROUND_SUMA_MS;

// Finał: odpowiedź, potem punkty razem z sumą.
export const FINAL_TEXT_MS = revealMs(FINAL_TEXT_TILES);
export const FINAL_POINTS_MS = revealMs(Math.max(POINTS_TILES, SUMA_TILES));
export const FINAL_ANSWER_TOTAL_MS = FINAL_TEXT_MS + FINAL_POINTS_MS;

// Przejście planszy (decyzja właściciela 2026-10-29): stara zawartość znika
// losowo wyrywanymi kawałkami rzędów, a nowa wjeżdża z góry, zaczynając
// przed końcem znikania (nakładka). Też logo -> plansza i plansza -> ekran końcowy.
// Przyspieszone po obejrzeniu (właściciel 29.10): 0,9 + 1,3 - 0,5 = 1,7 s.
export const BOARD_OUT_MS = 900;
export const BOARD_IN_MS = 1300;
export const BOARD_OVERLAP_MS = 500;
export const BOARD_TRANSITION = { outMs: BOARD_OUT_MS, inMs: BOARD_IN_MS, overlapMs: BOARD_OVERLAP_MS };
export const BOARD_TRANSITION_MS = BOARD_OUT_MS - BOARD_OVERLAP_MS + BOARD_IN_MS;
// Pierwsze pojawienie się logo po intro (z pustego ekranu).
export const LOGO_IN_MS = 1800;

// Błysk X przy pudle w pojedynku (był równy długości dźwięku — po przycięciu
// ciszy w plikach trwałby 0,76 s).
export const DUEL_X_FLASH_MS = 1500;
