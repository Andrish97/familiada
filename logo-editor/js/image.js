// familiada/logo-editor/js/image.js
// Tryb: IMAGE -> duży obraz + kadr 26:11 -> przetwarzanie -> PIX_150x70

export function initImageEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // =========================================================
  // DOM
  // =========================================================
  const paneImage = document.getElementById("paneImage");

  const imgFile   = document.getElementById("imgFile");
  const imgLarge  = document.getElementById("imgLarge");

  const imgStage  = document.getElementById("imgStage");
  const cropBox   = document.getElementById("cropBox");

  const chkInvert = document.getElementById("chkImgInvert");

  const rngBright   = document.getElementById("rngImgBright");
  const rngContrast = document.getElementById("rngImgContrast");
  const rngGamma    = document.getElementById("rngImgGamma");
  const rngBlack    = document.getElementById("rngImgBlack");
  const rngWhite    = document.getElementById("rngImgWhite");

  const selMode     = document.getElementById("selImgDitherMode");
  const rngDither   = document.getElementById("rngImgDither");

  const valBright   = document.getElementById("valImgBright");
  const valContrast = document.getElementById("valImgContrast");
  const valGamma    = document.getElementById("valImgGamma");
  const valBlack    = document.getElementById("valImgBlack");
  const valWhite    = document.getElementById("valImgWhite");
  const valDither   = document.getElementById("valImgDither");

  const imgCanvas = document.getElementById("imgCanvas"); // techniczny 150x70

  // =========================================================
  // Const
  // =========================================================
  const DOT_W = ctx.DOT_W;
  const DOT_H = ctx.DOT_H;

  // proporcja kadru = 26:11 (jak ekran)
  const ASPECT = 26 / 11;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // =========================================================
  // State
  // =========================================================
  let bits = new Uint8Array(DOT_W * DOT_H);

  let imgObj = null; // Image() z naturą
  let imgUrl = null;

  let initialized = false;

  // ramka w px względem imgStage (NIE naturalnych)
  let crop = { x: 40, y: 40, w: 260, h: Math.round(260 / ASPECT) };

  let drag = null; // { kind: "move"|"tl"|"tr"|"bl"|"br", sx, sy, startCrop }

  let _deb = null;

  // =========================================================
  // UI: wartości suwaków
  // =========================================================
  function readSettings() {
    const bright = Number(rngBright?.value ?? 0);     // -100..100
    const contrast = Number(rngContrast?.value ?? 0); // -100..100
    const gamma = (Number(rngGamma?.value ?? 100) / 100); // 0.5..2.5
    const black = Number(rngBlack?.value ?? 0);       // 0..120
    const white = Number(rngWhite?.value ?? 255);     // 135..255
    const mode = String(selMode?.value || "THRESH");
    const ditherStrength = Number(rngDither?.value ?? 80); // 0..100
    const invert = !!chkInvert?.checked; // DOMYŚLNIE true
    return { bright, contrast, gamma, black, white, mode, ditherStrength, invert };
  }

  function syncLabels() {
    if (valBright) valBright.textContent = String(rngBright?.value ?? "0");
    if (valContrast) valContrast.textContent = String(rngContrast?.value ?? "0");
    if (valGamma) {
      const g = (Number(rngGamma?.value ?? 100) / 100);
      valGamma.textContent = g.toFixed(2);
    }
    if (valBlack) valBlack.textContent = String(rngBlack?.value ?? "0");
    if (valWhite) valWhite.textContent = String(rngWhite?.value ?? "255");
    if (valDither) valDither.textContent = String(rngDither?.value ?? "80");
  }

  // =========================================================
  // Crop: narzędzia
  // =========================================================
  function getStageRect() {
    return imgStage?.getBoundingClientRect() || { left:0, top:0, width:1, height:1 };
  }

  function getImgRect() {
    // obraz jest wewnątrz imgStage, wyśrodkowany; potrzebujemy realnego recta IMG na ekranie
    const r = imgLarge?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    return r;
  }

  function clampCropToImg(next) {
    const imgR = getImgRect();
    const stageR = getStageRect();
    if (!imgR) return next;

    // obszar obrazu w układzie stage (px)
    const imgX = imgR.left - stageR.left;
    const imgY = imgR.top  - stageR.top;
    const imgW = imgR.width;
    const imgH = imgR.height;

    const minW = 60;
    let w = Math.max(minW, next.w);
    let h = Math.max(1, Math.round(w / ASPECT));

    // nie pozwól być większym niż obraz
    if (w > imgW) { w = imgW; h = Math.round(w / ASPECT); }
    if (h > imgH) { h = imgH; w = Math.round(h * ASPECT); }

    // clamp pozycję
    let x = next.x;
    let y = next.y;

    x = clamp(x, imgX, imgX + imgW - w);
    y = clamp(y, imgY, imgY + imgH - h);

    return { x, y, w, h };
  }

  function applyCropToDom() {
    if (!cropBox) return;
    crop = clampCropToImg(crop);
    cropBox.style.left = `${Math.round(crop.x)}px`;
    cropBox.style.top  = `${Math.round(crop.y)}px`;
    cropBox.style.width  = `${Math.round(crop.w)}px`;
    cropBox.style.height = `${Math.round(crop.h)}px`;
  }

  function initCropToCenter() {
    const imgR = getImgRect();
    const stageR = getStageRect();
    if (!imgR) return;

    const imgX = imgR.left - stageR.left;
    const imgY = imgR.top  - stageR.top;
    const imgW = imgR.width;
    const imgH = imgR.height;

    // start: ~70% szerokości obrazu, dopasowane do ratio
    let w = imgW * 0.72;
    let h = w / ASPECT;
    if (h > imgH * 0.9) { h = imgH * 0.9; w = h * ASPECT; }

    const x = imgX + (imgW - w) / 2;
    const y = imgY + (imgH - h) / 2;
    crop = clampCropToImg({ x, y, w, h });
    applyCropToDom();
  }

  // =========================================================
  // Render: bits -> mini canvas 150x70 (dla debug)
  // =========================================================
  function drawBitsToMini(bits01) {
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

  // =========================================================
  // Image processing helpers
  // =========================================================
  function lumFromRGB(r,g,b) {
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }

  function applyBCGamma(v, bright, contrast, gamma) {
    // v 0..255
    let x = v;

    // brightness
    x = x + bright;

    // contrast (standard-ish)
    // contrast -100..100 -> factor 0..2
    const c = clamp(contrast, -100, 100);
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    x = factor * (x - 128) + 128;

    // clamp
    x = clamp(x, 0, 255);

    // gamma
    const g = clamp(gamma, 0.05, 10);
    x = 255 * Math.pow(x / 255, 1 / g);

    return clamp(x, 0, 255);
  }

  function applyLevels(v, black, white) {
    // black: 0..120, white: 135..255
    const b = clamp(black, 0, 200);
    const w = clamp(white, 1, 255);
    if (w <= b + 1) return v;

    let x = (v - b) * (255 / (w - b));
    x = clamp(x, 0, 255);
    return x;
  }

  function thresholdBits(lum, threshold, invert) {
    // lum 0..255 ; threshold 0..255
    // klasycznie: jaśniejsze => 1
    // invert=true: odwróć (ciemniejsze => 1)
    const on = lum >= threshold ? 1 : 0;
    return invert ? (on ? 0 : 1) : on;
  }

  // Bayer 8x8 (0..63)
  const BAYER8 = [
    [ 0,48,12,60, 3,51,15,63],
    [32,16,44,28,35,19,47,31],
    [ 8,56, 4,52,11,59, 7,55],
    [40,24,36,20,43,27,39,23],
    [ 2,50,14,62, 1,49,13,61],
    [34,18,46,30,33,17,45,29],
    [10,58, 6,54, 9,57, 5,53],
    [42,26,38,22,41,25,37,21],
  ];

  function ditherOrderedBayer(lums, w, h, threshold, strength, invert) {
    const out = new Uint8Array(w*h);
    const amp = (strength / 100) * 64; // 0..64

    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        const i = y*w + x;
        const t = BAYER8[y & 7][x & 7]; // 0..63
        // przesunięcie progu: (t-31.5) -> -31.5..31.5
        const dt = ((t - 31.5) / 63) * amp * 2; // ok -64..64 przy strength=100
        const th = clamp(threshold + dt, 0, 255);
        out[i] = thresholdBits(lums[i], th, invert);
      }
    }
    return out;
  }

  function ditherFloydSteinberg(lums, w, h, threshold, strength, invert) {
    // strength 0..100: 0 = progowanie, 100 = pełne FS
    const s = clamp(strength / 100, 0, 1);
    if (s <= 0.001) {
      const out = new Uint8Array(w*h);
      for (let i=0;i<out.length;i++) out[i] = thresholdBits(lums[i], threshold, invert);
      return out;
    }

    const buf = new Float32Array(lums); // copy
    const out = new Uint8Array(w*h);

    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        const i = y*w + x;

        const oldv = buf[i];
        const newv = oldv >= threshold ? 255 : 0;
        out[i] = thresholdBits(oldv, threshold, invert);

        // error diffusion (skalowane siłą)
        const err = (oldv - newv) * s;

        if (x+1 < w) buf[i+1] += err * (7/16);
        if (y+1 < h) {
          if (x>0)   buf[i+w-1] += err * (3/16);
          buf[i+w] += err * (5/16);
          if (x+1 < w) buf[i+w+1] += err * (1/16);
        }
      }
    }
    return out;
  }

  // =========================================================
  // Compile: crop -> 150x70 -> bits
  // =========================================================
  function cropToNaturalRect() {
    const imgR = getImgRect();
    const stageR = getStageRect();
    if (!imgR || !imgObj) return null;

    // crop w px względem stage -> na px względem IMG
    const imgX = imgR.left - stageR.left;
    const imgY = imgR.top  - stageR.top;

    const cx = crop.x - imgX;
    const cy = crop.y - imgY;
    const cw = crop.w;
    const ch = crop.h;

    // map display -> natural
    const sx = imgObj.naturalWidth / imgR.width;
    const sy = imgObj.naturalHeight / imgR.height;

    const nx = clamp(cx * sx, 0, imgObj.naturalWidth  - 1);
    const ny = clamp(cy * sy, 0, imgObj.naturalHeight - 1);
    const nw = clamp(cw * sx, 1, imgObj.naturalWidth  - nx);
    const nh = clamp(ch * sy, 1, imgObj.naturalHeight - ny);

    return { nx, ny, nw, nh };
  }

  function compileBits150() {
    if (!imgObj) {
      bits = new Uint8Array(DOT_W * DOT_H);
      return bits;
    }

    const rect = cropToNaturalRect();
    if (!rect) {
      bits = new Uint8Array(DOT_W * DOT_H);
      return bits;
    }

    const { bright, contrast, gamma, black, white, mode, ditherStrength, invert } = readSettings();

    // 1) crop -> 150x70
    const tmp = document.createElement("canvas");
    tmp.width = DOT_W;
    tmp.height = DOT_H;
    const g = tmp.getContext("2d", { willReadFrequently: true });

    // rysuj czarne tło i crop
    g.fillStyle = "#000";
    g.fillRect(0, 0, DOT_W, DOT_H);

    g.imageSmoothingEnabled = true;
    g.drawImage(
      imgObj,
      rect.nx, rect.ny, rect.nw, rect.nh,
      0, 0, DOT_W, DOT_H
    );

    // 2) lum + preprocessing
    const imgData = g.getImageData(0, 0, DOT_W, DOT_H);
    const data = imgData.data;

    const lums = new Float32Array(DOT_W * DOT_H);

    for (let i = 0; i < DOT_W * DOT_H; i++) {
      const r = data[i*4+0];
      const gg = data[i*4+1];
      const b  = data[i*4+2];

      let v = lumFromRGB(r, gg, b);
      v = applyBCGamma(v, bright, contrast, gamma);
      v = applyLevels(v, black, white);

      lums[i] = v;
    }

    // 3) rasteryzacja do bits
    const threshold = 128; // bazowy – teraz sterujesz raczej levels/kontrastem/gammą i ditheringiem

    let out = null;
    if (mode === "FS") {
      out = ditherFloydSteinberg(lums, DOT_W, DOT_H, threshold, ditherStrength, invert);
    } else if (mode === "BAYER8") {
      out = ditherOrderedBayer(lums, DOT_W, DOT_H, threshold, ditherStrength, invert);
    } else {
      out = new Uint8Array(DOT_W * DOT_H);
      for (let i=0;i<out.length;i++) out[i] = thresholdBits(lums[i], threshold, invert);
    }

    bits = out;
    return bits;
  }

  function pushPreviewNow() {
    const b = compileBits150();
    drawBitsToMini(b);
    ctx.onPreview?.({ kind: "PIX", bits: b });
  }

  function schedulePreview(ms = 50) {
    clearTimeout(_deb);
    _deb = setTimeout(() => {
      if (ctx.getMode?.() !== "IMAGE") return;
      pushPreviewNow();
    }, ms);
  }

  // =========================================================
  // Load image
  // =========================================================
  async function loadImageFile(file) {
    if (!file) return;

    // czyść poprzedni URL
    if (imgUrl) {
      try { URL.revokeObjectURL(imgUrl); } catch {}
      imgUrl = null;
    }

    imgUrl = URL.createObjectURL(file);

    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Nie udało się wczytać obrazu."));
      img.src = imgUrl;
    });

    imgObj = img;

    // ustaw <img> w UI (to jest renderowany obraz, na nim siedzi crop)
    if (imgLarge) {
      imgLarge.src = imgUrl;
    }

    // poczekaj aż przeglądarka przeliczy layout i recty IMG
    requestAnimationFrame(() => {
      initCropToCenter();
      schedulePreview(10);
    });
  }

  // =========================================================
  // Pointer: move/resize crop
  // =========================================================
  function onPointerDown(ev) {
    if (ctx.getMode?.() !== "IMAGE") return;
    if (!imgObj) return;

    const t = ev.target;
    const handle = t?.closest?.(".cropHandle")?.dataset?.h || null;

    // klik w cropBox (move) lub w handle (resize)
    const kind = handle || "move";

    drag = {
      kind,
      sx: ev.clientX,
      sy: ev.clientY,
      startCrop: { ...crop },
    };

    cropBox?.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (!drag) return;
    if (!imgObj) return;

    const dx = ev.clientX - drag.sx;
    const dy = ev.clientY - drag.sy;

    const s = drag.startCrop;

    if (drag.kind === "move") {
      crop = clampCropToImg({
        x: s.x + dx,
        y: s.y + dy,
        w: s.w,
        h: s.h
      });
      applyCropToDom();
      schedulePreview(30);
      return;
    }

    // resize: trzymamy ratio 26:11 zawsze
    // upraszczamy: liczymy zmianę po X (dominująco), a Y wynika z ratio
    // a pozycję dopasowujemy zależnie od rogu.
    const d = dx; // bazowo po X
    let newW = s.w;
    if (drag.kind === "br" || drag.kind === "tr") newW = s.w + d;
    if (drag.kind === "bl" || drag.kind === "tl") newW = s.w - d;

    newW = Math.max(60, newW);
    let newH = Math.round(newW / ASPECT);

    // wylicz x,y zależnie od rogu
    let newX = s.x;
    let newY = s.y;

    if (drag.kind === "tl") {
      newX = s.x + (s.w - newW);
      newY = s.y + (s.h - newH);
    }
    if (drag.kind === "tr") {
      newX = s.x;
      newY = s.y + (s.h - newH);
    }
    if (drag.kind === "bl") {
      newX = s.x + (s.w - newW);
      newY = s.y;
    }
    if (drag.kind === "br") {
      newX = s.x;
      newY = s.y;
    }

    crop = clampCropToImg({ x: newX, y: newY, w: newW, h: newH });
    applyCropToDom();
    schedulePreview(30);
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    schedulePreview(10);
  }

  // gdy zmienia się layout (np. resize okna), trzeba przeliczyć crop do nowej geometrii
  function onLayoutChange() {
    if (ctx.getMode?.() !== "IMAGE") return;
    if (!imgObj) return;
    // najprościej: ustaw crop na centrum ponownie (stabilne i przewidywalne)
    initCropToCenter();
    schedulePreview(20);
  }

  // =========================================================
  // Bind
  // =========================================================
  function bindOnce() {
    if (initialized) return;
    initialized = true;

    imgFile?.addEventListener("change", async () => {
      if (ctx.getMode?.() !== "IMAGE") return;
      const f = imgFile.files?.[0];
      if (!f) return;
      ctx.markDirty?.();
      await loadImageFile(f);
    });

    // crop pointer
    cropBox?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    // suwaki
    const onAnyChange = () => {
      if (ctx.getMode?.() !== "IMAGE") return;
      syncLabels();
      if (!imgObj) return;
      ctx.markDirty?.();
      schedulePreview(40);
    };

    chkInvert?.addEventListener("change", onAnyChange);

    rngBright?.addEventListener("input", onAnyChange);
    rngContrast?.addEventListener("input", onAnyChange);
    rngGamma?.addEventListener("input", onAnyChange);
    rngBlack?.addEventListener("input", onAnyChange);
    rngWhite?.addEventListener("input", onAnyChange);

    selMode?.addEventListener("change", onAnyChange);
    rngDither?.addEventListener("input", onAnyChange);

    // resize
    window.addEventListener("resize", () => {
      clearTimeout(_deb);
      _deb = setTimeout(onLayoutChange, 80);
    });
  }

  bindOnce();

  // =========================================================
  // API
  // =========================================================
  return {
    open() {
      show(paneImage, true);

      // reset UI
      if (imgFile) imgFile.value = "";

      // suwaki default
      if (chkInvert) chkInvert.checked = true; // DOMYŚLNIE odwrócone
      if (rngBright) rngBright.value = "0";
      if (rngContrast) rngContrast.value = "0";
      if (rngGamma) rngGamma.value = "100";
      if (rngBlack) rngBlack.value = "0";
      if (rngWhite) rngWhite.value = "255";
      if (selMode) selMode.value = "FS";
      if (rngDither) rngDither.value = "80";
      syncLabels();

      // reset image
      imgObj = null;
      if (imgLarge) imgLarge.removeAttribute("src");
      bits = new Uint8Array(DOT_W * DOT_H);
      drawBitsToMini(bits);
      ctx.onPreview?.({ kind: "PIX", bits });

      // reset crop
      crop = { x: 40, y: 40, w: 260, h: Math.round(260 / ASPECT) };
      applyCropToDom();

      ctx.clearDirty?.();
    },

    close() {
      show(paneImage, false);
    },

    getCreatePayload() {
      // upewnij się, że bity są aktualne
      if (imgObj) {
        bits = compileBits150();
      }

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
