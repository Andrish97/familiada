// familiada/logo-editor/js/draw.js
// Tryb: DRAW (Fabric.js) -> PIX_150x70

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  const paneDraw = document.getElementById("paneDraw");
  const drawCanvas = document.getElementById("drawCanvas");

  const btnBrush = document.getElementById("btnBrush");
  const btnEraser = document.getElementById("btnEraser");
  const btnClear = document.getElementById("btnClear");

  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // stan
  let bits = new Uint8Array(DOT_W * DOT_H);

  let f = null;                  // fabric.Canvas
  let tool = "BRUSH";            // BRUSH | ERASER
  let initialized = false;

  // ====== UI helpers
  function setTool(t) {
    tool = t;
    btnBrush?.classList.toggle("gold", tool === "BRUSH");
    btnEraser?.classList.toggle("gold", tool === "ERASER");

    if (!f) return;

    // 1 kolor: BRUSH rysuje białym, ERASER rysuje czarnym (na czarnym tle)
    // To jest “gumka” w praktyce: zamalowuje na czarno.
    const c = tool === "BRUSH" ? "#fff" : "#000";
    if (f.freeDrawingBrush) f.freeDrawingBrush.color = c;
  }

  function clearBitsAndPreview() {
    bits = new Uint8Array(DOT_W * DOT_H);
    ctx.onPreview?.({ kind: "PIX", bits });
  }

  // ====== eksport Fabric -> 150x70 bits (1 kolor)
  function exportFabricToBits150x70() {
    if (!f) return new Uint8Array(DOT_W * DOT_H);

    // bierzemy “surowy” canvas Fabric (piksele tego, co user narysował)
    const src = f.lowerCanvasEl;

    // offscreen 150x70
    const off = document.createElement("canvas");
    off.width = DOT_W;
    off.height = DOT_H;

    const g = off.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = true;

    // tło czarne
    g.fillStyle = "#000";
    g.fillRect(0, 0, DOT_W, DOT_H);

    // skala down do 150x70
    g.drawImage(src, 0, 0, DOT_W, DOT_H);

    const { data } = g.getImageData(0, 0, DOT_W, DOT_H);

    // próg stały (możesz podpiąć inpThresh kiedyś, ale tu prosto)
    const threshold = clamp(Number(ctx.getThreshold?.() ?? 128), 10, 245);

    const out = new Uint8Array(DOT_W * DOT_H);
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const r = data[i * 4 + 0];
      const gg = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      // luminancja
      const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;

      // białe = 1, czarne = 0
      out[i] = lum >= threshold ? 1 : 0;
    }

    return out;
  }

  let _deb = null;
  function schedulePreview(ms = 60) {
    clearTimeout(_deb);
    _deb = setTimeout(() => {
      if (!f) return;
      bits = exportFabricToBits150x70();
      ctx.onPreview?.({ kind: "PIX", bits });
    }, ms);
  }

  // ====== rozmiar “na ekranie” (duży), ale proporcje 150/70
  function fitFabricToContainer() {
    if (!f || !drawCanvas) return;

    const box = drawCanvas.parentElement;
    if (!box) return;

    const w = Math.max(1, Math.floor(box.clientWidth));
    const h = Math.max(1, Math.floor(w * (DOT_H / DOT_W))); // proporcje 150/70

    // ustaw realny rozmiar canvasa (piksele)
    f.setWidth(w);
    f.setHeight(h);

    // tło zawsze czarne
    f.setBackgroundColor("#000", () => f.requestRenderAll());

    // przerysuj i odśwież preview
    f.requestRenderAll();
    schedulePreview(50);
  }

  function installFabricOnce() {
    if (initialized) return;
    initialized = true;

    if (!drawCanvas) throw new Error("Brak #drawCanvas");
    if (!window.fabric) throw new Error("Brak Fabric.js (script nie wczytany).");

    // Fabric na istniejącym <canvas id="drawCanvas">
    f = new window.fabric.Canvas(drawCanvas, {
      backgroundColor: "#000",
      selection: true,          // na razie zostawiamy, potem dodamy narzędzia/kształty
      preserveObjectStacking: true,
    });

    // rysowanie “od ręki”
    f.isDrawingMode = true;
    f.freeDrawingBrush = new window.fabric.PencilBrush(f);
    f.freeDrawingBrush.width = 18;         // możesz zmienić grubość
    f.freeDrawingBrush.color = "#fff";     // 1 kolor

    // każdy nowy obiekt: zabezpieczenie “1 kolor”
    f.on("object:added", (e) => {
      const o = e?.target;
      if (!o) return;

      // wymuś b/w
      // (dla pędzla to zwykle Path -> fill bywa null, stroke jest ważny)
      if ("stroke" in o) o.stroke = (tool === "BRUSH") ? "#fff" : "#000";
      if ("fill" in o && o.fill) o.fill = (tool === "BRUSH") ? "#fff" : "#000";
    });

    // każde rysowanie zmienia preview
    f.on("path:created", () => {
      ctx.markDirty?.();
      schedulePreview(60);
    });

    // gdy user przesuwa/zmienia obiekty (na przyszłość)
    f.on("object:modified", () => {
      ctx.markDirty?.();
      schedulePreview(60);
    });

    // resize
    const ro = new ResizeObserver(() => fitFabricToContainer());
    ro.observe(drawCanvas.parentElement);

    // start tool
    setTool("BRUSH");

    // pierwszy fit
    fitFabricToContainer();
  }

  // ====== buttons
  btnBrush?.addEventListener("click", () => {
    if (ctx.getMode?.() !== "DRAW") return;
    if (!f) return;
    f.isDrawingMode = true;
    setTool("BRUSH");
  });

  btnEraser?.addEventListener("click", () => {
    if (ctx.getMode?.() !== "DRAW") return;
    if (!f) return;
    f.isDrawingMode = true;
    setTool("ERASER");
  });

  btnClear?.addEventListener("click", () => {
    if (ctx.getMode?.() !== "DRAW") return;
    if (!f) return;

    f.clear();
    f.setBackgroundColor("#000", () => f.requestRenderAll());

    clearBitsAndPreview();
    ctx.markDirty?.();
    schedulePreview(30);
  });

  return {
    open() {
      show(paneDraw, true);

      installFabricOnce();

      // reset sesji: czyścimy scenę (żeby nie było starego rysunku)
      if (f) {
        f.clear();
        f.setBackgroundColor("#000", () => f.requestRenderAll());
        f.isDrawingMode = true;
        setTool("BRUSH");
        fitFabricToContainer();
      }

      clearBitsAndPreview();
      ctx.clearDirty?.();
      schedulePreview(30);
    },

    close() {
      show(paneDraw, false);
      // nie niszczymy Fabric (tak jak TinyMCE) — szybciej i stabilniej
    },

    getCreatePayload() {
      // upewnij się, że bity są aktualne
      if (f) bits = exportFabricToBits150x70();

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
