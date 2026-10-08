# Wdrożenia — kolejka i stan

Jedna lista tego, co uzgodniliśmy do wdrożenia, w jakiej kolejności i w
jakim jest stanie. **Decyzje i szczegóły nie są tutaj**, tylko w plikach
tematycznych (niżej „Źródła”), a ten plik do nich odsyła. Dzięki temu po
utracie kontekstu wystarczy przeczytać ten plik i wskazaną sekcję źródła.

## Zasady

1. **Źródła prawdy** (decyzje, mapy, stan docelowy):
   - nawigacja, adresy, karty, strony modalne: [`nawigacja-mapa-plan.md`](nawigacja-mapa-plan.md)
     (sekcja 6 — kroki, sekcja 7 — decyzje, sekcja 8 — adresy),
   - blokady zasobów: [`blokady-zasobow.md`](blokady-zasobow.md)
     (sekcja 6 — mapa docelowa i kroki),
   - wygląd list, subskrypcji i edytorów:
     [`ujednolicenie-wygladu.md`](ujednolicenie-wygladu.md),
   - ankiety (hub znika, strona ankiety, subskrypcje z zadaniami):
     [`ankiety-refaktor.md`](ankiety-refaktor.md),
   - usuwanie gry i konta: [`usuwanie-danych.md`](usuwanie-danych.md),
   - granice maili do innych osób: [`maile-granice.md`](maile-granice.md) (część E11).
2. **Decyzja użytkownika** → w tej samej turze dopisana do sekcji
   „Decyzje” właściwego źródła (z datą), commit. Nie w samej rozmowie.
3. **Tok pracy**: branch roboczy → testy jednostkowe
   (`cd tests && node --test unit/*.test.js`) → e2e na branchu
   (`e2e-tests.yml`, `spec_filter` nigdy pusty) → dopiero wtedy push na
   `main` → e2e na `main` dla tych samych speców.
4. **Bez fallbacków** (aliasy starych adresów, przekierowania, zgadywanie
   karty, `history.back()`/`referrer`) — patrz nawigacja, sekcja 2.
5. Po każdym etapie: status tutaj + commity + numer przebiegu e2e
   w „Dzienniku”. Etap jest **zrobiony**, gdy jest na `main` i e2e na
   `main` przeszło.
6. Statusy: `do zrobienia` · `w toku` · `na branchu (e2e ok)` · `zrobione` ·
   `czeka na decyzję`.

## Kolejka

| # | ID | Etap | Źródło | Status |
|---|---|---|---|---|
| 1 | E0 | Zielone e2e: `mobile-sheet-modals` (szerokość arkusza = szerokość treści, margines 15 px zostaje; tekst przycisku „Wstecz” z ikoną), przekroczenia czasu w eksploratorze bazy | — | zrobione |
| 2 | E3 | Drobne błędy logowania (`requireAuth` w control/account, domyślny argument, `withLangParam`) | nawigacja 6.1 | zrobione |
| 3 | E10 | Wygląd: listy (pasek, karty, kafle, dolny pasek), edytory (tytuł i nazwa w topbarze, jedno pole nazwy, logo bez wskaźnika zapisu), ankieta bez podpowiedzi pod tytułem | ujednolicenie-wygladu.md | w toku |
| 4 | E11 | Ankiety: luka bezpieczeństwa, klucz na uruchomienie, Przerwij, zaproszenia (3 stany), limity maili, strona ankiety (karty Udostępnianie · Wyniki), hub znika, Subskrypcje + Zadania, podgląd Gra · Ankieta, blokady stanu na stronach gry | ankiety-refaktor.md, maile-granice.md, blokady „Blokady stanu” | do zrobienia |
| 5 | E12 | Usuwanie gry i konta | usuwanie-danych.md | do zrobienia |
| 6 | E2 | Blokady wg mapy docelowej (współdzielone, `logos`, `base:B`, odnowienie `locked`, TTL, DB `*_checked`) + blokady stanu i akcji wg kryteriów gier (tabela akcja → warunki) | blokady 6 | do zrobienia |
| 7 | E4 | `nav-map.js` (`PAGES`, `linkTo`, `backHref`), `ret`, gość na `/` → `/games/` | nawigacja 6.2–6.3 | do zrobienia |
| 8 | E5 | Adresy a) `/go/` b) ankiety c) gry d) urządzenia + `/connect/` e) bazy, logo f) logowanie | nawigacja 8 | do zrobienia |
| 9 | E6 | `initPage()`, wspólny overlay gość/urządzenie | nawigacja 6.4 | do zrobienia |
| 10 | E7 | Bez stron modalnych: edytor `?q=`, ustawienia gry z autozapisem, manual/privacy bez `?modal=` | nawigacja 6.5 | do zrobienia |
| 11 | E8 | Jeden moduł kart `?tab=`, stan eksploratora | nawigacja 6.6 | do zrobienia |
| 12 | E9 | Przyciski i `locks` w `PAGES`, diagramy 6 map, e2e map | nawigacja 6.7 | do zrobienia |
| 13 | E13 | **Instrukcja (manual) zaktualizowana do nowych zasad** — ostatni etap | wszystkie | do zrobienia |
| — | E1 | Edytor logo: lista + 3 strony, autozapis | nawigacja 6.5a | zrobione |

