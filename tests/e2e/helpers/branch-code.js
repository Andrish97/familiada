// tests/e2e/helpers/branch-code.js
// "Kopia" strony do testów bez wdrażania: prawdziwa produkcja (konta testowe,
// prawdziwa baza, Worker, Turnstile-bypass), ale wybrane strony oraz CAŁY
// kod front-endu (js/, css/, translation/, web/js/gameplay/, base-explorer/) serwowane z plików tego
// repo -- czyli z brancha, na którym odpalono workflow. Dzięki temu poprawki
// można sprawdzić na prawdziwym backendzie ZANIM trafią na main/produkcję.
//
// Strona logowania zawsze idzie z produkcji (Worker podmienia w niej sitekey
// Turnstile dla tokenu e2e -- patrz tests/README.md), stąd jawna lista stron.
// Service worker musi być zablokowany (test.use({ serviceWorkers: "block" })),
// inaczej obsłużyłby żądania z własnego cache z pominięciem page.route.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "web");
const PROD_ORIGIN = "https://www.familiada.online";
// base-explorer/ -- JS i CSS bazy pytań leżą obok strony, nie w js/ i css/
const CODE_DIRS = ["login/", "shared/", "assets/", "home/", "games/", "bases/", "account/", "settings/", "marketplace/", "polls/", "friends/", "subscribers/", "tasks/", "connect/", "control/", "logo/", "manual/", "privacy/", "go/", "mail/", "maintenance/", "404/"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function localFileFor(pathname, pages) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel === "404.html" && pages.includes("404")) return path.join(REPO_ROOT, "404.html");
  // Strona główna jest serwowana pod "/", a nie "/index". Bez tego
  // pages:["index"] cicho testowało produkcyjny HTML zamiast pliku z brancha.
  if (!rel && pages.includes("index")) return path.join(REPO_ROOT, "index.html");
  // Login HTML stays with Worker Turnstile; its JS/CSS can come from branch.
  if (rel.startsWith("login/") && !/\.(js|css)$/.test(rel)) return null;
  const page = rel.replace(/\.html$/, "").replace(/\/$/, "");
  if (pages.includes(page)) return path.join(REPO_ROOT, `${page}/index.html`);
  // Trasy typu /marketplace/game/<slug> są obsługiwane przez tę samą stronę
  // SPA. Bez tego deep-link w teście brał HTML produkcyjny zamiast z brancha.
  // Najpierw prawdziwy plik z repo (np. /subscriptions/js/subscriptions.js):
  // bez tego reguła trasy SPA niżej oddawała HTML strony zamiast skryptu
  // strony leżącego w jej folderze („Failed to load module script”).
  if (CODE_DIRS.some((d) => rel.startsWith(d))) {
    const abs = path.join(REPO_ROOT, rel);
    if (abs.startsWith(REPO_ROOT + path.sep) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    // Nested page folders such as /logo/editor/draw/ have their own
    // index.html. Resolve that before the SPA fallback to /logo/index.html.
    const nestedIndex = path.join(REPO_ROOT, rel, "index.html");
    if (nestedIndex.startsWith(REPO_ROOT + path.sep) && fs.existsSync(nestedIndex) && fs.statSync(nestedIndex).isFile()) return nestedIndex;
  }
  const routedPage = pages.find((name) => rel.startsWith(`${name}/`));
  if (routedPage) return path.join(REPO_ROOT, `${routedPage}/index.html`);
  return null;
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ pages: string[] }} opts  np. { pages: ["bases"] } -> /bases z repo
 */
async function serveBranchCode(context, { pages, safeAreaInsets = null }) {
  if (safeAreaInsets) {
    await context.addInitScript((insets) => {
      for (const side of ["top", "right", "bottom", "left"]) {
        document.documentElement.style.setProperty(`--e20-safe-area-inset-${side}`, `${Number(insets[side]) || 0}px`);
      }
    }, safeAreaInsets);
  }
  await context.route(`${PROD_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const file = localFileFor(url.pathname, pages);
    if (!file) return route.continue();
    let body = fs.readFileSync(file);
    if (safeAreaInsets && path.extname(file) === ".css") {
      body = body.toString("utf8").replace(/env\(\s*safe-area-inset-(top|right|bottom|left)(?:\s*,\s*[^)]+)?\s*\)/g,
        (_match, side) => `var(--e20-safe-area-inset-${side}, 0px)`);
    }
    return route.fulfill({
      status: 200,
      contentType: MIME[path.extname(file)] || "application/octet-stream",
      headers: { "cache-control": "no-store" },
      body,
    });
  });
}

module.exports = { serveBranchCode, localFileFor };
