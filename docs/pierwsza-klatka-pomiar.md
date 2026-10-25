# Pierwsza widoczna klatka — pomiar 2026-10-25

Decyzja użytkownika: brak skoków po pokazaniu strony, rozwiązanie wspólne
w `web/shared`, zachowane stopniowe ładowanie. Kontrakt nowych modułów:
`silnik-stylow-uzycie.md` §5a.

Pomiar przed zmianą: commit `e95f8d8969`, prawdziwy kod stron, `scripts/screens/lib.cjs`
i dane demo z `scripts/screens/data`, Chromium, PL oraz UK z opóźnieniami.
PerformanceObserver od startu dokumentu (`layout-shift`, buffered),
MutationObserver na usunięcie `page-loading`, źródła z y/wysokością przed i po.
Wskazówki nie miały `page-loading`: ich przesunięcia zaczynały się po
pierwszym renderze. CLS poniżej wyklucza `hadRecentInput`.

Wymiary w każdej komórce: **390×844 / 360×640 / 1400×900**.
„Wolniej”: UK, moduł topbara opóźniony o 900 ms i odpowiedź danych o 250 ms.
Wszystkie zarejestrowane przesunięcia wystąpiły po odsłonięciu;
przed odsłonięciem suma wynosiła 0.

| Strona/scena | Przed, szybkie dane | Przed, wolniej | Źródło późniejszej zmiany |
|---|---|---|---|
| Gry | 0 / 0 / 0 | 0 / 0 / 0,09880 | topbar, body i main: widoczność nawigacji i pomiar wysokości |
| Bazy | 0 / 0 / 0 | 0 / 0 / 0,00010 | drobna aktualizacja nawigacji |
| Logo | 0 / 0 / 0 | 0 / 0 / 0 | brak przesunięć w próbie |
| Ankieta (`poll-share`) | 0 / 0 / 0,00207 | 0,01271 / 0,01596 / 0,00712 | podsumowanie odbiorców dodawało wiersz; topbar |
| Znajomi | 0 / 0 / 0 | 0 / 0 / 0 | brak przesunięć w próbie |
| Ustawienia gry | 0 / 0 / 0,00017 | 0 / 0 / 0,00017 | nazwa w topbarze |
| Zadania | 0 / 0 / 0 | 0 / 0 / 0 | brak przesunięć w próbie |
| Control (`control-devices`) | 0 / 0 / 0 | 0 / 0 / 0 | telefon: końcowy guard; desktop: urządzenia |
| Wskazówki (`manual-start`) | 0 / 0 / 0,04323 | 0,05260 / 0,07169 / 0,04529 | urządzenie, topbar i stopka przed wstawieniem treści |
| Panel admina, start przed zakładką | 0 / 0 / 0,00035 | 0 / 0 / 0,00049 | menu narzędzi |

Na telefonie szybka próba Wskazówek wykazała także ruch 0,08864/0,10873,
ale Chromium oznaczył go `hadRecentInput`, więc standardowy CLS go wyklucza.
Wolniejsza próba potwierdziła ten problem również bez tego oznaczenia.

Poprawka usuwa wyścig zamiast czekać stałą liczbę milisekund: urządzenie
przed CSS, sygnały gotowości powłoki i języka, dwa synchroniczne pomiary przed
odsłonięciem. Dane pozostają osobnymi etapami. Topbar reaguje na zmiany
przycisków w mikrozadaniu; wspólne podsumowanie ankiety rezerwuje wysokość.

Po poprawce punktowo, z tymi samymi opóźnieniami: Wskazówki 0/0/0,
Gry 0,00001/0,00002/0,00010; ankieta 0/0/0,00006. Wartości poniżej progu
0,01: drobne przesunięcia liczników i tekstu topbara. Pełny audyt i kontrola
produkcyjna są odnotowywane w Dzienniku `wdrozenia.md`.


Weryfikacja całości: 542 sceny, 971 kadrów (478 + 493), brak przekroczeń
0,01 po odsłonięciu. **971/971 pomiarów**: 963 z pierwszego przebiegu i 8
uzupełnionych punktowo po błędach starych selektorów. Runner zachowuje pomiar
także po błędzie selektora. Maksimum zmierzonych wartości: 0,006484. Pozostałe
113 + 187 uwag audytu dotyczą przewijania, ucięć i innych istniejących stanów;
nie są wynikiem bramki pierwszej klatki. Próba na kodzie bazowym potwierdziła
m.in. błędy Turnstile, sandbox iframe poczty i stare selektory Wskazówek.
Nie oznaczamy pełnego audytu układu jako zielonego.

Porównanie końcowego wyglądu: 52 pary PNG ze wszystkich 36 tras, identyczne
dane i czcionka Inter — 51 par identycznych i jeden różny piksel w pozostałej,
żadna para ponad próg. Potwierdzenie skeletonu: 24/24 prób przy opóźnieniu
danych 250 ms, UK, 390/360/1400 px. W Grach, Bazach i Logo etap danych był
jeszcze niegotowy, gdy powłoka była już widoczna; po jego odsłonięciu CLS 0.
Maksimum 24 prób: 0,00172 (ustawienia gry, 360 px). Control i ekran guarda
ze słownikiem opóźnionym o 900 ms: 0/0/0.
