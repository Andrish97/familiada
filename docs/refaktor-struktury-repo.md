# Refaktor struktury repozytorium

## Cel i zakres

Każda strona ma własny katalog z `index.html` oraz lokalnymi podfolderami
`js/`, `css/` i, gdy są potrzebne, `data/` lub `fonts/`. Kod używany przez
kilka stron znajduje się w `web/shared/`. Refaktor zmienia organizację plików
i ich adresy, a nie zasady rozgrywki.

Nie utrzymujemy fallbacków ani kopii zasobów pod dawnymi ścieżkami.
Nie utrzymujemy starego adresu `/builder`; stroną listy gier jest `/games/`.

## Docelowa struktura

```text
web/
  index.html
  home/                 # skrypty i style strony głównej
  games/index.html
  games/js/
  control2/index.html
  control2/js/
  display2/index.html
  display2/js/
  host2/index.html
  host2/js/
  host2/fonts/          # Caveat i JetBrains Mono, używane też przez starego hosta
  buzzer2/index.html
  buzzer2/js/
  settings/index.html
  settings/js/
  settings/data/
  settings/tools/
  shared/
    js/core/           # auth, połączenia, modale, formularze, nawigacja
    js/gameplay/       # stan gry, zdarzenia, podpowiedzi, dźwięki, tekst tablicy
    js/display/        # grafika tablicy, animacje, motywy, fonty, QR, fullscreen
    css/               # style używane przez kilka stron
    translation/
    data/              # domyślne logo, motywy tablicy, katalog dźwięków
    fonts/display/     # opisy znaków tablicy w JSON
  assets/audio/
  assets/img/
  404.html             # specjalny plik wymagany przez publikację i obsługę 404
docs/
tests/
scripts/
cloudflare/
supabase/
services/
```

Pozostałe strony stosują ten sam układ. Mały plik używany wyłącznie przez
jedną stronę pozostaje przy niej. Plik rzeczywiście współdzielony nie jest
kopiowany do kilku katalogów. Listę dostępnych fontów edytora logo trzymamy
w `logo-editor/data/`, a listę narzędzi panelu w `settings/data/`.
Materiały robocze, np. HTML audytu ikon, należą do `docs/`.

## Publikowanie, adresy i wersjonowanie

`main` jest gałęzią całego repozytorium. GitHub Actions publikuje do GitHub
Pages tylko zawartość `web/`. Nazwa tego katalogu nie występuje w publicznych
adresach. Na przykład `web/games/index.html` daje stronę `/games/`.

Wersjonowanie zasobów obejmuje frontend i aktualizuje odwołania `?v=...`.
Przeniesienie plików wymaga poprawienia importów, adresów HTML, CSS `url()`,
wywołań `fetch()`, dynamicznych importów, manifestu PWA i konfiguracji cache.
Zasoby w HTML mają adresy od korzenia witryny, aby ich ładowanie nie zależało
od końcowego ukośnika ani od mapowania subdomeny.

Worker nadal obsługuje API, subdomeny, przerwę techniczną, cache i SSR.
Panel `settings.familiada.online/` pobiera wewnętrznie
`/settings/index.html` z tego samego Pages. Przeglądarka pozostaje na
subdomenie. Reguły zasobów panelu, narzędzi i strony maintenance muszą zostać
dostosowane do nowych katalogów. Foldery panelu pozostają zablokowane na
publicznej domenie zgodnie z dotychczasową polityką.

## Stan prac i warunki wdrożenia

Przeniesiono frontend do `web/`, strony do katalogów oraz zasoby wspólne.
Usunięto przekierowanie `builder.html` i nieużywany szkic Workera
`src/index.js.tmp`. HTML audytu ikon znajduje się w `docs/ikony.html`.

2026-10-05 wdrożono migrację demo 298, następnie Pages, Worker i Edge
Function `send-email`. Migracja objęła 789 niezmienionych gier i 97 baz;
edytowane zestawy oraz aktywne rozgrywki są chronione warunkami migracji.
Nowa ścieżka tłumaczeń obowiązuje także w Workerze i wiadomościach e-mail.
Nie uruchamiamy całych testów bez potrzeby.

