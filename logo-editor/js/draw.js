// familiada/logo-editor/js/draw.js
// Tryb: DRAW -> Fabric.js (wektor) -> raster 150x70 bits (PIX_150x70)

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

  // Per-tool settings (pamiętane w sesji)
  const toolSettings = {
    [TOOL.BRUSH]:   { stroke: 6 },
    [TOOL.ERASER]:  { stroke: 10 },
    [TOOL.LINE]:    { stroke: 6 },
    [TOOL.RECT]:    { stroke: 6, fill: false },
    [TOOL.ELLIPSE]: { stroke: 6, fill: false },
    [TOOL.POLY]:    { stroke: 6, fill: false },
  };

  function getStroke() {
    const s = toolSettings[tool]?.stroke;
    return clamp(Number(s || 6), 1, 80);
  }

  function getFill() {
    return !!toolSettings[tool]?.fill;
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

  // Figures
  let drawingObj = null;

  // Polygon draft
  let polyPoints = [];
  let polyPreview = null;

  // Undo/Redo
  let undoStack = [];
  let redoStack = [];
  let undoBusy = false;

  // Preview bits
  let bits150 = new Uint8Array(DOT_W * DOT_H);
  let _deb = null;

  // =========================================================
  // Scene sizing (fix “wypycha w prawo”)
  // =========================================================
  function getStageSize() {
    const host = drawStageHost || drawCanvasEl?.parentElement;
    const rect = host?.getBoundingClientRect?.() || { width: 800, height: 400 };

    let w = Math.max(320, Math.floor(rect.width));
    let h = Math.floor(w / ASPECT);

    // jeśli jest limit wysokości, dopasuj
    if (rect.height > 0 && h > rect.height) {
      h = Math.max(180, Math.floor(rect.height));
      w = Math.floor(h * ASPECT);
    }

    return { w, h };
  }

  function resizeScene() {
    if (!fabricCanvas || !drawCanvasEl) return;
    const { w, h } = getStageSize();

    // ważne: ustawiamy realne wymiary bufora canvasa,
    // a CSS i tak robi width/height:100% w ratio boxie
    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
    fabricCanvas.calcOffset();

    zoomFit(false);
    schedulePreview(40);
  }

  // =========================================================
  // Zoom / viewport
  // =========================================================
  function zoomFit(render = true) {
    if (!fabricCanvas) return;

    const WORLD_W = 2600;
    const WORLD_H = 1100;

    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();

    const s = Math.min(cw / WORLD_W, ch / WORLD_H);
    const tx = (cw - WORLD_W * s) / 2;
    const ty = (ch - WORLD_H * s) / 2;

    fabricCanvas.setViewportTransform([s, 0, 0, s, tx, ty]);
    if (render) fabricCanvas.requestRenderAll();
  }

  function zoomTo100() {
    if (!fabricCanvas) return;
    const WORLD_W = 2600;
    const WORLD_H = 1100;
    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();
    const s = 1.0;
    const tx = (cw - WORLD_W * s) / 2;
    const ty = (ch - WORLD_H * s) / 2;
    fabricCanvas.setViewportTransform([s, 0, 0, s, tx, ty]);
    fabricCanvas.requestRenderAll();
  }

  function zoomBy(factor, center = null) {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const pt = center || new f.Point(fabricCanvas.getWidth()/2, fabricCanvas.getHeight()/2);
    const next = clamp(fabricCanvas.getZoom() * factor, 0.05, 12);
    fabricCanvas.zoomToPoint(pt, next);
    fabricCanvas.requestRenderAll();
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

  function makeEraserStyle() {
    const w = getStroke();
    return {
      stroke: "#000",
      strokeWidth: w,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      fill: "rgba(0,0,0,0)",
    };
  }

  function applyBrushStyle() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    if (!fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush = new f.PencilBrush(fabricCanvas);
    }
    fabricCanvas.freeDrawingBrush.width = getStroke();
    fabricCanvas.freeDrawingBrush.color = (tool === TOOL.ERASER) ? "#000" : "#fff";
    fabricCanvas.freeDrawingBrush.decimate = 0;
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

    // Poly done dostępne tylko w POLY i min. 3 punkty
    if (tPolyDone) tPolyDone.disabled = !(tool === TOOL.POLY && polyPoints.length >= 3);
  }

  function setTool(next) {
    tool = next;
    syncToolButtons();

    if (!fabricCanvas) return;

    // tryby zachowania
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
    } else if (tool === TOOL.BRUSH || tool === TOOL.ERASER) {
      fabricCanvas.isDrawingMode = true;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      clearPolyDraft();
      applyBrushStyle();
    } else {
      // figury i POLY
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      if (tool !== TOOL.POLY) clearPolyDraft();
    }

    // ustawienia nie zmieniają “wstecz” obiektów – tylko następne akcje (jak Paint)
    schedulePreview(60);
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
      schedulePreview(60);
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

  function getWorldPointFromMouse(ev) {
    const f = requireFabric();
    const rect = drawCanvasEl.getBoundingClientRect();
    const canvasPt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
    const inv = f.util.invertTransform(fabricCanvas.viewportTransform);
    return f.util.transformPoint(canvasPt, inv);
  }

  function addPolyPoint(worldPt) {
    polyPoints.push({ x: worldPt.x, y: worldPt.y });
    const f = requireFabric();
    const style = makeStrokeFillStyle();

    if (!polyPreview) {
      polyPreview = new f.Polyline(polyPoints, {
        ...style,
        fill: "rgba(0,0,0,0)", // w trakcie tylko kontur
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
    schedulePreview(60);
  }

  // =========================================================
  // Shapes (line/rect/ellipse)
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

    if (tool === TOOL.LINE && drawingObj.type === "line") {
      drawingObj.set({ x2: p.x, y2: p.y });
      fabricCanvas.requestRenderAll();
      return;
    }

    if (tool === TOOL.RECT && drawingObj.type === "rect") {
      const x0 = drawingObj.left;
      const y0 = drawingObj.top;
      const w = p.x - x0;
      const h = p.y - y0;

      drawingObj.set({
        width: Math.abs(w),
        height: Math.abs(h),
        left: w >= 0 ? x0 : p.x,
        top: h >= 0 ? y0 : p.y,
      });
      fabricCanvas.requestRenderAll();
      return;
    }

    if (tool === TOOL.ELLIPSE && drawingObj.type === "ellipse") {
      const x0 = drawingObj.left;
      const y0 = drawingObj.top;
      const w = p.x - x0;
      const h = p.y - y0;

      const left = w >= 0 ? x0 : p.x;
      const top = h >= 0 ? y0 : p.y;

      drawingObj.set({
        left,
        top,
        rx: Math.max(1, Math.abs(w) / 2),
        ry: Math.max(1, Math.abs(h) / 2),
      });

      fabricCanvas.requestRenderAll();
      return;
    }
  }

  function finishFigure() {
    if (!fabricCanvas || !drawingObj) return;
    drawingObj = null;
    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(60);
  }

  // =========================================================
  // Raster -> bits 150x70 (preview do bigPreview)
  // =========================================================
  function renderTo150x70Canvas() {
    if (!fabricCanvas) return null;
    const src = fabricCanvas.lowerCanvasEl;
    if (!src) return null;

    const out = document.createElement("canvas");
    out.width = DOT_W;
    out.height = DOT_H;

    const g = out.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = true;

    g.fillStyle = "#000";
    g.fillRect(0, 0, DOT_W, DOT_H);
    g.drawImage(src, 0, 0, DOT_W, DOT_H);

    return out;
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
    _deb = setTimeout(() => {
      const c = renderTo150x70Canvas();
      if (!c) return;
      bits150 = canvasToBits150(c);
      ctx.onPreview?.({ kind: "PIX", bits: bits150 });
    }, ms);
  }

  function openEyePreview() {
    // nie mamy dostępu do funkcji z main.js, więc wysyłamy event
    // main.js ma nasłuch i otwiera overlay
    window.dispatchEvent(new CustomEvent("logoeditor:openPreview", {
      detail: { kind: "PIX", bits: bits150 }
    }));
  }

  // =========================================================
  // Settings modal (tylko te, które dotyczą narzędzia)
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

    // wyczyść
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

    // Grubość: zawsze dla narzędzi rysujących
    {
      const row = document.createElement("label");
      row.className = "popRow";
      row.innerHTML = `
        <span>Grubość</span>
        <input class="inp" id="popStroke" type="number" min="1" max="80" step="1" value="${Number(st.stroke || 6)}">
      `;
      drawPopBody.appendChild(row);
    }

    // Wypełnij: tylko dla figur i POLY (nie dla linii, nie dla pędzla/gumki)
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

    popStroke?.addEventListener("input", () => {
      toolSettings[tool] = { ...(toolSettings[tool] || {}), stroke: clamp(Number(popStroke.value || 6), 1, 80) };
      if (tool === TOOL.BRUSH || tool === TOOL.ERASER) applyBrushStyle();
      schedulePreview(60);
    });

    popFill?.addEventListener("change", () => {
      toolSettings[tool] = { ...(toolSettings[tool] || {}), fill: !!popFill.checked };
      schedulePreview(60);
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

    // rozmiar
    resizeScene();

    // undo start
    undoStack = [];
    redoStack = [];
    pushUndo();
    updateUndoRedoButtons();

    // Zmiany -> preview
    fabricCanvas.on("path:created", () => {
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(60);
    });

    fabricCanvas.on("object:modified", () => {
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(60);
    });

    fabricCanvas.on("object:removed", () => {
      if (undoBusy) return;
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(60);
    });

    // Mouse handlers
    fabricCanvas.on("mouse:down", (opt) => {
      const ev = opt.e;

      if (tool === TOOL.PAN) {
        panDown = true;
        panStart = { x: ev.clientX, y: ev.clientY };
        vptStart = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : null;
        return;
      }

      if (tool === TOOL.POLY) {
        const wp = getWorldPointFromMouse(ev);
        addPolyPoint(wp);
        return;
      }

      if (tool === TOOL.LINE || tool === TOOL.RECT || tool === TOOL.ELLIPSE) {
        startFigure(ev);
        return;
      }
    });

    fabricCanvas.on("mouse:move", (opt) => {
      const ev = opt.e;

      if (tool === TOOL.PAN && panDown && vptStart) {
        const dx = ev.clientX - panStart.x;
        const dy = ev.clientY - panStart.y;
        const v = vptStart.slice();
        v[4] += dx;
        v[5] += dy;
        fabricCanvas.setViewportTransform(v);
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

    // Wheel zoom (tylko select/pan)
    drawCanvasEl.addEventListener("wheel", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!(tool === TOOL.PAN || tool === TOOL.SELECT)) return;

      ev.preventDefault();
      const rect = drawCanvasEl.getBoundingClientRect();
      const f = requireFabric();
      const pt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
      zoomBy(ev.deltaY < 0 ? 1.1 : 0.9, pt);
      schedulePreview(80);
    }, { passive: false });

    // Keyboard: Esc anuluje poly, Enter kończy poly
    window.addEventListener("keydown", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;

      if (tool === TOOL.POLY && ev.key === "Escape") {
        ev.preventDefault();
        clearPolyDraft();
        return;
      }

      if (tool === TOOL.POLY && ev.key === "Enter") {
        ev.preventDefault();
        finalizePolygon();
        return;
      }
    });

    // ResizeObserver: utrzymuj poprawne wymiary
    const ro = new ResizeObserver(() => {
      if (ctx.getMode?.() !== "DRAW") return;
      resizeScene();
    });
    if (drawStageHost) ro.observe(drawStageHost);
    else if (paneDraw) ro.observe(paneDraw);

    // Start
    setTool(TOOL.SELECT);
    zoomFit();
    schedulePreview(30);
  }

  // =========================================================
  // UI bind
  // =========================================================
  let uiBound = false;

  function bindUiOnce() {
    tSelect?.addEventListener("click", () => setTool(TOOL.SELECT));
    tPan?.addEventListener("click", () => setTool(TOOL.PAN));

    tZoomIn?.addEventListener("click", () => { zoomBy(1.15); schedulePreview(80); });
    tZoomOut?.addEventListener("click", () => { zoomBy(0.87); schedulePreview(80); });
    tZoom100?.addEventListener("click", () => { zoomTo100(); schedulePreview(80); });
    tZoomFit?.addEventListener("click", () => { zoomFit(); schedulePreview(80); });

    tBrush?.addEventListener("click", () => { setTool(TOOL.BRUSH); applyBrushStyle(); });
    tEraser?.addEventListener("click", () => { setTool(TOOL.ERASER); applyBrushStyle(); });
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
      fabricCanvas.requestRenderAll();

      pushUndo();
      ctx.markDirty?.();
      schedulePreview(30);
    });

    tEye?.addEventListener("click", () => openEyePreview());

    tSettings?.addEventListener("click", () => openSettingsModal());
    drawPopClose?.addEventListener("click", () => closeSettingsModal());

    // klik poza modalem zamyka (tylko gdy klik w panelu)
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

      // reset sesji rysunku (ale ustawienia narzędzi zostają w pamięci sesji)
      if (fabricCanvas) {
        closeSettingsModal();
        clearPolyDraft();
        fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
        fabricCanvas.backgroundColor = "#000";
        fabricCanvas.requestRenderAll();

        undoStack = [];
        redoStack = [];
        pushUndo();
        updateUndoRedoButtons();

        setTool(TOOL.SELECT);
        zoomFit();
        ctx.clearDirty?.();
        schedulePreview(30);
      }
    },

    close() {
      show(paneDraw, false);
      closeSettingsModal();
    },

    async getCreatePayload() {
      // odśwież bity
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
