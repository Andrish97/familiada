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

Refaktor pozostaje w trakcie integracji. Samo przeniesienie nie oznacza
gotowego wdrożenia. Przed publikacją trzeba zakończyć poprawianie ścieżek,
dostosować Worker i testy, sprawdzić brak brakujących zasobów oraz
wersjonowanie. Nową ścieżkę tłumaczeń obsługują również Worker i Edge
Function `send-email`; wdrożenie musi obejmować te komponenty, nie tylko
Pages. Następnie sprawdzić produkcyjnie logowanie, listę gier,
panel settings, podglądy i domyślne logo oraz zestaw urządzeń 2.
Nie uruchamiamy całych testów bez potrzeby.

Sprawdzenia lokalne: wykonano kontrolę składni wszystkich skryptów frontendu,
importów, plików ładowanych przez HTML i CSS, fontów, katalogu dźwięków,
modułów motywów i domyślnego logo. Sprawdzono mapowanie tras przez Worker,
reguły panelu settings i przerwy technicznej oraz wersjonowanie zasobów.
Testy dotyczące tych obszarów przechodzą; produkcyjne sprawdzenie i publikacja
nie zostały jeszcze wykonane. „Jedynki” nadal istnieją.

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
