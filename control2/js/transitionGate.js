// control2/js/transitionGate.js
//
// Czas blokady operatora dla PIĘCIU dużych przejść planszy (Rozpocznij
// rundę/Zakończ rundę/Rozpocznij finał/Zakończ grę×2) — analogicznie do
// armRevealCooldown() dla pojedynczych kafli odsłaniania w ui.js, ale
// skalibrowane 1:1 z realnym, zweryfikowanym w kodzie zachowaniem starego
// Control (control/js/gameRounds.js/gameFinal.js), NIE zgadywane: stary
// kod dosłownie `await`-ował te same wartości przed odblokowaniem kolejnej
// interakcji (enableBuzzerDuel(), setStep(), showEndScreen() itd.) —
// poniższe funkcje liczą te same wartości z tych samych wywołań
// getSfxDuration(), tylko po stronie v2 (gdzie nie ma już "await w środku
// jednej funkcji rundy", tylko osobny, zaczytywalny lock w UI).
//
// Animacja NIE jest tu liczona osobno — w każdym z tych pięciu miejsc stary
// kod odpalał wizualną sekwencję z FIXED offsetem w sekundy w głąb
// odtwarzanego dźwięku (920ms/1000ms), a sam dźwięk był tak dobrany, żeby
// zdążyć zanim wizualna sekwencja się skończy — to właśnie ten dźwięk (nie
// zgadywana stała animacji) jest tu jedynym źródłem czasu blokady, dokładnie
// jak w oryginale.
import { getSfxDuration } from "../../js/core/sfx.js?v=v2026-09-11T07351";

async function dur(key) {
  try { return (await getSfxDuration(key)) || 0; } catch { return 0; }
}

// control/js/gameRounds.js's startRound(): "round_transition"+"reveal"
// zsynchronizowane na koniec, totalMs = Math.max(rtDur, revealDur, 2)*1000
// — operator dostaje ekran "Zatwierdź drużynę" (renderDuelAccept) dopiero
// po tym czasie (stary kod: enableBuzzerDuel() wołane dopiero po `await`).
export async function startRoundGateMs() {
  const [rt, rv] = await Promise.all([dur("round_transition"), dur("reveal")]);
  return Math.max(rt, rv, 2) * 1000;
}

// control/js/gameRounds.js's goEndRound(): odtwarza "reveal", czeka na jego
// PEŁNY czas (elapsed-time-accounted), DOPIERO POTEM gra "round_transition"
// (sekwencyjnie, bez dalszego czekania) i przechodzi dalej — gate to sam
// czas "reveal".
export async function endRoundGateMs() {
  return (await dur("reveal")) * 1000;
}

// control/js/gameFinal.js's startFinal(): totalMs = dur("final_theme")*1000,
// z fallbackiem 4000ms gdy metadane audio niedostępne (1:1 z oryginałem) —
// operator dostaje ekran wpisywania (f_p1_entry) dopiero po tym czasie.
export async function startFinalGateMs() {
  const d = await dur("final_theme");
  return d > 0 ? d * 1000 : 4000;
}

// control/js/gameRounds.js's gameEndShow(): gra "show_intro", czeka na jego
// pełny czas przed sessionEnd() — sam ekran końcowy (logo/WIN) jest już
// namalowany WCZEŚNIEJ (showEndScreen() leci przed dźwiękiem), więc gate tu
// dotyczy tylko "co dalej" (np. "Zacznij od nowa"), nie samego malowania.
export async function gameEndGateMs() {
  return (await dur("show_intro")) * 1000;
}

// control/js/gameFinal.js's finishFinal(): "round_transition"+"reveal"
// zsynchronizowane (jak w startRoundGateMs), a DOPIERO PO TYM CAŁYM czasie
// "show_intro" sekwencyjnie (sessionEnd() czeka na obie części pod rząd).
export async function finishFinalGateMs() {
  const [rt, rv, si] = await Promise.all([dur("round_transition"), dur("reveal"), dur("show_intro")]);
  return Math.max(rt, rv, 2) * 1000 + si * 1000;
}
