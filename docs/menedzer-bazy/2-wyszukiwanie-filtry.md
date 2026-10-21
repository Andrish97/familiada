# Analiza 2 — Menedżer bazy pytań: wyszukiwanie, filtry, widoki, pamięci podręczne, blokady

Zakres: `web/bases/explorer/js/{state,actions,render,context-menu,repo,page}.js`,
porównanie z `web/shared/js/core/game-rules.js`. Tylko odczyt kodu, nic nie zmieniano.
Numery linii wg stanu repo na 2026-10-20.

---

## 1. Model widoków (state.js)

`VIEW = { ALL, FOLDER, TAG, SEARCH, META }` (state.js:4-10).

Stan powiązany z widokiem (createState, state.js:56-117):

| pole | znaczenie | kto ustawia |
|---|---|---|
| `view` | aktualny widok | setViewAll/setViewFolder/restoreBrowseLocation + **ręczne `state.view = …` w 7 miejscach** (actions.js:1922, 1932, 2034, 2043, 2306, 2310, 3583; context-menu.js:186) |
| `folderId` | dla FOLDER | setViewFolder, restoreBrowseLocation |
| `tagIds` | tagi filtra dla TAG/META | applyLeftFiltersView, input/keydown wyszukiwarki, openTagView, deleteTags, menu „Pokaż” meta |
| `searchQuery` | „klasyczny” tekst dla browse | **nigdy nie ustawiany na niepusty** — martwe pole (tylko zerowane: 2101, 2348, 2500, 2570, 2867, 2903) |
| `searchTokens {text, tagIds}` | tekst + chipsy #tagów | input/keydown/klik chipu/X, czyszczenia przy wyjściu |
| `tagSelection {ids, anchorId}` | zaznaczenie tagów w lewym panelu | lewy panel, marquee, PPM, **oraz synchronizacja z chipsów** (actions.js:2261-2263) |
| `metaSelection {ids, anchorId}` | zaznaczenie „kategorii” (typów gry) | lewy panel, marquee, PPM |
| `_browse` | zapamiętane miejsce (ALL/FOLDER) | rememberBrowseLocation |

Czyli **ten sam filtr tagów żyje w trzech miejscach**: `tagSelection.ids` (lewy panel), `state.tagIds` (to, czego używa refreshList w TAG/META) i `searchTokens.tagIds` (chipsy, używane w SEARCH). Ich synchronizacja jest ręczna i niepełna — źródło większości błędów poniżej.

### 1.1 Wejście / wyjście

- `setViewAll` / `setViewFolder` (state.js:125-137): ustawiają widok, zerują `tagIds`, synchronizują `?folder=` (`history.replaceState`, state.js:139-147; tylko gdy `state._syncFolderUrl` — ustawiane w page.js:113 po `wireActions`).
- `rememberBrowseLocation` (state.js:149-154): zapisuje `{view, folderId}` **tylko gdy bieżący widok to ALL/FOLDER**. Przejście SEARCH→TAG→META nie nadpisuje — wraca się zawsze do ostatniego „prawdziwego” miejsca. To dobre.
- `restoreBrowseLocation` (state.js:156-172): zeruje `tagIds`, **nie rusza `searchTokens`, `tagSelection`, `metaSelection`** (komentarz 159), przywraca FOLDER albo ALL, synchronizuje URL. **Nie sprawdza, czy folder nadal istnieje.**
- `?folder=` przy starcie (page.js:97-101): przyjmowany tylko, gdy folder istnieje; niepoprawny id zostaje w pasku adresu aż do pierwszej zmiany widoku. Widoki wirtualne nie trafiają do adresu (świadomie — tylko folder).

Miejsca wejścia do widoków wirtualnych:

| skąd | widok | rememberBrowse? | czyści co? |
|---|---|---|---|
| input w polu, tekst niepusty (2032-2038) | SEARCH | tak, jeśli nie był SEARCH | — |
| input, pusty tekst + chipsy (2041-2047) | TAG (`tagIds = searchTokens.tagIds`) | tak | — |
| keydown spacja/przecinek/Enter z #tagiem (2294-2316) | TAG lub SEARCH | tak | — (ale **ustawia `tagSelection` = chipsy**) |
| klik/Shift/Ctrl/marquee w lewym panelu → `applyLeftFiltersView` (1904-1936) | META gdy jest jakakolwiek meta, inaczej TAG | tak, jeśli zmiana widoku | — (tekst w polu zostaje!) |
| PPM tag → „Pokaż” → `openTagView` (3577-3587) | TAG | **zawsze** (nawet z TAG/META — wtedy nic nie zapisze, bo warunek w state.js) | — |
| PPM meta → „Pokaż” (context-menu.js:182-192) | META | tak | — |

Miejsca wyjścia:

