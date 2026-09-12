// Domyślny kształt stanu gry Control v2 — czysta funkcja/dane, zero
// importów przeglądarkowych. Wydzielone z control2/js/store.js specjalnie
// po to, żeby dało się jej użyć bez dotykania js/core/supabase.js (które
// dotyka `window` już na etapie importu) — używane zarówno przez
// control2/js/store.js (prawdziwy store w przeglądarce), jak i przez atrapy
// store w testach jednostkowych oraz, w razie potrzeby, przez display2/
// host2/buzzer2 do namalowania czegoś rozsądnego zanim przyjdzie pierwszy
// prawdziwy odczyt game_state.

export const DEFAULT_SETTINGS = {
  hasFinal: null,
  // Język Display/Host/Buzzer — control2/js/app.js's LANG-push zapisuje tu
  // język operatora zamiast wysyłać osobną komendę (control/js/app.js).
  uiLang: null,
  roundsQuestionsMode: "random",
  finalQuestionsMode: "random",
  roundsPicked: [],
  physicalBuzzer: false,
  noHostTablet: false,
  roundMultipliers: [1, 1, 1, 2, 3],
  finalMinPoints: 300,
  finalTarget: 200,
  endScreenMode: "logo",
  finalPrizeMultiplier: 3,
  mainPrizeAmount: 25000,
  // Dźwięk (zgłoszone: przełącznik źródła w kroku Urządzeń) — "control"
  // (domyślnie, jak dotąd) albo "display": dokładnie JEDNO z dwóch urządzeń
  // faktycznie odtwarza, gated w control2/js/soundReactor.js i display2/js/
  // soundReactor.js osobno, oba przez ten sam shared/soundCueEngine.js.
  // soundMuted było wcześniej WYŁĄCZNIE lokalne dla Control (localStorage,
  // patrz control2/js/soundReactor.js) — teraz musi być tutaj, bo mute ma
  // działać niezależnie od tego, które urządzenie faktycznie gra.
  soundSource: "control",
  soundMuted: false,
  // Głośności/warianty z games.settings.sound, zdenormalizowane tu RAZ przy
  // starcie (control2/js/app.js's applyGameSettingsToState), dokładnie jak
  // reszta ustawień gry — Display2 (anon, bez dostępu do games.settings
  // wprost) czyta je stąd, nie osobnym zapytaniem. Pliki własne (wariant
  // "__custom__") NIE są tu wspierane — wymagałyby osobnego RPC do
  // podpisanych URL-i Storage dla anon; z braku takiego Display2 po prostu
  // zostaje przy domyślnym, dołączonym wariancie dla tych kluczy.
  sound: { volumes: {}, variants: {} },
};

export function makeDefaultState(gameId) {
  return {
    gameId,
    rev: 0,
    topCard: "devices",
    step: "devices_display",
    phase: null,
    controlTeam: null,
    soundCueKey: null,
    soundCueSeq: 0,

    // --- persystowane w game_state.detail (patrz control2/js/store.js) ---
    locks: { gameStarted: false, finalActive: false, gameEnded: false },
    teams: { teamA: "", teamB: "" },
    settings: { ...DEFAULT_SETTINGS },
    rounds: {
      roundNo: 1,
      bankPts: 0,
      xA: 0,
      xB: 0,
      totals: { A: 0, B: 0 },
      passUsed: false,
      allowPass: false,
      canEndRound: false,
      lockPlayControls: false,
      question: null,
      answers: [],
      revealed: [],
      // missSeq/lastMissTeam: krótki błysk X (slot 4) na Display przy KAŻDYM
      // pudle w pojedynku (control/js/display.js's roundsFlashDuelX) — osobne
      // od xA/xB (liczniki rundy), bo pudło w DUEL ich nie rusza wcale.
      duel: { enabled: false, lastPressed: null, firstTeam: null, secondTeam: null, currentTeam: null, missSeq: 0, lastMissTeam: null },
      timer3: { running: false, endsAt: 0, resolved: null },
      steal: { active: false, used: false, team: null, won: null },
      stealWon: false,
      _questionPool: [],
      _usedQuestionIds: [],
    },
    final: {
      picked: [],
      // Podgląd wylosowanej puli (id+tekst) do pokazania w Podsumowaniu D3 —
      // "picked" samo w sobie to tylko surowe ID, za mało żeby operator
      // zobaczył CO wylosowano bez czekania do finału (engine.js's
      // START_FINAL dopiero wtedy wypełnia pełne `questions`).
      pickedPreview: [],
      confirmed: false,
      winnerTeam: null,
      // Pełne dane 5 wybranych pytań (tekst + lista odpowiedzi z punktami),
      // wypełniane przez engine.js's START_FINAL — potrzebne Hostowi (i
      // samemu Control) do pokazania treści pytania i listy możliwych
      // odpowiedzi, nie tylko surowych ID z `picked`.
      questions: [],
      runtime: {
        sum: 0,
        timer: { running: false, phase: null, endsAt: 0 },
        map1: [null, null, null, null, null],
        map2: [null, null, null, null, null],
        p1: [null, null, null, null, null],
        p2: [null, null, null, null, null],
        reached200: false,
      },
    },
    display: {
      mode: "BLACK",
      // QR na wyświetlaczu (D1) — host i buzzer NIEZALEŻNE, mogą być
      // pokazane pojedynczo albo oba naraz (dokładnie jak dzisiejsze
      // qrHostOnDisplay/qrBuzzerOnDisplay + "SINGLE" w control/js/devices.js).
      // URL/kod nie są computed przez Display (nie zna share_key_host/
      // buzzer), tylko zapisywane tu przez Control, który jedyny zna klucze.
      qr: {
        host: { show: false, url: null, code: null },
        buzzer: { show: false, url: null, code: null },
      },
      colors: { A: "#c4002f", B: "#2a62ff", BACKGROUND: "#d21180", DOT: "#d7ff3d" },
      theme: null,
      logoId: null,
    },
    // Domyślnie zasłonięte, nie odsłonięte — ustalona zasada dla całego
    // Control, nie tylko finału: Prowadzący widzi treść odpowiedzi (w
    // Rundach: pełną listę i punkty od początku rundy — patrz
    // control2/js/host2/render.js's renderRounds()), a jej fizyczne
    // ujawnienie kontestantowi zależy od tego, czy ekran jest w danym
    // momencie odwrócony/z dala od wzroku widza — coś, co ocenia sam
    // operator na miejscu, nie silnik gry. Zasłona jest jednokierunkowa
    // (silnik ją tylko włącza, nigdy nie wyłącza) — odsłonięcie to
    // wyłącznie lokalny, nieprzechowywany w game_state gest "peek" na
    // urządzeniu Hosta, gdy operator sam się upewni, że jest bezpiecznie.
    host: { covered: true },
  };
}

export const PERSISTED_KEYS = ["locks", "teams", "settings", "rounds", "final", "display", "host"];
