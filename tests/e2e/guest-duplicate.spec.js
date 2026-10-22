// Gość (decyzja właściciela 2026-10-22): Powiel własnej gry i logo działa,
// Wyślij jest ukryte, a API wysyłki odrzuca gościa (migracja 458).
const {test,expect}=require('@playwright/test');
const {loginAsGuest}=require('./helpers/login');
const {serveBranchCode}=require('./helpers/branch-code');
const {generateE2EToken}=require('./helpers/e2e-token');
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
let stage='login';
test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.error('::error title=Guest duplicate stage::'+stage);});
test('guest: Powiel own game and logo works, Wyślij hidden and rejected by the server',async({page,context},info)=>{
 test.setTimeout(240000);const rows=[];
 if(process.env.GITHUB_REF_NAME!=='main')await serveBranchCode(context,{pages:['games','logos']});
 const e2e=generateE2EToken(process.env.E2E_BYPASS_SECRET);
 for(const path of ['resource-duplicate','resource-send'])await context.route('https://www.familiada.online/_api/'+path,async route=>await route.continue({headers:{...route.request().headers(),'X-E2E-Token':e2e}}));
 await context.addInitScript(()=>localStorage.setItem('uiLang','pl'));
 await loginAsGuest(page,context);
 try{
  for(const [kind,path,table,selector] of [['game','games','games','.card[data-game-id]'],['logo','logos','user_logos','.logoTile']]){
   stage='create source '+kind;
   const source=await page.evaluate(async({kind,table})=>{const db=window.__sbClient,{data:a}=await db.auth.getUser();const name=(kind==='game'?'Gra gościa ':'LOGO GOSCIA ')+Date.now();const row=kind==='game'?{owner_id:a.user.id,name,type:'prepared',status:'draft'}:{user_id:a.user.id,name,type:'GLYPH_30x10',payload:{layers:[{color:'main',rows:['10101','01110']}],source:{mode:'TEXT',text:'GOSC',fontId:'familiada'}}};const {data,error}=await db.from(table).insert(row).select('id,name').single();if(error)throw error;if(kind==='game'){const questions=Array.from({length:10},(_,i)=>({text:'Pytanie '+(i+1)+'?',answers:[{text:'Rodzina',fixed_points:40},{text:'Przyjaciele',fixed_points:30},{text:'Sąsiedzi',fixed_points:20}]}));const {error:e}=await db.rpc('game_import_content',{p_game_id:data.id,p_name:data.name,p_questions:questions});if(e)throw e;}return data;},{kind,table});rows.push([table,source.id]);
   stage='open '+kind;await page.goto('https://www.familiada.online/'+path+'/');
   const tile=page.locator(selector).filter({hasText:source.name});await expect(tile).toBeVisible({timeout:20000});await tile.locator(kind==='logo'?'.logoName':'.name').click();
   stage='buttons '+kind;
   await expect(page.locator('#btnDuplicate')).toBeVisible();await expect(page.locator('#btnDuplicate')).toBeEnabled({timeout:20000});
   await expect(page.locator('#btnSendCopy')).toBeHidden();
   for(const [label,width,height] of [['mobile',390,844],['desktop',1400,960]]){
    await page.setViewportSize({width,height});await tile.scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('shot-guest-duplicate-'+kind+'-'+label+'.png'),fullPage:false});
   }
   await page.setViewportSize({width:1400,height:960});
   stage='duplicate '+kind;
   const received=page.waitForResponse(response=>response.url().endsWith('/_api/resource-duplicate'));
   await page.locator('#btnDuplicate').click();const response=await received;const result=await response.json();
   expect(response.status(),JSON.stringify(result)).toBe(200);rows.push([table,result.id]);
   const copy=page.locator(selector).filter({hasText:source.name+' kopia'});await expect(copy).toBeVisible({timeout:20000});
   await expect(copy.locator(kind==='logo'?'.logoName':'.name')).toHaveText(source.name+' kopia');
   stage='send rejected '+kind;
   const send=await page.evaluate(async({kind,id})=>{const {data}=await window.__sbClient.auth.getSession();const r=await fetch('/_api/resource-send',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({kind,source_id:id,recipient_id:crypto.randomUUID(),request_id:crypto.randomUUID(),language:'pl'})});return {status:r.status,body:await r.json().catch(()=>null)};},{kind,id:source.id});
   expect(send.status,JSON.stringify(send.body)).toBe(401);expect(send.body?.error).toBe('auth_required');
  }
 }catch(error){console.error('::error title=Guest duplicate detail::'+String(error.message||error).slice(0,1200).replace(/\n/g,'%0A'));throw error;}finally{
  for(const [table,id] of rows.reverse())await page.evaluate(async({table,id})=>{await window.__sbClient.from(table).delete().eq('id',id);},{table,id}).catch(()=>{});
 }
});
