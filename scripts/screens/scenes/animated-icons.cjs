const { IDS } = require('../data/demo.cjs');
const login = require('./people.cjs').find(scene => scene.id === 'people-login');
const sources = ['web/shared/js/core/icons.js', 'web/shared/js/core/icon-parts.js', 'web/shared/style/base.css'];
module.exports = [
  { ...login, id: 'icons-password-visible', category: 'Dodatkowe', title: 'Hasło — animowane oko',
    sources: [...sources, 'web/shared/js/core/auth.js'],
    steps: [login.steps[0], async view => { await view.locator('.pass-toggle').first().click(); await view.waitForTimeout(250); }] },
  { id: 'icons-settings-saved', category: 'Dodatkowe', title: 'Ustawienia — potwierdzenie zapisu w ikonie', path: `/games/settings/?id=${IDS.game}`,
    sources: [...sources, 'web/games/settings/'], ready: '#gsTeamA',
    steps: [async view => {
      await view.locator('#gsTeamA').fill('Zespół A2'); await view.locator('#btnSaveAll').click();
      await view.locator('#btnSaveAll[data-icon-state="saved"]').waitFor(); await view.waitForTimeout(250);
    }] },
  { id: 'icons-duplicate-busy', category: 'Dodatkowe', title: 'Powiel — ruch kartek podczas rzeczywistego oczekiwania', path: '/games/',
    sources: [...sources, 'web/games/', 'web/shared/js/core/resource-duplicate.js'], ready: '#grid .card[data-game-id]',
    steps: [async (view, { page }) => {
      await page.route('**/_api/resource-duplicate', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.fulfill({ status: 409, contentType: 'application/json', body: '{"ok":false,"error":"resource_in_use"}' }).catch(() => {});
      });
      await view.locator('#grid .card[data-game-id]').first().click();
      await view.locator('#btnDuplicate').click(); await view.locator('#btnDuplicate[aria-busy="true"]').waitFor();
      await view.waitForTimeout(250);
    }] },
];
