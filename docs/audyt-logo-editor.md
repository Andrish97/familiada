# Audyt edytora logo (`logo-editor.html` + `logo-editor/`)

Stan na commit `1006ea4`. Audyt tylko z lektury kodu — nic nie zostało zmienione.
Oznaczenia: **[pewne]** = wynika wprost z kodu; **[do potwierdzenia]** = bardzo
prawdopodobne, ale warto odtworzyć w przeglądarce przed poprawką.

## Rozmiar i struktura

| Plik | Linie | Co robi |
|---|---|---|
| `logo-editor/js/main.js` | 2135 | lista kafelków, modale (nowe/rename/import/eksport/podgląd), zapis do DB, nav guard, pinch-zoom podglądu, render „kropek” |
| `logo-editor/js/draw.js` | 3316 | tryb Rysunek (Fabric.js 5.3) → raster 208×88 → 150×70 bitów |
| `logo-editor/js/image.js` | 1153 | tryb Obraz: kadr 26:11, jasność/kontrast/gamma/dither → 150×70, upload do Storage |
| `logo-editor/js/text.js` | 254 | tryb Tekst: font 3×10 → 30×10 znaków (GLYPH) |
| `logo-editor/logo-editor.css` | 1371 | |

Formaty zapisu (`user_logos.payload`):
- `GLYPH_30x10`: `{ layers:[{color,rows[10]}], source:{mode:"TEXT", text} }`
- `PIX_150x70`: `{ w,h,format,bits_b64, source:{ mode:"DRAW"|"IMAGE", ... } }`
  - DRAW: `fabricData` (JSON Fabrica), `editHistory` (cały stos undo/redo!), `bg`, `toolSettings`
  - IMAGE: `imageUrl` / `imageData` (base64), `crop{v:2,x,y,w}`, suwaki

---

## P0 — utrata / uszkodzenie danych

### 1. IMAGE: drugi zapis w tej samej sesji zapisuje `blob:` URL zamiast obrazu **[pewne]**
`image.js:1060` + `image.js:1132`. Po pierwszym zapisie nowego pliku
`imgFileObj = null`, ale `imgPreview.src` dalej wskazuje na lokalny `blob:…`.
Przy kolejnym „Zapisz” (np. po poruszeniu suwakiem) `source.imageUrl =
imgPreview.src` → do bazy trafia `blob:https://…`, który po zamknięciu karty
nie istnieje. Przy następnej edycji obraz się nie wczyta, a zapis wyzeruje logo
(p. 2). Plik w Storage staje się sierotą (usuwanie w `deleteLogo` szuka
`/user-logos/<uid>/` w URL).
**Scenariusz:** wybierz obraz → Zapisz → zmień jasność → Zapisz → zamknij → Edytuj → pusto.
**Poprawka:** po uploadzie trzymać publiczny URL w stanie modułu (`currentImageUrl`)
i tylko jego używać w `source.imageUrl`; nigdy nie czytać `imgPreview.src`.

### 2. IMAGE: zapis zanim obraz się wczyta (albo gdy się nie wczyta) zeruje logo **[pewne]**
`image.js:1012-1035`, `1045-1063`. `open()` ustawia `imgObj = null` i puste
bity, obraz ładuje się asynchronicznie. Jeśli użytkownik kliknie „Zapisz”
wcześniej — albo obraz nie wczyta się wcale (usunięty plik, `blob:` z p. 1,
CORS) — zapisuje się pusta bitmapa i `imageUrl: null`. Oba `onerror`
(`image.js:957-970`, `986-988`) są ciche: brak komunikatu dla użytkownika.
**Poprawka:** zapamiętać `source` z otwarcia i dopóki obraz nie jest gotowy,
zwracać go bez zmian (albo blokować „Zapisz”); przy błędzie wczytania pokazać
komunikat i nie nadpisywać bitów.

### 3. DRAW: rysunek zapisany w pikselach ekranu, bez rozmiaru „świata” **[pewne]**
`draw.js:1084-1101`, `1172-1193`, `3288-3307`. Świat = rozmiar canvasa na
ekranie (zależy od szerokości okna). `fabricData` zapisuje współrzędne w tych
pikselach, ale **nie zapisuje `worldW/worldH`**. Przy otwarciu na innym
ekranie / w innym rozmiarze okna `resizeScene()` skaluje względem *bieżącego*
świata (`oldW === newW`), więc obiekty zostają w starej skali: wychodzą poza
scenę albo zajmują jej część. Podgląd i ponowny zapis dają inną bitmapę niż
oryginał. Prawdopodobnie główne źródło „losowych” błędów rysunku.
Dodatkowo `scaleAllObjects` przy zmianie rozmiaru okna nie skaluje stosu
undo — cofnięcie po resize przywraca obiekty w starej skali.
**Poprawka:** stały układ współrzędnych świata (np. 1040×440 = 26:11) i
skalowanie tylko przez `viewportTransform`; przy wczytaniu starych zapisów bez
rozmiaru — heurystyka z bounding boxa / `clipPath` w `fabricData`.

