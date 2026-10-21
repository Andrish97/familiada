# Analiza 1 — wejścia użytkownika w menedżerze bazy pytań (`web/bases/explorer/`)

Zakres: zaznaczanie (lista, drzewo, tagi/meta), nawigacja, DnD, menu kontekstowe,
telefon (mobile.js), skróty klawiaturowe. Tylko odczyt kodu, bez uruchamiania.
Ścieżki skrócone: `A` = `js/actions.js`, `CM` = `js/context-menu.js`,
`R` = `js/render.js`, `M` = `js/mobile.js`, `S` = `js/state.js`, `P` = `js/page.js`,
`CSS` = `css/base-explorer.css`.

Oznaczenia: **[BŁĄD]** — realny scenariusz z błędnym wynikiem; **[NIESP]** — to samo
zachowanie zrobione różnie; **[MARTWE]** — kod bez efektu; **[RYZYKO]** — do
sprawdzenia na prawdziwym urządzeniu; **[DOBRE]** — zachować.

---

## 0. Model stanu (S)

| Pole | Gdzie | Uwagi |
|---|---|---|
| `state.selection.keys` (Set `q:<id>`, `c:<id>`, `root`) + `anchorKey` | S:93-98 | **Jedno** zaznaczenie wspólne dla drzewa i listy. |
| `state.tagSelection {ids, anchorId}` | S:100-103 | `anchorId` zapisywany, nigdy czytany (zakres liczy `_leftAnchorKey`). |
| `state.metaSelection {ids, anchorId}` | S:106-109 | j.w. |
| `state._leftAnchorKey` (`m:`/`t:`) | A:1803 | prawdziwy anchor lewego panelu, poza `createState`. |
| `state.clipboard {mode, keys}` | S:112-115 | |
| `state._drag {keys, overKey, mode, treeDrop, tagDrop}` | A:1755 | `overKey` i `mode` zapisywane, nigdy czytane. |
| helpery | `selectionClear` S:176, `selectionSetSingle` S:181, `selectionToggle` S:187 | `selectionSetSingle`/`Toggle` już ustawiają anchor — wywołujący i tak powtarzają `state.selection.anchorKey = key` (A:2555-2558, 2830-2834, 2541, 2582, 2596, 2609, 2615). |

Role: `canWrite` A:56 (owner/editor), `canMutateHere` A:64 (canWrite i nie
SEARCH/TAG/META), `canPasteHere` A:69, `canDeleteHere` A:78 (canWrite i nie META),
`canCutHere` A:84 (=canDeleteHere). W CM osobno `isEditor` CM:46 i
`isReadOnlyView` CM:50; w R osobno `editor`, `canMutate`, `canDelete`, `canCut`
R:352-373. Trzy kopie tych samych reguł, częściowo rozbieżne (sekcja 8).

Odświeżanie: `renderAll` R:180 (toolbar, drzewo, tagi, okruszki, lista);
`renderList` R:762 **woła też `renderToolbar`** (R:769) — więc stan przycisków
nadąża za listą; drzewa i tagów `renderList` NIE odświeża.

---

## 1. Zaznaczanie w liście `#list`

DOM: `#list > table.list-table > tbody > tr.row[data-kind=q|cat][data-id]` (R:880-937),
nagłówek `tr.list-head`. Wiersze `draggable` dla owner/editor (R:884).

### 1.1 Klik (A:2805-2842)
- Klik w sam `#list` (`e.target === listEl`, czyli pusty obszar POD tabelą) →
  `selectionClear` + `renderList` (A:2807-2811).
- Klik w wiersz: klucz `q:`/`c:`;
  - Shift → `selectRange(state, listEl, key)` (A:125-151) po kolejności DOM
    (`currentRowKeys` A:111); bez anchora/anchor spoza listy → pojedyncze.
  - Ctrl (Win/Linux) / ⌘ (Mac) (`isMultiSelectModifier` A:1944) → `selectionToggle`.
  - zwykły → `selectionSetSingle`.
- Odświeżenie: Shift → od razu `renderList`; pozostałe → `scheduleRenderList`
  (A:1759, opóźnienie 180 ms „żeby zdążył dblclick”) → `renderToolbar`+`renderList`.
- Drzewo NIE jest odświeżane.

### 1.2 Podwójny klik (A:2844-2889)
- Kasuje oczekujący `clickRenderTimer`.
- Folder: gdy fokus w wyszukiwarce, lewe zaznaczenie albo widok SEARCH/TAG/META →
  czyści pole szukania, `searchTokens`, `leftClear`, `restoreBrowseLocation`;
  potem `setViewFolder` + `selectionClear` + `refreshList`.
- Pytanie: `canWrite` → `openQuestionModal(id)`.

### 1.3 Zaznaczanie ramką (marquee) — lista (A:3002-3185)
- `mousedown` (A:3070) tylko lewy, nie na nagłówku/resizerze/wierszu/kontrolce;
  bez Ctrl → `selectionClear` + `renderList`; z Ctrl/⌘ → baza = dotychczasowe
  zaznaczenie (dodawanie). `preventDefault` (brak zaznaczania tekstu — ale też
  fokus zostaje tam, gdzie był, np. w wyszukiwarce).
- `mousemove` (document, A:3117) → `updateMarqueeSelection` (A:3036): przecięcie
  prostokątów, `anchorKey = null`, tylko przełączanie klas `is-selected`.
- `mouseup` (document, A:3131) → usunięcie ramki, `renderList`.
- Dotyk (A:3146-3185): DWA palce → prostokąt między palcami, tryb XOR z bazą
  (`marqueeToggle`), `touchmove` z `preventDefault`.

