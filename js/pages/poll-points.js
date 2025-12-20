// js/pages/poll-points.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const key = qs.get("key");          // najważniejsze
const gameId = qs.get("id") || null; // opcjonalne (nie wymagamy)

const title = document.getElementById("title");
const sub = document.getElementById("sub");
const qbox = document.getElementById("qbox");
const qtext = document.getElementById("qtext");
const alist = document.getElementById("alist");
const prog = document.getElementById("prog");
const closed = document.getElementById("closed");

function voterToken() {
  const k = `fam_poll_token_${key || gameId || "x"}`;
  let t = localStorage.getItem(k);
  if (!t) {
    // >= 8 znaków (constraint pv_token_len)
    t = (Math.random().toString(16).slice(2) + Date.now().toString(16)).padEnd(12, "0");
    localStorage.setItem(k, t);
  }
  return t;
}

let bundle = null;
let idx = 0;
let busy = false;

function showBox(on) {
  qbox.style.display = on ? "" : "none";
  closed.style.display = on ? "none" : "";
}

function showClosed(msg) {
  showBox(false);
  closed.textContent = msg || "Sondaż jest zamknięty. Dziękujemy!";
  sub.textContent = "Ten sondaż nie przyjmuje już głosów.";
}

function showError(msg) {
  showBox(false);
  closed.textContent = msg || "Nie udało się wczytać sondażu.";
  sub.textContent = "—";
}

function render() {
  const g = bundle?.game;
  const qlist = bundle?.questions || [];

  title.textContent = g?.name ? `Sondaż: ${g.name}` : "Sondaż";

  if (!g) return showError("Brak danych gry.");
  if (g.status !== "poll_open") return showClosed("Sondaż jest zamknięty. Dziękujemy!");
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
    b.textContent = a.text || "—";

    b.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      b.disabled = true;

      try {
        const qOrd = Number(q.ord);
        const aOrd = Number(a.ord);
        if (!Number.isFinite(qOrd) || !Number.isFinite(aOrd)) {
          throw new Error("Błędne ORD w danych sondażu.");
        }

        const { error } = await sb().rpc("poll_vote", {
          p_key: key,
          p_question_ord: qOrd,
          p_answer_ord: aOrd,
          p_voter_token: voterToken(),
        });

        if (error) throw error;

        idx += 1;
        busy = false;
        render();
      } catch (e) {
        busy = false;

        const m = String(e?.message || e).toLowerCase();
        if (m.includes("closed") || m.includes("poll closed")) {
          return showClosed("Sondaż jest zamknięty. Dziękujemy!");
        }

        alert("Nie udało się oddać głosu. Spróbuj ponownie.");
        b.disabled = false;
      }
    });

    alist.appendChild(b);
  }
}

async function load() {
  if (!key) return showError("Nieprawidłowy link sondażu (brak key).");

  try {
    const res = await sb().rpc("get_poll_bundle", { p_key: key });
    bundle = res.data;
    idx = 0;
    render();
  } catch (e) {
    console.error("[poll-points] load error:", e);
    showError("Nie udało się wczytać sondażu.");
  }
}

document.addEventListener("DOMContentLoaded", load);
