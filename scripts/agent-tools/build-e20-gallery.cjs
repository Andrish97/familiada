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
    "home", "account", "bases", "base-explorer", "connect", "connect-tv", "control", "games",
    "game-editor", "game-settings", "friends", "go", "login", "login-confirm",
    "login-reset", "logos", "logo-editor-text", "logo-editor-draw", "logo-editor-image",
    "mails", "maintenance", "manual", "marketplace", "polls", "poll-vote-points", "poll-vote-qr", "poll-vote-text",
    "privacy", "subscribers", "tasks", "404",
  ];
  const requiredStates = [
    ["bases", "shared"],
    ["bases", "modal:create-base"], ["bases", "modal:import-base"],
    ["bases", "modal:rename-base"], ["bases", "modal:share-base"], ["bases", "modal:export-base-json"],
    ["base-explorer", "modal:tags-assign"], ["base-explorer", "modal:tags-create"], ["base-explorer", "modal:tags-color"],
    ["base-explorer", "modal:export-questions"], ["base-explorer", "modal:add-question"],
    ["base-explorer", "modal:edit-question"], ["base-explorer", "modal:rename-item"],
    ["connect", "modal:device-preview"],
    ["games", "modal:create-game"], ["games", "modal:rename-game"], ["games", "modal:import-games"],
    ["games", "modal:export-game-base"], ["games", "modal:preview-game"],
    ["games", "modal:preview-poll"], ["games", "modal:export-game-json"], ["games", "modal:contact"],
    ["game-editor", "modal:import-questions-text"], ["game-settings", "modal:color-picker"],
    ["logos", "modal:rename-logo"], ["logos", "modal:import-logo"], ["logos", "modal:preview-logo"], ["logos", "modal:export-logo"],
    ["logo-editor-text", "modal:preview"], ["logo-editor-draw", "modal:preview"], ["logo-editor-image", "modal:preview"],
    ["marketplace", "mine"], ["marketplace", "modal:marketplace-detail"], ["marketplace", "modal:marketplace-submit"],
    ["polls", "results"], ["polls", "modal:recipient-picker"], ["polls", "modal:display-qr"], ["polls", "modal:vote-qr-large"],
  ];
  const requiredMobileStates = [
    ["friends", "list"], ["subscribers", "list"],
    ["game-editor", "question"], ["game-editor", "answers"],
    ["polls", "anonymous"], ["polls", "recipients"],
  ];
  for (const profile of profiles) {
    const profileEntries = entries.filter((entry) => entry.profile === profile);
    const pageEntries = profileEntries.filter((entry) => !entry.stateId);
    const pageIds = new Set(pageEntries.map((entry) => entry.id));
    const guardedPages = new Set(pageEntries.filter((entry) => entry.blockedByGuard).map((entry) => entry.id));
    const pageById = new Map(pageEntries.map((entry) => [entry.id, entry]));
    const profileRequiredPages = profile === "tv"
      ? ["home", "login", "connect-tv", "maintenance", "404"]
      : requiredPages;
    const missingPages = profileRequiredPages.filter((id) => !pageIds.has(id));
    const capturedStates = new Set(profileEntries.filter((entry) => entry.stateId).map((entry) => `${entry.id}:${entry.stateId}`));
    const compactMobile = profile === "ipad-portrait" || profile.startsWith("iphone-");
    const expectedStates = profile === "tv" ? [] : [
      ...requiredStates.filter(([page, state]) => !guardedPages.has(page)
        && !pageById.get(page)?.unavailableStates?.includes(state)),
      ...(!guardedPages.has("control") ? [["control", "modal:share-device"]] : []),
      ...(compactMobile ? requiredMobileStates.filter(([page]) => !guardedPages.has(page)) : []),
    ];
    const missingStates = expectedStates.filter(([page, state]) => !capturedStates.has(`${page}:${state}`))
      .map(([page, state]) => `${page}/${state}`);
    if (missingPages.length || missingStates.length) {
      const details = [
        missingPages.length ? `widoki: ${missingPages.join(", ")}` : "",
        missingStates.length ? `stany: ${missingStates.join(", ")}` : "",
      ].filter(Boolean).join("; ");
      throw new Error(`Niekompletna galeria E20 dla ${profile}; brakuje ${details}`);
    }
  }
}

for (const entry of entries) {
  if (path.posix.dirname(entry.file) !== entry.id) {
    throw new Error(`Zrzut ${entry.file} nie należy do folderu swojej strony (${entry.id}/).`);
  }
  const file = path.join(root, entry.file);
  if (!entry.file.endsWith(".png") || !fs.existsSync(file)) throw new Error(`Brak zrzutu PNG: ${entry.file}`);
}
const pages = [...new Set(entries.map((entry) => entry.id))];
const modals = entries.filter((entry) => String(entry.stateId || "").startsWith("modal:")).length;
console.log(`Zweryfikowano ${entries.length} zrzutów PNG (${modals} modalów otwartych przez interfejs) na ${pages.length} stronach. Artefakt zawiera wyłącznie foldery stron i obrazy.`);