| skąd | co robi |
|---|---|
| input → pusto (2024-2029) | restore tylko jeśli SEARCH/TAG (nie META) |
| klik w chip (2058-2083) | restore **tylko jeśli SEARCH** |
| Backspace na pustym polu (2273-2290) | restore **tylko jeśli SEARCH i brak chipsów** |
| przycisk X (2087-2107) | czyści tekst+chipsy, restore jeśli SEARCH/TAG; **nie czyści `tagSelection`** |
| tło lewego panelu (2364-2372) | leftClear + restore jeśli TAG/META |
| refreshList w TAG bez tagów i meta / w META bez meta (707-714, 736-741) | restore + rekurencyjny refreshList |
| mousedown w polu/ramce wyszukiwania przy zaznaczeniu z lewej (1733-1750) | leftClear + restore + **tylko `renderAll` (bez refreshList)** |
| klik/dblclick w drzewie przy blokadzie (2496-2504, 2566-2574) | czyści wszystko, restore, refreshList, potem wykonuje klik |
| dblclick/dwutap na folderze w liście w widoku wirtualnym (2856-2879, 2896-2909) | czyści wszystko, restore, setViewFolder |
| Enter na zaznaczonym folderze (3993-3999), PPM „Otwórz folder” (context-menu.js:406-410), dblclick folderu w drzewie bez blokady | **tylko setViewFolder** — tekst, chipsy i zaznaczenie z lewej zostają |

---

## 2. Wyszukiwarka (#searchText)

### 2.1 Reguły tekstu
- Dopasowanie: `includes` po `toLowerCase()` (actions.js:94-99, 105-109). **Bez normalizacji polskich znaków** („zolw” ≠ „żółw”), cała fraza jako jeden ciąg („kot pies” wymaga dokładnie tego ciągu), bez słów w dowolnej kolejności.
- Przeszukiwane: `payload.text` pytań i `name` folderów. **Nie** odpowiedzi, **nie** nazwy tagów.
- Wyszukiwanie zawsze w **całej bazie** (`_allQuestions`), niezależnie od folderu, w którym się było — brak „szukaj w tym folderze”.
- Na każdy znak pełny `refreshList` — **bez debounce**, a każdy refreshList w SEARCH robi zapytanie sieciowe `listQuestionTags(ids pokazanych)` (ensureTagMapsForUI, 457-468).
- Placeholder „Szukaj...” — nic nie mówi o składni `#tag`.

### 2.2 Chipsy #tagów — `tryConsumeHashTagTokenFromInput` (2223-2266)
- Wywoływane **tylko** w `keydown` dla `" "`, `","`, `"Enter"` (2294). Na Androidzie klawiatura ekranowa daje `key = "Unidentified"` → **nigdy nie działa** (potwierdzone w docs/menedzer-bazy-plan.md:55-62).
- Regex `(^|[\s,])#([^\s,#]+)$` — **tag z odstępem w nazwie nie da się wpisać** jako chip.
- Wymaga pełnej, dokładnej nazwy (case-insensitive); przy dwóch tagach różniących się wielkością liter wygrywa ostatni w mapie. Brak podpowiedzi.
- Zanim spacja zamieni token, zdarzenia `input` już przełączyły widok na SEARCH z tekstem `"#po"`, `"#pop"` → lista szuka dosłownie `#pop` w treści → przez cały czas pisania pokazuje „Brak elementów.”.
- Po spacji: token usuwany, ale domyślna akcja spacji nie jest blokowana → spacja ląduje w polu (wiodąca spacja, kolejne `input` z tekstem `" "`).
- **Mutuje tablicę w miejscu** (`prev.push`, 2244) — `searchTokens.tagIds` i `state.tagIds` stają się tą samą referencją (2307), a późniejsze `filter`/`slice` tworzą nowe tablice tylko w jednym miejscu → rozjazd.
- **Synchronizuje `tagSelection` z chipsami** (2261-2263) → lewy panel podświetla tag, `hasLeftSelection()` = true → drzewo zablokowane i… pole wyszukiwania samo się „blokuje” (patrz błąd B3).

### 2.3 Usuwanie chipsów
- Klik w chip (2058-2083): nowa tablica w `searchTokens`, **`state.tagIds` i `tagSelection` bez zmian**; restore tylko w SEARCH.
- Backspace na pustym polu (2273-2290): usuwa ostatni chip; to samo — `state.tagIds` i `tagSelection` bez zmian; restore tylko w SEARCH.
- X (2087-2107): zeruje tekst i chipsy, **nie** `tagSelection`.

### 2.4 Render (render.js:290-349)
- Szkielet paska rysowany raz (żeby nie gubić fokusu). Wartość pola nadpisywana `tokens.text` tylko, gdy pole nie ma fokusu (337).
- Chipsy z `searchTokens.tagIds` filtrowane przez istniejące tagi (`filter(Boolean)`, 312) — **chip usuniętego tagu znika z widoku, ale dalej filtruje** (i przycisk pokazuje X).
- Przycisk lupa/X: `hasSearch` = tekst lub chipsy.

---

## 3. Lewy panel: tagi i „kategorie” (meta)

### 3.1 Zaznaczanie
- Jedna lista kluczy `m:<id>` (META_ORDER) + `t:<id>` (tagi wg `ord`) (1807-1820). Klik = single, Ctrl = toggle, Shift = zakres **przez obie sekcje**, marquee myszą/dwoma palcami.
- Klik w już zaznaczony tag nie odznacza (leftSelectSingle). Wyjście: klik w tło panelu (mało odkrywalne, zwłaszcza w szufladzie na telefonie).
- PPM/przytrzymanie na niezaznaczonym → single-select bez zmiany widoku (2398-2406, 3863-3866, context-menu.js:144-171) — zaznaczenie z lewej istnieje, a widok go nie stosuje, dopóki nie wybierze się „Pokaż”. W tym stanie `hasLeftSelection()` = true → drzewo zablokowane, chociaż żaden filtr nie działa.