### 4. TEXT: edycja logo bez `source.text` kasuje treść **[pewne]**
`text.js:216-232`, `main.js:621-623`. Import pliku GLYPH bez `source` ustawia
`source: { mode: "TEXT" }` bez `text`. Przycisk „Edytuj” to przepuszcza
(`main.js:2000` sprawdza tylko istnienie `source`), edytor startuje z pustym
polem i pustym podglądem, a „Zapisz” nadpisuje logo pustymi wierszami.
**Poprawka:** gdy brak `source.text`, nie pozwalać edytować w trybie TEXT
(albo otwierać podgląd istniejących `rows` i ostrzegać, że zapis je zastąpi).

### 5. DRAW: zmiany w ustawieniach obiektu nie ustawiają „niezapisanych zmian” **[pewne]**
`draw.js:299-360` (tekst) i `414-447` (kształty). Zmiana koloru, grubości,
fontu, B/I/U, wyrównania nie woła `ctx.markDirty()` ani `schedulePreview()`.
Skutek: podgląd nie odświeża się, a zamknięcie edytora **nie pyta** o
niezapisane zmiany → zmiany przepadają.


### 5b. DRAW: na ekranach Retina/HiDPI zapisuje się ćwiartka rysunku **[pewne, potwierdzone]**
`draw.js:2112` (`renderWorldTo208x88CanvasStable`). Pomocniczy `fabric.StaticCanvas`
ma domyślnie `enableRetinaScaling`, więc przy `devicePixelRatio = 2` (każdy Mac,
większość laptopów i tabletów) jego canvas ma 416×176 zamiast 208×88, a kod
odczytuje `getImageData(0, 0, 208, 88)` -- czyli lewą górną ćwiartkę sceny
powiększoną 2×. Potwierdzone na starym edytorze: prostokąt w prawej dolnej
części sceny daje 2380 zapalonych kropek przy DPR 1 i **0** przy DPR 2.
**Poprawka:** `enableRetinaScaling: false` przy StaticCanvas (jedna linia).

---

## P1 — błędy funkcjonalne

### 6. DRAW: skróty L / R / O / P / U / F wywalają edytor **[pewne]**
`draw.js:2884-2890`, `2991-3007`. `TOOL.LINE`, `TOOL.RECT`, `TOOL.ELLIPSE`,
`TOOL.POLY` nie istnieją (w `TOOL` jest tylko `SHAPES`). `setBaseTool(undefined)`
→ `tool = undefined` → `renderToolSettings()` rzuca
`TypeError: tool.toLowerCase` (`draw.js:139`). Narzędzie zostaje „żadne”, rysowanie
przestaje działać do kliknięcia przycisku. Jednocześnie tooltipy obiecują
skróty **S** (kształty) i **T** (tekst), których nie ma w `onKeyDown`.

### 7. DRAW: po Cofnij/Ponów obiekty przestają być zaznaczalne **[pewne]**
`draw.js:1681-1702`. `restoreFrom()` ustawia `selectable=false` wszystkim
obiektom bez `_canHaveFill` (pędzel, tekst, linia, prostokąt, elipsa…) i nie
woła `applyToolBehavior()`. W narzędziu Zaznacz po undo nie da się ich chwycić,
dopóki nie przełączy się narzędzia.

### 8. DRAW: zmiany właściwości tekstu psują historię undo **[pewne]**
`draw.js:302-353`. Model stosu: wierzchołek = stan bieżący, `pushUndo()` po
zmianie. W ustawieniach tekstu `pushUndo()` jest wołane **przed** `obj.set()`
(deduplikacja je pomija), więc nowy stan nigdy nie trafia na stos — „Cofnij”
cofa dwa kroki naraz, „Ponów” nie przywraca zmiany. Przy kształtach
(`414-447`) kolejność jest poprawna — niespójność. Pole `input` wrzuca też
snapshot przy każdym znaku/kliknięciu strzałki.

