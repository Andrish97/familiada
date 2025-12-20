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
let busy = false;

function showBox(on){
  qbox.style.display = on ? "" : "none";
  closed.style.display = on ? "none" : "";
}

function showClosed(msg){
  showBox(false);
  closed.textContent = msg || "Sondaż jest zamknięty. Dziękujemy!";
  sub.textContent = "Ten sondaż nie przyjmuje już głosów.";
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
  if (g.type !== "poll_points") return showError("To nie jest sondaż punktowany.");
  if (g.status !== "poll_open") return showClosed("Sondaż jest zamknięty. Dziękujemy!");

  const qlist = data?.questions || [];
  if (!qlist.length) return showError("Brak pytań do głosowania.");

  if (idx >= qlist.length) {
    sub.textContent = "Dzięki! Oddałeś(aś) głos na wszystkie pytania.";
    showBox(false);
    closed.textContent = "Dziękujemy za udział w sondażu!";
    return;
  }

  const q = qlist[idx];
  const answers = q?.answers || [];
  if (!answers.length) return showError("Błąd: pytanie bez odpowiedzi.");

  showBox(true);
  sub.textContent = "Wybierz odpowiedź, która najbardziej pasuje.";
  qtext.textContent = q.text || "—";
  prog.textContent = `Pytanie ${idx + 1} / ${qlist.length}`;

  alist.innerHTML = "";
  for (const a of answers) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "abtn";
    b.textContent = a.text;

    b.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      b.disabled = true;

      try {
        const { error } = await sb().rpc("poll_vote_points", {
          p_game_id: gameId,
          p_key: key,
          p_question_id: q.id,
          p_answer_id: a.id,
          p_voter_token: token(),
        });
        if (error) throw error;

        idx += 1;
        busy = false;
        render();
      } catch (e) {
        busy = false;
        const m = (e?.message || String(e)).toLowerCase();
        if (m.includes("poll closed")) return showClosed("Sondaż jest zamknięty. Dziękujemy!");
        alert("Nie udało się oddać głosu. Spróbuj ponownie.");
        b.disabled = false;
      }
    });

    alist.appendChild(b);
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

document.addEventListener("DOMContentLoaded", load);
