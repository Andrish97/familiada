# Analiza 4 — akcje menedżera bazy pytań → jeden rejestr akcji

Zakres: `web/bases/explorer/` (stan na 2026-10-20, kod z dysku, bez zmian) +
`web/shared/translation/pl.js` (blok `baseExplorer`, l. 4196–4450).
Skróty wejść: **TB** = pasek narzędzi (`render.js` + `actions.js` handler
`data-act`), **CM** = menu kontekstowe (`context-menu.js`), **KB** = skrót
klawiszowy (`actions.js` 3882–4007), **DnD** = przeciąganie, **G** = gest
dotykowy (`mobile.js`: przytrzymanie = CM, podwójne stuknięcie = dblclick,
dwa palce = ramka), **MYSZ** = klik/dwuklik.

Pomocnicze predykaty (dziś w 4 wersjach):

| nazwa | plik:linia | znaczenie |
|---|---|---|
| `canWrite(state)` | actions.js:56, tags-modal.js:22, trash-modal.js:49 | role owner/editor |
| `isEditor(state)` | context-menu.js:46 | to samo |
| `editor` (zmienna) | render.js:352 | to samo |
| `state.canEdit` | state.js:61 | to samo (ustawiane, prawie nieużywane) |
| `isVirtualView` | actions.js:60 | view ∈ {SEARCH, TAG, META} |
| `isReadOnlyView` | context-menu.js:50 | to samo, inna nazwa |
| `canMutateHere` | actions.js:64 | canWrite && !virtual |
| `canMutate`/`canCut`/`canRename` | render.js:369–374 | kopie `canMutateHere` liczone osobno |
| `canDeleteHere` | actions.js:78 | canWrite && view≠META (SEARCH/TAG dozwolone!) |
| `canDelete` | render.js:370 | kopia `canDeleteHere` |
| `canCutHere` | actions.js:84 | = `canDeleteHere` (czyli SEARCH/TAG dozwolone) |
| `canPasteHere` | actions.js:69 | canMutateHere && schowek |
| `canDnD` | actions.js:1952 | canMutateHere |
| `canTagDnD` | actions.js:2417 | canWrite (każdy widok) |

To jest źródło większości rozbieżności poniżej: te same reguły są
przepisywane w czterech miejscach i rozjechały się.

---

## 1. Spis akcji i tabele wejście × (miejsce, dostępność, komunikat przy blokadzie, błąd, blokady zasobów)

Legenda kolumn: *Gdzie* = plik:linia, *Dostępne gdy* = warunek z kodu,
*Blokada → komunikat* = co widzi użytkownik, gdy akcja niedostępna,
*Błąd* = komunikat przy wyjątku, *Lock* = `acquireResourceLock(s)`.

### 1.1 Nowy folder (`newFolder`)

| wejście | gdzie | dostępne gdy | blokada → komunikat | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:216 (przycisk), 383 (disabled), actions.js:2135 | editor && widok nie wirtualny | przycisk wyszarzony, bez wyjaśnienia | `errors.actionFailed` (2213) | brak |
| CM tło/root | context-menu.js:311 | !(!editor‖readOnlyView) | pozycja wyszarzona | **brak try/catch** (nieobsłużone odrzucenie) | brak |
| CM folder „Nowy folder w tym folderze” | context-menu.js:416 | j.w.; rodzic = kliknięty folder | wyszarzona w widokach wirtualnych, choć cel jest konkretny | brak try/catch | brak |
| KB Ctrl+Shift+N | actions.js:3947 | canMutateHere | cisza | `errors.createFolderFailed` | brak |

Wykonanie: `createFolderHere` actions.js:795 → `ops.createFolder(…, t("baseExplorer.toolbar.newFolder"))` — **nazwa nowego folderu brana z klucza etykiety paska** (dane z etykiety UI).
Rozbieżności: 3 różne komunikaty błędu (ogólny / brak / dedykowany); folder docelowy (rodzic) nie jest blokowany, choć przenoszenie blokuje folder docelowy.

### 1.2 Nowe pytanie (`newQuestion`)

Jak 1.1: TB render.js:219/384, actions.js:2140; CM root context-menu.js:321, CM folder 425 („Nowe pytanie w tym folderze”); KB Ctrl+N actions.js:3946 (`errors.createQuestionFailed`). Wykonanie `createQuestionHere` actions.js:802, tekst = `t("baseExplorer.toolbar.newQuestion")`. Brak locków. Te same rozbieżności co w 1.1.

### 1.3 Edytuj pytanie (`editQuestion`)

| wejście | gdzie | dostępne gdy | blokada → komunikat | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:227/389–411, actions.js:2145 | editor && dokładnie 1 zaznaczony i to pytanie (każdy widok) | wyszarzony | ogólny `actionFailed` nie zadziała — `openQuestionModal` sam łapie | `base_question` na czas okna |
| CM | context-menu.js:444 | editor && 1 zaznaczony && target.kind==="q" (każdy widok) | wyszarzona | j.w. | j.w. |
| KB Ctrl+E | actions.js:3950 → `clickToolbar("editQuestion")` | zależy od stanu DOM przycisku | cisza | j.w. | j.w. |
| MYSZ dwuklik pytania | actions.js:2882 | canWrite | cisza (czytelnik nie zobaczy pytania) | j.w. | j.w. |
| G podwójne stuknięcie | actions.js:2910 | canWrite | cisza | j.w. | j.w. |

Wykonanie: `state._api.openQuestionModal` actions.js:3604 → `acquireResourceLock({resourceType:"base_question"})`; odmowa → `resourceLock.goneMessage` / `resourceLock.baseItemMessage` (alert); utrata locka podczas edycji → `resourceLock.goneMessage`/`forbiddenMessage` w oknie (`e.userMessage`); inny błąd → `errors.questionOpenSaveFailed`; walidacja w oknie: `questionForm.*`.
Rozbieżności: Enter na pytaniu nic nie robi (Enter działa tylko dla folderu); skrót KB zależy od DOM-u paska (`clickToolbar`), a nie od reguły.

### 1.4 Tagi… — przypisz tagi zaznaczeniu (`editTags`)

| wejście | gdzie | dostępne gdy | blokada → komunikat | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:230/401/412, actions.js:2164 | editor && ≥1 zaznaczony (każdy widok) | wyszarzony | `actionFailed` | pytania (rozwinięte z folderów) na czas okna; zmieniane tagi przy zapisie |
| CM (folder/pytanie) | context-menu.js:385 | editor (bez sprawdzenia liczby — zawsze ≥1 przez auto-zaznaczenie) | wyszarzona | **brak try/catch** | j.w. |
| KB Ctrl+T | actions.js:3949 | **tylko canWrite** — bez zaznaczenia otwiera okno z „Brak zaznaczenia.” | — | brak try/catch | j.w. |

Wykonanie: `api.openAssignTagsModal` actions.js:3549 → `openTagsModal(mode:"assign")` tags-modal.js:195; lock sesji: pytania `base_question` (tags-modal.js:228, kontekst `tags-assign`), przy zapisie tagi `base_tag` (544, `tags-assign-save`); odmowa przy otwarciu → alert `resourceLock.*`, przy zapisie → `showErr` w oknie (inny kanał). Błąd zapisu: `tags.errors.saveAssignFailed`. **Foldery nie są blokowane** (inaczej niż przy usuwaniu/przenoszeniu, gdzie blokowane jest całe poddrzewo z folderami).
Etykiety: TB „Tagi”, CM „Tagi…”, tytuł okna „Tagi”, nagłówek lewego panelu „Tagi” — cztery role jednego słowa.

### 1.5 Zmień nazwę (`rename`)

| wejście | gdzie | dostępne gdy | blokada → komunikat | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:233/402, actions.js:2170 | editor && widok nie wirtualny && 1 zaznaczony | wyszarzony | `renameFailed` (wewnątrz) | 1 element (`base_folder`/`base_question`) na czas okna |
| CM | context-menu.js:455 | j.w.; etykieta: folder „Zmień nazwę”, pytanie „Zmień nazwę (treść)” | wyszarzona | j.w. | j.w. |
| KB F2 | actions.js:3986 | canMutateHere (bez liczby zaznaczonych) | cisza | j.w. | j.w. |

