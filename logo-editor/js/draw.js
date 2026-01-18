// familiada/logo-editor/js/draw.js
// Tryb: DRAW (Fabric) -> export do PIX_150x70 (bits)

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // DOM
  const paneDraw = document.getElementById("paneDraw");
  const stageEl = document.getElementById("drawStage");
  const canvasEl = document.getElementById("drawCanvas");
  const miniEl = document.getElementById("drawMiniPreview");

  // tools
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

  function requireFabric() {
    if (!window.fabric) throw new Error("Brak Fabric.js (script nie wczytany).");
    return window.fabric;
  }

  let f = null;
  let fc = null; // fabric.Canvas
  let tool = "BRUSH";

  // pan
  let isPanning = false;
  let panLast = null;

  // shape temp
  let tempObj = null;
  let startPt = null;

  // polygon
  let polyPoints = [];
  let polyLive = null;

  // undo/redo
  let undoStack = [];
  let redoStack = [];
  let saveGuard = false;

  // =========================
  // Helpers UI
  // =========================
  function setTool(t) {
    tool = t;

    const all = [btnSel, btnPan, btnBrush, btnEraser, btnLine, btnRect, btnEllipse, btnPoly];
    const map = {
      SELECT: btnSel,
      PAN: btnPan,
      BRUSH: btnBrush,
      ERASER: btnEraser,
      LINE: btnLine,
      RECT: btnRect,
      ELLIPSE: btnEllipse,
      POLY: btnPoly,
    };

    for (const b of all) b?.classList.remove("on");
    map[t]?.classList.add("on");

    if (!fc) return;

    // reset trybów
    fc.isDrawingMode = false;
    fc.selection = false;
    fc.skipTargetFind = false;

    for (const obj of fc.getObjects()) obj.selectable = true;

    if (t === "SELECT") {
      fc.selection = true;
      fc.skipTargetFind = false;
      for (const obj of fc.getObjects()) obj.selectable = true;
    }

    if (t === "PAN") {
      fc.selection = false;
      fc.skipTargetFind = true;
      for (const obj of fc.getObjects()) obj.selectable = false;
    }

    if (t === "BRUSH") {
      fc.isDrawingMode = true;
      const b = new f.PencilBrush(fc);
      b.color = "#ffffff";
      b.width = 6;
      fc.freeDrawingBrush = b;
    }

    if (t === "ERASER") {
      fc.isDrawingMode = true;

      // “wektorowa gumka”: rysujemy przez destination-out (wycina)
      const b = new f.PencilBrush(fc);
      b.color = "#ffffff";
      b.width = 14;
      b.globalCompositeOperation = "destination-out";
      fc.freeDrawingBrush = b;
    }

    // shape tools obsługujemy my przez mouse events
    if (t === "LINE" || t === "RECT" || t === "ELLIPSE" || t === "POLY") {
      fc.selection = false;
      fc.skipTargetFind = true;
      for (const obj of fc.getObjects()) obj.selectable = false;
    }
  }

  function markDirtyAndPreview() {
    ctx.markDirty?.();
    const bits = exportBits150();
    ctx.onPreview?.({ kind: "PIX", bits });
    drawMini(bits);
  }

  // =========================
  // Canvas sizing / zoom fit
  // =========================
  function resizeToStage() {
    if (!fc || !stageEl) return;

    const r = stageEl.getBoundingClientRect();
    const w = Math.max(10, Math.floor(r.width));
    const h = Math.max(10, Math.floor(r.height));

    fc.setWidth(w);
    fc.setHeight(h);
    fc.calcOffset();

    zoomFit();
  }

  function zoomFit() {
    if (!fc) return;

    // dopasuj 150x70 do aktualnych px
    const cw = fc.getWidth();
    const ch = fc.getHeight();

    const scale = Math.min(cw / DOT_W, ch / DOT_H);
    const vx = (cw - DOT_W * scale) / 2;
    const vy = (ch - DOT_H * scale) / 2;

    fc.setViewportTransform([scale, 0, 0, scale, vx, vy]);
    fc.requestRenderAll();
  }

  function zoom100() {
    if (!fc) return;
    const cw = fc.getWidth();
    const ch = fc.getHeight();
    const scale = 1;
    const vx = (cw - DOT_W * scale) / 2;
    const vy = (ch - DOT_H * scale) / 2;
    fc.setViewportTransform([scale, 0, 0, scale, vx, vy]);
    fc.requestRenderAll();
  }

  function zoomBy(factor) {
    if (!fc) return;
    const vt = fc.viewportTransform;
    const scale = (vt?.[0] || 1) * factor;

    // clamp
    const s = Math.max(0.2, Math.min(12, scale));

    // zoom do środka sceny
    const center = new f.Point(fc.getWidth() / 2, fc.getHeight() / 2);
    fc.zoomToPoint(center, s);
    fc.requestRenderAll();
  }

  // =========================
  // Undo/Redo (JSON)
  // =========================
  function snapshot() {
    if (!fc || saveGuard) return;
    const json = fc.toDatalessJSON(["globalCompositeOperation"]);
    undoStack.push(json);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
  }

  function restoreFrom(json) {
    if (!fc) return;
    saveGuard = true;
    fc.loadFromJSON(json, () => {
      saveGuard = false;
      fc.requestRenderAll();
      markDirtyAndPreview();
    });
  }

  function undo() {
    if (!fc) return;
    if (undoStack.length <= 1) return; // zostaw co najmniej 1 stan
    const cur = undoStack.pop();
    redoStack.push(cur);
    const prev = undoStack[undoStack.length - 1];
    restoreFrom(prev);
  }

  function redo() {
    if (!fc) return;
    const nxt = redoStack.pop();
    if (!nxt) return;
    undoStack.push(nxt);
    restoreFrom(nxt);
  }

  function clearAll() {
    if (!fc) return;
    fc.getObjects().forEach(o => fc.remove(o));
    fc.requestRenderAll();
    snapshot();
    markDirtyAndPreview();
  }

  // =========================
  // Export do 150x70 bits (threshold)
  // =========================
  function exportBits150() {
    if (!fc) return new Uint8Array(DOT_W * DOT_H);

    // render do offscreen 150x70
    const off = document.createElement("canvas");
    off.width = DOT_W;
    off.height = DOT_H;
    const g = off.getContext("2d", { willReadFrequently: true });

    // czarne tło
    g.fillStyle = "#000";
    g.fillRect(0, 0, DOT_W, DOT_H);

    // tymczasowo renderujemy scenę bez viewport transform:
    const oldVT = fc.viewportTransform;
    fc.setViewportTransform([1,0,0,1,0,0]);

    // Fabric renderuje na swój canvas — bierzemy go jako obraz
    fc.renderAll();
    g.drawImage(fc.lowerCanvasEl, 0, 0, DOT_W, DOT_H);

    // przywróć transform i render
    fc.setViewportTransform(oldVT);
    fc.requestRenderAll();

    const { data } = g.getImageData(0, 0, DOT_W, DOT_H);
    const out = new Uint8Array(DOT_W * DOT_H);

    // białe = 1, czarne = 0 (threshold)
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const r = data[i*4+0], gg = data[i*4+1], b = data[i*4+2];
      const lum = 0.2126*r + 0.7152*gg + 0.0722*b;
      out[i] = lum > 40 ? 1 : 0;
    }
    return out;
  }

  function drawMini(bits) {
    if (!miniEl) return;
    const g = miniEl.getContext("2d");
    const cw = miniEl.width, ch = miniEl.height;

    const scale = Math.min(cw / DOT_W, ch / DOT_H);
    const ox = Math.floor((cw - DOT_W * scale) / 2);
    const oy = Math.floor((ch - DOT_H * scale) / 2);

    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cw, ch);
    g.fillStyle = "#000";
    g.fillRect(0, 0, cw, ch);

    g.fillStyle = "#fff";
    for (let y = 0; y < DOT_H; y++){
      for (let x = 0; x < DOT_W; x++){
        if (!bits[y*DOT_W + x]) continue;
        g.fillRect(ox + x*scale, oy + y*scale, scale, scale);
      }
    }
  }

  // =========================
  // Fabric init + events
  // =========================
  function installFabricOnce() {
    if (fc) return;
    f = requireFabric();

    if (!canvasEl) throw new Error("Brak #drawCanvas w HTML.");
    fc = new f.Canvas(canvasEl, {
      backgroundColor: "#000000",
      selection: false,
      preserveObjectStacking: true,
    });

    // domyślne: pędzel
    setTool("BRUSH");

    // --- Mouse: pan/shape ---
    fc.on("mouse:down", (opt) => {
      if (ctx.getMode?.() !== "DRAW") return;

      const e = opt.e;

      if (tool === "PAN") {
        isPanning = true;
        panLast = { x: e.clientX, y: e.clientY };
        return;
      }

      const p = fc.getPointer(e, true); // względem “świata”
      startPt = p;

      if (tool === "LINE") {
        tempObj = new f.Line([p.x, p.y, p.x, p.y], {
          stroke: "#fff", strokeWidth: 2, selectable: false, evented: false,
        });
        fc.add(tempObj);
      }

      if (tool === "RECT") {
        tempObj = new f.Rect({
          left: p.x, top: p.y, width: 1, height: 1,
          fill: "rgba(0,0,0,0)",
          stroke: "#fff", strokeWidth: 2,
          selectable: false, evented: false,
        });
        fc.add(tempObj);
      }

      if (tool === "ELLIPSE") {
        tempObj = new f.Ellipse({
          left: p.x, top: p.y, rx: 1, ry: 1,
          fill: "rgba(0,0,0,0)",
          stroke: "#fff", strokeWidth: 2,
          selectable: false, evented: false,
          originX: "left", originY: "top",
        });
        fc.add(tempObj);
      }

      if (tool === "POLY") {
        // klik dodaje punkt, drugi klik kończy (double click)
        polyPoints.push({ x: p.x, y: p.y });

        if (polyLive) fc.remove(polyLive);
        polyLive = new f.Polyline(polyPoints, {
          fill: "rgba(0,0,0,0)",
          stroke: "#fff", strokeWidth: 2,
          selectable: false, evented: false,
        });
        fc.add(polyLive);
        fc.requestRenderAll();
      }
    });

    fc.on("mouse:move", (opt) => {
      if (ctx.getMode?.() !== "DRAW") return;

      const e = opt.e;

      if (tool === "PAN" && isPanning && panLast) {
        const dx = e.clientX - panLast.x;
        const dy = e.clientY - panLast.y;
        panLast = { x: e.clientX, y: e.clientY };

        const vt = fc.viewportTransform;
        vt[4] += dx;
        vt[5] += dy;
        fc.setViewportTransform(vt);
        fc.requestRenderAll();
        return;
      }

      if (!tempObj || !startPt) return;

      const p = fc.getPointer(e, true);

      if (tool === "LINE") {
        tempObj.set({ x2: p.x, y2: p.y });
        fc.requestRenderAll();
      }

      if (tool === "RECT") {
        const w = p.x - startPt.x;
        const h = p.y - startPt.y;
        tempObj.set({
          left: Math.min(startPt.x, p.x),
          top: Math.min(startPt.y, p.y),
          width: Math.abs(w),
          height: Math.abs(h),
        });
        fc.requestRenderAll();
      }

      if (tool === "ELLIPSE") {
        const rx = Math.abs(p.x - startPt.x) / 2;
        const ry = Math.abs(p.y - startPt.y) / 2;
        const left = Math.min(startPt.x, p.x);
        const top = Math.min(startPt.y, p.y);
        tempObj.set({ left, top, rx, ry });
        fc.requestRenderAll();
      }
    });

    fc.on("mouse:up", () => {
      if (ctx.getMode?.() !== "DRAW") return;

      if (tool === "PAN") {
        isPanning = false;
        panLast = null;
        return;
      }

      if (tempObj) {
        // finalizuj kształt
        tempObj.selectable = false;
        tempObj.evented = false;
        tempObj = null;
        startPt = null;

        snapshot();
        markDirtyAndPreview();
      }
    });

    // Double click kończy wielokąt
    fc.upperCanvasEl.addEventListener("dblclick", () => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (tool !== "POLY") return;
      if (polyPoints.length < 3) return;

      // zamień polyline na polygon
      if (polyLive) fc.remove(polyLive);
      const poly = new f.Polygon(polyPoints, {
        fill: "rgba(0,0,0,0)",
        stroke: "#fff",
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      fc.add(poly);

      polyPoints = [];
      polyLive = null;

      snapshot();
      markDirtyAndPreview();
    });

    // po free draw / eraser -> snapshot + preview
    fc.on("path:created", () => {
      if (saveGuard) return;
      snapshot();
      markDirtyAndPreview();
    });

    // startowy snapshot
    snapshot();

    // resize obserwacja
    const ro = new ResizeObserver(() => resizeToStage());
    if (stageEl) ro.observe(stageEl);
    resizeToStage();
    markDirtyAndPreview();
  }

  // =========================
  // Bind buttons
  // =========================
  function bindUiOnce() {
    btnSel?.addEventListener("click", () => setTool("SELECT"));
    btnPan?.addEventListener("click", () => setTool("PAN"));

    btnZoomIn?.addEventListener("click", () => { if (fc) zoomBy(1.2); });
    btnZoomOut?.addEventListener("click", () => { if (fc) zoomBy(1/1.2); });
    btnZoom100?.addEventListener("click", () => { if (fc) zoom100(); });
    btnZoomFit?.addEventListener("click", () => { if (fc) zoomFit(); });

    btnBrush?.addEventListener("click", () => setTool("BRUSH"));
    btnEraser?.addEventListener("click", () => setTool("ERASER"));

    btnLine?.addEventListener("click", () => setTool("LINE"));
    btnRect?.addEventListener("click", () => setTool("RECT"));
    btnEllipse?.addEventListener("click", () => setTool("ELLIPSE"));
    btnPoly?.addEventListener("click", () => setTool("POLY"));

    btnUndo?.addEventListener("click", () => undo());
    btnRedo?.addEventListener("click", () => redo());
    btnClear?.addEventListener("click", () => clearAll());
  }

  let _bound = false;

  // =========================
  // API
  // =========================
  return {
    open() {
      show(paneDraw, true);
      if (!_bound) { bindUiOnce(); _bound = true; }

      installFabricOnce();

      // reset sesji rysunku
      clearAll();
      setTool("BRUSH");
      zoomFit();
      ctx.clearDirty?.();
    },

    close() {
      show(paneDraw, false);
    },

    getCreatePayload() {
      const bits = exportBits150();
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