Sprawdzenia lokalne: wykonano kontrolę składni wszystkich skryptów frontendu,
importów, plików ładowanych przez HTML i CSS, fontów, katalogu dźwięków,
modułów motywów i domyślnego logo. Sprawdzono mapowanie tras przez Worker,
reguły panelu settings i przerwy technicznej oraz wersjonowanie zasobów.
Testy dotyczące tych obszarów przechodzą. Pierwszy produkcyjny test struktury
zakończył się wynikiem 10/10:
https://github.com/Andrish97/familiada/actions/runs/37321284678.
Potwierdził strony i bezpośrednie zasoby, logo, fonty, tłumaczenia, outro,
manifest, routing i cache. Nie sprawdzał wszystkich interakcji przycisków.
Po zgłoszeniu błędów poprawiono względne adresy nawigacji i filtr MIME audio;
dodano osobne testy kliknięć powrotu oraz własnego outro ponad 30 sekund.
Ich wyniki należy oceniać osobno od dostępności zasobów.
Pięć testów kliknięć powrotu przeszło na produkcji:
https://github.com/Andrish97/familiada/actions/runs/37332560704.
Własne outro 31 s oraz docelowy adres QR potwierdzono w przebiegu:
https://github.com/Andrish97/familiada/actions/runs/37331185165.
Test e-maila w tym przebiegu przeszedł dopiero po powtórzeniu (opóźnienie
wiadomości ponad 90 s w pierwszej próbie).
„Jedynki” nadal istnieją. Usunięto automatyczne sprawdzanie wersji oraz
przeładowywanie edytora logo; wersjonowanie adresów zasobów pozostaje.

## Etap późniejszy: usunięcie „jedynek”

Ten etap następuje dopiero po zakończeniu i sprawdzeniu migracji do zestawu 2.
Nie usuwamy teraz starego zestawu w ramach samego porządkowania katalogów.

### Odłączenie zależności wykonane w ramach refaktoru

Display2 korzysta z modułów wydzielonych do `shared/js/display/`:

- `fonts.js` — ładowanie i interpretacja fontów JSON;
- `anim.js` — animacje;
- `displays.js` — budowa pól tablicy;
- `theme_manager.js` i używane przez niego moduły motywów;
- `fullscreen.js` — obsługa pełnego ekranu;
- `qr.js` — kontroler kodów QR.

Wydzielono również `display-geometry.js` i moduły motywów. Style Control2,
Display2 i Buzzer2 przeniesiono do ich własnych katalogów `css/`; stary
zestaw korzysta z tych samych plików. Importy obu
zestawów wskazują wspólne pliki; nie ma dwóch kopii modułów. Przed usunięciem
starego zestawu trzeba potwierdzić brak zależności bieżącego kodu od jego
katalogów oraz sprawdzić tablicę, animacje, fonty, QR i motywy.
Wspólnego kodu nie usuwamy razem ze starym ekranem.

### Następnie usunąć stare strony i wybór zestawu

Usunąć katalogi `control/`, `display/`, `host/`, `buzzer/` i `game-settings/`
wraz z plikami używanymi wyłącznie przez te strony. Zostawić zestaw 2,
wspólne fonty tablicy, domyślne logo i inne zasoby używane nadal.

Usunąć wybór starego zestawu, jego linki, instrukcje i dedykowane tłumaczenia
z nawigacji, podłączania urządzeń, ustawień gier oraz dokumentacji bieżącej.
Sprawdzić ścieżki zapisane w bazie i konfiguracji przed ich zmianą. Zmiana
nazw `control2` na `control`, `display2` na `display`, `host2` na `host`,
`buzzer2` na `buzzer` i `game-settings2` na `game-settings` jest ostatnim
krokiem tego etapu. Po zwolnieniu starych nazw trzeba jednocześnie poprawić
linki, reguły Workera, testy, scenariusze nagrań i odwołania w konfiguracji.
Nie robimy tego wcześniej, gdy oba zestawy nadal istnieją. Usunięcie sufiksu
`2` z nazw folderów i tras nie zmienia automatycznie wersji protokołu,
formatu stanu gry ani pól w bazie danych.

### Na końcu posprzątać pozostałości

Usunąć testy, scenariusze nagrań, style i moduły dotyczące wyłącznie starego
zestawu. Zaktualizować reguły Workera, manifest, sitemap i dokumentację.
Wykonać wyszukiwanie importów oraz adresów starych stron, aby potwierdzić,
że nie ma pozostałych zależności. Sprawdzić produkcyjny przebieg gry na
zestawie 2 i panel ustawień.

