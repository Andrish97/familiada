# Analiza 3 — menedżer bazy pytań: RYSOWANIE I UKŁAD

Zakres: `web/bases/explorer/` — `js/render.js` (961 l.), `js/actions.js` (4010 l.; refreshList, scheduleRenderList, handlery), `js/context-menu.js`, `js/mobile.js`, `js/page.js`, `js/state.js`, `css/base-explorer.css`, `index.html`, a także `web/shared/js/core/tooltips.js` i `web/shared/css/base.css`.
Tylko odczyt kodu, niczego nie zmieniałem. Numery linii według stanu z 2026-10-20 (`?v=v2026-10-20T19584`).

Oznaczenia: **[BŁĄD]** to realny scenariusz, **[RYZYKO]** wymaga potwierdzenia testem, **[NIESPÓJNOŚĆ]**, **[NADMIAR]** to warunek nadmiarowy albo podwójna praca, **[MARTWE]** to martwy kod lub CSS, **[OK]** działa dobrze.

---

## 1. Mapa funkcji rysujących

| Funkcja | Plik:linia | Co rysuje | Dane wejściowe | Sposób |
|---|---|---|---|---|
| `renderAll` | render.js:180 | header → toolbar → tree → tags → breadcrumbs → list | całe `state` | wywołuje kolejno 6 funkcji |
| `renderHeader` | render.js:189 | `#baseName` | `state.baseMeta.name` | textContent (page.js:63 robi to samo) |
| `renderToolbar` | render.js:194 | szkielet paska (raz, `data-ready="1"`), dymki, chipsy, pole, przycisk lupy/X, `disabled` | `searchTokens`, `tags`, `selection`, `clipboard`, `role`, `view` | szkielet przez innerHTML tylko raz; chipsy przez innerHTML przy każdym wywołaniu |
| `renderTree` | render.js:429 | `#tree`: nagłówek „Foldery”, korzeń, poddrzewo do głębokości 8 | `categories`, `treeOpen`, `selection`, `view/folderId`, `_allCategoryTagMap`, `_allCategoryMetaMap`, `tags` | innerHTML całego drzewa |
| `renderTags` | render.js:549 | `#matchedCategories` (meta: „Pasujące kategorie”) i `#tags` (przycisk „Dodaj tag” i tagi) | `META/META_ORDER`, `metaSelection`, `tags`, `tagSelection` | innerHTML obu sekcji |
| `renderBreadcrumbs` | render.js:611 | ścieżka korzeń / folder / … | `view`, `folderId`, `categories` | innerHTML; ukryte w SEARCH/TAG |
| `renderList` | render.js:762 | woła `renderToolbar`, potem całą tabelę (colgroup, thead, tbody) i podpina resizery | `folders`, `questions`, `sort`, `selection`, `role`, mapy `_view*`/`_all*`, `_directChildrenCount`, localStorage `base-explorer:cols:v3` | innerHTML całej tabeli przy każdym wywołaniu |

### 1.1. Zależność od pamięci podręcznych w `state`

Render czyta wyłącznie gotowe mapy. Gdy któraś jest `null`, element po cichu nie pojawia się (brak kropek albo „—”):

- `_viewQuestionTagMap`: Map(qid → Set(tagId)), tylko dla pytań z `state.questions`. Buduje ją `ensureTagMapsForUI` (actions.js:442–471) **osobnym zapytaniem sieciowym** `listQuestionTags(qIds)` (462), choć `_allQuestionTagMap` (pełna mapa dla całej bazy) jest już wtedy zbudowana przez `ensureDerivedFolderMaps` (321–330). **[NADMIAR]**
- `_allCategoryTagMap`: alias `_derivedCategoryTagMap` (454), czyli tagi wspólne dla 100% pytań w poddrzewie.
- `_viewQuestionMetaMap` / `_allQuestionMetaMap` / `_allCategoryMetaMap` (241–302): meta pytania to Set typów gry z `evaluateReadiness`. Meta folderu to przecięcie po poddrzewie. Komentarze w 238 i render.js:147 mówią „qid → metaId”, a w mapie jest Set. Gałąź `else metaIds = [v]` (render.js:159) jest **[MARTWA]**.
- `_directChildrenCount` (172–206): bezpośrednie podfoldery i pytania. Indeks pytań `_qIndex` pobiera **osobne zapytanie** `listQuestionIndex` (167), choć `_allQuestions` (z `category_id`) zwykle już jest w pamięci. **[NADMIAR]**
- `ensureDerivedFolderMaps` nie zapamiętuje wyników. Przy każdym wywołaniu przelicza `descQ` i przecięcia tagów dla wszystkich folderów. W widoku wirtualnym jedno `refreshList` woła ją 4 razy: `buildVirtualViewResults` → `ensureMetaMapsForUI` → `ensureDerivedFolderMaps`, potem znów `ensureDerivedFolderMaps` (599), dalej `ensureTagMapsForUI` → `ensureDerivedFolderMaps` (451) i `ensureMetaMapsForUI` → `ensureDerivedFolderMaps`. Podobnie `ensureMetaMapsForUI` liczy się 2 razy. **[NADMIAR]**, przy dużej bazie odczuwalne przy każdym znaku w wyszukiwarce.

### 1.2. `refreshList` (actions.js:473–773) — kolejność i wyścigi

Schemat: auto-otwarcie ścieżki w drzewie → (dla SEARCH/TAG/META) `_allQuestions` → `loadQuestionsForCurrentView` (FOLDER: **zapytanie do bazy przy każdym wejściu i każdym odświeżeniu**, 435) → routing widoku → mapy → `renderAll`.

