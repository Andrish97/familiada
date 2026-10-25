# Motywy wyświetlacza

## Decyzje — 2026-10-25

Użytkownik zaakceptował podgląd v7 i polecił wdrożenie.

- Zachowane sześć wyświetlaczy treści, ich rozmiary i geometria kropek.
- Pięć nowych konstrukcji: Skrzydła, Radar, Kaseton, Wstęga i Most.
  Kontrolki to odpowiednio paski pod nazwami, pierścienie, listwy,
  świetlne krawędzie oraz wsporniki. Bez osobnych kontrolek „GRA”.
- Domyślne tło jest opcjonalną metadaną motywu. Wybór innego motywu
  ustawia jego domyślne tło, o ile je ma. Wczytanie gry i ponowne wybranie
  tego samego motywu zachowują zapisany kolor. Kolory A/B i kropek bez zmian.
- Modern nie używa koloru tła. Jego kolory pochodzą z drużyn; przejęcie
  kontroli zachowuje płynne przejście. Poziome kreski są nieruchome.
- Dwie szczeliny w Modern: przebiegi wychodzą spod małego górnego licznika,
  rozchodzą się symetrycznie w dół. Około trzech kolorowych odcinków
  na owalu, oddzielonych czernią. Połowa owalu pokonywana w 18 s;
  wzór powtarza się co 12 s. Ograniczony ruch zatrzymuje dekoracyjne animacje.
- Klasyczny pozostaje domyślnym motywem. Nowe motywy mają czytelny ciemny
  wariant Prowadzącego. Wspólny rejestr i etykiety PL/EN/UK.
- Pierwsze propozycje Neon/Studio/Złoty oraz falowanie poziomych pasków
  zostały odrzucone i nie są częścią wdrożenia.

## Stan

Implementacja na `codex/display-themes-modern-motion`. Unit punktowo 43/43,
po scaleniu 25/25, Chromium lokalnie 1/1. E2E brancha 40246237871: 2/2,
zapis wszystkich motywów, własnego tła i kolorów drużyn; scena Display.
Po testach dopisane wersje URL rejestru motywów (zgodne z istniejącym Host).
Zrzuty 6 motywów 1400 px oraz ustawień 390/1440 px, PL/EN/UK.
Wdrożenie według bramek z `AGENTS.md`.
