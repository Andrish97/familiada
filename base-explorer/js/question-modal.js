// base-explorer/js/question-modal.js
import { sb } from "../../js/core/supabase.js";

/**
 * Otwiera modal edycji pytania i zapisuje do qb_questions.payload.
 * Wymaga, żeby HTML modala był już w DOM (Twoje modals.html wklejone do strony).
 */
export async function openQuestionModal({ state, questionId }) {
  const overlay = document.getElementById("questionOverlay");
  if (!overlay) {
    alert("Brak #questionOverlay w DOM (wklej modals.html).");
    return;
  }

  const els = {
    title: overlay.querySelector("[data-qm-title]") || overlay.querySelector(".modalTitle"),
    qText: overlay.querySelector("#qmQuestionText"),
    answersWrap: overlay.querySelector("#qmAnswers"),
    btnCancel: overlay.querySelector("[data-qm-cancel]") || overlay.querySelector("#qmCancelBtn"),
    btnSave: overlay.querySelector("[data-qm-save]") || overlay.querySelector("#qmSaveBtn"),
    btnAdd: overlay.querySelector("[data-qm-add]") || overlay.querySelector("#qmAddAnswerBtn"),
  };

  if (!els.qText || !els.answersWrap || !els.btnCancel || !els.btnSave) {
    alert("Modal pytania: brakuje wymaganych elementów (sprawdź ID/data-* w modals.html).");
    return;
  }

  // --- load payload ---
  const { data, error } = await sb()
    .from("qb_questions")
    .select("id,payload")
    .eq("id", questionId)
    .single();

  if (error || !data) {
    console.error(error);
    alert("Nie udało się wczytać pytania.");
    return;
  }

  const payload = normalizeQuestionPayload(data.payload);

  // --- render ---
  if (els.title) els.title.textContent = "Edytuj pytanie";
  els.qText.value = payload.text || "";
  renderAnswers(els.answersWrap, payload.answers);

  // --- open ---
  showOverlay(overlay);

  // UX: focus
  setTimeout(() => els.qText.focus(), 0);

  // --- handlers (bind once per open, via AbortController) ---
  const ac = new AbortController();
  const { signal } = ac;

  function close() {
    ac.abort();
    hideOverlay(overlay);
  }

  overlay.addEventListener(
    "click",
    (e) => {
      if (e.target === overlay) close(); // klik w tło
    },
    { signal }
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") close();
    },
    { signal }
  );

  els.btnCancel.addEventListener("click", close, { signal });

  els.btnAdd?.addEventListener(
    "click",
    () => {
      const nextOrd = (readAnswersFromDOM(els.answersWrap).reduce((m, a) => Math.max(m, a.ord || 0), 0) || 0) + 1;
      addAnswerRow(els.answersWrap, { ord: nextOrd, text: "", fixed_points: 0 });
      const last = els.answersWrap.querySelector(".qmAnswerRow:last-child input[type='text']");
      last?.focus?.();
    },
    { signal }
  );

  els.btnSave.addEventListener(
    "click",
    async () => {
      const out = {
        text: String(els.qText.value || "").trim(),
        answers: readAnswersFromDOM(els.answersWrap),
      };

      // prosta normalizacja (bez “walidacji gry” – to robisz później)
      out.answers = out.answers
        .filter((a) => String(a.text || "").trim().length > 0)
        .map((a, i) => ({
          ord: Number.isFinite(a.ord) ? a.ord : i + 1,
          text: String(a.text || "").trim(),
          fixed_points: Number.isFinite(a.fixed_points) ? a.fixed_points : 0,
        }));

      try {
        const { error: updErr } = await sb()
          .from("qb_questions")
          .update({ payload: out })
          .eq("id", questionId);

        if (updErr) throw updErr;

        close();
        await state?._api?.refreshList?.();
      } catch (e) {
        console.error(e);
        alert("Nie udało się zapisać pytania.");
      }
    },
    { signal }
  );
}

/* ========================= helpers ========================= */

function normalizeQuestionPayload(p) {
  const text = String(p?.text || "");
  const answers = Array.isArray(p?.answers) ? p.answers : [];
  return {
    text,
    answers: answers.map((a, i) => ({
      ord: Number(a?.ord ?? i + 1),
      text: String(a?.text || ""),
      fixed_points: Number(a?.fixed_points ?? 0),
    })),
  };
}

function showOverlay(overlay) {
  overlay.hidden = false;
  overlay.classList.add("is-open");
  document.documentElement.classList.add("modal-open");
}

function hideOverlay(overlay) {
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  document.documentElement.classList.remove("modal-open");
}

function renderAnswers(wrap, answers) {
  wrap.innerHTML = "";
  const list = Array.isArray(answers) ? answers : [];
  for (const a of list) addAnswerRow(wrap, a);
  if (!list.length) addAnswerRow(wrap, { ord: 1, text: "", fixed_points: 0 });
}

function addAnswerRow(wrap, a) {
  const row = document.createElement("div");
  row.className = "qmAnswerRow";

  // ord
  const ord = document.createElement("input");
  ord.type = "number";
  ord.min = "1";
  ord.step = "1";
  ord.value = String(Number(a?.ord || 1));
  ord.className = "qmOrd";

  // text
  const txt = document.createElement("input");
  txt.type = "text";
  txt.value = String(a?.text || "");
  txt.className = "qmText";

  // points (opcjonalne)
  const pts = document.createElement("input");
  pts.type = "number";
  pts.min = "0";
  pts.step = "1";
  pts.value = String(Number(a?.fixed_points || 0));
  pts.className = "qmPts";

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn danger qmDel";
  del.textContent = "Usuń";
  del.addEventListener("click", () => row.remove());

  row.appendChild(ord);
  row.appendChild(txt);
  row.appendChild(pts);
  row.appendChild(del);

  wrap.appendChild(row);
}

function readAnswersFromDOM(wrap) {
  const rows = Array.from(wrap.querySelectorAll(".qmAnswerRow"));
  return rows.map((r, idx) => {
    const ord = Number(r.querySelector(".qmOrd")?.value || idx + 1);
    const text = String(r.querySelector(".qmText")?.value || "");
    const fixed_points = Number(r.querySelector(".qmPts")?.value || 0);
    return { ord, text, fixed_points };
  });
}
