# Motywy wyświetlacza

## Decyzje

- 2026-10-25: użytkownik zlecił dodanie motywów wyświetlacza oraz animacji
  pasków w Modern, inspirowanych nową Familiadą.
- Warianty implementacyjne: Neon (ciemny, turkusowe obramowania), Studio
  (granat, proste ramki), Złoty (ciepłe metaliczne ramki). Klasyczny pozostaje
  domyślny. Każdy wariant zachowuje kolory drużyn, planszę i sześć paneli.
- Modern i nowe warianty: poziome pasma mają wędrujące przerwy na
  zamkniętych torach; obieg `stroke-dashoffset` daje ruch dookoła, bez
  pulsowania ani skalowania. Ograniczony ruch systemu wyłącza dekoracyjne animacje
  i płynne przejście koloru. Punktacja i odsłanianie odpowiedzi bez zmian.
- Wspólny rejestr `display-themes.json` udostępnia wybór w ustawieniach,
  podglądach i urządzeniach, z etykietami PL/EN/UK. Prowadzący korzysta
  z czytelnego ciemnego wariantu Modern dla nowych motywów.

## Stan

Implementacja na `codex/display-themes-modern-motion`; testy i zrzuty w toku.
Wdrożenie według bramek z `AGENTS.md`.

## Wzorzec ruchu

Doprecyzowanie użytkownika: paski mają przemieszczać swoje przerwy dookoła.
Pierwszy wariant z falowaniem i refleksami odrzucony. Wzorzec znaleziony
samodzielnie: finał z nowego studia 2025, „Trzeci finał Beskidek!”,
https://www.facebook.com/reel/679891908203361/ — ujęcie tablicy około 1:49.
Porównano kolejne klatki: przesuwają się zakończenia pasm; brak pulsowania.
Geometria w implementacji jest przybliżeniem tego efektu, nie kopią zasobów TVP.
