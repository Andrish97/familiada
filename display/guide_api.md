# Guide API – ekran „display” Familiady

Ten dokument opisuje **aktualne API sterowania stroną display**:

- tryby globalne strony (`APP`: `GAME / QR / BLACK_SCREEN`),
- tryby sceny (duży wyświetlacz 30×10: `LOGO / ROUNDS / FINAL / WIN / BLANK`),
- API JS (`scene.api`, `app`),
- komendy tekstowe (`handleCommand("...")`),
- animacje (`edge`, `matrix`, opcjonalne `pixel`),
- snapshot/restore stanu ekranu,
- INDICATOR (lampki A/B).

Jest to zgodne z aktualnym `scene.js` i routerem komend w `commands.js`:
- **APP** steruje *całą stroną* (GAME vs QR vs BLACK_SCREEN),
- **scene** działa **tylko w APP=GAME** i steruje dużym i małymi wyświetlaczami.

---

## 0. Poziomy sterowania: APP vs scene

### 0.1 APP – tryb globalny strony

APP decyduje **co ogólnie widzi widz**:

- `GAME` – scenografia SVG (podłoga, tło) + duży wyświetlacz 30×10 + małe wyświetlacze + INDICATOR.
- `QR` – czarny ekran + 2 kody QR (host, przycisk).
- `BLACK_SCREEN` – czarny ekran, bez QR.
- `BLACK` – alias `BLACK_SCREEN` (tylko jako wartość, nie komenda).

APP ustawiamy:
- albo komendą tekstową (`APP ...`),
- albo bezpośrednio przez `app.setMode("GAME" | "QR" | "BLACK_SCREEN")`.

Scena (LOGO/ROUNDS/FINAL/WIN/BLANK) działa **tylko**, gdy `APP = GAME`.

---

### 0.2 scene – tryb „dużego wyświetlacza”

Gdy APP = GAME, scena ma własny tryb wewnętrzny:

- `BLANK`
- `LOGO`
- `ROUNDS`
- `FINAL`
- `WIN`

Za to odpowiada `scene.api.mode`.

---

## 1. Obiekty globalne po starcie

Po załadowaniu frontu (main.js) mamy:

- `window.app` – kontroler APP + QR + powiązanie z Supabase.
- `window.scene` – wynik `await createScene()`, czyli:
  ```js
  {
    api,        // scene.api – całe API JS
    BIG_MODES,  // stałe trybów sceny
    handleCommand, // lokalny parser komend sceny (tylko w APP=GAME)
  }
  ```
- `window.handleCommand(line)` – **główny router komend tekstowych**:
  - komendy `APP ...` i `QR ...` obsługuje globalnie,
  - wszystko inne przepycha do `scene.handleCommand`, **po wymuszeniu APP=GAME**.

Szybki sanity check w konsoli:

```js
typeof app          // "object"
typeof scene        // "object"
typeof handleCommand // "function"
```

---

## 2. API APP (globalne)

### 2.1 Ustawianie trybu strony

```js
app.setMode("GAME");
app.setMode("QR");
app.setMode("BLACK_SCREEN");
// alias:
app.setMode("BLACK");
```

### 2.2 QR (linki do hosta i przycisku)

```js
app.qr.setHost("https://example.com/host");
app.qr.setBuzzer("https://example.com/buzzer");
```

W APP=QR te adresy są rysowane jako dwa kody QR.

---

## 3. API sceny – ogólnie

```js
const { api, BIG_MODES, handleCommand } = scene;
```

### 3.1 Tryb sceny

```js
api.mode.get(); // "BLANK" | "LOGO" | "ROUNDS" | "FINAL" | "WIN"

await api.mode.set("ROUNDS", { animIn: { type:"edge", dir:"top", ms:180 } });
```

Parametry `animIn` – pełne wyjaśnienie w sekcji „Animacje”.

Zasady:

