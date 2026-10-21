const {test,expect}=require('./helpers/production-test');
const {loginAsPooledTestUser}=require('./helpers/login');
const {generateE2EToken}=require('./helpers/e2e-token');
const {serveBranchCode}=require('./helpers/branch-code');

// Testy podręcznika sprawdzają kod brancha (strona manual + tłumaczenia).
test.beforeEach(async({context},testInfo)=>{
 if(/manual/.test(testInfo.title)&&process.env.TEST_BRANCH_CODE!=='0') await serveBranchCode(context,{pages:['manual']});
});

test('release: canonical routes serve the current app and preserve connection parameters',async({context})=>{
  const scripts={control:'app.js','control/display':'main.js','control/host':'main.js','control/buzzer':'main.js','games/settings':'game-settings.js'};
  for(const [name,script] of Object.entries(scripts)) {
    const response=await context.request.get(`/${name}/?id=release-probe&key=release-key&lang=en&ret=%2Fgames%2F`,{headers:{"X-E2E-Token":generateE2EToken(process.env.E2E_BYPASS_SECRET)}});
    expect(response.status()).toBe(200);
    const url=new URL(response.url());
    expect(url.pathname).toBe(`/${name}/`);
    expect(url.searchParams.get('id')).toBe('release-probe');
    expect(url.searchParams.get('key')).toBe('release-key');
    expect(url.searchParams.get('lang')).toBe('en');
    expect(url.searchParams.get('ret')).toBe('/games/');
    expect(await response.text()).toContain(`/${name}/js/${script}`);
  }
});

test('release: approved Polish manual and native icons are published',async({page},testInfo)=>{
 // Instrukcja to zwykła strona (bez ?modal=) -- wymaga sesji.
 await loginAsPooledTestUser(page,page.context(),testInfo.parallelIndex);
 await page.goto('/manual/?lang=pl&tab=control');
 const control=page.locator('#tab-control');
 await expect(control).toContainText('Ponowne kliknięcie nie usuwa oznaczenia');
 await expect(control).toContainText('Wpisanie nowej odpowiedzi samo usuwa oznaczenie powtórzenia');
 await expect(control).toContainText('Sam brak pytań nie prowadzi do finału');
 await expect(control.locator('svg.ico').first()).toBeVisible();
 await page.locator('[data-tab="settings"]').first().click();
 await expect(page.locator('#tab-settings')).toContainText('2 minuty');
 await expect(page.locator('#tab-settings')).toContainText('Muzyka outro programu');
});

test('release: Games play and settings links open the new panel',async({page},testInfo)=>{
 await loginAsPooledTestUser(page,page.context(),testInfo.parallelIndex);
 await page.goto('/games/');
 // Adresy stron są w mapie nawigacji (E4), games.js buduje linki przez linkTo().
 const source=await page.request.get('/shared/js/core/nav-map.js');
 expect(source.ok()).toBeTruthy();
 const body=await source.text();
 expect(body).toContain('"/control/"');
 expect(body).toContain('"/games/settings/"');
 expect(body).not.toContain('/control2/');
 expect(body).not.toContain('/game-settings2/');
});

for(const lang of ['pl','en','uk']) {
 test(`release: manual ${lang} has styled Host instructions, notes, buttons and native icons`,async({page},testInfo)=>{
  await loginAsPooledTestUser(page,page.context(),testInfo.parallelIndex);
  await page.goto(`/manual/?lang=${lang}&tab=control`);
  const control=page.locator('#tab-control');
  const host=control.locator('.m-host').first();
  await expect.poll(()=>host.evaluate(el=>getComputedStyle(el).borderLeftWidth)).toBe('3px');
  await expect(control.locator('.m-note').first()).toBeVisible();
  await expect(control.locator('svg.ico').first()).toBeVisible();
  await expect(control.locator('[data-icon]')).toHaveCount(0);
  await host.scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath(`manual-host-${lang}.png`)});
  const style=(locator,keys)=>locator.evaluate((el,keys)=>{const css=getComputedStyle(el);return Object.fromEntries(keys.map(k=>[k,css[k]]));},keys);
  const BTN=['fontFamily','fontWeight','paddingLeft','borderRadius','backgroundColor','borderTopColor','color'];
  const controlButton=await style(control.locator('p.m-p .m-btn').first(),BTN);
  const valueStyle=await style(control.locator('.m-code').first(),BTN);
  expect(valueStyle).not.toEqual(controlButton); // wartości/klawisze nie wyglądają jak przyciski
  await page.locator('button[data-tab="settings"]').click();
  const settings=page.locator('#tab-settings');
  await expect(settings.locator('.m-warn').first()).toBeVisible();
  await expect(settings.locator('svg.ico-trash').first()).toBeAttached();
  await expect(settings.locator('svg.ico-play').first()).toBeAttached();
  await expect(settings.locator('svg.ico-stop').first()).toBeAttached();
  const CELL=['fontFamily','fontSize','color','lineHeight','padding','verticalAlign'];
  const expected=await style(settings.locator('.m-table td').first(),CELL);
  await page.locator('button[data-tab="bases"]').click();
  const bases=page.locator('#tab-bases');
  await expect(bases.locator('.m-table').first()).toBeVisible();
  expect(await style(bases.locator('.m-table td').first(),CELL)).toEqual(expected);
  await page.locator('button[data-tab="games"]').click();
  expect(await style(page.locator('#tab-games p.m-p .m-btn').first(),BTN)).toEqual(controlButton);
 });
}
