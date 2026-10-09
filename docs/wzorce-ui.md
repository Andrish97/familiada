# Wzorce interfejsu — jeden wygląd w całej aplikacji

Etap **E18** w [`wdrozenia.md`](wdrozenia.md). Decyzja użytkownika 2026-10-09:
ujednolicić wygląd całej aplikacji. Ten dokument ma trzy części:

- **A. Wzorce** — dla każdego elementu jeden docelowy wzór (z istniejących
  decyzji i najlepszej dotychczasowej implementacji) oraz klasy / moduły, które
  go realizują albo powinny.
- **B. Przegląd** — tabela strona × element (zgodne / odstaje + co dokładnie
  i gdzie) oraz zrzuty ekranu 390×844 i 1400×900.
- **C. Lista poprawek wzorcami** — pogrupowana wg wzorców, nie stron; rozmiar
  S / M / L; kolejność wg wpływu na wygląd; styk z trwającym E17c.

**Tylko dokumentacja i audyt — kodu w `web/` nie zmieniano.** Czeka na
akceptację użytkownika (sekcja D), dopiero potem poprawki.

Źródła decyzji: [`ujednolicenie-wygladu.md`](ujednolicenie-wygladu.md)
(E10 + poprawki E17 / E17c), [`nawigacja-mapa-plan.md`](nawigacja-mapa-plan.md)
(sekcje 4–5 topbar, mobile / desktop; „Karty — jeden sposób”),
[`ankiety-refaktor.md`](ankiety-refaktor.md) (sekcja 1, decyzje 2026-10-09).

## Jak wykonano przegląd (i czego nie widać)

- Odczyt HTML / CSS / JS wszystkich stron użytkownika w `web/` (bez panelu
  admina `settings/` i narzędzi `tools/`).
- Lokalny render: `python3 -m http.server` z `web/`, Playwright (Chromium),
  `localStorage["sb-x-auth-token"]="1"`, język `pl-PL`, żądania zewnętrzne
  zablokowane; **supabase-js podstawiony atrapą** (zalogowany użytkownik
  „testowy”, każde zapytanie zwraca puste dane). Strony renderują więc tylko
  szkielet bez danych — kafle, tagi i okna stanu nie istnieją. Tam, gdzie to
  potrzebne, odczytano wygląd z kodu (CSS / generowany HTML), a w zrzucie
  ankiety (`polls-*`) **dopisano przykładowe dane ręcznie** (stan OTWARTA,
  cztery kafle subskrybentów) — to atrapa, nie stan z bazy.
- Zrzuty stron pracy (`games-editor`, `games-settings`, `bases-explorer`,
  `logo-*`, `polls`) wykonano po usunięciu okien blokad (`#deviceGuard`,
  `#resourceLockGuard`, `.overlay`), bo atrapa kończy się komunikatem „brak
  dostępu”. `control`, `control/display|host|buzzer`, `polls/vote/*` pokazują
  stan „brak parametru id” — to kod ocenia wygląd, nie zrzut.
- Pomiary marginesów: `getBoundingClientRect` pierwszych elementów `main`
  przy 390 px (wyniki w sekcji B3).

---

# A. Wzorce

Konwencja: **[WZÓR]** = decyzja już zapisana w dokumentach; **[PROPOZYCJA]** =
wybór audytu do akceptacji (zebrane w sekcji D).

## A1. Rodzaje stron

| Rodzaj | Strony | Układ |
|---|---|---|
| **Lista** | Gry, Bazy, Logo, Subskrypcje, Społeczność [PROPOZYCJA: Społeczność też jako lista] | topbar → `.bar` (tytuł + podpowiedź | akcje zaznaczonego kafla) → `.tabs-card` (karty) → `.games-card` z siatką `.grid` kafli `.card` → `.games-bottom` (dół: wyszukiwanie / filtr po lewej, eksport / import po prawej) |
| **Strona pracy** | edytor gry, edytory logo, ankieta, menedżer bazy, ustawienia gry, Control | topbar z **tytułem** (sekcja 2); pod nim tylko pole nazwy / pasek stanu i sama praca; **bez dolnego paska** (akcje na górze) |
| **Ustawienia / formularze** | Konto, Podłącz urządzenie | topbar z tytułem [PROPOZYCJA: Konto jak strona pracy — tytuł w topbarze, `USTAWIENIA KONTA`], treść w panelach `.account-panel` (karta + nagłówek wielkimi literami + opis + pola + przycisk) |
| **Wejście / karta** | logowanie, reset, potwierdzenie, `/go/`, głosowanie `/polls/vote/*` | jedna wyśrodkowana karta (`.login-card` / `.landing-card` / `.poll-card`), bez topbara pracy; marka + treść; stopka |
| **Strona tekstowa** | Instrukcja, Prywatność, landing `/` | topbar + treść; Instrukcja ma karty (patrz A3) |
| **Urządzenia** | `/control/display|host|buzzer/`, `/connect/tv/` | **osobny świat wizualny** (ekran gry, pełny ekran, własne czcionki i kolory) — poza wzorcami; wspólne tylko: marka, przełącznik języka, złoto `--gold` |

Tytuł strony: na listach i formularzach w `.bar` (`.title` 18 px wielkimi
literami + `.hint` 12 px, `games.css:101-112`); na stronach pracy w topbarze
(`.topbar-title`, `base.css:1974-2027`). Nigdy w obu miejscach naraz, nigdy
w innej czcionce / kolorze (Społeczność ma dziś złoty `.mkt-title` 22 px, Instrukcja
`.page-title` 20 px — odstają).

## A2. Topbar [WZÓR: nawigacja-mapa-plan 4, ujednolicenie 4]

Sekcje (`topbar-layout-4`):

1. **Wstecz** = strzałka + nazwa strony docelowej (`nav.backTo` → `{page}`,
   `nav-map.js:224-243`, `renderBackLabel`); nigdy „Wstecz” ani „Wróć do:”.
   Marka `FAMILIADA` bez zmian.
2. **Nawigacja strony** (lista: przyciski sąsiednich list) **albo** `.topbar-title`
   strony pracy: tytuł wielkimi literami + szara linijka (`.subtitle`, 12 px,
   `opacity .75`) = nazwa zasobu albo tryb (tabela w ujednolicenie 4).
3. Narzędzia strony; **„?” Instrukcja zawsze ostatnia** (też na Prywatności).
4. Konto: `nazwa ▾` → Ustawienia konta, Wyloguj (gość: `Gość ▾`; niezalogowany:
   „Zaloguj / Załóż konto”). Jeden klucz `common.logout`.