- `BLANK` – czyści duży wyświetlacz, nie rysuje nic więcej.
- `LOGO` – przygotowuje scenę pod logo (ale samo logo rysujemy przez `api.logo.show()` / `draw()`).
- `ROUNDS` – tryb rund: 6 wierszy odpowiedzi + SUMA z adaptacyjnym wierszem.
- `FINAL` – tryb finału: 5 wierszy + SUMA w stałym wierszu.
- `WIN` – tryb „zwycięstwo”: duże cyfry środka.

---

## 4. Duży wyświetlacz 30×10 – API low‑level (`api.big`)

### 4.1 Podstawowe operacje

```js
api.big.clear();                 // czyści cały 30x10
api.big.clearArea(1,1,30,10);   // czyści wycinek
api.big.put(5, 3, "A");         // rysuje pojedynczy znak (kol=5, wiersz=3)
```

Koordynaty są **1‑based**: kolumny 1..30, wiersze 1..10.

### 4.2 Gotowe obszary

```js
api.big.areaAll();   // { c1:1, r1:1, c2:30, r2:10 }
api.big.areaLogo();  // { c1:1, r1:3, c2:30, r2:7 }
api.big.areaWin();   // { c1:1, r1:2, c2:30, r2:8 }
```

---

## 5. Animacje dużego wyświetlacza (`api.big.animIn` / `animOut`)

### 5.1 Ogólna sygnatura

```js
await api.big.animIn({
  type: "edge" | "matrix",
  dir,   // tylko dla edge
  axis,  // tylko dla matrix
  ms,    // docelowy czas animacji w ms
  area,  // opcjonalnie: { c1,r1,c2,r2 }, domyślnie areaAll()
  opts,  // opcjonalnie: szczegóły wariantu pixelowego
});

await api.big.animOut( ... ); // analogicznie
```
---

### 5.2 Jak interpretowane jest `ms`

**`ms` traktujemy jako docelowy czas trwania animacji dla całego bloku** (np. całego 30×10 lub wycinka), niezależnie od rozmiaru tego bloku.

Pod spodem animator:

- liczy liczbę kroków animacji,
- dzieli `ms` przez liczbę kroków, żeby wyliczyć opóźnienie między krokami,
- dla bardzo małych wartości `ms` przeglądarka (szczególnie Edge) **i tak** ogranicza minimalne opóźnienie `setTimeout` (typowo ~4 ms), więc przy skrajnie małych `ms` *realny* czas będzie większy niż zadany.

Ważne:

- `ms` jest **tym samym parametrem** dla animacji kafelkowej i pixelowej,
- niezależnie od tego, czy area to 1×1 czy 30×10 – przy tym samym `ms` target jest „jednakowy czas dla całego bloku” (różnice mogą wynikać tylko z klampowania przeglądarki i ilości ciężkiej roboty w każdym kroku).

---

### 5.3 Typy animacji

#### 5.3.1 `type: "edge"`

Animacja „od krawędzi”, kafelkowa (opcjonalnie pixelowa w środku kafla).

- kierunek (`dir`): `"left" | "right" | "top" | "bottom"`.

Przykład:

```js
await api.big.animIn({
  type: "edge",
  dir:  "left",
  ms:   200,
});
```

Opcje pixelowe – patrz sekcja 5.5.

---

#### 5.3.2 `type: "matrix"`

„Zasłona” wierszami/kolumnami, kafelkowa (opcjonalnie pixelowa).

- oś (`axis`): `"down" | "up" | "left" | "right"`.

Przykład:

```js
await api.big.animOut({
  type: "matrix",
  axis: "down",
  ms:   180,
});
```

---

### 5.4 Wariant `pixel` – wewnątrz kafelków 5×7

Dla obu typów (`edge` i `matrix`) możesz włączyć tryb pixelowy:

- **dla komend tekstowych** – słowo `pixel` po ms:
  - `ANIMIN edge left 200 pixel`
  - `ANIMOUT matrix down 150 pixel`
- **dla API JS** – `opts.pixel = true`:

```js
await api.big.animIn({
  type: "edge",
  dir:  "left",
  ms:   200,
  opts: {
    pixel: true,
    pxBatch: 8,     // opcjonalnie – ile pikseli na krok
    stepPxMs: 2,    // opcjonalnie – minimalny odstęp między batchami pikseli
    tileMs: 0,      // opcjonalnie – pauza po ukończeniu kafla
  },
});
```

W trybie `pixel`:

- kolejność pikseli w kafelku jest spójna z kierunkiem (od góry, od dołu, itp.),
- `ms` dalej oznacza **czas pojawiania się całego bloku**, a nie jednego kafla,
- parametry w `opts` pozwalają „doszlifować” wrażenie (czy widać przebieg po pikselach, czy prawie wszystko naraz).

---

### 5.5 Różnica edge vs matrix (praktyczna)

- `matrix` – ma mniej kroków (wiersze/kolumny), więc **łatwiej trafia w zadane `ms`**.
- `edge` – przechodzi po kafelkach „po krawędzi”, więc kroków jest więcej. Przy bardzo małych `ms` realny czas może odbiegać od targetu przez ograniczenia `setTimeout` w przeglądarce.

W skrócie: **`ms` to target**, a środowisko JS próbuje go „udźwignąć”. Przy rozsądnych wartościach (200–500 ms) jest to najbardziej przewidywalne.

---

## 6. Małe wyświetlacze (`api.small`)

### 6.1 Trzy „potrójne” (po 3 kafle 5×7) – cyfry

```js
api.small.topDigits("123");
api.small.leftDigits("045");
api.small.rightDigits("999");
```

Zasady:

- przyjmują string, wszystko poza cyframi → spacja,
- 3 miejsca, reszta ignorowana.

### 6.2 Dwa długie panele (95×7) – tekst max 15 znaków

```js
api.small.long1("FAMILIADA");
api.small.long2("SUMA 000");
```

Zasady:

- tekst konwertowany do UPPERCASE,
- max 15 znaków (reszta ucinana),
- tekst centrowany w poziomie,
- między literami jest 1 kolumna przerwy.

### 6.3 Czyszczenie wszystkich małych

```js
api.small.clearAll();
```

Ustawia:

- potrójne – na spacje,
- długie – na pusto.

---

## 7. LOGO (`api.logo`)

Logo rysowane jest w obszarze 30×5 kafli:

- wiersze 3..7,
- kolumny 1..30.

### 7.1 API

```js
await api.logo.load("./logo_familiada.json"); // ładuje JSON do pamięci
api.logo.set(json);                           // jeśli chcesz wstrzyknąć własny obiekt
api.logo.draw();                              // rysuje logo bez animacji
await api.logo.show(animIn?);                 // tryb LOGO + rysowanie + animacja wejścia
await api.logo.hide(animOut?);                // animacja wyjścia (bez zmiany trybu sceny)
```

Domyślne animacje w środku:

- `show` → edge left, ms=14, tylko areaLogo()
- `hide` → edge right, ms=14, tylko areaLogo()

Przykład:

```js
await api.mode.set("LOGO");
await api.logo.load("./logo_familiada.json");
await api.logo.show({
  type: "matrix",
  axis: "down",
  ms: 250,
});
```

### 7.2 Format `logo_familiada.json`

```json
{
  "layers": [
    {
      "color": "main",      // "main" | "top" | "left" | "right"
      "rows": [
        "..............................",
        "..............................",
        "..............................",
        "..............................",
        ".............................."
      ]
    }
  ]
}
```

Zasady:

- `rows` musi mieć 5 stringów (za mało → dopełnienie spacjami, za dużo → ucięte),
- każdy string docelowo 30 znaków (dopełnianie/ucinanie),
- spacja `" "` = brak znaku,
- `color` wybiera kolor z `LIT`: `"main"`, `"top"`, `"left"`, `"right"`.

---

## 8. WIN (`api.win`)

Duży numer zwycięstwa, rysowany w obszarze:

- wiersze 2..8,
- kolumny 1..30.

