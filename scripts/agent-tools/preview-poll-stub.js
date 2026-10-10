// Podgląd strony ankiety z atrapą Supabase (bez prawdziwej bazy). Uruchom:
//   (cd web && python3 -m http.server 9183) &  node scripts/agent-tools/preview-poll-stub.js
// Zrzuty poll*-390.png / -1400.png obok skryptu. RPC w atrapie zwracają {data: wartość}.
// Ścieżkę do Playwrighta dopasuj do środowiska (tu: /opt/node22/lib/node_modules/playwright).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const STUB = `
(function(){
 const user={id:'00000000-0000-0000-0000-000000000001',email:'test@example.com',is_anonymous:false,user_metadata:{username:'testowy'},app_metadata:{}};
 const session={access_token:'x',user,expires_at:9999999999};
 const G={id:'g1',name:'Ulubione owoce',type:'poll_text',status:'poll_open',share_key_poll:'abcdEFGH1234',poll_opened_at:new Date().toISOString(),poll_closed_at:null};
 const DATA={games:G,questions:Array.from({length:10},(_,i)=>({id:'q'+i,ord:i+1,text:'Pytanie '+(i+1)})),
   poll_tasks:[{id:'t1',share_key_poll:'abcdEFGH1234',status:'pending',recipient_user_id:'u2',sub_id:'s1'}]};
 const RPC={polls_hub_list_my_subscribers:[{sub_id:'s1',status:'active',subscriber_user_id:'u2',subscriber_label:'anna'},{sub_id:'s2',status:'active',subscriber_user_id:'u3',subscriber_label:'bartek'},{sub_id:'s3',status:'active',subscriber_user_id:null,subscriber_email:'ola@example.com',subscriber_label:'ola@example.com'}],
   get_poll_preview:{ok:true},acquire_edit_lock_mode:{ok:true},game_validate:{poll_entry:{ok:true},edit:{ok:true},play:{ok:true}},release_edit_lock:{ok:true}};
 function chain(val){ const res={data:val,error:null,count:Array.isArray(val)?val.length:0}; const f=function(){return p}; const p=new Proxy(f,{get(t,k){ if(k==='then') return (ok,ko)=>Promise.resolve({...res,data:Array.isArray(val)?val:(val?[val]:[])}).then(ok,ko); if(k==='single'||k==='maybeSingle') return ()=>Promise.resolve({data:Array.isArray(val)?val[0]:val,error:null}); return ()=>p; },apply(){return p}}); return p; }
 const client={auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user},error:null}),onAuthStateChange(cb){return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({}),refreshSession:async()=>({data:{session},error:null})},
  from:(t)=>chain(DATA[t]??[]),rpc:(n)=>{const v=RPC[n]??{ok:true}; return {then:(ok,ko)=>Promise.resolve({data:v,error:null}).then(ok,ko), single:()=>Promise.resolve({data:v,error:null}), maybeSingle:()=>Promise.resolve({data:v,error:null})};},channel:()=>{const c={on:()=>c,subscribe:()=>c,unsubscribe(){}};return c},removeChannel(){},
  storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),list:async()=>({data:[],error:null})})},functions:{invoke:async()=>({data:null,error:null})}};
 window.supabase={createClient:()=>client};
})();`;
(async()=>{
  const b=await chromium.launch();
  for (const [w,h] of [[390,844],[1400,900]]) {
    const ctx=await b.newContext({viewport:{width:w,height:h},locale:'pl-PL'});
    await ctx.addInitScript(()=>{try{localStorage.setItem('sb-x-auth-token','1');localStorage.setItem('fam:app_rating_suppressed','1')}catch(e){}});
    await ctx.route('**/*', r=>{const u=r.request().url();
      if(/cdn\.jsdelivr\.net\/npm\/@supabase/.test(u)) return r.fulfill({contentType:'application/javascript',body:STUB});
      if(u.startsWith('http://localhost:9183')) return r.continue(); if(/npm\/qrcode/.test(u)) return r.fulfill({contentType:'application/javascript',body:require('fs').readFileSync(process.env.QRCODE_ESM || (__dirname+'/qrcode.esm.js'))}); return r.abort();});
    const p=await ctx.newPage(); p.on('console',m=>{console.log('C',m.type(),m.text().slice(0,160))});p.on('pageerror',e=>console.log('ERR',e.message));p.on('requestfailed',r=>console.log('RF',r.url().slice(0,120)));
    await p.goto('http://localhost:9183/polls/?id=g1'); await p.waitForTimeout(3000); 
    console.log(await p.evaluate(()=>[[...document.body.children].map(e=>e.id||e.className).join(','),!!document.getElementById('pageGuard'),document.body.className,document.querySelector('.skel-step-ready')?1:0].join(' ')));await p.screenshot({path:`${__dirname}/pollnorm-${w}.png`,fullPage:true});
    await ctx.close();
  }
  await b.close();
})();