### 1.4 Ctrl+A (A:3931-3938, 3945)
`currentRowKeys(#list)` → `state.selection.keys`, `renderList`. Zawsze lista,
niezależnie od tego, gdzie jest „fokus” (drzewo/tagi). Nie ustawia anchora.

### 1.5 Escape (A:3974-3978)
`selectionClear` + `renderList` (tylko lista + toolbar).

---

## 2. Zaznaczanie i nawigacja w drzewie `#tree`

DOM: nagłówek „Foldery” (div), `.treeList` z `padding-bottom:30px` (CSS:298-301),
wiersze `.row.tree-row[data-kind=root|cat][data-id]` (R:482); root ma
`data-id="root"`; strzałka `.tree-toggle[data-id]` (button). Foldery `draggable`
dla owner/editor (R:476-479). Wiersze bez `position:relative` (CSS:265-271).

### 2.1 Klik (A:2494-2562)
1. Jeśli `isTreeLocked` (A:1698: fokus w `#searchText` LUB niepuste tag/meta
   zaznaczenie) → czyści szukanie, `leftClear`, `restoreBrowseLocation`,
   `refreshList` i KONTYNUUJE.
2. Tło (`e.target === treeEl` lub poza `.treeList`) → `selectionClear` +
   `scheduleRenderTree` (A:2486, 180 ms → `renderAll`).
3. Strzałka → przełącza `state.treeOpen`, `saveTreeOpen` (localStorage), render.
4. Root → `selectionSetSingle("root")`.
5. Folder: Shift → `selectTreeRange` (A:1773, kolejność widocznych wierszy cat,
   anchor musi zaczynać się od `c:`), Ctrl/⌘ → toggle, zwykły → single.
   Odświeżenie `scheduleRenderTree` → `renderAll`.

### 2.2 Podwójny klik (A:2564-2601)
Najpierw to samo „odblokowanie” co w 2.1; root → `setViewAll` + zaznacz root;
folder → `setViewFolder` + zaznacz ten folder (`c:id`) + `refreshList`.
Nie kasuje timera `treeClickRenderTimer` (lista kasuje — A:2845-2848).

### 2.3 Podwójny tap (A:2603-2619)
Gdy `isTreeLocked` → **cicho nic** (inaczej niż dblclick, który odblokowuje).

### 2.4 Ramka w drzewie (A:3187-3350)
`mousedown` (A:3242): lewy przycisk; **najpierw** `isTreeLocked` → `warnTreeLocked`
(alert, A:1714) — zanim sprawdzi, czy to wiersz/strzałka. Reszta jak w liście,
tylko foldery (`c:`), root pominięty; `mouseup` → `renderAll`.
Dotyk dwoma palcami (A:3309-3350), XOR.

---

## 3. Lewy panel: meta („Proponowane kategorie”) + tagi (`#leftFilters`)

DOM: `#matchedCategories` (meta: `.row[data-kind=meta]`) i `#tags`
(`#btnAddTag`, `.row[data-kind=tag]`), R:549-608. Wspólny kontener zdarzeń
`tagsEl = #leftFilters` (A:1609).

### 3.1 Klik (A:2343-2388)
- Jeśli fokus w wyszukiwarce (`isLeftPanelLockedBySearch`) → czyści szukanie,
  `refreshList`, kontynuuje.
- `suppressNextTagsClick` (po ramce) → return.
- `#btnAddTag` → `openTagsModal(create)` → `afterTagsModalClose` (A:1567).
- Tło (także nagłówki) → `leftClear`; TAG/META → `restoreBrowseLocation`;
  `selectionClear`; `refreshList`.
- Wiersz: klucz `m:`/`t:` (`leftKeyFromRow` A:1822); Shift → `leftSelectRange`
  (A:1885, wspólna kolejność META_ORDER + tagi po `ord`), Ctrl/⌘ → `leftToggle`,
  zwykły → `leftSelectSingle`. Potem `applyLeftFiltersView` (A:1904):
  - nic → powrót do przeglądania,
  - jest meta → `VIEW.META` (+ tagi jako AND),
  - same tagi → `VIEW.TAG`.
  Zawsze `selectionClear` (prawa strona) + `refreshList`.

### 3.2 Ramka w tagach (A:3352-3540)
`mousedown` (A:3419): fokus w szukaniu → alert; nie na wierszu/`#btnAddTag`;
bez Ctrl czyści tag+meta; `mousemove` → `updateTagsMarqueeSelection` (A:3370);
`mouseup` → `suppressNextTagsClick = true` (reset `setTimeout 0`) +
`applyLeftFiltersView`. Dotyk dwoma palcami, XOR (A:3500-3540).
**[DOBRE]** Tylko tutaj jest tłumik kliknięcia po ramce (`suppressNextTagsClick`).

### 3.3 Blokady paneli (A:1672-1750)
- Drzewo zablokowane: fokus w szukaniu LUB lewe zaznaczenie.
- Tagi zablokowane: fokus w szukaniu.
- Szukanie „zablokowane” przez lewe zaznaczenie — ale `mousedown` na `#searchText`
  (A:1733) i `#searchBox` (A:1744) po prostu czyści lewe zaznaczenie i wraca do
  przeglądania (bez komunikatu; oba handlery odpalają się przy jednym kliknięciu).

---

## 4. Przeciąganie (DnD)

Modyfikatory (A:1938-1950): kopia = Win/Linux **Ctrl lub Meta**, Mac **Alt/Option**;
wielozaznaczenie = Win/Linux Ctrl, Mac ⌘. Mac wykrywany przez
`navigator.platform` w 4 miejscach (A:1939, A:1945, A:3962, CM:24, R:47).