Telefon (≤ 980 px): sekcja 1 + **tytuł** (dwie krótkie linie z wielokropkiem,
jeśli `<body class="topbar-title-mobile">`) + ikony + hamburger. Sekcje 2 / 4
(przyciski) idą do panelu hamburgera. **Tytuł nie idzie do hamburgera** — dziś
idzie (znalezisko T1).

Przyciski topbara: zawsze `.btn` (nie `ghost`, nie `icon-btn` obok zwykłych).

## A3. Karty (zakładki) — jeden mechanizm [WZÓR: nawigacja-mapa-plan „Karty”]

- Wygląd: **jeden** komponent `.tabs-card` (`.tabs-strip` > `.tab-slot` >
  `.tab-label` + `.tab-wrapper` z `.tab-active` i `.tab-corner-left/right`),
  jeden zestaw wymiarów w zmiennych CSS (`--tab-height`, `--radius`,
  `--surface`) w `base.css` — nie osobna kopia CSS na stronę. Szerokości:
  równe części paska (`flex: 1 1 0`), nie `--tab-width` na stronę.
- Adres: karta zawsze w `?tab=<nazwa>`; domyślna bez parametru; nieznana →
  pierwsza; zmiana karty = `history.replaceState` (przeglądarkowe „Wstecz” =
  ↩ = poprzednia *strona*); **bez** `sessionStorage`, bez `#hash` jako karty.
- Etykieta na telefonie: ta sama co na komputerze, skracana tylko CSS-em
  (`text-overflow`), **bez osobnych kluczy „Mobile”** — skróty w innym znaczeniu
  (np. „Gotowa” dla Preparowanej) są zakazane.
- Wyjątek uzasadniony: Instrukcja ma 10 kart — pigułki w dwóch rzędach
  (`manual.css`) zostają, ale mechanizm adresu jak wyżej (`?tab=`).
- Lewe menu w Ustawieniach gry (`.gs-nav`) to nawigacja sekcji, nie karty —
  zostaje (strona tylko na tablet / komputer).

## A4. Paski akcji [WZÓR: ujednolicenie 1, E17c, ankiety-refaktor 1]

**Listy** — dwa paski:
- *góra* (`.bar > .actions`): akcje **zaznaczonego kafla** po prawej, `btn sm`;
  tekst pełny na komputerze **i** na telefonie (przyciski się zawijają
  zamiast skracać do „Podgl.”, „Exp.plk”); **główna akcja** `btn sm gold`
  jako pierwsza z lewej, reszta neutralna, destrukcyjne nigdy w górnym pasku;
- *dół* (`.games-bottom`): po lewej wyszukiwanie + filtr (+ sortowanie, jeśli
  jest) — `list-search.js`; po prawej eksport / import (`btn sm`).
  Zawijanie tylko całymi przyciskami, bez wcześniejszego przeskoku do drugiego
  rzędu, gdy jest miejsce (E17c pkt 1).

**Strony pracy** — pasek stanu / narzędzi **na górze** (pod topbarem), bez
dolnego paska także na telefonie (ankieta: decyzja 2026-10-09): lewa strona stan
słowem (`.pollStateWord`), prawa przyciski; główna akcja złota, „Przerwij”
zawsze ostatni z czerwonym obrysem (`.btn.pollAbort`).

## A5. Kafel [WZÓR: E17c pkt 3]

Jedna klasa / komponent w `base.css` (dziś `.games-body .grid .card` w
`games.css:395-519`). Budowa:

1. **Nazwa** (`.name`, 14 px, wielkie litery, do 3 linii z wielokropkiem,
   `padding-right` na ikonę rogu);
2. **Linia opisu** (`.meta` — typ, autor, krótki opis; 11 px wielkie litery);
3. **Rząd oznaczeń** `.cardTags` przy **dole** kafla (`margin-top:auto`, `.tag`
   wys. 22 px, odstęp 6 px, zawijanie całymi oznaczeniami);
4. **Ikony akcji w prawym górnym rogu** (`.x`: kosz, dzwonek; 32 × 32 px, ramka,
   `border-radius:10px`).

Wspólne wymiary: promień 18 px, ramka `rgba(255,255,255,.22)`, tło `#070b16`,
`min-height:130px`, hover = złota ramka, zaznaczony = złota ramka + poświata.
Siatka `.grid`: `repeat(auto-fill, minmax(230px,1fr))`, odstęp 14 px — jedna
minimalna szerokość dla wszystkich list. Kafel „+” (`.addCard`): zawsze ten sam
kod — `.plus` + `.txt` (nazwa akcji) + opcjonalnie `.sub` (typ); jedna wysokość
z sąsiednimi kaflami. Kolor stanu **nie** koloruje całego kafla (sekcje wg stanu
zamiast kolorów, E17c pkt 5; dziś wyjątek `.card.proposed`, A9).

Kafel subskrybenta: inicjał w kółku + nazwa / e-mail, `.cardTags` ze stanem,
dzwonek i kosz jako `.x` (E17c pkt 4; do oceny po wdrożeniu).

## A6. Sekcje udostępniania — jeden komponent [WZÓR: E17c pkt 5]

Ten sam zestaw i kolejność wszędzie, gdzie udostępniamy zasób; puste sekcje
ukryte:

1. **Subskrybenci** — do zaproszenia (jeszcze bez zaproszenia),
2. **Oczekujące** — zaproszenie wysłane, bez odpowiedzi,
3. **Aktywni** — przyjęte (w ankiecie: zagłosowali),
4. **Odrzucone** — tylko gdzie taki stan istnieje.

Nagłówek sekcji = `.shareSectionTitle` + podpis `.shareSectionSub`
(`bases.css:68-76`), w środku kafle wspólnego komponentu (A5), nie `.shareRow`.
Dotyczy: udostępnianie bazy, ankiety (karta Udostępnianie), Subskrypcje
(subskrybenci / subskrypcje), udostępnianie urządzeń w Control (jeśli jest lista
osób).

## A7. Oznaczenia i liczniki

- `.tag` (`base.css:1362-1388`) — **stała informacja o obiekcie** (typ, stan,
  rola, język, „Od: …”, liczba głosów): prostokąt, wariant kolorem znaczenia:
  neutralny, `--gold` (wymaga uwagi / premium), `--ok`, `--bad`, `--warn`,
  `--info`, `--muted`; `--upper` dla wielkich liter. Każde oznaczenie na
  kaflu, w nagłówku okna, w wierszu urządzenia = `.tag`; **żadnych** własnych
  klas pigułek (`.mkt-added-badge`, `.chip` poza etykietami użytkownika).
- `.badge` (`base.css:1328`) — **licznik do obsłużenia** (kółko z liczbą na
  przycisku / karcie: zaproszenia, powiadomienia). Nie używać do tekstu.
