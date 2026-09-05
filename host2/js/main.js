// host2/js/main.js
// Napisane od zera (nie kopia js/pages/host.js) — mniej tu do zrobienia niż
// w Display, bo Host nie ma własnego silnika rysowania: to render.js robi
// operacje DOM wprost na podstawie wiersza game_state. Gest przesunięcia
// (peek na pasmo 2) zostaje jako czysto lokalna wygoda — patrz komentarz w
// render.js — nie próbowaliśmy tu odtwarzać dokładnej matematyki CSS
// snap-to-grid z dzisiejszego host.js (kosmetyka do dostrojenia wizualnie
// później, nie architektura).

import { initI18n } from "../../translation/translation.js?v=v2026-09-05T18380";
import { startKeepAlive } from "../../js/core/keep-alive.js?v=v2026-09-05T18380";
import { sb } from "../../js/core/supabase.js?v=v2026-09-05T18380";
import { createSubscription } from "../../js/core/game-state-subscribe.js?v=v2026-09-05T18380";
import { createHostRenderer } from "./render.js?v=v2026-09-05T18380";

startKeepAlive();

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "" };
}

function startPresenceHeartbeat({ gameId, key }, pingMs = 3000) {
  const DEVICE_ID_KEY = "familiada:deviceId:host";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
  const ping = async () => {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId, p_device_type: "host", p_key: key, p_device_id: deviceId, p_meta: {},
    });
    if (!error && data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  };
  ping();
  setInterval(ping, pingMs);
}

// css/host.css pozycjonuje .text (paperText1/2) jako position:absolute, a
// jego left/right SĄ ZDEFINIOWANE WYŁĄCZNIE pod selektorami
// `html.portrait .pane1 .text`/`html.landscape .pane1 .text` — bez tej
// klasy na <html> tekst nie ma żadnego left/right w ogóle. To nie kosmetyka
// do dostrojenia później, tylko wymóg funkcjonalny, żeby cokolwiek się
// wyświetliło (znalezione przez pierwszy przebieg control2-pairing.spec.js
// na żywo: #paperText1 istniał w DOM, ale toBeVisible() padało — zero
// wymiarów bez tej klasy).
function setupOrientationClass() {
  function apply() {
    const portrait = window.innerHeight >= window.innerWidth;
    document.documentElement.classList.toggle("portrait", portrait);
    document.documentElement.classList.toggle("landscape", !portrait);

    // html.landscape .pane1 .text czyta --outer-left/--outer-right (patrz
    // css/host.css) — bez nich left/right w landscape jest niepoprawnym
    // calc() i cała reguła pozycjonująca zostaje zignorowana.
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const safeL = parseFloat(cs.getPropertyValue("--safe-left")) || 0;
    const safeR = parseFloat(cs.getPropertyValue("--safe-right")) || 0;
    if (!portrait) {
      root.style.setProperty("--outer-left", `${safeL}px`);
      root.style.setProperty("--outer-right", `${safeR}px`);
    } else {
      root.style.setProperty("--outer-left", "0px");
      root.style.setProperty("--outer-right", "0px");
    }
  }
  apply();
  window.addEventListener("resize", apply);
}

function setupFullscreenButton() {
  const btn = document.getElementById("btnFS");
  const ico = document.getElementById("fsIco");
  function syncIcon() { if (ico) ico.textContent = document.fullscreenElement ? "⧉" : "▢"; }
  btn?.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    } catch {}
    syncIcon();
  });
  document.addEventListener("fullscreenchange", syncIcon);
}

function setupPeekSwipe(renderer) {
  let sx = 0, sy = 0, active = false;
  const MIN = 60;
  document.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; active = true; }, { passive: true });
  document.addEventListener("pointerup", (e) => {
    if (!active) return;
    active = false;
    if (!renderer.isCoverableAtAll()) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.hypot(dx, dy) < MIN) return;
    renderer.setPeek(!renderer.isCovered());
  }, { passive: true });
}

async function main() {
  await initI18n({ withSwitcher: false });
  setupFullscreenButton();
  setupOrientationClass();
  document.documentElement.classList.remove("page-loading");

  const { gameId, key } = parseParams();
  if (!gameId || !key) return;

  startPresenceHeartbeat({ gameId, key });
  const renderer = createHostRenderer();
  setupPeekSwipe(renderer);

  const subscription = createSubscription({
    gameId, deviceType: "host", key,
    onRow: (row) => renderer.render(row),
    onError: (error) => console.warn("[host2] game_state_get failed:", error),
  });
  await subscription.start();
}

main();
