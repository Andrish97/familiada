// tests/e2e/helpers/branch-code.js
// "Kopia" strony do testów bez wdrażania: prawdziwa produkcja (konta testowe,
// prawdziwa baza, Worker, Turnstile-bypass), ale wybrane strony oraz CAŁY
// kod front-endu (js/, css/, translation/, shared/) serwowane z plików tego
// repo -- czyli z brancha, na którym odpalono workflow. Dzięki temu poprawki
// można sprawdzić na prawdziwym backendzie ZANIM trafią na main/produkcję.
//
// Strona logowania zawsze idzie z produkcji (Worker podmienia w niej sitekey
// Turnstile dla tokenu e2e -- patrz tests/README.md), stąd jawna lista stron.
// Service worker musi być zablokowany (test.use({ serviceWorkers: "block" })),
// inaczej obsłużyłby żądania z własnego cache z pominięciem page.route.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PROD_ORIGIN = "https://www.familiada.online";
const CODE_DIRS = ["js/", "css/", "translation/", "shared/"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function localFileFor(pathname, pages) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const page = rel.replace(/\.html$/, "");
  if (pages.includes(page)) return path.join(REPO_ROOT, `${page}.html`);
  if (!CODE_DIRS.some((d) => rel.startsWith(d))) return null;
  const abs = path.join(REPO_ROOT, rel);
  if (!abs.startsWith(REPO_ROOT + path.sep)) return null;
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ pages: string[] }} opts  np. { pages: ["bases"] } -> /bases z repo
 */
async function serveBranchCode(context, { pages }) {
  await context.route(`${PROD_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const file = localFileFor(url.pathname, pages);
    if (!file) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: MIME[path.extname(file)] || "application/octet-stream",
      headers: { "cache-control": "no-store" },
      body: fs.readFileSync(file),
    });
  });
}

module.exports = { serveBranchCode };
