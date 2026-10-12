import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { appendMailCenterFooter, prepareMailDelivery } from '../../supabase/functions/_shared/mail-center-footer.js';
const token='a'.repeat(64), id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const original='<html lang="uk"><body>Original source</body></html>';
const valid={ok:true,allowed:true,verification:false,to_email:'receiver@example.invalid',subject:'Fixture',html:original,footer_token:token};
test('delivery footer uses Go, correct language, and rejects sender-visible old unsubscribe tokens',()=>{
 for(const lang of ['pl','en','uk']){
  const result=appendMailCenterFooter(original,token,lang);
  assert.ok(result.includes(`go/?m=${token}&amp;lang=${lang}`));assert.equal((result.match(/data-familiada-mail-center/g)||[]).length,1);
  assert.ok(result.indexOf('data-familiada-mail-center')<result.indexOf('</body>'));
 }
 assert.throws(()=>appendMailCenterFooter(original,'old-u-token','pl'));
});
test('delivery fetches current private context, adds full footer only to outgoing copy',async()=>{
 const result=await prepareMailDelivery(async(name,args)=>{assert.equal(name,'mail_queue_delivery_context');assert.deepEqual(args,{p_id:id});return {data:valid};},id);
 assert.equal(result.to,valid.to_email);assert.ok(result.html.includes(token));assert.ok(result.text.includes('/go/?m='+token));
 assert.equal(valid.html,original);assert.ok(!original.includes(token));
});
test('requested verification preserves the short one-time proof without adding a full footer',async()=>{
 const html='<html lang="pl"><body><a href="/go/?m='+token+'">Confirmation</a></body></html>';
 const result=await prepareMailDelivery(async()=>({data:{...valid,verification:true,html,footer_token:undefined}}),id);
 assert.equal(result.html,html);assert.ok(!result.html.includes('data-familiada-mail-center'));
});
test('closed source and preference return skipped, malformed or unavailable backend fail closed',async()=>{
 for(const reason of ['skipped_notification_preference','skipped_verification_closed','skipped_contact_closed','skipped_missing'])assert.deepEqual(await prepareMailDelivery(async()=>({data:{ok:true,allowed:false,reason}}),id),{allowed:false,reason});
 for(const response of [{error:{message:'db down'}},{data:null},{data:{ok:true}},{data:{...valid,footer_token:'old-u'}},{data:{...valid,verification:undefined}}])await assert.rejects(prepareMailDelivery(async()=>response,id));
});

function workerContext(prepare, transport) {
 const source=fs.readFileSync(new URL('../../supabase/functions/mail-worker/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 let decrements=0;
 const service={rpc:async name=>{if(name==='decrement_provider_worker')decrements++;return {data:null,error:null};},from:()=>({insert:async()=>({error:null})})};
 const context=vm.createContext({Deno:{env:{get:()=> 'fixture'}},createClient:()=>service,serve:()=>{},prepareMailDelivery:prepare,
  fetch:transport,console:{log(){},warn(){},error(){}},Response,TextEncoder,FormData,Blob,Uint8Array,atob,btoa,crypto:globalThis.crypto});
 vm.runInContext(stripTypeScriptTypes(source),context);
 return {context,get decrements(){return decrements;}};
}
test('actual worker repeats current delivery check before fallback and never sends a newly closed source',async()=>{
 let checks=0,sends=0;
 const app=workerContext(async()=>++checks===1?{allowed:true,to:'receiver@example.invalid',subject:'Fixture',html:original,text:'Fixture'}:{allowed:false,reason:'skipped_source'},async()=>{sends++;return new Response('provider fixture failure',{status:500});});
 const result=await app.context.sendWithFallbacks(id,[{name:'brevo_one',type:'brevo',rem_worker:1},{name:'brevo_two',type:'brevo',rem_worker:1}]);
 assert.equal(result.skipped,'skipped_source');assert.equal(checks,2);assert.equal(sends,1);assert.equal(app.decrements,1);
});
test('actual worker sends nothing and spends no provider limit if private check is unavailable or source closed',async()=>{
 for(const denied of [true,false]){
  const app=workerContext(async()=>{if(denied)throw new Error('backend unavailable');return {allowed:false,reason:'skipped_source'};},()=>assert.fail('unchecked provider send'));
  const call=app.context.sendWithFallbacks(id,[{name:'brevo',type:'brevo',rem_worker:1}]);
  if(denied)await assert.rejects(call,/backend unavailable/);else assert.equal((await call).skipped,'skipped_source');
  assert.equal(app.decrements,0);
 }
});
