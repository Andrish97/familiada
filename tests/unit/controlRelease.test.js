import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const entryScripts={control:'app.js','control/display':'main.js','control/host':'main.js','control/buzzer':'main.js','games/settings':'game-settings.js'};
for(const route of Object.keys(entryScripts)) {
 test(`${route} serves the current application at its canonical route`,()=>{
  const html=readFileSync(new URL(`../../web/${route}/index.html`,import.meta.url),'utf8');
  assert.match(html,new RegExp(`/${route}/js/${entryScripts[route]}`));
  assert.doesNotMatch(html,/location\.replace\(['"]\/(?:control|display|host|buzzer|game-settings)2\//);
 });
}
