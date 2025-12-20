// js/pages/poll-text.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const $ = (id) => document.getElementById(id);

const msg = $("msg");
const titleEl = $("title");
const qText = $("qText");
const inp = $("inp");
const btnSend = $("btnSend");
const btnNext = $("btnNext");

function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
}

function voterStorageKey() {
  return `fam_voter_${gameId}_${key}`;
}

function getVoterToken() {
  const k = voterStorageKey();
  let t = localStorage.getItem(k);
  if (!t) {
    t = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(k, t);
  }
  return t;
}

// ignorujemy wielkość liter i spacje przed/po, ale nie w środku
function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

async function loadPayload() {
  const { data, error } = await sb().rpc("poll_get_payload", {
    p_game_id: gameId,
    p_key: key,
  });
  if (error) throw error;
  return data;
}

async function submit(questionId, raw) {
  const rawS = String(raw ?? "").trim();
  const normS = norm(rawS);

  if (!rawS) throw new Error("Wpisz odpowiedź.");
  if (!normS) throw new Error("Wpisz odpowiedź.");

  const voter = getVoterToken();

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
  const questions = payload?.questions || [];
  const q = questions[idx];

  if (!q) {
    if (qText) qText.textContent = "Dziękujemy!";
    if (inp) { inp.value = ""; inp.disabled = true; }
    if (btnSend) btnSend.disabled = true;
    if (btnNext) btnNext.disabled = true;
    setMsg("Wysłano odpowiedzi do wszystkich pytań.");
    return;
  }

  if (titleEl) titleEl.textContent = payload?.game?.name || "Sondaż";
  if (qText) qText.textContent = `P${q.ord}: ${q.text}`;

  if (inp) {
    inp.disabled = false;
    inp.value = "";
    inp.placeholder = "Wpisz odpowiedź dokładnie (bez żartów 😄)";
    inp.focus();
  }

  if (btnSend) btnSend.disabled = false;
  if (btnNext) { btnNext.disabled = false; btnNext.textContent = "Pomiń"; }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!gameId || !key) {
      setMsg("Brak parametru id lub key.");
      return;
    }

    setMsg("Ładuję…");
    payload = await loadPayload();

    if ((payload?.game?.type || "") !== "poll_text") {
      setMsg("To nie jest typowy sondaż.");
      return;
    }

    idx = 0;
    renderQuestion();
    setMsg("");

    btnSend?.addEventListener("click", async () => {
      try {
        const q = (payload?.questions || [])[idx];
        if (!q) return;

        btnSend.disabled = true;
        setMsg("Wysyłam…");
        await submit(q.id, inp?.value || "");
        setMsg("Wysłano. Następne pytanie.");
        idx++;
        renderQuestion();
        setMsg("");
      } catch (e) {
        console.error("[poll-text] submit error:", e);
        setMsg(`Błąd: ${e?.message || e}`);
      } finally {
        const q = (payload?.questions || [])[idx];
        if (btnSend && q) btnSend.disabled = false;
      }
    });

    btnNext?.addEventListener("click", () => {
      idx++;
      renderQuestion();
      setMsg("");
    });

  } catch (e) {
    console.error("[poll-text] init error:", e);
    setMsg(`Nie można otworzyć sondażu: ${e?.message || e}`);
  }
});


