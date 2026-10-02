// control2/js/timerResume.js
// Wydzielone z control2/js/store.js celowo — CZYSTA funkcja bez żadnych
// importów (Supabase itd.), więc testowalna w gołym Node bez atrapy
// klienta (tests/unit/store.timerResume.test.js). store.js importuje ją
// wprost, browser-zależny kod (sb()) nigdy nie ładuje się przy imporcie
// tego pliku.
//
// Wykrywa timery zastane JUŻ wygasłe w chwili wznowienia Control (karta
// była zamknięta/przeładowana, lub urządzenia rozłączone, gdy endsAt
// minęło) — zanim cokolwiek się wyrenderuje operatorowi (plan, sekcja 4).
// Dwa timery, ale TA SAMA reakcja wywołującego (patrz control2/js/app.js's
// applyExpiredTimersOnResume): oba idą WSTECZ, do stanu sprzed ich startu,
// bez naliczania żadnej konsekwencji za czas, w którym nikt nie patrzył.
// Zgłoszone wprost: "rozłącz/zamknij Control w trakcie timerów — czy one
// wrócą do stanu przed, a nie po, bo tak powinny".
//  - rounds.timer3 (3s auto-rozstrzygnięcie X): REALNA konsekwencja
//    (nalicza pudło drużynie, ADD_X) — CANCEL_TIMER3 kasuje timer bez
//    naliczania X, inaczej niż to samo wygaśnięcie na żywo (EXPIRE_TIMER3).
//  - final.runtime.timer (15s/20s gracza): też ma realną konsekwencję —
//    usedP1/usedP2 to jednorazowa, nieodwracalna szansa, zużywana już w
//    momencie STARTU zegarka (nie dopiero przy jego wygaśnięciu) — więc
//    CANCEL_TIMER cofa też tę flagę, żeby gracz po powrocie operatora
//    dostał dokładnie taką samą, nienaruszoną szansę, jaką miał przed
//    zniknięciem Control — inaczej niż to samo wygaśnięcie NA ŻYWO
//    (EXPIRE_TIMER, operator obecny i obserwujący, patrz jego komentarz w
//    engine.js).
export function expiredTimerOnHydrate(s) {
  const t = s.final?.runtime?.timer;
  const t3 = s.rounds?.timer3;
  const final = !!(t?.running && typeof t.endsAt === "number" && t.endsAt <= Date.now());
  const timer3 = !!(t3?.running && typeof t3.endsAt === "number" && t3.endsAt <= Date.now());
  if (!final && !timer3) return null;
  return { final, timer3 };
}