- `.chip` (menedżer bazy, `base-explorer.css:264`) — etykieta kolorowana przez
  **użytkownika** (`--chip`); zostaje jako osobny byt, nie jako `.tag`.
- `.conn-status` (Control) — stan połączenia na żywo; osobny, większy.
- Stany gry (tekst na kaflu): SZKIC · OTWARTA (+ „N głosów”) · ZATRZYMANA
  (+ „do podliczenia”) · GOTOWA (ujednolicenie, tabela stanów).

## A8. Wyszukiwanie, filtr, sortowanie [WZÓR: ujednolicenie E17b]

Jeden moduł `list-search.js` (opcje `filter`, `sort`) + `list-filter.js`: pole
`.searchBox` (✕ czyści), po lewej w dolnym pasku listy; filtr / sortowanie to
`.ui-select` (`.list-filter` 150 px). Stan w adresie (`?status=`, `?role=`,
`?sort=`) przez `replaceState`. Aktualne / Archiwalne to przełącznik tego samego
paska, nie osobny wzór. Na telefonie: filtr i sortowanie w jednym rzędzie, pole
szukania pod nimi na całą szerokość. Pole `.searchBox` używa też menedżer bazy
(wspólne). Lista bez sensownego filtra (logo) ma tylko szukanie.

Społeczność [PROPOZYCJA]: szukanie / język / sortowanie w dolnym pasku listy tak
jak wszędzie, nie w osobnym bloku z etykietami nad kaflami.

## A9. Dymki i komunikaty [WZÓR: ujednolicenie „Komunikaty po akcji”]

- **Po akcji, gdy efekt nie jest oczywisty** (wysłany mail, kopiowanie, zapis
  formularza bez widocznej zmiany, błąd sieci): **`toast()`** z
  `shared/js/core/toast.js` (`#appToast`, `.app-toast`), ~3 s, `kind:"error"`
  = czerwony obrys. Żadnych lokalnych kopii (`showToast` w Społeczności jest już
  tylko cienką nakładką na wspólny moduł).
- **Błąd wymagający decyzji / z długą treścią:** `alertModal` / `confirmModal`
  (`modal.js`).
- **Treść stanu strony** (login: „Sprawdź skrzynkę”, `#err` pod polem,
  `#msg` autozapisu edytorów, „brak parametru”): zostaje w treści strony.
- Zakaz: `window.alert()`, pól `#status` pod przyciskami, dymków bez `kind`
  tam, gdzie to błąd.

## A10. Okna i arkusze [WZÓR: nawigacja-mapa-plan „Okna na telefonie”]

- Jeden szkielet: `.overlay` > `.modal.uni-modal` (`modal.js`: `confirmModal`,
  `alertModal`, `promptModal`; style `base.css:756-790`), nagłówek `.uni-head`
  (`.mTitle` + ✕), treść `.uni-body`, stopka `.uni-foot` (`btn sm gold` =
  potwierdź, `btn sm` = anuluj).
- Rozbudowane okna formularzowe: ten sam szkielet + `modal-sheet.js`
  (`enterModalSheet`) — na telefonie (≤ 600 px) treść zastępuje stronę,
  wyjście = przycisk Wstecz w topbarze, powrót do strony podstawowej.
- Blokady (urządzenie nieobsługiwane, zasób zajęty) — jeden wygląd:
  pełnoekranowa karta z ikoną, tytułem wielkimi literami, tekstem i „Wróć”.
- Okno QR (`.qrModalOverlay`) to jedyny dopuszczony wariant (ciemny, wąski) —
  [PROPOZYCJA: też `.uni-modal`].

## A11. Przyciski

| Rola | Klasa | Uwagi |
|---|---|---|
| Domyślny | `.btn` | 14 px promień, `font-weight:900` |
| **Główny** | `.btn.gold` | jeden na widok; zamiast `.btn.main` (logowanie) i `.c2-btn.primary` (Control, styl inline w `control/index.html:288`) |
| Destrukcyjny | `.btn.danger` → **czerwony obrys** (jak `.btn.pollAbort`) | dziś `.btn.danger` = czerwone wypełnienie (tylko „Usuń konto”), a `.pollAbort` ma obrys; jeden wygląd; tylko w oknach potwierdzenia i na dole formularza |
| Rozmiary | `.btn` (formularze, okna), `.btn.sm` (paski akcji, 13 px), `.btn.xs` (w kaflu, 11 px), `.btn.xsm` (wiersz udostępniania) | nie wymyślać `btn-sm`, `small` |
| Ikona | `.btn.icon` / `.icon-btn` | jedna klasa, 40 × 40 |
| Zakazane | `.btn.ghost` (menedżer bazy), `.btn.green` (nieużywane), `.btn-sm` (Control), `.tbtn` (pasek rysowania logo, własna rodzina) | |

Etykiety: pełne słowa, bez skrótów typu „Imp”, „Exp.bz”, „Podgl.”.

## A12. Odstępy

- **15 px** marginesu bocznego strony (`.wrap` na ≤ 980 px, `base.css:1166`),
  desktop: kontener wycentrowany, ten sam lewy brzeg dla `.bar`, kart i stopki.
  Zero stron z własnym `padding` boku (ustawienia gry, Control, menedżer bazy).
- **Odstępy równe i z tokenów**: 14 px między kaflami, 16 px między sekcjami /
  panelami, 8 px wewnątrz pasków (`.bar`, `.games-bottom`), 6 px między
  oznaczeniami. [PROPOZYCJA: zmienne `--gap-tile:14px`, `--gap-section:16px`,
  `--gap-bar:8px`, `--page-gutter:15px` w `base.css`.]
- Pionowo: topbar 68 px → `.bar` od tej samej wysokości na każdej stronie
  (dziś tytuł zaczyna się na y = 82 / 90 / 99 px, patrz R4).

## A13. Pusty stan

Jeden komponent `.empty-state` (przerywana ramka `1px dashed var(--line2)`,
`border-radius:12px`, tekst 13 px `opacity .7`, centralnie; opcjonalna akcja).
Dziś istnieje jako `.share-empty-state` (`base.css:1961`) tylko dla udostępniania.
Pusta lista = kafel „+” (`.addCard`) + `.empty-state` pod nim z tekstem „Brak …”
(`.list-empty` jako alias w kodzie).

## A14. Teksty i nazwy

- Etykiety kart i stanów **te same** na telefonie i komputerze (`GOTOWA` = stan,
  nie karta Preparowana).
