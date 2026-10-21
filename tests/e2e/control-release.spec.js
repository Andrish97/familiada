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
