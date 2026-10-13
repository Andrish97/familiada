// Pełna galeria stron E20 na prawdziwym backendzie produkcyjnym.
// Front ładowany jest z badanego brancha; Supabase, Worker i poczta pozostają
// rzeczywiste. Dane seedujemy idempotentnie na dedykowanym koncie test17.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { test, expect } = require("./helpers/production-test");
const { serveBranchCode } = require("./helpers/branch-code");

const ORIGIN = "https://www.familiada.online";
const OUT = path.resolve(__dirname, "../test-results/e20-gallery");
const FIXTURES_PATH = path.join(OUT, "fixtures.json");
const AUTH_STATE_PATH = path.join(os.tmpdir(), "familiada-e20-gallery-auth.json");
const PAGES = [
  "index", "account", "bases", "bases/explorer", "connect", "connect/tv",
  "control", "control/buzzer", "control/display", "control/host", "games",
  "games/editor", "games/settings", "friends", "go", "login", "login/confirm",
  "login/reset", "logos", "logos/editor/draw", "logos/editor/image", "logos/editor/text",
  "mails", "maintenance", "manual", "marketplace", "polls", "polls/vote/points",
  "polls/vote/qr", "polls/vote/text", "privacy", "settings", "subscribers", "tasks", "404",
];

const PROFILES = [
  { id: "macbook", label: "MacBook", width: 1440, height: 900, scale: 2, mobile: false, touch: false, safe: null },
  { id: "ipad-portrait", label: "iPad mini 7 pionowo", width: 744, height: 1133, scale: 2, mobile: true, touch: true, ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: "ipad-landscape", label: "iPad mini 7 poziomo", width: 1133, height: 744, scale: 2, mobile: true, touch: true, ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: "iphone-portrait", label: "iPhone 14 pionowo", width: 390, height: 844, scale: 3, mobile: true, touch: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { id: "iphone-landscape", label: "iPhone 14 poziomo", width: 844, height: 390, screen: { width: 390, height: 844 }, scale: 3, mobile: true, touch: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 0, right: 47, bottom: 21, left: 47 } },
];
const requestedPages = String(process.env.E20_GALLERY_PAGES || "").split(",").map((value) => value.trim()).filter(Boolean);
const requestedProfiles = String(process.env.E20_GALLERY_PROFILES || "").split(",").map((value) => value.trim()).filter(Boolean);

function urls(fixtures) {
  const pollPoints = fixtures.polls.poll_points;
  const pollText = fixtures.polls.poll_text;
  const game = fixtures.game;
  return [
    ["home", "/"], ["account", "/account/"], ["bases", "/bases/"],
    ["base-explorer", `/bases/explorer/?id=${fixtures.base.id}`], ["connect", "/connect/"],
    ["connect-tv", "/connect/tv/"], ["control", `/control/?id=${game.id}`],
    ["buzzer", `/control/buzzer/?id=${game.id}&key=${fixtures.deviceKeys.buzzer}`],
    ["display", `/control/display/?id=${game.id}&key=${fixtures.deviceKeys.display}`],
    ["host", `/control/host/?id=${game.id}&key=${fixtures.deviceKeys.host}`],
    ["games", "/games/"], ["game-editor", `/games/editor/?id=${game.id}`],
    ["game-settings", `/games/settings/?id=${game.id}`], ["friends", "/friends/"],
    ["go", "/go/"], ["login", "/login/"], ["login-confirm", "/login/confirm/"],
    ["login-reset", "/login/reset/"], ["logo", "/logos/"],
    ["logo-draw", `/logos/editor/draw/?id=${fixtures.logo.id}`],
    ["logo-image", `/logos/editor/image/?id=${fixtures.logo.id}`],
    ["logo-text", `/logos/editor/text/?id=${fixtures.logo.id}`],
    ["mail", "/mails/"], ["maintenance", "/maintenance/"], ["manual", "/manual/"],
    ["marketplace", "/marketplace/"], ["polls", `/polls/?id=${pollText.id}`],
    ["poll-vote-points", `/polls/vote/points/?id=${pollPoints.id}&key=${pollPoints.share_key_poll}`],
    ["poll-vote-qr", `/polls/vote/qr/?id=${pollPoints.id}&key=${pollPoints.share_key_poll}`],
    ["poll-vote-text", `/polls/vote/text/?id=${pollText.id}&key=${pollText.share_key_poll}`],
    ["privacy", "/privacy/"], ["settings", "/settings/"],
    ["subscribers", "/subscribers/"], ["tasks", "/tasks/"], ["404", "/404.html"],
  ];
}

