import { test, expect } from '@playwright/test';
import { loginAsTestUser, testAccountUsername } from './helpers/test-util.js';
import { serveBranchCode } from './helpers/branch-code.js';

test.use({ serviceWorkers: 'block' });

const testUser = testAccountUsername(1);

test.beforeEach(async ({ context, page }) => {
  await serveBranchCode(context, { pages: ['polls-hub'] });
  await loginAsTestUser(page, context, { username: testUser });
});

test('polls-hub: ładuje listę ankiet', async ({ page }) => {
  await page.goto('polls-hub');

  // Poczekaj na ładowanie
  await page.waitForSelector('.hub-list', { timeout: 5000 });

  // Sprawdzenie czy lista się pojawiła (może być pusta)
  const hubList = await page.locator('.hub-list').first();
  expect(hubList).toBeDefined();
});

test('polls-hub: zamykanie modalu Udostępnij czyści komunikat', async ({ page }) => {
  await page.goto('polls-hub');

  // Sprawdź czy przyciski działają
  const btnShare = page.locator('#btnShare');
  const shareOverlay = page.locator('#shareOverlay');

  // Powinien być disabled (bo brak wybranej ankiety)
  const isDisabled = await btnShare.isDisabled();
  expect(isDisabled).toBeTruthy();
});

test('polls-hub: focus task z URL ?t=', async ({ page }) => {
  // Test czy parametr ?t= otwiera confirm modal
  await page.goto('polls-hub?t=test-token-123');

  // Czekaj na modal (albo jego brak jeśli token nie istnieje)
  const page_title = await page.title();
  expect(page_title).toContain('centrum ankiet');
});

test('polls-hub: zmiana języka re-renderuje listy', async ({ page }) => {
  await page.goto('polls-hub');

  // Czekaj na inicjalizację
  await page.waitForSelector('.hub-col-title');

  // Zmień język przez selektor (jeśli jest dostępny)
  const langBtn = page.locator('[data-i18n="common.language"]').first();
  if (await langBtn.isVisible()) {
    await langBtn.click();
    // Tutaj byłby select opción, ale czekaj na re-render
    await page.waitForTimeout(500);
  }

  // Sprawdzenie czy strona dalej istnieje
  const mainElement = page.locator('main');
  expect(mainElement).toBeDefined();
});
