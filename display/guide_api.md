# Guide API – Familiada Display (GRA/QR/BLACK)

Ten dokument opisuje **całe, aktualne API sterowania stroną display**: tryby globalne (APP), tryby “wewnątrz gry” (scene / duży wyświetlacz), komendy tekstowe (backend → `handleCommand("...")`), animacje (`edge`, `matrix`, `rain` z `opts`), oraz kompletne paczki komend do testów w konsoli.

Dokument jest spójny z obecną architekturą:
- **Globalny router komend** (`window.handleCommand(line)`) rozdziela komendy na:
  - komendy globalne (APP: `GRA/QR/BLACK_SCREEN`)
  - komendy sceny (GRA: `LOGO/ROUNDS/FINAL/WIN` + settery pól)
- **Scene** zwraca API (`scene.api`) oraz lokalny parser komend (`scene.handleCommand`), który działa **tylko w trybie APP=GRA**.
- Komenda `MODE ...` jest “dwuznaczna”, ale router rozwiązuje to po tokenie:
  - `MODE GRA/QR/BLACK/BLACK_SCREEN` = **global**
  - `MODE LOGO/ROUNDS/FINAL/WIN` = **lokalna scena** (tylko jeśli APP=GRA)

---

## 0) Słownik pojęć

### 0.1 Poziom globalny (APP)
To jest **tryb strony** – co w ogóle widzi widz:
- `GRA` – scenografia SVG + wyświetlacze (duży + małe)
- `QR` – czarny ekran + 2 kody QR
- `BLACK_SCREEN` – czarny ekran bez QR
- `BLACK` – alias `BLACK_SCREEN`

### 0.2 Poziom sceny (scene / “duży wyświetlacz”)
To jest **tryb zawartości dużego wyświetlacza 30×10**:
- `BLANK`
- `LOGO`
- `ROUNDS`
- `FINAL`
- `WIN`

---

## 1) Co MUSI istnieć globalnie po starcie

Po starcie strony (po załadowaniu `main.js`) powinieneś mieć:
- `window.app` – kontroler globalny + QR
- `window.scene` – obiekt sceny (z `createScene()`)
- `window.handleCommand(line)` – router komend (globalny)

### 1.1 Szybki test w konsoli
```js
typeof app
typeof scene
typeof handleCommand
```
Powinno zwrócić: `"object"`, `"object"`, `"function"`.

---

## 2) Tryby globalne (APP) – API JS

### 2.1 `app.setMode(mode)`
Przełącza ekran strony.

Dozwolone:
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
- `scene.api.mode.get() -> | "BLANK" | "LOGO" | "ROUNDS" | "FINAL" | "WIN"`
- `await scene.api.mode.set(mode, { animIn? })`

`"BLANK"` - wyświetla pusty duży wyświetlacz

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

### 4.2 Obszary pomocnicze
- `scene.api.big.areaAll()`  → `{c1:1,r1:1,c2:30,r2:10}`
- `scene.api.big.areaLogo()` → `{c1:1,r1:3,c2:30,r2:7}`
- `scene.api.big.areaWin()`  → `{c1:1,r1:2,c2:30,r2:8}`

### 4.3 Animacje: `animIn` / `animOut`
- `await scene.api.big.animIn({ type, dir|axis, ms, area?, opts? })`
- `await scene.api.big.animOut({ type, dir|axis, ms, area?, opts? })`

Parametry wspólne:
- `type`: `"edge" | "matrix" | "rain"`
- `ms`: opóźnienie kroku (większe = wolniej)
- `area`: `{c1,r1,c2,r2}` (opcjonalnie)
- `opts`: dodatkowe opcje (przekazywane do rain; patrz rozdział 11)

Dla `edge`:
- `dir`: `"left" | "right" | "top" | "bottom"`

Dla `matrix`:
- `axis`: `"down" | "up" | "left" | "right"`

Dla `rain`:
- `axis`: `"down" | "up" | "left" | "right"`
- `opts`: obiekt opcji rain (patrz rozdział 11)

