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

// Blok podpowiedzi nad siatką — odpowiednik starego setDuelMsg/setPlayMsg/
// setStealMsg/setRevealMsg/ROUNDS_MSG/FINAL_MSG, ale jako czysta funkcja
// bieżącego game_state (shared/hints.js), nie ulotny stan ustawiany przy
// każdym zdarzeniu — "wszystko idzie przez tabelę stanów".
import { getRoundsHint, getFinalHint, teamName } from "../../shared/hints.js?v=v2026-09-08T18231";

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

  // Tryb physicalBuzzer (plan, tabela A/R2): operator wybiera drużynę
  // wprost zamiast czekać na Buzzer — dwuetapowo (zaznacz → potwierdź, jak
  // sekcja 3a pkt 7), więc trzyma się to lokalnie w UI, nie w game_state
  // (nic się jeszcze nie zmieniło w grze, dopóki nie ma potwierdzenia).
  let pendingPhysicalTeam = null;

  // Kafle Rund, które faktycznie zmieniają wynik/przebieg gry (odpowiedź,
  // X, Oddaj kontrolę) też idą przez zaznacz → potwierdź, jak sekcja 3a
  // pkt 7 — pierwsze kliknięcie tylko "uzbraja" kafel (złota obwódka, zero
  // zapisu), drugie kliknięcie NA TYM SAMYM kaflu wysyła akcję. Kliknięcie
  // innego kafla przezbraja zamiast zaliczać stare zaznaczenie. Lokalny
  // stan UI, jak pendingPhysicalTeam — nic się nie zmienia w grze, dopóki
  // nie ma drugiego kliknięcia.
  let armedKey = null;

  // Statusy urządzeń w TOPBARZE (poza #app, statyczne w control2.html) —
  // dokładnie jak dzisiejsze control/js/ui.js's setDeviceBadges: aktualizacja
  // imperatywna przy każdym renderze, nie przebudowa DOM.
  function updateTopbarDots(presenceFlags = {}) {
    for (const kind of ["display", "host", "buzzer"]) {
      const dot = $(`dot${kind[0].toUpperCase()}${kind.slice(1)}`);
      if (dot) dot.className = `dot ${presenceFlags[kind] ? "ok" : "bad"}`;
    }
  }

  // ============================================================
  // D0/D1: parowanie urządzeń — struktura/klasy jak dzisiejsze control.html
  // (device-row/device-row-1/device-row-2/device-row-opt/badge), żeby
  // reużyć control.css один do jednego zamiast osobnego, uproszczonego stylu.
  // ============================================================
  function renderDevicesStep(state, ctx) {
    clear();
    const { urls, presenceFlags = {}, connectCodes = {} } = ctx;

    const deviceRow = (label, kind, url, { withQr = false } = {}) => {
      const online = !!presenceFlags[kind];
      const code = connectCodes[kind];
      const row2 = [
        h("div", { class: "device-connect-code" }, [h("span", { class: "device-connect-code-val", text: code || "——————" })]),
        h("button", { class: "btn gold", type: "button", onclick: () => emit("devices.copyCode", kind) }, [document.createTextNode("Kopiuj")]),
        h("a", { class: "btn", href: url, target: "_blank", rel: "noopener" }, [document.createTextNode("Otwórz")]),
      ];
      if (withQr) {
        const shown = !!state.display.qr[kind].show;
        row2.push(h("button", { class: "btn", type: "button", onclick: () => emit("qr.modal.show", kind) }, [document.createTextNode("Kod QR")]));
        row2.push(h("button", {
          class: `btn ${shown ? "primary" : ""}`, type: "button",
          onclick: () => emit(kind === "host" ? "qr.host.toggle" : "qr.buzzer.toggle"),
        }, [document.createTextNode(shown ? "Ukryj QR" : "QR na wyświetlaczu")]));
      }
      return h("div", { class: "device-row", "data-device": kind }, [
        h("div", { class: "device-row-1" }, [
          h("div", { class: "device-name", text: label }),
          h("div", { class: `badge ${online ? "ok" : "bad"}`, text: online ? "Online" : "Offline" }),
        ]),
        h("div", { class: "device-row-2" }, row2),
      ]);
    };

    // Jeden ekran, wszystkie 3 urządzenia naraz — dokładnie jak dzisiejsze
    // control.html (patrz komentarz wprost w jego kodzie: "Step 2
    // (host+buzzer) – usunięty, scalony z step 1"). Wcześniejsza wersja tego
    // pliku rozdzielała Wyświetlacz od Prowadzącego/Przycisku na dwa osobne
    // kroki — to był błąd (odtworzenie martwego, celowo scalonego kodu),
    // poprawiony po korekcie właściciela projektu.
    const rows = [deviceRow("Wyświetlacz", "display", urls.displayUrl)];

    if (!state.settings.noHostTablet) {
      const hostRow = deviceRow("Prowadzący", "host", urls.hostUrl, { withQr: true });
      const noHostChk = h("input", { type: "checkbox" });
      on(noHostChk, "change", () => emit("devices.noHostTablet", noHostChk.checked));
      hostRow.appendChild(h("div", { class: "device-row-opt" }, [
        h("label", { class: "device-opt-check" }, [noHostChk, h("div", { class: "device-opt-check-text" }, [
          h("span", { class: "device-opt-check-label", text: "Nie używaj tabletu prowadzącego" }),
          h("span", { class: "device-opt-check-hint", text: "Jeśli prowadzący nie używa osobnego tabletu/telefonu, zaznacz tę opcję." }),
        ])]),
      ]));
      rows.push(hostRow);
    } else {
      rows.push(h("div", { class: "device-row" }, [reenableRow("Prowadzący", "noHostTablet")]));
    }

    if (!state.settings.physicalBuzzer) {
      const buzzerRow = deviceRow("Przycisk", "buzzer", urls.buzzerUrl, { withQr: true });
      const physBuzzChk = h("input", { type: "checkbox" });
      on(physBuzzChk, "change", () => emit("devices.physicalBuzzer", physBuzzChk.checked));
      buzzerRow.appendChild(h("div", { class: "device-row-opt" }, [
        h("label", { class: "device-opt-check" }, [physBuzzChk, h("div", { class: "device-opt-check-text" }, [
          h("span", { class: "device-opt-check-label", text: "Fizyczny przycisk" }),
          h("span", { class: "device-opt-check-hint", text: "Jeśli posiadasz fizyczny przycisk buzzer, zaznacz tę opcję." }),
        ])]),
      ]));
      rows.push(buzzerRow);
    } else {
      rows.push(h("div", { class: "device-row" }, [reenableRow("Przycisk", "physicalBuzzer")]));
    }

    function reenableRow(label, flagKey) {
      const chk = h("input", { type: "checkbox" });
      chk.checked = true;
      on(chk, "change", () => emit(flagKey === "noHostTablet" ? "devices.noHostTablet" : "devices.physicalBuzzer", chk.checked));
      return h("label", { class: "device-opt-check" }, [chk, h("div", { class: "device-opt-check-text" }, [
        h("span", { class: "device-opt-check-label", text: `${label} pominięty (odznacz, żeby podłączyć)` }),
      ])]);
    }

    // Dokładnie jak dzisiejsze btnDevicesNext (control/js/app.js's
    // requiredOnline): Wyświetlacz jest WYMAGANY zawsze (nie ma dla niego
    // odpowiednika opt-outu), Prowadzący/Przycisk są wymagane tylko gdy
    // operator NIE odznaczył odpowiedniej flagi (noHostTablet/physicalBuzzer)
    // — bez tego "Dalej" zostaje zablokowane.
    const displayReady = !!presenceFlags.display;
    const hostReady = !!presenceFlags.host || state.settings.noHostTablet;
    const buzzerReady = !!presenceFlags.buzzer || state.settings.physicalBuzzer;
    const requiredOnline = displayReady && hostReady && buzzerReady;

    const next = h("button", {
      class: "btn gold", type: "button",
      disabled: requiredOnline ? undefined : "",
      onclick: requiredOnline ? () => emit("devices.next") : undefined,
    }, [document.createTextNode("Dalej")]);

    root.appendChild(h("div", { class: "cardBody" }, [
      // .stepTitle zostaje (niewidoczny, display:none w control.css — testy
      // E2E celują w niego jako stabilny selektor kroku, dokładnie jak w
      // starym Control) — widoczny nagłówek to osobny .c2-stepper, ten sam
      // wzorzec (mały, uppercase, linia pod spodem) co w Rundach/Finale.
      h("div", { class: "stepTitle", text: "Urządzenia" }),
      h("div", { class: "c2-stepper", text: "Urządzenia" }),
      ...rows,
      h("div", { class: "device-code-hint", text: "Wejdź na familiada.online, kliknij „Podłącz urządzenie” i wprowadź kod urządzenia." }),
      h("div", { class: "stepFoot" }, [h("div", { class: "stepFootButtons" }, [next])]),
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
  function colorDots(colors) {
    return h("span", {}, ["A", "B", "BACKGROUND", "DOT"].map((k) =>
      h("span", { style: `display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:4px;background:${colors?.[k] || "#000"};border:1px solid rgba(255,255,255,.3)`, title: k })
    ));
  }

  function summarySection(title, valueNode) {
    return h("div", { class: "summarySection" }, [
      h("div", { class: "summarySectionTitle", text: title }),
      valueNode,
    ]);
  }

  // Wiersz-atrapa "rundy w toku" do podglądu D3 — Display umie renderować
  // WYŁĄCZNIE prawdziwy wiersz game_state, więc żeby operator zobaczył
  // realny wygląd (kolory/motyw/logo/nazwy drużyn) przed startem gry,
  // trzeba mu dać kompletny, choć zmyślony, taki wiersz. Treść przykładowa,
  // ale kształt 1:1 z tym, co produkuje control2/js/engine.js.
  function buildPreviewRow(state) {
    const d = state.display;
    return {
      top_card: "rounds", step: "r_play", phase: "PLAY", control_team: "A",
      sound_cue_key: null, sound_cue_seq: 0,
      detail: {
        teams: { teamA: state.teams.teamA || "Drużyna A", teamB: state.teams.teamB || "Drużyna B" },
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
        display: { mode: "GAME", colors: d.colors, theme: d.theme, logoId: d.logoId, qr: { host: { show: false }, buzzer: { show: false } } },
        host: { covered: false },
        locks: { gameEnded: false },
      },
    };
  }

  function renderSetupFinish(state, ctx = {}) {
    clear();
    const s = state.settings;
    const d = state.display;
    const hasFinal = s.hasFinal === true;

    const previewSrc = ctx.urls?.displayUrl
      ? `${ctx.urls.displayUrl}${ctx.urls.displayUrl.includes("?") ? "&" : "?"}preview=1`
      : null;
    const previewFrame = previewSrc ? h("iframe", { src: previewSrc, title: "Podgląd wyświetlacza" }) : null;
    if (previewFrame) {
      window.addEventListener("message", function onReady(e) {
        if (e.data?.type !== "familiada:preview-ready" || e.source !== previewFrame.contentWindow) return;
        window.removeEventListener("message", onReady);
        previewFrame.contentWindow.postMessage({ type: "familiada:preview-row", row: buildPreviewRow(state) }, "*");
      });
    }

    const sections = [
      summarySection("Drużyny", h("div", { class: "summarySectionValue", text: `${state.teams.teamA || "Drużyna A"} vs ${state.teams.teamB || "Drużyna B"}` })),
      summarySection("Wygląd", h("div", { class: "summaryDisplayInfo" }, [
        h("div", { class: "summaryDisplayRow" }, [h("span", { class: "summaryDisplayLabel", text: "Kolory: " }), colorDots(d.colors)]),
        h("div", { class: "summaryDisplayRow" }, [h("span", { class: "summaryDisplayLabel", text: "Motyw: " }), document.createTextNode(d.theme || "domyślny")]),
        h("div", { class: "summaryDisplayRow" }, [h("span", { class: "summaryDisplayLabel", text: "Logo: " }), document.createTextNode(d.logoId ? "niestandardowe" : "domyślne")]),
        h("div", { id: "c2DisplayPreview" }, previewFrame ? [previewFrame] : []),
      ])),
      summarySection("Finał", h("div", { class: "summarySectionValue", text: hasFinal ? "Tak" : "Nie" })),
    ];
    sections.push(summarySection("Pytania rund", h("div", { class: "summaryQMode", text:
      s.roundsQuestionsMode === "pick" ? `Ustalona kolejność (${s.roundsPicked?.length || 0})` : "Losowo" })));
    if (hasFinal) {
      sections.push(summarySection("Pytania finału", h("div", { class: "summaryQMode", text:
        s.finalQuestionsMode === "pick" ? `Wybrane ręcznie (${state.final.picked?.length || 0}/5)` : "Losowo" })));
    }

    const reshuffleBtns = [];
    if (s.roundsQuestionsMode !== "pick") {
      reshuffleBtns.push(h("button", { class: "btn sm", type: "button", onclick: () => emit("setup.reshuffleRounds") }, [document.createTextNode("Losuj ponownie pytania rund")]));
    }
    if (hasFinal && s.finalQuestionsMode !== "pick") {
      reshuffleBtns.push(h("button", { class: "btn sm", type: "button", onclick: () => emit("setup.reshuffleFinal") }, [document.createTextNode("Losuj ponownie pytania finału")]));
    }

    const finalIncomplete = hasFinal && s.finalQuestionsMode === "pick" && (state.final.picked?.length !== 5 || !state.final.confirmed);
    const start = h("button", {
      class: "btn gold", type: "button",
      disabled: finalIncomplete ? "" : undefined,
      onclick: () => emit("setup.start"),
    }, [document.createTextNode("Gotowe — przejdź do rund")]);
    const changeSettings = h("button", { class: "btn sm", type: "button", onclick: () => emit("setup.openSettings") }, [document.createTextNode("Zmień ustawienia")]);

    // Płasko, tak jak renderDevicesStep — jedno .cardBody na root, BEZ
    // zagnieżdżonego wewnątrz .card (to była druga, zbędna warstwa: root
    // już siedzi w .control-main-card, które jest jedynym widocznym
    // obramowaniem).
    const body = [
      h("div", { class: "stepTitle", text: "Podsumowanie" }),
      h("div", { class: "c2-stepper", text: "Podsumowanie" }),
      ...sections,
      h("div", { class: "stepFoot" }, [
        h("div", { class: "stepFootButtons" }, [changeSettings, ...reshuffleBtns, start]),
        finalIncomplete ? h("div", { class: "msg msg-pill", text: "Finał ustawiony na \"wybrane ręcznie\", ale nie wybrano 5 pytań w ustawieniach gry." }) : null,
      ]),
    ];

    root.appendChild(h("div", { class: "cardBody" }, body));
  }

  // ============================================================
  // Wspólny szablon 3 głównych ekranów rozgrywki (sekcja 3b):
  // jedna karta, mały stepper na górze, treść na środku, nawigacja na dole.
  // ============================================================
  function gameplayShell({ stepLabel, body, nav }) {
    clear();
    // .c2-gameplay-card (720px, wyśrodkowane) tylko TU — na WŁASNYM
    // kontenerze tego szablonu, nie na #app. Urządzenia/Podsumowanie mają
    // zostać na pełną szerokość (patrz control2.html) — tylko te trzy
    // przeprojektowane ekrany rozgrywki mają być węższe (plan, sekcja 3b).
    root.appendChild(h("div", { class: "c2-card-inner c2-gameplay c2-gameplay-card" }, [
      h("div", { class: "c2-stepper", text: stepLabel }),
      h("div", { class: "c2-gameplay-body" }, body),
      nav ? h("div", { class: "c2-gameplay-nav" }, nav) : null,
    ]));
  }

  // ============================================================
  // Siatka 3x5 współdzielona przez Rundy-odsłanianie i Finał-odsłanianie —
  // ustalona wspólnie z właścicielem projektu: jednostka to 1/3 szerokości
  // wiersza, niektóre kafle zajmują 1,5 jednostki (pół wiersza). Wewnętrznie
  // 6 kolumn (LCD z 2 i 3), żeby obie szerokości wyrazić całkowitym `span`.
  // Wiersz 4 zostaje pusty, chyba że akurat trzeba w nim pokazać coś
  // rzadkiego (Pass/Kradzież) — nieużywane kafle po prostu nie istnieją w
  // DOM, więc rytm 5 wierszy się nie rusza niezależnie od tego, co akurat
  // jest dostępne.
  const THIRD = (i) => `${i * 2 + 1} / ${i * 2 + 3}`; // i=0,1,2 — 1 jednostka
  const HALF = (i) => `${i * 3 + 1} / ${i * 3 + 4}`;  // i=0,1   — 1,5 jednostki

  function tile(content, { row, col, cls = "", onclick, disabled = false } = {}) {
    const el = h("button", {
      class: `c2-tile ${cls}`.trim(),
      type: "button",
      onclick: disabled ? undefined : onclick,
    }, [typeof content === "string" ? document.createTextNode(content) : content]);
    el.style.gridRow = String(row);
    el.style.gridColumn = col;
    if (disabled) el.disabled = true;
    return el;
  }

  function tileGrid(tiles) {
    return h("div", { class: "c2-tilegrid" }, tiles.filter(Boolean));
  }

  // Wariant tile() z zaznacz → potwierdź (patrz armedKey wyżej): pierwsze
  // kliknięcie tylko uzbraja (dopisuje c2-tile-armed, złota obwódka w CSS),
  // drugie na tym samym kaflu odpala prawdziwe onclick.
  function armableTile(key, content, { onclick, disabled, cls = "", ...rest }) {
    const armed = !disabled && armedKey === key;
    return tile(content, {
      ...rest,
      disabled,
      cls: `${cls} ${armed ? "c2-tile-armed" : ""}`.trim(),
      onclick: disabled ? undefined : () => {
        if (armedKey === key) {
          armedKey = null;
          onclick();
        } else {
          armedKey = key;
          emit("ui.rerender");
        }
      },
    });
  }

  // Blok podpowiedzi — zawsze bezpośrednio NAD siatką/wierszami wpisywania,
  // dokładnie jak stary control/js/gameRounds.js's msgDuel/msgRoundsPlay/
  // msgSteal itd. Pusty tekst = nic nie renderujemy (nie zostawiamy pustego
  // paska).
  function hintBlock(text) {
    return text ? h("div", { class: "c2-hint", text }) : null;
  }

  // r_duel PRZED przyjęciem zgłoszenia — patrz komentarz przy jego jedynym
  // wywołaniu w renderRounds(). Odpowiednik starego control.html's osobnego
  // data-step="r_duel": brak pytania/siatki, tylko "kto naciśnie pierwszy".
  // Ten sam wspólny szablon co reszta Rund — TA SAMA siatka 6-kolumnowa
  // (tile/tileGrid) i ten sam c2-roundlayout (siatka + kreska + hint po
  // prawej), tylko zamiast odpowiedzi w kaflach siedzą przyciski
  // zatwierdzania: 2 przyciski = jeden rząd (HALF+HALF), 3 przyciski = dwa
  // w jednym rzędzie + jeden na całą szerokość w drugim (jak "Oddaj
  // kontrolę"). Nieaktywny kafel korzysta z tego samego :disabled co reszta
  // siatki (wyszarzony, nieklikalny placeholder) — nic tu nie jest osobnym,
  // bespoke komponentem.
  function renderDuelAccept(state) {
    const r = state.rounds;
    const tiles = [];

    if (state.settings.physicalBuzzer === true) {
      // Brak Buzzera na ekranie — operator sam wskazuje, kto pierwszy
      // nacisnął fizyczny przycisk. Zaznacz → potwierdź, żeby nie zaliczyć
      // przypadkowego kliknięcia (plan: "physicalSelectTeam→potwierdź").
      if (!pendingPhysicalTeam) {
        tiles.push(tile(teamName(state, "A"), { row: 1, col: HALF(0), onclick: () => { pendingPhysicalTeam = "A"; emit("ui.rerender"); } }));
        tiles.push(tile(teamName(state, "B"), { row: 1, col: HALF(1), onclick: () => { pendingPhysicalTeam = "B"; emit("ui.rerender"); } }));
      } else {
        tiles.push(tile(`Potwierdź: ${teamName(state, pendingPhysicalTeam)}`, {
          row: 1, col: HALF(0), cls: "c2-tile-primary",
          onclick: () => { const t = pendingPhysicalTeam; pendingPhysicalTeam = null; emit("game.dispatch", { type: "ACCEPT_BUZZ", team: t }); },
        }));
        tiles.push(tile("Anuluj", { row: 1, col: HALF(1), onclick: () => { pendingPhysicalTeam = null; emit("ui.rerender"); } }));
      }
    } else {
      // Tryb normalny (Buzzer): obie drużyny widoczne od razu, ale tylko
      // ta, która faktycznie nacisnęła (duel.lastPressed), jest klikalna —
      // druga zostaje wyszarzonym, nieklikalnym placeholderem, dokładnie jak
      // stary control.html's btnBuzzAcceptA/B. "Ponów naciśnięcie" (nowe
      // RETRY_DUEL) pojawia się dopiero, gdy jest co odrzucić.
      const lastPressed = r.duel.lastPressed;
      tiles.push(tile(`Zatwierdź: ${teamName(state, "A")}`, {
        row: 1, col: HALF(0), cls: lastPressed === "A" ? "c2-tile-primary" : "",
        disabled: lastPressed !== "A",
        onclick: () => emit("game.dispatch", { type: "ACCEPT_BUZZ", team: "A" }),
      }));
      tiles.push(tile(`Zatwierdź: ${teamName(state, "B")}`, {
        row: 1, col: HALF(1), cls: lastPressed === "B" ? "c2-tile-primary" : "",
        disabled: lastPressed !== "B",
        onclick: () => emit("game.dispatch", { type: "ACCEPT_BUZZ", team: "B" }),
      }));
      if (lastPressed) {
        tiles.push(tile("Ponów naciśnięcie", { row: 2, col: "1 / 7", onclick: () => emit("game.dispatch", { type: "RETRY_DUEL" }) }));
      }
    }

    const body = [h("div", { class: "c2-roundlayout" }, [
      h("div", { class: "c2-roundlayout-main" }, [tileGrid(tiles)]),
      h("div", { class: "c2-roundlayout-divider" }),
      h("div", { class: "c2-roundlayout-side" }, [hintBlock(getRoundsHint(state))]),
    ])];

    gameplayShell({ stepLabel: `Runda ${r.roundNo} — pojedynek`, body, nav: null });
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

    // r_duel PRZED przyjęciem zgłoszenia (r.duel.firstTeam jeszcze puste) —
    // osobny, mniejszy ekran: nic z pytania/siatki/X/timera nie jest jeszcze
    // grywalne (nikt nie wygrał prawa do odpowiedzi), więc nie pokazujemy
    // tego wcale, dokładnie jak stary control.html's osobny
    // data-step="r_duel" (sama "Zatwierdź drużynę A/B"+"Ponów naciśnięcie",
    // bez treści pytania) — patrz renderDuelAccept().
    if (state.phase === "DUEL" && !r.duel.firstTeam) {
      return renderDuelAccept(state);
    }
    if (pendingPhysicalTeam) {
      pendingPhysicalTeam = null; // faza się zmieniła spod nas — porzuć nieaktualne zaznaczenie
    }

    // r_play / dalsza część DUEL po przyjęciu zgłoszenia (wspólny ekran gry
    // właściwej — drużyna, która wygrała pojedynek, odpowiada na TĘ SAMĄ
    // widoczną siatkę). Układ: pytanie na górze; poniżej dwie kolumny —
    // siatka odpowiedzi (lewo) i podpowiedź za pionową kreską (prawo); pod
    // tym pasek statusu (kto gra, bank, inne info); na samym dole przyciski
    // nawigacji ("Zakończ rundę" — gameplayShell's nav, jak Finał).
    const body = [];
    body.push(h("div", { class: "c2-question", text: r.question?.text || "—" }));

    // Raz osiągnięte canEndRound (wszystko odsłonięte albo kradzież już
    // rozstrzygnięta) nie ma już nic do pudłowania/odmierzania — X i zegarek
    // znikają razem, zostaje tylko "Zakończ rundę" w nav na dole.
    const xAvailable = ((state.phase === "DUEL" && r.duel.firstTeam) || state.phase === "PLAY" || state.phase === "STEAL")
      && !r.canEndRound && !r.lockPlayControls;
    const passAvailable = state.phase === "PLAY" && r.allowPass && !r.passUsed;

    // Uzbrojony kafel z poprzedniego renderu mógł przestać być prawdziwy
    // (odpowiedź już odsłonięta gdzie indziej, runda się skończyła...) —
    // walidacja przy każdym renderze, żeby złota obwódka nigdy nie została
    // "zawieszona" na czymś nieaktualnym.
    if (armedKey) {
      const validAnswerArm = armedKey.startsWith("ans:") && !r.revealed.includes(Number(armedKey.slice(4)));
      const validPassArm = armedKey === "pass" && passAvailable;
      const validXArm = armedKey === "x" && xAvailable;
      if (!validAnswerArm && !validPassArm && !validXArm) armedKey = null;
    }

    // Siatka 3x5: wiersze 1-3 to do 6 odpowiedzi (2 na wiersz, 1,5 jednostki
    // szerokości) — TREŚĆ i PUNKTY widoczne zawsze (operator musi wiedzieć,
    // co klika i ile to warte, zanim jeszcze odsłoni), po odsłonięciu zmienia
    // się tylko KOLOR/styl kafla (zielony), nie treść. Wiersz 4: "Oddaj
    // kontrolę" (dawny Pass) — jedyny kafel w tym wierszu, widoczny tylko
    // dopóki dostępny. Wiersz 5: X (z licznikiem pudeł na przycisku) /
    // przycisk zegarka 3s, po 1,5 jednostki szerokości każdy — osobny kafel
    // licznika zniknął, bo liczba pudeł mieści się w etykiecie samego X.
    // Odpowiedź/X/Oddaj kontrolę idą przez armableTile (zaznacz → potwierdź,
    // sekcja 3a pkt 7) — to jedyne trzy kafle, które realnie zmieniają
    // wynik/przebieg rundy, więc każdy dostaje ten sam bufor przeciwko
    // przypadkowemu kliknięciu na żywej transmisji.
    const tiles = [];
    const sortedAnswers = r.answers.slice().sort((a, b) => a.ord - b.ord).slice(0, 6);
    sortedAnswers.forEach((a, i) => {
      const revealed = r.revealed.includes(a.ord);
      tiles.push(armableTile(`ans:${a.ord}`, `${a.text} — ${a.fixed_points}`, {
        row: Math.floor(i / 2) + 1,
        col: HALF(i % 2),
        cls: revealed ? "c2-tile-revealed" : "",
        disabled: revealed,
        onclick: () => emit("game.dispatch", { type: state.phase === "REVEAL" ? "REVEAL_LEFT" : "REVEAL_ANSWER", ord: a.ord }),
      }));
    });

    if (passAvailable) {
      tiles.push(armableTile("pass", "Oddaj kontrolę", {
        row: 4, col: "1 / 7", cls: "c2-tile-primary",
        onclick: () => emit("game.dispatch", { type: "PASS" }),
      }));
    }

    const timer3 = r.timer3;
    const timer3Available = xAvailable;
    if (xAvailable) {
      // Licznik na X ma sens TYLKO w zwykłym PLAY (buduje się do 3, po
      // trzecim aut. STEAL) — w DUEL i w samej kradzieży to zawsze
      // pojedyncza próba, xA/xB drużyny grającej nie ma tam nic do rzeczy.
      const strikes = state.phase === "PLAY" && state.controlTeam
        ? (state.controlTeam === "A" ? r.xA : r.xB)
        : null;
      const xLabel = strikes == null ? "X" : h("div", {}, [
        document.createTextNode("X"),
        // aria-hidden: licznik jest czysto wizualny, żeby dostępna nazwa
        // przycisku ("X") zostawała stała między kliknięciami — inaczej
        // testy/czytniki ekranu widziałyby za każdym razem inny label.
        h("div", { class: "c2-tile-sub", "aria-hidden": "true", text: `${strikes} / 3` }),
      ]);
      tiles.push(armableTile("x", xLabel, { row: 5, col: HALF(0), cls: "c2-tile-danger", onclick: () => emit("game.dispatch", { type: "ADD_X" }) }));
    }
    if (timer3Available) {
      const running = !!timer3?.running;
      const secLeft = running ? Math.max(0, Math.ceil((timer3.endsAt - Date.now()) / 1000)) : null;
      tiles.push(tile(running ? String(secLeft) : "Timer 3s", {
        row: 5, col: HALF(1),
        cls: running ? "c2-tile-timer" : "c2-tile-timer startable",
        disabled: running,
        onclick: running ? undefined : () => emit("game.dispatch", { type: "START_TIMER3" }),
      }));
    }

    body.push(h("div", { class: "c2-roundlayout" }, [
      h("div", { class: "c2-roundlayout-main" }, [tileGrid(tiles)]),
      h("div", { class: "c2-roundlayout-divider" }),
      h("div", { class: "c2-roundlayout-side" }, [hintBlock(getRoundsHint(state))]),
    ]));

    // Pasek statusu — kto gra, bank, status kradzieży. Bank żył wcześniej
    // DWA razy (nad siatką i w nagłówku kroku) — teraz wyłącznie tu.
    // "Gra:" zamiast "Kontrolę ma:" — od momentu przyjęcia zgłoszenia w
    // pojedynku (jeszcze przed formalnym controlTeam z PLAY) ktoś już
    // faktycznie odpowiada, więc dawna nazwa myliła: sugerowała, że w
    // DUEL nikt nie ma "kontroli", a jednak ktoś zawsze wtedy gra.
    const activeTeam = state.controlTeam || (state.phase === "DUEL" ? r.duel.currentTeam : null);
    const statusItems = [
      h("span", {}, [document.createTextNode("Gra: "), h("b", { text: activeTeam ? teamName(state, activeTeam) : "—" })]),
      h("span", {}, [document.createTextNode("Bank: "), h("b", { text: String(r.bankPts) })]),
    ];
    if (state.phase === "STEAL" && r.steal.active) {
      statusItems.push(h("span", {}, [document.createTextNode("Kradzież: "), h("b", { text: r.steal.team ? teamName(state, r.steal.team) : "—" })]));
    }
    body.push(h("div", { class: "c2-statusbar" }, statusItems));

    // Nav na dole (jak Finał) — tylko "Zakończ rundę" ("Oddaj kontrolę"
    // przeniesione do pustego wiersza 4 siatki, patrz wyżej).
    // justify-content:flex-end w .c2-gameplay-nav ustawia go po prawej.
    const nav = [];
    if ((state.phase === "PLAY" || state.phase === "STEAL") && r.canEndRound) {
      nav.push(h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "END_ROUND" }) }, [document.createTextNode("Zakończ rundę")]));
    }

    gameplayShell({ stepLabel: `Runda ${r.roundNo}`, body, nav: nav.length ? nav : null });
  }

  function renderGameEnd(state) {
    gameplayShell({
      stepLabel: "Koniec gry",
      body: [h("p", { text: `Wynik końcowy: A ${state.rounds.totals.A} — B ${state.rounds.totals.B}` })],
      nav: [
        state.locks.gameEnded
          ? h("button", { class: "c2-btn primary", onclick: () => emit("session.finish") }, [document.createTextNode("Zakończ rozgrywkę")])
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

  // Ta sama rytmika 5 wierszy co siatka odsłaniania (jeden wiersz na
  // pytanie), ale podział W POZIOMIE inny — treść pytania | pole tekstowe |
  // (runda 2) checkbox powtórzenia — zamiast kafli-przycisków, bo tu treścią
  // jest wpisywanie, nie wybór z listy. "Jednolity styl" z resztą: te same
  // tokeny koloru/obramowania/zaokrąglenia co .c2-tile.
  function renderFinalEntry(state, round) {
    const f = state.final;
    const key = round === 1 ? "p1" : "p2";
    const rows = [];
    for (let i = 0; i < 5; i++) {
      const row = f.runtime[key][i] || {};
      const question = f.questions?.[i];
      const inp = h("input", { type: "text", value: row.text || "", placeholder: "Odpowiedź gracza" });
      on(inp, "input", () => emit("game.dispatch", { type: "SET_ENTRY_TEXT", round, idx: i, text: inp.value }));
      const rowChildren = [
        h("div", { class: "c2-entryrow-q", text: question?.text || `Pytanie ${i + 1}` }),
        h("div", { class: "c2-entryrow-input" }, [inp]),
      ];
      if (round === 2) {
        const repeatChk = h("input", { type: "checkbox" });
        repeatChk.checked = !!row.repeat;
        on(repeatChk, "change", () => emit("game.dispatch", { type: "SET_REPEAT", round: 2, idx: i, repeat: repeatChk.checked }));
        rowChildren.push(h("label", { class: "c2-repeat-label" }, [repeatChk, document.createTextNode(" powtórzenie")]));
      }
      rows.push(h("div", { class: "c2-entryrow" }, rowChildren));
    }
    const body = [hintBlock(getFinalHint(state)), h("div", { class: "c2-entryrows" }, rows)];

    const timerRunning = f.runtime.timer.running;
    // Zegarek jest jednorazowy (engine.js's START_TIMER, usedP1/usedP2) —
    // przycisk zostaje widoczny po naturalnym wygaśnięciu (tak jak w starym
    // Control, setTimerBtnEnabled(phase,false)), ale zablokowany, zamiast
    // dawać złudzenie, że można go kliknąć drugi raz.
    const used = round === 1 ? f.runtime.timer.usedP1 : f.runtime.timer.usedP2;
    const nav = [
      !timerRunning ? h("button", {
        class: "c2-btn",
        disabled: used ? "" : undefined,
        onclick: used ? undefined : () => emit("game.dispatch", { type: "START_TIMER", phase: round === 1 ? "P1" : "P2" }),
      }, [document.createTextNode("Start timera")]) : null,
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

  // Ta sama siatka 3x5 co Rundy-odsłanianie (ustalone z właścicielem
  // projektu): wiersze 1-3 to kafle odpowiedzi + "Brak dopasowania" (do 6,
  // 2 na wiersz), wiersz 4 zostaje pusty, wiersz 5 to "Pokaż odpowiedź"
  // (lewo) / "Pokaż punkty" (prawo, zmienia się w "Dalej" po odsłonięciu
  // punktów) — środek pusty.
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
      h("div", { class: "c2-bank", text: `Odpowiedź gracza: ${inputText || "—"} · Pokazana: ${row.revealedAnswer ? row.outText : "—ukryte—"} · Punkty: ${row.revealedPoints ? row.pts : "—"}` }),
    ];

    const options = (question?.answers || []).map((a) => ({
      key: a.id,
      text: `${a.text} (${a.fixed_points})`,
      active: row.kind === "MATCH" && row.matchId === a.id,
      onclick: () => emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, mode: "MANUAL", kind: "MATCH", matchId: a.id, outText: a.text, pts: a.fixed_points }),
    }));
    options.push({
      key: "__miss__",
      text: "Brak dopasowania",
      active: row.kind === "MISS",
      onclick: () => emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, mode: "MANUAL", kind: "MISS", matchId: null, outText: inputText, pts: 0 }),
    });

    const tiles = options.slice(0, 6).map((o, i) => tile(o.text, {
      row: Math.floor(i / 2) + 1,
      col: HALF(i % 2),
      cls: o.active ? "c2-tile-revealed" : "",
      disabled: locked,
      onclick: o.onclick,
    }));

    if (!row.revealedAnswer) {
      tiles.push(tile("Pokaż odpowiedź", {
        row: 5, col: THIRD(0), cls: "c2-tile-primary",
        onclick: async () => {
          if (row.kind == null) await emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, ...defaultResolve(inputText) });
          await emit("game.dispatch", { type: "REVEAL_ANSWER_ONLY", round, idx });
        },
      }));
    } else if (!row.revealedPoints) {
      tiles.push(tile("Pokaż punkty", { row: 5, col: THIRD(2), cls: "c2-tile-primary", onclick: () => emit("game.dispatch", { type: "REVEAL_POINTS", round, idx }) }));
    } else {
      // NEXT_QUESTION's `idx` to 1-bazowy numer PYTANIA, z którego schodzimy
      // (nextIdx = action.idx+1 w engine.js) — nie 0-bazowy indeks tablicy,
      // którym operuje reszta tego ekranu. Bez +1 operator zostawałby
      // uwięziony na tym samym pytaniu (nextIdx trafiałby z powrotem w ten
      // sam krok).
      tiles.push(tile("Dalej", { row: 5, col: THIRD(2), cls: "c2-tile-primary", onclick: () => emit("game.dispatch", { type: "NEXT_QUESTION", round, idx: idx + 1 }) }));
    }
    body.push(hintBlock(getFinalHint(state)));
    body.push(tileGrid(tiles));

    gameplayShell({ stepLabel: `Finał — mapowanie ${idx + 1}/5`, body, nav: null });
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
          ? h("button", { class: "c2-btn primary", onclick: () => emit("session.finish") }, [document.createTextNode("Zakończ rozgrywkę")])
          : h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "FINISH_FINAL" }) }, [document.createTextNode("Zakończ")]),
      ],
    });
  }

  function render(state, ctx = {}) {
    updateTopbarDots(ctx.presenceFlags);
    const s = state.step;
    if (s === "devices_display") return renderDevicesStep(state, ctx);
    if (s === "setup_finish") return renderSetupFinish(state, ctx);
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
