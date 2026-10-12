// Real anonymous forms and real production DB; only the first response is lost deliberately.
const { test, expect } = require('@playwright/test');
const { serveBranchCode } = require('./helpers/branch-code');
const { loginAsPooledTestUser, instrumentPage } = require('./helpers/login');
const origin='https://www.familiada.online';
const useBranchCode=process.env.GITHUB_REF_NAME!=='main';
test.use({serviceWorkers:'block'});
async function rpc(page,name,args){return page.evaluate(async({name,args})=>{const {data,error}=await window.__sbClient.rpc(name,args);if(error)throw new Error(error.message);return data;},{name,args});}
async function seed(page,type){return page.evaluate(async type=>{
 const db=window.__sbClient;const {data:user,error:authError}=await db.auth.getUser();if(authError)throw authError;
 const {data:game,error}=await db.from('games').insert({owner_id:user.user.id,name:`E2E-ANON362-${type}-${Date.now()}`,type,status:'draft'}).select('id,share_key_poll').single();if(error)throw error;
 try {
  const {data:questions,error:qError}=await db.from('questions').insert(Array.from({length:10},(_,i)=>({game_id:game.id,ord:i+1,text:`Co zabieramy na wakacje? ${i+1}`}))).select('id,ord');if(qError)throw qError;
  if(type==='poll_points') {const {error:aError}=await db.from('answers').insert(questions.flatMap(q=>Array.from({length:3},(_,i)=>({question_id:q.id,ord:i+1,text:['Książkę','Piłkę','Aparat'][i],fixed_points:10}))));if(aError)throw aError;}
  const {error:oError}=await db.rpc('poll_open',{p_game_id:game.id,p_key:game.share_key_poll});if(oError)throw oError;
  const {data:opened,error:kError}=await db.from('games').select('share_key_poll').eq('id',game.id).single();if(kError)throw kError;
  return {id:game.id,key:opened.share_key_poll};
 }catch(error){await db.from('games').delete().eq('id',game.id);throw error;}
},type);}
async function count(page,gameId,type){return page.evaluate(async({gameId,type})=>{const {count,error}=await window.__sbClient.from(type==='poll_text'?'poll_text_entries':'poll_votes').select('id',{head:true,count:'exact'}).eq('game_id',gameId);if(error)throw error;return count;},{gameId,type});}
async function complete(page,type){
 for(let i=1;i<=10;i++){
  await expect(page.locator('.qtext')).toContainText(`? ${i}`);
  if(type==='poll_text'){await page.locator('#answerInput').fill('Książkę');await page.locator('#btnSend').click();}
  else await page.locator('.alist button').first().click();
 }
}
for(const type of ['poll_text','poll_points'])test(`anonymous362 ${type}: preserved answers, 30s browser scope, retries and session lifecycle`,async({page,context,browser},testInfo)=>{
 test.setTimeout(180000);let game;const anonymousContexts=[];
 try{
  await loginAsPooledTestUser(page,context,testInfo.parallelIndex);
  game=await seed(page,type);
  const anonymous=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});anonymousContexts.push(anonymous);
  if(useBranchCode)await serveBranchCode(anonymous,{pages:['polls/vote/text','polls/vote/points']});
  await anonymous.addInitScript(({id,key})=>{localStorage.setItem('fam_poll_done_'+id+'_'+key,'1');localStorage.setItem('uiLang','pl');},game);
  const voter=await anonymous.newPage();instrumentPage(voter);const pageErrors=[];voter.on('pageerror',error=>pageErrors.push(error.message));
  const url=`${origin}/polls/vote/${type==='poll_text'?'text':'points'}/?id=${game.id}&key=${game.key}`;
  const calls=[];let loseFirstResponse=true;
  await voter.route('**/rest/v1/rpc/poll_anonymous_submit',async route=>{
   const args=route.request().postDataJSON();const response=await route.fetch();const result=await response.json();calls.push({args,result});
   if(loseFirstResponse){loseFirstResponse=false;expect(result.ok).toBe(true);await route.abort('failed');}else await route.fulfill({response});
  });
  await voter.goto(url,{waitUntil:'domcontentloaded'});await complete(voter,type);
  await expect(voter.locator('.sub')).toContainText('Nie udało się wysłać odpowiedzi');
  expect(await count(page,game.id,type)).toBe(10);
  const retry=voter.locator(type==='poll_text'?'#btnSend':'.alist button');await expect(retry).toHaveText('Spróbuj ponownie');await retry.click();
  await expect(voter.locator('.sub')).toContainText('Dziękujemy');
  expect(await count(page,game.id,type)).toBe(10);expect(calls[1].result.already_submitted).toBe(true);
  expect(calls[0].args).toEqual(calls[1].args);expect(calls[0].args.p_items).toHaveLength(10);
  await voter.reload();await complete(voter,type);
  await expect(voter.locator('.sub')).toContainText('Możesz wysłać odpowiedzi za');await expect(retry).toBeDisabled();
  expect(calls[2].result.error).toBe('cooldown');expect(calls[2].args.p_browser_token).toBe(calls[0].args.p_browser_token);
  expect(calls[2].args.p_voter_token).not.toBe(calls[0].args.p_voter_token);expect(await count(page,game.id,type)).toBe(10);
  for(const width of [390,1400]){
   await voter.setViewportSize({width,height:width===390?844:900});
   expect(await voter.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await voter.screenshot({path:testInfo.outputPath(`shot-anon362-${type}-cooldown-${width}.png`),fullPage:true,animations:'disabled'});
  }
  // Same network, independent browser: no IP throttle.
  const other=await browser.newContext({serviceWorkers:'block'});anonymousContexts.push(other);
  if(useBranchCode)await serveBranchCode(other,{pages:['polls/vote/text','polls/vote/points']});
  const independent=await other.newPage();await independent.goto(url,{waitUntil:'domcontentloaded'});await complete(independent,type);
  await expect(independent.locator('.sub')).toContainText('Dziękujemy');expect(await count(page,game.id,type)).toBe(20);
  const legacy=await voter.evaluate(async({game,type,args})=>{
   const {error}=await window.__sbClient.rpc(type==='poll_text'?'poll_text_submit_batch':'poll_points_vote_batch',{p_game_id:game.id,p_key:game.key,p_voter_token:crypto.randomUUID(),p_items:args.p_items});return error?.message;
  },{game,type,args:calls[2].args});expect(legacy).toContain('anonymous_full_form_required');
  await expect(retry).toBeEnabled({timeout:35000});await expect(voter.locator('.sub')).toContainText('Możesz już wysłać odpowiedzi');await retry.click();
  await expect(voter.locator('.sub')).toContainText('Dziękujemy');expect(await count(page,game.id,type)).toBe(30);expect(calls[3].args).toEqual(calls[2].args);
  await rpc(page,'poll_stop',{p_game_id:game.id});await voter.reload();await expect(voter.locator('.closed')).toContainText('jest zatrzymana');
  const aborted=await rpc(page,'poll_abort',{p_game_id:game.id});await rpc(page,'poll_open',{p_game_id:game.id,p_key:aborted.share_key_poll});
  const newKey=await page.evaluate(async id=>{const {data,error}=await window.__sbClient.from('games').select('share_key_poll').eq('id',id).single();if(error)throw error;return data.share_key_poll;},game.id);
  await voter.reload();await expect(voter.locator('.closed')).toContainText('link wygasł');
  await voter.goto(url.replace(game.key,newKey),{waitUntil:'domcontentloaded'});await complete(voter,type);await expect(voter.locator('.sub')).toContainText('Dziękujemy');expect(await count(page,game.id,type)).toBe(10);
  expect(calls.at(-1).args.p_browser_token).not.toBe(calls[0].args.p_browser_token);expect(pageErrors).toEqual([]);
 }finally{
  for(const anonymous of anonymousContexts)await anonymous.close();
  if(game)await page.evaluate(async id=>{const {error}=await window.__sbClient.from('games').delete().eq('id',id);if(error)throw error;},game.id);
 }
});
