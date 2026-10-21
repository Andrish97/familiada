import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pl from '../../web/shared/translation/pl.js';
import plManual from '../../web/manual/content/pl.js';
const entryScripts={control:'app.js','control/display':'main.js','control/host':'main.js','control/buzzer':'main.js','games/settings':'game-settings.js'};
for(const route of Object.keys(entryScripts)) {
 test(`${route} serves the current application at its canonical route`,()=>{
  const html=readFileSync(new URL(`../../web/${route}/index.html`,import.meta.url),'utf8');
  assert.match(html,new RegExp(`/${route}/js/${entryScripts[route]}`));
  assert.doesNotMatch(html,/location\.replace\(['"]\/(?:control|display|host|buzzer|game-settings)2\//);
 });
}
test('approved manual uses application icons and current Repeat behaviour',()=>{
 assert.match(plManual.control,/Ponowne kliknięcie nie usuwa oznaczenia/);
 assert.doesNotMatch(plManual.control,/zaznacza lub zdejmuje Powtórzenie|manual-assets\//);
 assert.match(plManual.settings,/data-icon="play"/);
 assert.match(plManual.settings,/2 minuty/);
});

// Podręcznik E13.4: każdy język ma te same karty, rozdziały (id), odnośniki,
// przyciski, ramki prowadzącego i tabele co polski.
test('all manual languages contain the same chapters, anchors, buttons and Host blocks',async()=>{
 const {default:en}=await import('../../web/manual/content/en.js');
 const {default:uk}=await import('../../web/manual/content/uk.js');
 const all=(html,pattern)=>[...html.matchAll(pattern)].map((m)=>m[1]);
 const shape=(html)=>({
  ids:all(html,/\sid="([^"]+)"/g),
  refs:all(html,/href="#([^"]+)"/g),
  icons:all(html,/data-icon="([^"]+)"/g),
  buttons:all(html,/class="(m-btn)"/g).length,
  host:all(html,/class="(m-host)"/g).length,
  tables:all(html,/class="(m-table)"/g).length,
 });
 const tabs=Object.keys(plManual);
 assert.equal(tabs.length,11);
 const ids=new Set();
 for(const tab of tabs){
  const base=shape(plManual[tab]);
  for(const id of base.ids){ assert.ok(!ids.has(id),`powtórzone id ${id}`); ids.add(id); }
  for(const translation of [en,uk]){
   assert.deepEqual(Object.keys(translation),tabs);
   assert.deepEqual(shape(translation[tab]),base,`${tab}: inna struktura niż PL`);
  }
 }
 for(const tab of tabs) for(const ref of shape(plManual[tab]).refs) assert.ok(ids.has(ref),`brak celu #${ref} (${tab})`);
 for(const translation of [plManual,en,uk]) assert.doesNotMatch(Object.values(translation).join(''),/manual-assets\/|m-control/);
});