### 8.1 API

```js
await api.win.set("01234", {
  animOut: { type:"edge",   dir:"right", ms:200 },
  animIn:  { type:"matrix", axis:"down", ms:250 },
});
```

Zasady:

- liczba jest czyszczona do cyfr (`0-9`),
- max 5 cyfr – jeśli więcej, bierzemy 5 ostatnich,
- cyfry są rysowane na podstawie `font_win.json`, „ściśle” (bez stałego odstępu),
- całość centrowana poziomo.

---

## 9. ROUNDS (`api.rounds`)

Układ:

- 6 wierszy odpowiedzi, wiersze (tile-row): 2,3,4,5,6,7.
- w każdej linii:
  - numer rundy: kol=5 (1 znak),
  - tekst odpowiedzi: kol=7..23 (17 znaków, do lewej),
  - punkty: kol=25..26 (2 znaki, do prawej).
- SUMA:
  - etykieta „SUMA”: kol=19..22,
  - wartość SUMA: kol=24..26 (3 znaki, do prawej),
  - wiersz SUMY „wędruje w dół” w zależności od ostatniego niepustego wiersza.

### 9.1 Zasada numerów

Numer wiersza (1–6) jest widoczny **tylko jeśli**:

- tekst odpowiedzi lub punkty w tej linii są niepuste po `trim()`.

Czyli wyczyszczenie tekstu i punktów automatycznie „gasi” numer.

---

### 9.2 API pojedynczych pól

```js
// tekst
await api.rounds.setText(2, "ODPOWIEDZ", {
  animOut: { type:"edge",   dir:"right", ms:200 },
  animIn:  { type:"matrix", axis:"down", ms:180 },
});

// punkty
await api.rounds.setPts(2, "25", {
  animOut: { type:"edge", dir:"left", ms:150 },
  animIn:  { type:"edge", dir:"left", ms:150 },
});

// tekst + punkty naraz
await api.rounds.setRow(3, {
  text: "TRZECIA",
  pts:  "10",
  animOut: { type:"matrix", axis:"down", ms:200 },
  animIn:  { type:"matrix", axis:"down", ms:200 },
});

// SUMA
await api.rounds.setSuma("120", {
  animOut: { type:"edge", dir:"right", ms:200 },
  animIn:  { type:"edge", dir:"left",  ms:200 },
});

// X-y
api.rounds.setX("1A", true);
api.rounds.setX("1A", false);
```

Ograniczenia:

- `idx` – 1..6,
- tekst:
  - ucinany do 17 znaków,
  - wyświetlany w UPPERCASE,
- punkty:
  - wyrównane do prawej w 2 miejscach,
  - np. `"5"` → `" 5"`, `"123"` → `"23"`,
- SUMA:
  - wyrównana do prawej w 3 miejscach,
  - wiersz SUMA przeliczany przy każdej zmianie odpowiedzi/punktów.

X-y:

- dostępne klucze: `1A`, `2A`, `3A`, `1B`, `2B`, `3B`,
- każdy X to blok 3×3 kafli z dużym krzyżykiem.

---

### 9.3 API batch – `setAll`

Jeśli chcesz jedną animacją wprowadzić całą planszę ROUNDS:

```js
await api.rounds.setAll({
  rows: [
    { text:"PIERWSZA", pts:"10" },
    { text:"DRUGA",    pts:"25" },
    { text:"TRZECIA",  pts:"05" },
    { text:"",         pts:"00" },
    { text:"PIATA",    pts:"30" },
    { text:"SZOSTA",   pts:"15" },
  ],
  suma: "120",
  animOut: { type:"edge",   dir:"right", ms:220 },
  animIn:  { type:"matrix", axis:"down", ms:260 },
});
```

W środku:

1. Jeśli `animOut` podany → `api.big.animOut` na **całym obszarze** 30×10.
2. Wszystkie wiersze i SUMA są wpisywane „na sztywno” (bez per‑pole animacji).
3. Jeśli `animIn` podany → `api.big.animIn` na całym 30×10.