- **[BŁĄD] Strażnik `_refreshSeq` chroni render, ale nie stan.** `state.folders`/`state.questions` są przypisywane **przed** sprawdzeniem `isStale()` (687–689, 720–722, 746–748, 764–765). Do tego `ensureTagMapsForUI` po `await listQuestionTags` zapisuje `state._viewQuestionTagMap` dla *swojej* listy (468), bez żadnego sprawdzenia.
  Scenariusz: szybkie pisanie „ab” w wyszukiwarce. Wywołanie „a” odpowiada z sieci później niż „ab” → ekran pokazuje wyniki „ab” (render z „ab”), ale potem „a” nadpisuje `_viewQuestionTagMap` mapą dla wyników „a” i kończy się na `isStale()`. Kolejny `renderList` (np. klik w wiersz) rysuje pytania „ab” z mapą tagów „a”, więc części kropek tagów brakuje. W gałęzi BROWSE stare wywołanie może tak samo nadpisać `state.questions` (765 jest przed await w 767).
- **[BŁĄD] Liczniki „N elem.” w widokach TAG/META.** `buildDirectChildrenCountMap` wołają tylko gałęzie SEARCH (693) i BROWSE (`rebuildStatusMaps`, 769); TAG i META nie. `afterMutation` (1238) czyści `_directChildrenCount = null` (1207).
  Scenariusz: w widoku tagu przeciągasz pytanie na tag (albo zdejmujesz tag) → `afterMutation` → `refreshList` w gałęzi TAG → wszystkie foldery w kolumnie „Info” pokazują „—” aż do wyjścia z widoku.
- **[NIESPÓJNOŚĆ]** SEARCH liczy liczniki przed mapami, BROWSE po mapach, TAG/META wcale. Komentarz „1) META: OR wewnątrz metaSelection” (515) przeczy kodowi (AND, 573–587 i 604). Komentarz przy TAG mówi „metaSelection (OR)” (731), a filtr robi AND.
- **[NADMIAR]** `ensureMapsForCurrentRightList` (511) to jednolinijkowy wrapper.
- **[RYZYKO]** Rekurencja `await refreshList(state)` przy pustym META/TAG (712, 739) jest bezpieczna dzięki seq, ale robi pełne drugie wywołanie.

### 1.3. Ile renderów na jedną akcję (zmierzone z kodu)

| Akcja | Ścieżka | Rendery |
|---|---|---|
| Klik w wiersz listy (bez Shift) | actions.js:2805 → `scheduleRenderList` (1759) po **180 ms** | `renderToolbar` ×2 (1763 i wewnątrz `renderList`, render.js:769), `renderList` ×1 (pełne innerHTML tabeli) |
| Shift+klik w liście | 2834 | `renderList` od razu (toolbar ×1) |
| Klik w folder w drzewie / strzałka rozwijania | 2494 → `scheduleRenderTree` (2486) po 180 ms | **`renderAll`**: drzewo, lewy panel, ścieżka i **cała tabela listy** przebudowane tylko po to, żeby zaznaczyć węzeł albo go rozwinąć |
| Dwuklik folderu w drzewie | 2564 | `refreshList` → `renderAll`. Timer z pierwszego kliknięcia **nie jest anulowany** (w liście jest, 2845), więc po 180 ms dochodzi `renderAll` w trakcie ładowania: ścieżka i drzewo już z nowym folderem, lista jeszcze stara (mignięcie). Gdy drzewo jest zablokowane, dodatkowe `refreshList` w 2566–2573, czyli łącznie 2–3 rendery |
| Klik w drzewo przy blokadzie (`isTreeLocked`) | 2496–2504 | `refreshList` i bez `return` dalsza obsługa kliknięcia (drugi render) |
| Klik w tag/meta po lewej | 2351… → `applyLeftFiltersView` → `refreshList` | 1× `renderAll`; przy fokusie w wyszukiwarce wcześniej dodatkowe `refreshList` (2352–2357) |
| Wpisanie znaku w wyszukiwarkę | 2010 | **każdy znak**: `refreshList` (bez debounce) → przeliczenie map ×4, zapytanie `listQuestionTags` i `renderAll` |
| Sortowanie (klik w nagłówek) | 1617–1630 | `renderList` i `updateSortHeaderUI` (zbędne, nagłówek właśnie powstał z poprawnymi klasami) |
| Zamknięcie okna tagów z zapisem | `afterTagsModalClose` 1569–1601 | `refreshList` (→ `renderAll`), potem drugi `renderAll` (1598) |
| PPM na niezaznaczonym wierszu | context-menu.js:291–299 | `renderAll` (cała lista, drzewo i lewy panel) przed pokazaniem menu |
| Marquee w liście (myszą) | 3070 / 3131 | `renderList` na mousedown (jeśli bez Ctrl), klasy w trakcie (dobrze), `renderList` na mouseup, potem **click** (zob. 1.4) |
| Escape / Ctrl+A | 3974 / 3934 | `renderList` |
| Mutacja (`afterMutation`) | 1234 | 1× `refreshList` → 1× `renderAll` **[OK]** |
| Start strony | page.js:105 i 124 | `renderAll` z `state.questions = ` **wszystkie pytania bazy** i bez `state.folders`, potem `refreshList` → `renderAll`. Pierwszy render jest zbędny (ukryty pod `data-skel-step`, base.css:279), ale buduje tabelę z całej bazy. **[NADMIAR]** |

### 1.4. Skutki przebudowy innerHTML (fokus, przewinięcie, zdarzenia)