- Jedna nazwa na stronę: „Ustawienia gry” (decyzja), a nie „Ustawienia
  rozgrywki”; „Wstecz” tylko jako atrybut dostępności, w UI nazwa strony.

---

# B. Przegląd stron

Legenda: **✓** zgodne · **✗ n** odstaje (numer = opis w B2) · **—** nie dotyczy.
Lokalizacje `plik:linia` względem `web/`.

## B1. Tabele

### Struktura

| Strona | Rodzaj | Topbar | Karty | Pasek akcji | Marginesy |
|---|---|---|---|---|---|
| `/` (landing) | tekstowa | — (marka + język) | — (kotwice `#`) | — | ✓ |
| `/login/` | wejście | — (własny `login-back-fixed`) | — | — | — |
| `/login/reset/`, `/login/confirm/` | wejście | — | — | — | — |
| `/games/` | lista | ✓ | ✗ K1, K3 | ✗ P1 | ✓ |
| `/games/editor/` | praca | ✗ T1 | — | — | ✓ |
| `/games/settings/` | praca | ✗ T1, T7 | — (menu boczne) | — | ✗ R1 |
| `/control/` | praca | ✗ T3 | ✗ K5 | — | ✗ R2 |
| `/control/display\|host\|buzzer/` | urządzenie | — | — | — | — |
| `/connect/` | formularz | ✓ | — | ✓ | ✓ |
| `/connect/tv/` | urządzenie | — | — | — | — |
| `/go/` | wejście | — | — | — | — |
| `/polls/` | praca | ✗ T1 | ✗ K2 | ✗ P2 | ✓ |
| `/polls/vote/*` | wejście | — | — | — | — |
| `/subscriptions/` | lista | ✓ | ✗ K4 | ✗ P1 | ✓ |
| `/bases/` | lista | ✓ | ✗ K1, K4 | ✗ P1 | ✓ |
| `/bases/explorer/` | praca | ✗ T1, T3 | — | ✓ | ✗ R3 |
| `/logo/` | lista | ✓ | ✓ | ✗ P3 | ✓ |
| `/logo/editor/*` | praca | ✗ T1, T3 | — | — | ✓ |
| `/marketplace/` | lista | ✗ T6 | ✗ K6 | ✗ P4 | ✓ |
| `/account/` | formularz | ✗ T2, T5 | — | — | ✓ |
| `/manual/` | tekstowa | ✓ | ✗ K7 | — | ✓ |
| `/privacy/` | tekstowa | ✗ T8 | — | — | ✓ |

### Elementy

| Strona | Kafel | Oznaczenia | Szukaj / filtr | Sekcje udostępn. | Komunikaty | Okna | Przyciski | Pusty stan |
|---|---|---|---|---|---|---|---|---|
| `/` | — | — | — | — | — | — | ✓ | — |
| `/login/` (+reset, confirm) | — | — | — | — | ✓ (treść strony) | ✓ | ✗ B1 | — |
| `/games/` | ✓ wzór | ✓ | ✓ | — | ✓ | ✗ M1 | ✗ B2 | ✓ |
| `/games/editor/` | — | — | — | — | ✓ | ✗ M1 | ✓ | ✗ E1 |
| `/games/settings/` | — | — | — | — | ✓ | ✗ M2 | ✓ | ✗ E1 |
| `/control/` | — | ✓ | — | ✗ X3 | ✗ D1 | ✗ M3 | ✗ B3 | ✗ E1 |
| `/connect/` | — | — | — | — | ✓ | ✗ M1 | ✓ | ✗ E1 |
| `/go/` | — | — | — | — | ✓ | — | ✓ | — |
| `/polls/` | ✗ L2 | ✓ | — | ✗ X2 | ✓ | ✗ M3 | ✗ B4 | ✗ E1 |
| `/polls/vote/*` | — | — | — | — | ✓ | — | ✓ | — |
| `/subscriptions/` | ✗ L2 | ✓ | ✗ S1 | ✗ X1 | ✗ D2 | ✗ M1 | ✓ | ✗ E1 |
| `/bases/` | ✗ L3 | ✓ | ✓ | ✗ X4 | ✓ | ✗ M1 | ✓ | ✓ |
| `/bases/explorer/` | — (wiersze) | ✓ (`.chip`) | ✓ | — | ✓ | ✓ | ✗ B5 | — |
| `/logo/` | ✗ L1 | — | ✓ | — | ✓ | ✓ | ✓ | ✗ E1 |
| `/logo/editor/*` | — | — | — | — | ✓ | ✓ | ✗ B6 | — |
| `/marketplace/` | ✗ L4 | ✗ O1 | ✗ S2 | — | ✓ (wspólny) | ✗ M1 | ✓ | ✗ E1 |
| `/account/` | — | — | — | — | ✗ D3 | ✓ | ✗ B7 | — |
| `/manual/` | — | — | — | — | — | — | ✓ | — |
| `/privacy/` | — | — | — | — | — | — | ✓ | — |

### Zrzuty (390 × 844 | 1400 × 900)

Tło: szkielet strony bez danych (patrz „Jak wykonano”). Kolejność jak w tabeli.

