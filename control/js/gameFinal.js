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
      rt.p1 = Array.from({ length: 5 }, () => ({ text: ""}));
    if (!rt.p2)
      rt.p2 = Array.from({ length: 5 }, () => ({
        text: "",
        repeat: false,
      }));

    if (!rt.map1)
      rt.map1 = Array.from({ length: 5 }, () => ({
        kind: "SKIP",
        matchId: null,
        outText: "",
        pts: 0,
        revealedAnswer: false,
        revealedPoints: false,
      }));
    if (!rt.map2)
      rt.map2 = Array.from({ length: 5 }, () => ({
        kind: "SKIP",
        matchId: null,
        outText: "",
        pts: 0,
        revealedAnswer: false,
        revealedPoints: false,
      }));


    if (!rt.sum) rt.sum = 0;

    if (!rt.timer)
      rt.timer = { running: false, endsAt: 0, seconds: 0, phase: null }; // phase: "P1"|"P2"|null
    if (!rt.done) rt.done = false;
  }

  function getP1DisplayRow(idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const q = qPicked[idx];
    const aList = answersByQ.get(q.id) || [];
    const row = rt.map1[idx];
  
    const input = (rt.p1[idx].text || "").trim();
  
    // jeśli mapowanie nieustawione – traktuj jak SKIP+placeholder
    const kind = row.kind || "SKIP";
  
    // domyślne wartości (placeholder)
    let text = "———————————";
    let pts = "▒▒";
  
    if (kind === "MATCH") {
      const a = aList.find((x) => x.id === row.matchId);
      if (a) {
        text = (a.text || "").trim() || "———————————";
        pts = String(nInt(a.fixed_points, 0)).padStart(2, "0");
      }
    } else if (kind === "MISS") {
      // "Nie ma na liście" → bierzemy outText albo wpis gracza
      const out = (row.outText || input || "").trim();
      text = out || "———————————";
      pts = "00";
    } else if (kind === "SKIP") {
      // brak odpowiedzi → zostawiamy kreski + "puste" punkty
      text = "———————————";
      pts = "▒▒";
    }
  
    return { text, pts };
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

  function clearFinalMsgs() {
    ui.setMsg("msgFinal", "");
    ui.setMsg("msgFinalP1Entry", "");
    ui.setMsg("msgFinalP2Entry", "");
    ui.setMsg("msgFinalP2Start", "");
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
      
        // zamiast "timer na 0" – przywracamy punkty A/B
        const totals = store.state.rounds?.totals || { A: 0, B: 0 };
        display.setTotalsTriplets?.(totals).catch(() => {});
      
        playSfx("answer_wrong");
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
          const i = Number(inp.dataset.i);
        
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = document.querySelector(
              `#finalP1Inputs input[data-p="1"][data-i="${i + 1}"]`
            );
            next?.focus();
            return;
          }
        
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const prev = document.querySelector(
              `#finalP1Inputs input[data-p="1"][data-i="${i - 1}"]`
            );
            prev?.focus();
            return;
          }
        
          if (e.key === "Enter") {
            e.preventDefault();
            const next = document.querySelector(
              `#finalP1Inputs input[data-p="1"][data-i="${i + 1}"]`
            );
            next?.focus();
          }
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
          const val = String(inp.value ?? "");
          rt.p2[i].text = val;
        
          // jeśli coś wpisano, zdejmij „Powtórzenie”
          if (val.trim().length > 0 && rt.p2[i].repeat) {
            rt.p2[i].repeat = false;
            renderP2Entry();
          }
        });
        inp.addEventListener("keydown", (e) => {
          const i = Number(inp.dataset.i);
        
          // nawigacja strzałkami
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = document.querySelector(
              `#finalP2Inputs input[data-p="2"][data-i="${i + 1}"]`
            );
            next?.focus();
            return;
          }
        
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const prev = document.querySelector(
              `#finalP2Inputs input[data-p="2"][data-i="${i - 1}"]`
            );
            prev?.focus();
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
            return;
          }
        
          // zwykły Enter → przejście w dół
          if (e.key === "Enter") {
            e.preventDefault();
            const next = document.querySelector(
              `#finalP2Inputs input[data-p="2"][data-i="${i + 1}"]`
            );
            next?.focus();
          }
        });

      });

      document
        .querySelectorAll('#finalP2Inputs button[data-repeat="2"]')
        .forEach((b) => {
          b.addEventListener("click", () => {
            const i = Number(b.dataset.i);
            const prev = rt.p2[i].repeat === true;
            const next = !prev;
      
            rt.p2[i].repeat = next;
      
            // dźwięk TYLKO przy włączaniu powtórzenia
            if (!prev && next) {
              playSfx("answer_repeat");
            }
      
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

  const inputP1 = (rt.p1[idx].text || "").trim();
  const inputP2 = (rt.p2[idx]?.text || "").trim();
  const input = roundNo === 1 ? inputP1 : inputP2;

  const mapArr = roundNo === 1 ? rt.map1 : rt.map2;
  const row = mapArr[idx];

  const isRepeat = roundNo === 2 && rt.p2[idx].repeat === true;

  let hostHintHtml = "";

  if (roundNo === 1) {
    const hostHint = input.length
      ? `${escapeHtml(FINAL_MSG.MAP_HINT_INPUT_PREFIX)}<b>${escapeHtml(
          input
        )}</b>`
      : `<i>${escapeHtml(FINAL_MSG.MAP_HINT_NO_INPUT)}</i>`;

    hostHintHtml = `
      <div class="mini">
        <div class="hint">${hostHint}</div>
        ${
          input.length === 0
            ? `<div class="hint">${escapeHtml(FINAL_MSG.MAP_HINT_NO_TEXT)}</div>`
            : ``
        }
      </div>
    `;
  } else {
    // roundNo === 2 – pokazujemy obie odpowiedzi + info o powtórzeniu
    const p1Txt = inputP1 || "—";
    const p2Txt = inputP2 || "—";

    hostHintHtml = `
      <div class="mini">
        <div class="hint">
          ${escapeHtml(FINAL_MSG.P2_HINT_P1_PREFIX)}<b>${escapeHtml(
      p1Txt
    )}</b>
        </div>
        <div class="hint">
          Odpowiedź gracza 2${
            isRepeat ? " (powtórzenie)" : ""
          }: <b>${escapeHtml(p2Txt)}</b>
        </div>
        ${
          inputP2.length === 0
            ? `<div class="hint">${escapeHtml(FINAL_MSG.MAP_HINT_NO_TEXT)}</div>`
            : ``
        }
      </div>
    `;
  }

  const aButtons = aList
    .map((a) => {
      const active = row.kind === "MATCH" && row.matchId === a.id;
      return `
        <button class="btn sm ${active ? "gold" : ""}" type="button"
                data-kind="match" data-id="${a.id}">
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

  const outDefault = row.outText || "";
  const outVal = escapeHtml(outDefault);

  const html = `
    <div class="name">${escapeHtml(FINAL_MSG.Q_LABEL(idx + 1))}</div>
    <div class="qPrompt">${escapeHtml(q.text || "")}</div>

    ${hostHintHtml}

    <div class="cards2" style="margin-top:12px;">
      <div class="card">
        <div class="name">${escapeHtml(FINAL_MSG.MAP_LIST_TITLE)}</div>
        <div class="rowBtns" style="flex-wrap:wrap; gap:8px;">
          ${
            aButtons ||
            `<div class="hint">${escapeHtml(FINAL_MSG.MAP_LIST_EMPTY)}</div>`
          }
        </div>
      </div>

      <div class="card">
        <div class="name">${escapeHtml(FINAL_MSG.MAP_OWN_TITLE)}</div>

          <div class="rowBtns" style="align-items:flex-start; gap:8px; flex-wrap:wrap;">
            <button class="btn sm" type="button" data-kind="reveal-answer"
              ${row.revealedAnswer ? "disabled" : ""}>
              Odsłoń odpowiedź
            </button>
            <button class="btn sm" type="button" data-kind="reveal-points"
              ${!row.revealedAnswer || row.revealedPoints ? "disabled" : ""}>
              Odsłoń punkty
            </button>
          
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
          
        <div class="mini">
          <div class="hint">${escapeHtml(FINAL_MSG.MAP_OUT_HINT)}</div>
        </div>
        <input class="inp" data-kind="out" value="${outVal}"
               placeholder="${escapeHtml(FINAL_MSG.MAP_OUT_PLACEHOLDER)}"/>
      </div>
    </div>
  `;

  const rootId =
    roundNo === 1 ? `finalP1MapQ${idx + 1}` : `finalP2MapQ${idx + 1}`;

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
  .querySelector('button[data-kind="reveal-answer"]')
  ?.addEventListener("click", async () => {
    const res = await revealAnswerOnly(roundNo, idx);

    // prze-renderuj widok, żeby przyciski się zaktualizowały
    renderMapOne(roundNo, idx);

    // jeżeli nie było odpowiedzi → "Dalej" może się od razu aktywować
    if (!res || !res.hasAnswer) {
      if (roundNo === 1) {
        ui.setEnabled(`btnFinalP1NextQ${idx + 1}`, true);
      } else {
        ui.setEnabled(`btnFinalP2NextQ${idx + 1}`, true);
      }
    }
  });

root
  .querySelector('button[data-kind="reveal-points"]')
  ?.addEventListener("click", async () => {
    const ended = await revealPointsAndScore(roundNo, idx);
    renderMapOne(roundNo, idx);

    if (ended) return; // gra skończona (200+)

    // po odsłonięciu punktów "Dalej" się aktywuje
    if (roundNo === 1) {
      ui.setEnabled(`btnFinalP1NextQ${idx + 1}`, true);
    } else {
      ui.setEnabled(`btnFinalP2NextQ${idx + 1}`, true);
    }
  });

  root
    .querySelector('input[data-kind="out"]')
    ?.addEventListener("input", (e) => {
      row.outText = String(e.target?.value ?? "");
    });
}

async function revealAnswerOnly(roundNo /*1|2*/, idx /*0..4*/) {
  ensureRuntime();
  const rt = store.state.final.runtime;
  const q = qPicked[idx];
  const aList = answersByQ.get(q.id) || [];

  const mapArr = roundNo === 1 ? rt.map1 : rt.map2;
  const row = mapArr[idx];

  // Domyślne rozstrzygnięcie, jeśli nic nie kliknięte:
  if (row.kind !== "MATCH" && row.kind !== "MISS" && row.kind !== "SKIP") {
    const hasOut = (row.outText || "").trim().length > 0;
    row.kind = hasOut ? "MISS" : "SKIP";
  }

  // BRK ODPOWIEDZI – nie odsłaniamy, tylko dźwięk błędu
  if (row.kind === "SKIP") {
    row.revealedAnswer = true;
    row.revealedPoints = true; // nic już nie będzie odsłaniane
    const rep = roundNo === 2 && rt.p2[idx].repeat === true;
    if (rep) playSfx("answer_repeat");
    else playSfx("answer_wrong");
    return { hasAnswer: false, pts: 0 };
  }

  let out = "";

  if (row.kind === "MATCH") {
    const a = aList.find((x) => x.id === row.matchId);
    out = a?.text || "";
  } else if (row.kind === "MISS") {
    out = (row.outText || "").trim();
  }

  const txt = out.trim().length
    ? out.trim()
    : display.PLACE?.finalText || FINAL_MSG.FALLBACK_ANSWER;

  if (roundNo === 1) {
    await display.finalRevealLeftAnswer(clip11(txt));
  } else {
    await display.finalRevealRightAnswer(clip11(txt));
  }

  row.revealedAnswer = true;

  // dzwonek za odsłonięcie odpowiedzi
  playSfx("bells");

  return {
    hasAnswer: true,
    pts: row.pts || 0, // może być jeszcze 0, ale punkty liczymy przy następnym kroku
  };
}

async function revealPointsAndScore(roundNo /*1|2*/, idx /*0..4*/) {
  ensureRuntime();
  const rt = store.state.final.runtime;
  const q = qPicked[idx];
  const aList = answersByQ.get(q.id) || [];

  const mapArr = roundNo === 1 ? rt.map1 : rt.map2;
  const row = mapArr[idx];

  // jeśli jeszcze nie mamy kind/pts, policz tak jak dotąd
  if (row.kind !== "MATCH" && row.kind !== "MISS" && row.kind !== "SKIP") {
    const hasOut = (row.outText || "").trim().length > 0;
    row.kind = hasOut ? "MISS" : "SKIP";
  }

  let pts = 0;

  if (row.kind === "MATCH") {
    const a = aList.find((x) => x.id === row.matchId);
    pts = a ? nInt(a.fixed_points, 0) : 0;
  } else if (row.kind === "MISS") {
    pts = 0;
  } else if (row.kind === "SKIP") {
    // tu nie powinniśmy w ogóle trafiać; SKIP obsługujemy w revealAnswerOnly
    row.revealedPoints = true;
    return false;
  }

  row.pts = pts;
  row.revealedPoints = true;

  // odsłaniamy punkty + sumę
  rt.sum = (rt.sum || 0) + pts;

  const pts2 = String(pts).padStart(2, "0").slice(-2);

  if (roundNo === 1) {
    await display.finalRevealLeftPoints(pts2);
    await display.finalSetSuma(rt.sum, "A");
  } else {
    await display.finalRevealRightPoints(pts2);
    await display.finalSetSuma(rt.sum, "B");
  }

  updateSumUI();

  // dźwięk za punkty
  const rep = roundNo === 2 && rt.p2[idx].repeat === true;
  if (rep) {
    playSfx("answer_repeat");
  } else {
    playSfx(pts > 0 ? "answer_correct" : "answer_wrong");
  }

  // sprawdzenie 200+
  const adv = store.state.advanced || {};
  const target =
    typeof adv.finalTarget === "number" ? adv.finalTarget : 200;

  if (rt.sum >= target) {
    await gotoEnd(true);
    return true;
  }
  return false;
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
    await display.finalSetSuma(rt.sum, roundNo === 1 ? "A" : "B");
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

    // wyłączamy buzzer na czas finału
    try {
      await devices.sendBuzzerCmd("OFF");
    } catch (e) {
      console.warn("sendBuzzerCmd(OFF) in final failed", e);
    }

    await loadFinalPicked();
    
    clearFinalMsgs();
    
    const rt = store.state.final.runtime;
  
    let dur = 0;
    try {
      dur = await getSfxDuration("final_theme");
    } catch (e) {
      console.warn("getSfxDuration(final_theme) error", e);
    }

    // Całkowity czas dźwięku
    const totalMs = typeof dur === "number" && dur > 0 ? dur * 1000 : 4000;
  
    // Kotwica, w której wjeżdża plansza finału – np. 1000ms po starcie dźwięku
    const transitionAnchorMs = 1000;

    playSfx("final_theme");
  
    setTimeout(() => {
      (async () => {
        try {
          // chowamy planszę rund
          if (typeof display.roundsHideBoard === "function") {
            try {
              await display.roundsHideBoard();
            } catch (e) {
              console.error("roundsHideBoard error", e);
            }
          }
    
          // wjeżdża pusta plansza finału (FBATCH ustawia SUMA A ▒▒)
          if (typeof display.finalBoardPlaceholders === "function") {
            await display.finalBoardPlaceholders();
          }
    
        } catch (e) {
          console.error("display setup for final (delayed) failed", e);
        }
      })();
    }, transitionAnchorMs);

    // po zakończeniu dźwięku – dzwonki "wchodzimy do finału"
    if (totalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, totalMs));
    }
    playSfx("bells");
  
    ui.setMsg("msgFinal", FINAL_MSG.FINAL_STARTED);
    updateSumUI();
    setStep("f_p1_entry");
    renderP1Entry();
    ui.setEnabled("btnFinalToP1MapQ1", false);
  
    // wyzeruj timer na tripletach (np. pusty tekst po stronie wygranej drużyny)
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

  function nextFromP1Q(idx1based) {
    // idx1based: 1..5 (przycisk "Dalej" dla danego pytania)
    const n = Number(idx1based) || 1;

    if (n < 5) {
      // przejście do mapowania kolejnego pytania gracza 1
      toP1MapQ(n + 1);
    } else {
      // po pytaniu 5 przechodzimy do ekranu startu P2
      toP2Start();
    }
  }


  function toP2Start() {
    stopTimer();
    setStep("f_p2_start");
  }

  async function startP2Round() {
    ensureRuntime();
    const rt = store.state.final.runtime;
  
    // dźwięk przejścia jak w rundach
    let dur = 0;
    try {
      dur = await getSfxDuration("round_transition");
    } catch {}
    const totalMs = dur > 0 ? dur * 1000 : 2000;
    const anchorMs = 920;
  
    playSfx("round_transition");
  
    // 1) szybkie zasłonięcie lewej strony "pustym" halfem
    setTimeout(() => {
      display.finalHideAnswersKeepSum?.().catch(() => {});
    }, 200);
  
    // 2) w kotwicy – FHALF A z BIEŻĄCEGO stanu map1
    setTimeout(() => {
      (async () => {
        try {
          const rows = [];
          for (let i = 0; i < 5; i++) {
            rows.push(getP1DisplayRow(i));
          }
          await display.finalHalfAFromRows?.(rows);
          await display.finalSetSideTimer?.(getWinnerTeam(), "20");
        } catch (e) {
          console.error("finalHalf from state failed", e);
        }
      })();
    }, anchorMs);
  
    if (totalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, totalMs));
    }
  
    setStep("f_p2_entry");
    renderP2Entry();
    ui.setEnabled("btnFinalToP2MapQ1", false);
    ui.setMsg("msgFinalP2Start", FINAL_MSG.R2_STARTED);
  }


  function toP2MapQ(idx1based) {
    stopTimer();
    const idx = idx1based - 1;
    setStep(`f_p2_map_q${idx1based}`);
    renderMapOne(2, idx);
  }

  function nextFromP2Q(idx1based) {
    const n = Number(idx1based) || 1;
  
    if (n < 5) {
      toP2MapQ(n + 1);
    } else {
      // jeśli nie weszło 200+ w revealPointsAndScore,
      // kończymy finał „poniżej progu”
      gotoEnd(false);
    }
  }

  // === NOWA LOGIKA KOŃCA FINAŁU (3 tryby) ===
  async function finishFinal() {
    // fanfara finałowa
    playSfx("final_theme");
  
    const rt = store.state.final.runtime || {};
    const sum = nInt(rt.sum, 0); // suma punktów finału
  
    const adv = store.state.advanced || {};
    const target =
      typeof adv.finalTarget === "number" ? adv.finalTarget : 200;
  
    // punkty z rund
    const totals = store.state.rounds?.totals || { A: 0, B: 0 };
    const winnerTeam = getWinnerTeam();
    const roundsA = nInt(totals.A, 0);
    const roundsB = nInt(totals.B, 0);
    const winnerRounds = winnerTeam === "B" ? roundsB : roundsA;
  
    // suma FINAŁU do progu 200
    const hitTarget = sum >= target;
  
    // wszystkie punkty zwycięzcy po całej grze (rundy + finał)
    const totalPointsAll = winnerRounds + sum;
  
    // kasa: (rundy + finał) * 3 + ewentualne 25k
    let winAmount = totalPointsAll * 3;
    if (hitTarget) {
      winAmount += 25000;
    }
  
    // --- PRZESKOK NA TRIPLET ---
    try {
      const newTotals = {
        A: winnerTeam === "A" ? roundsA + sum : roundsA,
        B: winnerTeam === "B" ? roundsB + sum : roundsB,
      };
  
      // TOP = 0 (przestajemy pokazywać sumę finału)
      if (typeof display.setBankTriplet === "function") {
        await display.setBankTriplet(0); // TOP 000
      } else {
        // awaryjnie można by tu wysłać TOP ręcznie
        // await devices.sendDisplayCmd("TOP 000");
      }
  
      await display.setTotalsTriplets?.(newTotals);
    } catch (e) {
      console.warn("setTotalsTriplets after final failed", e);
    }
  
    const mode = getEndScreenMode(store);
  
    // 1) Tylko logo
    if (mode === "logo") {
      await display.showLogo?.();
      return;
    }
  
    // 2) Punkty – pokazujemy TOTAL (rundy + finał), tak jak na tripletach
    if (mode === "points") {
      if (display.showWin) {
        await display.showWin(totalPointsAll);
      } else {
        await display.showLogo?.();
      }
      return;
    }
  
    // 3) Kwota – (rundy + finał) * 3 (+25k jeśli 200+ w finale)
    if (mode === "money") {
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