- **[OK]** Pole wyszukiwania nie traci fokusu: szkielet paska powstaje raz (render.js:198), wartość pola nie jest nadpisywana przy aktywnym fokusie (334–340).
- **[OK]** `scrollTop` listy i drzewa zwykle przetrwa przebudowę, bo wysokość treści jest podobna.
- **[BŁĄD] Brak zerowania przewinięcia przy zmianie folderu.** Nic nie ustawia `elList.scrollTop` (grep: `scrollTop` występuje tylko w marquee). Przewijasz root do 80. wiersza i dwuklikasz folder: nowa lista otwiera się w tym samym miejscu (albo przyciętym do końca), nie od góry.
- **[BŁĄD] Podwójne stuknięcie na telefonie zawodzi przy przerwie 180–300 ms.** `addDoubleTap` (mobile.js:131–147) wymaga `lastTarget === target`. Pierwsze stuknięcie wywołuje click → `scheduleRenderList` (180 ms) → `renderList` podmienia wszystkie `<tr>` → drugie stuknięcie trafia w **nowy** element, więc warunek nie zachodzi i folder się nie otwiera. To samo w drzewie (`scheduleRenderTree` → `renderAll`). Wynik: otwieranie stuknięciem „działa czasem”. Na komputerze `dblclick` liczy przeglądarka, więc ten problem raczej nie występuje (**[RYZYKO]**, do potwierdzenia).
- **[BŁĄD] Zaznaczenie ramką (marquee) w liście znika po puszczeniu myszy.** Marquee startuje tylko z pustego tła, czyli `e.target === listEl` (3083–3089). Po mouseup przeglądarka wysyła `click` do wspólnego przodka elementów z mousedown i mouseup, a to jest `#list`. Handler kliknięcia (2807–2811) widzi `e.target === listEl`, więc woła `selectionClear` i `renderList`. Brak flagi typu `suppressNextTagsClick`, którą mają tylko tagi (3349). Zaznaczenie przetrwa tylko wtedy, gdy puścisz przycisk poza listą. Testu e2e na marquee nie ma (grep `tests/e2e`). **[RYZYKO wysokie, do potwierdzenia jednym testem]** Drzewo ma ten sam problem, gdy ramka zaczyna się w paddingu `#tree` poza `.treeList` (2507).
- **[BŁĄD / RYZYKO] Przebudowa DOM w `dragstart`.** `listEl dragstart` (2915–2930) przy niezaznaczonym wierszu woła `renderList`, czyli usuwa źródło przeciągania w trakcie `dragstart`. Drzewo (2651–2670) robi to samo przez `renderAll`. Chrome w takiej sytuacji potrafi od razu zakończyć przeciąganie (`dragend`). To prawdopodobne wyjaśnienie „zawieszonych” testów D&D (docs/plan-testy-i-poprawki.md, runda 10–11). Te testy przeciągały niezaznaczone wiersze.
- **[BŁĄD] Dymek zostaje po przebudowie.** Wspólny `tooltips.js` trzyma `active` (węzeł). Po `renderList` węzeł jest odłączony, a `pointerout` (tooltips.js:120–124) sprawdza `active.contains(event.target)`, co dla nowego DOM daje false, więc dymek nigdy się nie chowa. Scenariusz: najedź na kropkę tagu, kliknij (zaznaczenie wiersza → po 180 ms przebudowa), odjedź: dymek „#tag” wisi, dopóki nie przewiniesz, nie najedziesz na inny dymek albo nie wciśniesz Escape.
- **[BŁĄD] Zaznaczenie widać z opóźnieniem 180 ms**, a stan `disabled` paska dopiero wtedy się aktualizuje. Szybkie „klik w wiersz → klik w Usuń” w ciągu 180 ms trafia w wciąż wyszarzony przycisk.
- **[BŁĄD] Klik w wyszukiwarkę przy aktywnym filtrze po lewej** (1733–1752): `leftClear` i `restoreBrowseLocation`, a potem tylko `renderAll`, **bez `refreshList`**. Ścieżka i drzewo wracają do folderu, a lista dalej pokazuje wyniki filtra TAG/META (stare `state.folders/questions`) aż do kolejnego odświeżenia.

---

## 2. Tabela listy: kolumny i szerokości

### 2.1. Definicja dziś (rozproszona)

| Kolumna | th/td | JS: szerokość (render.js) | JS: min | CSS | Sortowalna |
|---|---|---|---|---|---|
| Nr | `.h-num` / `.col-num` | 44 px na stałe (861; też „44” w 849) | — | `text-align:left` (176) | nie |
| Nazwa | `.h-main` / `.col-main` | zapis z localStorage albo „wypełnij resztę” (`maxNameW`, 849–851) | 160 | `padding-right:24px` (965) | tak |
| Typ | `.h-type` / `.col-type` | 160 (`COL_DEFAULTS`, 658) | 80 | `font-size:12px` | tak |
| Data | `.h-date` / `.col-date` | 180 | 120 | 12px, tabular-nums | tak |
| Info | `.h-meta` / `.col-meta` | 120 | 80 | `text-align:right` (180, 1075) | nie |

Dodatkowo: `.list-table { min-width:480px }` (base-explorer.css:922), na ≤900 px `min-width:560px` (1711).