### 3.2 `applyLeftFiltersView` (1904-1936)
- jest meta → **META** z `tagIds` = zaznaczone tagi; same tagi → **TAG**; nic → restore.
- Linia 1906: `Array.isArray(cond ? Array.from(...) : []) ? Array.from(...) : []` — warunek zawsze prawdziwy, martwy ternary.

### 3.3 Reguły filtra (refreshList → buildVirtualViewResults, 593-677)
- **Tagi: AND** (`questionPassesTags_AND`, 565-571) — pytanie musi mieć wszystkie zaznaczone tagi. Shift-zakres po kilku tagach daje zwykle pusty wynik.
- **Meta: AND** (`questionPassesMeta_AND`, 573-587). Komentarze mówią coś innego: 515 „META: OR”, 731 „metaSelection (OR)”, 1536 „tagi aktywnego widoku TAG (OR)”.
- **Tekst: AND** po filtrze tag/meta (611).
- SEARCH: tekst + chipsy; **ignoruje meta i tagi z lewego panelu** (683).
- META: meta + `state.tagIds`, **bez tekstu** (717).
- TAG: `state.tagIds` + meta, **bez tekstu** (743). (TAG z meta zdarza się tylko przez `openTagView` przy zaznaczonej meta.)
- META i TAG robią więc dokładnie to samo (tagi AND + meta AND); różnią się tylko okruszkami, Delete i komunikatami — **dwa widoki na jeden filtr**.

### 3.4 Meta = „proponowane kategorie” vs game-rules.js
`metaForQuestionPayload` (224-233) woła `evaluateReadiness(type, [q])` i ignoruje `minQuestions`:
- `poll_text` — w evaluateReadiness nie ma żadnych warunków na pytanie poza liczbą pytań → **każde pytanie jest „typowe”** (także bez odpowiedzi).
- `poll_points` — 3–6 odpowiedzi.
- `prepared` — 3–6 odpowiedzi, każda 4–100 pkt, suma ≤ 100.

Zbiory są **zagnieżdżone**: prepared ⊂ poll_points ⊂ poll_text = wszystko. Skutki:
- Filtr „typowe” nic nie filtruje — tylko przełącza w widok wirtualny (blokuje tworzenie/wklejanie, zwija wyniki do folderów najwyższego poziomu).
- AND na zbiorach zagnieżdżonych = najwęższy zaznaczony; OR = najszerszy. Wielokrotny wybór meta nie ma sensu — naturalny model to jeden wybór „nadaje się co najmniej do: X” albo pokazywanie tylko najwyższego typu.
- Kropki meta: pytanie „preparowane” ma 3 kropki, każdy niepusty folder ma kropkę „typowe” — mało informacji.
- Typ `market` z game-rules.js świadomie pominięty (to kopia, nie typ do tworzenia) — OK.
- Etykieta `poll_text` w UI to „typowe” (pl.js baseExplorer.meta.pollText), a w reszcie aplikacji „Ankieta tekstowa” — niespójne nazewnictwo (plan mówi o słowniku pojęć).
- Martwe fallbacki: `|| new Set(["poll_text"])` (287, 581) i `.find(...)` po `_allQuestions` (578-580) — mapa zawsze ma wpis dla każdego pytania z tego samego `_allQuestions`, a `metaForQuestionPayload` zawsze zwraca Set.

### 3.5 Przynależność folderu do tagu / meta (ensureDerivedFolderMaps 314-397, ensureMetaMapsForUI 268-301)
- `_folderDescQIds`: folder → zbiór id pytań w całym poddrzewie (rekurencja).
- Folder „ma” tag/meta ⇔ **100% pytań poddrzewa** go ma (przecięcie). Pusty folder → pusty zbiór (nigdy nie „ma” niczego).
- `qb_category_tags` nie jest używane (dobrze, jedno źródło prawdy: tagi pytań).
- To samo kryterium „100%” decyduje, czy folder pokaże się w wynikach — **kropki i filtr są spójne** (to działa dobrze).

---

## 4. Co pokazuje widok wirtualny — `buildVirtualViewResults` (593-677)

1. `qs` = pytania z `_allQuestions` spełniające meta AND tagi AND tekst.
2. „Pełne” foldery = niepuste foldery, których **wszystkie** pytania poddrzewa są w `qs`.
3. `topFolders` = pełne foldery bez pełnego przodka.
4. **Tylko gdy jest tekst:** dokłada foldery, których nazwa zawiera tekst (i nie są pełne) — **niezależnie od tagów/chipsów**.
5. Pytania leżące gdziekolwiek pod folderem z `topFolders` są ukrywane.
6. Pytania z korzenia (category_id null) zawsze pojedynczo.

