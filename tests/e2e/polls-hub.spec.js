import { test, expect } from '@playwright/test';

test.describe('polls-hub', () => {
  test('production: strona się ładuje', async ({ page }) => {
    // Test na pure production
    await page.goto('/login');

    // Czekaj aż strona się załaduje
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    expect(await page.locator('input[type="email"]').isVisible()).toBeTruthy();
  });

  test('production: home page dostępna', async ({ page }) => {
    await page.goto('/');

    // Czekaj aż main się załaduje
    await page.waitForSelector('main', { timeout: 10000 });
    expect(await page.locator('main').isVisible()).toBeTruthy();
  });

  test('production: games page dostępna', async ({ page }) => {
    await page.goto('/games');

    // Jeśli nie zalogowany, powinno redirect na login
    // Lub powinno być main element
    const currentUrl = page.url();
    const hasMainOrLogin =
      currentUrl.includes('login') ||
      (await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false));

    expect(hasMainOrLogin).toBeTruthy();
  });

  test('production: brak błędów JS w konsoli (sample)', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Załaduj stronę główną
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Czekaj chwilę na ewentualne JS errory
    await page.waitForTimeout(1000);

    // Powinno być mało error logsów
    expect(errors.length).toBeLessThan(5);
  });
});
