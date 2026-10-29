// Presence is independent of game state; reconnect resumes the same game.

// Urządzenia oczekiwane w trakcie gry (nieobecne = ostrzeżenie w Control).
export function missingDevices(state, flags) {
  if (!state.locks?.gameStarted || state.locks?.gameEnded) return [];
  return [
    ["display", true],
    ["host", !state.settings?.noHostTablet],
    ["buzzer", !state.settings?.physicalBuzzer],
  ].filter(([kind, required]) => required && !flags[kind]).map(([kind]) => kind);
}

// Urządzenia, bez których gra naprawdę stoi (decyzja użytkownika 2026-10-29,
// eksport: telefon z Przyciskiem/Prowadzącym chowający stronę wstrzymywał
// całą grę — np. 521 s w 10-minutowej grze 28.10). Wyświetlacz zawsze;
// Przycisk tylko w pojedynku bez fizycznego przycisku (wtedy drużynę wskazuje
// wyłącznie naciśnięcie); Prowadzący nigdy — to podgląd dla prowadzącego.
export function blockingDevices(state, flags) {
  return missingDevices(state, flags).filter((kind) =>
    kind === "display" || (kind === "buzzer" && state.step === "r_duel"));
}

// Przyczyna braku: strona urządzenia zgłosiła przejście w tło przed zniknięciem
// (zablokowany ekran, inna aplikacja) albo zniknęła bez tego (sieć, zamknięcie).
export function absenceCause(diagnostics) {
  return diagnostics?.visibility === "hidden" ? "asleep" : "offline";
}
