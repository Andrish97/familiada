# Menedżer bazy pytań — analiza i plan przebudowy (E22)

Strona `web/bases/explorer/`. Analiza z 2026-10-20 (kod `main` + branch
`ccr-ac709a92-0mcpyq`), tylko z lektury kodu i lokalnych testów — błędy
oznaczone w raportach „do testu” trzeba potwierdzić. Decyzje użytkownika:
[`../menedzer-bazy-plan.md`](../menedzer-bazy-plan.md) „Decyzje”.

Szczegóły (plik:linia, tabele, scenariusze):

1. [Wejścia: zaznaczanie, ramka, przeciąganie, menu, telefon, skróty](1-wejscia.md)
2. [Wyszukiwanie, filtry, widoki, pamięć podręczna, blokady akcji](2-wyszukiwanie-filtry.md)
3. [Rysowanie, kolumny, sortowanie, dymki, pasek, menu na telefonie](3-rysowanie-kolumny-dymki.md)
4. [Spis akcji, komunikaty, słownik nazw, rejestr akcji, moduły](4-akcje-komunikaty-nazwy.md)

## 1. Diagnoza w skrócie

Kod działa „przez przypadek”: te same reguły są zapisane w wielu miejscach
i rozjechały się. Pięć źródeł większości błędów:

1. **Reguły akcji w 4 miejscach** (`actions.js`, `render.js` pasek,
   `context-menu.js`, globalne skróty) pod różnymi nazwami
   (`canWrite`/`isEditor`/`editor`/`canEdit`). Skutki: „Usuń” na pasku
   w widoku tagu kasuje elementy, a Delete i menu tylko zdejmują tag;
   „Wytnij” ma 4 różne reguły; „Utwórz grę” aktywne dla czytelnika na pasku,
   a w menu wyszarzone; komunikaty zależą od wejścia, nie od akcji.
2. **Filtr w 3 kopiach**: tagi z lewego panelu (`tagSelection`), z widoku
   (`state.tagIds`) i tabletki w polu (`searchTokens.tagIds`) + 5 widoków
   (`ALL/FOLDER/SEARCH/TAG/META`) przełączanych ręcznie w 8 miejscach.
   Skutki: klik w tabletkę ją usuwa, a lista dalej filtruje; tekst ignoruje
   kategorie i odwrotnie; 5 ścieżek wejścia do folderu o 3 zachowaniach.
3. **Pamięć podręczna w ~12 polach `state._*`** budowanych różnymi drogami,
   unieważnianych ręcznie. Skutki: stare dane po zapisie okna pytania,
   „Odśwież” nie odświeża, liczniki „—” w widoku tagu, wyścig przy szybkim
   pisaniu (wynik zapisywany do stanu przed sprawdzeniem aktualności).
4. **Pełna przebudowa DOM po 180 ms przy każdym kliknięciu** (także samym
   zaznaczeniu). Skutki: podwójne stuknięcie na telefonie „działa czasem”,
   zaznaczenie ramką kasowane kliknięciem, przeciąganie bywa przerywane,
   dymki zostają na ekranie.
5. **Ta sama obsługa napisana kilka razy**: ramka ×6 (~500 linii), zakres
   Shift ×3, odmowa blokady ×5, wykrywanie Maca ×5.

Do tego błędy punktowe (pełne listy w raportach): przeciągnięcie na tło
listy przenosi do Folderu głównego zamiast do bieżącego; Ctrl+klik może
dołożyć niewidoczny folder z drzewa, a Delete usunie go z poddrzewem;
`#tag` nigdy nie zamienia się w tabletkę na telefonie; wyszukiwanie bez
polskich znaków („zolw” ≠ „żółw”); sortowanie miesza foldery z pytaniami;
kolumny zapisane na komputerze psują układ telefonu; menu na telefonie
w poziomie ucięte, nie zamyka się Escape/przewinięciem; skróty Ctrl+N,
Ctrl+Shift+N, Ctrl+T przechwytuje przeglądarka; przytrzymane Ctrl+V/Ctrl+D
robi wiele kopii; błąd w obsłudze paska (`const t = e.target` zasłania
tłumaczenia — każdy błąd akcji z paska kończy się wyjątkiem zamiast
komunikatu); otwarcie panelu (hamburger) przesuwa układ o pasek
przewijania w wąskim oknie.

