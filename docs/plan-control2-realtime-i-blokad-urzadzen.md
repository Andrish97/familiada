# Plan: Realtime i blokady instancji urządzeń w Control v2

**Status:** wdrożenie etapowe w toku (2026-10-15). Migracje 371–373 rejestru lease, fencing RPC i zgodności starego Buzzera są na produkcji. Aktywne sesje protokołu 1 nadal używają starej ścieżki. Klient jest w PR #97. Test kolejki dla Display/Host/Buzzer przechodzi. Pełny Control 2 E2E przed poprawką: 26/32 zaliczonych; wykryto utratę zabezpieczeń `locked_until` i `physicalBuzzer` w zastąpionym RPC Buzzera. Migracja 374 oraz asercje SQL przywracają oba warunki. Po poprawce ponawiam sześć nieudanych scenariuszy, a następnie cały filtr Control 2. Nie wdrażać klienta, dopóki pełna regresja nie przejdzie.

**Środowisko wdrożenia:** jedna produkcyjna baza. Branch daje osobny kod do testów E2E, nie osobną bazę. Testy muszą używać przeznaczonych do tego kont i tworzonych przez nie gier/sesji w produkcyjnej bazie, po czym sprawdzać zapis i sprzątać dane zgodnie z workflow. Nie ma osobnej piaskownicy Supabase.

## Cel

Przyspieszyć i uodpornić synchronizację Control v2, bez zmiany sposobu łączenia dla użytkownika: nadal wybiera urządzenie, wpisuje sześciocyfrowy kod albo otwiera link.

W każdej aktywnej sesji Control ma być najwyżej jedna instancja główna każdego typu urządzenia: Display, Host i Buzzer. Dodatkowe instancje pozostają połączone jako oczekujące, wysyłają heartbeat i automatycznie przejmują rolę po zwolnieniu lub wygaśnięciu blokady. Potwierdzenia mają wskazywać konkretną instancję, żeby ekran oczekujący nie mógł odblokować akcji ekranu głównego.

**Udostępnianie pozostaje bez zmian:** operator nadal kopiuje ten sam link z panelu albo podaje ten sam sześciocyfrowy kod. Token daje prawo do połączenia; nie przydziela samodzielnie roli głównej. Pierwsza instancja, która poprawnie zarejestruje się w bazie, staje się główna, kolejne czekają. To zabezpieczenie na wypadek powielenia linku lub otwarcia kilku kart, bez dodatkowych kroków dla zwykłego użytkownika.

## Stan obecny

### Łączenie i udostępnianie

- Control v2 odnawia sesję runtime przez `control_runtime_session_touch`. Aktywna sesja wygasa po godzinie bez aktywności operatora; heartbeat urządzeń nie odnawia jej.
- Dla bieżącej sesji powstaje token parowania na każdy typ urządzenia (`control_device_link_tokens`). Udostępnienie odbiorcy ma osobny token i może być cofnięte (`control_device_shares`). Ważność tokenu zależy od aktywnej sesji.
- Link przechodzi przez `/go/`, który sprawdza token i przekierowuje do strony urządzenia. Kod sześciocyfrowy rozwiązuje się przez istniejący RPC do tego samego dostępu urządzenia. Użytkownik nie powinien otrzymać nowego kroku w procesie.
- Urządzenia są anonimowe. Klucz jest przekazywany do zabezpieczonych RPC; `control_device_key_valid` sprawdza token, typ, aktywną sesję i cofnięcie udostępnienia.
- Aktualny `device_id` obecności jest trwały w `localStorage` i wspólny dla kart tego samego typu w profilu. `browser_context_id` również jest współdzielony przez karty. Nie wystarcza to do rozróżnienia dwóch otwartych instancji Displaya.
- `device_ping` zapisuje `device_presence` pod kluczem `(game_id, device_type, device_id)` i nadpisuje timestamp/metadane tego samego urządzenia. Ten model mówi, czy dany typ niedawno zgłosił obecność, ale nie przechowuje kolejki kart ani nie rozstrzyga, która z nich jest właścicielem zasobu.
- Kod sześciocyfrowy z migracji `203_device_connect_codes` jest warstwą lookup do klucza urządzenia. Link bezpośredni z panelu prowadzi przez token sesji; odbiorca ma osobny token w `control_device_shares`. Rejestracja instancji powinna korzystać z rozpoznanego klucza i typu, bez zmiany tych wejść.

### Stan gry i synchronizacja

- `game_state` jest autorytatywnym stanem gry. Control zapisuje go przez `game_state_write`; Buzzer zapisuje naciśnięcie przez `game_state_buzzer_press`.
- Po zapisie klient wysyła krótkotrwały Broadcast `rev`. Display, Host i Buzzer pobierają wtedy pełny stan przez `game_state_get`. Mają też odpytywanie awaryjne co 5 s oraz resynchronizację po wznowieniu karty lub sieci.
- Tabela `game_state` jest już w publikacji Realtime i ma `REPLICA IDENTITY FULL`. Bezpośredni anonimowy `postgres_changes` został świadomie zablokowany migracją 261: zwykły JWT anon nie pozwala RLS sprawdzić klucza przekazanego jako argument RPC.
- `device_presence` jest osobnym heartbeat’em. Urządzenia pingują co 3 s, a Control odpytuje obecność co 750 ms. Stan połączenia, obecność i stan rozgrywki są dziś odrębnymi mechanizmami.

### Potwierdzenia