Wykonanie: `renameSelectedPrompt` actions.js:970 → lock (1006) → `openRenameModal` (893) → `renameByKey` (870, `ops.renameFolder`/`ops.setQuestionText`). Odmowa locka → alert `resourceLock.*`; utrata locka w trakcie → `resourceLock.goneMessage/forbiddenMessage`; inny błąd → `errors.renameFailed` („Nie udało się zmienić.” — bez dopełnienia).
Rozbieżności / błędy:
- **F2 przy zaznaczonym „Folderze głównym” w drzewie**: `singleSelectedKey` zwraca `"root"`, `key.slice(2)` = `"ot"` → próba locka `base_question`/`"ot"` (actions.js:1003–1009). Pasek tego nie dopuszcza (liczy tylko `c:`/`q:`), klawiatura tak.
- Okno zmiany nazwy pytania ma `maxLen 200` (actions.js:1002), a zapis tnie do 100 znaków (`normQuestionText`, `LIMITS.Q_TEXT` = 100, E21) — użytkownik wpisze 200, zapisze się 100 bez ostrzeżenia.
- Zmiana nazwy zablokowana w widokach wirtualnych, a „Edytuj pytanie” (też zmienia treść) dozwolona — niespójne. Element jest konkretny, widok nie ma znaczenia.
- Tytuły: `rename.questionTitle` „Zmień treść pytania” vs menu „Zmień nazwę (treść)”.

### 1.6 Usuń (`delete`) — elementy do kosza

| wejście | gdzie | dostępne gdy | blokada → komunikat | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:236/403/414, actions.js:2176 | editor && view≠META && ≥1 zaznaczony | wyszarzony | `actionFailed` | pytania + poddrzewa folderów (foldery + zagnieżdżone pytania) |
| CM | context-menu.js:490 | ≥1 && (view==TAG ‖ canDeleteHere) — **w TAG bez sprawdzenia roli** | wyszarzona | `errors.operationFailed` | j.w. |
| KB Delete | actions.js:3980/3911 | canDeleteHere | **`errors.deleteInSearch` „W widoku wyszukiwania nie można usuwać.”** | `errors.deleteFailed` | j.w. |

Wykonanie: `deleteSelected` actions.js:837 (root → `errors.rootDeleteBlocked`; potwierdzenie `confirm.deleteOne`/`deleteMany {n}`) → `deleteItems` 809 → `acquireResourceLocks(… "base-explorer:delete")` → `ops.deleteItems` → `afterMutation` + `refreshTrash`. Odmowa locka → `lockRefused` (1232).
Rozbieżności (najpoważniejsze w całym menedżerze):
- **W widoku tagu TB „Usuń” kasuje elementy (do kosza)**, a CM „Usuń tagi” i klawisz Delete w tym samym widoku **zdejmują tag** (`untagSelectedInTagView`). Ten sam przycisk/ikona/etykieta → dwa różne skutki zależnie od wejścia.
- Komunikat KB `deleteInSearch` jest fałszywy: `canDeleteHere` jest false tylko dla czytelnika albo w widoku META, a w SEARCH usuwanie **jest dozwolone**.
- 3 różne komunikaty błędu (`actionFailed` / `operationFailed` / `deleteFailed`).
- Mac: etykieta „Fn⌫”, obsługa tylko `e.key==="Delete"` (OK), ale samo ⌫ w folderze = „W górę” — warto to opisać w jednym miejscu.

### 1.7 Zdejmij tag w widoku tagu (`untag`)

| wejście | gdzie | dostępne gdy | blokada → komunikat | błąd | lock |
|---|---|---|---|---|---|
| TB | — (TB robi „Usuń”, patrz 1.6) | — | — | — | — |
| CM | context-menu.js:504 (pozycja „Usuń” z etykietą `menu.deleteTags` „Usuń tagi”) | view==TAG && ≥1 — **czytelnik widzi aktywną pozycję**, akcja po cichu nic nie robi (`canWrite` w 1526) | — | `operationFailed` | **brak** |
| KB Delete (w TAG) | actions.js:3917 | canDeleteHere | `deleteInSearch` (fałszywy) | `errors.removeTagsFailed` | brak |

Wykonanie: `untagSelectedInTagView` actions.js:1525: brak zaznaczenia → `errors.selectItemsRight`; brak tagów → `errors.noTagsSelected`; root → `errors.rootInOperation`; potwierdzenie `confirm.removeTagsOne/Many`; `ops.setTagLinks(…, false)` (folder = całe poddrzewo).
Rozbieżności: nadanie tagu przeciągnięciem blokuje tag + pytania + poddrzewa (1392), zdjęcie — nic. Etykieta „Usuń tagi” to ten sam klucz co **usunięcie tagów jako bytów** (`menu.deleteTags`, 1.18) — myli dwie różne operacje.

### 1.8 Kopiuj (`copy`)

| wejście | gdzie | dostępne gdy | blokada | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:244/404, actions.js:2183 | editor && ≥1 (każdy widok) | wyszarzony | `actionFailed` | — |
| CM | context-menu.js:339 | editor && ≥1 (każdy widok) | wyszarzona | brak try/catch | — |
| KB Ctrl+C | actions.js:3942 | canWrite (bez liczby; sam „root” ustawia `mode="copy"` z pustym zbiorem) | cisza | — | — |

`copySelectedToClipboard` actions.js:1152 — sam nie sprawdza roli (sprawdzają wejścia). Brak oznaczenia skopiowanych/wyciętych w liście.

### 1.9 Wytnij (`cut`)

| wejście | gdzie | dostępne gdy | blokada | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:247/405 (disabled: editor && **nie wirtualny**), actions.js:2189 (handler: `canCutHere` = **wirtualny dozwolony**) | render i handler różne reguły | wyszarzony | `actionFailed` | — |
| CM | context-menu.js:347 | editor && !readOnlyView && ≥1 | wyszarzona | brak try/catch | — |
| KB Ctrl+X | actions.js:3943 | **tylko canWrite** — działa w SEARCH/TAG/META | cisza | — | — |

Brak wizualnego oznaczenia wyciętych elementów (Explorer je przyszarza).

### 1.10 Wklej (`paste`)

| wejście | gdzie | dostępne gdy | blokada → komunikat | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:250/385, actions.js:2195 | canMutate && schowek | wyszarzony | `actionFailed` | kopia: brak; wycięcie: jak „Przenieś” |
| CM | context-menu.js:355 | !readOnlyView && schowek && editor | wyszarzona | brak try/catch | j.w. |
| KB Ctrl+V | actions.js:3944/3924 | SEARCH → `errors.pasteInSearch`; TAG → `errors.pasteInTag`; **META → cisza**; czytelnik → cisza | alert / cisza | `errors.pasteFailed` | j.w. |

Wykonanie: `pasteClipboardHere` 1168: cel = **bieżący folder widoku**, także gdy CM otwarto na innym folderze (Explorer wkleja do klikniętego folderu). Tryb cut → `moveItemsTo` i **schowek czyszczony nawet przy porażce** (1181–1182).

### 1.11 Duplikuj (`duplicate`)

| wejście | gdzie | dostępne gdy | blokada | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:253/406, actions.js:2200 | canMutate && ≥1 | wyszarzony | `actionFailed` | brak |
| CM | context-menu.js:366 | editor && !readOnlyView && ≥1 | wyszarzona | `errors.duplicateFailed` | brak |
| KB Ctrl+D | actions.js:3952 → `clickToolbar("duplicate")` | stan DOM | cisza | `actionFailed` | brak |

Błędy: `duplicateSelected` (1086) = `copySelectedToClipboard` + `pasteClipboardHere` → **nadpisuje schowek użytkownika** (także wycięte elementy). Duplikat ląduje w **bieżącym folderze widoku**, nie w folderze źródła (np. zaznaczony w drzewie folder z innej gałęzi). Komentarz 2201 („w context-menu Duplikuj jest placeholderem”) nieaktualny.

