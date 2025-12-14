// js/pages/display.js
import { startSnapshotPoll } from "../core/realtime.js";
import { fitCanvasToElement, drawLEDText } from "../core/ledrender.js";

const $ = (s) => document.querySelector(s);

const canvas = $("#board");
const statusLine = $("#statusLine");
const btnFullscreen = $("#btnFullscreen");

function setStatus(m){ statusLine.textContent = m; }

function qsParam(name) {
  return new URL(location.href).searchParams.get(name);
}

const gameId = qsParam("id");
const key = qsParam("key");

function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawFrame(ctx, x, y, w, h, stroke, lw) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
}

function drawBoard(snapshot) {
  const { w, h } = fitCanvasToElement(canvas);
  const ctx = canvas.getContext("2d");
  clear(ctx, w, h);

  // lekkie przyciemnienie, żeby LED świeciły
  ctx.fillStyle = "rgba(0,0,0,.10)";
  ctx.fillRect(0, 0, w, h);

  const live = snapshot?.live || {};
  const q = snapshot?.question || null;
  const answers = snapshot?.answers || [];

  const revealed = new Set((live.revealed_answer_ids || []).map(String));
  const strikes = Math.max(0, Math.min(3, Number(live.strikes || 0)));
  const points = Math.max(0, Number(live.round_points || 0));

  // ===========================
  // JEDNA GLOBALNA SIATKA LED
  // ===========================
  const pad = Math.floor(w * 0.035);
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  // Wysokość znaku = 7 komórek LED (5x7 font), więc cellH musi być taki sam wszędzie.
  // Dobieramy cell (kwadrat) tak, aby tablica była gęsta, ale czytelna.
  // Uwaga: to jest "rozmiar diody", więc im większy ekran, tym większy cell.
  const cell = Math.max(6, Math.floor(Math.min(innerW / 190, innerH / 110)));
  const cellW = cell;
  const cellH = cell;

  // wymiary siatki w komórkach
  const gridCols = Math.floor(innerW / cellW);
  const gridRows = Math.floor(innerH / cellH);

  // Offset siatki (centrowanie)
  const gridX = pad + Math.floor((innerW - gridCols * cellW) / 2);
  const gridY = pad + Math.floor((innerH - gridRows * cellH) / 2);

  // Parametry LED (wspólne)
  const LED = {
    fg: "#FFD94A",
    dim: "rgba(255,217,74,.10)",
    gap: 0.20,
    round: 0.42,
  };
  const LED_RED = {
    fg: "#FF6B6B",
    dim: "rgba(255,90,90,.07)",
    gap: 0.22,
    round: 0.40,
  };

  // Ramka główna
  drawFrame(
    ctx,
    gridX,
    gridY,
    gridCols * cellW,
    gridRows * cellH,
    "rgba(231,194,75,.55)",
    Math.max(2, Math.floor(w * 0.003))
  );

  // ===========================
  // LAYOUT W KOMÓRKACH SIATKI
  // (wszystkie napisy: 7 rzędów LED)
  // ===========================
  // Top: pytanie (7 rzędów) + punkty (7 rzędów)
  const topTextRows = 7;        // stałe
  const topPadRows = 2;         // margines
  const topBlockRows = topTextRows + topPadRows; // 9

  // Odpowiedzi: 4 rzędy kafli, każdy kafel ma 7 rzędów + margines
  const tileTextRows = 7;
  const tilePadRows = 2;
  const tileRows = tileTextRows + tilePadRows;   // 9
  const tilesBlockRows = tileRows * 4 + 3;       // + przerwy między kaflami

  // Lewa część: 2 kolumny kafli (1..8)
  // Prawa: kolumna na PUNKTY + BLEDY
  const rightCols = Math.max(34, Math.floor(gridCols * 0.22)); // stały “panel”
  const leftCols = gridCols - rightCols - 2; // -2 na szczeliny

  // Upewnij się, że siatka ma sens
  if (gridCols < 140 || gridRows < 80) {
    // nadal rysujemy, tylko informujemy (na małych ekranach)
    // (ten komunikat tylko w konsoli)
    console.warn("[display] mała siatka:", { gridCols, gridRows, cell });
  }

  // Pozycje w komórkach
  const gapC = 2; // odstęp kolumn
  const gapR = 1; // odstęp wierszy

  const leftXc = 0;
  const rightXc = leftCols + gapC;

  const topYc = 0;
  const tilesYc = topBlockRows + gapR;

  // ===========================
  // PYTANIE (LEWA GÓRA)
  // ===========================
  const questionText = q?.text ? q.text : "WYBIERZ PYTANIE";
  // Ile kolumn na pytanie? (leftCols)
  drawLEDText(
    ctx,
    questionText,
    gridX + (leftXc + 1) * cellW,
    gridY + (topYc + 1) * cellH,
    leftCols - 2,
    7,
    cellW,
    cellH,
    { ...LED, drawDim: true }
  );

  // ===========================
  // PUNKTY (PRAWA GÓRA)
  // ===========================
  // Label
  drawLEDText(
    ctx,
    "PUNKTY",
    gridX + (rightXc + 2) * cellW,
    gridY + (topYc + 1) * cellH,
    rightCols - 4,
    7,
    cellW,
    cellH * 0.55,
    { ...LED, drawDim: false, gap: 0.30, round: 0.55 }
  );

  // value (3 znaki) — TA SAMA WYSOKOŚĆ ZNAKU co reszta
  const scoreStr = String(points).padStart(3, "0").slice(-3);
  drawLEDText(
    ctx,
    scoreStr,
    gridX + (rightXc + 2) * cellW,
    gridY + (topYc + 1 + 3) * cellH,
    rightCols - 4,
    7,
    cellW,
    cellH,
    { ...LED, drawDim: true }
  );

  // ===========================
  // ODP: 8 kafli (2 kolumny × 4 rzędy)
  // ===========================
  const tileGapC = 2;
  const tileGapR = 1;

  const colW = Math.floor((leftCols - tileGapC) / 2);
  const tileCols = colW;

  for (let i = 0; i < 8; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);

    const tileXc = leftXc + col * (tileCols + tileGapC);
    const tileYc = tilesYc + row * (tileRows + tileGapR);

    // Ramka kafla
    drawFrame(
      ctx,
      gridX + tileXc * cellW,
      gridY + tileYc * cellH,
      tileCols * cellW,
      tileRows * cellH,
      "rgba(231,194,75,.40)",
      Math.max(1, Math.floor(w * 0.0018))
    );

    // Numer (1-8)
    drawLEDText(
      ctx,
      String(i + 1),
      gridX + (tileXc + 1) * cellW,
      gridY + (tileYc + 1) * cellH,
      10,
      7,
      cellW,
      cellH,
      { ...LED, drawDim: true }
    );

    const a = answers[i];
    const isRevealed = a ? revealed.has(String(a.id)) : false;

    const txt = a?.text ? a.text : "";
    const pts = a ? (a.fixed_points ?? "") : "";

    // Tekst zaczyna się po numerze
    const textStart = tileXc + 8;
    const textWidth = tileCols - 8 - 14; // zostaw miejsce na punkty
    const ptsStart = tileXc + tileCols - 12;

    if (isRevealed) {
      drawLEDText(
        ctx,
        txt,
        gridX + textStart * cellW,
        gridY + (tileYc + 1) * cellH,
        textWidth,
        7,
        cellW,
        cellH,
        { ...LED, drawDim: true }
      );

      // Punkty (max 3 znaki) — ta sama wysokość
      const ptsStr = String(pts ?? "").slice(0, 3);
      drawLEDText(
        ctx,
        ptsStr,
        gridX + ptsStart * cellW,
        gridY + (tileYc + 1) * cellH,
        12,
        7,
        cellW,
        cellH,
        { ...LED, drawDim: true, gap: 0.18, round: 0.38 }
      );
    } else {
      // Zakryte: tylko dim w obszarze tekstu i punktów
      drawLEDText(
        ctx,
        "",
        gridX + textStart * cellW,
        gridY + (tileYc + 1) * cellH,
        textWidth + 12,
        7,
        cellW,
        cellH,
        { ...LED, drawDim: true }
      );
    }
  }

  // ===========================
  // BŁĘDY (PRAWA DOLNA)
  // ===========================
  // Umieszczamy na dole prawego panelu
  const bottomYc = gridRows - 1 - 7 - 2 - 7; // 2 linie odstępu

  drawLEDText(
    ctx,
    "BLEDY",
    gridX + (rightXc + 2) * cellW,
    gridY + (bottomYc) * cellH,
    rightCols - 4,
    7,
    cellW,
    cellH * 0.55,
    { ...LED, drawDim: false, gap: 0.30, round: 0.55 }
  );

  // Trzy X-y w stałej szerokości
  const x1 = strikes >= 1 ? "X" : " ";
  const x2 = strikes >= 2 ? "X" : " ";
  const x3 = strikes >= 3 ? "X" : " ";
  const xStr = `${x1} ${x2} ${x3}`;

  drawLEDText(
    ctx,
    xStr,
    gridX + (rightXc + 2) * cellW,
    gridY + (bottomYc + 3) * cellH,
    rightCols - 4,
    7,
    cellW,
    cellH,
    { ...(strikes ? LED_RED : { ...LED_RED, fg: "rgba(255,90,90,.25)" }), drawDim: true }
  );
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
    intervalMs: 250,
    onData(data) {
      drawBoard(data);
      setStatus("Na żywo ✔");
    },
    onError(e) {
      console.error(e);
      setStatus("Błąd: " + (e?.message || String(e)));
    },
  });
});
