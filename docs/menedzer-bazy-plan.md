# Menedżer bazy — porządkowanie, kosz, cofanie (E22)

Strona: `web/bases/explorer/` (menedżer bazy pytań). Branch roboczy:
`ccr-ac709a92-0mcpyq`.

## Decyzje

- **2026-10-21 (użytkownik) — lewy panel i okna:**
  - Na telefonie w wysuwanym lewym panelu zostaje **samo drzewo**;
    proponowane kategorie i tagi są w oknie **„Filtry”** (przycisk przy
    lupie z licznikiem aktywnych filtrów, „Wyczyść filtry” / „Gotowe”).
  - Okno **„Przenieś do… / Kopiuj do…”** z drzewem folderów i
    **wyszukiwaniem** (płaska lista pasujących folderów ze ścieżką);
    przy przenoszeniu foldery przenoszone i ich wnętrze są zablokowane.
    W menu kontekstowym i na pasku (grupa schowka).
  - Okna wyglądają jak na `main` (zmiana nazwy przez wspólne
    `promptModal`, listy bez ramek, wiersze-kafle, stopka „Anuluj” +
    złota akcja, na telefonie roletka od dołu).
  - **Jeden wygląd drzewa (2026-10-21, użytkownik):** drzewo w lewym
    panelu wygląda jak drzewo w oknie „Przenieś do” — wspólny kod
    `ui/tree-row.js` i klasy `.tree-row`: linie prowadzące wcięć, strzałka,
    folder otwarty/zamknięty, kropki, liczba pytań w poddrzewie (kosz bez
    licznika), bieżący/wybrany folder złoty, zaznaczenie niebieskie.
  - **Widoki lewego panelu (2026-10-21, użytkownik — zastępuje okno
    „Filtry” i warianty A/B/C):** lewy panel pokazuje jeden widok na pełną
    wysokość: drzewo (domyślnie), tagi albo proponowane kategorie.
    Komputer: obok wyszukiwarki dwa przyciski „Tagi” i „Kategorie” działające
    jak radio (włączony najwyżej jeden; oba zgaszone = drzewo). Telefon:
    zamiast hamburgera trzy przyciski — drzewo, tagi, kategorie — każdy
    otwiera panel z tym widokiem (ponowne stuknięcie zamyka). „Dodaj tag”
    nadal otwiera okno. Okno „Filtry” usunięte.
  - **Drzewo ciaśniej, zaznaczenie jak na liście (2026-10-21):** mniejsze
    odstępy wierszy; zaznaczenie w drzewie i w oknie „Przenieś do” takie jak
    na liście po prawej (niebieskie tło + obrys), bieżący folder — samo
    niebieskie tło; bez złotego akcentu. Pole wyszukiwania w oknie
    „Przenieś do” na pełną szerokość.
  - **Poprawki 2026-10-21 (użytkownik):** zaznaczenie w lewym panelu na
    całą szerokość panelu, jak wiersze listy po prawej, i jednolite
    wszędzie; linie drzewa kończą się na ostatnim dziecku (└), nie są
    ucięte; wyszukiwarka na telefonie jako okno (stuknięcie w pole otwiera
    okno z polem, tabletkami i podpowiedziami), na komputerze szersza
    w prawo i w jednej linii (tabletki przewijane w poziomie); nowa ikona
    przycisku proponowanych kategorii; plakietki liczników w obrębie
    przycisku (nie wchodzą pod pasek wyszukiwania).
  - **Tabletki w wyszukiwarce (2026-10-21, użytkownik):** całe w kolorze
    tagu i cieńsze; kolor tekstu dobierany do kontrastu. — **Zastąpione
    tego samego dnia:** „wyszukiwanie i filtry działają razem, wtedy nie
    potrzebujemy tagów w wyszukiwarce” — pole wyszukiwania tylko na tekst
    (bez tabletek i `#tag`), tagi i kategorie filtruje się w lewym panelu
    (przyciski widoków z licznikiem), tekst i filtry łączą się (AND),
    „X” przy polu czyści tekst i filtry.
  - **Do decyzji (zastąpione wyżej) — odgracanie lewego panelu na komputerze** (makiety
    `menedzer-bazy/img/propozycja-*.png`, stan dziś `lewy-dzis-komputer.png`):
    - **A (rekomendacja):** lewy panel = samo drzewo (z koszem) na pełną
      wysokość; filtry w tym samym oknie „Filtry” co na telefonie, aktywne
      widać jako tabletki w wyszukiwarce i licznik na przycisku. Traci się
      tylko upuszczanie elementów na tag w panelu (zostaje „Tagi…”, Ctrl+T).
    - **B:** drzewo + zwijane sekcje „Kategorie” i „Tagi” na dole
      (domyślnie zwinięte); przeciąganie na tag zostaje.
    - **C:** bez drzewa — ścieżka (okruszki jako cele upuszczania) +
      „Przenieś do…”; najwięcej miejsca, ale bez przeglądu struktury —
      niezalecane przy głębokich bazach.
    - Czy drzewo jest potrzebne: na komputerze tak (przegląd, kosz,
      przeciąganie daleko); do samego przenoszenia już nie — jest
      „Przenieś do…”.

