#!/bin/bash
# Uruchamia e2e (workflow e2e-tests.yml) kolejno dla podanych grup speców:
#   scripts/agent-tools/e2e-seq.sh "e2e/a.spec.js e2e/b.spec.js" "e2e/c.spec.js"
# Grupa, w której każdy spec używa wypożyczania kont (tests/e2e/helpers/e2e-test.js,
# E25 — familijna-server/docs/konta-testowe-plan.md), startuje od razu: konta i zasoby rozdziela
# lease, więc przebiegi nie muszą na siebie czekać. Grupa ze starymi specami
# (konta testN) czeka, aż na GitHubie nie biegnie żaden przebieg e2e.
# Gałąź: REF (domyślnie main). PARALLEL=1 — nie czekaj na inne przebiegi.
# Wymaga `gh` z dostępem do repozytorium.
R=Andrish97/familijna
# Czy wszystkie pliki grupy używają lease (wtedy bez czekania).
leased_group() {
  local spec found=0
  for spec in $1; do
    case "$spec" in e2e/*.spec.js) ;; *) continue ;; esac
    found=1
    grep -q 'helpers/e2e-test' "$(dirname "$0")/../../tests/$spec" 2>/dev/null || return 1
  done
  [ "$found" = 1 ]
}
for f in "$@"; do
  leased_group "$f" || [ -n "$PARALLEL" ] || until [ "$(gh run list -R $R -w e2e-tests.yml -L 5 --json status -q '[.[]|select(.status!="completed")]|length')" -eq 0 ]; do sleep 30; done
  before=$(gh run list -R $R -w e2e-tests.yml -L 1 --json databaseId -q '.[0].databaseId')
  gh workflow run e2e-tests.yml -R $R --ref "${REF:-main}" -f spec_filter="$f" >/dev/null
  id=$before; while [ "$id" = "$before" ]; do sleep 10; id=$(gh run list -R $R -w e2e-tests.yml -L 1 --json databaseId -q '.[0].databaseId'); done
  until s=$(gh run view $id -R $R --json status,conclusion -q '.status+" "+.conclusion' 2>/dev/null); [[ "$s" == completed* ]]; do sleep 30; done
  echo "$id $s :: $f"
done
