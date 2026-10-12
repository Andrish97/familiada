const {test,expect}=require('@playwright/test');
const {serveBranchCode}=require('./helpers/branch-code');
const {loginAsPooledTestUser,instrumentPage}=require('./helpers/login');
const {rpc,seed}=require('./helpers/poll-game');
const origin='https://www.familiada.online';
const pages=['go','polls','polls/vote/qr','polls/vote/text','polls/vote/points'];
const branch=process.env.GITHUB_REF_NAME!=='main';
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
async function evidence(page,testInfo,label){
 for(const width of [390,1400]){
  await page.setViewportSize({width,height:width===390?844:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`shot-anon362-go-${label}-${width}.png`),fullPage:true,animations:'disabled'});
 }
}
test('anonymous Go: both kinds, source link and QR, every real parent state, invalid links and network retry',async({page,context,browser},testInfo)=>{
 test.setTimeout(240000);const games=[];let anonymous;
 try{
  if(branch)await serveBranchCode(context,{pages});
  await context.addInitScript(()=>localStorage.setItem('uiLang','pl'));
  await loginAsPooledTestUser(page,context,testInfo.parallelIndex);
  anonymous=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  await anonymous.addInitScript(()=>localStorage.setItem('uiLang','pl'));
  if(branch)await serveBranchCode(anonymous,{pages});
  const voter=await anonymous.newPage();instrumentPage(voter);const pageErrors=[];voter.on('pageerror',error=>pageErrors.push(error.message));
  for(const type of ['poll_text','poll_points']){
   const game=await seed(page,type);games.push(game.id);
   await page.goto(`${origin}/polls/?id=${game.id}`,{waitUntil:'domcontentloaded'});
   await expect(page.locator('#pollLink')).toHaveValue(/\/go\/\?p=anon/,{timeout:15000});
   let link=await page.locator('#pollLink').inputValue();const parsed=new URL(link);
   expect(parsed.searchParams.get('id')).toBe(game.id);expect(parsed.searchParams.get('key')).toBe(game.key);
   await voter.goto(link,{waitUntil:'domcontentloaded'});
   await expect(voter).toHaveURL(new RegExp(`/polls/vote/${type==='poll_text'?'text':'points'}/`));await expect(voter.locator('.qtext')).toContainText('? 1');
   // The owner opens the actual QR device, retaining id/key rather than encoding a QR screen URL.
   await page.locator('#btnOpenQr').click();
   await expect(page.locator('#pollQrModalOverlay')).toBeVisible();
   const popupPromise=context.waitForEvent('page');await page.locator('#pollQrModalOpen').click();const qr=await popupPromise;
   await qr.waitForLoadState('domcontentloaded');const qrUrl=new URL(qr.url());
   expect(qrUrl.pathname).toBe('/polls/vote/qr/');expect(qrUrl.searchParams.get('id')).toBe(game.id);expect(qrUrl.searchParams.get('key')).toBe(game.key);expect(qrUrl.searchParams.has('url')).toBe(false);
   await expect(qr.locator('#qr img')).toBeVisible({timeout:15000});await qr.close();
   await page.locator('#pollQrModalClose').click();
   // Real root lifecycle, no mocked poll_state responses.
   await rpc(page,'poll_stop',{p_game_id:game.id});await voter.goto(link);await expect(voter.locator('#title')).toContainText('jest zatrzymana');await evidence(voter,testInfo,type+'-stopped');
   const expired=new URL(link);expired.searchParams.set('key',game.key+'old');await voter.goto(expired.href);await expect(voter.locator('#title')).toHaveText('Ten link wygasł');
   const aborted=await rpc(page,'poll_abort',{p_game_id:game.id});const draft=new URL(link);draft.searchParams.set('key',aborted.share_key_poll);await voter.goto(draft.href);await expect(voter.locator('#title')).toContainText('została zamknięta');
   await rpc(page,'poll_open',{p_game_id:game.id,p_key:aborted.share_key_poll});
   game.key=await page.evaluate(async id=>{const {data,error}=await window.__sbClient.from('games').select('share_key_poll').eq('id',id).single();if(error)throw error;return data.share_key_poll;},game.id);
   parsed.searchParams.set('key',game.key);link=parsed.href;await voter.goto(link);await expect(voter.locator('.qtext')).toContainText('? 1');
   const questions=await page.evaluate(async id=>{const {data,error}=await window.__sbClient.from('questions').select('id,ord,answers(id,ord)').eq('game_id',id).order('ord');if(error)throw error;return data;},game.id);
   const labels=['Książkę','Piłkę','Aparat'];
   for(let choice=0;choice<3;choice++){
    const items=questions.map(q=>({question_id:q.id,answer_raw:labels[choice],answer_id:q.answers.find(a=>a.ord===choice+1)?.id}));
    expect(await voter.evaluate(async({game,items})=>{const {data,error}=await window.__sbClient.rpc('poll_anonymous_submit',{p_game_id:game.id,p_key:game.key,p_browser_token:crypto.randomUUID(),p_voter_token:crypto.randomUUID(),p_items:items});if(error)throw error;return data;},{game,items})).toMatchObject({ok:true});
   }
   await rpc(page,'poll_stop',{p_game_id:game.id});
   if(type==='poll_points')await rpc(page,'poll_points_tally',{p_game_id:game.id});
   else await rpc(page,'poll_text_tally_apply',{p_game_id:game.id,p_payload:{items:questions.map(q=>({question_id:q.id,answers:labels.map(text=>({text,count:1}))}))}});
   await voter.goto(link);await expect(voter.locator('#title')).toHaveText('Ankieta zakończona');await evidence(voter,testInfo,type+'-ended');
   await page.goto(`${origin}/games/`,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>Boolean(window.__sbClient));
   await page.evaluate(async id=>{const {error}=await window.__sbClient.from('games').delete().eq('id',id);if(error)throw error;},game.id);
   await voter.goto(link);await expect(voter.locator('#title')).toHaveText('Nie ma takiej ankiety');
  }
  const invalid=`${origin}/go/?p=anon&id=bad&key=invalid`;
  await voter.goto(invalid);await expect(voter.locator('#title')).toHaveText('Link nieważny');
  await evidence(voter,testInfo,'invalid');
  // A recoverable network failure must stay on Go, then open a genuine live poll.
  const game=await seed(page,'poll_text');games.push(game.id);const link=`${origin}/go/?p=anon&id=${game.id}&key=${game.key}&lang=pl`;
  const breakState=route=>route.abort('failed');await voter.route('**/rest/v1/rpc/poll_state',breakState);
  await voter.goto(link);await expect(voter.locator('#message')).toContainText('Nie udało się sprawdzić linku');
  await voter.unroute('**/rest/v1/rpc/poll_state',breakState);await voter.locator('#actions button').click();await expect(voter.locator('.qtext')).toContainText('? 1');
  expect(pageErrors).toEqual([]);
 }finally{
  if(anonymous)await anonymous.close();
  for(const id of games)await page.evaluate(async id=>{const {error}=await window.__sbClient.from('games').delete().eq('id',id);if(error)throw error;},id);
 }
});
