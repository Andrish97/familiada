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
  game-settings/index.html
  game-settings/js/
  control/index.html
  control/js/
  display/index.html
  display/js/
  host/index.html
  host/js/
  host/fonts/          # Caveat i JetBrains Mono, używane przez Hosta
  buzzer/index.html
  buzzer/js/
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
Na tym pierwszym etapie stary zestaw nadal istniał. Usunięto automatyczne sprawdzanie wersji oraz
przeładowywanie edytora logo; wersjonowanie adresów zasobów pozostaje.

## Końcowe przeniesienie i sprzątanie — 7 października 2026

Strony, Worker oraz migracje 306–307 są wdrożone na produkcji.
Wybrane testy lokalne tras i zasobów: 19/19. Testy SQL przed migracją
i kontrole rzeczywistej bazy po migracji zakończyły się sukcesem.
Wybrane testy przeglądarkowe: **10/10 na produkcji**, bez ponowień.

Bieżący zestaw przejmuje katalogi i publiczne adresy `control/`, `display/`,
`host/`, `buzzer/` i `game-settings/`. Usunięto stare moduły tych stron
oraz katalogi z sufiksem `2`. Plik ustawień ma nazwę `game-settings.js`.
Linki Moich gier, podłączenie kodem, udostępnianie, e-mail, TV, QR,
iframe ustawień i podglądu, odsyłacze manuala, importy, CSS, fonty,
reguły Workera, testy i scenariusze nagrań wskazują aktualne ścieżki.
Dawne adresy z `2` nie otrzymują fallbacków ani kopii aplikacji.

### Baza i statystyki

Migracja 306 usuwa stare RPC `device_state_get`, `device_state_set_public`,
`device_state_set_admin`, `ensure_device_state`, `game_session_start`,
`game_session_update` i wszystkie dawne sygnatury `game_session_end`.
Usuwa również tabelę snapshotów `device_state` i nieużywany typ `device_kind`.
Kontrola treści funkcji odrzuca nieoczekiwane zależności; `DROP` nie używa
`CASCADE`, więc zależności katalogowe blokują i wycofują migrację.
Przed migracją workflow zachowuje na serwerze snapshoty, schemat i liczby
wierszy historii w katalogu wdrożenia `legacy-control-backup/`.

Cała tabela `game_sessions`, wcześniejsze archiwum, Control 1 i nowe sesje,
statusy, wyniki, daty i metadane pozostają. Dotychczasowa etykieta
„Archiwum — Control 1” nadal odróżnia stary zestaw. Nie podstawiamy czasu
wdrożenia jako czasu zakończenia otwartych starych sesji.

Aktualne `game_state`, potwierdzenia animacji, `game_session_active`,
triggery statystyk, odczyt danych, klucze urządzeń, `device_presence`,
`device_ping`, udostępnianie, blokady edycji i loga pozostają.
Nazwy bieżących RPC `control2_session_ping` i `host2_logo_get_public`
oraz `control_version=2` określają generację protokołu i danych;
zmiana publicznych adresów ich nie zmienia.

### Aktywność

Migracja 307 normalizuje bieżące wpisy `control2` i `game-settings2`
do nazw `control` i `game-settings`. Ping przyjmuje nazwy kanoniczne.
Podgląd trwających gier wybiera sesje `control_version=2` i stan `game_state`;
stare otwarte wpisy statystyk nie trafiają do bieżącej aktywności.
Historia `site_activity_hours`, retencja 90 dni, wspólne wykluczenia,
wykluczenia kont testowych i gości testowych oraz blokada nazw pozostają.

### Sprawdzenie wdrożenia

Workflow sprawdza migrację 306 w osobnej bazie testowej oraz zachowanie
historycznego wyniku. Test aktywności sprawdza migrację 307, zachowanie
historii godzinowej, wykluczenie starego Control z bieżącej aktywności
oraz prawidłowe rozpoznanie nowej gry na adresie `/control/`.
Po migracji kontroluje również rzeczywistą produkcyjną bazę.
Wybrane testy przeglądarkowe używają bypass tokenu podczas konserwacji.
Konserwacji nie wyłączamy automatycznie.

Historyczne migracje SQL i materiały z dawnych nagrań pozostają w repo.

Wdrożenia:

- [Pages](https://github.com/Andrish97/familiada/actions/runs/37550022417) — sukces.
- [Worker](https://github.com/Andrish97/familiada/actions/runs/37550022403) — sukces.
- [Baza, migracje i kontrole produkcyjne](https://github.com/Andrish97/familiada/actions/runs/37550022320) — sukces.

[Końcowy przebieg przeglądarkowy](https://github.com/Andrish97/familiada/actions/runs/37550308054):
**10/10**, bez ponowień, 5,6 minuty. Potwierdzono kanoniczne adresy,
zasoby i stronę główną, nawigację Moich gier, TV, własne outro,
podłączenie urządzeń, pełny finał oraz zakończenie bez finału.
Artefakt `production-statistics-records` zawiera rzeczywiste rekordy
odczytane z produkcyjnej bazy po zakończeniu obu rozgrywek:
300:0 + 135 punktów finału = 435:0 oraz 90:0 bez finału.
Obie sesje mają zapisane `ended_at`. Gry testowe zachowano.
