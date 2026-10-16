// Galeria E20 pokazuje front z badanego brancha na prawdziwym backendzie,
// wykorzystując wyłącznie rekordy już obecne na kontach testowych.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./helpers/production-test");
const { serveBranchCode } = require("./helpers/branch-code");
const { galleryAccountNumbers, galleryAccountPaths, PREP_DIR } = require("./helpers/e20-gallery-accounts");

const ORIGIN = "https://www.familiada.online";
const OUT = path.resolve(__dirname, "../test-results/e20-gallery");
// Playwright clears test-results on startup. Gallery output remains only page
// folders with PNGs; manifests live in runner temp and are not in the artifact.
const MANIFEST_DIR = path.join(PREP_DIR, "familiada-e20-gallery-manifests");
const PAGES = [
  "index", "account", "bases", "bases/explorer", "connect", "connect/tv",
  "control", "games",
  "games/editor", "games/settings", "friends", "go", "login", "login/confirm",
  "login/reset", "logos", "logos/editor/draw", "logos/editor/image", "logos/editor/text",
  "mails", "maintenance", "manual", "marketplace", "polls", "polls/vote/points",
  "polls/vote/qr", "polls/vote/text", "privacy", "subscribers", "tasks", "404",
];

const PROFILES = [
  { id: "macbook", label: "MacBook", width: 1440, height: 900, scale: 2, mobile: false, touch: false, safe: null },
  { id: "ipad-portrait", label: "iPad mini 7 pionowo", width: 744, height: 1133, scale: 2, mobile: true, touch: true, ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: "ipad-landscape", label: "iPad mini 7 poziomo", width: 1133, height: 744, scale: 2, mobile: true, touch: true, ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: "iphone-portrait", label: "iPhone 14 pionowo", width: 390, height: 844, scale: 3, mobile: true, touch: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { id: "iphone-landscape", label: "iPhone 14 poziomo", width: 844, height: 390, screen: { width: 390, height: 844 }, scale: 3, mobile: true, touch: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { id: "tv", label: "Telewizor 1920 × 1080", width: 1920, height: 1080, scale: 1, mobile: false, touch: false, ua: "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36", safe: null },
];
const requestedPages = String(process.env.E20_GALLERY_PAGES || "").split(",").map((value) => value.trim()).filter(Boolean);
const requestedProfiles = String(process.env.E20_GALLERY_PROFILES || "").split(",").map((value) => value.trim()).filter(Boolean);
const requestedAccounts = galleryAccountNumbers();

function urls(data) {
  const game = data.game;
  const pollPoints = data.polls.poll_points;
  const pollText = data.polls.poll_text;
  const logo = data.logos.text || data.logos.draw || data.logos.image;
  const result = [
    ["home", "/"], ["account", "/account/"], ["bases", "/bases/"],
    ["connect", "/connect/"], ["connect-tv", "/connect/tv/"],
    ["games", "/games/"],
    ["friends", "/friends/"], ["go", "/go/"], ["login", "/login/"],
    ["login-confirm", "/login/confirm/"], ["login-reset", "/login/reset/"], ["logo", "/logos/"],
    ["mail", "/mails/"], ["maintenance", "/maintenance/"], ["manual", "/manual/"],
    ["marketplace", "/marketplace/"], ["polls", pollText ? `/polls/?id=${pollText.id}` : "/polls/"],
    ["privacy", "/privacy/"], ["subscribers", "/subscribers/"], ["tasks", "/tasks/"], ["404", "/404.html"],
  ];
  if (data.base) result.push(["base-explorer", `/bases/explorer/?id=${data.base.id}`]);
  if (game) {
    result.push(["control", `/control/?id=${game.id}`]);
    result.push(["game-editor", `/games/editor/?id=${game.id}`]);
    result.push(["game-settings", `/games/settings/?id=${game.id}`]);
  }
  if (logo) {
    const modePage = { TEXT: "text", DRAW: "draw", IMAGE: "image" }[logo.payload?.source?.mode];
    if (modePage) result.push([`logo-${modePage}`, `/logos/editor/${modePage}/?id=${logo.id}`]);
  }
  if (pollPoints?.share_key_poll) {
    result.push(["poll-vote-points", `/polls/vote/points/?id=${pollPoints.id}&key=${pollPoints.share_key_poll}`]);
    result.push(["poll-vote-qr", `/polls/vote/qr/?id=${pollPoints.id}&key=${pollPoints.share_key_poll}`]);
  }
  if (pollText?.share_key_poll) {
    result.push(["poll-vote-text", `/polls/vote/text/?id=${pollText.id}&key=${pollText.share_key_poll}`]);
  }
  return result;
}

function additionalStates(data) {
  const states = [
    ...(data.game ? [{
      id: "games-selected", page: "games", href: "/games/",
      prepare: async (page) => {
        const tile = page.locator(`.card[data-game-id="${data.game.id}"]`);
        await tile.waitFor({ state: "visible", timeout: 20_000 });
        await tile.click();
        await expect(tile).toHaveClass(/selected/);
      },
    }] : []),
    { id: "games-community", page: "games", href: "/games/?tab=market" },
    ...((data.logos.text || data.logos.draw || data.logos.image) ? [{
      id: "logo-selected", page: "logo", href: "/logos/",
      prepare: async (page) => {
        const logo = data.logos.text || data.logos.draw || data.logos.image;
        const tile = page.locator(`.logoTile[data-key="${logo.id}"]`);
        await tile.waitFor({ state: "visible", timeout: 20_000 });
        await tile.click();
        await expect(tile).toHaveClass(/is-selected/);
      },
    }] : []),
    { id: "bases-shared", page: "bases", href: "/bases/?tab=shared" },
    ...(data.polls.poll_text ? [{ id: "polls-results", page: "polls", href: `/polls/?id=${data.polls.poll_text.id}&tab=results` }] : []),
    { id: "friends-received", page: "friends", href: "/friends/?tab=received" },
    { id: "subscribers-received", page: "subscribers", href: "/subscribers/?tab=received" },
  ];
  return states;
}

async function saveDeviceScreenshot(page, profile, id, outputPath, captureWithoutFontWait = false) {
  let image;
  const captureWithCDP = async () => {
    const session = await page.context().newCDPSession(page);
    try {
      const result = await session.send("Page.captureScreenshot", {
        format: "png", fromSurface: true, captureBeyondViewport: false,
      });
      return Buffer.from(result.data, "base64");
    } finally {
      await session.detach();
    }
  };
  if (captureWithoutFontWait) {
    image = await captureWithCDP();
  } else {
    try {
      image = await page.screenshot({ fullPage: false, scale: "css", animations: "disabled", timeout: 20_000 });
    } catch (error) {
      if (!/TimeoutError|timeout/i.test(error.message)) throw error;
      // Playwright czeka na document.fonts.ready; CDP zapisuje ten sam viewport bez tego oczekiwania.
      image = await captureWithCDP();
    }
  }
  if (!["iphone-portrait", "iphone-landscape", "ipad-portrait", "ipad-landscape"].includes(profile.id)) {
    fs.writeFileSync(outputPath, image);
    return;
  }
  const iPhone = profile.id.startsWith("iphone");
  const landscape = profile.id.endsWith("landscape");
  const radius = iPhone ? 42 : 28;
  const bezel = iPhone ? 8 : 9;
  const notch = iPhone
    ? landscape
      ? '<i class="notch side"><b></b></i>'
      : '<i class="notch top"><b></b></i>'
    : "";
  const deviceIndicators = `${notch}<i class="gesture"></i>`;
  const frame = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#10131a;display:grid;place-items:center;overflow:hidden}
    .device{display:inline-block;padding:${bezel}px;background:#030407;border:2px solid #30343d;border-radius:${radius + bezel}px;box-shadow:0 12px 44px #000b;line-height:0}
    .screen{position:relative;width:${profile.width}px;height:${profile.height}px;overflow:hidden;border-radius:${radius}px;background:#050914}
    img{display:block;width:100%;height:100%;object-fit:fill}
    .notch{position:absolute;display:block;background:#030407;z-index:3}
    .notch.top{top:0;left:50%;transform:translateX(-50%);width:32.3%;height:4.27%;border-radius:0 0 22px 22px}
    .notch.top b{position:absolute;top:34%;right:13%;width:15%;height:15%;border-radius:5px;background:#111318;box-shadow:-28px 0 0 3px #08090c}
    .notch.side{left:0;top:50%;transform:translateY(-50%);width:4.27%;height:32.3%;border-radius:0 22px 22px 0}
    .notch.side b{position:absolute;left:34%;bottom:13%;width:15%;height:15%;border-radius:5px;background:#111318;box-shadow:0 -28px 0 3px #08090c}
    .gesture{position:absolute;z-index:3;left:50%;bottom:7px;transform:translateX(-50%);width:92px;height:4px;border-radius:99px;background:#ffffffa8}
  </style><div class="device"><div class="screen"><img src="data:image/png;base64,${image.toString("base64")}">${deviceIndicators}</div></div>`;
  // Najpierw opuszczamy badaną stronę, żeby zwolnić jej JS i ewentualne blokady.
  // Ramkę rysuje osobna, krótko żyjąca karta bez URL/backendu; nie zostawia
  // zakodowanych obrazów w rendererze, który otworzy następną stronę aplikacji.
  await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 10_000 });
  const framePage = await page.context().newPage();
  try {
    await framePage.setViewportSize({ width: profile.width + 2 * bezel + 8, height: profile.height + 2 * bezel + 8 });
    await framePage.setContent(frame, { waitUntil: "load", timeout: 20_000 });
    await framePage.screenshot({ path: outputPath, fullPage: true, scale: "css", animations: "disabled", timeout: 20_000 });
  } finally {
    await framePage.close();
  }
  const png = fs.readFileSync(outputPath);
  const actualFrameSize = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const expectedFrameSize = { width: profile.width + 2 * bezel + 8, height: profile.height + 2 * bezel + 8 };
  if (actualFrameSize.width !== expectedFrameSize.width || actualFrameSize.height !== expectedFrameSize.height) {
    throw new Error(`${profile.label} · ${id}: obraz ramki ma rozmiar ${actualFrameSize.width}×${actualFrameSize.height}, oczekiwano ${expectedFrameSize.width}×${expectedFrameSize.height}`);
  }
}

async function serveBranchLoginHtml(route) {
  const file = path.resolve(__dirname, "../../web/login/index.html");
  const productionResponse = await route.fetch();
  const productionHtml = await productionResponse.text();
  const testSiteKey = productionHtml.match(/data-captcha-site-key="([^"]*)"/)?.[1];
  if (!testSiteKey) throw new Error("Worker nie zwrócił testowego klucza Turnstile dla sesji E2E");
  const html = fs.readFileSync(file, "utf8").replace(/data-captcha-site-key="[^"]*"/, `data-captcha-site-key="${testSiteKey}"`);
  await route.fulfill({ response: productionResponse, headers: { "cache-control": "no-store" }, body: html });
}

function pageModalIds(page) {
  return page.locator('.overlay[id], .colorModalOverlay[id], .dt-modal[id], .drawer-overlay[id], dialog[id], [role="dialog"][id]')
    .evaluateAll((items) => items
      .filter((el) => !["pageGuard", "resourceLockGuard"].includes(el.id))
      .filter((el) => !/(alert|confirm|error|errModal)/i.test(el.id))
      .filter((el) => {
        const style = getComputedStyle(el);
        return !el.hidden && style.display !== "none" && style.visibility !== "hidden"
          && el.getClientRects().length > 0;
      })
      .map((el) => el.id));
}

async function findModalActions(page) {
  return page.locator('button, [role="button"], a[aria-haspopup="dialog"]')
    .evaluateAll((items) => items.map((el, index) => {
      const style = getComputedStyle(el);
      if (el.disabled || el.hidden || el.type === "submit" || style.display === "none" || style.visibility === "hidden" || !el.getClientRects().length) return null;
      const label = [el.innerText, el.getAttribute("aria-label"), el.title].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const icon = el.querySelector("[data-icon]")?.getAttribute("data-icon") || el.getAttribute("data-icon") || "";
      const contact = el.hasAttribute("data-contact-modal");
      const safeLabel = /wyszukaj|szukaj|search|udostępnij|udostepnij|import|eksport|export|qr|podgląd|podglad|preview|tagi|kolor/i.test(label);
      const safeIcon = /^(search|share|qr|palette|tag|eye)$/i.test(icon);
      if (!contact && !el.hasAttribute("aria-haspopup") && !el.hasAttribute("data-modal-target") && !safeLabel && !safeIcon) return null;
      if (/usuń|usun|delete|wyloguj|zapisz|save|wyślij|wyslij|submit/i.test(label)) return null;
      return { index, id: el.id || "", label: label || icon || "przycisk" };
    }).filter(Boolean));
}

async function clickModalAction(page, action) {
  const selector = action.id
    ? `#${action.id.replace(/([^a-zA-Z0-9_-])/g, "\\$1")}`
    : 'button, [role="button"], a[aria-haspopup="dialog"]';
  const target = action.id ? page.locator(selector) : page.locator(selector).nth(action.index);
  await target.click({ timeout: 5_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.overlay[id], .colorModalOverlay[id], .dt-modal[id], dialog[id], [role="dialog"][id]')]
    .some((el) => {
      const style = getComputedStyle(el);
      return !el.hidden && style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
    }), null, { timeout: 3_000 }).catch(() => {});
  return pageModalIds(page);
}

async function capture(page, profile, id, href, manifest, prepare = null, readySelector = null, options = {}) {
  const url = `${ORIGIN}${href}${href.includes("?") ? "&" : "?"}lang=pl`;
  const pageErrors = [];
  const onPageError = (error) => pageErrors.push(error.message);
  page.on("pageerror", onPageError);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  } catch (error) {
    throw new Error(`${profile.label} · ${id}: nawigacja nie zakończyła się (${error.message})`);
  }
  try {
    await page.waitForFunction(() => {
      const html = document.documentElement;
      const guarded = html.dataset.deviceGuard && html.dataset.deviceGuard !== "ok"
        && document.getElementById("pageGuard")?.style.display === "flex";
      return !html.classList.contains("page-loading") || guarded;
    }, null, { timeout: 8_000 });
  } catch {
    const diagnostics = await page.evaluate(() => ({
      loading: document.documentElement.classList.contains("page-loading"),
      guard: document.documentElement.dataset.deviceGuard || "",
      guardDisplay: document.getElementById("pageGuard")?.style.display || "missing",
      title: document.title,
      text: document.body?.innerText?.slice(0, 240) || "",
    })).catch(() => ({}));
    throw new Error(`${profile.label} · ${id}: ładowanie strony nie zakończyło się w 8 s; ${JSON.stringify({ ...diagnostics, pageErrors })}`);
  }
  try {
    await page.waitForFunction(() => {
      const root = document.documentElement;
      const overlay = document.getElementById("pageGuard");
      const guarded = overlay?.style.display === "flex" && Boolean(overlay.dataset.state);
      const resourceGuard = document.getElementById("resourceLockGuard");
      const resourceBlocked = resourceGuard && getComputedStyle(resourceGuard).display !== "none"
        && getComputedStyle(resourceGuard).visibility !== "hidden";
      if (guarded || resourceBlocked) return true;
      const visibleSteps = [...document.querySelectorAll("[data-skel-step]")].filter((step) => {
        for (let node = step; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || style.display === "none") return false;
        }
        // Gotowy etap może mieć zerowy własny rect (np. kontener siatki
        // logowania), ale jego treść i tak jest już odsłonięta.
        return step.classList.contains("skel-step-ready") || step.getClientRects().length > 0;
      });
      return visibleSteps.length > 0 && visibleSteps.every((step) => step.classList.contains("skel-step-ready"));
    }, null, { timeout: 20_000 });
  } catch {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      stages: [...document.querySelectorAll("[data-skel-step]")].map((step) => ({
        tag: step.tagName, className: String(step.className), ready: step.classList.contains("skel-step-ready"),
        hidden: step.hidden, display: getComputedStyle(step).display, visibility: getComputedStyle(step).visibility,
      })),
      loginShell: Boolean(document.querySelector(".login-shell")),
      guard: document.getElementById("pageGuard")?.dataset.state || document.documentElement.dataset.deviceGuard || "",
      resourceGuard: getComputedStyle(document.getElementById("resourceLockGuard") || document.body).display,
      resourceGuardTitle: document.getElementById("resourceLockGuardTitle")?.textContent?.trim() || "",
      resourceGuardMessage: document.getElementById("resourceLockGuardMsg")?.textContent?.trim() || "",
      pendingSteps: [...document.querySelectorAll("[data-skel-step]")]
        .filter((step) => !step.classList.contains("skel-step-ready") && step.getClientRects().length)
        .map((step) => `${step.tagName}.${String(step.className).replace(/\s+/g, ".")}`).slice(0, 8),
      text: document.body?.innerText?.slice(0, 240) || "",
    })).catch(() => ({}));
    throw new Error(`${profile.label} · ${id}: etap widocznej treści nie osiągnął gotowości; ${JSON.stringify({ ...diagnostics, pageErrors })}`);
  }
  if (readySelector) {
    await page.waitForFunction((selector) => {
      const html = document.documentElement;
      const guarded = html.dataset.deviceGuard && html.dataset.deviceGuard !== "ok"
        && document.getElementById("pageGuard")?.style.display === "flex";
      return guarded || [...document.querySelectorAll(selector)].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
      });
    }, readySelector, { timeout: 20_000 }).catch(async () => {
      const diagnostics = await page.evaluate(() => ({
        guard: document.documentElement.dataset.deviceGuard || "",
        guardDisplay: document.getElementById("pageGuard")?.style.display || "missing",
        loading: document.documentElement.classList.contains("page-loading"),
      })).catch(() => ({}));
      throw new Error(`${profile.label} · ${id}: brak elementu gotowości ${readySelector}; ${JSON.stringify({ ...diagnostics, pageErrors })}`);
    });
  }
  // Dane aplikacji są już potwierdzone przez gotowe etapy i readySelector.
  // Nie wymagamy pełnej ciszy sieci: urządzenia gry mają heartbeat, a listy
  // mogą odpytywać backend mimo gotowej treści.
  try {
    await page.waitForLoadState("networkidle", { timeout: 1_000 }).catch(() => {});
    await page.waitForFunction(() => {
      const body = document.body;
      if (!body) return false;
      const pendingImage = [...document.images].some((image) => image.getClientRects().length && !image.complete);
      if (pendingImage) return false;
      const pendingText = /^(ładowanie|ładuję|wczytuję|loading|please wait)[.…\s]*$/i;
      const visibleLoading = [...body.querySelectorAll("[aria-busy='true'], .loading, .skeleton, .skel")]
        .some((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
      const textLoading = [...body.querySelectorAll("body *")].some((el) => {
        if (el.children.length || !el.getClientRects().length) return false;
        return pendingText.test((el.textContent || "").trim());
      });
      return !visibleLoading && !textLoading;
    }, null, { timeout: 20_000 });
    await page.evaluate(() => Promise.all([
      Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 5_000))]),
      ...[...document.images].filter((image) => image.complete && image.decode).map((image) => image.decode().catch(() => {})),
    ]));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  } catch {
    const diagnostics = await page.evaluate(() => ({
      loading: document.documentElement.classList.contains("page-loading"),
      visibleBusy: [...document.querySelectorAll("[aria-busy='true'], .loading, .skeleton, .skel")]
        .filter((el) => el.getClientRects().length).map((el) => `${el.tagName}.${el.className}`).slice(0, 8),
      title: document.title,
      text: document.body?.innerText?.slice(0, 400) || "",
    })).catch(() => ({}));
    throw new Error(`${profile.label} · ${id}: treść nie osiągnęła stabilnego stanu; ${JSON.stringify({ ...diagnostics, pageErrors })}`);
  }
  const blockedByGuard = await page.evaluate(() => {
    const state = document.documentElement.dataset.deviceGuard || "";
    return state !== "" && state !== "ok" && document.getElementById("pageGuard")?.style.display === "flex";
  });
  // Stany interaktywne nie zastępują guarda: na niedostępnym urządzeniu
  // zapisujemy ten guard zamiast wymuszać klik w ukryty zasób.
  let preparedState = null;
  if (prepare && !blockedByGuard) preparedState = await prepare(page);
  const expectedSafe = profile.safe || { top: 0, right: 0, bottom: 0, left: 0 };
  const actualSafe = await page.evaluate(() => {
    const root = document.documentElement;
    return Object.fromEntries(["top", "right", "bottom", "left"].map((side) => [
      side,
      Number.parseFloat(root.style.getPropertyValue(`--e20-safe-area-inset-${side}`)) || 0,
    ]));
  });
  if (profile.safe) {
    const injected = await page.locator("html").getAttribute("data-e20-safe-area-injected");
    if (injected !== "true") throw new Error(`${profile.label} · ${id}: skrypt galerii nie wstrzyknął safe area`);
  }
  for (const side of ["top", "right", "bottom", "left"]) {
    if (actualSafe[side] !== expectedSafe[side]) {
      throw new Error(`${profile.label} · ${id}: safe area ${side}=${actualSafe[side]}px, oczekiwano ${expectedSafe[side]}px`);
    }
  }
  const safeGeometry = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar");
    const footer = document.querySelector(".footer");
    const number = (value) => Number.parseFloat(value) || 0;
    const style = topbar ? getComputedStyle(topbar) : null;
    const footerStyle = footer ? getComputedStyle(footer) : null;
    const rect = topbar?.getBoundingClientRect();
    return {
      topbarTop: rect?.top ?? null,
      topbarPadding: style ? {
        top: number(style.paddingTop), right: number(style.paddingRight), bottom: number(style.paddingBottom), left: number(style.paddingLeft),
      } : null,
      footerPaddingBottom: footerStyle && footerStyle.position !== "fixed" ? number(footerStyle.paddingBottom) : null,
      footerBottom: footerStyle?.position === "fixed" ? number(footerStyle.bottom) : null,
    };
  });
  if (safeGeometry.topbarTop !== null && safeGeometry.topbarTop !== 0) {
    throw new Error(`${profile.label} · ${id}: topbar nie rozciąga tła od krawędzi ekranu (${safeGeometry.topbarTop}px)`);
  }
  // Górny pasek nie zajmuje dolnej krawędzi ekranu. Dolny inset sprawdzamy
  // osobno na stopce; pozostałe trzy krawędzie topbara muszą chronić treść.
  for (const side of ["top", "right", "left"]) {
    if (safeGeometry.topbarPadding && safeGeometry.topbarPadding[side] + 0.5 < expectedSafe[side]) {
      throw new Error(`${profile.label} · ${id}: topbar ${side} safe area=${safeGeometry.topbarPadding[side]}px, oczekiwano co najmniej ${expectedSafe[side]}px`);
    }
  }
  if (safeGeometry.footerPaddingBottom !== null && safeGeometry.footerPaddingBottom + 0.5 < expectedSafe.bottom) {
    throw new Error(`${profile.label} · ${id}: stopka nie uwzględnia dolnej safe area (${safeGeometry.footerPaddingBottom}px < ${expectedSafe.bottom}px)`);
  }
  if (safeGeometry.footerBottom !== null && safeGeometry.footerBottom + 0.5 < expectedSafe.bottom) {
    throw new Error(`${profile.label} · ${id}: pływająca stopka nie uwzględnia dolnej safe area (${safeGeometry.footerBottom}px < ${expectedSafe.bottom}px)`);
  }
  const state = await page.evaluate(() => ({
    guard: document.documentElement.dataset.deviceGuard || document.getElementById("pageGuard")?.dataset.state || "",
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    bodyHeight: document.body?.scrollHeight || 0,
    pageText: document.body?.innerText?.slice(0, 500) || "",
    loading: document.documentElement.classList.contains("page-loading"),
    listHeaderActionsBelow: document.querySelector("main .bar")?.classList.contains("has-actions-below") || false,
    listBottomLayout: document.querySelector(".games-bottom")?.classList.contains("is-single-row")
      ? "single-row"
      : document.querySelector(".games-bottom")?.classList.contains("is-balanced-wrap") ? "balanced-wrap" : "not-measured",
    listBottomTextLabels: [...document.querySelectorAll(".games-bottom-right .only-desktop")]
      .some((label) => label.getClientRects().length > 0),
    listBottomMetrics: (() => {
      const bar = document.querySelector(".games-bottom");
      const naturalWidth = (group) => {
        if (!group) return 0;
        const widths = [...group.children].filter((child) => child.getClientRects().length)
          .map((child) => child.getBoundingClientRect().width);
        const style = getComputedStyle(group);
        const gap = Number.parseFloat(style.columnGap || style.gap) || 0;
        const width = widths.reduce((total, itemWidth) => total + itemWidth, 0) + Math.max(0, widths.length - 1) * gap;
        return width;
      };
      const rowSizes = (group) => {
        if (!group) return [];
        const rows = new Map();
        for (const child of group.children) {
          if (!child.getClientRects().length) continue;
          const top = Math.round(child.getBoundingClientRect().top);
          rows.set(top, (rows.get(top) || 0) + 1);
        }
        return [...rows.values()];
      };
      if (!bar) return null;
      const left = bar.querySelector(":scope > .games-bottom-left");
      const right = bar.querySelector(":scope > .games-bottom-right");
      return {
        available: bar.clientWidth,
        left: naturalWidth(left),
        right: naturalWidth(right),
        groupGap: Number.parseFloat(getComputedStyle(bar).columnGap || getComputedStyle(bar).gap) || 0,
        leftRows: rowSizes(left),
        rightRows: rowSizes(right),
      };
    })(),
  }));
  if (state.loading) throw new Error(`${profile.label} · ${id}: strona nadal ma page-loading po załadowaniu`);
  if (state.scrollWidth > state.viewportWidth + 1) {
    throw new Error(`${profile.label} · ${id}: poziomy overflow ${state.scrollWidth}px przy viewport ${state.viewportWidth}px`);
  }
  if (["games", "bases", "logo"].includes(id)) {
    if (profile.width >= 1133 && state.listHeaderActionsBelow) {
      throw new Error(`${profile.label} · ${id}: pasek nagłówka przeniósł akcje mimo szerokiego ekranu`);
    }
    const fitsSingleRow = state.listBottomMetrics
      && state.listBottomMetrics.left + state.listBottomMetrics.right + state.listBottomMetrics.groupGap <= state.listBottomMetrics.available + 1;
    if (fitsSingleRow && state.listBottomLayout !== "single-row") {
      throw new Error(`${profile.label} · ${id}: dolny pasek zawinął się, choć mieści się w jednym wierszu; ${JSON.stringify(state.listBottomMetrics)}`);
    }
    if (!fitsSingleRow && state.listBottomLayout !== "balanced-wrap") {
        throw new Error(`${profile.label} · ${id}: dolny pasek nie zastosował równomiernego zawinięcia; ${JSON.stringify(state.listBottomMetrics)}`);
    }
    if (state.listBottomTextLabels && state.listBottomMetrics) {
      const longestGroup = Math.max(state.listBottomMetrics.leftRows.length, state.listBottomMetrics.rightRows.length);
      if (longestGroup > 2) {
        throw new Error(`${profile.label} · ${id}: tekstowe przyciski paska filtrów/akcji tworzą więcej niż dwa rzędy zamiast przejść do ikon; ${JSON.stringify(state.listBottomMetrics)}`);
      }
    }
    if (profile.width >= 744) {
      const { available, left, right, groupGap } = state.listBottomMetrics;
      console.log(`[e20-layout] ${profile.id} · ${id}: naturalne ${Math.round(left + right + groupGap)}px / dostępne ${available}px; ${state.listBottomLayout}; akcje pod nagłówkiem=${state.listHeaderActionsBelow}`);
    }
  }
  const modalIds = await pageModalIds(page).catch(() => []);
  const modalCandidates = options.modalCapture ? [] : await findModalActions(page).catch(() => []);
  if (options.requireModal && !modalIds.length) {
    throw new Error(`${profile.label} · ${id}: akcja „${options.actionLabel || "?"}” nie otworzyła prawdziwego modala`);
  }
  const safeModalName = (modalIds[0] || "dialog").replace(/[^a-zA-Z0-9_-]/g, "-");
  const fileName = options.fileName || (options.modalCapture
    ? `modal-${safeModalName}-${profile.id}.png`
    : `${profile.id}.png`);
  const finalUrl = page.url();
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  // Każdy plik ma przedstawiać rzeczywisty ekran urządzenia. Pełnostronicowe
  // zrzuty na długich/animowanych widokach wisiały w Chromium po 45 s; wysokość
  // całej strony pozostaje w manifeście, a screenshot zachowuje viewport i safe area.
  await saveDeviceScreenshot(page, profile, id, path.join(OUT, id, fileName), Boolean(options.stateId));
  expect(page.context().pages(), `${profile.label} · ${id}: otwarto równoległą kartę`).toHaveLength(1);
  page.off("pageerror", onPageError);
  console.log(`[e20-gallery] ${profile.id}: captured ${id}`);
  manifest.push({
    id,
    ...(options.stateId || (options.modalCapture && modalIds[0]) ? { stateId: options.stateId || `modal:${modalIds[0]}` } : {}),
    profile: profile.id,
    label: profile.label,
    safeAreaInsets: expectedSafe,
    url: href,
    finalUrl,
    ...(options.actionLabel ? { actionLabel: options.actionLabel } : {}),
    file: `${id}/${fileName}`,
    ...state,
  });
  // Checkpoint after every image so a failed profile still leaves useful work.
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(MANIFEST_DIR, `manifest-${profile.id}.json`), JSON.stringify(manifest, null, 2));
  return { modalIds, modalCandidates, blockedByGuard, preparedState };
}