**Zostaje (działa dobrze):** wygląd strony i niebieskie wyróżnienie paska;
szkielet paska budowany raz (fokus w wyszukiwarce); tabela z `colgroup`
(nagłówek zawsze nad kolumnami); reguła „folder pasuje, gdy pasuje 100%
pytań poddrzewa” (kropki i filtr spójne); PPM zaznacza kliknięty element;
strefy przed/w/po przy przeciąganiu, walidacja cyklu, blokady poddrzew;
kopia modyfikatorem zgodna z systemem; anulowanie długiego przytrzymania
ruchem; pozycjonowanie menu; ochrona `_refreshSeq`; jedna ścieżka zapisu
`ops.js` + `afterMutation` (etap 1 tej przebudowy).

## 2. Słownik pojęć (docelowy)

| W interfejsie | W kodzie (dziś → docelowo) | W bazie |
|---|---|---|
| folder | `category`, `cat`, `c:` → `folder`, `f:` (`category` tylko w `repo.js`/`ops.js`) | `qb_categories` |
| Folder główny | `root`, `VIEW.ALL` → `location = null` | `parent_id IS NULL` |
| pytanie | `question`, `q:` (bez zmian) | `qb_questions` |
| tag | `tag` (bez zmian) | `qb_tags`, `qb_question_tags` |
| **Proponowane kategorie** | `meta`, `VIEW.META`, `metaSelection` → `suggestedType`, typy z `game-rules.js` (`prepared`, `poll_points`, `poll_text`) | — (liczone z treści) |
| Info (kolumna) | `meta`, `col-meta` → `info` | — |
| Kosz | `trash` | `qb_trash` |
| Utwórz grę | `export`, `createGame`, `import` → `createGame` | — |

## 3. Docelowa budowa

### 3.1 Stan: lokalizacja + jedno zapytanie

```
location: folderId | null | "trash"
query:    { text, tagIds, types }         // tabletki i lewy panel = ten sam query.tagIds
selection, clipboard, sort, treeOpen
```

Brak `VIEW.SEARCH/TAG/META`: „wyniki” to po prostu niepuste `query`. Jedno
miejsce zmiany (`setQuery`, `goTo`), jedno wyjście z filtrów, ten sam
skutek z każdego wejścia (dwuklik, Enter, menu, ścieżka, drzewo).

### 3.2 Dane: jeden magazyn i czyste funkcje

- `store` = kategorie, tagi, pytania, przypisania tagów (+ wpisy kosza),
  ładowany jednym `reload()` (po zapisie, po oknie pytania, po „Odśwież”),
  zapisywany do stanu tylko gdy odpowiedź jest aktualna.
- `derived(store)` liczone raz na wersję: poddrzewa, tagi i typy folderów,
  liczniki.
- `computeListing(store, location, query) → { folders, questions, counts }`
  i `canDo(actionId, ctx)` — czyste funkcje, testy jednostkowe.

### 3.3 Rysowanie

`stan → model (czyste funkcje) → render` raz na klatkę przez
`invalidate("list" | "tree" | "left" | "toolbar")`. Zmiana samego
zaznaczenia tylko przełącza klasy (bez przebudowy i bez opóźnienia 180 ms).
Jedna definicja kolumn `LIST_COLUMNS` (szerokość, minimum, porównanie,
domyślny kierunek; Nazwa wypełnia resztę; szerokości osobno dla telefonu
i komputera) i jedna funkcja sortująca (foldery zawsze pierwsze, remis:
nazwa → kolejność → id; sortowanie zapamiętane).

