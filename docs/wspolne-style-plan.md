# E23 — wspólne style i mechanizmy na wszystkich stronach

Cel (decyzja użytkownika 2026-10-21): **każda strona korzysta ze wspólnych
stylów i mechanizmów**. Plik strony zawiera tylko układ tej strony (siatka,
kolejność, rzeczy, których nie ma nigdzie indziej). Przyciski, pola, okna,
karty, wypustki, kafle, wiersze, paski akcji, oznaczenia, puste stany,
dymki, wczytywanie, kolory, odstępy, progi szerokości i warstwy (`z-index`)
pochodzą wyłącznie z `web/shared/css/`. Wzorce: [`wzorce-ui.md`](wzorce-ui.md).

## Decyzje

Katalog duplikatów i kolejność ujednolicania: [`e23-katalog-komponentow.md`](e23-katalog-komponentow.md).

- **Wyrównywać i poprawiać po drodze (decyzja użytkownika 2026-10-23):** „jeśli
  coś jest nierówne, niesymetryczne itd., a warto to wyrównać, poprawić — zrób
  (dodaj do planu)”. Przy każdej paczce oglądać zrzuty pod kątem wyrównania,
  odstępów i symetrii; poprawki od razu, większe do „Do poprawienia”.
- **Dostępność zawsze na plus (decyzja użytkownika 2026-10-23):** „poprawki
  ulepszające dostęp są na plus zawsze i są pożądane” — fokus z klawiatury,
  `aria-*`, prawdziwe `<button>` zamiast `div role=button`, kontrast, opisy
  przycisków-ikon, `prefers-reduced-motion`.
- **Skończony, najmniejszy zestaw elementów (decyzja użytkownika 2026-10-23):**
  „zestaw elementów ma być skończony i jak najmniejszy; używaj podobnych
  elementów tam, gdzie teraz są różne, jeśli zastosowanie pasuje”. Katalog
  komponentów silnika jest zamknięty: nowy element tylko, gdy żaden istniejący
  nie pasuje do zastosowania (wpis w `wzorce-ui.md`).
- **Te same nazwy dla tego samego (decyzja użytkownika 2026-10-23):** „elementy,
  które teraz mają inne nazwy a robią to samo, mają mieć te same nazwy;
  pozwalam ci na poprawianie JS i HTML też; nie musisz się pytać”. Zmiana
  nazwy klasy obejmuje CSS, JS, HTML, sceny zrzutów i selektory w specach e2e
  (tylko mechaniczna podmiana selektora — logika speców bez zmian).
- **Ujednolicać bez kompromisów (decyzja użytkownika 2026-10-23):** „musisz
  konsekwentnie i bezlitośnie ujednolicać i poprawiać, nie miej kompromisów”.
  Lokalne warianty komponentów, mechanizmów i wyglądu zastępować wspólnymi,
  także gdy zmienia to wygląd strony; zostawiać tylko to, czego wspólny
  komponent naprawdę nie może przejąć (uzasadnienie w Dzienniku).
- **„Więcej” na każdej stronie (decyzja użytkownika 2026-10-23):** „na
  większości stron nie jest potrzebne, ale lepiej żeby było dla spójności” —
  kontroler topbara daje je każdej stronie z przyciskami w sekcji 2.
- **Spójność ponad zgodność ze starymi zrzutami (decyzja użytkownika 2026-10-23):**
  „nie musisz dostosowywać każdej strony na 100%; jeśli coś jest lepsze
  i bardziej spójne, lepiej postawić na spójność niż zgodność ze starymi
  screenami”. Porównanie przed/po służy do wyłapywania błędów (zepsute
  elementy, regresje), nie do odtwarzania lokalnych odstępstw stron.
- **2026-10-21:** wspólne style wszędzie zamiast samego sprzątania; strony
  nie definiują własnych wersji wspólnych elementów (bez lokalnych kopii
  klas i nadpisań per strona).
- **Zakres Control i ekranów gry (decyzja użytkownika 2026-10-21):**
  panel Control (operator) — pełna zgodność ze wspólnymi stylami.
  Buzzer, host, wyświetlacz/TV i snake (żartobliwa kopia wyświetlacza) są
  odrębne — **częściowo**: wspólne tokeny (kolory, odstępy, `z-index`)
  oraz wspólne okna/komunikaty, gdy ich używają; własny wygląd rozgrywki
  zostaje (`control/buzzer`, `control/host`, `control/display`,
  `connect/tv`, `shared/css/tv-layout.css`, `snake`).

