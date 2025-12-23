import { loadQuestions, loadAnswers } from "../../js/core/game-validate.js";

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createQuestionsController({ game }) {
  const qPick = $("qPick");
  const btnQReload = $("btnQReload");

  let questions = [];
  const answersByQ = new Map();
  let activeQid = null;

  function setActive(id) {
    activeQid = id || null;
    if (qPick && activeQid) qPick.value = activeQid;
  }

  function getActiveQuestion() {
    return questions.find((q) => q.id === activeQid) || null;
  }

  async function getActiveAnswers() {
    if (!activeQid) return [];
    if (answersByQ.has(activeQid)) return answersByQ.get(activeQid) || [];
    const a = await loadAnswers(activeQid);
    answersByQ.set(activeQid, a || []);
    return a || [];
  }

  function renderPick() {
    if (!qPick) return;
    qPick.innerHTML = questions
      .map((q) => `<option value="${q.id}">#${q.ord} — ${escapeHtml(q.text || "")}</option>`)
      .join("");
    if (!activeQid && questions[0]?.id) activeQid = questions[0].id;
    if (activeQid) qPick.value = activeQid;
  }

  async function reloadAll() {
    questions = await loadQuestions(game.id);
    answersByQ.clear();
    if (!activeQid && questions[0]?.id) activeQid = questions[0].id;
    renderPick();
  }

  function hookUI() {
    btnQReload?.addEventListener("click", () => reloadAll().catch(console.error));
    qPick?.addEventListener("change", () => setActive(qPick.value || null));
  }

  async function start() {
    hookUI();
    await reloadAll().catch(() => {});
  }

  return {
    start,
    reloadAll,

    get questions() { return questions; },
    get activeQid() { return activeQid; },

    setActive,
    getActiveQuestion,
    getActiveAnswers,
  };
}
