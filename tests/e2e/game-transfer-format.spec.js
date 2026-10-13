const {test,expect}=require('@playwright/test');
const {serveBranchCode}=require('./helpers/branch-code');
const {loginAsPooledTestUser}=require('./helpers/login');
const branch=process.env.GITHUB_REF_NAME!=='main';
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
test.afterEach(async({},testInfo)=>{
 if(testInfo.status!==testInfo.expectedStatus)console.log(`::error title=Game transfer::${testInfo.title}; ${String(testInfo.errors?.[0]?.message||'').split('\n').filter(Boolean).slice(0,2).join(' ').slice(0,220)}`);
});
test('common game transfer format: native export and existing import for all three kinds, fresh identities and complete cleanup',async({page,context},testInfo)=>{
 test.setTimeout(180000);const owned=[];
 if(branch)await serveBranchCode(context,{pages:['games']});
 await context.addInitScript(()=>localStorage.setItem('uiLang','pl'));
 await loginAsPooledTestUser(page,context,testInfo.parallelIndex);
 try{
  for(const type of ['prepared','poll_text','poll_points']){
   const source=await page.evaluate(async type=>{
    const db=window.__sbClient;const {data:auth,error:aErr}=await db.auth.getUser();if(aErr)throw aErr;
    const {data:game,error}=await db.from('games').insert({owner_id:auth.user.id,name:'E2E-TRANSFER-'+type+'-'+Date.now(),type,status:'draft'}).select('id,name').single();if(error)throw error;
    return {...game,ownerId:auth.user.id};
   },type);owned.push(source.id);
   await page.evaluate(async id=>{
    const db=window.__sbClient;const {data:qs,error}=await db.from('questions').insert(Array.from({length:10},(_,i)=>({game_id:id,ord:i+1,text:'Wakacyjne pytanie '+(i+1)}))).select('id,ord');if(error)throw error;
    const {error:aErr}=await db.from('answers').insert(qs.flatMap(q=>Array.from({length:3},(_,i)=>({question_id:q.id,ord:i+1,text:['Aparat','Książkę','Piłkę'][i],fixed_points:10*(i+1)}))));if(aErr)throw aErr;
   },source.id);
   const result=await page.evaluate(async({source,type})=>{
    const version=document.querySelector('meta[name="app-version"]')?.content;if(!version)throw new Error('missing app-version');
    const {exportGame,importGame}=await import('/games/js/games-import-export.js?v='+encodeURIComponent(version));
    const progress=[];const packet=await exportGame(source.id,event=>progress.push({i:event.i,n:event.n}));
    const copyId=await importGame(packet,source.ownerId);
    return {packet,copyId,progress};
   },{source,type});owned.push(result.copyId);
   expect(result.packet.game).toEqual({name:source.name,type});expect(result.packet.questions).toHaveLength(10);
   expect(result.progress).toEqual(Array.from({length:11},(_,i)=>({i,n:10})));
   expect(JSON.stringify(result.packet)).not.toContain(source.id);expect(JSON.stringify(result.packet)).not.toContain(source.ownerId);
   expect(result.copyId).not.toBe(source.id);
   for(const question of result.packet.questions){expect(question.answers).toHaveLength(type==='poll_text'?0:3);if(type==='poll_points')expect(question.answers.map(a=>a.fixed_points)).toEqual([0,0,0]);}
   const copy=await page.evaluate(async id=>{
    const db=window.__sbClient;const {data:game,error}=await db.from('games').select('owner_id,name,type,status').eq('id',id).single();if(error)throw error;
    const {data:qs,error:qErr}=await db.from('questions').select('id,ord,text,answers(id,ord,text,fixed_points)').eq('game_id',id).order('ord');if(qErr)throw qErr;
    return {game,questions:qs};
   },result.copyId);
   expect(copy.game).toEqual({owner_id:source.ownerId,name:source.name,type,status:'draft'});expect(copy.questions).toHaveLength(10);
   expect(copy.questions.map(q=>({text:q.text,answers:q.answers.sort((a,b)=>a.ord-b.ord).map(a=>({text:a.text,fixed_points:a.fixed_points}))}))).toEqual(result.packet.questions);
  }
 }finally{
  for(const id of owned)await page.evaluate(async id=>{const {error}=await window.__sbClient.from('games').delete().eq('id',id);if(error)throw error;},id);
 }
});

