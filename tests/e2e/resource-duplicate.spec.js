const {test,expect}=require('@playwright/test');
const {loginAsPooledTestUser}=require('./helpers/login');
const {serveBranchCode}=require('./helpers/branch-code');
const {generateE2EToken}=require('./helpers/e2e-token');
const {randomUUID}=require('node:crypto');
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l38AAAAASUVORK5CYII=';
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
let stage='login';
test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.error('::error title=Resource duplicate stage::'+stage);});
test('common duplicate API: three game types, complete base tree, all logo modes, replay, source removal and own files',async({page,context},info)=>{
 test.setTimeout(240000);const resources=[],files=[];
 if(process.env.GITHUB_REF_NAME!=='main')await serveBranchCode(context,{pages:['games','bases','logos']});
 await loginAsPooledTestUser(page,context,info.parallelIndex);
 const e2e=generateE2EToken(process.env.E2E_BYPASS_SECRET);
 const duplicate=async(kind,id,request)=>page.evaluate(async({kind,id,request,e2e})=>{
  const {data,error}=await window.__sbClient.auth.getSession();if(error)throw error;
  const response=await fetch('/_api/resource-duplicate',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json','X-E2E-Token':e2e},body:JSON.stringify({kind,source_id:id,request_id:request,language:'pl'})});
  return {status:response.status,result:await response.json()};
 },{kind,id,request,e2e});
 const remove=async(kind,id)=>page.evaluate(async({kind,id})=>{const table={game:'games',base:'question_bases',logo:'user_logos'}[kind];const {error}=await window.__sbClient.from(table).delete().eq('id',id);if(error)throw error;},{kind,id});
 try{
  for(const type of ['prepared','poll_text','poll_points']){
   stage='source game '+type;
   const source=await page.evaluate(async type=>{const db=window.__sbClient,{data:a}=await db.auth.getUser();const {data:g,error}=await db.from('games').insert({owner_id:a.user.id,name:'E2E-DUP-'+type+'-'+Date.now(),type,status:'draft'}).select('id,name').single();if(error)throw error;const packet=[{text:'Pytanie?',answers:type==='poll_text'?[]:[{text:'Tak',fixed_points:type==='prepared'?20:0}]}];const {error:content}=await db.rpc('game_import_content',{p_game_id:g.id,p_name:g.name,p_questions:packet});if(content)throw content;return {...g,packet};},type);resources.push(['game',source.id]);
   const request=randomUUID();stage='duplicate game '+type;const response=await duplicate('game',source.id,request);expect(response.status,JSON.stringify(response.result)).toBe(200);const id=response.result.id;resources.push(['game',id]);expect(id).not.toBe(source.id);
   const read=await page.evaluate(async id=>{const db=window.__sbClient;const {data:g,error}=await db.from('games').select('id,name,type,status,owner_id,settings').eq('id',id).single();if(error)throw error;const {data:q,error:qe}=await db.from('questions').select('id,text,answers(id,text,fixed_points)').eq('game_id',id);if(qe)throw qe;return {game:g,questions:q};},id);
   expect(read.game.name).toBe(source.name+' kopia');expect(read.game.type).toBe(type);expect(read.game.status).toBe('draft');expect(read.questions).toHaveLength(1);expect(read.questions[0].text).toBe('Pytanie?');expect(read.questions[0].answers).toHaveLength(type==='poll_text'?0:1);
   await remove('game',source.id);const replay=await duplicate('game',source.id,request);expect(replay.result.id).toBe(id);expect(replay.result.already).toBe(true);
   await remove('game',id);const removed=await duplicate('game',source.id,request);expect(removed.status).toBe(410);expect(removed.result.error).toBe('previously_removed');
  }
  stage='create base tree';
  const base=await page.evaluate(async()=>{const db=window.__sbClient,{data:a}=await db.auth.getUser();const one=async q=>{const {data,error}=await q.select('id').single();if(error)throw error;return data.id;};const name='E2E-DUP-BASE-'+Date.now(),id=await one(db.from('question_bases').insert({owner_id:a.user.id,name}));const parent=await one(db.from('qb_categories').insert({base_id:id,name:'Root',ord:1}));const child=await one(db.from('qb_categories').insert({base_id:id,parent_id:parent,name:'Child',ord:1}));const tag=await one(db.from('qb_tags').insert({base_id:id,name:'Tag',color:'gold'}));const q=await one(db.from('qb_questions').insert({base_id:id,category_id:child,payload:{text:'Pytanie?',answers:[{text:'Tak',points:20}]},ord:1}));for(const [table,row] of [['qb_question_tags',{question_id:q,tag_id:tag}],['qb_category_tags',{category_id:parent,tag_id:tag}]]){const {error}=await db.from(table).insert(row);if(error)throw error;}return {id,name,parent,child,tag,q};});resources.push(['base',base.id]);
  stage='duplicate base tree';const baseCopy=await duplicate('base',base.id,randomUUID());expect(baseCopy.status,JSON.stringify(baseCopy.result)).toBe(200);resources.push(['base',baseCopy.result.id]);
  const copied=await page.evaluate(async id=>{const db=window.__sbClient,rows=async(table,query)=>{const {data,error}=await query;if(error)throw error;return data;};const root=(await rows('',db.from('question_bases').select('*').eq('id',id)))[0];const categories=await rows('',db.from('qb_categories').select('*').eq('base_id',id));const questions=await rows('',db.from('qb_questions').select('*').eq('base_id',id));const tags=await rows('',db.from('qb_tags').select('*').eq('base_id',id));return {root,categories,questions,tags,qtags:await rows('',db.from('qb_question_tags').select('*').in('question_id',questions.map(q=>q.id))),ctags:await rows('',db.from('qb_category_tags').select('*').in('category_id',categories.map(c=>c.id))),shares:await rows('',db.from('question_base_shares').select('*').eq('base_id',id))};},baseCopy.result.id);
  expect(copied.root.name).toBe(base.name+' kopia');expect(copied.categories).toHaveLength(2);expect(copied.questions).toHaveLength(1);expect(copied.tags).toHaveLength(1);expect(copied.qtags).toHaveLength(1);expect(copied.ctags).toHaveLength(1);expect(copied.shares).toHaveLength(0);expect(copied.categories.find(c=>c.name==='Child').parent_id).toBe(copied.categories.find(c=>c.name==='Root').id);expect(copied.questions[0].category_id).toBe(copied.categories.find(c=>c.name==='Child').id);expect(copied.categories.map(c=>c.id)).not.toContain(base.parent);expect(copied.questions[0].id).not.toBe(base.q);expect(copied.tags[0].id).not.toBe(base.tag);
  stage='original logo image upload';const image=await page.evaluate(async data=>{const {uploadImportedLogoImage}=await import('/logo/js/db.js?v='+document.querySelector('meta[name="app-version"]').content);const {data:a}=await window.__sbClient.auth.getUser();return uploadImportedLogoImage(data,a.user.id);},pixel);files.push(image);
  for(const mode of ['TEXT','IMAGE','DRAW']){
   stage='source logo '+mode;
   const original=await page.evaluate(async({mode,image})=>{const {data:a}=await window.__sbClient.auth.getUser();const source=mode==='TEXT'?{mode,text:'RODZINA'}:mode==='IMAGE'?{mode,imageUrl:image,crop:{x:1,y:2}}:{mode,fabricData:{objects:[{type:'image',src:image}]},editHistory:['private']};const payload=mode==='TEXT'?{layers:[{color:'main',rows:['101']}],source}:{w:150,h:70,format:'BITPACK_ROW_LSB',bits_b64:'AA==',source};const {data,error}=await window.__sbClient.from('user_logos').insert({user_id:a.user.id,name:'E2E-DUP-'+mode+'-'+Date.now(),type:mode==='TEXT'?'GLYPH_30x10':'PIX_150x70',payload}).select('id,name').single();if(error)throw error;return data;},{mode,image});resources.push(['logo',original.id]);
   stage='duplicate logo '+mode;const copy=await duplicate('logo',original.id,randomUUID());expect(copy.status,JSON.stringify(copy.result)).toBe(200);resources.push(['logo',copy.result.id]);
   const row=await page.evaluate(async id=>{const {data,error}=await window.__sbClient.from('user_logos').select('id,name,user_id,type,payload').eq('id',id).single();if(error)throw error;return data;},copy.result.id);expect(row.name).toBe(original.name+' kopia');expect(row.payload.source.mode).toBe(mode);expect(row.payload.source.editHistory).toBeUndefined();
   if(mode!=='TEXT'){const url=mode==='IMAGE'?row.payload.source.imageUrl:row.payload.source.fabricData.objects[0].src;files.push(url);expect(url).not.toBe(image);expect(url).toContain('/copies/');const independent=await page.evaluate(async url=>{const response=await fetch(url);return response.ok;},url);expect(independent).toBe(true);}
  }
 }catch(error){console.error('::error title=Duplicate API detail::'+String(error.message||error).slice(0,1200).replace(/\n/g,'%0A'));throw error;}finally{
  for(const [kind,id] of resources.reverse())await remove(kind,id);
  for(const url of files)await page.evaluate(async url=>{const {removeLogoImageUrl}=await import('/logo/js/db.js?v='+document.querySelector('meta[name="app-version"]').content);const {data:a}=await window.__sbClient.auth.getUser();await removeLogoImageUrl(url,a.user.id);},url);
 }
});
