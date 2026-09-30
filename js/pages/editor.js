// js/pages/editor.js
// Edytor gry: lista pytań po lewej, pytanie z odpowiedziami po prawej.
// Każde pole zapisuje się samo (tekst: po pauzie w pisaniu i przy wyjściu z
// pola, punkty: przy wyjściu z pola). Limity i obsługa pól są wspólne z
// modalem pytania w bazie pytań (js/core/question-form.js).
import { sb } from "../core/supabase.js?v=v2026-09-30T19170";
import { requireAuth } from "../core/auth.js?v=v2026-09-30T19170";
import { alertModal, confirmModal } from "../core/modal.js?v=v2026-09-30T19170";
import { parseQaText } from "../core/text-import.js?v=v2026-09-30T19170";
import { validateGame, gameRuleErrorMessage, RULES as GV_RULES, TYPES } from "../core/game-validate.js?v=v2026-09-30T19170";
import {
  LIMITS, normQuestionText, normAnswerText, parsePoints,
  wireTextLimit, wirePointsInput, sumPoints, renderSumPill, questionProblems,
  buildAnswerRow, buildAddAnswerTile,
} from "../core/question-form.js?v=v2026-09-30T19170";
import { guardResourceLock, showBlockingOverlay } from "../core/resource-lock.js?v=v2026-09-30T19170";
import { updateChecked, ROW_GONE } from "../core/db-guard.js?v=v2026-09-30T19170";
import { initI18n, t, withLangParam } from "../../translation/translation.js?v=v2026-09-30T19170";
import { initTopbarAccountDropdown } from "../core/topbar-controller.js?v=v2026-09-30T19170";
import "../core/contact-modal.js?v=v2026-09-30T19170";
import { icon, iconText } from "../core/icons.js?v=v2026-09-30T19170";
// initI18n + remove('page-loading') są w boot() — przed requireAuth, żeby body pojawiło się przed auth/danymi

const MSG = {
  defaultGameName: () => t("editor.defaultGameName"),
  questionDefault: (ord) => t("editor.defaults.question", { ord }),
  answerDefault: (ord) => t("editor.defaults.answer", { ord }),
  cannotEdit: () => t("editor.alert.cannotEdit"),
  gameNotFound: () => t("editor.alert.gameNotFound"),
  resetFailed: () => t("editor.alert.resetFailed"),
  resetPollConfirm: () => t("editor.confirm.resetPoll"),
  typePollText: () => t("editor.type.pollText"),
  typePollPoints: () => t("editor.type.pollPoints"),
  typePrepared: () => t("editor.type.prepared"),
  nameSaved: () => t("editor.status.nameSaved"),
  nameSaveError: () => t("editor.status.nameSaveError"),
  addQuestionError: () => t("editor.status.addQuestionError"),
  deleteQuestionConfirm: () => t("editor.confirm.deleteQuestion"),
  deleteQuestionDone: () => t("editor.status.questionDeleted"),
  deleteQuestionError: () => t("editor.status.questionDeleteError"),
  deleteAnswerConfirm: () => t("editor.confirm.deleteAnswer"),
  addedAnswer: () => t("editor.status.answerAdded"),
  removedAnswer: () => t("editor.status.answerRemoved"),
  addAnswerError: () => t("editor.status.answerAddError"),
  deleteAnswerError: () => t("editor.status.answerDeleteError"),
  saveError: () => t("editor.status.saveError"),
  pointsSaveError: () => t("editor.status.pointsSaveError"),
  loadError: () => t("editor.status.loadError"),
  saved: () => t("editor.status.saved"),
  rowGone: () => t("editor.status.rowGone"),
  typing: () => t("editor.status.typing"),
  deleteLabel: () => t("editor.actions.delete"),
  questionAdded: () => t("editor.status.questionAdded"),
  addQuestionLabel: () => t("editor.actions.addQuestion"),
  questionLabel: (ord) => t("editor.labels.questionNumber", { ord }),
  questionsOnly: () => t("editor.labels.questionsOnly"),
  answersSum: (count, max, sum, sumMax) =>
    t("editor.labels.answersSum", { count, max, sum, sumMax }),
  answersCount: (count, max) => t("editor.labels.answersCount", { count, max }),
  answerLimitReached: () => t("editor.status.answerLimitReached"),
  importFileFailed: () => t("editor.import.fileFailed"),
  importChooseFile: () => t("editor.import.chooseFile"),
  importPastePrompt: () => t("editor.import.pastePrompt"),
  importParseError: (code, params) => t(`editor.import.errors.${code}`, params || {}),
  importConfirm: () => t("editor.import.confirm"),
  importCancelled: () => t("editor.import.cancelled"),
  importRunning: () => t("editor.import.running"),
  importDone: () => t("editor.import.done"),
  importError: (msg) => t("editor.import.error", { error: msg }),
  minQuestions: (min, count) => t("editor.status.minQuestions", { min, count }),
  minQuestionsOk: () => t("editor.status.minQuestionsOk"),
  editorError: () => t("editor.alert.editorError"),
};

