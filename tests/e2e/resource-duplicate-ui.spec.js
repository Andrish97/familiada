const {test,expect}=require('@playwright/test');
const {loginAsPooledTestUser}=require('./helpers/login');
const {serveBranchCode}=require('./helpers/branch-code');
const {generateE2EToken}=require('./helpers/e2e-token');
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
let stage='login';
test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.error('::error title=Duplicate UI stage::'+stage);});
test('duplicate action on Games Bases Logo: own card and name only, shared icon action, mobile and desktop screenshots',async({page,context},info)=>{
 test.setTimeout(240000);const fixtures=[],copies=[];
 if(process.env.GITHUB_REF_NAME!=='main')await serveBranchCode(context,{pages:['games','bases','logo']});
 const e2e=generateE2EToken(process.env.E2E_BYPASS_SECRET);
 await context.route('https://www.familiada.online/_api/resource-duplicate',async route=>await route.continue({headers:{...route.request().headers(),'X-E2E-Token':e2e}}));
 await context.addInitScript(()=>localStorage.setItem('uiLang','pl'));
 await loginAsPooledTestUser(page,context,info.parallelIndex);
 try{
  for(const [kind,path,table,selector] of [['game','games','games','.card[data-game-id]'],['base','bases','question_bases','.card[data-base-id]'],['logo','logo','user_logos','.logoTile']]){
   stage='create source '+kind;
   const source=await page.evaluate(async({kind,table})=>{const db=window.__sbClient,{data:a}=await db.auth.getUser();const name=kind==='game'?'Quiz rodzinny':kind==='base'?'Pytania na wieczór':'RODZINA';let row=kind==='game'?{owner_id:a.user.id,name:name+' '+Date.now(),type:'prepared',status:'draft'}:kind==='base'?{owner_id:a.user.id,name:name+' '+Date.now()}:{user_id:a.user.id,name:name+' '+Date.now(),type:'GLYPH_30x10',payload:{layers:[{color:'main',rows:['10101','01110']}],source:{mode:'TEXT',text:'RODZINA',fontId:'familiada'}}};const {data,error}=await db.from(table).insert(row).select('id,name').single();if(error)throw error;if(kind==='game'){const questions=Array.from({length:10},(_,i)=>({text:'Pytanie '+(i+1)+'?',answers:[{text:'Rodzina',fixed_points:40},{text:'Przyjaciele',fixed_points:30},{text:'Sąsiedzi',fixed_points:20}]}));const {error:e}=await db.rpc('game_import_content',{p_game_id:data.id,p_name:data.name,p_questions:questions});if(e)throw e;}return data;},{kind,table});fixtures.push([table,source.id]);
   stage='open '+kind;await page.goto('https://www.familiada.online/'+path+'/');
   const tile=page.locator(selector).filter({hasText:source.name});await expect(tile).toBeVisible({timeout:20000});await tile.locator(kind==='logo'?'.logoName':'.name').click();
   await expect(page.locator('#btnDuplicate')).toBeEnabled({timeout:20000});
   stage='click duplicate '+kind;
   const received=page.waitForResponse(response=>response.url().endsWith('/_api/resource-duplicate'));
   await page.locator('#btnDuplicate').click();const response=await received;const result=await response.json();expect(response.status(),JSON.stringify(result)).toBe(200);copies.push([table,result.id]);
   const copy=page.locator(selector).filter({hasText:source.name+' kopia'});await expect(copy).toBeVisible({timeout:20000});await expect(copy).toContainText('kopia');
   // The suffix belongs to the title; there is no additional copy badge.
   await expect(copy.locator(kind==='logo'?'.logoName':'.name')).toHaveText(source.name+' kopia');
   await expect(copy.locator('.tag').filter({hasText:/^kopia$/})).toHaveCount(0);
   for(const [label,width,height] of [['mobile',390,844],['desktop',1400,960],['landscape',844,390]]){
    stage='screenshot '+kind+' '+label;await page.setViewportSize({width,height});await copy.scrollIntoViewIfNeeded();await expect(page.locator('#btnDuplicate svg.ico')).toBeVisible();
    if(label==='mobile')await expect(page.locator('#btnDuplicate .only-desktop')).toBeHidden();
    await page.screenshot({path:info.outputPath('shot-resource-duplicate-'+kind+'-'+label+'.png'),fullPage:true});
   }
   await page.setViewportSize({width:1400,height:960});
  }
 }catch(error){console.error('::error title=Duplicate UI detail::'+String(error.message||error).slice(0,1200).replace(/\n/g,'%0A'));throw error;}finally{
  for(const [table,id] of [...copies,...fixtures].reverse())await page.evaluate(async({table,id})=>{const {error}=await window.__sbClient.from(table).delete().eq('id',id);if(error)throw error;},{table,id});
 }
});
