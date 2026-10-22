# Diagnostyka rozgrywki per sesja — plan

Stan: **plan do zatwierdzenia** (2026-10-22). Bez kodu i migracji do decyzji
użytkownika („wdrażamy”).

## Cel (decyzja użytkownika 2026-10-22)

- Jednostką logów i statystyk jest **konkretna sesja rozgrywki**, nie gra ani
  urządzenie. Zdarzenia jednej sesji nie mogą wypychać zdarzeń innej.
- Logi trzymane **dłużej** niż dziś (30 dni).
- Najważniejsze zdarzenia zapisane **trwale** (podsumowanie, które nie jest
  ucinane).
- Nowe sygnały, które pozwalają odróżnić przyczyny problemów (ekran zgasł,
  karta w tle, słabe łącze, problem systemu).
- Kolejność: **najpierw baza, która dobrze loguje**, potem skrypt
  w panelu admina, który z zapisanych danych podsuwa „Sugerowane problemy”.

## Stan obecny (audyt kodu do migracji 467)

Dwa magazyny, oba z wadami:

| Magazyn | Kto pisze | Problem |
|---|---|---|
| `game_sessions.stats_detail.events` (JSON w wierszu sesji) | Control: `control2_session_ping` (`sessionTelemetry.js`) — kategorie `connectivity`, `audio_start`, `audio_unlock`, `display_delay`, `state_sync`, `realtime` | Tylko **ostatnie 100** (395); każdy zapis przepisuje całą tablicę (`FOR UPDATE` + `jsonb_set`), więc podniesienie limitu obciąża bazę. |
| `control2_device_events` (369, 379, 391, 393, 466) | urządzenia i Control: `control2_display_event`, `control2_device_transport_event`, `control2_network_probe_event`, `control2_control_visibility_event`, wyzwalacz zmian blokady urządzeń | Ucinanie do **500 na grę** (nie na sesję) i **30 dni** przy każdym zapisie — wielokrotnie grana gra wypycha zdarzenia starszych sesji. |

Dodatkowo:
- Zdarzenia **przed startem gry** (krok Urządzenia, parowanie, odblokowanie
  dźwięku) przepadają: wszystkie zapisy szukają aktywnej `game_sessions`,
  a ta powstaje dopiero przy starcie. Nie ma powiązania `game_sessions` ↔
  `control_runtime_sessions`.
- Późne zdarzenia po zakończeniu sesji są odrzucane (395) — poprawnie.
- Panel admina (`/_admin_api/stats/detail?type=gameplay`,
  `admin-api.js:76`) ładuje do 200 sesji **razem ze wszystkimi zdarzeniami**
  i skleja oba magazyny w Workerze. Przy większych logach to będzie ciężkie.
- Usunięcie gry kasuje kaskadą sesje i oba logi (`usuwanie-danych.md`).
- `keep-alive.js` prosi o blokadę wygaszania ekranu (`wakeLock`), ale wynik
  nie jest nigdzie zapisywany.

## Projekt docelowy

### 1. Jedna tabela zdarzeń sesji

`control2_session_events` (nowa, append-only, wiersz = zdarzenie):

| Kolumna | Opis |
|---|---|
| `id` | identity |
| `runtime_session_id` | sesja uruchomienia Control (`control_runtime_sessions`) — zawsze; łapie też zdarzenia sprzed startu gry |
| `game_session_id` | sesja rozgrywki (`game_sessions`), `NULL` przed startem gry |
| `game_id` | do kaskady przy usunięciu gry |
| `source` | `control` / `display` / `host` / `buzzer` |
| `connection_id`, `epoch` | instancja urządzenia (rozróżnia przeładowania i drugie karty) |
| `category`, `event_type` | jak dziś (lista dozwolonych w CHECK) |
| `details` | jsonb, limit rozmiaru jak dziś, tylko dane techniczne |
| `client_at`, `created_at` | czas klienta i serwera (opóźnione zapisy po powrocie z tła) |
| `event_id` | deduplikacja ponowień (`UNIQUE (runtime_session_id, event_id)`) |

- `game_sessions.runtime_session_id` (nowa kolumna) ustawiana przy starcie
  gry — widok sesji pokazuje też część „przygotowanie” z tej samej sesji
  uruchomienia.