- **[OK]** Przejście z div-grid na `<table table-layout:fixed>` z `<colgroup>` (komentarz 885–889) sprawiło, że nagłówek i wiersze **zawsze się pokrywają**: ten sam colgroup i ten sam padding poziomy 14 px (th 937, td 1023). Wyrównanie Info do prawej jest spójne w th i td.
- **[NIESPÓJNOŚĆ] `min-width` w CSS jest martwe.** JS ustawia px dla każdej kolumny, a suma domyślnych minimów to 44+160+160+180+120 = **664 px**. Przy `table-layout:fixed` tabela rozszerza się do sumy kolumn, więc 480/560 z CSS nigdy nie decydują.
- **[NIESPÓJNOŚĆ] Telefon 390 px:** `containerW ≈ 374` → `maxNameW = max(160, 374−44−460−2) = 160`. Tabela ma 664 px, „Nazwa” dostaje 160 px (~18 znaków treści pytania), a „Data” 180 px. Treść pytania jest bardzo ucięta, datę i licznik trzeba przewinąć w bok. Nie ma osobnych szerokości dla telefonu, a zapisane w localStorage szerokości z komputera obowiązują też na telefonie. (Wygląd się podoba, więc tylko opisuję; decyzja należy do użytkownika.)
- **[BŁĄD] Szerokości liczone tylko w chwili renderu.** Brak `resize`/`ResizeObserver` (grep). Po obrocie telefonu albo zwężeniu okna tabela jest szersza niż kontener (poziomy suwak) aż do najbliższego kliknięcia. Po poszerzeniu okna nadmiar rozkłada się proporcjonalnie na **wszystkie** kolumny (Nr i Data też rosną), a nie tylko na „Nazwę”.
- **[BŁĄD/RYZYKO] Kolumna Nr ma 44 px przy paddingu 14+14**, czyli 16 px na treść. „100” przy ~13–14 px czcionki ma ~22 px, więc przy liście ≥100 elementów wyjdzie „1…” (td ma `text-overflow:ellipsis`, 1027). Nagłówek „NR” (12 px, uppercase, letter-spacing) też ledwo się mieści.
- **[NIESPÓJNOŚĆ] Kruchość resizera:** `COL_MINS[Object.keys(COL_MINS)[colIdx - 1]]` (render.js:697) zależy od kolejności kluczy obiektu. Indeksy th/col są wpisane na sztywno w trzech miejscach (686, 700, 701–706, 861–873).
- **[NADMIAR]** Szerokość „Nazwy” można zmieniać, choć z definicji wypełnia resztę. Dwuklik i tak przywraca wypełnienie (750–752).
- **[MARTWE] CSS z epoki div-grid:** `.list-head { padding; border-radius; backdrop-filter }` (158–170) nałożone na `<tr>`: padding i radius na tr nie działają. **Uwaga:** `background: rgba(0,0,0,.22)` na tr **działa** i sumuje się z tłem th (.22), więc nagłówek jest ciemniejszy. Usunięcie tej reguły zmieniłoby wygląd. Martwe są też `.list-head>div` (172), `#list .row:first-child{margin-top}` (196; margin na tr nie działa), `.row{padding;border-bottom}` (209–213) dla tr (granica td wygrywa w modelu collapse), `tr.row.is-drop-before/after` (1090–1108; lista nigdy nie ustawia before/after, tylko drzewo w 2712), atrybuty `data-sort-key`/`data-dir` w th (nikt ich nie czyta; CSS ich nie używa, handler patrzy na klasy).
- **[BŁĄD] Kropki nad przyklejonym nagłówkiem.** `.meta-dot,.tag-dot{position:relative; z-index:5}` (1111–1114, komentarz „z-index for tooltips”, pozostałość po `.dot-tooltip`) i `thead{position:sticky; z-index:3}` (926–930) leżą w tym samym kontekście nakładania (td/tr/.list nie tworzą własnego). Przy przewijaniu kropki wierszy chowających się pod nagłówkiem rysują się **nad** nim. `.row:has(.meta-dot[data-tip]:hover){z-index:10}` (1445–1448) nie działa (tr nie jest pozycjonowany). **[MARTWE]**
- **[NIESPÓJNOŚĆ] Pusta lista** (render.js:807–810) zastępuje całą tabelę napisem, więc znika nagłówek kolumn i sortowania. Ten sam tekst „Brak elementów.” pojawia się w pustym folderze i przy braku wyników wyszukiwania.

### 2.2. Sortowanie: wszystkie reguły

Stan: `state.sort = {key:"name", dir:"asc"}` (state.js:87). **Nie jest zapisywany** (po przeładowaniu wraca do nazwy), a szerokości kolumn są zapisywane, co jest **[NIESPÓJNOŚCIĄ]**.

Gdzie leżą reguły:
1. `toggleSort` (actions.js:1609–1624): dozwolone tylko `name|type|date` (`SORT_KEYS`, 1607). Ta sama kolumna przełącza kierunek, nowa zaczyna od **asc**.
2. Inicjalizacja (1659): klucz spoza `SORT_KEYS` (np. `ord`) zamienia na `name/asc`.
3. `renderList.cmp` (render.js:812–838):
   - **name:** `localeCompare("pl", sensitivity:"base") × mul`, przy remisie klucz typu × mul, przy remisie `(a.date − b.date) × mul`.
   - **type:** `getItemTypeSortKey` (96–104): folder ma `"0:<rank meta 000–002 albo 999>:folder"`, pytanie zawsze `"1:999:question"`. Przy remisie nazwa (też × mul).
   - **date:** `(a.date − b.date) × mul`, przy remisie nazwa × mul. Brak daty daje 0, więc w asc takie elementy są na początku.
   - **ord:** gałąź **[MARTWA]** (832–836), bo `SORT_KEYS` i inicjalizacja nigdy nie pozwolą na `ord`. Ręczna kolejność `ord` (przeciąganie w drzewie) **nigdy nie jest widoczna w liście**.
4. `dirFor` (854): nieaktywne kolumny dostają `data-dir="asc"`, a `updateSortHeaderUI` (1632–1647) zaraz nadpisuje je na `""`. Dwie sprzeczne reguły dla tego samego atrybutu, którego nikt nie czyta. **[NADMIAR/MARTWE]**

Uwagi:
- **[NIESPÓJNOŚĆ] Foldery przed pytaniami są tylko w sortowaniu „Typ” rosnąco.** W „Nazwa” i „Data” foldery mieszają się z pytaniami. W „Typ” malejąco pytania idą **przed** folderami (mnożnik odwraca też grupę).
- **[NIESPÓJNOŚĆ]** Ranking meta dotyczy tylko folderów. Pytania mają meta (`_viewQuestionMetaMap`), ale zawsze dostają `999`, więc sortowanie „Typ” w obrębie pytań jest tylko alfabetyczne.
- **[NIESPÓJNOŚĆ]** Przy remisie mnożnik `mul` odwraca też porządek drugorzędny (nazwę), więc kolejność remisów nie jest stała między kierunkami. Nie ma ostatecznego rozstrzygnięcia po `id`, a przy identycznych nazwach i datach kolejność zależy od kolejności z bazy.
- **[NIESPÓJNOŚĆ]** „Data” to `updated_at ?? created_at` (`pickDate`, 64–76). Z pięciu pozostałych kluczy (`modified_at`, `changed_at`, `inserted_at`, `created`, `updated`) żaden nie przychodzi z repo.js (64, 96, 118), więc są **[MARTWE]**. Nagłówek „Data” nie mówi, że to data zmiany. Domyślny kierunek asc pokazuje najstarsze na górze, odwrotnie niż w Eksploratorze/Finderze.
- Przy pustej treści pytania sortowanie bierze etykietę zastępczą „Pytanie” (render.js:796).
- **[OK]** Sortowanie polskim collatorem, stabilne `Array.sort`, karetka ikoną.

