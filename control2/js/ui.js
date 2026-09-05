// control2/js/ui.js
// Renderowanie panelu Control v2 — napisane od zera. Zakres celowo
// zawężony zgodnie z sekcją 3b planu: D0/D1/D3 (urządzenia, ustawienia) już
// są OK wizualnie, więc tu dostają prosty, funkcjonalny formularz — dopiero
// Rundy / Finał-wpisywanie / Finał-odsłanianie mają wspólny szablon (jedna
// karta, bez przewijania, mały stepper na górze, nawigacja na dole).
// Dokładny CSS/HTML tych trzech ekranów to celowo pierwsza rzecz do
// wspólnego dopracowania z właścicielem projektu (wizualne, nie
// architektoniczne) — poniższe spełnia twarde reguły z planu, ale nie
// udaje gotowego projektu graficznego.
//
// ui.js nie zna store'a/silnika wprost — dostaje `dispatch(handlerName, payload)`
// i renderuje na podstawie przekazanego `state`. Zero logiki gry tutaj.

const $ = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) el.appendChild(c);
  return el;
}

export function createUI({ root, emit }) {
  function clear() { root.innerHTML = ""; }

  // ============================================================
  // D0/D1: parowanie urządzeń
  // ============================================================
  function renderDevicesStep(state, ctx) {
    clear();
    const { urls, presenceFlags = {}, connectCodes = {} } = ctx;
    const wrap = h("div", { class: "c2-devices" });

    const row = (label, kind, url, { showQrToggle = false } = {}) => {
      const online = !!presenceFlags[kind];
      const code = connectCodes[kind];
      const isShowingThis = state.display.mode === "QR" && state.display.qrTarget === kind;
      const actions = [
        h("button", { class: "c2-btn", type: "button", onclick: () => window.open(url, "_blank") }, [document.createTextNode("Otwórz link")]),
        h("span", { class: "c2-code", text: code ? `Kod: ${code}` : "" }),
      ];
      if (showQrToggle) {
        actions.push(h("button", {
          class: `c2-btn ${isShowingThis ? "primary" : ""}`, type: "button",
          onclick: () => emit(isShowingThis ? "devices.hideQr" : "devices.showQr", { kind, url, code }),
        }, [document.createTextNode(isShowingThis ? "Ukryj QR" : "Pokaż QR na wyświetlaczu")]));
      }
      return h("div", { class: "c2-device-row" }, [
        h("div", { class: "c2-device-label" }, [
          h("span", { class: `c2-dot ${online ? "on" : "off"}` }),
          h("span", { text: label }),
        ]),
        h("div", { class: "c2-device-actions" }, actions),
      ]);
    };

    wrap.appendChild(row("Wyświetlacz", "display", urls.displayUrl));
    if (state.step === "devices_hostbuzzer") {
      if (!state.settings.noHostTablet) wrap.appendChild(row("Prowadzący", "host", urls.hostUrl, { showQrToggle: true }));
      if (!state.settings.physicalBuzzer) wrap.appendChild(row("Buzzer", "buzzer", urls.buzzerUrl, { showQrToggle: true }));
    }

    const next = h("button", { class: "c2-btn primary", type: "button", onclick: () => emit("devices.next") }, [
      document.createTextNode(state.step === "devices_display" ? "Dalej" : "Zakończ podłączanie"),
    ]);

    root.appendChild(h("div", { class: "c2-card-inner" }, [
      h("h2", { text: state.step === "devices_display" ? "Podłącz wyświetlacz" : "Podłącz prowadzącego i buzzer" }),
      wrap,
      next,
    ]));
  }

  // ============================================================
  // D3: podsumowanie ustawień. Drużyny/finał/tryby doboru pytań/ustawienia
  // zaawansowane są od dawna skonfigurowane na osobnej stronie
  // (game-settings, poza Control) i zdenormalizowane do stanu przez
  // control2/js/app.js's applyGameSettingsToState() — to jest wyłącznie
  // READ-ONLY podsumowanie tego, co już ustawiono (plan, tabela D3), nie
  // formularz danych wejściowych.
  // ============================================================
  function renderSetupFinish(state) {
    clear();
    const s = state.settings;
    const hasFinal = s.hasFinal === true;

    const row = (label, value) => h("div", { class: "c2-device-row" }, [
      h("span", { text: label }),
      h("span", { text: value }),
    ]);

    const rows = [
      row("Drużyna A", state.teams.teamA || "—"),
      row("Drużyna B", state.teams.teamB || "—"),
      row("Finał", hasFinal ? "Tak" : "Nie"),
      row("Pytania rund", s.roundsQuestionsMode === "pick" ? `Ustalona kolejność (${s.roundsPicked?.length || 0})` : "Losowo"),
    ];
    if (hasFinal) {
      rows.push(row("Pytania finału", s.finalQuestionsMode === "pick" ? `Wybrane ręcznie (${state.final.picked?.length || 0}/5)` : "Losowo"));
    }

    const reshuffleBtns = [];
    if (s.roundsQuestionsMode !== "pick") {
      reshuffleBtns.push(h("button", { class: "c2-btn", type: "button", onclick: () => emit("setup.reshuffleRounds") }, [document.createTextNode("Losuj ponownie pytania rund")]));
    }
    if (hasFinal && s.finalQuestionsMode !== "pick") {
      reshuffleBtns.push(h("button", { class: "c2-btn", type: "button", onclick: () => emit("setup.reshuffleFinal") }, [document.createTextNode("Losuj ponownie pytania finału")]));
    }

    const finalIncomplete = hasFinal && s.finalQuestionsMode === "pick" && (state.final.picked?.length !== 5 || !state.final.confirmed);
    const start = h("button", {
      class: "c2-btn primary", type: "button",
      disabled: finalIncomplete ? "" : undefined,
      onclick: () => emit("setup.start"),
    }, [document.createTextNode("Rozpocznij")]);

    const children = [h("h2", { text: "Podsumowanie ustawień" }), ...rows];
    if (reshuffleBtns.length) children.push(h("div", { class: "c2-topbar-actions" }, reshuffleBtns));
    if (finalIncomplete) children.push(h("div", { class: "gs-hint" }, [document.createTextNode("Finał ustawiony na \"wybrane ręcznie\", ale nie wybrano 5 pytań w ustawieniach gry.")]));
    children.push(start);

    root.appendChild(h("div", { class: "c2-card-inner" }, children));
  }

  // ============================================================
  // Wspólny szablon 3 głównych ekranów rozgrywki (sekcja 3b):
  // jedna karta, mały stepper na górze, treść na środku, nawigacja na dole.
  // ============================================================
  function gameplayShell({ stepLabel, body, nav }) {
    clear();
    root.appendChild(h("div", { class: "c2-card-inner c2-gameplay" }, [
      h("div", { class: "c2-stepper", text: stepLabel }),
      h("div", { class: "c2-gameplay-body" }, body),
      h("div", { class: "c2-gameplay-nav" }, nav),
    ]));
  }

  // ---- Rundy (r_intro..r_gameEnd) ----
  function renderRounds(state) {
    const r = state.rounds;
    if (state.step === "r_intro") {
      gameplayShell({
        stepLabel: "Rundy — wprowadzenie",
        body: [h("p", { text: "Gotowi? Kliknij dalej, żeby zacząć pierwszą rundę." })],
        nav: [h("button", { class: "c2-btn primary", onclick: () => emit("rounds.introNext") }, [document.createTextNode("Dalej")])],
      });
      return;
    }
    if (state.step === "r_roundStart") {
      gameplayShell({
        stepLabel: `Runda ${r.roundNo}`,
        body: [h("p", { text: `Wyniki: A ${r.totals.A} — B ${r.totals.B}` })],
        nav: [h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "START_ROUND" }) }, [document.createTextNode("Start rundy")])],
      });
      return;
    }

    // r_duel / r_play (wspólny ekran gry właściwej)
    const body = [];
    body.push(h("div", { class: "c2-question", text: r.question?.text || "—" }));
    const answersGrid = h("div", { class: "c2-answers-grid" });
    for (const a of r.answers) {
      const revealed = r.revealed.includes(a.ord);
      const btn = h("button", {
        class: `c2-answer-btn ${revealed ? "revealed" : ""}`,
        type: "button",
        disabled: revealed || state.phase === "REVEAL" ? undefined : undefined,
        onclick: () => emit("game.dispatch", { type: state.phase === "REVEAL" ? "REVEAL_LEFT" : "REVEAL_ANSWER", ord: a.ord }),
      }, [document.createTextNode(revealed ? `${a.text} — ${a.fixed_points}` : `#${a.ord}`)]);
      if (revealed) btn.disabled = true;
      answersGrid.appendChild(btn);
    }
    body.push(answersGrid);
    body.push(h("div", { class: "c2-bank", text: `Bank: ${r.bankPts}` }));

    if (state.phase === "DUEL") {
      body.push(h("div", { class: "c2-duel" }, [
        h("span", { text: `Zgłoszono: ${r.duel.lastPressed || "—"}` }),
        r.duel.lastPressed && !r.duel.firstTeam
          ? h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "ACCEPT_BUZZ", team: r.duel.lastPressed }) }, [document.createTextNode("Przyjmij")])
          : null,
      ]));
    }

    const nav = [];
    if (state.phase === "PLAY" || state.phase === "STEAL") {
      nav.push(h("button", { class: "c2-btn", onclick: () => emit("game.dispatch", { type: "ADD_X" }) }, [document.createTextNode("X")]));
      if (r.allowPass && !r.passUsed) nav.push(h("button", { class: "c2-btn", onclick: () => emit("game.dispatch", { type: "PASS" }) }, [document.createTextNode("Pass")]));
      if (state.phase === "PLAY") nav.push(h("button", { class: "c2-btn", onclick: () => emit("game.dispatch", { type: "GO_STEAL" }) }, [document.createTextNode("Kradzież")]));
      if (r.canEndRound) nav.push(h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "END_ROUND" }) }, [document.createTextNode("Zakończ rundę")]));
    }
    gameplayShell({ stepLabel: `Runda ${r.roundNo} — bank ${r.bankPts}`, body, nav });
  }

  function renderGameEnd(state) {
    gameplayShell({
      stepLabel: "Koniec gry",
      body: [h("p", { text: `Wynik końcowy: A ${state.rounds.totals.A} — B ${state.rounds.totals.B}` })],
      nav: [
        state.locks.gameEnded
          ? null
          : h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "GAME_END_SHOW" }) }, [document.createTextNode("Pokaż koniec gry")]),
      ],
    });
  }

  // ---- Finał ----
  function renderFinalStart(state) {
    gameplayShell({
      stepLabel: "Finał",
      body: [h("p", { text: "Start finału" })],
      nav: [h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "START_FINAL" }) }, [document.createTextNode("Start finału")])],
    });
  }

  function renderFinalEntry(state, round) {
    const f = state.final;
    const key = round === 1 ? "p1" : "p2";
    const body = [];
    for (let i = 0; i < 5; i++) {
      const row = f.runtime[key][i] || {};
      const question = f.questions?.[i];
      body.push(h("label", { text: question?.text || `Pytanie ${i + 1}` }));
      const inp = h("input", { type: "text", value: row.text || "", placeholder: `Odpowiedź gracza` });
      on(inp, "input", () => emit("game.dispatch", { type: "SET_ENTRY_TEXT", round, idx: i, text: inp.value }));
      body.push(inp);
      if (round === 2) {
        const repeatChk = h("input", { type: "checkbox" });
        repeatChk.checked = !!row.repeat;
        on(repeatChk, "change", () => emit("game.dispatch", { type: "SET_REPEAT", round: 2, idx: i, repeat: repeatChk.checked }));
        body.push(h("label", { class: "c2-repeat-label" }, [repeatChk, document.createTextNode(" powtórzenie")]));
      }
    }
    const timerRunning = f.runtime.timer.running;
    const nav = [
      !timerRunning ? h("button", { class: "c2-btn", onclick: () => emit("game.dispatch", { type: "START_TIMER", phase: round === 1 ? "P1" : "P2" }) }, [document.createTextNode("Start timera")]) : null,
      h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "START_MAPPING", round }) }, [document.createTextNode("Dalej")]),
    ];
    gameplayShell({ stepLabel: `Finał — gracz ${round}, wpisywanie`, body, nav });
  }

  // Dokładnie jak dzisiejsze gameFinal.js's ensureDefaultMapping(): dopóki
  // operator nie kliknął konkretnej odpowiedzi z listy, domyślne
  // rozstrzygnięcie to MISS (jest wpisany tekst) albo SKIP (pusto) — "AUTO"
  // nie robi żadnego dopasowania fuzzy, to tylko ten domyślny fallback.
  function defaultResolve(inputText) {
    const hasInput = (inputText || "").trim().length > 0;
    return hasInput
      ? { mode: "AUTO", kind: "MISS", matchId: null, outText: inputText, pts: 0 }
      : { mode: "AUTO", kind: "SKIP", matchId: null, outText: "", pts: 0 };
  }

  function renderFinalMapping(state, round, idx) {
    const f = state.final;
    const mapArr = f.runtime[round === 1 ? "map1" : "map2"];
    const row = mapArr[idx];
    const question = f.questions?.[idx];
    const entryKey = round === 1 ? "p1" : "p2";
    const inputText = f.runtime[entryKey][idx]?.text || "";
    const locked = row.revealedAnswer; // po odsłonięciu odpowiedzi wybór jest zamrożony

    const body = [
      h("div", { class: "c2-question", text: question?.text || `Pytanie ${idx + 1}` }),
      h("div", { text: `Odpowiedź gracza: ${inputText || "—"}` }),
    ];

    const answersList = h("div", { class: "c2-final-answers" });
    for (const a of question?.answers || []) {
      const isMatch = row.kind === "MATCH" && row.matchId === a.id;
      const btn = h("button", {
        class: `c2-answer-btn ${isMatch ? "revealed" : ""}`,
        type: "button",
        onclick: () => emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, mode: "MANUAL", kind: "MATCH", matchId: a.id, outText: a.text, pts: a.fixed_points }),
      }, [document.createTextNode(`${a.text} (${a.fixed_points})`)]);
      if (locked) btn.disabled = true;
      answersList.appendChild(btn);
    }
    body.push(answersList);

    if (!locked) {
      body.push(h("button", { class: "c2-btn", onclick: () => emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, mode: "MANUAL", kind: "MISS", matchId: null, outText: inputText, pts: 0 }) }, [document.createTextNode("Brak dopasowania")]));
    }

    body.push(h("div", { text: `Pokazana odpowiedź: ${row.revealedAnswer ? row.outText : "—ukryte—"}` }));
    body.push(h("div", { text: `Punkty: ${row.revealedPoints ? row.pts : "—"}` }));

    const nav = [
      !row.revealedAnswer
        ? h("button", { class: "c2-btn primary", onclick: async () => {
            if (row.kind == null) await emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, ...defaultResolve(inputText) });
            await emit("game.dispatch", { type: "REVEAL_ANSWER_ONLY", round, idx });
          } }, [document.createTextNode("Pokaż odpowiedź")])
        : !row.revealedPoints
        ? h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "REVEAL_POINTS", round, idx }) }, [document.createTextNode("Pokaż punkty")])
        : h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "NEXT_QUESTION", round, idx }) }, [document.createTextNode("Dalej")]),
    ];
    gameplayShell({ stepLabel: `Finał — mapowanie ${idx + 1}/5`, body, nav });
  }

  function renderFinalP2Start(state) {
    gameplayShell({
      stepLabel: "Finał — start rundy 2",
      body: [h("p", { text: "Gracz 2 startuje z połową odpowiedzi gracza 1 zasłoniętą." })],
      nav: [h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "START_P2_ROUND" }) }, [document.createTextNode("Start rundy 2")])],
    });
  }

  function renderFinalEnd(state) {
    gameplayShell({
      stepLabel: "Finał — koniec",
      body: [h("p", { text: `Suma finału: ${state.final.runtime.sum}` })],
      nav: [
        state.locks.gameEnded
          ? null
          : h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "FINISH_FINAL" }) }, [document.createTextNode("Zakończ")]),
      ],
    });
  }

  function render(state, ctx = {}) {
    const s = state.step;
    if (s === "devices_display" || s === "devices_hostbuzzer") return renderDevicesStep(state, ctx);
    if (s === "setup_finish") return renderSetupFinish(state);
    if (s === "r_intro" || s === "r_roundStart") return renderRounds(state);
    if (s === "r_duel" || s === "r_play") return renderRounds(state);
    if (s === "r_gameEnd") return renderGameEnd(state);
    if (s === "f_start") return renderFinalStart(state);
    if (s === "f_p1_entry") return renderFinalEntry(state, 1);
    if (s.startsWith("f_p1_map_q")) return renderFinalMapping(state, 1, Number(s.slice(-1)) - 1);
    if (s === "f_p2_start") return renderFinalP2Start(state);
    if (s === "f_p2_entry") return renderFinalEntry(state, 2);
    if (s.startsWith("f_p2_map_q")) return renderFinalMapping(state, 2, Number(s.slice(-1)) - 1);
    if (s === "f_end") return renderFinalEnd(state);
    clear();
    root.appendChild(h("div", { class: "c2-card-inner" }, [h("p", { text: `Nieobsłużony krok: ${s}` })]));
  }

  return { render };
}