- Jedna wewnętrzna funkcja zapisu `_control2_session_event_insert(...)`;
  wszystkie istniejące RPC i wyzwalacz blokad piszą przez nią. Sygnatury RPC
  bez zmian (zgodność z działającym frontem).
- **Limit na sesję**, nie na grę: np. 3000 zdarzeń na sesję uruchomienia;
  po przekroczeniu szczegół nie jest zapisywany, ale podsumowanie (pkt 2)
  dalej liczy. Bez `DELETE … OFFSET` przy każdym zapisie.
- **Retencja szczegółów**: np. 180 dni (do decyzji), czyszczenie raz na dobę
  zadaniem cron zamiast przy każdym zapisie.

### 2. Trwałe podsumowanie sesji

`control2_session_diag` — jeden wiersz na sesję uruchomienia (i powiązaną
sesję gry), aktualizowany przez tę samą funkcję zapisu, **nigdy nie
ucinany** (żyje tak długo jak sesja):

- per urządzenie: liczba i łączny czas w tle, liczba zamrożeń/uśpień,
  przeładowań, utrat blokady (`expired`), drugich kart (`waiting`),
  przerw kanału i ich łączny czas, nadrobionych rewizji, spowolnień łącza
  (urządzenie / serwer) i najgorsze czasy, błędy odczytu i renderu,
  zacięcia animacji, odmowy blokady wygaszania ekranu, problemy z dźwiękiem;
- Control: czas zablokowanych akcji, błędy odczytu stanu urządzeń, czas
  w tle, spóźnione / brakujące potwierdzenia planszy;
- pierwsze i ostatnie wystąpienie każdej kategorii, liczba odrzuconych
  szczegółów (przekroczony limit).

To liczniki surowe, bez wniosków — wnioski robi skrypt (pkt 4), więc reguły
można poprawiać bez migracji.

### 3. Nowe sygnały (front + lista dozwolonych w RPC)

| Sygnał | Po co | Skąd |
|---|---|---|
| Blokada wygaszania ekranu: przyznana / odmowa / zwolniona przez system | „ekran mógł zgasnąć sam” (oszczędzanie baterii, przeglądarka bez obsługi) | `keep-alive.js` |
| `freeze` / `resume` (Chrome), `pagehide` / `pageshow` z `persisted` | odróżnia zamrożenie przez system, zamknięcie/przeładowanie i powrót z pamięci podręcznej od zwykłego ukrycia karty | wspólny moduł urządzeń |
| Długość przerwy liczona przy powrocie (czas od ostatniego sygnału życia) | zapis „ukryta” często nie dochodzi przed zamrożeniem — powrót niesie czas trwania | `device-lease.js` |
| Klasa urządzenia i rodzina przeglądarki (telefon/tablet/komputer/TV, Safari/Chrome/…) — zgrubnie, bez wersji i bez odcisku | wiadomo, że np. iPhone zamraża agresywnie | raz na połączenie |
| Tryb oszczędzania / poziom baterii (gdy przeglądarka podaje) | usypianie i dławienie timerów | raz na połączenie + zmiana |
| `online`/`offline` dla wszystkich urządzeń i Control (dziś tylko Wyświetlacz) | brak sieci po stronie urządzenia | wspólny moduł |
| Zdarzenia przed startem gry (parowanie, odblokowanie dźwięku, czekanie na urządzenia) | problemy przy przygotowaniu | po `runtime_session_id` |

Zasada z 2026-10-18 zostaje: tylko istotne zdarzenia, bez zwykłych
heartbeatów i ACK; diagnostyka best-effort, nigdy nie blokuje gry.

### 4. Panel admina i skrypt „Sugerowane problemy”

- Lista rozgrywek ładuje tylko **podsumowania** (pkt 2); pełny log jednej
  sesji osobnym endpointem `/_admin_api/stats/session-events?session_id=…`
  przy otwarciu przebiegu. Eksport JSON sesji zawiera log i podsumowanie.
