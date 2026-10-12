const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../web'),out=path.resolve(__dirname,'../../docs/img/mail-center');
fs.mkdirSync(out,{recursive:true});
const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let p=new URL(req.url,'http://localhost').pathname;if(p.endsWith('/'))p+='index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root+'/'))return res.writeHead(403).end();try{res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});
const subs=[{id:'s1',kind:'subscription',owner_label:'MajaNowak',status:'pending'},{id:'s2',kind:'subscription',owner_label:'KlubPlanszówek',status:'pending'},{id:'s3',kind:'subscription',owner_label:'KubaZielinski',status:'active'},{id:'s4',kind:'subscription',owner_label:'Ola',status:'active'}];
const items=[{id:'t1',kind:'poll',name:'Co zabieramy na piknik?',owner_label:'MajaNowak',status:'pending',link:'/go/?t=fixture1'},{id:'t2',kind:'poll',name:'Ulubione polskie potrawy',owner_label:'KubaZielinski',status:'opened',link:'/go/?t=fixture2'},{id:'d1',kind:'device',name:'Wieczór z Familiadą',owner_label:'Ola',status:'available',device_type:'display',link:'/go/?d=fixture3'},{id:'d2',kind:'device',name:'Wieczór z Familiadą',owner_label:'Ola',status:'available',device_type:'buzzer',link:'/go/?d=fixture4'},{id:'d3',kind:'device',name:'Rodzinny turniej',owner_label:'KlubPlanszówek',status:'available',device_type:'host',link:'/go/?d=fixture5'}];
const active={ok:true,email:'anna@example.net',notifications_enabled:true,subscriptions:subs,items};
(async()=>{await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port;const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const size of [{name:'desktop',width:1400,height:900},{name:'mobile',width:390,height:844}]){
  for(const state of ['entry','sent','active','disabled','expired','registered','empty']){
   const page=await browser.newPage({viewport:{width:size.width,height:size.height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/_api/mail/**',async route=>{const endpoint=new URL(route.request().url()).pathname.split('/').pop();let data={ok:false,error:'no_session',csrf:'fixture-csrf'};
    if(state==='active')data={...active,csrf:'fixture-csrf'};
    if(state==='empty')data={...active,subscriptions:[],items:[],csrf:'fixture-csrf'};
    if(state==='disabled')data={...active,notifications_enabled:false,subscriptions:[],items:[],csrf:'fixture-csrf'};
    if(state==='expired')data={ok:false,error:'expired_token',csrf:'fixture-csrf'};
    if(state==='registered')data={ok:false,error:'requires_login',email:active.email,csrf:'fixture-csrf'};
    if(endpoint==='request')data={ok:true,cooldown_seconds:60,csrf:'fixture-csrf'};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.goto(`http://127.0.0.1:${port}/mail/?lang=pl`);await page.waitForFunction(()=>document.getElementById('mailTitle').textContent!=='Ładuję…');await page.evaluate(()=>document.fonts.ready);
   if(state==='sent'){await page.locator('#mailInput').fill(active.email);await page.locator('#mailForm button').click();await page.getByRole('heading',{name:'Sprawdź swoją skrzynkę'}).waitFor();}
   if(state==='entry'||state==='expired')await page.locator('#mailInput').fill(state==='entry'?'':'anna@example.net');
   await page.screenshot({path:`${out}/${state}-${size.name}.png`});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   if(overflow||errors.length)throw new Error(`${state}/${size.name}: overflow=${overflow}, ${errors.join(',')}`);
   if(state==='active'){await page.locator('[data-tab="items"]').click();await page.screenshot({path:`${out}/active-tasks-${size.name}.png`});}
   await page.close();console.log(state,size.name,'OK');
  }
 }
 const page=await browser.newPage({viewport:{width:844,height:390}});await page.route('**/_api/mail/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(active)}));await page.goto(`http://127.0.0.1:${port}/mail/?lang=pl`);await page.getByRole('heading',{name:'Moje powiadomienia'}).waitFor();await page.screenshot({path:`${out}/active-landscape.png`});await page.close();
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
