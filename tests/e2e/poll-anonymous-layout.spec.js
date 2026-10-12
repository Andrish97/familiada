// Short visual check after the complete live voting contract has already passed.
const {test,expect}=require('@playwright/test');
const {serveBranchCode}=require('./helpers/branch-code');
const {loginAsPooledTestUser}=require('./helpers/login');
const {seed,complete}=require('./helpers/poll-game');
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
for(const type of ['poll_text','poll_points'])test(`anonymous layout ${type}: one live cooldown, saved answers390/1400`,async({page,context,browser},testInfo)=>{
 let game,anonymous;
 try{
  await loginAsPooledTestUser(page,context,testInfo.parallelIndex);game=await seed(page,type);
  const browserToken=await page.evaluate(async({game,type})=>{
   const db=window.__sbClient;const {error:nameError}=await db.from('games').update({name:'Rodzinna ankieta — wakacje'}).eq('id',game.id);if(nameError)throw nameError;
   const {data:questions,error}=await db.from('questions').select('id,answers(id,ord)').eq('game_id',game.id);if(error)throw error;
   const browserToken=crypto.randomUUID();const items=questions.map(q=>({question_id:q.id,answer_raw:'Książkę',answer_id:q.answers.find(a=>a.ord===1)?.id}));
   const {data:submitted,error:submitError}=await db.rpc('poll_anonymous_submit',{p_game_id:game.id,p_key:game.key,p_browser_token:browserToken,p_voter_token:crypto.randomUUID(),p_items:items});
   if(submitError||!submitted?.ok)throw new Error(submitError?.message||'first vote failed');return browserToken;
  },{game,type});
  anonymous=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  if(process.env.GITHUB_REF_NAME!=='main')await serveBranchCode(anonymous,{pages:['polls/vote/text','polls/vote/points']});
  await anonymous.addInitScript(({game,browserToken})=>{localStorage.setItem('uiLang','pl');localStorage.setItem(`fam_anon_browser_${game.id}_${game.key}`,browserToken);},{game,browserToken});
  const voter=await anonymous.newPage();await voter.goto(`https://www.familiada.online/polls/vote/${type==='poll_text'?'text':'points'}/?id=${game.id}&key=${game.key}`);
  await complete(voter,type);await expect(voter.locator('.sub')).toHaveText('Odpowiedzi są zachowane.');
  const retry=voter.locator(type==='poll_text'?'#btnSend':'.alist button');await expect(retry).toBeDisabled();await expect(retry).toHaveText(/Spróbuj ponownie za \d+ s/);await expect(voter.locator('.app-toast')).toHaveCount(0);
  for(const width of [390,1400]){await voter.setViewportSize({width,height:width===390?844:900});expect(await voter.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await voter.screenshot({path:testInfo.outputPath(`shot-anon362-${type}-cooldown-${width}.png`),fullPage:true,animations:'disabled'});}
 }finally{
  if(anonymous)await anonymous.close();
  if(game)await page.evaluate(async id=>{const {error}=await window.__sbClient.from('games').delete().eq('id',id);if(error)throw error;},game.id);
 }
});
