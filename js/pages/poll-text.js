// js/pages/poll-text.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const $ = (id) => document.getElementById(id);

const msg = $("msg");
const title = $("title");
const qText = $("qText");
const inp = $("inp");
const btnSend = $("btnSend");
const btnNext = $("btnNext");

function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
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

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " "); // <-- wiele spacji / tabów / enterów => jedna spacja
}

function withTimeout(promiseLike, ms, errMsg) {
  const p = Promise.resolve(promiseLike); // <-- klucz: supabase potrafi dać "thenable" bez finally
  let to = null;

  const timeout = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(errMsg || "Timeout")), ms);
  });

  return Promise.race([p, timeout]).finally(() => {
    if (to) clearTimeout(to);
  });
}

async function loadPayload() {
  const req = sb().rpc("poll_get_payload", { p_game_id: gameId, p_key: key });
  const { data, error } = await withTimeout(req, 12000, "Nie można pobrać pytań (timeout).");
  if (error) throw error;
  return data;
}

async function submit(questionId, raw) {
  const voter = getVoterToken();

  const rawS = String(raw ?? "").trim();
  const normS = norm(rawS);

  if (!rawS || !normS) throw new Error("Wpisz odpowiedź.");

  // używamy nowszej sygnatury (raw+norm)
  const { error } = await sb().rpc("poll_text_submit", {
    p_game_id: gameId,
    p_key: key,
    p_question_id: questionId,
    p_voter_token: voter,
    p_answer_raw: rawS,
    p_answer_norm: normS,
  });

  if (error) throw error;
}

let payload = null;
let idx = 0;

function renderQuestion() {
  if (!payload) return;

  const questions = payload.questions || [];
  const q = questions[idx];

  if (!q) {
    if (qText) qText.textContent = "Dziękujemy!";
    if (inp) {
      inp.value = "";
      inp.disabled = true;
    }
    if (btnSend) btnSend.disabled = true;
    if (btnNext) btnNext.disabled = true;
    setMsg("Wysłano odpowiedzi do wszystkich pytań.");
    return;
  }

  if (title) title.textContent = payload.game?.name || "Sondaż";
  if (qText) qText.textContent = `P${q.ord}: ${q.text}`;

  if (inp) {
    inp.disabled = false;
    inp.value = "";
    inp.focus();
    inp.placeholder = "Wpisz odpowiedź (pisz poprawnie 🙂)";
  }

  if (btnSend) btnSend.disabled = false;
  if (btnNext) btnNext.disabled = false;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!gameId || !key) {
      setMsg("Brak parametru id lub key.");
      return;
    }

    setMsg("Ładuję…");
    payload = await loadPayload();

    if ((payload.game?.type || "") !== "poll_text") {
      setMsg("To nie jest typowy sondaż.");
      return;
    }

    idx = 0;
    renderQuestion();
    setMsg("");

    btnSend?.addEventListener("click", async () => {
      try {
        const questions = payload.questions || [];
        const q = questions[idx];
        if (!q) return;

        btnSend.disabled = true;
        setMsg("Wysyłam…");
        await submit(q.id, inp?.value || "");
        setMsg("Wysłano. Następne pytanie.");
        idx++;
        renderQuestion();
      } catch (e) {
        console.error("[poll-text] submit error:", e);
        setMsg(`Błąd: ${e?.message || e}`);
      } finally {
        const questions = payload?.questions || [];
        if (btnSend && questions[idx]) btnSend.disabled = false;
      }
    });

    btnNext?.addEventListener("click", () => {
      idx++;
      renderQuestion();
    });

    inp?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnSend?.click();
      }
    });
  } catch (e) {
    console.error("[poll-text] init error:", e);
    setMsg(`Nie można otworzyć sondażu: ${e?.message || e}`);
  }
});
