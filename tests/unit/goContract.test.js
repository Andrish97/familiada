import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoLink,goKindMatches,goErrorKey,baseStateKey,matchesGoRecipient} from '../../web/shared/js/core/go-contract.js';
const token='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const valid={p:`p=anon&id=${token}&key=public`,d:`d=host&id=${token}&key=${token}`,t:`t=${token}`,s:`s=${token}`,f:`f=${token}`,b:`b=${token}`,u:`u=${token}`,m:`m=${'a'.repeat(64)}`,c:`c=${token}`};
test('every Go family validates before dispatch, including mixed mail-center links',()=>{
 assert.equal(parseGoLink(new URLSearchParams()).kind,'missing');
 for(const [kind,query] of Object.entries(valid)){
  assert.equal(parseGoLink(new URLSearchParams(query)).kind,kind);
  for(const lang of ['pl','en','uk'])assert.equal(parseGoLink(new URLSearchParams(query+'&lang='+lang)).kind,kind);
  for(const other of Object.keys(valid).filter(key=>key!==kind))assert.equal(parseGoLink(new URLSearchParams(query+'&'+valid[other])).kind,'invalid');
  for(const key of new URLSearchParams(query).keys())assert.equal(parseGoLink(new URLSearchParams(query+'&'+key+'=other')).kind,'invalid');
  for(const suffix of ['&lang=xx','&lang=pl&lang=en','&extra=1','&id=bad'])assert.equal(parseGoLink(new URLSearchParams(query+suffix)).kind,'invalid');
 }
 for(const query of ['f=bad','s=','m=short',`d=other&id=${token}&key=${token}`,`d=host&id=${token}&key=not-uuid`,`p=other&id=${token}&key=public`,`s=${token}&action=other`])assert.equal(parseGoLink(new URLSearchParams(query)).kind,'invalid',query);
 assert.equal(parseGoLink(new URLSearchParams(`s=${token}&action=unsub`)).kind,'s');
 assert.equal(parseGoLink(new URLSearchParams(`d=qr&id=${token}&key=public`)).kind,'d');
});
test('resolver kinds cannot be exchanged; historical subscription to friend is explicit',()=>{
 const accepted={t:['task'],s:['sub','friend'],f:['friend'],b:['base'],u:['unsub'],c:['copy']};
 for(const marker of Object.keys(valid))for(const kind of ['task','sub','friend','base','unsub','copy','unknown'])assert.equal(goKindMatches(marker,kind),Boolean(accepted[marker]?.includes(kind)),marker+'/'+kind);
});
test('canonical account has priority over a new owner of the old address',()=>{
 const original={id:token,email:'new@example.invalid'},other={id:'other',email:'old@example.invalid'};
 assert.equal(matchesGoRecipient(original,token,'old@example.invalid'),true);
 assert.equal(matchesGoRecipient(other,token,'old@example.invalid'),false);
 assert.equal(matchesGoRecipient(null,token,'old@example.invalid'),false);
 assert.equal(matchesGoRecipient(other,null,' OLD@example.invalid '),true);
 assert.equal(matchesGoRecipient({id:'other'},null,null),false);
});
test('all terminal and unavailable message keys exist in PL EN UK; base acceptance is on Bases',async()=>{
 for(const lang of ['pl','en','uk']){
  const {default:dict}=await import(`../../web/shared/translation/${lang}.js`);
  for(const code of ['poll_stopped','poll_closed','expired','invalid_token','revoked','unknown'])assert.equal(typeof dict.pollGo[goErrorKey(code)],'string');
  for(const status of ['done','declined','cancelled','expired','unknown'])assert.equal(typeof dict.pollGo[baseStateKey(status)],'string');
  assert.ok(dict.pollGo.accountMismatch);
  assert.doesNotMatch(dict.pollGo.baseInviteLogin,/Zadaniach|Tasks|Завданнях/);
 }
});