### 4.1 Źródła
- Lista `dragstart` (A:2915): `canWrite` (także w SEARCH/TAG/META — do tagowania);
  niezaznaczony wiersz → `selectionSetSingle` + `renderList` (przebudowa DOM
  w trakcie `dragstart`); `_drag.keys = kopia zaznaczenia`;
  `effectAllowed = copyMove`.
- Drzewo `dragstart` (A:2651): przy blokadzie → alert i `return` (bez
  `preventDefault` — natywne przeciąganie trwa dalej); `canWrite`; niezaznaczony
  folder → single + `renderAll`.
- `dragend` tylko na liście (A:2996): czyści podświetlenia i `_drag.keys`.

### 4.2 Cele
- **Lista** `dragover` (A:2940): `canDnD` (= `canMutateHere`, czyli nie w widokach
  wirtualnych), pomija nagłówek; folder pod kursorem → `setDropTarget(id)`,
  w przeciwnym razie `setDropTarget(null)` = podświetlenie wiersza **Root w drzewie**.
  `drop` (A:2959): folder → move/copy do folderu; **wszystko inne (tło, wiersz
  pytania) → do KORZENIA** (A:2964-2967), puls na root.
- **Drzewo** `dragover` (A:2679): przy blokadzie cicho; `canDnD`; wiersz
  `.row[data-id]` (także root) → strefy 25%/50%/25% before/into/after
  (`_drag.treeDrop`), klasy `is-drop-before/after/into`. Bez wiersza → `return`
  (zostaje POPRZEDNI `treeDrop` i poprzednie podświetlenie).
  `drop` (A:2725-2802): kopia → `copyItemsTo(keys, targetId)` niezależnie od strefy;
  move: `modeKey==="root"||!targetId` → korzeń; `into` → `moveItemsTo`;
  before/after z folderami → `reorderFoldersByDrop` (A:1462); same pytania
  before/after → do folderu.
- **Tagi** `dragover` (A:2429): `canTagDnD` = `canWrite` (wszędzie), zawsze
  `preventDefault` na całym panelu; wiersz tagu → `is-drop-target`.
  `drop` (A:2454): `applyTagToDraggedItems` (A:1385, blokady + `setTagLinks`),
  puls na tagu. Nie czyści `_drag.keys`.

### 4.3 Podświetlenia (CSS)
`.is-drop-into,.is-drop-target` przerywana obwódka (CSS:395-401); linie
`.is-drop-before::before/.is-drop-after::after` absolutne (CSS:407-422) — dla
`tr` osobne reguły na `td` (CSS:1090-1108, `td` ma `position:relative` CSS:1032);
`.drop-pulse` CSS:680.

---

## 5. Menu kontekstowe (CM)

Wejścia: lista `contextmenu` (A:3818), drzewo (A:2622), tagi (A:2391), long-press:
lista (A:3835), drzewo (A:3847), tagi (A:3860). Każdy `contextmenu` zaczyna od
`isTouchContextMenuWindow(el)` (M:118) — ignoruje natywne menu do 800 ms po
dotykowym `pointerdown`. Zamknięcie: tylko `mousedown` poza menu (A:3875-3880)
albo klik w pozycję (CM:98-103).

Pozycjonowanie `positionMenu` (CM:107-123): pokaż poza ekranem, zmierz, przytnij
`clamp` do okna z marginesem 8 px. CSS: `position:fixed; z-index:9999` (CSS:424);
na ≤900 px: większe pozycje, bez skrótów, `max-width: 100vw-16px`,
`max-height: 60vh`, przewijanie (CSS:1722-1734); na ≤600 px przy otwartym arkuszu
menu ukryte (CSS:64).

### 5.1 Warianty
| target.kind | Skąd | Zawartość |
|---|---|---|
| `meta` | PPM/long-press na meta | Pokaż (→VIEW.META, CM:177-193), potem wyszarzone na stałe: Dodaj tag, Edytuj tag, Usuń |
| `tag` | PPM/long-press na tagu | Pokaż (`openTagView`), Dodaj tag, Edytuj tag (dokładnie 1), Usuń tag(i) |
| `tags-bg` | tło lewego panelu | jak `tag` (Pokaż/Edytuj/Usuń zależne od istniejącego zaznaczenia) |
| `root` | tło listy, tło drzewa, wiersz Root | Nowy folder, Nowe pytanie (rodzic = **bieżący folder widoku**), Kopiuj, Wytnij, Wklej, Duplikuj |
| `cat` | folder w liście/drzewie | Schowek ×4, Tagi, Otwórz folder, Nowy folder w…, Nowe pytanie w…, Edytuj pytanie (wyszarz.), Zmień nazwę, Utwórz grę, Usuń/„Usuń tagi” (TAG) |
| `q` | pytanie w liście | Schowek ×4, Tagi, Edytuj pytanie, Zmień nazwę, Utwórz grę, Usuń/„Usuń tagi” |

Zaznaczanie przy PPM: element niezaznaczony → najpierw single-select + `renderAll`
(CM:291-300 dla cat/q; CM:144-171 dla tag/meta; dodatkowo to samo robi wcześniej
handler tagów A:2398-2405 i long-press tagów A:3865). **[DOBRE]** zasada
„PPM na niezaznaczonym zaznacza, na zaznaczonym zostawia wielozaznaczenie”.

---

## 6. Telefon (M + CSS)

- `initDrawer` (M:10-54): przycisk `#btnDrawerToggle` (w toolbarze, R:208) i
  `#drawerOverlay`; mierzy wysokość toolbara (`--be-toolbar-h`); zamyka na overlay
  i `modal-sheet:enter`; świadomie NIE zamyka po wyborze w drzewie/tagach.
  Brak zamykania Escape. Drawer `position:fixed; z-index:1000` (CSS:1619-1656).
