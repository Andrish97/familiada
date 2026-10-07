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

## 2. Hub ankiet (największa zmiana)

Dziś: na komputerze dwie kolumny obok siebie (Moje ankiety | Zadania),
każda z własnym nagłówkiem, sortowaniem i przełącznikiem aktualne /
archiwalne; na telefonie karty; kafle to poziome wiersze `.hub-item`.

Docelowo:
- pasek strony jak na listach: tytuł i podpowiedź po lewej, przyciski
  akcji po prawej (Szczegóły, Udostępnij — tylko na karcie Ankiety);
- **karty Ankiety · Zadania** na każdym urządzeniu (zamiast kolumn);
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
- sekcja 2: `.topbar-title` — **tytuł** (nazwa strony) i **podtytuł**
  (informacja), jak w eksploratorze bazy;
- pod topbarem nic poza polem nazwy (niżej) i samą pracą.

| Strona | Tytuł | Podtytuł (informacja) | Skąd dziś |
|---|---|---|---|
| Edytor pytań | Edytor (typ gry) | wymagania, np. „Minimum 10 pytań…” | `#pageTitle` + `#hintTop` pod topbarem |
| Ankieta gry | Ankieta | nazwa gry | `.title` + pusty `#hintTop` pod topbarem |
| Ustawienia gry | Ustawienia gry | nazwa gry | `#gsTitle` w sekcji 2 (sama nazwa) |
| Edytor logo | Edytuj logo | tryb (Tekst / Rysunek / Obraz) | `#brandTitle` w sekcji 1 |
| Eksplorator bazy | Menedżer bazy pytań | nazwa bazy | bez zmian (wzór) |

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

## 5. Teksty do poprawy

- `polls.actions.reopenHint` „Otworzy nową sesję i usunie poprzednie dane
  ankietowe.” — niezrozumiałe. Propozycja: „Ankieta zacznie się od nowa —
  dotychczasowe głosy zostaną usunięte.” (pl / en / uk).

## 6. Kolejność wdrożenia (każdy punkt: branch → e2e → `main`)

1. Wspólne wymiary paska i kart (odstępy, wysokość wypustek, kąciki) —
   `base.css` / `games.css`, wszystkie listy naraz.
2. Edytory: tytuł i informacja w topbarze, jedno pole nazwy, edytor logo
   bez wskaźnika zapisu; tekst `reopenHint`.
3. Hub ankiet: karty, kafle, pasek, dolny pasek.
4. Subskrypcje: jak hub + kafel „+” i okno dodawania.
5. Wyszukiwanie / filtr na listach gier, baz, logo (jeśli potwierdzone).

Testy: `frontend-layout.spec.js`, `mobile-sheet-modals.spec.js`,
`logo-editor.spec.js`, spece hubu i subskrypcji — selektory kafli i pól
do aktualizacji razem ze zmianą.