Konsekwencje i problemy:
- Folder z 10 pytaniami, z których 9 ma tag → folder się nie pokaże, 9 pytań leci płasko bez kontekstu folderu; gdy 10/10 → widać tylko folder.
- Tekst jednoliterowy („a”) zwija do folderów wszystko, gdzie każde pytanie zawiera „a” — wyniki znikają za folderami.
- (4) Chip `#pop` + tekst „a”: pokażą się foldery z „a” w nazwie, w których nie ma ani jednego pytania z tagiem pop; dodatkowo **ukryją pasujące pytania z tagiem**, które w nich leżą (5).
- (4) Folder dopasowany nazwą, będący potomkiem innego pokazanego folderu (pełnego lub też dopasowanego nazwą), pokazuje się obok przodka — duplikacja zagnieżdżenia.
- Wejście w folder z wyników (dblclick) **czyści cały filtr** i pokazuje folder bez filtra — nie da się „zejść” w wyniki; powrót do wyników = wpisać wszystko od nowa.
- Pusty folder nigdy nie pojawia się w TAG/META; w SEARCH tylko po nazwie.
- Licznik w wierszu folderu (`_directChildrenCount`) to liczba **wszystkich** bezpośrednich dzieci, nie pasujących („5 elementów”, a pasują 2). W SEARCH liczony (692-697), w TAG/META **nie** — po `afterMutation` (zeruje mapę) foldery w TAG/META pokazują „—”, przed — wartość z poprzedniego widoku.
- Okruszki: ukryte dla SEARCH/TAG (render.js:615), **pokazane dla META** (sam „Root”) — niespójne.
- Pusta lista ma ten sam komunikat „Brak elementów.” dla pustego folderu i braku wyników.

---

## 5. refreshList i pamięci podręczne

### 5.1 Inwentarz pamięci

| pole | zawartość | budowa | unieważnienie |
|---|---|---|---|
| `_allQuestions` | wszystkie pytania z payload | page.js:120 (start), ensure* gdy null, refreshList 501-503, eksport 3722 | invalidateDerivedCaches |
| `_rootQuestions` | pytania korzenia | loadQuestionsForCurrentView ALL (428-430) — **osobne zapytanie**, mimo że `_allQuestions` je zawiera | invalidate; goUp/breadcrumb root/dblclick root (1125, 2329, 2586, 2611) |
| pytania folderu | — | **zawsze świeże zapytanie** przy FOLDER (435) | — |
| `_viewQuestions` | to, co zwróciło loadQuestionsForCurrentView | 507 | invalidate; używane tylko jako zapas w rename (994) |
| `_qIndex` | id+category_id wszystkich pytań | ensureQuestionIndexForCounts — **osobne zapytanie**, te same dane co `_allQuestions` | invalidate |
| `_directChildrenCount` | liczniki folderów | buildDirectChildrenCountMap (SEARCH i browse) | invalidate |
| `_allQuestionTagMap` | pytanie → tagi | **dwa miejsca, dwie semantyki**: ensureDerivedFolderMaps 321-330 (wpis tylko dla otagowanych) i ensureAllQuestionTagMap 544-563 (wpis dla każdego) — druga praktycznie nigdy się nie wykona, bo pierwsza woła się wcześniej | invalidate; afterTagsModalClose |
| `_viewQuestionTagMap` | tagi pokazanych pytań (kropki) | **zapytanie sieciowe przy każdym refreshList** (462) | invalidate; afterTagsModalClose |
| `_folderDescQIds`, `_derivedCategoryTagMap` | poddrzewa, tagi folderów | **przeliczane przy każdym wywołaniu** ensureDerivedFolderMaps (nie cache, tylko wejścia są cache) | invalidate; afterTagsModalClose |
| `_allCategoryTagMap` | alias `_derivedCategoryTagMap` (454) | ensureTagMapsForUI | invalidate |
| `_allQuestionMetaMap` | pytanie → Set(meta) | ensureMetaMapsForUI gdy null | invalidate |
| `_viewQuestionMetaMap`, `_allCategoryMetaMap` | kropki meta | **przeliczane przy każdym wywołaniu** | invalidate |

Na jeden refreshList w SEARCH `ensureDerivedFolderMaps` wykonuje się 4 razy (buildVirtual→ensureMeta→ensureDerived, buildVirtual→ensureDerived, ensureTagMapsForUI→ensureDerived, ensureTagMapsForUI→ensureMeta→ensureDerived), `ensureMetaMapsForUI` 2 razy.

### 5.2 Kiedy unieważniane
- `afterMutation` (1246-1251) → `invalidateDerivedCaches` (1191-1212) czyści wszystko powyżej; opcjonalnie przeładowuje kategorie/tagi; potem refreshList. Używane przez create/rename/delete/copy/move/reorder/tag DnD/untag/deleteTags/przywrócenie z kosza. **To jest dobry, jednolity punkt.**
- `afterTagsModalClose` (1567-1601) czyści tylko mapy tagów i `_folderDescQIds` — wystarczy (tagi nie zmieniają pytań).
- **Brak unieważnienia** w:
  - zapisie okna pytania: `openQuestionModal` → `refreshList` (3645) **bez** `afterMutation`;
  - przycisku „Odśwież widok” / Ctrl+Alt+R (2207-2209) — goły refreshList;
  - zmianie języka (page.js:115-117) — OK, dane te same.

