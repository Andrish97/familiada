const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// E20 output is deliberately only page folders containing PNG files. The
// manifests are runner-local validation data, never part of the artifact.
const root = path.resolve(__dirname, "../../tests/test-results/e20-gallery");
const temp = process.env.RUNNER_TEMP || os.tmpdir();
const manifestRoot = path.join(temp, "familiada-e20-gallery-manifests");
const profiles = ["macbook", "ipad-portrait", "ipad-landscape", "iphone-portrait", "iphone-landscape", "tv"];
const entries = profiles.flatMap((profile) => {
  const file = path.join(manifestRoot, `manifest-${profile}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
});
if (!entries.length) {
  console.log("Brak zrzutów PNG do walidacji; przyczynę sprawdź w kroku E2E.");
  process.exit(0);
}

const fullGalleryRequested = !process.env.E20_GALLERY_PAGES && !process.env.E20_GALLERY_PROFILES;
if (fullGalleryRequested) {
  const expectedPerProfile = { macbook: 42, "ipad-portrait": 42, "ipad-landscape": 42, "iphone-portrait": 42, "iphone-landscape": 42, tv: 1 };
  for (const [profile, expected] of Object.entries(expectedPerProfile)) {
    const actual = entries.filter((entry) => entry.profile === profile).length;
    if (actual !== expected) throw new Error(`Niekompletne zrzuty E20 dla ${profile}: ${actual}/${expected}`);
  }
  if (entries.length !== 211) throw new Error(`Niekompletne zrzuty E20: ${entries.length}/211`);
}

for (const entry of entries) {
  const file = path.join(root, entry.file);
  if (!entry.file.endsWith(".png") || !fs.existsSync(file)) throw new Error(`Brak zrzutu PNG: ${entry.file}`);
}
const pages = [...new Set(entries.map((entry) => entry.id))];
console.log(`Zweryfikowano ${entries.length} zrzutów PNG na ${pages.length} stronach. Artefakt zawiera wyłącznie foldery stron i obrazy.`);