- Trigger aktualizuje `game_state_display_completion.requested_rev` po zmianie kroku lub sekwencji dźwięku. Display zapisuje zakończony render przez `game_state_display_complete`.
- `game_state_display_completion` ma jeden wiersz na grę, nie na instancję Displaya. Potwierdzenie dowolnego Displaya może więc obecnie wyglądać jak potwierdzenie wszystkich ekranów.
- Control czyta potwierdzenie co 500 ms; Buzzer co 500 ms pyta `game_state_display_is_ready`.
- Start animacji Displaya jest osobnym ulotnym Broadcastem `display_transition_started`; Control czeka maksymalnie 1,2 s, po czym uruchamia dźwięk awaryjnie.
- Buzzer nie ma osobnego potwierdzenia „odebrałem/wyświetliłem rewizję”. Jego naciśnięcie jest za to już autorytatywną zmianą `game_state`.

## Docelowe reguły

1. Slot główny jest przypisany do `(session_id, device_type)`. Każda karta/instancja ma własne `connection_id`.
2. Pierwsza instancja, której żądanie baza przyjmie w transakcji, zostaje główna. Przy niemal równoczesnych otwarciach kolejność ustala baza, nie zegar urządzenia.
3. Pozostałe instancje mają stan `waiting`, nadal wysyłają heartbeat i słuchają zmian swojej roli. Nie renderują aktywnej planszy, nie odtwarzają dźwięków i nie wykonują akcji urządzenia.
4. Zamknięcie głównej instancji zwalnia slot best-effort. Jeśli karta lub sieć znikną bez zwolnienia, lease wygasa po braku heartbeatów. Baza promuje najstarszą nadal aktywną instancję oczekującą.
5. Jeśli nie ma żywego kandydata żadnego typu, Control uruchamia obecne zachowanie przy utracie urządzenia: pokazuje brak urządzenia i blokuje akcje zgodnie z obecnymi regułami.
6. Każda promocja zwiększa `epoch`/token fencing. Stara instancja nie może po utracie slotu zapisać naciśnięcia, potwierdzenia renderu, startu dźwięku ani odblokowania audio.
7. Po promocji nowego Displaya unieważnia się poprzedni stan odblokowania audio i tworzy nowe żądanie. Nowy ekran pokaże istniejący przycisk odblokowania dźwięku; przeglądarka nadal wymaga gestu użytkownika.
8. Buzzer pozostaje atomowym zapisem do `game_state`; status synchronizacji Buzzera służy diagnostyce, nie blokuje rozgrywki.
9. Realtime nie zmienia logiki gry ani nie zastępuje RPC mutujących stan. Jest transportem zdarzeń i potwierdzeń.

### Zachowanie oczekującego urządzenia

Blokada ma być widoczna i zrozumiała, jak blokada zasobu w edytorze, ale nie ma odrzucać połączenia ani wymagać ponownego wpisania kodu.

- Drugie urządzenie po poprawnym połączeniu zostaje na swojej stronie i pokazuje pełnoekranowy overlay z komunikatem, np. „Dla tej sesji jest już otwarty Display. Jeśli chcesz korzystać z tego ekranu, zamknij poprzedni Display — wtedy ten aktywuje się automatycznie”.
- Ekran pozostaje połączony, odnawia heartbeat i czeka na informację o zwolnieniu/promocji. Nie pokazuje planszy gry, nie odtwarza dźwięku i nie przyjmuje akcji właściwych dla danego urządzenia.
- Overlay pokazuje stan oczekiwania, a w razie potrzeby także informację, że główne urządzenie utraciło połączenie i trwa oczekiwanie na wygaśnięcie blokady. Nie prosi o ponowne parowanie ani ręczne odświeżenie.
- Gdy baza przyzna instancji rolę główną, overlay znika i urządzenie samo pobiera aktualny stan gry, renderuje właściwy ekran i przechodzi do normalnej pracy.
- Jeśli oczekujący ekran zostanie zamknięty, jego heartbeat ustaje i jest usuwany z kolejki po wygaśnięciu TTL. Nie może przejąć slotu później.
- Analogiczny overlay i automatyczne przejęcie obowiązują dla Hosta i Buzzera; tekst komunikatu i zachowanie po promocji są właściwe dla typu urządzenia.

## Projekt techniczny

### Co dokładnie robi obecna baza

- `control_runtime_sessions`: jedna aktywna sesja runtime na grę (unikalny indeks częściowy `game_id WHERE ended_at IS NULL`), właściciel i czas wygaśnięcia. `control_runtime_session_touch` odnawia ją po aktywności operatora; osobny cron zamyka wygasłe sesje. Heartbeat urządzenia nie odnawia sesji.
- `control_device_link_tokens`: jeden token na `(session_id, device_type)`, używany przez operatora do linku/kodu urządzenia. `control_device_shares`: osobny token/grant na odbiorcę, typ i sesję, z `revoked_at`. Obie tabele są niedostępne bezpośrednio dla anon/authenticated; funkcje SECURITY DEFINER wykonują walidację.
- `control_device_key_valid(game_id,type,key)` sprawdza token właściciela albo niewycofany token odbiorcy oraz niezamkniętą, niewygasłą sesję. To już jest właściwa wspólna bramka do wszystkich RPC urządzeń. Nowy rejestr nie powinien zmieniać rozwiązywania kodu/linku ani sposobu cofania grantów.
- `device_presence` to telemetria ostatniego heartbeat’u, nie blokada zasobu. Obecny klient wysyła go co 3 s; Control czyta tabelę co 750 ms, wybiera najnowszy wiersz danego typu i uznaje urządzenie za online przez 6,5 s. Ponieważ identyfikator trwały jest współdzielony kartami, dwie karty potrafią nadpisywać ten sam wiersz.
- `game_state` jest źródłem prawdy dla rozgrywki. Zapis Control i atomowy zapis Buzzera są osobnymi RPC; Realtime Broadcast `rev` tylko budzi klientów do pobrania stanu. Nie należy zapisywać statusu kolejki ani heartbeatów do `game_state`.
- `game_state_display_completion` ma agregat na grę (`requested_rev`, `rendered_rev`), nie na kartę. Trigger generuje żądanie po zmianie kroku/dźwięku, a zabezpieczenia przejścia czytają agregat. W modelu wielu ekranów wyłącznie aktualny Display główny może przesuwać potwierdzenie.
- `control2_device_events` to ograniczony dziennik zdarzeń diagnostycznych Displaya. Nie jest obecnością ani kanałem stanu, ale może później przyjmować zdarzenia awansowania/odrzucenia, jeśli potrzebujemy audytu incydentów.

