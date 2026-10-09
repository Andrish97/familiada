import { logoToBits150 } from "../../shared/js/core/logo-preview.js?v=v2026-10-09T02075";

const W = 1280, H = 720, ASPECT = W / H;
let fontReady;

function loadWordmarkFont() {
  if (!fontReady) {
    fontReady = (async () => {
      const face = new FontFace("HostUnbounded", 'url("/host/fonts/Unbounded-Variable.ttf?v=v2026-10-09T02075")', { weight: "200 900" });
      await face.load();
      document.fonts.add(face);
    })();
  }
  return fontReady;
}

function rgb(hex) {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex || ""));
  return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [255, 204, 0];
}
function hex(channels) { return `#${channels.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`; }
function mix(a, b, amount) { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * amount)); }
function makeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  return canvas;
}

function measure(context, chars, widthStretch, spacing, fontSize) {
  return chars.map(char => ({ advance: Math.max(2, context.measureText(char).width * widthStretch + spacing) }));
}
function lensAt(u, lens) {
  if (lens < 0.001) return { position: u, scale: 1 };
  const denom = Math.tanh(lens), bent = Math.tanh(lens * u);
  return { position: bent / denom, scale: Math.max(0.18, lens * (1 - bent ** 2) / denom) };
}
function drawTextRun(ctx, chars, metrics, opts) {
  const total = metrics.reduce((sum, metric) => sum + metric.advance, 0);
  const fit = Math.min(1, 1080 / Math.max(1, total));
  const half = total * fit / 2;
  let cursor = 0;
  ctx.font = `${opts.weight} ${opts.size}px HostUnbounded`;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
  ctx.fillStyle = opts.color; ctx.strokeStyle = opts.stroke; ctx.lineWidth = opts.strokeWidth;
  chars.forEach((char, index) => {
    const rawCenter = cursor + metrics[index].advance / 2;
    const u = Math.max(-1, Math.min(1, rawCenter / Math.max(1, total) * 2 - 1));
    const lens = lensAt(u, opts.lens);
    ctx.save();
    ctx.translate(640 + half * lens.position + opts.offsetX, 405 + opts.offsetY);
    ctx.scale(fit * opts.width * lens.scale, opts.height);
    if (opts.strokeWidth) ctx.strokeText(char, 0, 0);
    ctx.fillText(char, 0, 0);
    ctx.restore();
    cursor += metrics[index].advance;
  });
}
function bendText(canvas, lens) {
  if (!lens) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const source = ctx.getImageData(0, 0, W, H);
  const data = source.data;
  let left = W, right = -1, top = H, bottom = -1;
  for (let y = 0; y < H; y++) for (let x = 0, i = (y * W) * 4 + 3; x < W; x++, i += 4) {
    if (!data[i]) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) return;
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  const half = Math.max(1, (right - left) / 2), dest = ctx.createImageData(W, H), out = dest.data;
  const denominator = Math.tanh(lens);
  for (let x = left; x <= right; x++) {
    const u = Math.max(-1, Math.min(1, (x - centerX) / half));
    const bent = Math.tanh(lens * u);
    const scale = Math.max(0.18, lens * (1 - bent ** 2) / denominator);
    const yTop = Math.max(0, Math.floor(centerY + (top - centerY) * scale));
    const yBottom = Math.min(H - 1, Math.ceil(centerY + (bottom - centerY) * scale));
    for (let y = yTop; y <= yBottom; y++) {
      const sy = centerY + (y - centerY) / scale;
      if (sy < 0 || sy > H - 1) continue;
      const y0 = Math.floor(sy), y1 = Math.min(H - 1, y0 + 1), f = sy - y0;
      const di = (y * W + x) * 4, i0 = (y0 * W + x) * 4, i1 = (y1 * W + x) * 4;
      const a0 = data[i0 + 3] / 255, a1 = data[i1 + 3] / 255, alpha = a0 * (1 - f) + a1 * f;
      out[di + 3] = Math.round(alpha * 255);
      for (let c = 0; c < 3; c++) out[di + c] = alpha ? Math.round((data[i0 + c] * a0 * (1 - f) + data[i1 + c] * a1 * f) / alpha) : 0;
    }
  }
  ctx.putImageData(dest, 0, 0);
}

export async function renderTextLogo(text, dot) {
  await loadWordmarkFont();
  const canvas = makeCanvas(), ctx = canvas.getContext("2d");
  const chars = Array.from(String(text || "FAMILIADA").trim().toLocaleUpperCase());
  if (!chars.length) chars.push(..."FAMILIADA");
  const size = 134, weight = 900, width = 0.82, height = 1.33, spacing = 11, lens = 0.5, depth = 12, angle = 32 * Math.PI / 180;
  ctx.font = `${weight} ${size}px HostUnbounded`;
  const metrics = measure(ctx, chars, width, spacing, size);
  const extrusion = mix(dot, "#000000", 1 / 3);
  for (let step = depth; step >= 1; step--) {
    drawTextRun(ctx, chars, metrics, { weight, size, width, height, lens, color: extrusion, stroke: extrusion, strokeWidth: 0, offsetX: step * Math.cos(angle) * 0.95, offsetY: step * Math.sin(angle) * 0.95 });
  }
  drawTextRun(ctx, chars, metrics, { weight, size, width, height, lens, color: dot, stroke: extrusion, strokeWidth: 0, offsetX: 0, offsetY: 0 });
  bendText(canvas, lens);
  return canvas;
}

