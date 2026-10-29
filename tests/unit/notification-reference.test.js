import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationReference } from '../../supabase/functions/_shared/notification-reference.js';
const token='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const anchor=url=>`<a href="${url}">Action</a>`;
test('all source families read one canonical current Go action, with existing route forms',()=>{
 for(const [action,kind,key] of [['friend:invite','friend','f'],['friend:resend','friend','f'],['poll:invite','subscription','s'],['poll:resend','subscription','s'],['poll:share','poll','t'],['base:share','base','b'],['copy:send','copy','c']]){
  for(const path of ['/go/','/go','/go/index.html'])assert.deepEqual(notificationReference(anchor(`https://www.familijna.app${path}?${key}=${token}&amp;lang=uk`),action),{kind,token});
 }
 assert.deepEqual(notificationReference(anchor(`https://www.familijna.app/go/?d=display&amp;id=${other}&amp;key=${token}`),'device:share'),{kind:'device',token,device_type:'display',game_id:other});
});
test('source hints and other footer families do not invent a different action',()=>{
 const href=`https://www.familijna.app/go/?t=${token}`;
 const document=anchor(href)+`<div>${href}</div>`+anchor(`https://www.familijna.app/go/?s=${other}&amp;action=unsub`);
 assert.deepEqual(notificationReference(document,'poll:share'),{kind:'poll',token});
 assert.deepEqual(notificationReference(anchor(href)+anchor(href),'poll:share'),{kind:'poll',token});
});
test('unrelated origins, malformed, duplicate or ambiguous references and privileged action keys are rejected',()=>{
 for(const url of [`https://foreign.example/go/?f=${token}`,`https://www.familijna.app.foreign.example/go/?f=${token}`,`http://www.familijna.app/go/?f=${token}`,`https://www.familijna.app:123/go/?f=${token}`,`https://user@www.familijna.app/go/?f=${token}`,`https://www.familijna.app/go/?f=not-a-token`,`https://www.familijna.app/go/?f=${token}&f=${other}`])assert.throws(()=>notificationReference(anchor(url),'friend:invite'));
 assert.throws(()=>notificationReference(anchor(`https://www.familijna.app/go/?f=${token}`)+anchor(`https://www.familijna.app/go/?f=${other}`),'friend:invite'));
 assert.throws(()=>notificationReference(`<a data-href="https://www.familijna.app/go/?f=${token}">bad</a>`,'friend:invite'));
 assert.throws(()=>notificationReference(anchor(`https://www.familijna.app/go/?d=host&id=${other}&key=${token}`)+anchor(`https://www.familijna.app/go/?d=display&id=${other}&key=${token}`),'device:share'));
 assert.throws(()=>notificationReference('<p>Body</p>','admin:compose'));
 assert.throws(()=>notificationReference(anchor(`https://www.familijna.app/go/?s=${token}&action=unsub`),'poll:resend'));
 assert.deepEqual(notificationReference(anchor(`https://www.familijna.app/go/?s=${token}`)+anchor(`https://www.familijna.app/go/?s=${token}&action=unsub`),'poll:resend'),{kind:'subscription',token});
});
