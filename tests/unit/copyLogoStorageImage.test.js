import test from 'node:test';
import assert from 'node:assert/strict';
import {copyLogoStorageImage} from '../../cloudflare/maintenance-worker/src/lib/resource-copy/storage-copy.js';
const sender='aaaaaaaa-3652-1000-0000-000000000001',receiver='bbbbbbbb-3652-1000-0000-000000000001';
const copy='cccccccc-3652-1000-0000-000000000001',asset='dddddddd-3652-1000-0000-000000000001';
const env={SUPABASE_URL:'https://storage.example/',SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-key'};
const plan={source_owner_id:sender,recipient_id:receiver,copy_id:copy,asset_id:asset,source_path:`${sender}/original.png`,etag:'a'.repeat(32),size:3,mime:'image/png'};
const path=`${receiver}/copies/${copy}/${asset}.png`;
const metadata=(headers={})=>new Response(null,{headers:{ETag:'"'+plan.etag+'"','Content-Length':'3','Content-Type':'image/png',...headers}});
async function runMock(responses,run){const old=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});const response=responses.shift();if(response instanceof Error)throw response;assert.ok(response,'unexpected request');return response;};try{await run(calls);assert.equal(responses.length,0);}finally{globalThis.fetch=old;}}
test('native Storage copy uses JSON, trusted owner directories and metadata only; never downloads or uploads bytes',async()=>{
 await runMock([new Response(null,{status:404}),metadata(),new Response('{}'),metadata()],async calls=>{
  const result=await copyLogoStorageImage(env,plan);assert.deepEqual(result,{path,publicUrl:`https://storage.example/storage/v1/object/public/user-logos/${path}`,etag:plan.etag,size:3,already:false});
  assert.equal(calls.length,4);assert.deepEqual(calls.map(r=>r.options.method),['HEAD','HEAD','POST','HEAD']);
  assert.equal(calls[2].url,'https://storage.example/storage/v1/object/copy');
  assert.deepEqual(JSON.parse(calls[2].options.body),{bucketId:'user-logos',sourceKey:plan.source_path,destinationKey:path});
  assert.ok(calls.every(r=>r.options.headers.Authorization==='Bearer synthetic-test-key'));
  assert.ok(calls.every(r=>!r.options.headers['x-upsert']));
 });
});
test('completed clone retry survives deletion of the source and only inspects its own immutable destination',async()=>{
 await runMock([metadata()],async calls=>{assert.equal((await copyLogoStorageImage(env,plan)).already,true);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith(path));});
});
test('deployed Storage missing-HEAD400 still requires a valid source and never treats a broken source as usable',async()=>{
 await runMock([new Response(null,{status:400}),metadata(),new Response('{}'),metadata()],async()=>assert.equal((await copyLogoStorageImage(env,plan)).already,false));
 await runMock([new Response(null,{status:400}),new Response(null,{status:400})],async()=>await assert.rejects(copyLogoStorageImage(env,plan),/copy_image_source_changed/));
});
test('concurrent copy accepts only the identical destination after a Storage conflict',async()=>{
 for(const status of [400,409])await runMock([new Response(null,{status:404}),metadata(),new Response('{}',{status}),metadata()],async()=>{assert.equal((await copyLogoStorageImage(env,plan)).already,true);});
});
test('different, oversized, truncated and wrong-MIME destination never gets overwritten',async()=>{
 for(const headers of [{ETag:'b'.repeat(32)},{'Content-Length':'4'},{'Content-Length':'0'},{'Content-Length':String(5*1024*1024+1)},{'Content-Type':'image/jpeg'},{ETag:'W/"'+plan.etag+'"'}]){
  await runMock([metadata(headers)],async()=>await assert.rejects(copyLogoStorageImage(env,plan),/copy_image_conflict/));
 }
});
test('missing or changed source prevents copy; changes during copy never return a usable result',async()=>{
 for(const source of [new Response(null,{status:404}),metadata({ETag:'b'.repeat(32)}),metadata({'Content-Length':'4'})])await runMock([new Response(null,{status:404}),source],async()=>await assert.rejects(copyLogoStorageImage(env,plan),/copy_image_source_changed/));
 await runMock([new Response(null,{status:404}),metadata(),new Response('{}'),metadata({ETag:'b'.repeat(32)})],async()=>await assert.rejects(copyLogoStorageImage(env,plan),/copy_image_conflict/));
});
test('invalid plans reject traversal, foreign sources and missing trusted metadata before Storage access',async()=>{
 await runMock([],async()=>{
  for(const patch of [{source_owner_id:'bad'},{recipient_id:'../other'},{copy_id:'bad'},{asset_id:'bad'},{source_path:`${receiver}/original.png`},{source_path:`${sender}/../file.png`},{source_path:`${sender}/%2e%2e/file.png`},{source_path:`${sender}/a?redirect=1`},{source_path:`${sender}//a.png`},{size:0},{size:5*1024*1024+1},{size:3.5},{mime:'image/svg+xml'},{etag:'invalid'},{etag:''}])await assert.rejects(copyLogoStorageImage(env,{...plan,...patch}),/invalid_copy_storage_plan/);
  await assert.rejects(copyLogoStorageImage({},plan),/copy_storage_unavailable/);
 });
});
test('lost copy response can be retried without another Storage write; auth and service failures are propagated',async()=>{
 await runMock([new Response(null,{status:404}),metadata(),new Error('response lost')],async()=>await assert.rejects(copyLogoStorageImage(env,plan),/response lost/));
 await runMock([metadata()],async()=>assert.equal((await copyLogoStorageImage(env,plan)).already,true));
 for(const status of [401,403,500]){
  await runMock([new Response(null,{status})],async()=>await assert.rejects(copyLogoStorageImage(env,plan),new RegExp('copy_image_inspect_failed:'+status)));
  await runMock([new Response(null,{status:404}),metadata(),new Response('{}',{status})],async()=>await assert.rejects(copyLogoStorageImage(env,plan),new RegExp('copy_image_storage_failed:'+status)));
 }
});
test('all permitted MIME types and the exact5MiB boundary use the same copy mechanism',async()=>{
 for(const [mime,ext] of Object.entries({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'})){
  const size=5*1024*1024,expected=metadata({'Content-Type':mime,'Content-Length':String(size)});
  await runMock([expected],async()=>{const result=await copyLogoStorageImage(env,{...plan,mime,size});assert.ok(result.path.endsWith('.'+ext));});
 }
});