### Docelowy model danych kolejki

Linki i granty pozostają tabelami uprawnień. Nowy model zapisuje osobno **otwarte instancje** i **wyłączne prawo do działania**:

1. `control_device_connections` — jeden rekord na jedną załadowaną kartę. Proponowane pola: UUID `id` (nowy dla każdego dokumentu), `session_id`, `game_id`, `device_type`, `credential_kind`/id grantu do diagnostyki, `requested_at` nadawany przez DB, `last_seen_at`, `released_at`, `state` (`waiting|primary|released|expired|revoked`), `epoch`, `page_visibility`, `focused`, `received_rev`, `rendered_rev`, `started_sound_cue_seq`. Token sekretu nie trafia do tabeli kolejki ani Realtime payloadu.
2. `control_device_slots` — jeden rekord na `(session_id, device_type)`, z `game_id`, `primary_connection_id`, monotonicznym `epoch`, `lease_expires_at` i czasem aktualizacji. `session_id` jest zakresem, bo blokada ma dotyczyć bieżącej sesji Control; `game_id` służy walidacji i filtrowaniu. Constraint/klucz główny gwarantuje jeden slot.
3. Opcjonalne zdarzenia audytowe tylko wtedy, gdy potrzebne: `claimed`, `queued`, `promoted`, `released`, `lease_expired`, `revoked`, z `connection_id`, `epoch` i czasem DB. Bieżący status nie wymaga tabeli zdarzeń; najpierw można oprzeć overlay na stanie połączenia i slota.


Constraints: `device_type` ma CHECK na trzy typy; `(session_id,device_type)` jest PK slotu; `connections` ma FK do sesji/gry z `ON DELETE CASCADE`, status CHECK oraz indeks częściowy unikalny dla primary per sesja/typ. Slot wskazuje primary przez FK do połączenia; ponieważ zgodność `session_id/device_type/game_id` nie wynika z pojedynczego FK, pilnuje jej jedna funkcja DB aktualizująca slot i status połączenia w tej samej transakcji. Obie tabele nie są bezpośrednio czytelne/zapisywalne przez anon; klient używa RPC o najmniejszych możliwych odpowiedziach. Usunięcie gry/sesji kaskadowo sprząta kolejkę i slot.

Kolejność kolejki jest `requested_at, id`, oba rozstrzygane przez DB. Na żądaniu rejestracji transakcja blokuje wiersz slota (`SELECT ... FOR UPDATE`), sprawdza bieżący grant/sesję, oznacza nieżywe połączenia jako expired, a następnie albo przyznaje slot albo nadaje `waiting`. Rejestracja jest idempotentna dla tego samego `connection_id`, aby retry HTTP nie dodał go drugi raz; reload generuje nowe ID. W ten sposób nawet wiele równoczesnych kart ma jedno rozstrzygnięcie serializowane przez bazę. Indeksy kolejki powinny zaczynać się od `(session_id, device_type, state, requested_at, id)`; indeksy TTL od `last_seen_at`/`lease_expires_at`.

Heartbeat także blokuje slot i wykonuje uzgodnienie stanu w tej samej transakcji. Jeśli primary nadal ma świeży lease, odświeża go. Jeśli lease wygasł, jego epoch jest unieważniany, a najstarszy waiting z heartbeatem w limicie zostaje primary z nowym epoch. Gdy brak kandydata, slot staje się pusty. Kolejny heartbeat/rejestracja może go wtedy przejąć. Dzięki temu nie potrzeba osobnego procesu, który musi w idealnej chwili obsłużyć promocję; UI oczekującego sprawdza stan przez Realtime albo krótkie odpytywanie status-RPC. `pagehide` robi tylko best-effort release; correctness zapewnia lease.

Wszystkie RPC urządzenia zmieniające grę lub potwierdzenia przyjmują `connection_id` i `epoch` oraz atomowo sprawdzają, że instancja nadal jest primary dla swojego slota. Sam poprawny link nie wystarcza do wykonania akcji, jeśli karta jest `waiting`, stara albo została cofnięta. Dzięki temu opóźniona karta po wznowieniu z tła nie odzyska sterowania.

### Semantyka wygaśnięcia i zachowania kolejki

