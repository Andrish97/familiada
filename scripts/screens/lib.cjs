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
  const reqUrl = new URL(req.url, "http://x");
  let pathname = decodeURIComponent(reqUrl.pathname);
  // Ramka dla stron, które w trybie podglądu przyjmują stan tylko od rodzica
  // (Prowadzący ?preview=1): /__screens__/frame.html?src=/control/host/?preview=1
  if (pathname === "/__screens__/frame.html") {
    const src = reqUrl.searchParams.get("src") || "/";
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}iframe{display:block;border:0;width:100%;height:100%}</style><iframe id="screensFrame" src="${src.replace(/"/g, "&quot;")}"></iframe>`);
  }
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

// Emulacja strefy bezpiecznej urządzenia (notch, pasek gestu): Chromium nie
// pozwala ustawić env(safe-area-inset-*), więc w CSS/HTML strony zamieniamy
// je na piksele. safe = { top, right, bottom, left }.
async function emulateSafeArea(context, origin, safe) {
  const sides = { top: 0, right: 0, bottom: 0, left: 0, ...safe };
  const rewrite = (text) => text.replace(/env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,[^)]*)?\)/g, (_, side) => `${sides[side]}px`);
  await context.route((url) => url.href.startsWith(origin) && /\.(css|html)$|\/$/.test(url.pathname), async (route) => {
    const response = await route.fetch();
    const type = response.headers()["content-type"] || "";
    if (!/text\/(css|html)/.test(type)) return route.fulfill({ response });
    return route.fulfill({ response, body: rewrite(await response.text()) });
  });
}

// Ramka iPhone'a na czarnym tle (jak kadr głosowania w dawnym panelu admina:
// web/settings/js/homepage-screenshots.js, composeIPhoneFrame). screen -- PNG
// ekranu telefonu; wynik -- PNG outputWidth × outputHeight.
async function composeIPhone(browser, screen, outputWidth = 1440, outputHeight = 900, scale = 1) {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const data = await page.evaluate(async ({ src, outputWidth, outputHeight, scale }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = outputWidth * scale; const H = outputHeight * scale;
    const frameRatio = 0.0485;
    const screenScale = H / (img.height + 2 * img.width * frameRatio / (1 - 2 * frameRatio) + 2 * scale);
    const screenWidth = img.width * screenScale;
    const screenHeight = img.height * screenScale;
    const whiteEdge = scale;
    const bezelBlack = screenWidth * frameRatio / (1 - 2 * frameRatio);
    const bezel = bezelBlack + whiteEdge;
    const deviceWidth = screenWidth + 2 * bezel;
    const deviceX = (W - deviceWidth) / 2;
    const cornerRadius = deviceWidth * 0.16;
    const unit = screenWidth / 390; // 1 pkt ekranu iPhone'a
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const rounded = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); };
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.shadowColor = "#000b"; ctx.shadowBlur = 24 * scale;
    rounded(deviceX, 0, deviceWidth, H, cornerRadius); ctx.fillStyle = "#d7d9df"; ctx.fill(); ctx.restore();
    rounded(deviceX + whiteEdge, whiteEdge, deviceWidth - 2 * whiteEdge, H - 2 * whiteEdge, cornerRadius - whiteEdge); ctx.fillStyle = "#030407"; ctx.fill();
    const sx = deviceX + bezel; const sy = bezel;
    ctx.save(); rounded(sx, sy, screenWidth, screenHeight, cornerRadius - bezel); ctx.clip();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, screenWidth, screenHeight);
    const notchW = screenWidth * 0.41; const notchH = screenHeight * 0.04; const nx = sx + (screenWidth - notchW) / 2; const curve = 22 * unit;
    ctx.beginPath(); ctx.moveTo(nx, sy); ctx.lineTo(nx + notchW, sy); ctx.lineTo(nx + notchW, sy + notchH - curve);
    ctx.quadraticCurveTo(nx + notchW, sy + notchH, nx + notchW - curve, sy + notchH); ctx.lineTo(nx + curve, sy + notchH);
    ctx.quadraticCurveTo(nx, sy + notchH, nx, sy + notchH - curve); ctx.closePath(); ctx.fillStyle = "#030407"; ctx.fill();
    ctx.fillStyle = "#111318"; ctx.beginPath(); ctx.roundRect(nx + notchW * 0.72, sy + notchH * 0.34, notchW * 0.15, notchH * 0.15, 5 * unit); ctx.fill();
    ctx.fillStyle = "#08090c"; ctx.beginPath(); ctx.arc(nx + notchW * 0.72 - 28 * unit, sy + notchH * 0.415, 5 * unit, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffffa8"; ctx.beginPath(); ctx.roundRect(sx + (screenWidth - screenWidth * 0.344) / 2, sy + screenHeight - 13 * unit, screenWidth * 0.344, 5 * unit, 99); ctx.fill();
    ctx.restore();
    return canvas.toDataURL("image/png");
  }, { src: `data:image/png;base64,${screen.toString("base64")}`, outputWidth, outputHeight, scale });
  await page.close();
  return Buffer.from(data.split(",")[1], "base64");
}

module.exports = { repo, startServer, stopServer, launch, newContext, emulateSafeArea, composeIPhone };
