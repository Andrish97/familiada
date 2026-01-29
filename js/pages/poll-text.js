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

// lokalny bufor odpowiedzi (wysyłka dopiero na końcu)
let outbox = [];

/* ====== "już brałeś udział" ====== */
function doneKey() {
  return `fam_poll_done_${gameId}_${key}`;
}
function hasDone() {
  return localStorage.getItem(doneKey()) === "1";
}
function markDone() {
  localStorage.setItem(doneKey(), "1");
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

function setClosedMsg(msg) {
  if (closed) closed.textContent = msg || "";
}

function setSub(t) {
  if (subEl) subEl.textContent = t || "";
}

function showClosed(on) {
  if (closed) closed.style.display = on ? "" : "none";
  if (qbox) qbox.style.display = on ? "none" : "";
}

function getVoterToken() {
  const k = `fam_voter_${gameId}_${key}`;
  let t = localStorage.getItem(k);
  if (!t) {
    t = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(k, t);
  }
  return t;
}

// normalizacja do porównań
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

function validateAndPack(questionId, rawText) {
  const raw = String(rawText ?? "").trim().slice(0, 17);
  const normalized = norm(raw);

  if (!raw || !normalized) throw new Error("Wpisz odpowiedź.");

  return {
    question_id: questionId,
    answer_raw: raw,
    answer_norm: normalized,
  };
}

async function submitBatch(items) {
  const voter = getVoterToken();

  const { error } = await sb().rpc("poll_text_submit_batch", {
    p_game_id: gameId,
    p_key: key,
    p_voter_token: voter,
    p_items: items, // [{question_id, answer_raw, answer_norm}, ...]
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
    setSub("");
    setClosedMsg("Sondaż jest zamknięty. Dziękujemy!");
    return;
  }

  showClosed(false);

  if (!q) {
    // koniec pytań: wysyłka jednorazowa
    if (submitting || finished) return;

    submitting = true;
    if (btnSend) btnSend.disabled = true;
    if (answerInput) answerInput.disabled = true;

    setSub("Wysyłam…");

    submitBatch(outbox)
      .then(() => showFinished())
      .catch((e) => {
        console.error("[poll-text] submit_batch error:", e);
        setSub(`Błąd: ${e?.message || e}`);
        submitting = false;
        // pozwól spróbować jeszcze raz (render wywoła się ponownie po kliknięciu)
        if (btnSend) btnSend.disabled = false;
      });

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

function setupBeforeUnloadWarn() {
  window.addEventListener("beforeunload", (e) => {
    if (finished) return;
    if (!outbox.length) return;
    // przeglądarki iOS/Chrome ignorują czasem własny tekst, ale sam alert działa
    e.preventDefault();
    e.returnValue = "Udzielone odpowiedzi nie zostaną uznane.";
    return e.returnValue;
  });
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

    setupBeforeUnloadWarn();

    setSub("Ładuję…");
    showClosed(false);

    payload = await loadPayload();

    if ((payload?.game?.type || "") !== "poll_text") {
      setSub("To nie jest typowy sondaż.");
      showClosed(true);
      return;
    }

    idx = 0;
    outbox = [];
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

      try {
        setSub("Wysyłam…");
        // pakujemy odpowiedź do outbox (bez wysyłki)
        const packed = validateAndPack(q.id, answerInput?.value || "");

        // nadpisz jeśli ktoś cofnąłby się kiedyś (na razie nie ma cofania, ale bezpiecznie)
        const i = outbox.findIndex(x => x.question_id === packed.question_id);
        if (i >= 0) outbox[i] = packed;
        else outbox.push(packed);

        idx++;
        render();
      } catch (e) {
        console.error("[poll-text] pack error:", e);
        setSub(`Błąd: ${e?.message || e}`);
      }
    });
  } catch (e) {
    console.error("[poll-text] init error:", e);
    setSub(`Nie można otworzyć sondażu: ${e?.message || e}`);
    showClosed(true);
  }
});
