// Build the shared Host mask from the supplied demo .famlogo payload.
// The demo artwork is black on a white editing background. Its embedded
// raster includes a uniform low-alpha canvas background, so normalize against
// the perimeter before inverting the artwork into a white DOT-tintable mask.
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const repo = path.resolve(__dirname, "../..");
const input = path.join(repo, "docs/DEMO - Logo Rysunek.famlogo");
const output = path.join(repo, "web/logo/assets/demo-draw-host.png");

async function main() {
  const file = JSON.parse(await fs.readFile(input, "utf8"));
  const dataUrl = file?.payload?.source?.hostRasterData;
  if (!/^data:image\/png;base64,/.test(dataUrl || "")) {
    throw new Error("Demo .famlogo does not contain an embedded Host PNG");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pngDataUrl = await page.evaluate(async source => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const perimeter = [];
      const stride = Math.max(1, Math.floor(Math.max(canvas.width, canvas.height) / 256));
      for (let x = 0; x < canvas.width; x += stride) {
        perimeter.push(pixels.data[(x * 4) + 3]);
        perimeter.push(pixels.data[((canvas.height - 1) * canvas.width + x) * 4 + 3]);
      }
      for (let y = 0; y < canvas.height; y += stride) {
        perimeter.push(pixels.data[(y * canvas.width) * 4 + 3]);
        perimeter.push(pixels.data[(y * canvas.width + canvas.width - 1) * 4 + 3]);
      }
      perimeter.sort((a, b) => a - b);
      const backgroundAlpha = perimeter[Math.floor(perimeter.length / 2)];
      if (!backgroundAlpha) throw new Error("Could not determine the demo PNG canvas background");
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = 255;
        pixels.data[i + 1] = 255;
        pixels.data[i + 2] = 255;
        pixels.data[i + 3] = Math.round(255 * Math.max(0, backgroundAlpha - pixels.data[i + 3]) / backgroundAlpha);
      }
      const alphaAt = (x, y) => pixels.data[(y * canvas.width + x) * 4 + 3];
      if (alphaAt(0, 0) !== 0 || alphaAt(640, 20) !== 0 || alphaAt(40, 270) < 200) {
        throw new Error("Demo PNG mask failed: expected transparent paper and visible frame");
      }
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/png");
    }, dataUrl);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, Buffer.from(pngDataUrl.split(",", 2)[1], "base64"));
    console.log(`Saved shared demo Host mask: ${path.relative(repo, output)}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
