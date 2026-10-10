// js/pages/poll-points.js
import { sb } from "../../../../shared/js/core/supabase.js?v=v2026-10-10T15095";
import { getUser } from "../../../../shared/js/core/auth.js?v=v2026-10-10T15095";
import { initI18n, t, getUiLang } from "../../../../shared/translation/translation.js?v=v2026-10-10T15095";

const i18nReady = initI18n({ withSwitcher: true }).then(() => {
  document.documentElement.classList.remove('page-loading');
});

const MSG = {
  thanks: () => t("pollPoints.thanks"),
  loadTimeout: () => t("pollPoints.loadTimeout"),
  taskInvalid: () => t("pollPoints.taskInvalid"),
  loginToVote: () => t("pollPoints.loginToVote"),
  emailRequired: () => t("pollPoints.emailRequired"),
  openTaskFail: () => t("pollPoints.openTaskFail"),
  pollFallback: () => t("pollPoints.pollFallback"),
  pollClosed: () => t("pollPoints.pollClosed"),
  pollStopped: () => t("pollPoints.pollStopped"),
  pollEnded: () => t("pollPoints.pollEnded"),
  sending: () => t("pollPoints.sending"),
  error: (err) => t("pollPoints.error", { error: err }),
  questionProgress: (current, total) => t("pollPoints.questionProgress", { current, total }),
  beforeUnloadWarn: () => t("pollPoints.beforeUnloadWarn"),
  missingParams: () => t("pollPoints.missingParams"),
  alreadyVoted: () => t("pollPoints.alreadyVoted"),
  linkExpired: () => t("pollPoints.linkExpired"),
  pollNotFound: () => t("pollPoints.pollNotFound"),
  inviteDone: () => t("pollPoints.inviteDone"),
  inviteDeclined: () => t("pollPoints.inviteDeclined"),
  inviteExpired: () => t("pollPoints.inviteExpired"),
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

function redirectToRoot() {
  setTimeout(() => {
    location.href = "/";
  }, 5000);
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

  redirectToRoot();
}

function setSub(t) {
  if (subEl) subEl.textContent = t || "";
}

function showClosed(on) {
  if (closed) closed.style.display = on ? "" : "none";
  if (qbox) qbox.style.display = on ? "none" : "";
  if (on && subEl) subEl.style.display = "none"; // Hide loading sub when showing closed/error msg
  else if (!on && subEl) subEl.style.display = "";
}

function setClosedMsg(msg) {
  if (closed) closed.textContent = msg || "";
}

// Komunikat stanu (zamknięta / wygasła / brak): zawsze widoczny w bloku #closed.
function showStatus(msg) {
  showClosed(true);
  setSub("");
  setClosedMsg(msg);
}

// Stan ankiety względem klucza z linku (poll_state, anon): zatrzymana / zakończona /
// link z wcześniejszego uruchomienia. Zwraca komunikat albo null, gdy ankieta
// jest otwarta (albo stanu nie da się ustalić -- wtedy decyduje reszta strony).
function stateMessage(state) {
  if (state === "stopped") return MSG.pollStopped();
  if (state === "ended") return MSG.pollEnded();
  if (state === "expired" || state === "draft") return MSG.linkExpired();
  if (state === "not_found") return MSG.pollNotFound();
  return null;
}

async function describeLinkState() {
  try {
    const { data, error } = await sb().rpc("poll_state", { p_game_id: gameId, p_key: key });
    if (error) {
      const m = String(error.message || "");
      if (m.includes("invalid input syntax")) return MSG.pollNotFound();
      return null;
    }
    return stateMessage(data?.state);
  } catch {
    return null;
  }
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const callOnce = async (chunk) => {
    const req = sb().rpc("poll_points_vote_batch", {
      p_game_id: gameId,
      p_key: key,
      p_voter_token: voter,
      p_items: chunk,
    });
    const { error } = await withTimeout(req, 30000, MSG.loadTimeout());
    if (error) throw error;
  };

  const callWithRetry = async (chunk, attempt = 1) => {
    try {
      await callOnce(chunk);
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(650 * attempt);
      return callWithRetry(chunk, attempt + 1);
    }
  };

  const CHUNK = 25;
  const total = Array.isArray(items) ? items.length : 0;
  for (let i = 0; i < total; i += CHUNK) {
    const part = items.slice(i, i + CHUNK);
    if (subEl) subEl.textContent = `${MSG.sending()} (${Math.min(i + CHUNK, total)}/${total})`;
    await callWithRetry(part);
  }
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
    setTimeout(() => { location.href = "/subscriptions/?tab=tasks"; }, 650);
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
    if (data && data.ok === false) {
      const msgs = {
        poll_closed: MSG.pollEnded(),
        poll_stopped: MSG.pollStopped(),
        already_done: MSG.inviteDone(),
      };
      showStatus(msgs[data.error] || MSG.inviteExpired());
      return;
    }
    if (!data?.ok || data?.kind !== "task") throw new Error(MSG.taskInvalid());
    if (data.requires_auth) {
      showStatus(MSG.loginToVote());
      return;
    }
    if (data.needs_email) {
      showStatus(MSG.emailRequired());
      return;
    }
    gameId = data.game_id;
    key = data.key;
    taskVoterToken = data.voter_token;
    taskResolved = true;
    await markTaskOpened();
  } catch (e) {
    console.error("[poll-points] task resolve error:", e);
    showStatus(MSG.openTaskFail());
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
    setClosedMsg(game.status === "poll_stopped" ? MSG.pollStopped() : game.status === "ready" ? MSG.pollEnded() : MSG.pollClosed());
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
      .catch(async (e) => {
        console.error("[poll-points] submit_batch error:", e);
        submitting = false;
        // ankieta mogła zostać zatrzymana / zakończona w trakcie odpowiadania
        const linkState = await describeLinkState();
        if (linkState) {
          showStatus(linkState);
          return;
        }
        setSub(MSG.error(e?.message || e));
        // odbloknij UI
        if (alist) [...alist.querySelectorAll("button")].forEach(x => (x.disabled = false));
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
  } else if (!finished && !hasDone()) {
    setSub(MSG.loading()); // zanim payload się załaduje, niech "Loading…" będzie w dobrym języku
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // initI18n() robi dynamic import(pl.js/en.js/uk.js) — bez tego czekania
    // t()/MSG.X() poniżej mogą wykonać się zanim translations się załaduje,
    // co dla elementów bez data-i18n (np. #closed) zwraca surowy klucz
    // (np. "pollText.alreadyVoted") zamiast tłumaczenia (patrz t() w
    // translation.js: value==null -> return key), a dla elementów z
    // data-i18n applyTranslations() później i tak nadpisze wcześniej
    // ustawiony programowo tekst błędu z powrotem na "Ładuję…".
    await i18nReady;
    if (taskToken) {
      await resolveTaskToken();
    }
    if (!taskResolved) return;
    if (!gameId || !key) {
      showStatus(MSG.missingParams());
      return;
    }
    
    // stan ankiety względem klucza z linku: zatrzymana / zakończona / link wygasł
    const linkState = await describeLinkState();
    if (linkState) {
      showStatus(linkState);
      return;
    }
    if (hasDone()) {
      showStatus(MSG.alreadyVoted());
      redirectToRoot();
      return;
    }

    setupBeforeUnloadWarn();

    setSub(MSG.loading());
    showClosed(false);

    try {
      payload = await loadPayload();
    } catch (e) {
      const state = await describeLinkState();
      if (state) {
        showStatus(state);
        return;
      }
      throw e;
    }

    if ((payload?.game?.type || "") !== "poll_points") {
      showStatus(MSG.wrongType());
      return;
    }

    idx = 0;
    outbox = [];
    render();
  } catch (e) {
    console.error("[poll-points] init error:", e);
    showStatus(MSG.openPollFail(e?.message || e));
  }
});