### 2.3. Liczniki i kropki

- „N elem.” (folder) to bezpośrednie podfoldery i pytania, **niezależnie od filtra/wyszukiwania** (`_directChildrenCount`, render.js:892–895). Brak mapy daje „—”. „N odp.” to `payload.answers.length` (914). EN „{count} items” daje „1 items” (brak liczby pojedynczej, en.js:4467).
- Kropki tagów (`tagDotsHtml`, 106–139): maks. 3 i „+N”. **[NIESPÓJNOŚĆ]** Kolejność kropek tagów to kolejność wstawiania do Set (kolejność linków z bazy), a nie `tag.ord`. Ten sam zestaw tagów w dwóch wierszach może mieć kropki w innej kolejności. Meta są sortowane według `META_ORDER` (167). „+N” nie ma dymka z resztą. **[NADMIAR]** `new Map(tags…)` budowane od nowa dla każdego wiersza (110).
- Kropki meta (`metaDotsHtml`, 141–177) mają obwódkę (`--c`), kropki tagów wypełnienie. Obie mają `data-tip` i używają wspólnego wrappera `.tag-dots`.
- Wiersz folderu: tagi w kolumnie Nazwa, meta w kolumnie Typ. W drzewie oba zestawy stoją obok siebie w tytule (487–488). **[OK]**, spójne z ideą.
- **[MARTWE]** `metaRows || tags.empty` (render.js:582): `META_ORDER` jest stałe, więc pusty stan nie wystąpi, a do tego pokazywałby „Brak tagów.” w sekcji kategorii.
- Nagłówek sekcji meta to nadal `"Pasujące kategorie"` (pl.js:4252, en.js:4352, uk.js:4349). **Decyzja z 2026-10-20 („Proponowane kategorie”) nie jest jeszcze wdrożona.**

### 2.4. Drzewo i ścieżka

- **[BŁĄD] Wskaźnik „przed/za” przy przeciąganiu w drzewie** (`.is-drop-before::before/.is-drop-after::after`, css 407–422, `position:absolute`) jest pozycjonowany względem `#tree`, bo `.tree-row` nie ma `position:relative`. Linia rysuje się na górze/dole panelu drzewa, a nie przy wierszu docelowym.
- **[BŁĄD/RYZYKO]** `maxDepth = 8` (render.js:445): foldery na głębokości ≥8 nie są rysowane w drzewie, a baza nie ma limitu głębokości (grep w migracjach). Strażniki głębokości są niespójne: 8 (drzewo), 20 (`renderBreadcrumbs` 636, `refreshList` 488), 50 (`hasFullAncestor`, `isInsideTopFolder`), 80 (`isFolderDescendant`).
- **[BŁĄD] Ścieżka w widoku META** nie jest ukryta (ukrywane są tylko SEARCH/TAG, 615) i pokazuje sam korzeń. Klik w korzeń (2423–2429) ustawia `setViewAll`, ale **nie czyści `metaSelection`**. Lista przechodzi do korzenia, meta po lewej dalej jest podświetlone, a drzewo zostaje zablokowane (`isTreeLocked` → `hasLeftSelection`).
- **[NADMIAR]** Podwójne `if (!elBreadcrumbs) return;` (613, 622).
- Style inline w wierszach drzewa, przełączniku, meta i tagach (468–473, 482–483, 541–544, 565, 595, 648–651) dublują CSS (`#tree .tree-toggle`, 287–296). Nadpisanie przez inline: `#btnAddTag{margin-top:12px}` (css 1532) przegrywa z inline `margin-top:10px` (render.js:574). **[MARTWE]** w części CSS.
- Wiersze drzewa i lewego panelu dziedziczą globalne `.row{margin:10px 0; flex-wrap:wrap; gap:10px}` (shared/css/base.css:715–725). Odstępy między wierszami wynikają więc z ogólnej klasy, nie z CSS menedżera. To ukryta zależność, nie błąd, bo wygląd się podoba.
- Meta mają inline `opacity:.85`, tagi nie. Drobna różnica wyglądu dwóch podobnych list. **[NIESPÓJNOŚĆ]**, celowość do potwierdzenia.

---

## 3. Dymki

- **[OK]** Osobny `.dot-tooltip` menedżera **już nie istnieje** (grep `web/`: brak; zostały tylko wzmianki w docs). Wszystkie dymki idą przez `shared/js/core/tooltips.js`: portal `#appTooltip` (`position:fixed`), czyta `data-tooltip` / `data-tip` / `title`, a `title` zamienia na `data-tooltip` przez MutationObserver.
- Źródła dymków w menedżerze: kropki (`data-tip`), przyciski paska (`data-tip`, `setToolbarTip` usuwa `title`, render.js:53–62), chipsy (`title`), przycisk lupy (`title`, zmieniany przy każdym renderze i obsługiwany przez obserwator atrybutów), resizer kolumny (`title`).
- **[BŁĄD]** Dymek wisi po przebudowie DOM (opis w 1.4).
- **[MARTWE]** Pozostałości CSS po starym dymku: `z-index:5` kropek i `.row:has(...:hover){z-index:10}`. Pierwsza reguła daje błąd z kropkami nad nagłówkiem (2.1).
- Telefon: `pointerover` z `pointerType === "touch"` jest ignorowany (tooltips.js:105), a `pointerdown` dotykiem chowa dymek. Na telefonie **nie ma żadnych dymków**: ani nazw tagów pod kropkami, ani opisów ikon paska. To spójne i bezpieczne (koniec „przyklejonych” dymków z rundy 17), ale informacja z kropek jest na telefonie niedostępna.
- **[BŁĄD a11y]** `setToolbarTip` usuwa `title`, a ikony mają `aria-hidden="true"` (icons.js:164). Przyciski `.tbBtn` **nie mają nazwy dostępnej** (brak `aria-label`). Hamburger ma na sztywno `aria-label="Otwórz panel"` (bez tłumaczenia i bez zmiany po otwarciu).
- **[BŁĄD] Dymki skrótów kłamią:**
  - Ctrl+N, Ctrl+Shift+N i Ctrl+T są zarezerwowane przez Chrome (nowe okno, okno incognito, karta) i `preventDefault` ich nie przechwyci. Dymki i menu (render.js:277–280, context-menu.js:314, 324, 388) obiecują skróty, które w Chrome nie działają.
  - ⌘⌥R na macOS: `e.key` przy Option to „®”, więc `letter + ":alt"` nie trafi w `"r:alt"` (actions.js:3948, 3965–3966). Skróty powinny używać `e.code`.
