// Galeria E20 pokazuje front z badanego brancha na prawdziwym backendzie,
// wykorzystując wyłącznie rekordy już obecne na kontach testowych.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./helpers/production-test");
const { serveBranchCode, serveBranchLoginHtml } = require("./helpers/branch-code");
const { galleryAccountNumbers, galleryAccountPaths, PREP_DIR } = require("./helpers/e20-gallery-accounts");
const { withE2EBypass } = require("./helpers/login");

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
  const pollPoints = data.polls.poll_points_vote;
  const pollText = data.polls.poll_text;
  const pollTextVote = data.polls.poll_text_vote;
  const result = [
    ["home", "/"], ["account", "/account/"], ["bases", "/bases/"],
    ["connect", "/connect/"], ["connect-tv", "/connect/tv/"],
    ["games", "/games/"],
    ["friends", "/friends/"], ["go", "/go/"], ["login", "/login/"],
    ["login-confirm", "/login/confirm/"], ["login-reset", "/login/reset/"], ["logos", "/logos/"],
    ["mails", "/mails/"], ["maintenance", "/maintenance/"], ["manual", "/manual/"],
    ["marketplace", "/marketplace/"], ["polls", (pollTextVote || pollText) ? `/polls/?id=${(pollTextVote || pollText).id}` : "/polls/"],
    ["privacy", "/privacy/"], ["subscribers", "/subscribers/"], ["tasks", "/tasks/"], ["404", "/404.html"],
  ];
  if (data.base) result.push(["base-explorer", `/bases/explorer/?id=${data.base.id}`]);
  if (game) {
    result.push(["control", `/control/?id=${game.id}`]);
    result.push(["game-editor", `/games/editor/?id=${game.id}`]);
    result.push(["game-settings", `/games/settings/?id=${game.id}`]);
  }
  for (const modePage of ["text", "draw", "image"]) {
    const logo = data.logos[modePage];
    if (logo) result.push([`logo-editor-${modePage}`, `/logos/editor/${modePage}/?id=${logo.id}`]);
  }
  if (pollPoints?.share_key_poll) {
    result.push(["poll-vote-points", `/polls/vote/points/?id=${pollPoints.id}&key=${pollPoints.share_key_poll}`]);
    result.push(["poll-vote-qr", `/polls/vote/qr/?id=${pollPoints.id}&key=${pollPoints.share_key_poll}`]);
  }
  if (pollTextVote?.share_key_poll) {
    result.push(["poll-vote-text", `/polls/vote/text/?id=${pollTextVote.id}&key=${pollTextVote.share_key_poll}`]);
  }
  return result;
}

function additionalStates(data) {
  const states = [
    { id: "bases", stateId: "shared", page: "bases", href: "/bases/?tab=shared" },
    ...(data.polls.poll_text ? [{ id: "polls", stateId: "results", page: "polls", href: `/polls/?id=${data.polls.poll_text.id}&tab=results` }] : []),
    ...((data.polls.poll_text_vote || data.polls.poll_text) ? [{ id: "polls", stateId: "recipients", page: "polls", href: `/polls/?id=${(data.polls.poll_text_vote || data.polls.poll_text).id}&tab=recipients`, mobileOnly: true }] : []),
    { id: "marketplace", stateId: "mine", page: "marketplace", href: "/marketplace/", prepare: async (page) => {
      await page.locator("#btnMySent").click();
      await page.locator("#viewMine").waitFor({ state: "visible", timeout: 15_000 });
    } },
    { id: "friends", stateId: "list", page: "friends", href: "/friends/?tab=received", mobileOnly: true },
    { id: "subscribers", stateId: "list", page: "subscribers", href: "/subscribers/?tab=received", mobileOnly: true },
    ...(data.game ? [
      {
        id: "game-editor", stateId: "question", page: "game-editor", href: `/games/editor/?id=${data.game.id}`,
        mobileOnly: true,
        prepare: async (page) => {
          const question = page.locator("#qList .qcard[data-id]").first();
          await question.waitFor({ state: "visible", timeout: 20_000 });
          await question.click();
          await expect(page.locator("body")).toHaveClass(/mobile-editing/);
          await page.locator("#qText").scrollIntoViewIfNeeded();
        },
      },
      {
        id: "game-editor", stateId: "answers", page: "game-editor", href: `/games/editor/?id=${data.game.id}`,
        mobileOnly: true,
        prepare: async (page) => {
          const question = page.locator("#qList .qcard[data-id]").first();
          await question.waitFor({ state: "visible", timeout: 20_000 });
          await question.click();
          await expect(page.locator("body")).toHaveClass(/mobile-editing/);
          await page.locator("#aList").scrollIntoViewIfNeeded();
        },
      },
    ] : []),
  ];
  return states;
}