- Początek kolejki to pierwsza poprawna rejestracja w DB, nie moment kliknięcia linku ani lokalny zegar klienta.
- Awaria sieci, zamknięcie procesu lub uśpienie karty zatrzymuje heartbeat. Po wspólnym TTL rekord przestaje być kandydatem; primary zostaje promowany automatycznie przy następnym uzgodnieniu.
- Zamknięcie głównego z aktywną siecią najpierw wywołuje `release`, co skraca oczekiwanie. Jeśli żądanie nie dotrze, działa timeout.
- Powracająca stara karta nie odzyskuje automatycznie roli. Po wygaśnięciu swojego epoch wraca jako nowa pozycja na końcu kolejki albo pozostaje nieaktywna i wymaga ponownego otwarcia — kontrakt UI należy ustalić przed implementacją. Rekomendacja: ponowna rejestracja na końcu kolejki.
- Odwołanie grantów lub koniec sesji nie jest zwykłym timeoutem: połączenia tego grantu są od razu `revoked`; nie wolno promować ich ponownie.
- Waiting heartbeat utrzymuje pozycję wyłącznie gdy karta żyje. Overlay wyjaśnia, że istnieje już główne urządzenie i radzi zamknąć poprzednie, jeśli użytkownik chce używać tego ekranu. Zamknięcie starego powoduje automatyczne przejęcie bez ponownego kodu/linku.

### A. Rejestr instancji i lease głównego urządzenia

Dodać dedykowane tabele, zamiast używać bez zmian blokad edytora z `resource-lock.js`:

- `control_device_connections`: jeden wiersz na konkretną otwartą instancję; zawiera `game_id`, `session_id`, `device_type`, losowe `connection_id`, `requested_at`, `last_seen_at`, rolę `primary|waiting`, bieżący `epoch` i postęp synchronizacji.
- `control_device_slots`: jeden wiersz na `(session_id, device_type)`; zawiera `game_id`, główną `connection_id`, `epoch` i `lease_expires_at`.

Rejestracja, wybór głównego, zwolnienie i promocja są RPC transakcyjnymi blokującymi wiersz slotu (`FOR UPDATE`). Kolejka wybiera najstarsze żądanie z aktualnym heartbeat’em. Unikalny klucz slotu uniemożliwia dwóch głównych. Wszystkie modyfikacje sprawdzają istniejący token urządzenia i aktywną sesję/udostępnienie. W tabeli instancji można przechować prywatne `credential_kind` i `credential_id` (właścicielski link albo grant odbiorcy); nie przechowujemy surowego tokenu ani nie udostępniamy tych pól klientom. RPC nadal waliduje klucz podany przez kartę i wiąże go z tym samym źródłem dostępu.

`connection_id` musi być nowy dla każdej otwartej strony, a nie zapisany wspólnie w `localStorage`. Rozważyć losowy identyfikator generowany przy starcie dokumentu oraz best-effort release przy `pagehide`. Ostatecznym zabezpieczeniem pozostaje lease serwerowy, nie zdarzenie zamknięcia karty.

Heartbeat głównej i oczekujących instancji odświeża ich `last_seen_at`. Próg wygaśnięcia powinien być wspólną konfiguracją z progiem offline; obecnie heartbeat to 3 s, a próg online 6,5 s. Nie mogą istnieć dwa rozbieżne timery, które powodują jednoczesną promocję i komunikat o zerwaniu.

### B. Bezpieczne `postgres_changes`

- Wymienić token linku/kodu na krótko ważny, podpisany JWT Realtime bez dodatkowego działania użytkownika. Claims zawierają wyłącznie zakres: `game_id`, `device_type`, `session_id`, `connection_id`, `epoch`, termin ważności i rolę DB.
- JWT podpisuje zaufany backend. Repo nie wskazuje obecnie skonfigurowanego sekretu podpisującego Realtime; trzeba go dostarczyć z sekretów infrastruktury. Nigdy nie używać `service_role` jako tokenu klienta ani nie umieszczać sekretu w JS.
- RLS dla `game_state` dopuszcza zdarzenia tylko dla podpisanej, aktywnej sesji i gry. Polityka sprawdza również, czy połączenie jest główne, zanim udostępni pełny stan. Nie przywracać szerokiego SELECT dla `anon`.
- Device wykonuje początkowy `game_state_get`, subskrybuje `postgres_changes`, po potwierdzeniu subskrypcji ponownie pobiera stan, a później stosuje wiersze rosnące po `rev`. To zamyka lukę między bootstrapem a podłączeniem.
- Po utracie kanału urządzenie odnawia JWT i resynchronizuje stan. Pozostaje wolniejsze odpytywanie RPC jako zabezpieczenie oraz natychmiastowa resynchronizacja po `visibilitychange`, `pageshow` i `online`.
- Stary Broadcast `rev` utrzymać na czas migracji i wycofać dopiero po przejściu klientów na nowy transport.

### C. Potwierdzenia instancji i obecność

Do wiersza instancji (`control_device_connections`) dodać monotoniczne pola postępu, aktualizowane przez zabezpieczone RPC:

- `received_rev` — instancja przyjęła stan;
- `rendered_rev` — Display zakończył animację/audio; Host i Buzzer mogą raportować zakończenie lokalnego renderowania;
- `started_sound_cue_seq` — Display przygotował i rozpoczął konkretną sekwencję dźwięku;
- `last_seen_at`, `visibility`, `focused` — diagnostyka i wybory online/offline.

Zmiany są wysyłane przez Realtime. Control widzi główną i oczekujące instancje, a urządzenia widzą własny status/awans. Dane synchronizacji nie zapisują się do `game_state` i nie zmieniają `rev` rozgrywki.

