# Silnik stylów — jak korzystać (nowa strona, nowy element)

Przewodnik praktyczny. Uzasadnienia i historia: `docs/silnik-stylow-projekt.md`
(projekt), `docs/wspolne-style-plan.md` (decyzje i dziennik E23),
`docs/wzorce-ui.md` (wzorce wyglądu: topbar, karty, paski akcji, kafle,
okna). Ten dokument mówi, **co wziąć i jak**, żeby nowa strona wyglądała
i działała jak reszta bez pisania własnych kopii.

## 1. Zasada

Skończony zestaw elementów, ta sama nazwa dla tej samej rzeczy. Strona
**składa** gotowe elementy silnika; jej własny plik CSS zawiera tylko
układ tej strony (siatka, kolejność, wymiary specyficzne dla treści).
Jeśli potrzebny element nie istnieje — dodaje się go do silnika (z wpisem
w tym dokumencie i w `wzorce-ui.md`), nie do pliku strony.

## 2. Pliki i kolejność

W `<head>` każdej strony aplikacji, w tej kolejności:

```html
<!-- po meta viewport, przed arkuszami; klasyczny, bez async i defer -->
<script src="/shared/js/core/page-boot.js?v=…"></script>
<link rel="stylesheet" href="/shared/css/blocking-overlay.css?v=…"/>  <!-- ekran blokady -->
<link rel="stylesheet" href="/shared/style/tokens.css?v=…"/>
<link rel="stylesheet" href="/shared/style/base.css?v=…"/>
<link rel="stylesheet" href="/shared/style/components.css?v=…"/>
<link rel="stylesheet" href="/shared/style/layout.css?v=…"/>
<link rel="stylesheet" href="/shared/style/utilities.css?v=…"/>
<link rel="stylesheet" href="/<strona>/css/<strona>.css?v=…"/>      <!-- tylko układ strony -->
```

Wersje `?v=` przepisuje `node scripts/version-assets.js` (i CI) — wpisz
dowolną, skrypt ją ujednolici. `flat.css` jest generowany
(`node scripts/build-flat-engine.mjs`) — nie edytować.

| Plik | Co zawiera |
|---|---|
| `tokens.css` | **jedyne** miejsce z kolorami, promieniami, cieniami, `z-index`, czasami animacji, progami. Poza warstwami (`:root`). |
| `base.css` | deklaracja warstw, reset, typografia, `[data-skel-step]` (odsłanianie po wczytaniu) |
| `components.css` | elementy: przyciski, pola, okna, wypustki, kafle, oznaczenia, menu, podpowiedzi… |
| `layout.css` | szkielet stron: `.wrap`, `.bar`, `.card`, dolny pasek listy, powłoka logowania |
| `utilities.css` | zamknięta lista klas pomocniczych (§5) |

## 3. Warstwy (`@layer`) — dlaczego bez `!important`

```
@layer reset, base, components, utilities, page, states;
```

- Plik strony pisze **w `@layer page { … }`** — wygrywa z komponentami
  silnika bez względu na specyficzność, więc **nie potrzebuje `!important`**.
- Reguły stanów, które muszą wygrać ze stroną (arkusz okna na telefonie,
  prosty róg karty pod skrajną wypustką, `[hidden]`), są w silniku w
  `@layer states`. **Strona nie pisze reguł arkusza** (`.sheet-active`,
  `.sheet-modal-*`) — układ okna od dołu opisuje znacznikami silnika (§6a).
  Reguła strony w `@layer page` (np. wysokość listy na komputerze) sama
  przegrywa z arkuszem, więc nie potrzebuje `:not(.sheet-active)`.
- `!important` jest zabronione (test `noImportant`). Uwaga: `!important`
  **odwraca** kolejność warstw — ważna deklaracja z wcześniejszej warstwy
  wygrywa z późniejszą; to dodatkowy powód, żeby go nie używać.
- `[hidden]` chowa zawsze: reguła stanu, która ustawia `display`, dopisuje
  `:not([hidden])`. Audyt zrzutów (`--audit`, uwaga `hidden-widoczny`)
  wyłapuje element z `hidden`, który jest widoczny.

## 4. Tokeny — zamiast liczb i kolorów

Pełna lista w `web/shared/style/tokens.css`. Spoza listy nie wybierać —
najbliższy token (zasada §11.2–3: jak najmniej wartości).

