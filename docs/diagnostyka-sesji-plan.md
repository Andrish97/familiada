# Diagnostyka rozgrywki per sesja — plan

Stan: **wdrożone** (2026-10-22/23, etapy 1–4; przebiegi w Dzienniku
`docs/wdrozenia.md`).

- Etap 1 — migracja 468 + Worker: `control2_session_events` (limit 3000 na
  sesję, 90 dni, cron `control2-session-events-cleanup`), trwałe
  `control2_session_diag`, `game_sessions.runtime_session_id`, przeniesione
  dane obu starych magazynów.
- Etap 2 — migracja 469 + front: `control2_device_log` (urządzenia, główna
  instancja) i `control2_control_log` (Control), wspólny
  `web/shared/js/core/session-log.js`, nowe sygnały, zapis przed startem gry.
- Etap 3 — panel admina: `web/admin/js/session-diagnosis.js`, sekcja
  „Sugerowane problemy” w przebiegu i zestawienie nad tabelą rozgrywek.
  Odstępstwo od planu: bez osobnego endpointu logu sesji — przy obecnej
  objętości (średnio ~24 zdarzenia na sesję) lista rozgrywek niesie zdarzenia
  i podsumowania z jednej tabeli; eksport JSON zostaje kompletny.
- Etap 4 — migracja 470: usunięte `control2_device_events`, stare RPC zapisu
  i odczytu, `stats_detail.events`; zmiany blokad urządzeń wprost do zdarzeń
  sesji; `control2_session_ping(p_game_id)` tylko jako sygnał aktywności.
- Podczas aktywnej gry przejście Control → Wskazówki → Control jest dozwolone
  i nie kończy ani nie rozpoczyna sesji. Control zapisuje `page_lifecycle`
  `manual_open` i `manual_return` z tym samym `navigation_id`; powrót zawiera
  też `duration_ms`. Test sprawdza parowanie trzech przejść oraz jedną sesję.

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
| `online`/`offline` dla wszystkich urządzeń i Control | brak sieci po stronie urządzenia | wspólny moduł |
| Nieobsłużony błąd JS i odrzucona obietnica na Controlu, Hoście, Buzzerze i Wyświetlaczu | odróżnia awarię strony od braku aktywności lub błędnego użycia | wspólny logger sesji |
| Składniki nagrody zapisane w `stats_detail.prize_calculation` oraz kwota policzona przez Wyświetlacz | porównanie rachunku serwera i ekranu: punkty rund, finał, mnożnik, cel, kwota główna | trigger statystyk + `display/js/render.js` |
| Zdarzenia przed startem gry (parowanie, odblokowanie dźwięku, czekanie na urządzenia) | problemy przy przygotowaniu | po `runtime_session_id` |

Zasada z 2026-10-18 zostaje: tylko istotne zdarzenia, bez zwykłych
heartbeatów i ACK; diagnostyka best-effort, nigdy nie blokuje gry.

### 4. Panel admina i skrypt „Sugerowane problemy”

- Lista rozgrywek ładuje tylko **podsumowania** (pkt 2); pełny log jednej
  sesji osobnym endpointem `/_admin_api/stats/session-events?session_id=…`
  przy otwarciu przebiegu. Eksport JSON sesji zawiera log i podsumowanie.
