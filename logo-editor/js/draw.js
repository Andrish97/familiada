// familiada/logo-editor/js/draw.js
// Tryb: DRAW -> Fabric.js (wektor) -> raster 150x70 bits (PIX_150x70)
//
// ZAŁOŻENIE (Twoje):
// - WORLD = SCENA (rozmiar świata = rozmiar canvasa; granice świata = granice sceny)
// - można przybliżać (zoom in), ale oddalać tylko do granic świata (min zoom = 1)
// - nie można rysować / przesuwać obiektów poza granice świata
// - pan tylko wtedy, gdy zoom > 1 i zawsze ograniczony (bez pokazywania "poza")

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

  // WORLD = SCENA:
  // worldW/worldH = aktualny rozmiar canvasa w px
  let worldW = 0;
  let worldH = 0;

  // zoom:
  const MIN_ZOOM = 1.0;     // nie oddalamy poniżej granic świata
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

  function clampWorldPoint(p) {
    return {
      x: clamp(p.x, 0, worldW),
      y: clamp(p.y, 0, worldH),
    };
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

  // Per-tool settings
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
  let _previewSeq = 0;

  // =========================================================
  // Scene sizing (WORLD = SCENA)
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

  // ClipPath: twarda "ramka świata" (widoczność)
  function updateClipPath() {
    if (!fabricCanvas) return;
    const f = requireFabric();

    // clip w układzie świata (absolutePositioned)
    const clip = new f.Rect({
      left: 0,
      top: 0,
      width: worldW,
      height: worldH,
      absolutePositioned: true,
    });

    fabricCanvas.clipPath = clip;
  }

  function resetView() {
    if (!fabricCanvas) return;
    // WORLD = SCENA, więc "fit" i "100%" to to samo:
    // zoom=1 i brak przesunięcia.
    fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fabricCanvas.requestRenderAll();
  }

  function clampViewport() {
    if (!fabricCanvas) return;

    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();
    const z = fabricCanvas.getZoom();

    // min zoom pilnujemy osobno, ale tu zakładamy z>=MIN_ZOOM
    const v = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : [z,0,0,z,0,0];

    // world bounds w pikselach canvasa:
    // x in [e .. e + worldW*z]
    // y in [f .. f + worldH*z]
    const minE = cw - worldW * z;
    const maxE = 0;
    const minF = ch - worldH * z;
    const maxF = 0;

    v[4] = clamp(v[4], minE, maxE);
    v[5] = clamp(v[5], minF, maxF);

    fabricCanvas.setViewportTransform(v);
  }

  function resizeScene() {
    if (!fabricCanvas || !drawCanvasEl) return;
    const { w, h } = getStageSize();

    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
    fabricCanvas.calcOffset();

    // WORLD = SCENA:
    updateWorldSize(w, h);
    updateClipPath();

    // po zmianie rozmiaru – bezpiecznie wracamy do "granicy świata"
    // (nie zostawiamy starych pan/zoom, które mogłyby pokazać "poza")
    resetView();
    clampViewport();

    schedulePreview(60);
  }

  // =========================================================
  // Zoom / viewport (min zoom = 1, max = 12)
  // =========================================================
  function setZoomClamped(nextZoom, center = null) {
    if (!fabricCanvas) return;
    const f = requireFabric();

    const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const pt = center || new f.Point(fabricCanvas.getWidth() / 2, fabricCanvas.getHeight() / 2);
    fabricCanvas.zoomToPoint(pt, z);

    clampViewport();
    fabricCanvas.requestRenderAll();
  }

  function zoomBy(factor, center = null) {
    if (!fabricCanvas) return;
    const next = fabricCanvas.getZoom() * factor;
    setZoomClamped(next, center);
  }

  function zoomTo100() {
    // w tym modelu: 100% == granice świata
    setZoomClamped(1.0, null);
    // przy zoom=1 pan ma być 0,0
    if (fabricCanvas) {
      fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      fabricCanvas.requestRenderAll();
    }
  }

  function zoomFit() {
    // world==scene -> to samo co 100%
    zoomTo100();
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

    if (tPolyDone) tPolyDone.disabled = !(tool === TOOL.POLY && polyPoints.length >= 3);
  }

  function setTool(next) {
    tool = next;
    syncToolButtons();

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

    // punkt w świecie (world coords)
    const wp = f.util.transformPoint(canvasPt, inv);

    // klucz: clamp do granic świata
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
    schedulePreview(60);
  }

  // =========================================================
  // Shapes (line/rect/ellipse) — clamp do świata
  // =========================================================
  function startFigure(ev) {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const p0 = getWorldPointFromMouse(ev); // już clamp
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
    const p = getWorldPointFromMouse(ev); // clamp

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

      const left = w >= 0 ? x0 : p.x;
      const top  = h >= 0 ? y0 : p.y;

      // dodatkowe bezpieczeństwo: clamp lewego/górnego
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
      const x0 = drawingObj.left;
      const y0 = drawingObj.top;

      const w = p.x - x0;
      const h = p.y - y0;

      const left = w >= 0 ? x0 : p.x;
      const top  = h >= 0 ? y0 : p.y;

      const pLT = clampWorldPoint({ x: left, y: top });
      const pRB = clampWorldPoint({ x: left + Math.abs(w), y: top + Math.abs(h) });

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
    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(60);
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
  // Preview/export: stabilne (nie zależy od zoom/pan)
  // Render offscreen: świat -> DOT (150x70) stałą skalą
  // =========================================================
  async function renderWorldTo150x70CanvasStable() {
    if (!fabricCanvas) return null;
    const f = requireFabric();

    const json = snapshotJSON();
    if (!json) return null;

    // offscreen canvas DOT size
    const el = f.util.createCanvasElement();
    el.width = DOT_W;
    el.height = DOT_H;

    const sc = new f.StaticCanvas(el, {
      backgroundColor: "#000",
      renderOnAddRemove: false,
    });

    // Skala: świat (worldW x worldH) -> DOT (150 x 70)
    // (aspekt jest stały 26:11, więc to jest spójne)
    const sx = DOT_W / Math.max(1, worldW);
    const sy = DOT_H / Math.max(1, worldH);
    const s = Math.min(sx, sy); // powinno wyjść równe, ale bierzemy bezpiecznie

    sc.setViewportTransform([s, 0, 0, s, 0, 0]);

    await new Promise((res) => {
      sc.loadFromJSON(json, () => {
        sc.renderAll();
        res();
      });
    });

    // StaticCanvas ma swoje eventy itd., ale to offscreen — czyścimy po sobie
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

  function schedulePreview(ms = 60) {
    clearTimeout(_deb);

    const mySeq = ++_previewSeq;

    _deb = setTimeout(async () => {
      // jeśli w międzyczasie była kolejna prośba o preview, pomiń tę
      if (mySeq !== _previewSeq) return;

      const c = await renderWorldTo150x70CanvasStable();
      if (!c) return;

      // znów sprawdzamy, czy to nadal aktualne
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

    {
      const row = document.createElement("label");
      row.className = "popRow";
      row.innerHTML = `
        <span>Grubość</span>
        <input class="inp" id="popStroke" type="number" min="1" max="80" step="1" value="${Number(st.stroke || 6)}">
      `;
      drawPopBody.appendChild(row);
    }

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

    const popStroke = drawPopBody.querySelector("#popStroke");
    const popFill = drawPopBody.querySelector("#popFill");

    popStroke?.addEventListener("input", () => {
      toolSettings[tool] = { ...(toolSettings[tool] || {}), stroke: clamp(Number(popStroke.value || 6), 1, 80) };
      if (tool === TOOL.BRUSH || tool === TOOL.ERASER) applyBrushStyle();
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
      // clamp po modyfikacji (select)
      if (tool === TOOL.SELECT && e?.target) {
        clampObjectToWorld(e.target);
      }

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

    // clamp na żywo przy przesuwaniu/skalowaniu (tylko SELECT)
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

      if (tool === TOOL.PAN) {
        // pan ma sens tylko przy zoom>1
        if (fabricCanvas.getZoom() <= MIN_ZOOM + 1e-6) return;

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
        // pan ograniczony clampem
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

    // Wheel zoom (tylko select/pan) + min zoom = 1
    drawCanvasEl.addEventListener("wheel", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!(tool === TOOL.PAN || tool === TOOL.SELECT)) return;

      ev.preventDefault();

      const rect = drawCanvasEl.getBoundingClientRect();
      const pt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
      zoomBy(ev.deltaY < 0 ? 1.1 : 0.9, pt);

      schedulePreview(100);
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
    zoomFit();           // = reset do granic świata
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
    tZoomFit?.addEventListener("click", () => { zoomFit(); schedulePreview(120); });

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
      schedulePreview(80);
    });

    tEye?.addEventListener("click", () => openEyePreview());

    tSettings?.addEventListener("click", () => openSettingsModal());
    drawPopClose?.addEventListener("click", () => closeSettingsModal());

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
        fabricCanvas.backgroundColor = "#000";

        // world/clip + reset widoku do granic świata
        resizeScene();
        zoomFit();

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
      // odśwież bity (stabilne, niezależne od zoom/pan)
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
