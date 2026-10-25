// Prawdziwy panel i kontrolowany backend: potwierdzenie publikacji i raport.
const assert = require('node:assert/strict');
const {startServer,stopServer,launch,newContext}=require('./lib.cjs');
const {buildDb}=require('./data/demo.cjs');
const scenes=require('./scenes.cjs');
(async()=>{
 const origin=await startServer(),browser=await launch();let checks=0;
 try{
  for(const width of [390,1400]){
   const db=buildDb('pl');scenes.find(s=>s.id==='logos-market-admin-market-uniqueness').db(db,'pl');
   db.http['/_admin_api/marketplace/review']={ok:true};
   const context=await newContext(browser,db,'pl',{width,height:900,scale:1,mobile:width===390});
   const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[],writes=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/_admin_api/marketplace/review',route=>{writes.push(JSON.parse(route.request().postData()));return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});});
   await page.goto(origin+'/admin/?tab=marketplace',{waitUntil:'domcontentloaded'});
   await page.locator('[data-market-preview]').first().click();
   await page.locator('#marketPreviewUniqueness details').first().waitFor();
   await page.locator('#btnMarketPreviewApprove:not([disabled])').click();
   await page.locator('.uni-modal').waitFor({state:'visible'});
   assert.equal(writes.length,0,'no publication before confirmation');
   await page.locator('.uni-modal').getByRole('button',{name:'Wróć do raportu',exact:true}).click();
   await page.locator('.uni-modal').waitFor({state:'hidden'});
   await page.locator('#marketPreviewOverlay').waitFor({state:'visible'});
   assert.equal(writes.length,0);
   await page.locator('#btnMarketPreviewApprove').click();
   await page.locator('.uni-modal').waitFor({state:'visible'});
   await page.locator('.uni-modal').getByRole('button',{name:'Opublikuj',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#marketPreviewOverlay')?.hidden);
   assert.equal(writes.length,1);assert.equal(writes[0].uniqueness_review_key,'demo-source:demo-corpus');
   assert.deepEqual(errors,[]);checks++;console.log('PASS '+width+': report, cancel, explicit review confirmation and current review key');
   await context.close();
  }
  console.log(JSON.stringify({checks,result:'passed'}));
 }finally{await browser.close();stopServer();}
})().catch(error=>{console.error(error);process.exitCode=1;});
