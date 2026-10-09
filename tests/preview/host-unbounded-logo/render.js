const controls = Object.fromEntries([
  "word", "dot", "weight", "height", "width", "spacing", "fisheye", "depth", "depthAngle", "previewZoom",
].map(id => [id, document.getElementById(id)]));
const output = document.querySelector("#rendered");
const sourceCanvas = document.createElement("canvas");
sourceCanvas.width = 1280;
sourceCanvas.height = 720;
const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
const previewCanvas = document.createElement("canvas");
previewCanvas.width = 1280;
previewCanvas.height = 720;
previewCanvas.setAttribute("role", "img");
previewCanvas.setAttribute("aria-label", "Podgląd odkształconego logo Hosta");
const previewContext = previewCanvas.getContext("2d", { willReadFrequently: true });
let previewTimer = 0;
let lastPreviewAt = 0;
const FONT_SIZE = 134;
const BASE_X = 640;
const BASE_Y = 405;

function mix(hex, target, amount) {
  const src = hex.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
  const dst = target.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
  return `#${src.map((v, i) => Math.round(v + (dst[i] - v) * amount).toString(16).padStart(2, "0")).join("")}`;
}
function setReadouts() {
  const labels = {
    weight: controls.weight.value,
    height: `${controls.height.value}%`,
    width: `${controls.width.value}%`,
    spacing: `${controls.spacing.value}px`,
    fisheye: Number(controls.fisheye.value).toFixed(2),
    depth: `${controls.depth.value}px`,
    depthAngle: `${controls.depthAngle.value}°`,
    previewZoom: `${controls.previewZoom.value}%`,
  };
  for (const [id, value] of Object.entries(labels)) document.getElementById(`${id}Value`).value = value;
}
function measureRun(context, characters, widthStretch, spacing) {
  return characters.map(character => {
    const measured = context.measureText(character);
    return {
      advance: Math.max(2, measured.width * widthStretch + spacing),
      ascent: measured.actualBoundingBoxAscent || FONT_SIZE * 0.72,
      descent: measured.actualBoundingBoxDescent || 0,
    };
  });
}
function lensAt(u, lens) {
  if (lens < 0.001) return { position: u, scale: 1 };
  const denominator = Math.tanh(lens);
  const bent = Math.tanh(lens * u);
  return {
    position: bent / denominator,
    scale: Math.max(0.18, lens * (1 - bent ** 2) / denominator),
  };
}
function drawGlyphRun(context, characters, metrics, options) {
  const { weight, size, widthStretch, heightStretch, lens, color, stroke, strokeWidth, offsetX, offsetY } = options;
  const total = metrics.reduce((sum, metric) => sum + metric.advance, 0);
  const fitScale = total > 1080 ? 1080 / total : 1;
  const half = total * fitScale / 2;
  let cursor = 0;

  context.font = `${weight} ${size}px UnboundedPreview`;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.lineJoin = "round";
  context.lineWidth = strokeWidth;
  context.strokeStyle = stroke;
  context.fillStyle = color;

  characters.forEach((character, index) => {
    const metric = metrics[index];
    const rawCenter = cursor + metric.advance / 2;
    const u = Math.max(-1, Math.min(1, rawCenter / Math.max(total, 1) * 2 - 1));
    const lensPoint = lensAt(u, lens);
    const x = BASE_X + half * lensPoint.position + offsetX;
    const glyphScaleX = fitScale * widthStretch * lensPoint.scale;

    context.save();
    context.translate(x, BASE_Y + offsetY);
    context.scale(glyphScaleX, heightStretch);
    if (strokeWidth > 0) context.strokeText(character, 0, 0);
    context.fillText(character, 0, 0);
    context.restore();
    cursor += metric.advance;
  });
}
function findAlphaBounds(pixels, width, height) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0, index = (y * width) * 4 + 3; x < width; x++, index += 4) {
      if (pixels[index] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < left ? null : { left, right, top, bottom };
}
function warpVerticalEdges(lens) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const source = sourceContext.getImageData(0, 0, width, height);
  const bounds = findAlphaBounds(source.data, width, height);
  const destination = previewContext.createImageData(width, height);
  if (!bounds) {
    previewContext.putImageData(destination, 0, 0);
    return;
  }

  // Bend every horizontal slice around the inscription's visual center.
  // This warps the glyph outlines themselves: their top and bottom edges bow
  // in opposite directions instead of moving intact letters on an arc.
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const half = Math.max(1, (bounds.right - bounds.left) / 2);
  const sourcePixels = source.data;
  const destinationPixels = destination.data;
  const denominator = lens < 0.001 ? 1 : Math.tanh(lens);

  for (let x = bounds.left; x <= bounds.right; x++) {
    const u = Math.max(-1, Math.min(1, (x - centerX) / half));
    const bent = Math.tanh(lens * u);
    const verticalScale = lens < 0.001 ? 1 : Math.max(0.18, lens * (1 - bent ** 2) / denominator);
    const top = Math.max(0, Math.floor(centerY + (bounds.top - centerY) * verticalScale));
    const bottom = Math.min(height - 1, Math.ceil(centerY + (bounds.bottom - centerY) * verticalScale));

    for (let y = top; y <= bottom; y++) {
      const sourceY = centerY + (y - centerY) / verticalScale;
      if (sourceY < 0 || sourceY > height - 1) continue;
      const y0 = Math.floor(sourceY);
      const y1 = Math.min(height - 1, y0 + 1);
      const fraction = sourceY - y0;
      const destinationIndex = (y * width + x) * 4;
      const sourceIndex0 = (y0 * width + x) * 4;
      const sourceIndex1 = (y1 * width + x) * 4;
      const alpha0 = sourcePixels[sourceIndex0 + 3] / 255;
      const alpha1 = sourcePixels[sourceIndex1 + 3] / 255;
      const alpha = alpha0 * (1 - fraction) + alpha1 * fraction;
      destinationPixels[destinationIndex + 3] = Math.round(alpha * 255);
      for (let channel = 0; channel < 3; channel++) {
        const premultiplied = sourcePixels[sourceIndex0 + channel] * alpha0 * (1 - fraction) +
          sourcePixels[sourceIndex1 + channel] * alpha1 * fraction;
        destinationPixels[destinationIndex + channel] = alpha > 0 ? Math.round(premultiplied / alpha) : 0;
      }
    }
  }
  previewContext.putImageData(destination, 0, 0);
}
function renderWordmark({ text, dot, weight, width, height, spacing, fisheye, depth, depthAngle }) {
  const context = sourceContext;
  context.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);

  const size = FONT_SIZE;
  const widthStretch = width / 100;
  const heightStretch = height / 100;
  const characters = Array.from(text);
  context.font = `${weight} ${size}px UnboundedPreview`;
  const metrics = measureRun(context, characters, widthStretch, spacing);
  const lens = Math.max(0, fisheye);
  const steps = Math.max(0, Math.min(32, depth));
  // The source logo uses #fc0 for the face and #a80 for the extrusion.
  const extrusionColor = mix(dot, "#000000", 1 / 3);
  const angle = depthAngle * Math.PI / 180;
  const offsetX = Math.cos(angle) * 0.95;
  const offsetY = Math.sin(angle) * 0.95;

  for (let step = steps; step >= 1; step--) {
    drawGlyphRun(context, characters, metrics, {
      weight, size, widthStretch, heightStretch, lens,
      color: extrusionColor, stroke: extrusionColor, strokeWidth: 0,
      offsetX: step * offsetX, offsetY: step * offsetY,
    });
  }
  drawGlyphRun(context, characters, metrics, {
    weight, size, widthStretch, heightStretch, lens,
    color: dot, stroke: extrusionColor, strokeWidth: 0,
    offsetX: 0, offsetY: 0,
  });
  warpVerticalEdges(lens);
}
function update() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = 0;
  setReadouts();
  output.style.setProperty("--logo-preview-zoom", String(Number(controls.previewZoom.value) / 100));
  if (!output.contains(previewCanvas)) output.replaceChildren(previewCanvas);
  previewCanvas.setAttribute("aria-label", `${controls.word.value.trim() || "FAMILIADA"}, logo z rybim okiem`);
  const text = controls.word.value.trim().toLocaleUpperCase("pl-PL") || "FAMILIADA";
  renderWordmark({
    text, dot: controls.dot.value, weight: Number(controls.weight.value),
    width: Number(controls.width.value), height: Number(controls.height.value),
    spacing: Number(controls.spacing.value), fisheye: Number(controls.fisheye.value),
    depth: Number(controls.depth.value), depthAngle: Number(controls.depthAngle.value),
  });
  lastPreviewAt = performance.now();
}
function scheduleUpdate() {
  setReadouts();
  if (previewTimer) return;
  const delay = Math.max(0, 160 - (performance.now() - lastPreviewAt));
  previewTimer = setTimeout(() => {
    previewTimer = 0;
    update();
  }, delay);
}
for (const control of Object.values(controls)) {
  control.addEventListener("input", scheduleUpdate);
  control.addEventListener("change", update);
}
update();
document.fonts.load(`900 ${FONT_SIZE}px "UnboundedPreview"`).then(update, update);