### 1.12 Utwórz grę (`createGame`)

| wejście | gdzie | dostępne gdy | blokada → komunikat | błąd | lock |
|---|---|---|---|---|---|
| TB | render.js:261/407/418, actions.js:2154 | render: ≥1 (pytanie lub folder) **bez sprawdzenia roli**; handler: canWrite → czytelnik ma aktywny przycisk, który nic nie robi | — | `createGameFailed` / `missingUserId` / `exportModalMissing` | brak |
| CM | context-menu.js:470 | editor && **!readOnlyView** && ≥1 | wyszarzona w SEARCH/TAG/META, choć TB tam działa | j.w. | brak |
| KB Ctrl+G | actions.js:3951 → `clickToolbar` | stan DOM | cisza | j.w. | brak |

Wykonanie: `state._api.openExportModal` actions.js:3672 (rozwija foldery do pytań przez `selectionToQuestionIds`, domyślna nazwa = nazwa folderu, `importGame`, potem `location.href = linkTo("games")`). Gałąź „nic nie zaznaczono, przeglądamy folder (Ctrl+G z toolbara)” (3700) jest **nieosiągalna** — TB bez zaznaczenia wyszarzony, handler wraca przy pustym `qIds`. Pusty folder → cisza, bez komunikatu. CM przekazuje `preselectIds`, które `openExportModal` i tak nadpisuje.
Nazewnictwo: akcja „Utwórz grę”, okno „Eksport gry”, postęp „Eksport…”/„Import pytań…”, plik `export-modal.js`, funkcja `importGame`.
Pytanie do decyzji: czy czytelnik bazy może tworzyć grę z jej pytań (tylko odczyt bazy)? Dziś kod mówi „nie” w handlerze, „tak” w pasku.

### 1.13 Odśwież widok (`refreshView`)

TB render.js:268 (zawsze aktywny), actions.js:2207; KB Ctrl+Alt+R (3948, `clickToolbar`); brak w CM. `refreshList` **nie unieważnia pamięci podręcznej** (`state.categories`, `state.tags`, `_rootQuestions`, `_allQuestions` zostają) → „Odśwież” nie pokaże zmian innej osoby w drzewie, tagach ani w folderze głównym. Powinno iść przez `afterMutation({categories, tags})`.

### 1.14 Otwórz folder (`openFolder`)

| wejście | gdzie | zachowanie | blokada |
|---|---|---|---|
| CM folder | context-menu.js:401 | `setViewFolder` + czyści zaznaczenie; **nie wychodzi** z wyszukiwania ani z filtra lewego panelu → drzewo dalej zablokowane (`hasLeftSelection`) | — |
| KB Enter | actions.js:3993 | tylko gdy 1 zaznaczony folder; `openFolderById` | — |
| MYSZ dwuklik w liście | actions.js:2844 | czyści wyszukiwanie + lewy panel, potem otwiera | — |
| MYSZ dwuklik w drzewie | actions.js:2564 | przy blokadzie drzewa czyści filtry; zaznacza otwarty folder | — |
| G podwójne stuknięcie (drzewo) | actions.js:2603 | **przy blokadzie drzewa — cisza** (dwuklik myszą czyści i otwiera) | — |
| G podwójne stuknięcie (lista) | actions.js:2891 | jak dwuklik | — |
| okruszki | actions.js:2320 | `setViewFolder`/`setViewAll` | — |

Cztery różne skutki uboczne „otwarcia folderu” (zaznaczenie po wejściu: czyszczone vs ustawione na folder; wyjście z filtrów: tak/nie).

### 1.15 Folder główny / W górę / zaznaczanie / sortowanie (nawigacja i widok)

- **Do folderu głównego**: dwuklik/podwójne stuknięcie wiersza root w drzewie (2582, 2609), okruszek root (2326). Brak w TB/CM.
- **W górę**: tylko KB Backspace w VIEW.FOLDER (4003, `goUp` 1117). Brak w TB/CM/G.
- **Zaznacz wszystko**: KB Ctrl+A (3945, tylko lista, nie drzewo; nie ustawia kotwicy).
- **Odznacz**: KB Escape (3974), klik w tło listy (2807) / drzewa (2507).
- **Zaznaczanie**: klik/Ctrl/Shift lista (2805, `selectRange` 125) i drzewo (2494, `selectTreeRange` 1773), lewy panel (2343, `leftSelectRange` 1885) — trzy implementacje zakresu; ramka myszą: lista 3070, drzewo 3242, tagi 3419; ramka dwoma palcami: lista 3143, drzewo 3309, tagi 3499 — **sześć kopii** tej samej logiki; mysz = dodawanie (Ctrl), dotyk = XOR.
- **Sortowanie**: klik w nagłówek (1651), klucze name/type/date; gałąź `sortKey==="ord"` w render.js:832 nieosiągalna (`SORT_KEYS` jej nie ma).
- **Zwiń/rozwiń**: strzałka w drzewie (2514), zapis w localStorage.
- **Panel boczny (telefon)**: `btnDrawerToggle` (mobile.js:44).

### 1.16 Wyszukiwanie i filtry (zmieniają widok, nie dane)

- Pole: `input` (2010) → SEARCH/TAG; `#tag` + spacja/przecinek/Enter (2268, `tryConsumeHashTagTokenFromInput` 2223; znany błąd: telefon); Backspace na pustym usuwa tabletkę; klik w tabletkę (2058); X/lupa (2087).
- Lewy panel: klik w tag/kategorię (2343 → `applyLeftFiltersView` 1904; META ma pierwszeństwo nad TAG), CM „Pokaż” na tagu (context-menu.js:208 → `api.openTagView` 3577: **ustawia TAG z pominięciem kategorii** — inaczej niż klik), CM „Pokaż” na kategorii (177: META + tagi).
- Blokady interakcji (`isTreeLocked`, `isLeftPanelLockedBySearch`, 1695–1727): komunikaty `errors.treeLockedSearch`, `treeLockedSelection`, `tagsLockedSearch` (throttle 700 ms, alert). Niespójnie: klik w drzewo przy blokadzie **czyści** filtry i działa dalej (2496), PPM/przeciąganie/ramka w drzewie **ostrzegają** (2626, 2653, 3245), podwójne stuknięcie — **cisza** (2604); `mousedown` w polu wyszukiwania przy aktywnym filtrze **czyści** filtr (1733) zamiast ostrzec (klucz `searchLockedSelection` nieużywany).

### 1.17 Tagi (byty) — nowy, edytuj, usuń, pokaż

| akcja | wejście | gdzie | dostępne gdy | lock | komunikaty |
|---|---|---|---|---|---|
| Nowy tag | CM tło/tag „Dodaj tag…” | context-menu.js:220 | editor | brak | — (okno: `tags.errors.*`) |
| | przycisk „Dodaj tag” w panelu | render.js:573, actions.js:2353 | canWrite — **przycisk widoczny dla czytelnika** (klik nic nie robi) | brak | — |
| | „Dodaj tag” w oknie tagów (L1) | index.html:130, tags-modal.js:654 | editor | brak | — |
| Edytuj tag | CM tag | context-menu.js:233 | editor && 1 tag | `base_tag` na czas okna | `resourceLock.*`; `tags.errors.saveFailed` |
| Usuń tag(i) | CM tag | context-menu.js:250 → `deleteTags` actions.js:1043 | editor && ≥1 tag | `base_tag` (pytania nie) | `confirm.deleteTagsOne/Many`; `errors.deleteTagsFailed` |
| Pokaż | CM tag/kategoria | context-menu.js:178, 208 | ≥1 | — | — |
| CM kategorii | — | context-menu.js:197–200 | zawsze wyszarzone „Dodaj tag…”, „Edytuj tag…”, „Usuń” (atrapy) | — | — |