- **[BŁĄD] Zmiana języka:** szkielet paska powstaje raz, więc `placeholder` pola wyszukiwania i `aria-label` grup (render.js:203, 215…) zostają w starym języku. Dymki przycisków się odświeżają (setToolbarTip przy każdym renderze).

---

## 4. Pasek narzędzi

### 4.1. Reguły `disabled` (render.js:351–426) a inne miejsca

| Akcja | Pasek: disabled (render) | Pasek: obsługa kliknięcia (actions.js:2133–2208) | Menu kontekstowe | Skrót klawiszowy |
|---|---|---|---|---|
| newFolder/newQuestion | `!canMutate` (editor i nie SEARCH/TAG/META) | `canMutateHere` | `!editor || readOnlyView` | `canMutateHere` |
| editQuestion | 1 zazn., pytanie, editor | `canWrite` i `oneIsQuestion` | editor, 1 zazn., cel=q | przez przycisk paska |
| editTags | zazn. i editor | `canWrite` i zazn. | `!editor` | Ctrl+T: tylko `canWrite` (**bez sprawdzenia zaznaczenia**) |
| rename | 1 zazn. i canMutate | `canMutateHere` i 1 | editor, !readOnly, 1 | F2: `canMutateHere` |
| delete | zazn. i editor i !META | `canDeleteHere`, potem **`deleteSelected` także w TAG** | TAG: „Usuń tagi” (untag) **bez sprawdzenia roli** | Delete: TAG → untag |
| copy | zazn. i editor | `canWrite` | `!editor` | `canWrite` |
| cut | zazn. i editor i !SEARCH/TAG/META | `canCutHere` (= canDeleteHere, **dopuszcza SEARCH/TAG**) | `!readOnlyView` | Ctrl+X: tylko `canWrite` (**działa w SEARCH/TAG/META**) |
| paste | `canMutate` i schowek | `canPasteHere` | `pasteDisabled || !editor` | `onPasteKey` |
| duplicate | zazn. i canMutate | `canMutateHere` | editor, !readOnly | przez przycisk |
| createGame | zazn. (**bez roli i widoku**) | `canWrite`, potem `openExportModal()` **bez `preselectIds`** | editor, !readOnly, `preselectIds` | przez przycisk |

Najważniejsze:
- **[BŁĄD] „Usuń” na pasku w widoku TAG usuwa elementy** (do kosza, z potwierdzeniem „Usunąć?”). Klawisz Delete (3913–3916) i menu (504–505) w tym widoku **tylko zdejmują tag**. Ten sam przycisk ze śmietnikiem robi dwie różne rzeczy w zależności od drogi.
- **[BŁĄD] Przechwycone `t`:** w handlerze kliknięcia paska `const t = e.target;` (2052) zasłania funkcję tłumaczeń. Oba `catch` (2213, 2219) wołają `t("baseExplorer.errors.actionFailed")`, czyli element DOM jako funkcję → TypeError. Przy każdym wyjątku akcji z paska (np. błąd sieci w `refreshList`) użytkownik **nie dostaje komunikatu**, a w konsoli ląduje nieobsłużone odrzucenie.
- **[NIESPÓJNOŚĆ]** „Utwórz grę” na pasku jest aktywna dla czytelnika (viewer) i w SEARCH/TAG, a kliknięcie dla viewer nic nie robi (cicho). W menu ta sama akcja jest wyszarzona.
- **[NADMIAR]** `canMutate` i `canCut` to identyczne wyrażenia (render.js:369, 371), `canRename = canMutate`, `canCopy = canEditTags = editor`. Warunek `!(hasQuestionInSel || hasFolderInSel)` przy `oneSel/manySel` jest zawsze false (407, 418). W menu `(!editor && mode==="cut")` jest zbędne obok `|| !editor` (context-menu.js:336, 359). Pasek filtruje klucze przez `startsWith("c:"/"q:")`, a obsługa przez `k !== "root"` (2125). Dwie definicje „prawdziwego zaznaczenia”.
- `IS_MAC` / `isMac` liczone w 5 miejscach przez przestarzałe `navigator.platform` (render.js:47, context-menu.js:24, actions.js:1939, 1945, 3961).

### 4.2. Wygląd paska na telefonie i hamburger

