import test from 'node:test';
import assert from 'node:assert/strict';
import { gameActivity } from '../../web/settings/js/activity.js';
import { handleAdminApi } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-api.js';
test('unconfirmed old session is possible, not confirmed active',()=>{
 assert.equal(gameActivity({control_version:1,status:'playing',operator_online:false}).label,'Możliwa trwająca gra');
 assert.equal(gameActivity({control_version:1,status:'playing',operator_online:true}).label,'Gra w toku');
 assert.equal(gameActivity({control_version:1,status:'won',ended_at:'now',devices:['display']}).risk,false);
});
test('Control2 preparation and ending do not count as ongoing games',()=>{
 for(const step of ['devices_display','settings_summary','r_intro','r_gameEnd']) assert.equal(gameActivity({control_version:2,step,status:'playing',operator_online:true}).risk,false);
 assert.equal(gameActivity({control_version:2,step:'f_p1_entry',status:'final',operator_online:true}).label,'Finał w toku');
});
test('activity API requires admin access and never invokes database for anonymous request',async()=>{
 const response=await handleAdminApi(new Request('https://settings.familiada.online/_admin_api/activity'),{});
 assert.equal(response.status,401);
});
test('activity API is read-only and uncached for admin requests',async()=>{
 const url='https://settings.familiada.online/_admin_api/activity';
 assert.equal((await handleAdminApi(new Request(url,{method:'POST',headers:{'CF-Access-Jwt-Assertion':'unit'}}),{})).status,405);
 const previous=globalThis.fetch;
 try {
 globalThis.fetch=async()=>new Response(JSON.stringify({generated_at:'now',pages:[],locks:[],games:[],history:{}}),{headers:{'content-type':'application/json'}});
 const response=await handleAdminApi(new Request(url,{headers:{'CF-Access-Jwt-Assertion':'unit'}}),{SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'unit'});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).ok,true);
 } finally {globalThis.fetch=previous;}
});
