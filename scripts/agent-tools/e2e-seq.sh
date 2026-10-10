#!/bin/bash
# Uruchamia e2e (workflow e2e-tests.yml) kolejno dla podanych grup speców:
#   scripts/agent-tools/e2e-seq.sh "e2e/a.spec.js e2e/b.spec.js" "e2e/c.spec.js"
# Każda grupa startuje dopiero, gdy na GitHubie nie biegnie żaden przebieg e2e
# (zasada: nigdy dwa przebiegi naraz — dzielą konta testowe i bazę produkcyjną).
# Gałąź: REF (domyślnie main). Wymaga `gh` z dostępem do repozytorium.
R=Andrish97/familiada
for f in "$@"; do
  until [ "$(gh run list -R $R -w e2e-tests.yml -L 5 --json status -q '[.[]|select(.status!="completed")]|length')" -eq 0 ]; do sleep 30; done
  before=$(gh run list -R $R -w e2e-tests.yml -L 1 --json databaseId -q '.[0].databaseId')
  gh workflow run e2e-tests.yml -R $R --ref "${REF:-main}" -f spec_filter="$f" >/dev/null
  id=$before; while [ "$id" = "$before" ]; do sleep 10; id=$(gh run list -R $R -w e2e-tests.yml -L 1 --json databaseId -q '.[0].databaseId'); done
  until s=$(gh run view $id -R $R --json status,conclusion -q '.status+" "+.conclusion' 2>/dev/null); [[ "$s" == completed* ]]; do sleep 30; done
  echo "$id $s :: $f"
done