- **Podłoża (kryjące):** `--bg` (strona), `--surface-1` (karta, menu),
  `--surface-2` (pasek, kafel ciemniejszy), `--surface-modal` (okno),
  `--surface-inset` (karta w karcie, wiersz listy), `--surface-sunken`,
  `--surface-toast`; `--black` / `--white` tylko dla podglądu obrazu, wideo
  i kodu QR. Najechanie na kryjący wiersz: `linear-gradient(var(--w-8),
  var(--w-8)) var(--surface-inset)`; przyciski — `--btn-tint` na `--under`.
- **Przezroczystości:** biel `--w-4/8/14/25`, czerń `--k-20/40/70`,
  złoto `--g-10/35/60`. Linie `--line` (= w-14), `--line-faint` (= w-8).
- **Tekst:** `--text`, `--text-soft` (.88, tekst ciągły), `--text-muted`
  (.70), `--text-faint` (.55, podpisy), `--accent` (złoto).
- **Stany** — każdy w czterech odmianach: `--ok-text/-line/-tint/-strong`,
  `--bad-text/-line/-tint/-strong`, `--warn-text/-line/-tint/-strong`,
  `--info-text/-line/-tint/-strong` (tekst; obramowanie .40; tło .14;
  lampka / aktywne .75). Mocny błąd: `--danger`, `--danger-solid`.
  Wyłączone: `--disabled-*`.
- **Promienie:** `--r-xs` 4 (drobne do ~24 px: pole wyboru, pasek,
  uchwyt), `--r-sm` 8, `--r-md` 14, `--r-lg` 20 (karty, okna), `--r-sheet`
  28 (górne rogi arkusza), `--r-pill`, `50%` dla koła.
- **Warstwy:** globalne tylko tokenem — `--z-topbar` 10, `--z-fixed` 30,
  `--z-notice` 40, `--z-drawer` 41 (zasłona: `calc(var(--z-drawer) - 1)`),
  `--z-overlay` 50 (okna), `--z-float` 100, `--z-popover` 200,
  `--z-lang-float`, `--z-menu` 1000, `--z-sheet` 1200, `--z-top` 9999 (nad
  oknami: menu kontekstowe, podgląd obrazu), `--z-mobile-menu`, `--z-toast`,
  `--z-tooltip`, `--z-block` (nakładka blokady). Liczby 0–9 tylko jako
  kolejność wewnątrz jednego elementu; „nad czymś” = `calc(var(--z-x) + 1)`.
- **Ekrany gry** (Prowadzący, Przycisk, snake, TV, QR ankiety) mają własne
  tokeny z prefiksem (`--host-*`, `--buzz-*`, `--snake-*`, `--tv-*`, `--qr-*`)
  na `:root` swojego pliku — kolory gry (drużyny, zeszyt) tylko tam.
- Kolor wpisany na sztywno w pliku strony zatrzyma test
  `cssAudit` (zapadka `scripts/css-audit/baseline.json`).

## 5. Szkielet strony

```html
<body class="page-fit skel-body">                <!-- page-fit: strona na wysokość okna -->
  <header class="topbar topbar-layout-4"> … 4 sekcje (wzór: web/tasks/index.html) … </header>
  <main class="wrap">
    <div class="bar">                             <!-- pasek tytułu: tytuł + podpowiedź + akcje -->
      <div><div class="title">…</div><div class="hint">…</div></div>
      <div class="cluster cluster--end"> <button class="btn sm">…</button> </div>
    </div>
    <section class="games-shell">
      <div class="card games-card" data-skel-group> … treść … </div>
    </section>
    <div class="footer"> … </div>
  </main>
</body>
```

Najprostszy pełny wzór: `web/tasks/` (lista w karcie) i `web/games/`
(karta z wypustkami + dolny pasek z filtrem, sortowaniem, wyszukiwaniem
i akcjami). JS: `initPage()` z `core/page-init.js` (strony wejścia bez konta w topbarze: `initEntryPage(id, { ready })`) (topbar, i18n,
nawigacja, strażnik urządzenia).

Klasy pomocnicze (`utilities.css`, lista zamknięta): `.cluster`
(`--center`, `--end`), `.stack`, `.between`, `.center`, `.grow`, `.nowrap`,
`.truncate`, `.text-muted`, `.hidden`, `.visually-hidden`,
`.only-mobile` / `.only-desktop` (próg 600 px).

