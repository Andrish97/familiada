import { test, expect } from '@playwright/test';
import { loginAsTestUser, testAccountUsername } from './helpers/test-util.js';
import { serveBranchCode } from './helpers/branch-code.js';

test.use({ serviceWorkers: 'block' });

test.describe('polls-hub', () => {
  test('production: ładuje polls-hub', async ({ page }) => {
    // Test na produkcji bez branch-code
    await loginAsTestUser(page, {}, { username: testAccountUsername(1) });
    await page.goto('/polls-hub');

    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 15000 });
  });

  test('production: hub-list widoczny', async ({ page }) => {
    await loginAsTestUser(page, {}, { username: testAccountUsername(1) });
    await page.goto('/polls-hub');

    const hubList = page.locator('.hub-list').first();
    await expect(hubList).toBeVisible({ timeout: 15000 });
  });
});