- **Kierunek (decyzja użytkownika 2026-10-21, po analizie):** to nie
  sprzątanie, tylko **ujednolicenie na maksa**. Kolejność:
  1. **nowy silnik stylów napisany od zera** (wspólne pliki, tokeny,
     komponenty, układy),
  2. **ujednolicenie wszystkich wspólnych mechanizmów i modułów JS**, które
     da się ujednolicić,
  3. **ostrożne przepinanie strona po stronie**; stary CSS usuwany dopiero
     po przepięciu wszystkich stron.
- **Progi szerokości (decyzja użytkownika 2026-10-21):** wspólne, ale
  **więcej progów** — strony, które potrzebują więcej miejsca, korzystają
  z wyższego progu z tej samej wspólnej skali (bez własnych wartości).
- **Style z HTML (decyzja użytkownika 2026-10-21):** atrybuty `style=`
  i bloki `<style>` wyciągnąć i uporządkować (do silnika albo pliku strony).
- **Analiza:** kontynuować i spisywać; implementacja silnika dopiero po
  zatwierdzeniu projektu.

## Stan wyjściowy (pomiar 2026-10-21)

- 35 plików CSS, 18,5 tys. linii; największe: `base.css` 3380,
  `settings.css` 2582, `control.css` 2158, `base-explorer.css` 2067.
- 1511 kolorów wpisanych na sztywno, 673 użycia `var(--…)`; `:root`
  w 10 plikach (osobne palety: base, auth-landing, tv, logo, display,
  control, buzzer, host, maintenance, games).
- 193 `!important` (settings 66, base 60).
- ~25 wariantów `@media` (600/620/640/720/760/768/900/980/1100 px…).
- `z-index` bez skali (1000, 9999, 10000, 10001, 99999).
- 124 proste selektory zdefiniowane w więcej niż jednym pliku (np.
  `.a2hs*`, `.colorModal*`, `.field`, `.hint`, `.card`, `.actions`).
- Własne wersje elementów: przyciski `.btn` w 10 katalogach, okna w 11,
  pola formularzy w 12, karty/zakładki w 9.
- ~200 klas z CSS bez wystąpienia w HTML/JS (control 90, settings 37,
  game-settings 25) — pomiar przybliżony, część klas składa JS.
- Style poza CSS: 885 przypisań stylu w JS, 320 `style=` w HTML,
  13 bloków `<style>`.

## Docelowa budowa `web/shared/css/`

1. `tokens.css` — jedna paleta (tło, karty, tekst, akcent, stany),
   odstępy, promienie, cienie, czcionki, skala `z-index`; progi szerokości
   zapisane raz (telefon / tablet / komputer) i używane wszędzie.
2. `base.css` — reset, body, typografia, topbar, stopka, układ strony.
3. Komponenty, każdy w jednym pliku: przyciski, pola i formularze, okna
   (`.uni-modal`, `.overlay > .modal`), karty i wypustki, kafle, wiersze
   i sekcje udostępniania, paski akcji, wyszukiwanie/filtry, oznaczenia,
   pusty stan, dymki, wczytywanie, blokady.
4. Strony: tylko układ własny; bez kolorów na sztywno, bez `!important`,
   bez własnych progów.
5. Mechanizmy JS (modal, toast, karty `?tab=`, wyszukiwarka, puste stany,
   blokady) — strona wywołuje wspólny moduł, nie buduje własnego DOM/stylu.
   Style inline w JS tylko dla wartości naprawdę dynamicznych (pozycje,
   rysowanie logo/planszy).

## Kroki (każdy: branch → zrzuty `scripts/screens/` → e2e punktowe → `main` → kontrola)

| # | Krok | Szac. |
|---|------|-------|
| 1 | **Zrobione 2026-10-21.** Narzędzie `scripts/css-audit.mjs` (bez zależności, zamiast stylelinta) + zapadka `tests/unit/cssAudit.test.js` z `scripts/css-audit/baseline.json` | 0,5 d |
| 2 | Usunięcie martwego CSS | 0,5–1 d |
| 3 | `tokens.css`: jedna paleta, odstępy, skala `z-index`, progi; podmiana wartości na zmienne we wszystkich plikach | 2–3 d |
| 4 | Przyciski i pola — jeden komponent, usunięcie wersji stronowych | 1–2 d |
| 5 | Okna — wszystkie przez `modal.js` i dwa wzorce okien | 1–2 d |
| 6 | Karty/wypustki, kafle, wiersze, paski akcji, oznaczenia, puste stany | 2–3 d |
| 7 | Strony po kolei: plik strony = tylko układ (kolejność: Gry/Bazy/Logo → Ankiety/Znajomi/Zadania/Connect → Konto/Ustawienia → Eksplorator → Control; buzzer/host/display/TV/snake tylko tokeny) | 3–5 d |
| 8 | Style inline z JS/HTML do klas; bloki `<style>` do plików | 2–3 d |
| 9 | Reguła w lintach: nowa strona nie może łamać zasad z pkt 4 „Docelowej budowy” | 0,5 d |

