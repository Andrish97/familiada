import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnFS = document.getElementById("btnFS");
const cover = document.getElementById("cover");
const qEl = document.getElementById("q");
const alist = document.getElementById("alist");

function showCover(on) {
  cover.classList.toggle("on", !!on);
  cover.setAttribute("aria-hidden", on ? "false" : "true");
}

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
      row.innerHTML = `
        <span class="aTxt">${a.text || "—"}</span>
        <span class="aPts">${typeof a.fixed_points === "number" ? a.fixed_points : 0} pkt</span>
      `;
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

/* fullscreen: stan + ikonka */
async function syncFSIcon() {
  btnFS?.classList.toggle("on", !!document.fullscreenElement);
}
btnFS?.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
  syncFSIcon();
});
document.addEventListener("fullscreenchange", syncFSIcon);

/* swipe/drag: działa wszędzie, ale nie przy samej górze i dole */
function setupSwipeHide() {
  const SAFE_TOP = 70;
  const SAFE_BOT = 70;
  const THRESH = 80;

  let startY = null;
  let startX = null;
  let armed = false;

  const isInSafeZone = (y) => {
    const h = window.innerHeight || 0;
    return y > SAFE_TOP && y < (h - SAFE_BOT);
  };

  const onDown = (x, y) => {
    if (!isInSafeZone(y)) return;
    startY = y; startX = x; armed = true;
  };

  const onMove = (x, y) => {
    if (!armed || startY == null || startX == null) return;

    const dy = y - startY;
    const dx = x - startX;

    if (Math.abs(dx) > Math.abs(dy) * 1.2) return;

    if (dy > THRESH) { showCover(false); armed = false; }
    else if (dy < -THRESH) { showCover(true); armed = false; }
  };

  const onUp = () => { startY = null; startX = null; armed = false; };

  window.addEventListener("touchstart", (e) => {
    const t = e.touches?.[0]; if (!t) return;
    onDown(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const t = e.touches?.[0]; if (!t) return;
    onMove(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener("touchend", onUp, { passive: true });

  window.addEventListener("mousedown", (e) => onDown(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", onUp);
}

document.addEventListener("DOMContentLoaded", async () => {
  syncFSIcon();
  setupSwipeHide();

  if (!gameId || !key) {
    qEl.textContent = "Zły link.";
    return;
  }

  // startowo: pokazane
  showCover(false);

  ping();
  loadSnapshot();
  subLive();

  setInterval(ping, 5000);
});
