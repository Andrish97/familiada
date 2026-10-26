const { test, expect } = require('@playwright/test');
const { serveBranchCode } = require('./helpers/branch-code');

test.use({ serviceWorkers: 'block' });

test('Wskazówki ładują spis, bieżący rozdział i indeks dopiero gdy są potrzebne', async ({ page, context }) => {
  await serveBranchCode(context, { pages: ['manual'] });
  const contentRequests = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/manual/content/')) contentRequests.push(path);
  });

  await page.goto('https://www.familiada.online/manual/?lang=pl');
  await expect(page.locator('.m-part-card')).toHaveCount(3);
  expect(contentRequests).toContain('/manual/content/meta/pl.js');
  expect(contentRequests).toContain('/manual/content/chapter-loaders.js');
  expect(contentRequests).not.toContain('/manual/content/pl.js');
  expect(contentRequests.some(path => path.includes('/chapters/'))).toBe(false);

  await page.locator('.m-part-chapters a').first().click();
  await expect(page.locator('.m-doc')).not.toBeEmpty();
  expect(contentRequests).toContain('/manual/content/chapters/pl/1.js');
  expect(contentRequests).not.toContain('/manual/content/pl.js');

  if (await page.locator('#manualSearchToggle').isVisible()) await page.locator('#manualSearchToggle').click();
  await page.locator('#manualSearch .searchText').fill('kradzież');
  await expect(page.locator('.m-search-hit').first()).toBeVisible();
  expect(contentRequests).toContain('/manual/content/pl.js');
});
