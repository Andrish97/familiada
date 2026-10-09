#!/usr/bin/env python3
"""Po `git merge` z konfliktami: rozwiązuje TYLKO hunki różniące się samymi
znacznikami wersji (v2026-..T..), biorąc stronę HEAD; pozostałe konflikty
zostawia do ręcznego rozwiązania i wypisuje. Potem: node scripts/version-assets.js.
Nigdy `git checkout --ours -- web` — to gubi prawdziwe zmiany z drugiej strony."""
import re, subprocess, sys
files = subprocess.run(["git", "diff", "--name-only", "--diff-filter=U"], capture_output=True, text=True).stdout.split()
pat = re.compile(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", re.S)
ver = re.compile(r"v20\d\d-\d\d-\d\dT\d+")
left = []
for f in files:
    try:
        s = open(f, encoding="utf-8").read()
    except (UnicodeDecodeError, FileNotFoundError):
        left.append(f); continue
    real = [0]
    def rep(m):
        if ver.sub("", m.group(1)) == ver.sub("", m.group(2)):
            return m.group(1)
        real[0] += 1
        return m.group(0)
    s = pat.sub(rep, s)
    open(f, "w", encoding="utf-8").write(s)
    if real[0]:
        left.append(f)
    else:
        subprocess.run(["git", "add", f])
print("Do ręcznego rozwiązania:" if left else "Wszystkie konflikty były tylko w wersjach.")
for f in left:
    print("  " + f)
sys.exit(1 if left else 0)