- `addLongPress` (M:67-102): tylko `pointerType !== "mouse"`; 500 ms; ruch >10 px,
  `pointerup`, `pointercancel` anulują; zapisuje czas dotyku w `touchDownAt`.
- `isTouchContextMenuWindow` (M:118-121): okno 800 ms po dotyku.
- `addDoubleTap` (M:129-146): dwa `touchend` w <300 ms na **tym samym węźle
  `e.target`**; drugi `touchend` z `preventDefault` (blokuje syntetyczny click).
- `disableDragOnTouch` (M:152-158): `-webkit-user-drag:none` dla
  `(pointer: coarse) and (hover: none)`; wołane w P:109.
- Wielozaznaczenie na dotyku: tylko ramka dwoma palcami (XOR) — brak trybu
  zaznaczania / checkboxów.
- Wiersze listy 48 px (CSS:1713-1716), tabela `min-width:560px` z poziomym
  przewijaniem.

---

## 7. Skróty klawiaturowe — stan obecny (A:3880-4007)

Jeden globalny `keydown` na `document` (A:3958). Bramka `shortcutsBlocked`
(A:3887-3895): fokus w input/textarea/contenteditable, istnieje `.uni-modal`,
albo widoczny któryś z `MODAL_IDS` (A:3886: `questionOverlay`, `tagsOverlay`,
`exportOverlay`, `trashOverlay`, `renameModal`; sprawdza `hidden` i
`style.display`). Modyfikator: Mac `metaKey`, reszta `ctrlKey`. Klucz =
`e.key.toLowerCase()` + `":shift"` albo (gdy bez Shift) `":alt"`.

| Klucz | Akcja | Warunek |
|---|---|---|
| `c` | `copySelectedToClipboard` | `canWrite` |
| `x` | `cutSelectedToClipboard` | tylko `canWrite` w środku funkcji |
| `v` | `onPasteKey` (A:3924): SEARCH/TAG → alert, `canMutateHere` | |
| `a` | `selectAllInList` | — |
| `n` | nowe pytanie w `currentParentId` | `canMutateHere`, `tryAction` |
| `n:shift` | nowy folder | j.w. |
| `r:alt` | `clickToolbar("refreshView")` | |
| `t` | `openAssignTagsModal` | `canWrite` (bez sprawdzenia zaznaczenia) |
| `e` / `g` / `d` | `clickToolbar("editQuestion"/"createGame"/"duplicate")` | stan `disabled` przycisku |
| `z`, `z:shift`, `y` | `state._api.undo/redo` | **nie istnieją** |

Bez modyfikatora: Escape (czyść zaznaczenie + `renderList`), Delete
(`onDeleteKey` A:3911: `!canDeleteHere` → alert „deleteInSearch”; TAG →
`untagSelectedInTagView`; reszta → `deleteSelected`), F2 (`canMutateHere` →
`renameSelectedPrompt`), Enter (dokładnie 1 folder → `openFolderById`),
Backspace (tylko VIEW.FOLDER → `goUp`).

**[DOBRE]** jedna bramka `shortcutsBlocked` (naprawiła Delete w polu treści —
test e2e A:3200 spec), tablica `MOD_SHORTCUTS` czytelna, `tryAction` z komunikatem.

---

## 8. Niespójności **[NIESP]**

1. **Trzy różne reguły „Wytnij”**: toolbar-render `canCut` = editor i nie
   SEARCH/TAG/META (R:367); toolbar-klik `canCutHere` = nie META (A:2189-2192,
   ale przycisk i tak wyszarzony); menu: `readOnlyView` (CM:351); **Ctrl+X: tylko
   canWrite, wszędzie** (A:3943 → A:1159). Ctrl+X działa w SEARCH/TAG/META,
   gdzie przycisk i menu są wyszarzone.
2. **„Usuń” w widoku TAG**: klawisz Delete i menu → zdejmowanie tagów
   (`untagSelectedInTagView`, A:3917-3919, CM:504-505); **przycisk toolbaru →
   prawdziwe usunięcie do kosza** (`case "delete"` A:2176-2180 woła
   `deleteSelected`). Patrz błąd B1.
3. **„Utwórz grę” w widokach wirtualnych**: toolbar i Ctrl+G dostępne (R:398,
   410 — tylko zaznaczenie), menu kontekstowe wyszarzone przy `readOnlyView`
   (CM:479). Do tego menu przekazuje `preselectIds`, toolbar nie
   (A:2154-2161 vs CM:481-483) — i tak nadpisywane w `openExportModal`
   (A:3711-3729), więc `selectionToQuestionIds` liczy się dwa razy.
4. **Nawigacja do folderu — 5 ścieżek, 3 zachowania**:
   dblclick/doubletap listy czyszczą szukanie, lewe zaznaczenie i widok
   wirtualny (A:2859-2873, 2897-2905); **Enter (A:3993-3998 → `openFolderById`
   A:1111) i menu „Otwórz folder” (CM:406-410) — nie**; drzewo dblclick
   „odblokowuje” (A:2566-2574), drzewo doubletap przy blokadzie nic nie robi
   (A:2604). Zaznaczenie po wejściu: drzewo zaznacza folder (A:2588-2591),
   lista/Enter/menu czyszczą.
5. **Blokady paneli**: drzewo — `mousedown` alert (A:3245-3248), `contextmenu`
   alert, `dragstart` alert, long-press alert, `click`/`dblclick` „odblokuj
   i działaj”, doubletap „cicho nic”; tagi — `mousedown` alert, `click`
   odblokowuje; szukanie — `mousedown` odblokowuje bez komunikatu. Patrz B4.
