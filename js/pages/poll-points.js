// js/pages/poll-points.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const $ = (id) => document.getElementById(id);

const msg = $("msg");
const title = $("title");
const qText = $("qText");
const answersBox = $("answers");
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

function asPromise(x) {
  return Promise.resolve(x);
}

function withTimeout(promiseLike, ms, label) {
  const p = asPromise(promiseLike);
  let to = null;

  const t = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(label)), ms);
  });

  return Promise.race([
    p.then(
      (v) => {
        clearTimeout(to);
        return v;
      },
      (e) => {
        clearTimeout(to);
        throw e;
      }
    ),
    t,
  ]);
}

async function loadPayload() {
  const req = sb().rpc("poll_get_payload", { p_game_id: gameId, p_key: key });
  const { data, error } = await withTimeout(req, 12000, "Nie można pobrać pytań (timeout).");
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

function renderQuestion() {
  const questions = payload?.questions || [];
  const q = questions[idx];

  if (!q) {
    if (qText) qText.textContent = "Dziękujemy!";
    if (answersBox) answersBox.innerHTML = "";
    if (btnNext) btnNext.disabled = true;
    setMsg("Oddałeś głosy na wszystkie pytania.");
    return;
  }

  if (title) title.textContent = payload?.game?.name || "Sondaż";
  if (qText) qText.textContent = `P${q.ord}: ${q.text}`;

  if (answersBox) {
    answersBox.innerHTML = "";
    for (const a of (q.answers || [])) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ansBtn";
      b.textContent = a.text || `ODP ${a.ord}`;

      b.addEventListener("click", async () => {
        try {
          b.disabled = true;
          setMsg("Zapisuję głos…");
          await vote(q.id, a.id);
          setMsg("Zapisano. Następne pytanie.");
          idx++;
          renderQuestion();
        } catch (e) {
          console.error("[poll-points] vote error:", e);
          setMsg(`Błąd: ${e?.message || e}`);
          b.disabled = false;
        }
      });

      answersBox.appendChild(b);
    }
  }

  if (btnNext) {
    btnNext.disabled = false;
    btnNext.textContent = "Pomiń";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!gameId || !key) {
      setMsg("Brak parametru id lub key.");
      return;
    }

    setMsg("Ładuję…");
    payload = await loadPayload();

    if ((payload?.game?.type || "") !== "poll_points") {
      setMsg("To nie jest sondaż punktacji.");
      return;
    }

    idx = 0;
    renderQuestion();
    setMsg("");

    btnNext?.addEventListener("click", () => {
      idx++;
      renderQuestion();
    });
  } catch (e) {
    console.error("[poll-points] init error:", e);
    setMsg(`Nie można otworzyć sondażu: ${e?.message || e}`);
  }
});

