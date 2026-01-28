// js/pages/poll-text.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const $ = (id) => document.getElementById(id);

const titleEl = $("title");
const subEl = $("sub");

const qbox = $("qbox");
const qtext = $("qtext");
const prog = $("prog");
const closed = $("closed");

const answerInput = $("answerInput");
const btnSend = $("btnSend");
const countEl = $("count");

let finished = false;

let submitting = false;

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

  // chowamy całe UI pytań (input + hint + liczniki)
  if (qbox) qbox.style.display = "none";

  // chowamy "sondaż zamknięty", bo to inny stan
  if (closed) closed.style.display = "none";

  // pokazujemy tylko jedno podziękowanie
  if (sub) sub.textContent = "Dziękujemy za udział!";
}

function setSub(t) {
  if (subEl) subEl.textContent = t || "";
}

function showClosed(on) {
  if (closed) closed.style.display = on ? "" : "none";
  if (qbox) qbox.style.display = on ? "none" : "";
}

// trim + lowercase + wiele spacji => jedna (ale spacje "w środku" zostają jako pojedyncze)
function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// timeout bez użycia promise.finally (żeby nie wpaść w “finally is not a function”)
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

async function submit(questionId, rawText) {
  const raw = String(rawText ?? "").trim().slice(0, 17);
  const normalized = norm(raw);

  if (!raw || !normalized) throw new Error("Wpisz odpowiedź.");

  const voter = getVoterToken();

  // używamy wersji RPC z raw+norm
  const { error } = await sb().rpc("poll_text_submit", {
    p_game_id: gameId,
    p_key: key,
    p_question_id: questionId,
    p_voter_token: voter,
    p_answer_raw: raw,
    p_answer_norm: normalized,
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

  // status
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
  setSub(""); // zdejmujemy “Ładuję…”

  if (answerInput) {
    answerInput.disabled = false;
    answerInput.value = "";
    answerInput.focus();
  }
  if (btnSend) btnSend.disabled = false;
  if (countEl) countEl.textContent = "0/17";
}

function updateCount() {
  if (!answerInput || !countEl) return;
  const len = (answerInput.value || "").length;
  countEl.textContent = `${len}/17`;
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

    if ((payload?.game?.type || "") !== "poll_text") {
      setSub("To nie jest typowy sondaż.");
      showClosed(true);
      return;
    }

    idx = 0;
    render();

    answerInput?.addEventListener("input", () => {
      // twardy limit 17
      if (answerInput.value.length > 17) answerInput.value = answerInput.value.slice(0, 17);
      updateCount();
    });

    answerInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnSend?.click();
      }
    });

    btnSend?.addEventListener("click", async () => {
      if (finished || submitting) return;
    
      const q = (payload?.questions || [])[idx];
      if (!q) return;
    
      submitting = true;
      if (btnSend) btnSend.disabled = true;
    
      try {
        setSub("Wysyłam…");
    
        await submit(q.id, answerInput?.value || "");
    
        idx++;
        render(); // render() i tak ustawi disabled=false na kolejne pytanie
      } catch (e) {
        console.error("[poll-text] submit error:", e);
        setSub(`Błąd: ${e?.message || e}`);
      } finally {
        submitting = false;
    
        // jeśli nie przeszliśmy dalej (np. błąd), pozwól próbować ponownie
        const hasNext = (payload?.questions || [])[idx];
        if (!finished && hasNext && btnSend) btnSend.disabled = false;
      }
    });
  } catch (e) {
    console.error("[poll-text] init error:", e);
    setSub(`Nie można otworzyć sondażu: ${e?.message || e}`);
    showClosed(true);
  }
});
