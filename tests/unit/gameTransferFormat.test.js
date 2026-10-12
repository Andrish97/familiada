import test from 'node:test';
import assert from 'node:assert/strict';
import {gameExportSnapshot,gameTransferType} from '../../web/shared/js/core/game-transfer-format.js';
const questions=[{id:'source-q',game_id:'source-game',ord:1,text:'Co zabieramy?',answers:[{id:'source-a',question_id:'source-q',ord:1,text:'Aparat',fixed_points:20},{ord:2,text:'Książkę',fixed_points:'10'}]}];
test('shared snapshot preserves the existing export rules for every game kind and state',()=>{
 for(const type of ['prepared','poll_text','poll_points'])for(const status of ['draft','poll_open','poll_stopped','ready']){
  const out=gameExportSnapshot({name:'Wakacje',type,status},questions,'Gra');
  const target=type!=='prepared'&&status==='ready'?'prepared':type;
  assert.equal(out.game.type,target);assert.equal(out.game.name,'Wakacje');
  assert.deepEqual(out.questions,[{text:'Co zabieramy?',answers:target==='poll_text'?[]:[{text:'Aparat',fixed_points:type==='poll_points'&&status==='draft'?0:20},{text:'Książkę',fixed_points:type==='poll_points'&&status==='draft'?0:10}]}]);
 }
});
test('transfer snapshot strips identities, links, results, runtime, settings and file references',()=>{
 const source={id:'source-game',owner_id:'source-owner',name:'Wakacje',type:'prepared',status:'ready',share_key_poll:'secret',share_key_host:'secret',settings:{logo_id:'source-logo',sound:{url:'source-file'}},recipient_user_id:'foreign',game_state:{secret:'state'},poll_tasks:['source-task']};
 const input=JSON.parse(JSON.stringify({source,questions}));
 const out=gameExportSnapshot(source,questions,'Gra');
 assert.deepEqual(Object.keys(out),['game','questions']);assert.deepEqual(Object.keys(out.game),['name','type']);
 assert.doesNotMatch(JSON.stringify(out),/source-|foreign|secret/);assert.deepEqual({source,questions},input);
 assert.notEqual(out.questions,questions);assert.notEqual(out.questions[0].answers,questions[0].answers);
});
test('empty definitions, null names, invalid types and absent points retain export defaults',()=>{
 assert.equal(gameTransferType('invalid'),'poll_text');
 assert.deepEqual(gameExportSnapshot({type:'invalid',name:null},null,'Gra'),{game:{name:'Gra',type:'poll_text'},questions:[]});
 assert.equal(gameExportSnapshot({type:'prepared',name:''},[],'Gra').game.name,'');
 assert.deepEqual(gameExportSnapshot({type:'prepared'},[{text:'Pytanie',answers:[{text:'Tak',fixed_points:null}]}],'Gra').questions[0].answers,[{text:'Tak',fixed_points:0}]);
});
test('the actual file exporter uses the common snapshot and retains incremental progress',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../../web/games/js/games-import-export.js',import.meta.url),'utf8');
 assert.match(source,/const out = gameExportSnapshot\(game, qs,/);assert.match(source,/i: idx \+ 1, n: qs.length/);
 assert.doesNotMatch(source,/out\.questions\.push/);
});