### 5a. Pierwsza widoczna klatka i stopniowe ładowanie (decyzja 2026-10-25)

- `page-boot.js` ustawia atrybuty urządzenia przed renderem. Klasyfikacja jest
  wspólna dla CSS, `device-attrs.js` i guarda; moduł aktualizuje ją po zmianach.
  Późny import na już otwartej stronie nie uruchamia bramki startowej.
- `page-loading` pozostaje sygnałem strony „tłumaczenia gotowe”. Wspólna bramka
  `data-layout-pending` czeka dodatkowo na DOMContentLoaded, konfigurację
  powłoki z `initPage` i dwa przebiegi pomiarów przed odsłonięciem.
- Moduł zmieniający geometrię rejestruje **synchroniczny, powtarzalny pomiar**:
  `registerPageLayout(measure)` z `core/page-layout.js`. Pomiar nie pobiera
  danych i nie otwiera okien; rejestracja zwraca funkcję odpięcia. Tak działają
  topbar, fit-row, nagłówki i paski list oraz wygaszanie przewijania.
- Praca asynchroniczna potrzebna do geometrii powłoki używa
  `holdPageLayout(promise)`. Tłumaczenia i `initPage` zgłaszają się same.
  **Nie zgłaszać tu list i wyników z bazy**: powłoka pokazuje się, gdy dane
  jeszcze się pobierają. Błąd obietnicy zwalnia bramkę. Niezależny bezpiecznik
  klasycznego skryptu zdejmuje ukrywanie po 5 s także przy błędzie modułów;
  guard urządzenia nadal ma pierwszeństwo.
- Niewidoczne przekierowania rozstrzygaj przed odsłonięciem. Strona wejścia
  przekazuje `route: promise` do `initEntryPage`; wynik `true` oznacza
  przekierowanie (funkcja zwraca wtedy `false`). Inne inicjalizatory rejestrują
  całą decyzję przez `holdPageLayout`. Także błąd tłumaczeń czeka na decyzję
  trasy; listy danych nie należą do tej bramki.
- Do automatycznej nawigacji używaj `redirectPage(href)` z `page-layout.js`.
  `data-page-redirect` trzyma źródło ukryte także po `finally` inicjalizatora
  i po bezpieczniku bootstrapu, aż przeglądarka otworzy cel. Nawigacja używa
  `replace`, więc Wstecz nie ponawia bramki. Wyjątek przeglądarki, powrót
  z bfcache i niezależny limit 10 s dla przerwanej nawigacji zwalniają stan.
  Nie stosuj do potwierdzeń z widocznym odliczaniem ani zwykłych kliknięć.
- Stopniowe ładowanie pozostaje: `data-skel-step`, `skel-step-ready`, grupy
  i `topbar-ready`. Wstaw treść i podepnij akcje, potem oznacz etap jako gotowy.
  Silnik mierzy nowo odsłaniany etap przed jego renderem. `skel-step-ready`
  w początkowym HTML służy wersji bez JS; bootstrap resetuje ten znacznik
  podczas parsowania, a kod strony potwierdza gotowość po inicjalizacji.
- Jeśli wysokość etapu zależy od dodatkowego odczytu (np. przyczyna blokady
  akcji, podsumowanie), zgłoś `holdSkeletonLayout(elementy, promise)` zanim
  dodasz `skel-step-ready`. Silnik wstrzyma tylko te jeszcze nieodsłonięte
  etapy, przygotuje geometrię i odsłoni je po obietnicy; powłoka i inne etapy
  nie czekają. Gotowego etapu nie chowa ponownie, błąd zwalnia bramkę.
  Obietnica powinna obejmować także render danych ustalających wysokość.
  Przykład: pasek i karta Ankiety czekają na walidację oraz podsumowanie,
  natomiast wyniki pozostają osobnym etapem. Scena regresji:
  `polls-draft-text-blocked-slow` (dane +250 ms, także 360 px).
- Zachowaj docelowy rozmiar miejsca na dane (flex, min-height, zarezerwowany
  wiersz podsumowania). `visibility` i `opacity` zachowują geometrię;
  `hidden` usuwa element z układu, więc nie zastępuje miejsca na dane.