<table>
<tr><th>Strona</th><th>Telefon 390 × 844</th><th>Komputer 1400 × 900</th></tr>
<tr><td><code>/</code></td><td><img src="img/wzorce/home-m.png" width="150"></td><td><img src="img/wzorce/home-d.png" width="420"></td></tr>
<tr><td><code>/login/</code></td><td><img src="img/wzorce/login-m.png" width="150"></td><td><img src="img/wzorce/login-d.png" width="420"></td></tr>
<tr><td><code>/login/reset/</code></td><td><img src="img/wzorce/login-reset-m.png" width="150"></td><td><img src="img/wzorce/login-reset-d.png" width="420"></td></tr>
<tr><td><code>/login/confirm/</code></td><td><img src="img/wzorce/login-confirm-m.png" width="150"></td><td><img src="img/wzorce/login-confirm-d.png" width="420"></td></tr>
<tr><td><code>/games/</code></td><td><img src="img/wzorce/games-m.png" width="150"></td><td><img src="img/wzorce/games-d.png" width="420"></td></tr>
<tr><td><code>/games/editor/</code></td><td><img src="img/wzorce/games-editor-m.png" width="150"></td><td><img src="img/wzorce/games-editor-d.png" width="420"></td></tr>
<tr><td><code>/games/settings/</code></td><td><img src="img/wzorce/games-settings-m.png" width="150"></td><td><img src="img/wzorce/games-settings-d.png" width="420"></td></tr>
<tr><td><code>/control/</code></td><td><img src="img/wzorce/control-m.png" width="150"></td><td><img src="img/wzorce/control-d.png" width="420"></td></tr>
<tr><td><code>/control/display/</code></td><td><img src="img/wzorce/control-display-m.png" width="150"></td><td><img src="img/wzorce/control-display-d.png" width="420"></td></tr>
<tr><td><code>/control/host/</code></td><td><img src="img/wzorce/control-host-m.png" width="150"></td><td><img src="img/wzorce/control-host-d.png" width="420"></td></tr>
<tr><td><code>/control/buzzer/</code></td><td><img src="img/wzorce/control-buzzer-m.png" width="150"></td><td><img src="img/wzorce/control-buzzer-d.png" width="420"></td></tr>
<tr><td><code>/connect/</code></td><td><img src="img/wzorce/connect-m.png" width="150"></td><td><img src="img/wzorce/connect-d.png" width="420"></td></tr>
<tr><td><code>/go/</code></td><td><img src="img/wzorce/go-m.png" width="150"></td><td><img src="img/wzorce/go-d.png" width="420"></td></tr>
<tr><td><code>/polls/</code> (z atrapą danych)</td><td><img src="img/wzorce/polls-m.png" width="150"></td><td><img src="img/wzorce/polls-d.png" width="420"></td></tr>
<tr><td><code>/polls/vote/text/</code></td><td><img src="img/wzorce/vote-text-m.png" width="150"></td><td><img src="img/wzorce/vote-text-d.png" width="420"></td></tr>
<tr><td><code>/polls/vote/points/</code></td><td><img src="img/wzorce/vote-points-m.png" width="150"></td><td><img src="img/wzorce/vote-points-d.png" width="420"></td></tr>
<tr><td><code>/subscriptions/</code></td><td><img src="img/wzorce/subscriptions-m.png" width="150"></td><td><img src="img/wzorce/subscriptions-d.png" width="420"></td></tr>
<tr><td><code>/bases/</code></td><td><img src="img/wzorce/bases-m.png" width="150"></td><td><img src="img/wzorce/bases-d.png" width="420"></td></tr>
<tr><td><code>/bases/explorer/</code></td><td><img src="img/wzorce/bases-explorer-m.png" width="150"></td><td><img src="img/wzorce/bases-explorer-d.png" width="420"></td></tr>
<tr><td><code>/logo/</code></td><td><img src="img/wzorce/logo-m.png" width="150"></td><td><img src="img/wzorce/logo-d.png" width="420"></td></tr>
<tr><td><code>/logo/editor/text/</code></td><td><img src="img/wzorce/logo-text-m.png" width="150"></td><td><img src="img/wzorce/logo-text-d.png" width="420"></td></tr>
<tr><td><code>/logo/editor/draw/</code></td><td><img src="img/wzorce/logo-draw-m.png" width="150"></td><td><img src="img/wzorce/logo-draw-d.png" width="420"></td></tr>
<tr><td><code>/logo/editor/image/</code></td><td><img src="img/wzorce/logo-image-m.png" width="150"></td><td><img src="img/wzorce/logo-image-d.png" width="420"></td></tr>
<tr><td><code>/marketplace/</code></td><td><img src="img/wzorce/marketplace-m.png" width="150"></td><td><img src="img/wzorce/marketplace-d.png" width="420"></td></tr>
<tr><td><code>/account/</code></td><td><img src="img/wzorce/account-m.png" width="150"></td><td><img src="img/wzorce/account-d.png" width="420"></td></tr>
<tr><td><code>/manual/</code></td><td><img src="img/wzorce/manual-m.png" width="150"></td><td><img src="img/wzorce/manual-d.png" width="420"></td></tr>
<tr><td><code>/privacy/</code></td><td><img src="img/wzorce/privacy-m.png" width="150"></td><td><img src="img/wzorce/privacy-d.png" width="420"></td></tr>
</table>

Uwagi do zrzutów: `control-*` i `games-settings` na telefonie to dla kodu
dozwolony stan („Niedostępne na telefonie”, `device-guard.js`) — zrzuty
pokazują stan szkieletu po usunięciu blokady lub komunikat „brak parametru id”.
`control/display|host|buzzer` bez sesji gry to puste ekrany urządzeń.

## B2. Opis odstępstw (kod → problem)

### Topbar

- **T1 — tytuł strony pracy znika na telefonie.** `topbar-controller.js:501-518`
  w `mountMobile()` przenosi **całą** zawartość sekcji 2 (także `.topbar-title`)
  do panelu hamburgera (`.topbar-mobile-group-2`), a CSS
  `base.css:2005-2027` (`body.topbar-title-mobile …`) zakłada, że `.topbar-title`
  zostaje w sekcji 2. Render 390 px: `.topbar-title` ma rozmiar 0 × 0
  (`/games/editor/`, `/polls/`). Dotyczy stron z klasą `topbar-title-mobile`:
  edytor gry, ankieta, ustawienia gry, menedżer bazy, edytory logo — czyli
  decyzji „tytuł + szara linijka także na telefonie” z 2026-10-09. (Nie ma
  testu na ten element: `grep topbar-title tests/` pusto.)
- **T2 — Konto: tytuł w `.bar`, nie w topbarze** (`account/index.html:56-60`),
  gdy Ustawienia gry / Ankieta mają go w sekcji 2. [PROPOZYCJA A1.]
- **T3 — `.btn.ghost` i różne etykiety wylogowania.**
  `bases/explorer/index.html:49,60,65` — Wstecz, „?” i Wyloguj jako
  `btn ghost` (pozostałe strony `btn`); etykieta wylogowania ma trzy klucze: `common.authEntry` (większość),
  `control.logout` (`control/index.html:553`), `baseExplorer.logout`
  (`bases/explorer/index.html:65`) zamiast jednego `common.logout`. Control: sekcja 2 to
  wskaźniki urządzeń (`.top-status`) i `#c2TopbarProgress` zamiast tytułu —
  inny układ niż pozostałe strony pracy.
- **T4 — `/logo/` (drobiazg):** `id="brandTitle"` siedzi na znaku `FAMILIADA` (`logo/index.html:45`) — pozostałość po starym edytorze; id używa już tylko `logo/js/editor-page.js:55` (podtytuł edytora), na liście jest martwe.
- **T5 — `/account/`:** sekcja 4 pusta (`account/index.html:49`) — brak menu
  konta (`nazwa ▾`), mimo planu „sekcja 4 także na account”. To samo `/go/`
  (`go/index.html:47`, ale tam brak konta uzasadniony).
- **T6 — `/marketplace/`:** dwa przyciski wstecz w sekcji 1
  (`marketplace/index.html:44-46`: `btnGoGames` i `btnBackBrowse` naprzemiennie
  `hidden`), tytuł `.mkt-title` złoty 22 px (`marketplace.css:41`) zamiast `.bar`
  + `.title`.
