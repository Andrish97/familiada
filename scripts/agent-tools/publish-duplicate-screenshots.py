"""Publish native duplicate action screenshots after the selected UI test."""
from pathlib import Path
import os
import shutil
root=Path(__file__).resolve().parents[2]
images=sorted((root/'tests/test-results').glob('**/shot-resource-duplicate-*.png'))
if not images:
    raise SystemExit('No duplication screenshots')
target=root/'docs/img/transfer/duplicate'
target.mkdir(parents=True,exist_ok=True)
for old in target.glob('shot-resource-duplicate-*.png'):
    old.unlink()
lines=['# Powiel — Gry, Bazy i Logo','',f'Przebieg [{os.environ["EVIDENCE_RUN_ID"]}](https://github.com/Andrish97/familiada/actions/runs/{os.environ["EVIDENCE_RUN_ID"]}), kod `{os.environ["EVIDENCE_SHA"]}`.','', 'Rzeczywiste kopie na koncie testowym. Dopisek w nazwie; przycisk przy imporcie/eksporcie. Telefon390, komputer1400 i telefon w poziomie844×390.','']
for screenshot in images:
    shutil.copy2(screenshot,target/screenshot.name)
    label=screenshot.stem.removeprefix('shot-resource-duplicate-')
    lines += [f'## {label}','',f'![{label}]({screenshot.name})','']
(target/'README.md').write_text('\n'.join(lines))
print(f'Prepared {len(images)} duplication screenshots')
