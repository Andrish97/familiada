// familiada/logo/js/draw/raster.js
// Scena rysunku (świat worldW x worldH) -> bity 150x70.
//
// Wyświetlacz ma 30x10 kafli po 5x7 kropek z przerwami między kaflami.
// Rysunek renderujemy najpierw do 208x88 „pikseli” -- to 30 kafli po 7
// kolumn (5 kropek + 2 przerwy, bez przerwy za ostatnim) i 10 kafli po 9
// wierszy (7 + 2) -- a potem wycinamy kolumny/wiersze przerw. Dzięki temu
// linia narysowana na przerwie między kaflami znika tak jak na prawdziwym
// wyświetlaczu, a proporcje zgadzają się z tym, co widać na scenie.

import { DOT_W, DOT_H } from "../render.js?v=v2026-10-09T18180";

// Świat nowych rysunków: 26:11, jak cały wyświetlacz. Stare rysunki mają
// swój rozmiar (patrz draw.js) -- dlatego raster przyjmuje go w parametrze.
export const WORLD_W = 1040;
export const WORLD_H = 440;

const RAST_W = 208;
const RAST_H = 88;

/**
 * Renderuje JSON sceny (canvas.toJSON) do canvasa 208x88. Jedna skala dla
 * obu osi (jak w starym edytorze) -- przy świecie 26:11 wypełnia raster
 * dokładnie. enableRetinaScaling: false, bo inaczej na ekranach HiDPI canvas
 * miałby 2x więcej pikseli, a odczyt 208x88 łapał tylko lewą górną ćwiartkę.
 */
async function renderToRaster(fabric, json, worldW, worldH) {
  const el = fabric.util.createCanvasElement();
  el.width = RAST_W;
  el.height = RAST_H;
  const sc = new fabric.StaticCanvas(el, { renderOnAddRemove: false, enableRetinaScaling: false });
  const s = Math.min(RAST_W / worldW, RAST_H / worldH);
  sc.setViewportTransform([s, 0, 0, s, 0, 0]);
  await new Promise((resolve) => sc.loadFromJSON(json, resolve));
  sc.renderAll();
  const data = el.getContext("2d").getImageData(0, 0, RAST_W, RAST_H).data;
  sc.dispose();
  return data;
}

/** Odrzuca kolumny/wiersze przerw między kaflami i progowanie jasności. */
function rasterToBits(data) {
  const out = new Uint8Array(DOT_W * DOT_H);
  let dy = 0;
  for (let y = 0; y < RAST_H && dy < DOT_H; y++) {
    if (y % 9 >= 7) continue;
    let dx = 0;
    for (let x = 0; x < RAST_W && dx < DOT_W; x++) {
      if (x % 7 >= 5) continue;
      const i = (y * RAST_W + x) * 4;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      out[dy * DOT_W + dx] = lum >= 128 ? 1 : 0;
      dx++;
    }
    dy++;
  }
  return out;
}

export async function sceneToBits(fabric, json, worldW = WORLD_W, worldH = WORLD_H) {
  return rasterToBits(await renderToRaster(fabric, json, worldW, worldH));
}

/**
 * Renderuje złożoną scenę DRAW do przezroczystej maski PNG dla Hosta.
 * Fabric najpierw składa wszystkie warstwy w ich kolejności i z ich
 * przezroczystością; dopiero gotowy obraz zamieniamy na maskę jasności.
 * Biel staje się nieprzezroczystą maską, czerń i puste miejsca — przezroczyste.
 * Kolor DOT jest nakładany później przez Host.
 */
export async function sceneToHostRaster(fabric, json, worldW = WORLD_W, worldH = WORLD_H) {
  const width = 1280;
  const height = Math.max(1, Math.round(width * worldH / worldW));
  const element = fabric.util.createCanvasElement();
  element.width = width;
  element.height = height;
  const scene = new fabric.StaticCanvas(element, {
    width,
    height,
    renderOnAddRemove: false,
    enableRetinaScaling: false,
  });
  try {
    const scale = width / worldW;
    scene.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    await new Promise((resolve, reject) => {
      try { scene.loadFromJSON(json, resolve); } catch (error) { reject(error); }
    });
    scene.setWidth(width);
    scene.setHeight(height);
    scene.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    scene.renderAll();

    const context = element.getContext("2d", { willReadFrequently: true });
    const image = context.getImageData(0, 0, width, height);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(pixels[i + 3] * luminance / 255);
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise((resolve, reject) => element.toBlob(value => value ? resolve(value) : reject(new Error("Could not encode DRAW host raster")), "image/png"));
    return blob;
  } finally {
    scene.dispose();
  }
}