- Moduł `web/admin/js/session-diagnosis.js` (czysta funkcja, testy unit
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
1. **Baza: przełączenie zapisu (bez podwójnych magazynów)**. Nowe tabele
   z pkt 1–2, `game_sessions.runtime_session_id`, funkcja zapisu. Istniejące
   RPC (te same sygnatury — działający front i otwarte karty dalej działają)
   i wyzwalacz blokad piszą **tylko** do nowej tabeli: koniec ucinania
   100/sesję i 500/grę od razu. `error_count` liczony z nowej tabeli.
   Przeniesienie istniejących danych z obu magazynów do nowej tabeli.
   Odczyt dla panelu z nowej tabeli (Worker `admin-api.js` przestaje sklejać
   `stats_detail.events` z `control2_device_events`) — migracja i Worker
   wdrażane razem. Cron retencji, GRANT dla `agent_reader`. Test SQL na
   lokalnym Postgresie: zapis, limit na sesję, izolacja sesji tej samej gry,
   deduplikacja, zachowanie po usunięciu gry, uprawnienia; kontrola
   produkcji: statystyki Control 2 i panel admina.
2. **Nowe sygnały** (front urządzeń i Control + rozszerzenie list
   dozwolonych): e2e z kodem brancha na produkcyjnej bazie (statystyki
   Control 2, ukrycie karty, przeładowanie), potem Pages i kontrola.
3. **Panel admina**: endpoint logu sesji, podsumowania w liście, moduł
   sugestii z testami unit, sekcja w oknie przebiegu, zestawienie zbiorcze;
   sceny zrzutów (przebieg z sugestiami, zestawienie), e2e panelu punktowo.
4. **Usunięcie starych mechanizmów** (migracja po wdrożeniu frontu z
   etapów 2–3, gdy żadna strona ich nie woła):
   - tabela `control2_device_events` (dane przeniesione w etapie 1) i jej
     ucinanie 500/grę + 30 dni w pięciu funkcjach i wyzwalaczu;
   - klucz `stats_detail.events` w `game_sessions` (wyczyszczony po
     przeniesieniu) i logika ucinania w `control2_session_ping`;
   - osobne RPC: `control2_display_event` (Wyświetlacz, `display/js/main.js:66`),
     `control2_control_visibility_event`, `control2_network_probe_event`,
     `control2_device_transport_event`, `control2_session_ping` w części
     zdarzeń → jedno RPC dla urządzeń i jedno dla Control (front przepięty
     w etapie 2);
   - `get_control2_display_events`, klucze zgodności `device_event_log`/
     `display_event_log` w Workerze i panelu;
   - GRANT 467 dla `agent_reader` na starą tabelę.

## Wynik etapu 0 (2026-10-22, db-read 39871943993)

`scripts/db-read/session-diag-volume.sql`, ostatnie 30 dni (z sesjami testów e2e):

- 124 sesje Control 2 w 45 grach (47 w ostatnich 7 dniach).
- Zdarzenia Control w sesji: średnio 13,5, p95 = **100 (limit)**, maks. 100;
  **9 sesji (7%) uciętych** do ostatnich 100 — początek ich przebiegu przepadł.
- Zdarzenia urządzeń w sesji: średnio 9,7, p95 31, maks. 226; 64 sesje bez
  żadnego zdarzenia urządzeń (część sprzed logowania urządzeń — najstarszy
  wpis 2026-10-14). Limit 500/grę jeszcze nie został osiągnięty.
- Tabela urządzeń: 1204 wiersze, średnio 359 B na zdarzenie.

Wniosek: limit 3000 na sesję ma duży zapas (najdłuższa sesja ~330 zdarzeń
łącznie); objętość przy 90 dniach to pojedyncze MB — bez ryzyka dla bazy.
Obecny limit 100 w Control realnie ucina co ~14. sesję.

## Realtime urządzeń — diagnoza 2026-10-23

Objaw: `game-state-realtime-spike.spec.js:197` czerwony na produkcji
(39917036457, 39915049987) i na nowym serwerze (api2, 39917039497): kanał
`postgres_changes` z tokenem z `device-realtime-token` jest SUBSCRIBED, odczyt
REST tym samym tokenem działa, a zmiana `game_state` nie przychodzi.
Urządzenia nadrabiały zmiany z heartbeatu lease (`fallback_catchup`).

Przyczyna (klient, nie baza ani serwer) — log `[e2e-diag]` z 39943834870:
- claims subskrypcji `postgres_changes` ustala token **z dołączenia do
  kanału**; późniejsze `access_token` ich nie zmienia (kanał na osobnym
  kliencie dołączony przed ustawieniem tokenu nie dostał zmiany, choć gniazdo
  miało już token urządzenia);
- `SupabaseClient` przekazuje realtime-js callback `accessToken`, więc
  `setAuth(token)` nie jest „ręczny” (`_manuallySetToken=false`) i po każdym
  dołączeniu realtime-js woła `setAuth()` → token sesji, u urządzenia **anon**
  (`same:false, role:anon, hasDevice:false`). Pierwsze dołączenie szło
  z tokenem urządzenia, ale każde **ponowne** (zerwane łącze, uśpienie,
  rejoin kanału) już jako anon: SUBSCRIBED, RLS odrzuca każdy wiersz po cichu;
- SUBSCRIBED przychodzi przed komunikatem systemowym „Subscribed to
  PostgreSQL”; zmiany z tej przerwy przepadały, a urządzenie wyłączało już
  dzwonek i odpytywanie. Spec czekał 500 ms; czerwone przebiegi miały zapis
  ~3,4 s po linku, zielony ~5,9 s.

Od kiedy: wada od wdrożenia transportu (375, 2026-10-15; spec zielony
38807831336 — pierwsze dołączenie przy wolniejszym zapisie). supabase-js
2.117.3 → 2.118.0 bez zmian w tej części; polityka RLS tylko w 375/376,
późniejsze zmiany heartbeat/lease (397, 424) nie dotykają ważności claims
(odczyt REST tym samym tokenem działa). Nadrabianie widać w statystykach od
2026-10-21, gdy 424 dało heartbeat z `game_rev` (db-read
`realtime-delivery-by-day.sql`, 39943839445: 21.10 — 5, 22.10 — 5,
23.10 — 10 nadrobień).

Naprawa (`web/shared/js/core/game-state-subscribe.js`, bez migracji): osobny
klient tylko dla kanału bezpośredniego z `accessToken` zwracającym token
urządzenia (także przy ponownym dołączeniu), `setAuth()` przed `subscribe()`,
kanał uznany za połączony dopiero po SUBSCRIBED **i** systemowym „ok”
postgres_changes (`direct-channel-ready.js`); do tego czasu działa
odpytywanie. Spec realtime robi to samo i sprawdza, że gniazdo trzyma token
urządzenia; pełna runda w `control2.spec.js` sprawdza `transport_state
connected postgres_changes` u Display/Host/Buzzer i brak `fallback_catchup`.

### Dodatkowa korelacja rewizji — 2026-10-25

Wielokrotne `fallback_catchup` nie rozstrzyga, czy Postgres Changes zgubił
wiadomość, czy dostarczył ją po progu 400 ms ustawionym dla dzwonka. Na
branchu dodano pomiary po numerze rewizji, bez zmiany transportu i bez
migracji:

- Control zapisuje `state_sync / doorbell_sent` z rewizją i lokalnym czasem
  wysłania;
- urządzenie zapisuje `fallback_catchup` z rewizją i progiem oczekiwania;
- jeśli później nadejdzie Postgres Changes, zapisuje
  `direct_after_fallback` z rewizją, źródłem fallbacku (`doorbell` albo
  `lease_heartbeat`) i czasem od fallbacku;
- gdy RPC faktycznie zastosuje nowszy stan, `fallback_applied` podaje
  `fetch_ms`, czas oczekiwania w kolejce (`received_ms`) i render (`render_ms`);
- nietypowo wolne bezpośrednie zdarzenia (`received_ms` ≥ 250 ms lub
  `render_ms` ≥ 500 ms) dostają `postgres_changes_slow`.

`client_time_ms` pochodzi z zegara urządzenia, więc nie należy porównywać go
między urządzeniami jak precyzyjnego czasu serwera. Rewizja łączy zdarzenia,
a czasy `*_ms` mierzą odstępy lokalne. Fazy `direct_after_fallback` i
`fallback_applied` pozwolą odróżnić opóźniony kanał od skutecznego odzyskania
stanu przez RPC; nie są same w sobie diagnozą przyczyny.

### Korekta progów po pomiarze E2E — 2026-10-25

Przebieg E2E `40246050244` ujawnił fałszywe nadrabianie przy widocznych,
aktywnych kartach: próg dzwonka 100 ms powodował 5–7 `fallback_catchup` na
urządzenie, mimo że Postgres Changes docierało około 179–350 ms później.
Próg watchdoga rewizji 250 ms oznaczał też stan `STALE` po około 298–326 ms
i niepotrzebne odtworzenie kanału. W równoległym sprawdzeniu serwera
Realtime nie było restartów ani błędów, więc te konkretne zdarzenia wynikały
z progów klienta, a nie z wykazanego błędu serwera.

Zmieniono próg dzwonka na 400 ms, a watchdoga rewizji na 700 ms. E2E
`40246357739` przeszedł: Display miał 0 nadrabiań, Host i Buzzer również
0; urządzenia odebrały odpowiednio 10, 10 i 29 natywnych ramek
Postgres Changes. Kontrolowane rozłączenie Display i wznowienie także
przeszły. To potwierdza poprawę w tym scenariuszu testowym; nie wyklucza
problemów sieci lub przeglądarki w historycznych sesjach użytkowników.

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
- 2026-10-22: stare mechanizmy logowania usunąć, nie utrzymywać obok
  nowych (użytkownik). Etap 1 przełącza zapis tylko na nową tabelę; etap 4
  usuwa stare tabele, RPC i klucze, gdy front już ich nie używa.
- 2026-10-24 (eksport rozgrywek z 24.10, polecenie użytkownika „popraw,
  wdróż swoje sugestie; popraw blokadę wygaszania w iOS”):
  - finał doszedł do `f_end`, a operator nie nacisnął „Zakończ” → sesja
    zamykana (bezczynność, restart, anulowanie z ustawień) jako `final`
    z doliczonymi punktami finału i `closed_by`; poprawka wsteczna (483);
  - potwierdzenie planszy: znaczniki serwera `requested_at`/`rendered_at`
    (483), Control odpytuje bazę od czasu animacji + 0,3 s i raz przed
    alarmem `ack_timeout`; `display_ack_ms` w `late_ack`;
  - blokada wygaszania: odmowa (Safari iOS bez gestu) i zwolnienie przez
    system ponawiane przy najbliższym geście (`keep-alive.js`).
- 2026-10-25 (eksport 7 dni z 25.10, polecenie użytkownika „zbadaj i zrób
  wszystko”): pomiar potwierdzenia planszy liczony od rewizji nadanej przez
  serwer (`__target_rev` wiersza optymistycznego; bramka Control bez zmian);
  limit 1,2 s na sygnał startu animacji liczony od potwierdzenia zapisu
  Control (twardy limit 3 s bez potwierdzenia), `since_request_ms`;
  `AbortError` z obsługi wiersza nie jest błędem renderu.
- 2026-10-25 (polecenie użytkownika: Control ma działać przy słabym
  internecie, „zbadać dokładnie”): raport `docs/control2-slabe-lacze.md`.
  Dzwonek Control zawsze sprawdzany przez urządzenia (0,4 s na kanał, potem
  RPC); blokada tylko w `game_state_write` (bez `set_lock` po akcji);
  migawka urządzeń z `game_rev` i potwierdzeniem (484); limit 15 s na zapis
  i `hydrate()` po błędzie sieci; e2e słabego łącza (+700 ms).