- **T7 — nazwa „Ustawienia rozgrywki” vs „Ustawienia gry”.** Tytuł topbara
  ustawień pokazuje `USTAWIENIA ROZGRYWKI` (`pl.js:4890`), decyzja i tabela
  w ujednolicenie 4 mówią `USTAWIENIA GRY`; przycisk na liście gier też
  „Ustawienia rozgrywki” (`pl.js:1004`).
- **T8 — `/privacy/`:** w sekcji 3 tylko pusty slot (`privacy/index.html:56`),
  brak „?”; plan nawigacji (sekcja 4) każe dodać „?” także na Prywatności.

### Karty

- **K1 — `pushState` zamiast `replaceState`** przy zmianie karty:
  `games/js/games.js:753`, `bases/js/bases.js:1263` (decyzja: `replaceState`;
  `logo/js/list.js:189` i `subscriptions/js/subscriptions.js:307` już tak
  robią).
- **K2 — Ankieta: karty bez adresu.** `polls/js/polls.js:502-520`
  (`setActiveTab`) — stan karty tylko w pamięci, brak `?tab=`; odświeżenie
  wraca do domyślnej.
- **K3 — „Preparowana” → „Gotowa” na telefonie** (`games/index.html:157,162`,
  klucz `games.tabs.preparedMobile`); zbiega się ze stanem **GOTOWA**
  kafla i z kartami „Ankieta / Punkty / Społ.” (skróty bez ujednoliconej zasady).
  Karty gier mają też selektory per karta na sztywno
  (`games.css:262-266`, `#tabPollText.active …`).
- **K4 — kopie CSS kart.** Ten sam komponent trzy razy: `bases.css`
  (`.bases-tabs-card`), `subscriptions.css:8-60` (`.subs-tabs-card`),
  `shared/css/polls.css` (`.polls-tabs-card`) + `games.css:151-340` +
  `logo.css` (`.logo-tabs-card`) + `control.css:583` (`.control-tabs-card`).
  Dodatkowo: `bases.js:1274-1279` trzyma `sessionStorage` (zakaz:
  „Bez zapasu w sessionStorage”).
- **K5 — Control:** własny komponent kroków (`control.css:583`), osobna
  mechanika; poza decyzją o kartach — do uzgodnienia, czy zostaje jako
  „kroki”, a nie karty.
- **K6 — Społeczność:** brak kart; „Moje wysłane” to przycisk w `.bar`
  przełączający widok (`marketplace.js` `showView`) i drugi „Wstecz”.
- **K7 — Instrukcja:** karta w `#hash` (`manual.js:63,88-96`) + `?tab=` jako
  druga droga; decyzja: tylko `?tab=`, hash jako kotwica w karcie.

### Paski akcji

- **P1 — skróty na telefonie.** `games/index.html:94-101,193-205`:
  „Podgl.”, „Edyt.”, „Exp.plk”, „Exp.bz”, „Imp”; `bases/index.html:67-75`:
  „Przegl.”, „Udos.”; `subscriptions/index.html:63-66`: „Ponów”. Osobne
  `<span class="only-mobile">` na przycisk. Wzór: pełne słowa + zawijanie.
  (Styk z E17c pkt 1.)
- **P2 — Ankieta: dolny pasek na telefonie.** `shared/css/polls.css:190-230`
  (`.pollBarActions` `position:sticky; bottom:0`) + obejście dymka
  `polls.css:542-544`; decyzja 2026-10-09: bez dolnego paska. (To jest
  E17c pkt 6 — nie duplikować.)
- **P3 — Logo:** pasek ma „Edytuj” złote i „Podgląd” (`logo/index.html:70-73`),
  gry „Podgląd · Edytuj · Ankieta” bez złotej akcji głównej, bazy „Przeglądaj”
  (złote) · „Udostępnij”. Różna kolejność i brak reguły „główna = złota,
  pierwsza z lewej”.
- **P4 — Społeczność:** wyszukiwanie, język i sortowanie jako osobny blok
  z etykietami nad kaflami (`marketplace/index.html:73-95`,
  `.mkt-search-bar`), nie dolny pasek; pola `.inp` 16 px, inne niż
  `.searchBox` z list.

### Marginesy

- **R1 — Ustawienia gry:** `.gs-body` bez `.wrap`, `padding` boku 28 px
  (pomiar `main`), menu boczne `.gs-layout 210px 1fr` przylega do lewej
  krawędzi, stopka od x = 20 px (zrzut `games-settings-d.png`), gdy inne
  strony mają 88 px / 15 px (`game-settings.css:3-14`).
- **R2 — Control:** `.wrap.wide{width:90%}` (`control.css:40`) → 35 px
  z boku na 390 px.
- **R3 — Menedżer bazy:** `padding: 0 12px 12px` + panel lewy 320 px
  (`base-explorer.css:25-33`), 8 px na telefonie.
- **R4 — Pionowy start treści.** Tytuł zaczyna się na y = 90 px (listy),
  82 px (Konto, Podłącz urządzenie), 99 px (Społeczność), 117 px (Instrukcja
  `.page-title` `margin:20px 0 12px`). Wynik różnych `padding-top` `.wrap`
  (`games.css:68`: `4px 18px 18px`, `base.css:640`: `18px`).

### Elementy

- **L1 — kafel Logo** (`logo.css:47-130`): własna klasa `.logoTile`
  (`display:grid`, `min-height:230px`, promień `--radius-lg`, nazwa **w jednej
  linii** bez wielkich liter 14 px), kosz `.logoX` (inna klasa niż `.x`),
  brak `.cardTags`; siatka `minmax(270px,1fr)` (`logo.css:33-38`) zamiast 230.
- **L2 — kafle Ankiety i Subskrypcji:** `.card` z `games.css`, ale
  subskrypcje dopisują `.sub` (jedna linia, `subscriptions.css:101-112`)
  zamiast opisu `.meta`, tagi w `.meta` (nie `.cardTags`), ankieta
  `.subTile` (`polls.js:700-727`) wyższy i szerszy (w zrzucie `polls-m.png`, z atrapą danych, kafle są wyższe niż kafle gier i układają się w jednej kolumnie).
- **L3 — kafel Bazy:** `.card.proposed` koloruje cały kafel na złoto
  (`bases.css:92-97`) — przeczy decyzji „sekcje zamiast kolorów”; tagi w
  `.meta` z `flex-wrap` (`bases.css:99-104`).