---

## 10. FINAL (`api.final`)

Układ:

- wiersze 2..6 (5 wierszy),
- w każdej linii:
  - lewy tekst: kol=1..11 (11 znaków, do lewej),
  - A: kol=13..14 (2 znaki, do prawej),
  - B: kol=17..18 (2 znaki, do prawej),
  - prawy tekst: kol=20..30 (11 znaków, do lewej),
- SUMA:
  - etykieta „SUMA”: kol=11..14, wiersz 8,
  - wartość SUMA: kol=16..18 (3 znaki, do prawej), wiersz 8.

### 10.1 API pojedynczych pól

```js
// lewa odpowiedź
await api.final.setLeft(1, "ALFA", {
  animOut: { type:"edge",   dir:"right", ms:200 },
  animIn:  { type:"matrix", axis:"down", ms:220 },
});

// punkty A / B
await api.final.setA(1, "12", { animOut:null, animIn:null });
await api.final.setB(1, "34", { animOut:null, animIn:null });

// prawa odpowiedź
await api.final.setRight(1, "BETA", {
  animOut: { type:"edge", dir:"left", ms:180 },
  animIn:  { type:"edge", dir:"left", ms:180 },
});

// SUMA finałowa
await api.final.setSuma("999", {
  animOut: { type:"matrix", axis:"right", ms:200 },
  animIn:  { type:"matrix", axis:"right", ms:200 },
});
```

Zasady:

- indeksy 1..5,
- lewy i prawy tekst ucinane do 11 znaków, UPPERCASE,
- A/B – wyrównywane do prawej na 2 znakach,
- SUMA – wyrównywana do prawej na 3 znakach.

---

### 10.2 API batch – `setAll`

```js
await api.final.setAll({
  rows: [
    { left:"ALFA",  a:"12", b:"34", right:"BETA"  },
    { left:"GAMMA", a:"01", b:"99", right:"DELTA" },
    { left:"",      a:"",   b:"",   right:""      },
    { left:"",      a:"",   b:"",   right:""      },
    { left:"",      a:"",   b:"",   right:""      },
  ],
  suma: "999",
  animOut: { type:"edge",   dir:"right", ms:220 },
  animIn:  { type:"matrix", axis:"down", ms:260 },
});
```

Działanie:

1. Jeśli `animOut` → `api.big.animOut` na całym obszarze.
2. Wpisuje wszystkie pola i SUMĘ „na sztywno” (bez per‑pole animacji).
3. Jeśli `animIn` → `api.big.animIn` na całym obszarze.

---

## 11. INDICATOR – lampki drużyn A/B

Na dolnym pasku (`basebar`) są dwa okrągłe „LED‑y”:

- lewy (czerwony) – drużyna A,
- prawy (niebieski) – drużyna B.

INDICATOR jest widoczny tylko, gdy `APP = GAME`, ale jego stan jest niezależny od trybu sceny (LOGO/ROUNDS/FINAL/WIN/BLANK).

### 11.1 API JS

```js
api.indicator.get();        // "OFF" | "ON_A" | "ON_B"
api.indicator.set("OFF");
api.indicator.set("ON_A");
api.indicator.set("ON_B");
```

Zasady:

- `OFF` – obie lampki zgaszone,
- `ON_A` – świeci lewa (czerwona),
- `ON_B` – świeci prawa (niebieska),
- nie ma trybu „obie świecą”, zawsze co najwyżej jedna.

---

## 12. Snapshot / restore

Scena potrafi zrzucić **pełny stan wyświetlaczy** i go odtworzyć – do integracji z Supabase.

### 12.1 Snapshot

```js
const snap = api.snapshotAll();
```

Struktura (wysyłana z `commands.js` jako `screen`):

```ts
{
  v: 1,
  sceneMode: "BLANK" | "LOGO" | "ROUNDS" | "FINAL" | "WIN",
  big:   /* [10][30][7][5] kolorków */,
  small: {
    top:   ...,
    left:  ...,
    right: ...,
    long1: ...,
    long2: ...,
  },
  indicator: "OFF" | "ON_A" | "ON_B",
}
```