test('atomic game import: file modal retry after lost response, foreign owner and deleted result',async({page,context},testInfo)=>{
 test.setTimeout(120000);let importedId=null;let firstRequest=null;let stage='login';
 if(branch)await serveBranchCode(context,{pages:['games']});
 await context.addInitScript(()=>localStorage.setItem('uiLang','pl'));
 await loginAsPooledTestUser(page,context,testInfo.parallelIndex);
 const rpc='**/rest/v1/rpc/game_import_package';const requests=[];
 page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/rpc/game_import_package'))requests.push(request.postDataJSON()?.p_request_id);});
 try{
  stage='select file';
  const packet={game:{name:'E2E-ATOMIC-'+Date.now(),type:'prepared'},questions:Array.from({length:10},(_,i)=>({text:'Pytanie '+(i+1),answers:[{text:'Tak',fixed_points:25}]}))};
  // Login waits for the URL, before Games finishes auth and installs handlers.
  await expect(page.locator('#grid .card').first()).toBeVisible({timeout:15000});
  await page.locator('#btnImport').click();
  await expect(page.locator('#importOverlay')).toBeVisible();
  await page.locator('#importFile').setInputFiles({name:'atomic.famgame',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(packet))});
  await expect(page.locator('#btnImportJson')).toBeEnabled();
  stage='drop committed response';
  await page.route(rpc,async route=>{
   firstRequest=route.request().postDataJSON();const response=await route.fetch();const data=await response.json();
   if(data.ok&&data.id){importedId=data.id;await route.abort('failed');}else await route.fulfill({response});
  });
  await page.locator('#btnImportJson').click();
  await expect(page.locator('#importMsg')).not.toHaveText('');
  await expect(page.locator('#btnImportJson')).toBeEnabled();
  await expect(page.locator('#importOverlay')).toBeVisible();
  expect(importedId).toBeTruthy();expect(firstRequest?.p_request_id).toBeTruthy();
  await page.unroute(rpc);
  stage='retry same file in modal';
  await page.locator('#btnImportJson').click();
  await expect(page.locator('#importOverlay')).toBeHidden();
  expect(requests).toEqual([firstRequest.p_request_id,firstRequest.p_request_id]);
  const replay=await page.evaluate(async({id,request})=>{
   const db=window.__sbClient;const {data:games,error}=await db.from('games').select('id').eq('name',request.p_payload.game.name).eq('owner_id',request.p_owner_id);if(error)throw error;
   const {data:qs,error:qErr}=await db.from('questions').select('id,answers(id,fixed_points)').eq('game_id',id);if(qErr)throw qErr;
   return {ids:games.map(game=>game.id),questions:qs.length,answers:qs.map(q=>q.answers)};
  },{id:importedId,request:firstRequest});
  expect(replay.ids).toEqual([importedId]);expect(replay.questions).toBe(10);
  expect(replay.answers.every(items=>items.length===1&&items[0].fixed_points===25)).toBe(true);
  stage='foreign owner';
  const foreign=await page.evaluate(async request=>{
   const {data,error}=await window.__sbClient.rpc('game_import_package',{...request,p_owner_id:crypto.randomUUID(),p_request_id:crypto.randomUUID()});if(error)throw error;return data;
  },firstRequest);expect(foreign.error).toBe('auth_required');
  stage='deleted result stays deleted';
  await page.evaluate(async id=>{const {error}=await window.__sbClient.from('games').delete().eq('id',id);if(error)throw error;},importedId);
  const deleted=await page.evaluate(async request=>{const {data,error}=await window.__sbClient.rpc('game_import_package',request);if(error)throw error;return data;},firstRequest);
  expect(deleted.error).toBe('previously_removed');
 }catch(error){const previewError=await page.locator('#importErr').textContent().catch(()=>null);console.log(`::error title=Atomic game import::stage=${stage}; preview=${String(previewError||'').slice(0,120)}; ${String(error.message).split('\n')[0].slice(0,180)}`);throw error;}
 finally{
  await page.unroute(rpc);
  if(importedId)await page.evaluate(async id=>{const {error}=await window.__sbClient.from('games').delete().eq('id',id);if(error)throw error;},importedId);
 }
});
