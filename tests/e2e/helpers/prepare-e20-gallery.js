// Zaloguj istniejące konta przydzielone do galerii i przygotuj fixture'y raz,
// przed zdjęciami. Konta nie są tworzone ani resetowane.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { loginAsTestUser } = require("./login");
const { serveBranchCode } = require("./branch-code");
const { seedE20GalleryFixtures } = require("./e20-gallery-fixtures");
const { galleryAccountNumbers, galleryAccountPaths, PREP_DIR } = require("./e20-gallery-accounts");

const OUT = path.resolve(__dirname, "../../test-results/e20-gallery");
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
  const accounts = galleryAccountNumbers();
  const browser = await chromium.launch();
  try {
    fs.rmSync(MANIFEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });
    fs.mkdirSync(OUT, { recursive: true });
    for (const accountNumber of accounts) {
      const files = galleryAccountPaths(accountNumber);
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
        await loginAsTestUser(page, context, { username: files.username });
        const fixtures = await seedE20GalleryFixtures(page);
        fs.writeFileSync(files.fixtures, JSON.stringify(fixtures, null, 2));
        await context.storageState({ path: files.authState });
        console.log(`[e20-gallery] Istniejące ${files.username} zalogowane raz; fixture'y gotowe.`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[e20-gallery] Nie udało się przygotować konta i fixture'ów:", error);
  process.exitCode = 1;
});
