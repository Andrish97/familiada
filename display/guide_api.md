# Guide API – Familiada Display (aktualny)

Ten dokument opisuje **całe, aktualne API sterowania stroną display**:

- tryby globalne (APP: `GAME / QR / BLACK_SCREEN`),
- tryby sceny (duży wyświetlacz: `LOGO / ROUNDS / FINAL / WIN / BLANK`),
- API JS (`scene.api.*`),
- komendy tekstowe (`handleCommand("...")`),
- **animacje** (`edge`, `matrix`, wariant `pixel`) – **bez globalnego ANIM_SPEED**,
- snapshot / restore ekranu,
- wskaźnik drużyn **INDICATOR**.

Dokument opisuje **stan docelowy** po ostatnich poprawkach:  
**bez komendy ANIM (globalnej)**, tylko **ANIMOUT / ANIMIN** per operacja.

---

## 0) Warstwy: APP vs scena

### 0.1 Poziom globalny (APP)

To jest tryb całej strony – co widz w ogóle widzi:

- `GAME` – scenografia SVG + wyświetlacze (duży + małe),
- `QR` – czarny ekran + 2 kody QR,
- `BLACK_SCREEN` – czarny ekran bez niczego,
- `BLACK` – alias `BLACK_SCREEN` (tylko jako wartość, nie komenda).

Za przełączanie APP odpowiada **`app.setMode`** oraz komendy `APP ...`.

### 0.2 Poziom sceny (scene)

Działa **tylko w APP=GAME** i steruje dużym wyświetlaczem 30×10:

- `BLANK` – pusty ekran (wyczyszczony big),
- `LOGO` – logo z JSON-a,
- `ROUNDS` – plansza z 6 odpowiedziami,
- `FINAL` – plansza finałowa,
- `WIN` – ekran zwycięstwa.

Za to odpowiada **`scene.api.mode`** oraz komendy `MODE ...` i pokrewne.

---

## 1) Co istnieje po starcie

Po załadowaniu strony (main.js) mamy globalnie:

- `window.app` – kontroler globalny (APP + QR),
- `window.scene` – obiekt sceny (`createScene()`),
- `window.handleCommand(line)` – router komend (globalny).

Szybki test w konsoli:

```js
typeof app        // "object"
typeof scene      // "object"
typeof handleCommand // "function"
```

---

## 2) APP – tryby globalne i QR

### 2.1 `app.setMode(mode)`

Dozwolone wartości:

```js
app.setMode("GAME");
app.setMode("QR");
app.setMode("BLACK_SCREEN"); // alias: "BLACK"
```

Z poziomu komend tekstowych: **Zawsze używamy prefiksu `APP`.**

Poprawne:

```text
APP GAME
APP QR
APP BLACK
APP BLACK_SCREEN
```

Błędne (ignorowane, log warning):

```text
APP MODE GAME
APP MODE QR
APP MODE BLACK
```

### 2.2 QR linki

```js
app.qr.setHost("https://example.com/host");
app.qr.setBuzzer("https://example.com/buzzer");
```

Komenda tekstowa (ustawia linki + przełącza na APP=QR):

```text
QR HOST "https://example.com/host" BUZZER "https://example.com/buzzer"
```

---

## 3) Scena – overview API JS

`createScene()` zwraca obiekt:

```js
const { api, BIG_MODES, handleCommand } = await createScene();
```

Najważniejsze gałęzie:

- `api.mode` – tryb dużego wyświetlacza (`BLANK/LOGO/ROUNDS/FINAL/WIN`),
- `api.big` – niski poziom dużego 30×10 (put/clear + animacje),
- `api.small` – trzy „potrójne” + dwa długie panele,
- `api.logo` – logo (load/draw/show/hide),
- `api.win` – ekran WIN,
- `api.rounds` – plansza rund,
- `api.final` – plansza finału,
- `api.indicator` – lampki A/B,
- `api.snapshotAll()` / `api.restoreSnapshot(snap)` – zapis/odtworzenie ekranu.

Lokalny **parser komend sceny** to `handleCommand(line)`.  
Globalny router (`window.handleCommand`) odpala go **tylko, jeśli APP=GAME**.

---

## 4) Tryb sceny: `scene.api.mode`

