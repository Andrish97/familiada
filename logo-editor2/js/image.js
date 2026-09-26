// familiada/logo-editor2/js/image.js
// Tryb IMAGE: obraz użytkownika + kadr 26:11 + korekty (jasność, kontrast,
// gamma, poziomy, dither) -> PIX 150x70.
//
// Źródło obrazu w zapisie (payload.source):
//   imageUrl  – publiczny URL w Storage (bucket user-logos), normalny przypadek
//   imageData – data: URI (demo / import pliku .famlogo z osadzonym obrazem)
// Nowy plik z dysku trafia do Storage dopiero przy zapisie.

import { alertModal } from "../../js/core/modal.js?v=v2026-09-26T05304";
import { t } from "../../translation/translation.js?v=v2026-09-26T05304";
import { sb } from "../../js/core/supabase.js?v=v2026-09-26T05304";
import { DOT_W, DOT_H, TYPE_PIX, PIX_FORMAT, packBits, unpackBits, renderBitsToCanvas } from "./render.js?v=v2026-09-26T05304";

const ASPECT = 26 / 11;
const BUCKET = "user-logos";
// Muszą się zgadzać z ustawieniami bucketu (migracja 178), inaczej upload
// kończy się niezrozumiałym błędem Storage. SVG celowo pominięte: bucket
// jest publiczny, a SVG otwarte bezpośrednio może wykonać skrypt.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const DEFAULTS = {
  invert: true,
  bright: 0,
  contrast: 0,
  gamma: 1.0,
  ditherAmt: 0.8,
  black: 0,
  white: 100,
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };

/** Ścieżka pliku w buckecie z publicznego URL albo null, gdy to nie plik tego usera. */
export function storagePathFromUrl(url, userId) {
  const s = String(url || "");
  const marker = `/${BUCKET}/`;
  const i = s.indexOf(marker);
  if (i < 0 || !userId) return null;
  const path = s.slice(i + marker.length).split("?")[0];
  return path.startsWith(`${userId}/`) ? path : null;
}

