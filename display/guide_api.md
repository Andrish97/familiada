# Guide API – Familiada Display (GRA/QR/BLACK)

Ten dokument opisuje **całe, aktualne API sterowania stroną display**: tryby globalne (APP), tryby “wewnątrz gry” (scene / duży wyświetlacz), komendy tekstowe (backend → `handleCommand("...")`), animacje (w tym `rain` z opcjami), oraz kompletne paczki komend do testów w konsoli.

Dokument jest pisany pod aktualną architekturę:
- **Globalny router komend** (`window.handleCommand(line)`) rozdziela komendy na:
  - komendy globalne (APP: `GRA/QR/BLACK_SCREEN`)
  - komendy sceny (GRA: `LOGO/ROUNDS/FINAL/WIN` + settery pól)
- **Scene** zwraca API (`scene.api`) oraz lokalny parser komend (`scene.handleCommand`), który działa **tylko w trybie APP=GRA**.
- Komenda `MODE ...` jest “dwuznaczna”, ale router rozwiązuje to bez gryzienia:
  - `MODE GRA/QR/BLACK` = **global**
  - `MODE LOGO/ROUNDS/FINAL/WIN` = **lokalna scena** (tylko jeśli APP=GRA)

---

## 0) Słownik pojęć (żeby się nie pogubić)

### 0.1 Poziom globalny (APP)
To jest **tryb strony** – co w ogóle widzi widz:
- `GRA` – widać scenografię SVG + wyświetlacze (duży + małe)
- `QR` – czarny ekran + 2 kody QR
- `BLACK_SCREEN` – czarny ekran bez QR (alias: `BLACK`)

### 0.2 Poziom sceny (scene / “duży wyświetlacz”)
To jest **tryb zawartości dużego wyświetlacza 30×10**:
- `LOGO`
- `ROUNDS`
- `FINAL`
- `WIN`

Scene ma swoje API (`scene.api.*`) i własny lokalny parser komend tekstowych.

---

## 1) Co MUSI istnieć globalnie po starcie (diagnostyka „nic nie działa”)

Po starcie strony (po załadowaniu `main.js`) powinieneś mieć:
- `window.app` – kontroler globalny + QR
- `window.scene` – obiekt sceny (z `createScene()`)
- `window.handleCommand(line)` – router komend (globalny)

### 1.1 Szybki test w konsoli
W DevTools → Console:
```js
typeof app
typeof scene
typeof handleCommand
```
Powinno dać kolejno: `"object"`, `"object"`, `"function"`.

Jeśli masz błąd typu:
- `ReferenceError: app is not defined`  
to znaczy, że `main.js` nie podpina obiektu `app` do `window` **albo** `main.js` w ogóle nie odpalił (błąd importu, 404, itp.).

---

## 2) Tryby globalne (APP) – API JS

### 2.1 `app.setMode(mode)`
Przełącza ekran strony.

**Dozwolone**:
- `app.setMode("GRA")`
- `app.setMode("QR")`
- `app.setMode("BLACK_SCREEN")`
- `app.setMode("BLACK")` (alias)

Przykład:
```js
app.setMode("QR");
```

### 2.2 `app.qr.setHost(url)` / `app.qr.setBuzzer(url)`
Ustawia linki, które renderują się jako kody QR w trybie `QR`.

```js
app.qr.setHost("https://example.com/host");
app.qr.setBuzzer("https://example.com/buzzer");
```

---

## 3) Tryby sceny (scene) – API JS

### 3.1 `scene.api.mode`
- `scene.api.mode.get() -> "LOGO" | "ROUNDS" | "FINAL" | "WIN"`
- `await scene.api.mode.set(mode, { animIn? })`

`animIn` (opcjonalne) to animacja wejścia dla **dużego wyświetlacza** (domyślnie całe 30×10), chyba że podasz `area`.

Przykład:
```js
await scene.api.mode.set("ROUNDS", { animIn: { type:"edge", dir:"top", ms:20 } });
```

---

## 4) Duży wyświetlacz 30×10 – low-level (`scene.api.big`)

### 4.1 Podstawy
- `scene.api.big.put(col, row, ch, color?)` – wpis w tile (1-based)
- `scene.api.big.clear()` – czyści całość
- `scene.api.big.clearArea(c1,r1,c2,r2)` – czyści fragment

### 4.2 Obszary pomocnicze (w kodzie)
- `scene.api.big.areaAll()`  → `{c1:1,r1:1,c2:30,r2:10}`
- `scene.api.big.areaLogo()` → `{c1:1,r1:3,c2:30,r2:7}`
- `scene.api.big.areaWin()`  → `{c1:1,r1:2,c2:30,r2:8}`

