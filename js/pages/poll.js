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

function token(){
  const k = `fam_poll_token_${gameId}`;
  let t = localStorage.getItem(k);
  if(!t){
    t = Math.random().toString(16).slice(2) + Date.now().toString(16);
    localStorage.setItem(k, t);
  }
  return t;
}

let data = null;
let idx = 0;

function showClosed(){
  qbox.style.display = "none";
  closed.style.display = "block";
  sub.textContent = "Ten sondaż już nie przyjmuje głosów.";
}

function render(){
  const g = data?.game;
  title.textContent = g?.name ? `Sondaż: ${g.name}` : "Sondaż";
  if(g?.status !== "poll_open"){
    showClosed();
    return;
  }

  const qs = data.questions || [];
  if(!qs.length){
    sub.textContent = "Brak pytań.";
    qbox.style.display = "none";
    return;
  }

  if(idx >= qs.length){
    sub.textContent = "Dzięki! Oddałeś(aś) głos na wszystkie pytania.";
    qbox.style.display = "none";
    closed.style.display = "block";
    closed.textContent = "Dziękujemy za udział w sondażu!";
    return;
  }

  const q = qs[idx];
  sub.textContent = "Wybierz odpowiedź, która najbardziej pasuje.";
  qbox.style.display = "block";
  closed.style.display = "none";

  qtext.textContent = q.text;
  prog.textContent = `Pytanie ${idx+1} / ${qs.length}`;

  alist.innerHTML = "";
  (q.answers || []).forEach(a=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "abtn";
    b.textContent = a.text;

    b.addEventListener("click", async ()=>{
      try{
        await sb().rpc("poll_vote_game", {
          p_game_id: gameId,
          p_key: key,
          p_question_id: q.id,
          p_answer_id: a.id,
          p_voter_token: token(),
        });

        idx += 1;
        render();
      }catch(e){
        const m = e?.message || String(e);
        if(m.toLowerCase().includes("poll closed")){
          showClosed();
          return;
        }
        alert("Nie udało się oddać głosu. Spróbuj ponownie.");
      }
    });

    alist.appendChild(b);
  });
}

async function load(){
  if(!gameId || !key){
    sub.textContent = "Nieprawidłowy link.";
    return;
  }

  try{
    const res = await sb().rpc("get_poll_game", { p_game_id: gameId, p_key: key });
    data = res.data;
    render();
  }catch(e){
    sub.textContent = "Nie udało się wczytać sondażu.";
  }
}

document.addEventListener("DOMContentLoaded", load);
