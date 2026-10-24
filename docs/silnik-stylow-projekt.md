# Silnik stylów i wspólne mechanizmy — projekt (E23)

Status: **projekt z decyzjami użytkownika** (2026-10-21, §11); start po E13. Bez zmian w `web/` do
decyzji użytkownika. Plan etapu i pomiary: [`wspolne-style-plan.md`](wspolne-style-plan.md).
Wzorce wyglądu: [`wzorce-ui.md`](wzorce-ui.md) (część do aktualizacji, patrz §10).

Kierunek (decyzja użytkownika 2026-10-21): nowy silnik stylów od zera →
ujednolicenie wszystkich wspólnych mechanizmów → ostrożne przepinanie
strona po stronie. Ujednolicenie „na maksa”.

---

## 1. Zasada przejścia: dwa światy obok siebie

- Nowy silnik i nowe moduły powstają **obok** starych (`web/shared/style/`,
  `web/shared/ui/`). Stary `base.css`, `games.css` i `core/*` działają bez
  zmian dla stron jeszcze nieprzepiętych.
- Strona przechodzi **w całości**: jednym krokiem zmienia CSS (tylko silnik +
  własny plik układu), znaczniki i moduły JS. Strona nigdy nie ładuje
  starego i nowego CSS naraz — brak konfliktów kaskady w okresie przejścia.
- Stary CSS i stare moduły usuwane dopiero, gdy nie ładuje ich żadna strona
  (audyt to wykaże).
- Ryzyko jednej strony = jedna strona; każda strona ma osobny cykl
  (zrzuty przed/po → e2e z brancha → `main` → kontrola).

Uzasadnienie: obecne konflikty (`overlay`/`modal`/`tabs-card`/`card` przez
`games.css`) i moduły przyklejone do klas stron (`games-bottom*`,
`market-preview`) wykluczają bezpieczne poprawianie w miejscu.

## 2. Pliki silnika

`web/shared/style/` (ścieżka pod `/shared/` — Worker przerwy technicznej
już ją przepuszcza, `isSharedAssetPath`):

| plik | zawartość |
|---|---|
| `tokens.css` | tylko `:root` z tokenami; **bez nowoczesnych funkcji** — ładują go też ekrany gry (TV/Tizen) |
| `base.css` | reset, `body`, typografia, linki, fokus, `[hidden]`, przewijanie |
| `layout.css` | szkielety stron (§5), siatki, stosy |
| `components.css` | komponenty (§4) |
| `utilities.css` | mała, zamknięta lista klas pomocniczych (§4.3) |

- Linkowane bezpośrednio w `<head>` w stałej kolejności, **bez `@import`**
  (decyzja wydajnościowa E13.3). Plik strony (np. `web/games/css/games.css`
  w nowej postaci) zawiera wyłącznie układ tej strony.
- Do rozważenia później: skrypt sklejający pliki silnika w jeden
  (`engine.css`) w CI — tylko jeśli Lighthouse pokaże koszt kilku plików.
- Krytyczny CSS strażników (`html[data-*-guard] body{visibility:hidden}`)
  zostaje w `<head>` stron urządzeń — jedna wspólna linijka.

### 2.1 Warstwy kaskady

`@layer reset, tokens, base, layout, components, utilities, page;`

- Kolejność warstw zamiast walki specyficznością → **zero `!important`**
  (wyjątek: `[hidden]` w warstwie `utilities`).
- Plik strony w warstwie `page` wygrywa z komponentami bez podbijania
  selektorów.
- Wymaga przeglądarki z `@layer` (§9). `tokens.css` poza warstwami.

## 3. Tokeny

Dwa poziomy: **paleta** (surowe wartości, nieużywane bezpośrednio przez
strony) i **znaczenie** (to, czego używają komponenty i strony).

### 3.1 Kolory

