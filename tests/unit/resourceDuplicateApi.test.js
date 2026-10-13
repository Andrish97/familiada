import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResourceDuplicate,handleResourceSend} from '../../cloudflare/maintenance-worker/src/lib/resource-copy/api.js';
const actor='aaaaaaaa-3658-1000-0000-000000000001',other='aaaaaaaa-3658-1000-0000-000000000002',source='bbbbbbbb-3658-1000-0000-000000000001',request='cccccccc-3658-1000-0000-000000000001',job='dddddddd-3658-1000-0000-000000000001',target='eeeeeeee-3658-1000-0000-000000000001';
const env={SUPABASE_URL:'https://storage.example',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'};
const body={kind:'base',source_id:source,request_id:request};
const req=value=>new Request('https://www.familiada.online/_api/resource-duplicate',{method:'POST',headers:{Authorization:'Bearer ordinary-user-token','Content-Type':'application/json'},body:JSON.stringify(value)});
async function mocked(handler,run){const old=globalThis.fetch;globalThis.fetch=handler;try{await run();}finally{globalThis.fetch=old;}}
test('duplicate API requires a valid bearer identity and never accepts an actor supplied in the body',async()=>{
 await mocked(()=>assert.fail('unauthenticated request reached backend'),async()=>{
  const response=await handleResourceDuplicate(new Request('https://site/_api/resource-duplicate',{method:'POST'}),env);assert.equal(response.status,401);
 });
 await mocked(async(url,options)=>{
  if(url.endsWith('/auth/v1/user')){assert.equal(new Headers(options.headers).get('Authorization'),'Bearer ordinary-user-token');return Response.json({id:actor});}
  const params=JSON.parse(options.body);assert.equal(params.p_actor,actor);assert.equal(params.p_owner,actor);
  return Response.json({id:job,actor_id:actor,recipient_id:actor,status:'complete',target_id:target});
 },async()=>{
  const response=await handleResourceDuplicate(req({...body,actor:other,recipient_id:other}),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,id:target,already:true});
 });
});
test('invalid authentication, JSON and operation shapes never reach the privileged cloning functions',async()=>{
 await mocked(async()=>Response.json({message:'invalid JWT'},{status:401}),async()=>assert.equal((await handleResourceDuplicate(req(body),env)).status,401));
 await mocked(async url=>{assert.ok(url.endsWith('/auth/v1/user'));return Response.json({id:actor});},async()=>{
  for(const value of [null,[],{...body,kind:'unknown'},{...body,request_id:'bad'}])assert.equal((await handleResourceDuplicate(req(value),env)).status,400);
  const response=await handleResourceDuplicate(new Request('https://site/_api/resource-duplicate',{method:'POST',headers:{Authorization:'Bearer ordinary-user-token'},body:'broken json'}),env);assert.equal(response.status,400);
 });
});
test('database locks have a stable public code; unknown backend details never enter the response',async()=>{
 for(const [databaseCode,message,expected,status] of [['55P03','could not obtain row lock','resource_in_use',409],['P0001','not_found','not_found',404],['XX000','private database detail','copy_failed',503]]){
  await mocked(async url=>url.endsWith('/auth/v1/user')?Response.json({id:actor}):Response.json({code:databaseCode,message},{status:400}),async()=>{
   const response=await handleResourceDuplicate(req(body),env);assert.equal(response.status,status);assert.deepEqual(await response.json(),{ok:false,error:expected});
  });
 }
});
test('send API derives the sender from Auth and returns only the recipient offer receipt',async()=>{
 const offer='ffffffff-3658-1000-0000-000000000001';
 await mocked(async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:actor});
  if(url.includes('/rpc/_resource_clone_begin')){
   const args=JSON.parse(options.body);assert.equal(args.p_actor,actor);assert.equal(args.p_owner,other);assert.equal(args.p_action,'send');
   return Response.json({id:job,actor_id:actor,recipient_id:other,status:'complete',target_id:target});
  }
  if(String(url).includes('/resource_copy_offers'))return Response.json([{id:offer,token:job}]);
  if(String(url).includes('/mail_notification_allocations'))return Response.json([]);
  assert.fail('unexpected send receipt query');
 },async()=>{
  const response=await handleResourceSend(new Request('https://www.familiada.online/_api/resource-send',{method:'POST',headers:{Authorization:'Bearer ordinary-user-token','Content-Type':'application/json'},body:JSON.stringify({...body,kind:'game',recipient_id:other,actor:other})}),env);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,offer_id:offer,go_token:job,mail_allowed:false,already:true});
 });
});