### 5.3 Wyścigi
- Strażnik `_refreshSeq`/`isStale` (476-478) jest, ale **przypisania do `state.folders`/`state.questions` są przed sprawdzeniem** (687-689, 720-722, 746-748, 764-765), a `state._viewQuestions` (507) w ogóle bez sprawdzenia. Starszy, wolniejszy refreshList nadpisuje stan nowszego (bez renderu). Każdy późniejszy `renderList` (klik w wiersz → scheduleRenderList 1759-1766, sort, Escape, Ctrl+A) pokazuje wtedy stare wyniki.
- Brak deduplikacji zapytań w locie: dwa szybkie refreshList przy pustym `_allQuestions` pobierają całość dwa razy; odpowiedź pobrana **przed** mutacją może wylądować w cache **po** `invalidateDerivedCaches` (refresh sprzed mutacji jeszcze czeka na `listAllQuestions`).
- `refreshList` dla META/TAG bez filtrów woła się rekurencyjnie po restore (712, 739) — działa, ale ukrywa zmianę widoku wewnątrz funkcji „odśwież”.

### 5.4 Ryzyka skali (do weryfikacji, nie potwierdzone testem)
- `listAllQuestions`, `listQuestionIndex` bez `.range()` — przy limicie wierszy PostgREST (domyślnie 1000) duża baza zostanie obcięta po cichu.
- `listQuestionTags(ids)` z `.in("question_id", ids)` dla **wszystkich** pytań — długość adresu GET rośnie ~37 znaków na pytanie; przy kilkuset–tysiącu pytań możliwe 414/odrzucenie.

### 5.5 Martwy kod w obszarze
- `state.searchQuery` + gałąź browse w `getActiveTextQuery` (540-541) + `applySearchFilterToQuestions` w browse (765) — no-op.
- `repo.js`: `listQuestionsByTag`, `listCategoryTags`, `listCategoriesByTag` — nigdzie nieimportowane.
- `ensureAllQuestionTagMap` (544-563) — praktycznie nieosiągalne (mapa już jest).
- `if (!Array.isArray(state.tags))` w ensureTagMapsForUI (444) — `tags` zawsze tablica.
- `ensureLeftSelectionsForLock` i `ensureLeftSelections` — duplikaty i zbędne (createState tworzy oba obiekty).
- Komentarz „VIEW.TAG – na razie brak” w loadQuestionsForCurrentView (438).
- Klucz tłumaczenia `baseExplorer.errors.searchLockedSelection` — nieużywany.
- `history.js` — nieimportowany; Ctrl+Z/Y wołają `state._api.undo/redo`, których nie ma (poza obszarem, odnotowane).
- Gałęzie „blokada przez fokus wyszukiwarki” w handlerach `click` (2344-2350, część 2496-2504) — w chwili `click` fokus już opuścił pole (mousedown na nie-focusowalnym elemencie zdejmuje fokus), więc warunek praktycznie nigdy nie jest prawdziwy; działa tylko wersja w `mousedown` (z alertem).
- Trzy kopie predykatu „widok wirtualny”: `isVirtualView` (actions.js:60), `isReadOnlyView` (context-menu.js:50), warunki w render.js:369-371.

---

## 6. Blokady akcji × widok

Legenda: ✓ dozwolone, ✗ zablokowane (cicho), ✗! zablokowane z alertem, ~ inna akcja.

| akcja | źródło | ALL/FOLDER | SEARCH | TAG | META |
|---|---|---|---|---|---|
| Nowy folder/pytanie | pasek (render 383-384 + handler 2135-2143), PPM (cm 315/325/419/428), Ctrl+N/Shift+N (3946-3947) | ✓ | ✗ | ✗ | ✗ |
| Zmień nazwę | pasek (canRename=canMutate), PPM (cm 461), F2 (3987) | ✓ | ✗ | ✗ | ✗ |
| Edytuj pytanie | pasek, PPM, Ctrl+E, dblclick | ✓ | ✓ | ✓ | ✓ |
| Usuń | **pasek** (render 370, handler 2176-2180 → `deleteSelected`) | ✓ | ✓ | **✓ kasuje elementy** | ✗ |
| Usuń | **PPM** (cm 490-514) | ✓ | ✓ | **~ zdejmuje tagi** | ✗ |
| Usuń | **klawisz Delete** (3911-3922) | ✓ | ✓ | **~ zdejmuje tagi** | ✗! „W widoku wyszukiwania nie można usuwać.” |
| Wytnij | pasek (render 371) | ✓ | ✗ | ✗ | ✗ |
| Wytnij | PPM (cm 351) | ✓ | ✗ | ✗ | ✗ |
| Wytnij | `canCutHere` (84-86 = canDeleteHere) | ✓ | ✓ | ✓ | ✗ |
| Wytnij | **Ctrl+X** (3943 — bez żadnego warunku widoku) | ✓ | **✓** | **✓** | **✓** |
| Kopiuj | wszędzie (editor) | ✓ | ✓ | ✓ | ✓ |
| Wklej | pasek/PPM | ✓ | ✗ | ✗ | ✗ |
| Wklej | Ctrl+V (3924-3929) | ✓ | ✗! pasteInSearch | ✗! pasteInTag | ✗ (cicho) |
| Duplikuj | pasek/PPM/Ctrl+D | ✓ | ✗ | ✗ | ✗ |
| Tagi (przypisz) | pasek/PPM/Ctrl+T | ✓ | ✓ | ✓ | ✓ |
| Utwórz grę | **pasek / Ctrl+G** (render 410/419 — **bez sprawdzenia roli**; handler 2154-2162 canWrite) | ✓ | ✓ | ✓ | ✓ |
| Utwórz grę | **PPM** (cm 479 `readOnlyView`) | ✓ | **✗** | **✗** | **✗** |
| Przeciągnij-przenieś | canDnD = canMutateHere | ✓ | ✗ | ✗ | ✗ |
| Przeciągnij na tag | canTagDnD = canWrite | ✓ | ✓ | ✓ | ✓ |
| Drzewo (klik/dblclick/PPM/drag) | isTreeLocked = fokus w polu ∨ zaznaczenie z lewej | ✓ | ✓ (gdy pole bez fokusu) | ✗! alert na mousedown | ✗! |
| Lewy panel | blokada tylko przez fokus w polu (mousedown → alert) | ✓ | zależnie od fokusu | ✓ | ✓ |
| Pole wyszukiwania | mousedown przy zaznaczeniu z lewej → auto-czyszczenie | ✓ | ✓ | czyści TAG | czyści META |