export function initImageEditor(ctx) {
  // =========================================================
  // DOM
  // =========================================================
  const $ = (id) => document.getElementById(id);
  const paneImage = $("paneImage");
  const imgFile = $("imgFile");
  const imgStage = $("imgStage");
  const imgPreview = $("imgPreview");
  const cropFrame = $("cropFrame");
  const imgBigPreview = $("imgBigPreview");
  const chkInvert = $("chkImgInvert");
  const btnImgResetDefault = $("btnImgResetDefault");

  // suwak -> [input, etykieta w panelu, formatowanie]
  const fmtSigned = (n) => { const x = Math.round(num(n, 0)); return x > 0 ? `+${x}` : `${x}`; };
  const fmtInt = (n) => String(Math.round(num(n, 0)));
  const fmt2 = (n) => num(n, 0).toFixed(2);
  const SLIDERS = {
    bright:    { input: $("rngImgBright"),    label: $("valImgBright"),    fmt: fmtSigned },
    contrast:  { input: $("rngImgContrast"),  label: $("valImgContrast"),  fmt: fmtSigned },
    gamma:     { input: $("rngImgGamma"),     label: $("valImgGamma"),     fmt: fmt2 },
    black:     { input: $("rngImgBlack"),     label: $("valImgBlack"),     fmt: fmtInt },
    white:     { input: $("rngImgWhite"),     label: $("valImgWhite"),     fmt: fmtInt },
    ditherAmt: { input: $("rngImgDitherAmt"), label: $("valImgDitherAmt"), fmt: fmt2, panel: "dither" },
  };

  // =========================================================
  // Stan
  // =========================================================
  let imgObj = null;            // załadowany <img> (gotowy do rysowania na canvasie)
  let imageStatus = "none";     // none | loading | ready | error
  let loadSeq = 0;              // unieważnia spóźnione wczytania po ponownym open()
  let objectUrl = null;         // blob: dla pliku z dysku (tylko do podglądu)
  let pendingFile = null;       // plik z dysku, jeszcze nie w Storage
  let imageUrl = null;          // publiczny URL w Storage (to trafia do zapisu)
  let imageData = null;         // data: URI (demo/import), gdy brak imageUrl
  let openedImageUrl = null;    // imageUrl w chwili otwarcia -- do sprzątnięcia po podmianie
  let bits = new Uint8Array(DOT_W * DOT_H);

  // Kadr: w pikselach pola (`crop`) i -- źródło prawdy -- względem
  // WYŚWIETLONEGO obrazu (`cropImg`, ułamki 0–1: x, y, w; wysokość z ASPECT).
  let crop = { x: 40, y: 40, w: 280, h: Math.round(280 / ASPECT) };
  let cropImg = null;
  // Stary zapis kadru (względem pola) czeka na prawdziwy prostokąt obrazu.
  let pendingLegacyCrop = null;
  let deb = null;

  // =========================================================
  // Ustawienia
  // =========================================================
  function syncLabels() {
    const toolbar = $("toolsImage");
    for (const [key, s] of Object.entries(SLIDERS)) {
      const txt = s.fmt(s.input?.value);
      if (s.label) s.label.textContent = txt;
      const btnVal = toolbar?.querySelector(`[data-panel='${s.panel || key}'] .imgSetBtnVal`);
      if (btnVal) btnVal.textContent = txt;
    }
  }

  function readSettings() {
    const out = { invert: !!chkInvert?.checked };
    for (const [key, s] of Object.entries(SLIDERS)) out[key] = num(s.input?.value, DEFAULTS[key]);
    return out;
  }

  function writeSettings(src) {
    if (chkInvert) chkInvert.checked = src.invert ?? DEFAULTS.invert;
    for (const [key, s] of Object.entries(SLIDERS)) {
      if (s.input) s.input.value = String(num(src[key], DEFAULTS[key]));
    }
    syncLabels();
  }

  function resetToDefaults() {
    writeSettings(DEFAULTS);
    // Kadr wraca do „dużego, centralnego” -- zależy od układu, więc po reflow.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (imgObj) { cropImg = null; pendingLegacyCrop = null; initCropToCenterBig(); }
      schedulePreview(10);
    }));
    ctx.markDirty?.();
  }

  // =========================================================
  // Kadr: ograniczony do WIDOCZNEGO obrazu (object-fit: contain zostawia pasy)
  // =========================================================
  function getStageRect() {
    return imgStage?.getBoundingClientRect() || { left: 0, top: 0, width: 1, height: 1 };
  }

  function getImgRect() {
    const r = imgPreview?.getBoundingClientRect();
    return r && r.width > 1 && r.height > 1 ? r : null;
  }

  function imgOffset(imgR, stageR) {
    return { x: imgR.left - stageR.left, y: imgR.top - stageR.top };
  }

  function clampCropToImg(next) {
    const imgR = getImgRect();
    if (!imgR) return next;
    const o = imgOffset(imgR, getStageRect());

    let w = Math.max(Math.min(60, imgR.width), next.w);
    let h = Math.max(1, Math.round(w / ASPECT));
    if (w > imgR.width) { w = imgR.width; h = Math.round(w / ASPECT); }
    if (h > imgR.height) { h = imgR.height; w = Math.round(h * ASPECT); }

    return {
      x: clamp(next.x, o.x, o.x + imgR.width - w),
      y: clamp(next.y, o.y, o.y + imgR.height - h),
      w, h,
    };
  }

  function applyCropToDom() {
    if (!cropFrame) return;
    cropFrame.style.left = `${Math.round(crop.x)}px`;
    cropFrame.style.top = `${Math.round(crop.y)}px`;
    cropFrame.style.width = `${Math.round(crop.w)}px`;
    cropFrame.style.height = `${Math.round(crop.h)}px`;
  }

  function syncCropImg() {
    const imgR = getImgRect();
    if (!imgR) return;
    const o = imgOffset(imgR, getStageRect());
    cropImg = { x: (crop.x - o.x) / imgR.width, y: (crop.y - o.y) / imgR.height, w: crop.w / imgR.width };
  }

  function legacyCropToImg(saved, imgR, stageR) {
    const px = { x: saved.x * stageR.width, y: saved.y * stageR.height, w: saved.w * stageR.width };
    const o = imgOffset(imgR, stageR);
    return { x: (px.x - o.x) / imgR.width, y: (px.y - o.y) / imgR.height, w: px.w / imgR.width };
  }

  // Przelicza zapamiętany kadr (cropImg) na piksele dla bieżącego układu.
  // Nie woła syncCropImg(): przycięcie do obrazu w chwilowym, małym układzie
  // (np. w trakcie obrotu ekranu) nie może trwale zmienić zapamiętanego kadru.
  function applyCropImg() {
    const imgR = getImgRect();
    if (!imgR) return;
    const stageR = getStageRect();
    if (!cropImg && pendingLegacyCrop) {
      cropImg = legacyCropToImg(pendingLegacyCrop, imgR, stageR);
      pendingLegacyCrop = null;
    }
    if (!cropImg) { initCropToCenterBig(); return; }
    const o = imgOffset(imgR, stageR);
    const w = cropImg.w * imgR.width;
    crop = clampCropToImg({ x: o.x + cropImg.x * imgR.width, y: o.y + cropImg.y * imgR.height, w, h: w / ASPECT });
    applyCropToDom();
  }

  function initCropToCenterBig() {
    const imgR = getImgRect();
    if (!imgR) return;
    const o = imgOffset(imgR, getStageRect());
    let w = imgR.width * 0.78;
    let h = w / ASPECT;
    if (h > imgR.height * 0.9) { h = imgR.height * 0.9; w = h * ASPECT; }
    crop = clampCropToImg({ x: o.x + (imgR.width - w) / 2, y: o.y + (imgR.height - h) / 2, w, h });
    applyCropToDom();
    syncCropImg();
  }

  // Czeka, aż <img> podglądu ma wyrenderowany obraz i układ się ustalił.
  async function whenPreviewReady() {
    try { await imgPreview?.decode?.(); } catch {}
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // =========================================================
  // Przetwarzanie: skala szarości -> korekty -> Floyd–Steinberg
  // =========================================================
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  function applyBCGamma(v, bright, contrast, gamma) {
    const c = clamp(contrast, -100, 100);
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    let x = clamp(factor * (v + bright - 128) + 128, 0, 255);
    x = 255 * Math.pow(x / 255, 1 / clamp(gamma, 0.05, 10));
    return clamp(x, 0, 255);
  }

  function applyLevels(v, black, white) {
    const b = clamp(black, 0, 100) * 2.55;
    const w = clamp(white, 0, 100) * 2.55;
    if (w <= b + 1) return v;
    return clamp((v - b) * (255 / (w - b)), 0, 255);
  }

  function compileBits() {
    const empty = new Uint8Array(DOT_W * DOT_H);
    const imgR = getImgRect();
    if (!imgObj || !imgR) return empty;

    const o = imgOffset(imgR, getStageRect());
    const sx = imgObj.naturalWidth / imgR.width;
    const sy = imgObj.naturalHeight / imgR.height;
    const nx = clamp((crop.x - o.x) * sx, 0, imgObj.naturalWidth - 1);
    const ny = clamp((crop.y - o.y) * sy, 0, imgObj.naturalHeight - 1);
    const nw = clamp(crop.w * sx, 1, imgObj.naturalWidth - nx);
    const nh = clamp(crop.h * sy, 1, imgObj.naturalHeight - ny);

    const s = readSettings();
    const tmp = document.createElement("canvas");
    tmp.width = DOT_W;
    tmp.height = DOT_H;
    const g = tmp.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.drawImage(imgObj, nx, ny, nw, nh, 0, 0, DOT_W, DOT_H);
    const data = g.getImageData(0, 0, DOT_W, DOT_H).data;

    const buf = new Float32Array(DOT_W * DOT_H);
    for (let i = 0; i < buf.length; i++) {
      const v = lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      buf[i] = applyLevels(applyBCGamma(v, s.bright, s.contrast, s.gamma), s.black, s.white);
    }

    const strength = clamp(s.ditherAmt, 0, 1);
    const out = new Uint8Array(DOT_W * DOT_H);
    for (let y = 0; y < DOT_H; y++) {
      for (let x = 0; x < DOT_W; x++) {
        const i = y * DOT_W + x;
        const bright = buf[i] >= 128;
        // „jasne = zapalone”; invert (domyślnie włączony) odwraca
        out[i] = (bright ? 1 : 0) ^ (s.invert ? 1 : 0);
        const err = (buf[i] - (bright ? 255 : 0)) * strength;
        if (x + 1 < DOT_W) buf[i + 1] += err * (7 / 16);
        if (y + 1 < DOT_H) {
          if (x > 0) buf[i + DOT_W - 1] += err * (3 / 16);
          buf[i + DOT_W] += err * (5 / 16);
          if (x + 1 < DOT_W) buf[i + DOT_W + 1] += err * (1 / 16);
        }
      }
    }
    return out;
  }

  function pushPreviewNow() {
    bits = compileBits();
    renderBitsToCanvas(bits, imgBigPreview);
    ctx.onPreview?.({ kind: "PIX", bits });
  }

  function schedulePreview(ms = 40) {
    clearTimeout(deb);
    deb = setTimeout(() => {
      if (ctx.getMode?.() !== "IMAGE" || imageStatus !== "ready") return;
      pushPreviewNow();
    }, ms);
  }

  // =========================================================
  // Wczytywanie obrazu
  // =========================================================
  function setStageImage(src) {
    if (!imgPreview) return;
    imgPreview.style.display = "block";
    if (src) imgPreview.src = src; else imgPreview.removeAttribute("src");
    show(cropFrame, false); // ramka pojawia się, gdy obraz jest gotowy (showImage)
  }

  // Obraz z assetów strony (demo „Obraz” ma na sztywno
  // https://www.familiada.online/logo-editor/assets/demo-image.png) ładujemy
  // z bieżącego originu: pod familiada.online bez www, na podglądzie czy
  // lokalnie byłby to request cross-origin zależny od nagłówków CORS.
  // Zapisany adres się nie zmienia.
  function sameSiteSrc(src) {
    try {
      const u = new URL(src);
      if (/^(www\.)?familiada\.online$/i.test(u.hostname) && u.pathname.startsWith("/logo-editor/assets/")) {
        return new URL(u.pathname, location.origin).href;
      }
    } catch {}
    return src;
  }

  // crossOrigin=anonymous jest konieczne: bez CORS canvas jest „skażony”
  // i getImageData() rzuca wyjątek -- podgląd i zapis by nie działały.
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t("logoEditor.image.loadError")));
      img.src = src;
    });
  }

  /** Wczytuje src do edytora. cropRel: zapisany kadr albo null (= nowy, na środku). */
  async function showImage(src, cropRel, fallbackSrc = null) {
    const seq = ++loadSeq;
    imageStatus = "loading";
    imgObj = null;
    src = sameSiteSrc(src);
    try {
      const img = await loadImg(src);
      if (seq !== loadSeq) return;
      imgObj = img;
      setStageImage(src);
      applyBestImageLayout();

      cropImg = null;
      pendingLegacyCrop = null;
      if (cropRel?.v === 2) cropImg = { x: num(cropRel.x, 0), y: num(cropRel.y, 0), w: num(cropRel.w, 0.78) };
      else if (cropRel) pendingLegacyCrop = cropRel;

      await whenPreviewReady();
      if (seq !== loadSeq) return;
      imageStatus = "ready";
      show(cropFrame, true);
      applyCropImg();
      schedulePreview(10);
    } catch (e) {
      if (seq !== loadSeq) return;
      // Adres nie działa, ale plik ma osadzoną kopię obrazu -- użyj jej.
      // Zapis trzyma wtedy tę kopię zamiast niedziałającego adresu (pliku
      // w Storage nie ruszamy -- błąd mógł być chwilowy).
      if (fallbackSrc) {
        imageUrl = null;
        openedImageUrl = null;
        return showImage(fallbackSrc, cropRel);
      }
      imageStatus = "error";
      setStageImage(null);
      console.error("[logo-editor/image] load failed:", src.slice(0, 80), e);
      void alertModal({ text: t("logoEditor.image.errors.loadFailed") });
    }
  }

  async function pickFile(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      void alertModal({ text: t("logoEditor.image.errors.badType") });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      void alertModal({ text: t("logoEditor.image.errors.tooLarge", { max: MAX_FILE_BYTES / 1024 / 1024 }) });
      return;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    pendingFile = file;
    ctx.markDirty?.();
    await showImage(objectUrl, null);
  }

  function applyBestImageLayout() {
    const grid = paneImage?.querySelector?.(".imgTopGrid");
    if (!grid) return;
    // Obok siebie, chyba że ekran jest wąski albo obraz skrajnie pionowy.
    const veryTall = imgObj && imgObj.naturalHeight / Math.max(1, imgObj.naturalWidth) > 2.0;
    const mode = window.innerWidth < 1120 || veryTall ? "col" : "row";
    grid.classList.toggle("is-row", mode === "row");
    grid.classList.toggle("is-col", mode === "col");
  }

  // =========================================================
  // Gesty kadru (mysz i dotyk):
  // - przeciąganie ramki albo obrazu = przesuwanie,
  // - narożnik = skalowanie (ruch w poziomie LUB pionie, wygrywa większy),
  // - dwa palce = pinch wokół środka ramki + przesuwanie środkiem palców.
  // =========================================================
  const touches = new Map();
  let drag = null;  // { kind, sx, sy, startCrop }
  let pinch = null; // { dist, mid, startCrop }
  const pDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pMid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function setCrop(next) {
    crop = clampCropToImg(next);
    applyCropToDom();
    syncCropImg();
    ctx.markDirty?.();
    schedulePreview(30);
  }

  function onPointerDown(ev) {
    if (ctx.getMode?.() !== "IMAGE" || imageStatus !== "ready") return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    imgStage?.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();

    if (touches.size >= 2) {
      const [a, b] = [...touches.values()];
      pinch = { dist: pDist(a, b) || 1, mid: pMid(a, b), startCrop: { ...crop } };
      drag = null;
      return;
    }
    const handle = ev.target?.closest?.(".cropHandle")?.dataset?.h || null;
    drag = { kind: handle || "move", sx: ev.clientX, sy: ev.clientY, startCrop: { ...crop } };
  }

  function onPointerMove(ev) {
    if (!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const m = pMid(a, b);
      const s = pinch.startCrop;
      const w = s.w * ((pDist(a, b) || 1) / pinch.dist);
      const h = w / ASPECT;
      const cx = s.x + s.w / 2 + (m.x - pinch.mid.x);
      const cy = s.y + s.h / 2 + (m.y - pinch.mid.y);
      setCrop({ x: cx - w / 2, y: cy - h / 2, w, h });
      return;
    }
    if (!drag) return;

    const dx = ev.clientX - drag.sx;
    const dy = ev.clientY - drag.sy;
    const s = drag.startCrop;
    if (drag.kind === "move") {
      setCrop({ x: s.x + dx, y: s.y + dy, w: s.w, h: s.h });
      return;
    }
    const dirX = drag.kind.includes("r") ? 1 : -1;
    const dirY = drag.kind.includes("b") ? 1 : -1;
    const byX = dirX * dx;
    const byY = dirY * dy * ASPECT;
    const newW = Math.max(60, s.w + (Math.abs(byX) >= Math.abs(byY) ? byX : byY));
    const newH = newW / ASPECT;
    // przeciwległy narożnik stoi w miejscu
    setCrop({
      x: dirX > 0 ? s.x : s.x + (s.w - newW),
      y: dirY > 0 ? s.y : s.y + (s.h - newH),
      w: newW,
      h: newH,
    });
  }

  function onPointerUp(ev) {
    if (!touches.has(ev.pointerId)) return;
    touches.delete(ev.pointerId);
    if (pinch) {
      pinch = null;
      // z dwóch palców na jeden: dalej przesuwanie pozostałym, bez skoku
      if (touches.size === 1) {
        const [rest] = touches.values();
        drag = { kind: "move", sx: rest.x, sy: rest.y, startCrop: { ...crop } };
      }
    } else if (touches.size === 0) {
      drag = null;
    }
  }

  // =========================================================
  // Popover suwaków: jeden panel naraz, pod przyciskiem
  // =========================================================
  const panelsWrap = $("imgPanels");
  const panelBtns = Array.from(document.querySelectorAll(".imgSetBtn"));
  const panels = Array.from(document.querySelectorAll("#imgPanels .imgPanel"));
  let openPanel = null;

  function closePanels() {
    openPanel = null;
    panelsWrap?.classList.remove("is-open");
    for (const b of panelBtns) b.classList.remove("on");
    for (const p of panels) p.classList.remove("is-open");
  }

  function openPanelAt(name, anchor) {
    if (!panelsWrap) return;
    openPanel = name;
    for (const b of panelBtns) b.classList.toggle("on", b.dataset.panel === name);
    for (const p of panels) p.classList.toggle("is-open", p.dataset.panel === name);
    panelsWrap.classList.add("is-open");

    const r = anchor.getBoundingClientRect();
    const place = (w, h) => {
      const pad = 8;
      panelsWrap.style.left = `${Math.round(clamp(r.left, pad, window.innerWidth - w - pad))}px`;
      panelsWrap.style.top = `${Math.round(clamp(r.bottom + 8, pad, window.innerHeight - h - pad))}px`;
    };
    place(0, 0);
    requestAnimationFrame(() => {
      const active = panelsWrap.querySelector(".imgPanel.is-open");
      if (active) place(active.offsetWidth || 320, active.offsetHeight || 120);
    });
  }

  // =========================================================
  // Zdarzenia (raz, przy starcie strony)
  // =========================================================
  $("btnPickImage")?.addEventListener("click", () => imgFile?.click());

  imgFile?.addEventListener("change", async () => {
    const f = imgFile.files?.[0];
    imgFile.value = ""; // ten sam plik wybrany drugi raz też ma zadziałać
    if (ctx.getMode?.() !== "IMAGE" || !f) return;
    await pickFile(f);
  });

  imgStage?.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  imgBigPreview?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("logoeditor:openPreview", { detail: { kind: "PIX", bits } }));
  });

  const onSettingChange = () => {
    if (ctx.getMode?.() !== "IMAGE") return;
    syncLabels();
    if (!imgObj) return;
    ctx.markDirty?.();
    schedulePreview(40);
  };
  chkInvert?.addEventListener("change", onSettingChange);
  for (const s of Object.values(SLIDERS)) s.input?.addEventListener("input", onSettingChange);

  btnImgResetDefault?.addEventListener("click", () => {
    if (ctx.getMode?.() === "IMAGE") resetToDefaults();
  });

  for (const b of panelBtns) {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (openPanel === b.dataset.panel) closePanels();
      else openPanelAt(b.dataset.panel, b);
    });
  }
  window.addEventListener("pointerdown", (e) => {
    if (!openPanel || e.target.closest?.("#imgPanels, .imgSetBtn")) return;
    closePanels();
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });
  window.addEventListener("i18n:lang", syncLabels);

  // Zmiana rozmiaru okna albo samego pola: przelicz piksele ramki z kadru.
  let layoutDeb = null;
  const relayout = () => {
    clearTimeout(layoutDeb);
    layoutDeb = setTimeout(() => {
      if (ctx.getMode?.() !== "IMAGE" || imageStatus !== "ready" || drag || pinch) return;
      applyCropImg();
      schedulePreview(10);
    }, 60);
  };
  window.addEventListener("resize", () => { applyBestImageLayout(); relayout(); });
  if (imgStage && "ResizeObserver" in window) new ResizeObserver(relayout).observe(imgStage);

  closePanels();
  syncLabels();

  // =========================================================
  // Upload do Storage (przy zapisie)
  // =========================================================
  async function uploadPendingFile() {
    const user = (await sb().auth.getUser())?.data?.user;
    if (!user) throw new Error(t("logoEditor.image.errors.notLogged"));
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" }[pendingFile.type] || "png";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await sb().storage.from(BUCKET).upload(path, pendingFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: pendingFile.type,
    });
    if (error) throw error;
    return sb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function removeStorageFile(url) {
    try {
      const user = (await sb().auth.getUser())?.data?.user;
      const path = storagePathFromUrl(url, user?.id);
      if (path) await sb().storage.from(BUCKET).remove([path]);
    } catch (e) {
      console.warn("[logo-editor/image] could not remove old file:", e);
    }
  }

  // =========================================================
  // API
  // =========================================================
  return {
    open(payload = null) {
      show(paneImage, true);
      applyBestImageLayout();
      closePanels();

      const source = payload?.source || {};
      writeSettings({ ...DEFAULTS, ...source });

      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      pendingFile = null;
      imageUrl = /^https?:/i.test(source.imageUrl || "") ? source.imageUrl : null;
      imageData = /^data:image\//i.test(source.imageData || "") ? source.imageData : null;
      openedImageUrl = imageUrl;
      imgObj = null;
      loadSeq++;
      setStageImage(null); // bez obrazu i ramki poprzedniego logo, zanim wczyta się nowy

      // Do czasu przeliczenia z obrazu pokazujemy to, co jest zapisane.
      bits = payload?.bits_b64 ? unpackBits(payload.bits_b64) : new Uint8Array(DOT_W * DOT_H);
      renderBitsToCanvas(bits, imgBigPreview);
      ctx.onPreview?.({ kind: "PIX", bits });

      const src = imageUrl || imageData;
      if (src) {
        void showImage(src, source.crop || null, imageUrl && imageData ? imageData : null);
      } else {
        imageStatus = "none";
        setStageImage(null);
      }
      ctx.clearDirty?.();
    },

    close() {
      show(paneImage, false);
      closePanels();
      loadSeq++;
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    },

    async getCreatePayload() {
      if (imageStatus === "loading") return { ok: false, msg: t("logoEditor.image.errors.stillLoading") };
      if (imageStatus === "error") return { ok: false, msg: t("logoEditor.image.errors.loadFailed") };
      if (imageStatus === "none") return { ok: false, msg: t("logoEditor.image.errors.noImage") };

      bits = compileBits();

      if (pendingFile) {
        try {
          imageUrl = await uploadPendingFile();
          imageData = null;
          pendingFile = null;
        } catch (e) {
          console.error("[logo-editor/image] upload failed:", e);
          return { ok: false, msg: t("logoEditor.image.errors.storageFailed", { error: e?.message || e }) };
        }
      }

      const s = readSettings();
      return {
        ok: true,
        type: TYPE_PIX,
        payload: {
          w: DOT_W,
          h: DOT_H,
          format: PIX_FORMAT,
          bits_b64: packBits(bits),
          source: {
            mode: "IMAGE",
            ...s,
            crop: cropImg ? { v: 2, x: cropImg.x, y: cropImg.y, w: cropImg.w } : null,
            imageUrl,
            imageData: imageUrl ? null : imageData,
          },
        },
      };
    },

    /** Po udanym zapisie: sprzątnij plik, który ten zapis zastąpił. */
    async onSaved() {
      if (openedImageUrl && openedImageUrl !== imageUrl) await removeStorageFile(openedImageUrl);
      openedImageUrl = imageUrl;
    },
  };
}