Razem: ok. **13–20 dni roboczych** sesji.

## Narzędzie (krok 1)

- `node scripts/css-audit.mjs` — sumy naruszeń i zmiana względem baseline.
- `--unused [--file=web/…css]` — klasy bez wystąpienia w HTML/JS (kandydaci
  do kroku 2; przed usunięciem sprawdzić klasy składane dynamicznie w JS).
- `--file=web/…` — liczby dla jednego pliku.
- `--write-baseline` — po każdym kroku obniżającym liczby.
- Do startu E23 (po E13) praca innych etapów na starym CSS może podnieść
  liczby (np. E22 Eksplorator, 2026-10-21: baseline odświeżony po scaleniu).
  Przy scalaniu takiej pracy: `--write-baseline` w tym samym commicie.
- **Test zapadki wyłączony** (`test.skip`, decyzja użytkownika 2026-10-21)
  do startu E23; przy starcie E23: `--write-baseline` i włączenie testu.
- Test unit nie przepuszcza wzrostu żadnej liczby w żadnym pliku; **nowy
  plik ma poziom 0** — nowa strona musi od razu korzystać ze wspólnych stylów.
- Pliku tokenów (`TOKEN_FILES`) i dozwolonych progów (`ALLOWED_WIDTHS`)
  dotyczy krok 3; do tego czasu wszystkie `--token` poza `base.css` i każdy
  próg `@media` są liczone jako naruszenia.

Baseline 2026-10-21: `!important` 184, kolory na sztywno 1475, własne
`--token` 186, progi `@media` 112, `z-index` liczbą 104, klasy w kilku
plikach 227, nieużywane klasy 201, style w JS 879, `style=` w HTML 320,
bloki `<style>` 14.

**Projekt silnika i mechanizmów:** [`silnik-stylow-projekt.md`](silnik-stylow-projekt.md)
(zastępuje tabelę „Kroki” powyżej; szacunek ≈37–49 dni).

## Analiza szczegółowa (2026-10-21, tylko odczyt)

Użytkownik: „na spokojnie, zatrzymaj się i analizuj”. Bez zmian w `web/`
do decyzji użytkownika. Cztery przeglądy: komponenty, palety/progi/warstwy,
mechanizmy JS, weryfikacja martwych i zdublowanych klas.

### Główna przyczyna bałaganu

- **`games.css` jest drugim, nieoficjalnym plikiem wspólnym** — ładuje go
  15 stron (paski `.bar`/`.actions`/`.games-bottom`, kopia `.overlay`/`.modal`,
  `.card`, `.tabs-card`, `.list-empty`). Strony bez niego (Społeczność,
  edytor gry, Control) mają własne odpowiedniki. Jedyne prawdziwe konflikty
  kaskady (`overlay`, `modal`, `tabs-card`, `card`) to zawsze strona +
  `games.css`.
- **Mechanizmy są wspólne tylko częściowo**: `modal.js` istnieje, ale okna
  ze statycznego HTML każda strona otwiera sama (3 sposoby: `style.display`,
  `.hidden`, `[hidden]`); ~15 własnych obsług kliknięcia w tło, 5 ESC,
  5 kopii `show(el,on)`. Dopóki znaczniki i sposób ukrywania są różne,
  wspólny CSS nie zadziała jednakowo.
- **Control v1**: martwe pozostałości (`summary*`, `colorModal*`, `final*`,
  `ansGrid`, `qr*`, `share*`…) w `control.css` i skopiowane do
  `game-settings.css` / `base-explorer.css`. Control 2 używa `c2-*`,
  a jego style są w bloku `<style>` ~500 linii w `control/index.html`
  (audyt go nie liczy).

### Martwy CSS (zweryfikowany)

