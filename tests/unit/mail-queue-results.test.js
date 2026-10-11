import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../../supabase/functions/_shared/mail-queue-results.js', import.meta.url), 'utf8');
const { mailQueueResult } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('queue result reports actual rows after notification flag triggers, including mixed/muted batch', () => {
  const items = [{ to: 'test8@familiada.online' }, { to: 'test14@familiada.online' }];
  const mixed = mailQueueResult(items, [{ to_email: items[1].to }], 2);
  assert.equal(mixed.queued, 1); assert.equal(mixed.results[0].queued, false); assert.equal(mixed.results[0].reason, 'notifications_disabled');
  assert.equal(mixed.results[1].queued, true);
  assert.equal(mailQueueResult(items, [], 2).queued, 0);
  assert.equal(mailQueueResult(items, items.map(item => ({ to_email: item.to })), 2).queued, 2);
});
test('queue result keeps recipient multiplicity/normalization and explicitly reports batch truncation', () => {
  const items = [{ to: ' TEST8@familiada.online ' }, { to: 'test8@familiada.online' }, { to: 'test14@familiada.online' }];
  const result = mailQueueResult(items, [{ to_email: 'test8@familiada.online' }], 2);
  assert.equal(result.results[0].queued, true); assert.equal(result.results[1].skipped, true);
  assert.equal(result.results[2].error, 'batch_limit'); assert.equal(result.results[2].ok, false);
  const edge = fs.readFileSync(new URL('../../supabase/functions/send-mail/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /insert\(rows\)\.select\("to_email"\)/);
  assert.doesNotMatch(edge, /queued: rows.length/);
});
