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

  P2_HINT_P1_PREFIX: "Odpowiedź gracza 1: ",
  P2_BTN_REPEAT_ON: "Powtórzenie ✓",
  P2_BTN_REPEAT_OFF: "Powtórzenie",

  // --- mapping / podpowiedzi prowadzącego ---
  MAP_HINT_INPUT_PREFIX: "Wpisano: ",
  MAP_HINT_NO_INPUT: "Brak wpisu",
  MAP_HINT_NO_TEXT: "Nie wpisano odpowiedzi — “Dalej” pokaże puste / 0 pkt.",
  MAP_LIST_TITLE: "Lista odpowiedzi",
  MAP_LIST_EMPTY: "Brak listy odpowiedzi.",
  MAP_BTN_SKIP: "Brak odpowiedzi",
  MAP_BTN_MISS: "Nie ma na liście (0 pkt)",
  MAP_OUT_HINT: "Tekst do wyświetlenia (gdy “Nie ma na liście”).",
  MAP_OUT_PLACEHOLDER: "Tekst (0 pkt)",

  // --- fallback tekstu odpowiedzi, gdy naprawdę nic nie ma ---
  FALLBACK_ANSWER: "—",
};
// =========================================================

import { playSfx, getSfxDuration } from "/familiada/js/core/sfx.js";

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

  if (mode === "logo" || mode === "points" || mode === "money") return mode;
  if (adv.winEnabled === true) return "points";
  return "logo";
}

