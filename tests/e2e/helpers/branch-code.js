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
const CODE_DIRS = ["login/", "shared/", "assets/", "home/", "games/", "bases/", "account/", "settings/", "marketplace/", "polls/", "friends/", "subscribers/", "tasks/", "connect/", "control/", "logo/", "logos/", "manual/", "privacy/", "go/", "mail/", "mails/", "maintenance/", "404/"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function localFileFor(pathname, pages) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel === "404.html" && pages.includes("404")) return path.join(REPO_ROOT, "404.html");
  // Strona główna jest serwowana pod "/", a nie "/index". Bez tego
  // pages:["index"] cicho testowało produkcyjny HTML zamiast pliku z brancha.
  if (!rel && pages.includes("index")) return path.join(REPO_ROOT, "index.html");
  // Główne HTML logowania zwykle zostaje po stronie Workera ze względu na
  // Turnstile; galeria E20 przechwytuje je jawnie. Strony potwierdzenia i
  // resetu nie korzystają z Turnstile, więc bierzemy ich HTML z brancha.
  if (rel.startsWith("login/") && !/\.(js|css)$/.test(rel)) {
    const loginPage = rel.replace(/\/$/, "");
    if (loginPage !== "login" && pages.includes(loginPage)) return path.join(REPO_ROOT, `${loginPage}/index.html`);
    return null;
  }
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
    // Nested page folders such as /logos/editor/draw/ have their own
    // index.html. Resolve that before the SPA fallback to /logos/index.html.
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
      const applyInsets = () => {
        const root = document.documentElement;
        if (!root) return;
        for (const side of ["top", "right", "bottom", "left"]) {
          root.style.setProperty(`--e20-safe-area-inset-${side}`, `${Number(insets[side]) || 0}px`);
        }
        root.dataset.e20SafeAreaInjected = "true";
      };
      if (document.documentElement) applyInsets();
      else document.addEventListener("DOMContentLoaded", applyInsets, { once: true });
    }, safeAreaInsets);
  }
  await context.route(`${PROD_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const file = localFileFor(url.pathname, pages);
    // Pozwól kolejnym handlerom Playwrighta dodać np. kontrolowany bypass
    // konserwacji dla testu; bez nich fallback zachowuje zwykłe żądanie sieciowe.
    if (!file) return route.fallback();
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

async function serveBranchLoginHtml(route) {
  let productionResponse;
  let testSiteKey = "";
  // route.fetch() does not reliably inherit browser context extra headers.
  // Forward the actual navigation headers so the Worker can validate the
  // one-time E2E bypass token and inject the Turnstile test key.
  const requestHeaders = await route.request().allHeaders();
  for (let attempt = 1; attempt <= 3; attempt++) {
    productionResponse = await route.fetch({ headers: requestHeaders });
    const productionHtml = await productionResponse.text();
    testSiteKey = productionHtml.match(/data-captcha-site-key="([^"]*)"/)?.[1] || "";
    if (testSiteKey) break;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  if (!testSiteKey) {
    throw new Error(`Worker nie zwrócił testowego klucza Turnstile dla sesji E2E po 3 próbach (HTTP ${productionResponse?.status?.() ?? "brak odpowiedzi"})`);
  }
  const file = path.join(REPO_ROOT, "login", "index.html");
  const html = fs.readFileSync(file, "utf8").replace(/data-captcha-site-key="[^"]*"/, `data-captcha-site-key="${testSiteKey}"`);
  await route.fulfill({ response: productionResponse, headers: { "cache-control": "no-store" }, body: html });
}

module.exports = { serveBranchCode, serveBranchLoginHtml, localFileFor };
