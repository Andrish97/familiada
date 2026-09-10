// display2/js/render.js
//
// Tłumaczy wiersz public.game_state (a dokładniej: różnicę między
// poprzednim a nowym wierszem, przez shared/deriveEvents.js) na wywołania
// display2/js/scene.js's `api` — bez żadnego pośredniego formatu
// tekstowego (patrz plan, sekcja 5, "Konkretnie dla Display").
//
// Dwa tryby, dokładnie jak w planie:
// - renderSnapshot(row): pierwsze wejście/reconnect — maluje CAŁY bieżący
//   stan naraz, bez animacji (nie ma "poprzedniego" stanu do porównania).
// - renderDiff(prevRow, nextRow): każda kolejna zmiana na żywo — liczy
//   zdarzenia przez deriveEvents i dla każdego woła konkretny fragment
//   `api` z animacją zaszytą na sztywno (tabelka z planu, sekcja 2/2a).
//
// UWAGA: to pierwszy przebieg tego mapowania — pokrywa główne, najczęściej
// używane ścieżki (start rundy, odsłonięcie odpowiedzi, X, kradzież, koniec
// rundy/gry, finał, tryb QR/czarny ekran, timer). Drobne niuanse
// wieloetapowej choreografii z dzisiejszego control/js/display.js (dokładne
// opóźnienia między krokami tej samej zmiany) wymagają dostrojenia
// wizualnego względem prawdziwego wyglądu — nie zgadywane tu na ślepo.

import { deriveEvents } from "../../shared/deriveEvents.js?v=v2026-09-10T20410";
import { resolveRoundsEndScreen, resolveFinalEndScreen } from "../../shared/endScreen.js?v=v2026-09-10T20410";
import {
  ROUND_INTRO_ANIM,
  ROUND_OUT_ANIM,
  ANSWER_ANIM,
  FINAL_BOARD_ANIM,
  FINAL_OUT_ANIM,
  LOGO_IN_ANIM,
  LOGO_OUT_ANIM,
} from "../../shared/displayAnim.js?v=v2026-09-10T20410";

function pad3(n) { return String(Math.max(0, Number(n) || 0)).padStart(3, " "); }

