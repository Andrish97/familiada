import { requireAuth, signOut } from "../../js/core/auth.js";
import { loadGameBasic, validateGameReadyToPlay } from "../../js/core/game-validate.js";

import { createDevices } from "./devices.js";
import { createDisplayDriver } from "./display.js";
import { createGameUI } from "./game.js";

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

function setMsg(el, text) { if (el) el.textContent = text || ""; }

function initTabs() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const tab = b.dataset.tab;
      document.querySelectorAll("[data-panel]").forEach((p) => (p.style.display = "none"));
      const panel = document.querySelector(`[data-panel="${tab}"]`);
      if (panel) panel.style.display = "";
    });
  });
}

async function loadGameOrThrow() {
  if (!gameId) throw new Error("Brak ?id w URL.");

  const basic = await loadGameBasic(gameId);
  const v = await validateGameReadyToPlay(gameId);
  if (!v.ok) throw new Error(`Ta gra nie jest gotowa do PLAY: ${v.reason}`);

  // basic już ma minimalne dane; devices i linki biorą pełne z core (masz w validate)
  return basic;
}

async function main() {
  initTabs();

  const who = $("who");
  const btnBack = $("btnBack");
  const btnLogout = $("btnLogout");
  const gameLabel = $("gameLabel");
  const gameMeta = $("gameMeta");

  const msgDevices = $("msgDevices");
  const msgGame = $("msgGame");

  btnBack?.addEventListener("click", () => (location.href = "/familiada/builder.html"));
  btnLogout?.addEventListener("click", async () => {
    await signOut().catch(() => {});
    location.href = "/familiada/index.html";
  });

  const user = await requireAuth("/familiada/index.html");
  if (who) who.textContent = user?.email || user?.id || "—";

  const game = await loadGameOrThrow();

  if (gameLabel) gameLabel.textContent = `Control — ${game.name}`;
  if (gameMeta) gameMeta.textContent = `${game.type} / ${game.status} / ${game.id}`;

  const devices = createDevices({ gameId: game.id, setMsgDevices: (t) => setMsg(msgDevices, t) });
  await devices.init(); // robi linki, presence polling, buzzer evt log

  const display = createDisplayDriver({ devices });

  createGameUI({
    display,
    setMsgGame: (t) => setMsg(msgGame, t),
  });
}

main().catch((e) => {
  const msgDevices = $("msgDevices");
  setMsg(msgDevices, e?.message || String(e));
});