const QN_MIN = GV_RULES.QN_MIN; // 10
const AN_MAX = LIMITS.AN_MAX;   // 6
const SUM_MAX = LIMITS.SUM_MAX; // 100

/* ================= DOM helpers ================= */
const $ = (id) => document.getElementById(id);

function setMsg(msg) {
  const el = $("msg");
  if (el) el.textContent = msg || "";
}

// Baza odrzuciła zapis, bo zmieniły się reguły gry (np. ankietę właśnie
// otwarto w innej karcie -- migracja 274). Dalsze pisanie i tak by się nie
// zapisało, więc zamiast samego komunikatu ten sam overlay co przy blokadzie
// zasobu, z powrotem do listy gier. Zwraca komunikat (albo "").
function ruleBlocked(e) {
  const msg = gameRuleErrorMessage(e);
  if (msg) {
    showBlockingOverlay({ title: t("gameValidate.lockedTitle"), message: msg, backHref: withLangParam("games") });
  }
  return msg;
}

function openOverlay(id, on) {
  const el = $(id);
  if (el) el.style.display = on ? "grid" : "none";
}

// debounce z flush(): przy przełączeniu pytania / wyjściu ze strony
// oczekujący zapis ma pójść od razu, a nie przepaść.
function debounce(fn, ms = 350) {
  let timer = null;
  let lastArgs = null;
  const wrapped = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...lastArgs); }, ms);
  };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  wrapped.flush = () => {
    if (!timer) return;
    wrapped.cancel();
    fn(...lastArgs);
  };
  return wrapped;
}

const normName = (s) => (String(s ?? "").trim() || MSG.defaultGameName()).slice(0, 80);

/* ================= DB ================= */
async function loadGame(gameId) {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status")
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw error;
  return data; // null = nie ma albo cudza (RLS)
}

async function saveGameName(gameId, name) {
  await updateChecked("games", { id: gameId }, { name });
}

// Pytania razem z liczbą odpowiedzi i sumą punktów -- jedno zapytanie
// (wcześniej osobne zapytanie o odpowiedzi dla każdego pytania, po każdej
// zmianie punktów).
async function listQuestionsWithStats(gameId) {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,answers(text,fixed_points)")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return (data || []).map((q) => ({ id: q.id, ord: q.ord, text: q.text, answers: q.answers || [] }));
}

async function listAnswers(questionId) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", questionId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function createQuestion(gameId, ord) {
  const { data, error } = await sb()
    .from("questions")
    .insert({ game_id: gameId, ord, text: MSG.questionDefault(ord) })
    .select("id,ord,text")
    .single();
  if (error) throw error;
  return { ...data, answers: [] };
}

// RPC z migracji 276: usunięcie + przenumerowanie w jednej transakcji.
async function deleteQuestionRpc(qId) {
  const { data, error } = await sb().rpc("game_question_delete", { p_question_id: qId });
  if (error) throw error;
  if (!data?.ok) {
    const e = new Error(data?.error || "delete_failed");
    if (data?.error === "not_found") e.code = ROW_GONE;
    throw e;
  }
}

async function renumberQuestionsRpc(gameId) {
  const { error } = await sb().rpc("game_questions_renumber", { p_game_id: gameId });
  if (error) throw error;
}

async function createAnswer(questionId, ord) {
  const { data, error } = await sb()
    .from("answers")
    .insert({ question_id: questionId, ord, text: MSG.answerDefault(ord), fixed_points: 0 })
    .select("id,ord,text,fixed_points")
    .single();
  if (error) throw error;
  return data;
}

async function deleteAnswer(aId) {
  const { data, error } = await sb().from("answers").delete().eq("id", aId).select("id");
  if (error) throw error;
  if (!data?.length) {
    const e = new Error("answer gone");
    e.code = ROW_GONE;
    throw e;
  }
}