**Kolejność = kolumna # — zatwierdzona 2026-10-07. Start pracy dopiero po osobnym „możesz zaczynać” od użytkownika.** Uzasadnienie: E0 daje wiarygodne testy; E3 to
drobiazg; E10 pierwszy z dużych (decyzja); E11 wcześnie, bo zamyka lukę
bezpieczeństwa na produkcji (korzysta z obecnej blokady `game:G`, nie
potrzebuje E2); E12 po E11 (te same tabele ankiet); E2 przed nawigacją,
bo `PAGES` deklaruje blokady; adresy po mapie stron; instrukcja na końcu.

## Zasady działania (decyzja 2026-10-07)

1. Praca w tle, bez pytania o zgodę na kolejne kroki; pytam tylko, gdy
   brakuje decyzji, której nie ma w dokumentach.
2. Kod: branch → testy (unit + e2e z filtrem) → `main` → e2e na `main`.
   **Migracje bezpieczne** (dodające, zgodne wstecz z działającym kodem)
   → od razu na `main`, potem testy. Migracje zmieniające zachowanie
   produkcji razem z kodem, który ich wymaga. **Migracje usuwające**
   (funkcje, kolumny, tabele) dopiero po potwierdzeniu testami, że nowa
   droga działa na produkcji.
6. **Nigdy dwa przebiegi e2e naraz** — dzielą konta testowe i bazę
   produkcyjną, wzajemnie sprzątają sobie dane (przebieg E10 z 2026-10-08:
   55 fałszywych błędów przez równoległy przebieg testów ankiet).
5. Dostępne narzędzia testowe: **lokalny Postgres** do wykonania migracji
   przed wypchnięciem (`docs/sql/local-db.md`); e2e z prawdziwą skrzynką mailową
   (`e2e_mailbox`) i kontami testowymi — używać ich do maili, kont,
   subskrypcji i ankiet.
3. Oszczędnie z kontekstem: czytać fragmenty plików, wyszukiwanie
   zlecać agentom, nie powtarzać analiz zapisanych w dokumentach.
   **Agenci na tańszym modelu** (Haiku do szukania, Sonnet do analizy),
   mocniejszy tylko gdy zadanie tego wymaga (decyzja 2026-10-07).
   Stan pracy zapisywany w „Dzienniku” po każdym kroku, tak żeby po
   kompaktowaniu kontekstu dało się kontynuować z samych dokumentów.
4. Przed wyczerpaniem limitu: zapisać stan w dzienniku, wypchnąć, ustawić
   przypomnienie (`send_later`) na wznowienie pracy.