### 9. DRAW: usuwanie wielu obiektów = wiele kroków undo **[pewne]**
`draw.js:2482-2487` (`object:removed` → `pushUndo`) + pętle `remove()` w
Wyczyść (`3151`), Delete (`3046`), `deleteSelection`. Każdy obiekt to osobny
wpis — „Wyczyść” na 50 kreskach wymaga 50× Cofnij.

### 10. DRAW: duplikowanie zaznaczenia wielu obiektów **[do potwierdzenia]**
`draw.js:2348-2380`. Są **dwie** funkcje `duplicateSelection` — działa druga
(`async`). Dla `activeSelection` klony mają współrzędne względem środka grupy,
a kod dodaje je do canvasu bez `setActiveObject(cloned)` → lądują w lewym
górnym rogu. Lista `propertiesToInclude` pomija `_canHaveFill` i
`strokeDashArray`/`strokeUniform`, więc duplikat traci możliwość wypełnienia.

### 11. Zmiana nazwy: pusta nazwa blokuje przycisk „Zapisz” na zawsze **[pewne]**
`main.js:1246-1256`. `btnOk.disabled = true`, potem `return` **przed** `try`,
więc `finally` się nie wykona. Do przeładowania strony modal jest martwy.

### 12. Zapis: nieskończona pętla przy kolizji nazwy **[pewne, rzadkie]**
`main.js:1777-1790`. Komentarz twierdzi, że rekurencja „wchodzi raz”, ale nie ma
żadnej flagi. Jeśli nazwa koliduje z logo, którego nie ma w lokalnej liście
(np. utworzone w innej karcie), `makeUniqueName` zwraca tę samą nazwę →
`handleCreate()` w kółko wysyła zapytania. Brak też blokady podwójnego
kliknięcia „Zapisz”.

### 13. Blokada logo wycieka na wąskim ekranie **[pewne]**
`main.js:2021-2031` → `openEditor` `1607-1612`. Najpierw `guardResourceLock()`
zakłada blokadę, dopiero potem `openEditor()` odmawia na ≤980 px i wychodzi
bez `release()`. Logo zostaje „edytowane w innej karcie” do zamknięcia strony
(heartbeat działa dalej).

### 14. Eksport: błędy połykane, overlay znika przed końcem **[pewne]**
`main.js:1977-1991`. `exportLogoToFile(l)` jest `async`, ale wołane bez
`await` → `try/catch` nic nie łapie, pasek skacze do 100 % i znika, zanim
obraz z URL zostanie pobrany. Nazwa pliku: `/[^\w\d\- ]+/` wycina polskie i
ukraińskie litery („Żółw” → „w”, cyrylica → nazwa domyślna).

### 15. IMAGE: upload bez walidacji, sieroty w Storage **[pewne]**
`image.js:1066-1137`.
- Brak sprawdzenia rozmiaru (bucket ma limit 5 MB) i typu (`accept="image/*"`
  wpuszcza HEIC/BMP/AVIF, bucket nie) → niezrozumiały błąd z Supabase.
- Każda zmiana obrazu = nowy plik, stary nigdy nie jest usuwany.
- `createBucket()` z klienta (`1086`) — nie zadziała bez uprawnień admina, do usunięcia.
- Po uploadzie 2 zbędne zapytania diagnostyczne (`list` + `HEAD`, `1102-1130`).
- Gdy obraz pochodzi z `data:` (demo/import), ten sam base64 trafia do bazy
  **dwa razy** (`imageUrl` i `imageData`).

### 16. Wylogowanie z niezapisanymi zmianami — martwy guard **[pewne]**
`main.js:1884-1893`. Element `#topbar-account-logout` nie istnieje
(`topbar-controller.js` go nie tworzy), więc guard nigdy się nie podpina.
Gdyby się podpiął — po potwierdzeniu `btnLogoutMenu.click()` wywołałby ten sam
handler ponownie (pętla potwierdzeń).

### 17. Nav guard i przycisk „Wstecz” **[pewne]**
`main.js:400-447`. Przy starcie dopychany jest dodatkowy wpis historii — gdy nie
ma niezapisanych zmian, pierwsze „Wstecz” nic nie robi (trzeba dwa razy).
Po potwierdzeniu wyjścia edytor jest zamykany, a kotwica odbudowywana — z
edytora nie da się „cofnąć” do poprzedniej strony, tylko do listy.

---

## P2 — wydajność i odporność