---

## 5) Małe wyświetlacze (`scene.api.small`)

### 5.1 Trzy “potrójne” 5×7 (cyfry)
- `scene.api.small.topDigits("123")`
- `scene.api.small.leftDigits("045")`
- `scene.api.small.rightDigits("999")`

Zasady:
- przyjmują tylko cyfry; reszta → spacja
- kolejność wyświetlania: lewo→prawo

### 5.2 Dwa długie (95×7) – tekst max 15 znaków
- `scene.api.small.long1("FAMILIADA")`
- `scene.api.small.long2("SUMA 000")`

Zasady:
- maks 15 znaków (reszta ucinana)
- tekst jest centrowany
- między literami 1 kolumna przerwy

---

## 6) LOGO (`scene.api.logo`)

LOGO jest rysowane na dużym wyświetlaczu w obszarze:
- rząd `3..7` (5 wierszy)
- kolumna `1..30`

### 6.1 API
- `await scene.api.logo.load("./logo_familiada.json")`
- `scene.api.logo.set(json)`
- `scene.api.logo.draw()` – rysuje bez animacji
- `await scene.api.logo.show(animIn?)` – przełącza na LOGO, rysuje, animuje wejście (tylko obszar logo)
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

Ważne:
- `rows` ma dokładnie 5 stringów
- każdy string ma dokładnie 30 znaków (za długie będą ucięte, za krótkie dopełnione spacjami)
- spacja `" "` = pusto
- `color`: `"main" | "top" | "left" | "right"`

---

## 7) WIN (`scene.api.win`)

### 7.1 API
`await scene.api.win.set("01234", { animOut?, animIn? })`

- wyświetla liczbę do 5 cyfr (bez dopisywania zer)
- centrowanie poziome
- obszar WIN: rzędy `2..8`, kolumny `1..30`

Przykład:
```js
await scene.api.win.set("98765", {
  animOut: { type:"rain", axis:"down", ms:22, opts:{ density:0.18, jitter:0.65 } },
  animIn:  { type:"edge", dir:"left", ms:18 }
});
```

---

## 8) ROUNDS (`scene.api.rounds`) – aktualny układ: 6 wierszy

W trybie `ROUNDS` masz 6 takich samych linii (jedna pod drugą), każda zawiera:
- numer (1 znak, kol=5)
- tekst odpowiedzi (17 znaków, kol=7..23)
- punkty (2 znaki, kol=24..25)

### 8.1 Zasada numeru
Numer jest widoczny **tylko wtedy**, gdy pole tekstu w danej linii nie jest puste (po trim).

### 8.2 API (pojedyncze pola)
- `await scene.api.rounds.setText(i, "TEKST", { animOut?, animIn? })` (i = 1..6)
- `await scene.api.rounds.setPts(i, "10", { animOut?, animIn? })` (i = 1..6)
- `await scene.api.rounds.setRow(i, { text?, pts?, animOut?, animIn? })` (i = 1..6)
- `await scene.api.rounds.setSuma("120", { animOut?, animIn? })`
- `scene.api.rounds.setX("2A", true|false)` (jeśli używasz X-ów)

### 8.3 API (batch – jedna animacja na całość)
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
  animOut: { type:"rain", axis:"down", ms:22, opts:{ density:0.18, jitter:0.65 } },
  animIn:  { type:"rain", axis:"down", ms:22, opts:{ density:0.18, jitter:0.65 } }
});
```

---

## 9) FINAL (`scene.api.final`)

Układ FINAL:
- rzędy: `2..6` (5 wierszy)
- lewy tekst: kol `1..11`
- A: kol `13..14`
- B: kol `17..18`
- prawy tekst: kol `20..30`
- SUMA: label + value na dole

### 9.1 API (pojedyncze pola)
- `await scene.api.final.setLeft(i, "TEKST", { animOut?, animIn? })`
- `await scene.api.final.setA(i, "12", { animOut?, animIn? })`
- `await scene.api.final.setB(i, "34", { animOut?, animIn? })`
- `await scene.api.final.setRight(i, "TEKST", { animOut?, animIn? })`
- `await scene.api.final.setSuma("999", { animOut?, animIn? })`

### 9.2 API (batch – jedna animacja na całość)
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
  animOut: { type:"edge", dir:"right", ms:18 },
  animIn:  { type:"rain", axis:"down", ms:22, opts:{ density:0.18, jitter:0.65 } }
});
```