async function resetPollForEditing(gameId) {
  // Jedno RPC = jedna transakcja (migracja 272, wspólne z games.js).
  const { data, error } = await sb().rpc("game_reset_poll_for_edit", { p_game_id: gameId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "reset_failed");
}

// RPC z migracji 276: wyczyszczenie gry i wgranie pytań w jednej
// transakcji. Wcześniej ~80 osobnych zapytań po skasowaniu starej treści --
// błąd w połowie zostawiał grę pustą albo z połową pytań.
async function importContentRpc(gameId, name, questions) {
  const { data, error } = await sb().rpc("game_import_content", {
    p_game_id: gameId,
    p_name: name || null,
    p_questions: questions,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "import_failed");
}

function nextAnswerOrd(answers) {
  const used = new Set((answers || []).map((a) => a.ord));
  for (let i = 1; i <= AN_MAX; i++) if (!used.has(i)) return i;
  return null;
}

/* ================= UI config by type ================= */
function cfgFromGameType(type) {
  if (type === TYPES.POLL_TEXT) {
    return {
      type,
      title: t("editor.config.pollText.title"),
      hintTop: t("editor.config.pollText.hintTop", { min: QN_MIN }),
      hintBottom: t("editor.config.pollText.hintBottom"),
      allowAnswers: false,
      allowPoints: false,
    };
  }
  if (type === TYPES.POLL_POINTS) {
    return {
      type,
      title: t("editor.config.pollPoints.title"),
      hintTop: t("editor.config.pollPoints.hintTop", { min: QN_MIN, answersMin: LIMITS.AN_MIN, answersMax: AN_MAX }),
      hintBottom: t("editor.config.pollPoints.hintBottom"),
      allowAnswers: true,
      allowPoints: false,
    };
  }
  return {
    type,
    title: t("editor.config.prepared.title"),
    hintTop: t("editor.config.prepared.hintTop", { min: QN_MIN, answersMin: LIMITS.AN_MIN, answersMax: AN_MAX }),
    hintBottom: t("editor.config.prepared.hintBottom", { sum: SUM_MAX }),
    allowAnswers: true,
    allowPoints: true,
  };
}

// Pytania z importu -> payload dla game_import_content. Te same limity i
// domyślne teksty co przy ręcznej edycji.
function importPayload(items, cfg) {
  return items.map((it, qi) => ({
    text: normQuestionText(it.qText) || MSG.questionDefault(qi + 1),
    answers: !cfg.allowAnswers ? [] : (it.answers || []).slice(0, AN_MAX).map((a, ai) => ({
      text: normAnswerText(a.text) || MSG.answerDefault(ai + 1),
      points: cfg.allowPoints ? (parsePoints(a.points) ?? 0) : 0,
    })),
  }));
}

/* ================= Boot ================= */
async function leaveTo(text) {
  if (text) await alertModal({ text });
  location.href = withLangParam("games");
}

async function boot() {
  /* ---------- i18n + early body reveal ---------- */
  const requireAuthP = requireAuth("login"); // start równolegle z initI18n
  await initI18n({ withSwitcher: true });
  document.documentElement.classList.remove("page-loading");

  /* ---------- auth/topbar ---------- */
  const user = await requireAuthP;
  initTopbarAccountDropdown(user);
  document.querySelector(".topbar")?.classList.add("topbar-ready");

  const btnBack = $("btnBack");

  $("btnManual")?.addEventListener("click", async () => {
    await flushSaves();
    const url = new URL("manual", location.href);
    const ret = `${location.pathname.split("/").pop() || ""}${location.search}${location.hash}`;
    url.searchParams.set("ret", ret);
    url.hash = "edit";
    location.href = url.toString();
  });

  // Enter w polu jednowierszowym = koniec edycji (blur zapisuje)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const el = e.target;
    if (el instanceof HTMLInputElement && el.type !== "file") {
      e.preventDefault();
      el.blur();
    }
  });

  /* ---------- game ---------- */
  // Komunikaty przed przekierowaniem czekają na OK -- wcześniej
  // location.href szło od razu i alert znikał, zanim dało się go przeczytać.
  const gameId = new URLSearchParams(location.search).get("id");
  if (!gameId) return leaveTo(t("editor.alert.missingId"));

  let game = await loadGame(gameId);
  if (!game) return leaveTo(MSG.gameNotFound());

  // czy wolno edytować (i czy trzeba zresetować zamkniętą ankietę) -- baza
  let editInfo = null;
  try {
    editInfo = (await validateGame(gameId)).edit;
  } catch (e) {
    console.error("[editor] game_validate error:", e);
  }
  if (!editInfo?.ok) return leaveTo(editInfo?.reason || MSG.cannotEdit());

  if (editInfo.needsReset) {
    const ok = await confirmModal({ text: MSG.resetPollConfirm() });
    if (!ok) return leaveTo("");
    try {
      await resetPollForEditing(gameId);
      game = await loadGame(gameId);
    } catch (e) {
      console.error("[editor] reset error:", e);
      return leaveTo(MSG.resetFailed());
    }
    if (!game) return leaveTo(MSG.gameNotFound());
  }

  // resourceType: "game" — wspólny klucz z game-settings.js (i docelowo
  // polls.js/control): edytor i ustawienia operują na tych samych,
  // powiązanych danych (pytania ↔ wybór finału/rund), więc wzajemnie się
  // wykluczają dla tej samej gry, nie tylko w obrębie tej samej strony.
  const lock = await guardResourceLock({
    resourceType: "game",
    resourceId: gameId,
    context: "editor",
    message: t("resourceLock.gameMessage"),
    backHref: withLangParam("games"),
  });
  if (!lock.ok) return;

  let cfg = cfgFromGameType(game.type);

  /* ---------- state ---------- */
  let questions = [];   // { id, ord, text, answers: [{ text, fixed_points }] } -- do kafelków
  let activeQId = null;
  let answers = [];     // odpowiedzi aktywnego pytania { id, ord, text, fixed_points }
  let answersSeq = 0;   // numer ostatniego wczytania odpowiedzi (spóźnione odpowiedzi odrzucamy)
  const busy = new Set(); // akcje w toku (podwójny klik)
  const pendingSaves = new Set();

  // Zapis w toku -- żeby "Moje gry" / "Wstecz" poczekało na niego zamiast
  // przerwać żądanie nawigacją (ostatnio wpisany tekst przepadał).
  function track(p) {
    pendingSaves.add(p);
    p.finally(() => pendingSaves.delete(p));
    return p;
  }

  const once = (key, fn) => async (...args) => {
    if (busy.has(key)) return;
    busy.add(key);
    try { return await fn(...args); } finally { busy.delete(key); }
  };

  /* ---------- refs ---------- */
  const qList = $("qList");
  const qText = $("qText");
  const aList = $("aList");
  const pointsRemainTop = $("pointsRemainTop");
  const rightPanel = document.querySelector(".rightPanel");
  const gameName = $("gameName");

  const isMobileLayout = () => window.matchMedia("(max-width:1100px)").matches;
  const activeQuestion = () => questions.find((x) => x.id === activeQId) || null;

  /* ---------- header ---------- */
  function renderHeader() {
    cfg = cfgFromGameType(game.type);
    $("pageTitle").textContent = cfg.title;
    $("hintTop").textContent = cfg.hintTop;
    $("hintBottom").textContent = cfg.hintBottom;
    $("typeBadge").textContent =
      cfg.type === TYPES.PREPARED ? MSG.typePrepared() :
      cfg.type === TYPES.POLL_POINTS ? MSG.typePollPoints() :
      MSG.typePollText();
    document.body.classList.toggle("only-questions", !cfg.allowAnswers);
    document.body.classList.toggle("no-points", !cfg.allowPoints);
  }

  function syncMobileEditingState() {
    const on = isMobileLayout() && !!activeQId;
    document.body.classList.toggle("mobile-editing", on);
    if (btnBack) btnBack.innerHTML = iconText("arrow-left", on ? t("editor.backToQuestions") : t("editor.backToGames"));
  }

  /* ---------- game name ---------- */
  gameName.maxLength = 80;
  gameName.value = game.name || "";
  let lastSavedName = normName(game.name);

  async function saveNameNow() {
    const cur = normName(gameName.value);
    if (cur === lastSavedName) {
      if (gameName.value !== cur) gameName.value = cur;
      return;
    }
    try {
      await saveGameName(gameId, cur);
      lastSavedName = cur;
      // pusta nazwa zapisuje się jako domyślna -- pokaż to w polu
      if (document.activeElement !== gameName) gameName.value = cur;
      setMsg(MSG.nameSaved());
    } catch (e) {
      console.error(e);
      setMsg(MSG.nameSaveError());
    }
  }
  gameName.addEventListener("blur", () => track(saveNameNow()));

  /* ---------- question list ---------- */
  function cardMeta(q) {
    if (!cfg.allowAnswers) return MSG.questionsOnly();
    if (cfg.allowPoints) return MSG.answersSum(q.answers.length, AN_MAX, sumPoints(q.answers), SUM_MAX);
    return MSG.answersCount(q.answers.length, AN_MAX);
  }

  // Kolor kafelka: zielony, gdy pytanie spełnia reguły typu (podpowiedź --
  // o grze i tak decyduje baza przez game_validate).
  function cardOk(q) {
    if (!cfg.allowAnswers) return null;
    return questionProblems(q, cfg.type).length === 0;
  }

  function updateCard(q) {
    const card = qList?.querySelector(`.qcard[data-id="${q.id}"]`);
    if (!card) return;
    card.querySelector(".qord").textContent = MSG.questionLabel(q.ord);
    card.querySelector(".qprev").textContent = (q.text || "").trim() || MSG.questionLabel(q.ord);
    card.querySelector(".qmeta").textContent = cardMeta(q);
    const ok = cardOk(q);
    card.classList.toggle("good", ok === true);
    card.classList.toggle("bad", ok === false);
  }

  function renderAddQuestionTile() {
    const sub = qList?.querySelector(".addTile .sub");
    if (sub) sub.textContent = questions.length >= QN_MIN ? MSG.minQuestionsOk() : MSG.minQuestions(QN_MIN, questions.length);
  }

  function renderQuestions() {
    if (!qList) return;
    qList.innerHTML = "";

    const addQ = document.createElement("button");
    addQ.type = "button";
    addQ.className = "qcard addTile";
    addQ.innerHTML = `
      <div class="plus">${icon("plus")}</div>
      <div>
        <div class="txt"></div>
        <div class="sub"></div>
      </div>
    `;
    addQ.querySelector(".txt").textContent = MSG.addQuestionLabel();
    addQ.addEventListener("click", addQuestion);
    qList.appendChild(addQ);

    for (const q of questions) {
      const card = document.createElement("div");
      card.className = "qcard";
      card.dataset.id = q.id;
      card.classList.toggle("active", q.id === activeQId);
      card.innerHTML = `
        <div class="qord"></div>
        <div class="qprev"></div>
        <div class="qmeta"></div>
        <button type="button" class="x">${icon("trash")}</button>
      `;
      const x = card.querySelector(".x");
      x.title = MSG.deleteLabel();
      x.setAttribute("aria-label", MSG.deleteLabel());
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteQuestion(q.id);
      });
      card.addEventListener("click", () => selectQuestion(q.id));
      qList.appendChild(card);
      updateCard(q);
    }
    renderAddQuestionTile();
  }

  // Zmiana pytania: przełączenie klasy, nie przebudowa listy.
  function markActiveCard() {
    qList?.querySelectorAll(".qcard[data-id]").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === activeQId);
    });
  }

  async function selectQuestion(id) {
    if (id === activeQId) return;
    // oczekujący zapis poprzedniego pytania idzie od razu (ze swoim id)
    saveQuestionDebounced.flush();
    activeQId = id;
    answers = [];
    markActiveCard();
    renderEditor();

    if (!cfg.allowAnswers || !id) return;
    const seq = ++answersSeq;
    try {
      const rows = await listAnswers(id);
      // szybkie klikanie A -> B: odpowiedzi A nie mogą nadpisać B
      if (seq !== answersSeq || activeQId !== id) return;
      answers = rows;
      renderAnswers();
    } catch (e) {
      console.error(e);
      if (seq === answersSeq) setMsg(MSG.loadError());
    }
  }

  function leaveQuestionEditor() {
    if (!activeQId) return;
    selectQuestion(null);
  }

  // Blokada podwójnego kliknięcia obejmuje tylko zapis -- kolejne "Dodaj
  // pytanie" zaraz po pojawieniu się kafelka ma działać, nawet gdy
  // odpowiedzi nowego pytania jeszcze się wczytują.
  const insertQuestion = once("addQuestion", async () => {
    try {
      const ord = questions.reduce((m, q) => Math.max(m, Number(q.ord) || 0), 0) + 1;
      const q = await createQuestion(gameId, ord);
      questions.push(q);
      renderQuestions();
      return q;
    } catch (e) {
      console.error(e);
      setMsg(ruleBlocked(e) || MSG.addQuestionError());
      return null;
    }
  });

  async function addQuestion() {
    const q = await insertQuestion();
    if (!q) return;
    setMsg(MSG.questionAdded());
    await selectQuestion(q.id);
    // domyślna treść zaznaczona -- od razu można pisać własną
    if (activeQId === q.id) {
      qText?.focus();
      qText?.select();
    }
  }

  const deleteQuestion = once("deleteQuestion", async (qId) => {
    const ok = await confirmModal({ text: MSG.deleteQuestionConfirm() });
    if (!ok) return;
    try {
      await deleteQuestionRpc(qId);
      setMsg(MSG.deleteQuestionDone());
    } catch (e) {
      console.error(e);
      if (e?.code === ROW_GONE) setMsg(MSG.rowGone());
      else return setMsg(ruleBlocked(e) || MSG.deleteQuestionError());
    }
    await reloadQuestions(activeQId === qId ? defaultActiveQuestionId : null);
  });

  function defaultActiveQuestionId() {
    return isMobileLayout() ? null : (questions[0]?.id || null);
  }

  // pickActive: funkcja wybierająca aktywne pytanie po wczytaniu (null =
  // zostaw obecne, jeśli nadal istnieje)
  async function reloadQuestions(pickActive = null) {
    questions = await listQuestionsWithStats(gameId);
    let next = pickActive ? pickActive() : activeQId;
    if (next && !questions.some((q) => q.id === next)) next = defaultActiveQuestionId();
    renderQuestions();
    activeQId = undefined; // wymuś wczytanie odpowiedzi w selectQuestion
    await selectQuestion(next);
  }

  /* ---------- question text ---------- */
  // Zapis z id pytania z chwili pisania: po przełączeniu na inne pytanie
  // spóźniony zapis nie może wpisać tekstu poprzedniego do pola (wcześniej
  // tak się działo i następne wyjście z pola nadpisywało nim nowe pytanie).
  async function saveQuestionNow(qId, raw, { final } = {}) {
    const q = questions.find((x) => x.id === qId);
    if (!q) return;
    // questions_text_len wymaga min. 1 znaku -- pusty tekst zapisuje się
    // jako domyślna etykieta
    const text = normQuestionText(raw) || MSG.questionDefault(q.ord);
    try {
      if (text !== q.text) {
        await updateChecked("questions", { id: qId }, { text });
        q.text = text;
        updateCard(q);
      }
      // Pole poprawiamy tylko przy wyjściu z niego -- w trakcie pisania
      // trim() zjadał spację na końcu przy każdej pauzie (słowa się sklejały)
      // i przestawiał kursor na koniec.
      if (final && activeQId === qId && qText && document.activeElement !== qText && qText.value !== text) {
        qText.value = text;
      }
      setMsg(MSG.saved());
    } catch (e) {
      console.error(e);
      if (e?.code === ROW_GONE) {
        setMsg(MSG.rowGone());
        await reloadQuestions();
        return;
      }
      setMsg(ruleBlocked(e) || MSG.saveError());
    }
  }
  const saveQuestionDebounced = debounce((qId, raw) => track(saveQuestionNow(qId, raw)), 350);

  wireTextLimit(qText, LIMITS.Q_TEXT, () => {
    if (!activeQId) return;
    setMsg(MSG.typing());
    saveQuestionDebounced(activeQId, qText.value);
  });
  qText?.addEventListener("blur", () => {
    if (!activeQId) return;
    saveQuestionDebounced.cancel();
    track(saveQuestionNow(activeQId, qText.value, { final: true }));
  });

  /* ---------- answers ---------- */
  function refreshActiveStats() {
    const q = activeQuestion();
    if (!q) return;
    q.answers = answers.map((a) => ({ text: a.text, fixed_points: a.fixed_points }));
    updateCard(q);
  }

  // Suma na żywo z pól (także niezapisanych jeszcze punktów).
  function updateSumFromInputs() {
    if (!cfg.allowPoints || !pointsRemainTop) return;
    let sum = 0;
    aList?.querySelectorAll("input.qf-pts").forEach((inp) => { sum += parsePoints(inp.value) ?? 0; });
    renderSumPill(pointsRemainTop.querySelector(".qf-sum"), sum);
  }

  const addAnswer = once("addAnswer", async () => {
    const qId = activeQId;
    if (!qId) return;
    const ord = nextAnswerOrd(answers);
    if (!ord) return setMsg(MSG.answerLimitReached());
    try {
      const a = await createAnswer(qId, ord);
      if (activeQId !== qId) return;
      answers = [...answers, a].sort((x, y) => x.ord - y.ord);
      refreshActiveStats();
      renderAnswers();
      // nowa odpowiedź od razu do wpisania
      const inp = aList?.querySelector(`.qf-row[data-id="${a.id}"] .qf-text`);
      inp?.focus();
      inp?.select();
      setMsg(MSG.addedAnswer());
    } catch (e) {
      console.error(e);
      setMsg(ruleBlocked(e) || MSG.addAnswerError());
    }
  });

  const removeAnswer = once("removeAnswer", async (aId) => {
    const qId = activeQId;
    const ok = await confirmModal({ text: MSG.deleteAnswerConfirm() });
    if (!ok) return;
    try {
      await deleteAnswer(aId);
      setMsg(MSG.removedAnswer());
    } catch (e) {
      console.error(e);
      if (e?.code !== ROW_GONE) return setMsg(ruleBlocked(e) || MSG.deleteAnswerError());
      setMsg(MSG.rowGone());
    }
    if (activeQId !== qId) return;
    answers = answers.filter((x) => x.id !== aId);
    refreshActiveStats();
    renderAnswers();
  });

  // Odpowiedź zniknęła gdzie indziej -- zdejmij ją z listy.
  function dropGoneAnswer(aId) {
    answers = answers.filter((x) => x.id !== aId);
    refreshActiveStats();
    renderAnswers();
    setMsg(MSG.rowGone());
  }

  function answerRow(a) {
    // ten sam wiersz co w modalu pytania w bazie pytań (question-form.js)
    const { row, iText, iPts, bDel } = buildAnswerRow({
      text: a.text || "",
      points: parsePoints(a.fixed_points) ?? 0,
      placeholder: MSG.answerDefault(a.ord),
      showPoints: cfg.allowPoints,
    });
    row.dataset.id = a.id;

    // Zapisy odpowiedzi zmieniają tylko ten wiersz i kafelek pytania --
    // wcześniej zapis punktów przebudowywał całą listę: kursor wyskakiwał z
    // pola, do którego przeszło się Tabem, a klik w kosz innego wiersza
    // (który zdejmował focus z punktów) trafiał w usunięty element.
    const saveText = async ({ final } = {}) => {
      const text = normAnswerText(iText.value) || MSG.answerDefault(a.ord);
      try {
        if (text !== a.text) {
          await updateChecked("answers", { id: a.id }, { text });
          a.text = text;
        }
        if (final && document.activeElement !== iText && iText.value !== text) iText.value = text;
        setMsg(MSG.saved());
      } catch (e) {
        console.error(e);
        if (e?.code === ROW_GONE) return dropGoneAnswer(a.id);
        setMsg(ruleBlocked(e) || MSG.saveError());
      }
    };
    const saveTextDebounced = debounce(() => track(saveText()), 350);

    wireTextLimit(iText, LIMITS.A_TEXT, () => {
      setMsg(MSG.typing());
      saveTextDebounced();
    });
    iText.addEventListener("blur", () => {
      saveTextDebounced.cancel();
      track(saveText({ final: true }));
    });

    if (iPts) {
      wirePointsInput(iPts, updateSumFromInputs);
      iPts.addEventListener("blur", () => track((async () => {
        const val = parsePoints(iPts.value) ?? 0;
        if (iPts.value !== String(val)) iPts.value = String(val);
        if (val === Number(a.fixed_points)) return;
        try {
          await updateChecked("answers", { id: a.id }, { fixed_points: val });
          a.fixed_points = val;
          refreshActiveStats();
          setMsg(MSG.saved());
        } catch (e) {
          console.error(e);
          if (e?.code === ROW_GONE) return dropGoneAnswer(a.id);
          setMsg(ruleBlocked(e) || MSG.pointsSaveError());
        }
      })()));
    }

    bDel.addEventListener("click", () => removeAnswer(a.id));
    return row;
  }

  function renderAnswers() {
    if (!cfg.allowAnswers || !aList) return;
    aList.innerHTML = "";
    if (pointsRemainTop) pointsRemainTop.innerHTML = "";

    const addA = buildAddAnswerTile(answers.length);
    addA.addEventListener("click", addAnswer);
    aList.appendChild(addA);

    if (cfg.allowPoints && pointsRemainTop) {
      const box = document.createElement("div");
      box.className = "qf-sum";
      pointsRemainTop.appendChild(box);
    }

    for (const a of answers) aList.appendChild(answerRow(a));
    updateSumFromInputs();
  }

  function renderEditor() {
    rightPanel?.classList.toggle("hasQ", !!activeQId);
    syncMobileEditingState();

    if (!activeQId) {
      if (qText) qText.value = "";
      if (aList) aList.innerHTML = "";
      if (pointsRemainTop) pointsRemainTop.innerHTML = "";
      return;
    }
    if (qText) qText.value = activeQuestion()?.text || "";
    renderAnswers();
  }

  // Oczekujące zapisy (pauza w pisaniu / pole z focusem) -- przed wyjściem.
  async function flushSaves() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    saveQuestionDebounced.flush();
    await Promise.allSettled([...pendingSaves]);
  }

  btnBack?.addEventListener("click", async () => {
    if (document.body.classList.contains("mobile-editing")) {
      leaveQuestionEditor();
      return;
    }
    await flushSaves();
    location.href = withLangParam("games");
  });

  /* ---------- import ---------- */
  const txtFile = $("txtFile");
  const txtTa = $("txtTa");
  const btnTxtImport = $("btnTxtImport");
  const importOverlay = $("txtImportOverlay");
  let importing = false;

  const setTxtMsg = (s) => { $("txtMsg").textContent = s || ""; };

  function setImporting(on) {
    importing = on;
    for (const id of ["btnTxtClose", "btnTxtImport", "btnTxtLoadFile", "txtFile", "txtTa"]) {
      const el = $(id);
      if (el) el.disabled = on;
    }
  }

  function closeImport() {
    if (!importing) openOverlay("txtImportOverlay", false);
  }

  $("btnImportTxt")?.addEventListener("click", () => {
    txtTa.value = "";
    txtFile.value = "";
    setTxtMsg("");
    openOverlay("txtImportOverlay", true);
    txtTa.focus();
  });
  $("btnTxtClose")?.addEventListener("click", closeImport);
  importOverlay?.addEventListener("click", (e) => {
    if (e.target === importOverlay) closeImport();
  });

  // "Wczytaj plik" nie był do niczego podpięty -- plik wybrany w polu nie
  // trafiał do importu. Teraz wybór pliku od razu wczytuje go do pola tekstu.
  async function loadFileIntoTextarea() {
    const file = txtFile.files?.[0];
    if (!file) return setTxtMsg(MSG.importChooseFile());
    try {
      txtTa.value = await file.text();
      setTxtMsg("");
    } catch (e) {
      console.error(e);
      setTxtMsg(MSG.importFileFailed());
    }
  }
  txtFile?.addEventListener("change", loadFileIntoTextarea);
  $("btnTxtLoadFile")?.addEventListener("click", loadFileIntoTextarea);

  btnTxtImport?.addEventListener("click", async () => {
    if (importing) return;
    const raw = String(txtTa.value || "");
    if (!raw.trim()) return setTxtMsg(MSG.importPastePrompt());

    const parsed = parseQaText(raw);
    if (!parsed.ok) return setTxtMsg(MSG.importParseError(parsed.code, parsed.params));

    setImporting(true);
    try {
      const ok = await confirmModal({ text: MSG.importConfirm() });
      if (!ok) return setTxtMsg(MSG.importCancelled());

      await flushSaves();
      setTxtMsg(MSG.importRunning());
      const name = parsed.name ? normName(parsed.name) : null;
      await importContentRpc(gameId, name, importPayload(parsed.items, cfg));

      if (name) {
        lastSavedName = name;
        gameName.value = name;
      }
      await reloadQuestions(defaultActiveQuestionId);
      setImporting(false);
      closeImport();
      setMsg(MSG.importDone());
    } catch (e) {
      console.error(e);
      // cała operacja jest w jednej transakcji -- przy błędzie gra zostaje
      // taka, jak była
      setTxtMsg(ruleBlocked(e) || MSG.importError(e?.message || String(e)));
    } finally {
      setImporting(false);
    }
  });

  /* ---------- init ---------- */
  renderHeader();
  questions = await listQuestionsWithStats(gameId);
  // dziury w numeracji (stare dane / przerwane usuwanie sprzed migracji 276)
  if (questions.some((q, i) => Number(q.ord) !== i + 1)) {
    await renumberQuestionsRpc(gameId);
    questions = await listQuestionsWithStats(gameId);
  }
  renderQuestions();
  activeQId = undefined;
  await selectQuestion(defaultActiveQuestionId());
  setMsg("");
  document.querySelectorAll("[data-skel-step]").forEach((el) => el.classList.add("skel-step-ready"));

  window.addEventListener("resize", syncMobileEditingState);

  window.addEventListener("i18n:lang", async () => {
    await flushSaves();
    renderHeader();
    renderQuestions();
    renderEditor();
    setMsg("");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch((e) => {
    console.error(e);
    void alertModal({ text: MSG.editorError() });
  });
});
