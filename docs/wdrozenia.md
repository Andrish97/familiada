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
| 1 | E0 | Zielone e2e: `mobile-sheet-modals` (szerokość arkusza = szerokość treści, margines 15 px zostaje; tekst przycisku „Wstecz” z ikoną), przekroczenia czasu w eksploratorze bazy | — | do zrobienia |
| 2 | E3 | Drobne błędy logowania (`requireAuth` w control/account, domyślny argument, `withLangParam`) | nawigacja 6.1 | do zrobienia |
| 3 | E10 | Wygląd: listy (pasek, karty, kafle, dolny pasek), edytory (tytuł i nazwa w topbarze, jedno pole nazwy, logo bez wskaźnika zapisu), ankieta bez podpowiedzi pod tytułem | ujednolicenie-wygladu.md | do zrobienia |
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

**Kolejność = kolumna # — PROPOZYCJA, czeka na potwierdzenie użytkownika (nie zaczynać etapów przed potwierdzeniem).** Uzasadnienie: E0 daje wiarygodne testy; E3 to
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
5. Dostępne narzędzia testowe: e2e z prawdziwą skrzynką mailową
   (`e2e_mailbox`) i kontami testowymi — używać ich do maili, kont,
   subskrypcji i ankiet.
3. Oszczędnie z kontekstem: czytać fragmenty plików, wyszukiwanie
   zlecać agentom, nie powtarzać analiz zapisanych w dokumentach.
4. Przed wyczerpaniem limitu: zapisać stan w dzienniku, wypchnąć, ustawić
   przypomnienie (`send_later`) na wznowienie pracy.

## Dziennik

| Data | Etap | Commity (`main`) | e2e |
|---|---|---|---|
| 2026-10-07 | E1 | `8b11046`, `be7226a`, `1f7f135` | branch 37667707570: logo w `cross-resource-locks` ok; `mobile-sheet-modals` logo — tylko szerokość arkusza (E0) |
