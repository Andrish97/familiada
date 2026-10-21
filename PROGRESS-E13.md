# PROGRESS — E13 (podręcznik użytkownika)

**Status:** CZEKA NA START — 2026-10-21, 02:45 UTC (4:45 czasu polskiego).

**Plan (źródło prawdy):** [`docs/podrecznik-plan.md`](docs/podrecznik-plan.md) — plan uzgodniony 2026-10-20; zasady E13 w [`docs/wdrozenia.md`](docs/wdrozenia.md), „E13 — instrukcja, indeks, zrzuty i wydajność” (zasady treści manuala z 2026-10-11).
Szczegóły i numery przebiegów: Dziennik w `docs/wdrozenia.md`.

## Decyzje (2026-10-21, 01:00 UTC)

- Osobny plik `PROGRESS-E13.md`, bo `PROGRESS.md` prowadzi równolegle sesja E21 (jej budziki 02:45 i 04:45 UTC) — wspólny plik groziłby konfliktami.
- „4:45” = czas polski (CEST), jak w `PROGRESS.md` E21: limit odnawia się o 4:40 CEST = 02:40 UTC, start 5 min później → **02:45 UTC**.
- Rozdziały pisać dopiero po sprawdzeniu, jak serwis faktycznie działa (pierwszy wiersz planu). Treść w PL, potem EN/UK.
- E13 ma być ostatnim etapem; E21 (krok 12–14) kończy druga sesja — przy starcie sprawdzić jej stan w `PROGRESS.md`, ale nie czekać z rozdziałami Części I (zasady teleturnieju), które od E21 nie zależą.

## Kroki

| # | Krok | Stan |
|---|---|---|
| 1 | Przegląd funkcji i limitów w obecnej wersji serwisu (kod `web/`, RPC, limity) — notatki do rozdziałów 5–19 planu | ⏳ |
| 2 | Zgodność Części I (zasady teleturnieju) z regulaminem TVP | ⏳ |
| 3 | Rozdziały Części I (1–4) | ⏳ |
| 4 | Rozdziały Części II po kolei (5, 6, 7, 8, …) | ⏳ |
| 5 | EN/UK, sprawdzenie `privacy-manual`, zrzuty ekranów manuala | ⏳ |
| 6 | Wdrożenie i testy kontrolne na produkcji | ⏳ |

## Co dalej

Po wznowieniu: przeczytać ten plik, `git status`, `git fetch origin main`, stan E21 w `PROGRESS.md`, potem krok 1.

## Limit wykorzystania

- Budziki w tej sesji (ScheduleWakeup, max 3600 s każdy) do 02:45 UTC, ten sam prompt co na początku.

## Znane problemy

- Brak.
