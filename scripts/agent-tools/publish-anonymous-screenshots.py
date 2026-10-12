"""Publish explicitly requested, successful anonymous poll test screenshots to docs."""
from pathlib import Path
import os
import shutil
root=Path(__file__).resolve().parents[2]
images=sorted((root/'tests/test-results').glob('**/shot-anon362-*.png'))
if not images:
    raise SystemExit('No anonymous poll screenshots were produced')
target=root/'docs/img/poll-anonymous/live'
target.mkdir(parents=True,exist_ok=True)
for old in target.glob('shot-anon362-*.png'):
    old.unlink()
for image in images:
    shutil.copy2(image,target/image.name)
run_id=os.environ['EVIDENCE_RUN_ID']
sha=os.environ['EVIDENCE_SHA']
lines=['# Anonimowe ankiety — rzeczywiste odliczanie','',
       f'Przebieg [{run_id}](https://github.com/Andrish97/familiada/actions/runs/{run_id}), kod `{sha}`.',
       '', 'Rzeczywista baza i ankiety kont testowych. Odliczanie z serwera, zachowane odpowiedzi; telefon i komputer.', '']
for image in images:
    lines.extend([f'## {image.stem.removeprefix("shot-anon362-")}', '',f'![{image.stem}]({image.name})',''])
(target/'README.md').write_text('\n'.join(lines))
print(f'Prepared {len(images)} anonymous poll screenshots')
