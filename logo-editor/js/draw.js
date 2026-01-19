// familiada/logo-editor/js/draw.js
// DRAW — Fabric.js -> raster 150x70 (PIX_150x70)
//
// Twoje założenia:
// - WORLD = SCENA (worldW/worldH = aktualne wymiary canvasa w px)
// - zoom in jest ok, ale zoom out tylko do MIN_ZOOM=1 (granice świata)
// - pan tylko przy zoom>1 i zawsze ograniczony (bez pokazywania "poza")
// - nie można rysować / przesuwać / skalować obiektów poza świat
// - preview/export stabilne (nie zależy od zoom/pan), ma działać zawsze
// - gumka: BLACK (maluj czarnym, ma grubość) / OBJECT (usuń obiekty, bez grubości)
// - skróty jak w Photoshopie + chwilowy Select (Ctrl/Cmd) i chwilowy Pan (Space)
// - Shift: idealny kwadrat/okrąg, linie 0/45/90
// - Strzałki: przesuwają zaznaczone

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // =========================================================
  // DOM
  // =========================================================
  const paneDraw = document.getElementById("paneDraw");

  const drawCanvasEl = document.getElementById("drawStage");
  const drawStageHost = document.getElementById("drawStageHost");

  // Buttons
  const tSelect   = document.getElementById("tSelect");
  const tPan      = document.getElementById("tPan");
  const tZoomIn   = document.getElementById("tZoomIn");
  const tZoomOut  = document.getElementById("tZoomOut");
  const tZoom100  = document.getElementById("tZoom100");

  // PLACEHOLDER zamiast "magnesu" — możesz zostawić w HTML,
  // ale my tego nie używamy (żeby nie mieszać pojęć przy WORLD=SCENA).
  const tZoomFit  = document.getElementById("tZoomFit");

  const tBrush    = document.getElementById("tBrush");
  const tEraser   = document.getElementById("tEraser");
  const tLine     = document.getElementById("tLine");
  const tRect     = document.getElementById("tRect");
  const tEllipse  = document.getElementById("tEllipse");
  const tPoly     = document.getElementById("tPoly");

  const tUndo     = document.getElementById("tUndo");
  const tRedo     = document.getElementById("tRedo");
  const tClear    = document.getElementById("tClear");
  const tEye      = document.getElementById("tEye");

  const tSettings = document.getElementById("tSettings");
  const tPolyDone = document.getElementById("tPolyDone");

  // Settings popover
  const drawPop = document.getElementById("drawPop");
  const drawPopTitle = document.getElementById("drawPopTitle");
  const drawPopBody = document.getElementById("drawPopBody");
  const drawPopClose = document.getElementById("drawPopClose");

  // =========================================================
  // Consts / helpers
  // =========================================================
  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70
  const ASPECT = 26 / 11;

  const MIN_ZOOM = 1.0;   // granice świata = granice sceny
  const MAX_ZOOM = 12.0;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function requireFabric() {
    const f = window.fabric;
    if (!f) throw new Error("Brak Fabric.js (script nie wczytany).");
    return f;
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
  }

  // =========================================================
  // WORLD = SCENA
  // =========================================================
  let worldW = 1;
  let worldH = 1;

  function clampWorldPoint(p) {
    return {
      x: clamp(p.x, 0, worldW),
      y: clamp(p.y, 0, worldH),
    };
  }

  function getStageSize() {
    const host = drawStageHost || drawCanvasEl?.parentElement;
    const rect = host?.getBoundingClientRect?.() || { width: 800, height: 400 };

    let w = Math.max(320, Math.floor(rect.width));
    let h = Math.floor(w / ASPECT);

    if (rect.height > 0 && h > rect.height) {
      h = Math.max(180, Math.floor(rect.height));
      w = Math.floor(h * ASPECT);
    }

    return { w, h };
  }

  function updateWorldSize(w, h) {
    worldW = Math.max(1, Math.floor(w));
    worldH = Math.max(1, Math.floor(h));
  }

  // =========================================================
  // Tool state
  // =========================================================
  const TOOL = {
    SELECT: "SELECT",
    PAN: "PAN",
    BRUSH: "BRUSH",
    ERASER: "ERASER",
    LINE: "LINE",
    RECT: "RECT",
    ELLIPSE: "ELLIPSE",
    POLY: "POLY",
  };

  let tool = TOOL.SELECT;

  const toolSettings = {
    [TOOL.BRUSH]:   { stroke: 6 },
    [TOOL.ERASER]:  { stroke: 10, mode: "BLACK" }, // BLACK / OBJECT
    [TOOL.LINE]:    { stroke: 6 },
    [TOOL.RECT]:    { stroke: 6, fill: false },
    [TOOL.ELLIPSE]: { stroke: 6, fill: false },
    [TOOL.POLY]:    { stroke: 6, fill: false },
  };

  function getStrokeFor(t) {
    const s = toolSettings[t]?.stroke;
    return clamp(Number(s || 6), 1, 80);
  }

  function getStroke() {
    return getStrokeFor(tool);
  }

  function getFill() {
    return !!toolSettings[tool]?.fill;
  }

  function getEraserMode() {
    const m = toolSettings[TOOL.ERASER]?.mode;
    return (m === "OBJECT") ? "OBJECT" : "BLACK";
  }

  // =========================================================
  // Fabric init
  // =========================================================
  let fabricCanvas = null;
  let initialized = false;

  // Pan
  let panDown = false;
  let panStart = { x: 0, y: 0 };
  let vptStart = null;

  // Shapes
  let drawingObj = null;

  // Polygon draft
  let polyPoints = [];
  let polyPreview = null;

  // Keyboard state
  let shiftDown = false;

  // chwilowe narzędzia (momentary)
  let spaceDown = false;
  let ctrlDown = false;
  let tempTool = null;
  let tempPrevTool = null;

  // Undo/Redo
  let undoStack = [];
  let redoStack = [];
  let undoBusy = false;

  // Preview bits
  let bits150 = new Uint8Array(DOT_W * DOT_H);
  let _deb = null;
  let _previewSeq = 0;
  let _renderBusy = false;

  // =========================================================
  // Viewport: clamp / zoom / reset
  // =========================================================
  function resetView() {
    if (!fabricCanvas) return;
    fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fabricCanvas.requestRenderAll();
  }

  function clampViewport() {
    if (!fabricCanvas) return;

    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();
    const z = fabricCanvas.getZoom();

    const v = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : [z, 0, 0, z, 0, 0];

    // przy z=1: minE=0, maxE=0 => nie da się przesunąć
    const minE = cw - worldW * z;
    const maxE = 0;
    const minF = ch - worldH * z;
    const maxF = 0;

    v[4] = clamp(v[4], minE, maxE);
    v[5] = clamp(v[5], minF, maxF);

    // gdy świat "mniejszy" (teoretycznie) — trzymaj 0
    if (minE > 0) v[4] = 0;
    if (minF > 0) v[5] = 0;

    fabricCanvas.setViewportTransform(v);
  }

  function setZoomClamped(nextZoom, center = null) {
    if (!fabricCanvas) return;
    const f = requireFabric();

    const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const pt = center || new f.Point(fabricCanvas.getWidth() / 2, fabricCanvas.getHeight() / 2);
    fabricCanvas.zoomToPoint(pt, z);

    // przy min zoom trzymamy dokładnie [1..,0,0]
    if (z <= MIN_ZOOM + 1e-6) {
      fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    } else {
      clampViewport();
    }

    fabricCanvas.requestRenderAll();
  }

  function zoomBy(factor, center = null) {
    if (!fabricCanvas) return;
    setZoomClamped(fabricCanvas.getZoom() * factor, center);
  }

  function zoomTo100() {
    setZoomClamped(1.0, null);
    if (fabricCanvas) {
      fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      fabricCanvas.requestRenderAll();
    }
  }

  function zoomFit() {
    // WORLD=SCENA => fit == 100%
    zoomTo100();
  }

  // =========================================================
  // Scene sizing (WORLD=SCENA)
  // =========================================================
  function resizeScene() {
    if (!fabricCanvas || !drawCanvasEl) return;
    const { w, h } = getStageSize();

    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
    fabricCanvas.calcOffset();

    updateWorldSize(w, h);

    // po zmianie rozmiaru: bezpieczny widok granic świata
    resetView();
    clampViewport();

    // po resize: dociśnij obiekty do świata
    fabricCanvas.getObjects().forEach(o => clampObjectToWorld(o));

    schedulePreview(60);
  }

  // =========================================================
  // Cursor (ważne: kształty mają mieć krzyżyk)
  // =========================================================
  function setCursorForTool() {
    if (!fabricCanvas) return;

    if (tool === TOOL.SELECT) {
      fabricCanvas.defaultCursor = "default";
      fabricCanvas.hoverCursor = "move";
      fabricCanvas.moveCursor = "move";
    } else if (tool === TOOL.PAN) {
      fabricCanvas.defaultCursor = "grab";
      fabricCanvas.hoverCursor = "grab";
      fabricCanvas.moveCursor = "grabbing";
    } else {
      // BRUSH/ERASER/SHAPES/POLY
      fabricCanvas.defaultCursor = "crosshair";
      fabricCanvas.hoverCursor = "crosshair";
      fabricCanvas.moveCursor = "crosshair";
    }
  }

  // =========================================================
  // Styles
  // =========================================================
  function makeStrokeFillStyle() {
    const w = getStroke();
    return {
      stroke: "#fff",
      strokeWidth: w,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      fill: getFill() ? "#fff" : "rgba(0,0,0,0)",
    };
  }

  function applyBrushStyle() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    if (!fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush = new f.PencilBrush(fabricCanvas);
    }
    fabricCanvas.freeDrawingBrush.decimate = 0;

    const isEraserBlack = (tool === TOOL.ERASER && getEraserMode() === "BLACK");
    const strokeW = (tool === TOOL.BRUSH) ? getStrokeFor(TOOL.BRUSH) : getStrokeFor(TOOL.ERASER);

    fabricCanvas.freeDrawingBrush.width = clamp(strokeW, 1, 80);
    fabricCanvas.freeDrawingBrush.color = isEraserBlack ? "#000" : "#fff";
  }

  // =========================================================
  // UI: active tool
  // =========================================================
  function syncToolButtons() {
    setBtnOn(tSelect, tool === TOOL.SELECT);
    setBtnOn(tPan, tool === TOOL.PAN);

    setBtnOn(tBrush, tool === TOOL.BRUSH);
    setBtnOn(tEraser, tool === TOOL.ERASER);
    setBtnOn(tLine, tool === TOOL.LINE);
    setBtnOn(tRect, tool === TOOL.RECT);
    setBtnOn(tEllipse, tool === TOOL.ELLIPSE);
    setBtnOn(tPoly, tool === TOOL.POLY);

    if (tPolyDone) tPolyDone.disabled = !(tool === TOOL.POLY && polyPoints.length >= 3);

    // placeholder: magnes/fit nieużywany
    if (tZoomFit) {
      tZoomFit.disabled = true;
      tZoomFit.setAttribute("aria-disabled", "true");
    }
  }

  function clearPolyDraft() {
    polyPoints = [];
    if (polyPreview && fabricCanvas) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
      fabricCanvas.requestRenderAll();
    }
    syncToolButtons();
  }

  function setTool(next) {
    tool = next;
    syncToolButtons();

    if (!fabricCanvas) return;

    // SELECT
    if (tool === TOOL.SELECT) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = true;
      fabricCanvas.forEachObject(o => { o.selectable = true; o.evented = true; });
      clearPolyDraft();
    }

    // PAN
    else if (tool === TOOL.PAN) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      clearPolyDraft();
    }

    // BRUSH
    else if (tool === TOOL.BRUSH) {
      fabricCanvas.isDrawingMode = true;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      clearPolyDraft();
      applyBrushStyle();
    }

    // ERASER
    else if (tool === TOOL.ERASER) {
      const mode = getEraserMode();

      // BLACK = maluj czarnym (ma grubość)
      if (mode === "BLACK") {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.selection = false;
        fabricCanvas.discardActiveObject();
        fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
        clearPolyDraft();
        applyBrushStyle();
      }

      // OBJECT = klik usuwa obiekt (bez grubości)
      else {
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = false;
        fabricCanvas.discardActiveObject();

        // MUSZĄ być evented, żeby Fabric trafiał target
        fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = true; });

        clearPolyDraft();
      }
    }

    // SHAPES / POLY
    else {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      if (tool !== TOOL.POLY) clearPolyDraft();
    }

    setCursorForTool();
    schedulePreview(80);
  }

  // =========================================================
  // Undo/Redo
  // =========================================================
  function snapshotJSON() {
    if (!fabricCanvas) return null;
    return fabricCanvas.toDatalessJSON([
      "stroke","strokeWidth","strokeLineCap","strokeLineJoin","fill"
    ]);
  }

  function pushUndo() {
    if (!fabricCanvas || undoBusy) return;
    const j = snapshotJSON();
    if (!j) return;

    const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
    const sj = JSON.stringify(j);
    const sl = last ? JSON.stringify(last) : "";
    if (sj === sl) return;

    undoStack.push(j);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function restoreFrom(json) {
    if (!fabricCanvas || !json) return;
    undoBusy = true;
    fabricCanvas.loadFromJSON(json, () => {
      undoBusy = false;
      fabricCanvas.requestRenderAll();
      ctx.markDirty?.();
      schedulePreview(80);
    });
  }

  function undo() {
    if (!fabricCanvas) return;
    if (undoStack.length < 2) return;
    const current = undoStack.pop();
    redoStack.push(current);
    restoreFrom(undoStack[undoStack.length - 1]);
    updateUndoRedoButtons();
  }

  function redo() {
    if (!fabricCanvas) return;
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    restoreFrom(next);
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    if (tUndo) tUndo.disabled = undoStack.length < 2;
    if (tRedo) tRedo.disabled = redoStack.length < 1;
  }

  // =========================================================
  // Pointer -> world point (clamp do świata)
  // =========================================================
  function getWorldPointFromMouse(ev) {
    const f = requireFabric();
    const rect = drawCanvasEl.getBoundingClientRect();
    const canvasPt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
    const inv = f.util.invertTransform(fabricCanvas.viewportTransform);
    const wp = f.util.transformPoint(canvasPt, inv);
    return clampWorldPoint({ x: wp.x, y: wp.y });
  }

  // =========================================================
  // Polygon
  // =========================================================
  function addPolyPoint(worldPt) {
    const p = clampWorldPoint(worldPt);
    polyPoints.push({ x: p.x, y: p.y });

    const f = requireFabric();
    const style = makeStrokeFillStyle();

    if (!polyPreview) {
      polyPreview = new f.Polyline(polyPoints, {
        ...style,
        fill: "rgba(0,0,0,0)",
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      fabricCanvas.add(polyPreview);
    } else {
      polyPreview.set({ points: polyPoints });
    }

    fabricCanvas.requestRenderAll();
    syncToolButtons();
  }

  function removeLastPolyPoint() {
    if (polyPoints.length === 0) return;
    polyPoints.pop();
    if (polyPreview) {
      polyPreview.set({ points: polyPoints });
      fabricCanvas.requestRenderAll();
    }
    syncToolButtons();
  }

  function finalizePolygon() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    if (polyPoints.length < 3) return;

    const style = makeStrokeFillStyle();

    if (polyPreview) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
    }

    const poly = new f.Polygon(polyPoints, {
      ...style,
      selectable: false,
      evented: false,
      objectCaching: false,
    });

    fabricCanvas.add(poly);
    clampObjectToWorld(poly);
    fabricCanvas.requestRenderAll();

    clearPolyDraft();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  // =========================================================
  // Shapes (line/rect/ellipse) + SHIFT constraints
  // =========================================================
  function startFigure(ev) {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const p0 = getWorldPointFromMouse(ev);
    const style = makeStrokeFillStyle();

    if (tool === TOOL.LINE) {
      drawingObj = new f.Line([p0.x, p0.y, p0.x, p0.y], {
        ...style,
        fill: "rgba(0,0,0,0)",
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }

    if (tool === TOOL.RECT) {
      drawingObj = new f.Rect({
        left: p0.x,
        top: p0.y,
        width: 1,
        height: 1,
        originX: "left",
        originY: "top",
        ...style,
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }

    if (tool === TOOL.ELLIPSE) {
      drawingObj = new f.Ellipse({
        left: p0.x,
        top: p0.y,
        rx: 1,
        ry: 1,
        originX: "left",
        originY: "top",
        ...style,
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }
  }

  function updateFigure(ev) {
    if (!fabricCanvas || !drawingObj) return;
    const p = getWorldPointFromMouse(ev);

    // LINE: SHIFT -> snap 0/45/90
    if (tool === TOOL.LINE && drawingObj.type === "line") {
      let x2 = p.x, y2 = p.y;

      if (shiftDown) {
        const x1 = drawingObj.x1;
        const y1 = drawingObj.y1;

        let dx = x2 - x1;
        let dy = y2 - y1;

        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        if (adx > ady * 2) {
          y2 = y1; // poziom
        } else if (ady > adx * 2) {
          x2 = x1; // pion
        } else {
          // 45°
          const m = Math.max(adx, ady);
          x2 = x1 + Math.sign(dx || 1) * m;
          y2 = y1 + Math.sign(dy || 1) * m;
          const cl = clampWorldPoint({ x: x2, y: y2 });
          x2 = cl.x; y2 = cl.y;
        }
      }

      drawingObj.set({ x2, y2 });
      fabricCanvas.requestRenderAll();
      return;
    }

    // RECT: SHIFT -> kwadrat
    if (tool === TOOL.RECT && drawingObj.type === "rect") {
      const x0 = drawingObj.left;
      const y0 = drawingObj.top;

      let w = p.x - x0;
      let h = p.y - y0;

      let ww = Math.abs(w);
      let hh = Math.abs(h);

      if (shiftDown) {
        const m = Math.max(ww, hh);
        ww = m;
        hh = m;
      }

      const left = w >= 0 ? x0 : (x0 - ww);
      const top  = h >= 0 ? y0 : (y0 - hh);

      const pLT = clampWorldPoint({ x: left, y: top });
      const pRB = clampWorldPoint({ x: left + ww, y: top + hh });

      drawingObj.set({
        left: pLT.x,
        top: pLT.y,
        width: Math.max(1, pRB.x - pLT.x),
        height: Math.max(1, pRB.y - pLT.y),
      });

      fabricCanvas.requestRenderAll();
      return;
    }

    // ELLIPSE: SHIFT -> okrąg
    if (tool === TOOL.ELLIPSE && drawingObj.type === "ellipse") {
      const x0 = drawingObj.left;
      const y0 = drawingObj.top;

      let w = p.x - x0;
      let h = p.y - y0;

      let ww = Math.abs(w);
      let hh = Math.abs(h);

      if (shiftDown) {
        const m = Math.max(ww, hh);
        ww = m;
        hh = m;
      }

      const left = w >= 0 ? x0 : (x0 - ww);
      const top  = h >= 0 ? y0 : (y0 - hh);

      const pLT = clampWorldPoint({ x: left, y: top });
      const pRB = clampWorldPoint({ x: left + ww, y: top + hh });

      drawingObj.set({
        left: pLT.x,
        top: pLT.y,
        rx: Math.max(1, (pRB.x - pLT.x) / 2),
        ry: Math.max(1, (pRB.y - pLT.y) / 2),
      });

      fabricCanvas.requestRenderAll();
      return;
    }
  }

  function finishFigure() {
    if (!fabricCanvas || !drawingObj) return;
    clampObjectToWorld(drawingObj);
    drawingObj = null;
    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  // =========================================================
  // Clamp obiektów w świecie (SELECT + ogólnie)
  // =========================================================
  function clampObjectToWorld(obj) {
    if (!fabricCanvas || !obj) return;
    const f = requireFabric();

    // bounding rect w układzie canvasa (po viewport)
    const br = obj.getBoundingRect(true, true);

    const inv = f.util.invertTransform(fabricCanvas.viewportTransform);

    const tlCanvas = new f.Point(br.left, br.top);
    const brCanvas = new f.Point(br.left + br.width, br.top + br.height);

    const tlWorld = f.util.transformPoint(tlCanvas, inv);
    const brWorld = f.util.transformPoint(brCanvas, inv);

    let dx = 0;
    let dy = 0;

    if (tlWorld.x < 0) dx += -tlWorld.x;
    if (tlWorld.y < 0) dy += -tlWorld.y;

    if (brWorld.x > worldW) dx += (worldW - brWorld.x);
    if (brWorld.y > worldH) dy += (worldH - brWorld.y);

    if (dx !== 0 || dy !== 0) {
      obj.left = (obj.left || 0) + dx;
      obj.top  = (obj.top  || 0) + dy;
      obj.setCoords();
    }
  }

  function nudgeSelection(dx, dy) {
    if (!fabricCanvas) return;
    const obj = fabricCanvas.getActiveObject();
    if (!obj) return;

    obj.left = (obj.left || 0) + dx;
    obj.top  = (obj.top  || 0) + dy;

    clampObjectToWorld(obj);
    obj.setCoords();

    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  // =========================================================
  // Preview/export: STABILNE (naprawia "puste")
  // - na czas renderu ustawiamy viewport = świat 1:1
  // - bierzemy lowerCanvasEl i skalujemy do DOT_W/DOT_H
  // =========================================================
  function withViewport(vpt, fn) {
    if (!fabricCanvas) return fn();
    const prev = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : [1,0,0,1,0,0];
    fabricCanvas.setViewportTransform(vpt);
    clampViewport();
    fabricCanvas.requestRenderAll();
    try {
      return fn();
    } finally {
      fabricCanvas.setViewportTransform(prev);
      clampViewport();
      fabricCanvas.requestRenderAll();
    }
  }

  function renderWorldTo150x70CanvasStable() {
    if (!fabricCanvas) return null;

    return withViewport([1, 0, 0, 1, 0, 0], () => {
      const src = fabricCanvas.lowerCanvasEl;
      if (!src) return null;

      const out = document.createElement("canvas");
      out.width = DOT_W;
      out.height = DOT_H;

      const g = out.getContext("2d", { willReadFrequently: true });
      g.imageSmoothingEnabled = true;

      g.fillStyle = "#000";
      g.fillRect(0, 0, DOT_W, DOT_H);

      // WORLD=SCENA: src ma worldW x worldH
      g.drawImage(src, 0, 0, worldW, worldH, 0, 0, DOT_W, DOT_H);

      return out;
    });
  }

  function canvasToBits150(c) {
    const g = c.getContext("2d", { willReadFrequently: true });
    const { data } = g.getImageData(0, 0, DOT_W, DOT_H);
    const out = new Uint8Array(DOT_W * DOT_H);

    for (let i = 0; i < out.length; i++) {
      const r = data[i*4+0], gg = data[i*4+1], b = data[i*4+2];
      const lum = 0.2126*r + 0.7152*gg + 0.0722*b;
      out[i] = lum >= 128 ? 1 : 0;
    }
    return out;
  }

  function schedulePreview(ms = 60) {
    clearTimeout(_deb);
    const mySeq = ++_previewSeq;

    _deb = setTimeout(() => {
      if (!fabricCanvas) return;
      if (mySeq !== _previewSeq) return;
      if (_renderBusy) return;

      _renderBusy = true;
      try {
        const c = renderWorldTo150x70CanvasStable();
        if (!c) return;
        if (mySeq !== _previewSeq) return;

        bits150 = canvasToBits150(c);
        ctx.onPreview?.({ kind: "PIX", bits: bits150 });
      } finally {
        _renderBusy = false;
      }
    }, ms);
  }

  function openEyePreview() {
    window.dispatchEvent(new CustomEvent("logoeditor:openPreview", {
      detail: { kind: "PIX", bits: bits150 }
    }));
  }

  // =========================================================
  // Settings modal
  // =========================================================
  function toolHasSettings(t) {
    return t === TOOL.BRUSH || t === TOOL.ERASER || t === TOOL.LINE || t === TOOL.RECT || t === TOOL.ELLIPSE || t === TOOL.POLY;
  }

  function toolLabel(t) {
    return t === TOOL.BRUSH ? "Pędzel" :
           t === TOOL.ERASER ? "Gumka" :
           t === TOOL.LINE ? "Linia" :
           t === TOOL.RECT ? "Prostokąt" :
           t === TOOL.ELLIPSE ? "Elipsa" :
           t === TOOL.POLY ? "Wielokąt" :
           t === TOOL.PAN ? "Ręka" : "Wskaźnik";
  }

  function renderSettingsModal() {
    if (!drawPopBody) return;
    drawPopBody.innerHTML = "";

    if (!toolHasSettings(tool)) {
      const p = document.createElement("div");
      p.style.opacity = ".85";
      p.style.fontSize = "13px";
      p.textContent = "To narzędzie nie ma ustawień.";
      drawPopBody.appendChild(p);
      return;
    }

    const st = toolSettings[tool] || {};

    // ERASER: tryb + grubość tylko w BLACK
    if (tool === TOOL.ERASER) {
      const mode = getEraserMode();

      const row = document.createElement("label");
      row.className = "popRow";
      row.innerHTML = `
        <span>Tryb</span>
        <select class="inp" id="popEraserMode">
          <option value="BLACK" ${mode === "BLACK" ? "selected" : ""}>Maluj czarnym</option>
          <option value="OBJECT" ${mode === "OBJECT" ? "selected" : ""}>Usuń obiekty</option>
        </select>
      `;
      drawPopBody.appendChild(row);

      if (mode === "BLACK") {
        const row2 = document.createElement("label");
        row2.className = "popRow";
        row2.innerHTML = `
          <span>Grubość</span>
          <input class="inp" id="popStroke" type="number" min="1" max="80" step="1" value="${Number(st.stroke || 10)}">
        `;
        drawPopBody.appendChild(row2);
      } else {
        const info = document.createElement("div");
        info.style.opacity = ".85";
        info.style.fontSize = "12.5px";
        info.textContent = "Tryb „Usuń obiekty”: kliknięcie usuwa obiekt pod kursorem (bez grubości).";
        drawPopBody.appendChild(info);
      }
    } else {
      // Pozostałe narzędzia: grubość
      const row = document.createElement("label");
      row.className = "popRow";
      row.innerHTML = `
        <span>Grubość</span>
        <input class="inp" id="popStroke" type="number" min="1" max="80" step="1" value="${Number(st.stroke || 6)}">
      `;
      drawPopBody.appendChild(row);
    }

    // Wypełnij: rect/ellipse/poly
    const fillAllowed = (tool === TOOL.RECT || tool === TOOL.ELLIPSE || tool === TOOL.POLY);
    if (fillAllowed) {
      const row = document.createElement("label");
      row.className = "popRow";
      row.innerHTML = `
        <span>Wypełnij</span>
        <input id="popFill" type="checkbox" ${st.fill ? "checked" : ""}>
      `;
      drawPopBody.appendChild(row);
    }

    // bind
    const popStroke = drawPopBody.querySelector("#popStroke");
    const popFill = drawPopBody.querySelector("#popFill");
    const popEraserMode = drawPopBody.querySelector("#popEraserMode");

    popEraserMode?.addEventListener("change", () => {
      toolSettings[TOOL.ERASER] = {
        ...(toolSettings[TOOL.ERASER] || {}),
        mode: popEraserMode.value === "OBJECT" ? "OBJECT" : "BLACK",
      };

      // odśwież UI (pokaże/ukryje grubość)
      renderSettingsModal();

      // przełącz zachowanie gumki natychmiast
      if (tool === TOOL.ERASER) setTool(TOOL.ERASER);

      schedulePreview(80);
    });

    popStroke?.addEventListener("input", () => {
      const v = clamp(Number(popStroke.value || 6), 1, 80);
      toolSettings[tool] = { ...(toolSettings[tool] || {}), stroke: v };

      if (tool === TOOL.BRUSH) applyBrushStyle();
      if (tool === TOOL.ERASER && getEraserMode() === "BLACK") applyBrushStyle();

      schedulePreview(80);
    });

    popFill?.addEventListener("change", () => {
      toolSettings[tool] = { ...(toolSettings[tool] || {}), fill: !!popFill.checked };
      schedulePreview(80);
    });
  }

  function openSettingsModal() {
    if (!drawPop) return;
    drawPopTitle.textContent = `Ustawienia — ${toolLabel(tool)}`;
    renderSettingsModal();
    show(drawPop, true);
  }

  function closeSettingsModal() {
    show(drawPop, false);
  }

  // =========================================================
  // Momentary tools (Ctrl/Cmd, Space)
  // =========================================================
  function setTempTool(next) {
    if (tempTool === next) return;
    if (!tempTool) tempPrevTool = tool;
    tempTool = next;
    setTool(next);
  }

  function clearTempTool() {
    if (!tempTool) return;
    const back = tempPrevTool || TOOL.SELECT;
    tempTool = null;
    tempPrevTool = null;
    setTool(back);
  }

  // =========================================================
  // Delete selection / Duplicate / Select all
  // =========================================================
  function deleteSelection() {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    // activeSelection (multi)
    if (active.type === "activeSelection") {
      const items = active.getObjects();
      items.forEach(o => fabricCanvas.remove(o));
      fabricCanvas.discardActiveObject();
    } else {
      fabricCanvas.remove(active);
      fabricCanvas.discardActiveObject();
    }

    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  function duplicateSelection() {
    if (!fabricCanvas) return;

    const objs = fabricCanvas.getActiveObjects();
    if (!objs || objs.length === 0) return;

    const f = requireFabric();
    const clones = [];

    let pending = objs.length;

    objs.forEach((o) => {
      o.clone((cl) => {
        // lekkie przesunięcie jak w PS
        cl.left = (cl.left || 0) + 10;
        cl.top  = (cl.top  || 0) + 10;
        cl.setCoords();

        clampObjectToWorld(cl);
        fabricCanvas.add(cl);
        clones.push(cl);

        pending--;
        if (pending === 0) {
          fabricCanvas.discardActiveObject();

          if (clones.length > 1) {
            const sel = new f.ActiveSelection(clones, { canvas: fabricCanvas });
            fabricCanvas.setActiveObject(sel);
          } else {
            fabricCanvas.setActiveObject(clones[0]);
          }

          fabricCanvas.requestRenderAll();
          pushUndo();
          ctx.markDirty?.();
          schedulePreview(80);
        }
      }, ["stroke","strokeWidth","strokeLineCap","strokeLineJoin","fill"]);
    });
  }

  function selectAll() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const objs = fabricCanvas.getObjects();
    if (!objs.length) return;

    const sel = new f.ActiveSelection(objs, { canvas: fabricCanvas });
    fabricCanvas.setActiveObject(sel);
    fabricCanvas.requestRenderAll();
  }

  // =========================================================
  // Keyboard shortcuts (Photoshop-ish)
  // =========================================================
  function installKeyboardShortcutsOnce() {
    // tylko raz
    if (installKeyboardShortcutsOnce._done) return;
    installKeyboardShortcutsOnce._done = true;

    window.addEventListener("keydown", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (isTypingTarget(ev.target)) return;

      shiftDown = ev.shiftKey;

      // Space -> chwilowy PAN
      if (ev.key === " " || ev.code === "Space") {
        ev.preventDefault();
        if (!spaceDown) {
          spaceDown = true;
          setTempTool(TOOL.PAN);
        }
        return;
      }

      // Ctrl/Cmd -> chwilowy SELECT
      const ctrlLike = ev.ctrlKey || ev.metaKey;
      if (ctrlLike && !ctrlDown) {
        ctrlDown = true;
        // jeśli spacja trzymana, PAN ma pierwszeństwo
        if (!spaceDown) setTempTool(TOOL.SELECT);
      }

      // Undo/redo
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "z" || ev.key === "Z")) {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }

      // Fit/100%
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "0") { ev.preventDefault(); zoomFit(); schedulePreview(120); return; }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "1") { ev.preventDefault(); zoomTo100(); schedulePreview(120); return; }

      // Zoom +/- (Ctrl + / Ctrl -)
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "+" || ev.key === "=")) { ev.preventDefault(); zoomBy(1.15); schedulePreview(120); return; }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "-" || ev.key === "_")) { ev.preventDefault(); zoomBy(0.87); schedulePreview(120); return; }

      // Delete/Backspace: usuń zaznaczone (w SELECT)
      if ((ev.key === "Delete" || ev.key === "Backspace") && tool === TOOL.SELECT) {
        ev.preventDefault();
        deleteSelection();
        return;
      }

      // POLY: Backspace usuwa ostatni punkt
      if (ev.key === "Backspace" && tool === TOOL.POLY) {
        ev.preventDefault();
        removeLastPolyPoint();
        return;
      }

      // POLY: Enter kończy, Esc anuluje
      if (tool === TOOL.POLY && ev.key === "Enter") { ev.preventDefault(); finalizePolygon(); return; }
      if (tool === TOOL.POLY && ev.key === "Escape") { ev.preventDefault(); clearPolyDraft(); return; }

      // Strzałki: przesuwanie selection (Shift = większy krok)
      if (tool === TOOL.SELECT) {
        const step = ev.shiftKey ? 10 : 1;
        if (ev.key === "ArrowLeft")  { ev.preventDefault(); nudgeSelection(-step, 0); return; }
        if (ev.key === "ArrowRight") { ev.preventDefault(); nudgeSelection(step, 0); return; }
        if (ev.key === "ArrowUp")    { ev.preventDefault(); nudgeSelection(0, -step); return; }
        if (ev.key === "ArrowDown")  { ev.preventDefault(); nudgeSelection(0, step); return; }
      }

      // Ctrl+D: duplicate
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "d" || ev.key === "D")) {
        ev.preventDefault();
        duplicateSelection();
        return;
      }

      // Ctrl+A: select all (w SELECT)
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "a" || ev.key === "A")) {
        ev.preventDefault();
        if (tool === TOOL.SELECT) selectAll();
        return;
      }

      // Narzędzia (bez Ctrl/Alt)
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        // V/H/B/E
        if (ev.key === "v" || ev.key === "V") { setTool(TOOL.SELECT); return; }
        if (ev.key === "h" || ev.key === "H") { setTool(TOOL.PAN); return; }
        if (ev.key === "b" || ev.key === "B") { setTool(TOOL.BRUSH); applyBrushStyle(); return; }
        if (ev.key === "e" || ev.key === "E") { setTool(TOOL.ERASER); if (getEraserMode()==="BLACK") applyBrushStyle(); return; }

        // U: cykl shapes
        if (ev.key === "u" || ev.key === "U") {
          const order = [TOOL.LINE, TOOL.RECT, TOOL.ELLIPSE, TOOL.POLY];
          const idx = order.indexOf(tool);
          const next = order[(idx + 1 + order.length) % order.length];
          setTool(next);
          return;
        }

        // [ ]: grubość
        if (ev.key === "[") {
          const t = tool;
          if (t === TOOL.ERASER && getEraserMode() === "OBJECT") return;
          if (toolSettings[t]?.stroke != null) {
            toolSettings[t].stroke = clamp(Number(toolSettings[t].stroke || 6) - 1, 1, 80);
            if (t === TOOL.BRUSH) applyBrushStyle();
            if (t === TOOL.ERASER && getEraserMode() === "BLACK") applyBrushStyle();
            schedulePreview(80);
          }
          return;
        }
        if (ev.key === "]") {
          const t = tool;
          if (t === TOOL.ERASER && getEraserMode() === "OBJECT") return;
          if (toolSettings[t]?.stroke != null) {
            toolSettings[t].stroke = clamp(Number(toolSettings[t].stroke || 6) + 1, 1, 80);
            if (t === TOOL.BRUSH) applyBrushStyle();
            if (t === TOOL.ERASER && getEraserMode() === "BLACK") applyBrushStyle();
            schedulePreview(80);
          }
          return;
        }

        // F: fill toggle (figury)
        if (ev.key === "f" || ev.key === "F") {
          if (tool === TOOL.RECT || tool === TOOL.ELLIPSE || tool === TOOL.POLY) {
            toolSettings[tool].fill = !toolSettings[tool].fill;
            schedulePreview(80);
          }
          return;
        }

        // X: przełącz tryb gumki
        if (ev.key === "x" || ev.key === "X") {
          const cur = getEraserMode();
          toolSettings[TOOL.ERASER].mode = (cur === "BLACK") ? "OBJECT" : "BLACK";
          if (tool === TOOL.ERASER) setTool(TOOL.ERASER);
          schedulePreview(80);
          return;
        }
      }
    });

    window.addEventListener("keyup", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      shiftDown = ev.shiftKey;

      // Space up -> wróć
      if (ev.key === " " || ev.code === "Space") {
        spaceDown = false;
        if (ctrlDown) setTempTool(TOOL.SELECT);
        else clearTempTool();
        return;
      }

      // Ctrl/Cmd up -> wróć
      if (ev.key === "Control" || ev.key === "Meta") {
        ctrlDown = false;
        if (spaceDown) setTempTool(TOOL.PAN);
        else clearTempTool();
        return;
      }
    });
  }

  // =========================================================
  // Fabric setup
  // =========================================================
  function installFabricOnce() {
    if (initialized) return;
    initialized = true;

    if (!drawCanvasEl) throw new Error("Brak #drawStage w HTML.");
    const f = requireFabric();

    fabricCanvas = new f.Canvas(drawCanvasEl, {
      backgroundColor: "#000",
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
    });

    // rozmiar + world
    resizeScene();

    // keyboard
    installKeyboardShortcutsOnce();

    // undo start
    undoStack = [];
    redoStack = [];
    pushUndo();
    updateUndoRedoButtons();

    // Zmiany -> preview
    fabricCanvas.on("path:created", () => {
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    fabricCanvas.on("object:modified", (e) => {
      if (e?.target) clampObjectToWorld(e.target);
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    fabricCanvas.on("object:removed", () => {
      if (undoBusy) return;
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    // clamp na żywo przy przesuwaniu/skalowaniu (SELECT)
    fabricCanvas.on("object:moving", (e) => {
      if (tool !== TOOL.SELECT) return;
      if (!e?.target) return;
      clampObjectToWorld(e.target);
    });
    fabricCanvas.on("object:scaling", (e) => {
      if (tool !== TOOL.SELECT) return;
      if (!e?.target) return;
      clampObjectToWorld(e.target);
    });

    // Mouse handlers
    fabricCanvas.on("mouse:down", (opt) => {
      const ev = opt.e;

      // PAN: tylko gdy zoom>1
      if (tool === TOOL.PAN) {
        if (fabricCanvas.getZoom() <= MIN_ZOOM + 1e-6) return;
        panDown = true;
        panStart = { x: ev.clientX, y: ev.clientY };
        vptStart = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : null;
        return;
      }

      // ERASER OBJECT: klik usuwa obiekt
      if (tool === TOOL.ERASER && getEraserMode() === "OBJECT") {
        const target = opt.target;
        if (target) {
          fabricCanvas.remove(target);
          fabricCanvas.requestRenderAll();
          pushUndo();
          ctx.markDirty?.();
          schedulePreview(80);
        }
        return;
      }

      // POLY
      if (tool === TOOL.POLY) {
        const wp = getWorldPointFromMouse(ev);
        addPolyPoint(wp);
        return;
      }

      // SHAPES
      if (tool === TOOL.LINE || tool === TOOL.RECT || tool === TOOL.ELLIPSE) {
        startFigure(ev);
        return;
      }
    });

    fabricCanvas.on("mouse:move", (opt) => {
      const ev = opt.e;

      // PAN: clamp
      if (tool === TOOL.PAN && panDown && vptStart) {
        const dx = ev.clientX - panStart.x;
        const dy = ev.clientY - panStart.y;
        const v = vptStart.slice();
        v[4] += dx;
        v[5] += dy;
        fabricCanvas.setViewportTransform(v);
        clampViewport();
        fabricCanvas.requestRenderAll();
        return;
      }

      if (drawingObj) updateFigure(ev);
    });

    fabricCanvas.on("mouse:up", () => {
      if (tool === TOOL.PAN) {
        panDown = false;
        vptStart = null;
        return;
      }
      if (drawingObj) finishFigure();
    });

    // Dwuklik kończy polygon
    drawCanvasEl.addEventListener("dblclick", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (tool !== TOOL.POLY) return;
      ev.preventDefault();
      finalizePolygon();
    });

    // Wheel zoom (tylko SELECT/PAN)
    drawCanvasEl.addEventListener("wheel", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!(tool === TOOL.PAN || tool === TOOL.SELECT)) return;

      ev.preventDefault();

      const rect = drawCanvasEl.getBoundingClientRect();
      const pt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);

      zoomBy(ev.deltaY < 0 ? 1.1 : 0.9, pt);
      schedulePreview(120);
    }, { passive: false });

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      if (ctx.getMode?.() !== "DRAW") return;
      resizeScene();
    });
    if (drawStageHost) ro.observe(drawStageHost);
    else if (paneDraw) ro.observe(paneDraw);

    // Start
    setTool(TOOL.SELECT);
    zoomTo100();
    setCursorForTool();
    schedulePreview(60);
  }

  // =========================================================
  // UI bind
  // =========================================================
  let uiBound = false;

  function bindUiOnce() {
    tSelect?.addEventListener("click", () => setTool(TOOL.SELECT));
    tPan?.addEventListener("click", () => setTool(TOOL.PAN));

    tZoomIn?.addEventListener("click", () => { zoomBy(1.15); schedulePreview(120); });
    tZoomOut?.addEventListener("click", () => { zoomBy(0.87); schedulePreview(120); });
    tZoom100?.addEventListener("click", () => { zoomTo100(); schedulePreview(120); });

    // placeholder: brak akcji
    if (tZoomFit) {
      tZoomFit.disabled = true;
      tZoomFit.title = "—";
    }

    tBrush?.addEventListener("click", () => { setTool(TOOL.BRUSH); applyBrushStyle(); });
    tEraser?.addEventListener("click", () => { setTool(TOOL.ERASER); if (getEraserMode()==="BLACK") applyBrushStyle(); });

    tLine?.addEventListener("click", () => setTool(TOOL.LINE));
    tRect?.addEventListener("click", () => setTool(TOOL.RECT));
    tEllipse?.addEventListener("click", () => setTool(TOOL.ELLIPSE));
    tPoly?.addEventListener("click", () => setTool(TOOL.POLY));

    tUndo?.addEventListener("click", () => undo());
    tRedo?.addEventListener("click", () => redo());

    tClear?.addEventListener("click", () => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!fabricCanvas) return;

      const ok = confirm("Wyczyścić wszystko?");
      if (!ok) return;

      clearPolyDraft();
      fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();

      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    tEye?.addEventListener("click", () => openEyePreview());

    tSettings?.addEventListener("click", () => openSettingsModal());
    drawPopClose?.addEventListener("click", () => closeSettingsModal());

    // klik poza modalem zamyka
    paneDraw?.addEventListener("pointerdown", (ev) => {
      if (!drawPop || drawPop.style.display === "none") return;
      const t = ev.target;
      if (t === drawPop || drawPop.contains(t)) return;
      if (tSettings && (t === tSettings || tSettings.contains(t))) return;
      closeSettingsModal();
    }, true);

    tPolyDone?.addEventListener("click", () => {
      if (tool !== TOOL.POLY) return;
      finalizePolygon();
    });
  }

  // =========================================================
  // API
  // =========================================================
  return {
    open() {
      show(paneDraw, true);

      if (!uiBound) { bindUiOnce(); uiBound = true; }
      installFabricOnce();

      // reset sesji rysunku (ustawienia narzędzi zostają)
      if (fabricCanvas) {
        closeSettingsModal();
        clearPolyDraft();

        // czyścimy obiekty
        fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
        fabricCanvas.discardActiveObject();
        fabricCanvas.backgroundColor = "#000";

        // world/viewport do granic
        resizeScene();
        zoomTo100();

        fabricCanvas.requestRenderAll();

        undoStack = [];
        redoStack = [];
        pushUndo();
        updateUndoRedoButtons();

        setTool(TOOL.SELECT);
        ctx.clearDirty?.();
        schedulePreview(60);
      }
    },

    close() {
      show(paneDraw, false);
      closeSettingsModal();
    },

    async getCreatePayload() {
      // twardo odśwież preview teraz (stabilnie)
      schedulePreview(0);

      return {
        ok: true,
        type: TYPE_PIX,
        payload: {
          w: DOT_W,
          h: DOT_H,
          format: "BITPACK_MSB_FIRST_ROW_MAJOR",
          bits_b64: ctx.packBitsRowMajorMSB(bits150, DOT_W, DOT_H),
        },
      };
    },
  };
}
