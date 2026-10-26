// Publiczne wejścia bez kont, wysyłki wiadomości i zmian danych.
const { test, expect } = require('@playwright/test');
const { serveBranchCode } = require('./helpers/branch-code');
const ORIGIN = 'https://www.familiada.online';
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE === '1') await serveBranchCode(context, { pages: ['index', 'privacy'] });
});

for (const width of [390, 1400]) test(`public loading: contact loads on demand and reopens at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const requests = [], errors = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${ORIGIN}/privacy/?lang=pl`, { waitUntil: 'networkidle' });
  expect(requests).not.toContain('/shared/js/core/contact-dialog.js');
  await page.locator('[data-contact-modal]').first().click();
  await expect(page.locator('#cModalMessage')).toBeVisible();
  await page.locator('#cModalMessage').fill('Wiadomość pozostaje w otwartym formularzu.');
  expect(requests.filter(url => url === '/shared/js/core/contact-dialog.js')).toHaveLength(1);
  await page.locator('#cModalClose').click();
  await expect(page.locator('#cModalMessage')).toBeHidden();
  await page.locator('[data-contact-modal]').first().click();
  await expect(page.locator('#cModalMessage')).toHaveValue('Wiadomość pozostaje w otwartym formularzu.');
  expect(requests.filter(url => url === '/shared/js/core/contact-dialog.js')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('public loading: the home image viewer loads after keyboard activation', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const requests = [], errors = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${ORIGIN}/?lang=pl`, { waitUntil: 'networkidle' });
  expect(requests).not.toContain('/shared/js/core/image-viewer.js');
  const shot = page.locator('.tile-shot').first();
  await shot.focus(); await shot.press('Enter');
  await expect(page.locator('#imgvOverlay.is-open .imgv-img')).toBeVisible();
  expect(requests).toContain('/shared/js/core/image-viewer.js');
  await page.keyboard.press('Escape');
  await expect(page.locator('#imgvOverlay')).not.toHaveClass(/is-open/);
  expect(errors).toEqual([]);
});
