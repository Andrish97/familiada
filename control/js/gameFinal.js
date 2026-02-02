// ================== KOMUNIKATY (FINAL) ==================
const FINAL_MSG = {
  // --- błędy / warunki ---
  ERR_MISSING_5: "Brakuje 5 pytań finału (zatwierdź w ustawieniach).",

  // --- timer ---
  TIMER_PLACEHOLDER: "—",
  TIMER_RUNNING: "Odliczanie trwa…",

  // --- start / dostępność finału ---
  FINAL_DISABLED: "Finał nie został włączony.",
  FINAL_NEEDS_PICK: "Zatwierdź 5 pytań finału w ustawieniach.",
  FINAL_NEEDS_POINTS: (pts) => `Finał dostępny dopiero po osiągnięciu ${pts} punktów.`,
  FINAL_STARTED: "Finał rozpoczęty.",
  R2_STARTED: "Runda 2 rozpoczęta.",

  // --- zakończenie finału / nagrody (host hint) ---
  END_NO_PRIZE: "Finał zakończony. Logo zostanie wyświetlone.",
  END_200_PLUS: (mainPrize) => `Próg przekroczony! ${mainPrize}`,
  END_BELOW_200: (smallPrize) => `Poniżej progu. ${smallPrize}`,

  DEFAULT_MAIN_PRIZE: "Nagroda główna",
  DEFAULT_SMALL_PRIZE: "Nagroda z punktów",

  // --- etykiety pól / przycisków ---
  Q_LABEL: (n) => `Pytanie ${n}`,
  INPUT_PLACEHOLDER: "Wpisz…",

  P2_HINT_P1_PREFIX: "Odpowiedź gracza 1: ",
  P2_BTN_REPEAT_ON: "Powtórzenie ✓",
  P2_BTN_REPEAT_OFF: "Powtórzenie",

  // --- mapping / podpowiedzi prowadzącego ---
  MAP_HINT_INPUT_PREFIX: "Wpisano: ",
  MAP_HINT_NO_INPUT: "Brak wpisu",
  MAP_HINT_NO_TEXT: "Nie wpisano odpowiedzi — Puste / 0 pkt.",
  MAP_LIST_TITLE: "Lista odpowiedzi",
  MAP_LIST_EMPTY: "Brak listy odpowiedzi.",
  MAP_BTN_SKIP: "Brak odpowiedzi",
  MAP_BTN_MISS: "Nie ma na liście (0 pkt)",

  FALLBACK_ANSWER: "—",
  P1_EMPTY_UI: "Brak odpowiedzi",
  
};

// =========================================================

import { playSfx, getSfxDuration } from "../../js/core/sfx.js";

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

function hostTag(style, text) {
  return `[${style}]${String(text ?? "")}[/]`;
}

const HOST_CLR = {
  green: "#2ecc71",
  red: "#ff3333",
  yellow: "gold",
};

const FINAL_BLANK = "————";

function hostGreenStrike(text) {
  return hostTag(`${HOST_CLR.green} s`, text);
}
function hostGreen(text) {
  return hostTag(`${HOST_CLR.green}`, text);
}
function hostRed(text) {
  return hostTag(`${HOST_CLR.red}`, text);
}
function hostYellowUnderline(text) {
  return hostTag(`${HOST_CLR.yellow} u`, text);
}