18. **Lista pobiera pełne payloady** (`main.js:1077-1084`, `select(...payload)`):
    dla DRAW to `fabricData` + **cała historia undo/redo** (do 200 pełnych
    snapshotów canvasu), dla IMAGE często base64 obrazu. Miniatury potrzebują
    tylko `bits_b64`/`rows`. Przy kilku rysunkach lista może ważyć megabajty.
19. **`editHistory` w bazie** (`draw.js:3302`) — pomysł wątpliwy: rozdmuchuje
    wiersz, a po zmianie rozmiaru sceny (p. 3) i tak jest niespójna. Proponuję
    nie zapisywać historii (albo ograniczyć do kilku kroków).
20. `pushUndo()` robi `JSON.stringify` całego canvasu przy każdej operacji (i
    przy każdym obiekcie usuwanym gumką) — przy dużych rysunkach odczuwalne.
21. Każdy podgląd DRAW tworzy nowy `fabric.StaticCanvas` bez `dispose()` (`draw.js:2112`).
22. Szkic wielokąta / rysowany kształt w trakcie trafia do `fabricData`, jeśli
    kliknie się „Zapisz” w połowie (`getCreatePayload` nie czyści `polyPreview`/`drawingObj`).
23. Trzymanie Spacji/Ctrl + utrata fokusu okna → narzędzie tymczasowe „zawiesza się” (brak `blur` resetu).
24. Kliknięcie w istniejący tekst narzędziem Tekst oznacza logo jako zmienione
    i dodaje wpis undo, choć nic się nie zmieniło (`draw.js:2595-2597`).
25. IMAGE: przy imporcie z JSON `source.gamma` jako string → `.toFixed` rzuca (`image.js:1004-1005`).
26. TEXT: lista „Dozwolone znaki” ukrywa cyrylicę poza językiem UK, ale
    kompilator ją przyjmuje (`text.js:26-31` vs `69-86`) — niespójne.

## P3 — czytelność (główny powód „nieczytelności”)

### Martwy kod (do usunięcia bez zmiany zachowania)
- `main.js`: `progOpen/progClose/progSet/progReset` (odwołują się do
  niezdefiniowanych `logoImportSub`, `logoExportSub`, `logoExportStep`,
  `logoExportCount` — rzuciłyby `ReferenceError`), loader TinyMCE,
  `btnCreateOk` w `createNewLogoWithType`, `guestMode`, `hint`,
  `sessionSavedMode`, `getThreshold/getDither` w ctx, pusty blok „folder
  pusty” w `deleteLogo`, drugi `closeLogoImportModal`, `selectedKey === "default"`, `"__add__"`.
- `draw.js`: pierwsza `duplicateSelection`, `toggleFg` (niezdefiniowane `fg`),
  `cycleShapeTool`, `toolHasSettings`, `toolLabel`, `svgPathToArray` (duplikat
  `svgPathToPath`), `showOverlayCursor`, `currentTool`, `shapePicker`
  (`#shapePicker` nie istnieje) + `updateShapePickerIcon` (niezdefiniowana),
  zmienne `strokeWidth/eraserSize/fillEnabled/fillColor/currentLineStyle`,
  `toolSettings.TEXT.fontSize`, `window.__drawFabric`/`__drawDbg`, `TOOL.POLY` w `applyToolBehavior`.
- `image.js`: `DEFAULTS.contain`, `#imgStageHost` w HTML.

### Duplikacja
- Render „kropek” 30×10 (`calcBigLayout`, `drawDot`, `renderBits150x70ToBig`)
  jest w `main.js` **i** `image.js`; bitpack/unpack i `rows30x10ToBits150`
  w `main.js` **i** `js/core/logo-preview.js`. Jedno źródło → `logo-preview.js`.
- `show()` zdefiniowane 4× (różne semantyki: `hidden` vs `display`).
- Budowanie `f.Path` z tymi samymi opcjami powtórzone 4× w `startFigure/updateFigure`.
- Obsługa „kliknij poza” — 4 różne globalne nasłuchy (`pointerdown`,
  `mousedown`, `click`) na `document`/`window`, dodawane przy init i nigdy zdejmowane.

### Niespójności i i18n
- Teksty na sztywno po polsku: `draw.js:231-240` („Roz.”, „Linia”, „Odst.”,
  „Kolor”, „Font”), tooltipy „(przytrzymaj)”, „Spacja”, HTML „Szukaj fontu…”,
  „Brak wyników”. Rozmiar tekstu używa klucza `radiusLabel`.