6. **Odświeżanie po zmianie zaznaczenia**: drzewo → `renderAll` (po 180 ms);
   lista → `renderToolbar+renderList` (po 180 ms, Shift od razu); Escape,
   Ctrl+A, ramka w liście, klik w tło listy → tylko `renderList`. Drzewo
   pokazuje wtedy nieaktualne podświetlenie (B7).
7. **Anchor**: `selectionSetSingle/Toggle` ustawiają anchor, a wywołujący
   ustawiają go drugi raz (8 miejsc). W lewym panelu dwa anchory naraz
   (`tagSelection.anchorId`/`metaSelection.anchorId` — nieczytane — i
   `_leftAnchorKey`); CM:150-164 ustawia tylko te nieczytane.
8. **Zakres Shift** zrobiony 3 razy prawie identycznie: `selectRange` A:125,
   `selectTreeRange` A:1773, `leftSelectRange` A:1885. Ramka 3 razy
   (lista/drzewo/tagi, ~500 linii, A:3002-3540) z kopiami `*LocalPoint`,
   `rowRectIn*`, `update*MarqueeSelection` i trzema parami listenerów
   `mousemove`/`mouseup` na `document`.
9. **PPM/long-press na tagu** — zaznaczanie robione 2× (A:2398-2405 i CM:144-171;
   A:3865 i CM:144-171). Long-press listy/drzewa/tagów to kopie handlerów
   `contextmenu` (A:3835-3871 vs A:2622-2648, 3818-3832, 2391-2414).
10. **Dwa wejścia do VIEW.META/TAG**: klik w lewy panel (`applyLeftFiltersView`,
    A:1904) vs menu „Pokaż” (CM:182-192 dla META — bez `selectionClear`;
    `openTagView` A:3577 — z `selectionClear`, ale bez uwzględnienia meta).
11. **Rodzic dla „Nowy …”** liczony 4 razy: `currentParentId` A:775, toolbar
    A:2124, CM:307, `pasteClipboardHere` A:1172.
12. **Zduplikowane helpery**: `singleSelectedKey` A:855 = `onlyOneSelectedKey`
    A:1099; `uniq` A:1421 = `uniqIds` A:157; `buildChildrenIndex` A:1266 ≈
    `buildChildrenIdIndex` A:208; `ensureLeftSelectionsForLock` A:1685 ≈
    `ensureLeftSelections` A:1800; `isEditor` CM:46 = `canWrite` A:56;
    `isReadOnlyView` CM:50 = `isVirtualView` A:60; „realne klucze” liczone w
    CM:54, R:355, A:2128, A:3687; `IS_MAC`/`kbd` w CM:24-27 i R:47-51, plus
    `isMac` w A:1939, 1945, 3962.
13. **Skróty**: `c/x/v/n/t` wołają akcje wprost (z własnymi warunkami), a
    `e/g/d/r` przez `clickToolbar` (warunki = stan przycisku). Ctrl+T otwiera
    okno tagów przy pustym zaznaczeniu (przycisk jest wtedy wyszarzony, R:384).
14. **Obsługa błędów akcji**: toolbar i skróty w `try/catch`/`tryAction`;
    w menu kontekstowym tylko Duplikuj/Usuń/Usuń tagi — Nowy folder/pytanie,
    Wklej, Pokaż, Otwórz folder, Tagi bez łapania (nieobsłużone odrzucenie,
    brak komunikatu; CM:98-103).
15. **Komunikaty blokad wklejania**: SEARCH/TAG → alert, META → cicho (A:3924-3929).

---

## 9. Błędy **[BŁĄD]** (z scenariuszem)

**B1. Toolbar „Usuń” w widoku TAG kasuje elementy zamiast zdejmować tag.**
A:2176-2180 → `deleteSelected`. Scenariusz: klik w tag „Sport” po lewej
(VIEW.TAG), zaznacz pytanie, klik ikony kosza w toolbarze → potwierdzenie
„usunąć?” → pytanie trafia do kosza. Delete i PPM w tym samym stanie tylko
zdejmują tag.

**B2. Upuszczenie w liście poza folderem przenosi do KORZENIA, nie do bieżącego
folderu.** A:2964-2967 (`targetFolderId = null` → `moveItemsTo(…, null)`).
Scenariusz: w folderze „A” przeciągam pytanie i puszczam na innym pytaniu albo
na pustym tle → pytanie znika z „A” i ląduje w Root. Z Ctrl: kopia do Root.
W Eksploratorze/Finderze tło = bieżący folder.

**B3. Ramka (marquee) w liście i drzewie jest kasowana kliknięciem po
`mouseup`.** `mousedown` na pustym obszarze pod tabelą ma `target = #list`;
`mouseup` nad wierszem → przeglądarka wysyła `click` do wspólnego przodka, czyli
`#list` → `e.target === listEl` → `selectionClear` (A:2807-2811). Drzewo: wspólny
przodek `#tree` → A:2507 czyści. Tagi mają na to tłumik (`suppressNextTagsClick`
A:3492), lista i drzewo nie. Brak testu e2e ramki. (Wniosek z kodu i zasady
„click na wspólnym przodku” — potwierdzić jednym testem.)