CM „Dodaj/Edytuj tag” wołają `api.openTagModal` (który już robi `afterTagsModalClose` → `refreshTags`+`refreshList`), a potem **drugi raz** `refreshTags` + `refreshList` (context-menu.js:226–229, 240–243). Brak klawisza Delete dla tagów (Delete zawsze działa na zaznaczenie po prawej). Brak zmiany kolejności tagów (jest `ord`). Usunięcie tagu jest trwałe (nie do kosza) — potwierdzenie tego nie mówi i wspomina „ewentualnie folderów”, choć foldery nie mają już własnych tagów.

### 1.18 Przeciąganie (DnD)

| źródło → cel | gdzie | dostępne gdy | akcja | lock | błąd |
|---|---|---|---|---|---|
| lista/drzewo → wiersz folderu w liście | actions.js:2940/2959 | `canDnD` = canMutateHere | przenieś (`moveItemsTo`) / z Ctrl(Win)·Alt(Mac) kopiuj (`copyItemsTo`) | przenieś: pytania + poddrzewa + folder docelowy; kopiuj: brak | `errors.moveFailed`; `moveIntoSelf`/`moveIntoChild` |
| → tło listy | 2951/2964 | j.w. | przenieś/kopiuj **do folderu głównego** (nie do bieżącego folderu!) | j.w. | j.w. |
| → wiersz drzewa (środek 50%) | 2679/2771 | j.w. + drzewo niezablokowane | przenieś do folderu | j.w. | j.w. |
| → wiersz drzewa (górne/dolne 25%) | 2782 | j.w. | foldery: zmiana kolejności (`reorderFoldersByDrop` 1462, lock poddrzew + rodzic); same pytania: przenieś do folderu | poddrzewa + rodzic | `moveIntoChild` |
| → wiersz drzewa z Ctrl/Alt | 2748 | j.w. | kopiuj do folderu | brak | j.w. |
| → wiersz tagu | 2429/2454 | `canTagDnD` = canWrite (każdy widok) | nadaj tag (`applyTagToDraggedItems` 1385) | tag + pytania + poddrzewa | `errors.assignTagFailed` |
| → wiersz kategorii | — | ignorowane | — | — | — |

Błędy znalezione w DnD:
- **Kopia upuszczona na wiersz „Folder główny” w drzewie**: `targetId = "root"` trafia do `copyItemsTo` bez zamiany na `null` (1328) → `ops.copyItems(…, "root")` → błąd bazy (uuid). `moveItemsTo` tę zamianę ma (1348).
- Puls po kopii w drzewie zawsze na wierszu root, nie na celu (2750).
- Upuszczenie w drzewie bez wcześniejszego `dragover` nad wierszem → `state._drag.treeDrop` = null → `payload.mode` (2736) rzuca TypeError poza `try`.
- Zaznaczenie mieszane (foldery + pytania) upuszczone „przed/po” folderze: przestawiane są tylko foldery, **pytania po cichu pomijane** (2782–2790).
- Upuszczenie na tło listy przenosi do folderu głównego, a nie do aktualnie otwartego folderu (Explorer: do bieżącego).
- Zmiana kolejności pytań — brak (sort tylko nazwa/typ/data).
- Telefon: DnD wyłączone (`disableDragOnTouch`), jedyna droga = Wytnij/Wklej z menu po przytrzymaniu.
- `isCopyDragModifier` i `isMultiSelectModifier` liczą `isMac` przy każdym zdarzeniu (1938–1950); IS_MAC jest też w render.js:47, context-menu.js:24, actions.js:3961.

### 1.19 Kosz

Otwórz (przycisk `trashOpen`, trash-modal.js:168, tylko editor), Przywróć (128), Usuń trwale (131, `confirmPurge`), Opróżnij (135, `confirmEmpty`). Błędy: `trash.actionFailed`/`loadFailed` albo `e.userMessage` w oknie. **Brak locków** (przywrócenie do folderu, który ktoś właśnie przenosi/usuwa). Odświeżenie widoku tylko po „restore” (`onChange`, actions.js:3660). Decyzja 2026-10-20: kosz ma być folderem w drzewie, a Usuń/Przywróć — zwykłymi akcjami paska → kolejne wpisy rejestru (`trash.restore`, `trash.purge`, `trash.empty`, `trash.open`).

### 1.20 Cofnij / Ponów

KB Ctrl+Z (3953), Ctrl+Shift+Z / Ctrl+Y (3954–3955) → `state._api.undo/redo` — **nigdzie nie zdefiniowane**; `history.js` (`createHistory`) nie jest importowany. Skrót robi `preventDefault` i nic. `ops.restorePositions`, `ops.restoreTagLinks` nieużywane (przygotowane pod cofanie).

### 1.21 Zbiorczo: różny zakres zaznaczenia między wejściami

- TB liczy tylko klucze `c:`/`q:` (render.js:355); KB Delete/F2/Ctrl+C/X widzą cały `selection.keys` łącznie z `"root"` (stąd 1.5 „ot”, `rootDeleteBlocked` tylko z klawiatury).
- CM najpierw zaznacza kliknięty element (context-menu.js:291) — TB/KB działają na istniejącym zaznaczeniu.
- `deleteSelected` podaje w potwierdzeniu `keys.size` (z „root”), `deleteItems` usuwa po `splitKeys`.
- „Utwórz grę” i okno tagów rozwijają foldery do pytań poddrzewa; usuwanie/przenoszenie operują na folderach; zdjęcie tagu z folderu = całe poddrzewo.
- Zaznaczenie w drzewie i w liście to ten sam zbiór — folder zaznaczony w drzewie jest „zaznaczony” także dla akcji wykonywanych w kontekście innego folderu (Duplikuj/Wklej celują w bieżący folder).

---

## 2. Komunikaty

### 2.1 Mapa użycia (alertModal / confirmModal / komunikat w oknie)

| klucz | typ | gdzie użyty |
|---|---|---|
| `resourceLock.goneMessage` / `baseItemMessage` | alert | actions.js:1014–1015 (rename), 1233 (`lockRefused`), 3615–3617 (pytanie), tags-modal.js:241–243 |
| `resourceLock.goneMessage` / `forbiddenMessage` (utrata locka) | alert / w oknie | actions.js:1025–1027, 3634–3636; tags-modal.js:521, 606 |
| `resourceLock.goneMessage`/`baseItemMessage` przy zapisie tagów | w oknie (`showErr`) | tags-modal.js:549 |
| `resourceLock.baseChangingMessage`, `baseAccessRevoked*` | nakładka | page.js:76–81 |
| `baseExplorer.errors.rootDeleteBlocked` | alert | actions.js:842 |
| `confirm.deleteOne/deleteMany` | confirm | actions.js:847–848 |
| `confirm.deleteTagsOne/Many` | confirm | actions.js:1050–1051 |
| `confirm.removeTagsOne/Many` | confirm | actions.js:1550–1551 |
| `errors.renameFailed` | alert | actions.js:1035 |
| `errors.moveIntoSelf` | alert | actions.js:1355 |
| `errors.moveIntoChild` | alert | actions.js:1359, 1490, 1494; ops.js:15 (qb:cycle) |
| `errors.selectItemsRight`, `noTagsSelected`, `rootInOperation` | alert | actions.js:1532, 1539, 1545 |
| `errors.treeLockedSearch/treeLockedSelection/tagsLockedSearch` | alert (throttle) | actions.js:1716, 1720, 1726 |
| `errors.actionFailed` | alert | actions.js:2213, 2219 (TB) |
| `errors.assignTagFailed` | alert | actions.js:2478 |
| `errors.moveFailed` | alert | actions.js:2798, 2990 |
| `errors.questionOpenSaveFailed` | alert | actions.js:3649 |
| `errors.missingUserId`, `exportModalMissing`, `createGameFailed` | alert | actions.js:3677, 3683, 3811 |
| `errors.deleteInSearch`, `removeTagsFailed`, `deleteFailed` | alert | actions.js:3913, 3918, 3921 |
| `errors.pasteInSearch`, `pasteInTag`, `pasteFailed` | alert | actions.js:3925, 3926, 3928 |
| `errors.createQuestionFailed`, `createFolderFailed` | alert | actions.js:3946, 3947 |
| `errors.deleteTagsFailed`, `duplicateFailed`, `operationFailed` | alert | context-menu.js:262, 376, 511 |
| `errors.missingBaseId`, `noAccess`, `loadFailed` | alert | page.js:51, 139, 144 |
| `tags.partialWarning` | alert | tags-modal.js:338 |
| `tags.errors.noSpaces/allowedChars/duplicate/saveAssignFailed/saveFailed` | w oknie | tags-modal.js:585, 589, 598, 647, 648; `duplicate` też ops.js:16 |
| `trash.confirmPurge/confirmEmpty` | confirm | trash-modal.js:130, 137 |
| `trash.loadFailed/actionFailed` | w oknie | trash-modal.js:101, 116 |
| `export.errors.createFailed`, `export.progress.*` | w oknie | export-modal.js:368–391; actions.js:3762–3788 |
| `questionForm.confirmDiscard/discard/keepEditing/saveFailed` | confirm / w oknie | question-modal.js:172–174, 217 |
| `e.userMessage` z `ops.js` (qb:gone/forbidden/cycle/duplicate) | alert przez `opFailed` / w oknie | actions.js:1239; tags-modal.js:560, 613; question-modal.js:217; trash-modal.js:101,116 |

