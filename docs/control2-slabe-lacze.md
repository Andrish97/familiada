# Control 2 na słabym łączu — badanie 2026-10-25

Polecenie użytkownika: „Control to najważniejszy moduł; nie działa do końca
tak, jak powinien, a nie przesyła dużo danych — ma działać nawet przy słabym
internecie. Zbadać dokładnie.”

Źródła: eksporty rozgrywek z 24.10 i 7 dni z 25.10 (64 sesje), odczyty
produkcji `db-read` (`game-state-size*.sql`, `server-health.sql`), kod
Control, urządzeń i funkcji bazy.

## Wnioski

1. **Rozmiar danych nie jest problemem.** Wiersz `game_state` ma średnio
   1,2 KB, 95% do 6,4 KB, największy 9,7 KB (73 gry z 30 dni). Na słabym
   łączu liczy się liczba **kolejnych podróży** do serwera i czas czekania
   na zgubione zdarzenia, nie przepustowość.
2. **Zgubione zmiany czekały 3–6 s.** Urządzenia z połączonym kanałem
   bezpośrednim (`postgres_changes`) **ignorowały dzwonek** Control, więc
   zmiana zgubiona przez Realtime docierała dopiero z heartbeatu lease
   (co 3 s, wykrycie po dwóch). Eksport 7 dni: 22 takie nadrobienia
   Wyświetlacza, 6 Prowadzącego; spóźnione plansze 4–15 s przy widocznym
   Wyświetlaczu.
3. **Każda akcja z blokadą to były dwie kolejne podróże Control.** Blokada
   jest już w `game_state_write` (`p_lock_ms`, `computeCommitGate`), ale
   `armLock` wysyłał jeszcze `game_state_set_lock` i trzymał przyciski do
   jego odpowiedzi. Przy RTT 1–2 s to 2–4 s blokady na akcję, a druga zmiana
   wiersza szła przez Realtime do wszystkich urządzeń.
4. **Control wiedział o naciśnięciu Przycisku tylko z dzwonka** (broadcast).
   Zgubiony dzwonek (np. chwilowo zerwane gniazdo) = Control nie widzi
   zgłoszenia do następnej zmiany.
5. **Zapis Control nie miał limitu czasu**, a błąd sieci zostawiał lokalny,
   optymistyczny stan (panel inny niż Wyświetlacz) i surowy komunikat
   „Błąd: TypeError…”.
6. **Limit sygnału startu animacji (1,2 s) liczony od kliknięcia** obejmował
   zapis Control, dzwonek i odczyt Wyświetlacza — 10–25% dźwięków ruszało
   przed animacją (naprawione 25.10 rano, `start_signal_timeout`).
7. Telefony (iPhone, Safari) chowają stronę na 10–25 s (blokada ekranu,
   przełączenie aplikacji): lease wygasa, urządzenie wraca z nową epoką,
   pierwszy odczyt i token kanału idą jeszcze starą epoką — ~1 s przerwy
   i błędy w diagnostyce (`read_error`, `FunctionsHttpError`). Samo się
   naprawia; do wygładzenia osobno.
8. Baza: 10% transakcji wycofanych (84,7 tys. / 766 tys. od restartu
   23.10) — `server-health.sql`. Bez `pg_stat_statements` nie da się
   przypisać ich do funkcji; do zbadania osobno (część to celowe odmowy:
   `locked`, `stale_write`, `forbidden`, `display still rendering`).

## Przepływ jednej akcji (z dźwiękiem)

Przed:

1. Control: `game_state_write` (podróż 1), przyciski zablokowane.
2. Control: `game_state_set_lock` (podróż 2), przyciski dalej zablokowane;
   druga zmiana wiersza → Realtime do wszystkich urządzeń.
3. Control: dzwonek `{rev}` (HTTP) — urządzenia z kanałem bezpośrednim go
   pomijały.
4. Wyświetlacz: wiersz z `postgres_changes`; gdy zgubiony — heartbeat lease
   (3–6 s) + `game_state_get`.
5. Wyświetlacz: animacja, `game_state_display_complete` (trzecia zmiana
   wiersza → Realtime do wszystkich).
6. Control: potwierdzenie z kanału `game_state_display_completion` albo
   odpytywania.

Po:

1. Control: `game_state_write` z blokadą (jedna podróż, limit 15 s; błąd
   sieci → `hydrate()` i komunikat).
2. Control: dzwonek `{rev}`.
3. Urządzenie: wiersz z `postgres_changes`; gdy nie przyjdzie w 0,4 s od
   dzwonka — od razu `game_state_get` (`doorbell-guard.js`), dwie wpadki
   z rzędu → odbudowa kanału.
4. Wyświetlacz: animacja, potwierdzenie.
5. Control: potwierdzenie z kanału, z odpytywania od czasu animacji
   + 0,3 s albo z migawki urządzeń co 750 ms (484).
