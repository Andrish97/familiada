"""Publish explicitly requested, successful anonymous poll test screenshots to docs."""
from pathlib import Path
import os
import shutil
root=Path(__file__).resolve().parents[2]
images=sorted((root/'tests/test-results').glob('**/shot-anon362-*.png'))
if not images:
    raise SystemExit('No anonymous poll screenshots were produced')
run_id=os.environ['EVIDENCE_RUN_ID']
sha=os.environ['EVIDENCE_SHA']
def gallery_for(image):
    if image.name.startswith('shot-anon362-go-matrix-'): return 'go-states'
    return 'go-live' if image.name.startswith('shot-anon362-go-') else 'live'
for gallery in ['live','go-live','go-states']:
    group=[image for image in images if gallery_for(image)==gallery]
    if not group:
        continue
    target=root/'docs/img/poll-anonymous'/gallery
    target.mkdir(parents=True,exist_ok=True)
    for old in target.glob('shot-anon362-*.png'):
        old.unlink()
    for screenshot in group:
        shutil.copy2(screenshot,target/screenshot.name)
    lines=['# Anonimowe ankiety — głosowanie i stany linków','',
           f'Przebieg [{run_id}](https://github.com/Andrish97/familiada/actions/runs/{run_id}), kod `{sha}`.',
           '', ('Macierz komunikatów: przykładowe odpowiedzi resolverów, rzeczywiste logowanie. Te zrzuty sprawdzają interfejs, nie dostarczanie maili ani zmiany w bazie. Telefon i komputer.' if gallery=='go-states' else 'Rzeczywista baza i ankiety kont testowych. Zrzuty po wykonaniu zmian; telefon i komputer.'), '']
    for screenshot in group:
        lines.extend([f'## {screenshot.stem.removeprefix("shot-anon362-")}', '',f'![{screenshot.stem}]({screenshot.name})',''])
    (target/'README.md').write_text('\n'.join(lines))
print(f'Prepared {len(images)} anonymous poll screenshots')