### 2.2 Duplikaty i niespójności

- **Ta sama obsługa locka przepisana 5 razy** (actions.js:1012, 1232, 3613; tags-modal.js:239, 548) + 3 razy obsługa utraty locka (`lease.reason`), z różnym kanałem (alert vs `showErr`). Do jednej funkcji `lockMessage(lease)`.
- **Ogólny błąd akcji w 4 wariantach**: `actionFailed` „Nie udało się wykonać akcji.”, `operationFailed` „Nie udało się wykonać operacji.”, plus dedykowane (`deleteFailed`, `pasteFailed`, …) zależnie od wejścia, nie od akcji.
- **Ten sam tekst pod różnymi kluczami** (wynik skryptu): „Usuń” ×3 (`common.delete`, `toolbar.delete`, `menu.delete`); `toolbar.*` i `menu.*` dla Nowy folder, Nowe pytanie, Kopiuj, Wytnij, Wklej, Duplikuj, Zmień nazwę (+`rename.title`); „Tagi” ×3 (`toolbar.editTags`, `tags.modalTitle`, `tags.header`); „Pytanie” ×3; „Folder” ×2; „Kolor” ×2; „Kosz” ×2; „{count} odp.” ×2 (`export.answersCount`, `list.answerCount`); „—” ×2.
- `menu.*` różni się od `toolbar.*` tylko wielokropkiem przy części pozycji (Tagi…, Edytuj pytanie…, Utwórz grę…, Dodaj tag…, Edytuj tag…) — bez reguły (Zmień nazwę też otwiera okno, a nie ma „…”).
- `menu.deleteTags` „Usuń tagi” użyte i dla **usunięcia tagów** (byty), i dla **zdjęcia tagu z elementów** w widoku tagu.
- `errors.deleteInSearch` pokazywany w sytuacjach, które nie są wyszukiwaniem (META, czytelnik), a w wyszukiwaniu usuwanie działa.
- `index.html`: przyciski X okien mają **dwa atrybuty `data-i18n-aria-label`** naraz (`baseExplorer.common.close` i `common.modal.closeLabel`, l. 122, 142, 168, 221, 376) — przeglądarka bierze pierwszy; `qClose`/`trashClose` używają tylko `common.modal.closeLabel`. Jeden klucz zamknięcia.
- Teksty techniczne dla użytkownika: `missingUserId` („Brak userId…”), `exportModalMissing` („Błąd: exportModal nie jest zainicjalizowany.”), `loadFailed` („(sprawdź konsolę)”), `export.errors.createFailed` („(szczegóły … konsoli)”), `export.progress.errorDetail` z surowym `e.message`.
- `tags.partialWarning` — „Kliknięcie ustawi: wszyscy.” (powinno być „wszystkie”); `tags.selectionFolders` „{count} folder(ów)” i `selectionQuestions` „{count} pyt.” bez form liczby mnogiej.
- `tags.errors.allowedChars` „litery, cyfry i _” — regex dopuszcza tylko ASCII `[a-zA-Z0-9_]` (tags-modal.js:588), polskie litery odrzucane.
- `confirm.deleteTagsOne/Many` wspominają tagi folderów (nieistniejące w UI) i nie mówią, że usunięcie jest trwałe (bez kosza).
- `confirm.removeTagsOne/Many` — styl „Jesteś w widoku tagów. Usuwamy tagi…” (opisuje mechanikę, nie skutek).
- `baseExplorer.search.clear` używany poza menedżerem (`shared/js/core/list-search.js:60,151`, `logos/editor/draw/index.html:138`) → przenieść do `common`.

### 2.3 Nieużywane klucze (`baseExplorer`, 204 liście)

Skrypt (szukanie dosłownych użyć w `web/**/*.js|html`, z uwzględnieniem kluczy dynamicznych):
- `baseExplorer.common.delete`
- `baseExplorer.question.addAnswer`, `question.sumLabel`
- `baseExplorer.question.errors.maxAnswers`, `pointsRange`, `sumExceeded`, `textRequired` (walidacja przeszła do `questionForm.*`)
- `baseExplorer.errors.searchLockedSelection`
- `export.issue.*` (5 kluczy) **są używane dynamicznie** (`export-modal.js:207`, `` `baseExplorer.export.issue.${issue.code}` ``) — zostają; kody zgodne z `game-rules.js` (`minQuestions` celowo pominięty).
Brakujących kluczy (użytych w kodzie, a nieobecnych w pl.js) — brak.

### 2.4 Teksty na sztywno po polsku w JS/HTML

- `render.js:209` — `aria-label="Otwórz panel"` (przycisk panelu na telefonie).
- `repo.js:52` — `new Error("Brak dostępu do tej bazy.")` (do użytkownika trafia `errors.noAccess`, ale tekst zostaje w błędzie).
- `tags-modal.js` — domyślny kolor `#4da3ff` w 6 miejscach (nie tekst, ale stała do jednego miejsca).
- `index.html` — teksty zastępcze przy `data-i18n` (OK, nadpisywane); `value="gra"` w `xName` (index.html:231) — nadpisywane przez `export.defaultGameName`.
- Skróty klawiszowe zapisane na sztywno dwa razy: `render.js:277–288` i `context-menu.js:314–473` (np. „Ctrl+Shift+N”/„⌘⇧N”), a obsługa trzeci raz w `MOD_SHORTCUTS` (actions.js:3941). „Enter”/„⏎” i „Delete”/„Fn⌫” tylko w CM.

---

## 3. Słownik pojęć (UI PL ↔ kod ↔ baza)

