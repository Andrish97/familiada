// familiada/logo-editor/js/draw.js
// DRAW -> Fabric.js (wektor) -> raster 150x70 bits (PIX_150x70)
//
// ZAŁOŻENIA (Twoje):
// - WORLD = SCENA (rozmiar świata = rozmiar canvasa; granice świata = granice sceny)
// - można przybliżać (zoom in), ale oddalać tylko do granic świata (min zoom = 1)
// - pan tylko gdy zoom > 1 i zawsze ograniczony (bez pokazywania "poza")
// - nie można rysować / przesuwać obiektów poza granice świata
// - gumka: tylko usuwanie obiektów "dotykiem" (bez ustawień)
// - kolor obramowania = kolor domyślny narzędzia (⬛️/⬜️ na toolbarze)
// - fill ma osobny wybór koloru w ustawieniach narzędzia (dla figur)
// - kursor: overlay (PS-like): pędzel = kółko, gumka = kwadrat, figury = crosshair
// - skróty: PS-like + (Space=Pan temp, Ctrl/Cmd=Select temp, Shift idealne kształty, strzałki przesuwają)

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // =========================================================
  // DOM
  // =========================================================
  const paneDraw = document.getElementById("paneDraw");
  const drawCanvasEl = document.getElementById("drawStage");
  const drawStageHost = document.getElementById("drawStageHost"); // ratio box

  // Buttons (z HTML)
  const tSelect   = document.getElementById("tSelect");
  const tPan      = document.getElementById("tPan");
  const tZoomIn   = document.getElementById("tZoomIn");
  const tZoomOut  = document.getElementById("tZoomOut");

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

  // NOWE (dopisz w HTML):
  const tColor    = document.getElementById("tColor");  // ⬛️/⬜️ (kolor obramowania)
  const tBg       = document.getElementById("tBg");     // 🖼️ (tło)

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

  // WORLD = SCENA:
  let worldW = 1;
  let worldH = 1;

  const MIN_ZOOM = 1.0;
  const MAX_ZOOM = 12.0;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };

  function requireFabric() {
    const f = window.fabric;
    if (!f) throw new Error("Brak Fabric.js (script nie wczytany).");
    return f;
  }

  function isEditableTarget(t) {
    if (!t) return false;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (t.isContentEditable) return true;
    return false;
  }

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function clampWorldPoint(p) {
    return { x: clamp(p.x, 0, worldW), y: clamp(p.y, 0, worldH) };
  }

  // =========================================================
  // Tool state
  // =========================================================
  const TOOL = {
    SELECT: "SELECT",
    PAN: "PAN",
    BRUSH: "BRUSH",
    ERASER: "ERASER",   // TYLKO OBJECT erase
    LINE: "LINE",
    RECT: "RECT",
    ELLIPSE: "ELLIPSE",
    POLY: "POLY",
  };

  // baseTool = narzędzie wybrane przez klik / klawisz
  // tool = narzędzie aktualne (może być chwilowo podmienione przez Space/Ctrl)
  let baseTool = TOOL.SELECT;
  let tool = TOOL.SELECT;

  // Kolor domyślny (stroke) — globalny przełącznik ⬛️/⬜️
  let fg = "WHITE"; // WHITE | BLACK

  function fgColor() { return fg === "BLACK" ? "#000" : "#fff"; }
  function fgLabel() { return fg === "BLACK" ? "⬛️" : "⬜️"; }

  // Tło sceny — 🖼️
  let bg = "BLACK"; // BLACK | WHITE
  function bgColor() { return bg === "WHITE" ? "#fff" : "#000"; }

  // Ustawienia narzędzi:
  // - brush: stroke
  // - eraser: brak ustawień
  // - line: stroke
  // - rect/ellipse/poly: stroke + fill bool + fillColor (WHITE/BLACK)
  const toolSettings = {
    [TOOL.BRUSH]:   { stroke: 6 },
    [TOOL.LINE]:    { stroke: 6 },
    [TOOL.RECT]:    { stroke: 6, fill: false, fillColor: "WHITE" },
    [TOOL.ELLIPSE]: { stroke: 6, fill: false, fillColor: "WHITE" },
    [TOOL.POLY]:    { stroke: 6, fill: false, fillColor: "WHITE" },
  };

  function getStroke() {
    const s = toolSettings[tool]?.stroke;
    return clamp(Number(s || 6), 1, 80);
  }

  function getFillEnabled() {
    return !!toolSettings[tool]?.fill;
  }

  function getFillColorHex() {
    const c = toolSettings[tool]?.fillColor === "BLACK" ? "#000" : "#fff";
    return c;
  }

  // =========================================================
  // Fabric
  // =========================================================
  let fabricCanvas = null;
  let initialized = false;

  // Pan
  let panDown = false;
  let panStart = { x: 0, y: 0 };
  let vptStart = null;

  // Shapes in progress
  let drawingObj = null;
  let drawingStart = null; // world point start (for shift constraints)
  let drawingShift = false;

  // Polygon
  let polyPoints = [];
  let polyPreview = null;

  // Undo/Redo
  let undoStack = [];
  let redoStack = [];
  let undoBusy = false;

  // Preview bits
  let bits150 = new Uint8Array(DOT_W * DOT_H);
  let _deb = null;
  let _previewSeq = 0;

  // Temp modifiers
  let holdSpace = false;
  let holdCtrl = false;

  // Cursor overlay
  let cursorLayer = null;
  let cursorDot = null;  // div we draw as circle/square via CSS
  let lastPointer = { x: 0, y: 0 };

  // =========================================================
  // Sizing: WORLD = SCENA
  // =========================================================
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

  function updateClipPath() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    // clip w układzie świata (absolutePositioned)
    fabricCanvas.clipPath = new f.Rect({
      left: 0,
      top: 0,
      width: worldW,
      height: worldH,
      absolutePositioned: true,
    });
  }

  function resetView() {
    if (!fabricCanvas) return;
    // WORLD=SCENA: zoom=1 i brak przesunięcia
    fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fabricCanvas.requestRenderAll();
  }

  function clampViewport() {
    if (!fabricCanvas) return;

    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();
    const z = fabricCanvas.getZoom();

    const v = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : [z,0,0,z,0,0];

    // Gdy z==1: minE = 0, maxE=0 -> zawsze 0
    const minE = cw - worldW * z;
    const maxE = 0;
    const minF = ch - worldH * z;
    const maxF = 0;

    v[4] = clamp(v[4], minE, maxE);
    v[5] = clamp(v[5], minF, maxF);

    fabricCanvas.setViewportTransform(v);
  }

  // Skalowanie istniejących obiektów przy resize (WORLD zmienia rozmiar)
  function scaleAllObjects(oldW, oldH, newW, newH) {
    if (!fabricCanvas) return;
    if (oldW <= 0 || oldH <= 0) return;
    // aspekt stały, więc skala w praktyce ta sama
    const sx = newW / oldW;
    const sy = newH / oldH;
    const s = (Math.abs(sx - sy) < 1e-6) ? sx : Math.min(sx, sy);

    if (!isFinite(s) || s <= 0) return;
    if (Math.abs(s - 1) < 1e-6) return;

    fabricCanvas.getObjects().forEach(o => {
      // Fabric ogarnia większość typów przez scale/left/top
      o.scaleX = (o.scaleX || 1) * s;
      o.scaleY = (o.scaleY || 1) * s;
      o.left = (o.left || 0) * s;
      o.top  = (o.top  || 0) * s;

      // Dla linii/polilinii/poligonów/punktów: skala też działa, ale współrzędne punktów zostają
      // w "lokalnym" układzie — i tak Fabric to renderuje przez scaleX/scaleY.
      o.setCoords();
    });

    fabricCanvas.requestRenderAll();
  }

  let _resizeRaf = 0;
  function resizeScene() {
    if (!fabricCanvas || !drawCanvasEl) return;
    const { w, h } = getStageSize();

    const oldW = worldW;
    const oldH = worldH;

    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
    fabricCanvas.calcOffset();

    updateWorldSize(w, h);
    updateClipPath();

    // dopasuj content do nowej sceny (WORLD=SCENA)
    if (oldW > 1 && oldH > 1) scaleAllObjects(oldW, oldH, worldW, worldH);

    resetView();
    clampViewport();
    updateCursorVisual(); // żeby kursor zgadzał się z zoom
    schedulePreview(60);
  }

  // =========================================================
  // Zoom
  // =========================================================
  function setZoomClamped(nextZoom, center = null) {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const pt = center || new f.Point(fabricCanvas.getWidth()/2, fabricCanvas.getHeight()/2);
    fabricCanvas.zoomToPoint(pt, z);

    // przy min zoom ustawiamy też twardo pan=0
    if (z <= MIN_ZOOM + 1e-6) {
      fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    } else {
      clampViewport();
    }

    fabricCanvas.requestRenderAll();
    updateCursorVisual();
    updateZoomButtons();
  }

  function zoomBy(factor, center = null) {
    if (!fabricCanvas) return;
    setZoomClamped(fabricCanvas.getZoom() * factor, center);
  }

  function zoomTo100() {
    setZoomClamped(1.0, null);
  }

  function updateZoomButtons() {
    if (!fabricCanvas) return;
    const z = fabricCanvas.getZoom();
    if (tZoomOut) tZoomOut.disabled = z <= MIN_ZOOM + 1e-6;
    if (tPan) {
      // ręka w sensie "tryb" nadal można mieć, ale pan fizycznie nic nie zrobi przy zoom=1
      // nie blokujemy przycisku, tylko w mouse down ignorujemy.
    }
  }

  // =========================================================
  // Styles
  // =========================================================
  function makeStrokeFillStyle() {
    const w = getStroke();
    const strokeHex = fgColor();
    const fillHex = getFillEnabled() ? getFillColorHex() : "rgba(0,0,0,0)";
    return {
      stroke: strokeHex,
      strokeWidth: w,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      fill: fillHex,
    };
  }

  function applyBrushStyle() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    if (!fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush = new f.PencilBrush(fabricCanvas);
    }
    fabricCanvas.freeDrawingBrush.width = getStroke();
    fabricCanvas.freeDrawingBrush.color = fgColor();
    fabricCanvas.freeDrawingBrush.decimate = 0;
  }

  // =========================================================
  // Cursor overlay (metoda 2)
  // =========================================================
  function ensureCursorOverlay() {
    if (!drawStageHost) return;
    if (cursorLayer) return;

    cursorLayer = document.createElement("div");
    cursorLayer.style.position = "absolute";
    cursorLayer.style.inset = "0";
    cursorLayer.style.pointerEvents = "none";
    cursorLayer.style.zIndex = "25"; // nad canvasem, pod popoverem (ten ma z-index 30)

    cursorDot = document.createElement("div");
    cursorDot.style.position = "absolute";
    cursorDot.style.left = "0";
    cursorDot.style.top = "0";
    cursorDot.style.transform = "translate(-9999px, -9999px)";
    cursorDot.style.border = "1px solid rgba(255,255,255,.85)";
    cursorDot.style.boxShadow = "0 0 0 1px rgba(0,0,0,.35)";
    cursorDot.style.borderRadius = "999px";
    cursorDot.style.background = "transparent";

    cursorLayer.appendChild(cursorDot);
    drawStageHost.style.position = "relative";
    drawStageHost.appendChild(cursorLayer);
  }

  function setCanvasCursor(css) {
    if (!drawCanvasEl) return;
    drawCanvasEl.style.cursor = css || "";
  }

  function hideOverlayCursor() {
    if (!cursorDot) return;
    cursorDot.style.transform = "translate(-9999px, -9999px)";
  }

  function updateCursorVisual() {
    if (!fabricCanvas) return;
    ensureCursorOverlay();

    // Domyślnie: overlay ukryty, kursor normalny
    let showOverlay = false;

    // Styl overlay
    if (tool === TOOL.BRUSH) {
      showOverlay = true;
      setCanvasCursor("none");
      const z = fabricCanvas.getZoom();
      const d = Math.max(6, Math.round(getStroke() * z)); // ekranowy rozmiar
      cursorDot.style.width = `${d}px`;
      cursorDot.style.height = `${d}px`;
      cursorDot.style.borderRadius = "999px";
      cursorDot.style.border = "1px solid rgba(255,255,255,.85)";
      cursorDot.style.background = "transparent";
    } else if (tool === TOOL.ERASER) {
      showOverlay = true;
      setCanvasCursor("none");
      const d = 10; // mały kwadrat – stały (czytelny)
      cursorDot.style.width = `${d}px`;
      cursorDot.style.height = `${d}px`;
      cursorDot.style.borderRadius = "2px";
      cursorDot.style.border = "1px solid rgba(255,255,255,.85)";
      cursorDot.style.background = "transparent";
    } else if (tool === TOOL.PAN) {
      setCanvasCursor("grab");
    } else if (tool === TOOL.SELECT) {
      setCanvasCursor("default");
    } else {
      // figury + POLY: crosshair (jak pro appki)
      setCanvasCursor("crosshair");
    }

    // pokaż/ukryj
    if (!showOverlay) {
      hideOverlayCursor();
    } else {
      // odśwież pozycję (ostatni pointer)
      placeOverlayAt(lastPointer.x, lastPointer.y);
    }
  }

  function placeOverlayAt(clientX, clientY) {
    if (!cursorDot || !drawCanvasEl) return;
    const rect = drawCanvasEl.getBoundingClientRect();
    const x = Math.round(clientX - rect.left);
    const y = Math.round(clientY - rect.top);
    cursorDot.style.transform = `translate(${x - cursorDot.offsetWidth/2}px, ${y - cursorDot.offsetHeight/2}px)`;
  }

  // =========================================================
  // UI: tools
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

    if (tColor) tColor.textContent = fgLabel();
  }

  function applyToolBehavior() {
    if (!fabricCanvas) return;

    if (tool === TOOL.SELECT) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = true;
      fabricCanvas.forEachObject(o => { o.selectable = true; o.evented = true; });
      clearPolyDraft();
    } else if (tool === TOOL.PAN) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      clearPolyDraft();
    } else if (tool === TOOL.BRUSH) {
      fabricCanvas.isDrawingMode = true;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      clearPolyDraft();
      applyBrushStyle();
    } else if (tool === TOOL.ERASER) {
      // gumka: tylko obiektowa, więc:
      // - nie rysujemy
      // - obiekty evented=true, żeby opt.target działał
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = true; });
      clearPolyDraft();
    } else {
      // figury + POLY
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      if (tool !== TOOL.POLY) clearPolyDraft();
    }

    syncToolButtons();
    updateCursorVisual();
    schedulePreview(80);
  }

  function setBaseTool(next) {
    baseTool = next;
    // jeśli nie trzymamy temp-modyfikatorów — zmieniamy od razu
    if (!holdSpace && !holdCtrl) {
      tool = baseTool;
      applyToolBehavior();
    }
  }

  function recomputeTempTool() {
    // Priorytet jak w praktyce: Space (Pan) ma wyższy priorytet niż Ctrl (Select)
    let next = baseTool;
    if (holdSpace) next = TOOL.PAN;
    else if (holdCtrl) next = TOOL.SELECT;

    if (next !== tool) {
      tool = next;
      applyToolBehavior();
    }
  }

  // =========================================================
  // Undo/Redo
  // =========================================================
  function snapshotJSON() {
    if (!fabricCanvas) return null;
    // zapisujemy wszystkie właściwości, które wpływają na wygląd
    return fabricCanvas.toDatalessJSON([
      "stroke","strokeWidth","strokeLineCap","strokeLineJoin","fill",
      "opacity","skewX","skewY","angle"
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
    if (undoStack.length > 60) undoStack.shift();
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
  // Polygon
  // =========================================================
  function clearPolyDraft() {
    polyPoints = [];
    if (polyPreview && fabricCanvas) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
      fabricCanvas.requestRenderAll();
    }
    syncToolButtons();
  }

  function popPolyPoint() {
    if (polyPoints.length === 0) return;
    polyPoints.pop();
    if (!fabricCanvas) return;

    if (!polyPreview) return;

    if (polyPoints.length === 0) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
    } else {
      polyPreview.set({ points: polyPoints });
    }

    fabricCanvas.requestRenderAll();
    syncToolButtons();
  }

  function getWorldPointFromMouse(ev) {
    const f = requireFabric();
    const rect = drawCanvasEl.getBoundingClientRect();
    const canvasPt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
    const inv = f.util.invertTransform(fabricCanvas.viewportTransform);
    const wp = f.util.transformPoint(canvasPt, inv);
    return clampWorldPoint({ x: wp.x, y: wp.y });
  }

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
    fabricCanvas.requestRenderAll();

    clearPolyDraft();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  // =========================================================
  // Shapes (line/rect/ellipse)
  // Shift constraints:
  // - LINE: 45°
  // - RECT: square
  // - ELLIPSE: circle
  // =========================================================
  function startFigure(ev, shiftKey) {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const p0 = getWorldPointFromMouse(ev);
    drawingStart = p0;
    drawingShift = !!shiftKey;

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

  function updateFigure(ev, shiftKey) {
    if (!fabricCanvas || !drawingObj || !drawingStart) return;
    const p = getWorldPointFromMouse(ev);
    const shift = !!shiftKey;

    if (tool === TOOL.LINE && drawingObj.type === "line") {
      let x2 = p.x, y2 = p.y;

      if (shift) {
        // 45° snap
        const dx = p.x - drawingStart.x;
        const dy = p.y - drawingStart.y;
        const ang = Math.atan2(dy, dx);
        const step = Math.PI / 4; // 45deg
        const snapped = Math.round(ang / step) * step;
        const len = Math.hypot(dx, dy);
        x2 = drawingStart.x + Math.cos(snapped) * len;
        y2 = drawingStart.y + Math.sin(snapped) * len;

        const cl = clampWorldPoint({ x: x2, y: y2 });
        x2 = cl.x; y2 = cl.y;
      }

      drawingObj.set({ x2, y2 });
      fabricCanvas.requestRenderAll();
      return;
    }

    if (tool === TOOL.RECT && drawingObj.type === "rect") {
      const x0 = drawingStart.x;
      const y0 = drawingStart.y;

      let w = p.x - x0;
      let h = p.y - y0;

      if (shift) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }

      const left = w >= 0 ? x0 : x0 + w;
      const top  = h >= 0 ? y0 : y0 + h;

      const pLT = clampWorldPoint({ x: left, y: top });
      const pRB = clampWorldPoint({ x: left + Math.abs(w), y: top + Math.abs(h) });

      drawingObj.set({
        left: pLT.x,
        top: pLT.y,
        width: Math.max(1, pRB.x - pLT.x),
        height: Math.max(1, pRB.y - pLT.y),
      });

      fabricCanvas.requestRenderAll();
      return;
    }

    if (tool === TOOL.ELLIPSE && drawingObj.type === "ellipse") {
      const x0 = drawingStart.x;
      const y0 = drawingStart.y;

      let w = p.x - x0;
      let h = p.y - y0;

      if (shift) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }

      const left = w >= 0 ? x0 : x0 + w;
      const top  = h >= 0 ? y0 : y0 + h;

      const pLT = clampWorldPoint({ x: left, y: top });
      const pRB = clampWorldPoint({ x: left + Math.abs(w), y: top + Math.abs(h) });

      // Fabric ellipse: rx/ry to promienie
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
    drawingObj = null;
    drawingStart = null;
    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  // =========================================================
  // Clamp obiektów w SELECT (przesuwanie/skalowanie)
  // =========================================================
  function clampObjectToWorld(obj) {
    if (!fabricCanvas || !obj) return;
    const f = requireFabric();

    // bounding rect w coords canvasa (po viewport)
    const br = obj.getBoundingRect(true, true);

    const inv = f.util.invertTransform(fabricCanvas.viewportTransform);

    const tlCanvas = new f.Point(br.left, br.top);
    const brCanvas = new f.Point(br.left + br.width, br.top + br.height);

    const tlWorld = f.util.transformPoint(tlCanvas, inv);
    const brWorld = f.util.transformPoint(brCanvas, inv);

    let dx = 0;
    let dy = 0;

    if (tlWorld.x < 0) dx = -tlWorld.x;
    if (tlWorld.y < 0) dy = -tlWorld.y;

    if (brWorld.x > worldW) dx = dx + (worldW - brWorld.x);
    if (brWorld.y > worldH) dy = dy + (worldH - brWorld.y);

    if (dx !== 0 || dy !== 0) {
      obj.left = (obj.left || 0) + dx;
      obj.top  = (obj.top  || 0) + dy;
      obj.setCoords();
    }
  }

  // =========================================================
  // Preview/export (stabilne, niezależne od zoom/pan)
  // =========================================================
  async function renderWorldTo150x70CanvasStable() {
    if (!fabricCanvas) return null;
    const f = requireFabric();

    const json = snapshotJSON();
    if (!json) return null;

    const el = f.util.createCanvasElement();
    el.width = DOT_W;
    el.height = DOT_H;

    const sc = new f.StaticCanvas(el, {
      backgroundColor: bgColor(),
      renderOnAddRemove: false,
    });

    // WORLD -> DOT (stała skala)
    const sx = DOT_W / Math.max(1, worldW);
    const sy = DOT_H / Math.max(1, worldH);
    const s = Math.min(sx, sy);

    sc.setViewportTransform([s, 0, 0, s, 0, 0]);

    await new Promise((res) => {
      sc.loadFromJSON(json, () => {
        sc.renderAll();
        res();
      });
    });

    sc.dispose?.();
    return el;
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

  function schedulePreview(ms = 80) {
    clearTimeout(_deb);
    const mySeq = ++_previewSeq;

    _deb = setTimeout(async () => {
      if (mySeq !== _previewSeq) return;
      const c = await renderWorldTo150x70CanvasStable();
      if (!c) return;
      if (mySeq !== _previewSeq) return;

      bits150 = canvasToBits150(c);
      ctx.onPreview?.({ kind: "PIX", bits: bits150 });
    }, ms);
  }

  function openEyePreview() {
    window.dispatchEvent(new CustomEvent("logoeditor:openPreview", {
      detail: { kind: "PIX", bits: bits150 }
    }));
  }

  // =========================================================
  // Settings modal (fill color + stroke)
  // =========================================================
  function toolHasSettings(t) {
    return t === TOOL.BRUSH || t === TOOL.LINE || t === TOOL.RECT || t === TOOL.ELLIPSE || t === TOOL.POLY;
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

    // Grubość
    {
      const row = document.createElement("label");
      row.className = "popRow";
      row.innerHTML = `
        <span>Grubość</span>
        <input class="inp" id="popStroke" type="number" min="1" max="80" step="1" value="${Number(st.stroke || 6)}">
      `;
      drawPopBody.appendChild(row);
    }

    // Fill tylko dla rect/ellipse/poly
    const fillAllowed = (tool === TOOL.RECT || tool === TOOL.ELLIPSE || tool === TOOL.POLY);
    if (fillAllowed) {
      const enabled = !!st.fill;
      const fc = (st.fillColor === "BLACK") ? "BLACK" : "WHITE";

      const row = document.createElement("label");
      row.className = "popRow";
      row.innerHTML = `
        <span>Wypełnij</span>
        <input id="popFill" type="checkbox" ${enabled ? "checked" : ""}>
      `;
      drawPopBody.appendChild(row);

      const row2 = document.createElement("div");
      row2.className = "popRow";
      row2.innerHTML = `
        <span>Kolor wypełnienia</span>
        <select class="inp" id="popFillColor" ${enabled ? "" : "disabled"}>
          <option value="WHITE" ${fc === "WHITE" ? "selected" : ""}>Biały</option>
          <option value="BLACK" ${fc === "BLACK" ? "selected" : ""}>Czarny</option>
        </select>
      `;
      drawPopBody.appendChild(row2);
    }

    // Bind
    const popStroke = drawPopBody.querySelector("#popStroke");
    const popFill = drawPopBody.querySelector("#popFill");
    const popFillColor = drawPopBody.querySelector("#popFillColor");

    popStroke?.addEventListener("input", () => {
      toolSettings[tool] = { ...(toolSettings[tool] || {}), stroke: clamp(Number(popStroke.value || 6), 1, 80) };
      if (tool === TOOL.BRUSH) applyBrushStyle();
      updateCursorVisual();
      schedulePreview(80);
    });

    popFill?.addEventListener("change", () => {
      toolSettings[tool] = { ...(toolSettings[tool] || {}), fill: !!popFill.checked };
      renderSettingsModal(); // żeby włączyć/wyłączyć dropdown koloru fill
      schedulePreview(80);
    });

    popFillColor?.addEventListener("change", () => {
      toolSettings[tool] = {
        ...(toolSettings[tool] || {}),
        fillColor: (popFillColor.value === "BLACK") ? "BLACK" : "WHITE"
      };
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
  // Helpers: delete/duplicate/move selection
  // =========================================================
  function deleteSelection() {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    if (active.type === "activeSelection") {
      active.getObjects().forEach(o => fabricCanvas.remove(o));
    } else {
      fabricCanvas.remove(active);
    }

    fabricCanvas.discardActiveObject();
    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  function moveSelection(dx, dy) {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    const moveObj = (o) => {
      o.left = (o.left || 0) + dx;
      o.top  = (o.top  || 0) + dy;
      clampObjectToWorld(o);
      o.setCoords();
    };

    if (active.type === "activeSelection") {
      active.getObjects().forEach(moveObj);
      active.setCoords();
    } else {
      moveObj(active);
    }

    fabricCanvas.requestRenderAll();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  async function duplicateSelection() {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    const f = requireFabric();

    // klon działa różnie w zależności od typu
    active.clone((cloned) => {
      fabricCanvas.discardActiveObject();

      if (cloned.type === "activeSelection") {
        cloned.canvas = fabricCanvas;
        cloned.getObjects().forEach((obj) => {
          obj.left += 10;
          obj.top  += 10;
          clampObjectToWorld(obj);
          fabricCanvas.add(obj);
        });
        cloned.setCoords();
      } else {
        cloned.left += 10;
        cloned.top  += 10;
        clampObjectToWorld(cloned);
        fabricCanvas.add(cloned);
      }

      fabricCanvas.requestRenderAll();
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    }, ["stroke","strokeWidth","fill","strokeLineCap","strokeLineJoin"]);
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
      backgroundColor: bgColor(),
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
    });

    ensureCursorOverlay();

    // rozmiar + world
    resizeScene();
    updateZoomButtons();

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
      if (tool === TOOL.SELECT && e?.target) clampObjectToWorld(e.target);
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

      // aktualizacja overlay kursora
      lastPointer = { x: ev.clientX, y: ev.clientY };
      placeOverlayAt(ev.clientX, ev.clientY);

      if (tool === TOOL.PAN) {
        if (fabricCanvas.getZoom() <= MIN_ZOOM + 1e-6) return; // pan nie ma sensu przy z=1
        panDown = true;
        panStart = { x: ev.clientX, y: ev.clientY };
        vptStart = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : null;
        return;
      }

      if (tool === TOOL.ERASER) {
        // usuwanie obiektu dotykiem:
        // - na down usuń to, co jest pod kursorem
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

      if (tool === TOOL.POLY) {
        const wp = getWorldPointFromMouse(ev);
        addPolyPoint(wp);
        return;
      }

      if (tool === TOOL.LINE || tool === TOOL.RECT || tool === TOOL.ELLIPSE) {
        startFigure(ev, ev.shiftKey);
        return;
      }
    });

    fabricCanvas.on("mouse:move", (opt) => {
      const ev = opt.e;
      lastPointer = { x: ev.clientX, y: ev.clientY };
      placeOverlayAt(ev.clientX, ev.clientY);

      if (tool === TOOL.PAN && panDown && vptStart) {
        const dx = ev.clientX - panStart.x;
        const dy = ev.clientY - panStart.y;
        const v = vptStart.slice();
        v[4] += dx;
        v[5] += dy;
        fabricCanvas.setViewportTransform(v);
        clampViewport();
        fabricCanvas.requestRenderAll();
        updateCursorVisual();
        return;
      }

      // Gumka: usuwa obiekty, które dotyka (ciągły erase)
      if (tool === TOOL.ERASER) {
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

      if (drawingObj) updateFigure(ev, ev.shiftKey);
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

    // Wheel zoom (tylko select/pan) + min zoom = 1
    drawCanvasEl.addEventListener("wheel", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!(tool === TOOL.PAN || tool === TOOL.SELECT)) return;

      ev.preventDefault();

      const rect = drawCanvasEl.getBoundingClientRect();
      const pt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
      zoomBy(ev.deltaY < 0 ? 1.1 : 0.9, pt);

      schedulePreview(120);
    }, { passive: false });

    // ResizeObserver (debounce przez rAF)
    const ro = new ResizeObserver(() => {
      if (ctx.getMode?.() !== "DRAW") return;
      cancelAnimationFrame(_resizeRaf);
      _resizeRaf = requestAnimationFrame(resizeScene);
    });
    if (drawStageHost) ro.observe(drawStageHost);
    else if (paneDraw) ro.observe(paneDraw);

    // Start
    baseTool = TOOL.SELECT;
    tool = TOOL.SELECT;
    applyToolBehavior();
    zoomTo100();
    schedulePreview(80);
  }

  // =========================================================
  // Keyboard shortcuts
  // =========================================================
  function cycleShapeTool() {
    // Linia -> Prostokąt -> Elipsa -> Wielokąt
    const order = [TOOL.LINE, TOOL.RECT, TOOL.ELLIPSE, TOOL.POLY];
    const i = order.indexOf(baseTool);
    const next = order[(i >= 0 ? i + 1 : 0) % order.length];
    setBaseTool(next);
  }

  function toggleFg() {
    fg = (fg === "BLACK") ? "WHITE" : "BLACK";
    if (tColor) tColor.textContent = fgLabel();
    if (tool === TOOL.BRUSH) applyBrushStyle();
    schedulePreview(80);
  }

  function toggleBg() {
    bg = (bg === "BLACK") ? "WHITE" : "BLACK";
    if (fabricCanvas) {
      fabricCanvas.backgroundColor = bgColor();
      fabricCanvas.requestRenderAll();
      schedulePreview(80);
    }
  }

  function onKeyDown(ev) {
    if (ctx.getMode?.() !== "DRAW") return;
    if (isEditableTarget(ev.target)) return;

    const key = ev.key;
    const k = key.length === 1 ? key.toLowerCase() : key;

    // Temp modifiers:
    if (key === " " && !holdSpace) {
      ev.preventDefault();
      holdSpace = true;
      recomputeTempTool();
      return;
    }

    if ((ev.ctrlKey || ev.metaKey) && !holdCtrl) {
      // Uwaga: to się aktywuje też przy Ctrl+Z itd.
      // My trzymamy holdCtrl jako "wciśnięty Ctrl/Cmd" tylko wtedy,
      // gdy *nie* jest to skrót operacyjny. Żeby było stabilnie:
      // - ustawiamy holdCtrl na true tylko przy "gołym" Ctrl/Cmd bez litery
      // Ale w JS ciężko to rozróżnić 100%. Robimy pragmatycznie:
      // - jeśli to dokładnie Ctrl lub Meta, wtedy temp-select.
      if (key === "Control" || key === "Meta") {
        holdCtrl = true;
        recomputeTempTool();
        return;
      }
    }

    // Historia
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && k === "z") {
      ev.preventDefault();
      undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && k === "z") {
      ev.preventDefault();
      redo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && k === "y") {
      ev.preventDefault();
      redo();
      return;
    }

    // Zoom
    if ((ev.ctrlKey || ev.metaKey) && k === "1") {
      ev.preventDefault();
      zoomTo100();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && k === "0") {
      ev.preventDefault();
      zoomTo100(); // w tym modelu fit==100
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (k === "+" || k === "=")) {
      ev.preventDefault();
      zoomBy(1.15, null);
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && k === "-") {
      ev.preventDefault();
      zoomBy(0.87, null);
      return;
    }

    // Narzędzia
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (k === "v") { ev.preventDefault(); setBaseTool(TOOL.SELECT); return; }
      if (k === "h") { ev.preventDefault(); setBaseTool(TOOL.PAN); return; }
      if (k === "b") { ev.preventDefault(); setBaseTool(TOOL.BRUSH); return; }
      if (k === "e") { ev.preventDefault(); setBaseTool(TOOL.ERASER); return; }
      if (k === "u") { ev.preventDefault(); cycleShapeTool(); return; }

      // alternatywne bez U (i tak możesz mieć)
      if (k === "l") { ev.preventDefault(); setBaseTool(TOOL.LINE); return; }
      if (k === "r") { ev.preventDefault(); setBaseTool(TOOL.RECT); return; }
      if (k === "o") { ev.preventDefault(); setBaseTool(TOOL.ELLIPSE); return; }
      if (k === "p") { ev.preventDefault(); setBaseTool(TOOL.POLY); return; }

      // Fill toggle (tylko figury z fill)
      if (k === "f") {
        if (baseTool === TOOL.RECT || baseTool === TOOL.ELLIPSE || baseTool === TOOL.POLY) {
          ev.preventDefault();
          toolSettings[baseTool] = { ...(toolSettings[baseTool] || {}), fill: !toolSettings[baseTool]?.fill };
          schedulePreview(80);
        }
        return;
      }

      // Poly
      if (baseTool === TOOL.POLY && key === "Enter") { ev.preventDefault(); finalizePolygon(); return; }
      if (baseTool === TOOL.POLY && key === "Escape") { ev.preventDefault(); clearPolyDraft(); return; }
      if (baseTool === TOOL.POLY && (key === "Backspace" || key === "Delete")) { ev.preventDefault(); popPolyPoint(); return; }

      // [ ] grubość
      if (k === "[") {
        ev.preventDefault();
        const t = baseTool;
        if (toolSettings[t]?.stroke != null) {
          toolSettings[t] = { ...(toolSettings[t] || {}), stroke: clamp((toolSettings[t].stroke || 6) - 1, 1, 80) };
          if (t === TOOL.BRUSH && tool === TOOL.BRUSH) applyBrushStyle();
          updateCursorVisual();
          schedulePreview(80);
        }
        return;
      }
      if (k === "]") {
        ev.preventDefault();
        const t = baseTool;
        if (toolSettings[t]?.stroke != null) {
          toolSettings[t] = { ...(toolSettings[t] || {}), stroke: clamp((toolSettings[t].stroke || 6) + 1, 1, 80) };
          if (t === TOOL.BRUSH && tool === TOOL.BRUSH) applyBrushStyle();
          updateCursorVisual();
          schedulePreview(80);
        }
        return;
      }
    }

    // Delete selection (w Select)
    if ((key === "Backspace" || key === "Delete") && baseTool === TOOL.SELECT) {
      ev.preventDefault();
      deleteSelection();
      return;
    }

    // Duplicuj (Ctrl/Cmd + D)
    if ((ev.ctrlKey || ev.metaKey) && k === "d") {
      ev.preventDefault();
      duplicateSelection();
      return;
    }

    // Strzałki: przesuw zaznaczone (Select)
    if (baseTool === TOOL.SELECT) {
      const step = ev.shiftKey ? 10 : 1;
      if (key === "ArrowLeft")  { ev.preventDefault(); moveSelection(-step, 0); return; }
      if (key === "ArrowRight") { ev.preventDefault(); moveSelection(step, 0); return; }
      if (key === "ArrowUp")    { ev.preventDefault(); moveSelection(0, -step); return; }
      if (key === "ArrowDown")  { ev.preventDefault(); moveSelection(0, step); return; }
    }
  }

  function onKeyUp(ev) {
    if (ctx.getMode?.() !== "DRAW") return;
    if (isEditableTarget(ev.target)) return;

    if (ev.key === " ") {
      holdSpace = false;
      recomputeTempTool();
      return;
    }

    if (ev.key === "Control" || ev.key === "Meta") {
      holdCtrl = false;
      recomputeTempTool();
      return;
    }
  }

  // =========================================================
  // UI bind
  // =========================================================
  let uiBound = false;

  function bindUiOnce() {
    // Tool buttons
    tSelect?.addEventListener("click", () => setBaseTool(TOOL.SELECT));
    tPan?.addEventListener("click", () => setBaseTool(TOOL.PAN));

    tBrush?.addEventListener("click", () => setBaseTool(TOOL.BRUSH));
    tEraser?.addEventListener("click", () => setBaseTool(TOOL.ERASER));
    tLine?.addEventListener("click", () => setBaseTool(TOOL.LINE));
    tRect?.addEventListener("click", () => setBaseTool(TOOL.RECT));
    tEllipse?.addEventListener("click", () => setBaseTool(TOOL.ELLIPSE));
    tPoly?.addEventListener("click", () => setBaseTool(TOOL.POLY));

    // Zoom buttons
    tZoomIn?.addEventListener("click", () => { zoomBy(1.15); schedulePreview(120); });
    tZoomOut?.addEventListener("click", () => { zoomBy(0.87); schedulePreview(120); });

    // History
    tUndo?.addEventListener("click", () => undo());
    tRedo?.addEventListener("click", () => redo());

    // Clear
    tClear?.addEventListener("click", () => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!fabricCanvas) return;

      const ok = confirm("Wyczyścić wszystko?");
      if (!ok) return;

      clearPolyDraft();
      fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
      fabricCanvas.backgroundColor = bgColor();
      fabricCanvas.requestRenderAll();

      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    // Eye
    tEye?.addEventListener("click", () => openEyePreview());

    // Settings
    tSettings?.addEventListener("click", () => openSettingsModal());
    drawPopClose?.addEventListener("click", () => closeSettingsModal());

    // Poly done
    tPolyDone?.addEventListener("click", () => finalizePolygon());

    // Color toggle
    tColor?.addEventListener("click", () => {
      toggleFg();
      // jeśli aktualnie pędzel — od razu zmień styl
      if (tool === TOOL.BRUSH) applyBrushStyle();
      // jeśli rysujemy figury — nowe obiekty będą miały nowy stroke
      schedulePreview(80);
    });

    // Background toggle
    tBg?.addEventListener("click", () => {
      toggleBg();
    });

    // Klik poza modalem zamyka
    paneDraw?.addEventListener("pointerdown", (ev) => {
      if (!drawPop || drawPop.style.display === "none") return;
      const t = ev.target;
      if (t === drawPop || drawPop.contains(t)) return;
      if (tSettings && (t === tSettings || tSettings.contains(t))) return;
      closeSettingsModal();
    }, true);

    // Cursor overlay follow
    drawCanvasEl?.addEventListener("pointermove", (ev) => {
      lastPointer = { x: ev.clientX, y: ev.clientY };
      placeOverlayAt(ev.clientX, ev.clientY);
    });

    // Keyboard
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  // =========================================================
  // API
  // =========================================================
  return {
    open() {
      show(paneDraw, true);

      if (!uiBound) { bindUiOnce(); uiBound = true; }
      installFabricOnce();

      // reset sesji rysunku (ustawienia narzędzi + kolory zostają w pamięci sesji)
      if (fabricCanvas) {
        closeSettingsModal();
        clearPolyDraft();

        fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
        fabricCanvas.backgroundColor = bgColor();

        resizeScene();
        zoomTo100();

        fabricCanvas.requestRenderAll();

        undoStack = [];
        redoStack = [];
        pushUndo();
        updateUndoRedoButtons();

        holdSpace = false;
        holdCtrl = false;

        baseTool = TOOL.SELECT;
        tool = TOOL.SELECT;
        applyToolBehavior();

        ctx.clearDirty?.();
        schedulePreview(80);
      }
    },

    close() {
      show(paneDraw, false);
      closeSettingsModal();
      hideOverlayCursor();
    },

    async getCreatePayload() {
      // odśwież bity stabilnie
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
