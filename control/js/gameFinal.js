// ================== KOMUNIKATY (FINAL) ==================
const FINAL_MSG = {
  // --- błędy / warunki ---
  ERR_MISSING_5: "Brakuje 5 pytań finału (zatwierdź w ustawieniach).",

  // --- timer ---
  TIMER_PLACEHOLDER: "—",
  TIMER_RUNNING: "Odliczanie trwa…",

  // --- start / dostępność finału ---
  FINAL_DISABLED: "Finał jest wyłączony.",
  FINAL_NEEDS_PICK: "Zatwierdź 5 pytań finału w ustawieniach.",
  FINAL_NEEDS_POINTS: (pts) => `Finał dostępny dopiero po osiągnięciu ${pts} punktów.`,
  FINAL_STARTED: "Finał rozpoczęty.",
  R2_STARTED: "Runda 2 rozpoczęta.",

  // --- zakończenie finału / nagrody (host hint) ---
  END_NO_PRIZE: "Finał zakończony. Brak trybu nagrody — wracamy do logo.",
  END_200_PLUS: (mainPrize) => `200+! ${mainPrize}`,
  END_BELOW_200: (smallPrize) => `Poniżej 200. ${smallPrize}`,

  DEFAULT_MAIN_PRIZE: "Nagroda główna",
  DEFAULT_SMALL_PRIZE: "Nagroda",

  // --- etykiety pól / przycisków ---
  Q_LABEL: (n) => `Pytanie ${n}`,
  INPUT_PLACEHOLDER: "Wpisz…",
  BTN_CONFIRMED: "Zatwierdzone",
  BTN_CONFIRM: "Zatwierdź",

  P2_HINT_P1_PREFIX: "Odpowiedź gracza 1: ",

  P2_BTN_REPEAT_ON: "Powtórzenie ✓",
  P2_BTN_REPEAT_OFF: "Powtórzenie",

  // --- mapping / podpowiedzi prowadzącego ---
  MAP_HINT_INPUT_PREFIX: "Wpisano: ",
  MAP_HINT_NO_INPUT: "Brak wpisu",
  MAP_HINT_NO_TEXT: "Nie wpisano odpowiedzi — “Dalej” pokaże puste / 0 pkt.",
  MAP_LIST_TITLE: "Lista odpowiedzi",
  MAP_LIST_EMPTY: "Brak listy odpowiedzi.",
  MAP_OWN_TITLE: "Własna / brak",
  MAP_BTN_SKIP: "Brak odpowiedzi",
  MAP_BTN_MISS: "Nie ma na liście (0 pkt)",
  MAP_OUT_HINT: "Tekst do wyświetlenia (gdy “Nie ma na liście”).",
  MAP_OUT_PLACEHOLDER: "Tekst (0 pkt)",

  // --- fallback tekstu odpowiedzi, gdy naprawdę nic nie ma ---
  FALLBACK_ANSWER: "—",
};
// =========================================================

import { playSfx } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clip11(s) {
  const t = String(s ?? "");
  return t.length > 11 ? t.slice(0, 11) : t;
}

// Tryb końcówki:
//  - "logo"   → zawsze pokazujemy logo
//  - "points" → używamy WIN do pokazania punktów
//  - "money"  → (tylko po finale) WIN z kwotą
// Fallback: jeśli brak endScreenMode, używamy starego winEnabled.
function getEndScreenMode(store) {
  const adv = store.state?.advanced || {};
  const mode = adv.endScreenMode;

  if (mode === "logo" || mode === "points" || mode === "money") {
    return mode;
  }

  if (adv.winEnabled === true) return "points";
  return "logo";
}

