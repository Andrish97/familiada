import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadCloneLogoImage} from '../../cloudflare/maintenance-worker/src/lib/resource-copy/image.js';
const recipient='aaaaaaaa-3652-1000-0000-000000000001';const copy='bbbbbbbb-3652-1000-0000-000000000001';
const env={SUPABASE_URL:'https://storage.example/',SUPABASE_SERVICE_ROLE_KEY:'synthetic-copy-service'};
const plan={recipient_id:recipient,copy_id:copy,asset_id:'cccccccc-3652-1000-0000-000000000001',image_data:'data:image/png;base64,AQID'};
async function mockFetch(handler,run){const original=globalThis.fetch;globalThis.fetch=handler;try{return await run();}finally{globalThis.fetch=original;}}
test('copy image uploads the same validated bytes into the receiver directory using an immutable copy path',async()=>{
 const requests=[];
 await mockFetch(async(url,options)=>{requests.push({url,options});return new Response('{}',{status:200});},async()=>{
  const result=await uploadCloneLogoImage(env,plan);
  assert.equal(result.path,`${recipient}/copies/${copy}/${plan.asset_id}.png`);assert.equal(result.already,false);assert.match(result.sha256,/^[a-f0-9]{64}$/);
  assert.equal(result.publicUrl,`https://storage.example/storage/v1/object/public/user-logos/${result.path}`);
 });
 assert.equal(requests.length,1);assert.equal(requests[0].options.method,'POST');assert.equal(requests[0].options.headers['x-upsert'],'false');
 assert.equal(requests[0].options.headers['Content-Type'],'image/png');assert.deepEqual([...requests[0].options.body],[1,2,3]);
});
test('concurrent or lost-response upload acknowledges identical bytes and never overwrites the recipient file',async()=>{
 const requests=[];
 await mockFetch(async(url,options)=>{requests.push({url,options});return requests.length===1?new Response('{}',{status:409}):new Response(new Uint8Array([1,2,3]),{status:200});},async()=>{
  const result=await uploadCloneLogoImage(env,plan);assert.equal(result.already,true);
 });
 assert.equal(requests.length,2);assert.equal(requests[1].options.method,undefined);assert.match(requests[1].url,/\/object\/authenticated\/user-logos\//);
});
test('an existing file with different bytes or excessive size is never replaced',async()=>{
 for(const previous of [new Response(new Uint8Array([1,2,4])),new Response('large',{headers:{'Content-Length':String(5*1024*1024+1)}})]){
  let calls=0;await mockFetch(async()=>++calls===1?new Response('{}',{status:409}):previous,async()=>{
   await assert.rejects(uploadCloneLogoImage(env,plan),/copy_image_conflict/);
  });assert.equal(calls,2);
 }
});
test('invalid plans, embedded images and missing configuration never contact Storage',async()=>{
 await mockFetch(async()=>{assert.fail('invalid input reached Storage');},async()=>{
  for(const value of [{...plan,recipient_id:'../sender'},{...plan,copy_id:'../file'},{...plan,image_data:'https://sender/image'}])await assert.rejects(uploadCloneLogoImage(env,value));
  await assert.rejects(uploadCloneLogoImage({},plan),/copy_storage_unavailable/);
 });
});
test('network errors and failed uploads do not return an accepted asset or attempt a replacement',async()=>{
 for(const status of [401,403,500]){
  let calls=0;await mockFetch(async()=>{calls++;return new Response('{}',{status});},async()=>await assert.rejects(uploadCloneLogoImage(env,plan),new RegExp('copy_image_upload_failed:'+status)));
  assert.equal(calls,1);
 }
 await mockFetch(async()=>{throw new Error('network lost');},async()=>await assert.rejects(uploadCloneLogoImage(env,plan),/network lost/));
});
test('raw bundled image bytes share the same owned path and reject oversized or unsupported payloads before upload',async()=>{
 const {uploadCloneLogoBytes}=await import('../../cloudflare/maintenance-worker/src/lib/resource-copy/image.js');
 await mockFetch(async()=>{assert.fail('invalid bytes reached Storage');},async()=>{
  for(const value of [{bytes:new Uint8Array(),mime:'image/png'},{bytes:new Uint8Array(5*1024*1024+1),mime:'image/png'},{bytes:new Uint8Array([1]),mime:'constructor'},{bytes:[1],mime:'image/png'}])await assert.rejects(uploadCloneLogoBytes(env,plan,value),/invalid_copy_storage_plan/);
 });
});
