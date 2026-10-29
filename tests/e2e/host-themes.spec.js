const { test, expect } = require(process.env.E2E_BYPASS_SECRET ? "./helpers/production-test" : "./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", viewport: { width: 1400, height: 900 } });
test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["control/host"] });
});

const harness = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>
<script>window.hostReady=false;addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='familijna:host-preview-ready')window.hostReady=true});</script>
<iframe id="host" src="/control/host/?preview=1&lang=pl"></iframe>`;

test("Host themes: dedicated frames preserve questions, answers, cover and portrait layout", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/__host_theme_preview", route => route.fulfill({ contentType: "text/html", body: harness }));
  await page.goto("/__host_theme_preview");
  await page.waitForFunction(() => window.hostReady);
  const host = page.frameLocator("#host");
  const { buildGameState } = await import("../../scripts/screens/data/game-state.mjs");
  const row = buildGameState("pl", "round");
  row.detail.host.covered = false;
  row.detail.display.colors = { A: "#25a56a", B: "#ef8e24", BACKGROUND: "#264851", DOT: "#d7ff3d" };
  const apply = async () => {
    row.rev += 1;
    await page.evaluate(row => document.getElementById("host").contentWindow.postMessage({ type: "familijna:preview-row", row }, location.origin), row);
  };
  const frames = new Set();
  // Tło Prowadzącego jest stałe w motywie (host.css), niezależne od trzeciego koloru gry.
  const hostBackground = { wings: "#152238", radar: "#103d43", cabinet: "#352719", ribbon: "#36233f", bridge: "#252e35" };
  for (const theme of ["wings", "radar", "cabinet", "ribbon", "bridge"]) {
    row.detail.display.theme = theme;
    await apply();
    await expect(host.locator("html")).toHaveAttribute("data-host-theme", theme);
    await expect(host.locator("html")).toHaveAttribute("data-host-board", "true");
    await expect(host.locator("#paperText1")).toContainText(row.detail.rounds.question.text);
    for (const answer of row.detail.rounds.answers) {
      await expect(host.locator("#paperText2")).toContainText(`${answer.text} (${answer.fixed_points})`);
    }
    const palette = await host.locator("html").evaluate(el => {
      const style = getComputedStyle(el);
      return ["--host-background", "--host-cover-grad-a", "--host-cover-grad-b"].map(key => style.getPropertyValue(key).trim());
    });
    expect(palette).toEqual([hostBackground[theme], "#25a56a", "#ef8e24"]);
    frames.add(await host.locator(".pane1").evaluate(el => {
      const style = getComputedStyle(el);
      return [style.borderRadius, style.borderStyle, style.borderWidth, style.clipPath].join("|");
    }));
    row.detail.host.covered = true;
    await apply();
    await expect(host.locator("#cover2")).toHaveClass(/coverOn/);
    await expect(host.locator("#cover2Logo")).toBeVisible();
    row.detail.host.covered = false;
    await apply();
    await expect(host.locator("#cover2")).toHaveClass(/coverOff/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator("html")).toHaveClass(/portrait/);
    const first = await host.locator(".pane1").boundingBox();
    const second = await host.locator(".pane2").boundingBox();
    expect(first.y + first.height).toBeLessThanOrEqual(second.y);
    expect(second.y + second.height).toBeLessThanOrEqual(844);
    await expect(host.locator("#paperText2")).toBeVisible();
    await page.setViewportSize({ width: 1400, height: 900 });
  }
  expect(frames.size).toBe(5);
  for (const theme of ["classic", "modern"]) {
    row.detail.display.theme = theme;
    await apply();
    await expect(host.locator("html")).toHaveAttribute("data-host-theme", theme);
    await expect(host.locator("html")).toHaveAttribute("data-host-board", "false");
    await expect(host.locator("html")).toHaveAttribute("data-host-ruled", String(theme === "classic"));
    await expect(host.locator("#paperText2")).toContainText(row.detail.rounds.answers[0].text);
    // Krój wszyty w plik motywu (host.fonts) jest załadowany.
    const family = theme === "classic" ? "Caveat-Variable" : "JetBrainsMono-Variable";
    await expect.poll(() => host.locator("html").evaluate((_html, name) => [...document.fonts].some(face => face.family.replace(/"/g, "") === name && face.status === "loaded"), family)).toBe(true);
  }
  expect(errors).toEqual([]);
});