Historyczne migracje SQL pozostają: nie są śmieciami i nie usuwamy ich tylko
dlatego, że opisują dawną funkcję. Historyczne audyty i nagrania w `docs/`
można zarchiwizować po oddzielnym przeglądzie, bez kasowania materiałów
przekazanych przez użytkownika.

## Baza danych po wyłączeniu starego zestawu — audyt 6 października 2026

To plan późniejszego sprzątania, nie wykonana migracja. Audyt dotyczy kodu
repozytorium i zapisanego schematu; przed usuwaniem trzeba ponownie sprawdzić
zależności w aktualnej bazie produkcyjnej.

| Element | Obecne użycie | Decyzja |
| --- | --- | --- |
| `device_state` | Snapshoty starego Display, Hosta i Buzzera; zestaw 2 korzysta z `game_state`. | Kandydat do usunięcia po wyłączeniu wszystkich starych urządzeń. |
| `device_state_get`, `device_state_set_public` | Odczyt i zapis tych snapshotów przez stare urządzenia. | Usunąć razem ze starym mechanizmem snapshotów. |
| `device_state_set_admin`, `ensure_device_state` | Brak wywołań w aktualnym frontendzie; ich definicje odwołują się do dawnej kolumny `kind`, podczas gdy tabela ma `device_type`. | Sprawdzić wywołania po stronie bazy i usunąć, jeśli nie ma innych klientów. |
| Typ `device_kind` | W zapisanym schemacie występuje w sygnaturze starego `device_state_set_admin`. | Usunąć dopiero po sprawdzeniu i usunięciu wszystkich zależności. Nie mylić z potrzebnym `device_type`. |
| `game_session_start`, `game_session_update`, `game_session_end` | Wywołuje je `control/js/sessionTracking.js`; nowy Control ma zapis statystyk po stronie bazy i `control2_session_ping`. | Wycofać stare funkcje zapisu dopiero po wyłączeniu Control1. Zachować historię statystyk. |

**Zostają:** `game_sessions`, historyczne wpisy obu generacji, widok
`game_sessions_effective`, funkcje odczytu statystyk i panel administracyjny.
Oznaczenie dotychczasowych wpisów jako archiwalnych następuje przy właściwym
przełączeniu, nie podczas równoległego działania zestawów.

**Zostają również wspólne elementy:** gry, pytania, odpowiedzi, ustawienia
i klucze urządzeń w `games`, obecność urządzeń i `device_ping`, kody
podłączenia, udostępnianie urządzeń, blokady edycji, loga, konta i uprawnienia.
`display_auth` i `display_logo_get_public` nadal są używane przez nowy
Display. Nowy Host korzysta dodatkowo z `host2_logo_get_public`.
Usuwanie starych stron nie uzasadnia usuwania tych funkcji ani danych.

Bezpieczna kolejność:

1. Przełączyć nawigację, kody podłączenia i linki na nowy zestaw; potwierdzić
   działanie produkcyjne i zapis statystyk. Pozostawić okres na wygaszenie
   otwartych starych kart oraz wcześniej udostępnionych adresów.
2. Sprawdzić aktualne funkcje, triggery, publikacje Realtime, polityki RLS,
   uprawnienia i zależności typów w produkcyjnej bazie. Wyszukiwanie w kodzie
   samo nie dowodzi, że nie istnieje stary klient lub zewnętrzny konsument.
3. Zrobić kopię schematu i danych `device_state` oraz zachować definicje
   wycofywanych funkcji. Nie kasować historii `game_sessions`.
4. Przygotować osobną migrację usuwającą wyłącznie potwierdzone pozostałości,
   z jawnymi sygnaturami funkcji i bez `DROP ... CASCADE`. Najpierw funkcje
   zależne, następnie tabela, na końcu nieużywany typ.
5. Sprawdzić migrację i odtworzenie kopii, a po wdrożeniu przeprowadzić
   produkcyjny przebieg nowego zestawu: podłączenie, powrót urządzenia,
   rundę, finał i odczyt nowych oraz historycznych statystyk.

Historycznych migracji tworzących stary mechanizm nie usuwać. Nie usuwać
całej tabeli ani funkcji tylko dlatego, że ich nazwa nie zawiera `2`.

### Przypomnienie: podgląd aktywności w Maintenance

