// /base-explorer/js/export-modal.js
// Minimalny “silnik” modala eksportu: otwiera, listuje pytania, buduje JSON i zwraca wynik.

const RULES = { QN_MIN: 10, AN_MIN: 3, AN_MAX: 6, SUM_PREPARED: 100 };
const TYPES = ["poll_text", "poll_points", "prepared"]; // 0..2 slider

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

function validateForType(q, type) {
  // UWAGA: zgodnie z Twoją zasadą: “nie sprawdzamy inputu na poprawność, liczymy w środku”.
  // Tu tylko klasyfikujemy “czy pytanie przechodzi warunki typu”, żeby je podświetlić.
  if (type === "poll_text") return true; // tylko min 10 pytań globalnie
  if (type === "poll_points") {
    const an = (q.answers || []).length;
    return an >= RULES.AN_MIN && an <= RULES.AN_MAX;
  }
  if (type === "prepared") {
    const an = (q.answers || []).length;
    if (!(an >= RULES.AN_MIN && an <= RULES.AN_MAX)) return false;
    // w prepared sens ma punktacja (nie musi być “pełna”, ale liczymy)
    const s = sumPoints(q.answers || []);
    return s <= RULES.SUM_PREPARED;
  }
  return true;
}

function buildExportPayload({ name, type, questions }) {
  return {
    game: { name: name || "gra", type },
    questions: questions.map((q) => ({
      text: String(q.text || ""),
      answers: Array.isArray(q.answers)
        ? q.answers.map((a, i) => ({
            ord: n(a.ord) || (i + 1),
            text: String(a.text || ""),
            // fixed_points opcjonalne; jeśli brak → nie dodajemy
            ...(a.fixed_points === undefined ? {} : { fixed_points: n(a.fixed_points) }),
          }))
        : [],
    })),
  };
}

export function initExportModal(state, { onCreated } = {}) {
  const overlay = $("exportOverlay");
  if (!overlay) return;

  const xClose = $("xClose");
  const xCreate = $("xCreate");
  const xName = $("xName");
  const xList = $("xList");
  const xTypeRange = $("xTypeRange");
  const xTypeHint = $("xTypeHint");
  const xCountPill = $("xCountPill");
  const xCountVal = $("xCountVal");

  const lbl0 = $("lbl0");
  const lbl1 = $("lbl1");
  const lbl2 = $("lbl2");

  let selectedIds = new Set();
  let typeIndex = 2; // default prepared (jak u Ciebie w HTML)
  let allQuestions = [];

  function updateTypeUI() {
    const type = TYPES[typeIndex] || "prepared";
    if (xTypeHint) {
      if (type === "poll_text") xTypeHint.textContent = "10+ pytań, bez wymagań odpowiedzi.";
      if (type === "poll_points") xTypeHint.textContent = "10+ pytań, każde 3–6 odpowiedzi.";
      if (type === "prepared") xTypeHint.textContent = "10+ pytań, 3–6 odpowiedzi, suma punktów ≤ 100.";
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

  function renderList() {
    if (!xList) return;
    xList.innerHTML = "";

    const type = TYPES[typeIndex] || "prepared";

    for (const q of allQuestions) {
      const ok = validateForType(q, type);
      const checked = selectedIds.has(q.id);

      const row = document.createElement("label");
      row.className = "xPickItem " + (ok ? "ok" : "bad");
      row.dataset.qid = q.id;

      row.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""}/>
        <div class="xNm">${escapeHtml(q.text || "—")}</div>
        <div class="xMeta">${metaText(q, type)}</div>
      `;

      row.addEventListener("click", (e) => {
        // klik w label przełącza checkbox; kontrolujemy Set
        const cb = row.querySelector("input");
        const will = !(cb?.checked);
        // (bo click event leci przed zmianą? w label bywa różnie)
        // wymuszamy stan:
        if (cb) cb.checked = will;
        if (will) selectedIds.add(q.id);
        else selectedIds.delete(q.id);

        updateCountUI();
      });

      xList.appendChild(row);
    }

    updateCountUI();
  }

  function metaText(q, type) {
    const an = (q.answers || []).length;
    if (type === "poll_text") return an ? `${an} odp.` : "bez odp.";
    if (type === "poll_points") return `${an} odp.`;
    const s = sumPoints(q.answers || []);
    return `${an} odp. • suma ${s}`;
  }

  function open(opts = {}) {
    setErr("");
    // Oczekuję, że masz state.questions jako tablicę pytań z {id,text,answers}
    allQuestions = Array.isArray(state.questions) ? state.questions.slice() : [];
    if (allQuestions.length < RULES.QN_MIN) {
      setErr(`Potrzebujesz co najmniej ${RULES.QN_MIN} pytań w bazie, żeby zrobić eksport.`);
      return;
    }
  
    const pre = Array.isArray(opts.preselectIds) ? opts.preselectIds.filter(Boolean) : [];
    if (pre.length) {
      selectedIds = new Set(pre);
      // jeśli preselect < 10, dociągnij pierwszymi z listy
      for (const q of allQuestions) {
        if (selectedIds.size >= RULES.QN_MIN) break;
        selectedIds.add(q.id);
      }
    } else {
      // start: pierwsze 10 zaznaczone
      selectedIds = new Set(allQuestions.slice(0, RULES.QN_MIN).map((q) => q.id));
    }
  
    typeIndex = Number(xTypeRange?.value ?? 2) || 2;
  
    renderList();
    updateTypeUI();
    show(overlay, true);
    setTimeout(() => xName?.focus(), 0);
  }

  function close() {
    show(overlay, false);
    setErr("");
  }

  xClose?.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => {
    // klik w tło overlay zamyka
    if (e.target === overlay) close();
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
      setErr(`Zaznacz co najmniej ${RULES.QN_MIN} pytań.`);
      return;
    }
  
    const payload = buildExportPayload({
      name: String(xName?.value || "gra"),
      type: TYPES[typeIndex] || "prepared",
      questions: picked,
    });
  
    try {
      xCreate.disabled = true;
      await onCreated?.(payload);
      close();
    } catch (e) {
      console.error(e);
      setErr(String(e?.message || e || "Nie udało się utworzyć gry."));
    } finally {
      updateCountUI(); // przywróci disabled/enabled wg zaznaczenia
    }
  });

  // Upubliczniamy funkcję otwarcia w state._api (ustawimy to w actions.js)
  return { open, close };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
