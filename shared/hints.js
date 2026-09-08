// shared/hints.js
// Blok podpowiedzi nad siatką (control2/js/ui.js) — odpowiednik starego
// control/js/gameRounds.js's/gameFinal.js's setDuelMsg/setPlayMsg/
// setStealMsg/setRevealMsg/setEndMsg/ROUNDS_MSG/FINAL_MSG, ale bez
// imperatywnego "ustaw wiadomość, gdy coś się zdarzy": tu wszystko idzie
// przez tabelę stanów — to jest CZYSTA funkcja odczytująca bieżący
// game_state (step/phase/detail) i zwracająca jeden, zawsze aktualny tekst,
// dokładnie tak samo jak reszta renderowania w tym projekcie. Zero
// osobnego, ulotnego stanu "ostatni komunikat" do synchronizowania.
//
// Zero importów przeglądarkowych — testowalne w gołym Node, jak
// gameStateMachine.js/deriveEvents.js.

// "A"/"B" to wewnętrzne kody drużyn (public.game_team) — nigdy nie
// pokazujemy ich operatorowi wprost, tylko realną nazwę wpisaną w
// ustawieniach gry (state.teams.teamA/teamB). Reużywane przez
// control2/js/ui.js (pasek statusu, ekran pojedynku), żeby te same litery
// nie były tłumaczone w dwóch miejscach dwoma różnymi kawałkami kodu.
export function teamName(state, code) {
  if (code === "A") return state.teams?.teamA || "Drużyna A";
  if (code === "B") return state.teams?.teamB || "Drużyna B";
  return code || "—";
}

export function getRoundsHint(state) {
  const r = state.rounds;
  if (state.step === "r_intro") return "Gra gotowa. Ekran oczekuje na start.";
  if (state.step === "r_roundStart") return `Runda ${r.roundNo} gotowa. Kliknij „Start rundy”, żeby zacząć.`;
  if (state.step !== "r_duel" && state.step !== "r_play") return "";

  // Uwaga: hinty celowo NIE powtarzają tego, co już widać na pasku statusu
  // pod siatką (kto ma kontrolę / bank / kradzież) — tylko podpowiadają
  // KOLEJNY krok. Kto teraz odpowiada w pojedynku (DUEL) nie jest na pasku
  // statusu (ten pokazuje tylko controlTeam, który w DUEL jest jeszcze
  // pusty), więc tu zostaje.
  if (state.phase === "DUEL") {
    if (!r.duel.firstTeam) {
      if (r.duel.lastPressed) {
        return `Pierwsza: ${teamName(state, r.duel.lastPressed)}. Kliknij „Przyjmij”, żeby zatwierdzić.`;
      }
      return state.settings.physicalBuzzer
        ? "Obserwuj, kto nacisnął przycisk jako pierwszy. Kliknij drużynę, a potem „Potwierdź”."
        : "Przycisk aktywny. Czekam na zgłoszenie drużyny.";
    }
    return r.duel.cycleFirstAnswered
      ? `Teraz odpowiada: ${teamName(state, r.duel.currentTeam)}.`
      : `Pojedynek — odpowiada: ${teamName(state, r.duel.currentTeam)}.`;
  }

  if (state.phase === "PLAY") {
    if (!state.controlTeam) return "Brak drużyny grającej.";
    if (r.canEndRound) return "Wszystkie odpowiedzi odsłonięte. Kliknij „Zakończ rundę”.";
    if (r.allowPass && !r.passUsed) return "Może zagrać dalej albo oddać kontrolę.";
    return "Wskaż trafioną odpowiedź albo kliknij X (pudło).";
  }

  if (state.phase === "STEAL") {
    if (r.steal.used) {
      return r.steal.won
        ? "Kradzież udana — bank przechodzi do drużyny kradnącej."
        : "Kradzież nietrafiona — bank zostaje przy drużynie grającej.";
    }
    return "Szansa na kradzież. Kliknij trafioną odpowiedź albo X (pudło).";
  }

  if (state.phase === "REVEAL") {
    return "Klikaj brakujące odpowiedzi, żeby pokazać je na wyświetlaczu (bez zmiany punktów).";
  }

  return "";
}

export function getFinalHint(state) {
  const f = state.final;
  const step = state.step;

  if (step === "f_start") return "Kliknij „Start finału”, żeby rozpocząć.";

  if (step === "f_p1_entry" || step === "f_p2_entry") {
    const round = step === "f_p1_entry" ? 1 : 2;
    const t = f.runtime.timer;
    const phaseKey = round === 1 ? "P1" : "P2";
    if (t.running && t.phase === phaseKey) return "Odliczanie trwa…";
    const used = round === 1 ? t.usedP1 : t.usedP2;
    if (used) return "Czas wykorzystany. Kliknij „Dalej”, żeby przejść do odsłaniania.";
    return `Wpisz odpowiedzi gracza ${round}. Możesz opcjonalnie uruchomić odliczanie (${round === 1 ? "15" : "20"}s) — jednorazowo.`;
  }

  if (step === "f_p2_start") return "Odpowiedzi gracza 1 zostają zasłonięte na Display przed startem tury gracza 2.";

  if (step.startsWith("f_p1_map_q") || step.startsWith("f_p2_map_q")) {
    const round = step.startsWith("f_p1_map_q") ? 1 : 2;
    const idx = Number(step.slice(-1)) - 1;
    const entry = f.runtime[round === 1 ? "p1" : "p2"][idx] || {};
    const row = f.runtime[round === 1 ? "map1" : "map2"][idx];
    if (round === 2 && entry.repeat) return "Oznaczone jako powtórzenie odpowiedzi gracza 1 — liczy się jak brak dopasowania.";
    if (!row.revealedAnswer) {
      const text = (entry.text || "").trim();
      return text
        ? `Wpisano: „${text}”. Wybierz dopasowanie z listy albo kliknij „Pokaż odpowiedź”.`
        : "Brak wpisu — kliknij „Pokaż odpowiedź”, żeby oznaczyć brak dopasowania.";
    }
    if (!row.revealedPoints) return "Odpowiedź odsłonięta. Kliknij „Pokaż punkty”, żeby dopisać je do sumy.";
    return "Punkty odsłonięte. Kliknij „Dalej”, żeby przejść do kolejnego pytania.";
  }

  if (step === "f_end") return "Finał zakończony.";

  return "";
}