export function createFinal({ ui, store, devices, display, loadAnswers }) {
  let qPicked = []; // [{id, text, ord}]
  let answersByQ = new Map(); // qid -> [{id, text, fixed_points, ord}]
  let raf = null;

  function ensureRuntime() {
    const f = store.state.final;
    if (!f.runtime) f.runtime = {};
    const rt = f.runtime;

    if (!rt.p1) rt.p1 = Array.from({ length: 5 }, () => ({ text: "" }));
    if (!rt.p2)
      rt.p2 = Array.from({ length: 5 }, () => ({ text: "", repeat: false }));

    if (!rt.map1)
      rt.map1 = Array.from({ length: 5 }, () => ({
        kind: null, // MATCH / MISS / SKIP
        matchId: null,
        outText: "",
        pts: 0,
        revealedAnswer: false,
        revealedPoints: false,
      }));

    if (!rt.map2)
      rt.map2 = Array.from({ length: 5 }, () => ({
        kind: null,
        matchId: null,
        outText: "",
        pts: 0,
        revealedAnswer: false,
        revealedPoints: false,
      }));

    if (!rt.sum) rt.sum = 0;

    if (!rt.timer) rt.timer = { running: false, endsAt: 0, seconds: 0, phase: null };
    if (rt.timer.usedP1 !== true) rt.timer.usedP1 = false;
    if (rt.timer.usedP2 !== true) rt.timer.usedP2 = false;

    if (!rt.done) rt.done = false;
  }

  function ensureDefaultMapping(row, { input, outText, isRepeat }) {
    if (row.kind === "MATCH" || row.kind === "MISS" || row.kind === "SKIP") return;

    // Uwaga: te ustawienia są *automatyczne* (wynikają z pustego pola / powtórzenia).
    // Jeżeli później operator wpisze tekst (np. po zakończeniu odliczania),
    // chcemy odblokować mapowanie. Dlatego oznaczamy je flagą _auto.
    row._auto = true;

    if (isRepeat) {
      row.kind = "SKIP";
      row.matchId = null;
      return;
    }

    const has = ((input || "").trim().length > 0) || ((outText || "").trim().length > 0);
    if (!has) {
      row.kind = "SKIP";
      row.matchId = null;
    } else {
      row.kind = "MISS";
      row.matchId = null;
    }
  }

  function clearAutoMappingIfNeeded(mapRow) {
    if (!mapRow || mapRow._auto !== true) return;
    // Czyścimy tylko automaty — ręczny wybór (kliknięty MATCH/MISS/SKIP) ma zostać.
    mapRow.kind = null;
    mapRow.matchId = null;
    mapRow.outText = "";
    mapRow.pts = 0;
    mapRow.revealedAnswer = false;
    mapRow.revealedPoints = false;
    mapRow._auto = false;
  }

  // -------- Host view (lampki + pytania) --------
  function lampForEntry(roundNo, i) {
    ensureRuntime();
    const rt = store.state.final.runtime;

    if (roundNo === 1) return (rt.p1[i].text || "").trim() ? "🟢" : "🔴";
    if (rt.p2[i].repeat === true) return "🟡";
    return (rt.p2[i].text || "").trim() ? "🟢" : "🔴";
  }

  function hostTitleForStep() {
    const rt = store.state.final?.runtime;
    const step = store.state.final?.step || "";

    if (step === "f_p1_entry") {
      const s = Math.max(0, Number(rt?.timer?.seconds || 0));
      const counting = rt?.timer?.running && rt?.timer?.phase === "P1";
      return counting ? `FINAŁ RUNDA 1 — ODLICZANIE ${s}s` : `FINAŁ RUNDA 1`;
    }

    if (step === "f_p2_entry") {
      const s = Math.max(0, Number(rt?.timer?.seconds || 0));
      const counting = rt?.timer?.running && rt?.timer?.phase === "P2";
      return counting ? `FINAŁ RUNDA 2 — ODLICZANIE ${s}s` : `FINAŁ RUNDA 2`;
    }

    if (step.startsWith("f_p1_map_q")) return `FINAŁ RUNDA 1 — ODSŁANIANIE ODPOWIEDZI`;
    if (step.startsWith("f_p2_map_q")) return `FINAŁ RUNDA 2 — ODSŁANIANIE ODPOWIEDZI`;

    return "";
  }

  async function hostShowLines(lines) {
    const txt = lines.join("\n").replace(/"/g, '\\"');
    try {
      await devices.sendHostCmd(`SET "${txt}"`);
      await devices.sendHostCmd("OPEN");
    } catch {}
  }

  async function hostBlank() {
    try {
      await devices.sendHostCmd('SET ""');
      await devices.sendHostCmd("HIDE");
    } catch {}
  }

  function hostUpdate() {
    const title = hostTitleForStep();
    if (!title) {
      hostBlank().catch(() => {});
      return;
    }

    const step = store.state.final?.step || "";
    const roundNo =
      step === "f_p1_entry" || step.startsWith("f_p1_") ? 1 :
      step === "f_p2_entry" || step.startsWith("f_p2_") ? 2 : 1;

    const lines = [title, ""];
    for (let i = 0; i < 5; i++) {
      const lamp = lampForEntry(roundNo, i);
      const qt = (qPicked[i]?.text || "—").replace(/\s+/g, " ").trim();
      lines.push(`${lamp} ${i + 1}) ${qt}`);
    }

    hostShowLines(lines).catch(() => {});
  }

  // -------- Step + timer --------
  function setStep(step) {
    store.state.final.step = step;
    ui.showFinalStep(step);
    hostUpdate();
  }

  function stopTimer() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    rt.timer.running = false;
    rt.timer.endsAt = 0;
    rt.timer.seconds = 0;
    rt.timer.phase = null;

    if (raf) cancelAnimationFrame(raf);
    raf = null;

    ui.setText("finalTimer", FINAL_MSG.TIMER_PLACEHOLDER);
    setTimerProgress(0);
    hostUpdate();
  }

  function updateSumUI() {
    const rt = store.state.final.runtime;
    ui.setText("finalSum", String(rt.sum || 0));
  }

  function getWinnerTeam() {
    return store.state?.winnerTeam || store.state?.final?.winnerTeam || "A";
  }

  async function displaySetTimerSeconds(sec) {
    const team = getWinnerTeam();
    const txt = String(Math.max(0, sec)); // bez wiodących zer
    ui.setText("finalTimer", txt);
    await display.finalSetSideTimer?.(team, txt);
  }

  // ---- Prosty pasek postępu timera (inline, bez zależności od CSS) ----
  function ensureTimerBar() {
    const holder = document.getElementById("finalTimer");
    if (!holder) return null;
    let bar = document.getElementById("finalTimerBar");
    if (bar) return bar;

    // wstawiamy pod liczbą timera
    bar = document.createElement("div");
    bar.id = "finalTimerBar";
    bar.style.marginTop = "6px";
    bar.style.height = "6px";
    bar.style.width = "120px";
    bar.style.borderRadius = "999px";
    bar.style.background = "rgba(255,255,255,.25)";
    bar.style.overflow = "hidden";

    const fill = document.createElement("div");
    fill.id = "finalTimerBarFill";
    fill.style.height = "100%";
    fill.style.width = "0%";
    fill.style.background = "rgba(255,255,255,.9)";
    fill.style.transition = "width 120ms linear";
    bar.appendChild(fill);

    holder.parentElement?.appendChild(bar);
    return bar;
  }

  function setTimerProgress(frac01) {
    const bar = ensureTimerBar();
    if (!bar) return;
    const fill = document.getElementById("finalTimerBarFill");
    if (!fill) return;
    const f = Math.max(0, Math.min(1, Number(frac01) || 0));
    fill.style.width = `${Math.round(f * 100)}%`;
  }

  function startCountdown(seconds, phase /* "P1"|"P2" */) {
    ensureRuntime();
    const rt = store.state.final.runtime;

    stopTimer();

    rt.timer.running = true;
    rt.timer.phase = phase;
    rt.timer.endsAt = Date.now() + seconds * 1000;
    rt.timer.seconds = seconds;
    rt.timer.total = seconds;

    setTimerProgress(1);

    displaySetTimerSeconds(seconds).catch(() => {});
    hostUpdate();

    const tick = () => {
      if (!rt.timer.running) return;

      const leftMs = Math.max(0, rt.timer.endsAt - Date.now());
      const totalMs = Math.max(1, Number(rt.timer.total || 0) * 1000);
      setTimerProgress(leftMs / totalMs);
      const s = Math.ceil(leftMs / 1000);

      // pasek postępu
      const total = Math.max(1, Number(rt.timer.total || seconds) || seconds);
      setTimerProgress(leftMs / (total * 1000));

      if (s !== rt.timer.seconds) {
        rt.timer.seconds = s;
        hostUpdate();
        displaySetTimerSeconds(s).catch(() => {});
      }

      if (leftMs <= 0) {
        rt.timer.running = false;
        rt.timer.seconds = 0;
        setTimerProgress(0);

        ui.setText("finalTimer", "0");
        setTimerProgress(0);
        hostUpdate();

        // zamiast timera: przywróć triplet A/B
        const totals = store.state.rounds?.totals || { A: 0, B: 0 };
        display.setTotalsTriplets?.(totals).catch(() => {});

        playSfx("time_over");
        if (phase === "P1") ui.setEnabled("btnFinalToP1MapQ1", true);
        if (phase === "P2") ui.setEnabled("btnFinalToP2MapQ1", true);
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
  }

  // -------- Load picked questions + answers --------
  async function loadFinalPicked() {
    const pickedIds = store.state.final.picked || [];
    const raw = sessionStorage.getItem("familiada:questionsCache");
    const all = raw ? JSON.parse(raw) : [];

    qPicked = pickedIds.map((id) => all.find((q) => q.id === id)).filter(Boolean);
    if (qPicked.length !== 5) throw new Error(FINAL_MSG.ERR_MISSING_5);

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

  // -------- Render: P1 entry --------
  function renderP1Entry() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    const html = qPicked
      .map((q, i) => {
        const val = rt.p1[i].text || "";
        return `
        <div class="card" style="margin-bottom:10px;">
          <div class="name">${escapeHtml(FINAL_MSG.Q_LABEL(i + 1))}</div>

          <div class="rowQ">
            <div class="qPrompt inline">
              ${escapeHtml(q.text || "")}
            </div>
            <input class="inp" data-p="1" data-i="${i}"
              value="${escapeHtml(val)}"
              placeholder="${escapeHtml(FINAL_MSG.INPUT_PLACEHOLDER)}"
              autocomplete="off"/>
          </div>
        </div>
        `;
      })
      .join("");

    ui.setHtml("finalP1Inputs", html);

    document.querySelectorAll('#finalP1Inputs input[data-p="1"]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        rt.p1[i].text = String(inp.value ?? "");

        // Jeśli wcześniej (np. podczas timera) pole było puste i mapowanie
        // automatycznie ustawiło SKIP, to wpis teraz ma odblokować wybór.
        clearAutoMappingIfNeeded(rt.map1?.[i]);

        hostUpdate();
      });

      inp.addEventListener("keydown", (e) => {
        const i = Number(inp.dataset.i);

        if (e.key === "ArrowDown") {
          e.preventDefault();
          document.querySelector(`#finalP1Inputs input[data-p="1"][data-i="${i + 1}"]`)?.focus();
          return;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          document.querySelector(`#finalP1Inputs input[data-p="1"][data-i="${i - 1}"]`)?.focus();
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          document.querySelector(`#finalP1Inputs input[data-p="1"][data-i="${i + 1}"]`)?.focus();
        }
      });
    });

    ui.setEnabled("btnFinalToP1MapQ1", !rt.timer.running && rt.timer.usedP1);
  }

  // -------- Render: P2 entry --------
  function renderP2Entry() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    const html = qPicked
      .map((q, i) => {
        const v2 = rt.p2[i].text || "";
        const repeat = rt.p2[i].repeat === true;
        return `
        <div class="rowQ">
          <div class="qPrompt inline">
            ${escapeHtml(q.text || "")}
          </div>

          <div class="colRight">
            <input class="inp" data-p="2" data-i="${i}"
              value="${escapeHtml(v2)}"
              placeholder="${escapeHtml(FINAL_MSG.INPUT_PLACEHOLDER)}"
              autocomplete="off"/>

            <button class="btn sm danger" type="button"
              data-repeat="2" data-i="${i}">
              ${repeat ? escapeHtml(FINAL_MSG.P2_BTN_REPEAT_ON) : escapeHtml(FINAL_MSG.P2_BTN_REPEAT_OFF)}
            </button>
          </div>
        </div>
      `;
      })
      .join("");

    ui.setHtml("finalP2Inputs", html);

    document.querySelectorAll('#finalP2Inputs input[data-p="2"]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        const val = String(inp.value ?? "");
        rt.p2[i].text = val;

        // jw. — odblokuj mapowanie gdy wpis pojawi się po wcześniejszym auto-SKIP
        clearAutoMappingIfNeeded(rt.map2?.[i]);

        // jeśli coś wpisano, zdejmij „Powtórzenie”
        if (val.trim().length > 0 && rt.p2[i].repeat) {
          rt.p2[i].repeat = false;
          clearAutoMappingIfNeeded(rt.map2?.[i]);
          renderP2Entry();
        }

        hostUpdate();
      });

      inp.addEventListener("keydown", (e) => {
        const i = Number(inp.dataset.i);

        if (e.key === "ArrowDown") {
          e.preventDefault();
          document.querySelector(`#finalP2Inputs input[data-p="2"][data-i="${i + 1}"]`)?.focus();
          return;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          document.querySelector(`#finalP2Inputs input[data-p="2"][data-i="${i - 1}"]`)?.focus();
          return;
        }

        // Shift+Enter w pustym polu → zaznacza Powtórzenie
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();

          const val = String(inp.value ?? "").trim();
          if (!val) {
            rt.p2[i].repeat = true;
            renderP2Entry();
          }

          document.querySelector(`#finalP2Inputs input[data-p="2"][data-i="${i + 1}"]`)?.focus();
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          document.querySelector(`#finalP2Inputs input[data-p="2"][data-i="${i + 1}"]`)?.focus();
        }
      });
    });

    document.querySelectorAll('#finalP2Inputs button[data-repeat="2"]').forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i);
        const prev = rt.p2[i].repeat === true;
        const next = !prev;

        rt.p2[i].repeat = next;

        // dźwięk TYLKO przy włączaniu powtórzenia
        if (!prev && next) playSfx("answer_repeat");

        renderP2Entry();
        hostUpdate();
      });
    });

    ui.setEnabled("btnFinalToP2MapQ1", !rt.timer.running && rt.timer.usedP2);
  }

  // -------- Mapping view (one question) --------
  function renderMapOne(roundNo /*1|2*/, idx /*0..4*/) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const q = qPicked[idx];
    const aList = answersByQ.get(q.id) || [];

    const inputP1 = (rt.p1[idx].text || "").trim();
    const inputP2 = (rt.p2[idx]?.text || "").trim();
    const input = roundNo === 1 ? inputP1 : inputP2;

    const mapArr = roundNo === 1 ? rt.map1 : rt.map2;
    const row = mapArr[idx];

    const isRepeat = roundNo === 2 && rt.p2[idx].repeat === true;

    // powtórzenie ma się zachowywać jak brak odpowiedzi
    const effectiveInput = isRepeat ? "" : input;
    const outNow = (row.outText || "").trim();
    const hasText = (effectiveInput.trim().length > 0) || (outNow.length > 0);

    ensureDefaultMapping(row, { input, outText: row.outText, isRepeat });

    let hostHintHtml = "";

    if (roundNo === 1) {
      const hostHint = input.length
        ? `${escapeHtml(FINAL_MSG.MAP_HINT_INPUT_PREFIX)}<b>${escapeHtml(input)}</b>`
        : `<i>${escapeHtml(FINAL_MSG.MAP_HINT_NO_INPUT)}</i>`;

      hostHintHtml = `
        <div class="mini">
          <div class="hint">${hostHint}</div>
          ${input.length === 0 ? `<div class="hint">${escapeHtml(FINAL_MSG.MAP_HINT_NO_TEXT)}</div>` : ``}
        </div>
      `;
    } else {
      const p1Txt = inputP1 || "—";
      const p2Txt = inputP2 || "—";

      hostHintHtml = `
        <div class="mini">
          <div class="hint">
            ${escapeHtml(FINAL_MSG.P2_HINT_P1_PREFIX)}<b>${escapeHtml(p1Txt)}</b>
          </div>
          <div class="hint">
            Odpowiedź gracza 2${isRepeat ? " (powtórzenie)" : ""}: <b>${escapeHtml(p2Txt)}</b>
          </div>
          ${inputP2.length === 0 ? `<div class="hint">${escapeHtml(FINAL_MSG.MAP_HINT_NO_TEXT)}</div>` : ``}
        </div>
      `;
    }

    const aButtons = aList
      .map((a) => {
        const active = row.kind === "MATCH" && row.matchId === a.id;
        return `
          <button class="btn sm ${active ? "gold" : ""}" type="button"
                  data-kind="match" data-id="${a.id}"
                  ${!hasText ? "disabled" : ""}>
            ${escapeHtml(a.text)} <span style="opacity:.7;">(${nInt(a.fixed_points, 0)})</span>
          </button>
        `;
      })
      .join("");

    const missActive = row.kind === "MISS";
    const skipActive = row.kind === "SKIP";

    const outDefault = (row.outText || "").trim().length ? row.outText : input;
    const outVal = escapeHtml(outDefault);

    const html = `
      <div class="name">${escapeHtml(FINAL_MSG.Q_LABEL(idx + 1))}</div>
      <div class="qPrompt">${escapeHtml(q.text || "")}</div>

      ${hostHintHtml}

      <div class="card" style="margin-top:12px;">
        <div class="name">${escapeHtml(FINAL_MSG.MAP_LIST_TITLE)}</div>

        <div class="rowBtns" style="flex-wrap:wrap; gap:8px;">
          ${aButtons || `<div class="hint">${escapeHtml(FINAL_MSG.MAP_LIST_EMPTY)}</div>`}
        </div>

        <div class="rowBtns" style="margin-top:10px; gap:8px; flex-wrap:wrap;">
          <button class="btn sm ${skipActive ? "gold" : ""}" type="button" data-kind="skip"
            ${hasText ? "disabled" : ""}>
            ${escapeHtml(FINAL_MSG.MAP_BTN_SKIP)}
          </button>

          <button class="btn sm danger ${missActive ? "gold" : ""}" type="button" data-kind="miss"
            ${!hasText ? "disabled" : ""}>
            ${escapeHtml(FINAL_MSG.MAP_BTN_MISS)}
          </button>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div class="name">Odsłanianie</div>
        <div class="rowBtns" style="gap:8px; flex-wrap:wrap;">
          <button class="btn sm" type="button" data-kind="reveal-answer"
            ${row.revealedAnswer ? "disabled" : ""}>
            Odsłoń odpowiedź
          </button>
          <button class="btn sm" type="button" data-kind="reveal-points"
            ${!row.revealedAnswer || row.revealedPoints ? "disabled" : ""}>
            Odsłoń punkty
          </button>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div class="name">${escapeHtml(FINAL_MSG.MAP_OUT_HINT)}</div>
        <input class="inp" data-kind="out" value="${outVal}"
               placeholder="${escapeHtml(FINAL_MSG.MAP_OUT_PLACEHOLDER)}"/>
      </div>
    `;

    const rootId = roundNo === 1 ? `finalP1MapQ${idx + 1}` : `finalP2MapQ${idx + 1}`;
    ui.setHtml(rootId, html);

    const root = document.getElementById(rootId);
    if (!root) return;

    const nextBtnId = roundNo === 1 ? `btnFinalNextFromP1Q${idx + 1}` : `btnFinalNextFromP2Q${idx + 1}`;
    ui.setEnabled(nextBtnId, !!row.revealedAnswer && !!row.revealedPoints);

    root.querySelectorAll('button[data-kind="match"]').forEach((b) => {
      b.addEventListener("click", () => {
        if (!hasText) return;
        row.kind = "MATCH";
        row._auto = false;
        row.matchId = b.dataset.id || null;
        renderMapOne(roundNo, idx);
      });
    });

    root.querySelector('button[data-kind="miss"]')?.addEventListener("click", () => {
      if (!hasText) return;
      row.kind = "MISS";
      row._auto = false;
      row.matchId = null;
      if (!row.outText) row.outText = effectiveInput;
      renderMapOne(roundNo, idx);
    });

    root.querySelector('button[data-kind="skip"]')?.addEventListener("click", () => {
      if (hasText) return;
      row.kind = "SKIP";
      row._auto = false;
      row.matchId = null;
      renderMapOne(roundNo, idx);
    });

    root.querySelector('button[data-kind="reveal-answer"]')?.addEventListener("click", async () => {
      const res = await revealAnswerOnly(roundNo, idx);
      renderMapOne(roundNo, idx);

      // brak odpowiedzi → można iść dalej od razu
      if (!res || !res.hasAnswer) ui.setEnabled(nextBtnId, true);
    });

    root.querySelector('button[data-kind="reveal-points"]')?.addEventListener("click", async () => {
      const ended = await revealPointsAndScore(roundNo, idx);
      renderMapOne(roundNo, idx);
      if (!ended) ui.setEnabled(nextBtnId, true);
    });

    // UWAGA: bez renderMapOne() w input, żeby nie zrywać fokusu
    root.querySelector('input[data-kind="out"]')?.addEventListener("input", (e) => {
      const v = String(e.target?.value ?? "");
      row.outText = v;

      const has = v.trim().length > 0;
      if (has) {
        row.kind = "MISS";
        row._auto = false;
        row.matchId = null;
      } else if (row.kind === "MISS") {
        row.kind = "SKIP";
        row._auto = false;
      }

      ui.setEnabled(nextBtnId, !!row.revealedAnswer && !!row.revealedPoints);
      hostUpdate();
    });
  }

  async function revealAnswerOnly(roundNo, idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const q = qPicked[idx];
    const aList = answersByQ.get(q.id) || [];

    const mapArr = roundNo === 1 ? rt.map1 : rt.map2;
    const row = mapArr[idx];

    const inputP1 = (rt.p1[idx].text || "").trim();
    const inputP2 = (rt.p2[idx]?.text || "").trim();
    const input = roundNo === 1 ? inputP1 : inputP2;

    const isRepeat = roundNo === 2 && rt.p2[idx].repeat === true;
    ensureDefaultMapping(row, { input, outText: row.outText, isRepeat });

    // SKIP: nic nie wysyłamy na display (zostają placeholdery)
    if (row.kind === "SKIP") {
      row.revealedAnswer = true;
      row.revealedPoints = true;
      playSfx("answer_wrong");
      return { hasAnswer: false };
    }

    let txt = "";

    if (row.kind === "MATCH") {
      const a = aList.find((x) => x.id === row.matchId);
      txt = (a?.text || "").trim();
    } else if (row.kind === "MISS") {
      const shown = (row.outText || "").trim().length ? row.outText : input;
      txt = String(shown || "").trim();
    }

    txt = txt.length ? txt : (display.PLACE?.finalText || FINAL_MSG.FALLBACK_ANSWER);

    // Używamy istniejących funkcji ustawiania:
    // - pokazujemy tekst z punktami 00 (docelowe punkty odsłonimy osobno)
    if (roundNo === 1) await display.finalSetLeft(idx + 1, clip11(txt));
    else await display.finalSetRight(idx + 1, clip11(txt));

    row.revealedAnswer = true;

    // samo odsłonięcie odpowiedzi = dzwonki
    playSfx("bells");

    return { hasAnswer: true };
  }

  async function revealPointsAndScore(roundNo, idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const q = qPicked[idx];
    const aList = answersByQ.get(q.id) || [];

    const mapArr = roundNo === 1 ? rt.map1 : rt.map2;
    const row = mapArr[idx];

    const inputP1 = (rt.p1[idx].text || "").trim();
    const inputP2 = (rt.p2[idx]?.text || "").trim();
    const input = roundNo === 1 ? inputP1 : inputP2;

    const isRepeat = roundNo === 2 && rt.p2[idx].repeat === true;
    ensureDefaultMapping(row, { input, outText: row.outText, isRepeat });

    // SKIP: nic do odkrycia, ale pozwalamy iść dalej
    if (row.kind === "SKIP") {
      row.revealedPoints = true;
      return false;
    }

    let pts = 0;

    if (row.kind === "MATCH") {
      const a = aList.find((x) => x.id === row.matchId);
      pts = a ? nInt(a.fixed_points, 0) : 0;
    } else if (row.kind === "MISS") {
      pts = 0;
    }

    row.pts = pts;
    row.revealedPoints = true;

    rt.sum = (rt.sum || 0) + pts;
    updateSumUI();

    const pts2 = String(pts);

    if (roundNo === 1) {
      await display.finalSetA(idx + 1, pts2);
      await display.finalSetSuma(rt.sum, "A");
    } else {
      await display.finalSetB(idx + 1, pts2);
      await display.finalSetSuma(rt.sum, "B");
    }

    if (row.kind === "MATCH") playSfx("answer_correct");
    else playSfx("answer_wrong");
    
    return false;
  }

  async function gotoEnd(hit200) {
    ensureRuntime();
    stopTimer();

    await hostBlank().catch(() => {});

    store.state.final.runtime.hit200 = !!hit200;

    const hasPrize = store.state?.final?.hasPrize !== false;
    const mainPrize = store.state?.final?.prizeMain || FINAL_MSG.DEFAULT_MAIN_PRIZE;
    const smallPrize = store.state?.final?.prizeSmall || FINAL_MSG.DEFAULT_SMALL_PRIZE;

    const hint = document.getElementById("finalEndHint");
    if (hint) {
      if (!hasPrize) hint.textContent = FINAL_MSG.END_NO_PRIZE;
      else hint.textContent = hit200 ? FINAL_MSG.END_200_PLUS(mainPrize) : FINAL_MSG.END_BELOW_200(smallPrize);
    }

    setStep("f_end");
  }

  // -------- Public actions --------
  async function startFinal() {
    if (store.state.hasFinal !== true) {
      ui.setMsg("msgFinal", FINAL_MSG.FINAL_DISABLED);
      return;
    }

    if (!store.state.final.confirmed || (store.state.final.picked || []).length !== 5) {
      ui.setMsg("msgFinal", FINAL_MSG.FINAL_NEEDS_PICK);
      return;
    }

    const adv = store.state.advanced || {};
    const threshold = typeof adv.finalMinPoints === "number" ? adv.finalMinPoints : 300;

    const totals = store.state.rounds?.totals || { A: 0, B: 0 };
    const hasEnough = (totals.A || 0) >= threshold || (totals.B || 0) >= threshold;

    if (!hasEnough) {
      ui.setMsg("msgFinal", FINAL_MSG.FINAL_NEEDS_POINTS(threshold));
      return;
    }

    ensureRuntime();

    if (typeof store.setFinalActive === "function") store.setFinalActive(true);
    else store.state.locks.finalActive = true;

    // wyłączamy buzzer na czas finału
    try {
      await devices.sendBuzzerCmd("OFF");
    } catch (e) {
      console.warn("sendBuzzerCmd(OFF) in final failed", e);
    }

    await loadFinalPicked();

    ui.setMsg("msgFinal", "");
    ui.setMsg("msgFinalP1Entry", "");
    ui.setMsg("msgFinalP2Entry", "");
    ui.setMsg("msgFinalP2Start", "");

    let dur = 0;
    try {
      dur = await getSfxDuration("final_theme");
    } catch (e) {
      console.warn("getSfxDuration(final_theme) error", e);
    }

    const totalMs = typeof dur === "number" && dur > 0 ? dur * 1000 : 4000;
    const transitionAnchorMs = 1000;

    playSfx("final_theme");

    setTimeout(() => {
      (async () => {
        try {
          if (typeof display.roundsHideBoard === "function") {
            try { await display.roundsHideBoard(); } catch {}
          }
          if (typeof display.finalBoardPlaceholders === "function") {
            await display.finalBoardPlaceholders();
          }
        } catch (e) {
          console.error("display setup for final (delayed) failed", e);
        }
      })();
    }, transitionAnchorMs);

    if (totalMs > 0) await new Promise((resolve) => setTimeout(resolve, totalMs));
    playSfx("bells");

    ui.setMsg("msgFinal", FINAL_MSG.FINAL_STARTED);
    updateSumUI();

    setStep("f_p1_entry");
    renderP1Entry();

    ui.setEnabled("btnFinalToP1MapQ1", false);

    await display.finalSetSideTimer?.(getWinnerTeam(), "");
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
    ensureRuntime();
    const rt = store.state.final.runtime;
    if (rt.timer.usedP1) return;

    rt.timer.usedP1 = true;
    startCountdown(15, "P1");
    ui.setEnabled("btnFinalToP1MapQ1", false);
  }

  function p2StartTimer() {
    ensureRuntime();
    const rt = store.state.final.runtime;
    if (rt.timer.usedP2) return;

    rt.timer.usedP2 = true;
    startCountdown(20, "P2");
    ui.setEnabled("btnFinalToP2MapQ1", false);
  }

  function toP1MapQ(idx1based) {
    ensureRuntime();
    stopTimer();

    const idx = idx1based - 1;
    const row = store.state.final.runtime.map1[idx];
    if (row) {
      row.revealedAnswer = false;
      row.revealedPoints = false;
    }

    setStep(`f_p1_map_q${idx1based}`);
    renderMapOne(1, idx);
  }

  function nextFromP1Q(idx1based) {
    const n = Number(idx1based) || 1;
    if (n < 5) toP1MapQ(n + 1);
    else toP2Start();
  }

  function toP2Start() {
    stopTimer();
    (async () => {
      try {
        await display.finalHalfHide?.();
        await new Promise((r) => setTimeout(r, 1000));
        await display.finalHalfPlaceholders?.();
      } catch {}
    })();
    setStep("f_p2_start");
  }

  function getP1DisplayRow(idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const q = qPicked[idx];
    const aList = answersByQ.get(q.id) || [];
    const row = rt.map1[idx];

    const input = (rt.p1[idx].text || "").trim();
    const kind = row.kind || "SKIP";

    let text = "———————————";
    let pts = "▒▒";

    if (kind === "MATCH") {
      const a = aList.find((x) => x.id === row.matchId);
      if (a) {
        text = (a.text || "").trim() || "———————————";
        pts = String(nInt(a.fixed_points, 0)).padStart(2, "0");
      }
    } else if (kind === "MISS") {
      const out = (row.outText || input || "").trim();
      text = out || "———————————";
      pts = "00";
    }

    return { text, pts };
  }

  async function startP2Round() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    let dur = 0;
    try { dur = await getSfxDuration("round_transition"); } catch {}
    const totalMs = dur > 0 ? dur * 1000 : 2000;
    const anchorMs = 920;

    playSfx("round_transition");

    // W kotwicy ustawiamy licznik po stronie zwycięskiej drużyny (20s)
    setTimeout(() => {
      display.finalSetSideTimer?.(getWinnerTeam(), "20").catch(() => {});
    }, anchorMs);

    if (totalMs > 0) await new Promise((resolve) => setTimeout(resolve, totalMs));

    setStep("f_p2_entry");
    renderP2Entry();
    ui.setEnabled("btnFinalToP2MapQ1", false);
    ui.setMsg("msgFinalP2Start", FINAL_MSG.R2_STARTED);
  }

  async function toP2MapQ(idx1based) {
    ensureRuntime();
    stopTimer();

    // Odkrywamy połówkę z wynikami rundy 1 DOPIERO gdy zaczynamy mapowanie rundy 2.
    if (Number(idx1based) === 1) {
      try {
        await display.finalHalfHide?.();
        await new Promise((r) => setTimeout(r, 1000));
        const rows = Array.from({ length: 5 }, (_, i) => {
          const r = getP1DisplayRow(i);
          return { text: clip11(r.text), pts: r.pts };
        });
        await display.finalHalfFromRows?.(rows, { anim: "matrix down 1000" });
        
        // suma przeskakuje na B na starcie mapowania rundy 2
        
        await display.finalSetSuma?.(store.state.final.runtime?.sum || 0, "B");
        
      } catch (e) {
        console.warn("finalHalfFromRows failed", e);
      }
    }

    const idx = idx1based - 1;
    const row = store.state.final.runtime.map2[idx];
    if (row) {
      row.revealedAnswer = false;
      row.revealedPoints = false;
    }

    setStep(`f_p2_map_q${idx1based}`);
    renderMapOne(2, idx);
  }

  function nextFromP2Q(idx1based) {
    const n = Number(idx1based) || 1;
    if (n < 5) toP2MapQ(n + 1);
    else {
      const adv = store.state.advanced || {};
      const target = typeof adv.finalTarget === "number" ? adv.finalTarget : 200;
      const hit = nInt(store.state.final.runtime?.sum, 0) >= target;
      gotoEnd(hit);
    }
  }

  // -------- Koniec finału (3 tryby) --------
  async function finishFinal() {
    ensureRuntime();
    const rtDone = store.state.final.runtime;
    if (rtDone?.done === true) return;
    if (rtDone) rtDone.done = true;

    // po kliknięciu „Zakończ finał” blokujemy przycisk
    ui.setEnabled?.("btnFinalFinish", false);

    playSfx("final_theme");

    const rt = store.state.final.runtime || {};
    const sum = nInt(rt.sum, 0);

    const adv = store.state.advanced || {};
    const target = typeof adv.finalTarget === "number" ? adv.finalTarget : 200;

    const totals = store.state.rounds?.totals || { A: 0, B: 0 };
    const winnerTeam = getWinnerTeam();
    const roundsA = nInt(totals.A, 0);
    const roundsB = nInt(totals.B, 0);
    const winnerRounds = winnerTeam === "B" ? roundsB : roundsA;

    const hitTarget = sum >= target;
    const totalPointsAll = winnerRounds + sum;

    let winAmount = totalPointsAll * 3;
    if (hitTarget) winAmount += 25000;

    try {
      const newTotals = {
        A: winnerTeam === "A" ? roundsA + sum : roundsA,
        B: winnerTeam === "B" ? roundsB + sum : roundsB,
      };

      if (typeof display.setBankTriplet === "function") await display.setBankTriplet(0);
      await display.setTotalsTriplets?.(newTotals);
    } catch (e) {
      console.warn("setTotalsTriplets after final failed", e);
    }

    const mode = getEndScreenMode(store);

    // przed wynikiem / logo: animout
    try {
      await devices.sendDisplayCmd('FBATCH ANIMOUT edge down 1000');
      await new Promise((r) => setTimeout(r, 1000));
    } catch {}

    if (mode === "logo") {
      await display.showLogo?.();
      return;
    }

    if (mode === "points") {
      if (display.showWin) await display.showWin(totalPointsAll);
      else await display.showLogo?.();
      return;
    }

    if (mode === "money") {
      if (display.showWin) await display.showWin(winAmount);
      else await display.showLogo?.();
      return;
    }

    await display.showLogo?.();
  }

  function bootIfNeeded() {
    ensureRuntime();
    if (!store.state.final.step) store.state.final.step = "f_start";
    ui.showFinalStep(store.state.final.step);
    updateSumUI();
    hostUpdate();
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