### 3.4 Jeden rejestr akcji

Każda akcja zdefiniowana raz (`actions/registry.js`): etykieta, ikona,
skrót, `visible(ctx)` (nie → znika, tylko przy zmianie widoku), `enabled(ctx)`
(nie → szara + powód w dymku; z klawiatury ten sam powód), potwierdzenie,
blokady zasobów, wykonanie (`ops.js`), odświeżenie, wpis do historii
cofania, komunikat błędu. Jedna ścieżka `runAction(id, ctx)`. Pasek, menu,
skróty (z `e.code`, bez powtórzeń przy przytrzymaniu), przeciąganie
i gesty tylko wywołują rejestr. Pełny kształt i lista ~30 akcji:
raport 4, §4.

### 3.5 Moduły (zamiast `actions.js` 4000 linii)

```
js/state.js            stan, location/query/selection
js/data/store.js       ładowanie (repo.js) i wersje
js/data/derived.js     poddrzewa, tagi/typy folderów, liczniki
js/data/listing.js     computeListing
js/actions/registry.js rejestr akcji
js/actions/context.js  buildContext, uprawnienia, zaznaczenie → elementy
js/actions/run.js      runAction, blokady, komunikaty, historia
js/commands/*.js       items, tags, clipboard, navigation, game, trash
js/ui/toolbar.js       pasek z rejestru (+ ui/search.js: pole, tabletki, podpowiedzi)
js/ui/context-menu.js  menu z rejestru (komputer: przy kursorze, telefon: arkusz)
js/ui/keyboard.js      skróty z rejestru
js/ui/selection.js     klik / Ctrl / Shift / zakres — jedna implementacja
js/ui/marquee.js       ramka (mysz i dotyk) — jedna implementacja
js/ui/dnd.js           przeciąganie → intencja → runAction
js/ui/gestures.js      przytrzymanie, podwójne stuknięcie, dwa palce
js/ui/left-panel.js    drzewo (z Koszem), tagi, proponowane kategorie
js/render/*.js         lista, drzewo, lewy panel, ścieżka, kolumny
js/platform.js         Mac/Windows, formatowanie skrótów
js/page.js             składanie całości
```

`repo.js` (odczyty), `ops.js` (zapisy), `history.js` i okna zostają.

### 3.6 Kosz jako folder

Wiersz „Kosz” w drzewie pod wszystkimi folderami, wyglądający jak folder, bez licznika;
`location = "trash"` pokazuje wpisy kosza w tej samej tabeli (folder /
pytanie, kolumna Info: „usunie się za N dni”). Pasek w koszu: Przywróć
(po zaznaczeniu), Usuń (= trwale, z potwierdzeniem), Opróżnij kosz;
reszta ukryta. Menu kontekstowe to samo z rejestru. Dzisiejsze okno
`trash-modal.js` znika.

### 3.7 Wyszukiwanie i filtry

- Tekst, tagi i proponowane kategorie łączone razem (AND) w jednym `query`,
  bez względu na to, skąd przyszły.
- Tekst bez polskich znaków i wielkości liter, słowa w dowolnej kolejności,
  z opóźnieniem ~200 ms; szuka w treści pytań i nazwach folderów.
- `#` w polu: rozpoznawanie w zdarzeniu `input` (każda klawiatura),
  podpowiedzi pasujących tagów, wybór Enterem/stuknięciem, bez zbędnej
  spacji.
- Wyniki: foldery w 100% pasujące (jak dziś) + pytania poza nimi; licznik
  w folderze = pasujące elementy; wejście do folderu z wyników zostawia
  filtr (z widocznym „Wyczyść”).
- Blokady: jedna reguła — w wynikach nie ma tworzenia i wklejania
  (przyciski ukryte), reszta działa na zaznaczonych elementach.

## 4. Kolejność prac (każdy krok: lokalna baza + e2e, nic na produkcję)