function removeBackground(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height), { data, width, height } = image;
  const pw = Math.max(2, Math.round(width * 0.045)), ph = Math.max(2, Math.round(height * 0.07));
  const patches = [[0, 0], [width - pw, 0], [0, height - ph], [width - pw, height - ph]];
  let transparent = 0, total = 0;
  const colors = patches.map(([x0, y0]) => {
    const channels = [[], [], []];
    for (let y = y0; y < y0 + ph; y += Math.max(1, Math.floor(ph / 12))) {
      for (let x = x0; x < x0 + pw; x += Math.max(1, Math.floor(pw / 16))) {
        const i = (y * width + x) * 4; total++;
        if (data[i + 3] < 240) { transparent++; continue; }
        for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
      }
    }
    return channels.map(ch => { ch.sort((a, b) => a - b); return ch.length ? ch[Math.floor(ch.length / 2)] : 255; });
  });
  if (total && transparent / total >= 0.75) return;
  const median = values => { values.sort((a, b) => a - b); return values[Math.floor(values.length / 2)]; };
  const bg = [0, 1, 2].map(c => median(colors.map(color => color[c])));
  const spread = Math.max(...colors.map(color => Math.max(...color.map((v, c) => Math.abs(v - bg[c])))));
  if (spread > 14) return;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const delta = Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]));
    if (delta > 40) continue;
    const retained = Math.max(0, Math.min(1, (delta - 20) / 20));
    if (!retained) { data[i + 3] = 0; continue; }
    const coverage = delta / 255;
    for (let c = 0; c < 3; c++) data[i + c] = coverage > 0 ? Math.max(0, Math.min(255, Math.round((data[i + c] - bg[c] * (1 - coverage)) / coverage))) : data[i + c];
    data[i + 3] = Math.round(data[i + 3] * retained);
  }
  ctx.putImageData(image, 0, 0);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(src)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function renderImageSource(image, source = {}, { removeBg = true } = {}) {
  if (!image) return null;
  const work = document.createElement("canvas");
  const rotation = [0, 90, 180, 270].includes(Number(source.rotate)) ? Number(source.rotate) : 0;
  const straighten = Math.max(-30, Math.min(30, Number(source.straighten) || 0));
  const angle = (rotation + straighten) * Math.PI / 180;
  const w0 = image.naturalWidth || image.width, h0 = image.naturalHeight || image.height;
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const bw = w0 * c + h0 * s, bh = w0 * s + h0 * c;
  const scale = Math.min(1, 2560 / Math.max(bw, bh));
  work.width = Math.max(1, Math.round(bw * scale));
  work.height = Math.max(1, Math.round(bh * scale));
  const workContext = work.getContext("2d");
  workContext.imageSmoothingEnabled = true;
  workContext.imageSmoothingQuality = "high";
  workContext.translate(work.width / 2, work.height / 2);
  workContext.rotate(angle);
  workContext.scale(scale, scale);
  workContext.drawImage(image, -w0 / 2, -h0 / 2);

  const crop = source.crop?.v === 2 ? source.crop : null;
  let sw = crop ? crop.w * work.width : work.width;
  let sh = crop ? sw / ASPECT : work.height;
  if (!crop) {
    if (sw / sh > ASPECT) sw = sh * ASPECT;
    else sh = sw / ASPECT;
  }
  const sx = crop ? crop.x * work.width : (work.width - sw) / 2;
  const sy = crop ? crop.y * work.height : (work.height - sh) / 2;
  const canvas = makeCanvas(), ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(work, sx, sy, sw, sh, 0, 0, W, H);
  if (removeBg) removeBackground(canvas);
  return canvas;
}

export async function renderImageLogo(source, options) {
  const src = source?.imageData || source?.imageUrl;
  if (!src) return null;
  const image = await loadImage(src);
  return renderImageSource(image, source, options);
}

export async function renderLogoSource(logo, dot) {
  const source = logo?.payload?.source || {};
  if (source.mode === "TEXT" && source.text) return renderTextLogo(source.text, dot);
  if (source.mode === "IMAGE") return renderImageLogo(source).catch(() => null);
  if (source.mode === "DRAW") {
    const bits = logoToBits150(logo, null);
    const canvas = makeCanvas(), ctx = canvas.getContext("2d");
    const cellW = W / 150, cellH = H / 70;
    ctx.fillStyle = dot;
    for (let y = 0; y < 70; y++) for (let x = 0; x < 150; x++) if (bits[y * 150 + x]) ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
    return canvas;
  }
  return null;
}
