// familiada/logo-editor/js/draw.js
// DRAW -> Fabric.js -> raster 150x70 bits (PIX_150x70)

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // =========================================================
  // DOM (DOPASOWANE DO TWOJEGO HTML)
  // =========================================================
  const paneDraw = document.getElementById("paneDraw");

  // Fabric canvas (u Ciebie to jest #drawStage)
  const stageCanvasEl = document.getElementById("drawStage");

  // Tool buttons (u Ciebie: t*)
  const btnSel     = document.getElementById("tSelect");   // 🖱️
  const btnPan     = document.getElementById("tPan");      // ✋
  const btnZoomIn  = document.getElementById("tZoomIn");   // ➕
  const btnZoomOut = document.getElementById("tZoomOut");  // ➖

  const btnBrush   = document.getElementById("tBrush");    // ✏️
  const btnEraser  = document.getElementById("tEraser");   // 🧽
  const btnLine    = document.getElementById("tLine");     // 📏
  const btnRect    = document.getElementById("tRect");     // ▭
  const btnEllipse = document.getElementById("tEllipse");  // ⬭
  const btnPoly    = document.getElementById("tPoly");     // 🔺

  const btnUndo    = document.getElementById("tUndo");     // ↶
  const btnRedo    = document.getElementById("tRedo");     // ↷
  const btnClear   = document.getElementById("tClear");    // 🗑️

  // Options
  const inpStroke  = document.getElementById("optStroke"); // number
  const chkFill    = document.getElementById("optFill");   // checkbox

  // Thumb
  const thumbBtn   = document.getElementById("drawThumbBtn");
  const thumbCanvas= document.getElementById("drawThumb");

  // (opcjonalne)
  const drawWarn   = document.getElementById("drawWarn");

  // =========================================================
  // Stałe
  // =========================================================
  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70
  const ASPECT = 26 / 11;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function warn(msg) {
    if (!drawWarn) return;
    drawWarn.textContent = msg || "";
    show(drawWarn, !!msg);
  }

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.classList.toggle("gold", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // =========================================================
  // Fabric require
  // =========================================================
  function requireFabric() {
    const f = window.fabric;
    if (!f) throw new Error("Brak Fabric.js (script nie wczytany).");
    return f;
  }

  if (!paneDraw) throw new Error("Brak #paneDraw w HTML.");
  if (!stageCanvasEl) throw new Error("Brak #drawStage w HTML (to ma być <canvas>).");

  // =========================================================
  // State
  // =========================================================
  let fabricCanvas = null;
  let initialized = false;

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

  // pan
  let panDown = false;
  let panStart = { x: 0, y: 0 };
  let vptStart = null;

  // figure drawing
  let drawingObj = null;

  // polygon
  let polyPoints = [];
  let polyPreview = null;

  // undo/redo
  let undoStack = [];
  let redoStack = [];
  let undoBusy = false;

  // preview bits
  let bits150 = new Uint8Array(DOT_W * DOT_H);

  // =========================================================
  // POPUP (mały modal na ustawienia)
  // =========================================================
  let pop = null;
  let popOpen = false;

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "drawPop";
    pop.style.position = "fixed";
    pop.style.zIndex = "9999";
    pop.style.display = "none";
    pop.style.minWidth = "220px";
    pop.style.borderRadius = "16px";
    pop.style.border = "1px solid rgba(255,255,255,.14)";
    pop.style.background = "rgba(0,0,0,.92)";
    pop.style.boxShadow = "0 16px 50px rgba(0,0,0,.65)";
    pop.style.padding = "12px";

    pop.innerHTML = `
      <div style="font-weight:1000; letter-spacing:.08em; text-transform:uppercase; font-size:12px; opacity:.9; margin-bottom:10px;">
        Ustawienia
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <label style="display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:13px;">
          <span style="font-weight:900; opacity:.85;">Grubość</span>
          <input id="__popStroke" class="inp" type="number" min="1" max="60" step="1" style="width:110px; text-align:center;">
        </label>

        <label style="display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:13px;">
          <span style="font-weight:900; opacity:.85;">Wypełnij</span>
          <input id="__popFill" type="checkbox">
        </label>

        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px;">
          <button id="__popClose" class="btn sm" type="button">Zamknij</button>
        </div>
      </div>
    `;

    document.body.appendChild(pop);

    const popStroke = pop.querySelector("#__popStroke");
    const popFill = pop.querySelector("#__popFill");
    const popClose = pop.querySelector("#__popClose");

    // sync IN -> UI
    function syncIn() {
      if (popStroke) popStroke.value = String(getStrokeWidth());
      if (popFill) popFill.checked = !!isFillOn();
    }

    // sync UI -> OUT
    popStroke?.addEventListener("input", () => {
      if (inpStroke) inpStroke.value = popStroke.value;
      applyBrushStyle();
      schedulePreview(40);
    });

    popFill?.addEventListener("change", () => {
      if (chkFill) chkFill.checked = !!popFill.checked;
      schedulePreview(40);
    });

    popClose?.addEventListener("click", () => closePop());

    // klik poza
    document.addEventListener("pointerdown", (ev) => {
      if (!popOpen) return;
      const t = ev.target;
      if (pop.contains(t)) return;
      // pozwól kliknąć w przycisk narzędzia bez natychmiastowego zamknięcia (zamknie się po zmianie tool)
      closePop();
    }, true);

    // ESC
    document.addEventListener("keydown", (ev) => {
      if (!popOpen) return;
      if (ev.key === "Escape") closePop();
    });

    // expose helper
    pop._syncIn = syncIn;
    return pop;
  }

  function openPopNear(el) {
    const p = ensurePop();
    p._syncIn?.();
    const r = el?.getBoundingClientRect?.() || { left: 20, top: 20, right: 20, bottom: 20 };

    // ustaw obok toolbara, nie pod kursorem
    const left = Math.min(window.innerWidth - 240, Math.max(12, r.right + 10));
    const top  = Math.min(window.innerHeight - 200, Math.max(12, r.top));

    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
    p.style.display = "block";
    popOpen = true;
  }

  function closePop() {
    if (!pop) return;
    pop.style.display = "none";
    popOpen = false;
  }

  // =========================================================
  // Scene sizing: canvas wypełnia ratio-box
  // =========================================================
  function resizeScene() {
    if (!fabricCanvas) return;

    // ratio-box już ma aspect-ratio w CSS
    const rect = stageCanvasEl.getBoundingClientRect();
    const w = Math.max(200, Math.floor(rect.width));
    const h = Math.max(120, Math.floor(rect.height));

    // Ustaw realny buffer canvas
    stageCanvasEl.width = w;
    stageCanvasEl.height = h;

    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
    fabricCanvas.calcOffset();

    zoomFit();
    schedulePreview(40);
  }

  function zoomFit() {
    if (!fabricCanvas) return;

    // “świat” 2600×1100 – spójne ratio 26:11
    const WORLD_W = 2600;
    const WORLD_H = 1100;

    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();
    const s = Math.min(cw / WORLD_W, ch / WORLD_H);

    const tx = (cw - WORLD_W * s) / 2;
    const ty = (ch - WORLD_H * s) / 2;

    fabricCanvas.setViewportTransform([s, 0, 0, s, tx, ty]);
    fabricCanvas.requestRenderAll();
  }

  function zoomBy(factor, center = null) {
    if (!fabricCanvas) return;
    const f = clamp(Number(factor) || 1, 0.1, 10);

    const Fabric = requireFabric();
    const pt = center || new Fabric.Point(
      fabricCanvas.getWidth() / 2,
      fabricCanvas.getHeight() / 2
    );

    const zoom = fabricCanvas.getZoom();
    const next = clamp(zoom * f, 0.05, 12);

    fabricCanvas.zoomToPoint(pt, next);
    fabricCanvas.requestRenderAll();
    schedulePreview(60);
  }

  // =========================================================
  // Options
  // =========================================================
  function getStrokeWidth() {
    const raw = inpStroke ? Number(inpStroke.value) : 6;
    return clamp(raw || 6, 1, 60);
  }
  function isFillOn() { return !!chkFill?.checked; }

  function makeStrokeFillStyle() {
    const w = getStrokeWidth();
    return {
      stroke: "#fff",
      strokeWidth: w,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      fill: isFillOn() ? "#fff" : "rgba(0,0,0,0)",
    };
  }

  function applyBrushStyle() {
    if (!fabricCanvas) return;
    const Fabric = requireFabric();

    const w = getStrokeWidth();
    if (!fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush = new Fabric.PencilBrush(fabricCanvas);
    }
    fabricCanvas.freeDrawingBrush.width = w;
    fabricCanvas.freeDrawingBrush.color = (tool === TOOL.ERASER) ? "#000" : "#fff";
    fabricCanvas.freeDrawingBrush.decimate = 0;
  }

  // =========================================================
  // Tool switching
  // =========================================================
  function setTool(next) {
    tool = next;

    setBtnOn(btnSel, tool === TOOL.SELECT);
    setBtnOn(btnPan, tool === TOOL.PAN);
    setBtnOn(btnBrush, tool === TOOL.BRUSH);
    setBtnOn(btnEraser, tool === TOOL.ERASER);
    setBtnOn(btnLine, tool === TOOL.LINE);
    setBtnOn(btnRect, tool === TOOL.RECT);
    setBtnOn(btnEllipse, tool === TOOL.ELLIPSE);
    setBtnOn(btnPoly, tool === TOOL.POLY);

    if (!fabricCanvas) return;

    if (tool === TOOL.SELECT) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = true;
      fabricCanvas.forEachObject(o => { o.selectable = true; o.evented = true; });
    } else if (tool === TOOL.PAN) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
    } else if (tool === TOOL.BRUSH || tool === TOOL.ERASER) {
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      fabricCanvas.isDrawingMode = true;
      applyBrushStyle();
    } else {
      // figury
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
      clearPolyDraft();
    }

    warn("");
  }

  // =========================================================
  // Undo/Redo (JSON snapshot)
  // =========================================================
  function snapshotJSON() {
    if (!fabricCanvas) return null;
    return fabricCanvas.toDatalessJSON(["stroke","strokeWidth","strokeLineCap","strokeLineJoin","fill"]);
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
      schedulePreview(40);
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
    if (btnUndo) btnUndo.disabled = undoStack.length < 2;
    if (btnRedo) btnRedo.disabled = redoStack.length < 1;
  }

  // =========================================================
  // Polygon draft
  // =========================================================
  function clearPolyDraft() {
    polyPoints = [];
    if (polyPreview && fabricCanvas) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
      fabricCanvas.requestRenderAll();
    }
  }

  function addPolyPoint(worldPt) {
    polyPoints.push({ x: worldPt.x, y: worldPt.y });

    const Fabric = requireFabric();
    const style = makeStrokeFillStyle();

    if (!polyPreview) {
      polyPreview = new Fabric.Polyline(polyPoints, {
        ...style,
        fill: "rgba(0,0,0,0)",
        objectCaching: false,
        selectable: false,
        evented: false,
      });
      fabricCanvas.add(polyPreview);
    } else {
      polyPreview.set({ points: polyPoints });
    }
    fabricCanvas.requestRenderAll();
  }

  function finalizePolygon() {
    if (!fabricCanvas) return;
    if (polyPoints.length < 3) {
      warn("Wielokąt: kliknij co najmniej 3 punkty, potem dwuklik żeby zakończyć.");
      return;
    }

    const Fabric = requireFabric();
    const style = makeStrokeFillStyle();

    if (polyPreview) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
    }

    const poly = new Fabric.Polygon(polyPoints, {
      ...style,
      objectCaching: false,
      selectable: false,
      evented: false,
    });

    fabricCanvas.add(poly);
    fabricCanvas.requestRenderAll();

    clearPolyDraft();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(40);
  }

  // =========================================================
  // Raster -> bits150 + thumb
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
    const img = g.getImageData(0, 0, DOT_W, DOT_H);
    const d = img.data;
    const out = new Uint8Array(DOT_W * DOT_H);

    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const r = d[i * 4 + 0];
      const gg= d[i * 4 + 1];
      const b = d[i * 4 + 2];
      const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      out[i] = lum >= 128 ? 1 : 0;
    }
    return out;
  }

  function drawThumb(bits) {
    if (!thumbCanvas) return;
    const g = thumbCanvas.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = false;

    const img = g.createImageData(DOT_W, DOT_H);
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const v = bits[i] ? 255 : 0;
      img.data[i*4+0] = v;
      img.data[i*4+1] = v;
      img.data[i*4+2] = v;
      img.data[i*4+3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  let _deb = null;
  function schedulePreview(ms = 50) {
    clearTimeout(_deb);
    _deb = setTimeout(() => {
      const c = renderTo150x70Canvas();
      if (!c) return;
      bits150 = canvasToBits150(c);

      // main: “podgląd jak na wyświetlaczu”
      ctx.onPreview?.({ kind: "PIX", bits: bits150 });

      // mini ikona
      drawThumb(bits150);
    }, ms);
  }

  // =========================================================
  // Pointer/world helpers
  // =========================================================
  function getWorldPoint(ev) {
    const Fabric = requireFabric();
    const rect = stageCanvasEl.getBoundingClientRect();
    const canvasPt = new Fabric.Point(ev.clientX - rect.left, ev.clientY - rect.top);

    const vpt = fabricCanvas.viewportTransform;
    const inv = Fabric.util.invertTransform(vpt);
    return Fabric.util.transformPoint(canvasPt, inv);
  }

  function startFigure(ev) {
    const Fabric = requireFabric();
    const p0 = getWorldPoint(ev);
    const style = makeStrokeFillStyle();

    if (tool === TOOL.LINE) {
      drawingObj = new Fabric.Line([p0.x, p0.y, p0.x, p0.y], {
        ...style,
        fill: "rgba(0,0,0,0)",
        objectCaching: false,
        selectable: false,
        evented: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }

    if (tool === TOOL.RECT) {
      drawingObj = new Fabric.Rect({
        left: p0.x, top: p0.y,
        width: 1, height: 1,
        originX: "left", originY: "top",
        ...style,
        objectCaching: false,
        selectable: false,
        evented: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }

    if (tool === TOOL.ELLIPSE) {
      drawingObj = new Fabric.Ellipse({
        left: p0.x, top: p0.y,
        rx: 1, ry: 1,
        originX: "left", originY: "top",
        ...style,
        objectCaching: false,
        selectable: false,
        evented: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }
  }

  function updateFigure(ev) {
    if (!drawingObj) return;
    const p = getWorldPoint(ev);

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
        top:  h >= 0 ? y0 : p.y,
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

      drawingObj.set({
        left,
        top,
        rx: Math.max(1, Math.abs(w) / 2),
        ry: Math.max(1, Math.abs(h) / 2),
      });
      fabricCanvas.requestRenderAll();
    }
  }

  function finishFigure() {
    if (!drawingObj) return;
    drawingObj = null;
    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(40);
  }

  // =========================================================
  // Install Fabric
  // =========================================================
  function installFabricOnce() {
    if (initialized) return;
    initialized = true;

    const Fabric = requireFabric();

    fabricCanvas = new Fabric.Canvas(stageCanvasEl, {
      backgroundColor: "#000",
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
    });

    // initial sizing + fit
    resizeScene();
    applyBrushStyle();

    // undo init
    undoStack = [];
    redoStack = [];
    pushUndo();
    updateUndoRedoButtons();

    // changes -> preview
    fabricCanvas.on("path:created", () => { pushUndo(); ctx.markDirty?.(); schedulePreview(40); });
    fabricCanvas.on("object:modified", () => { pushUndo(); ctx.markDirty?.(); schedulePreview(40); });
    fabricCanvas.on("object:removed", () => { if (!undoBusy) { pushUndo(); ctx.markDirty?.(); schedulePreview(40); } });

    // fabric mouse
    fabricCanvas.on("mouse:down", (opt) => {
      const ev = opt.e;

      if (tool === TOOL.PAN) {
        panDown = true;
        panStart = { x: ev.clientX, y: ev.clientY };
        vptStart = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : null;
        return;
      }

      if (tool === TOOL.POLY) {
        addPolyPoint(getWorldPoint(ev));
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
        v[4] += dx; v[5] += dy;
        fabricCanvas.setViewportTransform(v);
        fabricCanvas.requestRenderAll();
        schedulePreview(80);
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

    // polygon finish: dblclick on canvas
    stageCanvasEl.addEventListener("dblclick", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (tool !== TOOL.POLY) return;
      ev.preventDefault();
      finalizePolygon();
    });

    // wheel zoom (w select/pan)
    stageCanvasEl.addEventListener("wheel", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!(tool === TOOL.SELECT || tool === TOOL.PAN)) return;
      ev.preventDefault();

      const factor = ev.deltaY < 0 ? 1.1 : 0.9;
      const rect = stageCanvasEl.getBoundingClientRect();
      const Fabric = requireFabric();
      const pt = new Fabric.Point(ev.clientX - rect.left, ev.clientY - rect.top);
      zoomBy(factor, pt);
    }, { passive: false });

    // resize observe
    const ro = new ResizeObserver(() => {
      if (ctx.getMode?.() !== "DRAW") return;
      resizeScene();
    });
    ro.observe(paneDraw);

    // start tool
    setTool(TOOL.SELECT);
    schedulePreview(10);
  }

  // =========================================================
  // UI bind
  // =========================================================
  let uiBound = false;

  function bindUiOnce() {
    // tools
    btnSel?.addEventListener("click", () => { closePop(); setTool(TOOL.SELECT); });
    btnPan?.addEventListener("click", () => { closePop(); setTool(TOOL.PAN); });

    btnBrush?.addEventListener("click", (e) => { setTool(TOOL.BRUSH); openPopNear(e.currentTarget); });
    btnEraser?.addEventListener("click", (e) => { setTool(TOOL.ERASER); openPopNear(e.currentTarget); });

    btnLine?.addEventListener("click", (e) => { setTool(TOOL.LINE); openPopNear(e.currentTarget); });
    btnRect?.addEventListener("click", (e) => { setTool(TOOL.RECT); openPopNear(e.currentTarget); });
    btnEllipse?.addEventListener("click", (e) => { setTool(TOOL.ELLIPSE); openPopNear(e.currentTarget); });

    btnPoly?.addEventListener("click", (e) => {
      setTool(TOOL.POLY);
      warn("Wielokąt: klikaj punkty. Dwuklik kończy.");
      openPopNear(e.currentTarget);
    });

    // zoom
    btnZoomIn?.addEventListener("click", () => zoomBy(1.15));
    btnZoomOut?.addEventListener("click", () => zoomBy(0.87));

    // undo/redo/clear
    btnUndo?.addEventListener("click", () => { closePop(); undo(); });
    btnRedo?.addEventListener("click", () => { closePop(); redo(); });

    btnClear?.addEventListener("click", () => {
      closePop();
      if (ctx.getMode?.() !== "DRAW") return;
      if (!fabricCanvas) return;

      const ok = confirm("Wyczyścić wszystko?");
      if (!ok) return;

      clearPolyDraft();
      fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
      fabricCanvas.requestRenderAll();

      pushUndo();
      ctx.markDirty?.();
      schedulePreview(20);
    });

    // raw options still work (jak ktoś nie chce popupu)
    inpStroke?.addEventListener("input", () => { applyBrushStyle(); schedulePreview(40); });
    chkFill?.addEventListener("change", () => { schedulePreview(40); });

    // thumb click -> otwórz fullscreen preview z main.js
    thumbBtn?.addEventListener("click", () => {
      // main.js ma handler na bigPreview click -> otwiera overlay
      document.getElementById("bigPreview")?.click?.();
    });
  }

  // =========================================================
  // API
  // =========================================================
  return {
    open() {
      show(paneDraw, true);
      warn("");

      if (!uiBound) { bindUiOnce(); uiBound = true; }
      installFabricOnce();

      // reset sesji: czyścimy płótno, ale Fabric zostaje
      if (fabricCanvas) {
        closePop();
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
        schedulePreview(10);
      }
    },

    close() {
      closePop();
      show(paneDraw, false);
    },

    getCreatePayload() {
      // odśwież natychmiast (bez debounca)
      const c = renderTo150x70Canvas();
      if (c) {
        bits150 = canvasToBits150(c);
        ctx.onPreview?.({ kind: "PIX", bits: bits150 });
        drawThumb(bits150);
      }

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
