// Pełna galeria stron E20 na prawdziwym backendzie produkcyjnym.
// Front ładowany jest z badanego brancha; Supabase, Worker i poczta pozostają
// rzeczywiste. Dane seedujemy idempotentnie na dedykowanym koncie test17.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { loginAsTestUser, galleryTestAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");
const { seedE20GalleryFixtures } = require("./helpers/e20-gallery-fixtures");

const ORIGIN = "https://www.familiada.online";
const OUT = path.resolve(__dirname, "../test-results/e20-gallery");
const PAGES = [
  "index", "account", "bases", "bases/explorer", "connect", "connect/tv",
  "control", "control/buzzer", "control/display", "control/host", "games",
  "games/editor", "games/settings", "friends", "go", "login", "login/confirm",
  "login/reset", "logo", "logo/editor/draw", "logo/editor/image", "logo/editor/text",
  "mail", "maintenance", "manual", "marketplace", "polls", "polls/vote/points",
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
    ["login-reset", "/login/reset/"], ["logo", "/logo/"],
    ["logo-draw", `/logo/editor/draw/?id=${fixtures.logo.id}`],
    ["logo-image", `/logo/editor/image/?id=${fixtures.logo.id}`],
    ["logo-text", `/logo/editor/text/?id=${fixtures.logo.id}`],
    ["mail", "/mail/"], ["maintenance", "/maintenance/"], ["manual", "/manual/"],
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
      id: "logo-selected", page: "logo", href: "/logo/",
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

async function capture(page, profile, id, href, manifest, prepare = null) {
  const url = `${ORIGIN}${href}${href.includes("?") ? "&" : "?"}lang=pl`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("page-loading")
    || !!document.documentElement.dataset.deviceGuard, null, { timeout: 20_000 }).catch(() => {});
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
  const file = `${id}.png`;
  fs.mkdirSync(path.join(OUT, profile.id), { recursive: true });
  await page.screenshot({ path: path.join(OUT, profile.id, file), fullPage: true, animations: "disabled" });
  manifest.push({ id, profile: profile.id, label: profile.label, url: href, file: `${profile.id}/${file}`, ...state });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(45 * 60 * 1000);
test.use({ serviceWorkers: "block" });

for (const profile of PROFILES.filter((item) => !requestedProfiles.length || requestedProfiles.includes(item.id))) {
  test(`E20 gallery · ${profile.label}`, async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    const viewport = { width: profile.width, height: profile.height };
    const context = await browser.newContext({
      viewport,
      screen: profile.screen || viewport,
      deviceScaleFactor: profile.scale,
      isMobile: profile.mobile,
      hasTouch: profile.touch,
      ...(profile.ua ? { userAgent: profile.ua } : {}),
      serviceWorkers: "block",
    });
    const manifest = [];
    try {
      await serveBranchCode(context, { pages: PAGES, safeAreaInsets: profile.safe });
      const page = await context.newPage();
      await loginAsTestUser(page, context, { username: galleryTestAccountUsername() });
      const fixtures = await seedE20GalleryFixtures(page);

      const selectedUrls = urls(fixtures).filter(([id]) => !requestedPages.length || requestedPages.includes(id));
      for (const [id, href] of selectedUrls) {
        if (id === "login") {
          await page.evaluate(async () => { await window.__sbClient?.auth.signOut(); });
        } else if (id === "logo") {
          await loginAsTestUser(page, context, { username: galleryTestAccountUsername() });
        }
        await capture(page, profile, id, href, manifest);
      }
      const extra = additionalStates(fixtures).filter((state) => !requestedPages.length || requestedPages.includes(state.page));
      for (const state of extra) {
        await capture(page, profile, state.id, state.href, manifest, state.prepare);
      }
      fs.writeFileSync(path.join(OUT, `manifest-${profile.id}.json`), JSON.stringify(manifest, null, 2));
      expect(manifest).toHaveLength(selectedUrls.length + extra.length);
      const layoutIssues = manifest.filter((entry) => entry.scrollWidth > entry.viewportWidth + 1 || entry.loading);
      expect(layoutIssues, `Problemy szerokości lub niedokończone ładowanie: ${JSON.stringify(layoutIssues.map(({ id, url, scrollWidth, viewportWidth, loading }) => ({ id, url, scrollWidth, viewportWidth, loading })))}`).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