Potwierdzenie Displaya sprawdzane przez Control i `game_state_display_is_ready` dla Buzzera musi pochodzić od bieżącej głównej instancji i jej `epoch`. Trigger `request_display_completion` nadal wyznacza `requested_rev`, a `guard_final_display_completion` blokuje niedozwolone przejścia do czasu potwierdzenia. Można zachować istniejącą tabelę jako żądanie rewizji lub migrować jej agregat; nie może już być jedynym źródłem potwierdzenia bez `connection_id`.

Start animacji przestaje zależeć wyłącznie od ulotnego `display_transition_started`: Display zapisuje `started_sound_cue_seq`, Control odbiera zmianę przez Realtime. Timeout zostaje awaryjnym fallbackiem i jest logowany jako odzyskany brak potwierdzenia, nie dowód braku renderu.

Buzzer po odebraniu stanu raportuje `received_rev`/`rendered_rev` wyłącznie dla diagnostyki. Naciśnięcie pozostaje RPC `game_state_buzzer_press`, ale RPC sprawdza główne połączenie oraz `epoch`. Rywalizujące naciśnięcia dwóch przycisków nadal rozstrzyga transakcja gry.

Heartbeat obecności można powiązać z `connection_id`, aby Control nie utożsamiał wielu kart z jedną obecnością. `device_presence` pozostaje źródłem kompatybilności/statystyk do czasu bezpiecznej migracji. Aktywna rola i promowanie wynikają z lease, nie z wyboru „najnowszego heartbeat’u”.

### D. Udostępnienia i cofanie dostępu

- **Nie zmieniać** `control_device_link_tokens`, `control_device_shares`, formatu linku, `/go/`, sześciocyfrowego kodu ani panelu kopiowania. Po obecnym rozwiązaniu tokenu każde z tych wejść przechodzi do tej samej rejestracji instancji. Token nadal autoryzuje sesję/typ; kolejka niezależnie rozstrzyga, kto jest główny.
- Link można otworzyć na wielu urządzeniach — to świadomie dozwolone. Pierwsza zaakceptowana instancja jest primary, reszta czeka. Sama kolejka nie podnosi tajności współdzielonego bearer-linku: każdy, kto go dostał, może czekać w kolejce, dopóki grant jest aktywny. Ogranicza jednak do jednej instancji możliwość wpływania na urządzenie/rozgrywkę.
- Cofnięcie grantu lub koniec sesji unieważnia możliwość odnowienia JWT, heartbeatów, RPC postępu i akcji. Polityki i RPC sprawdzają aktualny stan tokenu/sesji, a nie tylko claims wystawione wcześniej.
- Nie wymagać, aby urządzenia były zalogowane ani aby użytkownik ponownie wpisał kod przy promocji oczekującej instancji.
- Zakres pierwszego wdrożenia to Control v2. Control v1 i jego starszy model udostępnień pozostają nietknięte.

### Przepływy danych po zmianie

**Otwarcie linku lub wpisanie kodu:** obecny `/go/` albo `/connect/` rozwiązuje token/kod tak jak dziś i kieruje do właściwego typu strony. Strona generuje nowe `connection_id`, wywołuje RPC `register` z `game_id`, typem, kluczem i identyfikatorem. DB w jednej transakcji waliduje aktywną sesję/grant i zakłada rekord. Jeżeli slot jest pusty — status `primary`; jeśli nie — `waiting`. Klient pobiera wyłącznie własny status; dopiero po przyznaniu primary pobiera `game_state` istniejącym RPC. `game_state_get` i subskrypcja pełnego stanu również muszą sprawdzać primary, żeby waiting nie renderował ukrytej kopii gry.

**Normalna praca:** każda karta heartbeat’uje swój rekord. Tylko primary może wykonywać mutacje, potwierdzać render/start dźwięku i być używana jako źródło online dla Control. Waiting utrzymuje kolejkę, ale overlay blokuje obraz/akcje/dźwięk. Control może zobaczyć liczbę oczekujących i primary przez owner-scoped RPC; urządzenia nie otrzymują surowych rekordów innych kart.

**Zamknięcie i awaria:** `pagehide` próbuje wywołać release. RPC blokuje slot, sprawdza, że zwalniana instancja nadal jest primary, podbija epoch, wybiera najstarszy aktywny waiting, ustawia mu primary i zwraca nowy status. Przy utracie sieci release nie dojdzie; następne heartbeat/status reconciliation wykrywa lease po TTL i robi tę samą promocję. Po promocji Display unieważnia poprzednie potwierdzenie jako źródło aktualnego obrazu i inicjuje nowy handshake audio.

**Wznowienie starej karty:** klient pyta o status i odświeża `game_state`, ale DB nie uznaje go za primary na podstawie samego dawnego tokenu. `connection_id`/`epoch` nie zgadza się z aktualnym slotem; każda akcja mutująca kończy się odmową. Jeżeli stara karta ma wrócić do kolejki, rejestruje nową pozycję na końcu.

### Granice zmian i zgodność wdrożenia

