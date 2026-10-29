import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { waitForEmail } = createRequire(import.meta.url)('../e2e/helpers/mailbox.js');
function setup(t) {
 const previous={fetch:globalThis.fetch,timer:globalThis.setTimeout,secret:process.env.E2E_BYPASS_SECRET};
 process.env.E2E_BYPASS_SECRET='unit-only-mail-fixture';
 globalThis.setTimeout=(callback,delay,...args)=>previous.timer(callback,delay===2000?0:delay,...args);
 t.after(()=>{globalThis.fetch=previous.fetch;globalThis.setTimeout=previous.timer;if(previous.secret===undefined)delete process.env.E2E_BYPASS_SECRET;else process.env.E2E_BYPASS_SECRET=previous.secret;});
}
test('mail waiter retries an empty selection until the UI finishes queueing, then invokes only once',async t=>{
 setup(t);let triggers=0,reads=0;
 globalThis.fetch=async(input)=>{
  if(String(input).endsWith('/mail-trigger'))return Response.json({ok:true,selected:++triggers===1?0:1});
  reads++;return Response.json({emails:triggers===2?[{subject:'Invitation',received_at:'fixture'}]:[]});
 };
 const result=await waitForEmail({recipient:'test14@familiada.online',after:new Date().toISOString(),timeout:1000});
 assert.equal(result.subject,'Invitation');assert.equal(triggers,2);assert.equal(reads,3);
});
test('mail waiter can verify cron or return a delivered mail without invoking any queue',async t=>{
 setup(t);let calls=0;
 globalThis.fetch=async(input)=>{assert.ok(String(input).includes('/emails?'));calls++;return Response.json({emails:[{subject:'Delivered',received_at:'fixture'}]});};
 for(const trigger of [false,true])assert.equal((await waitForEmail({recipient:'test14@familiada.online',after:new Date().toISOString(),trigger,timeout:1000})).subject,'Delivered');
 assert.equal(calls,2);
});
