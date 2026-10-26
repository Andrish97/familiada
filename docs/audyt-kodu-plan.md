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

- 2026-10-26: F/R3 na `refactor/edge-internal-auth-20261026`: cztery Edge
  Functions używają jednej funkcji `_shared/internal-auth.ts`; polityki
  odrzucenia pustego sekretu pozostają przy endpointach. Deno typecheck
  pięciu plików i test bajtów/Unicode przeszły. Typecheck wykrył przy
  okazji niezweryfikowaną odpowiedź tokenu SendPulse: brak poprawnego
  tokenu teraz jawnie kończy się błędem przed próbą wysyłki. Wspólny
  transport dostawców R2 pozostaje kolejnym etapem.

- 2026-10-26: F/R2 na `refactor/mail-provider-transport-20261026`:
  `send-email` i `mail-worker` używają jednego transportu Brevo, Mailgun,
  SendPulse i ZeptoMail. Tryb natychmiastowy i worker przekazują jawny
  wariant, zachowując osobne limity, kolejkę oraz politykę ponawiania.
  Dodano kontrakty atrap HTTP dla czterech dostawców, załączników, odmów
  i ponownego użycia tokenu. Bramka gałęzi i kontrola produkcji przed nami.

- 2026-10-26: G/O4 na `perf/manual-chapters-20261026`: generator zachowuje
  pełne źródło do podglądu i testów, a dodatkowo wydaje mały spis oraz
  osobne moduły rozdziałów. Strona pobiera rozdział po otwarciu, a pełny
  indeks buduje dopiero przy pierwszym wyszukiwaniu. Test potwierdza brak
  pobierania pełnego pliku PL (277 581 B źródła) na wejściu do spisu;
  sam spis PL ma 12 076 B, mapa loaderów 2649 B przed kompresją.
  Po zmianie należy sprawdzić głębokie linki, PL/EN/UK i wyszukiwanie.
