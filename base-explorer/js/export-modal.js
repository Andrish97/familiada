// /base-explorer/js/export-modal.js
// Modal eksportu: open() zwraca Promise z wynikiem {ok, payload}

import { t } from "../../translation/translation.js";

const RULES = { QN_MIN: 10, AN_MIN: 3, AN_MAX: 6, SUM_PREPARED: 100 };
const TYPES = ["poll_text", "poll_points", "prepared"];

const $ = (id) => document.getElementById(id);

function show(el, on) {
  if (!el) return;
  el.style.display = on ? "grid" : "none";
}

function setErr(msg) {
  const xErr = $("xErr");
  if (!xErr) return;
  if (!msg) {
    xErr.style.display = "none";
    xErr.textContent = "";
  } else {
    xErr.style.display = "block";
    xErr.textContent = msg;
  }
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function sumPoints(answers) {
  let s = 0;
  for (const a of answers || []) s += n(a.fixed_points);
  return s;
}

function qText(q) {
  return String(q?.text ?? q?.payload?.text ?? "").trim();
}

function qAnswers(q) {
  const a = (q && typeof q === "object") ? (q.answers ?? q.payload?.answers) : null;
  return Array.isArray(a) ? a : [];
}

function validateForType(q, type) {
  const answers = qAnswers(q);

  if (type === "poll_text") return true;

  if (type === "poll_points") {
    const an = answers.length;
    return an >= RULES.AN_MIN && an <= RULES.AN_MAX;
  }

  if (type === "prepared") {
    const an = answers.length;
    if (!(an >= RULES.AN_MIN && an <= RULES.AN_MAX)) return false;
    const s = sumPoints(answers);
    return s <= RULES.SUM_PREPARED;
  }

  return true;
}

function buildExportPayload({ name, type, questions }) {
  const normQText = (q) => String(q?.text ?? q?.payload?.text ?? "").trim();
  const normAns = (q) => {
    const a = q?.answers ?? q?.payload?.answers;
    return Array.isArray(a) ? a : [];
  };

  return {
    game: { name: name || t("baseExplorer.export.defaultGameName"), type },
    questions: (questions || []).map((q) => {
      const text = normQText(q);

      // 1) poll_text: obcinamy do gołych pytań
      if (type === "poll_text") {
        return { text, answers: [] };
      }

      // 2) poll_points: zostawiamy odpowiedzi, ale punkty zawsze 0
      if (type === "poll_points") {
        const answers = normAns(q).map((a) => ({
          text: String(a?.text ?? "").trim(),
          fixed_points: 0,
        }));
        return { text, answers };
      }

      // 3) prepared: zostawiamy wszystko (tekst + punkty)
      //    (z zachowaniem Twojego formatu: text + answers[])
      const answers = normAns(q).map((a) => {
        const out = { text: String(a?.text ?? "").trim() };
        if (a && Object.prototype.hasOwnProperty.call(a, "fixed_points")) {
          // zachowujemy wartości z bazy (mogą być liczbą lub 0)
          out.fixed_points = n(a.fixed_points);
        }
        return out;
      });

      return { text, answers };
    }),
  };
}

export function initExportModal({ state } = {}) {
  const overlay = $("exportOverlay");
  if (!overlay) return null;

  const xClose = $("xClose");
  const xCreate = $("xCreate");
  const xName = $("xName");
  const xList = $("xList");
  const xTypeRange = $("xTypeRange");
  const xTypeHint = $("xTypeHint");
  const xCountPill = $("xCountPill");
  const xCountVal = $("xCountVal");

  const xProg = $("xProg");
  const xProgStep = $("xProgStep");
  const xProgCount = $("xProgCount");
  const xProgBarFill = $("xProgBarFill");
  const xProgMsg = $("xProgMsg");

  let running = false;
  let lastOpts = null; // zapamiętujemy opts z open()

  const lbl0 = $("lbl0");
  const lbl1 = $("lbl1");
  const lbl2 = $("lbl2");

  let selectedIds = new Set();
  let typeIndex = 2;
  let allQuestions = [];

  let resolveClose = null;

  function updateTypeUI() {
    const type = TYPES[typeIndex] || "prepared";
    if (xTypeHint) {
      if (type === "poll_text") xTypeHint.textContent = t("baseExplorer.export.typeHintPollText");
      if (type === "poll_points") xTypeHint.textContent = t("baseExplorer.export.typeHintPollPoints");
      if (type === "prepared") xTypeHint.textContent = t("baseExplorer.export.typeHintPrepared");
    }
    for (const el of [lbl0, lbl1, lbl2]) el?.classList.remove("active");
    (typeIndex === 0 ? lbl0 : typeIndex === 1 ? lbl1 : lbl2)?.classList.add("active");
    renderList();
  }

  function updateCountUI() {
    const c = selectedIds.size;
    if (xCountVal) xCountVal.textContent = String(c);
    const ok = c >= RULES.QN_MIN;
    if (xCountPill) xCountPill.classList.toggle("bad", !ok);
    if (xCreate) xCreate.disabled = !ok;
  }

  function metaText(q, type) {
    const answers = qAnswers(q);
    const an = answers.length;
  
    if (type === "poll_text") {
      return an
        ? t("baseExplorer.export.answersCount", { count: an })
        : t("baseExplorer.export.noAnswers");
    }
    if (type === "poll_points") return t("baseExplorer.export.answersCount", { count: an });
  
    const s = sumPoints(answers);
    return t("baseExplorer.export.preparedSummary", { count: an, sum: s });
  }

  function renderList() {
    if (!xList) return;
    xList.innerHTML = "";

    const type = TYPES[typeIndex] || "prepared";

    for (const q of allQuestions) {
      
      const ok = validateForType(q, type);
      const label = qText(q) || t("baseExplorer.common.dash");
      const checked = selectedIds.has(q.id);

      const row = document.createElement("label");
      row.className = "xPickItem " + (ok ? "ok" : "bad");
      row.dataset.qid = q.id;

      row.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""}/>
        <div class="xNm">${escapeHtml(label)}</div>
        <div class="xMeta">${metaText(q, type)}</div>
      `;

      row.addEventListener("click", () => {
        const cb = row.querySelector("input");
        const will = !(cb?.checked);
        if (cb) cb.checked = will;
        if (will) selectedIds.add(q.id);
        else selectedIds.delete(q.id);
        updateCountUI();
      });

      xList.appendChild(row);
    }

    updateCountUI();
  }

  function showProgress(on) {
    if (xProg) xProg.style.display = on ? "" : "none";
  }

  function setProgress({ step, i, n, msg, isError } = {}) {
    if (xProgStep && step != null) xProgStep.textContent = String(step);
    if (xProgCount) xProgCount.textContent = `${Number(i || 0)}/${Number(n || 0)}`;

    const nn = Number(n || 0);
    const ii = Number(i || 0);
    const pct = nn > 0 ? Math.max(0, Math.min(100, Math.round((ii / nn) * 100))) : 0;
    if (xProgBarFill) xProgBarFill.style.width = `${pct}%`;

    if (xProgMsg) {
      xProgMsg.textContent = msg || "";
      xProgMsg.style.opacity = isError ? "1" : ".85";
    }
  }

  function lockUi(on) {
    running = !!on;
    overlay?.querySelector?.(".export-modal")?.classList.toggle("is-running", running);

    if (xClose) xClose.disabled = running;
    if (xCreate) xCreate.disabled = running || (selectedIds.size < RULES.QN_MIN);
  }

  function close(result = { ok: false }) {
    show(overlay, false);
    setErr("");

    const r = resolveClose;
    resolveClose = null;

    if (typeof r === "function") r(result);
  }

  function open(opts = {}) {
    console.log("[EXPORT] openExportModal args:", arguments);
    
    setErr("");

    lastOpts = opts || null;

    showProgress(false);
    setProgress({ step: t("baseExplorer.common.dash"), i: 0, n: 0, msg: "" });
    lockUi(false);

    // Źródło danych:
    // 1) opts.questions (jeśli podane) ma pierwszeństwo
    // 2) fallback: state.questions
    const src = Array.isArray(opts.questions) ? opts.questions
              : Array.isArray(state?.questions) ? state.questions
              : [];

    allQuestions = src.slice();

    if (allQuestions.length < RULES.QN_MIN) {
      setErr(t("baseExplorer.export.errors.minQuestions", { count: RULES.QN_MIN }));
      // nadal otwieramy, ale przycisk będzie zablokowany
    }

    const pre = Array.isArray(opts.preselectIds) ? opts.preselectIds.filter(Boolean) : [];
    if (pre.length) {
      selectedIds = new Set(pre);
      for (const q of allQuestions) {
        if (selectedIds.size >= RULES.QN_MIN) break;
        selectedIds.add(q.id);
      }
    } else {
      selectedIds = new Set(allQuestions.slice(0, RULES.QN_MIN).map((q) => q.id));
    }

    // typ startowy z UI (range), ale możesz nadpisać przez opts.type
    typeIndex = Number(xTypeRange?.value ?? 2) || 2;
    if (opts.type) {
      const idx = TYPES.indexOf(opts.type);
      if (idx >= 0) {
        typeIndex = idx;
        if (xTypeRange) xTypeRange.value = String(idx);
      }
    }

    renderList();
    updateTypeUI();

    show(overlay, true);
    setTimeout(() => xName?.focus(), 0);

    return new Promise((resolve) => {
      resolveClose = resolve;
    });
  }

  xClose?.addEventListener("click", () => {
    if (running) return;
    close({ ok: false });
  });

  overlay.addEventListener("mousedown", (e) => {
    if (running) return;
    if (e.target === overlay) close({ ok: false });
  });

  xTypeRange?.addEventListener("input", () => {
    typeIndex = Number(xTypeRange.value) || 0;
    updateTypeUI();
  });

  lbl0?.addEventListener("click", () => { typeIndex = 0; if (xTypeRange) xTypeRange.value = "0"; updateTypeUI(); });
  lbl1?.addEventListener("click", () => { typeIndex = 1; if (xTypeRange) xTypeRange.value = "1"; updateTypeUI(); });
  lbl2?.addEventListener("click", () => { typeIndex = 2; if (xTypeRange) xTypeRange.value = "2"; updateTypeUI(); });

  xCreate?.addEventListener("click", async () => {
    setErr("");

    const picked = allQuestions.filter((q) => selectedIds.has(q.id));
    if (picked.length < RULES.QN_MIN) {
      setErr(t("baseExplorer.export.errors.pickMin", { count: RULES.QN_MIN }));
      return;
    }

    const payload = buildExportPayload({
      name: String(xName?.value || t("baseExplorer.export.defaultGameName")),
      type: TYPES[typeIndex] || "prepared",
      questions: picked,
    });

    // Tryb B: jeśli caller dał runnera, robimy progres w tym samym modalu
    const run = lastOpts?.run;
    if (typeof run === "function") {
      try {
        lockUi(true);
        showProgress(true);

        // “sensowne liczenie”: w eksportowaniu zwykle liczymy pytania
        const n = payload?.questions?.length || 0;
        setProgress({ step: t("baseExplorer.export.progress.exporting"), i: 0, n: n || 1, msg: "" });

        const res = await run(payload, (p) => setProgress(p));

        setProgress({
          step: t("baseExplorer.export.progress.done"),
          i: n || 1,
          n: n || 1,
          msg: t("baseExplorer.export.progress.created"),
        });

        // zamykamy modal dopiero na końcu
        close({ ok: true, payload, result: res });
      } catch (e) {
        console.error(e);
        setProgress({
          step: t("baseExplorer.export.progress.error"),
          i: 0,
          n: payload?.questions?.length || 1,
          msg: t("baseExplorer.export.progress.errorDetail", { error: e?.message || String(e) }),
          isError: true,
        });
        setErr(t("baseExplorer.export.errors.createFailed"));
        lockUi(false); // zostaw modal otwarty
      }
      return;
    }

    // fallback (stare zachowanie): zamknij i zwróć payload
    close({ ok: true, payload });
  });

  return { open, close };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
