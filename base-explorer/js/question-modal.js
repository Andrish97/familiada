// /base-explorer/js/question-modal.js
// Minimalny “silnik” modala pytania: otwiera, edytuje w pamięci i zwraca wynik.

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

export function initQuestionModal(state, { onSaved } = {}) {
  const overlay = $("questionOverlay");
  if (!overlay) return;

  const qClose = $("qClose");
  const qSave = $("qSave");
  const qText = $("qText");
  const qAnswers = $("qAnswers");
  const qAdd = $("qAdd");
  const qSumVal = $("qSumVal");
  const qSumPill = $("qSumPill");

  let current = null; // {id,text,answers[]}

  function calcSum() {
    let s = 0;
    for (const a of (current?.answers || [])) {
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

    const ans = current?.answers || [];
    for (let i = 0; i < ans.length; i++) {
      const a = ans[i];

      const row = document.createElement("div");
      row.className = "qRow";
      row.innerHTML = `
        <input class="inp qAnsText" type="text" maxlength="80" autocomplete="off" value="${escapeAttr(a.text || "")}" placeholder="Odpowiedź…"/>
        <input class="inp qAnsPts" type="text" inputmode="numeric" autocomplete="off" value="${a.fixed_points ?? ""}" placeholder="(opcjonalnie)"/>
        <button class="qDel" type="button" title="Usuń">✕</button>
      `;

      const inpText = row.querySelector(".qAnsText");
      const inpPts = row.querySelector(".qAnsPts");
      const btnDel = row.querySelector(".qDel");

      inpText.addEventListener("input", () => {
        a.text = inpText.value;
      });

      inpPts.addEventListener("input", () => {
        const v = inpPts.value.trim();
        if (v === "") {
          delete a.fixed_points;
        } else {
          const pts = n(v);
          a.fixed_points = pts === null ? 0 : pts;
        }
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

  function open(question) {
    setErr("");
    current = {
      id: question?.id ?? null,
      text: String(question?.text || ""),
      answers: Array.isArray(question?.answers) ? question.answers.map((a, idx) => ({
        ord: a.ord ?? (idx + 1),
        text: String(a.text || ""),
        ...(a.fixed_points === undefined ? {} : { fixed_points: Number(a.fixed_points) }),
      })) : [],
    };

    if (qText) qText.value = current.text;

    renderAnswers();
    updateSumUI();
    show(overlay, true);
    setTimeout(() => qText?.focus(), 0);
  }

  function close() {
    show(overlay, false);
    setErr("");
    current = null;
  }

  qClose?.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });

  qAdd?.addEventListener("click", () => {
    if (!current) return;
    if ((current.answers || []).length >= 6) return setErr("Max 6 odpowiedzi.");
    current.answers.push({ ord: (current.answers.length + 1), text: "" });
    renderAnswers();
    updateSumUI();
  });

  qText?.addEventListener("input", () => {
    if (!current) return;
    current.text = qText.value;
  });

  qSave?.addEventListener("click", () => {
    setErr("");
    if (!current) return;

    const sum = calcSum();
    // walidacja lokalna: <=100 i żadna odp > 100
    for (const a of (current.answers || [])) {
      if (a.fixed_points !== undefined) {
        const pts = Number(a.fixed_points);
        if (!Number.isFinite(pts) || pts < 0 || pts > 100) {
          return setErr("Punkty muszą być w zakresie 0–100 (jeśli wpisane).");
        }
      }
    }
    if (sum > 100) return setErr("Suma punktów nie może przekroczyć 100.");

    onSaved?.(structuredClone(current));
    close();
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