| UI (PL) | kod (dziś) | baza | uwagi |
|---|---|---|---|
| Baza pytań | `base`, `baseId`, `baseMeta`, `resourceType "base"` | `question_bases`, `question_base_shares.role` | OK |
| Menedżer bazy pytań | `baseExplorer` (klucze), „explorer”, komentarze „menadżer”, nagłówki plików „base-explorerjs/…” | — | pisownia „menadżer” (page.js:2, repo.js:2), ścieżki w nagłówkach błędne |
| **Folder** | `category`/`categories`/`cat`/`kind="cat"`/klucz `"c:"`/`cIds` **oraz** `folder`/`folderId`/`VIEW.FOLDER`/`createFolder`/`renameFolder`/`folderIds` | `qb_categories` (`parent_id`), `qb_questions.category_id`; lock `base_folder` | dwie nazwy w kodzie na jedno pojęcie |
| **Folder główny** | `root`, `"root"` (klucz i `ROOT_ID`), `VIEW.ALL` („wszystkie pytania” w komentarzu state.js:5), `_rootQuestions`, `parentId null`, `setViewAll` | `parent_id IS NULL`, `category_id IS NULL` | „ALL” sugeruje wszystkie pytania bazy, a to tylko pytania bez folderu |
| Pytanie | `question`/`q`/`"q:"`/`qIds`, `payload.text` | `qb_questions.payload` (`text`, `answers[]`); lock `base_question` | OK |
| Odpowiedź, punkty | `answers`, `fixed_points`, `ord` | `payload.answers[].fixed_points` | OK |
| Tag | `tag`, `"t:"`, `tagIds`, `tagSelection`, `state.tags` | `qb_tags`, `qb_question_tags`; lock `base_tag` | `qb_category_tags` + `repo.listCategoryTags`, `listCategoriesByTag`, `listQuestionsByTag` — martwe (0 użyć) |
| Tag folderu (pochodny: 100% pytań poddrzewa) | `_derivedCategoryTagMap` **i** alias `_allCategoryTagMap` | brak (wyliczane) | dwa pola na jedno |
| **Kategorie** w lewym panelu: dziś „Pasujące kategorie”, decyzja: **„Proponowane kategorie”** | `meta`, `META`, `META_ORDER`, `VIEW.META`, `metaSelection`, klucz `"m:"`, `metaForQuestionPayload`, `_allQuestionMetaMap`, `_viewQuestionMetaMap`, `_allCategoryMetaMap`, `metaDotsHtml`, `kind="meta"`, `tags.metaHeader` | **brak w bazie** — wyliczane z `payload` przez `evaluateReadiness` (`game-rules.js`); odpowiada typom gry `games.type`: `prepared` / `poll_points` / `poll_text` | „kategoria” w UI ≠ „category” w kodzie/bazie (= folder) — główny konflikt nazw |
| nazwy kategorii | `baseExplorer.meta.prepared` „preparowane”, `pollPoints` „punktowane”, `pollText` „typowe” | `prepared`, `poll_points`, `poll_text` | gdzie indziej: „Preparowana”, „Punktacja”, „Ankieta tekstowa” (export, gry, `game-rules.js` komentarz); plan: „preparowana / punktowana / ankieta tekstowa” |
| kolejność kategorii | `META_ORDER` = prepared, poll_points, poll_text | — | suwak typu w oknie gry odwrotnie: poll_text, poll_points, prepared (export-modal.js:15) |
| „ankieta tekstowa” | — | — | `evaluateReadiness("poll_text")` bez progu liczby pytań zawsze OK → **każde pytanie** ma tę kategorię; filtr nią = wszystko; domyślna wartość zastępcza `new Set(["poll_text"])` (actions.js:287, 581) |
| Kolumna „Info” | klasy `h-meta`/`col-meta`, klucz `meta` w `COLS_KEY` | — | trzecie znaczenie słowa „meta” |
| Kolumna „Typ” | `col-type`, sort `type` = ranga kategorii | — | „Typ” = folder/pytanie + kropki kategorii |
| Widoki | `VIEW.ALL`, `FOLDER` (przeglądanie, „browse”), `SEARCH`, `TAG`, `META`; w komentarzach też „FILTER” | — | `isVirtualView` vs `isReadOnlyView` (ta sama rzecz) |
| Zaznaczenie | `selection.keys` (`c:`/`q:`/`"root"`), `anchorKey`; lewy panel `tagSelection`, `metaSelection`, `_leftAnchorKey` (`m:`/`t:`) | — | „root” jako element zaznaczenia |
| Schowek | `clipboard {mode: copy|cut, keys}` | — | OK |
| Kosz | `trash`, `trash-modal.js`, `refreshTrash` | `qb_trash` (migracja 428), `qb_trash_list/restore/purge` | OK |
| Utwórz grę | `createGame`, `openExportModal`, `export-modal.js`, `exportModal`, `importGame`, `export.*` klucze, okno „Eksport gry” | `games` | 3 nazwy: create / export / import |
| Zmień nazwę (pytanie: „Zmień treść pytania” / „Zmień nazwę (treść)”) | `rename`, `renameByKey`, `setQuestionText`, `renameFolder` | `qb_rename_folder`, `qb_set_question_text` | 2 etykiety |
| Edytuj pytanie | `editQuestion`, `openQuestionModal`, `saveQuestion` | `qb_save_question` | OK |
| Tagi… (przypisz) | `editTags`, `openAssignTagsModal`, tryb `"assign"`, `applyTagStates` | `qb_apply_tag_states` | 3 nazwy |
| Zdejmij tag (widok tagu) | `untagSelectedInTagView`, `removeTags*`, `setTagLinks(on=false)` | `qb_set_tag_links` | UI mówi „Usuń tagi” |
| Usuń tag(i) | `deleteTags` | `qb_delete_tags` | j.w. (ta sama etykieta) |
| Nadaj tag (upuszczenie) | `applyTagToDraggedItems`, `setTagLinks(on=true)`, `assignTagFailed` | `qb_set_tag_links` | — |
| Odśwież widok | `refreshView` (act), `refreshList` | — | „odśwież” nie odświeża danych |
| Kolejność folderów | `ord`, `reorderFolders`, `reorderFoldersByDrop`, `applyCategoryOrder` | `qb_reorder_folders`, `ord` | — |
| Uprawnienia | `role`, `canEdit`, `canWrite`, `isEditor`, `editor` | `question_base_shares.role` (`editor`/`viewer`) + `owner_id` | 4 nazwy w kodzie |

### 3.1 Nazwy do zmiany (propozycja; wymaga decyzji tylko pkt a)

a) **Główny konflikt „kategoria”**: w kodzie słowo `category` zostaje wyłącznie w `repo.js`/`ops.js` (mapowanie kolumn bazy). W pozostałym kodzie folder = `folder` (`cat`→`folder`, `kind="cat"`→`"folder"`, klucz `"c:"`→`"f:"`, `cIds`→`folderIds`, `applyCategoryOrder`→`applyFolderOrder`, `_allCategoryTagMap`→`folderTagMap`), a „Proponowane kategorie” = `suggestedType` / `typeFit` (np. `VIEW.META`→`VIEW.TYPE`, `metaSelection`→`typeSelection`, `META`/`META_ORDER`→`SUGGESTED_TYPES` budowane z `TYPES` z `game-rules.js`, `metaForQuestionPayload`→`suggestedTypesFor`, `"m:"`→`"k:"` lub `"ty:"`).
b) Etykiety kategorii zgodne z typami gry (`meta.pollText` „typowe” → „ankieta tekstowa”, `pollPoints` „punktowane” → „punktowana”, `prepared` „preparowane” → „preparowana”), jedna kolejność wszędzie (z `game-rules.js`).
c) `tags.metaHeader` → `tags.suggestedHeader` = „Proponowane kategorie” (decyzja).
d) `VIEW.ALL` → `VIEW.ROOT` (to jest folder główny), `setViewAll` → `openRoot`.
e) Jedna nazwa uprawnień: `canEdit(state)`; jedna nazwa widoku filtra: `isFilterView(state)`.
f) Okno i akcja tworzenia gry: `export-modal.js` → `create-game-modal.js`, klucze `export.*` → `createGame.*`, tytuł okna „Utwórz grę”.
g) Zdjęcie tagu: nowy klucz `menu.untag` („Zdejmij tag” / „Zdejmij tagi”), osobny od `menu.deleteTags`.
h) Kolumna `h-meta`/`col-meta` → `h-info`/`col-info`.
i) Duplikaty pomocnicze: `uniq`/`uniqIds`, `buildChildrenIndex`/`buildChildrenIdIndex`, `singleSelectedKey`/`onlyOneSelectedKey`, `ensureLeftSelections`/`ensureLeftSelectionsForLock`, `splitKeys`/`selectionSplitIds`/`splitKeysToItems`, `refreshTags` (actions + tags-modal), `esc`/`escapeHtml` (×3), `IS_MAC` (×4), `currentParentId` vs 5 kopii warunku `(view===FOLDER && folderId) ? folderId : null`.
j) Martwe: `repo.listQuestionsByTag`, `listCategoryTags`, `listCategoriesByTag`; gałąź sortowania `ord`; gałąź „Ctrl+G bez zaznaczenia” w `openExportModal`; atrapy w CM kategorii; nieużywane klucze z 2.3.

