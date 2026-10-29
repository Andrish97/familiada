// Jedna, wspólna wersja logiki "jaki ekran końcowy pokazać", zamiast
// dzisiejszej duplikacji (control/js/gameRounds.js:187-197 i
// control/js/gameFinal.js:105-112, dwie osobne, prawie identyczne funkcje
// getEndScreenMode() — patrz plan przebudowy, sekcja 2a/B, uwaga o
// duplikacji). Używane zarówno przez r_gameEnd, jak i f_end.
//
// Zero importów przeglądarkowych — testowalne w gołym Node.

/**
 * @param {object} settings detail.settings z game_state (endScreenMode itd.)
 * @returns {"logo"|"points"|"money"}
 */
export function resolveEndScreenMode(settings) {
  const mode = settings?.endScreenMode;
  if (mode === "logo" || mode === "points" || mode === "money") return mode;
  // stary klucz kompatybilności (winEnabled); bez żadnego ustawienia —
  // kwota (domyślne od 2026-10-21, decyzja użytkownika)
  if (settings?.winEnabled === true) return "points";
  if (settings?.winEnabled === false) return "logo";
  return "money";
}

/**
 * Ekran końca ROZGRYWKI BEZ FINAŁU (r_gameEnd). Tu "money" jest świadomie
 * traktowane identycznie jak "points" — bez finału nie ma z czego policzyć
 * realnej kwoty nagrody (patrz plan, ekstrakcja gameRounds.js:1511-1588).
 *
 * @returns {{kind: "logo"}|{kind: "win", amount: number}}
 */
export function resolveRoundsEndScreen(settings, { isDraw, totals }) {
  if (isDraw) return { kind: "logo" };
  const mode = resolveEndScreenMode(settings);
  if (mode === "logo") return { kind: "logo" };
  const maxTotal = Math.max(totals?.A || 0, totals?.B || 0);
  return { kind: "win", amount: maxTotal };
}

/**
 * Ekran końca FINAŁU (f_end). "points" pokazuje punkty zwycięskiej drużyny
 * z rund i finału. "money" liczy kwotę jak regulamin teleturnieju
 * (Dział V pkt 21–22, decyzja użytkownika 2026-10-21): pieniądze z gry to
 * punkty zwycięskiej drużyny z rund razy mnożnik; przy osiągniętym celu
 * finału dochodzi kwota główna. Punkty z finału służą tylko do sprawdzenia celu.
 *
 * @returns {{kind: "logo"}|{kind: "win", amount: number}}
 */
export function resolveFinalEndScreen(settings, { roundsPoints, finalPoints, hitTarget }) {
  const mode = resolveEndScreenMode(settings);
  if (mode === "logo") return { kind: "logo" };
  const rounds = Number(roundsPoints) || 0;
  if (mode === "points") return { kind: "win", amount: rounds + (Number(finalPoints) || 0) };

  // "money"
  const multiplier = Number(settings?.finalPrizeMultiplier ?? 3);
  const mainPrize = Number(settings?.mainPrizeAmount ?? 25000);
  return { kind: "win", amount: rounds * multiplier + (hitTarget ? mainPrize : 0) };
}
