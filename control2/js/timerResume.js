// control2/js/timerResume.js
// Wydzielone z control2/js/store.js celowo — CZYSTA funkcja bez żadnych
// importów (Supabase itd.), więc testowalna w gołym Node bez atrapy
// klienta (tests/unit/store.timerResume.test.js). store.js importuje ją
// wprost, browser-zależny kod (sb()) nigdy nie ładuje się przy imporcie
// tego pliku.
//
// Wykrywa timery zastane JUŻ wygasłe w chwili wznowienia Control (karta
// była zamknięta/przeładowana, gdy endsAt minęło) — zanim cokolwiek się
// wyrenderuje operatorowi (plan, sekcja 4). Dwa timery, DWIE różne reakcje
// wywołującego (patrz control2/js/app.js's applyExpiredTimersOnResume), bo
// mają różne konsekwencje:
//  - final.runtime.timer (15s/20s gracza): brak realnej konsekwencji poza
//    dźwiękiem/zatrzymaniem odliczania (operator i tak dokańcza wpisywanie
//    ręcznie) — plan, sekcja "Weryfikacja" pkt 5 wprost wymaga, żeby
//    "logika wygaśnięcia zastosowała się natychmiast" — więc idzie
//    NAPRZÓD (EXPIRE_TIMER), normalnie.
//  - rounds.timer3 (3s auto-rozstrzygnięcie X): ma REALNĄ konsekwencję
//    (nalicza pudło drużynie, ADD_X) — naliczanie go za czas, kiedy nikt
//    nie patrzył, byłoby niesprawiedliwe. Zgłoszone wprost: "chodzi o to,
//    żeby wrócić o krok, a nie pójść dalej w takich sytuacjach" — więc
//    idzie WSTECZ (CANCEL_TIMER3, kasuje timer bez naliczania X), inaczej
//    niż to samo wygaśnięcie na żywo (EXPIRE_TIMER3).
export function expiredTimerOnHydrate(s) {
  const t = s.final?.runtime?.timer;
  const t3 = s.rounds?.timer3;
  const final = !!(t?.running && typeof t.endsAt === "number" && t.endsAt <= Date.now());
  const timer3 = !!(t3?.running && typeof t3.endsAt === "number" && t3.endsAt <= Date.now());
  if (!final && !timer3) return null;
  return { final, timer3 };
}
