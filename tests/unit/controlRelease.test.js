import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import pl from '../../web/shared/translation/pl.js';
for(const route of ['control','display','host','buzzer','game-settings']) {
 test(`${route} redirect preserves all connection parameters`,()=>{
  const html=readFileSync(new URL(`../../web/${route}/index.html`,import.meta.url),'utf8');
  let destination;
  vm.runInNewContext(html.match(/<script>(.*?)<\/script>/s)[1],{location:{search:'?id=g&key=k&lang=uk',hash:'#step',replace:url=>{destination=url;}}});
  assert.equal(destination,`/${route}2/?id=g&key=k&lang=uk#step`);
 });
}
test('approved manual uses application icons and current Repeat behaviour',()=>{
 assert.match(pl.manual.content.control,/Ponowne kliknięcie nie usuwa oznaczenia/);
 assert.doesNotMatch(pl.manual.content.control,/zaznacza lub zdejmuje Powtórzenie|manual-assets\//);
 assert.match(pl.manual.content.gameSettings,/data-icon="play"/);
 assert.match(pl.manual.content.gameSettings,/2 minuty/);
});

test('all manual languages contain the same sections, Host blocks and application icons',async()=>{
 const {default:en}=await import('../../web/shared/translation/en.js');
 const {default:uk}=await import('../../web/shared/translation/uk.js');
 const count=(html,pattern)=>(html.match(pattern)||[]).length;
 for(const translation of [pl,en,uk]){
  const {control,gameSettings}=translation.manual.content;
  assert.equal(count(control+gameSettings,/<h[34] /g),49);
  assert.equal(count(control+gameSettings,/<table class="m-table">/g),3);
  assert.equal(count(control,/class="m-host"/g),12);
  assert.equal(count(control,/class="m-note"/g),9);
  assert.equal(count(control+gameSettings,/data-icon="/g),8);
  assert.doesNotMatch(control+gameSettings,/manual-assets\//);
  assert.match(control+gameSettings,/class="m-code"/);
  assert.doesNotMatch(control+gameSettings,/m-control|<li><p class="m-p">/);
 }
 assert.match(en.manual.content.control,/Every click plays the repeat sound/);
 assert.match(uk.manual.content.control,/Кожне натискання відтворює звук/);
 assert.match(en.manual.content.gameSettings,/2 minutes/);
 assert.match(uk.manual.content.gameSettings,/2 хвилини/);
});
