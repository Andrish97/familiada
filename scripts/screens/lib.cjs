// Wspólne części zrzutów i wypalania logo: Playwright, serwer web/, CDN, kontekst z atrapą.
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const webRoot = path.join(repo, "web");

function loadPlaywright() {
  for (const id of [path.join(repo, "tests/node_modules/playwright"), path.join(repo, "tests/node_modules/@playwright/test"), "playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(id); } catch {}
  }
  throw new Error("Brak Playwrighta: cd tests && npm ci");
}

// ---------- biblioteki z CDN (lokalnie CDN bywa zablokowany) ----------
const cacheDir = path.join(os.homedir(), ".cache", "familiada-screens");
function vendorFile(pkg, version, file) {
  const dir = path.join(cacheDir, `${pkg.replace("/", "__")}@${version}`);
  const target = path.join(dir, "package", file);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(dir, { recursive: true });
    try {
      const tgz = execSync(`npm pack ${pkg}@${version} --silent`, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").pop();
      execSync(`tar xzf ${JSON.stringify(tgz)}`, { cwd: dir });
    } catch { return null; }
  }
  return fs.existsSync(target) ? fs.readFileSync(target) : null;
}
async function routeCdn(route) {
  const url = new URL(route.request().url());
  if (/\/npm\/@supabase\/supabase-js/.test(url.pathname)) return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(__dirname, "fake-supabase.js")) });
  if (/\/npm\/qrcode@1\.5\.3\/\+esm/.test(url.pathname)) return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(repo, "scripts/agent-tools/qrcode.esm.js")) });
  const m = url.pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/);
  if (m && !m[3].startsWith("+esm")) {
    const body = vendorFile(m[1], m[2], m[3]);
    if (body) return route.fulfill({ contentType: m[3].endsWith(".css") ? "text/css" : "text/javascript", body });
  }
  return route.continue().catch(() => route.abort());
}

// ---------- serwer plików web/ ----------
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".mp3": "audio/mpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  res.on("error", () => {});
  let pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  let file = path.resolve(webRoot, `.${pathname}`);
  if (!file.startsWith(webRoot)) return res.writeHead(403).end();
  if (!fs.existsSync(file) && fs.existsSync(path.join(file, "index.html"))) file = path.join(file, "index.html");
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end("Not found");
  res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});

async function startServer() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
function stopServer() { server.close(); }

async function launch() {
  const { chromium } = loadPlaywright();
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

// Kontekst przeglądarki z atrapą Supabase i danymi db (buildDb z data/demo.cjs).
async function newContext(browser, db, lang, device) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height }, deviceScaleFactor: device.scale,
    isMobile: device.mobile, hasTouch: device.mobile, locale: { pl: "pl-PL", en: "en-GB", uk: "uk-UA" }[lang],
    timezoneId: "Europe/Warsaw",
  });
  await context.addInitScript(({ db, lang }) => {
    window.__SCREENS_DB__ = db;
    try {
      localStorage.setItem("uiLang", lang);
      localStorage.setItem("fam:app_rating_suppressed", "true");
      for (const [k, v] of Object.entries(db.localStorage || {})) localStorage.setItem(k, v);
    } catch {}
  }, { db, lang });
  await context.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//, routeCdn);
  await context.route(/^https:\/\/(?!cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/, (route) => route.abort());
  for (const [pattern, body] of Object.entries(db.http || {})) {
    await context.route(`**${pattern}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }));
  }
  return context;
}

module.exports = { repo, startServer, stopServer, launch, newContext };
