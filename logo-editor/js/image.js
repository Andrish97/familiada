// familiada/logo-editor/js/image.js
// Tryb: IMAGE -> duży obraz + kadr 26:11 -> przetwarzanie -> PIX 150x70

export function initImageEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // =========================================================
  // DOM (ID muszą pasować do HTML)
  // =========================================================
  const paneImage = document.getElementById("paneImage");

  const imgFile = document.getElementById("imgFile");         // input type=file (obok nazwy)
  const imgStage = document.getElementById("imgStage");       // lewa karta: kontener obrazu
  const imgPreview = document.getElementById("imgPreview");   // <img>
  const cropFrame = document.getElementById("cropFrame");     // ramka 26:11 + uchwyty

  const imgBigPreview = document.getElementById("imgBigPreview"); // prawa karta: dot matrix

  const chkInvert = document.getElementById("chkImgInvert");
  const chkContain = document.getElementById("chkImgContain");

  const rngBright = document.getElementById("rngImgBright");
  const rngContrast = document.getElementById("rngImgContrast");
  const rngGamma = document.getElementById("rngImgGamma");
  const rngDitherAmt = document.getElementById("rngImgDitherAmt");
  const rngBlack = document.getElementById("rngImgBlack");
  const rngWhite = document.getElementById("rngImgWhite");

  const valBright = document.getElementById("valImgBright");
  const valContrast = document.getElementById("valImgContrast");
  const valGamma = document.getElementById("valImgGamma");
  const valDitherAmt = document.getElementById("valImgDitherAmt");
  const valBlack = document.getElementById("valImgBlack");
  const valWhite = document.getElementById("valImgWhite");

  // =========================================================
  // Const / helpers
  // =========================================================
  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70
  const ASPECT = 26 / 11;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // =========================================================
  // State
  // =========================================================
  let initialized = false;

  let imgObj = null;     // Image() z naturalWidth/naturalHeight
  let imgUrl = null;     // objectURL
  let bits = new Uint8Array(DOT_W * DOT_H);

  // crop w px w układzie "stage"
  let crop = { x: 40, y: 40, w: 280, h: Math.round(280 / ASPECT) };
  let drag = null; // { kind, sx, sy, startCrop }
  let deb = null;

  // =========================================================
  // Podgląd "jak na wyświetlaczu" – identyczny render jak w main.js
  // (minimalna wersja: PIX 150x70 -> dot matrix 30x10 tiles)
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
  // UI values
  // =========================================================
  function syncLabels(){
    if (valBright) valBright.textContent = String(rngBright?.value ?? "0");
    if (valContrast) valContrast.textContent = String(rngContrast?.value ?? "0");
    if (valGamma) valGamma.textContent = Number(rngGamma?.value ?? "1").toFixed(2);
    if (valDitherAmt) valDitherAmt.textContent = Number(rngDitherAmt?.value ?? "0.80").toFixed(2);
    if (valBlack) valBlack.textContent = String(rngBlack?.value ?? "0");
    if (valWhite) valWhite.textContent = String(rngWhite?.value ?? "100");
  }

  function readSettings(){
    return {
      bright: Number(rngBright?.value ?? 0),
      contrast: Number(rngContrast?.value ?? 0),
      gamma: Number(rngGamma?.value ?? 1.0),
      ditherAmt: Number(rngDitherAmt?.value ?? 0.8),
      black: Number(rngBlack?.value ?? 0),
      white: Number(rngWhite?.value ?? 100),
      invert: !!chkInvert?.checked,
    };
  }

  // =========================================================
  // Obraz: contain vs cover (ty chcesz contain = cały widoczny)
  // =========================================================
  function applyContainMode(){
    if (!imgPreview) return;
    const contain = !!chkContain?.checked;
    imgPreview.style.objectFit = contain ? "contain" : "cover";
  }

  // =========================================================
  // Crop: ograniczamy ramkę do *widocznego obrazu*, nie do całej karty
  // (bo object-fit: contain zostawia “pasy”)
  // =========================================================
  function getStageRect(){
    return imgStage?.getBoundingClientRect() || { left:0, top:0, width:1, height:1 };
  }

  function getImgRect(){
    const r = imgPreview?.getBoundingClientRect();
    if (!r || r.width <= 1 || r.height <= 1) return null;
    return r;
  }

  function clampCropToImg(next){
    const imgR = getImgRect();
    const stageR = getStageRect();
    if (!imgR) return next;

    // obraz w układzie stage
    const imgX = imgR.left - stageR.left;
    const imgY = imgR.top  - stageR.top;
    const imgW = imgR.width;
    const imgH = imgR.height;

    const minW = 60;

    let w = Math.max(minW, next.w);
    let h = Math.max(1, Math.round(w / ASPECT));

    // nie większe niż obraz
    if (w > imgW){ w = imgW; h = Math.round(w / ASPECT); }
    if (h > imgH){ h = imgH; w = Math.round(h * ASPECT); }

    let x = clamp(next.x, imgX, imgX + imgW - w);
    let y = clamp(next.y, imgY, imgY + imgH - h);

    return { x, y, w, h };
  }

  function applyCropToDom(){
    if (!cropFrame) return;
    crop = clampCropToImg(crop);

    cropFrame.style.left = `${Math.round(crop.x)}px`;
    cropFrame.style.top  = `${Math.round(crop.y)}px`;
    cropFrame.style.width  = `${Math.round(crop.w)}px`;
    cropFrame.style.height = `${Math.round(crop.h)}px`;
  }

  function initCropToCenterBig(){
    const imgR = getImgRect();
    const stageR = getStageRect();
    if (!imgR) return;

    const imgX = imgR.left - stageR.left;
    const imgY = imgR.top  - stageR.top;
    const imgW = imgR.width;
    const imgH = imgR.height;

    // duża ramka startowa
    let w = imgW * 0.78;
    let h = w / ASPECT;
    if (h > imgH * 0.9){
      h = imgH * 0.9;
      w = h * ASPECT;
    }

    const x = imgX + (imgW - w) / 2;
    const y = imgY + (imgH - h) / 2;

    crop = clampCropToImg({ x, y, w, h });
    applyCropToDom();
  }

  // =========================================================
  // Przetwarzanie: grayscale -> “pseudo b/w” (dithering)
  // =========================================================
  function lum(r,g,b){ return 0.2126*r + 0.7152*g + 0.0722*b; }

  function applyBCGamma(v, bright, contrast, gamma){
    // bright: -100..100
    // contrast: -100..100
    // gamma: 0.4..2.6
    let x = v + bright;

    const c = clamp(contrast, -100, 100);
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    x = factor * (x - 128) + 128;

    x = clamp(x, 0, 255);

    const g = clamp(gamma, 0.05, 10);
    x = 255 * Math.pow(x / 255, 1 / g);

    return clamp(x, 0, 255);
  }

  function applyLevels01(v, black01, white01){
    // black/white 0..100
    const b = clamp(black01, 0, 100) * 2.55;
    const w = clamp(white01, 0, 100) * 2.55;
    if (w <= b + 1) return v;
    const x = (v - b) * (255 / (w - b));
    return clamp(x, 0, 255);
  }

  function compileBits150(){
    if (!imgObj) return new Uint8Array(DOT_W * DOT_H);

    // crop w naturalnych koordynatach
    const stageR = getStageRect();
    const imgR = getImgRect();
    if (!imgR) return new Uint8Array(DOT_W * DOT_H);

    const imgX = imgR.left - stageR.left;
    const imgY = imgR.top  - stageR.top;

    // crop w układzie obrazu (px widoczne)
    const cx = crop.x - imgX;
    const cy = crop.y - imgY;

    const sx = imgObj.naturalWidth / imgR.width;
    const sy = imgObj.naturalHeight / imgR.height;

    const nx = clamp(cx * sx, 0, imgObj.naturalWidth - 1);
    const ny = clamp(cy * sy, 0, imgObj.naturalHeight - 1);
    const nw = clamp(crop.w * sx, 1, imgObj.naturalWidth - nx);
    const nh = clamp(crop.h * sy, 1, imgObj.naturalHeight - ny);

    const { bright, contrast, gamma, ditherAmt, black, white, invert } = readSettings();

    // zrzut do 150x70
    const tmp = document.createElement("canvas");
    tmp.width = DOT_W;
    tmp.height = DOT_H;
    const g = tmp.getContext("2d", { willReadFrequently: true });

    g.clearRect(0, 0, DOT_W, DOT_H);
    g.imageSmoothingEnabled = true;
    g.drawImage(imgObj, nx, ny, nw, nh, 0, 0, DOT_W, DOT_H);

    const imgData = g.getImageData(0, 0, DOT_W, DOT_H);
    const data = imgData.data;

    // Floyd–Steinberg (siła = ditherAmt)
    const strength = clamp(ditherAmt, 0, 1.5); // 0..1.5
    const s = clamp(strength / 1.0, 0, 1);

    const buf = new Float32Array(DOT_W * DOT_H);
    for (let i=0;i<buf.length;i++){
      const r = data[i*4+0];
      const gg = data[i*4+1];
      const b = data[i*4+2];

      let v = lum(r, gg, b);
      v = applyBCGamma(v, bright, contrast, gamma);
      v = applyLevels01(v, black, white);
      buf[i] = v;
    }

    const out = new Uint8Array(DOT_W * DOT_H);
    const threshold = 128;

    for (let y=0;y<DOT_H;y++){
      for (let x=0;x<DOT_W;x++){
        const i = y*DOT_W + x;
        const oldv = buf[i];
        const newv = oldv >= threshold ? 255 : 0;

        // "jasne = włączone" -> invert domyślnie true
        let bit = (newv === 255) ? 1 : 0;
        if (invert) bit = bit ? 0 : 1;
        out[i] = bit;

        const err = (oldv - newv) * s;

        if (x+1 < DOT_W) buf[i+1] += err * (7/16);
        if (y+1 < DOT_H){
          if (x>0) buf[i+DOT_W-1] += err * (3/16);
          buf[i+DOT_W] += err * (5/16);
          if (x+1 < DOT_W) buf[i+DOT_W+1] += err * (1/16);
        }
      }
    }

    return out;
  }

  function pushPreviewNow(){
    bits = compileBits150();
    renderBits150x70ToBig(bits, imgBigPreview);
    ctx.onPreview?.({ kind: "PIX", bits });
  }

  function schedulePreview(ms=40){
    clearTimeout(deb);
    deb = setTimeout(() => {
      if (ctx.getMode?.() !== "IMAGE") return;
      if (!imgObj) return;
      pushPreviewNow();
    }, ms);
  }

  // =========================================================
  // Load image (najważniejsze: ustawiamy imgPreview.src na 100%)
  // =========================================================
  async function loadImageFile(file){
    if (!file) return;

    if (imgUrl){
      try{ URL.revokeObjectURL(imgUrl); } catch {}
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

    // pokaż w UI
    if (imgPreview){
      imgPreview.style.display = "block";
      imgPreview.src = imgUrl;
    }

    // object-fit zależnie od “Cały obraz”
    applyContainMode();

    // po layout (imgPreview musi mieć już rozmiar)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        initCropToCenterBig();
        schedulePreview(10);
      });
    });
  }

  // =========================================================
  // Drag/resize crop
  // =========================================================
  function onPointerDown(ev){
    if (ctx.getMode?.() !== "IMAGE") return;
    if (!imgObj) return;

    const handle = ev.target?.closest?.(".cropHandle")?.dataset?.h || null;
    const kind = handle || "move";

    drag = {
      kind,
      sx: ev.clientX,
      sy: ev.clientY,
      startCrop: { ...crop },
    };

    cropFrame?.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  }

  function onPointerMove(ev){
    if (!drag) return;
    if (!imgObj) return;

    const dx = ev.clientX - drag.sx;
    const dy = ev.clientY - drag.sy;

    const s = drag.startCrop;

    if (drag.kind === "move"){
      crop = clampCropToImg({ x: s.x + dx, y: s.y + dy, w: s.w, h: s.h });
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

    if (drag.kind === "tl"){ newX = s.x + (s.w - newW); newY = s.y + (s.h - newH); }
    if (drag.kind === "tr"){ newX = s.x;               newY = s.y + (s.h - newH); }
    if (drag.kind === "bl"){ newX = s.x + (s.w - newW); newY = s.y; }
    if (drag.kind === "br"){ newX = s.x;               newY = s.y; }

    crop = clampCropToImg({ x: newX, y: newY, w: newW, h: newH });
    applyCropToDom();
    schedulePreview(30);
  }

  function onPointerUp(){
    if (!drag) return;
    drag = null;
    schedulePreview(10);
  }

  // =========================================================
  // Bind once
  // =========================================================
  function bindOnce(){
    if (initialized) return;
    initialized = true;

    // input file
    imgFile?.addEventListener("change", async () => {
      if (ctx.getMode?.() !== "IMAGE") return;
      const f = imgFile.files?.[0];
      if (!f) return;

      ctx.markDirty?.();
      try{
        await loadImageFile(f);
      } catch (e){
        console.error(e);
        alert(e?.message || String(e));
      }
    });

    // drag/resize ramki
    cropFrame?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    // klik podglądu -> fullscreen
    imgBigPreview?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("logoeditor:openPreview", {
        detail: { kind: "PIX", bits }
      }));
    });

    const onAnyChange = () => {
      if (ctx.getMode?.() !== "IMAGE") return;
      syncLabels();
      applyContainMode();
      if (!imgObj) return;
      ctx.markDirty?.();
      schedulePreview(40);
    };

    chkInvert?.addEventListener("change", onAnyChange);
    chkContain?.addEventListener("change", () => {
      // po zmianie contain/cover ramka musi się przeliczyć
      onAnyChange();
      requestAnimationFrame(() => {
        initCropToCenterBig();
        schedulePreview(10);
      });
    });

    rngBright?.addEventListener("input", onAnyChange);
    rngContrast?.addEventListener("input", onAnyChange);
    rngGamma?.addEventListener("input", onAnyChange);
    rngDitherAmt?.addEventListener("input", onAnyChange);
    rngBlack?.addEventListener("input", onAnyChange);
    rngWhite?.addEventListener("input", onAnyChange);

    window.addEventListener("resize", () => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        if (ctx.getMode?.() !== "IMAGE") return;
        if (!imgObj) return;
        initCropToCenterBig();
        schedulePreview(10);
      }, 80);
    });
  }

  bindOnce();

  // =========================================================
  // API
  // =========================================================
  return {
    open(){
      show(paneImage, true);

      // reset input (żeby ten sam plik można było wybrać ponownie)
      if (imgFile) imgFile.value = "";

      // defaulty
      if (chkInvert) chkInvert.checked = true;
      if (chkContain) chkContain.checked = true;

      if (rngBright) rngBright.value = "0";
      if (rngContrast) rngContrast.value = "0";
      if (rngGamma) rngGamma.value = "1.00";
      if (rngDitherAmt) rngDitherAmt.value = "0.80";
      if (rngBlack) rngBlack.value = "0";
      if (rngWhite) rngWhite.value = "100";
      syncLabels();
      applyContainMode();

      // UI reset
      imgObj = null;
      if (imgPreview){
        imgPreview.removeAttribute("src");
        imgPreview.style.display = "block"; // żeby “nie znikał”
      }

      // ramka na start widoczna, ale sens ma dopiero po obrazie
      crop = { x: 40, y: 40, w: 280, h: Math.round(280 / ASPECT) };
      applyCropToDom();

      // preview reset
      bits = new Uint8Array(DOT_W * DOT_H);
      renderBits150x70ToBig(bits, imgBigPreview);
      ctx.onPreview?.({ kind: "PIX", bits });

      ctx.clearDirty?.();
    },

    close(){
      show(paneImage, false);
    },

    getCreatePayload(){
      if (imgObj){
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
