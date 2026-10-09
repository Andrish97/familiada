# Ujednolicenie wyglądu — listy, hub, subskrypcje, edytory

Decyzje 2026-10-07. Etap **E10** w [`wdrozenia.md`](wdrozenia.md) —
pierwszy do wdrożenia. Ten plik jest źródłem prawdy dla tego etapu.

---

## 1. Strony list — wspólny układ

Dotyczy: `/games/`, `/bases/`, `/logo/`, `/polls-hub/`, `/subscriptions/`.
Wzór: gry i bazy (pasek `.bar`, karty `.tabs-card`, `.card.games-card`,
siatka `.grid` kafli `.card`, dolny pasek `.games-bottom`).

Od góry:

1. **Pasek strony** — po lewej tytuł strony i pod nim podpowiedź akcji
   (`.title` + `.hint`); po prawej przyciski akcji **zaznaczonego kafla**.
   Mniejsze odstępy: topbar → pasek i pasek → linia kart.
2. **Karty kategorii** — niższe wypustki (trzeba przeliczyć kąciki
   `.tab-corner` i zaokrąglenia, żeby łączenie z linią zostało gładkie)
   i mniejszy odstęp między linią a wypustką. Jeden zestaw wymiarów dla
   wszystkich stron (zmienne CSS w jednym miejscu).
3. **Kafle** — wszędzie ten sam wzór: kafel `.card` jak w grach (kosz /
   odrzucenie w prawym górnym rogu `.x`, nazwa, linia meta), oznaczenia
   (tagi `.tag`) w linii meta jak w bazach; kafel „+” (`.addCard`) jak
   w grach, gdy na stronie się coś tworzy.
4. **Dolny pasek** (`.games-bottom`) — po prawej eksport / import (gdzie
   są); po lewej wyszukiwanie i filtrowanie (gdzie mają sens).

| Strona | Karty | Przyciski zaznaczonego kafla (prawa strona paska) | Dół po lewej | Dół po prawej |
|---|---|---|---|---|
| Gry | jak dziś | jak dziś | wyszukiwanie po nazwie *(propozycja)* | eksport do pliku / do bazy, import |
| Bazy | jak dziś | jak dziś | wyszukiwanie po nazwie *(propozycja)* | eksport, import |
| Logo | jak dziś | jak dziś | wyszukiwanie po nazwie *(propozycja)* | eksport, import |
| Hub ankiet | **Ankiety · Zadania** | karta Ankiety: **Szczegóły, Udostępnij**; karta Zadania: nic | aktualne / archiwalne, sortowanie, wyszukiwanie | nic |
| Subskrypcje | **Moi subskrybenci · Moje subskrypcje** | jak w hubie (do ustalenia przy wdrożeniu, co jest akcją kafla) | aktualne / archiwalne, sortowanie, wyszukiwanie | nic |

## 2. Hub ankiet — NIEAKTUALNE

> 2026-10-07: hub znika całkiem — patrz [`ankiety-refaktor.md`](ankiety-refaktor.md) (E11).
> Subskrypcje dostają trzecią kartę **Zadania**. Opis niżej zostaje tylko
> jako wzór układu dla subskrypcji.

Dziś: na komputerze dwie kolumny obok siebie (Moje ankiety | Zadania),
każda z własnym nagłówkiem, sortowaniem i przełącznikiem aktualne /
archiwalne; na telefonie karty; kafle to poziome wiersze `.hub-item`.

Docelowo:
- pasek strony jak na listach: tytuł i podpowiedź po lewej, przyciski
  akcji po prawej (Szczegóły, Udostępnij — tylko na karcie Ankiety);
- **karty Ankiety · Zadania zamiast kolumn**, na każdym urządzeniu (decyzja 2026-10-07);
- kafle w układzie jak gry / bazy (siatka), **kolory stanu zostają**;
  usunięcie / odrzucenie w tym samym miejscu co kosz w grach (`.x`);
  oznaczenia (głosy, anonimowe itp.) jako tagi jak w bazach;
- dół po lewej: aktualne / archiwalne + sortowanie + wyszukiwanie;
  po prawej nic.

