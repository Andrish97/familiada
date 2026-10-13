const {test,expect}=require('@playwright/test');
const {loginAsTestUser,testAccountUsername}=require('./helpers/login');
const {serveBranchCode}=require('./helpers/branch-code');
const {clearMailbox,waitForEmail,extractHttpLinks,resetMailProviderLimits}=require('./helpers/mailbox');
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});

async function newUserContext(browser,username){
 const ctx=await browser.newContext({serviceWorkers:'block'});
 if(process.env.GITHUB_REF_NAME!=='main')await serveBranchCode(ctx,{pages:['games','logo','go']});
 const page=await ctx.newPage();await loginAsTestUser(page,ctx,{username});return {ctx,page};
}
async function getUser(page){return page.evaluate(async()=>{const {data,error}=await window.__sbClient.auth.getUser();if(error)throw error;return data.user;});}
async function setMailFlag(page,id,enabled){await page.evaluate(async({id,enabled})=>{const {error}=await window.__sbClient.from('user_flags').upsert({user_id:id,email_notifications:enabled});if(error)throw error;},{id,enabled});}
async function cleanCopyFixtures(page){await page.evaluate(async()=>{const db=window.__sbClient;for(const kind of ['game','logo']){const {data,error}=await db.rpc('resource_copy_inbox',{p_kind:kind});if(error)throw error;for(const item of data.items||[]){if(String(item.name).startsWith('E2E-SEND-')){const {error:e}=await db.rpc('resource_copy_decide',{p_offer:item.id,p_decision:'decline'});if(e)throw e;}}}for(const [table,ownerColumn] of [['games','owner_id'],['user_logos','user_id']]){const {data:rows,error}=await db.from(table).select('id').like('name','E2E-SEND-%');if(error)throw error;for(const row of rows||[]){const {error:e}=await db.from(table).delete().eq('id',row.id);if(e)throw e;}}});}
async function sendFromUi(page,path,selector,name,recipientId,{testInfo,captureScreenshots=false}={}){
 await page.goto(`https://www.familiada.online/${path}/`);await page.locator(selector).filter({hasText:name}).click();
 await page.locator('#btnSendCopy').click();const dialog=page.locator('#resourceSendDialog');await expect(dialog).toBeVisible();
 await dialog.locator(`input[value="${recipientId}"]`).check();
 if(captureScreenshots){for(const [label,width,height] of [['mobile',390,844],['desktop',1400,960],['landscape',844,390]]){await page.setViewportSize({width,height});await page.screenshot({path:testInfo.outputPath(`shot-resource-copy-send-${label}.png`),fullPage:true});}await page.setViewportSize({width:1400,height:960});}
 const response=page.waitForResponse(r=>r.url().endsWith('/_api/resource-send')&&r.request().method()==='POST');
 await dialog.locator('[data-send]').click();const result=await response;expect(result.status()).toBe(200);return result.json();
}
test('Wyślij Gier i Logo: mail Go, odbiór i kopia z właściwym pochodzeniem',async({page,context,browser},testInfo)=>{
 test.setTimeout(240000);const name=`E2E-SEND-${Date.now()}`;let recipientContext,recipientPage,recipientId,senderId,previousFlag;const sourceGames=[],sourceLogos=[],receivedGames=[],receivedLogos=[];
 if(process.env.GITHUB_REF_NAME!=='main')await serveBranchCode(context,{pages:['games','logo','go']});
 await loginAsTestUser(page,context,{username:testAccountUsername(1)});senderId=(await getUser(page)).id;
 try{
  ({ctx:recipientContext,page:recipientPage}=await newUserContext(browser,testAccountUsername(2)));const recipient=await getUser(recipientPage);recipientId=recipient.id;
  await cleanCopyFixtures(recipientPage);
  previousFlag=await recipientPage.evaluate(async id=>{const {data,error}=await window.__sbClient.from('user_flags').select('email_notifications').eq('user_id',id).maybeSingle();if(error)throw error;return data?.email_notifications??true;},recipientId);
  await setMailFlag(recipientPage,recipientId,true);
  await page.evaluate(async id=>{const {error}=await window.__sbClient.rpc('e2e_friendships_cleanup',{p_other_user_id:id});if(error)throw error;},recipientId);
  const invite=await page.evaluate(async username=>{const {data,error}=await window.__sbClient.rpc('friends_invite',{p_handle:username});if(error)throw error;return data;},testAccountUsername(2));
  expect(invite.ok||invite.err==='already').toBeTruthy();
  if(invite.id)expect((await recipientPage.evaluate(async id=>{const {data,error}=await window.__sbClient.rpc('friends_accept',{p_id:id});if(error)throw error;return data;},invite.id)).ok).toBeTruthy();
  await clearMailbox(testAccountUsername(2));await resetMailProviderLimits(page);

  const game=await page.evaluate(async prefix=>{const db=window.__sbClient,{data:u}=await db.auth.getUser(),name=prefix+'-GAME';const {data:g,error}=await db.from('games').insert({owner_id:u.user.id,name,type:'prepared',status:'draft'}).select('id,name').single();if(error)throw error;const {error:e}=await db.rpc('game_import_content',{p_game_id:g.id,p_name:name,p_questions:[{text:'Pytanie?',answers:[{text:'Rodzina',fixed_points:20}]}]});if(e)throw e;return g;},name);sourceGames.push(game.id);
  const gameSend=await sendFromUi(page,'games','.card[data-game-id]',game.name,recipientId,{testInfo,captureScreenshots:true});expect(gameSend.ok).toBeTruthy();
  const gameMail=await waitForEmail({recipient:testAccountUsername(2),after:new Date(Date.now()-5000).toISOString(),subject:/kopię|copy/i,timeout:120000});
  const gameGo=extractHttpLinks(gameMail).map(value=>new URL(value)).find(url=>url.pathname==='/go/'&&url.searchParams.has('c'));expect(gameGo).toBeTruthy();
  await recipientPage.goto(gameGo.href);await expect(recipientPage.locator('#message')).toContainText(game.name,{timeout:20000});
  await recipientPage.locator('#actions button').filter({hasText:/akceptuj|accept/i}).click();await expect(recipientPage.locator('#title')).toContainText(/dodana|added/i,{timeout:15000});
  const gameCopy=await recipientPage.evaluate(async name=>{const {data,error}=await window.__sbClient.from('games').select('id,name,received_from_label').eq('name',name).single();if(error)throw error;return data;},game.name);receivedGames.push(gameCopy.id);expect(gameCopy.received_from_label).toBeTruthy();

  const logo=await page.evaluate(async prefix=>{const db=window.__sbClient,{data:u}=await db.auth.getUser();const row={user_id:u.user.id,name:prefix+'-LOGO',type:'GLYPH_30x10',payload:{layers:[{color:'main',rows:['10101','01110']}],source:{mode:'TEXT',text:'RODZINA',fontId:'familiada'}}};const {data,error}=await db.from('user_logos').insert(row).select('id,name').single();if(error)throw error;return data;},name);sourceLogos.push(logo.id);
  const logoSend=await sendFromUi(page,'logo','.logoTile',logo.name,recipientId);expect(logoSend.ok).toBeTruthy();
  const logoMail=await waitForEmail({recipient:testAccountUsername(2),after:new Date(Date.parse(gameMail.received_at)+1).toISOString(),subject:/kopię|copy/i,timeout:120000});
  expect(extractHttpLinks(logoMail).some(value=>new URL(value).searchParams.has('c'))).toBeTruthy();
  await recipientPage.goto('https://www.familiada.online/logo/');await expect(recipientPage.locator('#receivedCopies')).toContainText(logo.name,{timeout:20000});
  const logoRow=recipientPage.locator('#receivedCopies .resource-copy-inbox-row').filter({hasText:logo.name});
  await logoRow.locator('button').filter({hasText:/akceptuj|accept/i}).click();
  await expect(recipientPage.locator('#receivedCopies')).toBeHidden({timeout:20000});
  const logoCopy=await recipientPage.evaluate(async name=>{const {data,error}=await window.__sbClient.from('user_logos').select('id,received_from_label').eq('name',name).single();if(error)throw error;return data;},logo.name);receivedLogos.push(logoCopy.id);expect(logoCopy.received_from_label).toBeTruthy();
 }finally{
  if(recipientPage&&recipientId){await cleanCopyFixtures(recipientPage).catch(()=>{});for(const id of receivedGames)await recipientPage.evaluate(async id=>{await window.__sbClient.from('games').delete().eq('id',id);},id).catch(()=>{});for(const id of receivedLogos)await recipientPage.evaluate(async id=>{await window.__sbClient.from('user_logos').delete().eq('id',id);},id).catch(()=>{});if(previousFlag!==undefined)await setMailFlag(recipientPage,recipientId,previousFlag).catch(()=>{});await page.evaluate(async id=>{await window.__sbClient.rpc('e2e_friendships_cleanup',{p_other_user_id:id});},recipientId).catch(()=>{});}
  for(const id of sourceGames)await page.evaluate(async id=>{await window.__sbClient.from('games').delete().eq('id',id);},id).catch(()=>{});
  for(const id of sourceLogos)await page.evaluate(async id=>{await window.__sbClient.from('user_logos').delete().eq('id',id);},id).catch(()=>{});
  if(recipientContext)await recipientContext.close();await clearMailbox(testAccountUsername(2)).catch(()=>{});
 }
});
