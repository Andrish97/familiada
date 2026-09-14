// shared/transitionTiming.js
//
// JEDEN silnik liczący RZECZYWISTE czasy trwania dźwięku — używany zarówno
// przez control2/js/actionGate.js (blokada przycisków operatora) JAK I
// przez display2/js/render.js (czas trwania animacji Wyświetlacza).
// Zgłoszone wprost: "Pozbądźmy się sztywnych zapisanych ram czasowych.
// Animacja... zawsze = dźwięki" — wcześniej display2/js/render.js miał
// własne, ręcznie dobrane stałe (shared/displayAnim.js's `ms`), zupełnie
// niezależne od tego, ile faktycznie trwa dźwięk temu towarzyszący; ten
// moduł jest teraz JEDYNYM miejscem, które liczy "ile ma to trwać", żeby
// dźwięk (Control lub Display, zależnie od detail.settings.soundSource —
// patrz shared/soundCueEngine.js) i animacja (zawsze na Display) zawsze
// zgadzały się co do liczby, niezależnie od tego, na którym urządzeniu
// faktycznie gra audio.
//
// Rozbicie kombinacji zsynchronizowanej na koniec (shared/soundCueEngine.js's
// playSyncedCombo: dłuższy dźwięk startuje od razu, krótszy jest opóźniony
// tak, żeby oba skończyły się razem) na dwie fazy — "przed" (tylko dłuższy
// gra) i "reveal" (od momentu, gdy "reveal" zaczyna grać, do końca obu) —
// to DOKŁADNIE wyliczony z rzeczywistych czasów podział, nie zgadywanie:
// jeśli "reveal" jest krótszy, start jest opóźniony o (inny - reveal); jeśli
// dłuższy/równy, "reveal" gra od razu (offset=0). Używane wszędzie tam, gdzie
// zgłoszone: "Animacja logo ma się zacząć wtedy, kiedy gra reveal".

const FALLBACK_S = 2; // metadane audio (jeszcze) niedostępne — bezpieczny domysł

export function createTransitionTiming({ getSfxDuration }) {
  async function dur(key) {
    if (!key) return 0;
    try {
      const d = await getSfxDuration(key);
      return d > 0 ? d * 1000 : FALLBACK_S * 1000;
    } catch {
      return FALLBACK_S * 1000;
    }
  }

  // Blokujący/łączny czas synced combo (oba dźwięki kończą się razem) —
  // control2/js/actionGate.js's gate dla START_ROUND/F7/FINISH_FINAL.
  async function syncedMs(keyA, keyB) {
    const [a, b] = await Promise.all([dur(keyA), dur(keyB)]);
    return Math.max(a, b);
  }

  // Podział synced combo na "offset" (czas ZANIM "reveal" zacznie grać —
  // faza, w której gra wyłącznie `otherKey`) i "revealMs" (czas trwania
  // samego "reveal", od jego startu do końca całej kombinacji — oba dźwięki
  // zawsze kończą się dokładnie w tym momencie, z definicji synced combo).
  // display2/js/render.js: animOut = offset, animIn ("odsłonięcie") = revealMs
  // — więc animacja odsłaniania faktycznie zaczyna się dokładnie wtedy, gdy
  // zaczyna grać "reveal", i trwa dokładnie tyle, co on.
  async function revealSyncSplit(otherKey) {
    const [other, reveal] = await Promise.all([dur(otherKey), dur("reveal")]);
    return { offsetMs: Math.max(0, other - reveal), revealMs: reveal };
  }

  return { dur, syncedMs, revealSyncSplit };
}
