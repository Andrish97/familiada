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
  throw new Error("Galeria E20 nie zawiera żadnych zrzutów PNG.");
}

const fullGalleryRequested = !process.env.E20_GALLERY_PAGES && !process.env.E20_GALLERY_PROFILES;
if (fullGalleryRequested) {
  const requiredPages = [
    "home", "account", "bases", "connect", "connect-tv", "games",
    "friends", "go", "login", "login-confirm",
    "login-reset", "logo", "mail", "maintenance", "manual", "marketplace", "polls",
    "privacy", "subscribers", "tasks", "404",
  ];
  for (const profile of profiles) {
    const profileEntries = entries.filter((entry) => entry.profile === profile && !entry.stateId);
    const ids = new Set(profileEntries.map((entry) => entry.id));
    const expected = requiredPages;
    const missing = expected.filter((id) => !ids.has(id));
    if (missing.length) throw new Error(`Niekompletna galeria E20 dla ${profile}; brakuje: ${missing.join(", ")}`);
  }
}

for (const entry of entries) {
  const file = path.join(root, entry.file);
  if (!entry.file.endsWith(".png") || !fs.existsSync(file)) throw new Error(`Brak zrzutu PNG: ${entry.file}`);
}
const pages = [...new Set(entries.map((entry) => entry.id))];
const modals = entries.filter((entry) => String(entry.stateId || "").startsWith("modal:")).length;
console.log(`Zweryfikowano ${entries.length} zrzutów PNG (${modals} modalów otwartych przez interfejs) na ${pages.length} stronach. Artefakt zawiera wyłącznie foldery stron i obrazy.`);
