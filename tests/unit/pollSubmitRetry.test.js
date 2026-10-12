import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../web/shared/js/core/poll-submit-retry.js',import.meta.url),'utf8');
const body=source.replace(/^import .*;\s*$/gm,'').replace('export function','function')+';return showPollSubmitRetry;';
async function setup(lang='pl') {
 const {default:dict}=await import(`../../web/shared/translation/${lang}.js`);
 const messages=[],events=new Map();let now=0,tick,removed=false;
 const t=(key,args={})=>Object.entries(args).reduce((value,[key,arg])=>value.replaceAll('{'+key+'}',String(arg)),dict.pollAnonymous[key.split('.').at(-1)]);
 const window={addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)};
 const document={createElement:()=>({addEventListener:(key,fn)=>events.set('button:'+key,fn)})};
 const show=new Function('t','window','document','setInterval','clearInterval','Date',body)(t,window,document,fn=>{tick=fn;return 1;},()=>{removed=true;},{now:()=>now});
 return {show,messages,events,advance:ms=>{now+=ms;tick();},get removed(){return removed;}};
}
test('retry shows exactly one clock on the button, preserves static saved message and cleans its timer',async()=>{
 assert.doesNotMatch(source,/toast/);
 for(const lang of ['pl','en','uk']){
  const state=await setup(lang),button={};
  const stop=state.show({button,seconds:30,setMessage:value=>state.messages.push(value)});
  assert.equal(button.disabled,true);assert.match(button.textContent,/30/);assert.doesNotMatch(state.messages.at(-1),/\d/);
  const saved=state.messages.at(-1);state.advance(1250);assert.match(button.textContent,/29/);assert.equal(state.messages.at(-1),saved);
  state.advance(30000);assert.equal(button.disabled,false);assert.doesNotMatch(button.textContent,/\d/);
  stop();assert.equal(state.removed,true);assert.equal(state.events.size,0);
 }
});
test('points retry creates one button and network failure offers manual retry without a clock',async()=>{
 const state=await setup();let rendered,clicked=false;
 const stop=state.show({container:{replaceChildren:button=>{rendered=button;}},seconds:0,setMessage:value=>state.messages.push(value),onRetry:()=>{clicked=true;}});
 assert.equal(rendered.disabled,false);assert.equal(rendered.textContent,'Spróbuj ponownie');
 assert.equal(state.messages.at(-1),'Nie udało się wysłać odpowiedzi. Spróbuj ponownie.');
 state.events.get('button:click')();assert.equal(clicked,true);stop();
});