**Postęp:** krok 1 zrobiony (2026-10-20): `platform.js`, `actions/context.js`,
`actions/registry.js` (16 akcji), `actions/run.js`, `ui/toolbar.js`; pasek,
menu kontekstowe (522 → 143 linie) i skróty (po `e.code`, bez powtórzeń przy
przytrzymaniu) czytają z rejestru. Naprawione przy okazji: „Usuń” w widoku
tagu robi to samo z każdego wejścia (usuwa do kosza; zdejmowanie tagu to
osobna akcja „Zdejmij tag”), Wytnij/Utwórz grę/Tagi mają jedną regułę,
„Wklej” z menu folderu wkleja do niego, „Nowy folder” z menu „Folderu
głównego” tworzy w głównym, błędy akcji z paska mają komunikat, powód
niedostępności w dymku. Przyciski bez sensu w widoku znikają (decyzja 3).
Lokalny e2e `base-explorer`: 68/72, 4 porażki identyczne jak na `main`.


1. **Szkielet bez zmiany zachowania:** `platform.js`, `actions/context.js`,
   `actions/run.js`, rejestr z obecnymi akcjami; pasek, menu i skróty
   przepięte na rejestr (naprawia rozbieżności z §1 pkt 1).
2. **Stan i dane:** `location` + `query`, `store`, `derived`, `listing`
   (naprawia §1 pkt 2–3, tabletki, „Odśwież”, liczniki, wyścig).
3. **Rysowanie:** `invalidate`, zaznaczenie bez przebudowy, `LIST_COLUMNS`,
   sortowanie (naprawia §1 pkt 4, kolumny, sortowanie).
4. **Wejścia:** jedna implementacja zaznaczania, ramki, przeciągania, gestów
   (naprawia §1 pkt 5 i błędy przeciągania).
5. **Kosz jako folder** + cofanie/ponawianie przez rejestr.
6. **Wyszukiwanie** (§3.7), menu na telefonie jako arkusz, dymki, nazwy
   (Proponowane kategorie), szybkie poprawki z raportów.
7. Zrzuty (telefon 390 px, komputer 1400 px), pełny lokalny e2e, zestawienie
   dla użytkownika — dopiero wtedy decyzja o wdrożeniu.

## 5. Decyzje użytkownika (2026-10-20)

Odpowiedzi: 1 tak, 2 tak („może być”), 3 tak, 4 tak, 5 tak, 6 tak („to raczej
było źródłem problemów”), 7 — **tak: arkusz od dołu, z safe area** (`env(safe-area-inset-*)` — dół i boki; zrzuty `img/menu-*.png`),
8 tak. Pytania (domyślny wybór agenta w nawiasie):

1. Proponowane kategorie rozłączne: odpowiedzi + punkty → preparowana,
   same odpowiedzi → punktowana, samo pytanie → tekstowa (**tak** — tak
   opisał użytkownik; dziś kod liczy je jako zawierające się).
2. Foldery zawsze przed pytaniami przy każdym sortowaniu (**tak**, jak
   w Eksploratorze Windows).
3. Pasek chowa przyciski bez sensu w danym widoku (**tak**).
4. Czytelnik współdzielonej bazy może „Utwórz grę” z jej pytań (**tak** —
   to kopia do jego gier; dziś pasek pozwala, menu nie).
5. Upuszczenie / wklejenie na tło listy = do bieżącego folderu (**tak**).
6. Nazwy tagów z polskimi literami (**tak**).
7. Menu kontekstowe na telefonie jako arkusz od dołu (**tak**), na
   komputerze jak dziś.
8. Dodatkowe gesty: dwa palce przeciągnięte = ramka zaznaczania; przytrzymanie
   = menu (jak dziś); podwójne stuknięcie = otwórz (jak dziś); cofanie
   przyciskiem w pasku (bez gestu potrząśnięcia) (**tak**).
