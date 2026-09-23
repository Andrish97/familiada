// Samowystarczalny test wspólnego systemu ikon. W CI działa na lokalnym
// serwerze statycznym, więc nie potrzebuje Supabase, Cloudflare Access ani
// kont testowych. Oprócz asercji zapisuje dwie galerie i podglądy settings.

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");

async function loadIconModule(page) {
  return page.evaluate(async () => {
    const mod = await import(`/js/core/icons.js?e2e=${Date.now()}`);
    const icons = Object.entries(mod)
      .filter(([name, value]) => name.endsWith("_ICON") && typeof value === "string")
      .sort(([a], [b]) => a.localeCompare(b));
    return {
      names: icons.map(([name]) => name),
      markup: icons.map(([name, svg]) => ({ name, svg })),
      sharedNames: Object.keys(mod.SHARED_ICON_MAP).sort(),
    };
  });
}

async function renderGallery(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const data = await loadIconModule(page);

  await page.evaluate(({ markup, width }) => {
    document.documentElement.style.colorScheme = "dark";
    document.body.innerHTML = `
      <main id="iconE2EGallery">
        <h1>Wspólny system ikon — ${markup.length}</h1>
        <div class="grid"></div>
      </main>`;
    const style = document.createElement("style");
    style.textContent = `
      *{box-sizing:border-box}body{margin:0;background:#080b13;color:#fff;font:14px system-ui,sans-serif}
      main{padding:${width < 600 ? 14 : 24}px}h1{font-size:${width < 600 ? 20 : 26}px;margin:0 0 18px}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${width < 600 ? 94 : 125}px,1fr));gap:10px}
      .cell{min-height:104px;display:grid;place-items:center;align-content:center;gap:10px;padding:12px 8px;border:1px solid #30394a;border-radius:12px;background:#151a25;color:#fff;text-align:center}
      .cell svg{width:34px;height:34px;fill:currentColor}.cell span{font-size:10px;line-height:1.2;overflow-wrap:anywhere;color:#b9c2d1}`;
    document.head.appendChild(style);
    const grid = document.querySelector(".grid");
    for (const { name, svg } of markup) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.innerHTML = `${svg}<span>${name}</span>`;
      grid.appendChild(cell);
    }
  }, { markup: data.markup, width: viewport.width });

  return data;
}

test.describe("wspólny system ikon SVG", () => {
  test("każdy eksport jest poprawnym, dostępnym SVG", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const data = await loadIconModule(page);
    expect(data.names.length).toBeGreaterThanOrEqual(50);

    const problems = await page.evaluate(async () => {
      const mod = await import(`/js/core/icons.js?validate=${Date.now()}`);
      const out = [];
      for (const [name, markup] of Object.entries(mod)) {
        if (!name.endsWith("_ICON") || typeof markup !== "string") continue;
        const box = document.createElement("div");
        box.innerHTML = markup.trim();
        const svg = box.firstElementChild;
        if (!svg || svg.tagName.toLowerCase() !== "svg") out.push(`${name}: brak pojedynczego svg`);
        else {
          if (!svg.getAttribute("viewBox")) out.push(`${name}: brak viewBox`);
          if (svg.getAttribute("aria-hidden") !== "true") out.push(`${name}: brak aria-hidden=true`);
          if (svg.getAttribute("focusable") !== "false") out.push(`${name}: brak focusable=false`);
          if (box.children.length !== 1) out.push(`${name}: dodatkowe elementy obok svg`);
        }
      }
      return out;
    });
    expect(problems).toEqual([]);
  });

  test("każde data-shared-icon użyte w repo istnieje i hydratuje się", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const data = await loadIconModule(page);
    const used = new Set();
    const scanRoots = ["."];
    const ignored = new Set([".git", "node_modules", "test-results", "playwright-report"]);
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (/\.(?:html|js)$/.test(entry.name)) {
          const source = fs.readFileSync(absolute, "utf8");
          for (const match of source.matchAll(/data-shared-icon=["']([^"']+)["']/g)) used.add(match[1]);
        }
      }
    };
    for (const root of scanRoots) walk(path.join(REPO_ROOT, root));

    const missing = [...used].filter(name => !data.sharedNames.includes(name)).sort();
    expect(missing, "nazwy data-shared-icon bez wpisu w SHARED_ICON_MAP").toEqual([]);

    const hydration = await page.evaluate(async () => {
      const mod = await import(`/js/core/icons.js?hydrate=${Date.now()}`);
      const host = document.createElement("div");
      for (const name of Object.keys(mod.SHARED_ICON_MAP)) {
        const el = document.createElement("span");
        el.dataset.sharedIcon = name;
        host.appendChild(el);
      }
      document.body.appendChild(host);
      mod.hydrateSharedIcons(host);
      return [...host.children]
        .filter(el => el.children.length !== 1 || el.firstElementChild?.tagName.toLowerCase() !== "svg")
        .map(el => el.dataset.sharedIcon);
    });
    expect(hydration).toEqual([]);
  });

  test("galeria desktop — zrzut wszystkich ikon", async ({ page }, testInfo) => {
    const data = await renderGallery(page, { width: 1440, height: 900 });
    expect(await page.locator(".cell").count()).toBe(data.names.length);
    await page.screenshot({ path: testInfo.outputPath("icon-system-desktop.png"), fullPage: true });
  });

  test("galeria mobile — zrzut wszystkich ikon", async ({ page }, testInfo) => {
    const data = await renderGallery(page, { width: 390, height: 844 });
    expect(await page.locator(".cell").count()).toBe(data.names.length);
    await page.screenshot({ path: testInfo.outputPath("icon-system-mobile.png"), fullPage: true });
  });

  test("settings bez bazy — wspólne ikony i kalendarz desktop/mobile", async ({ page }, testInfo) => {
    await page.route("https://**/*", route => route.abort());
    await page.goto("/settings.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      document.documentElement.classList.remove("page-loading");
      document.body.classList.remove("settings-locked", "skel-body");
      document.querySelector("#authScreen")?.setAttribute("hidden", "");
      const panel = document.querySelector("#panelScreen");
      if (panel) panel.hidden = false;
      document.querySelector("#modeMessage")?.setAttribute("hidden", "");
      document.querySelector("#modeReturnAt")?.removeAttribute("hidden");
      document.querySelector("#modeCountdown")?.removeAttribute("hidden");
      const mod = await import(`/js/core/icons.js?settings-e2e=${Date.now()}`);
      mod.hydrateSharedIcons(document);
    });

    const calendarButtons = page.locator('.dt-open [data-shared-icon="calendar"] svg');
    await expect(calendarButtons).toHaveCount(2);
    for (const icon of await calendarButtons.all()) {
      await expect(icon.locator("text")).toHaveCount(0);
      await expect(icon.locator("path[fill-rule='evenodd']")).toHaveCount(1);
    }
    expect(await page.locator("[data-shared-icon]:not(:has(svg))").count()).toBe(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#panelScreen").screenshot({ path: testInfo.outputPath("settings-icons-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#panelScreen").screenshot({ path: testInfo.outputPath("settings-icons-mobile.png") });
  });
});
