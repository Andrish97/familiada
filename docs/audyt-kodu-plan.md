# Audyt martwego kodu i optymalizacji — realizacja

## Decyzje

- 2026-10-26: właściciel zatwierdził poprawki według audytu z tego dnia:
  martwy kod, powtarzające się moduły i funkcje oraz optymalizacja.
  Najpierw gałęzie robocze i testy, następnie produkcja i kontrola.
  Kontynuować kolejne paczki bez dodatkowych potwierdzeń.
- Zaczynamy od zgłoszenia dotyczącego generatora prywatnego panelu. Jego kod,
  testy i wdrożenie należą do repo `familiada-server`; tam jest szczegółowy dziennik.
- Potwierdzenie braku importu nie wystarcza do usunięcia modułu: uwzględniać
  manifesty, dynamiczne importy, backend, service workery i efekty inicjalizatorów.
- Bez zmian schematu bazy wynikających wyłącznie z braku konsumenta wrappera JS.

## Kolejka

| Paczka | Zakres | Stan |
|---|---|---|
| 0 | Przywrócenie dostępu do generatora w nawigacji panelu | gałąź prywatna, bramka testów |
| A | Martwe moduły po migracji panelu, lokalne symbole i wybrane API, szablon motywu | bramka gałęzi zielona, publikacja |
| B | Wspólny cykl sesji ankiet tekstowych i punktowych | do wykonania |
| C | Minifikacja wyników i odroczenie ciężkich funkcji publicznych | do wykonania |
| D | Manifest panelu oraz przypięta synchronizacja wspólnych plików | repo prywatne |
| E | Wspólne formatery, paginacja, załączniki i sprawdzanie profilu | do wykonania |
| F | Wspólny transport dostawców maili i porównywanie sekretów Edge | do wykonania |
| G | Cache zasobów, podział treści Wskazówek, ładowanie admina i odczyty eksportu baz | do wykonania |

Pełny raport z prywatnymi szczegółami pozostaje artefaktem sesji, nie publikujemy
go w publicznym repo. Każda paczka kończy się wpisem w `wdrozenia.md` z wynikami
gałęzi, wdrożenia i kontroli. Pomiary wydajności porównywać na tych samych trasach,
jawnie rozdzielając transfer po kompresji od rozmiarów kodu źródłowego.
