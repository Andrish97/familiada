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
