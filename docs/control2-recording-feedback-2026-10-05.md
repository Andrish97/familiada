# Uwagi do nagrań Control 2 — 5 października 2026

Nowa lista użytkownika po pełnym cyklu nagrań 37212287401. Poprzedni audyt nie stanowi potwierdzenia usunięcia tych problemów.

- [ ] Nazwy drużyn widoczne przed rozpoczęciem gry.
- [ ] Display: rzeczywiste szarpanie i pomijanie klatek; oddzielić renderowanie od nagrywania, nie utożsamiać licznika rAF z płynnością obrazu.
- [ ] Modal ustawień: usunąć zbędne oczekiwanie przed wpisywaniem i szarpanie podglądu.
- [ ] Buzzer: jeden dźwięk przy naciśnięciu, bez powtórzenia po zatwierdzeniu.
- [ ] Nagrania mają faktycznie odsłaniać ekran prowadzącego i sprawdzać efekt gestu.
- [ ] Podczas dosłaniania nie pokazywać „Gra:” i nazwy drużyny.
- [ ] Przyciski „Dalej” nie mają mrugać.
- [ ] Zakończenie finału (aktualne ustalenie): po osiągnięciu progu w pierwszej lub drugiej rundzie dalsze akcje są zablokowane, w istniejącej kolumnie podpowiedzi pojawia się informacja o osiągniętym progu (bez banera/modala), a „Dalej” zmienia się w „Zakończ finał”. Bez osiągnięcia progu ten przycisk pojawia się po odsłonięciu punktów ostatniej odpowiedzi gracza 2. Dopiero kliknięcie „Zakończ finał” pokazuje wybrane w ustawieniach logo/punkty/kwotę nagrody, razem z reveal i round_transition. Późniejsze „Zakończ grę” gra tylko osobne outro, bez ponownej animacji. Bez finału pozostaje odsłanianie odpowiedzi; „Zakończ grę” pokazuje końcową planszę razem z reveal i outro. Outro ma osobną pozycję w ustawieniach i sterowaniu oraz limit 120 s. Wdrożone; testy produkcyjne potwierdziły wczesne zakończenie, powrót po outro oraz własny plik outro 31 s. Ocena nagrań nadal do wykonania.
- [ ] Podmienić nowe pliki z docs/audio: intro_new.mp3, buzzer_new.mp3, reveal_new.mp3 i outro.mp3. Sprawdzić, czy użytkownik doda jeszcze inne pliki New.
- [ ] Wpisywanie gracza 2: pełna widoczność drugiego rzędu odpowiedzi gracza 1.
- [ ] Mapowanie gracza 1: wydłużyć pole „Wpisano”.
- [ ] Udostępnianie urządzeń i baz: usunąć obramowanie sekcji „Aktualnie udostępnione…”, nagłówek jak „Przez e-mail…”, kafelki jak pytania edytora, z tłem zbliżonym do strony.
- [ ] Zakładka urządzeń mieści się bez przewijania na zwykłych ekranach.
- [ ] Jednorazowy modal utraty połączenia z listą urządzeń i instrukcją sprawdzenia internetu oraz ponownego podłączenia przyciskami na górnym pasku.
- [ ] Sprawdzić: pudło drugiej drużyny podczas kradzieży powinno pokazywać duży X.

Weryfikacja: ukierunkowane testy, wdrożenie na main i przebiegi produkcyjne. Nie uruchamiać pełnego zestawu testów bez potrzeby.

## Wyniki wdrożenia i testów — 2026-10-05

- Migracja demo 298 zakończona: 789 niezmienionych gier i 97 baz; szablony PL/EN/UK sprawdzone. Pages, Worker i funkcja wysyłania e-maili wdrożone.
- Testy zasobów i struktury na produkcji: 10/10, następnie ponownie 10/10 w rozszerzonym przebiegu.
- Testy powrotów: 5/5 po poprawieniu względnych adresów i inicjalizacji nawigacji. Potwierdzono strzałkę i powrót anonima w „Podłącz urządzenie”, powroty przez instrukcję, Bazy/Subskrypcje i hub ankiet.
- Pierwszy pełny plik testów Control2: 20 poprawnych, 3 nieudane. Dwa scenariusze końca gry przekraczały limit całego testu 150 s przy outro 65,6 s; zwiększono ich limit do 300 s. Poprawiono też margines zegara w tokenach E2E.
- Ponowienie: oba zakończenia poprawne, własne outro 31 s wgrane, zapisane i odtwarzane po przeładowaniu, docelowy adres QR poprawny. Test e-maila poprawny po powtórzeniu; pierwsza próba nie otrzymała wiadomości w 90 s. Nie traktować tego jako stabilnego wyniku poczty.
- Pierwszy cykl nagrań https://github.com/Andrish97/familiada/actions/runs/37332836160 zatrzymał się na asercji logu Buzzera: scenariusz wybrał dźwięk z Display, ale sprawdzał log Control. Poprawiono sprawdzanie właściwego źródła, dźwięku przed zatwierdzeniem i braku powtórzenia po zatwierdzeniu.
- Pełny cykl po poprawce: https://github.com/Andrish97/familiada/actions/runs/37334109511 — wynik oczekiwany. Checkboxy wizualnych uwag pozostają do oceny po nagraniach; zaliczony test nie dowodzi płynności obrazu.

Wyniki: https://github.com/Andrish97/familiada/actions/runs/37331185165 (Control2, własne outro i QR), https://github.com/Andrish97/familiada/actions/runs/37332560704 (nawigacja).
