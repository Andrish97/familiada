import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnHide = document.getElementById("btnHide");
const cover = document.getElementById("cover");

const qEl = document.getElementById("q");
const alist = document.getElementById("alist");

function toggleCover(force){
  const show = typeof force === "boolean" ? force : (cover.style.display === "none");
  cover.style.display = show ? "" : "none";
}

btnHide.addEventListener("click", ()=>toggleCover(true));
cover.addEventListener("click", ()=>toggleCover(false));

async function ping(){
  try{
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "host", p_key: key });
  }catch{}
}

async function loadSnapshot(){
  try{
    // korzystamy z Twojego istniejącego RPC snapshotu (remote/display) – kind=remote z share_key_remote
    const { data } = await sb().rpc("get_public_snapshot", {
      p_game_id: gameId,
      p_kind: "remote",
      p_key: key,
    });

    const q = data?.question;
    const ans = data?.answers || [];

    qEl.textContent = q?.text || "—";
    alist.innerHTML = "";

    ans.forEach((a)=>{
      const row = document.createElement("div");
      row.className = "a";
      row.innerHTML = `<span>${a.text}</span><span style="opacity:.7">${typeof a.fixed_points === "number" ? a.fixed_points : 0} pkt</span>`;
      alist.appendChild(row);
    });
  }catch{
    qEl.textContent = "Brak danych / błąd połączenia.";
    alist.innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  if(!gameId || !key){
    qEl.textContent = "Zły link.";
    return;
  }

  ping();
  loadSnapshot();

  setInterval(ping, 5000);
  setInterval(loadSnapshot, 700);
});
