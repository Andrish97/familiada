import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateResource} from '../../cloudflare/maintenance-worker/src/lib/resource-copy/duplicate.js';
const actor='aaaaaaaa-3657-1000-0000-000000000001',other='aaaaaaaa-3657-1000-0000-000000000002',source='bbbbbbbb-3657-1000-0000-000000000001';
const request='cccccccc-3657-1000-0000-000000000001',job='dddddddd-3657-1000-0000-000000000001',target='eeeeeeee-3657-1000-0000-000000000001',assetId='ffffffff-3657-1000-0000-000000000001';
const env={SUPABASE_URL:'https://storage.example',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key'};
const reply=data=>Response.json(data);
const input=kind=>({kind,source_id:source,request_id:request,language:'pl'});
const snapshot=kind=>({[kind]:{id:source,name:'Alpha',...(kind==='game'?{type:'prepared',status:'draft'}:kind==='logo'?{type:'GLYPH_30x10',payload:{rows:[],source:{mode:'TEXT',text:'Alpha'}}}:{})},questions:[],categories:[],tags:[],question_tags:[],category_tags:[]});
const begin=kind=>({id:job,status:'preparing',actor_id:actor,recipient_id:actor,snapshot:snapshot(kind)});
async function mocked(handler,run){const old=globalThis.fetch,calls=[];globalThis.fetch=async(url,options={})=>{const call={url,options,body:typeof options.body==='string'?JSON.parse(options.body):options.body};calls.push(call);return handler(call);};try{await run(calls);}finally{globalThis.fetch=old;}}

test('all three kinds use one clone pipeline and the current actor as owner regardless of supplied recipient',async()=>{
 for(const kind of ['game','base','logo']){
  await mocked(call=>{
   if(call.url.endsWith('/_resource_clone_begin')){assert.equal(call.body.p_actor,actor);assert.equal(call.body.p_owner,actor);return reply(begin(kind));}
   if(call.url.includes('/resource_clone_assets?'))return reply([]);
   if(call.url.includes('?'))return reply([{name:'Alpha kopia'}]);
   if(call.url.endsWith('/_resource_clone_finish_duplicate')){assert.equal(call.body.p_actor,actor);assert.equal(call.body.p_job,job);assert.equal(call.body.p_demo,false);const named=kind==='logo'?call.body.p_definition:call.body.p_definition[kind];assert.equal(named.name,'Alpha kopia 2');return reply({ok:true,id:target,already:false});}
   assert.fail('unknown call');
  },async()=>assert.deepEqual(await duplicateResource(env,actor,{...input(kind),recipient_id:other,actor:other}),{ok:true,id:target,already:false}));
 }
});
test('completed operation replays only its bound result without reading source, names or assets',async()=>{
 await mocked(()=>reply({...begin('base'),status:'complete',snapshot:null,target_id:target}),async calls=>{
  assert.deepEqual(await duplicateResource(env,actor,input('base')),{ok:true,id:target,already:true});assert.equal(calls.length,1);
 });
});
test('invalid input and foreign job contexts cannot reach materialization or finishing',async()=>{
 await mocked(()=>assert.fail('invalid request reached the database'),async()=>{
  for(const value of [{...input('game'),kind:'unknown'},{...input('game'),source_id:'bad'},{...input('game'),request_id:'bad'}])await assert.rejects(duplicateResource(env,actor,value),/invalid_copy_request/);
 });
 for(const patch of [{actor_id:other},{recipient_id:other},{id:'bad'},{snapshot:snapshot('logo')}]){
  await mocked(()=>reply({...begin('game'),...patch}),async calls=>{await assert.rejects(duplicateResource(env,actor,input('game')),/invalid_copy_job/);assert.equal(calls.length,1);});
 }
});
test('native IMAGE and nested DRAW share one persisted asset recipe and only metadata/copy requests',async()=>{
 const image=`${env.SUPABASE_URL}/storage/v1/object/public/user-logos/${actor}/original.png`;
 const state=begin('logo');state.snapshot.logo={id:source,name:'Alpha',type:'PIX_150x70',payload:{bits_b64:'AA==',source:{mode:'DRAW',imageUrl:image,fabricData:{objects:[{src:image}]}}}};
 const path=`${actor}/copies/${job}/${assetId}.png`,etag='a'.repeat(32);let destination=false;
 const asset={id:assetId,job_id:job,destination_path:path,source_kind:'storage',source_path:`${actor}/original.png`,mime:'image/png',byte_size:3,etag};
 const head=()=>new Response(null,{headers:{ETag:'"'+etag+'"','Content-Length':'3','Content-Type':'image/png'}});
 await mocked(call=>{
  if(call.url.endsWith('/_resource_clone_begin'))return reply(state);
  if(call.url.includes('/resource_clone_assets?'))return reply([]);
  if(call.url.includes('/user_logos?'))return reply([]);
  if(call.url.endsWith('/_resource_clone_asset_register')){assert.equal(call.body.p_reference,image);assert.equal(call.body.p_source_path,`${actor}/original.png`);return reply(asset);}
  if(call.options.method==='HEAD')return call.url.endsWith(path)&&!destination?new Response(null,{status:400}):head();
  if(call.url.endsWith('/object/copy')){destination=true;assert.equal(call.body.destinationKey,path);return reply({});}
  if(call.url.endsWith('/_resource_clone_finish_duplicate')){const src=call.body.p_definition.payload.source;assert.equal(src.imageUrl,`${env.SUPABASE_URL}/storage/v1/object/public/user-logos/${path}`);assert.equal(src.fabricData.objects[0].src,src.imageUrl);return reply({ok:true,id:target});}
  assert.fail('unknown call');
 },async calls=>{
  await duplicateResource(env,actor,input('logo'));assert.equal(calls.filter(call=>call.url.endsWith('/object/copy')).length,1);assert.equal(calls.filter(call=>call.url.endsWith('/_resource_clone_asset_register')).length,1);
  assert.ok(calls.every(call=>!call.url.includes('/object/public/')));
 });
});
test('late upload after account deletion queues only the validated own job prefix',async()=>{
 const state=begin('logo');state.snapshot.logo={id:source,name:'Alpha',type:'PIX_150x70',payload:{bits_b64:'AA==',source:{mode:'IMAGE',imageData:'data:image/png;base64,AQID'}}};let started=false;
 const path=`${actor}/copies/${job}/${assetId}.png`;
 await mocked(call=>{
  if(call.url.endsWith('/_resource_clone_begin')){if(!started){started=true;return reply(state);}return Response.json({message:'auth_required',code:'P0001'},{status:400});}
  if(call.url.includes('/resource_clone_assets?')||call.url.includes('/user_logos?'))return reply([]);
  if(call.url.endsWith('/_resource_clone_asset_register'))return reply({id:assetId,job_id:job,source_kind:'embedded',destination_path:path,content_hash:call.body.p_content_hash});
  if(call.url.endsWith(path)){assert.equal(call.options.method,'POST');assert.deepEqual([...call.body],[1,2,3]);return reply({});}
  if(call.url.endsWith('/_resource_clone_finish_duplicate'))return Response.json({message:'invalid_copy_job',code:'P0001'},{status:400});
  if(call.url.endsWith('/_resource_clone_cleanup')){assert.deepEqual(call.body,{p_owner:actor,p_job:job});return reply(null);}
  assert.fail('unknown call');
 },async calls=>{
  await assert.rejects(duplicateResource(env,actor,{...input('logo'),recipient_id:other}),/invalid_copy_job/);assert.equal(calls.filter(call=>call.url.endsWith('/_resource_clone_cleanup')).length,1);
 });
});
test('name collision refreshes only the name in the same frozen operation; names are paginated',async()=>{
 let finishes=0,round=0;
 await mocked(call=>{
  if(call.url.endsWith('/_resource_clone_begin'))return reply(begin('game'));
  if(call.url.includes('/games?')){if(call.url.endsWith('offset=0'))return reply(Array.from({length:1000},(_,i)=>({name:i===0?(round?'Alpha kopia':'Taken'):'Name'+i})));return reply([]);}
  if(call.url.endsWith('/_resource_clone_finish_duplicate')){finishes++;if(finishes===1){round=1;return Response.json({message:'duplicate key',code:'23505'},{status:409});}assert.equal(call.body.p_definition.game.name,'Alpha kopia 2');return reply({ok:true,id:target});}
  assert.fail('unknown call');
 },async calls=>{await duplicateResource(env,actor,input('game'));assert.equal(finishes,2);assert.equal(calls.filter(call=>call.url.endsWith('/_resource_clone_begin')).length,1);});
});
test('encoded or foreign bucket paths are rejected before privileged HEAD/copy access',async()=>{
 for(const image of [`${env.SUPABASE_URL}/storage/v1/object/public/user-logos/${actor}/%2Fprivate.png`,`${env.SUPABASE_URL}/storage/v1/object/public/user-logos/${other}/file.png`,'https://attacker.invalid/image.png']){
  const state=begin('logo');state.snapshot.logo={id:source,name:'Alpha',type:'PIX_150x70',payload:{bits_b64:'AA==',source:{mode:'IMAGE',imageUrl:image}}};
  await mocked(call=>{if(call.url.endsWith('/_resource_clone_begin'))return reply(state);if(call.url.includes('?'))return reply([]);assert.fail('unsafe image caused a network request');},async()=>await assert.rejects(duplicateResource(env,actor,input('logo')),/invalid_copy_storage_plan|unsupported_copy_image_source/));
 }
});

test('lost database response replays the completed result without cleaning installed assets or creating another resource',async()=>{
 let started=false;
 await mocked(call=>{
  if(call.url.endsWith('/_resource_clone_begin')){if(started)return reply({...begin('base'),status:'complete',target_id:target,snapshot:null});started=true;return reply(begin('base'));}
  if(call.url.includes('/question_bases?'))return reply([]);
  if(call.url.endsWith('/_resource_clone_finish_duplicate'))throw new Error('response lost after commit');
  assert.fail('completed result must not be cleaned');
 },async()=>assert.deepEqual(await duplicateResource(env,actor,input('base')),{ok:true,id:target,already:true}));
});
test('demo IMAGE bytes come only from the known bundled asset and upload directly without base64 conversion',async()=>{
 const state=begin('logo');state.snapshot.demo_origin=true;
 const reference='https://www.familiada.online/logo/assets/demo-image.png';
 state.snapshot.logo={id:source,name:'Demo',is_demo:true,type:'PIX_150x70',payload:{bits_b64:'AA==',source:{mode:'IMAGE',imageUrl:reference}}};
 const path=`${actor}/copies/${job}/${assetId}.png`;
 await mocked(call=>{
  if(call.url.endsWith('/_resource_clone_begin'))return reply(state);
  if(call.url.includes('?'))return reply([]);
  if(call.url==='https://familiada.online/logo/assets/demo-image.png')return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png','Content-Length':'3'}});
  if(call.url.endsWith('/_resource_clone_asset_register')){assert.equal(call.body.p_kind,'demo_asset');assert.equal(call.body.p_reference,reference);return reply({id:assetId,job_id:job,source_kind:'demo_asset',destination_path:path,content_hash:call.body.p_content_hash});}
  if(call.url.endsWith(path)){assert.deepEqual([...call.body],[1,2,3]);return reply({});}
  if(call.url.endsWith('/_resource_clone_finish_duplicate')){assert.equal(call.body.p_demo,true);assert.ok(call.body.p_definition.payload.source.imageUrl.endsWith(path));assert.equal(call.body.p_definition.payload.source.imageData,undefined);return reply({ok:true,id:target});}
  assert.fail('unrecognized source fetch');
 },async()=>await duplicateResource(env,actor,input('logo')));
});
