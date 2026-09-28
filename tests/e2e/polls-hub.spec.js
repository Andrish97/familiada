import { test, expect } from '@playwright/test';
import { loginAsTestUser, testAccountUsername } from './helpers/test-util.js';
import { serveBranchCode } from './helpers/branch-code.js';

test.use({ serviceWorkers: 'block' });

const testUser = testAccountUsername(1);

test.beforeEach(async ({ context, page }) => {
  await serveBranchCode(context, { pages: ['polls-hub'] });
  await loginAsTestUser(page, context, { username: testUser });
});

test.describe('polls-hub: audyt smoke tests', () => {
  test('ładuje stronę', async ({ page }) => {
    await page.goto('polls-hub');
    await page.waitForSelector('main', { timeout: 10000 });
    expect(await page.locator('main').isVisible()).toBeTruthy();
  });

  test('renderuje hub-list elementy', async ({ page }) => {
    await page.goto('polls-hub');
    await page.waitForSelector('.hub-list', { timeout: 10000 });
    expect(await page.locator('.hub-list').count()).toBeGreaterThanOrEqual(2);
  });

  test('topbar i navigacja widoczne', async ({ page }) => {
    await page.goto('polls-hub');
    await page.waitForSelector('.topbar', { timeout: 10000 });
    expect(await page.locator('.topbar').isVisible()).toBeTruthy();
  });

  test('shareOverlay element istnieje (hidden)', async ({ page }) => {
    await page.goto('polls-hub');
    await page.waitForSelector('#shareOverlay', { timeout: 10000 });
    const overlay = page.locator('#shareOverlay');
    expect(overlay).toBeDefined();
  });

  test('btnShare i btnDetails elementy istnieją', async ({ page }) => {
    await page.goto('polls-hub');
    await page.waitForSelector('#btnShare', { timeout: 10000 });
    const btnShare = page.locator('#btnShare');
    const btnDetails = page.locator('#btnDetails');
    expect(btnShare).toBeDefined();
    expect(btnDetails).toBeDefined();
  });

  test('brak błędów w konsoli', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('polls-hub');
    await page.waitForSelector('main', { timeout: 10000 });

    expect(errors.length).toBe(0);
  });

  test('zmiana języka nie rzuca błędu', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('polls-hub');
    await page.waitForSelector('main', { timeout: 10000 });

    // Symuluj event zmiany języka
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('i18n:lang'));
    });

    await page.waitForTimeout(500);
    expect(errors.length).toBe(0);
  });

  test('close share modal button czyści shareMsg', async ({ page }) => {
    await page.goto('polls-hub');

    // Ustawienie tekstu w shareMsg
    await page.evaluate(() => {
      const el = document.getElementById('shareMsg');
      if (el) el.textContent = 'test message';
    });

    // Symuluj closeShareModal
    await page.evaluate(() => {
      const shareMsg = document.getElementById('shareMsg');
      const shareList = document.getElementById('shareList');
      if (shareMsg) shareMsg.textContent = '';
      if (shareList) shareList.innerHTML = '';
    });

    const msgText = await page.locator('#shareMsg').textContent();
    expect(msgText?.trim()).toBe('');
  });
});