- **2026-10-20:** menu kontekstowe na telefonie i tablecie dotykowym wygląda jak ujednolicone okna od dołu z brancha `claude/new-session-ay1h9t` (tło #121524, rogi 28 px, linia u góry, pasek do przeciągania, wysuwanie/zjazd z animacją, przyciemnione tło, safe area, ten sam warunek telefon / tablet dotykowy).

- **2026-10-20 22:35 (użytkownik) — NADRZĘDNE, zastępują wcześniejsze ustalenia niżej:**
  - Tylko symulowana (lokalna) baza: zmiany i testy na lokalnym Postgresie
    (`scripts/agent-tools/local-e2e/`), **nic na produkcję**, dopóki
    użytkownik nie zdecyduje — ludziom nie może nic przestać działać.
  - Menedżer przeanalizować **dogłębnie** (nie pobieżnie) i wyklarować.
  - Podział na mniejsze moduły.
  - **Jeden rodzaj akcji** odpalany z trzech miejsc (pasek narzędzi, menu
    kontekstowe, skrót klawiszowy); dostępność, blokady i komunikaty
    przycisków/akcji z **jednego miejsca**.
  - Agent ma też zaproponować inne ulepszenia i ujednolicenia.
  - **Kosz = folder w drzewie** w lewym górnym obszarze, pod wszystkimi
    folderami. Otwarty pokazuje usunięte foldery i pojedyncze pytania (jeśli
    usuwano je pojedynczo) — jak zwykły folder na liście.
  - W koszu zwykły przycisk „Usuń” z paska usuwa **trwale**. Przywracanie:
    po kliknięciu (zaznaczeniu) elementu pojawia się przycisk „Przywróć”;
    jeśli się zmieści — w pasku narzędzi.
  - Obecne okno kosza (`trash-modal.js`, wiersz na dole lewego panelu) jest
    do zastąpienia tym modelem.
  - **Zachować wszystkie dobre rzeczy**, ale uspójnić i ujednolicić:
    zaznaczanie (klik, Ctrl, Shift, Ctrl+A, zaznaczanie ramką /
    „marquee”), przeciąganie, menu kontekstowe, gesty na telefonie,
    skróty i podobne. Nic z działających funkcji nie może zniknąć.
  - **Telefon:** obecne gesty zostają (przytrzymanie = menu, podwójne
    stuknięcie itd.), a do przemyślenia są dodatkowe gesty dotykowe,
    np. dwoma palcami, jako odpowiedniki akcji z myszy i klawiatury
    (zaznaczanie wielu, ramka, cofanie). Gest = kolejne wejście do tego
    samego rejestru akcji.
  - **Renderowanie list do przebudowy:** dziś kilka nakładających się reguł
    w różnych miejscach (widoki, pamięci podręczne, liczniki, sortowanie,
    filtry). Cel: jedno źródło stanu i jedna prosta, niezawodna ścieżka
    „stan → co pokazać → render” dla drzewa, listy i lewego panelu.
  - **Spójne nazewnictwo:** w kodzie są nazwy niezgodne z tym, co znaczą
    i co widzi użytkownik — np. „meta” (`VIEW.META`, `metaSelection`,
    `_allQuestionMetaMap`) dla „pasujących kategorii”, czyli typów gry,
    do których pytanie się nadaje: odpowiedzi + punkty → preparowana,
    same odpowiedzi → punktowana, samo pytanie → ankieta tekstowa.
    Analiza ma zawierać słownik pojęć (UI ↔ kod ↔ baza) i listę nazw do
    zmiany; nazwy w kodzie zgodne ze słownikiem i z `game-rules.js`.
  - **Nagłówek sekcji w lewym panelu** (dziś „Pasujące kategorie”) ma
    mówić, że to dopasowanie/propozycja, nie przypisanie — np.
    **decyzja 2026-10-20: „Proponowane kategorie”** (EN „Suggested
    categories”, UK „Запропоновані категорії”).
  - **Dymki (tooltipy):** czasem nakładały się na siebie albo były słabo
    widoczne — przeanalizować kropek kategorii/tagów i przycisków
    (pozycja, chowanie, telefon). **Decyzja: dymki ujednolicić** — jeden
    mechanizm (`shared/js/core/tooltips.js`) zamiast osobnego
    `.dot-tooltip` menedżera.
  - **#tag w wyszukiwarce → tabletka (zgłoszenie 2026-10-20, błąd):**
    zamiana działa tylko na `keydown` spacji/przecinka/Entera i tylko dla
    pełnej, dokładnej nazwy. Test lokalny (kod `main` i branch): komputer —
    działa po spacji/Enterze (zostawia spację w polu); telefon (klawiatura
    ekranowa, `keydown` = „Unidentified”) — **nigdy nie działa**. Naprawa:
    rozpoznawanie w zdarzeniu `input` (każda klawiatura), podpowiedzi
    pasujących tagów po wpisaniu `#`, wybór stuknięciem/Enterem, bez
    pozostawiania spacji; test e2e na komputer i telefon.
  - **Hamburger „resetuje i mruga” paskiem (zgłoszenie 2026-10-20):**
    test lokalny na kodzie `main`: DOM paska NIE jest przebudowywany
    (zmienia się tylko `aria-expanded`). W wąskim oknie komputera (800 px)
    otwarcie panelu zmienia szerokość strony 800 → 788 px: reguła
    `html:has(body.explorer-drawer-open){scrollbar-gutter:stable}`
    (`shared/css/base.css`) + `body.overflow=hidden` przesuwają cały
    układ o pasek przewijania — to wygląda jak „przeładowanie” paska.
    Na telefonie (390 px, paski nakładane) bez zmian w teście; do
    sprawdzenia na urządzeniu użytkownika. Naprawa w ramach E22.
  - **Tabela listy:** przeanalizować i ujednolicić szerokości kolumn
    (dziś niespójne) oraz sortowanie klikiem w nagłówek (dziś kilka
    nałożonych warunków). Jedna definicja kolumn (szerokość, porównanie,
    domyślny kierunek) i jeden stan sortowania używany przez render.
  - **Pasek narzędzi zależny od widoku (do decyzji, propozycja agenta):**
    każda akcja w rejestrze ma dwa warunki: „ma sens w tym widoku”
    (nie → przycisk znika) i „można teraz” (nie → wyszarzony). Przycisk
    znika tylko przy zmianie widoku, nie przy każdym kliknięciu, więc pasek
    nie skacze. Np. kosz: Przywróć, Usuń trwale, Opróżnij kosz; wyszukiwanie
    i tagi: bez Nowy folder/pytanie i Wklej; foldery: jak dziś.
  - **Niebieskie wyróżnienie przycisków w pasku narzędzi zostaje**
    (użytkownikowi się podoba) — także dla nowych przycisków (kosz, Przywróć).
  - **Wygląd strony zostaje** (użytkownikowi się podoba) — bez zmian
    wizualnych poza tym, czego wymagają nowe funkcje (kosz w drzewie).
  - **Menu kontekstowe do poprawy:** prawy przycisk myszy i długie
    przytrzymanie na telefonie — ma się ładnie mieścić i być wygodnie
    dostępne w widoku mobilnym (dziś „nie do końca”). Pozycje menu z tego
    samego rejestru akcji.
  - **Kosz (doprecyzowanie 2026-10-20):** zwykły wiersz folderu w drzewie,
    od razu pod folderami, **bez osobnego stylu** (jak inne foldery; ikona
    kosza), **bez plakietki z liczbą elementów**. Dzisiejszy przycisk na
    dole panelu znika.
  - **Pomysł na później (NIE teraz):** wszystkie okna na telefonie w stylu
    arkusza od dołu, jak menu kontekstowe (użytkownikowi się podoba).
  - **Pasek na komputerze (2026-10-20, zrobione):** wyszukiwarka na
    szerokość lewego panelu, przyciski od początku prawej części (pasek
    w kolumnach `.explorer`: 320px | reszta; `img/pasek-komputer.png`).
  - **Przemyśleć wyszukiwanie i filtrowanie** (tekst, #tagi w polu
    wyszukiwania, filtr tagów i kategorii w lewym panelu, blokady akcji
    w widokach wyszukiwania/tagów), żeby działało dobrze i spójnie.

- **2026-10-20 (użytkownik):** uporządkować cały kod menedżera bazy na branchu
  (kod pisany przez przepisywanie podpowiedzi z czatu — niespójny, „działa
  niby”). Potem kosz i cofanie/przywracanie (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z).
- **Kosz (domyślny wariant agenta, bez sprzeciwu użytkownika):** osobny dla
  każdej bazy; osobna tabela `qb_trash` ze zrzutem usuniętego elementu
  najwyższego poziomu (pytanie albo folder z poddrzewem i tagami pytań) —
  odczyty `qb_*` bez zmian; automatyczne usuwanie po 30 dniach (cron
  `qb-trash-cleanup` 02:17 UTC), licznik dni na wierszu (≤ 3 dni ostrzegawczo),
  przywróć (te same id; brak folderu nadrzędnego → korzeń) / usuń trwale /
  opróżnij kosz. Widzą go właściciel i edytorzy. Wejście: wiersz „Kosz”
  z licznikiem na dole lewego panelu → okno (telefon: arkusz).
  Otwarte: czy usuwanie całej bazy z listy baz też idzie do kosza (na razie nie).
- **Cofanie (plan):** historia w pamięci karty (do przeładowania), każda
  akcja przez `ops.js`, odwrotność z danych „przed” zwracanych przez bazę;
  przy konflikcie (element zmieniony/usunięty gdzie indziej) komunikat
  i wyczyszczenie historii.

## Analiza (2026-10-20)

Dogłębna analiza i plan przebudowy: [`menedzer-bazy/README.md`](menedzer-bazy/README.md)
(synteza, słownik, docelowa budowa, kolejność prac, pytania) + 4 raporty
szczegółowe w tym katalogu.

## Etapy

Aktualny stan i lista kroków: [`menedzer-bazy/PROGRESS.md`](menedzer-bazy/PROGRESS.md) (kroki 1–7 planu
z `menedzer-bazy/README.md` §4). Skrót:

1. **Porządek zapisów** — migracja 427 `qb_*` (jedna akcja = jedna funkcja
   SQL = jedna transakcja, zwracają stan „przed”), `js/ops.js` jedyne
   miejsce zapisu, `js/repo.js` odczyty. Zrobione (lokalnie).
2. **Kosz** — migracja 428 (`qb_trash`, `qb_delete_items` do kosza,
   `qb_trash_list/restore/purge`, `qb_trash_cleanup` + cron); w interfejsie
   **kosz jako folder w drzewie** (okno kosza usunięte). Zrobione (lokalnie).
3. **Cofanie / ponawianie** — `history.js` + wpisy w `commands.js`,
   migracja 429 (`qb_restore_tags`). Zrobione (lokalnie).
4. **Podział na moduły** — `actions.js` usunięty; `commands.js`,
   `actions/*`, `data/*`, `ui/*`, nowy `page.js`. Zrobione (lokalnie).
5. **Wdrożenie** — migracje 427–429 na `main` → e2e brancha na produkcji →
   Pages → testy kontrolne. **Czeka na decyzję użytkownika.**

**Testy lokalne bez produkcji:** e2e z kodem brancha na lokalnym Postgresie
+ PostgREST (atrapa `/auth/v1`, strony z dysku) — `scripts/agent-tools/local-e2e/README.md`;
spec `base-explorer` na kodzie z `main` i z brancha daje ten sam wynik
(15 błędów niezależnych od zmian: brak konfiguracji maili lokalnie i stare
asercje — m.in. limit 200 znaków pytania, tooltip kropki meta).