---

## 4. Proponowany rejestr akcji

### 4.1 Kształt wpisu

```js
// actions/registry.js — dane + odwołania do poleceń; zero DOM-u
export const ACTIONS = [
  {
    id: "item.delete",                 // przestrzeń: item.*, folder.*, tag.*, clip.*, nav.*, view.*, trash.*, history.*
    labelKey: "baseExplorer.actions.delete",        // JEDEN klucz dla paska, menu, dymka
    label: (ctx) => ctx.view === VIEW.TAG ? "baseExplorer.actions.untag" : null, // opcjonalny wariant zależny od kontekstu
    opensDialog: false,                // true → menu dopisuje „…” (jedna reguła)
    icon: "trash",
    danger: true,
    group: "edit",                     // kolejność/separatory w pasku i menu
    shortcut: { key: "Delete", mac: "Fn⌫" },        // jedno źródło: dymek, menu, obsługa klawiatury
    surfaces: { toolbar: true, menu: ["folder", "question"], keys: true },
    // „ma sens w tym widoku” → nie: pozycja ZNIKA (zmienia się tylko przy zmianie widoku)
    visible: (ctx) => ctx.view !== VIEW.TYPE && !ctx.inTrash,
    // „można teraz” → nie: wyszarzona + powód w dymku; z klawiatury/gestu ten sam powód jako alert
    enabled: (ctx) => !ctx.canEdit ? "baseExplorer.reasons.readOnly"
                    : !ctx.sel.items.length ? "baseExplorer.reasons.selectSomething"
                    : ctx.sel.hasRoot ? "baseExplorer.errors.rootDeleteBlocked"
                    : true,
    confirm: (ctx) => ({ key: ctx.sel.items.length === 1 ? "baseExplorer.confirm.deleteOne" : "baseExplorer.confirm.deleteMany", params: { n: ctx.sel.items.length } }),
    locks: (ctx) => locksFor.subtree(ctx, ctx.sel),  // lista zasobów albo { session: true } dla okien
    run: (ctx) => items.delete(ctx),                // zwraca wynik bazy (stan „przed”)
    after: { folders: true, trash: true },          // flagi afterMutation
    history: { labelKey: "baseExplorer.history.delete", undo: (r) => …, redo: (r) => … },
    errorKey: "baseExplorer.errors.deleteFailed",   // JEDEN komunikat ogólny akcji
  },
];
```

Pola: `id`, `labelKey` (+ `label(ctx)` dla wariantu), `opensDialog`, `icon`, `danger`, `group`, `shortcut` (`key`, `mod`, `shift`, `alt`, `mac`), `surfaces` (`toolbar`, `menu`: lista celów `root|folder|question|tag|tags-bg|type`, `keys`, `drop`, `gesture`), `visible(ctx)`, `enabled(ctx)` (true albo klucz powodu), `confirm(ctx)`, `locks(ctx)` (zasoby albo sesja okna; kontekst locka = `base-explorer:<id>`), `run(ctx)`, `after` (unieważnienie pamięci: foldery/tagi/kosz), `history` (etykieta + odwrotność, pod `history.js`), `errorKey`.

### 4.2 Kontekst i jedna ścieżka wykonania

```js
// actions/context.js
buildContext(state, { source /* toolbar|menu|keys|drop|gesture */, target /* {kind,id} */, drop /* {mode,targetId,copy} */ })
  → { state, source, view, canEdit, isFilterView, inTrash,
      sel: { keys, items /* tylko f:/q: */, folderIds, questionIds, hasRoot, one, onlyQuestion },
      here /* folder docelowy: target folderu z menu > bieżący folder > null */,
      clipboard, tagView: { tagIds }, typeView: { typeIds } }

// actions/run.js
async function runAction(id, ctx) {
  const a = byId(id);
  if (!a.visible(ctx)) return;                       // niewidoczna = nic
  const ok = a.enabled(ctx);
  if (ok !== true) return reason(ctx, ok);           // pasek/menu: nieklikalne; klawiatura/gest: alert z powodem
  if (a.confirm && !(await confirmModal(text(a.confirm(ctx))))) return;
  const lease = await acquireLocksFor(a, ctx);       // jedno lockMessage(lease)
  if (lease && !lease.ok) return lockMessage(lease);
  try { const r = await a.run(ctx, lease); await afterMutation(ctx.state, a.after); history.push(a.history, r); }
  catch (e) { alertModal({ text: e.userMessage || t(a.errorKey) }); console.error(e); }
  finally { lease?.release(); }
}
```

Wejścia stają się cienkimi adapterami:
- **pasek** — `renderToolbar` buduje przyciski z `ACTIONS.filter(a => a.surfaces.toolbar)`, `hidden = !visible`, `disabled = enabled !== true`, `data-tip = label + (shortcut)` + powód; klik → `runAction(id, ctx)`.
- **menu** — `showContextMenu` buduje pozycje z `surfaces.menu` zawierających `target.kind`, te same `visible/enabled`, ten sam skrót w prawej kolumnie.
- **klawiatura** — mapa skrótów generowana z `shortcut` (koniec `MOD_SHORTCUTS` i `clickToolbar`), bramka `shortcutsBlocked()` zostaje.
- **przeciąganie** — `dnd.js` tylko rozpoznaje intencję (`item.move`/`item.copy`/`folder.reorder`/`tag.assign`, cel, tryb) i woła `runAction` z `ctx.drop`.
- **gesty** — przytrzymanie = otwórz menu (jak PPM), podwójne stuknięcie = to samo co dwuklik (`nav.open`/`item.editQuestion`), dwa palce = ramka; przyszłe gesty (np. cofanie) = kolejne `surfaces.gesture`.

### 4.3 Proponowana lista wpisów (id → dzisiejsze miejsca)

| id | dziś | uwagi do ujednolicenia |
|---|---|---|
| `folder.create` | 1.1 | `here` = folder z menu albo bieżący; nazwa domyślna z osobnego klucza `defaults.newFolder` (nie z etykiety paska); lock folderu nadrzędnego (shared) |
| `question.create` | 1.2 | j.w. |
| `question.edit` | 1.3 | lock sesji okna; Enter na pytaniu; czytelnik — podgląd tylko do odczytu (do decyzji) |
| `item.tags` | 1.4 | wymagane ≥1 element także z Ctrl+T; lock sesji: pytania + foldery |
| `item.rename` | 1.5 | bez blokady w widokach filtra (cel konkretny); limit 100 znaków z `LIMITS.Q_TEXT`; root wykluczony w `ctx.sel` |
| `item.delete` | 1.6 | w widoku tagu **niewidoczna**, zamiast niej `item.untag` (pasek, menu i Delete identycznie) |
| `item.untag` | 1.7 | widoczna tylko w widoku tagu; locki jak `tag.assign` |
| `clip.copy`, `clip.cut`, `clip.paste` | 1.8–1.10 | jedna reguła dostępności; wklejenie z menu folderu → do tego folderu; schowek czyszczony tylko po udanym przeniesieniu; oznaczenie wyciętych |
| `item.duplicate` | 1.11 | bez schowka (bezpośrednio `copyItems` do folderu źródła) |
| `game.create` | 1.12 | jedna reguła dla paska i menu (także w widokach filtra); komunikat przy pustym wyniku |
| `view.refresh` | 1.13 | z unieważnieniem pamięci (foldery, tagi, pytania) |
| `nav.open`, `nav.up`, `nav.root` | 1.14–1.15 | jedno zachowanie wyjścia z filtrów i zaznaczenia; „W górę” także w pasku/okruszkach/menu tła |
| `sel.all`, `sel.clear` | 1.15 | Ctrl+A także w drzewie (fokus panelu) |
| `item.move`, `item.copyTo`, `folder.reorder`, `tag.assign` | 1.18 | z DnD i z menu („Przenieś do…”, przydatne na telefonie bez DnD); `"root"` → `null` w jednym miejscu |
| `tag.create`, `tag.edit`, `tag.delete`, `tag.show` | 1.17 | przycisk „Dodaj tag” w panelu = ta sama akcja (ukryty dla czytelnika); Delete z fokusem w panelu tagów → `tag.delete` |
| `type.show` | 1.16 | (dzisiejsze META) |
| `trash.open`, `trash.restore`, `trash.purge`, `trash.empty` | 1.19 | pod decyzję „kosz = folder w drzewie”; locki przywracanego elementu i celu |
| `history.undo`, `history.redo` | 1.20 | wpięcie `history.js` w `runAction` |

