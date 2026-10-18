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
- Widok sesji przerwanych: wszystkie obecne powody zakończenia mają polskie
  nazwy; po godzinie bezczynności pokazuje ostatni zapisany etap i informuje,
  gdy nie rozliczono rund. Branch test przeszedł w Actions 38265890825,
  Pages 38266129177, kontrola produkcyjna 38266216433 (1/1).

## Odczytywanie panelu administratora

Kafelek Rozgrywki korzysta ze wspólnej historii obu Control. W tabeli kolumna Źródło odróżnia Archiwum, Control 1 oraz Control 2. Wynik rund, punkty finału i wynik końcowy zachowują osobne kolumny. Nazwa zwycięskiej drużyny nowej rozgrywki pochodzi z zapisanego stanu.

Pokaż przebieg rozwija szczegóły nowej rozgrywki w jej wierszu: drużyny, przyczynę zakończenia, rundy z bankiem i mnożnikiem, wpisy i rozliczenia obu graczy finału oraz zdarzenia połączenia. Dawne wpisy bez szczegółów pokazują kreskę. Zakończenie oznacza zatwierdzenie przycisku Zakończ grę; sam ekran wyniku nie zamyka sesji. Restart zamyka trwającą sesję jako Przerwaną. Po godzinie bez aktywności panel pokazuje Utracono kontakt; ponowne działanie w tej samej grze przywraca jej aktualny status.

Sesje zaczęte przed instalacją statystyk mogą zawierać tylko obserwowany od wznowienia fragment. Nie odtwarzamy nieznanych wcześniejszych rund ani nie tworzymy wpisów dla już zakończonych gier.

### Przerwana sesja bez rozliczonej rundy

`control_idle_expired` oznacza godzinę bez odnotowanej aktywności Control; nie
oznacza, że sama gra trwała godzinę. Szczegóły rozliczonej rundy trafiają do
statystyk dopiero przy jej rozliczeniu, dlatego w przerwanej wcześniej grze
może nie być listy rund ani pytań. Widok pokazuje wtedy ostatni zapisany etap
oraz informację, że nie rozliczono żadnej rundy. Nie dopowiadamy przebiegu,
którego statystyki nie zachowały. Wszystkie używane powody zakończenia mają
polskie opisy; nieznana przyszła wartość również nie wyświetla surowego kodu.

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

## Decyzje

- 2026-10-18: diagnostyka połączenia zapisuje tylko istotne zdarzenia. Nie
  zapisujemy zwykłych żądań stanu, potwierdzeń ACK, przełączeń fokusu ani
  samego ukrycia/wznowienia karty. Krótkie przerwy w bezpośrednim kanale są
  agregowane w pamięci; po powrocie zapisujemy pojedyncze podsumowanie czasu,
  statusu kanału, nadrobionych rewizji oraz czasu działania karty w tle.
  Osobnymi zdarzeniami są tylko epizody błędu i powrotu odczytu bazy/renderu,
  przekroczenie czasu ACK oraz zauważalne opóźnienie planszy. Diagnostyka jest
  best-effort i nie może blokować akcji gry. JSON zachowuje te zwięzłe wpisy.

- 2026-10-10: poprawiony opis logo w manualu PL/EN/UK: Piksele oraz Źródło
  z zachowaniem właściwym dla tekstu, rysunku i obrazu. Użytkownik polecił
  opublikować opis od razu, a kontrolę produkcji wykonać po publikacji.

- 2026-10-10: wdrożyć zachowane lokalne poprawki odczytu obecności i listy
  zdarzeń; posprzątać nieaktualne dokumenty i jednorazowe testy diagnostyczne.
- Błąd odczytu obecności zachowuje ostatni znany stan urządzeń i blokuje akcje
  trwającej gry do poprawnego odczytu. Zapisuje błąd odczytu, bez fałszywego
  zdarzenia rozłączenia. Powrót połączenia bez poprzedniej przerwy jest
  pomijany w szczegółach, a pusta sekcja zdarzeń nie jest wyświetlana.

## Poprawki wdrożone 2026-10-10

