import test from 'node:test';
import assert from 'node:assert/strict';
import {serveMaintenance,fetchWith404} from '../../cloudflare/maintenance-worker/src/lib/origin/origin.js';
test('maintenance fetches its actual index instead of a directory redirect',async()=>{
 const original=globalThis.fetch;let target;
 globalThis.fetch=async url=>{target=url;return new Response('<h1>Maintenance</h1>',{headers:{'Content-Type':'text/html'}});};
 try {
  const response=await serveMaintenance(new Request('https://www.familiada.online/'),'https://familiada.online','familiada.online','andrish97.github.io');
  assert.equal(target,'https://familiada.online/maintenance/index.html');
  assert.equal(response.status,503);assert.match(await response.text(),/Maintenance/);
 } finally {globalThis.fetch=original;}
});
test('HTML proxy preserves Location on origin redirects',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response('301 Moved Permanently',{status:301,headers:{'Content-Type':'text/html',Location:'https://www.familiada.online/games/'}});
 try {
  const response=await fetchWith404(new Request('https://www.familiada.online/games'), 'https://familiada.online','familiada.online','andrish97.github.io');
  assert.equal(response.status,301);assert.equal(response.headers.get('Location'),'https://www.familiada.online/games/');
 } finally {globalThis.fetch=original;}
});

test('TV entry uses the simplified page through the same proxy used by bypass',async()=>{
 const {fetchFromOrigin,pageIndexPath}=await import('../../cloudflare/maintenance-worker/src/lib/origin/origin.js');
 const original=globalThis.fetch;let target;
 globalThis.fetch=async url=>{target=url;return new Response('TV',{headers:{'Content-Type':'text/html'}});};
 try {
  const request=new Request('https://www.familiada.online/connect-device/?tv=1&lang=uk');
  await fetchFromOrigin(request,new URL(request.url),'https://familiada.online','familiada.online','andrish97.github.io');
  assert.equal(target,'https://familiada.online/connect-device/tv/index.html?tv=1&lang=uk');
  assert.equal(pageIndexPath('/'),'/index.html');
 } finally {globalThis.fetch=original;}
});

test('Worker serves the explicitly requested Polish page without a language redirect',async()=>{
 const {default:worker}=await import('../../cloudflare/maintenance-worker/src/index.js');
 const {setStateCache}=await import('../../cloudflare/maintenance-worker/src/lib/core/state.js');
 setStateCache({enabled:false,mode:'off'});
 const original=globalThis.fetch;let target;
 globalThis.fetch=async url=>{target=url;return new Response('Polski',{headers:{'Content-Type':'text/html'}});};
 try {
  const response=await worker.fetch(new Request('https://www.familiada.online/manual/?lang=pl'),{MAINT_KV:{get:async()=>null}},{});
  assert.equal(response.status,200);
  assert.equal(new URL(target).searchParams.get('lang'),'pl');
  assert.equal(await response.text(),'Polski');
 } finally {globalThis.fetch=original;}
});