// Profile są rozdzielone między istniejące konta. Każde konto robi swoje
// widoki i urządzenia po kolei, a niezależne konta mogą pracować równolegle.
// To usuwa współbieżność blokad zasobów bez tworzenia osobnego konta galerii.
test.describe.configure({ mode: "parallel" });
test.setTimeout(requestedPages.length ? 5 * 60 * 1000 : requestedProfiles.length === 1 ? 15 * 60 * 1000 : 30 * 60 * 1000);
test.use({ serviceWorkers: "block" });

const selectedProfiles = PROFILES.filter((item) => !requestedProfiles.length || requestedProfiles.includes(item.id));
for (const [accountIndex, accountNumber] of requestedAccounts.entries()) {
  const accountProfiles = selectedProfiles.filter((_, profileIndex) => profileIndex % requestedAccounts.length === accountIndex);
  if (!accountProfiles.length) continue;
  test(`E20 gallery · test${accountNumber} · ${accountProfiles.map((profile) => profile.id).join(", ")}`, async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    const files = galleryAccountPaths(accountNumber);
    if (!fs.existsSync(files.data) || !fs.existsSync(files.authState)) {
      throw new Error(`Brak przygotowanej sesji lub odczytu danych konta test${accountNumber}; uruchom krok Prepare E20 session`);
    }
    const data = JSON.parse(fs.readFileSync(files.data, "utf8"));
    for (const profile of accountProfiles) {
      const viewport = { width: profile.width, height: profile.height };
      const deviceOptions = {
        viewport, screen: profile.screen || viewport, deviceScaleFactor: profile.scale,
        isMobile: profile.mobile, hasTouch: profile.touch,
        ...(profile.ua ? { userAgent: profile.ua } : {}), serviceWorkers: "block",
      };
      const manifest = [];
      const selectedUrls = urls(data)
        .filter(([id]) => !requestedPages.length || requestedPages.includes(id))
        .filter(([id]) => profile.id !== "tv" || id === "connect-tv");

      // Home/Login są publiczne: fotografujemy je w jednej tymczasowej
      // niezalogowanej sesji, zamykamy ją, a dopiero potem otwieramy sesję
      // konta. Nie uruchamiamy testów guarda gościa ani dwóch stron naraz.
      // Te strony mogą wylogować aktywną sesję. To publiczne przepływy
      // logowania, więc fotografujemy je przed prywatnymi stronami.
      const publicUrls = selectedUrls.filter(([id]) => ["home", "login", "login-confirm", "login-reset"].includes(id));
      if (publicUrls.length) {
        const publicContext = await browser.newContext(deviceOptions);
        try {
          await serveBranchCode(publicContext, { pages: PAGES, safeAreaInsets: profile.safe });
          await publicContext.route(/^https:\/\/www\.familiada\.online\/login\/?(?:\?.*)?$/, serveBranchLoginHtml);
          const publicPage = await publicContext.newPage();
          publicPage.setDefaultTimeout(20_000);
          publicPage.setDefaultNavigationTimeout(20_000);
          for (const [id, href] of publicUrls) await capture(publicPage, profile, id, href, manifest);
        } finally {
          await publicContext.close();
        }
      }

      const context = await browser.newContext({ ...deviceOptions, storageState: files.authState });
      try {
        await serveBranchCode(context, { pages: PAGES, safeAreaInsets: profile.safe });
        await context.route(/^https:\/\/www\.familiada\.online\/login\/?(?:\?.*)?$/, serveBranchLoginHtml);
        let page = await context.newPage();
        page.setDefaultTimeout(20_000);
        page.setDefaultNavigationTimeout(20_000);
        let modalCaptureCount = 0;
        for (const [id, href] of selectedUrls) {
          if (["home", "login", "login-confirm", "login-reset"].includes(id)) continue;
          const readySelector = id === "games"
            ? data.game ? `.card[data-game-id="${data.game.id}"]` : null
            : id === "bases"
              ? data.base ? `.tile[data-base-id="${data.base.id}"]` : null
              : id === "logo"
                ? (data.logos.text || data.logos.draw || data.logos.image)
                  ? `.logoTile[data-key="${(data.logos.text || data.logos.draw || data.logos.image).id}"]` : null
                : null;
          const baseState = await capture(page, profile, id, href, manifest, null, readySelector);
          if (!baseState.blockedByGuard) {
            const capturedModalIds = new Set(baseState.modalIds);
            for (const action of baseState.modalCandidates) {
              await page.close();
              page = await context.newPage();
              page.setDefaultTimeout(20_000);
              page.setDefaultNavigationTimeout(20_000);
              const result = await capture(
                page, profile, id, href, manifest,
                (modalPage) => clickModalAction(modalPage, action),
                null,
                { modalCapture: true, requireModal: true, actionLabel: action.label },
              ).catch((error) => {
                if (/nie otworzyła prawdziwego modala/i.test(error.message)) {
                  console.log(`[e20-gallery] ${profile.id} · ${id}: akcja „${action.label}” nie otworzyła modala; bez zrzutu`);
                  return null;
                }
                throw error;
              });
              if (result?.modalIds?.length) {
                const openedId = result.modalIds[0];
                if (capturedModalIds.has(openedId)) {
                  const latest = manifest.at(-1);
                  if (latest?.stateId === `modal:${openedId}`) {
                    fs.rmSync(path.join(OUT, latest.file), { force: true });
                    manifest.pop();
                    fs.writeFileSync(path.join(MANIFEST_DIR, `manifest-${profile.id}.json`), JSON.stringify(manifest, null, 2));
                  }
                } else {
                  capturedModalIds.add(openedId);
                  modalCaptureCount += 1;
                }
              }
            }
          }
        }
        const extra = profile.id === "tv" ? [] : additionalStates(data).filter((state) => !requestedPages.length || requestedPages.includes(state.page));
        if (extra.length) {
          // Podstawowe strony mogą zostawić stan karty lub heartbeat blokady.
          // Zamykamy ją całkowicie i stany dodatkowe fotografujemy w nowej,
          // pojedynczej karcie, nadal sekwencyjnie.
          await page.close();
          page = await context.newPage();
          page.setDefaultTimeout(20_000);
          page.setDefaultNavigationTimeout(20_000);
        }
        for (const state of extra) {
          await capture(page, profile, state.id, state.href, manifest, state.prepare);
        }
        expect(manifest.filter((entry) => !entry.stateId)).toHaveLength(selectedUrls.length + extra.length);
        expect(manifest.filter((entry) => entry.stateId)).toHaveLength(modalCaptureCount);
        const layoutIssues = manifest.filter((entry) => entry.scrollWidth > entry.viewportWidth + 1 || entry.loading);
        expect(layoutIssues, `Problemy szerokości lub niedokończone ładowanie: ${JSON.stringify(layoutIssues.map(({ id, url, scrollWidth, viewportWidth, loading }) => ({ id, url, scrollWidth, viewportWidth, loading })))}`).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });
}
