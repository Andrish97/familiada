const {test,expect}=require('./helpers/production-test');
const {loginAsPooledTestUser}=require('./helpers/login');
const {generateE2EToken}=require('./helpers/e2e-token');

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
 await page.goto('/manual/?lang=pl#control');
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

for(const [lang,hostLabel,repeatText,outroLimit] of [
 ['pl','Prowadzącego','Ponowne kliknięcie nie usuwa oznaczenia','2 minuty'],
 ['en','Host','Clicking again does not remove the mark','2 minutes'],
 ['uk','Ведучого','Повторне натискання не прибирає позначки','2 хвилини'],
]) {
 test(`release: manual ${lang} has styled Host instructions, notes and native icons`,async({page},testInfo)=>{
  await loginAsPooledTestUser(page,page.context(),testInfo.parallelIndex);
  await page.goto(`/manual/?lang=${lang}#control`);
  const control=page.locator('#tab-control');
  await expect(control).toContainText(repeatText);
  const host=control.locator('.m-host').first();
  await expect(host).toContainText(hostLabel);
  await expect.poll(()=>host.evaluate(el=>getComputedStyle(el).borderLeftWidth)).toBe('3px');
  await expect(control.locator('.m-note').first()).toBeVisible();
  await expect(control.locator('svg.ico').first()).toBeVisible();
  await expect(control.locator('[data-icon]')).toHaveCount(0);
  await host.scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath(`manual-host-${lang}.png`)});
  await page.locator('button[data-tab="gameSettings"]').click();
  const settings=page.locator('#tab-gameSettings');
  await expect(settings).toContainText(outroLimit);
  await expect(settings.locator('.m-warn').first()).toBeVisible();
  await expect(settings.locator('svg.ico-trash')).toBeVisible();
  await expect(settings.locator('svg.ico-play')).toBeVisible();
  await expect(settings.locator('svg.ico-stop')).toBeVisible();
  expect(await settings.locator('.m-table').count()).toBe(1);
  const tableCellStyle=locator=>locator.evaluate(el=>{
    const css=getComputedStyle(el);
    return {font:css.fontFamily,size:css.fontSize,color:css.color,lineHeight:css.lineHeight,padding:css.padding,verticalAlign:css.verticalAlign};
  });
  const expected=await tableCellStyle(settings.locator('.m-table td').first());
  await page.locator('button[data-tab="bases"]').click();
  const bases=page.locator('#tab-bases');
  await expect(bases.locator('.m-table').first()).toBeVisible();
  expect(await tableCellStyle(bases.locator('.m-table td').first())).toEqual(expected);
  expect(await tableCellStyle(bases.locator('.m-table td').nth(1))).toEqual(expected);
  await expect(control.locator('p.m-p .m-code').first()).toHaveClass(/m-control/);
  await expect(control.locator('.m-code').filter({hasText:'Win + P'}).first()).not.toHaveClass(/m-control/);
  await expect(settings.locator('.m-code').filter({hasText:'1,1,1,2,3'}).first()).not.toHaveClass(/m-control/);
  const controlButtonStyle=await control.locator('p.m-p .m-code').first().evaluate(el=>{
    const css=getComputedStyle(el);
    return {font:css.fontFamily,size:css.fontSize,weight:css.fontWeight,padding:css.padding,radius:css.borderRadius,background:css.backgroundColor,border:css.borderColor};
  });
  await page.locator('button[data-tab="edit"]').click();
  const existingButtonStyle=await page.locator('#tab-edit p.m-p .m-code').first().evaluate(el=>{
    const css=getComputedStyle(el);
    return {font:css.fontFamily,size:css.fontSize,weight:css.fontWeight,padding:css.padding,radius:css.borderRadius,background:css.backgroundColor,border:css.borderColor};
  });
  await expect(page.locator('#tab-edit p.m-p .m-code').first()).toHaveClass(/m-control/);
  expect(controlButtonStyle).toEqual(existingButtonStyle);
  await page.locator('button[data-tab="logo"]').click();
  await expect(page.locator('#tab-logo .m-code').filter({hasText:'30×10'}).first()).not.toHaveClass(/m-control/);


 });
}
