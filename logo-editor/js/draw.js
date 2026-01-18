// familiada/logo-editor/js/draw.js
// Tryb: DRAW (Fabric.js) -> eksport do PIX_150x70 (bits)

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  const DOT_W = ctx.DOT_W;
  const DOT_H = ctx.DOT_H;

  // DOM
  const paneDraw = document.getElementById("paneDraw");
  const drawCanvasEl = document.getElementById("drawCanvas");
  const miniEl = document.getElementById("drawMini");

  const btnToolSelect = document.getElementById("btnToolSelect");
  const btnToolPan = document.getElementById("btnToolPan");
  const btnToolPencil = document.getElementById("btnToolPencil");
  const btnToolEraser = document.getElementById("btnToolEraser");
  const btnToolLine = document.getElementById("btnToolLine");
  const btnToolRect = document.getElementById("btnToolRect");
  const btnToolEllipse = document.getElementById("btnToolEllipse");
  const btnToolPoly = document.getElementById("btnToolPoly");

  const btnUndo = document.getElementById("btnUndo");
  const btnRedo = document.getElementById("btnRedo");
  const btnClear = document.getElementById("btnClear");

  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoom100 = document.getElementById("btnZoom100");
  const btnZoomFit = document.getElementById("btnZoomFit");

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };

  // Fabric state
  let fcanvas = null;
  let tool = "SELECT"; // SELECT | PAN | PENCIL | ERASER | LINE | RECT | ELLIPSE | POLY
  let zoom = 1;

  // shape temp state
  let isDown = false;
  let start = { x: 0, y: 0 };
  let tempObj = null;

  // polygon temp
  let polyPoints = [];
  let tempPoly = null;

  // undo/redo
  let history = [];
  let histIndex = -1;
  let isRestoring = false;
  let pushTimer = null;

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function syncToolButtons() {
    setBtnOn(btnToolSelect, tool === "SELECT");
    setBtnOn(btnToolPan, tool === "PAN");
    setBtnOn(btnToolPencil, tool === "PENCIL");
    setBtnOn(btnToolEraser, tool === "ERASER");
    setBtnOn(btnToolLine, tool === "LINE");
    setBtnOn(btnToolRect, tool === "RECT");
    setBtnOn(btnToolEllipse, tool === "ELLIPSE");
    setBtnOn(btnToolPoly, tool === "POLY");
  }

  function requireFabric() {
    if (!window.fabric) throw new Error("Brak Fabric.js (script nie wczytany).");
    return window.fabric;
  }

  function installFabricOnce() {
    if (fcanvas) return;

    const fabric = requireFabric();
    if (!drawCanvasEl) throw new Error("Brak #drawCanvas");

    fcanvas = new fabric.Canvas(drawCanvasEl, {
      backgroundColor: "#000",
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      enableRetinaScaling: false, // ważne dla 150x70
    });

    // twarde wymiary robocze
    fcanvas.setWidth(DOT_W);
    fcanvas.setHeight(DOT_H);

    // domyślnie: białe obrysy
    fcanvas.freeDrawingBrush = new fabric.PencilBrush(fcanvas);
    fcanvas.freeDrawingBrush.width = 6;
    fcanvas.freeDrawingBrush.color = "#fff";

    // events -> history + preview
    const onChange = () => {
      if (isRestoring) return;
      ctx.markDirty?.();
      scheduleHistoryPush();
      schedulePreview();
    };

    fcanvas.on("object:added", onChange);
    fcanvas.on("object:modified", onChange);
    fcanvas.on("object:removed", onChange);
    fcanvas.on("path:created", onChange);

    // start state
    resetView();
    pushHistoryNow();
    schedulePreview();
  }

  function resetView() {
    if (!fcanvas) return;
    zoom = 1;
    fcanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fcanvas.requestRenderAll();
  }

  function zoomAtCenter(factor) {
    if (!fcanvas) return;
    const nz = Math.max(0.25, Math.min(20, zoom * factor));
    const center = fcanvas.getCenter();
    fcanvas.zoomToPoint(new window.fabric.Point(center.left, center.top), nz);
    zoom = nz;
    fcanvas.requestRenderAll();
  }

  function zoomTo100() {
    if (!fcanvas) return;
    resetView();
  }

  function zoomFit() {
    if (!fcanvas) return;
    // dopasuj widok do kontenera (drawCanvasEl jest skalowany CSS)
    // tu “fit” sensownie znaczy: reset (bo płótno ma stałe 150x70),
    // a realne dopasowanie robi CSS.
    resetView();
  }

  function setTool(next) {
    tool = next;
    syncToolButtons();

    if (!fcanvas) return;

    // zakończ wielokąt jeśli przełączamy narzędzie
    cancelPolygon();

    // tryby interakcji
    fcanvas.isDrawingMode = false;
    fcanvas.selection = true;
    fcanvas.defaultCursor = "default";

    // obiekty selectable tylko w SELECT
    const selectable = (tool === "SELECT");
    fcanvas.forEachObject((o) => { o.selectable = selectable; o.evented = selectable; });

    if (tool === "PAN") {
      fcanvas.selection = false;
      fcanvas.defaultCursor = "grab";
    }

    if (tool === "PENCIL") {
      fcanvas.isDrawingMode = true;
      fcanvas.freeDrawingBrush = new window.fabric.PencilBrush(fcanvas);
      fcanvas.freeDrawingBrush.width = 6;
      fcanvas.freeDrawingBrush.color = "#fff";
    }

    if (tool === "ERASER") {
      // jeśli jest EraserBrush – użyj, jak nie ma -> “rysuj czarnym”
      if (window.fabric.EraserBrush) {
        fcanvas.isDrawingMode = true;
        fcanvas.freeDrawingBrush = new window.fabric.EraserBrush(fcanvas);
        fcanvas.freeDrawingBrush.width = 10;
      } else {
        fcanvas.isDrawingMode = true;
        fcanvas.freeDrawingBrush = new window.fabric.PencilBrush(fcanvas);
        fcanvas.freeDrawingBrush.width = 10;
        fcanvas.freeDrawingBrush.color = "#000";
      }
    }

    fcanvas.discardActiveObject();
    fcanvas.requestRenderAll();
  }

  function scheduleHistoryPush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushHistoryNow(), 120);
  }

  function pushHistoryNow() {
    if (!fcanvas || isRestoring) return;
    const json = JSON.stringify(fcanvas.toDatalessJSON());
    // nie dubluj identycznych stanów
    if (histIndex >= 0 && history[histIndex] === json) return;

    // utnij redo
    history = history.slice(0, histIndex + 1);
    history.push(json);
    histIndex = history.length - 1;
  }

  async function restoreHistory(index) {
    if (!fcanvas) return;
    if (index < 0 || index >= history.length) return;

    isRestoring = true;
    const json = history[index];
    await new Promise((resolve) => {
      fcanvas.loadFromJSON(json, () => {
        fcanvas.setBackgroundColor("#000", () => {});
        fcanvas.renderAll();
        resolve();
      });
    });
    histIndex = index;
    isRestoring = false;

    ctx.markDirty?.();
    schedulePreview();
  }

  function undo() {
    if (histIndex <= 0) return;
    restoreHistory(histIndex - 1);
  }

  function redo() {
    if (histIndex >= history.length - 1) return;
    restoreHistory(histIndex + 1);
  }

  function clearAll() {
    if (!fcanvas) return;
    fcanvas.getObjects().forEach(o => fcanvas.remove(o));
    fcanvas.setBackgroundColor("#000", () => {});
    fcanvas.discardActiveObject();
    fcanvas.requestRenderAll();
    ctx.markDirty?.();
    pushHistoryNow();
    schedulePreview();
  }

  function cancelPolygon() {
    polyPoints = [];
    if (tempPoly && fcanvas) {
      fcanvas.remove(tempPoly);
      tempPoly = null;
      fcanvas.requestRenderAll();
    }
  }

  function finishPolygon() {
    if (!fcanvas) return;
    if (polyPoints.length < 3) {
      cancelPolygon();
      return;
    }

    // usuń temp
    if (tempPoly) {
      fcanvas.remove(tempPoly);
      tempPoly = null;
    }

    const poly = new window.fabric.Polygon(polyPoints, {
      fill: "rgba(0,0,0,0)",
      stroke: "#fff",
      strokeWidth: 2,
      objectCaching: false,
      selectable: (tool === "SELECT"),
      evented: (tool === "SELECT"),
    });

    fcanvas.add(poly);
    polyPoints = [];
    fcanvas.requestRenderAll();
  }

  function installPointerHandlers() {
    if (!fcanvas) return;

    // pan
    let panning = false;
    let lastPos = null;

    fcanvas.on("mouse:down", (opt) => {
      if (ctx.getMode?.() !== "DRAW") return;
      const e = opt.e;

      if (tool === "PAN") {
        panning = true;
        fcanvas.defaultCursor = "grabbing";
        lastPos = { x: e.clientX, y: e.clientY };
        return;
      }

      if (tool === "LINE" || tool === "RECT" || tool === "ELLIPSE") {
        isDown = true;
        const p = fcanvas.getPointer(e);
        start = { x: p.x, y: p.y };

        if (tool === "LINE") {
          tempObj = new window.fabric.Line([start.x, start.y, start.x, start.y], {
            stroke: "#fff",
            strokeWidth: 2,
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          fcanvas.add(tempObj);
        }

        if (tool === "RECT") {
          tempObj = new window.fabric.Rect({
            left: start.x,
            top: start.y,
            width: 1,
            height: 1,
            fill: "rgba(0,0,0,0)",
            stroke: "#fff",
            strokeWidth: 2,
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          fcanvas.add(tempObj);
        }

        if (tool === "ELLIPSE") {
          tempObj = new window.fabric.Ellipse({
            left: start.x,
            top: start.y,
            rx: 1,
            ry: 1,
            fill: "rgba(0,0,0,0)",
            stroke: "#fff",
            strokeWidth: 2,
            selectable: false,
            evented: false,
            originX: "left",
            originY: "top",
            objectCaching: false,
          });
          fcanvas.add(tempObj);
        }

        fcanvas.requestRenderAll();
        return;
      }

      if (tool === "POLY") {
        const p = fcanvas.getPointer(e);
        polyPoints.push({ x: p.x, y: p.y });

        // podgląd poligonu jako polyline
        if (tempPoly) fcanvas.remove(tempPoly);
        tempPoly = new window.fabric.Polyline(polyPoints, {
          fill: "rgba(0,0,0,0)",
          stroke: "#fff",
          strokeWidth: 2,
          selectable: false,
          evented: false,
          objectCaching: false,
        });
        fcanvas.add(tempPoly);
        fcanvas.requestRenderAll();

        ctx.markDirty?.();
        scheduleHistoryPush();
        schedulePreview();
      }
    });

    fcanvas.on("mouse:move", (opt) => {
      if (ctx.getMode?.() !== "DRAW") return;
      const e = opt.e;

      if (tool === "PAN" && panning) {
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        lastPos = { x: e.clientX, y: e.clientY };
        fcanvas.relativePan(new window.fabric.Point(dx, dy));
        return;
      }

      if (!isDown || !tempObj) return;

      const p = fcanvas.getPointer(e);

      if (tool === "LINE") {
        tempObj.set({ x2: p.x, y2: p.y });
      }

      if (tool === "RECT") {
        const left = Math.min(start.x, p.x);
        const top = Math.min(start.y, p.y);
        const w = Math.abs(p.x - start.x);
        const h = Math.abs(p.y - start.y);
        tempObj.set({ left, top, width: w, height: h });
      }

      if (tool === "ELLIPSE") {
        const left = Math.min(start.x, p.x);
        const top = Math.min(start.y, p.y);
        const rx = Math.abs(p.x - start.x) / 2;
        const ry = Math.abs(p.y - start.y) / 2;
        tempObj.set({
          left,
          top,
          rx,
          ry,
          originX: "left",
          originY: "top",
        });
      }

      fcanvas.requestRenderAll();
    });

    fcanvas.on("mouse:up", () => {
      if (ctx.getMode?.() !== "DRAW") return;

      if (tool === "PAN") {
        panning = false;
        fcanvas.defaultCursor = "grab";
        return;
      }

      if (tool === "LINE" || tool === "RECT" || tool === "ELLIPSE") {
        isDown = false;
        if (tempObj) {
          // final obiekt: włącz selectable tylko gdy SELECT
          tempObj.set({ selectable: (tool === "SELECT"), evented: (tool === "SELECT") });
          tempObj = null;
          ctx.markDirty?.();
          pushHistoryNow();
          schedulePreview();
        }
      }
    });

    // klawisze dla poligonu
    window.addEventListener("keydown", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (tool !== "POLY") return;

      if (ev.key === "Escape") {
        ev.preventDefault();
        cancelPolygon();
        schedulePreview();
      }

      if (ev.key === "Enter") {
        ev.preventDefault();
        finishPolygon();
        pushHistoryNow();
        schedulePreview();
      }
    });
  }

  // export -> bits (150x70)
  function renderToBits150() {
    if (!fcanvas) return new Uint8Array(DOT_W * DOT_H);

    // render na offscreen 150x70
    const el = fcanvas.toCanvasElement({
      width: DOT_W,
      height: DOT_H,
      enableRetinaScaling: false,
    });

    const g = el.getContext("2d", { willReadFrequently: true });
    const img = g.getImageData(0, 0, DOT_W, DOT_H).data;

    const out = new Uint8Array(DOT_W * DOT_H);
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const r = img[i * 4 + 0];
      const gg = img[i * 4 + 1];
      const b = img[i * 4 + 2];
      // jasność: białe=1, czarne=0
      const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      out[i] = lum >= 128 ? 1 : 0;
    }
    return out;
  }

  let prevDeb = null;
  function schedulePreview() {
    clearTimeout(prevDeb);
    prevDeb = setTimeout(() => {
      const bits = renderToBits150();
      ctx.onPreview?.({ kind: "PIX", bits });
      drawMini(bits);
    }, 60);
  }

  function drawMini(bits150) {
    if (!miniEl) return;
    const g = miniEl.getContext("2d", { willReadFrequently: true });
    const img = g.createImageData(DOT_W, DOT_H);
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const v = bits150[i] ? 255 : 0;
      img.data[i * 4 + 0] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  // UI bind
  function bindUiOnce() {
    btnToolSelect?.addEventListener("click", () => setTool("SELECT"));
    btnToolPan?.addEventListener("click", () => setTool("PAN"));
    btnToolPencil?.addEventListener("click", () => setTool("PENCIL"));
    btnToolEraser?.addEventListener("click", () => setTool("ERASER"));
    btnToolLine?.addEventListener("click", () => setTool("LINE"));
    btnToolRect?.addEventListener("click", () => setTool("RECT"));
    btnToolEllipse?.addEventListener("click", () => setTool("ELLIPSE"));
    btnToolPoly?.addEventListener("click", () => setTool("POLY"));

    btnUndo?.addEventListener("click", undo);
    btnRedo?.addEventListener("click", redo);
    btnClear?.addEventListener("click", clearAll);

    btnZoomIn?.addEventListener("click", () => zoomAtCenter(1.25));
    btnZoomOut?.addEventListener("click", () => zoomAtCenter(1 / 1.25));
    btnZoom100?.addEventListener("click", zoomTo100);
    btnZoomFit?.addEventListener("click", zoomFit);
  }

  let uiBound = false;

  return {
    open() {
      show(paneDraw, true);

      installFabricOnce();
      if (!uiBound) { bindUiOnce(); uiBound = true; }

      // reset dokumentu (nowa sesja)
      clearAll();
      resetView();
      setTool("PENCIL");
      syncToolButtons();

      // start preview
      schedulePreview();
      ctx.clearDirty?.();

      // pointer handlers (raz)
      installPointerHandlers();
    },

    close() {
      show(paneDraw, false);
      // nie niszczymy fcanvas (szybciej); jeśli kiedyś trzeba, można dodać dispose()
    },

    getCreatePayload() {
      const bits = renderToBits150();
      return {
        ok: true,
        type: TYPE_PIX,
        payload: {
          w: DOT_W,
          h: DOT_H,
          format: "BITPACK_MSB_FIRST_ROW_MAJOR",
          bits_b64: ctx.packBitsRowMajorMSB(bits, DOT_W, DOT_H),
        },
      };
    },
  };
}
