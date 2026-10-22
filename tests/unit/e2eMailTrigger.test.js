import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHmac, randomUUID } from 'node:crypto';
import { handleE2EApi } from '../../cloudflare/maintenance-worker/src/lib/e2e/e2e-api.js';
// /_e2e_api/mail-trigger: tylko adres e2e+ wypożyczony przez przebieg (E25).
const env={E2E_BYPASS_SECRET:'fixture-secret',SUPABASE_URL:'https://supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-key'};
const endpoint=new URL('https://www.familiada.online/_e2e_api/mail-trigger');
const RECIPIENT='e2e+noaccount02@familiada.online';
function headers(authorized=true){
 const payload=Buffer.from(JSON.stringify({iat:Date.now()-1000,nonce:randomUUID()})).toString('base64');
 const h={'Content-Type':'application/json','X-E2E-Run':'run-1'};
 if(authorized)h['X-E2E-Token']=payload+'.'+createHmac('sha256',env.E2E_BYPASS_SECRET).update(payload).digest('hex');
 return h;
}
const invoke=(body,authorized=true)=>handleE2EApi(new Request(endpoint,{method:'POST',headers:headers(authorized),body:JSON.stringify(body)}),env,endpoint);
test('test mail trigger is signed, accepts only e2e+ recipients and bounds the time window',async t=>{
 const oldCrypto=globalThis.crypto;Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});t.after(()=>Object.defineProperty(globalThis,'crypto',{value:oldCrypto,configurable:true}));
 const after=new Date(Date.now()-2000).toISOString();
 assert.equal((await invoke({recipient:RECIPIENT,after},false)).status,401);
 for(const body of [{},{recipient:'real@example.com',after},{recipient:'test14@familiada.online',after},{recipient:RECIPIENT,after:'bad'},{recipient:RECIPIENT,after:new Date(Date.now()-901000).toISOString()}]) assert.equal((await invoke(body)).status,400);
});
test('test mail trigger requires the lease and invokes the normal selected worker without writing state',async t=>{
 const after=new Date(Date.now()-2000).toISOString();
 const previous=globalThis.fetch,calls=[];let owns=true;t.after(()=>globalThis.fetch=previous);
 globalThis.fetch=async(input,options)=>{if(String(input).includes('/rpc/e2e_lease_owns'))return Response.json(owns);calls.push({input,options});return Response.json(calls.length===1?[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]:{ok:true});};
 assert.equal((await invoke({recipient:RECIPIENT,after,ids:['foreign'],bypassDelay:true})).status,200);
 assert.equal(calls.length,2);const query=new URL(calls[0].input).searchParams;
 assert.equal(query.get('to_email'),'eq.'+RECIPIENT);assert.equal(query.get('status'),'eq.pending');assert.equal(query.get('created_at'),'gte.'+after);assert.ok(query.get('not_before').startsWith('lte.'));assert.equal(query.get('limit'),'25');assert.equal(calls[0].options.method,'GET');
 assert.ok(String(calls[1].input).endsWith('/rest/v1/rpc/invoke_mail_worker_ids'));
 assert.deepEqual(JSON.parse(calls[1].options.body),{p_ids:['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],p_limit:1});
 owns=false;calls.length=0;assert.equal((await invoke({recipient:RECIPIENT,after})).status,403);assert.equal(calls.length,0);
});