Niespójności blokad:
1. **Usuń w TAG**: przycisk paska kasuje (do kosza) elementy, a Delete i PPM tylko zdejmują tagi. Ten sam przycisk/etykieta, dwa skutki.
2. **Wytnij**: 4 różne reguły (pasek, PPM, canCutHere, Ctrl+X). Ctrl+X działa nawet w META, gdzie usuwanie jest zablokowane.
3. **Utwórz grę z wyników**: pasek i Ctrl+G pozwalają, PPM blokuje. Tworzenie gry z wyników wyszukiwania/filtra to naturalny przypadek użycia.
4. **Zmień nazwę** zablokowane w widokach wirtualnych, a **Edytuj pytanie** (zmienia tę samą treść) dozwolone — uzasadnienie z komentarza cm 440-443 („edycja po id nie zależy od miejsca”) dotyczy też zmiany nazwy.
5. Komunikat dla META mówi o „widoku wyszukiwania”; w samym SEARCH usuwanie jest dozwolone.
6. Ctrl+V w META — cisza, w SEARCH/TAG — alert.
7. Pasek „Utwórz grę” włączony dla czytelnika (viewer) — klik nic nie robi.
8. Komunikat blokady drzewa („Wyczyść zaznaczenie po lewej (klik w tło panelu)”) pojawia się na mousedown, a handler click ma kod, który sam czyści filtr — alert przechwytuje zdarzenie, więc auto-czyszczenie na desktopie raczej nie dochodzi do skutku (dwie przeciwne strategie dla tej samej sytuacji).

---

## 7. Błędy z realnym scenariuszem

**B1. Backspace / klik w chip nie zdejmuje filtra w widoku TAG z chipsów.**
Wpisz `#pop` + spacja → widok TAG (`state.tagIds = [pop]`). Backspace na pustym polu (albo klik w chip) → chip znika, pole puste, przycisk wraca do lupy, ale lista dalej filtrowana tagiem pop (refreshList w TAG czyta `state.tagIds`, które nie zostało zmienione; restore tylko dla SEARCH — 2072, 2285), a lewy panel nadal podświetla pop i drzewo jest zablokowane. Wyjście: klik w tło lewego panelu.

**B2. X nie czyści zaznaczenia z lewego panelu po chipsie.**
`#pop` + spacja → `tagSelection = {pop}`. X → widok wraca do browse, ale tag w panelu podświetlony, drzewo dalej zablokowane (alert przy kliknięciu).

**B3. Kliknięcie w pole po dodaniu chipsa przełącza na browse ze starą listą.**
Po chipsie `tagSelection` ≠ ∅ → mousedown w polu (1733-1738) → leftClear + restore + **tylko renderAll** → okruszki/drzewo mówią „Root”, a lista pokazuje wyniki TAG; chip dalej widoczny, ale nieaktywny. To samo po wejściu w TAG/META z lewego panelu i kliknięciu w pole.

**B4. Wybór tagu w lewym panelu przy wpisanym tekście.**
Szukaj „kot” (SEARCH), pole bez fokusu, klik w tag → TAG; tekst „kot” i X zostają w polu, ale są ignorowane (TAG nie bierze tekstu). Następne kliknięcie w pole → B3.

**B5. Zapis okna pytania nie unieważnia pamięci.**
(a) W korzeniu (ALL) edytuj treść/odpowiedzi pytania → zapis → lista dalej pokazuje starą treść i liczbę odpowiedzi (`_rootQuestions` z cache, 428-431).
(b) Po edycji odpowiedzi kropki „kategorii” i filtr meta liczone ze starego `_allQuestions`/`_allQuestionMetaMap`.
(c) **Utwórz grę** zaraz po edycji bierze payloady ze starego `_allQuestions` (3722-3740) → gra powstaje ze starymi odpowiedziami.
(d) Szukanie po nowej treści nie znajduje pytania.