Zachowanie obecności poprawione także podczas ponowień odczytu HTTP.
Usunięto osierocone wpisy powrotu połączenia i puste sekcje zdarzeń.
Unit: 401/401. Pages: 38088199184 i 38088289432. Potwierdzenie rozłączenia
na produkcji: 38088340380; renderer statystyk z opublikowanego zasobu Pages
oraz opis logo manuala PL/EN/UK: 38088655683 (2/2 bez ponowień).
Panel administratora pozostaje na chronionej domenie `settings.familiada.online`;
test renderera używa opublikowanego JS i prawdziwego DOM, bez odczytu prywatnych
danych administratora.

## Status „Utracono kontakt”

Widok `game_sessions_effective` nadaje ten status niezakończonej sesji po
ponad godzinie od `last_seen_at`. Aktywność odświeżają zatwierdzone zmiany
stanu gry oraz telemetryka Control (co 5 minut i przy powrocie do karty).
Możliwą przyczyną jest zamknięcie karty, uśpienie urządzenia lub brak sieci.
Sam status nie zamyka gry ani nie usuwa wyniku; wznowienie aktywności
przywraca bieżący status tej samej sesji. Przerwy urządzeń w rozwiniętym
przebiegu są osobnymi zdarzeniami, wykrywanymi po 6,5 s bez ich aktywności.

## Ręczna kontrola statystyk

Konta testowe są wykluczone ze statystyk zbiorczych; wykluczenie nie blokuje
zapisu sesji. Do ręcznej kontroli można użyć `retain_statistics_games` w
workflow e2e, a następnie czasowo usunąć odpowiednie konto z wykluczeń w
panelu administratora. Domyślnie testy usuwają utworzone gry.
Historyczne potwierdzenie zachowania i wykluczeń: przebiegi 37489529236 i
37491323090. Jednorazowy test zależny od pozostawionych wtedy gier usunięto.

## Diagnostyka odczuwalnych problemów — zakres zatwierdzony 2026-10-12

Użytkownik chce rozróżniać awarie widoczne dla operatora od krótkich, bezobjawowych zmian obecności oraz ustalać, co działo się na urządzeniu.

- Łączyć krótkie nawroty utraty połączenia w jeden incydent. Zapisywać czas trwania, liczbę nawrotów i to, czy Control blokował akcje albo operator próbował wykonać zablokowaną akcję. Nie zapisywać surowych heartbeatów.
- Przy incydencie zapisać stan karty urządzenia: widoczna/ukryta oraz ostatnia zmiana widoczności. Brak fokusu sam nie oznacza problemu; Display może pracować na ekranie zewnętrznym.
- Rozróżnienie urządzeń oznacza wyłącznie ten sam lub inny profil przeglądarki, nie ten sam fizyczny komputer. Ostatnią zmianę widoczności pokazujemy jako czas od zaobserwowanej zmiany.
- Mierzyć opóźnienie ukończenia zmiany planszy Display względem oczekiwanego czasu animacji/dźwięku oraz nieudane lub opóźnione rozpoczęcie dźwięku. Rejestrować tylko przekroczenia ustalonych progów lub błędy, nie każdy dźwięk i każdą animację.
- Mierzyć widoczne zacięcia klatek podczas renderowania planszy; pomijać pomiar w tle, a zapisywać wyłącznie przerwy co najmniej 250 ms.
- Wykrywać wspólny kontekst przeglądarki przy użyciu losowego identyfikatora ograniczonego do jednej gry i wspólnego dla kart tej samej przeglądarki/profilu. Surowy identyfikator służy wyłącznie do porównania bieżących metadanych obecności; do historii sesji trafia tylko relacja „ten sam profil”, „inny profil” lub „brak danych”. Nie zbieramy adresu IP ani fingerprintu. To nie jest pewne rozpoznanie tego samego fizycznego komputera.
- Szczegóły mają pokazywać objaw i jego skutek, np. „Display w tle; akcje zablokowane 2 razy; plansza potwierdzona 2,4 s po oczekiwanym końcu dźwięku”, a nie szereg technicznych przełączeń online/offline.

