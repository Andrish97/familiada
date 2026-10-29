import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const resolver = fileURLToPath(new URL('../../scripts/resolve-version-conflicts.py', import.meta.url));
const base = 'import "./asset.js?v=v2026-10-25T10000";\n';
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'familijna-version-conflict-'));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  const ok = (...args) => { const r = git(...args); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  ok('init', '-q', '-b', 'main');
  ok('config', 'user.name', 'Fixture');
  ok('config', 'user.email', 'fixture.invalid');
  ok('config', 'commit.gpgsign', 'false');
  const write = value => fs.writeFileSync(path.join(dir, 'module.js'), value);
  const commit = message => { if (fs.existsSync(path.join(dir, 'module.js'))) ok('add', 'module.js'); ok('commit', '-qm', message); };
  write(base); commit('base'); ok('switch', '-qc', 'layout');
  return { dir, git, ok, write, commit, run: () => spawnSync('python3', [resolver], { cwd: dir, encoding: 'utf8' }), clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

for (const oursDeleted of [false, true]) test(`resolver pozostawia decyzję o usunięciu (${oursDeleted ? 'delete/modify' : 'modify/delete'})`, () => {
  const f = fixture();
  try {
    if (oursDeleted) f.ok('rm', '-q', 'module.js');
    else f.write(base.replace('10000', '20000') + 'export const layout = true;\n');
    f.commit('layout');
    f.ok('switch', '-q', 'main');
    if (oursDeleted) f.write(base.replace('10000', '30000') + 'export const other = true;\n');
    else f.ok('rm', '-q', 'module.js');
    f.commit('main change');
    f.ok('switch', '-q', 'layout');
    assert.equal(f.git('-c', 'merge.conflictstyle=diff3', 'merge', 'main').status, 1);
    assert.equal(f.run().status, 1);
    assert.equal(f.ok('diff', '--name-only', '--diff-filter=U').trim(), 'module.js');
  } finally { f.clean(); }
});

test('resolver uzgadnia same wersje i zachowuje zmianę logiki', () => {
  const f = fixture();
  try {
    f.write(base.replace('10000', '20000') + 'export const layout = true;\n'); f.commit('layout');
    f.ok('switch', '-q', 'main'); f.write(base.replace('10000', '30000')); f.commit('version');
    f.ok('switch', '-q', 'layout');
    assert.equal(f.git('-c', 'merge.conflictstyle=diff3', 'merge', 'main').status, 1);
    assert.equal(f.run().status, 0);
    assert.equal(f.ok('diff', '--name-only', '--diff-filter=U').trim(), '');
    assert.match(fs.readFileSync(path.join(f.dir, 'module.js'), 'utf8'), /export const layout = true/);
  } finally { f.clean(); }
});