```js
scene.api.mode.get(); // "BLANK" | "LOGO" | "ROUNDS" | "FINAL" | "WIN"

await scene.api.mode.set("ROUNDS", {
  animIn: { type: "edge", dir: "top", ms: 400 }
});
```

Zasady:

- zawsze czyści cały „big”,
- `BLANK` – po prostu pusty ekran,
- `ROUNDS` – przygotowuje logikę SUMA,
- `FINAL` – wpisuje etykietę "SUMA" na dole,
- opcjonalny `animIn` animuje **cały duży obszar** (domyślnie 30×10, chyba że podasz własne `area`).

---

## 5) Duży wyświetlacz 30×10 – `scene.api.big`

### 5.1 Podstawy

```js
scene.api.big.put(col, row, ch, color?);
scene.api.big.clear();
scene.api.big.clearArea(c1, r1, c2, r2);
```

Współrzędne są **1-based**:

- kolumny: 1..30,
- wiersze: 1..10.

### 5.2 Obszary pomocnicze

```js
scene.api.big.areaAll();   // {c1:1, r1:1, c2:30, r2:10}
scene.api.big.areaLogo();  // {c1:1, r1:3, c2:30, r2:7}
scene.api.big.areaWin();   // {c1:1, r1:2, c2:30, r2:8}
```

### 5.3 Animacje: **edge / matrix**, ms = czas całego bloku

API niskopoziomowe:

```js
await scene.api.big.animIn({
  type: "edge",      // "edge" | "matrix"
  dir: "left",       // tylko dla edge: "left"|"right"|"top"|"bottom" (up/down = aliasy)
  axis: "down",      // tylko dla matrix: "down"|"up"|"left"|"right" (top/bottom = aliasy)
  ms: 500,           // ~czas trwania całej animacji tego obszaru w ms
  area: scene.api.big.areaAll(), // optional, domyślnie całe 30×10
  opts: {
    pixel: true,     // opcjonalnie: animacja piksel po pikselu
    // pxBatch / stepPxMs można doprecyzować z JS, w komendach tekstowych nie używamy
  }
});

await scene.api.big.animOut({ ... });
```

**BARDZO WAŻNE:**

- **`ms` to czas dla CAŁEGO BLOKU**, niezależnie od rozmiaru (`1×1`, `1×17`, `30×10`…),
- dla trybu kafelkowego dzielimy ten czas przez liczbę kroków,
- dla trybu `pixel` dzielimy ten czas przez liczbę „paczek pikseli”,
- **nie ma już żadnego globalnego ANIM_SPEED**.

#### 5.3.1 EDGE

- `type: "edge"`,
- `dir`: `"left" | "right" | "top" | "bottom"`,
- aliasy: `"up"` ≡ `"top"`, `"down"` ≡ `"bottom"`.

Kierunek określa **od której krawędzi** wchodzą/wychodzą kafelki.

#### 5.3.2 MATRIX

- `type: "matrix"`,
- `axis`: `"down" | "up" | "left" | "right"`,
- aliasy: `"top" ≡ "up"`, `"bottom" ≡ "down"`.

Kierunek to **kierunek „przesuwania się kurtyny”** (wierszami lub kolumnami).

#### 5.3.3 Wariant `pixel`

Jeśli w `opts` ustawisz `pixel: true`, animacja działa tak:

- kafelek jest nadal jednostką, ale **w jego środku** piksele zapalają się po kolei,
- kierunek w kafelku jest zgodny z `dir/axis`,
- `ms` dalej oznacza **czas dla całego bloku**,
- biblioteka liczy ile jest kafelków × ile „paczek pikseli” i dzieli `ms` tak, żeby całość mniej więcej trwała tyle, ile podasz.

Z JS możesz jeszcze dopieścić:

```js
opts: {
  pixel: true,
  pxBatch: 8,     // ile pikseli w paczce (im więcej, tym „grubiej”)
  stepPxMs: 0     // jeśli ustawisz jawnie, nadpiszesz automatyczny podział ms
}
```

Z poziomu komend tekstowych używamy tylko słowa kluczowego `pixel` (bez pxBatch/stepPxMs).

---

## 6) Małe wyświetlacze – `scene.api.small`

### 6.1 Trzy potrójne panele 5×7 (cyfry)

