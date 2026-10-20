import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gameExportSnapshot, gameTransferVariant, gameTransferDropsVotes, normalizeGamePackage, migrateGamePackageV1, transferPoints,
} from '../../web/shared/js/core/game-transfer-format.js';

// E21 §4: pięć wariantów, market poza transferem, normalizacja bez pytania.
// Te same przypadki sprawdza SQL: tests/sql/e21-transfer-406.sql.
const questions = [{ id: 'source-q', ord: 1, text: 'Co zabieramy?', answers: [
  { id: 'source-a', ord: 2, text: 'Książkę', fixed_points: '10' }, { ord: 1, text: 'Aparat', fixed_points: 20 }] }];

test('pięć wariantów: szkic każdego typu i zamknięta ankieta zachowująca typ', () => {
  const cases = [
    ['prepared', 'draft', 'draft', [20, 10]], ['prepared', 'ready', 'draft', [20, 10]],
    ['poll_points', 'draft', 'draft', [0, 0]], ['poll_points', 'poll_open', 'draft', [0, 0]], ['poll_points', 'poll_stopped', 'draft', [0, 0]],
    ['poll_points', 'ready', 'closed', [20, 10]],
    ['poll_text', 'draft', 'draft', null], ['poll_text', 'poll_open', 'draft', null], ['poll_text', 'ready', 'closed', [20, 10]],
  ];
  for (const [type, status, state, pts] of cases) {
    const out = gameExportSnapshot({ name: 'Wakacje', type, status }, questions, 'Gra');
    assert.deepEqual(out.game, { name: 'Wakacje', type, state }, `${type}/${status}`);
    assert.equal(out.format_version, 2);
    assert.deepEqual(out.questions[0].answers.map((a) => a.fixed_points), pts || [], `${type}/${status}`);
    if (pts) assert.deepEqual(out.questions[0].answers.map((a) => a.text), ['Aparat', 'Książkę'], 'kolejność po ord');
  }
});

test('market i nieznany typ nie podlegają transferowi; ostrzeżenie o głosach', () => {
  assert.throws(() => gameExportSnapshot({ type: 'market', status: 'ready' }, questions, 'Gra'), { code: 'market_not_transferable' });
  assert.throws(() => gameTransferVariant({ type: 'invalid' }), { code: 'unknown_type' });
  assert.equal(gameTransferDropsVotes({ type: 'poll_text', status: 'poll_stopped' }), true);
  assert.equal(gameTransferDropsVotes({ type: 'poll_text', status: 'ready' }), false);
});

test('snapshot bez tożsamości, linków, wyników runtime, ustawień i plików', () => {
  const source = { id: 'source-game', owner_id: 'source-owner', name: 'Wakacje', type: 'prepared', status: 'ready', share_key_poll: 'secret', settings: { logo_id: 'source-logo' } };
  const out = gameExportSnapshot(source, questions, 'Gra');
  assert.deepEqual(Object.keys(out), ['format_version', 'game', 'questions']);
  assert.doesNotMatch(JSON.stringify(out), /source-|secret/);
});

test('punkty: ujemne, nienumeryczne, nieskończone i spoza 0–100 -> 0 (101 -> 0, nie 100)', () => {
  assert.deepEqual([-1, 101, 'abc', Infinity, NaN, null, true, '40', 12.7, 0, 100].map(transferPoints), [0, 0, 0, 0, 0, 0, 0, 40, 12, 0, 100]);
});

test('normalizacja: limity 80/100/17, nadmiar odpowiedzi -> sześć najwyżej punktowanych, remis wg wejścia', () => {
  const pkg = { format_version: 2, game: { name: 'N'.repeat(81), type: 'prepared', state: 'draft' }, questions: [
    { text: 'P'.repeat(101), answers: [10, 101, 30, -5, 30, 'x', 50, 20].map((p, i) => ({ text: `odp ${i}`.padEnd(18, '.'), fixed_points: p })) },
    { text: 'Krótkie', answers: [{ text: 'b', fixed_points: 5 }, { text: 'a', fixed_points: 50 }, { text: '', fixed_points: 9 }] },
  ] };
  const out = normalizeGamePackage(pkg);
  assert.equal([...out.game.name].length, 80);
  assert.equal([...out.questions[0].text].length, 100);
  assert.deepEqual(out.questions[0].answers.map((a) => `${a.text.slice(0, 5)}:${a.fixed_points}`), ['odp 6:50', 'odp 2:30', 'odp 4:30', 'odp 7:20', 'odp 0:10', 'odp 1:0']);
  assert.ok(out.questions[0].answers.every((a) => [...a.text].length === 17));
  // ≤6 odpowiedzi: kolejność wejścia bez zmian; pusta odpowiedź pominięta, bez tekstu zastępczego
  assert.deepEqual(out.questions[1].answers, [{ text: 'b', fixed_points: 5 }, { text: 'a', fixed_points: 50 }]);
});

test('zamknięty wynik tylko poprawny; inaczej szkic tego samego typu', () => {
  const ok = Array.from({ length: 10 }, (_, i) => ({ text: `P${i}`, answers: [{ text: 'a', fixed_points: 40 }, { text: 'b', fixed_points: 30 }, { text: 'c', fixed_points: 4 }] }));
  assert.equal(normalizeGamePackage({ format_version: 2, game: { name: 'G', type: 'poll_text', state: 'closed' }, questions: ok }).game.state, 'closed');
  const bad = normalizeGamePackage({ format_version: 2, game: { name: 'G', type: 'poll_text', state: 'closed' }, questions: ok.slice(0, 9) });
  assert.deepEqual([bad.game.state, bad.closed_downgraded, bad.questions[0].answers.length], ['draft', true, 0]);
  assert.equal(normalizeGamePackage({ format_version: 2, game: { name: 'G', type: 'prepared', state: 'closed' }, questions: ok }).game.state, 'draft');
});

test('pliki historyczne (bez wersji): rozpoznany typ zostaje, niejasny -> jawne odzyskanie preparowanej', () => {
  const v1 = migrateGamePackageV1({ game: { name: 'Stara', type: 'fixed' }, questions: [{ text: 'P', answers: [{ text: 'a', points: 30 }] }] });
  assert.deepEqual([v1.game.type, v1.game.state, v1.recovered, v1.questions[0].answers[0].fixed_points], ['prepared', 'draft', true, 30]);
  const n = normalizeGamePackage({ game: { name: 'Stara', type: 'poll_points' }, questions: [{ text: 'P', answers: [{ text: 'a', fixed_points: 30 }] }] });
  assert.deepEqual([n.game.type, n.recovered, n.questions[0].answers[0].fixed_points], ['poll_points', false, 0]);
  assert.throws(() => normalizeGamePackage({ format_version: 2, game: { type: 'market' }, questions: [] }), { code: 'unknown_type' });
  assert.throws(() => normalizeGamePackage({ format_version: 3, game: { type: 'prepared' }, questions: [] }), { code: 'unsupported_version' });
  assert.throws(() => normalizeGamePackage({ game: {} }), { code: 'invalid_payload' });
  assert.throws(() => normalizeGamePackage({ game: { type: 'prepared' }, questions: [{ text: '  ' }] }), { code: 'invalid_payload' });
});

test('plik eksportu używa wspólnego snapshotu', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../web/games/js/games-import-export.js', import.meta.url), 'utf8');
  assert.match(source, /gameExportSnapshot\(game, qs,/);
});
