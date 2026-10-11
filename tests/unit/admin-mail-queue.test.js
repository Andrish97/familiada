import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminMessagesApi } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-messages-api.js';
import { handleAdminMarketingApi } from '../../cloudflare/maintenance-worker/src/lib/admin/admin-marketing-api.js';

const env = { SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key' };
async function invoke(handler, path, body, replies) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ path: new URL(url).pathname + new URL(url).search, body: JSON.parse(options.body), prefer: options.headers.get('Prefer') });
    assert.ok(replies.length, 'unexpected database call');
    const [status, data] = replies.shift();
    return new Response(JSON.stringify(data), { status });
  };
  try {
    const url = new URL(path, 'https://familiada.example');
    const response = await handler(new Request(url, { method: 'POST', body: JSON.stringify(body) }), env, url);
    assert.equal(replies.length, 0, 'missing database call');
    return { status: response.status, result: await response.json(), calls };
  } finally { globalThis.fetch = original; }
}
const compose = { to_email: ' TEST14@familiada.online ', subject: 'Subject', body: 'Body', body_html: '<p>Body</p>', attachments: [{filename:'a.txt',mime_type:'text/plain',storage_path:'fixture/a.txt',size:4}] };
test('admin compose: skipped mail creates no sent history or attachments; queue failure is not success', async () => {
  const skipped = await invoke(handleAdminMessagesApi, '/_admin_api/messages/send', compose, [[201, []]]);
  assert.deepEqual(skipped.result, { ok:true, queued:0, skipped:true, reason:'notifications_disabled' });
  assert.equal(skipped.calls.length,1);
  assert.equal(skipped.calls[0].body.to_email,'test14@familiada.online');
  assert.equal(skipped.calls[0].prefer,'return=representation');
  const failed = await invoke(handleAdminMessagesApi, '/_admin_api/messages/send', compose, [[503,{message:'queue unavailable'}]]);
  assert.equal(failed.status,503);
  assert.equal(failed.result.error,'queue_insert_failed');
  assert.equal(failed.calls.length,1);
});
test('admin compose: actual queue id is recorded with attachments; history failure surfaces', async () => {
  const sent = await invoke(handleAdminMessagesApi, '/_admin_api/messages/send', compose, [[201,[{id:'queue-id'}]],[200,'message-id'],[200,'attachment-id']]);
  assert.deepEqual(sent.result,{ok:true,queued:1,id:'message-id'});
  assert.equal(sent.calls[1].body.p_queue_id,'queue-id');
  assert.equal(sent.calls[2].body.p_message_id,'message-id');
  const failed = await invoke(handleAdminMessagesApi, '/_admin_api/messages/send', compose, [[201,[{id:'queue-id'}]],[500,{message:'history unavailable'}]]);
  assert.equal(failed.status,500);
  assert.equal(failed.result.error,'save_outbound_failed');
});
test('admin marketing: only actually queued normalized recipients get sent history', async () => {
  const body = { emails:[' FIRST@example.com ','first@example.com','second@example.com','invalid'], subject:'Campaign', custom_body:'<p>Body</p>' };
  const mixed = await invoke(handleAdminMarketingApi,'/_admin_api/marketing/send',body,[[201,[{to_email:'second@example.com'}]],[201,[]]]);
  assert.deepEqual(mixed.result,{ok:true,queued:1,skipped:1,total:2});
  assert.equal(mixed.calls[0].path,'/rest/v1/mail_queue?select=to_email');
  assert.equal(mixed.calls[0].prefer,'return=representation');
  assert.equal(mixed.calls[0].body.length,2);
  assert.deepEqual(mixed.calls[1].body.map(row=>row.to_email),['second@example.com']);
  const none = await invoke(handleAdminMarketingApi,'/_admin_api/marketing/send',body,[[201,[]]]);
  assert.deepEqual(none.result,{ok:true,queued:0,skipped:2,total:2});
  assert.equal(none.calls.length,1);
  const all = await invoke(handleAdminMarketingApi,'/_admin_api/marketing/send',body,[[201,[{to_email:'first@example.com'},{to_email:'second@example.com'}]],[201,[]]]);
  assert.deepEqual(all.result,{ok:true,queued:2,skipped:0,total:2});
  const failed = await invoke(handleAdminMarketingApi,'/_admin_api/marketing/send',body,[[503,{message:'queue unavailable'}]]);
  assert.equal(failed.status,503);
  assert.equal(failed.result.error,'queue_insert_failed');
});
test('admin marketing: malformed recipients, empty subject and over 500 unique emails never reach queue', async () => {
  for (const [body,error] of [[{},'missing_emails'],[{emails:['a@b.com']},'missing_subject'],[{emails:['invalid'],subject:'S'},'no_valid_emails'],[{emails:Array.from({length:501},(_,i)=>`u${i}@example.com`),subject:'S'},'too_many_emails']]) {
    const result = await invoke(handleAdminMarketingApi,'/_admin_api/marketing/send',body,[]);
    assert.equal(result.status,400);
    assert.equal(result.result.error,error);
    assert.equal(result.calls.length,0);
  }
});