**B4. Blokady drzewa/tagów: alert na `mousedown` przechwytuje klik, więc kod
„odblokuj i działaj” w `click` nigdy się nie wykona.** `mousedown` drzewa
(A:3242-3248) sprawdza blokadę PRZED sprawdzeniem, czy to wiersz/strzałka, i
pokazuje `alertModal` (pełnoekranowa nakładka powstaje synchronicznie) → `click`
nie trafia w drzewo. Scenariusz: kliknięty tag po lewej (VIEW.TAG) → każdy klik
w folder **albo strzałkę rozwijania** w drzewie daje tylko alert. Podobnie:
piszę w wyszukiwarce (fokus) i klikam folder w drzewie albo tag → alert
(fokus jest jeszcze w polu w chwili `mousedown`). Kod A:2496-2504 i A:2344-2350
jest w praktyce martwy dla myszy.

**B5. `#tag` w wyszukiwarce ustawia lewe zaznaczenie tagów, a następny klik w
pole szukania wraca do przeglądania przy wciąż widocznych chipach.**
`tryConsumeHashTagTokenFromInput` A:2260-2263 kopiuje tagi do `tagSelection`;
`mousedown` na `#searchText` (A:1733-1739) widzi „lewe zaznaczenie” →
`leftClear` + `restoreBrowseLocation` + `renderAll`. Scenariusz: wpisz
`#Sport` + spacja (VIEW.TAG, chip), kliknij w pole, by dopisać tekst → lista
pokazuje cały folder, chip nadal jest. Przy okazji drzewo jest „zablokowane”
od chwili utworzenia chipa. Usunięcie chipa (A:2056-2080) nie zdejmuje
`tagSelection`.

**B6. Enter i menu „Otwórz folder” w widoku SEARCH/TAG/META zostawiają stan
widoku wirtualnego.** A:3993-3998, CM:406-410. Scenariusz: TAG „Sport”,
zaznacz folder, Enter → `VIEW.FOLDER`, ale tag dalej podświetlony po lewej,
drzewo zablokowane (alert przy kliknięciu), a po wyszukiwaniu tekst zostaje w
polu i X dalej aktywny.

**B7. Wspólne zaznaczenie drzewa i listy + częściowe odświeżanie → ukryte
elementy w zaznaczeniu.** Klik w folder X w drzewie, potem Ctrl+klik pytania
w liście → zaznaczenie `{c:X, q:Y}`; X może nie być widoczny w liście. Delete
→ „Usunąć 2 elementy?” → usuwa też folder X z całym poddrzewem. Dodatkowo
klik w liście/Escape/Ctrl+A/ramka listy nie odświeżają drzewa, więc drzewo
dalej podświetla folder, którego nie ma w zaznaczeniu (lub odwrotnie).

**B8. Zaznaczenie nie jest przycinane po zmianach.** Po `deleteItems`,
`moveItemsTo`, wklejeniu wyciętych (`afterMutation` A:1246) klucze zostają w
`state.selection` (brak przycinania w `refreshList`). Scenariusz: przeciągam
pytanie z listy na folder (znika z widoku), toolbar dalej ma aktywne
Usuń/Kopiuj; Delete → „Usunąć 1 element?” → kasuje niewidoczne pytanie. Po
usunięciu: przyciski aktywne dla nieistniejących elementów.

**B9. Upuszczenie na drzewie bez wcześniejszego najechania na wiersz → wyjątek.**
A:2735-2737: `payload = state._drag.treeDrop` może być `undefined`/`null`
(start `_drag` A:1755 bez `treeDrop`; `dragleave` A:2718-2723 zeruje).
Scenariusz: przeciągam z listy prosto na puste miejsce pod folderami w drzewie
→ `TypeError: Cannot read properties of null (reading 'mode')` poza `try`, brak
komunikatu, `_drag.keys` nie wyczyszczone. Odwrotnie: najechanie na wiersz,
potem na tło → upuszczenie trafia do OSTATNIEGO wiersza (dragover A:2697-2699
nie zeruje celu ani podświetlenia).

**B10. Kopia (Ctrl/Option) na wiersz „Root” w drzewie wysyła `"root"` jako
UUID.** A:2748-2756 → `copyItemsTo(state, keys, "root")` → `ops.copyItems`
(`p_target: "root"`, ops.js:71-74). `moveItemsTo` zamienia `"root"` na null
(A:1348), `copyItemsTo` nie. Skutek: błąd bazy → alert „moveFailed”.
Dodatkowo kopia w drzewie ignoruje strefę before/after i zawsze pulsuje root.

**B11. Przeciągnięcie folderu w drzewie na jego własną krawędź przesuwa go na
koniec rodzeństwa.** `reorderFoldersByDrop` A:1500-1513: przenoszony folder jest
usuwany z `baseIds`, więc `indexOf(targetId) === -1` → „fallback” dokleja na
koniec. Scenariusz: lekko poruszony folder upuszczony na górnej/dolnej ćwiartce
samego siebie.

**B12. Mieszane zaznaczenie (folder + pytanie) upuszczone „między” wierszami
drzewa: pytania są pomijane.** A:2782-2789 — gdy są foldery, idzie tylko
`reorderFoldersByDrop(cIds…)`; pytania zostają na miejscu bez komunikatu.

**B13. Linie before/after w drzewie rysują się na górze/dole CAŁEGO drzewa.**
`.is-drop-before::before`/`::after` są `position:absolute` (CSS:407-422), a
`.tree-row` nie ma `position:relative` (CSS:265-271); najbliższy przodek to
`.tree` (CSS:100-106). W liście działa, bo `td` ma `position:relative`.

**B14. Duplikuj nadpisuje schowek.** `duplicateSelected` A:1086-1097 woła
`copySelectedToClipboard`. Scenariusz: Ctrl+X na pytaniu, potem Ctrl+D na
innym, Ctrl+V → wkleja kopię duplikowanego elementu, wycięcie przepadło.

