// familiada/logo-editor/js/draw.js
// Tryb: DRAW -> PIX_150x70 (Fabric.js "paint" 1-kolor + narzędzia)

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // DOM
  const paneDraw = document.getElementById("paneDraw");
  const drawCanvasEl = document.getElementById("drawCanvas");
  const miniPrevEl = document.getElementById("drawMiniPreview");

  const btnSel = document.getElementById("btnSel");
  const btnPan = document.getElementById("btnPan");

  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnZoom100 = document.getElementById("btnZoom100");
  const btnZoomFit = document.getElementById("btnZoomFit");

  const btnBrush = document.getElementById("btnBrush");
  const btnEraser = document.getElementById("btnEraser");
  const btnLine = document.getElementById("btnLine");
  const btnRect = document.getElementById("btnRect");
  const btnEllipse = document.getElementById("btnEllipse");
  const btnPoly = document.getElementById("btnPoly");

  const btnUndo = document.getElementById("btnUndo");
  const btnRedo = document.getElementById("btnRedo");
  const btnClear = document.getElementById("btnClear");

  const DOT_W = ctx.DOT_W;
  const DOT_H = ctx.DOT_H;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };

  // Fabric state
  let fabricCanvas = null;
  let tool = "BRUSH";

  // pan/zoom state
  let isPanning = false;
  let panLast = { x: 0, y: 0 };

  // shape drawing temp
  let tempObj = null;
  let startPt = null;

  // polygon tool state
  let polyPoints = [];
  let polyPreview = null;

  // undo/redo
  const undoStack = [];
  const redoStack = [];
  let snapshotDeb = null;
  let snapshotLock = 0;

  function requireFabric() {
    if (!window.fabric) throw new Error("Brak Fabric.js (script nie wczytany).");
    return window.fabric;
  }

  function setToolButtonOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.classList.toggle("gold", !!on); // jeśli używasz .gold w UI
  }

  function syncToolUI() {
    setToolButtonOn(btnSel, tool === "SELECT");
    setToolButtonOn(btnPan, tool === "PAN");
    setToolButtonOn(btnBrush, tool === "BRUSH");
    setToolButtonOn(btnEraser, tool === "ERASER");
    setToolButtonOn(btnLine, tool === "LINE");
    setToolButtonOn(btnRect, tool === "RECT");
    setToolButtonOn(btnEllipse, tool === "ELLIPSE");
    setToolButtonOn(btnPoly, tool === "POLY");
  }

  function clearTempShape() {
    if (!fabricCanvas) return;
    if (tempObj) {
      fabricCanvas.remove(tempObj);
      tempObj = null;
    }
    startPt = null;
  }

  function clearPolyPreview() {
    if (!fabricCanvas) return;
    if (polyPreview) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
    }
    polyPoints = [];
  }

  function hardResetInteractions() {
    isPanning = false;
    clearTempShape();
    clearPolyPreview();
  }

  function setCanvasModeForTool() {
    if (!fabricCanvas) return;
    const fabric = requireFabric();

    hardResetInteractions();

    // default interactivity
    fabricCanvas.isDrawingMode = false;
    fabricCanvas.selection = true;
    fabricCanvas.defaultCursor = "default";
    fabricCanvas.hoverCursor = "move";

    // enable object selection by default
    fabricCanvas.forEachObject(obj => {
      obj.selectable = true;
      obj.evented = true;
    });

    // brush settings
    const WHITE = "#ffffff";

    if (tool === "SELECT") {
      fabricCanvas.defaultCursor = "default";
      return;
    }

    if (tool === "PAN") {
      fabricCanvas.defaultCursor = "grab";
      // selection off while panning
      fabricCanvas.discardActiveObject();
      fabricCanvas.selection = false;
      fabricCanvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
      return;
    }

    if (tool === "BRUSH") {
      fabricCanvas.isDrawingMode = true;
      const b = new fabric.PencilBrush(fabricCanvas);
      b.color = WHITE;
      b.width = 3; // “paint” feel; możesz dać slider później
      b.decimate = 0; // stabilniej
      fabricCanvas.freeDrawingBrush = b;
      fabricCanvas.selection = false;
      return;
    }

    if (tool === "ERASER") {
      fabricCanvas.isDrawingMode = true;

      // Fabric 5.x często ma EraserBrush; jeśli nie ma — fallback: rysuj czarnym
      if (fabric.EraserBrush) {
        const eb = new fabric.EraserBrush(fabricCanvas);
        eb.width = 10;
        fabricCanvas.freeDrawingBrush = eb;
      } else {
        const b = new fabric.PencilBrush(fabricCanvas);
        b.color = "#000000";
        b.width = 10;
        fabricCanvas.freeDrawingBrush = b;
      }

      fabricCanvas.selection = false;
      return;
    }

    // shape tools (no drawingMode)
    if (tool === "LINE" || tool === "RECT" || tool === "ELLIPSE" || tool === "POLY") {
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
      fabricCanvas.defaultCursor = "crosshair";
    }
  }

  // ===== snapshots (undo/redo) =====
  function takeSnapshot(reason = "") {
    if (!fabricCanvas) return;
    if (snapshotLock) return;

    const json = fabricCanvas.toDatalessJSON(["erasable", "selectable", "evented"]);
    undoStack.push(json);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    btnUndo && (btnUndo.disabled = undoStack.length <= 1);
    btnRedo && (btnRedo.disabled = redoStack.length === 0);
  }

  function scheduleSnapshot(reason = "") {
    clearTimeout(snapshotDeb);
    snapshotDeb = setTimeout(() => takeSnapshot(reason), 120);
  }

  function applySnapshot(json) {
    if (!fabricCanvas) return;
    snapshotLock++;
    fabricCanvas.loadFromJSON(json, () => {
      fabricCanvas.renderAll();
      snapshotLock = Math.max(0, snapshotLock - 1);
      // po loadFromJSON wracamy do aktualnego tool-a
      setCanvasModeForTool();
      syncToolUI();
      pushPreviewNow();
    });
  }

  function undo() {
    if (undoStack.length <= 1) return;
    const cur = undoStack.pop();
    redoStack.push(cur);
    const prev = undoStack[undoStack.length - 1];
    applySnapshot(prev);

    btnUndo && (btnUndo.disabled = undoStack.length <= 1);
    btnRedo && (btnRedo.disabled = redoStack.length === 0);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    applySnapshot(next);

    btnUndo && (btnUndo.disabled = undoStack.length <= 1);
    btnRedo && (btnRedo.disabled = redoStack.length === 0);
  }

  // ===== zoom helpers =====
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function getStageClientSize() {
    // canvas jest skalowany CSS-em; bierzemy jego bbox
    const rect = drawCanvasEl.getBoundingClientRect();
    return { w: rect.width || 1, h: rect.height || 1 };
  }

  function setZoom(z) {
    if (!fabricCanvas) return;
    const zoom = clamp(z, 0.5, 40);

    const center = fabricCanvas.getCenter();
    fabricCanvas.zoomToPoint(new (requireFabric()).Point(center.left, center.top), zoom);
    fabricCanvas.requestRenderAll();
  }

  function zoomIn() { if (!fabricCanvas) return; setZoom(fabricCanvas.getZoom() * 1.15); }
  function zoomOut() { if (!fabricCanvas) return; setZoom(fabricCanvas.getZoom() / 1.15); }
  function zoom100() { if (!fabricCanvas) return; setZoom(1); }

  function zoomFit() {
    if (!fabricCanvas) return;
    const { w, h } = getStageClientSize();
    // dopasuj 150x70 do widocznego obszaru, z małym marginesem
    const zx = (w - 20) / DOT_W;
    const zy = (h - 20) / DOT_H;
    const z = clamp(Math.min(zx, zy), 0.5, 40);
    setZoom(z);

    // wycentruj viewport
    const vt = fabricCanvas.viewportTransform;
    if (vt) {
      vt[4] = 10; // translateX
      vt[5] = 10; // translateY
      fabricCanvas.requestRenderAll();
    }
  }

  // ===== export -> bits150 =====
  function canvasToBits150() {
    if (!fabricCanvas) return new Uint8Array(DOT_W * DOT_H);

    // render do offscreen 150x70
    const off = document.createElement("canvas");
    off.width = DOT_W;
    off.height = DOT_H;
    const g = off.getContext("2d", { willReadFrequently: true });

    g.clearRect(0, 0, DOT_W, DOT_H);
    g.fillStyle = "#000";
    g.fillRect(0, 0, DOT_W, DOT_H);

    // zrzut sceny bez zoom/pan: użyj toCanvasElement z viewportem
    const el = fabricCanvas.toCanvasElement(1, { withoutTransform: true, withoutShadow: true });
    g.drawImage(el, 0, 0, DOT_W, DOT_H);

    const img = g.getImageData(0, 0, DOT_W, DOT_H).data;
    const out = new Uint8Array(DOT_W * DOT_H);

    for (let y = 0; y < DOT_H; y++) {
      for (let x = 0; x < DOT_W; x++) {
        const i = (y * DOT_W + x) * 4;
        // bierzemy jasność; biały = on
        const r = img[i], gg = img[i + 1], b = img[i + 2];
        const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        out[y * DOT_W + x] = lum >= 128 ? 1 : 0;
      }
    }
    return out;
  }

  function drawMiniPreview(bits) {
    if (!miniPrevEl) return;
    const g = miniPrevEl.getContext("2d");
    const cw = miniPrevEl.width, ch = miniPrevEl.height;

    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cw, ch);
    g.fillStyle = "#000";
    g.fillRect(0, 0, cw, ch);

    const scale = Math.min(cw / DOT_W, ch / DOT_H);
    const ox = Math.floor((cw - DOT_W * scale) / 2);
    const oy = Math.floor((ch - DOT_H * scale) / 2);

    g.fillStyle = "#fff";
    for (let y = 0; y < DOT_H; y++) {
      for (let x = 0; x < DOT_W; x++) {
        if (!bits[y * DOT_W + x]) continue;
        g.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }

  function pushPreviewNow() {
    const bits = canvasToBits150();
    ctx.onPreview?.({ kind: "PIX", bits });
    drawMiniPreview(bits);
  }

  // ===== tool logic =====
  function setTool(t) {
    tool = t;
    syncToolUI();
    setCanvasModeForTool();
  }

  function getPointerOnScene(opt) {
    // opt is fabric event; use absolute pointer in canvas coords
    return fabricCanvas.getPointer(opt.e, true);
  }

  function startShape(opt) {
    const fabric = requireFabric();
    const p = getPointerOnScene(opt);
    startPt = { x: p.x, y: p.y };

    const common = {
      left: p.x,
      top: p.y,
      fill: "rgba(0,0,0,0)",
      stroke: "#ffffff",
      strokeWidth: 2,
      selectable: false,
      evented: false,
      objectCaching: false,
    };

    if (tool === "LINE") {
      tempObj = new fabric.Line([p.x, p.y, p.x, p.y], common);
      fabricCanvas.add(tempObj);
      return;
    }

    if (tool === "RECT") {
      tempObj = new fabric.Rect({ ...common, width: 1, height: 1 });
      fabricCanvas.add(tempObj);
      return;
    }

    if (tool === "ELLIPSE") {
      tempObj = new fabric.Ellipse({ ...common, rx: 1, ry: 1, originX: "left", originY: "top" });
      fabricCanvas.add(tempObj);
      return;
    }
  }

  function moveShape(opt) {
    if (!tempObj || !startPt) return;
    const p = getPointerOnScene(opt);

    if (tool === "LINE") {
      tempObj.set({ x2: p.x, y2: p.y });
      fabricCanvas.requestRenderAll();
      return;
    }

    const x = Math.min(startPt.x, p.x);
    const y = Math.min(startPt.y, p.y);
    const w = Math.abs(p.x - startPt.x);
    const h = Math.abs(p.y - startPt.y);

    if (tool === "RECT") {
      tempObj.set({ left: x, top: y, width: w, height: h });
      fabricCanvas.requestRenderAll();
      return;
    }

    if (tool === "ELLIPSE") {
      tempObj.set({ left: x, top: y, rx: w / 2, ry: h / 2 });
      fabricCanvas.requestRenderAll();
      return;
    }
  }

  function endShape() {
    if (!tempObj) return;
    // final: make selectable only in select mode
    tempObj.set({ selectable: false, evented: false });
    tempObj = null;
    startPt = null;

    ctx.markDirty?.();
    scheduleSnapshot("shape");
    pushPreviewNow();
  }

  function polyAddPoint(opt) {
    if (!fabricCanvas) return;
    const fabric = requireFabric();
    const p = getPointerOnScene(opt);

    polyPoints.push({ x: p.x, y: p.y });

    // preview polyline
    if (polyPreview) fabricCanvas.remove(polyPreview);

    polyPreview = new fabric.Polyline(polyPoints, {
      fill: "rgba(0,0,0,0)",
      stroke: "#ffffff",
      strokeWidth: 2,
      selectable: false,
      evented: false,
      objectCaching: false,
    });

    fabricCanvas.add(polyPreview);
    fabricCanvas.requestRenderAll();
  }

  function polyCommit() {
    if (!fabricCanvas) return;
    const fabric = requireFabric();
    if (polyPoints.length < 3) {
      clearPolyPreview();
      fabricCanvas.requestRenderAll();
      return;
    }

    if (polyPreview) fabricCanvas.remove(polyPreview);

    const poly = new fabric.Polygon(polyPoints, {
      fill: "rgba(0,0,0,0)",
      stroke: "#ffffff",
      strokeWidth: 2,
      selectable: false,
      evented: false,
      objectCaching: false,
    });

    fabricCanvas.add(poly);
    clearPolyPreview();

    ctx.markDirty?.();
    scheduleSnapshot("poly");
    pushPreviewNow();
  }

  function polyCancel() {
    clearPolyPreview();
    fabricCanvas.requestRenderAll();
  }

  // ===== install Fabric =====
  let installed = false;

  function installFabricOnce() {
    if (installed) return;
    installed = true;

    const fabric = requireFabric();
    if (!drawCanvasEl) throw new Error("Brak #drawCanvas w HTML.");

    fabricCanvas = new fabric.Canvas(drawCanvasEl, {
      backgroundColor: "#000000",
      selection: true,
      preserveObjectStacking: true,
      renderOnAddRemove: true,
      fireRightClick: true,
      stopContextMenu: true,
    });

    // Ustaw rozmiar „świata” na 150x70 (canvas ma taki rozmiar w atrybutach)
    fabricCanvas.setWidth(DOT_W);
    fabricCanvas.setHeight(DOT_H);

    // event: free drawing changes => snapshot + preview
    fabricCanvas.on("path:created", () => {
      ctx.markDirty?.();
      scheduleSnapshot("draw");
      pushPreviewNow();
    });

    fabricCanvas.on("object:modified", () => {
      ctx.markDirty?.();
      scheduleSnapshot("modify");
      pushPreviewNow();
    });

    fabricCanvas.on("object:added", (e) => {
      if (snapshotLock) return;
      // object:added leci także podczas loadFromJSON — lock to blokuje
      if (e?.target && e.target !== polyPreview) {
        ctx.markDirty?.();
        scheduleSnapshot("add");
        pushPreviewNow();
      }
    });

    fabricCanvas.on("object:removed", () => {
      if (snapshotLock) return;
      ctx.markDirty?.();
      scheduleSnapshot("remove");
      pushPreviewNow();
    });

    // PAN tool: mouse handling
    fabricCanvas.on("mouse:down", (opt) => {
      if (ctx.getMode?.() !== "DRAW") return;

      if (tool === "PAN") {
        isPanning = true;
        fabricCanvas.defaultCursor = "grabbing";
        const e = opt.e;
        panLast = { x: e.clientX, y: e.clientY };
        return;
      }

      if (tool === "LINE" || tool === "RECT" || tool === "ELLIPSE") {
        startShape(opt);
        return;
      }

      if (tool === "POLY") {
        polyAddPoint(opt);
        return;
      }
    });

    fabricCanvas.on("mouse:move", (opt) => {
      if (ctx.getMode?.() !== "DRAW") return;

      if (tool === "PAN" && isPanning) {
        const e = opt.e;
        const dx = e.clientX - panLast.x;
        const dy = e.clientY - panLast.y;
        panLast = { x: e.clientX, y: e.clientY };

        const vt = fabricCanvas.viewportTransform;
        if (vt) {
          vt[4] += dx;
          vt[5] += dy;
          fabricCanvas.requestRenderAll();
        }
        return;
      }

      if ((tool === "LINE" || tool === "RECT" || tool === "ELLIPSE") && tempObj) {
        moveShape(opt);
      }
    });

    fabricCanvas.on("mouse:up", () => {
      if (ctx.getMode?.() !== "DRAW") return;

      if (tool === "PAN") {
        isPanning = false;
        fabricCanvas.defaultCursor = "grab";
        return;
      }

      if (tool === "LINE" || tool === "RECT" || tool === "ELLIPSE") {
        endShape();
      }
    });

    // keyboard for polygon
    window.addEventListener("keydown", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (tool !== "POLY") return;

      if (ev.key === "Enter") {
        ev.preventDefault();
        polyCommit();
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        polyCancel();
      }
    });

    // initial snapshot
    takeSnapshot("init");

    // start mode
    setTool("BRUSH");
    zoomFit();
    pushPreviewNow();
  }

  // ===== bind UI =====
  function bindUi() {
    btnSel?.addEventListener("click", () => setTool("SELECT"));
    btnPan?.addEventListener("click", () => setTool("PAN"));

    btnZoomIn?.addEventListener("click", zoomIn);
    btnZoomOut?.addEventListener("click", zoomOut);
    btnZoom100?.addEventListener("click", zoom100);
    btnZoomFit?.addEventListener("click", zoomFit);

    btnBrush?.addEventListener("click", () => setTool("BRUSH"));
    btnEraser?.addEventListener("click", () => setTool("ERASER"));

    btnLine?.addEventListener("click", () => setTool("LINE"));
    btnRect?.addEventListener("click", () => setTool("RECT"));
    btnEllipse?.addEventListener("click", () => setTool("ELLIPSE"));
    btnPoly?.addEventListener("click", () => setTool("POLY"));

    btnUndo?.addEventListener("click", () => undo());
    btnRedo?.addEventListener("click", () => redo());

    btnClear?.addEventListener("click", () => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!fabricCanvas) return;

      hardResetInteractions();

      snapshotLock++;
      fabricCanvas.getObjects().slice().forEach(obj => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      snapshotLock = Math.max(0, snapshotLock - 1);

      ctx.markDirty?.();
      takeSnapshot("clear");
      pushPreviewNow();
    });
  }

  let uiBound = false;

  return {
    open() {
      show(paneDraw, true);

      if (!uiBound) { bindUi(); uiBound = true; }

      installFabricOnce();

      // reset sesji draw: czyścimy obiekty, ale nie niszczymy canvasa (stabilniej)
      if (fabricCanvas) {
        hardResetInteractions();

        snapshotLock++;
        fabricCanvas.getObjects().slice().forEach(obj => fabricCanvas.remove(obj));
        fabricCanvas.setBackgroundColor("#000", fabricCanvas.renderAll.bind(fabricCanvas));
        fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        snapshotLock = Math.max(0, snapshotLock - 1);

        undoStack.length = 0;
        redoStack.length = 0;
        takeSnapshot("open-reset");

        setTool("BRUSH");
        zoomFit();
        pushPreviewNow();

        btnUndo && (btnUndo.disabled = undoStack.length <= 1);
        btnRedo && (btnRedo.disabled = redoStack.length === 0);
      }

      ctx.clearDirty?.();
    },

    close() {
      show(paneDraw, false);
      // nie niszczymy fabricCanvas — zostaje
    },

    getCreatePayload() {
      const bits = canvasToBits150();
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