---

## 10) Komendy tekstowe (backend → `handleCommand("...")`)

### 10.1 Globalne (APP)
- `MODE GRA`
- `MODE QR`
- `MODE BLACK_SCREEN`
- `MODE BLACK`

Z prefiksem:
- `APP MODE GRA`
- `APP MODE QR`
- `APP MODE BLACK_SCREEN`
- `APP MODE BLACK`

QR (ustawia i przełącza na QR):
- `QR HOST "https://..." BUZZER "https://..."`

### 10.2 Scena (tylko APP=GRA)

Małe wyświetlacze:
- `TOP 123`
- `LEFT 045`
- `RIGHT 999`
- `LONG1 "FAMILIADA"`
- `LONG2 "SUMA 000"`

Tryby:
- `MODE LOGO`
- `MODE ROUNDS`
- `MODE FINAL`
- `MODE WIN`

LOGO:
- `LOGO LOAD "./logo_familiada.json"`
- `LOGO DRAW`
- `LOGO SHOW ANIMIN rain down 22`
- `LOGO HIDE ANIMOUT rain down 22`

WIN:
- `WIN 01234`
- `WIN 01234 ANIMOUT rain down 22 ANIMIN edge left 18`

ROUNDS:
- `RTXT 2 "NOWA ODPOWIEDZ" ANIM rain down 22`
- `RPTS 2 25 ANIM edge left 18`
- `RSUMA 120 ANIM matrix right 30`

FINAL:
- `FL 1 "ALFA" ANIM rain down 22`
- `FA 1 12`
- `FB 1 34`
- `FR 1 "BETA" ANIM matrix right 28`
- `FSUMA 999 ANIM rain down 22`

### 10.3 Batch komendy (jedna animacja na całość)

#### `RBATCH` (ROUNDS)
Przykład:
```js
handleCommand('RBATCH SUMA 120 R1 "PIERWSZA" 10 R2 "DRUGA" 25 R3 "TRZECIA" 05 R4 "" 00 R5 "PIATA" 30 R6 "SZOSTA" 15 ANIMOUT edge right 18 ANIMIN rain down 22');
```

#### `FBATCH` (FINAL)
Przykład:
```js
handleCommand('FBATCH SUMA 999 F1 "ALFA" 12 34 "BETA" F2 "GAMMA" 01 99 "DELTA" ANIMOUT matrix right 20 ANIMIN rain down 22');
```

---

## 11) Rain – strojenie (zgodnie z aktualnym anim.js)

Wspierane `opts`:
- `density` (domyślnie 0.18)
- `jitter`  (domyślnie 0.65)

Przykład:
```js
await scene.api.logo.show({
  type: "rain",
  axis: "down",
  ms: 22,
  opts: { density: 0.12, jitter: 0.95 }
});
```

---

## 12) Geometria: odstępy kafli (tileGap)
```js
const d = 4;
const gapCells = 2 * d;
```

---

## 13) Pakiety testowe do konsoli

```js
handleCommand("MODE GRA");
handleCommand('LOGO LOAD "./logo_familiada.json"');
handleCommand('LOGO SHOW ANIMIN rain down 22');

handleCommand('RBATCH SUMA 120 R1 "PIERWSZA" 10 R2 "DRUGA" 25 R3 "TRZECIA" 05 R4 "" 00 R5 "PIATA" 30 R6 "SZOSTA" 15 ANIMOUT edge right 18 ANIMIN rain down 22');

handleCommand('FBATCH SUMA 999 F1 "ALFA" 12 34 "BETA" F2 "GAMMA" 01 99 "DELTA" ANIMOUT matrix right 20 ANIMIN rain down 22');

handleCommand("MODE BLACK");
handleCommand("MODE QR");
handleCommand('QR HOST "https://example.com/host" BUZZER "https://example.com/buzzer"');
```