| plik | lista | martwe | raczej | używane |
|---|---|---|---|---|
| control.css | 90 | 87 | 3 | 0 |
| settings.css | 37 | 23 | 0 | 14 (klasy składane `${}` i TinyMCE `tox-*`) |
| game-settings.css | 25 | 25 | 0 | 0 |
| base-explorer.css | 15 | 15 | 0 | 0 |
| base.css | 12 | 12 | 0 | 0 |

Audyt `--unused` ma fałszywe alarmy dla klas `prefix-${wartość}`
(settings: `mail-status-*`, `mail-level-*`, `session-status--*`;
mail: `mail-row--*`) — przed usunięciem zawsze grep rdzenia nazwy.

### Kolory i tokeny

- Konflikty nazw: `--bg` (display: #d21180), `--line` (host: długość,
  nie kolor), `--card` (auth-landing), `--radius` 12/16, `--tab-extra`
  1/2/3, `--topbar-h` (tv-layout). Zmiana nazw ostrożnie.
- **1:1 bez zmiany wyglądu (~200 wystąpień):** #050914→`--bg`,
  #111827→`--card`, #ffeaa6→`--gold`, białe .14/.18→`--line`/`--line2`,
  czarne .18→`--card2`, scrimy.
- Reszta to rodziny alfa (biel .03–.25, czerń .18–.7, złoto .1–.7)
  i ~7 odcieni podłoża `--under`; zwinięcie do kilku tokenów **zmienia
  wygląd minimalnie** — wymaga zrzutów i zgody.

### Progi szerokości (propozycja)

600 / 760 / 980 / 1120. Ryzykowne (widoczne): 900→980 w Control (×5)
i Eksploratorze (tablety 901–980), 640→600 w Ustawieniach i Zadaniach,
720→760 w kontaktach i Control. max-height i pliki „częściowe” bez zmian.

### Warstwy (propozycja)

lokalne 0–10, przyklejone 100, szuflada 300, menu 500, pływające 600,
okno 1000 (+10 zagnieżdżone), dymek 2000, podpowiedź 2100, blokada 9999.
Dziś `.overlay` ma 50–9999 zależnie od strony (+`!important` w settings).

### Komponenty — osobne wersje pod inną nazwą

przyciski ~12 (`.fsBtn`×3, `.fs-btn`, `.qr-fs-btn`, `.tbBtn`, `.ctxBtn`,
`.tcBtn`, `.abtn`, `.m-btn`, `.icon-btn`, `.c2-btn`…), pola 6, okna 4
(`.m-modal`, `.colorModal*`×2, `.dt-modal`, `.imgv-overlay`), `.card`
w 3 wersjach (promień 18/20/22), kafle 6, puste stany 7, pigułki 8+.
Pickery koloru 2 (game-settings, Eksplorator); baner A2HS/pełny ekran
3 kopie (buzzer, host, snake); własne wyszukiwarki (Społeczność,
Ustawienia); puste stany pisane ręcznie zamiast `showEmptyResult`.

### Style w JS/HTML

~900 przypisań w JS: ~40% pokaż/ukryj (do `[hidden]`), ~25% dynamiczne
albo muszą zostać (maile, SVG), ~35% stały wygląd (60% z tego w
`settings.js`). HTML: `settings/index.html` 153 `style=`; ~89 `display:none`
zamiast `[hidden]`; 7 jednolinijkowych strażników `<style>` (potrzebne).

### Rozjazdy dokumentacji (`wzorce-ui.md`)

A5 (kafel jest `.tile` w base), A7/A10 (numery linii), A11 (`.btn.danger`
już ma obrys; `.green` nadal zdefiniowany), A13 (`.empty-state` istnieje).
Na `/` `base.css` linkowany dwa razy; `control/display` bez `base.css`.

### Wnioski dla kolejności

1. Najpierw **architektura plików**: co z `games.css` jest wspólne → do
   `shared/css`; jeden zestaw wspólnych plików na każdej stronie.
2. Potem **mechanizmy** (jeden `openOverlay/closeOverlay`, jedna konwencja
   `[hidden]`, puste stany, picker koloru, A2HS/pełny ekran) — one ustalają
   znaczniki, do których pasuje wspólny CSS.
3. **Martwy CSS Control v1** — bezpieczny, duży zysk (~160 klas).
4. **Tokeny 1:1** — bez zmiany wyglądu.
5. Komponenty po kolei, strona po stronie (Ustawienia osobno — największe).
6. Na końcu decyzje wizualne: zwinięcie rodzin kolorów, progi, promienie.

