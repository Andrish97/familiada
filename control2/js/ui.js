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
import { getRoundsHint, getFinalHint, getFinalEntryShortcuts, teamName } from "../../shared/hints.js?v=v2026-09-10T18284";
import { t } from "../../translation/translation.js?v=v2026-09-10T18284";
import { getSfxDuration } from "../../js/core/sfx.js?v=v2026-09-10T18284";
import { ANSWER_ANIM } from "../../shared/displayAnim.js?v=v2026-09-10T18284";
import {
  startRoundGateMs,
  endRoundGateMs,
  startFinalGateMs,
  gameEndGateMs,
  finishFinalGateMs,
} from "./transitionGate.js?v=v2026-09-10T18284";
import { buildDisplayPreviewRow } from "../../shared/previewRow.js?v=v2026-09-10T18284";

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

  // Blokada odsłaniania na czas TRWANIA DŁUŻSZEGO z dwóch: animacji
  // Wyświetlacza albo dźwięku (poprawka zgłoszona po pierwszej wersji:
  // "czasem dźwięk jest krótszy niż animacja, trzeba wybierać do dłuższe" —
  // sam dźwięk to za mało, bo animacja na Wyświetlaczu czasem trwa dłużej
  // niż próbka audio). Czas animacji NIE jest tu zgadywany osobno — to
  // dokładnie ten sam ANSWER_ANIM.ms co display2/js/render.js faktycznie
  // odtwarza dla ANSWER_REVEALED/FINAL_ANSWER_REVEALED/
  // FINAL_POINTS_REVEALED (import z shared/displayAnim.js, jedno źródło
  // prawdy dla obu plików — jeśli ten czas się kiedyś zmieni, zmienia się
  // tu automatycznie razem z Wyświetlaczem, bez ręcznego przepisywania).
  // Ustawiana w momencie WYSŁANIA akcji odsłaniającej (nie w momencie
  // kliknięcia — armowanie samo w sobie nic nie odsłania), blokuje WSZYSTKIE
  // kafle odsłaniania (nie tylko ten właśnie kliknięty), dopóki dłuższe z
  // tych dwóch nie dobiegnie końca — także w Finale (Pokaż odpowiedź/Pokaż
  // punkty). Każdy wywołujący przekazuje dokładny klucz dźwięku, który
  // faktycznie poleci dla TEJ akcji (np. "answer_correct" dla odsłonięcia
  // odpowiedzi w Rundach, "reveal" dla Finału's "Pokaż odpowiedź") — patrz
  // engine.js's soundCueKey per reducer.
  let revealLockedUntil = 0;
  function armRevealCooldown(soundKey) {
    const applyLock = (ms) => {
      const floored = Math.max(ms, ANSWER_ANIM.ms);
      revealLockedUntil = Date.now() + floored;
      setTimeout(() => emit("ui.rerender"), floored + 20);
    };
    // Zanim poznamy realny czas trwania dźwięku (metadane audio mogą nie
    // być jeszcze wczytane), blokujemy co najmniej na czas animacji —
    // nigdy krócej, więc nie ma okna bez blokady.
    applyLock(ANSWER_ANIM.ms);
    if (soundKey) {
      getSfxDuration(soundKey).then((durationS) => {
        if (durationS > 0) applyLock(Math.round(durationS * 1000));
      });
    }
  }
  // Blokada DUŻYCH przejść planszy (Rozpocznij rundę/Zakończ rundę/
  // Rozpocznij finał/Zakończ grę — oba warianty) — zgłoszone: "nagranie
  // dalej jest zbyt szybkie", zbadane wprost w starym Control
  // (control/js/gameRounds.js/gameFinal.js): każde z tych pięciu miejsc
  // dosłownie `await`-owało czas realnego dźwięku (nie zgadywaną stałą
  // animacji) przed odblokowaniem KOLEJNEGO ekranu (enableBuzzerDuel()/
  // setStep()/sessionEnd() itd.) — wizualna sekwencja startowała z osobnym,
  // stałym offsetem w głąb tego samego dźwięku (920ms/1000ms), a sam dźwięk
  // był tak dobrany, żeby zdążyć zanim animacja się skończy. Dokładne wzory
  // per przejście — patrz control2/js/transitionGate.js (1:1 z tym, co
  // stary kod faktycznie liczył przez getSfxDuration(), nie zgadywane).
  // Współdzieli licznik z armRevealCooldown() — to ten sam rodzaj blokady
  // ("nie idź dalej, dopóki poprzednie się nie domalowało/dograło"), tylko
  // innej skali; oba warianty nigdy nie są uzbrajane jednocześnie (operator
  // klika jedno na raz), więc wspólny stan jest bezpieczny.
  function armBoardTransition(gateMsPromise) {
    const applyLock = (ms) => {
      revealLockedUntil = Date.now() + ms;
      setTimeout(() => emit("ui.rerender"), ms + 20);
    };
    // Krótki, bezpieczny floor zanim poznamy realny czas (identyczny wzorzec
    // co armRevealCooldown) — same funkcje gate w transitionGate.js już
    // liczą właściwy dolny próg (np. Math.max(...,2)*1000), więc to tylko
    // zabezpieczenie na czas oczekiwania na odpowiedź getSfxDuration().
    applyLock(1500);
    gateMsPromise.then((ms) => { if (ms > 0) applyLock(ms); });
  }
  function boardBusy() {
    return revealLocked();
  }
  function revealLocked() {
    return Date.now() < revealLockedUntil;
  }

  // Statusy urządzeń w TOPBARZE (poza #app, statyczne w control2.html) —
  // dokładnie jak dzisiejsze control/js/ui.js's setDeviceBadges: aktualizacja
  // imperatywna przy każdym renderze, nie przebudowa DOM.
  //
  // Zgłoszone: przycisk nieaktywnego urządzenia (noHostTablet/physicalBuzzer)
  // ma zniknąć CAŁKOWICIE, nie tylko przygasnąć jak dawne .opted-out w
  // control/js/app.js (opacity:.3 + pointer-events:none — kropka wciąż tam
  // była, tylko nieklikalna). Tu cały wiersz (#dotHostRow/#dotBuzzerRow)
  // dostaje .hidden (display:none, css/base.css) — reaguje natychmiast, gdy
  // operator zaznaczy checkbox na kroku Urządzeń (ten sam render() na każdą
  // zmianę stanu), więc do kroku Podsumowania wiersz jest już niewidoczny, i
  // zostaje tak przez resztę gry (ten sam warunek co blokada "Dalej" w
  // renderDevicesStep — state.settings.noHostTablet/physicalBuzzer).
  function updateTopbarDots(state, presenceFlags = {}) {
    const skip = { display: false, host: !!state.settings.noHostTablet, buzzer: !!state.settings.physicalBuzzer };
    for (const kind of ["display", "host", "buzzer"]) {
      const dot = $(`dot${kind[0].toUpperCase()}${kind.slice(1)}`);
      if (dot) dot.className = `dot ${presenceFlags[kind] ? "ok" : "bad"}`;
      const row = $(`dot${kind[0].toUpperCase()}${kind.slice(1)}Row`);
      if (row) row.classList.toggle("hidden", skip[kind]);
    }
  }

  // ============================================================
  // D0/D1: parowanie urządzeń — struktura/klasy jak dzisiejsze control.html
  // (device-row/device-row-1/device-row-2/device-row-opt/badge), żeby
  // reużyć control.css один do jednego zamiast osobnego, uproszczonego stylu.
  // ============================================================
  function renderDevicesStep(state, ctx) {
    clear();
    const { urls, presenceFlags = {}, connectCodes = {}, shareBadges = {} } = ctx;

    const deviceRow = (label, kind, url, { withQr = false } = {}) => {
      const online = !!presenceFlags[kind];
      const code = connectCodes[kind];
      const row2 = [
        h("div", { class: "device-connect-code" }, [h("span", { class: "device-connect-code-val", text: code || "——————" })]),
        h("button", { class: "btn gold", type: "button", onclick: () => emit("devices.copyCode", kind) }, [document.createTextNode(t("common.copy"))]),
      ];
      if (withQr) {
        const shown = !!state.display.qr[kind].show;
        row2.push(h("button", { class: "btn", type: "button", onclick: () => emit("qr.modal.show", kind) }, [document.createTextNode(t("control.qrCodeBtn"))]));
        row2.push(h("button", {
          class: `btn ${shown ? "primary" : ""}`, type: "button",
          onclick: () => emit(kind === "host" ? "qr.host.toggle" : "qr.buzzer.toggle"),
        }, [document.createTextNode(shown ? t("control.qrHide") : t("control.qrOnDisplayToggle"))]));
      } else {
        // "Otwórz" ma sens WYŁĄCZNIE dla Wyświetlacza — Prowadzący/Przycisk
        // otwiera się na CUDZYM urządzeniu (tablet/telefon), nie w karcie
        // operatora, więc stare Control (control.html) nigdy nie dawało im
        // tego przycisku (patrz device-row markup: btnOpenDisplay istnieje,
        // analogów dla host/buzzer nie ma).
        row2.push(h("a", { class: "btn", href: url, target: "_blank", rel: "noopener" }, [document.createTextNode(t("common.open"))]));
      }
      const shared = !!shareBadges[kind];
      row2.push(h("button", {
        class: `btn ${shared ? "has-badge" : ""}`.trim(), type: "button",
        onclick: () => emit("devices.shareOpen", kind),
      }, [
        document.createTextNode(t("control.shareDevice")),
        h("span", { class: "badge", "aria-hidden": "true", text: shared ? "1" : "" }),
      ]));
      return h("div", { class: "device-row", "data-device": kind }, [
        h("div", { class: "device-row-1" }, [
          h("div", { class: "device-name", text: label }),
          h("div", { class: `badge ${online ? "ok" : "bad"}`, text: online ? t("control.deviceStatusOk") : t("control.deviceStatusOffline") }),
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
    const rows = [deviceRow(t("control.deviceDisplay"), "display", urls.displayUrl)];

    if (!state.settings.noHostTablet) {
      const hostRow = deviceRow(t("control.deviceHost"), "host", urls.hostUrl, { withQr: true });
      const noHostChk = h("input", { type: "checkbox" });
      on(noHostChk, "change", () => emit("devices.noHostTablet", noHostChk.checked));
      hostRow.appendChild(h("div", { class: "device-row-opt" }, [
        h("label", { class: "device-opt-check" }, [noHostChk, h("div", { class: "device-opt-check-text" }, [
          h("span", { class: "device-opt-check-label", text: t("control.noHostTablet") }),
          h("span", { class: "device-opt-check-hint", text: t("control.noHostTabletHint") }),
        ])]),
      ]));
      rows.push(hostRow);
    } else {
      rows.push(h("div", { class: "device-row" }, [reenableRow(t("control.deviceHost"), "noHostTablet")]));
    }

    if (!state.settings.physicalBuzzer) {
      const buzzerRow = deviceRow(t("control.deviceBuzzer"), "buzzer", urls.buzzerUrl, { withQr: true });
      const physBuzzChk = h("input", { type: "checkbox" });
      on(physBuzzChk, "change", () => emit("devices.physicalBuzzer", physBuzzChk.checked));
      buzzerRow.appendChild(h("div", { class: "device-row-opt" }, [
        h("label", { class: "device-opt-check" }, [physBuzzChk, h("div", { class: "device-opt-check-text" }, [
          h("span", { class: "device-opt-check-label", text: t("control.physicalBuzzer") }),
          h("span", { class: "device-opt-check-hint", text: t("control.physicalBuzzerHint") }),
        ])]),
      ]));
      rows.push(buzzerRow);
    } else {
      rows.push(h("div", { class: "device-row" }, [reenableRow(t("control.deviceBuzzer"), "physicalBuzzer")]));
    }

    function reenableRow(label, flagKey) {
      const chk = h("input", { type: "checkbox" });
      chk.checked = true;
      on(chk, "change", () => emit(flagKey === "noHostTablet" ? "devices.noHostTablet" : "devices.physicalBuzzer", chk.checked));
      return h("label", { class: "device-opt-check" }, [chk, h("div", { class: "device-opt-check-text" }, [
        h("span", { class: "device-opt-check-label", text: t("control.deviceSkippedLabel", { label }) }),
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
    }, [document.createTextNode(t("common.next"))]);

    root.appendChild(h("div", { class: "cardBody" }, [
      // .stepTitle zostaje (niewidoczny, display:none w control.css — testy
      // E2E celują w niego jako stabilny selektor kroku, dokładnie jak w
      // starym Control) — widoczny nagłówek to osobny .c2-stepper, ten sam
      // wzorzec (mały, uppercase, linia pod spodem) co w Rundach/Finale.
      // Tekst .stepTitle NIE idzie przez t() celowo — jest zawsze niewidoczny
      // (display:none) i istnieje wyłącznie jako stabilny selektor testów E2E,
      // więc nie jest to string user-facing.
      h("div", { class: "stepTitle", text: "Urządzenia" }),
      h("div", { class: "c2-stepper", text: t("control.stepDevices") }),
      // .c2-scroll-area: TYLKO ta środkowa treść przewija się, gdyby lista
      // urządzeń kiedyś nie zmieściła się na ekranie — .stepFoot (Dalej)
      // zostaje na dole, poza obszarem przewijania, zawsze widoczny.
      h("div", { class: "c2-scroll-area" }, [
        // Ten sam c2-roundlayout co w Rundach (siatka/lista + kreska + hint po
        // prawej) — lista urządzeń po lewej, hint o wpisywaniu kodu po prawej,
        // zamiast osobnego paska pod spodem na całą szerokość.
        h("div", { class: "c2-roundlayout" }, [
          h("div", { class: "c2-roundlayout-main" }, [h("div", { class: "c2-devicerows" }, rows)]),
          h("div", { class: "c2-roundlayout-divider" }),
          h("div", { class: "c2-roundlayout-side" }, [hintBlock(t("control.deviceCodeHint"))]),
        ]),
      ]),
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

  // Podgląd wylosowanej puli ("Losowo ma losować i pokazywać co wylosowano")
  // — przyjmuje tablicę {text} (rounds._questionPool ma je już wprost;
  // final.pickedPreview to ta sama sygnatura, wypełniana przez
  // app.js's drawFinalPicks). Puste/brak = nic jeszcze nie wylosowano.
  function questionPreviewList(items) {
    if (!items || !items.length) return null;
    return h("div", { class: "c2-qpreview" }, items.map((q, i) =>
      h("div", { class: "c2-qpreview-item" }, [
        h("span", { class: "c2-qpreview-num", text: String(i + 1) }),
        h("span", { class: "c2-qpreview-text", text: q.text }),
      ])
    ));
  }

  // Wiersz-atrapa "rundy w toku" do podglądu D3 — patrz shared/previewRow.js
  // (ta sama funkcja, którą używa też js/pages/game-settings2.js's modal
  // ustawień, żeby oba miejsca nie rozjechały się osobnymi implementacjami).
  // BEZ logoPreview — logo tej JUŻ ZAPISANEJ gry pokazuje się przez
  // scene.js's bindGame(id), wołane w display2/js/main.js's bootPreview()
  // wprost z ?id= w URL-u iframe'a (patrz previewSrc niżej).
  function buildPreviewRow(state) {
    return buildDisplayPreviewRow({ teams: state.teams, display: state.display });
  }

  function renderSetupFinish(state, ctx = {}) {
    clear();
    const s = state.settings;
    const d = state.display;
    const hasFinal = s.hasFinal === true;

    const previewSrc = ctx.urls?.displayUrl
      ? `${ctx.urls.displayUrl}${ctx.urls.displayUrl.includes("?") ? "&" : "?"}preview=1`
      : null;
    const previewFrame = previewSrc ? h("iframe", { src: previewSrc, title: t("control.displayPreviewTitle") }) : null;
    if (previewFrame) {
      window.addEventListener("message", function onReady(e) {
        if (e.data?.type !== "familiada:preview-ready" || e.source !== previewFrame.contentWindow) return;
        window.removeEventListener("message", onReady);
        previewFrame.contentWindow.postMessage({ type: "familiada:preview-row", row: buildPreviewRow(state) }, "*");
      });
    }

    const sections = [
      summarySection(t("control.summaryTeams"), h("div", { class: "summarySectionValue", text: t("control.teamsVsFormat", {
        teamA: state.teams.teamA || t("control.teamADefault"),
        teamB: state.teams.teamB || t("control.teamBDefault"),
      }) })),
      summarySection(t("control.summaryDisplay"), h("div", { class: "summaryDisplayInfo" }, [
        h("div", { class: "summaryDisplayRow" }, [h("span", { class: "summaryDisplayLabel", text: `${t("control.summaryColors")}: ` }), colorDots(d.colors)]),
        h("div", { class: "summaryDisplayRow" }, [h("span", { class: "summaryDisplayLabel", text: `${t("control.summaryTheme")}: ` }), document.createTextNode(d.theme || t("control.summaryDefault"))]),
        h("div", { class: "summaryDisplayRow" }, [h("span", { class: "summaryDisplayLabel", text: `${t("control.summaryLogo")}: ` }), document.createTextNode(d.logoId ? t("control.summaryLogoCustom") : t("control.summaryDefault"))]),
        h("div", { id: "c2DisplayPreview" }, previewFrame ? [previewFrame] : []),
      ])),
      summarySection(t("control.summaryFinal"), h("div", { class: "summarySectionValue", text: hasFinal ? t("control.toggleYes") : t("control.toggleNo") })),
    ];
    // "Losuj ponownie" mieszka PRZY danej sekcji pytań (nie w stopce z resztą
    // nawigacji) — to akcja dotycząca konkretnie tej puli, nie kroku jako
    // całości. Tylko w trybie losowym (w "pick" kolejność jest już ustalona
    // ręcznie, nie ma czego losować). "Losowo" losuje OD RAZU przy wejściu w
    // ten krok (app.js's ensureQuestionsDrawn) — poniższy podgląd pokazuje
    // CO faktycznie wylosowano, nie tylko sam fakt trybu.
    const roundsValueRow = [document.createTextNode(
      s.roundsQuestionsMode === "pick" ? t("control.roundsOrderFixed", { count: s.roundsPicked?.length || 0 }) : t("control.summaryQModeRandom")
    )];
    if (s.roundsQuestionsMode !== "pick") {
      roundsValueRow.push(h("button", { class: "btn sm", type: "button", onclick: () => emit("setup.reshuffleRounds") }, [document.createTextNode(t("control.reshuffleQuestions"))]));
    }
    const roundsPreview = s.roundsQuestionsMode !== "pick" ? questionPreviewList(state.rounds._questionPool) : null;
    sections.push(summarySection(t("control.summaryRoundsQuestions"), h("div", {}, [
      h("div", { class: "summaryQMode c2-summary-row" }, roundsValueRow),
      roundsPreview,
    ].filter(Boolean))));

    if (hasFinal) {
      const finalValueRow = [document.createTextNode(
        s.finalQuestionsMode === "pick" ? t("control.finalPickedCount", { count: state.final.picked?.length || 0 }) : t("control.summaryQModeRandom")
      )];
      if (s.finalQuestionsMode !== "pick") {
        finalValueRow.push(h("button", { class: "btn sm", type: "button", onclick: () => emit("setup.reshuffleFinal") }, [document.createTextNode(t("control.reshuffleQuestions"))]));
      }
      const finalPreview = s.finalQuestionsMode !== "pick" ? questionPreviewList(state.final.pickedPreview) : null;
      sections.push(summarySection(t("control.summaryFinalQuestions"), h("div", {}, [
        h("div", { class: "summaryQMode c2-summary-row" }, finalValueRow),
        finalPreview,
      ].filter(Boolean))));
    }

    const finalIncomplete = hasFinal && s.finalQuestionsMode === "pick" && (state.final.picked?.length !== 5 || !state.final.confirmed);
    const start = h("button", {
      class: "btn gold", type: "button",
      disabled: finalIncomplete ? "" : undefined,
      onclick: () => emit("setup.start"),
    }, [document.createTextNode(t("control.setupDoneBtn"))]);
    const changeSettings = h("button", { class: "btn sm", type: "button", onclick: () => emit("setup.openSettings") }, [document.createTextNode(t("control.summarySettingsLink"))]);
    // "Wstecz" (jak stare control.html's btnSetupFinishBack) — swobodny
    // powrót do Urządzeń, nic nie resetuje. c2-btn-back popycha go do
    // lewej krawędzi stopki (patrz control2.html: .stepFootButtons ma
    // justify-content:flex-end, ten jeden dostaje margin-right:auto).
    const back = h("button", { class: "btn c2-btn-back", type: "button", onclick: () => emit("setup.back") }, [document.createTextNode(t("common.back"))]);

    // Płasko, tak jak renderDevicesStep — jedno .cardBody na root, BEZ
    // zagnieżdżonego wewnątrz .card (to była druga, zbędna warstwa: root
    // już siedzi w .control-main-card, które jest jedynym widocznym
    // obramowaniem).
    const body = [
      // .stepTitle zostaje bare "Podsumowanie" — stabilny selektor testów
      // E2E (patrz control2.spec.js). Widoczny .c2-stepper dostaje opisowy
      // nagłówek "Podsumowanie ustawień" — PODMIENIONY, nie doklejony za
      // myślnikiem (w odróżnieniu od "Runda N — rozgrywka"/"— kradzież",
      // gdzie oba człony niosą osobną informację, tu "Podsumowanie —
      // podsumowanie ustawień" było czystą tautologią).
      h("div", { class: "stepTitle", text: "Podsumowanie" }),
      h("div", { class: "c2-stepper", text: t("control.summaryStepperTitle") }),
      // .c2-scroll-area: dolne przyciski (Wstecz/Zmień ustawienia/Gotowe) mają
      // zostać wyłączone z przewijania — przewija się TYLKO treść sekcji
      // podsumowania, .stepFoot zawsze zostaje widoczny na dole karty.
      h("div", { class: "c2-scroll-area" }, sections),
      h("div", { class: "stepFoot" }, [
        h("div", { class: "stepFootButtons" }, [back, changeSettings, start]),
        finalIncomplete ? h("div", { class: "msg msg-pill", text: t("control.finalPickIncompleteWarning") }) : null,
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

  // Samodzielny przycisk nawigacji (nie kafel siatki) z tym samym
  // bezpiecznym wzorcem obsługi `disabled` co tile() — h()'s generic
  // setAttribute("disabled", false) zostawiłoby atrybut OBECNY (a więc
  // przycisk martwy) nawet przy disabled=false, więc właściwość ustawiana
  // jest wprost, TYLKO gdy true. Używane przez pięć dużych przejść planszy
  // (Rozpocznij rundę/Zakończ rundę/Rozpocznij finał/Zakończ grę×2),
  // blokowanych przez boardBusy() — patrz armBoardTransition() wyżej.
  function navButton(label, { cls = "c2-btn primary c2-intro-btn", onclick, disabled = false } = {}) {
    const el = h("button", { class: cls, type: "button", onclick: disabled ? undefined : onclick }, [document.createTextNode(label)]);
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
  // `shortcuts`, gdy podane (control2/js/ui.js's renderFinalEntry) — lista
  // opisów skrótów klawiszowych (shared/hints.js's getFinalEntryShortcuts),
  // dopisana POD głównym hintem, oddzielona własną kreską, nie zamiast niego.
  function hintBlock(text, shortcuts) {
    if (!text && !(shortcuts && shortcuts.length)) return null;
    const children = [];
    if (text) children.push(h("div", { class: "c2-hint-main", text }));
    if (shortcuts && shortcuts.length) {
      children.push(h("div", { class: "c2-hint-shortcuts" }, [
        h("div", { class: "c2-hint-shortcuts-title", text: t("control.keyboardShortcutsTitle") }),
        ...shortcuts.map((s) => h("div", { class: "c2-hint-shortcut", text: s })),
      ]));
    }
    return h("div", { class: "c2-hint" }, children);
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
      // boardBusy(): ten sam floor co control/js/gameRounds.js's
      // enableBuzzerDuel(), które stary kod wołał DOPIERO po `await`
      // dźwięku/animacji startu rundy (armowane przy "Rozpocznij rundę",
      // patrz armBoardTransition powyżej) — ten ekran nie ma być klikalny,
      // zanim ta sekwencja się nie skończy.
      if (!pendingPhysicalTeam) {
        tiles.push(tile(teamName(state, "A"), { row: 1, col: HALF(0), disabled: boardBusy(), onclick: () => { pendingPhysicalTeam = "A"; emit("ui.rerender"); } }));
        tiles.push(tile(teamName(state, "B"), { row: 1, col: HALF(1), disabled: boardBusy(), onclick: () => { pendingPhysicalTeam = "B"; emit("ui.rerender"); } }));
      } else {
        tiles.push(tile(t("control.physicalConfirmTeam", { name: teamName(state, pendingPhysicalTeam) }), {
          row: 1, col: HALF(0), cls: "c2-tile-primary", disabled: boardBusy(),
          onclick: () => { const team = pendingPhysicalTeam; pendingPhysicalTeam = null; emit("game.dispatch", { type: "ACCEPT_BUZZ", team }); },
        }));
        tiles.push(tile(t("common.cancel"), { row: 1, col: HALF(1), onclick: () => { pendingPhysicalTeam = null; emit("ui.rerender"); } }));
      }
    } else {
      // Tryb normalny (Buzzer): obie drużyny widoczne od razu, ale tylko
      // ta, która faktycznie nacisnęła (duel.lastPressed), jest klikalna —
      // druga zostaje wyszarzonym, nieklikalnym placeholderem, dokładnie jak
      // stary control.html's btnBuzzAcceptA/B. "Ponów naciśnięcie" (nowe
      // RETRY_DUEL) pojawia się dopiero, gdy jest co odrzucić.
      const lastPressed = r.duel.lastPressed;
      tiles.push(tile(t("control.roundsBuzzAcceptTeam", { name: teamName(state, "A") }), {
        row: 1, col: HALF(0), cls: lastPressed === "A" ? "c2-tile-primary" : "",
        disabled: lastPressed !== "A" || boardBusy(),
        onclick: () => emit("game.dispatch", { type: "ACCEPT_BUZZ", team: "A" }),
      }));
      tiles.push(tile(t("control.roundsBuzzAcceptTeam", { name: teamName(state, "B") }), {
        row: 1, col: HALF(1), cls: lastPressed === "B" ? "c2-tile-primary" : "",
        disabled: lastPressed !== "B" || boardBusy(),
        onclick: () => emit("game.dispatch", { type: "ACCEPT_BUZZ", team: "B" }),
      }));
      if (lastPressed) {
        tiles.push(tile(t("control.roundsBuzzRetry"), { row: 2, col: "1 / 7", disabled: boardBusy(), onclick: () => emit("game.dispatch", { type: "RETRY_DUEL" }) }));
      }
    }

    const body = [h("div", { class: "c2-roundlayout" }, [
      h("div", { class: "c2-roundlayout-main" }, [tileGrid(tiles)]),
      h("div", { class: "c2-roundlayout-divider" }),
      h("div", { class: "c2-roundlayout-side" }, [hintBlock(getRoundsHint(state))]),
    ])];

    gameplayShell({ stepLabel: t("control.stepDuelTitle", { round: r.roundNo }), body, nav: null });
  }

  // ---- Rundy (r_intro..r_gameEnd) ----
  function renderRounds(state) {
    const r = state.rounds;
    // r_intro/r_roundStart: te same dwa przejściowe ekrany co stare
    // control.html's data-step="r_intro"/"r_roundStart" (duży tytuł +
    // wyjaśnienie co się zaraz stanie na Wyświetlaczu/u Prowadzącego + jeden
    // złoty przycisk) — nie goły "Dalej" bez kontekstu. "Rozpocznij grę"
    // odpala intro (logo+dźwięk, app.js's rounds.introNext), "Rozpocznij
    // rundę" odpala START_ROUND (pusta plansza+pytanie, dźwięk
    // round_transition — engine.js/soundReactor.js).
    if (state.step === "r_intro") {
      // Nagłówek = "Rozpoczęcie gry" — PODMIENIONY z dawnego "Intro gry"
      // (nie doklejony za myślnikiem — "Intro gry — rozpoczęcie gry" było
      // tautologią, tak samo jak przy Podsumowaniu). To jeszcze nie jest
      // sekcja Rund (zgłoszone jako mylące: "Gotowe — przejdź do rund"
      // prowadziło na ekran podpisany "Rundy", zanim runda w ogóle istnieje).
      gameplayShell({
        stepLabel: t("control.introStepTitle"),
        body: [h("div", { class: "c2-intro" }, [
          h("div", { class: "c2-intro-title", text: t("control.roundsIntroBtn") }),
          h("div", { class: "c2-intro-hint", text: t("control.roundsIntroHint") }),
        ])],
        nav: [h("button", { class: "c2-btn primary c2-intro-btn", onclick: () => emit("rounds.introNext") }, [document.createTextNode(t("control.roundsIntroBtn"))])],
      });
      return;
    }
    if (state.step === "r_roundStart") {
      // Wynik pokazany dopiero OD RUNDY 2 — w rundzie 1 zawsze 0:0 (nic
      // jeszcze się nie rozegrało), więc nie niesie żadnej informacji.
      const scoreRow = r.roundNo > 1 ? h("div", { class: "c2-intro-score" }, [
        h("span", { class: "c2-intro-score-a", text: t("control.scoreLine", { name: teamName(state, "A"), points: r.totals.A }) }),
        h("span", { class: "c2-intro-score-sep", text: t("control.dash") }),
        h("span", { class: "c2-intro-score-b", text: t("control.scoreLine", { name: teamName(state, "B"), points: r.totals.B }) }),
      ]) : null;
      gameplayShell({
        stepLabel: t("control.roundStepLabel", { round: r.roundNo }),
        body: [h("div", { class: "c2-intro" }, [
          h("div", { class: "c2-intro-title", text: t("control.roundsStartTitle") }),
          h("div", { class: "c2-intro-hint", text: t("control.roundsStartHint") }),
          scoreRow,
        ].filter(Boolean))],
        nav: [navButton(t("control.roundsStartBtn"), {
          disabled: boardBusy(),
          onclick: () => { armBoardTransition(startRoundGateMs()); emit("game.dispatch", { type: "START_ROUND" }); },
        })],
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
    body.push(h("div", { class: "c2-question", text: r.question?.text || t("control.dash") }));

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
      // Punkty w nawiasie, TAK SAMO jak Finał-mapowanie (control2/js/ui.js's
      // renderFinalMapping) i stary Control — dawny myślnik tutaj był
      // niespójny z resztą aplikacji (zgłoszone).
      tiles.push(armableTile(`ans:${a.ord}`, `${a.text} (${a.fixed_points})`, {
        row: Math.floor(i / 2) + 1,
        col: HALF(i % 2),
        cls: revealed ? "c2-tile-revealed" : "",
        // revealLocked(): dopóki dźwięk POPRZEDNIEGO odsłonięcia jeszcze
        // gra, żaden kolejny kafel nie jest klikalny (zgłoszone: "nie idzie
        // odsłonić następnej odpowiedzi jeśli pierwsza się nie pojawiła
        // jeszcze na ekranie"). REVEAL_ANSWER i REVEAL_LEFT zawsze zwracają
        // soundCueKey "answer_correct" (engine.js) — trafienie odpowiedzi
        // zawsze oznacza dźwięk poprawnej odpowiedzi, niezależnie od fazy.
        disabled: revealed || revealLocked(),
        onclick: () => { armRevealCooldown("answer_correct"); emit("game.dispatch", { type: state.phase === "REVEAL" ? "REVEAL_LEFT" : "REVEAL_ANSWER", ord: a.ord }); },
      }));
    });

    // Wiersz 4 celowo PUSTY — ta sama przerwa nad akcjami co w Finale-
    // mapowaniu (renderFinalMapping's pusty wiersz 5 przed kaflami
    // odsłaniania), żeby rytm siatki (treść / przerwa / akcje) zgadzał się
    // między wszystkimi kartami rozgrywki (zgłoszone). "Oddaj kontrolę"
    // schodzi więc na wiersz 5, X/Timer na wiersz 6 — siatka ma teraz 6
    // wierszy zamiast 5 (nadpisane inline niżej, jak w mapowaniu).
    if (passAvailable) {
      tiles.push(armableTile("pass", t("control.roundsPassControl"), {
        row: 5, col: "1 / 7", cls: "c2-tile-primary",
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
      tiles.push(armableTile("x", xLabel, { row: 6, col: HALF(0), cls: "c2-tile-danger", onclick: () => emit("game.dispatch", { type: "ADD_X" }) }));
    }
    if (timer3Available) {
      const running = !!timer3?.running;
      const secLeft = running ? Math.max(0, Math.ceil((timer3.endsAt - Date.now()) / 1000)) : null;
      tiles.push(tile(running ? String(secLeft) : t("control.roundsStartTimer3"), {
        row: 6, col: HALF(1),
        cls: running ? "c2-tile-timer" : "c2-tile-timer startable",
        disabled: running,
        onclick: running ? undefined : () => emit("game.dispatch", { type: "START_TIMER3" }),
      }));
    }

    const roundsGrid = tileGrid(tiles);
    roundsGrid.style.gridTemplateRows = "repeat(6, minmax(0,1fr))";
    body.push(h("div", { class: "c2-roundlayout" }, [
      h("div", { class: "c2-roundlayout-main" }, [roundsGrid]),
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
      h("span", {}, [document.createTextNode(t("control.statusPlayingLabel")), h("b", { text: activeTeam ? teamName(state, activeTeam) : t("control.dash") })]),
      h("span", {}, [document.createTextNode(t("control.statusBankLabel")), h("b", { text: String(r.bankPts) })]),
    ];
    if (state.phase === "STEAL" && r.steal.active) {
      statusItems.push(h("span", {}, [document.createTextNode(t("control.statusStealLabel")), h("b", { text: r.steal.team ? teamName(state, r.steal.team) : t("control.dash") })]));
    }
    // "Zakończ rundę" mieszka OBOK Gra/Bank, w tym samym pasku (zgłoszone:
    // za duży odstęp pod kaflami + przycisk ma być obok Gra/Bank) —
    // .c2-statusbar-end popycha go do prawej krawędzi tego samego wiersza,
    // zamiast osobnego .c2-gameplay-nav z własnym border-top/padding-top
    // (stąd nav:null niżej — bez oddzielnego paska nawigacji na tym ekranie).
    if ((state.phase === "PLAY" || state.phase === "STEAL") && r.canEndRound) {
      statusItems.push(navButton(t("control.roundsEndRound"), {
        cls: "c2-btn primary c2-statusbar-end",
        disabled: boardBusy(),
        onclick: () => { armBoardTransition(endRoundGateMs()); emit("game.dispatch", { type: "END_ROUND" }); },
      }));
    }
    body.push(h("div", { class: "c2-statusbar" }, statusItems));

    // "— kradzież" w STEAL, "— rozgrywka" poza tym (PLAY i odkrywanie
    // reszty w REVEAL) — zgłoszone: te dwa etapy mają się rozróżniać w
    // nagłówku, tak jak pojedynek już ma swoje "— pojedynek".
    const stepLabel = state.phase === "STEAL"
      ? t("control.stepStealTitle", { round: r.roundNo })
      : t("control.stepPlayTitle", { round: r.roundNo });
    gameplayShell({ stepLabel, body, nav: null });
  }

  // 3 przypadki końca gry — wygrana A, wygrana B, remis — jedna linia
  // zamiast osobnego wyniku każdej drużyny obok siebie (zgłoszone: "ekran
  // zakończenia można tylko napisać wygrała drużyna taka z wynikiem takim").
  function gameEndSummary(state) {
    const { A, B } = state.rounds.totals;
    if (A === B) return t("control.gameEndSummaryDraw", { a: A, b: B });
    const winner = A > B ? "A" : "B";
    return t("control.gameEndSummaryWin", { team: teamName(state, winner), hi: Math.max(A, B), lo: Math.min(A, B) });
  }

  // Co POKAŻE Wyświetlacz po "Zakończ grę" — 3 warianty (plan, sekcje R10/
  // F14), nie "logo, wynik i punkty" naraz (błąd — pokazuje się TYLKO
  // jedno z nich): remis -> zawsze logo, niezależnie od ustawienia;
  // inaczej wg detail.settings.endScreenMode — "logo"->logo, "points"->
  // wynik w punktach, "money"->pieniądze (w rundach BEZ finału 'money'
  // jest w silniku traktowane jak 'points' — nie ma z czego policzyć
  // realnej kwoty; w finale to prawdziwa, przeliczona kwota).
  function endRevealHint(state, isFinal) {
    const { A, B } = state.rounds.totals;
    const mode = state.settings.endScreenMode;
    if (A === B || mode === "logo" || !mode) {
      return t("control.endHintLogo");
    }
    if (mode === "money" && isFinal) {
      return t("control.endHintMoney");
    }
    return t("control.endHintPoints");
  }

  // Ekran końca gry — wspólny szablon dla "Koniec gry" (bez finału) i
  // "Koniec finału" (renderFinalEnd niżej), ujednolicone: ten sam dwuetapowy
  // c2-intro hero. Zawsze "Koniec gry" — finał KOŃCZY grę, to nie osobny,
  // drugi rodzaj zakończenia (było mylące: "Koniec finału" obok "Koniec
  // gry" sugerowało dwa różne ekrany). Przycisk odsłaniający wynik
  // ujednolicony na "Zakończ grę" (było osobno "Pokaż koniec gry"/"Zakończ").
  function renderEndScreen(state, { revealAction, isFinal }) {
    if (!state.locks.gameEnded) {
      // Hint opisuje co ZROBI kliknięcie (dźwięk + Wyświetlacz), tak jak
      // reszta hero-ekranów ("Na wyświetlaczu pojawi się..." w r_intro/
      // f_start) — NIE zdradza samego wyniku (kto wygrał), bo to jest
      // moment odsłonięcia dla widzów, nie wcześniej w Control.
      gameplayShell({
        stepLabel: t("control.roundsGameEndTitle"),
        body: [h("div", { class: "c2-intro" }, [
          h("div", { class: "c2-intro-title", text: t("control.roundsGameEndTitle") }),
          h("div", { class: "c2-intro-hint", text: endRevealHint(state, isFinal) }),
        ])],
        nav: [navButton(t("control.roundsGameEndBtn"), {
          disabled: boardBusy(),
          onclick: () => { armBoardTransition(isFinal ? finishFinalGateMs() : gameEndGateMs()); emit("game.dispatch", revealAction); },
        })],
      });
      return;
    }
    gameplayShell({
      stepLabel: t("control.roundsGameEndTitle"),
      body: [h("div", { class: "c2-intro" }, [
        h("div", { class: "c2-intro-title", text: t("control.roundsGameEndTitle") }),
        h("div", { class: "c2-intro-hint", text: gameEndSummary(state) }),
      ])],
      nav: [
        h("button", { class: "c2-btn c2-intro-btn", type: "button", onclick: () => emit("game.restart") }, [document.createTextNode(t("control.restartGame"))]),
        h("button", { class: "c2-btn primary c2-intro-btn", type: "button", onclick: () => emit("session.finish") }, [document.createTextNode(t("control.returnToMyGames"))]),
      ],
    });
  }

  function renderGameEnd(state) {
    renderEndScreen(state, { revealAction: { type: "GAME_END_SHOW" }, isFinal: false });
  }

  // ---- Finał ----
  // f_start/f_p2_start: te same dwa "hero" ekrany przejściowe co r_intro/
  // r_roundStart (duży tytuł + wyjaśnienie + złoty przycisk) — "Rozpocznij
  // finał" faktycznie startuje i finał, i pierwszą jego rundę (gracz 1),
  // dokładnie jak "Rozpocznij grę" startuje i grę, i pierwszą rundę.
  function renderFinalStart(state) {
    gameplayShell({
      stepLabel: t("control.stepFinal"),
      body: [h("div", { class: "c2-intro" }, [
        h("div", { class: "c2-intro-title", text: t("control.finalStartName") }),
        h("div", { class: "c2-intro-hint", text: t("control.finalStartHint") }),
      ])],
      nav: [navButton(t("control.finalStartBtn"), {
        disabled: boardBusy(),
        onclick: () => { armBoardTransition(startFinalGateMs()); emit("game.dispatch", { type: "START_FINAL" }); },
      })],
    });
  }

  // Co pokazać jako "Gracz 1: ..." w wierszach rundy 2 — dokładnie stare
  // control/js/gameFinal.js's resolveShownText(1, idx): jeśli operator już
  // dopasował odpowiedź gracza 1 do prawdziwej odpowiedzi z planszy (MATCH),
  // pokazujemy TĘ odpowiedź (nie surowy wpisany tekst); przy MISS pokazujemy
  // to, co gracz 1 faktycznie wpisał; SKIP/nierozstrzygnięte -> "—". Runda 1
  // zawsze kończy mapowanie (F2-F6) zanim runda 2 w ogóle się zacznie
  // (f_p2_start między nimi), więc map1[idx] jest tu już rozstrzygnięte.
  function resolveP1AnswerShown(state, idx) {
    const f = state.final;
    const row = f.runtime.map1?.[idx];
    const question = f.questions?.[idx];
    if (!row) return t("control.dash");
    if (row.kind === "MATCH") {
      const a = (question?.answers || []).find((x) => x.id === row.matchId);
      return (a?.text || "").trim() || t("control.dash");
    }
    if (row.kind === "MISS") return (f.runtime.p1[idx]?.text || "").trim() || t("control.dash");
    return t("control.dash");
  }

  // Kafel odliczania — jeden wiersz na pełną szerokość, ta sama skala co
  // reszta siatki wpisywania (zgłoszone: "akcja odliczania/zatrzymywanie ma
  // być jako 1 rząd w podobnej skali kafelkowej"). Toggle idzie przez
  // "final.toggleTimer" (control2/js/app.js), reużywane też przez skrót
  // Ctrl/Cmd+Shift — jedna, wspólna logika start/wczesne-zatrzymanie zamiast
  // dwóch kopii. Wczesne zatrzymanie klikalne TYLKO gdy wszystkie pola są
  // wypełnione (dokładnie jak stare timerStopEarlyIfAllowed) — inaczej
  // odliczanie jest tylko wyświetlane, nie da się go przerwać.
  function finalTimerRow(state, round) {
    const f = state.final;
    const timer = f.runtime.timer;
    const phase = round === 1 ? "P1" : "P2";
    const running = timer.running && timer.phase === phase;
    const used = round === 1 ? timer.usedP1 : timer.usedP2;

    if (running) {
      const secLeft = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
      const filled = round === 1
        ? f.runtime.p1.every((x) => String(x?.text || "").trim().length > 0)
        : f.runtime.p2.every((x) => (x?.repeat ? true : String(x?.text || "").trim().length > 0));
      // Dokładnie jak stare control/js/gameFinal.js's setTimerBtnLabel: gdy
      // odliczanie trwa, przycisk ZAWSZE pokazuje etykietę "Zatrzymaj" (nie
      // tylko gdy da się kliknąć) — tylko klikalność zależy od allFilled.
      // Cyfry odliczania są aria-hidden (dekoracyjne, tykają co sekundę) —
      // stabilna, dostępna nazwa przycisku to samo "Zatrzymaj", ten sam
      // wzorzec co c2-tile-sub przy X w Rundach (renderRounds's xLabel).
      const content = h("div", {}, [
        h("span", { "aria-hidden": "true" }, [document.createTextNode(`${secLeft}s`)]),
        h("div", { class: "c2-tile-sub", text: t("control.finalTimerStopShort") }),
      ]);
      return h("button", {
        class: `c2-tile c2-timer-row c2-tile-timer ${filled ? "startable" : ""}`.trim(),
        type: "button",
        disabled: filled ? undefined : "",
        onclick: filled ? () => emit("final.toggleTimer", { round }) : undefined,
      }, [content]);
    }
    if (used) {
      return h("button", { class: "c2-tile c2-timer-row c2-tile-timer", type: "button", disabled: "" }, [document.createTextNode(t("control.finalTimerUsed"))]);
    }
    return h("button", {
      class: "c2-tile c2-timer-row c2-tile-timer startable",
      type: "button",
      onclick: () => emit("final.toggleTimer", { round }),
    }, [document.createTextNode(round === 1 ? t("control.finalUi.timerStart15") : t("control.finalUi.timerStart20"))]);
  }

  // Wpisywanie finału — jeden wiersz na pytanie, ułożony jak kafle rund
  // (obramowanie/zaokrąglenie/tło ujednolicone z .c2-tile), a nie tabela ani
  // gołe wiersze. Runda 1: [Pytanie] [Odpowiedź gracza] (2 kafle). Runda 2:
  // [Pytanie + Odpowiedź gracza 1, jedno pod drugim W JEDNYM kaflu]
  // [Odpowiedź gracza 2] [Powtórzenie — przycisk, nie checkbox] (3 kafle) —
  // dokładnie jak stary control/js/gameFinal.js's 4-kolumnowa tabela
  // (Pytanie/Odp. gracza 1/Odpowiedź/Powtórzenie), tylko z pytaniem i
  // odpowiedzią gracza 1 połączonymi w jeden kafel zamiast dwóch osobnych
  // kolumn. Hint (+ skróty klawiszowe) po prawej, jak w Rundach — nie nad
  // siatką.
  function renderFinalEntry(state, round) {
    const f = state.final;
    const key = round === 1 ? "p1" : "p2";
    const rows = [];
    for (let i = 0; i < 5; i++) {
      const row = f.runtime[key][i] || {};
      const question = f.questions?.[i];
      const inp = h("input", { type: "text", value: row.text || "", placeholder: t("control.finalUi.playerAnswer"), autocomplete: "off" });
      on(inp, "input", () => emit("game.dispatch", { type: "SET_ENTRY_TEXT", round, idx: i, text: inp.value }));
      on(inp, "keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          root.querySelector(`.c2-entryrow[data-i="${i + 1}"] input`)?.focus();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          root.querySelector(`.c2-entryrow[data-i="${i - 1}"] input`)?.focus();
          return;
        }
        // Shift+Enter w pustym polu (tylko runda 2) — przełącza "Powtórzenie",
        // dokładnie jak stare control/js/gameFinal.js's renderP2Entry.
        if (round === 2 && e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          emit("game.dispatch", { type: "SET_REPEAT", round: 2, idx: i, repeat: !row.repeat });
          root.querySelector(`.c2-entryrow[data-i="${i + 1}"] input`)?.focus();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          root.querySelector(`.c2-entryrow[data-i="${i + 1}"] input`)?.focus();
        }
      });

      const cells = round === 2 ? [
        h("div", { class: "c2-entrytile" }, [
          h("div", { class: "c2-entrytile-q", text: question?.text || t("control.finalUi.questionLabel", { n: i + 1 }) }),
          h("div", { class: "c2-entrytile-p1ans" }, [document.createTextNode(t("control.finalUi.p2HintP1Prefix")), h("b", { text: resolveP1AnswerShown(state, i) })]),
        ]),
        h("div", { class: "c2-entrytile c2-entrytile-input" }, [inp]),
      ] : [
        h("div", { class: "c2-entrytile" }, [h("div", { class: "c2-entrytile-q", text: question?.text || t("control.finalUi.questionLabel", { n: i + 1 }) })]),
        h("div", { class: "c2-entrytile c2-entrytile-input" }, [inp]),
      ];
      if (round === 2) {
        const repeat = row.repeat === true;
        cells.push(h("button", {
          class: `c2-btn-repeat ${repeat ? "on" : ""}`.trim(), type: "button",
          onclick: () => emit("game.dispatch", { type: "SET_REPEAT", round: 2, idx: i, repeat: !repeat }),
        }, [document.createTextNode(repeat ? t("control.finalUi.p2RepeatOn") : t("control.finalUi.p2RepeatOff"))]));
      }
      rows.push(h("div", { class: `c2-entryrow ${round === 2 ? "p2" : "p1"}`, "data-i": String(i) }, cells));
    }
    rows.push(finalTimerRow(state, round));

    // Nagłówek nad siatką — Finał-mapowanie ma nad swoją siatką c2-question
    // (treść pytania), wpisywanie go dotąd nie miało wcale, przez co jego
    // siatka dostawała więcej wysokości niż mapowania i wiersze między tymi
    // dwoma ekranami nie kończyły się na tej samej wysokości (zgłoszone).
    // Ten ekran nie ma JEDNEGO pytania (5 naraz w wierszach), więc zamiast
    // treści pytania pokazuje, czyj to krok — sama treść nieważna, chodzi o
    // zarezerwowanie tej samej wysokości nagłówka co u mapowania.
    const body = [
      h("div", { class: "c2-question", text: t("control.finalEntryHeading", { round }) }),
      h("div", { class: "c2-roundlayout" }, [
        h("div", { class: "c2-roundlayout-main" }, [h("div", { class: "c2-entryrows" }, rows)]),
        h("div", { class: "c2-roundlayout-divider" }),
        h("div", { class: "c2-roundlayout-side" }, [hintBlock(getFinalHint(state), getFinalEntryShortcuts(round))]),
      ]),
    ];

    const nav = [h("button", { class: "c2-btn primary", onclick: () => emit("game.dispatch", { type: "START_MAPPING", round }) }, [document.createTextNode(t("common.next"))])];
    gameplayShell({ stepLabel: t("control.finalEntryStepLabel", { round }), body, nav });
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

  // Rozstrzygnięcie, które FAKTYCZNIE się odsłoni, jeśli operator jeszcze
  // niczego ręcznie nie wybrał — dokładnie jak stare gameFinal.js's
  // ensureDefaultMapping(): MISS gdy coś wpisano, SKIP gdy pusto. To NIE
  // jest zapisywane do stanu tutaj (ui.js zostaje czystym renderem) — służy
  // wyłącznie do pokazania, które MISS/SKIP jest "już wybrane" (złoty kafel
  // od razu, nie dopiero po pierwszym kliknięciu — zgłoszone: "zaznaczenie
  // zawsze jakieś jest na kafelkach wyboru, nawet domyślne"). Rzeczywisty
  // zapis tego wyboru do game_state następuje dopiero przy potwierdzeniu
  // kafla "Pokazana" (patrz niżej), dokładnie tak jak stare "Pokaż
  // odpowiedź" domyślnie rozstrzygało dopiero w momencie kliknięcia.
  function effectiveMappingResolution(row, hasTyped) {
    if (row.kind != null) return { kind: row.kind, matchId: row.matchId };
    return { kind: hasTyped ? "MISS" : "SKIP", matchId: null };
  }

  // Co DOKŁADNIE odsłoni się na Wyświetlaczu — bez żadnych dodatkowych
  // informacji (zgłoszone), tylko sama wartość: dopasowana odpowiedź z
  // listy / to co gracz wpisał (MISS) / nic (SKIP).
  function resolveMappingPreview(question, inputText, effective) {
    if (effective.kind === "MATCH") {
      const a = (question?.answers || []).find((x) => x.id === effective.matchId);
      return { text: a?.text || t("control.dash"), pts: a ? a.fixed_points : 0 };
    }
    if (effective.kind === "MISS") return { text: inputText || t("control.dash"), pts: 0 };
    return { text: t("control.dash"), pts: 0 };
  }

  // Wpisywanie (finał, mapowanie): wiersz 1 to edytowalne "Wpisano" (ten sam
  // wygląd co pole w kroku wpisywania), żeby dało się poprawić literówkę tuż
  // przed rozstrzygnięciem — blokuje się dopiero po odsłonięciu odpowiedzi.
  // Wiersze 2-4: dopasowania z listy + MISS/SKIP (do 6, 2 na wiersz) — jedno
  // z nich jest ZAWSZE złote, nawet domyślnie (MISS gdy coś wpisano, SKIP
  // gdy pusto), nie dopiero po pierwszym kliknięciu. Wiersz 5 (DÓŁ, tam gdzie
  // były zawsze — zgłoszone): DWA kafle odsłaniania ("Pokaż odpowiedź"/
  // "Pokaż punkty"), ZAWSZE obecne w tym samym miejscu (nie znikają
  // warunkowo jak dawniej) — "Pokaż punkty" jest po prostu wyszarzony/
  // zablokowany dopóki odpowiedź nie jest odsłonięta. Nazwa przycisku
  // zostaje stała, druga linijka (aria-hidden) pokazuje na żywo dokładnie to,
  // co się odsłoni — resolveMappingPreview. Idą przez zaznacz->potwierdź jak
  // w Rundach (armableTile) — jedyne dwa kafle na tym ekranie, które realnie
  // coś odsłaniają na wizji — i wyszarzają się na stałe po własnym
  // odsłonięciu. "Dalej" to zwykły przycisk nawigacji na dole
  // (gameplayShell's nav), taki sam jak "Dalej" gdzie indziej — nie kafel w
  // siatce, żyje POD tą siatką (patrz nav niżej).
  function renderFinalMapping(state, round, idx) {
    const f = state.final;
    const mapArr = f.runtime[round === 1 ? "map1" : "map2"];
    const row = mapArr[idx];
    const question = f.questions?.[idx];
    const entryKey = round === 1 ? "p1" : "p2";
    const inputText = f.runtime[entryKey][idx]?.text || "";
    const hasTyped = inputText.trim().length > 0;
    const locked = row.revealedAnswer; // po odsłonięciu odpowiedzi pole i wybór są zamrożone
    // control/js/gameFinal.js's p2IsRepeat: gdy gracz 2 oznaczył powtórzenie,
    // MISS/SKIP nie pokazują się jako aktywne mimo że row.kind==="SKIP" (to
    // właśnie ustawia SET_REPEAT) — aktywność "przechodzi" na sam kafel
    // Powtórzenie.
    const p2IsRepeat = round === 2 && f.runtime.p2[idx]?.repeat === true;

    const effective = effectiveMappingResolution(row, hasTyped);
    const preview = resolveMappingPreview(question, inputText, effective);

    // Etykieta "Wpisano" (1/3, wyśrodkowana w pionie) + pole (2/3, ten sam
    // wygląd co w kroku wpisywania) OBOK siebie, nie jedno nad drugim
    // (zgłoszone). Wiersz 1 to teraz PRAWDZIWY kafelek/kafelki (obramowanie
    // jak c2-entrytile) — zgłoszone: "pierwszy rząd mam mieć kafelek a teraz
    // nie ma". Runda 1: jeden kafelek na całą szerokość. Runda 2: DWA osobne
    // kafelki — "Wpisano" (2/3 szerokości) + "Gracz 1" (1/3 szerokości),
    // osobno od etykiety, nie jedna linijka pod spodem jak dawniej.
    const inp = h("input", { type: "text", value: inputText, placeholder: t("control.finalUi.playerAnswer"), autocomplete: "off" });
    if (locked) inp.disabled = true;
    on(inp, "input", () => emit("game.dispatch", { type: "SET_ENTRY_TEXT", round, idx, text: inp.value }));
    const wpisanoTile = h("div", { class: "c2-mapinput" }, [
      h("div", { class: "c2-mapinput-labelcol" }, [h("div", { class: "c2-field-label", text: t("control.finalUi.mapInputLabel") })]),
      h("div", { class: "c2-entrytile-input" }, [inp]),
    ]);
    wpisanoTile.style.gridRow = "1";

    let row1Tiles;
    if (round === 2) {
      wpisanoTile.style.gridColumn = "1 / 5"; // 2/3
      const p1Tile = h("div", { class: "c2-entrytile c2-map-p1tile" }, [
        h("div", { class: "c2-field-label", text: t("control.finalHost.player1Label") }),
        h("div", { class: "c2-entrytile-p1ans" }, [h("b", { text: resolveP1AnswerShown(state, idx) })]),
      ]);
      p1Tile.style.gridRow = "1";
      p1Tile.style.gridColumn = "5 / 7"; // 1/3
      row1Tiles = [wpisanoTile, p1Tile];
    } else {
      wpisanoTile.style.gridColumn = "1 / 7"; // pełna szerokość
      row1Tiles = [wpisanoTile];
    }

    // Nazwa przycisku ZOSTAJE ("Pokaż odpowiedź"/"Pokaż punkty", ta sama co
    // dawniej) — dopisana jest tylko DRUGA LINIJKA pokazująca na bieżąco, co
    // się odsłoni po kliknięciu. Wartość w podglądzie jest aria-hidden —
    // dostępna nazwa przycisku zostaje stała, ten sam wzorzec co c2-tile-sub
    // przy X w Rundach. Wiersz 6 (DÓŁ), z CAŁYM PUSTYM wierszem 5 jako
    // przerwą przed nim (zgłoszone: "chodzi mi o cały rząd przerwy", nie
    // tylko margines) — siatka tego ekranu ma więc 6 wierszy, nie 5
    // (nadpisane inline niżej, tileGridForMapping).
    const revealAnswerTile = armableTile(`map-answer:${round}:${idx}`,
      h("div", {}, [
        document.createTextNode(t("control.finalRevealAnswerLabel")),
        h("div", { class: "c2-tile-sub", "aria-hidden": "true", text: row.revealedAnswer ? (row.outText || t("control.dash")) : preview.text }),
      ]),
      {
        row: 6, col: HALF(0), cls: "c2-tile-primary",
        // Ta sama blokada co w Rundach, teraz oparta o długość dźwięku —
        // "Pokaż punkty" i tak nie odblokuje się, dopóki dźwięk "Pokaż
        // odpowiedź" (soundCueKey "reveal", REVEAL_ANSWER_ONLY) nie dogra.
        disabled: locked || revealLocked(),
        onclick: async () => {
          if (row.kind == null) await emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, ...defaultResolve(inputText) });
          armRevealCooldown("reveal");
          await emit("game.dispatch", { type: "REVEAL_ANSWER_ONLY", round, idx });
        },
      });
    const revealPointsTile = armableTile(`map-points:${round}:${idx}`,
      h("div", {}, [
        document.createTextNode(t("control.finalRevealPointsLabel")),
        h("div", { class: "c2-tile-sub", "aria-hidden": "true", text: row.revealedPoints ? String(row.pts) : String(preview.pts) }),
      ]),
      {
        row: 6, col: HALF(1), cls: "c2-tile-primary",
        disabled: !row.revealedAnswer || row.revealedPoints || revealLocked(),
        // REVEAL_POINTS zwraca soundCueKey "answer_correct"/"answer_wrong"
        // zależnie od row.kind (engine.js) — kind jest już znane w tym
        // momencie, bo kafel jest klikalny dopiero po odsłonięciu odpowiedzi.
        onclick: () => { armRevealCooldown(row.kind === "MATCH" ? "answer_correct" : "answer_wrong"); emit("game.dispatch", { type: "REVEAL_POINTS", round, idx }); },
      });

    const matchOptions = (question?.answers || []).map((a) => ({
      text: `${a.text} (${a.fixed_points})`,
      active: !p2IsRepeat && effective.kind === "MATCH" && effective.matchId === a.id,
      disabled: locked || !hasTyped,
      onclick: () => emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, mode: "MANUAL", kind: "MATCH", matchId: a.id, outText: a.text, pts: a.fixed_points }),
    }));
    const missOption = {
      // Pod nazwą przycisku, w nawiasie, DOSŁOWNIE stała etykieta
      // "(odpowiedź gracza)" — sama WARTOŚĆ jest już widoczna na kaflu
      // odsłaniania (jego podgląd pokazuje, co konkretnie się odsłoni), więc
      // tu nie powtarzamy jej drugi raz, tylko podpisujemy, co reprezentuje
      // ta opcja. Stała nazwa + aria-hidden druga linijka, ten sam wzorzec
      // co kafle odsłaniania.
      content: hasTyped ? h("div", {}, [
        document.createTextNode(t("control.finalUi.mapBtnMiss")),
        h("div", { class: "c2-tile-sub", "aria-hidden": "true", text: t("control.finalUi.mapMissSubLabel") }),
      ]) : t("control.finalUi.mapBtnMiss"),
      active: !p2IsRepeat && effective.kind === "MISS",
      disabled: locked || !hasTyped,
      danger: true,
      onclick: () => emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, mode: "MANUAL", kind: "MISS", matchId: null, outText: inputText, pts: 0 }),
    };
    const skipOption = {
      text: t("control.finalUi.mapBtnSkip"),
      active: !p2IsRepeat && effective.kind === "SKIP",
      disabled: locked || hasTyped,
      onclick: () => emit("game.dispatch", { type: "RESOLVE_MAPPING", round, idx, mode: "MANUAL", kind: "SKIP", matchId: null, outText: "", pts: 0 }),
    };
    const options = [...matchOptions, missOption, skipOption];
    // Powtórzenie (tylko runda 2) — control/js/gameFinal.js's data-kind="repeat":
    // JEDNOKIERUNKOWO włącza (klik gdy już aktywne to no-op), nigdy nie
    // blokuje pozostałych przycisków (operator może potem kliknąć MATCH/MISS/
    // SKIP, co samo z siebie zgasi flagę repeat przez SET_ENTRY_TEXT/
    // RESOLVE_MAPPING — patrz app.js). Dostępne niezależnie od hasTyped
    // (allowRepeat = isR2, "nigdy disabled" poza revealedAnswer/Points).
    if (round === 2) {
      options.push({
        text: t("control.finalUi.p2RepeatOff"),
        active: p2IsRepeat,
        disabled: locked,
        danger: true,
        onclick: () => {
          if (locked || f.runtime.p2[idx]?.repeat === true) return;
          emit("game.dispatch", { type: "SET_REPEAT", round: 2, idx, repeat: true });
        },
      });
    }

    // Siatka wyboru 3x3 (zawsze 3 rzędy, zgłoszone: "przyciski wyboru mają
    // się układać w 3 rzędach a nie dwóch") — dokładnie jak stare
    // gameFinal.js's `tiles = [...matchTiles, ...actionTiles].slice(0,9)`
    // dopełnione pustymi `mapSlot`-ami do 9, żeby rytm siatki był stały
    // niezależnie od liczby prawdziwych odpowiedzi na liście.
    const optionTiles = options.slice(0, 9).map((o, i) => tile(o.content || o.text, {
      row: Math.floor(i / 3) + 2,
      col: THIRD(i % 3),
      cls: [o.active && "c2-tile-primary", o.danger && "c2-tile-danger"].filter(Boolean).join(" "),
      disabled: o.disabled,
      onclick: o.onclick,
    }));
    while (optionTiles.length < 9) {
      const slotEl = h("div", { class: "c2-tile-slot" });
      slotEl.style.gridRow = String(Math.floor(optionTiles.length / 3) + 2);
      slotEl.style.gridColumn = THIRD(optionTiles.length % 3);
      optionTiles.push(slotEl);
    }

    // 6 wierszy zamiast domyślnych 5 (nadpisanie inline, tylko tu — Rundy
    // mają teraz 6 wierszy przez własne nadpisanie w renderRounds): wiersz 5
    // celowo PUSTY, żeby dać kaflom odsłaniania w wierszu 6 CAŁY wiersz
    // przerwy nad sobą, nie tylko margines. Wszystkie 6 wierszy równe —
    // wcześniejsze przeważanie wiersza 1 (Wpisano) było próbą naprawienia
    // wysokości POLA przez wysokość WIERSZA; prawdziwa naprawa (zgłoszone:
    // "pola wpisywania lepiej żeby były na wysokość kafelka") jest w CSS
    // (.c2-entrytile-input input's flex:1/height:100%) — samo pole
    // wypełnia teraz cały kafelek niezależnie od tego, ile miejsca ma wiersz.
    const mappingGrid = tileGrid([...row1Tiles, revealAnswerTile, revealPointsTile, ...optionTiles]);
    mappingGrid.style.gridTemplateRows = "repeat(6, minmax(0,1fr))";

    const body = [
      h("div", { class: "c2-question", text: question?.text || t("control.finalUi.questionLabel", { n: idx + 1 }) }),
      h("div", { class: "c2-roundlayout" }, [
        h("div", { class: "c2-roundlayout-main" }, [mappingGrid]),
        h("div", { class: "c2-roundlayout-divider" }),
        h("div", { class: "c2-roundlayout-side" }, [hintBlock(getFinalHint(state))]),
      ]),
    ];

    // NEXT_QUESTION's `idx` to 1-bazowy numer PYTANIA, z którego schodzimy
    // (nextIdx = action.idx+1 w engine.js) — nie 0-bazowy indeks tablicy,
    // którym operuje reszta tego ekranu. Bez +1 operator zostawałby
    // uwięziony na tym samym pytaniu (nextIdx trafiałby z powrotem w ten
    // sam krok). Pasek nawigacji ZAWSZE widoczny (zgłoszone: "jak w starym
    // Control"), "Dalej" wyszarzony/nieklikalny dopóki punkty nie są
    // odsłonięte — nie znika, tylko czeka zablokowany (onclick też
    // undefined, nie tylko atrybut disabled — podwójne zabezpieczenie przed
    // przedwczesnym przejściem dalej).
    const nav = [h("button", {
      class: "c2-btn primary", type: "button",
      disabled: row.revealedPoints ? undefined : "",
      onclick: row.revealedPoints ? () => emit("game.dispatch", { type: "NEXT_QUESTION", round, idx: idx + 1 }) : undefined,
    }, [document.createTextNode(t("common.next"))])];

    gameplayShell({ stepLabel: t("control.finalMappingStepLabel", { n: idx + 1 }), body, nav });
  }

  function renderFinalP2Start(state) {
    gameplayShell({
      stepLabel: t("control.finalP2StartStepLabel"),
      body: [h("div", { class: "c2-intro" }, [
        h("div", { class: "c2-intro-title", text: t("control.finalP2StartName") }),
        h("div", { class: "c2-intro-hint", text: t("control.finalP2StartHint") }),
        // Próbka dźwięku powtórzenia — POD napisem, na środku (jak reszta
        // c2-intro), NIE w dolnym pasku nawigacji obok "Rozpocznij 2 rundę"
        // (stare control.html trzymało oba przyciski razem w stepFoot —
        // zgłoszone jako złe miejsce). c2-btn-repeat — TA SAMA klasa co
        // przycisk "Powtórzenie" w wierszach wpisywania (renderFinalEntry),
        // żeby "sample" był identyczny wielkościowo i kolorystycznie z
        // prawdziwym przełącznikiem powtórzenia. Czysto lokalny podgląd
        // dźwięku, bez zapisu do stanu gry (patrz app.js's "final.repeatTest").
        h("button", { class: "c2-btn-repeat", type: "button", onclick: () => emit("final.repeatTest") }, [document.createTextNode(t("control.finalRepeatSound"))]),
      ])],
      nav: [h("button", { class: "c2-btn primary c2-intro-btn", onclick: () => emit("game.dispatch", { type: "START_P2_ROUND" }) }, [document.createTextNode(t("control.finalP2StartBtn"))])],
    });
  }

  // Ten sam c2-intro hero co "Rozpoczęcie gry"/"Koniec gry" (zgłoszone: ma
  // wyglądać podobnie) — wcześniej goły <p>, jedyny niedopasowany ekran w
  // całym Finale. Jedna linia wyniku (gameEndSummary, ta sama co "Koniec
  // gry" — suma finału jest już wtopiona w rounds.totals, patrz engine.js's
  // FINISH_FINAL) + dwa przyciski, tak samo jak "Koniec gry".
  function renderFinalEnd(state) {
    renderEndScreen(state, { revealAction: { type: "FINISH_FINAL" }, isFinal: true });
  }

  function render(state, ctx = {}) {
    updateTopbarDots(state, ctx.presenceFlags);
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
    root.appendChild(h("div", { class: "c2-card-inner" }, [h("p", { text: t("control.unhandledStepDebug", { step: s }) })]));
  }

  return { render };
}
