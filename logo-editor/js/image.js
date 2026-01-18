// familiada/logo-editor/js/image.js
// Tryb: IMAGE -> duży obraz + kadr 26:11 -> przetwarzanie -> PIX 150x70
// Podgląd po prawej renderujemy lokalnie (jak bigPreview w main), a klik wysyła event do fullscreena.

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

  const imgBigPreview = document.getElementById("imgBigPreview"); // prawy podgląd (dot-matrix)
  const imgCanvas = document.getElementById("imgCanvas");         // mini 150x70 (debug)

  const chkInvert = document.getElementById("chkImgInvert");

  const rngBright   = document.getElementById("rngImgBright");
  const rngContrast = document.getElementById("rngImgContrast");
  const rngGamma    = document.getElementById("rngImgGamma");
  const rngBlack    = document.getElementById("rngImgBlack");
  const rngWhite    = document.getElementById("rngImgWhite");

  const selMode   = document.getElementById("selImgDitherMode");
  const rngDither = document.getElementById("rngImgDither");

  const valBright   = document.getElementById("valImgBright");
  const valContrast = document.getElementById("valImgContrast");
  const valGamma    = document.getElementById("valImgGamma");
  const valBlack    = document.getElementById("valImgBlack");
  const valWhite    = document.getElementById("valImgWhite");
  const valDither   = document.getElementById("valImgDither");

  // =========================================================
  // Const
  // =========================================================
  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70
  const ASPECT = 26 / 11;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // =========================================================
  // State
  // =========================================================
  let bits = new Uint8Array(DOT_W * DOT_H);

  let imgObj = null;
  let imgUrl = null;

  let initialized = false;

  // crop w px względem imgStage
  let crop = { x: 40, y: 40, w: 260, h: Math.round(260 / ASPECT) };

  let drag = null; // { kind: "move"|"tl"|"tr"|"bl"|"br", sx, sy, startCrop }
  let _deb = null;

  // =========================================================
  // Preview renderer (kopiowane z main, żeby wyglądało identycznie)
  // =========================================================
  const TILES_X = 30;
  const TILES_Y = 10;

  const BIG_COLORS = {
    bg: "#1f1f23",
    cell: "#000000",
    dotOff: "#1f1f23",
    dotOn: "#d7ff3d",
  };

  function calcBigLayout(canvas){
    const cw = canvas.width;
    const ch = canvas.height;

    for (let d = 16; d >= 2; d--){
      const gap = Math.max(1, Math.round(d / 4));
      const tileGap = 2 * d;
      const tileW = 5 * d + 6 * gap;
      const tileH = 7 * d + 8 * gap;
      const panelW = TILES_X * tileW + (TILES_X - 1) * tileGap;
      const panelH = TILES_Y * tileH + (TILES_Y - 1) * tileGap;

      if (panelW <= cw - 20 && panelH <= ch - 20){
        return { d, gap, tileGap, tileW, tileH, panelW, panelH };
      }
    }

    const d = 2, gap = 1, tileGap = 4;
    const tileW = 5 * d + 6 * gap;
    const tileH = 7 * d + 8 * gap;
    return {
      d, gap, tileGap, tileW, tileH,
      panelW: TILES_X * tileW + (TILES_X - 1) * tileGap,
      panelH: TILES_Y * tileH + (TILES_Y - 1) * tileGap,
    };
  }

  function clearBigCanvas(canvas){
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = BIG_COLORS.bg;
    g.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawDot(g, cx, cy, r, on){
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = on ? BIG_COLORS.dotOn : BIG_COLORS.dotOff;
    g.fill();
  }

  function renderBits150x70ToBig(bits150, canvas){
    if (!canvas) return;
    const g = canvas.getContext("2d");
    const L = calcBigLayout(canvas);
    clearBigCanvas(canvas);

    const x0 = Math.floor((canvas.width - L.panelW) / 2);
    const y0 = Math.floor((canvas.height - L.panelH) / 2);
    const r = L.d / 2;
    const step = L.d + L.gap;

    for (let ty = 0; ty < TILES_Y; ty++){
      for (let tx = 0; tx < TILES_X; tx++){
        const tileX = x0 + tx * (L.tileW + L.tileGap);
        const tileY = y0 + ty * (L.tileH + L.tileGap);

        g.fillStyle = BIG_COLORS.cell;
        g.fillRect(tileX, tileY, L.tileW, L.tileH);

        for (let py = 0; py < 7; py++){
          for (let px = 0; px < 5; px++){
            const x = tx * 5 + px;
            const y = ty * 7 + py;
            const on = !!bits150[y * DOT_W + x];
            const cx = tileX + L.gap + r + px * step;
            const cy = tileY + L.gap + r + py * step;
            drawDot(g, cx, cy, r, on);
          }
        }
      }
    }
  }

  // =========================================================
  // Mini debug 150x70
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
  // Settings
  // =========================================================
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

  function readSettings() {
    const bright = Number(rngBright?.value ?? 0);       // -100..100
    const contrast = Number(rngContrast?.value ?? 0);   // -100..100
    const gamma = (Number(rngGamma?.value ?? 100) / 100); // 0.5..2.5
    const black = Number(rngBlack?.value ?? 0);         // 0..120
    const white = Number(rngWhite?.value ?? 255);       // 135..255
    const mode = String(selMode?.value || "FS");
    const ditherStrength = Number(rngDither?.value ?? 80); // 0..100
    const invert = !!chkInvert?.checked; // DOMYŚLNIE true
    return { bright, contrast, gamma, black, white, mode, ditherStrength, invert };
  }

  // =========================================================
  // Crop helpers
  // =========================================================
  function getStageRect() {
    return imgStage?.getBoundingClientRect() || { left:0, top:0, width:1, height:1 };
  }

  function getImgRect() {
    const r = imgLarge?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    return r;
  }

  function clampCropToImg(next) {
    const imgR = getImgRect();
    const stageR = getStageRect();
    if (!imgR) return next;

    const imgX = imgR.left - stageR.left;
    const imgY = imgR.top  - stageR.top;
    const imgW = imgR.width;
    const imgH = imgR.height;

    const minW = 60;

    let w = Math.max(minW, next.w);
    let h = Math.max(1, Math.round(w / ASPECT));

    if (w > imgW) { w = imgW; h = Math.round(w / ASPECT); }
    if (h > imgH) { h = imgH; w = Math.round(h * ASPECT); }

    let x = clamp(next.x, imgX, imgX + imgW - w);
    let y = clamp(next.y, imgY, imgY + imgH - h);

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

    let w = imgW * 0.72;
    let h = w / ASPECT;
    if (h > imgH * 0.9) { h = imgH * 0.9; w = h * ASPECT; }

    const x = imgX + (imgW - w) / 2;
    const y = imgY + (imgH - h) / 2;

    crop = clampCropToImg({ x, y, w, h });
    applyCropToDom();
  }

  // =========================================================
  // Image processing
  // =========================================================
  function lumFromRGB(r,g,b) {
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }

  function applyBCGamma(v, bright, contrast, gamma) {
    let x = v + bright;

    const c = clamp(contrast, -100, 100);
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    x = factor * (x - 128) + 128;

    x = clamp(x, 0, 255);

    const g = clamp(gamma, 0.05, 10);
    x = 255 * Math.pow(x / 255, 1 / g);

    return clamp(x, 0, 255);
  }

  function applyLevels(v, black, white) {
    const b = clamp(black, 0, 200);
    const w = clamp(white, 1, 255);
    if (w <= b + 1) return v;
    let x = (v - b) * (255 / (w - b));
    return clamp(x, 0, 255);
  }

  function thresholdBits(lum, threshold, invert) {
    const on = lum >= threshold ? 1 : 0;
    return invert ? (on ? 0 : 1) : on;
  }

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
    const amp = (strength / 100) * 64;

    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        const i = y*w + x;
        const t = BAYER8[y & 7][x & 7];
        const dt = ((t - 31.5) / 63) * amp * 2;
        const th = clamp(threshold + dt, 0, 255);
        out[i] = thresholdBits(lums[i], th, invert);
      }
    }
    return out;
  }

  function ditherFloydSteinberg(lums, w, h, threshold, strength, invert) {
    const s = clamp(strength / 100, 0, 1);
    if (s <= 0.001) {
      const out = new Uint8Array(w*h);
      for (let i=0;i<out.length;i++) out[i] = thresholdBits(lums[i], threshold, invert);
      return out;
    }

    const buf = new Float32Array(lums);
    const out = new Uint8Array(w*h);

    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        const i = y*w + x;

        const oldv = buf[i];
        const newv = oldv >= threshold ? 255 : 0;
        out[i] = thresholdBits(oldv, threshold, invert);

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
  // Crop -> natural rect
  // =========================================================
  function cropToNaturalRect() {
    const imgR = getImgRect();
    const stageR = getStageRect();
    if (!imgR || !imgObj) return null;

    const imgX = imgR.left - stageR.left;
    const imgY = imgR.top  - stageR.top;

    const cx = crop.x - imgX;
    const cy = crop.y - imgY;

    const sx = imgObj.naturalWidth / imgR.width;
    const sy = imgObj.naturalHeight / imgR.height;

    const nx = clamp(cx * sx, 0, imgObj.naturalWidth  - 1);
    const ny = clamp(cy * sy, 0, imgObj.naturalHeight - 1);
    const nw = clamp(crop.w * sx, 1, imgObj.naturalWidth  - nx);
    const nh = clamp(crop.h * sy, 1, imgObj.naturalHeight - ny);

    return { nx, ny, nw, nh };
  }

  function compileBits150() {
    if (!imgObj) return new Uint8Array(DOT_W * DOT_H);

    const rect = cropToNaturalRect();
    if (!rect) return new Uint8Array(DOT_W * DOT_H);

    const { bright, contrast, gamma, black, white, mode, ditherStrength, invert } = readSettings();

    const tmp = document.createElement("canvas");
    tmp.width = DOT_W;
    tmp.height = DOT_H;
    const g = tmp.getContext("2d", { willReadFrequently: true });

    g.clearRect(0, 0, DOT_W, DOT_H);
    g.imageSmoothingEnabled = true;
    g.drawImage(
      imgObj,
      rect.nx, rect.ny, rect.nw, rect.nh,
      0, 0, DOT_W, DOT_H
    );

    const imgData = g.getImageData(0, 0, DOT_W, DOT_H);
    const data = imgData.data;

    const lums = new Float32Array(DOT_W * DOT_H);
    for (let i=0;i<lums.length;i++){
      const r = data[i*4+0];
      const gg = data[i*4+1];
      const b = data[i*4+2];

      let v = lumFromRGB(r, gg, b);
      v = applyBCGamma(v, bright, contrast, gamma);
      v = applyLevels(v, black, white);
      lums[i] = v;
    }

    const threshold = 128;

    let out;
    if (mode === "FS") out = ditherFloydSteinberg(lums, DOT_W, DOT_H, threshold, ditherStrength, invert);
    else if (mode === "BAYER8") out = ditherOrderedBayer(lums, DOT_W, DOT_H, threshold, ditherStrength, invert);
    else {
      out = new Uint8Array(DOT_W * DOT_H);
      for (let i=0;i<out.length;i++) out[i] = thresholdBits(lums[i], threshold, invert);
    }

    return out;
  }

  function pushPreviewNow() {
    bits = compileBits150();
    drawBitsToMini(bits);
    renderBits150x70ToBig(bits, imgBigPreview);
    ctx.onPreview?.({ kind: "PIX", bits }); // nadal aktualizuje "główne" preview (jeśli gdzieś jest)
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

    if (imgLarge) imgLarge.src = imgUrl;

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
    const s = drag.startCrop;

    if (drag.kind === "move") {
      crop = clampCropToImg({ x: s.x + dx, y: s.y + (ev.clientY - drag.sy), w: s.w, h: s.h });
      applyCropToDom();
      schedulePreview(30);
      return;
    }

    let newW = s.w;
    if (drag.kind === "br" || drag.kind === "tr") newW = s.w + dx;
    if (drag.kind === "bl" || drag.kind === "tl") newW = s.w - dx;

    newW = Math.max(60, newW);
    let newH = Math.round(newW / ASPECT);

    let newX = s.x;
    let newY = s.y;

    if (drag.kind === "tl") { newX = s.x + (s.w - newW); newY = s.y + (s.h - newH); }
    if (drag.kind === "tr") { newX = s.x;               newY = s.y + (s.h - newH); }
    if (drag.kind === "bl") { newX = s.x + (s.w - newW); newY = s.y; }
    if (drag.kind === "br") { newX = s.x;               newY = s.y; }

    crop = clampCropToImg({ x: newX, y: newY, w: newW, h: newH });
    applyCropToDom();
    schedulePreview(30);
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    schedulePreview(10);
  }

  function onLayoutChange() {
    if (ctx.getMode?.() !== "IMAGE") return;
    if (!imgObj) return;
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

    cropBox?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    // klik podglądu -> fullscreen przez main (już masz listener na logoeditor:openPreview)
    imgBigPreview?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("logoeditor:openPreview", {
        detail: { kind: "PIX", bits }
      }));
    });

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

      if (imgFile) imgFile.value = "";

      // default settings
      if (chkInvert) chkInvert.checked = true;
      if (rngBright) rngBright.value = "0";
      if (rngContrast) rngContrast.value = "0";
      if (rngGamma) rngGamma.value = "100";
      if (rngBlack) rngBlack.value = "0";
      if (rngWhite) rngWhite.value = "255";
      if (selMode) selMode.value = "FS";
      if (rngDither) rngDither.value = "80";
      syncLabels();

      imgObj = null;
      if (imgLarge) imgLarge.removeAttribute("src");

      bits = new Uint8Array(DOT_W * DOT_H);
      drawBitsToMini(bits);
      renderBits150x70ToBig(bits, imgBigPreview);
      ctx.onPreview?.({ kind: "PIX", bits });

      crop = { x: 40, y: 40, w: 260, h: Math.round(260 / ASPECT) };
      applyCropToDom();

      ctx.clearDirty?.();
    },

    close() {
      show(paneImage, false);
    },

    getCreatePayload() {
      if (imgObj) bits = compileBits150();
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