function additionalStates(fixtures) {
  return [
    {
      id: "games-selected", page: "games", href: "/games/",
      prepare: async (page) => {
        const tile = page.locator(`.card[data-game-id="${fixtures.game.id}"]`);
        await tile.waitFor({ state: "visible", timeout: 20_000 });
        await tile.click();
        await expect(tile).toHaveClass(/selected/);
      },
    },
    { id: "games-community", page: "games", href: "/games/?tab=market" },
    {
      id: "logo-selected", page: "logo", href: "/logos/",
      prepare: async (page) => {
        const tile = page.locator(`.logoTile[data-key="${fixtures.logo.id}"]`);
        await tile.waitFor({ state: "visible", timeout: 20_000 });
        await tile.click();
        await expect(tile).toHaveClass(/is-selected/);
      },
    },
    { id: "bases-shared", page: "bases", href: "/bases/?tab=shared" },
    { id: "polls-results", page: "polls", href: `/polls/?id=${fixtures.polls.poll_text.id}&tab=results` },
    { id: "friends-received", page: "friends", href: "/friends/?tab=received" },
    { id: "subscribers-received", page: "subscribers", href: "/subscribers/?tab=received" },
  ];
}

async function capture(page, profile, id, href, manifest, prepare = null, readySelector = null) {
  const url = `${ORIGIN}${href}${href.includes("?") ? "&" : "?"}lang=pl`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  } catch (error) {
    throw new Error(`${profile.label} · ${id}: nawigacja nie zakończyła się (${error.message})`);
  }
  try {
    await page.waitForFunction(() => !document.documentElement.classList.contains("page-loading")
      || !!document.documentElement.dataset.deviceGuard, null, { timeout: 8_000 });
  } catch {
    throw new Error(`${profile.label} · ${id}: ładowanie strony nie zakończyło się w 8 s`);
  }
  if (readySelector) {
    try {
      await page.locator(readySelector).waitFor({ state: "visible", timeout: 20_000 });
    } catch {
      throw new Error(`${profile.label} · ${id}: nie pojawił się element gotowości ${readySelector}`);
    }
  }
  if (prepare) await prepare(page);
  await page.waitForTimeout(450);
  const state = await page.evaluate(() => ({
    guard: document.documentElement.dataset.deviceGuard || document.getElementById("pageGuard")?.dataset.state || "",
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    bodyHeight: document.body?.scrollHeight || 0,
    pageText: document.body?.innerText?.slice(0, 500) || "",
    loading: document.documentElement.classList.contains("page-loading"),
  }));
  if (state.loading) throw new Error(`${profile.label} · ${id}: strona nadal ma page-loading po załadowaniu`);
  if (state.scrollWidth > state.viewportWidth + 1) {
    throw new Error(`${profile.label} · ${id}: poziomy overflow ${state.scrollWidth}px przy viewport ${state.viewportWidth}px`);
  }
  const file = `${id}.png`;
  fs.mkdirSync(path.join(OUT, profile.id), { recursive: true });
  await page.screenshot({ path: path.join(OUT, profile.id, file), fullPage: true, animations: "disabled", timeout: 30_000 });
  console.log(`[e20-gallery] ${profile.id}: captured ${id}`);
  manifest.push({ id, profile: profile.id, label: profile.label, url: href, file: `${profile.id}/${file}`, ...state });
  // Checkpoint after every image so a failed profile still leaves useful work.
  fs.writeFileSync(path.join(OUT, `manifest-${profile.id}.json`), JSON.stringify(manifest, null, 2));
}

test.describe.configure({ mode: "parallel" });
test.setTimeout(15 * 60 * 1000);
test.use({ serviceWorkers: "block" });

