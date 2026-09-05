// Control v2 — jedyne źródło prawdy o krokach gry (public.game_state.step)
// i dozwolonych przejściach między nimi.
//
// To jest ta sama mapa, co tabele A/B/2a w planie przebudowy Control —
// docs/game-state-machine.md jest z tego pliku GENEROWANY
// (scripts/gen-game-state-docs.mjs), nie pisany osobno, więc dokument nie
// może się rozjechać z kodem (pilnuje tego test jednostkowy).
//
// Zero importów przeglądarkowych (document/window/klient Supabase) — moduł
// ma być importowalny wprost w gołym Node (testy jednostkowe) i we
// wszystkich czterech aplikacjach urządzeń.

export const TOP_CARDS = ["devices", "setup", "rounds", "final"];
export const ROUND_PHASES = ["IDLE", "READY", "DUEL", "PLAY", "STEAL", "REVEAL"];
export const TEAMS = ["A", "B"];

// Każdy wpis: card, opcjonalnie phases (dozwolone fazy rund w tym kroku),
// entryTrigger (co powoduje wejście), dataShape (skrót kluczy w detail
// istotnych na tym kroku), gatedBy (ustawienia bramkujące/pomijające ten
// krok), display/host/buzzer (co pokazują — patrz plan sekcja 2a po pełne
// uzasadnienie każdej reguły), soundCues (nazwy z audio/sounds.json),
// next (dozwolone kolejne kroki — źródło TRANSITIONS niżej).
export const STEPS = {
  devices_display: {
    card: "devices",
    entryTrigger: "start gry / pierwsze wejście w Control",
    dataShape: "detail.display.mode='BLACK' (wartość domyślna)",
    gatedBy: [],
    display: "Czarny ekran — wynika z odczytu domyślnego wiersza, nie ze specjalnej komendy startowej.",
    host: "Nieaktywny/nieotwarty.",
    buzzer: "Nieaktywny/nieotwarty.",
    soundCues: [],
    next: ["devices_hostbuzzer"],
  },
  devices_hostbuzzer: {
    card: "devices",
    entryTrigger: "operator potwierdza połączenie Display",
    dataShape: "detail.display.mode ('BLACK'|'QR'), detail.display.qr.{host,buzzer}.show (niezależne, jeden LUB oba naraz)",
    gatedBy: [],
    display: "BLACK domyślnie; QR z qr.host.show/qr.buzzer.show gdy operator kliknie 'QR na wyświetlaczu' dla Hosta/Buzzera (niezależnie).",
    host: "Czeka na połączenie (lub pominięty przez flags.noHostTablet).",
    buzzer: "Czeka na połączenie (lub pominięty przez flags.physicalBuzzer).",
    soundCues: [],
    next: ["setup_finish"],
  },
  setup_finish: {
    card: "setup",
    entryTrigger: "oba urządzenia połączone (lub odhaczone jako nie dotyczy)",
    dataShape: "detail.settings.* (denormalizowane z games.settings), detail.rounds._questionPool / detail.final.picked (losowane raz, jeśli tryb random)",
    gatedBy: ["hasFinal", "roundsQuestionsMode", "finalQuestionsMode"],
    display: "BLACK — zostaje czarny przez cały etap ustawień; podgląd kolorów/motywu/logo renderuje się lokalnie w Control (miniaturka), nie na prawdziwym Display.",
    host: "Nieaktywny.",
    buzzer: "Nieaktywny.",
    soundCues: [],
    next: ["r_intro"],
  },

  r_intro: {
    card: "rounds",
    entryTrigger: "operator klika 'Rozpocznij' po zakończeniu ustawień",
    dataShape: "locks.gameStarted=true",
    gatedBy: [],
    display: "Logo/plansza powitalna.",
    host: "Puste.",
    buzzer: "Wyłączony.",
    soundCues: ["show_intro"],
    next: ["r_roundStart"],
  },
  r_roundStart: {
    card: "rounds",
    phases: ["READY"],
    entryTrigger: "koniec poprzedniej rundy (bez wejścia w finał/koniec gry) lub po r_intro",
    dataShape: "roundNo",
    gatedBy: [],
    display: "Logo widoczne, plansza rundy jeszcze ukryta.",
    host: "Puste, czeka.",
    buzzer: "Wyłączony.",
    soundCues: [],
    next: ["r_duel"],
  },
  r_duel: {
    card: "rounds",
    phases: ["DUEL"],
    entryTrigger: "operator klika 'Start rundy' (startRound())",
    dataShape: "question, answers, duel={enabled,lastPressed,firstTeam,secondTeam,currentTeam}",
    gatedBy: ["roundsQuestionsMode", "physicalBuzzer"],
    display: "Plansza rundy wjeżdża (odpowiedzi zakryte), logo znika, INDICATOR OFF.",
    host: "Pytanie widoczne (SET1), odpowiedzi zakryte (SET2 puste).",
    buzzer: "Włączony (ON) w trybie normalnym; nieużywany w trybie physicalBuzzer. Wciśnięcie zapisuje duel.lastPressed bezpośrednio (game_state_buzzer_press).",
    soundCues: ["round_transition", "reveal"],
    next: ["r_play"],
  },
  r_play: {
    card: "rounds",
    phases: ["DUEL", "PLAY", "STEAL", "REVEAL"],
    entryTrigger: "przyjęcie bzyczenia (phase pozostaje DUEL do rozstrzygnięcia pojedynku), potem naturalne przejścia PLAY→STEAL→REVEAL wewnątrz tego samego kroku",
    dataShape: "controlTeam, bankPts, xA, xB, revealed[], steal={active,used,team,won}, allowPass, passUsed",
    gatedBy: [],
    display: "INDICATOR ON_A/ON_B (kto ma kontrolę — zmienia się przy CONTINUE_SECOND/RESET/STEAL); odsłonięte odpowiedzi z punktami; lampki X (sloty 1-3 licznik, slot 4 osobny 'duży X'/flash); TOP=bank; LEFT/RIGHT=wyniki drużyn.",
    host: "SET1=tytuł zależny od fazy + pytanie, SET2=lista odpowiedzi z zielonym podświetleniem odkrytych. Host NIGDY nie pokazuje banku, X ani wskaźnika kontroli.",
    buzzer: "Wyłączony przez cały ten krok.",
    soundCues: ["buzzer_press", "answer_correct", "answer_wrong", "reveal", "round_transition"],
    next: ["r_duel", "r_play", "r_roundStart", "f_start", "r_gameEnd"],
  },
  r_gameEnd: {
    card: "rounds",
    entryTrigger: "koniec ostatniej rundy bez finału (próg osiągnięty ale hasFinal!==true, lub pula pytań wyczerpana)",
    dataShape: "totals",
    gatedBy: ["endScreenMode"],
    display: "RBATCH ANIMOUT, potem LOGO SHOW (zawsze przy remisie) lub WIN <najwyższy wynik> ('points' i 'money' identyczne w tej ścieżce — brak finału, brak realnej kwoty do policzenia).",
    host: "Wyczyszczony.",
    buzzer: "Wyłączony.",
    soundCues: ["show_intro"],
    next: [],
  },

  f_start: {
    card: "final",
    entryTrigger: "próg punktowy osiągnięty i hasFinal===true i finał poprawnie skonfigurowany",
    dataShape: "winnerTeam, final.picked (5 pytań)",
    gatedBy: ["hasFinal", "finalMinPoints", "finalQuestionsMode"],
    display: "Plansza finału z placeholderami od razu widoczna (nie czeka na pierwsze odsłonięcie).",
    host: "COVER + puste pole 2.",
    buzzer: "Wyłączony na cały finał (jedyna komenda do Buzzera w finale).",
    soundCues: ["final_theme", "reveal"],
    next: ["f_p1_entry"],
  },
  f_p1_entry: {
    card: "final",
    entryTrigger: "start finału",
    dataShape: "runtime.timer={running,phase:'P1',endsAt}, runtime.p1[i].text",
    gatedBy: [],
    display: "LEFT/RIGHT po stronie zwycięzcy pokazują odliczanie (15s) — polimorficzne pole, poza finałem to wyniki drużyn.",
    host: "Tytuł rundy 1 (z odliczaniem gdy timer aktywny) + status 5 pytań.",
    buzzer: "Wyłączony.",
    soundCues: ["time_over"],
    next: ["f_p1_map_q1"],
  },
  f_p1_map_q1: finalMapStep(1, "f_p1_map_q2"),
  f_p1_map_q2: finalMapStep(2, "f_p1_map_q3"),
  f_p1_map_q3: finalMapStep(3, "f_p1_map_q4"),
  f_p1_map_q4: finalMapStep(4, "f_p1_map_q5"),
  f_p1_map_q5: finalMapStep(5, "f_p2_start"),

  f_p2_start: {
    card: "final",
    entryTrigger: "po f_p1_map_q5 (bez wcześniejszego wyjścia na f_end)",
    dataShape: "—",
    gatedBy: [],
    display: "FHALF A — cała lewa połowa (odpowiedzi gracza 1) zamaskowana placeholderami.",
    host: "CLEAR (obie strony czyszczone).",
    buzzer: "Wyłączony.",
    soundCues: ["round_transition", "reveal"],
    next: ["f_p2_entry"],
  },
  f_p2_entry: {
    card: "final",
    entryTrigger: "operator klika 'Start rundy 2'",
    dataShape: "runtime.timer={running,phase:'P2',endsAt}, runtime.p2[i].{text,repeat}",
    gatedBy: [],
    display: "LEFT/RIGHT po stronie zwycięzcy pokazują odliczanie (20s). Przy starcie timera: FHALF A z pełną, jednorazową odsłoną wszystkich 5 odpowiedzi gracza 1 (nie stopniowo).",
    host: "Tytuł rundy 2 + status 5 pytań. Odsłania się RAZEM z Display (naprawiona luka — dziś UNCOVER nigdy nie jest wysyłane, patrz plan sekcja 2a).",
    buzzer: "Wyłączony.",
    soundCues: ["time_over", "answer_repeat"],
    next: ["f_p2_map_q1"],
  },
  f_p2_map_q1: finalMapStep(1, "f_p2_map_q2", 2),
  f_p2_map_q2: finalMapStep(2, "f_p2_map_q3", 2),
  f_p2_map_q3: finalMapStep(3, "f_p2_map_q4", 2),
  f_p2_map_q4: finalMapStep(4, "f_p2_map_q5", 2),
  f_p2_map_q5: finalMapStep(5, "f_end", 2),

  f_end: {
    card: "final",
    entryTrigger: "wczesne wyjście (suma osiągnęła finalTarget) z dowolnego kroku mapowania, lub koniec f_p2_map_q5",
    dataShape: "runtime.sum, winAmount",
    gatedBy: ["endScreenMode", "finalPrizeMultiplier", "mainPrizeAmount", "finalTarget"],
    display: "INDICATOR OFF (gaśnie po raz pierwszy od f_start), TOP 000, LEFT/RIGHT=wynik z doliczoną sumą finału, FBATCH ANIMOUT, potem LOGO SHOW / WIN <suma> ('points') / WIN <realna kwota z mnożnikiem+premią> ('money' — różni się realnie od 'points', w przeciwieństwie do r_gameEnd).",
    host: "Wyczyszczony.",
    buzzer: "Wyłączony.",
    soundCues: [],
    next: [],
  },
};