## Dziennik

| Data | Etap | Commity (`main`) | e2e |
|---|---|---|---|
| 2026-10-07 | E1 | `8b11046`, `be7226a`, `1f7f135` | branch 37667707570: logo w `cross-resource-locks` ok; `mobile-sheet-modals` logo — tylko szerokość arkusza (E0) |
| 2026-10-07 | E0 (w toku, wstrzymane) | branch `25b92b3` (testy: szerokość arkusza = treść, „Wstecz” z ikoną) | branch 37702991063: 9 ok, 8 źle — bazy (udostępnianie), eksplorator (tagi, eksport, pytanie), gry (eksport do bazy), hub (2, i tak znika w E11), logo import (`#btnLogoImportCancel` niewidoczny — prawdopodobnie zmiana „Modal: wspólny przewijany obszar” na `main`). Następny krok: przeczytać szczegóły błędów z logu przebiegu |
| 2026-10-08 | E0 | `25b92b3`, `2be0fe7` (arkusze zamykane „Wstecz” w topbarze — „✕” w nagłówku ukryty na telefonie) | branch 37745173288: `mobile-sheet-modals` zielone |
| 2026-10-08 | E3 | `b0df9fb` (requireAuth `/login/`, Konto bez `setup=username`, `withLangParam` w powrotach i nakładce blokady) | unit 300/300; na `main` w `4fea5a5` |
| 2026-10-08 | E10 (część) | `d00e083` stany kafli gier (OTWARTA/ZAMKNIĘTA, GOTOWA) — na `main` | unit 300/300 |
| 2026-10-08 | E10 (na branchu) | `47f1709` edytory: tytuł w topbarze, wspólne pole nazwy, logo bez informacji o zapisie, ankieta bez podpowiedzi; `e93e446` niższe karty i mniejsze odstępy list; `6b0024f` wyszukiwanie w listach | e2e branch (logo-editor, editor, games) w toku |
| 2026-10-08 | E11a | `ca71797` na `main`: migracja 309 — uruchom/zamknij ankietę tylko właściciel (nakładki na oryginały `_…_unchecked`) | po zastosowaniu: e2e `editor.spec.js` (woła `poll_open` jako właściciel) |
| 2026-10-08 | E11a/E11b | 309 sprawdzona też lokalnie (anon: brak dostępu, obcy: `not_owner`, właściciel: ok); szkic E11b `docs/sql/e11b_draft.sql` wykonuje się lokalnie (poll_abort, rotacja klucza ok) — czeka na frontend E11c–e | — |
| 2026-10-08 | E11b | `e5a014e` na `main`: migracja 310 (klucz na uruchomienie, `poll_abort`, `poll_share_remove`, `poll_share_remind`, zamknięcie bez czekania na zaproszenia, limity maili). Lokalnie: share tylko przy otwartej, remind blokowany 24 h, close bez warunku zaproszeń, remove ok | po zastosowaniu: e2e polls, poll-go, poll-voting, polls-hub, subscriptions na `main` |
| 2026-10-08 | E11c/E11d | scalone do brancha (`ce55031`): nowa strona ankiety (pasek stanu, Udostępnianie · Wyniki, kafle subskrybentów, wyniki na żywo), Subskrypcje z 3 kartami, hub usunięty; `polls.spec` na kodzie brancha (`84eb9d0`). Testy na `main` po 310: poprawione `poll-voting` (klucz po uruchomieniu); nierozwiązane: język QR (polls.spec:553), stara strona subskrypcji nie kończy wczytywania | e2e branch: polls, subscriptions, frontend-navigation w toku; agent: filtr/sort w Subskrypcjach |
| 2026-10-08 | E10 | branch 37745868348: 55/110 źle — kolizja z równoległym przebiegiem na `main` (te same konta); realne: 2 testy logo oczekiwały tekstu stanu zapisu (`a87da93`) | do powtórki po zakończeniu przebiegu E11 |