- `run.cjs --audit` obserwuje layout-shift od startu dokumentu do gotowego
  widoku, przed kliknięciami sceny. `skok-po-zaladowaniu`: suma po odsłonięciu
  > 0,01 jest błędem. `layout-load.json` zawiera czasy odsłonięcia, sumy przed
  i po oraz geometrię źródeł. `--latency=250` sprawdza stopniowe ładowanie,
  `--part=1/2` i `--part=2/2` dzielą pełny przebieg na dwie części.

## 6. Elementy (katalog)

| Potrzebuję | Użyj | Uwagi |
|---|---|---|
| przycisk | `.btn` (+ `.sm`, `.xs`, `.lg`, `.full`) | jeden wygląd; rozmiar klasą, nie własnym CSS |
| główna akcja | `.btn.gold` | jedna na widok |
| usuń / niebezpieczne | `.btn.danger` | |
| przycisk z samą ikoną | `.btn.icon` (`.btn.sm.icon`) | kwadrat o wysokości przycisku |
| ikona/tekst bez tła (w polu, wierszu) | `.btn-plain` + klasa rozmiaru | np. `.btn-plain.searchClear` |
| włączony przełącznik / wybrana opcja | `.is-active` lub `aria-pressed="true"` | nie własne kolory aktywnego |
| wyłączony | atrybut `disabled` | wygląd z `.btn:disabled` (kolory, bez `opacity`) |
| pole tekstowe | `.inp` (`.field` z `.field-label`, `.field-error`) | |
| pole szukania | `.searchBox.searchBox--field` + `.searchText` + `.btn-plain.searchClear` | lub cały pasek z `core/list-search.js` |
| lista rozwijana | `.ui-select` + `core/ui-select.js` (`initUiSelect`) | |
| przełącznik segmentowy | `.toggle-group > label.toggle-item` | |
| suwak | `input[type=range]` (`.rng`) | tor przez `--track` |
| wybór koloru | `colorPickerHTML(prefix)` + `bindColorPicker(root, { value, onChange })` z `core/color-picker.js` | wartości: `core/color.js` (`normHex`, `hexToRgb`, `rgbToHex`), zapis `#RRGGBB` |
| karta | `.card` (poziom 1), `.card--inset` (w karcie), `.card--entry` (formularz wejścia) | |
| karta z wypustkami | `.tabs-card > .tabs-strip > .tab-slot > .tab-label` + `.card` | stan: `markActiveTab(labels, active)` z `core/tabs.js`; karta w adresie: `tabFromUrl`/`setTab` |
| dwie karty obok / wypustki na telefonie | `.tabs-card--split` + `.split-panels` + `core/split-tabs.js` | |
| kafel zasobu | `.grid` + `.tile` (+ `.x` usuń) | jak Gry/Bazy/Loga |
| wiersze z sekcjami (zaproszenia, zadania) | `renderRowSections` z `core/share-sections.js` | |
| licznik | `.badge` | pusty = ukryty |
| oznaczenie (status) | `.tag` (`--bad`, `--warn`, `--info`, `--muted`) | |
| podpowiedź pod tytułem / polem | `.hint` | dymek: atrybut `data-tooltip` (`core/tooltips.js`) |
| komunikat w treści | `.callout` (`--warn`, `--bad`, `--ok`, `--info`) | ukryty atrybutem `hidden` |
| tabela danych | `.data-table-wrap` (`--scroll`: wysokość 420 px) > `table.data-table` (`--wide`: min. 860 px, przewijanie w poziomie) | pusta: `td.data-table-empty`; nagłówek przyklejony |
| komunikat po akcji | `toast()` z `core/toast.js` | |
| komunikat w treści (stopka okna, pod polem) | `.importMsg` + `setMessage(el, tekst, "error"\|"ok")` z `core/toast.js` | pusty znika; błąd czerwony |
| pusty stan | `emptyState(tekst, { variant: "inline"\|"tile", hook })` / `emptyStateHtml(…)` z `core/empty-state.js` | `hook` — klasa-uchwyt dla logiki strony (np. `list-empty`) |
| pełny ekran | `.fs-btn` + `initFullscreenButton({ button, a2hs, a2hsClose })` z `core/fullscreen.js` | iPhone bez API: okno `.a2hs`; awaryjnie `html.pseudoFS` |
| pasek na górze strony | `.notice-bar` | np. przypomnienie gościa |
| pusty stan | `.empty-state` (`--tile`, `--inline`) | |
| okno potwierdzenia / pytanie / postęp | `confirmModal`, `alertModal`, `promptModal`, `progressModal` z `core/modal.js` | na telefonie same przechodzą w arkusz od dołu |
| własne okno | `.overlay.modal--sheet > .modal` + `openDialog(overlay, { onClose, onBack })` / `closeDialog(overlay)` z `core/modal-sheet.js` | Esc, klik w tło i `[data-modal-cancel]` klikają X w nagłówku okna (`.mHead`/`.uni-head` z ikoną `close`) — bez własnych obsług; okno bez X (blokujące) zostaje |
| przycisk dwóch stanów (obie wartości widoczne, np. Podgląd \| Edycja) | `.toggle-group > label.toggle-item > input[radio] + span.toggle-slider`; z JS `toggleGroupEl()` z `core/toggle-group.js` | klik w część wybiera tę wartość (klik w wybraną nic nie zmienia); `--sm` jak `.btn.sm` |
| zaznaczenie elementu (kafel, wiersz, tag) | klasa `.is-selected`; wiersz z polem wyboru — samo zaznaczone pole | jeden wygląd w silniku, strona go nie zmienia |
| menu pod przyciskiem | `placeDropdown(anchor, el)` z `core/popover.js` | menu w punkcie: `placeAtPoint(el, x, y)` |
| ekran blokady („tu nie wejdziesz”, zasób zajęty) | `blockingScreen(id, actions, { prefix })` + `setBlockingIcon` / `setBlockingOpen` z `core/blocking-screen.js` | |
| strona blokady (przerwa techniczna, 404) | `body.page--block` > `main.block-main` > `.block-card` > `.block-card-top` (`.block-title`, `.block-text`) | ładuje ją też telewizor (`flat.css`) |
| strażnik urządzenia (ekran ukryty do decyzji) | `<html data-device-guard-pending>` + `device-guard.js` usuwa atrybut | strony robocze na wąskim ekranie: `data-mobile-guard`; reguły w `base.css` |
| błąd wczytania ekranu urządzenia | `.device-load-error` | Prowadzący, Przycisk |
| przesuwanie palcem w bok | `onSwipe(el, fn)` z `core/swipe.js` (dodaje `.swipe-target`) | |
| pasek narzędzi listy (szukanie, filtr, sortowanie, akcje) | `.list-toolbar` (`-left`, `-right`) + `core/list-search.js` | Gry, Bazy, Logo |
| strony logowania | `body.auth-body` + `.auth-shell` | |
| przycisk w rogu (pełny ekran) | `.corner-btn` (+ `.fs-btn`) | |

