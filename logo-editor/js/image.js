// familiada/logo-editor/js/image.js
// Tryb: IMAGE (wczytaj obraz -> prog -> opcjonalny dithering) => zapis jako PIX_150x70.

export function initImageEditor(ctx) {
  const { DOT_W, DOT_H, paneImage, imgFile, imgCanvas, chkImgContain, chkImgDither } = ctx;

  let bits = new Uint8Array(DOT_W * DOT_H);
  let dirty = false;
  let initialized = false;
  let onPreview = () => {};

  function markDirty() { dirty = true; ctx.markDirty(); }
  function clearDirty() { dirty = false; ctx.clearDirty(); }

  function drawBitsToCanvasBW(bits01) {
    if (!imgCanvas) return;
    const c = imgCanvas;
    const g = c.getContext("2d");
    const img = g.createImageData(DOT_W, DOT_H);
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const v = bits01[i] ? 255 : 0;
      img.data[i * 4 + 0] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  function imageDataToBits(imgData, threshold, dither) {
    const out = new Uint8Array(DOT_W * DOT_H);
    const lum = new Float32Array(DOT_W * DOT_H);
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const r = imgData.data[i * 4 + 0];
      const g = imgData.data[i * 4 + 1];
      const b = imgData.data[i * 4 + 2];
      lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    if (!dither) {
      for (let i = 0; i < DOT_W * DOT_H; i++) out[i] = lum[i] >= threshold ? 1 : 0;
      return out;
    }

    // Floyd–Steinberg
    for (let y = 0; y < DOT_H; y++) {
      for (let x = 0; x < DOT_W; x++) {
        const i = y * DOT_W + x;
        const oldv = lum[i];
        const newv = oldv >= threshold ? 255 : 0;
        out[i] = newv ? 1 : 0;
        const err = oldv - newv;

        if (x + 1 < DOT_W) lum[i + 1] += err * (7 / 16);
        if (y + 1 < DOT_H) {
          if (x > 0) lum[i + DOT_W - 1] += err * (3 / 16);
          lum[i + DOT_W] += err * (5 / 16);
          if (x + 1 < DOT_W) lum[i + DOT_W + 1] += err * (1 / 16);
        }
      }
    }

    return out;
  }

  async function loadImageFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Nie udało się wczytać obrazu."));
        img.src = url;
      });

      const tmp = document.createElement("canvas");
      tmp.width = DOT_W;
      tmp.height = DOT_H;
      const g = tmp.getContext("2d");

      const contain = !!chkImgContain?.checked;
      const sx = img.width;
      const sy = img.height;

      let dw = DOT_W;
      let dh = DOT_H;
      let dx = 0;
      let dy = 0;

      if (contain) {
        const s = Math.min(DOT_W / sx, DOT_H / sy);
        dw = Math.max(1, Math.round(sx * s));
        dh = Math.max(1, Math.round(sy * s));
        dx = Math.floor((DOT_W - dw) / 2);
        dy = Math.floor((DOT_H - dh) / 2);
      } else {
        const s = Math.max(DOT_W / sx, DOT_H / sy);
        dw = Math.max(1, Math.round(sx * s));
        dh = Math.max(1, Math.round(sy * s));
        dx = Math.floor((DOT_W - dw) / 2);
        dy = Math.floor((DOT_H - dh) / 2);
      }

      g.clearRect(0, 0, DOT_W, DOT_H);
      g.drawImage(img, dx, dy, dw, dh);

      const data = g.getImageData(0, 0, DOT_W, DOT_H);
      const threshold = ctx.getThreshold();
      const dither = !!chkImgDither?.checked;

      bits = imageDataToBits(data, threshold, dither);
      drawBitsToCanvasBW(bits);
      onPreview(bits);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function bindOnce() {
    if (initialized) return;
    initialized = true;

    imgFile?.addEventListener("change", async () => {
      if (!imgFile.files?.[0]) return;
      markDirty();
      try {
        await loadImageFile(imgFile.files[0]);
      } catch (e) {
        console.error(e);
        alert(e?.message || String(e));
      }
    });

    chkImgContain?.addEventListener("change", async () => {
      if (!imgFile.files?.[0]) return;
      markDirty();
      await loadImageFile(imgFile.files[0]);
    });

    chkImgDither?.addEventListener("change", async () => {
      if (!imgFile.files?.[0]) return;
      markDirty();
      await loadImageFile(imgFile.files[0]);
    });

    // Gdy user zmieni prog (kontrast) w panelu glownego — main.js wywola api.refreshAfterThresholdChange()
  }

  const api = {
    mode: "IMAGE",
    show() { paneImage.style.display = ""; },
    hide() { paneImage.style.display = "none"; },
    open() {
      bits = new Uint8Array(DOT_W * DOT_H);
      dirty = false;
      if (imgFile) imgFile.value = "";
      drawBitsToCanvasBW(bits);
      onPreview(bits);
      clearDirty();
    },
    close() {},
    isDirty() { return dirty; },
    setOnPreview(fn) { onPreview = fn || (() => {}); },
    refreshAfterThresholdChange() {
      if (!imgFile.files?.[0]) return;
      loadImageFile(imgFile.files[0]);
    },
    getPayload() {
      return {
        type: ctx.TYPE_PIX,
        payload: ctx.packBitsPayload(bits),
      };
    },
  };

  bindOnce();
  return api;
}
