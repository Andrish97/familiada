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

import { deriveEvents } from "../../shared/deriveEvents.js?v=v2026-09-05T07201";
import { resolveRoundsEndScreen, resolveFinalEndScreen } from "../../shared/endScreen.js?v=v2026-09-05T07201";

const ROUND_INTRO_ANIM = { type: "matrix", axis: "down", ms: 1500 };
const ROUND_OUT_ANIM = { type: "edge", dir: "down", ms: 1000 };
const ANSWER_ANIM = { type: "matrix", axis: "right", ms: 500 };
const FINAL_BOARD_ANIM = { type: "matrix", axis: "down", ms: 1500 };
const FINAL_OUT_ANIM = { type: "edge", dir: "down", ms: 1000 };
const LOGO_IN_ANIM = { type: "edge", dir: "up", ms: 1000 };

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
      const digits = String(remaining).padStart(2, "0");
      if (winnerTeam === "A") api.small.leftDigits(digits); else api.small.rightDigits(digits);
      if (remaining <= 0) stopTimerTick();
    };
    tick();
    timerHandle = setInterval(tick, 250);
  }

  function paintTotals(row) {
    const totals = row.detail?.rounds?.totals || { A: 0, B: 0 };
    api.small.leftDigits(String(totals.A ?? 0));
    api.small.rightDigits(String(totals.B ?? 0));
  }

  function applyIndicator(row) {
    if (row.control_team === "A") return api.indicator.set("ON_A");
    if (row.control_team === "B") return api.indicator.set("ON_B");
    if (row.detail?.locks?.finalActive && row.detail?.final?.winnerTeam) {
      return api.indicator.set(row.detail.final.winnerTeam === "A" ? "ON_A" : "ON_B");
    }
    api.indicator.set("OFF");
  }

  function applyDisplayMode(row) {
    const mode = row.detail?.display?.mode || "BLACK";
    if (mode === "QR") {
      qr.show(row.detail.display.qrUrl);
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
    paintForStep(row);
  }

  function paintRoundsBoard(row, { animIn } = {}) {
    const r = row.detail.rounds;
    const rows = Array.from({ length: 6 }, (_, i) => {
      const ord = i + 1;
      const ans = r.answers?.find((a) => a.ord === ord);
      const revealed = (r.revealed || []).includes(ord);
      return revealed && ans ? { text: ans.text, pts: String(ans.fixed_points) } : { text: "", pts: "" };
    });
    api.rounds.setAll({ rows, suma: String(r.bankPts ?? 0), animIn });
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

  function paintFinalBoard(row, { animIn } = {}) {
    const f = row.detail.final;
    const rows = Array.from({ length: 5 }, (_, i) => {
      const m1 = f.runtime.map1[i], m2 = f.runtime.map2[i];
      return {
        left: m1?.revealedAnswer ? m1.outText : "",
        a: m1?.revealedPoints ? String(m1.pts) : "",
        b: m2?.revealedPoints ? String(m2.pts) : "",
        right: m2?.revealedAnswer ? m2.outText : "",
      };
    });
    api.final.setAll({ rows, animIn });
    applyIndicator(row);
    startTimerTick(row);
    if (!f.runtime.timer?.running) paintTotals(row);
  }

  function paintForStep(row) {
    if (row.top_card === "rounds") { paintRoundsBoard(row); return; }
    if (row.top_card === "final") { paintFinalBoard(row); return; }
    if (row.step === "r_intro") { api.logo.show(); return; }
    api.big.clear();
  }

  function showEndScreen(row) {
    api.indicator.set("OFF");
    api.small.topDigits("000");
    if (row.top_card === "rounds") {
      const totals = row.detail.rounds.totals || { A: 0, B: 0 };
      const screen = resolveRoundsEndScreen(row.detail.settings, { isDraw: totals.A === totals.B, totals });
      if (screen.kind === "logo") api.logo.show(LOGO_IN_ANIM);
      else api.win.set(screen.amount, { animIn: LOGO_IN_ANIM });
      return;
    }
    const winnerTeam = row.detail.final.winnerTeam;
    const totals = row.detail.rounds.totals || { A: 0, B: 0 };
    const screen = resolveFinalEndScreen(row.detail.settings, {
      totalPointsAll: totals[winnerTeam] || 0,
      hitTarget: !!row.detail.final.runtime.reached200,
    });
    if (screen.kind === "logo") api.logo.show(LOGO_IN_ANIM);
    else api.win.set(screen.amount, { animIn: LOGO_IN_ANIM });
  }

  // ============================================================
  // Pierwsze renderowanie / reconnect — bez animacji.
  // ============================================================
  function renderSnapshot(row) {
    stopTimerTick();
    if (row.detail?.display?.colors) {
      const c = row.detail.display.colors;
      if (c.A) api.color.set("A", c.A);
      if (c.B) api.color.set("B", c.B);
      if (c.BACKGROUND) api.color.set("BG", c.BACKGROUND);
      if (c.DOT) api.color.set("DOT", c.DOT);
    }
    if (row.detail?.display?.theme) api.theme.set(row.detail.display.theme);

    if (row.detail?.locks?.gameEnded) { showEndScreen(row); return; }
    applyDisplayMode(row);
  }

  // ============================================================
  // Kolejne zmiany na żywo.
  // ============================================================
  function renderDiff(prevRow, nextRow) {
    const events = deriveEvents(prevRow, nextRow);
    for (const ev of events) {
      switch (ev.kind) {
        case "SNAPSHOT_RENDER":
          renderSnapshot(nextRow);
          break;
        case "STEP_CHANGE":
          if (ev.to === "r_duel" && ev.from === "r_roundStart") {
            const isFirstRound = nextRow.detail.rounds.roundNo === 1;
            paintRoundsBoard(nextRow, { animIn: ROUND_INTRO_ANIM });
            if (!isFirstRound) api.big.animOut({ ...ROUND_OUT_ANIM });
          } else if (ev.to === "r_gameEnd" || ev.to === "f_start") {
            api.big.animOut(ROUND_OUT_ANIM).then(() => {
              if (ev.to === "f_start") paintFinalBoard(nextRow, { animIn: FINAL_BOARD_ANIM });
            });
          } else if (ev.to === "f_p2_start") {
            const f = nextRow.detail.final;
            const rows = Array.from({ length: 5 }, (_, i) => ({ left: "", a: "" }));
            api.final.setHalf("A", { rows, animOut: FINAL_OUT_ANIM });
          } else if (ev.to === "r_intro") {
            api.logo.show();
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
          api.rounds.setSuma(String(r.bankPts ?? 0), { animIn: ANSWER_ANIM });
          api.small.topDigits(pad3(r.bankPts));
          break;
        }
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
          applyDisplayMode(nextRow);
          break;
        case "GAME_ENDED":
          showEndScreen(nextRow);
          break;
        // HOST_COVER_CHANGED, SOUND_CUE — nie dotyczą Display.
        default:
          break;
      }
    }
  }

  return { renderSnapshot, renderDiff };
}