- **L4 — kafel Społeczności** (`marketplace.css:98-170`): `.mkt-card`, promień
  18 px, tło `--card`, tytuł 15 px **bez wielkich liter**, autor / opis /
  stopka w osobnych klasach, oznaczenia **u góry** kafla (`.mkt-card-top`),
  `minmax(240px,1fr)`.
- **O1 — oznaczenia w Społeczności:** `.mkt-added-badge` (`marketplace.css:324`,
  `index.html:209`) własna klasa zamiast `.tag--ok`; reszta już `.tag`.
- **S1 — Subskrypcje:** filtr to dwa przyciski Aktualne / Archiwalne + sort
  (`subscriptions.css:116-132`, `.subs-view-toggle`), inny wygląd niż
  `.list-filter` (Gry, Bazy); decyzja E17 chciała „ten sam wygląd co filtr
  w Subskrypcjach” — dziś to Subskrypcje są wyjątkiem względem wspólnego
  modułu (`list-search.js` ma opcję `filter`, Subskrypcje jej nie używa).
- **S2 — Społeczność:** własne pola (`mkt-search-input`, `mkt-filter`)
  zamiast `list-search.js`.
- **X1–X4 — sekcje udostępniania** (A6): cztery różne realizacje —
  Subskrypcje: jeden płaski grid kafli z kolorem tagu, bez sekcji
  (`subscriptions.js:441-501`); Ankieta: jeden `.subsGrid`, najpierw
  zaproszeni, potem reszta, bez nagłówków (`polls.js:700-748`); Control:
  `.shareRow` (`shareDevice.js:150,199`); Bazy: modal z `.shareSection` +
  `.shareRow` (`bases/index.html:168-230`, `bases.js:1016,1061`), jedyne
  z nagłówkami „Oczekujące / Aktywni”. (Styk z E17c pkt 5.)
- **D1 — Control:** `alert(...)` w `control/js/app.js:1301`, dymki tylko dla
  kopiowania i maila (ujednolicenie inwentarz).
- **D2 — Subskrypcje:** mieszanka — sukces `toast`, błędy `alertModal`
  (19 wywołań, `subscriptions.js:519-618`); decyzja: błędy zostają w oknie,
  ale zapis / mail = dymek — do sprawdzenia, czy błąd sieci też ma być dymkiem
  (A9: tak).
- **D3 — Konto:** `#err` pole błędu pod formularzem (`account/index.html:61`)
  zostaje wg inwentarza, ale wygląda inaczej niż dymek błędu; 8 stanów
  usunięto, ale brak weryfikacji, że każdy ma dymek.
- **M1 — okna jako ręcznie pisany HTML.** `.overlay` > `.modal` w 13 plikach
  `index.html` (m.in. games, bases, logo, subscriptions, marketplace, control,
  edytor gry) z własnymi `mHead / mTitle / mSub` (`games.css`, sekcja MODALS);
  `.uni-modal` powstaje tylko w `modal.js`, a `modal-sheet` na telefonie mają
  tylko edytory / lista logo, menedżer bazy i okno kontaktu. Gry,
  Subskrypcje, Społeczność, Podłącz urządzenie nie wchodzą w tryb sheet.
- **M2 — blokady trzech wyglądów.** `#deviceGuard` („Niedostępne na
  telefonie” z ikoną i „Wróć”), `#resourceLockGuard` („Zajęte w innym miejscu”
  bez ikony), alert „Informacja” (`.uni-modal`) — zrzuty
  `games-settings-m.png`, `logo-text-m.png`, `games-editor-m.png`.
- **M3 — `.qrModalOverlay`** (`polls.css:5-60`, `control.css`) —
  trzeci szkielet okna (ciemne tło `#05050a`, inny promień).
- **B1 — logowanie:** własny `.btn` (`login/css/login.css:115-131`,
  `padding:12px`, `text-transform:uppercase`, `letter-spacing:.06em`) i
  `.btn.main` (`auth-landing.css:148`) zamiast `.btn.gold`.
- **B2 — Gry:** brak akcji głównej (gold) w pasku, skróty (P1).
- **B3 — Control:** własna rodzina przycisków `.c2-btn` / `.c2-btn.primary` (12 miejsc w `control/js/ui.js`, styl inline w `control/index.html:288-300`) obok `.btn`; `.btn.btn-sm` (2 miejsca w `control/index.html`).
- **B4 — Ankieta:** `btn sm gold` ×5 w jednym pasku (`polls/index.html:70-78`) —
  w jednym widoku widoczna jest jedna, ale wszystkie pięć klas „głównych”
  zostaje w DOM; „Przerwij” = `.pollAbort` (czerwony obrys, wzór), reszta
  aplikacji `.btn.danger` (czerwone wypełnienie).
- **B5 — Menedżer bazy:** `btn ghost` (T3).
- **B6 — Edytor rysunku logo:** własna rodzina `.tbtn` (np. `tbtn danger`, `logo/editor/draw/index.html:116`) zamiast `.btn` — inny wygląd paska narzędzi niż reszta.
- **B7 — Konto:** `btn gold full` w każdym panelu (nazwa, e-mail, hasło, migracja — cztery „główne” akcje na jednej stronie), „Usuń konto” `btn danger full`
  (czerwone wypełnienie).
- **E1 — puste stany:** 9 klas — `.list-empty` (`games.css:955`),
  `.subs-empty` (`subscriptions.css:101`), `.pollsEmpty` (`polls.css:270`),
  `.share-empty-state` (`base.css:1961`), `.mkt-empty`
  (`marketplace.css:89`), `.connect-device-empty`, `.logoGridEmpty`
  (`control.css:2323`), `.empty` (edytor gry, `editor.css:175`), `.gs-picker-empty` (`game-settings.css:613`).

## B3. Pomiary marginesów (390 px, lewy / prawy odstęp pierwszych elementów)

| Strona | `main` padding | Treść |
|---|---|---|
| `/games/`, `/connect/`, `/subscriptions/`, `/bases/`, `/account/`, `/logo/`, `/marketplace/`, `/manual/`, `/privacy/`, `/games/editor/`, `/logo/editor/text/` | 15 / 15 | 15 – 15 ✓ |
| `/control/` | 15 / 15 | **35 – 35** (`.wrap.wide`) |
| `/games/settings/` | **28 / 28** | menu boczne bez marginesu |
| `/bases/explorer/` | **8 / 8** | panel 8 px |
| topbar (wszystkie) | 10 / 10, wysokość 68 px | ✓ |

---

# C. Lista poprawek wzorcami

Pogrupowane wg wzorca, uporządkowane wg wpływu na wygląd (od największego).
**Rozmiar:** S = godziny (jeden plik / klasa), M = ok. dzień (kilka plików +
spece), L = kilka dni (nowy komponent, wiele stron, zmiana spec).
**E17c** = już w toku (nie zlecać drugi raz).

