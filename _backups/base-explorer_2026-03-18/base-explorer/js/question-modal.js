// /base-explorerjs/question-modal.js
// Modal pytania: open() zwraca Promise z wynikiem {ok,...}

import { t } from "../../translation/translation.js";

const $ = (id) => document.getElementById(id);

function show(el, on) {
  if (!el) return;
  el.style.display = on ? "grid" : "none";
}

function setErr(msg) {
  const el = $("qErr");
  if (!el) return;
  if (!msg) {
    el.style.display = "none";
    el.textContent = "";
  } else {
    el.style.display = "block";
    el.textContent = msg;
  }
}

function n(v) {
  if (v === "" || v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export function initQuestionModal({ state } = {}) {
  const overlay = $("questionOverlay");
  if (!overlay) return null;

  const qClose = $("qClose");
  const qSave = $("qSave");
  const qText = $("qText");
  const qAnswers = $("qAnswers");
  const qAdd = $("qAdd");
  const qSumVal = $("qSumVal");
  const qSumPill = $("qSumPill");

  let current = null;      // {id, payload:{text,answers}}
  let resolveClose = null; // fn(result)

  function calcSum() {
    let s = 0;
    for (const a of (current?.payload?.answers || [])) {
      const pts = Number(a.fixed_points);
      if (Number.isFinite(pts)) s += pts;
    }
    return s;
  }

  function updateSumUI() {
    const s = calcSum();
    if (qSumVal) qSumVal.textContent = `${s}/100`;
    if (qSumPill) qSumPill.classList.toggle("over", s > 100);
  }

  function renderAnswers() {
    if (!qAnswers) return;
    qAnswers.innerHTML = "";

    const ans = current?.payload?.answers || [];
    for (let i = 0; i < ans.length; i++) {
      const a = ans[i];

      const row = document.createElement("div");
      row.className = "qRow";
      row.innerHTML = `
        <input class="inp qAnsText" type="text" maxlength="17" autocomplete="off"
          value="${escapeAttr(a.text || "")}" placeholder="${t("baseExplorer.question.answerPlaceholder")}"/>
        <input class="inp qAnsPts" type="number" min="0" max="100" step="1"
          inputmode="numeric" autocomplete="off"
          value="${a.fixed_points ?? ""}" placeholder="${t("baseExplorer.question.pointsPlaceholder")}"/>
        <button class="qDel" type="button" title="${t("baseExplorer.common.delete")}">✕</button>
      `;

      const inpText = row.querySelector(".qAnsText");
      const inpPts = row.querySelector(".qAnsPts");
      const btnDel = row.querySelector(".qDel");

      inpText.addEventListener("input", () => {
        const v = inpText.value.slice(0, 17);
        if (inpText.value !== v) inpText.value = v;
        a.text = v;
      });
      
      // twardy limit: 0–100 (również przy wklejaniu)
      inpPts.addEventListener("input", () => {
        const raw = String(inpPts.value ?? "").trim();
      
        // puste = brak punktów
        if (raw === "") {
          delete a.fixed_points;
          updateSumUI();
          return;
        }
      
        // usuń wszystko poza cyframi i minusem (na wszelki wypadek)
        // (type=number i tak filtruje, ale różne przeglądarki różnie przy wklejaniu)
        let cleaned = raw.replace(/[^\d-]/g, "");
      
        // ogranicz długość wpisu (np. max 3 znaki: 100)
        if (cleaned.length > 3) cleaned = cleaned.slice(0, 3);
      
        // parsowanie
        let pts = Number(cleaned);
      
        // jeśli nadal nie liczba → ustaw 0
        if (!Number.isFinite(pts)) pts = 0;
      
        // clamp 0–100
        if (pts < 0) pts = 0;
        if (pts > 100) pts = 100;
      
        // zsynchronizuj input (ważne: pokazuje użytkownikowi poprawioną wartość)
        inpPts.value = String(pts);
      
        a.fixed_points = pts;
        updateSumUI();
      });

      btnDel.addEventListener("click", () => {
        ans.splice(i, 1);
        renderAnswers();
        updateSumUI();
      });

      qAnswers.appendChild(row);
    }
  }

  function open(questionRowOrInput) {
    setErr("");

    // bridge przekaże: { id, payload:{text,answers} }
    // ale wspieramy też: { id, text, answers }
    const id = questionRowOrInput?.id ?? null;
    const payload = (questionRowOrInput?.payload && typeof questionRowOrInput.payload === "object")
      ? questionRowOrInput.payload
      : {
          text: String(questionRowOrInput?.text || ""),
          answers: Array.isArray(questionRowOrInput?.answers) ? questionRowOrInput.answers : [],
        };

    current = {
      id,
      payload: {
        text: String(payload?.text || ""),
        answers: Array.isArray(payload?.answers)
          ? payload.answers.map((a, idx) => ({
              ord: a.ord ?? (idx + 1),
              text: String(a.text || ""),
              ...(a.fixed_points === undefined ? {} : { fixed_points: Number(a.fixed_points) }),
            }))
          : [],
      },
    };

    if (qText) qText.value = current.payload.text;

    renderAnswers();
    updateSumUI();
    show(overlay, true);
    setTimeout(() => qText?.focus(), 0);

    return new Promise((resolve) => {
      resolveClose = resolve;
    });
  }

  function close(result = { ok: false }) {
    show(overlay, false);
    setErr("");

    const r = resolveClose;
    resolveClose = null;
    current = null;

    if (typeof r === "function") r(result);
  }

  qClose?.addEventListener("click", () => close({ ok: false }));
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close({ ok: false });
  });

  qAdd?.addEventListener("click", () => {
    if (!current) return;
    const ans = current.payload.answers || [];
    if (ans.length >= 6) return setErr(t("baseExplorer.question.errors.maxAnswers"));
    ans.push({ ord: (ans.length + 1), text: "" });
    renderAnswers();
    updateSumUI();
  });

  qText?.addEventListener("input", () => {
    if (!current) return;
    current.payload.text = qText.value;
  });

  qSave?.addEventListener("click", () => {
    setErr("");
    if (!current) return;

    const sum = calcSum();

    for (const a of (current.payload.answers || [])) {
      if (a.fixed_points !== undefined) {
        const pts = Number(a.fixed_points);
        if (!Number.isFinite(pts) || pts < 0 || pts > 100) {
          return setErr(t("baseExplorer.question.errors.pointsRange"));
        }
      }
    }
    if (sum > 100) return setErr(t("baseExplorer.question.errors.sumExceeded"));

    close({
      ok: true,
      id: current.id,
      payload: {
        text: String(current.payload.text || ""),
        answers: (current.payload.answers || []).map((a, idx) => ({
          ord: a.ord ?? (idx + 1),
          text: String(a.text || ""),
          ...(a.fixed_points === undefined ? {} : { fixed_points: Number(a.fixed_points) }),
        })),
      },
    });
  });

  return { open, close };
}

function escapeAttr(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