Do decyzji użytkownika (przed krokami 5–6): progi szerokości (zwłaszcza
900→980), zwinięcie odcieni (drobne zmiany wyglądu), jeden promień kart
i zakładek (12/16/18/20/22).

Szacunek po analizie: **15–22 dni** (więcej pracy w mechanizmach JS
i Ustawieniach niż zakładał pierwszy plan).

## Do poprawienia (zgłoszenia użytkownika)

- **Ankieta — topbar bez „Więcej” (zgłoszone 2026-10-23, zrzut ~1200 px):**
  na stronie ankiety (`/polls/`) przyciski Znajomi/Subskrybenci zawijają się
  w dwie linie pod tytułem zamiast zwinąć do „Więcej”. Przyczyna: „Więcej”
  (`#navMore` + `setTopbarNavPriority` z `topbar-controller.js`) mają tylko
  Moje gry i panel admina; pozostałe strony nie zwijają przycisków sekcji 2.
  **Poprawione (branch, 2026-10-23):** kontroler topbara sam dodaje „Więcej”
  stronom z ≥ 2 przyciskami w sekcji 2 bez własnego `#navMore` (dziś: ankieta);
  w wymuszonym hamburgerze (≥ 761 px) tytuł strony zostaje jak na telefonie.
  Zrzuty: `poll-results`/`poll-share`/`polls-tally-tie` na tablecie.

## Dziennik E23