```js
scene.api.small.topDigits("123");
scene.api.small.leftDigits("045");
scene.api.small.rightDigits("999");
```

Zasady:

- przyjmują string, biorą pierwsze 3 znaki,
- niecyfry → spacje,
- wyświetlanie lewo→prawo.

### 6.2 Dwa długie panele 95×7 (tekst max 15)

```js
scene.api.small.long1("FAMILIADA");
scene.api.small.long2("SUMA 000");
```

Zasady:

- maksymalnie 15 znaków (reszta ucinana),
- tekst centrowany,
- między literami 1 kolumna przerwy:
  - litera = 5 kolumn,
  - litery są rysowane z odstępem 1.

### 6.3 Czyszczenie małych paneli

```js
scene.api.small.clearAll();
```

Czyści wszystkie trzy potrójne + oba długie.

---

## 7) LOGO – `scene.api.logo`

Logo rysujemy na dużym wyświetlaczu w obszarze:

- wiersze: 3..7 (5 wierszy),
- kolumny: 1..30.

### 7.1 API

```js
await scene.api.logo.load("./logo_familiada.json"); // wczytaj z URL
scene.api.logo.set(json);                           // wstaw gotowy JSON
scene.api.logo.draw();                              // narysuj (bez animacji)
```

Wygodne skróty z animacją:

```js
await scene.api.logo.show({
  type: "edge",  // animIn
  dir: "left",
  ms: 300
});

await scene.api.logo.hide({
  type: "edge",  // animOut
  dir: "right",
  ms: 300
});
```

`logo.show`:

- ustawia `mode = LOGO`,
- rysuje logo,
- animuje wejście **tylko obszaru logo** (`areaLogo`).

`logo.hide`:

- animuje wyjście obszaru logo,
- nie zmienia trybu sceny (możesz np. zrobić potem `MODE ROUNDS`).

### 7.2 Format `logo_familiada.json`

