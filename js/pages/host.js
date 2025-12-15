// js/pages/host.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnHide = document.getElementById("btnHide");
const cover = document.getElementById("cover");

const qEl = document.getElementById("q");
const alist = document.getElementById("alist");

function showCover(on) {
  cover.style.display = on ? "" : "none";
}
btnHide.addEventListener("click", () => showCover(true));
cover.addEventListener("click", () => showCover(false));

async function ping() {
  try {
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "host", p_key: key });
  } catch {}
}

async function loadSnapshot() {
  try {
    const { data } = await sb().rpc("get_public_snapshot", {
      p_game_id: gameId,
      p_kind: "host",
      p_key: key,
    });

    const q = data?.question;
    const ans = data?.answers || [];

    qEl.textContent = q?.text || "—";
    alist.innerHTML = "";

    ans.forEach((a) => {
      const row = document.createElement("div");
      row.className = "a";
      row.innerHTML = `<span>${a.text}</span><span style="opacity:.7">${typeof a.fixed_points === "number" ? a.fixed_points : 0} pkt</span>`;
      alist.appendChild(row);
    });
  } catch {
    qEl.textContent = "Brak danych / błąd połączenia.";
    alist.innerHTML = "";
  }
}

function subLive() {
  const ch = sb()
    .channel(`host_live:${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      () => loadSnapshot()
    )
    .subscribe();

  return () => sb().removeChannel(ch);
}

document.addEventListener("DOMContentLoaded", () => {
  if (!gameId || !key) {
    qEl.textContent = "Zły link.";
    return;
  }

  ping();
  loadSnapshot();
  subLive();

  setInterval(ping, 5000);
});