- Bez zmian pozostają tabele i RPC udostępniania, token linku, grant odbiorcy, format kodu, e-mail zaproszenia, kopiowanie linku, `/go/` i `/connect/`. Zmienia się dopiero to, co strona robi po skutecznym rozwiązaniu uprawnienia.
- Nowe tabele są źródłem prawdy o instancjach/primary. `device_presence` pozostaje zgodnościowym heartbeat’em i źródłem dotychczasowych statystyk w okresie migracji; nie może rozstrzygać blokady. Control 2 przechodzi na czytanie statusu slotu/primary.
- Nie wolno zostawić aktywnej ścieżki mutacji urządzeń, która ufa wyłącznie kluczowi. W chwili egzekwowania blokad RPC dla Displaya/Buzzera (oraz RPC eventów, completion i audio) muszą wymagać `connection_id` i epoch. Stare otwarte karty będą musiały odświeżyć stronę; po wdrożeniu nie mogą pozostawać w stanie, gdzie pokazują aktywny ekran, ale omijają lease.
- Zmiany `postgres_changes` nie mogą udostępnić anonowi całego `game_state` ani listy innych połączeń. Trzeba zweryfikować RLS dla minimalnego statusu urządzenia. Jeśli podpisany JWT Realtime wymaga sekretu infrastruktury, to jest osobna zależność wdrożeniowa; nie wpływa na zachowanie linków ani kodów, ale może rozstrzygnąć, czy status promowania dostarczymy przez Realtime czy krótkie status-RPC.
- Przed kodem należy spisać RPC dotykające obecności/akcji urządzeń i zastąpić je kontraktowo w jednym wydaniu: `device_ping`, `game_state_buzzer_press`, `game_state_display_complete`, `game_state_display_is_ready`, `begin_display_audio_session`, `acknowledge_display_audio_unlock`, `control2_display_event` i startowe pobranie stanu. `game_state_write` pozostaje ścieżką operatora Control, nie urządzenia.

## Etapy wdrożenia

1. **Zamknąć kontrakt przed kodem:** ustalić heartbeat/lease i timeout, politykę powrotu starej karty (rekomendacja: koniec kolejki), tekst overlay, regułę audio po promocji, zakres statusu widocznego dla urządzeń i sekret JWT, jeśli Realtime będzie wymagał podpisanych tokenów.
2. **Addytywna baza:** dodać tabele, indeksy i RPC rejestracji/statusu/heartbeat/release, bez zmiany `control_device_key_valid`, udostępnień i obecnych ścieżek gry. Ograniczyć nowe tabele przez RLS i uprawnienia RPC. Wdrożyć migrację i potwierdzić jej zastosowanie przed klientem; nic jeszcze nie egzekwuje kolejki.
3. **Dodać RPC fencing w trybie zgodności:** nowe wersje RPC akcji/potwierdzeń przyjmują `connection_id`/`epoch`, ale stary przepływ pozostaje działający dla sesji oznaczonych `legacy`. Dodać `protocol_version`/tryb do sesji runtime, aby stara i nowa ścieżka nie mieszały się w obrębie jednej sesji.
4. **Wdrożyć klienta bez przełączenia aktywnych sesji:** nowe karty rejestrują się i pokazują status; polling i dotychczasowe Broadcasty nadal działają. Nie włączać blokady globalnie w trakcie gry. Sprawdzić kolejkę wyłącznie na dedykowanych testowych grach/sesjach w produkcyjnej bazie: równoczesna rejestracja, retry, release, timeout, promocja, awaria Realtime, cofnięcie grantu.
5. **Włączać per sesja Control, nie globalnym przełącznikiem w środku gry:** istniejące aktywne sesje kończą grę w dotychczasowym trybie. Nowa sesja v2 dostaje protokół lease i tylko połączenia utworzone/odświeżone przez nowego klienta. Przy kontrolowanym przejściu strony urządzeń trzeba wymusić przeładowanie lub ponowne połączenie; stara karta nie może nadal pokazywać żywej planszy jako główna. Link i kod zostają takie same, ale połączenie do nowej sesji odtwarza rejestrację.
6. **Najpierw egzekwować lease w bazie:** najpierw wymagają primary `game_state_get`, status audio, completion, Display events i Buzzer press; dopiero wtedy UI może polegać na blokadzie. Każdy write/read urządzenia sprawdza aktualny grant, sesję, `connection_id` i epoch w transakcji. Brak statusu/niepewna baza oznacza fail-closed dla akcji, ale pokazuje komunikat/retry zamiast fałszywego „offline”.
7. **Realtime stopniowo, polling zostaje:** włączyć najpierw stan/rola połączenia, potem Display/Host/Buzzer, zachowując `game_state_get`, heartbeat/status RPC oraz stary Broadcast `rev` jako naprawę luk. Realtime jest optymalizacją szybkości, a nie warunkiem bezpieczeństwa. Usuwać stare odpytywanie i agregat potwierdzeń dopiero w oddzielnym wydaniu po wykazaniu równoważności.
8. **Stopniowe zwiększanie ruchu:** najpierw testowe gry na produkcji → kontrolowane nowe sesje → wszystkie nowe sesje. Branch testowy korzysta z tej samej produkcyjnej bazy, więc scenariusze muszą być izolowane po testowym koncie/grze i nie dotykać cudzych aktywnych sesji. Mierzyć odrzucone stare epoch, czas promocji, brak heartbeatów, ack timeouty, reconnecty, błędy RPC/RLS oraz przypadki wielu primary. Rozszerzać dopiero, jeśli dane są poprawne.
9. **Na końcu domknąć statystyki/diagnostykę:** po ustabilizowaniu łączenia sprawdzić, czy nowe stany kolejki (primary, waiting, promocja, lease timeout, odmowa starej instancji) zapisują się raz, z właściwym czasem i sesją gry, i trafiają do eksportu JSON. Dodać brakujące zdarzenia idempotentnie, bez surowych heartbeatów. Następnie odtworzyć je przez E2E na dedykowanej testowej grze w produkcyjnej bazie i odczytać z endpointu/statystyk admina przed sprzątnięciem danych.
10. **Dopiero na samym końcu usunąć zgodność wsteczną:** po wdrożeniu wszystkich klientów, zakończeniu aktywnych sesji legacy, pozytywnej kontroli produkcyjnej i upływie uzgodnionego okna rollbacku. W osobnej migracji/kroku usunąć legacy RPC, pola, polling/Broadcasty lub ścieżki kodu, które faktycznie nie są już używane. Do tego momentu zachować je i możliwość powrotu do polling/RPC; nie mieszać cleanupu ze startem blokady.

