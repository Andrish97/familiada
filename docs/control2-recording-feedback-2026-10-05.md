# Uwagi do nagrań Control 2 — 5 października 2026

Nowa lista użytkownika po pełnym cyklu nagrań 37212287401. Poprzedni audyt nie stanowi potwierdzenia usunięcia tych problemów.

- [ ] Nazwy drużyn widoczne przed rozpoczęciem gry.
- [ ] Display: rzeczywiste szarpanie i pomijanie klatek; oddzielić renderowanie od nagrywania, nie utożsamiać licznika rAF z płynnością obrazu.
- [ ] Modal ustawień: usunąć zbędne oczekiwanie przed wpisywaniem i szarpanie podglądu.
- [ ] Buzzer: jeden dźwięk przy naciśnięciu, bez powtórzenia po zatwierdzeniu.
- [ ] Nagrania mają faktycznie odsłaniać ekran prowadzącego i sprawdzać efekt gestu.
- [ ] Podczas dosłaniania nie pokazywać „Gra:” i nazwy drużyny.
- [ ] Przyciski „Dalej” nie mają mrugać.
- [ ] Zakończenie finału (aktualne ustalenie): po osiągnięciu progu w pierwszej lub drugiej rundzie dalsze akcje są zablokowane, w istniejącej kolumnie podpowiedzi pojawia się informacja o osiągniętym progu (bez banera/modala), a „Dalej” zmienia się w „Zakończ finał”. Bez osiągnięcia progu ten przycisk pojawia się po odsłonięciu punktów ostatniej odpowiedzi gracza 2. Dopiero kliknięcie „Zakończ finał” pokazuje wybrane w ustawieniach logo/punkty/kwotę nagrody, razem z reveal i round_transition. Późniejsze „Zakończ grę” gra tylko osobne outro, bez ponownej animacji. Bez finału pozostaje odsłanianie odpowiedzi; „Zakończ grę” pokazuje końcową planszę razem z reveal i outro. Outro ma osobną pozycję w ustawieniach i sterowaniu oraz limit 120 s. Implementacja lokalna, weryfikacja produkcyjna nadal do wykonania.
- [ ] Podmienić nowe pliki z docs/audio: intro_new.mp3, buzzer_new.mp3, reveal_new.mp3 i outro.mp3. Sprawdzić, czy użytkownik doda jeszcze inne pliki New.
- [ ] Wpisywanie gracza 2: pełna widoczność drugiego rzędu odpowiedzi gracza 1.
- [ ] Mapowanie gracza 1: wydłużyć pole „Wpisano”.
- [ ] Udostępnianie urządzeń i baz: usunąć obramowanie sekcji „Aktualnie udostępnione…”, nagłówek jak „Przez e-mail…”, kafelki jak pytania edytora, z tłem zbliżonym do strony.
- [ ] Zakładka urządzeń mieści się bez przewijania na zwykłych ekranach.
- [ ] Jednorazowy modal utraty połączenia z listą urządzeń i instrukcją sprawdzenia internetu oraz ponownego podłączenia przyciskami na górnym pasku.
- [ ] Sprawdzić: pudło drugiej drużyny podczas kradzieży powinno pokazywać duży X.

Weryfikacja: ukierunkowane testy, wdrożenie na main i przebiegi produkcyjne. Nie uruchamiać pełnego zestawu testów bez potrzeby.
