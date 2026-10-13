"""Publish real send-flow screenshots produced by resource-copy-send.spec.js."""
from pathlib import Path
import os
import shutil

root = Path(__file__).resolve().parents[2]
images = sorted((root / "tests/test-results").glob("**/shot-resource-copy-send-*.png"))
if not images:
    raise SystemExit("No resource-copy send screenshots")

target = root / "docs/img/transfer/resource-copy-send"
target.mkdir(parents=True, exist_ok=True)
for old in target.glob("shot-resource-copy-send-*.png"):
    old.unlink()

lines = [
    "# Wyślij — Gry i Logo",
    "",
    f'Przebieg [{os.environ["EVIDENCE_RUN_ID"]}](https://github.com/Andrish97/familiada/actions/runs/{os.environ["EVIDENCE_RUN_ID"]}), kod `{os.environ["EVIDENCE_SHA"]}`.',
    "",
    "Rzeczywisty przepływ na koncie testowym: telefon 390×844, komputer 1400×960 i telefon poziomo 844×390.",
    "",
]
for screenshot in images:
    shutil.copy2(screenshot, target / screenshot.name)
    label = screenshot.stem.removeprefix("shot-resource-copy-send-")
    lines += [f"## {label}", "", f"![{label}]({screenshot.name})", ""]
(target / "README.md").write_text("\n".join(lines))
print(f"Prepared {len(images)} resource-copy send screenshots")