```json
{
  "layers": [
    {
      "color": "main",
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

- `layers`: lista warstw, rysowane w kolejności,
- `rows`: dokładnie 5 stringów,
- każdy string ma docelowo 30 znaków:
  - za długie → ucięte,
  - za krótkie → uzupełnione spacją,
- `" "` = „nic nie rysuj”,
- `color`: `"main" | "top" | "left" | "right"` → mapowane na odpowiednie kolory świecenia.

---

## 8) WIN – `scene.api.win`

### 8.1 API

```js
await scene.api.win.set("01234", {
  animOut: { type:"edge", dir:"right", ms:300 },
  animIn:  { type:"matrix", axis:"down", ms:400 }
});
```

Zasady:

- przyjmuje string (lub liczbę), z którego zostają **ostatnie 5 cyfr**,
- liczba jest centrowana poziomo,
- używany jest dodatkowy font `font_win.json`,
- rysuje się w obszarze `areaWin()` → wiersze 2..8.

Jeśli nie podasz animacji, po prostu **natychmiast** podmienia zawartość WIN.

---

## 9) ROUNDS – `scene.api.rounds`

Układ linii (6 wierszy):

- numer: 1 znak – kolumna 5,
- tekst odpowiedzi: 17 znaków – kolumny 7..23 (do lewej),
- punkty: 2 znaki – kolumny 25..26 (do prawej).

### 9.1 Numer linii

Numer (1..6) jest widoczny tylko wtedy, gdy:

- tekst **lub** punkty w tej linii są niepuste (po `trim()`),
- w przeciwnym razie pole numeru jest czyszczone (spacja).

### 9.2 SUMA – „wędrujący” wiersz

SUMA składa się z:

- etykiety `"SUMA"` – kolumny 19..22,
- wartości SUMA – 3 miejsca, kolumny 24..26 (do prawej).

Położenie SUMA:

- jeśli wszystkie linie puste → SUMA rysuje się na wierszu 9,
- w przeciwnym razie – jeden wiersz przerwy + SUMA poniżej ostatniego niepustego wiersza,
  ale maksymalnie do wiersza 10.

### 9.3 API pojedynczych pól

```js
await scene.api.rounds.setText(i, text, { animOut?, animIn? });
await scene.api.rounds.setPts(i, pts, { animOut?, animIn? });
await scene.api.rounds.setRow(i, { text?, pts?, animOut?, animIn? });
await scene.api.rounds.setSuma(val, { animOut?, animIn? });
scene.api.rounds.setX("2A", true);  // rysuj/gaś X
```

Gdzie:

- `i` = 1..6,
- `text` – string:
  - ucinany do 17 znaków,
  - wyrównany do lewej,
- `pts` – string (np. `"5"`, `"10"`):
  - wyrównany do prawej na 2 miejscach,
- `val` (SUMA) – wyrównany do prawej na 3 miejscach.

`animOut` / `animIn` mają taki sam format jak dla `big.animOut/animIn`, z tym że **działają na obszarze pojedynczego pola** (np. samego tekstu).

### 9.4 API batch – cała plansza jednym strzałem

```js
await scene.api.rounds.setAll({
  rows: [
    { text:"PIERWSZA", pts:"10" },
    { text:"DRUGA",    pts:"25" },
    { text:"TRZECIA",  pts:"05" },
    { text:"",         pts:"00" },
    { text:"PIĄTA",    pts:"30" },
    { text:"SZÓSTA",   pts:"15" }
  ],
  suma: "120",
  animOut: { type:"edge",   dir:"right", axis:"down", ms:400 },
  animIn:  { type:"matrix", axis:"down",             ms:400 }
});
```

Zasady:

- najpierw (opcjonalnie) **animOut** dla całego `areaAll()`,
- potem wpisywane są wszystkie pola **bez animacji per pole**,
- na koniec (opcjonalnie) **animIn** dla całego `areaAll()`,
- `text` i `pts` są przycinane i wyrównywane tak jak w setText/setPts,
- SUMA jest przeliczana na nowy wiersz i rysowana razem z planszą.

---

## 10) FINAL – `scene.api.final`

Układ jednej linii (5 wierszy, rzędy 2..6):

- lewy tekst: 11 znaków – kolumny 1..11 (do lewej),
- A: 2 znaki – kolumny 13..14 (do prawej),
- B: 2 znaki – kolumny 17..18 (do prawej),
- prawy tekst: 11 znaków – kolumny 20..30 (do lewej).

SUMA na dole:

- `"SUMA"` – kolumny 11..14,
- wartość – 3 miejsca, kolumny 16..18 (do prawej).

### 10.1 API pojedynczych pól

```js
await scene.api.final.setLeft(i, text, { animOut?, animIn? });
await scene.api.final.setA(i, pts, { animOut?, animIn? });
await scene.api.final.setB(i, pts, { animOut?, animIn? });
await scene.api.final.setRight(i, text, { animOut?, animIn? });
await scene.api.final.setRow(i, { left?, a?, b?, right?, animOut?, animIn? });

await scene.api.final.setSuma(val, { animOut?, animIn? });
```

Zasady:

- `i` = 1..5,
- teksty ucinane do 11 znaków (do lewej),
- punkty A/B wyrównane do prawej na 2 miejscach,
- SUMA wyrównana do prawej na 3 miejscach.

### 10.2 API batch – cała plansza jednym strzałem

```js
await scene.api.final.setAll({
  rows: [
    { left:"ALFA",  a:"12", b:"34", right:"BETA"  },
    { left:"GAMMA", a:"01", b:"99", right:"DELTA" },
    { left:"",      a:"",   b:"",   right:""      },
    { left:"",      a:"",   b:"",   right:""      },
    { left:"",      a:"",   b:"",   right:""      }
  ],
  suma: "999",
  animOut: { type:"edge",   dir:"right", ms:400 },
  animIn:  { type:"matrix", axis:"down", ms:400 }
});
```

Tak jak w ROUNDS:

- animOut/In działają globalnie (cały `areaAll()`),
- teksty/pts/suma są wstawiane bez animacji per pole, potem animIn na całość.

---

## 11) INDICATOR – lampki drużyn A/B

INDICATOR to para „lampek” na dolnym pasku:

- lewa – drużyna A (czerwona),
- prawa – drużyna B (niebieska).

Działa **zawsze, gdy APP=GAME**, niezależnie od LOGO/ROUNDS/FINAL/WIN/BLANK.

### 11.1 API JS

```js
scene.api.indicator.get(); // "OFF" | "ON_A" | "ON_B"

