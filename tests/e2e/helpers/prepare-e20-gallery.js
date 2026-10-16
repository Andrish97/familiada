// Zaloguj istniejące konta przydzielone do galerii i zapisz wyłącznie stan
// sesji oraz identyfikatory danych już obecnych na tych kontach.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { loginAsTestUser } = require("./login");
const { serveBranchCode, serveBranchLoginHtml } = require("./branch-code");
const { readE20GalleryData } = require("./e20-gallery-data");
const { galleryAccountNumbers, galleryAccountPaths, PREP_DIR } = require("./e20-gallery-accounts");

const MANIFEST_DIR = path.join(PREP_DIR, "familiada-e20-gallery-manifests");
const PAGES = [
  "index", "account", "bases", "bases/explorer", "connect", "connect/tv",
  "control", "games",
  "games/editor", "games/settings", "friends", "go", "login", "login/confirm",
  "login/reset", "logos", "logos/editor/draw", "logos/editor/image", "logos/editor/text",
  "mails", "maintenance", "manual", "marketplace", "polls", "polls/vote/points",
  "polls/vote/qr", "polls/vote/text", "privacy", "subscribers", "tasks", "404",
];

async function main() {
  const accounts = galleryAccountNumbers();
  const browser = await chromium.launch();
  try {
    fs.rmSync(MANIFEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });
    for (const accountNumber of accounts) {
      const files = galleryAccountPaths(accountNumber);
      const context = await browser.newContext({ serviceWorkers: "block" });
      try {
        await serveBranchCode(context, { pages: PAGES });
        await context.route(/^https:\/\/www\.familiada\.online\/login\/?(?:\?.*)?$/, serveBranchLoginHtml);
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        page.setDefaultNavigationTimeout(20_000);
        // Pytanie o ocenę jest niezwiązane z widokami E20 i blokuje każdy
        // prywatny route, dopóki nie dostanie odpowiedzi. Pozostawiamy jego
        // standardowe wyciszenie dla kont testowych, jak w pozostałych testach.
        await loginAsTestUser(page, context, { username: files.username });
        await page.goto("https://www.familiada.online/games/?lang=pl", { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(window.__sbClient), null, { timeout: 20_000 });
        const data = await readE20GalleryData(page);
        fs.writeFileSync(files.data, JSON.stringify(data, null, 2));
        await context.storageState({ path: files.authState });
        console.log(`[e20-gallery] ${files.username}: sesja zapisana, odczytano istniejące rekordy bez zmian.`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[e20-gallery] Nie udało się przygotować sesji i odczytać danych konta:", error);
  process.exitCode = 1;
});