### 4.3 Animacje: `animIn` / `animOut`
- `await scene.api.big.animIn({ type, dir|axis, ms, area?, opts? })`
- `await scene.api.big.animOut({ type, dir|axis, ms, area?, opts? })`

**Parametry wspólne:**
- `type`: `"edge" | "matrix" | "rain"`
- `ms`: opóźnienie kroku (większe = wolniej)
- `area`: `{c1,r1,c2,r2}` (opcjonalnie)
- `opts`: dodatkowe opcje (głównie dla `rain`)

**Dla `edge`:**
- `dir`: `"left" | "right" | "top" | "bottom"`

**Dla `matrix`:**
- `axis`: `"down" | "up" | "left" | "right"`

**Dla `rain`:**
- `axis`: `"down" | "up" | "left" | "right"`
- `opts`: patrz rozdział 11 (Rain – opcje)

---

## 5) Małe wyświetlacze (`scene.api.small`)

### 5.1 Trzy “potrójne” 5×7 (cyfry)
- `scene.api.small.topDigits("123")`
- `scene.api.small.leftDigits("045")`
- `scene.api.small.rightDigits("999")`

**Zasady:**
- Przyjmują tylko cyfry; reszta → spacja.
- **Kolejność wyświetlania jest lewo→prawo** (czyli `"123"` to 1,2,3 od lewej).

### 5.2 Dwa długie (95×7) – tekst max 15 znaków
- `scene.api.small.long1("FAMILIADA")`
- `scene.api.small.long2("SUMA 000")`

**Zasady:**
- Maks 15 znaków (reszta ucinana)
- Tekst jest centrowany
- Między literami jest 1 kolumna przerwy

---

## 6) LOGO (`scene.api.logo`)

LOGO jest rysowane na dużym wyświetlaczu w obszarze:
- **rząd 3..7** (5 wierszy)
- **kolumna 1..30**

### 6.1 API
- `await scene.api.logo.load("./logo_familiada.json")`
- `scene.api.logo.set(json)`
- `scene.api.logo.draw()` – rysuje bez animacji (ustawia tryb LOGO + rysuje)
- `await scene.api.logo.show(animIn?)` – przełącza na LOGO, rysuje, robi animację wejścia (tylko obszar logo)
- `await scene.api.logo.hide(animOut?)` – animuje wyjście obszaru logo (nie zmienia trybu)

### 6.2 Format `logo_familiada.json`
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

**Ważne:**
- `rows` ma **dokładnie 5 stringów**
- każdy string ma **dokładnie 30 znaków**
- spacja `" "` = pusto
- `color`: `"main" | "top" | "left" | "right"` (mapowane na kolory świecenia)

---

## 7) WIN (`scene.api.win`)

### 7.1 API
`await scene.api.win.set("01234", { animOut?, animIn? })`

- Wyświetla liczbę (do 5 cyfr, bez dopisywania zer)
- Centrowanie poziome
- Obszar WIN: rzędy **2..8**, kolumny **1..30**

Przykład:
```js
await scene.api.win.set("98765", {
  animOut: { type:"rain", axis:"down", ms:22, opts:{ preludeSteps:18 } },
  animIn:  { type:"edge", dir:"left", ms:18 }
});
```

---

## 8) ROUNDS (`scene.api.rounds`) – aktualny układ: 6 wierszy

W trybie `ROUNDS` masz **6 takich samych linii** (jedna pod drugą), każda zawiera:
- numer (1 znak)
- tekst odpowiedzi
- punkty (2 znaki)

### 8.1 Zasada numeru
**Numer jest widoczny tylko wtedy, gdy pole tekstu w tej linii ma jakąkolwiek treść**.

- Jeśli tekst pusty → numer gaśnie (spacja)
- Jeśli tekst niepusty → numer pokazuje się (1..6)

### 8.2 API
- `await scene.api.rounds.setText(i, "TEKST", { animOut?, animIn? })` (i = 1..6)
- `await scene.api.rounds.setPts(i, "10", { animOut?, animIn? })` (i = 1..6)
- `await scene.api.rounds.setRow(i, { text?, pts?, animOut?, animIn? })` (i = 1..6)
- `await scene.api.rounds.setSuma("120", { animOut?, animIn? })`
- `scene.api.rounds.setX("2A", true|false)` – jeśli X-y nadal istnieją w Twojej scenie

---