6. Naciśnięcie Przycisku: dzwonek albo — gdy zgubiony — migawka urządzeń
   (`game_rev`, dwa odczyty z rzędu, gdy Control nic nie zapisuje).

## Zmiany (25.10)

| Zmiana | Pliki |
|---|---|
| Dzwonek jako siatka kanału bezpośredniego (0,4 s, potem RPC; diagnostyka `fallback_catchup` z `trigger: doorbell`) | `web/shared/js/core/doorbell-guard.js`, `game-state-subscribe.js`, unit `doorbellGuard.test.js` |
| Blokada bez drugiego zapisu (`armLock` bez `set_lock`) | `web/control/js/app.js` |
| Migawka urządzeń z `game_rev` i potwierdzeniem (migracja 484), nadrabianie zgubionej cudzej zmiany (`snapshot_catchup`) | `supabase/migrations/2026-10-25_484_control_snapshot_game_rev.sql`, `presence.js`, `app.js`, `store.js` (`writing()`), test SQL `docs/sql/test-control-snapshot-484.sql` |
| Limit czasu zapisu 15 s, `hydrate()` po błędzie sieci, komunikat PL/EN/UK | `persist.js`, `app.js`, `translation/*/control.js` |
| Test e2e słabego łącza (+700 ms na każde zapytanie REST, zerwany zapis) | `tests/e2e/control2.spec.js` |

## Wdrożenie i pomiar

Migracja 484 (OK 07:03:04), Pages 40172168296, e2e brancha 40171769425 i
produkcji 40172214348 zielone. Test słabego łącza (+700 ms na każde
zapytanie REST Control i urządzeń): zgłoszenie Przyciskiem → zatwierdzone
5,2 s, odsłonięcie → kolejna akcja 4,4 s (w tym ~1,8 s animacji z dźwiękiem).

## Tematy osobne (25.10, polecenie użytkownika „popraw te osobne tematy”)

1. **Powrót telefonu po wygaśnięciu lease.** Subskrypcja i lease reagowały
   na `visibilitychange` równolegle: odczyt stanu i token kanału szły starą
   epoką (odmowa, `FunctionsHttpError`). Teraz `beforeResync` →
   `lease.refresh()` (czeka na heartbeat w toku) i dopiero potem resync
   (`device-lease.js`, `game-state-subscribe.js`, trzy strony urządzeń).
   e2e: „Przycisk wraca z tła po wygaśnięciu lease bez odmowy odczytu
   i tokenu” (zamrożony heartbeat = zapytania wiszą).
2. **Potwierdzenie Wyświetlacza bez zmiany `game_state`.** Przycisk słucha
   `game_state_display_completion` (`onDirectTables`, RLS 376) i od razu
   sprawdza gotowość; migracja 486 usuwa lustro `display_rendered_rev`
   (kolumna zostaje, nieaktualizowana). Na akcję z dźwiękiem wiersz
   `game_state` zmienia się raz (był trzy razy przed 25.10: zapis,
   `set_lock`, potwierdzenie). Test SQL `docs/sql/test-display-complete-486.sql`.
3. **Wycofane transakcje.** `pg_stat_statements` jest zainstalowane, ale nie
   liczy zapytań zakończonych błędem; `track_functions` wyłączone. Odczyty
   `scripts/db-read/rollback-sources.sql`: bez żadnej gry Control baza
   wycofuje ~1 transakcję na 10 s (1,4% w 149 s bezczynności), średnio od
   restartu 0,68/s — to głównie tło usług i celowe odmowy, nie błędy
   Control. Pomiar w czasie gier e2e (10:16–10:25, Control + 3 urządzenia, 4 testy): 3 wycofania na 4203 zatwierdzenia (0,07%) — Control nie jest źródłem; historyczne 10% (87 tys. od restartu 23.10) powstało w jakimś wcześniejszym okresie. Dokładne przypisanie
   do funkcji wymaga logów serwera bazy (`log_min_error_statement`) —
   dostęp ma właściciel.

4. **Nieudane wczytanie modułu = martwa strona urządzenia.** Kontrola
   produkcji 40185039280: 503 na `game-state-subscribe.js` tuż po
   wdrożeniu zatrzymał cały graf modułów Przycisku (bez komunikatu; Control
   czekał na urządzenie). Na słabym łączu to samo daje zgubione żądanie
   przy otwieraniu. `module-boot-guard.js` (zwykły skrypt przed modułami
   Control, Wyświetlacza, Prowadzącego i Przycisku): przeładowanie po 1/3/8 s,
   potem `#deviceLoadError` z „Odśwież”. e2e z wymuszonym 503.

## Do zrobienia osobno

- Usunąć kolumnę `game_state.display_rendered_rev` (sprzątanie po 486,
  gdy stare karty urządzeń wygasną).
- Po kolejnym eksporcie: liczba `fallback_catchup` z `trigger: doorbell`
  vs `lease_heartbeat`, `snapshot_catchup`, czasy `late_ack`
  z `display_ack_ms`.
