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

- Przygotowana robocza migracja 300; jeszcze niewdrożona.
- Weryfikacja migracji, panel i testy w toku.
- Dotychczasowa historia pozostaje bez zmian.
