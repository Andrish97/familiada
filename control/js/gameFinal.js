// /familiada/control/js/gameFinal.js
import { playSfx } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createFinal({ ui, store, devices, display, loadAnswers }) {
  let timerRAF = null;

  function F() {
    return store.state.final;
  }

  function setStep(step) {
    const f = F();
    f.step = step;
    store.setFinalState({ step });
    ui.showFinalStep(step);
  }

  function clearTimer() {
    const f = F();
    f.timer.running = false;
    f.timer.endsAt = 0;
    f.timer.secLeft = 0;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    timerRAF = null;
    ui.setFinalTimerText("—");
  }

  function startTimer(sec) {
    const f = F();
    clearTimer();

    f.timer.running = true;
    f.timer.endsAt = Date.now() + sec * 1000;
    f.timer.secLeft = sec;
    ui.setFinalTimerText(String(sec));

    const tick = () => {
      const ff = F();
      if (!ff.timer.running) return;

      const left = Math.max(0, ff.timer.endsAt - Date.now());
      const s = Math.ceil(left / 1000);
      ff.timer.secLeft = s;
      ui.setFinalTimerText(String(s));

      if (left <= 0) {
        ff.timer.running = false;
        ff.timer.secLeft = 0;
        ui.setFinalTimerText("0");
        playSfx("answer_wrong");
        return;
      }
      timerRAF = requestAnimationFrame(tick);
    };

    timerRAF = requestAnimationFrame(tick);
  }

  function bootIfNeeded() {
    const f = F();
    if (!f.step) {
      store.setFinalState({ step: "f_start" });
    }
    ui.showFinalStep(f.step || "f_start");
    ui.setFinalSum(f.sum || 0);
    ui.setFinalTimerText("—");
  }

  async function startFinal() {
    const hasFinal = store.state.hasFinal === true;
    if (!hasFinal) {
      ui.setMsg("msgFinal", "Ten mecz nie ma finału.");
      return;
    }

    const f = F();
    const picked = f.picked || [];
    if (picked.length !== 5) {
      ui.setMsg("msgFinal", "Musisz mieć wybrane i zatwierdzone 5 pytań finału.");
      return;
    }

    await display.finalBoardPlaceholders();
    await display.finalSetSuma(0);
    ui.setFinalSum(0);

    clearTimer();
    playSfx("final_intro");

    setStep("f_p1_entry");
    ui.setMsg("msgFinal", "Finał uruchomiony.");
  }

  function buildInputs(which) {
    const f = F();
    const answers = which === 1 ? f.p1.answers : f.p2.answers;
    const idPrefix = which === 1 ? "p1" : "p2";

    const html = answers
      .map(
        (val, i) => `
        <div class="field finalRow">
          <div class="lbl2">Pytanie ${i + 1}</div>
          <input class="inp" id="final_${idPrefix}_q${i + 1}" autocomplete="off" value="${(val || "").replaceAll('"','&quot;')}"/>
        </div>
      `
      )
      .join("");

    ui.setFinalInputs(html, which);

    for (let i = 0; i < 5; i++) {
      const inp = document.getElementById(`final_${idPrefix}_q${i + 1}`);
      if (!inp) continue;
      inp.addEventListener("input", () => {
        const v = String(inp.value ?? "");
        if (which === 1) {
          f.p1.answers[i] = v;
        } else {
          f.p2.answers[i] = v;
        }
        store.setFinalState({ p1: f.p1, p2: f.p2 });
      });
    }
  }

  function buildMapping(which, qIndex) {
    const f = F();
    const q = qIndex - 1;
    const idPrefix = which === 1 ? "p1" : "p2";
    const answers = which === 1 ? f.p1.answers : f.p2.answers;
    const pts = which === 1 ? f.p1.points : f.p2.points;

    const val = answers[q] || "";
    const pt = pts[q] || 0;

    const html = `
      <div class="field">
        <div class="lbl2">Odpowiedź</div>
        <div class="qPrompt">${val || "—"}</div>
      </div>
      <div class="field">
        <div class="lbl2">Punkty</div>
        <input class="inp" id="final_${idPrefix}_pts${qIndex}" type="number" min="0" max="99" value="${pt}"/>
      </div>
    `;

    ui.setFinalMapping(html, which, qIndex);

    const inp = document.getElementById(`final_${idPrefix}_pts${qIndex}`);
    if (inp) {
      inp.addEventListener("input", () => {
        const v = nInt(inp.value, 0);
        if (which === 1) {
          f.p1.points[q] = v;
        } else {
          f.p2.points[q] = v;
        }
        store.setFinalState({ p1: f.p1, p2: f.p2 });
      });
    }
  }

  function recalcSumAndDisplay() {
    const f = F();
    const s1 = (f.p1.points || []).reduce((a,b) => a + nInt(b,0), 0);
    const s2 = (f.p2.points || []).reduce((a,b) => a + nInt(b,0), 0);
    const sum = s1 + s2;
    f.sum = sum;
    store.setFinalState({ sum });

    ui.setFinalSum(sum);
    display.finalSetSuma(sum);
  }

  function backTo(step) {
    setStep(step);
  }

  function p1StartTimer() {
    startTimer(15);
  }

  function toP1MapQ(n) {
    buildMapping(1, n);
    setStep(`f_p1_map_q${n}`);
  }

  function nextFromP1Q(n) {
    buildMapping(1, n);
    recalcSumAndDisplay();
    if (n < 5) {
      toP1MapQ(n + 1);
    } else {
      setStep("f_p2_start");
    }
  }

  function startP2Round() {
    const f = F();
    playSfx("final_round2");
    display.finalHideAnswersKeepSum();
    clearTimer();
    setStep("f_p2_entry");
    buildInputs(2);
  }

  function p2StartTimer() {
    startTimer(20);
  }

  function toP2MapQ(n) {
    buildMapping(2, n);
    setStep(`f_p2_map_q${n}`);
  }

  function nextFromP2Q(n) {
    buildMapping(2, n);
    recalcSumAndDisplay();
    if (n < 5) {
      toP2MapQ(n + 1);
    } else {
      setStep("f_end");
      const f = F();
      const txt =
        f.sum >= 200
          ? `Wygrana! Suma: ${f.sum}.`
          : `Brak wygranej. Suma: ${f.sum}.`;
      const el = document.getElementById("finalEndHint");
      if (el) el.textContent = txt;
    }
  }

  function finishFinal() {
    const f = F();
    if (f.sum >= 200) {
      display.showWin(f.sum);
    } else {
      // brak WIN – tylko logo z powrotem
      display.hideLogo().catch(() => {});
    }
    clearTimer();
    store.setFinalState({ step: "f_start", sum: 0 });
    ui.showFinalStep("f_start");
    ui.setFinalSum(0);
    ui.setFinalTimerText("—");
  }

  return {
    bootIfNeeded,
    startFinal,
    backTo,

    p1StartTimer,
    toP1MapQ,
    nextFromP1Q,

    startP2Round,
    p2StartTimer,
    toP2MapQ,
    nextFromP2Q,

    finishFinal,
  };
}