scene.api.indicator.set("OFF");
scene.api.indicator.set("ON_A");
scene.api.indicator.set("ON_B");
```

Zasady:

- `OFF` – obie lampki zgaszone,
- `ON_A` – świeci A, B zgaszona,
- `ON_B` – świeci B, A zgaszona.

### 11.2 Komendy tekstowe

```text
INDICATOR OFF
INDICATOR ON_A
INDICATOR ON_B
```

Błędne:

```text
INDICATOR SET ON_A  // zły stan: "SET"
```

### 11.3 Snapshot / restore

Stan INDICATOR jest częścią snapshotu:

```js
const snap = scene.api.snapshotAll();
snap.indicator; // "OFF" | "ON_A" | "ON_B"
```

Przy przywracaniu:

```js
scene.api.restoreSnapshot(snap);
```

wewnątrz `restoreSnapshot` stan lampek jest również odtwarzany.

---

## 12) Snapshot / restore – pełny stan wyświetlacza

### 12.1 `scene.api.snapshotAll()`

Zwraca obiekt:

```js
{
  v: 1,
  sceneMode: "ROUNDS", // BLANK/LOGO/ROUNDS/FINAL/WIN
  big:   ...,          // wszystkie kafle 30×10
  small: {             // małe panele:
    top:   ...,
    left:  ...,
    right: ...,
    long1: ...,
    long2: ...
  },
  indicator: "OFF" | "ON_A" | "ON_B"
}
```

Globalny router (`commands.js`) pakuje to do patcha jako pole `screen` i wysyła do Supabase.

### 12.2 `scene.api.restoreSnapshot(snap)`

Przy odtwarzaniu:

1. Globalny kod ustawia najpierw `app.mode` (GAME/QR/BLACK_SCREEN).
2. Jeśli APP=GAME – woła:
   ```js
   scene.api.restoreSnapshot(snap.screen);
   ```

`restoreSnapshot`:

- odtwarza stan dużego wyświetlacza,
- odtwarza małe panele,
- ustawia INDICATOR.

Ważne:

- **restore nie używa animacji** – to jest „twarde” przywrócenie stanu po reconnect/refresh.

---

## 13) Komendy tekstowe – składnia docelowa

Tutaj chodzi o to, co backend wysyła do `window.handleCommand("...")`.

### 13.1 APP (globalne)

```text
APP GAME
APP QR
APP BLACK
APP BLACK_SCREEN

QR HOST "https://example.com/host" BUZZER "https://example.com/buzzer"
```

### 13.2 Małe panele

```text
TOP 123
LEFT 045
RIGHT 999

LONG1 "FAMILIADA"
LONG2 "SUMA 000"
```

### 13.3 MODE (scena)

```text
MODE LOGO
MODE ROUNDS
MODE FINAL
MODE WIN
MODE BLANK
```

Z animacją wejścia:

```text
MODE ROUNDS ANIMIN edge top 400
MODE FINAL  ANIMIN matrix down 500 pixel
```

Składnia `ANIMIN` / `ANIMOUT`:

```text
ANIMIN  <type> <dir/axis> <ms> [pixel]
ANIMOUT <type> <dir/axis> <ms> [pixel]
```

- `type`: `edge` | `matrix`,
- dla `edge`: `dir = left|right|top|bottom` (up/down jako alias do top/bottom),
- dla `matrix`: `axis = down|up|left|right` (top/bottom jako aliasy),
- `ms`: **czas całego bloku w ms**,
- `pixel` – opcjonalny sufiks, włącza wariant pikselowy.

### 13.4 LOGO

```text
LOGO LOAD "./logo_familiada.json"
LOGO DRAW

LOGO SHOW
LOGO SHOW ANIMIN edge left 300
LOGO SHOW ANIMIN matrix down 400 pixel

LOGO HIDE
LOGO HIDE ANIMOUT edge right 300
```

### 13.5 WIN

```text
WIN 01234
WIN 01234 ANIMOUT edge right 300
WIN 01234 ANIMOUT edge right 300 ANIMIN matrix down 400 pixel
```

### 13.6 ROUNDS – pojedyncze pola

```text
RTXT 2 "NOWA ODPOWIEDZ"
RTXT 2 "NOWA ODPOWIEDZ" ANIMOUT edge left 300 ANIMIN edge left 300