Decyzja użytkownika („chcę to”, 2026-10-12): wdrożyć zakres. Zrealizowano go w migracji 356: incydent łączy zaniki do 10 s stabilnego połączenia i zapisuje się też przy końcu gry lub potwierdzonym restarcie; zdarzenia dźwięku zapisują start opóźniony o co najmniej 500 ms lub błąd; opóźnienie planszy zapisuje się po przekroczeniu oczekiwanego czasu o 1,5 s; widoczne zacięcie klatki od 250 ms. Payload SQL ogranicza kategorie i rozmiar. Telemetria nie zmienia blokad ani stanu rozgrywki, a błędy wysyłania są nieblokujące. Testy SQL i unit uruchamiać na GitHub Actions; e2e punktowo zgodnie z `AGENTS.md`.

## Wdrożenie i kontrola produkcyjna 2026-10-12

- Pages: [38237210237](https://github.com/Andrish97/familiada/actions/runs/38237210237); migracja 356: [38237210251](https://github.com/Andrish97/familiada/actions/runs/38237210251), w `supabase/migration_logs/latest.log` potwierdzone `APPLY` i `OK`.
- Renderer statystyk na produkcji: [38237614927](https://github.com/Andrish97/familiada/actions/runs/38237614927), 1/1. Pełny scenariusz rozłączenia, blokady i ponownego podłączenia: [38239217399](https://github.com/Andrish97/familiada/actions/runs/38239217399), e2e 1/1 i unit 459/459. Rekord JSON jest w artefakcie `production-statistics-records`.
- W kontrolnym rekordzie czas blokady wyniósł 7501 ms; wszystkie trzy karty miały stan `visible`, a urządzenia były na `different_profile`. Ten drugi wynik był oczekiwany, bo test celowo odtwarza ponowne podłączenie w nowych kontekstach przeglądarki. Nie oznacza innego urządzenia fizycznego.
- Test wymusza 503 przy odczycie obecności, dlatego zapisany w nim błąd odczytu jest scenariuszem kontrolnym. Ewentualny wpis opóźnienia Display z tej gry również nie potwierdza sam w sobie problemu gracza — kontrola działa na runnerze CI. Dopiero przebiegi rzeczywistych gier pokażą, jak często objawy faktycznie występują.
- Dwie wcześniejsze próby miały włączoną retencję. Ostatni test usunął cztery pozostawione przez nie gry przed wykonaniem scenariusza; bieżąca gra została usunięta standardowo po odczycie artefaktu.

## Eksport przebiegów Control 2 — 2026-10-13

W Ustawieniach → Statystyki → Rozgrywki szczegóły przebiegów można pobrać jako JSON. Domyślnie eksport obejmuje dzisiejsze sesje Control 2 według lokalnej strefy czasowej przeglądarki; dostępne są też ostatnie 7 dni, 30 dni lub wszystkie załadowane rekordy (do 500 najnowszych). Eksport zachowuje pełne szczegóły sesji, w tym zdarzenia diagnostyczne. Archiwum i Control 1 nie są dołączane.

## Trwały dziennik urządzenia Display — 2026-10-13

Decyzja użytkownika: dodać dokładniejsze logowanie stanu Display po analizie
przebiegów z 13 października. Migracja369 zapisuje rzadkie zdarzenia do
`control2_device_events`: zmiany widoczności/fokusu strony, utratę i powrót
połączenia, widoczne zacięcia renderowania oraz błędy renderowania. Zdarzenia
wiążą się z aktywną sesją Control2 i są dołączane do `stats_detail.events`,
więc pojawiają się w szczegółach sesji oraz eksporcie JSON w panelu
administratora. Surowa tabela jest zablokowana dla właścicieli gier i zwykłych
klientów. Nie zapisujemy heartbeatów, tekstów błędów, IP ani fingerprintu
przeglądarki. Retencja surowej tabeli jest ograniczona do30 dni i500 ostatnich
zdarzeń na grę; sesyjna kopia podlega dotychczasowej historii statystyk.

Po wdrożeniu log można odczytać w Supabase SQL Editor, podstawiając lokalną
datę:

```sql
select g.name as gra, e.session_id, e.created_at, e.event_type, e.details
from public.control2_device_events e
join public.games g on g.id=e.game_id
where e.created_at >= ('2026-10-13 00:00:00'::timestamp at time zone 'Europe/Warsaw')
  and e.created_at <  ('2026-10-14 00:00:00'::timestamp at time zone 'Europe/Warsaw')
order by e.created_at;
```
