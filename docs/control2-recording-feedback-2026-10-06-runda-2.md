# Control2 — druga runda uwag do nagrań, 6 października 2026

Statusy poniżej wymagają osobno sprawdzenia kodu i zachowania na produkcji.

- [ ] 1. Usunąć podpowiedzi skrótów z ekranów rozpoczęcia rundy i innych
  ekranów wprowadzających, które nie mają kolumny podpowiedzi.
- [ ] 2. Napis gestu odsłaniania na zasłonie Hosta: kolor kropek z ustawień
  oraz czcionka aktualnego motywu, również nowoczesnego.
- [ ] 3. Pod rozdzielnikiem podpowiedzi dodać nagłówek „Skróty klawiszowe:”.
- [ ] 4. Stała lista skrótów w mapowaniu, bez zmian zależnych od chwilowego
  zablokowania przycisków. Dwa warianty: gracz 1 i gracz 2; drugi ma Powtórzenie.
- [ ] 5. Skrócić podpowiedzi przy odsłanianiu odpowiedzi i punktów.
- [ ] 6. Sprawdzić i uporządkować wpisywanie gracza 2 w filmie 04.
- [ ] 7. Film 05: sprawdzić długie odsłanianie 36 punktów oraz końcową
  planszę pojawiającą się za późno względem dźwięków i outro.
- [ ] 8. Porównać ze starym Control; zmiana planszy ma dzielić czas reveal
  na dwie równe części: znikanie i pojawianie. Zachować uzgodnione dźwięki
  oraz synchronizację końców reveal i dźwięku towarzyszącego.
- [ ] 9. Powiększyć niestandardowe logo na zasłonie Hosta.
- [ ] 10. Usunąć angielski komunikat o zasłanianiu na dole Hosta w polskiej grze.

## Ustalenia z nagrań

W raportach wydajności 04 i 05 ostatnie odsłanianie punktów używa różnych
czasów docelowych: około 1824 ms w 04 i 4500 ms w 05. Animacja realizuje
zlecony czas; w 05 zapis FFmpeg ma 0 pominiętych klatek. Nie uznajemy
tego za potwierdzenie synchronizacji z faktycznym dźwiękiem. Sprawdzamy
pomiar czasu i wspólną kolejność przejść.

Wpisywanie gracza 2 w 04 zawiera sprawdzanie powtórzenia przez zaznaczenie,
wpisanie „Nowa odpowiedź”, wyczyszczenie i ponowne zaznaczenie. Scenariusz
wymaga czytelniejszego przebiegu; sam test zachowania przy zmianie treści
musi pozostać sprawdzony.

## Wprowadzone poprawki

1–4: skróty pozostają tylko w istniejącej kolumnie podpowiedzi. Nagłówek
ma dwukropek. Mapowanie pokazuje stały zestaw: 1–6, W, O, Enter, N, B, M;
gracz 2 dodatkowo R. Lista nie zależy od blokady ani wyboru odpowiedzi.
Usunięto również drugi, powielony zestaw przy wpisywaniu.

5: skrócono komunikaty odsłaniania do kolejnej czynności: sprawdzenie
dopasowania, pokazanie odpowiedzi, pokazanie punktów albo przejście dalej.

6: nagranie 04 nie miesza już wpisywania z demonstracją kasowania znacznika
powtórzenia. Sprawdzenie edycji pozostaje w teście produkcyjnym pełnego finału.

7–8: nowy Control i Display mierzą długość z dekodowanego pliku, zamiast
utrwalać pierwszy szacunek metadanych MP3. Pomiar jest przygotowywany przed
graczem; jego pamięć zależy od źródła dźwięku, więc podmiana pliku zmienia
pomiar. Stary Control i Display korzystają nadal ze swojego dotychczasowego
pomiaru. Przejścia planszy mają dwie równe połowy reveal: znikanie starej
planszy i pojawianie nowej. Przy dłuższym dźwięku towarzyszącym najpierw
czekają na początek reveal, a nie wykorzystują tego czasu na znikanie.
To dotyczy również wyniku końcowego oraz zasłaniania/odtwarzania gracza 1.
Różnica pomiarów w starych raportach nie dowodzi sama przyczyny: potwierdzenie
synchronizacji wymaga nowego przebiegu na produkcji.

9: logo niestandardowe jest dopasowane do obszaru rzeczywiście zajętego
przez jego piksele, zamiast do całej pustej siatki 150×70.

2, 10: napis na zasłonie korzysta z koloru DOT i czcionki motywu.
Zmiana języka odświeża też komunikaty gestów. Dolny komunikat już używał
klucza tłumaczenia; potwierdzenie braku angielskiego napisu wymaga przebiegu
z przełączeniem języka.

Weryfikacja lokalna: 24 testy dotyczące odsłaniania, intro/przejść, Hosta,
podpowiedzi i dekodowanego pomiaru czasu; bez pełnego zestawu testów.
Statusy na liście pozostają otwarte do weryfikacji produkcyjnej.
