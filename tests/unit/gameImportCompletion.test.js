import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function setup(){
 const source=await readFile(new URL('../../web/games/js/games.js',import.meta.url),'utf8');
 const start=source.indexOf('  btnImportJson?.addEventListener("click", async () => {');
 const end=source.indexOf('\n  });',start)+7;assert.ok(start>0&&end>start);
 let callback;let imports=0;let closes=0;let fail=false;const progress=[];const visible=[];
 const btn={disabled:false,textContent:'',attrs:{},setAttribute(key,value){this.attrs[key]=value;},addEventListener(_event,handler){callback=handler;}};
 const context=vm.createContext({importCompleted:false,importParsed:{game:{name:'Wakacje'},questions:[{text:'Co?'}]},btnImportJson:btn,
  currentUser:{id:'owner'},btnCancelImport:{disabled:false},importFile:{disabled:false},importProg:{},importProgStep:{},importProgCount:{},importProgBar:{},importProgMsg:{},
  importPreview:{style:{},innerHTML:''},importErr:{style:{},textContent:''},
  t:key=>key,MSG:Object.fromEntries(['importStart','importSave','importDone','importErrorLabel','importFailed','importDbFailed'].map(key=>[key,()=>key])),
  importGame:async()=>{imports++;if(fail)throw new Error('network lost');return 'new-game';},
  loadGameBasic:async()=>({type:'prepared'}),uiTypeFromRow:row=>row.type,setActiveTab(){},refresh:async()=>{},
  setImportMsg(){},showProgBlock:(_node,value)=>visible.push(value),setProgUi:(_a,_b,_c,_d,event)=>progress.push(event),closeImportModal:()=>closes++,console:{error(){}}});
 vm.runInContext(source.slice(start,end),context);
 const resetStart=source.indexOf('function importResetPreview() {');const resetEnd=source.indexOf('\nfunction openImportModal()',resetStart);
 vm.runInContext(source.slice(resetStart,resetEnd)+'\nglobalThis.resetImport=importResetPreview;',context);
 return {context,btn,click:()=>callback(),setFailure:value=>fail=value,imports:()=>imports,closes:()=>closes,progress,visible};
}
test('actual import action leaves completed progress and Done; Done closes without another write',async()=>{
 const ui=await setup();await ui.click();
 assert.equal(ui.context.importCompleted,true);assert.equal(ui.closes(),0);assert.equal(ui.imports(),1);
 assert.equal(ui.btn.disabled,false);assert.equal(ui.btn.attrs['data-i18n'],'games.import.done');
 assert.equal(ui.visible.at(-1),true);assert.equal(ui.progress.at(-1).done,true);
 assert.equal(ui.progress.at(-1).msg,'');
 await ui.click();assert.equal(ui.closes(),1);assert.equal(ui.imports(),1);
 ui.context.resetImport();assert.equal(ui.context.importCompleted,false);assert.equal(ui.context.importParsed,null);
 assert.equal(ui.btn.attrs['data-i18n'],'games.import.confirm');assert.equal(ui.btn.disabled,true);assert.equal(ui.visible.at(-1),false);
});
test('failed import keeps the selected file retryable and never shows a completion state',async()=>{
 const ui=await setup();const packet=ui.context.importParsed;ui.setFailure(true);await ui.click();
 assert.equal(ui.context.importCompleted,false);assert.equal(ui.context.importParsed,packet);assert.equal(ui.btn.disabled,false);
 assert.equal(ui.closes(),0);assert.equal(ui.visible.at(-1),false);
 ui.setFailure(false);await ui.click();assert.equal(ui.context.importCompleted,true);assert.equal(ui.imports(),2);
});
