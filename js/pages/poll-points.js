// js/pages/poll-points.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const $ = (id) => document.getElementById(id);

const titleEl = $("title");
const subEl = $("sub");

const qbox = $("qbox");
const qtext = $("qtext");
const alist = $("alist");
const prog = $("prog");
const closed = $("closed");

let finished = false;

function doneKey() {
  return `fam_poll_done_${gameId}_${key}`;
}

function hasDone() {
  return localStorage.getItem(doneKey()) === "1";
}

function markDone() {
  localStorage.setItem(doneKey(), "1");
}

// token tylko “na czas życia strony” (refresh/close = reset)
let voterToken = null;
function getVoterToken() {
  if (voterToken) return voterToken;
  voterToken = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
  return voterToken;
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
  if (sub) sub.textContent = "Dziękujemy za udział!";
}


function setSub(t) {
  if (subEl) subEl.textContent = t || "";
}

function showClosed(on) {
  if (closed) closed.style.display = on ? "" : "none";
  if (qbox) qbox.style.display = on ? "none" : "";
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
  const { data, error } = await withTimeout(req, 15000, "Nie można pobrać pytań (timeout).");
  if (error) throw error;
  return data;
}

async function vote(questionId, answerId) {
  const voter = getVoterToken();

  const { error } = await sb().rpc("poll_points_vote", {
    p_game_id: gameId,
    p_key: key,
    p_question_id: questionId,
    p_answer_id: answerId,
    p_voter_token: voter,
  });

  if (error) throw error;
}

let payload = null;
let idx = 0;

function render() {
  const game = payload?.game || {};
  const questions = payload?.questions || [];
  const q = questions[idx];

  if (titleEl) titleEl.textContent = game.name || "Sondaż";

  if (game.status !== "poll_open") {
    showClosed(true);
    setSub("Sondaż jest zamknięty.");
    return;
  }

  showClosed(false);

  if (!q) {
    showFinished();
    return;
  }

  if (qtext) qtext.textContent = q.text || "—";
  if (prog) prog.textContent = `Pytanie ${q.ord}/${questions.length}`;
  setSub("");

  if (alist) {
    alist.innerHTML = "";
    const answers = q.answers || [];

    for (const a of answers) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn full"; // dostosuj do CSS jeśli masz inną klasę
      b.textContent = a.text || `ODP ${a.ord}`;

      b.addEventListener("click", async () => {
        try {
          // zablokuj cały panel na czas zapisu
          [...alist.querySelectorAll("button")].forEach(x => (x.disabled = true));
          setSub("Zapisuję głos…");

          await vote(q.id, a.id);

          idx++;
          render();
        } catch (e) {
          console.error("[poll-points] vote error:", e);
          setSub(`Błąd: ${e?.message || e}`);
          // odblokuj
          [...alist.querySelectorAll("button")].forEach(x => (x.disabled = false));
        }
      });

      alist.appendChild(b);
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!gameId || !key) {
      setSub("Brak parametru id lub key.");
      showClosed(true);
      return;
    }

    if (hasDone()) {
      showClosed(true);
      setSub("Już wziąłeś udział w sondażu.");
      return;
    }

    setSub("Ładuję…");
    showClosed(false);

    payload = await loadPayload();

    if ((payload?.game?.type || "") !== "poll_points") {
      setSub("To nie jest sondaż punktacji.");
      showClosed(true);
      return;
    }

    idx = 0;
    render();
  } catch (e) {
    console.error("[poll-points] init error:", e);
    setSub(`Nie można otworzyć sondażu: ${e?.message || e}`);
    showClosed(true);
  }
});

