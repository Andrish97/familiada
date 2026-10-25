const { test, expect } = require('./helpers/e2e-test');
const { serveBranchCode } = require('./helpers/branch-code');
test.use({ serviceWorkers: 'block', needs: { standard: 1 } });
test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE === '1') await serveBranchCode(context, { pages: ['games', 'privacy', 'manual'] });
});

test.describe('hamburger', () => {
  test('animowane części: menu ma stan, obsługę klawiatury i nie zmienia wymiarów', async ({ page, context, accounts, loginAs }) => {
    await loginAs(page, context, accounts.standard[0]);
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/games/?lang=pl', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).not.toHaveAttribute('data-layout-pending', '');
      const button = page.locator('.topbar-menu-toggle');
      await expect(button).toHaveAttribute('aria-expanded', 'false').catch(async error => {
        console.log('[e2e-diag] menu-layout', await page.evaluate(() => ({ width: innerWidth,
          compact: document.documentElement.hasAttribute('data-compact'), device: document.documentElement.dataset.device,
          topbar: document.querySelector('.topbar')?.className,
          sections: [2, 3, 4].map(n => document.querySelector(`.topbar-section-${n}`)?.getBoundingClientRect().width),
        })));
        throw error;
      });
      const box = await button.boundingBox();
      await button.focus(); await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      const middle = button.locator('[data-icon-part="middle"]');
      await expect(middle).toHaveCSS('opacity', '0');
      await expect(page.locator('#topbarAccountMenu').getByRole('button', { name: 'Wyloguj', exact: true })).toBeVisible();
      expect(await button.boundingBox()).toEqual(box);
      const panel = page.locator('.topbar-mobile-panel');
      await expect(panel).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
      const drawerBox = await panel.boundingBox();
      expect(Math.abs(drawerBox.x + drawerBox.width - width)).toBeLessThan(1);
      expect(drawerBox.width).toBeLessThanOrEqual(320);
      await expect(page.locator('.topbar-mobile-close')).toHaveCount(0);
      await page.keyboard.press('Tab');
      expect(await page.locator('.topbar-mobile-overlay').evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(middle).toHaveCSS('opacity', '1');
      await button.click(); await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await button.click();
      await expect(middle).toHaveCSS('opacity', '0');
      await page.locator('.topbar-menu-toggle').click();
      await expect(button).toBeFocused();
      await button.click();
      await page.locator('.topbar-mobile-overlay').click({ position: { x: 8, y: 80 } });
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.topbar-mobile-overlay')).toHaveAttribute('inert', '');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
  });
});

test('animowane części: para zmienia krzywą, filiżanka stoi, ograniczony ruch zatrzymuje parę', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/privacy/?lang=pl', { waitUntil: 'domcontentloaded' });
  const button = page.locator('.btn-support-footer');
  await button.scrollIntoViewIfNeeded();
  const svg = button.locator('svg[data-icon-animation="steam"]');
  expect((await svg.boundingBox()).width).toBeGreaterThanOrEqual(36);
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(svg).toHaveAttribute('data-icon-running', '');
  const sample = () => svg.evaluate(el => {
    const wave = el.querySelector('[data-icon-part="steam-1"]');
    const point = wave.getPointAtLength(wave.getTotalLength() * .3);
    const cup = el.querySelector('[data-icon-part="cup"]').getBBox();
    return { x: point.x, cup: [cup.x, cup.y, cup.width, cup.height] };
  });
  const before = await sample();
  await expect.poll(async () => Math.abs((await sample()).x - before.x)).toBeGreaterThan(.05);
  expect((await sample()).cup).toEqual(before.cup);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(svg).not.toHaveAttribute('data-icon-running', '');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const quiet = await sample();
  await page.waitForTimeout(250);
  expect(await sample()).toEqual(quiet);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(svg).toHaveAttribute('data-icon-running', '');
  await page.evaluate(() => scrollTo(0, 0));
  await expect(svg).not.toHaveAttribute('data-icon-running', '');
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(page.locator('.support-modal')).toBeVisible();
});

test('wysuwane panele: spis Wskazówek z lewej, Escape i wzajemne zamykanie', async ({ page }) => {
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/manual/?ch=6&lang=pl', { waitUntil: 'domcontentloaded' });
    const toggle = page.locator('#manualTocToggle');
    const toc = page.locator('#manualToc');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle.locator('[data-icon-part="middle"]')).toHaveCSS('opacity', '0');
    await expect(toc).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const tocBox = await toc.boundingBox();
    expect(tocBox.x).toBe(0);
    const toggleBox = await toggle.boundingBox();
    expect(tocBox.y).toBeGreaterThanOrEqual(toggleBox.y + toggleBox.height);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await expect(toc).toHaveAttribute('inert', '');
    await toggle.click();
    const menu = page.locator('.topbar-menu-toggle');
    await menu.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await toggle.click();
    await page.locator('#manualTocBackdrop').click({ position: { x: width - 8, y: 70 } });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(toc).not.toHaveAttribute('inert', '');
    await expect(toc).toBeVisible();
  }
});