**B6. „Odśwież widok” nie odświeża danych** poza bieżącym folderem i tagami pokazanych pytań: ALL (root), SEARCH, TAG, META, kategorie, lista tagów, liczniki — wszystko z cache.

**B7. Wyścig refreshList przy szybkim przełączaniu folderów / pisaniu.**
Dwuklik folder A, zaraz folder B, wolna sieć: odpowiedź A przychodzi po B → `state.questions = A` (764-765) przed `isStale()` → render pominięty, ale następny klik w wiersz (scheduleRenderList) rysuje pytania A pod okruszkami B; zaznaczenia/Ctrl+A działają na nie te elementy.

**B8. Przywrócenie usuniętego folderu po wyjściu z wyszukiwania.**
Jesteś w folderze X → szukasz „X” → zaznaczasz folder X w wynikach → Delete (dozwolone w SEARCH) → X/wyczyść → `restoreBrowseLocation` wraca do nieistniejącego folderu: pusta lista, okruszki tylko „Root”, w adresie `?folder=<usunięty>`.

**B9. Usunięcie tagu użytego w chipsie / w filtrze META.**
`deleteTags` (1069-1078) czyści `tagSelection` i `state.tagIds` tylko w TAG. Chip usuniętego tagu znika z widoku, ale `searchTokens.tagIds` go zawiera → SEARCH zwraca pusto bez widocznej przyczyny (przycisk X widoczny). W META z tagiem → `state.tagIds` zawiera usunięty tag → pusty wynik.

**B10. Otwarcie folderu Enterem / z PPM „Otwórz folder” / dblclick w drzewie (gdy brak blokady) zostawia stan wyszukiwania.**
SEARCH „kot” → Enter na folderze → FOLDER, ale w polu „kot” i X; lewy panel (jeśli był zaznaczony) dalej podświetlony → drzewo zablokowane w zwykłym folderze. Dblclick w liście robi to dobrze (czyści) — dwie reguły.

**B11. Telefon: #tag nigdy nie zamienia się w chip** (keydown „Unidentified”); całe wyszukiwanie po tagach z pola niedostępne, a wpisany `#pop` szuka dosłownie „#pop”.

**B12. Liczniki folderów w TAG/META** po każdej mutacji w tym widoku pokazują „—” (mapa wyzerowana, gałęzie TAG/META jej nie budują).

**B13. Pierwszy render strony** (page.js:94-105) rysuje `state.questions = qs` (wszystkie pytania bazy płasko), zanim refreshList pokaże korzeń — mignięcie pełnej listy.

---

## 8. Co działa dobrze (zachować)

- `rememberBrowseLocation`/`restoreBrowseLocation` — idea „wróć do ostatniego prawdziwego miejsca” i nadpisywanie tylko z ALL/FOLDER.
- `?folder=` przez `replaceState` (Wstecz wraca do poprzedniej strony, zgodnie z planem nawigacji), walidacja przy starcie.
- Jedno źródło prawdy dla tagów folderów: przecięcie tagów pytań poddrzewa; te same reguły dla kropek i dla wyników (folder „pełny” = 100%).
- Zwijanie wyników do najwyższego pełnego folderu i ukrywanie pytań spod niego — sensowne, czytelne dla filtrów tagów.
- Meta liczone tym samym silnikiem co gra (`evaluateReadiness` bez progu liczby pytań) — brak drugiej kopii reguł.
- `afterMutation` + `invalidateDerivedCaches` — jedna ścieżka po zapisie (gdy jest używana).
- Strażnik `_refreshSeq` (trzeba tylko przenieść przypisania za sprawdzenie).
- Przeciąganie na tag działa w każdym widoku; tworzenie gry z zaznaczenia rozwija foldery do pytań (`selectionToQuestionIds`).
- Pasek wyszukiwania rysowany raz — fokus nie ginie przy re-renderze; chipsy z animacją wejścia; lupa ↔ X.

---

## 9. Propozycja: jeden stan zapytania → jedna funkcja „co pokazać”

### 9.1 Stan
```js
state.location = { folderId: null | uuid };     // gdzie „jestem” (ALL = null); jedyne źródło ?folder=
state.query = {
  text: "",                 // tekst z pola (bez #tagów)
  tagIds: [],               // JEDNA lista tagów: chipsy w polu == zaznaczenie w lewym panelu
  tagMode: "all",           // "all" (AND) | "any" (OR) — do decyzji; dziś AND
  suggestType: null,        // null | "poll_text" | "poll_points" | "prepared" — pojedynczy wybór „nadaje się co najmniej do”
  scope: "base",            // "base" | "folder" (opcjonalnie: szukaj w bieżącym folderze)
};
```
- Lewy panel i chipsy to **dwa widoki tego samego `query.tagIds`** (klik tagu z lewej dodaje chip, klik chipu odznacza tag z lewej). Koniec z `tagSelection`, `state.tagIds`, `searchTokens.tagIds`.
- Widok jest **wyliczany**, nie ustawiany: `isFiltering = !!query.text.trim() || query.tagIds.length || query.suggestType`. Bez `VIEW.SEARCH/TAG/META` — jeden „tryb wyników”. `location` nie jest zmieniane przez filtr, więc `rememberBrowseLocation`/`restoreBrowseLocation` stają się zbędne (wyjście z filtra = `query = empty`, miejsce zostaje).
- Zmiana stanu tylko przez `setQuery(patch)` / `setLocation(folderId)` → `scheduleRefresh()` (debounce ~150 ms dla tekstu, natychmiast dla tagów).

