"""Publish requested screenshots from successful native transfer tests."""
from pathlib import Path
import os
import shutil

root = Path(__file__).resolve().parents[2]
images = sorted((root / 'tests/test-results').glob('**/shot-transfer-game-import-*.png'))
if not images:
    raise SystemExit('No game import screenshots were produced')
target = root / 'docs/img/transfer/game-import'
target.mkdir(parents=True, exist_ok=True)
for old in target.glob('shot-transfer-*.png'):
    old.unlink()
run_id = os.environ['EVIDENCE_RUN_ID']
sha = os.environ['EVIDENCE_SHA']
lines = ['# Import gry — zakończenie', '',
         f'Przebieg [{run_id}](https://github.com/Andrish97/familiada/actions/runs/{run_id}), kod `{sha}`.', '',
         'Rzeczywisty import pliku na koncie testowym. Okno po zapisaniu gry, przed kliknięciem Gotowe. Telefon390 i komputer1400.', '']
for screenshot in images:
    shutil.copy2(screenshot, target / screenshot.name)
    label = screenshot.stem.removeprefix('shot-transfer-game-import-')
    lines.extend([f'## {label}', '', f'![{label}]({screenshot.name})', ''])
(target / 'README.md').write_text('\n'.join(lines))
print(f'Prepared {len(images)} game import screenshots')