**B15. Shift+klik przesuwa anchor.** `selectRange` A:150, `selectTreeRange`
A:1797, `leftSelectRange` A:1901 ustawiają anchor na klikniętym. Scenariusz:
klik A, Shift+klik D (A–D), Shift+klik B → oczekiwane A–B, jest B–D.

**B16. Podwójny tap zawodzi, gdy przerwa między tapnięciami wynosi 180–300 ms.**
Pierwszy tap → `click` → `scheduleRenderList`/`scheduleRenderTree` po 180 ms
przebudowuje DOM; `addDoubleTap` porównuje `lastTarget === target` (M:136) —
węzeł jest już inny. Callback doubletap nie kasuje też timera. Testy e2e
(`simulateDoubleTap`) nie wysyłają `click`, więc tego nie łapią. Dodatkowo
wymóg „ten sam węzeł” odrzuca dwa tapnięcia w różne komórki tego samego wiersza.

**B17. Skróty reagują na autopowtarzanie klawisza.** Brak `e.repeat` i blokady
„w toku”: przytrzymany Ctrl+V/Ctrl+D (bez okna potwierdzenia) wysyła kilka
równoległych kopii; Ctrl+N — kilka pytań.

**B18. Skróty z `e.key` nie działają w układach niełacińskich.** Strona ma
`uk.js`; przy ukraińskim układzie Ctrl+C daje `e.key = "с"` → brak trafienia
w `MOD_SHORTCUTS` (A:3965). Na Macu Cmd+Option+R daje `e.key = "®"` → „r:alt”
nigdy nie pasuje. Rozwiązanie: `e.code` (`KeyC`…).

**B19. Reklamowane skróty zarezerwowane przez przeglądarkę.** Ctrl+N,
Ctrl+Shift+N, Ctrl+T (Chrome/Edge/Firefox na Win/Linux; ⌘N/⌘T na Macu) nie
trafiają do strony — a toolbar (R:277-280) i menu (CM:314, 324, 388) je podają.

**B20. Delete w META lub przez czytelnika pokazuje „nie można usuwać w
wyszukiwaniu”.** `onDeleteKey` A:3912-3915 zawsze daje `deleteInSearch`, choć
SEARCH jest dozwolony, a blokuje META lub rola.

**B21. Menu PPM na tle drzewa/wierszu Root: „Nowy folder” tworzy w bieżącym
folderze, nie w Root.** CM:306-319 bierze `state.folderId`. Scenariusz: jestem
w folderze A, PPM na „Root” w drzewie → Nowy folder → powstaje w A.

**B22. Czytelnik widzi aktywne „Usuń tagi” w widoku TAG.** CM:501 pomija
`canDeleteHere` w TAG, a `untagSelectedInTagView` (A:1526) cicho zwraca false.

**B23. PPM na tagu w przeglądaniu blokuje drzewo bez zmiany widoku.**
A:2398-2405 zaznacza tag „tylko do menu”, widok zostaje (przeglądanie), ale
`hasLeftSelection` = true → drzewo zablokowane (B4), podświetlony tag nie
odpowiada liście.

**B24. Menu kontekstowe nie zamyka się na Escape, przewinięcie, zmianę
rozmiaru ani po akcji z klawiatury.** Jedyne zamknięcie: `mousedown` poza
(A:3875). Escape czyści zaznaczenie, a otwarte menu ma `disabled` policzone dla
starego zaznaczenia, a akcje czytają nowe (np. Kopiuj na pustym).

**B25. Menu na telefonie w poziomie / niskich oknach nie mieści się.**
Ograniczenie `max-height:60vh` + przewijanie jest tylko w `@media (max-width:
900px)` (CSS:1728-1734). Telefon w poziomie (np. 915–932 × 412–430) dostaje
układ komputerowy: menu folderu (~15 pozycji × ~40 px) wyższe niż ekran,
`clamp` ustawia `top=8` i dół jest ucięty bez przewijania.

**B26. `dragstart` z drzewa przy blokadzie nie anuluje przeciągania.**
A:2653-2656 — alert, ale bez `e.preventDefault()`; przeciąganie trwa ze
starym `_drag.keys`, a upuszczenie na tag (`canTagDnD` = tylko canWrite)
przypisze tag nieaktualnemu zaznaczeniu. To samo grozi przy przeciąganiu
z zewnątrz (tekst/plik) na tag po wcześniejszym DnD z drzewa: `dragend` jest
tylko na liście, upuszczenie na tag nie czyści `_drag.keys`.

**B27. Enter, gdy fokus jest na przycisku.** Enter nie jest
blokowany, gdy fokus jest na przycisku (toolbar, okruszki): natywny klik
przycisku + otwarcie zaznaczonego folderu jednocześnie.

---

## 10. Ryzyka do sprawdzenia na urządzeniu **[RYZYKO]**

- R1. Przebudowa DOM w `dragstart` (lista A:2929-2932 `renderList`, drzewo
  A:2666-2669 `renderAll`) — w Chromium usunięcie/zmiana elementu źródłowego
  w `dragstart` potrafi natychmiast kończyć przeciąganie (`dragend`). Test
  e2e A:1165 spec używa syntetycznego DnD. Bezpieczniej: tylko przełączyć klasy.
- R2. iOS Safari po long-pressie może wysłać zgodnościowy `mousedown` przy
  puszczeniu palca → `document mousedown` (A:3875) zamknie świeżo otwarte menu.
- R3. Dwa palce na liście: `addLongPress` restartuje timer przy drugim
  `pointerdown` — przytrzymanie dwóch palców 500 ms otwiera menu zamiast ramki.
