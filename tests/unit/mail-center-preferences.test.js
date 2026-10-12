import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../web/shared/js/core/user-flags.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export async function','async function');
function context(result){
 const calls=[];const scope=vm.createContext({sb:()=>({rpc:async(name,args)=>{calls.push({name,args});return result;},from:()=>assert.fail('notification preference must use canonical RPC')})});vm.runInContext(source,scope);return {scope,calls};
}
test('notification UI getter reads effective global flag through current account RPC and rejects unknown state',async()=>{
 for(const enabled of [true,false]){
  const app=context({data:enabled});assert.equal(await app.scope.getUserEmailNotificationsFlag('account'),enabled);
  assert.equal(app.calls[0].name,'get_my_email_notifications');assert.equal(app.calls[0].args.p_user_id,'account');
 }
 for(const result of [{data:null},{data:{}},{error:new Error('backend unavailable')}])await assert.rejects(context(result).scope.getUserEmailNotificationsFlag('account'));
});
test('notification UI setter uses explicit server restoration instead of flag-only writes',async()=>{
 const app=context({data:true});await app.scope.setUserEmailNotificationsFlag('account',true);
 assert.equal(app.calls[0].name,'set_my_email_notifications');assert.equal(app.calls[0].args.p_user_id,'account');assert.equal(app.calls[0].args.p_enabled,true);
 await assert.rejects(context({error:new Error('unconfirmed')}).scope.setUserEmailNotificationsFlag('account',true));
});
