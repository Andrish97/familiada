import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('kod stron: brak nieużywanych symboli i niezdefiniowanych identyfikatorów', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const lint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'scripts/agent-tools/eslint-undef.config.mjs') });
  const results = await lint.lintFiles(['web/**/*.js']);
  const errors = results.flatMap(result => result.messages.map(message =>
    `${path.relative(root, result.filePath)}:${message.line}: ${message.message}`));
  assert.deepEqual(errors, []);
});