- ≤900 px: `.toolbar{flex-wrap:wrap}`. Wiersz 1 to wyszukiwarka na całą szerokość, wiersz 2 to `.toolbar-btns-row` z przewijaniem w poziomie i **ukrytym suwakiem** (css 1686–1695). Hamburger, 11 przycisków po 38 px, 6 separatorów i odstępy dają ~560–600 px przy ~370 px dostępnych. „Utwórz grę” i „Odśwież” są poza ekranem i nic nie sygnalizuje, że da się przewinąć. **[NIESPÓJNOŚĆ UX]** Bez zmiany wyglądu, do decyzji (np. rejestr akcji z „widoczne w tym widoku”, docs/menedzer-bazy-plan.md).
- Na komputerze `.toolbar-btns-row{display:contents}` (1122): przezroczysty wrapper. **[OK]**
- Drawer (mobile.js:10–51): `open()` dodaje `body.explorer-drawer-open` i `body.style.overflow="hidden"`. Na tej stronie `body,html{overflow:hidden; height:100dvh}` jest już ustawione (css 36–39), więc inline `overflow` jest **[NADMIAREM]**.
- **[BŁĄD] (potwierdzony w docs)** `html:has(body.topbar-mobile-lock, body.explorer-drawer-open){scrollbar-gutter:stable}` (shared/css/base.css:2079). `scrollbar-gutter:stable` rezerwuje miejsce na pasek **także przy `overflow:hidden`**. W wąskim oknie komputera z klasycznymi paskami (Windows, ≤900 px) otwarcie drawera zwęża stronę o ~12 px (800 → 788) i cały układ, łącznie z paskiem, „przeskakuje”. Na tej stronie html nigdy się nie przewija, więc reguła niczego nie chroni. Wystarczy ją ograniczyć do stron z przewijanym html albo wyłączyć dla `explorer-page`.
- **[BŁĄD drobny]** Drawer nie zamyka się przy powrocie do >900 px (obrót, zmiana okna): zostaje `explorer-drawer-open` (z tym przesunięciem gutter) i `body.style.overflow`. `--be-toolbar-h` jest mierzone tylko przy otwarciu. Gdy pasek urośnie przy otwartym drawerze (np. dojdą chipsy), drawer zachodzi na pasek.

---

## 5. Menu kontekstowe (context-menu.js, css 424–460, 1464–1484, 1715–1734)

- Pozycjonowanie (`positionMenu`, 107–123): pomiar poza ekranem, potem `clamp` do `[8, vw−w−8]` × `[8, vh−h−8]`. **[OK]** Mieści się w 390 px: `min-width:220px`, na ≤900 px `max-width:calc(100vw−16px)`, `max-height:60vh` z przewijaniem, skróty (`.cm-kbd`) ukryte, pozycje 14 px paddingu i 15 px czcionki.
- Na telefonie menu folderu ma ~12 pozycji i 6 separatorów, czyli ~640 px. Przy 844 px wysokości (60vh = 506) **przewija się wewnątrz**, a w poziomie (390 px wysokości, 60vh = 234 px) widać 4–5 pozycji. Akcje destrukcyjne („Usuń”) są na dole, często poza widokiem bez sygnału przewijania.
- **[RYZYKO]** Na komputerze (>900 px) nie ma `max-height`. W oknie o wysokości <~560 px menu folderu jest wyższe niż ekran: `clamp` daje top=8 i dół jest ucięty bez przewijania.
- **[BŁĄD]** Menu nie zamyka się na Escape (Escape w 3974 tylko czyści zaznaczenie i rysuje listę, więc pozycje menu operują na już pustym zaznaczeniu), na przewijanie listy dotykiem (zamyka tylko `mousedown` poza menu, 3874–3880) ani na resize/obrót.
- **[NIESPÓJNOŚĆ]** „Otwórz folder” z menu w SEARCH/TAG (406–411) robi tylko `setViewFolder`, bez czyszczenia wyszukiwania i lewej selekcji. Dwuklik (2858–2876) czyści oba. Skrót „Enter” w menu jest pokazany, ale obsługa Entera (3993) jest w innym miejscu i do sprawdzenia, czy otwiera folder.
- **[NADMIAR]** PPM na niezaznaczonym wierszu daje `renderAll` (całe drzewo, panel i lista), choć wystarczyłoby przełączyć klasy dwóch wierszy.
- Brak obsługi klawiatury w menu (strzałki, fokus na pierwszej pozycji).

---

## 6. Co działa dobrze (zachować)

1. Tabela z `colgroup` i `table-layout:fixed`: nagłówek zawsze nad kolumnami, przyklejony `thead`, stała wysokość wiersza (40 px, na telefonie 48 px).
2. Szkielet paska budowany raz: pole wyszukiwania nie traci fokusu ani kursora.
3. Marquee aktualizuje tylko klasy w trakcie przeciągania, bez przebudowy (3046–3053, 3204–3210).
4. Klampowanie menu do ekranu i osobne reguły dotykowe (większe pozycje, bez skrótów).
5. Jeden mechanizm dymków (decyzja wykonana: `.dot-tooltip` usunięty). Dymki chowają się przy przewijaniu i na dotyk.
6. `afterMutation` to jedno miejsce unieważnienia i jeden render po zapisie.
7. Strażnik `_refreshSeq` (trzeba go tylko przenieść przed zapis do stanu).
8. Polskie porównywanie nazw, kropki tag/meta z kolorami, licznik „+N”, zapamiętane rozwinięcia drzewa per baza (`explorer:tree:<id>`).

---

## 7. Propozycja: „stan → model widoku → render”

### 7.1. Zasady
1. **Jeden zapis danych na wywołanie i dopiero po sprawdzeniu świeżości.** `loadView(state)` nie dotyka `state`. Zwraca obiekt `snapshot = { seq, folders, questions, counts, maps }`, a do stanu trafia jednym `commit(snapshot)` tylko gdy `seq` jest aktualne. To usuwa wyścigi z 1.2.
2. **Pamięć podręczna jako jeden obiekt z wersją**: `state.cache = { version, allQuestions, qTags, qMeta, folderDesc, folderTags, folderMeta, childCount }`. `invalidate()` podbija `version` i czyści całość. Mapy pochodne są liczone **raz na wersję** (memo po `version`), a nie 4× na odświeżenie. `_viewQuestionTagMap` znika (wystarcza `qTags` dla całej bazy), znika też `_qIndex` (liczniki z `allQuestions`). Liczniki są liczone dla każdego widoku, także TAG/META.
3. **Czyste funkcje modelu** (bez DOM, testowalne w `tests/unit`):
   - `buildListModel(state, cache, columns)` → `{ columns, sort, rows:[{key, kind, id, num, icon, name, tagDots:[{color,label}], metaDots:[…], typeLabel, dateText, infoText, selected, draggable}], empty:{textKey} }`
   - `buildTreeModel(…)`, `buildLeftModel(…)`, `buildToolbarModel(state, ACTIONS)` → `{ [act]: {visible, enabled, label, tip} }`, `buildCrumbsModel(…)`.
