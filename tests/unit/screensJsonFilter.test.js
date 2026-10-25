import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('screen mock compares serialized JSON by value for real CAS saves, without overwriting a changed row', async () => {
  const db = { tables: { games: [{ id: 'g', settings: { team: { name: 'A', color: 'gold' }, order: [1, 2] } }] }, user: null };
  const window = { __SCREENS_DB__: db };
  vm.runInNewContext(fs.readFileSync(new URL('../../scripts/screens/fake-supabase.js', import.meta.url), 'utf8'), { window, setTimeout, console });
  const client = window.supabase.createClient();
  const same = JSON.stringify({ order: [1, 2], team: { color: 'gold', name: 'A' } });
  const result = await client.from('games').update({ settings: { team: 'B' } }).eq('id', 'g').eq('settings', same).select('id');
  assert.equal(result.data.length, 1);
  assert.equal(db.tables.games[0].settings.team, 'B');
  const stale = await client.from('games').update({ settings: { team: 'wrong' } }).eq('settings', same).select('id');
  assert.equal(stale.data.length, 0);
  assert.equal(db.tables.games[0].settings.team, 'B');
  const malformed = await client.from('games').select('id').eq('settings', '{bad json}');
  assert.equal(malformed.data.length, 0);
});