- Paleta: `--c-ink-950 #050914`, `--c-ink-900 #111827`, `--c-ink-850 #121524`,
  `--c-ink-800 #070b16`…, `--c-gold-300 #ffeaa6`, `--c-gold-500` (zwinięte
  #f5d26b/#f7d27b/#ffd86e/#ffd766/#f5c518), `--c-red-*`, `--c-green-*`,
  `--c-team-a #c4002f`, `--c-team-b #2a62ff`.
- Przezroczystości jako rodziny (decyzja użytkownika co do zwinięcia, §11):
  biel `--a-white-3/6/10/14/18/25`, czerń `--a-black-18/25/35/45/70`,
  złoto `--a-gold-10/35/55`.
- Znaczenie: `--bg`, `--surface-1` (karta), `--surface-2` (zagnieżdżona
  sekcja), `--surface-sunken` (lista, pole), `--surface-modal`, `--line`,
  `--line-strong`, `--text`, `--text-soft`, `--text-muted`, `--accent`
  (złoto), `--danger`, `--success`, `--warning`, `--scrim`, `--scrim-modal`,
  `--focus`.
- Konflikty dziś (`--bg` różowe na wyświetlaczu, `--line` jako długość w
  hoście, `--card` w auth-landing) znikają: ekrany gry mają własne tokeny
  z prefiksem (`--disp-*`, `--host-*`, `--buzz-*`), a wspólne nazwy znaczą
  wszędzie to samo.

### 3.2 Odstępy, typografia, promienie, cienie, warstwy

- Odstępy (dziś faktycznie 2/4/6/8/10/12/14/16/18/20/24/32):
  `--sp-1 2px … --sp-12 32px`; `--page-gutter` zostaje.
- Typografia (dziś 25+ rozmiarów w px/rem/em): `--fs-xs 11`, `--fs-sm 12`,
  `--fs-md 13`, `--fs-base 14`, `--fs-lg 16`, `--fs-xl 18`, `--fs-2xl 20`,
  `--fs-3xl 24`, `--fs-4xl 28/32`; wagi `--fw-regular/bold/heavy (900)`;
  `--font-ui`, `--font-mono` (dziś 5 różnych stosów mono).
- Promienie (dziś 15 wartości): `--r-sm 8`, `--r-md 12`, `--r-lg 16`,
  `--r-xl 22`, `--r-pill 999` — decyzja §11.
- Cienie: `--shadow-sm/md/lg` (z rodzin czerni .22–.55).
- Warstwy: `--z-local 1…10`, `--z-sticky 100`, `--z-drawer 300`,
  `--z-menu 500`, `--z-float 600`, `--z-modal 1000`, `--z-toast 2000`,
  `--z-tooltip 2100`, `--z-block 9999`.
- Ruch: `--ease`, `--dur-fast/base/slow`; `prefers-reduced-motion` w `base`.

### 3.3 Progi: mało progów + rodzaj urządzenia (decyzja 2026-10-21)

Decyzja użytkownika: 8 progów to za dużo; **dotyk/rodzaj urządzenia jako
dodatkowy warunek** (jak w strażnikach), dzięki czemu progów szerokości
jest niewiele. Zmienia to zasadę E20 z 2026-10-13 („układ wynika tylko
z wymiarów”): rodzaj urządzenia **jest** warunkiem układu.

**Rodzaj urządzenia** — profil z `device-guard.js` (`getDeviceProfile`:
`formFactor` phone/tablet/desktop/tv, `touch`; telefon = dotyk i krótszy
bok < 700 px) wystawiony na `<html>` **przed pierwszym malowaniem**
(mały skrypt w `<head>`, aktualizacja przy obrocie/zmianie okna):

- `html[data-device="phone|tablet|desktop|tv"]`
- `html[data-input="touch|pointer"]`
- `html[data-orientation="portrait|landscape"]`

Przykłady: telefon poziomo (844 px) zostaje telefonem (pasek ikon,
okna jako arkusze) bez progu szerokości; tablet nie dostaje wariantu
telefonu z samego dotyku; laptop z ekranem dotykowym zostaje komputerem.
Większe cele dotyku dla `data-input="touch"`.

**Progi szerokości** (zamknięta lista pilnowana przez audyt
`ALLOWED_WIDTHS`, zawsze `max-width`, ewentualnie `min-width: próg+1`):

| nazwa | px | rola |
|---|---|---|
| `narrow` | 600 | wąskie okno na komputerze/tablecie (np. podzielony ekran) |
| `work` | 980 | topbar telefon/komputer, minimum stron pracy (Control) |
| `wide` | 1280 | dodatkowe kolumny na dużych ekranach |

Wysokość: `short` 500 (TV 650 zostaje w pliku TV).

Dzisiejsze 400/640/720/760/768/900/1100/1120/1200/1366/1400 znikają:
telefon → `data-device`, układ elementu w kolumnie → `@container`
(niżej), reszta → najbliższy z trzech progów.

**Zapytania kontenerowe** (`@container`) dla elementów, które stoją w
kolumnach o różnej szerokości: siatki kafli, formularz pytania (edytor
i Eksplorator), `.cards2/.twoCol/.qrRow`/podglądy urządzeń w Control,
listy finałowe (Control i ustawienia gry), układ kontaktów i Konta,
pasek Ankiety. Progi kontenerów: `360 / 600 / 900` (szerokość
kolumny, nie okna), także zamknięta lista.

## 4. Komponenty

Jedna klasa bazowa + modyfikatory; nazwy kebab-case `komponent`,
`komponent__część`, `komponent--wariant`; stany wyłącznie `is-*`
i atrybuty (§6.1). Każdy komponent: wygląd na telefonie i komputerze,
stany (hover, focus-visible, disabled, is-active, is-loading), RTL nie.

### 4.1 Lista komponentów i co zastępują

| komponent | warianty | zastępuje (dziś) |
|---|---|---|
| `button` | `--primary` (złoty), `--danger` (obrys), `--ghost`, `--icon`, rozmiary `--sm/--xs` | `.btn*`, `.icon-btn`, `.fsBtn`×3, `.fs-btn`, `.qr-fs-btn`, `.tbBtn`, `.ctxBtn`, `.tcBtn`, `.abtn`, `.m-btn`, `.ansBtn`, `.c2-btn`, `.msg-icon-btn`, `.btn-external` |
| `field` (+`__label`, `__hint`, `__error`) | input, select, textarea, `--search` (lupa + X), `--name` | `.inp`, `.uni-inp`, `.name-field`, `.searchBox*`, `login input`, `.form input`, `.field`×2, `.gs-field`, `.xField`, `.mkt-search-field` |
| `select` (ui-select) | | `.ui-select*` (bez inline pozycjonowania) |
| `toggle`, `checkbox`, `radio`, `range` | | `.toggle-*`×2, `.rng`/`.sliders`×3 |
| `dialog` | `--sm` (uni), `--lg` (overlay>modal), `--sheet` (telefon), `--fullscreen` | `.overlay`/`.modal` (6 kopii), `.uni-modal`, `.m-modal`, `.colorModal*`×2, `.dt-modal`, `.imgv-overlay`, `.market-preview-overlay` |
| `block-screen` | ochrona strony, blokada zasobu, dzierżawa urządzenia, przerwa | `.blocking-overlay` ×3 implementacje |
| `card` | poziom 1/2, `--tabs` (wypustki A, decyzja 2026-10-21) | `.card`×3, `.tabs-card` (+ zmienne per strona), `.games-card`, `.simple-tabs` (manual — wariant) |
| `tile` | `--add`, `--media` (logo), `--compact` | `.tile`, `.mkt-card`, `.logoTile`, `.addCard`/`.addTile`, `.connect-device-tile`, `.gs-logo-tile` |
| `row` (wiersz listy) | `--share`, `--compact`, `--selectable` | `.shareRow`, `.rows*`, `.activity-row`, `.device-row`, explorer `.row` |
| `toolbar` (pasek akcji) | górny, dolny, `--split` (lewa/prawa) | `.bar`, `.actions`, `.games-bottom*`, `.pollBar*`, `.mkt-head`, `.stepFoot` |
| `list-tools` | szukaj/filtr/sortuj | dwie wyszukiwarki (list-search, share-sections) |
| `badge`, `tag`, `pill`, `chip` | kolory znaczeniowe | `.badge`, `.tag*`, `.mail-pill*` (12+), `.msg-pill`, `.xCountPill`, `.ans-chip`, `.qf-sumChip`, `.mkt-*-badge` |
| `empty-state` | `--tile`, `--inline` | 7 wersji pustych stanów |
| `toast` | `--error` | `.app-toast` (już wspólny) |
| `status-line` | info/ok/błąd, stała linia komunikatu | `setMsg`/`setStatus`/`showStatus` (~12) |
| `tooltip`, `menu` (kontekstowe, popover) | | `.app-tooltip`, `.context-menu`, `.lang-menu`, `.account-menu`, `.nav-more-dropdown` |
| `tabs` | wypustki, `--pills` | `.tab-*`, `.tab-btn`, `.simple-tabs` |
| `progress` | pasek, kroki | `.uni-progress*`, 4× inline paski w Ustawieniach |
| `data-table` | | inline tabele w Ustawieniach |
| `skeleton` / `is-loading` | | `[data-skel-step]`, `page-loading` |
| `color-picker` | | 2 pickery (ustawienia gry, Eksplorator) |
| `fullscreen-button`, `a2hs` | | 5 kopii pełnego ekranu, 3 kopie banera |

### 4.2 Wzorce złożone

`share-section` (sekcje udostępniania — już wspólny komponent JS),
`topbar` (4 sekcje, wariant tytułu strony pracy), `footer`, `drawer`
(szuflada: Eksplorator, ustawienia gry, menu topbaru).

### 4.3 Klasy pomocnicze (zamknięta lista)

`stack` (pion z odstępem `--gap`), `cluster` (poziom z zawijaniem),
`grow`, `between`, `center`, `mt-1…mt-6`, `text-muted`, `text-soft`,
`text-sm`, `nowrap`, `truncate`, `visually-hidden`, `[hidden]`. Powód:
najczęstsze style z HTML to `display:none` (74), `margin-top:8/10/12px`,
`flex:1`, `justify-content:space-between`, `align-items:center`.
Nowych klas pomocniczych nie dodaje się bez wpisu w tym dokumencie.

## 5. Szkielety stron (`layout.css`)

| szkielet | strony | progi |
|---|---|---|
| `page--list` (bar + karta z wypustkami + siatka + dolny pasek) | Gry, Bazy, Logo, Społeczność (Znajomi/Subskrybenci), Zadania, Społeczność gier (market) | urządzenie + narrow, work |
| `page--work` (tytuł w topbarze + karta z wypustkami / krokami) | Ankieta, Konto, Mails, Control | urządzenie + work, wide; kontenery |
| `page--editor` (panel boczny + praca, szuflada poniżej progu) | edytor gry, Eksplorator, ustawienia gry, edytory logo | urządzenie + work; kontenery |
| `page--entry` (jedna karta pośrodku, 520–720 px) | login, confirm, reset, Go, Connect, głosowanie publiczne | urządzenie |
| `page--doc` (tekst, spis treści) | Instrukcja, Prywatność, strona główna (sekcje) | urządzenie + work |
| `page--block` (ekran blokady) — **jeden wzorzec dla przerwy i 404** (decyzja 2026-10-21) | przerwa techniczna, 404 | urządzenie + short |
| ekrany gry (poza silnikiem, tylko `tokens.css` + wspólne okna/komunikaty) | wyświetlacz, host, buzzer, TV, QR ankiety, snake | własne |
| `page--admin` (nawigacja paneli + tabele) — **ostatnia faza E23** (§8a) | `/admin/` | urządzenie + work, wide; kontenery |
| **poza E23:** laboratoria `/admin/tools/*` (strony techniczne, celowo bez wspólnego silnika) | — | — |

Treść ograniczona szerokością tylko tam, gdzie wzorzec tak mówi (dziś
`.wrap` nie ma `max-width`; karty mają własne limity 520/560/680/720).

## 6. Wspólne mechanizmy (`web/shared/ui/`)

### 6.1 Konwencje DOM (jedna dla całej aplikacji)

| stan | konwencja | dziś |
|---|---|---|
| ukryte | atrybut `hidden` (`el.hidden = true`) | `style.display` 237×, `.hidden=` 219×, klasa `hidden` 35×, `is-hidden` |
| otwarte | `is-open` + `aria-expanded` / `aria-modal` | `.open`, `.is-open`, `.show`, `.on`, `display:grid/flex` |
| aktywne | `aria-selected` (karty), `aria-current` (nawigacja), `is-active` (filtry, przełączniki) | `.active` 50×, `.is-active`, `selected`, `is-selected` |
| wyłączone | natywne `disabled`; inne elementy `aria-disabled="true"` | + `is-disabled` |
| ładowanie | `aria-busy="true"` / `data-ready` | `page-loading`, `skel-step-ready` (34 pliki) |

Zakaz w nowych modułach i przepiętych stronach: `style.display`,
`style.cssText`, stały wygląd przez `el.style.*`. Dozwolone inline:
wartości liczone na bieżąco (pozycja, rozmiar, transform) i zmienne CSS
przez `style.setProperty('--x', …)`.

### 6.2 Moduły

| moduł | API (szkic) | łączy |
|---|---|---|
| `dialog.js` | `openDialog(el \| spec) → { close, result }`; warianty sm/lg/sheet/fullscreen; ESC, tło, historia, fokus, blokada przewijania — w jednym miejscu | `modal.js`, `modal-sheet.js`, 33 lokalne open/close, ~15 obsług tła, 5 ESC, 5 kopii `show()`, `contact-modal`, `resource-send`, `guest-info`, `guest-migrate`, `rating-editor` |
| `confirm.js` | `confirm()`, `alert()`, `choice()`, `prompt()`, `progress()` na `dialog.js` | API `modal.js` (33 importy) |
| `block-screen.js` | `showBlock({ id, icon, title, message, actions })` | `page-overlay`, `resource-lock.showBlockingOverlay`, `device-lease` (HTML w 3 plikach), `showDeviceGuard` |
| `messages.js` | `toast()`, `statusLine(el).set(msg, kind)` | `toast.js`, ~12 `setMsg/setStatus/showStatus/showError` |
| `list-tools.js` | `initListTools({ list, search, filter, sort, empty })`, bez zależności od klas stron | `list-search`, `share-sections.attachListTools`, `list-header-layout` (`games-bottom*`), `list-filter` |
| `tabs.js` | `initTabs(root, { param })` — URL + wygląd + ARIA | `core/tabs.js` (tylko URL) + ręczne `.active` na stronach |
| `popover.js` | wspólne pozycjonowanie: menu, select, podpowiedź, menu kontekstowe | `ui-select` (inline `position:fixed`), `tooltips`, `context-menu` |
| `pickers.js` | `pickColor()`, wybór daty | 2 pickery koloru, `hexToRgb` ×3 |
| `states.js` | `emptyState({ icon, text, action })`, `markReady(el)`, `setBusy(el)` | `.empty-state` w 8 plikach, `showEmptyResult`, szkielety w 34 plikach |
| `device.js` | `fullscreenButton()`, `a2hsBanner()`, PWA | `fullscreen.js`, 5× `requestFullscreen`, 3 kopie A2HS, `beforeinstallprompt` w Grach |
| `page-shell.js` | `initPage()` dla wszystkich stron, wariant „bare” dla wejścia/urządzeń | `page-init`, `topbar-controller`, `nav-map`, `device-guard`, strony bez `initPage` (settings, mails, go, login, home, głosowanie, ekrany gry) |
| `tooltips` | bez samodzielnego ładowania CSS (styl w silniku) | `tooltips.js` + `tooltips.css` ładowany z JS |

Moduły bez zmian: `icons.js` (już wspólny), `nav-map.js`, logika
`list-filter`, `share-sections` (przepięte na nowe komponenty).

Moduły nie budują znaczników z `style=""`; okno kontaktu i wysyłki
przestają ręcznie przesuwać `.footer` i szukać `main.wrap`.

## 7. Narzędzia i testy

- **Audyt** (`scripts/css-audit.mjs`): nowy tryb dla silnika — parser
  rozumiejący `@layer` i `@container`; reguły dla stron przepiętych:
  0 kolorów, 0 `!important`, progi tylko z listy, `z-index` tylko tokenem,
  0 klas komponentów w pliku strony, 0 `style=` w HTML, 0 `style.display`
  w JS. Zapadka per strona: strona oznaczona jako przepięta musi mieć 0.
- **Zrzuty przed/po z porównaniem**: dziś system tylko robi zdjęcia.
  Dodać porównanie pikselowe (próg, maska animacji) dwóch katalogów
  `--out`, raport różnic. Dodać sceny dla stron bez scen (buzzer, Go,
  TV, Prywatność, przerwa, confirm, reset, QR ankiety, 404).
- **E2E**: 1777 odwołań do klas w 273 nazwach (najwięcej `.uni-modal`
  185, `.uni-foot` 135, `.btn` 128). Przy przepięciu strony jej spece
  przechodzą na role/`#id`/`data-*` (dziś brak `data-testid`; nie
  wprowadzać nowej konwencji, jeśli wystarczą role i id). Sceny zrzutów
  — `ready` na `#id`, nie na klasach.
- **Unit czytające CSS** do przepisania przy przepięciu danej strony:
  `solidButtons`, `controlSummaryLayout`, `progressiveLoading`,
  `urlState`, `tasksPage`, `frontendLayout`, `gamesRename`,
  `noModalPages`, `toast`.
- **Worker** (`assets.js`): silnik pod `/shared/` nie wymaga zmian;
  przepięte pliki stron Ustawień/przerwy — sprawdzić listy
  `isSettingsAsset`/`isMaintenanceAsset`. Podgląd przerwy w
  `settings.js:1054` ma ścieżki CSS na sztywno.
- `version-assets.js` obsłuży nowe pliki sam (literały ścieżek).

## 8. Kolejność prac

1. **Fundament** (bez zmian widocznych): pliki silnika, tokeny, warstwy,
   komponenty z galerią komponentów (strona-katalog w `scripts/screens`,
   nie w aplikacji), audyt w trybie silnika, porównywanie zrzutów,
   brakujące sceny.
2. **Mechanizmy** `web/shared/ui/` z testami unit (dialog, block-screen,
   messages, list-tools, tabs, popover, states, device, page-shell,
   pickers).
3. **Strona pilotażowa**: Zadania (mała lista, mało testów) — weryfikacja
   procesu przepinania, poprawki silnika.
4. **Strony po kolei** (każda: zrzuty przed → przepięcie CSS + HTML + JS →
   zrzuty po + porównanie → unit/e2e z brancha → `main` → kontrola):
   Znajomi/Subskrybenci → Connect → Go → login/confirm/reset →
   głosowanie publiczne → Gry → Bazy → Logo (lista) → Społeczność gier →
   Mails → Konto → Ankieta → Instrukcja/Prywatność → strona główna →
   edytory logo → edytor gry → ustawienia gry → Eksplorator → Control →
   przerwa/404 (jeden wzorzec) → ekrany gry (tokeny + wspólne okna).
   Na końcu panel admina (§8a). Laboratoria — poza E23.
5. **Sprzątanie**: usunięcie starego `games.css`, `core/modal*.js` itd.,
   i stary `base.css`, gdy audyt pokaże 0 użyć (po panelu admina);
   aktualizacja `wzorce-ui.md`. Laboratoria mają własne style.

## 8a. Panel admina `/admin/` (decyzja 2026-10-21: przepisać, ostatnia faza)

Najbardziej złożona strona: `settings.js` 7508 linii (242 funkcje,
43 szablony `innerHTML`), `settings.css` 2582 linie (66 `!important`),
`index.html` 1152 linie (153 `style=`, 9 tabel), ~11 paneli (status,
przerwa, poczta, marketing, kontakty marketingowe, Społeczność gier,
generator, oceny, zgłoszenia, statystyki, zrzuty strony głównej),
TinyMCE (`tox-*`), własne okna (`.dt-modal`, podgląd załącznika),
wyszukiwarki i paski stanu.

Zasada „strona przechodzi w całości” zostaje, ale z przygotowaniem na
starym silniku, bez zmian wyglądu:

1. **Analiza panel po panelu** (osobny dokument): elementy, stany, okna,
   tabele, zależności od TinyMCE i podglądu przerwy (`settings.js:1054`).
2. **Rozbicie `settings.js` na moduły paneli** (jeden plik na panel +
   wspólne pomocnicze) — bez zmian zachowania i wyglądu; unit/e2e admina.
3. **Style z HTML/JS do klas** w obecnym `settings.css` (153 `style=`,
   ~110 szablonów, 36 `cssText`) — bez zmian wyglądu.
4. **Sceny zrzutów dla każdego panelu** (dziś jedna scena `/admin/`).
5. **Przepięcie** na silnik i wspólne mechanizmy: komponent
   `data-table`, `progress`, `status-line`, `dialog`, `list-tools`,
   pigułki statusów poczty (12+ wariantów → `badge` ze znaczeniami).
   Zrzuty przed/po wszystkich paneli.

Szacunek: **8–12 dni** (kroki 1–3 to połowa).

## 9. Ograniczenia przeglądarek

- Telewizory (Tizen 6 ≈ Chromium 76, webOS) dostają tylko `/connect/tv/`
  i wyświetlacz → ekrany gry ładują wyłącznie `tokens.css` (sam `:root`),
  bez warstw i zapytań kontenerowych. `tv.spec.js` emuluje Tizen 6.
- Pozostałe strony już dziś wymagają `:has()` (15 plików CSS) — czyli
  Chrome 105+ / Safari 15.4+. Silnik z `@layer` (Chrome 99, Safari 15.4)
  i `@container` (Chrome 105, Safari 16) mieści się w tym samym poziomie
  poza Safari 15.4–15.x dla zapytań kontenerowych.
- Uwaga: przeglądarka bez `@layer` ignoruje całą zawartość warstwy —
  strona byłaby bez stylów. Decyzja o progu przeglądarek: §11.

## 10. Dokumentacja do poprawy

`wzorce-ui.md` nie zgadza się z kodem: A5 (kafel to `.tile` w base),
A7/A10 (numery linii), A11 (`.btn.danger` ma już obrys; `.green`
zdefiniowany mimo zakazu), A13 (`.empty-state` istnieje). Po zatwierdzeniu
projektu `wzorce-ui.md` opisuje komponenty silnika (§4) zamiast klas
starych plików.

## 11. Decyzje użytkownika (2026-10-21)

1. **Przeglądarki:** Safari 16+ / Chrome 105+ — tak (`@layer`,
   `@container`). Ekrany TV tylko `tokens.css`.
2. **Odcienie:** zwinąć, **jak najmniej** wartości. Cel: biel alfa 4
   (`4/8/14/25`), czerń alfa 3 (`20/40/70`), złoto alfa 3 (`10/35/60`),
   podłoża 3 (`bg`, `surface-1`, `surface-2`) + `surface-modal`. Zmiany
   pokazane na zrzutach przed/po.
3. **Promienie:** ujednolicić, **jak najmniej** wartości. Cel: `--r-sm 8`
   (małe: pigułki w polach, chipy), `--r-md 14` (przyciski, pola,
   wiersze, kafle), `--r-lg 20` (karty, okna) + `--r-pill`. Karty
   i zakładki — jedna wartość (`--r-lg`).
4. **Laboratoria** `/admin/tools/*` — bez podpięcia do silnika.
5. **Kolejność stron i pilot** — przyjęta domyślna z §8 (najpierw mała
   strona Zadania jako próba procesu, potem od prostych do złożonych).
6. **E23 po E13** — E13 dotyczy treści i zachowań, E23 to lekkie
   poprawki wyglądu bez zmiany zachowań; ewentualne zmiany w Instrukcji
   po E23 poprawić punktowo.
7. **Progi:** 3 szerokości + rodzaj urządzenia (dotyk) jako warunek (§3.3).
8. **Przerwa i 404:** jeden wzorzec `page--block`.
9. **Panel admina** `/admin/`: też przepisać — bardzo złożony, więc
   ostatnia faza E23 z przygotowaniem na starym silniku (§8a).

## 12. Szacunek

| część | dni |
|---|---|
| Fundament: silnik, tokeny, atrybuty urządzenia, komponenty, katalog, audyt, porównanie zrzutów, sceny | 6–8 |
| Mechanizmy `web/shared/ui/` z testami | 6–8 |
| Pilot (Zadania) i poprawki silnika | 1–2 |
| Strony (≈24 strony bez panelu admina; Control ~3, Eksplorator ~2, edytory ~3) | 18–23 |
| Przerwa/404 (jeden wzorzec), ekrany gry (tokeny, wspólne okna), sprzątanie, dokumentacja | 2–3 |
| Panel admina (§8a) | 8–12 |
| **Razem** | **≈ 41–56 dni roboczych sesji** |

Bez laboratoriów.
