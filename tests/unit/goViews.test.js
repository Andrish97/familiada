import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as contract from '../../web/shared/js/core/go-contract.js';
import {anonymousPollDestination,validAnonymousPollParams} from '../../web/shared/js/core/poll-links.js';
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function node(){return {textContent:'',style:{},children:[],removeAttribute(){},addEventListener(){},append(...nodes){this.children.push(...nodes)},appendChild(child){this.children.push(child)},set innerHTML(value){this.children=[]},get innerHTML(){return ''}};}
async function setup(lang,query=`b=${id}`){
 const {default:dict}=await import(`../../web/shared/translation/${lang}.js`);
 const nodes=Object.fromEntries(['title','message','actions','hint','emailRow','emailInput'].map(key=>[key,node()]));
 const t=(path,args={})=>{let value=path.split('.').reduce((entry,key)=>entry?.[key],dict);assert.equal(typeof value,'string',path);for(const [key,item] of Object.entries(args))value=value.replaceAll('{'+key+'}',item);return value;};
 const context=vm.createContext({...contract,anonymousPollDestination,validAnonymousPollParams,URL,URLSearchParams,setTimeout,clearTimeout,console,t,
  initI18n:async()=>{},document:{getElementById:key=>nodes[key],createElement:()=>node(),documentElement:{classList:{remove(){}}},querySelector:()=>null},
  location:{search:'?'+query,origin:'https://www.familiada.online',href:'https://www.familiada.online/go/'},linkTo:key=>'/'+key+'/',sharingActionIcon:()=>'',icon:()=>'',getUser:async()=>null});
 const source=(await readFile(new URL('../../web/go/js/go.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/\ninit\(\);\s*$/,'\nglobalThis.views={handleSubInvite,handleTaskInvite,handleBaseInvite,handleFriendInvite,showResolveError,showNetworkFailure};');
 vm.runInContext(source,context);return {views:context.views,nodes,dict};
}
for(const lang of ['pl','en','uk'])test(`actual Go views: states and actors ${lang}`,async()=>{
 const {views,nodes,dict}=await setup(lang);
 const user={id,email:'new@example.invalid'};
 for(const status of ['pending','opened','done','declined','cancelled','expired'])for(const actor of [null,user,{id:'other',email:'old@example.invalid'}]){
  views.handleBaseInvite({status,recipient_matches_me:actor?.id===id,recipient_email:null,owner_label:'Ala'},actor);
  const buttons=nodes.actions.children.length;
  assert.equal(buttons,['cancelled','expired'].includes(status)?0:actor===null?1:actor.id==='other'?0:['pending','opened','done','declined'].includes(status)?1:0);
  if(actor?.id==='other'&&!['cancelled','expired'].includes(status))assert.equal(nodes.message.textContent,dict.pollGo.accountMismatch);
  if(actor===user&&!['pending','opened'].includes(status))assert.equal(nodes.title.textContent,dict.pollGo[contract.baseStateKey(status)]);
 }
 for(const status of ['pending','active','declined'])for(const actor of [null,user,{id:'other',email:'old@example.invalid'}]){
  await views.handleSubInvite({status,registered_user_id:id,subscriber_user_id:null,subscriber_email:'old@example.invalid',friend_conversion_required:true,owner_label:'Ala'},actor);
  assert.equal(nodes.actions.children.length,status==='declined'||actor?.id==='other'?0:1);
  if(actor?.id==='other')assert.equal(nodes.message.textContent,dict.pollGo.accountMismatch);
  if(actor===user&&status!=='declined')assert.equal(nodes.message.textContent,dict.contacts.goAccountBody);
 }
 for(const status of ['pending','active','declined','cancelled','expired']){
  await views.handleSubInvite({status,subscriber_email:'guest@example.invalid',owner_label:'Ala'},null);
  assert.equal(nodes.actions.children.length,status==='pending'?2:0);
 }
 await views.handleSubInvite({status:'pending',cancelled_at:'2026-10-12',subscriber_email:'guest@example.invalid'},null);
 assert.equal(nodes.actions.children.length,0);assert.equal(nodes.title.textContent,dict.pollGo.inviteExpired);
 for(const status of ['pending','opened','done','declined','expired'])for(const account of [true,false])for(const actor of [null,user,{id:'other',email:'old@example.invalid'}]){
  await views.handleTaskInvite({status,recipient_user_id:account?id:null,recipient_email:'old@example.invalid',poll_type:'poll_text',owner_label:'Ala',game_name:'Wakacje'},actor);
  assert.equal(nodes.actions.children.length,account&&actor?.id==='other'?0:!['pending','opened'].includes(status)?0:account?1:2);
 }
 for(const status of ['pending','active','declined'])for(const actor of [null,user,{id:'other'}]){
  views.handleFriendInvite({status,recipient_matches_me:actor?.id===id,owner_label:'Ala'},actor);
  assert.equal(nodes.actions.children.length,actor?.id==='other'?0:1);
  if(actor?.id==='other')assert.equal(nodes.message.textContent,dict.pollGo.accountMismatch);
  if(actor===user&&status==='active'){assert.equal(nodes.title.textContent,dict.pollGo.friendActive);assert.equal(nodes.message.textContent,'');}
 }
 for(const error of ['poll_stopped','poll_closed','expired','invalid_token','revoked','unknown']){
  views.showResolveError({error});assert.equal(nodes.actions.children.length,0);assert.equal(nodes.title.textContent,dict.pollGo[contract.goErrorKey(error)]);
 }
 views.showNetworkFailure();assert.equal(nodes.actions.children.length,1);assert.equal(nodes.message.textContent,dict.pollGo.linkCheckFailed);assert.equal(nodes.emailRow.style.display,'none');
});