- [ ] Przy wycofaniu starego zestawu usunąć z wdrożonego podglądu
  „Aktywność teraz” obsługę starego Control i jego urządzeń: dedykowane
  sygnały aktywności, rozpoznawanie starej rozgrywki, zapytania, etykiety
  oraz testy dotyczące wyłącznie tego zestawu. Jeśli funkcja zostanie
  wdrożona wcześniej, uwzględnić ją w tym samym etapie sprzątania.
- [ ] Sprawdzić, czy podgląd nadal poprawnie pokazuje gry nowego zestawu
  oraz aktywne edycje. Zachować wspólne blokady zasobów (`edit_locks`),
  obecność urządzeń używaną przez nowy zestaw i historyczne statystyki.

Podgląd aktywności został wdrożony migracjami 303–304. Przypomnienie
dotyczy usunięcia jego obsługi starego zestawu, a nie usuwania całej funkcji.

## Przełączenie produkcyjne — 7 października 2026

Nowe wejścia z Moich gier prowadzą do `control2` i `game-settings2`.
Podłączenie kodem, udostępnione urządzenia i TV otwierają Display2, Host2
oraz Buzzer2. Dawne strony mają przekierowanie do odpowiednika zestawu 2
z zachowaniem parametrów i fragmentu adresu. Pozostałe pliki starego
zestawu oraz RPC pozostają na czas wygaszenia wcześniej otwartych kart;
przełączenie nie usuwa danych ani starych snapshotów.

Zatwierdzony polski dokument zastępuje sekcje Panel sterowania i Ustawienia
rozgrywki w manualu. Angielska i ukraińska wersja zostały następnie uzupełnione o pełny zakres
zatwierdzonego polskiego tekstu. Sekcje korzystają ze wspólnego stylu
Prowadzącego, notek, uwag i ikon aplikacji. Źródła tłumaczeń są w
`docs/manual/`. Pozostałych sekcji manuala nie zmieniono.

Dotychczasowe wpisy Control 1 są oznaczone w kolumnie Źródło jako
„Archiwum — Control 1”. Statusy, daty i wszystkie wyniki pozostają zapisane
bez zmian; nowe wpisy nadal pochodzą z Control 2. Nie zmieniamy statusów
na `legacy`, ponieważ spowodowałoby to ukrycie części istniejących danych.
Przełączenie frontendu nie wymaga nowej migracji SQL; wymagane migracje
300–305 były wcześniej wdrożone.

Testy produkcyjne korzystają z podpisanego, pięciominutowego tokenu
`X-E2E-Token`, odświeżanego dla żądań testowych również na urządzeniach.
Token omija konserwację, ale nie logowanie ani uprawnienia użytkownika
lub administratora. Konserwacji nie wyłączamy automatycznie.

## Sprzątanie bazy, statystyk i aktywności po przełączeniu

Audyt kodu i zapisanego schematu z 7 października 2026. Poniższy zakres nie
jest wykonaną migracją ani świeżym odczytem katalogów produkcyjnej bazy.
Do kontroli aktualnej produkcji przygotowano wyłącznie odczytowy skrypt
[sql/control-cleanup-audit.sql](sql/control-cleanup-audit.sql).

### 1. Wycofanie starego kodu i klientów

Usunąć stare moduły razem ze starymi stronami, następnie poprawić nazwy
folderów, linki i Workera zgodnie z wcześniejszą kolejnością. Zatrzymać
możliwość korzystania ze starych RPC przed usunięciem ich danych: samo
przekierowanie HTML nie zatrzymuje już otwartej karty ze starym JavaScriptem.
Pozostawić działające adresy podłączenia urządzeń, z parametrami `id`, `key`
i językiem, kierujące do nowego zestawu.

### 2. Osobna migracja bazy

Po kopii schematu i danych oraz kontroli produkcyjnych zależności:

- Usunąć `device_state_get`, `device_state_set_public`, `device_state_set_admin`
  i `ensure_device_state`, podając pełne sygnatury.
- Usunąć stare RPC zapisu statystyk: `game_session_start`,
  `game_session_update`, `game_session_end`. Nowy Control zapisuje wyniki
  triggerami i korzysta z `control2_session_ping` oraz zapisu zdarzeń.
- Usunąć tabelę `device_state` z jej własną polityką, indeksami i FK.
  Najpierw sprawdzić triggery, publikacje Realtime i zależności spoza frontendu.
- Na końcu usunąć typ `device_kind`, jeśli nie ma już zależności.
  Typ `device_type` zostaje.

