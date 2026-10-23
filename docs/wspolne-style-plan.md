# E23 — wspólne style i mechanizmy na wszystkich stronach

Cel (decyzja użytkownika 2026-10-21): **każda strona korzysta ze wspólnych
stylów i mechanizmów**. Plik strony zawiera tylko układ tej strony (siatka,
kolejność, rzeczy, których nie ma nigdzie indziej). Przyciski, pola, okna,
karty, wypustki, kafle, wiersze, paski akcji, oznaczenia, puste stany,
dymki, wczytywanie, kolory, odstępy, progi szerokości i warstwy (`z-index`)
pochodzą wyłącznie z `web/shared/css/`. Wzorce: [`wzorce-ui.md`](wzorce-ui.md).

## Decyzje

Katalog duplikatów i kolejność ujednolicania: [`e23-katalog-komponentow.md`](e23-katalog-komponentow.md).

- **Wzorce układu globalnie (decyzja użytkownika 2026-10-23):** „np. karta
  podwójna stająca się kartą pojedynczą z dwoma wypustkami na telefonie itd.,
  albo nawet bardziej globalnie” — powtarzające się układy (dwie karty obok
  siebie → jedna karta z wypustkami na telefonie, lista + szczegóły, pasek
  narzędzi) jako wspólne wzorce silnika, stosowane wszędzie, gdzie pasują.
- **Strefa bezpieczna zawsze (decyzja użytkownika 2026-10-23):** „bardzo ważne
  — konsekwentnie uwzględnić safe area”. Każdy element przy krawędzi ekranu
  (topbar, stopka, arkusze, przyciski w rogach, banery, szuflady, okna od dołu)
  liczy `env(safe-area-inset-*)`.
- **Nic się nie obcina, nie chowa, wszystko dostępne (decyzja użytkownika
  2026-10-23):** „w żadnym z widoków nic się nie obcinało (nienaturalnie —
  wielokropek może być, ale nie zawsze), nie chowało, było dostępne”. Każda
  akcja i treść osiągalna na każdym urządzeniu; wielokropek tylko tam, gdzie
  pełny tekst jest dostępny inaczej (podpowiedź/`title`, szczegóły).
- **Bez przewijania tam, gdzie zakazane (decyzja użytkownika 2026-10-23):**
  „jeśli coś ma być dostępne bez przewijania (przewijanie jest niedozwolone),
  też musisz uwzględniać; sprawdzić, gdzie według decyzji przewijanie,
  zawijanie itd. są niedozwolone” — lista w „Zakazy przewijania i zawijania”
  niżej, sprawdzana automatycznie (`scripts/screens/audit-layout.cjs`).
- **Regularnie podciągać `main` (decyzja użytkownika 2026-10-23):** „co jakiś
  czas podciągaj main i patrz, czy coś się zmieniło, i też poprawiaj” — po
  każdej paczce scalić `main` do brancha; nowe/zmienione strony i style z
  `main` od razu przepiąć na silnik i wspólne elementy (zrzuty, e2e punktowo).
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

## Zakazy przewijania i zawijania (zebrane z decyzji, 2026-10-23)

Źródła: `docs/e20-kategorie-stron.md` (kolumna „Typ scrolla”),
`docs/e20-uwagi-do-korekty.md` (dopisek „jeden pionowy scroll na mobile”,
uwagi o nagłówkach i stopkach), `docs/ujednolicenie-wygladu.md` (E20 —
doprecyzowanie z 2026-10-17, tabela wzorców), `docs/control-tryb-testowy-plan.md`,
Dziennik `docs/wdrozenia.md` (2026-10-17/18). Sprawdza je
`node scripts/screens/audit-layout.cjs` (lista `SCROLL_POLICY` w skrypcie).

**Przewijanie dokumentu (strona jako całość):**