RPTS 2 25
RPTS 2 25 ANIMOUT matrix down 400 ANIMIN matrix down 400

R 3 TXT "TRZECIA" PTS 05
R 3 TXT "TRZECIA" PTS 05 ANIMOUT edge right 300 ANIMIN edge right 300

RSUMA 120
RSUMA 120 ANIMOUT edge right 300 ANIMIN edge right 300

RX 2A ON
RX 2A OFF
```

Zasada parsowania:

- `ANIMOUT ...` / `ANIMIN ...` mogą być w dowolnym miejscu po reszcie argumentów,
- oba są opcjonalne – możesz użyć tylko `ANIMIN`, tylko `ANIMOUT` albo żadnego.

### 13.7 ROUNDS – batch (`RBATCH`)

```text
RBATCH
  SUMA 120
  R1 "PIERWSZA" 10
  R2 "DRUGA"    25
  R3 "TRZECIA"  05
  R4 ""         00
  R5 "PIATA"    30
  R6 "SZOSTA"   15
  ANIMOUT edge right 400
  ANIMIN  matrix down 400
```

Bez łamań w praktyce, np.:

```text
RBATCH SUMA 120 R1 "PIERWSZA" 10 R2 "DRUGA" 25 R3 "TRZECIA" 05 R4 "" 00 R5 "PIATA" 30 R6 "SZOSTA" 15 ANIMOUT edge right 400 ANIMIN matrix down 400
```

### 13.8 FINAL – pojedyncze pola

```text
FL 1 "ALFA"
FL 1 "ALFA" ANIMOUT edge left 300 ANIMIN edge left 300

FA 1 12
FB 1 34

FR 1 "BETA"
FR 1 "BETA" ANIMOUT matrix right 400 ANIMIN matrix right 400

FSUMA 999
FSUMA 999 ANIMOUT edge right 300 ANIMIN edge right 300
```

### 13.9 FINAL – batch (`FBATCH`)

```text
FBATCH
  SUMA 999
  F1 "ALFA"  12 34 "BETA"
  F2 "GAMMA" 01 99 "DELTA"
  ANIMOUT edge right 400
  ANIMIN  matrix down 400
```

W jednej linii:

```text
FBATCH SUMA 999 F1 "ALFA" 12 34 "BETA" F2 "GAMMA" 01 99 "DELTA" ANIMOUT edge right 400 ANIMIN matrix down 400
```

### 13.10 INDICATOR

```text
INDICATOR ON_A
INDICATOR ON_B
INDICATOR OFF
```

---

## 14) Przykładowe paczki testowe

### 14.1 Start gry + logo

```js
handleCommand("APP GAME");
handleCommand('LOGO LOAD "./logo_familiada.json"');
handleCommand('LOGO SHOW ANIMIN edge left 400');
```

### 14.2 Plansza ROUNDS

```js
handleCommand('RBATCH SUMA 120 R1 "PIERWSZA" 10 R2 "DRUGA" 25 R3 "TRZECIA" 05 R4 "" 00 R5 "PIATA" 30 R6 "SZOSTA" 15 ANIMOUT edge right 400 ANIMIN matrix down 400');
```

### 14.3 Plansza FINAL

```js
handleCommand('FBATCH SUMA 999 F1 "ALFA" 12 34 "BETA" F2 "GAMMA" 01 99 "DELTA" ANIMOUT edge right 400 ANIMIN matrix down 400');
```

### 14.4 Blank / Black / QR

```js
handleCommand("MODE BLANK");

handleCommand("APP BLACK");

handleCommand("APP QR");
handleCommand('QR HOST "https://example.com/host" BUZZER "https://example.com/buzzer"');
```

### 14.5 INDICATOR – lampki drużyn

```js
handleCommand("APP GAME");
handleCommand("INDICATOR ON_A");
handleCommand("INDICATOR ON_B");
handleCommand("INDICATOR OFF");
```

To jest komplet aktualnego API – łącznie z animacjami liczonymi jako **czas całego bloku**, brakiem globalnego ANIM_SPEED, nowym INDICATOR-em i batchowymi komendami dla plansz.
