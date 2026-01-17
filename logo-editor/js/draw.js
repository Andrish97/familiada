// familiada/logo-editor/js/draw.js
// Tryb: DRAW -> PIX_150x70

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  const paneDraw = document.getElementById("paneDraw");
  const drawCanvas = document.getElementById("drawCanvas");
  const btnBrush = document.getElementById("btnBrush");
  const btnEraser = document.getElementById("btnEraser");
  const btnClear = document.getElementById("btnClear");

  const DOT_W = ctx.DOT_W;
  const DOT_H = ctx.DOT_H;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };

  let bits = new Uint8Array(DOT_W * DOT_H);
  let tool = "BRUSH";
  let initialized = false;

  function drawBits() {
    if (!drawCanvas) return;
    const g = drawCanvas.getContext("2d");
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

  function setTool(t) {
    tool = t;
    btnBrush?.classList.toggle("gold", tool === "BRUSH");
    btnEraser?.classList.toggle("gold", tool === "ERASER");
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

  function installPointer() {
    if (!drawCanvas || initialized) return;
    initialized = true;

    let down = false;

    const paint = (ev) => {
      const { x, y } = pointerToXY(ev);
      const v = tool === "BRUSH" ? 1 : 0;

      // 2x2
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 0; dx++) {
          setPix(x + dx, y + dy, v);
        }
      }

      ctx.markDirty?.();
      drawBits();
      ctx.onPreview?.({ kind: "PIX", bits });
    };

    drawCanvas.addEventListener("pointerdown", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      down = true;
      drawCanvas.setPointerCapture(ev.pointerId);
      paint(ev);
    });

    drawCanvas.addEventListener("pointermove", (ev) => {
      if (!down) return;
      if (ctx.getMode?.() !== "DRAW") return;
      paint(ev);
    });

    const up = () => { down = false; };
    drawCanvas.addEventListener("pointerup", up);
    drawCanvas.addEventListener("pointercancel", up);
  }

  btnBrush?.addEventListener("click", () => setTool("BRUSH"));
  btnEraser?.addEventListener("click", () => setTool("ERASER"));
  btnClear?.addEventListener("click", () => {
    if (ctx.getMode?.() !== "DRAW") return;
    bits.fill(0);
    ctx.markDirty?.();
    drawBits();
    ctx.onPreview?.({ kind: "PIX", bits });
  });

  return {
    open() {
      show(paneDraw, true);
      bits = new Uint8Array(DOT_W * DOT_H);
      setTool("BRUSH");
      drawBits();
      ctx.onPreview?.({ kind: "PIX", bits });
      ctx.clearDirty?.();
      installPointer();
    },

    close() {
      show(paneDraw, false);
    },

    getCreatePayload() {
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