---

## 14) Najczęstsze błędy

### `dotOff is not defined`
```js
const anim = createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff: COLORS.dotOff });
```

### `Identifier 'clamp' has already been declared`
Usuń duplikat deklaracji w module.

### `roundsState is not defined`
`roundsState` musi być w zasięgu metod `api.rounds.*` (nie wewnątrz IIFE).

---


# 15) INDICATOR – kontrolki drużyn (A / B)

INDICATOR to para okrągłych kontrolek (czerwona i niebieska) umieszczonych na pasku drużyn.
Działa niezależnie od trybu dużego wyświetlacza (LOGO / ROUNDS / FINAL / WIN) i jest dostępny zawsze, gdy APP = GRA.

Kontrolki mają dwa stany wizualne:
- zgaszona
- zapalona

Zawsze świeci co najwyżej jedna kontrolka.

---

## 15.1 Dostępność

- INDICATOR jest aktywny tylko w trybie APP = GRA
- Zmiana trybu sceny (MODE LOGO / ROUNDS / FINAL / WIN) nie wpływa na stan kontrolek
- Zmiana trybu APP na QR lub BLACK_SCREEN ukrywa całą scenografię, w tym kontrolki

---

## 15.2 API JS (bezpośrednie)

### scene.api.indicator.get()

Zwraca aktualny stan:

"OFF" | "ON_A" | "ON_B"

---

### scene.api.indicator.set(state)

Ustawia stan kontrolek.

Dozwolone wartości:
- OFF – obie kontrolki zgaszone
- ON_A – świeci czerwona (A), niebieska zgaszona
- ON_B – świeci niebieska (B), czerwona zgaszona

Przykłady:
scene.api.indicator.set("ON_A");
scene.api.indicator.set("ON_B");
scene.api.indicator.set("OFF");

Funkcja nie zwraca wartości.

---

## 15.3 Komendy tekstowe (backend → handleCommand)

Składnia:
INDICATOR <STATE>

Dozwolone stany:
- OFF
- ON_A
- ON_B

Przykłady:
handleCommand("INDICATOR ON_A");
handleCommand("INDICATOR ON_B");
handleCommand("INDICATOR OFF");

UWAGA:
Komenda "INDICATOR SET ON_A" jest niepoprawna.

---

## 15.4 Zasady wizualne (implementacyjne)

- Każda kontrolka składa się z dwóch warstw:
  1. Baza (nieprzezroczysta, zmienia jasność OFF ↔ ON)
  2. Warstwa koloru z gradientem (półprzezroczysta, stała)

- Efekt świecenia:
  - rozjaśnienie bazy
  - wewnętrzne halo
  - zewnętrzny glow (SVG filter)

- Kolory:
  - A (czerwona) – wysoka luminancja
  - B (niebieska) – jaśniejszy wariant brandowego niebieskiego, bez przesunięcia w cyjan/zielony

---

## 15.5 Testy diagnostyczne (konsola)

Sprawdzenie istnienia kontrolek:
document.querySelectorAll('[data-lamp]').length

Test wizualny:
scene.api.indicator.set("ON_A");
scene.api.indicator.set("ON_B");
scene.api.indicator.set("OFF");

---

## 15.6 Typowe błędy

Błąd:
INDICATOR: zły stan: SET

Przyczyna:
INDICATOR SET ON_A

Poprawnie:
INDICATOR ON_A

---

## 15.7 Zależności od trybów

MODE LOGO / ROUNDS / FINAL / WIN – brak wpływu
MODE QR – ukrywa całość
MODE BLACK / BLACK_SCREEN – ukrywa całość

---

Status:
Zaimplementowane. Stabilne. Niezależne od sceny.

KONIEC.