## 3. Subskrypcje

Identycznie jak hub (karty, kafle, pasek, dół), z jedną różnicą: na
karcie **Moi subskrybenci** kafel **„+”** jak w grach zamiast pola
z e-mailem; „+” otwiera okno dodawania, w którym podaje się e-mail /
nazwę użytkownika.

## 4. Edytory — nazwa strony i informacja w topbarze

Dotyczy: edytor pytań `/editor/`, ankieta gry `/polls/`, ustawienia gry
`/game-settings/`, edytory logo `/logo/editor-*/`, eksplorator bazy
`/base-explorer/`. W edytorach liczy się miejsce, więc nazwa strony
i informacja nie mogą stać pod topbarem — idą **do topbaru**, tak jak dziś
w eksploratorze bazy.

Jeden układ topbaru:
- sekcja 1: `FAMILIADA` + „Wstecz” (edytor logo dziś ma tytuł w miejscu
  `FAMILIADA` — wraca do wzoru);
- sekcja 2: `.topbar-title` — **tytuł**: jaki to edytor, **wielkimi
  literami**; **podtytuł**: nazwa zasobu tylko tam, gdzie strona nie ma
  pola nazwy (decyzja 2026-10-07);
- pod topbarem nic poza polem nazwy (niżej) i samą pracą.

| Strona | Tytuł (wielkie litery) | Podtytuł | Nazwa zasobu | Skąd dziś |
|---|---|---|---|---|
| Edytor pytań | EDYTOR GRY | typ gry (szary, jak w menedżerze baz — decyzja 2026-10-08) | niżej, w polu nazwy | `#pageTitle` + `#hintTop` pod topbarem |
| Edytor logo | EDYTOR LOGO | tryb: Tekst / Rysunek / Obraz (szary) | niżej, w polu nazwy | `#brandTitle` w sekcji 1 |
| Ankieta gry | ANKIETA | nazwa gry | w podtytule | `.title` + `#hintTop` pod topbarem |
| Menedżer bazy | MENEDŻER BAZY PYTAŃ | nazwa bazy | w podtytule | sekcja 2 (wzór) |
| Ustawienia gry | USTAWIENIA GRY | nazwa gry | w podtytule | `#gsTitle` w sekcji 2 (sama nazwa) |

Wymagania edytora pytań („Minimum 10 pytań…”, dziś `#hintTop` pod
tytułem) — nie idą do topbaru; miejsce do ustalenia przy wdrożeniu.

Na telefonie sekcja 2 musi się zmieścić (skrócenie / ukrycie podtytułu —
sprawdzić przy wdrożeniu).

### Pole nazwy — jeden komponent

Edytor pytań (`#gameName` w `.namebar`) i edytory logo (`#logoName`
w `.editorLine` z etykietą „Nazwa”) dostają ten sam element: ta sama
etykieta, szerokość, styl i zachowanie (zapis bez przycisku).

### Edytor logo bez informacji o zapisie

Żadnego wskaźnika zapisu — ani wprost, ani pośrednio: znika `#saveStatus`
i stany „zapisywanie / zapisano / niezapisane / ponawiam”. Autozapis
działa w tle i ponawia sam. Zostaje tylko blokada (zasób zajęty →
pełnoekranowy komunikat), bo to nie jest informacja o zapisie.

### Gry — teksty stanu na kaflach (decyzja 2026-10-08)

Kafel gry pokazuje „TYP • STAN” (`games.js:684` `statusLabel`, klucze
`games.status.*` w pl / en / uk).
- **Rodzaj żeński**: dziś `OTWARTY` / `ZAMKNIĘTY` (stary rodzaj męski,
  z czasów „sondażu punktowego / tekstowego”) → **`OTWARTA` /
  `ZAMKNIĘTA`** (ankieta, gra). Sprawdzić też inne miejsca z tymi
  słowami (podgląd, instrukcja, en / uk — odpowiednik gramatyczny).
