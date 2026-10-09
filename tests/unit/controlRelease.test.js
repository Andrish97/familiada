import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pl from '../../web/shared/translation/pl.js';
const entryScripts={control:'app.js','control/display':'main.js','control/host':'main.js','control/buzzer':'main.js','games/settings':'game-settings.js'};
for(const route of Object.keys(entryScripts)) {
 test(`${route} serves the current application at its canonical route`,()=>{
  const html=readFileSync(new URL(`../../web/${route}/index.html`,import.meta.url),'utf8');
  assert.match(html,new RegExp(`/${route}/js/${entryScripts[route]}`));
  assert.doesNotMatch(html,/location\.replace\(['"]\/(?:control|display|host|buzzer|game-settings)2\//);
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
