import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const title = document.getElementById("title");
const sub = document.getElementById("sub");

const qbox = document.getElementById("qbox");
const qtext = document.getElementById("qtext");
const prog = document.getElementById("prog");

const answerInput = document.getElementById("answerInput");
const btnSend = document.getElementById("btnSend");

const closed = document.getElementById("closed");

function token() {
  const k = `fam_poll_token_${gameId}`;
  let t = localStorage.getItem(k);
  if (!t) {
    t = Math.random().toString(16).slice(2) + Date.now().toString(16);
    localStorage.setItem(k, t);
  }
  return t;
}

let data = null;
let idx = 0;
let busy = false;

function showBox(on){
  qbox.style.display = on ? "" : "none";
  closed.style.display = on ? "none" : "";
}

function showClosed(msg){
  showBox(false);
  closed.textContent = msg || "Sondaż jest zamknięty. Dziękujemy!";
  sub.textContent = "Ten sondaż nie przyjmuje już odpowiedzi.";
}

function showError(msg){
  showBox(false);
  closed.textContent = msg || "Nie udało się wczytać sondażu.";
  sub.textContent = "—";
}

function render() {
  const g = data?.game;
  title.textContent = g?.name ? `Sondaż: ${g.name}` : "Sondaż";

  if (!g) return showError("Brak danych gry.");
  if (g.type !== "poll_text") return showError("To nie jest sondaż tekstowy.");
  if (g.status !== "poll_open") return showClosed("Sondaż jest zamknięty. Dziękujemy!");

  const qlist = data?.questions || [];
  if (!qlist.length) return showError("Brak pytań do sondażu.");

  if (idx >= qlist.length) {
    sub.textContent = "Dzięki! Udzieliłeś(aś) odpowiedzi na wszystkie pytania.";
    showBox(false);
    closed.textContent = "Dziękujemy za udział w sondażu!";
    return;
  }

  const q = qlist[idx];

  showBox(true);
  sub.textContent = "Wpisz odpowiedź (starannie).";
  qtext.textContent = q.text || "—";
  prog.textContent = `Pytanie ${idx + 1} / ${qlist.length}`;

  if (answerInput) answerInput.value = "";
  answerInput?.focus();
}

async function send() {
  if (!data?.questions?.length) return;
  if (busy) return;

  const g = data?.game;
  if (!g || g.status !== "poll_open") return showClosed("Sondaż jest zamknięty.");

  const q = data.questions[idx];
  const raw = String(answerInput?.value || "").trim();
  if (!raw) return;

  busy = true;
  btnSend.disabled = true;

  try {
    const { error } = await sb().rpc("poll_text_submit", {
      p_game_id: gameId,
      p_key: key,
      p_question_id: q.id,
      p_voter_token: token(),
      p_answer_text: raw,
    });
    if (error) throw error;

    idx += 1;
    busy = false;
    btnSend.disabled = false;
    render();
  } catch (e) {
    busy = false;
    btnSend.disabled = false;

    const m = String(e?.message || e).toLowerCase();
    if (m.includes("poll closed")) return showClosed("Sondaż jest zamknięty. Dziękujemy!");
    if (m.includes("empty")) return;

    alert("Nie udało się wysłać odpowiedzi. Spróbuj ponownie.");
  }
}

async function load() {
  if (!gameId || !key) return showError("Nieprawidłowy link sondażu.");

  try {
    const res = await sb().rpc("get_poll_game", { p_game_id: gameId, p_key: key });
    data = res.data;
    idx = 0;
    render();
  } catch {
    showError("Nie udało się wczytać sondażu.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  btnSend?.addEventListener("click", send);
  answerInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); send(); }
  });
  load();
});
