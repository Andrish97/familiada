// js/pages/poll-points.js
import { sb } from "../core/supabase.js";
import { getUser } from "../core/auth.js";
import { initI18n, t } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

const MSG = {
  thanks: () => t("pollPoints.thanks"),
  loadTimeout: () => t("pollPoints.loadTimeout"),
  taskInvalid: () => t("pollPoints.taskInvalid"),
  loginToVote: () => t("pollPoints.loginToVote"),
  emailRequired: () => t("pollPoints.emailRequired"),
  openTaskFail: () => t("pollPoints.openTaskFail"),
  pollFallback: () => t("pollPoints.pollFallback"),
  pollClosed: () => t("pollPoints.pollClosed"),
  sending: () => t("pollPoints.sending"),
  error: (err) => t("pollPoints.error", { error: err }),
  questionProgress: (current, total) => t("pollPoints.questionProgress", { current, total }),
  beforeUnloadWarn: () => t("pollPoints.beforeUnloadWarn"),
  missingParams: () => t("pollPoints.missingParams"),
  alreadyVoted: () => t("pollPoints.alreadyVoted"),
  loading: () => t("pollPoints.loading"),
  wrongType: () => t("pollPoints.wrongType"),
  openPollFail: (err) => t("pollPoints.openPollFail", { error: err }),
  answerFallback: (ord) => t("pollPoints.answerFallback", { ord }),
};

const qs = new URLSearchParams(location.search);
let gameId = qs.get("id");
let key = qs.get("key");
const taskToken = qs.get("t"); // <- opcjonalnie (tylko dla zadań z poll_go)

const $ = (id) => document.getElementById(id);

const titleEl = $("title");
const subEl = $("sub");

const qbox = $("qbox");
const qtext = $("qtext");
const alist = $("alist");
const prog = $("prog");
const closed = $("closed");

let finished = false;
let submitting = false;

// lokalny bufor głosów (wysyłka dopiero na końcu)
let outbox = [];

/* ====== "już brałeś udział" ====== */
function doneKey() {
  return `fam_poll_done_${gameId}_${key}`;
}
function hasDone() {
  if (taskToken) return false;
  return localStorage.getItem(doneKey()) === "1";
}
function markDone() {
  if (taskToken) return;
  localStorage.setItem(doneKey(), "1");
}

function showFinished() {
  if (finished) return;
  finished = true;

  markDone();

  const sub = document.getElementById("sub");
  const qbox = document.getElementById("qbox");
  const closed = document.getElementById("closed");

  if (qbox) qbox.style.display = "none";
  if (closed) closed.style.display = "none";
  if (sub) sub.textContent = MSG.thanks();
}

function setSub(t) {
  if (subEl) subEl.textContent = t || "";
}

function showClosed(on) {
  if (closed) closed.style.display = on ? "" : "none";
  if (qbox) qbox.style.display = on ? "none" : "";
}

function setClosedMsg(msg) {
  if (closed) closed.textContent = msg || "";
}

let taskVoterToken = null;
let taskResolved = !taskToken;
function getVoterToken() {
  if (taskToken && taskVoterToken) return taskVoterToken;
  const k = `fam_voter_${gameId}_${key}`;
  let t = localStorage.getItem(k);
  if (!t) {
    t = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(k, t);
  }
  return t;
}

async function withTimeout(promiseLike, ms, errMsg) {
  const p = Promise.resolve(promiseLike);

  let timer = null;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(errMsg || "Timeout")), ms);
  });

  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadPayload() {
  const req = sb().rpc("poll_get_payload", { p_game_id: gameId, p_key: key });
  const { data, error } = await withTimeout(req, 15000, MSG.loadTimeout());
  if (error) throw error;
  return data;
}

async function submitBatch(items) {
  const voter = getVoterToken();

  const { error } = await sb().rpc("poll_points_vote_batch", {
    p_game_id: gameId,
    p_key: key,
    p_voter_token: voter,
    p_items: items, // [{question_id, answer_id}, ...]
  });

  if (error) throw error;
}

async function markTaskDone() {
  if (!taskToken) return; // anon flow
  try {
    await sb().rpc("poll_task_done", { p_token: taskToken });
  } catch (e) {
    console.warn("[poll-points] poll_task_done failed:", e);
  }
}

async function maybeReturnToHub(){
  if (!taskToken) return;
  try{
    const u = await getUser();
    if (!u) return;
    setTimeout(() => { location.href = "polls-hub.html"; }, 650);
  }catch{}
}

