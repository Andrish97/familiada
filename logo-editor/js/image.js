// familiada/logo-editor/js/image.js
// Tryb: IMAGE -> PIX_150x70

export function initImageEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  const paneImage = document.getElementById("paneImage");
  const imgFile = document.getElementById("imgFile");
  const imgCanvas = document.getElementById("imgCanvas");
  const chkImgContain = document.getElementById("chkImgContain");
  const chkImgDither = document.getElementById("chkImgDither");

  const inpThresh = document.getElementById("inpThresh");

  const DOT_W = ctx.DOT_W;
  const DOT_H = ctx.DOT_H;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

  let bits = new Uint8Array(DOT_W * DOT_H);
  let initialized = false;

  function drawBits(bits01) {
    if (!imgCanvas) return;
    const g = imgCanvas.getContext("2d");
    const img = g.createImageData(DOT_W, DOT_H);
    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const v = bits01[i] ? 255 : 0;
      img.data[i*4+0] = v;
      img.data[i*4+1] = v;
      img.data[i*4+2] = v;
      img.data[i*4+3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  function imageDataToBits(imgData, threshold, dither) {
    const out = new Uint8Array(DOT_W * DOT_H);
    const lum = new Float32Array(DOT_W * DOT_H);

    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const r = imgData.data[i*4+0];
      const g = imgData.data[i*4+1];
      const b = imgData.data[i*4+2];
      lum[i] = 0.2126*r + 0.7152*g + 0.0722*b;
    }

    if (!dither) {
      for (let i = 0; i < out.length; i++) out[i] = lum[i] >= threshold ? 1 : 0;
      return out;
    }

    for (let y = 0; y < DOT_H; y++) {
      for (let x = 0; x < DOT_W; x++) {
        const i = y*DOT_W + x;
        const oldv = lum[i];
        const newv = oldv >= threshold ? 255 : 0;
        out[i] = newv ? 1 : 0;
        const err = oldv - newv;

        if (x + 1 < DOT_W) lum[i + 1] += err * (7/16);
        if (y + 1 < DOT_H) {
          if (x > 0) lum[i + DOT_W - 1] += err * (3/16);
          lum[i + DOT_W] += err * (5/16);
          if (x + 1 < DOT_W) lum[i + DOT_W + 1] += err * (1/16);
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

      let dw = DOT_W, dh = DOT_H, dx = 0, dy = 0;

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
      const threshold = clamp(Number(inpThresh?.value || 128), 40, 220);
      const dither = !!chkImgDither?.checked;

      bits = imageDataToBits(data, threshold, dither);
      drawBits(bits);
      ctx.onPreview?.({ kind: "PIX", bits });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function bindOnce() {
    if (initialized) return;
    initialized = true;

    imgFile?.addEventListener("change", async () => {
      if (ctx.getMode?.() !== "IMAGE") return;
      const f = imgFile.files?.[0];
      if (!f) return;
      ctx.markDirty?.();
      try { await loadImageFile(f); } catch (e) { console.error(e); alert(e?.message || String(e)); }
    });

    chkImgContain?.addEventListener("change", async () => {
      if (ctx.getMode?.() !== "IMAGE") return;
      const f = imgFile.files?.[0];
      if (!f) return;
      ctx.markDirty?.();
      await loadImageFile(f);
    });

    chkImgDither?.addEventListener("change", async () => {
      if (ctx.getMode?.() !== "IMAGE") return;
      const f = imgFile.files?.[0];
      if (!f) return;
      ctx.markDirty?.();
      await loadImageFile(f);
    });

    // próg (kontrast) jest wspólny i siedzi w main UI -> tu też reagujemy
    inpThresh?.addEventListener("input", async () => {
      if (ctx.getMode?.() !== "IMAGE") return;
      const f = imgFile.files?.[0];
      if (!f) return;
      ctx.markDirty?.();
      await loadImageFile(f);
    });
  }

  bindOnce();

  return {
    open() {
      show(paneImage, true);
      bits = new Uint8Array(DOT_W * DOT_H);
      if (imgFile) imgFile.value = "";
      drawBits(bits);
      ctx.onPreview?.({ kind: "PIX", bits });
      ctx.clearDirty?.();
    },

    close() {
      show(paneImage, false);
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