### 12.2 Restore

```js
api.restoreSnapshot(snap);
```

Działanie:

- odtwarza duży wyświetlacz (30×10) z zapisanych kolorów,
- odtwarza małe wyświetlacze,
- jeśli jest `indicator` → ustawia `api.indicator.set(...)`,
- **bez animacji** – to jest czyste odwzorowanie obrazu.

Na poziomie globalnym:

- backend trzyma też:
  - `app_mode` (`GAME/QR/BLACK_SCREEN`),
  - `scene` (`LOGO/ROUNDS/...`),
  - `screen` (snapshot),
- przy reconnect/refresh:
  - najpierw APP (GAME/QR/BLACK_SCREEN),
  - jeśli `GAME` → `scene.api.restoreSnapshot(screen)`.

---

## 13. Komendy tekstowe (`handleCommand("...")`)

### 13.1 Globalne (APP, QR)

APP – **bez słowa MODE**:

```txt
APP GAME
APP QR
APP BLACK
APP BLACK_SCREEN
```

- `APP MODE GAME` → BŁĘDNA komenda (ignorowana z ostrzeżeniem).

QR – ustawia linki i przełącza w APP=QR:

```txt
QR HOST "https://example.com/host" BUZZER "https://example.com/buzzer"
```

---

### 13.2 Scena (tylko w APP=GAME)

#### Małe wyświetlacze

```txt
TOP 123
LEFT 045
RIGHT 999
LONG1 "FAMILIADA"
LONG2 "SUMA 000"
```

#### Tryb sceny

```txt
MODE LOGO
MODE ROUNDS
MODE FINAL
MODE WIN
MODE BLANK

// z animacją wejścia:
MODE ROUNDS ANIMIN edge left 220
MODE FINAL ANIMIN matrix down 260
```

Składnia `ANIMIN`:

```txt
ANIMIN <type> <dirOrAxis> <ms> [pixel]
```

- `type`: `edge` | `matrix`,
- `dirOrAxis`:
  - dla edge: `left|right|top|bottom`,
  - dla matrix: `down|up|left|right`,
- `ms`: liczba (docelowy czas bloku),
- `pixel`: opcjonalne słowo – włącza wariant pixelowy.

---

#### LOGO

```txt
LOGO LOAD "./logo_familiada.json"
LOGO DRAW
LOGO SHOW
LOGO SHOW ANIMIN edge left 180
LOGO SHOW ANIMIN matrix down 250 pixel

LOGO HIDE
LOGO HIDE ANIMOUT edge right 180
LOGO HIDE ANIMOUT matrix up 220 pixel
```

Składnia `ANIMOUT` taka sama jak `ANIMIN`.

---

#### WIN

```txt
WIN 01234
WIN 01234 ANIMIN edge left 200
WIN 01234 ANIMOUT matrix down 250 ANIMIN edge left 200
```

---

#### ROUNDS – pojedyncze

```txt
// tekst
RTXT 2 "DRUGA ODPOW" ANIMOUT edge right 200 ANIMIN matrix down 250

// punkty
RPTS 2 25 ANIMOUT edge left 150 ANIMIN edge left 150

// cała linia (legacy)
R 2 TXT "DRUGA ODPOW" PTS 25 ANIMOUT matrix down 220 ANIMIN matrix down 220

// SUMA
RSUMA 120 ANIMOUT edge right 200 ANIMIN edge left 200

// X-y
RX 1A ON
RX 1A OFF
```

---

#### ROUNDS – batch `RBATCH`

```txt
RBATCH
  SUMA 120
  R1 "PIERWSZA" 10
  R2 "DRUGA" 25
  R3 "TRZECIA" 05
  R4 "" 00
  R5 "PIATA" 30
  R6 "SZOSTA" 15
  ANIMOUT edge right 220
  ANIMIN  matrix down 260
```