## 9) FINAL (`scene.api.final`)

Układ FINAL:
- rzędy: 2..6 (5 wierszy)
- lewy tekst: kol 1..11
- A: kol 13..14
- B: kol 17..18
- prawy tekst: kol 20..30
- SUMA: label + value na dole (jak w kodzie sceny)

### 9.1 API
- `await scene.api.final.setLeft(i, "TEKST", { animOut?, animIn? })`
- `await scene.api.final.setA(i, "12", { animOut?, animIn? })`
- `await scene.api.final.setB(i, "34", { animOut?, animIn? })`
- `await scene.api.final.setRight(i, "TEKST", { animOut?, animIn? })`
- `await scene.api.final.setSuma("999", { animOut?, animIn? })`

---

## 10) Komendy tekstowe (backend → `handleCommand("...")`)

Komendy są jednolinijkowe. Router globalny decyduje, czy to:
- komenda globalna (APP)
- czy komenda sceny (GRA)

### 10.1 Globalne (APP)

#### Przełącz ekran strony
- `MODE GRA`
- `MODE QR`
- `MODE BLACK_SCREEN`
- `MODE BLACK` (alias)

To samo z prefiksem:
- `APP MODE GRA`
- `APP MODE QR`
- `APP MODE BLACK_SCREEN`
- `APP MODE BLACK`

#### Ustaw QR (i przełącz na QR)
- `QR HOST "https://..." BUZZER "https://..."`

### 10.2 Scena (działa tylko gdy APP=GRA)

#### Małe wyświetlacze
- `TOP 123`
- `LEFT 045`
- `RIGHT 999`
- `LONG1 "FAMILIADA"`
- `LONG2 "SUMA 000"`

#### Tryb dużego wyświetlacza (scene)
- `MODE LOGO`
- `MODE ROUNDS`
- `MODE FINAL`
- `MODE WIN`

Z animacją wejścia:
- `MODE ROUNDS ANIMIN edge top 20`
- `MODE FINAL  ANIMIN matrix down 28`
- `MODE LOGO   ANIMIN rain down 22`

#### LOGO
- `LOGO LOAD "./logo_familiada.json"`
- `LOGO DRAW`
- `LOGO SHOW ANIMIN rain down 22`
- `LOGO HIDE ANIMOUT rain down 22`

#### WIN
- `WIN 01234`
- `WIN 01234 ANIMOUT rain down 22 ANIMIN edge left 18`

#### ROUNDS (setter)
- `RTXT 2 "NOWA ODPOWIEDZ" ANIM rain down 22`
- `RPTS 2 25 ANIM edge left 18`
- `RSUMA 120 ANIM matrix right 30`
- `RX 2A ON`
- `RX 2A OFF`

#### FINAL (setter)
- `FL 1 "ALFA" ANIM rain down 22`
- `FA 1 12`
- `FB 1 34`
- `FR 1 "BETA" ANIM matrix right 28`
- `FSUMA 999 ANIM rain down 22`

---

## 11) Rain – jak go używać i jak stroić

### 11.1 Minimalny test rain na logo (komenda)
```js
handleCommand('LOGO SHOW ANIMIN rain down 22');
```

### 11.2 Rain przez API (z opts)
```js
await scene.api.logo.show({
  type: "rain",
  axis: "down",
  ms: 22,
  opts: {
    preludeSteps: 28,
    preludeMs: 16,
    lanesFrom: 0.08,
    lanesTo: 0.75,
    trail: 10,
    density: 0.10,
    scatter: 1.6,
    speedMul: 1.2
  }
});
```

### 11.3 Co robią opcje rain (`opts`)
- `speedMul` – mnożnik prędkości (1.0 normalnie, 1.5 wolniej, 0.7 szybciej)
- `density` – jak duże porcje kropek lecą w jednym kroku (mniej = dłużej, więcej “mikroruchów”)
- `scatter` – rozproszenie / chaos (większe = mniej pasów, bardziej “chmura”)
- `preludeSteps` – ile kroków wstępnego “szumu/ruchu” zanim obraz zacznie się zbierać
- `preludeMs` – tempo tego wstępu
- `lanesFrom` → `lanesTo` – ile pasów aktywnych na starcie i na końcu prelude (rzadko → gęsto)
- `trail` – długość “ogona” (piksele zapalają i gaszą / wygląd ruchu)

### 11.4 Gwarancja poprawnego obrazu
Rain robi na końcu **final pass** – ustawia cały obszar dokładnie zgodnie ze snapshotem.
Dzięki temu nie ma “niedopalonych” pikseli po animacji.

