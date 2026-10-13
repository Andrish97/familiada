import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code=(await readFile(new URL('../../web/shared/js/core/resource-duplicate.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
function harness(responses){
 const calls=[],messages=[],finished=[];let sequence=0,click;
 const button={disabled:false,dataset:{},setAttribute(){},removeAttribute(){},addEventListener(name,handler){click=handler;}};
 const context=vm.createContext({sb:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'owner'},access_token:'ordinary-token'}}})}}),getUiLang:()=> 'pl',t:key=>key,toast:message=>messages.push(message),crypto:{randomUUID:()=>`intent-${++sequence}`},fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});const response=responses.shift();if(response instanceof Error)throw response;return response;}});
 vm.runInContext(code,context);context.bindResourceDuplicate({button,kind:'base',getSource:()=>({id:'source'}),onDone:async id=>finished.push(id),onState:()=>button.disabled=false});
 return {click:()=>click(),button,calls,messages,finished};
}
test('common UI makes one owned copy, restores action state and uses a new intent for the next conscious duplicate',async()=>{
 const h=harness([{ok:true,json:async()=>({ok:true,id:'copy1'})},{ok:true,json:async()=>({ok:true,id:'copy2'})}]);
 await h.click();await h.click();assert.deepEqual(h.finished,['copy1','copy2']);assert.notEqual(h.calls[0].body.request_id,h.calls[1].body.request_id);assert.equal(h.calls[0].body.kind,'base');assert.equal(h.calls[0].body.source_id,'source');assert.equal(h.calls[0].body.recipient_id,undefined);assert.equal(h.button.dataset.duplicateBusy,undefined);assert.equal(h.messages.length,0);
});
test('lost response retains the same intent and repeated clicks during the request cannot start another operation',async()=>{
 const h=harness([new Error('response lost'),{ok:true,json:async()=>({ok:true,id:'copy'})}]);
 const first=h.click();await h.click();await first;assert.equal(h.calls.length,1);
 await h.click();assert.equal(h.calls[0].body.request_id,h.calls[1].body.request_id);assert.deepEqual(h.finished,['copy']);assert.equal(h.messages[0],'resourceDuplicate.failed');
});
test('a terminal source error allows a fresh snapshot on the next attempt and has one shared user message',async()=>{
 const h=harness([{ok:false,json:async()=>({ok:false,error:'copy_image_source_changed'})},{ok:true,json:async()=>({ok:true,id:'copy'})}]);
 await h.click();await h.click();assert.notEqual(h.calls[0].body.request_id,h.calls[1].body.request_id);assert.deepEqual(h.messages,['resourceDuplicate.image']);
});