- Moduł `web/settings/js/session-diagnosis.js` (czysta funkcja, testy unit
  na przykładowych sesjach): z podsumowania i zdarzeń wylicza sugestie
  z poziomem pewności i dowodami (lista zdarzeń), np.:
  - urządzenie uśpione / w tle (telefon) — ukrycie lub brak sygnału →
    utrata blokady → powrót, zamrożenie, odmowa blokady ekranu;
  - karta w tle na komputerze — ukrycie przy działającym sygnale życia;
  - zamknięcie / przeładowanie strony, ubita karta (`was_discarded`);
  - słabe łącze urządzenia / brak sieci / słabe łącze Control;
  - problem po stronie systemu — wolny serwer przy sprawnym łączu, błędy
    bazy, kilka urządzeń naraz przy dobrym łączu;
  - za słabe urządzenie — zacięcia animacji przy widocznej karcie;
  - dźwięk nieodblokowany, druga karta tego samego urządzenia.
- Sekcja „Sugerowane problemy” na górze okna przebiegu; zestawienie zbiorcze
  (odsetek sesji z danym problemem w okresie) w kafelku Rozgrywki — z samych
  podsumowań, bez ładowania logów.

## Etapy

0. **Odczyt objętości** (`db-read.yml`, tylko liczby): sesje Control 2
   dziennie, zdarzenia w `control2_device_events` na sesję (średnia, p95,
   maks.), ile sesji straciło zdarzenia przez limit 100/500. Ustala limit
   i retencję.
1. **Baza (migracja dodająca, zgodna wstecz)**: tabele z pkt 1–2,
   `game_sessions.runtime_session_id`, funkcja zapisu, istniejące RPC
   i wyzwalacz piszą **także** do nowej tabeli (stare magazyny bez zmian),
   przeniesienie istniejących danych (oba magazyny → nowa tabela, z
   przypisaniem do sesji tam, gdzie się da), cron retencji, GRANT dla
   `agent_reader` (tylko liczby). Test SQL na lokalnym Postgresie: zapis,
   limit na sesję, izolacja sesji tej samej gry, deduplikacja, kaskada przy
   usunięciu gry, uprawnienia (anon/klucz urządzenia/właściciel/admin).
   Push na `main`, log migracji, testy kontrolne statystyk Control.
2. **Nowe sygnały** (front urządzeń i Control + rozszerzenie list
   dozwolonych): e2e z kodem brancha na produkcyjnej bazie (statystyki
   Control 2, ukrycie karty, przeładowanie), potem Pages i kontrola.
3. **Panel admina**: endpoint logu sesji, podsumowania w liście, moduł
   sugestii z testami unit, sekcja w oknie przebiegu, zestawienie zbiorcze;
   sceny zrzutów (przebieg z sugestiami, zestawienie), e2e panelu punktowo.
4. **Sprzątanie** (osobna migracja po wdrożeniu 3): Control przestaje pisać
   do `stats_detail.events`, usunięte ucinanie 500/grę i stary odczyt
   `get_control2_display_events`.

## Pytania do decyzji

1. Retencja szczegółowych zdarzeń: 90 / 180 / 365 dni? (Podsumowanie żyje
   tak długo jak sesja.)
2. Usunięcie gry przez właściciela: diagnostyka znika razem z grą (jak dziś,
   zgodnie z `usuwanie-danych.md`), czy zostaje anonimowo (bez `game_id`,
   bez treści) do końca retencji?
3. Klasa urządzenia i rodzina przeglądarki w logach — zgoda? (Zgrubnie, bez
   wersji i bez danych identyfikujących; dotąd świadomie nie zapisywaliśmy
   danych przeglądarki.)
4. Limit szczegółów na sesję — proponowane 3000 (do potwierdzenia po etapie 0).

## Decyzje

- 2026-10-22: logi i statystyki per sesja, dłuższe przechowywanie, trwałe
  najważniejsze zdarzenia, nowe sygnały; najpierw baza, potem skrypt
  podsumowania (użytkownik).
- 2026-10-22 (odpowiedzi użytkownika):
  - pyt. 2: po usunięciu gry (i konta) diagnostyka **zostaje dla statystyk**
    — bez powiązania z grą (`game_id` → `NULL`) i bez treści gry (pytania,
    nazwy drużyn zostają tylko w `game_sessions`, które znikają z grą);
    dopisać do `usuwanie-danych.md` przy wdrożeniu;
  - pyt. 3: klasa urządzenia i rodzina przeglądarki — **zapisywać**
    (zgrubnie, bez wersji i danych identyfikujących);
  - pyt. 4: limit **3000** zdarzeń na sesję;
  - pyt. 1: szczegółowe zdarzenia trzymane **90 dni** od zakończenia sesji;
    podsumowanie sesji bez limitu.