### 6a. Okno: nagłówek, akcje, treść (wyśrodkowane na komputerze, od dołu na telefonie)

Okno składa się z nagłówka (`.uni-head` / `.mHead` z `.mTitle`), podpowiedzi
(`.mSub` albo `.uni-hint` w `.uni-body`), treści i stopki z przyciskami
(`.uni-foot` / `.modal-actions`). Na telefonie `modal-sheet.js` układa je
sam: tytuł i przyciski w jednym wierszu, dopóki się mieszczą (inaczej
przyciski pod tytułem), podpowiedź pod nimi, potem przewijana treść.
Stronie zostaje treść — strukturę opisują znaczniki:

| potrzeba | znacznik | zachowanie w oknie od dołu |
|---|---|---|
| kilka kroków w jednym oknie (lista → nowy element → kolor) | `<section class="modal-layer" hidden>` dla każdego kroku, przełączanie `showModalLayer(layer)` | każda warstwa ma własny nagłówek, akcje i treść |
| treść stoi, przewija się tylko lista | `.sheet-fill` na drodze od treści do listy, `.sheet-scroll` na liście | wypełnienie ma wysokość treści i kurczy się do okna; kurczy się lista |
| sekcje udostępniania (`.shareSection` z `.shareList--scroll`) | rodzic `.sheet-fill` | każda sekcja kurczy się, przewija się jej lista |
| lista z limitem wysokości na komputerze | `.modal-scroll` | bez limitu — przewija się cała treść okna |
| obraz / podgląd na całe okno | `.modal--media` na `.modal`, `.sheet-fill` na polu obrazu | obraz od krawędzi do krawędzi, pole na całą wysokość |

Brakuje czegoś? Najpierw sprawdź `components.css` (nagłówki sekcji `/* ── … */`)
i `wzorce-ui.md`. Nowy element: do `components.css` (w `@layer components`),
z sceną zrzutów i wpisem w tej tabeli.

