# Statystyki nowego Panelu sterowania

## Zakres i kolejność

1. Addytywna migracja 300: zachować wszystkie wpisy i RPC starego Control. Dodać wersję Control, szczegóły sesji oraz prywatne powiązanie aktywnej sesji ze stanem gry. Nie archiwizować obecnych wpisów przed przejściem na nowy Control.
2. Przy zatwierdzeniu stanu gry w bazie zapisywać rozpoczęcie, rozliczone rundy, finał, wynik i restart. Odświeżenie strony kontynuuje sesję; ekran przygotowania nie tworzy rozgrywki. Jedna rozliczona runda ma jeden wpis, także przy zerowym wyniku.
3. Front zgłasza jedynie aktywność panelu oraz lokalne błędy i utratę/powrót połączenia urządzeń. Nie wysyła ponownie wyników.
4. W statystykach administratora rozróżnić wcześniejsze archiwum, stary Control i nowy Control. Zachować dotychczasowe kolumny wyników i udostępnić szczegóły nowych rozgrywek. Brak dawnych danych oznaczać kreską.
5. Zweryfikować migrację i rzeczywisty zapis: start, wznowienie, rozliczenie bez podwójnego naliczania, finał, zakończenie, restart oraz izolację uprawnień. Uruchomić wybrane testy, następnie wdrożyć migrację i front oraz sprawdzić produkcję.

## Dane nowej rozgrywki

- Nazwy drużyn, ustawienia rozgrywki i źródło danych.
- Rundy: pytanie, bank, mnożnik, przyznane punkty, wyniki po rundzie, zwycięzca i kradzież.
- Finał: wpisy i dopasowania obu graczy, punkty, próg, przyczyna zakończenia i nagroda.
- Czas, aktualny etap, wynik końcowy, restart oraz ograniczona historia lokalnych problemów.

Statystyki są pomocnicze: ich awaria nie może odrzucać prawidłowej akcji gry. Baza zapisuje taki błąd do logu serwera. Samo zerwanie połączenia nie unieważnia rozgrywki ani jej wyniku. Zamknięcie przeglądarki nie daje pewnego sygnału zakończenia — potwierdzenie aktywności i dotychczasowy mechanizm wykrywania braku kontaktu pozostają konieczne.

## Stan wdrożenia

- Migracja 300 wdrożona: [przebieg 37483530162](https://github.com/Andrish97/familiada/actions/runs/37483530162).
- Migracja 301 zabezpiecza równoczesny zapis zdarzeń lokalnych i stanu gry. Test dwóch równoległych połączeń oraz wdrożenie zaliczone: [przebieg 37484422819](https://github.com/Andrish97/familiada/actions/runs/37484422819). Wdrożonej migracji 300 nie zmieniano.
- Panel administratora i telemetryka opublikowane: [Pages 37484422803](https://github.com/Andrish97/familiada/actions/runs/37484422803).
- Sześć wybranych testów prawdziwej rozgrywki na produkcji: **6/6 zaliczone**, bez ponowień, 9,1 minuty. [Przebieg 37484802803](https://github.com/Andrish97/familiada/actions/runs/37484802803). Testy odczytują `game_sessions` i dołączają rekordy JSON; gry testowe są następnie usuwane. Nie uruchamiano pełnego zestawu testów.
- Dotychczasowa historia pozostaje bez zmian.

## Odczytywanie panelu administratora

Kafelek Rozgrywki korzysta ze wspólnej historii obu Control. W tabeli kolumna Źródło odróżnia Archiwum, Control 1 oraz Control 2. Wynik rund, punkty finału i wynik końcowy zachowują osobne kolumny. Nazwa zwycięskiej drużyny nowej rozgrywki pochodzi z zapisanego stanu.

Pokaż przebieg rozwija szczegóły nowej rozgrywki w jej wierszu: drużyny, przyczynę zakończenia, rundy z bankiem i mnożnikiem, wpisy i rozliczenia obu graczy finału oraz zdarzenia połączenia. Dawne wpisy bez szczegółów pokazują kreskę. Zakończenie oznacza zatwierdzenie przycisku Zakończ grę; sam ekran wyniku nie zamyka sesji. Restart zamyka trwającą sesję jako Przerwaną. Po godzinie bez aktywności panel pokazuje Utracono kontakt; ponowne działanie w tej samej grze przywraca jej aktualny status.

Sesje zaczęte przed instalacją statystyk mogą zawierać tylko obserwowany od wznowienia fragment. Nie odtwarzamy nieznanych wcześniejszych rund ani nie tworzymy wpisów dla już zakończonych gier.

## Potwierdzone zapisy na produkcji

| Przypadek | Odczyt z bazy po prawdziwej rozgrywce |
|---|---|
| Wznowienie po przeładowaniu | Jedna sesja o tym samym ID, jedna rozliczona runda, wynik rund 90:0. |
| Wcześniejsze zakończenie finału | Rundy 300:0, finał 200, wynik końcowy 500:0, nagroda 26 500, przyczyna `final_target`. Odsłonięte cztery odpowiedzi gracza 1, żadna gracza 2. |
| Restart i ponowny start | Pierwsza sesja zamknięta jako przerwana z przyczyną `restart`; drugi rzeczywisty start utworzył nową sesję. Sam ekran gotowości nie utworzył wpisu. |
| Pełny finał obu graczy | Rundy 300:0, finał 135, wynik końcowy 435:0, nagroda 1 305, przyczyna `final_complete`; zapisane oba zestawy dopasowań. |
| Rozłączenie i ponowne podłączenie | Ta sama sesja, jedna rozliczona runda 90:0, zapisane `disconnect` i `reconnect`; gra pozostaje aktywna. |
| Zakończenie bez finału | Jedna sesja zakończona, jedna runda 90:0, brak punktów finału, przyczyna `questions_exhausted`; runda naliczona tylko raz. |

Dowody odczytano z artefaktu `production-statistics-records` w powyższym przebiegu: sześć plików `statistics-*.json`. Nie są to dane z atrapy ani z lokalnej bazy. Kod i baza starego Control nadal mogą działać równolegle; archiwizacja obecnych wpisów pozostaje odłożona do zakończenia migracji produktu.
