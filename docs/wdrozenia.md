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

| ID | Etap | Źródło | Status |
|---|---|---|---|
| E0 | Zielone e2e jako punkt odniesienia: `mobile-sheet-modals` (szerokość arkusza = szerokość treści strony — margines 15 px zostaje, decyzja 2026-10-07; tekst „← Wstecz” vs ikona), przekroczenia czasu w eksploratorze bazy | — | do zrobienia |
| E1 | Edytor logo: lista `/logo/` + 3 strony edytorów, autozapis | nawigacja 6.5a | zrobione |
| E2 | Blokady wg mapy docelowej (kroki 1–6; krok 7 `locks` w `PAGES` po E4) | blokady 6 | do zrobienia |
| E3 | Drobne błędy logowania (`requireAuth` w control/account, domyślny argument, `withLangParam`) | nawigacja 6.1 | do zrobienia |
| E4 | `nav-map.js` (`PAGES`, `linkTo`, `backHref`), `ret`/`from`, gość na `/` → `/games/` | nawigacja 6.2–6.3 | do zrobienia |
| E5 | Adresy, obszar po obszarze: a) `/go/` b) ankiety c) gry (`/games/editor/`, `/games/settings/`) d) urządzenia + `/connect/` e) `/bases/explorer/`, `/logo/editor/<typ>/` f) `/login/reset|confirm/` | nawigacja 8 | do zrobienia |
| E6 | `initPage()` strona po stronie, wspólny overlay gość/urządzenie | nawigacja 6.4 | do zrobienia |
| E7 | Bez stron modalnych: b) edytor `?q=` c) ustawienia gry z autozapisem, Control zwykłym przejściem d) bez `?modal=` w manual/privacy | nawigacja 6.5 | do zrobienia |
| E8 | Jeden moduł kart `?tab=`, stan eksploratora (baza + foldery) | nawigacja 6.6 | do zrobienia |
| E10 | Ujednolicenie wyglądu: listy (pasek, karty, kafle, dolny pasek), edytory (tytuł i informacja w topbarze, jedno pole nazwy, edytor logo bez wskaźnika zapisu), ankieta bez podpowiedzi pod tytułem | ujednolicenie-wygladu.md | do zrobienia — **pierwszy** |
| E11 | Ankiety: hub znika, strona ankiety z udostępnianiem subskrybentom, podgląd Gra · Ankieta, subskrypcje z kartą Zadania | ankiety-refaktor.md | czeka na decyzję (pytania w sekcji 3) |
| E12 | Usuwanie gry i konta: jedna droga w bazie, maile i dane po e-mailu, pliki, komunikaty | usuwanie-danych.md | czeka na decyzję (sekcja 4) |
| E9 | Przyciski w `PAGES`, `locks` w `PAGES`, diagramy 6 map, e2e map | nawigacja 6.7, blokady 6 krok 7 | do zrobienia |

Kolejność: E0 → **E10** → E11 → E12 → E2 → E3 → E4 → E5 (a…f) → E6 → E7 → E8 → E9. Etapy
idą po kolei, nie równolegle — dotykają tych samych stron i tych samych
speców e2e.

## Dziennik

| Data | Etap | Commity (`main`) | e2e |
|---|---|---|---|
| 2026-10-07 | E1 | `8b11046`, `be7226a`, `1f7f135` | branch 37667707570: logo w `cross-resource-locks` ok; `mobile-sheet-modals` logo — tylko szerokość arkusza (E0) |