## 7. Zasady, które pilnują testy i audyt

1. **Bez `!important`** w plikach stron (§3).
2. **Bez kolorów na sztywno** poza `tokens.css`.
3. **Bez stylów w JS/HTML**: żadnego `style="…"`, `el.style.x = …` na stały
   wygląd, `style.cssText`. Dozwolone tylko wartości liczone na bieżąco
   (pozycja, rozmiar, `transform` przy przesuwaniu) i zmienne CSS przez
   `style.setProperty("--x", …)`. Pokazywanie/ukrywanie: atrybut `hidden`.
   **Wartości z JS — `core/ui-metrics.js`:** pasek postępu `setProgress(el, pct)`
   (CSS: `width: var(--p, 0%)` — `.progress-bar`, `.aBar`, linia etapów),
   słupek wykresu `--h`, kolor z danych `--c` (kropki tagów, próbki kolorów,
   podgląd koloru), inne zmienne `setVars(el, { "--x": … })`; w szablonie HTML
   tylko `style="--x:…"`. Odstępy wyskakujących elementów: `EDGE_PAD` (8,
   od krawędzi okna), `ANCHOR_GAP` (8, menu od przycisku), `LIST_GAP` (6,
   lista od pola) — liczy je `popover.js` (`placeDropdown`, `placeUnder`,
   `placeAtPoint`); nowe menu/panel pod przyciskiem — `placeDropdown`, nie
   własne liczenie.
   **Pomiary na żywo — `core/geometry.js`** (jedyne miejsce, które zapisuje
   położenie i rozmiar z pomiarów): `setFloat` (element nad stroną: menu,
   dymek, lista; sam przelicza współrzędne, gdy przodek ma `transform`),
   `measureHidden` (pomiar ukrytego), `setBox` + `anchorBox` (ramka
   zaznaczania, kadr), `setShift` (zoom, przesuwanie), `setCell` (komórka
   siatki), `setWidth`/`setMinWidth`/`widthAttr` (kolumny, okno). Ustawiają
   zmienne CSS i klasę `geo-*`; reguły w `components.css` (warstwa `states`).
   Zapadka `unit/uiMetrics.test.js`: zero `el.style.x = …` w kodzie stron.
4. **Android — przyciski z ikonami:** tło kryjące (odcień
   `--btn-tint` na `--under`, jak `.btn`), bez `opacity` < 1, `filter`,
   `backdrop-filter` i `transform` w stanach dotyku. Podświetlenie
   najechania tylko w `@media (hover: hover) and (pointer: fine)`.
   Wyłączony = kolory `--disabled-*`, nie `opacity`. Kryć musi też
   **podłoże pod przyciskiem** (pole szukania, lista, wiersz, karta z
   odcieniem `--w-*`/`--g-*`): `linear-gradient(odcień, odcień) var(--under)`,
   a ikona w przycisku jest przygaszana kolorem (`--text-muted`), nie
   `opacity`. Audyt zrzutów (`--audit`, telefon) sprawdza przycisk i przodków.
5. **Strefa bezpieczna zawsze:** odstępy przy krawędziach z
   `env(safe-area-inset-*)` (silnik robi to w `.wrap`, `.topbar`, `.footer`,
   arkuszach — własne elementy przyklejone do krawędzi muszą to dodać).
6. **Nic nie ucięte i nie schowane:** tekst ucięty wielokropkiem pokazuje
   całość w podpowiedzi (silnik robi to sam); brak poziomego przewijania;
   przewijanie dokumentu tylko na stronach z listy w `audit-layout.cjs`.
7. **Te same nazwy:** nie twórz `mobile-only`, jeśli jest `only-mobile`;
   nie twórz `.myCard`, jeśli wystarczy `.card` + układ. Strona nie
   przestylowuje elementu silnika gołą klasą — wariant w silniku albo reguła
   zawężona `:where(.body-strony) .klasa` (ta sama specyficzność). Wyjątek:
   wiersz listy Eksploratora to historycznie `.row` (129 odwołań w e2e) — zmiana
   nazwy razem z przepisaniem `base-explorer.spec.js` na `helpers/e2e-test`.
8. **Bez martwego CSS:** test `cssDead` (`scripts/css-dead.cjs`) sprawdza, że
   każda klasa z pliku strony występuje w HTML lub JS, który ta strona ładuje
   (graf importów). `var(--x)` bez definicji zatrzyma test `cssTokensDefined`.

