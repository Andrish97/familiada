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
