const {test,expect}=require('@playwright/test');
const {serveBranchCode}=require('./helpers/branch-code');
const {loginAsPooledTestUser}=require('./helpers/login');
const {randomUUID}=require('node:crypto');
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l38AAAAASUVORK5CYII=';
test.use({serviceWorkers:'block'});test.describe.configure({retries:0});
let stage='login';
test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.error('::error title=Native Storage copy::'+stage);});
test('native logo Storage copy: actual bytes, lost-response retry after source deletion and immutable conflict',async({page,context},info)=>{
 test.setTimeout(120000);
 if(process.env.GITHUB_REF_NAME!=='main')await serveBranchCode(context,{pages:['games','logo']});
 await loginAsPooledTestUser(page,context,info.parallelIndex);
 const {copyLogoStorageImage}=await import('../../cloudflare/maintenance-worker/src/lib/resource-copy/storage-copy.js');
 const state=await page.evaluate(async()=>{
  const db=window.__sbClient,{data,error}=await db.auth.getSession();if(error)throw error;
  const config=await import('/shared/js/core/supabase.js?v='+document.querySelector('meta[name="app-version"]').content);
  return {owner:data.session.user.id,token:data.session.access_token,url:config.SUPABASE_URL,anon:config.SUPABASE_ANON_KEY};
 });
 // Exercise the real helper/API with ordinary own-file privileges. Only the
 // project's public API key differs from the Worker's service credentials;
 // all responses and Storage writes are real. No test endpoint or service key.
 const env={SUPABASE_URL:state.url,SUPABASE_SERVICE_ROLE_KEY:state.token};
 const originalFetch=globalThis.fetch,calls=[],files=[];
 let planSignature;
 let loseResponse=true;
 globalThis.fetch=async(url,options)=>{
  const call={url,method:options.method};calls.push(call);
  const response=await originalFetch(url,{...options,headers:{...options.headers,apikey:state.anon}});
  call.status=response.status;
  if(loseResponse&&url.endsWith('/object/copy')&&response.ok){loseResponse=false;throw new Error('simulated lost copy response');}
  return response;
 };
 try{
  stage='upload source';
  const url=await page.evaluate(async image=>{const {uploadImportedLogoImage}=await import('/logo/js/db.js?v='+document.querySelector('meta[name="app-version"]').content);const {data}=await window.__sbClient.auth.getUser();return uploadImportedLogoImage(image,data.user.id);},pixel);
  const sourcePath=new URL(url).pathname.split('/user-logos/')[1];files.push(sourcePath);
  const head=await originalFetch(`${state.url}/storage/v1/object/authenticated/user-logos/${sourcePath}`,{method:'HEAD',headers:{apikey:state.anon,Authorization:'Bearer '+state.token}});
  expect(head.ok).toBe(true);
  const plan={source_owner_id:state.owner,recipient_id:state.owner,copy_id:randomUUID(),asset_id:randomUUID(),source_path:sourcePath,etag:head.headers.get('ETag'),size:Number(head.headers.get('Content-Length')),mime:head.headers.get('Content-Type').split(';')[0]};
  planSignature={etag:plan.etag,size:plan.size,mime:plan.mime};
  const destination=`${state.owner}/copies/${plan.copy_id}/${plan.asset_id}.png`;files.push(destination);
  stage='real copy with lost response';
  await expect(copyLogoStorageImage(env,plan)).rejects.toThrow('simulated lost copy response');
  expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);
  expect(calls.every(call=>['HEAD','POST'].includes(call.method))).toBe(true);
  stage='remove original and retry';
  await page.evaluate(async path=>{const {error}=await window.__sbClient.storage.from('user-logos').remove([path]);if(error)throw error;},sourcePath);
  calls.length=0;
  const result=await copyLogoStorageImage(env,plan);expect(result.already).toBe(true);expect(result.path).toBe(destination);expect(calls.map(call=>call.method)).toEqual(['HEAD']);
  stage='verify independent copied bytes';
  const response=await originalFetch(result.publicUrl);
  expect(response.ok).toBe(true);expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(pixel.split(',')[1],'base64'));
  stage='conflicting destination cannot be replaced';
  await page.evaluate(async path=>{const {error}=await window.__sbClient.storage.from('user-logos').upload(path,new Blob([new Uint8Array([1,2,3])],{type:'image/png'}),{upsert:true,contentType:'image/png'});if(error)throw error;},destination);
  calls.length=0;
  await expect(copyLogoStorageImage(env,plan)).rejects.toThrow('copy_image_conflict');
  expect(calls.map(call=>call.method)).toEqual(['HEAD']);
 }catch(error){
  const detail=String(error.message||error).slice(0,1400).replace(/\r/g,'').replace(/\n/g,'%0A');
  console.error('::error title=Native copy detail::'+detail);
  console.error('::error title=Native copy metadata::'+JSON.stringify({signature:planSignature,requests:calls.map(({method,status})=>({method,status}))}));
  throw error;
 }finally{
  globalThis.fetch=originalFetch;
  await page.evaluate(async files=>{const {error}=await window.__sbClient.storage.from('user-logos').remove(files);if(error)throw error;},files);
 }
});