| Data | Krok | Wynik |
|------|------|-------|
| 2026-10-21 | Decyzja i plan | Pomiar stanu wyjściowego, plan kroków. |
| 2026-10-21 | Krok 1 — narzędzie | `css-audit.mjs` + test zapadki; unit pełne zielone. |
| 2026-10-21 | Analiza szczegółowa | Wstrzymanie zmian na prośbę użytkownika; 4 przeglądy tylko do odczytu, wnioski w sekcji „Analiza szczegółowa”. |
| 2026-10-21 | Projekt silnika | Analiza cz. 2 (moduły JS, szkielety stron, progi, style w HTML, testy/narzędzia/przeglądarki) → `silnik-stylow-projekt.md`; 6 decyzji do podjęcia. |
| 2026-10-21 | Zakres ekranów gry | Control pełna zgodność; buzzer/host/display/TV/snake częściowo (tokeny, wspólne okna). |
| 2026-10-23 | Start realizacji, fundament, pilot | Polecenie użytkownika: intensywnie, bez pytań, wygląd prawie bez zmian, tylko branch. Silnik `web/shared/style/` (tokens, base, components, layout, utilities; `@layer`), narzędzia `compare.cjs` i `run.cjs --styles`, zapadka audytu włączona (baseline odświeżony), `styleEngine.test.js`. Pilot Zadania: zrzuty identyczne. Ustalenia: `silnik-stylow-projekt.md` §13. |
| 2026-10-23 | Wszystkie strony na silniku | Kolejno: Znajomi/Subskrybenci, Connect, logowanie, głosowanie, Gry, Bazy, Logo, rynek, Konto, Ankieta/maile/Go, edytory, Eksplorator, strona główna/Wskazówki/Prywatność, Control (blok `<style>` do pliku), ekrany TV i gry (silnik płaski), panel admina. Warstwa `states` dla arkusza okna. Stary `base.css` usunięty. Każda partia: zrzuty przed/po + różnice obliczonych stylów; unit zielone. Szczegóły: `silnik-stylow-projekt.md` §13. |
| 2026-10-23 | e2e brancha, krok 2 — martwy CSS | Przebieg 39955820500 (mobile-sheet-modals: okna panelu admina + friends: wypustki) 7/7 ✓ po poprawce blokady panelu admina (`.settings-locked` ukrywa tylko topbar, stopka zostaje). Martwy CSS (audyt `--unused`, każda klasa sprawdzona grepem; klasy składane `${}` i TinyMCE `tox-*` zostają): ~1620 linii z Control v1, ustawień gry, Eksploratora, Konta, Logo, Wskazówek, rynku, ankiety i panelu admina. Zrzuty przed/po: 53 pary identyczne. Zgłoszenie użytkownika: brak „Więcej” w topbarze ankiety → „Do poprawienia”. |
| 2026-10-23 | „Więcej” we wspólnym topbarze | Zgłoszenie użytkownika (ankieta: przyciski zawijają się w dwie linie). `topbar-controller.js` dodaje „Więcej” stronom bez `#navMore` (≥ 2 przyciski w sekcji 2); `components.css`: tytuł strony zostaje w wymuszonym hamburgerze. Zrzuty przed/po: zmienione tylko sceny ankiety na tablecie (zamierzone), pozostałe 38 par identyczne. |
| 2026-10-23 | Mechanizmy: podpowiedzi | `.app-tooltip` w silniku (animacja wejścia), `tooltips.js` nie doładowuje już CSS (jedno żądanie mniej na każdej stronie); `kora-builder` (bez silnika) z własną regułą. Nowa scena `tooltip`. |
| 2026-10-23 | „Więcej” wszędzie | Decyzja użytkownika (spójność): „Więcej” także na stronach z jednym przyciskiem (Bazy, Logo, Control, Poczta, Wskazówki) — przy braku miejsca od razu hamburger. Zrzuty 48 par identyczne. Decyzja „ujednolicać bez kompromisów” w sekcji „Decyzje”. |
| 2026-10-23 | Nazwy: przycisk w rogu / pełny ekran | `fsBtn`, `fs-btn`, `qr-fs-btn`, `snake-corner-btn` → `.corner-btn` (kwadrat 44 px w rogu) + `.fs-btn` (pełny ekran); id `btnFS`/`fsBtn` → `btnFullscreen` (Prowadzący, Przycisk, Wyświetlacz, snake, QR ankiety, tryb testowy, spece control2/poll-qr — tylko selektor). Zrzuty: snake i QR ankiety mają wspólny przycisk (zamierzone), reszta identyczna. Decyzje „te same nazwy” i „skończony zestaw elementów” w sekcji „Decyzje”. |
| 2026-10-23 | Przyciski: jeden zestaw | `.icon-btn` → `.btn.icon` (kwadrat 37 px, `.btn.sm.icon` 33 px); `tbBtn` (Eksplorator) → `.btn.icon` (+`danger`, niebieskie „primary” → `gold`); `ctxBtn` (pasek rysowania logo) → `.btn.xs`; `tcBtn` (podliczanie ankiety) → `.btn.sm.icon` (+`danger`); rozmiary `xsm`+`xs` → `xs`. Jeden stan „włączony”: `.btn.is-active` / `[aria-pressed="true"]` (złoty) zamiast `.on`/`.active`/niebieskiego (rynek, logi panelu admina, narzędzia rysowania, Eksplorator, pełny ekran). Wspólny fokus `:focus-visible`. Zrzuty: zmiany tylko w tych paskach (zamierzone). |
| 2026-10-23 | Przyciski: paczka 2 | `msg-icon-btn` (poczta admina) → `.btn.sm.icon` + `gold`/`danger`/`is-active`; `sfx-preview-btn`/`sound-preview-btn`/`summarySoundPlay` (3 kopie) → `.btn.sm.icon`; `search-submit` ≡ `mkt-search-button` → `.btn.icon`; `tab-btn.active` i przyciski zakładek/szablonów panelu admina → `.btn.is-active`; `.ui-select.active` / `.mkt-filter.is-active` → `.ui-select.is-active` (silnik); `roundsOrderBtn` → `.btn.sm.icon`; `logoX` (div role=button) → `<button class="x">` jak na kaflach Gier i Baz (dostępność: prawdziwy przycisk); `imgSetBtn.on` → `.is-active`; `c2-btn`/`.primary`/`c2-intro-btn` (Control) → `.btn`/`.gold`/nowy rozmiar `.btn.lg`; `c2-btn-busy` → `.btn.is-busy`. Spece: `.logoX` → `.x` (tylko selektor). Decyzje „wyrównywać po drodze” i „dostępność zawsze na plus”. |
| 2026-10-23 | Kopie i duplikaty | Control: 40 martwych klas (kopie pickera koloru, suwaków, kolejności rund, `qRow`, `finalCol`, `logoGrid`…) — ok. 460 linii. Zdublowane reguły (ten sam selektor kilka razy w pliku) scalone w 17 plikach (ok. 550 linii mniej); `contacts.css` i `base-explorer.css` zostają do ręcznego scalenia (scalanie automatyczne zmieniało kaskadę). Zrzuty i obliczone style: 56 par bez zmian. |
| 2026-10-23 | Control: ostrzeżenie finału | Uwaga użytkownika: „Finał wymaga 5 pytań…” nie w rzędzie przycisków. Teraz w sekcji „Finał” podsumowania jako nowy wspólny `.callout.callout--warn` (silnik; także `--bad`), `role=status`; „Gotowe” wskazuje go przez `aria-describedby`. Karty podsumowania w jednym rzędzie wyrównane do równej wysokości. |
