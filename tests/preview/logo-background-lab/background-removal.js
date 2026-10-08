const fileInput = document.getElementById("imageFile");
const sourceCanvas = document.getElementById("sourceCanvas");
const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
const backgroundInput = document.getElementById("backgroundColor");
const toleranceInput = document.getElementById("tolerance");
const featherInput = document.getElementById("reach");
const islandLimitInput = document.getElementById("islandLimit");
const resetButton = document.getElementById("reset");
const sampleColorButton = document.getElementById("sampleColor");
const sampleCards = [...document.querySelectorAll(".sample-card")];
const statusBox = document.getElementById("suitability");
const MAX_SIDE = 1600;
const OUTPUTS = [
  { canvasId: "edgeCleanCanvas", statsId: "edgeCleanStats", mode: "edge", cleanup: true },
  { canvasId: "edgeSmallCanvas", statsId: "edgeSmallStats", mode: "edge-small", cleanup: true },
  { canvasId: "globalCleanCanvas", statsId: "globalCleanStats", mode: "global", cleanup: true },
  { canvasId: "edgeRawCanvas", statsId: "edgeRawStats", mode: "edge", cleanup: false },
];

let originalPixels = null;
let floodQueue = null;
let visited = null;
let currentFilename = "logo";
let autoBackground = "#ffffff";
let cornerSpread = 0;
let transparentCornerRatio = 0;
let sampleMode = false;
let renderFrame = 0;
let renderTimer = 0;
let lastRenderAt = 0;

