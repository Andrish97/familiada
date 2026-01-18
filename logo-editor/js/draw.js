// familiada/logo-editor/js/draw.js
// Tryb: DRAW -> Fabric.js (wektor) -> raster 150x70 bits (PIX_150x70)

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // =========================================================
  // DOM (WYMAGANE ID w HTML)
  // =========================================================
  const paneDraw = document.getElementById("paneDraw");

  // Kontener sceny (powinien mieć aspect-ratio: 26/11 w CSS)
  // Jeśli nie masz: dodaj div np. <div class="drawStage" id="drawStage"> <canvas id="drawCanvas"></canvas></div>
  const drawStage = document.getElementById("drawStage") || paneDraw;

  // Canvas dla Fabric (UWAGA: to NIE jest 150x70 – to jest “scena” do rysowania)
  const drawCanvasEl = document.getElementById("drawCanvas");

  // Przyciski narzędzi (emoji jako ikonki)
  const btnSel     = document.getElementById("btnSel");      // 🖱️
  const btnPan     = document.getElementById("btnPan");      // ✋
  const btnZoomIn  = document.getElementById("btnZoomIn");   // ➕
  const btnZoomOut = document.getElementById("btnZoomOut");  // ➖
  const btnZoom100 = document.getElementById("btnZoom100");  // 💯
  const btnZoomFit = document.getElementById("btnZoomFit");  // 🧲 (fit)

  const btnBrush   = document.getElementById("btnBrush");    // ✏️
  const btnEraser  = document.getElementById("btnEraser");   // 🧽
  const btnLine    = document.getElementById("btnLine");     // ／
  const btnRect    = document.getElementById("btnRect");     // ▭
  const btnEllipse = document.getElementById("btnEllipse");  // ◯
  const btnPoly    = document.getElementById("btnPoly");     // ⬠

  const btnUndo    = document.getElementById("btnUndo");     // ↶
  const btnRedo    = document.getElementById("btnRedo");     // ↷
  const btnClear   = document.getElementById("btnClear");    // 🗑️

  // Ustawienia (TYLKO TE)
  const inpStroke  = document.getElementById("inpStroke");   // grubość (number/range)
  const chkFill    = document.getElementById("chkFill");     // wypełnij (checkbox)

  // (opcjonalnie) mały komunikat w paneDraw – możesz to pominąć
  const drawWarn   = document.getElementById("drawWarn");

  // =========================================================
  // Stałe
  // =========================================================
  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70
  const ASPECT = 26 / 11;  // scena MA BYĆ zawsze w tych proporcjach

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const px = (n) => `${Math.round(n)}px`;

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("gold", !!on);
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function warn(msg) {
    if (!drawWarn) return;
    drawWarn.textContent = msg || "";
    show(drawWarn, !!msg);
  }

  // =========================================================
  // Fabric (lazy init)
  // =========================================================
  function requireFabric() {
    const f = window.fabric;
    if (!f) throw new Error("Brak Fabric.js (script nie wczytany).");
    return f;
  }

  let fabricCanvas = null;
  let initialized = false;

  // Narzędzia
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

  // Stan narzędzi
  let panDown = false;
  let panStart = { x: 0, y: 0 };
  let vptStart = null;

  let drawingObj = null; // line/rect/ellipse podczas przeciągania

  // Polygon: klik-kliki + doubleclick kończy
  let polyPoints = [];
  let polyPreview = null;

  // Undo/Redo
  let undoStack = [];
  let redoStack = [];
  let undoBusy = false;

  // Preview bits (to idzie do main)
  let bits150 = new Uint8Array(DOT_W * DOT_H);

  // =========================================================
  // Scena: rozmiar + zoom-fit
  // =========================================================
  function getStageSize() {
    const host = drawStage || paneDraw;
    const rect = host.getBoundingClientRect();
    const w = Math.max(260, Math.floor(rect.width)); // minimalnie, żeby się nie zerwało
    let h = Math.floor(w / ASPECT);

    // jeśli host jest niski, dopasuj w dół po wysokości
    if (rect.height > 0 && h > rect.height) {
      h = Math.floor(rect.height);
    }

    // i jeszcze raz licz szerokość z h, żeby trzymać ratio
    const w2 = Math.floor(h * ASPECT);
    return { w: Math.max(260, w2), h: Math.max(120, h) };
  }

  function resizeScene() {
    if (!fabricCanvas || !drawCanvasEl) return;

    const { w, h } = getStageSize();

    // ustaw rozmiar elementu canvas (CSS) + rozmiar bufora
    drawCanvasEl.style.width = px(w);
    drawCanvasEl.style.height = px(h);

    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
    fabricCanvas.calcOffset();

    zoomFit(); // po resize trzymamy “dopasuj”
    schedulePreview(40);
  }

  function zoomFit() {
    if (!fabricCanvas) return;

    // bazowy “świat” sceny: przyjmujemy wirtualne 2600×1100 (bo 26:11),
    // a potem dopasowujemy viewport, żeby to wypełniło canvas.
    const WORLD_W = 2600;
    const WORLD_H = 1100;

    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();

    const s = Math.min(cw / WORLD_W, ch / WORLD_H);

    // wycentruj
    const tx = (cw - WORLD_W * s) / 2;
    const ty = (ch - WORLD_H * s) / 2;

    fabricCanvas.setViewportTransform([s, 0, 0, s, tx, ty]);
    fabricCanvas.requestRenderAll();
    syncToolStates();
  }

  function zoomTo100() {
    if (!fabricCanvas) return;
    // 100% = 1:1 w przestrzeni “świata” (czyli 1px świata = 1px ekranu),
    // ale to może być “za duże”, więc ustawiamy sensownie: skala 1.0 i centrujemy świat.
    const WORLD_W = 2600;
    const WORLD_H = 1100;
    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();
    const s = 1.0;
    const tx = (cw - WORLD_W * s) / 2;
    const ty = (ch - WORLD_H * s) / 2;
    fabricCanvas.setViewportTransform([s, 0, 0, s, tx, ty]);
    fabricCanvas.requestRenderAll();
    syncToolStates();
  }

  function zoomBy(factor, center = null) {
    if (!fabricCanvas) return;
    const f = clamp(Number(factor) || 1, 0.1, 10);

    const pt = center || new window.fabric.Point(
      fabricCanvas.getWidth() / 2,
      fabricCanvas.getHeight() / 2
    );

    const zoom = fabricCanvas.getZoom();
    const next = clamp(zoom * f, 0.05, 12);

    fabricCanvas.zoomToPoint(pt, next);
    fabricCanvas.requestRenderAll();
    syncToolStates();
  }

  // =========================================================
  // Ustawienia (grubość + fill)
  // =========================================================
  function getStrokeWidth() {
    const raw = inpStroke ? Number(inpStroke.value) : 10;
    return clamp(raw || 10, 1, 160);
  }

  function isFillOn() {
    return !!chkFill?.checked;
  }

  // =========================================================
  // Obiekty: style “jednokolorowe”
  // =========================================================
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

  function makeEraserStyle() {
    const w = getStrokeWidth();
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

    const w = getStrokeWidth();

    // free drawing brush
    if (!fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush = new f.PencilBrush(fabricCanvas);
    }
    fabricCanvas.freeDrawingBrush.width = w;
    fabricCanvas.freeDrawingBrush.color = (tool === TOOL.ERASER) ? "#000" : "#fff";
    fabricCanvas.freeDrawingBrush.decimate = 0; // bardziej “gładko”
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

    // select vs draw
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
      // figury: rysujemy myszą, nie trybem freeDrawing
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(o => { o.selectable = false; o.evented = false; });
    }

    // polygon: wyczyść stan klikania
    if (tool !== TOOL.POLY) {
      clearPolyDraft();
    }

    warn("");
  }

  function syncToolStates() {
    // na razie tylko: nic. (miejsce na przyszłość)
  }

  // =========================================================
  // Undo / Redo
  // =========================================================
  function snapshotJSON() {
    if (!fabricCanvas) return null;
    // zapisujemy bez “śmieci” runtime’owych
    return fabricCanvas.toDatalessJSON([
      "selectable",
      "evented",
      "stroke",
      "strokeWidth",
      "strokeLineCap",
      "strokeLineJoin",
      "fill",
    ]);
  }

  function pushUndo(tag = "") {
    if (!fabricCanvas || undoBusy) return;
    const j = snapshotJSON();
    if (!j) return;

    // unikaj spamowania identycznymi stanami
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
    if (undoStack.length < 2) return; // musi być cofnąć do poprzedniego
    const current = undoStack.pop();
    redoStack.push(current);

    const prev = undoStack[undoStack.length - 1];
    restoreFrom(prev);
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

    // preview
    if (!fabricCanvas) return;
    const f = requireFabric();
    const style = makeStrokeFillStyle();

    if (!polyPreview) {
      polyPreview = new f.Polyline(polyPoints, {
        left: 0, top: 0,
        originX: "left",
        originY: "top",
        ...style,
        fill: "rgba(0,0,0,0)", // podczas rysowania tylko kontur
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
    const f = requireFabric();
    if (polyPoints.length < 3) {
      warn("Wielokąt: kliknij co najmniej 3 punkty, potem dwuklik żeby zakończyć.");
      return;
    }

    const style = makeStrokeFillStyle();

    // usuń preview
    if (polyPreview) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
    }

    const poly = new f.Polygon(polyPoints, {
      ...style,
      objectCaching: false,
      selectable: false,
      evented: false,
    });

    fabricCanvas.add(poly);
    fabricCanvas.requestRenderAll();

    clearPolyDraft();
    pushUndo("poly");
    ctx.markDirty?.();
    schedulePreview(60);
  }

  // =========================================================
  // Raster -> bits 150x70 (podgląd + zapis)
  // =========================================================
  function canvasToBits150(sourceCanvas, w, h) {
    // sourceCanvas = normalny canvas (pixele)
    const g = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const img = g.getImageData(0, 0, w, h);
    const data = img.data;

    const out = new Uint8Array(DOT_W * DOT_H);

    // prosto: threshold na luminancji, bo jest tylko biel/czerń
    for (let y = 0; y < DOT_H; y++) {
      for (let x = 0; x < DOT_W; x++) {
        const i = (y * DOT_W + x) * 4;
        const r = data[i + 0];
        const gg = data[i + 1];
        const b = data[i + 2];
        // lum 0..255
        const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        out[y * DOT_W + x] = lum >= 128 ? 1 : 0;
      }
    }
    return out;
  }

  function renderTo150x70Canvas() {
    if (!fabricCanvas) return null;

    // Fabric renderuje na swoim lowerCanvasEl, ale w rozmiarze sceny.
    // My robimy downscale do 150x70.
    const src = fabricCanvas.lowerCanvasEl;
    if (!src) return null;

    const out = document.createElement("canvas");
    out.width = DOT_W;
    out.height = DOT_H;

    const g = out.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = true;

    // tło czarne
    g.fillStyle = "#000";
    g.fillRect(0, 0, DOT_W, DOT_H);

    // downscale (cała scena -> 150x70)
    g.drawImage(src, 0, 0, DOT_W, DOT_H);

    return out;
  }

  let _deb = null;
  function schedulePreview(ms = 60) {
    clearTimeout(_deb);
    _deb = setTimeout(() => {
      const c = renderTo150x70Canvas();
      if (!c) return;
      bits150 = canvasToBits150(c, DOT_W, DOT_H);
      ctx.onPreview?.({ kind: "PIX", bits: bits150 });
    }, ms);
  }

  // =========================================================
  // Pointer logic: pan/zoom/figures/polygon
  // =========================================================
  function getWorldPoint(ev) {
    const f = requireFabric();
    const p = new f.Point(ev.clientX, ev.clientY);
    const rect = drawCanvasEl.getBoundingClientRect();
    const canvasPt = new f.Point(p.x - rect.left, p.y - rect.top);

    const vpt = fabricCanvas.viewportTransform;
    const inv = f.util.invertTransform(vpt);
    const world = f.util.transformPoint(canvasPt, inv);
    return world;
  }

  function startFigure(ev) {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const p0 = getWorldPoint(ev);

    const style = (tool === TOOL.ERASER) ? makeEraserStyle() : makeStrokeFillStyle();

    if (tool === TOOL.LINE) {
      drawingObj = new f.Line([p0.x, p0.y, p0.x, p0.y], {
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
      drawingObj = new f.Rect({
        left: p0.x,
        top: p0.y,
        width: 1,
        height: 1,
        originX: "left",
        originY: "top",
        ...style,
        objectCaching: false,
        selectable: false,
        evented: false,
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
        objectCaching: false,
        selectable: false,
        evented: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }
  }

  function updateFigure(ev) {
    if (!fabricCanvas || !drawingObj) return;
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

      // ellipse w fabric ma center zależny od origin; upraszczamy: origin left/top i rx/ry
      fabricCanvas.requestRenderAll();
      return;
    }
  }

  function finishFigure() {
    if (!fabricCanvas || !drawingObj) return;
    drawingObj = null;
    fabricCanvas.requestRenderAll();
    pushUndo("figure");
    ctx.markDirty?.();
    schedulePreview(60);
  }

  // =========================================================
  // Fabric init
  // =========================================================
  function installFabricOnce() {
    if (initialized) return;
    initialized = true;

    const f = requireFabric();
    if (!drawCanvasEl) throw new Error("Brak #drawCanvas w HTML.");

    fabricCanvas = new f.Canvas(drawCanvasEl, {
      backgroundColor: "#000",
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
    });

    // Start: dopasuj scenę do kontenera
    resizeScene();

    // styl pędzla na start
    applyBrushStyle();

    // Undo: stan początkowy
    undoStack = [];
    redoStack = [];
    pushUndo("init");
    updateUndoRedoButtons();

    // “Zmiany” -> preview i undo snapshot
    const afterChange = () => {
      if (undoBusy) return;
      ctx.markDirty?.();
      schedulePreview(60);
    };

    fabricCanvas.on("path:created", () => {
      pushUndo("path");
      afterChange();
    });

    fabricCanvas.on("object:modified", () => {
      pushUndo("modify");
      afterChange();
    });

    fabricCanvas.on("object:added", (e) => {
      // przy init/restore nie spamuj
      if (undoBusy) return;
      // dodania z figur robimy ręcznie na koniec (pushUndo), więc tu nie robimy nic
    });

    fabricCanvas.on("object:removed", () => {
      if (undoBusy) return;
      pushUndo("remove");
      afterChange();
    });

    // Pointer events
    fabricCanvas.on("mouse:down", (opt) => {
      const ev = opt.e;

      if (tool === TOOL.PAN) {
        panDown = true;
        panStart = { x: ev.clientX, y: ev.clientY };
        vptStart = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : null;
        return;
      }

      if (tool === TOOL.POLY) {
        const wp = getWorldPoint(ev);
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

      if (drawingObj) {
        updateFigure(ev);
      }
    });

    fabricCanvas.on("mouse:up", () => {
      if (tool === TOOL.PAN) {
        panDown = false;
        vptStart = null;
        return;
      }
      if (drawingObj) {
        finishFigure();
      }
    });

    // Double click kończy polygon
    drawCanvasEl.addEventListener("dblclick", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (tool !== TOOL.POLY) return;
      ev.preventDefault();
      finalizePolygon();
    });

    // Wheel zoom (tylko w PAN lub SELECT, żeby nie przeszkadzać rysowaniu)
    drawCanvasEl.addEventListener("wheel", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!(tool === TOOL.PAN || tool === TOOL.SELECT)) return;

      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.1 : 0.9;

      const rect = drawCanvasEl.getBoundingClientRect();
      const f = requireFabric();
      const pt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
      zoomBy(factor, pt);
      schedulePreview(80);
    }, { passive: false });

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (ctx.getMode?.() !== "DRAW") return;
      resizeScene();
    });
    if (drawStage) ro.observe(drawStage);
    else if (paneDraw) ro.observe(paneDraw);

    // Start tool
    setTool(TOOL.SELECT);

    // Start preview
    schedulePreview(10);
  }

  // =========================================================
  // UI bind
  // =========================================================
  function bindUiOnce() {
    btnSel?.addEventListener("click", () => setTool(TOOL.SELECT));
    btnPan?.addEventListener("click", () => setTool(TOOL.PAN));

    btnZoomIn?.addEventListener("click", () => { zoomBy(1.15); schedulePreview(80); });
    btnZoomOut?.addEventListener("click", () => { zoomBy(0.87); schedulePreview(80); });
    btnZoom100?.addEventListener("click", () => { zoomTo100(); schedulePreview(80); });
    btnZoomFit?.addEventListener("click", () => { zoomFit(); schedulePreview(80); });

    btnBrush?.addEventListener("click", () => setTool(TOOL.BRUSH));
    btnEraser?.addEventListener("click", () => setTool(TOOL.ERASER));
    btnLine?.addEventListener("click", () => setTool(TOOL.LINE));
    btnRect?.addEventListener("click", () => setTool(TOOL.RECT));
    btnEllipse?.addEventListener("click", () => setTool(TOOL.ELLIPSE));
    btnPoly?.addEventListener("click", () => {
      warn("Wielokąt: klikaj punkty. Dwuklik kończy.");
      setTool(TOOL.POLY);
    });

    btnUndo?.addEventListener("click", () => undo());
    btnRedo?.addEventListener("click", () => redo());

    btnClear?.addEventListener("click", () => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!fabricCanvas) return;

      const ok = confirm("Wyczyścić wszystko?");
      if (!ok) return;

      clearPolyDraft();
      fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
      fabricCanvas.requestRenderAll();

      pushUndo("clear");
      ctx.markDirty?.();
      schedulePreview(30);
    });

    inpStroke?.addEventListener("input", () => {
      applyBrushStyle();
      // nie zmieniamy już istniejących obiektów (Paint też nie zmienia wstecz),
      // więc tylko preview i “ready for next”.
      schedulePreview(60);
    });

    chkFill?.addEventListener("change", () => {
      // fill dotyczy NOWYCH figur (Paint też tak działa)
      schedulePreview(60);
    });
  }

  let uiBound = false;

  // =========================================================
  // API
  // =========================================================
  return {
    open() {
      show(paneDraw, true);
      if (!uiBound) { bindUiOnce(); uiBound = true; }

      installFabricOnce();

      // reset na start sesji
      if (fabricCanvas) {
        clearPolyDraft();
        fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
        fabricCanvas.backgroundColor = "#000";
        fabricCanvas.requestRenderAll();

        // reset stacks
        undoStack = [];
        redoStack = [];
        pushUndo("init");
        updateUndoRedoButtons();

        // start tool
        setTool(TOOL.SELECT);
        zoomFit();

        ctx.clearDirty?.();
        warn("");
        schedulePreview(20);
      }
    },

    close() {
      show(paneDraw, false);
      // nie niszczymy Fabric — szybciej przy kolejnych wejściach
    },

    async getCreatePayload() {
      // upewnij się, że mamy świeże bity
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

/*
WYMAGANE ID w HTML (przykład):
- #drawStage (kontener sceny, z aspect-ratio: 26/11)
- #drawCanvas (canvas dla Fabric)
- przyciski:
  btnSel btnPan btnZoomIn btnZoomOut btnZoom100 btnZoomFit
  btnBrush btnEraser btnLine btnRect btnEllipse btnPoly
  btnUndo btnRedo btnClear
- ustawienia:
  inpStroke (number/range)
  chkFill (checkbox)
Opcjonalnie:
  drawWarn (div na komunikaty)
*/
