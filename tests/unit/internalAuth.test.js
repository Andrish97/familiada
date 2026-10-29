import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from '../../supabase/functions/_shared/internal-auth.ts';

test('internal Edge secret comparison keeps the existing byte-level contract', () => {
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual('sekret', 'sekret'), true);
  assert.equal(timingSafeEqual('sekret', 'sekre'), false);
  assert.equal(timingSafeEqual('sekret', 'sekret '), false);
  assert.equal(timingSafeEqual('żółć', 'żółć'), true);
  assert.equal(timingSafeEqual('żółć', 'zolc'), false);
  assert.equal(timingSafeEqual('a\0b', 'a\0c'), false);
});
