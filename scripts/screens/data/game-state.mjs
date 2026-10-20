// Wiersze game_state dla kadrów rozgrywki, budowane z makeDefaultState()
// aplikacji -- ten sam kształt, który Control zapisuje (store.js), a urządzenia
// czytają (game_state_get) albo dostają w podglądzie (?preview=1, postMessage).
//   round   -- runda „Rodzinnego pojedynku”: Control, Prowadzący, Wyświetlacz
//   finale  -- finał w trakcie wpisywania odpowiedzi (Control)
//   finale2 -- finał, wpisuje gracz 2 (odpowiedzi gracza 1 nad polami)
//   main    -- Główny Wyświetlacz / obraz OG: FAMILIADA · ONLINE, 999, 111:111
import { createRequire } from "node:module";
import { makeDefaultState, PERSISTED_KEYS } from "../../../web/shared/js/gameplay/gameStateShape.js";

const require = createRequire(import.meta.url);
const panel = require("./panel.cjs");
const { IDS } = require("./demo.cjs");

function toRow(state) {
  const detail = Object.fromEntries(PERSISTED_KEYS.map((key) => [key, state[key]]));
  return { rev: 1, top_card: state.topCard, step: state.step, phase: state.phase, control_team: state.controlTeam, sound_cue_key: null, sound_cue_seq: 0, detail };
}

export function buildGameState(lang, kind) {
  const p = panel[lang];
  const state = makeDefaultState(IDS.game);
  const [question, answers] = p.gameQuestions[0];
  state.teams = { teamA: p.teams[0], teamB: p.teams[1] };
  state.settings.uiLang = lang;
  state.settings.hasFinal = true;
  state.locks = { gameStarted: true, finalActive: kind.startsWith("finale"), gameEnded: false };
  state.display.mode = "GAME";
  state.display.logoId = IDS.logoClassic;
  state.host.covered = false;
  state.rounds.answers = answers.map(([text, fixed_points], i) => ({ id: `a${i + 1}`, ord: i + 1, text, fixed_points }));
  state.rounds.question = { id: "q1", text: question };

  if (kind === "round") {
    // Jak na starym zrzucie: runda 1, odsłonięte wiersze 1, 3 i 5 (suma 62),
    // kontrola Zajączków po dwóch pomyłkach, wyniki 000:000.
    state.step = "r_play"; state.topCard = "rounds"; state.phase = "PLAY"; state.controlTeam = "B";
    state.rounds.roundNo = 1;
    state.rounds.revealed = [1, 3, 5];
    state.rounds.bankPts = answers[0][1] + answers[2][1] + answers[4][1];
    state.rounds.totals = { A: 0, B: 0 };
    state.rounds.xA = 0; state.rounds.xB = 2;
    // Kartka Prowadzącego zasłonięta -- na zasłonie widać logo gry.
    state.host.covered = true;
    // Tryb podglądu Wyświetlacza nie liczy cyfr z rundy -- podajemy je wprost.
    state.display = { ...state.display, suppressLogoDraw: true, previewNumbers: { left: "000", right: "000", top: String(state.rounds.bankPts).padStart(3, "0") }, previewXPositions: { A: [], B: [2, 3] } };
  }
  if (kind.startsWith("finale")) {
    state.step = "f_p1_entry"; state.topCard = "final"; state.phase = "FINAL"; state.controlTeam = "A";
    state.rounds.totals = { A: 312, B: 187 };
    state.final.winnerTeam = "A";
    state.final.confirmed = true;
    state.final.questions = p.finale.map(([text], i) => ({ id: `f${i + 1}`, text, answers: [] }));
    state.final.picked = state.final.questions.map((q) => q.id);
    state.final.runtime.timer = { running: false, phase: null, endsAt: 0, usedP1: true, usedP2: false };
    state.final.runtime.p1 = p.finale.map(([, answer]) => ({ text: answer }));
  }
  if (kind === "finale2") {
    state.step = "f_p2_entry";
    state.final.runtime.timer = { running: false, phase: null, endsAt: 0, usedP1: true, usedP2: true };
    state.final.runtime.map1 = p.finale.map(() => ({ kind: "MISS" }));
    state.final.runtime.p2 = p.finale.map(([, answer], i) => (i === 2 ? { repeat: true } : { text: i % 2 ? answer : "" }));
  }
  if (kind === "main") {
    // Plansza strony głównej: hasła w wierszach 1, 3 i 5 (punkty jak w rundzie).
    state.step = "r_play"; state.topCard = "rounds"; state.phase = "PLAY"; state.controlTeam = "B";
    state.teams = { teamA: p.mainDisplay.teams[0], teamB: p.mainDisplay.teams[1] };
    const points = [39, 0, 16, 0, 7, 0];
    const words = [p.mainDisplay.words[0], "", p.mainDisplay.words[1], "", p.mainDisplay.words[2], ""];
    state.rounds.answers = words.map((text, i) => ({ id: `m${i + 1}`, ord: i + 1, text: text || "-", fixed_points: points[i] }));
    state.rounds.revealed = [1, 3, 5];
    state.rounds.bankPts = 62;
    state.rounds.totals = { A: 111, B: 111 };
    state.rounds.xA = 0; state.rounds.xB = 0;
    // Liczby i rozkład X-ów poza zwykłym stanem gry -- obsługuje je tryb podglądu Wyświetlacza.
    state.display = { ...state.display, suppressLogoDraw: true, previewNumbers: { left: 111, right: 111, top: 999 }, previewXPositions: { A: [1, 3], B: [1, 3] } };
  }
  return toRow(state);
}
