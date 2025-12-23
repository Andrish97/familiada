import { requireAuth, signOut } from "../../js/core/auth.js";
import { unlockAudio, isAudioUnlocked } from "../../js/core/sfx.js";
import { validateGameReadyToPlay, loadGameBasic } from "../../js/core/game-validate.js";
import { sb } from "../../js/core/supabase.js";

import { createDevicesController } from "./devices.js";
import { createQuestionsController } from "./questions.js";
import { createGameController } from "./game.js";

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

const gameLabel = $("gameLabel");
const gameMeta = $("gameMeta");

const btnUnlockAudio = $("btnUnlockAudio");
const audioStatus = $("audioStatus");

// tabs
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

function refreshAudioStatus() {
  if (!audioStatus) return;
  const ok = !!isAudioUnlocked?.();
  audioStatus.textContent = ok ? "OK" : "ZABLOKOWANE";
  audioStatus.className = "badge " + (ok ? "ok" : "bad");
}

btnUnlockAudio?.addEventListener("click", () => {
  unlockAudio?.();
  refreshAudioStatus();
});

// auth + game load (minimalnie)
async function ensureAuthOrRedirect() {
  const user = await requireAuth("/familiada/index.html");
  if (who) who.textContent = user?.email || user?.id || "—";
  return user;
}

async function loadGameOrThrow() {
  if (!gameId) throw new Error("Brak ?id w URL.");

  const basic = await loadGameBasic(gameId);

  const v = await validateGameReadyToPlay(gameId);
  if (!v.ok) throw new Error(`Ta gra nie jest gotowa do PLAY: ${v.reason}`);

  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_buzzer")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (data?.id !== basic.id) throw new Error("Rozjazd danych gry (validate vs games).");
  return data;
}

btnBack?.addEventListener("click", () => (location.href = "/familiada/builder.html"));
btnLogout?.addEventListener("click", async () => {
  await signOut().catch(() => {});
  location.href = "/familiada/index.html";
});

async function main() {
  await ensureAuthOrRedirect();
  const game = await loadGameOrThrow();

  if (gameLabel) gameLabel.textContent = `Control — ${game.name}`;
  if (gameMeta) gameMeta.textContent = `${game.type} / ${game.status} / ${game.id}`;

  refreshAudioStatus();

  // Devices: presence + linki + resend last + buzzer log
  const devices = createDevicesController({ game });

  // Questions: loader + cache + select
  const questions = createQuestionsController({ game });

  // Game: state machine + display/host/buzzer driver
  const g = createGameController({ game, devices, questions });

  // start
  await devices.start();
  await questions.start();
  await g.start();

  // expose (debug minimalny; możesz usunąć)
  window.__ctl = { devices, questions, g };
}

main().catch((e) => {
  console.error(e);
  const msgGame = $("msgGame");
  if (msgGame) msgGame.textContent = e?.message || String(e);
});
