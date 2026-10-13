const {test,expect}=require('@playwright/test');
const {serveBranchCode}=require('./helpers/branch-code');
const {loginAsPooledTestUser}=require('./helpers/login');
const branch=process.env.GITHUB_REF_NAME!=='main';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l38AAAAASUVORK5CYII=';
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
let stage='login',failureStage='';
test.afterEach(async({},testInfo)=>{if(testInfo.status!==testInfo.expectedStatus)console.error('::error title=Logo transfer stage::'+(failureStage||stage));});
test('standalone logo package: TEXT IMAGE DRAW, own imported image, nested source independence and incomplete export rejection',async({page,context},testInfo)=>{
 test.setTimeout(180000);const ids=[],files=[];
 if(branch)await serveBranchCode(context,{pages:['games','logo']});
 await context.addInitScript(()=>localStorage.setItem('uiLang','pl'));
 await loginAsPooledTestUser(page,context,testInfo.parallelIndex);
 let originalUrl;
 try{
  stage='original image upload';originalUrl=await page.evaluate(async data=>{const db=window.__sbClient;const {data:a,error}=await db.auth.getUser();if(error)throw error;const {uploadImportedLogoImage}=await import('/logo/js/db.js?v=' + document.querySelector('meta[name="app-version"]').content);return uploadImportedLogoImage(data,a.user.id);},pixel);files.push(originalUrl);
  for(const mode of ['TEXT','IMAGE','DRAW']){
   stage=mode+' create source';
   const source=await page.evaluate(async({mode,originalUrl})=>{
    const db=window.__sbClient;const {data:a,error}=await db.auth.getUser();if(error)throw error;
    const {createLogo}=await import('/logo/js/db.js?v=' + document.querySelector('meta[name="app-version"]').content);
    const payload=mode==='TEXT'?{layers:[{color:'main',rows:Array(10).fill('0'.repeat(30))}],source:{mode:'TEXT',text:'RODZINA'}}:{w:150,h:70,format:'BIT1_MSB_FIRST',bits_b64:btoa(String.fromCharCode(...new Uint8Array(1330))),source:mode==='IMAGE'?{mode:'IMAGE',imageUrl:originalUrl}:{mode:'DRAW',fabricData:{version:'5.3.0',objects:[{type:'group',objects:[{type:'image',src:originalUrl}]}]},world:{w:150,h:70},bg:'BLACK'}};
    const id=await createLogo({user_id:a.user.id,name:'E2E-LOGO-TRANSFER-'+mode+'-'+Date.now(),type:mode==='TEXT'?'GLYPH_30x10':'PIX_150x70',payload});
    return {id,owner:a.user.id};
   },{mode,originalUrl});ids.push(source.id);
   stage=mode+' export and parse';
   const exported=await page.evaluate(async id=>{const {fetchLogo}=await import('/logo/js/db.js?v=' + document.querySelector('meta[name="app-version"]').content);const {buildExport,parseImport}=await import('/logo/js/transfer.js?v=' + document.querySelector('meta[name="app-version"]').content);const packet=await buildExport(await fetchLogo(id),'Logo');return {packet,parsed:parseImport(JSON.stringify(packet),'Logo')};},source.id);
   expect(JSON.stringify(exported.packet)).not.toContain(source.id);expect(JSON.stringify(exported.packet)).not.toContain(source.owner);expect(JSON.stringify(exported.packet)).not.toContain(originalUrl);
   if(mode==='IMAGE'){expect(exported.packet.payload.source.imageData).toMatch(/^data:image\/png;base64,/);expect(exported.packet.payload.source.imageUrl).toBeUndefined();}
   if(mode==='DRAW')expect(exported.packet.payload.source.fabricData.objects[0].objects[0].src).toMatch(/^data:image\/png;base64,/);
   stage=mode+' create independent import';
   let parsed=exported.parsed;
   if(mode==='IMAGE'){
    const uploaded=await page.evaluate(async({data,owner})=>{const {uploadImportedLogoImage}=await import('/logo/js/db.js?v=' + document.querySelector('meta[name="app-version"]').content);return uploadImportedLogoImage(data,owner);},{data:parsed.payload.source.imageData,owner:source.owner});files.push(uploaded);
    expect(uploaded).not.toBe(originalUrl);const {imageData,...rest}=parsed.payload.source;parsed={...parsed,payload:{...parsed.payload,source:{...rest,imageUrl:uploaded}}};
   }
   const imported=await page.evaluate(async({parsed,owner})=>{const {createLogo,fetchLogo}=await import('/logo/js/db.js?v=' + document.querySelector('meta[name="app-version"]').content);const id=await createLogo({...parsed,name:parsed.name+' kopia',user_id:owner});return {id,row:await fetchLogo(id)};},{parsed,owner:source.owner});ids.push(imported.id);
   expect(imported.id).not.toBe(source.id);expect(imported.row.type).toBe(parsed.type);expect(imported.row.payload).toEqual(parsed.payload);
  }
  stage='missing image rejects packet';
  await page.route(originalUrl,route=>route.fulfill({status:404,body:'Not found'}));
  const failure=await page.evaluate(async url=>{const {buildExport}=await import('/logo/js/transfer.js?v=' + document.querySelector('meta[name="app-version"]').content);try{await buildExport({name:'Brak obrazu',type:'PIX_150x70',payload:{bits_b64:'AA==',source:{mode:'IMAGE',imageUrl:url}}},'Logo');return null;}catch(error){return error.message;}},originalUrl);
  expect(failure).toBe('Nie udało się dołączyć obrazu do logo. Spróbuj ponownie.');
  await page.unroute(originalUrl);
 }catch(error){failureStage=stage;throw error;}finally{
  stage='cleanup own records and files';
  for(const id of ids)await page.evaluate(async id=>{const {error}=await window.__sbClient.from('user_logos').delete().eq('id',id);if(error)throw error;},id);
  for(const url of files)await page.evaluate(async url=>{const {data:a,error}=await window.__sbClient.auth.getUser();if(error)throw error;const {removeLogoImageUrl}=await import('/logo/js/db.js?v=' + document.querySelector('meta[name="app-version"]').content);await removeLogoImageUrl(url,a.user.id);},url);
 }
});