- R4. `navigator.platform` jest przestarzałe; iPad z klawiaturą raportuje
  „MacIntel” (tu akurat poprawnie traktowany jak Mac).
- R5. Ramki nie przewijają kontenera przy przeciąganiu poza krawędź.

---

## 11. Martwy kod **[MARTWE]**

- `js/history.js` — nigdzie nie importowany; `MOD_SHORTCUTS` `z`, `z:shift`, `y`
  (A:3953-3955) wołają nieistniejące `state._api.undo/redo` (ale robią
  `preventDefault`).
- `state.searchQuery` (S:82) — tylko zerowany (A:2101, 2348, 2500, 2570, 2867,
  2903), czytany w `getActiveTextQuery` (A:541) zawsze jako "".
- `modeKey === "root"` (A:2760) — `treeDrop.mode` nigdy nie ma wartości "root".
- `target.scope: "tree"` (A:2647, 3856) — CM go nie czyta.
- `state._drag.overKey` (A:1963, 1979, 1993) i `state._drag.mode` (A:2690,
  2946) — zapisywane, nieczytane (drop liczy modyfikator ponownie).
- `isCopy ? "copy" : "copy"` (A:2436) i samo wywołanie `isCopyDragModifier`
  w tagach.
- `tagSelection.anchorId`/`metaSelection.anchorId` — zapisywane, nieczytane.
- `api.refreshCategories` (A:3545) — nieużywane.
- Pozycje META w menu: Dodaj tag / Edytuj tag / Usuń — na stałe wyszarzone
  (CM:197-200).
- Gałęzie „odblokuj” w klik drzewa/tagów (A:2496-2504, A:2344-2350) —
  nieosiągalne myszą (B4).
- `isTouchDevice` eksportowane, używane tylko wewnątrz M.
- `state.selection.anchorKey = …` po `selectionSetSingle`/`selectionToggle` —
  redundantne (8 miejsc).
- Komentarz „Dblclick na pytanie: (na razie placeholder)” A:2843 i
  „w context-menu Duplikuj jest placeholderem” A:2208 — nieaktualne.

---

## 12. Co działa dobrze i trzeba zachować **[DOBRE]**

- Zasada PPM „niezaznaczony → zaznacz pojedynczo przed policzeniem `disabled`;
  zaznaczony → zostaw wielozaznaczenie” (CM:283-300) + test regresji.
- `renderList` zawsze odświeża toolbar (R:762-769) — przyciski nadążają za
  odznaczeniem (test e2e).
- `shortcutsBlocked` jako jedna bramka (okna, pola edycji, `.uni-modal`).
- `isTouchContextMenuWindow` jako wczesny guard w jedynym listenerze
  `contextmenu` (M:104-121) i anulowanie long-pressu ruchem >10 px /
  `pointercancel`.
- Drawer nie zamyka się po wyborze; mierzy wysokość toolbara przy każdym
  otwarciu; zamyka się przy wejściu arkusza (`modal-sheet:enter`).
- Ujednolicona kolejność i zakres meta+tagi (`leftItemsOrdered` A:1807) oraz
  przeliczanie widoku z jednego miejsca (`applyLeftFiltersView`).
- `suppressNextTagsClick` — wzorzec do przeniesienia na listę i drzewo (B3).
- Strefy before/into/after w drzewie, walidacja cyklu przed blokadami
  (`moveItemsTo` A:1353-1361, `reorderFoldersByDrop` A:1484-1494), blokady
  całych poddrzew i jedno odświeżenie `afterMutation`.
- Kopia z modyfikatorem zgodna z systemem (Mac Option, Win Ctrl), `dropEffect`
  pokazuje kursor kopii.
- `positionMenu` mierzy poza ekranem i przycina do okna; na ≤900 px menu
  przewijalne i z większymi celami dotyku.
- Pamięć rozwinięć drzewa w localStorage z przycinaniem usuniętych (S:21-54).
- `refreshList` z licznikiem sekwencji (`_refreshSeq`, A:476-478) chroni przed
  wyścigiem odświeżeń.

---

## 13. Propozycje porządkujące (skrót)

1. Jeden moduł „selection” z `selectSingle/toggle/range(orderedKeys)` (anchor
   nie przesuwany przez Shift), używany przez listę, drzewo i lewy panel.
2. Rozdzielić zaznaczenie drzewa i listy (jak w Eksploratorze) albo przy
   kliknięciu w jednym panelu czyścić klucze niewidoczne w drugim; przycinać
   zaznaczenie do widocznych kluczy w `refreshList`.
3. Jedna funkcja `openFolder(id, {from})` dla dblclick/doubletap/Enter/menu/
   okruszków z wyjściem z widoków wirtualnych.
4. Jedna tabela uprawnień akcji (`canDo(action, state)`) używana przez
   toolbar-render, toolbar-klik, menu i skróty.
5. Wspólna fabryka ramki (`createMarquee(container, rowsSelector, keyOf, onCommit)`)
   z tłumikiem kliknięcia.
6. Blokady: albo usunąć alert z `mousedown` (zostawić „odblokuj i działaj”),
   albo konsekwentnie blokować — nie obie naraz; strzałki drzewa nigdy nie
   blokować.
7. DnD: tło listy = bieżący folder; `copyItemsTo` z normalizacją `"root"`;
   null-guard `treeDrop`; `dragend` na drzewie; czyścić `_drag.keys` po każdym
   drop; `position:relative` dla `.tree-row`.
8. Skróty: `e.code`, `if (e.repeat) return`, blokada „w toku”, zamiana
   zarezerwowanych kombinacji (np. Alt+N / Shift+Alt+N, Alt+T), Escape zamyka
   menu i drawer.
