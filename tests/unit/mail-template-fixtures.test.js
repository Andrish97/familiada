import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHmac, randomUUID } from 'node:crypto';
import { handleE2EApi } from '../../cloudflare/maintenance-worker/src/lib/e2e/e2e-api.js';
const env={E2E_BYPASS_SECRET:'fixture-secret',SUPABASE_URL:'https://supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-key'};
const url=new URL('https://www.familiada.online/_e2e_api/mail-template-fixtures');
const item={subject:'E2E-PKT6-1791824000000-pl-confirmation',html:'<html lang="pl"><body>Fixture</body></html>'};
function request(body,authorized=true){
 const payload=Buffer.from(JSON.stringify({iat:Date.now()-1000,nonce:randomUUID()})).toString('base64');
 const headers={'Content-Type':'application/json'};
 if(authorized)headers['X-E2E-Token']=payload+'.'+createHmac('sha256',env.E2E_BYPASS_SECRET).update(payload).digest('hex');
 return new Request(url,{method:'POST',headers,body:JSON.stringify(body)});
}
const valid={recipient:'test14@familiada.online',items:[item]};
test('SMTP template fixture requires private signature, exact test14 and bounded labeled documents',async t=>{
 const oldCrypto=globalThis.crypto;Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});t.after(()=>Object.defineProperty(globalThis,'crypto',{value:oldCrypto,configurable:true}));
 assert.equal((await handleE2EApi(request(valid,false),env,url)).status,401);
 for(const body of [null,{}, {...valid,recipient:'real@example.com'},{...valid,recipient:'test9@familiada.online'},
  {...valid,recipient:'test15@familiada.online'}, {...valid,items:[]},{...valid,items:Array(16).fill(item)},
  {...valid,items:[{...item,subject:'Resource invitation'}]}, {...valid,items:[{...item,html:'x'.repeat(64001)}]}]){
  assert.equal((await handleE2EApi(request(body),env,url)).status,400);
 }
});
test('SMTP fixture uses preference-checked service mail and never forges resource or contact exceptions',async t=>{
 const previous=globalThis.fetch;const calls=[];globalThis.fetch=async(input,options)=>{calls.push({input,options});return Response.json([{id:'fixture'}],{status:201});};t.after(()=>globalThis.fetch=previous);
 const response=await handleE2EApi(request(valid),env,url);assert.equal(response.status,200);assert.equal((await response.json()).queued,1);
 assert.equal(calls.length,1);assert.ok(String(calls[0].input).endsWith('/rest/v1/mail_queue?select=id'));
 const rows=JSON.parse(calls[0].options.body);assert.equal(rows[0].to_email,'test14@familiada.online');assert.equal(rows[0].created_by,null);
 assert.equal(rows[0].cooldown_action_key,'admin:marketing');assert.equal(rows[0].contact_message_id,undefined);assert.equal(rows[0].notification_source_kind,undefined);
 globalThis.fetch=async()=>new Response('Unavailable',{status:503});assert.equal((await handleE2EApi(request(valid),env,url)).status,502);
});
test('private capability cleanup requires signature and only removes test14 links, preserving root and budgets',async t=>{
 const endpoint=new URL('https://www.familiada.online/_e2e_api/mail-center-capabilities?recipient=test9@familiada.online');
 const denied=await handleE2EApi(new Request(endpoint,{method:'DELETE'}),env,endpoint);assert.equal(denied.status,401);
 const headers=request(valid).headers;const previous=globalThis.fetch;const calls=[];
 globalThis.fetch=async(input,options)=>{calls.push({input,options});return new Response(null,{status:204});};t.after(()=>globalThis.fetch=previous);
 const response=await handleE2EApi(new Request(endpoint,{method:'DELETE',headers}),env,endpoint);assert.equal(response.status,200);
 assert.equal(calls.length,1);assert.ok(String(calls[0].input).endsWith('/rest/v1/mail_center_links?email=eq.test14%40familiada.online'));
 assert.equal(calls[0].options.method,'DELETE');
});
test('test14 preference restoration is private, fixed to test14 and cannot write caller-supplied fields',async t=>{
 const endpoint=new URL('https://www.familiada.online/_e2e_api/mail-center-preference');
 assert.equal((await handleE2EApi(new Request(endpoint,{method:'POST',body:'{}'}),env,endpoint)).status,401);
 const previous=globalThis.fetch;const calls=[];globalThis.fetch=async(input,options)=>{calls.push({input,options});return new Response(null,{status:204});};t.after(()=>globalThis.fetch=previous);
 for (const stamp of [null,'2026-10-12T12:00:00.000Z']) {
  const headers=request(valid).headers;const req=new Request(endpoint,{method:'POST',headers,body:JSON.stringify({suppressed_at:stamp,email:'test9@familiada.online',token:'foreign'})});
  assert.equal((await handleE2EApi(req,env,endpoint)).status,200);
  const call=calls.at(-1);assert.ok(String(call.input).endsWith('/rest/v1/email_unsub_tokens?email=eq.test14%40familiada.online'));
  assert.deepEqual(JSON.parse(call.options.body),{suppressed_at:stamp});assert.equal(call.options.method,'PATCH');
 }
 for(const stamp of [undefined,{},true,14,'not-date','x'.repeat(41)]){
  const headers=request(valid).headers;const req=new Request(endpoint,{method:'POST',headers,body:JSON.stringify({suppressed_at:stamp})});
  assert.equal((await handleE2EApi(req,env,endpoint)).status,400);
 }
 assert.equal(calls.length,2);
});
test('test mail trigger is signed, excludes reserved and real recipients, and bounds the time window',async t=>{
 const endpoint=new URL('https://www.familiada.online/_e2e_api/mail-trigger');
 const invoke=(body,authorized=true)=>handleE2EApi(new Request(endpoint,{method:'POST',headers:request({},authorized).headers,body:JSON.stringify(body)}),env,endpoint);
 const after=new Date(Date.now()-2000).toISOString();
 assert.equal((await invoke({recipient:'test14@familiada.online',after},false)).status,401);
 for(const body of [{},{recipient:'real@example.com',after},{recipient:'test9@familiada.online',after},{recipient:'test10@familiada.online',after},{recipient:'test14@familiada.online',after:'bad'}, {recipient:'test14@familiada.online',after:new Date(Date.now()-901000).toISOString()}]) assert.equal((await invoke(body)).status,400);
});
test('test mail trigger selects pending current mail and invokes the normal selected worker without writing state',async t=>{
 const endpoint=new URL('https://www.familiada.online/_e2e_api/mail-trigger'),after=new Date(Date.now()-2000).toISOString();
 const req=()=>new Request(endpoint,{method:'POST',headers:request({}).headers,body:JSON.stringify({recipient:'test14@familiada.online',after,ids:['foreign'],bypassDelay:true})});
 const previous=globalThis.fetch,calls=[];t.after(()=>globalThis.fetch=previous);
 globalThis.fetch=async(input,options)=>{calls.push({input,options});return Response.json(calls.length===1?[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]:{ok:true});};
 assert.equal((await handleE2EApi(req(),env,endpoint)).status,200);
 assert.equal(calls.length,2);const query=new URL(calls[0].input).searchParams;
 assert.equal(query.get('to_email'),'eq.test14@familiada.online');assert.equal(query.get('status'),'eq.pending');assert.equal(query.get('created_at'),'gte.'+after);assert.ok(query.get('not_before').startsWith('lte.'));assert.equal(query.get('limit'),'25');assert.equal(calls[0].options.method,'GET');
 assert.ok(String(calls[1].input).endsWith('/rest/v1/rpc/invoke_mail_worker_ids'));
 assert.deepEqual(JSON.parse(calls[1].options.body),{p_ids:['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],p_limit:1});
 globalThis.fetch=async()=>Response.json([]);assert.deepEqual(await (await handleE2EApi(req(),env,endpoint)).json(),{ok:true,selected:0});
 globalThis.fetch=async()=>new Response('Unavailable',{status:503});assert.equal((await handleE2EApi(req(),env,endpoint)).status,502);
 let attempt=0;globalThis.fetch=async()=>++attempt===1?Response.json([{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]):new Response('Unavailable',{status:503});assert.equal((await handleE2EApi(req(),env,endpoint)).status,502);
});
