import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnonymousSubmitter } from '../../web/shared/js/core/poll-anonymous.js';
const ids=()=>{let i=0;return ()=>`aaaaaaaa-aaaa-aaaa-aaaa-${String(++i).padStart(12,'0')}`;};
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),data};};
test('anonymous identity is stable per browser/game/run and vote identity is separate per form',async()=>{
 const store=storage(),idFactory=ids(),calls=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true}};}};
 const create=(gameId,key)=>createAnonymousSubmitter({gameId,key,client,storage:store,idFactory});
 const form=create('game-a','key-a');await form([{question_id:'one'}]);await form([{question_id:'one'}]);
 await create('game-a','key-a')([]);await create('game-a','key-b')([]);await create('game-b','key-a')([]);
 assert.equal(calls[0].name,'poll_anonymous_submit');assert.equal(calls[0].args.p_browser_token,calls[2].args.p_browser_token);
 assert.equal(calls[0].args.p_voter_token,calls[1].args.p_voter_token);assert.notEqual(calls[0].args.p_voter_token,calls[2].args.p_voter_token);
 assert.notEqual(calls[0].args.p_browser_token,calls[3].args.p_browser_token);assert.notEqual(calls[0].args.p_browser_token,calls[4].args.p_browser_token);
 assert.equal(store.data.size,3);assert.equal(calls[0].args.p_items.length,1);assert.equal(calls[0].args.ip,undefined);
});
test('anonymous submission keeps a complete large payload and reports backend cooldown without new vote identity',async()=>{
 const calls=[],idFactory=ids(),store=storage();let attempt=0;
 const client={rpc:async(name,args)=>{calls.push(args);return {data:++attempt===1?{ok:false,error:'cooldown',retry_after:21}:{ok:true,already_submitted:true}};}};
 const submit=createAnonymousSubmitter({gameId:'large-game',key:'run',client,storage:store,idFactory});
 const payload=Array.from({length:80},(_,i)=>({question_id:String(i)}));
 await assert.rejects(submit(payload),error=>error.code==='cooldown'&&error.retryAfter===21);
 assert.equal((await submit(payload)).already_submitted,true);assert.equal(calls[0].p_items.length,80);assert.equal(calls[0].p_voter_token,calls[1].p_voter_token);
});
test('anonymous client recovers malformed storage and tolerates denied storage without a cross-game identity',async()=>{
 const idFactory=ids(),seen=[],client={rpc:async(name,args)=>{seen.push(args);return {data:{ok:true}};}};
 const broken={getItem:()=>{throw new Error('storage denied');}};
 for(const gameId of ['denied-a','denied-a','denied-b'])await createAnonymousSubmitter({gameId,key:'run',client,storage:broken,idFactory})([]);
 assert.equal(seen[0].p_browser_token,seen[1].p_browser_token);assert.notEqual(seen[0].p_browser_token,seen[2].p_browser_token);
 const store=storage();store.setItem('fam_anon_browser_invalid_run','invalid');
 await createAnonymousSubmitter({gameId:'invalid',key:'run',client,storage:store,idFactory})([]);
 assert.match(seen.at(-1).p_browser_token,/^[a-f0-9-]{36}$/);
});

test('anonymous retry translations exist at the root in all supported languages', async()=>{
 for(const lang of ['pl','en','uk']) {
  const {default: dictionary}=await import(`../../web/shared/translation/${lang}.js`);
  for(const key of ['retry','retryIn','wait','failed','ready'])assert.equal(typeof dictionary.pollAnonymous?.[key],'string',`${lang}.${key}`);
 }
});
