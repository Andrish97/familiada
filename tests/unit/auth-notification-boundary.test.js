import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source=fs.readFileSync(new URL('../../supabase/functions/send-email/index.ts',import.meta.url),'utf8');
test('Auth direct delivery never consults notification flags, global unsubscribe or center footer',async()=>{
 let sends=0;
 const provider={id:'provider',name:'brevo',is_active:true,rem_worker:2,rem_immediate:2};
 const service={
  from(table){
   assert.ok(['email_providers','mail_function_logs'].includes(table),`Auth must not query notification state: ${table}`);
   const chain={select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:[provider]}),single:async()=>({data:{id:provider.id}}),insert:async()=>({error:null}),then(resolve){return Promise.resolve({data:[provider]}).then(resolve);}};
   return chain;
  },
  rpc:async name=>{assert.equal(name,'decrement_provider_immediate');return {error:null};},
 };
 const context=vm.createContext({Deno:{env:{get:()=> 'fixture'}},createClient:()=>service,Webhook:class{},serve:()=>{},
  fetch:async(url,options)=>{assert.equal(url,'https://api.brevo.com/v3/smtp/email');sends++;const payload=JSON.parse(options.body);assert.equal(payload.to[0].email,'receiver@example.invalid');assert.ok(!payload.htmlContent.includes('/go/?m='));return new Response('{}',{status:200});},
  console:{log(){},warn(){},error(){}},Response,Request,URL,TextEncoder,FormData,Blob,Uint8Array,atob,btoa});
 vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')),context);
 await context.sendEmail('receiver@example.invalid','Recovery','<html lang="pl"><body>Auth action</body></html>');
 assert.equal(sends,1);
 assert.doesNotMatch(source,/mail-center-footer|mail_center_issue|email_notifications|suppressed_at/);
});
