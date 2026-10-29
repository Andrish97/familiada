import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source=fs.readFileSync(new URL('../../supabase/functions/send-email/index.ts',import.meta.url),'utf8');
for (const scenario of ['sent','queue_pool','provider_failure','quota_exhausted','no_provider']) test(`Auth ${scenario} never uses notification flags, unsubscribe, queue or center footer`,async()=>{
 let sends=0;
 const provider={id:'provider',name:'brevo',is_active:true,rem_worker:scenario==='quota_exhausted'?0:2,rem_immediate:['quota_exhausted','queue_pool'].includes(scenario)?0:2};
 const providers=scenario==='no_provider'?[]:[provider];
 const service={
  from(table){
   assert.ok(['email_providers','mail_function_logs'].includes(table),`Auth must not query notification state: ${table}`);
   const chain={select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:providers}),single:async()=>({data:{id:provider.id}}),insert:async()=>({error:null}),then(resolve){return Promise.resolve({data:providers}).then(resolve);}};
   return chain;
  },
  rpc:async name=>{assert.equal(name,'take_provider_immediate');return {data:'immediate',error:null};},
 };
 const context=vm.createContext({Deno:{env:{get:()=> 'fixture'}},createClient:()=>service,Webhook:class{},serve:()=>{},
  createMailTransport:()=>({hasAnyProvider:true,send:async(provider,mail)=>{
   assert.equal(provider,'brevo');const res=await context.fetch('https://api.brevo.com/v3/smtp/email',{body:JSON.stringify({to:[{email:mail.to}],htmlContent:mail.html})});
   if(!res.ok)throw new Error('brevo_failed');
  }}),
  fetch:async(url,options)=>{assert.equal(url,'https://api.brevo.com/v3/smtp/email');sends++;const payload=JSON.parse(options.body);assert.equal(payload.to[0].email,'receiver@example.invalid');assert.ok(!payload.htmlContent.includes('/go/?m='));return new Response('{}',{status:scenario==='provider_failure'?500:200});},
  console:{log(){},warn(){},error(){}},Response,Request,URL,TextEncoder,FormData,Blob,Uint8Array,atob,btoa});
 vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')),context);
 const sending=context.sendEmail('receiver@example.invalid','Recovery','<html lang="pl"><body>Auth action</body></html>');
 if(['sent','queue_pool'].includes(scenario))await sending;else await assert.rejects(sending);
 assert.equal(sends,['sent','queue_pool','provider_failure'].includes(scenario)?1:0);
 assert.doesNotMatch(source,/mail-center-footer|mail_center_issue|email_notifications|suppressed_at|mail_queue|insertToQueue/);
});
