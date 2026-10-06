const {test,expect}=require('./helpers/production-test');
const {loginAsPooledTestUser}=require('./helpers/login');

test('release: legacy routes preserve id, key, language and return target',async({context})=>{
  for(const name of ['control','display','host','buzzer','game-settings']) {
    const page=await context.newPage();
    const request=page.waitForRequest(request=>{
      const url=new URL(request.url());
      return request.isNavigationRequest() && url.pathname===`/${name}2/`;
    });
    await page.goto(`/${name}/?id=release-probe&key=release-key&lang=en&ret=%2Fgames%2F#probe`,{waitUntil:'commit'});
    const url=new URL((await request).url());
    expect(url.searchParams.get('id')).toBe('release-probe');
    expect(url.searchParams.get('key')).toBe('release-key');
    expect(url.searchParams.get('lang')).toBe('en');
    expect(url.searchParams.get('ret')).toBe('/games/');
    await page.close();
  }
});

test('release: approved Polish manual and native icons are published',async({page})=>{
 await page.goto('/manual/?modal=1&lang=pl#control');
 const control=page.locator('#tab-control');
 await expect(control).toContainText('Ponowne kliknięcie nie usuwa oznaczenia');
 await expect(control).toContainText('oznaczenie usuwa wyłącznie wpisanie tekstu');
 await expect(control).toContainText('Sam brak pytań nie kwalifikuje do finału');
 await expect(control.locator('svg.ico').first()).toBeVisible();
 await page.locator('[data-tab="gameSettings"]').first().click();
 await expect(page.locator('#tab-gameSettings')).toContainText('2 minuty');
 await expect(page.locator('#tab-gameSettings')).toContainText('Muzyka outro programu');
});

test('release: Games play and settings links open the new panel',async({page},testInfo)=>{
 await loginAsPooledTestUser(page,page.context(),testInfo.parallelIndex);
 const source=await page.request.get('/games/js/games.js');
 expect(source.ok()).toBeTruthy();
 const body=await source.text();
 expect(body).toContain('/control2/?id=');
 expect(body).toContain('/game-settings2/?id=');
 expect(body).not.toContain('`/control/?id=');
});
