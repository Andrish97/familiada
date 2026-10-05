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
  // stary klucz kompatybilności (winEnabled) — jak w dzisiejszym kodzie
  return settings?.winEnabled === true ? "points" : "logo";
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
 * Ekran końca FINAŁU (f_end). Tu "money" faktycznie liczy inną kwotę niż
 * "points" (mnożnik + premia za trafienie celu) — w odróżnieniu od
 * rund-bez-finału powyżej (patrz plan, ekstrakcja gameFinal.js:1758-1856).
 *
 * @returns {{kind: "logo"}|{kind: "win", amount: number}}
 */
export function resolveFinalEndScreen(settings, { totalPointsAll, hitTarget }) {
  const mode = resolveEndScreenMode(settings);
  if (mode === "logo") return { kind: "logo" };
  if (mode === "points") return { kind: "win", amount: totalPointsAll };

  // "money"
  const multiplier = Number(settings?.finalPrizeMultiplier ?? 3);
  const mainPrize = Number(settings?.mainPrizeAmount ?? 25000);
  let amount = totalPointsAll * multiplier;
  if (hitTarget) amount += mainPrize;
  return { kind: "win", amount };
}
