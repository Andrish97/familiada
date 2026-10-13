import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseLogoPackage} from '../../web/logo/js/package.js';
import {decodeImportedLogoImage} from '../../web/shared/js/core/logo-image-data.js';

test('one pure parser handles TEXT, IMAGE, DRAW and legacy envelopes without retaining record identities',()=>{
 for(const mode of ['TEXT','IMAGE','DRAW'])for(const legacy of [false,true]){
  const pix=mode!=='TEXT';const source={mode,editHistory:['private'],hostRasterUrl:'sender-host',hostRasterData:'private',...(mode==='IMAGE'?{imageUrl:'sender-file',imageData:'data:image/png;base64,AQID'}:mode==='DRAW'?{fabricData:{objects:[{src:'data:image/png;base64,AQID'}]}}:{text:'Rodzina'})};
  const obj={id:'sender-record',user_id:'sender',name:'  Rodzina  ',...(legacy?{type:pix?'PIX_150x70':'GLYPH_30x10'}:{kind:pix?'PIX':'GLYPH'}),payload:{rows:['FAMILIADA'],bits_b64:'AA==',source}};
  const before=structuredClone(obj);const parsed=parseLogoPackage(obj,'Logo');
  assert.equal(parsed.name,'Rodzina');assert.equal(parsed.type,pix?'PIX_150x70':'GLYPH_30x10');assert.deepEqual(Object.keys(parsed),['name','type','payload']);
  assert.equal(parsed.payload.source.mode,mode);assert.equal(parsed.payload.source.editHistory,undefined);assert.equal(parsed.payload.source.hostRasterUrl,undefined);
  if(mode==='IMAGE')assert.equal(parsed.payload.source.imageUrl,undefined);
  if(!pix){assert.equal(parsed.payload.layers[0].rows.length,10);assert.equal(parsed.payload.layers[0].rows[0].length,30);}
  else{assert.equal(parsed.payload.w,150);assert.equal(parsed.payload.h,70);assert.equal(parsed.payload.format,'BITPACK_MSB_FIRST_ROW_MAJOR');}
  assert.deepEqual(obj,before);
 }
});
test('parser retains fallback names and modes and exposes typed errors with original size details',()=>{
 assert.equal(parseLogoPackage({kind:'GLYPH',name:''},'Logo').name,'Logo');
 assert.equal(parseLogoPackage({kind:'GLYPH'},'Logo').payload.source.mode,'TEXT');
 assert.equal(parseLogoPackage({kind:'PIX',payload:{bits_b64:'AA=='}},'Logo').payload.source.mode,'IMAGE');
 for(const [input,code] of [[null,'unknownImportFormat'],[{kind:'OTHER'},'unknownImportFormat'],[{kind:'PIX'},'missingBits']])assert.throws(()=>parseLogoPackage(input,'Logo'),error=>error.code===code);
 assert.throws(()=>parseLogoPackage({kind:'PIX',payload:{w:20,h:10,bits_b64:'AA=='}},'Logo'),error=>error.code==='pixSize'&&error.params.expectedW===150&&error.params.actualH===10);
});
test('embedded image byte decoder has the same MIME types and extensions for browser and server uploads',()=>{
 for(const [mime,ext] of Object.entries({'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp'})){
  const decoded=decodeImportedLogoImage(`data:${mime.toUpperCase()};base64,AQID`);assert.equal(decoded.mime,mime);assert.equal(decoded.ext,ext);assert.deepEqual([...decoded.bytes],[1,2,3]);
 }
});
test('embedded images reject remote URLs, unsupported MIME, malformed base64 and decoded overflow',()=>{
 for(const input of ['','https://sender/image','data:text/plain;base64,AQID','data:image/svg+xml;base64,AQID','data:image/png;base64,','data:image/png;base64,A'])assert.throws(()=>decodeImportedLogoImage(input));
 const allowed=Buffer.alloc(5*1024*1024).toString('base64');assert.equal(decodeImportedLogoImage('data:image/png;base64,'+allowed).bytes.length,5*1024*1024);
 assert.throws(()=>decodeImportedLogoImage('data:image/png;base64,'+Buffer.alloc(5*1024*1024+1).toString('base64')),/exceeds 5 MB/);
});
for(const lang of ['pl','en','uk'])test(`actual file parser uses the shared parser and preserves translated errors in ${lang}`,async()=>{
 const {default:dict}=await import(`../../web/shared/translation/${lang}.js`);
 const t=(key,args={})=>{let value=key.split('.').reduce((item,part)=>item?.[part],dict);assert.equal(typeof value,'string',key);for(const [name,item] of Object.entries(args))value=value.replaceAll('{'+name+'}',item);return value;};
 const source=(await readFile(new URL('../../web/logo/js/transfer.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const context=vm.createContext({parseLogoPackage,t});vm.runInContext(source+'\nglobalThis.parse=parseImport;',context);
 assert.throws(()=>context.parse('not-json','Logo'),error=>error.message===dict.logoEditor.errors.invalidJson);
 for(const [input,key] of [[{kind:'NO'},'unknownImportFormat'],[{kind:'PIX'},'missingBits'],[{kind:'PIX',payload:{w:20,h:10,bits_b64:'AA=='}},'pixSize']])assert.throws(()=>context.parse(JSON.stringify(input),'Logo'),error=>error.message===t('logoEditor.errors.'+key,{expectedW:150,expectedH:70,actualW:20,actualH:10}));
 assert.equal(context.parse('{"kind":"GLYPH","name":"Rodzina"}','Logo').name,'Rodzina');
});
