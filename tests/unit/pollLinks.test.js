import test from 'node:test';
import assert from 'node:assert/strict';
import {anonymousPollLink,anonymousPollDestination,validAnonymousPollParams} from '../../web/shared/js/core/poll-links.js';
const gameId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',key='public&key',base='https://www.familiada.online/polls/';
test('anonymous links always use Go and retain the run scope and supported language without identity',()=>{
 for(const lang of ['pl','en','uk']){
  const url=new URL(anonymousPollLink({gameId,key,lang},base));
  assert.equal(url.pathname,'/go/');assert.equal(url.searchParams.get('p'),'anon');assert.equal(url.searchParams.get('id'),gameId);assert.equal(url.searchParams.get('key'),key);assert.equal(url.searchParams.get('lang'),lang);
  assert.deepEqual([...url.searchParams.keys()],['p','id','key','lang']);assert.ok(validAnonymousPollParams(url.searchParams));
 }
 assert.equal(new URL(anonymousPollLink({gameId,key,lang:'invalid'},base)).searchParams.has('lang'),false);
});
test('Go only opens a currently open poll of an explicit supported kind',()=>{
 for(const type of ['poll_text','poll_points']){
  const url=new URL(anonymousPollDestination({state:'open',type,gameId,key,lang:'uk'},base));
  assert.equal(url.pathname,`/polls/vote/${type==='poll_text'?'text':'points'}/`);assert.equal(url.searchParams.get('key'),key);assert.equal(url.searchParams.get('lang'),'uk');
  for(const state of ['stopped','ended','draft','expired','not_found',null])assert.equal(anonymousPollDestination({state,type,gameId,key},base),null);
 }
 assert.equal(anonymousPollDestination({state:'open',type:'prepared',gameId,key},base),null);
});
test('Go rejects ambiguous types, missing identifiers and mixed recipient links',()=>{
 const valid=new URL(anonymousPollLink({gameId,key},base)).searchParams;
 for(const forbidden of ['d','t','s','f','b','u','m','action']){const params=new URLSearchParams(valid);params.set(forbidden,'other');assert.equal(validAnonymousPollParams(params),false);}
 for(const name of ['p','id','key']){const params=new URLSearchParams(valid);params.delete(name);assert.equal(validAnonymousPollParams(params),false);}
 for(const name of ['p','id','key','lang']){const params=new URLSearchParams(valid);params.append(name,'other');params.append(name,'other');assert.equal(validAnonymousPollParams(params),false);}
 const params=new URLSearchParams(valid);params.set('id','bad');assert.equal(validAnonymousPollParams(params),false);
});
test('owner card and real QR screen share the Go generator; opening the QR screen keeps its id/key',async()=>{
 const {readFile}=await import('node:fs/promises');
 const polls=await readFile(new URL('../../web/polls/js/polls.js',import.meta.url),'utf8');
 const qr=await readFile(new URL('../../web/polls/vote/qr/js/poll-qr.js',import.meta.url),'utf8');
 assert.match(polls,/return anonymousPollLink\(/);assert.match(qr,/url = anonymousPollLink\(/);
 assert.match(polls,/window\.open\(_pollQrOpenUrl,/);assert.doesNotMatch(polls,/searchParams\.set\("url", _pollQrOpenUrl\)/);
 for(const lang of ['pl','en','uk']) {
  const {default:dict}=await import(`../../web/shared/translation/${lang}.js`);
  for(const key of ['anonymousLinkTitle','anonymousLinkChecking','anonymousLinkExpired','anonymousLinkMissing','linkCheckFailed'])assert.equal(typeof dict.pollGo[key],'string',lang+'.'+key);
 }
});
test('Go dynamic states are protected from a later static language initialization',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../../web/go/js/go.js',import.meta.url),'utf8');
 const setView=source.slice(source.indexOf('function setView('),source.indexOf('function clearActions('));
 for(const element of ['title','message','hint'])assert.match(setView,new RegExp(element+'\\.removeAttribute\\("data-i18n"\\)'));
});
