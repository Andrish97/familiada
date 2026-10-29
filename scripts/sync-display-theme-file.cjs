// Walidator plików motywu jest jeden: web/shared/js/display/theme-file.js.
// Funkcja Edge dostaje jego kopię (Pages i Edge wdrażają się osobno).
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/shared/js/display/theme-file.js'), 'utf8');
fs.writeFileSync(
  path.join(root, 'supabase/functions/_shared/display-theme-file.js'),
  '// Wygenerowane przez scripts/sync-display-theme-file.cjs. Edytuj web/shared/js/display/theme-file.js.\n' + source,
);