### 9.2 Dane — jeden magazyn
```js
store = { categories, tags, questions /* wszystkie z payload */, qTags: Map(qid→Set) , version }
```
- Ładowany raz, przeładowywany w całości przez `reload()` po każdej mutacji, zapisie okna pytania i „Odśwież widok”. Z niego (czysto, synchronicznie, memo po `version`) liczone: `byFolder`, `descQIds`, `folderTags` (przecięcie), `qType` (Set typów), `folderType`, `directCount`. Znikają `_rootQuestions`, `_qIndex`, `_viewQuestions`, `_viewQuestionTagMap`, osobne zapytania per folder, podwójne budowanie `_allQuestionTagMap`.
- Odczyty z `.range()`/stronicowaniem i `qTags` przez RPC/zapytanie po `base_id` (bez długiego `.in()`).
- Generacja `version` + przypisanie wyniku dopiero po sprawdzeniu, że to najnowsze żądanie.

### 9.3 Funkcja „co pokazać”
```js
function computeListing(store, location, query) -> { mode: "browse"|"results", folders, questions, counts }
```
- browse: dzieci `location.folderId`.
- results: predykat `match(q) = textMatch(q) && tagsMatch(q) && typeMatch(q)`, gdzie:
  - `textMatch` — normalizacja (małe litery + usunięcie diakrytyków), słowa w dowolnej kolejności (każde słowo musi wystąpić), opcjonalnie także odpowiedzi;
  - `tagsMatch` — AND (lub OR wg `tagMode`);
  - `typeMatch` — `qType(q).has(suggestType)`.
- Foldery w wynikach: „pełny” folder (100% pytań poddrzewa spełnia **cały** predykat) zwinięty do najwyższego; **dopasowanie nazwy folderu tylko gdy brak tagów/typu** (albo nazwa ∧ ten sam predykat dla jego zawartości) i bez dokładania potomków już pokazanego folderu.
- Licznik folderu w wynikach = liczba **pasujących** pytań w poddrzewie („3 z 10”).
- Wejście w folder z wyników: `location = folder`, **filtr zostaje** (wyniki zawężone do poddrzewa, `scope: "folder"`), okruszki pokazują ścieżkę + „wyniki” — można zejść i wrócić bez przepisywania zapytania.

### 9.4 Reguły akcji — jedna tabela
```js
const ACTIONS = { newFolder: { inResults: false }, paste: { inResults: false }, duplicate: {inResults:false},
  move(DnD): {inResults:false}, rename: {inResults:true}, editQuestion: {inResults:true},
  delete: {inResults:true}, cut: {inResults:true}, copy: {inResults:true},
  tags: {inResults:true}, createGame: {inResults:true}, untag: {onlyWhenTagFilter:true} }
```
- `canDo(action, state)` = rola ∧ `inResults || mode==="browse"` ∧ wymagania zaznaczenia. **Jedna funkcja używana przez pasek, PPM, skróty i gesty** (zgodnie z planem rejestru akcji).
- „Usuń” zawsze usuwa (do kosza); „Zdejmij tag(i) filtra” jako **osobna, nazwana akcja** w trybie wyników z tagami (pasek/PPM/skrót, np. Shift+Delete) — koniec z podwójnym znaczeniem Delete.
- Brak blokady drzewa i panelu: klik folderu w drzewie = `setLocation` (filtr zostaje albo — do decyzji — czyści się jawnie), klik tagu = dodanie/odjęcie z `query.tagIds`; zamiast alertów „zablokowane” — spójne, przewidywalne przejścia.

### 9.5 Wyszukiwarka
- Rozpoznawanie `#` w zdarzeniu `input` (każda klawiatura), lista podpowiedzi pasujących tagów od pierwszego znaku po `#` (także z odstępami w nazwie), wybór stuknięciem/Enterem/Tab, bez zostawiania spacji; token `#…` w trakcie pisania **nie** jest traktowany jako tekst.
- Backspace na pustym polu / klik w chip / X → zawsze `setQuery` → jedna ścieżka.
- `type="search"`, `enterkeyhint="search"`, placeholder z podpowiedzią „Szukaj… (#tag)”.
- Usunięcie tagu → `query.tagIds` filtrowane po istniejących tagach w `reload()`.

### 9.6 „Proponowane kategorie”
- Pojedynczy wybór (radio) „nadaje się co najmniej do”, nazwy z game-rules/tłumaczeń gier („Ankieta tekstowa / Punktacja / Preparowana”), albo jeden znacznik najwyższego typu zamiast trzech kropek. Rozważyć ukrycie „Ankieta tekstowa” jako filtra (pasuje zawsze).

### 9.7 Testy (unit, bez DOM)
`computeListing` i `canDo` jako czyste funkcje w osobnym module → testy jednostkowe: AND/OR tagów, zwijanie folderów, dopasowanie nazwy z tagami, typy zagnieżdżone, liczniki pasujących, polskie znaki, tabela akcja × tryb.