### 4.4 Podział `actions.js` (4010 linii) na moduły

| nowy plik | co trafia (dzisiejsze linie actions.js) |
|---|---|
| `js/actions/registry.js` | tablica `ACTIONS` (4.1/4.3) — jedyne źródło etykiet, ikon, skrótów, dostępności, komunikatów |
| `js/actions/context.js` | `buildContext`, predykaty uprawnień/widoku (56–87, render.js:352–379, context-menu.js:46–57), zaznaczenie → elementy (111–159, 399–417, 1214–1229, 855–859, 1099–1103) |
| `js/actions/run.js` | `runAction`, `lockMessage` (1231–1235 + 4 kopie), `opFailed` (1237–1243), `afterMutation` (1245–1251), `invalidateDerivedCaches` (1191–1212), wpięcie `history.js` |
| `js/actions/locks.js` | `collectSubtreeLockResources` (1297–1322), `collectSubtreeIds`, `buildChildrenIndex` (1266–1295), zestawy zasobów per akcja |
| `js/commands/items.js` | create/rename/delete/duplicate/copy/move/reorder (795–891, 1086–1097, 1326–1382, 1411–1519) |
| `js/commands/tags.js` | `deleteTags`, `untag`, `applyTagToDraggedItems`, `afterTagsModalClose`, `refreshTags` (1042–1083, 1384–1409, 1521–1601) |
| `js/commands/clipboard.js` | 1130–1187 |
| `js/commands/navigation.js` | `openFolderById`, `goUp`, `parentFolderId`, wyjście z filtrów, `applyLeftFiltersView`, `openTagView` (1105–1128, 1904–1936, 3577–3587, kod okruszków 2320–2341) |
| `js/commands/game.js` | most do okna tworzenia gry (3667–3814) |
| `js/data/listing.js` | „stan → co pokazać”: `refreshList`, `buildVirtualViewResults`, `loadQuestionsForCurrentView` (419–440, 473–791) |
| `js/data/derived.js` | liczniki, tagi folderów, kategorie (161–417) |
| `js/ui/toolbar.js` | budowa paska z rejestru (z render.js:194–427) + obsługa wyszukiwania w pasku (2010–2318) → albo osobny `ui/search.js` |
| `js/ui/context-menu.js` | render/pozycjonowanie menu (dzisiejszy plik bez logiki dostępności) — pozycje z rejestru |
| `js/ui/keyboard.js` | bramka i mapa skrótów z rejestru (3882–4007) |
| `js/ui/selection.js` | jedna implementacja klik/Ctrl/Shift/zakres dla listy, drzewa i lewego panelu (125–151, 1773–1796, 1798–1902, 2494–2562, 2805–2841) |
| `js/ui/marquee.js` | jedna ramka (mysz + dwa palce) parametryzowana kontenerem i selektorem wierszy (3001–3541; dziś 6 kopii) |
| `js/ui/dnd.js` | rozpoznanie intencji przeciągania (1938–2008, 2417–2482, 2650–2802, 2915–2999) → `runAction` |
| `js/ui/left-panel.js` | klik/PPM/blokady panelu tagów i kategorii (1670–1750, 2343–2415) |
| `js/ui/sort.js` | sortowanie nagłówkiem (1613–1668) + definicja kolumn z render.js |
| `js/ui/rename-modal.js` | `openRenameModal` (893–968) |
| `js/ui/question-bridge.js` | `openQuestionModal` z lockiem (3598–3654) — albo w `commands/items.js` |
| `js/platform.js` | `IS_MAC`, `isCopyDragModifier`, `isMultiSelectModifier`, formatowanie skrótów (4 kopie) |
| `js/wire.js` | dzisiejsze `wireActions`: tylko składanie modułów i `state._api` (docelowo zamiast `_api` — import rejestru, co usuwa też cykliczny import actions.js ↔ context-menu.js) |

Zostają: `state.js`, `render.js` (drzewo, lista, okruszki, panel — bez paska), `repo.js` (odczyty), `ops.js` (zapisy), `history.js`, okna (`tags-modal.js`, `question-modal.js`, `export-modal.js`→`create-game-modal.js`, `trash-modal.js` do przebudowy na „kosz w drzewie”), `mobile.js` (→ `ui/gestures.js`).

### 4.5 Klucze tłumaczeń po zmianie

- `baseExplorer.actions.<id>` — jedna etykieta akcji (zamiast `toolbar.*` + `menu.*`); `…` dopisywane automatycznie przy `opensDialog`.
- `baseExplorer.reasons.<kod>` — powody niedostępności (dymek wyszarzonego przycisku = alert z klawiatury): `readOnly`, `selectSomething`, `selectOne`, `selectQuestion`, `notInFilterView`, `clipboardEmpty`, `rootNotAllowed`, `treeLockedSearch`, … (część przejdzie z `errors.*`).
- `baseExplorer.errors.<id>Failed` — jeden komunikat ogólny na akcję (zamiast `actionFailed`/`operationFailed` zależnie od wejścia).
- `baseExplorer.confirm.*` — bez zmian kluczy, poprawione treści (2.2).
- `baseExplorer.history.<id>` — etykiety „Cofnij: …” pod Ctrl+Z.

---

## 5. Inne ulepszenia (poza rejestrem, wynikłe z analizy)

1. Naprawić błędy: F2 na „Folderze głównym” (1.5), kopia upuszczona na root w drzewie (1.18), TypeError przy upuszczeniu bez `treeDrop` (1.18), pominięte pytania przy „przed/po” (1.18), puls na złym wierszu, Duplikuj nadpisujący schowek (1.11), schowek czyszczony po nieudanym przeniesieniu (1.10), limit 200/100 w oknie zmiany nazwy (1.5), „Odśwież” bez odświeżenia danych (1.13), Ctrl+Z/Y bez działania (1.20).
2. Locki spójnie: kopiuj/wklej-kopię/duplikuj — co najmniej folder docelowy (shared), tworzenie — folder nadrzędny, zdjęcie tagu — jak nadanie, przywracanie z kosza — element i cel, usuwanie tagów — także pytania (jak nadanie przeciągnięciem) albo świadomie tylko tag (zapisać decyzję).
3. Podwójne odświeżanie po CM „Dodaj/Edytuj tag” (1.17).
4. Przycisk „Dodaj tag” i ikona „Utwórz grę” dla czytelnika (ukryć albo uzasadnić).
5. Blokady interakcji (wyszukiwanie ↔ drzewo ↔ lewy panel): jedna reguła zamiast trzech zachowań (czyści / ostrzega / cisza) — zgodnie z planem „przemyśleć wyszukiwanie i filtrowanie”.
6. Wklejanie/upuszczanie „na tło” = do bieżącego folderu (jak Explorer), nie do folderu głównego.
7. „Przenieś do…”/„Kopiuj do…” w menu — zastępstwo DnD na telefonie.
8. Kategoria „ankieta tekstowa” pasuje do każdego pytania — rozważyć, czy pokazywać ją jako filtr (plan mówi „samo pytanie → ankieta tekstowa”, czyli pytanie **bez** odpowiedzi; dziś także pytania z odpowiedziami) — do decyzji użytkownika.
9. Nazwy tagów: dopuścić polskie litery (regex `\p{L}`) albo poprawić komunikat.