W jednej linii, np.:

```txt
RBATCH SUMA 120 R1 "PIERWSZA" 10 R2 "DRUGA" 25 R3 "TRZECIA" 05 R4 "" 00 R5 "PIATA" 30 R6 "SZOSTA" 15 ANIMOUT edge right 220 ANIMIN matrix down 260
```

---

#### FINAL – pojedyncze

```txt
FL 1 "ALFA" ANIMOUT edge right 200 ANIMIN matrix down 220
FA 1 12 ANIMOUT edge left 150 ANIMIN edge left 150
FB 1 34
FR 1 "BETA" ANIMOUT matrix right 200 ANIMIN matrix right 200

// legacy, cała linia:
F 1 L "ALFA" A 12 B 34 R "BETA" ANIMOUT edge right 220 ANIMIN matrix down 260

// SUMA
FSUMA 999 ANIMOUT edge right 200 ANIMIN edge left 200
```

---

#### FINAL – batch `FBATCH`

```txt
FBATCH
  SUMA 999
  F1 "ALFA"  12 34 "BETA"
  F2 "GAMMA" 01 99 "DELTA"
  F3 ""      "" "" ""
  F4 ""      "" "" ""
  F5 ""      "" "" ""
  ANIMOUT edge right 220
  ANIMIN  matrix down 260
```

W jednej linii:

```txt
FBATCH SUMA 999 F1 "ALFA" 12 34 "BETA" F2 "GAMMA" 01 99 "DELTA" ANIMOUT edge right 220 ANIMIN matrix down 260
```

---

#### INDICATOR

```txt
INDICATOR OFF
INDICATOR ON_A
INDICATOR ON_B
```

Uwaga: **bez** słowa `SET`.  
`INDICATOR SET ON_A` → błąd: `INDICATOR: zły stan: SET`.

---

## 14. Paczki testowe do wklejenia w konsolę

```js
// 1. Przejście do gry + logo
handleCommand("APP GAME");
handleCommand('LOGO LOAD "./logo_familiada.json"');
handleCommand('LOGO SHOW ANIMIN edge left 220');

// 2. Plansza ROUNDS
handleCommand('RBATCH SUMA 120 R1 "PIERWSZA" 10 R2 "DRUGA" 25 R3 "TRZECIA" 05 R4 "" 00 R5 "PIATA" 30 R6 "SZOSTA" 15 ANIMOUT edge right 220 ANIMIN matrix down 260');

// 3. Plansza FINAL
handleCommand('FBATCH SUMA 999 F1 "ALFA" 12 34 "BETA" F2 "GAMMA" 01 99 "DELTA" ANIMOUT edge right 220 ANIMIN matrix down 260');

// 4. BLANK
handleCommand("MODE BLANK");

// 5. BLACK / QR
handleCommand("APP BLACK");
handleCommand("APP QR");
handleCommand('QR HOST "https://example.com/host" BUZZER "https://example.com/buzzer"');

// 6. INDICATOR
handleCommand("APP GAME");
handleCommand("INDICATOR ON_A");
handleCommand("INDICATOR ON_B");
handleCommand("INDICATOR OFF");
```

---

## 15. Podsumowanie

- APP steruje *całą* stroną (`GAME/QR/BLACK_SCREEN`).
- Gdy APP=GAME, scena (`scene.api`) steruje:
  - dużym wyświetlaczem (LOGO/ROUNDS/FINAL/WIN/BLANK),
  - trzema potrójnymi i dwoma długimi panelami,
  - lampkami INDICATOR.
- Animacje przyjmują `ms` jako **docelowy czas pojawiania się całego bloku**:
  - w `edge` i `matrix`,
  - dla kafelków i trybu `pixel`.
- Snapshot/restore pozwalają odtworzyć obraz bez animacji po reconnect/refresh.

Jeśli trzymasz się tych komend i sygnatur, front i backend będą gadać jednym, pokojowo nastawionym protokołem.
