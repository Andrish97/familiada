export function createStore(gameId) {
  const KEY = `familiada:control:v5:${gameId}`;
  const listeners = new Set();
  const FINAL_MIN_POINTS = 300; // domyślny próg do finału

  const DEFAULT_ADVANCED = {
    // mnożniki dla kolejnych rund; ostatnia wartość powtarza się dla dalszych rund
    roundMultipliers: [1, 1, 1, 2, 3],
    // próg wejścia do finału (ktoś musi tyle zdobyć w sumie)
    finalMinPoints: 300,
    // cel w finale (domyślne 200)
    finalTarget: 200,
    // czy na końcu gry wyświetlamy ekran „wygrana” (true) czy samo logo (false)
    winEnabled: true,
  };

  const state = {
    gameId,
    activeCard: "devices",

    steps: {
      devices: "devices_display",
      setup: "setup_names",
    },

    completed: {
      devices: false,
      setup: false,
    },

    locks: {
      gameStarted: false, // po „Start gry” blokujemy powrót do setup (tak jak ustaliliście)
      finalActive: false,
    },

    teams: {
      teamA: "",
      teamB: "",
    },

    hasFinal: null,

    final: {
      picked: [],
      confirmed: false,
      runtime: {
        phase: "IDLE", // IDLE | P1_ENTRY | P1_MAP | ROUND2_START | P2_ENTRY | P2_MAP | FINISH
        sum: 0,
        winSide: "A", // "A"|"B" (strona timera)
        timer: { running: false, secLeft: 0, phase: "P1" }, // P1=15, P2=20
        mapIndex: 0, // 0..4
        p1List: null, // [{text,status}] len 5, status: EMPTY|FILLED
        p2List: null, // [{text,status}] len 5, status: EMPTY|FILLED|REPEAT
        mapP1: null, // [{choice, matchId, outText, pts}] len 5
        mapP2: null, // [{choice, matchId, outText, pts}] len 5
        reached200: false,
      },
      step: "f_start",
    },

    flags: {
      displayOnline: false,
      hostOnline: false,
      buzzerOnline: false,
      sentBlackAfterDisplayOnline: false,
      audioUnlocked: false,
      qrOnDisplay: false,
    },

    rounds: {
      phase: "IDLE", // IDLE | DUEL | ROUND | STEAL | END
      roundNo: 1,
      controlTeam: null, // "A"|"B"
      bankPts: 0,
      xA: 0,
      xB: 0,
      totals: { A: 0, B: 0 },
      step: "r_ready",
      passUsed: false,
      stealWon: false,

      question: null, // {id, ord, text}
      answers: [], // [{id, ord, text, fixed_points}]
      revealed: new Set(), // ord set

      duel: {
        enabled: false,
        lastPressed: null, // "A"|"B"
      },

      timer3: {
        running: false,
        endsAt: 0,
      },

      steal: {
        active: false,
        used: false, // single steal attempt
      },

      allowPass: false, // after first correct answer
    },
    advanced: { ...DEFAULT_ADVANCED },
  };

  function emit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(serialize(state)));
    } catch {}
    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function serialize(s) {
    // konwersja Setów itp.
    const out = structuredClone(s);
    out.rounds.revealed = Array.from(s.rounds.revealed);
    // znacznik czasu zapisu – potrzebny do limitu 5 minut
    out._savedAt = Date.now();
    return out;
  }

  // Stare isFinalActive – zostawione tylko jako pomocnicze (gdyby coś jeszcze wołało po kroku)
  function isFinalActiveLegacy() {
    const step = state.final?.step || "f_start";
    return step !== "f_start";
  }

  function teamsOk() {
    return state.teams.teamA.trim().length > 0 || state.teams.teamB.trim().length > 0;
  }

  function canFinishSetup() {
    if (!teamsOk()) return false;
    if (state.hasFinal === false) return true;
    if (state.hasFinal === true) {
      return state.final.confirmed === true && state.final.picked.length === 5;
    }
    return false;
  }

  function allDevicesOnline() {
    return state.flags.displayOnline && state.flags.hostOnline && state.flags.buzzerOnline;
  }

  function canStartRounds() {
    return allDevicesOnline() && state.flags.audioUnlocked && canFinishSetup();
  }

  // Właściwa funkcja – logika przełączona na locka
  function isFinalActive() {
    return state.locks.finalActive === true;
  }

  function canEnterCard(card) {
    const totals = state.rounds?.totals || { A: 0, B: 0 };
    const adv = state.advanced || {};
    const threshold =
      typeof adv.finalMinPoints === "number" ? adv.finalMinPoints : FINAL_MIN_POINTS;
    const hasFinalPoints =
      (totals.A || 0) >= threshold || (totals.B || 0) >= threshold;

    // URZĄDZENIA – dostępne tylko do momentu "Gra gotowa"
    if (card === "devices") {
      return !state.locks.gameStarted;
    }

    // USTAWIENIA – po urządzeniach, też tylko do "Gra gotowa"
    if (card === "setup") {
      return state.completed.devices && !state.locks.gameStarted;
    }

    // ROUNDS – dostępne po Urządzeniach, niezależnie od tego,
    // czy ustawienia są już perfekcyjne i czy jest finał
    if (card === "rounds") {
      return state.completed.devices;
    }

    // FINAŁ – tylko jeśli:
    // - gra ma finał,
    // - ustawienia są poprawne (w tym wybrane pytania finału),
    // - któraś drużyna osiągnęła wymagany próg punktów
    if (card === "final") {
      return state.hasFinal === true && canFinishSetup() && hasFinalPoints;
    }

    return false;
  }

  function setActiveCard(card) {
    if (!canEnterCard(card)) return;
    state.activeCard = card;
    emit();
  }

  function setDevicesStep(step) {
    state.steps.devices = step;
    emit();
  }

  function setSetupStep(step) {
    state.steps.setup = step;
    emit();
  }

  function completeCard(card) {
    state.completed[card] = true;
    emit();
  }

  function setTeams(a, b) {
    state.teams.teamA = String(a ?? "");
    state.teams.teamB = String(b ?? "");
    emit();
  }

  function setGameStarted(v) {
    state.locks.gameStarted = !!v;
    emit();
  }

  function setHasFinal(v) {
    state.hasFinal = v;
    if (v === false) {
      state.final.picked = [];
      state.final.confirmed = false;
    }
    emit();
  }

  function setFinalActive(v) {
    state.locks.finalActive = !!v;
    emit();
  }

  function confirmFinalQuestions(ids) {
    state.final.picked = Array.isArray(ids) ? ids.slice(0, 5) : [];
    state.final.confirmed = true;
    emit();
  }

  function unconfirmFinalQuestions() {
    state.final.confirmed = false;
    emit();
  }

  function setOnlineFlags({ display, host, buzzer }) {
    state.flags.displayOnline = !!display;
    state.flags.hostOnline = !!host;
    state.flags.buzzerOnline = !!buzzer;
    emit();
  }

  function markSentBlackAfterDisplayOnline() {
    state.flags.sentBlackAfterDisplayOnline = true;
    emit();
  }

  function setAudioUnlocked(v) {
    state.flags.audioUnlocked = !!v;
    emit();
  }

  function setQrOnDisplay(v) {
    state.flags.qrOnDisplay = !!v;
    emit();
  }

  // ---- obsługa typu wejścia na stronę (odświeżenie vs. nowa nawigacja) ----

  function getNavigationType() {
    try {
      const navEntries = performance.getEntriesByType?.("navigation");
      const nav = navEntries && navEntries[0];
      if (nav && nav.type) return nav.type; // "navigate" | "reload" | "back_forward"

      // legacy API
      const legacy = performance.navigation;
      if (legacy) {
        if (legacy.type === 1) return "reload";
        if (legacy.type === 2) return "back_forward";
        return "navigate";
      }
    } catch {
      // jeśli coś pójdzie nie tak, zachowujemy się konserwatywnie jak przy zwykłej nawigacji
    }
    return "navigate";
  }

  function hydrate() {
    const navType = getNavigationType();

    // Stan przywracamy **tylko** przy twardym odświeżeniu (F5 / Ctrl+R).
    // Wejście z buildera (normalny link) albo powrót wstecz/przód – start na czysto.
    if (navType !== "reload") {
      try {
        localStorage.removeItem(KEY);
      } catch {}
      return;
    }

    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const p = JSON.parse(raw);

      const MAX_AGE_MS = 5 * 60 * 1000; // 5 minut
      const savedAt = typeof p?._savedAt === "number" ? p._savedAt : null;

      // brak lub za stary zapis -> traktujemy jak brak stanu
      if (!savedAt || Date.now() - savedAt > MAX_AGE_MS) {
        try {
          localStorage.removeItem(KEY);
        } catch {}
        return;
      }

      if (p?.activeCard && typeof p.activeCard === "string") {
        state.activeCard = p.activeCard;
      }

      if (p?.steps?.devices) state.steps.devices = p.steps.devices;
      if (p?.steps?.setup) state.steps.setup = p.steps.setup;

      if (p?.completed) {
        state.completed.devices = !!p.completed.devices;
        state.completed.setup = !!p.completed.setup;
      }

      if (p?.locks) {
        state.locks.gameStarted = !!p.locks.gameStarted;
        state.locks.finalActive = !!p.locks.finalActive;
      }

      if (p?.teams) {
        state.teams.teamA = String(p.teams.teamA ?? "");
        state.teams.teamB = String(p.teams.teamB ?? "");
      }

      if (typeof p?.hasFinal === "boolean") state.hasFinal = p.hasFinal;

      if (p?.final) {
        state.final.picked = Array.isArray(p.final.picked) ? p.final.picked.slice(0, 5) : [];
        state.final.confirmed = !!p.final.confirmed;
        // runtime specjalnie pomijamy – po refreshu i tak ogarniasz finał “ręcznie”
      }

      if (p?.flags) {
        state.flags.displayOnline = !!p.flags.displayOnline;
        state.flags.hostOnline = !!p.flags.hostOnline;
        state.flags.buzzerOnline = !!p.flags.buzzerOnline;
        state.flags.sentBlackAfterDisplayOnline = !!p.flags.sentBlackAfterDisplayOnline;
        state.flags.audioUnlocked = !!p.flags.audioUnlocked;
        state.flags.qrOnDisplay = !!p.flags.qrOnDisplay;
      }

      if (p?.rounds) {
        const pr = p.rounds;

        // podstawowe pola
        state.rounds.phase = pr.phase || state.rounds.phase;
        state.rounds.roundNo = Number(pr.roundNo || 1);
        state.rounds.controlTeam = pr.controlTeam ?? null;
        state.rounds.bankPts = pr.bankPts ?? 0;
        state.rounds.xA = pr.xA ?? 0;
        state.rounds.xB = pr.xB ?? 0;
        state.rounds.totals = pr.totals || state.rounds.totals;
        state.rounds.step = pr.step || state.rounds.step;
        state.rounds.passUsed = !!pr.passUsed;
        state.rounds.stealWon = !!pr.stealWon;

        // dane pytania / odpowiedzi
        state.rounds.question = pr.question || null;
        state.rounds.answers = pr.answers || [];

        // Set z odsłoniętymi odpowiedziami
        state.rounds.revealed = new Set(pr.revealed || []);

        // duel
        if (pr.duel) {
          state.rounds.duel.enabled = !!pr.duel.enabled;
          state.rounds.duel.lastPressed = pr.duel.lastPressed || null;
        }

        // timer3 – po refreshu nie wznawiamy odliczania, tylko czyścimy
        state.rounds.timer3.running = false;
        state.rounds.timer3.endsAt = 0;
        state.rounds.timer3.secLeft = 0;

        // steal
        if (pr.steal) {
          state.rounds.steal.active = !!pr.steal.active;
          state.rounds.steal.used = !!pr.steal.used;
        } else {
          state.rounds.steal.active = false;
          state.rounds.steal.used = false;
        }

        state.rounds.allowPass = !!pr.allowPass;

        // flagi pomocnicze (np. intro zagrane)
        if (typeof pr._introPlayed === "boolean") {
          state.rounds._introPlayed = pr._introPlayed;
        }
      }

      if (p?.advanced) {
        const a = p.advanced;
        const cur = state.advanced || { ...DEFAULT_ADVANCED };

        if (Array.isArray(a.roundMultipliers)) {
          cur.roundMultipliers = a.roundMultipliers
            .map((x) => {
              const n = Number.parseInt(String(x), 10);
              return Number.isFinite(n) && n > 0 ? n : 1;
            });
          if (!cur.roundMultipliers.length) {
            cur.roundMultipliers = [...DEFAULT_ADVANCED.roundMultipliers];
          }
        }

        if (typeof a.finalMinPoints === "number") {
          cur.finalMinPoints = a.finalMinPoints;
        }
        if (typeof a.finalTarget === "number") {
          cur.finalTarget = a.finalTarget;
        }
        if (typeof a.winEnabled === "boolean") {
          cur.winEnabled = a.winEnabled;
        }

        state.advanced = cur;
      }

      
    } catch {
      // przy problemie z JSON-em po prostu startujemy od zera
      try {
        localStorage.removeItem(KEY);
      } catch {}
    }

    // sanity po hydracji
    if (!canEnterCard(state.activeCard)) {
      const order = ["rounds", "final", "setup", "devices"];
      state.activeCard = order.find((c) => canEnterCard(c)) || "devices";
    }
  }

  // po .hydrate(); – startowo upewnij się, że jesteśmy co najmniej na devices
  if (!canEnterCard(state.activeCard)) setActiveCard("devices");


  function setAdvanced(partial) {
    const cur = state.advanced || { ...DEFAULT_ADVANCED };
    const next = { ...cur };

    if (partial.roundMultipliers && Array.isArray(partial.roundMultipliers)) {
      next.roundMultipliers = partial.roundMultipliers
        .map((x) => {
          const n = Number.parseInt(String(x), 10);
          return Number.isFinite(n) && n > 0 ? n : 1;
        });
      if (!next.roundMultipliers.length) {
        next.roundMultipliers = [...DEFAULT_ADVANCED.roundMultipliers];
      }
    }

    if (typeof partial.finalMinPoints === "number") {
      next.finalMinPoints = partial.finalMinPoints;
    }

    if (typeof partial.finalTarget === "number") {
      next.finalTarget = partial.finalTarget;
    }

    if (typeof partial.winEnabled === "boolean") {
      next.winEnabled = partial.winEnabled;
    }

    state.advanced = next;
    emit();
  }

  function resetAdvanced() {
    state.advanced = { ...DEFAULT_ADVANCED };
    emit();
  }

  return {
    state,
    hydrate,
    subscribe,

    setActiveCard,
    setDevicesStep,
    setSetupStep,

    completeCard,
    setTeams,
    setHasFinal,
    confirmFinalQuestions,
    unconfirmFinalQuestions,

    setOnlineFlags,
    markSentBlackAfterDisplayOnline,
    setAudioUnlocked,
    setQrOnDisplay,
    setFinalActive,
    setGameStarted,

    teamsOk,
    canFinishSetup,
    canStartRounds,
    canEnterCard,

    setAdvanced,
    resetAdvanced,
  };
}