- **Preparowane gotowe do gry**: dziś `SZKIC` (gra preparowana ma zawsze
  stan `draft`) — mylące. Gdy gra preparowana spełnia warunki rozgrywki
  (`rules.play.ok`) → **`GOTOWA`**; `SZKIC` tylko, gdy jeszcze nie spełnia.
- **Zmiana 2026-10-09 (ankiety-refaktor.md, „Zatrzymaj” i „Podlicz głosy”):**
  `ZAMKNIĘTA` znika. Jeden zestaw stanów dla wszystkich gier:

  | Stan | Gra ankietowa | Gra preparowana |
  |---|---|---|
  | `SZKIC` | ankieta nieuruchomiona | nie spełnia warunków gry |
  | `OTWARTA` | trwa głosowanie (+ plakietka „N głosów”) | — |
  | `ZATRZYMANA` | głosowanie zatrzymane, niepodliczone (+ plakietka „do podliczenia”) | — |
  | `GOTOWA` | podliczona — można grać | spełnia warunki gry |

  W bazie: nowy stan `poll_stopped` w `game_status` (migracja dodająca);
  „Podlicz głosy” przechodzi do `ready`. en / uk — odpowiedniki.

## 5. Teksty do poprawy

- **Podpowiedź pod tytułem ankiety znika** (decyzja 2026-10-07). Dziś
  `#hintTop` na `/polls/` pokazuje podpowiedź do przycisku akcji
  („Gotowe do uruchomienia.”, „Możesz zamknąć ankietę.”, „Otworzy nową
  sesję i usunie poprzednie dane ankietowe.”). Tytuł idzie do topbaru,
  podtytuł to nazwa gry, a podpowiedzi „gotowe / możesz” są zbędne —
  usuwamy je (klucze `openReady`, `closeReady`, `reopenHint`). Ponowne
  uruchomienie i tak ma okno potwierdzenia (`polls.modals.reopen`) — to
  ono ma jasno mówić, że dotychczasowe głosy zostaną usunięte. Zostaje
  tylko powód, dla którego przycisku nie da się użyć (`chk.reason`),
  pokazany przy przycisku.

## 6. Kolejność wdrożenia (każdy punkt: branch → e2e → `main`)

1. Wspólne wymiary paska i kart (odstępy, wysokość wypustek, kąciki) —
   `base.css` / `games.css`, wszystkie listy naraz.
2. Edytory: tytuł i nazwa w topbarze, jedno pole nazwy, edytor logo
   bez wskaźnika zapisu; ankieta bez podpowiedzi pod tytułem.
3. Hub ankiet: karty, kafle, pasek, dolny pasek.
4. Subskrypcje: jak hub + kafel „+” i okno dodawania.
5. Wyszukiwanie / filtr na listach gier, baz, logo (jeśli potwierdzone).

Testy: `frontend-layout.spec.js`, `mobile-sheet-modals.spec.js`,
`logo-editor.spec.js`, spece hubu i subskrypcji — selektory kafli i pól
do aktualizacji razem ze zmianą.

## Komunikaty po akcji — jeden dymek (decyzja 2026-10-09)

Pola komunikatu na stronach (np. `#status` w Koncie) użytkownik usunął — nie
podobał mu się ich wygląd. Zamiast nich **jeden wspólny dymek** `toast()`
(`shared/js/core/toast.js`): na dole ekranu (nad dolnym paskiem), ~3 s,
zwykły albo błąd (czerwony obrys, do kliknięcia). **Tylko tam, gdzie efekt nie
jest oczywisty**: wysłany mail/link, zapis formularza bez widocznej zmiany
(nazwa w Koncie, hasło), skopiowany link, błąd sieci/zapisu. Bez dymka, gdy
zmiana jest widoczna sama (autozapis w edytorach, kafel znika/pojawia się,
zmiana stanu ankiety na pasku). Dwie lokalne kopie `showToast` (Społeczność,
panel admina) przechodzą na wspólny moduł. Strony logowania (`/login/`,
`/login/reset/`, `/login/confirm/`) zostają przy swoim polu stanu — tam to
jest treść strony („Sprawdź skrzynkę”), nie komunikat po akcji.