| Dozwolone | Zakazane (przewija się tylko obszar roboczy/lista) |
| --- | --- |
| `/`, `/marketplace/`, `/account/`, `/manual/`, `/privacy/`; `/settings/` zależnie od widoku; logowanie (`/login/…`) tylko gdy karta nie mieści się w niskim oknie | `/games/`, `/bases/`, `/logos/`, edytory (`/games/editor/`, `/bases/explorer/`, `/logos/editor/*`, `/games/settings/`), `/polls/` (także panele — przewija się wyłącznie lista odbiorców i lista pytań w „Głosy”), `/friends/`, `/subscribers/`, `/tasks/`, `/connect/`, `/mails/`, `/polls/vote/*`, `/go/`, `/404.html`, `/maintenance/`, `/control/` (obszar roboczy; tylko treść podsumowania), ekrany urządzeń (`/control/display|host|buzzer/`, `/polls/vote/qr/`, `/snake/`, `/connect/tv/`) |

**Okna i arkusze:** okno mieści się w obszarze ekranu (z safe area);
nagłówek i akcje zawsze widoczne; przewija się jeden wyznaczony obszar treści
albo lista. Nigdy lista przewijana wewnątrz przewijanego body (zagnieżdżony
scroll); dwie równorzędne listy — obie widoczne, każda przewija się osobno.
Szuflada Eksploratora sama się nie przewija (drzewo i tagi osobno). Podgląd
gry i szczegóły w Marketplace — jeden scroll treści.

**Control:** panel bez przewijania na wszystkich krokach i urządzeniach
dopuszczonych przez guard; wyjątek — sama treść podsumowania (przyciski
dolne widoczne). Rozgrywka: nic nie ucięte, czcionka dopasowana
(`check-control-fit.cjs`).

**Zawijanie zakazane / ograniczone:**
- Nagłówek i paski akcji nie zawijają się przedwcześnie: najpierw zawija się
  podpowiedź (granice zdań), dopiero potem cała grupa akcji do następnego
  wiersza (nigdy pojedynczy przycisk).
- Stopka: lewa część zawija się tylko po lewej, prawa tylko po prawej; sekcje
  nie mieszają się i nie spadają jedna pod drugą.
- „Więcej” w topbarze (przycisk, plakietka, strzałka) — jeden wiersz.
- „Moje wysłane” w Poczcie — nigdy w drugim wierszu.
- Pasek filtrów/eksportu — jeden wiersz, jeśli się mieści.

**Poziome przewijanie strony** — zakazane wszędzie (dozwolone tylko
wewnątrz tabeli listy Eksploratora).

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

- **Scena `play-buzzer-on` (2026-10-23):** runner zrzutów zgłasza „NIEGOTOWA” także
  na czystym `main` (nie po E23) — naprawić scenę/atrapę przy najbliższej pracy
  przy Przycisku.
- **Ekran blokady (`blocking-overlay.css`)**: wygląd karty i przycisków zrównany
  z `.card`/`.btn`/`.btn.gold` (2026-10-23); klasy zostają, bo plik ładuje też
  Wyświetlacz bez silnika. Do zrobienia: wspólny moduł `block-screen` (§6.2).