Nie stosować `DROP ... CASCADE`. Zależności w katalogach PostgreSQL nie
zastępują przeglądu treści funkcji PL/pgSQL i zapytań dynamicznych.
Nie przepisywać wdrożonych migracji 300–305; dopisać nową migrację.
Historyczne migracje pozostają w repozytorium.

### 3. Statystyki: zachować wyniki, wycofać stary zapis

`game_sessions` pozostaje jedną historią. Zachować wcześniejsze archiwum,
Control 1 i nowe sesje, także ich daty, statusy, wyniki i metadane. Nie zerować
statystyk i nie przenosić wszystkich wpisów do `control_version=2`.
Nie oznaczać dawnych rozgrywek statusem `legacy`: obecne formatowanie ukrywa
wtedy m.in. liczbę rund i czas. Etykieta „Archiwum — Control 1” już odróżnia
stare wpisy bez utraty danych.

Pozostają `game_sessions_effective`, `game_session_active`, triggery nowego
zapisu, jego RPC, funkcje odczytu statystyk i wspólne wykluczenia. Numer 2
w `control_version` opisuje generację danych; nie usuwamy go przy zmianie
nazwy katalogu na `control`.

Stare sesje bez `ended_at` wymagają osobnego przeglądu. Nie podstawiać czasu
wdrożenia jako czasu zakończenia gry: byłby fałszywy. Wycofać je z bieżącego
podglądu przez wybór sesji nowej generacji, zachowując historyczny status
„Utracono kontakt” wynikający z istniejącego widoku. Jeżeli później potrzebne
będzie osobne oznaczenie archiwizacji w bazie, użyć osobnego pola z datą
archiwizacji, bez zmiany znaczenia daty zakończenia.

### 4. Aktywność: uprościć rozpoznawanie, zachować wykresy

Zmienić `get_maintenance_activity` w nowej migracji: usunąć rozpoznawanie
starego Control, wybierać do bieżącej rozgrywki sesje `control_version=2`,
i korzystać z etapów `game_state`. Obecnie zapytanie wybiera najnowszą sesję
każdej gry niezależnie od generacji; po wycofaniu starego zestawu może ona
niepotrzebnie przedstawiać dawną sesję jako aktualną.

Przy zmianie tras zsynchronizować listę stron w `site_activity_ping`,
`shared/js/core/activity.js` i etykiety `settings/js/activity.js`. `control`
i `game-settings` będą oznaczały nowy zestaw; tymczasowe aliasy z 2 mogą
pozostać tylko na czas obsługi dawnych adresów. Kontekst blokady `control`
jest wspólny i zostaje. Zachować również `edit_locks`, `device_presence`,
`device_ping` i kontrolę połączeń używaną przez nowy zestaw.

`site_activity` jest bieżącym podglądem kart. Wygasłe rekordy usuwa ping po
jednym dniu; przy porządkowaniu można usunąć wygasłe wpisy, ale nie wszystkie
rekordy `page='control'`, bo ta nazwa będzie używana ponownie.

`site_activity_hours` zapisuje tylko godzinę i użytkownika, bez wersji Control
lub nazwy strony. Nie można wydzielić z niego „historii starego Control”.
Zachować tę tabelę oraz wykresy. Obecna retencja to 90 dni; czyszczenie
wykonuje się przy kolejnych pingach. Jeśli ma działać również bez ruchu,
przenieść tę samą retencję do regularnego zadania serwera, bez skracania jej
przy okazji refaktoru.

Wspólne wykluczenia, rozpoznawanie testN, oznaczenie gości testowych i blokady
zarezerwowanych nazw pozostają. Wykluczenie z wykresu nie oznacza fizycznego
usunięcia historii użytkownika.

### 5. Sprawdzenie po sprzątaniu

Przed zmianą zachować liczby sesji każdej generacji i istniejące wyniki.
Po migracji porównać je oraz sprawdzić rzeczywisty zapis nowej rozgrywki,
wznowienie, finał i zakończenie bez finału. Sprawdzić podłączenie kodem,
udostępnienie urządzenia, powrót po rozłączeniu, historyczne statystyki,
aktywność edytora i nowego Control oraz niezmienioną historię wykresów.
Użyć wybranych testów produkcyjnych z bypass tokenem przy konserwacji;
nie uruchamiać całego zestawu bez potrzeby.
