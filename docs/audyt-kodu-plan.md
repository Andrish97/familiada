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
| 0 | Przywrócenie dostępu do generatora w nawigacji panelu | wdrożone, kontrola zakończona |
| A | Martwe moduły po migracji panelu, lokalne symbole i wybrane API, szablon motywu | wdrożone, kontrola zakończona |
| B | Wspólny cykl sesji ankiet tekstowych i punktowych | wdrożone, kontrola zakończona |
| C | Minifikacja wyników i odroczenie ciężkich funkcji publicznych | wdrożone, kontrola zakończona |
| D | Manifest panelu oraz przypięta synchronizacja wspólnych plików | repo prywatne |
| E | Wspólne formatery, paginacja, załączniki i sprawdzanie profilu | do wykonania |
| F | Wspólny transport dostawców maili i porównywanie sekretów Edge | do wykonania |
| G | Cache zasobów, podział treści Wskazówek, ładowanie admina i odczyty eksportu baz | do wykonania |

Pełny raport z prywatnymi szczegółami pozostaje artefaktem sesji, nie publikujemy
go w publicznym repo. Każda paczka kończy się wpisem w `wdrozenia.md` z wynikami
gałęzi, wdrożenia i kontroli. Pomiary wydajności porównywać na tych samych trasach,
jawnie rozdzielając transfer po kompresji od rozmiarów kodu źródłowego.

- 2026-10-26: E rozpoczęte na `refactor/shared-helpers-20261026`.
  Identyczne RPC `username_taken` z Konta i Logowania przeniesione do
  `core/username-availability.js`; rozstrzygnięcie unikalności przy zapisie
  nadal należy do bazy. Reszta E (formatowanie przerwy, paginacja, załączniki)
  wymaga osobnych adapterów i bramek.

- 2026-10-26: E — wspólne sprawdzanie nazwy użytkownika wdrożone.
  Bramka gałęzi 40330525901 success, Pages 40330793433 success,
  produkcyjna kontrola 40331012157 success. Pozostałe adaptery E
  są realizowane osobno w panelu prywatnym.