export function createRenderer({ scene, qr }) {
  const { api } = scene;
  let timerHandle = null;

  function stopTimerTick() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  function startTimerTick(row) {
    stopTimerTick();
    const timer = row.detail?.final?.runtime?.timer;
    if (!timer?.running) return;
    const winnerTeam = row.detail?.final?.winnerTeam;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        // control/js/gameFinal.js's startTimerForPhase(): przy wygaśnięciu
        // NA ŻYWO stary Control jawnie kazał Displayowi "restoreTotalsTriplets()"
        // — wrócić do prawdziwych wyników drużyn zamiast zamrożonych zer.
        // Tu Display robi to SAM, z własnego zegara (endsAt to i tak
        // jedyne wiążące źródło — to nic nowego, ten sam sposób liczenia co
        // samo tykanie wyżej), zamiast czekać na komendę/nowy zapis stanu.
        // Bez tego: gdyby Control było zamknięte dokładnie w momencie
        // wygaśnięcia (zgłoszone: "jest timer na wyświetlaczu, który
        // zostanie przerwany"), Wyświetlacz zostawałby zamrożony na "00"
        // dla widzów, dopóki Control by nie wrócił i nie dopisał
        // EXPIRE_TIMER do game_state — game_state.detail.final.runtime.timer.running
        // może więc chwilowo mijać się z prawdą (nieaktualizowane, bo
        // Control nieobecny), ale to nie problem: to jest czysto lokalna
        // decyzja RENDEROWANIA z tego samego endsAt, nie nowe źródło
        // prawdy — kiedy Control faktycznie dopisze EXPIRE_TIMER, ten sam
        // paintTotals() i tak wykona się ponownie (TIMER_STOPPED), bez
        // różnicy w wyniku.
        stopTimerTick();
        paintTotals(row);
        return;
      }
      const digits = String(remaining).padStart(2, "0");
      if (winnerTeam === "A") api.small.leftDigits(digits); else api.small.rightDigits(digits);
    };
    tick();
    timerHandle = setInterval(tick, 250);
  }

  function paintTotals(row) {
    const totals = row.detail?.rounds?.totals || { A: 0, B: 0 };
    api.small.leftDigits(String(totals.A ?? 0));
    api.small.rightDigits(String(totals.B ?? 0));
  }

  // control/js/gameFinal.js's startFinal()/startP2Round(): tuż po wejściu
  // w f_p1_entry/f_p2_entry (zanim operator w ogóle kliknie "start timera")
  // strona zwycięskiej drużyny dostaje "15"/"20" jako zapowiedź — TIMER_STARTED
  // dopiero potem zaczyna właściwe odliczanie tych samych cyfr w dół.
  function showTimerPlaceholder(row, text) {
    const winnerTeam = row.detail?.final?.winnerTeam;
    if (winnerTeam === "A") api.small.leftDigits(text);
    else if (winnerTeam === "B") api.small.rightDigits(text);
  }

  function applyIndicator(row) {
    if (row.control_team === "A") return api.indicator.set("ON_A");
    if (row.control_team === "B") return api.indicator.set("ON_B");
    if (row.detail?.locks?.finalActive && row.detail?.final?.winnerTeam) {
      return api.indicator.set(row.detail.final.winnerTeam === "A" ? "ON_A" : "ON_B");
    }
    api.indicator.set("OFF");
  }

  async function applyDisplayMode(row) {
    const mode = row.detail?.display?.mode || "BLACK";
    if (mode === "QR") {
      qr.show(row.detail.display.qr);
      return;
    }
    qr.hide();
    if (mode === "BLACK") {
      api.big.clear();
      api.small.clearAll();
      api.indicator.set("OFF");
      return;
    }
    // mode === "GAME" — namaluj planszę odpowiednią dla bieżącego kroku.
    await paintForStep(row);
  }

  // control/js/display.js's PLACE.roundsText/roundsPts — sloty nieodkryte
  // pokazują placeholder (nie pustkę), żeby widzowie widzieli ILE jest
  // odpowiedzi do zgadnięcia, nie tylko te już odkryte.
  const ROUNDS_TEXT_PLACEHOLDER = "…".repeat(17);
  const ROUNDS_PTS_PLACEHOLDER = "——";

  async function paintRoundsBoard(row, { animIn, animOut } = {}) {
    const r = row.detail.rounds;
    const answerCount = Math.max(1, Math.min(6, r.answers?.length || 6));
    const rows = Array.from({ length: 6 }, (_, i) => {
      const ord = i + 1;
      const ans = r.answers?.find((a) => a.ord === ord);
      const revealed = (r.revealed || []).includes(ord);
      if (revealed && ans) return { text: ans.text, pts: String(ans.fixed_points) };
      if (ord <= answerCount) return { text: ROUNDS_TEXT_PLACEHOLDER, pts: ROUNDS_PTS_PLACEHOLDER };
      return { text: "", pts: "" };
    });
    // await: animOut MUSI dobiec końca, zanim cokolwiek innego zacznie
    // rysować na tym samym płótnie ("big") — inaczej dwie animacje na raz
    // (np. logo wchodzące i stara plansza rund jeszcze schodząca) nakładają
    // się wizualnie (zgłoszone: "wszystko się nakłada jedno na drugie").
    await api.rounds.setAll({ rows, suma: String(r.bankPts ?? 0), animIn, animOut });
    for (const key of ["1A", "2A", "3A", "4A", "1B", "2B", "3B", "4B"]) {
      const [n, side] = [key[0], key[1]];
      const count = side === "A" ? r.xA : r.xB;
      const isBigSlot = n === "4";
      const on = isBigSlot
        ? (side === (r.steal?.team) && r.steal?.used && r.steal?.won === false)
        : Number(n) <= (count || 0);
      api.rounds.setX(key, !!on);
    }
    api.small.topDigits(pad3(r.bankPts));
    paintTotals(row);
    applyIndicator(row);
  }

  // control/js/display.js's PLACE.finalText/finalPts — tak samo jak w
  // rundach, nieodkryte pola dostają placeholder, nie pustkę.
  const FINAL_TEXT_PLACEHOLDER = "—".repeat(11);
  const FINAL_PTS_PLACEHOLDER = "▒▒";

  async function paintFinalBoard(row, { animIn } = {}) {
    const f = row.detail.final;
    const rows = Array.from({ length: 5 }, (_, i) => {
      const m1 = f.runtime.map1[i], m2 = f.runtime.map2[i];
      return {
        left: m1?.revealedAnswer ? m1.outText : FINAL_TEXT_PLACEHOLDER,
        a: m1?.revealedPoints ? String(m1.pts) : FINAL_PTS_PLACEHOLDER,
        b: m2?.revealedPoints ? String(m2.pts) : FINAL_PTS_PLACEHOLDER,
        right: m2?.revealedAnswer ? m2.outText : FINAL_TEXT_PLACEHOLDER,
      };
    });
    await api.final.setAll({ rows, animIn });
    applyIndicator(row);
    startTimerTick(row);
    if (!f.runtime.timer?.running) paintTotals(row);
  }

  // Nazwy drużyn (LONG1/LONG2 w starym systemie) — dziś malowane wprost z
  // detail.teams, zamiast wysyłane raz przez stateGameReady(). Widoczne
  // przez całą właściwą rozgrywkę (rundy+finał), tak jak w oryginale.
  function paintTeamNames(row) {
    const teams = row.detail?.teams || {};
    api.small.long1(teams.teamA || "");
    api.small.long2(teams.teamB || "");
  }

  async function paintForStep(row) {
    // r_intro MUSI być sprawdzone przed top_card==="rounds" — r_intro sam
    // ma top_card="rounds" (cała sekcja Rund, patrz plan, tabela A), więc
    // sprawdzenie w odwrotnej kolejności nigdy by tu nie trafiło (ten sam
    // bug: renderSnapshot()/reconnect W TRAKCIE r_intro malowałby pustą
    // planszę rund zamiast logo — renderDiff()'s STEP_CHANGE do "r_intro"
    // niżej to zawsze robił poprawnie, tylko pierwsze malowanie nie).
    // Nazwy drużyn są już wtedy znane (denormalizowane z game-settings
    // przed startem gry) — pokazujemy je na "small" razem z logo na "big",
    // to dwa niezależne płótna.
    if (row.step === "r_intro") { paintTeamNames(row); await api.logo.show(); return; }
    if (row.top_card === "rounds") { paintTeamNames(row); await paintRoundsBoard(row); return; }
    if (row.top_card === "final") { paintTeamNames(row); await paintFinalBoard(row); return; }
    api.big.clear();
  }

  async function showEndScreen(row) {
    api.indicator.set("OFF");
    api.small.topDigits("000");
    if (row.top_card === "rounds") {
      const totals = row.detail.rounds.totals || { A: 0, B: 0 };
      const screen = resolveRoundsEndScreen(row.detail.settings, { isDraw: totals.A === totals.B, totals });
      if (screen.kind === "logo") await api.logo.show(LOGO_IN_ANIM);
      else await api.win.set(screen.amount, { animIn: LOGO_IN_ANIM });
      return;
    }
    // Sama plansza finału jest w tym momencie WCIĄŻ w pełni namalowana na
    // "big" (nic wcześniej jej nie chowa — inaczej niż r_gameEnd, gdzie
    // STEP_CHANGE do "r_gameEnd" już wcześniej odpalił animOut na etapie
    // "Zakończ rundę") — bez tego animOut logo/WIN rysowałoby się WPROST na
    // planszy finału, ten sam rodzaj artefaktu co naprawiony wcześniej przy
    // pierwszej rundzie. Stary plan (sekcja 2a, F14): "FBATCH ANIMOUT edge
    // down 1000" zawsze PRZED ekranem końcowym finału — osobna komenda od
    // R10's RBATCH ANIMOUT, ale ten sam mechanizm (ROUND_OUT_ANIM).
    await api.big.animOut(ROUND_OUT_ANIM);
    const winnerTeam = row.detail.final.winnerTeam;
    const totals = row.detail.rounds.totals || { A: 0, B: 0 };
    const screen = resolveFinalEndScreen(row.detail.settings, {
      totalPointsAll: totals[winnerTeam] || 0,
      hitTarget: !!row.detail.final.runtime.reached200,
    });
    if (screen.kind === "logo") await api.logo.show(LOGO_IN_ANIM);
    else await api.win.set(screen.amount, { animIn: LOGO_IN_ANIM });
  }

  // ============================================================
  // Pierwsze renderowanie / reconnect — bez animacji.
  // ============================================================
  async function renderSnapshot(row) {
    stopTimerTick();
    if (row.detail?.display?.colors) {
      const c = row.detail.display.colors;
      if (c.A) api.color.set("A", c.A);
      if (c.B) api.color.set("B", c.B);
      if (c.BACKGROUND) api.color.set("BG", c.BACKGROUND);
      if (c.DOT) api.color.set("DOT", c.DOT);
    }
    if (row.detail?.display?.theme) api.theme.set(row.detail.display.theme);

    if (row.detail?.locks?.gameEnded) { await showEndScreen(row); return; }
    await applyDisplayMode(row);
  }

  // ============================================================
  // Kolejne zmiany na żywo.
  // ============================================================
  // WAŻNE: async i await w KAŻDYM branchu, który rysuje na współdzielonym
  // płótnie "big" (logo/plansza rund/plansza finału/WIN) — zgłoszony bug
  // ("wszystko się nakłada jedno na drugie") miał jedną przyczynę: kolejne
  // animacje na tym samym płótnie odpalane RÓWNOLEGLE (fire-and-forget)
  // zamiast po kolei. deriveEvents może w JEDNYM wywołaniu zwrócić kilka
  // zdarzeń dla tej samej zmiany stanu (np. STEP_CHANGE do "r_gameEnd" I
  // GAME_ENDED naraz — patrz shared/deriveEvents.js) — bez await nad pętlą
  // drugie zdarzenie zaczynało rysować, zanim pierwsze skończyło znikać.
  // Stare control/js/gameRounds.js/gameFinal.js robiły to zawsze przez
  // `await display.coś()` w ścisłej kolejności — to jest dokładnie ten sam
  // wzorzec, tylko przeniesiony na stronę odbiorcy (Display samo sekwencjonuje
  // to, co kiedyś sekwencjonował nadawca poleceń).
  async function renderDiff(prevRow, nextRow) {
    const events = deriveEvents(prevRow, nextRow);
    for (const ev of events) {
      switch (ev.kind) {
        case "SNAPSHOT_RENDER":
          await renderSnapshot(nextRow);
          break;
        case "STEP_CHANGE":
          if (ev.to === "r_duel" && ev.from === "r_roundStart") {
            // Pierwsza runda: LOGO HIDE (await — MUSI dobiec końca, inaczej
            // logo i wjeżdżająca plansza nakładają się) DOPIERO POTEM sama
            // SUMA...ANIMIN (plansza wjeżdża na pusto) — dokładnie
            // control/js/gameRounds.js's startRound(): `await display.hideLogo()`
            // zawsze PRZED roundsBoardPlaceholders(), nigdy równolegle.
            // Kolejne rundy: najpierw ANIMOUT starej planszy, DOPIERO PO NIM
            // (setAll() sam sekwencjonuje wewnątrz) nowa SUMA...ANIMIN —
            // control/js/display.js's roundsBoardPlaceholdersNewRound().
            const isFirstRound = nextRow.detail.rounds.roundNo === 1;
            if (isFirstRound) await api.logo.hide(LOGO_OUT_ANIM);
            await paintRoundsBoard(nextRow, { animIn: ROUND_INTRO_ANIM, animOut: isFirstRound ? null : ROUND_OUT_ANIM });
          } else if (ev.to === "r_gameEnd" || ev.to === "f_start") {
            await api.big.animOut(ROUND_OUT_ANIM);
            if (ev.to === "f_start") await paintFinalBoard(nextRow, { animIn: FINAL_BOARD_ANIM });
          } else if (ev.to === "f_p1_entry" && ev.from === "f_start") {
            // control/js/gameFinal.js's startFinal(): zapowiedź "15" po
            // stronie zwycięzcy, zanim operator w ogóle uruchomi timer.
            showTimerPlaceholder(nextRow, "15");
          } else if (ev.to === "f_p2_start") {
            // Zamaskuj odpowiedzi gracza 1 z powrotem na placeholdery.
            const rows = Array.from({ length: 5 }, () => ({ left: FINAL_TEXT_PLACEHOLDER, a: FINAL_PTS_PLACEHOLDER }));
            await api.final.setHalf("A", { rows, animOut: FINAL_OUT_ANIM });
          } else if (ev.to === "f_p2_entry" && ev.from === "f_p2_start") {
            // Naprawiona luka (uzgodniona z Tobą, patrz engine.js's
            // START_P2_ROUND): odpowiedzi gracza 1 wracają na Display W TYM
            // SAMYM momencie co odsłonięcie Hosta (HOST_COVER_CHANGED,
            // obsłużone niżej dla host2, Display samo o tym nie wie).
            const f = nextRow.detail.final;
            const rows = Array.from({ length: 5 }, (_, i) => {
              const m1 = f.runtime.map1[i];
              return {
                left: m1?.revealedAnswer ? m1.outText : FINAL_TEXT_PLACEHOLDER,
                a: m1?.revealedPoints ? String(m1.pts) : FINAL_PTS_PLACEHOLDER,
              };
            });
            await api.final.setHalf("A", { rows, animIn: FINAL_BOARD_ANIM });
            // control/js/gameFinal.js's startP2Round(): zapowiedź "20" po
            // stronie zwycięzcy, ten sam mechanizm co przy f_p1_entry.
            showTimerPlaceholder(nextRow, "20");
          } else if (ev.to === "r_intro") {
            paintTeamNames(nextRow);
            await api.logo.show();
          }
          break;
        case "CONTROL_CHANGED":
          applyIndicator(nextRow);
          break;
        case "ANSWER_REVEALED": {
          const r = nextRow.detail.rounds;
          for (const ord of ev.ords) {
            const ans = r.answers.find((a) => a.ord === ord);
            if (!ans) continue;
            api.rounds.setRow(ord, { text: ans.text, pts: String(ans.fixed_points), animIn: ANSWER_ANIM });
          }
          // R8 (odkrywanie reszty, phase REVEAL) jest czysto pokazowe —
          // bankPts się wtedy nie zmienia (control/js/display.js's
          // roundsRevealRow tam w ogóle nie woła RSUMA/TOP) — bez tego
          // sprawdzenia SUMA dostawałaby zbędną animację na niezmienioną
          // liczbę przy każdym kliknięciu w R8.
          const prevBank = prevRow.detail?.rounds?.bankPts ?? 0;
          if (r.bankPts !== prevBank) {
            api.rounds.setSuma(String(r.bankPts ?? 0), { animIn: ANSWER_ANIM });
            api.small.topDigits(pad3(r.bankPts));
          }
          break;
        }
        case "DUEL_MISS":
          // Krótki błysk (slot 4), nie stały X — control/js/display.js's
          // roundsFlashDuelX: ON, potem OFF po ~1s, bez czekania.
          if (ev.team) {
            api.rounds.setX(`4${ev.team}`, true);
            setTimeout(() => api.rounds.setX(`4${ev.team}`, false), 1000);
          }
          break;
        case "STRIKE":
          api.rounds.setX(`${ev.count}${ev.team}`, true);
          break;
        case "STEAL_RESOLVED":
          if (!ev.won) {
            const stealTeam = nextRow.detail.rounds.steal?.team;
            if (stealTeam) api.rounds.setX(`4${stealTeam}`, true);
          }
          break;
        case "FINAL_ANSWER_REVEALED": {
          const row = nextRow.detail.final.runtime[ev.round === 1 ? "map1" : "map2"][ev.idx];
          if (ev.round === 1) api.final.setLeft(ev.idx + 1, row.outText, { animIn: ANSWER_ANIM });
          else api.final.setRight(ev.idx + 1, row.outText, { animIn: ANSWER_ANIM });
          break;
        }
        case "FINAL_POINTS_REVEALED": {
          const f = nextRow.detail.final;
          const row = f.runtime[ev.round === 1 ? "map1" : "map2"][ev.idx];
          if (ev.round === 1) api.final.setA(ev.idx + 1, String(row.pts), { animIn: ANSWER_ANIM });
          else api.final.setB(ev.idx + 1, String(row.pts), { animIn: ANSWER_ANIM });
          api.final.setSumaFor(ev.round === 1 ? "A" : "B", String(f.runtime.sum), { animIn: ANSWER_ANIM });
          break;
        }
        case "TIMER_STARTED":
          startTimerTick(nextRow);
          break;
        case "TIMER_STOPPED":
          stopTimerTick();
          paintTotals(nextRow);
          break;
        case "DISPLAY_MODE_CHANGED":
          await applyDisplayMode(nextRow);
          break;
        case "GAME_ENDED":
          // Ten sam events[] może nieść STEP_CHANGE (do "r_gameEnd") TUŻ
          // PRZED tym zdarzeniem (patrz shared/deriveEvents.js) — dzięki
          // await nad całą pętlą to zdarzenie startuje dopiero PO tym, jak
          // animOut planszy rund z poprzedniego case'a faktycznie się
          // skończył, zamiast malować logo/WIN w tym samym momencie.
          await showEndScreen(nextRow);
          break;
        // HOST_COVER_CHANGED, SOUND_CUE — nie dotyczą Display.
        default:
          break;
      }
    }
  }

  return { renderSnapshot, renderDiff };
}
