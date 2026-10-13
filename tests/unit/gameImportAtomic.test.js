import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function setup(lang='pl') {
 const {default:dict}=await import(`../../web/shared/translation/${lang}.js`);
 const calls=[];let sequence=0;let response={data:{ok:true,id:'imported-id'}};
 const t=(key,args={})=>{let value=key.split('.').reduce((item,part)=>item?.[part],dict);assert.equal(typeof value,'string',key);for(const [name,item] of Object.entries(args))value=value.replaceAll('{'+name+'}',item);return value;};
 const context=vm.createContext({t,crypto:{randomUUID:()=>`request-${++sequence}`},sb:()=>({rpc:async(name,args)=>{calls.push({name,args});return response;}})});
 const source=(await readFile(new URL('../../web/games/js/games-import-export.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 vm.runInContext(source+'\nglobalThis.importer=importGame;',context);
 return {importGame:context.importer,calls,setResponse:value=>response=value,dict};
}
const packet=()=>({game:{name:'Wakacje',type:'prepared'},questions:[{text:'Co zabieramy?',answers:[{text:'Aparat',fixed_points:20}]},{}]});

test('actual importer sends one atomic RPC and acknowledges progress only after its success',async()=>{
 const api=await setup();const input=packet();const progress=[];
 assert.equal(await api.importGame(input,'owner',event=>progress.push(event)),'imported-id');
 assert.equal(api.calls.length,1);assert.equal(api.calls[0].name,'game_import_package');
 assert.equal(api.calls[0].args.p_payload,input);assert.equal(api.calls[0].args.p_owner_id,'owner');
 assert.deepEqual({...api.calls[0].args.p_defaults},{game:'Gra',question:'Pytanie {ord}',answer:'ODP {ord}'});
 assert.deepEqual(progress.map(event=>event.i),[0,1,2]);assert.equal(progress[2].msg,'Pytanie 2');
});
test('lost response, lock and successful retry retain one request; new selection or account has its own request',async()=>{
 const api=await setup();const input=packet();const progress=[];
 api.setResponse({error:new Error('network lost')});
 await assert.rejects(api.importGame(input,'owner',event=>progress.push(event)),/network lost/);
 assert.deepEqual(progress.map(event=>event.i),[0]);
 api.setResponse({data:{ok:false,error:'locked'}});await assert.rejects(api.importGame(input,'owner'));
 api.setResponse({data:{ok:true,id:'same-id',already:true}});
 assert.equal(await api.importGame(input,'owner'),'same-id');
 assert.deepEqual(api.calls.map(call=>call.args.p_request_id),['request-1','request-1','request-1']);
 await api.importGame(packet(),'owner');await api.importGame(input,'other-owner');
 assert.deepEqual(api.calls.slice(3).map(call=>call.args.p_request_id),['request-2','request-3']);
});
test('invalid input never starts database writes',async()=>{
 const api=await setup();for(const input of [null,{}, {game:{},questions:null}])await assert.rejects(api.importGame(input,'owner'));
 assert.equal(api.calls.length,0);
});
for(const lang of ['pl','en','uk'])test(`actual import errors and defaults are complete in ${lang}`,async()=>{
 const api=await setup(lang);
 for(const [code,key] of Object.entries({invalid_payload:'invalidFormat',auth_required:'authRequired',locked:'locked',request_conflict:'requestConflict',previously_removed:'previouslyRemoved',unexpected:'failed'})){
  api.setResponse({data:{ok:false,error:code}});
  await assert.rejects(api.importGame(packet(),'owner'),error=>error.message===api.dict.gamesImportExport.import[key]);
 }
 api.setResponse({data:{ok:true}});await assert.rejects(api.importGame(packet(),'owner'),error=>error.message===api.dict.gamesImportExport.import.failed);
});
