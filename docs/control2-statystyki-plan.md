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
- Sześć wybranych testów prawdziwej rozgrywki na produkcji w toku: [przebieg 37484802803](https://github.com/Andrish97/familiada/actions/runs/37484802803). Testy odczytują `game_sessions` i dołączają rekordy JSON; gry testowe są następnie usuwane.
- Dotychczasowa historia pozostaje bez zmian.

## Odczytywanie panelu administratora

Kafelek Rozgrywki korzysta ze wspólnej historii obu Control. W tabeli kolumna Źródło odróżnia Archiwum, Control 1 oraz Control 2. Wynik rund, punkty finału i wynik końcowy zachowują osobne kolumny. Nazwa zwycięskiej drużyny nowej rozgrywki pochodzi z zapisanego stanu.

Pokaż przebieg rozwija szczegóły nowej rozgrywki w jej wierszu: drużyny, przyczynę zakończenia, rundy z bankiem i mnożnikiem, wpisy i rozliczenia obu graczy finału oraz zdarzenia połączenia. Dawne wpisy bez szczegółów pokazują kreskę. Zakończenie oznacza zatwierdzenie przycisku Zakończ grę; sam ekran wyniku nie zamyka sesji. Restart zamyka trwającą sesję jako Przerwaną. Po godzinie bez aktywności panel pokazuje Utracono kontakt; ponowne działanie w tej samej grze przywraca jej aktualny status.

Sesje zaczęte przed instalacją statystyk mogą zawierać tylko obserwowany od wznowienia fragment. Nie odtwarzamy nieznanych wcześniejszych rund ani nie tworzymy wpisów dla już zakończonych gier.
