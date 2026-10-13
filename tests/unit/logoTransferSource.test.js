import test from 'node:test';
import assert from 'node:assert/strict';
import {standaloneLogoSource} from '../../web/shared/js/core/logo-transfer-source.js';
const data='data:image/png;base64,AA==';
test('IMAGE export embeds sender image and removes URL plus internal derivatives',async()=>{
 const source={mode:'IMAGE',imageUrl:'https://storage.example/sender/photo.png',crop:{x:2},hostRasterUrl:'private',hostRasterData:'private',editHistory:['private']};
 const before=structuredClone(source),calls=[];
 const result=await standaloneLogoSource(source,async url=>{calls.push(url);return data;});
 assert.deepEqual(result,{mode:'IMAGE',crop:{x:2},imageData:data});assert.deepEqual(calls,[source.imageUrl]);assert.deepEqual(source,before);
});
test('existing embedded image needs no sender access; text sources retain editable fields',async()=>{
 const fail=()=>assert.fail('already embedded image must not be fetched');
 assert.deepEqual(await standaloneLogoSource({mode:'IMAGE',imageUrl:'sender',imageData:data},fail),{mode:'IMAGE',imageData:data});
 assert.deepEqual(await standaloneLogoSource({mode:'TEXT',text:'Rodzina',editHistory:['private']},fail),{mode:'TEXT',text:'Rodzina'});
 assert.deepEqual(await standaloneLogoSource(null,fail),{});
});
test('DRAW nested images, backgrounds and clip paths become independent of sender files',async()=>{
 const source={mode:'DRAW',fabricData:{objects:[{type:'group',objects:[{type:'image',src:'https://storage.example/sender/image'}]}],backgroundImage:{src:'blob:temporary-source'},clipPath:{src:data}},world:{w:100,h:100}};
 const before=structuredClone(source),calls=[];
 const result=await standaloneLogoSource(source,async url=>{calls.push(url);return data;});
 assert.deepEqual(calls,['https://storage.example/sender/image','blob:temporary-source']);
 assert.equal(result.fabricData.objects[0].objects[0].src,data);assert.equal(result.fabricData.backgroundImage.src,data);assert.deepEqual(result.world,source.world);assert.deepEqual(source,before);
 assert.doesNotMatch(JSON.stringify(result),/storage\.example|blob:/);
});
test('failed or incomplete fetch rejects the whole logo packet instead of retaining sender URL',async()=>{
 for(const source of [{imageUrl:'missing'},{mode:'DRAW',fabricData:{objects:[{type:'image',src:'missing'}]}}]){
  await assert.rejects(standaloneLogoSource(source,async()=>{throw new Error('HTTP 404');}),/HTTP 404/);
  for(const result of ['',null,'data:text/plain,not-an-image'])await assert.rejects(standaloneLogoSource(source,async()=>result),/incomplete_logo_source/);
 }
});
test('the real exporter has one independent source builder and all languages explain incomplete images',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../../web/logo/js/transfer.js',import.meta.url),'utf8');
 assert.match(source,/source = await standaloneLogoSource\(p.source, fetchImageAsDataUrl\)/);assert.doesNotMatch(source,/could not embed image|URL zostaje tylko/);
 for(const lang of ['pl','en','uk']){const {default:dict}=await import(`../../web/shared/translation/${lang}.js`);assert.equal(typeof dict.logoEditor.errors.exportIncomplete,'string');}
});
test('invalid embedded-only source never produces a seemingly complete export',async()=>{
 for(const imageData of ['not image data',{invalid:true},'data:text/html,invalid'])await assert.rejects(standaloneLogoSource({mode:'IMAGE',imageData},()=>assert.fail('invalid embedded data was fetched')),/incomplete_logo_source/);
});