Statystyki wyniku samej rozgrywki są już zapisywane przez trigger `game_state_track_session` przy zmianie `game_state`; dopóki ta ścieżka i jej pola nie zmieniają się, kolejka sama w sobie nie powinna zmieniać wyników, rund ani finału. Osobny problem do sprawdzenia to konsekwentny zapis **diagnostyki urządzeń**: aktualnie zdarzenia Display idą do `control2_device_events`, a incydenty Control do `game_sessions.stats_detail.events`. Końcowy etap ma ustalić, czy warto je zunifikować czy tylko dodać wydarzenia lease; nie przenosić istniejących wyników gry ani nie przebudowywać eksportu bez wykazanego braku.

### Bezpieczny rollback

- Każda migracja pierwszej fazy jest addytywna. Nie usuwać ani nie zmieniać semantyki dotychczasowych tabel linków, kodów, share ani RPC przed przejściem ruchu.
- Utrzymywać nowy i stary kod/kontrakt równolegle, rozdzielone `protocol_version` na sesji. W razie błędu zatrzymać tworzenie sesji v2; aktywne sesje v2 pozostawić na działających RPC albo kontrolowanie zakończyć/odświeżyć. Nie wyłączać walidacji epoch globalnie, bo umożliwiłoby to starej karcie ponowne sterowanie.
- Można wycofać Realtime do polling/RPC bez zmiany przydziału primary. Nie wycofywać samego lease tylko po to, by naprawić kanał Realtime.
- Zgodność wsteczna pozostaje przez pełny rollout i okno obserwacji/rollbacku. Dopiero po zamknięciu tego okna osobny etap może usunąć nieużywane ścieżki legacy. To jest migracja destrukcyjna i wymaga odrębnego potwierdzenia produkcyjnego.

### Bramka przed włączeniem blokady na produkcji

- Testy SQL współbieżności dowodzą dokładnie jednego primary dla sesji/typu, najstarszego żywego kandydata, idempotencji retry i poprawnej promocji po release/TTL.
- Testy bezpieczeństwa dowodzą, że waiting/stary epoch/cofnięty grant/wygasła sesja nie mogą odczytać stanu jako aktywne urządzenie, nacisnąć Buzzera, potwierdzić Displaya ani odblokować audio; inny typ/inna gra nie pasuje.
- E2E sprawdza drugi ekran i overlay, automatyczne przejęcie, komunikat przy timeout, odświeżenie karty, powrót z tła, kanał Realtime offline i działanie polling.
- Wdrożenie bazy jest potwierdzone logiem migracji; testy kodu brancha przechodzą na wskazanych scenariuszach; po wdrożeniu przechodzi ten sam wąski zestaw kontrolny na produkcji. Nie łączyć tej zmiany z refaktorem sharingu ani usuwaniem starego kodu.
- Wszystkie E2E z dostępem do bazy wskazują jawnie testowe konto i grę; włączona jest standardowa ścieżka cleanup albo `retain_statistics_games` tylko dla testu, którego celem jest ręczny odczyt zapisanego JSON. Nigdy nie używać aktywnej gry użytkownika jako fixtures.
- Weryfikacja statystyk sprawdza jednocześnie: bez zmian wynik/rundy/finał istniejącej ścieżki; zdarzenia kolejki w właściwej sesji; brak duplikatów po retry; widoczność diagnostyki w eksporcie; i poprawne sprzątanie rekordów testowych.

### Częstotliwość i konsekwencja testów

Testy powtarza się **przy każdej zmianie kontraktu DB, klienta urządzeń lub eksportu statystyk**, a nie tylko raz na koniec. Branch ma osobny kod, ale testuje na tej samej produkcyjnej bazie, więc wszystkie testy używają wyłącznie dedykowanych testowych kont/gier i jawnego cleanupu.