function rgbFromHex(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
}
function hexFromRgb(rgb) {
  return `#${rgb.map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}
function colorDelta(data, index, background) {
  return Math.max(
    Math.abs(data[index] - background[0]),
    Math.abs(data[index + 1] - background[1]),
    Math.abs(data[index + 2] - background[2]),
  );
}
function median(values) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
function estimateCornerColor(imageData) {
  const { data, width, height } = imageData;
  let sampledPixels = 0;
  let transparentPixels = 0;
  const patchWidth = Math.max(2, Math.round(width * 0.045));
  const patchHeight = Math.max(2, Math.round(height * 0.07));
  const patches = [
    [0, 0], [width - patchWidth, 0],
    [0, height - patchHeight], [width - patchWidth, height - patchHeight],
  ];
  const patchMedians = patches.map(([left, top]) => {
    const channels = [[], [], []];
    const stepX = Math.max(1, Math.floor(patchWidth / 16));
    const stepY = Math.max(1, Math.floor(patchHeight / 12));
    for (let y = top; y < top + patchHeight; y += stepY) {
      for (let x = left; x < left + patchWidth; x += stepX) {
        const index = (y * width + x) * 4;
        sampledPixels++;
        if (data[index + 3] < 240) {
          transparentPixels++;
          continue;
        }
        for (let channel = 0; channel < 3; channel++) channels[channel].push(data[index + channel]);
      }
    }
    return channels.map(channel => channel.length ? median(channel) : 255);
  });
  const color = [0, 1, 2].map(channel => median(patchMedians.map(patch => patch[channel])));
  cornerSpread = Math.max(...patchMedians.map(patch => Math.max(...patch.map((value, channel) => Math.abs(value - color[channel])))));
  transparentCornerRatio = sampledPixels ? transparentPixels / sampledPixels : 0;
  return color;
}
function setSuitability(message, detail, kind = "") {
  statusBox.className = `status ${kind}`;
  statusBox.replaceChildren();
  const heading = document.createElement("strong");
  const description = document.createElement("span");
  heading.textContent = message;
  description.textContent = detail;
  statusBox.append(heading, description);
}
function updateSuitability() {
  if (!originalPixels) {
    setSuitability("Wczytaj obraz", "Sprawdzę, czy tło nadaje się do usunięcia.");
    return;
  }
  if (transparentCornerRatio >= 0.75) {
    setSuitability("Narożniki są przezroczyste", "Tło może być już usunięte. Sprawdź oryginał przed ponownym wycinaniem.", "good");
    return;
  }
  if (cornerSpread <= 14) {
    setSuitability("Tło wygląda na jednolite", `Wykryty kolor: ${backgroundInput.value.toUpperCase()}. Próbki z rogów różnią się maksymalnie o ${Math.round(cornerSpread)} poziomów. Sprawdź, czy logo nie zawiera podobnego koloru.`, "good");
  } else if (cornerSpread <= 45) {
    setSuitability("Tło może wymagać korekty", `Wykryty kolor: ${backgroundInput.value.toUpperCase()}. Próbki z rogów różnią się o ${Math.round(cornerSpread)} poziomów; obejrzyj krawędzie i dopasuj tolerancję.`, "warn");
  } else {
    setSuitability("Tło nie wygląda na jednolite", `Próbki z rogów różnią się o ${Math.round(cornerSpread)} poziomów. Usuwanie może zostawić ślady albo wyciąć podobne kolory logo.`, "warn");
  }
}
function prepareImage(image, filename, originalWidth = image.naturalWidth, originalHeight = image.naturalHeight) {
  const scale = Math.min(1, MAX_SIDE / Math.max(originalWidth, originalHeight));
  sourceCanvas.width = Math.max(1, Math.round(originalWidth * scale));
  sourceCanvas.height = Math.max(1, Math.round(originalHeight * scale));
  sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
  originalPixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  floodQueue = new Uint32Array(sourceCanvas.width * sourceCanvas.height);
  visited = new Uint8Array(sourceCanvas.width * sourceCanvas.height);
  autoBackground = hexFromRgb(estimateCornerColor(originalPixels));
  backgroundInput.value = autoBackground;
  currentFilename = filename.replace(/\.[^.]+$/, "") || "logo";
  document.getElementById("filename").textContent = filename;
  document.getElementById("dimensions").textContent = `${originalWidth} × ${originalHeight}${scale < 1 ? " · podgląd zmniejszony do 1600 px" : ""}`;
  for (const { canvasId } of OUTPUTS) {
    const canvas = document.getElementById(canvasId);
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
  }
  for (const control of [backgroundInput, toleranceInput, featherInput, islandLimitInput, resetButton, sampleColorButton]) control.disabled = false;
  for (const button of document.querySelectorAll(".download-method")) button.disabled = false;
  updateSuitability();
  scheduleRender();
}
function loadFile(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    setSuitability("Nieobsługiwany plik", "Wybierz obraz PNG, JPEG lub WebP.", "warn");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    for (const card of sampleCards) card.setAttribute("aria-pressed", "false");
    prepareImage(image, file.name);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    setSuitability("Nie udało się wczytać obrazu", "Spróbuj wybrać inny plik PNG, JPEG lub WebP.", "warn");
  };
  image.src = objectUrl;
}
function drawSample(kind) {
  const card = sampleCards.find(item => item.dataset.sample === kind);
  const image = card?.querySelector("img");
  if (!image) return;
  const activate = () => {
    for (const item of sampleCards) item.setAttribute("aria-pressed", String(item === card));
    prepareImage(image, card.dataset.filename || `przyklad-${kind}.svg`, image.naturalWidth, image.naturalHeight);
  };
  if (image.complete && image.naturalWidth > 0) activate();
  else {
    image.addEventListener("load", activate, { once: true });
    image.addEventListener("error", () => setSuitability("Nie udało się wczytać przykładu", "Odśwież stronę i spróbuj ponownie.", "warn"), { once: true });
  }
}
function isCandidate(index, data, background, threshold) {
  return data[index + 3] > 0 && colorDelta(data, index, background) <= threshold;
}
function addEdgePixel(pixel, data, background, threshold, tail) {
  if (visited[pixel]) return tail;
  const index = pixel * 4;
  if (!isCandidate(index, data, background, threshold)) {
    visited[pixel] = 2;
    return tail;
  }
  visited[pixel] = 1;
  floodQueue[tail++] = pixel;
  return tail;
}
function removeSmallInteriorIslands(output, data, width, height, background, threshold, tolerance, feather, cleanup) {
  const pixelCount = width * height;
  const maxPixels = Math.max(1, Math.floor(pixelCount * Number(islandLimitInput.value) / 100));
  let removedArea = 0;
  let transparent = 0;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    if (visited[pixel] !== 0) continue;
    const index = pixel * 4;
    if (!isCandidate(index, data, background, threshold)) {
      visited[pixel] = 2;
      continue;
    }

    let head = 0;
    let tail = 0;
    floodQueue[tail++] = pixel;
    visited[pixel] = 3;
    while (head < tail) {
      const current = floodQueue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      if (x > 0 && visited[current - 1] === 0) {
        const next = current - 1;
        if (isCandidate(next * 4, data, background, threshold)) { visited[next] = 3; floodQueue[tail++] = next; }
        else visited[next] = 2;
      }
      if (x + 1 < width && visited[current + 1] === 0) {
        const next = current + 1;
        if (isCandidate(next * 4, data, background, threshold)) { visited[next] = 3; floodQueue[tail++] = next; }
        else visited[next] = 2;
      }
      if (y > 0 && visited[current - width] === 0) {
        const next = current - width;
        if (isCandidate(next * 4, data, background, threshold)) { visited[next] = 3; floodQueue[tail++] = next; }
        else visited[next] = 2;
      }
      if (y + 1 < height && visited[current + width] === 0) {
        const next = current + width;
        if (isCandidate(next * 4, data, background, threshold)) { visited[next] = 3; floodQueue[tail++] = next; }
        else visited[next] = 2;
      }
    }

    for (let item = 0; item < tail; item++) {
      const componentPixel = floodQueue[item];
      visited[componentPixel] = 2;
      if (tail > maxPixels) continue;
      removedArea++;
      if (recolorPixel(output, data, componentPixel * 4, background, tolerance, feather, cleanup)) transparent++;
    }
  }
  return { area: removedArea, transparent };
}
function recolorPixel(output, source, index, background, tolerance, feather, cleanEdge) {
  const delta = colorDelta(source, index, background);
  const coverage = delta / 255;
  const retained = feather === 0 ? 0 : Math.max(0, Math.min(1, (delta - tolerance) / feather));
  if (retained === 0) {
    output[index + 3] = 0;
    return true;
  }
  if (cleanEdge && coverage > 0 && retained < 1) {
    for (let channel = 0; channel < 3; channel++) {
      output[index + channel] = Math.max(0, Math.min(255,
        Math.round((source[index + channel] - background[channel] * (1 - coverage)) / coverage)));
    }
  }
  output[index + 3] = Math.round(source[index + 3] * retained);
  return output[index + 3] === 0;
}
function renderAlgorithm({ canvasId, statsId, mode, cleanup }, data, width, height, background, tolerance, feather) {
  const canvas = document.getElementById(canvasId);
  const context = canvas.getContext("2d");
  const result = context.createImageData(width, height);
  result.data.set(data);
  const limit = Math.min(255, tolerance + feather);
  let area = 0;
  let transparent = 0;

  if (mode === "global") {
    for (let pixel = 0, index = 0; pixel < width * height; pixel++, index += 4) {
      if (!isCandidate(index, data, background, limit)) continue;
      area++;
      if (recolorPixel(result.data, data, index, background, tolerance, feather, cleanup)) transparent++;
    }
  } else {
    visited.fill(0);
    let head = 0;
    let tail = 0;
    for (let x = 0; x < width; x++) {
      tail = addEdgePixel(x, data, background, limit, tail);
      tail = addEdgePixel((height - 1) * width + x, data, background, limit, tail);
    }
    for (let y = 1; y < height - 1; y++) {
      tail = addEdgePixel(y * width, data, background, limit, tail);
      tail = addEdgePixel(y * width + width - 1, data, background, limit, tail);
    }
    while (head < tail) {
      const pixel = floodQueue[head++];
      const index = pixel * 4;
      area++;
      if (recolorPixel(result.data, data, index, background, tolerance, feather, cleanup)) transparent++;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) tail = addEdgePixel(pixel - 1, data, background, limit, tail);
      if (x + 1 < width) tail = addEdgePixel(pixel + 1, data, background, limit, tail);
      if (y > 0) tail = addEdgePixel(pixel - width, data, background, limit, tail);
      if (y + 1 < height) tail = addEdgePixel(pixel + width, data, background, limit, tail);
    }
    if (mode === "edge-small") {
      const islands = removeSmallInteriorIslands(result.data, data, width, height, background, limit, tolerance, feather, cleanup);
      area += islands.area;
      transparent += islands.transparent;
    }
  }

  context.putImageData(result, 0, 0);
  const percent = (transparent / (width * height) * 100).toFixed(1).replace(".", ",");
  document.getElementById(statsId).textContent = `${percent}% · ${area.toLocaleString("pl-PL")} px`;
}
function processImage() {
  if (!originalPixels) return;
  const { width, height, data } = originalPixels;
  const background = rgbFromHex(backgroundInput.value);
  const tolerance = Number(toleranceInput.value);
  const feather = Number(featherInput.value);
  for (const algorithm of OUTPUTS) {
    renderAlgorithm(algorithm, data, width, height, background, tolerance, feather);
  }
  updateSuitability();
}
function scheduleRender() {
  if (renderFrame || renderTimer) return;
  const delay = Math.max(0, 160 - (performance.now() - lastRenderAt));
  const request = () => {
    renderTimer = 0;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      lastRenderAt = performance.now();
      processImage();
    });
  };
  if (delay === 0) request();
  else renderTimer = setTimeout(request, delay);
}
function renderImmediately() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = 0;
  if (renderFrame) cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    lastRenderAt = performance.now();
    processImage();
  });
}
function downloadCanvas(canvasId, suffix) {
  const canvas = document.getElementById(canvasId);
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentFilename}-${suffix}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

fileInput.addEventListener("change", () => loadFile(fileInput.files?.[0]));
for (const card of sampleCards) card.addEventListener("click", () => drawSample(card.dataset.sample));
backgroundInput.addEventListener("input", () => { updateSuitability(); scheduleRender(); });
toleranceInput.addEventListener("input", scheduleRender);
featherInput.addEventListener("input", scheduleRender);
islandLimitInput.addEventListener("input", scheduleRender);
for (const input of [backgroundInput, toleranceInput, featherInput, islandLimitInput]) input.addEventListener("change", renderImmediately);
function updateIslandLimitReadout() {
  document.getElementById("islandLimitValue").value = `${Number(islandLimitInput.value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}% obrazu`;
}
islandLimitInput.addEventListener("input", updateIslandLimitReadout);
updateIslandLimitReadout();
for (const input of [toleranceInput, featherInput]) {
  input.addEventListener("input", () => {
    document.getElementById(`${input.id}Value`).value = `${input.value} / 255`;
  });
  document.getElementById(`${input.id}Value`).value = `${input.value} / 255`;
}
sampleColorButton.addEventListener("click", () => {
  sampleMode = true;
  sampleColorButton.textContent = "Kliknij tło na oryginale…";
});
sourceCanvas.addEventListener("click", event => {
  if (!sampleMode || !originalPixels) return;
  const rect = sourceCanvas.getBoundingClientRect();
  const scale = Math.min(rect.width / sourceCanvas.width, rect.height / sourceCanvas.height);
  const drawnWidth = sourceCanvas.width * scale;
  const drawnHeight = sourceCanvas.height * scale;
  const left = rect.left + (rect.width - drawnWidth) / 2;
  const top = rect.top + (rect.height - drawnHeight) / 2;
  const x = Math.floor((event.clientX - left) / scale);
  const y = Math.floor((event.clientY - top) / scale);
  if (x < 0 || y < 0 || x >= originalPixels.width || y >= originalPixels.height) return;
  const index = (y * originalPixels.width + x) * 4;
  backgroundInput.value = hexFromRgb([...originalPixels.data.slice(index, index + 3)]);
  sampleMode = false;
  sampleColorButton.textContent = "Pobierz kolor z obrazu";
  updateSuitability();
  renderImmediately();
});
resetButton.addEventListener("click", () => {
  backgroundInput.value = autoBackground;
  toleranceInput.value = "20";
  featherInput.value = "130";
  islandLimitInput.value = "0.03";
  updateIslandLimitReadout();
  for (const input of [toleranceInput, featherInput]) {
    document.getElementById(`${input.id}Value`).value = `${input.value} / 255`;
  }
  updateSuitability();
  renderImmediately();
});
for (const button of document.querySelectorAll(".download-method")) {
  button.addEventListener("click", () => downloadCanvas(button.dataset.canvas, button.dataset.suffix));
}
for (const control of [backgroundInput, toleranceInput, featherInput, islandLimitInput, resetButton, sampleColorButton]) control.disabled = true;
for (const button of document.querySelectorAll(".download-method")) button.disabled = true;
drawSample("white");
