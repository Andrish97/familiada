# PROGRESS — E13 (podręcznik użytkownika)

**Status:** W TOKU — start 2026-10-21 06:31 UTC (budzik na 02:45 przepadł przy ponownym uruchomieniu sesji).

**Plan (źródło prawdy):** [`docs/podrecznik-plan.md`](docs/podrecznik-plan.md) — plan uzgodniony 2026-10-20; zasady E13 w [`docs/wdrozenia.md`](docs/wdrozenia.md), „E13 — instrukcja, indeks, zrzuty i wydajność” (zasady treści manuala z 2026-10-11).
Szczegóły i numery przebiegów: Dziennik w `docs/wdrozenia.md`.

## Decyzje (2026-10-21, 01:00 UTC)

- **Użytkownik (2026-10-21, ok. 07:40 UTC):** pracować bez zatrzymywania aż do ukończenia całego manuala (PL/EN/UK), ale **nie publikować** (bez pushu na `main`) — użytkownik najpierw przeczyta i obejrzy nowy manual (zrzuty / podgląd z brancha).

- **Użytkownik (2026-10-21):** manual piszemy całkowicie od nowa, ze zmienionym wyglądem strony — rozdziały i podrozdziały zamiast dawnych zakładek; stary manual nie jest poprawiany. Wykonanie: treść z `docs/podrecznik/*.md` (generator `scripts/manual/build-content.mjs` → `web/manual/content/{pl,en,uk}.js`), adres `?ch=N#s-N-M`, nazwa w UI „Podręcznik”.

- Osobny plik `PROGRESS-E13.md`, bo `PROGRESS.md` prowadzi równolegle sesja E21 (jej budziki 02:45 i 04:45 UTC) — wspólny plik groziłby konfliktami.
- „4:45” = czas polski (CEST), jak w `PROGRESS.md` E21: limit odnawia się o 4:40 CEST = 02:40 UTC, start 5 min później → **02:45 UTC**.
- Rozdziały pisać dopiero po sprawdzeniu, jak serwis faktycznie działa (pierwszy wiersz planu). Treść w PL, potem EN/UK.
- Treść rozdziałów najpierw jako robocze pliki Markdown w `docs/podrecznik/NN-*.md` (łatwy przegląd, bez HTML), potem przeniesienie do strony `web/manual` (obecnie 9 zakładek, treść w `web/shared/translation/{pl,en,uk}.js` → `manual.content.*`). Układ strony (rozdziały zamiast zakładek, mapa pomocy kontekstowej, styl przycisków) — w kroku 5.
- E21 zakończone 02:50 UTC (PROGRESS.md: ZAKOŃCZONE), `main` scalony do brancha.
- Podstawa Części I: regulamin TVP z 2019 r. (z „głową rodziny”) — wskazany przez użytkownika 2026-10-21.
- Kolejność: najpierw drobne błędy z weryfikacji (manual opisuje docelowe działanie), potem rozdziały Części II od 5; Część I po odczytaniu pełnego regulaminu.
- E13 ma być ostatnim etapem; E21 (krok 12–14) kończy druga sesja — przy starcie sprawdzić jej stan w `PROGRESS.md`, ale nie czekać z rozdziałami Części I (zasady teleturnieju), które od E21 nie zależą.

## Kroki

| # | Krok | Stan |
|---|---|---|
| 1 | Przegląd funkcji i limitów w obecnej wersji serwisu (kod `web/`, RPC, limity) — notatki do rozdziałów 5–19 planu → `docs/podrecznik-weryfikacja.md` | ✅ 2026-10-21 (rozdz. 2, 5–17, 19.6; rozbieżności oznaczone) |
| 1a | Naprawa drobnych błędów z weryfikacji (lista w `podrecznik-weryfikacja.md`) | 🔄 pkt 1, 2, 3, 7, 10, 11 poprawione (`3b120cac`), e2e brancha `39557135472` ✓ 2/2; **czeka na wdrożenie na `main`** (push na `main` zablokowany uprawnieniami sesji — zgoda użytkownika); pkt 6 zostaje (kody z SQL); pkt 4, 5, 8, 9 — do sprawdzenia/decyzji |
| 2 | Zgodność Części I (zasady teleturnieju) z regulaminem TVP | ✅ regulamin 2019 (PDF od użytkownika) — `podrecznik-weryfikacja.md`, Część I |
| 3 | Rozdziały Części I (1–4) | ✅ szkic `docs/podrecznik/01-04-zasady-teleturnieju.md` |
| 4 | Rozdziały Części II i III | ✅ szkice PL 5–17, 19–20 w `docs/podrecznik/` (18 pominięty zgodnie z planem) |
| 5 | Nowa strona `/manual/` (od zera): części → rozdziały → podrozdziały, spis treści, poprzedni/następny, przyciski pomocy stron → rozdziały; EN/UK; e2e `privacy-manual`; zrzuty | 🔄 strona PL gotowa (`6c8a3ed9`), stara treść usunięta; tłumaczenia EN/UK w toku; e2e przepisane |
| 6 | Wdrożenie i testy kontrolne na produkcji | ⏳ |

## Co dalej

Po wznowieniu: przeczytać ten plik, `git status`, `git fetch origin main`.
1. Gdy użytkownik zgodzi się na wdrożenie: push na `main`, Pages, kontrola `e2e/base-explorer.spec.js --grep E13` na produkcji → 1a ✅.
2. Krok 5: strona `/manual/` z rozdziałami (układ, style przycisków/stron/odnośników, mapa pomocy kontekstowej), EN/UK, `privacy-manual`, zrzuty. Najlepiej po wdrożeniu E20 (inna sesja) — wtedy też przegląd szkiców pod nazwy i układ.
3. Uwaga: wg `docs/wdrozenia.md` E13 obejmuje też indeks `/`, zrzuty `landing-*` i PageSpeed (przed treścią manuala) — do ustalenia z użytkownikiem, czy w tym planie.

## Limit wykorzystania

- Budzik ScheduleWakeup nie przetrwał ponownego uruchomienia sesji (żyje tylko w bieżącej sesji).
- **Zasada (2026-10-21):** przy limicie `send_later` (zadanie po stronie serwera, przetrwa restart kontenera) na czas odnowienia + 5 min z pierwotnym promptem, plus drugie zadanie +60 min jako zapas (gdy praca już trwa — tylko sprawdza ten plik i nic nie robi). Bez łańcucha ScheduleWakeup. Każde wznowienie: ten plik → `git status` → pierwszy niezakończony krok.
- Stary manual jest w wielu miejscach nieaktualny: treść tylko z weryfikacji kodu (`docs/podrecznik-weryfikacja.md`), stary manual najwyżej jako lista tematów do sprawdzenia.

## Znane problemy

- E20 (wygląd telefonu) wciąż w toku w innej sesji — po jego wdrożeniu przejrzeć szkice pod kątem nazw i układu ekranów.
- Push na `main` wymaga zgody użytkownika (uprawnienia sesji: „Production Deploy”).

- Sprawa do decyzji użytkownika („Mnożnik nagrody”; mnożniki rund rozstrzygnięte regulaminem) — `podrecznik-weryfikacja.md`, koniec pliku; do decyzji podręcznik opisuje obecne działanie serwisu.
