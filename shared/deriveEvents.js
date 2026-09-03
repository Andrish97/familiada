// Control v2 — czysta funkcja diffująca dwa kolejne wiersze public.game_state
// na listę zdarzeń. Każde urządzenie (Display/Host/Buzzer, oraz soundReactor
// w samym Control) mapuje te zdarzenia na własne, lokalne, zaszyte na sztywno
// zachowanie (animacja/dźwięk/tekst) — parametry animacji nigdy nie
// przechodzą przez bazę, bo są deterministyczne względem samej zmiany
// (patrz plan, sekcja 3).
//
// Brak poprzedniego wiersza (pierwsze renderowanie po (re)connect) zawsze
// daje wyłącznie SNAPSHOT_RENDER — urządzenie ma po prostu namalować bieżący
// stan bez żadnej animacji, co jest jednocześnie mechanizmem natychmiastowego
// wznowienia po przerwie.
//
// Zero importów przeglądarkowych — testowalne w gołym Node.

function get(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

function diffRevealedOrds(prevDetail, nextDetail) {
  const prev = new Set(get(prevDetail, ["rounds", "revealed"]) || []);
  const next = get(nextDetail, ["rounds", "revealed"]) || [];
  return next.filter((ord) => !prev.has(ord));
}

function diffFinalMapReveals(prevDetail, nextDetail, roundKey) {
  const prevRows = get(prevDetail, ["final", "runtime", roundKey]) || [];
  const nextRows = get(nextDetail, ["final", "runtime", roundKey]) || [];
  const events = [];
  for (let i = 0; i < nextRows.length; i++) {
    const prevRow = prevRows[i] || {};
    const nextRow = nextRows[i] || {};
    if (!prevRow.revealedAnswer && nextRow.revealedAnswer) {
      events.push({ kind: "FINAL_ANSWER_REVEALED", round: roundKey, idx: i });
    }
    if (!prevRow.revealedPoints && nextRow.revealedPoints) {
      events.push({ kind: "FINAL_POINTS_REVEALED", round: roundKey, idx: i });
    }
  }
  return events;
}

/**
 * @param {object|null|undefined} prevRow poprzednio wyrenderowany wiersz game_state (albo null przy pierwszym renderze)
 * @param {object} nextRow nowy wiersz game_state
 * @returns {Array<{kind: string, [key: string]: any}>}
 */
export function deriveEvents(prevRow, nextRow) {
  if (!prevRow) return [{ kind: "SNAPSHOT_RENDER" }];
  if (!nextRow) return [];

  const events = [];

  if (prevRow.step !== nextRow.step) {
    events.push({ kind: "STEP_CHANGE", from: prevRow.step, to: nextRow.step });
  }
  if (prevRow.phase !== nextRow.phase) {
    events.push({ kind: "PHASE_CHANGE", from: prevRow.phase, to: nextRow.phase });
  }
  if (prevRow.control_team !== nextRow.control_team) {
    events.push({ kind: "CONTROL_CHANGED", team: nextRow.control_team });
  }

  const newlyRevealed = diffRevealedOrds(prevRow.detail, nextRow.detail);
  if (newlyRevealed.length) {
    events.push({ kind: "ANSWER_REVEALED", ords: newlyRevealed });
  }

  const prevXA = get(prevRow.detail, ["rounds", "xA"]) || 0;
  const nextXA = get(nextRow.detail, ["rounds", "xA"]) || 0;
  if (nextXA > prevXA) events.push({ kind: "STRIKE", team: "A", count: nextXA });

  const prevXB = get(prevRow.detail, ["rounds", "xB"]) || 0;
  const nextXB = get(nextRow.detail, ["rounds", "xB"]) || 0;
  if (nextXB > prevXB) events.push({ kind: "STRIKE", team: "B", count: nextXB });

  const prevStealUsed = get(prevRow.detail, ["rounds", "steal", "used"]) || false;
  const nextStealUsed = get(nextRow.detail, ["rounds", "steal", "used"]) || false;
  if (!prevStealUsed && nextStealUsed) {
    events.push({ kind: "STEAL_RESOLVED", won: !!get(nextRow.detail, ["rounds", "steal", "won"]) });
  }

  events.push(...diffFinalMapReveals(prevRow.detail, nextRow.detail, "map1"));
  events.push(...diffFinalMapReveals(prevRow.detail, nextRow.detail, "map2"));

  const prevTimerRunning = get(prevRow.detail, ["final", "runtime", "timer", "running"]) || false;
  const nextTimerRunning = get(nextRow.detail, ["final", "runtime", "timer", "running"]) || false;
  if (!prevTimerRunning && nextTimerRunning) {
    events.push({ kind: "TIMER_STARTED", phase: get(nextRow.detail, ["final", "runtime", "timer", "phase"]), endsAt: get(nextRow.detail, ["final", "runtime", "timer", "endsAt"]) });
  }
  if (prevTimerRunning && !nextTimerRunning) {
    events.push({ kind: "TIMER_STOPPED" });
  }

  const prevDisplayMode = get(prevRow.detail, ["display", "mode"]);
  const nextDisplayMode = get(nextRow.detail, ["display", "mode"]);
  if (prevDisplayMode !== nextDisplayMode) {
    events.push({ kind: "DISPLAY_MODE_CHANGED", mode: nextDisplayMode, qrTarget: get(nextRow.detail, ["display", "qrTarget"]) });
  }

  const prevHostCovered = get(prevRow.detail, ["host", "covered"]);
  const nextHostCovered = get(nextRow.detail, ["host", "covered"]);
  if (prevHostCovered !== nextHostCovered) {
    events.push({ kind: "HOST_COVER_CHANGED", covered: !!nextHostCovered });
  }

  if (nextRow.sound_cue_seq !== prevRow.sound_cue_seq) {
    events.push({ kind: "SOUND_CUE", key: nextRow.sound_cue_key });
  }

  return events;
}