async function markTaskOpened() {
  if (!taskToken) return;
  try {
    await sb().rpc("poll_task_opened", { p_token: taskToken });
  } catch (e) {
    console.warn("[poll-points] poll_task_opened failed:", e);
  }
}

async function resolveTaskToken() {
  if (!taskToken) return;
  try {
    const { data, error } = await sb().rpc("poll_task_resolve", { p_token: taskToken });
    if (error) throw error;
    if (!data?.ok || data?.kind !== "task") throw new Error(MSG.taskInvalid());
    if (data.requires_auth) {
      setSub(MSG.loginToVote());
      showClosed(true);
      return;
    }
    if (data.needs_email) {
      setSub(MSG.emailRequired());
      showClosed(true);
      return;
    }
    gameId = data.game_id;
    key = data.key;
    taskVoterToken = data.voter_token;
    taskResolved = true;
    await markTaskOpened();
  } catch (e) {
    console.error("[poll-points] task resolve error:", e);
    setSub(MSG.openTaskFail());
    showClosed(true);
  }
}

function setupBeforeUnloadWarn() {
  window.addEventListener("beforeunload", (e) => {
    if (finished) return;
    if (!outbox.length) return;
    e.preventDefault();
    e.returnValue = MSG.beforeUnloadWarn();
    return e.returnValue;
  });
}

let payload = null;
let idx = 0;

function render() {
  const game = payload?.game || {};
  const questions = payload?.questions || [];
  const q = questions[idx];

  if (titleEl) titleEl.textContent = game.name || MSG.pollFallback();
  
  if (game.status !== "poll_open") {
    showClosed(true);
    setSub("");
    setClosedMsg(MSG.pollClosed());
    return;
  }

  showClosed(false);

  if (!q) {
    // koniec pytań: wysyłka jednorazowa
    if (submitting || finished) return;

    submitting = true;
    setSub(MSG.sending());

    // zablokuj UI listy
    if (alist) [...alist.querySelectorAll("button")].forEach(x => (x.disabled = true));

    submitBatch(outbox)
      .then(async () => {
        await markTaskDone();
        showFinished();
        await maybeReturnToHub();
      })
      .catch((e) => {
        console.error("[poll-points] submit_batch error:", e);
        setSub(MSG.error(e?.message || e));
        submitting = false;
        // pozwól spróbować jeszcze raz (użytkownik kliknie back/refresh - ale alert go ostrzeże)
      });

    return;
  }

  if (qtext) qtext.textContent = q.text || t("common.dash");
  if (prog) prog.textContent = MSG.questionProgress(q.ord, questions.length);
  setSub("");

  if (alist) {
    alist.innerHTML = "";
    const answers = q.answers || [];

    for (const a of answers) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn full";
      b.textContent = a.text || MSG.answerFallback(a.ord);

      b.addEventListener("click", () => {
        if (finished || submitting) return;

        // zapamiętaj wybór (bez wysyłki)
        const packed = { question_id: q.id, answer_id: a.id };
        const i = outbox.findIndex(x => x.question_id === packed.question_id);
        if (i >= 0) outbox[i] = packed;
        else outbox.push(packed);

        // przejście do następnego pytania
        idx++;
        render();
      });

      alist.appendChild(b);
    }
  }
}

// po zmianie języka applyTranslations nadpisuje qtext/prog/sub (bo mają data-i18n w HTML)
// więc wymuszamy ponowne odmalowanie stanu ekranu
window.addEventListener("i18n:lang", () => {
  if (payload) {
    render(); // przywraca pytanie + progres po podmianie języka
  } else {
    setSub(MSG.loading()); // zanim payload się załaduje, niech "Loading…" będzie w dobrym języku
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (taskToken) {
      await resolveTaskToken();
    }
    if (!taskResolved) return;
    if (!gameId || !key) {
      setSub(MSG.missingParams());
      showClosed(true);
      return;
    }
    
    if (hasDone()) {
      showClosed(true);
      setSub("");
      setClosedMsg(MSG.alreadyVoted());
      return;
    }

    setupBeforeUnloadWarn();

    setSub(MSG.loading());
    showClosed(false);

    payload = await loadPayload();

    if ((payload?.game?.type || "") !== "poll_points") {
      setSub(MSG.wrongType());
      showClosed(true);
      return;
    }

    idx = 0;
    outbox = [];
    render();
  } catch (e) {
    console.error("[poll-points] init error:", e);
    setSub(MSG.openPollFail(e?.message || e));
    showClosed(true);
  }
});
