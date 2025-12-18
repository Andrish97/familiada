import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnFS = document.getElementById("btnFS");
const cover = document.getElementById("cover");
const qEl = document.getElementById("q");
const alist = document.getElementById("alist");

let isHidden = false;

function setHidden(on){
  isHidden = !!on;
  cover.classList.toggle("on", isHidden);
  cover.setAttribute("aria-hidden", isHidden ? "false" : "true");
}

function setFsIcon(){
  const on = !!document.fullscreenElement;
  btnFS.textContent = on ? "⧉" : "▢";
  btnFS.setAttribute("aria-label", on ? "Wyjdź z pełnego ekranu" : "Pełny ekran");
}

btnFS.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});
document.addEventListener("fullscreenchange", setFsIcon);

function blockScrollAndRefresh(){
  // blokuj scroll kółkiem / touchmove
  window.addEventListener("wheel", (e) => e.preventDefault(), { passive:false });
  window.addEventListener("touchmove", (e) => e.preventDefault(), { passive:false });
}

function installHideGesture(){
  let active = false;
  let startY = 0;
  let startX = 0;

  const TOP_GUARD = 70;   // “nie na samej górze”
  const BOT_GUARD = 90;   // “nie na samym dole”
  const THRESH = 60;      // ile trzeba przeciągnąć

  const onDown = (e) => {
    const p = e.touches?.[0] || e;
    const y = p.clientY;
    const x = p.clientX;

    const h = window.innerHeight || 0;
    if (y < TOP_GUARD) return;
    if (y > (h - BOT_GUARD)) return;

    active = true;
    startY = y;
    startX = x;
  };

  const onMove = (e) => {
    if (!active) return;
    const p = e.touches?.[0] || e;
    const dy = p.clientY - startY;
    const dx = p.clientX - startX;

    // ignoruj “poziome” machnięcia
    if (Math.abs(dx) > Math.abs(dy)) return;

    // w górę = ukryj
    if (!isHidden && dy < -THRESH) {
      setHidden(true);
      active = false;
    }

    // w dół = pokaż
    if (isHidden && dy > THRESH) {
      setHidden(false);
      active = false;
    }
  };

  const onUp = () => { active = false; };

  window.addEventListener("touchstart", onDown, { passive:true });
  window.addEventListener("touchmove", onMove, { passive:true });
  window.addEventListener("touchend", onUp, { passive:true });

  window.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

async function ping(){
  try {
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "host", p_key: key });
  } catch {}
}

async function loadSnapshot(){
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
      row.innerHTML = `<span>${a.text || ""}</span><span>${typeof a.fixed_points === "number" ? a.fixed_points : 0} pkt</span>`;
      alist.appendChild(row);
    });
  } catch {
    qEl.textContent = "Brak danych / błąd połączenia.";
    alist.innerHTML = "";
  }
}

/** Komendy z control: familliada-host:${id} event HOST_CMD payload {line} */
function installHostCommands(){
  const ch = sb()
    .channel(`familiada-host:${gameId}`)
    .on("broadcast", { event: "HOST_CMD" }, async (payload) => {
      const line = String(payload?.payload?.line || "").trim();

      // SEND "..." / SEND ...
      if (/^SEND\b/i.test(line)) {
        const m = line.match(/^SEND\s+(.+)$/i);
        let txt = (m?.[1] ?? "").trim();
        // obsługa cudzysłowów
        if ((txt.startsWith('"') && txt.endsWith('"')) || (txt.startsWith("'") && txt.endsWith("'"))) {
          txt = txt.slice(1, -1);
        }
        qEl.textContent = txt || "";
        return;
      }

      // MODE OFF / MODE ON (opcjonalnie)
      if (/^MODE\s+OFF$/i.test(line)) { setHidden(true); return; }
      if (/^MODE\s+ON$/i.test(line))  { setHidden(false); return; }

      // RESET = odśwież snapshot
      if (/^RESET$/i.test(line)) { await loadSnapshot(); return; }
    })
    .subscribe();

  return () => sb().removeChannel(ch);
}

function subLive(){
  const ch = sb()
    .channel(`host_live:${gameId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      () => loadSnapshot()
    )
    .subscribe();

  return () => sb().removeChannel(ch);
}

document.addEventListener("DOMContentLoaded", async () => {
  setFsIcon();
  blockScrollAndRefresh();
  installHideGesture();

  if (!gameId || !key) {
    qEl.textContent = "Zły link.";
    return;
  }

  installHostCommands();

  // fallback: stare działanie dalej żyje
  await ping();
  await loadSnapshot();
  subLive();
  setInterval(ping, 5000);
});