export function createFinal({ ui, store, devices, display, loadAnswers }) {
  let qPicked = []; // [{id, text, ord}]
  let answersByQ = new Map(); // qid -> [{id, text, fixed_points, ord}]

  let raf = null;

  function setStep(step) {
    store.state.final.step = step;
    ui.showFinalStep(step);
  }

  function ensureRuntime() {
    const f = store.state.final;
    if (!f.runtime) f.runtime = {};
    const rt = f.runtime;

    if (!rt.p1)
      rt.p1 = Array.from({ length: 5 }, () => ({ text: "", entered: false }));
    if (!rt.p2)
      rt.p2 = Array.from({ length: 5 }, () => ({
        text: "",
        entered: false,
        repeat: false,
      }));

    if (!rt.map1)
      rt.map1 = Array.from({ length: 5 }, () => ({
        kind: "SKIP",
        matchId: null,
        outText: "",
        pts: 0,
      }));
    if (!rt.map2)
      rt.map2 = Array.from({ length: 5 }, () => ({
        kind: "SKIP",
        matchId: null,
        outText: "",
        pts: 0,
      }));

    if (!rt.sum) rt.sum = 0;

    if (!rt.timer)
      rt.timer = { running: false, endsAt: 0, seconds: 0, phase: null }; // phase: "P1"|"P2"|null
    if (!rt.done) rt.done = false;
  }

  function stopTimer() {
    const rt = store.state.final.runtime;
    rt.timer.running = false;
    rt.timer.endsAt = 0;
    rt.timer.seconds = 0;
    rt.timer.phase = null;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    ui.setText("finalTimer", FINAL_MSG.TIMER_PLACEHOLDER);
  }

  // Zwycięska drużyna (do timera na bocznym tripletcie).
  function getWinnerTeam() {
    return store.state?.winnerTeam || store.state?.final?.winnerTeam || "A";
  }

  async function loadFinalPicked() {
    const pickedIds = store.state.final.picked || [];
    const raw = sessionStorage.getItem("familiada:questionsCache");
    const all = raw ? JSON.parse(raw) : [];
    qPicked = pickedIds
      .map((id) => all.find((q) => q.id === id))
      .filter(Boolean);

    if (qPicked.length !== 5) {
      throw new Error(FINAL_MSG.ERR_MISSING_5);
    }

    answersByQ = new Map();
    for (const q of qPicked) {
      const a = await loadAnswers(q.id);
      answersByQ.set(
        q.id,
        (a || []).map((x) => ({
          id: x.id,
          ord: x.ord,
          text: x.text,
          fixed_points: nInt(x.fixed_points, 0),
        }))
      );
    }
  }

  function updateSumUI() {
    const rt = store.state.final.runtime;
    ui.setText("finalSum", String(rt.sum || 0));
  }

  async function displaySetTimerSeconds(sec) {
    const team = getWinnerTeam();
    const txt = String(Math.max(0, sec)); // bez wiodących zer
    ui.setText("finalTimer", txt);
    await display.finalSetSideTimer?.(team, txt);
  }

  function startCountdown(seconds, phase /* "P1"|"P2" */) {
    ensureRuntime();
    const rt = store.state.final.runtime;

    stopTimer();
    rt.timer.running = true;
    rt.timer.phase = phase;
    rt.timer.endsAt = Date.now() + seconds * 1000;
    rt.timer.seconds = seconds;

    displaySetTimerSeconds(seconds).catch(() => {});

    const tick = () => {
      if (!rt.timer.running) return;
      const leftMs = Math.max(0, rt.timer.endsAt - Date.now());
      const s = Math.ceil(leftMs / 1000);
      if (s !== rt.timer.seconds) {
        rt.timer.seconds = s;
        displaySetTimerSeconds(s).catch(() => {});
      }
      if (leftMs <= 0) {
        rt.timer.running = false;
        ui.setText("finalTimer", "0");
        displaySetTimerSeconds(0).catch(() => {});
        playSfx("answer_wrong"); // koniec czasu
        if (phase === "P1") ui.setEnabled("btnFinalToP1MapQ1", true);
        if (phase === "P2") ui.setEnabled("btnFinalToP2MapQ1", true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
  }

  // ---------- Render: P1 entry ----------
  function renderP1Entry() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    const html = qPicked
      .map((q, i) => {
        const val = rt.p1[i].text || "";
        const entered = rt.p1[i].entered === true;
        return `
        <div class="card" style="margin-bottom:10px;">
          <div class="name">${escapeHtml(FINAL_MSG.Q_LABEL(i + 1))}</div>
          <div class="qPrompt">${escapeHtml(q.text || "")}</div>

          <div class="rowBtns" style="margin-top:10px;">
            <input class="inp" data-p="1" data-i="${i}" value="${escapeHtml(
          val
        )}" placeholder="${escapeHtml(
          FINAL_MSG.INPUT_PLACEHOLDER
        )}" autocomplete="off"/>
            <button class="btn sm gold" type="button" data-enter="1" data-i="${i}">${
              entered
                ? escapeHtml(FINAL_MSG.BTN_CONFIRMED)
                : escapeHtml(FINAL_MSG.BTN_CONFIRM)
            }</button>
          </div>
        </div>
      `;
      })
      .join("");

    ui.setHtml("finalP1Inputs", html);

    document
      .querySelectorAll('#finalP1Inputs input[data-p="1"]')
      .forEach((inp) => {
        inp.addEventListener("input", () => {
          const i = Number(inp.dataset.i);
          rt.p1[i].text = String(inp.value ?? "");
        });
        inp.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const i = Number(inp.dataset.i);
          const next = document.querySelector(
            `#finalP1Inputs input[data-p="1"][data-i="${i + 1}"]`
          );
          next?.focus();
        });
      });

    document
      .querySelectorAll('#finalP1Inputs button[data-enter="1"]')
      .forEach((b) => {
        b.addEventListener("click", () => {
          const i = Number(b.dataset.i);
          rt.p1[i].entered = true;
          playSfx("answer_correct");
          renderP1Entry();
        });
      });

    ui.setEnabled("btnFinalToP1MapQ1", !rt.timer.running);
  }

  // ---------- Render: P2 entry ----------
  function renderP2Entry() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    const html = qPicked
      .map((q, i) => {
        const v2 = rt.p2[i].text || "";
        const entered = rt.p2[i].entered === true;
        const repeat = rt.p2[i].repeat === true;
        const p1 = (rt.p1[i].text || "").trim() || "—";
        return `
        <div class="card" style="margin-bottom:10px;">
          <div class="name">${escapeHtml(FINAL_MSG.Q_LABEL(i + 1))}</div>
          <div class="qPrompt">${escapeHtml(q.text || "")}</div>

          <div class="mini"><div class="hint">${escapeHtml(
            FINAL_MSG.P2_HINT_P1_PREFIX
          )}<b>${escapeHtml(p1)}</b></div></div>

          <div class="rowBtns" style="margin-top:10px;">
            <input class="inp" data-p="2" data-i="${i}" value="${escapeHtml(
          v2
        )}" placeholder="${escapeHtml(
          FINAL_MSG.INPUT_PLACEHOLDER
        )}" autocomplete="off"/>
            <button class="btn sm gold" type="button" data-enter="2" data-i="${i}">${
              entered
                ? escapeHtml(FINAL_MSG.BTN_CONFIRMED)
                : escapeHtml(FINAL_MSG.BTN_CONFIRM)
            }</button>
            <button class="btn sm danger" type="button" data-repeat="2" data-i="${i}">${
              repeat
                ? escapeHtml(FINAL_MSG.P2_BTN_REPEAT_ON)
                : escapeHtml(FINAL_MSG.P2_BTN_REPEAT_OFF)
            }</button>
          </div>
        </div>
      `;
      })
      .join("");

    ui.setHtml("finalP2Inputs", html);

    document
      .querySelectorAll('#finalP2Inputs input[data-p="2"]')
      .forEach((inp) => {
        inp.addEventListener("input", () => {
          const i = Number(inp.dataset.i);
          rt.p2[i].text = String(inp.value ?? "");
        });
        inp.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const i = Number(inp.dataset.i);
          const next = document.querySelector(
            `#finalP2Inputs input[data-p="2"][data-i="${i + 1}"]`
          );
          next?.focus();
        });
      });

    document
      .querySelectorAll('#finalP2Inputs button[data-enter="2"]')
      .forEach((b) => {
        b.addEventListener("click", () => {
          const i = Number(b.dataset.i);
          rt.p2[i].entered = true;
          playSfx("answer_correct");
          renderP2Entry();
        });
      });

    document
      .querySelectorAll('#finalP2Inputs button[data-repeat="2"]')
      .forEach((b) => {
        b.addEventListener("click", () => {
          const i = Number(b.dataset.i);
          rt.p2[i].repeat = !rt.p2[i].repeat;
          playSfx("answer_repeat");
          renderP2Entry();
        });
      });

    ui.setEnabled("btnFinalToP2MapQ1", !rt.timer.running);
  }

  // ---------- Render: mapping (one question) ----------
  function renderMapOne(roundNo /*1|2*/, idx /*0..4*/) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const q = qPicked[idx];
    const aList = answersByQ.get(q.id) || [];

    const input = (roundNo === 1 ? rt.p1[idx].text : rt.p2[idx].text).trim();
    const mapArr = roundNo === 1 ? rt.map1 : rt.map2;
    const row = mapArr[idx];

    const hostHint = input.length
      ? `${escapeHtml(FINAL_MSG.MAP_HINT_INPUT_PREFIX)}<b>${escapeHtml(
          input
        )}</b>`
      : `<i>${escapeHtml(FINAL_MSG.MAP_HINT_NO_INPUT)}</i>`;

    const left = aList
      .map((a) => {
        const active = row.kind === "MATCH" && row.matchId === a.id;
        return `
        <button class="btn sm ${
          active ? "gold" : ""
        }" type="button" data-kind="match" data-id="${a.id}">
          ${escapeHtml(a.text)} <span style="opacity:.7;">(${nInt(
          a.fixed_points,
          0
        )})</span>
        </button>
      `;
      })
      .join("");

    const missActive = row.kind === "MISS";
    const skipActive = row.kind === "SKIP";

    const outDefault = row.outText || input || "";
    const outVal = escapeHtml(outDefault);

    const html = `
      <div class="name">${escapeHtml(FINAL_MSG.Q_LABEL(idx + 1))}</div>
      <div class="qPrompt">${escapeHtml(q.text || "")}</div>
      <div class="mini"><div class="hint">${hostHint}</div></div>

      ${
        input.length === 0
          ? `
        <div class="mini"><div class="hint">${escapeHtml(
          FINAL_MSG.MAP_HINT_NO_TEXT
        )}</div></div>
      `
          : ``
      }

      <div class="cards2" style="margin-top:12px;">
        <div class="card">
          <div class="name">${escapeHtml(FINAL_MSG.MAP_LIST_TITLE)}</div>
          <div class="rowBtns" style="flex-wrap:wrap; gap:8px;">
            ${
              left ||
              `<div class="hint">${escapeHtml(FINAL_MSG.MAP_LIST_EMPTY)}</div>`
            }
          </div>
        </div>

        <div class="card">
          <div class="name">${escapeHtml(FINAL_MSG.MAP_OWN_TITLE)}</div>

          <div class="rowBtns" style="align-items:flex-start;">
            <button class="btn sm ${
              skipActive ? "gold" : ""
            }" type="button" data-kind="skip">${escapeHtml(
      FINAL_MSG.MAP_BTN_SKIP
    )}</button>
            <button class="btn sm danger ${
              missActive ? "gold" : ""
            }" type="button" data-kind="miss">${escapeHtml(
      FINAL_MSG.MAP_BTN_MISS
    )}</button>
          </div>

          <div class="mini"><div class="hint">${escapeHtml(
            FINAL_MSG.MAP_OUT_HINT
          )}</div></div>
          <input class="inp" data-kind="out" value="${outVal}" placeholder="${escapeHtml(
      FINAL_MSG.MAP_OUT_PLACEHOLDER
    )}"/>
        </div>
      </div>
    `;

    const rootId = roundNo === 1 ? `finalP1MapQ${idx + 1}` : `finalP2MapQ${idx + 1}`;

    ui.setHtml(rootId, html);

    const root = document.getElementById(rootId);
    if (!root) return;

    root
      .querySelectorAll('button[data-kind="match"]')
      .forEach((b) => {
        b.addEventListener("click", () => {
          row.kind = "MATCH";
          row.matchId = b.dataset.id || null;
          row.outText = "";
          renderMapOne(roundNo, idx);
        });
      });

    root
      .querySelector('button[data-kind="miss"]')
      ?.addEventListener("click", () => {
        row.kind = "MISS";
        row.matchId = null;
        if (!row.outText) row.outText = input;
        renderMapOne(roundNo, idx);
      });

    root
      .querySelector('button[data-kind="skip"]')
      ?.addEventListener("click", () => {
        row.kind = "SKIP";
        row.matchId = null;
        row.outText = "";
        renderMapOne(roundNo, idx);
      });

    root
      .querySelector('input[data-kind="out"]')
      ?.addEventListener("input", (e) => {
        row.outText = String(e.target?.value ?? "");
      });
  }

  async function commitReveal(roundNo /*1|2*/, idx /*0..4*/) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const q = qPicked[idx];
    const aList = answersByQ.get(q.id) || [];

    const mapArr = roundNo === 1 ? rt.map1 : rt.map2;
    const row = mapArr[idx];

    let pts = 0;
    let out = "";

    if (row.kind === "MATCH") {
      const a = aList.find((x) => x.id === row.matchId);
      pts = a ? nInt(a.fixed_points, 0) : 0;
      out = a?.text || "";
    } else if (row.kind === "MISS") {
      pts = 0;
      out = row.outText || "";
    } else {
      pts = 0;
      out = "";
    }

    row.pts = pts;

    const txt = out.trim().length
      ? out.trim()
      : display.PLACE?.finalText || FINAL_MSG.FALLBACK_ANSWER;

    if (roundNo === 1) {
      await display.finalSetLeft(idx + 1, clip11(txt));
      await display.finalSetA(
        idx + 1,
        String(pts).padStart(2, "0").slice(-2)
      );
      playSfx(pts > 0 ? "answer_correct" : "answer_wrong");
    } else {
      await display.finalSetRight(idx + 1, clip11(txt));
      await display.finalSetB(
        idx + 1,
        String(pts).padStart(2, "0").slice(-2)
      );
      const rep = rt.p2[idx].repeat === true;
      if (rep) playSfx("answer_repeat");
      else playSfx(pts > 0 ? "answer_correct" : "answer_wrong");
    }

    rt.sum = (rt.sum || 0) + pts;
    await display.finalSetSuma(rt.sum);
    updateSumUI();

    const adv = store.state.advanced || {};
    const target =
      typeof adv.finalTarget === "number" ? adv.finalTarget : 200;

    if (rt.sum >= target) {
      await gotoEnd(true);
      return true;
    }
    return false;
  }

  async function gotoEnd(hit200) {
    ensureRuntime();
    stopTimer();

    store.state.final.runtime.hit200 = !!hit200;

    const hasPrize = store.state?.final?.hasPrize !== false;
    const mainPrize =
      store.state?.final?.prizeMain || FINAL_MSG.DEFAULT_MAIN_PRIZE;
    const smallPrize =
      store.state?.final?.prizeSmall || FINAL_MSG.DEFAULT_SMALL_PRIZE;

    const hint = document.getElementById("finalEndHint");
    if (hint) {
      if (!hasPrize) {
        hint.textContent = FINAL_MSG.END_NO_PRIZE;
      } else {
        hint.textContent = hit200
          ? FINAL_MSG.END_200_PLUS(mainPrize)
          : FINAL_MSG.END_BELOW_200(smallPrize);
      }
    }

    setStep("f_end");
  }

  // ---------- Public actions (hooki pod UI) ----------
  async function startFinal() {
    if (store.state.hasFinal !== true) {
      ui.setMsg("msgFinal", FINAL_MSG.FINAL_DISABLED);
      return;
    }
    if (
      !store.state.final.confirmed ||
      (store.state.final.picked || []).length !== 5
    ) {
      ui.setMsg("msgFinal", FINAL_MSG.FINAL_NEEDS_PICK);
      return;
    }

    const adv = store.state.advanced || {};
    const threshold =
      typeof adv.finalMinPoints === "number" ? adv.finalMinPoints : 300;

    const totals = store.state.rounds?.totals || { A: 0, B: 0 };
    const hasEnough =
      (totals.A || 0) >= threshold || (totals.B || 0) >= threshold;

    if (!hasEnough) {
      ui.setMsg("msgFinal", FINAL_MSG.FINAL_NEEDS_POINTS(threshold));
      return;
    }

    ensureRuntime();

    if (typeof store.setFinalActive === "function") {
      store.setFinalActive(true);
    } else {
      store.state.locks.finalActive = true;
    }

    await loadFinalPicked();

    playSfx("final_theme");
    await display.hideLogo?.();
    await display.finalBoardPlaceholders?.();
    await display.finalSetSuma?.(0);

    for (let i = 1; i <= 5; i++) {
      await display.finalSetLeft?.(
        i,
        display.PLACE?.finalText || FINAL_MSG.FALLBACK_ANSWER
      );
      await display.finalSetRight?.(
        i,
        display.PLACE?.finalText || FINAL_MSG.FALLBACK_ANSWER
      );
      await display.finalSetA?.(i, "00");
      await display.finalSetB?.(i, "00");
    }

    await display.finalSetSideTimer?.(getWinnerTeam(), "");

    ui.setMsg("msgFinal", FINAL_MSG.FINAL_STARTED);
    updateSumUI();
    setStep("f_p1_entry");
    renderP1Entry();
    ui.setEnabled("btnFinalToP1MapQ1", false);
  }

  function backTo(step) {
    setStep(step);

    if (step === "f_p1_entry") renderP1Entry();
    if (step === "f_p2_entry") renderP2Entry();

    if (step.startsWith("f_p1_map_q")) {
      const idx = Number(step.slice(-1)) - 1;
      renderMapOne(1, idx);
    }
    if (step.startsWith("f_p2_map_q")) {
      const idx = Number(step.slice(-1)) - 1;
      renderMapOne(2, idx);
    }
  }

  function p1StartTimer() {
    startCountdown(15, "P1");
    ui.setEnabled("btnFinalToP1MapQ1", false);
    ui.setMsg("msgFinalP1Entry", FINAL_MSG.TIMER_RUNNING);
  }

  function p2StartTimer() {
    startCountdown(20, "P2");
    ui.setEnabled("btnFinalToP2MapQ1", false);
    ui.setMsg("msgFinalP2Entry", FINAL_MSG.TIMER_RUNNING);
  }

  function toP1MapQ(idx1based) {
    stopTimer();
    const idx = idx1based - 1;
    setStep(`f_p1_map_q${idx1based}`);
    renderMapOne(1, idx);
  }

  function toP2Start() {
    stopTimer();
    setStep("f_p2_start");
  }

  async function startP2Round() {
    playSfx("round_transition");
    await display.finalHideAnswersKeepSum?.();
    await display.finalSetSideTimer?.(getWinnerTeam(), "20");

    setStep("f_p2_entry");
    renderP2Entry();
    ui.setEnabled("btnFinalToP2MapQ1", false);
    ui.setMsg("msgFinalP2Start", FINAL_MSG.R2_STARTED);
  }

  async function nextFromP1Q(idx1based) {
    const idx = idx1based - 1;
    const ended = await commitReveal(1, idx);
    if (ended) return;

    if (idx1based < 5) {
      toP1MapQ(idx1based + 1);
    } else {
      setStep("f_p2_start");
    }
  }

  function toP2MapQ(idx1based) {
    stopTimer();
    const idx = idx1based - 1;
    setStep(`f_p2_map_q${idx1based}`);
    renderMapOne(2, idx);
  }

  async function nextFromP2Q(idx1based) {
    const idx = idx1based - 1;
    const ended = await commitReveal(2, idx);
    if (ended) return;

    if (idx1based < 5) {
      toP2MapQ(idx1based + 1);
    } else {
      await gotoEnd(false);
    }
  }

  // === NOWA LOGIKA KOŃCA FINAŁU (3 tryby) ===
  async function finishFinal() {
    playSfx("final_theme");

    const rt = store.state.final.runtime || {};
    const sum = Number(rt.sum || 0); // suma punktów finału
    const moneyEarned = Number(store.state.moneyEarned || 0);

    const adv = store.state.advanced || {};
    const target =
      typeof adv.finalTarget === "number" ? adv.finalTarget : 200;
    const hitTarget = sum >= target;

    const mode = getEndScreenMode(store);

    // 1) Tylko logo
    if (mode === "logo") {
      await display.showLogo?.();
      return;
    }

    // 2) Punkty – pokazujemy sumę finału jako "wygraną"
    if (mode === "points") {
      if (display.showWin) {
        await display.showWin(sum);
      } else {
        await display.showLogo?.();
      }
      return;
    }

    // 3) Kwota – tylko po finale ma sens
    if (mode === "money") {
      const winAmount = hitTarget ? moneyEarned + 25000 : moneyEarned;
      if (display.showWin) {
        await display.showWin(winAmount);
      } else {
        await display.showLogo?.();
      }
      return;
    }

    // fallback
    await display.showLogo?.();
  }

  function bootIfNeeded() {
    ensureRuntime();
    if (!store.state.final.step) store.state.final.step = "f_start";
    ui.showFinalStep(store.state.final.step);
    updateSumUI();
  }

  return {
    bootIfNeeded,

    startFinal,
    backTo,

    p1StartTimer,
    toP1MapQ,

    nextFromP1Q,

    toP2Start,
    startP2Round,

    p2StartTimer,
    toP2MapQ,

    nextFromP2Q,

    finishFinal,
  };
}
