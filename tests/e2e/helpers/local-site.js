// tests/e2e/helpers/local-site.js
//
// Serwuje KOD Z BIEŻĄCEGO CHECKOUTU (gałąź, na której odpalono workflow)
// z lokalnego serwera w runnerze, zamiast www.familiada.online (tam jest
// tylko `main`). Backend (Supabase: baza, RPC, blokady, Storage) jest
// prawdziwy -- ten sam co na produkcji.
//
// Logowanie: zwykłe loginAsTestUser() na produkcyjnym /login (z obejściem
// Turnstile), a potem kopiujemy sesję Supabase (klucze sb-* z localStorage)
// na origin lokalnego serwera. Sesja jest związana z projektem Supabase,
// nie z domeną strony, więc działa bez zmian.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { loginAsTestUser, instrumentPage } = require("./login");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};

// Jak GitHub Pages: /games -> games.html, /dir/ -> dir/index.html.
function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  if (p.includes("..")) return null;
  const abs = path.join(REPO_ROOT, p);
  const candidates = p.endsWith("/")
    ? [path.join(abs, "index.html")]
    : [abs, `${abs}.html`, path.join(abs, "index.html")];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      // next
    }
  }
  return null;
}

/** Startuje serwer na losowym porcie. Zwraca { origin, close() }. */
async function startLocalSite() {
  const server = http.createServer((req, res) => {
    const file = resolveFile(req.url || "/");
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Loguje RAZ (osobny kontekst) i zwraca klucze sesji Supabase (sb-*) --
 * do przekazania do useSession() w każdym teście pliku, zamiast logowania
 * przez formularz przed każdym testem.
 */
async function captureSession(browser, username) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAsTestUser(page, context, username ? { username } : {});
    const entries = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sb-")) out[k] = localStorage.getItem(k);
      }
      return out;
    });
    if (!Object.keys(entries).length) throw new Error("Po zalogowaniu brak sesji sb-* w localStorage");
    return entries;
  } finally {
    await context.close();
  }
}

/** Wstrzykuje zapisaną sesję na lokalny origin (przed pierwszym skryptem strony). */
async function useSession(context, origin, entries, { lang = "pl" } = {}) {
  await context.addInitScript(({ origin, entries, lang }) => {
    if (location.origin !== origin) return;
    try {
      for (const [k, v] of Object.entries(entries)) {
        if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
      }
      localStorage.setItem("fam:app_rating_suppressed", "true");
      if (localStorage.getItem("uiLang") == null) localStorage.setItem("uiLang", lang);
    } catch {
      // ignore
    }
  }, { origin, entries, lang });
}

/**
 * Loguje konto testowe na produkcji i przenosi sesję na lokalny origin.
 * Po powrocie `page` jest na `${origin}${startPath}`.
 */
async function loginToLocalSite(page, context, origin, { username, startPath = "/" } = {}) {
  await loginAsTestUser(page, context, username ? { username } : {});

  const entries = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-")) out[k] = localStorage.getItem(k);
    }
    return out;
  });
  if (!Object.keys(entries).length) throw new Error("Po zalogowaniu brak sesji sb-* w localStorage");

  // Tylko gdy klucza jeszcze nie ma -- nie nadpisujemy odświeżonego tokenu
  // przy kolejnych nawigacjach w tym samym teście.
  await context.addInitScript(({ origin, entries }) => {
    if (location.origin !== origin) return;
    try {
      for (const [k, v] of Object.entries(entries)) {
        if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
      }
      localStorage.setItem("fam:app_rating_suppressed", "true");
      localStorage.setItem("uiLang", "pl");
    } catch {
      // ignore
    }
  }, { origin, entries });

  await page.goto(`${origin}${startPath}`, { waitUntil: "domcontentloaded" });
}

module.exports = { startLocalSite, loginToLocalSite, captureSession, useSession, instrumentPage, REPO_ROOT };