---

## 12) Styl / CSS – co zmienia wygląd

### 12.1 Zwiększenie odstępu między małymi prostokątami (tileGap)
To nie jest CSS, tylko geometria w `scene.js`:
- masz zmienną `gapCells`
- chcesz: **z 1 średnicy na 2** → ustaw `gapCells = 2 * d`

Przykład:
```js
const d = 4;
const gapCells = 2 * d; // było: gapCells = d
```

### 12.2 Owal w SVG prawie do krawędzi
Aktualne recty:
```xml
<rect x="10" y="30" width="1580" height="840" rx="420" fill="url(#rimGrad)"/>
<rect x="200" y="140" width="1200" height="620" rx="310" fill="url(#innerGrad)"/>
```

---

## 13) Pakiety testowe do konsoli (copy/paste)

### 13.1 Global sanity
```js
handleCommand("MODE BLACK");
handleCommand("MODE GRA");
handleCommand("MODE QR");
handleCommand('QR HOST "https://example.com/host" BUZZER "https://example.com/buzzer"');
```

### 13.2 Małe wyświetlacze
```js
handleCommand("MODE GRA");
handleCommand("TOP 123");
handleCommand("LEFT 045");
handleCommand("RIGHT 999");
handleCommand('LONG1 "FAMILIADA"');
handleCommand('LONG2 "SUMA 000"');
```

### 13.3 LOGO + rain
```js
handleCommand("MODE GRA");
handleCommand('LOGO LOAD "./logo_familiada.json"');
handleCommand('LOGO SHOW ANIMIN rain down 22');
```

Schowanie (rain out):
```js
handleCommand('LOGO HIDE ANIMOUT rain down 22');
```

### 13.4 WIN
```js
handleCommand("MODE WIN ANIMIN rain down 22");
handleCommand("WIN 98765 ANIMOUT rain down 22 ANIMIN edge left 18");
```

### 13.5 ROUNDS – szybki pokaz (6 linii)
```js
handleCommand("MODE ROUNDS ANIMIN rain down 22");

handleCommand('RTXT 1 "PIERWSZA" ANIM rain down 22');
handleCommand("RPTS 1 10 ANIM edge left 18");

handleCommand('RTXT 2 "DRUGA" ANIM rain down 22');
handleCommand("RPTS 2 25 ANIM edge left 18");

handleCommand('RTXT 3 "TRZECIA" ANIM rain down 22');
handleCommand("RPTS 3 05 ANIM edge left 18");

handleCommand('RTXT 4 "" ANIM rain down 22');   // numer ma zgasnąć
handleCommand("RPTS 4 00 ANIM edge left 18");

handleCommand('RTXT 5 "PIATA" ANIM rain down 22');
handleCommand("RPTS 5 30 ANIM edge left 18");

handleCommand('RTXT 6 "SZÓSTA" ANIM rain down 22');
handleCommand("RPTS 6 15 ANIM edge left 18");

handleCommand("RSUMA 120 ANIM matrix right 30");
```

### 13.6 FINAL
```js
handleCommand("MODE FINAL ANIMIN rain down 22");

handleCommand('FL 1 "ALFA" ANIM rain down 22');
handleCommand("FA 1 12");
handleCommand("FB 1 34");
handleCommand('FR 1 "BETA" ANIM rain down 22');

handleCommand("FSUMA 999 ANIM rain down 22");
```

---

## 14) Najczęstsze błędy (i szybkie naprawy)

### 14.1 `Uncaught SyntaxError: missing ) after argument list`
Masz niedomknięty string / nawias w konsoli.

Źle:
```js
handleCommand('WIN 1234 ANIMOUT edge right 4 ANIMIN matrix down 10'
```
Dobrze:
```js
handleCommand('WIN 1234 ANIMOUT edge right 4 ANIMIN matrix down 10');
```

### 14.2 `LOGO LOAD` nic nie robi
`LOGO LOAD` tylko ładuje do pamięci; żeby zobaczyć, zrób:
```js
handleCommand('LOGO LOAD "./logo_familiada.json"');
handleCommand('LOGO SHOW ANIMIN rain down 22');
```

### 14.3 `dotOff is not defined`
Animator musi dostać `dotOff` w `createAnimator(...)`:
```js
const anim = createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff: COLORS.dotOff });
```

### 14.4 `Identifier 'clamp' has already been declared`
Masz duplikat deklaracji w tym samym module (np. dwa razy `const clamp = ...`).

---

KONIEC.
