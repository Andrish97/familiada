const base = require('@playwright/test');
const { generateE2EToken } = require('./e2e-token');

async function maintenanceBypass(context) {
  if (!process.env.E2E_BYPASS_SECRET) throw new Error('Brak E2E_BYPASS_SECRET');
  await context.route('https://www.familiada.online/**', async route => {
    await route.continue({ headers: {
      ...route.request().headers(),
      'X-E2E-Token': generateE2EToken(process.env.E2E_BYPASS_SECRET),
    }});
  });
}

// Includes independently opened Display, Host and Buzzer contexts.
const test = base.test.extend({
  browser: [async ({ browser }, use) => {
    const original = browser.newContext;
    browser.newContext = async function (...args) {
      const context = await original.apply(this, args);
      await maintenanceBypass(context);
      return context;
    };
    try { await use(browser); }
    finally { browser.newContext = original; }
  }, { scope: 'worker' }],
});
module.exports = { test, expect: base.expect };
