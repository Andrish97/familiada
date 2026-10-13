import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateResourceName, prepareResourceClone} from '../../web/shared/js/core/resource-clone-plan.js';
import {baseExportSnapshot} from '../../web/shared/js/core/base-transfer-format.js';
import {mapLogoSourceImages} from '../../web/shared/js/core/logo-transfer-source.js';

test('duplicate suffix is in the name only, with conflicts and Unicode length handled consistently',()=>{
 assert.equal(duplicateResourceName('Gra',[], 'kopia'),'Gra kopia');
 assert.equal(duplicateResourceName('Gra',['Gra kopia','Gra kopia 2'], 'kopia'),'Gra kopia 3');
 for(const suffix of ['kopia','copy','копія']){
  const result=duplicateResourceName('🙂'.repeat(90),[],suffix);
  assert.equal([...result].length,80);assert.ok(result.endsWith(' '+suffix));
 }
 assert.throws(()=>duplicateResourceName('Gra',[],''),/invalid_copy_name/);
});
test('all game types use the existing transfer definition for both clone actions without runtime or origin',async()=>{
 for(const type of ['prepared','poll_text','poll_points'])for(const status of ['draft','ready']){
  const source={game:{name:'Gra',type,status,id:'source',owner_id:'sender',settings:{},received_from_label:'Someone'},questions:[{id:'q',text:'Pytanie',answers:[{id:'a',text:'Tak',fixed_points:10}]}]};
  const before=structuredClone(source);
  const duplicate=await prepareResourceClone('game',source,{action:'duplicate',suffix:'kopia'});
  const sent=await prepareResourceClone('game',source,{action:'send'});
  const named={...duplicate.definition,game:{...duplicate.definition.game,name:'Gra'}};
  assert.deepEqual(named,sent.definition);assert.deepEqual(source,before);
  assert.equal(duplicate.definition.game.name,'Gra kopia');assert.doesNotMatch(JSON.stringify(duplicate),/owner_id|settings|received_from|"id"/);
 }
});
test('base snapshot preserves folders, tags and both assignments while stripping resource ownership and sharing',async()=>{
 const source={base:{id:'original',name:'Baza',owner_id:'sender'},categories:[{id:'c',parent_id:null,name:'Folder',ord:1,base_id:'original'}],tags:[{id:'t',name:'Tag',color:'gold',ord:1}],questions:[{id:'q',category_id:'c',ord:1,payload:{text:'Question'},updated_by:'sender'}],question_tags:[{question_id:'q',tag_id:'t',private:'ignored'}],category_tags:[{category_id:'c',tag_id:'t'}],shares:['someone']};
 const before=structuredClone(source);
 const output=await prepareResourceClone('base',source,{action:'duplicate',suffix:'kopia'});
 assert.deepEqual(output.definition.category_tags,[{category_id:'c',tag_id:'t'}]);assert.deepEqual(output.definition.question_tags,[{question_id:'q',tag_id:'t'}]);assert.equal(output.definition.base.name,'Baza kopia');
 assert.doesNotMatch(JSON.stringify(output),/owner_id|base_id|updated_by|shares|private/);assert.deepEqual(source,before);
 output.definition.questions[0].payload.text='changed';assert.deepEqual(source,before);
 assert.deepEqual(baseExportSnapshot(source).base,{name:'Baza'});
 await assert.rejects(prepareResourceClone('base',source,{action:'send'}),/invalid_copy_action/);
});
test('logo clone rehomes top-level and nested images once, preserves editable content and drops internal derivatives',async()=>{
 const image='https://sender.example/image.png';
 const source={logo:{name:'Logo',type:'PIX_150x70',id:'old',payload:{bits_b64:'AA==',source:{mode:'DRAW',imageUrl:image,hostRasterUrl:'old raster',editHistory:['old'],fabricData:{objects:[{type:'group',objects:[{src:image}]}],backgroundImage:{src:'data:image/png;base64,AA=='}}}}}};
 const before=structuredClone(source),calls=[];
 const output=await prepareResourceClone('logo',source,{action:'duplicate',suffix:'kopia',materializeImage:async image=>{calls.push(image);return 'https://receiver.example/'+calls.length;}});
 assert.equal(calls.length,2);assert.equal(output.definition.payload.source.imageUrl,output.definition.payload.source.fabricData.objects[0].objects[0].src);
 assert.doesNotMatch(JSON.stringify(output),/sender\.example|editHistory|hostRaster|"id"/);assert.equal(output.definition.name,'Logo kopia');assert.deepEqual(source,before);
});
test('TEXT and all clone kinds share the same demo policy; duplicate does not silently enable sending demo',async()=>{
 for(const kind of ['game','base','logo']){
  const root=kind==='game'?{name:'Demo',type:'prepared'}:kind==='base'?{name:'Demo'}:{name:'Demo',type:'GLYPH_30x10',payload:{rows:[],source:{mode:'TEXT',text:'Demo'}}};
  const source={[kind]:{...root,is_demo:true}};
  const duplicate=await prepareResourceClone(kind,source,{action:'duplicate',suffix:'kopia'});assert.equal(duplicate.demoOrigin,true);
  if(kind!=='base'){
   await assert.rejects(prepareResourceClone(kind,source,{action:'send'}),/demo_not_sendable/);
   await assert.rejects(prepareResourceClone(kind,{[kind]:{...root,name:'Different name'},demo_origin:duplicate.demoOrigin},{action:'send'}),/demo_not_sendable/);
  }
 }
});
test('failed materialization produces no packet and never changes the original source',async()=>{
 const source={imageUrl:'original',fabricData:{objects:[{src:'next'}]}};const before=structuredClone(source);
 await assert.rejects(mapLogoSourceImages(source,async image=>{if(image==='next')throw new Error('missing image');return 'own image';}),/missing image/);assert.deepEqual(source,before);
 await assert.rejects(mapLogoSourceImages(source,async()=>null),/incomplete_logo_source/);
 await assert.rejects(prepareResourceClone('logo',{logo:{type:'PIX_150x70',payload:{bits_b64:'AA==',source:{imageUrl:'original'}}}},{action:'duplicate',suffix:'kopia'}),/copy_image_materializer_required/);
});