4. **Render tylko z modelu, w częściach i w jednej klatce.**
   ```js
   const dirty = new Set();
   function invalidate(...parts) {           // "list" | "tree" | "left" | "toolbar" | "crumbs" | "selection"
     parts.forEach((p) => dirty.add(p));
     if (!raf) raf = requestAnimationFrame(flush);
   }
   function flush() { raf = 0; /* buduje modele dla brudnych części i rysuje */ dirty.clear(); }
   ```
   - Zmiana **samego zaznaczenia** (`"selection"`) nie przebudowuje DOM: `syncSelection(keys)` przełącza `is-selected` w liście i drzewie i aktualizuje `disabled` paska. Klik w wiersz pokazuje zaznaczenie od razu, bez czekania 180 ms. Znikają przy tym błędy podwójnego stuknięcia, dymku-sieroty i przebudowy w `dragstart`. Timer 180 ms przestaje być potrzebny, bo dwuklik i tak nie zależy od przebudowy.
   - Pełny `renderList` tylko gdy zmieniły się dane, sortowanie albo kolumny. Po zmianie folderu `elList.scrollTop = 0`.
   - Wyszukiwanie: `input` z debounce ~150 ms, potem `loadView`.
5. **Jeden rejestr akcji** `ACTIONS = [{ id, icon, labelKey, shortcut:{code:"KeyN", mod:true, shift:true}, visible(ctx), enabled(ctx), run(ctx) }]`. Z niego biorą pasek, menu, skróty (`e.code`, skróty zarezerwowane przez przeglądarkę oznaczone jako „tylko menu” albo zastąpione) i dymki (`aria-label` = `title`). Usuwa to całą tabelę 4.1, łącznie z „Usuń” w TAG. To ten sam kierunek co w docs/menedzer-bazy-plan.md.

### 7.2. Jedna definicja kolumn
```js
// web/bases/explorer/js/list-columns.js
const coll = new Intl.Collator("pl", { sensitivity: "base", numeric: true });
export const LIST_COLUMNS = [
  { key: "num",  labelKey: "baseExplorer.list.colNumber", width: 56,  min: 56,  sortable: false, align: "right" },
  { key: "name", labelKey: "baseExplorer.list.colName",   width: null, min: 160, sortable: true,  defaultDir: "asc",
    compare: (a, b) => coll.compare(a.name, b.name) },
  { key: "type", labelKey: "baseExplorer.list.colType",   width: 160, min: 80,  sortable: true,  defaultDir: "asc",
    compare: (a, b) => a.typeRank - b.typeRank },          // ranking meta dla folderów I pytań
  { key: "date", labelKey: "baseExplorer.list.colDate",   width: 150, min: 120, sortable: true,  defaultDir: "desc",
    compare: (a, b) => a.time - b.time },
  { key: "info", labelKey: "baseExplorer.list.colInfo",   width: 110, min: 80,  sortable: true,  defaultDir: "desc", align: "right",
    compare: (a, b) => a.count - b.count },
];

export function sortRows(rows, { key, dir }) {
  const col = LIST_COLUMNS.find((c) => c.key === key && c.sortable) || LIST_COLUMNS[1];
  const m = dir === "desc" ? -1 : 1;
  return rows.slice().sort((a, b) =>
    (a.kind === b.kind ? 0 : a.kind === "cat" ? -1 : 1)     // foldery zawsze pierwsze (do decyzji użytkownika)
    || col.compare(a, b) * m
    || coll.compare(a.name, b.name)                          // remis: nazwa zawsze rosnąco
    || (a.ord - b.ord) || String(a.id).localeCompare(String(b.id)));
}
```
- **Szerokość:** `colgroup` generowany z tej tablicy. Kolumna `name` **bez szerokości**: przy `table-layout:fixed; width:100%` sama bierze resztę, więc nie trzeba mierzyć `getBoundingClientRect` ani reagować na resize i znika błąd z obrotem ekranu. `min-width` tabeli liczony z sumy `min` i ustawiany jako zmienna CSS (`--list-min`). Zapis w localStorage tylko dla kolumn ze stałą szerokością. Nr = 56 px usuwa „1…”.
- **Sortowanie:** jeden `state.sort`, zapisywany obok szerokości (np. `base-explorer:view:v1 = {sort, cols}`). Nowa kolumna dostaje swój `defaultDir`, ta sama kolumna przełącza kierunek. Nagłówek z `aria-sort`. Brak `updateSortHeaderUI`, `data-dir` i gałęzi `ord`.
- **Telefon (do decyzji, bez zmiany wyglądu na komputerze):** pole `hideBelow: 600` w definicji (np. Info/Data) albo mniejsze `width` dla telefonu. Wszystko w jednym miejscu.

### 7.3. Kolejność wdrożenia (od najtańszych i najpewniejszych)
1. Szybkie naprawy bez przebudowy: `t` w handlerze paska; „Usuń” w TAG; liczniki w TAG/META; przypisanie stanu po `isStale`; flaga „po marquee nie czyść” w kliknięciu listy; `scrollTop=0` po zmianie folderu; `position:relative` dla `.tree-row`; zdjęcie `z-index:5` z kropek; reguła `scrollbar-gutter` poza explorerem; `aria-label` przycisków; `e.code` w skrótach; brakujące `refreshList` po kliknięciu w wyszukiwarkę przy filtrze; Escape zamyka menu.
2. `syncSelection` w miejsce `scheduleRenderList`/`scheduleRenderTree` dla zmian samego zaznaczenia.
3. `list-columns.js` i `sortRows` z testami jednostkowymi.
4. `cache` z wersją i `loadView/commit`, potem `invalidate()` w klatce.
5. Rejestr akcji (pasek, menu i skróty z jednego źródła).

Testy punktowe do dopisania: marquee zostawia zaznaczenie; podwójne stuknięcie z przerwą 250 ms otwiera folder; przeciągnięcie niezaznaczonego wiersza; „Usuń” na pasku w TAG; liczniki w TAG po zmianie tagu; kolejność sortowania (foldery pierwsze, Data malejąco).