- Nagłówek edycji zawsze „Nowe logo — …”, także przy edycji istniejącego.
- Style inline w HTML/JS (modale importu/eksportu, font picker, tooltipy kształtów).
- Przepływ „nowe logo”: modal nazwy od razu wstawia **pusty wiersz** do bazy i
  nie otwiera edytora — trzeba zaznaczyć kafelek i kliknąć Edytuj. Ścieżka
  „pierwszy zapis w edytorze” (`createLogo` w `handleCreate`) jest przez to
  praktycznie martwa.
- Brak testów e2e/unit dla edytora logo.

---

## Proponowany plan dalszej pracy

1. **Kopia do testów**: `logo-editor2.html` + `logo-editor2/` (jak
   `control2`/`display2`), ta sama tabela `user_logos` — produkcja nietknięta.
   Testy na kopii przez Playwright (jest skonfigurowany w `tests/`).
2. **Najpierw P0** (1-5) — małe, punktowe poprawki, każda z testem e2e.
3. **Potem P1** (6-17).
4. **Porządki P3** w osobnych commitach (tylko usuwanie/scalanie, bez zmiany
   zachowania): martwy kod → wspólny render do `logo-preview.js` → podział
   `draw.js` na moduły (`draw/tools.js`, `draw/shapes.js`, `draw/history.js`,
   `draw/raster.js`, `draw/settings-ui.js`) i `main.js` (`list.js`,
   `import-export.js`, `db.js`, `preview-zoom.js`).
5. **P2 / format danych** (stały świat DRAW, bez `editHistory` w bazie, lżejsza
   lista) — wymaga migracji odczytu starych zapisów, więc na końcu.
6. Po weryfikacji na kopii — przeniesienie na `logo-editor.html`.

---

## Stan: `logo-editor2` (kopia z poprawkami)

Strona `logo-editor2.html` + `logo-editor2/` -- nic do niej nie linkuje, stary
`logo-editor` działa bez zmian. Wspólne pliki zmienione tylko addytywnie:
nowe klucze w `translation/*.js` (plus usunięte zdublowane „T” z podpowiedzi
narzędzia Tekst).

Kod (~6860 -> ~3830 linii):

| Moduł | Rola |
|---|---|
| `main.js` | lista, modale, otwieranie edytorów, zapis, historia przeglądarki |
| `db.js` | `user_logos` (lekka lista bez ciężkiego payloadu) + pliki w Storage |
| `transfer.js` | eksport/import `.famlogo` |
| `render.js` | format bitów PIX i podgląd „kropek” (jedna kopia zamiast trzech) |
| `preview-zoom.js` | pinch-zoom pełnoekranowego podglądu (przeniesiony bez zmian) |
| `text.js` | tryb Tekst (wynik kompilacji identyczny ze starym -- sprawdzone na 209 napisach) |
| `image.js` | tryb Obraz |
| `draw.js` + `draw/shapes.js`, `draw/raster.js` | tryb Rysunek |

Załatwione: wszystkie punkty P0 (1–5, 5b) i P1 (6–17), z P2: 18, 19, 21–25.
Zmiany zachowania wynikające z poprawek:
- nowe logo powstaje w bazie przy pierwszym „Zapisz” (wcześniej od razu pusty wiersz),
- „Wstecz” w przeglądarce w edytorze zamyka edytor (z pytaniem o zmiany),
- pasek szerokości/ostrzeżeń w trybie Tekst widoczny od razu (wcześniej schowany pod „Dozwolone znaki”),
- rysunki zapisują się w stałym świecie 1040×440 (stare przeliczane przy otwarciu po `clipPath`),
  historia Cofnij/Ponów nie jest już zapisywana w bazie,
- skróty: V, H, B, E, S, T, L/R/O/P (kształty), U (następny kształt), F (wypełnienie), [ ] (grubość),
- obraz: tylko JPG/PNG/GIF/WEBP do 5 MB; podmieniony plik jest usuwany ze Storage po zapisie.

Testy: `tests/e2e/logo-editor2.spec.js` (18 scenariuszy, konto test1@) --
odpalane przez „E2E Tests (Playwright)” z `spec_filter: e2e/logo-editor2.spec.js`
na gałęzi. `helpers/local-site.js` serwuje kod z checkoutu lokalnie w runnerze
i przenosi sesję z produkcji, więc test sprawdza kod gałęzi na prawdziwym
backendzie bez wdrażania.

Przeniesienie na produkcję: podmienić `logo-editor/` i `logo-editor.html`
zawartością kopii (ścieżki `logo-editor2/` -> `logo-editor/`) i przepiąć spec
na `/logo-editor`.