// Tryb końcówki:
//  - "logo"   → zawsze pokazujemy logo
//  - "points" → używamy WIN do pokazania punktów
//  - "money"  → (tylko po finale) WIN z kwotą
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

  // timer raf
  let raf = null;

  // host cache (żeby nie spamować)
  let hostLastLeft = null;
  let hostLastRight = null;
  let hostLastTitleSecond = null;

  // ---------------- RUNTIME ----------------
  function ensureRuntime() {
    const f = (store.state.final = store.state.final || {});
    if (!f.runtime) f.runtime = {};
    const rt = f.runtime;

    if (!rt.p1) rt.p1 = Array.from({ length: 5 }, () => ({ text: "" }));
    if (!rt.p2) rt.p2 = Array.from({ length: 5 }, () => ({ text: "", repeat: false }));

    const mkRow = () => ({
      mode: "AUTO", // AUTO | MANUAL
      kind: null, // MATCH | MISS | SKIP | null
      matchId: null,
      outText: "",
      pts: 0,
      revealedAnswer: false,
      revealedPoints: false,
      locked: false, // true => SKIP “na zawsze”
      _addedToSum: false,
    });

    if (!rt.map1) rt.map1 = Array.from({ length: 5 }, mkRow);
    if (!rt.map2) rt.map2 = Array.from({ length: 5 }, mkRow);

    if (rt.halfRevealedP2 !== true) rt.halfRevealedP2 = false;
    if (!rt.sum) rt.sum = 0;

    if (!rt.timer)
      rt.timer = {
        running: false,
        phase: null, // "P1"|"P2"|null
        endsAt: 0,
        seconds: 0,
        total: 0,
        usedP1: false,
        usedP2: false,
      };

    if (rt.timer.usedP1 !== true) rt.timer.usedP1 = false;
    if (rt.timer.usedP2 !== true) rt.timer.usedP2 = false;

    if (!rt.done) rt.done = false;

    if (rt.lockStartBtn !== true) rt.lockStartBtn = false;
  }

    // ---------------- HOTKEY: Ctrl/Cmd + Shift -> start/stop timer ----------------
  function isMacLike() {
    // działa też na iPadOS w trybie desktop
    const p = navigator.platform || "";
    return /Mac|iPhone|iPad|iPod/i.test(p);
  }

  function wantsFinalTimerHotkey(e) {
    if (!e) return false;

    // Ctrl+Shift (Win/Linux) lub Cmd+Shift (macOS)
    const main = isMacLike() ? e.metaKey : e.ctrlKey;
    if (!main || !e.shiftKey) return false;

    // nie reaguj na Alt (żeby uniknąć dziwnych układów klawiatury)
    if (e.altKey) return false;

    // nie spamuj gdy klawisz trzymany
    if (e.repeat) return false;

    return true;
  }

  function isTypingTarget(t) {
    const el = t;
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable === true;
  }

  function handleFinalTimerHotkey(e) {
    if (!wantsFinalTimerHotkey(e)) return;

    // jeśli ktoś pisze w inpucie, to i tak pozwalamy (bo to skrót specjalny),
    // ale blokujemy, gdy finał nie jest w trybie entry (żeby nie mieszać w mapowaniu)
    const step = store.state.final?.step || "";
    if (step !== "f_p1_entry" && step !== "f_p2_entry") return;

    e.preventDefault();
    e.stopPropagation();

    ensureRuntime();
    const rt = store.state.final.runtime;

    // jak timer już leci, to skrót go zatrzyma (bo p1StartTimer/p2StartTimer robi toggle)
    if (step === "f_p1_entry") {
      // dodatkowo: jeśli w danym momencie przycisk jest "twardo" wyłączony, nie rób nic
      // (np. ktoś już zużył timer i nie można startować ponownie)
      const btn = document.getElementById("btnFinalP1StartTimer");
      if (btn && btn.disabled && !(rt.timer.running && rt.timer.phase === "P1")) return;

      p1StartTimer();
      return;
    }

    if (step === "f_p2_entry") {
      const btn = document.getElementById("btnFinalP2StartTimer");
      if (btn && btn.disabled && !(rt.timer.running && rt.timer.phase === "P2")) return;

      p2StartTimer();
      return;
    }
  }

  // podpinamy raz na życie createFinal()
  document.addEventListener("keydown", handleFinalTimerHotkey, { capture: true });


  // ---------------- HELPERS: UI ----------------
  function setStep(step) {
    store.state.final.step = step;
    ui.showFinalStep(step);
    hostUpdate();
  }

  function updateSumUI() {
    const rt = store.state.final.runtime;
    ui.setText("finalSum", String(rt.sum || 0));
  }

  function getWinnerTeam() {
    return store.state?.winnerTeam || store.state?.final?.winnerTeam || "A";
  }

  function setUiTimerForPhase(phase, value) {
    if (phase === "P1") ui.setFinalTimerP1(String(value));
    if (phase === "P2") ui.setFinalTimerP2(String(value));
  }

  function setTimerBtnEnabled(phase, enabled) {
    const id = phase === "P1" ? "btnFinalP1StartTimer" : "btnFinalP2StartTimer";
    ui.setEnabled?.(id, !!enabled);
  }

  function setTimerBtnLabel(phase, mode /* "start"|"stop" */) {
    const id = phase === "P1" ? "btnFinalP1StartTimer" : "btnFinalP2StartTimer";
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent =
      mode === "stop"
        ? "Zatrzymaj odliczanie"
        : phase === "P1"
          ? "Rozpocznij odliczanie (15s)"
          : "Rozpocznij odliczanie (20s)";
  }

  async function restoreTotalsTriplets() {
    try {
      const totals = store.state.rounds?.totals || { A: 0, B: 0 };
      await display.setTotalsTriplets?.(totals);
    } catch {}
  }

  // ---------------- HELPERS: DATA ----------------
  function getAnswersForIdx(idx) {
    const q = qPicked[idx];
    return answersByQ.get(q?.id) || [];
  }

  function isRepeat(roundNo, idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    return roundNo === 2 && rt.p2[idx]?.repeat === true;
  }

  function getInput(roundNo, idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    if (roundNo === 1) return String(rt.p1[idx]?.text || "").trim();
    if (roundNo === 2) return String(rt.p2[idx]?.text || "").trim();
    return "";
  }

  function getRow(roundNo, idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    return (roundNo === 1 ? rt.map1 : rt.map2)[idx];
  }

  // Resolver: zapewnia kind, jeśli AUTO i jeszcze null
  function ensureDefaultMapping(roundNo, idx) {
    ensureRuntime();
    const row = getRow(roundNo, idx);
    if (!row) return;

    const rep = isRepeat(roundNo, idx);
    const input = getInput(roundNo, idx);
    const hasInput = input.length > 0;

    if (row.locked) {
      row.kind = "SKIP";
      row.matchId = null;
      row.pts = 0;
      return;
    }

    if (row.mode === "MANUAL" && (row.kind === "MATCH" || row.kind === "MISS" || row.kind === "SKIP")) {
      return;
    }

    if (row.kind === "MATCH" || row.kind === "MISS" || row.kind === "SKIP") {
      if (row.mode === "AUTO") {
        if (!hasInput) {
          row.kind = "SKIP";
          row.matchId = null;
          row.outText = "";
          row.pts = 0;
        } else {
          if (row.kind !== "MATCH") {
            row.kind = "MISS";
            row.matchId = null;
            row.pts = 0;
          }
        }
      }
      return;
    }

    if (!hasInput) {
      row.kind = "SKIP";
      row.matchId = null;
      row.outText = "";
      row.pts = 0;
      row.mode = "AUTO";
    } else {
      row.kind = "MISS";
      row.matchId = null;
      row.outText = input;
      row.pts = 0;
      row.mode = "AUTO";
    }
  }

  function resolveShownText(roundNo, idx) {
    ensureDefaultMapping(roundNo, idx);
    const row = getRow(roundNo, idx);
    const input = getInput(roundNo, idx);
    const list = getAnswersForIdx(idx);
  
    if (!row) return FINAL_BLANK;
    if (row.kind === "SKIP") return FINAL_BLANK;
  
    if (row.kind === "MATCH") {
      const a = list.find((x) => x.id === row.matchId);
      const txt = String(a?.text || "").trim();
      return txt || FINAL_BLANK;
    }
  
    // MISS => to co wpisane
    return input.trim() || FINAL_BLANK;
  }

  function resolvePoints(roundNo, idx) {
    ensureDefaultMapping(roundNo, idx);
    const row = getRow(roundNo, idx);
    const list = getAnswersForIdx(idx);

    if (!row) return 0;
    if (row.kind === "MATCH") {
      const a = list.find((x) => x.id === row.matchId);
      return a ? nInt(a.fixed_points, 0) : 0;
    }
    return 0;
  }

  function resolveP1ShownForUi(idx) {
    const t = resolveShownText(1, idx);
    return t === FINAL_BLANK ? FINAL_MSG.P1_EMPTY_UI : t;
  }

  function allFilledP1() {
    ensureRuntime();
    const rt = store.state.final.runtime;
    return rt.p1.every((x) => String(x.text || "").trim().length > 0);
  }

  function allFilledP2() {
    ensureRuntime();
    const rt = store.state.final.runtime;
    return rt.p2.every((x) => (x.repeat ? true : String(x.text || "").trim().length > 0));
  }

  // ---------------- HOST ----------------
  async function hostSetLeft(lines) {
    const txt = lines.join("\n").replace(/"/g, '\\"');
    if (txt === hostLastLeft) return;
    hostLastLeft = txt;
    try { await devices.sendHostCmd(`SET1 "${txt}"`); } catch {}
  }

  async function hostSetRight(lines) {
    const txt = lines.join("\n").replace(/"/g, '\\"');
    if (txt === hostLastRight) return;
    hostLastRight = txt;
    try { await devices.sendHostCmd(`SET2 "${txt}"`); } catch {}
  }

  async function hostClearAll() {
    hostLastLeft = null;
    hostLastRight = null;
    try { await devices.sendHostCmd("CLEAR"); } catch {}
  }

  async function hostCoverRight() {
    try { await devices.sendHostCmd("COVER"); } catch {}
  }

  async function hostClearRight() {
    hostLastRight = null;
    try { await devices.sendHostCmd("CLEAR2"); } catch {}
  }

  function hostEntryStatus(roundNo, i) {
    ensureRuntime();
    const rt = store.state.final.runtime;

    if (roundNo === 1) {
      const ok = (rt.p1[i].text || "").trim().length > 0;
      return ok ? hostGreenStrike("wpisano") : hostRed("brak");
    }

    if (rt.p2[i].repeat === true) return hostYellowUnderline("powtórzenie");
    const ok = (rt.p2[i].text || "").trim().length > 0;
    return ok ? hostGreenStrike("wpisano") : hostRed("brak");
  }

  function hostTitleForStep() {
    const rt = store.state.final?.runtime;
    const step = store.state.final?.step || "";

    if (step === "f_p1_entry") {
      const counting = rt?.timer?.running && rt?.timer?.phase === "P1";
      const s = Math.max(0, Number(rt?.timer?.seconds || 0));
      if (counting) {
        if (hostLastTitleSecond === s) return null;
        hostLastTitleSecond = s;
        return `FINAŁ RUNDA 1 — ODLICZANIE ${s}s`;
      }
      hostLastTitleSecond = null;
      return `FINAŁ RUNDA 1`;
    }

    if (step === "f_p2_entry") {
      const counting = rt?.timer?.running && rt?.timer?.phase === "P2";
      const s = Math.max(0, Number(rt?.timer?.seconds || 0));
      if (counting) {
        if (hostLastTitleSecond === s) return null;
        hostLastTitleSecond = s;
        return `FINAŁ RUNDA 2 — ODLICZANIE ${s}s`;
      }
      hostLastTitleSecond = null;
      return `FINAŁ RUNDA 2`;
    }

    hostLastTitleSecond = null;

    if (step.startsWith("f_p1_map_q")) return `FINAŁ RUNDA 1 — ODSŁANIANIE`;
    if (step.startsWith("f_p2_map_q")) return `FINAŁ RUNDA 2 — ODSŁANIANIE`;

    return "";
  }

  function hostMappingLeft(roundNo, idx) {
    const q = qPicked[idx];
    const title = hostTag(
      "b",
      roundNo === 1 ? "FINAŁ — ODSŁANIANIE (RUNDA 1)" : "FINAŁ — ODSŁANIANIE (RUNDA 2)"
    );
    const qLine = `${hostTag("u", `Pytanie ${idx + 1}`)}: ${(q?.text || "—").replace(/\s+/g, " ").trim()}`;
    return [title, "", qLine];
  }

  function hostMappingRight(roundNo, idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
  
    const q = qPicked[idx];
    const list = (answersByQ.get(q?.id) || []).slice();
  
    const row = getRow(roundNo, idx);
    ensureDefaultMapping(roundNo, idx);
  
    const rawP1 = (rt.p1[idx]?.text || "").trim();
    const shownP1 = resolveP1ShownForUi(idx).trim();
    const rawP2 = (rt.p2[idx]?.text || "").trim();
  
    const rep = roundNo === 2 && rt.p2[idx]?.repeat === true;
  
    const lines = []; // <<< BRAKOWAŁO TEGO
  
    if (roundNo === 2) {
      lines.push(`${hostTag("u", "Gracz 1")}: ${(shownP1 || "—").replace(/\s+/g, " ").trim()}`);
      lines.push("");
    }
  
    const input = roundNo === 1 ? rawP1 : (rep ? "" : rawP2); // "Wprowadzono" (dla powtórzenia pusto)
    if (input) lines.push(`${hostTag("u", "Wprowadzono")}: ${input.replace(/\s+/g, " ").trim()}`);
  
    let statusLine = "";
    if (rep) statusLine = hostYellowUnderline("powtórzenie");
    else if (!input) statusLine = hostRed("brak odpowiedzi");
    else if (row.kind === "MATCH" && row.matchId) statusLine = hostGreenStrike("z listy");
    else statusLine = hostYellowUnderline("nie ma na liście");
  
    lines.push(`${hostTag("u", "Stan")}: ${statusLine}`);
    lines.push("");
  
    const sorted = list.sort((a, b) => nInt(b.fixed_points, 0) - nInt(a.fixed_points, 0));
    lines.push(hostTag("u", "Lista odpowiedzi:"));
  
    const listLines = sorted.map((a) => {
      const t = String(a.text || "").replace(/\s+/g, " ").trim().slice(0, 30);
      const p = nInt(a.fixed_points, 0);
      if (row.kind === "MATCH" && row.matchId === a.id) {
        return `${hostGreenStrike(t)} ${hostGreenStrike(`(${p})`)}`;
      }
      return `${t} (${p})`;
    });
  
    return [...lines, ...listLines];
  }

  function hostUpdate() {
    const step = store.state.final?.step || "";

    if (step.startsWith("f_p1_map_q")) {
      const idx = Number(step.slice(-1)) - 1;
      hostSetLeft(hostMappingLeft(1, idx));
      hostSetRight(hostMappingRight(1, idx));
      return;
    }
    if (step.startsWith("f_p2_map_q")) {
      const idx = Number(step.slice(-1)) - 1;
      hostSetLeft(hostMappingLeft(2, idx));
      hostSetRight(hostMappingRight(2, idx));
      return;
    }

    const titleMaybe = hostTitleForStep();
    const title = titleMaybe === null ? null : titleMaybe;

    if (title === "") {
      hostClearAll();
      return;
    }

    const effectiveTitle =
      title ??
      (hostLastLeft ? hostLastLeft.split("\n")[0].replace(/^\[b\]|\[\/\]$/g, "") : "");

    const roundNo =
      step === "f_p1_entry" || step.startsWith("f_p1_")
        ? 1
        : step === "f_p2_entry" || step.startsWith("f_p2_")
          ? 2
          : 1;

    const linesLeft = [hostTag("b", effectiveTitle || ""), ""];
    for (let i = 0; i < 5; i++) {
      const qt = (qPicked[i]?.text || "—").replace(/\s+/g, " ").trim();
      const st = hostEntryStatus(roundNo, i);
      linesLeft.push(`${i + 1}) ${qt} — ${st}`);
    }

    hostSetLeft(linesLeft);
    hostClearRight();
  }

  // ---------------- TIMER ----------------
  async function displaySetTimerSeconds(sec) {
    const txt = String(Math.max(0, sec));
    const phase = store.state.final?.runtime?.timer?.phase || null;

    if (phase === "P1") ui.setFinalTimerP1(txt);
    if (phase === "P2") ui.setFinalTimerP2(txt);

    await display.finalSetSideTimer?.(getWinnerTeam(), txt);
  }

  // KLUCZ: timer reset ZAWSZE przywraca totals + czyści side timer
  async function timerStopAndReset() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    rt.timer.running = false;
    rt.timer.phase = null;
    rt.timer.endsAt = 0;
    rt.timer.seconds = 0;
    rt.timer.total = 0;

    if (raf) cancelAnimationFrame(raf);
    raf = null;

    ui.setFinalTimerP1(FINAL_MSG.TIMER_PLACEHOLDER);
    ui.setFinalTimerP2(FINAL_MSG.TIMER_PLACEHOLDER);

    await restoreTotalsTriplets();

    hostUpdate();
  }

  async function timerStopEarlyIfAllowed(phase) {
    ensureRuntime();
    const rt = store.state.final.runtime;

    if (!rt.timer.running || rt.timer.phase !== phase) return;

    const ok = phase === "P1" ? allFilledP1() : allFilledP2();
    if (!ok) return;

    rt.timer.running = false;
    rt.timer.phase = null;
    rt.timer.endsAt = 0;
    rt.timer.seconds = 0;
    rt.timer.total = 0;

    if (raf) cancelAnimationFrame(raf);
    raf = null;

    setUiTimerForPhase(phase, FINAL_MSG.TIMER_PLACEHOLDER);

    await restoreTotalsTriplets();

    if (phase === "P1") ui.setEnabled("btnFinalToP1MapQ1", true);
    if (phase === "P2") ui.setEnabled("btnFinalToP2MapQ1", true);

    setTimerBtnLabel(phase, "start");
    setTimerBtnEnabled(phase, false);

    hostUpdate();
  }

  function timerStart(seconds, phase) {
    ensureRuntime();
    const rt = store.state.final.runtime;

    // poprzedni timer: tniemy bez await (to tylko UI), ale totals i tak wrócą po zakończeniu
    rt.timer.running = false;
    rt.timer.phase = null;
    rt.timer.endsAt = 0;
    rt.timer.seconds = 0;
    rt.timer.total = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = null;

    rt.timer.running = true;
    rt.timer.phase = phase;
    rt.timer.total = seconds;
    rt.timer.seconds = seconds;
    rt.timer.endsAt = Date.now() + seconds * 1000;

    setUiTimerForPhase(phase, String(seconds));
    displaySetTimerSeconds(seconds).catch(() => {});
    hostUpdate();

    const tick = () => {
      if (!rt.timer.running) return;

      const leftMs = Math.max(0, rt.timer.endsAt - Date.now());
      const s = Math.ceil(leftMs / 1000);

      if (s !== rt.timer.seconds) {
        rt.timer.seconds = s;
        hostUpdate();
        displaySetTimerSeconds(s).catch(() => {});
      }

      if (leftMs <= 0) {
        rt.timer.running = false;
        rt.timer.seconds = 0;

        setUiTimerForPhase(phase, "0");
        hostUpdate();

        // KLUCZ: po timeout też wracamy do totals i zdejmujemy timer
        restoreTotalsTriplets().catch(() => {});

        playSfx("time_over");

        if (phase === "P1") ui.setEnabled("btnFinalToP1MapQ1", true);
        if (phase === "P2") ui.setEnabled("btnFinalToP2MapQ1", true);

        setTimerBtnLabel(phase, "start");
        setTimerBtnEnabled(phase, false);
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
  }

  // ---------------- LOAD ----------------
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

  // ---------------- RENDER: ENTRY ----------------
  function renderP1Entry() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    const html = `
      <div class="finalTableWrap">
        <table class="finalTable">
          <thead>
            <tr>
              <th>Pytanie</th>
              <th>Odpowiedź</th>
            </tr>
          </thead>
          <tbody>
            ${qPicked.map((q, i) => {
              const val = rt.p1[i].text || "";
              return `
                <tr>
                  <td class="qCell">${escapeHtml(q.text || "")}</td>
                  <td class="aCell">
                    <input class="inp" data-p="1" data-i="${i}"
                      value="${escapeHtml(val)}"
                      placeholder="${escapeHtml(FINAL_MSG.INPUT_PLACEHOLDER)}"
                      autocomplete="off"/>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    ui.setHtml("finalP1Inputs", html);


    document.querySelectorAll('#finalP1Inputs input[data-p="1"]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        rt.p1[i].text = String(inp.value ?? "");

        const row = rt.map1?.[i];
        if (row && row.mode === "AUTO" && !row.locked) {
          row.kind = null;
          row.matchId = null;
          if (!rt.p1[i].text.trim()) row.outText = "";
        }

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
    setTimerBtnEnabled("P1", !rt.timer.usedP1 || (rt.timer.running && rt.timer.phase === "P1"));
    setTimerBtnLabel("P1", rt.timer.running && rt.timer.phase === "P1" ? "stop" : "start");
  }

  function renderP2Entry() {
    ensureRuntime();
    const rt = store.state.final.runtime;

     const html = `
      <div class="finalTableWrap">
        <table class="finalTable">
          <thead>
            <tr>
              <th>Pytanie</th>
              <th>Odpowiedź gracza 1</th>
              <th>Odpowiedź</th>
              <th>Powtórzenie</th>
            </tr>
          </thead>
          <tbody>
            ${qPicked.map((q, i) => {
              const v2 = rt.p2[i].text || "";
              const repeat = rt.p2[i].repeat === true;
              const p1Shown = resolveP1ShownForUi(i);
    
              return `
                <tr>
                  <td class="qCell">${escapeHtml(q.text || "")}</td>
    
                  <td class="p1Cell">
                    <div class="p1Shown">${escapeHtml(p1Shown)}</div>
                  </td>
    
                  <td class="aCell">
                    <input class="inp" data-p="2" data-i="${i}"
                      value="${escapeHtml(v2)}"
                      placeholder="${escapeHtml(FINAL_MSG.INPUT_PLACEHOLDER)}"
                      autocomplete="off"/>
                  </td>
    
                  <td class="repCell">
                    <button class="btn sm danger" type="button" data-repeat="2" data-i="${i}">
                      ${repeat ? escapeHtml(FINAL_MSG.P2_BTN_REPEAT_ON) : escapeHtml(FINAL_MSG.P2_BTN_REPEAT_OFF)}
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    ui.setHtml("finalP2Inputs", html);

    document.querySelectorAll('#finalP2Inputs input[data-p="2"]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        const val = String(inp.value ?? "");
        rt.p2[i].text = val;

        const row = rt.map2?.[i];
        if (row && row.mode === "AUTO" && !row.locked) {
          row.kind = null;
          row.matchId = null;
          if (!rt.p2[i].text.trim()) row.outText = "";
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

        // Shift+Enter w pustym polu → zaznacza Powtórzenie + dźwięk
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
        
          const prev = rt.p2[i].repeat === true;
          const next = !prev;
          rt.p2[i].repeat = next;
        
          const row = rt.map2?.[i];
          if (next) {
            if (!prev) playSfx("answer_repeat");
            if (row) {
              row.mode = "MANUAL";
              row.locked = false;
              row.kind = "SKIP";
              row.matchId = null;
              row.outText = "";
              row.pts = 0;
            }
          } else {
            if (row) {
              row.locked = false;
              row.mode = "AUTO";
              row.kind = null;
              row.matchId = null;
              row.outText = "";
              row.pts = 0;
            }
          }
        
          renderP2Entry();
          document.querySelector(`#finalP2Inputs input[data-p="2"][data-i="${i + 1}"]`)?.focus();
          hostUpdate();
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

        const row = rt.map2?.[i];
        if (next) {
          if (!prev) playSfx("answer_repeat");
          if (row) {
            row.mode = "MANUAL";
            row.locked = false;
            row.kind = "SKIP";
            row.matchId = null;
            row.outText = "";
            row.pts = 0;
          }
        } else {
          if (row) {
            row.locked = false;
            row.mode = "AUTO";
            row.kind = null;
            row.matchId = null;
            row.outText = "";
            row.pts = 0;
          }
        }

        renderP2Entry();
        hostUpdate();
      });
    });

    ui.setEnabled("btnFinalToP2MapQ1", !rt.timer.running && rt.timer.usedP2);
    setTimerBtnEnabled("P2", !rt.timer.usedP2 || (rt.timer.running && rt.timer.phase === "P2"));
    setTimerBtnLabel("P2", rt.timer.running && rt.timer.phase === "P2" ? "stop" : "start");
  }

  // ---------------- RENDER: MAPPING ----------------
  function renderMapOne(roundNo, idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const q = qPicked[idx];
    const aList = getAnswersForIdx(idx);
  
    const row = getRow(roundNo, idx);
    ensureDefaultMapping(roundNo, idx);
  
    const isR2 = roundNo === 2;
    if (roundNo === 2 && rt.p2[idx]?.repeat === true) {
      row.locked = false; // repeat nie może zostawić kłódki
    }
    const lockedForever = row.locked === true; // tylko "na zawsze" (SKIP), NIE od repeat
  
    const inputP1 = String(rt.p1[idx]?.text ?? "").trim();
    const inputP2 = String(rt.p2[idx]?.text ?? "").trim();
    const typed = (roundNo === 1 ? inputP1 : inputP2);
    const hasTyped = typed.length > 0;
  
    const p2IsRepeat = isR2 && rt.p2[idx]?.repeat === true;
  
    // P2 nie może zająć tej samej pozycji co P1 (MATCH)
    const p1Row = rt.map1?.[idx];
    const p1BlockedId =
      isR2 && p1Row?.kind === "MATCH" && p1Row?.matchId ? p1Row.matchId : null;
  
    // --- UI: enable/disable zależne WYŁĄCZNIE od tego, co jest w polu (plus revealed/locked) ---
    const canEdit = row.revealedAnswer !== true;
  
    // Gdy pusto: aktywne tylko SKIP + (w R2 także REPEAT), reszta disabled
    // Gdy wpisane: aktywne MATCH/MISS + (w R2 także REPEAT), SKIP disabled
    const allowSkip = !hasTyped && !lockedForever;
    const allowChoice = hasTyped && !lockedForever; // MATCH/MISS
    const allowRepeat = isR2; // nigdy disabled
  
    // domyślne radio (tylko jeśli nie odsłonięto i nie jest "lockedForever")
    // - jeśli repeat włączony: UI pokazuje repeat jako aktywne (radio),
    //   a row.kind może zostać, ale jest "przykryte" przez repeat
    // - jeśli repeat wyłączony: zależy od pola
    if (!row.revealedAnswer && !lockedForever && !p2IsRepeat) {
      // tylko gdy repeat nie jest aktywny
      if (!hasTyped) {
        if (row.mode === "AUTO") {
          row.kind = "SKIP";
          row.matchId = null;
          row.pts = 0;
        }
      } else {
        if (row.mode === "AUTO") {
          row.kind = "MISS";
          row.matchId = null;
          row.pts = 0;
        }
      }
    }
  
    // --- przyciski listy (MATCH) + akcje w stałym gridzie 3x3 ---
    const matchTiles = aList.map((a) => {
      const active = !p2IsRepeat && row.kind === "MATCH" && row.matchId === a.id;
      const blocked = !!p1BlockedId && a.id === p1BlockedId;
  
      const disabled =
        !allowChoice || row.revealedAnswer === true || blocked || lockedForever;
  
      return `
        <button class="btn sm ${active ? "gold" : ""}" type="button"
                data-kind="match" data-id="${a.id}"
                ${disabled ? "disabled" : ""}>
          ${escapeHtml(a.text)} <span style="opacity:.7;">(${nInt(a.fixed_points, 0)})</span>
          ${blocked ? `<span style="opacity:.7;"> (zajęte)</span>` : ``}
        </button>
      `;
    });
  
    const missActive = !p2IsRepeat && row.kind === "MISS";
    const skipActive = !p2IsRepeat && row.kind === "SKIP";
  
    const actionTiles = [];
  
    // akcje zawsze "po odpowiedziach"
    actionTiles.push(`
      <button class="btn sm danger ${missActive ? "gold" : ""}" type="button" data-kind="miss"
        ${(lockedForever || row.revealedAnswer) ? "disabled" : ""}>
        ${escapeHtml(FINAL_MSG.MAP_BTN_MISS)}
      </button>
    `);
  
    actionTiles.push(`
      <button class="btn sm ${skipActive ? "gold" : ""}" type="button" data-kind="skip"
        ${(lockedForever || row.revealedAnswer) ? "disabled" : ""}>
        ${escapeHtml(FINAL_MSG.MAP_BTN_SKIP)}
      </button>
    `);
  
    if (isR2) {
      actionTiles.push(`
        <button class="btn sm danger ${p2IsRepeat ? "gold" : ""}" type="button" data-kind="repeat"
          ${(row.revealedAnswer || row.revealedPoints) ? "disabled" : ""}>
          ${escapeHtml(FINAL_MSG.P2_BTN_REPEAT_OFF)}
        </button>
      `);
    }
  
    // 3x3 zawsze: najpierw odpowiedzi, potem akcje, reszta puste sloty
    const tiles = [...matchTiles, ...actionTiles].slice(0, 9);
    while (tiles.length < 9) tiles.push(`<div class="mapSlot"></div>`);
  
    const p1Shown = resolveP1ShownForUi(idx);
  
    const whoLabel = roundNo === 1 ? "Odpowiedź gracza" : "Odpowiedź gracza 2";
    const playerVal =
      roundNo === 1 ? (rt.p1[idx]?.text ?? "") : (rt.p2[idx]?.text ?? "");
  
    const html = `
      <div class="finalMapTop">
        <div class="qPrompt">${escapeHtml(q.text || "")}</div>
  
        <div class="finalMapGrid">
          <div class="finalMapLine">
            <div class="lbl">${escapeHtml(whoLabel)}</div>
            <input class="inp" data-kind="player"
                   value="${escapeHtml(playerVal)}"
                   ${canEdit ? "" : "disabled"}
                   placeholder="${escapeHtml(FINAL_MSG.INPUT_PLACEHOLDER)}"
                   autocomplete="off"/>
          </div>
  
          ${isR2 ? `
            <div class="finalMapLine">
              <div class="lbl">Odpowiedź gracza 1</div>
              <div class="val">${escapeHtml(p1Shown)}</div>
            </div>
          ` : ``}
        </div>
      </div>
  
      <div class="card finalRowCard" style="margin-top:12px;">
        <div class="mapBtnsGrid">
          ${tiles.join("")}
        </div>
      </div>
  
      <div class="finalRevealActions">
        <button
          class="btn finalRevealBtn answer"
          type="button"
          data-kind="reveal-answer"
          ${row.revealedAnswer ? "disabled" : ""}
        >
          Odsłoń odpowiedź
        </button>
      
        <button
          class="btn finalRevealBtn points"
          type="button"
          data-kind="reveal-points"
          ${!row.revealedAnswer || row.revealedPoints ? "disabled" : ""}
        >
          Odsłoń punkty
        </button>
      </div>
    `;
  
    const rootId = roundNo === 1 ? `finalP1MapQ${idx + 1}` : `finalP2MapQ${idx + 1}`;
    ui.setHtml(rootId, html);
  
    const root = document.getElementById(rootId);
    if (!root) return;
  
    const nextBtnId = roundNo === 1 ? `btnFinalNextFromP1Q${idx + 1}` : `btnFinalNextFromP2Q${idx + 1}`;
    ui.setEnabled(nextBtnId, !!row.revealedAnswer && !!row.revealedPoints);
  
    // --- helper: przełączanie stanów bez re-rendera (żeby nie tracić fokusu) ---
    function applyUiState() {
      const nowVal = String(root.querySelector('input[data-kind="player"]')?.value ?? "").trim();
      const nowHasTyped = nowVal.length > 0;
  
      const nowRepeat = isR2 && rt.p2[idx]?.repeat === true;
  
      const allowSkipNow = !nowHasTyped && !lockedForever && row.revealedAnswer !== true;
      const allowChoiceNow = nowHasTyped && !lockedForever && row.revealedAnswer !== true;
  
      // SKIP / MISS
      const btnSkip = root.querySelector('button[data-kind="skip"]');
      const btnMiss = root.querySelector('button[data-kind="miss"]');
  
      if (btnSkip) btnSkip.disabled = !allowSkipNow;
      if (btnMiss) btnMiss.disabled = !allowChoiceNow;
  
      // MATCH
      root.querySelectorAll('button[data-kind="match"]').forEach((b) => {
        const blocked = !!p1BlockedId && b.dataset.id === p1BlockedId;
        b.disabled = !allowChoiceNow || blocked;
      });
  
      // REPEAT
      const btnRepeat = root.querySelector('button[data-kind="repeat"]');
      const frozen = (row.revealedAnswer === true) || (row.revealedPoints === true);
      if (btnRepeat) btnRepeat.disabled = frozen;
  
      // gold: zdejmij wszystkim, potem ustaw właściwy
      root.querySelectorAll('button[data-kind]').forEach((b) => b.classList.remove("gold"));
  
      if (nowRepeat) {
        btnRepeat?.classList.add("gold");
      } else {
        if (row.kind === "SKIP") btnSkip?.classList.add("gold");
        if (row.kind === "MISS") btnMiss?.classList.add("gold");
        if (row.kind === "MATCH" && row.matchId) {
          root
            .querySelector(`button[data-kind="match"][data-id="${CSS.escape(row.matchId)}"]`)
            ?.classList.add("gold");
        }
      }
    }
  
    // na start
    applyUiState();
  
  
    // --- INPUT: nie renderujemy na żywo (żeby nie wywalało z pola) ---
    root.querySelector('input[data-kind="player"]')?.addEventListener("input", (e) => {
      const vRaw = String(e.target?.value ?? "");
  
      if (roundNo === 1) rt.p1[idx].text = vRaw;
      else rt.p2[idx].text = vRaw;
  
      // jeśli ktoś pisze w R2 i było repeat -> zdejmujemy repeat
      if (isR2 && rt.p2[idx].repeat === true) {
        rt.p2[idx].repeat = false;
      }
  
      // AUTO: zmiana treści = kasujemy wybór, a default wynika z pola
      if (row.mode === "AUTO" && !lockedForever && row.revealedAnswer !== true) {
        row.kind = null;
        row.matchId = null;
        row.pts = 0;
      }
  
      ensureDefaultMapping(roundNo, idx);
      applyUiState();
      hostUpdate();
    });
  
    // --- MATCH: klik = wybór + zdejmuje repeat (ale nie blokowane przez repeat) ---
    root.querySelectorAll('button[data-kind="match"]').forEach((b) => {
      b.addEventListener("click", () => {
        if (lockedForever || row.revealedAnswer) return;
  
        // klik w inne radio -> repeat OFF
        if (isR2 && rt.p2[idx].repeat === true) rt.p2[idx].repeat = false;
  
        // musi być wpisane (logika od pola)
        const nowVal = String(root.querySelector('input[data-kind="player"]')?.value ?? "").trim();
        if (!nowVal) return;
  
        row.mode = "MANUAL";
        row.kind = "MATCH";
        row.matchId = b.dataset.id || null;
  
        applyUiState();
        hostUpdate();
      });
    });
  
    // --- MISS: tylko gdy wpisane; klik zdejmuje repeat ---
    root.querySelector('button[data-kind="miss"]')?.addEventListener("click", () => {
      if (lockedForever || row.revealedAnswer) return;
  
      if (isR2 && rt.p2[idx].repeat === true) rt.p2[idx].repeat = false;
  
      const nowVal = String(root.querySelector('input[data-kind="player"]')?.value ?? "").trim();
      if (!nowVal) return;
  
      row.mode = "MANUAL";
      row.kind = "MISS";
      row.matchId = null;
  
      applyUiState();
      hostUpdate();
    });
  
    // --- SKIP: tylko gdy pusto; klik zdejmuje repeat ---
    root.querySelector('button[data-kind="skip"]')?.addEventListener("click", () => {
      if (lockedForever || row.revealedAnswer) return;
  
      if (isR2 && rt.p2[idx].repeat === true) rt.p2[idx].repeat = false;
  
      const nowVal = String(root.querySelector('input[data-kind="player"]')?.value ?? "").trim();
      if (nowVal) return;
  
      row.mode = "MANUAL";
      row.kind = "SKIP";
      row.matchId = null;
      row.outText = "";
  
      applyUiState();
      hostUpdate();
    });
  
  
    // REPEAT (jednokierunkowo: tylko WŁĄCZA, wyłącza się przez inne akcje)
    root.querySelector('button[data-kind="repeat"]')?.addEventListener("click", () => {
      if (roundNo !== 2) return;
      if (row.revealedAnswer) return;
    
      // repeat nie ma "odciskania"
      if (rt.p2[idx].repeat === true) {
        // nic nie zmieniamy
        return;
      }
    
      rt.p2[idx].repeat = true;
    
      // repeat = domyślne SKIP, ale bez blokowania innych przycisków
      row.mode = "MANUAL";
      row.locked = false;      // <-- KLUCZ
      row.kind = "SKIP";
      row.matchId = null;
      row.outText = "";
      row.pts = 0;
    
      renderMapOne(roundNo, idx);
      hostUpdate();
    });

    root.querySelector('button[data-kind="reveal-answer"]')?.addEventListener("click", async () => {
      await revealAnswerOnly(roundNo, idx);
      renderMapOne(roundNo, idx);
      hostUpdate();
    });
  
    root.querySelector('button[data-kind="reveal-points"]')?.addEventListener("click", async () => {
      const ended = await revealPointsAndScore(roundNo, idx);
      renderMapOne(roundNo, idx);
      if (!ended) ui.setEnabled(nextBtnId, true);
      hostUpdate();
    });
  }


  // ---------------- REVEAL ----------------
  async function revealAnswerOnly(roundNo, idx) {
    ensureRuntime();
    const row = getRow(roundNo, idx);

    ensureDefaultMapping(roundNo, idx);

    const txt = resolveShownText(roundNo, idx);
    const shown = txt === FINAL_BLANK ? FINAL_BLANK : clip11(txt);

    if (roundNo === 1) await display.finalSetLeft(idx + 1, shown);
    else await display.finalSetRight(idx + 1, shown);

    row.revealedAnswer = true;
    row.revealedPoints = false;

    playSfx("bells");
    return { hasAnswer: true };
  }

  async function revealPointsAndScore(roundNo, idx) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const row = getRow(roundNo, idx);

    ensureDefaultMapping(roundNo, idx);

    const pts = resolvePoints(roundNo, idx);
    row.pts = pts;
    row.revealedPoints = true;

    if (!row._addedToSum) {
      rt.sum = (rt.sum || 0) + pts;
      row._addedToSum = true;
    }

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

    const adv = store.state.advanced || {};
    const target = typeof adv.finalTarget === "number" ? adv.finalTarget : 200;

    if (nInt(rt.sum, 0) >= target) {
      await gotoEnd(true);
      return true;
    }

    return false;
  }

  async function gotoEnd(hit200) {
    ensureRuntime();
    await timerStopAndReset();

    await hostClearAll().catch(() => {});

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

  // ---------------- PUBLIC ACTIONS ----------------
  async function startFinal() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    rt.lockStartBtn = true;
    ui.setEnabled?.("btnFinalStart", false);

    try {
      if (store.state.hasFinal !== true) {
        ui.setMsg("msgFinal", FINAL_MSG.FINAL_DISABLED);
        rt.lockStartBtn = false;
        ui.setEnabled?.("btnFinalStart", true);
        return;
      }

      if (!store.state.final.confirmed || (store.state.final.picked || []).length !== 5) {
        ui.setMsg("msgFinal", FINAL_MSG.FINAL_NEEDS_PICK);
        rt.lockStartBtn = false;
        ui.setEnabled?.("btnFinalStart", true);
        return;
      }

      const adv = store.state.advanced || {};
      const threshold = typeof adv.finalMinPoints === "number" ? adv.finalMinPoints : 300;

      const totals = store.state.rounds?.totals || { A: 0, B: 0 };
      const hasEnough = (totals.A || 0) >= threshold || (totals.B || 0) >= threshold;

      if (!hasEnough) {
        ui.setMsg("msgFinal", FINAL_MSG.FINAL_NEEDS_POINTS(threshold));
        rt.lockStartBtn = false;
        ui.setEnabled?.("btnFinalStart", true);
        return;
      }

      if (typeof store.setFinalActive === "function") store.setFinalActive(true);
      else store.state.locks.finalActive = true;

      try { await devices.sendBuzzerCmd("OFF"); } catch {}

      await loadFinalPicked();

      await hostCoverRight().catch(() => {});
      await hostClearRight().catch(() => {});

      ui.setMsg("msgFinal", "");
      ui.setMsg("msgFinalP2Start", "");

      ui.setFinalTimerP1(FINAL_MSG.TIMER_PLACEHOLDER);
      ui.setFinalTimerP2(FINAL_MSG.TIMER_PLACEHOLDER);

      let dur = 0;
      try { dur = await getSfxDuration("final_theme"); } catch {}
      const totalMs = typeof dur === "number" && dur > 0 ? dur * 1000 : 4000;
      const transitionAnchorMs = 1000;

      playSfx("final_theme");

      setTimeout(() => {
        (async () => {
          try {
            await display.roundsHideBoard?.();
            await display.finalBoardPlaceholders?.();
          } catch {}
        })();
      }, transitionAnchorMs);

      if (totalMs > 0) await new Promise((resolve) => setTimeout(resolve, totalMs));
      playSfx("bells");

      ui.setMsg("msgFinal", FINAL_MSG.FINAL_STARTED);

      store.state.final.runtime.sum = 0;
      for (const r of store.state.final.runtime.map1) r._addedToSum = false;
      for (const r of store.state.final.runtime.map2) r._addedToSum = false;
      updateSumUI();

      setStep("f_p1_entry");
      renderP1Entry();

      ui.setEnabled("btnFinalToP1MapQ1", false);

      await display.finalSetSideTimer?.(getWinnerTeam(), "15");

      rt.lockStartBtn = true;
      ui.setEnabled?.("btnFinalStart", false);
    } catch (e) {
      console.warn("[final] startFinal error", e);
      rt.lockStartBtn = false;
      ui.setEnabled?.("btnFinalStart", true);
      ui.setMsg("msgFinal", String(e?.message || e || "Błąd startu finału."));
    }
  }

  function backTo(step) {
    setStep(step);

    if (step === "f_p1_entry") {
      ui.setFinalTimerP1(FINAL_MSG.TIMER_PLACEHOLDER);
      renderP1Entry();
    }
    if (step === "f_p2_entry") {
      ui.setFinalTimerP2(FINAL_MSG.TIMER_PLACEHOLDER);
      renderP2Entry();
    }

    if (step.startsWith("f_p1_map_q")) {
      const idx = Number(step.slice(-1)) - 1;
      renderMapOne(1, idx);
    }
    if (step.startsWith("f_p2_map_q")) {
      const idx = Number(step.slice(-1)) - 1;
      renderMapOne(2, idx);
    }

    ensureRuntime();
    if (store.state.final.runtime.lockStartBtn) ui.setEnabled?.("btnFinalStart", false);
  }

  function p1StartTimer() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    if (rt.timer.running && rt.timer.phase === "P1") {
      timerStopEarlyIfAllowed("P1").catch(() => {});
      return;
    }

    if (rt.timer.usedP1) return;
    rt.timer.usedP1 = true;

    setTimerBtnLabel("P1", "stop");
    setTimerBtnEnabled("P1", true);

    ui.setEnabled("btnFinalToP1MapQ1", false);
    timerStart(15, "P1");
  }

  function p2StartTimer() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    if (rt.timer.running && rt.timer.phase === "P2") {
      timerStopEarlyIfAllowed("P2").catch(() => {});
      return;
    }

    if (rt.timer.usedP2) return;
    rt.timer.usedP2 = true;

    (async () => {
      if (rt.halfRevealedP2) return;
      rt.halfRevealedP2 = true;

      try {
        const rows = Array.from({ length: 5 }, (_, i) => {
          const text = resolveShownText(1, i);
          const p1row = getRow(1, i);
          const pts = p1row?.revealedPoints ? String(nInt(p1row.pts, 0)) : "";
          return { text: clip11(text), pts };
        });

        await display.finalHalfFromRows?.(rows, { anim: "matrix down 1000" });
      } catch (e) {
        console.warn("finalHalfFromRows failed", e);
      }
    })();

    setTimerBtnLabel("P2", "stop");
    setTimerBtnEnabled("P2", true);

    ui.setEnabled("btnFinalToP2MapQ1", false);
    timerStart(20, "P2");
  }

  async function toP1MapQ(idx1based) {
    ensureRuntime();
    await timerStopAndReset();

    const idx = idx1based - 1;
    const row = getRow(1, idx);
    if (row) {
      row.revealedAnswer = false;
      row.revealedPoints = false;
    }

    setStep(`f_p1_map_q${idx1based}`);
    renderMapOne(1, idx);
  }

  function nextFromP1Q(idx1based) {
    const n = Number(idx1based) || 1;

    if (n < 5) {
      toP1MapQ(n + 1);
      return;
    }

    const adv = store.state.advanced || {};
    const target = typeof adv.finalTarget === "number" ? adv.finalTarget : 200;
    const sumNow = nInt(store.state.final.runtime?.sum, 0);

    if (sumNow >= target) {
      gotoEnd(true);
      return;
    }

    toP2Start();
  }

  async function toP2Start() {
    await timerStopAndReset();

    (async () => {
      try { await display.finalHalfPlaceholders?.(); } catch (e) {
        console.warn("finalHalfPlaceholders failed", e);
      }
    })();

    setStep("f_p2_start");
  }

  async function startP2Round() {
    ensureRuntime();
    
    display.finalSetSideTimer?.(getWinnerTeam(), "20").catch(() => {});

    setStep("f_p2_entry");
    renderP2Entry();
    ui.setEnabled("btnFinalToP2MapQ1", false);
    ui.setMsg("msgFinalP2Start", FINAL_MSG.R2_STARTED);
  }

  async function toP2MapQ(idx1based) {
    ensureRuntime();
    await timerStopAndReset();

    const idx = idx1based - 1;
    const row = getRow(2, idx);
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
    rtDone.done = true;

    ui.setEnabled?.("btnFinalFinish", false);

    const locks = (store.state.locks = store.state.locks || {});
    if (locks.gameEnded) return;
    locks.gameEnded = true;

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

    const showEndScreen = async () => {
      try { await display.finalHideBoard?.(); } catch {}
      try {
        if (mode === "logo") { await display.showLogo?.(); return; }
        if (mode === "points") { await display.showWin?.(totalPointsAll); return; }
        if (mode === "money") { await display.showWin?.(winAmount); return; }
        await display.showLogo?.();
      } catch {}
    };

    // FIX: kolejność audio/wideo
    let trDur = 0;
    try { trDur = await getSfxDuration("round_transition"); } catch {}
    const trMs = trDur > 0 ? trDur * 1000 : 2000;

    playSfx("round_transition");

    setTimeout(() => {
      showEndScreen().catch(() => {});
    }, 920);

    if (trMs > 0) await new Promise((res) => setTimeout(res, trMs));

    playSfx("show_intro");
    try {
      const dur = await getSfxDuration("show_intro");
      if (dur > 0) await new Promise((res) => setTimeout(res, dur * 1000));
    } catch {}

    store.state.locks.gameEnded = true;
  }

  function bootIfNeeded() {
    ensureRuntime();
    if (!store.state.final.step) store.state.final.step = "f_start";
    ui.showFinalStep(store.state.final.step);

    if (store.state.final.runtime.lockStartBtn) ui.setEnabled?.("btnFinalStart", false);

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
