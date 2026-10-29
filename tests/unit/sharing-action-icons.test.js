import test from 'node:test';
import assert from 'node:assert/strict';
import { sharingActionIcon } from '../../web/shared/js/core/icons.js';
test('sharing actions distinguish recipient decisions from sender removal', () => {
  for (const key of ['decline','reject','withdraw','leave']) assert.equal(sharingActionIcon(key,'cancel'),'close');
  for (const key of ['delete','remove','revoke','cancel']) assert.equal(sharingActionIcon(key,'close'),'trash');
  for (const key of ['accept','undo','resend','role']) assert.equal(sharingActionIcon(key,'fixture'),'fixture');
  assert.equal(sharingActionIcon('unknown'),'');
});
