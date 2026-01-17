// familiada/logo-editor/js/draw.js
// Tryb: DRAW (pędzel/gumka) => zapis jako PIX_150x70.

export function initDrawEditor(ctx) {
  const { DOT_W, DOT_H, paneDraw, drawCanvas, btnBrush, btnEraser, btnClear } = ctx;

  let bits = new Uint8Array(DOT_W * DOT_H);
  let dirty = false;
  let tool = "BRUSH";
  let initialized = false;
  let onPreview = () => {};

  function markDirty() { dirty = true; ctx.markDirty(); }

  function clearCanvas() {
    const c = drawCanvas;
    if (!c) return;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
  }

  function drawBitsToCanvasBW() {
    const c = drawCanvas;
    if (!c) return;
    const g = c.getContext("2d");
    const img = g.createImageData(DOT_W, DOT_H);
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const v = bits[i] ? 255 : 0;
      img.data[i * 4 + 0] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  function setPix(x, y, v) {
    if (x < 0 || y < 0 || x >= DOT_W || y >= DOT_H) return;
    bits[y * DOT_W + x] = v ? 1 : 0;
  }

  function pointerToXY(ev) {
    const rect = drawCanvas.getBoundingClientRect();
    const cx = (ev.clientX - rect.left) / rect.width;
    const cy = (ev.clientY - rect.top) / rect.height;
    return { x: Math.floor(cx * DOT_W), y: Math.floor(cy * DOT_H) };
  }

  function setTool(t) {
    tool = t;
    btnBrush?.classList.toggle("gold", tool === "BRUSH");
    btnEraser?.classList.toggle("gold", tool === "ERASER");
  }

  function installPointer() {
    if (!drawCanvas || initialized) return;
    initialized = true;

    let down = false;

    const paint = (ev) => {
      const { x, y } = pointerToXY(ev);
      const v = tool === "BRUSH" ? 1 : 0;

      // minimalny "kwadrat" 2x2 - jak dotykowy pędzel
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 0; dx++) {
          setPix(x + dx, y + dy, v);
        }
      }

      markDirty();
      drawBitsToCanvasBW();
      onPreview(bits);
    };

    drawCanvas.addEventListener("pointerdown", (ev) => {
      if (ctx.getMode() !== "DRAW") return;
      down = true;
      drawCanvas.setPointerCapture(ev.pointerId);
      paint(ev);
    });

    drawCanvas.addEventListener("pointermove", (ev) => {
      if (!down) return;
      if (ctx.getMode() !== "DRAW") return;
      paint(ev);
    });

    const up = () => { down = false; };
    drawCanvas.addEventListener("pointerup", up);
    drawCanvas.addEventListener("pointercancel", up);
  }

  const api = {
    mode: "DRAW",
    show() { ctx.show(paneDraw, true); },
    hide() { ctx.show(paneDraw, false); },
    open() {
      bits = new Uint8Array(DOT_W * DOT_H);
      dirty = false;
      clearCanvas();
      drawBitsToCanvasBW();
      onPreview(bits);
      setTool("BRUSH");
      installPointer();
    },
    isDirty() { return dirty; },
    setOnPreview(fn) { onPreview = fn || (() => {}); },
    getCreate() {
      return { ok: true, type: ctx.TYPE_PIX, payload: ctx.packBitsPayload(bits) };
    },
    getBits() { return bits; },
  };

  btnBrush?.addEventListener("click", () => setTool("BRUSH"));
  btnEraser?.addEventListener("click", () => setTool("ERASER"));
  btnClear?.addEventListener("click", () => {
    if (ctx.getMode() !== "DRAW") return;
    bits.fill(0);
    markDirty();
    drawBitsToCanvasBW();
    onPreview(bits);
  });

  return api;
}
