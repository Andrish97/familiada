import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminApi } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-api.js';
import { ACCESS_ENV, signAccessJwt, withJwks } from './helpers/accessJwt.js';
const env={...ACCESS_ENV,SUPABASE_URL:'https://api.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',GENERATE_GAME_SECRET:'fixture-internal'};
const id='11111111-1111-4111-8111-111111111111';
const request=async(path,body)=>new Request('https://admin.familiada.online/_admin_api/marketplace/'+path,{method:'POST',headers:{Origin:'https://admin.familiada.online','Cf-Access-Jwt-Assertion':await signAccessJwt(),'Content-Type':'application/json'},body:JSON.stringify(body)});
async function check(report,body,expected,sqlExpected){
 const previous=globalThis.fetch;let sql=0;
 globalThis.fetch=withJwks(async(url,options)=>{
  if(String(url).endsWith('/functions/v1/generate-game')){assert.equal(new Headers(options.headers).get('X-Internal-Secret'),'fixture-internal');return Response.json({...(!report.legacy?{review_key:'fixture:corpus'}:{}),...report});}
  sql++;return Response.json([{ok:true,err:''}]);
 });
 try{const response=await handleAdminApi(await request('review',{id,action:'approve',...body}),env);assert.equal(response.status,expected);assert.equal(sql,sqlExpected);return await response.json();}
 finally{globalThis.fetch=previous;}
}
test('moderator: kopia blokuje akceptację przed zapisem',async()=>{const data=await check({ok:true,matches:[{exact_content:true}],semantic:{complete:true}},{},409,0);assert.equal(data.error,'duplicate_content');});
test('moderator: niepełny lub podobny wynik wymaga potwierdzenia właściwej wersji',async()=>{
 const report={ok:true,review_key:'source:corpus',matches:[],semantic:{complete:false}};
 await check(report,{},409,0);await check(report,{uniqueness_review_key:'outdated'},409,0);await check(report,{uniqueness_review_key:'source:corpus'},200,1);
});
test('moderator: pełny wynik bez zbieżności pozwala zaakceptować',async()=>{await check({ok:true,matches:[],semantic:{complete:true}},{},200,1);});
test('moderator: błąd sprawdzania nie pozwala zaakceptować',async()=>{await check({ok:false,error:'unavailable'},{},503,0);});

test('moderator: stary format odpowiedzi w trakcie wdrożenia nie pozwala zaakceptować',async()=>{await check({legacy:true,ok:true,matches:[],mode:'trgm'},{},503,0);});