async function saveDeviceScreenshot(page, profile, id, outputPath, captureWithoutFontWait = false, capturedImage = null) {
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
  if (capturedImage) {
    image = capturedImage;
  } else if (captureWithoutFontWait) {
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

function pageModalIds(page) {
  return page.locator('.overlay[id], .overlay .modal, .colorModalOverlay[id], .dt-modal[id], .drawer-overlay[id], dialog[id], [role="dialog"][id]')
    .evaluateAll((items) => items
      .filter((el) => !["pageGuard", "resourceLockGuard"].includes(el.id))
      .filter((el) => !/(alert|confirm|error|errModal)/i.test(el.id))
      .filter((el) => {
        const style = getComputedStyle(el);
        return !el.hidden && style.display !== "none" && style.visibility !== "hidden"
          && el.getClientRects().length > 0;
      })
      .map((el) => el.id || el.classList?.[0] || el.querySelector?.(".mTitle")?.textContent?.trim() || "dialog"));
}

async function findModalActions(page, pageId) {
  return page.locator('button, [role="button"], a[aria-haspopup="dialog"]')
    .evaluateAll((items) => items.map((el, index) => {
      const style = getComputedStyle(el);
      if (el.disabled || el.hidden || el.type === "submit" || style.display === "none" || style.visibility === "hidden" || !el.getClientRects().length) return null;
      const label = [el.innerText, el.getAttribute("aria-label"), el.title].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const icon = el.querySelector("[data-icon]")?.getAttribute("data-icon") || el.getAttribute("data-icon") || "";
      const contact = el.hasAttribute("data-contact-modal");
      if (contact && pageId !== "games") return null;
      const dialogTarget = el.getAttribute("aria-haspopup") === "dialog" || el.hasAttribute("data-modal-target");
      const safeLabel = /udostępnij|udostepnij|import|eksport|export|qr|podgląd|podglad|preview|tagi|kolor/i.test(label);
      const safeIcon = /^(share|qr|palette|tag|eye)$/i.test(icon);
      if (!contact && !dialogTarget && !safeLabel && !safeIcon) return null;
      if (/usuń|usun|delete|wyloguj|zapisz|save|wyślij|wyslij|submit/i.test(label)) return null;
      return {
        index,
        id: el.id || "",
        modalTarget: el.getAttribute("data-modal-target") || "",
        contact,
        role: el.matches("a[href]") ? "link" : "button",
        name: el.getAttribute("aria-label") || el.innerText?.replace(/\s+/g, " ").trim() || el.title || icon || "przycisk",
        label: label || icon || "przycisk",
      };
    }).filter(Boolean));
}

async function clickModalAction(page, action) {
  let target;
  if (action.id) {
    target = page.locator(`#${action.id.replace(/([^a-zA-Z0-9_-])/g, "\\$1")}`);
  } else if (action.modalTarget) {
    target = page.locator(`[data-modal-target="${action.modalTarget.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"]`);
  } else if (action.contact) {
    target = page.locator("[data-contact-modal]");
  } else {
    target = page.getByRole(action.role, { name: action.name, exact: true });
  }
  if (await target.count() > 1) target = target.nth(0);
  await target.click({ timeout: 5_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.overlay[id], .overlay .modal, .colorModalOverlay[id], .dt-modal[id], dialog[id], [role="dialog"][id]')]
    .some((el) => {
      const style = getComputedStyle(el);
      return !el.hidden && style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
    }), null, { timeout: 3_000 }).catch(() => {});
  return pageModalIds(page);
}

async function captureAndDismissBlockingModal(page, profile, id) {
  const ratingOverlay = page.locator("#ratingOverlay");
  const hasRatingModal = await ratingOverlay.count() > 0 && await ratingOverlay.isVisible().catch(() => false);
  const genericDialog = page.locator(".overlay:visible").filter({ has: page.locator("button:visible") }).first();
  const hasGenericModal = !hasRatingModal && await genericDialog.count() > 0 && await genericDialog.isVisible().catch(() => false);
  if (!hasRatingModal && !hasGenericModal) return null;

  const session = await page.context().newCDPSession(page);
  let image;
  try {
    const result = await session.send("Page.captureScreenshot", {
      format: "png", fromSurface: true, captureBeyondViewport: false,
    });
    image = Buffer.from(result.data, "base64");
  } finally {
    await session.detach();
  }
  if (hasRatingModal) {
    await page.locator("#btnRatingLater").click({ timeout: 5_000 });
    await ratingOverlay.waitFor({ state: "detached", timeout: 10_000 });
    return { image, id: "ratingOverlay" };
  }

  const modalId = await genericDialog.getAttribute("class").then((value) => value?.split(/\s+/)[0] || "dialog");
  const safeDismiss = genericDialog.getByRole("button", { name: /zamknij|close|anuluj|cancel|później|later|nie/i }).first();
  if (await safeDismiss.count()) {
    await safeDismiss.click();
  } else {
    const buttons = genericDialog.locator("button:visible");
    const count = await buttons.count();
    if (!count) throw new Error(`${profile.label} · ${id}: widoczny modal informacyjny nie ma przycisku do zamknięcia`);
    await buttons.nth(count > 1 ? 0 : count - 1).click();
  }
  await genericDialog.waitFor({ state: "hidden", timeout: 10_000 });
  return { image, id: modalId };
}

async function capture(page, profile, id, href, manifest, prepare = null, readySelector = null, options = {}) {
  const url = `${ORIGIN}${href}${href.includes("?") ? "&" : "?"}lang=pl`;
  const pageErrors = [];
  const onPageError = (error) => pageErrors.push(error.message);
  page.on("pageerror", onPageError);
  if (id === "maintenance") {
    // Podgląd Maintenance korzysta z właściwej strony i jej JS, a przykładowy
    // stan pozwala pokazać ją również wtedy, gdy produkcyjna przerwa jest wyłączona.
    await page.route("**/maintenance-state.json*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({ enabled: true, mode: "message", useStandardText: true }),
    }));
  }
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
  // initPage czeka na odpowiedź na rzeczywisty, blokujący modal oceny. Zapisz
  // go w stanie otwartym i kliknij jego prawdziwy przycisk „Później”, żeby
  // dalszy widok strony pokazywał stan, do którego użytkownik faktycznie dotrze.
  let contentReady = true;
  await page.waitForFunction(() => {
    const rating = document.getElementById("ratingOverlay");
    if (rating) {
      const style = getComputedStyle(rating);
      if (!rating.hidden && style.display !== "none" && style.visibility !== "hidden" && rating.getClientRects().length) return true;
    }
    const genericModal = [...document.querySelectorAll(".overlay .modal")].find((item) => {
      const style = getComputedStyle(item);
      return !item.hidden && style.display !== "none" && style.visibility !== "hidden"
        && item.getClientRects().length && item.querySelector("button");
    });
    if (genericModal) return true;
    const guard = document.getElementById("pageGuard");
    if (guard?.style.display === "flex" && guard.dataset.state) return true;
    const steps = [...document.querySelectorAll("[data-skel-step]")].filter((step) => {
      for (let node = step; node && node !== document.body; node = node.parentElement) {
        if (node.hidden || getComputedStyle(node).display === "none") return false;
      }
      return step.classList.contains("skel-step-ready") || step.getClientRects().length > 0;
    });
    return steps.length > 0 && steps.every((step) => step.classList.contains("skel-step-ready"));
  }, null, { timeout: 20_000 }).catch(() => { contentReady = false; });
  let autoModalImage = null;
  let autoModalId = "";
  const earlyModal = await captureAndDismissBlockingModal(page, profile, id);
  if (earlyModal) {
    autoModalImage = earlyModal.image;
    autoModalId = earlyModal.id;
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
    contentReady = false;
    console.log(`[e20-gallery] ${profile.id} · ${id}: limit oczekiwania na etap treści; zapisuję widoczny stan aplikacji.`);
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
    }, readySelector, { timeout: 20_000 }).catch(() => {
      contentReady = false;
      console.log(`[e20-gallery] ${profile.id} · ${id}: brak elementu ${readySelector}; zapisuję widoczny stan aplikacji.`);
    });
  }
  const pollPageHasId = id === "polls" && /[?&]id=/.test(href);
  const pollBlockedByDeviceGuard = pollPageHasId && await page.evaluate(() => {
    const guard = document.getElementById("pageGuard");
    const state = document.documentElement.dataset.deviceGuard || "";
    return Boolean(guard && state && state !== "ok"
      && getComputedStyle(guard).display !== "none" && guard.getClientRects().length);
  });
  let pollContentReady = false;
  if (pollPageHasId && !pollBlockedByDeviceGuard) {
    // Strona właściciela może chwilowo pokazać rzeczywistą blokadę edycji
    // pozostawioną przez poprzednią kartę galerii. resource-lock.js sam
    // ponawia próbę po zwolnieniu zasobu (lub wygaśnięciu TTL); czekamy na
    // ten stan, zamiast archiwizować ekran blokady jako widok ankiety.
    await page.waitForFunction(() => {
      const guard = document.getElementById("resourceLockGuard");
      return !guard || getComputedStyle(guard).display === "none"
        || getComputedStyle(guard).visibility === "hidden";
    }, null, { timeout: 150_000 }).catch(() => {
      contentReady = false;
      console.log(`[e20-gallery] ${profile.id} · polls: zasób Demo pozostał zablokowany; nie zapisuję ekranu blokady jako ankiety.`);
    });
    await page.waitForFunction(() => {
      const load = document.getElementById("pollLoadState");
      const main = document.getElementById("cardMain");
      const bar = document.getElementById("pollBar");
      const results = document.getElementById("resultsList");
      const meta = document.getElementById("resultsMeta");
      const visible = (element) => element && !element.hidden
        && getComputedStyle(element).display !== "none"
        && element.getClientRects().length > 0;
      return load?.hidden && visible(main) && visible(bar)
        && Boolean(document.getElementById("pollGameName")?.textContent.trim())
        // pollBar/cardMain są gotowe wcześniej niż asynchroniczny odczyt
        // wyników. Czekamy na sygnał po get_poll_preview, żeby nie złapać
        // pustej karty podczas gdy właściwa treść ankiety nadal się ładuje.
        && results?.classList.contains("skel-step-ready")
        && Boolean(meta?.textContent.trim());
    }, null, { timeout: 30_000 }).then(() => {
      pollContentReady = true;
      contentReady = true;
    }).catch(() => {
      contentReady = false;
      console.log(`[e20-gallery] ${profile.id} · polls: brak gotowej ankiety Demo; zrzut nie będzie oznaczony jako stabilny.`);
    });
  }
  // Dane aplikacji są już potwierdzone przez gotowe etapy i readySelector.
  // Nie wymagamy pełnej ciszy sieci: urządzenia gry mają heartbeat, a listy
  // mogą odpytywać backend mimo gotowej treści.
  let contentStable = true;
  try {
    if (!contentReady) throw new Error("etap treści nie jest gotowy");
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
    contentStable = false;
    console.log(`[e20-gallery] ${profile.id} · ${id}: treść nie osiągnęła stabilnego stanu; zapisuję widoczny stan aplikacji.`);
  }
  if (pollContentReady) {
    // Polls używa odpytywania na żywo, które może utrzymywać ogólną klasę
    // loading mimo zakończonego RPC. Własny sygnał wyników (gotowa lista i
    // meta po get_poll_preview) jest tu wiarygodniejszy niż globalny skaner.
    await page.evaluate(() => Promise.all([
      Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 5_000))]),
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    ]));
    contentStable = true;
  }
  if (pollPageHasId && !pollBlockedByDeviceGuard && !pollContentReady) {
    throw new Error(`${profile.label} · polls: ankieta nie osiągnęła stabilnego widoku z rzeczywistymi danymi`);
  }
  const blockedByGuard = await page.evaluate(() => {
    const state = document.documentElement.dataset.deviceGuard || "";
    return state !== "" && state !== "ok" && document.getElementById("pageGuard")?.style.display === "flex";
  });
  // Stany interaktywne nie zastępują guarda: na niedostępnym urządzeniu
  // zapisujemy ten guard zamiast wymuszać klik w ukryty zasób.
  let preparedState = null;
  if (prepare && !blockedByGuard && contentReady) {
    const lateModal = await captureAndDismissBlockingModal(page, profile, id);
    if (lateModal && !autoModalImage) {
      autoModalImage = lateModal.image;
      autoModalId = lateModal.id;
    }
    preparedState = await prepare(page);
    if (options.expectedModalId) {
      await page.locator(`#${options.expectedModalId}`).waitFor({ state: "visible", timeout: 15_000 });
    }
    if (options.expectedVisibleSelector) {
      await page.locator(options.expectedVisibleSelector).waitFor({ state: "visible", timeout: 15_000 });
    }
  }
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
  if (state.scrollWidth > state.viewportWidth + 1) {
    throw new Error(`${profile.label} · ${id}: poziomy overflow ${state.scrollWidth}px przy viewport ${state.viewportWidth}px`);
  }
  if (contentReady && ["games", "bases", "logos"].includes(id) && state.listBottomMetrics?.available > 0) {
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
  const modalCandidates = options.modalCapture || options.skipAutoModals ? [] : await findModalActions(page, id).catch(() => []);
  if (options.requireModal && !modalIds.length) {
    throw new Error(`${profile.label} · ${id}: akcja „${options.actionLabel || "?"}” nie otworzyła prawdziwego modala`);
  }
  if (options.expectedModalId && !modalIds.includes(options.expectedModalId)) {
    throw new Error(`${profile.label} · ${id}: oczekiwano modala #${options.expectedModalId}, widoczne: ${modalIds.join(", ") || "brak"}`);
  }
  if (options.expectedVisibleSelector && !await page.locator(options.expectedVisibleSelector).isVisible().catch(() => false)) {
    throw new Error(`${profile.label} · ${id}: oczekiwano widocznej warstwy ${options.expectedVisibleSelector}`);
  }
  const safeModalName = (modalIds[0] || "dialog").replace(/[^a-zA-Z0-9_-]/g, "-");
  const fileName = options.fileName || (options.modalCapture
    ? `modal-${safeModalName}-${profile.id}.png`
    : options.stateId ? `${options.stateId}-${profile.id}.png` : `${profile.id}.png`);
  const finalUrl = page.url();
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  // Każdy plik ma przedstawiać rzeczywisty ekran urządzenia. Pełnostronicowe
  // zrzuty na długich/animowanych widokach wisiały w Chromium po 45 s; wysokość
  // całej strony pozostaje w manifeście, a screenshot zachowuje viewport i safe area.
  await saveDeviceScreenshot(page, profile, id, path.join(OUT, id, fileName), Boolean(options.modalCapture));
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
    contentReady,
    contentStable,
    ...state,
  });
  if (autoModalImage) {
    const fileName = `modal-${autoModalId || "dialog"}-${profile.id}.png`;
    const file = `${id}/${fileName}`;
    await saveDeviceScreenshot(page, profile, id, path.join(OUT, id, fileName), false, autoModalImage);
    manifest.push({
      id,
      stateId: `modal:${autoModalId || "dialog"}`,
      profile: profile.id,
      label: profile.label,
      safeAreaInsets: expectedSafe,
      url: href,
      finalUrl,
      actionLabel: "Później",
      file,
    });
  }
  // Checkpoint after every image so a failed profile still leaves useful work.
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(MANIFEST_DIR, `manifest-${profile.id}.json`), JSON.stringify(manifest, null, 2));
  return { modalIds, modalCandidates: contentReady ? modalCandidates : [], blockedByGuard, preparedState, autoModalCaptured: Boolean(autoModalImage) };
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
        .filter(([id]) => !requestedPages.length || requestedPages.includes(id));

      // Home/Login są publiczne: fotografujemy je w jednej tymczasowej
      // niezalogowanej sesji, zamykamy ją, a dopiero potem otwieramy sesję
      // konta. Nie uruchamiamy testów guarda gościa ani dwóch stron naraz.
      // Te strony mogą wylogować aktywną sesję. To publiczne przepływy
      // logowania, więc fotografujemy je przed prywatnymi stronami.
      const publicUrls = selectedUrls.filter(([id]) => ["home", "login", "login-confirm", "login-reset"].includes(id));
      if (publicUrls.length) {
        const publicContext = await browser.newContext(deviceOptions);
        try {
          await withE2EBypass(publicContext);
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
        await withE2EBypass(context);
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
              : id === "logos"
                ? (data.logos.text || data.logos.draw || data.logos.image)
                  ? `.logoTile[data-key="${(data.logos.text || data.logos.draw || data.logos.image).id}"]` : null
                : null;
          const isControl = id === "control";
          const isBaseExplorer = id === "base-explorer";
          const baseState = await capture(page, profile, id, href, manifest, null, readySelector, { skipAutoModals: isControl || isBaseExplorer });
          if (baseState.autoModalCaptured) modalCaptureCount += 1;
          if (isBaseExplorer && !baseState.blockedByGuard) {
            const tagShots = [
              {
                stateId: "modal:tags-assign",
                fileName: `modal-tags-assign-${profile.id}.png`,
                layerId: "tagsL1",
                actionLabel: "Tagi → przypisz",
                prepare: async (modalPage) => {
                  let question = modalPage.locator('#list .row[data-kind="q"][data-id]').first();
                  for (let depth = 0; depth < 12 && !await question.isVisible().catch(() => false); depth += 1) {
                    const folder = modalPage.locator('#list .row[data-kind="cat"][data-id]').first();
                    if (!await folder.isVisible().catch(() => false)) break;
                    await folder.dblclick();
                    await modalPage.waitForTimeout(250);
                  }
                  await question.waitFor({ state: "visible", timeout: 15_000 });
                  await question.click();
                  const action = modalPage.locator('#toolbar [data-act="editTags"]');
                  await action.waitFor({ state: "visible", timeout: 5_000 });
                  await action.click();
                },
              },
              {
                stateId: "modal:tags-create",
                fileName: `modal-tags-create-${profile.id}.png`,
                layerId: "tagsL2",
                actionLabel: "Tagi → dodaj tag",
                prepare: async (modalPage) => {
                  const drawer = modalPage.locator("#btnDrawerToggle");
                  if (await drawer.isVisible().catch(() => false)) await drawer.click();
                  await modalPage.locator("#btnAddTag").click();
                },
              },
              {
                stateId: "modal:tags-color",
                fileName: `modal-tags-color-${profile.id}.png`,
                layerId: "tagsL3",
                actionLabel: "Tagi → dodaj tag → wybierz kolor",
                prepare: async (modalPage) => {
                  const drawer = modalPage.locator("#btnDrawerToggle");
                  if (await drawer.isVisible().catch(() => false)) await drawer.click();
                  await modalPage.locator("#btnAddTag").click();
                  await modalPage.locator("#tagsEditColorTile").click();
                },
              },
            ];
            // Najpierw warstwy dostępne bez zaznaczenia rekordu; przypisanie
            // wymaga istniejącego pytania i jego blokady edycji.
            tagShots.push(tagShots.shift());
            for (const shot of tagShots) {
              await page.close();
              page = await context.newPage();
              page.setDefaultTimeout(20_000);
              page.setDefaultNavigationTimeout(20_000);
              await capture(
                page, profile, id, href, manifest, shot.prepare, null,
                {
                  modalCapture: true,
                  requireModal: true,
                  expectedModalId: "tagsOverlay",
                  actionLabel: shot.actionLabel,
                  stateId: shot.stateId,
                  fileName: shot.fileName,
                  expectedVisibleSelector: `#${shot.layerId}`,
                },
              );
              modalCaptureCount += 1;
            }
          }
          if (isControl && !baseState.blockedByGuard) {
            await page.close();
            page = await context.newPage();
            page.setDefaultTimeout(20_000);
            page.setDefaultNavigationTimeout(20_000);
            const result = await capture(
              page, profile, id, href, manifest,
              async (modalPage) => {
                const shareButton = modalPage.locator('#app .device-row[data-device="display"] button')
                  .filter({ hasText: /Udostępnij/ }).first();
                await shareButton.waitFor({ state: "visible", timeout: 15_000 });
                await shareButton.click();
              },
              null,
              { modalCapture: true, requireModal: true, expectedModalId: "shareDeviceOverlay", actionLabel: "Urządzenia → Udostępnij urządzenie", stateId: "modal:share-device", fileName: `modal-share-device-${profile.id}.png` },
            );
            if (result.modalIds.includes("shareDeviceOverlay")) modalCaptureCount += 1;
          }
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
                    const duplicateFile = latest.file;
                    manifest.pop();
                    if (!manifest.some((entry) => entry.file === duplicateFile)) {
                      fs.rmSync(path.join(OUT, duplicateFile), { force: true });
                    }
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
        const extra = additionalStates(data).filter((state) =>
          (!requestedPages.length || requestedPages.includes(state.page))
          && (!state.mobileOnly || (profile.mobile && (profile.width <= 1100 || profile.height <= 720))));
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
          await capture(page, profile, state.id, state.href, manifest, state.prepare, null, { stateId: state.stateId });
        }
        expect(manifest.filter((entry) => !entry.stateId)).toHaveLength(selectedUrls.length);
        const recordedModalCaptures = manifest.filter((entry) => String(entry.stateId || "").startsWith("modal:")).length;
        if (recordedModalCaptures !== modalCaptureCount) {
          console.log(`[e20-gallery] ${profile.id}: zapisano ${recordedModalCaptures} rzeczywistych dialogów i stanów informacyjnych.`);
        }
        const layoutIssues = manifest.filter((entry) => entry.scrollWidth > entry.viewportWidth + 1);
        expect(layoutIssues, `Poziomy overflow: ${JSON.stringify(layoutIssues.map(({ id, url, scrollWidth, viewportWidth }) => ({ id, url, scrollWidth, viewportWidth })))}`).toEqual([]);
        const incomplete = manifest.filter((entry) => entry.contentReady === false || entry.contentStable === false);
        if (incomplete.length) {
          console.log(`[e20-gallery] ${profile.id}: ${incomplete.length} widoków zapisano w stanie ładowania aplikacji (${[...new Set(incomplete.map((entry) => entry.id))].join(", ")}).`);
        }
      } finally {
        await context.close();
      }
    }
  });
}