## 7a. Ruch i płynność

Jedna rodzina animacji, czasy z tokenów (`--dur-fast` .12 s, `--dur-base`
.2 s, `--dur-slow` .3 s, `--ease-out`); ograniczony ruch w systemie
(`prefers-reduced-motion`) wyłącza wszystko (base.css).

- **Okna** — otwarcie: tło się rozjaśnia, okno wjeżdża lekko z dołu
  (`modal-in`); zamknięcie odwrotnie (`is-closing`), arkusz na telefonie
  zjeżdża w dół (`sheet-closing`). Zamyka zawsze `closeDialog(overlay, then)`
  albo `animateClose(overlay, done)` (`core/modal-sheet.js`): klasa zamykania
  trzyma ostatnią klatkę do schowania okna, koniec po `animationend`. Nie
  chować okna ręcznie (`hidden = true`) z pominięciem tych funkcji.
- **Między stronami** — bez View Transitions: przejście na stronę bez tej
  reguły (`/go/` → urządzenie) i przeładowanie dawały nieobsłużony błąd
  „Transition was skipped” i opóźniały nawigację (e2e Control, 2026-10-24).
- **Zakładki i sekcje** — panel `[role=tabpanel]` i rozwinięta lista sekcji
  (`.rowsList.is-expanding`) wjeżdżają łagodnie (`panel-in`).
- **Menu, listy, podpowiedzi** — `popover-in`; przyciski, pola, kafle —
  przejścia kolorów, obwódek i lekkiego uniesienia.

### Animowane części ikon (2026-10-25)

`icon("hamburger", { animation: "menu" })` morfuje kreski według
`aria-expanded` najbliższego przycisku. `icon("coffee", { animation: "steam" })`
zmienia krzywe pary przy nieruchomej filiżance. HTML przy hydracji:
`<i data-icon="coffee" data-icon-animation="steam"></i>`.

Rysunek pochodzi z jednego pliku SVG. Po zmianie części:
`node scripts/build-icon-parts.mjs`; wygenerowany `icon-parts.js` jest
sprawdzany przez unit. Zwykłe ikony nadal używają zewnętrznego SVG.
Brak pobierania lub wymiany rysunku po odsłonięciu strony. Geometria pola
24×24, rozmiar em i currentColor są wspólne. Animacja nie ustawia stylów inline.
`icon-motion.js` zatrzymuje SMIL pary poza obszarem widoku, przy ukrytej
karcie i ograniczonym ruchu; odpina usunięte elementy. Hamburger w reduced
motion natychmiast pokazuje poprawny stan. W przeglądarce bez odpowiednich
API pozostaje statyczny rysunek. Audyt kandydatów: `animowane-ikony-audyt.md`.

## 8. Nowa strona — kroki

1. HTML: szkielet z §5, pliki z §2, elementy z §6.
2. CSS strony: `@layer page { … }` — tylko układ.
3. JS: `initPage()`, moduły z §6 (nie kopiuj ich kodu).
4. Nowy katalog strony: dopisać do `CODE_DIRS` w
   `tests/e2e/helpers/branch-code.js` (e2e z brancha).
5. Scena zrzutów w `scripts/screens/scenes.cjs` (+ dane w
   `scripts/screens/data/`), potem
   `node scripts/screens/run.cjs --scenes=<id> --audit` — audyt sprawdza
   przewijanie, ucięcia, strefę bezpieczną i przezroczystość na dotyku.
6. `node scripts/build-flat-engine.mjs`, `node scripts/version-assets.js`,
   unit: `cd tests && node --test unit/*.test.js` (zapadka `cssAudit`).
7. E2E punktowo (CLAUDE.md, „Cykl wdrożenia”).

## 9. Nowy element w silniku — kroki

1. Sprawdź, czy nie istnieje pod inną nazwą (grep w `web/shared/style/`
   i `wzorce-ui.md`).
2. Dodaj w `components.css` (lub `layout.css`, jeśli to szkielet strony)
   w odpowiedniej warstwie; wartości z tokenów.
3. Logika współdzielona → moduł w `web/shared/js/core/` z testem unit.
4. Wpis w §6 tutaj i w `wzorce-ui.md`; usuń dotychczasowe kopie na
   stronach w tym samym kroku (zrzuty przed/po).