| # | Wzorzec | Co zrobić | Strony | Rozmiar | E17c |
|---|---|---|---|---|---|
| 1 | **Topbar: tytuł na telefonie** (A2) | w `mountMobile()` zostawić `.topbar-title` w sekcji 2 (pomijać w `while` przy `topbar-controller.js:518`); dopisać spec 390 px, że tytuł widać | ankieta, edytor gry, ustawienia gry, menedżer bazy, edytory logo (6 stron) | **S** | nie |
| 2 | **Kafel** (A5) | jeden komponent kafla w `base.css` (`.tile`): nazwa / opis / `.cardTags` na dole / `.x` w rogu; przenieść na nią Gry, Bazy, Logo (`.logoTile`), Subskrypcje, Społeczność (`.mkt-card`), kafle subskrybentów w ankiecie; jedna `minmax` siatki; jeden `.addCard` (`.plus` + `.txt` + `.sub`) | 6 stron | **L** | tak, pkt 3–4 (gry, bazy, subskrybenci) — dołożyć logo i Społeczność, `.card.proposed` |
| 3 | **Sekcje udostępniania** (A6) | jeden komponent „sekcje wg stanu” + kafel z #2; Subskrypcje, ankieta, modal bazy, udostępnianie urządzeń | 4 | **L** | tak, pkt 5 |
| 4 | **Karty** (A3) | jeden CSS karty (`base.css`), `setTab()` / `tabFromUrl()` we wspólnym module (`?tab=`, `replaceState`, bez `sessionStorage`); ankieta, Instrukcja, gry, bazy; etykiety bez „Mobile”; Społeczność: karta „Moje wysłane” zamiast przycisku | 7 | **L** | nie |
| 5 | **Paski akcji** (A4) | pełne etykiety bez skrótów (`only-mobile`), zawijanie całymi przyciskami; główna akcja złota z lewej na wszystkich listach; ankieta bez dolnego paska | gry, bazy, logo, subskrypcje, ankieta | **M** | tak, pkt 1 i 6 (zawijanie, ankieta) — skróty i złota akcja nowe |
| 6 | **Przyciski** (A11) | `.btn.main` → `.btn.gold`, usunąć własne `.btn` logowania; `.btn.danger` → czerwony obrys; usunąć `ghost`, `btn-sm`; Control `.c2-btn` i `.tbtn` rysowania logo na `.btn`; jeden `common.logout` | logowanie, konto, edytory logo, eksplorator, Control, ankieta | **M** | nie |
| 7 | **Marginesy** (A12) | `.wrap` wszędzie 15 px; ustawienia gry, Control, eksplorator — marginesy z `.wrap`; tokeny `--page-gutter`, `--gap-*` | 3 + R4 (start pionowy) | **M** | nie |
| 8 | **Tytuł strony** (A1) | Konto → topbar; Społeczność / Instrukcja → `.bar` + `.title`; start pionowy od tej samej wysokości; „Ustawienia gry” wszędzie | konto, Społeczność, Instrukcja, ustawienia | **M** | nie |
| 9 | **Oznaczenia** (A7) | `.mkt-added-badge` → `.tag--ok`; `.card.proposed` → tag; opis reguł `.tag` / `.badge` / `.chip` w `base.css` | Społeczność, bazy | **S** | częściowo (pkt 3) |
| 10 | **Wyszukiwanie / filtr** (A8) | Subskrypcje na wspólny `filter` z `list-search.js` (Aktualne/Archiwalne jako opcja); Społeczność do dolnego paska | subskrypcje, Społeczność | **M** | nie (filtry gier / baz już E17b) |
| 11 | **Dymki** (A9) | `alert()` w Control → `toast`/`alertModal`; błędy zapisu Subskrypcji i Konta → `toast({kind:"error"})`; sprawdzić 8 stanów Konta | Control, subskrypcje, konto | **S** | nie |
| 12 | **Okna** (A10) | wszystkie okna na `.uni-modal` + `modal-sheet`; jedna blokada (ikona + tytuł + „Wróć”) dla `deviceGuard` i `resourceLockGuard`; `.qrModalOverlay` → `.uni-modal` | 13 plików HTML | **L** | nie |
| 13 | **Pusty stan** (A13) | jedna `.empty-state`, usunąć 9 klas | 8 stron | **S–M** | nie |
| 14 | **Teksty i nazwy** (A14) | `games.tabs.preparedMobile` usunąć; „Ustawienia gry” zamiast „rozgrywki”; stany GOTOWA bez kolizji | gry, ustawienia | **S** | nie |
| 15 | **Pole nazwy** (ujednolicenie 4) | ta sama szerokość `.name-field` w edytorze gry i logo (dziś ok. 245 px vs 680 px w zrzutach) | edytor gry, edytory logo | **S** | nie |

Kolejność wdrożenia, jeśli akceptujesz całość: 1 → 9, 11, 14, 15 (szybkie,
widoczne) → 5, 6, 7, 8 → 2, 3 (z E17c) → 4 → 10, 13 → 12.

---

# D. Do decyzji użytkownika

1. **Konto jako strona pracy** — tytuł `USTAWIENIA KONTA` w topbarze, bez
   `.bar`? (T2, A1.)
2. **Społeczność jako lista** — szukanie / język / sortowanie w dolnym pasku,
   „Moje wysłane” jako karta zamiast przycisku? (K6, P4, S2.)
3. **Przyciski bez skrótów na telefonie** (pełne słowa + zawijanie) —
   potwierdzić; to zmienia dolne paski i górny pasek akcji. (P1.)
4. **Czerwony obrys zamiast czerwonego wypełnienia** dla `.btn.danger` w całej
   aplikacji (dziś wzorem jest tylko „Przerwij” w ankiecie). (A11.)
5. **Control** — zostaje przy własnych „krokach” (K5) i własnej sekcji 2
   (wskaźniki urządzeń), poza wzorcem kart / tytułu?
6. **Okno QR** — przenieść na `.uni-modal` czy zostaje wąskie ciemne okno?
   (M3.)
7. **Instrukcja** — pigułki zamiast wypustek zostają (10 kart), zmieniamy tylko
   mechanizm adresu? (K7.)
8. **Tokeny odstępów** (`--page-gutter`, `--gap-tile`, …) — dodać do `base.css`
   przy poprawce #7?

Po akceptacji: poprawki wzorcami według sekcji C (każda: branch → testy →
`main`); decyzje zapisać w sekcji „Decyzje” `ujednolicenie-wygladu.md`.
