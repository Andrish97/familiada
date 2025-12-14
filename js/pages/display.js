import { startSnapshotPoll } from "../core/realtime.js";

const $ = (s) => document.querySelector(s);

const statusLine = $("#statusLine");
const questionText = $("#questionText");
const answersGrid = $("#answersGrid");
const roundPoints = $("#roundPoints");
const strikesX = $("#strikesX");
const btnFullscreen = $("#btnFullscreen");

function setStatus(msg) { if (statusLine) statusLine.textContent = msg; }

function qsParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

const gameId = qsParam("id");
const key = qsParam("key");

function applyStrikes(n) {
  const xs = strikesX?.querySelectorAll(".x") || [];
  xs.forEach((el, i) => el.classList.toggle("on", i < (n || 0)));
}

function makeAnswerTile(idx, text, points, revealed) {
  const el = document.createElement("div");
  el.className = "answer" + (revealed ? " reveal" : " hidden");
  el.innerHTML = `
    <div class="idx">${idx}</div>
    <div class="txt">${text ?? ""}</div>
    <div class="pts">${points ?? ""}</div>
  `;
  if (revealed) setTimeout(() => el.classList.remove("reveal"), 240);
  return el;
}

function render(snapshot) {
  const live = snapshot?.live || {};
  const q = snapshot?.question || null;
  const answers = snapshot?.answers || [];

  questionText.textContent = q?.text ? q.text : "Wybierz pytanie…";
  roundPoints.textContent = String(live.round_points ?? 0);
  applyStrikes(live.strikes ?? 0);

  const revealedIds = new Set((live.revealed_answer_ids || []).map(String));

  answersGrid.innerHTML = "";
  const maxTiles = Math.max(answers.length, 8);

  for (let i = 0; i < maxTiles; i++) {
    const a = answers[i];
    const revealed = a ? revealedIds.has(String(a.id)) : false;
    const pts = a ? (a.fixed_points ?? "") : "";
    answersGrid.appendChild(makeAnswerTile(i + 1, a?.text ?? "", pts, revealed));
  }
}

btnFullscreen?.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});

document.addEventListener("DOMContentLoaded", () => {
  if (!gameId || !key) {
    setStatus("Brak parametrów. Otwórz: display.html?id=...&key=...");
    return;
  }

  setStatus("Łączenie…");

  startSnapshotPoll({
    gameId,
    key,
    kind: "display",
    intervalMs: 350,
    onData(data) {
      render(data);
      setStatus("Na żywo ✔");
    },
    onError(e) {
      console.error(e);
      setStatus("Błąd: " + (e?.message || String(e)));
    },
  });
});
