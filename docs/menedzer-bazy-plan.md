# Menedżer bazy — porządkowanie, kosz, cofanie (E22)

Strona: `web/bases/explorer/` (menedżer bazy pytań). Branch roboczy:
`ccr-ac709a92-0mcpyq`.

## Decyzje

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

1. **Porządek zapisów (w toku):**
   - migracja 427 `qb_*`: każda akcja = jedna funkcja SQL = jedna
     transakcja (SECURITY INVOKER — RLS i wyzwalacz treści jak dotąd);
     zwracają stan „przed” (pod cofanie). Test: `tests/sql/qb-atomic-ops-427.sql`.
   - `js/ops.js` — jedyne miejsce zapisu; mapuje błędy `qb:*` na komunikaty.
   - `js/repo.js` — wszystkie odczyty; `actions.js` bez `sb()`.
   - jedna ścieżka po zapisie: `afterMutation()` (unieważnienie pamięci
     podręcznej + odświeżenie widoku); jedna funkcja kopiowania
     (`copyItemsTo`) zamiast trzech; schowek trzyma same klucze.
   - usunięty martwy kod (`actions.js` 4866 → ~4100 linii, `state.js`).
   - Zmiany zachowania: zdjęcie tagu z folderu w widoku tagu zdejmuje go
     z całego poddrzewa (wcześniej tylko z bezpośredniego przypisania
     folderu, więc folder dalej był widoczny); nazwy „Nowy folder” /
     „Nowe pytanie” z tłumaczeń; wklejenie kopii, gdy źródło usunięto
     po skopiowaniu, kończy się komunikatem „element zniknął”.
2. **Kosz (gotowe na branchu):** migracja 428 (`qb_trash`, `qb_delete_items`
   do kosza, `qb_trash_list/restore/purge`, `qb_trash_cleanup` + cron),
   test `tests/sql/qb-trash-428.sql`; `trash-modal.js`, wiersz w lewym
   panelu, tłumaczenia PL/EN/UK, scena zrzutów `base-explorer-trash`,
   e2e „base-explorer: kosz (E22)”. Przy okazji: jedna bramka skrótów
   klawiszowych (Delete w polu okna pytania usuwał zaznaczenie,
   Ctrl+Shift+N tworzył pytanie zamiast folderu), komunikaty potwierdzeń
   bez polskich wstawek w EN/UK.
3. **Cofanie / przywracanie** — na `ops.js`.
4. **Dalsze porządki** (`wireActions` ~2000 linii obsługi zdarzeń:
   podział na moduły drzewo/lista/klawiatura/przeciąganie).

**Testy lokalne bez produkcji:** e2e z kodem brancha na lokalnym Postgresie
+ PostgREST (atrapa `/auth/v1`, strony z dysku) — `scripts/agent-tools/local-e2e/README.md`;
spec `base-explorer` na kodzie z `main` i z brancha daje ten sam wynik
(15 błędów niezależnych od zmian: brak konfiguracji maili lokalnie i stare
asercje — m.in. limit 200 znaków pytania, tooltip kropki meta).
