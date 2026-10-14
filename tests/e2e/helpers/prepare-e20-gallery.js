// Przygotuj jedno konto i jedną sesję przed uruchomieniem pięciu profili.
// Dzięki temu profile nie ścigają się przy logowaniu ani tworzeniu fixture'ów.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("@playwright/test");
const { restoreTestAccount } = require("./mailbox");
const { loginAsTestUser, galleryTestAccountUsername } = require("./login");
const { serveBranchCode } = require("./branch-code");
const { seedE20GalleryFixtures } = require("./e20-gallery-fixtures");

const OUT = path.resolve(__dirname, "../../test-results/e20-gallery");
const PREP_DIR = process.env.RUNNER_TEMP || os.tmpdir();
const AUTH_STATE_PATH = path.join(PREP_DIR, "familiada-e20-gallery-auth.json");
const FIXTURES_PATH = path.join(PREP_DIR, "familiada-e20-gallery-fixtures.json");
const MANIFEST_DIR = path.join(PREP_DIR, "familiada-e20-gallery-manifests");
const PAGES = [
  "index", "account", "bases", "bases/explorer", "connect", "connect/tv",
  "control", "control/buzzer", "control/display", "control/host", "games",
  "games/editor", "games/settings", "friends", "go", "login", "login/confirm",
  "login/reset", "logos", "logos/editor/draw", "logos/editor/image", "logos/editor/text",
  "mails", "maintenance", "manual", "marketplace", "polls", "polls/vote/points",
  "polls/vote/qr", "polls/vote/text", "privacy", "settings", "subscribers", "tasks", "404",
];

async function main() {
  await restoreTestAccount("test17");
  const browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    await serveBranchCode(context, { pages: PAGES });
    await context.route(/^https:\/\/www\.familiada\.online\/login\/?$/, async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(/data-captcha-site-key="[^"]*"/, 'data-captcha-site-key=""');
      await route.fulfill({ response, body: html });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(20_000);
    await loginAsTestUser(page, context, { username: galleryTestAccountUsername() });
    const fixtures = await seedE20GalleryFixtures(page);
    fs.rmSync(MANIFEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log("[e20-gallery] Konto test17 zalogowane raz; fixture'y i stan sesji gotowe.");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[e20-gallery] Nie udało się przygotować konta i fixture'ów:", error);
  process.exitCode = 1;
});
