import { sb } from "../core/supabase.js";
import { startSnapshotPoll } from "../core/realtime.js";

const $ = (s) => document.querySelector(s);

const gameName = $("#gameName");
const status = $("#status");
const roundPoints = $("#roundPoints");
const strikes = $("#strikes");
const answersBox = $("#answers");

const pMinus = $("#pMinus");
const pPlus = $("#pPlus");
const pReset = $("#pReset");
const sMinus = $("#sMinus");
const sPlus = $("#sPlus");
const sReset = $("#sReset");
const revealNext = $("#revealNext");
const hideAll = $("#hideAll");
const fs = $("#fs");

function qsParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

const gameId = qsParam("id");
const key = qsParam("key");

let snapshot = null;

function setStatus(m){ status.textContent = m; }

async function patchLive(patch) {
  const { error } = await sb().rpc("remote_update_live", {
    p_game_id: gameId,
    p_key: key,
    p_patch: patch,
  });
  if (error) throw error;
}

function render() {
  if (!snapshot) return;

  gameName.textContent = snapshot?.game?.name || "—";

  const live = snapshot.live || {};
  const answers = snapshot.answers || [];
  const revealed = new Set((live.revealed_answer_ids || []).map(String));

  roundPoints.textContent = String(live.round_points ?? 0);
  strikes.textContent = String(live.strikes ?? 0);

  answersBox.innerHTML = "";
  answers.forEach((a, idx) => {
    const isOn = revealed.has(String(a.id));
    const el = document.createElement("div");
    el.className = "a" + (isOn ? " revealed" : "");
    el.innerHTML = `
      <div class="t">${idx + 1}. ${a.text}</div>
      <button class="pill" type="button">${isOn ? "Ukryj" : "Odkryj"}</button>
    `;
    el.querySelector(".pill").addEventListener("click", async () => {
      const next = new Set(revealed);
      if (isOn) next.delete(String(a.id));
      else next.add(String(a.id));
      await patchLive({ revealed_answer_ids: Array.from(next) });
    });
    answersBox.appendChild(el);
  });
}

function firstHiddenAnswerId() {
  const live = snapshot?.live || {};
  const answers = snapshot?.answers || [];
  const revealed = new Set((live.revealed_answer_ids || []).map(String));
  return answers.map(a => String(a.id)).find(id => !revealed.has(id)) || null;
}

document.addEventListener("DOMContentLoaded", () => {
  if (!gameId || !key) {
    setStatus("Brak parametrów. Otwórz: remote.html?id=...&key=...");
    return;
  }

  setStatus("Łączenie…");

  startSnapshotPoll({
    gameId,
    key,
    kind: "remote",
    intervalMs: 350,
    onData(data) {
      snapshot = data;
      render();
      setStatus("Na żywo ✔");
    },
    onError(e) {
      console.error(e);
      setStatus("Błąd: " + (e?.message || String(e)));
    }
  });

  // Punktacja
  pMinus.addEventListener("click", async () => {
    const v = (snapshot?.live?.round_points ?? 0) - 10;
    await patchLive({ round_points: Math.max(0, v) });
  });
  pPlus.addEventListener("click", async () => {
    const v = (snapshot?.live?.round_points ?? 0) + 10;
    await patchLive({ round_points: v });
  });
  pReset.addEventListener("click", async () => {
    await patchLive({ round_points: 0 });
  });

  // Strikes
  sMinus.addEventListener("click", async () => {
    const v = (snapshot?.live?.strikes ?? 0) - 1;
    await patchLive({ strikes: Math.max(0, v) });
  });
  sPlus.addEventListener("click", async () => {
    const v = (snapshot?.live?.strikes ?? 0) + 1;
    await patchLive({ strikes: Math.min(3, v) });
  });
  sReset.addEventListener("click", async () => {
    await patchLive({ strikes: 0 });
  });

  // Odpowiedzi
  revealNext.addEventListener("click", async () => {
    const id = firstHiddenAnswerId();
    if (!id) return;
    const current = new Set((snapshot?.live?.revealed_answer_ids || []).map(String));
    current.add(String(id));
    await patchLive({ revealed_answer_ids: Array.from(current) });
  });

  hideAll.addEventListener("click", async () => {
    await patchLive({ revealed_answer_ids: [] });
  });

  fs.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });
});

