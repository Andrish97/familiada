// js/pages/poll.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const title = document.getElementById("title");
const sub = document.getElementById("sub");
const qbox = document.getElementById("qbox");
const qtext = document.getElementById("qtext");
const alist = document.getElementById("alist");
const prog = document.getElementById("prog");
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

function showClosed(msg) {
  qbox.style.display = "none";
  closed.style.display = "block";
  closed.textContent = msg || "Sondaż jest zamknięty. Dziękujemy!";
  sub.textContent = "Ten sondaż nie przyjmuje już głosów.";
}

function showError(msg) {
  qbox.style.display = "none";
  closed.style.display = "block";
  closed.textContent = msg || "Nie udało się wczytać sondażu.";
}

function render() {
  const g = data?.game;
  title.textContent = g?.name ? `Sondaż: ${g.name}` : "Sondaż";

  if (!g) {
    showError("Brak danych gry.");
    return;
  }

  if (g.kind !== "poll") {
    showError("To nie jest Familiada sondażowa.");
    return;
  }

  if (g.status !== "poll_open") {
    showClosed("Sondaż jest zamknięty. Dziękujemy!");
    return;
  }

  const qlist = data?.questions || [];
  if (!qlist.length) {
    sub.textContent = "Brak pytań w tym sondażu.";
    qbox.style.display = "none";
    closed.style.display = "block";
    closed.textContent = "Brak pytań do głosowania.";
    return;
  }

  if (idx >= qlist.length) {
    sub.textContent = "Dzięki! Oddałeś(aś) głos na wszystkie pytania.";
    qbox.style.display = "none";
    closed.style.display = "block";
    closed.textContent = "Dziękujemy za udział w sondażu!";
    return;
  }

  const q = qlist[idx];
  const answers = q?.answers || [];

  if (!answers.length) {
    sub.textContent = "To pytanie nie ma odpowiedzi do głosowania.";
    qbox.style.display = "none";
    closed.style.display = "block";
    closed.textContent = "Błąd konfiguracji sondażu: pytanie bez odpowiedzi.";
    return;
  }

  sub.textContent = "Wybierz odpowiedź, która najbardziej pasuje.";
  qbox.style.display = "block";
  closed.style.display = "none";

  qtext.textContent = q.text;
  prog.textContent = `Pytanie ${idx + 1} / ${qlist.length}`;

  alist.innerHTML = "";
  answers.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "abtn";
    b.textContent = a.text;

    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await sb().rpc("poll_vote", {
          p_game_id: gameId,
          p_key: key,
          p_question_id: q.id,
          p_answer_id: a.id,
          p_voter_token: token(),
        });

        idx += 1;
        render();
      } catch (e) {
        const m = e?.message || String(e);
        const low = m.toLowerCase();

        if (low.includes("poll closed")) {
          showClosed("Sondaż jest zamknięty. Dziękujemy!");
          return;
        }

        alert("Nie udało się oddać głosu. Spróbuj ponownie.");
        b.disabled = false;
      }
    });

    alist.appendChild(b);
  });
}

async function load() {
  if (!gameId || !key) {
    showError("Nieprawidłowy link sondażu.");
    return;
  }

  try {
    const res = await sb().rpc("get_poll_game", { p_game_id: gameId, p_key: key });
    data = res.data;
    idx = 0;
    render();
  } catch (e) {
    showError("Nie udało się wczytać sondażu.");
  }
}

document.addEventListener("DOMContentLoaded", load);
