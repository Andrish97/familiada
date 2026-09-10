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
// UŻYWANE W KILKU MIEJSCACH — jedna funkcja zamiast osobnych niezależnych
// implementacji, żeby się nie rozjechały:
//   - control2/js/ui.js's renderSetupFinish (D3, podsumowanie przed startem)
//   - js/pages/game-settings2.js (modal ustawień gry w Control v2)
//   - js/pages/game-settings.js (oryginał — modal w starym control.html ORAZ
//     samodzielnie spod /game-settings)
//
// Treść (pytanie/odpowiedzi/wynik) jest zmyślona — to nie ma pokazywać
// prawdziwej gry, tylko jak kolory/motyw/nazwy drużyn wyglądają na
// faktycznej planszy LED-matrix, zamiast gołych próbek koloru w formularzu.
//
// `focus` wybiera, KTÓRY realny moment gry ten podgląd udaje — "big" (logo
// vs plansza rund) to jedno, współdzielone płótno na prawdziwym
// Wyświetlaczu, więc te dwa stany są fizycznie wzajemnie wykluczające się
// i nie da się ich pokazać naraz w jednym wierszu:
//   - "rounds" (domyślne) — plansza rund w trakcie gry (r_play), pokazuje
//     kolory/motyw "w akcji" na kaflach/X-ach odpowiedzi.
//   - "logo" — ekran startowy gry (r_intro), pokazuje FAKTYCZNIE
//     skonfigurowane logo (logoId) na "big". Nazwy drużyn nadal malowane na
//     "small" niezależnie od tego, co jest na "big" (display2/js/render.js's
//     paintForStep, oba płótna niezależne) — więc podgląd nazw drużyn
//     działa w obu trybach.
export function buildDisplayPreviewRow({ teams, display, focus = "rounds" } = {}) {
  const base = {
    control_team: "A", sound_cue_key: null, sound_cue_seq: 0,
    detail: {
      teams: { teamA: teams?.teamA || "Drużyna A", teamB: teams?.teamB || "Drużyna B" },
      final: { runtime: {} },
      display: { mode: "GAME", colors: display?.colors, theme: display?.theme, logoId: display?.logoId, qr: { host: { show: false }, buzzer: { show: false } } },
      host: { covered: false },
      locks: { gameEnded: false },
    },
  };

  if (focus === "logo") {
    return {
      ...base,
      top_card: "rounds", step: "r_intro", phase: null,
      detail: { ...base.detail, rounds: { roundNo: 1, bankPts: 0, xA: 0, xB: 0, totals: { A: 0, B: 0 } } },
    };
  }

  return {
    ...base,
    top_card: "rounds", step: "r_play", phase: "PLAY",
    detail: {
      ...base.detail,
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
    },
  };
}
