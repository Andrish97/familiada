// shared/previewRow.js
//
// Wspólny budowniczy przykładowego wiersza game_state do podglądu
// Wyświetlacza (kolory/motyw/nazwy drużyn) przed startem gry — display2 umie
// renderować WYŁĄCZNIE prawdziwy wiersz game_state (patrz display2/js/main.js's
// bootPreview(), tryb ?preview=1: żadnej autoryzacji/subskrypcji, tylko
// postMessage {type:"familiada:preview-row", row} z gotowym, spreparowanym
// wierszem), więc każde miejsce chcące pokazać ten podgląd musi dostarczyć
// wiersz w tym samym kształcie.
//
// UŻYWANE W DWÓCH MIEJSCACH — jedna funkcja zamiast dwóch niezależnych
// implementacji, żeby się nie rozjechały:
//   - control2/js/ui.js's renderSetupFinish (D3, podsumowanie przed startem)
//   - js/pages/game-settings.js (modal ustawień gry, otwierany z Control ORAZ
//     samodzielnie spod /game-settings)
//
// Treść (pytanie/odpowiedzi/wynik) jest zmyślona — to nie ma pokazywać
// prawdziwej gry, tylko jak kolory/motyw/nazwy drużyn wyglądają na
// faktycznej planszy LED-matrix, zamiast gołych próbek koloru w formularzu.
export function buildDisplayPreviewRow({ teams, display } = {}) {
  return {
    top_card: "rounds", step: "r_play", phase: "PLAY", control_team: "A",
    sound_cue_key: null, sound_cue_seq: 0,
    detail: {
      teams: { teamA: teams?.teamA || "Drużyna A", teamB: teams?.teamB || "Drużyna B" },
      rounds: {
        roundNo: 1, bankPts: 70, xA: 1, xB: 0, totals: { A: 120, B: 80 },
        question: { text: "PRZYKŁADOWE PYTANIE" },
        answers: [
          { ord: 1, text: "Pierwsza odpowiedź", fixed_points: 40 },
          { ord: 2, text: "Druga odpowiedź", fixed_points: 30 },
          { ord: 3, text: "Trzecia odpowiedź", fixed_points: 20 },
          { ord: 4, text: "Czwarta odpowiedź", fixed_points: 10 },
          { ord: 5, text: "Piąta odpowiedź", fixed_points: 6 },
          { ord: 6, text: "Szósta odpowiedź", fixed_points: 4 },
        ],
        revealed: [1, 2], steal: {}, duel: {},
      },
      final: { runtime: {} },
      display: { mode: "GAME", colors: display?.colors, theme: display?.theme, logoId: display?.logoId, qr: { host: { show: false }, buzzer: { show: false } } },
      host: { covered: false },
      locks: { gameEnded: false },
    },
  };
}