function finalMapStep(qIndex, nextStep, round = 1) {
  const roundLabel = round === 1 ? "gracza 1" : "gracza 2";
  const revealCmd = round === 1 ? "FL" : "FR";
  const ptsCmd = round === 1 ? "FA" : "FB";
  const sumSide = round === 1 ? "A" : "B";
  return {
    card: "final",
    entryTrigger: `poprzedni krok mapowania rundy ${round}, pytanie ${qIndex}/5`,
    dataShape: `runtime.map${round}[${qIndex - 1}]={mode,kind,matchId,outText,pts,revealedAnswer,revealedPoints}`,
    gatedBy: ["finalTarget"],
    display: `${revealCmd} — najpierw tekst odpowiedzi, dopiero potem ${ptsCmd} punkty + FSUMA ${sumSide} (bez zer wiodących). AUTO i MANUAL wysyłają identyczne komendy. MISS i SKIP nieodróżnialne (oba '————', 0 pkt).`,
    host: `SET1/SET2 dla pytania ${qIndex}, tytuł ${roundLabel}. 'Powtórzenie' (tylko runda 2) widoczne wyłącznie na Hoście (żółte podkreślenie) — na Display nieodróżnialne od SKIP.`,
    buzzer: "Wyłączony.",
    soundCues: ["reveal", "answer_correct", "answer_wrong"],
    next: [nextStep, "f_end"],
  };
}

export const TRANSITIONS = Object.fromEntries(
  Object.entries(STEPS).map(([step, def]) => [step, def.next || []])
);

export function isValidStep(step) {
  return Object.prototype.hasOwnProperty.call(STEPS, step);
}

// fromStep === null/undefined oznacza "pierwsze renderowanie po (re)connect,
// brak poprzedniego stanu do porównania" — zawsze dozwolone, patrz plan
// sekcja 3 (animacje/przejścia).
export function assertTransition(fromStep, toStep) {
  if (fromStep == null) {
    if (!isValidStep(toStep)) {
      throw new Error(`Nieznany krok: ${toStep}`);
    }
    return;
  }
  if (!isValidStep(fromStep)) {
    throw new Error(`Nieznany krok źródłowy: ${fromStep}`);
  }
  if (!isValidStep(toStep)) {
    throw new Error(`Nieznany krok docelowy: ${toStep}`);
  }
  const allowed = TRANSITIONS[fromStep] || [];
  if (fromStep !== toStep && !allowed.includes(toStep)) {
    throw new Error(`Niedozwolone przejście: ${fromStep} -> ${toStep}`);
  }
}
