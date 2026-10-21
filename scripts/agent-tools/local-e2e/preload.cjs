// Lokalne zaplecze e2e (preload: NODE_OPTIONS=--require, patrz README.md):
// www.familiada.online -> pliki web/ z dysku, api.familiada.online/rest/v1 ->
// lokalny PostgREST, /auth/v1 -> atrapa logowania (JWT podpisany lokalnie).
// Sieć produkcyjna nie jest używana: inne hosty są odcinane.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const REPO = process.env.LB_REPO || path.resolve(__dirname, "../../..");
const WEB = path.join(REPO, "web");
const PGRST = process.env.LB_PGRST || "http://127.0.0.1:3555";
const CACHE = path.join(require("node:os").homedir(), ".cache", "familiada-local-e2e");
const SECRET = process.env.LB_SECRET || "local-test-secret-local-test-secret-123456";
const SBJS = process.env.LB_SBJS || path.join(CACHE, "supabase-js/package/dist/umd/supabase.js");
const PSQL = ["-h", process.env.LB_PGHOST || "/var/tmp/pgfam", "-p", "5499", "-U", "postgres", "-d", "fam", "-qtA", "-c"];

const b64u = (b) => Buffer.from(b).toString("base64url");
function jwt(claims) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify(claims));
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
function uidFor(email) {
  const hx = crypto.createHash("sha1").update(String(email).toLowerCase()).digest("hex");
  return `${hx.slice(0, 8)}-${hx.slice(8, 12)}-4${hx.slice(13, 16)}-8${hx.slice(17, 20)}-${hx.slice(20, 32)}`;
}
const known = new Set();
function ensureUser(email) {
  const id = uidFor(email);
  if (!known.has(id)) {
    const login = String(email).split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
    execFileSync("psql", [...PSQL, `insert into auth.users(id,email) values ('${id}','${email}') on conflict do nothing;
      insert into public.profiles(id,username,email) values ('${id}','${login}','${email}') on conflict (id) do nothing;`]);
    known.add(id);
  }
  return id;
}
function session(email) {
  const id = ensureUser(email);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id, email, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", email_confirmed_at: "2026-01-01T00:00:00Z" };
  return { access_token: jwt({ sub: id, email, role: "authenticated", aud: "authenticated", exp }), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: b64u(email), user };
}
function userFromAuth(header) {
  try {
    const p = JSON.parse(Buffer.from(String(header).split(" ")[1].split(".")[1], "base64url"));
    return session(p.email).user;
  } catch { return null; }
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ttf": "font/ttf", ".mp3": "audio/mpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });

  if (url.hostname === "api.familiada.online") {
    if (url.pathname.startsWith("/rest/v1")) {
      const target = PGRST + url.pathname.slice("/rest/v1".length) + url.search;
      const headers = { ...req.headers() };
      delete headers.apikey;
      if (!/^Bearer ey/.test(headers.authorization || "") || !userFromAuth(headers.authorization)) delete headers.authorization;
      const res = await route.fetch({ url: target, headers });
      return route.fulfill({ response: res, headers: { ...res.headers(), ...CORS } });
    }
    if (url.pathname.startsWith("/auth/v1/token")) {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch {}
      const email = body.email || (body.refresh_token ? Buffer.from(body.refresh_token, "base64url").toString() : "");
      return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(session(email)) });
    }
    if (url.pathname.startsWith("/auth/v1/user")) {
      const u = userFromAuth(req.headers().authorization);
      return route.fulfill({ status: u ? 200 : 401, headers: CORS, contentType: "application/json", body: JSON.stringify(u || { message: "no" }) });
    }
    if (url.pathname.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: "{}" });
  }

  if (url.hostname === "www.familiada.online" || url.hostname === "familiada.online") {
    let p = decodeURIComponent(url.pathname);
    if (p.startsWith("/api/")) return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: "{}" });
    if (!p.endsWith("/") && !path.extname(p) && fs.existsSync(path.join(WEB, p, "index.html"))) p += "/";
    if (p.endsWith("/")) p += "index.html";
    let file = path.join(WEB, p);
    if (!fs.existsSync(file) && fs.existsSync(path.join(file, "index.html"))) file = path.join(file, "index.html");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: "Not found" });
    return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  }

  if (/\/npm\/@supabase\/supabase-js/.test(url.pathname) && fs.existsSync(SBJS)) {
    return route.fulfill({ status: 200, contentType: "text/javascript", headers: CORS, body: fs.readFileSync(SBJS) });
  }
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "unpkg.com") return route.continue().catch(() => route.abort());
  return route.abort();
}

async function install(context) {
  await context.route("**/*", (route) => {
    // diagnostyka wiszących żądań (networkidle): tylko host i ścieżka, bez treści
    const u = new URL(route.request().url());
    const t0 = Date.now();
    const slow = setTimeout(() => console.log(`[lb] wolne >5s: ${route.request().method()} ${u.hostname}${u.pathname}`), 5000);
    return handle(route)
      .catch((e) => { console.log("[lb] route error", e.message); return route.abort().catch(() => {}); })
      .finally(() => { clearTimeout(slow); if (Date.now() - t0 > 5000) console.log(`[lb] koniec po ${Date.now() - t0} ms: ${u.hostname}${u.pathname}`); });
  });
}

// Podpięcie do każdego nowego kontekstu Playwrighta.
const pw = require(path.join(REPO, "tests/node_modules/playwright-core"));
function patchBrowserProto(proto) {
  if (proto.__lb) return;
  proto.__lb = true;
  for (const name of ["newContext", "_newContextForReuse"]) {
    const orig = proto[name];
    if (!orig) continue;
    proto[name] = async function (...args) {
      const ctx = await orig.apply(this, args);
      if (!ctx.__lb) { ctx.__lb = true; await install(ctx); }
      return ctx;
    };
  }
}
const BT = Object.getPrototypeOf(pw.chromium);
const origLaunch = BT.launch;
BT.launch = async function (...a) {
  a[0] = { ...(a[0] || {}), executablePath: process.env.LB_CHROME || "/opt/pw-browsers/chromium" };
  const b = await origLaunch.apply(this, a);
  patchBrowserProto(Object.getPrototypeOf(b));
  return b;
};
module.exports = { install, uidFor };

// Logowanie bez ekranu /login (Turnstile wstrzykuje Worker, którego tu nie ma):
// sesja od razu w localStorage, jak po prawdziwym logowaniu.
const loginHelpers = require(path.join(REPO, "tests/e2e/helpers/login.js"));
const origInstrument = loginHelpers.instrumentPage;
loginHelpers.loginAsTestUser = async function (page, context, opts = {}) {
  const email = opts.username || loginHelpers.testAccountUsername(1);
  const s = session(email);
  await context.addInitScript(({ key, value }) => {
    try {
      if (!sessionStorage.getItem("__lb_set")) {
        localStorage.setItem(key, value);
        localStorage.setItem("uiLang", "pl");
        localStorage.setItem("fam:app_rating_suppressed", "true");
        sessionStorage.setItem("__lb_set", "1");
      }
    } catch {}
  }, { key: "sb-api-auth-token", value: JSON.stringify(s) });
  if (typeof origInstrument === "function") origInstrument(page);
  await page.goto(opts.expectUrl && typeof opts.expectUrl === "string" ? opts.expectUrl : "https://www.familiada.online/games/", { waitUntil: "domcontentloaded" });
};
