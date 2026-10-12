import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('shared poll fixture completes both forms with its own assertion import',async()=>{
 const source=await readFile(new URL('../e2e/helpers/poll-game.js',import.meta.url),'utf8');
 for(const type of ['poll_text','poll_points']){
  const questions=[],fills=[],clicks=[],module={exports:{}};
  const fakeExpect=locator=>({toContainText:async text=>{assert.equal(locator.selector,'.qtext');questions.push(text);}});
  vm.runInNewContext(source,{module,require:name=>{assert.equal(name,'@playwright/test');return {expect:fakeExpect};}});
  const page={locator:selector=>({selector,fill:async value=>fills.push(value),click:async()=>clicks.push(selector)})};
  await module.exports.complete(page,type);
  assert.equal(questions.length,10);assert.equal(questions[0],'? 1');assert.equal(questions.at(-1),'? 10');
  assert.equal(clicks.length,10);assert.equal(fills.length,type==='poll_text'?10:0);
 }
});