- **Funkcje koloru (2026-10-23):** `hexToRgb`/`rgbToHex`/`normHex` w ustawieniach
  gry (wielkie litery, czarny przy błędzie) i znacznikach Eksploratora (małe
  litery, `null`) mają różną semantykę zapisu — wspólny moduł `core/color.js`
  dopiero z decyzją o jednym formacie zapisu koloru (migracja danych?).

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
| 2026-10-23 | Edytor: okno i „Dodaj pytanie” | `editor.css`: usunięta pełna kopia okna (`.overlay`, `.modal`, `.mTitle`, `.mSub`, `.importRow`, `.importTa`, `.importMsg`) — wspólne z silnika. `.addTile` → `.addCard` (jak w Moich grach; w silniku stan wyłączony `.addCard:disabled/[aria-disabled]`). Spece `editor`, `e21-rules`, sceny: `.addTile` → `.addCard` (selektor). |
| 2026-10-23 | Podpowiedzi: jedna `.hint` | Silnik miał dwie definicje (`components.css` 13 px/.8, `layout.css` 12 px/.75) — jedna: 12 px, `line-height` 1.4, kolor `--text-muted` zamiast przezroczystości (stały kontrast). Nazwy stron → `hint`: `qf-hint`, `gs-hint`, `poll-go-hint`, `notfound-hint`, `field-hint`, `mode-hint`, `imgPrevHint`, `xTypeHint`, `tinyHint`, `pollQrHint`, `connect-device-code-hint`; `panelHint`/`tallyHint`/`pollBarHint`/`uni-hint` zostają tylko jako układ obok `hint`. Nadpisania `.hint` w Kontaktach, Control, logowaniu — usunięte (zostaje margines karty logowania). |
| 2026-10-23 | Puste stany: jeden `.empty-state` | `bld-no-q` ≡ `mkt-no-q`, `left-panel-empty`, `m-search-empty`, `gs-picker-empty`, `connect-device-empty`, `stats-session-suggestion-empty`, `mail-empty` (poczta), `activity-chart-empty` (wygląd) i pusta lista Eksploratora → `.empty-state`; nowy wariant `.empty-state--inline` (bez drugiej ramki w obramowanej liście/panelu). Nowa scena `manual-search-empty`. Spec `privacy-manual`: `.m-search-empty` → `.empty-state` (selektor). |
| 2026-10-23 | Oznaczenia i liczniki | Panel admina: `mail-pill` + 12 wariantów kolorów (stan kolejki, poziom logu, funkcja, pominięty) i `session-status--live/done/err` → `.tag` z wariantami `--gold/--info/--bad/--warn/--ok/--muted` (`--upper` dla poczty). `tree-count` (Eksplorator) → nowy `.badge--muted` (liczba elementów, nie powiadomienie). `.load-retry` (Kontakty, Ankieta, Zadania) w silniku. |
| 2026-10-23 | Karta: jedna `.card` | Silnik: `.card` (poziom 1: `--surface-1`, `--r-lg`, 16 px / telefon 12 px, cień karty), `.card--inset` (w karcie), `.card--entry` (karta wejścia 680 px). Usunięte kopie: Ankieta, głosowanie (→ `--entry`), Control (zostaje układ), Kontakty (promień 14 → 20 jak wszędzie), Connect (→ `--inset`). |
| 2026-10-23 | Scalenie `main` + karty wejścia | `main` (77 commitów: Supabase z `/shared/vendor`, przejmowanie urządzeń) scalony; konflikty w nagłówkach stron TV/gry i Dzienniku. Karty wejścia `landing-card` (potwierdzenie/reset), `login-card` (+`setup-card` = złoty obrys), `poll-go-card` (Go, maile), `auth-card` (panel admina) → `.card.card--entry`. |
| 2026-10-23 | Karty poziomu 2 | Nowy token `--surface-inset` (kryjący: surface-1 + biel 4%); `.card--inset` z kryjącym tłem i `--under`. `settings-card`, `stats-inner-card` (panel admina), `qf-section` (edytor pytań, Eksplorator) → `.card.card--inset`; `account-panel` → `.card`. Z plików stron zdjęte tło/ramka/promień/cień/odstęp (zostaje układ). |
| 2026-10-23 | Baner A2HS: jeden | Silnik: `.a2hs` w wersji ekranów gry (strefa bezpieczna, karta 400 px wyśrodkowana, tytuł 20 px, przycisk 44 px na całą szerokość, tło jak `.card`); trzy kopie (snake, Przycisk, Prowadzący) usunięte. Zrzut `snake-a2hs`. |
| 2026-10-23 | Szerokości okien: trzy | Domyślna 860, nowe `.modal--medium` 720 (= okno uniwersalne), `.modal--narrow` 560. Okna z własną szerokością (680/760/820/520→) przepięte: Eksplorator (znaczniki, pytanie → medium; przenieś, szukaj → narrow; eksport → domyślna), udostępnianie Bazy 820 → 720, wysyłka kopii 680 → 720, szczegóły rynku i podgląd gry 680 → 720, szczegóły sesji w statystykach 760 → 720. |
| 2026-10-23 | Podgląd pytań: jeden `.q-preview` | Silnik: `.q-preview` (lista przewijana 55vh), `-item`, `-text`, `-answers` (zawsze `<ol>`), `-pts`. Kopie `bld-q-*`/`bld-pts` (Gry), `mkt-q-*`/`mkt-pts` (rynek), `market-preview-q*` (panel admina; punkty były w `style=`) usunięte. Spece `games`, `marketplace`, `e20-gallery`: selektory → `.q-preview-*`. |
| 2026-10-23 | Przełącznik segmentowy: jeden | `.toggle-group/.toggle-item/.toggle-slider` (identyczne kopie w ustawieniach gry i Control) → silnik; nazwy bez zmian (22 odwołania w e2e). Dostępność: fokus z klawiatury na opcji (`:focus-visible`) dla wszystkich przełączników (dawniej tylko „Logo Prowadzącego”). |
| 2026-10-23 | Pasek postępu: jeden | `.progress > .progress-bar` (8 px, złoty; kolor przez `--progress-color`): okno postępu (`uni-progress-track/-bar`), generator w panelu admina (`progress-bar-bg/-fill`), segmenty aktywności w statystykach (dawniej `style=`). |
| 2026-10-23 | Szuflada boczna: jedna | `.drawer` + `.drawer-scrim` + `.drawer-toggle` (≤ 980 px, warstwa `states`): ustawienia gry (`gs-sidebar*`) i Wskazówki (`m-side*`) — identyczne kopie usunięte. Dostępność: zamknięta szuflada ma `visibility: hidden` także w ustawieniach gry (dawniej tylko we Wskazówkach) — nie łapie fokusu. Eksplorator (`drawer-overlay` pod paskiem narzędzi) i menu kontekstowe — przy `.menu`. |
| 2026-10-23 | Etykieta pola: jedna | `.field-label` w silniku (12 px, wersaliki, `--text-muted`, odstęp 6 px): `gs-label` (ustawienia gry, była złota), `contact-label` (okno kontaktu), `mkt-rate-label` (ocena na rynku), `stat-label` (kafle statystyk) i lokalne `field-label` panelu admina/rynku. Zostają nagłówki sekcji (`qf-label`) i ekrany gry (`c2-field-label`). |
| 2026-10-23 | Pola logowania jako `.inp` | Logowanie, reset, potwierdzenie: pola dostały `.inp` (jak wszędzie); usunięte globalne `input {…}` (login.css) i `.form input` (auth-landing.css). Dostępność: `.inp:focus-visible` z wyraźną obwódką (złota ramka + poświata) w całej aplikacji. |
| 2026-10-23 | Pola: `.inp` wszędzie | `dt-input` (data w panelu admina), `ctxInput` (pasek rysowania logo), `mail-search`, `qf-qtext` (treść pytania, `textarea`) → `.inp`; nowy rozmiar `.inp.sm` (28 px jak `.btn.xs`) i wspólne `textarea.inp`. W plikach stron zostają szerokości. |
| 2026-10-23 | Suwak: jeden | Wszystkie `input[type=range]` w silniku (tor 6 px z `--track`, złoty uchwyt 16 px, `:focus-visible`, stan wyłączony). Kopie `.rng` (ustawienia gry, Eksplorator), `.mode-range` (panel admina), natywne `accent-color` głośności (ustawienia gry, Control) usunięte. Nowy wspólny moduł `core/range-fill.js` (ładowany z `icons.js`): tor wypełniany złotem do wartości (pickery koloru `.rng` mają własny gradient). |
| 2026-10-23 | Menu: jeden wygląd | Wspólna reguła wyglądu dla każdego menu (`lang-menu`, `account-menu`, `nav-more-dropdown`, `ui-select-menu`, `context-menu`, `ctxPop`, panel hamburgera): `--surface-1`, ramka `--line`, `--r-md`, odstęp 6 px, `--shadow-menu`. Usunięte: szare `#141414` menu kontekstowego, prawie czarne tło list wyboru i panelu rysowania, osobne cienie. Nazwy klas zostają (różne zachowanie i położenie). Pozycje menu (elementy) — do ujednolicenia z `cm-item`/`ui-select-item`/`account-menu-item`. |
| 2026-10-23 | Rzędy akcji: `.cluster` | 14 klas `*-actions`/`*Tools` (Konto, 404, Go, rynek, panel admina, Logo, Ankieta) → wspólne `.cluster` (odstęp 8 px, zawijanie) + nowe `.cluster--end/--center`; w plikach stron zostają tylko marginesy i rozmiar elastyczny. |
| 2026-10-23 | Nagłówek rynku = `.bar` | `mkt-head` → `.bar` (linia pod nagłówkiem jak w Grach/Bazach), `mkt-title`/`mkt-subtitle` → `.title`/`.hint`, karta listy `mkt-games-card` z wyglądem `.card`; `.bar .title { margin: 0 }` w silniku (nagłówek `h1` bez domyślnego marginesu). |
| 2026-10-23 | Wiersz listy: rynek | `mkt-sent-row` („Moje wysłane”) → `.shareRow` (jak listy udostępniania, kontaktów, zadań); w pliku strony zostaje zawijanie. |
| 2026-10-23 | Wybór koloru: jeden wygląd | `colorTopRow`, `colorHexField`, `colorPreview` (72 px), `sliders` (w ramce), `sliderRow`, `sLbl`, `sVal`, `rng` — z dwóch kopii (ustawienia gry, znaczniki Eksploratora) do silnika. Logika (`game-settings.js`, `tags-modal.js`) nadal osobna — do wspólnego modułu `pickers.js` (§6.2). |
| 2026-10-23 | Komunikaty i ekran blokady | `.field-error` (silnik, `role=alert`): błędy logowania/resetu/potwierdzenia (`err`, `modal-err`) i pól ustawień gry (`gs-field-msg`). Status potwierdzenia/resetu → `.callout` (`role=status`). Ekran blokady: karta i przyciski jak `.card`/`.btn`/`.btn.gold` (tokeny z wartościami zapasowymi dla Wyświetlacza). |
| 2026-10-23 | Karta dzielona i wypustki | Decyzja użytkownika (karta podwójna → jedna z wypustkami na telefonie). Silnik: `.tabs-card--split` + `.split-panels` + `[data-split-panel]`, `core/split-tabs.js` (role/aria, strzałki, ?tab=); próg wspólny 600 px i telefon poziomo ≤980. Znajomi/Subskrybenci (dawniej `contacts-layout`, próg 720; JS ukrywał kartę w poziomie, gdy CSS nie pokazywał wypustek) i Poczta (dawniej karta w karcie, próg 620) — jeden wzorzec. Róg karty pod skrajną aktywną wypustką — jedna reguła silnika (`@layer states`) zamiast reguł w Grach, Bazach, Logo, Ankietach, Poczcie, Kontaktach; gość Baz ukrywa pasek atrybutem `hidden`. Wysokość wypustek: jeden token — 36 px, telefon 44 px (było 36/44/56 zależnie od strony). Zrzuty: friends, people-friends-half, mails-tools (telefon/komputer), games, bases, logos, poll-share, games-market (telefon). |
| 2026-10-23 | Szuflady i wielokropki (audyt układu) | Audyt: zamknięta szuflada Eksploratora (własna implementacja, tylko `transform`) zostawiała przyciski drzewa w kolejności Tab poza ekranem. Eksplorator na wspólnym `.drawer`/`.drawer-scrim` (zamknięta: `visibility:hidden`); `--drawer-top` (początek pod paskiem narzędzi); próg Eksploratora 900 → 980 (wspólny). Szuflada w silniku liczy safe area (lewo — telefon poziomo, dół — pasek gestu). Wielokropek: `core/tooltips.js` pokazuje pełny tekst uciętego napisu (najechanie, fokus klawiatury, przytrzymanie na dotyku) — na wszystkich stronach bez `title` w kodzie. |