| Bramka | Kiedy | Zakres i dowód |
|---|---|---|
| Przegląd migracji i test SQL | Każda migracja lub zmiana funkcji DB | Rerunnable/rollback-safe gdzie to możliwe; uprawnienia, FK/constraints, idempotencja retry, invalid token/session, brak dostępu bez RPC. Test wyścigu uruchamia wiele rejestracji naraz: 10 instancji × co najmniej 20 świeżych slotów; dla każdego slotu sprawdza dokładnie jednego primary i kolejkę według czasu DB. Próbuje też dwa równoczesne heartbeaty, release i timeout. |
| E2E branch → produkcyjna baza | Każdy etap klienta i każda zmiana zachowania | Rzeczywisty przebieg Display/Host/Buzzer: pierwsze połączenie, drugie urządzenie i overlay, zamknięcie primary, automatyczna promocja, utrata sieci/lease, powrót starej karty, reload, tło/widoczność, błąd lub reconnect Realtime z dogonieniem przez polling. Testy sprawdzają, że oczekujące urządzenie nie renderuje/nie wydaje dźwięku/nie wykonuje akcji. |
| Testy negatywne bezpieczeństwa | Każda zmiana RPC, lease, RLS lub autoryzacji | Waiting, stary epoch, inny typ, inne game/session, cofnięty grant i wygasły token nie mogą pobrać aktywnego stanu ani wykonać mutacji, potwierdzenia Displaya, audio unlock czy telemetryki jako primary. Powtórzyć po zmianie każdego RPC objętego fencingiem. |
| Kontrola po wdrożeniu na main | Po każdym wdrożeniu DB i osobno po każdym wdrożeniu Pages | Ten sam wąski zestaw E2E na nowych testowych grach: połączenie jednego urządzenia, duplikat i promocja, Buzzer, restart/cleanup. Potwierdzić log APPLY/OK migracji i rezultat workflow; nie uznawać testu brancha za kontrolę wdrożonego frontu. |
| Weryfikacja statystyk | Każda zmiana zapisu zdarzeń/eksportu; ponownie po wdrożeniu | Uruchomić kontrolowany scenariusz, pobrać JSON przed cleanupem, porównać z rekordami `game_sessions`, `control2_device_events` i kolejki. Powtórzyć retry tego samego eventu i potwierdzić brak duplikatu. Zachować artefakt testowy; standardowo sprzątnąć grę. |
| Obserwacja po uruchomieniu dla nowych sesji | Pierwsze 10 sesji testowych/kontrolowanych, potem codziennie przez pierwsze 7 dni | Przejrzeć metryki/logi: liczba primary na slot (musi wynosić najwyżej 1), czas promocji, waiting bez heartbeat, odmowy epoch, awarie statusu/Realtime, ack timeouty, brakujące lub zduplikowane statystyki. Każda anomalia blokuje rozszerzanie ruchu i uruchamia reprodukcję na testowej grze. |

| Pełna regresja Control 2 | Przed pierwszym włączeniem lease, po pełnym wdrożeniu, następnie raz w miesiącu na `main`; dodatkowo po dużej zmianie protokołu lub incydencie produkcyjnym | Jeden pełny, filtrowany przebieg wszystkich speców Control 2: start/restart gry, link i kod, Display/Host/Buzzer, duplikaty/promocje, rozłączenie/wznowienie, audio/completion, zapis wyników, diagnostyka i JSON. Używa tylko dedykowanych testowych kont/gier; nie uruchamia całego repo E2E bez filtra. |

Punktowe testy są obowiązkowe dla każdej zmiany; pełna regresja jest dodatkową kontrolą całości i nie zastępuje ich. Uruchamiamy ją także po scaleniu/integracji zmian kilku etapów, żeby wyłapać błędy styku między DB, klientem i statystykami.

Wynik każdej bramki zapisujemy w dzienniku wdrożeń: commit/branch, workflow run, migracja, testy/scenariusze, użyte testowe gry, artefakt JSON i cleanup. Wybieramy wszystkie testy dotknięte kontraktem, plus istniejące testy regresyjne Control 2 dla obecności, Buzzera, Display completion, audio unlock i statystyk. Jeśli implementacja zmieni którykolwiek z tych kontraktów, odpowiadający mu test jest obowiązkowy ponownie.

## Kryteria odbioru

- Dwa równoczesne otwarcia tego samego typu: baza wybiera jedną główną, drugie urządzenie pokazuje oczekiwanie i nie wykonuje akcji.
- Zamknięcie głównego promuje najstarszy żywy standby; awaryjne zniknięcie promuje go po jednym wspólnym TTL.
- Gdy nie ma żadnego aktywnego kandydata, Control pokazuje obecne zerwanie i blokuje grę jak dotychczas.
- Stara instancja po utracie lease nie może pisać nawet wtedy, gdy jej karta wznowiła się z opóźnieniem.
- Dwa Buzzery: tylko główny przyjmuje naciśnięcia; równoczesne A/B nadal rozstrzyga atomowo baza.
- Główny Display potwierdza render; standby nie odblokuje Control ani Buzzera. Po promocji nowego Displaya wymaga on nowego gestu odblokowania audio.
- Stan trafia do aktywnych urządzeń przez Realtime; utrata kanału, odświeżenie i powrót z tła doganiają najnowszy `rev` bez ręcznego restartu.
- Cofnięty link/udział, wygasła sesja i token dla innej gry/typu nie pozwalają odnowić połączenia ani wykonać akcji.
- Sześciocyfrowe łączenie, link, udostępnianie odbiorcy i Control v1 zachowują swój dotychczasowy przepływ.

## Znaczenie „atomowego zapisu” Buzzera

`game_state_buzzer_press` wykonuje warunkową aktualizację w bazie: zapisze zespół tylko wtedy, gdy `lastPressed` jest jeszcze pusty. Przy dwóch równoczesnych naciśnięciach PostgreSQL serializuje konkurujące zapisy — jeden ustawi wynik, drugi nie znajdzie już wiersza spełniającego warunek i dostanie `already_pressed`. To zabezpieczenie wyniku gry, niezależne od Realtime i wyboru głównego Buzzera.

## Pliki będące podstawą analizy

- `web/control/js/devices.js`, `web/control/js/shareDevice.js`, `web/go/js/go.js`, `web/connect/js/connect-device.js`
- `web/shared/js/core/game-state-subscribe.js`, `web/shared/js/core/game-state-sync.js`, `web/shared/js/core/game-state-doorbell.js`
- `web/control/js/presence.js`, `web/control/js/runtimeSession.js`
- `web/control/display/js/main.js`, `web/control/buzzer/js/main.js`, `web/control/host/js/main.js`
- `supabase/migrations/2026-09-05_261_drop_game_state_anon_policy.sql`
- `supabase/migrations/2026-10-06_305_display_render_completion.sql`
- `supabase/migrations/2026-10-11_324_control_runtime_sessions.sql`