for (const profile of PROFILES.filter((item) => !requestedProfiles.length || requestedProfiles.includes(item.id))) {
  test(`E20 gallery · ${profile.label}`, async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    if (!fs.existsSync(FIXTURES_PATH) || !fs.existsSync(AUTH_STATE_PATH)) {
      throw new Error("Brak przygotowanej sesji lub danych galerii E20; uruchom krok Prepare E20 account and fixtures");
    }
    const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf8"));
    const viewport = { width: profile.width, height: profile.height };
    const context = await browser.newContext({
      viewport,
      screen: profile.screen || viewport,
      deviceScaleFactor: profile.scale,
      isMobile: profile.mobile,
      hasTouch: profile.touch,
      ...(profile.ua ? { userAgent: profile.ua } : {}),
      serviceWorkers: "block",
      storageState: AUTH_STATE_PATH,
    });
    const manifest = [];
    try {
      await serveBranchCode(context, { pages: PAGES, safeAreaInsets: profile.safe });
      // Galeria sprawdza układ stron i guardy, nie dostępność usługi CAPTCHA.
      // Na runnerze GitHub domena challenges.cloudflare.com bywa nierozwiązywalna;
      // lokalnie dla tego testu wyłączamy sam widżet, zachowując produkcyjny
      // formularz logowania i prawdziwą autoryzację konta testowego.
      await context.route(/^https:\/\/www\.familiada\.online\/login\/?$/, async (route) => {
        const response = await route.fetch();
        const html = (await response.text()).replace(/data-captcha-site-key="[^"]*"/, 'data-captcha-site-key=""');
        await route.fulfill({ response, body: html });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.setDefaultNavigationTimeout(20_000);
      const selectedUrls = urls(fixtures).filter(([id]) => !requestedPages.length || requestedPages.includes(id));
      for (const [id, href] of selectedUrls) {
        if (id === "login") {
          // /login fotografujemy jako gość, nie wylogowując i nie logując
          // ponownie głównej sesji używanej przez pozostałe strony.
          const anonymous = await browser.newContext({
            viewport, screen: profile.screen || viewport,
            deviceScaleFactor: profile.scale, isMobile: profile.mobile,
            hasTouch: profile.touch, ...(profile.ua ? { userAgent: profile.ua } : {}),
            serviceWorkers: "block",
          });
          try {
            await serveBranchCode(anonymous, { pages: PAGES, safeAreaInsets: profile.safe });
            await anonymous.route(/^https:\/\/www\.familiada\.online\/login\/?$/, async (route) => {
              const response = await route.fetch();
              const html = (await response.text()).replace(/data-captcha-site-key="[^"]*"/, 'data-captcha-site-key=""');
              await route.fulfill({ response, body: html });
            });
            const anonymousPage = await anonymous.newPage();
            anonymousPage.setDefaultTimeout(20_000);
            anonymousPage.setDefaultNavigationTimeout(20_000);
            await capture(anonymousPage, profile, id, href, manifest);
          } finally {
            await anonymous.close();
          }
          continue;
        }
        const readySelector = id === "games"
          ? `.card[data-game-id="${fixtures.game.id}"]`
          : id === "bases"
            ? `.tile[data-base-id="${fixtures.base.id}"]`
            : id === "logo"
              ? `.logoTile[data-key="${fixtures.logo.id}"]`
              : null;
        await capture(page, profile, id, href, manifest, null, readySelector);
      }
      const extra = additionalStates(fixtures).filter((state) => !requestedPages.length || requestedPages.includes(state.page));
      for (const state of extra) {
        await capture(page, profile, state.id, state.href, manifest, state.prepare);
      }
      expect(manifest).toHaveLength(selectedUrls.length + extra.length);
      const layoutIssues = manifest.filter((entry) => entry.scrollWidth > entry.viewportWidth + 1 || entry.loading);
      expect(layoutIssues, `Problemy szerokości lub niedokończone ładowanie: ${JSON.stringify(layoutIssues.map(({ id, url, scrollWidth, viewportWidth, loading }) => ({ id, url, scrollWidth, viewportWidth, loading })))}`).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
