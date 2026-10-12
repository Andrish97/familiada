"""Publish explicitly requested, successful /mail test screenshots to docs."""
from pathlib import Path
import os
import shutil
root=Path(__file__).resolve().parents[2]
images=sorted((root/'tests/test-results').glob('**/shot-mail360-*.png'))
if not images:
    raise SystemExit('No mail center screenshots were produced')
target=root/'docs/img/mail-center/live'
target.mkdir(parents=True,exist_ok=True)
for old in target.glob('shot-mail360-*.png'):
    old.unlink()
for image in images:
    shutil.copy2(image,target/image.name)
run_id=os.environ['EVIDENCE_RUN_ID']
sha=os.environ['EVIDENCE_SHA']
lines=['# Centrum maili — zrzuty z testu produkcji','',
       f'Przebieg [{run_id}](https://github.com/Andrish97/familiada/actions/runs/{run_id}), kod `{sha}`.',
       '', 'Rzeczywiste maile i dane kont testowych. Zrzuty po wykonaniu zmian.', '']
for image in images:
    lines.extend([f'## {image.stem.removeprefix("shot-mail360-")}', '',f'![{image.stem}]({image.name})',''])
(target/'README.md').write_text('\n'.join(lines))
print(f'Prepared {len(images)} mail center screenshots')
