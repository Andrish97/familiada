const {test,expect}=require('@playwright/test');
const {serveBranchCode}=require('./helpers/branch-code');
const {loginAsPooledTestUser}=require('./helpers/login');
const origin='https://www.familiada.online';
const token='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const branch=process.env.GITHUB_REF_NAME!=='main';
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
async function evidence(page,testInfo,label){
 for(const width of [390,1400]){
  await page.setViewportSize({width,height:width===390?844:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`shot-anon362-go-matrix-${label}-${width}.png`),fullPage:true,animations:'disabled'});
 }
}
// Business responses here are explicit fixtures. This verifies UI/actors, not SMTP or DB mutations.
test('Go state matrix: canonical account, terminal messages, every family, malformed links and recoverable network',async({page,context,browser},testInfo)=>{
 test.setTimeout(180000);
 if(branch)await serveBranchCode(context,{pages:['go']});
 await context.addInitScript(()=>localStorage.setItem('uiLang','pl'));
 await loginAsPooledTestUser(page,context,testInfo.parallelIndex);
 const user=await page.evaluate(async()=>{const {data,error}=await window.__sbClient.auth.getUser();if(error)throw error;return data.user;});
 let result,fail=false,calls=0;
 const resolve=async route=>{calls++;if(fail)return route.abort('failed');return route.fulfill({json:result});};
 await page.route('**/rest/v1/rpc/poll_go_resolve',resolve);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 async function check(marker,data,heading,buttons){
  result=data;await page.goto(`${origin}/go/?${marker}=${token}`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#title')).toHaveText(heading,{timeout:15000});await expect(page.locator('#actions button')).toHaveCount(buttons);
  await expect(page.locator('#emailRow')).toBeHidden();
 }
 for(const [status,title,buttons] of [['pending','Zaproszenie do udostępnionej bazy',1],['opened','Zaproszenie do udostępnionej bazy',1],['done','Baza została już przyjęta',1],['declined','Zaproszenie odrzucone',1],['cancelled','Udostępnienie zostało cofnięte',0],['expired','To zaproszenie wygasło',0]]){
  await check('b',{ok:true,kind:'base',status,recipient_matches_me:true,recipient_user_id:user.id,owner_label:'Ala'},title,buttons);
  if(['done','declined','cancelled'].includes(status))await evidence(page,testInfo,'base-'+status);
 }
 await check('b',{ok:true,kind:'base',status:'pending',recipient_matches_me:false,recipient_email:null},'Zaproszenie do udostępnionej bazy',0);
 await expect(page.locator('#message')).toHaveText('To konto nie jest odbiorcą zaproszenia. Zaloguj się na właściwe konto.');
 await evidence(page,testInfo,'wrong-account');
 for(const status of ['pending','active','declined']){
  const title=status==='declined'?'Odrzucono':'Zaproszenie do subskrypcji od użytkownika Ala';
  await check('s',{ok:true,kind:'sub',status,registered_user_id:user.id,subscriber_user_id:null,subscriber_email:'dawny-adres@example.invalid',friend_conversion_required:true,owner_label:'Ala'},title,status==='declined'?0:1);
  if(status==='pending'){
   await expect(page.locator('#message')).toContainText('Znajomych');await expect(page.locator('#actions button')).not.toContainText('Akceptuj');
   await evidence(page,testInfo,'canonical-account');
  }
 }
 await check('s',{ok:true,kind:'sub',status:'pending',registered_user_id:token,subscriber_email:user.email,friend_conversion_required:true,owner_label:'Ala'},'Zaproszenie do subskrypcji od użytkownika Ala',0);
 await expect(page.locator('#message')).toContainText('To konto nie jest odbiorcą');
 await check('s',{ok:true,kind:'sub',status:'pending',cancelled_at:'2026-10-12',subscriber_email:'guest@example.invalid'},'To zaproszenie wygasło',0);
 for(const [status,title] of [['pending','Zaproszenie do ankiety w „Rodzinne wakacje” od użytkownika Ala'],['opened','Zaproszenie do ankiety w „Rodzinne wakacje” od użytkownika Ala'],['done','Dziękujemy, głos oddany'],['declined','Zaproszenie odrzucone'],['expired','To zaproszenie wygasło']]){
  await check('t',{ok:true,kind:'task',status,recipient_user_id:user.id,recipient_email:null,game_name:'Rodzinne wakacje',owner_label:'Ala',poll_type:'poll_text'},title,['pending','opened'].includes(status)?1:0);
 }
 for(const [status,title] of [['pending','Zaproszenie do znajomych'],['active','Jesteście znajomymi'],['declined','Zaproszenie odrzucone']]){
  await check('f',{ok:true,kind:'friend',status,recipient_matches_me:true,owner_label:'Ala'},title,1);
  if(status==='active'){await expect(page.locator('#message')).toBeEmpty();await evidence(page,testInfo,'friends-active');}
 }
 for(const [error,title] of [['poll_stopped','Ankieta jest zatrzymana'],['poll_closed','Ankieta zakończona'],['expired','To zaproszenie wygasło'],['invalid_token','To zaproszenie wygasło'],['revoked','Udostępnienie jest już niedostępne']])await check('t',{ok:false,error},title,0);
 await evidence(page,testInfo,'unavailable');
 result={ok:true,kind:'friend',status:'pending',recipient_matches_me:true,owner_label:'Ala'};
 await page.goto(`${origin}/go/?s=${token}&action=unsub`);await expect(page.locator('#actions button')).toHaveCount(1);
 await expect(page.locator('#actions button')).not.toContainText('Wypisz');await evidence(page,testInfo,'historical-friend');
 // Expected kind and syntactic ambiguity are both rejected.
 await check('b',{ok:true,kind:'task',status:'pending',recipient_user_id:user.id},'Link nieważny',0);
 for(const query of [`m=${'a'.repeat(64)}&b=${token}`,`b=${token}&b=${token}`,`d=host&id=${token}&key=${token}&t=${token}`,`t=bad`,`p=anon&id=${token}&key=public&f=${token}`]){
  const before=calls;await page.goto(`${origin}/go/?${query}`);await expect(page.locator('#title')).toHaveText('Link nieważny');await expect(page.locator('#actions button')).toHaveCount(0);expect(calls).toBe(before);
 }
 fail=true;await page.goto(`${origin}/go/?b=${token}`);await expect(page.locator('#message')).toContainText('Nie udało się sprawdzić linku');await expect(page.locator('#actions button')).toHaveCount(1);
 await evidence(page,testInfo,'network-retry');
 fail=false;result={ok:true,kind:'base',status:'declined',recipient_matches_me:true};await page.locator('#actions button').click();await expect(page.locator('#title')).toHaveText('Zaproszenie odrzucone');
 // Device and QR gateways preserve terminal states and allow retry without granting access.
 let deviceFail=true;
 await page.route('**/rest/v1/rpc/control_device_share_resolve',route=>deviceFail?route.abort('failed'):route.fulfill({json:{state:'revoked',game_id:token,device_type:'host'}}));
 await page.goto(`${origin}/go/?d=host&id=${token}&key=${token}`);await expect(page.locator('#actions button')).toHaveCount(1);deviceFail=false;await page.locator('#actions button').click();await expect(page.locator('#message')).toHaveText('Właściciel cofnął to udostępnienie.');await expect(page.locator('#actions button')).toHaveCount(0);
 await page.route('**/rest/v1/rpc/poll_state',route=>route.fulfill({json:{ok:true,state:'ended',type:'poll_text'}}));
 await page.goto(`${origin}/go/?d=qr&id=${token}&key=public`);await expect(page.locator('#title')).toHaveText('Ankieta zakończona');await expect(page).toHaveURL(/\/go\//);
 expect(errors).toEqual([]);
 // A separate browser with no account sees the anonymous subscription actions and account login.
 const guest=await browser.newContext({serviceWorkers:'block'});
 try{
  if(branch)await serveBranchCode(guest,{pages:['go']});
  await guest.addInitScript(()=>localStorage.setItem('uiLang','pl'));
  const anon=await guest.newPage();let guestData;
  await anon.route('**/rest/v1/rpc/poll_go_resolve',route=>route.fulfill({json:guestData}));
  guestData={ok:true,kind:'sub',status:'pending',subscriber_email:'guest@example.invalid',owner_label:'Ala'};
  await anon.goto(`${origin}/go/?s=${token}`);await expect(anon.locator('#actions button')).toHaveCount(2);await evidence(anon,testInfo,'guest-subscription');
  guestData={...guestData,status:'declined'};await anon.reload();await expect(anon.locator('#title')).toHaveText('Odrzucono');await expect(anon.locator('#actions button')).toHaveCount(0);
  guestData={ok:true,kind:'base',status:'pending'};await anon.goto(`${origin}/go/?b=${token}`);await expect(anon.locator('#message')).toContainText('stronie Baz');await expect(anon.locator('#actions button')).toHaveText('Zaloguj');
  guestData={ok:true,kind:'unsub',already_suppressed:true};await anon.goto(`${origin}/go/?u=${token}`);await expect(anon.locator('#title')).toHaveText('Wyłącz powiadomienia mailem');await expect(anon.locator('#message')).toHaveText('Powiadomienia mailem są już wyłączone.');await expect(anon.locator('#actions button')).toHaveCount(0);
  guestData={...guestData,already_suppressed:false};await anon.reload();await expect(anon.locator('#actions button')).toHaveText('Wyłącz powiadomienia');await evidence(anon,testInfo,'legacy-notifications');
 }finally{await guest.close();}
});
