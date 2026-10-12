const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../web'),out=path.resolve(__dirname,'../../docs/img/poll-anonymous');
const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let p=new URL(req.url,'http://localhost').pathname;if(p.endsWith('/'))p+='index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root+'/'))return res.writeHead(403).end();try{res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});
const game='cccccccc-3622-0000-0000-000000000001';
const questions=Array.from({length:30},(_,i)=>({id:`dddddddd-3622-0000-0000-${String(i+1).padStart(12,'0')}`,ord:i+1,text:`Co zabieramy na wakacje? ${i+1}`,answers:[{id:`eeeeeeee-3622-0000-0000-${String(i+1).padStart(12,'0')}`,ord:1,text:'Książkę'}]}));
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const kind of ['text','points'])for(const width of [1400,390]){
   const page=await browser.newPage({viewport:{width,height:844}}),errors=[],calls=[];
   page.on('pageerror',error=>{errors.push(error.message);console.log('pageerror:',error.message);});
   page.on('console',msg=>{if(msg.type()==='error')console.log('browser error:',msg.text());});
   await page.addInitScript(({game})=>{localStorage.setItem('uiLang','pl');localStorage.setItem(`fam_poll_done_${game}_preview362`,'1');},{game});
   await page.route('**/rest/v1/rpc/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop();let data;
    if(name==='reserved_username_prefixes_list')data=[];
    else if(name==='site_activity_ping')data=null;
    else if(name==='poll_state')data={state:'open'};
    else if(name==='poll_get_payload')data={game:{id:game,name:'Rodzinna ankieta',type:'poll_'+kind,status:'poll_open'},questions};
    else if(name==='poll_anonymous_submit'){
     calls.push(JSON.parse(route.request().postData()));data=calls.length===1?{ok:false,error:'cooldown',retry_after:2}:{ok:true};
    }else throw new Error('Unexpected RPC '+name);
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/polls/vote/${kind}/?id=${game}&key=preview362`);
   await page.locator('#qbox').waitFor({state:'visible'});
   console.log('starting',kind,width,'progress:',await page.locator('#prog').textContent());
   for(let i=0;i<30;i++){
    await page.waitForFunction(n=>document.getElementById('prog').textContent.includes(`${n}/30`),i+1);
    if(kind==='text'){await page.locator('#answerInput').fill('Książkę');await page.locator('#btnSend').click();}
    else await page.locator('#alist button').first().click();
   }
   try { await page.waitForFunction(()=>document.getElementById('sub').textContent.includes('Możesz wysłać'),null,{timeout:5000}); } catch(error) { console.log('retry diagnostic',JSON.stringify({calls:calls.length,sub:await page.locator('#sub').textContent(),prog:await page.locator('#prog').textContent(),errors})); throw error; }
   assert.equal(calls.length,1);assert.equal(calls[0].p_items.length,30);
   const retry=page.locator(kind==='text'?'#btnSend':'#alist button');assert.equal(await retry.isDisabled(),true);
   await page.screenshot({path:path.join(out,`cooldown-${kind}-${width}.png`),fullPage:true});
   await retry.waitFor({state:'visible'});await page.waitForFunction(selector=>!document.querySelector(selector).disabled,kind==='text'?'#btnSend':'#alist button');
   await retry.click();await page.waitForFunction(()=>document.getElementById('qbox').style.display==='none');
   assert.equal(calls.length,2);assert.equal(calls[0].p_browser_token,calls[1].p_browser_token);assert.equal(calls[0].p_voter_token,calls[1].p_voter_token);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
   console.log(`${kind} ${width}: complete30, retry token, old done marker ignored and viewport passed`);await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
